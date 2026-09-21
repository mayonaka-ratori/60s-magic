import { BEATS } from '../src/game/rounds';
import { AIM } from '../src/game/guard';
import { describe, it, expect } from 'vitest';
import {
  ARRIVAL, BEAM_MOUTH, SWELL, alongOf, beamProfile, bodyPoint, bulletPalette, drawBody, drawRelease, drawTravel, hitDelay, launchOf, launchesOf, swellOf, swellProfile,
} from '../src/render/effects/release';
import { RELEASE_AT } from '../src/render/effects/screen';
import { presets, mixHue, type Palette } from '../src/render/effects/presets';
import { ParticlePool } from '../src/render/effects/particles';
import type { Frame, XY } from '../src/render/effects/frame';
import type { Point, Recipe } from '../src/game/types';

const recipe = (over: Partial<Recipe> = {}): Recipe => ({ version: 'recipe-1', element: 'fire', purpose: 'attack', form: 'orb', trajectory: 'straight', count: 1, explicitCount: null, defense: .3, area: .5, duration: .5, concentration: .5,
  enclosure: false, split: false, developsPrevious: null, motionSpeechAligned: null, noAttack: false, name: '', source: 'local', decisions: {}, assistance: [], model: null, ...over });

const origin = { x: 100, y: 500 }, target = { x: 700, y: 300 };
/** bodyPoint が見るぶんだけの仮の Frame。画面は1280×720。 */
const frame = (over: Partial<Recipe> = {}, more: Partial<Frame> = {}) => ({ recipe: recipe(over), origin, target, intensity: 1.5, beat: BEATS[0], w: 1280, h: 720, ...more }) as unknown as Frame;
/** 放出からの経過秒（drawTravel が渡す time）を、そのときの進み具合に直す。 */
const travelAt = (time: number) => time / ARRIVAL;
const distanceToTarget = (p: { x: number; y: number }) => Math.hypot(p.x - target.x, p.y - target.y);
/** 点 p から、a と b を結ぶ直線までの長さ。 */
const distanceToLine = (p: XY, a: XY, b: XY) => Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / Math.hypot(b.x - a.x, b.y - a.y);

/** 画面の真ん中に描いた術式の光点。中心と、左右上下の4点。 */
const center = { x: 640, y: 480 };
const spots: XY[] = [center, { x: 440, y: 480 }, { x: 640, y: 380 }, { x: 840, y: 480 }, { x: 640, y: 560 }];
const extent = { x: 440, y: 380, width: 400, height: 180 };
/** 光点つきの、画面の真ん中の術式。狙いは右上の騎士。 */
const spread = (over: Partial<Recipe> = {}, more: Partial<Frame> = {}) => frame(over, { origin: center, target: { x: 1000, y: 300 }, origins: spots, extent, ...more });

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
    expect(distanceToTarget(at(ARRIVAL))).toBeGreaterThan(1);
    // 膨らみの折り返し（道のりの6割）を過ぎたら、騎士までの長さはひたすら縮む。
    const delay = hitDelay(6, 7) / ARRIVAL;
    let before = Infinity;
    for (let u = SWELL.turn; u <= 1.0001; u += .05) { const now = distanceToTarget(bodyPoint(f, 6, u + delay, u)); expect(now).toBeLessThan(before); before = now; }
    // 命中の時刻を過ぎても、位置は騎士のところで止まる。
    expect(distanceToTarget(at(ARRIVAL + hitDelay(6, 7) + .3))).toBeLessThan(.001);
  });
  it('軌道が曲がる魔法でも、命中の時刻には騎士の位置へ収まる', () => {
    for (const trajectory of ['spiral', 'radial', 'orbit', 'homing'] as const) {
      const f = frame({ count: 8, trajectory });
      const time = ARRIVAL + hitDelay(7, 8);
      expect(distanceToTarget(bodyPoint(f, 7, travelAt(time), time))).toBeLessThan(.001);
      // 光点から出る連弾でも同じ。
      const g = spread({ count: 8, trajectory }), p = bodyPoint(g, 7, travelAt(time), time);
      expect(Math.hypot(p.x - g.target.x, p.y - g.target.y)).toBeLessThan(.001);
    }
  });
});

