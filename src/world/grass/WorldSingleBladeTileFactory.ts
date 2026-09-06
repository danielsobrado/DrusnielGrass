import * as THREE from "three";
import type { GrassConfig } from "../../grass/GrassConfig";
import {
  resolveGrassCanopyAo,
  sampleGrassMacroVigor,
} from "../../grass/GrassFieldVariation";
import { GrassGeometryFactory } from "../../grass/GrassGeometryFactory";
import { SeededRandom } from "../../grass/internal/SeededRandom";
import type { GrassNearMaterial } from "../../grass/materials/GrassNearMaterial";
import {
  GRASS_BIOME_PROFILES,
  GRASS_BIOME_VERSION,
} from "../../grass/biome/GrassBiomeProfile";
import type { RuntimeProfile } from "../../runtime/RuntimeConfig";
import { sampleStoneGrassClearance } from "../stones/StoneClearance";
import {
  createCommunitySample,
  pickCommunityIndex,
  sampleWorldCommunity,
  type WorldCommunitySample,
} from "../ecology/WorldCommunityField";
import {
  createCommunityResponse,
  resolveCommunityResponse,
} from "../ecology/WorldCommunityResponse";
import type { CommunityResponse } from "../ecology/WorldCommunityProfiles";
import { TERRAIN_NORMAL_STEP, type TerrainField } from "../TerrainField";
import { TerrainHeightLattice } from "../TerrainHeightLattice";
import type { WorldConfig } from "../WorldConfig";
import {
  createGrassHabitatSample,
  resolveGrassClusterArchetype,
  sampleGrassHabitat,
  type GrassHabitatSample,
} from "./GrassHabitatField";
import {
  GRASS_CLUMP_CELLS,
  GRASS_CLUMP_CENTER_JITTER,
  GRASS_CLUMP_CENTER_X_SALT,
  GRASS_CLUMP_CENTER_Z_SALT,
  resolveGrassPlacementGrid,
  sampleGrassClumpValue,
} from "./GrassClumpLattice";
import {
  createGrassClusterProfile,
  mixGrassAngle,
  resolveGrassClusterCoverage,
  resolveGrassClusterProfile,
  type GrassClusterProfile,
} from "./GrassClusterProfile";
import {
  calculateGrassBladeCurveReach,
  calculateGrassSingleBladeRootBoundsRadius,
  GRASS_SHAPE_BEND_FRACTION,
  resolveGrassRosetteExpansion,
  resolveGrassBladeArcPoint,
} from "./GrassRuntimeMath";
import {
  createGrassBiomeSample,
  pickGrassBiomeIndex,
  resolveGrassBiomeDensity,
  sampleGrassBiome,
  type GrassBiomeSample,
} from "./WorldBiomeField";

export interface WorldSingleBladeTile {
  key: number;
  tileX: number;
  tileZ: number;
  mesh: THREE.InstancedMesh;
  bladeCount: number;
  /**
   * Every blade's LOD dither, ascending, matching the instance order in the
   * buffers. The vertex shader keeps a blade when `dither <= coverage`, so with
   * the instances sorted the survivors are always a prefix and the draw can be
   * truncated with `mesh.count` instead of submitting blades that the shader
   * would only collapse to zero area.
   */
  sortedDithers: Float32Array;
  /** Reference-counted placement data shared by complementary near layers. */
  placementKey: string;
}

export interface WorldSingleBladeTileBuildOptions {
  key: number;
  tileX: number;
  tileZ: number;
  densityMultiplier: number;
  bladeSegments: number;
  receiveShadows: boolean;
  seedSalt: number;
  namePrefix: string;
  material: GrassNearMaterial;
}

export interface WorldSingleBladeTileBuildJob {
  options: WorldSingleBladeTileBuildOptions;
  placementKey: string;
  stage: TileBuildStage;
  cachedPlacement?: WorldSingleBladePlacement;
  requestedCount: number;
  /**
   * Blades the buffers can hold. Larger than {@link requestedCount}, which is
   * the placement *cell* count: a rosette cell may emit several leaves.
   * Remaining cells always keep one reserved slot, so optional rosette leaves
   * can consume this budget without truncating the base placement grid.
   */
  capacity: number;
  columns: number;
  rows: number;
  cellWidth: number;
  cellDepth: number;
  originX: number;
  originZ: number;
  tileCenterX: number;
  tileCenterZ: number;
  random: SeededRandom;
  matrixValues: Float32Array;
  variations: Float32Array;
  /**
   * Per-blade silhouette, four normalized bytes: tip drift, width profile, tip
   * damage, curve scale.
   *
   * Bytes rather than floats because none of these needs 32-bit precision. Tip
   * drift quantises to about a third of a millimetre of apex position against a
   * 36 mm half-width, and the taper exponent to 0.003. A float vec4 would cost
   * sixteen bytes an instance for precision nothing can see -- several megabytes
   * at peak residency, and four times the tile-build upload.
   */
  shapes: Uint8Array;
  coverages: Float32Array;
  biomes: Float32Array;
  bounds: THREE.Box3;
  nextIndex: number;
  bladeCount: number;
  /** Cached heights for this tile's normals; see {@link TerrainHeightLattice}. */
  heightLattice?: TerrainHeightLattice;
  sortOrder?: Uint32Array;
  sortScratch?: Uint32Array;
  dithers?: Float32Array;
  ditherBits?: Uint32Array;
  radixCounts?: Uint32Array;
  radixOffsets?: Uint32Array;
  radixPass: number;
  finalizeIndex: number;
  sortedDithers?: Float32Array;
  reorderVisited?: Uint8Array;
  reorderMatrixScratch?: Float32Array;
  reorderVariationScratch?: Float32Array;
  reorderShapeScratch?: Uint8Array;
  reorderCycleStart?: number;
  reorderCycleTarget?: number;
  reorderCoverageScratch?: number;
  reorderBiomeScratch?: number;
  centerY: number;
}

export interface WorldSingleBladeTileBuildResult {
  complete: boolean;
  tile?: WorldSingleBladeTile;
  /** The placement completed successfully but contains no drawable blades. */
  empty?: boolean;
}

const TWO_PI = Math.PI * 2;
const MIN_SUITABILITY = 0.08;
/**
 * Height a blade keeps where it stands hard against a stone footprint.
 *
 * The stone clearance mask already decides how many blades survive near a
 * stone, but the ones that do survive were coming up at full height right to
 * the rock, which draws a clean line between two intact materials and is a
 * large part of why stones read as set on the meadow. Ground in a stone's rim
 * is compacted and in shade for most of the day, and the grass in it is
 * shorter, not just sparser.
 */
const STONE_CONTACT_HEIGHT_FLOOR = 0.46;
/**
 * Cells per axis in a tuft. Exported for compatibility; the shared lattice
 * contract lives in GrassClumpLattice so terrain and placement cannot drift.
 */
export const CLUMP_CELLS = GRASS_CLUMP_CELLS;
const CLUMP_RADIUS_SALT = 0x5b;
const CLUMP_ASPECT_SALT = 0x6d;
const CLUMP_ELLIPSE_ANGLE_SALT = 0x7f;
const CLUMP_DIRECTION_SALT = 0x91;
const CLUMP_LEAN_SALT = 0xa5;
const CLUMP_TALL_GROUP_SALT = 0xb7;
const CLUMP_ASYMMETRY_SALT = 0xc9;
const CLUMP_HOLE_SALT = 0xdb;
const CLUMP_HEIGHT_SALT = 0x4f;
const CLUMP_PLANE_SALT = 0xed;
/** Decides which blades stand in a tread. Stable in world space, never per job. */
const PATH_PIONEER_SALT = 0x3f;
/** Where pioneer survival begins closing, and where it reaches zero. */
const PATH_PIONEER_CORE_START = 0.6;
const PATH_PIONEER_CORE_END = 0.85;

