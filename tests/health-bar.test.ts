import { describe, it, expect } from 'vitest';
import { planHealthSteps, healthAt } from '../src/render/health-bar';
import { hitDelay } from '../src/render/effects/release';
import { effectTime, HIT_STOPS } from '../src/render/effects/screen';
import type { Recipe } from '../src/game/types';

const recipe = (over: Partial<Recipe>): Recipe => ({ version: 'recipe-1', accent: null, element: 'lightning', purpose: 'attack', form: 'orb',
  trajectory: 'straight', count: 1, explicitCount: null, defense: .2, area: .2, duration: .5, concentration: 0,
  enclosure: false, split: false, developsPrevious: null, motionSpeechAligned: null, noAttack: false, name: '', source: 'local',
  decisions: {}, assistance: [], model: null, ...over });

describe('体力の段', () => {
  it('単発は18.5秒の一段だけ', () => {
    const steps = planHealthSteps(recipe({}));
    expect(steps.length).toBe(1);
    expect(steps[0].at).toBe(18500);
    expect(steps[0].from).toBe(100);
  });
  it('7連弾は7段で、最後の段が弾と同じ時刻に減る', () => {
    const steps = planHealthSteps(recipe({ count: 7 }));
    expect(steps.length).toBe(7);
    expect(steps[0].at).toBe(18500);
    expect(steps[6].at).toBeCloseTo(18500 + hitDelay(6, 7) * 1000);
    expect(steps[6].at).toBeCloseTo(19180);
    // 段の時刻は前から順に進む。
    for (let i = 1; i < 7; i++) expect(steps[i].at).toBeGreaterThan(steps[i - 1].at);
    // 前の段の減り終わりが次の段の減り始めになる。
    for (let i = 1; i < 7; i++) expect(steps[i].from).toBeCloseTo(steps[i - 1].left);
  });
  it('個数が多くても段は8つまで', () => {
    expect(planHealthSteps(recipe({ count: 12 })).length).toBe(8);
  });
  it('レシピがなくても一段は作る', () => {
    const steps = planHealthSteps(null);
    expect(steps.length).toBe(1);
    expect(steps[0].left).toBeCloseTo(76);
  });
});

describe('時刻ごとの体力', () => {
  const steps = planHealthSteps(recipe({ count: 7, area: 1, concentration: 1 }));
  it('命中の前は満タン', () => {
    expect(healthAt(18000, steps).left).toBe(100);
    expect(healthAt(18000, steps).trail).toBe(100);
  });
  it('最後の段の直前ではまだ減りきっていない', () => {
    const before = healthAt(steps[6].at - 1, steps).left;
    const after = healthAt(steps[6].at, steps).left;
    expect(before).toBeGreaterThan(after);
    expect(before).toBeCloseTo(steps[6].from);
  });
  it('24秒でも0にはならず残る', () => {
    const end = healthAt(24000, steps);
    expect(end.left).toBeCloseTo(55);
    expect(end.trail).toBeCloseTo(55);
  });
  it('薄い赤は0.3秒遅れて0.5秒かけて追いつく', () => {
    expect(healthAt(18500 + 300, steps).trail).toBeCloseTo(100);
    const mid = healthAt(18500 + 550, steps).trail;
    expect(mid).toBeLessThan(100);
    expect(mid).toBeGreaterThan(healthAt(24000, steps).trail);
  });
});

/**
 * 体力も演出と同じ世界の時計（命中の停止を含む）を見る。
 * 本編の時刻をそのまま渡すと、止まっている間に体力だけ先へ進んでしまう。
 */
describe('命中の停止と体力', () => {
  const steps = planHealthSteps(recipe({ count: 7 }));
  // 世界の時計は命中の18.5秒から0.09秒だけ止まる。
  const world = (ms: number) => effectTime(ms / 1000, HIT_STOPS.strong) * 1000;
  it('止まっている間は時刻も体力も動かない', () => {
    for (const ms of [18520, 18550, 18580]) expect(world(ms)).toBeCloseTo(18500, 10);
    expect(healthAt(world(18580), steps)).toEqual(healthAt(world(18520), steps));
  });
  it('止まった分だけ次の段が遅れる', () => {
    // 2段目は18.58秒。本編の18.62秒は、世界の時計ではまだ18.53秒なので減っていない。
    expect(steps[1].at).toBeCloseTo(18580);
    expect(world(18620)).toBeCloseTo(18530, 10);
    expect(healthAt(world(18620), steps).left).toBeGreaterThan(healthAt(18620, steps).left);
    // 止まりが終われば、遅れたまま同じように減る。
    expect(healthAt(world(18680), steps).left).toBe(healthAt(18590, steps).left);
  });
});
