import { clamp } from '../../game/motion';
import { AIM_RADIUS } from '../../game/guard';
import { increase } from './presets';
import { glow, line, edged, ease, smooth, type Frame, type XY } from './frame';

/**
 * 防御の回の見せ方。狙いの印、囲ったときの返事、盾、敵の一撃、受け止め方をここにまとめる。
 * 時刻は f.beat からの相対だけで書き、秒数を埋め込まない。
 */

/** 敵の一撃の色。プレイヤーの魔法は属性の色なので、色だけで敵と自分が分かる。飽和した赤は使わない。 */
export const ENEMY = { main: '#d2432a', edge: '#40100a', core: '#ffd8c6', spark: '#ff9c66' };
/** 発動から何秒後に敵が斬撃を放つか。必ずプレイヤーの魔法が出た後に来る。 */
export const LAUNCH_AFTER_RELEASE = .4;
/** 盾を運ぶ動きにかける時間（秒）。締め切りの直後から。 */
const MOVE_SECONDS = 1;

const aimAt = (f: Frame): XY => ({ x: f.aim.x * f.w, y: f.aim.y * f.h });
const lerp = (a: XY, b: XY, u: number): XY => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });

/** 三日月の斬撃。進む向きへ開いた弧を、白い芯と暗い赤の縁で描く。 */
function crescent(f: Frame, at: XY, dir: number, size: number, alpha: number) {
  const c = f.c, back = { x: at.x - Math.cos(dir) * size, y: at.y - Math.sin(dir) * size };
  edged(f, 3.4, alpha, () => { c.arc(back.x, back.y, size, dir - 1.15, dir + 1.15); }, ENEMY.main, ENEMY.core);
  edged(f, 1.5, alpha * .6, () => { c.arc(back.x, back.y, size * 1.3, dir - .85, dir + .85); }, ENEMY.main, ENEMY.core);
}

/** 狙いの印。24秒から出し、1秒に1回だけ低く脈打つ。囲えたら赤から属性の色へ変わる。 */
function drawAim(f: Frame) {
  const { c, t, beat } = f;
  if (t < beat.start || t > beat.impact + .8) return;
  const g = aimAt(f), r = AIM_RADIUS * f.h;
  // 確定前は今の入力を、確定後は決まった盾を見る。
  const held = f.guard ? f.guard.shield.enclosed : f.live.rings > 0;
  const appear = smooth(clamp((t - beat.start) / 1.2));
  const gone = 1 - clamp((t - beat.impact) / .5);
  // 脈は毎秒1回まで。光に弱い人への配慮で、これより速くしない。
  const pulse = .5 + .5 * Math.sin((t - beat.start) * Math.PI * 2);
  const near = clamp((t - beat.lock) / Math.max(.1, beat.release - beat.lock));
  const alpha = appear * gone * (.45 + pulse * .3 + near * .25);
  if (alpha <= .01) return;
  const main = held ? f.palette.main : ENEMY.main, core = held ? f.palette.core : ENEMY.core;
  const size = r * (1 + pulse * .06) * (held ? 1.06 : 1);
  // 内側の輪、外側の輪、四方の目盛り。床に沿って見えるよう縦を潰す。
  edged(f, 2, alpha, () => { c.ellipse(g.x, g.y, size, size * .62, 0, 0, Math.PI * 2); }, main, core);
  c.globalAlpha = alpha * .5; c.lineWidth = 1.2; c.strokeStyle = main;
  c.beginPath(); c.ellipse(g.x, g.y, size * 1.5, size * .95, 0, 0, Math.PI * 2); c.stroke();
  c.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + t * .4;
    c.moveTo(g.x + Math.cos(a) * size * 1.6, g.y + Math.sin(a) * size * 1);
    c.lineTo(g.x + Math.cos(a) * size * 2, g.y + Math.sin(a) * size * 1.25);
  }
  c.stroke();
  // 囲えているときだけ内側が薄く満ちる。「掴んだ」ことがひと目で分かる。
  if (held) {
    c.globalAlpha = alpha * .16; c.fillStyle = f.palette.main;
    c.beginPath(); c.ellipse(g.x, g.y, size, size * .62, 0, 0, Math.PI * 2); c.fill();
    glow(f, g.x, g.y, 4 + pulse * 3, alpha * .5);
  }
}

