import { test,expect } from '@playwright/test';
import { FINAL_BLOW_MS } from '../../src/game/rounds';

/**
 * 見本の自動再生と、とどめの回の体力と崩れ落ちを、一本の通しで見る。
 * 誰も触らないと見本が始まり、90秒の終わりに体力が0になり、騎士が倒れきる。触ると止まってタイトルへ戻る。
 * 最後に、ボタンから始めた見本を中止ボタンで止められることも見る。
 * この環境のブラウザーは1秒に1コマしか描けないので、見た目の細かさは見ない。
 */
test('誰も触らないと見本が流れ、体力が0になって騎士が倒れきり、触ると止まってタイトルへ戻る',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await expect(page.locator('#start')).toBeVisible();await expect(page.locator('#loading')).toBeHidden();
  // 30秒動きがなければ自動で始まる。通りすがりの人へ、何をする遊びかを見せるため。
  await expect(page.locator('#demo-tag')).toBeVisible({timeout:45000});
  await expect(page.locator('#hud')).toBeVisible();
  // とどめの一撃で体力が0になる。見本には準備の合図が無いので、始まってからとどめの一撃までに余裕を足して待つ。
  // Chromeは '0.00%' と書いても読み返すと '0%' にそろえるので、数として0かどうかを見る。
  await expect.poll(()=>page.locator('#health').evaluate(bar=>parseFloat((bar as HTMLElement).style.height)),{timeout:FINAL_BLOW_MS+15000})
    .toBe(0);
  await page.screenshot({path:'test-results/finish-01-zero.png'});
  // 体力の枠は名前ごと消す。消したら戻さない。
  await expect(page.locator('.enemy-health')).toHaveAttribute('data-gone','1',{timeout:8000});
  // 騎士は膝をついてから手前へ倒れ、倒れきると down になる。
  await expect(page.locator('#knight')).toHaveAttribute('data-state','down',{timeout:10000});
  await page.screenshot({path:'test-results/finish-02-down.png'});
  // 見本の途中で誰かが触ったら、すぐ止めてタイトルへ戻す。結果の後に自分で戻ったのと取り違えないよう、まだ途中なのを確かめてから触る。
  expect(await page.locator('#result').isHidden(),'倒れきったあと、結果が出る前に触る').toBe(true);
  await page.mouse.click(700,500);
  await expect(page.locator('#welcome')).toBeVisible();
  await expect(page.locator('#hud')).toBeHidden();
  // 「見本の動きを見る」からも始められ、中止ボタンで止められる。
  await page.locator('#demo').click();await expect(page.locator('#demo-tag')).toBeVisible();
  await page.locator('#cancel').click();await expect(page.locator('#welcome')).toBeVisible();await expect(page.locator('#hud')).toBeHidden();
  expect(errors).toEqual([]);
});
