import {
  HalfFloatType, LinearFilter, MeshBasicNodeMaterial, QuadMesh, RenderTarget, Vector2,
  type Vector3, type WebGPURenderer,
} from "three/webgpu";
import { uniform, uv, vec2, vec4 } from "three/tsl";
import { renderNodePass } from "../../render/RenderNodePass";
import { disposeResources } from "../../render/ResourceDisposal";
import { createWorldWindFieldNodes } from "./WorldWindNodes";
import type { WorldWindField } from "./WorldWindField";

export const WIND_BAKE_WORLD_SIZE = 1024;
export const WIND_BAKE_RESOLUTION = 256;
export const WIND_BAKE_INTERVAL_SECONDS = 0.1;
export const WIND_BAKE_FAILURE_RETRY_SECONDS = 1;

/** The live origin node the sampling materials bind to. */
export type WindBakeOrigin = ReturnType<typeof createOriginUniform>;
function createOriginUniform() {
  return uniform(new Vector2());
}

/** Shared broad-wind texture sampled by every cinematic grass representation. */
export class WorldWindBake {
  private readonly target: RenderTarget;
  private readonly origin = createOriginUniform();
  private readonly time = uniform(0);
  private readonly directionDegrees = uniform(0);
  private readonly intensity = uniform(1);
  private readonly noiseScale = uniform(1);
  private readonly material = new MeshBasicNodeMaterial({
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  private readonly quad = new QuadMesh(this.material);
  private secondsSinceBake = Number.POSITIVE_INFINITY;
  private failureRetrySeconds = 0;
  private disposed = false;

  constructor(private readonly renderer: WebGPURenderer) {
    let target: RenderTarget | undefined;
    try {
      target = new RenderTarget(WIND_BAKE_RESOLUTION, WIND_BAKE_RESOLUTION, {
        depthBuffer: false,
        stencilBuffer: false,
        type: HalfFloatType,
        minFilter: LinearFilter,
        magFilter: LinearFilter,
      });
      this.target = target;
      this.target.texture.name = "world-wind-field";

      const worldXZ = uv().sub(0.5).mul(WIND_BAKE_WORLD_SIZE).add(this.origin);
      const field = createWorldWindFieldNodes({
        positionXZ: vec2(worldXZ.x, worldXZ.y),
        time: this.time,
        directionDegrees: this.directionDegrees,
        intensity: this.intensity,
        noiseScale: this.noiseScale,
      });
      this.material.fragmentNode = vec4(
        field.direction.x, field.direction.y, field.strength, field.gust,
      );
    } catch (error) {
      try {
        disposeResources([this.material, target]);
      } catch (cleanupError) {
        console.warn(
          "[Drusniel World] Wind bake construction cleanup failed.",
          cleanupError,
        );
      }
      throw error;
    }
  }

  get texture() {
    return this.target.texture;
  }

  get originUniform(): WindBakeOrigin {
    return this.origin;
  }

  /** Forces the next update to publish new preset state without advancing phase. */
  invalidate(): void {
    if (!this.disposed) {
      this.secondsSinceBake = Number.POSITIVE_INFINITY;
      this.failureRetrySeconds = 0;
    }
  }

  /** Re-bakes when the field moved enough, the focus moved, or state was invalidated. */
  update(deltaSeconds: number, focus: Vector3, field: WorldWindField): void {
    if (this.disposed || !Number.isFinite(focus.x) || !Number.isFinite(focus.z)) {
      return;
    }
    const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    this.secondsSinceBake += delta;
    if (this.failureRetrySeconds > 0) {
      this.failureRetrySeconds = Math.max(0, this.failureRetrySeconds - delta);
      if (this.failureRetrySeconds > 0) {
        return;
      }
    }

    const texelSize = WIND_BAKE_WORLD_SIZE / WIND_BAKE_RESOLUTION;
    const snappedX = Math.round(focus.x / texelSize) * texelSize;
    const snappedZ = Math.round(focus.z / texelSize) * texelSize;
    const moved = snappedX !== this.origin.value.x || snappedZ !== this.origin.value.y;
    if (!moved && this.secondsSinceBake < WIND_BAKE_INTERVAL_SECONDS) {
      return;
    }

    const previousOriginX = this.origin.value.x;
    const previousOriginY = this.origin.value.y;
    const previousTime = this.time.value;
    const previousDirectionDegrees = this.directionDegrees.value;
    const previousIntensity = this.intensity.value;
    const previousNoiseScale = this.noiseScale.value;

    this.secondsSinceBake = 0;
    this.origin.value.set(snappedX, snappedZ);
    this.time.value = field.getPhaseSeconds();
    this.directionDegrees.value = field.getDirectionDegrees();
    this.intensity.value = field.getIntensity();
    this.noiseScale.value = field.getNoiseScale();
    try {
      renderNodePass(this.renderer, this.target, this.quad);
      this.failureRetrySeconds = 0;
    } catch (error) {
      // The texture still represents the previously published field. Roll its
      // sampling metadata back with it so a failed optional bake cannot shift
      // an old texture under every already-compiled wind material.
      this.origin.value.set(previousOriginX, previousOriginY);
      this.time.value = previousTime;
      this.directionDegrees.value = previousDirectionDegrees;
      this.intensity.value = previousIntensity;
      this.noiseScale.value = previousNoiseScale;
      this.failureRetrySeconds = WIND_BAKE_FAILURE_RETRY_SECONDS;
      throw error;
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    disposeResources([this.material, this.target]);
  }
}
