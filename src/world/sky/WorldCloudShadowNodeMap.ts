import { LinearFilter, MeshBasicNodeMaterial, QuadMesh, RenderTarget, Vector2, Vector3,
  type WebGPURenderer } from "three/webgpu";
import { Fn, float, max, mix, uniform, uv, vec4 } from "three/tsl";
import type { RuntimeCloudConfig, RuntimeProfile } from "../../runtime/RuntimeConfig";
import type { RendererCapabilities } from "../../render/RendererCapabilities";
import type { WorldLightingState } from "../../render/WorldLightingState";
import { disposeResources } from "../../render/ResourceDisposal";
import { renderNodePass } from "../../render/RenderNodePass";
import { readRenderTargetRgba8 } from "../../render/RenderTargetReadback";
import { WORLD_SUN_DIRECTION } from "../../app/WorldEnvironmentTuning";
import { createCloudFieldNodes } from "./WorldCloudFieldNodes";
import { createWorldCloudShadowUniforms } from "./WorldCloudShadowUniforms";
import { WorldCloudShadowNodes } from "./WorldCloudShadowNodes";
import { sampleCloudPointDirectTransmittance } from "./WorldCloudWeather";

/** Portable raster version of the existing cloud transmittance map. */
export class WorldCloudShadowNodeMap {
  readonly uniforms;
  readonly nodes;
  private readonly origin = uniform(new Vector2());
  private readonly sun;
  private readonly field;
  private readonly cloud: RuntimeCloudConfig;
  private readonly target: RenderTarget;
  private readonly material = new MeshBasicNodeMaterial({ depthTest: false, depthWrite: false, toneMapped: false });
  private readonly quad = new QuadMesh(this.material);
  private disposed = false;
  private enabled = true;
  private pendingRead = false;
  private forceRefresh = true;

  constructor(private readonly renderer: WebGPURenderer, private readonly profile: RuntimeProfile,
    capabilities: RendererCapabilities, lighting?: WorldLightingState) {
    this.cloud = { ...profile.cloud };
    if (lighting) this.cloud.coverage = lighting.cloudThreshold;
    const cloud = this.cloud;
    const resolution = Math.min(cloud.shadowMapResolution, capabilities.maxTextureSize);
    let target: RenderTarget | undefined;
    let nodes: WorldCloudShadowNodes | undefined;
    try {
      target = new RenderTarget(resolution, resolution, { depthBuffer: false,
        stencilBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter });
      this.target = target;
      this.target.texture.name = "world-cloud-shadow-transmittance";
      this.sun = uniform(lighting?.sunDirection ?? new Vector3(...WORLD_SUN_DIRECTION).normalize());
      this.uniforms = createWorldCloudShadowUniforms(cloud, this.sun.value);
      this.uniforms.uCloudShadowMap.value = this.target.texture;
      nodes = new WorldCloudShadowNodes(this.uniforms);
      this.nodes = nodes;
      const field = this.field = createCloudFieldNodes(cloud, profile.compact);
      const sun = this.sun;
      this.material.fragmentNode = Fn(() => {
        const plane = this.origin.add(uv().sub(0.5).mul(cloud.shadowWorldSize));
        const optical = float(0).toVar();
        for (let i = 0; i < cloud.shadowSteps; i++) {
          const fraction = float((i + 0.5) / cloud.shadowSteps);
          const sample = plane.add(sun.xz.mul(fraction.mul(cloud.thickness).div(max(sun.y, 0.08))));
          optical.addAssign(field.density(sample).x.mul(field.verticalProfile(sample, fraction)));
        }
        optical.divAssign(cloud.shadowSteps);
        const physical = optical.mul(-cloud.extinction).exp();
        const transmittance = max(cloud.minimumDirectTransmittance, mix(1, physical, cloud.shadowStrength));
        return vec4(transmittance, optical.clamp(0, 1), 0, 1);
      })();
      this.setEnabled(cloud.enabled);
    } catch (error) {
      try {
        disposeResources([nodes, this.material, target]);
      } catch (cleanupError) {
        console.warn("[Drusniel World] Cloud shadow map construction cleanup failed.", cleanupError);
      }
      throw error;
    }
  }

  applyLightingState(lighting: WorldLightingState): void {
    if (this.disposed) return;
    this.cloud.coverage = lighting.cloudThreshold;
    this.field.coverage.value = lighting.cloudThreshold;
    this.uniforms.uCloudSunDirection.value.copy(lighting.sunDirection);
    this.forceRefresh = true;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled && this.profile.cloud.enabled && !this.disposed;
    this.uniforms.uCloudShadowEnabled.value = this.enabled ? 1 : 0;
    if (!this.enabled) this.uniforms.uCloudFocusTransmittance.value = 1;
  }

  update(focus: Vector3, elapsedSeconds: number): void {
    if (this.disposed || !this.enabled) return;
    if (![focus.x, focus.y, focus.z, elapsedSeconds].every(Number.isFinite)) {
      this.uniforms.uCloudShadowEnabled.value = 0;
      this.uniforms.uCloudFocusTransmittance.value = 1;
      return;
    }
    const cloud = this.cloud;
    const sun = this.sun.value;
    const altitude = Math.max(cloud.baseHeight - focus.y, 0) / Math.max(sun.y, 0.08);
    const texelSize = cloud.shadowWorldSize / this.target.width;
    const nextX = Math.round((focus.x + sun.x * altitude) / texelSize) * texelSize;
    const nextZ = Math.round((focus.z + sun.z * altitude) / texelSize) * texelSize;
    const refresh = this.forceRefresh || nextX !== this.origin.value.x || nextZ !== this.origin.value.y;
    const previousX = this.origin.value.x;
    const previousZ = this.origin.value.y;
    if (refresh) {
      this.origin.value.set(nextX, nextZ);
    }
    this.uniforms.uCloudFocusTransmittance.value = sampleCloudPointDirectTransmittance(cloud,
      this.profile.compact, focus.x, focus.y, focus.z, elapsedSeconds, sun);
    this.uniforms.uCloudShadowEnabled.value = 1;
    this.field.time.value = elapsedSeconds;
    try {
      // The opaque full-screen map overwrites every pixel. Keep the last valid
      // texture intact if a new optional shadow draw fails.
      renderNodePass(this.renderer, this.target, this.quad, false);
    } catch (error) {
      if (refresh) {
        this.origin.value.set(previousX, previousZ);
      }
      this.forceRefresh = true;
      throw error;
    }
    if (refresh) {
      this.uniforms.uCloudShadowOriginXZ.value.copy(this.origin.value);
      this.forceRefresh = false;
    }
  }

  async readDebugPixels(target: Uint8Array): Promise<boolean> {
    if (this.disposed || this.pendingRead || target.length < this.target.width * this.target.height * 4) return false;
    this.pendingRead = true;
    try {
      const pixels = await readRenderTargetRgba8(this.renderer, this.target);
      if (this.disposed) return false;
      target.set(pixels);
      return true;
    } finally { this.pendingRead = false; }
  }

  getDiagnostics() {
    return { enabled: this.uniforms.uCloudShadowEnabled.value >= 0.5,
      resolution: this.target.width, worldSize: this.cloud.shadowWorldSize,
      focusTransmittance: this.uniforms.uCloudFocusTransmittance.value,
      originX: this.origin.value.x, originZ: this.origin.value.y };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.setEnabled(false);
    this.uniforms.uCloudShadowMap.value = null;
    disposeResources([this.nodes, this.material, this.target]);
  }
}
