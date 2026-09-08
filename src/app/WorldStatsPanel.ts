import type StatsPanelClass from "stats-gl";
import type { WebGLRenderer } from "three";
import type { WebGPURenderer } from "three/webgpu";

/**
 * stats-gl 2.0.1 ships no `dispose`, so the panel has no teardown of its own.
 * `bindStatsLifetime` installs one; this alias is what the rest of the module
 * binds against, and it is why `stats.dispose` may be read here at all.
 */
type Stats = StatsPanelClass & { dispose: () => void };

/**
 * stats-gl recognises the classic renderer by this flag and patches its
 * `render` to bracket each frame with a timer query. The node renderer does not
 * carry it.
 */
interface PatchableRenderer {
  isWebGLRenderer?: boolean;
}

/**
 * Attaches the profiler where it can actually measure, and declines elsewhere.
 *
 * stats-gl 2.0.1 reaches the GPU exactly one way: it tests `isWebGLRenderer`,
 * patches that renderer's `render`, and pulls the disjoint-timer extension off
 * the context behind it. The node renderer fails that test, and a WebGPU canvas
 * has no WebGL 2 context to fall back to, so nothing would patch the frame. The
 * library would still add a GPU row and it would read zero forever.
 *
 * Declining is the honest outcome: the caller already treats `undefined` as an
 * unavailable panel, and the diagnostics HUD behind `?gpuTiming=1` measures GPU
 * frame time on both backends through `createFrameTimingSource`.
 */
export async function attachWorldStatsPanel(
  renderer: WebGLRenderer | WebGPURenderer,
): Promise<Stats | undefined> {
  if (!(renderer as PatchableRenderer).isWebGLRenderer) {
    console.warn(
      "[Drusniel World] The stats panel can only time the classic WebGL renderer; " +
        "use ?gpuTiming=1 for the portable diagnostics HUD.",
    );
    return undefined;
  }
  let stats: Stats | undefined;
  try {
    const { default: StatsPanel } = await import("stats-gl");
    // The panel gets its `dispose` here rather than from the library, so it
    // exists before anything can throw and `bindStatsLifetime` has a real
    // function to wrap. Reading `.bind` off the absent method used to throw,
    // and the catch below swallowed it, which disabled the panel outright.
    stats = Object.assign(new StatsPanel({ minimal: true }), {
      dispose: (): void => {},
    });
    stats.init(renderer as WebGLRenderer);
    bindStatsLifetime(stats);
    document.body.appendChild(stats.dom);
    return stats;
  } catch (error) {
    try {
      stats?.dispose();
    } catch (cleanupError) {
      console.warn(
        "[Drusniel World] Stats panel cleanup failed.",
        cleanupError,
      );
    }
    console.warn("[Drusniel World] Optional stats panel unavailable.", error);
    return undefined;
  }
}

function bindStatsLifetime(stats: Stats): void {
  const dispose = stats.dispose.bind(stats);
  const removeDom = stats.dom.remove.bind(stats.dom);
  let disposed = false;

  stats.dispose = (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    try {
      dispose();
    } finally {
      removeDom();
    }
  };
  stats.dom.remove = (): void => {
    if (disposed) {
      removeDom();
      return;
    }
    stats.dispose();
  };
}
