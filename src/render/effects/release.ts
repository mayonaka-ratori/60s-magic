import { clamp } from '../../game/motion';
import type { Element } from '../../game/types';
import { increase, type Palette } from './presets';
import { RELEASE_AT, IMPACT_AT } from './screen';
import { few, glow, line, edged, mixOf, noise, ease, smooth, originsOf, extentOf, type Frame, type XY } from './frame';

/** 一回目の、放出から命中までの長さ（秒）。 */
export const ARRIVAL = IMPACT_AT - RELEASE_AT;
/** 面（壁、結界、波）の中を流れる粒の数。派手さで増える。 */
const SURFACE_PARTICLES = 10;
/** 光線の帯に沿って流れる粒の数。派手さで増える。 */
const BEAM_PARTICLES = 8;
/** 光線の粒の、流れる位置に使う種。弾の番号はここに足し、粒の番号とは別の引数に分ける。 */
const BEAM_FLOW_SEED = 40;
/** 光線の台形を、口から先まで何区切りで描くか。収束の曲線がなめらかに見える最小の数。 */
const BEAM_SEGMENTS = 8;
/** 光線の口の幅。術式の範囲の横幅に対する割合。連弾の光線は本数で分け合う。 */
export const BEAM_MOUTH = .6;
/** 雷の本体の折れ線を、毎秒何回描き替えるか。 */
const BOLT_STEPS_PER_SECOND = 24;
/** 雷の折れ線の節の数と、弾ごとに番号をずらす幅。足して同じ番号にならないよう、節の数より広くとる。 */
const BOLT_JOINTS = 6, BOLT_INDEX_SPAN = 7;
/** 出どころの選び方の種。何発目にどの光点を割り当てるかの始まりを、個数と光点の数から決まった形でずらす。 */
const LAUNCH_SEED = 60;
/**
 * 弾の膨らみ。道のりの前半（turn まで）は狙いから離れて画面の端の方へ出て、後半で一気に騎士へ寄せる。
 * 大きさは画面の幅に対する割合（min〜max）で、小さく描いた人でも左右の空間を使えるよう下限を2割にする。
 * 術式の範囲が広ければ、その横幅の extent 倍も足す。margin は画面の端に残す余白（画素）で、弾を画面の外へは出さない。
 */
export const SWELL = { turn: .6, min: .2, max: .35, extent: .15, margin: 24, seed: 70 } as const;
/** 膨らみが画面の端に当たらないか確かめる、道のりの進み具合の見本。膨らみが大きい前半から折り返しの後まで。 */
const SWELL_SAMPLES = [.25, .4, .55, .7, .85] as const;
/** 面（壁、結界、波）が騎士へ進むとき、奥へ行くほど縮める割合。到着で7割の大きさになる。 */
const FACE_DEPTH = .3;
/** 結界の楕円が範囲に外接するための倍率（√2）。四角の角を通る楕円の半径は、辺の半分の√2倍。 */
const DOME_FIT = Math.SQRT2;
/** その回の、放出から命中までの長さ（秒）。 */
export const arrivalOf = (f: Frame) => f.beat.impact - f.beat.release;

/**
 * 連弾の i 発目が届くまでの遅れ（秒）。80ms間隔で数発届き、最後の1発だけ200ms空けて落とす。
 * 単発は0で、命中の23.5秒ちょうどに届く。
 */
export function hitDelay(i: number, count: number) {
  if (count <= 1) return 0;
  return i * .08 + (i === count - 1 ? .2 : 0);
}

/**
 * 弾 i の出どころ。単発は中心。連弾は光点の並び（中心を除く）から均等に選び、1発ずつ別の光点から出す。
 * 光点が弾の数より少なければ、中心も入れて順に繰り返す。
 * 始める位置は個数と光点の数から決まった乱数で決めるので、同じ入力なら同じ選び方になる。
 */
export function launchOf(f: Frame, i: number, count: number): XY {
  const spots = originsOf(f);
  if (count <= 1 || spots.length <= 1) return spots[0];
  const ring = spots.slice(1);
  if (count <= ring.length) {
    const shift = Math.floor(noise(count, LAUNCH_SEED + ring.length) * ring.length);
    return ring[(shift + Math.floor(i * ring.length / count)) % ring.length];
  }
  const shift = Math.floor(noise(count, LAUNCH_SEED + spots.length) * spots.length);
  return spots[(shift + i) % spots.length];
}

