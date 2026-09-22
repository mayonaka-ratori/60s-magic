import { describe, it, expect } from 'vitest';
import { BEATS, ENEMY_MOVES } from '../src/game/rounds';
import { presets } from '../src/render/effects/presets';
import { ENEMY_CHARGE_FROM, ENEMY_CHARGE_TO, ENEMY_PRESSURE, ENEMY_SLAM_AT, FINISH_STOPS, HIT_STAGES, HIT_STOPS, INVERT_SECONDS, WARP_LIMITS,
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
  it('止めは派手さで弱、強、とどめの順に長くなる。防御はいつも強', () => {
    expect(HIT_STOPS.weak).toBeLessThan(HIT_STOPS.strong);
    expect(HIT_STOPS.strong).toBeLessThan(HIT_STOPS.finish);
    expect(hitStopOf(presets.vivid, 1)).toBe(HIT_STOPS.weak);
    expect(hitStopOf(presets.vivid, NORMAL)).toBe(HIT_STOPS.strong);
    expect(hitStopOf(presets.vivid, 3)).toBe(HIT_STOPS.finish);
    expect(hitStopOf(presets.vivid, 0, false, defend)).toBe(HIT_STOPS.strong);
    expect(hitStopOf(presets.vivid, 3, false, defend)).toBe(HIT_STOPS.strong);
    expect(hitStopOf(presets.vivid, 3, true)).toBe(0);
  });
  it('閃光は、ふつうの魔法の命中が約0.75、放出が約0.45で、上限で頭打ちになる', () => {
    expect(vivid(first.impact).flash).toBeCloseTo(.75, 1);
    expect(vivid(first.release).flash).toBeCloseTo(.45, 1);
    // 最大の設定で派手さが上限でも、画面に出る濃さは上限で頭打ち。
    expect(flashTarget(screenState(first.impact, 3, presets.max, 'attack').flash, false)).toBeLessThanOrEqual(FLASH_MAX);
  });
  it('全画面の白は一回目で放出と命中の2回だけ', () => {
    // 白は一度出ると0.16秒は残るので、0.01秒刻みで見れば出始めを取りこぼさない。
    let starts = 0, lit = false;
    for (let ms = 0; ms <= first.end * 1000 - 500; ms += 10) {
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
      const battleEnd = BEATS[BEATS.length - 1].end;
      expect(battleEnd - effectTime(battleEnd, hitStop, beat)).toBeLessThanOrEqual(WARP_LIMITS.delay + 1e-9);
    }
  });
  it('どの回、どの止めでも、世界の時刻は戻らない', () => {
    const 戻った: string[] = [];
    for (const beat of BEATS) for (const hitStop of stops) {
      const warp = warpOf(beat, hitStop);
      // 止めとスローは世界の時刻に置き、長さは実際の秒数で持つ。どれも、一番遅い出来事の時刻に全部の長さを足した先までに終わる。
      // その範囲の外では、時計は実際の時刻に遅れを足すだけなので戻りようがない。範囲の中だけを1ミリ秒ずつ見る。
      const events = [...warp.stops.map(stop => ({ at: stop.at, seconds: stop.hold })),
        ...(warp.slow ? [{ at: warp.slow.from, seconds: warp.slow.seconds }] : [])];
      const from = Math.min(...events.map(event => event.at));
      const to = Math.max(...events.map(event => event.at)) + events.reduce((sum, event) => sum + event.seconds, 0);
      let last = -Infinity;
      for (let ms = Math.floor(from * 1000) - 10; ms <= Math.ceil(to * 1000) + 10; ms++) {
        const world = effectTime(ms / 1000, hitStop, beat);
        if (world < last) 戻った.push(`${beat.impact}秒の回、止め${hitStop}、${ms}ミリ秒`);
        last = world;
      }
    }
    expect(戻った).toEqual([]);
  });
});

