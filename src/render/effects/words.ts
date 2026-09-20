import { clamp, getNodes } from '../../game/motion';
import { spokenElements, type LiveWord } from '../../game/live-words';
import { increase, type Palette } from './presets';
import { glow, noise, smooth, type Frame, type XY } from './frame';

/** 言葉の反応が残る秒数。これを過ぎた言葉は描かない。 */
const LIFE = 2.6;
/** 一つの言葉で出す粒の上限。 */
const MAX_BURST = 100;

const age = (f: Frame, w: LiveWord) => f.t - w.atMs / 1000;
const px = (f: Frame, p: { x: number; y: number }): XY => ({ x: p.x * f.w, y: p.y * f.h });

/** 手と線から、粒を出す場所をいくつか選ぶ。手がなければ中心から。 */
function spots(f: Frame, max: number): XY[] {
  const list: XY[] = f.cursors.map(p => px(f, p));
  for (const p of getNodes(f.points, 8)) list.push(px(f, p));
  if (!list.length) list.push(f.origin);
  return list.slice(0, Math.max(1, max));
}

/** 言葉の色で、手元と線から粒を噴き出す。 */
function burst(f: Frame, pal: Palette, strength = 1) {
  const total = Math.min(MAX_BURST, Math.round(increase(22, f.intensity, .7) * strength));
  const places = spots(f, 9);
  for (let i = 0; i < total; i++) {
    const at = places[i % places.length], a = f.pool.random() * Math.PI * 2, speed = (40 + f.pool.random() * 130) * (1 + f.intensity * .2);
    f.pool.spawn({ x: at.x + (f.pool.random() - .5) * 8, y: at.y + (f.pool.random() - .5) * 8,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed * .7 - 24, life: .45 + f.pool.random() * .7,
      size: 1 + f.pool.random() * 2, drag: .25, color: f.pool.random() < .4 ? pal.spark : pal.main, core: pal.core, kind: f.pool.random() < .3 ? 1 : 0 });
  }
}

