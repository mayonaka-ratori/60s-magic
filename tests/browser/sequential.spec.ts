import { test, expect } from '@playwright/test';
import { SEQUENTIAL_ROUNDS as rounds, windowMsOf } from '../../src/game/rounds';

const status={jev:false,speech:true,handModel:false,model:'',speechProvider:'local',localSpeech:{state:'ready',message:'試験用の受け皿',model:'試験用',device:'cpu'}};

test('遊び方を切り替えると読み込み直し、マイクを外すと同時に戻る',async({page})=>{
  await page.route('**/api/status',route=>route.fulfill({json:status}));
  await page.goto('/?dev=1');await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#app')).toHaveAttribute('data-flow','sequential');
  await page.locator('input[name="flow"][value="together"]').check();
  await expect(page).toHaveURL(/flow=together/);
  await expect(page.locator('#app')).toHaveAttribute('data-flow','together');
  await page.locator('input[name="flow"][value="sequential"]').check();
  await expect(page.locator('#app')).toHaveAttribute('data-flow','sequential');
  await page.locator('#use-voice').uncheck();
  await expect(page).toHaveURL(/flow=together/);
  await expect(page.locator('input[name="flow"][value="sequential"]')).toBeDisabled();
  await expect(page.locator('#notice')).toContainText('同時に');
});

test('順番に90秒を通し、合図と受付を確認する（認識の返事は試験用）',async({page})=>{
  const errors:string[]=[],connections:Array<{sessionId:string;windowMs:number}>=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/status',route=>route.fulfill({json:status}));
  await page.route('**/api/interpret',route=>{
    const state=route.request().postDataJSON();
    return route.fulfill({json:{sessionId:state.sessionId,castId:state.castId,inputRevision:state.inputRevision,status:'unconfigured'}});
  });
  // 音そのものは保存しない。実際の認識の速さは別の音声試験と人の声で確かめる。
  await page.routeWebSocket('**/api/speech',socket=>{
    let sessionId='',windowMs=0,heard=false,offset=0;
    socket.onMessage(data=>{
      if(typeof data!=='string') {
        if(!heard){
          heard=true;offset=data.readDoubleLE(0);
          socket.send(JSON.stringify({type:'transcript',sessionId,entry:{id:0,revision:1,startMs:offset,endMs:offset+100,text:'氷よ',final:false,stability:.9,source:'local'}}));
        }
        return;
      }
      const message=JSON.parse(data);
      if(message.type==='start'){
        sessionId=message.sessionId;windowMs=message.windowMs;connections.push({sessionId,windowMs});
        socket.send(JSON.stringify({type:'ready',sessionId,provider:'local'}));
      }
      if(message.type==='end'){
        socket.send(JSON.stringify({type:'transcript',sessionId,entry:{id:0,revision:2,startMs:offset,endMs:windowMs-1,text:'氷よ、壁となれ',final:true,stability:1,source:'local'}}));
        socket.send(JSON.stringify({type:'ended',sessionId}));
      }
    });
  });
  await page.goto('/?dev=1');await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#use-voice')).toBeEnabled();await page.locator('#start').click();
  await expect(page.locator('#act-title')).toHaveText('第一幕　詠唱を始めよう！',{timeout:15000});
  await expect(page.locator('#instruction')).toHaveText('好きな言葉を唱えよう');
  await page.mouse.move(400,400);await page.mouse.down();await page.mouse.move(700,500,{steps:20});await page.mouse.up();
  await expect(page.locator('#act-title')).toBeHidden();
  await expect(page.locator('#act-title')).toHaveText('第二幕　魔法陣を描こう！',{timeout:rounds[1].start+5000});
  await expect(page.locator('#input-panel')).toBeHidden();await expect(page.locator('#meter')).toBeHidden();
  await page.mouse.move(250,450);await page.mouse.down();await page.mouse.move(400,450,{steps:20});await page.mouse.up();
  await expect(page.locator('#act-title')).toHaveText('第三幕　魔法陣を描こう！',{timeout:rounds[1].end-rounds[1].start+5000});
  await expect(page.locator('#meter')).toBeHidden();
  await page.mouse.move(550,450);await page.mouse.down();await page.mouse.move(700,420,{steps:20});await page.mouse.up();
  await expect(page.locator('#act-title')).toHaveText('手を止めて、詠唱を始めよう！',{timeout:rounds[2].drawEnd!-rounds[2].start+5000});
  await expect(page.locator('#meter')).toBeVisible();
  expect(Number(await page.locator('#timer b').textContent())).toBeGreaterThan(0);
  expect(Number(await page.locator('#timer b').textContent())).toBeLessThanOrEqual((rounds[2].inputEnd-rounds[2].voiceStart!)/1000);
  await page.mouse.move(700,420);await page.mouse.down();await page.mouse.move(900,600,{steps:20});await page.mouse.up();
  await expect(page.locator('#result')).toBeVisible({timeout:rounds[2].end-rounds[2].drawEnd!+5000});
  await page.locator('#record').click();
  const report=JSON.parse(await page.locator('#sheet-body pre').innerText());
  expect(report.rounds[0].rawPoints).toHaveLength(0);
  expect(report.rounds[1].speechEntries).toHaveLength(0);expect(report.rounds[1].recipe.element).toBe('neutral');
  expect(report.rounds[2].rawPoints.length).toBeGreaterThan(0);
  expect(report.rounds[2].rawPoints.every((p:{t:number})=>p.t<rounds[2].drawEnd!)).toBe(true);
  expect(connections.map(c=>c.windowMs)).toEqual([windowMsOf(rounds[0]),windowMsOf(rounds[2])]);
  const starts=report.diagnostics.events.filter((e:{kind:string})=>e.kind==='録音を始めた');
  expect(starts).toHaveLength(2);
  expect(starts[1].atMs).toBeGreaterThanOrEqual(rounds[2].voiceStart!);
  expect(starts[1].detail.offsetMs).toBeGreaterThanOrEqual(rounds[2].voiceStart!-rounds[2].start);
  expect(errors).toEqual([]);
});
