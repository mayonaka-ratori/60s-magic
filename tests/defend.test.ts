import { describe,it,expect } from 'vitest';
import { ROUNDS,BATTLE_END,GUARD_STAGGER_MS,beatAt,phaseAt,roundAt,speechLimitOf,replyLimitOf } from '../src/game/rounds';
import { Battle } from '../src/game/battle';
import { CastSession } from '../src/game/session';
import { AIM,AIM_RADIUS,DEFAULT_ASPECT,ENCLOSE_TURN,GUARD_REACH,coversAim,dropNegated,enclosingStrokes,guardStyleOf,shieldOf,strokeEncloses,strokesOf,windingAround } from '../src/game/guard';
import { aimMark } from '../src/render/effects/guard';
import { GUARD_DAMAGE,healthSteps } from '../src/render/health-bar';
import { hitDelay } from '../src/render/effects/release';
import { SLAM_AT } from '../src/render/composite';
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
/** 秒で見る回の表。演出の試験はここから作り、秒数を書き並べない。 */
const 一=beatOf(first),防=beatOf(defend);
/** 印のまわりを一周する線。半径は画面を1とした値。 */
const ring=(radius:number,stroke=1,center=AIM,points=28):Point[]=>
  Array.from({length:points},(_,i)=>({x:center.x+Math.cos(i/points*Math.PI*2)*radius,y:center.y+Math.sin(i/points*Math.PI*2)*radius*1.4,t:defend.start+i*20,hand:0,stroke}));
const bar=(y:number,stroke=1):Point[]=>Array.from({length:12},(_,i)=>({x:.2+i*.05,y,t:defend.start+i*20,hand:0,stroke}));

describe('回の時刻表',()=>{
  it('防御の回の境目を固定する',()=>{
    const 境目:Array<[number,string]>=[[defend.start-1,'ready'],[defend.start,'draw'],[defend.chant!-1,'draw'],
      [defend.chant!,'chant'],[defend.inputEnd-1,'chant'],[defend.inputEnd,'complete'],[defend.release-1,'complete'],
      [defend.release,'release'],[defend.handoff-1,'release'],[defend.handoff,'handoff'],[defend.end,'finished']];
    for(const [time,phase] of 境目)expect(phaseAt(time,defend)).toBe(phase);
  });
  it('一回目の境目は表のとおり',()=>{
    const 境目:Array<[number,string]>=[[0,'draw'],[first.build!,'build'],[first.chant!,'chant'],[first.inputEnd,'complete'],
      [first.release,'release'],[first.handoff,'handoff'],[first.end,'finished']];
    for(const [time,phase] of 境目)expect(phaseAt(time)).toBe(phase);
  });
  it('時刻から今の回が決まり、待ちと打ち切りは回ごとにずれる',()=>{
    expect(roundAt(0).id).toBe('first');expect(roundAt(first.end-1).id).toBe('first');
    expect(roundAt(defend.start).id).toBe('defend');expect(roundAt(defend.end).id).toBe('finish');expect(roundAt(999999).id).toBe('finish');
    // 声を待つのは締め切りの2秒後まで、Jevは確定の0.1秒前まで。
    expect(speechLimitOf(defend)).toBe(defend.inputEnd+2000);expect(speechLimitOf(first)).toBe(first.inputEnd+2000);
    // 返事の打ち切りは固定の時刻。一回目は20.9秒、防御は47.9秒。
    expect(replyLimitOf(first)).toBe(20900);expect(replyLimitOf(defend)).toBe(47900);
    // どの回でも、声を待ち終わってから確定までの間に入る。ここを外すと、返事を待てないか確定に間に合わない。
    for(const round of ROUNDS){
      expect(replyLimitOf(round)).toBeGreaterThan(speechLimitOf(round));
      expect(replyLimitOf(round)).toBeLessThan(round.lock);
    }
    // 三回で90秒。一回目30秒、防御26秒、とどめ34秒。
    expect(BATTLE_END).toBe(90000);
    expect([first,defend,ROUNDS[2]].map(r=>(r.end-r.start)/1000)).toEqual([30,26,34]);
    expect(beatAt(defend.start/1000).defend).toBe(true);expect(beatAt(10).defend).toBe(false);
    expect(beatAt(defend.start/1000).release).toBe(defend.release/1000);
    expect(beatAt(defend.start/1000).impact).toBe(defend.impact/1000);
  });
});

