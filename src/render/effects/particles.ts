/** 粒の置き場。配列を使い回し、毎コマ作り直さない。 */
export type Particle = {
  alive: boolean; x: number; y: number; vx: number; vy: number;
  /** 残り寿命（秒）と最初の寿命 */
  life: number; span: number; size: number;
  /** 重力（px/秒²）、空気の抵抗（1秒で残る割合）、吸い込み先 */
  gravity: number; drag: number; pull: number; px: number; py: number;
  color: string; core: string;
  /** 0=光の粒、1=線の火花、2=かけら */
  kind: number; seed: number;
};

const blank = (): Particle => ({ alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, span: 1, size: 2, gravity: 0, drag: 1, pull: 0, px: 0, py: 0, color: '#fff', core: '#fff', kind: 0, seed: 0 });

export class ParticlePool {
  readonly items: Particle[] = [];
  private next = 0;
  private rng = 1;
  constructor(readonly max: number) { for (let i = 0; i < max; i++) this.items.push(blank()); }
  /** 同じ演出は同じ散り方になるよう、乱数の種を固定できる。 */
  reseed(seed: number) { this.rng = (seed | 0) || 1; }
  random() { this.rng = (Math.imul(this.rng, 1664525) + 1013904223) | 0; return (this.rng >>> 0) / 4294967296; }
  get count() { let n = 0; for (const p of this.items) if (p.alive) n++; return n; }
  clear() { for (const p of this.items) p.alive = false; this.next = 0; }
  spawn(init: Partial<Particle>) {
    // 空きがなければ一番古い粒を使い回す。上限を超えて増やさない。
    for (let i = 0; i < this.max; i++) {
      const p = this.items[(this.next + i) % this.max];
      if (!p.alive) { this.next = (this.next + i + 1) % this.max; return this.fill(p, init); }
    }
    const p = this.items[this.next]; this.next = (this.next + 1) % this.max; return this.fill(p, init);
  }
  private fill(p: Particle, init: Partial<Particle>) {
    Object.assign(p, blank(), init); p.alive = true; p.span = p.life; p.seed = this.random(); return p;
  }
  update(dt: number) {
    if (dt <= 0) return;
    const keep = Math.pow(1, dt);
    for (const p of this.items) {
      if (!p.alive) continue;
      p.life -= dt; if (p.life <= 0) { p.alive = false; continue; }
      if (p.pull) {
        const dx = p.px - p.x, dy = p.py - p.y, d = Math.hypot(dx, dy) || 1;
        p.vx += dx / d * p.pull * dt; p.vy += dy / d * p.pull * dt;
        if (d < 6) { p.alive = false; continue; }
      }
      p.vy += p.gravity * dt;
      const drag = p.drag === 1 ? keep : Math.pow(p.drag, dt);
      p.vx *= drag; p.vy *= drag;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }
}
