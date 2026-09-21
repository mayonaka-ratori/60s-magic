import { clamp } from '../../game/motion';
import { FINAL_BLOW_MS, FINISH_FALL_FROM_MS, FINISH_HIT_OFFSETS_MS, ROUNDS, type Beat } from '../../game/rounds';
import { increase } from './presets';
import { edged, few, glow, line, noise, ease, smooth, type Frame, type XY } from './frame';

/**
 * とどめの回だけの見せ方。設計「とどめと結果_詳細設計」の4章にあたる。
 * ほかの回からは呼ばない。時刻はすべて世界の時刻（Frame の t）で、回の表からの相対で書く。
 */

/**
 * 術式が視界を通り抜ける見せ方（4.1）。発動からの秒で使う。
 * 広げる倍率は決め打ちにしない。本人の術式の大きさと画面の大きさから、画面の外へ出る倍率を出す。
 * 決め打ちの8倍では、大きく描いた人の術式が0.03秒で画面の外へ出てしまい、見えないため。
 */
export const FINISH_PASS = {
  /** 通り抜けきるまでの長さ（秒） */ seconds: .25,
  /** 画面の外へ出るまでの長さ（秒） */ reach: .2,
  /** 画面の外へ出たあと、さらに広げる倍率 */ overshoot: 1.3,
  /** 広げる倍率の下限。小さく描いた人でもこれだけは広げる */ minScale: 2,
  /** 控えめモードで広げる割合 */ calmShare: .5,
  /** 濃さ1.0のまま保つ長さ（秒） */ hold: .15,
  /** 線の太さの下限（画面の高さに対する割合） */ width: .006,
  /** 広げたぶん線も太くする割合 */ widen: .12,
};

/** 術式の半径（画素）。中心から一番遠い点まで。 */
export function spellRadius(points: Array<{ x: number; y: number }>, w: number, h: number, center: XY) {
  let far = 0;
  for (const p of points) far = Math.max(far, Math.hypot(p.x * w - center.x, p.y * h - center.y));
  return far;
}

/**
 * 術式が画面の外へ出る倍率。術式の外周が画面の対角線の半分を超えたら、外へ出たとみなす。
 * 術式が小さいほど大きく広げることになるが、下限（2倍）は必ず広げる。
 */
export function passExitScale(w: number, h: number, radius: number) {
  const half = Math.hypot(w, h) / 2;
  return Math.max(FINISH_PASS.minScale, radius > 0 ? half / radius : FINISH_PASS.minScale);
}

/**
 * 描いている間の術式の線の太さ（画素）。strokes.ts が線全体を照らすときと同じ値。
 * 通り抜ける術式は、これより細くならないようにする。
 */
export const SPELL_LINE_WIDTH = 2.4;

/** 通り抜ける術式の線の太さ（画素）。今の術式の2倍を下回らず、広げるほど少し太くする。 */
export function passStrokeWidth(h: number, intensity: number, scale: number) {
  const base = Math.max(h * FINISH_PASS.width, SPELL_LINE_WIDTH * 2 + intensity * .6);
  return base * (1 + (scale - 1) * FINISH_PASS.widen);
}

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
  /** 線の太さ（画面の高さに対する割合） */ width: .004,
  /** ふだんの濃さ。くぐった瞬間はここから上がる */ alpha: .8,
  /** 奥行きに見せるための、輪の縦のつぶれ具合 */ flatten: .5,
};

/** 描く値だけを止める間（6）。世界の時計は止めない。 */
export const FINISH_HOLD = { before: .4, seconds: .32 };

/** とどめの一撃（4.4）。一撃からの秒で使う。 */
export const FINISH_BLOW = {
  /** 白→属性色→白の三段の長さ（秒） */ flash: .15,
  /** 衝撃波の輪の枚数 */ rings: 3,
  /** 輪が広がりきるまで（秒） */ ringSeconds: .7,
};

/** とどめの回の一行。余韻の長さも塵の時刻も、この行から作る。 */
const FINISH_ROUND = ROUNDS[2];
/** 余韻（5）。とどめの一撃と余韻の始まりからの秒で使う。どちらも回の表から作る。 */
export const FINISH_SETTLE = {
  /** 術式の光が抜けきるまで（秒）。余韻の始まりから回の終わりまでの長さ。 */
  seconds: (FINISH_ROUND.end - FINISH_ROUND.handoff) / 1000,
  /**
   * 倒れた衝撃で床の塵が立つ、一撃からの秒。騎士が手前へ倒れ始める時刻と同じにする。
   * 崩れる音（collapse-fall）も同じ時刻を見るので、音と塵がそろう。
   */
  dustFrom: (FINISH_FALL_FROM_MS - FINAL_BLOW_MS) / 1000,
};

