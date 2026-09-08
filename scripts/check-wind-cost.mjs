import { chromium } from "playwright";

/**
 * Measures wind-model cost against a benchmark that can actually be trusted.
 *
 * Four things corrupted the earlier numbers, and this exists because each of
 * them is invisible in an aggregate frame time:
 *
 * 1. Headless Chrome quantises frame time to vsync multiples — 7.6 and 15.1 ms
 *    at 131 Hz — so anything between them is unmeasurable. Launched unlocked.
 * 2. The grass quality governor targets 60 FPS by adapting density, which
 *    equalises any two configurations that both miss it. The tier is pinned.
 * 3. Near-grass streaming has a 2.5 ms per-frame build budget. A run sampled
 *    before its tiles have settled reports that budget as grass CPU cost. This
 *    waits for convergence rather than for a fixed wall-clock delay — the
 *    earlier runs gave both models 20 seconds, which was long enough for the
 *    fast one and not for the slow one.
 * 4. Frame time hides where the cost is. The diagnostics HUD already separates
 *    GPU scene time from per-phase CPU, so that is what is read.
 */
const BASE = "http://127.0.0.1:5192/";

/** Consecutive settled samples required before believing the world is idle. */
const CONVERGENCE_SAMPLES = 12;
const CONVERGENCE_POLL_MS = 500;
const MAX_CONVERGENCE_MS = 90000;

function parseHud(text) {
  const number = (pattern) => {
    const match = text.match(pattern);
    return match ? Number(match[1]) : null;
  };
  /** The HUD groups thousands, so digits and commas are read then unpunctuated. */
  const grouped = (pattern) => {
    const match = text.match(pattern);
    return match ? Number(match[1].replace(/,/g, "")) : null;
  };
  return {
    fps: number(/([\d.]+) FPS/),
    draws: grouped(/Draws ([\d,]+)/),
    triangles: grouped(/Triangles ([\d,]+)/),
    buildMs: number(/Build ([\d.]+) \//),
    gpuMedian: number(/GPU scene ([\d.]+) med/),
    gpuP95: number(/([\d.]+) p95 ms/),
    controls: number(/ctrl ([\d.]+)/),
    terrain: number(/terr ([\d.]+)/),
    stone: number(/stone ([\d.]+)/),
    grass: number(/grass ([\d.]+)/),
    draw: number(/draw ([\d.]+) ms/),
  };
}

/**
 * Waits until the world stops building.
 *
 * Convergence is defined as a zero build time and an unchanging draw count for
 * several consecutive polls. Draw count is the tell that streaming has settled;
 * build time alone can read zero between two bursts of work.
 */
async function waitForConvergence(page) {
  const started = Date.now();
  let settled = 0;
  let previousDraws = null;
  while (Date.now() - started < MAX_CONVERGENCE_MS) {
    await page.waitForTimeout(CONVERGENCE_POLL_MS);
    const hud = parseHud(await page.evaluate(
      () => document.querySelector("#world-stats")?.textContent ?? "",
    ));
    if (hud.draws === null) {
      continue;
    }
    const quiet = (hud.buildMs ?? 1) <= 0.05 && hud.draws === previousDraws;
    settled = quiet ? settled + 1 : 0;
    previousDraws = hud.draws;
    if (settled >= CONVERGENCE_SAMPLES) {
      return { converged: true, seconds: (Date.now() - started) / 1000 };
    }
  }
  return { converged: false, seconds: (Date.now() - started) / 1000 };
}

async function measure(query) {
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    // Without this every result lands on a vsync multiple and differences
    // smaller than a refresh interval are invisible.
    args: ["--disable-gpu-vsync", "--disable-frame-rate-limit"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message.slice(0, 120)));
    await page.goto(BASE + "?" + query, { waitUntil: "load" });
    await page.waitForFunction(
      () => (document.querySelector("#world-stats")?.textContent ?? "").includes("FPS"),
      null, { timeout: 60000 });
    const convergence = await waitForConvergence(page);

    // Several HUD reads rather than one: its own averages move, and a single
    // sample cannot show that.
    const samples = [];
    for (let index = 0; index < 8; index++) {
      await page.waitForTimeout(750);
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
      converged: convergence.converged,
      convergenceSeconds: Number(convergence.seconds.toFixed(1)),
      fps: median("fps"), draws: median("draws"), triangles: median("triangles"),
      buildMs: median("buildMs"),
      gpuMedian: median("gpuMedian"),
      controls: median("controls"), terrain: median("terrain"), stone: median("stone"),
      grass: median("grass"), draw: median("draw"),
      errors: errors.length,
    };
  } finally {
    await browser.close();
  }
}

const CASES = process.argv.slice(2).length > 0
  ? process.argv.slice(2).map((entry) => {
    const [label, ...rest] = entry.split("=");
    return [label, rest.join("=")];
  })
  : [
    ["legacy webgpu", "renderer=webgpu&tier=0&gpuTiming=1&diagnostics=1"],
    ["cinematic webgpu", "renderer=webgpu&tier=0&windModel=cinematic&gpuTiming=1&diagnostics=1"],
    ["legacy webgl", "renderer=webgl&tier=0&gpuTiming=1&diagnostics=1"],
    ["cinematic webgl", "renderer=webgl&tier=0&windModel=cinematic&gpuTiming=1&diagnostics=1"],
  ];

console.log(
  "case".padEnd(26) + "conv".padStart(7) + "fps".padStart(8) + "gpu".padStart(7)
  + "draw".padStart(8) + "grass".padStart(7) + "build".padStart(7)
  + "draws".padStart(9) + "err".padStart(5),
);
for (const [label, query] of CASES) {
  const result = await measure(query);
  console.log(
    label.padEnd(26)
    + `${result.converged ? "yes" : "NO"} ${result.convergenceSeconds}s`.padStart(7)
    + String(result.fps ?? "-").padStart(8)
    + String(result.gpuMedian ?? "-").padStart(7)
    + String(result.draw ?? "-").padStart(8)
    + String(result.grass ?? "-").padStart(7)
    + String(result.buildMs ?? "-").padStart(7)
    + String(result.draws ?? "-").padStart(9)
    + String(result.errors).padStart(5),
  );
}
