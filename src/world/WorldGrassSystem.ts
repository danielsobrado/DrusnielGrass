import * as THREE from "three";
import {
  DEFAULT_GRASS_ART_DIRECTION_KEY,
  GRASS_ART_DIRECTIONS,
  type GrassArtDirection,
} from "../grass/GrassArtDirection";
import type { GrassConfig, GrassLodConfig } from "../grass/GrassConfig";
import {
  resolveGrassCanopyAo,
  sampleGrassMacroVigor,
} from "../grass/GrassFieldVariation";
import { GrassGeometryFactory } from "../grass/GrassGeometryFactory";
import { GrassLodController } from "../grass/GrassLodController";
import {
  GrassLodLevel,
  type GrassFarGroup,
  type GrassPatch,
} from "../grass/GrassPatchGrid";
import { GrassConfigLoader } from "../grass/internal/GrassConfigLoader";
import { SeededRandom } from "../grass/internal/SeededRandom";
import { GRASS_MID_DENSITY_FALLOFF } from "../grass/GrassLodTuning";
import { GrassNearMaterial } from "../grass/materials/GrassNearMaterial";
import { WindField } from "../grass/wind/WindField";
import {
  GRASS_WIND_NOISE_SCALE,
  GRASS_WIND_NOISE_SPEED,
  disposeGrassWindNoiseTexture,
  getGrassWindNoiseTexture,
} from "../grass/wind/WindNoiseTexture";
import {
  pickGrassBiomeIndex,
  resolveGrassBiomeDensity,
  sampleGrassBiome,
} from "./grass/WorldBiomeField";
import {
  createGrassHabitatSample,
  sampleGrassHabitat,
  type GrassHabitatSample,
} from "./grass/GrassHabitatField";
import {
  GRASS_BIOME_PROFILES,
  resolveGrassBiomeWidthRatio,
} from "../grass/biome/GrassBiomeProfile";
import { GrassQualityGovernor } from "../runtime/GrassQualityGovernor";
import type { RuntimeProfile } from "../runtime/RuntimeConfig";
import { APP_VERSION } from "../version";
import { sampleStoneGrassClearance } from "./stones/StoneClearance";
import {
  createCommunitySample,
  sampleWorldCommunity,
  type WorldCommunitySample,
} from "./ecology/WorldCommunityField";
import {
  createCommunityResponse,
  resolveCommunityResponse,
} from "./ecology/WorldCommunityResponse";
import type { CommunityResponse } from "./ecology/WorldCommunityProfiles";
import type { TerrainField } from "./TerrainField";
import type { WorldConfig } from "./WorldConfig";
import { WorldGrassImpostorAtlasFactory } from "./grass/WorldGrassImpostorAtlasFactory";
import { WorldGrassImpostorMaterial } from "./grass/WorldGrassImpostorMaterial";
import { WorldGrassPatchGeometryFactory } from "./grass/WorldGrassPatchGeometryFactory";
import type { WorldDetailFoliageAtlas } from "./grass/WorldDetailFoliageAtlasFactory";
import type { DetailFoliageTuning } from "./grass/DetailFoliageTuning";
import { WorldNearGrassField } from "./grass/WorldNearGrassField";

interface WorldGrassPatch extends GrassPatch {
  midCoverage: number;
  farCoverage: number;
  // Streaming fade-in is applied by scaling the per-instance coverage
  // attributes, so the unfaded values have to survive somewhere. A per-mesh
  // uniform cannot do this job: three uploads a shared material's uniforms once
  // per contiguous run of draws, so only the first patch would ever fade.
  baseMidCoverage: Float32Array;
}

/**
 * All of a chunk's far cards in one mesh.
 *
 * Far cards used to inherit the mid layer's 32 m render-batch granularity, so
 * the resident set at stream radius 5 was 484 meshes — around three quarters of
 * every grass draw call in the frame, for cards a few pixels tall, growing
 * quadratically with radius. A 64 m chunk is angularly tiny past 44 m, so the
 * finer culling granularity was buying nothing.
 */
interface WorldGrassFarGroup extends GrassFarGroup {
  baseCoverage: Float32Array;
}

interface WorldGrassChunk {
  key: string;
  patches: WorldGrassPatch[];
  farGroup?: WorldGrassFarGroup;
  streamCoverage: number;
}

interface GrassChunkRequest {
  key: string;
  chunkX: number;
  chunkZ: number;
  distance: number;
}

interface GrassRenderBatchBuild {
  batchX: number;
  batchZ: number;
  // Horizontal centre of the batch cell rectangle. Instance transforms are
  // written relative to it so each mesh carries a real world position.
  originX: number;
  originZ: number;
  matrixValues: Float32Array;
  variations: Float32Array;
  coverages: Float32Array;
  biomes: Float32Array;
  instanceCount: number;
  bounds: THREE.Box3;
  meshBounds?: THREE.Box3;
  variationValues?: Float32Array;
  origin?: THREE.Vector3;
  localBounds?: THREE.Box3;
}

interface GrassChunkBuildJob {
  request: GrassChunkRequest;
  grassConfig: GrassConfig;
  patchesPerAxis: number;
  cellSize: number;
  jitterRadius: number;
  originX: number;
  originZ: number;
  nextCell: number;
  random: SeededRandom;
  batches: GrassRenderBatchBuild[];
  activeBatches?: GrassRenderBatchBuild[];
  up: THREE.Vector3;
  normal: THREE.Vector3;
  align: THREE.Quaternion;
  yaw: THREE.Quaternion;
  scale: THREE.Vector3;
  position: THREE.Vector3;
  localPosition: THREE.Vector3;
  matrix: THREE.Matrix4;
  finalizeStage: number;
  variantIndex?: number;
  completedPatches: WorldGrassPatch[];
  /** Far cards accumulated per batch, merged into one chunk mesh at the end. */
  farBatches: FarImpostorBatch[];
}

interface FarImpostorBatch extends FarImpostorInstances {
  origin: THREE.Vector3;
  worldBounds: THREE.Box3;
}

interface GrassChunkFinalizeResult {
  complete: boolean;
  chunk?: WorldGrassChunk;
}

interface FarImpostorInstances {
  matrixValues: Float32Array;
  variationValues: Float32Array;
  coverageValues: Float32Array;
  biomeValues: Float32Array;
  instanceCount: number;
}

export interface WorldGrassDiagnostics {
  ready: boolean;
  status: string;
  activePatches: number;
  queuedPatches: number;
  visibleNearPatches: number;
  visibleMidPatches: number;
  visibleFarPatches: number;
  clumps: number;
  blades: number;
  impostors: number;
  lastBuildMs: number;
  maxBuildMs: number;
  nearTiles: number;
  nearTileBuildMs: number;
  maxNearTileBuildMs: number;
  /**
   * Vertices the mid layer actually submits this frame, after the per-batch
   * draw truncation. This is the number the mid-layer work was measured
   * against; without it the trim's effect is invisible in any HUD, because
   * three's triangle counter reports the untrimmed index count.
   */
  submittedMidVertices: number;
  submittedFarInstances: number;
  /** Accent cards actually submitted this frame, after the per-tile trim. */
  accentCards: number;
  accentTiles: number;
  /** Quality tier the governor currently holds. */
  qualityTier: number;
  qualityTierSeconds: number;
  qualityDensityScale: number;
}

/**
 * Scales a patch's per-instance coverage by its streaming fade so a chunk
 * arrives gradually instead of popping in. The fade only ever touches the small
 * `fadingChunks` set, and stops uploading once it reaches full coverage.
 */