function smoothstep01(value: number, edge0: number, edge1: number): number {
  const amount = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return amount * amount * (3 - 2 * amount);
}
/**
 * Furthest a blade can end up from the cell that enumerated it, in cells: half
 * the block it belongs to, plus the tuft centre's own wander, plus the tuft's
 * own reach. The cached height lattice is grown by this so a tufted blade still
 * samples its normal from inside the cached area.
 */
function resolveClumpMaxCellOffset(config: WorldConfig): number {
  const longestAxis = Math.max(
    config.grassClumpAspectMax,
    1 / config.grassClumpAspectMin,
  );
  return (
    (CLUMP_CELLS - 1) * 0.5 +
    GRASS_CLUMP_CENTER_JITTER * CLUMP_CELLS +
    config.grassClumpRadiusScaleMax * CLUMP_CELLS * longestAxis
  );
}
const HEIGHT_LATTICE_SPACING = TERRAIN_NORMAL_STEP * 0.5;
const LATTICE_SUITABILITY_TOLERANCE = 0.05;
const DEADLINE_CHECK_INTERVAL = 256;
/**
 * Widest a blade may be scaled, as a multiple of its source width.
 *
 * Raised from 1.2 for the broad-blade minority. It feeds the reserved bounds
 * radius directly, so this is the number the culling envelope is charged for --
 * `verify-lod-continuity` reproduces that calculation from it.
 */
const INSTANCE_HORIZONTAL_SCALE_MAX = 1.9;
const INSTANCE_VERTICAL_SCALE_MIN = 0.3;
const INSTANCE_VERTICAL_SCALE_MAX = 1.22;
const UNDERSTORY_WIDTH_SCALE = 1.15;
const STONE_FRINGE_UNDERSTORY_SHARE = 0.88;
const STONE_FRINGE_INNER_MASK = 0.5;
const STONE_FRINGE_OUTER_MASK = 0.98;
const MAXIMUM_ART_WIND_SCALE = 2;
const MAXIMUM_INSTANCE_WIND_SCALE = 1.16;
const MAXIMUM_WIND_STIFFNESS = 1.12;
const INTERACTION_VERTICAL_SCALE = 0.2;
const BOUNDS_SAFETY_MARGIN = 0.08;
// 0.5 * 0.754877666 + 0.5 * 0.569840296 — the constant part of the vertex
// shader's dither for single-blade geometry, whose shade and phase are both 0.5.
const SINGLE_BLADE_DITHER_BIAS = 0.662358981;

/**
 * Drift allowed to a blade that stands in the open, as a share of the config.
 *
 * Understory blades take the full amount: they are the ones lying over under
 * their neighbours, and the ones a camera at head height sees end-on.
 */
const UNDERSTORY_FREE_DRIFT_SCALE = 0.74;
/** Leaves off one crown lean more, and drift more, than a blade on its own. */
const ROSETTE_DRIFT_SCALE = 0.92;
const ROSETTE_LEAN_GROWTH = 0.34;

/** Quantises a unit shape channel into the normalized byte the shader reads. */
function encodeShapeUnit(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 255);
}
/** Bump whenever placement transforms or stable per-blade morphology changes. */
const GRASS_PLACEMENT_VERSION = 16;
const EMPTY_PLACEMENT_CACHE_LIMIT = 4096;
const PLACEMENT_LRU_LIMIT = 12;

type TileBuildStage =
  | "lattice"
  | "sampling"
  | "prepare-sort"
  | "prepare-dithers"
  | "radix-count"
  | "radix-scatter"
  | "reorder"
  | "center"
  | "mesh";

interface TileBuildBuffers {
  matrixValues: Float32Array;
  variations: Float32Array;
  shapes: Uint8Array;
  coverages: Float32Array;
  biomes: Float32Array;
}

interface WorldSingleBladePlacement extends TileBuildBuffers {
  key: string;
  bladeCount: number;
  sortedDithers: Float32Array;
  instanceMatrix: THREE.InstancedBufferAttribute;
  variationAttribute: THREE.InstancedBufferAttribute;
  shapeAttribute: THREE.InstancedBufferAttribute;
  coverageAttribute: THREE.InstancedBufferAttribute;
  biomeAttribute: THREE.InstancedBufferAttribute;
  origin: THREE.Vector3;
  localBounds: THREE.Box3;
  boundingSphere: THREE.Sphere;
  references: number;
}

export class WorldSingleBladeTileFactory {
  private readonly geometryFactory = new GrassGeometryFactory();
  private readonly sourceGeometries = new Map<number, THREE.BufferGeometry>();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly normal = new THREE.Vector3();
  private readonly align = new THREE.Quaternion();
  private readonly yaw = new THREE.Quaternion();
  private readonly lean = new THREE.Quaternion();
  private readonly leanAxis = new THREE.Vector3();
  private readonly position = new THREE.Vector3();
  private readonly localPosition = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly matrix = new THREE.Matrix4();
  private readonly biomeSample: GrassBiomeSample = createGrassBiomeSample();
  private readonly habitatSample: GrassHabitatSample = createGrassHabitatSample();
  private readonly communitySample: WorldCommunitySample =
    createCommunitySample();
  private readonly communityResponse: CommunityResponse =
    createCommunityResponse();
  private readonly clusterProfile: GrassClusterProfile = createGrassClusterProfile();
  private readonly placementCache = new Map<string, WorldSingleBladePlacement>();
  private readonly placementLru = new Map<string, WorldSingleBladePlacement>();
  private readonly emptyPlacementCache = new Map<string, true>();
  private readonly buildBufferPool = new Map<number, TileBuildBuffers[]>();
  private readonly latticePool: TerrainHeightLattice[] = [];
  private readonly sourceBladeHeight: number;
  private readonly rosetteExpansion: number;

  constructor(
    private readonly field: TerrainField,
    private readonly worldConfig: WorldConfig,
    private readonly profile: RuntimeProfile,
    private readonly grassConfig: GrassConfig,
  ) {
    this.sourceBladeHeight =
      (grassConfig.geometry.bladeHeightMin +
        grassConfig.geometry.bladeHeightMax) *
      0.5;
    this.rosetteExpansion = resolveGrassRosetteExpansion(
      worldConfig.grassRosetteChance,
    );
  }

