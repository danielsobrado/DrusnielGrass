import * as THREE from "three";
import { samplePathEdgeNoise } from "../grass/GrassFieldVariation";
import { CanopyShadeField } from "./ecology/CanopyShadeField";
import {
  createTerrainLandform,
  TerrainLandformField,
  type TerrainLandform,
} from "./ecology/TerrainLandformField";
import {
  createEcologySample,
  WorldEcologyField,
  type WorldEcologySample,
} from "./ecology/WorldEcologyField";
import {
  createHydrologySample,
  HydrologyField,
  type HydrologySample,
} from "./hydrology/HydrologyField";
import type { CascadeSite } from "./hydrology/WaterCascadeSites";
import { WorldTreeField } from "./scenic/WorldTreeField";
import type { WorldConfig } from "./WorldConfig";

const COLOR_GRASS = new THREE.Color("#466f3a");
const COLOR_DRY_GRASS = new THREE.Color("#66794f");
const COLOR_ROCK = new THREE.Color("#696b64");
const COLOR_HIGH_ROCK = new THREE.Color("#85857f");
const COLOR_DIRT = new THREE.Color("#665b45");
const COLOR_SCRATCH = new THREE.Color();

/**
 * Central-difference step for {@link TerrainField.sampleNormal}. Exported so a
 * cache reproducing the normal can use the identical step; the two disagree
 * silently otherwise.
 */
export const TERRAIN_NORMAL_STEP = 1.5;

/**
 * Radius of the landform sampling ring, in metres.
 *
 * Chosen by measurement, not intuition. Curvature has to be read at the scale
 * of the process it explains — water collects in a hillside hollow, not in a
 * bump — and narrower rings return the terrain's mid-frequency content, which
 * then jitters between neighbouring samples. Across a transect at map
 * resolution, the jump between adjacent samples as a share of the field's own
 * spread falls 0.058 → 0.037 → 0.027 → 0.024 at radii of 16, 28, 44 and 64 m,
 * against 0.027 for slope and 0.025 for exposure. Past about 44 m it stops
 * buying smoothness and only costs reach, so that is where this sits.
 */
export const TERRAIN_CURVATURE_STEP = 44;
/**
 * Curvature magnitude that maps to roughly ±0.76 after soft saturation; the
 * 85th percentile of |curvature| measured at the radius above.
 *
 * The field is saturated with tanh rather than clamped, so this is a scale
 * rather than a limit. That distinction mattered: an earlier clamp at a mid
 * percentile pinned most of the world to ±1, where any wobble between
 * neighbours became a full-scale flip and painted salt-and-pepper rock across
 * the whole map.
 */
export const TERRAIN_CURVATURE_RANGE = 0.00214;

/**
 * Walking ways are the zero contours of two domain-warped value-noise fields.
 * A contour of a continuous field never branches and never crosses itself, and
 * it wanders for kilometres: the shape of a footpath worn across open country.
 * Two fields at different scales give a small network whose ways cross.
 *
 * Distances are reported in metres by dividing the field value by the length of
 * its gradient. That keeps a way roughly the same width everywhere instead of
 * letting it balloon wherever the noise flattens out. Only the magnitude is an
 * estimate — the sign is always the sign of the raw field, so an interpolated
 * zero crossing between two terrain vertices can only fall where the contour
 * genuinely runs.
 */
const PATH_WARP_SCALE = 0.0009;
/** Metres of lateral meander the warp adds to an otherwise smooth contour. */
const PATH_WANDER = 260;
/** The branch field is finer than the main one, so its ways are more frequent. */
const PATH_BRANCH_SPACING_RATIO = 0.72;
/** Finite-difference step for the field gradient. */
const PATH_GRADIENT_STEP = 3;
const PATH_MIN_GRADIENT = 1e-9;
/**
 * Reported distances saturate here. Past this nothing but "not on a way" is
 * ever asked of the value, and bounding it keeps the terrain's interpolated
 * vertex attribute inside a useful range.
 */
const PATH_MAX_DISTANCE = 24;
/**
 * Widest footprint {@link TerrainField.samplePathGrassMask} can clear for. It
 * sets how wide the band of points that need a gradient is, so it is kept just
 * above the largest radius any caller asks for — half a grass patch.
 */
