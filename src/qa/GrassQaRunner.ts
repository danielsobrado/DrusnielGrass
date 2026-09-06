import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { GrassSystem } from "../grass/GrassSystem";
import { GrassQaDownloads } from "./GrassQaDownloads";
import { GrassQaMetrics } from "./GrassQaMetrics";
import type {
  GrassQaCapture,
  GrassQaOptions,
  GrassQaPose,
  GrassQaReport,
} from "./GrassQaTypes";

interface GrassQaDependencies {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  grassSystem: GrassSystem;
}

interface WindowWithGrassQa extends Window {
  __FLUFFY_GRASS_QA__?: GrassQaReport;
}

export class GrassQaRunner {
  private readonly metrics = new GrassQaMetrics();
  private readonly downloads = new GrassQaDownloads();
  private disposed = false;

  constructor(private readonly dependencies: GrassQaDependencies) {}

  async run(
    options: GrassQaOptions,
    signal?: AbortSignal,
  ): Promise<GrassQaReport> {
    this.throwIfUnavailable(signal);
    const { camera, controls } = this.dependencies;
    const previousPosition = camera.position.clone();
    const previousTarget = controls.target.clone();
    const previousEnabled = controls.enabled;
    const previousAutoRotate = controls.autoRotate;
    const previousEnableDamping = controls.enableDamping;
    const captures: GrassQaCapture[] = [];

    controls.enabled = false;
    controls.autoRotate = false;
    controls.enableDamping = false;
    // Flush any input inertia while the original view is still active. With
    // damping disabled, OrbitControls consumes and clears its pending deltas.
    controls.update();

    try {
      for (const pose of this.createPoses()) {
        this.throwIfUnavailable(signal);
        this.applyPose(pose);
        await this.metrics.sampleFrames(options.warmupSeconds, false, signal);
        const frameDurations = await this.metrics.sampleFrames(
          options.sampleSeconds,
          true,
          signal,
        );
        this.throwIfUnavailable(signal);
        this.dependencies.renderer.render(
          this.dependencies.scene,
          this.dependencies.camera,
        );
        const screenshot = await this.downloads.captureScreenshot(
          this.dependencies.renderer,
          pose.name,
          signal,
        );
        this.throwIfUnavailable(signal);
        const screenshotName = `${pose.name}.png`;
        captures.push({
          name: pose.name,
          camera: {
            position: [camera.position.x, camera.position.y, camera.position.z],
            target: [controls.target.x, controls.target.y, controls.target.z],
          },
          frameStats: this.metrics.summarizeFrames(frameDurations),
          renderer: this.metrics.readRendererStats(this.dependencies.renderer),
          grass: this.dependencies.grassSystem.getDiagnostics(),
          screenshot: screenshotName,
        });
        this.downloads.add(screenshot, screenshotName, pose.name);
      }
    } finally {
      camera.position.copy(previousPosition);
      controls.target.copy(previousTarget);
      controls.autoRotate = false;
      controls.enableDamping = false;
      if (!signal?.aborted && !this.disposed) {
        controls.update();
      }
      controls.enableDamping = previousEnableDamping;
      controls.autoRotate = previousAutoRotate;
      controls.enabled = previousEnabled;
    }

    this.throwIfUnavailable(signal);
    const report: GrassQaReport = {
      version: 1,
      generatedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
      options,
      captures,
    };

    (window as WindowWithGrassQa).__FLUFFY_GRASS_QA__ = report;
    console.info("[FluffyGrass] Grass QA report", report);
    this.downloads.add(
      new Blob([JSON.stringify(report, null, 2)], {
        type: "application/json",
      }),
      "grass-qa-report.json",
      "QA report",
    );
    if (options.download) {
      this.downloads.triggerPending();
    }
    return report;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.downloads.dispose();
    delete (window as WindowWithGrassQa).__FLUFFY_GRASS_QA__;
  }

  private createPoses(): GrassQaPose[] {
    const bounds = this.dependencies.grassSystem.getBounds();
    const lod = this.dependencies.grassSystem.getLodConfig();
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const horizontalRadius = Math.max(size.x, size.z) * 0.5;
    const target = center.clone().add(new THREE.Vector3(0, size.y * 0.15, 0));
    const diagonal = new THREE.Vector3(1, 0, 1).normalize();

    return [
      {
        name: "grass-close",
        position: target
          .clone()
          .addScaledVector(diagonal, Math.max(2.5, lod.nearMaxDistance * 0.28))
          .add(new THREE.Vector3(0, Math.max(1.6, size.y * 0.16), 0)),
        target: target.clone(),
      },
      {
        name: "grass-lod-transition",
        position: target
          .clone()
          .addScaledVector(diagonal, lod.nearMaxDistance)
          .add(new THREE.Vector3(0, Math.max(2.5, size.y * 0.28), 0)),
        target: target.clone(),
      },
      {
        name: "grass-aerial",
        position: target
          .clone()
          .add(
            new THREE.Vector3(
              horizontalRadius * 0.2,
              Math.max(horizontalRadius * 1.25, size.y * 2.5, 12),
              horizontalRadius * 0.2,
            ),
          ),
        target: target.clone(),
      },
      {
        name: "grass-far",
        position: target
          .clone()
          .addScaledVector(
            diagonal,
            Math.max(lod.farMaxDistance * 0.7, horizontalRadius),
          )
          .add(new THREE.Vector3(0, Math.max(8, horizontalRadius * 0.35), 0)),
        target: target.clone(),
      },
    ];
  }

  private applyPose(pose: GrassQaPose): void {
    const { camera, controls } = this.dependencies;
    camera.position.copy(pose.position);
    controls.target.copy(pose.target);
    camera.lookAt(pose.target);
    camera.updateMatrixWorld(true);
    controls.update();
  }

  private throwIfUnavailable(signal?: AbortSignal): void {
    if (this.disposed || signal?.aborted) {
      throw new DOMException("Grass QA aborted.", "AbortError");
    }
  }
}