/** 言葉への即時反応。属性の言葉が聞こえた瞬間にその色の粒が噴き出す、など。 */
export function drawWordReactions(f: Frame) {
  const words = f.live.words;
  if (!words.length) return;
  const c = f.c, o = f.origin, near = words.filter(w => { const u = age(f, w); return u >= -.2 && u < LIFE; });

  for (const w of near) {
    const u = age(f, w), pal = w.element ? f.preset.palettes[w.element] : f.palette;
    // 言葉が新しく出た瞬間に一度だけ粒を出す。同じ言葉が途中結果で何度更新されても一度きり。
    if (u >= 0) f.once(`word-${w.id}`, () => {
      if (w.kind === 'element') burst(f, pal, 1);
      else if (w.kind === 'count') burst(f, pal, .5);
      else if (w.purpose === 'enhance') for (let i = 0; i < Math.min(MAX_BURST, Math.round(increase(14, f.intensity))); i++)
        f.pool.spawn({ x: o.x + (f.pool.random() - .5) * 70, y: o.y + 24, vx: (f.pool.random() - .5) * 20, vy: -60 - f.pool.random() * 70, life: .8 + f.pool.random() * .6, size: 1.2 + f.pool.random() * 1.4, drag: .6, color: pal.spark, core: pal.core, kind: 0 });
      else burst(f, pal, .35);
    });
    if (u < 0) continue;
    const fade = 1 - clamp(u / LIFE);

    // 属性：手元から色の輪が一度だけ広がる。
    if (w.kind === 'element' && u < .6) {
      const ring = smooth(u / .6);
      for (const at of f.cursors.length ? f.cursors.map(p => px(f, p)) : [o]) {
        c.globalAlpha = (1 - ring) * .7; c.lineWidth = 2.5 - ring * 2; c.strokeStyle = pal.main;
        c.beginPath(); c.ellipse(at.x, at.y, 8 + ring * 46, (8 + ring * 46) * .55, 0, 0, Math.PI * 2); c.stroke();
      }
    }
    // 個数：その数だけ光点を中心の周りに並べ、しばらく残す。
    if (w.kind === 'count' && w.count) {
      const n = w.count, r = 56 + f.intensity * 10;
      // 数が並ぶ輪を薄く引き、その上に光点を一つずつ点す。
      c.globalAlpha = fade * .18; c.lineWidth = 1; c.strokeStyle = pal.main;
      c.beginPath(); c.ellipse(o.x, o.y, r, r * .55, 0, 0, Math.PI * 2); c.stroke();
      for (let i = 0; i < n; i++) {
        const appear = clamp((u - i * .08) / .25); if (appear <= 0) continue;
        const a = -Math.PI / 2 + i / n * Math.PI * 2 + u * .4;
        glow(f, o.x + Math.cos(a) * r * appear, o.y + Math.sin(a) * r * .55 * appear, 5 + Math.sin(u * 6 + i) * 1.2, fade * appear, pal.main, pal.core);
      }
    }
    // 形：壁は手前に薄い面、結界は包む円、光線は前へ伸びる帯、波は横に広がる弧、連弾は散る点、球は膨らむ円。
    if (w.kind === 'form' && u < 1.1) {
      const k = smooth(u / 1.1), size = 60 + f.intensity * 14;
      c.globalAlpha = (1 - k) * .55; c.lineWidth = 2; c.strokeStyle = pal.main; c.beginPath();
      if (w.form === 'wall') { const y = o.y + 26, hh = size * .5 * k; c.moveTo(o.x - size, y - hh); c.lineTo(o.x + size, y - hh * .9); c.lineTo(o.x + size, y + hh * .4); c.lineTo(o.x - size, y + hh * .5); c.closePath(); c.globalAlpha = (1 - k) * .14; c.fillStyle = pal.main; c.fill(); c.globalAlpha = (1 - k) * .55; }
      else if (w.form === 'dome') c.ellipse(o.x, o.y, size * (1.2 - k * .3), size * .7 * (1.2 - k * .3), 0, 0, Math.PI * 2);
      else if (w.form === 'beam') { const g = f.target; c.moveTo(o.x, o.y); c.lineTo(o.x + (g.x - o.x) * k * .55, o.y + (g.y - o.y) * k * .55); }
      else if (w.form === 'wave') { c.moveTo(o.x - size * k, o.y + 10); c.quadraticCurveTo(o.x, o.y - size * .6 * k, o.x + size * k, o.y + 10); }
      else if (w.form === 'swarm') { for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 + noise(i, 9); const d = 12 + k * size * .8; c.moveTo(o.x + Math.cos(a) * d, o.y + Math.sin(a) * d * .6); c.lineTo(o.x + Math.cos(a) * (d + 8), o.y + Math.sin(a) * (d + 8) * .6); } }
      else c.ellipse(o.x, o.y, 14 + k * 26, (14 + k * 26) * .8, 0, 0, Math.PI * 2);
      c.stroke();
    }
    // 用途：守れは輪が閉じ、縛れは横の輪が締まり、撃ては前へ短い線が走る。
    if (w.kind === 'purpose' && u < 1.1) {
      const k = smooth(u / 1.1); c.globalAlpha = (1 - k) * .6; c.lineWidth = 2.2; c.strokeStyle = pal.core;
      if (w.purpose === 'defend') { const r = 110 - k * 60; c.beginPath(); c.ellipse(o.x, o.y, r, r * .6, 0, 0, Math.PI * 2); c.stroke(); }
      else if (w.purpose === 'bind') for (let i = 0; i < 3; i++) { const r = (70 - k * 32) * (1 - i * .12); c.beginPath(); c.ellipse(o.x, o.y + (i - 1) * 20, r, 7, Math.sin(u * 3 + i) * .2, 0, Math.PI * 2); c.stroke(); }
      else if (w.purpose === 'attack') { const g = f.target, d = Math.hypot(g.x - o.x, g.y - o.y) || 1, nx = (g.x - o.x) / d, ny = (g.y - o.y) / d; c.beginPath(); for (let i = 0; i < 3; i++) { const s = 20 + i * 16 + k * 70; c.moveTo(o.x + nx * s, o.y + ny * s); c.lineTo(o.x + nx * (s + 14), o.y + ny * (s + 14)); } c.stroke(); }
      else for (let i = 0; i < 3; i++) { const p = (u * 1.2 + i / 3) % 1; c.globalAlpha = (1 - p) * (1 - k) * .5; c.beginPath(); c.ellipse(o.x, o.y + 20 - p * 60, 26 * (1 - p * .5), 9, 0, 0, Math.PI * 2); c.stroke(); }
    }
    // 変化の言葉（追尾、螺旋、分裂）は、中心の周りを回る短い光の筋で応える。
    if (w.kind === 'change' && u < 1.1) {
      const k = smooth(u / 1.1);
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 4 + u * 6, r = 10 + i * 4 * k; glow(f, o.x + Math.cos(a) * r, o.y + Math.sin(a) * r * .55, 2, (1 - k) * .6, pal.main, pal.core); }
    }
  }

  // 候補の色。確定前だけ、先に言った属性語の色を線の節と中心の光に薄く混ぜる。確定後は主属性の色に任せる。
  // 主属性の選び方は確定側（recipe.ts）と同じで、先に言った属性が主、二つ目は飾り色になる。
  const { main, accent } = spokenElements(words);
  if (!f.locked && main) {
    const pal = f.preset.palettes[main.element!], u = age(f, main);
    if (u >= 0) {
      const settle = clamp(u / .5), pulse = .5 + .5 * Math.sin(f.t * 4);
      // 飾り色は二つ目の属性語を言った後から、主の色の上に薄く添える。
      const accentPal = accent && age(f, accent) >= 0 ? f.preset.palettes[accent.element!] : null;
      const accentSettle = accentPal ? clamp(age(f, accent!) / .5) : 0;
      for (const p of getNodes(f.points, 10)) {
        const a = px(f, p);
        glow(f, a.x, a.y, 3.5 + pulse, .3 * settle, pal.main, pal.core);
        if (accentPal) glow(f, a.x, a.y, 2.2 + pulse * .6, .12 * accentSettle, accentPal.main, accentPal.core);
      }
      glow(f, o.x, o.y, 9 + pulse * 3, .28 * settle, pal.main, pal.core);
      if (accentPal) glow(f, o.x, o.y, 6 + pulse * 2, .11 * accentSettle, accentPal.main, accentPal.core);
      // 手元にも候補の色を添える。
      for (const p of f.cursors) {
        const a = px(f, p);
        glow(f, a.x, a.y, 5, .35 * settle, pal.main, pal.core);
        if (accentPal) glow(f, a.x, a.y, 3.2, .14 * accentSettle, accentPal.main, accentPal.core);
      }
      // 線に沿って候補の色の光が一つ巡る。飾り色があるときは少し離れてもう一つ続く。
      if (f.points.length > 1) {
        const at = f.points[Math.floor(((f.t * .3) % 1) * (f.points.length - 1))], q = px(f, at);
        glow(f, q.x, q.y, 3, .4 * settle, pal.main, pal.core);
        if (accentPal) {
          const b = f.points[Math.floor((((f.t * .3) + .12) % 1) * (f.points.length - 1))], r = px(f, b);
          glow(f, r.x, r.y, 2.4, .16 * accentSettle, accentPal.main, accentPal.core);
        }
      }
    }
  }
  c.globalAlpha = 1;
}
