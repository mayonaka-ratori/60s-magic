import { describe, it, expect } from 'vitest';
import { presets, getPreset, intensityOf, increase, mixHue, lighten } from '../src/render/effects/presets';
import { hitDelay } from '../src/render/effects/release';
import { screenState, effectTime, hitStopOf, shockAt, wobble } from '../src/render/effects/screen';
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

describe('揺れ、寄り、暗転', () => {
  const vivid = (t: number, calm = false) => screenState(t, 2, presets.vivid, 'attack', 0, .5, calm);
  it('揺れは命中の直後が一番強く、時間とともに減って止まる', () => {
    const size = (t: number) => Math.hypot(vivid(t).shakeX, vivid(t).shakeY);
    expect(size(18.52)).toBeGreaterThan(size(18.8));
    expect(size(18.8)).toBeGreaterThan(size(19.05));
    expect(size(19.3)).toBe(0);
    // 衝撃の強さは減り続け、同じ時刻なら何度でも同じ値になる。
    expect(shockAt(18.6, .5, 1)).toBeGreaterThan(shockAt(18.9, .5, 1));
    expect(vivid(18.6).shakeX).toBe(vivid(18.6).shakeX);
    expect(wobble(3.42, 1)).toBe(wobble(3.42, 1));
    expect(Math.abs(wobble(7.77, 2))).toBeLessThanOrEqual(1);
  });
  it('傾きは1度まで、揺れの拡大は1.03倍まで', () => {
    for (let t = 17; t < 19.5; t += .01) {
      const s = screenState(t, 3, presets.max, 'attack');
      expect(Math.abs(s.rotate)).toBeLessThanOrEqual(1);
      expect(s.zoom).toBeLessThanOrEqual(1.11 * 1.03 * 1.03 + .001);
    }
  });
  it('控えめモードでは揺れも傾きも寄りも停止もなく、閃光は3分の1', () => {
    const calm = vivid(18.52, true);
    expect(calm.shakeX).toBe(0); expect(calm.shakeY).toBe(0);
    expect(calm.rotate).toBe(0); expect(calm.zoom).toBe(1); expect(calm.hitStop).toBe(0);
    expect(calm.chromatic).toBe(0);
    expect(calm.flash).toBeCloseTo(vivid(18.52).flash / 3, 5);
  });
  it('寄りは溜めの後半で1.03倍まで進み、命中で1.1倍から0.3秒で戻る', () => {
    const zoomOf = (t: number) => screenState(t, 1, presets.vivid, 'attack').zoom;
    expect(zoomOf(15.4)).toBeCloseTo(1, 3);
    expect(zoomOf(16.3)).toBeGreaterThan(zoomOf(15.8));
    expect(zoomOf(16.99)).toBeCloseTo(1.03, 3);
    // 命中の瞬間は寄り1.1倍に揺れの拡大が少し乗る。
    expect(zoomOf(18.5)).toBeGreaterThan(1.09); expect(zoomOf(18.5)).toBeLessThan(1.14);
    expect(zoomOf(18.7)).toBeLessThan(zoomOf(18.55));
    expect(zoomOf(18.81)).toBeLessThan(1.03);
  });
  it('放出の直前だけ完全に暗転し、17秒で抜ける', () => {
    const black = (t: number) => screenState(t, 1, presets.vivid, 'attack').blackout;
    expect(black(16.9)).toBe(0);
    expect(black(16.95)).toBeGreaterThan(.5);
    expect(black(16.99)).toBe(1);
    expect(black(17)).toBe(0);
  });
  it('背景の彩度は溜めの後半で0.6まで落ち、命中の後に戻る', () => {
    const sat = (t: number) => screenState(t, 1, presets.vivid, 'attack').saturate;
    expect(sat(15.4)).toBe(1);
    expect(sat(16.2)).toBeLessThan(1);
    expect(sat(17)).toBeCloseTo(.6, 3);
    expect(sat(19.2)).toBeGreaterThan(sat(18.6));
    expect(sat(20.5)).toBeCloseTo(1, 3);
  });
  it('命中の停止は弱60ms、強90ms、とどめ200msの三段', () => {
    expect(hitStopOf(presets.vivid, .5)).toBeCloseTo(.06);
    expect(hitStopOf(presets.vivid, 2)).toBeCloseTo(.09);
    expect(hitStopOf(presets.vivid, 2.8, 1)).toBeCloseTo(.2);
    expect(hitStopOf(presets.calm, 3, 1)).toBe(0);
    expect(hitStopOf(presets.max, 3, 1, true)).toBe(0);
  });
});

describe('二属性の色', () => {
  it('中間色は平均せず色相の中間を取るので、濁らず鮮やかなまま', () => {
    // 赤と青を平均すると暗い紫（#7f007f）になるが、色相の中間は鮮やかな赤紫になる。
    expect(mixHue('#ff0000', '#0000ff')).toBe('#ff00ff');
    expect(mixHue('#0000ff', '#ff0000')).toBe('#ff00ff');
    expect(mixHue(presets.vivid.palettes.fire.main, presets.vivid.palettes.lightning.main)).toMatch(/^#[0-9a-f]{6}$/);
  });
  it('明るさを上げても色は同じ向きのまま、255を超えない', () => {
    expect(lighten('#804020', 1.5)).toBe('#c06030');
    expect(lighten('#ff6a1e', 1.5)).toBe('#ff9f2d');
  });
});

describe('連弾のリズム', () => {
  it('単発は遅れず、連弾は80ms間隔で、最後の1発だけ200ms空く', () => {
    expect(hitDelay(0, 1)).toBe(0);
    expect(hitDelay(0, 7)).toBe(0);
    expect(hitDelay(1, 7)).toBeCloseTo(.08);
    expect(hitDelay(5, 7)).toBeCloseTo(.4);
    // 最後は18.5 + 0.08×(7-1) + 0.2 = 19.18秒に届く。
    expect(18.5 + hitDelay(6, 7)).toBeCloseTo(19.18);
    for (let i = 1; i < 7; i++) expect(hitDelay(i, 7)).toBeGreaterThan(hitDelay(i - 1, 7));
  });
});

describe('属性ごとの消え方', () => {
  it('かけらは床で止まり、吸い込まれる粒は中心へ戻る', () => {
    const pool = new ParticlePool(2);
    pool.spawn({ x: 0, y: 0, vy: 100, gravity: 500, floor: 50, life: 5, kind: 2 });
    for (let i = 0; i < 60; i++) pool.update(.03);
    const shard = pool.items[0];
    expect(shard.y).toBeCloseTo(50, 5); expect(shard.vy).toBe(0); expect(Math.abs(shard.vx)).toBeLessThan(.01);
  });
});