/** 引き継いだ光点（6章）。 */
export const FINISH_INHERITED = { max: 6, gather: 4, reach: .22 };

/** 当たる4回の時刻（秒）。最初の到達からのずれ。 */
export const FINISH_HIT_OFFSETS = FINISH_HIT_OFFSETS_MS.map(ms => ms / 1000);
/** その回の、当たる4回の時刻（秒）。 */
export const finishHitTimes = (beat: Beat) => FINISH_HIT_OFFSETS.map(offset => beat.impact + offset);

/**
 * 4回の命中へ四方向から走り込む光の筋（4.3に足したもの）。
 * 命中が騎士の胸の一点だけで起きると画面の左右が空くので、左、右、上、正面（中央下）の順に、画面の外から筋を走らせる。
 * 筋は命中の時刻にちょうど届くよう、その0.12秒前から走り、届いた瞬間に来た方向へ火花を返す。
 */
export const FINISH_STREAK = {
  /** 届くまでの長さ（秒）。命中の時刻に届くよう、この秒数だけ前から走らせる */ seconds: .12,
  /** 筋の長さ（道のりに対する割合） */ tail: .22,
  /** 届いたあと、筋の名残が騎士へ吸い込まれて消えるまで（秒） */ linger: .1,
  /** 画面の外から出る位置の、画面の幅と高さに対するはみ出し */ outside: .05,
  /** 届いた瞬間に返す火花の数（派手さで増える） */ sparks: 14,
};
/** 筋の来る方向。命中の順に使う。 */
export const FINISH_STREAK_SIDES = ['left', 'right', 'top', 'front'] as const;
export type StreakSide = typeof FINISH_STREAK_SIDES[number];
/** j 回目の筋の来る方向。 */
export const streakSide = (j: number): StreakSide => FINISH_STREAK_SIDES[j % FINISH_STREAK_SIDES.length];

/** j 回目の筋が出てくる位置（画素）。左右は騎士の高さの少し上、上は騎士の真上、正面は画面の中央下。どれも画面の外から。 */
export function streakStart(j: number, w: number, h: number, target: XY): XY {
  const side = streakSide(j), out = FINISH_STREAK.outside;
  if (side === 'left') return { x: -w * out, y: target.y - h * .06 };
  if (side === 'right') return { x: w * (1 + out), y: target.y - h * .06 };
  if (side === 'top') return { x: target.x, y: -h * out };
  return { x: w / 2, y: h * (1 + out) };
}

/**
 * j 回目の筋の、その時刻の頭と尾と濃さ。since は命中からの秒（届く前は負）。
 * 走っている間（-0.12〜0秒）は頭が騎士へ向かって進み、後半ほど速い。届いたあとは名残が0.1秒で騎士へ吸い込まれる。範囲の外は null。
 */
export function streakAt(j: number, since: number, w: number, h: number, target: XY) {
  if (since < -FINISH_STREAK.seconds || since >= FINISH_STREAK.linger) return null;
  const from = streakStart(j, w, h, target);
  const at = (p: number): XY => ({ x: from.x + (target.x - from.x) * p, y: from.y + (target.y - from.y) * p });
  if (since < 0) {
    const u = 1 + since / FINISH_STREAK.seconds, head = u * (.6 + .4 * u);
    return { head: at(head), tail: at(Math.max(0, head - FINISH_STREAK.tail)), alpha: .9, arrived: false };
  }
  const left = 1 - since / FINISH_STREAK.linger;
  return { head: at(1), tail: at(1 - FINISH_STREAK.tail * left), alpha: .9 * left, arrived: true };
}

/**
 * 術式が通り抜けるときの拡大と濃さ。time は発動からの秒。
 * 速く始めて遅く終わる。濃さは少し保ってから0へ抜ける。時間の外では null。
 */
