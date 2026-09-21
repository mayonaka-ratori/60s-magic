import type { Phase } from './types';

/**
 * 一回分の時刻（ms）。90秒を三回に分けた表の一行にあたる。
 * 秒数は設計仕様の1.3の値をそのまま置いている。勝手に動かさない。
 * 一回目30秒、防御26秒、とどめ34秒。とどめを一番長くして、最後の魔法に余裕を持たせている。
 */
export type Round = {
  id: 'first' | 'defend' | 'finish';
  /** 一回目が1、防御が2、とどめが3。 */
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
  /** とどめの一撃が核へ届く時刻。持たない回は null。回の名前（finish）と混ぜないため別の名前にしてある。 */
  finalBlow: number | null;
  /** 次の場面へ渡す間の始まり。 */
  handoff: number;
  /** 回の終わり。 */
  end: number;
};

export const ROUNDS: Round[] = [
  { id: 'first', index: 1, castId: 'cast-01', start: 0, build: 7000, chant: 14000, inputEnd: 18000, lock: 21000, release: 22000, impact: 23500, finalBlow: null, handoff: 29000, end: 30000 },
  { id: 'defend', index: 2, castId: 'cast-02', start: 30000, build: null, chant: 40000, inputEnd: 45000, lock: 48000, release: 49000, impact: 50400, finalBlow: null, handoff: 55000, end: 56000 },
  { id: 'finish', index: 3, castId: 'cast-03', start: 56000, build: null, chant: 64000, inputEnd: 72000, lock: 75000, release: 76000, impact: 77600, finalBlow: 78500, handoff: 84000, end: 90000 },
];

/** 戦いの終わり。回の表の最後の行から決まる。 */
export const BATTLE_END = ROUNDS[ROUNDS.length - 1].end;
/**
 * とどめの多段命中が当たる時刻。最初の到達（impact）からのずれ（ms）。
 * 77.60、77.76、77.92、78.10秒にあたる。弾の数や属性では変えない。
 * 体力の段、部品の脱落、傷あと、演出がすべてこの一つの表を見る。
 */
export const FINISH_HIT_OFFSETS_MS = [0, 160, 320, 500];
/** とどめの多段命中の時刻（ms）。77600、77760、77920、78100。 */
export const FINISH_HIT_MS = FINISH_HIT_OFFSETS_MS.map(offset => ROUNDS[2].impact + offset);
/**
 * とどめの一撃の時刻（ms）。表に無ければ起動した時点で止める。
 * ここを通ったあとは、騎士も体力の枠もこの一つの値だけを見る。
 */
function finalBlowMs() {
  const finish = ROUNDS[2];
  if (finish.finalBlow === null) throw new Error('とどめの回にとどめの一撃の時刻が無い');
  return finish.finalBlow;
}
export const FINAL_BLOW_MS = finalBlowMs();
/**
 * 騎士が膝をつき始め、体力の枠が消え始める時刻（ms）。とどめの一撃の1.3秒後。
 * 崩れ落ちと枠の消え方をそろえるため、二か所で別々に書かない。
 */
export const FINISH_COLLAPSE_MS = FINAL_BLOW_MS + 1300;
/** 剣を手放して床へ落とす時刻（ms、世界の時刻）。とどめの一撃の0.6秒後。 */
export const FINISH_SWORD_DROP_MS = FINAL_BLOW_MS + 600;
/** 膝をつききるまでの長さ（ms）。ここまで来たら、そのまま倒れ始める。 */
export const FINISH_KNEEL_MS = 1100;
/** 手前へ倒れ始める時刻と、倒れきる時刻（ms、世界の時刻）。崩れ落ちの音も騎士もここを見る。 */
export const FINISH_FALL_FROM_MS = FINISH_COLLAPSE_MS + FINISH_KNEEL_MS;
export const FINISH_FALL_TO_MS = FINISH_FALL_FROM_MS + 1100;
/**
 * 締め切りのあと、声の最後の文字を待てる時間。
 * 一回16秒から18秒の声を「先頭から今まで」聞き直すので、14秒だったころの1.4秒では足りない。
 * MacのGPUでの認識一回分（13秒の声で約1.25秒）に余裕を足した長さ。実機で測って決め直す。
 */
export const SPEECH_WAIT_MS = 2000;
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
  /** とどめの一撃の時刻（秒）。持たない回は null。 */
  finalBlow: number | null;
  /** 防御の回かどうか。敵の一撃を受け止める見せ方に切り替える。 */
  defend: boolean;
  /** とどめの回かどうか。とどめだけの見せ方に切り替える。 */
  finish: boolean;
};
export const beatOf = (round: Round): Beat => ({
  start: round.start / 1000, build: (round.build ?? round.start) / 1000, chant: round.chant / 1000,
  inputEnd: round.inputEnd / 1000, lock: round.lock / 1000, release: round.release / 1000,
  impact: round.impact / 1000, handoff: round.handoff / 1000, end: round.end / 1000,
  finalBlow: round.finalBlow === null ? null : round.finalBlow / 1000,
  defend: round.id === 'defend', finish: round.id === 'finish',
});
export const BEATS = ROUNDS.map(beatOf);
export const beatAt = (t: number) => BEATS.find(beat => t < beat.end) ?? BEATS[BEATS.length - 1];
