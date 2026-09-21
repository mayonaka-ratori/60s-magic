import { describe, it, expect } from 'vitest';
import { BLOOM_BASE, BLOOM_CALM_PEAK, BOARD_MAX_PIXELS, FADE_SECONDS, FPS_BACK, FPS_DROP, POST_FROM, POST_TO, RIPPLE_SECONDS,
  SHOW_FROM, WARMUP_FRAMES, giveUpDecision, GIVE_UP_WARMUP, GIVE_UP_FRAMES,
  SCALE_MAX, SCALE_MIN, bloomDecision, bloomWeightAt, boardPixels, compositeSettings, layerMotion, postFadeAt, postHeavyActive,
  rippleAt, shouldUploadKnight, showFadeAt } from '../src/render/composite';
import { layerTransform } from '../src/render/cast-scene';
import { BEATS } from '../src/game/rounds';
import { IMPACT_AT, RELEASE_AT } from '../src/render/effects/screen';

describe('衝撃波の輪', () => {
  it('命中の前は出ない', () => {
    expect(rippleAt(IMPACT_AT - .01)).toBeNull();
    expect(rippleAt(0)).toBeNull();
  });
  it('命中から0.3〜0.6秒の間だけ出る', () => {
    expect(RIPPLE_SECONDS).toBeGreaterThanOrEqual(.3);
    expect(RIPPLE_SECONDS).toBeLessThanOrEqual(.6);
    expect(rippleAt(IMPACT_AT)).not.toBeNull();
    expect(rippleAt(IMPACT_AT + RIPPLE_SECONDS - .01)).not.toBeNull();
    expect(rippleAt(IMPACT_AT + RIPPLE_SECONDS + .001)).toBeNull();
  });
  it('時間とともに広がり、幅も強さも減る', () => {
    const early = rippleAt(IMPACT_AT + .05)!, late = rippleAt(IMPACT_AT + .4)!;
    expect(late.radius).toBeGreaterThan(early.radius);
    expect(late.width).toBeLessThan(early.width);
    expect(late.strength).toBeLessThan(early.strength);
    expect(early.strength).toBeLessThan(.05);
  });
  it('終わり際はほとんど歪まない', () => {
    expect(rippleAt(IMPACT_AT + RIPPLE_SECONDS - .001)!.strength).toBeLessThan(.001);
  });
});

describe('後処理を有効にする時間帯', () => {
  it('放出の直前から始まり、命中の後で終わる', () => {
    expect(POST_FROM).toBeLessThan(RELEASE_AT);
    expect(POST_TO).toBeGreaterThan(IMPACT_AT);
    expect(postHeavyActive(POST_FROM - .01)).toBe(false);
    expect(postHeavyActive(POST_FROM)).toBe(true);
    expect(postHeavyActive(IMPACT_AT)).toBe(true);
    expect(postHeavyActive(POST_TO)).toBe(false);
  });
  it('線を描いている間は無効', () => {
    for (const t of [0, 5, BEATS[0].inputEnd, POST_FROM - .1]) expect(postHeavyActive(t)).toBe(false);
  });
  it('衝撃波が出ている間は必ず有効', () => {
    for (let t = IMPACT_AT; t < IMPACT_AT + RIPPLE_SECONDS; t += .05) expect(postHeavyActive(t)).toBe(true);
  });
});

