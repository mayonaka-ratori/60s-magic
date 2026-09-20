import { clamp } from '../../game/motion';
import type { EffectPreset } from './presets';
import { increase } from './presets';

export type ScreenState = { shakeX: number; shakeY: number; flash: number; darken: number; chromatic: number; hitStop: number };
export const RELEASE_AT = 17, IMPACT_AT = 18.5;

/** 画面全体にかかる効果。時刻と設定から決まる純粋な計算。攻撃以外は揺らさない。
 *  amount は入力の量（0〜1、省略可）。多いほど暗転が深く、放出の揺れが強くなる。 */
export function screenState(t: number, intensity: number, preset: EffectPreset, purpose: string | null, seed = 0, amount = 0): ScreenState {
  const violent = purpose === 'attack' || purpose === null;
  const input = clamp(amount);
  const shakeMax = increase(preset.shake, intensity, .6) * (violent ? 1 : purpose === 'defend' ? .3 : 0);
  let shake = 0, kickX = 0, kickY = 0;
  // 放出は小さく、命中は大きく。放出の最初の一瞬だけ向きを持たせる。
  if (t >= RELEASE_AT && t < RELEASE_AT + .5) { const u = (t - RELEASE_AT) / .5, push = 1 + input * .5; shake = shakeMax * .45 * push * (1 - u) * (1 - u); kickY = -shakeMax * .3 * push * Math.max(0, 1 - u * 6); }
  if (t >= IMPACT_AT && t < IMPACT_AT + .7) { const u = (t - IMPACT_AT) / .7; shake = Math.max(shake, shakeMax * (1 - u) * (1 - u)); kickX = shakeMax * .5 * Math.max(0, 1 - u * 5); }
  // 乱数ではなく決まった波にして、コマ落ちしても同じ揺れになるようにする。
  const phase = t * 61 + seed;
  const shakeX = Math.round(Math.sin(phase) * shake + kickX), shakeY = Math.round(Math.cos(phase * 1.31) * shake * .8 + kickY);
  const flashMax = preset.flash * clamp(.4 + intensity * .25, 0, 1);
  let flash = 0;
  if (t >= RELEASE_AT) flash = Math.max(flash, flashMax * .55 * Math.max(0, 1 - (t - RELEASE_AT) / .16));
  if (t >= IMPACT_AT) flash = Math.max(flash, flashMax * (violent ? 1 : .5) * Math.max(0, 1 - (t - IMPACT_AT) / .16));
  const darkenMax = preset.darken * clamp(.5 + intensity * .2, 0, 1) * (1 + input * .4);
  // 14秒から暗くなり、放出で一度抜け、命中の後にゆっくり戻る。
  const charge = clamp((t - 14) / 1.2), back = clamp((t - IMPACT_AT - .8) / 1.6);
  const darken = t < RELEASE_AT ? darkenMax * charge : darkenMax * (1 - clamp((t - RELEASE_AT) / .25)) * .3 + darkenMax * .45 * clamp((t - RELEASE_AT) / .25) * (1 - back);
  const chromatic = t >= IMPACT_AT && violent ? increase(preset.chromatic, intensity, .4) * Math.max(0, 1 - (t - IMPACT_AT) / .5) : 0;
  return { shakeX, shakeY, flash: clamp(flash), darken: clamp(darken), chromatic, hitStop: preset.hitStop * clamp(.5 + intensity * .25, 0, 1) };
}

/** 命中の一瞬だけ演出の時計を止める。騎士や音の時刻は変えない。 */
export function effectTime(t: number, hitStop: number) {
  if (t < IMPACT_AT || hitStop <= 0) return t;
  return IMPACT_AT + Math.max(0, t - IMPACT_AT - hitStop);
}
