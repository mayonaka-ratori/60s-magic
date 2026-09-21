import { describe, it, expect } from 'vitest';
import { BEATS, ENEMY_CHARGE_FROM_MS, ENEMY_MOVES, ENEMY_SLAM_MS, ROUNDS } from '../src/game/rounds';
import { presets } from '../src/render/effects/presets';
import { ENEMY_CHARGE_FROM, ENEMY_CHARGE_TO, ENEMY_PRESSURE, ENEMY_SLAM_AT, FINISH_BLOW_FLASH, FINISH_PASS_FLASH, FINISH_STOPS,
  HIT_STAGES, HIT_STOPS, HIT_ZOOM, INVERT_SECONDS, SHAKE_TILT, WARP_LIMITS,
  effectTime, enemyPressure, hitStopOf, screenState, warpOf, warpReal } from '../src/render/effects/screen';
import { FLASH_MAX, flashTarget } from '../src/render/overlay';

/**
 * 画面全体の効果のうち、大型の敵を打つ手応えのための数値。
 * 一撃の止めと揺れと閃光、一回目の三段の止め、命中の反転、敵の圧（騎士が自分から動くときの揺れ）。
 * 全部が時刻だけで決まる純粋な計算なので、時刻を並べて確かめる。
 */
const first = BEATS[0], defend = BEATS[1], finish = BEATS[2];
/** 派手（既定）のふつうの魔法。派手さ1.9。 */
const NORMAL = 1.9;
const vivid = (t: number, purpose: string | null = 'attack', calm = false, beat = first) => screenState(t, NORMAL, presets.vivid, purpose, 0, 0, calm, beat);

describe('一撃の数値', () => {
  it('止めは弱0.10秒、強0.14秒、とどめ0.2秒。防御はいつも強', () => {
    expect(HIT_STOPS).toEqual({ weak: .10, strong: .14, finish: .2 });
    expect(hitStopOf(presets.vivid, 1)).toBe(HIT_STOPS.weak);
    expect(hitStopOf(presets.vivid, NORMAL)).toBe(HIT_STOPS.strong);
    expect(hitStopOf(presets.vivid, 3)).toBe(HIT_STOPS.finish);
    expect(hitStopOf(presets.vivid, 0, false, defend)).toBe(HIT_STOPS.strong);
    expect(hitStopOf(presets.vivid, 3, true)).toBe(0);
    // とどめの回の止めは変えていない。
    expect(FINISH_STOPS).toEqual({ impact: .10, finalBlow: .25 });
  });
  it('揺れの基準は控えめ2、派手14、最大22画素', () => {
    expect(presets.calm.shake).toBe(2);
    expect(presets.vivid.shake).toBe(14);
    expect(presets.max.shake).toBe(22);
  });
  it('命中の寄りは1.18倍、傾きは2度まで', () => {
    expect(HIT_ZOOM).toBeCloseTo(1.18, 6);
    expect(SHAKE_TILT).toBe(2);
    const zoom = vivid(first.impact).zoom;
    expect(zoom).toBeGreaterThanOrEqual(HIT_ZOOM - 1e-6);
    expect(zoom).toBeLessThanOrEqual(HIT_ZOOM * 1.03 + 1e-6);
    let tilted = 0;
    for (let t = 17; t < 20; t += .005) {
      const s = screenState(t, 3, presets.max, 'attack');
      expect(Math.abs(s.rotate)).toBeLessThanOrEqual(SHAKE_TILT);
      if (Math.abs(s.rotate) > 1) tilted++;
    }
    // 1度を超える傾きが実際に出る（上限を上げただけで終わっていない）。
    expect(tilted).toBeGreaterThan(0);
  });
  it('閃光は上限0.85で、ふつうの魔法の命中が約0.75、放出が約0.45', () => {
    expect(FLASH_MAX).toBeCloseTo(.85, 6);
    expect(vivid(first.impact).flash).toBeCloseTo(.75, 1);
    expect(vivid(first.release).flash).toBeCloseTo(.45, 1);
    expect(vivid(first.impact).flash).toBeLessThanOrEqual(FLASH_MAX);
    // 最大の設定で派手さが上限でも、画面に出る濃さは0.85で頭打ち。
    expect(flashTarget(screenState(first.impact, 3, presets.max, 'attack').flash, false)).toBeLessThanOrEqual(FLASH_MAX);
    // 控えめモードは3分の1。
    expect(vivid(first.impact, 'attack', true).flash).toBeCloseTo(vivid(first.impact).flash / 3, 6);
    // とどめの白は変えていない。
    expect(FINISH_PASS_FLASH).toEqual({ level: .85, seconds: .17 });
    expect(FINISH_BLOW_FLASH).toEqual({ level: .9, seconds: .16 });
  });
  it('全画面の白は一回目で放出と命中の2回だけ', () => {
    let starts = 0, lit = false;
    for (let ms = 0; ms <= 23500; ms++) {
      const flash = vivid(ms / 1000).flash;
      if (flash > 0 && !lit) starts++;
      lit = flash > 0;
    }
    expect(starts).toBe(2);
  });
});

