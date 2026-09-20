import { test,expect,type Page } from '@playwright/test';

// 画面に出る文字の四角形を集め、親子でない組み合わせが重なっていないか確かめる。
const watched='#timer,.trial,.brand-name,.eyebrow,.chapter,.intro,.privacy,#notice,.mode-options,.voice-option,.sound-options,#start,.welcome-actions,.enemy-health,#cancel,#sound-toggle,#service-notice,#demo-tag,#voice-label,#input-panel,.bottom-hud,#recognized,#result,#result-spell,.feedback,.report-actions';
const overlaps=(page:Page,where:string)=>page.evaluate(([sel,label])=>{
  const name=(n:Element)=>(n.id?'#'+n.id:'.'+String(n.className).split(' ')[0]);
  const shown=[...document.querySelectorAll(sel)].filter(n=>{
    const style=getComputedStyle(n),box=n.getBoundingClientRect();
    return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)>0&&!n.closest('[hidden]')&&box.width>2&&box.height>2;
  });
  const found:string[]=[];
  for(let i=0;i<shown.length;i++)for(let j=i+1;j<shown.length;j++) {
    const a=shown[i],b=shown[j];
    if(a.contains(b)||b.contains(a))continue;
    const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();
    if(x.left<y.right&&y.left<x.right&&x.top<y.bottom&&y.top<x.bottom)
      found.push(`${label}：${name(a)}と${name(b)}が重なっている`);
  }
  return found;
},[watched,where] as const);

async function playThrough(page:Page,where:string) {
  const found:string[]=[];
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#start').click();await expect(page.locator('#hud')).toBeVisible();
  await page.mouse.move(420,400);await page.mouse.down();await page.mouse.move(700,520,{steps:20});await page.mouse.up();
  // 描いている間から余韻まで、1秒ごとに見る。描画が遅い環境でも取りこぼさない。
  for(let i=0;i<26&&await page.locator('#result').isHidden();i++) {
    found.push(...await overlaps(page,`${where}・${await page.locator('#timer').innerText()}`));
    await page.waitForTimeout(1000);
  }
  await expect(page.locator('#result')).toBeVisible({timeout:12000});
  found.push(...await overlaps(page,`${where}・結果`));
  return [...new Set(found)];
}

test('開始前の画面は、どの大きさでも文字が重ならない',async({page})=>{
  const found:string[]=[];
  for(const size of [{width:1920,height:1080},{width:1440,height:900},{width:1280,height:800},{width:1280,height:720},{width:1024,height:768},{width:390,height:844}]) {
    await page.setViewportSize(size);
    await page.goto('/');await expect(page.locator('#loading')).toBeHidden();
    found.push(...await overlaps(page,`${size.width}×${size.height}`));
    const bottom=await page.locator('#privacy').evaluate(n=>n.getBoundingClientRect().bottom);
    expect(bottom,`${size.width}×${size.height}で説明文が画面からはみ出す`).toBeLessThanOrEqual(size.height);
  }
  expect(found).toEqual([]);
});

test('プレイ中と結果の画面で文字が重ならない（横長）',async({page})=>{
  expect(await playThrough(page,'1440×900')).toEqual([]);
});

test('プレイ中と結果の画面で文字が重ならない（縦長）',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  expect(await playThrough(page,'390×844')).toEqual([]);
});

test('遊ぶ人の画面には確認用の表示を出さない',async({page})=>{
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden();
  for(const target of ['.trial','#settings','.dev-only'])await expect(page.locator(target).first()).toBeHidden();
  await page.locator('#start').click();await expect(page.locator('#timer')).toContainText('のこり');
  await expect(page.locator('#result')).toBeVisible({timeout:32000});
  await expect(page.locator('.report-actions')).toBeHidden();await expect(page.locator('#feedback')).toBeHidden();
  await page.goto('/?dev=1');await expect(page.locator('.trial')).toBeVisible();await expect(page.locator('#settings')).toBeVisible();
});
