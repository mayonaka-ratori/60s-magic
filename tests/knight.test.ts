import { describe, it, expect } from 'vitest';
import { knightPose, guardPose, GUARD_FROM, reactionPower, knightTransform, knightMatrix, knightPoint, blendPose, IDLE_BREATH_SECONDS,
  FINISH_DROPS, droppedAt, debrisMotion, coreBlink, corePulse, idlePulse, FINISH_THROWS, FALL_TURN, FALL_NEAR,
  FINISH_FLASH, FINAL_BLOW_AT, KNEEL_AT, coreCharge, idleSway } from '../src/render/knight';
import { getPreset } from '../src/render/effects/presets';
import { FINISH_COLLAPSE_MS, FINISH_FALL_FROM_MS, FINISH_FALL_TO_MS, FINISH_HIT_MS, FINISH_SWORD_DROP_MS, ROUNDS } from '../src/game/rounds';

// 時刻は回の表から作る。数字を書き並べない。
const first = ROUNDS[0], finish = ROUNDS[2];
/** 一回目の命中の時刻（ms）。反応の試験はここからの差で書く。 */
const 命中 = first.impact;
/** 崩れ落ちの時刻（秒）。膝をつき始め、つききり、倒れきる。 */
const 膝 = FINISH_COLLAPSE_MS / 1000, 倒れ始め = FINISH_FALL_FROM_MS / 1000, 倒れきり = FINISH_FALL_TO_MS / 1000;
import type { Recipe } from '../src/game/types';

const recipe = (over: Partial<Recipe>): Recipe => ({ version: 'recipe-1', accent: null, element: 'fire', purpose: 'attack', form: 'orb',
  trajectory: 'straight', count: 1, explicitCount: null, defense: .2, area: .2, duration: .5, concentration: 0,
  enclosure: false, split: false, developsPrevious: null, motionSpeechAligned: null, noAttack: false, name: '', source: 'local',
  decisions: {}, assistance: [], model: null, ...over });

