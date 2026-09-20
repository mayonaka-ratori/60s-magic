import { clamp } from '../../game/motion';
import { increase } from './presets';
import { CHARGE_AT, RELEASE_AT } from './screen';
import { few, glow, line, noise, slow, type Frame } from './frame';

/** 蓄積が終わる時刻（秒）。そのまま放出につながる。 */
const CHARGE_END = RELEASE_AT;
/** 地面から昇る細い光の本数。入力の量が多いほど増える。 */
const RISING_STREAKS = 6, RISING_STREAKS_BY_AMOUNT = 8;

/** 蓄積と完成（14〜17秒）。粒が中心へ吸い込まれ、魔法陣が回り、中心が脈打つ。 */
export function drawCharge(f: Frame) {
  const { c, t, origin: o, preset, intensity } = f;
  if (t < CHARGE_AT || t >= CHARGE_END + .3) return;
  const charge = clamp((t - CHARGE_AT) / 3), out = clamp((t - CHARGE_END) / .3);
  const fade = 1 - out;
  // 入力の量。重ねて描き、重ねて唱えるほど溜まりが濃くなる。0でも今までの見た目は変わらない。
  const amount = clamp(f.live.amount);
  const reach = 110 + intensity * 40 + amount * 40;

  // 周りから中心へ吸い込まれる粒。横向きの速さを持たせ、渦を巻いて中心へ落ちる。時間とともに数と速さが増える。
  if (t < CHARGE_END - .15) {
    const rate = few(f, increase(preset.chargeParticles, intensity, .6) * (0.3 + charge * 1.2) * (1 + amount * .9));
    const expected = rate * f.dt, n = Math.min(20, Math.floor(expected) + (f.pool.random() < expected % 1 ? 1 : 0));
    for (let i = 0; i < n; i++) {
      const a = f.pool.random() * Math.PI * 2, d = reach * (0.35 + f.pool.random() * .6), swirl = 90 + charge * 120;
      f.pool.spawn({ x: o.x + Math.cos(a) * d, y: o.y + Math.sin(a) * d * .6, vx: -Math.sin(a) * swirl, vy: Math.cos(a) * swirl * .6 - 20, life: 1.6, size: 1.2 + f.pool.random() * 1.6,
        pull: 700 + charge * 1300, px: o.x, py: o.y, drag: .45, color: f.palette.main, core: f.palette.core, kind: 0 });
    }
  }
  // 地面から昇る細い光。
  if (preset.magicCircle) {
    const streaks = Math.round(increase(RISING_STREAKS + amount * RISING_STREAKS_BY_AMOUNT, intensity));
    for (let i = 0; i < streaks; i++) {
      const u = (t * (0.5 + noise(i, 3) * .5) + noise(i, 4)) % 1, x = o.x + (noise(i, 5) - .5) * reach * 1.4, top = o.y + 40 - u * (90 + intensity * 40);
      line(f, { x, y: top + 30 }, { x, y: top }, 1.2, charge * fade * (1 - u) * .5, f.palette.main, 0);
    }
    // 魔法陣。外の目盛りと内の多角形が逆向きに回り、終わりに向けて速くなる。
    // 入力の量が多いほど枚数が増える（1〜3枚）。外側ほど大きく、薄く、ゆっくり逆向きに回る。
    const rings = 1 + Math.round(amount * 2);
    const base = (36 + intensity * 12) * (0.6 + charge * .5), spin = t * (1.5 + charge * charge * 8), alpha = charge * fade;
    for (let k = 0; k < rings; k++) {
      const r = base * (1 + k * .42), turn = k % 2 ? -spin / (1 + k * .8) : spin / (1 + k * .8), a0 = alpha / (1 + k * .9);
      c.save(); c.translate(o.x, o.y); c.scale(1, .42);
      c.globalAlpha = a0 * .8; c.strokeStyle = f.palette.main; c.lineWidth = 1.5;
      c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.arc(0, 0, r * 1.22, 0, Math.PI * 2); c.stroke();
      c.rotate(turn); c.lineWidth = 2; c.beginPath();
      for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, len = i % 3 ? 0.08 : 0.16; c.moveTo(Math.cos(a) * r * 1.22, Math.sin(a) * r * 1.22); c.lineTo(Math.cos(a) * r * (1.22 + len), Math.sin(a) * r * (1.22 + len)); }
      c.stroke();
      c.rotate(-turn * 2.3); c.globalAlpha = a0 * .6; c.lineWidth = 1.2; c.beginPath();
      for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI * 2; if (i) c.lineTo(Math.cos(a) * r * .8, Math.sin(a) * r * .8); else c.moveTo(Math.cos(a) * r * .8, Math.sin(a) * r * .8); }
      c.stroke(); c.restore();
    }
  }
  // 中心の脈動。周期が短くなり、完成の直前で最大になる。
  const beat = 0.5 + 0.5 * Math.sin(t * slow(f, 8 + charge * charge * 26));
  glow(f, o.x, o.y, (5 + charge * 12) * (1 + amount * .5) * (1 + beat * (.3 + amount * .35) * charge), (.35 + charge * .5) * fade + out * .4);
  for (let i = 0; i < 3; i++) { const p = (t * .9 + i / 3) % 1; c.globalAlpha = (1 - p) * charge * fade * .5; c.lineWidth = 1.2; c.strokeStyle = f.palette.core; c.beginPath(); c.ellipse(o.x, o.y, 8 + p * 30, (8 + p * 30) * .5, 0, 0, Math.PI * 2); c.stroke(); }
}
