import * as THREE from "three";
import type { RuntimeProfile } from "../runtime/RuntimeConfig";
import { WorldCloudShadowMap } from "../world/sky/WorldCloudShadowMap";
import { WorldCloudShadowSceneIntegrator } from "../world/sky/WorldCloudShadowSceneIntegrator";
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
  private readonly map: WorldCloudShadowMap;
  private readonly integrator: WorldCloudShadowSceneIntegrator;
  private readonly sunShadowsAvailable: boolean;
  private debug?: WorldCloudShadowDebugPanel;
  private disposed = false;

  constructor(
    scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
    profile: RuntimeProfile,
    private readonly sun: THREE.DirectionalLight,
    private readonly lighting: WorldCloudEnvironmentLighting,
    sunShadowsAvailable: boolean,
  ) {
    this.sunShadowsAvailable = sunShadowsAvailable;
    this.map = new WorldCloudShadowMap(renderer, profile);
    this.integrator = new WorldCloudShadowSceneIntegrator(
      scene,
      this.map.getUniforms(),
    );
    try {
      this.debug = WorldCloudShadowDebugPanel.createIfRequested(scene, {
        getDiagnostics: () => this.getDiagnostics(),
        readPixels: (target) => this.map.readDebugPixels(target),
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
    this.integrator.update(deltaSeconds);
    this.debug?.update(deltaSeconds);
  }

  getDiagnostics(): WorldCloudShadowControllerDiagnostics {
    const weather = this.lighting.getWeatherState();
    return {
      ...this.map.getDiagnostics(),
      ...this.integrator.getDiagnostics(),
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
    disposeSafely(this.integrator, "Cloud shadow integration");
    disposeSafely(this.map, "Cloud shadow map");
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
