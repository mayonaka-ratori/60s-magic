import type { Phase } from './types';

/**
 * 一回分の時刻（ms）。90秒を三回に分けた表の一行にあたる。
 * 「順番に」は専用の設計の5章、「同時に」は設計仕様の1.3の表を使う。勝手に動かさない。
 */
export type Round = {
  id: 'first' | 'defend' | 'finish';
  /** 一回目が1、防御が2、とどめが3。 */
  index: number;
  castId: string;
  /** 入力の受付を始める時刻。 */
  start: number;
  /** 線が残り始める合図。無いときは、この合図を出さない。 */
  build: number | null;
  /** 詠唱の案内を出す時刻。 */
  chant: number | null;
  /** 手の締め切り。無い回は手を受け付けない。 */
  drawEnd: number | null;
  /** 声の受付開始。無い回は声を受け付けない。 */
  voiceStart: number | null;
  /** 入力全体の締め切り。 */
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

export type Flow = 'sequential' | 'together';
/** ページを開いたときだけ選ぶ。サーバーも同じ表を読めるよう、URLが無い場合を扱う。 */
export const flowOf = (search: string): Flow => new URLSearchParams(search).get('flow') === 'together' ? 'together' : 'sequential';
/** URLを持たない確認用の道具は従来の表を読む。サーバーの受け皿は両方の表から作る。 */
export const FLOW: Flow = typeof location === 'undefined' ? 'together' : flowOf(location.search);

export const TOGETHER_ROUNDS: Round[] = [
  { id: 'first', index: 1, castId: 'cast-01', start: 0, drawEnd: 18000, voiceStart: 0, build: 7000, chant: 14000, inputEnd: 18000, lock: 21000, release: 22000, impact: 23500, finalBlow: null, handoff: 29000, end: 30000 },
  { id: 'defend', index: 2, castId: 'cast-02', start: 30000, drawEnd: 45000, voiceStart: 30000, build: null, chant: 40000, inputEnd: 45000, lock: 48000, release: 49000, impact: 50400, finalBlow: null, handoff: 55000, end: 56000 },
  { id: 'finish', index: 3, castId: 'cast-03', start: 56000, drawEnd: 72000, voiceStart: 56000, build: null, chant: 64000, inputEnd: 72000, lock: 75000, release: 76000, impact: 77600, finalBlow: 78500, handoff: 84000, end: 90000 },
];

/** 順番に遊ぶ時刻。手と声の受付も、この表から作る。 */
export const SEQUENTIAL_ROUNDS: Round[] = [
  { id: 'first', index: 1, castId: 'cast-01', start: 0, drawEnd: null, voiceStart: 0, build: null, chant: null, inputEnd: 14000, lock: 17000, release: 18000, impact: 19500, finalBlow: null, handoff: 24000, end: 26000 },
  { id: 'defend', index: 2, castId: 'cast-02', start: 26000, drawEnd: 38000, voiceStart: null, build: 26000, chant: null, inputEnd: 38000, lock: 40000, release: 41000, impact: 42400, finalBlow: null, handoff: 46000, end: 50000 },
  { id: 'finish', index: 3, castId: 'cast-03', start: 50000, drawEnd: 62000, voiceStart: 62000, build: 50000, chant: 62000, inputEnd: 72000, lock: 75000, release: 76000, impact: 77600, finalBlow: 78500, handoff: 84000, end: 90000 },
];
export const ROUNDS = FLOW === 'together' ? TOGETHER_ROUNDS : SEQUENTIAL_ROUNDS;

/**
 * 一回目の受付中に、騎士が自分から動く時刻（ms）。足を踏み替える（step）、盾を打ち鳴らす（clang）。
 * 画面の揺れ、騎士の動き、効果音がこの一つの表を見る。案内の音（build、chant の時刻）と重ねない。
 */
export const ENEMY_MOVES: ReadonlyArray<{ at: number; kind: 'step' | 'clang' }> = [{ at: 3500, kind: 'step' }, { at: 9500, kind: 'clang' }];
/** 防御の回で、騎士が溜めの姿勢に入る時刻（ms）。ここから振り下ろしまで、画面が低く震え続ける。 */
export const ENEMY_CHARGE_FROM_MS = ROUNDS[1].start + 200;
/** 防御の回で、振り下ろした剣が床を打つ時刻（ms）。振り下ろし（lock）の0.55秒後。床の亀裂、塵、下向きの大きな揺れ、音がここに揃う。 */
export const ENEMY_SLAM_MS = ROUNDS[1].lock + 550;

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
 * 一回分の声を「先頭から今まで」聞き直すので、以前の1.4秒では足りない。
 * MacのGPUでの認識一回分（13秒の声で約1.25秒）に余裕を足した長さ。実機で測って決め直す。
 */
export const SPEECH_WAIT_MS = 2000;
/**
 * サーバーが受け付ける、声を待つ時間の上限（ms）。画面側の値より少しだけ広く取る。
 * 画面側が長すぎる値を送ってきても、ここで頭を押さえる。
 */
export const SPEECH_WAIT_MAX_MS = SPEECH_WAIT_MS + 1000;
/** その回の受付の長さ（ms）。マイクの打ち切りも音の受け皿の大きさも、この値から作る。 */
export const windowMsOf = (round: Round) => round.inputEnd - round.start;
/** 両方の表でいちばん長い受付（ms）。受け皿の大きさと接続の上限はここから作る。 */
export const MAX_INPUT_MS = Math.max(...[...TOGETHER_ROUNDS, ...SEQUENTIAL_ROUNDS].map(windowMsOf));
/** 16kHzで受け取るので、1msあたり16点。受け皿の大きさを点の数で書くときに使う。 */
export const SAMPLES_PER_MS = 16;
/** 音の受け皿に入る点の数の上限。いちばん長い受付の分だけ持つ。 */
export const MAX_INPUT_SAMPLES = MAX_INPUT_MS * SAMPLES_PER_MS;
/** 準備の合図の長さ（ms）。90秒には含めない。一回目はこの前に音声認識へつなぐ。 */
export const COUNTDOWN_MS = 3000;
/** 順番に遊ぶ合図。読める間と消えていく間を、表示側も同じ表から使う。 */
export const ANNOUNCEMENT_HOLD_MS = 1500;
export const ANNOUNCEMENT_FADE_MS = 500;
export const ANNOUNCEMENT_MS = ANNOUNCEMENT_HOLD_MS + ANNOUNCEMENT_FADE_MS;
/** 同時に遊ぶ場合の幕の長さ。従来の表示を保つ。 */
export const TOGETHER_ANNOUNCEMENT_MS = 800;
/** 声の受付開始より前に、接続を準備する長さ（ms）。 */
export const VOICE_RECONNECT_MS = 2500;
/**
 * 音声認識の接続を保てる上限（ms）。画面側が閉じ忘れたときの受け皿で、
 * 受付が終わる前に切れてはいけない。受付の前につなぐ分と、最後の声を待つ分に余裕を足す。
 */
export const speechSocketMsOf = (windowMs: number = MAX_INPUT_MS) =>
  Math.max(COUNTDOWN_MS, VOICE_RECONNECT_MS) + windowMs + SPEECH_WAIT_MS + 5000;
/** 声を待つのをやめ、Jevへ送る時刻。声が先に届けばもっと早く送る。 */
export const speechLimitOf = (round: Round) => round.inputEnd + (round.voiceStart === null ? 0 : SPEECH_WAIT_MS);
/** 入力を締めてから、Jevへ送れる最初の時刻。 */
export const interpretAtOf = (round: Round) => round.inputEnd + 100;
/** Jevの返事を受け取れる最後の時刻。確定の手前で必ず打ち切る。 */
export const replyLimitOf = (round: Round) => round.lock - 100;
/**
 * 盾で受け止めきった騎士がよろめく時刻（ms）。一撃が盾に当たってから2.1秒後。
 * 兜の角が折れる瞬間（knight.ts）と体力が減る段（health-bar.ts）と画面の揺れ（main.ts）は
 * 同じ一瞬なので、数字はここだけに置く。別々に持つと、片方を直したときにずれる。
 */
export const GUARD_STAGGER_MS = ROUNDS[1].impact + 2100;
/** その時刻に進んでいる回。終わった後は最後の回を返す。 */
export const roundAt = (ms: number) => ROUNDS.find(round => ms < round.end) ?? ROUNDS[ROUNDS.length - 1];

export const acceptsDrawing = (round: Round, ms: number) => round.drawEnd !== null && ms >= round.start && ms < round.drawEnd;
export const acceptsVoice = (round: Round, ms: number) => round.voiceStart !== null && ms >= round.voiceStart && ms < round.inputEnd;
/** 声だけの一回目は手を追う点だけ見せる。とどめは描く締め切りで消す。 */
export const showsCursor = (round: Round, ms: number) => ms >= round.start && ms < (round.drawEnd ?? round.inputEnd);
export const voiceConnectAt = (round: Round) => round.voiceStart === null ? null : round.voiceStart - VOICE_RECONNECT_MS;

export function phaseAt(ms: number, round: Round = ROUNDS[0]): Phase {
  if (ms < round.start) return 'ready';
  if (ms < round.inputEnd) {
    if ((round.drawEnd === null || (round.voiceStart !== null && round.voiceStart > round.start)) && acceptsVoice(round,ms)) return 'chant';
    if (round.build !== null && ms < round.build) return 'draw';
    if (round.chant === null || ms < round.chant) return round.build === null || round.build === round.start ? 'draw' : 'build';
    return 'chant';
  }
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
  start: number; build: number; chant: number; drawEnd: number | null; voiceStart: number | null; inputEnd: number; lock: number;
  release: number; impact: number; handoff: number; end: number;
  /** とどめの一撃の時刻（秒）。持たない回は null。 */
  finalBlow: number | null;
  /** 防御の回かどうか。敵の一撃を受け止める見せ方に切り替える。 */
  defend: boolean;
  /** とどめの回かどうか。とどめだけの見せ方に切り替える。 */
  finish: boolean;
};
export const beatOf = (round: Round): Beat => ({
  start: round.start / 1000, build: (round.build ?? round.start) / 1000, chant: (round.chant ?? round.inputEnd) / 1000,
  drawEnd: round.drawEnd === null ? null : round.drawEnd / 1000, voiceStart: round.voiceStart === null ? null : round.voiceStart / 1000,
  inputEnd: round.inputEnd / 1000, lock: round.lock / 1000, release: round.release / 1000,
  impact: round.impact / 1000, handoff: round.handoff / 1000, end: round.end / 1000,
  finalBlow: round.finalBlow === null ? null : round.finalBlow / 1000,
  defend: round.id === 'defend', finish: round.id === 'finish',
});
export const BEATS = ROUNDS.map(beatOf);
export const beatAt = (t: number) => BEATS.find(beat => t < beat.end) ?? BEATS[BEATS.length - 1];
