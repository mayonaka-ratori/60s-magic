import { clamp } from '../../game/motion';
import type { EffectPreset } from './presets';
import { increase } from './presets';
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
/** 完全な暗転の長さ（秒）。放出の直前に置き、終わりがそのまま閃光につながる。 */
export const BLACKOUT_SECONDS = .08;
export const BLACKOUT_FROM = RELEASE_AT - BLACKOUT_SECONDS, BLACKOUT_TO = RELEASE_AT;
/** 衝撃の強さが1秒で減る量。 */
const SHOCK_FADE = 1.6;
/** 揺れの速さ（1秒あたりの波の数）。 */
const SHAKE_HZ = 19;

const smooth = (x: number) => x * x * (3 - 2 * x);
/** 種と番号から決まる0〜1の値。時刻が同じなら必ず同じ。 */
const spot = (i: number, seed: number) => { const s = Math.sin(i * 12.9898 + seed * 78.233 + 1.7) * 43758.5453; return s - Math.floor(s); };
/** なめらかな乱数。-1〜1。隣り合う値をなめらかにつなぐので、震えが安っぽくならない。 */
export function wobble(x: number, seed: number) {
  const i = Math.floor(x), f = smooth(x - i);
  const a = spot(i, seed), b = spot(i + 1, seed);
  return (a + (b - a) * f) * 2 - 1;
}

/**
 * 命中で止める長さ。派手さと入力の量で弱、強、とどめの三段に分かれる。
 * 防御の回は敵の一撃を受け止める一回だけなので、いつでも「強」にする。
 */
export function hitStopOf(preset: EffectPreset, intensity: number, amount = 0, calm = false, beat: Beat = BEATS[0]) {
  if (calm || preset.hitStop <= 0) return 0;
  if (beat.defend) return HIT_STOPS.strong;
  const power = intensity + clamp(amount);
  return power >= 3 ? HIT_STOPS.finish : power >= 1.6 ? HIT_STOPS.strong : HIT_STOPS.weak;
}

/** 衝撃の強さ。0〜1。放出と命中で加わり、時間とともに減る。揺れはこの二乗で出す。 */
export function shockAt(t: number, release: number, impact: number, beat: Beat = BEATS[0]) {
  let value = 0;
  if (t >= beat.release) value += Math.max(0, release - (t - beat.release) * SHOCK_FADE);
  if (t >= beat.impact) value += Math.max(0, impact - (t - beat.impact) * SHOCK_FADE);
  return clamp(value);
}

/** 画面全体にかかる効果。時刻と設定から決まる純粋な計算。攻撃以外は揺らさない。
 *  amount は入力の量（0〜1、省略可）。多いほど暗転が深く、放出の揺れが強くなる。
 *  calm は控えめモード。揺れ、傾き、寄り、停止をなくし、閃光を3分の1にする。 */
export function screenState(t: number, intensity: number, preset: EffectPreset, purpose: string | null, seed = 0, amount = 0, calm = false, beat: Beat = BEATS[0]): ScreenState {
  const violent = purpose === 'attack' || purpose === null;
  const input = clamp(amount);
  // 攻撃は全部、守りは弱く、それ以外は揺らさない。
  // 防御の回だけは、揺らすのが敵の一撃なので、作った魔法の用途にかかわらず揺らす。
  const weight = calm ? 0 : beat.defend ? 1 : violent ? 1 : purpose === 'defend' ? .3 : 0;
  const shakeMax = increase(preset.shake, intensity, .6) * weight;
  // 放出は小さく、命中は大きい。強さは時間とともに減り、その二乗で揺らす。
  const shock = shockAt(t, .55 * (1 + input * .3), 1, beat);
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

  const flashMax = preset.flash * clamp(.4 + intensity * .25, 0, 1) * (calm ? 1 / 3 : 1);
  let flash = 0;
  if (t >= beat.release) flash = Math.max(flash, flashMax * .55 * Math.max(0, 1 - (t - beat.release) / .16));
  if (t >= beat.impact) flash = Math.max(flash, flashMax * (beat.defend ? .85 : violent ? 1 : .5) * Math.max(0, 1 - (t - beat.impact) / .16));
  const darkenMax = preset.darken * clamp(.5 + intensity * .2, 0, 1) * (1 + input * .4);
  // 締め切りから暗くなり、放出で一度抜け、命中の後にゆっくり戻る。
  const charge = clamp((t - beat.inputEnd) / 1.2), back = clamp((t - beat.impact - .8) / 1.6);
  const darken = t < beat.release ? darkenMax * charge : darkenMax * (1 - clamp((t - beat.release) / .25)) * .3 + darkenMax * .45 * clamp((t - beat.release) / .25) * (1 - back);
  const chromatic = t >= beat.impact && (violent || beat.defend) && !calm ? increase(preset.chromatic, intensity, .4) * Math.max(0, 1 - (t - beat.impact) / .5) : 0;

  // 溜めの後半でゆっくり1.03倍まで寄り、放出で戻る。命中では1.1倍を0.3秒かけて戻す。
  const closeIn = smooth(clamp((t - (beat.release - 1.5)) / 1.5)) * Math.max(0, 1 - clamp((t - beat.release) / .3));
  const hit = t >= beat.impact ? 1 - clamp((t - beat.impact) / .3) : 0;
  const zoom = calm ? 1 : (1 + .03 * closeIn) * (1 + .1 * hit * hit * (weight ? 1 : .5)) * shakeZoom;
  // 放出の直前だけ全部を消して暗くする。発動の時刻でそのまま閃光へつなぐ。
  const blackout = t >= beat.release - BLACKOUT_SECONDS && t < beat.release ? clamp((t - (beat.release - BLACKOUT_SECONDS)) / .04) : 0;
  // 溜めの後半で背景の色を抜き、命中の後にゆっくり戻す。
  const pale = smooth(clamp((t - (beat.release - 1.5)) / 1.5)) * (1 - smooth(clamp((t - beat.impact - .3) / 1.5)));
  const saturate = 1 - .4 * pale;

  return { shakeX, shakeY, flash: clamp(flash), darken: clamp(darken), chromatic,
    hitStop: hitStopOf(preset, intensity, input, calm, beat), rotate, zoom, blackout, saturate };
}

/** 命中の一瞬だけ世界の時計を止める。演出も騎士も術式も同じこの時刻を見る。 */
export function effectTime(t: number, hitStop: number, beat: Beat = BEATS[0]) {
  if (t < beat.impact || hitStop <= 0) return t;
  return beat.impact + Math.max(0, t - beat.impact - hitStop);
}
