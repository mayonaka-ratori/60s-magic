import { describe,it,expect } from 'vitest';
import { BEATS,ROUNDS,beatOf } from '../src/game/rounds';
import { Battle } from '../src/game/battle';
import { FINISH_SLOW,FINISH_STOPS,FINISH_TILT,HIT_STOPS,effectTime,screenState,warpOf,warpReal,warpTime } from '../src/render/effects/screen';
import { postHeavyActive,postToOf } from '../src/render/composite';
import { presets } from '../src/render/effects/presets';

const first=ROUNDS[0],defend=ROUNDS[1],finish=ROUNDS[2];
const finishBeat=beatOf(finish);
/** とどめの一撃の時刻（世界の秒）と、止めの分だけ遅れて見える実際の時刻。 */
const 直撃=finishBeat.finalBlow!,直撃の実際=直撃+FINISH_STOPS.impact;
/** とどめの回でたまる遅れの合計（秒）。止め2回とスローの分。 */
const 遅れ=FINISH_STOPS.impact+FINISH_STOPS.finalBlow+FINISH_SLOW.seconds*(1-FINISH_SLOW.rate);

describe('とどめの回の時刻表',()=>{
  it('とどめの一撃は最初の到達より後、余韻の始まりより前',()=>{
    expect(finish.finalBlow).not.toBeNull();
    expect(finish.finalBlow!).toBeGreaterThan(finish.impact);
    expect(finish.finalBlow!).toBeLessThan(finish.handoff);
    expect(first.finalBlow).toBeNull();expect(defend.finalBlow).toBeNull();
    expect(finishBeat.finalBlow).toBe(78.5);
  });
});

describe('世界の時計のゆがみ',()=>{
  it('設計の表どおりの時刻になる',()=>{
    const 世界=(t:number)=>effectTime(t,HIT_STOPS.strong,finishBeat);
    // 一発目で0.10秒、直撃で0.25秒止まる。そのぶん実際の時刻は後ろへずれる。
    expect(世界(finishBeat.impact+FINISH_STOPS.impact)).toBeCloseTo(finishBeat.impact,6);
    expect(世界(直撃の実際+FINISH_STOPS.finalBlow)).toBeCloseTo(直撃,6);
    expect(世界(finishBeat.end)).toBeCloseTo(finishBeat.end-遅れ,6);
    // 止めている間は進まない。
    expect(世界(finishBeat.impact+.05)).toBeCloseTo(finishBeat.impact,6);
    expect(世界(直撃の実際+.1)).toBeCloseTo(直撃,6);
  });
  it('とどめのゆがみは、本人の魔法（派手さや停止の長さ）で変わらない',()=>{
    const 見本=JSON.stringify(warpOf(finishBeat,HIT_STOPS.weak));
    for(const hitStop of [HIT_STOPS.weak,HIT_STOPS.strong,HIT_STOPS.finish,.5])
      expect(JSON.stringify(warpOf(finishBeat,hitStop))).toBe(見本);
    for(const hitStop of [HIT_STOPS.weak,HIT_STOPS.finish])
      expect(effectTime(finishBeat.handoff,hitStop,finishBeat)).toBe(effectTime(finishBeat.handoff,HIT_STOPS.strong,finishBeat));
  });
  it('控えめモードでは止めがなくなり、スローだけ残る',()=>{
    const warp=warpOf(finishBeat,0);
    expect(warp.stops.every(stop=>stop.hold===0)).toBe(true);
    expect(warp.slow).not.toBeNull();
    // 止めがないので、スローに入るまでは実際の時刻と同じ。
    expect(warpTime(直撃+.2,warp)).toBeCloseTo(直撃+.2,6);
    expect(warpTime(直撃+.8,warp)).toBeCloseTo(直撃+.3+.25*.5,6);
  });
});