const PATH_MAX_CLEARANCE_RADIUS = 3;
/** Metres over which grass thins out into the bare verge. */
export const PATH_GRASS_FEATHER = 1.4;
/**
 * Value noise interpolated with a smoothstep changes by at most 1.5 per lattice
 * cell, and the two fbm octaves add their weighted slopes: 1.5 * (2/3 + 2.03/3).
 */
const PATH_MAX_FIELD_SLOPE = 2.02;
/**
 * Safety factor on that bound. The early rejection has to be conservative — a
 * point it discards is never re-examined — and the bound above is an idealised
 * worst case rather than a measured one.
 */
const PATH_CUTOFF_SAFETY = 2;

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function smoothstep(value: number, minimum: number, maximum: number): number {
  if (value <= minimum) {
    return 0;
  }
  if (value >= maximum) {
    return 1;
  }
  const amount = (value - minimum) / (maximum - minimum);
  return amount * amount * (3 - 2 * amount);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export class TerrainField {
  private readonly worldHalfExtent: number;
  private readonly grassSlopeLimit: number;
  private readonly grassSlopeFadeEnd: number;
  private readonly hydrology: HydrologyField;
  private readonly hydrologyScratch = createHydrologySample();
  private readonly ecology: WorldEcologyField;
  private readonly ecologyScratch = createEcologySample();
  private readonly canopyShade: CanopyShadeField;
  /**
   * Separate scratch for the open-ground path, because that path runs *inside*
   * the shaded one: resolving canopy shade asks where the crowns are, and
   * deciding where a crown stands asks what the open ground there is like. One
   * shared sample would have the inner query overwrite the outer one's answer.
   */
  private readonly openEcologyScratch = createEcologySample();
  private readonly openHydrologyScratch = createHydrologySample();
  private readonly openLandformScratch = createTerrainLandform();
  private readonly landform: TerrainLandformField;
  private readonly landformScratch = createTerrainLandform();
  private noisePairLow = 0;
  private noisePairHigh = 0;
  /** Frequency of the main and branch path fields. */
  private readonly pathScaleMain: number;
  private readonly pathScaleBranch: number;
  /** Half the bare tread of each way, in metres. */
  private readonly pathHalfWidthMain: number;
  private readonly pathHalfWidthBranch: number;
  /** Where grass starts again: the tread plus its ragged edge and clearance. */
  private readonly pathGrassHalfWidthMain: number;
  private readonly pathEdgeRoughness: number;
  private readonly pathGrassEdgeRoughness: number;
  private readonly pathGrassHalfWidthBranch: number;
  private readonly pathValueCutoff: number;
  private readonly pathAltitudeFadeStart: number;
  private readonly pathAltitudeFadeEnd: number;
  private pathValueMain = 0;
  private pathValueBranch = 0;
  private readonly pathScratch = new THREE.Vector2();

  constructor(private readonly config: WorldConfig) {
    this.worldHalfExtent = config.worldSize * 0.5;
    this.hydrology = new HydrologyField(config, (x, z) =>
      this.sampleRawHeight(x, z),
    );
    this.ecology = new WorldEcologyField(config);
    // The field owns its shade source rather than waiting for the renderer to
    // register one. Ecology has to be identical at every LOD, on every device,
    // and in every headless probe, and a shade field that only exists when the
    // scenic layer happens to be built would fail all three: a compact profile
    // that skips trees would grow a different meadow from a desktop one.
    this.canopyShade = new CanopyShadeField(new WorldTreeField(this, config));
    this.landform = new TerrainLandformField(
      (x, z) => this.sampleHeight(x, z),
      TERRAIN_CURVATURE_STEP,
      TERRAIN_CURVATURE_RANGE,
    );
    this.grassSlopeLimit = Math.cos(
      THREE.MathUtils.degToRad(config.grassMaxSlopeDegrees),
    );
    this.grassSlopeFadeEnd = Math.min(0.98, this.grassSlopeLimit + 0.2);

    this.pathScaleMain = 1 / config.pathSpacing;
    this.pathScaleBranch =
      1 / (config.pathSpacing * PATH_BRANCH_SPACING_RATIO);
    this.pathHalfWidthMain = config.pathWidth * 0.5;
    this.pathHalfWidthBranch = config.pathBranchWidth * 0.5;
    const grassMargin = config.pathEdgeRoughness + config.pathGrassClearance;
    this.pathEdgeRoughness = config.pathEdgeRoughness;
    this.pathGrassEdgeRoughness = config.pathGrassEdgeRoughness;
    this.pathGrassHalfWidthMain = this.pathHalfWidthMain + grassMargin;
    this.pathGrassHalfWidthBranch = this.pathHalfWidthBranch + grassMargin;

    const candidateDistance =
      Math.max(this.pathGrassHalfWidthMain, this.pathGrassHalfWidthBranch) +
      PATH_MAX_CLEARANCE_RADIUS +
      PATH_GRASS_FEATHER +
      // The roughened boundary can push the vegetation edge this much further
      // out, and a point the early rejection discards is never re-examined.
      config.pathGrassEdgeRoughness * 0.5;
    const warpStretch = 1 + PATH_WANDER * 1.5 * PATH_WARP_SCALE;
    this.pathValueCutoff =
      PATH_CUTOFF_SAFETY *
      PATH_MAX_FIELD_SLOPE *
      Math.max(this.pathScaleMain, this.pathScaleBranch) *
      warpStretch *
      candidateDistance;

    this.pathAltitudeFadeStart = config.baseHeight + config.rollingHeight;
    this.pathAltitudeFadeEnd =
      this.pathAltitudeFadeStart + config.rollingHeight;
  }
  sampleHeight(x: number, z: number): number {
    return this.hydrology.carveHeight(x, z, this.sampleRawHeight(x, z));
  }

  /**
   * Terrain before any hydrology carving. Hydrology itself needs this to read
   * the elevation of a river's centreline, so it must stay free of the carve
   * that `sampleHeight` applies — otherwise resolving a water level would
   * recurse back into the field that is asking for it.
   */
  sampleRawHeight(x: number, z: number): number {
    const mountainScale = this.config.mountainScale;
    const detailScale = this.config.detailScale;
    const seed = this.config.seed;

    const broad = this.fbm(x * mountainScale, z * mountainScale, 4, seed);
    const warpX = x * mountainScale * 0.55;
    const warpZ = z * mountainScale * 0.55;
    this.valueNoisePair(warpX, warpZ, seed + 17, seed + 29);
    const warpedX = x + (this.noisePairLow - 0.5) * 210;
    const warpedZ = z + (this.noisePairHigh - 0.5) * 210;
    const ridgeNoise = this.fbm(
      warpedX * mountainScale * 1.7,
      warpedZ * mountainScale * 1.7,
      5,
      seed + 101,
    );
    const ridges = Math.pow(1 - Math.abs(ridgeNoise * 2 - 1), 2.35);
    const mountainMask = smoothstep(broad, 0.48, 0.86);
    const rolling =
      (this.fbm(x * detailScale, z * detailScale, 5, seed + 211) - 0.5) *
      this.config.rollingHeight;
    const micro =
      (this.fbm(x * detailScale * 3.1, z * detailScale * 3.1, 3, seed + 307) -
        0.5) *
      3.5;
    const rawHeight =
      this.config.baseHeight +
      rolling +
      micro +
      ridges * mountainMask * this.config.mountainHeight;
    return rawHeight;
  }

  /** Knickpoints inside an area, for the cascade curtains that render them. */
  forEachCascade(
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
    visit: (site: CascadeSite) => void,
  ): void {
    this.hydrology.forEachCascade(minX, maxX, minZ, maxZ, visit);
  }

  sampleHydrology(
    x: number,
    z: number,
    height: number,
    target: HydrologySample,
  ): HydrologySample {
    return this.hydrology.sample(x, z, height, target);
  }

  /**
   * Landform convexity: positive on ridges and spurs, negative in hollows and
   * drainage lines, zero on an even slope.
   *
   * Measured across {@link TERRAIN_CURVATURE_STEP} rather than the shading
   * normal's step. Curvature has to be sampled at the scale of the process it
   * explains, and water pools at the scale of a landform, not of a bump: at a
   * metre and a half this returns the micro-noise riding on the terrain, which
   * would speckle the ecology instead of finding its valleys.
   */
  sampleCurvature(x: number, z: number): number {
    return this.sampleLandform(x, z, this.landformScratch).convexity;
  }

  /** Landform shape at a point: convexity, fall, and facing. */
  sampleLandform(
    x: number,
    z: number,
    target: TerrainLandform,
  ): TerrainLandform {
    return this.landform.sample(x, z, target);
  }

  sampleNormal(x: number, z: number, target: THREE.Vector3): THREE.Vector3 {
    const step = TERRAIN_NORMAL_STEP;
    const left = this.sampleHeight(x - step, z);
    const right = this.sampleHeight(x + step, z);
    const down = this.sampleHeight(x, z - step);
    const up = this.sampleHeight(x, z + step);
    return target.set(left - right, step * 2, down - up).normalize();
  }

  sampleGrassSuitability(
    x: number,
    z: number,
    height: number,
    normal: THREE.Vector3,
  ): number {
    return (
      this.sampleGrassSlopeMask(normal) *
      this.sampleGrassSuitabilityWithoutSlope(x, z, height)
    );
  }

  sampleGrassSlopeMask(normal: THREE.Vector3): number {
    return smoothstep(
      normal.y,
      this.grassSlopeLimit,
      this.grassSlopeFadeEnd,
    );
  }

  sampleGrassSuitabilityWithoutSlope(
    x: number,
    z: number,
    height: number,
  ): number {
    if (
      Math.abs(x) > this.worldHalfExtent ||
      Math.abs(z) > this.worldHalfExtent
    ) {
      return 0;
    }

    const lowAltitude = smoothstep(
      height,
      this.config.grassMinAltitude,
      this.config.grassMinAltitude + 12,
    );
    const highAltitude =
      1 -
      smoothstep(
        height,
        this.config.grassMaxAltitude - 28,
        this.config.grassMaxAltitude,
      );

    const biome = this.fbm(
      x * 0.0017,
      z * 0.0017,
      4,
      this.config.seed + 401,
    );
    const biomeMask = smoothstep(biome, 0.34, 0.5);

    const densityNoise = this.fbm(
      x * 0.0065,
      z * 0.0065,
      3,
      this.config.seed + 509,
    );
    const localDensity = lerp(
      0.78,
      1,
      smoothstep(densityNoise, 0.22, 0.78),
    );

    const exposedRidge = this.valueNoise(
      x * 0.002,
      z * 0.002,
      this.config.seed + 613,
    );
    const ridgeMask = 1 - smoothstep(exposedRidge, 0.74, 0.92) * 0.7;
    const waterMask = this.hydrology.sample(
      x,
      z,
      height,
      this.hydrologyScratch,
    ).grassMask;

    return clamp(
      lowAltitude *
        highAltitude *
        biomeMask *
        localDensity *
        ridgeMask *
        waterMask,
      0,
      1,
    );
  }

  samplePathDistances(
    x: number,
    z: number,
    target: THREE.Vector2,
  ): THREE.Vector2 {
    this.samplePathValues(x, z);
    const valueMain = this.pathValueMain;
    const valueBranch = this.pathValueBranch;
    if (
      Math.abs(valueMain) > this.pathValueCutoff &&
      Math.abs(valueBranch) > this.pathValueCutoff
    ) {
      return target.set(
        valueMain >= 0 ? PATH_MAX_DISTANCE : -PATH_MAX_DISTANCE,
        valueBranch >= 0 ? PATH_MAX_DISTANCE : -PATH_MAX_DISTANCE,
      );
    }

    this.samplePathValues(x + PATH_GRADIENT_STEP, z);
    const eastMain = this.pathValueMain;
    const eastBranch = this.pathValueBranch;
    this.samplePathValues(x, z + PATH_GRADIENT_STEP);
    const northMain = this.pathValueMain;
    const northBranch = this.pathValueBranch;

    return target.set(
      this.pathDistance(
        valueMain,
        eastMain - valueMain,
        northMain - valueMain,
      ),
      this.pathDistance(
        valueBranch,
        eastBranch - valueBranch,
        northBranch - valueBranch,
      ),
    );
  }

  samplePathVisibility(height: number): number {
    return (
      1 -
      smoothstep(height, this.pathAltitudeFadeStart, this.pathAltitudeFadeEnd)
    );
  }

  samplePathGrassMask(
    x: number,
    z: number,
    height: number,
    radius = 0,
  ): number {
    this.samplePathDistances(x, z, this.pathScratch);
    return this.resolvePathGrassMask(this.pathScratch, height, radius, x, z);
  }

  /**
   * How completely the tread has taken this ground, in [0, 1].
   *
   * Mirrors the terrain shader's own `terrainPathCore`, and exists so the blade
   * layer can ask the same question the ground answers: a pioneer blade may
   * stand in the verge and at the edge of the tread, but not in the middle of a
   * walked path, and the two layers have to agree on where that middle is.
   */
  samplePathCoreAmount(x: number, z: number, height: number): number {
    this.samplePathDistances(x, z, this.pathScratch);
    const edge = samplePathEdgeNoise(x, z) * this.pathEdgeRoughness;
    const main =
      1 -
      smoothstep(
        Math.abs(this.pathScratch.x) + edge,
        Math.max(0, this.pathHalfWidthMain - 0.12),
        this.pathHalfWidthMain + 0.28,
      );
    const branch =
      1 -
      smoothstep(
        Math.abs(this.pathScratch.y) + edge,
        Math.max(0, this.pathHalfWidthBranch - 0.12),
        this.pathHalfWidthBranch + 0.28,
      );
    return Math.max(main, branch) * this.samplePathVisibility(height);
  }

  /**
   * The grass mask for distances a caller has already sampled. Terrain chunks
   * read path distances per vertex anyway, so re-deriving them inside the
   * ecology layer would pay for the same gradient twice.
   */
  resolvePathGrassMask(
    distances: THREE.Vector2,
    height: number,
    radius = 0,
    x?: number,
    z?: number,
  ): number {
    const clearance = Math.min(radius, PATH_MAX_CLEARANCE_RADIUS);
    /**
     * The vegetation boundary is roughened by the same field the dirt core is.
     *
     * Only the core used to be ragged; the grass edge around it was a clean
     * offset curve, so a ragged patch of dirt sat inside a smooth green cut-out
     * and the verge read as a stencil laid over the meadow rather than as
     * anything that grew. Roughening it more than the mineral edge is what
     * trampling actually produces.
     *
     * Position is optional because a few callers hold pre-sampled distances and
     * nothing else; those get the old smooth boundary, which is conservative --
     * they use the mask as a clearance test rather than to place anything.
     */
    const edge =
      x === undefined || z === undefined
        ? 0
        : samplePathEdgeNoise(x, z) * this.pathGrassEdgeRoughness;
    const main = smoothstep(
      Math.abs(distances.x) + edge,
      this.pathGrassHalfWidthMain + clearance,
      this.pathGrassHalfWidthMain + clearance + PATH_GRASS_FEATHER,
    );
    const branch = smoothstep(
      Math.abs(distances.y) + edge,
      this.pathGrassHalfWidthBranch + clearance,
      this.pathGrassHalfWidthBranch + clearance + PATH_GRASS_FEATHER,
    );
    const pathMask = Math.min(main, branch);
    return lerp(1, pathMask, this.samplePathVisibility(height));
  }

  /**
   * Ground colour, derived from the ecology at this point rather than from a
   * second private reading of the terrain.
   *
   * The dry/lush split used to come from an independent noise field and the
   * rock from raw steepness, which meant the ground's own story disagreed with
   * the grass growing on it and with the stones lying on it. Reading all three
   * from {@link WorldEcologyField} is what makes a dry sunny spur show pale
   * grass, thin soil, and exposed rock together instead of by coincidence.
   */
  sampleColor(
    x: number,
    z: number,
    height: number,
    grassSuitability: number,
    ecology: WorldEcologySample,
    target: THREE.Color,
  ): THREE.Color {
    const altitude = smoothstep(
      height,
      this.config.grassMaxAltitude - 35,
      this.config.grassMaxAltitude + 50,
    );

    // Moisture drives the lush/parched axis; the residual noise only breaks up
    // an otherwise even wash, so a patch of dry grass now marks somewhere that
    // is genuinely dry.
    const grain =
      this.valueNoise(x * 0.006, z * 0.006, this.config.seed + 701) - 0.5;
    const dryness = clamp(
      1 - ecology.moisture + grain * 0.22,
      0,
      1,
    );
    target.copy(COLOR_GRASS).lerp(COLOR_DRY_GRASS, dryness * 0.86);

    // Bare soil shows where cover fails: thin soil, traffic, or unsuitable
    // ground. Taking the strongest cause rather than adding them keeps a
    // footpath from turning the whole surrounding meadow to dirt.
    const bare = Math.max(
      1 - grassSuitability,
      ecology.disturbance,
      clamp(0.82 - ecology.fertility, 0, 1) * 0.75,
    );
    target.lerp(COLOR_DIRT, clamp(bare, 0, 1));

    COLOR_SCRATCH.copy(COLOR_ROCK).lerp(COLOR_HIGH_ROCK, altitude);
    return target.lerp(COLOR_SCRATCH, ecology.rockiness);
  }

  /**
   * Ecology from inputs a caller already holds. This is the path the hot
   * consumers use: terrain chunks, grass placement, and stone placement all
   * sample height, normal, hydrology, and path distances for their own reasons,
   * so the layer costs them one lattice lookup rather than a second reading of
   * the world.
   */
  resolveEcology(
    x: number,
    z: number,
    height: number,
    hydrology: HydrologySample,
    pathDistances: THREE.Vector2,
    target: WorldEcologySample,
  ): WorldEcologySample {
    return this.resolveEcologyFromLandform(
      x,
      z,
      height,
      this.sampleLandform(x, z, this.landformScratch),
      hydrology,
      pathDistances,
      target,
    );
  }

  /**
   * Ecology from a landform sample the caller already holds. Stone clustering
   * reuses its macro landform read rather than sampling the lattice twice.
   *
   * Still takes the position it is not otherwise using: canopy shade is the one
   * cause that cannot be reconstructed from the ground at a point, because it
   * comes from something standing somewhere else.
   */
  resolveEcologyFromLandform(
    x: number,
    z: number,
    height: number,
    landform: TerrainLandform,
    hydrology: HydrologySample,
    pathDistances: THREE.Vector2,
    target: WorldEcologySample,
  ): WorldEcologySample {
    // Resolved before anything else is read. This call re-enters the field to
    // decide where crowns stand, and although that inner path is scratch-
    // isolated by construction, the caller's `landform` is very often this
    // field's own scratch — so the re-entrant work is kept strictly outside the
    // window in which it is live.
    const shade = this.canopyShade.sample(x, z);
    return this.ecology.sample(
      height,
      landform,
      hydrology,
      this.resolvePathGrassMask(pathDistances, height, 0, x, z),
      shade,
      target,
    );
  }

  /** Ecology for callers without those inputs: probes, maps, and tools. */
  sampleEcologyAt(x: number, z: number, height: number): WorldEcologySample {
    // Shade first, for the reason given on resolveEcologyFromLandform: the
    // re-entrant crown query is finished before this call's own scratches
    // become live.
    const shade = this.canopyShade.sample(x, z);
    return this.ecology.sample(
      height,
      this.sampleLandform(x, z, this.landformScratch),
      this.hydrology.sample(x, z, height, this.hydrologyScratch),
      this.samplePathGrassMask(x, z, height),
      shade,
      this.ecologyScratch,
    );
  }

  /**
   * Ecology as if nothing stood over this point.
   *
   * The entry point for deciding what *becomes* a crown. A tree cannot consult
   * the shade it has not cast yet, and asking it to would close a loop: shade
   * comes from crowns, crowns are placed by ecology, ecology reads shade. Trees
   * establish in the open and the shade follows, which is both the way out of
   * the recursion and the way it actually happens.
   *
   * Every sample it touches is its own, so the query is safe to run inside a
   * shaded one — which is exactly where it runs.
   */
  sampleOpenGroundEcologyAt(
    x: number,
    z: number,
    height: number,
  ): WorldEcologySample {
    return this.ecology.sample(
      height,
      this.sampleLandform(x, z, this.openLandformScratch),
      this.hydrology.sample(x, z, height, this.openHydrologyScratch),
      this.samplePathGrassMask(x, z, height),
      0,
      this.openEcologyScratch,
    );
  }

  private samplePathValues(x: number, z: number): void {
    const seed = this.config.seed;
    this.valueNoisePair(
      x * PATH_WARP_SCALE,
      z * PATH_WARP_SCALE,
      seed + 821,
      seed + 823,
    );
    const warpedX = x + (this.noisePairLow - 0.5) * PATH_WANDER;
    const warpedZ = z + (this.noisePairHigh - 0.5) * PATH_WANDER;
    this.pathValueMain =
      this.fbm(
        warpedX * this.pathScaleMain,
        warpedZ * this.pathScaleMain,
        2,
        seed + 827,
      ) - 0.5;
    this.pathValueBranch =
      this.fbm(
        warpedX * this.pathScaleBranch,
        warpedZ * this.pathScaleBranch,
        2,
        seed + 929,
      ) - 0.5;
  }

  private pathDistance(
    value: number,
    deltaEast: number,
    deltaNorth: number,
  ): number {
    const gradient = Math.hypot(deltaEast, deltaNorth) / PATH_GRADIENT_STEP;
    const distance = Math.abs(value) / Math.max(gradient, PATH_MIN_GRADIENT);
    return (
      (value >= 0 ? 1 : -1) * Math.min(PATH_MAX_DISTANCE, distance)
    );
  }

  private fbm(
    x: number,
    z: number,
    octaves: number,
    seed: number,
  ): number {
    let amplitude = 0.5;
    let frequency = 1;
    let value = 0;
    let normalization = 0;

    for (let octave = 0; octave < octaves; octave += 1) {
      value +=
        this.valueNoise(x * frequency, z * frequency, seed + octave * 1013) *
        amplitude;
      normalization += amplitude;
      amplitude *= 0.5;
      frequency *= 2.03;
    }

    return value / normalization;
  }

  private valueNoisePair(
    x: number,
    z: number,
    seedLow: number,
    seedHigh: number,
  ): void {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const x1 = x0 + 1;
    const z1 = z0 + 1;
    const tx = x - x0;
    const tz = z - z0;
    const sx = tx * tx * (3 - 2 * tx);
    const sz = tz * tz * (3 - 2 * tz);

    const lowA = this.hash(x0, z0, seedLow);
    const lowB = this.hash(x1, z0, seedLow);
    const lowC = this.hash(x0, z1, seedLow);
    const lowD = this.hash(x1, z1, seedLow);
    const lowLower = lowA + (lowB - lowA) * sx;
    const lowUpper = lowC + (lowD - lowC) * sx;
    this.noisePairLow = lowLower + (lowUpper - lowLower) * sz;

    const highA = this.hash(x0, z0, seedHigh);
    const highB = this.hash(x1, z0, seedHigh);
    const highC = this.hash(x0, z1, seedHigh);
    const highD = this.hash(x1, z1, seedHigh);
    const highLower = highA + (highB - highA) * sx;
    const highUpper = highC + (highD - highC) * sx;
    this.noisePairHigh = highLower + (highUpper - highLower) * sz;
  }

  private valueNoise(x: number, z: number, seed: number): number {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const tx = x - x0;
    const tz = z - z0;
    const sx = tx * tx * (3 - 2 * tx);
    const sz = tz * tz * (3 - 2 * tz);
    const a = this.hash(x0, z0, seed);
    const b = this.hash(x0 + 1, z0, seed);
    const c = this.hash(x0, z0 + 1, seed);
    const d = this.hash(x0 + 1, z0 + 1, seed);
    const lower = a + (b - a) * sx;
    const upper = c + (d - c) * sx;
    return lower + (upper - lower) * sz;
  }

  private hash(x: number, z: number, seed: number): number {
    let value = Math.imul(x, 374761393) + Math.imul(z, 668265263) + seed;
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
  }
}