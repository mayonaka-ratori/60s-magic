import type { SpeechEntry } from './types';

export class SpeechBook {
  /** 受け付ける長さ（ms）。声は回ごとに0から数え直す（一回目は18秒、防御は15秒）。 */
  constructor(private windowMs=14000) {}
  private entries=new Map<number,SpeechEntry>();
  private locked=false;
  private latestEntry:SpeechEntry|null=null;
  /** 確定が届かず、PC内の認識の途中結果をそのまま採用したか。 */
  usedFallback=false;
  add(entry: SpeechEntry) {
    if(this.locked || !Number.isFinite(entry.startMs) || !Number.isFinite(entry.endMs) || entry.startMs<0 || entry.startMs>=this.windowMs || entry.endMs<entry.startMs || entry.endMs>this.windowMs || entry.text.length>1500)return;
    const prior=this.entries.get(entry.id);
    if(prior && (prior.revision>=entry.revision || (prior.final&&!entry.final)))return;
    this.entries.set(entry.id,{...entry});this.latestEntry=this.entries.get(entry.id)??null;
  }
  /** 画面に出すための、いちばん新しい文字。安定していなくても返す。 */
  latest() {return this.latestEntry;}
  /** 途中の認識結果も含めた、いま聞こえている全部。確定前の即時反応だけに使う。 */
  live() { return [...this.entries.values()].filter(e=>e.text.trim()).sort((a,b)=>a.startMs-b.startMs); }
  snapshot() { return [...this.entries.values()].filter(e=>e.text.trim()&&(e.final||e.stability>=0.8)).sort((a,b)=>a.startMs-b.startMs); }
  freeze() {
    if(!this.locked) {
      this.locked=true;
      // PC内の認識は毎回それまでの音を全部聞き直すので、途中結果でも一続きの文になっている。
      // CPUで遅く、確定が20秒に間に合わなかったときは、最後の途中結果を採用する。
      if(!this.snapshot().length) {
        const candidate=[...this.entries.values()].filter(e=>e.source==='local'&&e.text.trim()&&!e.final).sort((a,b)=>b.revision-a.revision)[0];
        if(candidate){this.entries.set(candidate.id,{...candidate,stability:Math.max(candidate.stability,0.8)});this.usedFallback=true;}
      }
    }
    return this.snapshot();
  }
}
