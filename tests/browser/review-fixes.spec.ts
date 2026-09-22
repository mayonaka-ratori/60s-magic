import { test, expect } from '@playwright/test';

for (const flow of ['together', 'sequential']) {
  test(`${flow}：描画を重ねず、結果では止め、再開後もEscで中止できる`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/status', route => route.fulfill({ json: {
      jev: false, speech: true, handModel: false, speechProvider: 'local',
      localSpeech: { state: 'ready', message: '試験用', model: '試験用', device: 'cpu' },
    } }));
    await page.route('**/api/interpret', route => {
      const state = route.request().postDataJSON();
      return route.fulfill({ json: { sessionId: state.sessionId, castId: state.castId, inputRevision: 1, status: 'unconfigured' } });
    });
    await page.routeWebSocket('**/api/speech', socket => socket.onMessage(data => {
      if (typeof data !== 'string') return;
      const message = JSON.parse(data);
      if (message.type === 'start') socket.send(JSON.stringify({ type: 'ready', sessionId: message.sessionId }));
    }));
    await page.goto(`/?flow=${flow}&attract=600&resultIdle=5`);
    await expect(page.locator('#loading')).toBeHidden();
    // 本物の描画処理をそのまま動かし、回数だけを数える。
    await page.evaluate(async () => {
      const paths = ['/src/render/cast-scene.ts', '/src/render/completed-spell.ts', '/src/render/knight.ts'];
      const [scene, spell, knight] = await Promise.all(paths.map(path => import(path)));
      for (const [prototype, method, counter] of [
        [scene.CastScene.prototype, 'render', 'reviewScenes'],
        [spell.CompletedSpell.prototype, 'render', 'reviewSpells'],
        [spell.CompletedSpell.prototype, 'setShape', 'reviewShapes'],
        [knight.Knight.prototype, 'render', 'reviewKnights'],
      ]) {
        const original = prototype[method];
        prototype[method] = function (this: unknown, ...args: unknown[]) {
          const data = document.getElementById('app')!.dataset;
          data[counter] = String(Number(data[counter] ?? 0) + 1);
          return original.apply(this, args);
        };
      }
    });
    const counts = () => page.locator('#app').evaluate(app => ({
      scenes: Number(app.dataset.reviewScenes), spells: Number(app.dataset.reviewSpells),
      shapes: Number(app.dataset.reviewShapes), knights: Number(app.dataset.reviewKnights),
    }));
    await page.clock.install();
    await page.locator('#demo').click();
    // 両方とも防御では手の線が増える。空の形・描き途中・完成後を通す。
    await page.clock.fastForward(31000);
    const beforeDrawing = await counts();
    await page.clock.runFor(400);
    const afterDrawing = await counts();
    expect(afterDrawing.shapes).toBeGreaterThan(beforeDrawing.shapes);
    expect(afterDrawing.spells - beforeDrawing.spells).toBe(afterDrawing.scenes - beforeDrawing.scenes);
    await page.clock.fastForward(41000);
    await page.clock.runFor(32);
    await page.clock.fastForward(18000);
    await expect(page.locator('#result')).toBeVisible();
    await page.clock.runFor(32);
    await expect(page.locator('#knight')).toHaveAttribute('data-state', 'down');
    const result = await counts();
    await page.clock.runFor(1000);
    expect(await counts()).toEqual(result);

    await page.setViewportSize({ width: 900, height: 700 });
    await page.clock.runFor(100);
    const resized = await counts();
    expect(resized.knights).toBeGreaterThan(result.knights);
    await page.clock.runFor(400);
    expect(await counts()).toEqual(resized);
    await page.screenshot({ path: `test-results/review-result-${flow}.png` });
    // 描画を止めていても、放置した結果は指定時間でタイトルに戻る。
    await page.clock.fastForward(5000);
    await expect(page.locator('#welcome')).toBeVisible();
    await page.locator('#demo').click();
    await page.clock.fastForward(91000);
    await expect(page.locator('#result')).toBeVisible();
    await page.locator('#again').click();
    await expect(page.locator('#countdown')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#welcome')).toBeVisible();
    await expect(page.locator('#countdown')).toBeHidden();
    const ready = await counts();
    await page.clock.runFor(100);
    expect((await counts()).knights).toBeGreaterThan(ready.knights);
    expect(errors).toEqual([]);
  });
}
