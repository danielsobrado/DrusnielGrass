import * as THREE from "three";
import { createHydrologySample } from "../hydrology/HydrologyField";
import type { TerrainField } from "../TerrainField";
import {
  WORLD_RAIN_AREA_METERS,
  WORLD_RAIN_GROUND_CACHE_RESOLUTION,
  WORLD_RAIN_GROUND_CACHE_ROWS_PER_FRAME,
  WORLD_RAIN_RECENTER_DISTANCE_METERS,
} from "./WorldRainTuning";

const WATER_COVERAGE_THRESHOLD = 0.01;
const CONSERVATIVE_SAMPLE_OFFSET_RATIO = 0.36;

/**
 * A stable local height texture used to clip rain against terrain and water.
 *
 * Rebuilds happen into CPU staging memory. The live texture and its center only
 * change after every row is valid, so a streamed cliff can never expose a
 * half-new/half-old clipping field to the rain shader.
 */
export class WorldRainGroundCache {
  readonly center = new THREE.Vector2();
  readonly texture: THREE.DataTexture;

  private readonly active = new Float32Array(
    WORLD_RAIN_GROUND_CACHE_RESOLUTION * WORLD_RAIN_GROUND_CACHE_RESOLUTION,
  );
  private readonly staging = new Float32Array(this.active.length);
  private readonly pendingCenter = new THREE.Vector2();
  private readonly hydrology = createHydrologySample();
  private nextRow = WORLD_RAIN_GROUND_CACHE_RESOLUTION;
  private ready = false;
  private disposed = false;

  constructor(private readonly field: TerrainField) {
    this.texture = new THREE.DataTexture(
      this.active,
      WORLD_RAIN_GROUND_CACHE_RESOLUTION,
      WORLD_RAIN_GROUND_CACHE_RESOLUTION,
      THREE.RedFormat,
      THREE.FloatType,
    );
    this.texture.name = "world-rain-ground-cache";
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;
  }

  update(focus: THREE.Vector3): void {
    if (this.disposed || !Number.isFinite(focus.x) || !Number.isFinite(focus.z)) return;

    const anchor = this.isBuilding() ? this.pendingCenter : this.center;
    if (!this.ready || anchor.distanceToSquared(focus) >=
      WORLD_RAIN_RECENTER_DISTANCE_METERS * WORLD_RAIN_RECENTER_DISTANCE_METERS) {
      this.begin(focus.x, focus.z);
    }

    if (!this.isBuilding()) return;
    const endRow = Math.min(
      WORLD_RAIN_GROUND_CACHE_RESOLUTION,
      this.nextRow + WORLD_RAIN_GROUND_CACHE_ROWS_PER_FRAME,
    );
    for (let row = this.nextRow; row < endRow; row += 1) this.buildRow(row);
    this.nextRow = endRow;
    if (this.nextRow >= WORLD_RAIN_GROUND_CACHE_RESOLUTION) this.commit();
  }

  isReady(): boolean {
    return this.ready && !this.disposed;
  }

  /** Old data remains usable while a nearby replacement is being staged. */
  isUsableFor(focus: THREE.Vector3): boolean {
    if (!this.isReady()) return false;
    const halfArea = WORLD_RAIN_AREA_METERS * 0.5;
    return Math.abs(focus.x - this.center.x) < halfArea * 0.8 &&
      Math.abs(focus.z - this.center.y) < halfArea * 0.8;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.texture.dispose();
  }

  private isBuilding(): boolean {
    return this.nextRow < WORLD_RAIN_GROUND_CACHE_RESOLUTION;
  }

  private begin(x: number, z: number): void {
    this.pendingCenter.set(x, z);
    this.nextRow = 0;
  }

  private buildRow(row: number): void {
    const resolution = WORLD_RAIN_GROUND_CACHE_RESOLUTION;
    const cellSize = WORLD_RAIN_AREA_METERS / resolution;
    const offset = cellSize * CONSERVATIVE_SAMPLE_OFFSET_RATIO;
    const minX = this.pendingCenter.x - WORLD_RAIN_AREA_METERS * 0.5;
    const minZ = this.pendingCenter.y - WORLD_RAIN_AREA_METERS * 0.5;
    const z = minZ + (row + 0.5) * cellSize;

    for (let column = 0; column < resolution; column += 1) {
      const x = minX + (column + 0.5) * cellSize;
      let height = this.sampleSurfaceHeight(x, z);
      height = Math.max(height, this.sampleSurfaceHeight(x - offset, z));
      height = Math.max(height, this.sampleSurfaceHeight(x + offset, z));
      height = Math.max(height, this.sampleSurfaceHeight(x, z - offset));
      height = Math.max(height, this.sampleSurfaceHeight(x, z + offset));
      this.staging[row * resolution + column] = height;
    }
  }

  private sampleSurfaceHeight(x: number, z: number): number {
    const ground = this.field.sampleHeight(x, z);
    this.field.sampleHydrology(x, z, ground, this.hydrology);
    return this.hydrology.waterCoverage > WATER_COVERAGE_THRESHOLD
      ? Math.max(ground, this.hydrology.waterLevel)
      : ground;
  }

  private commit(): void {
    this.active.set(this.staging);
    this.center.copy(this.pendingCenter);
    this.ready = true;
    this.texture.needsUpdate = true;
  }
}
