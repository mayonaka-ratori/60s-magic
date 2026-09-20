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

export function liveInput(points: readonly Point[], entries: readonly SpeechEntry[], voice: number, aim: XY | null = null): LiveInput {
  return { words: liveWords(entries), amount: inputAmount(points, entries), voice, rings: aim ? enclosingStrokes(points, aim).length : 0 };
}
