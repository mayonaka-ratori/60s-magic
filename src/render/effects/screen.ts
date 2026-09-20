import { clamp } from '../../game/motion';
import type { EffectPreset } from './presets';
import { increase } from './presets';
import { smooth } from './frame';
import { BEATS, type Beat } from '../../game/rounds';

export type ScreenState = {
  shakeX: number; shakeY: number; flash: number; darken: number; chromatic: number; hitStop: number;
  /** 画面の傾き（度）。揺れと一緒に使う */
  rotate: number;
  /** 画面の寄り。1が等倍 */
  zoom: number;
  /** 放出直前の完全な暗転。0〜1 */
  blackout: number;
  /** 背景の彩度。1が通常、0で白黒 */
  saturate: number;
};
/** 一回目の発動と命中の時刻（秒）。回ごとの値は rounds.ts の表から来る。 */
export const RELEASE_AT = BEATS[0].release, IMPACT_AT = BEATS[0].impact;
/** 命中で世界を止める長さ（秒）。弱、強、とどめの三段。 */
export const HIT_STOPS = { weak: .06, strong: .09, finish: .2 };
/** とどめの回で世界を止める長さ（秒）。一発目の命中と、とどめの一撃の2回だけ。本人の魔法では変えない。 */
export const FINISH_STOPS = { impact: .10, finalBlow: .25 };
/** とどめの一撃のあとのスロー。一撃から0.3秒後（世界の時刻）に、実際の0.5秒を0.25倍の速さで見せる。 */
export const FINISH_SLOW = { after: .3, seconds: .5, rate: .25 };
/** 世界の時計の決まり。止めは3回まで、遅れの合計は0.8秒まで。余韻が削られないように守る。 */
export const WARP_LIMITS = { stops: 3, delay: .8 };
/** とどめの一撃で足す傾き（度）と寄り。全画面の白と一緒に、一撃の重さを出す。 */
export const FINISH_TILT = 2, FINISH_ZOOM = 1.2;
/** 完全な暗転の長さ（秒）。放出の直前に置き、終わりがそのまま閃光につながる。 */
export const BLACKOUT_SECONDS = .08;
export const BLACKOUT_FROM = RELEASE_AT - BLACKOUT_SECONDS, BLACKOUT_TO = RELEASE_AT;
/** 衝撃の強さが1秒で減る量。 */
const SHOCK_FADE = 1.6;
/** 揺れの速さ（1秒あたりの波の数）。 */
const SHAKE_HZ = 19;

/** 種と番号から決まる0〜1の値。時刻が同じなら必ず同じ。 */
const spot = (i: number, seed: number) => { const s = Math.sin(i * 12.9898 + seed * 78.233 + 1.7) * 43758.5453; return s - Math.floor(s); };
/** なめらかな乱数。-1〜1。隣り合う値をなめらかにつなぐので、震えが安っぽくならない。 */
export function wobble(x: number, seed: number) {
  const i = Math.floor(x), f = smooth(x - i);
  const a = spot(i, seed), b = spot(i + 1, seed);
  return (a + (b - a) * f) * 2 - 1;
}

/**
 * 命中で止める長さ。派手さだけで弱、強、とどめの三段に分かれる。
 * 入力の量は派手さ（intensityOf）の中で効くので、ここでは足さない。とどめは派手さが上限の3のときだけ。
 * 防御の回は敵の一撃を受け止める一回だけなので、いつでも「強」にする。
 */
export function hitStopOf(preset: EffectPreset, intensity: number, calm = false, beat: Beat = BEATS[0]) {
  if (calm || preset.hitStop <= 0) return 0;
  if (beat.defend) return HIT_STOPS.strong;
  return intensity >= 3 - 1e-6 ? HIT_STOPS.finish : intensity >= 1.6 ? HIT_STOPS.strong : HIT_STOPS.weak;
}

/** 衝撃の強さ。0〜1。放出と命中で加わり、時間とともに減る。揺れはこの二乗で出す。 */
export function shockAt(t: number, release: number, impact: number, beat: Beat = BEATS[0]) {
  let value = 0;
  if (t >= beat.release) value += Math.max(0, release - (t - beat.release) * SHOCK_FADE);
  if (t >= beat.impact) value += Math.max(0, impact - (t - beat.impact) * SHOCK_FADE);
  return clamp(value);
}

/** 画面全体にかかる効果。時刻と設定から決まる純粋な計算。攻撃以外は揺らさない。
 *  入力の量は派手さ（intensityOf）に入っているので、ここでは見ない。6番目の引数は昔の呼び出しのために残してあるだけ。
 *  calm は控えめモード。揺れ、傾き、寄り、停止をなくし、閃光を3分の1にする。 */
