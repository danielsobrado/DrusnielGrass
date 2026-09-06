import type { WorldConfig } from "../WorldConfig";
import { createLakeSample, LakeField } from "./LakeField";
import { createRiverSample, RiverField } from "./RiverField";
import { createWaterfallSample, WaterfallField } from "./WaterfallField";
import { resolveRiverFallStep, resolveRiverSurface } from "./RiverLongProfile";
import { collectCascadeSites, type CascadeSite } from "./WaterCascadeSites";
import { resolveGrassWaterMask } from "./HydrologyCoverage";

export type { CascadeSite };

const SAMPLE_HEIGHT_EPSILON = 1e-9;
/** Metres of bed above the water line over which coverage gives out. */
const EMERGENT_GROUND_START = 0.02;
const EMERGENT_GROUND_END = 0.45;
/** Metres of knickpoint step over which the emergence rule fades in. */
const EMERGENT_FALL_GATE = 0.6;
const SOURCE_HEIGHT_CACHE_SIZE = 8;

interface SourceHeightSample {
  x: number;
  z: number;
  carvedHeight: number;
  sourceHeight: number;
}

export interface HydrologySample {
  waterCoverage: number;
  waterProximity: number;
  humidityBoost: number;
  grassMask: number;
  waterLevel: number;
  riverCoverage: number;
  lakeCoverage: number;
  flowX: number;
  flowZ: number;
  riverMorphology: number;
  riverBend: number;
  riverLateral: number;
  /**
   * Position inside the lake's lobed shoreline: 0 at the centre, 1 on the
   * waterline. `LakeField` has always known it — it is what shapes the basin —
   * but until it reached the surface every part of a lake had to look alike.
   * Outside any lake it reads 1, so a river vertex is treated as "at the edge"
   * and never picks up open-water behaviour.
   */
  lakeNormalizedDistance: number;
  /**
   * How much water this river corridor carries: 0 for the smallest stream, 1
   * for a major river. Resolved once per lane, so it is stable along a whole
   * corridor, and it is the one signal width, depth, bank width, bed
   * composition and surface velocity all derive from.
   */
  riverDischarge: number;
  /** Metres the channel floor has dropped here because of a knickpoint. */
  riverFallStep: number;
  /**
   * 1 on the near-vertical face of a fall. The water sheet is a heightfield and
   * cannot represent that face at any LOD, so it stands aside there and the
   * cascade geometry draws the falling water instead.
   */
  riverFallFace: number;
  /** This fall's full drop, for sizing the cascade and its impact zone. */
  riverFallDrop: number;
}