/** 囲えた瞬間の返事。囲った数ごとに一度だけ、光が輪の上を走る。 */
function drawRings(f: Frame) {
  const { t, beat } = f;
  if (t < beat.start || t >= beat.inputEnd) return;
  const rings = f.live.rings;
  if (!rings) return;
  const g = aimAt(f);
  f.once(`ring-${rings}`, () => {
    const n = Math.round(increase(26, f.intensity, .5) * (f.calm ? 1 / 3 : 1));
    for (let i = 0; i < n; i++) {
      const a = f.pool.random() * Math.PI * 2, speed = 70 + f.pool.random() * 180;
      f.pool.spawn({ x: g.x, y: g.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed * .6, life: .5 + f.pool.random() * .5,
        size: 1.2 + f.pool.random() * 1.8, drag: .25, color: f.palette.spark, core: f.palette.core, kind: f.pool.random() < .5 ? 1 : 0 });
    }
  });
}

/** 前の回から引き継いだ光点。印のまわりへ配り、薄く残す。 */
function drawInherited(f: Frame) {
  const { t, beat } = f;
  if (!f.inherited.length || t < beat.start || t > beat.impact) return;
  const appear = smooth(clamp((t - beat.start) / 1.5));
  for (let i = 0; i < f.inherited.length; i++) {
    const node = f.inherited[i], a = i / Math.max(1, f.inherited.length) * Math.PI * 2 + t * .25;
    const g = aimAt(f), reach = AIM_RADIUS * f.h * 2.4;
    const x = node.x * f.w + (g.x + Math.cos(a) * reach - node.x * f.w) * appear;
    const y = node.y * f.h + (g.y + Math.sin(a) * reach * .6 - node.y * f.h) * appear;
    glow(f, x, y, 2 + Math.sin(t * 2 + i) * .5, .25 + appear * .2);
  }
}

/** 盾の輪郭を道として組み立てる。中心から scale 倍に広げ、運ぶ途中なら元の位置へ戻す。 */
function shieldPath(f: Frame, scale: number, back: number) {
  const plan = f.guard; if (!plan) return;
  const c = f.c, s = plan.shield, center = s.center;
  const dx = -s.offset.x * back * f.w, dy = -s.offset.y * back * f.h;
  for (let i = 0; i < s.outline.length; i++) {
    const p = s.outline[i];
    const x = (center.x + (p.x - center.x) * scale) * f.w + dx;
    const y = (center.y + (p.y - center.y) * scale) * f.h + dy;
    if (!i) c.moveTo(x, y); else c.lineTo(x, y);
  }
  c.closePath();
}

