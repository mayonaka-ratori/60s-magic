import type { SpeechEntry, Element } from './types';

/** 認識の途中結果も含めて、いま聞こえている言葉。蓄積の演出が即時に反応するために使う。 */
export type LiveWord = {
  id: number; text: string;
  /** 属性の言葉なら属性、それ以外は null */
  element: Element | null;
  kind: 'element' | 'form' | 'purpose' | 'count' | 'change' | 'other';
  count: number | null;
  atMs: number; final: boolean;
};

/** 音声の記録から、演出が反応すべき言葉を取り出す。（担当A が実装。今は空） */
export function liveWords(_entries: readonly SpeechEntry[]): LiveWord[] { return []; }
