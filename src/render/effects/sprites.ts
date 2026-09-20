import { clamp } from '../../game/motion';

/**
 * 光の粒を毎コマ放射状グラデーションで作らず、一度だけ小さな画像に描いて使い回す。
 * shadowBlur も使わない。色の組ごとに一枚を持つ。
 */
const SIZE = 64;
export class GlowSprites {
  private cache = new Map<string, HTMLCanvasElement>();
  private get(core: string, main: string) {
    const key = core + main;
    let sprite = this.cache.get(key);
    if (sprite) return sprite;
    sprite = document.createElement('canvas'); sprite.width = SIZE; sprite.height = SIZE;
    const c = sprite.getContext('2d')!, half = SIZE / 2;
    const gradient = c.createRadialGradient(half, half, 0, half, half, half);
    // 芯（ほぼ白）を細くはっきり、縁（属性色）をその外に、にじみは大きく薄く。
    gradient.addColorStop(0, core); gradient.addColorStop(.2, core); gradient.addColorStop(.3, main);
    gradient.addColorStop(.44, main); gradient.addColorStop(.62, main + '77'); gradient.addColorStop(.82, main + '26'); gradient.addColorStop(1, main + '00');
    c.fillStyle = gradient; c.fillRect(0, 0, SIZE, SIZE);
    this.cache.set(key, sprite);
    return sprite;
  }
  /** 半径 r の芯を持つ光。見た目の広がりは r の4倍。 */
  draw(c: CanvasRenderingContext2D, x: number, y: number, r: number, core: string, main: string, alpha: number) {
    if (alpha <= .003 || r <= 0) return;
    const size = r * 8;
    c.globalAlpha = clamp(alpha);
    c.drawImage(this.get(core, main), x - size / 2, y - size / 2, size, size);
  }
}
