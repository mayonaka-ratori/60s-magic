import { clamp } from '../../game/motion';
import { increase } from './presets';
import { IMPACT_AT } from './screen';
import { hitDelay } from './release';
import { glow, noise, ease, mixOf, type Frame } from './frame';

/**
 * 地面の跡。命中の真下に属性ごとの跡を出し、2秒かけて薄れさせる。
 * 光を足す描き方では暗い色が出せないので、ここだけ普通の重ね方に切り替える。
 */
function drawGroundMark(f: Frame, impact: number, radius: number, y: number) {
  const { c, target: g } = f, element = f.recipe.element;
  const life = 1 - clamp(impact / 2);
  if (life <= 0) return;
  const grow = ease(clamp(impact / .14));
  const rx = radius * (1 + impact * .12) * grow, ry = Math.max(1, rx * .3);
  const before = c.globalCompositeOperation;
  c.globalCompositeOperation = 'source-over';
  const oval = (sx: number, sy: number) => { c.beginPath(); c.ellipse(g.x, y, Math.max(1, rx * sx), Math.max(1, ry * sy), 0, 0, Math.PI * 2); };
  if (element === 'fire') {
    // 焦げ。暗い楕円の縁だけが赤く残る。
    c.globalAlpha = life * .6; c.fillStyle = '#150a04'; oval(1, 1); c.fill();
    c.globalAlpha = life * .5; c.strokeStyle = '#ff4d12'; c.lineWidth = 2.5; oval(1, 1); c.stroke();
    c.globalAlpha = life * .25; c.fillStyle = '#2a1408'; oval(1.35, 1.3); c.fill();
  } else if (element === 'ice') {
    // 霜。白い楕円の上に細い結晶を伸ばす。
    c.globalAlpha = life * .4; c.fillStyle = '#dff4ff'; oval(1, 1); c.fill();
    c.globalAlpha = life * .7; c.strokeStyle = '#ffffff'; c.lineWidth = 1; c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2, len = rx * (.6 + noise(i, 21) * .7);
      c.moveTo(g.x, y); c.lineTo(g.x + Math.cos(a) * len, y + Math.sin(a) * len * .3);
    }
    c.stroke();
  } else if (element === 'lightning') {
    // 焼けた筋。中心から外へ黒く走る。
    c.globalAlpha = life * .55; c.strokeStyle = '#0b0a14'; c.lineWidth = 2.2; c.beginPath();
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2 + noise(i, 22) * .4;
      let x = g.x, yy = y; c.moveTo(x, yy);
      for (let k = 1; k <= 3; k++) { const d = rx * 1.2 * k / 3, w = (noise(i * 3 + k, 23) - .5) * rx * .3; x = g.x + Math.cos(a) * d - Math.sin(a) * w; yy = y + (Math.sin(a) * d + Math.cos(a) * w) * .3; c.lineTo(x, yy); }
    }
    c.stroke();
  } else if (element === 'wind') {
    // 薄い輪だけが残る。
    c.globalAlpha = life * .3; c.strokeStyle = '#cdf4e2'; c.lineWidth = 1.6;
    oval(1, 1); c.stroke(); oval(1.3, 1.3); c.globalAlpha = life * .16; c.stroke();
  } else if (element === 'light') {
    // 淡い円。
    c.globalAlpha = life * .28; c.fillStyle = '#fff4cf'; oval(1, 1); c.fill();
  } else if (element === 'dark') {
    // 暗い染みが広がる。
    c.globalAlpha = life * .6; c.fillStyle = '#080310'; oval(1, 1); c.fill();
    c.globalAlpha = life * .25; c.fillStyle = '#140626'; oval(1.4, 1.35); c.fill();
  } else {
    c.globalAlpha = life * .22; c.strokeStyle = '#b9ccff'; c.lineWidth = 1.5; oval(1, 1); c.stroke();
  }
  c.globalCompositeOperation = before;
}

