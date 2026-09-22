import { describe, expect, it } from 'vitest';
import { announcementAt, inputDeadline } from '../src/game/guidance';
import { ANNOUNCEMENT_HOLD_MS, ANNOUNCEMENT_MS } from '../src/game/rounds';
import { Battle } from '../src/game/battle';
import { CastSession } from '../src/game/session';
import { VoiceGrowth } from '../src/game/voice-growth';
import { liveWords, resetLiveWords } from '../src/game/live-words';
import { playOf, resultRows } from '../src/game/record';
import { drawVoiceGrowth } from '../src/render/effects/voice-growth';
import { testFrame, stubContext } from './helpers';
import { AIM, drawnGuard, shieldOf } from '../src/game/guard';
import { interpretAtOf, replyLimitOf, speechLimitOf, voiceConnectAt, showsCursor, VOICE_RECONNECT_MS } from '../src/game/rounds';
import { spellPose } from '../src/render/spell-layout';
import { FLOW, ROUNDS, TOGETHER_ROUNDS, SEQUENTIAL_ROUNDS, MAX_INPUT_MS, MAX_INPUT_SAMPLES, SAMPLES_PER_MS, flowOf, beatOf, windowMsOf } from '../src/game/rounds';

describe('二つの遊び方', () => {
  it('選んだ表のとおりに手と声を受け付け、とどめの切り替えで線と光点を止める', () => {
    const expected=FLOW==='sequential'?[[null,0],[38000,null],[62000,62000]]:[[18000,0],[45000,30000],[72000,56000]];
    expect(ROUNDS.map(r=>[r.drawEnd,r.voiceStart])).toEqual(expected);
    for(const round of ROUNDS) {
      let now=round.start;const cast=new CastSession(()=>now,'境目',round,0);
      expect(cast.acceptingDrawing).toBe(round.drawEnd!==null);
      expect(cast.acceptingVoice).toBe(round.voiceStart===round.start);
      if(round.drawEnd!==null) {
        now=round.drawEnd-1;expect(cast.motion.add(.2,.3,now)).toBe(true);expect(showsCursor(round,now)).toBe(true);
        now++;expect(cast.motion.add(.3,.4,now)).toBe(false);expect(showsCursor(round,now)).toBe(false);
      }
      if(round.voiceStart!==null) {
        expect(voiceConnectAt(round)).toBe(round.voiceStart-VOICE_RECONNECT_MS);
        now=round.voiceStart;expect(cast.acceptingVoice).toBe(true);
        now=round.inputEnd;expect(cast.acceptingVoice).toBe(false);
      }
    }
    const finish=ROUNDS[2],points=[{x:.4,y:.4,t:finish.start,hand:0,stroke:0},{x:.45,y:.42,t:finish.start+1,hand:0,stroke:0}];
    expect(spellPose(points,1280,720,finish.drawEnd!,beatOf(finish)).progress).toBe(0);
    expect(spellPose(points,1280,720,finish.drawEnd!+1,beatOf(finish)).progress).toBeGreaterThan(0);
    expect(ROUNDS[2].release).toBe(TOGETHER_ROUNDS[2].release);
    expect(ROUNDS[2].finalBlow).toBe(TOGETHER_ROUNDS[2].finalBlow);
  });
  it('三段の描き方と無入力で止め方が決まり、描いた縁を変えない', () => {
    const ring=Array.from({length:33},(_,i)=>({x:AIM.x+Math.cos(i/32*Math.PI*2)*.1,y:AIM.y+Math.sin(i/32*Math.PI*2)*.15,t:i,hand:0,stroke:0}));
    const covered=[{x:AIM.x-.1,y:AIM.y,t:0,hand:0,stroke:0},{x:AIM.x,y:AIM.y,t:1,hand:0,stroke:0}];
    const far=covered.map(p=>({...p,x:p.x+.4}));
    for(const [points,style,surface] of [[ring,'reflect','membrane'],[covered,'block','grid'],[far,'erase','orb'],[[],'erase','orb']] as const) {
      const plan=drawnGuard(points);
      expect(plan.style).toBe(style);expect(plan.surface).toBe(surface);
      expect(plan.shield).toEqual(shieldOf(points,null));
    }
  });
  it('手だけの防御は声を待たず、Jevが色を返しても無属性にする', () => {
    const round={...ROUNDS[1],voiceStart:null,chant:null};
    let now=round.start;const cast=new CastSession(()=>now,'手だけ',round,0);
    expect(voiceConnectAt(round)).toBeNull();expect(cast.acceptingVoice).toBe(false);
    expect(speechLimitOf(round)).toBe(round.inputEnd);
    expect(interpretAtOf(round)).toBeLessThan(replyLimitOf(round));
    now=round.inputEnd;cast.tick();expect(cast.guard?.style).toBe('erase');
    const state=cast.freeze();
    cast.receive({sessionId:state.sessionId,castId:state.castId,inputRevision:1,status:'ok',answers:{
      element:{type:'choice',choice:'fire',probabilities:{fire:1}},
      purpose:{type:'choice',choice:'attack',probabilities:{attack:1}},motionSpeechAligned:{type:'noul',noul:1},
    }});
    now=round.lock;cast.tick();
    expect(cast.recipe?.element).toBe('neutral');expect(cast.recipe?.accent).toBeNull();
    expect(cast.recipe?.purpose).toBe('defend');expect(cast.recipe?.motionSpeechAligned).toBeNull();
    expect(cast.recipe?.name).not.toContain('炎');
    expect(cast.recipe?.assistance).not.toContain('詠唱を記録できませんでした');
  });
  it('声だけの回では線を残さず、言葉の色と結果の円を残す', () => {
    const round={...ROUNDS[0],drawEnd:null,voiceStart:ROUNDS[0].start,chant:null};
    let now=round.start; const cast=new CastSession(()=>now,'声だけ',round,0);
    expect(cast.motion.add(.2,.3,now)).toBe(false);
    expect(cast.acceptingVoice).toBe(true);
    cast.speech.add({id:1,revision:1,startMs:0,endMs:1,text:'氷よ、球となれ',final:true,stability:1,source:'typed'});
    now=round.start+2;cast.tick();const state=cast.freeze();
    cast.receive({sessionId:state.sessionId,castId:state.castId,inputRevision:1,status:'ok',answers:{motionSpeechAligned:{type:'noul',noul:1}}});
    cast.lock();
    expect(state.motion.descriptions.outline).toBe('線なし');
    expect(cast.recipe?.decisions.form.reason).toBe('言葉から決めた');
    expect(cast.recipe?.motionSpeechAligned).toBeNull();
    const row=resultRows(playOf({id:'声だけ',casts:[cast],inherited:[]},'123456','今'))[0];
    expect(row.voiceColors).toEqual(FLOW==='sequential'?['ice']:[]);
    expect(row.points).toHaveLength(0);
    const silent=new CastSession(()=>0,'無言',round,0);silent.lock();
    expect(silent.recipe?.element).toBe('neutral');
    expect(silent.recipe?.assistance).toContain('詠唱を記録できませんでした');
  });
  it('同じ言葉を重ねず、言い直しを薄く残し、締め切り後は部品を足さない', () => {
    resetLiveWords();const growth=new VoiceGrowth(),round=ROUNDS[0];
    const words=(text:string,revision:number)=>liveWords([{id:0,revision,startMs:0,endMs:1,text,final:false,stability:.5,source:'local'}]);
    growth.update(words('炎',1),2,0,round.inputEnd);
    growth.update(words('炎、炎',2),3,0,round.inputEnd);
    expect(growth.snapshot()).toHaveLength(1);
    growth.update(words('氷',3),4,0,round.inputEnd);
    expect(growth.snapshot().map(p=>[p.element,p.active])).toEqual([['fire',false],['ice',true]]);
    growth.update(words('雷',4),round.inputEnd,0,round.inputEnd);
    expect(growth.snapshot()).toHaveLength(2);
  });
  it('無言でも円が育ち、声の大きさで描く内容は変わらない', () => {
    const beat=beatOf({...ROUNDS[0],drawEnd:null,voiceStart:0});
    const render=(t:number,voice:number)=>{const log:string[]=[];const f=testFrame({c:stubContext(log),beat,t});f.live.voice=voice;drawVoiceGrowth(f);return log;};
    const first=render(beat.start,0),later=render((beat.start+beat.inputEnd)/2,0);
    expect(first.some(s=>s.startsWith('ellipse:'))).toBe(true);expect(later).not.toEqual(first);
    expect(later).toEqual(render((beat.start+beat.inputEnd)/2,1));
    expect(render(beat.release,0)).toHaveLength(0);
  });
  it('合図を読んでいる間も受け付け、締め切りの表示を切り替える', () => {
    const round={...ROUNDS[2],drawEnd:ROUNDS[2].start+windowMsOf(ROUNDS[2])/2};
    expect(inputDeadline(round,round.drawEnd-1)).toBe(round.drawEnd);
    expect(inputDeadline(round,round.drawEnd)).toBe(round.inputEnd);
    if(FLOW==='sequential') {
      const cast=new CastSession(()=>round.start,'合図',round,0);
      expect(cast.acceptingDrawing).toBe(true);
      expect(announcementAt(round,round.start).text).toBe('第三幕　魔法陣を描こう！');
      expect(announcementAt(round,round.start+ANNOUNCEMENT_HOLD_MS).opacity).toBe(1);
      expect(announcementAt(round,round.start+ANNOUNCEMENT_MS-1).opacity).toBeLessThan(.01);
      expect(announcementAt(round,round.start+ANNOUNCEMENT_MS).text).toBe('');
      expect(announcementAt(round,round.drawEnd).text).toBe('手を止めて、詠唱を始めよう！');
      expect(announcementAt(round,round.drawEnd+ANNOUNCEMENT_MS).text).toBe('');
    } else expect(announcementAt(ROUNDS[0],ROUNDS[0].start).text).toBe('');
  });
  it('手と声の境目を分けても言葉の時刻は回の開始から数える', () => {
    const base=ROUNDS[2], change=base.start+(base.inputEnd-base.start)/2;
    const round={...base,drawEnd:change,voiceStart:change};
    let now=base.start; const cast=new CastSession(()=>now,'受付',round,0);
    expect(cast.acceptingDrawing).toBe(true); expect(cast.acceptingVoice).toBe(false);
    now=change-1; expect(cast.motion.add(.2,.3,now)).toBe(true);
    now=change; expect(cast.acceptingDrawing).toBe(false); expect(cast.acceptingVoice).toBe(true);
    expect(cast.motion.add(.4,.5,now)).toBe(false);
    const entry={id:0,revision:1,startMs:change-base.start,endMs:change-base.start+1,text:'氷',final:true,stability:1,source:'typed' as const};
    cast.speech.add({...entry,startMs:0}); expect(cast.speech.live()).toHaveLength(0);
    cast.speech.add(entry); const state=cast.freeze();
    expect(state.timedEvents.find(e=>e.speech)?.startMs).toBe(change);
    expect(state.inputWindow.motionAndSpeechConcurrent).toBe(FLOW==='together');
    now=base.inputEnd; expect(cast.acceptingVoice).toBe(false);
  });
  it('受付の無い入力は記録しない', () => {
    const round={...ROUNDS[0],drawEnd:null,voiceStart:null,chant:null};
    const cast=new CastSession(()=>round.start,'受付なし',round,0);
    expect(cast.acceptingDrawing).toBe(false); expect(cast.acceptingVoice).toBe(false);
    expect(cast.motion.add(.2,.3,round.start)).toBe(false);
    cast.speech.add({id:0,revision:1,startMs:0,endMs:1,text:'炎',final:true,stability:1,source:'typed'});
    expect(cast.freeze().speech.rawTranscript).toBe('');
  });
  it('URLで選び、指定がなければ順番にする', () => {
    expect(flowOf('')).toBe('sequential');
    expect(flowOf('?flow=together')).toBe('together');
    expect(flowOf('?flow=知らない名前')).toBe('sequential');
    expect(ROUNDS).toBe(FLOW === 'together' ? TOGETHER_ROUNDS : SEQUENTIAL_ROUNDS);
  });
  it('設計の時刻で三回をつなぎ、両方とも90秒で終える', () => {
    expect(TOGETHER_ROUNDS.map(r => [r.start, r.end])).toEqual([[0,30000],[30000,56000],[56000,90000]]);
    expect(SEQUENTIAL_ROUNDS.map(r => [r.start,r.inputEnd,r.lock,r.release,r.impact,r.handoff,r.end])).toEqual([
      [0,14000,17000,18000,19500,24000,26000],
      [26000,38000,40000,41000,42400,46000,50000],
      [50000,72000,75000,76000,77600,84000,90000],
    ]);
    let now=0; const battle=new Battle(()=>now);
    for(const round of ROUNDS) {
      now=round.start; battle.tick(); expect(battle.active.round).toBe(round);
      now=round.lock; battle.tick(); expect(battle.active.recipe).not.toBeNull();
      now=round.release; battle.tick(); expect(battle.phase).toBe('release');
      expect(beatOf(round).release*1000).toBe(round.release);
    }
    now=ROUNDS.at(-1)!.end; battle.tick(); expect(battle.finished).toBe(true);
  });
  it('音声の受け皿は両方の表の最長の受付を収める', () => {
    expect(MAX_INPUT_MS).toBe(22000);
    for(const round of [...TOGETHER_ROUNDS,...SEQUENTIAL_ROUNDS]) expect(windowMsOf(round)).toBeLessThanOrEqual(MAX_INPUT_MS);
    expect(MAX_INPUT_SAMPLES).toBe(MAX_INPUT_MS*SAMPLES_PER_MS);
  });
});
