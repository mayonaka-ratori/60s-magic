import { describe, expect, it } from 'vitest';
import { BEATS } from '../src/game/rounds';
import { AIM } from '../src/game/guard';
import { presets } from '../src/render/effects/presets';
import { ParticlePool, type Particle } from '../src/render/effects/particles';
import { drawCharge } from '../src/render/effects/charge';
import type { Box, Frame, XY } from '../src/render/effects/frame';
import type { Recipe } from '../src/game/types';

/** 描く命令を受け流すだけの仮のcanvas。命令と数の指定を記録用の配列に書き出す。node には本物のcanvasがないため。 */
const digits = (v: number) => Math.round(v * 1000) / 1000;
const stubContext = (log: string[]) => {
  const held: Record<string, unknown> = {};
  const fake: unknown = new Proxy(held, {
    get: (target, key: string) => (key in target ? target[key] : (...args: unknown[]) => {
      log.push(key + ':' + args.filter(a => typeof a === 'number').map(a => digits(a as number)).join(','));
      return fake;
    }),
    set: (target, key: string, value) => { target[key] = value; return true; },
  });
  return fake as CanvasRenderingContext2D;
};
/** 光の絵の呼び出しを記録する。 */
type Glow = { x: number; y: number; r: number; core: string; main: string; alpha: number };
const stubSprites = (glows: Glow[]) => ({ draw: (_c: unknown, x: number, y: number, r: number, core: string, main: string, alpha: number) => { glows.push({ x, y, r, core, main, alpha }); } }) as unknown as Frame['sprites'];
/** 粒を出した記録を残す置き場。 */
class RecordingPool extends ParticlePool {
  readonly spawned: Array<Partial<Particle> & { at: number }> = [];
  at = 0;
  spawn(init: Partial<Particle>) { this.spawned.push({ ...init, at: this.at }); return super.spawn(init); }
}

const recipe: Recipe = { version: 'recipe-1', element: 'fire', purpose: 'attack', form: 'orb', trajectory: 'straight', count: 1, explicitCount: null, defense: .3, area: .5, duration: .5, concentration: .5,
  enclosure: false, split: false, developsPrevious: null, motionSpeechAligned: null, noAttack: false, name: '', source: 'local', decisions: {}, assistance: [], model: null };

const W = 1280, H = 720;
/** 一回目の締め切りと発動（秒）。蓄積はこの間だけ描くので、試験の時刻はここから作る。 */
const { inputEnd, release } = BEATS[0];
/** 画面の真ん中あたりに描いた術式。中心と三つの光点、その範囲。 */
const ORIGIN: XY = { x: 700, y: 450 };
/** 光点の横の位置は、中心や範囲の中央（700）と重ねない。描いた命令の記録から光点の足元の陣を見分けるため。 */
const ORIGINS: XY[] = [ORIGIN, { x: 520, y: 300 }, { x: 880, y: 600 }, { x: 640, y: 320 }];
const EXTENT: Box = { x: 500, y: 300, width: 400, height: 300 };

type Setup = { log: string[]; glows: Glow[]; pool: RecordingPool; frame: (t: number, dt: number) => Frame };
function setup(over: Partial<Frame> = {}, max = 2000): Setup {
  const log: string[] = [], glows: Glow[] = [], pool = new RecordingPool(max); pool.reseed(7);
  const frame = (t: number, dt: number): Frame => ({
    c: stubContext(log), w: W, h: H, t, dt, sprites: stubSprites(glows), pool,
    preset: presets.vivid, palette: presets.vivid.palettes.fire, intensity: 1.5,
    recipe, locked: true, origin: ORIGIN, origins: ORIGINS, extent: EXTENT, target: { x: 900, y: 360 },
    accent: null, live: { words: [], amount: 0, voice: 0, rings: 0, covered: false }, points: [], cursors: [], beat: BEATS[0], guard: null, aim: AIM, inherited: [], calm: false,
    once: (_key, run) => run(), ...over,
  });
  return { log, glows, pool, frame };
}
/** 締め切りから発動まで、step 秒の刻みで蓄積を描く。 */
function runCharge(s: Setup, step = 1 / 30, from = BEATS[0].inputEnd, to = BEATS[0].release) {
  for (let t = from; t < to; t += step) { s.pool.at = t; drawCharge(s.frame(t, step)); s.pool.update(step); }
}
const onEdge = (p: { x?: number; y?: number }) => (p.x ?? 0) <= 0 || (p.x ?? 0) >= W || (p.y ?? 0) <= 0 || (p.y ?? 0) >= H;
const sameSpot = (a: XY, b: { px?: number; py?: number }) => a.x === b.px && a.y === b.py;

