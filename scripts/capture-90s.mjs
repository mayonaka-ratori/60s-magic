// 仮の時計で90秒を進めながら画面写真を撮る確認用の台本。先に npm run dev を起動しておく。
//
// 写真は test-results/capture/sequential/ または test-results/capture/together/ に出る。--flow=sequential または --flow=together で選ぶ。
// Chromium は Playwright が入れたものを使う。別の場所のものを使いたいときだけ、
// 環境変数 CAPTURE_CHROMIUM にその場所を入れる（PLAYWRIGHT_BROWSERS_PATH も効く）。
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { flow, sequential, rounds, pageUrl, startButton } from './capture-flow.mjs';
const out = `test-results/capture/${flow}`;
const [FIRST, DEFEND, FINISH] = rounds;
const s = ms => ms / 1000;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CAPTURE_CHROMIUM || undefined, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });
await page.clock.install({ time: new Date('2026-09-20T10:00:00') });
// 描画は自分で一コマずつ進める。仮の時計の rAF は毎16msに呼ばれて遅すぎるため。
await page.addInitScript(() => { const q = []; window.requestAnimationFrame = cb => { q.push(cb); return q.length; }; window.cancelAnimationFrame = () => {}; window.__flushRaf = () => { const list = q.splice(0); const now = performance.now(); for (const cb of list) cb(now); }; });
await page.goto(pageUrl+'&dev=1');
await page.locator('#loading').waitFor({ state: 'hidden', timeout: 90000 });
await page.clock.runFor(500); await page.evaluate(() => window.__flushRaf());
await page.locator(startButton).click();
// 準備の合図（COUNTDOWN_MS）。ここまでは時計を動かしたまま。
for (let i = 0; i < 40; i++) { await page.waitForTimeout(250); await page.evaluate(() => window.__flushRaf()); if (await page.locator('#countdown').isHidden() && await page.locator('#hud').isVisible()) break; }
// ここで時計を止め、以後は runFor で進めた分だけ動かす。
await page.clock.pauseAt(await page.evaluate(() => Date.now() + 200));
let t = 0;
// 本編の時刻は進行バーの幅（t/90）から読み取り、写真の秒を本編に合わせる。
const appTime = async () => parseFloat((await page.evaluate(() => document.getElementById('progress').style.width)) || '0') / 100 * 90;
t = await appTime(); console.log('start offset', t.toFixed(2));
const tick = async ms => { await page.clock.runFor(ms); t += ms / 1000; await page.evaluate(() => window.__flushRaf()); };
const until = async at => { while (t < at - 1e-6) { const fine = t >= s(FINISH.release)-.6 && t < s(FINISH.handoff)-1; const step = Math.min(fine ? 100 : 200, (at - t) * 1000); await tick(step); } };
const shot = async name => { await page.screenshot({ path: `${out}/${name}.png` }); console.log('shot', name, t.toFixed(2), await page.evaluate(() => ({ instruction: document.getElementById('instruction')?.textContent, health: document.getElementById('health')?.style.height, gone: document.querySelector('.enemy-health')?.dataset.gone, knight: document.getElementById('knight')?.dataset.state, phase: document.getElementById('spell')?.dataset.phase }))); };
const draw = async (cx, cy, rx, ry) => { if(sequential)return; await page.mouse.move(cx + rx, cy); await page.mouse.down(); for (let i = 1; i <= 24; i++) { const a = i / 24 * Math.PI * 2; await page.mouse.move(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry); await page.clock.runFor(60); t += .06; if (i % 4 === 0) await page.evaluate(() => window.__flushRaf()); } await page.mouse.up(); };
const fill = async text => { if(sequential)return; await tick(200); try { await page.locator('#chant').fill(text, { timeout: 3000 }); } catch { throw new Error(`文字を入れられませんでした：${t.toFixed(2)}秒`); } };
await until(1); await fill('雷よ、七つに分かれろ');
await draw(700, 420, 180, 120);
await until(s(FIRST.impact)+.5); await shot('r1-impact');
await until(s(DEFEND.start)+1); await fill('氷よ、壁となれ、弾き返せ');
const box = await page.locator('#magic').boundingBox();
await draw(box.x + box.width * .27, box.y + box.height * .5, 150, 170);
await until(s(DEFEND.impact)+.6); await shot('r2-block');
await until(s(FINISH.start)+1); await fill('炎よ、集まれ、貫け');
await draw(700, 420, 200, 140);
await until(s(FINISH.drawEnd)-1); await shot('r3-draw'); t = await appTime();
await until(s(FINISH.lock)-.8); await shot('r3-charge');
await until(s(FINISH.release)-.25); await shot('r3-hold');
await until(s(FINISH.release)+.06); await shot('r3-pass'); await until(s(FINISH.release)+.18); await shot('r3-pass2');
await until(s(FINISH.release)+.9); await shot('r3-rings');
await until(s(FINISH.impact)+.05); await shot('r3-hit1');
await until(s(FINISH.impact)+.45); await shot('r3-hit3');
await until(s(FINISH.finalBlow)+.3); await shot('r3-blow');
await until(s(FINISH.finalBlow)+1); await shot('r3-slow');
await until(s(FINISH.finalBlow)+1.7); await shot('r3-sword');
await until(s(FINISH.finalBlow)+2.7); await shot('r3-knee');
await until(s(FINISH.finalBlow)+4.1); await shot('r3-fall');
await until(s(FINISH.handoff)+1); await shot('r3-after');
await until(s(FINISH.end)-1.5); await shot('r3-fade');
await until(s(FINISH.end)+.3); await shot('result-name');
await until(s(FINISH.end)+1.5); await shot('result');
console.log(JSON.stringify(await page.evaluate(() => ({ name: document.getElementById('spell-name')?.textContent, resultVisible: !document.getElementById('result').hidden, resultText: document.getElementById('result')?.innerText.replace(/\s+/g, ' ').slice(0, 600) }))));
await page.setViewportSize({ width: 430, height: 900 }); await tick(600); await page.screenshot({ path: `${out}/result-portrait.png` });
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
if(errors.length)process.exitCode=1;
