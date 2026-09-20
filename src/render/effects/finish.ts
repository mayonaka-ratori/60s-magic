import { clamp } from '../../game/motion';
import { FINISH_HIT_OFFSETS_MS, type Beat } from '../../game/rounds';
import { increase } from './presets';
import { few, glow, noise, ease, smooth, type Frame, type XY } from './frame';

/**
 * とどめの回だけの見せ方。設計「とどめと結果_詳細設計」の4章にあたる。
 * ほかの回からは呼ばない。時刻はすべて世界の時刻（Frame の t）で、回の表からの相対で書く。
 */

/** 術式が視界を通り抜ける見せ方（4.1）。発動からの秒で使う。 */
export const FINISH_PASS = {
  /** 通り抜けきるまでの長さ（秒） */ seconds: .25,
  /** 速く広がる前半の長さ（秒） */ fast: .1,
  /** 前半で届く倍率 */ fastScale: 6,
  /** 広がりきる倍率 */ scale: 8,
  /** 控えめモードの広がりきる倍率 */ calmScale: 4,
  /** 濃さ1.0のまま保つ長さ（秒） */ hold: .06,
};

/** 道筋に並べる術式の輪（4.2）。 */
export const FINISH_RING = {
  /** 並べる枚数 */ count: 5,
  /** 手前の輪の大きさ（画面の高さに対する割合） */ near: .42,
  /** 奥の輪の大きさ（同じ） */ far: .08,
  /** 手前の輪を置く道のりの割合 */ nearDepth: .12,
  /** 奥の輪を置く道のりの割合 */ farDepth: .92,
  /** くぐるたびに本体が太くなる倍率 */ grow: 1.15,
  /** くぐるたびに速くなる倍率 */ speedUp: 1.1,
  /** くぐった輪が強く光る長さ（秒） */ lit: .12,
  /** 輪を出し始める、発動からの秒 */ from: .3,
  /** 輪を消す、最初の到達より前の秒 */ until: .1,
};

/** 描く値だけを止める間（6）。世界の時計は止めない。 */
export const FINISH_HOLD = { before: .4, seconds: .32 };

/** とどめの一撃（4.4）。一撃からの秒で使う。 */
export const FINISH_BLOW = {
  /** 白→属性色→白の三段の長さ（秒） */ flash: .15,
  /** 衝撃波の輪の枚数 */ rings: 3,
  /** 輪が広がりきるまで（秒） */ ringSeconds: .7,
};

/** 余韻（5）。とどめの一撃と余韻の始まりからの秒で使う。 */
export const FINISH_SETTLE = {
  /** 術式の光が抜けきるまで（秒）。世界の時刻で59.25秒に終わる長さ */ seconds: 2.25,
  /** 倒れた衝撃で床の塵が立つ、一撃からの秒 */ dustFrom: 1.7,
  /** 塵が広がりきる、一撃からの秒 */ dustTo: 2.4,
};

/** 引き継いだ光点（6章）。 */
export const FINISH_INHERITED = { max: 6, gather: 4, reach: .22 };

/** 当たる4回の時刻（秒）。最初の到達からのずれ。 */
export const FINISH_HIT_OFFSETS = FINISH_HIT_OFFSETS_MS.map(ms => ms / 1000);
/** その回の、当たる4回の時刻（秒）。 */
export const finishHitTimes = (beat: Beat) => FINISH_HIT_OFFSETS.map(offset => beat.impact + offset);

/**
 * 術式が通り抜けるときの拡大と濃さ。time は発動からの秒。
 * 速く始めて遅く終わる。濃さは少し保ってから0へ抜ける。時間の外では null。
 */
