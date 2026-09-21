import { describe,it,expect } from 'vitest';
import { BATTLE_END,BEATS,ROUNDS,beatAt,beatOf,phaseAt,roundAt,replyLimitOf,speechLimitOf } from '../src/game/rounds';
import { Battle } from '../src/game/battle';
import { FINISH_SLOW,FINISH_STOPS,FINISH_TILT,FINISH_ZOOM,HIT_STOPS,HIT_ZOOM,SHAKE_TILT,WARP_LIMITS,effectTime,screenState,warpOf,warpReal,warpTime } from '../src/render/effects/screen';
import { postHeavyActive,postToOf } from '../src/render/composite';
import { presets } from '../src/render/effects/presets';
import { dueSounds } from '../src/audio/cues';

const first=ROUNDS[0],defend=ROUNDS[1],finish=ROUNDS[2];
const finishBeat=beatOf(finish);

describe('とどめの回の時刻表',()=>{
  it('三回目の場面の境目を固定する',()=>{
    for(const [time,phase] of [[39999,'ready'],[40000,'draw'],[43999,'draw'],[44000,'chant'],[48999,'chant'],[49000,'complete'],[51999,'complete'],[52000,'release'],[56999,'release'],[57000,'handoff'],[60000,'finished']] as const)
      expect(phaseAt(time,finish)).toBe(phase);
  });
  it('40秒からはとどめの回になり、戦いは60秒で終わる',()=>{
    expect(roundAt(39999).id).toBe('defend');expect(roundAt(40000).id).toBe('finish');
    expect(BATTLE_END).toBe(60000);
    expect(beatAt(45).finish).toBe(true);expect(beatAt(30).finish).toBe(false);
    expect(BEATS.length).toBe(3);
  });
  it('締め切りから確定までは2秒。声の待ちと打ち切りは前の二回と同じ割り方',()=>{
    expect(finish.lock-finish.inputEnd).toBe(2000);
    expect(defend.lock-defend.inputEnd).toBe(2000);
    expect(speechLimitOf(finish)).toBe(50400);expect(replyLimitOf(finish)).toBe(50900);
  });
  it('とどめの一撃は最初の到達より後、余韻の始まりより前',()=>{
    expect(finish.finalBlow).not.toBeNull();
    expect(finish.finalBlow!).toBeGreaterThan(finish.impact);
    expect(finish.finalBlow!).toBeLessThan(finish.handoff);
    expect(first.finalBlow).toBeNull();expect(defend.finalBlow).toBeNull();
    expect(finishBeat.finalBlow).toBe(54.5);
  });
});

