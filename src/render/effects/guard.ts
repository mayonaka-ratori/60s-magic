import { clamp } from '../../game/motion';
import { AIM, aimRadiusPx, type XY as AimPoint } from '../../game/guard';
import { ENEMY_SLAM_MS, ROUNDS, type Beat } from '../../game/rounds';
import { increase } from './presets';
import { glow, line, edged, ease, smooth, few, noise, type Frame, type XY } from './frame';

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
/** 振り下ろした剣が床を打つのは、確定（振り下ろし）の何秒後か。回の表の値から出すので、ここに秒数は書かない。 */
export const SLAM_AFTER_LOCK = (ENEMY_SLAM_MS - ROUNDS[1].lock) / 1000;
/**
 * 床の亀裂。grow：走りきるまでの秒数。cool：赤熱が冷めるまでの秒数（冷めても縁は暗く残る）。
 * fade：回の終わりの何秒前から薄れるか。branches：本数。reach：いちばん長い亀裂の、画面の高さに対する割合。
 */
export const FLOOR_CRACK = { grow: .3, cool: 3, fade: 1, branches: 9, reach: .34 };
/** 塵。足元から左右へ広がり、画面の端まで流れる秒数と、粒の数（控えめモードでは3分の1）。 */
export const FLOOR_DUST = { seconds: 1.5, count: 48, colors: ['#8c8377', '#6b6259', '#a49a8c'] };
/** 敵の斬撃の大きさ。基準の1.4倍で放ち、近づくほど弧の半径が画面の高さのこの割合まで広がる（見える高さは半分近く）。 */
export const SLASH = { scale: 1.4, nearHeight: .25 };

/** 騎士の足元（画素）。横は狙う場所（胸の核）と同じ、縦は画面の下寄り。床の亀裂と塵はここから出る。 */
export const footOf = (f: Frame): XY => ({ x: f.target.x, y: f.h * .72 });
/**
 * 床の亀裂の状態。床を打つ前と回の終わりの後は null。
 * grow：走った長さ（0〜1）。heat：赤熱の残り（1から0.25へ冷める）。alpha：回の終わりの1秒で0へ薄れる濃さ。
 */
export function floorCrackAt(t: number, beat: Beat) {
  const slam = beat.lock + SLAM_AFTER_LOCK;
  if (t < slam || t >= beat.end) return null;
  const after = t - slam;
  return {
    grow: ease(clamp(after / FLOOR_CRACK.grow)),
    heat: 1 - clamp(after / FLOOR_CRACK.cool) * .75,
    alpha: 1 - clamp((t - (beat.end - FLOOR_CRACK.fade)) / FLOOR_CRACK.fade),
  };
}
/** 飛んでくる斬撃の弧の半径。放った直後は基準の半分ほど、届くころには画面の高さの4分の1（基準の1.3倍より小さくはしない）。 */
export function slashSizeAt(size: number, h: number, u: number) {
  const near = Math.max(size * 1.3, h * SLASH.nearHeight);
  return size * .55 + (near - size * .55) * clamp(u);
}

/** 外側の輪の大きさ。印の半径の1.5倍。 */
const AIM_OUTER = 1.5;
/** 目盛りの内端。印の半径の1.6倍。 */
const AIM_TICK_IN = 1.6;
/** 目盛りの外端。印の半径の2倍。印のうち一番外まで出る部分。 */
const AIM_TICK = 2;
/** 引き継いだ光点を並べる輪。印の半径の1.8倍。 */
const INHERITED_REACH = 1.8;
/** 脈と、囲めたときの膨らみで大きくなる上限。1.06倍が二つ重なる。 */
const AIM_SWELL = 1.06 * 1.06;

/**
 * 印の中心と、各部分の大きさ（画素）。描く側はここだけを見る。
 * 半径は画面の短いほうの辺で決まるので、縦長の画面でも目盛りまで画面に収まる。
 */