describe('一回目の三段の止め', () => {
  it('実際の時刻で見ると、命中から0〜0.14秒、0.22〜0.25秒、0.37〜0.41秒に止まる', () => {
    const hit = first.impact;
    const world = (t: number) => effectTime(hit + t, HIT_STOPS.strong, first) - hit;
    // 命中からの秒数で見る。
    expect(world(0)).toBeCloseTo(0, 9);
    expect(world(.13)).toBeCloseTo(0, 9);
    expect(world(.2)).toBeCloseTo(.06, 9);
    expect(world(.22)).toBeCloseTo(.08, 9);
    expect(world(.24)).toBeCloseTo(.08, 9);
    expect(world(.3)).toBeCloseTo(.13, 9);
    expect(world(.37)).toBeCloseTo(.2, 9);
    expect(world(.4)).toBeCloseTo(.2, 9);
    expect(world(.5)).toBeCloseTo(.29, 9);
    // 世界の時刻から実際の時刻へも戻せる。
    expect(warpReal(hit + .08, warpOf(first, HIT_STOPS.strong))).toBeCloseTo(hit + .22, 9);
    expect(warpReal(hit + .2, warpOf(first, HIT_STOPS.strong))).toBeCloseTo(hit + .37, 9);
    // 弱でも段の間隔は同じで、最初の止めだけ短い。
    expect(warpOf(first, HIT_STOPS.weak).stops.map(stop => stop.at)).toEqual([hit, hit + .08, hit + .2]);
  });
  it('止めが無いときは何も止めない。防御は命中の一回だけ止め、とどめは一発目と直撃で止める', () => {
    // 止めが0なら、一回目も防御も世界の時刻は実際の時刻のまま。
    for (const beat of [first, defend]) {
      expect(warpOf(beat, 0).stops.every(stop => stop.hold === 0)).toBe(true);
      for (const t of [beat.inputEnd, beat.impact - .01, beat.impact, beat.impact + .1, beat.impact + .3, beat.end]) expect(effectTime(t, 0, beat)).toBe(t);
    }
    // 防御はどの止めでも命中の一回だけで、止め直しはしない。
    for (const hitStop of [HIT_STOPS.weak, HIT_STOPS.strong, HIT_STOPS.finish]) expect(warpOf(defend, hitStop).stops).toEqual([{ at: defend.impact, hold: hitStop }]);
    // 防御（強）は、命中の前は実際の時刻のまま、命中から止めの長さだけ進まず、そのあとは止めの分だけ遅れて同じ速さで進む。
    const world = (t: number) => effectTime(t, HIT_STOPS.strong, defend);
    expect(world(defend.impact - .01)).toBe(defend.impact - .01);
    expect(world(defend.impact + HIT_STOPS.strong / 2)).toBeCloseTo(defend.impact, 9);
    expect(world(defend.impact + HIT_STOPS.strong + .5)).toBeCloseTo(defend.impact + .5, 9);
    expect(world(defend.end)).toBeCloseTo(defend.end - HIT_STOPS.strong, 9);
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
  /** 足の踏み替えと盾の打ち鳴らしの時刻（秒）。回の表から作る。 */
  const stepAt = ENEMY_MOVES.find(move => move.kind === 'step')!.at / 1000, clangAt = ENEMY_MOVES.find(move => move.kind === 'clang')!.at / 1000;
  /** from から seconds 秒のあいだに、値の向きが何回入れ替わるか。1ミリ秒ずつ見る。 */
  const flipsOf = (value: (t: number) => number, from: number, seconds: number) => {
    let flips = 0, sign = 0;
    for (let t = from; t < from + seconds; t += .001) { const s = Math.sign(value(t)); if (s && sign && s !== sign) flips++; if (s) sign = s; }
    return flips;
  };
  it('足の踏み替えは下向きの押しと小さな衝撃で、すぐに消える', () => {
    const { step } = ENEMY_PRESSURE;
    const on = enemyPressure(stepAt, max, first);
    expect(on.y).toBeCloseTo(step.push, 6);
    expect(on.x).toBe(0);
    expect(on.shock).toBeCloseTo(step.shock, 6);
    // 押しは途中で弱まり、押しの長さを過ぎれば0。
    const half = enemyPressure(stepAt + step.seconds / 2, max, first).y;
    expect(half).toBeGreaterThan(0); expect(half).toBeLessThan(on.y);
    expect(enemyPressure(stepAt + step.seconds + .001, max, first).y).toBe(0);
    // 衝撃も時間とともに消える。
    expect(enemyPressure(stepAt + .1, max, first).shock).toBeLessThan(on.shock);
    expect(enemyPressure(stepAt + .2, max, first)).toEqual(still);
    // 画面全体の値でも下向きに押され、用途が強化でも揺れる。
    expect(vivid(stepAt + .005, 'enhance').shakeY).toBeGreaterThan(0);
    expect(vivid(stepAt + .005, 'enhance').flash).toBe(0);
    expect(vivid(stepAt - .01, 'enhance').shakeY).toBe(0);
  });
  it('盾の打ち鳴らしは横だけの鋭い震えで、すぐに消える', () => {
    const { clang } = ENEMY_PRESSURE;
    let peak = 0;
    for (let t = clangAt; t < clangAt + clang.seconds; t += .001) {
      const p = enemyPressure(t, max, first);
      expect(p.y).toBe(0); expect(p.shock).toBe(0);
      peak = Math.max(peak, Math.abs(p.x));
    }
    expect(peak).toBeGreaterThan(clang.amplitude / 2); expect(peak).toBeLessThanOrEqual(clang.amplitude);
    expect(enemyPressure(clangAt + clang.seconds + .01, max, first)).toEqual(still);
    // 一度押すだけでなく、短いあいだに左右へ何度も振れる。
    expect(flipsOf(t => enemyPressure(t, max, first).x, clangAt, clang.seconds)).toBeGreaterThanOrEqual(2);
    expect(vivid(clangAt + .01, 'defend').flash).toBe(0);
  });
  it('一回目のそれ以外の時間はまったく揺らさない', () => {
    // 動いた直後の0.2秒は、上の2件が見る。
    const moving = (t: number) => ENEMY_MOVES.some(move => t >= move.at / 1000 && t < move.at / 1000 + .2);
    const 揺れた: number[] = [];
    for (let ms = 0; ms < first.end * 1000; ms += 10) {
      const t = ms / 1000;
      if (moving(t)) continue;
      const p = enemyPressure(t, max, first);
      if (p.x || p.y || p.shock || p.rotate || p.zoom !== 1) 揺れた.push(t);
    }
    expect(揺れた).toEqual([]);
    // とどめの回も揺らさない。
    expect(enemyPressure(finish.impact + .1, max, finish)).toEqual(still);
    expect(enemyPressure(finish.finalBlow! + .1, max, finish)).toEqual(still);
  });
  it('防御の溜め（回の始まりの少しあとから振り下ろしまで）は、盾より低い震えが大きくなり、寄りがじわじわ進む', () => {
    const { charge, clang } = ENEMY_PRESSURE;
    // 溜めの始まり、真ん中、終わり（振り下ろし）の秒。
    const from = ENEMY_CHARGE_FROM, to = ENEMY_CHARGE_TO, mid = (from + to) / 2;
    expect(from).toBeGreaterThan(defend.start);
    expect(to).toBeCloseTo(defend.lock, 9);
    expect(enemyPressure(from - .1, max, defend)).toEqual(still);
    const size = (start: number) => { let peak = 0; for (let t = start; t < start + .12; t += .001) peak = Math.max(peak, Math.abs(enemyPressure(t, max, defend).y)); return peak; };
    expect(size(from)).toBeCloseTo(charge.from, 1);
    expect(size(mid)).toBeGreaterThan(size(from));
    expect(size(to - .15)).toBeCloseTo(charge.to, 1);
    // 上下に何度も振れるが、1秒あたりの振れる回数は盾の打ち鳴らしより少ない（低い震え）。
    const chargeRate = flipsOf(t => enemyPressure(t, max, defend).y, mid, 1);
    const clangRate = flipsOf(t => enemyPressure(t, max, first).x, clangAt, clang.seconds) / clang.seconds;
    expect(chargeRate).toBeGreaterThanOrEqual(2);
    expect(chargeRate).toBeLessThan(clangRate);
    // 寄りは等倍から始まり、振り下ろしに向けて進み続ける。
    const zoom = (t: number) => enemyPressure(t, max, defend).zoom;
    expect(zoom(from)).toBeCloseTo(1, 6);
    expect(zoom(mid)).toBeGreaterThan(zoom(from));
    expect(zoom(to - .01)).toBeGreaterThan(zoom(mid));
    expect(zoom(to - .01)).toBeLessThanOrEqual(1 + charge.zoom);
    // 振り下ろしで震えは止まるが、寄りは床を打つまで保つ。
    expect(enemyPressure(to + .2, max, defend).y).toBe(0);
    expect(zoom(to + .2)).toBeCloseTo(1 + charge.zoom, 6);
    expect(enemyPressure(to + .2, max, defend).shock).toBe(0);
    // 画面全体の値でも、溜めの終わりには揺れ、閃光は出ない。
    expect(Math.abs(vivid(to - .07, 'enhance', false, defend).shakeY)).toBeGreaterThan(0);
    expect(vivid(to - .07, 'enhance', false, defend).flash).toBe(0);
  });
  it('床を打つ一撃は下向きの強い押しと衝撃に傾きと寄りが付き、すぐに戻る', () => {
    const { slam } = ENEMY_PRESSURE;
    const on = enemyPressure(ENEMY_SLAM_AT, max, defend);
    expect(on.y).toBeCloseTo(max * slam.push, 6);
    expect(on.shock).toBeCloseTo(slam.shock, 6);
    expect(on.rotate).toBeCloseTo(slam.tilt, 6);
    expect(on.zoom).toBeCloseTo(1 + slam.zoom, 6);
    // 戻る途中は、傾きも寄りも一撃の瞬間と元の間にある。
    const mid = enemyPressure(ENEMY_SLAM_AT + slam.seconds / 2, max, defend);
    expect(mid.rotate).toBeGreaterThan(0); expect(mid.rotate).toBeLessThan(on.rotate);
    expect(mid.zoom).toBeGreaterThan(1); expect(mid.zoom).toBeLessThan(on.zoom);
    // 戻る長さがたてば戻りきる（浮動小数のごく小さな余りは見ない）。
    const after = enemyPressure(ENEMY_SLAM_AT + slam.seconds, max, defend);
    expect(after.rotate).toBeCloseTo(0, 9); expect(after.zoom).toBeCloseTo(1, 9); expect(after.y).toBeCloseTo(0, 9);
    // 衝撃は少しあとまで残り、やがて消える。発動の直後まで少し残るが、そこでは自分の放出の衝撃と重なるだけ。
    expect(enemyPressure(ENEMY_SLAM_AT + .5, max, defend).shock).toBe(0);
    // 画面全体の値でも、用途が守りでも下へ大きく押され、閃光は出ない（受け止めの閃光と近いため）。
    const s = vivid(ENEMY_SLAM_AT, 'defend', false, defend);
    expect(s.shakeY).toBeGreaterThan(10);
    expect(s.flash).toBe(0);
    expect(s.zoom).toBeGreaterThan(1 + slam.zoom * .8);
    expect(s.rotate).toBeGreaterThan(0);
  });
  it('控えめモードではすべて0', () => {
    for (const t of [stepAt, clangAt + .01, ENEMY_CHARGE_FROM + 4, ENEMY_CHARGE_TO - .1, ENEMY_SLAM_AT, ENEMY_SLAM_AT + .1]) {
      const beat = t < first.end ? first : defend;
      expect(enemyPressure(t, max, beat, true)).toEqual(still);
      const s = vivid(t, 'attack', true, beat);
      expect(s.shakeX).toBe(0); expect(s.shakeY).toBe(0); expect(s.rotate).toBe(0); expect(s.zoom).toBe(1);
    }
  });
});
