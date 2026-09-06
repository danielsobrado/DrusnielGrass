import type * as THREE from "three";
import { WorldVisibilityProbe } from "../render/visibility/WorldVisibilityProbe";
import { GpuFrameTimer } from "./GpuFrameTimer";
import {
  GrassWorkloadProbe,
  resolveWorldDiagnosticsRuntime,
} from "./GrassWorkloadProbe";
import { WorldDiagnosticsHud } from "./WorldDiagnosticsHud";

const HUD_UPDATE_INTERVAL_MS = 250;

export interface WorldDiagnosticsOptions {
  gpuTiming: boolean;
  statsPanelEnabled: boolean;
}

export class WorldDiagnosticsController {
  private readonly scene: THREE.Scene;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly originalRender: THREE.WebGLRenderer["render"];
  private readonly probe: GrassWorkloadProbe;
  private readonly gpuTimer: GpuFrameTimer;
  private readonly hud: WorldDiagnosticsHud;
  private readonly visibility = new WorldVisibilityProbe();
  private lastCamera?: THREE.Camera;
  private lastHudUpdate = 0;
  private enabled = true;
  private disposed = false;

  private constructor(
    scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
    probe: GrassWorkloadProbe,
    gpuTimer: GpuFrameTimer,
    hud: WorldDiagnosticsHud,
  ) {
    this.scene = scene;
    this.renderer = renderer;
    this.probe = probe;
    this.gpuTimer = gpuTimer;
    this.hud = hud;
    this.originalRender = renderer.render;
    renderer.render = this.renderWithDiagnostics;
  }

  static attach(
    app: unknown,
    options: WorldDiagnosticsOptions,
  ): WorldDiagnosticsController | undefined {
    let probe: GrassWorkloadProbe | undefined;
    let gpuTimer: GpuFrameTimer | undefined;
    let hud: WorldDiagnosticsHud | undefined;
    try {
      const runtime = resolveWorldDiagnosticsRuntime(app);
      probe = new GrassWorkloadProbe(runtime.grass);
      gpuTimer = new GpuFrameTimer(
        runtime.renderer,
        options.gpuTiming && !options.statsPanelEnabled,
      );
      hud = new WorldDiagnosticsHud();
      return new WorldDiagnosticsController(
        runtime.scene,
        runtime.renderer,
        probe,
        gpuTimer,
        hud,
      );
    } catch (error) {
      disposeSafely(hud, "Diagnostics HUD");
      disposeSafely(gpuTimer, "GPU frame timer");
      disposeSafely(probe, "Grass workload probe");
      console.warn("[Drusniel World] Workload diagnostics unavailable.", error);
      return undefined;
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.enabled = false;
    this.restoreRenderer();
    disposeSafely(this.probe, "Grass workload probe");
    disposeSafely(this.hud, "Diagnostics HUD");
    disposeSafely(this.gpuTimer, "GPU frame timer");
  }

  private readonly renderWithDiagnostics: THREE.WebGLRenderer["render"] = (
    scene,
    camera,
  ): void => {
    if (scene !== this.scene || !this.enabled) {
      this.originalRender.call(this.renderer, scene, camera);
      return;
    }
    this.lastCamera = camera;

    try {
      this.probe.prepareFrame();
      this.gpuTimer.beginFrame();
    } catch (error) {
      this.disableAfterFailure(error);
      this.originalRender.call(this.renderer, scene, camera);
      return;
    }

    try {
      this.originalRender.call(this.renderer, scene, camera);
    } finally {
      try {
        this.gpuTimer.endFrame();
        this.probe.finishFrame();
        this.updateHudIfDue();
      } catch (error) {
        this.disableAfterFailure(error);
      }
    }
  };

  private updateHudIfDue(): void {
    const now = performance.now();
    if (now - this.lastHudUpdate < HUD_UPDATE_INTERVAL_MS) {
      return;
    }
    this.lastHudUpdate = now;
    // Sampled on the HUD's own cadence: the traversal walks the scene graph,
    // which is affordable four times a second and not once a frame.
    if (this.lastCamera) {
      this.visibility.sample(this.scene, this.lastCamera, this.renderer.info);
    }
    this.hud.update(
      this.probe.getSnapshot(),
      this.gpuTimer.getStats(),
      this.visibility.getSnapshot(),
    );
  }

  private disableAfterFailure(error: unknown): void {
    if (!this.enabled || this.disposed) {
      return;
    }
    this.dispose();
    console.warn("[Drusniel World] Workload diagnostics disabled.", error);
  }

  private restoreRenderer(): void {
    if (this.renderer.render === this.renderWithDiagnostics) {
      this.renderer.render = this.originalRender;
    }
  }
}

function disposeSafely(
  resource: { dispose(): void } | undefined,
  label: string,
): void {
  if (!resource) {
    return;
  }
  try {
    resource.dispose();
  } catch (error) {
    console.warn(`[Drusniel World] ${label} cleanup failed.`, error);
  }
}
