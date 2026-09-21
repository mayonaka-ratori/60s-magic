import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest';
import { BEATS, beatOf, ROUNDS, FINISH_FALL_FROM_MS, FINISH_FALL_TO_MS, FINISH_HIT_MS, FINISH_HIT_OFFSETS_MS } from '../src/game/rounds';
import { AIM } from '../src/game/guard';
import { presets } from '../src/render/effects/presets';
import { ParticlePool } from '../src/render/effects/particles';
import { drawTravel, arrivalOf, bodyPoint, hitDelay } from '../src/render/effects/release';
import { screenState, warpOf, warpTime, FINISH_PASS_FLASH, HIT_STOPS } from '../src/render/effects/screen';
import { MagicCanvas, afterglowEnd, afterglowFade, stopAtOf } from '../src/render/magic';
import type { Frame } from '../src/render/effects/frame';
import type { Point, Recipe } from '../src/game/types';
import {
  FINISH_HOLD, FINISH_INHERITED, FINISH_PASS, FINISH_RING, FINISH_SETTLE, SPELL_LINE_WIDTH,
  drawFinish, finishBoost, finishHitPlan, finishHitTimes, finishTravel, holdTime,
  inheritedSpot, passExitScale, passStrokeWidth, passThrough, ringLayout, ringPassAt, ringStrokeWidth,
  settleFade, spellRadius,
} from '../src/render/effects/finish';

const finishBeat = beatOf(ROUNDS[2]);
const recipe = (over: Partial<Recipe> = {}): Recipe => ({ version: 'recipe-1', element: 'fire', purpose: 'attack', form: 'orb', trajectory: 'straight', count: 1, explicitCount: null, defense: .3, area: .5, duration: .5, concentration: .5,
  enclosure: false, split: false, developsPrevious: null, motionSpeechAligned: null, noAttack: false, name: '', source: 'local', decisions: {}, assistance: [], model: null, ...over });

/** 描く命令を受け流すだけの仮の canvas。数の指定だけを記録できる。 */
const digits = (v: number) => Math.round(v * 1000) / 1000;
const stubContext = (log?: string[]) => {
  const held: Record<string, unknown> = {};
  const fake: unknown = new Proxy(held, {
    get: (target, key: string) => (key in target ? target[key] : (...args: unknown[]) => {
      log?.push(key + ':' + args.filter(a => typeof a === 'number').map(a => digits(a as number)).join(','));
      return fake;
    }),
    set: (target, key: string, value) => { if (typeof value === 'number') log?.push(key + '=' + digits(value)); target[key] = value; return true; },
  });
  return fake as CanvasRenderingContext2D;
};
/** 線を数本持つ、仮の術式の点列。 */
const points: Point[] = [];
for (let stroke = 0; stroke < 3; stroke++) for (let i = 0; i < 12; i++)
  points.push({ x: .4 + Math.cos(i / 12 * Math.PI * 2) * (.05 + stroke * .03), y: .6 + Math.sin(i / 12 * Math.PI * 2) * .05, t: i * 20, hand: 0, stroke });

/** finish.ts の部品だけを呼ぶための仮の Frame。 */
const frame = (t: number, over: Partial<Frame> = {}, spell: Partial<Recipe> = {}): Frame => ({
  c: stubContext(), w: 1280, h: 720, t, dt: .016,
  sprites: { draw: () => {} } as unknown as Frame['sprites'], pool: new ParticlePool(700),
  preset: presets.vivid, palette: presets.vivid.palettes.fire, intensity: 1.5,
  recipe: recipe(spell), locked: true, origin: { x: 320, y: 520 }, target: { x: 900, y: 360 },
  accent: null, live: { words: [], amount: 0, voice: 0, rings: 0, covered: false }, points, cursors: [],
  beat: finishBeat, guard: null, aim: AIM, inherited: [], calm: false,
  once: (_key, run) => run(), ...over,
});