describe('反応の強さ', () => {
  it('個数と範囲と収束が大きいほど強くなる', () => {
    const weak = reactionPower(recipe({}));
    const strong = reactionPower(recipe({ count: 7, area: 1, concentration: 1 }));
    expect(weak).toBeLessThan(.3);
    expect(strong).toBeGreaterThan(.9);
    expect(reactionPower(null)).toBeGreaterThan(0);
  });
  it('同じ魔法でも入力の量が多いほど反応が強い', () => {
    const quiet = reactionPower(recipe({}));
    const busy = reactionPower(recipe({}), 1);
    expect(busy).toBeGreaterThan(quiet);
    expect(busy - quiet).toBeCloseTo(.3, 2);
    expect(reactionPower(recipe({}), 0)).toBe(quiet);
    expect(reactionPower(null, 1)).toBeGreaterThan(reactionPower(null));
    // 0〜1の範囲は超えない。
    expect(reactionPower(recipe({ count: 7, area: 1, concentration: 1 }), 1)).toBeLessThanOrEqual(1);
  });
  it('弱いと怯むだけ、強いと大きく崩れて戻りも遅い', () => {
    const weak = knightPose(命中 + 100, true, false, 'attack', .1);
    const strong = knightPose(命中 + 100, true, false, 'attack', 1);
    expect(weak.collapse).toBe(0);
    expect(strong.collapse).toBeGreaterThan(0);
    expect(strong.spin).toBeGreaterThan(weak.spin);
    // 強いほど戻りが遅い。
    expect(knightPose(命中 + 600, true, false, 'attack', 1).push).toBeGreaterThan(knightPose(命中 + 600, true, false, 'attack', .1).push);
    // 沈み込みは0.6秒あたりが底で、1.8秒で戻り切る。
    expect(knightPose(命中 + 600, true, false, 'attack', 1).collapse).toBeGreaterThan(.9);
    expect(knightPose(命中 + 1900, true, false, 'attack', 1).collapse).toBeCloseTo(0, 2);
  });
  it('拘束と強化では反応が小さい', () => {
    expect(knightPose(命中 + 100, true, false, 'bind', 1).spin).toBeLessThan(knightPose(命中 + 100, true, false, 'attack', 1).spin);
    expect(knightPose(命中 + 100, true, false, 'enhance', 1).collapse).toBe(0);
  });
  it('白飛びは白、属性色、白の三段で0.15秒', () => {
    expect(knightPose(命中 + 20, true).flashTint).toBe(0);
    expect(knightPose(命中 + 70, true).flashTint).toBe(1);
    expect(knightPose(命中 + 120, true).flashTint).toBe(0);
    expect(knightPose(命中 + 120, true).flashAlpha).toBeGreaterThan(0);
    expect(knightPose(命中 + 160, true).flashAlpha).toBe(0);
    expect(knightPose(命中 - 10, true).flashAlpha).toBe(0);
  });
  it('残像は0.3秒、輪郭の光は0.6秒で消える', () => {
    expect(knightPose(命中 + 200, true).ghost).toBeGreaterThan(0);
    expect(knightPose(命中 + 310, true).ghost).toBe(0);
    expect(knightPose(命中 + 500, true).rim).toBeGreaterThan(0);
    expect(knightPose(命中 + 610, true).rim).toBe(0);
  });
  it('控えめモードでは白飛びが出ず、残像と輪郭の光は3分の1になる', () => {
    for (const ms of [命中 + 10, 命中 + 60, 命中 + 110, 命中 + 140]) {
      expect(knightPose(ms, true, false, 'attack', 1, true).flashAlpha).toBe(0);
      expect(knightPose(ms, true, false, 'attack', 1).flashAlpha).toBeGreaterThan(0);
    }
    const calm = knightPose(命中 + 200, true, false, 'attack', 1, true);
    const loud = knightPose(命中 + 200, true, false, 'attack', 1);
    expect(calm.ghost).toBeCloseTo(loud.ghost / 3, 5);
    expect(knightPose(命中 + 500, true, false, 'attack', 1, true).rim).toBeCloseTo(knightPose(命中 + 500, true, false, 'attack', 1).rim / 3, 5);
    // 控えめでないときの見た目は変えない。
    expect(loud.ghost).toBeGreaterThan(0);
  });
  it('動きを減らす設定では回転も移動も0にする', () => {
    const quiet = knightPose(命中 + 100, true, true, 'attack', 1);
    expect(quiet.spin).toBe(0); expect(quiet.push).toBe(0); expect(quiet.collapse).toBe(0);
  });
  it('見た目の設定が派手なほど強く崩れる', () => {
    const r = recipe({ count: 3 });
    const calm = reactionPower(r, 0, getPreset('calm'));
    const vivid = reactionPower(r, 0, getPreset('vivid'));
    const max = reactionPower(r, 0, getPreset('max'));
    expect(max).toBeGreaterThan(vivid);
    expect(vivid).toBeGreaterThan(calm);
    // 入力の量が多いときも同じ関係。
    expect(reactionPower(r, 1, getPreset('max'))).toBeGreaterThan(reactionPower(r, 1, getPreset('vivid')));
    expect(reactionPower(null, 0, getPreset('max'))).toBeGreaterThan(reactionPower(null, 0, getPreset('vivid')));
    // 設定を渡さないときは今まで通り「派手」。
    expect(reactionPower(r)).toBe(vivid);
  });
});