describe('ブルームの強さ', () => {
  it('放出と命中で3〜5倍になる', () => {
    expect(bloomWeightAt(BEATS[0].release - .5)).toBeCloseTo(BLOOM_BASE, 5);
    expect(bloomWeightAt(RELEASE_AT) / BLOOM_BASE).toBeCloseTo(3, 5);
    expect(bloomWeightAt(IMPACT_AT) / BLOOM_BASE).toBeCloseTo(5, 5);
  });
  it('控えめモードでは1.6倍までに抑える', () => {
    expect(bloomWeightAt(IMPACT_AT, true) / BLOOM_BASE).toBeCloseTo(BLOOM_CALM_PEAK, 5);
    expect(bloomWeightAt(RELEASE_AT, true) / BLOOM_BASE).toBeCloseTo(BLOOM_CALM_PEAK, 5);
    expect(bloomWeightAt(IMPACT_AT, true)).toBeLessThan(bloomWeightAt(IMPACT_AT));
    expect(bloomWeightAt(BEATS[0].release - .5, true)).toBeCloseTo(BLOOM_BASE, 5);
    // 控えめでないときの値は変わらない。
    expect(bloomWeightAt(IMPACT_AT) / BLOOM_BASE).toBeCloseTo(5, 5);
  });
  it('0.4秒ほどで元へ戻る', () => {
    expect(bloomWeightAt(IMPACT_AT + .4)).toBeCloseTo(BLOOM_BASE, 5);
    expect(bloomWeightAt(IMPACT_AT + .2)).toBeGreaterThan(BLOOM_BASE * 2);
  });
  it('後処理を切る手前0.3秒で、少しずつ0へ落ちる', () => {
    // 切り際ちょうどで一気に切れると、余韻の途中で明るさが1コマで変わってしまう。
    expect(bloomWeightAt(POST_TO - FADE_SECONDS - .01)).toBeCloseTo(BLOOM_BASE, 5);
    let previous = Infinity;
    for (let t = POST_TO - FADE_SECONDS; t <= POST_TO + 1e-9; t += .02) {
      const now = bloomWeightAt(t);
      expect(now).toBeLessThanOrEqual(previous + 1e-9);
      previous = now;
    }
    expect(bloomWeightAt(POST_TO - .001)).toBeLessThan(BLOOM_BASE * .01);
    expect(bloomWeightAt(POST_TO)).toBe(0);
    expect(bloomWeightAt(POST_TO - FADE_SECONDS / 2)).toBeCloseTo(BLOOM_BASE / 2, 5);
  });
  it('見せ始めの0.3秒は0から上げる', () => {
    expect(bloomWeightAt(SHOW_FROM, false, SHOW_FROM)).toBe(0);
    expect(bloomWeightAt(SHOW_FROM + FADE_SECONDS / 2, false, SHOW_FROM)).toBeCloseTo(BLOOM_BASE / 2, 5);
    expect(bloomWeightAt(SHOW_FROM + FADE_SECONDS, false, SHOW_FROM)).toBeCloseTo(BLOOM_BASE, 5);
    // 上がりきったあとは今までと同じ値。
    expect(bloomWeightAt(IMPACT_AT, false, SHOW_FROM) / BLOOM_BASE).toBeCloseTo(5, 5);
  });
});

describe('見せ始めと切り際の重なり', () => {
  it('見せ始めで0、0.3秒後に1', () => {
    expect(showFadeAt(SHOW_FROM - .01, SHOW_FROM)).toBe(0);
    expect(showFadeAt(SHOW_FROM, SHOW_FROM)).toBe(0);
    expect(showFadeAt(SHOW_FROM + FADE_SECONDS / 3, SHOW_FROM)).toBeCloseTo(1 / 3, 5);
    expect(showFadeAt(SHOW_FROM + FADE_SECONDS, SHOW_FROM)).toBe(1);
    expect(showFadeAt(SHOW_FROM + 3, SHOW_FROM)).toBe(1);
  });
  it('切り際は0.3秒前から下がり、終わりで0', () => {
    expect(postFadeAt(POST_TO - FADE_SECONDS)).toBe(1);
    expect(postFadeAt(POST_TO - FADE_SECONDS / 4)).toBeCloseTo(.25, 5);
    expect(postFadeAt(POST_TO)).toBe(0);
    expect(postFadeAt(POST_TO + 1)).toBe(0);
  });
  it('重なりは重い後処理が始まる前に終わる', () => {
    // 見せ始めは一回目の確定の0.5秒前。
    expect(SHOW_FROM).toBe(BEATS[0].lock + .5);
    expect(SHOW_FROM).toBeLessThan(POST_FROM);
    expect(SHOW_FROM + FADE_SECONDS).toBeLessThanOrEqual(POST_FROM);
  });
});

describe('板を作る細かさ', () => {
  it('表示の大きさではなく、実際に描く解像度で作る', () => {
    // 既定の粗さは 1/min(devicePixelRatio,1.5)。細かい画面では表示の1.5倍の画素になる。
    expect(boardPixels(1280, 1 / 1.5)).toBe(1920);
    expect(boardPixels(1280, 1)).toBe(1280);
    expect(boardPixels(720, 1 / 1.5)).toBe(1080);
  });
  it('?scale= で粗くしたときは、そのぶん小さく作る', () => {
    expect(boardPixels(1280, 2)).toBe(640);
    expect(boardPixels(1280, 4)).toBe(320);
  });
  it('大きすぎる時は上限で止め、おかしな粗さは等倍として扱う', () => {
    expect(boardPixels(6000, 1 / 1.5)).toBe(BOARD_MAX_PIXELS);
    expect(boardPixels(1280, 0)).toBe(1280);
    expect(boardPixels(1280, Number.NaN)).toBe(1280);
    expect(boardPixels(0, 1)).toBe(2);
  });
});

