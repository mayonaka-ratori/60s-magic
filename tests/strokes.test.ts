import { BEATS } from '../src/game/rounds';
import { AIM } from '../src/game/guard';
import { describe, it, expect } from 'vitest';
import { along, lastStrokes, ringClosure, spawnCount, speedRatio, tipSpeed, unit } from '../src/render/effects/strokes-math';
import { drawStrokeReactions, newStrokeMemory, type StrokeMemory } from '../src/render/effects/strokes';
import { ParticlePool } from '../src/render/effects/particles';
import { presets } from '../src/render/effects/presets';
import type { Frame } from '../src/render/effects/frame';
import type { Point, Recipe } from '../src/game/types';

/** 試験用の点列を作る。位置を並べ、一定の間隔で時刻を進める。 */
const path = (xy: [number, number][], from = 0, step = 16, stroke = 1, hand = 0): Point[] =>
  xy.map(([x, y], i) => ({ x, y, t: from + i * step, hand, stroke }));

/** 中心 (cx,cy)、半径 r の輪を n 点で作る。closeGap を足すと始点に戻りきらない。 */
const circle = (n: number, r = .2, cx = .5, cy = .5, sweep = 1) =>
  path([...Array(n)].map((_, i) => {
    const a = i / (n - 1) * Math.PI * 2 * sweep;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as [number, number];
  }));

describe('筆ごとの取り出し', () => {
  it('筆の番号で分かれ、新しい筆が先頭に来る', () => {
    const points = [...path([[0, 0], [.1, .1]], 0, 16, 1), ...path([[.5, .5], [.6, .6], [.7, .7]], 400, 16, 2)];
    const groups = lastStrokes(points);
    expect(groups.length).toBe(2);
    expect(groups[0][0].stroke).toBe(2);
    expect(groups[0].length).toBe(3);
    expect(groups[1][0].stroke).toBe(1);
  });
  it('手が二つで点が混ざっても筆ごとにまとまり、本数は上限で切れる', () => {
    const a = path([[0, 0], [.1, 0]], 0, 16, 1, 0), b = path([[.9, .9], [.8, .9]], 8, 16, 2, 1), c = path([[.5, .1]], 500, 16, 3, 0);
    const mixed = [a[0], b[0], a[1], b[1], c[0]];
    expect(lastStrokes(mixed).map(g => g[0].stroke)).toEqual([3, 2, 1]);
    expect(lastStrokes(mixed, 1).length).toBe(1);
    expect(lastStrokes([]).length).toBe(0);
  });
});

describe('筆先の速さ', () => {
  it('点が足りない、時刻が進まないときは0', () => {
    expect(tipSpeed([]).speed).toBe(0);
    expect(tipSpeed(path([[0, 0]])).speed).toBe(0);
    expect(tipSpeed(path([[0, 0], [.5, 0]], 0, 0)).speed).toBe(0);
  });
  it('同じ道のりを短い時間で動くほど速い', () => {
    const slow = tipSpeed(path([[.1, .5], [.15, .5], [.2, .5]], 0, 50), 1000, 1000);
    const fast = tipSpeed(path([[.1, .5], [.15, .5], [.2, .5]], 0, 10), 1000, 1000);
    expect(fast.speed).toBeGreaterThan(slow.speed * 3);
    // 0.1 を 0.02秒で動けば、毎秒5。
    expect(fast.speed).toBeCloseTo(5, 3);
    expect(fast.dir.x).toBeCloseTo(1, 6);
    expect(fast.dir.y).toBeCloseTo(0, 6);
  });
  it('横長の画面では、横の動きが画素の見た目どおりに長くなる', () => {
    const across = tipSpeed(path([[0, .5], [.1, .5]], 0, 100), 2000, 1000).speed;
    const down = tipSpeed(path([[.5, 0], [.5, .1]], 0, 100), 2000, 1000).speed;
    expect(across).toBeCloseTo(down * 2, 6);
    expect(unit(2000, 1000)).toEqual({ sx: 2, sy: 1 });
  });
  it('行ったり来たりの震えも道のりとして数え、向きは行き先を指す', () => {
    const shake = tipSpeed(path([[.5, .5], [.55, .5], [.5, .5], [.55, .5]], 0, 30), 1000, 1000);
    expect(shake.speed).toBeGreaterThan(1);
    expect(shake.dir.x).toBeCloseTo(1, 6);
  });
});

