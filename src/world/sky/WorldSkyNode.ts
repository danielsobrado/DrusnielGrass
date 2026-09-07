import { CubeUVReflectionMapping, HalfFloatType, LinearFilter, LinearSRGBColorSpace, Mesh, PMREMGenerator,
  RenderTarget, Scene, SphereGeometry, Vector3, type PerspectiveCamera, type WebGPURenderer } from "three/webgpu";
import type { RuntimeProfile } from "../../runtime/RuntimeConfig";
import type { RendererCapabilities } from "../../render/RendererCapabilities";
import { disposeResources } from "../../render/ResourceDisposal";
import { withRendererState } from "../../render/RendererStateScope";
import { WORLD_ZELDA_EXPOSURE } from "../../app/WorldEnvironmentTuning";
import { WORLD_CLOUD_TIME_WRAP_SECONDS } from "./WorldCloudWeather";
import { WorldSkyAnalyticNodeMaterial } from "./WorldSkyAnalyticNodeMaterial";
import { WorldCloudTemporalNodePass } from "./WorldCloudTemporalNodePass";

const SKY_RADIUS = 4000;

/** Owns the portable sky, optional volume history and cloud-free IBL bake.
 * The frame owner calls prepareFrame once before beauty rendering; offscreen
 * water/atlas cameras must not advance this history from mesh callbacks.
 */
export class WorldSkyNode {
  private readonly geometry = new SphereGeometry(SKY_RADIUS, 32, 16);
  private material!: WorldSkyAnalyticNodeMaterial;
  private mesh?: Mesh;
  private volume?: WorldCloudTemporalNodePass;
  private environment?: RenderTarget;
  private readonly previousEnvironment;
  private readonly previousBackground;
  private elapsed = 0;
  private readonly focus = new Vector3();
  private disposed = false;

  constructor(private readonly scene: Scene, private readonly renderer: WebGPURenderer,
    private readonly profile: RuntimeProfile, capabilities: RendererCapabilities) {
    this.previousEnvironment = scene.environment;
    this.previousBackground = scene.background;
    try {
      if (!profile.compact && profile.cloud.enabled && profile.cloud.volumetricEnabled) {
        this.volume = new WorldCloudTemporalNodePass(renderer, profile, capabilities);
      }
      this.material = new WorldSkyAnalyticNodeMaterial(profile, this.volume?.texture);
      this.mesh = new Mesh(this.geometry, this.material.material);
      this.mesh.name = "world-sky-dome";
      this.mesh.frustumCulled = false;
      this.mesh.renderOrder = 900;
      scene.add(this.mesh);
      scene.background = null;
      renderer.toneMappingExposure = WORLD_ZELDA_EXPOSURE;
      if (!profile.compact) this.bakeEnvironment();
    } catch (error) {
      try { this.dispose(); } catch (cleanupError) { console.warn("Sky node rollback failed.", cleanupError); }
      throw error;
    }
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
    try { this.material.volumeMap.value = this.volume.render(camera, this.elapsed); }
    catch (error) {
      const previous = this.material;
      const volume = this.volume;
      this.volume = undefined;
      this.material = new WorldSkyAnalyticNodeMaterial(this.profile);
      this.material.update(this.elapsed, this.focus);
      this.mesh.material = this.material.material;
      disposeResources([previous, volume]);
      console.warn("Temporal clouds unavailable; using analytic clouds.", error);
    }
  }

  resetHistory(): void { this.volume?.resetHistory(); }

  private bakeEnvironment(): void {
    // r185's documented renderTarget option lets us own the output even if
    // a bake throws. Dimensions follow its 256px CubeUV packing layout.
    const target = new RenderTarget(768, 1024, { type: HalfFloatType, minFilter: LinearFilter,
      magFilter: LinearFilter, generateMipmaps: false, depthBuffer: true });
    target.texture.mapping = CubeUVReflectionMapping;
    target.texture.colorSpace = LinearSRGBColorSpace;
    const bake = new WorldSkyAnalyticNodeMaterial({ ...this.profile,
      cloud: { ...this.profile.cloud, enabled: false, godRays: false } });
    const generator = new PMREMGenerator(this.renderer);
    try {
      const scene = new Scene();
      scene.add(new Mesh(this.geometry, bake.material));
      withRendererState(this.renderer, () => generator.fromScene(scene, 0, 0.1, SKY_RADIUS, { size: 256, renderTarget: target }));
      this.scene.environment = target.texture;
      this.environment = target;
    } catch (error) {
      target.dispose();
      console.warn("Sky environment bake unavailable; continuing without IBL.", error);
    } finally { disposeResources([bake, generator]); }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh?.removeFromParent();
    if (this.environment && this.scene.environment === this.environment.texture) this.scene.environment = this.previousEnvironment;
    if (this.scene.background === null) this.scene.background = this.previousBackground;
    disposeResources([this.volume, this.material, this.geometry, this.environment]);
  }
}
