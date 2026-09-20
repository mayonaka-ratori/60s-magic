import { expect, test } from '@playwright/test';

test('手の認識をGPUで動かし、使えないPCではCPUへ戻して続ける',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const worker=new Worker('/hand-worker.js');
    const send=(message:Record<string,unknown>,transfer?:Transferable[])=>
      new Promise<Record<string,unknown>>((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('手の認識が時間内に終わりませんでした')),40000);
        worker.onmessage=({data})=>{
          if(data.type==='delegate')return;// CPUへ戻した知らせ。次の返事を待つ。
          clearTimeout(timer);resolve(data);
        };
        worker.postMessage(message,transfer??[]);
      });
    const ready=await send({type:'init'});
    // 手が写っていない一コマでも、認識そのものは動く。
    const canvas=new OffscreenCanvas(640,480);
    const context=canvas.getContext('2d')!;
    context.fillStyle='#808080';context.fillRect(0,0,640,480);
    const bitmap=canvas.transferToImageBitmap();
    const frame=await send({type:'frame',bitmap,timestamp:performance.now()},[bitmap]);
    worker.terminate();
    return {ready,frame};
  });
  console.log('手の認識:',JSON.stringify(result));
  expect(result.ready).toMatchObject({type:'ready'});
  expect(['GPU','CPU']).toContain(result.ready.delegate);
  expect(result.frame).toMatchObject({type:'hands'});
  expect(Array.isArray(result.frame.palms)).toBe(true);
  expect(typeof result.frame.detectMs).toBe('number');
});