/** 出どころを、重なりを除いて弾の順に並べたもの。放出の破裂を出どころごとに出すのに使う。 */
export function launchesOf(f: Frame): XY[] {
  const count = Math.max(1, f.recipe.count), out: XY[] = [];
  for (let i = 0; i < count; i++) {
    const a = launchOf(f, i, count);
    if (!out.some(b => b.x === a.x && b.y === a.y)) out.push(a);
  }
  return out;
}

/** 出どころが術式の範囲の中心より右にあるか。ちょうど中心は左（主属性）に数える。 */
export function rightOf(f: Frame, a: XY) {
  const e = extentOf(f);
  return a.x > e.x + e.width / 2;
}

/**
 * 出どころ a から出る弾の色。二属性の連弾は、範囲の中心より左から出る弾が主属性、右から出る弾が二属性目。
 * 単発と一属性は主属性のまま。
 */
export function bulletPalette(f: Frame, a: XY): Palette {
  return f.accent && f.recipe.count >= 2 && rightOf(f, a) ? f.accent : mixOf(f).pal;
}

/** 道のりの進み具合から、まっすぐ進んだ分の割合。前半はゆっくり、後半で加速する（始めの速さ0.4、終わりの速さ1.6）。 */
export const alongOf = (u: number) => u * (.4 + .6 * u);

/** 膨らみの推移（0〜1）。turn（道のりの6割）で外へ出きり、そこから到着までで一気に戻る。到着では0。 */
export function swellProfile(u: number) {
  if (u <= 0 || u >= 1) return 0;
  if (u < SWELL.turn) return smooth(u / SWELL.turn);
  const back = (u - SWELL.turn) / (1 - SWELL.turn);
  return 1 - back * back;
}

/** 点 (x, y) から向き (dx, dy) に進んで、画面の端（余白つき）に当たるまでの長さ。すでに外なら0。 */
function reachOf(w: number, h: number, x: number, y: number, dx: number, dy: number) {
  let t = Infinity;
  if (dx > 0) t = Math.min(t, (w - SWELL.margin - x) / dx); else if (dx < 0) t = Math.min(t, (SWELL.margin - x) / dx);
  if (dy > 0) t = Math.min(t, (h - SWELL.margin - y) / dy); else if (dy < 0) t = Math.min(t, (SWELL.margin - y) / dy);
  return Math.max(0, t);
}

/**
 * 弾 i の膨らみの向き（長さ1）と大きさ（画素）。
 * 向きは範囲の中心から出どころへの向き。左なら左へ、右なら右へ、上なら上へ。下向きは床へ潜るので3割に弱める。
 * 出どころが中心のあたり（単発や、光点が足りず中心から出る弾。範囲の大きい方の15%より近い）は、
 * 連弾なら弾ごとの角度で散らし、単発は飛ぶ向きと直角に上へ。
 * 騎士へ向かう向きの成分は取り除く。残すと途中で騎士に届いてから戻る動きになる。横と後ろだけ残し、
 * それも無ければ飛ぶ向きと直角に上へ。
 * 大きさは画面の幅の2〜3.5割に範囲の横幅の分を足し、道のりのどこでも画面の端（余白つき）を越えないところで頭打ちにする。
 */