describe('弾の出どころ', () => {
  it('単発は中心から、光点が無ければ連弾も中心から出る', () => {
    expect(launchOf(spread(), 0, 1)).toBe(spots[0]);
    expect(launchOf(frame({ count: 3 }), 2, 3)).toEqual(origin);
    expect(launchesOf(frame({ count: 5 }))).toEqual([origin]);
  });
  it('連弾は光点の並びから均等に選び、1発ずつ別の光点から出る', () => {
    const f = spread({ count: 4 });
    const picked = [0, 1, 2, 3].map(i => launchOf(f, i, 4));
    // 中心は使わず、4つの光点を一つずつ。
    expect(new Set(picked).size).toBe(4);
    expect(picked.includes(center)).toBe(false);
    // 2発なら、4つの光点から一つおきに選ぶ。
    const two = [0, 1].map(i => launchOf(spread({ count: 2 }), i, 2));
    expect(two[0]).not.toBe(two[1]);
    expect(Math.abs(spots.indexOf(two[0]) - spots.indexOf(two[1]))).toBe(2);
    expect(launchesOf(f)).toHaveLength(4);
  });
  it('光点が弾の数より少なければ、中心も使って繰り返す', () => {
    const f = spread({ count: 7 });
    const picked = [...Array(7)].map((_, i) => launchOf(f, i, 7));
    expect(picked.includes(center)).toBe(true);
    // 5つの出どころを使い切り、6発目からは繰り返す。
    expect(new Set(picked).size).toBe(5);
    expect(picked[5]).toBe(picked[0]);
    expect(launchesOf(f)).toHaveLength(5);
  });
  it('同じ入力なら同じ選び方になる', () => {
    for (let i = 0; i < 6; i++) expect(launchOf(spread({ count: 6 }), i, 6)).toBe(launchOf(spread({ count: 6 }), i, 6));
    // 個数が変わると割り当ても変わってよいが、それぞれ決まった形。
    const three = [0, 1, 2].map(i => launchOf(spread({ count: 3 }), i, 3));
    expect(three).toEqual([0, 1, 2].map(i => launchOf(spread({ count: 3 }), i, 3)));
  });
});

