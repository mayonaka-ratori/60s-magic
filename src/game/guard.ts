import type { Point } from './types';
import { clamp } from './motion';
import { affirmativeText } from './recipe';

export type XY = { x: number; y: number };

/**
 * 敵が狙う場所。画面の左寄り、高さは真ん中に固定する。
 * 騎士と重ならない空いた場所に置き、どこを守るのかがひと目で分かるようにする。
 * 着席でも片手でも手が届く位置にし、動き回らせない。腕前を試すためのものではなく、
 * 「ここに来る」と分かるための案内である。
 */
export const AIM: XY = { x: .27, y: .5 };
/**
 * 印の半径。画面の短いほうの辺を1とした値。ここを守る場所として見せる大きさ。
 * 高さだけを基準にすると、縦長の画面で輪と目盛りが中心の左側へ伸びて画面からはみ出す。
 * 短いほうの辺を使うと、横長の画面では今までどおり高さが基準になり、縦長でも必ず収まる。
 */
export const AIM_RADIUS = .1;
/**
 * 守ったと見なす広さ。印の半径と同じ基準（画面の短いほうの辺を1）で、輪の1.2倍まで。
 * この中に線があれば、運ばずにその場所のまま盾にする。広げすぎると、どこに描いても同じになる。
 */
export const GUARD_REACH = AIM_RADIUS * 1.2;
/** 印を描く半径（画素）。描く側も試験もこの長さを使う。 */
export const aimRadiusPx = (w: number, h: number) => AIM_RADIUS * Math.min(w, h);
/**
 * 守ったと見なす広さを、画面の高さを1とした長さに直す。点までの距離はこの単位で測る。
 * 短いほうの辺を1とした GUARD_REACH に、高さに対する短い辺の割合を掛けるだけ。
 * 横長の画面では高さがそのまま基準になり、縦長の画面では幅の分だけ狭くなる。
 */
export const guardReachOf = (aspect: number) => GUARD_REACH * Math.min(aspect, 1);
/**
 * 画面の横と縦の比（横÷縦）。点の横の位置は画面の幅を1とした値なので、
 * 印までの距離を測るときはこの比を掛けて、実際に見えている輪と同じ形にする。
 * 掛けずに測ると、横長の画面では輪の外まで守れたことになり、縦長では輪の中でも守れない。
 */
export const DEFAULT_ASPECT = 16 / 9;

/** 点を筆ごとに分ける。順序は描いた順のまま。 */
export function strokesOf(points: readonly Point[]): Point[][] {
  const groups = new Map<number, Point[]>();
  for (const p of points) { const group = groups.get(p.stroke) ?? []; group.push(p); groups.set(p.stroke, group); }
  return [...groups.values()];
}

/** 囲めたと見なす、印のまわりを回った角度（ラジアン）。240度。四分の三ほど回れば囲めたことにする。 */
export const ENCLOSE_TURN = Math.PI * 4 / 3;
/** 印に近すぎる点は角度が暴れるので数に入れない。 */
const TOO_CLOSE = .005;
/** 線の大きさの下限。手の震えだけで一周したことにしない。 */
const MIN_EXTENT = .02;

/**
 * 一筆が印のまわりを回った角度のうち、一番大きかったもの（ラジアン）。
 * 始点と終点を結んで多角形の内外を見る方法だと、なぞり返した線や逆回りに重ねた線で
 * 向きが打ち消し合って「囲めていない」になり、逆に印から離れたL字が「囲めた」になる。
 * 回った角度の最大値で見ると、どちらも見た目どおりになる。
 */
export function windingAround(stroke: readonly XY[], aim: XY = AIM): number {
  let sum = 0, peak = 0, previous: number | null = null;
  for (const p of stroke) {
    const dx = p.x - aim.x, dy = p.y - aim.y;
    if (Math.hypot(dx, dy) < TOO_CLOSE) continue;
    const angle = Math.atan2(dy, dx);
    if (previous !== null) {
      let step = angle - previous;
      if (step > Math.PI) step -= Math.PI * 2; else if (step < -Math.PI) step += Math.PI * 2;
      sum += step; peak = Math.max(peak, Math.abs(sum));
    }
    previous = angle;
  }
  return peak;
}