describe('90秒の進行役',()=>{
  it('時刻で回が入れ替わり、受付は回の中だけ開く',()=>{
    let now=0;const battle=new Battle(()=>now),finish=ROUNDS[2];
    battle.tick();expect(battle.active.round.id).toBe('first');expect(battle.accepting).toBe(true);
    now=first.inputEnd;battle.tick();expect(battle.accepting).toBe(false);expect(battle.active.round.id).toBe('first');
    now=defend.start;battle.tick();expect(battle.active.round.id).toBe('defend');expect(battle.accepting).toBe(true);
    now=defend.inputEnd;battle.tick();expect(battle.accepting).toBe(false);
    now=finish.start;battle.tick();expect(battle.active.round.id).toBe('finish');expect(battle.accepting).toBe(true);
    now=finish.inputEnd;battle.tick();expect(battle.accepting).toBe(false);
    now=finish.end;battle.tick();expect(battle.finished).toBe(true);
  });
  it('一回目の魔法と光点を防御の回へ渡す',()=>{
    let now=0;const battle=new Battle(()=>now);
    for(let i=0;i<40;i++)battle.first.motion.add(.3+i*.01,.5+Math.sin(i/6)*.1,i*100);
    now=first.lock;battle.tick();
    expect(battle.first.recipe).not.toBeNull();
    now=first.handoff;battle.tick();
    expect(battle.inherited.length).toBeGreaterThan(0);
    expect(battle.inherited.length).toBeLessThanOrEqual(3);
    expect(battle.defend.previous?.name).toBe(battle.first.recipe?.name);
  });
  it('防御の回も確定の時刻で一度だけ確定し、盾と止め方が残る',()=>{
    let now=0;const battle=new Battle(()=>now);
    now=defend.start;battle.tick();
    for(const p of ring(.12))battle.defend.motion.add(p.x,p.y,p.t);
    battle.defend.speech.add({id:1,revision:1,startMs:4000,endMs:6500,text:'氷よ、壁となれ、弾き返せ',final:true,stability:1,source:'typed'});
    now=defend.lock;battle.tick();
    expect(battle.defend.locked).toBe(true);
    expect(battle.defend.recipe?.element).toBe('ice');
    expect(battle.defend.guard?.style).toBe('reflect');
    expect(battle.defend.guard?.shield.enclosed).toBe(true);
    expect(battle.first.guard).toBeNull();
  });
});

