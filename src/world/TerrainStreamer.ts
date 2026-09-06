import * as THREE from "three";
import type { GrassArtDirection } from "../grass/GrassArtDirection";
import { WaterBedMaterialController } from "./hydrology/WaterBedMaterialController";
import { WaterInteractionField } from "./hydrology/WaterInteractionField";
import type { WaterRefractionArgs } from "./hydrology/WaterRefractionPass";
import { WaterMaterialController } from "./hydrology/WaterMaterialController";
import { TerrainChunk, TerrainChunkBuilder } from "./TerrainChunk";
import type { TerrainField } from "./TerrainField";
import { TerrainMaterialController } from "./TerrainMaterialController";
import type { WorldConfig } from "./WorldConfig";
import { TerrainSurfaceField } from "./terrain/TerrainSurfaceField";
import { WorldHorizonShell } from "./horizon/WorldHorizonShell";
import { WorldCascadeSystem } from "./hydrology/WorldCascadeSystem";

interface ChunkRequest {
  key: string;
  chunkX: number;
  chunkZ: number;
  resolution: number;
  distance: number;
}

export interface TerrainDiagnostics {
  activeChunks: number;
  queuedChunks: number;
  triangles: number;
  lastBuildMs: number;
  maxBuildMs: number;
}

const TERRAIN_BUILD_BUDGET_MS = 3;
const DESKTOP_TERRAIN_FRAME_BUDGET_MS = 2.5;
const COMPACT_TERRAIN_FRAME_BUDGET_MS = 1.5;

