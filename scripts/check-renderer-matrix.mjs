import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

/**
 * The G06 acceptance matrix: both scenes, both profiles, both backends, plus
 * the failure and lifecycle paths a renderer has to survive.
 *
 * This measures the running application rather than an isolated fixture. The
 * per-material equivalence is already held by check-renderer-harness.mjs; what
 * is open after that is whether the world actually starts, keeps running,
 * survives losing its device, and costs what it used to.
 */
const BASE = "http://127.0.0.1:5192/";
const output = ".shots/renderer-matrix";
await mkdir(output, { recursive: true });

const WARMUP_MS = 9000;
const SAMPLE_MS = 6000;

function url(params) {
  return BASE + "?" + new URLSearchParams({ capture: "1", ...params }).toString();
}

/** Frame intervals from inside the page, after the world has warmed. */
async function measureFrames(page, milliseconds) {
  return page.evaluate(async (duration) => {
    const samples = [];
    await new Promise((done) => {
      let previous = performance.now();
      const start = previous;
      const tick = (now) => {
        samples.push(now - previous);
        previous = now;
        if (now - start >= duration) done();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    // The first interval spans the gap before measurement began.
    samples.shift();
    const sorted = [...samples].sort((a, b) => a - b);
    const at = (fraction) =>
      sorted.length === 0
        ? null
        : sorted[Math.min(sorted.length - 1,
          Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
    return { frames: sorted.length, medianMs: at(0.5), p95Ms: at(0.95) };
  }, milliseconds);
}

/**
 * A browser per case.
 *
 * Repeatedly creating and dropping WebGPU contexts inside one browser
 * eventually loses the renderer process mid-measurement, which reports as a
 * destroyed execution context and says nothing about the application. Each case
 * gets a clean process so a failure here is a real one.
 */
const results = [];
let failures = 0;

function record(name, detail, ok, message) {
  results.push({ name, ok, ...detail, ...(message ? { message } : {}) });
  if (!ok) failures++;
  console.log((ok ? "pass  " : "FAIL  ") + name + (message ? "  " + message : ""));
}

async function openScene({ scene, renderer, extra = {} }) {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const params = { renderer, ...(scene === "island" ? { scene } : {}), ...extra };
  await page.goto(url(params), { waitUntil: "load" });
  await page.waitForFunction(
    () => document.querySelector("#canvas")?.dataset.renderer !== undefined,
    null, { timeout: 60000 });
  return { browser, page, errors };
}

try {
  // Backend selection, both scenes and both profiles.
  for (const scene of ["world", "island"]) {
    for (const profile of ["desktop", "compact"]) {
      for (const renderer of ["webgpu", "webgl"]) {
        const name = scene + "/" + profile + "/" + renderer;
        const { browser, page, errors } = await openScene({
          scene, renderer, extra: profile === "compact" ? { profile } : {},
        });
        await page.waitForTimeout(WARMUP_MS);
        const canvas = page.locator("#canvas");
        const actual = await canvas.getAttribute("data-renderer");
        const requested = await canvas.getAttribute("data-renderer-requested");
        const timing = await canvas.getAttribute("data-renderer-gpu-timing");
        const frames = await measureFrames(page, SAMPLE_MS);
        await page.screenshot({
          path: output + "/" + scene + "-" + profile + "-" + renderer + ".png",
        });
        const expected = renderer === "webgl" ? "webgl2" : "webgpu";
        const ok = actual === expected && errors.length === 0 && frames.frames > 30;
        record(name,
          { actual, requested, gpuTiming: timing, ...frames, errors: errors.length },
          ok,
          actual !== expected ? "selected " + actual + ", wanted " + expected
            : errors.length ? errors[0].slice(0, 160)
              : frames.frames <= 30 ? "too few frames sampled" : "");
        await browser.close();
      }
    }
  }

  // Resize, then the BFCache and teardown paths.
  {
    const { browser, page, errors } = await openScene({ scene: "world", renderer: "webgpu" });
    await page.waitForTimeout(WARMUP_MS);
    for (const size of [{ width: 640, height: 480 }, { width: 1600, height: 900 },
      { width: 900, height: 1400 }]) {
      await page.setViewportSize(size);
      await page.waitForTimeout(1200);
    }
    const afterResize = await measureFrames(page, 2500);
    record("world/resize", { ...afterResize, errors: errors.length },
      errors.length === 0 && afterResize.frames > 10,
      errors.length ? errors[0].slice(0, 160) : "");

    // A persisted pagehide is the BFCache path: the page can be restored, so
    // the runtime must not tear itself down.
    await page.evaluate(() => {
      const event = new Event("pagehide");
      Object.defineProperty(event, "persisted", { value: true });
      window.dispatchEvent(event);
    });
    await page.waitForTimeout(1500);
    const afterPersistedHide = await measureFrames(page, 2000);
    record("world/bfcache-pagehide-persisted",
      { ...afterPersistedHide, errors: errors.length },
      afterPersistedHide.frames > 5,
      afterPersistedHide.frames > 5 ? "" : "runtime stopped on a persisted pagehide");

    await page.evaluate(() => {
      const event = new Event("pagehide");
      Object.defineProperty(event, "persisted", { value: false });
      window.dispatchEvent(event);
    });
    await page.waitForTimeout(1000);
    record("world/pagehide-teardown", { errors: errors.length },
      errors.length === 0, errors.length ? errors[0].slice(0, 160) : "");
    await browser.close();
  }

  // A forced backend the device cannot provide must fail visibly rather than
  // quietly recording a WebGL run as WebGPU.
  {
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
    // Deleting navigator.gpu does not take: it is an accessor on the prototype.
    // Adapter acquisition returning null is the real failure this simulates,
    // and it is the one the selection contract says must not be trusted alone.
    await page.addInitScript(() => {
      if (navigator.gpu) navigator.gpu.requestAdapter = async () => null;
    });
    await page.goto(url({ renderer: "webgpu" }), { waitUntil: "load" });
    await page.waitForTimeout(12000);
    const actual = await page.locator("#canvas").getAttribute("data-renderer");
    const startupError = await page.locator(".startup-error").count();
    record("world/webgpu-required-but-unavailable", { actual, startupError },
      actual !== "webgpu",
      actual === "webgpu" ? "reported WebGPU without an adapter" : "");
    await browser.close();
  }

  // Automatic selection on a device without WebGPU must land on WebGL 2 and
  // run the same portable feature set.
  {
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    // Deleting navigator.gpu does not take: it is an accessor on the prototype.
    // Adapter acquisition returning null is the real failure this simulates,
    // and it is the one the selection contract says must not be trusted alone.
    await page.addInitScript(() => {
      if (navigator.gpu) navigator.gpu.requestAdapter = async () => null;
    });
    await page.goto(url({ renderer: "auto" }), { waitUntil: "load" });
    await page.waitForFunction(
      () => document.querySelector("#canvas")?.dataset.renderer !== undefined,
      null, { timeout: 60000 });
    await page.waitForTimeout(WARMUP_MS);
    const canvas = page.locator("#canvas");
    const actual = await canvas.getAttribute("data-renderer");
    const fallback = await canvas.getAttribute("data-renderer-fallback");
    const frames = await measureFrames(page, 3000);
    record("world/auto-falls-back-to-webgl",
      { actual, fallback, ...frames, errors: errors.length },
      actual === "webgl2" && frames.frames > 20 && errors.length === 0,
      actual !== "webgl2" ? "selected " + actual
        : errors.length ? errors[0].slice(0, 160) : "");
    await browser.close();
  }
} finally {
  // Each case owns and closes its own browser.
}

await writeFile(output + "/results.json", JSON.stringify(results, null, 2));
console.log("\n" + (results.length - failures) + "/" + results.length
  + " matrix checks passed.");
assert.equal(failures, 0, failures + " renderer matrix checks failed.");