/** 盾。描いた線がそのまま縁になる。何重にも囲えば層が重なる。 */
function drawShield(f: Frame) {
  const { c, t, beat } = f, plan = f.guard;
  if (!plan || t < beat.inputEnd) return;
  const s = plan.shield;
  // 囲えなかった線は、締め切りのあと1秒かけて印の前まで運ぶ。
  const back = s.moved ? 1 - smooth(clamp((t - beat.inputEnd) / MOVE_SECONDS)) : 0;
  const form = smooth(clamp((t - beat.inputEnd) / Math.max(.1, beat.release - beat.inputEnd)));
  const after = t - beat.impact;
  // 当たった瞬間だけ面が波打ち、そのあとゆっくり薄れる。控えめモードでは波打たせない。
  const flex = after >= 0 && !f.calm ? Math.exp(-after * 7) * Math.sin(after * 40) * .05 : 0;
  const live = 1 - clamp((after - 1.6) / 1.8);
  if (live <= 0) return;
  const alpha = (.35 + form * .65) * live;
  const layers = Math.max(1, s.layers);
  const g = { x: (s.center.x - s.offset.x * back) * f.w, y: (s.center.y - s.offset.y * back) * f.h };
  const reach = s.radius * f.h * 1.2;
  for (let k = layers - 1; k >= 0; k--) {
    // 手前の層から順に砕ける。受け止めるほど層が減っていく。
    const broken = plan.style === 'block' && after > 0 ? clamp((after - k * .12) / .5) : 0;
    const scale = (1 - k * .13) * (1 + flex) * (1 + broken * .12);
    const a = alpha * (1 - k * .18) * (1 - broken);
    if (a <= .01) continue;
    // 道を一度だけ組み立て、塗りと三重の線で使い回す。毎コマの組み立てを半分にする。
    const width = 2.6 + (layers - k) * .3;
    c.beginPath(); shieldPath(f, scale, back);
    c.globalAlpha = a * .14; c.fillStyle = f.palette.main; c.fill();
    c.globalAlpha = a * .35; c.lineWidth = width * 2.2; c.strokeStyle = f.palette.main; c.stroke();
    c.globalAlpha = a; c.lineWidth = width; c.stroke();
    c.globalAlpha = a * .95; c.lineWidth = Math.max(.9, width * .38); c.strokeStyle = f.palette.core; c.stroke();
    // 面の中を流れる光の格子。一番外の層の内側だけに出し、盾の外へはみ出させない。
    if (k === 0) {
      c.save(); c.clip();
      c.globalAlpha = alpha * .3; c.lineWidth = 1; c.strokeStyle = f.palette.main;
      c.beginPath();
      for (let i = -3; i <= 3; i++) {
        const u = ((t * .25 + i / 7) % 1) * 2 - 1;
        c.moveTo(g.x - reach, g.y + u * reach * .8); c.lineTo(g.x + reach, g.y + u * reach * .8);
      }
      c.stroke(); c.restore();
    }
  }
  glow(f, g.x, g.y, 6 + form * 7, alpha * .35);
  // 運んでいる間は、元の位置から尾を引く。尾は「どこから来たか」を見せるので、元の位置へ向ける。
  if (back > 0) {
    const origin = { x: (s.center.x - s.offset.x) * f.w, y: (s.center.y - s.offset.y) * f.h };
    line(f, { x: g.x, y: g.y }, origin, 1.6, back * .35);
  }
}

