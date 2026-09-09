import {
  DepthTexture, RenderTarget, UnsignedIntType, Vector2, type Camera, type Scene, type Texture,
  type WebGPURenderer,
} from "three/webgpu";
import { disposeResources } from "../../render/ResourceDisposal";
import { withRendererState } from "../../render/RendererStateScope";
import { WATER_REFRACTION_LAYER } from "./WaterRefractionPass";

/**
 * The portable refraction capture.
 *
 * Same contract as the shipped pass, and deliberately the same layer: what the
 * water is allowed to look through is a property of the scene, not of the
 * renderer, so the two passes must agree about membership or the high optics
 * preset would show different things on different backends.
 *
 * The one substantive difference is the surrounding state. The node renderer
 * takes the viewport from the bound target and clears without regard to the
 * scissor, so the shipped pass's implicit reliance on renderer-side viewport
 * state is replaced by an explicit scope: the layer mask and the previously
 * bound target are both restored even if the render throws, because a real
 * frame inheriting layer 2 would silently draw almost nothing.
 */
export class WaterRefractionNodePass {
  private target?: RenderTarget;
  private width = 0;
  private height = 0;
  private disposed = false;
  private readonly size = new Vector2();

  constructor(private readonly resolutionScale: number) {}

  get texture(): Texture | undefined {
    return this.target?.texture;
  }

  get depthTexture(): DepthTexture | undefined {
    return this.target?.depthTexture ?? undefined;
  }

  /** The capture itself, for checks that read it back rather than sample it. */
  get renderTarget(): RenderTarget | undefined {
    return this.target;
  }

  render(renderer: WebGPURenderer, scene: Scene, camera: Camera): void {
    if (this.disposed) return;
    renderer.getDrawingBufferSize(this.size);
    const width = Math.max(1, Math.floor(this.size.x * this.resolutionScale));
    const height = Math.max(1, Math.floor(this.size.y * this.resolutionScale));
    if (!this.target || width !== this.width || height !== this.height) {
      this.resize(width, height);
    }
    const target = this.target;
    if (!target) return;
    const previousMask = camera.layers.mask;
    try {
      withRendererState(renderer, () => {
        camera.layers.set(WATER_REFRACTION_LAYER);
        renderer.setRenderTarget(target);
        renderer.setScissorTest(false);
        renderer.autoClear = false;
        renderer.clear();
        renderer.render(scene, camera);
      });
    } finally {
      camera.layers.mask = previousMask;
    }
  }

  private resize(width: number, height: number): void {
    const previous = this.target;
    let target: RenderTarget | undefined;
    let depthTexture: DepthTexture | undefined;
    try {
      target = new RenderTarget(width, height, { depthBuffer: true });
      // Depth is not incidental here: the surface treats depth 1 as "nothing was
      // drawn" and keeps its own colour there. Without a readable depth texture
      // the capture's clear colour is sampled as radiance, which is what turned
      // grazing-angle water pure black before the depth test was added.
      depthTexture = new DepthTexture(width, height, UnsignedIntType);
      target.depthTexture = depthTexture;
    } catch (error) {
      try {
        disposeResources([depthTexture, target]);
      } catch (cleanupError) {
        console.warn(
          "[Drusniel World] Water refraction resize cleanup failed.",
          cleanupError,
        );
      }
      throw error;
    }

    this.target = target;
    this.width = width;
    this.height = height;
    if (previous) {
      try {
        disposeResources([previous.depthTexture ?? undefined, previous]);
      } catch (error) {
        // The replacement is already valid and published. Cleanup of the old
        // target must not turn a successful resize into a frame failure.
        console.warn(
          "[Drusniel World] Previous water refraction target cleanup failed.",
          error,
        );
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const target = this.target;
    this.target = undefined;
    this.width = 0;
    this.height = 0;
    if (target) disposeResources([target.depthTexture ?? undefined, target]);
  }
}
