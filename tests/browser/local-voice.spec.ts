import { test,expect,chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { ROUNDS } from '../../src/game/rounds';
import { 中止して記録を読む,防御の回まで待つ } from './cancel-record';

test('PC内の実際の認識処理で最後の声を取り込み、描いた線と一緒に発動する',async()=>{
  test.skip(!existsSync('.local-speech/test-audio/browser-seven.wav'),'npm run test:speech と node scripts/prepare-browser-audio.mjs で確認用の音を用意');
  const gpuArgs=process.platform==='win32'?['--use-angle=d3d11']:[];
  const browser=await chromium.launch({channel:'chromium',headless:true,args:[
    ...gpuArgs,'--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${resolve('.local-speech/test-audio/browser-seven.wav')}`,
  ]});
  try {
    const context=await browser.newContext({viewport:{width:1440,height:900},permissions:['microphone']});
    const page=await context.newPage();const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    const outsideAudio:string[]=[];
    page.on('websocket',socket=>{if(!socket.url().startsWith('ws://127.0.0.1:5173/'))outsideAudio.push(socket.url());});
    await page.goto('http://127.0.0.1:5173/?dev=1&flow=together');
    await expect(page.locator('#use-voice')).toBeEnabled({timeout:15000});await expect(page.locator('#privacy')).toContainText('このPCの中だけ');
    await page.locator('#use-voice').check();await page.locator('#start').click();
    // マイクと音声認識のつなぎ込みが終わってから3秒の合図が出るので、まず合図の画面を待つ。
    await expect(page.locator('#hud')).toBeVisible({timeout:30000});await expect(page.locator('#countdown')).toBeHidden({timeout:15000});
    await page.mouse.move(500,420);await page.mouse.down();
    for(let i=0;i<18;i++){await page.mouse.move(620+Math.sin(i/4)*140,420+Math.cos(i/4)*120);await page.waitForTimeout(30);}
    await page.mouse.up();await expect(page.locator('#instruction')).toHaveText('描きながら、詠唱せよ',{timeout:17000});
    // 声は受付の17.3秒まで続く。線も同じところまで描き、締め切りの手前まで両方を受け付けているか見る。
    // コマ数ではなく時計で測る。遅いPCでコマ送りが重くなっても、締め切りを大きく過ぎない。
    const 描き終わり=Date.now()+(ROUNDS[0].inputEnd-ROUNDS[0].chant!);
    await page.mouse.move(540,480);await page.mouse.down();
    for(let i=0;Date.now()<描き終わり;i++){await page.mouse.move(540+Math.sin(i/7)*120,400+Math.cos(i/7)*110);await page.waitForTimeout(100);}
    await page.mouse.up();
    // 見るのは一回目だけなので、90秒の終わりまでは待たない。防御の回に入ったところで中止して記録を読む。
    await 防御の回まで待つ(page);await page.screenshot({path:'test-results/local-voice-first.png'});
    const report=await 中止して記録を読む(page);
    const first=report.rounds[0];
    // 落ちたときに何を聞き取ったかが分かるよう、魔法を確かめる前に一回目の聞き取りを出す。
    console.log('一回目の聞き取り:',JSON.stringify(first.speechEntries.map((e:{text:string;final:boolean;endMs:number})=>({text:e.text,final:e.final,endMs:e.endMs}))),'確定の文:',first.state?.speech?.rawTranscript,'魔法:',first.recipe?.name);
    // 声を文字にして使ったこと（文字で入れたのではないこと）は、聞き取りの状態 recognized で見る。
    expect(first.recipe.name).toContain('7つの雷の連弾');
    expect(first.state.speech.status).toBe('recognized');expect(first.state.speech.provider).toBe('local');
    // 合成した声は受付の17.3秒（締め切りの0.7秒前）に終わる。scripts/prepare-browser-audio.mjs の END_MS と合わせてある。
    expect(first.speechEntries[0].final).toBe(true);expect(first.speechEntries[0].endMs).toBeGreaterThan(ROUNDS[0].inputEnd-2000);
    expect(first.rawPoints.at(-1).t).toBeGreaterThan(ROUNDS[0].inputEnd-1000);expect(first.recipe.count).toBe(7);
    expect(report.audio.recordingQuiet).toBe(false);
    expect(report.audio.events.some((e:{name:string;atMs:number})=>e.name==='step'&&e.atMs<ROUNDS[0].inputEnd)).toBe(true);
    expect(report.audio.events.some((e:{name:string})=>e.name==='clang')).toBe(true);
    expect(report.audio.events.some((e:{name:string})=>e.name==='impact')).toBe(true);
    expect(first.events.find((e:{name:string})=>e.name==='release').observedMs).toBeLessThan(ROUNDS[0].release+250);
    expect(errors).toEqual([]);expect(outsideAudio).toEqual([]);
    await writeFile('.local-speech/browser-test-report.json',JSON.stringify(report,null,2));
  }finally{await browser.close();}
});
