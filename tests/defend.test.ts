import { describe,it,expect } from 'vitest';
import { ROUNDS,BATTLE_END,beatAt,phaseAt,roundAt,speechLimitOf,replyLimitOf } from '../src/game/rounds';
import { Battle } from '../src/game/battle';
import { CastSession } from '../src/game/session';
import { AIM,ENCLOSE_TURN,dropNegated,enclosingStrokes,guardStyleOf,shieldOf,strokeEncloses,strokesOf,windingAround } from '../src/game/guard';
import { GUARD_DAMAGE,GUARD_STEP_MS,healthSteps } from '../src/render/health-bar';
import { hitDelay } from '../src/render/effects/release';
import { liveWords } from '../src/game/live-words';
import { beatOf } from '../src/game/rounds';
import { spellPose,completedSpellFrame } from '../src/render/spell-layout';
import { postHeavyActive,bloomWeightAt } from '../src/render/composite';
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
    expect(roundAt(24000).id).toBe('defend');expect(roundAt(40000).id).toBe('finish');expect(roundAt(99999).id).toBe('finish');
    expect(speechLimitOf(defend)).toBe(32400);expect(replyLimitOf(defend)).toBe(32900);
    expect(speechLimitOf(first)).toBe(15400);expect(replyLimitOf(first)).toBe(15900);
    expect(BATTLE_END).toBe(60000);
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
    now=40000;battle.tick();expect(battle.active.round.id).toBe('finish');expect(battle.accepting).toBe(true);
    now=49000;battle.tick();expect(battle.accepting).toBe(false);
    now=60000;battle.tick();expect(battle.finished).toBe(true);
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

/** 線分を点の並びにする。 */
const seg=(a:{x:number;y:number},b:{x:number;y:number},stroke=1,n=12):Point[]=>
  Array.from({length:n},(_,k)=>({x:a.x+(b.x-a.x)*k/n,y:a.y+(b.y-a.y)*k/n,t:24000+k*20,hand:0,stroke}));

