import { test,expect } from '@playwright/test';

test('最初の24秒を最後まで遊び、線と七つの雷を記録できる',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden();await page.screenshot({path:'test-results/01-ready.png'});
  await page.locator('#start').click();await expect(page.locator('#hud')).toBeVisible();
  await page.locator('#chant').fill('雷よ、七つに分かれろ');
  await page.mouse.move(460,450);await page.mouse.down();
  for(let i=0;i<60;i++){await page.mouse.move(650+Math.sin(i/10)*190,420+Math.cos(i/10)*120);await page.waitForTimeout(35);}
  await page.mouse.up();await page.waitForTimeout(1700);
  await page.mouse.move(720,460);await page.mouse.down();await page.mouse.move(840,330,{steps:24});await page.mouse.up();
  await expect(page.locator('#instruction')).toHaveText('そのまま、描き足して',{timeout:7000});await page.screenshot({path:'test-results/02-drawing.png'});
  await expect(page.locator('#instruction')).toHaveText('描きながら、言葉を添えて',{timeout:7000});
  await page.mouse.move(550,480);await page.mouse.down();await page.mouse.move(580,300,{steps:15});await page.mouse.up();
  await expect(page.locator('#step-complete')).toHaveClass('active',{timeout:5000});await page.screenshot({path:'test-results/03-complete.png'});
  await expect(page.locator('#step-release')).toHaveClass('active',{timeout:4500});await page.waitForTimeout(650);await page.screenshot({path:'test-results/04-release.png'});
  await expect(page.locator('#result')).toBeVisible({timeout:9000});await expect(page.locator('#spell-name')).toHaveText('7つの雷の連弾');
  await expect(page.locator('#transcript')).toContainText('文字で入力');await page.screenshot({path:'test-results/05-result.png'});
  await page.locator('[data-feedback="yes"]').click();await page.locator('#record').click();
  const record=JSON.parse(await page.locator('#sheet-body pre').innerText());
  expect(record.rawPoints.length).toBeGreaterThan(50);expect(record.rawPoints.at(-1).t).toBeGreaterThan(11000);expect(record.recipe.count).toBe(7);
  expect(record.events.find((e:{name:string})=>e.name==='recipe-locked').observedMs).toBeLessThan(16250);
  expect(record.feedback).toBe('yes');expect(errors).toEqual([]);
});

test('遅いJevの回答は使わず、本人の氷の壁で時刻どおり発動する',async({page})=>{
  await page.route('**/api/interpret',async route=>{
    const s=route.request().postDataJSON();await new Promise(resolve=>setTimeout(resolve,3000));
    await route.fulfill({json:{sessionId:s.sessionId,castId:s.castId,inputRevision:s.inputRevision,status:'ok',answers:{element:{type:'choice',choice:'fire',probabilities:{fire:1}}}}}).catch(()=>{});
  });
  await page.goto('/');await page.locator('#start').click();await page.locator('#chant').fill('雷ではなく氷よ、壁となれ');
  await expect(page.locator('#step-release')).toHaveClass('active',{timeout:20000});
  await expect(page.locator('#result')).toBeVisible({timeout:9000});await expect(page.locator('#spell-name')).toHaveText('氷の壁');
  await page.locator('#record').click();const record=JSON.parse(await page.locator('#sheet-body pre').innerText());
  expect(record.recipe.source).toBe('local');expect(record.recipe.purpose).toBe('defend');expect(record.recipe.assistance).toContain('動きがないため中央の光点を使用');
});

test('カメラの認識を別の処理場所で準備し、中止すると解放する',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await page.locator('input[value="camera"]').check();await page.locator('#start').click();
  await expect(page.locator('#hud')).toBeVisible({timeout:30000});await page.waitForTimeout(1500);await page.locator('#cancel').click();
  await expect(page.locator('#welcome')).toBeVisible();expect(errors).toEqual([]);
});

test('見本は本人の入力と区別され、途中で中止できる',async({page})=>{
  await page.goto('/');await page.locator('#demo').click();await expect(page.locator('#demo-tag')).toBeVisible();
  await page.waitForTimeout(1000);await page.locator('#cancel').click();await expect(page.locator('#welcome')).toBeVisible();await expect(page.locator('#hud')).toBeHidden();
});

test('Jevの期限内の回答で曖昧な言葉を反映し、発動時刻は早めない',async({page})=>{
  let requested=false;
  await page.route('**/api/interpret',async route=>{
    requested=true;const s=route.request().postDataJSON();
    expect(s.speech.rawTranscript).toBe('冬の静けさよ、前に立て');
    await route.fulfill({json:{sessionId:s.sessionId,castId:s.castId,inputRevision:s.inputRevision,status:'ok',model:'browser-test',answers:{
      element:{type:'choice',choice:'ice',probabilities:{ice:.9,unknown:.1}},form:{type:'choice',choice:'wall',probabilities:{wall:.9,orb:.1}},purpose:{type:'choice',choice:'defend',probabilities:{defend:.9,unknown:.1}},
    }}});
  });
  await page.goto('/');await page.locator('#start').click();await page.locator('#chant').fill('冬の静けさよ、前に立て');
  await expect(page.locator('#recognized')).toBeVisible({timeout:18000});await expect(page.locator('#step-complete')).toHaveClass('active');
  await expect(page.locator('#result')).toBeVisible({timeout:11000});await expect(page.locator('#spell-name')).toHaveText('氷の壁');
  await page.locator('#record').click();const record=JSON.parse(await page.locator('#sheet-body pre').innerText());
  expect(requested).toBe(true);expect(record.recipe.decisions.element.source).toBe('jev');expect(record.recipe.model).toBe('browser-test');
  expect(record.events.find((e:{name:string})=>e.name==='release').observedMs).toBeGreaterThanOrEqual(17000);
});
