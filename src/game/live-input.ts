import type { Point, SpeechEntry } from './types';
import { liveWords, type LiveWord } from './live-words';
import { inputAmount } from './input-amount';
import { enclosingStrokes, type XY } from './guard';

/** 描いている最中に演出へ渡す、いまの入力。魔法の確定前から使える。 */
export type LiveInput = {
  words: LiveWord[]; amount: number; voice: number;
  /** 狙いの印を囲めている筆の数。防御の回だけ数える。 */
  rings: number;
};
export const emptyLive: LiveInput = { words: [], amount: 0, voice: 0, rings: 0 };

/** speechOffsetMs はその回が始まった時刻。声の時刻を戦いの時刻へそろえるために使う。 */
export function liveInput(points: readonly Point[], entries: readonly SpeechEntry[], voice: number, aim: XY | null = null, speechOffsetMs = 0): LiveInput {
  return { words: liveWords(entries, speechOffsetMs), amount: inputAmount(points, entries), voice, rings: aim ? enclosingStrokes(points, aim).length : 0 };
}

/** 言葉だけ空にした複製。発動（17秒）から後は言葉を使わないので、量と声だけを渡す。 */
export function wordless(live: LiveInput): LiveInput {
  return live.words.length ? { ...live, words: [] } : live;
}