/** 線分を点の並びにする。 */
const seg=(a:{x:number;y:number},b:{x:number;y:number},stroke=1,n=12):Point[]=>
  Array.from({length:n},(_,k)=>({x:a.x+(b.x-a.x)*k/n,y:a.y+(b.y-a.y)*k/n,t:defend.start+k*20,hand:0,stroke}));

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
    const arc=(turns:number)=>Array.from({length:Math.round(32*turns)},(_,i)=>({x:AIM.x+Math.cos(i/32*Math.PI*2)*.12,y:AIM.y+Math.sin(i/32*Math.PI*2)*.17,t:defend.start+i*20,hand:0,stroke:1}));
    expect(strokeEncloses(arc(.75))).toBe(true);
    expect(strokeEncloses(arc(.5))).toBe(false);
  });
  it('手が止まったままの線を、囲めたことにしない',()=>{
    const still=Array.from({length:400},(_,i)=>({x:.2,y:.3,t:defend.start+i*16,hand:0,stroke:1}));
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
    const tap=shieldOf([{x:.4,y:.5,t:defend.start,hand:0,stroke:1}],null);
    expect(tap.kind).toBe('orb');expect(tap.outline.length).toBeGreaterThan(8);
    // カメラの前で手を止めたまま。同じ座標が並ぶので、運んでも輪郭が点になる。
    const still=shieldOf(Array.from({length:400},(_,i)=>({x:.2,y:.3,t:defend.start+i*16,hand:0,stroke:1})),null);
    expect(still.kind).toBe('orb');expect(still.center).toEqual(AIM);
    // 二点だけの短い線。印から離れた場所に描いたので、印の前へ運ぶ。
    const two=shieldOf([{x:.62,y:.4,t:defend.start,hand:0,stroke:1},{x:.74,y:.46,t:defend.start+100,hand:0,stroke:1}],null);
    expect(two.outline.length).toBeGreaterThan(1);expect(two.moved).toBe(true);
    for(const shield of [tap,still,two]) {
      expect(Number.isFinite(shield.radius)).toBe(true);
      expect(shield.outline.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))).toBe(true);
    }
  });
  it('印に近い線を選ぶ。線の真ん中ではなく、線の上の一番近い点で見る',()=>{
    // かぎの形の大きな線。囲む四角の真ん中はちょうど印だが、線そのものは印から遠い。
    const hook=[...seg({x:AIM.x-.25,y:AIM.y-.4},{x:AIM.x+.25,y:AIM.y-.4},1,14),
      ...seg({x:AIM.x+.25,y:AIM.y-.4},{x:AIM.x+.25,y:AIM.y+.4},1,14)];
    // 印の下の短い線。印の範囲からは外れているが、かぎの線よりは近い。
    const near=seg({x:AIM.x-.02,y:AIM.y+.22},{x:AIM.x+.08,y:AIM.y+.22},2,8);
    expect(shieldOf([...hook,...near],null).outline.length).toBe(near.length);
  });
  it('印の範囲に掛かった線は、運ばずにその場所で盾になる',()=>{
    // 囲めてはいないが、印の輪に掛かる短い線。描いた場所のまま盾になる。
    const inside=seg({x:AIM.x-.06,y:AIM.y-.04},{x:AIM.x+.06,y:AIM.y+.06},1,10);
    const shield=shieldOf(inside,null);
    expect(shield.enclosed).toBe(false);expect(shield.moved).toBe(false);
    expect(shield.offset).toEqual({x:0,y:0});
    // 盾の真ん中は、運んだからではなく描いた場所そのものとして、印のそばにある。
    expect(Math.abs(shield.center.x-AIM.x)).toBeLessThan(.02);expect(Math.abs(shield.center.y-AIM.y)).toBeLessThan(.02);
    expect(coversAim(inside)).toBe(true);expect(shield.covering).toBe(true);
    // 印から離れた線は、掛かっていることにしない。
    expect(coversAim(seg({x:.7,y:.2},{x:.8,y:.3},1,10))).toBe(false);
    expect(shieldOf(bar(.9),null).moved).toBe(true);
  });
  it('掛かって作った盾だけ covering を立てる。運んだ盾と光の玉は立てない',()=>{
    // 何も描かなかったときの光の玉。印の色を「守れている」に変えないための目印。
    expect(shieldOf([],null).covering).toBe(false);
    expect(shieldOf([],null).kind).toBe('orb');
    // 印から離れた線を運んだ盾も、その場で守れたわけではない。
    expect(shieldOf(bar(.9),null).covering).toBe(false);
    // 囲めた盾は enclosed の側で見るので、covering は立てない。
    const 囲い=shieldOf(ring(.1),null);
    expect(囲い.enclosed).toBe(true);expect(囲い.covering).toBe(false);
  });
  it('守れる範囲を、画面に描く輪と同じ形で測る',()=>{
    // 印の輪は画面の短いほうの辺を基準に描く。判定も同じ基準にそろえ、横の差には画面の比を掛ける。
    const 横線=(dx:number)=>seg({x:AIM.x+dx,y:AIM.y-.02},{x:AIM.x+dx+.04,y:AIM.y+.06},1,8);
    // 16対9の画面。短いほうの辺は高さなので、高さの基準に直すと .06*16/9=.107 で範囲の中、.09*16/9=.16 で範囲の外。
    expect(GUARD_REACH).toBeCloseTo(AIM_RADIUS*1.2,6);
    expect(coversAim(横線(.06),AIM,DEFAULT_ASPECT)).toBe(true);
    expect(coversAim(横線(.09),AIM,DEFAULT_ASPECT)).toBe(false);
    // 縦長の画面（390×844）。同じ .09 でも、見た目では輪の内側なので守れたことにする。
    const 縦長=390/844;
    expect(coversAim(横線(.09),AIM,縦長)).toBe(true);
    // 画面の比を渡さないと、横長でも縦長でも同じ答えになってしまう（直す前の動き）。
    expect(coversAim(横線(.09),AIM,1)).toBe(true);
    // 盾の作られ方も同じ基準で変わる。横長では運び、縦長ではその場で盾にする。
    expect(shieldOf(横線(.09),null,AIM,DEFAULT_ASPECT).moved).toBe(true);
    expect(shieldOf(横線(.09),null,AIM,縦長).covering).toBe(true);
  });
  it('言った数が、囲った数より優先される。層は5枚まで',()=>{
    expect(shieldOf(ring(.1),7).layers).toBe(5);
    expect(shieldOf(ring(.1),3).layers).toBe(3);
    expect(shieldOf([...ring(.1,1),...ring(.16,2),...ring(.22,3)],null).layers).toBe(3);
  });
  it('縦長は柱、小さい動きは玉になる',()=>{
    const tall=Array.from({length:10},(_,i)=>({x:.5,y:.3+i*.05,t:defend.start+i*20,hand:0,stroke:1}));
    expect(shieldOf(tall,null).kind).toBe('pillar');
    const tiny=Array.from({length:6},(_,i)=>({x:.5+i*.004,y:.56+i*.003,t:defend.start+i*20,hand:0,stroke:1}));
    expect(shieldOf(tiny,null).kind).toBe('orb');
  });
});

