import { clamp } from '../../game/motion';
import type { Element } from '../../game/types';
import { increase } from './presets';
import { RELEASE_AT, IMPACT_AT } from './screen';
import { glow, line, noise, ease, type Frame, type XY } from './frame';

export const ARRIVAL = IMPACT_AT - RELEASE_AT;

/** 本体 i 個目の位置。進み具合 0〜1 と軌道から決まる。尾を描くために過去の値も求められる。 */
export function bodyPoint(f: Frame, i: number, travel: number, time: number): XY {
  const r = f.recipe, { origin: o, target: g } = f, count = Math.max(1, r.count);
  const radius = 24 + r.area * 70 + f.intensity * 10, angle = i / count * Math.PI * 2, arc = Math.sin(clamp(travel) * Math.PI);
  let x = o.x + (g.x - o.x) * travel, y = o.y + (g.y - o.y) * travel;
  if (count > 1) { x += Math.cos(angle) * radius * arc; y += Math.sin(angle) * radius * arc * .8; }
  if (r.trajectory === 'spiral') { x += Math.sin(travel * 14 + i) * radius * .6 * arc; y += Math.cos(travel * 14 + i) * radius * .4 * arc; }
  if (r.trajectory === 'radial') { x += Math.cos(angle) * radius * arc * 1.4; y += Math.sin(angle) * radius * arc; }
  if (r.trajectory === 'orbit') { x += Math.cos(time * 5 + i) * radius * arc; y += Math.sin(time * 5 + i) * radius * arc; }
  if (r.trajectory === 'homing') { x += Math.sin(travel * Math.PI) * radius * (i % 2 ? 1 : -1); y += Math.sin(travel * Math.PI * 2) * radius * .3; }
  return { x, y };
}

/** 属性ごとの本体の形。色は palette から、形だけここで決める。 */
export function drawBody(f: Frame, x: number, y: number, size: number, element: Element, alpha: number, time: number, index: number) {
  const c = f.c, main = f.palette.main;
  glow(f, x, y, size, alpha * .9);
  c.globalAlpha = alpha; c.lineWidth = 2; c.strokeStyle = main; c.beginPath();
  if (element === 'ice') { c.moveTo(x, y - size * 1.8); c.lineTo(x + size * .7, y); c.lineTo(x, y + size); c.lineTo(x - size * .7, y); c.closePath(); c.stroke(); c.beginPath(); c.moveTo(x - size * .5, y - size * .9); c.lineTo(x + size * .5, y + size * .3); c.stroke(); }
  else if (element === 'lightning') { const k = Math.floor(time * 24) + index; c.lineWidth = 2.5; c.moveTo(x - size, y - size * 1.8); for (let i = 0; i < 6; i++) c.lineTo(x + (noise(k + i) - .5) * size * 1.6, y - size * 1.5 + i * size * .6); c.stroke(); c.lineWidth = 1; c.strokeStyle = f.palette.core; c.stroke(); }
  else if (element === 'wind') { for (let i = 0; i < 3; i++) { c.moveTo(x - size * 1.2, y + i * 5 - 5); c.quadraticCurveTo(x + Math.sin(time * 9 + i) * size * .4, y - size - i * 5, x + size * 1.2, y + i * 5 - 5); } c.stroke(); }
  else if (element === 'fire') { for (let i = 0; i < 6; i++) glow(f, x + Math.sin(time * 7 + i * 1.7 + index) * size * .6, y - i * size * .5 - Math.abs(Math.sin(time * 5 + i)) * size * .4, size * (.35 - i * .04), alpha * (1 - i / 7)); }
  else if (element === 'dark') { c.globalCompositeOperation = 'source-over'; c.fillStyle = f.palette.edge; c.globalAlpha = alpha; c.arc(x, y, size * .6, 0, Math.PI * 2); c.fill(); c.globalCompositeOperation = 'lighter'; c.lineWidth = 3; c.stroke(); for (let i = 0; i < 4; i++) { const a = time * 3 + i * 1.57; glow(f, x + Math.cos(a) * size * .8, y + Math.sin(a) * size * .5, size * .25, alpha * .6); } }
  else if (element === 'light') { c.arc(x, y, size * .7, 0, Math.PI * 2); c.stroke(); c.lineWidth = 1.2; c.strokeStyle = f.palette.core; c.beginPath(); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4 + time * .8; c.moveTo(x - Math.cos(a) * size * 2, y - Math.sin(a) * size * 2); c.lineTo(x + Math.cos(a) * size * 2, y + Math.sin(a) * size * 2); } c.stroke(); }
  else { c.arc(x, y, size * .7, 0, Math.PI * 2); c.stroke(); }
}

