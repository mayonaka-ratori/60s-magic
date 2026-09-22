import { beforeEach,describe,it,expect } from 'vitest';
import { readChant } from '../src/game/chant-dictionary';
import { liveWords,resetLiveWords } from '../src/game/live-words';
import { MAX_VOICE_LAYERS,VoiceGrowth } from '../src/game/voice-growth';
import { Battle } from '../src/game/battle';
import { FLOW,ROUNDS,beatOf } from '../src/game/rounds';
import { playOf,resultRows } from '../src/game/record';
import { drawVoiceGrowth } from '../src/render/effects/voice-growth';
import { callRecorder,testFrame } from './helpers';

const words=(text:string,id=0)=>liveWords([{id,revision:1,startMs:0,endMs:1,text,final:false,stability:.5,source:'local'}]);
beforeEach(()=>resetLiveWords());
describe('声で育つ術式の部品',()=>{
  it('呼び掛けと飾りは色を決めず、作品名の一文字も拾わない',()=>{
    const chant=readChant('けんげん、森羅万象、破道');
    expect(chant.meaning.replace(/\s/g,'')).toBe('、、');
    const live=words('けんげん、森羅万象、破道');
    expect(live.map(w=>w.kind)).toEqual(['invocation','invocation']);
    expect(live.every(w=>w.element===null&&w.form===null&&w.purpose===null)).toBe(true);
    expect(words('顕現ではなく氷').map(w=>w.kind)).toEqual(['element']);
  });
  it('全種類を残し、同じ言葉の繰り返しを増やさず、言い直しと締め切りを守る',()=>{
    const growth=new VoiceGrowth();
    growth.update(words('炎、壁、螺旋、守れ、七つ、顕現'),10,0,100);
    expect(new Set(growth.snapshot().map(p=>p.kind))).toEqual(new Set(['element','form','change','purpose','count','invocation']));
    const original=growth.snapshot();
    growth.update(words('炎、壁、螺旋、守れ、七つ、顕現、炎、顕現',1),20,0,100);
    expect(growth.snapshot().map(p=>p.id)).toEqual(original.map(p=>p.id));
    growth.update(words('氷、球、追尾、撃て、三つ、降臨',2),30,0,100);
    expect(growth.snapshot().slice(0,original.length).every(p=>!p.active)).toBe(true);
    const frozen=growth.snapshot();growth.update(words('雷'),100,0,100);expect(growth.snapshot()).toEqual(frozen);
    frozen[0].active=true;expect(growth.snapshot()[0].active).toBe(false);
  });
  it('言い直しが増えても部品数を抑える',()=>{
    const growth=new VoiceGrowth();
    for(let i=1;i<=100;i++)growth.update(words(`${i}個`,i),i+1,0,200);
    expect(growth.snapshot().length).toBeLessThanOrEqual(MAX_VOICE_LAYERS);
    expect(growth.snapshot().at(-1)?.active).toBe(true);
  });
  it('形は消えず、壁・球・波・鎖で違う描画になり、確定で中心へ集まる',()=>{
    const beat=beatOf({...ROUNDS[0],drawEnd:null,voiceStart:0});
    const render=(text:string,t:number,calm=false)=>{
      const growth=new VoiceGrowth();growth.update(words(text),2,0,100);
      const {c,calls}=callRecorder(),f=testFrame({c,t,beat,locked:false,calm});
      f.live={...f.live,voiceLayers:growth.snapshot()};drawVoiceGrowth(f);return calls;
    };
    expect(render('壁',5).some(c=>c.name==='rect')).toBe(true);
    expect(render('球',5).filter(c=>c.name==='ellipse').length).toBeGreaterThan(1);
    expect(render('波',5).some(c=>c.name==='quadraticCurveTo')).toBe(true);
    expect(render('鎖',5).filter(c=>c.name==='lineTo')).toHaveLength(6);
    const positions=render('壁、球、七つ',beat.lock).filter(c=>c.name==='translate');
    expect(positions.every(c=>c.args[0]===200&&c.args[1]===500)).toBe(true);
    expect(render('壁、螺旋',5).find(c=>c.name==='rotate')?.args[0]).not.toBe(0);
    expect(render('壁、螺旋',5,true).every(c=>c.name!=='rotate'||c.args[0]===0)).toBe(true);
    expect(render('壁',beat.release+.5)).toHaveLength(0);
  });
  it('声だけの回の色を一度だけ引き継ぎ、保存と結果の絵にも残す',()=>{
    if(FLOW!=='sequential')return;
    let now=0;const battle=new Battle(()=>now,'色の引き継ぎ');
    battle.first.speech.add({id:0,revision:1,startMs:0,endMs:1,text:'炎と氷、顕現',final:true,stability:1,source:'typed'});
    now=2;battle.tick();now=ROUNDS[0].handoff;battle.tick();battle.tick();
    expect(battle.inherited.map(p=>p.element)).toEqual(['fire','ice']);
    const saved=playOf(battle,'123456','今');
    expect(saved.inherited.map(p=>p.element)).toEqual(['fire','ice']);
    expect(resultRows(saved)[0].voiceColors).toEqual(['fire','ice']);
    expect(battle.report().flow).toBe(FLOW);expect(saved.flow).toBe(FLOW);
  });
});
