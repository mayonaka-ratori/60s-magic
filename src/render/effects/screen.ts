import { clamp } from '../../game/motion';
import type { EffectPreset } from './presets';
import { increase } from './presets';
import { smooth } from './frame';
import { BEATS, ENEMY_CHARGE_FROM_MS, ENEMY_MOVES, ENEMY_SLAM_MS, ROUNDS, type Beat } from '../../game/rounds';

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
  /** 命中の最初の一瞬（INVERT_SECONDS）だけ画面を反転する。0か1。控えめモードでは0。古い呼び出しのために省略できる */
  invert?: number;
};
/** 一回目の発動と命中の時刻（秒）。回ごとの値は rounds.ts の表から来る。 */
export const RELEASE_AT = BEATS[0].release, IMPACT_AT = BEATS[0].impact;
/** 命中で世界を止める長さ（秒）。弱、強、とどめの三段。文書の「強」（80〜130ms）の上のほうに置き、大型の敵を打つ重さを出す。 */
export const HIT_STOPS = { weak: .10, strong: .14, finish: .2 };
/**
 * 一回目の命中の止め直し。命中の止めのあと、世界の時刻で命中+0.08秒と+0.2秒にもう一度短く止め、揺れを小さく押す。
 * 一発の命中が「当たった、めり込んだ、抜けた」の三段に見えるようにするため。連弾の80ms間隔と200msの間にも合う。
 * 止めは命中と合わせて3回（WARP_LIMITS.stops）で、遅れの合計は最大でも 0.14+0.03+0.04=0.21秒。
 * kick は揺れの最大（shakeMax）に対する押しの割合。2段目は少し戻し、3段目は抜ける向き（騎士のいる右）へ大きめに押す。
 */
export const HIT_STAGES: ReadonlyArray<{ after: number; hold: number; kick: { x: number; y: number } }> = [
  { after: .08, hold: .03, kick: { x: -.3, y: .12 } },
  { after: .2, hold: .04, kick: { x: .4, y: .2 } },
];
/** 命中の寄り。0.3秒で戻す。文書の1.05〜1.2倍の上のほう。 */
export const HIT_ZOOM = 1.18;
/** 揺れに混ぜる傾きの最大（度）。 */
export const SHAKE_TILT = 2;
/** 命中の最初に画面を反転する長さ（秒）。閃光の立ち上がり（overlay.ts の FLASH_RISE）と同じ約2コマ。 */
export const INVERT_SECONDS = .035;
/** とどめの回で世界を止める長さ（秒）。一発目の命中と、とどめの一撃の2回だけ。本人の魔法では変えない。 */
export const FINISH_STOPS = { impact: .10, finalBlow: .25 };
/** とどめの一撃のあとのスロー。一撃から0.3秒後（世界の時刻）に、実際の0.5秒を0.25倍の速さで見せる。 */
export const FINISH_SLOW = { after: .3, seconds: .5, rate: .25 };
/** 世界の時計の決まり。止めは3回まで、遅れの合計は0.8秒まで。余韻が削られないように守る。 */
export const WARP_LIMITS = { stops: 3, delay: .8 };
/** とどめの発動で、術式が視界を通り抜けるときの全画面の白。濃さと戻るまでの秒数。設計の4.1。 */
export const FINISH_PASS_FLASH = { level: .85, seconds: .17 };
/** とどめの一撃の全画面の白。通り抜ける術式より強くして、一撃を一番明るい瞬間にする。 */
export const FINISH_BLOW_FLASH = { level: .9, seconds: .16 };
/** とどめの一撃で足す傾き（度）と寄り。全画面の白と一緒に、一撃の重さを出す。 */
export const FINISH_TILT = 2, FINISH_ZOOM = 1.2;
/** 完全な暗転の長さ（秒）。放出の直前に置き、終わりがそのまま閃光につながる。 */
export const BLACKOUT_SECONDS = .08;
export const BLACKOUT_FROM = RELEASE_AT - BLACKOUT_SECONDS, BLACKOUT_TO = RELEASE_AT;
/** 衝撃の強さが1秒で減る量。 */
const SHOCK_FADE = 1.6;
/** 揺れの速さ（1秒あたりの波の数）。 */
const SHAKE_HZ = 19;