describe('騎士の置き方', () => {
  // 幅1000、高さ800の面に、画面1pxあたり2点で描く場合。
  const place = (pose: ReturnType<typeof knightPose>) => knightTransform(pose, 1000, 800, 2);
  it('描く絵と命中の位置は同じ計算から出る', () => {
    const t = place(knightPose(命中 + 100, true, false, 'attack', 1));
    // 絵は knightMatrix の行列で置く。命中の位置は同じ行列を点へ当てた結果になる。
    const m = knightMatrix(t), p = knightPoint(t, 300, 240);
    expect(p.x).toBeCloseTo(m.a * 300 + m.c * 240 + m.e, 10);
    expect(p.y).toBeCloseTo(m.b * 300 + m.d * 240 + m.f, 10);
  });
  it('命中の前は動かさず、足元は画面の高さの71.4%', () => {
    const t = place(knightPose(命中 - 500, true, false, 'attack', 1));
    expect(t.x).toBe(0); expect(t.y).toBe(0); expect(t.scale).toBe(1); expect(t.rot).toBe(0);
    expect(t.footX).toBe(500); expect(t.footY).toBeCloseTo(571.2, 10);
    const p = knightPoint(t, 480, 300);
    expect(p.x).toBeCloseTo(480, 10); expect(p.y).toBeCloseTo(300, 10);
  });
  it('命中の0.1秒後は上へ押されて縮み、右へ回る', () => {
    const t = place(knightPose(命中 + 100, true, false, 'attack', 1));
    expect(t.y).toBeCloseTo(-14.6667, 3);
    expect(t.scale).toBeCloseTo(.976296, 6);
    expect(t.rot).toBeCloseTo(.056109, 6);
    // 胸のあたりの点は上へ動き、回る分だけ右へずれる。
    const p = knightPoint(t, 500, 300);
    expect(p.y).toBeLessThan(300);
    expect(p.x).toBeGreaterThan(500);
  });
  it('動きを減らす設定では置き方も動かない', () => {
    const t = place(knightPose(命中 + 100, true, true, 'attack', 1));
    expect(t.y).toBe(0); expect(t.scale).toBe(1); expect(t.rot).toBe(0);
  });
});

describe('待機の構え', () => {
  const sword = (ms: number, reduced = false) => blendPose(knightPose(ms, false, reduced).weights).swordSwing;
  const half = IDLE_BREATH_SECONDS * 1000 / 2;
  it('待機でも剣を振りかぶり、ゆっくり上げ下げする', () => {
    // swordSwing は負の値ほど剣を後ろへ高く上げている。真下が0。
    expect(sword(0)).toBeLessThan(-1.4);
    // 周期の半分で一番高く上がり、一周で元へ戻る。
    expect(sword(half)).toBeLessThan(sword(0) - .1);
    expect(sword(half * 2)).toBeCloseTo(sword(0), 6);
    // 上半身をひねって半身に構える。
    expect(blendPose(knightPose(0, false).weights).turn).toBeGreaterThan(.1);
  });
  it('防御の回の溜めは、待機のどこよりも高く上げる', () => {
    // 剣の角は回り方が一周を超えることがあるので、数の大小ではなく「真上（πラジアン）からの差」で見る。
    // 差が小さいほど高い。待機は後ろ回りの負の角、溜めは前回りの正の角で、どちらも真上の手前にある。
    const 真上からの差 = (a: number) => { const n = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); return Math.abs(n - Math.PI); };
    // 溜めは確定の3秒前に上げきる。上げきったところを見る。
    const 溜め = blendPose(guardPose(ROUNDS[1].lock - 1000).weights).swordSwing;
    expect(真上からの差(溜め)).toBeLessThan(真上からの差(sword(half)) - .3);
    expect(真上からの差(溜め)).toBeLessThan(真上からの差(sword(0)) - .3);
  });
  it('動きを減らす設定では待機が止まる', () => {
    expect(sword(half, true)).toBeCloseTo(sword(0, true), 10);
  });
});

/**
 * 待機から防御の構えへ移るところ（一回目の受け渡し）で、姿勢が一コマで飛ばないことの確かめ。
 * 待機の息づかい（姿勢9）を一回目にだけ混ぜていたころは、ここで息づかいの分がまるごと消えていた。
 */