/** 確かめる画面の大きさ。横長も縦長も混ぜる。 */
const 画面の大きさ:Array<[number,number]>=[[1920,1080],[1440,900],[1280,720],[1024,768],[820,1180],[768,1024],[390,844],[375,667]];
/**
 * 判定が通る一番遠い点を画素で測る。式を写さず、判定を呼んで境目を挟み込む。
 * 印から向きのほうへずらした短い線を渡す。線の上で印に一番近い点が、ずらした分だけ離れる。
 */
function 届く距離(w:number,h:number,向き:'よこ'|'たて'){
  const aspect=w/h;
  const 線=(画素:number)=>向き==='よこ'
    ? seg({x:AIM.x+画素/w,y:AIM.y},{x:AIM.x+画素/w,y:AIM.y+.04},1,8)
    : seg({x:AIM.x,y:AIM.y+画素/h},{x:AIM.x+.04,y:AIM.y+画素/h},1,8);
  let 中=0,外=Math.max(w,h);
  for(let i=0;i<50;i++){const 境=(中+外)/2;if(coversAim(線(境),AIM,aspect))中=境;else 外=境;}
  return 中;
}

describe('印は画面の形が変わっても収まり、判定と一致する',()=>{
  it('どの大きさでも、輪と目盛りと光点が画面の中に入る',()=>{
    for(const [w,h] of 画面の大きさ){
      const 印=aimMark(w,h);
      // 外へ出る順に、目盛りの先、外側の輪、内側の輪、引き継いだ光点。縦長で左へはみ出していたのはここ。
      for(const 端 of [印.ticks,印.outer,印.ring,印.inherited]){
        expect(印.x-端,`${w}x${h} の左`).toBeGreaterThanOrEqual(0);
        expect(印.x+端,`${w}x${h} の右`).toBeLessThanOrEqual(w);
        expect(印.y-端,`${w}x${h} の上`).toBeGreaterThanOrEqual(0);
        expect(印.y+端,`${w}x${h} の下`).toBeLessThanOrEqual(h);
      }
      // 収めるために小さくしすぎない。狭い画面でも、指で囲める大きさを残す。
      expect(印.r*2,`${w}x${h} の直径`).toBeGreaterThanOrEqual(70);
      expect(印.r,`${w}x${h} の半径`).toBeGreaterThanOrEqual(Math.min(w,h)/12);
    }
  });
  it('判定が通る一番遠い点が、描いてある輪の縁と同じ場所にある',()=>{
    for(const [w,h] of 画面の大きさ){
      // 描くほうの半径（画素）と、判定の届く距離（画素）を別々に出して比べる。
      const 縁=aimMark(w,h).r*1.2;
      expect(届く距離(w,h,'よこ'),`${w}x${h} の横`).toBeCloseTo(縁,3);
      // 横と縦で同じ長さになる。ここがずれると、輪の外で守れたり、輪の中で守れなかったりする。
      expect(届く距離(w,h,'たて'),`${w}x${h} の縦`).toBeCloseTo(縁,3);
    }
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
    const beat=防;
    const hit=screenState(防.impact+.05,2,presets.vivid,'defend',0,.5,false,beat);
    expect(Math.abs(hit.shakeX)+Math.abs(hit.shakeY)).toBeGreaterThan(0);
    expect(hit.flash).toBeGreaterThan(.2);
    // 一回目は、守る魔法なら弱くしか揺らさない。
    const gentle=screenState(一.impact+.05,2,presets.vivid,'defend',0,.5);
    expect(Math.hypot(gentle.shakeX,gentle.shakeY)).toBeLessThan(Math.hypot(hit.shakeX,hit.shakeY));
  });
  it('防御の停止は常に0.14秒（強）。控えめモードでは止めない',()=>{
    const beat=防;
    expect(hitStopOf(presets.vivid,0,false,beat)).toBe(.14);
    expect(hitStopOf(presets.vivid,3,false,beat)).toBe(HIT_STOPS.strong);
    expect(hitStopOf(presets.vivid,3,true,beat)).toBe(0);
  });
  it('暗転は発動の0.08秒前だけ。防御はその回の発動に合わせる',()=>{
    const beat=防;
    expect(screenState(防.release-.1,1,presets.vivid,null,0,0,false,beat).blackout).toBe(0);
    expect(screenState(防.release-.01,1,presets.vivid,null,0,0,false,beat).blackout).toBe(1);
    expect(screenState(防.release,1,presets.vivid,null,0,0,false,beat).blackout).toBe(0);
  });
  it('騎士は構え、溜め、振り下ろし、弾かれ、前屈の順に動く',()=>{
    const states=[first.handoff+500,defend.start+2000,defend.lock+400,defend.impact+200,defend.handoff+600]
      .map(ms=>guardPose(ms).state);
    expect(states).toEqual(['guard','charge','swing','repel','exposed']);
    for(let ms=first.handoff;ms<=defend.end+1000;ms+=50) {
      const pose=guardPose(ms);
      expect(pose.weights.reduce((a,b)=>a+b,0)).toBeCloseTo(1);
      expect(Math.min(...pose.weights)).toBeGreaterThanOrEqual(-.00001);
    }
    // 一回目と防御で、姿勢の表の長さがそろっている。
    // とどめの「崩れ落ちる」と、待機の息づかいを足して10個。
    expect(knightPose(first.impact+200,true).weights).toHaveLength(10);
    expect(guardPose(first.handoff+500).weights).toHaveLength(10);
    // 崩れ落ちる姿勢は、防御の回までは一度も混ざらない。
    for(let ms=first.handoff;ms<=defend.end+1000;ms+=50)expect(guardPose(ms).weights[8]).toBe(0);
  });
  it('刃の赤は溜めの間だけ脈打ち、振り下ろしで消える',()=>{
    // 時刻は回の表から作る。構えの間（29.5秒）と、弾かれた後（55秒）は光らない。
    expect(guardPose(first.handoff+500).bladeHeat).toBe(0);
    expect(guardPose(defend.handoff).bladeHeat).toBe(0);
    // 溜めの終わりに近いほど強い。32秒と47秒で比べる。
    const early=guardPose(defend.start+2000).bladeHeat,late=guardPose(defend.lock-1000).bladeHeat;
    expect(early).toBeGreaterThan(0);
    expect(late).toBeGreaterThan(early);
    // 毎秒1回脈打つ。山（x.25秒）のほうが、その0.5秒後の谷より強い。
    expect(guardPose(46250).bladeHeat).toBeGreaterThan(guardPose(46750).bladeHeat);
    // 控えめモードでは脈打たず、時間とともに強くなるだけ。
    expect(guardPose(46250,true).bladeHeat).toBeLessThan(guardPose(46750,true).bladeHeat);
    // 一回目の姿勢では光らない。
    expect(knightPose(first.impact+200,true).bladeHeat).toBe(0);
  });
  it('黒い光は溜めで強まり、振り下ろしで弾けて、弾かれるまでに消える',()=>{
    // 時刻は回の表から作る。構えの間は出ず、溜めが進むほど強まる。
    expect(guardPose(first.handoff+500).aura).toBe(0);
    expect(guardPose(defend.start+2000).aura).toBeGreaterThan(0);
    expect(guardPose(defend.lock-1000).aura).toBeGreaterThan(guardPose(defend.start+2000).aura);
    // 振り下ろし（48秒）の直後は溜めより強く、0.3秒で広がりきる。
    expect(guardPose(defend.lock+100).aura).toBeGreaterThan(.8);
    expect(guardPose(defend.lock).auraBurst).toBe(0);
    expect(guardPose(defend.lock+300).auraBurst).toBeCloseTo(1,6);
    // 一撃が盾に当たる50.4秒には消えている。
    expect(guardPose(defend.impact).aura).toBe(0);
    // 剣の残像は振り下ろしの0.75秒だけ。控えめモードでは出さず、黒い光も薄い。
    expect(guardPose(defend.lock-100).smear).toBe(0);
    expect(guardPose(defend.lock+100).smear).toBeGreaterThan(0);
    expect(guardPose(defend.lock+800).smear).toBe(0);
    expect(guardPose(defend.lock+100,true).smear).toBe(0);
    expect(guardPose(defend.lock-1000,true).aura).toBeLessThan(guardPose(defend.lock-1000).aura);
    // 一回目の姿勢では出ない。
    expect(knightPose(first.impact+200,true).aura).toBe(0);
    expect(knightPose(first.impact+200,true).smear).toBe(0);
  });
  it('弾き返したときだけ、騎士が戻ってきた一撃を受ける',()=>{
    // 戻ってきた一撃を受けるのは、盾に当たってから0.8秒後。その0.1秒後を見る。
    const back=defend.impact+900;
    expect(guardPose(back,false,'reflect').flash).toBeGreaterThan(0);
    expect(guardPose(back,false,'block').flash).toBe(0);
    // 控えめモードでは白飛びを3分の1にし、残像を出さない。
    expect(guardPose(back,true,'reflect').flash).toBeCloseTo(guardPose(back,false,'reflect').flash/3,6);
    expect(guardPose(back,true,'reflect').ghost).toBe(0);
    expect(guardPose(back,false,'reflect').ghost).toBeGreaterThan(0);
  });
  it('弱点の輪郭の光は、防御の回の終わりまでに消える',()=>{
    // 結果を出したまま待つ間、毎コマ騎士の形を塗り直さないため。
    expect(guardPose(defend.handoff+500).rim).toBeGreaterThan(.4);
    expect(guardPose(defend.end).rim).toBe(0);
    expect(guardPose(defend.end+1000).rim).toBe(0);
  });
});