describe('とどめの回の画面',()=>{
  const state=(t:number,calm=false)=>screenState(t,2,presets.vivid,'attack',0,0,calm,finishBeat);
  it('発動、一発目、直撃で全画面の白が出て、直撃が一番強い',()=>{
    const 発動=state(finishBeat.release+.01).flash,一発目=state(finishBeat.impact+.01).flash,直撃=state(直撃の実際+.01).flash;
    expect(発動).toBeGreaterThan(0);expect(一発目).toBeGreaterThan(0);
    expect(直撃).toBeGreaterThanOrEqual(一発目);expect(直撃).toBeGreaterThan(発動);
    // 直撃の白はいっぱいまで出す。0.16秒で引く。
    expect(state(直撃の実際).flash).toBeGreaterThan(state(直撃の実際+.1).flash);
    expect(state(直撃の実際+.2).flash).toBe(0);
  });
  it('直撃の光と傾きは、絵と同じ実際の時刻に出る',()=>{
    // 世界の時刻のままだと、絵より0.1秒早く光ってしまう。
    expect(state(直撃).rotate).toBe(0);
    expect(state(直撃).flash).toBeLessThan(state(直撃の実際).flash);
    expect(state(直撃の実際).rotate).toBeCloseTo(FINISH_TILT,3);
  });
  it('直撃で傾き2度、寄り1.2倍になり、色がずれる',()=>{
    const 直撃=state(直撃の実際);
    expect(直撃.rotate).toBeCloseTo(FINISH_TILT,3);
    expect(直撃.zoom).toBeGreaterThan(1.19);expect(直撃.zoom).toBeLessThan(1.25);
    expect(直撃.chromatic).toBeGreaterThan(0);
    // 0.3秒で元へ戻る。
    expect(state(直撃の実際+.35).rotate).toBeLessThan(.1);
    expect(state(直撃の実際+.35).zoom).toBeLessThan(1.05);
  });
  it('控えめモードでは傾きも寄りも足さない',()=>{
    // 控えめは世界を止めないので、直撃は世界の時刻のままに来る。
    const 様子=state(直撃,true);
    expect(様子.rotate).toBe(0);expect(様子.zoom).toBe(1);expect(様子.chromatic).toBe(0);
    expect(様子.flash).toBeGreaterThan(0);
  });
  it('とどめの画面のゆれは、本人の魔法の用途では変わらない',()=>{
    const 攻撃=screenState(finishBeat.impact+.1,2,presets.vivid,'attack',0,0,false,finishBeat);
    const 補助=screenState(finishBeat.impact+.1,2,presets.vivid,'enhance',0,0,false,finishBeat);
    expect(補助.shakeX).toBe(攻撃.shakeX);expect(補助.shakeY).toBe(攻撃.shakeY);
    expect(補助.rotate).toBeCloseTo(攻撃.rotate,9);
  });
});

describe('とどめの回の部品',()=>{
  it('重い後処理を切るのは、とどめでは余韻の1.5秒後、一回目と防御は命中の2.5秒後',()=>{
    // postHeavyActive は世界の時刻で比べる。切るのは魔法名が引くところ。
    const 切る=finishBeat.handoff+1.5;
    expect(postToOf(finishBeat)).toBeCloseTo(切る,6);
    expect(warpReal(postToOf(finishBeat),warpOf(finishBeat,HIT_STOPS.strong))).toBeCloseTo(切る+遅れ,6);
    expect(postHeavyActive(直撃,finishBeat)).toBe(true);
    expect(postHeavyActive(切る-.1,finishBeat)).toBe(true);
    expect(postHeavyActive(切る,finishBeat)).toBe(false);
    // 一回目と防御は今までどおり、命中の2.5秒後まで。一回目は26.0秒、防御は52.9秒。
    expect(postToOf(BEATS[0])).toBeCloseTo(26,6);
    expect(postToOf(BEATS[1])).toBeCloseTo(52.9,6);
  });
  it('光点だけ先に渡しても、あとから決まった魔法を次の回へ渡せる',()=>{
    let now=0;const battle=new Battle(()=>now);
    for(let i=0;i<40;i++)battle.first.motion.add(.3+i*.01,.5+Math.sin(i/6)*.1,i*100);
    now=first.lock;battle.tick();
    // 引き渡しの時刻に、線はあるが魔法がまだ無い状態を作る。
    const 魔法=battle.first.recipe;battle.first.recipe=null;
    now=first.handoff;battle.tick();
    expect(battle.inherited.length).toBeGreaterThan(0);
    const 光点の数=battle.inherited.length;
    expect(battle.defend.previous).toBeNull();
    // そのあとに魔法が決まったら、次の回へ渡る。光点は二度足さない。
    battle.first.recipe=魔法;
    now=first.handoff+500;battle.tick();
    expect(battle.defend.previous?.name).toBe(魔法?.name);
    expect(battle.inherited.length).toBe(光点の数);
  });
  it('三回分の魔法が並び、引き継ぐ光点は6個まで',()=>{
    let now=0;const battle=new Battle(()=>now);
    expect(battle.casts.length).toBe(3);
    expect(battle.finish.round.id).toBe('finish');
    for(let i=0;i<40;i++)battle.first.motion.add(.3+i*.01,.5+Math.sin(i/6)*.1,i*100);
    now=first.handoff;battle.tick();
    expect(battle.inherited.length).toBeLessThanOrEqual(3);
    now=defend.start;battle.tick();
    for(let i=0;i<40;i++)battle.defend.motion.add(.4+i*.008,.55+Math.cos(i/5)*.1,defend.start+i*100);
    now=defend.handoff;battle.tick();
    expect(battle.inherited.length).toBeGreaterThan(3);
    expect(battle.inherited.length).toBeLessThanOrEqual(6);
    expect(battle.finish.previous?.name).toBe(battle.defend.recipe?.name);
    now=finish.chant;battle.tick();
    expect(battle.inherited.length).toBeLessThanOrEqual(6);
    expect(battle.report().scope).toBe('full-90-seconds');
    expect(battle.report().rounds.length).toBe(3);
  });
});