/** 敵の一撃。予告の線、飛んでくる斬撃、受け止め方ごとの消え方。 */
function drawSlash(f: Frame) {
  const { c, t, beat } = f;
  // f.target は magic.ts の時点で画面の座標になっている。ここで画面の大きさを掛け直さない。
  const g = aimAt(f), from = f.target;
  const launch = beat.release + LAUNCH_AFTER_RELEASE, arrive = beat.impact;
  const dir = Math.atan2(g.y - from.y, g.x - from.x);
  const size = 26 + f.intensity * 6;
  // 予告の線。剣先から狙いの場所へ走り、締め切りが近づくほどはっきりする。
  if (t >= beat.start && t < arrive) {
    const near = clamp((t - beat.start) / Math.max(.1, beat.lock - beat.start)), swing = clamp((t - beat.lock) / .8);
    c.globalAlpha = (.12 + near * .25 + swing * .4) * (1 - clamp((t - launch) / .3));
    c.lineWidth = 1.4 + swing * 1.6; c.strokeStyle = ENEMY.main;
    c.beginPath(); c.moveTo(from.x, from.y); c.lineTo(g.x, g.y); c.stroke();
    for (let i = 0; i < 4; i++) {
      const u = ((t * .8 + i / 4) % 1);
      glow(f, from.x + (g.x - from.x) * u, from.y + (g.y - from.y) * u, 1.8, (.25 + swing * .5) * (1 - u), ENEMY.main, ENEMY.core);
    }
  }
  if (t < launch) return;
  const style = f.guard?.style ?? 'block';
  if (t < arrive) {
    // 飛んでくる。近づくほど大きく速く見せる。
    const u = ease(clamp((t - launch) / Math.max(.1, arrive - launch)));
    const at = lerp(from, g, u);
    crescent(f, at, dir, size * (.55 + u * .75), .55 + u * .45);
    glow(f, at.x, at.y, 5 + u * 6, .4 + u * .4, ENEMY.main, ENEMY.core);
    return;
  }
  const after = t - arrive;
  // 当たった。火花と、止め方ごとの消え方。
  f.once('guard-contact', () => {
    const n = Math.round(increase(f.preset.impactParticles, f.intensity, .5) * .8 * (f.calm ? 1 / 3 : 1));
    for (let i = 0; i < n; i++) {
      const a = f.pool.random() * Math.PI * 2, speed = 80 + f.pool.random() * 420;
      const mine = i % 3 !== 0;
      // かけらは手前（下）へ多めに飛ばし、視界を通り過ぎるように見せる。
      f.pool.spawn({ x: g.x + (f.pool.random() - .5) * 16, y: g.y + (f.pool.random() - .5) * 12,
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed * .7 + 120, life: .5 + f.pool.random() * .9,
        size: 1.4 + f.pool.random() * 3, gravity: 420, drag: .3, floor: f.h * .88,
        color: mine ? f.palette.spark : ENEMY.spark, core: mine ? f.palette.core : ENEMY.core,
        kind: f.pool.random() < .45 ? 2 : 1 });
    }
  });
  // 接触点から広がる輪。
  const rings = Math.round(increase(f.preset.impactRings, f.intensity, .3));
  for (let i = 0; i < rings; i++) {
    const u = clamp((after - i * .08) / .9); if (u <= 0 || u >= 1) continue;
    const r = ease(u) * (40 + f.recipe.area * 70 + f.intensity * 12) * (1.3 + i * .2);
    c.globalAlpha = (1 - u) * .75; c.lineWidth = 3 - u * 2; c.strokeStyle = i % 2 ? f.palette.core : f.palette.main;
    c.beginPath(); c.ellipse(g.x, g.y, Math.max(1, r), Math.max(1, r * .6), 0, 0, Math.PI * 2); c.stroke();
  }
  glow(f, g.x, g.y, (14 + f.intensity * 4) * Math.max(0, 1 - after / .8) + 3, Math.max(0, 1 - after / .9) * .9);

  if (style === 'reflect') {
    // 弾き返す。来た道を戻り、騎士へ届いて消える。
    const u = clamp(after / .8);
    if (u < 1) {
      const at = lerp(g, from, ease(u));
      crescent(f, at, dir + Math.PI, size * (1.1 - u * .35), .8 * (1 - u * .3));
      glow(f, at.x, at.y, 6, .5 * (1 - u), ENEMY.main, ENEMY.core);
    } else if (after < 1.5) {
      glow(f, from.x, from.y, 12 * Math.max(0, 1 - (after - .8) / .6), Math.max(0, 1 - (after - .8) / .6) * .8);
    }
    return;
  }
  if (style === 'erase') {
    // かき消す。縮みながら明るくなり、煙だけが残る。
    const u = clamp(after / .35);
    if (u < 1) {
      crescent(f, g, dir, size * (1 - u) + 4, 1 - u);
      glow(f, g.x, g.y, 8 * (1 - u) + 6, 1 - u * .5);
    }
    f.once('guard-erase', () => {
      for (let i = 0; i < 14; i++) f.pool.spawn({ x: g.x + (f.pool.random() - .5) * 40, y: g.y + (f.pool.random() - .5) * 30,
        vx: (f.pool.random() - .5) * 30, vy: -18 - f.pool.random() * 26, life: 1.4 + f.pool.random() * 1.2,
        size: 14 + f.pool.random() * 16, gravity: -6, drag: .7, color: '#1b1310', core: '#1b1310', kind: 3 });
    });
    return;
  }
  // 受け止める。斬撃が左右へ割れて滑り落ちる。
  const u = clamp(after / .7);
  if (u < 1) for (const side of [-1, 1]) {
    const slide = ease(u) * (50 + f.intensity * 20);
    const at = { x: g.x + Math.cos(dir + Math.PI / 2 * side) * slide, y: g.y + Math.sin(dir + Math.PI / 2 * side) * slide * .7 + u * u * 40 };
    crescent(f, at, dir + side * .5 * u, size * (1 - u * .5), (1 - u) * .8);
  }
}

/** 防御の回の描画。呼び出し側はこれ一つだけを呼ぶ。 */
export function drawGuard(f: Frame) {
  const c = f.c;
  c.save(); drawInherited(f); drawAim(f); drawRings(f); c.restore();
  c.globalCompositeOperation = 'lighter';
  c.save(); drawShield(f); c.restore();
  c.globalCompositeOperation = 'lighter';
  c.save(); drawSlash(f); c.restore();
  c.globalCompositeOperation = 'lighter';
}
