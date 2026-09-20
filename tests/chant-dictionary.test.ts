import { describe,it,expect } from 'vitest';
import { readChant,chantDictionary } from '../src/game/chant-dictionary';
import { CastSession } from '../src/game/session';
import { makeRecipe } from '../src/game/recipe';
function cast(text:string){const s=new CastSession(()=>0);s.speech.add({id:0,revision:1,startMs:0,endMs:13000,text,final:true,stability:1,source:'local'});return s.freeze();}
describe('難しい詠唱の言葉',()=>{
  it.each([
    ['紅蓮よ、七つの魔弾となれ','fire','swarm','attack'],
    ['らいていよ、敵をうがて','lightning','beam','attack'],
    ['ヒョウショウよ、ショウヘキとなれ','ice','wall','defend'],
    ['常闇よ、結界となれ','dark','dome','defend'],
    ['深淵よ、鎖となり敵を封印せよ','dark','beam','bind'],
    ['烈風の奔流よ、押し流せ','wind','wave','attack'],
    ['業火ではなく氷晶よ、壁となれ','ice','wall','defend'],
    ['紅蓮は使わない、氷獄よ、壁となれ','ice','wall','defend'],
  ])('%s',(text,element,form,purpose)=>{const r=makeRecipe(cast(text));expect(r.element).toBe(element);expect(r.form).toBe(form);expect(r.purpose).toBe(purpose);});
  it('普通の言葉や似た音を難しい漢字へ決めつけない',()=>{
    for(const text of ['無料の動画を見る','今日はせいこうした','かごを持ってきた','有名な人','ならくじを引こう','無料空所'])expect(readChant(text).normalized).toBe(text);
  });
  it('元の文字を保存し、読みの変換後と分ける',()=>{
    const s=cast('らいていよ、うがて');expect(s.speech.rawTranscript).toBe('らいていよ、うがて');expect(s.speech.normalizedTranscript).toBe('雷霆よ、穿て');
  });
  it('作品名や飾りの言葉だけで属性や個数を決めない',()=>{
    for(const text of ['破道の九十、黒棺','領域展開、誅伏賜死','森羅万象、久遠、黄昏']){const r=makeRecipe(cast(text));expect(r.element).toBe('neutral');expect(r.explicitCount).toBeNull();}
  });
  it('辞書の指示にも否定と個数を適用する',()=>{
    const r=makeRecipe(cast('封印しないで、氷晶の障壁で我を守れ'));expect(r.purpose).toBe('defend');expect(r.enclosure).toBe(false);
    expect(makeRecipe(cast('紅蓮の魔弾を七つ')).count).toBe(7);
    expect(makeRecipe(cast('雷霆よ、螺旋を描け')).trajectory).toBe('spiral');
    expect(makeRecipe(cast('魔弾よ、追尾せよ')).trajectory).toBe('homing');
  });
  it('辞書の表記を重複させない',()=>{
    expect(new Set(chantDictionary.entries.map(e=>e.term)).size).toBe(chantDictionary.entries.length);
    expect(chantDictionary.entries.every(e=>e.reading&&e.term&&e.group)).toBe(true);
  });
});
