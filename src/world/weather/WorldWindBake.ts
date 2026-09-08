import {
  HalfFloatType, LinearFilter, MeshBasicNodeMaterial, QuadMesh, RenderTarget, Vector2,
  type Vector3, type WebGPURenderer,
} from "three/webgpu";
import { uniform, uv, vec2, vec4 } from "three/tsl";
import { renderNodePass } from "../../render/RenderNodePass";
import { disposeResources } from "../../render/ResourceDisposal";
import { createWorldWindFieldNodes } from "./WorldWindNodes";
import type { WorldWindField } from "./WorldWindField";

/**
 * How much world the baked field covers, in metres.
 *
 * Chosen against the layer that has to survive the bake: the large layer's
 * cells are 66.7 m across, so a 1024 m region holds about fifteen gust cells —
 * enough that a front is fully resolved well before it reaches the edge of what
 * is drawn. Grass draws to roughly a hundred metres, so the region also has
 * generous margin for the focus moving between bakes.
 */
export const WIND_BAKE_WORLD_SIZE = 1024;

/**
 * Texels per side.
 *
 * 4 m per texel at the size above. The large layer is 66.7 m and the medium
 * 14.3 m, so both are resolved several texels across. Flutter, at 2.9 m cells,
 * is not — which is why it is not baked: it stays analytic in the material,
 * where one noise lookup buys detail that no affordable texture could hold.
 */
export const WIND_BAKE_RESOLUTION = 256;

/**
 * How long a bake is allowed to stand, in seconds.
 *
 * The broad field advects at 0.08 cells per second over 66.7 m cells, so it
 * moves about 5 m/s; in a tenth of a second it moves half a metre, an eighth of
 * one texel. The staleness is therefore smaller than the spatial resolution
 * already accepted, which is the right place to put the cadence: any faster is
 * paying for detail the texture cannot hold.
 */
export const WIND_BAKE_INTERVAL_SECONDS = 0.1;

/**
 * The composite wind field, baked to a texture the whole world samples.
 *
 * Evaluating the field per blade vertex measured 15.6 ms median against 7.6 ms
 * for the per-material gust model it replaced — seven gradient-noise lookups of
 * four lattice texels each, twenty-eight fetches, on every vertex of a very
 * large amount of grass. This bakes it once per region per cadence instead, and
 * every representation reads the one texture.
 *
 * What is baked is what has to be coherent: direction, envelope strength and
 * the broad gust. Flutter is deliberately left out and stays analytic, because
 * it is fine detail rather than shared structure — the plan asks far cards for
 * the same broad gust with *less* microflutter, not the same flutter.
 */
/** The live origin node the sampling materials bind to. */
export type WindBakeOrigin = ReturnType<typeof createOriginUniform>;
function createOriginUniform() {
  return uniform(new Vector2());
}

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
  private disposed = false;

  constructor(private readonly renderer: WebGPURenderer) {
    this.target = new RenderTarget(WIND_BAKE_RESOLUTION, WIND_BAKE_RESOLUTION, {
      depthBuffer: false,
      stencilBuffer: false,
      // Half float: the direction components are signed and the envelope runs
      // to 1.25, so eight bits would quantise the bend into visible steps
      // across a gust front.
      type: HalfFloatType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
    });
    this.target.texture.name = "world-wind-field";

    // The bake's own mapping, and the only definition of it: the sampling nodes
    // read the same origin uniform and the same world size.
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
  }

  /** The baked field. Sampled through `createBakedWorldWindNodes`. */
  get texture() {
    return this.target.texture;
  }

  /**
   * The region centre in world metres.
   *
   * The live node, not a copy: materials bind to it once at construction and
   * then follow the region as it moves with the focus.
   */
  get originUniform(): WindBakeOrigin {
    return this.origin;
  }

  /**
   * Re-bakes when the field has moved on or the focus has left the region.
   *
   * The origin is snapped to whole texels. Without that, moving the focus
   * slides the sampling grid continuously against the world and the whole field
   * shimmers — the same reason the cloud shadow map snaps its own origin.
   */
  update(deltaSeconds: number, focus: Vector3, field: WorldWindField): void {
    if (this.disposed || !Number.isFinite(focus.x) || !Number.isFinite(focus.z)) {
      return;
    }
    const texelSize = WIND_BAKE_WORLD_SIZE / WIND_BAKE_RESOLUTION;
    const snappedX = Math.round(focus.x / texelSize) * texelSize;
    const snappedZ = Math.round(focus.z / texelSize) * texelSize;
    const moved = snappedX !== this.origin.value.x || snappedZ !== this.origin.value.y;
    this.secondsSinceBake += Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    if (!moved && this.secondsSinceBake < WIND_BAKE_INTERVAL_SECONDS) {
      return;
    }
    this.secondsSinceBake = 0;
    this.origin.value.set(snappedX, snappedZ);
    this.time.value = field.getPhaseSeconds();
    this.directionDegrees.value = field.getDirectionDegrees();
    this.intensity.value = field.getIntensity();
    this.noiseScale.value = field.getNoiseScale();
    renderNodePass(this.renderer, this.target, this.quad);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    disposeResources([this.material, this.target]);
  }
}