/**
 * 敵の圧。騎士が自分から動く場面で画面を揺らす数値。閃光は出さない（全画面の白は放出と命中の2回だけのまま）。
 * step は足を踏み替える（下向きの押しと小さな衝撃）、clang は盾を打ち鳴らす（横の鋭い震え）。
 * charge は剣を振り上げて溜める間（防御の回の ENEMY_CHARGE_FROM から確定まで）の低い震え（画素は始めと終わり、hz は1秒あたりの波の数）と、じわじわ進む寄り。
 * slam は振り下ろした剣が床を打つ（下向きの強い押しは揺れの最大に対する割合、衝撃、傾きの度、寄り、戻るまでの秒数）。
 */
export const ENEMY_PRESSURE = {
  step: { push: 4, seconds: .12, shock: .25 },
  clang: { amplitude: 3, seconds: .15, hz: 30 },
  charge: { from: .5, to: 2, hz: 9, zoom: .02 },
  slam: { push: .9, shock: .8, tilt: 1.5, zoom: .06, seconds: .3 },
};
/** 敵が自分から動く時刻（秒）。rounds.ts の表を秒に直しただけで、ここに数字は埋め込まない。 */
const ENEMY_MOVES_AT = ENEMY_MOVES.map(move => ({ at: move.at / 1000, kind: move.kind }));
export const ENEMY_CHARGE_FROM = ENEMY_CHARGE_FROM_MS / 1000, ENEMY_CHARGE_TO = ROUNDS[1].lock / 1000, ENEMY_SLAM_AT = ENEMY_SLAM_MS / 1000;

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

/** 敵の圧の一コマ分。x, y は画素、shock は衝撃（0〜1、揺れの元）、rotate は度、zoom は倍率。 */
export type EnemyPressure = { x: number; y: number; shock: number; rotate: number; zoom: number };
const NO_PRESSURE: EnemyPressure = { x: 0, y: 0, shock: 0, rotate: 0, zoom: 1 };

/**
 * 敵の圧。騎士が自分から動く時刻に合わせた揺れ、衝撃、傾き、寄り。時刻だけで決まる純粋な計算。
 * 一回目は足の踏み替えと盾の打ち鳴らし、防御の回は溜めの震えと剣が床を打つ一撃。とどめの回では動かない。
 * 作った魔法の用途は見ない（揺らすのは敵なので）。控えめモードと「動きを減らす」（calm）ではすべて0。
 * shakeMax は揺れの最大（画素）。床を打つ一撃の押しはこれに対する割合で出す。
 */
