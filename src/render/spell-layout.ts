import type { Point } from '../game/types';
import { clamp } from '../game/motion';
import { BEATS, type Beat } from '../game/rounds';
import { AIM } from '../game/guard';

/** 画面上の四角（画素）。x と y は中心。 */
export type SpellFrame = { x: number; y: number; width: number; height: number };

/**
 * 完成した術式を置ける範囲（画面に対する割合）。
 * 上は体力表示の帯、下は案内文の帯を避ける。左右は光のにじみが切れない程度の余白だけ空け、幅はほぼ画面いっぱいに使う。
 */
export const SPELL_BOUNDS = { top: .14, bottom: .12, side: .02 };
/**
 * 小さく描いたときに広げる下限（画面に対する割合）と、広げる倍率の上限。
 * 幅も高さも下限より小さいときだけ小さいとみなし、どちらかが下限に届いたところで広げるのをやめる。
 * 片方だけ小さい形（横に長い一本の線など）は大きな動きなので、そのままにする。
 */
export const SPELL_MIN = { width: .28, height: .18, scale: 2.2 };

/** 術式を置ける範囲（画素）。 */
export function spellBounds(width: number, height: number): SpellFrame {
  const top = height * SPELL_BOUNDS.top, bottom = height * (1 - SPELL_BOUNDS.bottom);
  return { x: width / 2, y: (top + bottom) / 2, width: width * (1 - SPELL_BOUNDS.side * 2), height: bottom - top };
}

/** 点列の囲み（画素）。点が無ければ null。 */
function boxOf(points: readonly Point[], width: number, height: number): SpellFrame | null {
  if (!points.length) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) { const x = p.x * width, y = p.y * height; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, width: maxX - minX, height: maxY - minY };
}
/** 囲みが大きさを持つか。一点だけ、または同じ場所で止まっていた線は、何も描いていないのと同じに扱う。 */
const hasSize = (box: SpellFrame | null): box is SpellFrame => !!box && (box.width >= 1 || box.height >= 1);
/** 囲みからその枠へ移る倍率。大きさのある方の辺で見る。 */
const scaleBetween = (box: SpellFrame, frame: SpellFrame) => box.width >= box.height ? frame.width / box.width : frame.height / box.height;

/** 画面上の縦横比と筆の切れ目を保ったまま、完成した線を指定範囲へ収める。 */
export function fitSpell(points: readonly Point[], width: number, height: number, frame: SpellFrame): Point[] {
  if (!points.length) return [];
  const xs = points.map(p => p.x * width), ys = points.map(p => p.y * height);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const scale = Math.min(2.2, frame.width / Math.max(1, maxX - minX), frame.height / Math.max(1, maxY - minY));
  return points.map(p => ({ ...p,
    x: (frame.x + (p.x * width - cx) * scale) / width,
    y: (frame.y + (p.y * height - cy) * scale) / height,
  }));
}

/**
 * 表示する線のガタつきを抑える。保存する点列には使わない。
 * 1) 前後2点までの重みつき平均（1,2,3,2,1）で手の細かな震えを消す。
 * 2) 角を丸める方法（Chaikin）を1回かけて折れ目をなめらかにする。
 * 始点と終点は動かさない。動く量は隣の点との間隔程度までで、意図した大きな形は変えない。
 */
export function smoothStroke<T extends { x: number; y: number }>(points: readonly T[]): T[] {
  if (points.length < 3) return [...points];
  const weights = [1, 2, 3, 2, 1];
  const averaged: T[] = points.map((p, i) => {
    if (i === 0 || i === points.length - 1) return p;
    let x = 0, y = 0, total = 0;
    for (let k = -2; k <= 2; k++) {
      const q = points[i + k]; if (!q) continue;
      const w = weights[k + 2]; x += q.x * w; y += q.y * w; total += w;
    }
    return { ...p, x: x / total, y: y / total };
  });
  const rounded: T[] = [averaged[0]];
  for (let i = 0; i < averaged.length - 1; i++) {
    const a = averaged[i], b = averaged[i + 1];
    rounded.push({ ...a, x: a.x * .75 + b.x * .25, y: a.y * .75 + b.y * .25 });
    rounded.push({ ...b, x: a.x * .25 + b.x * .75, y: a.y * .25 + b.y * .75 });
  }
  rounded.push(averaged[averaged.length - 1]);
  return rounded;
}

