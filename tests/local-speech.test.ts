import { EventEmitter } from 'node:events';
import { afterEach,describe,expect,it,vi } from 'vitest';
import type { WebSocket } from 'ws';
import { connectLocalSpeech, type LocalRecognizer } from '../server/local-speech-session';
import { speechModelName } from '../server/local-speech';
import { SpeechBook } from '../src/game/speech-book';
import { CastSession } from '../src/game/session';
import { COUNTDOWN_MS,MAX_INPUT_MS,ROUNDS,SPEECH_WAIT_MS,VOICE_RECONNECT_MS,speechSocketMsOf,windowMsOf } from '../src/game/rounds';

class Socket extends EventEmitter {
  OPEN=1;readyState=1;messages:any[]=[];
  send(value:string){this.messages.push(JSON.parse(value));}
  close(){this.readyState=3;this.emit('close');}
  start(){this.emit('message',Buffer.from(JSON.stringify({type:'start',sessionId:'test-session'})),false);}
  end(waitMs?:number){this.emit('message',Buffer.from(JSON.stringify(waitMs===undefined?{type:'end'}:{type:'end',waitMs})),false);}
  audio(startMs:number){const b=Buffer.alloc(3208);b.writeDoubleLE(startMs);b.fill(5,8);this.emit('message',b,true);}
}
function setup(recognize=vi.fn(async()=>({text:'氷よ壁となれ',processingMs:150}))) {
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout','setInterval','clearInterval','performance']});
  const backend:LocalRecognizer={recognize,getStatus:()=>({state:'ready',message:'準備済み',model:'kotoba-whisper-v2.0',device:'cuda'}),reserve:vi.fn(()=>true),release:vi.fn()};
  const socket=new Socket();connectLocalSpeech(socket as unknown as WebSocket,backend);socket.start();
  return {socket,backend,recognize};
}
afterEach(()=>vi.useRealTimers());
const text=(b:SpeechBook)=>b.snapshot().map(e=>e.text).join('、');
describe('声の接続を保つ長さ',()=>{
  it('どの回でも、締め切りと最後の声を待つ時間より後に切れる',()=>{
    // つなぐのは受付が始まる前。一回目は準備の合図の前、二回目からは回の手前。
    const 早くつなぐ分=Math.max(COUNTDOWN_MS,VOICE_RECONNECT_MS);
    for(const round of ROUNDS) {
      const 受付=windowMsOf(round),切れる=speechSocketMsOf(受付)-早くつなぐ分;
      expect(切れる).toBeGreaterThan(受付+SPEECH_WAIT_MS);
    }
    // 20秒の決め打ちだったころは、一回目の締め切り（18秒）より前に切れていた。
    expect(20000-早くつなぐ分).toBeLessThan(windowMsOf(ROUNDS[0]));
  });
  it('受け皿は、一番長い回の分だけ持つ',()=>{
    expect(MAX_INPUT_MS).toBe(Math.max(...ROUNDS.map(windowMsOf)));
    for(const round of ROUNDS)expect(windowMsOf(round)).toBeLessThanOrEqual(MAX_INPUT_MS);
  });
});