export function enemyPressure(t: number, shakeMax: number, beat: Beat = BEATS[0], calm = false): EnemyPressure {
  if (calm) return NO_PRESSURE;
  if (beat.defend) {
    if (t < ENEMY_CHARGE_FROM) return NO_PRESSURE;
    const { charge, slam } = ENEMY_PRESSURE;
    // 溜め。振り上げの始まりから振り下ろし（lock）まで、低い震えが大きくなり、寄りがじわじわ進む。
    const ramp = clamp((t - ENEMY_CHARGE_FROM) / (ENEMY_CHARGE_TO - ENEMY_CHARGE_FROM));
    const tremor = t < ENEMY_CHARGE_TO ? charge.from + (charge.to - charge.from) * ramp : 0;
    const phase = (t - ENEMY_CHARGE_FROM) * Math.PI * 2 * charge.hz;
    // 床を打つ一撃。押しは他の押しと同じ0.06秒、傾きと寄りは0.3秒で戻る。
    const since = t - ENEMY_SLAM_AT;
    const hit = since >= 0 ? Math.max(0, 1 - since / slam.seconds) : 0;
    const push = since >= 0 ? shakeMax * slam.push * Math.max(0, 1 - since / .06) : 0;
    const shock = since >= 0 ? Math.max(0, slam.shock - since * SHOCK_FADE) : 0;
    // 溜めの寄りは振り下ろしのあとも保ち、床を打つ一撃と一緒に0.3秒で戻す。途中で急に戻すと絵が跳ねるため。
    const lean = since >= 0 ? hit : ramp;
    // 0 に掛けたときに符号（-0）が残らないよう、0 を足しておく。
    return {
      x: tremor * .5 * Math.cos(phase * .77) + 0, y: tremor * Math.sin(phase) + push + 0,
      shock, rotate: slam.tilt * hit, zoom: 1 + charge.zoom * lean + (slam.zoom - charge.zoom) * hit,
    };
  }
  if (beat.finish) return NO_PRESSURE;
  const { step, clang } = ENEMY_PRESSURE;
  let x = 0, y = 0, shock = 0;
  for (const move of ENEMY_MOVES_AT) {
    const since = t - move.at;
    if (since < 0) continue;
    if (move.kind === 'step') {
      y += step.push * Math.max(0, 1 - since / step.seconds);
      shock += Math.max(0, step.shock - since * SHOCK_FADE);
    } else {
      x += clang.amplitude * Math.sin(since * Math.PI * 2 * clang.hz) * Math.max(0, 1 - since / clang.seconds);
    }
  }
  if (!x && !y && !shock) return NO_PRESSURE;
  return { x, y, shock, rotate: 0, zoom: 1 };
}

/** 打撃の向きへ押す長さ（秒）。放出、命中、止め直し、敵の一撃、どの押しも同じ速さで抜く。 */
const KICK_SECONDS = .06;

/** 画面全体にかかる効果。時刻と設定から決まる純粋な計算。攻撃以外は揺らさない（敵の圧だけは用途を見ない）。
 *  入力の量は派手さ（intensityOf）に入っているので、ここでは見ない。6番目の引数は昔の呼び出しのために残してあるだけ。
 *  calm は控えめモード。揺れ、傾き、寄り、停止、反転、敵の圧をなくし、閃光を3分の1にする。 */
