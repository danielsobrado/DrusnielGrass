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
export function createWorldRendererSession(canvas: HTMLCanvasElement,
  request: RendererRequest, search: string, signal?: AbortSignal): Promise<RendererSession> {
  return createRendererSession({
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
}
