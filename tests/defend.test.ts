import { describe,it,expect } from 'vitest';
import { ROUNDS,BATTLE_END,beatAt,phaseAt,roundAt,speechLimitOf,replyLimitOf } from '../src/game/rounds';
import { Battle } from '../src/game/battle';
import { CastSession } from '../src/game/session';
import { AIM,enclosingStrokes,guardStyleOf,shieldOf,strokeEncloses,strokesOf } from '../src/game/guard';
import { guardPose,knightPose } from '../src/render/knight';
import { screenState,hitStopOf,HIT_STOPS } from '../src/render/effects/screen';
import { presets } from '../src/render/effects/presets';
import { dueSounds,shouldDuck } from '../src/audio/cues';
import type { Point } from '../src/game/types';

const first=ROUNDS[0],defend=ROUNDS[1];
/** 印のまわりを一周する線。半径は画面を1とした値。 */
const ring=(radius:number,stroke=1,center=AIM,points=28):Point[]=>
  Array.from({length:points},(_,i)=>({x:center.x+Math.cos(i/points*Math.PI*2)*radius,y:center.y+Math.sin(i/points*Math.PI*2)*radius*1.4,t:24000+i*20,hand:0,stroke}));
const bar=(y:number,stroke=1):Point[]=>Array.from({length:12},(_,i)=>({x:.2+i*.05,y,t:24000+i*20,hand:0,stroke}));

describe('回の時刻表',()=>{
  it('防御の回の境目を固定する',()=>{
    for(const [time,phase] of [[23999,'ready'],[24000,'draw'],[27999,'draw'],[28000,'chant'],[30999,'chant'],[31000,'complete'],[33999,'complete'],[34000,'release'],[38999,'release'],[39000,'handoff'],[40000,'finished']] as const)
      expect(phaseAt(time,defend)).toBe(phase);
  });
  it('一回目の境目は今までのまま',()=>{
    for(const [time,phase] of [[0,'draw'],[6000,'build'],[11000,'chant'],[14000,'complete'],[17000,'release'],[23000,'handoff'],[24000,'finished']] as const)
      expect(phaseAt(time)).toBe(phase);
  });
  it('時刻から今の回が決まり、待ちと打ち切りは回ごとにずれる',()=>{
    expect(roundAt(0).id).toBe('first');expect(roundAt(23999).id).toBe('first');
    expect(roundAt(24000).id).toBe('defend');expect(roundAt(99999).id).toBe('defend');
    expect(speechLimitOf(defend)).toBe(32400);expect(replyLimitOf(defend)).toBe(32900);
    expect(speechLimitOf(first)).toBe(15400);expect(replyLimitOf(first)).toBe(15900);
    expect(BATTLE_END).toBe(40000);
    expect(beatAt(30).defend).toBe(true);expect(beatAt(10).defend).toBe(false);
    expect(beatAt(30).release).toBe(34);expect(beatAt(30).impact).toBe(35.4);
  });
});

describe('60秒の進行役',()=>{
  it('時刻で回が入れ替わり、受付は回の中だけ開く',()=>{
    let now=0;const battle=new Battle(()=>now);
    battle.tick();expect(battle.active.round.id).toBe('first');expect(battle.accepting).toBe(true);
    now=20000;battle.tick();expect(battle.accepting).toBe(false);expect(battle.active.round.id).toBe('first');
    now=24000;battle.tick();expect(battle.active.round.id).toBe('defend');expect(battle.accepting).toBe(true);
    now=31000;battle.tick();expect(battle.accepting).toBe(false);
    now=40000;battle.tick();expect(battle.finished).toBe(true);
  });
  it('一回目の魔法と光点を防御の回へ渡す',()=>{
    let now=0;const battle=new Battle(()=>now);
    for(let i=0;i<40;i++)battle.first.motion.add(.3+i*.01,.5+Math.sin(i/6)*.1,i*100);
    now=16000;battle.tick();
    expect(battle.first.recipe).not.toBeNull();
    now=23000;battle.tick();
    expect(battle.inherited.length).toBeGreaterThan(0);
    expect(battle.inherited.length).toBeLessThanOrEqual(3);
    expect(battle.defend.previous?.name).toBe(battle.first.recipe?.name);
  });
  it('防御の回も33秒で一度だけ確定し、盾と止め方が残る',()=>{
    let now=0;const battle=new Battle(()=>now);
    now=24000;battle.tick();
    for(const p of ring(.12))battle.defend.motion.add(p.x,p.y,p.t);
    battle.defend.speech.add({id:1,revision:1,startMs:4000,endMs:6500,text:'氷よ、壁となれ、弾き返せ',final:true,stability:1,source:'typed'});
    now=33000;battle.tick();
    expect(battle.defend.locked).toBe(true);
    expect(battle.defend.recipe?.element).toBe('ice');
    expect(battle.defend.guard?.style).toBe('reflect');
    expect(battle.defend.guard?.shield.enclosed).toBe(true);
    expect(battle.first.guard).toBeNull();
  });
});

