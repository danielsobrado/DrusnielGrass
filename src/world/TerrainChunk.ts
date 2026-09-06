import * as THREE from "three";
import { WATER_REFRACTION_LAYER } from "./hydrology/WaterRefractionPass";
import {
  createEcologySample,
  type WorldEcologySample,
} from "./ecology/WorldEcologyField";
import {
  createHydrologySample,
  type HydrologySample,
} from "./hydrology/HydrologyField";
import { WaterChunkGeometryBuilder } from "./hydrology/WaterChunkGeometry";
import type { WaterInteractionField } from "./hydrology/WaterInteractionField";
import type { TerrainField } from "./TerrainField";
import type {
  TerrainSurfaceField,
  TerrainSurfaceTargets,
} from "./terrain/TerrainSurfaceField";

/** Every grass layer and the character stay at the default 0. */
export const TERRAIN_RENDER_ORDER = 1;
export const WATER_BED_RENDER_ORDER = 2;
export const WATER_RENDER_ORDER = 3;

const VERTEX_STAGE = 0;
const WATER_INTERACTION_STAGE = 1;
const INDEX_STAGE = 2;
const FINALIZE_STAGE = 3;
const BUILD_DEADLINE_CHECK_INTERVAL = 8;

export class TerrainChunk {
  readonly key: string;
  readonly mesh: THREE.Mesh;
  readonly waterBedMesh?: THREE.Mesh;
  readonly waterMesh?: THREE.Mesh;

  constructor(
    readonly chunkX: number,
    readonly chunkZ: number,
    readonly resolution: number,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    receiveShadow: boolean,
    waterGeometry?: THREE.BufferGeometry,
    waterMaterial?: THREE.Material,
    waterBedMaterial?: THREE.Material,
  ) {
    this.key = `${chunkX}:${chunkZ}`;
    this.mesh = new THREE.Mesh(geometry, material);
    // Opt in to what the high water preset may refract: ground and bed, never
    // grass or the water surface itself.
    this.mesh.layers.enable(WATER_REFRACTION_LAYER);
    this.mesh.name = `terrain-${this.key}-r${resolution}`;
    this.mesh.receiveShadow = receiveShadow;
    this.mesh.castShadow = false;
    this.mesh.renderOrder = TERRAIN_RENDER_ORDER;

    if (waterGeometry && waterBedMaterial) {
      this.waterBedMesh = new THREE.Mesh(waterGeometry, waterBedMaterial);
      this.waterBedMesh.layers.enable(WATER_REFRACTION_LAYER);
      this.waterBedMesh.name = `water-bed-${this.key}-r${resolution}`;
      this.waterBedMesh.receiveShadow = false;
      this.waterBedMesh.castShadow = false;
      this.waterBedMesh.renderOrder = WATER_BED_RENDER_ORDER;
    }
    if (waterGeometry && waterMaterial) {
      this.waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
      this.waterMesh.name = `water-${this.key}-r${resolution}`;
      this.waterMesh.receiveShadow = false;
      this.waterMesh.castShadow = false;
      this.waterMesh.renderOrder = WATER_RENDER_ORDER;
    }
  }

  getTriangleCount(): number {
    const terrainIndices = this.mesh.geometry.getIndex()?.count ?? 0;
    const waterIndices = this.waterMesh?.geometry.getIndex()?.count ?? 0;
    const waterBedIndices = this.waterBedMesh?.geometry.getIndex()?.count ?? 0;
    return (terrainIndices + waterIndices + waterBedIndices) / 3;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    const sharedWaterGeometry =
      this.waterMesh?.geometry ?? this.waterBedMesh?.geometry;
    sharedWaterGeometry?.dispose();
  }
}

/** Builds terrain and delegates matching water geometry in bounded slices. */
export class TerrainChunkBuilder {
  readonly key: string;
  readonly resolution: number;

