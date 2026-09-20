import type { Point, SpeechEntry } from './types';
import { liveWords, type LiveWord } from './live-words';
import { inputAmount } from './input-amount';

/** 描いている最中に演出へ渡す、いまの入力。魔法の確定前から使える。 */
export type LiveInput = { words: LiveWord[]; amount: number; voice: number };
export const emptyLive: LiveInput = { words: [], amount: 0, voice: 0 };

export function liveInput(points: readonly Point[], entries: readonly SpeechEntry[], voice: number): LiveInput {
  return { words: liveWords(entries), amount: inputAmount(points, entries), voice };
}

/** 言葉だけ空にした複製。発動（17秒）から後は言葉を使わないので、量と声だけを渡す。 */
export function wordless(live: LiveInput): LiveInput {
  return live.words.length ? { ...live, words: [] } : live;
}
