import type { Point, SpeechEntry } from './types';
import { clamp } from './motion';

/** 前に計算した結果。点や言葉が増えていなければ使い回す。 */
let lastKey = '', lastValue = 0;
/**
 * 発話idごとの、これまでに見た最大の文字数。途中結果が短くなっても減らさない。
 * 回ごとに分けて持つ。発話の番号は回ごとに数え直し、文字入力はどの回でも同じ番号を使うので、
 * 一つにまとめると前の回の言葉がそのまま次の回の量に足されてしまう。
 * 分ける鍵には、その回が始まった時刻（ms）を使う。live-words.ts の覚え書きと同じ決まり。
 */
const longest = new Map<number, Map<number, number>>();

/** 一戦の始めに覚え書きを消す。前の一戦の言葉が残らないようにする。 */
export function resetInputAmount() {
  longest.clear(); lastKey = ''; lastValue = 0;
}

/** その回の覚え書き。まだ無ければ作る。 */
function memoOf(roundMs: number) {
  const found = longest.get(roundMs);
  if (found) return found;
  const made = new Map<number, number>();
  longest.set(roundMs, made);
  return made;
}

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

/** いまの発話を、その回の覚え書きに取り込む。同じ発話の言い直しは長い方だけを残す。 */
function remember(roundMs: number, entries: readonly SpeechEntry[]) {
  const memo = memoOf(roundMs);
  for (const e of entries) {
    const n = (e.text ?? '').trim().length;
    if (n > (memo.get(e.id) ?? 0)) memo.set(e.id, n);
  }
}

/**
 * 言葉が変わったかを見分ける鍵。その回の全発話のidと、これまでの最大文字数を並べる。
 * 呼ぶと覚え書きも新しくなる。言葉の計算をやり直すかどうかを、呼ぶ側でも同じ鍵で決められる。
 * roundMs はその回が始まった時刻。省くと一回目（0）として扱う。
 */
export function speechKey(entries: readonly SpeechEntry[], roundMs = 0): string {
  remember(roundMs, entries);
  let key = '';
  for (const [id, n] of memoOf(roundMs)) key += `${id}:${n};`;
  return key;
}

/** 言葉の量。その回の覚え書きの最大文字数を足す。 */
function speechLetters(roundMs: number) {
  let total = 0;
  for (const n of memoOf(roundMs).values()) total += n;
  return total;
}

/**
 * 入力の量。0〜1。線の長さ、筆の数、言葉の文字数で増える。
 * 何も入れなければ0、一筆と一言で0.4あたり、たくさん描いてたくさん唱えると1に近づく。
 * 上に張り付かないよう、足し合わせた値をゆるやかに飽和させる。
 * 数えるのはその回の入力だけで、前の回の線も言葉も足さない。
 */
export function inputAmount(points: readonly Point[], entries: readonly SpeechEntry[], roundMs = 0): number {
  if (!points.length && !entries.length && !longest.get(roundMs)?.size) return 0;
  // 毎コマ全部を数えると重いので、点と言葉が変わった時だけ計算し直す。
  const tail = points[points.length - 1];
  const key = `${roundMs}:${points.length}:${tail ? `${tail.stroke},${tail.x},${tail.y}` : ''}:${speechKey(entries, roundMs)}`;
  if (key === lastKey) return lastValue;
  const { length, strokes } = strokeStats(points);
  const letters = speechLetters(roundMs);
  const raw = clamp(length / 2.5, 0, 4) * .9 + clamp(strokes / 5, 0, 3) * .6 + clamp(letters / 30, 0, 4) * .9;
  lastKey = key; lastValue = clamp(1 - Math.exp(-raw));
  return lastValue;
}