/** 放出（17秒）。閃光、衝撃波の輪、放射状の線、飛び出す粒。 */
export function drawRelease(f: Frame) {
  const { c, t, origin: o, target: g, preset, intensity, recipe: r } = f;
  const time = t - RELEASE_AT;
  if (time < 0) return;
  const violent = r.purpose === 'attack';
  f.once('release', () => {
    const n = Math.round(increase(preset.impactParticles, intensity, .7) * .35), dirX = g.x - o.x, dirY = g.y - o.y, d = Math.hypot(dirX, dirY) || 1;
    for (let i = 0; i < n; i++) {
      const spread = (f.pool.random() - .5) * 2.2, speed = 120 + f.pool.random() * 420 * (1 + intensity * .3);
      const ax = dirX / d * Math.cos(spread) - dirY / d * Math.sin(spread), ay = dirX / d * Math.sin(spread) + dirY / d * Math.cos(spread);
      f.pool.spawn({ x: o.x, y: o.y, vx: ax * speed, vy: ay * speed, life: .4 + f.pool.random() * .7, size: 1 + f.pool.random() * 2.2, drag: .12, color: f.palette.spark, core: f.palette.core, kind: f.pool.random() < .5 ? 1 : 0 });
    }
  });
  if (time < 1.2) {
    glow(f, o.x, o.y, (26 + intensity * 12) * Math.max(0, 1 - time / .7), Math.max(0, 1 - time / .7));
    // 衝撃波の輪。時間差で広がり、床に沿った平たい形にする。
    const rings = Math.round(increase(preset.releaseRings, intensity, .3));
    for (let i = 0; i < rings; i++) {
      const u = clamp((time - i * .07) / .55); if (u <= 0 || u >= 1) continue;
      const size = ease(u) * (80 + intensity * 40 + i * 12);
      c.globalAlpha = (1 - u) * .7; c.lineWidth = 3 - u * 2; c.strokeStyle = i % 2 ? f.palette.core : f.palette.main;
      c.beginPath(); c.ellipse(o.x, o.y, size, size * .42, 0, 0, Math.PI * 2); c.stroke();
    }
    // 放射状の線。長さは決まった乱数で、すぐ消える。
    const lines = Math.round(increase(preset.radialLines, intensity, .5)), lu = clamp(time / .32);
    if (lines && lu < 1) {
      c.globalAlpha = (1 - lu) * .8; c.lineWidth = 1.3; c.strokeStyle = f.palette.core; c.beginPath();
      for (let i = 0; i < lines; i++) { const a = i / lines * Math.PI * 2 + noise(i, 1) * .2, from = 18 + lu * 60, len = (40 + noise(i, 2) * 90) * (1 + intensity * .4) * lu; c.moveTo(o.x + Math.cos(a) * from, o.y + Math.sin(a) * from * .6); c.lineTo(o.x + Math.cos(a) * (from + len), o.y + Math.sin(a) * (from + len) * .6); }
      c.stroke();
    }
    // 奥へ小さくなる輪で、術式から出た向きを見せる。
    if (violent) for (let i = 0; i < 3; i++) {
      const depth = .12 + i * .2, size = (55 - i * 13) * Math.min(1, time * 5);
      c.globalAlpha = (1 - clamp((time - .8) / .5)) * (.4 - i * .07); c.lineWidth = 1.2; c.strokeStyle = f.palette.main;
      c.beginPath(); c.ellipse(o.x + (g.x - o.x) * depth, o.y + (g.y - o.y) * depth, size, size * .38, -.25, 0, Math.PI * 2); c.stroke();
    }
  }
}