  beginBuild(
    options: WorldSingleBladeTileBuildOptions,
    cachedOnly = false,
  ): WorldSingleBladeTileBuildJob | null | undefined {
    if (options.densityMultiplier <= 0) {
      return undefined;
    }

    const tileSize = this.worldConfig.grassNearTileSize;
    const baseDensity = this.profile.compact
      ? this.worldConfig.grassNearBladesPerSquareMeterCompact
      : this.worldConfig.grassNearBladesPerSquareMeterDesktop;
    const grid = resolveGrassPlacementGrid(
      tileSize,
      baseDensity,
      options.densityMultiplier,
    );
    const {
      requestedCount,
      columns,
      rows,
      cellWidth,
      cellDepth,
    } = grid;
    const placementKey = this.createPlacementKey(options);
    let cachedPlacement = this.placementCache.get(placementKey);
    if (!cachedPlacement) {
      cachedPlacement = this.placementLru.get(placementKey);
      if (cachedPlacement) {
        this.placementLru.delete(placementKey);
        this.rehydratePlacement(cachedPlacement);
        this.placementCache.set(placementKey, cachedPlacement);
      }
    }
    if (cachedPlacement) {
      return {
        options,
        placementKey,
        stage: "mesh",
        cachedPlacement,
        requestedCount,
        capacity: cachedPlacement.matrixValues.length / 16,
        columns: 0,
        rows: 0,
        cellWidth: 0,
        cellDepth: 0,
        originX: 0,
        originZ: 0,
        tileCenterX: cachedPlacement.origin.x,
        tileCenterZ: cachedPlacement.origin.z,
        random: new SeededRandom(0),
        matrixValues: cachedPlacement.matrixValues,
        variations: cachedPlacement.variations,
        shapes: cachedPlacement.shapes,
        coverages: cachedPlacement.coverages,
        biomes: cachedPlacement.biomes,
        bounds: cachedPlacement.localBounds,
        nextIndex: requestedCount,
        bladeCount: cachedPlacement.bladeCount,
        radixPass: 0,
        finalizeIndex: 0,
        centerY: cachedPlacement.origin.y,
      };
    }
    if (this.emptyPlacementCache.has(placementKey)) {
      this.emptyPlacementCache.delete(placementKey);
      this.emptyPlacementCache.set(placementKey, true);
      return null;
    }
    if (cachedOnly) {
      return undefined;
    }
    const originX = options.tileX * tileSize;
    const originZ = options.tileZ * tileSize;
    const tileCenterX = originX + tileSize * 0.5;
    const tileCenterZ = originZ + tileSize * 0.5;
    const latticeMargin =
      TERRAIN_NORMAL_STEP +
      resolveClumpMaxCellOffset(this.worldConfig) *
        Math.max(cellWidth, cellDepth);
    const heightLattice = this.latticePool.pop() ?? new TerrainHeightLattice();
    heightLattice.beginBuild(
      this.field,
      originX - latticeMargin,
      originZ - latticeMargin,
      tileSize + latticeMargin * 2,
      HEIGHT_LATTICE_SPACING,
    );
    const buffers = this.acquireBuildBuffers(requestedCount);
    return {
      options,
      placementKey,
      stage: "lattice",
      requestedCount,
      capacity: buffers.matrixValues.length / 16,
      columns,
      rows,
      cellWidth,
      cellDepth,
      originX,
      originZ,
      tileCenterX,
      tileCenterZ,
      random: new SeededRandom(
        this.hash(
          options.tileX,
          options.tileZ,
          this.worldConfig.seed ^ options.seedSalt,
        ),
      ),
      matrixValues: buffers.matrixValues,
      variations: buffers.variations,
      shapes: buffers.shapes,
      coverages: buffers.coverages,
      biomes: buffers.biomes,
      bounds: new THREE.Box3(),
      nextIndex: 0,
      bladeCount: 0,
      heightLattice,
      radixPass: 0,
      finalizeIndex: 0,
      centerY: 0,
    };
  }

  advanceBuild(
    job: WorldSingleBladeTileBuildJob,
    deadline: number,
  ): WorldSingleBladeTileBuildResult {
    if (job.cachedPlacement) {
      return {
        complete: true,
        tile: this.createTile(job.options, job.cachedPlacement),
      };
    }

    if (job.stage === "lattice") {
      if (!job.heightLattice?.advanceBuild(deadline)) {
        return { complete: false };
      }
      job.stage = "sampling";
      return this.continueBuild(job, deadline);
    }

    if (job.stage === "sampling") {
      if (!this.advanceSampling(job, deadline)) {
        return { complete: false };
      }
      if (job.heightLattice) {
        this.latticePool.push(job.heightLattice);
        job.heightLattice = undefined;
      }
      if (job.bladeCount === 0) {
        this.releaseBuildBuffers(job);
        this.rememberEmptyPlacement(job.placementKey);
        return { complete: true, empty: true };
      }
      job.stage = "prepare-sort";
      return this.continueBuild(job, deadline);
    }

    return this.advanceFinalize(job, deadline);
  }

