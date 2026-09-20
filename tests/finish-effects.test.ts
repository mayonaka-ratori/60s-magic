import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest';
import { BEATS, beatOf, ROUNDS, FINISH_HIT_OFFSETS_MS } from '../src/game/rounds';
import { AIM } from '../src/game/guard';
import { presets } from '../src/render/effects/presets';
import { ParticlePool } from '../src/render/effects/particles';
import { drawTravel, arrivalOf } from '../src/render/effects/release';
import { screenState, FINISH_PASS_FLASH } from '../src/render/effects/screen';
import { MagicCanvas } from '../src/render/magic';
import type { Frame } from '../src/render/effects/frame';
import type { Point, Recipe } from '../src/game/types';
import {
  FINISH_HOLD, FINISH_INHERITED, FINISH_PASS, FINISH_RING, FINISH_SETTLE,
  drawFinish, finishBoost, finishHitPlan, finishHitTimes, finishTravel, holdTime,
  inheritedSpot, passThrough, ringLayout, ringPassAt, settleFade,
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
  accent: null, live: { words: [], amount: 0, voice: 0, rings: 0 }, points, cursors: [],
  beat: finishBeat, guard: null, aim: AIM, inherited: [], calm: false,
  once: (_key, run) => run(), ...over,
});

describe('術式が視界を通り抜ける', () => {
  it('1倍から8倍へ、前半の0.1秒で6倍まで広がる', () => {
    expect(passThrough(-.01)).toBeNull();
    expect(passThrough(FINISH_PASS.seconds)).toBeNull();
    expect(passThrough(0)!.scale).toBeCloseTo(1, 6);
    expect(passThrough(FINISH_PASS.fast)!.scale).toBeCloseTo(FINISH_PASS.fastScale, 6);
    expect(passThrough(FINISH_PASS.seconds - .001)!.scale).toBeCloseTo(FINISH_PASS.scale, 1);
    // 速く始めて遅く終わる。前半で全体の7割より先まで進む。
    expect(passThrough(FINISH_PASS.fast / 2)!.scale).toBeGreaterThan(1 + (FINISH_PASS.fastScale - 1) * .7);
    let 前 = 0;
    for (let time = 0; time < FINISH_PASS.seconds; time += .005) { const now = passThrough(time)!.scale; expect(now).toBeGreaterThanOrEqual(前); 前 = now; }
  });
  it('濃さは0.06秒だけ1.0のまま、そこから0へ抜ける', () => {
    expect(passThrough(0)!.alpha).toBe(1);
    expect(passThrough(FINISH_PASS.hold - .001)!.alpha).toBeCloseTo(1, 3);
    expect(passThrough(FINISH_PASS.hold + .05)!.alpha).toBeLessThan(1);
    expect(passThrough(FINISH_PASS.seconds - .001)!.alpha).toBeLessThan(.01);
  });
  it('控えめモードでは8倍ではなく4倍までにする', () => {
    expect(passThrough(FINISH_PASS.seconds - .001, true)!.scale).toBeCloseTo(FINISH_PASS.calmScale, 1);
    expect(passThrough(.05, true)!.scale).toBeLessThan(passThrough(.05)!.scale);
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
  it('飛翔の部品へ渡す倍率は、発動で1倍、到達で約2倍', () => {
    expect(finishBoost(frame(finishBeat.release)).size).toBeCloseTo(1, 6);
    expect(finishBoost(frame(finishBeat.impact)).travel).toBeCloseTo(1, 6);
    expect(finishBoost(frame(finishBeat.impact)).size).toBeGreaterThan(1.9);
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
    expect(finishHitTimes(finishBeat)).toEqual([53.6, 53.76, 53.92, 54.1]);
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
    expect(from).toBeCloseTo(51.6, 6);
    expect(holdTime(from - .001, finishBeat)).toBeNull();
    expect(holdTime(from, finishBeat)).toBe(from);
    expect(holdTime(from + .31, finishBeat)).toBe(from);
    // 51.92秒からは暗転が受け持つので、止めるのをやめる。
    expect(holdTime(from + FINISH_HOLD.seconds, finishBeat)).toBeNull();
    for (const beat of [BEATS[0], BEATS[1]]) expect(holdTime(beat.release - .2, beat)).toBeNull();
  });
  it('術式の光は余韻の始まりから抜け、世界の59.25秒で消える', () => {
    expect(settleFade(finishBeat.handoff - .1, finishBeat)).toBe(1);
    expect(settleFade(finishBeat.handoff, finishBeat)).toBe(1);
    expect(settleFade(finishBeat.handoff + FINISH_SETTLE.seconds / 2, finishBeat)).toBeCloseTo(.5, 6);
    expect(finishBeat.handoff + FINISH_SETTLE.seconds).toBeCloseTo(59.25, 6);
    expect(settleFade(59.25, finishBeat)).toBe(0);
    expect(settleFade(60, finishBeat)).toBe(0);
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
    for (let t = 49; t < 59.4; t += 1 / 60) {
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
    for (let t = 49; t < 51.6; t += 1 / 60) at(t);
    at(51.6); const 止めた時刻 = magic.effectMs;
    for (let t = 51.6; t < 51.91; t += 1 / 60) at(t);
    expect(magic.effectMs).toBe(止めた時刻);
    at(51.95);
    expect(magic.effectMs).toBeGreaterThan(止めた時刻);
  });
  it('一回目の回では、とどめの部品を描かない', () => {
    const log: string[] = [];
    drawFinish(frame(BEATS[0].release + .1, { c: stubContext(log), beat: BEATS[0] }));
    expect(log).toEqual([]);
  });
});
