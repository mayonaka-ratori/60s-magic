import type { SpeechEntry } from './types';

export class SpeechBook {
  private entries=new Map<number,SpeechEntry>();
  private locked=false;
  add(entry: SpeechEntry) {
    if(this.locked || !Number.isFinite(entry.startMs) || !Number.isFinite(entry.endMs) || entry.startMs<0 || entry.startMs>=14000 || entry.endMs<entry.startMs || entry.endMs>14000 || entry.text.length>1500)return;
    const prior=this.entries.get(entry.id);
    if(prior && (prior.revision>=entry.revision || (prior.final&&!entry.final)))return;
    this.entries.set(entry.id,{...entry});
  }
  /** 途中の認識結果も含めた、いま聞こえている全部。確定前の即時反応だけに使う。 */
  live() { return [...this.entries.values()].filter(e=>e.text.trim()).sort((a,b)=>a.startMs-b.startMs); }
  snapshot() { return [...this.entries.values()].filter(e=>e.text.trim()&&(e.final||e.stability>=0.8)).sort((a,b)=>a.startMs-b.startMs); }
  freeze() {this.locked=true;return this.snapshot();}
  text() {return this.snapshot().map(e=>e.text).join('、');}
}