describe('印を囲む',()=>{
  it('印を囲んだ線だけを数える',()=>{
    expect(strokeEncloses(ring(.12))).toBe(true);
    expect(strokeEncloses(ring(.05))).toBe(true);
    // 横線は、始点と終点を結んでも面積がないので囲みにならない。
    expect(strokeEncloses(bar(.56))).toBe(false);
    // 別の場所を囲んでも、印は囲めていない。
    expect(strokeEncloses(ring(.1,1,{x:.2,y:.2}))).toBe(false);
    expect(strokeEncloses([{x:0,y:0}])).toBe(false);
  });
  it('何重に囲んだかを数える',()=>{
    const points=[...ring(.1,1),...ring(.2,2),...bar(.9,3)];
    expect(strokesOf(points)).toHaveLength(3);
    expect(enclosingStrokes(points)).toHaveLength(2);
  });
});

describe('盾を作る',()=>{
  it('囲めていれば、一番外の輪をそのまま縁にする',()=>{
    const shield=shieldOf([...ring(.1,1),...ring(.2,2)],null);
    expect(shield.enclosed).toBe(true);expect(shield.moved).toBe(false);
    expect(shield.rings).toBe(2);expect(shield.layers).toBe(2);
    expect(shield.radius).toBeGreaterThan(.15);
    expect(shield.outline.length).toBeLessThanOrEqual(64);
  });
  it('囲めていなくても、近い線を印の前へ運んで必ず盾にする',()=>{
    const shield=shieldOf(bar(.8),null);
    expect(shield.enclosed).toBe(false);expect(shield.moved).toBe(true);
    expect(shield.kind).toBe('wall');
    expect(shield.center.x).toBeCloseTo(AIM.x);expect(shield.center.y).toBeCloseTo(AIM.y);
    // ずれの分だけ元の位置へ戻せる。
    expect(shield.offset.y).toBeCloseTo(AIM.y-.8);
    // 運んだ輪郭は印の高さにある。
    expect(shield.outline.every(p=>Math.abs(p.y-AIM.y)<.01)).toBe(true);
  });
  it('何も描かなくても光の玉が出る',()=>{
    const shield=shieldOf([],null);
    expect(shield.kind).toBe('orb');expect(shield.outline.length).toBeGreaterThan(8);expect(shield.layers).toBe(1);
  });
  it('言った数が、囲った数より優先される。層は5枚まで',()=>{
    expect(shieldOf(ring(.1),7).layers).toBe(5);
    expect(shieldOf(ring(.1),3).layers).toBe(3);
    expect(shieldOf([...ring(.1,1),...ring(.16,2),...ring(.22,3)],null).layers).toBe(3);
  });
  it('縦長は柱、小さい動きは玉になる',()=>{
    const tall=Array.from({length:10},(_,i)=>({x:.5,y:.3+i*.05,t:24000+i*20,hand:0,stroke:1}));
    expect(shieldOf(tall,null).kind).toBe('pillar');
    const tiny=Array.from({length:6},(_,i)=>({x:.5+i*.004,y:.56+i*.003,t:24000+i*20,hand:0,stroke:1}));
    expect(shieldOf(tiny,null).kind).toBe('orb');
  });
});

describe('止め方は詠唱で決まる',()=>{
  it.each([['氷よ、壁となれ','block'],['弾き返せ','reflect'],['雷よ、返せ','reflect'],['炎よ、かき消せ','erase'],['燃やせ','erase'],['','block']] as const)('%s',(text,style)=>{
    expect(guardStyleOf(text)).toBe(style);
  });
});

