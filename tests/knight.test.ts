import { describe, it, expect } from 'vitest';
import { knightPose, reactionPower } from '../src/render/knight';
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
  it('動きを減らす設定では回転も移動も0にする', () => {
    const quiet = knightPose(18600, true, true, 'attack', 1);
    expect(quiet.spin).toBe(0); expect(quiet.push).toBe(0); expect(quiet.collapse).toBe(0);
  });
});