/** 命中（18.5秒）。破裂、火花、輪、亀裂、属性ごとの作用。防御と強化は波紋と包む光にする。 */
export function drawImpact(f: Frame) {
  const { c, t, target: g, preset, intensity, recipe: r } = f;
  const impact = t - IMPACT_AT;
  if (impact < 0) return;
  const violent = r.purpose === 'attack', radius = 24 + r.area * 70 + intensity * 10;
  const fade = 1 - clamp((impact - 1.6 - r.duration) / 2.4);
  const element = r.element, mix = mixOf(f), pal0 = mix.pal;
  // many：連弾は弾ごとに少しずつ届き、最後の1発だけ遅れて特大になる。
  // floorY：床の高さ。命中の少し下と画面の下寄りの、低い方に置く。
  const many = r.count > 1, floorY = Math.max(g.y + radius * .9, f.h * .82);

  /** 弾1発ぶんの粒。scale で量を変える。 */
  const burst = (scale: number, at: { x: number; y: number }) => {
    const n = Math.round(increase(preset.impactParticles, intensity, .5) * (violent ? 1 : .45) * scale);
    for (let i = 0; i < n; i++) {
      const a = f.pool.random() * Math.PI * 2, speed = (60 + f.pool.random() * 380) * (1 + intensity * .35) * (violent ? 1 : .5);
      // 持続型は粒の半分を二色目に、増幅型は白い閃光の粒にする。飛び方は属性ごとのまま。
      const pal = mix.alt && i % 2 ? mix.alt : pal0;
      let vx = Math.cos(a) * speed, vy = Math.sin(a) * speed * .75, gravity = 260, life = .5 + f.pool.random() * .9, kind = f.pool.random() < .45 ? 1 : 0, color = pal.spark, floor = 0, drag = 0, pull = 0;
      if (element === 'fire') { gravity = -140; vy -= 60; life += .3; kind = 0; color = f.pool.random() < .5 ? pal.main : pal.spark; }
      if (element === 'ice') { gravity = 420; kind = f.pool.random() < .4 ? 2 : 1; floor = floorY + f.pool.random() * 8; }
      if (element === 'wind') { gravity = -20; vx *= 1.5; life += .4; kind = 1; }
      if (element === 'lightning') { life *= .35; kind = 1; }
      if (element === 'light') { gravity = 0; kind = 0; drag = .06; }
      if (element === 'dark') { gravity = 40; kind = f.pool.random() < .5 ? 2 : 0; color = f.pool.random() < .5 ? pal.main : pal.edge; pull = 120 + f.pool.random() * 120; }
      if (r.purpose === 'enhance') { gravity = -160; vx *= .3; vy = -Math.abs(vy) * .6 - 40; kind = 0; life += .6; floor = 0; pull = 0; }
      f.pool.spawn({ x: at.x + (f.pool.random() - .5) * 10, y: at.y + (f.pool.random() - .5) * 10, vx, vy, life, size: 1 + f.pool.random() * 2.6, gravity,
        drag: drag || (kind === 1 ? .1 : .4), floor, pull, px: g.x, py: g.y, color, core: pal.core, kind });
    }
  };

  if (!many) f.once('impact', () => burst(1, g));
  else for (let i = 0; i < r.count; i++) {
    const last = i === r.count - 1;
    if (impact >= hitDelay(i, r.count)) f.once('impact' + i, () => burst(last ? .7 : .9 / r.count, g));
  }

  // 余韻。命中の少し後に、属性ごとの消え方で粒を足す。出し方より消し方の方が属性が伝わる。
  if (impact >= .3) f.once('afterglow', () => {
    const n = Math.round(increase(preset.afterglowParticles, intensity, .6));
    for (let i = 0; i < n; i++) {
      const pal = mix.alt && i % 2 ? mix.alt : pal0, rnd = () => f.pool.random();
      const x = g.x + (rnd() - .5) * radius * 3, y = g.y + (rnd() - .8) * radius * 2;
      const common = { x, y, size: .8 + rnd() * 1.6, color: pal.main, core: pal.core, kind: 0 };
      if (r.purpose === 'enhance') { f.pool.spawn({ ...common, vx: (rnd() - .5) * 30, vy: -20 - rnd() * 30, life: 1.5 + rnd() * 1.8, gravity: -15, drag: .5 }); continue; }
      if (element === 'fire') {
        // 煙が残る。暗い丸がふくらみながら薄くなり、火の粉だけが明るく昇る。
        if (i % 3 === 0) f.pool.spawn({ x, y: y + 10, vx: (rnd() - .5) * 18, vy: -16 - rnd() * 22, life: 1.8 + rnd() * 1.4, size: radius * (.3 + rnd() * .3), gravity: -5, drag: .7, color: '#1b1310', core: '#1b1310', kind: 3 });
        else f.pool.spawn({ ...common, vx: (rnd() - .5) * 30, vy: -22 - rnd() * 30, life: 1.4 + rnd() * 1.4, gravity: -15, drag: .5 });
      } else if (element === 'ice') {
        // 砕けて落ちる。かけらが重力で落ち、床で止まって残る。
        f.pool.spawn({ ...common, vx: (rnd() - .5) * 70, vy: -30 - rnd() * 40, life: 1.6 + rnd() * 1.4, size: 1.4 + rnd() * 2.2, gravity: 520, drag: .9, floor: floorY + rnd() * 10, kind: 2 });
      } else if (element === 'lightning') {
        // 瞬断。ほとんど残らず一瞬で消える。残りの帯電は下で描く。
        f.pool.spawn({ ...common, vx: (rnd() - .5) * 120, vy: (rnd() - .5) * 100, life: .12 + rnd() * .2, gravity: 0, drag: .08, kind: 1 });
      } else if (element === 'wind') {
        // すっと消える。外へ流れながら薄くなる。
        const a = Math.atan2(y - g.y, x - g.x), speed = 70 + rnd() * 130;
        f.pool.spawn({ ...common, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed * .5 - 10, life: .8 + rnd() * .6, gravity: -8, drag: .45 });
      } else if (element === 'light') {
        // 減速して消える。動きが止まってから静かに薄くなる。
        f.pool.spawn({ ...common, vx: (rnd() - .5) * 90, vy: (rnd() - .5) * 70, life: 1.6 + rnd() * 1.2, gravity: 0, drag: .04 });
      } else if (element === 'dark') {
        // 吸い込まれる。粒が中心へ戻って消える。
        f.pool.spawn({ ...common, vx: (rnd() - .5) * 40, vy: (rnd() - .5) * 30, life: 2 + rnd() * 1.2, gravity: 0, drag: .8, pull: 180 + rnd() * 160, px: g.x, py: g.y });
      } else {
        f.pool.spawn({ ...common, vx: (rnd() - .5) * 30, vy: 10 + rnd() * 30, life: 1.5 + rnd() * 1.8, gravity: 12, drag: .5 });
      }
    }
  });

  // 地面の跡は一番下に敷く。
  if (violent || r.purpose === 'bind') drawGroundMark(f, impact, radius, floorY);

  c.globalCompositeOperation = 'lighter';
  c.strokeStyle = pal0.main;
  // 破裂の光。最初の一瞬が一番大きい。連弾は弾ごとに小さく出し、最後の1発で大きくする。
  const mainSize = (violent ? 17 : 12) * (1 + intensity * .15) * (many ? .62 : 1);
  glow(f, g.x, g.y, mainSize * (1 - clamp(impact / 1.1)) + 4, fade * .8 * mix.boost, pal0.main, pal0.core);
  if (many) for (let i = 1; i < r.count; i++) {
    const last = i === r.count - 1, u = impact - hitDelay(i, r.count);
    if (u < 0 || u > 1.1) continue;
    glow(f, g.x, g.y, (last ? mainSize * 2.2 : mainSize * .7) * (1 - clamp(u / (last ? 1.1 : .5))) + 3, fade * (last ? 1 : .55) * mix.boost, pal0.main, pal0.core);
    const size = ease(clamp(u / (last ? .9 : .5))) * radius * (last ? 2.1 : .8);
    c.globalAlpha = (1 - clamp(u / (last ? .9 : .5))) * (last ? .9 : .45); c.lineWidth = last ? 3.4 : 1.6; c.strokeStyle = last ? pal0.core : pal0.main;
    c.beginPath(); c.ellipse(g.x, g.y, Math.max(1, size), Math.max(1, size * .58), 0, 0, Math.PI * 2); c.stroke();
  }
  // 輪。時間差で広がる。防御は波紋を細かく重ねる。
  const rings = Math.round(increase(preset.impactRings, intensity, .3)) * (violent ? 1 : 2);
  for (let i = 0; i < rings; i++) {
    const u = clamp((impact - i * (violent ? .07 : .18)) / 1.1); if (u <= 0 || u >= 1) continue;
    const size = ease(u) * radius * (violent ? 1.7 + i * .25 : 1.2);
    c.globalAlpha = (1 - u) * .8 * (violent ? 1 : .6); c.lineWidth = 3 - u * 2; c.strokeStyle = i % 2 ? (mix.alt ? mix.alt.main : pal0.core) : pal0.main;
    c.beginPath(); c.ellipse(g.x, g.y, Math.max(1, size), Math.max(1, size * .58), 0, 0, Math.PI * 2); c.stroke();
  }
  // 二属性が爆発型のとき、二色の中間色の球状の破裂を足す。
  if (mix.mid && violent) {
    const u = clamp(impact / .42);
    if (u < 1) {
      const size = ease(u) * radius * 1.5 + 6;
      glow(f, g.x, g.y, size * .5, (1 - u) * .9, mix.mid, pal0.core);
      c.globalAlpha = (1 - u) * .5; c.fillStyle = mix.mid;
      c.beginPath(); c.arc(g.x, g.y, size * (.5 + u * .3), 0, Math.PI * 2); c.fill();
      c.globalAlpha = (1 - u) * .85; c.lineWidth = 2.5; c.strokeStyle = mix.mid;
      c.beginPath(); c.arc(g.x, g.y, size, 0, Math.PI * 2); c.stroke();
    }
  }
  // 白い火花の線。一瞬で外へ。
  if (impact < .8 && violent) {
    const n = Math.round(increase(22, intensity, .6)), step = mix.alt ? 2 : 1;
    // 持続型のとき、火花の線は一本おきに二色目で描く。
    for (let pass = 0; pass < step; pass++) {
      c.strokeStyle = pass && mix.alt ? mix.alt.main : pal0.core; c.lineWidth = 1.4; c.globalAlpha = (1 - impact / .8) * .85; c.beginPath();
      for (let i = pass; i < n; i += step) { const a = i * 2.399, spread = (25 + (i * 19) % 100) * (1 + intensity * .3) * Math.min(1, impact * 4), len = 8 + 20 * (1 - impact / .8); c.moveTo(g.x + Math.cos(a) * spread, g.y + Math.sin(a) * spread * .7); c.lineTo(g.x + Math.cos(a) * (spread + len), g.y + Math.sin(a) * (spread + len) * .7); }
      c.stroke();
    }
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
    c.globalAlpha = life * .35; c.lineWidth = 4; c.strokeStyle = pal0.main; c.stroke();
    c.globalAlpha = life * .9; c.lineWidth = 1.6; c.strokeStyle = pal0.core; c.stroke();
  }
  // 属性ごとの作用。
  if (element === 'lightning' && impact < 1.6) {
    // 瞬断。0.25秒で本体は消え、残った帯電だけが弱く明滅する。
    // 明滅は毎秒3回まで（光に弱い人への配慮）。そのぶん枝を増やし、長くして派手さを出す。
    const k = Math.floor(t * 3), left = impact < .25 ? 1 - impact / .25 : (1 - clamp((impact - .25) / 1.35)) * .3;
    c.globalAlpha = left * (noise(k, 11) > .3 ? 1 : .3); c.lineWidth = 2; c.strokeStyle = pal0.core; c.beginPath();
    for (let b = 0; b < Math.round(increase(9, intensity)); b++) { let x = g.x, y = g.y; c.moveTo(x, y); const a = noise(k + b, 12) * Math.PI * 2; for (let s = 0; s < 9; s++) { x += Math.cos(a + (noise(k * 7 + b * 13 + s, 13) - .5) * 1.6) * 17; y += Math.sin(a + (noise(k * 7 + b * 13 + s, 14) - .5) * 1.6) * 12; c.lineTo(x, y); } }
    c.stroke();
  }
  if (element === 'light' && impact < 1.4) {
    const u = clamp(impact / 1.4); c.globalAlpha = (1 - u) * .7; c.lineWidth = 2; c.strokeStyle = pal0.core; c.beginPath();
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4 + impact * .6, len = (60 + intensity * 40) * ease(u * 2) + radius; c.moveTo(g.x - Math.cos(a) * len, g.y - Math.sin(a) * len * .8); c.lineTo(g.x + Math.cos(a) * len, g.y + Math.sin(a) * len * .8); }
    c.stroke();
  }
  if (element === 'dark' && impact < 1.6) {
    // 明るくせず、暗い穴を先に描いてから縁だけ光らせる。
    const u = clamp(impact / .4) * (1 - clamp((impact - .9) / .7)), hole = radius * .8 * u;
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = u * .85; c.fillStyle = pal0.edge; c.beginPath(); c.ellipse(g.x, g.y, hole, hole * .7, 0, 0, Math.PI * 2); c.fill();
    c.globalCompositeOperation = 'lighter'; c.globalAlpha = u; c.lineWidth = 3; c.strokeStyle = pal0.main; c.stroke();
    c.globalAlpha = u * .9; c.lineWidth = 1.1; c.strokeStyle = pal0.core; c.stroke();
    for (let i = 0; i < 6; i++) { const a = impact * 4 + i; glow(f, g.x + Math.cos(a) * hole, g.y + Math.sin(a) * hole * .7, 3, u * .7, pal0.main, pal0.core); }
  }
  if (element === 'ice' && impact < 1.8) {
    const u = clamp(impact / .3), life = 1 - clamp((impact - .8) / 1);
    c.beginPath();
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 - Math.PI / 2, len = (radius * .9) * u; const ex = g.x + Math.cos(a) * len, ey = g.y + Math.sin(a) * len * .8; c.moveTo(g.x, g.y); c.lineTo(ex, ey); c.moveTo(ex, ey); c.lineTo(ex + Math.cos(a + .6) * 10, ey + Math.sin(a + .6) * 8); c.moveTo(ex, ey); c.lineTo(ex + Math.cos(a - .6) * 10, ey + Math.sin(a - .6) * 8); }
    c.globalAlpha = life * .4; c.lineWidth = 4; c.strokeStyle = pal0.main; c.stroke();
    c.globalAlpha = life * .9; c.lineWidth = 1.3; c.strokeStyle = pal0.core; c.stroke();
  }
  if (element === 'wind' && impact < 1.2) {
    c.beginPath();
    for (let i = 0; i < 5; i++) { const a = impact * 6 + i * 1.26, rr = radius * (.5 + impact); c.moveTo(g.x + Math.cos(a) * rr, g.y + Math.sin(a) * rr * .6); c.quadraticCurveTo(g.x + Math.cos(a + .6) * rr * 1.3, g.y + Math.sin(a + .6) * rr * .8, g.x + Math.cos(a + 1.2) * rr, g.y + Math.sin(a + 1.2) * rr * .6); }
    c.globalAlpha = (1 - impact / 1.2) * .5; c.lineWidth = 3.4; c.strokeStyle = pal0.main; c.stroke();
    c.globalAlpha = (1 - impact / 1.2) * .8; c.lineWidth = 1.2; c.strokeStyle = pal0.core; c.stroke();
  }
  if (element === 'fire' && impact < 1.6) for (let i = 0; i < Math.round(increase(8, intensity)); i++) { const u = (impact * .8 + noise(i, 15)) % 1; glow(f, g.x + (noise(i, 16) - .5) * radius * 1.4 + Math.sin(impact * 6 + i) * 6, g.y + 20 - u * (60 + intensity * 30), 4 * (1 - u), (1 - clamp(impact / 1.6)) * Math.sin(u * Math.PI) * .8, pal0.main, pal0.core); }
  // 囲う魔法は、包む輪を残す。
  if (r.enclosure) { c.globalAlpha = fade * .45; c.lineWidth = 1; c.strokeStyle = pal0.main; c.beginPath(); c.ellipse(g.x, g.y, radius * .7, radius, 0, 0, Math.PI * 2); c.stroke(); c.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI + impact * .5; c.moveTo(g.x + Math.cos(a) * radius * .7, g.y + Math.sin(a) * radius); c.lineTo(g.x - Math.cos(a) * radius * .7, g.y - Math.sin(a) * radius); } c.globalAlpha = fade * .2; c.stroke(); }
}