describe('蓄積の粒は画面の端から生まれる', () => {
  it('四辺のどこかで生まれ、術式の光点か中心へ吸い込まれる', () => {
    const s = setup(); runCharge(s);
    expect(s.pool.spawned.length).toBeGreaterThan(100);
    for (const p of s.pool.spawned) {
      expect(onEdge(p)).toBe(true);
      expect(ORIGINS.some(o => sameSpot(o, p))).toBe(true);
      expect(p.pull).toBeGreaterThan(0);
    }
    // 中心にも光点にも向かう。
    expect(s.pool.spawned.some(p => sameSpot(ORIGIN, p))).toBe(true);
    expect(s.pool.spawned.some(p => sameSpot(ORIGINS[1], p) || sameSpot(ORIGINS[2], p) || sameSpot(ORIGINS[3], p))).toBe(true);
    // 左右上下のどの辺からも生まれる。
    expect(s.pool.spawned.some(p => (p.x ?? 0) <= 0)).toBe(true); expect(s.pool.spawned.some(p => (p.x ?? 0) >= W)).toBe(true);
    expect(s.pool.spawned.some(p => (p.y ?? 0) <= 0)).toBe(true); expect(s.pool.spawned.some(p => (p.y ?? 0) >= H)).toBe(true);
  });
  it('締め切りの前と発動の直前からは出さず、命中までに消えきる寿命にする', () => {
    const s = setup(); runCharge(s, 1 / 30, BEATS[0].inputEnd - 1, BEATS[0].release + .3);
    const times = s.pool.spawned.map(p => p.at);
    expect(Math.min(...times)).toBeGreaterThanOrEqual(BEATS[0].inputEnd);
    expect(Math.max(...times)).toBeLessThan(BEATS[0].release - .15);
    // 出すのをやめる時刻に寿命を足しても、命中（発動の1.5秒後）より前。命中の火花に混ざらない。
    for (const p of s.pool.spawned) expect(BEATS[0].release - .15 + (p.life ?? 0)).toBeLessThan(BEATS[0].impact);
  });
  it('端からでも、寿命が尽きる前に光点へ届いて消える', () => {
    // 蓄積の初めの粒はゆっくり、終わりの粒は速い。どちらも一番遠い端から出ても、寿命（1.6秒）より前に届く。
    for (const t of [inputEnd + .2, inputEnd + 1.5, inputEnd + 2.8]) {
      const s = setup(); s.pool.at = t; drawCharge(s.frame(t, .5));
      const distance = (p: { x?: number; y?: number; px?: number; py?: number }) => Math.hypot((p.px ?? 0) - (p.x ?? 0), (p.py ?? 0) - (p.y ?? 0));
      const far = s.pool.spawned.reduce((best, p) => distance(p) > distance(best) ? p : best);
      expect(distance(far)).toBeGreaterThan(500);
      expect(Math.hypot(far.vx ?? 0, far.vy ?? 0)).toBeGreaterThan(200);
      // 寿命を長くして一粒だけ飛ばし、光点の6画素以内に入って消えることを確かめる。
      const alone = new ParticlePool(1); alone.spawn({ ...far, life: 5 });
      let flown = 0;
      while (alone.count && flown < 1.6) { alone.update(1 / 60); flown += 1 / 60; }
      expect(alone.count).toBe(0);
      // 一コマの動きは20画素まで。速すぎて点が飛び飛びに見えない。
      const again = new ParticlePool(1); again.spawn({ ...far, life: 5 });
      for (let i = 0; i < 90 && again.count; i++) { const before = { x: again.items[0].x, y: again.items[0].y }; again.update(1 / 60); if (again.count) expect(Math.hypot(again.items[0].x - before.x, again.items[0].y - before.y)).toBeLessThan(20); }
    }
  });
  it('光点が無いときは中心だけへ向かう', () => {
    const s = setup({ origins: undefined, extent: undefined }); runCharge(s);
    expect(s.pool.spawned.length).toBeGreaterThan(50);
    for (const p of s.pool.spawned) { expect(onEdge(p)).toBe(true); expect(sameSpot(ORIGIN, p)).toBe(true); }
  });
  it('粒の上限を超えず、控えめモードでは3分の1になる', () => {
    const small = setup({}, 40); runCharge(small);
    expect(small.pool.count).toBeLessThanOrEqual(40);
    const normal = setup(), calm = setup({ calm: true }); runCharge(normal); runCharge(calm);
    expect(calm.pool.spawned.length).toBeLessThan(normal.pool.spawned.length);
    expect(calm.pool.spawned.length / normal.pool.spawned.length).toBeGreaterThan(.25);
    expect(calm.pool.spawned.length / normal.pool.spawned.length).toBeLessThan(.42);
    // 一コマに出す数には上限がある。コマ落ちしても一度に大量には出ない。
    const dropped = setup(); dropped.pool.at = inputEnd + 2.5; drawCharge(dropped.frame(inputEnd + 2.5, .5));
    expect(dropped.pool.spawned.length).toBeLessThanOrEqual(20);
  });
});

