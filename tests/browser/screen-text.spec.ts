import { test,expect,type Page } from '@playwright/test';

// 画面に出る文字の四角形を集め、親子でない組み合わせが重なっていないか確かめる。
const watched='#timer,.trial,.brand-name,.eyebrow,.chapter,.intro,.privacy,#notice,.mode-options,.voice-option,.sound-options,#start,.welcome-actions,.enemy-health,#cancel,#sound-toggle,#calm-toggle,#service-notice,#demo-tag,#voice-label,#input-panel,.bottom-hud,#recognized,#result,#result-spell,.feedback,.report-actions';
const overlaps=(page:Page,where:string)=>page.evaluate(([sel,label])=>{
  const name=(n:Element)=>(n.id?'#'+n.id:'.'+String(n.className).split(' ')[0]);
  const shown=[...document.querySelectorAll(sel)].filter(n=>{
    const style=getComputedStyle(n),box=n.getBoundingClientRect();
    // たたんだ details の中身は見えないが、四角形だけは残るので外す。
    return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)>0
      &&!n.closest('[hidden]')&&!n.closest('details:not([open])')&&box.width>2&&box.height>2;
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
  // 始めたら時計が出る。合図が消えてから出るので、合図の3秒ぶんを待てる長さにする。
  await expect(page.locator('#timer')).toContainText('のこり',{timeout:15000});
  // 描いている間から余韻まで、1秒ごとに見る。描画が遅い環境でも取りこぼさない。
  for(let i=0;i<74&&await page.locator('#result').isHidden();i++) {
    found.push(...await overlaps(page,`${where}・${await page.locator('#timer').innerText()}`));
    await page.waitForTimeout(1000);
  }
  // 上の繰り返しは最短でも74秒見張る。本編90秒の残りを待ちきれるよう、ここは余裕を持たせる。
  await expect(page.locator('#result')).toBeVisible({timeout:30000});
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

test('プレイ中と結果の画面で文字が重ならず、確認用の表示も出ない（横長）',async({page})=>{
  expect(await playThrough(page,'1440×900')).toEqual([]);
  // 遊ぶ人の画面では、結果になっても確認用の表示を出さない。
  // ここは `/` を最後まで通したあとなので、専用の通しを別に持たなくてよい。
  await expect(page.locator('.report-actions')).toBeHidden();
  await expect(page.locator('#feedback')).toBeHidden();
});

test('プレイ中と結果の画面で文字が重ならない（縦長）',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  expect(await playThrough(page,'390×844')).toEqual([]);
});

test.describe('このPCの「動きを減らす」設定',()=>{
  test.use({reducedMotion:'reduce'});
  test('控えめから始まるが、演出を派手にするボタンはいつでも押せる',async({page})=>{
    await page.goto('/');await expect(page.locator('#loading')).toBeHidden();
    await page.locator('.sound-settings summary').click();
    const button=page.locator('#calm-option');
    await expect(button).toHaveText('演出を派手にする');
    await expect(button).toBeEnabled();
    await expect(page.locator('body')).toHaveAttribute('data-calm','on');
    await button.click();
    await expect(button).toHaveText('演出を控えめにする');
    await expect(page.locator('body')).toHaveAttribute('data-calm','off');
    // 選んだほうは覚えていて、開き直しても派手のまま。
    await page.reload();await expect(page.locator('#loading')).toBeHidden();
    await expect(page.locator('body')).toHaveAttribute('data-calm','off');
  });
});

test('確認用の表示は、遊ぶ人には出さず ?dev=1 でだけ出す',async({page})=>{
  // 始めたときの時計と、結果の画面での確認は、上の横長の通しで見ている。ここは90秒を通さない。
  await page.goto('/');await expect(page.locator('#loading')).toBeHidden();
  for(const target of ['.trial','#settings','.dev-only'])await expect(page.locator(target).first()).toBeHidden();
  await page.goto('/?dev=1');await expect(page.locator('.trial')).toBeVisible();await expect(page.locator('#settings')).toBeVisible();
});

test('1920×1080で、案内の文字が決めた大きさを下回らない',async({page})=>{
  // Xboxの指針は1080pで最小28px、設計仕様は操作指示を36〜44pxとしている。
  // 過去に上書きの24px指定が clamp を打ち消していたので、ここで見張る。
  await page.setViewportSize({width:1920,height:1080});
  await page.goto('/');await expect(page.locator('#start')).toBeVisible();await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#start').click();await expect(page.locator('#bottom-hud')).toBeVisible();
  const 下限:Record<string,number>={'#instruction':36,'#hint':16,'.steps span':16,'.enemy-health':20,'#timer b':30,'#timer small':15,'#cancel':14,'.input-panel label':15};
  for(const [target,min] of Object.entries(下限)) {
    const size=await page.evaluate(sel=>{const n=document.querySelector(sel);return n?parseFloat(getComputedStyle(n).fontSize):NaN;},target);
    expect(size,`${target}の文字が${min}pxより小さい`).toBeGreaterThanOrEqual(min);
  }
  await expect(page.locator('#instruction')).toHaveText('押したまま、自由に描こう');
  const 行数=await page.locator('#instruction').evaluate(n=>{const range=document.createRange();range.selectNodeContents(n);return range.getClientRects().length;});
  expect(行数,'見出しが折り返している').toBe(1);
});

test('締め切りが近づくと知らせ、発動では魔法名を大きく出す',async({page})=>{
  await page.goto('/');await expect(page.locator('#start')).toBeVisible();await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#start').click();await expect(page.locator('#hud')).toBeVisible();
  await page.locator('#chant').fill('雷よ、七つに分かれろ');
  // 描画が遅い環境でも取りこぼさないよう、1秒ごとに見て、出たものを集める。
  const 見たもの=new Set<string>();
  // 一回目と防御の回を合わせて56秒あるので、結果が出るまで最長80回（約76秒）見続ける。
  for(let i=0;i<80&&await page.locator('#result').isHidden();i++) {
    const いま=await page.evaluate(()=>({
      段階:document.getElementById('app')!.dataset.deadline??'',
      時計:!(document.getElementById('timer') as HTMLElement).hidden,
      光:parseFloat(getComputedStyle(document.getElementById('deadline')!).opacity),
      名前:(document.getElementById('reveal') as HTMLElement).hidden?'':document.getElementById('reveal-name')!.textContent??'',
      案内:!(document.getElementById('bottom-hud') as HTMLElement).hidden,
    }));
    if(いま.段階)見たもの.add(`段階:${いま.段階}`);
    if(いま.光>.05)見たもの.add('外周の光');
    if(!いま.時計)見たもの.add('締め切り後は時計を消す');
    if(いま.名前)見たもの.add(`魔法名:${いま.名前}`);
    if(いま.名前&&!いま.案内)見たもの.add('発動中は案内を閉じる');
    await page.waitForTimeout(900);
  }
  for(const 期待 of ['段階:soon','段階:urgent','外周の光','締め切り後は時計を消す','魔法名:7つの雷の連弾','発動中は案内を閉じる'])
    expect([...見たもの],`${期待}を見ていない`).toContain(期待);
  await expect(page.locator('#result')).toBeVisible({timeout:26000});
  await page.waitForTimeout(1500);
  await expect(page.locator('#result')).not.toHaveClass(/name-only/);
  await expect(page.locator('#again')).toBeVisible();
});
