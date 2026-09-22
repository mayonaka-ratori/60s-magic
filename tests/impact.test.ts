import { describe, it, expect } from 'vitest';
import { BEATS } from '../src/game/rounds';
import { increase } from '../src/render/effects/presets';
import { ParticlePool } from '../src/render/effects/particles';
import type { Frame } from '../src/render/effects/frame';
import type { Recipe } from '../src/game/types';
import { HIT_STAGES, PILLAR, PILLAR_STONE, WIDE_RING, drawImpact, groundMarkLife, stagesOf, wideRingAt } from '../src/render/effects/impact';
// 仮のcanvas（数の指定だけを記録する）、試験用の魔法、仮の Frame は tests/helpers.ts にまとめてある。
import { stubContext, testFrame, testRecipe as recipe } from './helpers';

const first = BEATS[0], finish = BEATS[2];
const W = 1280, H = 720, target = { x: 900, y: 360 };
/** 記録した命令のうち、名前が合うものの数の並び。'ellipse:900,360,72,...' の 72 のように、何番目の数かを選べる。 */
const numbersOf = (log: string[], name: string, index: number) => log.filter(line => line.startsWith(name + ':')).map(line => Number(line.slice(name.length + 1).split(',')[index]));
const countOf = (log: string[], name: string) => log.filter(line => line.startsWith(name + ':')).length;

/** 光の絵の呼び出しの記録。半径と色を見る。 */
type Glow = { x: number; y: number; r: number; core: string; main: string; alpha: number };

/**
 * 命中の部品だけを呼ぶための仮の Frame と、その記録。
 * once は本物と同じく一度きりにして、コマを進めながら呼べるようにする。
 */
function scene(over: Partial<Frame> = {}, spell: Partial<Recipe> = {}) {
  const log: string[] = [], glows: Glow[] = [], fired = new Set<string>(), pool = new ParticlePool(2000);
  pool.reseed(7);
  const f = testFrame({
    c: stubContext(log), w: W, h: H, t: first.impact, dt: 1 / 60,
    sprites: { draw: (_c: unknown, x: number, y: number, r: number, core: string, main: string, alpha: number) => glows.push({ x, y, r, core, main, alpha }) } as unknown as Frame['sprites'],
    pool, recipe: recipe(spell), target,
    once: (key, run) => { if (!fired.has(key)) { fired.add(key); run(); } }, ...over,
  });
  /** 命中から since 秒のコマを一つ描く。記録は描く前に空にする。 */
  const at = (since: number) => { f.t = f.beat.impact + since; log.length = 0; glows.length = 0; drawImpact(f); };
  /** 命中から from 秒から to 秒まで、1/60秒ずつ描いて粒も進める。最後は必ず to のコマを描く。 */
  const play = (from: number, to: number) => {
    for (let since = from; since < to; since += 1 / 60) { at(since); pool.update(1 / 60); }
    at(to); pool.update(1 / 60);
  };
  return { f, log, glows, fired, pool, at, play };
}
const stone = (p: { color: string; kind: number }) => p.kind === 2 && PILLAR_STONE.includes(p.color);

describe('地面の跡は回の終わりまで残る', () => {
  it('一回目は受け渡しの1.5秒前から薄れ始めて受け渡しで消え、描く楕円もなくなる。とどめは余韻の始まりから2秒で消える', () => {
    // 命中の2.5秒後は、前は消えていたが今は濃いまま。
    expect(groundMarkLife(first.impact + 2.5, first)).toBe(1);
    expect(groundMarkLife(first.handoff - 1.5, first)).toBe(1);
    expect(groundMarkLife(first.handoff - .75, first)).toBeCloseTo(.5, 6);
    expect(groundMarkLife(first.handoff, first)).toBe(0);
    expect(groundMarkLife(first.end, first)).toBe(0);
    const { at, log } = scene();
    at(3); expect(countOf(log, 'ellipse')).toBeGreaterThan(0);
    at(first.handoff - first.impact); expect(countOf(log, 'ellipse')).toBe(0);
    // とどめの回は今までどおり。
    expect(groundMarkLife(finish.impact + 3, finish)).toBe(1);
    expect(groundMarkLife(finish.handoff, finish)).toBe(1);
    expect(groundMarkLife(finish.handoff + 1, finish)).toBeCloseTo(.5, 6);
    expect(groundMarkLife(finish.handoff + 2, finish)).toBe(0);
  });
});