export function screenState(t: number, intensity: number, preset: EffectPreset, purpose: string | null, seed = 0, _amount = 0, calm = false, beat: Beat = BEATS[0]): ScreenState {
  const violent = purpose === 'attack' || purpose === null;
  // 攻撃は全部、守りは弱く、それ以外は揺らさない。
  // 防御の回だけは、揺らすのが敵の一撃なので、作った魔法の用途にかかわらず揺らす。
  const weight = calm ? 0 : beat.defend ? 1 : violent ? 1 : purpose === 'defend' ? .3 : 0;
  const shakeMax = increase(preset.shake, intensity, .6) * weight;
  // 放出は小さく、命中は大きい。強さは時間とともに減り、その二乗で揺らす。
  const shock = shockAt(t, .55, 1, beat);
  const power = shock * shock;
  // 最初の一瞬だけ打撃の向きへ押す。放出は上へ、命中は騎士のいる右へ。
  // 防御の回は、奥から手前へ押されるので下向きにする。
  const kickY = (t >= beat.release ? -shakeMax * .45 * Math.max(0, 1 - (t - beat.release) / .06) : 0)
    + (beat.defend && t >= beat.impact ? shakeMax * .55 * Math.max(0, 1 - (t - beat.impact) / .06) : 0);
  const kickX = !beat.defend && t >= beat.impact ? shakeMax * .6 * Math.max(0, 1 - (t - beat.impact) / .06) : 0;
  // 0 に丸めるときに符号が残らないよう、0 を足しておく。
  const shakeX = Math.round(wobble(t * SHAKE_HZ, seed + 1) * shakeMax * power + kickX) + 0;
  const shakeY = Math.round(wobble(t * SHAKE_HZ * 1.13, seed + 2) * shakeMax * .8 * power + kickY) + 0;
  // 傾きは最大1度、揺れの拡大は最大1.03倍。どちらも揺れと同じ強さで動く。
  const rotate = wobble(t * SHAKE_HZ * .7, seed + 3) * weight * power;
  const shakeZoom = 1 + (wobble(t * SHAKE_HZ * .8, seed + 4) * .5 + .5) * .03 * weight * power;

  // とどめの一撃の時刻。ほかの回は null なので、ここから下の足し算は何も起こらない（値は今までと同じまま）。
  const finalBlow = beat.finish ? beat.finalBlow : null;
  // 一撃からの強さ。0.3秒で0へ戻る。傾きと寄りに使う。
  const blow = finalBlow !== null && t >= finalBlow ? Math.max(0, 1 - (t - finalBlow) / .3) : 0;
  const flashMax = preset.flash * clamp(.4 + intensity * .25, 0, 1) * (calm ? 1 / 3 : 1);
  let flash = 0;
  if (t >= beat.release) flash = Math.max(flash, flashMax * .55 * Math.max(0, 1 - (t - beat.release) / .16));
  if (t >= beat.impact) flash = Math.max(flash, flashMax * (beat.defend ? .85 : violent || beat.finish ? 1 : .5) * Math.max(0, 1 - (t - beat.impact) / .16));
  // とどめの一撃だけは、全画面の白をいっぱいまで出す。
  if (finalBlow !== null && t >= finalBlow) flash = Math.max(flash, flashMax * Math.max(0, 1 - (t - finalBlow) / .16));
  const darkenMax = preset.darken * clamp(.5 + intensity * .2, 0, 1);
  // 締め切りから暗くなり、放出で一度抜け、命中の後にゆっくり戻る。
  const charge = clamp((t - beat.inputEnd) / 1.2), back = clamp((t - beat.impact - .8) / 1.6);
  const darken = t < beat.release ? darkenMax * charge : darkenMax * (1 - clamp((t - beat.release) / .25)) * .3 + darkenMax * .45 * clamp((t - beat.release) / .25) * (1 - back);
  let chromatic = t >= beat.impact && (violent || beat.defend || beat.finish) && !calm ? increase(preset.chromatic, intensity, .4) * Math.max(0, 1 - (t - beat.impact) / .5) : 0;
  // とどめの一撃では、色のずれを一撃の時刻から出し直す。端ほど強くするのは合成側が受け持つ。
  if (finalBlow !== null && t >= finalBlow && !calm)
    chromatic = Math.max(chromatic, increase(preset.chromatic, intensity, .4) * Math.max(0, 1 - (t - finalBlow) / .5));

  // 溜めの後半でゆっくり1.03倍まで寄り、放出で戻る。命中では1.1倍を0.3秒かけて戻す。
  const closeIn = smooth(clamp((t - (beat.release - 1.5)) / 1.5)) * Math.max(0, 1 - clamp((t - beat.release) / .3));
  const hit = t >= beat.impact ? 1 - clamp((t - beat.impact) / .3) : 0;
  // とどめの一撃では、傾き2度と寄り1.2倍を足す。控えめモードでは足さない。
  const zoom = calm ? 1 : (1 + .03 * closeIn) * (1 + .1 * hit * hit * (weight ? 1 : .5)) * shakeZoom * (1 + (FINISH_ZOOM - 1) * blow);
  // 放出の直前だけ全部を消して暗くする。発動の時刻でそのまま閃光へつなぐ。
  const blackout = t >= beat.release - BLACKOUT_SECONDS && t < beat.release ? clamp((t - (beat.release - BLACKOUT_SECONDS)) / .04) : 0;
  // 溜めの後半で背景の色を抜き、命中の後にゆっくり戻す。
  const pale = smooth(clamp((t - (beat.release - 1.5)) / 1.5)) * (1 - smooth(clamp((t - beat.impact - .3) / 1.5)));
  const saturate = 1 - .4 * pale;

  return { shakeX, shakeY, flash: clamp(flash), darken: clamp(darken), chromatic,
    hitStop: hitStopOf(preset, intensity, calm, beat), rotate: rotate + (calm ? 0 : FINISH_TILT * blow), zoom, blackout, saturate };
}

