class VoiceCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.active=false;this.samples=[];this.pre=[];this.index=0;this.phase=0;this.sum=0;this.count=0;this.tail=0;this.offset=0;this.windowMs=Infinity;
    this.port.onmessage=({data})=>{
      // windowMs はその回の受付の長さ。画面側（src/input/voice.ts）が rounds.ts の表から渡す。
      // 届かなかったときは自分では打ち切らず、stop の指示だけで止める。
      if(data.type==='start'){this.active=true;this.samples=[];this.pre=[];this.index=0;this.phase=0;this.sum=0;this.count=0;this.tail=0;this.offset=data.offset??0;this.windowMs=data.windowMs>0?data.windowMs:Infinity;}
      if(data.type==='stop'){this.active=false;this.flush();this.port.postMessage({type:'stopped'});}
    };
  }
  flush() {
    if(!this.samples.length)return;
    const values=this.samples;this.samples=[];
    const startMs=this.offset+this.index/16;this.index+=values.length;
    const pcm=new Int16Array(values.length);
    let energy=0;
    values.forEach((v,i)=>{pcm[i]=Math.round(Math.max(-1,Math.min(1,v))*32767);energy+=v*v;});
    const rms=Math.sqrt(energy/values.length);
    this.port.postMessage({type:'level',value:rms});
    const part={pcm,startMs};
    if(rms>0.009){this.tail=3;for(const saved of this.pre)this.send(saved);this.pre=[];this.send(part);}
    else if(this.tail>0){this.tail--;this.send(part);}
    else {this.pre.push(part);if(this.pre.length>3)this.pre.shift();}
  }
  send(part) {this.port.postMessage({type:'audio',...part},[part.pcm.buffer]);}
  process(inputs) {
    const input=inputs[0]?.[0];
    if(!input||!this.active)return true;
    // 実際の入力周波数から16kHzへ変換。端末の設定値を決めつけません。
    for(const value of input) {
      this.sum+=value;this.count++;this.phase+=16000;
      if(this.phase>=sampleRate){
        this.phase-=sampleRate;
        if(this.offset+(this.index+this.samples.length)/16>=this.windowMs){this.active=false;this.flush();break;}
        this.samples.push(this.sum/this.count);this.sum=0;this.count=0;
        if(this.samples.length>=1600)this.flush();
      }
    }
    return true;
  }
}
registerProcessor('voice-capture',VoiceCapture);