export function swellOf(f: Frame, i: number, count: number, a: XY): { dx: number; dy: number; amount: number } {
  const e = extentOf(f), g = f.target;
  let dx = a.x - (e.x + e.width / 2), dy = a.y - (e.y + e.height / 2);
  if (dy > 0) dy *= .3;
  // 飛ぶ向き（長さ1）と、その直角で上を向く方。
  const fl = Math.hypot(g.x - a.x, g.y - a.y) || 1, fx = (g.x - a.x) / fl, fy = (g.y - a.y) / fl;
  // 直角の向きは二つある。画面の上（y が小さい方）を向く方を選ぶ。右へ飛ぶなら (fy, -fx)、左へ飛ぶなら (-fy, fx)。
  const upX = fx >= 0 ? fy : -fy, upY = fx >= 0 ? -fx : fx;
  if (Math.hypot(dx, dy) < Math.max(4, Math.max(e.width, e.height) * .15)) {
    if (count > 1) { const angle = i / count * Math.PI * 2; dx = Math.cos(angle); dy = Math.sin(angle) * .5; }
    else { dx = upX; dy = upY; }
  }
  const forward = dx * fx + dy * fy;
  if (forward > 0) { dx -= forward * fx; dy -= forward * fy; }
  if (Math.hypot(dx, dy) < 1e-6) { dx = upX; dy = upY; }
  const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
  let amount = f.w * (SWELL.min + (SWELL.max - SWELL.min) * noise(i, SWELL.seed + count)) + e.width * SWELL.extent;
  // 見本の進み具合ごとに、まっすぐ進んだ位置から端までの長さを膨らみの割合で割り、一番きついところで頭打ちにする。
  for (const u of SWELL_SAMPLES) {
    const along = alongOf(u), reach = reachOf(f.w, f.h, a.x + (g.x - a.x) * along, a.y + (g.y - a.y) * along, dx, dy);
    amount = Math.min(amount, reach / swellProfile(u));
  }
  return { dx, dy, amount };
}

/**
 * 本体 i 個目の位置。進み具合 0〜1 と軌道から決まる。尾を描くために過去の値も求められる。
 * 出どころの光点から出て、前半は画面の端の方へ膨らみ、後半で加速して騎士へ寄る。到着では必ず狙いの一点。
 * 螺旋、放射、周回、追尾の違いは、この膨らみの上に載せる。
 */
export function bodyPoint(f: Frame, i: number, travelRaw: number, time: number): XY {
  const r = f.recipe, g = f.target, count = Math.max(1, r.count);
  // 弾ごとに少し遅らせる。最初の1発が命中の時刻、最後の1発が一番遅れて届く。
  const travel = clamp(travelRaw - hitDelay(i, count) / arrivalOf(f));
  if (travel >= 1) return { x: g.x, y: g.y };
  const a = launchOf(f, i, count), s = swellOf(f, i, count, a);
  const radius = 24 + r.area * 70 + f.intensity * 10, angle = i / count * Math.PI * 2, arc = Math.sin(travel * Math.PI);
  const along = alongOf(travel), bulge = s.amount * swellProfile(travel);
  let x = a.x + (g.x - a.x) * along + s.dx * bulge, y = a.y + (g.y - a.y) * along + s.dy * bulge;
  if (count > 1) { x += Math.cos(angle) * radius * arc; y += Math.sin(angle) * radius * arc * .8; }
  if (r.trajectory === 'spiral') { x += Math.sin(travel * 14 + i) * radius * .6 * arc; y += Math.cos(travel * 14 + i) * radius * .4 * arc; }
  if (r.trajectory === 'radial') { x += Math.cos(angle) * radius * arc * 1.4; y += Math.sin(angle) * radius * arc; }
  if (r.trajectory === 'orbit') { x += Math.cos(time * 5 + i) * radius * arc; y += Math.sin(time * 5 + i) * radius * arc; }
  if (r.trajectory === 'homing') { x += Math.sin(travel * Math.PI) * radius * (i % 2 ? 1 : -1); y += Math.sin(travel * Math.PI * 2) * radius * .3; }
  return { x, y };
}

/**
 * 光線の幅の推移（画素）。口は術式の範囲の横幅の6割（連弾は本数で分け合う）、騎士のところで今までの太さ（tip）まで絞る。
 * 収束が高いほど早く細くなる（1−u のべきを 1〜3 で変える）。swell はとどめの回の倍率。
 */
export function beamProfile(f: Frame, swell = 1) {
  const r = f.recipe, e = extentOf(f), count = Math.max(1, r.count), focus = .7 + r.concentration * .6;
  const tip = (5 + f.intensity * 3) * focus * swell;
  const mouth = Math.max(tip * 2, e.width * BEAM_MOUTH / count);
  const taper = 1 + r.concentration * 2;
  return { mouth, tip, at: (u: number) => tip + (mouth - tip) * Math.pow(1 - clamp(u), taper) };
}

