import { describe, it, expect } from 'vitest';
import { presets, getPreset, intensityOf, increase } from '../src/render/effects/presets';
import { screenState, effectTime } from '../src/render/effects/screen';
import { ParticlePool } from '../src/render/effects/particles';
import { ELEMENTS, type Recipe } from '../src/game/types';

const recipe = (over: Partial<Recipe> = {}): Recipe => ({ version: 'recipe-1', element: 'fire', purpose: 'attack', form: 'orb', trajectory: 'straight', count: 1, explicitCount: null, defense: .3, area: .5, duration: .5, concentration: .5,
  enclosure: false, split: false, developsPrevious: null, motionSpeechAligned: null, noAttack: false, name: '', source: 'local', decisions: {}, assistance: [], model: null, ...over });

describe('見た目の設定', () => {
  it('全属性に4色があり、未知の名前は既定の設定になる', () => {
    for (const preset of Object.values(presets)) for (const element of ELEMENTS) {
      const p = preset.palettes[element];
      for (const color of [p.main, p.edge, p.core, p.spark]) expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(getPreset('ないもの').name).toBe('vivid');
    expect(getPreset(null).name).toBe('vivid');
  });
  it('派手さは0〜3に収まり、個数と範囲で増え、設定の順に大きくなる', () => {
    const small = intensityOf(recipe({ count: 1, area: .2, concentration: 0, purpose: 'defend' }), presets.calm);
    const large = intensityOf(recipe({ count: 8, area: 1, concentration: 1 }), presets.max);
    expect(small).toBeGreaterThanOrEqual(0); expect(large).toBeLessThanOrEqual(3);
    expect(intensityOf(recipe({ count: 8 }), presets.vivid)).toBeGreaterThan(intensityOf(recipe({ count: 1 }), presets.vivid));
    expect(intensityOf(recipe(), presets.calm)).toBeLessThan(intensityOf(recipe(), presets.vivid));
    expect(intensityOf(recipe(), presets.vivid)).toBeLessThan(intensityOf(recipe(), presets.max));
    expect(increase(100, 0)).toBe(100); expect(increase(100, 2)).toBe(200);
  });
});

describe('画面全体の効果', () => {
  it('放出前は揺れも閃光もなく、命中で最大になり、その後収まる', () => {
    const before = screenState(16.9, 2, presets.vivid, 'attack');
    expect(before.shakeX).toBe(0); expect(before.flash).toBe(0);
    const hit = screenState(18.51, 2, presets.vivid, 'attack'), later = screenState(19.4, 2, presets.vivid, 'attack');
    expect(hit.flash).toBeGreaterThan(.3); expect(Math.abs(hit.shakeX) + Math.abs(hit.shakeY)).toBeGreaterThan(0);
    expect(later.flash).toBe(0); expect(later.shakeX).toBe(0); expect(later.shakeY).toBe(0);
  });
  it('防御と強化は揺らさず、控えめの設定は閃光が弱い', () => {
    expect(screenState(18.52, 3, presets.max, 'enhance').shakeX).toBe(0);
    expect(screenState(18.52, 3, presets.max, 'bind').shakeY).toBe(0);
    expect(screenState(18.52, 1, presets.calm, 'attack').flash).toBeLessThan(screenState(18.52, 1, presets.max, 'attack').flash);
    expect(screenState(18.52, 1, presets.calm, 'attack').hitStop).toBe(0);
  });
  it('背景は蓄積で暗くなり、放出で一度抜け、余韻の後に戻る', () => {
    const s = (t: number) => screenState(t, 1, presets.vivid, 'attack').darken;
    expect(s(13.9)).toBe(0); expect(s(16.5)).toBeGreaterThan(.2); expect(s(17.1)).toBeLessThan(s(16.5)); expect(s(23)).toBeLessThan(.01);
  });
  it('命中の停止は演出の時計だけを止める', () => {
    expect(effectTime(18.4, .1)).toBe(18.4);
    expect(effectTime(18.55, .1)).toBe(18.5);
    expect(effectTime(18.7, .1)).toBeCloseTo(18.6);
    expect(effectTime(18.7, 0)).toBe(18.7);
  });
});

describe('粒の置き場', () => {
  it('上限を超えず、寿命が尽きると消え、同じ種で同じ散り方になる', () => {
    const pool = new ParticlePool(10); pool.reseed(3);
    for (let i = 0; i < 25; i++) pool.spawn({ x: 0, y: 0, vx: 10, vy: 0, life: .5 });
    expect(pool.count).toBe(10);
    pool.update(.3); expect(pool.count).toBe(10); expect(pool.items[0].x).toBeCloseTo(3);
    pool.update(.3); expect(pool.count).toBe(0);
    const a = new ParticlePool(2), b = new ParticlePool(2); a.reseed(9); b.reseed(9);
    expect(a.random()).toBe(b.random());
  });
  it('吸い込み先に届いた粒は消える', () => {
    const pool = new ParticlePool(1); pool.spawn({ x: 100, y: 0, pull: 4000, px: 0, py: 0, life: 5 });
    for (let i = 0; i < 100; i++) pool.update(.03);
    expect(pool.count).toBe(0);
  });
});