  private advanceSampling(
    job: WorldSingleBladeTileBuildJob,
    deadline: number,
  ): boolean {
    const heightLattice = job.heightLattice;
    if (!heightLattice) {
      throw new Error(`Grass tile ${job.options.key} has no height lattice.`);
    }
    let processed = 0;
    while (
      job.nextIndex < job.requestedCount &&
      (processed === 0 ||
        processed % DEADLINE_CHECK_INTERVAL !== 0 ||
        performance.now() < deadline)
    ) {
      const index = job.nextIndex;
      job.nextIndex += 1;
      processed += 1;
      const column = index % job.columns;
      const row = Math.floor(index / job.columns);
      const globalColumn = job.options.tileX * job.columns + column;
      const globalRow = job.options.tileZ * job.rows + row;
      const clumpColumn = Math.floor(globalColumn / CLUMP_CELLS);
      const clumpRow = Math.floor(globalRow / CLUMP_CELLS);
      const clumpSpanX = job.cellWidth * CLUMP_CELLS;
      const clumpSpanZ = job.cellDepth * CLUMP_CELLS;
      const clumpCenterX =
        (clumpColumn + 0.5) * clumpSpanX +
        (this.clumpValue(
          clumpColumn,
          clumpRow,
          GRASS_CLUMP_CENTER_X_SALT,
        ) -
          0.5) *
          2 *
          GRASS_CLUMP_CENTER_JITTER *
          clumpSpanX;
      const clumpCenterZ =
        (clumpRow + 0.5) * clumpSpanZ +
        (this.clumpValue(
          clumpColumn,
          clumpRow,
          GRASS_CLUMP_CENTER_Z_SALT,
        ) -
          0.5) *
          2 *
          GRASS_CLUMP_CENTER_JITTER *
          clumpSpanZ;
      const radiusScale =
        this.worldConfig.grassClumpRadiusScaleMin +
        (this.worldConfig.grassClumpRadiusScaleMax -
          this.worldConfig.grassClumpRadiusScaleMin) *
          this.clumpValue(clumpColumn, clumpRow, CLUMP_RADIUS_SALT);
      const aspect =
        this.worldConfig.grassClumpAspectMin +
        (this.worldConfig.grassClumpAspectMax -
          this.worldConfig.grassClumpAspectMin) *
          this.clumpValue(clumpColumn, clumpRow, CLUMP_ASPECT_SALT);
      const ellipseAngle =
        this.clumpValue(clumpColumn, clumpRow, CLUMP_ELLIPSE_ANGLE_SALT) *
        TWO_PI;
      const dominantAngle =
        this.clumpValue(clumpColumn, clumpRow, CLUMP_DIRECTION_SALT) * TWO_PI;
      const sampleAngle = job.random.range(0, TWO_PI);
      const sampleRadius = Math.pow(
        job.random.next(),
        this.worldConfig.grassClumpRadialExponent,
      );
      const ellipseX =
        Math.cos(sampleAngle) * sampleRadius * radiusScale * clumpSpanX * aspect;
      const ellipseZ =
        (Math.sin(sampleAngle) * sampleRadius * radiusScale * clumpSpanZ) /
        aspect;
      const ellipseCos = Math.cos(ellipseAngle);
      const ellipseSin = Math.sin(ellipseAngle);
      const offsetX = ellipseX * ellipseCos - ellipseZ * ellipseSin;
      const offsetZ = ellipseX * ellipseSin + ellipseZ * ellipseCos;
      const x = clumpCenterX + offsetX;
      const z = clumpCenterZ + offsetZ;
      const height = this.field.sampleHeight(x, z);
      const suitabilityWithoutSlope =
        this.field.sampleGrassSuitabilityWithoutSlope(x, z, height);
      if (suitabilityWithoutSlope < MIN_SUITABILITY) {
        continue;
      }
      const pathMask = this.field.samplePathGrassMask(x, z, height);
      /**
       * A used way is not sterile.
       *
       * Rejecting every blade the moment the mask reaches zero drew a clean
       * biological line where a worn edge should be: grass simply stopped,
       * which is most of why the verge read as a painted polygon rather than
       * as ground something had walked over. A small share survives in the
       * tread — shorter, flattened, and thinning toward the compacted middle.
       *
       * The roll is a stable world-space hash rather than the job's random
       * stream, so the same pioneers survive at every LOD and across a tile
       * rebuild. Drawing it from `job.random` would make them flicker as the
       * player walked past.
       */
      let pioneer = 0;
      if (pathMask <= 0) {
        const core = this.field.samplePathCoreAmount(x, z, height);
        // Closes to exactly zero before the core does. Scaling by (1 - core)
        // alone leaves a small chance right down the middle of a way, and a
        // blade standing in the compacted tread is the one place a pioneer
        // reads as an error rather than as life.
        const chance =
          this.worldConfig.grassPathPioneerChance *
          (1 - core) *
          (1 - smoothstep01(core, PATH_PIONEER_CORE_START, PATH_PIONEER_CORE_END));
        if (
          this.clumpValue(
            Math.round(x * 100),
            Math.round(z * 100),
            PATH_PIONEER_SALT,
          ) >= chance
        ) {
          continue;
        }
        pioneer = 1;
      }
      const stoneMask = sampleStoneGrassClearance(x, z);
      if (stoneMask <= 0.02) {
        continue;
      }
      heightLattice.sampleNormal(x, z, TERRAIN_NORMAL_STEP, this.normal);
      const suitability =
        this.field.sampleGrassSlopeMask(this.normal) *
        suitabilityWithoutSlope *
        Math.max(pathMask, pioneer) *
        stoneMask;
      if (suitability < MIN_SUITABILITY - LATTICE_SUITABILITY_TOLERANCE) {
        continue;
      }

      const biomeSample = sampleGrassBiome(x, z, this.biomeSample);
      const biomeIndex = pickGrassBiomeIndex(x, z, biomeSample);
      const biomeProfile = GRASS_BIOME_PROFILES[biomeIndex];
      const ecology = this.field.sampleEcologyAt(x, z, height);
      sampleWorldCommunity(x, z, ecology, this.worldConfig, this.communitySample);
      resolveCommunityResponse(
        this.communitySample,
        this.worldConfig,
        this.communityResponse,
      );
      const communityIndex = pickCommunityIndex(x, z, this.communitySample);
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
      if (pioneer > 0) {
        // Trodden, so it uses the flattened clump morphology that already exists
        // rather than needing a sixth archetype of its own.
        this.habitatSample.directionalLean = Math.max(
          this.habitatSample.directionalLean,
          0.62,
        );
      }
      const archetype = resolveGrassClusterArchetype(
        this.habitatSample,
        communityIndex,
        clumpColumn,
        clumpRow,
        this.worldConfig,
      );
      const tallGroup = this.clumpValue(
        clumpColumn,
        clumpRow,
        CLUMP_TALL_GROUP_SALT,
      );
      const gapIdentity = this.clumpValue(
        clumpColumn,
        clumpRow,
        CLUMP_HOLE_SALT,
      );
      resolveGrassClusterProfile(
        archetype,
        this.habitatSample,
        this.clumpValue(clumpColumn, clumpRow, CLUMP_HEIGHT_SALT),
        tallGroup,
        this.clumpValue(clumpColumn, clumpRow, CLUMP_ASYMMETRY_SALT),
        this.worldConfig,
        this.clusterProfile,
      );

      this.position.set(
        x,
        height - this.grassConfig.distribution.rootSink,
        z,
      );
      job.bounds.expandByPoint(this.position);
      this.align.setFromUnitVectors(this.up, this.normal);
      const radialLength = Math.hypot(offsetX, offsetZ);
      const dominantX = Math.sin(dominantAngle);
      const dominantZ = Math.cos(dominantAngle);
      const radialX = radialLength > 1e-4 ? offsetX / radialLength : dominantX;
      const radialZ = radialLength > 1e-4 ? offsetZ / radialLength : dominantZ;
      const independentAngle = job.random.range(0, TWO_PI);
      const dominantWeight =
        this.worldConfig.grassClumpDominantDirectionWeight;
      const radialWeight = this.worldConfig.grassClumpRadialDirectionWeight;
      const independentWeight = 1 - dominantWeight - radialWeight;
      const headingX =
        dominantX * dominantWeight +
        radialX * radialWeight +
        Math.sin(independentAngle) * independentWeight;
      const headingZ =
        dominantZ * dominantWeight +
        radialZ * radialWeight +
        Math.cos(independentAngle) * independentWeight;
      const leanAngle =
        Math.hypot(headingX, headingZ) > 1e-4
          ? Math.atan2(headingX, headingZ)
          : dominantAngle;
      const planeYaw = mixGrassAngle(
        job.random.range(0, TWO_PI),
        this.clumpValue(clumpColumn, clumpRow, CLUMP_PLANE_SALT) * TWO_PI,
        this.clusterProfile.planeCoherence,
      );
      const leanMin = this.grassConfig.geometry.bladeLeanMin;
      const leanMax = this.grassConfig.geometry.bladeLeanMax;
      const sharedLean =
        leanMin +
        (leanMax - leanMin) *
          (this.clumpValue(clumpColumn, clumpRow, CLUMP_LEAN_SALT) * 0.62 +
            this.habitatSample.directionalLean * 0.38);
      const shapedLean = THREE.MathUtils.lerp(
        sharedLean,
        leanMax,
        this.clusterProfile.leanTowardMax,
      );
      const leanDistance = THREE.MathUtils.clamp(
        shapedLean *
          this.clusterProfile.leanScale *
          job.random.range(0.92, 1.08),
        leanMin,
        leanMax,
      );
      const leanRotation = Math.atan2(
        (leanDistance * INSTANCE_HORIZONTAL_SCALE_MAX) /
          INSTANCE_VERTICAL_SCALE_MAX,
        this.sourceBladeHeight,
      );
      this.yaw.setFromAxisAngle(this.up, planeYaw);
      this.leanAxis.set(Math.cos(leanAngle), 0, -Math.sin(leanAngle));
      this.lean.setFromAxisAngle(this.leanAxis, leanRotation);
      this.align.multiply(this.lean).multiply(this.yaw);

      const vigor = sampleGrassMacroVigor(x, z);
      const bladeTier = job.random.next();
      const stoneFringe =
        1 -
        THREE.MathUtils.smoothstep(
          stoneMask,
          STONE_FRINGE_INNER_MASK,
          STONE_FRINGE_OUTER_MASK,
        );
      const accentShare =
        this.clusterProfile.accentShare * (1 - stoneFringe);
      const understoryShare = THREE.MathUtils.lerp(
        this.clusterProfile.understoryShare,
        STONE_FRINGE_UNDERSTORY_SHARE,
        stoneFringe,
      );
      const isAccentBlade =
        accentShare > 0 && bladeTier >= 1 - accentShare;
      const isUnderstoryBlade =
        !isAccentBlade && bladeTier < understoryShare;
      const tierScale = isAccentBlade
        ? this.worldConfig.grassAccentHeightScale
        : isUnderstoryBlade
          ? this.worldConfig.grassUnderstoryHeightScale
          : this.worldConfig.grassMainHeightScale;
      const side =
        radialLength > 1e-4
          ? (offsetX * dominantZ - offsetZ * dominantX) / radialLength
          : 0;
      const sideHeight =
        1 - this.clusterProfile.asymmetry * Math.max(0, side);
      const heightJitter = this.worldConfig.grassBladeHeightJitter;
      const pioneerHeight =
        1 - pioneer * this.worldConfig.grassPathPioneerHeightLoss;
      const stoneContactHeight =
        STONE_CONTACT_HEIGHT_FLOOR +
        (1 - STONE_CONTACT_HEIGHT_FLOOR) * stoneMask;
      const verticalScale = THREE.MathUtils.clamp(
        this.clusterProfile.heightScale *
          tierScale *
          sideHeight *
          stoneContactHeight *
          pioneerHeight *
          job.random.range(1 - heightJitter, 1 + heightJitter),
        INSTANCE_VERTICAL_SCALE_MIN,
        INSTANCE_VERTICAL_SCALE_MAX,
      );
      const isBroadBlade = this.writeShapeChannels(
        job,
        job.bladeCount,
        isUnderstoryBlade ? 1 : UNDERSTORY_FREE_DRIFT_SCALE,
      );
      const broadWidthScale = isBroadBlade
        ? this.worldConfig.grassBroadBladeWidthScale
        : 1;
      const horizontalScale = THREE.MathUtils.clamp(
        this.clusterProfile.heightScale *
          job.random.range(...biomeProfile.widthBand) *
          this.clusterProfile.widthScale *
          broadWidthScale *
          (isUnderstoryBlade ? UNDERSTORY_WIDTH_SCALE : 1),
        0.76,
        INSTANCE_HORIZONTAL_SCALE_MAX,
      );
      this.scale.set(
        horizontalScale,
        verticalScale,
        THREE.MathUtils.clamp(
          this.clusterProfile.heightScale *
            job.random.range(...biomeProfile.widthBand) *
            this.clusterProfile.widthScale *
            broadWidthScale *
            (isUnderstoryBlade ? UNDERSTORY_WIDTH_SCALE : 1),
          0.76,
          INSTANCE_HORIZONTAL_SCALE_MAX,
        ),
      );
      this.localPosition.set(
        this.position.x - job.tileCenterX,
        this.position.y,
        this.position.z - job.tileCenterZ,
      );
      this.matrix.compose(this.localPosition, this.align, this.scale);
      this.matrix.toArray(job.matrixValues, job.bladeCount * 16);
      const variationOffset = job.bladeCount * 4;
      job.variations[variationOffset] = job.random.next();
      job.variations[variationOffset + 1] =
        job.random.range(0.84, 1.16) * biomeProfile.windDamping;
      /**
       * Whole-blade occlusion, in three parts.
       *
       * The field term says how shaded this patch of meadow is. The other two
       * say where in its own tuft this blade stands, which the field term
       * cannot: a blade shorter than the tuft's main tier is under the others,
       * and a blade near the crown is more enclosed than one on the rim.
       *
       * Both are build-time and cost nothing at runtime — the clump profile
       * already knows its own tier height, so no neighbour search is needed.
       * This is the blade half of the contact the terrain now draws under each
       * tuft; the two are meant to be read together.
       */
      const clumpTopHeight =
        this.clusterProfile.heightScale * this.worldConfig.grassMainHeightScale;
      const canopyDepth = THREE.MathUtils.clamp(
        (clumpTopHeight - verticalScale) / Math.max(clumpTopHeight, 1e-3),
        0,
        1,
      );
      job.variations[variationOffset + 2] =
        resolveGrassCanopyAo(vigor, suitability) *
        (1 - this.worldConfig.grassCanopyDepthAo * canopyDepth) *
        (1 - this.worldConfig.grassClumpCoreAo * (1 - sampleRadius)) *
        job.random.range(0.992, 1.008);
      let dryness =
        this.habitatSample.dryness * this.clusterProfile.drynessScale +
        this.clusterProfile.drynessOffset;
      if (isAccentBlade && tallGroup > 0.7 && dryness > 0.12) {
        dryness = Math.min(1, dryness + 0.14);
      }
      job.variations[variationOffset + 3] = THREE.MathUtils.clamp(
        dryness + job.random.range(-0.008, 0.008),
        0,
        1,
      );
      const clusterCoverage = resolveGrassClusterCoverage(
        this.clusterProfile,
        sampleRadius,
        sampleAngle,
        gapIdentity,
      );
      // Rosette-eligible blades divide by the expected expansion so their
      // parent plus optional leaves preserve the pre-rosette coverage. Accent
      // blades never emit rosette leaves, so applying that divisor to them
      // would silently thin the authored accent population.
      const coverageExpansion = isAccentBlade ? 1 : this.rosetteExpansion;
      const bladeCoverage =
        (this.habitatSample.density *
          (pioneer > 0 ? this.worldConfig.grassPathPioneerCoverage : pathMask) *
          stoneMask *
          clusterCoverage) /
        coverageExpansion;
      job.coverages[job.bladeCount] = bladeCoverage;
      job.biomes[job.bladeCount] = biomeIndex;
      const parentVariationOffset = variationOffset;
      job.bladeCount += 1;

      /**
       * The rest of the plant.
       *
       * The expensive part of placement is the field sampling above — ecology,
       * habitat, community, stone clearance, the height lattice. Emitting the
       * remaining leaves of one crown from that single sample is nearly free,
       * and it is also the more correct model: these leaves share a root, a
       * soil and a light budget, so they should share the sampled values and
       * re-roll only their presentation.
       *
       * Capacity is an expected expansion, not a worst-case five-blade reserve.
       * Optional leaves therefore use only the slots left after reserving one
       * base blade for every placement cell still to visit. A dense run of
       * rosettes can lose optional leaves, but it can never cut the spatial grid
       * short and leave a row-order hole in the meadow.
       */
      if (
        !isAccentBlade &&
        job.random.next() < this.worldConfig.grassRosetteChance
      ) {
        const leaves = 1 + Math.floor(job.random.next() * 4);
        const remainingCells = job.requestedCount - job.nextIndex;
        const extraBladeLimit = Math.max(
          job.bladeCount,
          job.capacity - remainingCells,
        );
        const parentBaseWidth = horizontalScale / broadWidthScale;
        for (
          let leaf = 0;
          leaf < leaves && job.bladeCount < extraBladeLimit;
          leaf += 1
        ) {
          const fan =
            (leaf + 1) *
            this.worldConfig.grassRosetteFanRadians *
            (leaf % 2 === 0 ? 1 : -1);
          // Re-derived from the terrain normal rather than accumulated onto:
          // multiplying into this.align leaf after leaf would drift the whole
          // rosette off the ground plane by the last one.
          this.align.setFromUnitVectors(this.up, this.normal);
          this.yaw.setFromAxisAngle(this.up, planeYaw + fan);
          // Outer leaves in a rosette lie flatter than the crown's centre.
          this.lean.setFromAxisAngle(
            this.leanAxis,
            leanRotation * (1 + ROSETTE_LEAN_GROWTH * (leaf + 1)),
          );
          this.align.multiply(this.lean).multiply(this.yaw);
          const leafBroad = this.writeShapeChannels(
            job,
            job.bladeCount,
            ROSETTE_DRIFT_SCALE,
          );
          const leafWidth = THREE.MathUtils.clamp(
            parentBaseWidth *
              (leafBroad ? this.worldConfig.grassBroadBladeWidthScale : 1) *
              job.random.range(0.86, 1.08),
            0.76,
            INSTANCE_HORIZONTAL_SCALE_MAX,
          );
          const leafHeight = THREE.MathUtils.clamp(
            verticalScale * job.random.range(0.74, 1.08),
            INSTANCE_VERTICAL_SCALE_MIN,
            INSTANCE_VERTICAL_SCALE_MAX,
          );
          this.scale.set(leafWidth, leafHeight, leafWidth);
          this.matrix.compose(this.localPosition, this.align, this.scale);
          this.matrix.toArray(job.matrixValues, job.bladeCount * 16);
          const leafOffset = job.bladeCount * 4;
          job.variations.copyWithin(
            leafOffset,
            parentVariationOffset,
            parentVariationOffset + 4,
          );
          // Everything else about a leaf is inherited from its crown, but the
          // dither must not be: the LOD keeps a blade when its dither is under
          // the coverage, so copied dithers would make a whole rosette appear
          // and disappear as one instead of thinning leaf by leaf.
          job.variations[leafOffset] = job.random.next();
          job.coverages[job.bladeCount] = bladeCoverage;
          job.biomes[job.bladeCount] = biomeIndex;
          job.bladeCount += 1;
        }
      }
    }

    return job.nextIndex >= job.requestedCount;
  }

