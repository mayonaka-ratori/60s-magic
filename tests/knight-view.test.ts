import { describe, it, expect } from 'vitest';
import { KNIGHT_VIEW, knightView, projectView, viewKick, VIEW_KICKS, hitScarAt, SCAR_FADE,
  knightPose, guardPose, stepAt, clangAt, chargeTremorAt, TREMOR_MAX, STEP_LIFT, STEP_SINK, CLANG_IN, CLANG_OUT, CLANG_FLASH,
  HEIGHT, FOOT, CROWN, FINAL_BLOW_AT, REFLECT_BACK_AT, FALL_TURN, FALL_NEAR } from '../src/render/knight';
import { ENEMY_CHARGE_FROM_MS, ENEMY_MOVES, ENEMY_SLAM_MS, ROUNDS } from '../src/game/rounds';

describe('見上げる視点', () => {
  it('今の視点でも、視点の高さと距離を変えても、足元と兜の先の位置は守られる', () => {
    // 兜の先は上端から1〜3%に来る。
    expect(CROWN).toBeGreaterThanOrEqual(.01);
    expect(CROWN).toBeLessThanOrEqual(.03);
    // 視点が0.9mより高いと、兜の先を2%へ置くには見下ろす必要があるので、それより低い範囲で確かめる。
    for (const view of [KNIGHT_VIEW, ...([[.4, 3.5], [.7, 5], [.8, 6]] as const).map(([eye, dist]) => knightView(eye, dist))]) {
      expect(view.pitch).toBeGreaterThan(0);
      expect(projectView({ y: 0 }, view).y).toBeCloseTo(FOOT, 6);
      expect(projectView({ y: HEIGHT }, view).y).toBeCloseTo(CROWN, 6);
    }
  });
  it('倒れた頭は画面の上端へは寄らない', () => {
    // 足元を軸に手前へ回し、膝をついた分（crouch -0.92）だけ下がり、視点へ FALL_NEAR だけ近づく。
    const head = projectView({ y: -.92 + HEIGHT * Math.cos(FALL_TURN), z: -HEIGHT * Math.sin(FALL_TURN) - FALL_NEAR });
    expect(head.y).toBeGreaterThan(.4);
    expect(head.y).toBeLessThan(.6);
  });
});

describe('視点の動き', () => {
  const first = ROUNDS[0].impact / 1000, slam = ENEMY_SLAM_MS / 1000;
  it('一回目の命中で後ろへ引いて上へ振り、0.25秒で戻る', () => {
    const at = viewKick(ROUNDS[0].impact, true);
    expect(at.back).toBeGreaterThan(0);
    expect(at.up).toBeGreaterThan(0);
    expect(at.down).toBe(0);
    expect(viewKick(ROUNDS[0].impact - 1, true)).toEqual({ back: 0, up: 0, down: 0 });
    expect(viewKick((first + .25) * 1000, true)).toEqual({ back: 0, up: 0, down: 0 });
    expect(viewKick((first + .249) * 1000, true).back).toBeGreaterThan(0);
  });
  it('最初速く、後ゆっくり戻る', () => {
    const peak = viewKick(ROUNDS[0].impact, true).back;
    const half = viewKick((first + .125) * 1000, true).back;
    // 前半で落ちる量のほうが後半で落ちる量より大きい。
    expect(peak - half).toBeGreaterThan(half - 0);
    let previous = Infinity;
    for (let t = first; t < first + .25; t += .01) {
      const now = viewKick(t * 1000, true).back;
      expect(now).toBeLessThanOrEqual(previous + 1e-9);
      previous = now;
    }
  });
  it('敵の一撃が床を打つ時刻で下へ沈み、0.3秒で戻る', () => {
    const at = viewKick(ENEMY_SLAM_MS, true);
    expect(at.down).toBeGreaterThan(0);
    expect(at.back).toBe(0);
    expect(at.up).toBe(0);
    expect(viewKick(ENEMY_SLAM_MS - 1, true).down).toBe(0);
    expect(viewKick((slam + .15) * 1000, true).down).toBeGreaterThan(0);
    expect(viewKick((slam + .3) * 1000, true).down).toBe(0);
  });
  it('とどめの一撃では一回目より大きく引く', () => {
    const blow = viewKick(FINAL_BLOW_AT * 1000, true), hit = viewKick(ROUNDS[0].impact, true);
    expect(blow.back).toBeGreaterThan(hit.back);
    expect(blow.up).toBeGreaterThan(hit.up);
  });
  it('控えめモードと遊んでいない間は動かさない', () => {
    for (const kick of VIEW_KICKS) {
      expect(viewKick(kick.at * 1000, true, true)).toEqual({ back: 0, up: 0, down: 0 });
      expect(viewKick(kick.at * 1000, false)).toEqual({ back: 0, up: 0, down: 0 });
    }
  });
});

