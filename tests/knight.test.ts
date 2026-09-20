import { describe, it, expect } from 'vitest';
import { knightPose, guardPose, GUARD_FROM, reactionPower, knightTransform, knightMatrix, knightPoint,
  FINISH_DROPS, droppedAt, debrisMotion, coreBlink, FINISH_THROWS, FALL_TURN, FALL_NEAR } from '../src/render/knight';
import { getPreset } from '../src/render/effects/presets';
import type { Recipe } from '../src/game/types';

const recipe = (over: Partial<Recipe>): Recipe => ({ version: 'recipe-1', accent: null, element: 'fire', purpose: 'attack', form: 'orb',
  trajectory: 'straight', count: 1, explicitCount: null, defense: .2, area: .2, duration: .5, concentration: 0,
  enclosure: false, split: false, developsPrevious: null, motionSpeechAligned: null, noAttack: false, name: '', source: 'local',
  decisions: {}, assistance: [], model: null, ...over });

describe('反応の強さ', () => {
  it('個数と範囲と収束が大きいほど強くなる', () => {
    const weak = reactionPower(recipe({}));
    const strong = reactionPower(recipe({ count: 7, area: 1, concentration: 1 }));
    expect(weak).toBeLessThan(.3);
    expect(strong).toBeGreaterThan(.9);
    expect(reactionPower(null)).toBeGreaterThan(0);
  });
  it('同じ魔法でも入力の量が多いほど反応が強い', () => {
    const quiet = reactionPower(recipe({}));
    const busy = reactionPower(recipe({}), 1);
    expect(busy).toBeGreaterThan(quiet);
    expect(busy - quiet).toBeCloseTo(.3, 2);
    expect(reactionPower(recipe({}), 0)).toBe(quiet);
    expect(reactionPower(null, 1)).toBeGreaterThan(reactionPower(null));
    // 0〜1の範囲は超えない。
    expect(reactionPower(recipe({ count: 7, area: 1, concentration: 1 }), 1)).toBeLessThanOrEqual(1);
  });
  it('弱いと怯むだけ、強いと大きく崩れて戻りも遅い', () => {
    const weak = knightPose(18600, true, false, 'attack', .1);
    const strong = knightPose(18600, true, false, 'attack', 1);
    expect(weak.collapse).toBe(0);
    expect(strong.collapse).toBeGreaterThan(0);
    expect(strong.spin).toBeGreaterThan(weak.spin);
    // 強いほど戻りが遅い。
    expect(knightPose(19100, true, false, 'attack', 1).push).toBeGreaterThan(knightPose(19100, true, false, 'attack', .1).push);
    // 沈み込みは0.6秒あたりが底で、1.8秒で戻り切る。
    expect(knightPose(19100, true, false, 'attack', 1).collapse).toBeGreaterThan(.9);
    expect(knightPose(20400, true, false, 'attack', 1).collapse).toBeCloseTo(0, 2);
  });
  it('拘束と強化では反応が小さい', () => {
    expect(knightPose(18600, true, false, 'bind', 1).spin).toBeLessThan(knightPose(18600, true, false, 'attack', 1).spin);
    expect(knightPose(18600, true, false, 'enhance', 1).collapse).toBe(0);
  });
  it('白飛びは白、属性色、白の三段で0.15秒', () => {
    expect(knightPose(18520, true).flashTint).toBe(0);
    expect(knightPose(18570, true).flashTint).toBe(1);
    expect(knightPose(18620, true).flashTint).toBe(0);
    expect(knightPose(18620, true).flashAlpha).toBeGreaterThan(0);
    expect(knightPose(18660, true).flashAlpha).toBe(0);
    expect(knightPose(18490, true).flashAlpha).toBe(0);
  });
  it('残像は0.3秒、輪郭の光は0.6秒で消える', () => {
    expect(knightPose(18700, true).ghost).toBeGreaterThan(0);
    expect(knightPose(18810, true).ghost).toBe(0);
    expect(knightPose(19000, true).rim).toBeGreaterThan(0);
    expect(knightPose(19110, true).rim).toBe(0);
  });
  it('控えめモードでは白飛びが出ず、残像と輪郭の光は3分の1になる', () => {
    for (const ms of [18510, 18560, 18610, 18640]) {
      expect(knightPose(ms, true, false, 'attack', 1, true).flashAlpha).toBe(0);
      expect(knightPose(ms, true, false, 'attack', 1).flashAlpha).toBeGreaterThan(0);
    }
    const calm = knightPose(18700, true, false, 'attack', 1, true);
    const loud = knightPose(18700, true, false, 'attack', 1);
    expect(calm.ghost).toBeCloseTo(loud.ghost / 3, 5);
    expect(knightPose(19000, true, false, 'attack', 1, true).rim).toBeCloseTo(knightPose(19000, true, false, 'attack', 1).rim / 3, 5);
    // 控えめでないときの見た目は変えない。
    expect(loud.ghost).toBeGreaterThan(0);
  });
  it('動きを減らす設定では回転も移動も0にする', () => {
    const quiet = knightPose(18600, true, true, 'attack', 1);
    expect(quiet.spin).toBe(0); expect(quiet.push).toBe(0); expect(quiet.collapse).toBe(0);
  });
  it('見た目の設定が派手なほど強く崩れる', () => {
    const r = recipe({ count: 3 });
    const calm = reactionPower(r, 0, getPreset('calm'));
    const vivid = reactionPower(r, 0, getPreset('vivid'));
    const max = reactionPower(r, 0, getPreset('max'));
    expect(max).toBeGreaterThan(vivid);
    expect(vivid).toBeGreaterThan(calm);
    // 入力の量が多いときも同じ関係。
    expect(reactionPower(r, 1, getPreset('max'))).toBeGreaterThan(reactionPower(r, 1, getPreset('vivid')));
    expect(reactionPower(null, 0, getPreset('max'))).toBeGreaterThan(reactionPower(null, 0, getPreset('vivid')));
    // 設定を渡さないときは今まで通り「派手」。
    expect(reactionPower(r)).toBe(vivid);
  });
});

