import * as THREE from "three";
import type { RuntimeProfile } from "../runtime/RuntimeConfig";
import { WorldCloudShadowNodeMap } from "../world/sky/WorldCloudShadowNodeMap";
import type { RendererCapabilities } from "../render/RendererCapabilities";
import type { WebGPURenderer } from "three/webgpu";
import { WorldCloudShadowDebugPanel } from "./WorldCloudShadowDebugPanel";
import type { WorldCloudEnvironmentLighting } from "./WorldCloudEnvironmentLighting";

export interface WorldCloudShadowControllerDiagnostics {
  enabled: boolean;
  resolution: number;
  worldSize: number;
  focusTransmittance: number;
  originX: number;
  originZ: number;
  patchedMaterials: number;
  globalDirectTransmittance: number;
  appliedDirectTransmittance: number;
  weatherAmount: number;
  weatherRegime: "clear" | "fair" | "overcast" | "storm";
}

export class WorldCloudShadowController {
  private readonly map: WorldCloudShadowNodeMap;
  private readonly sunShadowsAvailable: boolean;
  private debug?: WorldCloudShadowDebugPanel;
  private debugPixels?: Uint8Array;
  private debugPixelsReady = false;
  private disposed = false;

  constructor(
    scene: THREE.Scene,
    renderer: WebGPURenderer,
    profile: RuntimeProfile,
    private readonly sun: THREE.DirectionalLight,
    private readonly lighting: WorldCloudEnvironmentLighting,
    sunShadowsAvailable: boolean,
    capabilities: RendererCapabilities,
  ) {
    this.sunShadowsAvailable = sunShadowsAvailable;
    this.map = new WorldCloudShadowNodeMap(renderer, profile, capabilities);
    try {
      this.debug = WorldCloudShadowDebugPanel.createIfRequested(scene, {
        getDiagnostics: () => this.getDiagnostics(),
        readPixels: (target) => this.readDebugPixels(target),
        setSpatialEnabled: (enabled) => this.map.setEnabled(enabled),
        setDirectAttenuationEnabled: (enabled) =>
          this.lighting.setDirectAttenuationEnabled(enabled),
        setSunShadowsEnabled: (enabled) => this.setSunShadowsEnabled(enabled),
      });
    } catch (error) {
      console.warn(
        "[Drusniel World] Cloud shadow diagnostics unavailable; continuing without the debug panel.",
        error,
      );
    }
  }

  update(
    deltaSeconds: number,
    focus: THREE.Vector3,
    elapsedSeconds: number,
  ): void {
    if (this.disposed) {
      return;
    }
    this.map.update(focus, elapsedSeconds);
    this.debug?.update(deltaSeconds);
  }

  /** The shadow field materials are built against; see `WorldNodeMaterialContext`. */
  get nodes() {
    return this.map.nodes;
  }

  getDiagnostics(): WorldCloudShadowControllerDiagnostics {
    const weather = this.lighting.getWeatherState();
    return {
      ...this.map.getDiagnostics(),
      // The node route injects the shadow field when a material is built, so
      // there is no scene walk and nothing to count as patched. Reported as
      // zero rather than dropped: the panel's shape is part of its contract.
      patchedMaterials: 0,
      globalDirectTransmittance: weather.directTransmittance,
      appliedDirectTransmittance: this.lighting.getAppliedDirectTransmittance(),
      weatherAmount: weather.amount,
      weatherRegime: weather.regime,
    };
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    disposeSafely(this.debug, "Cloud shadow diagnostics");
    this.debug = undefined;
    disposeSafely(this.map, "Cloud shadow map");
  }

  /**
   * Serves the debug preview the most recent completed readback.
   *
   * The panel's contract is synchronous, and no node backend can satisfy that:
   * WebGPU has no synchronous target read at all. So a read is started here and
   * the previous one is handed over, which costs the preview one frame of lag
   * and costs the frame nothing. Before the first read completes this reports
   * false, which the preview already handles as "no image yet".
   */
  private readDebugPixels(target: Uint8Array): boolean {
    if (this.disposed) return false;
    if (!this.debugPixels || this.debugPixels.length !== target.length) {
      this.debugPixels = new Uint8Array(target.length);
      this.debugPixelsReady = false;
    }
    const buffer = this.debugPixels;
    void this.map.readDebugPixels(buffer).then((read) => {
      if (read && !this.disposed) this.debugPixelsReady = true;
    }).catch(() => { /* A lost device owns the target; the preview waits. */ });
    if (!this.debugPixelsReady) return false;
    target.set(buffer);
    return true;
  }

  private setSunShadowsEnabled(enabled: boolean): void {
    this.sun.castShadow = this.sunShadowsAvailable && enabled;
    this.sun.shadow.needsUpdate = true;
  }
}

function disposeSafely(resource: { dispose(): void } | undefined, label: string): void {
  if (!resource) {
    return;
  }
  try {
    resource.dispose();
  } catch (error) {
    console.warn(`[Drusniel World] ${label} cleanup failed.`, error);
  }
}