describe('命中の跡', () => {
  const impact = ROUNDS[0].impact, end = ROUNDS[0].end;
  /** 薄れ始める時刻と、薄れる途中の時刻（ms）。回の終わりから SCAR_FADE だけ前から薄れる。 */
  const 薄れ始め = (end: number) => end - SCAR_FADE * 1000, 薄れる途中 = (end: number) => end - SCAR_FADE * 500;
  it('一回目の命中から回の終わりまで残り、最後に薄れる', () => {
    expect(hitScarAt(impact - 1, true)).toBe(0);
    expect(hitScarAt(impact, true)).toBeGreaterThan(1);
    // 当たった直後より薄まってから、薄れ始めるまで同じ濃さで残る。
    const 残る濃さ = hitScarAt(薄れ始め(end), true);
    expect(残る濃さ).toBeGreaterThan(0);
    expect(残る濃さ).toBeLessThan(hitScarAt(impact, true));
    expect(hitScarAt(impact + 900, true)).toBeCloseTo(残る濃さ, 6);
    expect(hitScarAt(薄れる途中(end), true)).toBeLessThan(残る濃さ);
    expect(hitScarAt(end - 1, true)).toBeGreaterThan(0);
    expect(hitScarAt(end, true)).toBe(0);
    expect(hitScarAt(end + 1000, true)).toBe(0);
  });
  it('防御の回は弾き返したときだけ、一撃が盾に当たった0.8秒後から回の終わりまで残る', () => {
    // 戻ってきた一撃が胸に当たる時刻（ms）。防御の回の受け止めの後。
    const back = REFLECT_BACK_AT * 1000, defendEnd = ROUNDS[1].end;
    expect(back).toBeGreaterThan(ROUNDS[1].impact);
    expect(hitScarAt(back - 100, true, 'reflect')).toBe(0);
    expect(hitScarAt(back, true, 'reflect')).toBeGreaterThan(1);
    const 残る濃さ = hitScarAt(薄れ始め(defendEnd), true, 'reflect');
    expect(残る濃さ).toBeGreaterThan(0);
    expect(hitScarAt(back + 1800, true, 'reflect')).toBeCloseTo(残る濃さ, 6);
    expect(hitScarAt(薄れる途中(defendEnd), true, 'reflect')).toBeLessThan(残る濃さ);
    expect(hitScarAt(defendEnd, true, 'reflect')).toBe(0);
    // 受け止めとかき消しでは跡が付かない。
    for (const style of ['block', 'erase', null] as const) expect(hitScarAt(back + 800, true, style)).toBe(0);
  });
  it('遊んでいない間は出さない', () => {
    expect(hitScarAt(impact + 100, false)).toBe(0);
    expect(hitScarAt(ROUNDS[1].impact + 1600, false, 'reflect')).toBe(0);
  });
});

