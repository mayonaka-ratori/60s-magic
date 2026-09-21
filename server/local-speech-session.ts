import type { WebSocket } from 'ws';
import type { LocalSpeechResult, LocalSpeechStatus } from './local-speech';
import { SPEECH_WAIT_MS } from '../src/game/rounds';
export type LocalRecognizer = {
  getStatus:()=>LocalSpeechStatus;
  reserve:(owner:object)=>boolean;
  release:(owner:object)=>void;
  recognize:(pcm:Buffer)=>Promise<LocalSpeechResult>;
};

type RequestRecord = {requestedAtAudioMs:number;startMs:number;endMs:number;audioMs:number;final:boolean;roundTripMs?:number;processingMs?:number;text?:string;stability?:number;outcome:'sent'|'deadline'|'closed'|'error'|'pending'};
type SessionRecord = {sessionId:string;startedAt:string;requests:RequestRecord[];audioChunks:number;droppedChunks:number;lastAudioMs:number|null;endedAtAudioMs:number|null;waitMs:number|null;finalDelivered:boolean;closeReason:string|null};
const recentSessions:SessionRecord[]=[];
/** 確認用の記録。直近の受付の要求と結果の時刻。音声は含まない。 */
export function speechSessionDiagnostics(){return recentSessions.map(s=>({...s,requests:[...s.requests]}));}

