import type { Camera, Scene } from "three";

/**
 * What the diagnostics actually need from a renderer.
 *
 * The probes, the QA runner and the stats panel were typed against the concrete
 * WebGL renderer class because that was the only renderer in the project, not
 * because they use anything specific to it: between them they read four
 * counters, call `render`, and take a blob off the canvas. Both renderers
 * provide all of it, so these structural types let one diagnostic serve either
 * backend instead of a second copy existing for the node route.
 *
 * They are deliberately narrow. A union of the two concrete renderer classes
 * would let a future edit reach for a backend-specific API and still typecheck
 * on one of them; naming only the members that are genuinely shared means the
 * type check is what stops that.
 */

/** The per-frame counters both renderers publish under `info.render`. */
export interface RendererFrameInfo {
  readonly render: {
    readonly calls: number;
    readonly triangles: number;
    readonly points: number;
    readonly lines: number;
  };
}

/** A renderer that can report its frame counters. */
export interface RendererWithFrameInfo {
  readonly info: RendererFrameInfo;
}

/** A renderer that can draw a scene. Both return void; neither is awaited. */
export interface SceneRenderer {
  render(scene: Scene, camera: Camera): void;
}

/** A renderer whose canvas a capture can be taken from. */
export interface RendererWithCanvas {
  readonly domElement: HTMLCanvasElement;
}

/**
 * What the workload diagnostics hold a renderer for.
 *
 * They draw the world through it, wrap that call to time and probe the frame,
 * and read its counters afterwards. Nothing else, and nothing backend-specific.
 */
export interface DiagnosticsRenderer extends RendererWithFrameInfo, SceneRenderer {}

/**
 * A renderer an isolation or diagnostics pass can inspect mid-frame.
 *
 * `getRenderTarget` is only ever compared against null — the question is "is
 * this the beauty pass or an offscreen one" — so the return type stays opaque
 * rather than naming two incompatible target classes.
 */
export interface InspectableRenderer extends RendererWithFrameInfo {
  getRenderTarget(): object | null;
}
