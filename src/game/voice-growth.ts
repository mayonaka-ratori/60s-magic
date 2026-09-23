import type { Element, Point } from './types';
import type { LiveWord } from './live-words';

/** 線を描かない回の術式と、放つ元をそろえる位置。 */
export const VOICE_ORIGIN = { x: .5, y: .66 };
export type VoiceLayer = LiveWord & { active: boolean };
export type InheritedNode = { x:number; y:number; element?:Element };
export type InheritedPoint = Point & InheritedNode;
/** 言い直しを含めても、残す部品の数を制限する。 */
export const MAX_VOICE_LAYERS=32;
/** 画面の短い辺に対する円の半径。描画と引き継ぎで同じ大きさを使う。 */
export const voiceRadius=(grow:number,layers:number)=>.075+grow*.035+Math.min(layers,6)*.007;

/** 言葉の部品を締め切りまで残す。言い直しで消えた部品は薄く残す。 */
export class VoiceGrowth {
  private layers = new Map<number, VoiceLayer>();
  private words = new Map<string, number>();
  update(words: readonly LiveWord[], ms: number, from: number | null, to: number) {
    if(from===null||ms<from||ms>=to)return;
    const present=new Set<number>();
    for(const word of words) {
      if(word.kind==='other'||word.atMs>ms)continue;
      const key=`${word.kind}:${word.text}`,id=this.words.get(key)??word.id;
      this.words.set(key,id);present.add(id);
      const old=this.layers.get(id);
      this.layers.set(id,{...word,id,atMs:old?.atMs??word.atMs,active:true});
    }
    for(const layer of this.layers.values())if(!present.has(layer.id))layer.active=false;
    while(this.layers.size>MAX_VOICE_LAYERS) {
      const oldest=[...this.layers.values()].find(layer=>!layer.active)??this.layers.values().next().value!;
      this.layers.delete(oldest.id);
    }
  }
  snapshot():VoiceLayer[] {return [...this.layers.values()].map(layer=>({...layer}));}
  /** 声だけの円から、言葉の色を三つまで次の回へ渡す。無言なら淡い青。 */
  inherited(atMs:number,aspect=16/9):InheritedPoint[] {
    const active=this.snapshot().filter(layer=>layer.active);
    const colors=[...new Set(active.filter(layer=>layer.element).map(layer=>layer.element!))].slice(0,3);
    if(!colors.length)colors.push('neutral');
    const radius=voiceRadius(1,active.length),rx=radius*Math.min(1,1/aspect),ry=radius*Math.min(1,aspect)*.7;
    return colors.map((element,i)=>({x:VOICE_ORIGIN.x+Math.cos(i/colors.length*Math.PI*2)*rx,
      y:VOICE_ORIGIN.y+Math.sin(i/colors.length*Math.PI*2)*ry,t:atMs,hand:0,stroke:0,element}));
  }
}