describe('自分から動く騎士', () => {
  const step = ENEMY_MOVES.find(move => move.kind === 'step')!.at / 1000, clang = ENEMY_MOVES.find(move => move.kind === 'clang')!.at / 1000;
  /** 動いている途中の時刻（ms）。脚が浮く、沈む、盾を振る、打つ、戻す。 */
  const 浮く = (step - STEP_LIFT / 2) * 1000, 沈む = (step + STEP_SINK / 2) * 1000;
  const 振る = (clang - CLANG_IN / 2) * 1000, 打つ = clang * 1000, 戻す = (clang + CLANG_OUT / 2) * 1000;
  it('足の踏み替えは表の時刻の着地に合わせ、脚は着地の前に浮き、着地のあとに沈む', () => {
    expect(stepAt(step - STEP_LIFT - .01)).toEqual({ lift: 0, sink: 0 });
    expect(stepAt(step - STEP_LIFT / 2).lift).toBeCloseTo(1, 6);
    expect(stepAt(step - STEP_LIFT / 2).sink).toBe(0);
    expect(stepAt(step).lift).toBe(0);
    expect(stepAt(step + STEP_SINK / 2).sink).toBeCloseTo(1, 6);
    expect(stepAt(step + STEP_SINK)).toEqual({ lift: 0, sink: 0 });
  });
  it('盾打ちは表の時刻に打ち、打つ前に振って、打ってから戻す。打った瞬間だけ盾が光る', () => {
    expect(clangAt(clang - CLANG_IN - .01)).toEqual({ swing: 0, flash: 0 });
    expect(clangAt(clang - .001).swing).toBeGreaterThan(.9);
    expect(clangAt(clang).swing).toBe(1);
    expect(clangAt(clang).flash).toBe(1);
    expect(clangAt(clang - .001).flash).toBe(0);
    expect(clangAt(clang + CLANG_FLASH / 2).flash).toBeCloseTo(.5, 6);
    expect(clangAt(clang + CLANG_FLASH).flash).toBe(0);
    expect(clangAt(clang + CLANG_OUT / 2).swing).toBeCloseTo(.5, 6);
    expect(clangAt(clang + CLANG_OUT)).toEqual({ swing: 0, flash: 0 });
  });
  it('姿勢の計算では、指定の時刻のまわりだけ動く', () => {
    // 一回目の命中の手前まで、0.1秒ごとと、動きの始まりと終わりの前後1msを見る。
    const 境目 = [step - STEP_LIFT, step + STEP_SINK, clang - CLANG_IN, clang + CLANG_OUT].flatMap(t => [t * 1000 - 1, t * 1000]);
    const 見る時刻 = [...Array.from({ length: Math.ceil((ROUNDS[0].impact - 100) / 100) }, (_, i) => i * 100), ...境目];
    const 外れ: string[] = [];
    for (const ms of 見る時刻) {
      const p = knightPose(ms, true);
      const t = ms / 1000;
      const stepping = t >= step - STEP_LIFT && t < step + STEP_SINK, clanging = t >= clang - CLANG_IN && t < clang + CLANG_OUT;
      if (!stepping && (p.stepLift !== 0 || p.stepSink !== 0)) 外れ.push(`${ms}ms の足踏み`);
      if (!clanging && (p.clang !== 0 || p.clangFlash !== 0)) 外れ.push(`${ms}ms の盾打ち`);
      // 一回目には溜めの震えは無い。
      if (p.tremor !== 0) 外れ.push(`${ms}ms の震え`);
    }
    expect(外れ).toEqual([]);
    expect(knightPose(浮く, true).stepLift).toBeGreaterThan(0);
    expect(knightPose(沈む, true).stepSink).toBeGreaterThan(0);
    expect(knightPose(打つ, true).clang).toBe(1);
    expect(knightPose(打つ, true).clangFlash).toBe(1);
  });
  it('動きを減らす設定と、遊んでいない間は動かない', () => {
    for (const ms of [浮く, 沈む, 振る, 打つ, 戻す]) {
      const quiet = knightPose(ms, true, true), idle = knightPose(ms, false);
      for (const p of [quiet, idle]) { expect(p.stepLift).toBe(0); expect(p.stepSink).toBe(0); expect(p.clang).toBe(0); expect(p.clangFlash).toBe(0); }
    }
  });
  it('溜めの震えは防御の回が始まった0.2秒後から振り下ろしまで、溜まるほど強くなる', () => {
    const from = ENEMY_CHARGE_FROM_MS / 1000, lock = ROUNDS[1].lock / 1000;
    expect(from).toBeCloseTo(ROUNDS[1].start / 1000 + .2, 9);
    expect(lock).toBeGreaterThan(from + 1);
    // 溜めの途中の時刻（ms）。
    const midMs = Math.round((ENEMY_CHARGE_FROM_MS + ROUNDS[1].lock) / 2);
    expect(chargeTremorAt(from - .01)).toBe(0);
    expect(chargeTremorAt(from)).toBe(0);
    expect(chargeTremorAt(lock)).toBe(0);
    expect(chargeTremorAt(lock + 1)).toBe(0);
    let previous = 0;
    for (let t = from; t < lock; t += .1) {
      const now = chargeTremorAt(t);
      expect(now).toBeGreaterThanOrEqual(previous);
      expect(now).toBeLessThanOrEqual(TREMOR_MAX);
      previous = now;
    }
    // 終わり際は最大に近い。初めはほとんど震えない。
    expect(chargeTremorAt(lock - .01)).toBeGreaterThan(TREMOR_MAX * .95);
    expect(chargeTremorAt(from + 1)).toBeLessThan(TREMOR_MAX * .02);
    expect(guardPose(midMs).tremor).toBeCloseTo(chargeTremorAt(midMs / 1000), 9);
    expect(guardPose(midMs).tremor).toBeGreaterThan(0);
    // 動きを減らす設定では震えない。
    expect(guardPose(midMs, true).tremor).toBe(0);
    // 防御の回に足踏みと盾打ちは無い。
    expect(guardPose(midMs).stepLift).toBe(0);
    expect(guardPose(midMs).clang).toBe(0);
  });
});
