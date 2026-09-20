import type { Phase } from './types';

/**
 * 一回分の時刻（ms）。60秒を三回に分けた表の一行にあたる。
 * 秒数は設計仕様の1.3の値をそのまま置いている。勝手に動かさない。
 * とどめの回（40〜60秒）はまだ作っていないので、この表は二行で止めてある。
 */
export type Round = {
  id: 'first' | 'defend';
  /** 一回目が1、防御が2。 */
  index: number;
  castId: string;
  /** 入力の受付を始める時刻。 */
  start: number;
  /** 線が残り始める合図。一回目だけ持ち、防御は最初から残る。 */
  build: number | null;
  /** 詠唱の案内を出す時刻。 */
  chant: number;
  /** 描画と声の締め切り。 */
  inputEnd: number;
  /** 魔法の内容を固定する時刻。 */
  lock: number;
  /** 発動。 */
  release: number;
  /** 敵へ届く、または敵の一撃が盾へ当たる時刻。 */
  impact: number;
  /** 次の場面へ渡す間の始まり。 */
  handoff: number;
  /** 回の終わり。 */
  end: number;
};

export const ROUNDS: Round[] = [
  { id: 'first', index: 1, castId: 'cast-01', start: 0, build: 6000, chant: 11000, inputEnd: 14000, lock: 16000, release: 17000, impact: 18500, handoff: 23000, end: 24000 },
  { id: 'defend', index: 2, castId: 'cast-02', start: 24000, build: null, chant: 28000, inputEnd: 31000, lock: 33000, release: 34000, impact: 35400, handoff: 39000, end: 40000 },
];

/** 今作ってあるところまでの終わり。とどめの回を足すと60000になる。 */
export const BATTLE_END = ROUNDS[ROUNDS.length - 1].end;
/** 締め切りのあと、声の最後の文字を待てる時間。MacのGPUでの認識一回分が入る長さ。 */
export const SPEECH_WAIT_MS = 1400;
/** 声を待つのをやめ、Jevへ送る時刻。声が先に届けばもっと早く送る。 */
export const speechLimitOf = (round: Round) => round.inputEnd + SPEECH_WAIT_MS;
/** Jevの返事を受け取れる最後の時刻。確定の手前で必ず打ち切る。 */
export const replyLimitOf = (round: Round) => round.lock - 100;
/** その時刻に進んでいる回。終わった後は最後の回を返す。 */
export const roundAt = (ms: number) => ROUNDS.find(round => ms < round.end) ?? ROUNDS[ROUNDS.length - 1];

export function phaseAt(ms: number, round: Round = ROUNDS[0]): Phase {
  if (ms < round.start) return 'ready';
  if (round.build !== null && ms < round.build) return 'draw';
  if (ms < round.chant) return round.build === null ? 'draw' : 'build';
  if (ms < round.inputEnd) return 'chant';
  if (ms < round.release) return 'complete';
  if (ms < round.handoff) return 'release';
  if (ms < round.end) return 'handoff';
  return 'finished';
}

/**
 * 演出が見る秒の時刻。同じ表を秒に直しただけで、中身は変わらない。
 * 演出の部品はここからの相対で描き、「17秒」のような数字を埋め込まない。
 */
export type Beat = {
  start: number; build: number; chant: number; inputEnd: number; lock: number;
  release: number; impact: number; handoff: number; end: number;
  /** 防御の回かどうか。敵の一撃を受け止める見せ方に切り替える。 */
  defend: boolean;
};
export const beatOf = (round: Round): Beat => ({
  start: round.start / 1000, build: (round.build ?? round.start) / 1000, chant: round.chant / 1000,
  inputEnd: round.inputEnd / 1000, lock: round.lock / 1000, release: round.release / 1000,
  impact: round.impact / 1000, handoff: round.handoff / 1000, end: round.end / 1000, defend: round.id === 'defend',
});
export const BEATS = ROUNDS.map(beatOf);
export const beatAt = (t: number) => BEATS.find(beat => t < beat.end) ?? BEATS[BEATS.length - 1];
