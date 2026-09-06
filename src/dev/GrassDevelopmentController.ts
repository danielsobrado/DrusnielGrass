import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { GrassSystem } from "../grass/GrassSystem";
import {
  OctahedralImpostorBaker,
  type ImpostorDownloadPanel,
} from "../grass/impostors/OctahedralImpostorBaker";
import { GrassQaRunner } from "../qa/GrassQaRunner";

interface GrassDevelopmentDependencies {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  grassSystem: GrassSystem;
}

interface WindowWithDevelopmentResults extends Window {
  __FLUFFY_GRASS_IMPOSTOR_BAKE__?: unknown;
  __FLUFFY_GRASS_QA__?: unknown;
}

export class GrassDevelopmentController {
  private readonly abortController = new AbortController();
  private bakePanel?: ImpostorDownloadPanel;
  private qaRunner?: GrassQaRunner;
  private started = false;
  private disposed = false;

  constructor(private readonly dependencies: GrassDevelopmentDependencies) {}

  async run(): Promise<void> {
    if (this.started || this.disposed) {
      return;
    }
    this.started = true;

    const params = new URLSearchParams(window.location.search);
    if (params.get("grassImpostorBake") === "1") {
      await this.runImpostorBake();
    }
    if (this.disposed) {
      return;
    }

    const qaMode = params.get("qa");
    if (qaMode === "grass" || qaMode === "grass-lod") {
      const qaConfig = this.dependencies.grassSystem.getQaConfig();
      const runner = new GrassQaRunner(this.dependencies);
      this.qaRunner = runner;
      try {
        await runner.run(
          {
            warmupSeconds: this.readNonNegativeNumber(
              params,
              "warmup",
              qaConfig.warmupSeconds,
            ),
            sampleSeconds: this.readPositiveNumber(
              params,
              "duration",
              qaConfig.sampleSeconds,
            ),
            download: params.get("download") === "1",
          },
          this.abortController.signal,
        );
      } catch (error) {
        if (this.qaRunner === runner) {
          this.qaRunner = undefined;
          runner.dispose();
        }
        throw error;
      }
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.abortController.abort();
    this.qaRunner?.dispose();
    this.qaRunner = undefined;
    this.bakePanel?.dispose();
    this.bakePanel = undefined;
    const windowWithResults = window as WindowWithDevelopmentResults;
    delete windowWithResults.__FLUFFY_GRASS_IMPOSTOR_BAKE__;
    delete windowWithResults.__FLUFFY_GRASS_QA__;
  }

  private async runImpostorBake(): Promise<void> {
    const target = this.dependencies.grassSystem.getImpostorBakeTarget();
    if (!target) {
      throw new Error("No grass patch is available for impostor baking.");
    }

    const { controls } = this.dependencies;
    const previousEnabled = controls.enabled;
    const previousAutoRotate = controls.autoRotate;
    controls.enabled = false;
    controls.autoRotate = false;
    this.dependencies.grassSystem.setLodBakeOverride(true);

    try {
      const baker = new OctahedralImpostorBaker(this.dependencies.renderer);
      const result = await baker.bake({
        scene: this.dependencies.scene,
        source: target.object,
        bounds: target.bounds,
        config: this.dependencies.grassSystem.getImpostorConfig(),
      });
      if (this.disposed) {
        return;
      }
      this.bakePanel?.dispose();
      this.bakePanel = baker.createDownloadLinks(
        result,
        `grass-impostor-${target.patchId}`,
      );
      (window as WindowWithDevelopmentResults).__FLUFFY_GRASS_IMPOSTOR_BAKE__ =
        result.metadata;
      console.info("[FluffyGrass] Impostor bake complete", result.metadata);
    } finally {
      if (!this.disposed) {
        controls.enabled = previousEnabled;
        controls.autoRotate = previousAutoRotate;
        this.dependencies.grassSystem.setLodBakeOverride(false);
      }
    }
  }

  private readNonNegativeNumber(
    params: URLSearchParams,
    key: string,
    fallback: number,
  ): number {
    const rawValue = params.get(key);
    if (!rawValue) {
      return fallback;
    }

    const value = Number(rawValue);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  }

  private readPositiveNumber(
    params: URLSearchParams,
    key: string,
    fallback: number,
  ): number {
    const rawValue = params.get(key);
    if (!rawValue) {
      return fallback;
    }

    const value = Number(rawValue);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}