  private readonly cells: number;
  private readonly step: number;
  private readonly originX: number;
  private readonly originZ: number;
  private readonly positions: Float32Array;
  private readonly normals: Float32Array;
  private readonly colors: Float32Array;
  private readonly paths: Float32Array;
  private readonly ecologies: Float32Array;
  private readonly environments: Float32Array;
  private readonly biomes: Float32Array;
  private readonly communities: Float32Array;
  private readonly stoneContacts: Float32Array;
  private readonly stoneOcclusionCenters: Float32Array;
  private readonly stoneOcclusions: Float32Array;
  private readonly indices: Uint16Array | Uint32Array;
  private readonly waterGeometryBuilder?: WaterChunkGeometryBuilder;
  private readonly normal = new THREE.Vector3();
  private readonly color = new THREE.Color();
  private readonly pathDistances = new THREE.Vector2();
  private readonly ecology = new THREE.Vector4();
  private readonly environment = new THREE.Vector4();
  private readonly biome = new THREE.Vector4();
  private readonly communityGround = new THREE.Vector4();
  private readonly hydrology: HydrologySample = createHydrologySample();
  /** Distinct from `ecology` above, which is the packed shader channel. */
  private readonly ecologySample: WorldEcologySample = createEcologySample();
  private readonly stoneContact = new THREE.Vector4();
  private readonly stoneOcclusionCenter = new THREE.Vector2();
  private readonly surfaceTargets: TerrainSurfaceTargets = {
    ecology: this.ecology,
    environment: this.environment,
    biome: this.biome,
    communityGround: this.communityGround,
    stoneContact: this.stoneContact,
    stoneOcclusionCenter: this.stoneOcclusionCenter,
    stoneOcclusionRadius: 0,
  };
  private stage = VERTEX_STAGE;
  private nextVertex = 0;
  private nextCell = 0;

  constructor(
    private readonly chunkX: number,
    private readonly chunkZ: number,
    chunkSize: number,
    resolution: number,
    private readonly field: TerrainField,
    private readonly surfaceField: TerrainSurfaceField,
    waterInteractionField: WaterInteractionField,
    private readonly material: THREE.Material,
    private readonly waterMaterial: THREE.Material | undefined,
    private readonly receiveShadow: boolean,
    private readonly waterBedMaterial?: THREE.Material,
  ) {
    this.key = `${chunkX}:${chunkZ}`;
    this.resolution = resolution;
    this.cells = resolution - 1;
    this.step = chunkSize / this.cells;
    this.originX = chunkX * chunkSize;
    this.originZ = chunkZ * chunkSize;
    const vertexCount = resolution * resolution;
    this.positions = new Float32Array(vertexCount * 3);
    this.normals = new Float32Array(vertexCount * 3);
    this.colors = new Float32Array(vertexCount * 3);
    this.paths = new Float32Array(vertexCount * 4);
    this.ecologies = new Float32Array(vertexCount * 4);
    this.environments = new Float32Array(vertexCount * 4);
    this.biomes = new Float32Array(vertexCount * 4);
    this.communities = new Float32Array(vertexCount * 4);
    this.stoneContacts = new Float32Array(vertexCount * 4);
    this.stoneOcclusionCenters = new Float32Array(vertexCount * 2);
    this.stoneOcclusions = new Float32Array(vertexCount);
    this.indices =
      vertexCount <= 65535
        ? new Uint16Array(this.cells * this.cells * 6)
        : new Uint32Array(this.cells * this.cells * 6);
    if (waterMaterial) {
      this.waterGeometryBuilder = new WaterChunkGeometryBuilder(
        resolution,
        waterInteractionField,
      );
    }
  }

  advance(budgetMs: number): TerrainChunk | undefined {
    const deadline = performance.now() + budgetMs;
    let processed = 0;

    while (this.stage <= FINALIZE_STAGE) {
      if (processed > 0 && performance.now() >= deadline) return undefined;

      if (this.stage === VERTEX_STAGE) {
        processed += this.advanceVertices(deadline);
      } else if (this.stage === WATER_INTERACTION_STAGE) {
        processed += this.advanceWaterInteractions(deadline);
      } else if (this.stage === INDEX_STAGE) {
        processed += this.advanceIndices(deadline);
      } else {
        return this.finalize();
      }
    }

    return undefined;
  }