/**
 * 完成した術式が、発動までに落ち着く場所と大きさ（画素）。
 * 描いた場所と大きさをそのまま使い、縮めない。小さく描いたときだけ下限まで広げ（上限2.2倍）、
 * 画面の外や上下の帯にかかるときだけ中へ寄せる。置ける範囲より大きく描いたときだけ、範囲に収まるぶんだけ縮める。
 * 設計仕様には縮める決まりが無く、「小さい動きは表示倍率を上げる」とだけある。防御の回も同じ決まりで、
 * 盾は描いた線からそのまま作るので、術式が描いた場所に残るほうが盾と重なる。
 * 何も描いていないときは、一回目は画面の下寄りの中央、防御の回は狙いの印の高さに置く。大きさは広げる下限の箱。
 */
export function completedSpellFrame(width: number, height: number, beat: Beat = BEATS[0], points: readonly Point[] = []): SpellFrame {
  const bounds = spellBounds(width, height), minWidth = width * SPELL_MIN.width, minHeight = height * SPELL_MIN.height;
  const box = boxOf(points, width, height);
  if (!hasSize(box)) return { x: width * .5, y: height * (beat.defend ? AIM.y : .66), width: minWidth, height: minHeight };
  // 幅も高さも下限より小さいときだけ広げる。どちらかが下限に届いたところで止めるので、境目で倍率が跳ねない。
  const grow = clamp(Math.min(minWidth / Math.max(1, box.width), minHeight / Math.max(1, box.height)), 1, SPELL_MIN.scale);
  // 置ける範囲より大きい形だけ、範囲に収まるぶんだけ縮める。それ以外は描いた大きさのまま。
  const scale = Math.min(grow, bounds.width / Math.max(1, box.width), bounds.height / Math.max(1, box.height));
  const w = box.width * scale, h = box.height * scale;
  // 範囲からはみ出すときだけ、はみ出したぶんを中へ寄せる。収まっていれば描いた場所のまま。
  const x = clamp(box.x, bounds.x - bounds.width / 2 + w / 2, bounds.x + bounds.width / 2 - w / 2);
  const y = clamp(box.y, bounds.y - bounds.height / 2 + h / 2, bounds.y + bounds.height / 2 - h / 2);
  return { x, y, width: w, height: h };
}

/**
 * 締め切りまでは完全に入力位置のまま。締め切りから発動までだけ、形を保って落ち着く先へ移る。
 * scale と dx、dy は画面の中心を軸にした拡大と移動。center は術式の中心（弾の出どころの一つ目）。
 */
export function spellPose(points:readonly Point[],width:number,height:number,ms:number,beat:Beat=BEATS[0]) {
  const box=boxOf(points,width,height),frame=completedSpellFrame(width,height,beat,points);
  const cx=box?box.x:frame.x,cy=box?box.y:frame.y;
  const scaleTo=hasSize(box)?scaleBetween(box,frame):1;
  const p=clamp((ms-beat.inputEnd*1000)/((beat.release-beat.inputEnd)*1000)),progress=p*p*(3-2*p);
  const scale=1+(scaleTo-1)*progress;
  const center={x:cx+(frame.x-cx)*progress,y:cy+(frame.y-cy)*progress};
  const dx=center.x-width/2-(cx-width/2)*scale,dy=center.y-height/2-(cy-height/2)*scale;
  return {scale,dx,dy,center,progress,opacity:1-clamp((ms-(beat.impact+2.5)*1000)/2000)};
}

/** object-fit: cover と同じ計算で、一枚絵の命中位置を画面に合わせる。 */
export function backdropTarget(width:number,height:number,imageWidth:number,imageHeight:number) {
  const scale=Math.max(width/imageWidth,height/imageHeight);
  return {x:.5,y:(height/2+(.32-.5)*imageHeight*scale)/height};
}