describe('騎士の置き方', () => {
  // 幅1000、高さ800の面に、画面1pxあたり2点で描く場合。
  const place = (pose: ReturnType<typeof knightPose>) => knightTransform(pose, 1000, 800, 2);
  it('描く絵と命中の位置は同じ計算から出る', () => {
    const t = place(knightPose(18600, true, false, 'attack', 1));
    // 絵は knightMatrix の行列で置く。命中の位置は同じ行列を点へ当てた結果になる。
    const m = knightMatrix(t), p = knightPoint(t, 300, 240);
    expect(p.x).toBeCloseTo(m.a * 300 + m.c * 240 + m.e, 10);
    expect(p.y).toBeCloseTo(m.b * 300 + m.d * 240 + m.f, 10);
  });
  it('命中の前は動かさず、足元は画面の高さの71.4%', () => {
    const t = place(knightPose(18000, true, false, 'attack', 1));
    expect(t.x).toBe(0); expect(t.y).toBe(0); expect(t.scale).toBe(1); expect(t.rot).toBe(0);
    expect(t.footX).toBe(500); expect(t.footY).toBeCloseTo(571.2, 10);
    const p = knightPoint(t, 480, 300);
    expect(p.x).toBeCloseTo(480, 10); expect(p.y).toBeCloseTo(300, 10);
  });
  it('命中の0.1秒後は上へ押されて縮み、右へ回る', () => {
    const t = place(knightPose(18600, true, false, 'attack', 1));
    expect(t.y).toBeCloseTo(-14.6667, 3);
    expect(t.scale).toBeCloseTo(.976296, 6);
    expect(t.rot).toBeCloseTo(.056109, 6);
    // 胸のあたりの点は上へ動き、回る分だけ右へずれる。
    const p = knightPoint(t, 500, 300);
    expect(p.y).toBeLessThan(300);
    expect(p.x).toBeGreaterThan(500);
  });
  it('動きを減らす設定では置き方も動かない', () => {
    const t = place(knightPose(18600, true, true, 'attack', 1));
    expect(t.y).toBe(0); expect(t.scale).toBe(1); expect(t.rot).toBe(0);
  });
});

/**
 * とどめの回（40〜60秒）の崩れ落ち。時刻から姿勢と脱落を出す計算だけを試す。
 * ここで見る時刻はすべて世界の時刻で、騎士の render に来るミリ秒と同じもの。
 */