/** 属性ごとの本体の形。芯は白、縁は属性色の二重で描く。pal で色だけ二色目に替えられる。 */
export function drawBody(f: Frame, x: number, y: number, size: number, element: Element, alpha: number, time: number, index: number, pal: Palette = f.palette) {
  const c = f.c;
  glow(f, x, y, size, alpha * .9, pal.main, pal.core);
  if (element === 'ice') {
    edged(f, 2, alpha, () => { c.moveTo(x, y - size * 1.8); c.lineTo(x + size * .7, y); c.lineTo(x, y + size); c.lineTo(x - size * .7, y); c.closePath(); c.moveTo(x - size * .5, y - size * .9); c.lineTo(x + size * .5, y + size * .3); }, pal.main, pal.core);
  } else if (element === 'lightning') {
    // 描き替えの段は種の側、弾の番号と節の番号は番号の側に分ける。足して同じ組み合わせになる形を避ける。
    const step = Math.floor(time * BOLT_STEPS_PER_SECOND);
    edged(f, 2.5, alpha, () => { c.moveTo(x - size, y - size * 1.8); for (let i = 0; i < BOLT_JOINTS; i++) c.lineTo(x + (noise(i + index * BOLT_INDEX_SPAN, step) - .5) * size * 1.6, y - size * 1.5 + i * size * .6); }, pal.main, pal.core);
  } else if (element === 'wind') {
    edged(f, 2, alpha, () => { for (let i = 0; i < 3; i++) { c.moveTo(x - size * 1.2, y + i * 5 - 5); c.quadraticCurveTo(x + Math.sin(time * 9 + i) * size * .4, y - size - i * 5, x + size * 1.2, y + i * 5 - 5); } }, pal.main, pal.core);
  } else if (element === 'fire') {
    for (let i = 0; i < 6; i++) glow(f, x + Math.sin(time * 7 + i * 1.7 + index) * size * .6, y - i * size * .5 - Math.abs(Math.sin(time * 5 + i)) * size * .4, size * (.35 - i * .04), alpha * (1 - i / 7), pal.main, pal.core);
  } else if (element === 'dark') {
    // 闇だけは明るくせず、暗い穴を先に描いてから縁を光らせる。
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = alpha; c.fillStyle = pal.edge;
    c.beginPath(); c.arc(x, y, size * .6, 0, Math.PI * 2); c.fill();
    c.globalCompositeOperation = 'lighter';
    edged(f, 3, alpha, () => c.arc(x, y, size * .6, 0, Math.PI * 2), pal.main, pal.core);
    for (let i = 0; i < 4; i++) { const a = time * 3 + i * 1.57; glow(f, x + Math.cos(a) * size * .8, y + Math.sin(a) * size * .5, size * .25, alpha * .6, pal.main, pal.core); }
  } else if (element === 'light') {
    edged(f, 2, alpha, () => c.arc(x, y, size * .7, 0, Math.PI * 2), pal.main, pal.core);
    c.lineWidth = 1.2; c.strokeStyle = pal.core; c.globalAlpha = alpha; c.beginPath();
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4 + time * .8; c.moveTo(x - Math.cos(a) * size * 2, y - Math.sin(a) * size * 2); c.lineTo(x + Math.cos(a) * size * 2, y + Math.sin(a) * size * 2); }
    c.stroke();
  } else edged(f, 2, alpha, () => c.arc(x, y, size * .7, 0, Math.PI * 2), pal.main, pal.core);
}

/**
 * 放出（22秒）。閃光、衝撃波の輪、放射状の線、飛び出す粒。
 * 連弾は出どころ（光点）ごとに小さめに出す。粒は全部で同じ数を出どころで分け合い、粒の上限を超えない。
 */
