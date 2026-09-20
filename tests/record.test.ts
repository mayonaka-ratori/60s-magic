import { describe,it,expect } from 'vitest';
import { CODE_DIGITS,DELIVERY_MESSAGES,PlayRecorder,ROUND_TITLES,browserStore,makeCode,memoryStore,nameParts,playOf,resultRows,type BattleLike,type CastLike } from '../src/game/record';
import { ROUNDS } from '../src/game/rounds';
import type { Point,Recipe } from '../src/game/types';

/** 試験用のレシピ。名前と属性だけを変えれば足りる。 */
const recipeOf=(name:string,element:Recipe['element']='fire'):Recipe=>({
  version:'recipe-1',accent:null,blend:null,element,purpose:'attack',form:'orb',trajectory:'straight',
  count:1,explicitCount:null,defense:.5,area:.5,duration:.5,concentration:.5,enclosure:false,split:false,
  developsPrevious:null,motionSpeechAligned:null,noAttack:false,name,source:'local',decisions:{},assistance:[],model:null});

/** 試験用の線。点の数だけ斜めに並べる。 */
const line=(count:number,stroke=1):Point[]=>
  Array.from({length:count},(_,i)=>({x:.3+i*.01,y:.4+i*.01,t:i*30,hand:0,stroke}));

const castOf=(round:typeof ROUNDS[number],recipe:Recipe|null,transcript='',guard:CastLike['guard']=null):CastLike=>({
  round:{id:round.id,castId:round.castId},recipe,motion:{raw:line(6),display:line(5)},
  state:transcript?{speech:{rawTranscript:transcript}}:null,guard});

const battleOf=():BattleLike=>({
  id:'試験の戦い',inherited:line(3),
  casts:[
    castOf(ROUNDS[0],recipeOf('7つの雷の連弾','lightning'),'雷よ、七つに分かれろ'),
    castOf(ROUNDS[1],recipeOf('氷の壁','ice'),'氷よ、壁となれ',
      {shield:{enclosed:true,rings:2,layers:1,moved:false,outline:[{x:.4,y:.5},{x:.6,y:.5},{x:.6,y:.7},{x:.4,y:.7}]},style:'reflect'}),
    castOf(ROUNDS[2],recipeOf('光の結界','light'),'光よ、集まれ、貫け'),
  ],
});

describe('確認番号',()=>{
  it('6桁の数字になる',()=>{
    const code=makeCode([],()=>.1234567);
    expect(code).toHaveLength(CODE_DIGITS);
    expect(code).toMatch(/^\d{6}$/);
  });
  it('小さい値でも0で埋めて6桁にする',()=>{
    expect(makeCode([],()=>0)).toBe('000000');
  });
  it('保存済みの番号と同じなら作り直す',()=>{
    const values=[.5,.5,.7];let i=0;
    const code=makeCode(['500000'],()=>values[i++] ?? .9);
    expect(code).toBe('700000');
    expect(i).toBe(3);
  });
  it('乱数が何度も重なっても、空いている番号を返す',()=>{
    const code=makeCode(['000000'],()=>0);
    expect(code).toBe('000001');
  });
});

