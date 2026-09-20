import { clamp } from '../../game/motion';
import { increase } from './presets';
import { glow, line, noise, type Frame } from './frame';

const CHARGE_AT = 14, CHARGE_END = 17;

/** 蓄積と完成（14〜17秒）。粒が中心へ吸い込まれ、魔法陣が回り、中心が脈打つ。 */
export function drawCharge(f: Frame) {
  const { c, t, origin: o, preset, intensity } = f;
  if (t < CHARGE_AT || t >= CHARGE_END + .3) return;
  const charge = clamp((t - CHARGE_AT) / 3), out = clamp((t - CHARGE_END) / .3);
  const fade = 1 - out;
  const reach = 110 + intensity * 40;

  // 周りから中心へ吸い込まれる粒。横向きの速さを持たせ、渦を巻いて中心へ落ちる。時間とともに数と速さが増える。
  if (t < CHARGE_END - .15) {
    const rate = increase(preset.chargeParticles, intensity, .6) * (0.3 + charge * 1.2);
    const expected = rate * f.dt, n = Math.min(12, Math.floor(expected) + (f.pool.random() < expected % 1 ? 1 : 0));
    for (let i = 0; i < n; i++) {
      const a = f.pool.random() * Math.PI * 2, d = reach * (0.35 + f.pool.random() * .6), swirl = 90 + charge * 120;
      f.pool.spawn({ x: o.x + Math.cos(a) * d, y: o.y + Math.sin(a) * d * .6, vx: -Math.sin(a) * swirl, vy: Math.cos(a) * swirl * .6 - 20, life: 1.6, size: 1.2 + f.pool.random() * 1.6,
        pull: 700 + charge * 1300, px: o.x, py: o.y, drag: .45, color: f.palette.main, core: f.palette.core, kind: 0 });
    }
  }
  // 地面から昇る細い光。
  if (preset.magicCircle) {
    const streaks = Math.round(increase(6, intensity));
    for (let i = 0; i < streaks; i++) {
      const u = (t * (0.5 + noise(i, 3) * .5) + noise(i, 4)) % 1, x = o.x + (noise(i, 5) - .5) * reach * 1.4, top = o.y + 40 - u * (90 + intensity * 40);
      line(f, { x, y: top + 30 }, { x, y: top }, 1.2, charge * fade * (1 - u) * .5, f.palette.main, 0);
    }
    // 魔法陣。外の目盛りと内の多角形が逆向きに回り、終わりに向けて速くなる。
    const r = (36 + intensity * 12) * (0.6 + charge * .5), spin = t * (1.5 + charge * charge * 8), alpha = charge * fade;
    c.save(); c.translate(o.x, o.y); c.scale(1, .42);
    c.globalAlpha = alpha * .8; c.strokeStyle = f.palette.main; c.lineWidth = 1.5;
    c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(0, 0, r * 1.22, 0, Math.PI * 2); c.stroke();
    c.rotate(spin); c.lineWidth = 2; c.beginPath();
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, len = i % 3 ? 0.08 : 0.16; c.moveTo(Math.cos(a) * r * 1.22, Math.sin(a) * r * 1.22); c.lineTo(Math.cos(a) * r * (1.22 + len), Math.sin(a) * r * (1.22 + len)); }
    c.stroke();
    c.rotate(-spin * 2.3); c.globalAlpha = alpha * .6; c.lineWidth = 1.2; c.beginPath();
    for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI * 2; if (i) c.lineTo(Math.cos(a) * r * .8, Math.sin(a) * r * .8); else c.moveTo(Math.cos(a) * r * .8, Math.sin(a) * r * .8); }
    c.stroke(); c.restore();
  }
  // 中心の脈動。周期が短くなり、完成の直前で最大になる。
  const beat = 0.5 + 0.5 * Math.sin(t * (8 + charge * charge * 26));
  glow(f, o.x, o.y, (5 + charge * 12) * (1 + beat * .3 * charge), (.35 + charge * .5) * fade + out * .4);
  for (let i = 0; i < 3; i++) { const p = (t * .9 + i / 3) % 1; c.globalAlpha = (1 - p) * charge * fade * .5; c.lineWidth = 1.2; c.strokeStyle = f.palette.core; c.beginPath(); c.ellipse(o.x, o.y, 8 + p * 30, (8 + p * 30) * .5, 0, 0, Math.PI * 2); c.stroke(); }
}
