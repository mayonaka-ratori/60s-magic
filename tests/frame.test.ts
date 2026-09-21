import { describe, it, expect } from 'vitest';
import { drawParticles, line, noise, SPARK_MAX_LENGTH, type Frame } from '../src/render/effects/frame';
import { ParticlePool } from '../src/render/effects/particles';
import { presets } from '../src/render/effects/presets';

// 仮のcanvasと試験用の魔法は tests/helpers.ts にまとめてある。
import { callRecorder as recorder, testFrame } from './helpers';

/** 部品が見るぶんだけの仮の Frame。光の絵は描かず、線だけを控える。 */
const frame = (c: CanvasRenderingContext2D, pool = new ParticlePool(4)): Frame => testFrame({ c, pool });

/** 火花の粒を1個だけ出し、描かれた線の端と端を返す。 */
function spark(vx: number, vy: number) {
  const { c, calls } = recorder();
  const pool = new ParticlePool(1); pool.reseed(7);
  pool.spawn({ x: 100, y: 100, vx, vy, life: 1, size: 2, kind: 1 });
  drawParticles(frame(c, pool));
  const from = calls.find(k => k.name === 'moveTo'), to = calls.find(k => k.name === 'lineTo');
  if (!from || !to) throw new Error('火花の線が描かれていない');
  return { from: from.args, to: to.args, length: Math.hypot(to.args[0] - from.args[0], to.args[1] - from.args[1]) };
}
const sparkLength = (vx: number, vy: number) => spark(vx, vy).length;

describe('火花の線の長さ', () => {
  it('どれだけ速くても上限の18画素を超えない', () => {
    // 向きを変えても、速さだけで長さが決まる。
    for (const speed of [0, 50, 200, 500, 1200, 5000, 40000]) {
      expect(sparkLength(speed * .6, speed * .8)).toBeLessThanOrEqual(SPARK_MAX_LENGTH + 1e-9);
      expect(sparkLength(-speed * .8, speed * .6)).toBeLessThanOrEqual(SPARK_MAX_LENGTH + 1e-9);
    }
    // 上限に届く速さでは、ちょうど18画素で止まる。
    expect(sparkLength(9000, 0)).toBeCloseTo(18, 6);
    expect(sparkLength(0, -30000)).toBeCloseTo(18, 6);
  });
  it('遅い粒は短く、速いほど長くなる', () => {
    // 止まっていても2画素ぶんあり、速さ100で5画素、速さ500で17画素。
    expect(sparkLength(100, 0)).toBeCloseTo(5, 6);
    expect(sparkLength(300, 400)).toBeCloseTo(17, 6);
    expect(sparkLength(200, 0)).toBeGreaterThan(sparkLength(100, 0));
    expect(sparkLength(700, 0)).toBeGreaterThan(sparkLength(300, 0));
  });
  it('線は粒の後ろへ伸び、止まっている粒では跳ねない', () => {
    const right = spark(400, 0);
    // 粒は (100,100) にいて、線はその手前から粒まで引かれる。
    expect(right.to).toEqual([100, 100]);
    expect(right.from[0]).toBeCloseTo(100 - 14, 6); expect(right.from[1]).toBeCloseTo(100, 6);
    const still = spark(0, 0);
    expect(still.from.every(Number.isFinite)).toBe(true);
    expect(still.length).toBe(0);
  });
});

describe('線の芯の色', () => {
  const strokesOf = (draw: (f: Frame) => void) => {
    const { c, calls } = recorder();
    draw(frame(c));
    return calls.filter(k => k.name === 'stroke');
  };
  const a = { x: 0, y: 0 }, b = { x: 40, y: 0 };
  it('芯の色を渡すと、芯だけその色になる', () => {
    const strokes = strokesOf(f => line(f, a, b, 4, 1, '#ff0000', 1.4, '#00ff00'));
    // にじみ、縁、芯の三本。前の二本は渡した色、芯だけ別の色。
    expect(strokes.map(s => s.strokeStyle)).toEqual(['#ff0000', '#ff0000', '#00ff00']);
    expect(strokes[2].lineWidth).toBeCloseTo(1.4, 6);
  });
  it('芯の色を渡さなければ、今までどおり属性の芯の色になる', () => {
    const strokes = strokesOf(f => line(f, a, b, 4, 1, '#ff0000'));
    expect(strokes).toHaveLength(3);
    expect(strokes[2].strokeStyle).toBe(presets.vivid.palettes.fire.core);
  });
  it('芯の太さを0にすると一本だけ引く', () => {
    const strokes = strokesOf(f => line(f, a, b, 3, 1, '#ff0000', 0, '#00ff00'));
    expect(strokes.map(s => s.strokeStyle)).toEqual(['#ff0000']);
  });
});

describe('決まった乱数', () => {
  it('引数の順や組み合わせが違えば、値も違う', () => {
    // 足すと同じ3になる組み合わせでも、別々の値になる。
    expect(new Set([noise(0, 3), noise(1, 2), noise(2, 1), noise(3, 0)]).size).toBe(4);
    expect(noise(1, 2)).not.toBe(noise(2, 1));
    // 広い範囲でも、番号と種の組み合わせごとに違う値になる。
    const seen = new Set<number>();
    for (let i = 0; i < 60; i++) for (let s = 0; s < 60; s++) seen.add(noise(i, s));
    expect(seen.size).toBe(60 * 60);
    // 大きな番号（段×1009＋枝×17＋節のような混ぜ方）でも重ならない。
    const wide = new Set<number>();
    for (let k = 50; k < 60; k++) for (let b = 0; b < 23; b++) for (let s = 0; s < 9; s++) wide.add(noise(k * 1009 + b * 17 + s, 13));
    expect(wide.size).toBe(10 * 23 * 9);
  });
  it('同じ引数なら必ず同じ値で、0以上1未満に収まる', () => {
    expect(noise(7, 5)).toBe(noise(7, 5));
    expect(noise(3)).toBe(noise(3, 0));
    for (let i = 0; i < 200; i++) {
      const v = noise(i * 13, i);
      expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1);
    }
  });
});
