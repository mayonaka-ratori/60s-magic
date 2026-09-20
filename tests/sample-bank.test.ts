import { describe,it,expect } from 'vitest';
import { parseManifest,chooseEntry,dbToGain,SampleBank } from '../src/audio/sample-bank';

const manifest={
  bgm:{file:'bgm/battle.ogg',gainDb:-9,credit:'音楽：魔王魂'},
  sfx:{
    impact:{files:['sfx/a.ogg','sfx/b.ogg']},
    'impact.ice':{file:'sfx/ice.ogg',synth:false,gainDb:-6,credit:'効果音ラボ'},
    broken:{},
    text:'x',
  },
};
function fakeFetch(present:string[]) {
  const calls:string[]=[];
  const impl=async(url:string)=>{
    calls.push(url);
    const path=url.replace(/^.*\/audio\//,'');
    if(path==='manifest.json')return {ok:true,status:200,json:async()=>manifest,arrayBuffer:async()=>new ArrayBuffer(0)};
    const ok=present.includes(path);
    return {ok,status:ok?200:404,json:async()=>({}),arrayBuffer:async()=>new ArrayBuffer(8)};
  };
  return {impl,calls};
}
const decoder={decodeAudioData:async(data:ArrayBuffer)=>({duration:data.byteLength/8,length:1,numberOfChannels:1,sampleRate:48000} as unknown as AudioBuffer)};

describe('音素材の一覧',()=>{
  it('欠けた項目を既定値で埋め、壊れた項目を捨てる',()=>{
    const parsed=parseManifest(manifest);
    expect(parsed.bgm).toEqual({file:'bgm/battle.ogg',gainDb:-9,loop:true,credit:'音楽：魔王魂'});
    expect(parsed.sfx.impact).toEqual({files:['sfx/a.ogg','sfx/b.ogg'],gainDb:0,synth:true});
    expect(parsed.sfx['impact.ice']).toEqual({files:['sfx/ice.ogg'],gainDb:-6,synth:false});
    expect(parsed.sfx.broken).toBeUndefined();expect(parsed.sfx.text).toBeUndefined();
    expect(parsed.credits).toEqual(['音楽：魔王魂','効果音ラボ']);
    expect(parseManifest(null)).toEqual({bgm:null,sfx:{},credits:[]});
  });
  it('属性つきの項目を優先し、無ければ共通の項目を使う',()=>{
    const parsed=parseManifest(manifest);
    expect(chooseEntry(parsed,'impact','ice')?.files).toEqual(['sfx/ice.ogg']);
    expect(chooseEntry(parsed,'impact','fire')?.files).toEqual(['sfx/a.ogg','sfx/b.ogg']);
    expect(chooseEntry(parsed,'settle','fire')).toBeNull();
  });
  it('dBを倍率に直す',()=>{
    expect(dbToGain(0)).toBe(1);expect(dbToGain(-6)).toBeCloseTo(.501,3);expect(dbToGain(-8)).toBeCloseTo(.398,3);
  });
});
describe('音素材の読み込み',()=>{
  it('ある音だけ読み、無い音は記録して飛ばす',async()=>{
    const bank=new SampleBank();const {impl,calls}=fakeFetch(['bgm/battle.ogg','sfx/a.ogg']);
    const report=await bank.load(decoder,impl,'http://localhost:5173/');
    expect(calls[0]).toBe('http://localhost:5173/audio/manifest.json');
    expect(report).toEqual({manifest:true,loaded:['bgm/battle.ogg','sfx/a.ogg'],missing:['sfx/b.ogg','sfx/ice.ogg']});
    expect(bank.bgm?.entry.gainDb).toBe(-9);
    expect(bank.pick('impact','ice')).toBeNull();
    const picked=bank.pick('impact','fire');expect(picked?.synth).toBe(true);expect(picked?.gain).toBe(1);
    expect(bank.pick('impact','fire')?.buffer).toBe(picked?.buffer);
    expect(await bank.load(decoder,impl,'http://localhost:5173/')).toBe(report);expect(calls.length).toBe(5);
  });
  it('一覧が無ければ何も読まず、合成音だけで続けられる',async()=>{
    const bank=new SampleBank();
    const report=await bank.load(decoder,async()=>({ok:false,status:404,json:async()=>({}),arrayBuffer:async()=>new ArrayBuffer(0)}),'/');
    expect(report).toEqual({manifest:false,loaded:[],missing:[]});expect(bank.bgm).toBeNull();expect(bank.pick('impact','fire')).toBeNull();
  });
  it('複数の音を順番に回す',async()=>{
    const bank=new SampleBank();await bank.load(decoder,fakeFetch(['sfx/a.ogg','sfx/b.ogg']).impl,'/');
    const first=bank.pick('impact',null)!.buffer,second=bank.pick('impact',null)!.buffer,third=bank.pick('impact',null)!.buffer;
    expect(first).not.toBe(second);expect(third).toBe(first);
  });
});