describe('膨らんでから寄せる', () => {
  it('道のりの途中は直線から離れ、到着では狙いの一点に着く', () => {
    const f = spread({ count: 4 });
    for (let i = 0; i < 4; i++) {
      const a = launchOf(f, i, 4), delay = hitDelay(i, 4) / ARRIVAL, g = f.target;
      // 膨らみが最大の6割の地点では、まっすぐ同じだけ進んだ位置から画面の幅の15%以上離れ、直線そのものからも離れている。
      const mid = bodyPoint(f, i, SWELL.turn + delay, 1), straight = { x: a.x + (g.x - a.x) * SWELL.turn, y: a.y + (g.y - a.y) * SWELL.turn };
      expect(Math.hypot(mid.x - straight.x, mid.y - straight.y)).toBeGreaterThan(f.w * .15);
      expect(distanceToLine(mid, a, g)).toBeGreaterThan(40);
      // 到着では一点。
      const end = bodyPoint(f, i, 1 + delay, 1.5);
      expect(end.x).toBeCloseTo(g.x, 6); expect(end.y).toBeCloseTo(g.y, 6);
      // 出発は出どころ。
      const start = bodyPoint(f, i, delay, 0);
      expect(start.x).toBeCloseTo(a.x, 6); expect(start.y).toBeCloseTo(a.y, 6);
    }
    // 単発も同じように膨らむ。中心から出て、飛ぶ向きと直角に上へ。
    const single = spread(), a = launchOf(single, 0, 1), mid = bodyPoint(single, 0, SWELL.turn, 1);
    expect(distanceToLine(mid, a, single.target)).toBeGreaterThan(single.w * .15);
    expect(mid.y).toBeLessThan(a.y);
    expect(distanceToTarget(bodyPoint(frame(), 0, 1, 1.5))).toBeLessThan(.001);
  });
  it('騎士へ向かう向きには膨らまない。途中で届いてから戻る動きにしない', () => {
    // 中心から出る連弾（光点なし）は弾ごとの角度で散らすが、騎士の方を向く弾も横へ逃がす。
    for (const trajectory of ['straight', 'radial', 'orbit', 'homing'] as const) {
      const f = frame({ count: 8, trajectory });
      for (let i = 0; i < 8; i++) {
        const a = launchOf(f, i, 8), s = swellOf(f, i, 8, a), fl = Math.hypot(target.x - a.x, target.y - a.y);
        expect(s.dx * (target.x - a.x) / fl + s.dy * (target.y - a.y) / fl).toBeLessThanOrEqual(1e-9);
        // 折り返しの後は、騎士までの長さがひたすら縮む。
        const delay = hitDelay(i, 8) / ARRIVAL;
        let before = Infinity;
        for (let u = SWELL.turn; u <= 1.0001; u += .05) { const now = distanceToTarget(bodyPoint(f, i, u + delay, u)); expect(now).toBeLessThanOrEqual(before + 1e-9); before = now; }
      }
    }
  });
  it('出どころが左なら左へ、右なら右へ、上なら上へ膨らむ', () => {
    const f = spread({ count: 4 });
    const left = swellOf(f, 0, 4, spots[1]), up = swellOf(f, 0, 4, spots[2]), right = swellOf(f, 0, 4, spots[3]);
    // 騎士は右上にいる。右の光点は騎士の方を向く分を取り除くので、右下へ逃げる。
    expect(left.dx).toBeLessThan(-.99); expect(right.dx).toBeGreaterThan(.5); expect(up.dy).toBeLessThan(-.9);
    // 大きさは画面の幅の2〜3.5割に、範囲の横幅の分を足したもの。端に当たればそこまで。
    for (const s of [left, up, right]) {
      expect(s.amount).toBeGreaterThan(0);
      expect(s.amount).toBeLessThanOrEqual(f.w * SWELL.max + extent.width * SWELL.extent + 1e-9);
    }
    expect(left.amount).toBeGreaterThanOrEqual(f.w * SWELL.min);
    // 中心から出る単発は、飛ぶ向きと直角に上へ。
    const single = swellOf(spread(), 0, 1, center);
    expect(single.dy).toBeLessThan(0);
  });
  it('膨らんでも画面の外へは出ない', () => {
    /** 弾の道のり全部が画面の中にあるか。 */
    const inside = (f: Frame, count: number) => {
      for (let u = 0; u <= 1.0001; u += .02) for (let i = 0; i < count; i++) {
        const p = bodyPoint(f, i, u + hitDelay(i, count) / ARRIVAL, u);
        expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(f.w);
        expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(f.h);
      }
    };
    inside(spread({ count: 4 }), 4);
    // 画面の上端ぎりぎりに描いた術式。上の光点から上へ膨らんでも、余白の内側で止まる。
    const top = spread({ count: 2 }, { origins: [{ x: 640, y: 60 }, { x: 640, y: 40 }, { x: 640, y: 80 }], extent: { x: 630, y: 40, width: 20, height: 40 }, origin: { x: 640, y: 60 } });
    inside(top, 2);
    const s = swellOf(top, 0, 2, { x: 640, y: 40 });
    expect(s.dy).toBeLessThan(-.9);
    // 上へ膨らめる長さは余白までしかないので、画面の幅の2割より小さい。
    expect(s.amount).toBeLessThan(top.w * SWELL.min);
    for (let u = 0; u <= 1.0001; u += .02) expect(bodyPoint(top, 0, u, u).y).toBeGreaterThanOrEqual(SWELL.margin - 1);
  });
  it('前半で外へ出きり、後半で一気に戻る。進みは後半ほど速い', () => {
    expect(swellProfile(0)).toBe(0); expect(swellProfile(1)).toBe(0);
    expect(swellProfile(SWELL.turn)).toBeCloseTo(1, 6);
    let before = 0;
    for (let u = .05; u <= SWELL.turn; u += .05) { const now = swellProfile(u); expect(now).toBeGreaterThanOrEqual(before); before = now; }
    for (let u = SWELL.turn; u <= 1; u += .05) { const now = swellProfile(u); expect(now).toBeLessThanOrEqual(before + 1e-9); before = now; }
    // 最後の1割で戻る量は、折り返しの直後の1割より大きい。
    expect(swellProfile(.9) - swellProfile(1)).toBeGreaterThan(swellProfile(.6) - swellProfile(.7));
    // まっすぐ進む分は、前半より後半の方が多い。
    expect(alongOf(0)).toBe(0); expect(alongOf(1)).toBeCloseTo(1, 9);
    expect(alongOf(1) - alongOf(.5)).toBeGreaterThan(alongOf(.5) - alongOf(0));
  });
  it('尾のための過去の位置は、同じ進み具合と時刻なら同じ値になる', () => {
    const f = spread({ count: 3, trajectory: 'orbit' });
    const a = bodyPoint(f, 1, .4, .6), b = bodyPoint(f, 1, .4, .6);
    expect(a).toEqual(b);
  });
});