describe('ローカル音声認識の受付',()=>{
  it('同じ発話の途中結果を更新し、最後に一度だけ確定する',async()=>{
    const {socket,recognize}=setup();
    for(let i=0;i<7;i++){socket.audio(1000+i*100);await vi.advanceTimersByTimeAsync(100);}
    for(let i=7;i<14;i++){socket.audio(1000+i*100);await vi.advanceTimersByTimeAsync(100);}
    socket.end();await vi.advanceTimersByTimeAsync(1);
    const entries=socket.messages.filter(m=>m.type==='transcript').map(m=>m.entry);
    expect(recognize.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(new Set(entries.map(e=>e.id)).size).toBe(1);expect(entries.at(-1).final).toBe(true);expect(entries.at(-1).source).toBe('local');
    expect(entries.at(-1).startMs).toBe(1000);expect(entries.at(-1).endMs).toBe(2400);
    const book=new SpeechBook();entries.forEach(e=>book.add(e));expect(text(book)).toBe('氷よ壁となれ');socket.close();
  });
  it('早い発話の後に間が空いても、最後の発話まで受け付ける',async()=>{
    const {socket,recognize}=setup();socket.audio(1000);socket.audio(13000);socket.audio(13900);socket.end();await vi.advanceTimersByTimeAsync(1);
    const pcm=(recognize.mock.calls[0] as unknown as [Buffer])[0];
    expect(pcm.length).toBe(13000*32);expect(pcm.subarray(3200,384000).every(n=>n===0)).toBe(true);
    expect(socket.messages.find(m=>m.type==='transcript').entry.endMs).toBe(14000);socket.close();
  });
  it('650msを過ぎた最終回答を送らない',async()=>{
    const {socket}=setup(vi.fn(()=>new Promise(resolve=>setTimeout(()=>resolve({text:'遅れた声',processingMs:900}),900))));
    socket.audio(13900);socket.end();await vi.advanceTimersByTimeAsync(1000);
    expect(socket.messages.some(m=>m.type==='transcript')).toBe(false);socket.close();
  });
  it('処理中に新しい音が届いても要求を大量に積み上げない',async()=>{
    const {socket,recognize}=setup(vi.fn(()=>new Promise(resolve=>setTimeout(()=>resolve({text:'声',processingMs:2000}),2000))));
    for(let i=0;i<20;i++){socket.audio(i*100);await vi.advanceTimersByTimeAsync(100);}
    expect(recognize).toHaveBeenCalledOnce();socket.close();await vi.advanceTimersByTimeAsync(3000);
    expect(socket.messages.some(m=>m.type==='transcript')).toBe(false);
  });
  it('音がない場合は認識を呼ばず、声を作らない',async()=>{
    const {socket,recognize}=setup();socket.end();await vi.advanceTimersByTimeAsync(1000);expect(recognize).not.toHaveBeenCalled();expect(socket.messages.some(m=>m.type==='ended')).toBe(true);socket.close();
  });
  it('重複した音、受付後の音、長すぎる音は、その分だけ捨てて続ける',async()=>{
    const {socket,recognize}=setup();
    socket.audio(1000);socket.audio(1000);socket.audio(MAX_INPUT_MS-1);
    expect(socket.readyState).toBe(1);
    socket.end();await vi.advanceTimersByTimeAsync(1);
    socket.audio(2000);expect(socket.readyState).toBe(1);
    expect(recognize).toHaveBeenCalledOnce();
    // 受け皿の上限（一番長い回の18秒）を超えた分だけ落とし、18秒ちょうどまでは使う。
    expect(MAX_INPUT_MS).toBe(18000);
    expect(socket.messages.find(m=>m.type==='transcript').entry.endMs).toBe(MAX_INPUT_MS);socket.close();
  });
  it('形が壊れた音だけ接続を切る',()=>{
    const {socket}=setup();socket.emit('message',Buffer.alloc(5),true);expect(socket.readyState).toBe(3);
  });
  it('外れた音が続いたら接続を切る',()=>{
    const {socket}=setup();socket.audio(5000);
    for(let i=0;i<201;i++)socket.audio(100);
    expect(socket.readyState).toBe(3);
  });
  it('待てる時間を伸ばすと、遅れて届いた最後の結果も送る',async()=>{
    const {socket}=setup(vi.fn(()=>new Promise(resolve=>setTimeout(()=>resolve({text:'遅れた声',processingMs:900}),900))));
    socket.audio(13900);socket.end(1300);await vi.advanceTimersByTimeAsync(1000);
    const last=socket.messages.filter(m=>m.type==='transcript').at(-1);
    expect(last?.entry.text).toBe('遅れた声');expect(last?.entry.final).toBe(true);socket.close();
  });
  it('締め切りに間に合わない認識は始めない',async()=>{
    const recognize=vi.fn(()=>new Promise(resolve=>setTimeout(()=>resolve({text:'声',processingMs:800}),800)));
    const {socket}=setup(recognize as never);
    for(let i=0;i<70;i++){socket.audio(i*100);await vi.advanceTimersByTimeAsync(100);}
    await vi.advanceTimersByTimeAsync(2000);
    const before=recognize.mock.calls.length;
    socket.end(200);await vi.advanceTimersByTimeAsync(400);
    expect(recognize.mock.calls.length).toBe(before);
    expect(socket.messages.some(m=>m.type==='ended')).toBe(true);socket.close();
  });
  it('認識が失敗したときに同じ要求を繰り返さない',async()=>{
    const {socket,recognize}=setup(vi.fn(async()=>{throw new Error('GPUを使えません');}));
    socket.audio(13900);socket.end();await vi.advanceTimersByTimeAsync(1000);expect(recognize).toHaveBeenCalledOnce();expect(socket.readyState).toBe(3);
  });
  it('ローカルで認識した声を、文字の手入力として記録しない',()=>{
    const s=new CastSession(()=>0);s.speech.add({id:0,revision:1,startMs:11000,endMs:14000,text:'雷よ七つに分かれろ',final:true,stability:1,source:'local',processingMs:180});
    expect(s.freeze().speech.status).toBe('recognized');expect(s.state?.speech.provider).toBe('local');expect(s.report().speechEntries[0].processingMs).toBe(180);
  });
});

describe('確定が間に合わないときの扱い',()=>{
  it('PC内の認識の確定が届かなければ、最後の途中結果を採用して記録に残す',()=>{
    const book=new SpeechBook();
    book.add({id:0,revision:1,startMs:1000,endMs:6000,text:'氷よ',final:false,stability:0.5,source:'local'});
    book.add({id:0,revision:2,startMs:1000,endMs:11000,text:'氷よ壁となれ',final:false,stability:0.5,source:'local'});
    expect(text(book)).toBe('');
    expect(book.freeze().map(e=>e.text)).toEqual(['氷よ壁となれ']);expect(book.usedFallback).toBe(true);
  });
  it('Googleの途中結果は確定前に採用しない',()=>{
    const book=new SpeechBook();
    book.add({id:0,revision:1,startMs:1000,endMs:6000,text:'氷よ',final:false,stability:0.5,source:'google'});
    expect(book.freeze()).toHaveLength(0);expect(book.usedFallback).toBe(false);
  });
  it('確定が届いていれば途中結果の採用はしない',()=>{
    const book=new SpeechBook();
    book.add({id:0,revision:3,startMs:1000,endMs:14000,text:'雷よ七つに分かれろ',final:true,stability:0.9,source:'local'});
    expect(book.freeze().map(e=>e.text)).toEqual(['雷よ七つに分かれろ']);expect(book.usedFallback).toBe(false);
  });
  it('画面に出す最新の文字は安定していなくても返す',()=>{
    const book=new SpeechBook();
    book.add({id:0,revision:1,startMs:1000,endMs:6000,text:'氷よ',final:false,stability:0.5,source:'local'});
    expect(book.latest()?.text).toBe('氷よ');
  });
});

describe('認識モデルの名前',()=>{
  it('動かし方の違いは画面に出す名前へ入れない',()=>{
    expect(speechModelName('kotoba-v2.0')).toBe('kotoba-whisper-v2.0');
    expect(speechModelName('kotoba-v2.0-mlx')).toBe('kotoba-whisper-v2.0');
    expect(speechModelName('small')).toBe('whisper-small');
    expect(speechModelName('small-mlx')).toBe('whisper-small');
    expect(speechModelName('large-v3-turbo-mlx')).toBe('whisper-large-v3-turbo');
  });
});