describe('fpsによる退避', () => {
  it('55を下回ったらブルームを切る', () => {
    expect(bloomDecision(true, FPS_DROP - 1)).toBe(false);
    expect(bloomDecision(true, FPS_DROP + 1)).toBe(true);
  });
  it('一度切ったら58を超えるまで戻さない', () => {
    expect(bloomDecision(false, 56)).toBe(false);
    expect(bloomDecision(false, FPS_BACK + 1)).toBe(true);
  });
  it('測れていないときは今のままにする', () => {
    expect(bloomDecision(true, 0)).toBe(true);
    expect(bloomDecision(false, Number.NaN)).toBe(false);
  });
});

describe('騎士の板の貼り直し', () => {
  it('姿勢が変わったら必ず貼り直す', () => {
    expect(shouldUploadKnight('hit', 'idle', false, 1)).toBe(true);
  });
  it('見せている間は毎コマ貼り直す', () => {
    // 間引くと呼吸が毎秒15コマに見えてしまう。見せている間は必ず毎コマ。
    for (let frame = 0; frame < 8; frame++) expect(shouldUploadKnight('idle', 'idle', true, frame)).toBe(true);
  });
  it('隠したまま描いている間だけ4コマに1回', () => {
    const uploads = [0, 1, 2, 3, 4, 5, 6, 7].filter(frame => shouldUploadKnight('idle', 'idle', false, frame));
    expect(uploads).toEqual([0, 4]);
  });
});

describe('層の動き', () => {
  const screen = { shakeX: 4.4, shakeY: -2.6, rotate: .5, zoom: 1.08 };
  const still = { shakeX: 0, shakeY: 0, rotate: 0, zoom: 1 };
  it('動く量と余白を掛ける', () => {
    expect(layerMotion(screen, 1, 1)).toEqual({ x: 4, y: -3, rotate: .5, scale: 1.08 });
    const knight = layerMotion(screen, 1.3, 1.03);
    expect(knight.x).toBe(6);
    expect(knight.rotate).toBeCloseTo(.65, 5);
    expect(knight.scale).toBeCloseTo(1.08 * 1.03, 5);
  });
  it('揺れていないときは動かさない', () => {
    expect(layerMotion(still, 1.3, 1)).toEqual({ x: 0, y: 0, rotate: 0, scale: 1 });
  });
  it('揺れ0で余白もないときは、変形そのものを書かない', () => {
    expect(layerTransform(still, 1, 1)).toBe('');
    expect(layerTransform(still, 1.3, 1)).toBe('');
    // ほんの少しの揺れも、見えない大きさなら書かない。
    expect(layerTransform({ shakeX: 0, shakeY: 0, rotate: .005, zoom: 1.0005 }, 1, 1)).toBe('');
  });
  it('揺れ0でも余白のぶんは拡大する', () => {
    // 背景と騎士は端に黒帯が出ないよう常に1.03倍。揺れていなくてもこの拡大は残る。
    expect(layerTransform(still, 1, 1.03)).toBe('scale(1.03)');
    expect(layerTransform(still, 1.3, 1.03)).toBe('scale(1.03)');
  });
  it('揺れると、動く量のぶんだけ動く', () => {
    expect(layerTransform(screen, 1, 1)).toBe('translate(4px,-3px) rotate(0.500deg) scale(1.0800)');
    // 騎士の層は1.3倍動き、余白のぶん大きい。
    expect(layerTransform(screen, 1.3, 1.03)).toBe('translate(6px,-3px) rotate(0.650deg) scale(1.1124)');
  });
});

