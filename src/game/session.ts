import { MotionRecorder, summarizeMotion } from './motion';
import { SpeechBook } from './speech-book';
import { affirmativeText, explicitCount, makeRecipe } from './recipe';
import type { JevReply, Phase, Recipe, SpellState } from './types';

export function phaseAt(ms:number):Phase {
  if(ms<0)return 'ready';if(ms<6000)return 'draw';if(ms<11000)return 'build';if(ms<14000)return 'chant';
  if(ms<17000)return 'complete';if(ms<23000)return 'release';if(ms<24000)return 'handoff';return 'finished';
}
export class CastSession {
  readonly id:string;
  readonly motion=new MotionRecorder();
  readonly speech=new SpeechBook();
  readonly events:Array<{name:string; atMs:number; observedMs:number}>=[];
  readonly startMs:number;
  state:SpellState|null=null;
  recipe:Recipe|null=null;
  reply:JevReply|undefined;
  phase:Phase='draw';
  elapsed=0;
  frozen=false;
  locked=false;
  cancelled=false;
  constructor(private clock:()=>number=()=>performance.now(), id=crypto.randomUUID()) {this.startMs=clock();this.id=id;}
  tick() {
    if(this.cancelled)return;
    this.elapsed=Math.max(0,this.clock()-this.startMs);
    const next=phaseAt(this.elapsed);
    if(next!==this.phase) {this.phase=next;this.events.push({name:next,atMs:{complete:14000,release:17000,handoff:23000,finished:24000}[next as 'complete']??this.elapsed,observedMs:this.elapsed});}
    if(this.elapsed>=16000&&!this.locked)this.lock();
  }
  get accepting() {return !this.cancelled&&this.clock()-this.startMs<14000;}
  freeze() {
    if(this.state)return this.state;
    const entries=this.speech.freeze();
    const text=entries.map(e=>e.text).join('、');
    const motion=summarizeMotion(this.motion.raw);
    this.state={schemaVersion:'spell-state-2',sessionId:this.id,castId:'cast-01',inputRevision:1,phase:'free',
      currentTask:'自分の線と言葉から最初の魔法を作り、目の前の騎士へ作用させる',
      inputWindow:{startSessionMs:0,endSessionMs:14000,chantPromptSessionMs:11000,motionAndSpeechConcurrent:true},motion,
      timedEvents:[...this.motionEvents(),...entries.map(e=>({startMs:e.startMs,endMs:e.endMs,speech:e.text,speechTiming:e.source==='typed'?'typed' as const:'utterance' as const}))].sort((a,b)=>a.startMs-b.startMs),
      speech:{status:entries.length?(entries.some(e=>e.source==='google')?'recognized':'typed'):'unavailable',locale:'ja-JP',rawTranscript:text,normalizedTranscript:text,explicitCount:explicitCount(affirmativeText(text)),explicitNegation:/ない|なく|するな/.test(text)},previous:null,
      enemy:{attackKind:'none',encounterMode:'exhibition_success'}};
    this.frozen=true;return this.state;
  }
  private motionEvents() {
    const result:Array<{startMs:number;endMs:number;motion:string}>=[];
    for(let start=0;start<14000;start+=1000) {
      const p=this.motion.raw.filter(p=>p.t>=start&&p.t<start+1000);
      if(p.length)result.push({startMs:start,endMs:Math.min(14000,start+1000),motion:summarizeMotion(p).descriptions.outline});
    }
    return result;
  }
  receive(reply:JevReply) {
    if(this.cancelled||this.locked||this.clock()-this.startMs>=15700||reply.sessionId!==this.id||reply.castId!=='cast-01'||reply.inputRevision!==1)return false;
    this.reply=reply;return true;
  }
  lock() {
    if(this.locked||this.cancelled)return;
    this.recipe=makeRecipe(this.freeze(),this.reply);this.locked=true;
    this.events.push({name:'recipe-locked',atMs:16000,observedMs:this.clock()-this.startMs});
  }
  cancel() {this.cancelled=true;this.phase='cancelled';this.speech.freeze();}
  report() {return {sessionId:this.id,scope:'first-24-seconds',state:this.state,recipe:this.recipe,jev:this.reply??null,events:this.events,rawPoints:this.motion.raw,displayPoints:this.motion.display,cancelled:this.cancelled};}
}
