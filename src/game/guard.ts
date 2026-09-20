import type { Point } from './types';
import { clamp } from './motion';

export type XY = { x: number; y: number };

/**
 * 敵が狙う場所。画面の中央より少し下、胸の高さに固定する。
 * 着席でも片手でも手が届く位置にし、動き回らせない。腕前を試すためのものではなく、
 * 「ここに来る」と分かるための案内である。
 */
export const AIM: XY = { x: .5, y: .62 };
/** 印の半径。画面の短い方の辺を1とした値。小さすぎると囲えず、大きすぎると何でも囲えてしまう。 */
export const AIM_RADIUS = .055;

/** 点を筆ごとに分ける。順序は描いた順のまま。 */
export function strokesOf(points: readonly Point[]): Point[][] {
  const groups = new Map<number, Point[]>();
  for (const p of points) { const group = groups.get(p.stroke) ?? []; group.push(p); groups.set(p.stroke, group); }
  return [...groups.values()];
}

/**
 * 一筆が印を囲んでいるか。開いたままの線は始点と終点を結んで見る（甘く判定する）。
 * 横に引いた線を「閉じた」と数えないよう、囲んだ形の面積が小さすぎるものは外す。
 */
export function strokeEncloses(stroke: readonly XY[], aim: XY = AIM): boolean {
  if (stroke.length < 3) return false;
  let area = 0;
  for (let i = 0, j = stroke.length - 1; i < stroke.length; j = i++) area += stroke[j].x * stroke[i].y - stroke[i].x * stroke[j].y;
  if (Math.abs(area) / 2 < .0015) return false;
  let inside = false;
  for (let i = 0, j = stroke.length - 1; i < stroke.length; j = i++) {
    const a = stroke[i], b = stroke[j];
    if ((a.y > aim.y) !== (b.y > aim.y) && aim.x < (b.x - a.x) * (aim.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** 印を囲んだ筆だけを返す。何重にも囲めば、その数だけ並ぶ。 */
export function enclosingStrokes(points: readonly Point[], aim: XY = AIM): Point[][] {
  return strokesOf(points).filter(stroke => strokeEncloses(stroke, aim));
}

export type ShieldKind = 'ring' | 'wall' | 'pillar' | 'orb';
export type Shield = {
  kind: ShieldKind;
  /** 盾の輪郭。本人が描いた線をそのまま使う。正規化した座標。 */
  outline: XY[];
  center: XY;
  /** 代表の大きさ。正規化した半径。 */
  radius: number;
  /** 重なる層の数。1〜5。 */
  layers: number;
  /** 囲めず、印の前へ運んできたか。 */
  moved: boolean;
  /** 運んだぶんのずれ。運ぶ動きを見せるために、ここから戻して描き始める。 */
  offset: XY;
  /** 囲めたか。 */
  enclosed: boolean;
  /** 囲んだ筆の数。 */
  rings: number;
};

const boxOf = (stroke: readonly XY[]) => {
  const xs = stroke.map(p => p.x), ys = stroke.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
};
/** 輪郭の点を間引く。描くのは毎コマなので、多くても64点までにする。形は変えない。 */
const thin = (stroke: readonly XY[], max = 64): XY[] => {
  if (stroke.length <= max) return stroke.map(p => ({ x: p.x, y: p.y }));
  const step = (stroke.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => { const p = stroke[Math.round(i * step)]; return { x: p.x, y: p.y }; });
};
const circle = (center: XY, radius: number): XY[] =>
  Array.from({ length: 24 }, (_, i) => ({ x: center.x + Math.cos(i / 24 * Math.PI * 2) * radius, y: center.y + Math.sin(i / 24 * Math.PI * 2) * radius * 1.6 }));

/** 輪郭の形から、盾の見た目の種類を決める。 */
export function shieldKind(width: number, height: number): ShieldKind {
  if (Math.max(width, height) < .1) return 'orb';
  if (width > height * 2.2) return 'wall';
  if (height > width * 1.7) return 'pillar';
  return 'ring';
}

/**
 * 描いた線から盾を作る。
 * 印を囲めていれば、その輪をそのまま盾の縁にする。囲めていなくても失敗にはせず、
 * 一番近い筆を印の前へ運んで面にする。全く描いていなければ印の前に小さな光の玉を出す。
 */
export function shieldOf(points: readonly Point[], said: number | null, aim: XY = AIM): Shield {
  const enclosing = enclosingStrokes(points, aim);
  const rings = enclosing.length;
  const layers = clamp(said && said > 1 ? said : Math.max(1, rings), 1, 5);
  if (rings) {
    // 何重にも囲んだときは、一番外の輪を縁に使う。
    const outline = enclosing.map(stroke => ({ stroke, box: boxOf(stroke) })).sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height)[0];
    const { box } = outline;
    return { kind: shieldKind(box.width, box.height), outline: thin(outline.stroke), center: { x: box.cx, y: box.cy },
      radius: Math.max(.06, Math.max(box.width, box.height) / 2), layers, moved: false, offset: { x: 0, y: 0 }, enclosed: true, rings };
  }
  // 囲めていない。印に一番近い筆を選び、形を保ったまま印の前へ運ぶ。
  const candidates = strokesOf(points).filter(stroke => stroke.length >= 2);
  if (!candidates.length) return { kind: 'orb', outline: circle(aim, .06), center: { ...aim }, radius: .06, layers, moved: false, offset: { x: 0, y: 0 }, enclosed: false, rings: 0 };
  const nearest = candidates.map(stroke => ({ stroke, box: boxOf(stroke) }))
    .sort((a, b) => Math.hypot(a.box.cx - aim.x, a.box.cy - aim.y) - Math.hypot(b.box.cx - aim.x, b.box.cy - aim.y))[0];
  const { box } = nearest;
  const outline = thin(nearest.stroke).map(p => ({ x: p.x - box.cx + aim.x, y: p.y - box.cy + aim.y }));
  return { kind: shieldKind(box.width, box.height), outline, center: { ...aim },
    radius: Math.max(.06, Math.max(box.width, box.height) / 2), layers, moved: true,
    offset: { x: aim.x - box.cx, y: aim.y - box.cy }, enclosed: false, rings: 0 };
}

/** 止め方。詠唱の言葉で決まる。言わなければ受け止める。 */
export type GuardStyle = 'block' | 'reflect' | 'erase';
export function guardStyleOf(text: string): GuardStyle {
  if (/返せ|返し|跳ね返|撃ち返|弾け|弾き|はじけ/.test(text)) return 'reflect';
  if (/消せ|消し|かき消|打ち消|燃やせ|焼き|焼け|溶か/.test(text)) return 'erase';
  return 'block';
}
export const GUARD_LABELS: Record<GuardStyle, string> = { block: '受け止めた', reflect: '弾き返した', erase: 'かき消した' };

export type GuardPlan = { shield: Shield; style: GuardStyle };
/** 締め切りの時点で決める。言った数、描いた線、詠唱の三つだけを見る。 */
export function guardPlan(points: readonly Point[], said: number | null, text: string, aim: XY = AIM): GuardPlan {
  return { shield: shieldOf(points, said, aim), style: guardStyleOf(text) };
}
