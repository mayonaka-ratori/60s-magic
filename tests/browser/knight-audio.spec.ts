import { test,expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

import { BATTLE_END,ENEMY_MOVES } from '../../src/game/rounds';
import { 声を試験用の返事にする } from './cancel-record';
import { 順番に鳴る音 } from './sound-order';

test('順番に90秒を通し、効果音が決めた順に鳴り、消音と中止で止まる',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await 声を試験用の返事にする(page,'雷よ、七つに分かれろ');
  await page.addInitScript(()=>{
    const probe={peak:0,rms:0,recorders:[] as MediaRecorder[],chunks:[] as Blob[]};
    (window as any).__soundProbe=probe;
    const connect=AudioNode.prototype.connect;
    AudioNode.prototype.connect=function(destination:any,...args:any[]):any {
      // 声の取り込みは、音量0の段を通して出力へつなぐだけで音を出さない。測ると0で上書きされるので、効果音の出口だけを測る。
      if(destination===this.context.destination&&!(this instanceof GainNode&&this.gain.value===0)) {
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
  // 何も付けないURLは「順番に」。マイクを使う遊び方なので、マイクの印が付いていることも確かめる。
  await page.goto('/?dev=1');await expect(page.locator('#app')).toHaveAttribute('data-flow','sequential');
  await expect(page.locator('#use-voice')).toBeEnabled();await expect(page.locator('#use-voice')).toBeChecked();
  await page.locator('.sound-settings summary').click();await page.locator('#test-sound').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__soundProbe.peak)).toBeGreaterThan(.001);
  await page.locator('#use-sound').uncheck();
  await expect.poll(()=>page.evaluate(()=>(window as any).__soundProbe.rms)).toBeLessThan(.00001);
  await expect(page.locator('#test-sound')).toBeDisabled();
  // マイクの準備が済んでから準備の合図が出るので、合図が消えたかではなく、本編に入ったかを待つ。
  await page.locator('#use-sound').check();await page.locator('#start').click();
  await expect(page.locator('#app')).toHaveAttribute('data-screen','playing',{timeout:15000});
  // 騎士の被弾と構え直しは look.spec.ts と単体の試験で見ているので、ここでは音だけを見る。
  // 結果画面は本編90秒で出る。ここは本編の0秒ごろから待つので、90秒に余裕を足す。
  await expect(page.locator('#result')).toBeVisible({timeout:BATTLE_END+10000});
  await page.locator('#record').click();const report=JSON.parse(await page.locator('#sheet-body pre').innerText());
  expect(report.flow).toBe('sequential');
  // マイクを使ったので、声の受付の間は曲と効果音を下げる経路を通っている。終わったときには下げを戻している。
  expect(report.audio.microphone).toBe(true);expect(report.audio.ducked).toBe(false);
  expect(report.audio.activeSources).toBe(0);
  // 線を描かないので、輪を囲えた音（ring）は鳴らない。
  expect(report.audio.events.map((e:{name:string})=>e.name)).toEqual(順番に鳴る音);
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
  // もう一度始めるときも、マイクの準備と準備の合図のあとで本編に入る。声だけの一回目は、唱える段が光る。
  await expect(page.locator('#app')).toHaveAttribute('data-screen','playing',{timeout:15000});
  await expect(page.locator('#step-input')).toHaveClass('active');
  // 曲の素材が無ければ、最初に鳴るのは騎士の足踏み。本編に入ってからその時刻まで、余裕を足して待つ。
  await expect.poll(()=>page.evaluate(()=>(window as any).__soundProbe.peak),{timeout:ENEMY_MOVES[0].at+3000,intervals:[50]}).toBeGreaterThan(.0001);
  await page.locator('#sound-toggle').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__soundProbe.rms)).toBeLessThan(.00001);
  // 音を戻したあとは、曲の素材が無ければ次の盾打ちまで鳴らない。足踏みから盾打ちまでの間に余裕を足して待つ。
  await page.evaluate(()=>{(window as any).__soundProbe.peak=0;});await page.locator('#sound-toggle').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__soundProbe.peak),{timeout:ENEMY_MOVES[1].at-ENEMY_MOVES[0].at+3000,intervals:[50]}).toBeGreaterThan(.0001);
  await page.locator('#cancel').click();await expect(page.locator('#welcome')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as any).__soundProbe.rms),{timeout:1500,intervals:[20]}).toBeLessThan(.00001); // 中止時は曲を0.35秒かけて絞る
  expect(errors).toEqual([]);
});
