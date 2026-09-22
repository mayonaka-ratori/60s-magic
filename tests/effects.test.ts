import { BEATS } from '../src/game/rounds';
import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest';
import { presets, getPreset, intensityOf, mixHue, lighten } from '../src/render/effects/presets';
import { hitDelay } from '../src/render/effects/release';
import { screenState, shockAt, wobble, BLACKOUT_SECONDS, HIT_ZOOM, IMPACT_AT, RELEASE_AT, SHAKE_TILT } from '../src/render/effects/screen';
import { ParticlePool } from '../src/render/effects/particles';

/** 一回目の発動と命中の時刻（秒）。画面の効果の試験は、ここからの差で書く。 */
const 発動 = RELEASE_AT, 命中 = IMPACT_AT;
import { drawImpact } from '../src/render/effects/impact';
import { type Frame } from '../src/render/effects/frame';
import { MagicCanvas } from '../src/render/magic';
import { ELEMENTS } from '../src/game/types';

// 仮のcanvasと試験用の魔法は tests/helpers.ts にまとめてある。
import { stubContext, testFrame, testRecipe as recipe } from './helpers';

describe('見た目の設定', () => {
  it('全属性に4色があり、未知の名前は既定の設定になる', () => {
    for (const preset of Object.values(presets)) for (const element of ELEMENTS) {
      const p = preset.palettes[element];
      for (const color of [p.main, p.edge, p.core, p.spark]) expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(getPreset('ないもの').name).toBe('vivid');
    expect(getPreset(null).name).toBe('vivid');
  });
  it('派手さは0〜3に収まり、個数と範囲で増え、設定の順に大きくなる。設定は倍率なので、最大の設定でもレシピの違いが出る', () => {
    const smallest = recipe({ count: 1, area: .2, concentration: 0 }), biggest = recipe({ count: 8, area: 1, concentration: 1 });
    expect(intensityOf(recipe({ count: 1, area: .2, concentration: 0, purpose: 'defend' }), presets.calm)).toBeGreaterThanOrEqual(0);
    expect(intensityOf(recipe({ count: 8 }), presets.vivid)).toBeGreaterThan(intensityOf(recipe({ count: 1 }), presets.vivid));
    expect(intensityOf(recipe(), presets.calm)).toBeLessThan(intensityOf(recipe(), presets.vivid));
    expect(intensityOf(recipe(), presets.vivid)).toBeLessThan(intensityOf(recipe(), presets.max));
    // 最大の設定でも、小さいレシピは上限に張り付かない。量を目一杯足しても3に届かない。
    expect(intensityOf(smallest, presets.max, 1)).toBeLessThan(3);
    // レシピの違いがそのまま差になる。ふつうの魔法は最大の設定でも3に届かない。
    expect(intensityOf(biggest, presets.max) - intensityOf(smallest, presets.max)).toBeGreaterThan(1);
    expect(intensityOf(recipe(), presets.max)).toBeLessThan(3);
    // 3に届くのは、8連弾（範囲と収束も目一杯）に最大の設定か入力の量を重ねたときだけ。派手の設定では量を足さなければ届かない。
    expect(intensityOf(biggest, presets.max, 1)).toBe(3);
    expect(intensityOf(biggest, presets.vivid)).toBeLessThan(3);
    // 派手（既定）のふつうの魔法は1.9のまま。実機で確認した見た目を変えない。
    expect(intensityOf(recipe(), presets.vivid)).toBeCloseTo(1.9, 5);
  });
  it('入力の量は設定によらず同じだけ足され、最大で0.6', () => {
    for (const preset of [presets.calm, presets.vivid, presets.max]) {
      const none = intensityOf(recipe(), preset), full = intensityOf(recipe(), preset, 1);
      expect(full - none).toBeCloseTo(.6, 5);
      expect(intensityOf(recipe(), preset, .5) - none).toBeCloseTo(.3, 5);
    }
  });
});

describe('画面全体の効果', () => {
  it('放出前は揺れも閃光もなく、命中で最大になり、その後収まる', () => {
    const before = screenState(発動 - .1, 2, presets.vivid, 'attack');
    expect(before.shakeX).toBe(0); expect(before.flash).toBe(0);
    const hit = screenState(命中 + .01, 2, presets.vivid, 'attack'), later = screenState(命中 + .9, 2, presets.vivid, 'attack');
    expect(hit.flash).toBeGreaterThan(.3); expect(Math.abs(hit.shakeX) + Math.abs(hit.shakeY)).toBeGreaterThan(0);
    expect(later.flash).toBe(0); expect(later.shakeX).toBe(0); expect(later.shakeY).toBe(0);
  });
  it('防御と強化は揺らさず、控えめの設定は閃光が弱い', () => {
    expect(screenState(命中 + .02, 3, presets.max, 'enhance').shakeX).toBe(0);
    expect(screenState(命中 + .02, 3, presets.max, 'bind').shakeY).toBe(0);
    expect(screenState(命中 + .02, 1, presets.calm, 'attack').flash).toBeLessThan(screenState(命中 + .02, 1, presets.max, 'attack').flash);
    expect(screenState(命中 + .02, 1, presets.calm, 'attack').hitStop).toBe(0);
  });
  it('背景は蓄積で暗くなり、放出で一度抜け、余韻の後に戻る', () => {
    const s = (t: number) => screenState(t, 1, presets.vivid, 'attack').darken;
    expect(s(BEATS[0].inputEnd - .1)).toBe(0); expect(s(発動 - .5)).toBeGreaterThan(.2); expect(s(発動 + .1)).toBeLessThan(s(発動 - .5)); expect(s(命中 + 4.5)).toBeLessThan(.01);
    // 入力の量は派手さを通してだけ暗さに効く。派手さが大きいほど暗く、昔の入力の量の引数（6番目）は何にも効かない。
    const dark = (intensity: number, amount = 0) => screenState(発動 - .5, intensity, presets.vivid, 'attack', 0, amount).darken;
    expect(dark(intensityOf(null, presets.vivid, 1))).toBeGreaterThan(dark(intensityOf(null, presets.vivid, 0)));
    expect(dark(1, 1)).toBe(dark(1, 0));
  });
});

describe('粒の置き場', () => {
  it('上限を超えず、寿命が尽きると消え、同じ種で同じ散り方になる', () => {
    const pool = new ParticlePool(10); pool.reseed(3);
    for (let i = 0; i < 25; i++) pool.spawn({ x: 0, y: 0, vx: 10, vy: 0, life: .5 });
    expect(pool.count).toBe(10);
    pool.update(.3); expect(pool.count).toBe(10); expect(pool.items[0].x).toBeCloseTo(3);
    pool.update(.3); expect(pool.count).toBe(0);
    const a = new ParticlePool(2), b = new ParticlePool(2); a.reseed(9); b.reseed(9);
    expect(a.random()).toBe(b.random());
  });
  it('空いた場所を使い回し、生きている粒は横取りしない。消えては出るを繰り返しても、空きがある限り減らない', () => {
    const pool = new ParticlePool(3);
    const first = pool.spawn({ x: 1, life: 1 }), short = pool.spawn({ x: 2, life: .1 }), third = pool.spawn({ x: 3, life: 1 });
    expect(pool.count).toBe(3);
    pool.update(.2);
    expect(pool.count).toBe(2); expect(short.alive).toBe(false);
    // 空いたのは2番目の場所。次の粒はそこに入り、1番目と3番目はそのまま残る。
    const next = pool.spawn({ x: 4, life: 1 });
    expect(next).toBe(pool.items[1]); expect(next.x).toBe(4);
    expect(pool.count).toBe(3); expect(first.x).toBe(1); expect(third.x).toBe(3);
    const busy = new ParticlePool(40);
    for (let round = 0; round < 30; round++) {
      for (let i = 0; i < 12; i++) {
        const before = busy.count;
        busy.spawn({ life: .1 + (i % 4) * .1 });
        expect(busy.count).toBe(Math.min(40, before + 1));
      }
      busy.update(.15);
      expect(busy.count).toBe(busy.items.filter(p => p.alive).length);
    }
    busy.update(10); expect(busy.count).toBe(0);
    // 全部消えた後もまた上限ちょうどまで出せる。
    for (let i = 0; i < 60; i++) busy.spawn({ life: 1 });
    expect(busy.count).toBe(40);
  });
  it('出し直しても入れ物を作り直さず、前の値も残さない', () => {
    const pool = new ParticlePool(4);
    const first = [...pool.items];
    for (let turn = 0; turn < 5; turn++) {
      for (let i = 0; i < 4; i++) pool.spawn({ x: i, gravity: 300, life: .1 });
      pool.update(.2);
    }
    // 何度出し直しても、置き場の粒は最初に作ったものと同じまま。
    pool.items.forEach((p, i) => expect(p).toBe(first[i]));
    // 指定しなかった項目は前の値ではなく既定値に戻る。
    const again = pool.spawn({ life: 1 });
    expect(again.gravity).toBe(0); expect(again.x).toBe(0); expect(again.drag).toBe(1); expect(again.color).toBe('#fff');
  });
});

describe('揺れ、寄り、暗転', () => {
  const vivid = (t: number, calm = false) => screenState(t, 2, presets.vivid, 'attack', 0, .5, calm);
  it('揺れは命中の直後が一番強く、時間とともに減って止まる', () => {
    const size = (t: number) => Math.hypot(vivid(t).shakeX, vivid(t).shakeY);
    // ゆれの向きは時刻ごとに変わるので、一点ではなく少し幅を持たせて一番強いところで比べる。
    const peak = (from: number, to: number) => { let most = 0; for (let t = from; t < to; t += .005) most = Math.max(most, size(t)); return most; };
    expect(peak(命中, 命中 + .08)).toBeGreaterThan(peak(命中 + .16, 命中 + .24));
    expect(peak(命中 + .16, 命中 + .24)).toBeGreaterThan(peak(命中 + .5, 命中 + .8));
    expect(peak(命中 + .8, 命中 + 1.4)).toBe(0);
    // 衝撃の強さは減り続け、同じ時刻なら何度でも同じ値になる。
    expect(shockAt(命中 + .1, .5, 1)).toBeGreaterThan(shockAt(命中 + .4, .5, 1));
    expect(vivid(命中 + .1).shakeX).toBe(vivid(命中 + .1).shakeX);
    expect(wobble(3.42, 1)).toBe(wobble(3.42, 1));
    expect(Math.abs(wobble(7.77, 2))).toBeLessThanOrEqual(1);
  });
  it('傾きは2度までで、寄りは等倍から約2割の間に収まり、命中が一番強い', () => {
    const zoomOf = (t: number) => screenState(t, 3, presets.max, 'attack').zoom;
    let tilted = 0, mostTilt = 0, leastZoom = Infinity, mostZoom = 0;
    // 傾きは時刻と種から作るなめらかな乱数なので、種をいくつか変えて見る。確かめるのは最後に一度だけ。
    for (let seed = 0; seed < 8; seed++) for (let t = 発動; t < 命中 + 1; t += .01) {
      const s = screenState(t, 3, presets.max, 'attack', seed);
      mostTilt = Math.max(mostTilt, Math.abs(s.rotate));
      if (Math.abs(s.rotate) > 1) tilted++;
      leastZoom = Math.min(leastZoom, s.zoom); mostZoom = Math.max(mostZoom, s.zoom);
    }
    expect(mostTilt).toBeLessThanOrEqual(SHAKE_TILT);
    // 引くことはなく、寄りすぎて絵が破綻することもない。命中の1.18倍に揺れの拡大（最大1.03倍）が乗る分まで。
    expect(leastZoom).toBeGreaterThanOrEqual(1);
    expect(mostZoom).toBeLessThan(HIT_ZOOM * 1.03 + .001);
    expect(zoomOf(IMPACT_AT)).toBeGreaterThan(zoomOf(発動 + .6));
    expect(zoomOf(IMPACT_AT)).toBeGreaterThan(zoomOf(命中 + .7));
    // 1度を超える傾きが実際に出る（上限を上げただけで終わっていない）。
    expect(tilted).toBeGreaterThan(0);
  });
  it('控えめモードでは揺れも傾きも寄りも停止もなく、閃光は弱まる', () => {
    const calm = vivid(命中 + .02, true);
    expect(calm.shakeX).toBe(0); expect(calm.shakeY).toBe(0);
    expect(calm.rotate).toBe(0); expect(calm.zoom).toBe(1); expect(calm.hitStop).toBe(0);
    expect(calm.chromatic).toBe(0);
    // 画面に出る濃さの上限（3分の1）は tests/overlay.test.ts で見る。ここは画面の効果の側でも弱めていることだけを見る。
    expect(calm.flash).toBeLessThan(vivid(命中 + .02).flash / 2);
  });
  it('寄りは溜めの後半で1.03倍まで進み、命中で1.18倍から0.3秒で戻る', () => {
    const zoomOf = (t: number) => screenState(t, 1, presets.vivid, 'attack').zoom;
    expect(zoomOf(発動 - 1.6)).toBeCloseTo(1, 3);
    expect(zoomOf(発動 - .7)).toBeGreaterThan(zoomOf(発動 - 1.2));
    expect(zoomOf(発動 - .01)).toBeCloseTo(1.03, 3);
    // 命中の瞬間は寄り1.18倍に揺れの拡大が少し乗る。
    expect(zoomOf(命中)).toBeGreaterThan(HIT_ZOOM - .01); expect(zoomOf(命中)).toBeLessThan(HIT_ZOOM * 1.03 + .001);
    expect(zoomOf(命中 + .2)).toBeLessThan(zoomOf(命中 + .05));
    expect(zoomOf(命中 + .31)).toBeLessThan(1.03);
  });
  it('どの回も、その回の発動の直前だけ完全に暗転し、発動で抜ける', () => {
    // 防御の回は本人の魔法の用途が無い（null）ので、その形で呼ぶ。
    for (const [beat, purpose] of [[BEATS[0], 'attack'], [BEATS[1], null], [BEATS[2], 'attack']] as const) {
      const black = (t: number) => screenState(t, 1, presets.vivid, purpose, 0, 0, false, beat).blackout;
      const label = `${beat.release}秒に発動する回`;
      expect(black(beat.release - BLACKOUT_SECONDS - .01), label).toBe(0);
      expect(black(beat.release - .05), label).toBeGreaterThan(.5);
      expect(black(beat.release - .01), label).toBe(1);
      expect(black(beat.release), label).toBe(0);
    }
  });
  it('背景の彩度は溜めの後半で0.6まで落ち、命中の後に戻る', () => {
    const sat = (t: number) => screenState(t, 1, presets.vivid, 'attack').saturate;
    expect(sat(発動 - 1.6)).toBe(1);
    expect(sat(発動 - .8)).toBeLessThan(1);
    expect(sat(発動)).toBeCloseTo(.6, 3);
    expect(sat(命中 + .7)).toBeGreaterThan(sat(命中 + .1));
    expect(sat(命中 + 2)).toBeCloseTo(1, 3);
  });
});

describe('二属性の色', () => {
  it('中間色は平均せず色相の中間を取るので、濁らず鮮やかなまま', () => {
    // 赤と青を平均すると暗い紫（#7f007f）になるが、色相の中間は鮮やかな赤紫になる。
    expect(mixHue('#ff0000', '#0000ff')).toBe('#ff00ff');
    expect(mixHue('#0000ff', '#ff0000')).toBe('#ff00ff');
    expect(mixHue(presets.vivid.palettes.fire.main, presets.vivid.palettes.lightning.main)).toMatch(/^#[0-9a-f]{6}$/);
  });
  it('明るさを上げても色は同じ向きのまま、255を超えない', () => {
    expect(lighten('#804020', 1.5)).toBe('#c06030');
    expect(lighten('#ff6a1e', 1.5)).toBe('#ff9f2d');
  });
});

describe('連弾のリズム', () => {
  it('単発は遅れず、連弾は80ms間隔で、最後の1発だけ200ms空く', () => {
    expect(hitDelay(0, 1)).toBe(0);
    expect(hitDelay(0, 7)).toBe(0);
    expect(hitDelay(1, 7)).toBeCloseTo(.08);
    expect(hitDelay(5, 7)).toBeCloseTo(.4);
    // 最後は命中 + 0.08×(7-1) + 0.2 = 命中の0.68秒後に届く。
    expect(IMPACT_AT + hitDelay(6, 7)).toBeCloseTo(IMPACT_AT + .68);
    for (let i = 1; i < 7; i++) expect(hitDelay(i, 7)).toBeGreaterThan(hitDelay(i - 1, 7));
  });
});

describe('控えめモードは部品にも届く', () => {
  /** 命中の部品だけを呼ぶための仮の Frame。光の絵は描かず、粒の数だけを見る。単発の攻撃は破裂を命中の0.08秒後に出すので、その直後で数える。 */
  const frame = (calm: boolean, pool: ParticlePool): Frame => testFrame({ t: IMPACT_AT + .09, pool, calm });
  const impactParticles = (calm: boolean) => {
    const pool = new ParticlePool(2000); pool.reseed(7);
    drawImpact(frame(calm, pool));
    return pool.count;
  };
  it('控えめのとき、命中で出る粒が減る', () => {
    const normal = impactParticles(false), calm = impactParticles(true);
    expect(normal).toBeGreaterThan(0);
    expect(calm).toBeLessThan(normal);
    expect(calm).toBeCloseTo(normal / 3, -1);
  });
});

describe('コマ落ちしても同じ火花', () => {
  /** 仮の画面。記録は命中のコマだけにしたいので、tape.recording が真の間だけ、描いた命令を書き出す仮のcanvasへ回す。 */
  const screen = (tape: { recording: boolean; log: string[] }) => {
    const quiet = stubContext() as unknown as Record<string, unknown>, loud = stubContext(tape.log) as unknown as Record<string, unknown>;
    // 置いた値（色や太さ）は両方に入れておき、どちらへ回しても同じ値が読めるようにする。
    const c = new Proxy({}, {
      get: (_, key: string) => (tape.recording ? loud : quiet)[key],
      set: (_, key: string, value) => { quiet[key] = value; loud[key] = value; return true; },
    });
    const canvas = { width: 0, height: 0, getContext: () => c, getBoundingClientRect: () => ({ width: 1280, height: 720 }) };
    return new MagicCanvas(canvas as unknown as HTMLCanvasElement, presets.max);
  };
  /**
   * 蓄積（締め切りから発動まで）を step 秒の刻みで進め、放出から命中までは同じ刻みで進める。
   * 蓄積の粒は毎コマ乱数を使うので、刻みが違うと乱数の消費順が変わる。
   * 返すのは命中のコマで描いた命令だけ。
   */
  const untilImpact = (step: number) => {
    const tape = { recording: false, log: [] as string[] }, magic = screen(tape), spell = recipe({ count: 3 });
    const at = (t: number) => magic.renderEffects({ points: [], ms: t * 1000, recipe: spell, voice: 0, cursors: [], ready: false, target: { x: .72, y: .45 }, origin: { x: 320, y: 520 } });
    for (let t = BEATS[0].inputEnd; t < RELEASE_AT; t += step) at(t);
    for (let t = RELEASE_AT; t < IMPACT_AT; t += 1 / 60) at(t);
    tape.log.length = 0; tape.recording = true;
    at(IMPACT_AT);
    return tape.log;
  };
  beforeAll(() => {
    // node には canvas も画面の細かさもないので、仮のものを置く。
    vi.stubGlobal('devicePixelRatio', 1);
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => stubContext() }) });
  });
  afterAll(() => vi.unstubAllGlobals());
  it('蓄積のコマ数が違っても、命中の火花は同じ', () => {
    const steady = untilImpact(1 / 60), dropped = untilImpact(1 / 24);
    expect(steady.length).toBeGreaterThan(300);
    // 粒の入る場所（置き場の添え字）は違うので、描いた命令を並べ替えて突き合わせる。
    expect([...dropped].sort()).toEqual([...steady].sort());
  });
});