describe('命中の跡を左右へ逃がす', () => {
  it('横幅を超える輪は、画面幅の0.6倍まで広がり、外側ほど細く薄い', () => {
    expect(wideRingAt(-.01, W, 60)).toBeNull();
    expect(wideRingAt(WIDE_RING.seconds, W, 60)).toBeNull();
    const start = wideRingAt(0, W, 60)!;
    expect(start.size).toBeGreaterThan(60);
    expect(start.alpha).toBeCloseTo(WIDE_RING.alpha, 6);
    const end = wideRingAt(WIDE_RING.seconds - .001, W, 60)!;
    expect(end.size).toBeGreaterThan(W * WIDE_RING.reach * .99);
    expect(end.size).toBeLessThanOrEqual(W * WIDE_RING.reach);
    let last = start;
    for (let since = .05; since < WIDE_RING.seconds; since += .05) {
      const now = wideRingAt(since, W, 60)!;
      expect(now.size).toBeGreaterThan(last.size); expect(now.alpha).toBeLessThan(last.alpha); expect(now.width).toBeLessThan(last.width);
      last = now;
    }
  });
  it('攻撃の命中で、横幅の半分を超える楕円が描かれる', () => {
    const { at, log } = scene();
    at(HIT_STAGES.wave + WIDE_RING.seconds - .01);
    expect(Math.max(...numbersOf(log, 'ellipse', 2))).toBeGreaterThan(W / 2);
    // 防御の魔法では出さない。
    const guard = scene({}, { purpose: 'defend' });
    guard.at(HIT_STAGES.wave + WIDE_RING.seconds - .01);
    expect(Math.max(...numbersOf(guard.log, 'ellipse', 2), 0)).toBeLessThan(W / 2);
  });
  it('破裂の粒の一部は速く長く飛び、1秒たたずに画面の左右の端を抜ける', () => {
    const { at, pool, f } = scene();
    at(HIT_STAGES.blast + .01);
    const fast = pool.items.filter(p => p.alive && Math.abs(p.vx) >= W * .6);
    expect(fast.length).toBeGreaterThanOrEqual(pool.count / 6);
    expect(fast.some(p => p.vx < 0)).toBe(true); expect(fast.some(p => p.vx > 0)).toBe(true);
    for (let i = 0; i < 54; i++) pool.update(1 / 60);
    expect(pool.items.some(p => p.alive && p.x < 0)).toBe(true);
    expect(pool.items.some(p => p.alive && p.x > f.w)).toBe(true);
  });
  it('左右の柱を照らす帯は、破裂から0.25秒だけ、左右の端の近くに出る。控えめモードでは出さない', () => {
    const { at, log } = scene();
    at(HIT_STAGES.blast + .05);
    // 幅いっぱいの帯と半分の帯を左右で4枚。中心は横位置7%と93%。
    expect(countOf(log, 'fillRect')).toBe(4);
    const centers = log.filter(line => line.startsWith('fillRect:')).map(line => { const [x, , w] = line.slice(9).split(',').map(Number); return (x + w / 2) / W; });
    expect(centers.filter(x => Math.abs(x - PILLAR.x[0]) < 1e-6).length).toBe(2);
    expect(centers.filter(x => Math.abs(x - PILLAR.x[1]) < 1e-6).length).toBe(2);
    // 濃さの上限は0.35。
    for (const alpha of log.filter(line => line.startsWith('globalAlpha=')).map(line => Number(line.slice(12)))) expect(alpha).toBeLessThanOrEqual(1);
    at(HIT_STAGES.blast + PILLAR.seconds + .01);
    expect(countOf(log, 'fillRect')).toBe(0);
    const calm = scene({ calm: true });
    calm.at(HIT_STAGES.blast + .05);
    expect(countOf(calm.log, 'fillRect')).toBe(0);
  });
  it('柱から石の色の破片が落ち、床で止まる。控えめモードでは3分の1', () => {
    const { pool, fired, play, f } = scene();
    play(0, HIT_STAGES.blast + PILLAR.shardFrom + .01);
    const shards = pool.items.filter(p => p.alive && stone(p));
    expect(fired.has('pillar-0')).toBe(true);
    expect(shards.length).toBe(2 * Math.round(increase(PILLAR.shards, f.intensity, .4)));
    for (const p of shards) {
      expect(p.gravity).toBeGreaterThan(0); expect(p.floor).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(H * PILLAR.top + 20);
      expect(Math.min(Math.abs(p.x / W - PILLAR.x[0]), Math.abs(p.x / W - PILLAR.x[1]))).toBeLessThanOrEqual(PILLAR.width / 2 + .01);
    }
    // 1.5秒ほど落とし続け、最後の回まで出る。
    play(HIT_STAGES.blast + PILLAR.shardFrom + .02, HIT_STAGES.blast + PILLAR.shardFrom + PILLAR.shardSpan);
    for (let k = 0; k < PILLAR.shardWaves; k++) expect(fired.has('pillar-' + k), `pillar-${k}`).toBe(true);
    expect(pool.items.filter(p => p.alive && stone(p)).length).toBeGreaterThan(shards.length * 3);
    // 落ちきった破片は床で止まっている。
    play(HIT_STAGES.blast + PILLAR.shardFrom + PILLAR.shardSpan, HIT_STAGES.blast + PILLAR.shardFrom + PILLAR.shardSpan + 1.8);
    const rested = pool.items.filter(p => p.alive && stone(p) && p.vy === 0 && p.y >= H * .8);
    expect(rested.length).toBeGreaterThan(0);
    const calm = scene({ calm: true });
    calm.play(0, HIT_STAGES.blast + PILLAR.shardFrom + .01);
    const fewer = calm.pool.items.filter(p => p.alive && stone(p)).length;
    expect(fewer).toBeGreaterThan(0);
    expect(fewer).toBeLessThanOrEqual(Math.ceil(shards.length / 2));
  });
});