describe('待機から防御の構えへ移るとき、姿勢が飛ばない', () => {
  const 切り替え = GUARD_FROM * 1000;
  /** その時刻の姿勢の重み。切り替えの前は一回目、後ろは防御の回の作り方で出す。画面と同じ切り替え方。 */
  const 重み = (ms: number, reduced = false) =>
    (ms >= 切り替え ? guardPose(ms, reduced, 'block') : knightPose(ms, true, reduced, 'attack', .7, false)).weights;
  const 角度 = (ms: number, reduced = false) => blendPose(重み(ms, reduced));
  const KEYS = Object.keys(角度(0)) as Array<keyof ReturnType<typeof blendPose>>;

  it('切り替わる時刻の手前と後ろで、同じ姿勢になる', () => {
    const 前 = knightPose(切り替え, true, false, 'attack', .7, false).weights;
    const 後 = guardPose(切り替え, false, 'block').weights;
    expect(後).toEqual(前);
    // どちらにも息づかい（姿勢9）が入っている。入っていなければ、この確かめに意味がない。
    expect(後[9]).toBeGreaterThan(0);
    expect(後[9]).toBeCloseTo(idleSway(切り替え), 12);
  });
  it('1msずらしても値が飛ばない', () => {
    for (let ms = 切り替え - 200; ms <= 切り替え + 200; ms++) {
      const a = 角度(ms), b = 角度(ms + 1);
      // 構えへ移る1秒の間でも、1msあたりの動きは0.002ラジアン（0.1度）ほど。
      // 息づかいが消えていたころは、切り替えの1msで0.045ラジアン（2.6度）飛んでいた。
      for (const key of KEYS) expect(Math.abs(a[key] - b[key])).toBeLessThan(.005);
    }
  });
  it('姿勢の重みは、いつも合計1で負にならない', () => {
    for (let ms = 0; ms <= ROUNDS[2].end; ms += 50) {
      const w = 重み(ms);
      expect(w.reduce((sum: number, value: number) => sum + value, 0)).toBeCloseTo(1, 12);
      for (const value of w) expect(value).toBeGreaterThanOrEqual(0);
    }
  });
  it('動きを減らす設定では、防御の回でも息づかいを混ぜない', () => {
    for (const ms of [切り替え, 切り替え + 300, ROUNDS[1].start, ROUNDS[1].start + 500])
      expect(重み(ms, true)[9]).toBe(0);
  });
  it('構えより後ろの姿勢には、息づかいを混ぜない', () => {
    // 構え、溜め、振り下ろし、弾かれる、前屈、崩れ落ち。どれも待機（姿勢0）を含まない。
    for (const ms of [ROUNDS[1].start + 1000, ROUNDS[1].lock, ROUNDS[1].impact, ROUNDS[1].handoff, ROUNDS[2].impact, FINISH_FALL_TO_MS]) {
      expect(重み(ms)[9]).toBe(0);
      expect(重み(ms)[0]).toBe(0);
    }
  });
});

/** 胸の核の光。一回目の締め切りから溜まり、魔法が届く時刻でちょうど満ちる。 */
describe('胸の核の光', () => {
  it('魔法が届く時刻に満ちきる', () => {
    expect(coreCharge(first.inputEnd)).toBe(0);
    expect(coreCharge(first.inputEnd - 1000)).toBe(0);
    // 届く手前ではまだ満ちていない。満ちたまま待つ間を作らない。
    expect(coreCharge(first.impact - 100)).toBeLessThan(1);
    expect(coreCharge(first.impact - 100)).toBeGreaterThan(.9);
    expect(coreCharge(first.impact)).toBe(1);
    expect(coreCharge(first.impact + 2000)).toBe(1);
    // 途中はまっすぐ増える。
    expect(coreCharge((first.inputEnd + first.impact) / 2)).toBeCloseTo(.5, 6);
    // 始まる前（active でないとき）は光らない。
    expect(coreCharge(first.impact, false)).toBe(0);
  });
});

