import { describe, it, expect } from 'vitest';
import { planHealthSteps, healthAt, healthSteps, FINAL_BLOW_MS, HEALTH_HIDE_MS } from '../src/render/health-bar';
import { FINISH_HIT_MS, FINISH_COLLAPSE_MS, ROUNDS } from '../src/game/rounds';
import { KNEEL_AT } from '../src/render/knight';
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

/**
 * とどめの回の体力。多段命中で9割を4回に等分して減らし、とどめの一撃で必ず0にする。
 * 時刻はすべて世界の時刻。
 */
describe('とどめの体力', () => {
  // どんな魔法でも同じになることを見るため、いろいろな入力を並べる。
  const cases = [null,
    recipe({}), recipe({ count: 2 }), recipe({ count: 5, area: .6 }), recipe({ count: 8, area: 1, concentration: 1 }),
    recipe({ count: 1, area: 1, concentration: 1 }), recipe({ count: 3, area: .5, concentration: .5 }),
    recipe({ count: 12 })];
  it('どんな魔法でも54.5秒でちょうど0になる', () => {
    for (const r of cases) {
      const steps = healthSteps(r);
      expect(healthAt(FINAL_BLOW_MS, steps).left).toBe(0);
      expect(healthAt(FINAL_BLOW_MS - 1, steps).left).toBeGreaterThan(0);
      // 60秒まで0のまま。
      expect(healthAt(60000, steps).left).toBe(0);
    }
  });
  it('前の二回の減り方によらない', () => {
    // 一発の弱い魔法と、8発の強い魔法で、とどめの後の値は同じ。
    const weak = healthSteps(recipe({})), strong = healthSteps(recipe({ count: 8, area: 1, concentration: 1 }));
    expect(healthAt(53590, weak).left).not.toBeCloseTo(healthAt(53590, strong).left);
    expect(healthAt(FINAL_BLOW_MS, weak).left).toBe(healthAt(FINAL_BLOW_MS, strong).left);
  });
  it('多段命中の4回は残りの9割を等分して減らす', () => {
    for (const r of cases) {
      const steps = healthSteps(r);
      const before = healthAt(FINISH_HIT_MS[0] - 1, steps).left;
      const drops: number[] = [];
      let previous = before;
      for (const at of FINISH_HIT_MS) { const now = healthAt(at, steps).left; drops.push(previous - now); previous = now; }
      // 4回とも同じ量だけ減る。
      for (const drop of drops) expect(drop).toBeCloseTo(drops[0], 8);
      // 合計は9割。残りの1割はとどめの一撃で消える。
      expect(drops.reduce((a, b) => a + b, 0)).toBeCloseTo(before * .9, 8);
      expect(previous).toBeCloseTo(before * .1, 8);
    }
  });
  it('段の時刻は増えるだけで、0より下へは行かない', () => {
    for (const r of cases) {
      const steps = healthSteps(r);
      for (let i = 1; i < steps.length; i++) expect(steps[i].at).toBeGreaterThan(steps[i - 1].at);
      for (const step of steps) { expect(step.left).toBeGreaterThanOrEqual(0); expect(step.from).toBeGreaterThanOrEqual(0); }
      // 0.05秒刻みで見ても、増えることはなく0を下回らない。
      let last = 100;
      for (let ms = 0; ms <= 60000; ms += 50) {
        const now = healthAt(ms, steps);
        expect(now.left).toBeLessThanOrEqual(last + 1e-9);
        expect(now.left).toBeGreaterThanOrEqual(0);
        expect(now.trail).toBeGreaterThanOrEqual(0);
        last = now.left;
      }
    }
  });
  it('0になった後は薄い赤も0へ追いつく', () => {
    const steps = healthSteps(recipe({ count: 4 }));
    // 0.3秒待ってから0.5秒かけて追いつく。
    expect(healthAt(FINAL_BLOW_MS + 300, steps).trail).toBeGreaterThan(0);
    expect(healthAt(FINAL_BLOW_MS + 800, steps).trail).toBeCloseTo(0, 8);
    expect(healthAt(60000, steps).trail).toBeCloseTo(0, 8);
  });
  it('とどめの時刻は回の表から取る', () => {
    expect(FINAL_BLOW_MS).toBe(ROUNDS[2].finalBlow);
    expect(FINISH_HIT_MS).toEqual([53600, 53760, 53920, 54100]);
    // 枠を消し始めるのは、とどめの一撃の0.9秒後。
    expect(HEALTH_HIDE_MS).toBe(55400);
    // 枠が消え始める時刻と、騎士が膝をつき始める時刻は同じ一つの値から作る。
    expect(HEALTH_HIDE_MS).toBe(FINISH_COLLAPSE_MS);
    expect(HEALTH_HIDE_MS).toBe(KNEEL_AT * 1000);
  });
});