/** 飛翔（17〜18.5秒）と持続する本体。球は尾を引き、光線は帯、壁と結界は面、拘束は輪。 */
export function drawTravel(f: Frame) {
  const { c, t, origin: o, target: g, preset, intensity, recipe: r } = f;
  const time = t - RELEASE_AT;
  if (time < 0 || time > 7) return;
  const travel = clamp(time / ARRIVAL), fade = (1 - clamp((time - 3.2 - r.duration) / 2.8)) * (1 - clamp((time - 4) / 2));
  if (fade <= 0) return;
  const radius = 24 + r.area * 70 + intensity * 10, focus = .7 + r.concentration * .6;
  c.strokeStyle = f.palette.main; c.fillStyle = f.palette.main;
  if (r.purpose === 'bind' && r.count === 1) {
    c.globalAlpha = fade; c.lineWidth = 3;
    for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(g.x, g.y + 22 * i - 30, (25 + radius * .4) * ease(time) , 9, Math.sin(time * 2 + i) * .25, 0, Math.PI * 2); c.stroke(); }
    // 縛る線は術式から伸び、届いた後も細く残る。
    line(f, o, { x: o.x + (g.x - o.x) * Math.min(1, time / ARRIVAL), y: o.y + (g.y - o.y) * Math.min(1, time / ARRIVAL) }, 2.5, fade * .6);
    for (let i = 0; i < 6; i++) { const u = (t * 1.4 + i / 6) % 1; glow(f, o.x + (g.x - o.x) * u, o.y + (g.y - o.y) * u, 2.5, fade * (1 - u) * .8); }
    return;
  }
  if (r.form === 'wall' || r.form === 'dome' || r.form === 'wave' || (r.purpose === 'enhance' && r.count === 1)) {
    const p = bodyPoint(f, 0, travel, time), size = radius * (1.5 - travel * .4) * (1 + intensity * .15), rh = size * (r.form === 'wave' ? .35 : .72);
    const pulse = 1 + Math.sin(time * 6) * .04;
    c.globalAlpha = .16 * fade; c.lineWidth = 2 + r.defense * 3; c.beginPath();
    if (r.form === 'dome') c.ellipse(p.x, p.y, size * pulse, rh * pulse, 0, 0, Math.PI * 2);
    else if (r.form === 'wave' || r.purpose === 'enhance') { c.moveTo(p.x - size, p.y); c.quadraticCurveTo(p.x, p.y - rh, p.x + size, p.y); c.quadraticCurveTo(p.x, p.y + rh, p.x - size, p.y); }
    else { c.moveTo(p.x - size, p.y - rh); c.lineTo(p.x + size, p.y - rh * .8); c.lineTo(p.x + size, p.y + rh); c.lineTo(p.x - size, p.y + rh * .8); c.closePath(); }
    c.fill(); c.globalAlpha = fade; c.stroke();
    // 面の中を流れる格子と粒。
    if (r.form !== 'wave') { c.globalAlpha = fade * .35; c.lineWidth = 1; c.beginPath(); for (let i = -3; i <= 3; i++) { const u = ((time * .3 + i / 7) % 1) * 2 - 1; c.moveTo(p.x - size, p.y + u * rh); c.lineTo(p.x + size, p.y + u * rh * (r.form === 'wall' ? .9 : 1)); } c.stroke(); }
    for (let i = 0; i < Math.round(increase(10, intensity)); i++) { const u = (t * .5 + noise(i)) % 1; glow(f, p.x + (noise(i, 2) - .5) * size * 1.8, p.y + rh - u * rh * 2, 1.6, fade * Math.sin(u * Math.PI) * .7); }
    glow(f, p.x, p.y, 15 + intensity * 5, fade * .25);
    if (travel < 1) line(f, o, p, 2, .3);
    return;
  }
  const beam = r.form === 'beam';
  for (let i = 0; i < r.count; i++) {
    const p = bodyPoint(f, i, travel, time), a = { x: o.x + (i - (r.count - 1) / 2) * 7, y: o.y };
    if (beam) {
      // 光線。太さが脈打ち、縁と芯の二重にする。粒が帯に沿って流れる。
      const width = (5 + intensity * 3) * focus * (1 + Math.sin(time * 30) * .12), grow = clamp(time / .25);
      const end = { x: a.x + (g.x - a.x) * grow, y: a.y + (g.y - a.y) * grow };
      line(f, a, end, width * 2.2, fade * .35, f.palette.main, 0); line(f, a, end, width, fade * .95, f.palette.main, width * .4);
      for (let k = 0; k < Math.round(increase(8, intensity)); k++) { const u = (t * 2.5 + noise(k + i * 9)) % 1; glow(f, a.x + (end.x - a.x) * u + (noise(k, 4) - .5) * width * 2, a.y + (end.y - a.y) * u, 2, fade * .8); }
      glow(f, end.x, end.y, 9 + intensity * 3, fade * .9);
      continue;
    }
    if (travel >= 1 && time > ARRIVAL + .35) continue;
    // 尾。少し前の位置を並べて、光の帯にする。
    const steps = 9, span = preset.trail * (1 + intensity * .4);
    for (let k = steps; k >= 1; k--) {
      const back = travel - (k / steps) * (span / ARRIVAL); if (back <= 0) continue;
      const q = bodyPoint(f, i, back, time - (k / steps) * span), u = 1 - k / steps;
      glow(f, q.x, q.y, (r.count > 1 ? 5 : 14) * (0.3 + u * .7), fade * u * .6);
    }
    drawBody(f, p.x, p.y, (r.count > 1 ? 6 : 20) * (1 + intensity * .12), r.element, fade, time, i);
    if (travel < 1 && r.count === 1) line(f, a, p, 2, fade * .25);
  }
}
