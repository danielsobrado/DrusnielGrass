import type { Node } from "three/webgpu";
import { screenCoordinate, screenSize, vec2 } from "three/tsl";

/**
 * The fragment coordinate a GLSL shader would read.
 *
 * The node renderer's screen coordinate counts rows from the top on both
 * backends, where `gl_FragCoord` counts them from the bottom. Any screen-space
 * pattern built on it — an ordered stipple, a dissolve threshold, a lookup into
 * a screen-sized target — lands on a different set of pixels unless it is
 * flipped, so the flip lives here once rather than in each material that needs
 * to agree with the shipped one.
 */
export function fragmentCoordinate(): Node<"vec2"> {
  return vec2(screenCoordinate.x, screenSize.y.sub(screenCoordinate.y));
}
