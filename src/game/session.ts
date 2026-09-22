import { MotionRecorder, summarizeMotion } from './motion';
import { SpeechBook } from './speech-book';
import { affirmativeText, explicitCount, makeRecipe } from './recipe';
import { AIM, DEFAULT_ASPECT, guardStyleOf, shieldOf, type GuardPlan } from './guard';
import type { JevReply, Phase, Recipe, SpellState } from './types';
import { readChant, type ChantCorrection } from './chant-dictionary';
import { ROUNDS, SPEECH_WAIT_MS, phaseAt, replyLimitOf, speechLimitOf, type Round } from './rounds';

export { phaseAt, SPEECH_WAIT_MS };
// 確定の時刻は仕様の決まりなので動かさない。その手前をどう割るかだけを決める。
// ここにあるのは一回目の値で、回ごとの値は rounds.ts の表から取る。
/** 声を待つのをやめ、Jevへ送る時刻。声が先に届けばもっと早く送る。 */
export const SPEECH_LIMIT_MS = speechLimitOf(ROUNDS[0]);
/** Jevの返事を受け取れる最後の時刻。確定の手前で必ず打ち切る。 */
export const REPLY_LIMIT_MS = replyLimitOf(ROUNDS[0]);
/** 魔法を確定する時刻。 */
export const LOCK_MS = ROUNDS[0].lock;

/** 前の回から引き継ぐ知らせ。Jevへ「前の魔法を発展させたか」を尋ねるときに使う。 */
export type PreviousSpell = NonNullable<SpellState['previous']>;

/**
 * 一回分の魔法。描画と詠唱を受け付け、締め切って、確定する。
 * 時刻はすべて戦いの開始からのms。回ごとの境目は rounds.ts の表が持つ。
 */