describe('世界の時計のゆがみ',()=>{
  /** 前までの式。命中で hitStop 秒だけ止めるだけのもの。 */
  const before=(t:number,hitStop:number,impact:number)=>t<impact||hitStop<=0?t:impact+Math.max(0,t-impact-hitStop);
  it('防御の世界の時刻は今までと1ミリ秒刻みで完全に同じ。一回目も止めが無ければ同じ',()=>{
    // 一回目の止めがあるときは、命中のあとに二度止め直す三段になる（tests/screen.test.ts）。
    const 組=[[BEATS[0],[0]],[BEATS[1],[0,HIT_STOPS.weak,HIT_STOPS.strong,HIT_STOPS.finish]]] as const;
    for(const [beat,止め] of 組)for(const hitStop of 止め){
      let 違い=0;
      for(let ms=0;ms<=40000;ms++){const t=ms/1000;if(effectTime(t,hitStop,beat)!==before(t,hitStop,beat.impact))違い++;}
      expect(違い,`停止${hitStop}秒`).toBe(0);
    }
  });
  it('とどめの回でも時計は戻らない',()=>{
    let 前=-1;
    for(let ms=0;ms<=60000;ms++){const 世界=effectTime(ms/1000,HIT_STOPS.strong,finishBeat);expect(世界).toBeGreaterThanOrEqual(前);前=世界;}
  });
  it('設計の表どおりの時刻になる',()=>{
    const 世界=(t:number)=>effectTime(t,HIT_STOPS.strong,finishBeat);
    expect(世界(53.70)).toBeCloseTo(53.60,6);
    expect(世界(54.85)).toBeCloseTo(54.50,6);
    expect(世界(55.65)).toBeCloseTo(54.925,6);
    expect(世界(60.0)).toBeCloseTo(59.275,6);
    // 止めている間は進まない。
    expect(世界(53.65)).toBeCloseTo(53.60,6);
    expect(世界(54.70)).toBeCloseTo(54.50,6);
  });
  it('遅れの合計は0.8秒まで、止めは3回まで',()=>{
    const warp=warpOf(finishBeat,HIT_STOPS.strong);
    expect(warp.stops.length).toBeLessThanOrEqual(WARP_LIMITS.stops);
    expect(60-effectTime(60,HIT_STOPS.strong,finishBeat)).toBeLessThanOrEqual(WARP_LIMITS.delay);
    expect(60-effectTime(60,HIT_STOPS.strong,finishBeat)).toBeCloseTo(.725,6);
  });
  it('とどめのゆがみは、本人の魔法（派手さや停止の長さ）で変わらない',()=>{
    const 見本=JSON.stringify(warpOf(finishBeat,HIT_STOPS.weak));
    for(const hitStop of [HIT_STOPS.weak,HIT_STOPS.strong,HIT_STOPS.finish,.5])
      expect(JSON.stringify(warpOf(finishBeat,hitStop))).toBe(見本);
    for(const hitStop of [HIT_STOPS.weak,HIT_STOPS.finish])
      expect(effectTime(56,hitStop,finishBeat)).toBe(effectTime(56,HIT_STOPS.strong,finishBeat));
  });
  it('止めは表の時刻から作り、数字を埋め込んでいない',()=>{
    const warp=warpOf(finishBeat,HIT_STOPS.strong);
    expect(warp.stops[0]).toEqual({at:finishBeat.impact,hold:FINISH_STOPS.impact});
    expect(warp.stops[1]).toEqual({at:finishBeat.finalBlow,hold:FINISH_STOPS.finalBlow});
    expect(warp.slow).toEqual({from:finishBeat.finalBlow!+FINISH_SLOW.after,seconds:FINISH_SLOW.seconds,rate:FINISH_SLOW.rate});
  });
  it('控えめモードでは止めがなくなり、スローだけ残る',()=>{
    const warp=warpOf(finishBeat,0);
    expect(warp.stops.every(stop=>stop.hold===0)).toBe(true);
    expect(warp.slow).not.toBeNull();
    // 止めがないので、スローに入るまでは実際の時刻と同じ。
    expect(warpTime(54.7,warp)).toBeCloseTo(54.7,6);
    expect(warpTime(55.3,warp)).toBeCloseTo(54.8+.25*.5,6);
  });
});

describe('とどめの回の画面',()=>{
  const state=(t:number,calm=false)=>screenState(t,2,presets.vivid,'attack',0,0,calm,finishBeat);
  // 直撃は世界の54.5秒に置いてあり、一発目の止め0.10秒だけ遅れるので、実際は54.6秒に見える。
  const 直撃の実際=54.6;
  it('発動、一発目、直撃で全画面の白が出て、直撃が一番強い',()=>{
    const 発動=state(52.01).flash,一発目=state(53.61).flash,直撃=state(直撃の実際+.01).flash;
    expect(発動).toBeGreaterThan(0);expect(一発目).toBeGreaterThan(0);
    expect(直撃).toBeGreaterThanOrEqual(一発目);expect(直撃).toBeGreaterThan(発動);
    // 直撃の白はいっぱいまで出す。0.16秒で引く。
    expect(state(直撃の実際).flash).toBeGreaterThan(state(直撃の実際+.1).flash);
    expect(state(直撃の実際+.2).flash).toBe(0);
  });
  it('直撃の光と傾きは、絵と同じ実際の54.6秒に出る',()=>{
    // 世界の54.5秒のままだと、絵より0.1秒早く光ってしまう。
    expect(state(54.5).rotate).toBe(0);
    expect(state(54.5).flash).toBeLessThan(state(直撃の実際).flash);
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
    // 控えめは世界を止めないので、直撃は世界の時刻と同じ54.5秒に来る。
    const 直撃=state(54.5,true);
    expect(直撃.rotate).toBe(0);expect(直撃.zoom).toBe(1);expect(直撃.chromatic).toBe(0);
    expect(直撃.flash).toBeGreaterThan(0);
  });
  it('とどめの画面のゆれは、本人の魔法の用途では変わらない',()=>{
    const 攻撃=screenState(53.7,2,presets.vivid,'attack',0,0,false,finishBeat);
    const 補助=screenState(53.7,2,presets.vivid,'enhance',0,0,false,finishBeat);
    expect(補助.shakeX).toBe(攻撃.shakeX);expect(補助.shakeY).toBe(攻撃.shakeY);
    expect(補助.rotate).toBeCloseTo(攻撃.rotate,9);
  });
  it('発動の直前（51.92〜52.0秒）に暗転する',()=>{
    expect(state(51.91).blackout).toBe(0);
    expect(state(51.97).blackout).toBeGreaterThan(.5);
    expect(state(51.99).blackout).toBe(1);
    expect(state(52).blackout).toBe(0);
  });
  it('一回目の画面は、とどめの足し算を入れても一回目の決まり（傾き2度、寄り1.18倍）のまま',()=>{
    for(let t=17;t<24;t+=.01){
      const s=screenState(t,3,presets.max,'attack');
      expect(Math.abs(s.rotate)).toBeLessThanOrEqual(SHAKE_TILT);
      expect(s.zoom).toBeLessThan(HIT_ZOOM*1.03+.001);
    }
  });
});

