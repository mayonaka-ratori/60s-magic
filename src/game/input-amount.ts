import type { Point, SpeechEntry } from './types';

/** 入力の量。0〜1。線の長さと筆の数、言葉の数で増える。蓄積の粒や魔法陣の枚数に効く。（担当C が実装。今は0） */
export function inputAmount(_points: readonly Point[], _entries: readonly SpeechEntry[]): number { return 0; }