describe('とどめの崩れ落ち', () => {
  const at = (t: number) => guardPose(t * 1000, false, 'block');
  it('40秒から55.4秒までは前屈のまま', () => {
    for (const t of [40, 44, 49, 52, 53.6, 54.5, 55.39]) {
      const pose = at(t);
      expect(pose.weights[7]).toBeCloseTo(1, 6);
      expect(pose.weights[8]).toBe(0);
      expect(pose.fall).toBe(0);
      expect(pose.state).toBe('exposed');
    }
  });
  it('55.4秒から膝をつき、56.2秒でつききる', () => {
    expect(at(55.4).weights[8]).toBeCloseTo(0, 6);
    const half = at(55.8);
    expect(half.weights[8]).toBeGreaterThan(.2);
    expect(half.weights[8]).toBeLessThan(.8);
    expect(half.weights[7]).toBeCloseTo(1 - half.weights[8], 10);
    expect(at(56.2).weights[8]).toBeCloseTo(1, 6);
    expect(at(55.8).state).toBe('collapse');
  });
  it('56.2秒から56.9秒で手前へ倒れる', () => {
    expect(at(56.19).fall).toBe(0);
    expect(at(56.55).fall).toBeGreaterThan(.4);
    expect(at(56.55).fall).toBeLessThan(.6);
    expect(at(56.9).fall).toBe(1);
    // 倒れる途中は増えるだけで戻らない。
    for (let t = 56.2; t < 56.9; t += .02) expect(at(t + .02).fall).toBeGreaterThanOrEqual(at(t).fall);
  });
  it('56.9秒から後は何も動かない', () => {
    const down = at(56.9);
    expect(down.state).toBe('down');
    // 呼吸の揺れも止める。
    expect(down.breath).toBe(0);
    for (const t of [57, 58.4, 59.25, 60]) {
      expect(at(t)).toEqual(down);
      expect(at(t).state).toBe('down');
    }
  });
  it('控えめモードでも崩れ落ちは残す', () => {
    const quiet = guardPose(56.55 * 1000, true, 'block'), loud = at(56.55);
    expect(quiet.fall).toBe(loud.fall);
    expect(quiet.weights).toEqual(loud.weights);
    expect(quiet.state).toBe(loud.state);
  });
});

describe('とどめの部品の脱落', () => {
  it('落ちる時刻は多段命中の一覧から作る', () => {
    const map = Object.fromEntries(FINISH_DROPS.map(drop => [drop.key, drop.at]));
    expect(map.shoulderSpike).toBeCloseTo(53.6, 6);
    expect(map.shield).toBeCloseTo(53.76, 6);
    expect(map.horn).toBeCloseTo(53.92, 6);
    expect(map.chestPlate).toBeCloseTo(54.1, 6);
    expect(map.core).toBeCloseTo(54.8, 6);
    expect(map.sword).toBeCloseTo(54.925, 6);
    // 時刻は前から順に進む。
    for (let i = 1; i < FINISH_DROPS.length; i++) expect(FINISH_DROPS[i].at).toBeGreaterThan(FINISH_DROPS[i - 1].at);
  });
  it('53.6秒で肩の棘が落ち、54.925秒で剣が落ちる', () => {
    expect(droppedAt(53.59)).toEqual([]);
    expect(droppedAt(53.6)).toEqual(['shoulderSpike']);
    expect(droppedAt(54.11)).toEqual(['shoulderSpike', 'shield', 'horn', 'chestPlate']);
    expect(droppedAt(54.9)).not.toContain('sword');
    expect(droppedAt(54.925)).toContain('sword');
    expect(droppedAt(60)).toHaveLength(6);
  });
  it('落ちた部品は床で1回跳ねて止まる', () => {
    const v = { vx: .8, vy: 1.4, vz: -1.2, spin: 5 };
    const trace = [];
    for (let dt = 0; dt <= 4; dt += .02) trace.push(debrisMotion(dt, 2, v));
    // 床より下へは行かない。
    for (const step of trace) expect(step.y).toBeGreaterThanOrEqual(0);
    // 一度上がってから落ち、跳ねてまた上がり、最後は止まる。
    expect(Math.max(...trace.map(s => s.y))).toBeGreaterThan(2);
    const last = trace.at(-1)!;
    expect(last.y).toBe(0);
    expect(last.resting).toBe(true);
    // 止まった後は動かない。
    expect(debrisMotion(9, 2, v)).toEqual(last);
    // 高さ0から落ちても床より下へ行かない。
    expect(debrisMotion(1, 0, { vx: 0, vy: 0, vz: 0, spin: 0 }).y).toBe(0);
  });
});

describe('とどめの核の明滅', () => {
  it('40〜44秒は2秒に1回、44〜49秒は1秒に1回', () => {
    expect(coreBlink(39.9)).toBe(0);
    // 2秒に1回。40秒で中ほど、40.5秒で最大、41.5秒で最小。
    expect(coreBlink(40)).toBeCloseTo(.5, 6);
    expect(coreBlink(40.5)).toBeCloseTo(1, 6);
    expect(coreBlink(41.5)).toBeCloseTo(0, 6);
    expect(coreBlink(42.5)).toBeCloseTo(1, 6);
    // 1秒に1回へ速まる。
    expect(coreBlink(44.25)).toBeCloseTo(1, 6);
    expect(coreBlink(44.75)).toBeCloseTo(0, 6);
    expect(coreBlink(45.25)).toBeCloseTo(1, 6);
  });
  it('50.6秒から51.6秒で最大の明るさになり、そのまま保つ', () => {
    for (const t of [51.6, 52.5, 53.6, 54.5, 60]) expect(coreBlink(t)).toBeCloseTo(1, 6);
    // 途中は上がっていくだけ。
    for (let t = 50.6; t < 51.6; t += .05) expect(coreBlink(t + .05)).toBeGreaterThanOrEqual(coreBlink(t) - 1e-9);
  });
  it('0〜1の間に収まる', () => {
    for (let t = 39; t <= 60; t += .05) {
      expect(coreBlink(t)).toBeGreaterThanOrEqual(0);
      expect(coreBlink(t)).toBeLessThanOrEqual(1);
    }
  });
});

