import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// These are explicitly mocked renderer losses. Real browser rendering is
// exercised separately; this suite controls the async ownership boundaries.
const sessionModule = `
export async function createWorldRendererSession(canvas, request, search, signal) {
  const state = window.__runtimeReview;
  const session = { renderer: { domElement: canvas }, capabilities: { gpuTiming: false },
    diagnostics: { requested: request, actual: request === 'webgl' ? 'webgl2' : 'webgpu' },
    released: false, listeners: [],
    dispose() { if (!this.released) { this.released = true; this.listeners = []; } },
    subscribeDeviceLoss(callback) { this.listeners.push(callback); return () => {}; },
    lose() { for (const callback of [...this.listeners]) callback({ reason: 'mocked' }); } };
  state.sessions.push(session);
  if (state.delaySession) await new Promise(resolve => { state.finishSession = resolve; });
  if (signal?.aborted) { session.dispose(); throw signal.reason; }
  if (state.failGpuRestart && state.sessions.length > 1 && request === 'webgpu') {
    session.dispose(); throw new Error('mocked GPU restart failure');
  }
  return session;
}`;
const appModule = `
const readyRevealState = { ready: true, degraded: false, message: 'ready' };
const panelHost = {
  snapshot() {
    return { weather: 'drusniel', weatherAvailable: false, windControlsAvailable: false,
      windGain: 1, simulationSpeed: 1, renderScale: 1, interactionEnabled: true };
  },
  setWeatherPreset() { return false; },
  setWindGain() { return false; },
  setSimulationSpeed() { return false; },
  setRenderScale() {},
  setInteractionEnabled() {},
  setModalOverlay() {},
};
const reveal = {
  holdForStart() {},
  subscribe(listener) { listener(readyRevealState); return () => {}; },
  getState() { return readyRevealState; },
  reveal() {},
  dispose() {},
};
export class WorldApp {
  static async create(session) {
    const state = window.__runtimeReview;
    const app = new WorldApp();
    app.session = session; app.started = 0; app.released = false;
    state.apps.push(app);
    if (state.delayApp) await new Promise(resolve => { state.finishApp = resolve; });
    return app;
  }
  getThirdPersonCharacter() { return undefined; }
  getExperiencePanelHost() { return panelHost; }
  getRevealController() { return reveal; }
  captureRecoveryState() { return { mode: 'fly', position: [123, 45, -67], yaw: 0.4, pitch: -0.2, speed: 12 }; }
  restoreRecoveryState(state) { this.restored = state; }
  start() { this.started++; }
  dispose() { this.released = true; this.session.dispose(); }
}
`;
const diagnosticsModule = `export class WorldDiagnosticsController {
  static attach(app) {
    const diagnostic = { app, released: false, dispose() { this.released = true; } };
    window.__runtimeReview.diagnostics.push(diagnostic);
    return diagnostic;
  }
}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
async function open(settings = {}) {
  const page = await browser.newPage();
  await page.addInitScript(settings => { window.__runtimeReview = { sessions: [], apps: [], diagnostics: [], ...settings }; }, settings);
  await page.route('**/src/app/WorldRendererSession.ts*', route => route.fulfill({ contentType: 'text/javascript', body: sessionModule }));
  await page.route('**/src/app/WorldApp.ts*', route => route.fulfill({ contentType: 'text/javascript', body: appModule }));
  await page.route('**/src/runtime/WorldDiagnosticsController.ts*', route => route.fulfill({ contentType: 'text/javascript', body: diagnosticsModule }));
  await page.goto('http://127.0.0.1:5192/?profile=compact&renderer=auto&diagnostics=1&capture=1');
  return page;
}
const hide = page => page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })));
try {
  const initial = await open({ delaySession: true });
  await initial.waitForFunction(() => window.__runtimeReview.finishSession);
  await hide(initial);
  await initial.evaluate(() => window.__runtimeReview.finishSession());
  await initial.waitForTimeout(100);
  assert.deepEqual(await initial.evaluate(() => ({ released: window.__runtimeReview.sessions.every(s => s.released), apps: window.__runtimeReview.apps.length,
    errors: document.querySelectorAll('.startup-error').length })), { released: true, apps: 0, errors: 0 });
  await initial.close();

  const recovery = await open({ failGpuRestart: true });
  await recovery.waitForFunction(() => window.__runtimeReview.apps[0]?.started === 1);
  await recovery.evaluate(() => window.__runtimeReview.sessions[0].lose());
  await recovery.waitForFunction(() => window.__runtimeReview.apps.length === 2 && window.__runtimeReview.apps[1].started === 1);
  assert.deepEqual(await recovery.evaluate(() => {
    const s = window.__runtimeReview;
    return { backend: document.querySelector('#canvas').dataset.renderer,
      freshCanvases: new Set(s.sessions.map(session => session.renderer.domElement)).size,
      oldReleased: s.sessions.slice(0, 2).every(session => session.released) && s.apps[0].released,
      oldDiagnosticsReleased: s.diagnostics[0].released, diagnostics: s.diagnostics.length,
      position: s.apps[1].restored?.position };
  }), { backend: 'webgl2', freshCanvases: 3, oldReleased: true, oldDiagnosticsReleased: true, diagnostics: 2,
    position: [123, 45, -67] });
  await hide(recovery);
  assert.equal(await recovery.evaluate(() => window.__runtimeReview.sessions.every(s => s.released)), true);
  await recovery.close();

  for (const boundary of ['Session', 'App']) {
    const page = await open();
    await page.waitForFunction(() => window.__runtimeReview.apps[0]?.started === 1);
    await page.evaluate(boundary => {
      window.__runtimeReview['delay' + boundary] = true;
      window.__runtimeReview.sessions[0].lose();
    }, boundary);
    await page.waitForFunction(boundary => window.__runtimeReview['finish' + boundary], boundary);
    await hide(page);
    await page.evaluate(boundary => window.__runtimeReview['finish' + boundary](), boundary);
    await page.waitForTimeout(100);
    assert.deepEqual(await page.evaluate(() => ({ released: window.__runtimeReview.sessions.every(s => s.released),
      lateStarts: window.__runtimeReview.apps.slice(1).reduce((sum, app) => sum + app.started, 0),
      errors: document.querySelectorAll('.startup-error').length })), { released: true, lateStarts: 0, errors: 0 });
    await page.close();
  }
  console.log('[bootstrap-recovery] Mocked fallback uses fresh canvases, replaces diagnostics, and cancels startup/recovery after navigation.');
} finally { await browser.close(); }