describe('速さの度合い', () => {
  it('ゆっくりなら0、速ければ1で、間は増えていく', () => {
    expect(speedRatio(0)).toBe(0);
    expect(speedRatio(.2)).toBe(0);
    expect(speedRatio(9)).toBe(1);
    expect(speedRatio(.8)).toBeGreaterThan(0);
    expect(speedRatio(.8)).toBeLessThan(1);
    expect(speedRatio(1.1)).toBeGreaterThan(speedRatio(.6));
  });
});

describe('輪が閉じた判定', () => {
  it('始点へ戻った十分な長さの輪だけを認める', () => {
    const closed = ringClosure(circle(40), 1000, 1000);
    expect(closed).not.toBeNull();
    expect(closed!.center.x).toBeCloseTo(.5, 1);
    expect(closed!.center.y).toBeCloseTo(.5, 1);
    expect(closed!.size).toBeGreaterThan(.3);
  });
  it('点が20個に満たない輪は認めない', () => {
    expect(ringClosure(circle(12), 1000, 1000)).toBeNull();
  });
  it('四分の三で止めた弧は、始点から離れているので認めない', () => {
    expect(ringClosure(circle(40, .2, .5, .5, .75), 1000, 1000)).toBeNull();
  });
  it('始点の近くで震えただけの線は輪にしない', () => {
    const tiny = path([...Array(30)].map((_, i) => [.5 + (i % 2) * .005, .5] as [number, number]));
    expect(ringClosure(tiny, 1000, 1000)).toBeNull();
  });
  it('行って戻るだけの直線は、始点に帰っても輪にしない', () => {
    const out: [number, number][] = [...Array(20)].map((_, i) => [.3 + i * .02, .5]);
    const back: [number, number][] = [...out].reverse();
    expect(ringClosure(path([...out, ...back]), 1000, 1000)).toBeNull();
    // わずかに膨らんだだけの往復も輪にしない。
    const thin: [number, number][] = back.map(([x, y]) => [x, y + .004] as [number, number]);
    expect(ringClosure(path([...out, ...thin]), 1000, 1000)).toBeNull();
  });
  it('円や三角のように面を囲む線は輪と認める', () => {
    expect(ringClosure(circle(40), 1000, 1000)).not.toBeNull();
    const corners: [number, number][] = [[.5, .3], [.7, .65], [.3, .65], [.5, .3]];
    const triangle: [number, number][] = [];
    for (let i = 0; i < corners.length - 1; i++)
      for (let k = 0; k < 10; k++)
        triangle.push([corners[i][0] + (corners[i + 1][0] - corners[i][0]) * k / 10,
          corners[i][1] + (corners[i + 1][1] - corners[i][1]) * k / 10] as [number, number]);
    triangle.push(corners[0]);
    expect(ringClosure(path(triangle), 1000, 1000)).not.toBeNull();
  });
  it('短辺の4%より広い隙間があれば閉じていない', () => {
    const open = circle(40, .2, .5, .5, .9);
    expect(ringClosure(open, 1000, 1000)).toBeNull();
    // 判定をゆるめれば同じ線でも閉じたことになる。
    expect(ringClosure(open, 1000, 1000, .15)).not.toBeNull();
  });
});

describe('輪郭の上の位置', () => {
  it('0で始点、1で終点、間は点と点の間を進む', () => {
    const line = path([[0, 0], [1, 0], [1, 1]]);
    expect(along(line, 0)).toEqual({ x: 0, y: 0 });
    expect(along(line, 1)).toEqual({ x: 1, y: 1 });
    expect(along(line, .25).x).toBeCloseTo(.5, 6);
    expect(along(line, -3)).toEqual({ x: 0, y: 0 });
    expect(along(line, 9)).toEqual({ x: 1, y: 1 });
    expect(along([], .5)).toEqual({ x: .5, y: .5 });
  });
});

