import { CubeUVReflectionMapping, HalfFloatType, LinearFilter, LinearSRGBColorSpace, Mesh, PMREMGenerator,
  RenderTarget, Scene, SphereGeometry, Vector3, type PerspectiveCamera, type WebGPURenderer } from "three/webgpu";
import type { RuntimeProfile } from "../../runtime/RuntimeConfig";
import type { RendererCapabilities } from "../../render/RendererCapabilities";
import type { WorldLightingState } from "../../render/WorldLightingState";
import { disposeResources } from "../../render/ResourceDisposal";
import { withRendererState } from "../../render/RendererStateScope";
import { WORLD_ZELDA_EXPOSURE } from "../../app/WorldEnvironmentTuning";
import { WORLD_CLOUD_TIME_WRAP_SECONDS } from "./WorldCloudWeather";
import { WorldSkyAnalyticNodeMaterial } from "./WorldSkyAnalyticNodeMaterial";
import { WorldCloudTemporalNodePass } from "./WorldCloudTemporalNodePass";

const SKY_RADIUS = 4000;

/** Owns the portable sky, optional volume history and sky-only IBL bake. */
export class WorldSkyNode {
  private readonly geometry = new SphereGeometry(SKY_RADIUS, 32, 16);
  private material!: WorldSkyAnalyticNodeMaterial;
  private mesh?: Mesh;
  private volume?: WorldCloudTemporalNodePass;
  private environment?: RenderTarget;
  private readonly previousEnvironment;
  private readonly previousEnvironmentIntensity;
  private readonly previousBackground;
  private elapsed = 0;
  private readonly focus = new Vector3();
  private environmentRefreshQueued = false;
  private disposed = false;

  constructor(private readonly scene: Scene, private readonly renderer: WebGPURenderer,
    private readonly profile: RuntimeProfile, capabilities: RendererCapabilities,
    private readonly lighting?: WorldLightingState) {
    this.previousEnvironment = scene.environment;
    this.previousEnvironmentIntensity = scene.environmentIntensity;
    this.previousBackground = scene.background;
    try {
      if (!profile.compact && profile.cloud.enabled && profile.cloud.volumetricEnabled) {
        this.volume = new WorldCloudTemporalNodePass(renderer, profile, capabilities, lighting);
      }
      this.material = new WorldSkyAnalyticNodeMaterial(profile, this.volume?.texture, lighting);
      this.mesh = new Mesh(this.geometry, this.material.material);
      this.mesh.name = "world-sky-dome";
      this.mesh.frustumCulled = false;
      this.mesh.renderOrder = 900;
      scene.add(this.mesh);
      scene.background = null;
      renderer.toneMappingExposure = WORLD_ZELDA_EXPOSURE;
      scene.environmentIntensity = lighting?.environmentIntensity ?? 1;
      if (!profile.compact) this.refreshEnvironment();
    } catch (error) {
      try { this.dispose(); } catch (cleanupError) { console.warn("Sky node rollback failed.", cleanupError); }
      throw error;
    }
  }

  applyLightingState(): void {
    if (this.disposed || !this.lighting) return;
    this.material.applyLightingState(this.lighting);
    this.volume?.applyLightingState(this.lighting);
    this.volume?.resetHistory();
    this.scene.environmentIntensity = this.lighting.environmentIntensity;
    this.queueEnvironmentRefresh();
  }

  update(elapsedSeconds: number, focus: Vector3): void {
    if (this.disposed) return;
    this.elapsed = Math.max(0, elapsedSeconds) % WORLD_CLOUD_TIME_WRAP_SECONDS;
    this.focus.copy(focus);
    this.material.update(this.elapsed, focus);
  }

  prepareFrame(camera: PerspectiveCamera): void {
    if (this.disposed || !this.mesh) return;
    camera.getWorldPosition(this.mesh.position);
    if (!this.volume || !this.material.volumeMap) return;
    try {
      this.material.volumeMap.value = this.volume.render(camera, this.elapsed);
    } catch (error) {
      this.fallbackToAnalyticClouds(error);
    }
  }

