import { describe, it, expect } from 'vitest';
import { knightPose, reactionPower, knightTransform, knightMatrix, knightPoint } from '../src/render/knight';
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
