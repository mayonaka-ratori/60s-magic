import { test,expect } from '@playwright/test';
test('詠唱の言葉と読みを見て、かなの難語から雷を発動する',async({page})=>{
  await page.goto('/');await page.locator('#chant-words').click();
  await expect(page.locator('#sheet-title')).toHaveText('詠唱の言葉');
  await expect(page.locator('#sheet-body')).toContainText('雷霆（らいてい）');
  await expect(page.locator('#sheet-body')).toContainText('領域展開（りょういきてんかい）');
  expect(await page.locator('#sheet-body').evaluate(el=>el.closest('.status-content')!.scrollTop)).toBe(0);
  await page.screenshot({path:'test-results/chant-words.png'});
  await page.locator('#sheet-close').click();await expect(page.locator('#chant-words')).toBeFocused();
  await page.locator('#start').click();await page.locator('#chant').fill('らいていよ、七つに分かれろ');
  await expect(page.locator('#result')).toBeVisible({timeout:28000});
  await expect(page.locator('#spell-name')).toHaveText('7つの雷の連弾');
  await page.locator('#record').click();const report=JSON.parse(await page.locator('#sheet-body pre').innerText());
  expect(report.state.speech.rawTranscript).toBe('らいていよ、七つに分かれろ');
  expect(report.state.speech.normalizedTranscript).toBe('雷霆よ、七つに分かれろ');
});
