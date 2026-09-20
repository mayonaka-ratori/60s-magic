import { dueSounds, type SoundCue } from './cues';
import type { Recipe } from '../game/types';
import { intensityOf, getPreset, type EffectPreset } from '../render/effects/presets';

/** 外部の音源を使わず、短い音と雑音を重ねる。録音用の接続とは独立。 */
export class CastAudio {
  private context:AudioContext|null=null;
  private master:GainNode|null=null;
  private sources=new Set<AudioScheduledSourceNode>();
  private lastMs=-1;
  private running=false;
  private microphone=false;
  private enabled=true;
  private volume=.25;
  private unavailable=false;
  private previewVersion=0;
  private events:Array<{name:SoundCue;atMs:number}>=[];
  async prepare() {
    if(!this.enabled)return;
    try {
      if(!this.context) {
        this.context=new AudioContext();this.master=this.context.createGain();
        const limiter=this.context.createDynamicsCompressor();limiter.threshold.value=-12;limiter.knee.value=6;limiter.ratio.value=12;limiter.attack.value=.003;limiter.release.value=.15;
        this.master.connect(limiter);limiter.connect(this.context.destination);this.applyVolume();
      }
      if(this.context.state==='suspended')await this.context.resume();
    } catch {this.unavailable=true;}
  }
  setEnabled(value:boolean){this.enabled=value;this.applyVolume();if(!value)this.clearSources();}
  setVolume(value:number){this.volume=Math.max(0,Math.min(1,value));this.applyVolume();}
  private applyVolume(){if(this.context&&this.master)this.master.gain.setTargetAtTime(this.enabled?this.volume:0,this.context.currentTime,.015);}
  start(microphone:boolean){this.stop();this.running=true;this.microphone=microphone;this.lastMs=-1;this.events=[];}
  stop(){this.previewVersion++;this.running=false;this.clearSources();}
  async preview() {
    if(this.running||!this.enabled)return;
    this.clearSources();const version=++this.previewVersion;await this.prepare();
    if(version===this.previewVersion&&!this.running&&this.enabled&&this.context?.state==='running')this.play('complete',null);
  }
  private clearSources(){for(const source of this.sources){try{source.stop();}catch{/* 既に終了した音 */}source.disconnect();}this.sources.clear();}
  update(ms:number,recipe:Recipe|null,preset:EffectPreset=getPreset(null)) {
    if(!this.running)return;
    const cues=dueSounds(this.lastMs,ms,this.microphone);this.lastMs=ms;
    if(!this.enabled||!this.volume||this.context?.state!=='running'||!this.master)return;
    const intensity=intensityOf(recipe,preset);
    for(const cue of cues){this.play(cue.name,recipe,intensity);this.events.push({name:cue.name,atMs:ms});}
  }
  private track(source:AudioScheduledSourceNode,nodes:AudioNode[],duration:number) {
    const ctx=this.context!;this.sources.add(source);
    source.onended=()=>{this.sources.delete(source);source.disconnect();nodes.forEach(node=>node.disconnect());};
    source.start(ctx.currentTime);source.stop(ctx.currentTime+duration+.03);
  }
  private tone(frequency:number,end:number,duration:number,level:number,type:OscillatorType='sine') {
    const ctx=this.context!,osc=ctx.createOscillator(),gain=ctx.createGain(),at=ctx.currentTime;
    osc.type=type;osc.frequency.setValueAtTime(frequency,at);osc.frequency.exponentialRampToValueAtTime(Math.max(20,end),at+duration);
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(level,at+.012);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    osc.connect(gain);gain.connect(this.master!);this.track(osc,[gain],duration);
  }
  private noise(duration:number,level:number,startFrequency:number,endFrequency:number) {
    const ctx=this.context!,buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*duration),ctx.sampleRate),data=buffer.getChannelData(0);
    // 同じ演出は同じ音になるよう、乱数の開始値を固定する。
    let seed=12345;for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)|0;data[i]=(seed/2147483648)*.65;}
    const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain(),at=ctx.currentTime;
    source.buffer=buffer;filter.type='bandpass';filter.Q.value=.65;filter.frequency.setValueAtTime(startFrequency,at);filter.frequency.exponentialRampToValueAtTime(endFrequency,at+duration);
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(level,at+.008);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    source.connect(filter);filter.connect(gain);gain.connect(this.master!);this.track(source,[filter,gain],duration);
  }
  /** 派手さ（0〜3）で音の厚みを変える。時刻は変えない。 */
  private play(cue:SoundCue,recipe:Recipe|null,intensity=1) {
    const element=recipe?.element??'neutral',pitch=element==='fire'?.7:element==='dark'?.55:element==='ice'?1.35:1,big=Math.min(1,intensity/3);
    if(cue==='trace'||cue==='chant') {this.tone(cue==='trace'?260:390,520,.65,.035);return;}
    if(cue==='build') {this.tone(100,340,1.9,.12);this.tone(150,510,1.65,.045);this.noise(1.5,.065,400,1900);if(big>.3)this.tone(55,110,2.2,.08*big);return;}
    if(cue==='complete') {for(const ratio of [1,1.5,2])this.tone(440*ratio,440*ratio,.8,.045);return;}
    if(cue==='release') {
      this.tone(220*pitch,60*pitch,.55,.2,'triangle');this.noise(.8,.36,800,2600);
      this.tone(880*pitch,300*pitch,.6,.06);
      if(big>.3){this.noise(.5,.2*big,3000,600);this.tone(1760*pitch,440*pitch,.4,.05*big);}return;
    }
    if(cue==='impact') {
      this.tone(110,40,.65,.45,'triangle');this.noise(.38,.65,2800,350);
      if(big>.3){this.tone(48,30,.9,.35*big,'sine');this.noise(.7,.3*big,1200,120);}
      for(const frequency of [720,1103,1781])this.tone(frequency*pitch,frequency*pitch*.85,.5,.07);
      if(element==='lightning')this.noise(.2,.25,6500,1500);
      if(element==='ice')this.tone(2200,1600,.7,.06);
      return;
    }
    this.tone(392,392,1,.035);this.tone(588,588,1.2,.025);
  }
  get snapshot(){return {enabled:this.enabled,volume:this.volume,state:this.unavailable?'unavailable':this.context?.state??'not-started',activeSources:this.sources.size,recordingQuiet:this.microphone,events:[...this.events]};}
  dispose(){this.stop();void this.context?.close();this.context=null;this.master=null;}
}