  private advanceVertices(deadline: number): number {
    const total = this.resolution * this.resolution;
    let processed = 0;
    while (
      this.nextVertex < total &&
      (processed === 0 ||
        processed % BUILD_DEADLINE_CHECK_INTERVAL !== 0 ||
        performance.now() < deadline)
    ) {
      const xIndex = this.nextVertex % this.resolution;
      const zIndex = Math.floor(this.nextVertex / this.resolution);
      const x = this.originX + xIndex * this.step;
      const z = this.originZ + zIndex * this.step;
      const height = this.field.sampleHeight(x, z);
      this.field.sampleHydrology(x, z, height, this.hydrology);
      const suitabilityWithoutSlope =
        this.field.sampleGrassSuitabilityWithoutSlope(x, z, height);
      this.field.sampleNormal(x, z, this.normal);
      const suitability =
        this.field.sampleGrassSlopeMask(this.normal) * suitabilityWithoutSlope;
      this.field.samplePathDistances(x, z, this.pathDistances);
      this.field.resolveEcology(
        x,
        z,
        height,
        this.hydrology,
        this.pathDistances,
        this.ecologySample,
      );
      this.field.sampleColor(
        x,
        z,
        height,
        suitability,
        this.ecologySample,
        this.color,
      );
      this.surfaceField.sample(
        x,
        z,
        height,
        suitability,
        this.hydrology,
        this.ecologySample,
        this.surfaceTargets,
      );

      const offset = this.nextVertex * 3;
      const pathOffset = this.nextVertex * 4;
      this.paths[pathOffset] = this.pathDistances.x;
      this.paths[pathOffset + 1] = this.pathDistances.y;
      this.paths[pathOffset + 2] = this.field.samplePathVisibility(height);
      // Landform convexity, remapped to [0, 1]. The fragment stage has slope from
      // its own derivatives but no curvature, so depressions could not darken --
      // and without curvature the ground has exactly one tone per ecology value,
      // which is what makes an open patch read as a flat fill however much noise
      // is layered on it.
      this.paths[pathOffset + 3] = this.field.sampleCurvature(x, z) * 0.5 + 0.5;
      this.positions[offset] = x;
      this.positions[offset + 1] = height;
      this.positions[offset + 2] = z;
      this.normals[offset] = this.normal.x;
      this.normals[offset + 1] = this.normal.y;
      this.normals[offset + 2] = this.normal.z;
      this.colors[offset] = this.color.r;
      this.colors[offset + 1] = this.color.g;
      this.colors[offset + 2] = this.color.b;

      const ecologyOffset = this.nextVertex * 4;
      this.ecologies[ecologyOffset] = this.ecology.x;
      this.ecologies[ecologyOffset + 1] = this.ecology.y;
      this.ecologies[ecologyOffset + 2] = this.ecology.z;
      this.ecologies[ecologyOffset + 3] = this.ecology.w;
      this.environments[ecologyOffset] = this.environment.x;
      this.environments[ecologyOffset + 1] = this.environment.y;
      this.environments[ecologyOffset + 2] = this.environment.z;
      this.environments[ecologyOffset + 3] = this.environment.w;
      this.stoneContacts[ecologyOffset] = this.stoneContact.x;
      this.stoneContacts[ecologyOffset + 1] = this.stoneContact.y;
      this.stoneContacts[ecologyOffset + 2] = this.stoneContact.z;
      this.stoneContacts[ecologyOffset + 3] = this.stoneContact.w;
      this.stoneOcclusions[this.nextVertex] =
        this.surfaceTargets.stoneOcclusionRadius;

      const stoneOcclusionOffset = this.nextVertex * 2;
      this.stoneOcclusionCenters[stoneOcclusionOffset] =
        this.stoneOcclusionCenter.x;
      this.stoneOcclusionCenters[stoneOcclusionOffset + 1] =
        this.stoneOcclusionCenter.y;

      const communityOffset = this.nextVertex * 4;
      this.communities[communityOffset] = this.communityGround.x;
      this.communities[communityOffset + 1] = this.communityGround.y;
      this.communities[communityOffset + 2] = this.communityGround.z;
      this.communities[communityOffset + 3] = this.communityGround.w;

      const biomeOffset = this.nextVertex * 4;
      this.biomes[biomeOffset] = this.biome.x;
      this.biomes[biomeOffset + 1] = this.biome.y;
      this.biomes[biomeOffset + 2] = this.biome.z;
      this.biomes[biomeOffset + 3] = this.biome.w;
      if (this.waterGeometryBuilder) {
        this.waterGeometryBuilder.writeVertex(
          this.nextVertex,
          x,
          z,
          height,
          this.hydrology,
          this.environment.w,
        );
      }

      this.nextVertex += 1;
      processed += 1;
    }
    if (this.nextVertex >= total) this.stage = WATER_INTERACTION_STAGE;
    return processed;
  }

