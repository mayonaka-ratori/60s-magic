import type { SpeechEntry } from '../game/types';
export class VoiceInput {
  private context:AudioContext|null=null;
  private stream:MediaStream|null=null;
  private node:AudioWorkletNode|null=null;
  private ws:WebSocket|null=null;
  private runId='';
  private waitMs=650;
  level=0;
  /** 最後の結果が届いた、または届かないと決まった。画面側はこれを見て次へ進む。 */
  settled=false;
  /** hooks は確認用の記録。音の送信と接続の出来事を時刻つきで残す。 */
  constructor(private onEntry:(entry:SpeechEntry)=>void,private onStatus:(message:string)=>void,private hooks:{audio?:(bytes:number,startMs:number)=>void;event?:(kind:string,detail?:Record<string,unknown>)=>void}={}) {}
  private note(kind:string,detail?:Record<string,unknown>){this.hooks.event?.(kind,detail);}
  async prepare() {
    try {
      this.stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
      this.context=new AudioContext();await this.context.resume();
      await this.context.audioWorklet.addModule('/audio-worklet.js');
      const source=this.context.createMediaStreamSource(this.stream);
      this.node=new AudioWorkletNode(this.context,'voice-capture');
      const mute=this.context.createGain();mute.gain.value=0;
      source.connect(this.node);this.node.connect(mute);mute.connect(this.context.destination);
      this.node.port.onmessage=({data})=>{
        if(data.type==='level')this.level=Math.min(1,data.value*12);
        if(data.type==='audio'&&this.ws?.readyState===WebSocket.OPEN) {
          const payload=new ArrayBuffer(data.pcm.byteLength+8);
          new DataView(payload).setFloat64(0,data.startMs,true);
          new Int16Array(payload,8).set(data.pcm);
          this.ws.send(payload);this.hooks.audio?.(payload.byteLength,data.startMs);
        }
        if(data.type==='stopped'){this.note('録音を終えた');
          if(this.ws?.readyState===WebSocket.OPEN)this.ws.send(JSON.stringify({type:'end',waitMs:this.waitMs}));else this.settled=true;}
      };
    } catch(error) {this.dispose();throw error;}
  }
  /** windowMs はその回の受付の長さ。サーバーが、終わりの直前に無駄な認識を始めないために使う。 */
  async connect(sessionId:string,windowMs=14000) {
    this.runId=sessionId;this.settled=false;
    const ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/api/speech`);this.ws=ws;
    await new Promise<void>((resolve,reject)=>{
      let ready=false;
      const timer=setTimeout(()=>{ws.close();reject(new Error('音声認識に接続できませんでした'));},5000);
      ws.onopen=()=>{this.note('音声認識へ接続');ws.send(JSON.stringify({type:'start',sessionId,windowMs}));};
      ws.onerror=()=>{clearTimeout(timer);this.note('音声認識の接続に失敗');reject(new Error('音声認識に接続できませんでした'));};
      ws.onmessage=({data})=>{
        let message;try{message=JSON.parse(data);}catch{return;}
        if(message.sessionId!==this.runId)return;
        if(message.type==='ready'){clearTimeout(timer);ready=true;this.note('音声認識の準備ができた',{provider:message.provider,model:message.model});resolve();}
        if(message.type==='transcript')this.onEntry(message.entry);
        if(message.type==='ended'){this.settled=true;this.note('音声認識が最後の結果を送り終えた');}
        if(message.type==='unavailable'){clearTimeout(timer);this.settled=true;this.note('音声認識を使えない',{reason:message.reason});this.onStatus(message.reason);reject(new Error(message.reason));}
      };
      ws.onclose=event=>{clearTimeout(timer);if(this.runId!==sessionId)return;this.settled=true;this.note('音声認識との接続が閉じた',{code:event.code});if(!ready)reject(new Error('音声認識との接続が切れました'));else this.onStatus('音声認識との接続が切れました。描いた線で続けます。');};
    });
  }
  start(offset=0){this.note('録音を始めた',{offsetMs:Math.round(offset),sampleRate:this.context?.sampleRate??null});this.node?.port.postMessage({type:'start',offset});}
  /** waitMs は、最後の文字を待てる時間。サーバーはこの時間で認識を打ち切る。 */
  stop(waitMs=650){this.waitMs=Math.max(0,Math.round(waitMs));this.note('録音の停止を指示',{waitMs:this.waitMs});this.node?.port.postMessage({type:'stop'});this.level=0;}
  disconnect(){this.ws?.close();this.ws=null;this.runId='';}
  dispose(){this.stop();this.disconnect();this.node?.disconnect();this.node=null;this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;void this.context?.close();this.context=null;}
}
