import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const mode of ['fallback', 'forced-unavailable', 'webgpu-loss', 'webgl-loss']) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`${m.text()} [${m.location().url}]`);
    });
    if (mode === 'fallback' || mode === 'forced-unavailable') {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
      });
    }
    try {
      const renderer = mode === 'forced-unavailable' ? 'webgpu' : mode === 'webgl-loss' ? 'webgl' : 'auto';
      await page.goto(`http://127.0.0.1:5193/?character=drusniel&renderer=${renderer}`);
      await page.waitForFunction(() => window.__grassDemo?.pipeline || document.querySelector('.fatal'), null, { timeout: 90000 });
      if (mode === 'forced-unavailable') {
        assert.match(await page.locator('.fatal').innerText(), /explicitly requested/);
      } else {
        await page.locator('#startButton').click();
        await page.waitForFunction(() => window.__grassDemo.started);
        const actual = await page.evaluate(() => window.__grassDemo.world.rendererSession.diagnostics.actual);
        assert.equal(actual, mode === 'webgpu-loss' ? 'webgpu' : 'webgl2');
        if (mode.endsWith('-loss')) {
          await page.evaluate((mode) => {
            const demo = window.__grassDemo;
            demo.environment.setPreset('moonlight');
            demo.grass.setGrassShape('tufted');
            window.__oldDemo = demo;
            if (mode === 'webgpu-loss') {
              // Three intentionally ignores an explicit destroy. Destroy the
              // real device, then inject notification: this is a recovery
              // harness, not evidence of spontaneous hardware device loss.
              demo.world.renderer.backend.device.destroy();
              demo.world.renderer.onDeviceLost({ reason: 'unknown', message: 'Test: destroyed device and injected notification' });
            }
            else demo.world.renderer.backend.gl.getExtension('WEBGL_lose_context').loseContext();
          }, mode);
          await page.waitForFunction(() => window.__grassDemo !== window.__oldDemo && window.__grassDemo.started, null, { timeout: 120000 });
          const restored = await page.evaluate(() => ({
            preset: window.__grassDemo.environment.currentPreset,
            shape: window.__grassDemo.grass.shape,
            canvases: document.querySelectorAll('#app > canvas').length,
            oldDisposed: window.__oldDemo.disposed,
          }));
          assert.deepEqual(restored, { preset: 'moonlight', shape: 'tufted', canvases: 1, oldDisposed: true });
        }
      }
      results.push({ mode, passed: true, errors });
    } catch (error) {
      results.push({ mode, passed: false, failure: error.message, errors });
    } finally { await page.close(); }
    console.log(JSON.stringify(results.at(-1)));
  }
} finally {
  await browser.close();
  await mkdir('.shots/source-recovery', { recursive: true });
  await writeFile('.shots/source-recovery/results.json', JSON.stringify(results, null, 2));
}
if (results.some((r) => !r.passed)) process.exitCode = 1;