export function drawRelease(f: Frame) {
  const { c, t, origin: o, target: g, preset, intensity, recipe: r } = f;
  const time = t - f.beat.release;
  if (time < 0) return;
  const violent = r.purpose === 'attack', mix = mixOf(f), pal0 = mix.pal;
  // 二属性の連弾は左右で色を分けるので、交互の二色目は使わない。単発は今までどおり交互。
  const sided = !!f.accent && r.count >= 2, alt = sided ? null : mix.alt;
  const launches = launchesOf(f);
  // 出どころが増えるほど一つずつの破裂は小さくする。2つで8割、4つで6割、12で3.5割。
  const shrink = launches.length > 1 ? clamp(1.2 / Math.sqrt(launches.length), .35, .8) : 1;
  const total = Math.round(few(f, increase(preset.impactParticles, intensity, .7) * .35)), each = Math.round(total / launches.length);
  launches.forEach((a, j) => {
    const pal = bulletPalette(f, a);
    // 鍵は出どころごとに分ける。同じコマで全部の出どころから一度ずつ出る。
    f.once('release-' + j, () => {
      const dirX = g.x - a.x, dirY = g.y - a.y, d = Math.hypot(dirX, dirY) || 1;
      for (let i = 0; i < each; i++) {
        const spread = (f.pool.random() - .5) * 2.2, speed = (120 + f.pool.random() * 420 * (1 + intensity * .3)) * (shrink < 1 ? .5 + shrink * .5 : 1);
        const ax = dirX / d * Math.cos(spread) - dirY / d * Math.sin(spread), ay = dirX / d * Math.sin(spread) + dirY / d * Math.cos(spread);
        // 持続型は粒の半分を二色目に、増幅型は白い閃光の粒に、爆発型は中間色にする。左右で分けた連弾はその側の色。
        const p = alt && i % 2 ? alt : mix.mid ? { ...pal, spark: mix.mid } : pal;
        f.pool.spawn({ x: a.x, y: a.y, vx: ax * speed, vy: ay * speed, life: .4 + f.pool.random() * .7, size: 1 + f.pool.random() * 2.2, drag: .12, color: p.spark, core: p.core, kind: f.pool.random() < .5 ? 1 : 0 });
      }
    });
    if (time >= 1.2) return;
    glow(f, a.x, a.y, (26 + intensity * 12) * shrink * Math.max(0, 1 - time / .7), Math.max(0, 1 - time / .7) * mix.boost, pal.main, pal.core);
    // 衝撃波の輪。時間差で広がり、床に沿った平たい形にする。
    const rings = Math.round(increase(preset.releaseRings, intensity, .3));
    for (let i = 0; i < rings; i++) {
      const u = clamp((time - i * .07) / .55); if (u <= 0 || u >= 1) continue;
      const size = ease(u) * (80 + intensity * 40 + i * 12) * shrink;
      // 一つおきの輪は、二色目があればその色、なければ白い芯の色で描く。
      c.globalAlpha = (1 - u) * .7; c.lineWidth = 3 - u * 2; c.strokeStyle = i % 2 ? (alt ? alt.main : pal.core) : pal.main;
      c.beginPath(); c.ellipse(a.x, a.y, size, size * .42, 0, 0, Math.PI * 2); c.stroke();
    }
    // 放射状の線。長さは決まった乱数で、すぐ消える。出どころが多いほど本数も減らす。
    const lines = Math.round(increase(preset.radialLines, intensity, .5) * shrink), lu = clamp(time / .32);
    if (lines && lu < 1) {
      // 持続型は一本おきに二色目、爆発型は中間色にする。色ごとに一度ずつ引く。
      const step = alt ? 2 : 1;
      for (let pass = 0; pass < step; pass++) {
        c.globalAlpha = (1 - lu) * .8; c.lineWidth = 1.3; c.strokeStyle = pass && alt ? alt.main : (mix.mid ?? pal.core); c.beginPath();
        for (let i = pass; i < lines; i += step) { const ang = i / lines * Math.PI * 2 + noise(i, 1) * .2, from = (18 + lu * 60) * shrink, len = (40 + noise(i, 2) * 90) * (1 + intensity * .4) * lu * shrink; c.moveTo(a.x + Math.cos(ang) * from, a.y + Math.sin(ang) * from * .6); c.lineTo(a.x + Math.cos(ang) * (from + len), a.y + Math.sin(ang) * (from + len) * .6); }
        c.stroke();
      }
    }
  });
  // 奥へ小さくなる輪で、術式から出た向きを見せる。これだけは中心から一組。
  if (time < 1.2 && violent) for (let i = 0; i < 3; i++) {
    const depth = .12 + i * .2, size = (55 - i * 13) * Math.min(1, time * 5);
    // 一つおきの輪は、二色目か中間色があればその色にする。
    c.globalAlpha = (1 - clamp((time - .8) / .5)) * (.4 - i * .07); c.lineWidth = 1.2; c.strokeStyle = i % 2 ? (mix.alt ? mix.alt.main : (mix.mid ?? pal0.main)) : pal0.main;
    c.beginPath(); c.ellipse(o.x + (g.x - o.x) * depth, o.y + (g.y - o.y) * depth, size, size * .38, -.25, 0, Math.PI * 2); c.stroke();
  }
}