export function screenState(t: number, intensity: number, preset: EffectPreset, purpose: string | null, seed = 0, _amount = 0, calm = false, beat: Beat = BEATS[0]): ScreenState {
  const violent = purpose === 'attack' || purpose === null;
  // 攻撃は全部、守りは弱く、それ以外は揺らさない。
  // 防御の回だけは、揺らすのが敵の一撃なので、作った魔法の用途にかかわらず揺らす。
  // とどめの回も、揺らすのが自分の一撃そのものなので、作った魔法の用途にかかわらず揺らす。
  const weight = calm ? 0 : beat.defend || beat.finish ? 1 : violent ? 1 : purpose === 'defend' ? .3 : 0;
  // 揺れの最大（画素）。用途を掛ける前の値は敵の圧に使う（揺らすのが敵なので、用途で弱めない）。
  const baseMax = increase(preset.shake, intensity, .6), shakeMax = baseMax * weight;
  // 命中で世界を止める長さ。止め直しの時刻と、下のとどめの時刻を実際の時刻へ直すのにも使う。
  const hitStop = hitStopOf(preset, intensity, calm, beat), warp = warpOf(beat, hitStop);
  // 放出は小さく、命中は大きい。強さは時間とともに減り、その二乗で揺らす。
  const shock = shockAt(t, .55, 1, beat);
  const power = shock * shock;
  // 敵の圧。騎士が自分から動く時刻の揺れ。衝撃は自分の魔法のものと別に二乗して足す（重なる時間はほぼ無い）。
  const enemy = enemyPressure(t, baseMax, beat, calm);
  const drive = weight * power + enemy.shock * enemy.shock;
  // 最初の一瞬だけ打撃の向きへ押す。放出は上へ、命中は騎士のいる右へ。
  // 防御の回は、奥から手前へ押されるので下向きにする。
  let kickY = (t >= beat.release ? -shakeMax * .45 * Math.max(0, 1 - (t - beat.release) / KICK_SECONDS) : 0)
    + (beat.defend && t >= beat.impact ? shakeMax * .55 * Math.max(0, 1 - (t - beat.impact) / KICK_SECONDS) : 0);
  let kickX = !beat.defend && t >= beat.impact ? shakeMax * .6 * Math.max(0, 1 - (t - beat.impact) / KICK_SECONDS) : 0;
  // 一回目の止め直し（HIT_STAGES）に合わせた小さな押し。段の時刻は世界の時刻なので、実際の時刻へ直してから比べる。
  if (!beat.defend && !beat.finish && hitStop > 0)
    for (const stage of HIT_STAGES) {
      const since = t - warpReal(beat.impact + stage.after, warp);
      if (since < 0 || since >= KICK_SECONDS) continue;
      const push = shakeMax * (1 - since / KICK_SECONDS);
      kickX += stage.kick.x * push; kickY += stage.kick.y * push;
    }
  // 0 に丸めるときに符号が残らないよう、0 を足しておく。
  const shakeX = Math.round(wobble(t * SHAKE_HZ, seed + 1) * baseMax * drive + kickX + enemy.x) + 0;
  const shakeY = Math.round(wobble(t * SHAKE_HZ * 1.13, seed + 2) * baseMax * .8 * drive + kickY + enemy.y) + 0;
  // 傾きは最大 SHAKE_TILT 度、揺れの拡大は最大1.03倍。どちらも揺れと同じ強さで動く。
  const rotate = wobble(t * SHAKE_HZ * .7, seed + 3) * SHAKE_TILT * drive;
  const shakeZoom = 1 + (wobble(t * SHAKE_HZ * .8, seed + 4) * .5 + .5) * .03 * drive;

  // とどめの一撃の時刻。t は実際の時刻なので、世界の時刻で置いた78.5秒を実際の時刻（78.6秒）へ直してから比べる。
  // ほかの回は null なので、ここから下の足し算は何も起こらない（値は今までと同じまま）。
  const finalBlow = beat.finish && beat.finalBlow !== null ? warpReal(beat.finalBlow, warp) : null;
  // 一撃からの強さ。0.3秒で0へ戻る。傾きと寄りに使う。
  const blow = finalBlow !== null && t >= finalBlow ? Math.max(0, 1 - (t - finalBlow) / .3) : 0;
  // 閃光の濃さの元。派手（既定）のふつうの魔法（派手さ1.9）で命中が約0.75、放出が約0.45になる。
  // 上限は overlay.ts の FLASH_MAX（0.85）で頭打ちにするので、ここでは1を超えてもよい。
  const flashMax = preset.flash * (.7 + intensity * .35) * (calm ? 1 / 3 : 1);
  let flash = 0;
  if (t >= beat.release) flash = Math.max(flash, flashMax * .6 * Math.max(0, 1 - (t - beat.release) / .16));
  if (t >= beat.impact) flash = Math.max(flash, flashMax * (beat.defend ? .85 : violent || beat.finish ? 1 : .5) * Math.max(0, 1 - (t - beat.impact) / .16));
  // とどめの発動だけは、術式が通り抜けるぶん白を濃くする。ほかの回はここを通らない。
  if (beat.finish && t >= beat.release)
    flash = Math.max(flash, FINISH_PASS_FLASH.level * (calm ? 1 / 3 : 1) * Math.max(0, 1 - (t - beat.release) / FINISH_PASS_FLASH.seconds));
  // とどめの一撃だけは、全画面の白をいっぱいまで出す。
  if (finalBlow !== null && t >= finalBlow)
    flash = Math.max(flash, Math.max(flashMax, FINISH_BLOW_FLASH.level * (calm ? 1 / 3 : 1)) * Math.max(0, 1 - (t - finalBlow) / FINISH_BLOW_FLASH.seconds));
  // 命中の最初の一瞬だけ画面を反転する。閃光の立ち上がりと同じ長さで、その閃光の一部（overlay.ts が閃光の始まりに合わせて出す）。
  // 揺らす一撃（攻撃、防御の受け止め、とどめ）だけ。控えめモードでは出さない。
  const invert = !calm && (violent || beat.defend || beat.finish) && t >= beat.impact && t < beat.impact + INVERT_SECONDS ? 1 : 0;
  const darkenMax = preset.darken * clamp(.5 + intensity * .2, 0, 1);
  // 締め切りから暗くなり、放出で一度抜け、命中の後にゆっくり戻る。
  const charge = clamp((t - beat.inputEnd) / 1.2), back = clamp((t - beat.impact - .8) / 1.6);
  const darken = t < beat.release ? darkenMax * charge : darkenMax * (1 - clamp((t - beat.release) / .25)) * .3 + darkenMax * .45 * clamp((t - beat.release) / .25) * (1 - back);
  let chromatic = t >= beat.impact && (violent || beat.defend || beat.finish) && !calm ? increase(preset.chromatic, intensity, .4) * Math.max(0, 1 - (t - beat.impact) / .5) : 0;
  // とどめの一撃では、色のずれを一撃の時刻から出し直す。端ほど強くするのは合成側が受け持つ。
  if (finalBlow !== null && t >= finalBlow && !calm)
    chromatic = Math.max(chromatic, increase(preset.chromatic, intensity, .4) * Math.max(0, 1 - (t - finalBlow) / .5));

  // 溜めの後半でゆっくり1.03倍まで寄り、放出で戻る。命中では HIT_ZOOM 倍を0.3秒かけて戻す。
  const closeIn = smooth(clamp((t - (beat.release - 1.5)) / 1.5)) * Math.max(0, 1 - clamp((t - beat.release) / .3));
  const hit = t >= beat.impact ? 1 - clamp((t - beat.impact) / .3) : 0;
  // とどめの一撃では、傾き2度と寄り1.2倍を足す。敵の圧の寄り（溜めと床を打つ一撃）も掛ける。控えめモードでは足さない。
  const zoom = calm ? 1 : (1 + .03 * closeIn) * (1 + (HIT_ZOOM - 1) * hit * hit * (weight ? 1 : .5)) * shakeZoom * (1 + (FINISH_ZOOM - 1) * blow) * enemy.zoom;
  // 放出の直前だけ全部を消して暗くする。発動の時刻でそのまま閃光へつなぐ。
  const blackout = t >= beat.release - BLACKOUT_SECONDS && t < beat.release ? clamp((t - (beat.release - BLACKOUT_SECONDS)) / .04) : 0;
  // 溜めの後半で背景の色を抜き、命中の後にゆっくり戻す。
  const pale = smooth(clamp((t - (beat.release - 1.5)) / 1.5)) * (1 - smooth(clamp((t - beat.impact - .3) / 1.5)));
  const saturate = 1 - .4 * pale;

  return { shakeX, shakeY, flash: clamp(flash), darken: clamp(darken), chromatic,
    hitStop, rotate: rotate + (calm ? 0 : FINISH_TILT * blow) + enemy.rotate, zoom, blackout, saturate, invert };
}

