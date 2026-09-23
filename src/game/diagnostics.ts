/** 確認用の記録。声・線・通信で起きたことを時刻つきで集め、後からJSONで見返す。 */
export type DiagnosticEvent = { atMs: number; kind: string; detail?: Record<string, unknown> };
/**
 * 届いた文字一つ分。時刻はすべて本編（90秒）の開始から数える。
 * 声の時刻は回ごとに0から数えて届くので、roundStartMs（その回の開始時刻）を足してから残す。
 */
export type TranscriptArrival = { arrivedMs: number; roundStartMs: number; revision: number; startMs: number; endMs: number; text: string; final: boolean; stability: number; source: string; processingMs?: number };

function percentile(values:number[],ratio:number){if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);return Math.round(sorted[Math.max(0,Math.ceil(sorted.length*ratio)-1)]*10)/10;}
function average(values:number[]){return values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length*10)/10:null;}

export class Diagnostics {
  readonly events:DiagnosticEvent[]=[];
  readonly transcripts:TranscriptArrival[]=[];
  private pointerLatency:number[]=[];
  private frameIntervals:number[]=[];
  private pointerCount=0;
  private pendingPointerAt:number|null=null;
  private longFrames=0;
  private cameraDetect:number[]=[];
  private cameraLatency:number[]=[];
  private cameraFrames=0;
  /** 手の認識をGPUとCPUのどちらで動かしたか。 */
  cameraDelegate='';
  private audioChunks=0;
  private audioBytes=0;
  private firstAudioMs:number|null=null;
  private lastAudioMs:number|null=null;
  /** いま録っている声の回が、本編の開始から何ms目に始まったか。声の時刻をこの分だけずらして残す。 */
  private voiceRoundStartMs=0;
  constructor(private startMs:number,private clock:()=>number=()=>performance.now()) {}
  get elapsed(){return this.clock()-this.startMs;}
  /** 本編の開始時刻が決まったら、それまでの記録の時刻も合わせる。 */
  rebase(startMs:number){const delta=this.startMs-startMs;this.startMs=startMs;for(const e of this.events)e.atMs=Math.round(e.atMs+delta);}
  log(kind:string,detail?:Record<string,unknown>){if(this.events.length<800)this.events.push({atMs:Math.round(this.elapsed),kind,...(detail?{detail}:{})});}
  /** 線の入力が来た。次の描画までの時間を測る。 */
  pointer(){this.pointerCount++;if(this.pendingPointerAt===null)this.pendingPointerAt=this.clock();}
  /** 一回の描画が終わった。 */
  frame(intervalMs:number) {
    if(this.pendingPointerAt!==null){this.pointerLatency.push(this.clock()-this.pendingPointerAt);this.pendingPointerAt=null;}
    if(this.frameIntervals.length<4000)this.frameIntervals.push(intervalMs);
    if(intervalMs>50)this.longFrames++;
  }
  /** 手の認識が一コマ終わった。detectMs は認識そのもの、latencyMs は画面へ返るまで。 */
  camera(detectMs:number,latencyMs:number) {
    this.cameraFrames++;
    if(this.cameraDetect.length<4000){this.cameraDetect.push(detectMs);this.cameraLatency.push(latencyMs);}
  }
  /** 声の録音を回の頭から始めた。以後に届く声の時刻（回ごとに0から数える）は、この回の開始時刻を足して扱う。 */
  voiceRound(roundStartMs:number){this.voiceRoundStartMs=roundStartMs;}
  /** 音を一かたまり送った。startMs はその回の中での時刻。 */
  audio(bytes:number,startMs:number){const at=Math.round(this.voiceRoundStartMs+startMs);this.audioChunks++;this.audioBytes+=bytes;if(this.firstAudioMs===null)this.firstAudioMs=at;this.lastAudioMs=at;}
  /** 文字が届いた。entry の startMs と endMs はその回の中での時刻。 */
  transcript(entry:Omit<TranscriptArrival,'arrivedMs'|'roundStartMs'>) {
    if(this.transcripts.length>=300)return;
    const offset=this.voiceRoundStartMs;
    this.transcripts.push({arrivedMs:Math.round(this.elapsed),roundStartMs:offset,...entry,startMs:Math.round(offset+entry.startMs),endMs:Math.round(offset+entry.endMs)});
  }
  summary() {
    const localOrGoogle=this.transcripts.filter(t=>t.source!=='typed');
    const last=localOrGoogle.at(-1)??null;
    return {
      note:'時刻はすべて本編（90秒）の開始からのミリ秒。声は回ごとに0から数えて届くので、その回の開始時刻（roundStartMs）を足して本編の開始からに直してある。声の「arrivedMs」は文字が画面側へ届いた時刻、「endMs」はその文字が含む音の最後の時刻。差が大きいほど声が遅れて届いている。カメラの「detectMs」は手を探す処理そのものの時間。',
      drawing:{
        pointerEvents:this.pointerCount,
        pointerToFrameMs:{average:average(this.pointerLatency),p50:percentile(this.pointerLatency,0.5),p99:percentile(this.pointerLatency,0.99),max:percentile(this.pointerLatency,1)},
        frameMs:{average:average(this.frameIntervals),p99:percentile(this.frameIntervals,0.99),max:percentile(this.frameIntervals,1)},
        averageFps:this.frameIntervals.length?Math.round(1000/(this.frameIntervals.reduce((a,b)=>a+b,0)/this.frameIntervals.length)*10)/10:null,
        framesOver50Ms:this.longFrames,
      },
      camera:{
        delegate:this.cameraDelegate||null,frames:this.cameraFrames,
        detectMs:{average:average(this.cameraDetect),p99:percentile(this.cameraDetect,0.99),max:percentile(this.cameraDetect,1)},
        latencyMs:{average:average(this.cameraLatency),p99:percentile(this.cameraLatency,0.99),max:percentile(this.cameraLatency,1)},
      },
      voice:{
        audioChunksSent:this.audioChunks,audioBytesSent:this.audioBytes,firstAudioMs:this.firstAudioMs,lastAudioMs:this.lastAudioMs,
        resultsReceived:localOrGoogle.length,finalReceived:localOrGoogle.some(t=>t.final),
        lastResult:last?{arrivedMs:last.arrivedMs,coversUntilMs:last.endMs,delayMs:Math.round(last.arrivedMs-last.endMs),text:last.text,processingMs:last.processingMs??null}:null,
        processingMs:{average:average(localOrGoogle.map(t=>t.processingMs??0).filter(Boolean)),max:percentile(localOrGoogle.map(t=>t.processingMs??0).filter(Boolean),1)},
        arrivals:this.transcripts,
      },
      events:this.events,
    };
  }
}