describe('術式が視界を通り抜ける', () => {
  // 試験に使う画面と、本人の術式の大きさ。画面の高さの4割ほどの術式を想定する。
  const w = 1280, h = 720, 半分 = Math.hypot(w, h) / 2;
  const 半径 = spellRadius(points, w, h, { x: 320, y: 520 });
  const 抜ける倍率 = passExitScale(w, h, 半径);
  /** その時刻の、術式の外周までの長さ（画素）。 */
  const 外周 = (time: number, calm = false) => 半径 * passThrough(time, 抜ける倍率, calm)!.scale;

  it('広げる倍率は、画面の大きさと術式の大きさから決まる', () => {
    expect(半径).toBeGreaterThan(0);
    expect(抜ける倍率 * 半径).toBeCloseTo(半分, 6);
    // 大きく描いた人ほど倍率は小さく、小さく描いた人ほど大きくなる。下限は2倍。
    expect(passExitScale(w, h, 半径 * 2)).toBeLessThan(抜ける倍率);
    expect(passExitScale(w, h, 半分)).toBe(FINISH_PASS.minScale);
    expect(passExitScale(w, h, 半分 * 4)).toBe(FINISH_PASS.minScale);
  });
  it('0.10秒ではまだ画面の中に見え、0.20秒で画面の外へ出る', () => {
    expect(passThrough(-.01, 抜ける倍率)).toBeNull();
    expect(passThrough(FINISH_PASS.seconds, 抜ける倍率)).toBeNull();
    expect(passThrough(0, 抜ける倍率)!.scale).toBeCloseTo(1, 6);
    // 76.10秒（発動から0.10秒）ではまだ外周が画面の対角線の半分より内側。
    expect(外周(.1)).toBeLessThan(半分);
    // 76.20秒で抜けきる。
    expect(外周(FINISH_PASS.reach)).toBeGreaterThanOrEqual(半分 - 1e-6);
    // 残りの0.05秒でさらに1.3倍まで広がる。
    expect(外周(FINISH_PASS.seconds - .001)).toBeGreaterThan(半分 * (FINISH_PASS.overshoot - .01));
  });
  it('最初はゆっくり、後半で速く広がる', () => {
    const 前半 = 外周(.1) - 外周(0), 後半 = 外周(.2) - 外周(.1);
    expect(後半).toBeGreaterThan(前半 * 2);
    let 前 = 0;
    for (let time = 0; time < FINISH_PASS.seconds; time += .005) {
      const now = passThrough(time, 抜ける倍率)!.scale;
      expect(now).toBeGreaterThanOrEqual(前); 前 = now;
    }
  });
  it('濃さは0.15秒だけ1.0のまま、そこから0へ抜ける', () => {
    const 濃さ = (time: number) => passThrough(time, 抜ける倍率)!.alpha;
    expect(濃さ(0)).toBe(1);
    expect(濃さ(.1)).toBe(1);
    expect(濃さ(FINISH_PASS.hold - .001)).toBeCloseTo(1, 3);
    expect(濃さ(FINISH_PASS.hold + .05)).toBeLessThan(1);
    expect(濃さ(FINISH_PASS.seconds - .001)).toBeLessThan(.02);
  });
  it('控えめモードでは抜けきる倍率の半分までにする。長さは同じ', () => {
    expect(passThrough(FINISH_PASS.reach, 抜ける倍率, true)!.scale)
      .toBeCloseTo(1 + (抜ける倍率 - 1) * FINISH_PASS.calmShare, 6);
    expect(外周(.1, true)).toBeLessThan(外周(.1));
    expect(passThrough(FINISH_PASS.seconds, 抜ける倍率, true)).toBeNull();
  });
  it('線は今の術式の2倍より細くならず、広げるほど太くなる', () => {
    const 太さ = (scale: number) => passStrokeWidth(h, 1.5, scale);
    expect(太さ(1)).toBeGreaterThanOrEqual(SPELL_LINE_WIDTH * 2);
    expect(太さ(1)).toBeGreaterThanOrEqual(h * FINISH_PASS.width);
    expect(太さ(抜ける倍率)).toBeGreaterThan(太さ(1));
    // 派手さが小さくても、画面の高さに対する下限は割らない。
    expect(passStrokeWidth(h, 0, 1)).toBeGreaterThanOrEqual(SPELL_LINE_WIDTH * 2);
  });
  it('広げた術式の線と光が、濃いまま描かれる', () => {
    // 濃さを保つ間（0.15秒まで）は濃いまま、そのあとは薄れていく。
    for (const [time, 下限] of [[.02, .9], [.1, .9], [.18, .5]] as const) {
      const log: string[] = [];
      drawFinish(frame(finishBeat.release + time, { c: stubContext(log) }));
      const 太さ = log.filter(line => line.startsWith('lineWidth=')).map(line => Number(line.slice(10)));
      const 濃さ = log.filter(line => line.startsWith('globalAlpha=')).map(line => Number(line.slice(12)));
      expect(Math.max(...太さ), `${time}秒`).toBeGreaterThanOrEqual(SPELL_LINE_WIDTH * 2);
      expect(Math.max(...濃さ), `${time}秒`).toBeGreaterThanOrEqual(下限);
    }
  });
  it('発動の全画面の白は0.85まで上がり、0.17秒で戻る。ほかの回は上げない', () => {
    const 白 = (t: number, beat = finishBeat, calm = false) => screenState(t, 2, presets.vivid, 'attack', 0, 0, calm, beat).flash;
    expect(白(finishBeat.release)).toBeCloseTo(FINISH_PASS_FLASH.level, 6);
    expect(白(finishBeat.release + FINISH_PASS_FLASH.seconds)).toBeLessThan(.2);
    expect(白(finishBeat.release, finishBeat, true)).toBeCloseTo(FINISH_PASS_FLASH.level / 3, 6);
    for (const beat of [BEATS[0], BEATS[1]]) expect(白(beat.release, beat)).toBeLessThan(.3);
  });
});