/**
 * 一回目と防御の姿勢を変えていないことの確かめ。
 * 0〜40秒を0.1秒刻みで全部並べた値から、決まった手順で一つの数を作って固定しておく。
 * とどめを足す前に同じ手順で出した数と同じになる。
 */
describe('一回目と防御の姿勢は変わらない', () => {
  it('0〜40秒の姿勢の値がとどめを足す前と同じ', () => {
    const values: number[] = [];
    for (let ms = 0; ms <= 40000; ms += 100) {
      const p = ms >= GUARD_FROM * 1000 ? guardPose(ms, false, 'block') : knightPose(ms, true, false, 'attack', .7, false);
      // 崩れ落ちの姿勢は、40秒までは一度も混ざらない。
      expect(p.weights[8] ?? 0).toBe(0);
      expect(p.fall).toBe(0);
      values.push(...p.weights.slice(0, 8), p.lean, p.breath, p.flash, p.shake, p.strength, p.push, p.collapse, p.spin, p.flashAlpha, p.flashTint, p.ghost, p.rim);
    }
    expect(values.length).toBe(8020);
    let digest = 0;
    for (const value of values) digest = (digest * 31 + Math.round(value * 1e9)) % 2147483647;
    expect(digest).toBe(1482580436);
  });
  it('40秒までは部品が一つも落ちない', () => {
    for (let t = 0; t <= 40; t += .1) expect(droppedAt(t)).toEqual([]);
  });
});

/**
 * 落ちた盾と剣の行き先。手前（視点の側）へ寄せると画面いっぱいに映るので、
 * 足元の左右へ落として床で止める。
 */
describe('盾と剣は足元の左右へ落ちる', () => {
  it('手前へは飛ばさない', () => {
    for (const key of ['shield', 'sword'] as const) {
      const v = FINISH_THROWS[key];
      // zの負の向きが視点の側。盾と剣はそちらへ動かさない。
      expect(v.vz).toBeGreaterThanOrEqual(0);
      // 横へ流す量のほうが大きい。盾は右、剣は左。
      expect(Math.abs(v.vx)).toBeGreaterThan(Math.abs(v.vz));
    }
    expect(FINISH_THROWS.shield.vx).toBeGreaterThan(0);
    expect(FINISH_THROWS.sword.vx).toBeLessThan(0);
  });
  it('肩の高さから落として、足元の1.5m以内で止まる', () => {
    // 盾は腕のあたり（高さ約1m）、剣は握りのあたり（高さ約0.8m）から落ちる。
    for (const [key, height] of [['shield', 1], ['sword', .8]] as const) {
      const v = FINISH_THROWS[key];
      const rest = debrisMotion(9, height - v.floor, v);
      expect(rest.resting).toBe(true);
      expect(rest.y).toBe(0);
      expect(Math.abs(rest.x)).toBeLessThan(1.5);
      expect(Math.abs(rest.z)).toBeLessThan(.5);
    }
  });
  it('床で止まる高さを持てる', () => {
    expect(FINISH_THROWS.shield.floor).toBeGreaterThan(0);
    expect(FINISH_THROWS.sword.floor).toBeGreaterThan(0);
    // 小さい部品は床に置いたままでよい。
    expect(FINISH_THROWS.horn.floor).toBe(0);
  });
});

describe('倒れ込みの深さ', () => {
  it('回す角と近づける量は控えめにする', () => {
    // 近づけすぎると兜の上面だけの黒い形が画面いっぱいになる。
    expect(FALL_TURN).toBeLessThanOrEqual(1);
    expect(FALL_NEAR).toBeLessThanOrEqual(.3);
    expect(FALL_TURN).toBeGreaterThan(.8);
    expect(FALL_NEAR).toBeGreaterThan(.1);
  });
  it('倒れた体の一番上が視点より下へ来る', () => {
    // 足元を軸に回した後、膝をついた分（crouch）だけ下がる。
    // 騎士の高さは2.93m、視点の高さは約0.95m。
    const top = 2.93 * Math.cos(FALL_TURN) - .92;
    expect(top).toBeLessThan(.95);
  });
});
