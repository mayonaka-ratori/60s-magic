import { test,expect,chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';

test('PC内の実際の認識処理で最後の声を取り込み、描いた線と一緒に発動する',async()=>{
  test.skip(!existsSync('.local-speech/test-audio/browser-seven.wav'),'npm run test:speech と node scripts/prepare-browser-audio.mjs で確認用の音を用意');
  const browser=await chromium.launch({channel:'chromium',headless:true,args:[
    '--use-angle=d3d11','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${resolve('.local-speech/test-audio/browser-seven.wav')}`,
  ]});
  try {
    const context=await browser.newContext({viewport:{width:1440,height:900},permissions:['microphone']});
    const page=await context.newPage();const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    const outsideAudio:string[]=[];
    page.on('websocket',socket=>{if(!socket.url().startsWith('ws://127.0.0.1:5173/'))outsideAudio.push(socket.url());});
    await page.goto('http://127.0.0.1:5173/');
    await expect(page.locator('#use-voice')).toBeEnabled({timeout:15000});await expect(page.locator('#privacy')).toContainText('音声もこのPC内');
    await page.locator('#use-voice').check();await page.locator('#start').click();await expect(page.locator('#hud')).toBeVisible();
    await page.mouse.move(500,420);await page.mouse.down();
    for(let i=0;i<18;i++){await page.mouse.move(620+Math.sin(i/4)*140,420+Math.cos(i/4)*120);await page.waitForTimeout(30);}
    await page.mouse.up();await expect(page.locator('#instruction')).toHaveText('描きながら、詠唱せよ',{timeout:13000});
    await page.mouse.move(540,480);await page.mouse.down();await page.mouse.move(610,320,{steps:12});await page.mouse.up();
    await expect(page.locator('#result')).toBeVisible({timeout:16000});await expect(page.locator('#spell-name')).toHaveText('7つの雷の連弾');
    await expect(page.locator('#transcript')).not.toContainText('文字で入力');await page.locator('#record').click();
    const report=JSON.parse(await page.locator('#sheet-body pre').innerText());
    expect(report.state.speech.status).toBe('recognized');expect(report.state.speech.provider).toBe('local');
    expect(report.speechEntries[0].final).toBe(true);expect(report.speechEntries[0].endMs).toBeGreaterThan(12000);
    expect(report.rawPoints.at(-1).t).toBeGreaterThan(11000);expect(report.recipe.count).toBe(7);
    expect(report.audio.recordingQuiet).toBe(true);
    expect(report.audio.events.every((e:{atMs:number})=>e.atMs>=14750)).toBe(true);
    expect(report.audio.events.some((e:{name:string})=>e.name==='impact')).toBe(true);
    expect(report.events.find((e:{name:string})=>e.name==='release').observedMs).toBeLessThan(17250);
    expect(errors).toEqual([]);expect(outsideAudio).toEqual([]);
    await writeFile('.local-speech/browser-test-report.json',JSON.stringify(report,null,2));
    await page.locator('#sheet-close').click();await page.screenshot({path:'test-results/local-voice-result.png'});
  }finally{await browser.close();}
});
