import { v2 } from '@google-cloud/speech';
import type { WebSocket } from 'ws';
import { speechPhrases as phrases } from '../src/game/chant-dictionary';

export function connectSpeech(ws:WebSocket, project:string|undefined, location='us') {
  let stream:ReturnType<InstanceType<typeof v2.SpeechClient>['_streamingRecognize']>|null=null;
  let client:InstanceType<typeof v2.SpeechClient>|null=null;
  let started=false,ended=false,totalSamples=0,resultId=0,revision=0,previousEndMs=0;
  const mapping:Array<{sampleStart:number;sampleEnd:number;startMs:number}>=[];
  const utteranceStarts:number[]=[];
  let sessionId='';
  const send=(data:Record<string,unknown>)=>{if(ws.readyState===ws.OPEN)ws.send(JSON.stringify({...data,sessionId}));};
  const stop=()=>{stream?.destroy();stream=null;if(client){void client.close();client=null;}};
  const timeout=setTimeout(()=>{stop();ws.close(1000,'入力時間が終了しました');},20000);
  ws.on('close',()=>{clearTimeout(timeout);stop();});
  ws.on('error',()=>stop());
  const originalTime=(sample:number)=> {
    const part=mapping.find(m=>sample<=m.sampleEnd)??mapping.at(-1);
    return part?Math.min(14000,part.startMs+Math.max(0,sample-part.sampleStart)/16):0;
  };
  ws.on('message',(data,isBinary)=>{
    if(isBinary) {
      if(!stream||ended)return;
      const buffer=Buffer.from(data as Buffer);
      if(buffer.length<10||buffer.length>4008||(buffer.length-8)%2!==0){ws.close(1008);return;}
      const startMs=buffer.readDoubleLE(0),samples=(buffer.length-8)/2;
      if(!Number.isFinite(startMs)||startMs<0||startMs+samples/16>14001||totalSamples+samples>224000){ws.close(1008);return;}
      mapping.push({sampleStart:totalSamples,sampleEnd:totalSamples+samples,startMs});totalSamples+=samples;
      stream.write({audio:buffer.subarray(8)});return;
    }
    let message;
    try {message=JSON.parse(data.toString());}catch{ws.close(1008);return;}
    if(message.type==='start'&&!started) {
      started=true;sessionId=typeof message.sessionId==='string'?message.sessionId.slice(0,80):'';
      if(!project){send({type:'unavailable',reason:'音声認識の接続情報が未設定です'});ws.close();return;}
      client=new v2.SpeechClient({apiEndpoint:`${location}-speech.googleapis.com`});
      stream=client._streamingRecognize();
      stream.on('error',()=>{send({type:'unavailable',reason:'音声を文字に変換できませんでした'});stop();});
      stream.on('data',(response)=>{
        const activity=response.speechEventType;
        if(activity===2||activity==='SPEECH_ACTIVITY_BEGIN'){
          const offset=response.speechEventOffset;
          const ms=Number(offset?.seconds??0)*1000+Number(offset?.nanos??0)/1e6;
          utteranceStarts.push(originalTime(ms*16));
        }
        for(const result of response.results??[]) {
          const text=result.alternatives?.[0]?.transcript;
          if(!text)continue;
          const offset=result.resultEndOffset;
          const audioMs=Number(offset?.seconds??0)*1000+Number(offset?.nanos??0)/1e6;
          const endMs=originalTime(audioMs*16);
          const startMs=Math.min(endMs,Math.max(previousEndMs,utteranceStarts[0]??mapping[0]?.startMs??0));
          send({type:'transcript',entry:{id:resultId,revision:++revision,startMs,endMs,text,final:!!result.isFinal,stability:result.isFinal?1:Number(result.stability??0),source:'google'}});
          if(result.isFinal){previousEndMs=endMs;while(utteranceStarts.length&&utteranceStarts[0]<endMs)utteranceStarts.shift();resultId++;revision=0;}
        }
      });
      stream.on('end',()=>send({type:'ended'}));
      stream.write({recognizer:`projects/${project}/locations/${location}/recognizers/_`,streamingConfig:{config:{
        explicitDecodingConfig:{encoding:'LINEAR16',sampleRateHertz:16000,audioChannelCount:1},languageCodes:['ja-JP'],model:'chirp_3',
        adaptation:{phraseSets:[{inlinePhraseSet:{phrases:phrases.map(value=>({value,boost:8}))}}]},
      },streamingFeatures:{interimResults:true,enableVoiceActivityEvents:true}}});
      send({type:'ready'});
    } else if(message.type==='end'&&!ended) {ended=true;stream?.end();}
  });
}