describe('世界の時計の上限', () => {
  const stops = [0, HIT_STOPS.weak, HIT_STOPS.strong, HIT_STOPS.finish, .5];
  it('どの回、どの止めでも、止めは3回まで、遅れの合計は0.8秒以内', () => {
    for (const beat of BEATS) for (const hitStop of stops) {
      const warp = warpOf(beat, hitStop);
      expect(warp.stops.length, `${beat.impact}秒の回、止め${hitStop}`).toBeLessThanOrEqual(WARP_LIMITS.stops);
      const held = warp.stops.reduce((sum, stop) => sum + stop.hold, 0);
      expect(held).toBeLessThanOrEqual(WARP_LIMITS.delay);
      expect(60 - effectTime(60, hitStop, beat)).toBeLessThanOrEqual(WARP_LIMITS.delay + 1e-9);
    }
  });
  it('一回目の遅れの合計は、止めと二度の止め直しの和（強で0.21秒）', () => {
    const extra = HIT_STAGES.reduce((sum, stage) => sum + stage.hold, 0);
    expect(extra).toBeCloseTo(.07, 6);
    expect(24 - effectTime(24, HIT_STOPS.strong, first)).toBeCloseTo(HIT_STOPS.strong + extra, 6);
    expect(24 - effectTime(24, HIT_STOPS.weak, first)).toBeCloseTo(HIT_STOPS.weak + extra, 6);
  });
  it('世界の時刻は戻らない', () => {
    for (const hitStop of stops) {
      let last = -1;
      for (let ms = 0; ms <= 24000; ms++) { const world = effectTime(ms / 1000, hitStop, first); expect(world).toBeGreaterThanOrEqual(last); last = world; }
    }
  });
});