describe('このPCの中への保存',()=>{
  it('保存して読み戻すと、三件が同じになる',async()=>{
    const store=memoryStore();
    const recorder=await PlayRecorder.open(store,()=>.42);
    const battle=battleOf();
    const saved=await recorder.save(battle);
    const loaded=await recorder.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.code).toBe(recorder.code);
    expect(loaded!.rounds.map(round=>round.recipe?.name)).toEqual(['7つの雷の連弾','氷の壁','光の結界']);
    // 結果画面は、この保存だけから同じものを組み立てられる。
    expect(resultRows(loaded!)).toEqual(resultRows(saved));
  });
  it('術式の点列と引き継いだ形も残る。声と映像そのものは残さない',async()=>{
    const store=memoryStore();
    const recorder=await PlayRecorder.open(store,()=>.42);
    await recorder.save(battleOf());
    const loaded=(await recorder.load())!;
    expect(loaded.rounds[0].rawPoints).toHaveLength(6);
    expect(loaded.rounds[0].displayPoints).toHaveLength(5);
    expect(loaded.rounds[0].rawPoints[1].t).toBe(30);
    expect(loaded.inherited).toHaveLength(3);
    expect(loaded.rounds[0].transcript).toBe('雷よ、七つに分かれろ');
    expect(JSON.stringify(loaded)).not.toContain('audio');
  });
  it('確定した回がまだ無いときは保存しない',async()=>{
    const store=memoryStore();
    const recorder=await PlayRecorder.open(store,()=>.42);
    await recorder.save({id:'空',inherited:[],casts:[castOf(ROUNDS[0],null)]});
    expect(recorder.stored).toBe(false);
    expect(await store.list()).toEqual([]);
  });
  it('保存できないときも例外を出さず、状態に残す',async()=>{
    const broken={list:async()=>[],load:async()=>null,save:async()=>{throw new Error('置き場所がいっぱい');}};
    const recorder=await PlayRecorder.open(broken,()=>.42);
    await expect(recorder.save(battleOf())).resolves.toBeTruthy();
    expect(recorder.stored).toBe(false);
    expect(recorder.failure).toBe('置き場所がいっぱい');
  });
  it('IndexedDBが無い環境では置き場所を作らず、例外も出さない',async()=>{
    expect(typeof indexedDB).toBe('undefined');
    expect(browserStore()).toBeNull();
    const recorder=await PlayRecorder.open();
    expect(recorder.available).toBe(false);
    expect(recorder.code).toMatch(/^\d{6}$/);
    await expect(recorder.save(battleOf())).resolves.toBeTruthy();
  });
  it('保存の状態の一行は、今は「この画面でだけ見られます」になる',async()=>{
    const recorder=await PlayRecorder.open(memoryStore());
    expect(recorder.message).toBe('この画面でだけ見られます');
    expect(DELIVERY_MESSAGES['not-sent']).toBe('まだ届いていません');
    // 届いていないものを「登録しました」と書かない。
    expect(Object.values(DELIVERY_MESSAGES).join('')).not.toContain('登録');
  });
});

describe('結果画面に並べる三件',()=>{
  const rows=resultRows(playOf(battleOf(),'123456','2026-09-20T00:00:00.000Z'));
  it('実際に確定した魔法と同じ名前が、回の順に並ぶ',()=>{
    expect(rows.map(row=>row.title)).toEqual([ROUND_TITLES.first,ROUND_TITLES.defend,ROUND_TITLES.finish]);
    expect(rows.map(row=>row.name)).toEqual(['7つの雷の連弾','氷の壁','光の結界']);
    expect(rows.map(row=>row.element)).toEqual(['lightning','ice','light']);
  });
  it('代表はとどめの魔法',()=>{
    expect(rows.map(row=>row.main)).toEqual([false,false,true]);
  });
  it('防御の回の絵は盾の形を使う',()=>{
    expect(rows[1].points).toHaveLength(4);
    expect(rows[1].points[0]).toMatchObject({x:.4,y:.5,stroke:0});
    expect(rows[0].points).toHaveLength(5);
  });
  it('ひとことは、防御は盾の様子、ほかは詠唱',()=>{
    expect(rows[1].note).toBe('印を2重に囲み、騎士の一撃を弾き返した');
    expect(rows[0].note).toBe('「雷よ、七つに分かれろ」');
  });
  it('作れなかった回は、作れなかったと書く',()=>{
    const rows=resultRows(playOf({id:'空',inherited:[],casts:[castOf(ROUNDS[0],null)]},'123456','2026-09-20T00:00:00.000Z'));
    expect(rows[0].name).toBe('（作れませんでした）');
    expect(rows[0].element).toBeNull();
    expect(rows[0].note).toBe('線だけで作った');
  });
});

describe('魔法名のふりがな',()=>{
  it('辞書から読みを引ける語にだけ付ける',()=>{
    expect(nameParts('7つの雷の連弾')).toEqual([{text:'7つの雷の'},{text:'連弾',reading:'れんだん'}]);
    expect(nameParts('光の結界')).toEqual([{text:'光の'},{text:'結界',reading:'けっかい'}]);
  });
  it('読みを引けない語には付けない',()=>{
    expect(nameParts('氷の壁')).toEqual([{text:'氷の壁'}]);
    expect(nameParts('はじまりの球')).toEqual([{text:'はじまりの球'}]);
  });
  it('切り分けた文字をつなぐと元の名前に戻る',()=>{
    for(const name of ['7つの雷の連弾','光の結界','氷の壁','炎の光線'])
      expect(nameParts(name).map(part=>part.text).join('')).toBe(name);
  });
});