export function passThrough(time: number, calm = false) {
  if (time < 0 || time >= FINISH_PASS.seconds) return null;
  const top = calm ? FINISH_PASS.calmScale : FINISH_PASS.scale;
  // 控えめモードでも「速く始めて遅く終わる」割合は同じにする。
  const mid = 1 + (top - 1) * ((FINISH_PASS.fastScale - 1) / (FINISH_PASS.scale - 1));
  const scale = time < FINISH_PASS.fast
    ? 1 + (mid - 1) * ease(time / FINISH_PASS.fast)
    : mid + (top - mid) * ((time - FINISH_PASS.fast) / (FINISH_PASS.seconds - FINISH_PASS.fast));
  const alpha = time < FINISH_PASS.hold ? 1 : 1 - (time - FINISH_PASS.hold) / (FINISH_PASS.seconds - FINISH_PASS.hold);
  return { scale, alpha: clamp(alpha) };
}

/**
 * 輪 i 枚目の置き場。奥ほど小さく、奥ほど詰めて置く。
 * depth は術式から騎士までの道のりの割合、radius は画面の高さに対する割合。
 */
export function ringLayout(i: number, count = FINISH_RING.count) {
  const u = count <= 1 ? 0 : i / (count - 1);
  const depth = FINISH_RING.nearDepth + (FINISH_RING.farDepth - FINISH_RING.nearDepth) * (1 - (1 - u) * (1 - u));
  const radius = FINISH_RING.near * Math.pow(FINISH_RING.far / FINISH_RING.near, u);
  return { depth, radius };
}

/** 輪の間で、速さが何倍になるかの区切り。0〜1の道のりを輪で切った並び。 */
function ringEdges(count: number) {
  const edges = [0];
  for (let i = 0; i < count; i++) edges.push(ringLayout(i, count).depth);
  edges.push(1);
  return edges;
}

/**
 * くぐるたびに速くなる進み方。u は飛翔の割合（0〜1）。
 * travel は道のりの割合、scale は本体の太さの倍率、passed はくぐった枚数。
 */
export function finishTravel(u: number, count = FINISH_RING.count) {
  const edges = ringEdges(count), spans: number[] = [];
  let total = 0;
  for (let k = 0; k < edges.length - 1; k++) {
    const span = (edges[k + 1] - edges[k]) / Math.pow(FINISH_RING.speedUp, k);
    spans.push(span); total += span;
  }
  let left = clamp(u) * total, travel = 1, passed = spans.length - 1;
  for (let k = 0; k < spans.length; k++) {
    if (left < spans[k] || k === spans.length - 1) {
      travel = edges[k] + (edges[k + 1] - edges[k]) * clamp(spans[k] > 0 ? left / spans[k] : 1);
      passed = k; break;
    }
    left -= spans[k];
  }
  return { travel: clamp(travel), scale: Math.pow(FINISH_RING.grow, Math.min(passed, count)), passed: Math.min(passed, count) };
}

/** 輪をくぐる時刻（飛翔の割合）。i 枚目をくぐる u を返す。 */
export function ringPassAt(i: number, count = FINISH_RING.count) {
  const edges = ringEdges(count);
  let total = 0, until = 0;
  for (let k = 0; k < edges.length - 1; k++) {
    const span = (edges[k + 1] - edges[k]) / Math.pow(FINISH_RING.speedUp, k);
    total += span;
    if (k <= i) until += span;
  }
  return until / total;
}

/**
 * 本人の弾の数を、当たる4回へ散らす。前から1発ずつ置き、余った分をまた前から足す。
 * 1発なら1回目だけ、5発なら1回目が2発、あとは1発ずつになる。
 */
export function finishHitPlan(count: number) {
  const slots = FINISH_HIT_OFFSETS.length, plan = new Array<number>(slots).fill(0);
  const bullets = Math.max(1, Math.round(count));
  for (let i = 0; i < Math.min(bullets, slots); i++) plan[i] = 1;
  for (let i = 0, extra = bullets - slots; extra > 0; i++, extra--) plan[i % slots]++;
  return plan;
}

/** 描く値だけを止める間。止めている間は固定する時刻、外は null。t は実際の時刻でも世界の時刻でもよい。 */
export function holdTime(t: number, beat: Beat) {
  if (!beat.finish) return null;
  const from = beat.release - FINISH_HOLD.before;
  return t >= from && t < from + FINISH_HOLD.seconds ? from : null;
}