/**
 * とどめの回（56〜90秒）の崩れ落ち。時刻から姿勢と脱落を出す計算だけを試す。
 * ここで見る時刻はすべて世界の時刻で、騎士の render に来るミリ秒と同じもの。
 */
describe('とどめの崩れ落ち', () => {
  const at = (t: number) => guardPose(t * 1000, false, 'block');
  it('とどめの回は、膝をつき始めるまで前屈のまま', () => {
    for (const t of [finish.start, finish.chant, finish.inputEnd, finish.release, finish.impact, finish.finalBlow!].map(ms => ms / 1000).concat(膝 - .01)) {
      const pose = at(t);
      expect(pose.weights[7]).toBeCloseTo(1, 6);
      expect(pose.weights[8]).toBe(0);
      expect(pose.fall).toBe(0);
      expect(pose.state).toBe('exposed');
    }
  });
  it('とどめの一撃の1.3秒後から膝をつき、1.1秒でつききる', () => {
    expect(at(膝).weights[8]).toBeCloseTo(0, 6);
    const half = at((膝 + 倒れ始め) / 2);
    expect(half.weights[8]).toBeGreaterThan(.2);
    expect(half.weights[8]).toBeLessThan(.8);
    expect(half.weights[7]).toBeCloseTo(1 - half.weights[8], 10);
    expect(at(倒れ始め).weights[8]).toBeCloseTo(1, 6);
    expect(half.state).toBe('collapse');
  });
  it('膝をついたあと、1.1秒かけて手前へ倒れる', () => {
    const 途中 = (倒れ始め + 倒れきり) / 2;
    expect(at(倒れ始め - .01).fall).toBe(0);
    expect(at(途中).fall).toBeGreaterThan(.4);
    expect(at(途中).fall).toBeLessThan(.6);
    expect(at(倒れきり).fall).toBe(1);
    // 倒れる途中は増えるだけで戻らない。
    for (let t = 倒れ始め; t < 倒れきり; t += .02) expect(at(t + .02).fall).toBeGreaterThanOrEqual(at(t).fall);
  });
  it('倒れきってから後は何も動かない', () => {
    const down = at(倒れきり);
    expect(down.state).toBe('down');
    // 呼吸の揺れも止める。
    expect(down.breath).toBe(0);
    for (const t of [倒れきり + .5, finish.handoff / 1000, finish.end / 1000 - 1, finish.end / 1000]) {
      expect(at(t)).toEqual(down);
      expect(at(t).state).toBe('down');
    }
  });
  it('控えめモードでも崩れ落ちは残す', () => {
    const 途中 = (倒れ始め + 倒れきり) / 2;
    const quiet = guardPose(途中 * 1000, true, 'block'), loud = at(途中);
    expect(quiet.fall).toBe(loud.fall);
    expect(quiet.weights).toEqual(loud.weights);
    expect(quiet.state).toBe(loud.state);
  });
});

