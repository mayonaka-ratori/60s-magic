import { describe, expect, it } from 'vitest';
import { Battle } from '../src/game/battle';
import { CastSession } from '../src/game/session';
import { FLOW, ROUNDS, TOGETHER_ROUNDS, SEQUENTIAL_ROUNDS, MAX_INPUT_MS, MAX_INPUT_SAMPLES, SAMPLES_PER_MS, flowOf, beatOf, windowMsOf } from '../src/game/rounds';

describe('二つの遊び方', () => {
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
