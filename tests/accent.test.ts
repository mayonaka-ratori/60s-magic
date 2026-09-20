import { describe,it,expect } from 'vitest';
import { CastSession } from '../src/game/session';
import { makeRecipe, blendOf } from '../src/game/recipe';
import type { SpellState } from '../src/game/types';

function state(text=''):SpellState {
  const s=new CastSession(()=>0);
  s.motion.add(0.2,0.5,0);s.motion.add(0.5,0.55,100);
  if(text)s.speech.add({id:1,revision:1,startMs:11000,endMs:13999,text,final:true,stability:1,source:'typed'});
  return s.freeze();
}

describe('二つ目の属性を飾り色にする',()=>{
  it('属性語が二つあるとき、先に言った方が主属性で、次が飾り色',()=>{
    const r=makeRecipe(state('炎よ、雷と共に撃て'));
    expect(r.element).toBe('fire');expect(r.accent).toBe('lightning');
    expect(r.name).toBe('炎の光線');
    expect(r.decisions.element.source).toBe('word');
    expect(r.decisions.element.reason).toContain('飾り色');
  });
  it('言った順が逆なら主属性も入れ替わる',()=>{
    const r=makeRecipe(state('雷よ、炎と共に撃て'));
    expect(r.element).toBe('lightning');expect(r.accent).toBe('fire');
  });
  it('三つ以上あっても最初の二つだけ使う',()=>{
    const r=makeRecipe(state('氷よ、風と闇を纏って撃て'));
    expect(r.element).toBe('ice');expect(r.accent).toBe('wind');
  });
  it('属性語が一つなら飾り色はなし',()=>{
    const r=makeRecipe(state('氷よ'));
    expect(r.element).toBe('ice');expect(r.accent).toBe(null);
  });
  it('言い直しは残った方だけを使い、飾り色は付かない',()=>{
    const r=makeRecipe(state('炎ではなく氷よ'));
    expect(r.element).toBe('ice');expect(r.accent).toBe(null);
  });
  it('同じ属性語を繰り返しても飾り色にはしない',()=>{
    const r=makeRecipe(state('炎よ、炎の球となれ'));
    expect(r.element).toBe('fire');expect(r.accent).toBe(null);
  });
  it('属性語がなければ飾り色もなし',()=>{
    expect(makeRecipe(state('静かな力よ')).accent).toBe(null);
  });
  it('連弾でも主属性と飾り色が決まり、名前は主属性のまま',()=>{
    const r=makeRecipe(state('炎よ、雷と共に七つに分かれて撃て'));
    expect(r.element).toBe('fire');expect(r.accent).toBe('lightning');
    expect(r.count).toBe(7);expect(r.name).toBe('7つの炎の連弾');
  });
});

describe('二属性の合わせ方の三型',()=>{
  // 決め方の表。熱と冷（炎と氷）、明と暗（光と闇）の対どうしは相反するので「増幅」。
  // 雷が荒れる組み合わせと炎＋風は「爆発」。残りは並び立つので「持続」。
  const table:Array<[string,string,string]>=[
    ['fire','ice','amplify'],['fire','light','amplify'],['fire','dark','amplify'],
    ['ice','light','amplify'],['ice','dark','amplify'],['light','dark','amplify'],
    ['fire','lightning','burst'],['fire','wind','burst'],['lightning','light','burst'],['lightning','dark','burst'],
    ['ice','lightning','sustain'],['ice','wind','sustain'],['wind','light','sustain'],['wind','lightning','sustain'],['wind','dark','sustain'],
  ];
  it('表のとおりに型が決まり、前後を入れ替えても同じ',()=>{
    for(const [a,b,want] of table){
      expect([a,b,blendOf(a as never,b as never)]).toEqual([a,b,want]);
      expect([b,a,blendOf(b as never,a as never)]).toEqual([b,a,want]);
    }
  });
  it('六つの属性の組み合わせを全部覆っている',()=>{
    expect(table.length).toBe(15);
  });
  it('二色目がない、同じ、無属性のときは型なし',()=>{
    expect(blendOf('fire',null)).toBe(null);
    expect(blendOf('fire','fire')).toBe(null);
    expect(blendOf('neutral','fire')).toBe(null);
    expect(blendOf('fire','neutral')).toBe(null);
  });
  it('唱えた言葉から型が決まる',()=>{
    expect(makeRecipe(state('炎よ、雷と共に撃て')).blend).toBe('burst');
    expect(makeRecipe(state('炎よ、氷と共に撃て')).blend).toBe('amplify');
    expect(makeRecipe(state('氷よ、雷と共に撃て')).blend).toBe('sustain');
    expect(makeRecipe(state('氷よ')).blend).toBe(null);
  });
});
