import { describe, it, expect } from 'vitest';
import { ARRIVAL, bodyPoint, hitDelay } from '../src/render/effects/release';
import { RELEASE_AT } from '../src/render/effects/screen';
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
