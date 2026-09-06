import * as THREE from "three";
import type { RuntimeProfile } from "../../runtime/RuntimeConfig";
import {
  createWorldCloudTemporalMaterial,
  createWorldCloudVolumeMaterial,
} from "./WorldCloudPassMaterials";
import {
  resolveWorldCloudVolumeQuality,
  type WorldCloudVolumeQuality,
} from "./WorldCloudVolumeQuality";

const MAX_HISTORY_DELTA_SECONDS = 0.25;

export class WorldCloudTemporalPass {
  private readonly quality: WorldCloudVolumeQuality;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly geometry = new THREE.PlaneGeometry(2, 2);
  private readonly volumeMaterial: THREE.ShaderMaterial;
  private readonly temporalMaterial: THREE.ShaderMaterial;
  private readonly quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly rawTarget = createTarget();
  private readonly historyTargets = [createTarget(), createTarget()] as const;
  private readonly drawingBufferSize = new THREE.Vector2();
  private readonly previousViewProjection = new THREE.Matrix4();
  private readonly currentViewProjection = new THREE.Matrix4();
  private readonly viewport = new THREE.Vector4();
  private readonly scissor = new THREE.Vector4();
  private readonly clearColor = new THREE.Color();
  private historyReadIndex = 0;
  private width = 0;
  private height = 0;
  private frameIndex = 0;
  private previousTime = Number.NaN;
  private historyValid = false;
  private disposed = false;

  constructor(renderer: THREE.WebGLRenderer, profile: RuntimeProfile) {
    this.quality = resolveWorldCloudVolumeQuality(profile, renderer);
    if (!this.quality.enabled) {
      throw new Error("Temporal volumetric clouds are disabled for this profile.");
    }
    this.volumeMaterial = createWorldCloudVolumeMaterial(
      profile,
      this.quality.steps,
    );
    this.temporalMaterial = createWorldCloudTemporalMaterial(profile);
    this.quad = new THREE.Mesh(this.geometry, this.volumeMaterial);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  get tier(): WorldCloudVolumeQuality["tier"] {
    return this.quality.tier;
  }

  render(
    renderer: THREE.WebGLRenderer,
    perspectiveCamera: THREE.PerspectiveCamera,
    elapsedSeconds: number,
  ): THREE.Texture {
    if (this.disposed) {
      throw new Error("WorldCloudTemporalPass has been disposed.");
    }
    this.ensureSize(renderer);
    perspectiveCamera.updateMatrixWorld();
    const deltaSeconds = this.resolveDeltaSeconds(elapsedSeconds);
    this.updateVolumeUniforms(perspectiveCamera, elapsedSeconds);
    this.renderPass(renderer, this.rawTarget, this.volumeMaterial);

    const writeIndex = 1 - this.historyReadIndex;
    this.updateTemporalUniforms(perspectiveCamera, deltaSeconds);
    this.temporalMaterial.uniforms.uCurrentTexture.value = this.rawTarget.texture;
    this.temporalMaterial.uniforms.uHistoryTexture.value =
      this.historyTargets[this.historyReadIndex].texture;
    this.renderPass(
      renderer,
      this.historyTargets[writeIndex],
      this.temporalMaterial,
    );

    this.currentViewProjection.multiplyMatrices(
      perspectiveCamera.projectionMatrix,
      perspectiveCamera.matrixWorldInverse,
    );
    this.previousViewProjection.copy(this.currentViewProjection);
    this.historyReadIndex = writeIndex;
    this.historyValid = true;
    this.previousTime = elapsedSeconds;
    this.frameIndex = (this.frameIndex + 1) % 4096;
    return this.historyTargets[this.historyReadIndex].texture;
  }

  resetHistory(): void {
    this.historyValid = false;
    this.previousTime = Number.NaN;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.quad.removeFromParent();
    this.geometry.dispose();
    this.volumeMaterial.dispose();
    this.temporalMaterial.dispose();
    this.rawTarget.dispose();
    this.historyTargets[0].dispose();
    this.historyTargets[1].dispose();
  }

  private ensureSize(renderer: THREE.WebGLRenderer): void {
    renderer.getDrawingBufferSize(this.drawingBufferSize);
    const width = Math.max(
      1,
      Math.ceil(this.drawingBufferSize.x * this.quality.resolutionScale),
    );
    const height = Math.max(
      1,
      Math.ceil(this.drawingBufferSize.y * this.quality.resolutionScale),
    );
    if (width === this.width && height === this.height) {
      return;
    }
    this.width = width;
    this.height = height;
    this.rawTarget.setSize(width, height);
    this.historyTargets[0].setSize(width, height);
    this.historyTargets[1].setSize(width, height);
    this.resetHistory();
  }

  private updateVolumeUniforms(
    camera: THREE.PerspectiveCamera,
    elapsedSeconds: number,
  ): void {
    const uniforms = this.volumeMaterial.uniforms;
    uniforms.uProjectionMatrixInverse.value.copy(camera.projectionMatrixInverse);
    uniforms.uCameraMatrixWorld.value.copy(camera.matrixWorld);
    camera.getWorldPosition(uniforms.uCameraPosition.value as THREE.Vector3);
    uniforms.uTime.value = elapsedSeconds;
    uniforms.uFrameIndex.value = this.frameIndex;
  }

  private updateTemporalUniforms(
    camera: THREE.PerspectiveCamera,
    deltaSeconds: number,
  ): void {
    const uniforms = this.temporalMaterial.uniforms;
    uniforms.uProjectionMatrixInverse.value.copy(camera.projectionMatrixInverse);
    uniforms.uCameraMatrixWorld.value.copy(camera.matrixWorld);
    camera.getWorldPosition(uniforms.uCameraPosition.value as THREE.Vector3);
    uniforms.uPreviousViewProjection.value.copy(this.previousViewProjection);
    uniforms.uDeltaSeconds.value = deltaSeconds;
    uniforms.uHistoryValid.value = this.historyValid ? 1 : 0;
  }

  private resolveDeltaSeconds(elapsedSeconds: number): number {
    if (!Number.isFinite(this.previousTime)) {
      return 0;
    }
    const delta = elapsedSeconds - this.previousTime;
    if (
      !Number.isFinite(delta) ||
      delta < 0 ||
      delta > MAX_HISTORY_DELTA_SECONDS
    ) {
      this.historyValid = false;
      return 0;
    }
    return delta;
  }

  private renderPass(
    renderer: THREE.WebGLRenderer,
    target: THREE.WebGLRenderTarget,
    material: THREE.ShaderMaterial,
  ): void {
    const previousTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    const previousScissorTest = renderer.getScissorTest();
    renderer.getViewport(this.viewport);
    renderer.getScissor(this.scissor);
    renderer.getClearColor(this.clearColor);
    const previousClearAlpha = renderer.getClearAlpha();

    try {
      this.quad.material = material;
      renderer.autoClear = false;
      renderer.setRenderTarget(target);
      renderer.setViewport(0, 0, this.width, this.height);
      renderer.setScissorTest(false);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, false, false);
      renderer.render(this.scene, this.camera);
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.setViewport(this.viewport);
      renderer.setScissor(this.scissor);
      renderer.setScissorTest(previousScissorTest);
      renderer.setClearColor(this.clearColor, previousClearAlpha);
      renderer.autoClear = previousAutoClear;
    }
  }
}

function createTarget(): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(1, 1, {
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
  });
}
