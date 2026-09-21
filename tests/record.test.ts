import { describe,it,expect } from 'vitest';
import { CODE_DIGITS,DELIVERY_MESSAGES,KEEP_PLAYS,PlayRecorder,ROUND_TITLES,browserStore,makeCode,memoryStore,nameParts,playOf,resultRows,thinPoints,type BattleLike,type CastLike,type PlayContext } from '../src/game/record';
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
    // 生の点列は1秒30点まで間引くので、6点のうちいくつかは残らない。始まりと終わりは残る。
    expect(loaded.rounds[0].rawPoints.length).toBeGreaterThan(1);
    expect(loaded.rounds[0].rawPoints[0].t).toBe(0);
    expect(loaded.rounds[0].rawPoints.at(-1)!.t).toBe(150);
    expect(loaded.rounds[0].displayPoints).toHaveLength(5);
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
  it('保存できたときだけ「この画面でだけ見られます」と出す',async()=>{
    const recorder=await PlayRecorder.open(memoryStore());
    // まだ一件も保存していないうちは、保存できたと書かない。
    expect(recorder.message).toBe('保存できませんでした。この画面を閉じると消えます');
    await recorder.save(battleOf());
    expect(recorder.stored).toBe(true);
    expect(recorder.message).toBe('この画面でだけ見られます');
    expect(DELIVERY_MESSAGES['not-sent']).toBe('まだ届いていません');
    // 届いていないものを「登録しました」と書かない。
    expect(Object.values(DELIVERY_MESSAGES).join('')).not.toContain('登録');
  });
  it('保存に失敗したときは「保存できませんでした」と出す',async()=>{
    const broken={list:async()=>[],load:async()=>null,save:async()=>{throw new Error('置き場所がいっぱい');}};
    const recorder=await PlayRecorder.open(broken,()=>.42);
    await recorder.save(battleOf());
    expect(recorder.delivery).toBe('not-stored');
    expect(recorder.message).toBe('保存できませんでした。この画面を閉じると消えます');
  });
  it('IndexedDBを開けない環境では、使える置き場所と見なさない',async()=>{
    // 開こうとすると必ず失敗する置き場所を用意する（プライベートモードなどを真似る）。
    const fake={open:()=>{
      const request:Record<string,unknown>={onsuccess:null,onerror:null,onupgradeneeded:null,onblocked:null,error:new Error('開けません')};
      setTimeout(()=>(request.onerror as (()=>void)|null)?.(),0);
      return request;
    }};
    (globalThis as unknown as {indexedDB:unknown}).indexedDB=fake;
    try {
      const store=browserStore('試験の置き場所');
      expect(store).not.toBeNull();
      // 有る無しだけでは決めず、実際に開けたかで決める。
      expect(await store!.probe!()).toBe(false);
      const recorder=await PlayRecorder.open();
      expect(recorder.available).toBe(false);
      await recorder.save(battleOf());
      expect(recorder.message).toBe('保存できませんでした。この画面を閉じると消えます');
    } finally {
      delete (globalThis as unknown as {indexedDB?:unknown}).indexedDB;
    }
  });
  it('確認番号がほかの記録と重なったときは、番号を作り直して保存する',async()=>{
    const store=memoryStore();
    const values=[.5,.7];let i=0;
    const recorder=await PlayRecorder.open(store,()=>values[Math.min(i++,values.length-1)]);
    expect(recorder.code).toBe('500000');
    // 番号を決めたあとに、別の人が同じ番号で先に保存した場合（同時に遊んだとき）。
    await store.save(playOf({id:'別の人',inherited:[],casts:[castOf(ROUNDS[0],recipeOf('先の魔法'))]},'500000','2026-09-20T00:00:00.000Z'));
    await recorder.save(battleOf());
    expect(recorder.code).toBe('700000');
    expect(recorder.stored).toBe(true);
    // 別の人の記録は消えていない。
    expect((await store.load('500000'))!.sessionId).toBe('別の人');
    expect((await recorder.load())!.sessionId).toBe('試験の戦い');
  });
  it('途中でやめたときは、中止の印と、確定した回の数を残す',async()=>{
    const store=memoryStore();
    const recorder=await PlayRecorder.open(store,()=>.42);
    const half:BattleLike={id:'途中',inherited:[],casts:[castOf(ROUNDS[0],recipeOf('雷の球','lightning')),castOf(ROUNDS[1],null)]};
    await recorder.save(half);
    const saved=(await recorder.load())!;
    expect(saved.cancelled).toBe(false);
    expect(saved.completedRounds).toBe(1);
    await recorder.saveCancelled(half);
    expect((await recorder.load())!.cancelled).toBe(true);
    // 二度目は書き足さない。
    expect(await recorder.saveCancelled(half)).toBeNull();
  });
  it('一件も保存していないときは、中止の印だけの記録を作らない',async()=>{
    const store=memoryStore();
    const recorder=await PlayRecorder.open(store,()=>.42);
    expect(await recorder.saveCancelled({id:'空',inherited:[],casts:[castOf(ROUNDS[0],null)]})).toBeNull();
    expect(await store.list()).toEqual([]);
  });
  it('点列の読み方などの付帯情報を残す。声とカメラの生データや機種の名前は入れない',async()=>{
    const context:PlayContext={coordinates:'normalized-0-1',mirrored:true,viewport:{width:1440,height:900},inputMode:'camera'};
    const store=memoryStore();
    const recorder=await PlayRecorder.open(store,()=>.42,()=>new Date('2026-09-20T01:02:03.000Z'),context);
    await recorder.save(battleOf());
    const loaded=(await recorder.load())!;
    expect(loaded.coordinates).toBe('normalized-0-1');
    expect(loaded.mirrored).toBe(true);
    expect(loaded.viewport).toEqual({width:1440,height:900});
    expect(loaded.inputMode).toBe('camera');
    expect(loaded.startedAt).toBe('2026-09-20T01:02:03.000Z');
    expect(JSON.stringify(loaded)).not.toContain('userAgent');
    expect(JSON.stringify(loaded)).not.toContain('audio');
  });
  it('記録が増えすぎたら、古いものから消す',async()=>{
    const plays=Array.from({length:KEEP_PLAYS+5},(_,i)=>playOf(
      {id:`古い${i}`,inherited:[],casts:[castOf(ROUNDS[0],recipeOf('球'))]},
      String(100000+i),new Date(Date.UTC(2026,0,1,0,i)).toISOString()));
    const store=memoryStore(plays);
    const recorder=await PlayRecorder.open(store,()=>.42);
    const left=await store.list();
    expect(left).toHaveLength(KEEP_PLAYS);
    // 早く始めたものから消える。
    expect(left).not.toContain('100000');
    expect(left).toContain(String(100000+KEEP_PLAYS+4));
    expect(recorder.code).toMatch(/^\d{6}$/);
  });
  it('一プレイの保存の大きさを測る。設計の目安（100KB）は超えている',async()=>{
    // 一番重い場合。三回とも受付のあいだ手を止めず、カメラが1秒30点を出し続けた片手の線。
    const busy=(from:number,to:number):Point[]=>{
      const out:Point[]=[];
      for(let t=from;t<to;t+=1000/30)
        out.push({x:.5+Math.sin(t/300)*.3123456789,y:.5+Math.cos(t/251)*.2987654321,
          t:Math.round((t-from)*1000)/1000,hand:0,stroke:Math.floor((t-from)/3000)});
      return out;
    };
    const cast=(round:typeof ROUNDS[number],name:string):CastLike=>({
      round:{id:round.id,castId:round.castId},recipe:recipeOf(name),
      // 表示用の点列は MotionRecorder が片手256点までに抑える。
      motion:{raw:busy(round.start,round.inputEnd),display:busy(round.start,round.inputEnd).slice(0,256)},
      state:{speech:{rawTranscript:'炎よ、集まれ、貫け'}},guard:null});
    const play=playOf({id:'重い戦い',inherited:busy(0,2000),
      casts:[cast(ROUNDS[0],'炎の球'),cast(ROUNDS[1],'氷の壁'),cast(ROUNDS[2],'光の結界')]},'123456','2026-09-20T00:00:00.000Z');
    const bytes=new TextEncoder().encode(JSON.stringify(play)).length;
    // 間引きのおかげで生の点は1秒30点までに収まる。
    expect(play.rounds.reduce((sum,round)=>sum+round.rawPoints.length,0)).toBeLessThanOrEqual(30*30+10);
    // 今のところ片手で約110KB。設計仕様4.2の目安（圧縮後100KB程度）は超えている。
    // 数字は docs/実装と確認の記録.md に書いてある。ここは、これ以上ふくらんだら気づくための線。
    expect(bytes).toBeLessThan(130*1024);
  });});

describe('生の点列の間引き',()=>{
  it('1秒あたり30点までにする',()=>{
    // 3秒ぶんを1秒100点で作る。間引いたあとは1秒30点あたりになる。
    const points:Point[]=Array.from({length:300},(_,i)=>({x:.5,y:.5,t:i*10,hand:0,stroke:0}));
    const thinned=thinPoints(points);
    expect(thinned.length).toBeLessThanOrEqual(3*30+2);
    expect(thinned.length).toBeGreaterThanOrEqual(3*30-2);
  });
  it('線の始まりと終わりは必ず残す',()=>{
    const points:Point[]=[
      {x:.1,y:.1,t:0,hand:0,stroke:0},{x:.2,y:.2,t:5,hand:0,stroke:0},
      {x:.3,y:.3,t:10,hand:0,stroke:1},{x:.4,y:.4,t:15,hand:0,stroke:1}];
    const thinned=thinPoints(points);
    expect(thinned.map(p=>p.stroke)).toEqual([0,1,1]);
    expect(thinned[0].t).toBe(0);
    expect(thinned.at(-1)!.t).toBe(15);
  });
  it('点が無いときは空のまま',()=>{
    expect(thinPoints([])).toEqual([]);
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