/** 14秒分を上限に最新の音を保持。古い認識要求を積み上げない。 */
export function connectLocalSpeech(ws:WebSocket,recognizer:LocalRecognizer) {
  const owner={};
  /** その回の受付の長さ（ms）。画面側が知らせる。届かなければ一回目の14秒として扱う。 */
  let windowMs=14000;
  const record:SessionRecord={sessionId:'',startedAt:new Date().toISOString(),requests:[],audioChunks:0,droppedChunks:0,lastAudioMs:null,endedAtAudioMs:null,waitMs:null,finalDelivered:false,closeReason:null};
  recentSessions.push(record);if(recentSessions.length>5)recentSessions.shift();
  const closeWith=(reason:string)=>{if(record.closeReason===null)record.closeReason=reason;};
  const pcm=Buffer.alloc(224000*2);
  let sessionId='',started=false,closed=false,ended=false,busy=false;
  let firstSample:number|null=null,lastSample=0,version=0,processedVersion=-1,revision=0;
  let lastText='',sameTextCount=0,lastRequestAt=0,deadline=Infinity,endedSent=false,lastProcessingMs=0;
  const send=(data:Record<string,unknown>)=>{if(!closed&&ws.readyState===ws.OPEN)ws.send(JSON.stringify({...data,sessionId}));};
  // 最後の結果を送り終えた合図。二回送らない。
  const finish=()=>{if(endedSent||closed)return;endedSent=true;send({type:'ended'});};
  const stop=()=>{if(closed)return;closed=true;closeWith('接続を閉じた');clearInterval(ticker);clearTimeout(lifetime);recognizer.release(owner);pcm.fill(0);};
  const ticker=setInterval(()=>void pump(),100);
  // 画面側が閉じ忘れたときの受け皿。一回目は3秒の合図の前につなぐので、閉じるまで最長18.4秒かかる。
  const lifetime=setTimeout(()=>{closeWith('30秒の上限');finish();ws.close(1000);stop();},30000);
  ws.on('close',stop);ws.on('error',stop);
  async function pump(force=false) {
    if(closed||!started||busy||firstSample===null||version===processedVersion)return;
    const now=performance.now();
    if(now>=deadline){if(ended)finish();return;}
    if(!force&&!ended&&(now-lastRequestAt<650||lastSample-firstSample<6400))return;
    // 終了の直前に途中の認識を始めず、最後の音を含む要求を優先する。
    // 境目は、画面側が最後の声を待つ長さ（SPEECH_WAIT_MS）と同じにする。
    // 一回目（18秒）なら16秒、防御（15秒）なら13秒。回の長さに合わせる。
    if(!ended&&lastSample>=Math.max(0,windowMs-SPEECH_WAIT_MS)*16)return;
    // 締め切りに間に合わない認識は始めない。結果を捨てるだけで、直前の結果を送るのも遅れる。
    if(ended&&lastProcessingMs>0&&now+lastProcessingMs>deadline){finish();return;}
    busy=true;lastRequestAt=now;
    const requestVersion=version,start=firstSample,end=lastSample,isFinal=ended;
    const audio=Buffer.from(pcm.subarray(start*2,end*2));
    const entry:RequestRecord={requestedAtAudioMs:Math.round(end/16),startMs:Math.round(start/16),endMs:Math.round(end/16),audioMs:Math.round((end-start)/16),final:isFinal,outcome:'pending'};
    if(record.requests.length<40)record.requests.push(entry);
    try {
      const result=await recognizer.recognize(audio);
      entry.roundTripMs=Math.round(performance.now()-now);entry.processingMs=result.processingMs;entry.text=result.text;
      lastProcessingMs=result.processingMs;
      if(closed||performance.now()>=deadline){entry.outcome=closed?'closed':'deadline';finish();return;}
      processedVersion=requestVersion;
      sameTextCount=result.text&&result.text===lastText?sameTextCount+1:1;
      lastText=result.text;entry.outcome='sent';entry.stability=sameTextCount>=2?0.9:0.5;
      if(isFinal&&requestVersion===version)record.finalDelivered=true;
      send({type:'transcript',entry:{id:0,revision:++revision,startMs:start/16,endMs:end/16,
        text:result.text,final:isFinal&&requestVersion===version,stability:sameTextCount>=2?0.9:0.5,
        source:'local',model:recognizer.getStatus().model,processingMs:result.processingMs}});
      if(isFinal&&requestVersion===version)finish();
    }catch(error){entry.outcome='error';closeWith(error instanceof Error?error.message:'変換に失敗');if(!closed){send({type:'unavailable',reason:error instanceof Error?error.message:'音声を文字に変換できませんでした'});stop();ws.close(1011);}}
    finally {audio.fill(0);busy=false;if(ended&&!closed&&processedVersion!==version)void pump(true);}
  }
  ws.on('message',(data,isBinary)=>{
    if(closed)return;
    if(isBinary) {
      const buffer=Buffer.from(data as Buffer);
      // 形が壊れた音だけ接続を切る。順番や長さの外れは、その分を捨てて続ける。
      if(buffer.length<10||buffer.length>4008||(buffer.length-8)%2){closeWith('音声の形が正しくない');ws.close(1008);return;}
      const time=buffer.readDoubleLE(0),start=Math.round(time*16),samples=(buffer.length-8)/2;
      const room=224000-start;
      if(!started||ended||!Number.isFinite(time)||time<0||start<lastSample||room<=0) {
        record.droppedChunks++;
        if(record.droppedChunks>200){closeWith('受け取れない音声が続いた');ws.close(1008);}
        return;
      }
      const used=Math.min(samples,room);
      if(firstSample===null)firstSample=start;
      buffer.copy(pcm,start*2,8,8+used*2);lastSample=start+used;version++;record.audioChunks++;record.lastAudioMs=Math.round(lastSample/16);return;
    }
    let message;try{message=JSON.parse(data.toString());}catch{ws.close(1008);return;}
    if(message.type==='start'&&!started) {
      if(typeof message.sessionId!=='string'||! /^[\w-]{1,80}$/.test(message.sessionId)){ws.close(1008);return;}
      sessionId=message.sessionId;record.sessionId=sessionId;
      const asked=Number(message.windowMs);
      if(Number.isFinite(asked)&&asked>=1000&&asked<=60000)windowMs=asked;
      const status=recognizer.getStatus();
      if(status.state!=='ready'){send({type:'unavailable',reason:status.message});ws.close(1013);return;}
      if(!recognizer.reserve(owner)){send({type:'unavailable',reason:'別の画面で音声認識を使用しています'});ws.close(1013);return;}
      started=true;send({type:'ready',provider:'local',model:status.model});
    }else if(message.type==='end'&&started&&!ended){
      // 待てる時間は画面側が決める。届かない値は今までどおり650msとして扱う。
      const asked=Number(message.waitMs),wait=Number.isFinite(asked)?Math.min(2500,Math.max(0,asked)):650;
      ended=true;deadline=performance.now()+wait;record.endedAtAudioMs=Math.round(lastSample/16);record.waitMs=wait;
      // 音が増えていなくても、最後の要求は確定結果として返す。
      version++;
      if(firstSample===null)finish();else void pump(true);
    }else{closeWith('想定しない指示');ws.close(1008);}
  });
}
