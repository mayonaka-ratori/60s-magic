import { clamp, getNodes } from '../../game/motion';
import { glow, ease, type Frame } from './frame';
import { along, lastStrokes, ringClosure, spawnCount, speedRatio, tipSpeed, type Vec } from './strokes-math';

const CHARGE_AT = 14;
/** 筆を置いた輪が広がりきるまで（秒） */
const OPEN_SPAN = .5;
/** 閉じた輪を光が一周するまで（秒） */
const RING_SPAN = .9;

/** 筆ごとに、置かれた時刻と閉じた時刻を覚えておく。時刻が戻ったら忘れる。 */
const openedAt = new Map<number, number>();
const closedAt = new Map<number, number>();
let lastTime = -1;

/** 描く動きへの即時反応。筆を置いた輪、速い線の火花、閉じた線の一周、声での脈動。 */
export function drawStrokeReactions(f: Frame) {
  const { c, w, h, t, intensity, palette } = f;
  if (t < lastTime - .05) { openedAt.clear(); closedAt.clear(); }
  lastTime = t;
  if (!f.points.length) return;

  const short = Math.min(w, h);
  const voice = clamp(f.live?.voice ?? 0), amount = clamp(f.live?.amount ?? 0);
  // 派手さで明るさと大きさを少しだけ増す。
  const boost = .7 + intensity * .25;
  const at = (p: Vec) => ({ x: p.x * w, y: p.y * h });
  const strokes = lastStrokes(f.points, 3);

  // 筆を置いた瞬間。小さな輪が一周広がり、粒が数個散る。
  for (const stroke of strokes) {
    const id = stroke[0].stroke;
    f.once('stroke-' + id, () => {
      openedAt.set(id, t);
      const head = at(stroke[0]);
      for (let i = 0; i < 5; i++) {
        const a = f.pool.random() * Math.PI * 2, speed = 40 + f.pool.random() * 70;
        f.pool.spawn({ x: head.x, y: head.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 20, life: .45 + f.pool.random() * .4,
          size: 1 + f.pool.random() * 1.4, drag: .3, color: palette.main, core: palette.core, kind: 0 });
      }
    });
    const born = openedAt.get(id);
    if (born === undefined) continue;
    const u = (t - born) / OPEN_SPAN;
    if (u < 0 || u >= 1) continue;
    const head = at(stroke[0]), r = ease(u) * short * .06 * (1 + intensity * .12);
    c.globalAlpha = (1 - u) * .55 * boost; c.lineWidth = 2 - u * 1.2; c.strokeStyle = palette.core;
    c.beginPath(); c.arc(head.x, head.y, r + 2, 0, Math.PI * 2); c.stroke();
    glow(f, head.x, head.y, 5 * (1 - u) + 2, (1 - u) * .5 * boost);
  }

  const current = strokes[0];
  const fresh = current && t * 1000 - current[current.length - 1].t < 250;

  // 速く引くほど、筆先から火花が飛ぶ。ゆっくりなら何も出ない。
  if (fresh && t < CHARGE_AT) {
    const { speed, dir } = tipSpeed(current, w, h);
    const ratio = speedRatio(speed);
    if (ratio > 0) {
      const tip = at(current[current.length - 1]);
      const n = spawnCount(ratio * (14 + intensity * 14), f.dt, () => f.pool.random(), 3);
      for (let i = 0; i < n; i++) {
        const spread = (f.pool.random() - .5) * 1.1, fly = (90 + ratio * 320) * (.6 + f.pool.random() * .8);
        const vx = (dir.x * Math.cos(spread) - dir.y * Math.sin(spread)) * fly;
        const vy = (dir.x * Math.sin(spread) + dir.y * Math.cos(spread)) * fly;
        f.pool.spawn({ x: tip.x, y: tip.y, vx, vy, life: .25 + f.pool.random() * .35, size: 1 + ratio * 1.6,
          drag: .2, gravity: 60, color: palette.spark, core: palette.core, kind: 1 });
      }
      // 速いときは筆先そのものも強く光る。
      glow(f, tip.x, tip.y, 3 + ratio * 6, ratio * .6 * boost, palette.spark, palette.core);
    }
  }

  // 線が閉じた瞬間。輪郭を光が一周し、中心に光が灯る。筆ごとに一回だけ。
  for (const stroke of strokes) {
    const id = stroke[0].stroke;
    if (!closedAt.has(id)) {
      const ring = ringClosure(stroke, w, h);
      if (ring) f.once('ring-' + id, () => {
        closedAt.set(id, t);
        const middle = at(ring.center);
        for (let i = 0; i < 6; i++) {
          const a = f.pool.random() * Math.PI * 2;
          f.pool.spawn({ x: middle.x, y: middle.y, vx: Math.cos(a) * 30, vy: Math.sin(a) * 30 - 30, life: .7 + f.pool.random() * .5,
            size: 1.2 + f.pool.random() * 1.4, drag: .35, color: palette.main, core: palette.core, kind: 0 });
        }
      });
    }
    const done = closedAt.get(id);
    if (done === undefined) continue;
    const u = (t - done) / RING_SPAN;
    if (u < 0 || u >= 1) continue;
    const fade = 1 - u;
    // 輪郭を走る光。少し後ろに尾を引く。
    for (let k = 0; k < 5; k++) {
      const p = at(along(stroke, ease(u) - k * .03));
      glow(f, p.x, p.y, (4 - k * .6) * (1 + intensity * .1), fade * (1 - k / 6) * .85 * boost);
    }
    const middle = at(ringClosureCenter(stroke));
    glow(f, middle.x, middle.y, (4 + ease(u) * 9) * (1 + intensity * .15), fade * .7 * boost);
    c.globalAlpha = fade * .35 * boost; c.lineWidth = 1.2; c.strokeStyle = palette.core;
    c.beginPath(); c.arc(middle.x, middle.y, ease(u) * short * .05 + 4, 0, Math.PI * 2); c.stroke();
  }

  // 声で脈打つ節の光。大きいほど速く大きく。
  if (voice > .03) {
    const nodes = getNodes(f.points, 5);
    for (let i = 0; i < nodes.length; i++) {
      const beat = .5 + .5 * Math.sin(t * (5 + voice * 22) + i * 1.3);
      const p = at(nodes[i]);
      glow(f, p.x, p.y, (3 + voice * 7) * (.7 + beat * .6), voice * (.25 + beat * .35) * boost);
    }
  }

  // 蓄積の間（14〜17秒）は線全体をほんの少し明るくするだけにして、蓄積の演出と重ねすぎない。
  if (t >= CHARGE_AT) {
    const alpha = (.06 + amount * .12 + voice * .1) * boost * (1 - clamp((t - 16.6) / .4));
    if (alpha > .004) {
      c.globalAlpha = alpha; c.lineWidth = 2.4; c.strokeStyle = palette.main;
      c.beginPath();
      let stroke = -1;
      for (const p of f.points) {
        if (p.stroke !== stroke) { c.moveTo(p.x * w, p.y * h); stroke = p.stroke; } else c.lineTo(p.x * w, p.y * h);
      }
      c.stroke();
      c.globalAlpha = alpha * .8; c.lineWidth = .9; c.strokeStyle = palette.core; c.stroke();
    }
  }
}

/** 閉じた輪の中心。描くときに毎回求め直す。 */
function ringClosureCenter(stroke: { x: number; y: number }[]): Vec {
  let cx = 0, cy = 0;
  for (const p of stroke) { cx += p.x; cy += p.y; }
  return { x: cx / stroke.length, y: cy / stroke.length };
}
