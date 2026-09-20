import type { Point } from '../../game/types';

/** 画面上の位置や向き。x,y は場面によって割合だったり画素だったりする。 */
export type Vec = { x: number; y: number };

/** 画面の短辺を1とした長さに直すための倍率。点の x,y は縦横それぞれの割合なので、そのままでは長さを比べられない。 */
export function unit(w = 1, h = 1) {
  const short = Math.min(w, h) || 1;
  return { sx: (w || 1) / short, sy: (h || 1) / short };
}

/** 点列を筆ごとにまとめ、新しい筆から順に最大 max 本返す。手が二つでも筆の番号で分かれる。 */
export function lastStrokes(points: readonly Point[], max = 3): Point[][] {
  const groups = new Map<number, Point[]>();
  for (const p of points) {
    const group = groups.get(p.stroke);
    if (group) group.push(p); else groups.set(p.stroke, [p]);
  }
  const all = [...groups.values()];
  all.sort((a, b) => b[b.length - 1].t - a[a.length - 1].t);
  return all.slice(0, max);
}

/** 筆先の速さ（短辺の割合／秒）と進む向き。直近 windowMs の間に動いた道のりから出す。 */
export function tipSpeed(stroke: readonly Point[], w = 1, h = 1, windowMs = 120) {
  const still = { speed: 0, dir: { x: 0, y: 0 } as Vec };
  const n = stroke.length;
  if (n < 2) return still;
  const { sx, sy } = unit(w, h);
  const end = stroke[n - 1];
  let i = n - 1;
  while (i > 0 && end.t - stroke[i - 1].t <= windowMs) i--;
  const start = stroke[i];
  const ms = end.t - start.t;
  if (ms <= 0) return still;
  let length = 0;
  for (let k = i + 1; k < n; k++) length += Math.hypot((stroke[k].x - stroke[k - 1].x) * sx, (stroke[k].y - stroke[k - 1].y) * sy);
  const dx = (end.x - start.x) * sx, dy = (end.y - start.y) * sy, d = Math.hypot(dx, dy);
  return { speed: length / (ms / 1000), dir: d > 1e-6 ? { x: dx / d, y: dy / d } : { x: 0, y: 0 } };
}

/** 速さを0〜1の度合いに直す。ゆっくり（slow以下）で0、速い（fast以上）で1。 */
export const speedRatio = (speed: number, slow = .25, fast = 1.4) =>
  Math.min(1, Math.max(0, (speed - slow) / Math.max(1e-6, fast - slow)));

/** 輪と認めるのに要る面積。差し渡しの二乗に対する割合で、細長い輪は通し、往復の線は落とす。 */
const MIN_AREA = .12;

/**
 * 輪が閉じたか。始点の近くへ戻り、点が足りていて、途中で十分離れていて、
 * さらに囲んだ面積が広がっていれば、中心と大きさを返す。
 * 面積を見るのは、行って戻るだけの直線も始点へ帰ってくるため。往復の線は囲む面積がほぼ0になる。
 */
export function ringClosure(stroke: readonly Point[], w = 1, h = 1, near = .04, minPoints = 20) {
  if (stroke.length < minPoints) return null;
  const { sx, sy } = unit(w, h);
  const head = stroke[0], tail = stroke[stroke.length - 1];
  if (Math.hypot((tail.x - head.x) * sx, (tail.y - head.y) * sy) > near) return null;
  let far = 0, cx = 0, cy = 0;
  for (const p of stroke) {
    far = Math.max(far, Math.hypot((p.x - head.x) * sx, (p.y - head.y) * sy));
    cx += p.x; cy += p.y;
  }
  // 始点の周りで震えただけの線は輪にしない。
  if (far < near * 2.5) return null;
  // 囲んだ面積（靴ひも公式）。円なら far の二乗の約0.79倍、正三角形でも約0.43倍になり、往復の直線はほぼ0。
  let twice = 0;
  for (let i = 0; i < stroke.length; i++) {
    const a = stroke[i], b = stroke[(i + 1) % stroke.length];
    twice += (a.x * sx) * (b.y * sy) - (b.x * sx) * (a.y * sy);
  }
  if (Math.abs(twice) / 2 < far * far * MIN_AREA) return null;
  return { center: { x: cx / stroke.length, y: cy / stroke.length } as Vec, size: far };
}

/** 点列の u（0〜1）の位置。輪郭を光が一周するのに使う。 */
export function along(stroke: readonly Point[], u: number): Vec {
  const n = stroke.length;
  if (!n) return { x: .5, y: .5 };
  const f = Math.min(1, Math.max(0, u)) * (n - 1), i = Math.floor(f), k = f - i;
  const a = stroke[i], b = stroke[Math.min(n - 1, i + 1)];
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

/** 一コマに出す粒の数。1未満の端数は確率で1個にする。 */
export function spawnCount(ratePerSecond: number, dt: number, random: () => number, max = 4) {
  const expected = Math.max(0, ratePerSecond) * Math.max(0, dt);
  return Math.min(max, Math.floor(expected) + (random() < expected % 1 ? 1 : 0));
}
