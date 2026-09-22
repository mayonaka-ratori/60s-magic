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

describe('聞き取りの揺れを辞書へ寄せる',()=>{
  it('伸ばす音と濁点の書き方が違っても同じ言葉として読む',()=>{
    expect(readChant('らいてーよ、敵をうがて').normalized).toBe('雷霆よ、敵を穿て');
    expect(readChant('くれんよ、七つの魔弾となれ').normalized).toBe('紅蓮よ、七つの魔弾となれ');
    expect(readChant('ひょうしょおよ、しょうへきとなれ').normalized).toBe('氷晶よ、障壁となれ');
    expect(makeRecipe(cast('らいてーよ、七つに分かれろ')).element).toBe('lightning');
  });
  it('どこを寄せたかを残し、元の聞き取りは変えない',()=>{
    expect(readChant('らいてーよ、敵をうがて').corrections).toEqual([{from:'らいてー',to:'雷霆',reading:'らいてい'}]);
    expect(readChant('らいていよ、敵をうがて').corrections).toEqual([]);
    const s=cast('くれんよ、燃やせ');
    expect(s.speech.rawTranscript).toBe('くれんよ、燃やせ');
    expect(s.speech.normalizedTranscript).toBe('紅蓮よ、燃やせ');
  });
  it('普通の言葉、似た音、文字数や音そのものが違う聞き違いは、難しい漢字へ寄せない',()=>{
    const 変えない:Array<[string,string]>=[
      ['無料の動画を見る','普通の言葉'],['今日はせいこうした','普通の言葉'],['かごを持ってきた','普通の言葉'],['有名な人','普通の言葉'],['無料空所','普通の言葉'],
      ['ならくじを引こう','似た音'],
      ['ふんかれろ','文字数が変わる聞き違い'],['らいてよ','文字数が変わる聞き違い'],['ごくへんよ','音そのものが違う'],['されんよ','音そのものが違う'],
      ['効果がある','漢字で書かれた普通の言葉'],['評価する','漢字で書かれた普通の言葉'],['高価な品','漢字で書かれた普通の言葉'],['公開した','漢字で書かれた普通の言葉'],
    ];
    for(const [text,理由] of 変えない)expect(readChant(text).normalized,`${text}（${理由}）`).toBe(text);
  });
});

/** 子どもや文字入力の人は、かなやカタカナで唱える。漢字と同じ魔法にする。 */
describe('かなの詠唱',()=>{
  it('ひらがなの「こおりよ、かべになれ」は氷の壁で守る魔法になる',()=>{
    const r=makeRecipe(cast('こおりよ、かべになれ'));expect(r.element).toBe('ice');expect(r.form).toBe('wall');expect(r.purpose).toBe('defend');
  });
  it('カタカナやかなで唱えても、漢字と同じ属性になる',()=>{
    for(const [kana,kanji] of [['ホノオ','炎'],['カゼ','風'],['ヤミ','闇'],['いなずま','稲妻']] as const)
      expect(makeRecipe(cast(`${kana}よ`)).element,kana).toBe(makeRecipe(cast(`${kanji}よ`)).element);
  });
});
