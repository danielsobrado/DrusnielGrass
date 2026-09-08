import { chromium } from "playwright";

/**
 * Compares wind models on a benchmark that can be trusted.
 *
 * Five things corrupted earlier numbers here. Each is invisible in an aggregate
 * frame time, and each produced a confident wrong conclusion:
 *
 * 1. Headless Chrome quantises frame time to vsync multiples — 7.6 and 15.1 ms
 *    at 131 Hz — so anything between them is unmeasurable. Launched unlocked.
 * 2. The grass quality governor targets 60 FPS by adapting density, which
 *    equalises any two configurations that both miss it. The tier is pinned.
 * 3. Near-grass streaming has a 2.5 ms per-frame build budget. A run sampled
 *    before its tiles settle reports that budget as grass CPU cost.
 * 4. Both models were once given the same wall-clock delay to settle, which was
 *    long enough for one and not the other, so a settled world was compared
 *    against a loading one. Convergence is now waited for, and a run that never
 *    converges fails rather than reporting.
 * 5. `renderer.info.render.calls` counts render calls since startup, not per
 *    frame. Reading it as a draw count made a faster run look like it was
 *    drawing twice as much, and made it useless as a settling signal because it
 *    rises forever. The per-frame counter is `drawCalls`.
 *
 * Cases run inside one browser process in fresh contexts, so a browser launch is
 * not a variable. Two further controls exist because the first context measured
 * after a launch has been seen to run more than twice as fast as its neighbours
 * at identical draw calls and triangles: a sacrificial warm-up page per backend
 * is measured and discarded first, and the model order alternates each round so
 * that no position in the sequence belongs permanently to one model.
 */
const BASE = "http://127.0.0.1:5192/";

const CONVERGENCE_SAMPLES = 10;
const CONVERGENCE_POLL_MS = 500;
const MAX_CONVERGENCE_MS = 120000;
const SAMPLE_COUNT = 8;
const SAMPLE_INTERVAL_MS = 750;

function parseHud(text) {
  const number = (pattern) => {
    const match = text.match(pattern);
    return match ? Number(match[1]) : null;
  };
  const grouped = (pattern) => {
    const match = text.match(pattern);
    return match ? Number(match[1].replace(/,/g, "")) : null;
  };
  return {
    fps: number(/([\d.]+) FPS/),
    drawCalls: grouped(/Draws ([\d,]+) in/),
    passes: number(/in (\d+) passes/),
    triangles: grouped(/Triangles ([\d,]+)/),
    buildMs: number(/Build ([\d.]+) \//),
    terrainActive: number(/Terrain (\d+) \+/),
    terrainQueued: number(/Terrain \d+ \+(\d+)/),
    stoneActive: number(/· (\d+) \+\d+ batches/),
    stoneQueued: number(/· \d+ \+(\d+) batches/),
    patches: grouped(/Grass ([\d,]+) patches/),
    blades: grouped(/· ([\d,]+) blades/),
    impostors: grouped(/· ([\d,]+) impostors/),
    gpuMedian: number(/GPU scene ([\d.]+) med/),
    grass: number(/grass ([\d.]+)/),
    draw: number(/draw ([\d.]+) ms/),
  };
}

/** What the page itself can tell us about the conditions it is running under. */
async function readEnvironment(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("#canvas");
    return {
      backend: canvas?.dataset.renderer ?? null,
      width: canvas?.width ?? null,
      height: canvas?.height ?? null,
      dpr: window.devicePixelRatio,
    };
  });
}

/**
 * Waits until the world stops building.
 *
 * Settling is judged on the streaming signals — build time at rest and a stable
 * per-frame draw count and triangle count — not on a counter that rises for as
 * long as the page is open.
 */
async function waitForConvergence(page) {
  const started = Date.now();
  let settled = 0;
  let previous = null;
  while (Date.now() - started < MAX_CONVERGENCE_MS) {
    await page.waitForTimeout(CONVERGENCE_POLL_MS);
    const hud = parseHud(await page.evaluate(
      () => document.querySelector("#world-stats")?.textContent ?? "",
    ));
    if (hud.drawCalls === null || hud.triangles === null) {
      continue;
    }
    // Draw and triangle counts move a little with visibility even at rest, so
    // stability is a tolerance rather than equality.
    const stable = previous !== null
      && Math.abs(hud.drawCalls - previous.drawCalls) <= previous.drawCalls * 0.02
      && Math.abs(hud.triangles - previous.triangles) <= previous.triangles * 0.02;
    // Queues empty as well as counts stable: a queue still draining is a world
    // still changing, whatever this frame's draw count happens to be.
    const quiet = (hud.terrainQueued ?? 1) === 0 && (hud.stoneQueued ?? 1) === 0
      && (hud.buildMs ?? 1) <= 0.05;
    settled = stable && quiet ? settled + 1 : 0;
    previous = hud;
    if (settled >= CONVERGENCE_SAMPLES) {
      return { converged: true, seconds: (Date.now() - started) / 1000 };
    }
  }
  return { converged: false, seconds: (Date.now() - started) / 1000 };
}