describe('一回目の三段の止め', () => {
  it('命中、世界の命中+0.08秒（0.03秒）、命中+0.2秒（0.04秒）の3回で止まる', () => {
    expect(HIT_STAGES.map(stage => [stage.after, stage.hold])).toEqual([[.08, .03], [.2, .04]]);
    const warp = warpOf(first, HIT_STOPS.strong);
    expect(warp.stops).toEqual([{ at: 18.5, hold: .14 }, { at: 18.58, hold: .03 }, { at: 18.7, hold: .04 }]);
    expect(warp.slow).toBeNull();
  });
  it('実際の時刻で見ると、18.5〜18.64、18.72〜18.75、18.87〜18.91秒に止まる', () => {
    const world = (t: number) => effectTime(t, HIT_STOPS.strong, first);
    expect(world(18.5)).toBeCloseTo(18.5, 9);
    expect(world(18.63)).toBeCloseTo(18.5, 9);
    expect(world(18.7)).toBeCloseTo(18.56, 9);
    expect(world(18.72)).toBeCloseTo(18.58, 9);
    expect(world(18.74)).toBeCloseTo(18.58, 9);
    expect(world(18.8)).toBeCloseTo(18.63, 9);
    expect(world(18.87)).toBeCloseTo(18.7, 9);
    expect(world(18.9)).toBeCloseTo(18.7, 9);
    expect(world(19)).toBeCloseTo(18.79, 9);
    // 世界の時刻から実際の時刻へも戻せる。
    expect(warpReal(18.58, warpOf(first, HIT_STOPS.strong))).toBeCloseTo(18.72, 9);
    expect(warpReal(18.7, warpOf(first, HIT_STOPS.strong))).toBeCloseTo(18.87, 9);
    // 弱でも段の間隔は同じで、最初の止めだけ短い。
    expect(warpOf(first, HIT_STOPS.weak).stops.map(stop => stop.at)).toEqual([18.5, 18.58, 18.7]);
  });
  it('止めが無いときは何も止めない。防御ととどめは今までどおり', () => {
    expect(warpOf(first, 0).stops.every(stop => stop.hold === 0)).toBe(true);
    for (let ms = 18000; ms <= 19500; ms++) expect(effectTime(ms / 1000, 0, first)).toBe(ms / 1000);
    expect(warpOf(defend, HIT_STOPS.strong).stops).toEqual([{ at: defend.impact, hold: HIT_STOPS.strong }]);
    expect(warpOf(finish, HIT_STOPS.strong).stops).toEqual([{ at: finish.impact, hold: FINISH_STOPS.impact }, { at: finish.finalBlow, hold: FINISH_STOPS.finalBlow }]);
  });
  it('止め直しの段ごとに、揺れが小さく押される', () => {
    // 押しの瞬間、揺れが跳ぶ。1ミリ秒前との差で見る（なめらかな乱数の揺れは1ミリ秒では1画素も動かない）。
    const warp = warpOf(first, HIT_STOPS.strong);
    for (const stage of HIT_STAGES) {
      const at = warpReal(first.impact + stage.after, warp);
      const before = vivid(at - .001), on = vivid(at);
      const jump = Math.hypot(on.shakeX - before.shakeX, on.shakeY - before.shakeY);
      expect(jump, `段${stage.after}`).toBeGreaterThanOrEqual(5);
    }
    // 控えめモードでは押しも無い。
    const at = warpReal(first.impact + HIT_STAGES[1].after, warp);
    expect(vivid(at, 'attack', true).shakeX).toBe(0); expect(vivid(at, 'attack', true).shakeY).toBe(0);
  });
});

describe('命中の反転', () => {
  it('命中から0.035秒だけ1で、その前後は0', () => {
    expect(INVERT_SECONDS).toBeCloseTo(.035, 6);
    expect(vivid(first.impact - .001).invert).toBe(0);
    expect(vivid(first.impact).invert).toBe(1);
    expect(vivid(first.impact + .03).invert).toBe(1);
    expect(vivid(first.impact + INVERT_SECONDS).invert).toBe(0);
    expect(vivid(first.impact + .1).invert).toBe(0);
    // 放出では反転しない。
    expect(vivid(first.release).invert).toBe(0);
  });
  it('控えめモードと、揺らさない用途（強化など）では出さない', () => {
    expect(vivid(first.impact, 'attack', true).invert).toBe(0);
    expect(vivid(first.impact, 'enhance').invert).toBe(0);
    expect(vivid(first.impact, null).invert).toBe(1);
  });
  it('防御の受け止めととどめの一発目でも命中の瞬間だけ出る', () => {
    expect(vivid(defend.impact, 'enhance', false, defend).invert).toBe(1);
    expect(vivid(defend.impact + .05, 'enhance', false, defend).invert).toBe(0);
    expect(vivid(finish.impact, 'attack', false, finish).invert).toBe(1);
    expect(vivid(finish.impact, 'attack', true, finish).invert).toBe(0);
  });
});

