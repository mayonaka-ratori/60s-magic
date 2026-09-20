import type { WebSocket } from 'ws';
import type { LocalSpeechResult, LocalSpeechStatus } from './local-speech';
export type LocalRecognizer = {
  getStatus:()=>LocalSpeechStatus;
  reserve:(owner:object)=>boolean;
  release:(owner:object)=>void;
  recognize:(pcm:Buffer)=>Promise<LocalSpeechResult>;
};

type RequestRecord = {requestedAtAudioMs:number;startMs:number;endMs:number;audioMs:number;final:boolean;roundTripMs?:number;processingMs?:number;text?:string;stability?:number;outcome:'sent'|'deadline'|'closed'|'error'|'pending'};
type SessionRecord = {sessionId:string;startedAt:string;requests:RequestRecord[];audioChunks:number;lastAudioMs:number|null;endedAtAudioMs:number|null;finalDelivered:boolean;closeReason:string|null};
const recentSessions:SessionRecord[]=[];
/** 確認用の記録。直近の受付の要求と結果の時刻。音声は含まない。 */
export function speechSessionDiagnostics(){return recentSessions.map(s=>({...s,requests:[...s.requests]}));}

/** 14秒分を上限に最新の音を保持。古い認識要求を積み上げない。 */
export function connectLocalSpeech(ws:WebSocket,recognizer:LocalRecognizer) {
  const owner={};
  const record:SessionRecord={sessionId:'',startedAt:new Date().toISOString(),requests:[],audioChunks:0,lastAudioMs:null,endedAtAudioMs:null,finalDelivered:false,closeReason:null};
  recentSessions.push(record);if(recentSessions.length>5)recentSessions.shift();
  const closeWith=(reason:string)=>{if(record.closeReason===null)record.closeReason=reason;};
  const pcm=Buffer.alloc(224000*2);
  let sessionId='',started=false,closed=false,ended=false,busy=false;
  let firstSample:number|null=null,lastSample=0,version=0,processedVersion=-1,revision=0;
  let lastText='',sameTextCount=0,lastRequestAt=0,deadline=Infinity;
  const send=(data:Record<string,unknown>)=>{if(!closed&&ws.readyState===ws.OPEN)ws.send(JSON.stringify({...data,sessionId}));};
  const stop=()=>{if(closed)return;closed=true;closeWith('接続を閉じた');clearInterval(ticker);clearTimeout(lifetime);recognizer.release(owner);pcm.fill(0);};
  const ticker=setInterval(()=>void pump(),100);
  const lifetime=setTimeout(()=>{closeWith('20秒の上限');send({type:'ended'});ws.close(1000);stop();},20000);
  ws.on('close',stop);ws.on('error',stop);
  async function pump(force=false) {
    if(closed||!started||busy||firstSample===null||version===processedVersion||performance.now()>=deadline)return;
    const now=performance.now();
    if(!force&&!ended&&(now-lastRequestAt<650||lastSample-firstSample<6400))return;
    // 終了の直前に途中の認識を始めず、最後の音を含む要求を優先する。
    if(!ended&&lastSample>=217600)return;
    busy=true;lastRequestAt=now;
    const requestVersion=version,start=firstSample,end=lastSample,isFinal=ended;
    const audio=Buffer.from(pcm.subarray(start*2,end*2));
    const entry:RequestRecord={requestedAtAudioMs:Math.round(end/16),startMs:Math.round(start/16),endMs:Math.round(end/16),audioMs:Math.round((end-start)/16),final:isFinal,outcome:'pending'};
    if(record.requests.length<40)record.requests.push(entry);
    try {
      const result=await recognizer.recognize(audio);
      entry.roundTripMs=Math.round(performance.now()-now);entry.processingMs=result.processingMs;entry.text=result.text;
      if(closed||performance.now()>=deadline){entry.outcome=closed?'closed':'deadline';return;}
      processedVersion=requestVersion;
      sameTextCount=result.text&&result.text===lastText?sameTextCount+1:1;
      lastText=result.text;entry.outcome='sent';entry.stability=sameTextCount>=2?0.9:0.5;
      if(isFinal&&requestVersion===version)record.finalDelivered=true;
      send({type:'transcript',entry:{id:0,revision:++revision,startMs:start/16,endMs:end/16,
        text:result.text,final:isFinal&&requestVersion===version,stability:sameTextCount>=2?0.9:0.5,
        source:'local',model:recognizer.getStatus().model,processingMs:result.processingMs}});
      if(isFinal&&requestVersion===version)send({type:'ended'});
    }catch(error){entry.outcome='error';closeWith(error instanceof Error?error.message:'変換に失敗');if(!closed){send({type:'unavailable',reason:error instanceof Error?error.message:'音声を文字に変換できませんでした'});stop();ws.close(1011);}}
    finally {audio.fill(0);busy=false;if(ended&&!closed&&processedVersion!==version)void pump(true);}
  }
  ws.on('message',(data,isBinary)=>{
    if(closed)return;
    if(isBinary) {
      if(!started||ended){ws.close(1008);return;}
      const buffer=Buffer.from(data as Buffer);
      if(buffer.length<10||buffer.length>4008||(buffer.length-8)%2){ws.close(1008);return;}
      const time=buffer.readDoubleLE(0),start=Math.round(time*16),samples=(buffer.length-8)/2;
      if(!Number.isFinite(time)||time<0||start<lastSample||start+samples>224000){ws.close(1008);return;}
      if(firstSample===null)firstSample=start;
      buffer.copy(pcm,start*2,8);lastSample=start+samples;version++;record.audioChunks++;record.lastAudioMs=Math.round(lastSample/16);return;
    }
    let message;try{message=JSON.parse(data.toString());}catch{ws.close(1008);return;}
    if(message.type==='start'&&!started) {
      if(typeof message.sessionId!=='string'||! /^[\w-]{1,80}$/.test(message.sessionId)){ws.close(1008);return;}
      sessionId=message.sessionId;record.sessionId=sessionId;
      const status=recognizer.getStatus();
      if(status.state!=='ready'){send({type:'unavailable',reason:status.message});ws.close(1013);return;}
      if(!recognizer.reserve(owner)){send({type:'unavailable',reason:'別の画面で音声認識を使用しています'});ws.close(1013);return;}
      started=true;send({type:'ready',provider:'local',model:status.model});
    }else if(message.type==='end'&&started&&!ended){
      ended=true;deadline=performance.now()+650;record.endedAtAudioMs=Math.round(lastSample/16);
      // 音が増えていなくても、最後の要求は確定結果として返す。
      version++;
      if(firstSample===null)send({type:'ended'});else void pump(true);
    }else{ws.close(1008);}
  });
}