/**
 * 光線一本。出どころ a から騎士へ、口の広い台形で伸びる。にじみ、縁、本体、白い芯の順に重ね、粒が帯に沿って流れる。
 * pal は本体の色、edgeColor は縁の色。
 */
function drawBeam(f: Frame, i: number, a: XY, pal: Palette, edgeColor: string, time: number, fade: number, swell: number, boost: number) {
  const { c, target: g, intensity } = f;
  const prof = beamProfile(f, swell), pulse = 1 + Math.sin(time * 30) * .12, grow = clamp(time / .25);
  const fx = g.x - a.x, fy = g.y - a.y, len = Math.hypot(fx, fy) || 1, nx = -fy / len, ny = fx / len;
  const widthAt = (u: number) => prof.at(u) * pulse;
  const end = { x: a.x + fx * grow, y: a.y + fy * grow };
  /** 台形の面。scale は層ごとの太さの倍率。伸びている途中（grow < 1）は先端までで切る。 */
  const band = (scale: number, alpha: number, color: string) => {
    c.globalAlpha = alpha; c.fillStyle = color; c.beginPath();
    for (let k = 0; k <= BEAM_SEGMENTS; k++) { const u = k / BEAM_SEGMENTS * grow, hw = widthAt(u) * scale / 2, x = a.x + fx * u, y = a.y + fy * u; if (k) c.lineTo(x + nx * hw, y + ny * hw); else c.moveTo(x + nx * hw, y + ny * hw); }
    for (let k = BEAM_SEGMENTS; k >= 0; k--) { const u = k / BEAM_SEGMENTS * grow, hw = widthAt(u) * scale / 2, x = a.x + fx * u, y = a.y + fy * u; c.lineTo(x - nx * hw, y - ny * hw); }
    c.closePath(); c.fill();
  };
  // 今までの線と同じ太さの倍率と濃さ。にじみと縁は二色目、本体は主属性、芯は白。
  band(2.6, fade * .28, edgeColor); band(1.5, fade * .55, edgeColor);
  band(2.1, fade * .95 * .3, pal.main); band(1, fade * .95, pal.main); band(.34, fade * .95, pal.core);
  // 口の光。台形の幅に合わせる。
  glow(f, a.x, a.y, prof.mouth * .25, fade * .5 * boost, pal.main, pal.core);
  // 粒の番号は番号の側、弾の番号は種の側に置く。足し合わせて同じ組になると、弾どうしで粒の流れが重なる。台形の幅に合わせて散らす。
  for (let k = 0; k < Math.round(increase(BEAM_PARTICLES, intensity)); k++) {
    const u = (f.t * 2.5 + noise(k, BEAM_FLOW_SEED + i)) % 1, off = (noise(k, 4) - .5) * widthAt(u * grow) * 1.2;
    glow(f, a.x + fx * u * grow + nx * off, a.y + fy * u * grow + ny * off, 2, fade * .8, pal.main, pal.core);
  }
  glow(f, end.x, end.y, 9 + intensity * 3, fade * .9 * boost, pal.main, pal.core);
}

/**
 * 面（壁、結界、波）と強化の帯。描いた形のまま、まっすぐ騎士へ進む。膨らみは球と連弾だけ。
 * 壁は表示している点列の輪郭そのもの（点が無ければ四角）、結界は範囲に外接する楕円、波は範囲の横幅いっぱいの帯。
 * 面の中を流れる格子と粒はそのまま。
 */