  resetHistory(): void { this.volume?.resetHistory(); }

  private queueEnvironmentRefresh(): void {
    if (this.disposed || this.profile.compact || this.environmentRefreshQueued) return;
    this.environmentRefreshQueued = true;
    queueMicrotask(() => {
      this.environmentRefreshQueued = false;
      if (!this.disposed) this.refreshEnvironment();
    });
  }

  private refreshEnvironment(): void {
    const next = this.bakeEnvironment();
    if (!next) return;
    const previous = this.environment;
    this.scene.environment = next.texture;
    this.environment = next;
    if (previous) {
      try {
        previous.dispose();
      } catch (error) {
        console.warn("Previous sky environment cleanup failed.", error);
      }
    }
  }

  private bakeEnvironment(): RenderTarget | undefined {
    let target: RenderTarget | undefined;
    let bake: WorldSkyAnalyticNodeMaterial | undefined;
    let generator: PMREMGenerator | undefined;
    try {
      target = new RenderTarget(768, 1024, { type: HalfFloatType, minFilter: LinearFilter,
        magFilter: LinearFilter, generateMipmaps: false, depthBuffer: true });
      target.texture.mapping = CubeUVReflectionMapping;
      target.texture.colorSpace = LinearSRGBColorSpace;
      bake = new WorldSkyAnalyticNodeMaterial({ ...this.profile,
        cloud: { ...this.profile.cloud, enabled: false, godRays: false } }, undefined, this.lighting);
      generator = new PMREMGenerator(this.renderer);
      const scene = new Scene();
      scene.add(new Mesh(this.geometry, bake.material));
      withRendererState(this.renderer, () =>
        generator!.fromScene(scene, 0, 0.1, SKY_RADIUS, { size: 256, renderTarget: target! }));
      return target;
    } catch (error) {
      if (target) {
        try {
          target.dispose();
        } catch (cleanupError) {
          console.warn("Sky environment target cleanup failed.", cleanupError);
        }
      }
      console.warn("Sky environment bake unavailable; retaining the previous IBL.", error);
      return undefined;
    } finally {
      try {
        disposeResources([bake, generator]);
      } catch (cleanupError) {
        console.warn("Sky environment bake cleanup failed.", cleanupError);
      }
    }
  }

  private fallbackToAnalyticClouds(error: unknown): void {
    const previous = this.material;
    const volume = this.volume;
    let fallback: WorldSkyAnalyticNodeMaterial | undefined;
    try {
      fallback = new WorldSkyAnalyticNodeMaterial(this.profile, undefined, this.lighting);
      fallback.update(this.elapsed, this.focus);
    } catch (fallbackError) {
      try {
        fallback?.dispose();
      } catch (cleanupError) {
        console.warn("Analytic cloud fallback cleanup failed.", cleanupError);
      }
      console.warn("Analytic cloud fallback construction failed.", fallbackError);
      throw error;
    }

    this.volume = undefined;
    this.material = fallback;
    if (this.mesh) {
      this.mesh.material = fallback.material;
    }
    try {
      disposeResources([previous, volume]);
    } catch (cleanupError) {
      console.warn("Temporal cloud fallback cleanup failed.", cleanupError);
    }
    console.warn("Temporal clouds unavailable; using analytic clouds.", error);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.environment && this.scene.environment === this.environment.texture) {
      this.scene.environment = this.previousEnvironment;
    }
    this.scene.environmentIntensity = this.previousEnvironmentIntensity;
    if (this.scene.background === null) this.scene.background = this.previousBackground;
    disposeResources([
      { dispose: () => this.mesh?.removeFromParent() },
      this.volume,
      this.material,
      this.geometry,
      this.environment,
    ]);
  }
}
