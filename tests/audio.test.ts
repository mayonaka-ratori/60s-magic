import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { ROUNDS, SAMPLES_PER_MS, windowMsOf } from '../src/game/rounds';

type Packet={type:string;pcm?:Int16Array;startMs?:number;value?:number};
type Processor={port:{onmessage:(event:{data:object})=>void};process:(inputs:Float32Array[][])=>boolean};
function processor(rate:number,windowMs?:number) {
  const packets:Packet[]=[];let Constructor:new()=>Processor;
  class Base {port={postMessage:(data:Packet)=>packets.push(data),onmessage:()=>{}};}
  runInNewContext(readFileSync('public/audio-worklet.js','utf8'),{sampleRate:rate,AudioWorkletProcessor:Base,registerProcessor:(_name:string,c:new()=>Processor)=>{Constructor=c;}});
  const instance=new Constructor!();
  instance.port.onmessage({data:{type:'start',offset:0,windowMs}});
  let sample=0;
  const feed=(seconds:number,amplitude:number)=>{
    for(let frame=0;frame<rate*seconds;frame+=128){const chunk=new Float32Array(Math.min(128,Math.round(rate*seconds)-frame));for(let i=0;i<chunk.length;i++)chunk[i]=Math.sin((sample++)/rate*Math.PI*2*440)*amplitude;instance.process([[chunk]]);}
  };
  return {instance,packets,feed};
}
describe('実際の音の取り込み',()=>{
  it.each([44100,48000])('%i Hz のマイクを16kHzに変え、先頭の音と短い間を残す',rate=>{
    const {feed,instance,packets}=processor(rate);feed(.5,0);feed(.5,.1);feed(.15,0);feed(.5,.1);instance.port.onmessage({data:{type:'stop'}});
    const audio=packets.filter(p=>p.type==='audio');expect(audio[0].startMs).toBe(200);expect(audio.at(-1)!.startMs).toBeLessThan(1700);
    const samples=audio.reduce((n,p)=>n+p.pcm!.length,0);expect(samples).toBeGreaterThan(22000);expect(samples).toBeLessThan(23500);
    expect(audio.every(p=>p.pcm!.length<=1600)).toBe(true);expect(packets.at(-1)?.type).toBe('stopped');
  });
  it('受付の長さを過ぎた音声を送らず、無音だけなら送らない',()=>{
    // 打ち切りは画面から渡す受付の長さだけで決まり、長さによらず同じ作り。
    // 本物の長さ（十数秒）を流すと遅いので、回の表の受付の長さを10分の1にして試す。長い回と短い回の順はそのまま。
    const long=windowMsOf(ROUNDS[0])/10,short=windowMsOf(ROUNDS[1])/10;
    expect(short).toBeLessThan(long);
    const silent=processor(48000,long);silent.feed(long/1000,0);expect(silent.packets.filter(p=>p.type==='audio')).toHaveLength(0);
    // 受付より長く声を流しても、受付の長さの分だけ送る。音の受け皿の大きさ（MAX_INPUT_SAMPLES）も同じ掛け算で作る。
    const voiced=processor(48000,long);voiced.feed(long/1000+.5,.1);const audio=voiced.packets.filter(p=>p.type==='audio');
    expect(audio.reduce((n,p)=>n+p.pcm!.length,0)).toBe(long*SAMPLES_PER_MS);
    expect(audio.at(-1)!.startMs!+audio.at(-1)!.pcm!.length/SAMPLES_PER_MS).toBe(long);
    // 短い回では、その回の長さで止まる。長い回の長さまで録り続けない。
    const shortVoiced=processor(48000,short);shortVoiced.feed(long/1000,.1);const shortAudio=shortVoiced.packets.filter(p=>p.type==='audio');
    expect(shortAudio.at(-1)!.startMs!+shortAudio.at(-1)!.pcm!.length/SAMPLES_PER_MS).toBe(short);
  });
});