export function aimMark(w: number, h: number, aim: AimPoint = AIM) {
  const r = aimRadiusPx(w, h);
  return {
    x: aim.x * w, y: aim.y * h, r,
    /** 脈で一番大きくなったときの内側の輪 */ ring: r * AIM_SWELL,
    /** 同じく外側の輪 */ outer: r * AIM_SWELL * AIM_OUTER,
    /** 同じく目盛りの外端 */ ticks: r * AIM_SWELL * AIM_TICK,
    /** 引き継いだ光点が並ぶ輪 */ inherited: r * INHERITED_REACH,
  };
}
const aimAt = (f: Frame): XY => { const m = aimMark(f.w, f.h, f.aim); return { x: m.x, y: m.y }; };
const lerp = (a: XY, b: XY, u: number): XY => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });

/** 亀裂を一本、道として組み立てる。床に沿って見えるよう縦を潰し、途中で小さく折れ曲がる。 */
function crackPath(c: CanvasRenderingContext2D, foot: XY, i: number, length: number) {
  // 向きは放射状に配り、少しずつずらす。下向きの亀裂を多めにして、床の手前に広がって見せる。
  const a = (i / FLOOR_CRACK.branches) * Math.PI * 2 + (noise(i, 21) - .5) * .7;
  const flat = .38;
  c.moveTo(foot.x, foot.y);
  for (let k = 1; k <= 5; k++) {
    const d = length * k / 5, wob = (noise(i * 7 + k, 22) - .5) * length * .16;
    c.lineTo(foot.x + Math.cos(a) * d - Math.sin(a) * wob, foot.y + (Math.sin(a) * d + Math.cos(a) * wob) * flat);
  }
  // 半分より先で枝を一本出す。すべての亀裂に出すと均等になりすぎるので、乱数で3本に2本ほど。
  if (noise(i, 23) > .35) {
    const d = length * .6, b = a + (noise(i, 24) - .5) * 1.4, bl = length * .3;
    const x = foot.x + Math.cos(a) * d, y = foot.y + Math.sin(a) * d * flat;
    c.moveTo(x, y); c.lineTo(x + Math.cos(b) * bl, y + Math.sin(b) * bl * flat);
  }
}

/**
 * 床の一撃。振り下ろした剣が床を打った瞬間、足元から放射状に亀裂が走り、塵が左右へ流れる。
 * 亀裂は回の終わりまで残し、最後の1秒で薄れる。暗い線は光を足す描き方では見えないので、普通の重ね方で先に描く。
 */
function drawFloorSlam(f: Frame) {
  const state = floorCrackAt(f.t, f.beat); if (!state) return;
  const c = f.c, foot = footOf(f), reach = f.h * FLOOR_CRACK.reach;
  // 塵。足元から左右へ、画面の端まで届く速さで流す。控えめモードでは3分の1。
  f.once('floor-slam-dust', () => {
    const n = Math.round(few(f, FLOOR_DUST.count));
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1, edge = side > 0 ? f.w - foot.x : foot.x;
      // 速さは「端までの距離を1.5秒で進む」を下限にし、寿命も1.5秒以上にする。どの粒も端まで届く。
      const speed = (edge + 40) / FLOOR_DUST.seconds * (1 + f.pool.random() * .5);
      const color = FLOOR_DUST.colors[i % FLOOR_DUST.colors.length];
      f.pool.spawn({ x: foot.x + side * f.pool.random() * 30, y: foot.y + (f.pool.random() - .5) * 18,
        vx: side * speed, vy: -6 - f.pool.random() * 28, life: FLOOR_DUST.seconds * (1 + f.pool.random() * .4),
        size: 10 + f.pool.random() * 14, gravity: -4, drag: 1, color, core: color, kind: 3 });
    }
  });
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath();
  for (let i = 0; i < FLOOR_CRACK.branches; i++) crackPath(c, foot, i, reach * (.55 + noise(i, 20) * .45) * state.grow);
  // 暗い線（割れた床の影）。
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = state.alpha * .85; c.lineWidth = 3.2; c.strokeStyle = ENEMY.edge; c.stroke();
  // 赤熱した縁。同じ道の中心を細く光らせ、冷めるほど暗くする。飽和した赤は使わず、敵の色のまま。
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = state.alpha * state.heat * .8; c.lineWidth = 1.2; c.strokeStyle = ENEMY.main; c.stroke();
  c.globalAlpha = state.alpha * state.heat * .35; c.lineWidth = .7; c.strokeStyle = ENEMY.spark; c.stroke();
  glow(f, foot.x, foot.y, 3 + 10 * state.heat, state.alpha * state.heat * .6, ENEMY.main, ENEMY.core);
}

