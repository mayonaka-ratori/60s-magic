import { test,expect } from '@playwright/test';

// 見本の自動再生は finish-knight.spec.ts、結果のまま放っておいたときと体力と詠唱の例は screen-text.spec.ts の90秒の通しで見る。
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
