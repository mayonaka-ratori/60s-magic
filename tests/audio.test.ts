import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { soundIntensity } from '../src/audio/cast-audio';
import { presets } from '../src/render/effects/presets';
import type { Recipe } from '../src/game/types';
import { runInNewContext } from 'node:vm';

type Packet={type:string;pcm?:Int16Array;startMs?:number;value?:number};
type Processor={port:{onmessage:(event:{data:object})=>void};process:(inputs:Float32Array[][])=>boolean};
function processor(rate:number) {
  const packets:Packet[]=[];let Constructor:new()=>Processor;
  class Base {port={postMessage:(data:Packet)=>packets.push(data),onmessage:()=>{}};}
  runInNewContext(readFileSync('public/audio-worklet.js','utf8'),{sampleRate:rate,AudioWorkletProcessor:Base,registerProcessor:(_name:string,c:new()=>Processor)=>{Constructor=c;}});
  const instance=new Constructor!();
  instance.port.onmessage({data:{type:'start',offset:0}});
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
  it('14秒より後の音声を送らず、無音だけなら送らない',()=>{
    const silent=processor(48000);silent.feed(14,0);expect(silent.packets.filter(p=>p.type==='audio')).toHaveLength(0);
    const voiced=processor(48000);voiced.feed(16,.1);const audio=voiced.packets.filter(p=>p.type==='audio');
    expect(audio.reduce((n,p)=>n+p.pcm!.length,0)).toBe(224000);expect(audio.at(-1)!.startMs!+audio.at(-1)!.pcm!.length/16).toBe(14000);
  });
});

const recipe=():Recipe=>({version:'recipe-1',accent:null,element:'fire',purpose:'attack',form:'orb',trajectory:'straight',count:1,explicitCount:null,
  defense:.2,area:.2,duration:.5,concentration:0,enclosure:false,split:false,developsPrevious:null,motionSpeechAligned:null,noAttack:false,
  name:'',source:'local',decisions:{},assistance:[],model:null});
describe('音の厚み',()=>{
  it('入力の量が多いほど合成音の派手さが上がる',()=>{
    const quiet=soundIntensity(recipe(),presets.vivid),busy=soundIntensity(recipe(),presets.vivid,1);
    expect(busy).toBeGreaterThan(quiet);
    expect(busy-quiet).toBeCloseTo(.6,5);
    expect(soundIntensity(recipe(),presets.vivid,0)).toBe(quiet);
    // 魔法が決まる前でも量だけで厚みが増える。上限の3は超えない。
    expect(soundIntensity(null,presets.vivid,1)).toBeGreaterThan(soundIntensity(null,presets.vivid));
    // 設定は倍率なので、最大の設定に量を足しても、小さいレシピでは上限に届かない。
    expect(soundIntensity(recipe(),presets.max,1)).toBeLessThan(3);
  });
});