/** 余韻で術式に残る濃さ。te は世界の時刻。余韻の始まりから抜けていく。 */
export function settleFade(te: number, beat: Beat) {
  if (te < beat.handoff) return 1;
  return clamp(1 - (te - beat.handoff) / FINISH_SETTLE.seconds);
}

/**
 * 引き継いだ光点の位置と薄さ。time は回の始まりからの秒。
 * 視界の左右の端から中央へ寄り、術式のまわりをゆっくり回る。
 */
export function inheritedSpot(i: number, total: number, time: number, w: number, h: number, origin: XY) {
  const count = Math.max(1, Math.min(total, FINISH_INHERITED.max));
  const near = smooth(clamp(time / FINISH_INHERITED.gather));
  const side = i % 2 ? 1 : -1, row = Math.floor(i / 2);
  const from = { x: side < 0 ? -w * .06 : w * 1.06, y: h * (.28 + row * .2) };
  const angle = (i / count) * Math.PI * 2 + time * .3, reach = Math.min(w, h) * FINISH_INHERITED.reach;
  const to = { x: origin.x + Math.cos(angle) * reach, y: origin.y + Math.sin(angle) * reach * .6 };
  return { x: from.x + (to.x - from.x) * near, y: from.y + (to.y - from.y) * near, alpha: .16 + near * .18 };
}

/** 飛翔の部品へ渡す倍率。輪をくぐるたびに太く速くなる。 */
export function finishBoost(f: Frame) {
  const flight = f.beat.impact - f.beat.release;
  const step = finishTravel(flight > 0 ? (f.t - f.beat.release) / flight : 1);
  return { travel: step.travel, size: step.scale };
}

/** 術式の線をたどる道を組み立てる。倍率 scale で中心から広げる。 */
function spellPath(f: Frame, center: XY, scale: number) {
  const c = f.c;
  c.beginPath();
  let stroke = -1;
  for (const p of f.points) {
    const x = center.x + (p.x * f.w - center.x) * scale, y = center.y + (p.y * f.h - center.y) * scale;
    if (p.stroke !== stroke) { c.moveTo(x, y); stroke = p.stroke; } else c.lineTo(x, y);
  }
}

/** 4.1 術式が視界を通り抜ける。完成した形を中心から一気に広げ、画面の外へ抜く。 */
function drawPassThrough(f: Frame) {
  const pass = passThrough(f.t - f.beat.release, f.calm);
  if (!pass || f.points.length < 2) return;
  const c = f.c, width = 3 + f.intensity * 1.2;
  spellPath(f, f.origin, pass.scale);
  c.globalAlpha = pass.alpha * .3; c.lineWidth = width * 3; c.strokeStyle = f.palette.main; c.stroke();
  c.globalAlpha = pass.alpha * .85; c.lineWidth = width; c.strokeStyle = f.palette.main; c.stroke();
  c.globalAlpha = pass.alpha; c.lineWidth = Math.max(1, width * .4); c.strokeStyle = f.palette.core; c.stroke();
}