  private advanceFinalize(
    job: WorldSingleBladeTileBuildJob,
    deadline: number,
  ): WorldSingleBladeTileBuildResult {
    if (job.stage === "prepare-sort") {
      job.sortOrder = new Uint32Array(job.bladeCount);
      job.sortScratch = new Uint32Array(job.bladeCount);
      job.dithers = new Float32Array(job.bladeCount);
      job.ditherBits = new Uint32Array(
        job.dithers.buffer,
        job.dithers.byteOffset,
        job.dithers.length,
      );
      job.radixCounts = new Uint32Array(256);
      job.radixOffsets = new Uint32Array(256);
      job.finalizeIndex = 0;
      job.stage = "prepare-dithers";
      return this.continueBuild(job, deadline);
    }

    if (job.stage === "prepare-dithers") {
      const order = job.sortOrder;
      const dithers = job.dithers;
      if (!order || !dithers) {
        throw new Error(`Grass tile ${job.options.key} has no sort storage.`);
      }
      const ditherSeed = job.options.material.getDitherSeed();
      let processed = 0;
      while (
        job.finalizeIndex < job.bladeCount &&
        (processed === 0 ||
          processed % DEADLINE_CHECK_INTERVAL !== 0 ||
          performance.now() < deadline)
      ) {
        const index = job.finalizeIndex;
        order[index] = index;
        const value =
          SINGLE_BLADE_DITHER_BIAS +
          job.variations[index * 4] +
          ditherSeed;
        dithers[index] = value - Math.floor(value);
        job.finalizeIndex += 1;
        processed += 1;
      }
      if (job.finalizeIndex < job.bladeCount) {
        return { complete: false };
      }
      job.finalizeIndex = 0;
      job.radixCounts?.fill(0);
      job.stage = "radix-count";
      return this.continueBuild(job, deadline);
    }

    if (job.stage === "radix-count") {
      const order = job.sortOrder;
      const bits = job.ditherBits;
      const counts = job.radixCounts;
      const offsets = job.radixOffsets;
      if (!order || !bits || !counts || !offsets) {
        throw new Error(`Grass tile ${job.options.key} has incomplete radix state.`);
      }
      const shift = job.radixPass * 8;
      let processed = 0;
      while (
        job.finalizeIndex < job.bladeCount &&
        (processed === 0 ||
          processed % DEADLINE_CHECK_INTERVAL !== 0 ||
          performance.now() < deadline)
      ) {
        const source = order[job.finalizeIndex];
        counts[(bits[source] >>> shift) & 0xff] += 1;
        job.finalizeIndex += 1;
        processed += 1;
      }
      if (job.finalizeIndex < job.bladeCount) {
        return { complete: false };
      }
      let offset = 0;
      for (let bucket = 0; bucket < counts.length; bucket += 1) {
        offsets[bucket] = offset;
        offset += counts[bucket];
      }
      job.finalizeIndex = 0;
      job.stage = "radix-scatter";
      return this.continueBuild(job, deadline);
    }

    if (job.stage === "radix-scatter") {
      const order = job.sortOrder;
      const scratch = job.sortScratch;
      const bits = job.ditherBits;
      const offsets = job.radixOffsets;
      if (!order || !scratch || !bits || !offsets) {
        throw new Error(`Grass tile ${job.options.key} has incomplete radix state.`);
      }
      const shift = job.radixPass * 8;
      let processed = 0;
      while (
        job.finalizeIndex < job.bladeCount &&
        (processed === 0 ||
          processed % DEADLINE_CHECK_INTERVAL !== 0 ||
          performance.now() < deadline)
      ) {
        const source = order[job.finalizeIndex];
        const bucket = (bits[source] >>> shift) & 0xff;
        scratch[offsets[bucket]] = source;
        offsets[bucket] += 1;
        job.finalizeIndex += 1;
        processed += 1;
      }
      if (job.finalizeIndex < job.bladeCount) {
        return { complete: false };
      }
      job.sortOrder = scratch;
      job.sortScratch = order;
      job.radixPass += 1;
      job.finalizeIndex = 0;
      if (job.radixPass < 4) {
        job.radixCounts?.fill(0);
        job.stage = "radix-count";
      } else {
        job.sortedDithers = new Float32Array(job.bladeCount);
        job.reorderVisited = new Uint8Array(job.bladeCount);
        job.reorderMatrixScratch = new Float32Array(16);
        job.reorderVariationScratch = new Float32Array(4);
        job.reorderShapeScratch = new Uint8Array(4);
        job.stage = "reorder";
      }
      return this.continueBuild(job, deadline);
    }

    if (job.stage === "reorder") {
      if (!this.advanceInPlaceReorder(job, deadline)) {
        return { complete: false };
      }
      job.centerY = (job.bounds.min.y + job.bounds.max.y) * 0.5;
      job.finalizeIndex = 0;
      job.stage = "center";
      return this.continueBuild(job, deadline);
    }

    if (job.stage === "center") {
      let processed = 0;
      while (
        job.finalizeIndex < job.bladeCount &&
        (processed === 0 ||
          processed % DEADLINE_CHECK_INTERVAL !== 0 ||
          performance.now() < deadline)
      ) {
        job.matrixValues[job.finalizeIndex * 16 + 13] -= job.centerY;
        job.finalizeIndex += 1;
        processed += 1;
      }
      if (job.finalizeIndex < job.bladeCount) {
        return { complete: false };
      }
      job.stage = "mesh";
      return this.continueBuild(job, deadline);
    }

    const placement = this.createPlacement(job);
    return {
      complete: true,
      tile: this.createTile(job.options, placement),
    };
  }

