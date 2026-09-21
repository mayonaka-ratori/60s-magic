import { test,expect } from '@playwright/test';

test('誰も触らないと見本が自動で流れ、触ると止まってタイトルへ戻る',async({page})=>{
  await page.goto('/');await expect(page.locator('#start')).toBeVisible();await expect(page.locator('#loading')).toBeHidden();
  // 30秒動きがなければ自動で始まる。通りすがりの人へ、何をする遊びかを見せるため。
  await expect(page.locator('#demo-tag')).toBeVisible({timeout:45000});
  await expect(page.locator('#hud')).toBeVisible();
  await page.mouse.click(700,500);
  await expect(page.locator('#welcome')).toBeVisible();
  await expect(page.locator('#hud')).toBeHidden();
});

test('結果のまま誰も触らなければ、タイトルへ戻って自動再生に戻る',async({page})=>{
  // 結果は次の人の開始操作まで残すが、誰も居なくなったまま置き去りにしない。
  // 待ち時間はURLで短くできるので、ここでは短い値で流れだけを確かめる。
  await page.goto('/?attract=5&resultIdle=6');
  await expect(page.locator('#start')).toBeVisible();await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#start').click();
  // ここは開始ボタンの直後から待つ。3秒の合図と本編90秒で93秒かかるので、余裕を足して100秒待つ。
  await expect(page.locator('#result')).toBeVisible({timeout:100000});
  await expect(page.locator('#welcome')).toBeVisible({timeout:16000});
  await expect(page.locator('#demo-tag')).toBeVisible({timeout:16000});
});

test('唱える時間になると、まだ何も言っていない人に例を出す',async({page})=>{
  await page.goto('/');await expect(page.locator('#start')).toBeVisible();await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#start').click();await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#hint')).toHaveText('たとえば「雷よ、七つに分かれろ」',{timeout:26000});
});

test('もう言葉を入れた人には、詠唱の例を出さない',async({page})=>{
  await page.goto('/');await expect(page.locator('#start')).toBeVisible();await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#start').click();await expect(page.locator('#hud')).toBeVisible();
  // 締め切り前に入れる。18秒を過ぎると入力欄が閉じるので、始めてすぐ入れる。
  await page.locator('#chant').fill('氷よ、壁となれ');
  const 見たひとこと=new Set<string>();
  for(let i=0;i<26&&await page.locator('#timer').isVisible();i++) {
    見たひとこと.add(await page.locator('#hint').innerText());
    await page.waitForTimeout(700);
  }
  expect([...見たひとこと]).not.toContain('たとえば「雷よ、七つに分かれろ」');
  expect([...見たひとこと].some(t=>t.includes('好きな言葉')||t.includes('声や文字')),'ふだんのひとことは出ている').toBe(true);
});

test('当たった瞬間に体力バーが反応し、騎士に魔法の傷あとが残る',async({page})=>{
  await page.goto('/');await expect(page.locator('#start')).toBeVisible();await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#start').click();await expect(page.locator('#hud')).toBeVisible();
  const 見たもの=new Set<string>();
  // 三つとも一回目の命中（23.5秒）までに出る。出そろったら90秒の最後までは待たない。
  // 出そろわないときだけ、今までどおり最後まで見張って落とす。
  for(let i=0;i<210&&見たもの.size<3&&await page.locator('#result').isHidden();i++) {
    const いま=await page.evaluate(()=>({
      傷:(document.getElementById('knight') as HTMLElement).dataset.scar,
      反応:document.querySelector<HTMLElement>('.enemy-health')!.dataset.hit==='1',
      体力:parseFloat((document.getElementById('health') as HTMLElement).style.height||'100'),
    }));
    if(いま.傷==='1')見たもの.add('傷あと');
    if(いま.反応)見たもの.add('体力バーの反応');
    // 減る量は魔法の派手さで20〜45%変わるので、値ではなく「減ったこと」を見る。
    if(いま.体力<99.5)見たもの.add('体力が減る');
    await page.waitForTimeout(450);
  }
  for(const 期待 of ['傷あと','体力バーの反応','体力が減る'])
    expect([...見たもの],`${期待}を見ていない`).toContain(期待);
});

test('画面で読む文字はゴシック体、明朝は題字と魔法名だけにする',async({page})=>{
  await page.goto('/');await expect(page.locator('#start')).toBeVisible();await expect(page.locator('#loading')).toBeHidden();
  // 音の設定は最初たたんでおく。最初に見せるのは描き方と「魔法をつくる」。
  await expect(page.locator('#use-sound')).toBeHidden();
  await page.locator('.sound-settings summary').click();
  await expect(page.locator('#use-sound')).toBeVisible();
  await page.locator('#start').click();await expect(page.locator('#bottom-hud')).toBeVisible();
  const 書体=await page.evaluate(()=>{
    const f=(s:string)=>getComputedStyle(document.querySelector(s)!).fontFamily.replace(/"/g,'');
    return {案内:f('#instruction'),敵の名前:f('.enemy-health'),魔法名:f('#reveal span'),題字:f('.brand-name')};
  });
  expect(書体.案内,'案内はゴシック').toContain('Noto Sans JP');
  expect(書体.敵の名前,'敵の名前はゴシック').toContain('Noto Sans JP');
  expect(書体.魔法名,'魔法名は明朝のまま').toContain('Noto Serif JP');
  expect(書体.題字,'題字は明朝のまま').toContain('Noto Serif JP');
});
