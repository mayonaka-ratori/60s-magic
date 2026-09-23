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
  it('二回目以降の回でも、声の遅れを本編の開始からの時刻でそろえて出す',()=>{
    // 声は回ごとに0から数えて届く。二回目の回が本編の開始から50000ms目に始まったとする。
    let now=0;const d=new Diagnostics(0,()=>now);
    d.voiceRound(0);now=4000;d.transcript({revision:1,startMs:300,endMs:3500,text:'氷よ',final:true,stability:1,source:'local'});
    d.voiceRound(50000);d.audio(3208,0);d.audio(3208,200);
    now=53800;d.transcript({revision:1,startMs:1000,endMs:3200,text:'光よ',final:true,stability:1,source:'local'});
    const s=d.summary();
    expect(s.voice.lastResult).toMatchObject({arrivedMs:53800,coversUntilMs:53200,delayMs:600,text:'光よ'});
    expect(s.voice.firstAudioMs).toBe(50000);expect(s.voice.lastAudioMs).toBe(50200);
    expect(s.voice.arrivals.map(t=>[t.roundStartMs,t.startMs,t.endMs])).toEqual([[0,300,3500],[50000,51000,53200]]);
  });
  it('手の認識にかかった時間と、GPUとCPUのどちらで動いたかを残す',()=>{
    const d=new Diagnostics(0,()=>0);
    d.cameraDelegate='GPU';
    d.camera(4,9);d.camera(6,12);d.camera(20,30);
    const s=d.summary();
    expect(s.camera.delegate).toBe('GPU');expect(s.camera.frames).toBe(3);
    expect(s.camera.detectMs.average).toBe(10);expect(s.camera.detectMs.max).toBe(20);
    expect(s.camera.latencyMs.max).toBe(30);
  });
  it('カメラを使わない回は、手の認識の記録を空のままにする',()=>{
    const s=new Diagnostics(0,()=>0).summary();
    expect(s.camera.delegate).toBeNull();expect(s.camera.frames).toBe(0);expect(s.camera.detectMs.average).toBeNull();
  });
  it('90秒の開始が後から決まっても、前の出来事の時刻を合わせる',()=>{
    let now=0;const d=new Diagnostics(0,()=>now);
    now=500;d.log('準備');now=2000;d.rebase(2000);d.log('開始');
    expect(d.events.map(e=>e.atMs)).toEqual([-1500,0]);
  });
});