describe('URLの指定', () => {
  it('指定がなければ合成を使い、一回目の確定の手前から見せる', () => {
    expect(compositeSettings('')).toEqual({ enabled: true, scale: null, keepBloom: false, showFrom: SHOW_FROM });
  });
  it('?composite=0 で切れる', () => {
    expect(compositeSettings('?composite=0').enabled).toBe(false);
    expect(compositeSettings('?composite=1').enabled).toBe(true);
  });
  it('?composite=always なら0秒から見せる（見比べ用）', () => {
    expect(compositeSettings('?composite=always')).toEqual({ enabled: true, scale: null, keepBloom: false, showFrom: 0 });
    // それ以外の指定は今まで通り、確定の手前から。
    expect(compositeSettings('?composite=1').showFrom).toBe(SHOW_FROM);
    expect(compositeSettings('?scale=2').showFrom).toBe(SHOW_FROM);
  });
  it('?bloom=1 でブルームを出し続ける', () => {
    expect(compositeSettings('?bloom=1').keepBloom).toBe(true);
    expect(compositeSettings('?bloom=0').keepBloom).toBe(false);
  });
  it('?scale= で後処理の粗さを変えられる', () => {
    expect(compositeSettings('?scale=1.5').scale).toBe(1.5);
    expect(compositeSettings('?scale=0').scale).toBeNull();
    expect(compositeSettings('?scale=abc').scale).toBeNull();
    expect(compositeSettings('?scale=99').scale).toBe(4);
  });
  it('?scale= の下限は0.5。小さすぎる指定でも解像度が跳ね上がらない', () => {
    expect(compositeSettings('?scale=0.000001').scale).toBe(SCALE_MIN);
    expect(compositeSettings('?scale=0.2').scale).toBe(SCALE_MIN);
    expect(compositeSettings('?scale=0.5').scale).toBe(SCALE_MIN);
    expect(compositeSettings('?scale=1e-9').scale).toBe(SCALE_MIN);
    expect(SCALE_MIN).toBe(.5);
    expect(SCALE_MAX).toBe(4);
    // 範囲の中の指定はそのまま通る。
    expect(compositeSettings('?scale=2').scale).toBe(2);
  });
});

describe('遅すぎるときは合成を諦める', () => {
  /** 山場の外、ブルームは既に切れている状態。 */
  const calmTime = 5, bloomOff = false;
  it('慣らしの間は数えず、低いfpsが続いたときだけ止める', () => {
    expect(giveUpDecision(10, 0, GIVE_UP_WARMUP, calmTime, bloomOff)).toEqual({ lowFrames: 0, giveUp: false });
    let low = 0, giveUp = false;
    for (let i = 0; i < GIVE_UP_FRAMES; i++) ({ lowFrames: low, giveUp } = giveUpDecision(10, low, GIVE_UP_WARMUP + 1 + i, calmTime, bloomOff));
    expect(giveUp).toBe(true);
    expect(giveUpDecision(40, 30, 500, calmTime, bloomOff)).toEqual({ lowFrames: 0, giveUp: false });
    expect(giveUpDecision(NaN, 30, 500, calmTime, bloomOff)).toEqual({ lowFrames: 0, giveUp: false });
  });
  it('山場の間は判定を止め、数も減らさない', () => {
    for (const t of [POST_FROM, (POST_FROM + IMPACT_AT) / 2, IMPACT_AT, POST_TO - .01]) {
      expect(giveUpDecision(10, GIVE_UP_FRAMES - 1, 500, t, bloomOff)).toEqual({ lowFrames: GIVE_UP_FRAMES - 1, giveUp: false });
    }
    // 山場の外では今まで通り働く。
    expect(giveUpDecision(10, GIVE_UP_FRAMES - 1, 500, POST_TO, bloomOff).giveUp).toBe(true);
    expect(giveUpDecision(10, GIVE_UP_FRAMES - 1, 500, POST_FROM - .01, bloomOff).giveUp).toBe(true);
  });
  it('慣らしの間に遅いと分かれば、見せる前に諦められる', () => {
    // 隠したまま描くコマ数は、この判定が数え終わるまでの長さにしてある。
    expect(WARMUP_FRAMES).toBe(GIVE_UP_WARMUP + GIVE_UP_FRAMES);
    let low = 0, giveUp = false, frames = 0;
    while (frames < WARMUP_FRAMES && !giveUp) {
      frames++;
      ({ lowFrames: low, giveUp } = giveUpDecision(10, low, frames, 1, bloomOff));
    }
    expect(giveUp).toBe(true);
    expect(frames).toBe(WARMUP_FRAMES);
  });
  it('ブルームが付いている間はやめない（先にブルームを切る）', () => {
    let low = 0, giveUp = false;
    for (let i = 0; i < GIVE_UP_FRAMES * 2; i++) ({ lowFrames: low, giveUp } = giveUpDecision(10, low, GIVE_UP_WARMUP + 1 + i, calmTime, true));
    expect(giveUp).toBe(false);
    expect(low).toBe(0);
    // ブルームが切れた後に、あらためて数え始める。
    for (let i = 0; i < GIVE_UP_FRAMES; i++) ({ lowFrames: low, giveUp } = giveUpDecision(10, low, 500, calmTime, false));
    expect(giveUp).toBe(true);
  });
});