describe('一コマに出す粒の数', () => {
  it('端数は確率で1個になり、上限と0を守る', () => {
    expect(spawnCount(30, 1 / 60, () => .99)).toBe(0);
    expect(spawnCount(30, 1 / 60, () => 0)).toBe(1);
    expect(spawnCount(300, 1 / 60, () => .5)).toBe(4);
    expect(spawnCount(300, 1 / 60, () => .5, 2)).toBe(2);
    expect(spawnCount(-10, 1 / 60, () => 0)).toBe(0);
    expect(spawnCount(60, 0, () => 0)).toBe(0);
  });
});

describe('描く動きへの反応の覚え書き', () => {
  const recipe = (): Recipe => ({ version: 'recipe-1', element: 'fire', purpose: 'attack', form: 'orb', trajectory: 'straight', count: 1, explicitCount: null,
    defense: .3, area: .5, duration: .5, concentration: .5, enclosure: false, split: false, developsPrevious: null, motionSpeechAligned: null,
    noAttack: false, name: '', source: 'local', decisions: {}, assistance: [], model: null });
  /** 描く命令を受け流すだけの仮のcanvas。どの命令も自分を返す。 */
  const stubContext = () => {
    const held: Record<string, unknown> = {};
    const fake: unknown = new Proxy(held, {
      get: (target, key: string) => (key in target ? target[key] : () => fake),
      set: (target, key: string, value) => { target[key] = value; return true; },
    });
    return fake as CanvasRenderingContext2D;
  };
  /** 一枚の画面の一コマぶん。粒の置き場と一度きりの覚えは画面ごとに持つ。 */
  const frame = (points: Point[], t: number, pool: ParticlePool, fired: Set<string>): Frame => ({
    c: stubContext(), w: 1280, h: 720, t, dt: 1 / 60,
    sprites: { draw: () => {} } as unknown as Frame['sprites'], pool,
    preset: presets.vivid, palette: presets.vivid.palettes.fire, intensity: 1,
    recipe: recipe(), locked: false, origin: { x: 640, y: 500 }, target: { x: 900, y: 360 },
    accent: null, live: { words: [], amount: 0, voice: 0, rings: 0, covered: false }, points, cursors: [], beat: BEATS[0], guard: null, aim: AIM, inherited: [], calm: false,
    once: (key, run) => { if (!fired.has(key)) { fired.add(key); run(); } },
  });
  const line = path([[.2, .5], [.3, .5], [.4, .5]]);

  it('画面が二つあっても覚え書きは混ざらない', () => {
    const a = newStrokeMemory(), b = newStrokeMemory();
    const poolA = new ParticlePool(50), poolB = new ParticlePool(50);
    drawStrokeReactions(frame(line, 5, poolA, new Set()), a);
    expect(a.opened.get(1)).toBe(5);
    expect(b.opened.size).toBe(0);
    // 2枚目は自分の時計で筆が置かれたことにする。1枚目の時刻を引き継がない。
    drawStrokeReactions(frame(line, 5.4, poolB, new Set()), b);
    expect(b.opened.get(1)).toBe(5.4);
    expect(a.opened.get(1)).toBe(5);
    // どちらの画面でも筆を置いた粒が出る。
    expect(poolA.count).toBeGreaterThan(0);
    expect(poolB.count).toBe(poolA.count);
  });
  it('覚え書きを作り直すと忘れ、時刻が戻ったときも忘れる', () => {
    const memory: StrokeMemory = newStrokeMemory(), pool = new ParticlePool(50), fired = new Set<string>();
    drawStrokeReactions(frame(line, 5, pool, fired), memory);
    expect(memory.opened.size).toBe(1);
    // 時刻が戻ったら（確認画面のつまみなど）覚え書きを捨てる。
    drawStrokeReactions(frame(line, 3, pool, fired), memory);
    expect(memory.opened.size).toBe(0);
    // 作り直した覚え書きは空。
    expect(newStrokeMemory().opened.size).toBe(0);
    expect(newStrokeMemory().lastTime).toBe(-1);
  });
});