/** 一筆が印を囲んでいるか。甘く判定する。閉じきっていない輪も、なぞり返した輪も囲めたことにする。 */
export function strokeEncloses(stroke: readonly XY[], aim: XY = AIM): boolean {
  if (stroke.length < 3) return false;
  const box = boxOf(stroke);
  if (Math.max(box.width, box.height) < MIN_EXTENT) return false;
  return windingAround(stroke, aim) >= ENCLOSE_TURN;
}

/** 印を囲んだ筆だけを返す。何重にも囲めば、その数だけ並ぶ。 */
export function enclosingStrokes(points: readonly Point[], aim: XY = AIM): Point[][] {
  return strokesOf(points).filter(stroke => strokeEncloses(stroke, aim));
}

/**
 * 筆の上で、印に一番近い点までの距離。線の真ん中ではなく線の上で見る。
 * 単位は画面の高さを1とした長さで、横の差には画面の比を掛けてそろえる。
 */
const reachOf = (stroke: readonly XY[], aim: XY, aspect: number) =>
  Math.min(...stroke.map(p => Math.hypot((p.x - aim.x) * aspect, p.y - aim.y)));

/**
 * 印の範囲に掛かっている筆。囲めていなくても、この線はその場所のまま盾になる。
 * 二本以上あれば、一番大きい形のものを選ぶ。形にならない短い線は数えない。
 */
export function coveringStroke(points: readonly Point[], aim: XY = AIM, aspect: number = DEFAULT_ASPECT) {
  return strokesOf(points).filter(stroke => stroke.length >= 2)
    .map(stroke => ({ stroke, box: boxOf(stroke) }))
    .filter(found => reachOf(found.stroke, aim, aspect) <= guardReachOf(aspect) && Math.max(found.box.width, found.box.height) >= MIN_EXTENT)
    .sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height)[0] ?? null;
}
/** 印の範囲を守れているか。描いている最中の返事に使う。 */
export const coversAim = (points: readonly Point[], aim: XY = AIM, aspect: number = DEFAULT_ASPECT) =>
  coveringStroke(points, aim, aspect) !== null;

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
  /** 印の範囲に掛かっていた線を、その場所のまま盾にしたか。何も描かなかったときは false。 */
  covering: boolean;
  /** 運んだぶんのずれ。運ぶ動きを見せるために、ここから戻して描き始める。 */
  offset: XY;
  /** 囲めたか。 */
  enclosed: boolean;
  /** 囲んだ筆の数。 */
  rings: number;
};

