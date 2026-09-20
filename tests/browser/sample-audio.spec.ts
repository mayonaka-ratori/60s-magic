import { test,expect } from '@playwright/test';

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

test('置いた素材で曲と効果音が鳴り、無い素材は飛ばす',async({page})=>{
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
      if(destination===this.context.destination) {
        const analyser=this.context.createAnalyser();analyser.fftSize=2048;(connect as any).call(this,analyser);(connect as any).call(analyser,destination);
        const data=new Float32Array(2048);
        setInterval(()=>{analyser.getFloatTimeDomainData(data);let sum=0;for(const value of data){probe.peak=Math.max(probe.peak,Math.abs(value));sum+=value*value;}probe.rms=Math.sqrt(sum/data.length);},20);
        return destination;
      }
      return (connect as any).call(this,destination,...args);
    };
  });
  await page.goto('/');await page.locator('#test-sound').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__soundProbe.peak)).toBeGreaterThan(.001);
  await page.locator('#start').click();await page.locator('#chant').fill('雷よ、七つに分かれろ');
  // 6秒より前は合図が無いので、ここで音が出ていれば曲が鳴っている。
  await page.waitForTimeout(1500);
  expect(await page.evaluate(()=>(window as any).__soundProbe.rms)).toBeGreaterThan(.001);
  await expect(page.locator('#result')).toBeVisible({timeout:30000});
  await page.locator('#record').click();const report=JSON.parse(await page.locator('#sheet-body pre').innerText());
  expect(report.audio.samples).toEqual({manifest:true,loaded:['bgm/test.wav','sfx/chime.wav','sfx/hit-1.wav','sfx/hit-2.wav'],missing:['sfx/missing.wav']});
  expect(report.audio.credits).toEqual(['テスト用の曲']);
  expect(report.audio.bgmStartedAtMs).toBeLessThan(1000);expect(report.audio.bgm).toBe('none');expect(report.audio.activeSources).toBe(0);
  expect(report.audio.events.map((e:{name:string;sample:boolean})=>[e.name,e.sample])).toEqual([
    ['trace',false],['chant',false],['build',false],['complete',true],['release',false],['impact',true],['settle',false],
  ]);
  await page.locator('#sheet-close').click();
  // 曲は終了後に止まる。
  await expect.poll(()=>page.evaluate(()=>(window as any).__soundProbe.rms),{timeout:2000,intervals:[50]}).toBeLessThan(.00001);
  expect(errors).toEqual([]);
});
