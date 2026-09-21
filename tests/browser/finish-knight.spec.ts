import { test,expect } from '@playwright/test';

/**
 * とどめの回の体力と崩れ落ちだけを見る通し。
 * 遊び方は見本の自動再生に任せ、90秒の終わりに体力が0になり、騎士が倒れきっているかを確かめる。
 * この環境のブラウザーは1秒に1コマしか描けないので、見た目の細かさは見ない。
 */
test('90秒の通しで体力が0になり、騎士が倒れきる',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?dev=1');await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#demo').click();
  await expect(page.locator('#countdown')).toBeHidden({timeout:15000});
  await expect(page.locator('#hud')).toBeVisible();
  // とどめの一撃（78.5秒）で体力が0になる。
  await expect.poll(()=>page.locator('#health').evaluate(bar=>(bar as HTMLElement).style.height),{timeout:105000})
    .toBe('0.00%');
  await page.screenshot({path:'test-results/finish-01-zero.png'});
  // 体力の枠は名前ごと消す。消したら戻さない。
  await expect(page.locator('.enemy-health')).toHaveAttribute('data-gone','1',{timeout:8000});
  // 騎士は膝をついてから手前へ倒れ、倒れきると down になる。
  await expect(page.locator('#knight')).toHaveAttribute('data-state','down',{timeout:10000});
  await page.screenshot({path:'test-results/finish-02-down.png'});
  expect(errors).toEqual([]);
});
