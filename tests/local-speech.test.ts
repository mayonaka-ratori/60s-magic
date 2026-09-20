import { EventEmitter } from 'node:events';
import { afterEach,describe,expect,it,vi } from 'vitest';
import type { WebSocket } from 'ws';
import { connectLocalSpeech, type LocalRecognizer } from '../server/local-speech-session';
import { SpeechBook } from '../src/game/speech-book';
import { CastSession } from '../src/game/session';

class Socket extends EventEmitter {
  OPEN=1;readyState=1;messages:any[]=[];
  send(value:string){this.messages.push(JSON.parse(value));}
  close(){this.readyState=3;this.emit('close');}
  start(){this.emit('message',Buffer.from(JSON.stringify({type:'start',sessionId:'test-session'})),false);}
  end(){this.emit('message',Buffer.from('{"type":"end"}'),false);}
  audio(startMs:number){const b=Buffer.alloc(3208);b.writeDoubleLE(startMs);b.fill(5,8);this.emit('message',b,true);}
}
function setup(recognize=vi.fn(async()=>({text:'氷よ壁となれ',processingMs:150}))) {
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout','setInterval','clearInterval','performance']});
  const backend:LocalRecognizer={recognize,getStatus:()=>({state:'ready',message:'準備済み',model:'kotoba-whisper-v2.0',device:'cuda'}),reserve:vi.fn(()=>true),release:vi.fn()};
  const socket=new Socket();connectLocalSpeech(socket as unknown as WebSocket,backend);socket.start();
  return {socket,backend,recognize};
}
afterEach(()=>vi.useRealTimers());
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
    const book=new SpeechBook();entries.forEach(e=>book.add(e));expect(book.text()).toBe('氷よ壁となれ');socket.close();
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
  it('重複した音、受付後の音、長すぎる音を拒む',()=>{
    for(const kind of ['duplicate','late','overflow']){
      const {socket}=setup();
      if(kind==='duplicate'){socket.audio(100);socket.audio(100);}else if(kind==='late'){socket.end();socket.audio(100);}else socket.audio(13999);
      expect(socket.readyState).toBe(3);
    }
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
