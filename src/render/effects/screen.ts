import { clamp } from '../../game/motion';
import type { EffectPreset } from './presets';
import { increase } from './presets';
import { smooth } from './frame';

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
export const RELEASE_AT = 17, IMPACT_AT = 18.5;
/** 蓄積が始まる時刻（秒）と、演出が消え終わって元の画面へ戻る時刻（秒）。 */
export const CHARGE_AT = 14, FADE_OUT_AT = 23.5;
/** 命中で世界を止める長さ（秒）。弱、強、とどめの三段。 */
export const HIT_STOPS = { weak: .06, strong: .09, finish: .2 };
/** 完全な暗転の始まりと終わり（秒）。終わりがそのまま放出の閃光につながる。 */
const BLACKOUT_FROM = 16.92, BLACKOUT_TO = RELEASE_AT;
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
 */
export function hitStopOf(preset: EffectPreset, intensity: number, calm = false) {
  if (calm || preset.hitStop <= 0) return 0;
  return intensity >= 3 - 1e-6 ? HIT_STOPS.finish : intensity >= 1.6 ? HIT_STOPS.strong : HIT_STOPS.weak;
}

/** 衝撃の強さ。0〜1。放出と命中で加わり、時間とともに減る。揺れはこの二乗で出す。 */
export function shockAt(t: number, release: number, impact: number) {
  let value = 0;
  if (t >= RELEASE_AT) value += Math.max(0, release - (t - RELEASE_AT) * SHOCK_FADE);
  if (t >= IMPACT_AT) value += Math.max(0, impact - (t - IMPACT_AT) * SHOCK_FADE);
  return clamp(value);
}

/** 画面全体にかかる効果。時刻と設定から決まる純粋な計算。攻撃以外は揺らさない。
 *  入力の量は派手さ（intensityOf）に入っているので、ここでは見ない。6番目の引数は昔の呼び出しのために残してあるだけ。
 *  calm は控えめモード。揺れ、傾き、寄り、停止をなくし、閃光を3分の1にする。 */
export function screenState(t: number, intensity: number, preset: EffectPreset, purpose: string | null, seed = 0, _amount = 0, calm = false): ScreenState {
  const violent = purpose === 'attack' || purpose === null;
  // 攻撃は全部、守りは弱く、それ以外は揺らさない。
  const weight = calm ? 0 : violent ? 1 : purpose === 'defend' ? .3 : 0;
  const shakeMax = increase(preset.shake, intensity, .6) * weight;
  // 放出は小さく、命中は大きい。強さは時間とともに減り、その二乗で揺らす。
  const shock = shockAt(t, .55, 1);
  const power = shock * shock;
  // 最初の一瞬だけ打撃の向きへ押す。放出は上へ、命中は騎士のいる右へ。
  const kickY = t >= RELEASE_AT ? -shakeMax * .45 * Math.max(0, 1 - (t - RELEASE_AT) / .06) : 0;
  const kickX = t >= IMPACT_AT ? shakeMax * .6 * Math.max(0, 1 - (t - IMPACT_AT) / .06) : 0;
  // 0 に丸めるときに符号が残らないよう、0 を足しておく。
  const shakeX = Math.round(wobble(t * SHAKE_HZ, seed + 1) * shakeMax * power + kickX) + 0;
  const shakeY = Math.round(wobble(t * SHAKE_HZ * 1.13, seed + 2) * shakeMax * .8 * power + kickY) + 0;
  // 傾きは最大1度、揺れの拡大は最大1.03倍。どちらも揺れと同じ強さで動く。
  const rotate = wobble(t * SHAKE_HZ * .7, seed + 3) * weight * power;
  const shakeZoom = 1 + (wobble(t * SHAKE_HZ * .8, seed + 4) * .5 + .5) * .03 * weight * power;

  const flashMax = preset.flash * clamp(.4 + intensity * .25, 0, 1) * (calm ? 1 / 3 : 1);
  let flash = 0;
  if (t >= RELEASE_AT) flash = Math.max(flash, flashMax * .55 * Math.max(0, 1 - (t - RELEASE_AT) / .16));
  if (t >= IMPACT_AT) flash = Math.max(flash, flashMax * (violent ? 1 : .5) * Math.max(0, 1 - (t - IMPACT_AT) / .16));
  const darkenMax = preset.darken * clamp(.5 + intensity * .2, 0, 1);
  // 14秒から暗くなり、放出で一度抜け、命中の後にゆっくり戻る。
  const charge = clamp((t - 14) / 1.2), back = clamp((t - IMPACT_AT - .8) / 1.6);
  const darken = t < RELEASE_AT ? darkenMax * charge : darkenMax * (1 - clamp((t - RELEASE_AT) / .25)) * .3 + darkenMax * .45 * clamp((t - RELEASE_AT) / .25) * (1 - back);
  const chromatic = t >= IMPACT_AT && violent && !calm ? increase(preset.chromatic, intensity, .4) * Math.max(0, 1 - (t - IMPACT_AT) / .5) : 0;

  // 溜めの後半でゆっくり1.03倍まで寄り、放出で戻る。命中では1.1倍を0.3秒かけて戻す。
  const closeIn = smooth(clamp((t - 15.5) / 1.5)) * Math.max(0, 1 - clamp((t - RELEASE_AT) / .3));
  const hit = t >= IMPACT_AT ? 1 - clamp((t - IMPACT_AT) / .3) : 0;
  const zoom = calm ? 1 : (1 + .03 * closeIn) * (1 + .1 * hit * hit * (weight ? 1 : .5)) * shakeZoom;
  // 放出の直前だけ全部を消して暗くする。17秒でそのまま閃光へつなぐ。
  const blackout = t >= BLACKOUT_FROM && t < BLACKOUT_TO ? clamp((t - BLACKOUT_FROM) / .04) : 0;
  // 溜めの後半で背景の色を抜き、命中の後にゆっくり戻す。
  const pale = smooth(clamp((t - 15.5) / 1.5)) * (1 - smooth(clamp((t - IMPACT_AT - .3) / 1.5)));
  const saturate = 1 - .4 * pale;

  return { shakeX, shakeY, flash: clamp(flash), darken: clamp(darken), chromatic,
    hitStop: hitStopOf(preset, intensity, calm), rotate, zoom, blackout, saturate };
}

/** 命中の一瞬だけ世界の時計を止める。演出も騎士も術式も同じこの時刻を見る。 */
export function effectTime(t: number, hitStop: number) {
  if (t < IMPACT_AT || hitStop <= 0) return t;
  return IMPACT_AT + Math.max(0, t - IMPACT_AT - hitStop);
}