function applyStreamCoverage(
  mesh: THREE.InstancedMesh,
  baseCoverage: Float32Array,
  streamCoverage: number,
): void {
  const attribute = mesh.geometry.getAttribute("instanceCoverage");
  const values = attribute.array as Float32Array;
  for (let index = 0; index < baseCoverage.length; index += 1) {
    values[index] = baseCoverage[index] * streamCoverage;
  }
  attribute.needsUpdate = true;
}

const TWO_PI = Math.PI * 2;
const MID_WIND_SCALE = 0.85;
// The dither seed decorrelates the LOD cull pattern between layers. It is a
// material-level constant: three cannot upload a per-mesh value for meshes that
// share a material, so the per-chunk seed this used to compute never reached
// the GPU for any mesh but the first one drawn.
const MID_DITHER_SEED = 0x9e3779b9;
const HOMOGENEOUS_VARIANT_INDEX = 0;
const WORLD_VARIANT_COUNT = 1;
const FIELD_COVERAGE_MIN = 0.16;
const FIELD_COVERAGE_FULL = 0.5;
const FIELD_COVERAGE_REJECT = 0.02;
const COMPACT_BUILD_COOLDOWN_FRAMES = 2;
const CHUNK_BUILD_WARNING_MS = 24;
const DESKTOP_BUILD_BUDGET_MS = 4;
const COMPACT_BUILD_BUDGET_MS = 2.5;
const CENTER_BUILD_BUDGET_MS = 6;
const DESKTOP_STREAM_BUILD_RESERVE_MS = 1.25;
const COMPACT_STREAM_BUILD_RESERVE_MS = 0.75;
const STREAM_LOOKAHEAD_CHUNKS = 2;
const STREAM_FADE_SECONDS = 0.35;
const RETIREMENTS_PER_FRAME = 2;
/**
 * What the quality governor aims for. Compact devices are held to a lower bar
 * deliberately: driving a phone at 60 would spend the whole density budget
 * before the frame ever got cheap enough.
 */
const DESKTOP_TARGET_FPS = 60;
const COMPACT_TARGET_FPS = 50;

