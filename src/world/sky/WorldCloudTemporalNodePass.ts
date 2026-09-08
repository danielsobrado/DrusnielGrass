import { LinearFilter, Matrix4, QuadMesh, Quaternion, RenderTarget, Vector2, Vector3,
  type PerspectiveCamera, type WebGPURenderer } from "three/webgpu";
import type { RuntimeProfile } from "../../runtime/RuntimeConfig";
import type { WorldLightingState } from "../../render/WorldLightingState";
import type { RendererCapabilities } from "../../render/RendererCapabilities";
import { renderNodePass } from "../../render/RenderNodePass";
import { disposeResources } from "../../render/ResourceDisposal";
import { createWorldCloudVolumeNodes } from "./WorldCloudVolumeNodes";
import { createWorldCloudTemporalNodes } from "./WorldCloudTemporalNodes";
import { resolveWorldCloudVolumeQuality } from "./WorldCloudVolumeQuality";

const createTarget = () => new RenderTarget(1, 1, { depthBuffer: false, stencilBuffer: false,
  minFilter: LinearFilter, magFilter: LinearFilter, generateMipmaps: false });

export class WorldCloudTemporalNodePass {
  private readonly raw;
  private readonly history;
  private readonly size = new Vector2();
  private readonly previousViewProjection = new Matrix4();
  private readonly previousProjection = new Matrix4();
  private readonly previousPosition = new Vector3();
  private readonly previousRotation = new Quaternion();
  private readonly cameraPosition = new Vector3();
  private readonly cameraRotation = new Quaternion();
  private previousCamera = "";
  private readonly volume;
  private readonly temporal;
  private readonly quad;
  private readonly quality;
  private frame = 0;
  private readIndex = 0;
  private previousTime = Number.NaN;
  private valid = false;
  private disposed = false;

  constructor(private readonly renderer: WebGPURenderer, profile: RuntimeProfile,
    capabilities: RendererCapabilities, lighting?: WorldLightingState) {
    this.quality = resolveWorldCloudVolumeQuality(profile, { capabilities });
    if (!this.quality.enabled) throw new Error("Temporal volumetric clouds are disabled for this profile.");
    const owned: { dispose(): void }[] = [];
    const own = <T extends { dispose(): void }>(resource: T): T => { owned.push(resource); return resource; };
    try {
      this.raw = own(createTarget());
      this.history = [own(createTarget()), own(createTarget())];
      this.volume = createWorldCloudVolumeNodes(profile, this.quality.steps, lighting);
      own(this.volume.material);
      this.temporal = createWorldCloudTemporalNodes(profile.cloud, this.raw.texture, this.history[0].texture);
      own(this.temporal.material);
      this.quad = new QuadMesh(this.volume.material);
    } catch (error) {
      try { disposeResources(owned.reverse()); } catch (cleanupError) { console.warn("Cloud pass rollback failed.", cleanupError); }
      throw error;
    }
  }

  get texture() { return this.history[this.readIndex].texture; }
  get tier() { return this.quality.tier; }
  getDiagnostics() {
    return { width: this.raw.width, height: this.raw.height, frame: this.frame,
      historyUsed: this.temporal.historyValid.value >= 0.5, historyReady: this.valid };
  }

  applyLightingState(lighting: WorldLightingState): void {
    if (this.disposed) return;
    this.volume.field.coverage.value = lighting.cloudThreshold;
    this.resetHistory();
  }

  render(camera: PerspectiveCamera, elapsedSeconds: number) {
    if (this.disposed) throw new Error("Cloud temporal node pass has been disposed.");
    const renderer = this.renderer;
    renderer.getDrawingBufferSize(this.size);
    const width = Math.max(1, Math.ceil(this.size.x * this.quality.resolutionScale));
    const height = Math.max(1, Math.ceil(this.size.y * this.quality.resolutionScale));
    if (width !== this.raw.width || height !== this.raw.height) {
      for (const target of [this.raw, ...this.history]) target.setSize(width, height);
      this.resetHistory();
    }
    // Offscreen passes can run before the beauty renderer has synchronized it.
    if (camera.coordinateSystem !== renderer.coordinateSystem) {
      camera.coordinateSystem = renderer.coordinateSystem;
      camera.updateProjectionMatrix();
      this.resetHistory();
    }
    camera.updateMatrixWorld();
    camera.getWorldPosition(this.cameraPosition);
    camera.getWorldQuaternion(this.cameraRotation);
    // Teleports, abrupt turns, camera replacement and projection changes cannot
    // borrow history from the old view. Ordinary walking retains accumulation.
    if (camera.uuid !== this.previousCamera || !camera.projectionMatrix.equals(this.previousProjection)
      || this.cameraPosition.distanceToSquared(this.previousPosition) > 64 * 64
      || Math.abs(this.cameraRotation.dot(this.previousRotation)) < 0.95) this.resetHistory();
    let delta = elapsedSeconds - this.previousTime;
    if (!Number.isFinite(delta) || delta < 0 || delta > 0.25) { this.valid = false; delta = 0; }
    const volume = this.volume;
    volume.inverseProjection.value.copy(camera.projectionMatrixInverse);
    volume.cameraWorld.value.copy(camera.matrixWorld);
    camera.getWorldPosition(volume.cameraPosition.value);
    volume.field.time.value = elapsedSeconds;
    volume.frameIndex.value = this.frame;
    this.quad.material = volume.material;
    renderNodePass(renderer, this.raw, this.quad);
    const temporal = this.temporal;
    temporal.inverseProjection.value.copy(camera.projectionMatrixInverse);
    temporal.cameraWorld.value.copy(camera.matrixWorld);
    camera.getWorldPosition(temporal.cameraPosition.value);
    temporal.previousViewProjection.value.copy(this.previousViewProjection);
    temporal.delta.value = delta;
    temporal.historyValid.value = this.valid ? 1 : 0;
    temporal.historyMap.value = this.history[this.readIndex].texture;
    const writeIndex = 1 - this.readIndex;
    this.quad.material = temporal.material;
    renderNodePass(renderer, this.history[writeIndex], this.quad);
    this.previousViewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.previousProjection.copy(camera.projectionMatrix);
    this.previousPosition.copy(this.cameraPosition);
    this.previousRotation.copy(this.cameraRotation);
    this.previousCamera = camera.uuid;
    this.readIndex = writeIndex;
    this.valid = true;
    this.previousTime = elapsedSeconds;
    this.frame = (this.frame + 1) % 4096;
    return this.texture;
  }

  resetHistory(): void { this.valid = false; this.previousTime = Number.NaN; }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    disposeResources([this.volume.material, this.temporal.material, this.raw, ...this.history]);
  }
}