/**
 * 世界の時計のゆがみ。止めとスローを、どちらも世界の時刻に置き、長さは実際の秒数で持つ。
 * stops は時刻の順に並べる。slow は無いときは null。
 */
export type TimeWarp = {
  stops: Array<{ at: number; hold: number }>;
  slow: { from: number; seconds: number; rate: number } | null;
};

/** 止めとスローを時刻の順に並べたもの。同じゆがみなら作り直さない（毎コマ並べ替えないため）。 */
type WarpEvent = { at: number; seconds: number; rate: number };
const warpEvents = new WeakMap<TimeWarp, WarpEvent[]>();
function eventsOf(warp: TimeWarp): WarpEvent[] {
  const ready = warpEvents.get(warp);
  if (ready) return ready;
  const events: WarpEvent[] = warp.stops.map(stop => ({ at: stop.at, seconds: stop.hold, rate: 0 }));
  if (warp.slow) events.push({ at: warp.slow.from, seconds: warp.slow.seconds, rate: warp.slow.rate });
  events.sort((a, b) => a.at - b.at);
  warpEvents.set(warp, events);
  return events;
}

/**
 * 実際の時刻から世界の時刻を出す。止めの間は世界が進まず、スローの間は rate 倍の速さで進む。
 * 時刻だけで決まる計算で、逆戻りはしない。長さが0の出来事は無いものとして飛ばす。
 */