describe('防御の回の音',()=>{
  it('回ごとに、録音の間は鳴らさない',()=>{
    // 録音を止めてから0.75秒は鳴らさない。その手前と直後を見る。
    const quiet=defend.inputEnd+750;
    expect(dueSounds(defend.chant!,defend.chant!+100,true)).toEqual([]);
    expect(dueSounds(quiet-50,quiet-10,true)).toEqual([]);
    expect(dueSounds(quiet-10,quiet+10,true).map(c=>c.name)).toEqual(['build']);
    expect(dueSounds(defend.release-10,defend.release+10,false).map(c=>c.name)).toEqual(['release']);
    expect(dueSounds(defend.impact-10,defend.impact+10,false).map(c=>c.name)).toEqual(['block']);
    expect(dueSounds(first.impact-10,first.impact+10,false).map(c=>c.name)).toEqual(['impact']);
  });
  it('受付の間だけ曲を下げる',()=>{
    expect(shouldDuck(first.chant!)).toBe(true);
    expect(shouldDuck(first.lock)).toBe(false);
    expect(shouldDuck(defend.chant!)).toBe(true);
    expect(shouldDuck(defend.lock)).toBe(false);
  });
});

describe('防御の回の入力',()=>{
  it('受付は防御の回の間だけ。声の時刻は回ごとに0から数える',()=>{
    let now=0;const cast=new CastSession(()=>now,'test',defend,0);
    const 受付=defend.inputEnd-defend.start;
    expect(cast.accepting).toBe(false);
    expect(cast.motion.add(.5,.5,1000)).toBe(false);
    now=defend.start+500;expect(cast.accepting).toBe(true);expect(cast.motion.add(.5,.5,now)).toBe(true);
    cast.speech.add({id:1,revision:1,startMs:500,endMs:受付-100,text:'氷よ',final:true,stability:1,source:'typed'});
    // 受け付ける長さを超える時刻は受け付けない。
    cast.speech.add({id:2,revision:1,startMs:受付,endMs:受付+200,text:'あと',final:true,stability:1,source:'typed'});
    now=defend.inputEnd;expect(cast.accepting).toBe(false);expect(cast.motion.add(.5,.5,now)).toBe(false);
    const state=cast.freeze();
    expect(state.castId).toBe('cast-02');expect(state.phase).toBe('defend');
    expect(state.speech.rawTranscript).toBe('氷よ');
    expect(state.inputWindow.startSessionMs).toBe(defend.start);expect(state.inputWindow.endSessionMs).toBe(defend.inputEnd);
    expect(state.enemy.attackKind).toBe('slash');
    // 声の時刻は、記録では戦いの時刻へ直して残す。
    expect(state.timedEvents.find(e=>e.speech)?.startMs).toBe(defend.start+500);
  });
  it('遅い返事と、別の回あての返事を使わない',()=>{
    let now=defend.start;const cast=new CastSession(()=>now,'test',defend,0);const state=cast.freeze();
    const reply={sessionId:'test',castId:'cast-02',inputRevision:1,status:'ok'};
    expect(cast.receive({...reply,castId:'cast-01'})).toBe(false);
    expect(cast.receive(reply)).toBe(true);
    now=replyLimitOf(defend);expect(cast.receive(reply)).toBe(false);
    expect(state.previous).toBeNull();
  });
});