function drawFace(f: Frame, travel: number, time: number, fade: number, radius: number, pal0: Palette) {
  const { c, t, origin: o, target: g, recipe: r, intensity } = f, e = extentOf(f);
  const u = clamp(travel), p = { x: o.x + (g.x - o.x) * u, y: o.y + (g.y - o.y) * u };
  const depth = 1 - u * FACE_DEPTH, pulse = 1 + Math.sin(time * 6) * .04, scale = depth * pulse;
  // 結界は楕円、波は帯、壁は輪郭（攻撃などの壁だけ）、残り（強化）は今までどおり中心の帯。
  const dome = r.form === 'dome', wave = r.form === 'wave', wall = r.form === 'wall' && r.purpose !== 'enhance', outline = wall && f.points.length > 0, band = !dome && !wave && !wall;
  // 面の置き場。描いた範囲の中心を、術式の中心が進んだ分だけずらす。強化の帯だけは中心そのもの。
  const cx = (band ? o.x : e.x + e.width / 2) + p.x - o.x, cy = (band ? o.y : e.y + e.height / 2) + p.y - o.y;
  let hw: number, hh: number;
  if (dome) { hw = Math.max(e.width / 2 * DOME_FIT, radius) * scale; hh = Math.max(e.height / 2 * DOME_FIT, radius * .72) * scale; }
  else if (wave) { hw = Math.max(e.width / 2, radius * 1.5) * scale; hh = Math.max(radius * .5, hw * .2) * scale; }
  else if (wall) { hw = Math.max(e.width / 2, outline ? 1 : radius * 1.5) * scale; hh = Math.max(e.height / 2, outline ? 1 : radius) * scale; }
  else { const size = radius * (1.5 - u * .4) * (1 + intensity * .15); hw = size; hh = size * .35; }
  /** 面の道筋。塗り、縁、格子の切り抜きで同じ道を使う。 */
  const path = () => {
    c.beginPath();
    if (outline) {
      const ox = e.x + e.width / 2, oy = e.y + e.height / 2;
      f.points.forEach((q, k) => { const x = cx + (q.x * f.w - ox) * scale, y = cy + (q.y * f.h - oy) * scale; if (k) c.lineTo(x, y); else c.moveTo(x, y); });
      c.closePath();
    } else if (dome) c.ellipse(cx, cy, hw, hh, 0, 0, Math.PI * 2);
    else if (wave || band) { c.moveTo(cx - hw, cy); c.quadraticCurveTo(cx, cy - hh, cx + hw, cy); c.quadraticCurveTo(cx, cy + hh, cx - hw, cy); }
    else { c.moveTo(cx - hw, cy - hh); c.lineTo(cx + hw, cy - hh * .8); c.lineTo(cx + hw, cy + hh); c.lineTo(cx - hw, cy + hh * .8); c.closePath(); }
  };
  c.globalAlpha = .16 * fade; c.lineWidth = 2 + r.defense * 3; c.fillStyle = pal0.main; c.strokeStyle = pal0.main;
  path(); c.fill(); c.globalAlpha = fade * .4; c.lineWidth = (2 + r.defense * 3) * 2.2; c.stroke();
  c.globalAlpha = fade; c.lineWidth = 2 + r.defense * 3; c.stroke();
  // 面の縁の内側に、細い白い芯を重ねる。
  c.globalAlpha = fade * .9; c.lineWidth = Math.max(1, (2 + r.defense * 3) * .38); c.strokeStyle = pal0.core; c.stroke(); c.strokeStyle = pal0.main;
  // 面の中を流れる格子。描いた輪郭の壁は、輪郭の中だけに切り抜く。
  if (!wave) {
    if (outline) { c.save(); path(); c.clip(); }
    c.globalAlpha = fade * .35; c.lineWidth = 1; c.beginPath();
    for (let i = -3; i <= 3; i++) { const v = ((time * .3 + i / 7) % 1) * 2 - 1; c.moveTo(cx - hw, cy + v * hh); c.lineTo(cx + hw, cy + v * hh * (wall ? .9 : 1)); }
    c.stroke();
    if (outline) c.restore();
  }
  for (let i = 0; i < Math.round(increase(SURFACE_PARTICLES, intensity)); i++) { const v = (t * .5 + noise(i)) % 1; glow(f, cx + (noise(i, 2) - .5) * hw * 1.8, cy + hh - v * hh * 2, 1.6, fade * Math.sin(v * Math.PI) * .7); }
  glow(f, cx, cy, 15 + intensity * 5, fade * .25);
  if (travel < 1) line(f, o, p, 2, .3);
}