describe('輪をくぐって奥へ伸びる', () => {
  it('手前は画面の高さの0.42倍、奥は0.08倍で、奥ほど詰めて置く', () => {
    const rings = [...Array(FINISH_RING.count)].map((_, i) => ringLayout(i));
    expect(rings[0].radius).toBeCloseTo(FINISH_RING.near, 6);
    expect(rings.at(-1)!.radius).toBeCloseTo(FINISH_RING.far, 6);
    for (let i = 1; i < rings.length; i++) {
      expect(rings[i].radius).toBeLessThan(rings[i - 1].radius);
      expect(rings[i].depth).toBeGreaterThan(rings[i - 1].depth);
    }
    // 間隔は奥へ行くほど狭い。
    const gaps = rings.slice(1).map((ring, i) => ring.depth - rings[i].depth);
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeLessThan(gaps[i - 1]);
    expect(rings[0].depth).toBeGreaterThan(0);
    expect(rings.at(-1)!.depth).toBeLessThan(1);
  });
  it('くぐるたびに太く速くなり、5枚で約2倍になる', () => {
    expect(finishTravel(0).travel).toBeCloseTo(0, 6);
    expect(finishTravel(1).travel).toBeCloseTo(1, 6);
    expect(finishTravel(0).scale).toBeCloseTo(1, 6);
    expect(finishTravel(1).scale).toBeCloseTo(Math.pow(FINISH_RING.grow, FINISH_RING.count), 6);
    expect(finishTravel(1).scale).toBeGreaterThan(1.9);
    expect(finishTravel(1).scale).toBeLessThan(2.1);
    expect(finishTravel(1).passed).toBe(FINISH_RING.count);
    let 前 = -1;
    for (let u = 0; u <= 1.0001; u += .01) { const now = finishTravel(u).travel; expect(now).toBeGreaterThanOrEqual(前); 前 = now; }
    // 後半ほど速い。同じ長さの時間で進む道のりが増える。
    expect(finishTravel(.9).travel - finishTravel(.8).travel).toBeGreaterThan(finishTravel(.2).travel - finishTravel(.1).travel);
  });
  it('くぐる時刻は輪の位置と合い、順に早くなる', () => {
    let 前 = 0;
    for (let i = 0; i < FINISH_RING.count; i++) {
      const at = ringPassAt(i);
      expect(at).toBeGreaterThan(前); 前 = at;
      expect(finishTravel(at).travel).toBeCloseTo(ringLayout(i).depth, 6);
    }
    expect(前).toBeLessThan(1);
  });
  it('輪の線は画面の高さの0.4%より細くならず、くぐった瞬間は太くなる', () => {
    expect(ringStrokeWidth(720)).toBeGreaterThanOrEqual(720 * FINISH_RING.width);
    expect(ringStrokeWidth(720, 1)).toBeGreaterThan(ringStrokeWidth(720));
    expect(FINISH_RING.alpha).toBeGreaterThanOrEqual(.8);
  });
  it('発動の直後から到達の手前まで5枚の輪が出て、太さと濃さが決めた値を満たす', () => {
    const 輪 = (t: number) => {
      const log: string[] = [];
      drawFinish(frame(t, { c: stubContext(log) }));
      return {
        枚数: log.filter(line => line.startsWith('ellipse:')).length,
        太さ: log.filter(line => line.startsWith('lineWidth=')).map(line => Number(line.slice(10))),
        濃さ: log.filter(line => line.startsWith('globalAlpha=')).map(line => Number(line.slice(12))),
      };
    };
    expect(輪(finishBeat.release + .29).枚数).toBe(0);
    expect(輪(finishBeat.impact - .09).枚数).toBe(0);
    const 途中 = 輪(finishBeat.release + .9);
    // 外側の輪と内側の輪で、5枚ぶん10個以上。
    expect(途中.枚数).toBeGreaterThanOrEqual(FINISH_RING.count * 2);
    expect(Math.max(...途中.太さ)).toBeGreaterThanOrEqual(720 * FINISH_RING.width);
    expect(Math.max(...途中.濃さ)).toBeGreaterThanOrEqual(FINISH_RING.alpha);
  });
  it('飛翔の部品へ渡す倍率は、発動で1倍、到達で約2倍', () => {
    expect(finishBoost(frame(finishBeat.release)).size).toBeCloseTo(1, 6);
    expect(finishBoost(frame(finishBeat.impact)).travel).toBeCloseTo(1, 6);
    expect(finishBoost(frame(finishBeat.impact)).size).toBeGreaterThan(1.9);
  });
  it('輪をくぐりきった後も進み続け、連弾の最後の弾も騎士まで届く', () => {
    const 五連 = (t: number) => frame(t, {}, { count: 5 });
    // 到達の0.5秒後。bodyPoint は弾ごとの遅れを引くので、頭打ちにすると5発目が届かない。
    const 後 = 五連(finishBeat.impact + .5), 進み = finishBoost(後).travel;
    const 遅れ = hitDelay(4, 5) / arrivalOf(後);
    expect(進み - 遅れ).toBeGreaterThanOrEqual(1);
    // bodyPoint を通した5発目の位置は、騎士のところに重なる。
    const 先 = bodyPoint(後, 4, 進み, 後.t - finishBeat.release);
    expect(先.x).toBeCloseTo(後.target.x, 6);
    expect(先.y).toBeCloseTo(後.target.y, 6);
    // 到達の時刻では、まだ5発目は手前にいる。
    const 中 = 五連(finishBeat.impact), 途中 = bodyPoint(中, 4, finishBoost(中).travel, 中.t - finishBeat.release);
    expect(Math.hypot(途中.x - 中.target.x, 途中.y - 中.target.y)).toBeGreaterThan(20);
    // 1発目は今までどおり、到達の時刻で騎士に重なる。
    const 先頭 = bodyPoint(中, 0, finishBoost(中).travel, 中.t - finishBeat.release);
    expect(先頭.x).toBeCloseTo(中.target.x, 6);
  });
  it('弾の数が数でなくても、当たる回の割り当ては空にならない', () => {
    expect(finishHitPlan(Number.NaN)).toEqual([1, 0, 0, 0]);
    expect(finishHitPlan(Number.POSITIVE_INFINITY)).toEqual([1, 0, 0, 0]);
  });
  it('倍率を渡さない飛翔は、今までと同じ命令になる', () => {
    const at = (boost?: { travel: number; size: number }) => {
      const log: string[] = [], f = frame(BEATS[0].release + .8, { c: stubContext(log), beat: BEATS[0] }, { count: 3, element: 'ice' });
      drawTravel(f, boost); return log;
    };
    const 素 = at(), 倍率1 = at({ travel: .8 / arrivalOf(frame(0, { beat: BEATS[0] })), size: 1 });
    expect(素.length).toBeGreaterThan(20);
    expect(倍率1).toEqual(素);
  });
});

