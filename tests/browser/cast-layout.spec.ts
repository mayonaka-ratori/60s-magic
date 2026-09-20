import { test,expect } from '@playwright/test';

test('画面全体の二筆が収まり、縦画面の結果からもう一度始められる',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await page.locator('#start').click();await expect(page.locator('#countdown')).toBeHidden({timeout:15000});
  await page.mouse.move(30,200);await page.mouse.down();await page.mouse.move(1390,650,{steps:40});await page.mouse.up();
  await page.mouse.move(70,680);await page.mouse.down();await page.mouse.move(1250,160,{steps:40});await page.mouse.up();
  await expect(page.locator('#spell')).toHaveAttribute('data-scale','1.0000');
  await expect(page.locator('#step-release')).toHaveClass('active',{timeout:19000});
  expect(Number(await page.locator('#spell').getAttribute('data-scale'))).toBeLessThan(.5);
  await page.screenshot({path:'test-results/wide-cast.png'});
  await expect(page.locator('#result')).toBeVisible({timeout:46000});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/cast-mobile-result.png'});
  // 縦長の魔導書では、術式が一番上に正方形で横いっぱいに出る。
  const shape=await page.locator('#result-spell').boundingBox();
  expect(Math.round(shape!.width)).toBe(Math.round(shape!.height));
  expect(shape!.width).toBeGreaterThan(300);
  await page.locator('#again').click();await expect(page.locator('#hud')).toBeVisible();await expect(page.locator('#countdown')).toBeHidden({timeout:15000});
  await expect(page.locator('#spell')).toHaveAttribute('data-phase','input');
  await expect(page.locator('#world')).not.toHaveClass(/spell-finished/);
  await page.screenshot({path:'test-results/cast-mobile-input.png'});
  await page.locator('#cancel').click();await expect(page.locator('#welcome')).toBeVisible();
  expect(errors).toEqual([]);
});
