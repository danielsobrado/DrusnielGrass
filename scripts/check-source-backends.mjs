import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.argv[3] ?? process.env.SOURCE_URL ?? 'http://127.0.0.1:5191/';
const output = resolve(process.argv[2] ?? process.env.BACKEND_OUTPUT ?? '.shots/source-backends');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const requested of ['webgpu', 'webgl']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('response', (response) => {
      if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`);
    });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`${message.text()} [${message.location().url ?? ''}]`);
    });
    try {
      const url = new URL(base);
      url.searchParams.set('renderer', requested);
      url.searchParams.set('character', 'drusniel');
      await page.goto(url.href, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__grassDemo?.pipeline || document.querySelector('.fatal'), null, { timeout: 90000 });
      const ready = await page.evaluate(() => Boolean(window.__grassDemo?.pipeline));
      if (!ready) throw new Error(await page.locator('.fatal').innerText());
      await page.locator('#startButton').click({ timeout: 60000 });
      await page.waitForTimeout(4000);
      const status = await page.evaluate(() => ({
        ...window.__grassDemo.world.rendererSession.diagnostics,
        capabilities: window.__grassDemo.world.rendererSession.capabilities,
        gpuAvailable: Boolean(navigator.gpu),
      }));
      if (status.actual !== (requested === 'webgl' ? 'webgl2' : 'webgpu')) throw new Error('Wrong backend');
      console.log(JSON.stringify({ requested, ...status }));
      const shots = [];
      for (const preset of ['sunny', 'goldenHour', 'rainy', 'windy', 'calm', 'bowed', 'moonlight']) {
        await page.evaluate((id) => window.__grassDemo.environment.setPreset(id), preset);
        await page.waitForTimeout(600);
        const file = `${requested}-${preset}.png`;
        await page.screenshot({ path: resolve(output, file) });
        shots.push(file);
      }
      for (const shape of ['slender', 'reed', 'broadleaf', 'tufted']) {
        await page.evaluate((id) => window.__grassDemo.grass.setGrassShape(id), shape);
        await page.waitForTimeout(600);
        await page.screenshot({ path: resolve(output, `${requested}-${shape}.png`) });
      }
      const render = await page.evaluate(() => ({
        triangles: window.__grassDemo.world.renderer.info.render.triangles,
        calls: window.__grassDemo.world.renderer.info.render.calls,
      }));
      results.push({ requested, ...status, render, shots, errors });
    } catch (error) {
      results.push({ requested, failure: error.message, errors });
      console.error(requested, error.message);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
  await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2));
}
if (results.some((result) => result.failure || result.errors.length)) process.exitCode = 1;