export function passThrough(time: number, exit: number, calm = false) {
  if (time < 0 || time >= FINISH_PASS.seconds) return null;
  const top = calm ? 1 + (exit - 1) * FINISH_PASS.calmShare : exit;
  // 0.20秒かけて画面の外へ出る。最初はゆっくり、後半で速く（二乗の曲線）。
  // 残りの0.05秒は、外へ出たあとをさらに広げながら消す。
  const grown = time < FINISH_PASS.reach
    ? 1 + (top - 1) * Math.pow(time / FINISH_PASS.reach, 2)
    : top * (1 + (FINISH_PASS.overshoot - 1) * ((time - FINISH_PASS.reach) / (FINISH_PASS.seconds - FINISH_PASS.reach)));
  const alpha = time < FINISH_PASS.hold ? 1 : 1 - (time - FINISH_PASS.hold) / (FINISH_PASS.seconds - FINISH_PASS.hold);
  return { scale: grown, alpha: clamp(alpha) };
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
function makeRingEdges(count: number) {
  const edges = [0];
  for (let i = 0; i < count; i++) edges.push(ringLayout(i, count).depth);
  edges.push(1);
  return edges;
}
/** 区切りは枚数だけで決まるので、一度作ったら覚えておく。毎コマ作り直さない。 */
const ringEdgesCache = new Map<number, number[]>();
function ringEdges(count: number) {
  let edges = ringEdgesCache.get(count);
  if (!edges) { edges = makeRingEdges(count); ringEdgesCache.set(count, edges); }
  return edges;
}
/**
 * 輪を全部くぐった後の進む速さ（飛翔の割合1あたりの道のり）。
 * 最後の区間と同じ速さで、騎士のさらに先まで進み続けるために使う。
 */
export function afterRingsSpeed(count = FINISH_RING.count) {
  const edges = ringEdges(count);
  let total = 0;
  for (let k = 0; k < edges.length - 1; k++) total += (edges[k + 1] - edges[k]) / Math.pow(FINISH_RING.speedUp, k);
  return total > 0 ? Math.pow(FINISH_RING.speedUp, edges.length - 2) * total : 1;
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
  // 弾の数が数でないときは1発とみなす。そのままだと全部0になり、当たっても何も出なくなる。
  const bullets = Number.isFinite(count) ? Math.max(1, Math.round(count)) : 1;
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

/**
 * 飛翔の部品へ渡す倍率。輪をくぐるたびに太く速くなる。
 * 輪を全部くぐった後（u が1を超えた後）は1で止めず、最後の区間と同じ速さで進み続ける。
 * 連弾では bodyPoint が弾ごとの遅れを引くので、1で止めると2発目から先が騎士へ届かずに消える。
 */
export function finishBoost(f: Frame) {
  const flight = f.beat.impact - f.beat.release;
  const u = flight > 0 ? (f.t - f.beat.release) / flight : 1;
  const step = finishTravel(u);
  const travel = u > 1 ? step.travel + (u - 1) * afterRingsSpeed() : step.travel;
  return { travel, size: step.scale };
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
  if (f.points.length < 2) return;
  const exit = passExitScale(f.w, f.h, spellRadius(f.points, f.w, f.h, f.origin));
  const pass = passThrough(f.t - f.beat.release, exit, f.calm);
  if (!pass) return;
  const c = f.c, width = passStrokeWidth(f.h, f.intensity, pass.scale);
  // 術式と同じ重ね方。外側のにじみ、属性色の線、白い芯の三枚。広げても細く見えないようにする。
  spellPath(f, f.origin, pass.scale);
  c.globalAlpha = pass.alpha * .4; c.lineWidth = width * 2.6; c.strokeStyle = f.palette.main; c.stroke();
  c.globalAlpha = pass.alpha * .95; c.lineWidth = width; c.strokeStyle = f.palette.main; c.stroke();
  c.globalAlpha = pass.alpha; c.lineWidth = Math.max(1.4, width * .42); c.strokeStyle = f.palette.core; c.stroke();
  // 節の光も一緒に広げる。線だけだと、広げたときに輪郭が弱く見える。
  for (let i = 0; i < f.points.length; i += 5) {
    const p = f.points[i];
    glow(f, f.origin.x + (p.x * f.w - f.origin.x) * pass.scale, f.origin.y + (p.y * f.h - f.origin.y) * pass.scale,
      2.5 + pass.scale * .4, pass.alpha * .5);
  }
}

/** その輪の線の太さ（画素）。画面の高さの0.4%を下回らず、くぐった瞬間は太くする。 */
export function ringStrokeWidth(h: number, lit = 0) {
  return Math.max(h * FINISH_RING.width, 2.5) * (1 + lit * .8);
}

/** 4.2 道筋に並ぶ術式の輪。術式と同じ描き方で、手前から奥まではっきり並べる。 */
function drawRings(f: Frame) {
  const c = f.c, { origin: o, target: g, beat } = f;
  const time = f.t - beat.release, flight = beat.impact - beat.release;
  if (time < FINISH_RING.from || time > flight - FINISH_RING.until) return;
  const u = flight > 0 ? time / flight : 1;
  const appear = clamp((time - FINISH_RING.from) / .18);
  // 奥から手前の順に描く。手前の大きい輪が上に重なる。
  for (let i = FINISH_RING.count - 1; i >= 0; i--) {
    const { depth, radius } = ringLayout(i), at = ringPassAt(i);
    const x = o.x + (g.x - o.x) * depth, y = o.y + (g.y - o.y) * depth;
    const rx = radius * f.h, ry = rx * FINISH_RING.flatten;
    // くぐった直後だけ強く光る。
    const lit = u >= at ? Math.max(0, 1 - (u - at) * flight / FINISH_RING.lit) : 0;
    const alpha = Math.min(1, (FINISH_RING.alpha + lit * .2) * appear);
    const width = ringStrokeWidth(f.h, lit);
    // 術式と同じ三枚重ね。外側のにじみ、属性色の線、白い芯。
    edged(f, width, alpha, () => c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2));
    // 内側の細い輪。二重の輪にして術式らしくする。
    edged(f, Math.max(1.2, width * .5), alpha * .7, () => c.ellipse(x, y, rx * .84, ry * .84, 0, 0, Math.PI * 2));
    // 外周の目盛り。輪ごとに向きを変えてゆっくり回す。
    c.globalAlpha = alpha * .7; c.lineWidth = Math.max(1.2, width * .55); c.strokeStyle = f.palette.main; c.beginPath();
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2 + f.t * .4 * (i % 2 ? -1 : 1), len = k % 4 ? .07 : .15;
      c.moveTo(x + Math.cos(a) * rx, y + Math.sin(a) * ry);
      c.lineTo(x + Math.cos(a) * rx * (1 + len), y + Math.sin(a) * ry * (1 + len));
    }
    c.stroke();
    // くぐった瞬間は、輪そのものが光をまとう。
    if (lit > 0) for (let k = 0; k < 12; k++) {
      const a = k / 12 * Math.PI * 2;
      glow(f, x + Math.cos(a) * rx, y + Math.sin(a) * ry, 3 + radius * 14, lit * .8);
    }
    if (u >= at) f.once('finish-ring-' + i, () => {
      const n = Math.round(few(f, increase(10, f.intensity, .5)));
      for (let k = 0; k < n; k++) {
        const a = f.pool.random() * Math.PI * 2, speed = (60 + f.pool.random() * 180) * (1 + radius);
        f.pool.spawn({ x: x + Math.cos(a) * rx, y: y + Math.sin(a) * ry, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed * .5,
          life: .3 + f.pool.random() * .4, size: 1 + f.pool.random() * 1.6, drag: .2, color: f.palette.spark, core: f.palette.core, kind: 1 });
      }
    });
  }
}