export const boxOf = (stroke: readonly XY[]) => {
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
 * 印を囲めていれば、その輪をそのまま盾の縁にする。囲めていなくても、印の範囲に掛かっていれば
 * その線を描いた場所のまま盾にする。どちらでもなければ、一番近い筆を印の前へ運んで面にする。
 * 全く描いていなければ印の前に小さな光の玉を出す。
 */
export function shieldOf(points: readonly Point[], said: number | null, aim: XY = AIM, aspect: number = DEFAULT_ASPECT): Shield {
  const enclosing = enclosingStrokes(points, aim);
  const rings = enclosing.length;
  const layers = clamp(said && said > 1 ? said : Math.max(1, rings), 1, 5);
  /** 形にならない線しかないときに出す、印の前の光の玉。何も描かなかった人と同じ見た目にする。 */
  const orb = (enclosedNow: boolean): Shield =>
    ({ kind: 'orb', outline: circle(aim, .06), center: { ...aim }, radius: .06, layers, moved: false, covering: false, offset: { x: 0, y: 0 }, enclosed: enclosedNow, rings });
  if (rings) {
    // 何重にも囲んだときは、一番外の輪を縁に使う。
    const outline = enclosing.map(stroke => ({ stroke, box: boxOf(stroke) })).sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height)[0];
    const { box } = outline;
    if (Math.max(box.width, box.height) < MIN_EXTENT) return orb(true);
    return { kind: shieldKind(box.width, box.height), outline: thin(outline.stroke), center: { x: box.cx, y: box.cy },
      radius: Math.max(.06, Math.max(box.width, box.height) / 2), layers, moved: false, covering: false, offset: { x: 0, y: 0 }, enclosed: true, rings };
  }
  // 囲めていなくても、印の範囲に掛かっている線があれば、その線を描いた場所のまま盾にする。
  const covering = coveringStroke(points, aim, aspect);
  if (covering) {
    const { box } = covering;
    return { kind: shieldKind(box.width, box.height), outline: thin(covering.stroke), center: { x: box.cx, y: box.cy },
      radius: Math.max(.06, Math.max(box.width, box.height) / 2), layers, moved: false, covering: true, offset: { x: 0, y: 0 }, enclosed: false, rings: 0 };
  }
  // 印から離れている。一番近い筆を選び、形を保ったまま印の前へ運ぶ。
  const candidates = strokesOf(points).filter(stroke => stroke.length >= 2);
  if (!candidates.length) return orb(false);
  // 近さは、線の真ん中ではなく線の上で一番近い点で見る。小さく描いた線が、大きな線に負けないようにする。
  const nearest = candidates.map(stroke => ({ stroke, box: boxOf(stroke), reach: reachOf(stroke, aim, aspect) }))
    .sort((a, b) => a.reach - b.reach)[0];
  const { box } = nearest;
  // 同じ場所で止まっていた線は、運んでも輪郭が点になって見えない。光の玉にする。
  if (Math.max(box.width, box.height) < MIN_EXTENT) return orb(false);
  const outline = thin(nearest.stroke).map(p => ({ x: p.x - box.cx + aim.x, y: p.y - box.cy + aim.y }));
  return { kind: shieldKind(box.width, box.height), outline, center: { ...aim },
    radius: Math.max(.06, Math.max(box.width, box.height) / 2), layers, moved: true, covering: false,
    offset: { x: aim.x - box.cx, y: aim.y - box.cy }, enclosed: false, rings: 0 };
}

/** 止め方。詠唱の言葉で決まる。言わなければ受け止める。 */
export type GuardStyle = 'block' | 'reflect' | 'erase';
/** 打ち消しの言い方。文の切れ目で終わるものだけを外す。「消えない光」の「ない」は外さない。 */
const NEGATED = /[^、。！？]*?(?:しないで|するな|ないで|ない|なくていい|ません)(?=$|[、。！？])/g;
/** 否定した言い方を取り除く。「弾き返さないで」で弾き返してしまわないようにする。 */
export function dropNegated(text: string) { return text.replace(NEGATED, ''); }
const REFLECT = /返せ|返し|返す|跳ね返|撃ち返|返り討ち|弾け|弾き|はじけ|はじき|はねかえ|うちかえ|かえせ|かえし|反発|反射/;
const ERASE = /消せ|消し|消す|かき消|打ち消|けせ|けし|きえろ|燃やせ|燃やし|焼き|焼け|やきつく|もやせ|溶か|相殺|中和|無効|浄化|消滅/;
/**
 * 止め方を選ぶ。辞書へ寄せた言葉と、聞き取ったままの言葉の両方を見る。
 * 辞書は「反発」を意味の無い語として落とし、「浄化」を「光」に置き換えるので、
 * 寄せた後の言葉だけでは止め方の言葉がほとんど残らない。かなのままの聞き取りも同じ理由で見る。
 */
export function guardStyleOf(...texts: Array<string | null | undefined>): GuardStyle {
  // 「AではなくB」の前半と、「〜しないで」の言い方を落としてから見る。
  const joined = texts.filter(Boolean).map(text => dropNegated(affirmativeText(text as string))).join('、');
  if (REFLECT.test(joined)) return 'reflect';
  if (ERASE.test(joined)) return 'erase';
  return 'block';
}
export const GUARD_LABELS: Record<GuardStyle, string> = { block: '受け止めた', reflect: '弾き返した', erase: 'かき消した' };

export type GuardPlan = { shield: Shield; style: GuardStyle };
