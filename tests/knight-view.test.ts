import { describe, it, expect } from 'vitest';
import { KNIGHT_VIEW, knightView, projectView, viewKick, VIEW_KICKS, hitScarAt, HIT_SCARS, SCAR_FADE, scarCurve,
  knightPose, guardPose, stepAt, clangAt, chargeTremorAt, TREMOR_MAX, STEP_LIFT, STEP_SINK, CLANG_IN, CLANG_OUT, CLANG_FLASH,
  HEIGHT, FOOT, CROWN, EYE, DIST, FINAL_BLOW_AT, REFLECT_BACK_AT, FALL_TURN, FALL_NEAR } from '../src/render/knight';
import { ENEMY_CHARGE_FROM_MS, ENEMY_MOVES, ENEMY_SLAM_MS, ROUNDS } from '../src/game/rounds';

/**
 * 以前の視点。真正面（pitch 0）で、足元を71.4%、兜の先を5.2%に置いていた。高さ約0.95m、距離約6.9m。
 * 以前のコードと同じ式で作り、見比べるためだけに持つ。
 */
const OLD_DEPTH = HEIGHT / ((.714 - .5) * 2 + (.5 - .052) * 2);
const OLD_VIEW = { eye: (.714 - .5) * 2 * OLD_DEPTH, dist: OLD_DEPTH / .3205, pitch: 0, tan: .3205, look: (.714 - .5) * 2 * OLD_DEPTH };