describe('単発の命中は三段', () => {
  it('三段にするのは単発の攻撃だけ', () => {
    expect(stagesOf(1, 'attack')).toBe(HIT_STAGES);
    expect(HIT_STAGES.blast).toBeGreaterThan(0); expect(HIT_STAGES.wave).toBeGreaterThan(HIT_STAGES.blast);
    expect(stagesOf(3, 'attack')).toEqual({ blast: 0, wave: 0 });
    expect(stagesOf(1, 'defend')).toEqual({ blast: 0, wave: 0 });
  });
  it('0〜0.08秒は、狙いの一点に小さく白い芯の破裂だけ', () => {
    const { at, log, glows, pool, fired } = scene();
    at(.04);
    expect(pool.count).toBe(0);
    expect(fired.has('impact')).toBe(false);
    expect(countOf(log, 'ellipse')).toBe(0);
    expect(countOf(log, 'moveTo')).toBe(0);
    expect(countOf(log, 'fillRect')).toBe(0);
    expect(glows.length).toBeGreaterThan(0);
    const small = Math.max(...glows.map(g => g.r));
    for (const g of glows) {
      expect(g.core).toBe('#ffffff'); expect(g.main).toBe('#ffffff');
      expect(g.x).toBe(target.x); expect(g.y).toBe(target.y);
    }
    // 芯は小さい。破裂の光の半分に届かない。
    at(HIT_STAGES.blast + .01);
    expect(small).toBeLessThan(Math.max(...glows.map(g => g.r)) / 2);
  });
  it('0.08秒で破裂と粒の噴出（鍵は impact のまま）、0.2秒で輪', () => {
    const { at, log, pool, fired } = scene();
    at(HIT_STAGES.blast + .01);
    expect(fired.has('impact')).toBe(true);
    expect(pool.count).toBeGreaterThan(0);
    // 火花の線と亀裂は破裂と一緒に出る。輪はまだ。
    expect(countOf(log, 'moveTo')).toBeGreaterThan(0);
    const beforeWave = countOf(log, 'ellipse');
    at(HIT_STAGES.wave - .01);
    expect(countOf(log, 'ellipse')).toBe(beforeWave);
    at(HIT_STAGES.wave + .01);
    expect(countOf(log, 'ellipse')).toBeGreaterThan(beforeWave);
  });
  it('連弾は今までどおり命中と同時に弾ごとに届く', () => {
    const { at, pool, fired } = scene({}, { count: 3 });
    at(.01);
    expect(fired.has('impact0')).toBe(true);
    expect(pool.count).toBeGreaterThan(0);
  });
});
