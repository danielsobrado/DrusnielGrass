import * as THREE from "three";
import { disposeResources } from "../../render/ResourceDisposal";

/**
 * What the water is allowed to look through.
 *
 * Membership is opt-in rather than opt-out, which is the cheaper way round.
 * Excluding grass would mean moving millions of blades onto another layer across
 * every grass system; including terrain, the riverbed and stones is two lines
 * where those meshes are built. It also gives the better picture, dropping
 * grass, the water surface itself, sky and characters in one move — grass seen
 * through moving water is invisible detail that would cost more than everything
 * else in the frame combined.
 */
export const WATER_REFRACTION_LAYER = 2;

/** What the pass needs from the frame it is rendered inside. */
export type WaterRefractionArgs = [
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
];

/**
 * Renders what sits behind the water into an offscreen target, once per frame,
 * for the high optics preset only.
 *
 * This is a second scene render and it is the most expensive thing the preset
 * buys, which is why it is opt-in and why the target is deliberately smaller
 * than the canvas. Refraction is read through a distorted, moving surface and
 * then attenuated by depth, so it is one of the few images in a renderer that
 * genuinely does not need full resolution: the distortion hides far more than
 * the missing pixels cost.
 */
export class WaterRefractionPass {
  private target?: THREE.WebGLRenderTarget;
  private width = 0;
  private height = 0;
  private disposed = false;
  private readonly size = new THREE.Vector2();

  constructor(private readonly resolutionScale: number) {}

  get texture(): THREE.Texture | undefined {
    return this.target?.texture;
  }

  get depthTexture(): THREE.DepthTexture | undefined {
    return this.target?.depthTexture ?? undefined;
  }

  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ): void {
    if (this.disposed) {
      return;
    }
    renderer.getDrawingBufferSize(this.size);
    const width = Math.max(1, Math.floor(this.size.x * this.resolutionScale));
    const height = Math.max(1, Math.floor(this.size.y * this.resolutionScale));
    if (!this.target || width !== this.width || height !== this.height) {
      this.resize(width, height);
    }
    const target = this.target;
    if (!target) {
      return;
    }
    // Restore shared camera state first. If renderer target restoration itself
    // faults during context loss, the real frame must not inherit layer 2.
    const previousTarget = renderer.getRenderTarget();
    const previousMask = camera.layers.mask;
    try {
      camera.layers.set(WATER_REFRACTION_LAYER);
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, camera);
    } finally {
      camera.layers.mask = previousMask;
      renderer.setRenderTarget(previousTarget);
    }
  }

  private resize(width: number, height: number): void {
    const previous = this.target;
    this.target = new THREE.WebGLRenderTarget(width, height, {
      depthBuffer: true,
      depthTexture: new THREE.DepthTexture(width, height, THREE.UnsignedIntType),
    });
    this.width = width;
    this.height = height;
    if (previous) {
      disposeResources([previous, previous.depthTexture ?? undefined]);
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    const target = this.target;
    this.target = undefined;
    this.width = 0;
    this.height = 0;
    if (target) {
      disposeResources([target, target.depthTexture ?? undefined]);
    }
  }
}