/** 三日月の斬撃。進む向きへ開いた弧を、白い芯と暗い赤の縁で描く。 */
function crescent(f: Frame, at: XY, dir: number, size: number, alpha: number) {
  const c = f.c, back = { x: at.x - Math.cos(dir) * size, y: at.y - Math.sin(dir) * size };
  edged(f, 3.4, alpha, () => { c.arc(back.x, back.y, size, dir - 1.15, dir + 1.15); }, ENEMY.main, ENEMY.core);
  edged(f, 1.5, alpha * .6, () => { c.arc(back.x, back.y, size * 1.3, dir - .85, dir + .85); }, ENEMY.main, ENEMY.core);
}

/** 印の縦の潰し。床の丸ではなく、宙に浮いた輪として見せるので、少しだけ潰す。 */
const AIM_FLAT = .88;

/**
 * 狙いの印。防御の回の始まりから出し、1秒に1回だけ低く脈打つ。
 * 印の範囲に線があれば属性の色へ変わり、囲えたら内側が濃く満ちる。
 */
function drawAim(f: Frame) {
  const { c, t, beat } = f;
  if (t < beat.start || t > beat.impact + .8) return;
  const mark = aimMark(f.w, f.h, f.aim), g = { x: mark.x, y: mark.y }, r = mark.r;
  const shield = f.guard?.shield ?? null;
  // 確定前は今の入力を、確定後は決まった盾を見る。
  const held = shield ? shield.enclosed : f.live.rings > 0;
  // 囲めていなくても、印の範囲に線があれば「ここは守れる」と色で返す。
  // 何も描いていないときに出る光の玉（covering も enclosed も false）は、守れたことにしない。
  const covered = held || (shield ? shield.covering : f.live.covered);
  const appear = smooth(clamp((t - beat.start) / 1.2));
  const gone = 1 - clamp((t - beat.impact) / .5);
  // 脈は毎秒1回まで。光に弱い人への配慮で、これより速くしない。
  const pulse = .5 + .5 * Math.sin((t - beat.start) * Math.PI * 2);
  const near = clamp((t - beat.lock) / Math.max(.1, beat.release - beat.lock));
  const alpha = appear * gone * (.45 + pulse * .3 + near * .25);
  if (alpha <= .01) return;
  const main = covered ? f.palette.main : ENEMY.main, core = covered ? f.palette.core : ENEMY.core;
  const size = r * (1 + pulse * .06) * (held ? 1.06 : 1);
  // 内側の輪、外側の輪、四方の目盛り。宙に浮いて見えるよう、縦を少しだけ潰す。
  edged(f, 2, alpha, () => { c.ellipse(g.x, g.y, size, size * AIM_FLAT, 0, 0, Math.PI * 2); }, main, core);
  c.globalAlpha = alpha * .5; c.lineWidth = 1.2; c.strokeStyle = main;
  c.beginPath(); c.ellipse(g.x, g.y, size * AIM_OUTER, size * AIM_OUTER * AIM_FLAT, 0, 0, Math.PI * 2); c.stroke();
  c.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + t * .4;
    c.moveTo(g.x + Math.cos(a) * size * AIM_TICK_IN, g.y + Math.sin(a) * size * AIM_TICK_IN * AIM_FLAT);
    c.lineTo(g.x + Math.cos(a) * size * AIM_TICK, g.y + Math.sin(a) * size * AIM_TICK * AIM_FLAT);
  }
  c.stroke();
  // 守れているときは内側が満ちる。囲えたときはもっと濃く出し、「掴んだ」ことが分かるようにする。
  if (covered) {
    c.globalAlpha = alpha * (held ? .16 : .07); c.fillStyle = f.palette.main;
    c.beginPath(); c.ellipse(g.x, g.y, size, size * AIM_FLAT, 0, 0, Math.PI * 2); c.fill();
    glow(f, g.x, g.y, 4 + pulse * 3, alpha * (held ? .5 : .22));
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
  const mark = aimMark(f.w, f.h, f.aim), g = { x: mark.x, y: mark.y }, reach = mark.inherited;
  for (let i = 0; i < f.inherited.length; i++) {
    const node = f.inherited[i], a = i / Math.max(1, f.inherited.length) * Math.PI * 2 + t * .25;
    const x = node.x * f.w + (g.x + Math.cos(a) * reach - node.x * f.w) * appear;
    const y = node.y * f.h + (g.y + Math.sin(a) * reach * .6 - node.y * f.h) * appear;
    const pal=node.element?f.preset.palettes[node.element]:f.palette;
    glow(f, x, y, 2 + Math.sin(t * 2 + i) * .5, .25 + appear * .2,pal.main,pal.core);
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
    if (k === 0 && (!plan.surface || plan.surface === 'grid')) {
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
  if(plan.surface==='membrane') {
    c.save();c.beginPath();shieldPath(f,1+flex,back);c.clip();
    const sheen=c.createLinearGradient(g.x-reach,g.y-reach,g.x+reach,g.y+reach);
    sheen.addColorStop(0,f.palette.main);sheen.addColorStop(.5,f.palette.core);sheen.addColorStop(1,f.palette.main);
    c.fillStyle=sheen;c.globalAlpha=alpha*(.16+form*.16);c.fillRect(g.x-reach,g.y-reach,reach*2,reach*2);c.restore();
  }
  if(plan.surface==='orb')glow(f,g.x,g.y,12+form*16,alpha*.65);
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
  // 大型の敵の一撃なので基準を1.4倍にし、届くころには画面の高さの半分近くまで広げる（slashSizeAt）。
  const size = (26 + f.intensity * 6) * SLASH.scale, near = slashSizeAt(size, f.h, 1);
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
    crescent(f, at, dir, slashSizeAt(size, f.h, u), .55 + u * .45);
    glow(f, at.x, at.y, 5 + u * 10, .4 + u * .4, ENEMY.main, ENEMY.core);
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
      // 届いたときの大きさから、遠ざかるにつれて放ったときの大きさへ戻る。
      crescent(f, at, dir + Math.PI, near + (size * .6 - near) * u, .8 * (1 - u * .3));
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
      crescent(f, g, dir, near * (1 - u) + 4, 1 - u);
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
    crescent(f, at, dir + side * .5 * u, near * (1 - u * .5), (1 - u) * .8);
  }
}

/** 防御の回の描画。呼び出し側はこれ一つだけを呼ぶ。 */
export function drawGuard(f: Frame) {
  const c = f.c;
  c.save(); drawInherited(f); drawAim(f); drawRings(f); c.restore();
  // 床の亀裂と塵は盾と斬撃より奥にあるので、先に描く。
  c.save(); drawFloorSlam(f); c.restore();
  c.globalCompositeOperation = 'lighter';
  c.save(); drawShield(f); c.restore();
  c.globalCompositeOperation = 'lighter';
  c.save(); drawSlash(f); c.restore();
  c.globalCompositeOperation = 'lighter';
}
