import { test,expect } from '@playwright/test';
// かなの難語を漢字へ直すことは、単体の chant-dictionary.test.ts で見ている。ここは一覧の画面だけを見る。
test('詠唱の言葉と読みを一番上から見せ、閉じると元のボタンへ戻る',async({page})=>{
  await page.goto('/?dev=1');await page.locator('#chant-words').click();
  await expect(page.locator('#sheet-title')).toHaveText('詠唱の言葉');
  await expect(page.locator('#sheet-body')).toContainText('雷霆（らいてい）');
  await expect(page.locator('#sheet-body')).toContainText('領域展開（りょういきてんかい）');
  expect(await page.locator('#sheet-body').evaluate(el=>el.closest('.status-content')!.scrollTop)).toBe(0);
  await page.screenshot({path:'test-results/chant-words.png'});
  await page.locator('#sheet-close').click();await expect(page.locator('#chant-words')).toBeFocused();
});