describe('とどめの回の部品',()=>{
  it('重い後処理は世界の51.9〜57.775秒（実際の58.5秒）だけ出す',()=>{
    // postHeavyActive は世界の時刻で比べる。実際の58.5秒は、遅れ0.725秒を引いた世界の57.775秒。
    expect(postToOf(finishBeat)).toBeCloseTo(57.775,6);
    expect(warpReal(postToOf(finishBeat),warpOf(finishBeat,HIT_STOPS.strong))).toBeCloseTo(58.5,6);
    expect(postHeavyActive(51.89,finishBeat)).toBe(false);
    expect(postHeavyActive(51.9,finishBeat)).toBe(true);
    expect(postHeavyActive(54.5,finishBeat)).toBe(true);
    expect(postHeavyActive(57.7,finishBeat)).toBe(true);
    expect(postHeavyActive(57.775,finishBeat)).toBe(false);
    // 一回目と防御は今までどおり、命中の2.5秒後まで。
    expect(postToOf(BEATS[0])).toBeCloseTo(21,6);
    expect(postToOf(BEATS[1])).toBeCloseTo(37.9,6);
  });
  it('とどめの回の音が回の表から作られる',()=>{
    expect(dueSounds(51990,52010,false).map(c=>c.name)).toEqual(['release']);
    expect(dueSounds(53590,53610,false).map(c=>c.name)).toEqual(['impact']);
    // とどめの一撃は世界の54.5秒に置いてあるので、鳴るのは実際の54.6秒。
    expect(dueSounds(54490,54510,false).map(c=>c.name)).toEqual([]);
    expect(dueSounds(54590,54610,false).map(c=>c.name)).toEqual(['finish']);
    expect(dueSounds(56990,57010,false).map(c=>c.name)).toEqual(['settle']);
    // とどめの一撃の音は、持たない回には出ない。
    expect(dueSounds(18000,24000,false).map(c=>c.name)).not.toContain('finish');
  });
  it('光点だけ先に渡しても、あとから決まった魔法を次の回へ渡せる',()=>{
    let now=0;const battle=new Battle(()=>now);
    for(let i=0;i<40;i++)battle.first.motion.add(.3+i*.01,.5+Math.sin(i/6)*.1,i*100);
    now=16000;battle.tick();
    // 引き渡しの時刻に、線はあるが魔法がまだ無い状態を作る。
    const 魔法=battle.first.recipe;battle.first.recipe=null;
    now=23000;battle.tick();
    expect(battle.inherited.length).toBeGreaterThan(0);
    const 光点の数=battle.inherited.length;
    expect(battle.defend.previous).toBeNull();
    // そのあとに魔法が決まったら、次の回へ渡る。光点は二度足さない。
    battle.first.recipe=魔法;
    now=23500;battle.tick();
    expect(battle.defend.previous?.name).toBe(魔法?.name);
    expect(battle.inherited.length).toBe(光点の数);
  });
  it('三回分の魔法が並び、引き継ぐ光点は6個まで',()=>{
    let now=0;const battle=new Battle(()=>now);
    expect(battle.casts.length).toBe(3);
    expect(battle.finish.round.id).toBe('finish');
    for(let i=0;i<40;i++)battle.first.motion.add(.3+i*.01,.5+Math.sin(i/6)*.1,i*100);
    now=23000;battle.tick();
    expect(battle.inherited.length).toBeLessThanOrEqual(3);
    now=24000;battle.tick();
    for(let i=0;i<40;i++)battle.defend.motion.add(.4+i*.008,.55+Math.cos(i/5)*.1,24000+i*100);
    now=39000;battle.tick();
    expect(battle.inherited.length).toBeGreaterThan(3);
    expect(battle.inherited.length).toBeLessThanOrEqual(6);
    expect(battle.finish.previous?.name).toBe(battle.defend.recipe?.name);
    now=45000;battle.tick();
    expect(battle.inherited.length).toBeLessThanOrEqual(6);
    expect(battle.report().scope).toBe('full-60-seconds');
    expect(battle.report().rounds.length).toBe(3);
  });
});
