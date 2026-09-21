import { describe,it,expect } from 'vitest';
import { CastSession,phaseAt } from '../src/game/session';
import { MotionRecorder,summarizeMotion } from '../src/game/motion';
import { makeRecipe } from '../src/game/recipe';
import { SpeechBook } from '../src/game/speech-book';
import type { JevReply,SpellState } from '../src/game/types';
import { ROUNDS,replyLimitOf } from '../src/game/rounds';

// 秒数は回の表から作る。表を直したら、この試験も一緒に動く。
const first=ROUNDS[0];

function state(text=''):SpellState {
  const s=new CastSession(()=>0);
  s.motion.add(0.2,0.5,0);s.motion.add(0.5,0.55,100);
  if(text)s.speech.add({id:1,revision:1,startMs:first.chant,endMs:first.inputEnd-1,text,final:true,stability:1,source:'typed'});
  return s.freeze();
}
const text=(b:SpeechBook)=>b.snapshot().map(e=>e.text).join('、');
const reply=(s:SpellState,answers:JevReply['answers']):JevReply=>({sessionId:s.sessionId,castId:s.castId,inputRevision:s.inputRevision,status:'ok',model:'test-model',answers});
describe('最初の30秒',()=>{
  it('全ての受付と演出の境目を固定する',()=>{
    const 境目:Array<[number,string]>=[[0,'draw'],[first.build!-1,'draw'],[first.build!,'build'],[first.chant-1,'build'],
      [first.chant,'chant'],[first.inputEnd-1,'chant'],[first.inputEnd,'complete'],[first.release-1,'complete'],
      [first.release,'release'],[first.handoff-1,'release'],[first.handoff,'handoff'],[first.end,'finished']];
    for(const [time,phase] of 境目)expect(phaseAt(time)).toBe(phase);
  });
  it('詠唱を終えた後も最後の線まで受け付け、締め切りの3秒後に一度だけ確定する',()=>{
    let now=0;const s=new CastSession(()=>now);
    s.speech.add({id:1,revision:1,startMs:1000,endMs:3000,text:'雷よ',final:true,stability:1,source:'google'});
    now=first.inputEnd-1000;expect(s.accepting).toBe(true);s.motion.add(0.3,0.3,now);
    now=first.inputEnd-1;s.motion.add(0.4,0.4,now);now=first.inputEnd;expect(s.accepting).toBe(false);
    const snapshot=s.freeze();expect(snapshot.motion.sampleCount).toBe(2);expect(snapshot.speech.rawTranscript).toBe('雷よ');
    now=first.inputEnd+700;s.receive(reply(snapshot,{element:{type:'choice',choice:'fire',probabilities:{fire:.95,ice:.05}}}));s.tick();expect(s.recipe).toBeNull();
    now=first.lock;s.tick();expect(s.recipe?.element).toBe('lightning');const recipe=s.recipe;
    now=first.release+1000;s.receive(reply(snapshot,{}));s.tick();expect(s.recipe).toBe(recipe);expect(s.phase).toBe('release');
  });
  it('無応答でも確定の時刻で確定し、発動より前には放たない',()=>{
    let now=0;const s=new CastSession(()=>now);now=first.lock;s.tick();expect(s.locked).toBe(true);expect(s.phase).toBe('complete');
    expect(s.recipe?.assistance).toContain('動きがないため中央の光点を使用');
    now=first.release;s.tick();expect(s.phase).toBe('release');
  });
  it('別のプレイ、遅い返事、中止後の返事を使わない',()=>{
    let now=0;const s=new CastSession(()=>now),snapshot=s.freeze();
    expect(s.receive({...reply(snapshot,{}),sessionId:'other'})).toBe(false);
    expect(s.receive({...reply(snapshot,{}),inputRevision:2})).toBe(false);
    now=replyLimitOf(first);expect(s.receive(reply(snapshot,{}))).toBe(false);
    const other=new CastSession(()=>0),o=other.freeze();other.cancel();expect(other.receive(reply(o,{}))).toBe(false);expect(other.accepting).toBe(false);
  });
});
describe('本人の線を残す',()=>{
  it('静止・認識の途切れから再開しても離れた点へ線を引かない',()=>{
    const m=new MotionRecorder();m.add(.2,.3,0);m.add(.21,.3,33);m.add(.22,.3,2033);m.add(.9,.8,2066);
    expect(m.raw[0].stroke).toBe(m.raw[1].stroke);expect(m.raw[2].stroke).not.toBe(m.raw[1].stroke);expect(m.raw[3].stroke).not.toBe(m.raw[2].stroke);
    expect(m.raw).toHaveLength(4);expect(summarizeMotion(m.raw).pathLength).toBeCloseTo(.01);
  });
  it('長い軌跡は表示だけ間引き、開始点と最後の点と元の点列を残す',()=>{
    const m=new MotionRecorder();for(let i=0;i<420;i++)m.add(.4+Math.sin(i/40)*.15,.5+Math.cos(i/40)*.15,i*33);
    expect(m.display.length).toBeLessThanOrEqual(256);expect(m.raw).toHaveLength(420);expect(m.display[0].t).toBe(0);expect(m.display.at(-1)?.t).toBe(419*33);
    expect(m.add(.6,.6,first.inputEnd)).toBe(false);
  });
  it('小さな片手の動きも入力ありにする',()=>{const m=new MotionRecorder();m.add(.5,.5,0);m.add(.505,.505,33);expect(summarizeMotion(m.raw).hasMovement).toBe(true);});
});
describe('詠唱の受付',()=>{
  it('途中の更新を重複させず、別の発話は加え、確定後は変えない',()=>{
    const book=new SpeechBook();
    const base={id:1,revision:1,startMs:10,endMs:1000,text:'雷',final:false,stability:.5,source:'google' as const};
    book.add(base);expect(text(book)).toBe('');book.add({...base,revision:2,text:'雷よ',final:true});
    book.add({...base,revision:1,text:'氷'});book.add({...base,id:2,startMs:12000,endMs:13990,text:'七つに分かれろ',final:true});
    expect(text(book)).toBe('雷よ、七つに分かれろ');book.freeze();book.add({...base,id:3,final:true});expect(book.snapshot()).toHaveLength(2);
  });
  it('受付外に話した文字は使わない',()=>{
    const b=new SpeechBook();b.add({id:1,revision:1,startMs:14000,endMs:15000,text:'氷',final:true,stability:1,source:'google'});expect(text(b)).toBe('');
  });
});
describe('形と言葉を魔法へ反映する',()=>{
  it.each([['炎よ、球となれ','fire','orb',1],['氷よ、壁となれ','ice','wall',1],['雷よ、七つに分かれろ','lightning','swarm',7],['風よ、すべてを押し流せ','wind','wave',1],['光よ、貫け','light','beam',1],['カメナリよ7つに分かれろ','lightning','swarm',7],['カメナリを7つに分かれろ','lightning','swarm',7],['カメラリを7つに分かれろ','lightning','swarm',7],['かめなりよ、七つに分かれろ','lightning','swarm',7],['カメラリオ7つに分かれろ','lightning','swarm',7],['神なりよ、七つに分かれろ','lightning','swarm',7],['闇よ、結界となれ','dark','dome',1]] as const)('%s', (text,element,form,count)=>{
    const r=makeRecipe(state(text));expect(r.element).toBe(element);expect(r.form).toBe(form);expect(r.count).toBe(count);
  });
  it('否定・言い直し・最大個数を扱う',()=>{
    expect(makeRecipe(state('雷ではなく氷よ、壁となれ')).element).toBe('ice');
    const safe=makeRecipe(state('攻撃しないで、我を守れ'));expect(safe.noAttack).toBe(true);expect(safe.purpose).toBe('defend');
    expect(makeRecipe(state('百個の炎の球')).count).toBe(8);
  });
  it('辞書にない表現にJevを使い、使った項目を残す',()=>{
    const s=state('冬の静けさよ、前に立て');
    const r=makeRecipe(s,reply(s,{element:{type:'choice',choice:'ice',probabilities:{ice:.9,unknown:.1}},form:{type:'choice',choice:'wall',probabilities:{wall:.9,orb:.1}},area:{type:'score',score:1.8,confidence:.8},enclosure:{type:'noul',noul:.9}}));
    expect(r.element).toBe('ice');expect(r.form).toBe('wall');expect(r.area).toBe(.9);expect(r.enclosure).toBe(true);expect(r.decisions.element.source).toBe('jev');expect(r.source).toBe('mixed');
  });
  it('壊れた一項目だけを補い、他の有効な回答は残す',()=>{
    const s=state('静かな力よ');const r=makeRecipe(s,reply(s,{element:{type:'choice',choice:'banana',probabilities:{banana:1}},area:{type:'score',score:Infinity,confidence:1},duration:{type:'score',score:1.8,confidence:.9},split:{type:'noul',noul:.5}}));
    expect(r.element).toBe('neutral');expect(Number.isFinite(r.area)).toBe(true);expect(r.duration).toBe(.9);expect(r.split).toBe(false);
  });
  it('曖昧な候補や材料のない評価で別の魔法にしない',()=>{
    const s=state('');const r=makeRecipe(s,reply(s,{element:{type:'choice',choice:'ice',probabilities:{ice:.55,fire:.45}}}));expect(r.element).toBe('neutral');
    const noInput=new CastSession(()=>0).freeze();expect(makeRecipe(noInput,reply(noInput,{duration:{type:'score',score:2,confidence:1}})).duration).toBe(.5);
  });
});
