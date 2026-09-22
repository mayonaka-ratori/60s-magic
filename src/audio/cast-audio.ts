import { dueSounds, hushAt, shouldDuck, type SoundCue } from './cues';
import { SampleBank, dbToGain } from './sample-bank';
import { ENEMY_CHARGE_FROM_MS, ROUNDS } from '../game/rounds';
import type { Recipe } from '../game/types';
import { intensityOf, getPreset, type EffectPreset } from '../render/effects/presets';

/** 詠唱中に曲と効果音を下げる量。仕様の6〜10dBの中を取る。 */
const DUCK_DB=8;
/** 使い回す雑音の長さ（秒）。いちばん長い雑音（0.8秒）より長くしておく。 */
const NOISE_SECONDS=1;

/** 合成音の厚みに使う派手さ。入力の量（たくさん描き、たくさん唱えたか）も見る。時刻は変えない。 */
export function soundIntensity(recipe:Recipe|null,preset:EffectPreset=getPreset(null),amount=0) {
  return intensityOf(recipe,preset,amount);
}

/**
 * 防御の回の溜めのうなり。騎士が溜めの姿勢に入る時刻から振り下ろしまで、低く続く。
 * 曲と同じ段（music）を通すので、録音中に曲と効果音を下げる処理がそのまま効く。効果音の段には入れない。
 */
export const HUM={
  /** 始まりと終わり（ms）。回の表から取るので、ここに秒数は書かない。 */ from:ENEMY_CHARGE_FROM_MS,to:ROUNDS[1].lock,
  /** 二つの低い正弦波（Hz）。倍音の関係にしない方が、うなりに聞こえる。 */ tones:[38,55],
  /** ゆっくりした揺らぎ。毎秒0.4回、音量を3割だけ上下させる。光に弱い人への配慮と同じ理由で速くしない。 */ wobbleHz:.4,wobbleDepth:.3,
  /** いちばん大きいとき、曲の音量の何割か。 */ ratio:.3,
  /** 曲の素材が無いときに「曲の音量」とみなすdB。音素材の入れ方で勧めている曲の値と同じ。 */ musicDbWithoutBgm:-9,
  /** 上げるときのなめらかさ（秒）と、振り下ろしで切るときの長さ（秒）。切るのは速く、ただし音が割れない程度に。 */ riseSeconds:.1,cutSeconds:.03,
};
/**
 * 溜めのうなりの大きさ（0〜1）。溜めの始まりで0から始め、振り下ろしに向けてだんだん速く上がり、振り下ろしの時刻ちょうどで0になる。
 * 二乗で上げるのは、前半を控えめにして溜めの後半で伸びるようにするため。純粋な計算なので試験から呼べる。
 */
export function enemyHumLevel(ms:number) {
  if(ms<HUM.from||ms>=HUM.to)return 0;
  const u=(ms-HUM.from)/(HUM.to-HUM.from);
  return u*u;
}
/**
 * その時刻のうなりの状態。level は大きさ（0〜1）、ducked は録音中の下げが掛かっているか。
 * 下げそのものは曲と共通の段で掛かるので、ここでは「掛かるべきか」だけを返す。
 */
