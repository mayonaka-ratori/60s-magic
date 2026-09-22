import { describe, it, expect } from 'vitest';
import { ROUNDS, beatOf, ENEMY_SLAM_MS } from '../src/game/rounds';
import { ParticlePool } from '../src/render/effects/particles';
import { ENEMY, FLOOR_CRACK, FLOOR_DUST, SLASH, drawGuard, floorCrackAt, footOf, slashSizeAt } from '../src/render/effects/guard';
import type { Frame } from '../src/render/effects/frame';
// 試験用の魔法と仮の Frame は tests/helpers.ts にまとめてある。
import { testFrame, testRecipe } from './helpers';

const defendBeat = beatOf(ROUNDS[1]);
const slam = ENEMY_SLAM_MS / 1000;
const recipe = testRecipe({ purpose: 'defend', defense: .5 });

/**
 * 描く命令を受け流すだけの仮の canvas。数と文字の指定を記録する。node には本物の canvas がないため。
 * 色や重ね方の文字も見るので、tests/helpers.ts の stubContext（数だけを記録する）とは別に置く。
 */
const stubContext = (log: string[]) => {
  const held: Record<string, unknown> = {};
  const fake: unknown = new Proxy(held, {
    get: (target, key: string) => (key in target ? target[key] : (...args: unknown[]) => { log.push(key + ':' + args.filter(a => typeof a === 'number').map(a => Math.round(a as number)).join(',')); return fake; }),
    set: (target, key: string, value) => { if (typeof value === 'number' || typeof value === 'string') log.push(key + '=' + value); target[key] = value; return true; },
  });
  return fake as CanvasRenderingContext2D;
};
/** guard.ts の部品を呼ぶための仮の Frame。once は本物と同じく一度だけ動く。 */
function frame(t: number, over: Partial<Frame> = {}) {
  const log: string[] = [], fired = new Set<string>();
  const f = testFrame({
    c: stubContext(log), t, pool: new ParticlePool(700), recipe, origin: { x: 320, y: 520 }, beat: defendBeat,
    once: (key, run) => { if (!fired.has(key)) { fired.add(key); run(); } }, ...over,
  });
  return { f, log };
}
const dust = (f: Frame) => f.pool.items.filter(p => p.alive && p.kind === 3);

describe('床の一撃', () => {
  it('亀裂は床を打った瞬間に走り始め、回の終わりまで残り、最後の1秒で薄れる', () => {
    expect(floorCrackAt(slam - .01, defendBeat)).toBeNull();
    const start = floorCrackAt(slam, defendBeat)!;
    expect(start.grow).toBe(0); expect(start.heat).toBe(1); expect(start.alpha).toBe(1);
    expect(floorCrackAt(slam + FLOOR_CRACK.grow, defendBeat)!.grow).toBe(1);
    // 冷めても消えない。縁の赤熱は4分の1まで下がって止まる。
    expect(floorCrackAt(slam + FLOOR_CRACK.cool, defendBeat)!.heat).toBeCloseTo(.25, 9);
    expect(floorCrackAt(slam + FLOOR_CRACK.cool + 2, defendBeat)!.heat).toBeCloseTo(.25, 9);
    // 盾に当たった後も、薄れ始める直前でもまだ濃いまま。
    expect(floorCrackAt(defendBeat.impact + 1, defendBeat)!.alpha).toBe(1);
    expect(floorCrackAt(defendBeat.end - FLOOR_CRACK.fade, defendBeat)!.alpha).toBe(1);
    expect(floorCrackAt(defendBeat.end - .5, defendBeat)!.alpha).toBeCloseTo(.5, 9);
    expect(floorCrackAt(defendBeat.end - .001, defendBeat)!.alpha).toBeCloseTo(0, 2);
    expect(floorCrackAt(defendBeat.end, defendBeat)).toBeNull();
    expect(floorCrackAt(defendBeat.end + 1, defendBeat)).toBeNull();
  });
  it('亀裂は足元から、暗い線と敵の色の縁で描く', () => {
    const before = frame(slam - .1); drawGuard(before.f);
    expect(before.log.some(line => line === 'strokeStyle=' + ENEMY.edge)).toBe(false);
    const { f, log } = frame(slam + .2); drawGuard(f);
    const foot = footOf(f);
    expect(foot).toEqual({ x: 900, y: 720 * .72 });
    // 暗い線は普通の重ね方で、赤熱した縁は光を足す描き方で、同じ道を続けて描く。
    const dark = log.indexOf('strokeStyle=' + ENEMY.edge);
    expect(dark).toBeGreaterThan(0);
    expect(log.lastIndexOf('globalCompositeOperation=source-over')).toBeLessThan(dark);
    expect(log.indexOf('strokeStyle=' + ENEMY.main, dark)).toBeGreaterThan(dark);
    expect(log.indexOf('globalCompositeOperation=lighter', dark)).toBeGreaterThan(dark);
    // 亀裂は足元から始まる。本数ぶんの moveTo がある。
    expect(log.filter(line => line === `moveTo:${Math.round(foot.x)},${Math.round(foot.y)}`).length).toBeGreaterThanOrEqual(FLOOR_CRACK.branches);
  });
  it('塵は床を打った瞬間に一度だけ、足元から左右へ、画面の端まで届く速さで出る。控えめモードでは3分の1', () => {
    // 床を打つ前には出ない。
    const early = frame(slam - .05); drawGuard(early.f);
    expect(dust(early.f)).toHaveLength(0);
    const { f } = frame(slam + .01); drawGuard(f);
    const grains = dust(f);
    expect(grains).toHaveLength(FLOOR_DUST.count);
    const foot = footOf(f);
    const left = grains.filter(p => p.vx < 0), right = grains.filter(p => p.vx > 0);
    expect(left.length).toBe(right.length);
    for (const p of grains) {
      expect(FLOOR_DUST.colors).toContain(p.color);
      expect(Math.abs(p.y - foot.y)).toBeLessThanOrEqual(9);
      // 寿命のうちに端まで届く。
      const edge = p.vx > 0 ? f.w - p.x : p.x;
      expect(Math.abs(p.vx) * p.life).toBeGreaterThanOrEqual(edge);
    }
    // もう一度描いても増えない。
    f.t = slam + .5; drawGuard(f);
    expect(dust(f)).toHaveLength(FLOOR_DUST.count);
    const calm = frame(slam + .01, { calm: true }); drawGuard(calm.f);
    expect(dust(calm.f)).toHaveLength(FLOOR_DUST.count / 3);
  });
});

describe('敵の斬撃の大きさ', () => {
  it('届くころには弧が画面の高さの半分近くまで広がる', () => {
    // 派手さ1.5のときの斬撃の基準の大きさ。
    const size = (26 + 1.5 * 6) * SLASH.scale, h = 720;
    expect(slashSizeAt(size, h, 0)).toBeCloseTo(size * .55, 9);
    expect(slashSizeAt(size, h, 1)).toBeCloseTo(h * SLASH.nearHeight, 9);
    // 弧は進む向きの左右1.15ラジアンまで開くので、見える高さは半径の1.8倍ほど。画面の高さの45%を超える。
    expect(2 * slashSizeAt(size, h, 1) * Math.sin(1.15)).toBeGreaterThan(h * .45);
    // 途中は単調に大きくなる。
    let before = 0;
    for (let u = 0; u <= 1; u += .05) { const now = slashSizeAt(size, h, u); expect(now).toBeGreaterThanOrEqual(before); before = now; }
    // 大きな画面でも基準の1.3倍より小さくはしない。
    expect(slashSizeAt(1000, h, 1)).toBe(1300);
  });
});