export function warpTime(t: number, warp: TimeWarp) {
  const events = eventsOf(warp);
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
 * 世界の時刻から実際の時刻を出す。warpTime の逆向き。
 * 世界の時刻で決めた出来事（崩れ落ちる音など）を、実際の時計で鳴らすときに使う。
 */
export function warpReal(world: number, warp: TimeWarp) {
  const events = eventsOf(warp);
  let delay = 0;
  for (const event of events) {
    if (event.seconds <= 0) continue;
    if (world <= event.at) break;
    // この出来事の間に世界が進む長さ。止めなら0。
    const span = event.rate * event.seconds;
    if (world < event.at + span) return event.at + delay + (world - event.at) / event.rate;
    delay += (1 - event.rate) * event.seconds;
  }
  return world + delay;
}

/** 同じ回と同じ停止の長さなら、作ったゆがみを使い回す。毎コマ作り直さないため。 */
const warpCache = new Map<string, TimeWarp>();
/**
 * その回のゆがみ。一回目は命中で止めたあと二度止め直す三段（HIT_STAGES）、防御は命中の一回だけ止める。
 * とどめは一発目の命中ととどめの一撃で止め、そのあとスローにする。中身は本人の魔法では変えない。
 * 控えめモードでは hitStop が0で来るので、そのときだけ止めをなくす（スローは残す）。
 * 同じ組み合わせでは同じものを返すので、返ってきたゆがみは書き換えない。
 */
export function warpOf(beat: Beat = BEATS[0], hitStop = 0): TimeWarp {
  const key = `${beat.impact}|${beat.finalBlow}|${beat.finish}|${hitStop}`;
  const ready = warpCache.get(key);
  if (ready) return ready;
  const made = buildWarp(beat, hitStop);
  warpCache.set(key, made);
  return made;
}
function buildWarp(beat: Beat, hitStop: number): TimeWarp {
  if (beat.finish && beat.finalBlow !== null) {
    const hold = hitStop > 0 ? 1 : 0;
    return {
      stops: [{ at: beat.impact, hold: FINISH_STOPS.impact * hold }, { at: beat.finalBlow, hold: FINISH_STOPS.finalBlow * hold }],
      slow: { from: beat.finalBlow + FINISH_SLOW.after, seconds: FINISH_SLOW.seconds, rate: FINISH_SLOW.rate },
    };
  }
  // 防御は敵の一撃を受け止める一回だけ止める。止めが無い（控えめモードや控えめの設定）ときは一回目も何もしない。
  if (beat.defend || hitStop <= 0) return { stops: [{ at: beat.impact, hold: hitStop }], slow: null };
  // 一回目は命中の止めのあとに二度止め直す三段。単発か連弾かは引数から分からないので、どちらも同じ三段にする。
  return { stops: [{ at: beat.impact, hold: hitStop }, ...HIT_STAGES.map(stage => ({ at: beat.impact + stage.after, hold: stage.hold }))], slow: null };
}

/** 実際の時刻から世界の時刻を出す。演出も騎士も術式も同じこの時刻を見る。 */
export function effectTime(t: number, hitStop: number, beat: Beat = BEATS[0]) {
  return warpTime(t, warpOf(beat, hitStop));
}