export function createHydrologySample(): HydrologySample {
  return {
    waterCoverage: 0,
    waterProximity: 0,
    humidityBoost: 0,
    grassMask: 1,
    waterLevel: 0,
    riverCoverage: 0,
    lakeCoverage: 0,
    flowX: 0,
    flowZ: 0,
    riverMorphology: 0,
    riverBend: 0,
    riverLateral: 0,
    lakeNormalizedDistance: 1,
    riverDischarge: 0,
    riverFallStep: 0,
    riverFallFace: 0,
    riverFallDrop: 0,
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function smoothstep(value: number, minimum: number, maximum: number): number {
  if (value <= minimum) return 0;
  if (value >= maximum) return 1;
  const amount = (value - minimum) / (maximum - minimum);
  return amount * amount * (3 - 2 * amount);
}

/** Coordinates terrain carving and the shared water/ecology semantics. */
export class HydrologyField {
  private readonly rivers: RiverField;
  private readonly lakes: LakeField;
  private readonly waterfalls: WaterfallField;
  private readonly river = createRiverSample();
  private readonly lake = createLakeSample();
  private readonly waterfall = createWaterfallSample();
  private readonly sourceHeightCache: SourceHeightSample[] = Array.from(
    { length: SOURCE_HEIGHT_CACHE_SIZE },
    () => ({
      x: Number.NaN,
      z: Number.NaN,
      carvedHeight: Number.NaN,
      sourceHeight: Number.NaN,
    }),
  );
  private sourceHeightCursor = 0;
  private carvedSampleX = Number.NaN;
  private carvedSampleZ = Number.NaN;
  private carvedSampleHeight = Number.NaN;
  private readonly grassWaterClearanceRatio: number;

  /**
   * `sampleRawHeight` is the terrain before carving. Hydrology needs it to read
   * the elevation of a river's own centreline; passing it as a function rather
   * than taking the terrain field keeps this module independent of rendering
   * and free of the carve that would otherwise recurse.
   */
  constructor(
    private readonly config: WorldConfig,
    private readonly sampleRawHeight: (x: number, z: number) => number,
  ) {
    this.rivers = new RiverField(config);
    this.lakes = new LakeField(config);
    this.waterfalls = new WaterfallField(config);
    this.grassWaterClearanceRatio = (config.chunkSize * Math.SQRT2) /
      ((config.terrainNearResolution - 1) * config.waterHumidityRadius);
  }

  carveHeight(x: number, z: number, height: number): number {
    if (this.config.waterEnabled < 1) return height;

    this.sampleStructure(x, z, height);
    let carved = height - this.river.incisionDepth - this.fallStepAt(x, z);

    if (this.lake.basin > 0) {
      const core = 1 - clamp01(this.lake.normalizedDistance);
      const bedTarget =
        this.lake.waterLevel -
        this.config.lakeDepth * (0.72 + core * 0.28);
      carved = lerp(carved, Math.min(carved, bedTarget), this.lake.basin);
    }

    this.cacheSourceHeight(x, z, carved, height);
    this.carvedSampleX = x;
    this.carvedSampleZ = z;
    this.carvedSampleHeight = carved;
    return carved;
  }

  sample(
    x: number,
    z: number,
    carvedHeight: number,
    target: HydrologySample,
  ): HydrologySample {
    if (this.config.waterEnabled < 1) {
      return this.clear(carvedHeight, target);
    }

    if (
      x !== this.carvedSampleX ||
      z !== this.carvedSampleZ ||
      Math.abs(carvedHeight - this.carvedSampleHeight) > SAMPLE_HEIGHT_EPSILON
    ) {
      const sourceHeight =
        this.resolveSourceHeight(x, z, carvedHeight) ?? this.sampleRawHeight(x, z);
      this.sampleStructure(x, z, sourceHeight);
      this.carvedSampleX = x;
      this.carvedSampleZ = z;
      this.carvedSampleHeight = carvedHeight;
    }

    const waterCoverage = Math.max(this.river.coverage, this.lake.coverage);
    const waterProximity = Math.max(this.river.proximity, this.lake.proximity);
    const lakeSurfaceActive = this.lake.basin > 0.001;

    /**
     * Ground standing above the settled surface is not covered by water,
     * however close to the channel it is. Without this the sheet climbed the
     * walls of a knickpoint gorge, because the surface is clamped to the bed
     * and the bed there stands metres above the river.
     *
     * Scoped to knickpoint corridors. Applying it everywhere also collapses a
     * river that the altitude fade has left barely incised, which is a real
     * effect but not one this pass set out to change.
     */
    // Settled before anything reads it: emergence is measured against this
    // level, and taking it from `target` first would have made the result
    // depend on whatever sample used the buffer last.
    const waterLevel =
      (lakeSurfaceActive
        ? this.lake.waterLevel
        : resolveRiverSurface(
            this.waterfalls,
            this.river,
            this.waterfall,
            this.sampleRawHeight,
            x,
            carvedHeight,
          )) +
      this.config.waterSurfaceOffset;
    const fallStep = this.fallStepAt(x, z);
    const emergedGate = Math.min(1, fallStep / EMERGENT_FALL_GATE);
    const emerged =
      emergedGate *
      smoothstep(
        carvedHeight - waterLevel,
        EMERGENT_GROUND_START,
        EMERGENT_GROUND_END,
      );
    target.waterCoverage = clamp01(waterCoverage * (1 - emerged));
    target.waterProximity = clamp01(waterProximity);
    target.humidityBoost = clamp01(waterProximity * 0.68);
    target.grassMask = resolveGrassWaterMask(target.waterCoverage, target.waterProximity, this.grassWaterClearanceRatio);
    target.waterLevel = waterLevel;
    // Both components fade with the same emergence, or the packed flow vector
    // outruns the coverage it is scaled by.
    target.riverCoverage = clamp01(this.river.coverage * (1 - emerged));
    target.lakeCoverage = clamp01(this.lake.coverage * (1 - emerged));
    target.flowX = this.river.flowX;
    target.flowZ = this.river.flowZ;
    target.riverMorphology = this.river.morphology;
    target.riverBend = this.river.bend;
    target.riverLateral = this.river.lateral;
    // Infinity outside every basin, which clamps to the shoreline value.
    target.lakeNormalizedDistance = clamp01(this.lake.normalizedDistance);
    target.riverDischarge = clamp01(this.river.discharge);
    target.riverFallStep = fallStep;
    target.riverFallFace = fallStep > 0 ? clamp01(this.waterfall.face) : 0;
    target.riverFallDrop = fallStep > 0 ? this.waterfall.drop : 0;
    return target;
  }

  /** Knickpoints ready to be turned into cascade curtains, for the mesh builder. */
  forEachCascade(
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
    visit: (site: CascadeSite) => void,
  ): void {
    if (this.config.waterEnabled < 1) return;
    collectCascadeSites(
      this.rivers,
      this.waterfalls,
      this.config,
      this.sampleRawHeight,
      { minX, maxX, minZ, maxZ },
      visit,
    );
  }

  private fallStepAt(x: number, z: number): number {
    if (this.config.waterfallEnabled < 1) return 0;
    return resolveRiverFallStep(
      this.waterfalls,
      this.river,
      this.waterfall,
      x,
      z,
    );
  }

  private cacheSourceHeight(
    x: number,
    z: number,
    carvedHeight: number,
    sourceHeight: number,
  ): void {
    const entry = this.sourceHeightCache[this.sourceHeightCursor];
    entry.x = x;
    entry.z = z;
    entry.carvedHeight = carvedHeight;
    entry.sourceHeight = sourceHeight;
    this.sourceHeightCursor =
      (this.sourceHeightCursor + 1) % this.sourceHeightCache.length;
  }

  private resolveSourceHeight(
    x: number,
    z: number,
    carvedHeight: number,
  ): number | undefined {
    for (const entry of this.sourceHeightCache) {
      if (
        entry.x === x &&
        entry.z === z &&
        Math.abs(entry.carvedHeight - carvedHeight) <= SAMPLE_HEIGHT_EPSILON
      ) {
        return entry.sourceHeight;
      }
    }
    return undefined;
  }

  private sampleStructure(x: number, z: number, height: number): void {
    this.rivers.sample(x, z, height, this.river);
    this.lakes.sample(x, z, height, this.lake);
  }

  private clear(height: number, target: HydrologySample): HydrologySample {
    target.waterCoverage = 0;
    target.waterProximity = 0;
    target.humidityBoost = 0;
    target.grassMask = 1;
    target.waterLevel = height;
    target.riverCoverage = 0;
    target.lakeCoverage = 0;
    target.flowX = 0;
    target.flowZ = 0;
    target.riverMorphology = 0;
    target.riverBend = 0;
    target.riverLateral = 0;
    target.lakeNormalizedDistance = 1;
    target.riverDischarge = 0;
    target.riverFallStep = 0;
    target.riverFallFace = 0;
    target.riverFallDrop = 0;
    return target;
  }
}