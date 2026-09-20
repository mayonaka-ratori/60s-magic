import type { Point, SpeechEntry } from './types';
import { clamp } from './motion';

/** 前に計算した結果。点や言葉が増えていなければ使い回す。 */
let lastKey = '', lastValue = 0;

/** 線の長さ（画面の幅を1とした合計）と筆の数を数える。筆の切れ目はまたがない。 */
function strokeStats(points: readonly Point[]) {
  let length = 0, strokes = 0, previous: Point | null = null;
  for (const p of points) {
    if (!previous || previous.stroke !== p.stroke) strokes++;
    else length += Math.hypot(p.x - previous.x, p.y - previous.y);
    previous = p;
  }
  return { length, strokes };
}

/** 言葉の量。同じ発話の言い直しは長い方だけを数える。 */
function speechLetters(entries: readonly SpeechEntry[]) {
  const longest = new Map<number, number>();
  for (const e of entries) {
    const n = (e.text ?? '').trim().length;
    if (n > (longest.get(e.id) ?? 0)) longest.set(e.id, n);
  }
  let total = 0;
  for (const n of longest.values()) total += n;
  return total;
}

/**
 * 入力の量。0〜1。線の長さ、筆の数、言葉の文字数で増える。
 * 何も入れなければ0、一筆と一言で0.4あたり、たくさん描いてたくさん唱えると1に近づく。
 * 上に張り付かないよう、足し合わせた値をゆるやかに飽和させる。
 */
export function inputAmount(points: readonly Point[], entries: readonly SpeechEntry[]): number {
  if (!points.length && !entries.length) return 0;
  // 毎コマ全部を数えると重いので、点と言葉が変わった時だけ計算し直す。
  const tail = points[points.length - 1];
  const key = `${points.length}:${tail ? `${tail.stroke},${tail.x},${tail.y}` : ''}:${entries.length}:${entries.length ? entries[entries.length - 1].text.length : 0}`;
  if (key === lastKey) return lastValue;
  const { length, strokes } = strokeStats(points);
  const letters = speechLetters(entries);
  const raw = clamp(length / 2.5, 0, 4) * .9 + clamp(strokes / 5, 0, 3) * .6 + clamp(letters / 30, 0, 4) * .9;
  lastKey = key; lastValue = clamp(1 - Math.exp(-raw));
  return lastValue;
}
