import { describe, it, expect } from 'vitest';
import { ARRIVAL, bodyPoint, drawBody, drawRelease, drawTravel, hitDelay } from '../src/render/effects/release';
import { RELEASE_AT } from '../src/render/effects/screen';
import { presets, mixHue, type Palette } from '../src/render/effects/presets';
import { ParticlePool } from '../src/render/effects/particles';
import type { Frame } from '../src/render/effects/frame';
import type { Recipe } from '../src/game/types';

const recipe = (over: Partial<Recipe> = {}): Recipe => ({ version: 'recipe-1', element: 'fire', purpose: 'attack', form: 'orb', trajectory: 'straight', count: 1, explicitCount: null, defense: .3, area: .5, duration: .5, concentration: .5,
  enclosure: false, split: false, developsPrevious: null, motionSpeechAligned: null, noAttack: false, name: '', source: 'local', decisions: {}, assistance: [], model: null, ...over });

const origin = { x: 100, y: 500 }, target = { x: 700, y: 300 };
/** bodyPoint が見るぶんだけの仮の Frame。 */
const frame = (over: Partial<Recipe> = {}) => ({ recipe: recipe(over), origin, target, intensity: 1.5 }) as unknown as Frame;
/** 放出からの経過秒（drawTravel が渡す time）を、そのときの進み具合に直す。 */
const travelAt = (time: number) => time / ARRIVAL;
const distanceToTarget = (p: { x: number; y: number }) => Math.hypot(p.x - target.x, p.y - target.y);

describe('連弾の到達', () => {
  it('7連弾は最後の弾も命中の時刻に騎士の位置へ届く', () => {
    const f = frame({ count: 7 });
    for (let i = 0; i < 7; i++) {
      const time = ARRIVAL + hitDelay(i, 7);
      const p = bodyPoint(f, i, travelAt(time), time);
      expect(distanceToTarget(p)).toBeLessThan(.001);
    }
    // 最後の1発は19.18秒（18.5 + 0.08×6 + 0.2）に届く。
    expect(RELEASE_AT + ARRIVAL + hitDelay(6, 7)).toBeCloseTo(19.18);
  });
  it('1発目も18.5秒ちょうどに騎士の位置へ届く', () => {
    const single = frame(), time = ARRIVAL;
    expect(distanceToTarget(bodyPoint(single, 0, travelAt(time), time))).toBeLessThan(.001);
    const many = frame({ count: 7 });
    expect(distanceToTarget(bodyPoint(many, 0, travelAt(time), time))).toBeLessThan(.001);
  });
  it('遅れて届く弾は、自分の命中の時刻まで進み続ける', () => {
    const f = frame({ count: 7 });
    const at = (time: number) => bodyPoint(f, 6, travelAt(time), time);
    // 1発目が届く18.5秒の時点では、最後の弾はまだ途中にいる。
    const half = distanceToTarget(at(ARRIVAL));
    expect(half).toBeGreaterThan(1);
    expect(distanceToTarget(at(ARRIVAL + .1))).toBeLessThan(half);
    expect(distanceToTarget(at(ARRIVAL + .2))).toBeLessThan(distanceToTarget(at(ARRIVAL + .1)));
    // 命中の時刻を過ぎても、位置は騎士のところで止まる。
    expect(distanceToTarget(at(ARRIVAL + hitDelay(6, 7) + .3))).toBeLessThan(.001);
  });
  it('軌道が曲がる魔法でも、命中の時刻には騎士の位置へ収まる', () => {
    for (const trajectory of ['spiral', 'radial', 'orbit', 'homing'] as const) {
      const f = frame({ count: 8, trajectory });
      const time = ARRIVAL + hitDelay(7, 8);
      expect(distanceToTarget(bodyPoint(f, 7, travelAt(time), time))).toBeLessThan(.001);
    }
  });
});

type Call = { name: string; args: number[]; strokeStyle: string };
/** 描く命令を控えておく仮のcanvas。使った色と線の位置を後から確かめられる。 */
function recorder() {
  const calls: Call[] = [];
  const held: Record<string, unknown> = { strokeStyle: '', fillStyle: '', lineWidth: 0, globalAlpha: 1, globalCompositeOperation: 'lighter' };
  const fake: unknown = new Proxy(held, {
    get: (target, key: string) => key in target ? target[key] : (...args: number[]) => {
      calls.push({ name: key, args, strokeStyle: String(target.strokeStyle) });
      return fake;
    },
    set: (target, key: string, value) => { target[key] = value; return true; },
  });
  return { c: fake as CanvasRenderingContext2D, calls };
}