export class TerrainStreamer {
  private readonly chunks = new Map<string, TerrainChunk>();
  private readonly queue: ChunkRequest[] = [];
  private readonly desired = new Map<string, ChunkRequest>();
  private readonly materialController: TerrainMaterialController;
  private readonly waterMaterialController?: WaterMaterialController;
  private readonly waterBedMaterialController?: WaterBedMaterialController;
  private readonly surfaceField: TerrainSurfaceField;
  private readonly waterInteractionField: WaterInteractionField;
  /**
   * The permanent coarse shell this ring overlays. It belongs here rather than
   * beside the streamer because it is the same residency question answered at
   * the other end of the scale: the ring decides what detail is present near
   * the focus, and the shell guarantees something is present everywhere else.
   */
  private readonly horizon?: WorldHorizonShell;
  private readonly cascades?: WorldCascadeSystem;
  private centerChunkX = Number.NaN;
  private centerChunkZ = Number.NaN;
  private activeBuild?: TerrainChunkBuilder;
  private lastBuildMs = 0;
  private maxBuildMs = 0;
  private disposed = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly field: TerrainField,
    private readonly config: WorldConfig,
    private readonly compact: boolean,
    shadows: boolean,
  ) {
    let materialController: TerrainMaterialController | undefined;
    let waterMaterialController: WaterMaterialController | undefined;
    let waterBedMaterialController: WaterBedMaterialController | undefined;
    let horizon: WorldHorizonShell | undefined;
    let cascades: WorldCascadeSystem | undefined;

    try {
      materialController = new TerrainMaterialController(config, shadows, compact);
      this.materialController = materialController;
      waterMaterialController =
        config.waterEnabled >= 1
          ? new WaterMaterialController(config, compact)
          : undefined;
      this.waterMaterialController = waterMaterialController;
      waterBedMaterialController = config.waterEnabled >= 1
        ? new WaterBedMaterialController(config, compact)
        : undefined;
      this.waterBedMaterialController = waterBedMaterialController;
      this.surfaceField = new TerrainSurfaceField(config);
      this.waterInteractionField = new WaterInteractionField(config);
      horizon = config.horizonEnabled >= 1
        ? new WorldHorizonShell(scene, field, config, compact)
        : undefined;
      this.horizon = horizon;
      cascades =
        config.waterEnabled >= 1 && config.waterfallEnabled >= 1
          ? new WorldCascadeSystem(
              scene,
              field,
              config,
              (compact
                ? config.terrainRadiusCompact
                : config.terrainRadiusDesktop) * config.chunkSize,
              compact,
            )
          : undefined;
      this.cascades = cascades;
    } catch (error) {
      disposeTerrainResource(cascades, "Water cascades");
      disposeTerrainResource(horizon, "Horizon shell");
      disposeTerrainResource(waterBedMaterialController, "Water bed material");
      disposeTerrainResource(waterMaterialController, "Water material");
      disposeTerrainResource(materialController, "Terrain material");
      throw error;
    }
  }

  update(
    position: THREE.Vector3,
    buildDeadline = Number.POSITIVE_INFINITY,
  ): void {
    if (
      this.disposed ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y) ||
      !Number.isFinite(position.z)
    ) {
      return;
    }
    const waterTime = performance.now() * 0.001;
    this.waterMaterialController?.update(waterTime);
    this.waterBedMaterialController?.update(waterTime);
    const chunkX = Math.floor(position.x / this.config.chunkSize);
    const chunkZ = Math.floor(position.z / this.config.chunkSize);
    if (chunkX !== this.centerChunkX || chunkZ !== this.centerChunkZ) {
      this.centerChunkX = chunkX;
      this.centerChunkZ = chunkZ;
      this.reconcile();
    }

    this.processBuildQueue(buildDeadline);
    // After the ring, never before it: the shell is a one-time build with
    // nothing underneath it, so ground the player is standing on keeps first
    // claim on the frame and the shell fills in from whatever is left.
    this.horizon?.update(position, buildDeadline);
    this.cascades?.update(position, waterTime);
  }

  getDiagnostics(): TerrainDiagnostics {
    let triangles = 0;
    for (const chunk of this.chunks.values()) {
      triangles += chunk.getTriangleCount();
    }
    return {
      activeChunks: this.chunks.size,
      queuedChunks: this.queue.length + (this.activeBuild ? 1 : 0),
      triangles,
      lastBuildMs: this.lastBuildMs,
      maxBuildMs: this.maxBuildMs,
    };
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const chunk of this.chunks.values()) {
      try {
        this.removeChunk(chunk);
      } catch (error) {
        console.warn("[Drusniel World] Terrain chunk cleanup failed.", error);
      }
    }
    this.chunks.clear();
    this.queue.length = 0;
    this.activeBuild = undefined;
    this.desired.clear();
    disposeTerrainResource(this.cascades, "Water cascades");
    disposeTerrainResource(this.horizon, "Horizon shell");
    disposeTerrainResource(this.waterBedMaterialController, "Water bed material");
    disposeTerrainResource(this.waterMaterialController, "Water material");
    disposeTerrainResource(this.materialController, "Terrain material");
  }

  setGrassArtDirection(direction: GrassArtDirection): void {
    if (this.disposed) {
      return;
    }
    this.materialController.setGrassArtDirection(direction);
  }

  renderWaterRefraction(...args: WaterRefractionArgs): void {
    this.waterMaterialController?.renderRefraction(...args);
  }

  setLiveWaterVisuals(
    visuals: Parameters<WaterMaterialController["setLiveVisuals"]>[0] &
      Parameters<WaterBedMaterialController["setLiveVisuals"]>[0],
  ): void {
    if (this.disposed) {
      return;
    }
    this.waterMaterialController?.setLiveVisuals(visuals);
    this.waterBedMaterialController?.setLiveVisuals(visuals);
  }

  private reconcile(): void {
    const radius = this.compact
      ? this.config.terrainRadiusCompact
      : this.config.terrainRadiusDesktop;
    const halfWorld = this.config.worldSize * 0.5;
    this.desired.clear();

    for (let dz = -radius; dz <= radius; dz += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const chunkX = this.centerChunkX + dx;
        const chunkZ = this.centerChunkZ + dz;
        const originX = chunkX * this.config.chunkSize;
        const originZ = chunkZ * this.config.chunkSize;
        if (
          originX < -halfWorld ||
          originZ < -halfWorld ||
          originX + this.config.chunkSize > halfWorld ||
          originZ + this.config.chunkSize > halfWorld
        ) {
          continue;
        }

        const distance = Math.max(Math.abs(dx), Math.abs(dz));
        const resolution =
          distance <= 1
            ? this.config.terrainNearResolution
            : distance <= Math.max(2, radius - 1)
              ? this.config.terrainMidResolution
              : this.config.terrainFarResolution;
        const key = `${chunkX}:${chunkZ}`;
        this.desired.set(key, {
          key,
          chunkX,
          chunkZ,
          resolution,
          distance,
        });
      }
    }

    for (const [key, chunk] of this.chunks) {
      const request = this.desired.get(key);
      if (!request) {
        this.removeChunk(chunk);
        this.chunks.delete(key);
      }
    }

    const activeRequest = this.activeBuild
      ? this.desired.get(this.activeBuild.key)
      : undefined;
    if (
      this.activeBuild &&
      (!activeRequest || activeRequest.resolution !== this.activeBuild.resolution)
    ) {
      this.activeBuild = undefined;
    }

    const centerKey = `${this.centerChunkX}:${this.centerChunkZ}`;
    const centerRequest = this.desired.get(centerKey);
    const centerChunk = this.chunks.get(centerKey);
    if (
      centerRequest &&
      centerChunk?.resolution !== centerRequest.resolution &&
      this.activeBuild &&
      this.activeBuild.key !== centerKey
    ) {
      this.activeBuild = undefined;
    }

    this.queue.length = 0;
    for (const request of this.desired.values()) {
      const chunk = this.chunks.get(request.key);
      if (
        chunk?.resolution !== request.resolution &&
        !(
          this.activeBuild?.key === request.key &&
          this.activeBuild.resolution === request.resolution
        )
      ) {
        this.queue.push(request);
      }
    }
    this.queue.sort((left, right) => right.distance - left.distance);
  }

  private processBuildQueue(buildDeadline: number): void {
    while (!this.activeBuild && this.queue.length > 0) {
      const request = this.queue.pop();
      const desired = request ? this.desired.get(request.key) : undefined;
      if (!request || desired?.resolution !== request.resolution) {
        continue;
      }
      const existing = this.chunks.get(request.key);
      if (existing?.resolution === request.resolution) {
        continue;
      }
      this.activeBuild = new TerrainChunkBuilder(
        request.chunkX,
        request.chunkZ,
        this.config.chunkSize,
        request.resolution,
        this.field,
        this.surfaceField,
        this.waterInteractionField,
        this.materialController.material,
        this.waterMaterialController?.material,
        this.materialController.shadows,
        this.waterBedMaterialController?.material,
      );
    }

    const build = this.activeBuild;
    if (!build) {
      this.lastBuildMs = 0;
      return;
    }
    const desired = this.desired.get(build.key);
    if (!desired || desired.resolution !== build.resolution) {
      this.activeBuild = undefined;
      return;
    }

    const frameBudget = this.compact
      ? COMPACT_TERRAIN_FRAME_BUDGET_MS
      : DESKTOP_TERRAIN_FRAME_BUDGET_MS;
    const availableBudget = Math.min(
      TERRAIN_BUILD_BUDGET_MS * this.config.terrainChunksPerFrame,
      frameBudget,
      buildDeadline - performance.now(),
    );
    if (availableBudget <= 0) {
      this.lastBuildMs = 0;
      return;
    }

    const startedAt = performance.now();
    const chunk = build.advance(availableBudget);
    this.lastBuildMs = performance.now() - startedAt;
    this.maxBuildMs = Math.max(this.maxBuildMs, this.lastBuildMs);
    if (!chunk) {
      return;
    }

    this.commitChunk(chunk);
    this.activeBuild = undefined;
  }

  private commitChunk(chunk: TerrainChunk): void {
    const existing = this.chunks.get(chunk.key);
    try {
      this.scene.add(chunk.mesh);
      if (chunk.waterBedMesh) {
        this.scene.add(chunk.waterBedMesh);
      }
      if (chunk.waterMesh) {
        this.scene.add(chunk.waterMesh);
      }
      this.horizon?.setChunkCovered(chunk.chunkX, chunk.chunkZ, true);
      this.chunks.set(chunk.key, chunk);
    } catch (error) {
      try {
        this.removeChunk(chunk, !existing);
      } catch (cleanupError) {
        console.warn(
          "[Drusniel World] Unpublished terrain chunk rollback failed.",
          cleanupError,
        );
      }
      throw error;
    }

    if (!existing) {
      return;
    }
    try {
      this.removeChunk(existing, false);
    } catch (error) {
      console.warn("[Drusniel World] Replaced terrain chunk cleanup failed.", error);
    }
  }

  private removeChunk(chunk: TerrainChunk, updateCoverage = true): void {
    let firstError: unknown;
    let failed = false;
    const attempt = (cleanup: () => void): void => {
      try {
        cleanup();
      } catch (error) {
        if (!failed) {
          failed = true;
          firstError = error;
        }
      }
    };

    if (updateCoverage) {
      attempt(() => this.horizon?.setChunkCovered(chunk.chunkX, chunk.chunkZ, false));
    }
    attempt(() => this.scene.remove(chunk.mesh));
    if (chunk.waterBedMesh) {
      attempt(() => this.scene.remove(chunk.waterBedMesh!));
    }
    if (chunk.waterMesh) {
      attempt(() => this.scene.remove(chunk.waterMesh!));
    }
    attempt(() => chunk.dispose());

    if (failed) {
      throw firstError;
    }
  }
}

function disposeTerrainResource(
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