describe('光線の幅', () => {
  it('口の幅は術式の範囲の横幅の6割で、騎士のところで今までの太さになる', () => {
    const f = spread({ form: 'beam' }), prof = beamProfile(f);
    expect(prof.mouth).toBeCloseTo(extent.width * BEAM_MOUTH, 6);
    expect(prof.at(0)).toBeCloseTo(prof.mouth, 6);
    // 先端は (5 + 派手さ×3) × (0.7 + 収束×0.6)。派手さ1.5、収束0.5なら9.5。
    expect(prof.tip).toBeCloseTo(9.5, 6);
    expect(prof.at(1)).toBeCloseTo(prof.tip, 6);
    // 範囲が広いほど口も広い。
    const wide = beamProfile(spread({ form: 'beam' }, { extent: { ...extent, width: 800 } }));
    expect(wide.mouth).toBeCloseTo(480, 6);
    expect(wide.mouth).toBeGreaterThan(prof.mouth);
    // 途中は口と先端の間で、先へ行くほど細い。
    let before = prof.mouth;
    for (let u = .1; u <= 1; u += .1) { const now = prof.at(u); expect(now).toBeLessThan(before); before = now; }
  });
  it('収束が高いほど早く細く絞る。連弾の光線は本数で口を分け合う', () => {
    const loose = beamProfile(spread({ form: 'beam', concentration: 0 })), tight = beamProfile(spread({ form: 'beam', concentration: 1 }));
    expect(tight.at(.5) / tight.mouth).toBeLessThan(loose.at(.5) / loose.mouth);
    const three = beamProfile(spread({ form: 'beam', count: 3 }));
    expect(three.mouth).toBeCloseTo(extent.width * BEAM_MOUTH / 3, 6);
  });
  it('範囲が無ければ、中心のまわりの小さな箱の横幅から決まる', () => {
    expect(beamProfile(frame({ form: 'beam' })).mouth).toBeCloseTo(120 * BEAM_MOUTH, 6);
  });
});

type Call = { name: string; args: number[]; strokeStyle: string; fillStyle: string };
/** 描く命令を控えておく仮のcanvas。使った色と線の位置を後から確かめられる。 */
function recorder() {
  const calls: Call[] = [];
  const held: Record<string, unknown> = { strokeStyle: '', fillStyle: '', lineWidth: 0, globalAlpha: 1, globalCompositeOperation: 'lighter' };
  const fake: unknown = new Proxy(held, {
    get: (target, key: string) => key in target ? target[key] : (...args: number[]) => {
      calls.push({ name: key, args, strokeStyle: String(target.strokeStyle), fillStyle: String(target.fillStyle) });
      return fake;
    },
    set: (target, key: string, value) => { target[key] = value; return true; },
  });
  return { c: fake as CanvasRenderingContext2D, calls };
}

/** 光の粒の描画を控えておく仮の絵。置かれた場所と大きさと色を見る。 */
function glowRecorder() {
  const glows: { x: number; y: number; r: number; main: string }[] = [];
  const sprites = { draw: (_c: CanvasRenderingContext2D, x: number, y: number, r: number, _core: string, main: string) => { glows.push({ x, y, r, main }); } } as unknown as Frame['sprites'];
  return { sprites, glows };
}
const noGlow = { draw: () => {} } as unknown as Frame['sprites'];

