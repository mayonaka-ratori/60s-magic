import type { Point } from '../game/types';
import { clamp } from '../game/motion';

export type SpellFrame = { x: number; y: number; width: number; height: number };

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

export function completedSpellFrame(width: number, height: number): SpellFrame {
  return { x: width * .5, y: height * .66, width: Math.min(width * .68, height * .49), height: height * .32 };
}

/** 14秒までは完全に入力位置のまま。14〜17秒だけ形を保って移動する。 */
export function spellPose(points:readonly Point[],width:number,height:number,ms:number) {
  const xs=points.map(p=>p.x*width),ys=points.map(p=>p.y*height);
  const cx=points.length?(Math.min(...xs)+Math.max(...xs))/2:width*.5;
  const cy=points.length?(Math.min(...ys)+Math.max(...ys))/2:height*.66;
  const frame=completedSpellFrame(width,height);
  const scaleTo=Math.min(2.2,frame.width/Math.max(1,points.length?Math.max(...xs)-Math.min(...xs):1),frame.height/Math.max(1,points.length?Math.max(...ys)-Math.min(...ys):1));
  const p=clamp((ms-14000)/3000),progress=p*p*(3-2*p);
  const scale=1+(scaleTo-1)*progress;
  const center={x:cx+(frame.x-cx)*progress,y:cy+(frame.y-cy)*progress};
  const dx=center.x-width/2-(cx-width/2)*scale,dy=center.y-height/2-(cy-height/2)*scale;
  return {scale,dx,dy,center,progress,opacity:1-clamp((ms-21000)/2000)};
}

/** object-fit: cover と同じ計算で、一枚絵の命中位置を画面に合わせる。 */
export function backdropTarget(width:number,height:number,imageWidth:number,imageHeight:number) {
  const scale=Math.max(width/imageWidth,height/imageHeight);
  return {x:.5,y:(height/2+(.32-.5)*imageHeight*scale)/height};
}