describe('多段命中', () => {
  it('当たるのは固定の4回', () => {
    expect(FINISH_HIT_OFFSETS_MS).toEqual([0, 160, 320, 500]);
    const 予定 = FINISH_HIT_MS.map(ms => ms / 1000);
    finishHitTimes(finishBeat).forEach((at, i) => expect(at).toBeCloseTo(予定[i], 6));
  });
  it('弾の数を4回へ散らす。1発は1回目だけ、5発は1回目が2発', () => {
    expect(finishHitPlan(1)).toEqual([1, 0, 0, 0]);
    expect(finishHitPlan(2)).toEqual([1, 1, 0, 0]);
    expect(finishHitPlan(4)).toEqual([1, 1, 1, 1]);
    expect(finishHitPlan(5)).toEqual([2, 1, 1, 1]);
    expect(finishHitPlan(8)).toEqual([2, 2, 2, 2]);
    for (let count = 1; count <= 8; count++) expect(finishHitPlan(count).reduce((a, b) => a + b, 0)).toBe(count);
  });
});

describe('描く値だけを止める間と、余韻', () => {
  it('発動の0.4秒前から0.32秒だけ、描く値を止める', () => {
    const from = finishBeat.release - FINISH_HOLD.before;
    expect(from).toBeCloseTo(finishBeat.release - .4, 6);
    expect(holdTime(from - .001, finishBeat)).toBeNull();
    expect(holdTime(from, finishBeat)).toBe(from);
    expect(holdTime(from + .31, finishBeat)).toBe(from);
    // 止める時間が終わったら、そこからは暗転が受け持つ。
    expect(holdTime(from + FINISH_HOLD.seconds, finishBeat)).toBeNull();
    for (const beat of [BEATS[0], BEATS[1]]) expect(holdTime(beat.release - .2, beat)).toBeNull();
  });
  it('術式の光は余韻の始まりから抜け、回の終わりまで残る', () => {
    const 消える = finishBeat.handoff + FINISH_SETTLE.seconds;
    expect(settleFade(finishBeat.handoff - .1, finishBeat)).toBe(1);
    expect(settleFade(finishBeat.handoff, finishBeat)).toBe(1);
    expect(settleFade(finishBeat.handoff + FINISH_SETTLE.seconds / 2, finishBeat)).toBeCloseTo(.5, 6);
    // 抜けきるのは回の終わり（世界の時刻）。手前で消して、動かない絵が続く間を作らない。
    expect(消える).toBeCloseTo(finishBeat.end, 6);
    expect(settleFade(消える, finishBeat)).toBe(0);
    // 魔導書へ移る実際の90.0秒では、世界の時計がまだ手前なので光が残っている。
    // 控えめモード（止めなし）でも同じ。
    for (const hitStop of [HIT_STOPS.strong, 0]) {
      const 世界 = warpTime(finishBeat.end, warpOf(finishBeat, hitStop));
      expect(世界).toBeLessThan(finishBeat.end);
      expect(settleFade(世界, finishBeat)).toBeGreaterThan(0);
    }
  });
  it('床の塵は、騎士が倒れ始めてから立つ', () => {
    const 倒れ始め = FINISH_FALL_FROM_MS / 1000, 倒れきり = FINISH_FALL_TO_MS / 1000;
    // 塵の時刻は一撃からの秒で持つが、指す先は倒れ始めと同じ時刻。
    expect((finishBeat.finalBlow ?? 0) + FINISH_SETTLE.dustFrom).toBeCloseTo(倒れ始め, 6);
    expect(FINISH_SETTLE.dustFrom).toBeLessThan(倒れきり - (finishBeat.finalBlow ?? 0));
    // 倒れ始めの手前のコマでは粒が増えず、倒れ始めのコマで増える。
    // 受け皿は大きめに取る。いっぱいになると、増えたかどうかが分からなくなる。
    const 粒 = (t: number) => { const f = frame(t, { pool: new ParticlePool(20000) }); drawFinish(f); return f.pool.count; };
    expect(粒(倒れ始め)).toBeGreaterThan(粒(倒れ始め - .001));
    expect(粒(倒れ始め - .001)).toBe(粒(倒れ始め - .5));
  });
});