/** 放出と本体の部品を呼ぶための仮の Frame。光の絵は描かず、線の色と位置だけを見る。 */
function scene(c: CanvasRenderingContext2D, over: Partial<Recipe>, accent: Palette | null, t: number, sprites: Frame['sprites'] = noGlow, more: Partial<Frame> = {}): Frame {
  const r = recipe(over), pool = new ParticlePool(600); pool.reseed(7);
  return { c, w: 1280, h: 720, t, dt: .016,
    sprites, pool,
    preset: presets.vivid, palette: presets.vivid.palettes[r.element], intensity: 1.5,
    recipe: r, locked: true, origin, target,
    accent, live: { words: [], amount: 0, voice: 0, rings: 0 }, points: [], cursors: [], beat: BEATS[0], guard: null, aim: AIM, inherited: [], calm: false,
    once: (_key, run) => run(), ...more };
}
/** 光点つきの、画面の真ん中の術式を持つ仮の Frame。 */
const spreadScene = (c: CanvasRenderingContext2D, over: Partial<Recipe>, accent: Palette | null, t: number, sprites: Frame['sprites'] = noGlow) =>
  scene(c, over, accent, t, sprites, { origin: center, target: { x: 1000, y: 300 }, origins: spots, extent });

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

describe('二属性の連弾は左右で分かれる', () => {
  const fire = presets.vivid.palettes.fire, lightning = presets.vivid.palettes.lightning;
  it('範囲の中心より左の出どころは主属性、右は二属性目の色', () => {
    const f = spread({ count: 4, accent: 'lightning', blend: 'sustain' }, { accent: lightning, palette: fire });
    expect(bulletPalette(f, spots[1])).toBe(fire);
    expect(bulletPalette(f, spots[3])).toBe(lightning);
    // ちょうど中心と上下は主属性。
    expect(bulletPalette(f, center)).toBe(fire);
    expect(bulletPalette(f, spots[2])).toBe(fire);
    // 単発と一属性は主属性のまま。
    expect(bulletPalette(spread({ count: 1, accent: 'lightning' }, { accent: lightning, palette: fire }), spots[3])).toBe(fire);
    expect(bulletPalette(spread({ count: 4 }, { accent: null, palette: fire }), spots[3])).toBe(fire);
  });
  it('飛んでいる弾は、画面の左が主属性の色、右が二属性目の色で描かれる', () => {
    const { c } = recorder(), { sprites, glows } = glowRecorder();
    // 光点は左右の2つだけ。2連弾がそれぞれから出る。
    const f = scene(c, { element: 'fire', accent: 'lightning', blend: 'sustain', count: 2 }, lightning, RELEASE_AT + .5, sprites, { origin: center, target: { x: 1000, y: 300 }, origins: [center, spots[1], spots[3]], extent });
    drawTravel(f);
    const fires = glows.filter(g => g.main === fire.main), bolts = glows.filter(g => g.main === lightning.main);
    expect(fires.length).toBeGreaterThan(0); expect(bolts.length).toBeGreaterThan(0);
    // 左の光点（x=440）から出た弾は中心（x=640）より左に、右の光点（x=840）から出た弾は右にいる。
    for (const g of fires) expect(g.x).toBeLessThan(center.x);
    for (const g of bolts) expect(g.x).toBeGreaterThan(center.x);
  });
  it('放出の破裂も出どころごとに、その側の色で出る', () => {
    const { c, calls } = recorder();
    drawRelease(spreadScene(c, { element: 'fire', accent: 'lightning', blend: 'sustain', count: 4 }, lightning, RELEASE_AT + .1));
    // 衝撃波の輪（ellipse）は、出どころごとに出る。左の輪は炎、右の輪は雷。
    const rings = calls.filter(k => k.name === 'ellipse');
    const at = (x: number) => rings.filter(r => r.args[0] === x);
    expect(at(spots[1].x).length).toBeGreaterThan(0); expect(at(spots[3].x).length).toBeGreaterThan(0);
    const strokeAfter = (r: Call) => calls[calls.indexOf(r) + 1];
    expect(new Set(at(spots[1].x).map(r => strokeAfter(r).strokeStyle))).toEqual(new Set([fire.main, fire.core]));
    expect(new Set(at(spots[3].x).map(r => strokeAfter(r).strokeStyle))).toEqual(new Set([lightning.main, lightning.core]));
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
  it('帯は口の広い台形で、光点ごとに出て全部騎士へ収束する', () => {
    const { c, calls } = recorder();
    drawTravel(spreadScene(c, { form: 'beam', count: 2 }, null, RELEASE_AT + 1));
    // 面は fill で描かれ、道の始まり（moveTo）は光点の脇。
    const starts = calls.filter(k => k.name === 'moveTo');
    expect(calls.filter(k => k.name === 'fill').length).toBeGreaterThanOrEqual(10);
    const f = spread({ form: 'beam', count: 2 }), prof = beamProfile(f);
    for (let i = 0; i < 2; i++) {
      const a = launchOf(f, i, 2), near = starts.filter(s => Math.hypot(s.args[0] - a.x, s.args[1] - a.y) < prof.mouth * 2.6);
      expect(near.length).toBeGreaterThan(0);
      // 一番外の層は口の幅の2.6倍の半分だけ脇にずれる。
      expect(Math.max(...near.map(s => Math.hypot(s.args[0] - a.x, s.args[1] - a.y)))).toBeGreaterThan(prof.mouth * .5);
    }
    // 先端の光（半径 9 + 派手さ×3）は騎士の位置。
    const { sprites, glows } = glowRecorder();
    drawTravel(spreadScene(recorder().c, { form: 'beam', count: 2 }, null, RELEASE_AT + 1, sprites));
    const tips = glows.filter(g => g.r === 9 + 1.5 * 3);
    expect(tips).toHaveLength(2);
    for (const g of tips) { expect(g.x).toBe(1000); expect(g.y).toBe(300); }
  });
});

describe('面は描いた形のまま', () => {
  /** 画面の左下に描いた、四角い術式の点列（正規化）。 */
  const square: Point[] = [[.2, .5], [.4, .5], [.4, .8], [.2, .8]].map(([x, y], i) => ({ x, y, t: i * 20, hand: 0, stroke: 0 }));
  const pixels = (points: Point[]) => points.map(p => ({ x: p.x * 1280, y: p.y * 720 }));
  const box = { x: 256, y: 360, width: 256, height: 216 };
  it('壁は点列の輪郭を面にし、放出の直後は描いた場所にある', () => {
    const { c, calls } = recorder();
    drawTravel(scene(c, { form: 'wall', purpose: 'attack' }, null, RELEASE_AT + .01, noGlow, { points: square, origin: { x: 384, y: 468 }, origins: [{ x: 384, y: 468 }, ...pixels(square)], extent: box }));
    const corners = calls.filter(k => k.name === 'moveTo' || k.name === 'lineTo').slice(0, 4);
    // 4つの角がほぼ描いた場所（進み具合0なら縮めない）。脈打ちの分だけ数画素ずれる。
    pixels(square).forEach((q, i) => { expect(corners[i].args[0]).toBeCloseTo(q.x, -1); expect(corners[i].args[1]).toBeCloseTo(q.y, -1); });
    expect(calls.some(k => k.name === 'fill')).toBe(true);
    // 格子は輪郭の中だけに切り抜く。
    expect(calls.some(k => k.name === 'clip')).toBe(true);
  });
  it('点が無ければ今までどおりの四角', () => {
    const { c, calls } = recorder();
    drawTravel(scene(c, { form: 'wall', purpose: 'attack' }, null, RELEASE_AT + .01));
    expect(calls.some(k => k.name === 'clip')).toBe(false);
    expect(calls.filter(k => k.name === 'lineTo').length).toBeGreaterThanOrEqual(3);
  });
  it('結界は範囲に外接する楕円、波は範囲の横幅いっぱいの帯', () => {
    const { c, calls } = recorder();
    drawTravel(scene(c, { form: 'dome', purpose: 'attack' }, null, RELEASE_AT + .01, noGlow, { points: square, extent: box, origin: { x: 384, y: 468 } }));
    const dome = calls.find(k => k.name === 'ellipse')!;
    expect(dome.args[2]).toBeGreaterThanOrEqual(box.width / 2 * Math.SQRT2 * .95);
    expect(dome.args[3]).toBeGreaterThanOrEqual(box.height / 2 * Math.SQRT2 * .95);
    const wave = recorder();
    drawTravel(scene(wave.c, { form: 'wave', purpose: 'attack' }, null, RELEASE_AT + .01, noGlow, { points: square, extent: box, origin: { x: 384, y: 468 } }));
    const first = wave.calls.find(k => k.name === 'moveTo')!, curve = wave.calls.find(k => k.name === 'quadraticCurveTo')!;
    // 帯の左端から右端までが、範囲の横幅。
    expect(curve.args[2] - first.args[0]).toBeCloseTo(box.width, -1);
  });
});