describe('とどめの部品の脱落', () => {
  it('落ちる時刻は多段命中の一覧から作る', () => {
    const map = Object.fromEntries(FINISH_DROPS.map(drop => [drop.key, drop.at]));
    const [一, 二, 三, 四] = FINISH_HIT_MS.map(ms => ms / 1000);
    expect(map.shoulderSpike).toBeCloseTo(一, 6);
    expect(map.shield).toBeCloseTo(二, 6);
    expect(map.horn).toBeCloseTo(三, 6);
    expect(map.chestPlate).toBeCloseTo(四, 6);
    expect(map.core).toBeCloseTo(FINAL_BLOW_AT + .3, 6);
    expect(map.sword).toBeCloseTo(FINISH_SWORD_DROP_MS / 1000, 6);
    // 時刻は前から順に進む。
    for (let i = 1; i < FINISH_DROPS.length; i++) expect(FINISH_DROPS[i].at).toBeGreaterThan(FINISH_DROPS[i - 1].at);
  });
  it('一発目で肩の棘が落ち、とどめの0.6秒後に剣が落ちる', () => {
    const 剣 = FINISH_SWORD_DROP_MS / 1000, 一 = FINISH_HIT_MS[0] / 1000, 四 = FINISH_HIT_MS[3] / 1000;
    expect(droppedAt(一 - .01)).toEqual([]);
    expect(droppedAt(一)).toEqual(['shoulderSpike']);
    expect(droppedAt(四 + .01)).toEqual(['shoulderSpike', 'shield', 'horn', 'chestPlate']);
    expect(droppedAt(剣 - .01)).not.toContain('sword');
    expect(droppedAt(剣)).toContain('sword');
    expect(droppedAt(finish.end / 1000)).toHaveLength(6);
  });
  it('落ちた部品は床で1回跳ねて止まる', () => {
    const v = { vx: .8, vy: 1.4, vz: -1.2, spin: 5 };
    const trace = [];
    for (let dt = 0; dt <= 4; dt += .02) trace.push(debrisMotion(dt, 2, v));
    // 床より下へは行かない。
    for (const step of trace) expect(step.y).toBeGreaterThanOrEqual(0);
    // 一度上がってから落ち、跳ねてまた上がり、最後は止まる。
    expect(Math.max(...trace.map(s => s.y))).toBeGreaterThan(2);
    const last = trace.at(-1)!;
    expect(last.y).toBe(0);
    expect(last.resting).toBe(true);
    // 止まった後は動かない。
    expect(debrisMotion(9, 2, v)).toEqual(last);
    // 高さ0から落ちても床より下へ行かない。
    expect(debrisMotion(1, 0, { vx: 0, vy: 0, vz: 0, spin: 0 }).y).toBe(0);
  });
});

describe('とどめの核の明滅', () => {
  const 始まり = finish.start / 1000, 案内 = finish.chant / 1000, 確定 = finish.lock / 1000;
  it('回の始まりからは2秒に1回、詠唱の案内からは1秒に1回', () => {
    expect(coreBlink(始まり - .1)).toBe(0);
    // 2秒に1回。回の始まりで中ほど、0.5秒後に最大、1.5秒後に最小。
    expect(coreBlink(始まり)).toBeCloseTo(.5, 6);
    expect(coreBlink(始まり + .5)).toBeCloseTo(1, 6);
    expect(coreBlink(始まり + 1.5)).toBeCloseTo(0, 6);
    expect(coreBlink(始まり + 2.5)).toBeCloseTo(1, 6);
    // 1秒に1回へ速まる。
    expect(coreBlink(案内 + .25)).toBeCloseTo(1, 6);
    expect(coreBlink(案内 + .75)).toBeCloseTo(0, 6);
    expect(coreBlink(案内 + 1.25)).toBeCloseTo(1, 6);
  });
  it('確定の0.4秒前から1秒で最大の明るさになり、そのまま保つ', () => {
    for (const t of [確定 + .6, finish.release / 1000, finish.impact / 1000, finish.finalBlow! / 1000, finish.end / 1000])
      expect(coreBlink(t)).toBeCloseTo(1, 6);
    // 途中は上がっていくだけ。
    for (let t = 確定 - .4; t < 確定 + .6; t += .05) expect(coreBlink(t + .05)).toBeGreaterThanOrEqual(coreBlink(t) - 1e-9);
  });
  it('0〜1の間に収まる', () => {
    for (let t = 始まり - 1; t <= finish.end / 1000; t += .05) {
      expect(coreBlink(t)).toBeGreaterThanOrEqual(0);
      expect(coreBlink(t)).toBeLessThanOrEqual(1);
    }
  });
});

