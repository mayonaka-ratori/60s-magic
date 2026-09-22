import { expect,type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { COUNTDOWN_MS,ROUNDS } from '../../src/game/rounds';

/**
 * 一回目が終わり、防御の回に入るまで待つ。一回目の音（命中のあとの余韻まで）と記録は、ここで出そろっている。
 * 目印は三段の見出しが防御の回のものに替わること。一回目の最後の案内は短いので、遅いPCでも見逃さないこちらを使う。
 * 開始ボタンを押した直後から呼んでよいよう、準備の合図の分と読み込みの余裕を足して待つ。
 */
export async function 防御の回まで待つ(page:Page) {
  await expect(page.locator('#step-1-label')).toHaveText('輪を守る',{timeout:COUNTDOWN_MS+ROUNDS[1].start+15000});
}

/**
 * 本編を途中で中止し、タイトルの「前回の記録を保存する」で書き出した記録を読む。
 * 一回目しか見ない試験は、90秒の終わりまで待たずにここで切り上げる。このボタンは ?dev=1 のときだけ出る。
 * 記録は中止の直前に取るので、音の記録（audio）は音を止める前の状態のまま入っている。
 */
export async function 中止して記録を読む(page:Page) {
  await page.locator('#cancel').click();await expect(page.locator('#welcome')).toBeVisible();
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#last-record').click()]);
  return JSON.parse(await readFile(await download.path(),'utf8'));
}
