import { describe, it, expect } from 'vitest';
import { BEATS } from '../src/game/rounds';
import { AIM } from '../src/game/guard';
import { presets, increase } from '../src/render/effects/presets';
import { ParticlePool } from '../src/render/effects/particles';
import type { Frame } from '../src/render/effects/frame';
import type { Recipe } from '../src/game/types';
import { HIT_STAGES, PILLAR, PILLAR_STONE, WIDE_RING, drawImpact, groundMarkLife, stagesOf, wideRingAt } from '../src/render/effects/impact';

const first = BEATS[0], finish = BEATS[2];
const W = 1280, H = 720, target = { x: 900, y: 360 };
const recipe = (over: Partial<Recipe> = {}): Recipe => ({ version: 'recipe-1', element: 'fire', purpose: 'attack', form: 'orb', trajectory: 'straight', count: 1, explicitCount: null, defense: .3, area: .5, duration: .5, concentration: .5,
  enclosure: false, split: false, developsPrevious: null, motionSpeechAligned: null, noAttack: false, name: '', source: 'local', decisions: {}, assistance: [], model: null, ...over });

/** 描く命令を受け流すだけの仮の canvas。数の指定だけを記録する。 */
const digits = (v: number) => Math.round(v * 1000) / 1000;
const stubContext = (log: string[]) => {
  const held: Record<string, unknown> = {};
  const fake: unknown = new Proxy(held, {
    get: (held, key: string) => (key in held ? held[key] : (...args: unknown[]) => {
      log.push(key + ':' + args.filter(a => typeof a === 'number').map(a => digits(a as number)).join(','));
      return fake;
    }),
    set: (held, key: string, value) => { if (typeof value === 'number') log.push(key + '=' + digits(value)); held[key] = value; return true; },
  });
  return fake as CanvasRenderingContext2D;
};
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
  const f: Frame = {
    c: stubContext(log), w: W, h: H, t: first.impact, dt: 1 / 60,
    sprites: { draw: (_c: unknown, x: number, y: number, r: number, core: string, main: string, alpha: number) => glows.push({ x, y, r, core, main, alpha }) } as unknown as Frame['sprites'],
    pool, preset: presets.vivid, palette: presets.vivid.palettes.fire, intensity: 1.5,
    recipe: recipe(spell), locked: true, origin: { x: 200, y: 500 }, target, accent: null,
    live: { words: [], amount: 0, voice: 0, rings: 0 }, points: [], cursors: [], beat: first, guard: null, aim: AIM, inherited: [], calm: false,
    once: (key, run) => { if (!fired.has(key)) { fired.add(key); run(); } }, ...over,
  };
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
  it('受け渡しの1.5秒前から薄れ始めて、受け渡しで消える', () => {
    // 命中の2.5秒後は、前は消えていたが今は濃いまま。
    expect(groundMarkLife(first.impact + 2.5, first)).toBe(1);
    expect(groundMarkLife(first.handoff - 1.5, first)).toBe(1);
    expect(groundMarkLife(first.handoff - .75, first)).toBeCloseTo(.5, 6);
    expect(groundMarkLife(first.handoff, first)).toBe(0);
    expect(groundMarkLife(first.end, first)).toBe(0);
  });
  it('とどめの回は余韻の始まりから2秒で消える（今までどおり）', () => {
    expect(groundMarkLife(finish.impact + 3, finish)).toBe(1);
    expect(groundMarkLife(finish.handoff, finish)).toBe(1);
    expect(groundMarkLife(finish.handoff + 1, finish)).toBeCloseTo(.5, 6);
    expect(groundMarkLife(finish.handoff + 2, finish)).toBe(0);
  });
  it('命中の3秒後も跡の楕円を描き、受け渡しの時刻には描かない', () => {
    const { at, log } = scene();
    at(3); expect(countOf(log, 'ellipse')).toBeGreaterThan(0);
    at(first.handoff - first.impact); expect(countOf(log, 'ellipse')).toBe(0);
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
  it('左右の柱を照らす帯は、破裂から0.25秒だけ、左右の端の近くに出る', () => {
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
  });
  it('控えめモードでは帯を出さない', () => {
    const { at, log } = scene({ calm: true });
    at(HIT_STAGES.blast + .05);
    expect(countOf(log, 'fillRect')).toBe(0);
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
    expect(HIT_STAGES).toEqual({ blast: .08, wave: .2 });
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
    const mainSize = 17 * (1 + 1.5 * .15);
    for (const g of glows) {
      expect(g.core).toBe('#ffffff'); expect(g.main).toBe('#ffffff');
      expect(g.x).toBe(target.x); expect(g.y).toBe(target.y);
      expect(g.r).toBeLessThan(mainSize * .5);
    }
  });
  it('0.08秒で破裂と粒の噴出（鍵は impact のまま）、0.2秒で輪', () => {
    const { at, log, pool, fired } = scene();
    at(HIT_STAGES.blast + .01);
    expect(fired.has('impact')).toBe(true);
    expect(pool.count).toBe(Math.round(increase(presets.vivid.impactParticles, 1.5, .5)));
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
