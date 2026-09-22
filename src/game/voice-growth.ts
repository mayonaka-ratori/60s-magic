import type { Element } from './types';
import type { LiveWord } from './live-words';

/** 線を描かない回の術式と、放つ元をそろえる位置。 */
export const VOICE_ORIGIN = { x: .5, y: .66 };
export type ColorLayer = { id: number; element: Element; active: boolean };

/** 属性の部品を締め切りまで残す。言い直しで消えた部品は薄く残す。 */
export class VoiceGrowth {
  private layers = new Map<number, ColorLayer>();
  private words = new Map<string, number>();
  update(words: readonly LiveWord[], ms: number, from: number | null, to: number) {
    if(from===null||ms<from||ms>=to)return;
    const present=new Set<number>();
    for(const word of words) {
      if(!word.element||word.atMs>ms)continue;
      const key=`${word.kind}:${word.text}`,id=this.words.get(key)??word.id;
      this.words.set(key,id);present.add(id);
      this.layers.set(id,{id,element:word.element,active:true});
    }
    for(const layer of this.layers.values())if(!present.has(layer.id))layer.active=false;
  }
  snapshot():ColorLayer[] {return [...this.layers.values()].map(layer=>({...layer}));}
}
