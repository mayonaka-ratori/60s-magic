import { clamp } from '../../game/motion';
import { increase } from './presets';
import { IMPACT_AT } from './screen';
import { glow, noise, ease, type Frame } from './frame';

/** 命中（18.5秒）。破裂、火花、輪、亀裂、属性ごとの作用。防御と強化は波紋と包む光にする。 */
export function drawImpact(f: Frame) {
  const { c, t, target: g, preset, intensity, recipe: r } = f;
  const impact = t - IMPACT_AT;
  if (impact < 0) return;
  const violent = r.purpose === 'attack', radius = 24 + r.area * 70 + intensity * 10;
  const fade = 1 - clamp((impact - 1.6 - r.duration) / 2.4);
  const element = r.element;
  f.once('impact', () => {
    const n = Math.round(increase(preset.impactParticles, intensity, .5) * (violent ? 1 : .45));
    for (let i = 0; i < n; i++) {
      const a = f.pool.random() * Math.PI * 2, speed = (60 + f.pool.random() * 380) * (1 + intensity * .35) * (violent ? 1 : .5);
      let vx = Math.cos(a) * speed, vy = Math.sin(a) * speed * .75, gravity = 260, life = .5 + f.pool.random() * .9, kind = f.pool.random() < .45 ? 1 : 0, color = f.palette.spark;
      if (element === 'fire') { gravity = -140; vy -= 60; life += .3; kind = 0; color = f.pool.random() < .5 ? f.palette.main : f.palette.spark; }
      if (element === 'ice') { gravity = 420; kind = f.pool.random() < .4 ? 2 : 1; }
      if (element === 'wind') { gravity = -20; vx *= 1.5; life += .4; kind = 1; }
      if (element === 'lightning') { life *= .55; kind = 1; }
      if (element === 'light') { gravity = 0; kind = 0; }
      if (element === 'dark') { gravity = 40; kind = f.pool.random() < .5 ? 2 : 0; color = f.pool.random() < .5 ? f.palette.main : f.palette.edge; }
      if (r.purpose === 'enhance') { gravity = -160; vx *= .3; vy = -Math.abs(vy) * .6 - 40; kind = 0; life += .6; }
      f.pool.spawn({ x: g.x + (f.pool.random() - .5) * 10, y: g.y + (f.pool.random() - .5) * 10, vx, vy, life, size: 1 + f.pool.random() * 2.6, gravity, drag: kind === 1 ? .1 : .4, color, core: f.palette.core, kind });
    }
  });
  // 余韻。命中の少し後に、ゆっくり落ちる粒を足す。
  if (impact >= .3) f.once('afterglow', () => {
    const n = Math.round(increase(preset.afterglowParticles, intensity, .6));
    for (let i = 0; i < n; i++) f.pool.spawn({ x: g.x + (f.pool.random() - .5) * radius * 3, y: g.y + (f.pool.random() - .8) * radius * 2, vx: (f.pool.random() - .5) * 30, vy: element === 'fire' || r.purpose === 'enhance' ? -20 - f.pool.random() * 30 : 10 + f.pool.random() * 30,
      life: 1.5 + f.pool.random() * 1.8, size: .8 + f.pool.random() * 1.6, gravity: element === 'fire' ? -15 : 12, drag: .5, color: f.palette.main, core: f.palette.core, kind: 0 });
  });

  c.strokeStyle = f.palette.main;
  // 破裂の光。最初の一瞬が一番大きい。
  glow(f, g.x, g.y, (violent ? 17 : 12) * (1 + intensity * .15) * (1 - clamp(impact / 1.1)) + 4, fade * .8);
  // 輪。時間差で広がる。防御は波紋を細かく重ねる。
  const rings = Math.round(increase(preset.impactRings, intensity, .3)) * (violent ? 1 : 2);
  for (let i = 0; i < rings; i++) {
    const u = clamp((impact - i * (violent ? .07 : .18)) / 1.1); if (u <= 0 || u >= 1) continue;
    const size = ease(u) * radius * (violent ? 1.7 + i * .25 : 1.2);
    c.globalAlpha = (1 - u) * .8 * (violent ? 1 : .6); c.lineWidth = 3 - u * 2; c.strokeStyle = i % 2 ? f.palette.core : f.palette.main;
    c.beginPath(); c.ellipse(g.x, g.y, Math.max(1, size), Math.max(1, size * .58), 0, 0, Math.PI * 2); c.stroke();
  }
  // 白い火花の線。一瞬で外へ。
  if (impact < .8 && violent) {
    c.strokeStyle = f.palette.core; c.lineWidth = 1.4; c.globalAlpha = (1 - impact / .8) * .85; c.beginPath();
    const n = Math.round(increase(22, intensity, .6));
    for (let i = 0; i < n; i++) { const a = i * 2.399, spread = (25 + (i * 19) % 100) * (1 + intensity * .3) * Math.min(1, impact * 4), len = 8 + 20 * (1 - impact / .8); c.moveTo(g.x + Math.cos(a) * spread, g.y + Math.sin(a) * spread * .7); c.lineTo(g.x + Math.cos(a) * (spread + len), g.y + Math.sin(a) * (spread + len) * .7); }
    c.stroke();
  }
  // 亀裂。すぐ現れ、遅れて光り、ゆっくり消える。
  const cracks = violent ? Math.round(increase(preset.cracks, intensity, .4)) : 0;
  if (cracks && impact < 1.4) {
    const grow = clamp(impact / .06), life = 1 - clamp((impact - .3) / 1.1);
    c.lineWidth = 1.6; c.beginPath();
    for (let i = 0; i < cracks; i++) {
      const a = i / cracks * Math.PI * 2 + noise(i, 7) * .5, len = (40 + noise(i, 8) * 70) * (1 + intensity * .3) * grow;
      let x = g.x, y = g.y; c.moveTo(x, y);
      for (let k = 1; k <= 5; k++) { const d = len * k / 5, wob = (noise(i * 5 + k, 9) - .5) * 18; x = g.x + Math.cos(a) * d - Math.sin(a) * wob; y = g.y + Math.sin(a) * d * .7 + Math.cos(a) * wob * .7; c.lineTo(x, y); }
    }
    c.globalAlpha = life * .9; c.strokeStyle = f.palette.core; c.stroke();
    c.lineWidth = 4; c.globalAlpha = life * .35; c.strokeStyle = f.palette.main; c.stroke();
  }
  // 属性ごとの作用。
  if (element === 'lightning' && impact < .6) {
    const k = Math.floor(t * 20); c.globalAlpha = (1 - impact / .6) * (noise(k, 11) > .3 ? 1 : .3); c.lineWidth = 2; c.strokeStyle = f.palette.core; c.beginPath();
    for (let b = 0; b < Math.round(increase(4, intensity)); b++) { let x = g.x, y = g.y; c.moveTo(x, y); const a = noise(k + b, 12) * Math.PI * 2; for (let s = 0; s < 6; s++) { x += Math.cos(a + (noise(k * 7 + b * 13 + s, 13) - .5) * 1.6) * 14; y += Math.sin(a + (noise(k * 7 + b * 13 + s, 14) - .5) * 1.6) * 10; c.lineTo(x, y); } }
    c.stroke();
  }
  if (element === 'light' && impact < 1.4) {
    const u = clamp(impact / 1.4); c.globalAlpha = (1 - u) * .7; c.lineWidth = 2; c.strokeStyle = f.palette.core; c.beginPath();
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4 + impact * .6, len = (60 + intensity * 40) * ease(u * 2) + radius; c.moveTo(g.x - Math.cos(a) * len, g.y - Math.sin(a) * len * .8); c.lineTo(g.x + Math.cos(a) * len, g.y + Math.sin(a) * len * .8); }
    c.stroke();
  }
  if (element === 'dark' && impact < 1.6) {
    // 明るくせず、暗い穴を先に描いてから縁だけ光らせる。
    const u = clamp(impact / .4) * (1 - clamp((impact - .9) / .7)), hole = radius * .8 * u;
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = u * .85; c.fillStyle = f.palette.edge; c.beginPath(); c.ellipse(g.x, g.y, hole, hole * .7, 0, 0, Math.PI * 2); c.fill();
    c.globalCompositeOperation = 'lighter'; c.globalAlpha = u; c.lineWidth = 3; c.strokeStyle = f.palette.main; c.stroke();
    for (let i = 0; i < 6; i++) { const a = impact * 4 + i; glow(f, g.x + Math.cos(a) * hole, g.y + Math.sin(a) * hole * .7, 3, u * .7); }
  }
  if (element === 'ice' && impact < 1.8) {
    const u = clamp(impact / .3), life = 1 - clamp((impact - .8) / 1); c.globalAlpha = life * .85; c.lineWidth = 1.5; c.strokeStyle = f.palette.core; c.beginPath();
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 - Math.PI / 2, len = (radius * .9) * u; const ex = g.x + Math.cos(a) * len, ey = g.y + Math.sin(a) * len * .8; c.moveTo(g.x, g.y); c.lineTo(ex, ey); c.moveTo(ex, ey); c.lineTo(ex + Math.cos(a + .6) * 10, ey + Math.sin(a + .6) * 8); c.moveTo(ex, ey); c.lineTo(ex + Math.cos(a - .6) * 10, ey + Math.sin(a - .6) * 8); }
    c.stroke();
  }
  if (element === 'wind' && impact < 1.2) {
    c.globalAlpha = (1 - impact / 1.2) * .7; c.lineWidth = 1.5; c.strokeStyle = f.palette.main; c.beginPath();
    for (let i = 0; i < 5; i++) { const a = impact * 6 + i * 1.26, rr = radius * (.5 + impact); c.moveTo(g.x + Math.cos(a) * rr, g.y + Math.sin(a) * rr * .6); c.quadraticCurveTo(g.x + Math.cos(a + .6) * rr * 1.3, g.y + Math.sin(a + .6) * rr * .8, g.x + Math.cos(a + 1.2) * rr, g.y + Math.sin(a + 1.2) * rr * .6); }
    c.stroke();
  }
  if (element === 'fire' && impact < 1.6) for (let i = 0; i < Math.round(increase(8, intensity)); i++) { const u = (impact * .8 + noise(i, 15)) % 1; glow(f, g.x + (noise(i, 16) - .5) * radius * 1.4 + Math.sin(impact * 6 + i) * 6, g.y + 20 - u * (60 + intensity * 30), 4 * (1 - u), (1 - clamp(impact / 1.6)) * Math.sin(u * Math.PI) * .8); }
  // 囲う魔法は、包む輪を残す。
  if (r.enclosure) { c.globalAlpha = fade * .45; c.lineWidth = 1; c.strokeStyle = f.palette.main; c.beginPath(); c.ellipse(g.x, g.y, radius * .7, radius, 0, 0, Math.PI * 2); c.stroke(); c.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI + impact * .5; c.moveTo(g.x + Math.cos(a) * radius * .7, g.y + Math.sin(a) * radius); c.lineTo(g.x - Math.cos(a) * radius * .7, g.y - Math.sin(a) * radius); } c.globalAlpha = fade * .2; c.stroke(); }
  // 床の跡。命中の下に、薄い光が残ってゆっくり消える。
  if (violent) { const u = 1 - clamp((impact - .5) / 3); c.globalAlpha = u * .25; c.beginPath(); c.ellipse(g.x, g.y + radius * .9, radius * (1 + impact * .2), radius * .22, 0, 0, Math.PI * 2); c.fillStyle = f.palette.main; c.fill(); }
}