describe('体力の減り方',()=>{
  it('一回目の命中と、防御の受け止めの二回で減る',()=>{
    const steps=healthSteps(null);
    // 防御の段の後ろに、とどめの回の5段（多段命中4回ととどめの一撃）が続く。
    // よろめく時刻は回の表から作る。一撃が盾に当たった後、弱点が出る前。
    expect(GUARD_STAGGER_MS).toBe(52500);
    expect(GUARD_STAGGER_MS).toBeGreaterThan(ROUNDS[1].impact);
    expect(GUARD_STAGGER_MS).toBeLessThan(ROUNDS[1].handoff);
    const guard=steps.find(step=>step.at===GUARD_STAGGER_MS)!;
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
    expect(steps[7].at).toBe(GUARD_STAGGER_MS);
    expect(steps[1].at-steps[0].at).toBe(80);
    // 段の時刻は弾と同じ hitDelay から作るので、最後の1発（24.18秒）でも減る。
    expect(steps[6].at).toBeCloseTo(first.impact+hitDelay(6,7)*1000);
    expect(steps[6].left).toBeCloseTo(steps[7].from,6);
  });
});

describe('防御の回の言葉と配置',()=>{
  it('声の時刻を戦いの時刻へそろえる',()=>{
    const entry={id:1,revision:1,startMs:4000,endMs:6500,text:'氷よ',final:true,stability:1,source:'typed' as const};
    // 足さないと、防御の回の言葉が「回の始まりより前の言葉」になり、反応の窓から外れる。
    expect(liveWords([entry])[0].atMs).toBe(6500);
    expect(liveWords([entry],defend.start)[0].atMs).toBe(defend.start+6500);
  });
  it('防御の回は、何も描いていないときだけ狙いの印の高さに置き、描いた形は描いた場所に残す',()=>{
    const wide=1600,high=900;
    expect(completedSpellFrame(wide,high,beatOf(first)).y).toBeCloseTo(high*.66);
    expect(completedSpellFrame(wide,high,beatOf(defend)).y).toBeCloseTo(high*AIM.y);
    // 締め切りまでは入力した位置のまま。発動でも描いた場所に残る（盾は描いた線からそのまま作るので、術式も同じ場所にある方が合う）。
    const points=[{x:.3,y:.3,t:defend.start,hand:0,stroke:1},{x:.4,y:.4,t:defend.start+500,hand:0,stroke:1},{x:.6,y:.5,t:defend.start+1000,hand:0,stroke:1}];
    expect(spellPose(points,wide,high,defend.inputEnd,beatOf(defend)).progress).toBe(0);
    expect(spellPose(points,wide,high,defend.release,beatOf(defend)).progress).toBe(1);
    expect(spellPose(points,wide,high,defend.release,beatOf(defend)).center).toEqual({x:wide*.45,y:high*.4});
    expect(spellPose(points,wide,high,defend.release,beatOf(defend)).scale).toBeCloseTo(1);
    // 余韻は回の終わりより前に消えきる。
    expect(spellPose(points,wide,high,defend.end,beatOf(defend)).opacity).toBe(0);
  });
  it('重い後処理は、回ごとに発動の前後だけ出す',()=>{
    const beat=防;
    // 防御の回は、敵の一撃が床を打つ時刻の0.1秒前から入れる（合成の試験で確かめる）。その前は出さない。
    expect(postHeavyActive(SLAM_AT-.15,beat)).toBe(false);
    expect(postHeavyActive(防.release+.5,beat)).toBe(true);
    expect(postHeavyActive(防.impact+3,beat)).toBe(false);
    // 一回目も同じ作りで、発動の直前から命中の2.5秒後まで。
    expect(postHeavyActive(一.release)).toBe(true);
    expect(postHeavyActive(一.impact+3)).toBe(false);
    expect(bloomWeightAt(防.impact,false,0,beat)).toBeGreaterThan(bloomWeightAt(防.impact+1.6,false,0,beat));
  });
});