/**
 * 世界の時計のゆがみ。止めとスローを、どちらも世界の時刻に置き、長さは実際の秒数で持つ。
 * stops は時刻の順に並べる。slow は無いときは null。
 */
export type TimeWarp = {
  stops: Array<{ at: number; hold: number }>;
  slow: { from: number; seconds: number; rate: number } | null;
};

/**
 * 実際の時刻から世界の時刻を出す。止めの間は世界が進まず、スローの間は rate 倍の速さで進む。
 * 時刻だけで決まる計算で、逆戻りはしない。長さが0の出来事は無いものとして飛ばす。
 */
export function warpTime(t: number, warp: TimeWarp) {
  const events = [...warp.stops.map(stop => ({ at: stop.at, seconds: stop.hold, rate: 0 }))];
  if (warp.slow) events.push({ at: warp.slow.from, seconds: warp.slow.seconds, rate: warp.slow.rate });
  events.sort((a, b) => a.at - b.at);
  // 遅れ（delay）は、その出来事までに世界が実際より遅れた秒数。
  let delay = 0, last: { at: number; seconds: number; rate: number } | null = null, lastStart = 0;
  for (const event of events) {
    if (event.seconds <= 0) continue;
    const start = event.at + delay;
    if (t <= start) break;
    const used = t - start;
    // まだこの出来事の途中。止めなら置いた時刻のまま、スローなら rate 倍だけ進む。
    if (used < event.seconds) return event.at + event.rate * used;
    delay += (1 - event.rate) * event.seconds;
    last = event; lastStart = start;
  }
  if (!last) return t;
  return last.at + last.rate * last.seconds + (t - lastStart - last.seconds);
}

/**
 * その回のゆがみ。一回目と防御は命中の一回だけ止める。
 * とどめは一発目の命中ととどめの一撃で止め、そのあとスローにする。中身は本人の魔法では変えない。
 * 控えめモードでは hitStop が0で来るので、そのときだけ止めをなくす（スローは残す）。
 */
export function warpOf(beat: Beat = BEATS[0], hitStop = 0): TimeWarp {
  if (beat.finish && beat.finalBlow !== null) {
    const hold = hitStop > 0 ? 1 : 0;
    return {
      stops: [{ at: beat.impact, hold: FINISH_STOPS.impact * hold }, { at: beat.finalBlow, hold: FINISH_STOPS.finalBlow * hold }],
      slow: { from: beat.finalBlow + FINISH_SLOW.after, seconds: FINISH_SLOW.seconds, rate: FINISH_SLOW.rate },
    };
  }
  return { stops: [{ at: beat.impact, hold: hitStop }], slow: null };
}

/** 実際の時刻から世界の時刻を出す。演出も騎士も術式も同じこの時刻を見る。 */
export function effectTime(t: number, hitStop: number, beat: Beat = BEATS[0]) {
  return warpTime(t, warpOf(beat, hitStop));
}