describe('核の脈打ちはとどめの回の始まりでつながる', () => {
  const 始まり = finish.start / 1000;
  it('境目の前後で明るさが飛ばない', () => {
    expect(Math.abs(corePulse(始まり + .01) - corePulse(始まり - .01))).toBeLessThanOrEqual(.05);
    // 混ぜ終わる境目より前は、今までの速い脈のまま。
    expect(corePulse(始まり - .5)).toBeCloseTo(idlePulse(始まり - .5), 6);
    // 境目から後は、とどめの回の明滅そのもの。
    for (const t of [始まり, 始まり + .5, 始まり + 4.5, finish.release / 1000]) expect(corePulse(t)).toBeCloseTo(coreBlink(t), 6);
  });
  it('混ぜている間も0〜1に収まり、急に飛ばない', () => {
    let previous = corePulse(始まり - 1);
    for (let t = 始まり - 1; t <= 始まり + 1; t += .01) {
      const now = corePulse(t);
      expect(now).toBeGreaterThanOrEqual(0);
      expect(now).toBeLessThanOrEqual(1);
      expect(Math.abs(now - previous)).toBeLessThanOrEqual(.08);
      previous = now;
    }
  });
});

describe('とどめの白飛び', () => {
  const alpha = (t: number, reduced = false) => guardPose(t * 1000, reduced, 'block').flashAlpha;
  it('4回の命中はそれぞれ0.08秒の白', () => {
    for (const ms of FINISH_HIT_MS) {
      const at = ms / 1000;
      expect(alpha(at - .01)).toBe(0);
      expect(alpha(at)).toBeCloseTo(FINISH_FLASH.hitAlpha, 6);
      expect(alpha(at + FINISH_FLASH.hit - .001)).toBeCloseTo(FINISH_FLASH.hitAlpha, 6);
      expect(alpha(at + FINISH_FLASH.hit + .001)).toBe(0);
      // 命中の白に属性色は混ぜない。
      expect(guardPose(ms, false, 'block').flashTint).toBe(0);
    }
  });
  it('直撃は白、属性色、白の三段で0.15秒', () => {
    const 直撃 = FINAL_BLOW_AT;
    expect(alpha(直撃 - .01)).toBe(0);
    expect(alpha(直撃)).toBeCloseTo(.85, 6);
    expect(guardPose(直撃 * 1000, false, 'block').flashTint).toBe(0);
    expect(guardPose((直撃 + .06) * 1000, false, 'block').flashTint).toBe(1);
    expect(alpha(直撃 + .06)).toBeCloseTo(.65, 6);
    expect(guardPose((直撃 + .12) * 1000, false, 'block').flashTint).toBe(0);
    expect(alpha(直撃 + .12)).toBeCloseTo(.45, 6);
    expect(alpha(直撃 + FINISH_FLASH.blow + .001)).toBe(0);
  });
  it('控えめモードでは3分の1になる', () => {
    expect(alpha(FINISH_HIT_MS[0] / 1000, true)).toBeCloseTo(FINISH_FLASH.hitAlpha / 3, 6);
    expect(alpha(FINAL_BLOW_AT, true)).toBeCloseTo(.85 / 3, 6);
  });
});

describe('崩れ落ちの時刻は一か所で決める', () => {
  it('膝をつき始める時刻は回の表の値と同じ', () => {
    expect(KNEEL_AT).toBe(FINISH_COLLAPSE_MS / 1000);
    expect(KNEEL_AT).toBeCloseTo(FINAL_BLOW_AT + 1.3, 6);
  });
});

/**
 * 一回目と防御の姿勢を、うっかり変えていないことの確かめ。
 * 一回目と防御の終わりまでを0.1秒刻みで全部並べた値から、決まった手順で一つの数を作って固定しておく。
 * 待機に息づかい（姿勢9）を足したときと、その息づかいを防御の待機にも混ぜたときに、この数を取り直した。
 * 見るのは混ぜ方と反応の値で、角度の表そのものはこの数に入らない（角度は「待機の構え」の試験で見る）。
 * 変えたつもりがないのに数が変わったら、直し過ぎている。
 */