async function measure(browser, query) {
  // A fresh context per case: same process, no shared page state.
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message.slice(0, 120)));
    await page.goto(BASE + "?" + query, { waitUntil: "load" });
    await page.waitForFunction(
      () => (document.querySelector("#world-stats")?.textContent ?? "").includes("FPS"),
      null, { timeout: 60000 });
    const convergence = await waitForConvergence(page);
    const environment = await readEnvironment(page);

    const samples = [];
    for (let index = 0; index < SAMPLE_COUNT; index++) {
      await page.waitForTimeout(SAMPLE_INTERVAL_MS);
      samples.push(parseHud(await page.evaluate(
        () => document.querySelector("#world-stats")?.textContent ?? "",
      )));
    }
    const median = (key) => {
      const values = samples.map((sample) => sample[key]).filter((value) => value !== null);
      if (values.length === 0) return null;
      values.sort((a, b) => a - b);
      return values[Math.floor((values.length - 1) / 2)];
    };
    return {
      ...environment,
      converged: convergence.converged,
      convergenceSeconds: Number(convergence.seconds.toFixed(1)),
      fps: median("fps"), gpuMedian: median("gpuMedian"),
      draw: median("draw"), grass: median("grass"),
      drawCalls: median("drawCalls"), passes: median("passes"),
      triangles: median("triangles"), buildMs: median("buildMs"),
      terrain: median("terrainActive"), stones: median("stoneActive"),
      patches: median("patches"), blades: median("blades"),
      errors: errors.length,
    };
  } finally {
    await context.close();
  }
}

const REPEATS = Number(process.env.WIND_COST_REPEATS ?? 3);
const MODELS = [
  ["legacy", "renderer=webgpu&tier=0&windModel=legacy&gpuTiming=1&diagnostics=1"],
  ["cinematic", "renderer=webgpu&tier=0&windModel=cinematic&gpuTiming=1&diagnostics=1"],
  ["legacy gl", "renderer=webgl&tier=0&windModel=legacy&gpuTiming=1&diagnostics=1"],
  ["cinematic gl", "renderer=webgl&tier=0&windModel=cinematic&gpuTiming=1&diagnostics=1"],
];

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--disable-gpu-vsync", "--disable-frame-rate-limit"],
});
const failures = [];
try {
  console.log(
    "case".padEnd(16) + "backend".padStart(9) + "conv".padStart(9) + "fps".padStart(8)
    + "gpu".padStart(7) + "draw".padStart(8) + "grass".padStart(7)
    + "calls".padStart(8) + "passes".padStart(8) + "tris".padStart(11) + "err".padStart(5),
  );
  // Discarded: whatever is special about the first context after a launch is
  // spent here rather than on a recorded case.
  for (const backend of ["webgpu", "webgl"]) {
    await measure(browser, `renderer=${backend}&tier=0&gpuTiming=1&diagnostics=1`);
  }
  // Interleaved, and reversed on alternate rounds, so no model permanently owns
  // a position in the sequence.
  for (let round = 0; round < REPEATS; round++) {
    const order = round % 2 === 0 ? MODELS : [...MODELS].reverse();
    for (const [label, query] of order) {
      const result = await measure(browser, query);
      if (!result.converged) {
        failures.push(`${label} did not converge within ${MAX_CONVERGENCE_MS / 1000}s`);
      }
      console.log(
        label.padEnd(16)
        + String(result.backend ?? "-").padStart(9)
        + `${result.converged ? "" : "NO "}${result.convergenceSeconds}s`.padStart(9)
        + String(result.fps ?? "-").padStart(8)
        + String(result.gpuMedian ?? "-").padStart(7)
        + String(result.draw ?? "-").padStart(8)
        + String(result.grass ?? "-").padStart(7)
        + String(result.drawCalls ?? "-").padStart(8)
        + String(result.passes ?? "-").padStart(8)
        + String(result.triangles ?? "-").padStart(11)
        + String(result.errors).padStart(5),
      );
    }
  }
} finally {
  await browser.close();
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`[wind-cost] ${failure}`);
  }
  // A run that never settled measured a loading world, which is the mistake
  // this script exists to prevent. Reporting it as a result would be worse than
  // reporting nothing.
  throw new Error(`[wind-cost] ${failures.length} runs did not converge.`);
}
console.log("\n[wind-cost] All runs converged before sampling.");