/**
 * 飛翔（22〜23.5秒）と持続する本体。球は尾を引き、光線は帯、壁と結界は面、拘束は輪。
 * boost はとどめの回だけ渡す。道のりの進み具合（travel）を差し替え、本体を size 倍にする。
 */
export function drawTravel(f: Frame, boost?: { travel: number; size: number }) {
  const { c, t, origin: o, target: g, preset, intensity, recipe: r } = f;
  const time = t - f.beat.release, ARRIVAL = arrivalOf(f);
  if (time < 0 || time > 7) return;
  // 頭打ちにしない。弾ごとの遅れを引いた後に bodyPoint が0〜1へ丸めるので、遅れて届く弾も騎士まで進む。
  const travel = boost ? boost.travel : time / ARRIVAL, swell = boost ? boost.size : 1;
  const fade = (1 - clamp((time - 3.2 - r.duration) / 2.8)) * (1 - clamp((time - 4) / 2));
  if (fade <= 0) return;
  const radius = 24 + r.area * 70 + intensity * 10, mix = mixOf(f), pal0 = mix.pal;
  c.strokeStyle = pal0.main; c.fillStyle = pal0.main;
  if (r.purpose === 'bind' && r.count === 1) {
    c.globalAlpha = fade; c.lineWidth = 3;
    for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(g.x, g.y + 22 * i - 30, (25 + radius * .4) * ease(time) , 9, Math.sin(time * 2 + i) * .25, 0, Math.PI * 2); c.stroke(); }
    // 縛る線は術式から伸び、届いた後も細く残る。
    line(f, o, { x: o.x + (g.x - o.x) * Math.min(1, time / ARRIVAL), y: o.y + (g.y - o.y) * Math.min(1, time / ARRIVAL) }, 2.5, fade * .6);
    for (let i = 0; i < 6; i++) { const u = (t * 1.4 + i / 6) % 1; glow(f, o.x + (g.x - o.x) * u, o.y + (g.y - o.y) * u, 2.5, fade * (1 - u) * .8); }
    return;
  }
  if (r.form === 'wall' || r.form === 'dome' || r.form === 'wave' || (r.purpose === 'enhance' && r.count === 1)) { drawFace(f, travel, time, fade, radius, pal0); return; }
  const beam = r.form === 'beam', sided = !!f.accent && r.count >= 2;
  for (let i = 0; i < r.count; i++) {
    const a = launchOf(f, i, r.count), right = sided && rightOf(f, a), pal = right ? f.accent! : pal0;
    if (beam) {
      // 光線の縁は合わせ方で色が変わる。左右で色を分けた連弾は、もう片方の側の色を縁にする。芯は白のまま細くはっきり残す。
      const edgeColor = sided ? (right ? pal0 : f.accent!).main : mix.mid ?? (mix.alt ?? pal0).main;
      drawBeam(f, i, a, pal, edgeColor, time, fade, swell, mix.boost);
      continue;
    }
    const p = bodyPoint(f, i, travel, time);
    if (time > ARRIVAL + hitDelay(i, r.count) + .35) continue;
    // 単発の持続型は、尾だけ二色目にする。
    const trailPal = mix.alt && r.count === 1 ? mix.alt : pal;
    // 尾。少し前の位置を並べて、光の帯にする。
    const steps = 9, span = preset.trail * (1 + intensity * .4);
    for (let k = steps; k >= 1; k--) {
      const back = travel - (k / steps) * (span / ARRIVAL); if (back <= 0) continue;
      const q = bodyPoint(f, i, back, time - (k / steps) * span), u = 1 - k / steps;
      glow(f, q.x, q.y, (r.count > 1 ? 5 : 14) * swell * (0.3 + u * .7), fade * u * .6, trailPal.main, trailPal.core);
    }
    drawBody(f, p.x, p.y, (r.count > 1 ? 6 : 20) * swell * (1 + intensity * .12), r.element, fade, time, i, pal);
    if (travel < 1 && r.count === 1) line(f, a, p, 2, fade * .25);
  }
}