export function enemyHum(ms:number,microphone:boolean) {
  return {level:enemyHumLevel(ms),ducked:microphone&&shouldDuck(ms)};
}

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
  /** 溜めのうなり。鳴っている間だけ持つ。level が音量の段、tremolo が揺らぎの段。 */
  private hum:{oscillators:OscillatorNode[];nodes:AudioNode[];level:GainNode}|null=null;
  /** うなりの大きさ（0〜1）と、いま段に指示している音量。毎コマ同じ値を指示し直さないために持つ。 */
  private humLevel=0;
  private humGain=0;
  private bgmStarted=false;
  private bgmStartedAtMs:number|null=null;
  private sources=new Set<AudioScheduledSourceNode>();
  private lastMs=-1;
  private running=false;
  private microphone=false;
  private ducked=false;
  private enabled=true;
  private volume=.25;
  /** とどめの回で音を抜く倍率（0〜1）。ふだんは1。 */
  private hush=1;
  /** 控えめモード。世界を止めないので、崩れの音ととどめの一撃の時刻が変わる。 */
  private calm=false;
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
        // 曲と効果音は、どちらも声の受付中だけ下げる。
        this.duck=this.context.createGain();this.music=this.context.createGain();this.sfx=this.context.createGain();
        this.music.connect(this.duck);this.duck.connect(this.master);this.sfx.connect(this.duck);this.applyVolume();
        const base=typeof document==='undefined'?'/':new URL(import.meta.env.BASE_URL??'/',document.baseURI).href;
        void this.bank.load(this.context,url=>fetch(url),base);
      }
      if(this.context.state==='suspended')await this.context.resume();
    } catch {this.unavailable=true;}
  }
  setEnabled(value:boolean){this.enabled=value;this.applyVolume();if(!value)this.clearSources();}
  /** 控えめモードの切り替え。音の中身は変えず、世界の時刻から直す音の時刻だけが変わる。 */
  setCalm(value:boolean){this.calm=value;}
  setVolume(value:number){this.volume=Math.max(0,Math.min(1,value));this.applyVolume();}
  /**
   * 全体の音量を今の値へ寄せる。
   * linear が真なら、その秒数で直線に動かしきる。抜いた音を戻すときに使い、
   * 発動音と一撃音の出だしが潰れないようにする。
   */
  private applyVolume(seconds=.015,linear=false) {
    const ctx=this.context,master=this.master;if(!ctx||!master)return;
    const target=this.enabled?this.volume*this.hush:0,at=ctx.currentTime;
    if(!linear){master.gain.setTargetAtTime(target,at,seconds);return;}
    master.gain.cancelScheduledValues(at);master.gain.setValueAtTime(master.gain.value,at);
    master.gain.linearRampToValueAtTime(target,at+seconds);
  }
  start(microphone:boolean) {
    this.stop();this.running=true;this.microphone=microphone;this.lastMs=-1;this.events=[];
    this.setDuck(microphone&&shouldDuck(0),.05);this.bgmStarted=false;this.bgmStartedAtMs=null;this.hush=1;this.applyVolume();
  }
  stop(){this.previewVersion++;this.running=false;this.setDuck(false,.05);this.bgmStarted=false;this.hush=1;this.applyVolume();this.fadeBgm(.35);this.clearSources();}
  /** 狙いの印を囲えた合図。時刻ではなく出来事で鳴らすので、cues の表には入れない。 */
  ring(count:number) {
    if(!this.running||!this.enabled||!this.volume||this.context?.state!=='running'||!this.master)return;
    this.play('ring',null,count);
    this.events.push({name:'ring',atMs:this.lastMs,sample:false});
  }
  async preview() {
    if(this.running||!this.enabled)return;
    this.clearSources();const version=++this.previewVersion;await this.prepare();
    if(version===this.previewVersion&&!this.running&&this.enabled&&this.context?.state==='running')this.play('complete',null);
  }
  private clearSources(){this.stopHum(0);for(const source of this.sources){try{source.stop();}catch{/* 既に終了した音 */}source.disconnect();}this.sources.clear();}
  update(ms:number,recipe:Recipe|null,preset:EffectPreset=getPreset(null),amount=0) {
    if(!this.running)return;
    const cues=dueSounds(this.lastMs,ms,this.microphone,this.calm);this.lastMs=ms;
    // 声を受け付けている間だけ曲と効果音を下げる。回ごとに下げ直す。
    const duck=this.microphone&&shouldDuck(ms);
    if(duck!==this.ducked)this.setDuck(duck,duck?.05:.4);
    // とどめの発動前の「間」と直撃の直前だけ、全体の音を抜く。抜くのは速く、戻すのは0.05秒で直線に。
    const hush=hushAt(ms,this.calm);
    if(hush!==this.hush){const down=hush<this.hush;this.hush=hush;this.applyVolume(down?.02:.05,!down);}
    // 溜めのうなりの終わりは、音を出せない状態でも見る。止め忘れて次の回まで残さない。
    this.humLevel=enemyHumLevel(ms);
    if(this.humLevel<=0&&this.hum)this.stopHum(HUM.cutSeconds);
    if(!this.enabled||!this.volume||this.context?.state!=='running'||!this.master)return;
    // 素材の読み込みや音の許可が開始より遅れても、そのときの進み具合の位置から曲を始める。
    if(!this.bgmStarted&&this.bank.bgm){this.startBgm(ms/1000);this.bgmStartedAtMs=ms;}
    if(this.humLevel>0)this.updateHum(this.humLevel);
    const intensity=soundIntensity(recipe,preset,amount);
    for(const cue of cues){const sample=this.play(cue.name,recipe,intensity);this.events.push({name:cue.name,atMs:ms,sample});}
  }
  /** 曲と効果音を下げる／戻す。下げるときは速く、戻すときはゆっくり。 */
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
  /** 曲の音量（倍率）。うなりの上限はこれの3割にする。曲の素材が無いときは勧めている値で代える。 */
  private musicGain() {
    const bgm=this.bank.bgm;
    return dbToGain(bgm?bgm.entry.gainDb:HUM.musicDbWithoutBgm);
  }
  /**
   * 溜めのうなりを始める。低い正弦波二つ → 揺らぎの段 → 音量の段 → 曲の段、の順につなぐ。
   * 効果音の段ではなく曲の段へつなぐのは、録音中の下げを曲と同じように受けるため。
   */
  private startHum() {
    const ctx=this.context,bus=this.music;if(!ctx||!bus||this.hum)return;
    const at=ctx.currentTime;
    const level=ctx.createGain();level.gain.setValueAtTime(0,at);
    // 揺らぎ：1を中心に±3割だけ動く段。低周波の発振器を「揺らぎの深さ」の段を通して音量へ足す。
    const tremolo=ctx.createGain();tremolo.gain.setValueAtTime(1,at);
    const wobble=ctx.createOscillator(),depth=ctx.createGain();
    wobble.type='sine';wobble.frequency.setValueAtTime(HUM.wobbleHz,at);depth.gain.setValueAtTime(HUM.wobbleDepth,at);
    wobble.connect(depth);depth.connect(tremolo.gain);
    const oscillators=HUM.tones.map(hz=>{
      const osc=ctx.createOscillator();osc.type='sine';osc.frequency.setValueAtTime(hz,at);osc.connect(tremolo);return osc;
    });
    tremolo.connect(level);level.connect(bus);
    oscillators.push(wobble);
    const nodes:AudioNode[]=[depth,tremolo,level];
    // 最後の発振器が止まったら、段をすべて外す。
    oscillators[0].onended=()=>{oscillators.forEach(osc=>osc.disconnect());nodes.forEach(node=>node.disconnect());};
    oscillators.forEach(osc=>osc.start(at));
    this.hum={oscillators,nodes,level};this.humGain=0;
  }
  /** うなりの音量を、その時刻の大きさへ寄せる。小さな変化のたびに指示し直さない。 */
  private updateHum(level:number) {
    if(!this.hum)this.startHum();
    const ctx=this.context,hum=this.hum;if(!ctx||!hum)return;
    const target=level*HUM.ratio*this.musicGain();
    if(Math.abs(target-this.humGain)<.001)return;
    this.humGain=target;hum.level.gain.setTargetAtTime(target,ctx.currentTime,HUM.riseSeconds);
  }
  /** うなりを止める。振り下ろしでの切り、停止、消音、中止、画面を隠す、のすべてがここを通る。 */
  private stopHum(seconds:number) {
    const ctx=this.context,hum=this.hum;if(!hum)return;this.hum=null;this.humGain=0;
    if(!ctx){hum.oscillators.forEach(osc=>osc.disconnect());hum.nodes.forEach(node=>node.disconnect());return;}
    const at=ctx.currentTime,gain=hum.level.gain;
    gain.cancelScheduledValues(at);gain.setValueAtTime(gain.value,at);gain.linearRampToValueAtTime(0,at+seconds);
    for(const osc of hum.oscillators){try{osc.stop(at+seconds+.02);}catch{/* 既に止めた発振器 */}}
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
  private noiseBuffer:AudioBuffer|null=null;
  /** 雑音の元は一度だけ作り、以後は使い回す。命中のたびに数万個の乱数を詰め直さない。 */
  private noiseSource(){
    const ctx=this.context!;
    if(this.noiseBuffer&&this.noiseBuffer.sampleRate===ctx.sampleRate)return this.noiseBuffer;
    const buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*NOISE_SECONDS),ctx.sampleRate),data=buffer.getChannelData(0);
    // 同じ演出は同じ音になるよう、乱数の開始値を固定する。
    let seed=12345;for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)|0;data[i]=(seed/2147483648)*.65;}
    this.noiseBuffer=buffer;return buffer;
  }
  /** 帯域を通した雑音。q を大きくするほど帯域が狭くなり、風切りのような音になる。 */
  private noise(duration:number,level:number,startFrequency:number,endFrequency:number,q=.65) {
    const ctx=this.context!,buffer=this.noiseSource();
    const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain(),at=ctx.currentTime;
    source.buffer=buffer;filter.type='bandpass';filter.Q.value=q;filter.frequency.setValueAtTime(startFrequency,at);filter.frequency.exponentialRampToValueAtTime(endFrequency,at+duration);
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(level,at+.008);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    source.connect(filter);filter.connect(gain);gain.connect(this.sfx!);this.track(source,[filter,gain],duration);
  }
  /** 素材があれば鳴らし、続けて合成音を重ねる。素材側で合成を止める指定なら合成しない。戻り値は素材を使ったか。 */
  private play(cue:SoundCue,recipe:Recipe|null,intensity=1):boolean {
    const element=recipe?.element??'neutral',pitch=element==='fire'?.7:element==='dark'?.55:element==='ice'?1.35:1;
    const picked=this.bank.pick(cue,element);
    if(picked){this.sample(picked.buffer,picked.gain,cue==='impact'||cue==='finish'||cue==='release'?Math.sqrt(pitch):1);if(!picked.synth)return true;}
    this.synth(cue,element,pitch,intensity);
    return !!picked;
  }
  /** 派手さ（0〜3）で合成音の厚みを変える。時刻は変えない。敵の側の音は属性や派手さで変えない。 */
  private synth(cue:SoundCue,element:string,pitch:number,intensity:number) {
    const big=Math.min(1,intensity/3);
    if(cue==='step') {
      // 足を踏み替える。低い足音（60→35Hz）と、砂利を踏む短い雑音。
      this.tone(60,35,.3,.38,'triangle');this.noise(.22,.14,1600,320,1.2);
      return;
    }
    if(cue==='clang') {
      // 盾を打ち鳴らす。倍音の関係にない二つの金属の鳴り（900Hzと1400Hz）と、打った瞬間の短い雑音。
      this.tone(900,870,.4,.09);this.tone(1400,1360,.4,.06);this.noise(.07,.18,3600,1400);
      return;
    }
    if(cue==='swing') {
      // 剣を振り下ろす風切り。帯域を絞った雑音を高い方から下げる。
      this.noise(.4,.6,2400,260,4);
      return;
    }
    if(cue==='slam') {
      // 剣が床を打つ。重い低い衝撃（70→24Hz）、石が割れる雑音、1秒の低い残り。
      this.tone(70,24,1,.55,'triangle');this.noise(.12,.4,4200,900);this.noise(.5,.5,1300,90);this.tone(40,22,1,.32);
      return;
    }
    if(cue==='trace'||cue==='chant') {this.tone(cue==='trace'?260:390,520,.65,.035);return;}
    if(cue==='build') {this.tone(100,340,1.9,.12);this.tone(150,510,1.65,.045);this.noise(1.5,.065,400,1900);if(big>.3)this.tone(55,110,2.2,.08*big);return;}
    if(cue==='complete') {for(const ratio of [1,1.5,2])this.tone(440*ratio,440*ratio,.8,.045);return;}
    if(cue==='ring') {
      // 囲えた合図。囲った数だけ音の高さが上がる。intensity に囲った数を入れて呼ぶ。
      const step=Math.min(4,Math.max(0,Math.round(intensity)-1));
      this.tone(660*Math.pow(1.19,step),660*Math.pow(1.19,step),.34,.07,'triangle');
      this.tone(990*Math.pow(1.19,step),990*Math.pow(1.19,step),.22,.03);return;
    }
    if(cue==='block') {
      // 受け止めた音。低い衝撃、金属の鳴り、砕けた破片の三層。
      this.tone(96,44,.6,.42,'triangle');this.noise(.3,.55,2400,420);
      for(const frequency of [520,806,1290])this.tone(frequency*pitch,frequency*pitch*.9,.45,.06);
      if(big>.3){this.tone(52,34,.8,.3*big);this.noise(.55,.24*big,900,160);}
      return;
    }
    if(cue==='release') {
      this.tone(220*pitch,60*pitch,.55,.2,'triangle');this.noise(.8,.36,800,2600);
      this.tone(880*pitch,300*pitch,.6,.06);
      if(big>.3){this.noise(.5,.2*big,3000,600);this.tone(1760*pitch,440*pitch,.4,.05*big);}return;
    }
    if(cue==='finish') {
      // とどめの一撃。低く重い。長く沈む低音、遅れて広がる胴鳴り、金属のきしみの三層。
      this.tone(72,24,1.3,.5,'triangle');this.noise(.7,.72,1500,110);
      this.tone(38,20,1.8,.4);
      for(const frequency of [300,455,690])this.tone(frequency*pitch,frequency*pitch*.6,.95,.06);
      if(big>.3){this.noise(1.2,.34*big,600,70);this.tone(96,28,1.4,.26*big,'triangle');}
      return;
    }
    if(cue==='collapse-sword') {
      // 剣が床に落ちる。金属の鳴りのあと、跳ねた小さな音が続く。
      this.tone(1180*pitch,540*pitch,.5,.1,'triangle');this.tone(1870*pitch,900*pitch,.35,.05);
      this.noise(.22,.2,3200,900);this.tone(880*pitch,420*pitch,.2,.04,'triangle');
      return;
    }
    if(cue==='collapse-knee') {
      // 膝をつく。鈍く短い。
      this.tone(120,52,.4,.3,'triangle');this.noise(.26,.22,500,120);
      return;
    }
    if(cue==='collapse-fall') {
      // 倒れる。低く長い響きと、床の塵の音。
      this.tone(64,22,1.4,.45,'triangle');this.tone(44,18,1.8,.3);
      this.noise(1,.4,420,80);
      return;
    }
    if(cue==='book') {
      // 魔導書の静かな一音。長く伸びて消える。
      this.tone(523,523,2.2,.05);this.tone(784,784,1.8,.03);
      return;
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
  get snapshot() {
    return {
      enabled:this.enabled,volume:this.volume,state:this.unavailable?'unavailable':this.context?.state??'not-started',
      activeSources:this.sources.size,recordingQuiet:false,microphone:this.microphone,ducked:this.ducked,bgm:this.bgm?'playing':'none',bgmStartedAtMs:this.bgmStartedAtMs,
      enemyHum:{playing:this.hum!==null,level:this.humLevel,gain:this.humGain},
      samples:this.bank.report,credits:this.bank.manifest.credits,events:[...this.events],
    };
  }
  dispose(){this.stop();void this.context?.close();this.context=null;this.noiseBuffer=null;this.master=null;this.music=null;this.sfx=null;this.duck=null;}
}