describe('引き継いだ光点', () => {
  it('左右の端から中央へ寄り、術式のまわりに収まる', () => {
    const origin = { x: 640, y: 400 }, w = 1280, h = 720;
    const 端 = inheritedSpot(0, 4, 0, w, h, origin), 端2 = inheritedSpot(1, 4, 0, w, h, origin);
    expect(端.x).toBeLessThan(0);
    expect(端2.x).toBeGreaterThan(w);
    const 中央 = inheritedSpot(0, 4, FINISH_INHERITED.gather, w, h, origin);
    const reach = Math.min(w, h) * FINISH_INHERITED.reach;
    expect(Math.hypot(中央.x - origin.x, 中央.y - origin.y)).toBeLessThanOrEqual(reach + .001);
    // 新しい線の邪魔をしない薄さにする。
    for (const time of [0, 1, 2, 4, 8]) expect(inheritedSpot(0, 4, time, w, h, origin).alpha).toBeLessThan(.4);
  });
});

describe('とどめの見せ方を通しで描く', () => {
  beforeAll(() => {
    vi.stubGlobal('devicePixelRatio', 1);
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => stubContext() }) });
  });
  afterAll(() => vi.unstubAllGlobals());
  const screen = (log: string[], preset = presets.vivid) => {
    const canvas = { width: 0, height: 0, getContext: () => stubContext(log), getBoundingClientRect: () => ({ width: 1280, height: 720 }) };
    return new MagicCanvas(canvas as unknown as HTMLCanvasElement, preset);
  };
  /** とどめの回を1コマ1/60秒で通し、粒の数の山を返す。 */
  const play = (preset = presets.vivid) => {
    const log: string[] = [], magic = screen(log, preset), spell = recipe({ count: 5 });
    let peak = 0;
    for (let t = finishBeat.inputEnd; t < finishBeat.end - .6; t += 1 / 60) {
      magic.renderEffects({ points, ms: t * 1000, recipe: spell, voice: 0, cursors: [], ready: false,
        target: { x: .72, y: .45 }, origin: { x: 320, y: 520 }, inherited: [{ x: .2, y: .4 }, { x: .8, y: .5 }] });
      peak = Math.max(peak, magic.particleCount);
    }
    return { peak, log };
  };
  it('粒は設定の上限を超えず、描いている間に例外が出ない', () => {
    const vivid = play();
    expect(vivid.peak).toBeGreaterThan(0);
    expect(vivid.peak).toBeLessThanOrEqual(presets.vivid.maxParticles);
    expect(play(presets.calm).peak).toBeLessThanOrEqual(presets.calm.maxParticles);
  });
  it('描いた命令に数でない値（NaN）が混ざらない', () => {
    const { log } = play();
    expect(log.length).toBeGreaterThan(1000);
    expect(log.filter(line => line.includes('NaN'))).toEqual([]);
  });
  it('止めている間は粒も術式も動かない', () => {
    const magic = screen([]), spell = recipe({ count: 3 });
    const at = (t: number) => magic.renderEffects({ points, ms: t * 1000, recipe: spell, voice: 0, cursors: [], ready: false, target: { x: .72, y: .45 }, origin: { x: 320, y: 520 } });
    const 止め始め = finishBeat.release - .4;
    for (let t = finishBeat.inputEnd; t < 止め始め; t += 1 / 60) at(t);
    at(止め始め); const 止めた時刻 = magic.effectMs;
    for (let t = 止め始め; t < 止め始め + .31; t += 1 / 60) at(t);
    expect(magic.effectMs).toBe(止めた時刻);
    at(止め始め + .35);
    expect(magic.effectMs).toBeGreaterThan(止めた時刻);
  });
  it('発動の0.4秒前の「間」は、騎士と術式が見る世界の時刻も止まる', () => {
    const magic = screen([]), spell = recipe({ count: 3 });
    // effectMsOf は時刻だけで決まるので、コマを回さずに確かめられる。
    const 止め始め = ROUNDS[2].release - 400;
    expect(magic.effectMsOf(止め始め - 100, spell, 0, finishBeat)).toBe(止め始め - 100);
    expect(magic.effectMsOf(止め始め + 100, spell, 0, finishBeat)).toBe(止め始め);
    expect(magic.effectMsOf(止め始め + 310, spell, 0, finishBeat)).toBe(止め始め);
    // 0.32秒が終われば実際の時刻へ戻る。
    expect(magic.effectMsOf(止め始め + 330, spell, 0, finishBeat)).toBe(止め始め + 330);
    // 体力の段は最初の到達からなので、この間は影響を受けない。
    expect(magic.effectMsOf(ROUNDS[2].impact, spell, 0, finishBeat)).toBe(ROUNDS[2].impact);
    // 一回目と防御には「間」がないので、今までどおり実際の時刻のまま。
    for (const beat of [BEATS[0], BEATS[1]])
      for (const ms of [beat.release * 1000 - 400, beat.release * 1000 - 100, beat.release * 1000 - 1])
        expect(magic.effectMsOf(ms, spell, 0, beat)).toBe(ms);
  });
  it('とどめの余韻は、世界の時刻で消えきり、術式は回の終わりまで残る', () => {
    const 消える = finishBeat.handoff + FINISH_SETTLE.seconds;
    // 粒が消えきる時刻も、術式の光と同じく回の終わり（世界の時刻）。
    expect(afterglowEnd(finishBeat)).toBeCloseTo(finishBeat.end, 6);
    // 魔導書へ移る実際の90.0秒では、世界の時計がまだ手前なので粒も残っている。
    for (const hitStop of [HIT_STOPS.strong, 0]) {
      const 世界 = warpTime(finishBeat.end, warpOf(finishBeat, hitStop));
      expect(afterglowFade(finishBeat.end, 世界, finishBeat)).toBeGreaterThan(0);
    }
    // 消えきるのは世界の時刻で見る。実際の時刻ではそこから0.725秒あと。
    expect(afterglowFade(消える + .725, 消える, finishBeat)).toBeCloseTo(0, 9);
    expect(afterglowFade(消える + .725, 消える - 1, finishBeat)).toBeCloseTo(.5, 9);
    // 同じ実際の時刻でも、世界の時刻で数えるほうが濃く残る（スローのぶんだけ遅れているため）。
    const いま = 消える - .5 + .725;
    expect(afterglowFade(いま, いま - .725, finishBeat)).toBeGreaterThan(afterglowFade(いま, いま, finishBeat));
    expect(stopAtOf(finishBeat)).toBe(finishBeat.end);
  });
  it('一回目と防御の消え際と切る時刻は、今までと完全に同じ', () => {
    for (const beat of [BEATS[0], BEATS[1]]) {
      expect(stopAtOf(beat)).toBe(Math.max(beat.end - .5, beat.impact + 4.5));
      for (let t = beat.release; t < beat.end; t += 1 / 240)
        expect(afterglowFade(t, t, beat)).toBeCloseTo(1 - Math.min(1, Math.max(0, (t - (beat.impact + 2.5)) / 2)), 12);
    }
  });
  it('一回目の回では、とどめの部品を描かない', () => {
    const log: string[] = [];
    drawFinish(frame(BEATS[0].release + .1, { c: stubContext(log), beat: BEATS[0] }));
    expect(log).toEqual([]);
  });
});