/** 4.2 道筋に並ぶ術式の輪。本体がくぐると光り、火花が外へ散る。 */
function drawRings(f: Frame) {
  const c = f.c, { origin: o, target: g, beat } = f;
  const time = f.t - beat.release, flight = beat.impact - beat.release;
  if (time < FINISH_RING.from || time > flight - FINISH_RING.until) return;
  const u = flight > 0 ? time / flight : 1;
  const appear = clamp((time - FINISH_RING.from) / .25);
  for (let i = 0; i < FINISH_RING.count; i++) {
    const { depth, radius } = ringLayout(i), at = ringPassAt(i);
    const x = o.x + (g.x - o.x) * depth, y = o.y + (g.y - o.y) * depth, rx = radius * f.h;
    // くぐった直後だけ強く光る。
    const lit = u >= at ? Math.max(0, 1 - (u - at) * flight / FINISH_RING.lit) : 0;
    const base = (.22 + lit * .7) * appear;
    c.globalAlpha = base * .5; c.lineWidth = 2 + lit * 3; c.strokeStyle = f.palette.main;
    c.beginPath(); c.ellipse(x, y, rx, rx * .5, 0, 0, Math.PI * 2); c.stroke();
    c.globalAlpha = base; c.lineWidth = Math.max(1, 1 + lit * 2); c.strokeStyle = lit > .2 ? f.palette.core : f.palette.main;
    c.beginPath(); c.ellipse(x, y, rx * .86, rx * .43, 0, 0, Math.PI * 2); c.stroke();
    // 外周の目盛り。術式の輪らしさを出す。
    c.globalAlpha = base * .6; c.lineWidth = 1.2; c.beginPath();
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2 + f.t * .4 * (i % 2 ? -1 : 1), len = k % 4 ? .06 : .13;
      c.moveTo(x + Math.cos(a) * rx, y + Math.sin(a) * rx * .5);
      c.lineTo(x + Math.cos(a) * rx * (1 + len), y + Math.sin(a) * rx * (1 + len) * .5);
    }
    c.stroke();
    if (u >= at) f.once('finish-ring-' + i, () => {
      const n = Math.round(few(f, increase(10, f.intensity, .5)));
      for (let k = 0; k < n; k++) {
        const a = f.pool.random() * Math.PI * 2, speed = (60 + f.pool.random() * 180) * (1 + radius);
        f.pool.spawn({ x: x + Math.cos(a) * rx, y: y + Math.sin(a) * rx * .5, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed * .5,
          life: .3 + f.pool.random() * .4, size: 1 + f.pool.random() * 1.6, drag: .2, color: f.palette.spark, core: f.palette.core, kind: 1 });
      }
    });
  }
}

/** 当たったとき、火の粉と破片を手前へ飛ばす。下向きに強く、画面の外へ抜けるまで大きくする。 */
function spawnForward(f: Frame, bullets: number) {
  const g = f.target;
  const n = Math.round(few(f, increase(f.preset.impactParticles, f.intensity, .5) * .5 * Math.max(1, bullets)));
  for (let i = 0; i < n; i++) {
    const spread = (f.pool.random() - .5) * 2.4, speed = 180 + f.pool.random() * 520 * (1 + f.intensity * .3);
    const shard = f.pool.random() < .4;
    f.pool.spawn({
      x: g.x + (f.pool.random() - .5) * 24, y: g.y + (f.pool.random() - .5) * 20,
      vx: Math.sin(spread) * speed * .8, vy: Math.abs(Math.cos(spread)) * speed * .9 + 120,
      life: .7 + f.pool.random() * .8, size: (shard ? 2 : 1.4) + f.pool.random() * 3.2, gravity: 180, drag: .5,
      color: shard ? f.palette.main : f.palette.spark, core: f.palette.core, kind: shard ? 2 : 1,
    });
  }
}

/** 4.3 多段命中。当たる時刻は固定の4回。1回目の全画面の白は画面の効果が受け持つ。 */
function drawHits(f: Frame) {
  const times = finishHitTimes(f.beat), plan = finishHitPlan(f.recipe.count), g = f.target;
  for (let j = 0; j < times.length; j++) {
    const since = f.t - times[j];
    if (since < 0) continue;
    f.once('finish-hit-' + j, () => spawnForward(f, plan[j]));
    // 2回目から後は、全画面ではなく命中点の白だけにする。
    if (j > 0 && since < .14) {
      const left = 1 - since / .14;
      glow(f, g.x, g.y, (22 + f.intensity * 10) * left + 6, left * .85, '#ffffff', '#ffffff');
    }
  }
}

