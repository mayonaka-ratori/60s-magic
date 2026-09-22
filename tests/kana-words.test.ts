import { describe,it,expect } from 'vitest';
import { CastSession } from '../src/game/session';
import { makeRecipe } from '../src/game/recipe';

/** 子どもや文字入力の人は、かなやカタカナで唱える。漢字と同じ魔法にする。 */
function recipeOf(text:string){
  const cast=new CastSession(()=>12000);
  cast.speech.add({id:0,revision:1,startMs:0,endMs:2000,text,final:true,stability:1,source:'typed'});
  return makeRecipe(cast.freeze());
}
describe('かなの詠唱',()=>{
  it('「こおりよ、かべになれ」は氷の壁になる',()=>{const r=recipeOf('こおりよ、かべになれ');expect(r.element).toBe('ice');expect(r.form).toBe('wall');expect(r.purpose).toBe('defend');});
  it('「ひかりよ、つらぬけ」は光の光線になる',()=>{const r=recipeOf('ひかりよ、つらぬけ');expect(r.element).toBe('light');expect(r.form).toBe('beam');});
  it('カタカナと漢字で同じ属性になる',()=>{
    for(const [kana,kanji] of [['ホノオ','炎'],['カゼ','風'],['ヤミ','闇'],['いなずま','稲妻']] as const)expect(recipeOf(`${kana}よ`).element,kana).toBe(recipeOf(`${kanji}よ`).element);
  });
  it('「かみなりよ、たおせ」は雷の攻撃になる',()=>{const r=recipeOf('かみなりよ、たおせ');expect(r.element).toBe('lightning');expect(r.purpose).toBe('attack');});
});