describe('敵の圧', () => {
  const max = 30;
  const still = { x: 0, y: 0, shock: 0, rotate: 0, zoom: 1 };
  it('時刻は rounds.ts の表から来る', () => {
    expect(ENEMY_MOVES.map(move => move.at / 1000)).toEqual([3.5, 9.5]);
    expect(ENEMY_CHARGE_FROM).toBeCloseTo(ENEMY_CHARGE_FROM_MS / 1000, 9);
    expect(ENEMY_CHARGE_TO).toBeCloseTo(ROUNDS[1].lock / 1000, 9);
    expect(ENEMY_SLAM_AT).toBeCloseTo(ENEMY_SLAM_MS / 1000, 9);
  });
  it('足の踏み替え（3.5秒）は下向きの押し4画素が0.12秒と衝撃0.25', () => {
    const on = enemyPressure(3.5, max, first);
    expect(on.y).toBeCloseTo(ENEMY_PRESSURE.step.push, 6);
    expect(on.x).toBe(0);
    expect(on.shock).toBeCloseTo(ENEMY_PRESSURE.step.shock, 6);
    expect(enemyPressure(3.56, max, first).y).toBeCloseTo(2, 6);
    expect(enemyPressure(3.62, max, first).y).toBe(0);
    // 衝撃も0.25÷1.6秒で消える。
    expect(enemyPressure(3.6, max, first).shock).toBeLessThan(on.shock);
    expect(enemyPressure(3.7, max, first)).toEqual(still);
    // 画面全体の値でも下向きに押され、用途が強化でも揺れる。
    expect(vivid(3.505, 'enhance').shakeY).toBeGreaterThan(0);
    expect(vivid(3.505, 'enhance').flash).toBe(0);
    expect(vivid(3.49, 'enhance').shakeY).toBe(0);
  });
  it('盾の打ち鳴らし（9.5秒）は横の鋭い震え3画素が0.15秒', () => {
    let peak = 0;
    for (let t = 9.5; t < 9.65; t += .001) {
      const p = enemyPressure(t, max, first);
      expect(p.y).toBe(0); expect(p.shock).toBe(0);
      peak = Math.max(peak, Math.abs(p.x));
    }
    expect(peak).toBeGreaterThan(2.5); expect(peak).toBeLessThanOrEqual(3);
    expect(enemyPressure(9.66, max, first)).toEqual(still);
    // 30Hzなので、0.15秒の間に向きが何度も変わる。
    let flips = 0, sign = 0;
    for (let t = 9.5; t < 9.65; t += .001) { const s = Math.sign(enemyPressure(t, max, first).x); if (s && sign && s !== sign) flips++; if (s) sign = s; }
    expect(flips).toBeGreaterThanOrEqual(7);
    expect(vivid(9.51, 'defend').flash).toBe(0);
  });
  it('一回目のそれ以外の時間はまったく揺らさない', () => {
    for (let ms = 0; ms < 23500; ms += 5) {
      const t = ms / 1000;
      if ((t >= 3.5 && t < 3.66) || (t >= 9.5 && t < 9.65)) continue;
      expect(enemyPressure(t, max, first), `${t}秒`).toEqual(still);
    }
    expect(enemyPressure(53.6, max, finish)).toEqual(still);
  });
  it('防御の溜め（24.2〜33秒）は約9Hzの低い震えが0.5から2画素へ増え、寄りが1.02倍へ進む', () => {
    expect(enemyPressure(24.1, max, defend)).toEqual(still);
    const size = (from: number) => { let peak = 0; for (let t = from; t < from + .12; t += .001) peak = Math.max(peak, Math.abs(enemyPressure(t, max, defend).y)); return peak; };
    expect(size(24.2)).toBeCloseTo(ENEMY_PRESSURE.charge.from, 1);
    expect(size(28.5)).toBeGreaterThan(size(24.2));
    expect(size(32.85)).toBeCloseTo(ENEMY_PRESSURE.charge.to, 1);
    // 9Hzなら1秒に18回、上下の向きが変わる。
    let flips = 0, sign = 0;
    for (let t = 30; t < 31; t += .001) { const s = Math.sign(enemyPressure(t, max, defend).y); if (s && sign && s !== sign) flips++; if (s) sign = s; }
    expect(flips).toBeGreaterThanOrEqual(17); expect(flips).toBeLessThanOrEqual(19);
    expect(enemyPressure(24.2, max, defend).zoom).toBeCloseTo(1, 6);
    expect(enemyPressure(28.6, max, defend).zoom).toBeCloseTo(1.01, 3);
    expect(enemyPressure(32.99, max, defend).zoom).toBeCloseTo(1.02, 3);
    // 振り下ろし（33秒）で震えは止まるが、寄りは床を打つまで保つ。
    expect(enemyPressure(33.2, max, defend).y).toBe(0);
    expect(enemyPressure(33.2, max, defend).zoom).toBeCloseTo(1.02, 6);
    expect(enemyPressure(33.2, max, defend).shock).toBe(0);
    // 画面全体の値でも、溜めの終わりには揺れ、閃光は出ない。
    expect(Math.abs(vivid(32.93, 'enhance', false, defend).shakeY)).toBeGreaterThan(0);
    expect(vivid(32.93, 'enhance', false, defend).flash).toBe(0);
  });
  it('床を打つ一撃（33.55秒）は下向きの強い押し、衝撃0.8、傾き1.5度、寄り1.06倍が0.3秒で戻る', () => {
    const on = enemyPressure(ENEMY_SLAM_AT, max, defend);
    expect(on.y).toBeCloseTo(max * ENEMY_PRESSURE.slam.push, 6);
    expect(on.shock).toBeCloseTo(.8, 6);
    expect(on.rotate).toBeCloseTo(1.5, 6);
    expect(on.zoom).toBeCloseTo(1.06, 6);
    const mid = enemyPressure(ENEMY_SLAM_AT + .15, max, defend);
    expect(mid.rotate).toBeCloseTo(.75, 6);
    expect(mid.zoom).toBeCloseTo(1.03, 6);
    // 0.3秒たてば戻りきる（浮動小数のごく小さな余りは見ない）。
    const after = enemyPressure(ENEMY_SLAM_AT + .3, max, defend);
    expect(after.rotate).toBeCloseTo(0, 9); expect(after.zoom).toBeCloseTo(1, 9); expect(after.y).toBeCloseTo(0, 9);
    // 衝撃は0.8÷1.6秒で消える。発動（34秒）の直後まで少し残るが、そこでは自分の放出の衝撃と重なるだけ。
    expect(enemyPressure(ENEMY_SLAM_AT + .5, max, defend).shock).toBe(0);
    // 画面全体の値でも、用途が守りでも下へ大きく押され、閃光は出ない（35.4秒の受け止めの閃光と近いため）。
    const s = vivid(ENEMY_SLAM_AT, 'defend', false, defend);
    expect(s.shakeY).toBeGreaterThan(10);
    expect(s.flash).toBe(0);
    expect(s.zoom).toBeGreaterThan(1.05);
    expect(s.rotate).toBeGreaterThan(0);
  });
  it('控えめモードではすべて0', () => {
    for (const t of [3.5, 9.51, 28, 32.9, ENEMY_SLAM_AT, ENEMY_SLAM_AT + .1]) {
      const beat = t < 24 ? first : defend;
      expect(enemyPressure(t, max, beat, true)).toEqual(still);
      const s = vivid(t, 'attack', true, beat);
      expect(s.shakeX).toBe(0); expect(s.shakeY).toBe(0); expect(s.rotate).toBe(0); expect(s.zoom).toBe(1);
    }
  });
});