describe('床の明かりと魔法陣は術式の範囲に合わせる', () => {
  const floorOf = (glows: Glow[]) => glows.filter(g => g.core === g.main);
  it('範囲の下端の中央に属性の色の楕円を敷き、蓄積が進むほど明るく、濃さは0.35まで', () => {
    const early = setup(); drawCharge(early.frame(inputEnd + .6, 1 / 60));
    const late = setup(); drawCharge(late.frame(release - .1, 1 / 60));
    const a = floorOf(early.glows), b = floorOf(late.glows);
    expect(a).toHaveLength(1); expect(b).toHaveLength(1);
    expect(a[0].main).toBe(presets.vivid.palettes.fire.main);
    expect(b[0].alpha).toBeGreaterThan(a[0].alpha);
    expect(b[0].alpha).toBeLessThanOrEqual(.35);
    // 楕円は範囲の下端の中央に置き、縦をつぶして描く。横の広がりは範囲の横幅に合わせる。
    expect(late.log).toContain(`translate:${EXTENT.x + EXTENT.width / 2},${EXTENT.y + EXTENT.height}`);
    expect(late.log.some(entry => entry.startsWith('scale:1,0.'))).toBe(true);
    expect(b[0].r * 4).toBeGreaterThanOrEqual(EXTENT.width / 2);
    // 入力の量を重ねても上限は超えない。
    const full = setup({ live: { words: [], amount: 1, voice: 0, rings: 0, covered: false } }); drawCharge(full.frame(release - .01, 1 / 60));
    expect(floorOf(full.glows)[0].alpha).toBeLessThanOrEqual(.35);
  });
  /** 記録した arc の半径を取り出す。魔法陣は translate と scale の後に (0,0) を中心に描く。 */
  const arcRadii = (log: string[]) => log.filter(entry => entry.startsWith('arc:0,0,')).map(entry => Number(entry.split(':')[1].split(',')[2]));
  it('中心の魔法陣は範囲の横幅の半分まで広がり、画面の高さの30%を超えない', () => {
    const s = setup(); drawCharge(s.frame(release - .01, 1 / 60));
    const radii = arcRadii(s.log);
    expect(radii.length).toBeGreaterThan(0);
    // 一番大きい輪は、半径（横幅の半分）の1.22倍の目盛りの輪。
    expect(Math.max(...radii)).toBeLessThanOrEqual(EXTENT.width / 2 * 1.22 + .01);
    expect(Math.max(...radii)).toBeGreaterThan(EXTENT.width / 2 * .9);
    // 横に広い術式でも、画面の高さの30%で止まる。
    const wide = setup({ extent: { x: 40, y: 200, width: 1200, height: 300 } }); drawCharge(wide.frame(release - .01, 1 / 60));
    expect(Math.max(...arcRadii(wide.log))).toBeLessThanOrEqual(H * .3 * 1.22 + .01);
    // 小さな術式では今までの大きさ（36 + 派手さ×12）を保つ。
    const tiny = setup({ extent: { x: 690, y: 440, width: 20, height: 20 } }); drawCharge(tiny.frame(release - .01, 1 / 60));
    expect(Math.max(...arcRadii(tiny.log))).toBeGreaterThan(36 + 1.5 * 12);
  });
  it('入力の量が多いときだけ、光点の足元にも小さな陣が出る', () => {
    const few = setup(); drawCharge(few.frame(inputEnd + 2.5, 1 / 60));
    const many = setup({ live: { words: [], amount: 1, voice: 0, rings: 0, covered: false } }); drawCharge(many.frame(inputEnd + 2.5, 1 / 60));
    const spots = (log: string[]) => log.filter(entry => ORIGINS.slice(1).some(o => entry.startsWith(`translate:${o.x},`))).length;
    expect(spots(few.log)).toBe(0);
    expect(spots(many.log)).toBe(ORIGINS.length - 1);
  });
  it('地面から昇る光の筋は、範囲の横幅いっぱいに散らばる', () => {
    const s = setup(); drawCharge(s.frame(inputEnd + 2, 1 / 60));
    // 筋は moveTo と lineTo で引く一本の線。魔法陣の後の座標は (0,0) を中心にした値なので、範囲の中にある moveTo だけを見る。
    const xs = s.log.filter(entry => entry.startsWith('moveTo:')).map(entry => Number(entry.split(':')[1].split(',')[0]))
      .filter(x => x >= EXTENT.x && x <= EXTENT.x + EXTENT.width);
    expect(xs.length).toBeGreaterThanOrEqual(6);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(EXTENT.width * .6);
  });
  it('控えめの設定では魔法陣を出さないが、床の明かりは出る', () => {
    const s = setup({ preset: presets.calm }); drawCharge(s.frame(inputEnd + 2.5, 1 / 60));
    expect(arcRadii(s.log)).toHaveLength(0);
    expect(floorOf(s.glows)).toHaveLength(1);
  });
});
