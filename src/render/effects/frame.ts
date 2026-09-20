import type { Recipe } from '../../game/types';
import type { EffectPreset, Palette } from './presets';
import type { GlowSprites } from './sprites';
import type { ParticlePool } from './particles';

export type XY = { x: number; y: number };
/** 各部品が受け取る、そのコマの道具と値。部品は属性名ではなく色と派手さだけを見る。 */
export type Frame = {
  c: CanvasRenderingContext2D; w: number; h: number;
  /** 演出の時刻（秒）。命中の停止を含む */
  t: number;
  /** 前のコマからの経過（秒） */
  dt: number;
  sprites: GlowSprites; pool: ParticlePool; preset: EffectPreset; palette: Palette; intensity: number;
  recipe: Recipe; origin: XY; target: XY;
  /** 一度だけ実行する。粒の発生などに使う */
  once: (key: string, run: () => void) => void;
};

/** 同じ番号と種で同じ値を返す、0〜1の決まった乱数。 */
export function noise(i: number, seed = 0) {
  const x = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
  return x - Math.floor(x);
}
export const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
export const smooth = (x: number) => { const p = Math.min(1, Math.max(0, x)); return p * p * (3 - 2 * p); };

export function glow(f: Frame, x: number, y: number, r: number, alpha: number, main = f.palette.main, core = f.palette.core) {
  f.sprites.draw(f.c, x, y, r * f.preset.glowScale, core, main, alpha);
}
export function line(f: Frame, a: XY, b: XY, width: number, alpha: number, color = f.palette.main, coreWidth = width * .3) {
  const c = f.c; c.globalAlpha = alpha; c.lineWidth = width; c.strokeStyle = color;
  c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
  if (coreWidth > 0) { c.lineWidth = coreWidth; c.strokeStyle = f.palette.core; c.stroke(); }
}
/** 粒を描く。光の粒、線の火花、かけらの3種類。 */
export function drawParticles(f: Frame, alphaScale = 1) {
  const c = f.c;
  for (const p of f.pool.items) {
    if (!p.alive) continue;
    const u = p.life / p.span, alpha = Math.min(1, u * 1.6) * alphaScale;
    if (p.kind === 1) {
      const len = Math.hypot(p.vx, p.vy) * .03 + 2;
      const nx = p.vx / (len * 33 + 1e-6), ny = p.vy / (len * 33 + 1e-6);
      c.globalAlpha = alpha; c.lineWidth = p.size; c.strokeStyle = u > .5 ? p.core : p.color;
      c.beginPath(); c.moveTo(p.x - nx * len, p.y - ny * len); c.lineTo(p.x, p.y); c.stroke();
    } else if (p.kind === 2) {
      c.globalAlpha = alpha; c.fillStyle = p.color;
      const s = p.size * (0.5 + u), a = p.seed * 6.28 + p.life * 5;
      c.beginPath(); c.moveTo(p.x + Math.cos(a) * s, p.y + Math.sin(a) * s); c.lineTo(p.x + Math.cos(a + 2.1) * s * .6, p.y + Math.sin(a + 2.1) * s * .6); c.lineTo(p.x + Math.cos(a + 4.2) * s, p.y + Math.sin(a + 4.2) * s); c.closePath(); c.fill();
    } else f.sprites.draw(c, p.x, p.y, p.size * (0.4 + u * .6) * f.preset.glowScale, p.core, p.color, alpha);
  }
}
