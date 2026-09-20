/** 粒の置き場。配列を使い回し、毎コマ作り直さない。 */
export type Particle = {
  alive: boolean; x: number; y: number; vx: number; vy: number;
  /** 残り寿命（秒）と最初の寿命 */
  life: number; span: number; size: number;
  /** 重力（px/秒²）、空気の抵抗（1秒で残る割合）、吸い込み先 */
  gravity: number; drag: number; pull: number; px: number; py: number;
  /** 床の高さ。0より大きいとき、そこまで落ちたら止まって転がらなくなる */
  floor: number;
  color: string; core: string;
  /** 0=光の粒、1=線の火花、2=かけら、3=煙 */
  kind: number; seed: number;
};

/** 粒を既定値へ戻す。新しいオブジェクトは作らず、全項目を書き直す。 */
function resetParticle(p: Partial<Particle>): Particle {
  p.alive = false; p.x = 0; p.y = 0; p.vx = 0; p.vy = 0; p.life = 0; p.span = 1; p.size = 2;
  p.gravity = 0; p.drag = 1; p.pull = 0; p.px = 0; p.py = 0; p.floor = 0;
  p.color = '#fff'; p.core = '#fff'; p.kind = 0; p.seed = 0;
  return p as Particle;
}
/** 置き場を作るときだけ粒を作る。あとはこの入れ物を最後まで使い回す。 */
const blank = (): Particle => resetParticle({});

export class ParticlePool {
  readonly items: Particle[] = [];
  /** 空いている添え字を並べた列。先頭から取り、消えた粒は末尾に戻す。探し回らずに空きが見つかる。 */
  private free: number[] = [];
  /** free の何番目まで使ったか。使い切ったら列ごと空にして0に戻す。 */
  private head = 0;
  private next = 0;
  private rng = 1;
  constructor(readonly max: number) { for (let i = 0; i < max; i++) { this.items.push(blank()); this.free.push(i); } }
  /** 同じ演出は同じ散り方になるよう、乱数の種を固定できる。 */
  reseed(seed: number) { this.rng = (seed | 0) || 1; }
  random() { this.rng = (Math.imul(this.rng, 1664525) + 1013904223) | 0; return (this.rng >>> 0) / 4294967296; }
  get count() { let n = 0; for (const p of this.items) if (p.alive) n++; return n; }
  clear() {
    for (const p of this.items) p.alive = false;
    this.free.length = 0; for (let i = 0; i < this.max; i++) this.free.push(i);
    this.head = 0; this.next = 0;
  }
  spawn(init: Partial<Particle>) { return this.fill(this.items[this.take()], init); }
  /** 使う粒の添え字。空きがなければ一番古い粒を使い回す。上限を超えて増やさない。 */
  private take() {
    while (this.head < this.free.length) {
      const i = this.free[this.head++];
      if (this.head >= this.free.length) { this.free.length = 0; this.head = 0; }
      if (!this.items[i].alive) return i;
    }
    const i = this.next; this.next = (this.next + 1) % this.max; return i;
  }
  /** 消えた粒の添え字を空きの列へ戻す。 */
  private release(i: number) { this.free.push(i); }
  private fill(p: Particle, init: Partial<Particle>) {
    // 今ある粒を既定値へ戻してから指定を当てる。山場でごみ集めが走らないよう、ここでは何も作らない。
    resetParticle(p); Object.assign(p, init); p.alive = true; p.span = p.life; p.seed = this.random(); return p;
  }
  update(dt: number) {
    if (dt <= 0) return;
    for (let i = 0; i < this.items.length; i++) {
      const p = this.items[i];
      if (!p.alive) continue;
      p.life -= dt; if (p.life <= 0) { p.alive = false; this.release(i); continue; }
      if (p.pull) {
        const dx = p.px - p.x, dy = p.py - p.y, d = Math.hypot(dx, dy) || 1;
        p.vx += dx / d * p.pull * dt; p.vy += dy / d * p.pull * dt;
        if (d < 6) { p.alive = false; this.release(i); continue; }
      }
      p.vy += p.gravity * dt;
      if (p.drag !== 1) { const drag = Math.pow(p.drag, dt); p.vx *= drag; p.vy *= drag; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      // 床に届いたかけらは、そこで止まって残る。
      if (p.floor > 0 && p.y >= p.floor) { p.y = p.floor; p.vy = 0; p.gravity = 0; p.vx *= Math.pow(.02, dt); }
    }
  }
}