export class WorldGrassSystem {
  private readonly configLoader = new GrassConfigLoader();
  private readonly geometryFactory = new GrassGeometryFactory();
  private readonly patchGeometryFactory = new WorldGrassPatchGeometryFactory();
  private readonly impostorAtlasFactory = new WorldGrassImpostorAtlasFactory();
  private readonly material: GrassNearMaterial;
  private readonly impostorMaterials: WorldGrassImpostorMaterial[] = [];
  private readonly wind = new WindField();
  private readonly chunks = new Map<string, WorldGrassChunk>();
  private readonly patches = new Set<WorldGrassPatch>();
  private readonly queue: GrassChunkRequest[] = [];
  private readonly desired = new Map<string, GrassChunkRequest>();
  private readonly retirementQueue: string[] = [];
  private readonly retiring = new Set<string>();
  private readonly cameraPosition = new THREE.Vector3();
  private readonly previousReconcilePosition = new THREE.Vector2();
  private readonly habitatSample: GrassHabitatSample = createGrassHabitatSample();
  private readonly communitySample: WorldCommunitySample =
    createCommunitySample();
  private readonly communityResponse: CommunityResponse =
    createCommunityResponse();
  private readonly nearField: WorldNearGrassField;
  private readonly farGroups = new Set<WorldGrassFarGroup>();
  private readonly fadingChunks = new Set<WorldGrassChunk>();
  private readonly governor: GrassQualityGovernor;
  private midGeometries: THREE.BufferGeometry[] = [];
  private midSortedDithers: Float32Array[] = [];
  private grassConfig?: GrassConfig;
  private resolvedLodConfig?: GrassLodConfig;
  private lodController?: GrassLodController;
  private initialization?: Promise<void>;
  private artDirection: GrassArtDirection =
    GRASS_ART_DIRECTIONS[DEFAULT_GRASS_ART_DIRECTION_KEY];
  private nearBladesPerPatch = 0;
  private midBladesPerPatch = 0;
  private centerChunkX = Number.NaN;
  private centerChunkZ = Number.NaN;
  private hasPreviousReconcilePosition = false;
  private buildCooldownFrames = 0;
  private activeBuild?: GrassChunkBuildJob;
  private lastBuildMs = 0;
  private maxBuildMs = 0;
  private status = "Waiting for grass initialization";
  private initialized = false;
  private disposed = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly field: TerrainField,
    private readonly worldConfig: WorldConfig,
    private readonly profile: RuntimeProfile,
  ) {
    this.material = new GrassNearMaterial({
      name: "world-grass-mid-material",
      cacheKey: `grass-near-material-v27-mid-vertex-palette-no-sheen-${
        profile.compact ? "sine" : "noise"
      }`,
      // The mid layer draws exactly the blades the near layer drops.
      invertLodCoverage: true,
      windLodScale: MID_WIND_SCALE,
      ditherSeed: MID_DITHER_SEED,
      // Single-triangle blades starting 24 m out: a few pixels each.
      vertexPalette: true,
      sheen: false,
      // Its per-batch draw truncation reproduces the shader's keep set on the
      // CPU, which is only exact if the dither carries no per-instance term.
      instanceFreeDither: true,
      // Mid blades are the layer that goes sub-pixel: the width clamp is what
      // pays back the coverage the distance density falloff gives up.
      subPixelWidth: true,
      noiseWind: !profile.compact,
      microWind: false,
    });
    // The same shading schedule the near layers use. See
    // GrassNearMaterial.setMicroDetailFadeRange.
    this.material.setMicroDetailFadeRange(
      worldConfig.grassMicroDetailFadeStart,
      worldConfig.grassMicroDetailFadeEnd,
    );
    this.governor = new GrassQualityGovernor(
      profile.compact ? COMPACT_TARGET_FPS : DESKTOP_TARGET_FPS,
    );
    this.nearField = new WorldNearGrassField(
      scene,
      field,
      worldConfig,
      profile,
    );
  }

  /**
   * Pins the quality tier, or returns to closed-loop control when given
   * `undefined`. Reproducible captures need a fixed tier.
   */
  setQualityTierOverride(tier: number | undefined): void {
    this.governor.pinTier(tier);
    this.applyQualitySettings();
  }

  private applyQualitySettings(): void {
    const densityScale = this.governor.getDensityScale();
    this.material.setLodDensityScale(densityScale);
    this.material.configureDensityFalloff(
      GRASS_MID_DENSITY_FALLOFF.start,
      GRASS_MID_DENSITY_FALLOFF.end,
      GRASS_MID_DENSITY_FALLOFF.floor * this.governor.getMidFloorScale(),
    );
    this.lodController?.setMidDensityFalloff({
      start: GRASS_MID_DENSITY_FALLOFF.start,
      end: GRASS_MID_DENSITY_FALLOFF.end,
      floor: GRASS_MID_DENSITY_FALLOFF.floor * this.governor.getMidFloorScale(),
      scale: densityScale,
    });
    this.nearField.setQuality(
      densityScale,
      this.governor.getUltraDensityScale(),
      this.governor.getSheenEnabled(),
      this.governor.getNearDistanceScale(),
      this.governor.getAccentDensityScale(),
    );
    const lodConfig = this.resolvedLodConfig;
    if (lodConfig) {
      lodConfig.nearMaxDistance =
        this.artDirection.nearDistance * this.governor.getNearDistanceScale();
      this.material.configureLod(lodConfig);
      for (const impostorMaterial of this.impostorMaterials) {
        impostorMaterial.configureLod(lodConfig);
      }
    }
    for (const impostorMaterial of this.impostorMaterials) {
      impostorMaterial.setBlendViews(this.governor.getBlendViews());
    }
  }

  initialize(): Promise<void> {
    if (this.disposed) {
      return Promise.reject(new Error("WorldGrassSystem has been disposed."));
    }
    if (!this.initialization) {
      this.initialization = this.initializeInternal();
    }
    return this.initialization;
  }

  update(
    deltaSeconds: number,
    camera: THREE.Camera,
    focusGroundHeight?: number,
    buildDeadline = Number.POSITIVE_INFINITY,
  ): void {
    if (!this.initialized || !this.lodController) {
      return;
    }

    // One clock for every layer. The near field used to own a second WindField
    // that froze while the fields were suspended at altitude, so after landing
    // near and mid blades gusted with different phases through the whole
    // dither crossfade — the same blade bending two ways at the handoff.
    if (this.governor.update(deltaSeconds)) {
      this.applyQualitySettings();
    }

    const elapsedSeconds = this.wind.update(deltaSeconds);
    this.material.update(elapsedSeconds);
    for (const impostorMaterial of this.impostorMaterials) {
      impostorMaterial.update(elapsedSeconds);
    }

    camera.getWorldPosition(this.cameraPosition);
    const chunkX = Math.floor(this.cameraPosition.x / this.worldConfig.chunkSize);
    const chunkZ = Math.floor(this.cameraPosition.z / this.worldConfig.chunkSize);
    if (chunkX !== this.centerChunkX || chunkZ !== this.centerChunkZ) {
      this.centerChunkX = chunkX;
      this.centerChunkZ = chunkZ;
      this.reconcile();
    }

    this.processRetirementQueue();
    const streamBuildReserveMs = this.profile.compact
      ? COMPACT_STREAM_BUILD_RESERVE_MS
      : DESKTOP_STREAM_BUILD_RESERVE_MS;
    const streamBuildDeadline = Math.min(
      buildDeadline,
      performance.now() + streamBuildReserveMs,
    );
    this.processBuildQueue(streamBuildDeadline);
    this.nearField.update(
      elapsedSeconds,
      this.cameraPosition,
      focusGroundHeight,
      buildDeadline,
    );
    this.updateStreamCoverage(deltaSeconds);
    this.lodController.update(camera, this.patches.values());
    this.lodController.updateFarGroups(this.farGroups.values());
  }

  /** The baked accent atlas, for the `?accentAtlas=1` inspection route. */
  getDetailFoliageAtlas(): WorldDetailFoliageAtlas | undefined {
    return this.nearField.getDetailFoliageAtlas();
  }

  getDetailFoliageTuning(): DetailFoliageTuning {
    return this.nearField.getDetailFoliageTuning();
  }

  setDetailFoliageTuning(tuning: DetailFoliageTuning): void {
    this.nearField.setDetailFoliageTuning(tuning);
  }

  isHeroRingReady(): boolean {
    return (
      this.initialized && this.nearField.getBuildDiagnostics().nearTiles >= 4
    );
  }

  getDiagnostics(): WorldGrassDiagnostics {
    let visibleNearPatches = 0;
    let visibleMidPatches = 0;
    let visibleFarPatches = 0;
    let bladePatches = 0;
    let blades = this.nearField.getBladeCount();
    let impostors = 0;

    for (const patch of this.patches.values()) {
      bladePatches += patch.instanceCount;
      // The near band is drawn entirely by single-blade tiles, whose real
      // blades are already counted in nearField.getBladeCount(). Report the
      // patches the band covers, and do not add a clump-blade estimate for a
      // layer that no longer exists — that term used to double-count.
      visibleNearPatches +=
        patch.inFrustum && patch.nearCoverage > 0 ? 1 : 0;
      visibleMidPatches += patch.midMesh.visible ? 1 : 0;
      blades += Math.round(
        patch.instanceCount *
          (patch.midCoverage * this.midBladesPerPatch +
            patch.farCoverage * this.nearBladesPerPatch),
      );
    }
    for (const group of this.farGroups) {
      if (group.mesh.visible) {
        visibleFarPatches += 1;
        impostors += group.mesh.count;
      }
    }

    return {
      ready: this.initialized,
      status: this.status,
      activePatches: this.patches.size,
      queuedPatches: this.queue.length + (this.activeBuild ? 1 : 0),
      visibleNearPatches,
      visibleMidPatches,
      visibleFarPatches,
      clumps: bladePatches,
      blades,
      impostors,
      lastBuildMs: this.lastBuildMs,
      maxBuildMs: this.maxBuildMs,
      submittedMidVertices:
        this.lodController?.getSubmittedMidVertices() ?? 0,
      submittedFarInstances:
        this.lodController?.getSubmittedFarInstances() ?? 0,
      qualityTier: this.governor.getTier(),
      qualityTierSeconds: this.governor.getSecondsInTier(),
      qualityDensityScale: this.governor.getDensityScale(),
      ...this.nearField.getDetailFoliageDiagnostics(),
      ...this.nearField.getBuildDiagnostics(),
    };
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.initialized = false;
    this.status = "Grass disposed";

    this.nearField.dispose();
    for (const chunk of this.chunks.values()) {
      this.removeChunk(chunk);
    }
    this.chunks.clear();
    this.patches.clear();
    this.fadingChunks.clear();
    this.farGroups.clear();
    this.queue.length = 0;
    this.retirementQueue.length = 0;
    this.retiring.clear();
    if (this.activeBuild) {
      this.discardPatchBuild(this.activeBuild);
    }
    this.activeBuild = undefined;
    this.desired.clear();
    for (const geometry of this.midGeometries) {
      geometry.dispose();
    }
    this.midGeometries = [];
    this.material.material.dispose();
    for (const impostorMaterial of this.impostorMaterials) {
      impostorMaterial.dispose();
    }
    this.impostorMaterials.length = 0;
    // Shared with the near field, which this method already disposed, so the
    // last owner releases it. `getGrassWindNoiseTexture` rebuilds it on demand
    // if the app is recreated after a context loss.
    disposeGrassWindNoiseTexture();
    this.resolvedLodConfig = undefined;
    this.lodController = undefined;
  }

  private async initializeInternal(): Promise<void> {
    this.status = "Loading grass configuration";
    const grassConfig = await this.configLoader.load(
      `./config/grass.yaml?v=${encodeURIComponent(APP_VERSION)}`,
    );
    this.assertNotDisposed();
    await this.yieldToBrowser();
    this.assertNotDisposed();

    this.status = "Creating blade geometry";
    const variants = this.patchGeometryFactory.createLodVariants(
      grassConfig.geometry,
      this.worldConfig,
      this.profile.compact,
      this.worldConfig.seed,
      WORLD_VARIANT_COUNT,
      MID_DITHER_SEED / 4294967296,
    );
    this.grassConfig = grassConfig;
    this.midGeometries = variants.mid;
    this.midSortedDithers = variants.midSortedDithers;
    this.nearBladesPerPatch = variants.nearBladesPerPatch;
    this.midBladesPerPatch = variants.midBladesPerPatch;
    this.material.configure(grassConfig.material, grassConfig.wind);
    this.material.applyArtDirection(this.artDirection);
    if (!this.profile.compact) {
      this.material.setWindNoise(
        getGrassWindNoiseTexture(),
        GRASS_WIND_NOISE_SCALE,
        GRASS_WIND_NOISE_SPEED,
      );
    }
    // Matches the mean half-width the patch geometry is built from, which is
    // what the sub-pixel clamp widens away from.
    this.material.setBladeHalfWidth(
      (grassConfig.geometry.bladeWidthMin + grassConfig.geometry.bladeWidthMax) *
        grassConfig.geometry.midWidthScale *
        0.25,
    );
    const lodConfig = this.resolveLodConfig();
    lodConfig.nearMaxDistance = this.artDirection.nearDistance;
    lodConfig.midMaxDistance = this.artDirection.midDistance;
    lodConfig.farMaxDistance = this.resolveArtFarDistance(
      this.artDirection,
    );
    lodConfig.transitionDistance = this.artDirection.transitionDistance;
    this.resolvedLodConfig = lodConfig;
    this.material.configureLod(lodConfig);

    this.status = "Creating dense single-blade fields";
    await this.nearField.initialize(grassConfig);
    this.assertNotDisposed();

    for (let index = 0; index < variants.bladeVariants.length; index += 1) {
      this.status = `Creating impostor atlas ${index + 1}/${variants.bladeVariants.length}`;
      await this.yieldToBrowser();
      this.assertNotDisposed();
      const atlas = this.impostorAtlasFactory.create(
        variants.bladeVariants[index],
        grassConfig.geometry,
        this.worldConfig.grassPatchSize,
        grassConfig.impostor,
      );
      const impostorMaterial = new WorldGrassImpostorMaterial(
        atlas,
        grassConfig.material,
        grassConfig.wind,
        lodConfig,
        this.worldConfig.terrainCanopyMergeStart,
        this.worldConfig.terrainCanopyMergeEnd,
        !this.profile.compact,
        this.worldConfig.grassFarImpostorsPerPatch,
        !this.profile.compact,
      );
      impostorMaterial.applyArtDirection(this.artDirection);
      if (!this.profile.compact) {
        impostorMaterial.setWindNoise(
          getGrassWindNoiseTexture(),
          GRASS_WIND_NOISE_SCALE,
          GRASS_WIND_NOISE_SPEED,
        );
      }
      this.impostorMaterials.push(impostorMaterial);
    }

    this.lodController = new GrassLodController(lodConfig);
    this.lodController.setMidInstanceRadius(
      this.worldConfig.grassPatchSize * Math.SQRT2 * 0.5 +
        this.worldConfig.grassPatchSize *
          this.worldConfig.grassPatchJitter *
          0.5,
    );
    this.applyQualitySettings();
    this.status = "Grass ready";
    this.initialized = true;
  }

  private resolveLodConfig(): GrassLodConfig {
    const radius = this.profile.compact
      ? this.worldConfig.grassRadiusCompact
      : this.worldConfig.grassRadiusDesktop;
    const streamFadeEnd = radius * this.worldConfig.chunkSize;
    const farMaxDistance = Math.min(
      this.worldConfig.grassFarDistance,
      streamFadeEnd - this.worldConfig.grassTransitionDistance,
    );

    return {
      nearMaxDistance: this.worldConfig.grassNearDistance,
      midMaxDistance: this.worldConfig.grassMidDistance,
      farMaxDistance,
      transitionDistance: this.worldConfig.grassTransitionDistance,
      hysteresisDistance: this.worldConfig.grassHysteresisDistance,
    };
  }

  private resolveArtFarDistance(direction: GrassArtDirection): number {
    const radius = this.profile.compact
      ? this.worldConfig.grassRadiusCompact
      : this.worldConfig.grassRadiusDesktop;
    const streamFadeEnd = radius * this.worldConfig.chunkSize;
    return Math.min(
      direction.farDistance,
      this.worldConfig.grassFarDistance,
      streamFadeEnd - direction.transitionDistance,
    );
  }

  private processBuildQueue(buildDeadline: number): void {
    if (this.buildCooldownFrames > 0) {
      this.buildCooldownFrames -= 1;
      return;
    }
    if (performance.now() >= buildDeadline) {
      this.lastBuildMs = 0;
      return;
    }

    while (!this.activeBuild && this.queue.length > 0) {
      const request = this.queue.shift();
      if (request && this.desired.has(request.key)) {
        this.activeBuild = this.beginPatchBuild(request);
      }
    }

    const job = this.activeBuild;
    if (!job) {
      return;
    }
    if (!this.desired.has(job.request.key)) {
      this.discardPatchBuild(job);
      this.activeBuild = undefined;
      return;
    }

    const startedAt = performance.now();
    const totalCells = job.patchesPerAxis * job.patchesPerAxis;
    const readyToFinalize = job.nextCell >= totalCells;
    let completedChunk = false;
    if (readyToFinalize) {
      const result = this.advancePatchFinalize(job);
      if (result.complete) {
        if (result.chunk) {
          const chunk = result.chunk;
          this.chunks.set(job.request.key, chunk);
          for (const patch of chunk.patches) {
            this.patches.add(patch);
            this.scene.add(patch.midMesh);
          }
          if (chunk.farGroup) {
            this.farGroups.add(chunk.farGroup);
            this.scene.add(chunk.farGroup.mesh);
          }
          if (chunk.patches.length > 0 || chunk.farGroup) {
            this.fadingChunks.add(chunk);
          }
        }
        this.activeBuild = undefined;
        completedChunk = true;
      }
    } else {
      const sliceBudget =
        job.request.distance <= 0
          ? Math.min(
              CENTER_BUILD_BUDGET_MS,
              this.profile.compact ? 4 : CENTER_BUILD_BUDGET_MS,
            )
          : this.profile.compact
            ? COMPACT_BUILD_BUDGET_MS
            : DESKTOP_BUILD_BUDGET_MS;
      const availableBudget = Math.min(
        sliceBudget * this.worldConfig.grassChunksPerFrame,
        buildDeadline - performance.now(),
      );
      if (availableBudget <= 0) {
        this.lastBuildMs = 0;
        return;
      }
      this.advancePatchBuild(job, availableBudget);
    }

    this.lastBuildMs = performance.now() - startedAt;
    this.maxBuildMs = Math.max(this.maxBuildMs, this.lastBuildMs);
    if (this.lastBuildMs > CHUNK_BUILD_WARNING_MS) {
      console.warn(
        `[FluffyGrass] Grass build slice took ${this.lastBuildMs.toFixed(1)} ms.`,
      );
    }

    if (this.profile.compact && completedChunk) {
      this.buildCooldownFrames = COMPACT_BUILD_COOLDOWN_FRAMES;
    }
  }

  private processRetirementQueue(): void {
    let retired = 0;
    while (retired < RETIREMENTS_PER_FRAME && this.retirementQueue.length > 0) {
      const key = this.retirementQueue.shift();
      if (!key) {
        continue;
      }
      if (this.desired.has(key)) {
        this.retiring.delete(key);
        continue;
      }
      const chunk = this.chunks.get(key);
      if (chunk) {
        this.removeChunk(chunk);
        this.chunks.delete(key);
      }
      this.retiring.delete(key);
      retired += 1;
    }
  }

  private updateStreamCoverage(deltaSeconds: number): void {
    if (this.fadingChunks.size === 0) {
      return;
    }

    // Only chunks still fading in are walked. Sweeping every resident patch
    // every frame cost hundreds of iterations to discover nothing to do. The
    // fade is per chunk because a chunk arrives as one unit, and because the
    // far cards are now one mesh per chunk anyway.
    const coverageStep = deltaSeconds / STREAM_FADE_SECONDS;
    for (const chunk of this.fadingChunks) {
      chunk.streamCoverage = Math.min(1, chunk.streamCoverage + coverageStep);
      for (const patch of chunk.patches) {
        applyStreamCoverage(
          patch.midMesh,
          patch.baseMidCoverage,
          chunk.streamCoverage,
        );
      }
      if (chunk.farGroup) {
        applyStreamCoverage(
          chunk.farGroup.mesh,
          chunk.farGroup.baseCoverage,
          chunk.streamCoverage,
        );
      }
      if (chunk.streamCoverage >= 1) {
        this.fadingChunks.delete(chunk);
      }
    }
  }

  private reconcile(): void {
    const radius = this.profile.compact
      ? this.worldConfig.grassRadiusCompact
      : this.worldConfig.grassRadiusDesktop;
    const farMaxDistance =
      this.resolvedLodConfig?.farMaxDistance ??
      this.worldConfig.grassFarDistance;
    const halfWorld = this.worldConfig.worldSize * 0.5;
    const chunkSize = this.worldConfig.chunkSize;
    const currentX = this.cameraPosition.x;
    const currentZ = this.cameraPosition.z;
    let predictedX = currentX;
    let predictedZ = currentZ;
    if (this.hasPreviousReconcilePosition) {
      const travelX = currentX - this.previousReconcilePosition.x;
      const travelZ = currentZ - this.previousReconcilePosition.y;
      const travelLength = Math.hypot(travelX, travelZ);
      if (travelLength > 0.001) {
        const lookahead = Math.min(
          chunkSize * STREAM_LOOKAHEAD_CHUNKS,
          farMaxDistance * 0.65,
        );
        predictedX += (travelX / travelLength) * lookahead;
        predictedZ += (travelZ / travelLength) * lookahead;
      }
    }
    this.previousReconcilePosition.set(currentX, currentZ);
    this.hasPreviousReconcilePosition = true;
    const preloadDistance = Math.min(
      radius * chunkSize,
      farMaxDistance + this.worldConfig.grassTransitionDistance + chunkSize,
    );
    this.desired.clear();

    for (let dz = -radius; dz <= radius; dz += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const chunkX = this.centerChunkX + dx;
        const chunkZ = this.centerChunkZ + dz;
        const originX = chunkX * chunkSize;
        const originZ = chunkZ * chunkSize;
        if (
          originX < -halfWorld ||
          originZ < -halfWorld ||
          originX + chunkSize > halfWorld ||
          originZ + chunkSize > halfWorld
        ) {
          continue;
        }
        const currentDistance = this.horizontalDistanceToChunk(
          currentX,
          currentZ,
          originX,
          originZ,
          chunkSize,
        );
        const predictedDistance = this.horizontalDistanceToChunk(
          predictedX,
          predictedZ,
          originX,
          originZ,
          chunkSize,
        );
        if (Math.min(currentDistance, predictedDistance) > preloadDistance) {
          continue;
        }
        const key = `${chunkX}:${chunkZ}`;
        const isCameraChunk =
          chunkX === this.centerChunkX && chunkZ === this.centerChunkZ;
        this.desired.set(key, {
          key,
          chunkX,
          chunkZ,
          distance: isCameraChunk
            ? -1
            : Math.min(
                currentDistance,
                predictedDistance + chunkSize * 0.2,
              ),
        });
      }
    }

    // Keep a queued key marked until processRetirementQueue observes its
    // latest desired state. Clearing it as soon as it becomes desired again
    // allows rapid boundary crossings to enqueue the same key repeatedly.
    for (const key of this.chunks.keys()) {
      if (!this.desired.has(key) && !this.retiring.has(key)) {
        this.retiring.add(key);
        this.retirementQueue.push(key);
      }
    }

    const centerKey = `${this.centerChunkX}:${this.centerChunkZ}`;
    if (
      this.desired.has(centerKey) &&
      !this.chunks.has(centerKey) &&
      this.activeBuild &&
      this.activeBuild.request.key !== centerKey
    ) {
      this.discardPatchBuild(this.activeBuild);
      this.activeBuild = undefined;
    }

    this.queue.length = 0;
    for (const request of this.desired.values()) {
      if (
        !this.chunks.has(request.key) &&
        this.activeBuild?.request.key !== request.key
      ) {
        this.queue.push(request);
      }
    }
    this.queue.sort((left, right) => left.distance - right.distance);
  }

  private horizontalDistanceToChunk(
    x: number,
    z: number,
    originX: number,
    originZ: number,
    chunkSize: number,
  ): number {
    const distanceX = Math.max(originX - x, 0, x - (originX + chunkSize));
    const distanceZ = Math.max(originZ - z, 0, z - (originZ + chunkSize));
    return Math.hypot(distanceX, distanceZ);
  }

  private beginPatchBuild(
    request: GrassChunkRequest,
  ): GrassChunkBuildJob | undefined {
    const grassConfig = this.grassConfig;
    if (!grassConfig) {
      return undefined;
    }

    const patchesPerAxis = Math.round(
      this.worldConfig.chunkSize / this.worldConfig.grassPatchSize,
    );
    const cellSize = this.worldConfig.chunkSize / patchesPerAxis;
    const jitterRadius =
      cellSize * this.worldConfig.grassPatchJitter * 0.5;
    const originX = request.chunkX * this.worldConfig.chunkSize;
    const originZ = request.chunkZ * this.worldConfig.chunkSize;
    return {
      request,
      grassConfig,
      patchesPerAxis,
      cellSize,
      jitterRadius,
      originX,
      originZ,
      nextCell: 0,
      random: new SeededRandom(
        this.hash(request.chunkX, request.chunkZ, this.worldConfig.seed),
      ),
      batches: this.createRenderBatchBuilds(
        patchesPerAxis,
        originX,
        originZ,
        cellSize,
      ),
      up: new THREE.Vector3(0, 1, 0),
      normal: new THREE.Vector3(),
      align: new THREE.Quaternion(),
      yaw: new THREE.Quaternion(),
      scale: new THREE.Vector3(),
      position: new THREE.Vector3(),
      localPosition: new THREE.Vector3(),
      matrix: new THREE.Matrix4(),
      finalizeStage: 0,
      completedPatches: [],
      farBatches: [],
    };
  }

  private createRenderBatchBuilds(
    patchesPerAxis: number,
    chunkOriginX: number,
    chunkOriginZ: number,
    cellSize: number,
  ): GrassRenderBatchBuild[] {
    const batchesPerAxis = this.worldConfig.grassRenderBatchesPerAxis;
    const batches: GrassRenderBatchBuild[] = [];
    for (let batchZ = 0; batchZ < batchesPerAxis; batchZ += 1) {
      const startZ = Math.floor((batchZ * patchesPerAxis) / batchesPerAxis);
      const endZ = Math.floor(
        ((batchZ + 1) * patchesPerAxis) / batchesPerAxis,
      );
      for (let batchX = 0; batchX < batchesPerAxis; batchX += 1) {
        const startX = Math.floor((batchX * patchesPerAxis) / batchesPerAxis);
        const endX = Math.floor(
          ((batchX + 1) * patchesPerAxis) / batchesPerAxis,
        );
        const capacity = (endX - startX) * (endZ - startZ);
        batches.push({
          batchX,
          batchZ,
          originX: chunkOriginX + ((startX + endX) * 0.5) * cellSize,
          originZ: chunkOriginZ + ((startZ + endZ) * 0.5) * cellSize,
          matrixValues: new Float32Array(capacity * 16),
          variations: new Float32Array(capacity * 4),
          coverages: new Float32Array(capacity),
          biomes: new Float32Array(capacity),
          instanceCount: 0,
          bounds: new THREE.Box3(),
        });
      }
    }
    return batches;
  }

  private discardPatchBuild(job: GrassChunkBuildJob): void {
    for (const patch of job.completedPatches) {
      this.removePatch(patch);
    }
    job.completedPatches.length = 0;
  }

  private advancePatchBuild(job: GrassChunkBuildJob, budgetMs: number): void {
    const deadline = performance.now() + budgetMs;
    const totalCells = job.patchesPerAxis * job.patchesPerAxis;
    let processed = 0;

    while (
      job.nextCell < totalCells &&
      (processed === 0 || performance.now() < deadline)
    ) {
      const patchX = job.nextCell % job.patchesPerAxis;
      const patchZ = Math.floor(job.nextCell / job.patchesPerAxis);
      job.nextCell += 1;
      processed += 1;

      const x =
        job.originX +
        (patchX + 0.5) * job.cellSize +
        job.random.range(-job.jitterRadius, job.jitterRadius);
      const z =
        job.originZ +
        (patchZ + 0.5) * job.cellSize +
        job.random.range(-job.jitterRadius, job.jitterRadius);
      const height = this.field.sampleHeight(x, z);
      const suitabilityWithoutSlope =
        this.field.sampleGrassSuitabilityWithoutSlope(x, z, height);
      if (suitabilityWithoutSlope <= FIELD_COVERAGE_MIN) {
        continue;
      }
      this.field.sampleNormal(x, z, job.normal);
      const suitability =
        suitabilityWithoutSlope * this.field.sampleGrassSlopeMask(job.normal);
      const fieldCoverage = THREE.MathUtils.smoothstep(
        suitability,
        FIELD_COVERAGE_MIN,
        FIELD_COVERAGE_FULL,
      );
      if (fieldCoverage <= FIELD_COVERAGE_REJECT) {
        continue;
      }
      const pathCoverage = this.field.samplePathGrassMask(
        x,
        z,
        height,
        this.worldConfig.grassPatchSize * 0.5,
      );
      const pathFieldCoverage = fieldCoverage * pathCoverage;
      if (pathFieldCoverage <= FIELD_COVERAGE_REJECT) {
        continue;
      }
      // Stones drop a patch only when its centre falls inside a footprint:
      // clearing by the patch's whole reach would ring every boulder with a
      // bare halo at mid distance. Per-blade precision lives in the near
      // tiles, which sample the same field.
      const preBiomeCoverage =
        pathFieldCoverage * sampleStoneGrassClearance(x, z);
      if (preBiomeCoverage <= FIELD_COVERAGE_REJECT) {
        continue;
      }
      // The biome is decided once per patch at build time and rides the
      // instance buffers from there. Density is lerped across a border while
      // the species itself is a per-blade dithered pick, so bare ground ramps
      // smoothly even where the two interleave.
      const biomeSample = sampleGrassBiome(x, z);
      const coverage = preBiomeCoverage * resolveGrassBiomeDensity(biomeSample);
      if (coverage <= FIELD_COVERAGE_REJECT) {
        continue;
      }
      const biomeIndex = pickGrassBiomeIndex(x, z, biomeSample);
      const biomeProfile = GRASS_BIOME_PROFILES[biomeIndex];
      const ecology = this.field.sampleEcologyAt(x, z, height);
      sampleWorldCommunity(x, z, ecology, this.worldConfig, this.communitySample);
      resolveCommunityResponse(
        this.communitySample,
        this.worldConfig,
        this.communityResponse,
      );
      sampleGrassHabitat(
        x,
        z,
        ecology,
        resolveGrassBiomeDensity(biomeSample),
        biomeProfile.minimumClimateDensityRetention,
        biomeProfile.heightBand[0],
        biomeProfile.heightBand[1],
        biomeProfile.drynessBias,
        biomeProfile.accentDensity,
        this.communityResponse,
        this.worldConfig,
        this.habitatSample,
      );
      const habitatCoverage = preBiomeCoverage * this.habitatSample.density;
      if (habitatCoverage <= FIELD_COVERAGE_REJECT) {
        continue;
      }

      job.position.set(
        x,
        height - job.grassConfig.distribution.rootSink,
        z,
      );
      job.align.setFromUnitVectors(job.up, job.normal);
      job.yaw.setFromAxisAngle(job.up, job.random.range(0, TWO_PI));
      job.align.multiply(job.yaw);
      // Habitat already includes the biome height band. Fold that scale into
      // the instance, then keep only a small per-blade jitter so random height
      // cannot drown wet/dry/rocky identity the way a ±12% bias did.
      // Discrete clump archetypes stay on the near tiles: a 4 m mid patch has
      // one instance scale, and a 0.36 m cell of its centre would lottery a
      // 12% height/dryness jump that the near field does not share.
      const biomeWidth = resolveGrassBiomeWidthRatio(biomeProfile);
      const heightVariation = job.grassConfig.distribution.heightVariation;
      const horizontalScale = job.random.range(0.96, 1.04) * biomeWidth;
      const heightScale = THREE.MathUtils.clamp(
        this.habitatSample.height *
          (1 + job.random.range(-heightVariation, heightVariation) * 0.4),
        0.55,
        1.2,
      );
      job.scale.set(horizontalScale, heightScale, horizontalScale);
      const batchesPerAxis = this.worldConfig.grassRenderBatchesPerAxis;
      const batchX = Math.min(
        batchesPerAxis - 1,
        Math.floor((patchX * batchesPerAxis) / job.patchesPerAxis),
      );
      const batchZ = Math.min(
        batchesPerAxis - 1,
        Math.floor((patchZ * batchesPerAxis) / job.patchesPerAxis),
      );
      const batch = job.batches[batchZ * batchesPerAxis + batchX];
      const instanceIndex = batch.instanceCount;
      batch.bounds.expandByPoint(job.position);
      // Instance transforms are stored relative to the batch origin so the
      // mesh can carry a real world position. Every grass mesh previously sat
      // at the scene origin, which collapsed three's opaque depth sort into a
      // single key and left front-to-back ordering to chance.
      job.localPosition.set(
        job.position.x - batch.originX,
        job.position.y,
        job.position.z - batch.originZ,
      );
      job.matrix.compose(job.localPosition, job.align, job.scale);
      job.matrix.toArray(batch.matrixValues, instanceIndex * 16);
      const variationOffset = instanceIndex * 4;
      batch.variations[variationOffset] = job.random.next();
      // Wind damping is never above 1, so this stays inside the instance wind
      // ceiling the reserved bounds charge for. Windier-than-reference biomes
      // belong in the art direction's global wind scale.
      batch.variations[variationOffset + 1] =
        job.random.range(0.82, 1.14) * biomeProfile.windDamping;
      // Patch-scale tone survives impostor minification and avoids a uniform
      // far field. The canopy occlusion it now carries is resolved from the
      // same function the near tiles use, at the same world position: a macro
      // term applied to one representation and not another would show up as a
      // brightness step exactly at an LOD handoff, which is what
      // verify-lod-color-parity bounds.
      batch.variations[variationOffset + 2] =
        resolveGrassCanopyAo(sampleGrassMacroVigor(x, z), suitability) *
        job.random.range(0.97, 1.03);
      batch.variations[variationOffset + 3] = THREE.MathUtils.clamp(
        this.habitatSample.dryness + job.random.range(-0.02, 0.02),
        0,
        1,
      );
      batch.coverages[instanceIndex] = habitatCoverage;
      batch.biomes[instanceIndex] = biomeIndex;
      batch.instanceCount += 1;
    }
  }

  private advancePatchFinalize(
    job: GrassChunkBuildJob,
  ): GrassChunkFinalizeResult {
    const { request, grassConfig } = job;

    if (!job.activeBatches || job.variantIndex === undefined) {
      job.activeBatches = job.batches.filter(
        (batch) => batch.instanceCount > 0,
      );
      if (job.activeBatches.length === 0) {
        return {
          complete: true,
          chunk: { key: request.key, patches: [], streamCoverage: 0 },
        };
      }
      // A single variant per 64 m chunk creates obvious square tiles from an
      // aerial view. Per-instance transforms and material variation already
      // provide enough diversity without chunk-coherent atlas changes.
      job.variantIndex = Math.min(
        HOMOGENEOUS_VARIANT_INDEX,
        grassConfig.geometry.variantCount - 1,
      );
      const impostorRadius =
        this.impostorMaterials[job.variantIndex].atlas.radius;
      const bladeExtent =
        grassConfig.geometry.bladeHeightMax * 1.2 +
        grassConfig.geometry.bladeLeanMax +
        grassConfig.wind.strength +
        grassConfig.wind.flutterStrength;
      const boundsPadding = Math.max(
        impostorRadius + this.getFarImpostorOffsetRadius(),
        bladeExtent,
      );
      for (const batch of job.activeBatches) {
        batch.variationValues = batch.variations.subarray(
          0,
          batch.instanceCount * 4,
        );
        batch.meshBounds = batch.bounds.clone().expandByScalar(boundsPadding);
        // Finish centring the batch vertically now that its terrain extent is
        // known, so the mesh origin used for depth sorting sits inside the
        // grass rather than at sea level.
        const centerY = (batch.bounds.min.y + batch.bounds.max.y) * 0.5;
        for (let index = 0; index < batch.instanceCount; index += 1) {
          batch.matrixValues[index * 16 + 13] -= centerY;
        }
        batch.origin = new THREE.Vector3(
          batch.originX,
          centerY,
          batch.originZ,
        );
        batch.localBounds = batch.meshBounds
          .clone()
          .translate(batch.origin.clone().negate());
      }
    }

    const activeBatches = job.activeBatches;
    const variantIndex = job.variantIndex;
    // One extra stage past the batches merges their far cards into a single
    // chunk mesh. Building it here rather than per batch is what takes the far
    // band from ~484 resident draws at stream radius 5 down to ~121.
    if (job.finalizeStage >= activeBatches.length) {
      return {
        complete: true,
        chunk: {
          key: request.key,
          patches: job.completedPatches,
          farGroup: this.createFarGroup(job, variantIndex),
          streamCoverage: 0,
        },
      };
    }

    const batch = activeBatches[job.finalizeStage];
    const patch = this.createRenderPatch(job, batch, variantIndex);
    job.completedPatches.push(patch);
    job.finalizeStage += 1;
    return { complete: false };
  }

  /**
   * Merges the chunk's per-batch far cards into one mesh.
   *
   * Instance translations arrive relative to their batch origin, so each is
   * rebased onto the chunk origin as it is copied. The bounds are the union of
   * the batch bounds, which is looser than four separate boxes — a few more
   * cards get shaded at the edge of the frustum in exchange for a quarter of
   * the draw calls, and at 44 m and beyond that trade is not close.
   */
  private createFarGroup(
    job: GrassChunkBuildJob,
    variantIndex: number,
  ): WorldGrassFarGroup | undefined {
    const batches = job.farBatches;
    let instanceCount = 0;
    for (const batch of batches) {
      instanceCount += batch.instanceCount;
    }
    if (instanceCount === 0) {
      return undefined;
    }

    const worldBounds = new THREE.Box3();
    for (const batch of batches) {
      worldBounds.union(batch.worldBounds);
    }
    const origin = new THREE.Vector3();
    worldBounds.getCenter(origin);
    const localBounds = worldBounds.clone().translate(origin.clone().negate());

    const matrixValues = new Float32Array(instanceCount * 16);
    const variationValues = new Float32Array(instanceCount * 4);
    const coverageValues = new Float32Array(instanceCount);
    const biomeValues = new Float32Array(instanceCount);
    let cursor = 0;
    for (const batch of batches) {
      const offsetX = batch.origin.x - origin.x;
      const offsetY = batch.origin.y - origin.y;
      const offsetZ = batch.origin.z - origin.z;
      for (let index = 0; index < batch.instanceCount; index += 1) {
        const source = index * 16;
        const target = (cursor + index) * 16;
        matrixValues.set(
          batch.matrixValues.subarray(source, source + 16),
          target,
        );
        matrixValues[target + 12] += offsetX;
        matrixValues[target + 13] += offsetY;
        matrixValues[target + 14] += offsetZ;
      }
      variationValues.set(
        batch.variationValues.subarray(0, batch.instanceCount * 4),
        cursor * 4,
      );
      coverageValues.set(
        batch.coverageValues.subarray(0, batch.instanceCount),
        cursor,
      );
      biomeValues.set(
        batch.biomeValues.subarray(0, batch.instanceCount),
        cursor,
      );
      cursor += batch.instanceCount;
    }

    const impostorMaterial = this.impostorMaterials[variantIndex];
    const mesh = this.createMesh(
      `world-grass-far-${job.request.key}`,
      impostorMaterial.atlas.geometry,
      impostorMaterial.material,
      matrixValues,
      instanceCount,
      variationValues,
      coverageValues,
      biomeValues,
      origin,
      localBounds,
    );
    mesh.visible = false;
    const baseCoverage = Float32Array.from(coverageValues);
    applyStreamCoverage(mesh, baseCoverage, 0);

    return {
      mesh,
      baseCoverage,
      bounds: worldBounds,
      boundingSphere: worldBounds.getBoundingSphere(new THREE.Sphere()),
      distance: 0,
      inFrustum: true,
    };
  }

  private createRenderPatch(
    job: GrassChunkBuildJob,
    batch: GrassRenderBatchBuild,
    variantIndex: number,
  ): WorldGrassPatch {
    const { request } = job;
    const variationValues = batch.variationValues;
    const bounds = batch.meshBounds;
    const origin = batch.origin;
    const localBounds = batch.localBounds;
    if (!variationValues || !bounds || !origin || !localBounds) {
      throw new Error(`Grass batch ${request.key} finalized before bounds.`);
    }
    const coverageValues = batch.coverages.subarray(0, batch.instanceCount);
    const biomeValues = batch.biomes.subarray(0, batch.instanceCount);
    const batchKey = `${request.key}:${batch.batchX}:${batch.batchZ}`;
    // No near clump mesh is built here. Single-blade tiles own every blade
    // inside the near band, so a streamed near clump layer would allocate and
    // upload per-patch instance buffers that can never draw a pixel.
    const midMesh = this.createMesh(
      `world-grass-mid-${batchKey}`,
      this.midGeometries[variantIndex],
      this.material.material,
      batch.matrixValues,
      batch.instanceCount,
      variationValues,
      coverageValues,
      biomeValues,
      origin,
      localBounds,
      true,
    );
    midMesh.visible = false;

    // Far cards are accumulated rather than meshed: the chunk emits one far
    // mesh for all of its batches once the last one finalizes.
    const farInstances = this.createFarImpostorInstances(
      batch.matrixValues,
      variationValues,
      coverageValues,
      biomeValues,
      batch.instanceCount,
    );
    job.farBatches.push({
      ...farInstances,
      origin: origin.clone(),
      worldBounds: bounds.clone(),
    });

    const baseMidCoverage = Float32Array.from(coverageValues);
    applyStreamCoverage(midMesh, baseMidCoverage, 0);

    const patchBounds = bounds.clone();
    const batchesPerAxis = this.worldConfig.grassRenderBatchesPerAxis;
    return {
      id: batchKey,
      gridX: request.chunkX * batchesPerAxis + batch.batchX,
      gridZ: request.chunkZ * batchesPerAxis + batch.batchZ,
      bounds: patchBounds,
      boundingSphere: patchBounds.getBoundingSphere(new THREE.Sphere()),
      midMesh,
      hasFarImpostor: true,
      midSortedDithers: this.midSortedDithers[variantIndex],
      instanceCount: batch.instanceCount,
      lod: GrassLodLevel.Near,
      distance: 0,
      inFrustum: true,
      nearCoverage: 1,
      midCoverage: 0,
      farCoverage: 0,
      baseMidCoverage,
    };
  }

  /**
   * World size of one device pixel per metre of camera distance, which the
   * near band uses to keep blades from falling below a pixel wide. Depends on
   * both the vertical field of view and the drawing buffer height, so it is
   * pushed in from the app rather than derived from the camera alone.
   */
  setViewportPixelScale(pixelWorldScale: number): void {
    this.nearField.setViewportPixelScale(pixelWorldScale);
    this.material.setViewportPixelScale(pixelWorldScale);
  }

  setArtDirection(direction: GrassArtDirection): void {
    this.artDirection = direction;
    this.material.applyArtDirection(direction);
    this.nearField.setArtDirection(direction);
    const lodConfig = this.resolvedLodConfig;
    if (lodConfig) {
      lodConfig.nearMaxDistance = direction.nearDistance;
      lodConfig.midMaxDistance = direction.midDistance;
      lodConfig.farMaxDistance = this.resolveArtFarDistance(direction);
      lodConfig.transitionDistance = direction.transitionDistance;
      this.material.configureLod(lodConfig);
    }
    for (const impostorMaterial of this.impostorMaterials) {
      impostorMaterial.applyArtDirection(direction);
      if (lodConfig) {
        impostorMaterial.configureLod(lodConfig);
      }
    }
    this.applyQualitySettings();
  }

  private getFarImpostorOffsetRadius(): number {
    return this.worldConfig.grassFarImpostorsPerPatch > 1
      ? this.worldConfig.grassPatchSize * 0.12
      : 0;
  }

  private createFarImpostorInstances(
    sourceMatrices: Float32Array,
    sourceVariations: Float32Array,
    sourceCoverages: Float32Array,
    sourceBiomes: Float32Array,
    sourceCount: number,
  ): FarImpostorInstances {
    const cardsPerPatch = this.worldConfig.grassFarImpostorsPerPatch;
    const instanceCount = sourceCount * cardsPerPatch;
    const matrixValues = new Float32Array(instanceCount * 16);
    const variationValues = new Float32Array(instanceCount * 4);
    const coverageValues = new Float32Array(instanceCount);
    const biomeValues = new Float32Array(instanceCount);
    const offsetRadius = this.getFarImpostorOffsetRadius();

    for (let sourceIndex = 0; sourceIndex < sourceCount; sourceIndex += 1) {
      const sourceMatrixOffset = sourceIndex * 16;
      const sourceVariationOffset = sourceIndex * 4;
      const phase = sourceVariations[sourceVariationOffset] * TWO_PI;
      for (let cardIndex = 0; cardIndex < cardsPerPatch; cardIndex += 1) {
        const targetIndex = sourceIndex * cardsPerPatch + cardIndex;
        const targetMatrixOffset = targetIndex * 16;
        const targetVariationOffset = targetIndex * 4;
        matrixValues.set(
          sourceMatrices.subarray(
            sourceMatrixOffset,
            sourceMatrixOffset + 16,
          ),
          targetMatrixOffset,
        );

        const angle = phase + (cardIndex / cardsPerPatch) * TWO_PI;
        const localX = Math.cos(angle) * offsetRadius;
        const localZ = Math.sin(angle) * offsetRadius;
        matrixValues[targetMatrixOffset + 12] +=
          sourceMatrices[sourceMatrixOffset] * localX +
          sourceMatrices[sourceMatrixOffset + 8] * localZ;
        matrixValues[targetMatrixOffset + 13] +=
          sourceMatrices[sourceMatrixOffset + 1] * localX +
          sourceMatrices[sourceMatrixOffset + 9] * localZ;
        matrixValues[targetMatrixOffset + 14] +=
          sourceMatrices[sourceMatrixOffset + 2] * localX +
          sourceMatrices[sourceMatrixOffset + 10] * localZ;

        variationValues.set(
          sourceVariations.subarray(
            sourceVariationOffset,
            sourceVariationOffset + 4,
          ),
          targetVariationOffset,
        );
        variationValues[targetVariationOffset] =
          (sourceVariations[sourceVariationOffset] +
            cardIndex * 0.38196601125) %
          1;
        // Far cards do not otherwise consume variation.y, so it marks the
        // secondary card for the crossfade-only impostor path.
        variationValues[targetVariationOffset + 1] = cardIndex;
        coverageValues[targetIndex] = sourceCoverages[sourceIndex];
        biomeValues[targetIndex] = sourceBiomes[sourceIndex];
      }
    }

    return {
      matrixValues,
      variationValues,
      coverageValues,
      biomeValues,
      instanceCount,
    };
  }

  private createMesh(
    name: string,
    sourceGeometry: THREE.BufferGeometry,
    material: THREE.Material,
    matrixValues: Float32Array,
    instanceCount: number,
    variationValues: Float32Array,
    coverageValues: Float32Array,
    biomeValues: Float32Array,
    origin: THREE.Vector3,
    localBounds: THREE.Box3,
    dynamicInstances = false,
  ): THREE.InstancedMesh {
    const geometry = this.geometryFactory.createInstancedGeometry(
      sourceGeometry,
      variationValues,
      coverageValues,
      undefined,
      biomeValues,
    );
    const mesh = new THREE.InstancedMesh(geometry, material, 0);
    mesh.name = name;
    mesh.castShadow = false;
    // Millions of mid-distance blades do not need an individual shadow-map
    // lookup. Ultra-near interactive blades retain received shadows.
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    // Adopt the buffer the build already filled; constructing with zero above
    // avoids allocating and initializing a throwaway matrix array.
    mesh.instanceMatrix = new THREE.InstancedBufferAttribute(
      matrixValues.subarray(0, instanceCount * 16),
      16,
    );
    mesh.instanceMatrix.setUsage(
      dynamicInstances ? THREE.DynamicDrawUsage : THREE.StaticDrawUsage,
    );
    if (dynamicInstances) {
      for (const name of [
        "instanceVariation",
        "instanceCoverage",
        "instanceBiome",
      ] as const) {
        const attribute = mesh.geometry.getAttribute(name);
        if (attribute instanceof THREE.BufferAttribute) {
          attribute.setUsage(THREE.DynamicDrawUsage);
        }
      }
    }
    mesh.count = instanceCount;
    mesh.position.copy(origin);
    // Grass meshes never move, so skip the per-frame compose that
    // Object3D.updateMatrixWorld would otherwise run for every resident patch.
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.boundingBox = localBounds.clone();
    mesh.boundingSphere = localBounds.getBoundingSphere(new THREE.Sphere());
    return mesh;
  }

  private removePatch(patch: WorldGrassPatch): void {
    this.scene.remove(patch.midMesh);
    this.geometryFactory.disposeInstancedMesh(patch.midMesh);
  }

  private removeChunk(chunk: WorldGrassChunk): void {
    for (const patch of chunk.patches) {
      this.patches.delete(patch);
      this.removePatch(patch);
    }
    if (chunk.farGroup) {
      this.farGroups.delete(chunk.farGroup);
      this.scene.remove(chunk.farGroup.mesh);
      this.geometryFactory.disposeInstancedMesh(chunk.farGroup.mesh);
    }
    this.fadingChunks.delete(chunk);
  }

  private hash(x: number, z: number, seed: number): number {
    let value = Math.imul(x, 374761393) + Math.imul(z, 668265263) + seed;
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return (value ^ (value >>> 16)) >>> 0;
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error("WorldGrassSystem was disposed during initialization.");
    }
  }

  private yieldToBrowser(): Promise<void> {
    return new Promise((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }
}
