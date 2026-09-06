import type StatsPanelClass from "stats-gl";
import type { WebGLRenderer } from "three";

/**
 * stats-gl 2.0.1 ships no `dispose`, so the panel has no teardown of its own.
 * `bindStatsLifetime` installs one; this alias is what the rest of the module
 * binds against, and it is why `stats.dispose` may be read here at all.
 */
type Stats = StatsPanelClass & { dispose: () => void };

export async function attachWorldStatsPanel(
  renderer: WebGLRenderer,
): Promise<Stats | undefined> {
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
    stats.init(renderer);
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