describe('防御の回の画面と姿勢',()=>{
  it('敵の一撃は、作った魔法の用途によらず画面を揺らす',()=>{
    const beat=beatAt(30);
    const hit=screenState(35.45,2,presets.vivid,'defend',0,.5,false,beat);
    expect(Math.abs(hit.shakeX)+Math.abs(hit.shakeY)).toBeGreaterThan(0);
    expect(hit.flash).toBeGreaterThan(.2);
    // 一回目は、守る魔法なら弱くしか揺らさない。
    const gentle=screenState(18.55,2,presets.vivid,'defend',0,.5);
    expect(Math.hypot(gentle.shakeX,gentle.shakeY)).toBeLessThan(Math.hypot(hit.shakeX,hit.shakeY));
  });
  it('防御の停止は常に「強」。控えめモードでは止めない',()=>{
    const beat=beatAt(30);
    expect(hitStopOf(presets.vivid,0,0,false,beat)).toBe(HIT_STOPS.strong);
    expect(hitStopOf(presets.vivid,3,1,false,beat)).toBe(HIT_STOPS.strong);
    expect(hitStopOf(presets.vivid,3,1,true,beat)).toBe(0);
  });
  it('暗転は発動の0.08秒前だけ。防御は34秒に合わせる',()=>{
    const beat=beatAt(30);
    expect(screenState(33.9,1,presets.vivid,null,0,0,false,beat).blackout).toBe(0);
    expect(screenState(33.99,1,presets.vivid,null,0,0,false,beat).blackout).toBe(1);
    expect(screenState(34,1,presets.vivid,null,0,0,false,beat).blackout).toBe(0);
  });
  it('騎士は構え、溜め、振り下ろし、弾かれ、前屈の順に動く',()=>{
    const states=[23500,26000,33400,35600,39600].map(ms=>guardPose(ms).state);
    expect(states).toEqual(['guard','charge','swing','repel','exposed']);
    for(let ms=23000;ms<=41000;ms+=50) {
      const pose=guardPose(ms);
      expect(pose.weights.reduce((a,b)=>a+b,0)).toBeCloseTo(1);
      expect(Math.min(...pose.weights)).toBeGreaterThanOrEqual(-.00001);
    }
    // 一回目の姿勢の数も表に合わせる。
    expect(knightPose(18700,true).weights).toHaveLength(guardPose(23500).weights.length);
  });
  it('弾き返したときだけ、騎士が戻ってきた一撃を受ける',()=>{
    expect(guardPose(36300,false,'reflect').flash).toBeGreaterThan(0);
    expect(guardPose(36300,false,'block').flash).toBe(0);
    expect(guardPose(36300,true,'reflect').push).toBeGreaterThanOrEqual(0);
  });
});

describe('防御の回の音',()=>{
  it('回ごとに、録音の間は鳴らさない',()=>{
    expect(dueSounds(28000,28100,true)).toEqual([]);
    expect(dueSounds(31700,31740,true)).toEqual([]);
    expect(dueSounds(31740,31760,true).map(c=>c.name)).toEqual(['build']);
    expect(dueSounds(33990,34010,false).map(c=>c.name)).toEqual(['release']);
    expect(dueSounds(35390,35410,false).map(c=>c.name)).toEqual(['block']);
    expect(dueSounds(18490,18510,false).map(c=>c.name)).toEqual(['impact']);
  });
  it('受付の間だけ曲を下げる',()=>{
    expect(shouldDuck(5000)).toBe(true);
    expect(shouldDuck(20000)).toBe(false);
    expect(shouldDuck(26000)).toBe(true);
    expect(shouldDuck(33000)).toBe(false);
  });
});

describe('防御の回の入力',()=>{
  it('受付は24〜31秒だけ。声の時刻は回ごとに0から数える',()=>{
    let now=0;const cast=new CastSession(()=>now,'test',defend,0);
    expect(cast.accepting).toBe(false);
    expect(cast.motion.add(.5,.5,1000)).toBe(false);
    now=24500;expect(cast.accepting).toBe(true);expect(cast.motion.add(.5,.5,24500)).toBe(true);
    cast.speech.add({id:1,revision:1,startMs:500,endMs:6900,text:'氷よ',final:true,stability:1,source:'typed'});
    // 回の長さ（7秒）を超える時刻は受け付けない。
    cast.speech.add({id:2,revision:1,startMs:7000,endMs:7200,text:'あと',final:true,stability:1,source:'typed'});
    now=31000;expect(cast.accepting).toBe(false);expect(cast.motion.add(.5,.5,31000)).toBe(false);
    const state=cast.freeze();
    expect(state.castId).toBe('cast-02');expect(state.phase).toBe('defend');
    expect(state.speech.rawTranscript).toBe('氷よ');
    expect(state.inputWindow.startSessionMs).toBe(24000);expect(state.inputWindow.endSessionMs).toBe(31000);
    expect(state.enemy.attackKind).toBe('slash');
    // 声の時刻は、記録では戦いの時刻へ直して残す。
    expect(state.timedEvents.find(e=>e.speech)?.startMs).toBe(24500);
  });
  it('遅い返事と、別の回あての返事を使わない',()=>{
    let now=24000;const cast=new CastSession(()=>now,'test',defend,0);const state=cast.freeze();
    const reply={sessionId:'test',castId:'cast-02',inputRevision:1,status:'ok'};
    expect(cast.receive({...reply,castId:'cast-01'})).toBe(false);
    expect(cast.receive(reply)).toBe(true);
    now=32900;expect(cast.receive(reply)).toBe(false);
    expect(state.previous).toBeNull();
  });
});