/** 光の粒の描画を控えておく仮の絵。置かれた場所と大きさだけを見る。 */
function glowRecorder() {
  const glows: { x: number; y: number; r: number }[] = [];
  const sprites = { draw: (_c: CanvasRenderingContext2D, x: number, y: number, r: number) => { glows.push({ x, y, r }); } } as unknown as Frame['sprites'];
  return { sprites, glows };
}
const noGlow = { draw: () => {} } as unknown as Frame['sprites'];

/** 放出と本体の部品を呼ぶための仮の Frame。光の絵は描かず、線の色と位置だけを見る。 */
function scene(c: CanvasRenderingContext2D, over: Partial<Recipe>, accent: Palette | null, t: number, sprites: Frame['sprites'] = noGlow): Frame {
  const r = recipe(over), pool = new ParticlePool(600); pool.reseed(7);
  return { c, w: 1280, h: 720, t, dt: .016,
    sprites, pool,
    preset: presets.vivid, palette: presets.vivid.palettes[r.element], intensity: 1.5,
    recipe: r, locked: true, origin, target,
    accent, live: { words: [], amount: 0, voice: 0 }, points: [], cursors: [], calm: false,
    once: (_key, run) => run() };
}

describe('二属性の色', () => {
  /** 放出のひとコマで使われた線の色を集める。 */
  const colorsOf = (over: Partial<Recipe>, accent: Palette | null) => {
    const { c, calls } = recorder();
    drawRelease(scene(c, over, accent, RELEASE_AT + .1));
    return new Set(calls.filter(k => k.name === 'stroke').map(k => k.strokeStyle));
  };
  it('持続型は、衝撃波の輪と放射状の線にも二色目が出る', () => {
    const ice = presets.vivid.palettes.ice, wind = presets.vivid.palettes.wind;
    const both = colorsOf({ element: 'ice', accent: 'wind' }, wind);
    expect(both.has(wind.main)).toBe(true);
    expect(both.has(ice.main)).toBe(true);
    // 属性が一つだけなら、二色目の色はどこにも出ない。
    const alone = colorsOf({ element: 'ice' }, null);
    expect(alone.has(wind.main)).toBe(false);
    expect(alone.has(ice.main)).toBe(true);
    expect(alone.has(ice.core)).toBe(true);
  });
  it('爆発型は、放射状の線が二色の中間色になる', () => {
    const fire = presets.vivid.palettes.fire, lightning = presets.vivid.palettes.lightning;
    const mid = mixHue(fire.main, lightning.main);
    expect(colorsOf({ element: 'fire', accent: 'lightning' }, lightning).has(mid)).toBe(true);
    expect(colorsOf({ element: 'fire' }, null).has(mid)).toBe(false);
  });
});

describe('雷の本体の形', () => {
  /** 雷の折れ線の、横に振れた位置を並べて返す。 */
  const boltShape = (index: number, time: number) => {
    const { c, calls } = recorder();
    drawBody(scene(c, { element: 'lightning' }, null, RELEASE_AT + time), 100, 100, 10, 'lightning', 1, time, index);
    return calls.filter(k => k.name === 'lineTo').map(k => k.args[0]);
  };
  it('弾の番号と描き替えの段が違えば、形も違う', () => {
    // 描き替えは毎秒24回。1秒は24段目、1.05秒は25段目、1.02秒は同じ24段目。
    expect(boltShape(0, 1)).not.toEqual(boltShape(1, 1));
    expect(boltShape(0, 1)).not.toEqual(boltShape(0, 1.05));
    // 番号と段を足していたころは、2発目の形が次の段の1発目と同じになっていた。
    expect(boltShape(1, 1)).not.toEqual(boltShape(0, 1.05));
    // 同じ弾の同じ段なら、形は変わらない。
    expect(boltShape(2, 1)).toEqual(boltShape(2, 1.02));
  });
});

describe('光線の粒', () => {
  it('弾が違えば、帯を流れる粒の位置も重ならない', () => {
    const { c } = recorder(), { sprites, glows } = glowRecorder();
    drawTravel(scene(c, { form: 'beam', count: 2 }, null, RELEASE_AT + .5, sprites));
    // 帯に沿って流れる粒（半径2）の縦の位置は、流れる位置だけで決まる。
    const flow = glows.filter(g => g.r === 2).map(g => g.y);
    expect(flow.length).toBeGreaterThan(20);
    // 番号を足していたころは、2発目の先頭の粒が1発目の後ろの粒と同じ位置に重なっていた。
    expect(new Set(flow).size).toBe(flow.length);
  });
});