/**
 * 当たったとき、火の粉と破片を手前へ飛ばす。下向きに強く、画面の外へ抜けるまで大きくする。
 * 当たる4回は弾の数によらず必ず起こり、体力も部品もその4回で動く。
 * そのため弾が割り当たらない回（bullets が0）も、1発ぶんの粒は出す。
 */
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

/**
 * 4.3に足した、四方向から走り込む光の筋。命中の時刻に届き、届いた瞬間に来た方向へ火花を返す。
 * 筋は属性の色の縁と白い芯の二重。既存の輪、通り抜け、直撃の見せ方と時刻には触らない。
 */
function drawStreaks(f: Frame) {
  const times = finishHitTimes(f.beat), g = f.target;
  for (let j = 0; j < times.length; j++) {
    const streak = streakAt(j, f.t - times[j], f.w, f.h, g);
    if (!streak) continue;
    const width = 3 + f.intensity * .8;
    line(f, streak.tail, streak.head, width, streak.alpha, f.palette.main, width * .35, f.palette.core);
    glow(f, streak.head.x, streak.head.y, 4 + f.intensity * 1.5, streak.alpha * .8);
    if (streak.arrived) f.once('finish-streak-' + j, () => {
      // 来た方向へ火花を返す。筋の出どころへ向かう角度を中心に、少し散らす。
      const from = streakStart(j, f.w, f.h, g), back = Math.atan2(from.y - g.y, from.x - g.x);
      const n = Math.round(few(f, increase(FINISH_STREAK.sparks, f.intensity, .5)));
      for (let i = 0; i < n; i++) {
        const a = back + (f.pool.random() - .5) * .9, speed = 260 + f.pool.random() * 520;
        f.pool.spawn({ x: g.x, y: g.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: .35 + f.pool.random() * .45,
          size: 1 + f.pool.random() * 1.6, gravity: 220, drag: .3, color: f.palette.spark, core: f.palette.core, kind: 1 });
      }
    });
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
  drawStreaks(f);
  drawHits(f);
  drawBlow(f);
  drawSettle(f);
}
