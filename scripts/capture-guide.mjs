// 解説ページ（docs/遊び方の解説ページ_案.md と docs/note記事/）に載せる15枚を撮る台本。
// 先に npm run dev を起動しておく。写真は test-results/guide/遊び方/ に出る。--flow=sequential または --flow=together で選ぶ。
//
// 時刻はすべて src/game/rounds.ts の表から作る。ここに秒数を書かない。
// 遊ぶ人が見る画面に合わせるので、?dev=1 は付けない。マイクを使うときに出ない
// 文字入力の欄は、写真を撮る瞬間だけ隠す。
//
// Chromium は Playwright が入れたものを使う。別の場所のものを使いたいときだけ、
// 環境変数 CAPTURE_CHROMIUM にその場所を入れる。
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { flow, sequential, rounds, pageUrl, startButton, prepareCapture } from './capture-flow.mjs';

const [FIRST, DEFEND, FINISH] = rounds;
const s = ms => ms / 1000;
/** 撮る場面。秒は本編の時刻（準備の合図は含まない）。 */
const SHOTS = [
  ['03-描く', s(FIRST.build ?? FIRST.start+3000) - 2],
  ['04-言葉を添える', s(FIRST.chant ?? FIRST.inputEnd-3000) + 1],
  ['05-完成', s(FIRST.lock) + .4],  // 聞き取った言葉は確定から発動までの1秒だけ出る
  ['06-一回目の命中', s(FIRST.impact) + .2],
  ['07-赤い印', s(DEFEND.start) + 1],
  ['08-囲めた', s(DEFEND.chant ?? DEFEND.inputEnd-3000) - 1],
  ['09-盾で止める', s(DEFEND.impact) + .6],
  ['10-弱点', s(DEFEND.handoff) + .5],
  ['11-全力で詠唱', s(FINISH.inputEnd) - 2],
  ['12-放つ直前', s(FINISH.release) - .3],
  ['13-とどめ', s(FINISH.finalBlow) + .2],
  ['14-倒れる', s(FINISH.handoff) + .5],
  ['15-魔導書', s(FINISH.end) + 3],
];

const out = `test-results/guide/${flow}`;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CAPTURE_CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await prepareCapture(page);
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.clock.install({ time: new Date('2026-09-20T10:00:00') });
// 描画は自分で一コマずつ進める。仮の時計の rAF は毎16msに呼ばれて遅すぎるため。
await page.addInitScript(() => {
  const q = [];
  window.requestAnimationFrame = cb => { q.push(cb); return q.length; };
  window.cancelAnimationFrame = () => {};
  window.__flushRaf = () => { const list = q.splice(0); const now = performance.now(); for (const cb of list) cb(now); };
});
await page.goto(pageUrl);
await page.locator('#loading').waitFor({ state: 'hidden', timeout: 90000 });
await page.clock.runFor(500); await page.evaluate(() => window.__flushRaf());

/**
 * 写真を撮る。撮る瞬間だけ文字入力の欄を隠す（マイクで遊ぶ人の画面には出ないもの）。
 * 隠しっぱなしにすると、そのあと文字を入れられなくなるので、撮り終えたら戻す。
 */
const panel = async on => page.evaluate(hide => {
  const el = document.getElementById('input-panel');
  if (el) el.style.display = hide ? 'none' : '';
}, on);
const shot = async (name, headline = null) => {
  await panel(true);
  await page.screenshot({ path: `${out}/${name}.jpg`, quality: 88, type: 'jpeg' });
  // noteの見出し画像は横1280、縦670。同じ瞬間から、上下を切り落として撮る。
  if (headline) await page.screenshot({ path: `${out}/${headline}.jpg`, quality: 88, type: 'jpeg',
    clip: { x: 0, y: (900 - 670) / 2, width: 1280, height: 670 } });
  await panel(false);
  console.log('撮った', name + (headline ? `と${headline}` : ''));
};

await shot('01-開始画面', '見出し画像_案B_開始画面');
await page.locator(startButton).click();
// 準備の合図。ここまでは時計を動かしたまま。
let counted = false;
if(sequential){await page.evaluate(()=>window.__flushRaf());await shot('02-合図');counted=true;}
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(250); await page.evaluate(() => window.__flushRaf());
  if (!counted && await page.locator('#countdown').isVisible()) { await shot('02-合図'); counted = true; }
  if (await page.locator('#countdown').isHidden() && await page.locator('#hud').isVisible()) break;
}
// ここで時計を止め、以後は runFor で進めた分だけ動かす。
await page.clock.pauseAt(await page.evaluate(() => Date.now() + 200));
let t = parseFloat((await page.evaluate(() => document.getElementById('progress').style.width)) || '0') / 100 * s(FINISH.end);
const tick = async ms => { await page.clock.runFor(ms); t += ms / 1000; await page.evaluate(() => window.__flushRaf()); };
const until = async at => { while (t < at - 1e-6) { const step = Math.min(t >= s(FINISH.impact) - .5 && t < s(FINISH.handoff) ? 100 : 200, (at - t) * 1000); await tick(step); } };
const fill = async text => { if(sequential)return; await tick(200); try { await page.locator('#chant').fill(text, { timeout: 3000 }); } catch { throw new Error(`文字を入れられませんでした：${t.toFixed(2)}秒`); } };
/** 円をぐるりと描く。cx, cy は画素。 */
const draw = async (cx, cy, rx, ry, turns = 24) => { if(sequential)return;
  await page.mouse.move(cx + rx, cy); await page.mouse.down();
  for (let i = 1; i <= turns; i++) {
    const a = i / turns * Math.PI * 2;
    await page.mouse.move(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
    await page.clock.runFor(60); t += .06;
    if (i % 4 === 0) await page.evaluate(() => window.__flushRaf());
  }
  await page.mouse.up();
};

const queue = [...SHOTS];
/** noteの見出し画像を一緒に出す場面。 */
const HEADLINES = { '05-完成': '見出し画像_案C_完成', '13-とどめ': '見出し画像_案A_とどめ' };
const next = async () => { while (queue.length && t >= queue[0][1] - 1e-6) { const name = queue.shift()[0]; await shot(name, HEADLINES[name] ?? null); } };

await until(1); await fill('雷よ、七つに分かれろ');
await draw(620, 380, 170, 120);
await next();
await until(s(FIRST.chant ?? FIRST.inputEnd-3000) + 1); await next();
await until(s(FIRST.lock) + .4); await next();
await until(s(FIRST.impact) + .2); await next();
// 防御の回。左に浮かぶ輪を囲む。
await until(s(DEFEND.start) + 1); await next();
await fill('氷よ、壁となれ、弾き返せ');
const box = await page.locator('#magic').boundingBox();
await draw(box.x + box.width * .27, box.y + box.height * .5, 130, 150);
await until(s(DEFEND.chant ?? DEFEND.inputEnd-3000) - 1); await next();
await until(s(DEFEND.impact) + .6); await next();
await until(s(DEFEND.handoff) + .5); await next();
// とどめの回。
await until(s(FINISH.start) + 2); await fill('炎よ、集まれ、貫け');
await draw(620, 380, 190, 140);
await until(s(FINISH.inputEnd) - 2); await next();
await until(s(FINISH.release) - .3); await next();
await until(s(FINISH.finalBlow) + .2); await next();
await until(s(FINISH.handoff) + .5); await next();
await until(s(FINISH.end) + 3); await next();
console.log('残り', queue.map(q => q[0]).join(',') || 'なし');
console.log('エラー:', errors.length ? errors.join(' | ') : 'なし');
await browser.close();
if(errors.length)process.exitCode=1;
