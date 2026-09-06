import * as THREE from "three";
import { WORLD_SUN_DIRECTION } from "../../app/WorldEnvironmentTuning";
import type { RuntimeProfile } from "../../runtime/RuntimeConfig";
import { sampleCloudPointDirectTransmittance } from "./WorldCloudWeather";
import {
  WORLD_CLOUD_FULLSCREEN_VERTEX_SHADER,
  WORLD_CLOUD_SHADOW_FRAGMENT_SHADER,
} from "./WorldCloudShadowShader";
import {
  createWorldCloudShadowUniforms,
  type WorldCloudShadowUniforms,
} from "./WorldCloudShadowUniforms";

const SUN_DIRECTION = new THREE.Vector3(...WORLD_SUN_DIRECTION).normalize();

export interface WorldCloudShadowDiagnostics {
  enabled: boolean;
  resolution: number;
  worldSize: number;
  focusTransmittance: number;
  originX: number;
  originZ: number;
}

export class WorldCloudShadowMap {
  private readonly consumerUniforms: WorldCloudShadowUniforms;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.Camera();
  private readonly origin = new THREE.Vector2();
  private readonly viewport = new THREE.Vector4();
  private readonly scissor = new THREE.Vector4();
  private renderTarget?: THREE.WebGLRenderTarget;
  private geometry?: THREE.PlaneGeometry;
  private material?: THREE.ShaderMaterial;
  private mesh?: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private runtimeEnabled = true;
  private disposed = false;
  private faulted = false;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly profile: RuntimeProfile,
  ) {
    this.consumerUniforms = createWorldCloudShadowUniforms(
      profile.cloud,
      SUN_DIRECTION,
    );
    if (!profile.cloud.enabled) {
      this.consumerUniforms.uCloudShadowEnabled.value = 0;
      return;
    }

    let renderTarget: THREE.WebGLRenderTarget | undefined;
    let geometry: THREE.PlaneGeometry | undefined;
    let material: THREE.ShaderMaterial | undefined;
    let mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> | undefined;
    try {
      const resolution = Math.min(
        profile.cloud.shadowMapResolution,
        renderer.capabilities.maxTextureSize,
      );
      renderTarget = new THREE.WebGLRenderTarget(resolution, resolution, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        depthBuffer: false,
        stencilBuffer: false,
      });
      renderTarget.texture.name = "world-cloud-shadow-transmittance";
      renderTarget.texture.wrapS = THREE.ClampToEdgeWrapping;
      renderTarget.texture.wrapT = THREE.ClampToEdgeWrapping;
      renderTarget.texture.generateMipmaps = false;
      renderTarget.texture.colorSpace = THREE.NoColorSpace;
      geometry = new THREE.PlaneGeometry(2, 2);
      const cloud = profile.cloud;
      material = new THREE.ShaderMaterial({
        name: "world-cloud-shadow-map",
        vertexShader: WORLD_CLOUD_FULLSCREEN_VERTEX_SHADER,
        fragmentShader: WORLD_CLOUD_SHADOW_FRAGMENT_SHADER,
        defines: {
          WORLD_CLOUD_SHADOW_STEPS: cloud.shadowSteps,
          ...(profile.compact ? { WORLD_CLOUD_COMPACT: 1 } : {}),
        },
        uniforms: {
          uShadowOriginXZ: { value: this.origin },
          uShadowWorldSize: { value: cloud.shadowWorldSize },
          uSkySunDirection: { value: SUN_DIRECTION.clone() },
          uTime: { value: 0 },
          uCloudCoverage: { value: cloud.coverage },
          uCloudSoftness: { value: cloud.softness },
          uCloudThickness: { value: cloud.thickness },
          uCloudExtinction: { value: cloud.extinction },
          uCloudMacroScale: { value: cloud.macroScale },
          uCloudDetailScale: { value: cloud.detailScale },
          uCloudWeatherScale: { value: cloud.weatherScale },
          uCloudWind: { value: new THREE.Vector2(cloud.windX, cloud.windZ) },
          uCloudDetailWind: {
            value: new THREE.Vector2(cloud.detailWindX, cloud.detailWindZ),
          },
          uCloudShadowStrength: { value: cloud.shadowStrength },
          uCloudMinimumDirectTransmittance: {
            value: cloud.minimumDirectTransmittance,
          },
        },
        depthTest: false,
        depthWrite: false,
        transparent: false,
        toneMapped: false,
      });
      mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.renderTarget = renderTarget;
      this.geometry = geometry;
      this.material = material;
      this.mesh = mesh;
      this.consumerUniforms.uCloudShadowMap.value = renderTarget.texture;
    } catch (error) {
      mesh?.removeFromParent();
      geometry?.dispose();
      material?.dispose();
      renderTarget?.dispose();
      this.disableAfterFault("creation", error);
    }
  }

  getUniforms(): WorldCloudShadowUniforms {
    return this.consumerUniforms;
  }

  setEnabled(enabled: boolean): void {
    this.runtimeEnabled = enabled;
    this.consumerUniforms.uCloudShadowEnabled.value =
      enabled && !this.faulted && !!this.renderTarget ? 1 : 0;
    if (!enabled) {
      this.consumerUniforms.uCloudFocusTransmittance.value = 1;
    }
  }

  update(focus: THREE.Vector3, elapsedSeconds: number): void {
    if (
      this.disposed ||
      this.faulted ||
      !this.runtimeEnabled ||
      !this.renderTarget ||
      !this.material
    ) {
      this.consumerUniforms.uCloudFocusTransmittance.value = 1;
      return;
    }
    if (
      !Number.isFinite(focus.x) ||
      !Number.isFinite(focus.y) ||
      !Number.isFinite(focus.z) ||
      this.isContextLost()
    ) {
      this.suspendSpatialShadows();
      return;
    }
    this.consumerUniforms.uCloudShadowEnabled.value = 1;

    const sunVertical = Math.max(SUN_DIRECTION.y, 0.08);
    const heightToCloud = Math.max(this.profile.cloud.baseHeight - focus.y, 0);
    const focusCloudX =
      focus.x + SUN_DIRECTION.x * (heightToCloud / sunVertical);
    const focusCloudZ =
      focus.z + SUN_DIRECTION.z * (heightToCloud / sunVertical);
    const texelSize =
      this.profile.cloud.shadowWorldSize / this.renderTarget.width;
    this.origin.set(
      Math.round(focusCloudX / texelSize) * texelSize,
      Math.round(focusCloudZ / texelSize) * texelSize,
    );
    this.consumerUniforms.uCloudShadowOriginXZ.value.copy(this.origin);
    this.consumerUniforms.uCloudFocusTransmittance.value =
      sampleCloudPointDirectTransmittance(
        this.profile.cloud,
        this.profile.compact,
        focus.x,
        focus.y,
        focus.z,
        elapsedSeconds,
        SUN_DIRECTION,
      );
    this.material.uniforms.uTime.value = elapsedSeconds;

    const previousTarget = this.renderer.getRenderTarget();
    const previousScissorTest = this.renderer.getScissorTest();
    this.renderer.getViewport(this.viewport);
    this.renderer.getScissor(this.scissor);
    try {
      this.renderer.setRenderTarget(this.renderTarget);
      this.renderer.setViewport(0, 0, this.renderTarget.width, this.renderTarget.height);
      this.renderer.setScissorTest(false);
      this.renderer.clear(true, false, false);
      this.renderer.render(this.scene, this.camera);
    } catch (error) {
      this.disableAfterFault("render", error);
    } finally {
      this.renderer.setRenderTarget(previousTarget);
      this.renderer.setViewport(this.viewport);
      this.renderer.setScissor(this.scissor);
      this.renderer.setScissorTest(previousScissorTest);
    }
    if (this.faulted) {
      this.releaseGpuResources();
    }
  }

  readDebugPixels(target: Uint8Array): boolean {
    const renderTarget = this.renderTarget;
    if (
      this.disposed ||
      !renderTarget ||
      this.isContextLost() ||
      target.length < renderTarget.width * renderTarget.height * 4
    ) {
      return false;
    }
    try {
      this.renderer.readRenderTargetPixels(
        renderTarget,
        0,
        0,
        renderTarget.width,
        renderTarget.height,
        target,
      );
      return true;
    } catch (error) {
      console.warn(
        "[Drusniel World] Cloud shadow debug readback failed.",
        error,
      );
      return false;
    }
  }

  getDiagnostics(): WorldCloudShadowDiagnostics {
    return {
      enabled: this.consumerUniforms.uCloudShadowEnabled.value >= 0.5,
      resolution: this.renderTarget?.width ?? 0,
      worldSize: this.profile.cloud.shadowWorldSize,
      focusTransmittance: this.consumerUniforms.uCloudFocusTransmittance.value,
      originX: this.origin.x,
      originZ: this.origin.y,
    };
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.consumerUniforms.uCloudShadowEnabled.value = 0;
    this.consumerUniforms.uCloudShadowMap.value = null;
    this.consumerUniforms.uCloudFocusTransmittance.value = 1;
    this.releaseGpuResources();
  }

  private isContextLost(): boolean {
    return this.renderer.getContext().isContextLost();
  }

  private suspendSpatialShadows(): void {
    this.consumerUniforms.uCloudShadowEnabled.value = 0;
    this.consumerUniforms.uCloudFocusTransmittance.value = 1;
  }

  private releaseGpuResources(): void {
    this.mesh?.removeFromParent();
    this.geometry?.dispose();
    this.material?.dispose();
    this.renderTarget?.dispose();
    this.mesh = undefined;
    this.geometry = undefined;
    this.material = undefined;
    this.renderTarget = undefined;
  }

  private disableAfterFault(stage: string, error: unknown): void {
    if (this.faulted) {
      return;
    }
    this.faulted = true;
    this.consumerUniforms.uCloudShadowEnabled.value = 0;
    this.consumerUniforms.uCloudShadowMap.value = null;
    this.consumerUniforms.uCloudFocusTransmittance.value = 1;
    console.warn(
      `[Drusniel World] Cloud shadow map ${stage} failed; spatial cloud shadows disabled.`,
      error,
    );
  }
}
