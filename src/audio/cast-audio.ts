import { dueSounds, type SoundCue } from './cues';
import { SampleBank } from './sample-bank';
import type { Recipe } from '../game/types';

/** 録音を止める時刻。ここまでマイクを使う回は曲を下げ、効果音を鳴らさない。 */
const RECORDING_END_MS=14750;
/** 詠唱中に曲を下げる量。仕様の6〜10dBの中を取る。 */
const DUCK_DB=8;

/**
 * 用意した音素材があればそれを鳴らし、無ければ短い音と雑音を合成する。
 * 曲と効果音は別の経路にまとめ、どちらも一つの音量で制御する。録音用の接続とは独立。
 */
export class CastAudio {
  private context:AudioContext|null=null;
  private master:GainNode|null=null;
  private music:GainNode|null=null;
  private sfx:GainNode|null=null;
  private duck:GainNode|null=null;
  private bank=new SampleBank();
  private bgm:{source:AudioBufferSourceNode;gain:GainNode}|null=null;
  private bgmStarted=false;
  private bgmStartedAtMs:number|null=null;
  private sources=new Set<AudioScheduledSourceNode>();
  private lastMs=-1;
  private running=false;
  private microphone=false;
  private ducked=false;
  private enabled=true;
  private volume=.25;
  private unavailable=false;
  private previewVersion=0;
  private events:Array<{name:SoundCue;atMs:number;sample:boolean}>=[];
  async prepare() {
    if(!this.enabled)return;
    try {
      if(!this.context) {
        this.context=new AudioContext();this.master=this.context.createGain();
        const limiter=this.context.createDynamicsCompressor();limiter.threshold.value=-12;limiter.knee.value=6;limiter.ratio.value=12;limiter.attack.value=.003;limiter.release.value=.15;
        this.master.connect(limiter);limiter.connect(this.context.destination);
        // 曲は「下げる」用の段を通してから合流する。効果音は直接合流する。
        this.duck=this.context.createGain();this.music=this.context.createGain();this.sfx=this.context.createGain();
        this.music.connect(this.duck);this.duck.connect(this.master);this.sfx.connect(this.master);this.applyVolume();
        const base=typeof document==='undefined'?'/':new URL(import.meta.env.BASE_URL??'/',document.baseURI).href;
        void this.bank.load(this.context,url=>fetch(url),base);
      }
      if(this.context.state==='suspended')await this.context.resume();
    } catch {this.unavailable=true;}
  }
  setEnabled(value:boolean){this.enabled=value;this.applyVolume();if(!value)this.clearSources();}
  setVolume(value:number){this.volume=Math.max(0,Math.min(1,value));this.applyVolume();}
  private applyVolume(){if(this.context&&this.master)this.master.gain.setTargetAtTime(this.enabled?this.volume:0,this.context.currentTime,.015);}
  start(microphone:boolean) {
    this.stop();this.running=true;this.microphone=microphone;this.lastMs=-1;this.events=[];
    this.setDuck(microphone,.05);this.bgmStarted=false;this.bgmStartedAtMs=null;
  }
  stop(){this.previewVersion++;this.running=false;this.ducked=false;this.bgmStarted=false;this.fadeBgm(.35);this.clearSources();}
  async preview() {
    if(this.running||!this.enabled)return;
    this.clearSources();const version=++this.previewVersion;await this.prepare();
    if(version===this.previewVersion&&!this.running&&this.enabled&&this.context?.state==='running')this.play('complete',null);
  }
  private clearSources(){for(const source of this.sources){try{source.stop();}catch{/* 既に終了した音 */}source.disconnect();}this.sources.clear();}
  update(ms:number,recipe:Recipe|null) {
    if(!this.running)return;
    const cues=dueSounds(this.lastMs,ms,this.microphone);this.lastMs=ms;
    if(this.ducked&&ms>=RECORDING_END_MS)this.setDuck(false,.4);
    if(!this.enabled||!this.volume||this.context?.state!=='running'||!this.master)return;
    // 素材の読み込みや音の許可が開始より遅れても、そのときの進み具合の位置から曲を始める。
    if(!this.bgmStarted&&this.bank.bgm){this.startBgm(ms/1000);this.bgmStartedAtMs=ms;}
    for(const cue of cues){const sample=this.play(cue.name,recipe);this.events.push({name:cue.name,atMs:ms,sample});}
  }
  /** 曲を下げる／戻す。下げるときは速く、戻すときはゆっくり。 */
  private setDuck(on:boolean,seconds:number) {
    this.ducked=on;
    if(this.context&&this.duck)this.duck.gain.setTargetAtTime(on?Math.pow(10,-DUCK_DB/20):1,this.context.currentTime,seconds);
  }
  private startBgm(offsetSeconds:number) {
    const ctx=this.context,bus=this.music,bgm=this.bank.bgm;if(!ctx||!bus||!bgm)return;this.bgmStarted=true;
    const source=ctx.createBufferSource(),gain=ctx.createGain();
    source.buffer=bgm.buffer;source.loop=bgm.entry.loop;gain.gain.value=Math.pow(10,bgm.entry.gainDb/20);
    source.connect(gain);gain.connect(bus);
    source.onended=()=>{if(this.bgm?.source===source)this.bgm=null;source.disconnect();gain.disconnect();};
    // 少し先の時刻を指定して始め、開始のずれを避ける。
    const offset=bgm.entry.loop?offsetSeconds%bgm.buffer.duration:Math.min(offsetSeconds,bgm.buffer.duration);
    source.start(ctx.currentTime+.05,offset);this.bgm={source,gain};
  }
  private fadeBgm(seconds:number) {
    const ctx=this.context,bgm=this.bgm;if(!ctx||!bgm)return;this.bgm=null;
    const at=ctx.currentTime;bgm.gain.gain.setTargetAtTime(0,at,seconds/3);
    try{bgm.source.stop(at+seconds);}catch{/* 既に終了した曲 */}
  }
  private track(source:AudioScheduledSourceNode,nodes:AudioNode[],duration:number) {
    const ctx=this.context!;this.sources.add(source);
    source.onended=()=>{this.sources.delete(source);source.disconnect();nodes.forEach(node=>node.disconnect());};
    source.start(ctx.currentTime);source.stop(ctx.currentTime+duration+.03);
  }
  private sample(buffer:AudioBuffer,level:number,rate=1) {
    const ctx=this.context!,source=ctx.createBufferSource(),gain=ctx.createGain();
    source.buffer=buffer;source.playbackRate.value=rate;gain.gain.value=level;
    source.connect(gain);gain.connect(this.sfx!);this.track(source,[gain],buffer.duration/rate);
  }
  private tone(frequency:number,end:number,duration:number,level:number,type:OscillatorType='sine') {
    const ctx=this.context!,osc=ctx.createOscillator(),gain=ctx.createGain(),at=ctx.currentTime;
    osc.type=type;osc.frequency.setValueAtTime(frequency,at);osc.frequency.exponentialRampToValueAtTime(Math.max(20,end),at+duration);
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(level,at+.012);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    osc.connect(gain);gain.connect(this.sfx!);this.track(osc,[gain],duration);
  }
  private noise(duration:number,level:number,startFrequency:number,endFrequency:number) {
    const ctx=this.context!,buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*duration),ctx.sampleRate),data=buffer.getChannelData(0);
    // 同じ演出は同じ音になるよう、乱数の開始値を固定する。
    let seed=12345;for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)|0;data[i]=(seed/2147483648)*.65;}
    const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain(),at=ctx.currentTime;
    source.buffer=buffer;filter.type='bandpass';filter.Q.value=.65;filter.frequency.setValueAtTime(startFrequency,at);filter.frequency.exponentialRampToValueAtTime(endFrequency,at+duration);
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(level,at+.008);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    source.connect(filter);filter.connect(gain);gain.connect(this.sfx!);this.track(source,[filter,gain],duration);
  }
  /** 素材があれば鳴らし、続けて合成音を重ねる。素材側で合成を止める指定なら合成しない。戻り値は素材を使ったか。 */
  private play(cue:SoundCue,recipe:Recipe|null):boolean {
    const element=recipe?.element??'neutral',pitch=element==='fire'?.7:element==='dark'?.55:element==='ice'?1.35:1;
    const picked=this.bank.pick(cue,element);
    if(picked){this.sample(picked.buffer,picked.gain,cue==='impact'||cue==='release'?Math.sqrt(pitch):1);if(!picked.synth)return true;}
    this.synth(cue,element,pitch);
    return !!picked;
  }
  private synth(cue:SoundCue,element:string,pitch:number) {
    if(cue==='trace'||cue==='chant') {this.tone(cue==='trace'?260:390,520,.65,.035);return;}
    if(cue==='build') {this.tone(100,340,1.9,.12);this.tone(150,510,1.65,.045);this.noise(1.5,.065,400,1900);return;}
    if(cue==='complete') {for(const ratio of [1,1.5,2])this.tone(440*ratio,440*ratio,.8,.045);return;}
    if(cue==='release') {
      this.tone(220*pitch,60*pitch,.55,.2,'triangle');this.noise(.8,.36,800,2600);
      this.tone(880*pitch,300*pitch,.6,.06);return;
    }
    if(cue==='impact') {
      this.tone(110,40,.65,.45,'triangle');this.noise(.38,.65,2800,350);
      for(const frequency of [720,1103,1781])this.tone(frequency*pitch,frequency*pitch*.85,.5,.07);
      if(element==='lightning')this.noise(.2,.25,6500,1500);
      if(element==='ice')this.tone(2200,1600,.7,.06);
      return;
    }
    this.tone(392,392,1,.035);this.tone(588,588,1.2,.025);
  }
  get snapshot() {
    return {
      enabled:this.enabled,volume:this.volume,state:this.unavailable?'unavailable':this.context?.state??'not-started',
      activeSources:this.sources.size,recordingQuiet:this.microphone,ducked:this.ducked,bgm:this.bgm?'playing':'none',bgmStartedAtMs:this.bgmStartedAtMs,
      samples:this.bank.report,credits:this.bank.manifest.credits,events:[...this.events],
    };
  }
  dispose(){this.stop();void this.context?.close();this.context=null;this.master=null;this.music=null;this.sfx=null;this.duck=null;}
}