describe('一回目と防御の姿勢は変わらない', () => {
  it('防御の終わりまでの姿勢の値が決めたとおりのまま', () => {
    const values: number[] = [];
    for (let ms = 0; ms <= ROUNDS[1].end; ms += 100) {
      const p = ms >= GUARD_FROM * 1000 ? guardPose(ms, false, 'block') : knightPose(ms, true, false, 'attack', .7, false);
      // 崩れ落ちの姿勢は、防御の終わりまでは一度も混ざらない。
      expect(p.weights[8] ?? 0).toBe(0);
      expect(p.fall).toBe(0);
      values.push(...p.weights, p.lean, p.breath, p.flash, p.shake, p.strength, p.push, p.collapse, p.spin, p.flashAlpha, p.flashTint, p.ghost, p.rim);
    }
    expect(values.length).toBe((ROUNDS[1].end / 100 + 1) * 22);
    let digest = 0;
    for (const value of values) digest = (digest * 31 + Math.round(value * 1e9)) % 2147483647;
    expect(digest).toBe(809665487);
  });
  it('とどめの命中までは部品が一つも落ちない', () => {
    for (let t = 0; t <= FINISH_HIT_MS[0] / 1000 - .1; t += .1) expect(droppedAt(t)).toEqual([]);
  });
});

/**
 * 落ちた盾と剣の行き先。手前（視点の側）へ寄せると画面いっぱいに映るので、
 * 足元の左右へ落として床で止める。
 */
describe('盾と剣は足元の左右へ落ちる', () => {
  it('手前へは飛ばさない', () => {
    for (const key of ['shield', 'sword'] as const) {
      const v = FINISH_THROWS[key];
      // zの負の向きが視点の側。盾と剣はそちらへ動かさない。
      expect(v.vz).toBeGreaterThanOrEqual(0);
      // 横へ流す量のほうが大きい。盾は右、剣は左。
      expect(Math.abs(v.vx)).toBeGreaterThan(Math.abs(v.vz));
    }
    expect(FINISH_THROWS.shield.vx).toBeGreaterThan(0);
    expect(FINISH_THROWS.sword.vx).toBeLessThan(0);
  });
  it('肩の高さから落として、足元の1.5m以内で止まる', () => {
    // 盾は腕のあたり（高さ約1m）、剣は握りのあたり（高さ約0.8m）から落ちる。
    for (const [key, height] of [['shield', 1], ['sword', .8]] as const) {
      const v = FINISH_THROWS[key];
      const rest = debrisMotion(9, height - v.floor, v);
      expect(rest.resting).toBe(true);
      expect(rest.y).toBe(0);
      expect(Math.abs(rest.x)).toBeLessThan(1.5);
      expect(Math.abs(rest.z)).toBeLessThan(.5);
    }
  });
  it('床で止まる高さを持てる', () => {
    expect(FINISH_THROWS.shield.floor).toBeGreaterThan(0);
    expect(FINISH_THROWS.sword.floor).toBeGreaterThan(0);
    // 小さい部品は床に置いたままでよい。
    expect(FINISH_THROWS.horn.floor).toBe(0);
  });
});

describe('倒れ込みの深さ', () => {
  it('回す角と近づける量は控えめにする', () => {
    // 近づけすぎると兜の上面だけの黒い形が画面いっぱいになる。
    expect(FALL_TURN).toBeLessThanOrEqual(1);
    expect(FALL_NEAR).toBeLessThanOrEqual(.3);
    expect(FALL_TURN).toBeGreaterThan(.8);
    expect(FALL_NEAR).toBeGreaterThan(.1);
  });
  it('倒れた体の一番上は、以前の視点の高さより下に収まる', () => {
    // 足元を軸に回した後、膝をついた分（crouch）だけ下がる。
    // 騎士の高さは2.93m、以前の視点の高さは約0.95m。見上げる視点（高さ0.5m）での映り方は knight-view の試験で見る。
    const top = 2.93 * Math.cos(FALL_TURN) - .92;
    expect(top).toBeLessThan(.95);
  });
});