  private advanceWaterInteractions(deadline: number): number {
    if (
      !this.waterGeometryBuilder ||
      this.waterGeometryBuilder.advanceInteractions(deadline)
    ) {
      this.stage = INDEX_STAGE;
    }
    return 1;
  }

  private advanceIndices(deadline: number): number {
    const total = this.cells * this.cells;
    let processed = 0;
    while (
      this.nextCell < total &&
      (processed === 0 ||
        processed % BUILD_DEADLINE_CHECK_INTERVAL !== 0 ||
        performance.now() < deadline)
    ) {
      const xIndex = this.nextCell % this.cells;
      const zIndex = Math.floor(this.nextCell / this.cells);
      const row = zIndex * this.resolution + xIndex;
      const offset = this.nextCell * 6;
      this.indices[offset] = row;
      this.indices[offset + 1] = row + this.resolution;
      this.indices[offset + 2] = row + 1;
      this.indices[offset + 3] = row + 1;
      this.indices[offset + 4] = row + this.resolution;
      this.indices[offset + 5] = row + this.resolution + 1;
      this.nextCell += 1;
      processed += 1;
    }
    if (this.nextCell >= total) this.stage = FINALIZE_STAGE;
    return processed;
  }

  private finalize(): TerrainChunk {
    const geometry = new THREE.BufferGeometry();
    let waterGeometry: THREE.BufferGeometry | undefined;
    try {
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(this.positions, 3),
      );
      geometry.setAttribute(
        "normal",
        new THREE.BufferAttribute(this.normals, 3),
      );
      geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
      geometry.setAttribute(
        "terrainPath",
        new THREE.BufferAttribute(this.paths, 4),
      );
      geometry.setAttribute(
        "terrainEcology",
        new THREE.BufferAttribute(this.ecologies, 4),
      );
      geometry.setAttribute(
        "terrainEnvironment",
        new THREE.BufferAttribute(this.environments, 4),
      );
      geometry.setAttribute(
        "terrainBiome",
        new THREE.BufferAttribute(this.biomes, 4),
      );
      geometry.setAttribute(
        "terrainCommunityGround",
        new THREE.BufferAttribute(this.communities, 4),
      );
      geometry.setAttribute(
        "terrainStoneInfluence",
        new THREE.BufferAttribute(this.stoneContacts, 4),
      );
      geometry.setAttribute(
        "terrainStoneOcclusionCenter",
        new THREE.BufferAttribute(this.stoneOcclusionCenters, 2),
      );
      geometry.setAttribute(
        "terrainStoneOcclusion",
        new THREE.BufferAttribute(this.stoneOcclusions, 1),
      );
      geometry.setIndex(new THREE.BufferAttribute(this.indices, 1));
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();

      waterGeometry = this.waterGeometryBuilder
        ? this.waterGeometryBuilder.createGeometry()
        : undefined;
      const chunk = new TerrainChunk(
        this.chunkX,
        this.chunkZ,
        this.resolution,
        geometry,
        this.material,
        this.receiveShadow,
        waterGeometry,
        waterGeometry ? this.waterMaterial : undefined,
        waterGeometry ? this.waterBedMaterial : undefined,
      );
      this.stage += 1;
      return chunk;
    } catch (error) {
      waterGeometry?.dispose();
      geometry.dispose();
      throw error;
    }
  }
}
