import { test,expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

/**
 * 鳴るはずの音の並び。実装から作らず、ここに直接書く。
 * 一回目、防御、とどめの順。とどめの並びは tests/finish-audio.test.ts と同じ。
 * 魔導書の音（book）は、魔導書の枠が浮かび始める59.4秒に戦いの中で鳴るので、とどめの最後に入る。
 */
const 鳴る音=[
  // 一回目（0〜30秒）
  'trace','chant','build','complete','release','impact','settle',
  // 防御（30〜56秒）。命中ではなく、盾で受ける音になる。
  'chant','build','complete','release','block','settle',
  // とどめ（56〜90秒）
  'chant','build','complete','release','impact','finish',
  'collapse-sword','collapse-knee','collapse-fall','settle','book',
];

test('騎士が被弾して構えを戻し、効果音を鳴らして消音できる',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    const probe={peak:0,rms:0,recorders:[] as MediaRecorder[],chunks:[] as Blob[]};
    (window as any).__soundProbe=probe;
    const connect=AudioNode.prototype.connect;
    AudioNode.prototype.connect=function(destination:any,...args:any[]):any {
      if(destination===this.context.destination) {
        const analyser=this.context.createAnalyser();analyser.fftSize=2048;
        (connect as any).call(this,analyser);(connect as any).call(analyser,destination);
        const ctx=this.context as AudioContext,capture=ctx.createMediaStreamDestination();
        (connect as any).call(analyser,capture);
        const recorder=new MediaRecorder(capture.stream);recorder.ondataavailable=e=>{if(e.data.size)probe.chunks.push(e.data);};recorder.start();probe.recorders.push(recorder);
        const data=new Float32Array(2048);
        setInterval(()=>{analyser.getFloatTimeDomainData(data);let sum=0;for(const value of data){probe.peak=Math.max(probe.peak,Math.abs(value));sum+=value*value;}probe.rms=Math.sqrt(sum/data.length);},20);
        return destination;
      }
      return (connect as any).call(this,destination,...args);
    };
  });
  await page.goto('/?dev=1');await page.locator('.sound-settings summary').click();await page.locator('#test-sound').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__soundProbe.peak)).toBeGreaterThan(.001);
  await page.locator('#use-sound').uncheck();
  await expect.poll(()=>page.evaluate(()=>(window as any).__soundProbe.rms)).toBeLessThan(.00001);
  await expect(page.locator('#test-sound')).toBeDisabled();
  await page.locator('#use-sound').check();await page.locator('#start').click();await expect(page.locator('#countdown')).toBeHidden({timeout:15000});
  await page.locator('#chant').fill('雷よ、七つに分かれろ');
  await expect(page.locator('#knight')).toHaveAttribute('data-state','idle');
  await expect(page.locator('#knight')).toHaveAttribute('data-state','hit',{timeout:27000});
  await page.screenshot({path:'test-results/knight-hit.png'});
  await expect(page.locator('#knight')).toHaveAttribute('data-state','recover');
  await page.screenshot({path:'test-results/knight-recover.png'});
  // とどめの回まで進むので、結果画面は本編90秒で出る。ここは命中して構えを戻した約25秒から待つので、残り65秒に余裕を足す。
  await expect(page.locator('#result')).toBeVisible({timeout:85000});
  await page.locator('#record').click();const report=JSON.parse(await page.locator('#sheet-body pre').innerText());
  expect(report.audio.activeSources).toBe(0);
  expect(report.audio.events.map((e:{name:string})=>e.name)).toEqual(鳴る音);
  const measured=await page.evaluate(()=>({peak:(window as any).__soundProbe.peak,rms:(window as any).__soundProbe.rms}));
  expect(measured.peak).toBeGreaterThan(.01);expect(measured.peak).toBeLessThan(.98);
  await writeFile('.local-speech/knight-audio-report.json',JSON.stringify({audio:report.audio,measurement:report.measurement,output:measured},null,2));
  const bytes=await page.evaluate(async()=>{
    const probe=(window as any).__soundProbe;
    await Promise.all(probe.recorders.map((recorder:MediaRecorder)=>new Promise<void>(resolve=>{recorder.onstop=()=>resolve();recorder.stop();})));
    return Array.from(new Uint8Array(await new Blob(probe.chunks,{type:'audio/webm'}).arrayBuffer()));
  });
  await writeFile('.local-speech/knight-audio-preview.webm',Buffer.from(bytes));
  await page.locator('#sheet-close').click();await page.evaluate(()=>{(window as any).__soundProbe.peak=0;});await page.locator('#again').click();
  await expect(page.locator('#step-input')).toHaveClass('active');
  await expect.poll(()=>page.evaluate(()=>(window as any).__soundProbe.peak),{timeout:9000,intervals:[50]}).toBeGreaterThan(.0001);
  await page.locator('#sound-toggle').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__soundProbe.rms)).toBeLessThan(.00001);
  await page.evaluate(()=>{(window as any).__soundProbe.peak=0;});await page.locator('#sound-toggle').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__soundProbe.peak),{timeout:6500,intervals:[50]}).toBeGreaterThan(.0001);
  await page.locator('#cancel').click();await expect(page.locator('#welcome')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as any).__soundProbe.rms),{timeout:1500,intervals:[20]}).toBeLessThan(.00001); // 中止時は曲を0.35秒かけて絞る
  expect(errors).toEqual([]);
});