  private continueBuild(
    job: WorldSingleBladeTileBuildJob,
    deadline: number,
  ): WorldSingleBladeTileBuildResult {
    return performance.now() < deadline
      ? this.advanceBuild(job, deadline)
      : { complete: false };
  }

  private advanceInPlaceReorder(
    job: WorldSingleBladeTileBuildJob,
    deadline: number,
  ): boolean {
    const order = job.sortOrder;
    const dithers = job.dithers;
    const sortedDithers = job.sortedDithers;
    const visited = job.reorderVisited;
    const tempMatrix = job.reorderMatrixScratch;
    const tempVariation = job.reorderVariationScratch;
    const tempShape = job.reorderShapeScratch;
    if (
      !order ||
      !dithers ||
      !sortedDithers ||
      !visited ||
      !tempMatrix ||
      !tempVariation ||
      !tempShape
    ) {
      throw new Error(`Grass tile ${job.options.key} has no reorder state.`);
    }
    let processed = 0;
    while (
      job.reorderCycleTarget !== undefined ||
      job.finalizeIndex < job.bladeCount
    ) {
      if (
        processed > 0 &&
        processed % DEADLINE_CHECK_INTERVAL === 0 &&
        performance.now() >= deadline
      ) {
        return false;
      }

      if (job.reorderCycleTarget === undefined) {
        const start = job.finalizeIndex;
        job.finalizeIndex += 1;
        if (visited[start]) {
          processed += 1;
          continue;
        }
        for (let component = 0; component < 16; component += 1) {
          tempMatrix[component] = job.matrixValues[start * 16 + component];
        }
        for (let component = 0; component < 4; component += 1) {
          tempVariation[component] = job.variations[start * 4 + component];
          tempShape[component] = job.shapes[start * 4 + component];
        }
        job.reorderCoverageScratch = job.coverages[start];
        job.reorderBiomeScratch = job.biomes[start];
        job.reorderCycleStart = start;
        job.reorderCycleTarget = start;
      }

      const start = job.reorderCycleStart;
      const target = job.reorderCycleTarget;
      if (start === undefined || target === undefined) {
        throw new Error(`Grass tile ${job.options.key} lost its reorder cycle.`);
      }
      visited[target] = 1;
      sortedDithers[target] = dithers[order[target]];
      const source = order[target];
      if (source === start) {
        job.matrixValues.set(tempMatrix, target * 16);
        job.variations.set(tempVariation, target * 4);
        job.shapes.set(tempShape, target * 4);
        job.coverages[target] = job.reorderCoverageScratch ?? 1;
        job.biomes[target] = job.reorderBiomeScratch ?? 0;
        job.reorderCycleStart = undefined;
        job.reorderCycleTarget = undefined;
        job.reorderCoverageScratch = undefined;
        job.reorderBiomeScratch = undefined;
      } else {
        job.matrixValues.copyWithin(target * 16, source * 16, source * 16 + 16);
        job.variations.copyWithin(target * 4, source * 4, source * 4 + 4);
        job.shapes.copyWithin(target * 4, source * 4, source * 4 + 4);
        job.coverages[target] = job.coverages[source];
        job.biomes[target] = job.biomes[source];
        job.reorderCycleTarget = source;
      }
      processed += 1;
    }
    return true;
  }