describe('印を囲む',()=>{
  it('印を囲んだ線だけを数える',()=>{
    expect(strokeEncloses(ring(.12))).toBe(true);
    expect(strokeEncloses(ring(.05))).toBe(true);
    expect(strokeEncloses(ring(.02))).toBe(true);
    // 横線は、どれだけ長くても囲みにならない。
    expect(strokeEncloses(bar(.62))).toBe(false);
    // 別の場所を囲んでも、印は囲めていない。
    expect(strokeEncloses(ring(.1,1,{x:.2,y:.2}))).toBe(false);
    expect(strokeEncloses([{x:0,y:0}])).toBe(false);
  });
  it('印から離れたかぎ形を、囲めたことにしない',()=>{
    // 始点と終点を結ぶと印が中に入るが、線は印の近くを通っていない。
    const L=[...seg({x:.2,y:.9},{x:.85,y:.9}),...seg({x:.85,y:.9},{x:.85,y:.08})];
    expect(strokeEncloses(L)).toBe(false);
    expect(windingAround(L)).toBeLessThan(ENCLOSE_TURN);
  });
  it('なぞり返した輪と、逆回りに重ねた輪も囲めたことにする',()=>{
    // 一周してから同じ道を戻る。向きが打ち消し合う書き方だと取りこぼす。
    expect(strokeEncloses([...ring(.12),...[...ring(.12)].reverse()])).toBe(true);
    // 外を右回り、内を左回り。
    expect(strokeEncloses([...ring(.18),...ring(.12,2,AIM).map(p=>({...p,y:AIM.y-(p.y-AIM.y)}))])).toBe(true);
  });
  it('四分の三まで回れば囲めたことにし、半分では囲めていないことにする',()=>{
    const arc=(turns:number)=>Array.from({length:Math.round(32*turns)},(_,i)=>({x:AIM.x+Math.cos(i/32*Math.PI*2)*.12,y:AIM.y+Math.sin(i/32*Math.PI*2)*.17,t:24000+i*20,hand:0,stroke:1}));
    expect(strokeEncloses(arc(.75))).toBe(true);
    expect(strokeEncloses(arc(.5))).toBe(false);
  });
  it('手が止まったままの線を、囲めたことにしない',()=>{
    const still=Array.from({length:400},(_,i)=>({x:.2,y:.3,t:24000+i*16,hand:0,stroke:1}));
    expect(strokeEncloses(still)).toBe(false);
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
  it('一点だけ、手が止まったまま、二点だけでも必ず盾になる',()=>{
    // 画面を一度触っただけ。
    const tap=shieldOf([{x:.4,y:.5,t:24000,hand:0,stroke:1}],null);
    expect(tap.kind).toBe('orb');expect(tap.outline.length).toBeGreaterThan(8);
    // カメラの前で手を止めたまま。同じ座標が並ぶので、運んでも輪郭が点になる。
    const still=shieldOf(Array.from({length:400},(_,i)=>({x:.2,y:.3,t:24000+i*16,hand:0,stroke:1})),null);
    expect(still.kind).toBe('orb');expect(still.center).toEqual(AIM);
    // 二点だけの短い線。
    const two=shieldOf([{x:.3,y:.4,t:24000,hand:0,stroke:1},{x:.42,y:.46,t:24100,hand:0,stroke:1}],null);
    expect(two.outline.length).toBeGreaterThan(1);expect(two.moved).toBe(true);
    for(const shield of [tap,still,two]) {
      expect(Number.isFinite(shield.radius)).toBe(true);
      expect(shield.outline.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))).toBe(true);
    }
  });
  it('印に近い線を選ぶ。線の真ん中ではなく、線の上の一番近い点で見る',()=>{
    // 画面を斜めに横切る大きな線（真ん中は印に近い）と、印のすぐ上の短い線。
    const across=seg({x:.02,y:.05},{x:.98,y:.95},1,24);
    const near=seg({x:.45,y:.66},{x:.55,y:.66},2,8);
    expect(shieldOf([...across,...near],null).outline.length).toBe(near.length);
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
  it('「〜しないで」と言われたら、その止め方にしない',()=>{
    expect(guardStyleOf('弾き返さないで')).toBe('block');
    expect(guardStyleOf('かき消さないで')).toBe('block');
    expect(guardStyleOf('跳ね返さないで')).toBe('block');
    expect(guardStyleOf('弾き返すのではなく受け止めて')).toBe('block');
    expect(dropNegated('氷よ、弾き返せ')).toBe('氷よ、弾き返せ');
    // 文の途中の「ない」は落とさない。
    expect(dropNegated('消えない盾')).toBe('消えない盾');
  });
  it('かなのままの聞き取りと、辞書の言葉でも止め方が変わる',()=>{
    expect(guardStyleOf('はじきかえせ')).toBe('reflect');
    expect(guardStyleOf('うちけせ')).toBe('erase');
    // 辞書へ寄せると消える言葉は、聞き取ったままの文からも見る。
    expect(guardStyleOf('',' 反発 ')).toBe('reflect');
    expect(guardStyleOf('光','浄化せよ')).toBe('erase');
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
  it('防御の停止は常に0.09秒。控えめモードでは止めない',()=>{
    const beat=beatAt(30);
    expect(hitStopOf(presets.vivid,0,false,beat)).toBe(.09);
    expect(hitStopOf(presets.vivid,3,false,beat)).toBe(HIT_STOPS.strong);
    expect(hitStopOf(presets.vivid,3,true,beat)).toBe(0);
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
    // 一回目と防御で、姿勢の表の長さがそろっている。とどめの「崩れ落ちる」を足して9つ。
    expect(knightPose(18700,true).weights).toHaveLength(9);
    expect(guardPose(23500).weights).toHaveLength(9);
    // 崩れ落ちる姿勢は、防御の回までは一度も混ざらない。
    for(let ms=23000;ms<=41000;ms+=50)expect(guardPose(ms).weights[8]).toBe(0);
  });
  it('刃の赤は溜めの間だけ脈打ち、振り下ろしで消える',()=>{
    // 構えの間と、弾かれた後は光らない。
    expect(guardPose(23500).bladeHeat).toBe(0);
    expect(guardPose(39000).bladeHeat).toBe(0);
    // 溜めの終わりに近いほど強い。
    const early=guardPose(26000).bladeHeat,late=guardPose(32000).bladeHeat;
    expect(early).toBeGreaterThan(0);
    expect(late).toBeGreaterThan(early);
    // 毎秒1回脈打つ。山（x.25秒）のほうが、その0.5秒後の谷より強い。
    expect(guardPose(31250).bladeHeat).toBeGreaterThan(guardPose(31750).bladeHeat);
    // 控えめモードでは脈打たず、時間とともに強くなるだけ。
    expect(guardPose(31250,true).bladeHeat).toBeLessThan(guardPose(31750,true).bladeHeat);
    // 一回目の姿勢では光らない。
    expect(knightPose(18700,true).bladeHeat).toBe(0);
  });
  it('弾き返したときだけ、騎士が戻ってきた一撃を受ける',()=>{
    expect(guardPose(36300,false,'reflect').flash).toBeGreaterThan(0);
    expect(guardPose(36300,false,'block').flash).toBe(0);
    // 控えめモードでは白飛びを3分の1にし、残像を出さない。
    expect(guardPose(36300,true,'reflect').flash).toBeCloseTo(guardPose(36300,false,'reflect').flash/3,6);
    expect(guardPose(36300,true,'reflect').ghost).toBe(0);
    expect(guardPose(36300,false,'reflect').ghost).toBeGreaterThan(0);
  });
  it('弱点の輪郭の光は、40秒までに消える',()=>{
    // 結果を出したまま待つ間、毎コマ騎士の形を塗り直さないため。
    expect(guardPose(39500).rim).toBeGreaterThan(.4);
    expect(guardPose(40000).rim).toBe(0);
    expect(guardPose(41000).rim).toBe(0);
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

describe('体力の減り方',()=>{
  it('一回目の命中と、防御の受け止めの二回で減る',()=>{
    const steps=healthSteps(null);
    // 防御の段の後ろに、とどめの回の5段（多段命中4回ととどめの一撃）が続く。
    const guard=steps.find(step=>step.at===GUARD_STEP_MS)!;
    expect(guard).toBeTruthy();
    expect(guard.from-guard.left).toBe(GUARD_DAMAGE);
    expect(steps[0].at).toBe(first.impact);
    // 一回目で20〜45%、防御で10%。0より下へは行かない。
    expect(guard.left).toBeGreaterThanOrEqual(0);
    expect(guard.left).toBeLessThan(steps[0].from);
  });
  it('連弾は弾の届く時刻ごとに分けて減らし、最後に防御の段が付く',()=>{
    const recipe={version:'recipe-1',element:'lightning',purpose:'attack',form:'swarm',trajectory:'straight',count:7,explicitCount:7,
      defense:.1,area:.5,duration:.5,concentration:.5,enclosure:false,split:true,developsPrevious:null,motionSpeechAligned:null,
      noAttack:false,name:'',source:'local' as const,decisions:{},assistance:[],model:null} as unknown as Parameters<typeof healthSteps>[0];
    const steps=healthSteps(recipe);
    // 7発それぞれに一段、8段目が防御の受け止め。そのあとにとどめの5段が続く。
    expect(steps).toHaveLength(13);
    expect(steps[7].at).toBe(GUARD_STEP_MS);
    expect(steps[1].at-steps[0].at).toBe(80);
    // 段の時刻は弾と同じ hitDelay から作るので、最後の1発（19.18秒）でも減る。
    expect(steps[6].at).toBeCloseTo(first.impact+hitDelay(6,7)*1000);
    expect(steps[6].left).toBeCloseTo(steps[7].from,6);
  });
});

describe('防御の回の言葉と配置',()=>{
  it('声の時刻を戦いの時刻へそろえる',()=>{
    const entry={id:1,revision:1,startMs:4000,endMs:6500,text:'氷よ',final:true,stability:1,source:'typed' as const};
    // 足さないと、防御の回の言葉が「24秒前の言葉」になり、反応の窓から外れる。
    expect(liveWords([entry])[0].atMs).toBe(6500);
    expect(liveWords([entry],defend.start)[0].atMs).toBe(30500);
  });
  it('防御の回は、術式を狙いの印の高さへ寄せる',()=>{
    const wide=1600,high=900;
    expect(completedSpellFrame(wide,high,beatOf(first)).y).toBeCloseTo(high*.66);
    expect(completedSpellFrame(wide,high,beatOf(defend)).y).toBeCloseTo(high*AIM.y);
    // 締め切りまでは入力した位置のまま。発動で印の前に収まる。
    const points=[{x:.3,y:.3,t:24000,hand:0,stroke:1},{x:.4,y:.4,t:24500,hand:0,stroke:1}];
    expect(spellPose(points,wide,high,30000,beatOf(defend)).progress).toBe(0);
    expect(spellPose(points,wide,high,34000,beatOf(defend)).progress).toBe(1);
    // 余韻は回の終わりより前に消えきる。
    expect(spellPose(points,wide,high,40000,beatOf(defend)).opacity).toBe(0);
  });
  it('重い後処理は、回ごとに発動の前後だけ出す',()=>{
    const beat=beatOf(defend);
    expect(postHeavyActive(33.8,beat)).toBe(false);
    expect(postHeavyActive(34.5,beat)).toBe(true);
    expect(postHeavyActive(38.5,beat)).toBe(false);
    // 一回目の時間帯は今までどおり。
    expect(postHeavyActive(17)).toBe(true);
    expect(postHeavyActive(22)).toBe(false);
    expect(bloomWeightAt(35.4,false,0,beat)).toBeGreaterThan(bloomWeightAt(37,false,0,beat));
  });
});