describe('見上げる視点', () => {
  it('足元は画面の高さの71.4%のまま、兜の先は上端から1〜3%に来る', () => {
    expect(FOOT).toBe(.714);
    expect(projectView({ y: 0 }).y).toBeCloseTo(.714, 6);
    const crown = projectView({ y: HEIGHT }).y;
    expect(crown).toBeCloseTo(CROWN, 6);
    expect(crown).toBeGreaterThanOrEqual(.01);
    expect(crown).toBeLessThanOrEqual(.03);
    // 以前より上端へ寄っている。
    expect(crown).toBeLessThan(projectView({ y: HEIGHT }, OLD_VIEW).y);
  });
  it('視点は以前より低く、少し上を向く', () => {
    expect(KNIGHT_VIEW.eye).toBe(EYE);
    expect(KNIGHT_VIEW.eye).toBeLessThan(OLD_VIEW.eye);
    expect(KNIGHT_VIEW.dist).toBe(DIST);
    expect(KNIGHT_VIEW.dist).toBeLessThan(OLD_VIEW.dist);
    expect(KNIGHT_VIEW.pitch).toBeGreaterThan(0);
    expect(KNIGHT_VIEW.pitch).toBeLessThan(10 * Math.PI / 180);
    // 注視点は視点より高い（見上げている）。
    expect(KNIGHT_VIEW.look).toBeGreaterThan(KNIGHT_VIEW.eye);
    expect(KNIGHT_VIEW.tan).toBeGreaterThan(0);
  });
  it('騎士は以前より大きく映り、近い足元ほど大きい', () => {
    const grow = (y: number) => projectView({ y }).scale / projectView({ y }, OLD_VIEW).scale;
    expect(grow(0)).toBeGreaterThan(1.08);
    expect(grow(2.05)).toBeGreaterThan(1.03);
    expect(grow(HEIGHT)).toBeGreaterThan(1);
    // 近い足元のほうが遠い頭より大きく映る。見上げる遠近。
    expect(grow(0)).toBeGreaterThan(grow(HEIGHT));
    // 以前の真正面では足元も頭も同じ大きさだった。
    expect(projectView({ y: 0 }, OLD_VIEW).scale).toBeCloseTo(projectView({ y: HEIGHT }, OLD_VIEW).scale, 9);
  });
  it('横長でも縦長でも足元の位置は背景と同じ動きをする', () => {
    // 縦長（cover=1）では足元が71.4%。横長では背景が広がる分だけ、画面の中央を軸に同じ比で下がる。以前と同じ決まり。
    expect(projectView({ y: 0 }, KNIGHT_VIEW, 1).y).toBeCloseTo(.714, 6);
    for (const cover of [1.1, 1.2, 1.5]) {
      expect(projectView({ y: 0 }, KNIGHT_VIEW, cover).y).toBeCloseTo(.5 + (FOOT - .5) * cover, 6);
      expect(projectView({ y: 0 }, KNIGHT_VIEW, cover).y).toBeCloseTo(projectView({ y: 0 }, OLD_VIEW, cover).y, 6);
    }
  });
  it('視点の高さと距離を変えても、足元と兜の先の位置は守られる', () => {
    // 視点が0.9mより高いと、兜の先を2%へ置くには見下ろす必要があるので、それより低い範囲で確かめる。
    for (const [eye, dist] of [[.4, 3.5], [.7, 5], [.8, 6]] as const) {
      const view = knightView(eye, dist);
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
  it('敵の一撃が床を打つ33.55秒で下へ沈み、0.3秒で戻る', () => {
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
  it('動く時刻は回の表から来て、それ以外の時刻では動かない', () => {
    expect(VIEW_KICKS.map(kick => kick.at)).toEqual([18.5, slam, FINAL_BLOW_AT]);
    for (let t = 0; t <= 60; t += .05) {
      const inside = VIEW_KICKS.some(kick => t >= kick.at - 1e-9 && t < kick.at + kick.seconds);
      const kick = viewKick(t * 1000, true);
      if (!inside) expect(kick).toEqual({ back: 0, up: 0, down: 0 });
    }
  });
});

describe('命中の跡', () => {
  const impact = ROUNDS[0].impact, end = ROUNDS[0].end;
  it('一回目の命中から回の終わりまで残り、最後の1秒で薄れる', () => {
    expect(hitScarAt(impact - 1, true)).toBe(0);
    expect(hitScarAt(impact, true)).toBeGreaterThan(1);
    // 0.9秒で0.38まで薄まり、そのまま残る。
    expect(hitScarAt(impact + 900, true)).toBeCloseTo(.38, 6);
    expect(hitScarAt(end - 1000, true)).toBeCloseTo(.38, 6);
    expect(hitScarAt(end - 500, true)).toBeCloseTo(.19, 6);
    expect(hitScarAt(end - 1, true)).toBeGreaterThan(0);
    expect(hitScarAt(end, true)).toBe(0);
    expect(hitScarAt(end + 1000, true)).toBe(0);
    expect(SCAR_FADE).toBe(1);
    expect(HIT_SCARS[0]).toEqual({ at: 18.5, end: 24, reflectOnly: false });
  });
  it('防御の回は弾き返したときだけ36.2秒から40秒まで残る', () => {
    expect(REFLECT_BACK_AT).toBeCloseTo(36.2, 9);
    expect(HIT_SCARS[1]).toEqual({ at: REFLECT_BACK_AT, end: 40, reflectOnly: true });
    expect(hitScarAt(36100, true, 'reflect')).toBe(0);
    expect(hitScarAt(36200, true, 'reflect')).toBeGreaterThan(1);
    expect(hitScarAt(38000, true, 'reflect')).toBeCloseTo(.38, 6);
    expect(hitScarAt(39500, true, 'reflect')).toBeCloseTo(.19, 6);
    expect(hitScarAt(40000, true, 'reflect')).toBe(0);
    // 受け止めとかき消しでは跡が付かない。
    for (const style of ['block', 'erase', null] as const) expect(hitScarAt(37000, true, style)).toBe(0);
  });
  it('遊んでいない間は出さない', () => {
    expect(hitScarAt(impact + 100, false)).toBe(0);
    expect(hitScarAt(37000, false, 'reflect')).toBe(0);
  });
  it('濃さの曲線はとどめの傷あとと同じ', () => {
    expect(scarCurve(0)).toBeCloseTo(1.15, 6);
    expect(scarCurve(.9)).toBeCloseTo(.38, 6);
    expect(scarCurve(5)).toBeCloseTo(.38, 6);
  });
});

describe('自分から動く騎士', () => {
  const step = ENEMY_MOVES.find(move => move.kind === 'step')!.at / 1000, clang = ENEMY_MOVES.find(move => move.kind === 'clang')!.at / 1000;
  it('足の踏み替えは3.5秒の着地に合わせ、脚は着地の前に浮き、着地から0.4秒で沈む', () => {
    expect(step).toBe(3.5);
    expect(stepAt(step - STEP_LIFT - .01)).toEqual({ lift: 0, sink: 0 });
    expect(stepAt(step - STEP_LIFT / 2).lift).toBeCloseTo(1, 6);
    expect(stepAt(step - STEP_LIFT / 2).sink).toBe(0);
    expect(stepAt(step).lift).toBe(0);
    expect(stepAt(step + STEP_SINK / 2).sink).toBeCloseTo(1, 6);
    expect(stepAt(step + STEP_SINK)).toEqual({ lift: 0, sink: 0 });
    expect(STEP_SINK).toBe(.4);
  });
  it('盾打ちは9.5秒に打ち、打つ前0.12秒で振って打ってから0.18秒で戻す。打った瞬間だけ盾が光る', () => {
    expect(clang).toBe(9.5);
    expect(CLANG_IN + CLANG_OUT).toBeCloseTo(.3, 9);
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
    for (let ms = 0; ms <= 23000; ms += 10) {
      const p = knightPose(ms, true);
      const t = ms / 1000;
      const stepping = t >= step - STEP_LIFT && t < step + STEP_SINK, clanging = t >= clang - CLANG_IN && t < clang + CLANG_OUT;
      if (!stepping) { expect(p.stepLift).toBe(0); expect(p.stepSink).toBe(0); }
      if (!clanging) { expect(p.clang).toBe(0); expect(p.clangFlash).toBe(0); }
      // 一回目には溜めの震えは無い。
      expect(p.tremor).toBe(0);
    }
    expect(knightPose(3400, true).stepLift).toBeGreaterThan(0);
    expect(knightPose(3700, true).stepSink).toBeGreaterThan(0);
    expect(knightPose(9500, true).clang).toBe(1);
    expect(knightPose(9500, true).clangFlash).toBe(1);
  });
  it('動きを減らす設定と、遊んでいない間は動かない', () => {
    for (const ms of [3400, 3700, 9450, 9500, 9600]) {
      const quiet = knightPose(ms, true, true), idle = knightPose(ms, false);
      for (const p of [quiet, idle]) { expect(p.stepLift).toBe(0); expect(p.stepSink).toBe(0); expect(p.clang).toBe(0); expect(p.clangFlash).toBe(0); }
    }
  });
  it('足踏みと盾打ちは、8つの姿勢の混ぜ方を変えない', () => {
    for (const ms of [3400, 3700, 9500, 9600]) {
      expect(knightPose(ms, true).weights).toEqual(knightPose(ms, true, true).weights);
      expect(knightPose(ms, true).state).toBe('idle');
    }
  });
  it('溜めの震えは24.2秒から33秒まで、溜まるほど強くなる', () => {
    const from = ENEMY_CHARGE_FROM_MS / 1000, lock = ROUNDS[1].lock / 1000;
    expect(from).toBeCloseTo(24.2, 9);
    expect(lock).toBe(33);
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
    expect(guardPose(30000).tremor).toBeCloseTo(chargeTremorAt(30), 9);
    expect(guardPose(30000).tremor).toBeGreaterThan(0);
    // 動きを減らす設定では震えない。
    expect(guardPose(30000, true).tremor).toBe(0);
    // 防御の回に足踏みと盾打ちは無い。
    expect(guardPose(30000).stepLift).toBe(0);
    expect(guardPose(30000).clang).toBe(0);
  });
});