/** 4.4 とどめの一撃。騎士の上だけの三段の光と、手前へ広がる衝撃波の輪。 */
function drawBlow(f: Frame) {
  const blow = f.beat.finalBlow;
  if (blow === null) return;
  const since = f.t - blow;
  if (since < 0) return;
  const c = f.c, g = f.target;
  // 白→属性色→白の三段。全画面には出さない。
  if (since < FINISH_BLOW.flash) {
    const step = Math.min(2, Math.floor(since / (FINISH_BLOW.flash / 3)));
    const color = step === 1 ? f.palette.main : '#ffffff';
    const left = 1 - (since % (FINISH_BLOW.flash / 3)) / (FINISH_BLOW.flash / 3);
    glow(f, g.x, g.y, (46 + f.intensity * 16) * (.7 + left * .3), .9, color, '#ffffff');
  }
  // 衝撃波の輪。核の位置から手前へ向かって広がる。
  for (let i = 0; i < FINISH_BLOW.rings; i++) {
    const u = clamp((since - i * .09) / FINISH_BLOW.ringSeconds);
    if (u <= 0 || u >= 1) continue;
    const grow = ease(u), size = grow * f.w * (.6 + i * .18), y = g.y + grow * (f.h - g.y) * .55;
    c.globalAlpha = (1 - u) * .7; c.lineWidth = 5 - u * 4; c.strokeStyle = i % 2 ? f.palette.core : f.palette.main;
    c.beginPath(); c.ellipse(g.x, y, Math.max(1, size), Math.max(1, size * .3), 0, 0, Math.PI * 2); c.stroke();
  }
  f.once('finish-blow', () => spawnForward(f, 3));
}

/** 5 余韻。倒れた衝撃の塵と、目の前に残る自分の術式。 */
function drawSettle(f: Frame) {
  const blow = f.beat.finalBlow;
  if (blow === null) return;
  const c = f.c;
  // 倒れた衝撃で、床の塵が手前へ広がる。
  if (f.t >= blow + FINISH_SETTLE.dustFrom) f.once('finish-dust', () => {
    const n = Math.round(few(f, increase(26, f.intensity, .4))), floor = f.h * .86;
    for (let i = 0; i < n; i++) {
      const side = f.pool.random() < .5 ? -1 : 1, speed = 60 + f.pool.random() * 220;
      f.pool.spawn({ x: f.target.x + (f.pool.random() - .5) * f.w * .3, y: floor + f.pool.random() * 20,
        vx: side * speed, vy: 30 + f.pool.random() * 90, life: 1.4 + f.pool.random() * 1.2,
        size: 14 + f.pool.random() * 26, gravity: -6, drag: .55, color: '#2a2621', core: '#2a2621', kind: 3 });
    }
  });
  // 自分の術式だけが目の前に残り、ゆっくり光が抜ける。
  const fade = settleFade(f.t, f.beat);
  if (f.t >= f.beat.handoff && fade > 0 && f.points.length > 1) {
    const width = 2.4 + f.intensity * .6;
    spellPath(f, f.origin, 1);
    c.globalAlpha = fade * .22; c.lineWidth = width * 2.6; c.strokeStyle = f.palette.main; c.stroke();
    c.globalAlpha = fade * .6; c.lineWidth = width; c.strokeStyle = f.palette.main; c.stroke();
    c.globalAlpha = fade * .5; c.lineWidth = Math.max(1, width * .4); c.strokeStyle = f.palette.core; c.stroke();
  }
}

/** 6章 引き継いだ光点。視界の端から寄ってきて、術式のまわりを回る。 */
function drawInherited(f: Frame) {
  if (!f.inherited.length || f.t < f.beat.start || f.t >= f.beat.release) return;
  const time = f.t - f.beat.start, count = Math.min(f.inherited.length, FINISH_INHERITED.max);
  for (let i = 0; i < count; i++) {
    const spot = inheritedSpot(i, count, time, f.w, f.h, f.origin);
    glow(f, spot.x, spot.y, 2.2 + noise(i, 31) * .8, spot.alpha);
  }
}

/** とどめの回の見せ方をまとめて描く。呼ぶ側（magic.ts）は save と restore で挟む。 */
export function drawFinish(f: Frame) {
  if (!f.beat.finish) return;
  f.c.globalCompositeOperation = 'lighter';
  drawInherited(f);
  if (f.t < f.beat.release) return;
  drawPassThrough(f);
  drawRings(f);
  drawHits(f);
  drawBlow(f);
  drawSettle(f);
}