  private createPlacement(
    job: WorldSingleBladeTileBuildJob,
  ): WorldSingleBladePlacement {
    const sortedDithers = job.sortedDithers;
    if (!sortedDithers) {
      throw new Error(`Grass tile ${job.options.key} finalized without dithers.`);
    }
    const origin = new THREE.Vector3(
      job.tileCenterX,
      job.centerY,
      job.tileCenterZ,
    );
    const localBounds = job.bounds
      .clone()
      .expandByScalar(this.calculateBoundsPadding());
    localBounds.min.sub(origin);
    localBounds.max.sub(origin);
    const instanceMatrix = new THREE.InstancedBufferAttribute(
      job.matrixValues.subarray(0, job.bladeCount * 16),
      16,
    );
    instanceMatrix.setUsage(THREE.StaticDrawUsage);
    const variationAttribute = new THREE.InstancedBufferAttribute(
      job.variations.subarray(0, job.bladeCount * 4),
      4,
    );
    // Normalized: the shader reads all four channels in 0..1 and decodes the
    // signed ones itself.
    const shapeAttribute = new THREE.InstancedBufferAttribute(
      job.shapes.subarray(0, job.bladeCount * 4),
      4,
      true,
    );
    const coverageAttribute = new THREE.InstancedBufferAttribute(
      job.coverages.subarray(0, job.bladeCount),
      1,
    );
    const biomeAttribute = new THREE.InstancedBufferAttribute(
      job.biomes.subarray(0, job.bladeCount),
      1,
    );
    const placement: WorldSingleBladePlacement = {
      key: job.placementKey,
      matrixValues: job.matrixValues,
      variations: job.variations,
      shapes: job.shapes,
      coverages: job.coverages,
      biomes: job.biomes,
      bladeCount: job.bladeCount,
      sortedDithers,
      instanceMatrix,
      variationAttribute,
      shapeAttribute,
      coverageAttribute,
      biomeAttribute,
      origin,
      localBounds,
      boundingSphere: localBounds.getBoundingSphere(new THREE.Sphere()),
      references: 0,
    };
    this.placementCache.set(placement.key, placement);
    job.sortOrder = undefined;
    job.sortScratch = undefined;
    job.dithers = undefined;
    job.ditherBits = undefined;
    job.radixCounts = undefined;
    job.radixOffsets = undefined;
    job.reorderVisited = undefined;
    job.reorderMatrixScratch = undefined;
    job.reorderVariationScratch = undefined;
    job.reorderShapeScratch = undefined;
    job.reorderCycleStart = undefined;
    job.reorderCycleTarget = undefined;
    job.reorderCoverageScratch = undefined;
    job.reorderBiomeScratch = undefined;
    return placement;
  }

  private createTile(
    options: WorldSingleBladeTileBuildOptions,
    placement: WorldSingleBladePlacement,
  ): WorldSingleBladeTile {
    const sourceGeometry = this.getSourceGeometry(options.bladeSegments);
    const geometry = this.geometryFactory.createInstancedGeometry(
      sourceGeometry,
      placement.variations.subarray(0, placement.bladeCount * 4),
      placement.coverages.subarray(0, placement.bladeCount),
      {
        variation: placement.variationAttribute,
        shape: placement.shapeAttribute,
        coverage: placement.coverageAttribute,
        biome: placement.biomeAttribute,
      },
      placement.biomes.subarray(0, placement.bladeCount),
    );
    const mesh = new THREE.InstancedMesh(geometry, options.material.material, 0);
    mesh.name = `${options.namePrefix}-${options.key}`;
    mesh.castShadow = false;
    mesh.receiveShadow = options.receiveShadows && this.profile.shadows;
    mesh.frustumCulled = true;
    mesh.instanceMatrix = placement.instanceMatrix;
    mesh.count = placement.bladeCount;
    mesh.position.copy(placement.origin);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.boundingBox = placement.localBounds;
    mesh.boundingSphere = placement.boundingSphere;
    placement.references += 1;

    return {
      key: options.key,
      tileX: options.tileX,
      tileZ: options.tileZ,
      mesh,
      bladeCount: placement.bladeCount,
      sortedDithers: placement.sortedDithers,
      placementKey: placement.key,
    };
  }

  disposeTile(tile: WorldSingleBladeTile): void {
    const placement = this.placementCache.get(tile.placementKey);
    if (!placement) {
      this.geometryFactory.disposeInstancedMesh(tile.mesh);
      return;
    }
    placement.references -= 1;
    this.geometryFactory.disposeInstancedMesh(
      tile.mesh,
      placement.references > 0,
    );
    if (placement.references <= 0) {
      this.placementCache.delete(placement.key);
      this.parkPlacement(placement);
    }
  }

  private parkPlacement(placement: WorldSingleBladePlacement): void {
    this.placementLru.delete(placement.key);
    this.placementLru.set(placement.key, placement);
    while (this.placementLru.size > PLACEMENT_LRU_LIMIT) {
      const oldestKey = this.placementLru.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      const evicted = this.placementLru.get(oldestKey);
      this.placementLru.delete(oldestKey);
      if (evicted) {
        this.releaseBuildBuffers(evicted);
      }
    }
  }

  private rehydratePlacement(placement: WorldSingleBladePlacement): void {
    const bladeCount = placement.bladeCount;
    placement.instanceMatrix = new THREE.InstancedBufferAttribute(
      placement.matrixValues.subarray(0, bladeCount * 16),
      16,
    );
    placement.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    placement.variationAttribute = new THREE.InstancedBufferAttribute(
      placement.variations.subarray(0, bladeCount * 4),
      4,
    );
    placement.shapeAttribute = new THREE.InstancedBufferAttribute(
      placement.shapes.subarray(0, bladeCount * 4),
      4,
      true,
    );
    placement.coverageAttribute = new THREE.InstancedBufferAttribute(
      placement.coverages.subarray(0, bladeCount),
      1,
    );
    placement.biomeAttribute = new THREE.InstancedBufferAttribute(
      placement.biomes.subarray(0, bladeCount),
      1,
    );
  }

  cancelBuild(job: WorldSingleBladeTileBuildJob): void {
    if (job.cachedPlacement) {
      return;
    }
    if (job.heightLattice) {
      this.latticePool.push(job.heightLattice);
      job.heightLattice = undefined;
    }
    this.releaseBuildBuffers(job);
  }

  dispose(): void {
    for (const geometry of this.sourceGeometries.values()) {
      geometry.dispose();
    }
    this.sourceGeometries.clear();
    this.placementCache.clear();
    this.placementLru.clear();
    this.emptyPlacementCache.clear();
    this.buildBufferPool.clear();
    this.latticePool.length = 0;
  }

  private createPlacementKey(options: WorldSingleBladeTileBuildOptions): string {
    return `${options.tileX}:${options.tileZ}:${options.densityMultiplier}:${options.seedSalt}:${options.material.getDitherSeed()}:biome-${GRASS_BIOME_VERSION}:placement-${GRASS_PLACEMENT_VERSION}`;
  }

  private rememberEmptyPlacement(key: string): void {
    this.emptyPlacementCache.delete(key);
    this.emptyPlacementCache.set(key, true);
    while (this.emptyPlacementCache.size > EMPTY_PLACEMENT_CACHE_LIMIT) {
      const oldest = this.emptyPlacementCache.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.emptyPlacementCache.delete(oldest);
    }
  }

  /**
   * Blades a tile with this many placement cells can spend on base blades and
   * optional rosette leaves. The expected expansion keeps memory predictable;
   * the sampling loop reserves one slot for every unvisited base cell, so a
   * high rosette roll can reduce optional leaves but can never truncate space.
   */
  private resolveBladeCapacity(requestedCount: number): number {
    return Math.ceil(requestedCount * this.rosetteExpansion);
  }