export class CastSession {
  readonly id:string;
  readonly round:Round;
  readonly motion:MotionRecorder;
  readonly speech:SpeechBook;
  readonly events:Array<{name:string; atMs:number; observedMs:number}>=[];
  readonly startMs:number;
  state:SpellState|null=null;
  recipe:Recipe|null=null;
  reply:JevReply|undefined;
  phase:Phase;
  elapsed=0;
  frozen=false;
  locked=false;
  cancelled=false;
  /** 防御の回だけ作る、盾の形と止め方。 */
  guard:GuardPlan|null=null;
  /** 画面の横と縦の比。盾の判定を、実際に見えている輪と同じ形にするために画面側が入れる。 */
  aspect=DEFAULT_ASPECT;
  /** 前の回の魔法。防御の回にだけ入る。 */
  previous:PreviousSpell|null=null;
  /** 辞書の読みへ寄せた言葉。元の聞き取りは state.speech.rawTranscript に残る。 */
  corrections:ChantCorrection[]=[];
  constructor(private clock:()=>number=()=>performance.now(), id:string=crypto.randomUUID(), round:Round=ROUNDS[0], startMs?:number) {
    this.round=round;this.id=id;this.startMs=startMs??clock();
    this.motion=new MotionRecorder(round.start,round.inputEnd);
    this.speech=new SpeechBook(round.inputEnd-round.start);
    this.phase=phaseAt(0,round);
  }
  /** 声の時刻は回ごとに0から数え直す。戦いの時刻へ直すときはこれを足す。 */
  get speechOffset() {return this.round.start;}
  tick() {
    if(this.cancelled)return;
    this.elapsed=Math.max(0,this.clock()-this.startMs);
    const next=phaseAt(this.elapsed,this.round);
    const marks:Partial<Record<Phase,number>>={complete:this.round.inputEnd,release:this.round.release,handoff:this.round.handoff,finished:this.round.end};
    if(next!==this.phase) {this.phase=next;this.events.push({name:next,atMs:marks[next]??this.elapsed,observedMs:this.elapsed});}
    // 防御の回は、締め切りちょうどに盾の形を決める。囲えなかった線を印の前へ運ぶ動きが
    // 締め切りから1秒で終わるので、声の確定を待つ freeze() では間に合わない。
    // 形は締め切り後に動かないが、層の数と止め方は言葉が要るので freeze() で入れ直す。
    if(this.round.id==='defend'&&!this.guard&&this.elapsed>=this.round.inputEnd)
      this.guard={shield:shieldOf(this.motion.raw,null,AIM,this.aspect),style:'block'};
    if(this.elapsed>=this.round.lock&&!this.locked)this.lock();
  }
  get accepting() {
    const elapsed=this.clock()-this.startMs;
    return !this.cancelled&&elapsed>=this.round.start&&elapsed<this.round.inputEnd;
  }
  freeze() {
    if(this.state)return this.state;
    const round=this.round;
    const entries=this.speech.freeze();
    const text=entries.map(e=>e.text).join('、');
    const chant=readChant(text);
    this.corrections=chant.corrections;
    const motion=summarizeMotion(this.motion.raw);
    const defend=round.id==='defend',final=round.id==='finish';
    this.state={schemaVersion:'spell-state-2',sessionId:this.id,castId:round.castId,inputRevision:1,phase:defend?'defend':final?'final':'free',
      currentTask:round.id==='defend'
        ?'自分の線と言葉から守る魔法を作り、狙いの印へ来る騎士の一撃を切り抜ける'
        :round.id==='finish'
        ?'自分の線と言葉からとどめの魔法を作り、崩れかけた騎士の胸の核へ届かせる'
        :'自分の線と言葉から最初の魔法を作り、目の前の騎士へ作用させる',
      inputWindow:{startSessionMs:round.start,endSessionMs:round.inputEnd,chantPromptSessionMs:round.chant,motionAndSpeechConcurrent:true},motion,
      timedEvents:[...this.motionEvents(),...entries.map(e=>({startMs:e.startMs+round.start,endMs:e.endMs+round.start,speech:e.text,speechTiming:e.source==='typed'?'typed' as const:'utterance' as const}))].sort((a,b)=>a.startMs-b.startMs),
      speech:{status:entries.length?(entries.some(e=>e.source!=='typed')?'recognized':'typed'):'unavailable',provider:entries[0]?.source??null,locale:'ja-JP',rawTranscript:text,normalizedTranscript:chant.normalized,explicitCount:explicitCount(affirmativeText(chant.meaning)),explicitNegation:/ない|なく|するな/.test(text)},previous:this.previous,
      enemy:{attackKind:defend?'slash':'none',encounterMode:'exhibition_success'}};
    // 盾の形は締め切りの時点で決めてある（tick）。ここでは、言葉が要る層の数と止め方だけを入れ直す。
    // 点はもう増えないので、同じ形が出る。
    if(defend)this.guard={shield:shieldOf(this.motion.raw,this.state.speech.explicitCount,AIM,this.aspect),
      style:guardStyleOf(chant.meaning,text)};
    this.frozen=true;return this.state;
  }
  private motionEvents() {
    const result:Array<{startMs:number;endMs:number;motion:string}>=[];
    for(let start=this.round.start;start<this.round.inputEnd;start+=1000) {
      const p=this.motion.raw.filter(p=>p.t>=start&&p.t<start+1000);
      if(p.length)result.push({startMs:start,endMs:Math.min(this.round.inputEnd,start+1000),motion:summarizeMotion(p).descriptions.outline});
    }
    return result;
  }
  receive(reply:JevReply) {
    if(this.cancelled||this.locked||this.clock()-this.startMs>=replyLimitOf(this.round)||reply.sessionId!==this.id||reply.castId!==this.round.castId||reply.inputRevision!==1)return false;
    this.reply=reply;return true;
  }
  lock() {
    if(this.locked||this.cancelled)return;
    const state=this.freeze();
    this.recipe=makeRecipe(state,this.reply);this.locked=true;
    this.events.push({name:'recipe-locked',atMs:this.round.lock,observedMs:this.clock()-this.startMs});
  }
  cancel() {this.cancelled=true;this.phase='cancelled';this.speech.freeze();}
  /** 次の回へ渡す知らせ。 */
  get summary():PreviousSpell|null {
    return this.recipe?{spellId:`${this.id}-${this.round.castId}`,element:this.recipe.element,purpose:this.recipe.purpose,form:this.recipe.form,name:this.recipe.name}:null;
  }
  report() {
    return {round:this.round.id,castId:this.round.castId,state:this.state,recipe:this.recipe,jev:this.reply??null,
      guard:this.guard?{style:this.guard.style,kind:this.guard.shield.kind,layers:this.guard.shield.layers,enclosed:this.guard.shield.enclosed,rings:this.guard.shield.rings,moved:this.guard.shield.moved}:null,
      speechEntries:this.speech.snapshot(),usedFallback:this.speech.usedFallback,corrections:this.corrections,events:this.events,
      rawPoints:this.motion.raw,displayPoints:this.motion.display};
  }
}
