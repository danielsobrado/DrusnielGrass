import {
  createRendererSession, type RendererRequest, type RendererSession,
} from "../render/RendererSession";

/**
 * Creates the world's renderer session from the page's own request.
 *
 * Kept beside the composition root rather than inside it: the option set is a
 * decision about the renderer, not about the world, and it carries one piece of
 * timing that has to be right at construction. `trackTimestamp` is a backend
 * construction parameter, so GPU timing must be requested before the renderer
 * exists — a renderer built without it answers every timestamp resolve with
 * nothing, for the life of the session.
 */
export async function createWorldRendererSession(canvas: HTMLCanvasElement,
  request: RendererRequest, search: string, signal?: AbortSignal): Promise<RendererSession> {
  const session = await createRendererSession({
    request,
    signal,
    options: {
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
      trackTimestamp: new URLSearchParams(search).get("gpuTiming") === "1",
    },
  });
  // Three's `init` starts an animation loop of its own whether or not one was
  // asked for, and that loop resets the frame counters on its own schedule.
  // This world drives its own loop and draws several passes per frame, so that
  // reset lands somewhere inside a frame rather than between two; the counters
  // read correctly only because the two loops happened to interleave kindly.
  // The world takes ownership instead — see `WorldApp.renderFrame`.
  session.renderer.info.autoReset = false;
  return session;
}
