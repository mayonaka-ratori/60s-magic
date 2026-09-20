import { describe, expect, it } from 'vitest';
import { Diagnostics } from '../src/game/diagnostics';

describe('確認用の記録',()=>{
  it('線の入力から描画までの時間と、声の遅れをまとめる',()=>{
    let now=1000;const d=new Diagnostics(1000,()=>now);
    now=1100;d.pointer();d.pointer();now=1130;d.frame(16);
    now=2000;d.pointer();now=2060;d.frame(60);
    d.audio(3208,300);d.audio(3208,400);
    now=5000;d.transcript({revision:1,startMs:300,endMs:3500,text:'氷よ',final:false,stability:0.5,source:'local',processingMs:1200});
    d.log('入力を確定',{transcript:'氷よ'});
    const s=d.summary();
    expect(s.drawing.pointerEvents).toBe(3);expect(s.drawing.pointerToFrameMs.max).toBe(60);expect(s.drawing.pointerToFrameMs.p50).toBe(30);expect(s.drawing.framesOver50Ms).toBe(1);
    expect(s.voice.audioChunksSent).toBe(2);expect(s.voice.audioBytesSent).toBe(6416);expect(s.voice.firstAudioMs).toBe(300);
    expect(s.voice.lastResult).toMatchObject({arrivedMs:4000,coversUntilMs:3500,delayMs:500,text:'氷よ',processingMs:1200});
    expect(s.voice.finalReceived).toBe(false);expect(s.events[0]).toMatchObject({atMs:4000,kind:'入力を確定'});
  });
  it('24秒の開始が後から決まっても、前の出来事の時刻を合わせる',()=>{
    let now=0;const d=new Diagnostics(0,()=>now);
    now=500;d.log('準備');now=2000;d.rebase(2000);d.log('開始');
    expect(d.events.map(e=>e.atMs)).toEqual([-1500,0]);
  });
});
