import { describe, it, expect } from 'vitest';
import { BLOOM_BASE, FPS_BACK, FPS_DROP, POST_FROM, POST_TO, RIPPLE_SECONDS, giveUpDecision, GIVE_UP_WARMUP, GIVE_UP_FRAMES,
  bloomDecision, bloomWeightAt, compositeSettings, layerMotion, postHeavyActive, rippleAt, shouldUploadKnight } from '../src/render/composite';
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
    for (const t of [0, 5, 13.9, 16]) expect(postHeavyActive(t)).toBe(false);
  });
  it('衝撃波が出ている間は必ず有効', () => {
    for (let t = IMPACT_AT; t < IMPACT_AT + RIPPLE_SECONDS; t += .05) expect(postHeavyActive(t)).toBe(true);
  });
});

describe('ブルームの強さ', () => {
  it('放出と命中で3〜5倍になる', () => {
    expect(bloomWeightAt(17.5)).toBeCloseTo(BLOOM_BASE, 5);
    expect(bloomWeightAt(RELEASE_AT) / BLOOM_BASE).toBeCloseTo(3, 5);
    expect(bloomWeightAt(IMPACT_AT) / BLOOM_BASE).toBeCloseTo(5, 5);
  });
  it('0.4秒ほどで元へ戻る', () => {
    expect(bloomWeightAt(IMPACT_AT + .4)).toBeCloseTo(BLOOM_BASE, 5);
    expect(bloomWeightAt(IMPACT_AT + .2)).toBeGreaterThan(BLOOM_BASE * 2);
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
    expect(shouldUploadKnight('hit', 'idle', 3, 1)).toBe(true);
  });
  it('動きのある時間帯は毎コマ貼り直す', () => {
    for (let frame = 0; frame < 4; frame++) expect(shouldUploadKnight('idle', 'idle', 18.5, frame)).toBe(true);
  });
  it('待っている間は4コマに1回だけ', () => {
    const uploads = [0, 1, 2, 3, 4, 5, 6, 7].filter(frame => shouldUploadKnight('idle', 'idle', 5, frame));
    expect(uploads).toEqual([0, 4]);
  });
});

describe('層の動き', () => {
  const screen = { shakeX: 4.4, shakeY: -2.6, rotate: .5, zoom: 1.08 };
  it('動く量と余白を掛ける', () => {
    expect(layerMotion(screen, 1, 1)).toEqual({ x: 4, y: -3, rotate: .5, scale: 1.08 });
    const knight = layerMotion(screen, 1.3, 1.03);
    expect(knight.x).toBe(6);
    expect(knight.rotate).toBeCloseTo(.65, 5);
    expect(knight.scale).toBeCloseTo(1.08 * 1.03, 5);
  });
  it('揺れていないときは動かさない', () => {
    expect(layerMotion({ shakeX: 0, shakeY: 0, rotate: 0, zoom: 1 }, 1.3, 1)).toEqual({ x: 0, y: 0, rotate: 0, scale: 1 });
  });
});

describe('URLの指定', () => {
  it('指定がなければ合成を使う', () => {
    expect(compositeSettings('')).toEqual({ enabled: true, scale: null, keepBloom: false });
  });
  it('?composite=0 で切れる', () => {
    expect(compositeSettings('?composite=0').enabled).toBe(false);
    expect(compositeSettings('?composite=1').enabled).toBe(true);
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
});

describe('遅すぎるときは合成を諦める', () => {
  it('慣らしの間は数えず、低いfpsが続いたときだけ止める', () => {
    expect(giveUpDecision(10, 0, GIVE_UP_WARMUP)).toEqual({ lowFrames: 0, giveUp: false });
    let low = 0, giveUp = false;
    for (let i = 0; i < GIVE_UP_FRAMES; i++) ({ lowFrames: low, giveUp } = giveUpDecision(10, low, GIVE_UP_WARMUP + 1 + i));
    expect(giveUp).toBe(true);
    expect(giveUpDecision(40, 30, 500)).toEqual({ lowFrames: 0, giveUp: false });
    expect(giveUpDecision(NaN, 30, 500)).toEqual({ lowFrames: 0, giveUp: false });
  });
});