  private acquireBuildBuffers(requestedCount: number): TileBuildBuffers {
    const capacity = this.resolveBladeCapacity(requestedCount);
    const pool = this.buildBufferPool.get(capacity);
    const buffers = pool?.pop();
    if (buffers) {
      return buffers;
    }
    return {
      matrixValues: new Float32Array(capacity * 16),
      variations: new Float32Array(capacity * 4),
      shapes: new Uint8Array(capacity * 4),
      coverages: new Float32Array(capacity),
      biomes: new Float32Array(capacity),
    };
  }

  private releaseBuildBuffers(buffers: TileBuildBuffers): void {
    const capacity = buffers.matrixValues.length / 16;
    let pool = this.buildBufferPool.get(capacity);
    if (!pool) {
      pool = [];
      this.buildBufferPool.set(capacity, pool);
    }
    if (pool.length < 4) {
      pool.push({
        matrixValues: buffers.matrixValues,
        variations: buffers.variations,
        shapes: buffers.shapes,
        coverages: buffers.coverages,
        biomes: buffers.biomes,
      });
    }
  }

  /**
   * Four numbers that give one blade a silhouette of its own.
   *
   * The source geometry is a single cached triangle, so without these the whole
   * near population differs only by an affine transform: the same symmetric
   * outline, the same taper, the same intact point, the apex always over the
   * root. These are what a blade actually varies in — which way its tip falls,
   * how fast it narrows, whether it is whole, and how far it bends.
   *
   * Drawn from `job.random` and never from the LOD dither. The mid layer's
   * draw truncation reproduces that dither bit-exactly on the CPU and depends
   * on it carrying no per-instance term; deriving morphology from it would make
   * a blade's shape a function of which blades the LOD happens to keep.
   *
   * Returns whether this blade is one of the broad minority, which the caller
   * needs for its instance width.
   */
  private writeShapeChannels(
    job: WorldSingleBladeTileBuildJob,
    index: number,
    driftScale: number,
  ): boolean {
    const offset = index * 4;
    const isBroadBlade =
      job.random.next() < this.worldConfig.grassBroadBladeShare;
    // A unit signed value: the metric scale lives in uGrassShapeTipDrift, so
    // applying the configured drift here as well would square it.
    job.shapes[offset] = encodeShapeUnit(
      THREE.MathUtils.clamp(job.random.range(-1, 1) * driftScale, -1, 1) * 0.5 +
        0.5,
    );
    job.shapes[offset + 1] = encodeShapeUnit(
      isBroadBlade ? job.random.range(0.72, 1) : job.random.range(0, 0.55),
    );
    job.shapes[offset + 2] = encodeShapeUnit(
      job.random.next() < this.worldConfig.grassBladeDamageShare
        ? job.random.range(0.4, 1)
        : 0,
    );
    job.shapes[offset + 3] = encodeShapeUnit(
      THREE.MathUtils.clamp(
        0.5 +
          (job.random.next() - 0.5) * 1.5 +
          this.clusterProfile.leanTowardMax * 0.3,
        0,
        1,
      ),
    );
    return isBroadBlade;
  }

  private getSourceGeometry(bladeSegments: number): THREE.BufferGeometry {
    const segments = Math.max(1, Math.round(bladeSegments));
    let geometry = this.sourceGeometries.get(segments);
    if (!geometry) {
      geometry = this.createSingleBladeGeometry(this.grassConfig, segments);
      this.sourceGeometries.set(segments, geometry);
    }
    return geometry;
  }

  private calculateBoundsPadding(): number {
    return calculateGrassSingleBladeRootBoundsRadius({
      bladeHeight: this.grassConfig.geometry.bladeHeightMax,
      bladeWidth: this.grassConfig.geometry.bladeWidthMax,
      bladeLean: this.grassConfig.geometry.bladeLeanMax,
      bladeCurveReach: calculateGrassBladeCurveReach(
        this.grassConfig.geometry.bladeHeightMax,
        this.grassConfig.geometry.bladeCurve,
      ),
      // Charging drift and bend together is deliberately conservative: they
      // peak at different points along the blade and never sum in practice.
      shapeReach:
        this.grassConfig.geometry.bladeWidthMax *
          this.worldConfig.grassBladeTipDrift +
        this.grassConfig.geometry.bladeHeightMax * GRASS_SHAPE_BEND_FRACTION,
      maximumHorizontalScale: INSTANCE_HORIZONTAL_SCALE_MAX,
      maximumVerticalScale: INSTANCE_VERTICAL_SCALE_MAX,
      windStrength: this.grassConfig.wind.strength,
      flutterStrength: this.grassConfig.wind.flutterStrength,
      maximumArtWindScale: MAXIMUM_ART_WIND_SCALE,
      maximumInstanceWindScale: MAXIMUM_INSTANCE_WIND_SCALE,
      maximumWindStiffness: MAXIMUM_WIND_STIFFNESS,
      maximumInteractionStrength: Math.max(
        this.worldConfig.grassInteractionStrength,
        this.worldConfig.grassLandingPulseStrength,
      ),
      interactionVerticalScale: INTERACTION_VERTICAL_SCALE,
      safetyMargin: BOUNDS_SAFETY_MARGIN,
    });
  }

  private createSingleBladeGeometry(
    config: GrassConfig,
    segments: number,
  ): THREE.BufferGeometry {
    const height =
      (config.geometry.bladeHeightMin + config.geometry.bladeHeightMax) * 0.5;
    const width =
      (config.geometry.bladeWidthMin + config.geometry.bladeWidthMax) * 0.5;
    const positions: number[] = [];
    const uvs: number[] = [];
    const progress: number[] = [];
    const widths: number[] = [];
    const phases: number[] = [];
    const shades: number[] = [];
    const indices: number[] = [];
    const curve = config.geometry.bladeCurve;

    for (let segment = 0; segment < segments; segment += 1) {
      const amount = segment / segments;
      const taper = Math.pow(1 - amount, 0.72);
      const halfWidth = width * 0.5 * taper;
      const point = resolveGrassBladeArcPoint(height, curve, amount);
      positions.push(
        -halfWidth,
        point.y,
        point.z,
        halfWidth,
        point.y,
        point.z,
      );
      uvs.push(0, amount, 1, amount);
      progress.push(amount, amount);
      widths.push(width * 0.5, width * 0.5);
      phases.push(0.5, 0.5);
      shades.push(0.5, 0.5);
    }

    const tip = resolveGrassBladeArcPoint(height, curve, 1);
    const tipVertex = positions.length / 3;
    positions.push(0, tip.y, tip.z);
    uvs.push(0.5, 1);
    progress.push(1);
    widths.push(width * 0.5);
    phases.push(0.5);
    shades.push(0.5);

    for (let segment = 0; segment < segments - 1; segment += 1) {
      const row = segment * 2;
      indices.push(row, row + 2, row + 1, row + 2, row + 3, row + 1);
    }
    const finalRow = (segments - 1) * 2;
    indices.push(finalRow, tipVertex, finalRow + 1);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute(
      "grassProgress",
      new THREE.Float32BufferAttribute(progress, 1),
    );
    geometry.setAttribute(
      "grassBladeWidth",
      new THREE.Float32BufferAttribute(widths, 1),
    );
    geometry.setAttribute(
      "grassPhase",
      new THREE.Float32BufferAttribute(phases, 1),
    );
    geometry.setAttribute(
      "grassBladeShade",
      new THREE.Float32BufferAttribute(shades, 1),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  private clumpValue(clumpX: number, clumpZ: number, salt: number): number {
    return sampleGrassClumpValue(
      clumpX,
      clumpZ,
      this.worldConfig.seed,
      salt,
    );
  }

  private hash(x: number, z: number, seed: number): number {
    let value = Math.imul(x, 374761393) + Math.imul(z, 668265263) + seed;
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return (value ^ (value >>> 16)) >>> 0;
  }
}
