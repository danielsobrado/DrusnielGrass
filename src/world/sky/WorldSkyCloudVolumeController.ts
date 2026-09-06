import * as THREE from "three";
import type { RuntimeProfile } from "../../runtime/RuntimeConfig";
import { WorldCloudTemporalPass } from "./WorldCloudTemporalPass";
import {
  disableWorldSkyTemporalClouds,
  enableWorldSkyTemporalClouds,
} from "./WorldSkyMaterial";

type SkyMesh = THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;

export class WorldSkyCloudVolumeController {
  private readonly drawingBufferSize = new THREE.Vector2();
  private cloudPass?: WorldCloudTemporalPass;
  private elapsedSeconds = 0;
  private disposed = false;

  constructor(
    private readonly scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
    private readonly mesh: SkyMesh,
    profile: RuntimeProfile,
  ) {
    if (
      profile.compact ||
      !profile.cloud.enabled ||
      !profile.cloud.volumetricEnabled
    ) {
      return;
    }
    try {
      const pass = new WorldCloudTemporalPass(renderer, profile);
      this.cloudPass = pass;
      this.scene.userData.worldCloudVolumeTier = pass.tier;
      enableWorldSkyTemporalClouds(this.mesh.material);
      this.mesh.onBeforeRender = this.renderTemporalClouds;
    } catch (error) {
      console.warn(
        "[Drusniel World] Temporal volumetric clouds unavailable; using analytic clouds.",
        error,
      );
      this.releasePass();
    }
  }

  update(elapsedSeconds: number): void {
    this.elapsedSeconds = elapsedSeconds;
  }

  resetHistory(): void {
    this.cloudPass?.resetHistory();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.mesh.onBeforeRender = () => {};
    this.releasePass();
  }

  private readonly renderTemporalClouds = (
    renderer: THREE.WebGLRenderer,
    _scene: THREE.Scene,
    camera: THREE.Camera,
  ): void => {
    const pass = this.cloudPass;
    if (
      this.disposed ||
      !pass ||
      !(camera instanceof THREE.PerspectiveCamera)
    ) {
      return;
    }
    try {
      const texture = pass.render(renderer, camera, this.elapsedSeconds);
      this.mesh.material.uniforms.uCloudTemporalTexture.value = texture;
      renderer.getDrawingBufferSize(this.drawingBufferSize);
      const inverseViewport = this.mesh.material.uniforms.uCloudViewportInverse
        .value as THREE.Vector2;
      inverseViewport.set(
        1 / Math.max(1, this.drawingBufferSize.x),
        1 / Math.max(1, this.drawingBufferSize.y),
      );
    } catch (error) {
      console.warn(
        "[Drusniel World] Temporal volumetric clouds disabled after a render fault.",
        error,
      );
      this.releasePass();
      disableWorldSkyTemporalClouds(this.mesh.material);
      this.mesh.onBeforeRender = () => {};
    }
  };

  private releasePass(): void {
    const pass = this.cloudPass;
    this.cloudPass = undefined;
    delete this.scene.userData.worldCloudVolumeTier;
    if (!pass) {
      return;
    }
    try {
      pass.dispose();
    } catch (error) {
      console.warn("[Drusniel World] Cloud volume cleanup failed.", error);
    }
  }
}
