import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");

function fail(message) {
  throw new Error(`[gpu-timing-parity] ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

/**
 * Transpiles one module and returns both its data URL and its exports.
 *
 * A data: module cannot resolve a relative specifier, so a dependency's own URL
 * is substituted into the importer's text. That keeps the adapter under test as
 * the real source file, sharing the real percentile rather than a stub of it.
 */
async function importTypeScriptModule(relativePath, resolved = {}) {
  const fileName = resolve(REPOSITORY_ROOT, relativePath);
  const result = ts.transpileModule(readFileSync(fileName, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
    fileName,
    reportDiagnostics: true,
  });
  const errors = result.diagnostics?.filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (errors?.length) {
    fail(
      `Unable to transpile ${relativePath}: ${errors
        .map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
        )
        .join("; ")}`,
    );
  }
  let output = result.outputText;
  for (const [specifier, url] of Object.entries(resolved)) {
    output = output.replaceAll(`"${specifier}"`, JSON.stringify(url));
  }
  const url = `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`;
  return { url, module: await import(url) };
}

// The legacy timer gates itself on a real WebGL2 context, so the fake has to be
// an instance of that class rather than a duck type. Declaring it here also
// keeps the check honest about which branch it is exercising: without this the
// timer reports "unsupported" and every comparison below would pass trivially.
class FakeWebGL2RenderingContext {
  QUERY_RESULT_AVAILABLE = 0x9867;
  QUERY_RESULT = 0x8866;
  constructor() {
    this.extension = { TIME_ELAPSED_EXT: 0x88bf, GPU_DISJOINT_EXT: 0x8fbb };
    this.results = new Map();
    this.queued = [];
    this.disjoint = false;
    this.nextQuery = 1;
    this.live = new Set();
  }
  getExtension(name) {
    return name === "EXT_disjoint_timer_query_webgl2" ? this.extension : null;
  }
  createQuery() {
    const query = { id: this.nextQuery++ };
    this.live.add(query);
    return query;
  }
  deleteQuery(query) {
    this.live.delete(query);
  }
  beginQuery() {}
  endQuery() {
    // The value a frame will report is bound when its query closes, in the same
    // order the timer pushes it in flight.
    this.pendingValue = this.queued.shift();
  }
  getParameter(name) {
    return name === this.extension.GPU_DISJOINT_EXT ? this.disjoint : 0;
  }
  getQueryParameter(query, name) {
    if (name === this.QUERY_RESULT_AVAILABLE) return true;
    return this.results.get(query) ?? 0;
  }
}

globalThis.WebGL2RenderingContext = FakeWebGL2RenderingContext;

const timer = await importTypeScriptModule("src/runtime/GpuFrameTimer.ts");
const { GpuFrameTimer } = timer.module;
const adapter = await importTypeScriptModule("src/render/GpuTimingAdapter.ts", {
  "../runtime/GpuFrameTimer": timer.url,
});
const { GpuTimingAdapter } = adapter.module;
assert(
  typeof GpuFrameTimer === "function" && typeof GpuTimingAdapter === "function",
  "Both timing implementations must load from source.",
);

const NANOSECONDS_PER_MILLISECOND = 1_000_000;

/** Runs the shipped WebGL timer over one sample sequence, in nanoseconds. */
function runLegacy(nanoseconds) {
  const context = new FakeWebGL2RenderingContext();
  const timer = new GpuFrameTimer({ getContext: () => context }, true);
  for (const value of nanoseconds) {
    timer.beginFrame();
    const query = [...context.live].at(-1);
    context.results.set(query, value);
    timer.endFrame();
  }
  const stats = timer.getStats();
  timer.dispose();
  return { stats, leaked: context.live.size };
}

/** Runs the portable adapter over the same sequence, in milliseconds. */
async function runAdapter(nanoseconds) {
  const queue = nanoseconds.map((value) => value / NANOSECONDS_PER_MILLISECOND);
  let index = 0;
  const adapter = new GpuTimingAdapter(
    { resolveTimestampsAsync: () => Promise.resolve(queue[index++]) },
    { gpuTiming: true },
    true,
  );
  for (let frame = 0; frame < nanoseconds.length; frame++) {
    adapter.endFrame();
    // The adapter records asynchronously and skips a frame while a resolve is
    // still outstanding, so each frame is drained before the next is offered.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }
  const stats = adapter.getStats();
  adapter.dispose();
  return stats;
}

// Sample counts chosen to straddle the boundaries a percentile index can move
// across: below, at and above the 120-sample ring, and the small counts a HUD
// shows in its first second.
const COUNTS = [1, 2, 3, 4, 5, 7, 10, 11, 19, 20, 21, 40, 99, 100, 119, 120, 121, 150, 240];
const differences = [];
for (const count of COUNTS) {
  // A deterministic non-monotonic spread: a sorted or constant sequence would
  // hide an index difference behind equal neighbouring values.
  const nanoseconds = Array.from({ length: count }, (_, frame) =>
    (1 + ((frame * 37) % count)) * 25_000,
  );
  const { stats: legacy, leaked } = runLegacy(nanoseconds);
  const adapter = await runAdapter(nanoseconds);
  assert(leaked === 0, `The legacy timer leaked ${leaked} queries at ${count} samples.`);
  assert(
    legacy.status === "active" && adapter.status === "active",
    `Both timers must report active at ${count} samples: ${JSON.stringify({ legacy, adapter })}`,
  );
  assert(
    legacy.sampleCount === adapter.sampleCount,
    `Sample counts differ at ${count} frames: ${JSON.stringify({ legacy, adapter })}`,
  );
  for (const key of ["medianMs", "p95Ms"]) {
    if (legacy[key] !== adapter[key]) {
      differences.push(
        `${count} frames: ${key} legacy ${legacy[key]} vs adapter ${adapter[key]}`,
      );
    }
  }
}
assert(
  differences.length === 0,
  `The portable adapter must report the same statistics the shipped timer does:\n  ${differences.join("\n  ")}`,
);

// Status, not just values: a HUD that says "GPU off" when timing is available,
// or reports "active" with no backing queries, is wrong in the other direction.
const disabledLegacy = new GpuFrameTimer({ getContext: () => new FakeWebGL2RenderingContext() }, false);
const disabledAdapter = new GpuTimingAdapter({}, { gpuTiming: true }, false);
assert(
  disabledLegacy.getStats().status === "disabled" &&
    disabledAdapter.getStats().status === "disabled",
  "Both timers must report disabled when timing is switched off.",
);
const unsupportedAdapter = new GpuTimingAdapter({}, { gpuTiming: false }, true);
assert(
  unsupportedAdapter.getStats().status === "unsupported",
  "The adapter must report unsupported when the renderer has no timestamp capability.",
);
assert(
  unsupportedAdapter.getStats().sampleCount === 0,
  "An unsupported adapter must not report samples.",
);

// --- The factory that picks between them ---

const capabilities = await importTypeScriptModule("src/render/RendererCapabilities.ts");
const { createFrameTimingSource } = (
  await importTypeScriptModule("src/render/FrameTimingSource.ts", {
    "../runtime/GpuFrameTimer": timer.url,
    "./GpuTimingAdapter": adapter.url,
    "./RendererCapabilities": capabilities.url,
  })
).module;

function nodeRenderer({ trackTimestamp, timestampQuery = true }) {
  return {
    backend: {
      isWebGPUBackend: true,
      trackTimestamp,
      device: {
        limits: { maxTextureDimension2D: 8192, maxVertexAttributes: 16 },
        features: { has: (name) => name === "timestamp-query" && timestampQuery },
      },
    },
    resolveTimestampsAsync: () => Promise.resolve(undefined),
  };
}

const webglSource = createFrameTimingSource(
  { getContext: () => new FakeWebGL2RenderingContext() },
  true,
);
assert(
  webglSource instanceof GpuFrameTimer,
  "A renderer with no backend must be timed by the shipped WebGL query timer.",
);
assert(
  createFrameTimingSource(nodeRenderer({ trackTimestamp: true }), true) instanceof
    GpuTimingAdapter,
  "A node renderer must be timed by the portable adapter.",
);

// `trackTimestamp` is a backend construction parameter, so a renderer built
// without it answers `resolveTimestampsAsync` with nothing forever while still
// reporting the `timestamp-query` feature. Reporting "active" there would leave
// the HUD claiming live timing against zero samples for the whole session.
assert(
  createFrameTimingSource(nodeRenderer({ trackTimestamp: true }), true).getStats()
    .status === "active",
  "A tracked node renderer with the timestamp feature must report active.",
);
for (const [label, renderer] of [
  ["an untracked backend", nodeRenderer({ trackTimestamp: false })],
  ["a backend without the timestamp feature", nodeRenderer({ trackTimestamp: true, timestampQuery: false })],
]) {
  const status = createFrameTimingSource(renderer, true).getStats().status;
  assert(
    status === "unsupported",
    `The adapter must report unsupported for ${label}, not "${status}".`,
  );
}
assert(
  createFrameTimingSource(nodeRenderer({ trackTimestamp: true }), false).getStats()
    .status === "disabled",
  "Switching timing off must win over any capability.",
);

// Both mechanisms accept the same calls, so the diagnostics need no branch.
for (const source of [webglSource, createFrameTimingSource(nodeRenderer({ trackTimestamp: true }), true)]) {
  for (const method of ["beginFrame", "endFrame", "getStats", "dispose"]) {
    assert(
      typeof source[method] === "function",
      `Every timing source must implement ${method}.`,
    );
  }
  source.beginFrame();
  source.endFrame();
  source.dispose();
}

console.log(
  `[gpu-timing-parity] The portable adapter matches the shipped WebGL timer's statistics across ${COUNTS.length} sample counts, and the factory reports timing only where the renderer can actually deliver it.`,
);
