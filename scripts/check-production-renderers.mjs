import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

// Real application startup, complementary to the isolated shader fixtures and
// mocked bootstrap recovery tests. Capture the app without changing production.
const directory = process.argv[2] ? `.shots/production-renderers-${process.argv[2]}` : '.shots/production-renderers';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const scene of process.argv[2] ? [process.argv[2]] : ['world', 'island']) for (const profile of ['desktop', 'compact']) {
    for (const backend of ['webgpu', 'webgl']) {
      const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      const className = scene === 'world' ? 'WorldApp' : 'IslandApp';
      await page.route(`**/src/app/${className}.ts*`, async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: await response.text() + `\n
const reviewCreate = ${className}.create;
${className}.create = async function(...args) {
  const app = await reviewCreate.apply(this, args);
  window.__productionReviewApp = app;
  return app;
};` });
      });
      // Island create is synchronous; its hook must preserve that contract.
      if (scene === 'island') {
        await page.unroute(`**/src/app/${className}.ts*`);
        await page.route(`**/src/app/${className}.ts*`, async route => {
          const response = await route.fetch();
          await route.fulfill({ response, body: await response.text() + `\n
const reviewCreate = IslandApp.create;
IslandApp.create = function(...args) {
  const app = reviewCreate.apply(this, args);
  window.__productionReviewApp = app;
  return app;
};` });
        });
      }
      const label = `${scene}-${profile}-${backend}`;
      try {
        await page.goto(`http://127.0.0.1:5192/?scene=${scene}&profile=${profile}&renderer=${backend}&capture=1`);
        await page.waitForFunction(() => window.__productionReviewApp?.running, null, { timeout: 120000 });
        await page.waitForTimeout(8000);
        await page.setViewportSize({ width: 900, height: 620 });
        await page.waitForTimeout(500);
        const state = await page.evaluate(() => {
          const app = window.__productionReviewApp;
          return { backend: app.renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl',
            running: app.running, rendererEnabled: app.rendererEnabled,
            runtimeError: app.runtimeGuard?.error,
            calls: app.renderer.info.render.calls, triangles: app.renderer.info.render.triangles,
            camera: app.camera.position.toArray(), fog: app.scene.fog?.density,
            grass: app.grass.getDiagnostics?.(),
            alerts: [...document.querySelectorAll('.startup-error')].map(element => element.textContent) };
        });
        assert.equal(state.backend, backend);
        assert.equal(state.running, true);
        assert.notEqual(state.rendererEnabled, false);
        assert.ok(state.calls > 0 && state.triangles > 0, JSON.stringify(state));
        assert.equal(state.runtimeError, undefined, JSON.stringify(state));
        assert.deepEqual(state.alerts, []);
        assert.deepEqual(errors, []);
        await page.screenshot({ path: `${directory}/${label}.png` });
        results.push({ label, passed: true, ...state });
      } catch (error) {
        results.push({ label, passed: false, failure: error.message, errors: errors.slice(0, 10), errorCount: errors.length });
      } finally { await page.close(); }
      console.log(`${results.at(-1).passed ? 'PASS' : 'FAIL'} ${label}`);
      await writeFile(`${directory}/results.json`, JSON.stringify(results, null, 2));
    }
  }
} finally { await browser.close(); }
assert.ok(results.every(result => result.passed), `Production failures: ${directory}/results.json`);