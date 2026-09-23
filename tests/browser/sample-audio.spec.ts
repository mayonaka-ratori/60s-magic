import { test,expect } from '@playwright/test';
import { ENEMY_MOVES } from '../../src/game/rounds';
import { 中止して記録を読む,声を試験用の返事にする,防御の回まで待つ } from './cancel-record';
import { 順番に一回目に鳴る音 } from './sound-order';

/**
 * 素材を使うかどうかも合わせて見る。素材を置いた合図だけが true になる。どちらも一回目で鳴る。
 * 「順番に」の防御の回は、始まりと同時に線の合図（trace）が鳴るので、防御の回に入ったと分かった時点でこれも入っている。
 */
const 鳴る音と素材=[...順番に一回目に鳴る音,'trace'].map(name=>[name,name==='complete'||name==='impact']);

/** 短い正弦波のWAVを作る。外部の素材の代わりに、読み込みと再生の経路だけを確かめる。 */
function wav(seconds:number,frequency:number,level:number) {
  const rate=48000,frames=Math.round(rate*seconds),data=Buffer.alloc(44+frames*2);
  data.write('RIFF',0);data.writeUInt32LE(36+frames*2,4);data.write('WAVE',8);data.write('fmt ',12);data.writeUInt32LE(16,16);
  data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*2,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);
  data.write('data',36);data.writeUInt32LE(frames*2,40);
  for(let i=0;i<frames;i++)data.writeInt16LE(Math.round(Math.sin(i/rate*Math.PI*2*frequency)*level*32767),44+i*2);
  return data;
}
const manifest={
  bgm:{file:'bgm/test.wav',gainDb:-9,loop:true,credit:'テスト用の曲'},
  sfx:{complete:{files:['sfx/chime.wav'],synth:false},impact:{files:['sfx/hit-1.wav','sfx/hit-2.wav']},release:{files:['sfx/missing.wav']}},
};
const files:Record<string,Buffer>={'bgm/test.wav':wav(2,110,.5),'sfx/chime.wav':wav(.6,880,.4),'sfx/hit-1.wav':wav(.3,70,.8),'sfx/hit-2.wav':wav(.3,90,.8)};

test('置いた素材で曲と効果音が鳴り、無い素材は飛ばし、中止すると曲が止まる',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/audio/manifest.json',route=>route.fulfill({json:manifest}));
  await page.route('**/audio/**/*.wav',route=>{
    const path=route.request().url().replace(/^.*\/audio\//,'');
    return files[path]?route.fulfill({body:files[path],contentType:'audio/wav'}):route.fulfill({status:404});
  });
  await page.addInitScript(()=>{
    const probe={peak:0,rms:0};(window as any).__soundProbe=probe;
    const connect=AudioNode.prototype.connect;
    AudioNode.prototype.connect=function(destination:any,...args:any[]):any {
      // 声の取り込みは、音量0の段を通して出力へつなぐだけで音を出さない。測ると0で上書きされるので、曲と効果音の出口だけを測る。
      if(destination===this.context.destination&&!(this instanceof GainNode&&this.gain.value===0)) {
        const analyser=this.context.createAnalyser();analyser.fftSize=2048;(connect as any).call(this,analyser);(connect as any).call(analyser,destination);
        const data=new Float32Array(2048);
        setInterval(()=>{analyser.getFloatTimeDomainData(data);let sum=0;for(const value of data){probe.peak=Math.max(probe.peak,Math.abs(value));sum+=value*value;}probe.rms=Math.sqrt(sum/data.length);},20);
        return destination;
      }
      return (connect as any).call(this,destination,...args);
    };
  });
  await 声を試験用の返事にする(page,'雷よ、七つに分かれろ');
  // 何も付けないURLは「順番に」。
  await page.goto('/?dev=1');await expect(page.locator('#app')).toHaveAttribute('data-flow','sequential');
  await expect(page.locator('#use-voice')).toBeEnabled();await expect(page.locator('#use-voice')).toBeChecked();
  await page.locator('.sound-settings summary').click();await page.locator('#test-sound').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__soundProbe.peak)).toBeGreaterThan(.001);
  await page.locator('#start').click();await expect(page.locator('#app')).toHaveAttribute('data-screen','playing',{timeout:15000});
  // 最初の合図は騎士の足踏みなので、その半分の時刻で音が出ていれば曲が鳴っている。
  // 一回目は声の受付中なので曲は下がっているが、止まってはいない。
  await page.waitForTimeout(ENEMY_MOVES[0].at/2);
  expect(await page.evaluate(()=>(window as any).__soundProbe.rms)).toBeGreaterThan(.001);
  // 素材を使う合図（完成と命中）は一回目で鳴るので、90秒の終わりまでは待たない。防御の回に入ったところで中止して記録を読む。
  await 防御の回まで待つ(page);
  const report=await 中止して記録を読む(page);
  expect(report.audio.samples).toEqual({manifest:true,loaded:['bgm/test.wav','sfx/chime.wav','sfx/hit-1.wav','sfx/hit-2.wav'],missing:['sfx/missing.wav']});
  expect(report.audio.credits).toEqual(['テスト用の曲']);
  // 記録は中止の直前に取るので、曲はまだ鳴っている。
  expect(report.audio.bgmStartedAtMs).toBeLessThan(1000);expect(report.audio.bgm).toBe('playing');
  // マイクは使っているが、手だけの防御の回は声を受け付けないので、曲と効果音を下げていない。
  expect(report.flow).toBe('sequential');expect(report.audio.microphone).toBe(true);expect(report.audio.ducked).toBe(false);
  expect(report.audio.events.map((e:{name:string;sample:boolean})=>[e.name,e.sample])).toEqual(鳴る音と素材);
  // 曲は中止したあとに止まる。終了のときも同じ止め方を通る。
  await expect.poll(()=>page.evaluate(()=>(window as any).__soundProbe.rms),{timeout:2000,intervals:[50]}).toBeLessThan(.00001);
  expect(errors).toEqual([]);
});
