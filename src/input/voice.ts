import type { SpeechEntry } from '../game/types';
export class VoiceInput {
  private context:AudioContext|null=null;
  private stream:MediaStream|null=null;
  private node:AudioWorkletNode|null=null;
  private ws:WebSocket|null=null;
  private runId='';
  level=0;
  constructor(private onEntry:(entry:SpeechEntry)=>void,private onStatus:(message:string)=>void) {}
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
          this.ws.send(payload);
        }
        if(data.type==='stopped'&&this.ws?.readyState===WebSocket.OPEN)this.ws.send(JSON.stringify({type:'end'}));
      };
    } catch(error) {this.dispose();throw error;}
  }
  async connect(sessionId:string) {
    this.runId=sessionId;
    const ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/api/speech`);this.ws=ws;
    await new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>{ws.close();reject(new Error('音声認識に接続できませんでした'));},5000);
      ws.onopen=()=>ws.send(JSON.stringify({type:'start',sessionId}));
      ws.onerror=()=>{clearTimeout(timer);reject(new Error('音声認識に接続できませんでした'));};
      ws.onmessage=({data})=>{
        let message;try{message=JSON.parse(data);}catch{return;}
        if(message.sessionId!==this.runId)return;
        if(message.type==='ready'){clearTimeout(timer);resolve();}
        if(message.type==='transcript')this.onEntry(message.entry);
        if(message.type==='unavailable'){clearTimeout(timer);this.onStatus(message.reason);reject(new Error(message.reason));}
      };
    });
  }
  start(offset=0){this.node?.port.postMessage({type:'start',offset});}
  stop(){this.node?.port.postMessage({type:'stop'});this.level=0;}
  disconnect(){this.ws?.close();this.ws=null;this.runId='';}
  dispose(){this.stop();this.disconnect();this.node?.disconnect();this.node=null;this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;void this.context?.close();this.context=null;}
}
