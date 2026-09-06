import * as THREE from "three";
import { PATH_GRASS_FEATHER } from "../TerrainField";
import type { WorldConfig } from "../WorldConfig";
import { resolveTerrainMacroFieldExtent } from "./TerrainMacroFieldTexture";
import type { GrassPlacementGrid } from "../grass/GrassClumpLattice";
import type { TerrainSurfacePalette } from "./TerrainSurfacePalette";
import surfaceArt from "./TerrainSurfacePalette.json";

export interface TerrainSurfaceUniformSources {
  config: WorldConfig;
  surfaceNoiseTexture: THREE.DataTexture;
  palette: TerrainSurfacePalette;
  /** The near-grass placement grid, shared so tufts and their contact agree. */
  basePlacementGrid: GrassPlacementGrid;
  /** Present only on compact, which reads the baked macro field. */
  macroFieldTexture?: THREE.DataTexture;
}

/**
 * Every value the terrain surface shader reads, in one table.
 *
 * Extracted from TerrainMaterialController so the controller stays a lifecycle
 * object -- construct, configure, dispose -- rather than a lifecycle object with
 * a hundred and thirty lines of art direction wedged into its constructor. The
 * split is also the one the architecture gate asks for: rendering concerns live
 * in the material and shader modules, not in the streamer that owns them.
 */
export function createTerrainSurfaceUniforms({
  config,
  surfaceNoiseTexture,
  palette,
  basePlacementGrid,
  macroFieldTexture,
}: TerrainSurfaceUniformSources): Record<string, THREE.IUniform> {
  return {
    uTerrainSurfaceNoise: { value: surfaceNoiseTexture },
    uTerrainNoiseWorldSize: { value: config.terrainGroundNoiseWorldSize },
    uTerrainMesoStrength: { value: config.terrainGroundMesoStrength },
    uTerrainMicroStrength: { value: config.terrainGroundMicroStrength },
    uTerrainNormalStrength: { value: config.terrainGroundNormalStrength },
    uTerrainCanopyDarkening: {
      value: config.terrainGroundCanopyDarkening,
    },
    uTerrainGrassTintStrength: { value: 0.5 },
    /**
     * The ground's own distance schedules.
     *
     * These used to be one vec4 filled from the grass preset's near and mid
     * distances, so the ground's micro grain, its meso mottling and its
     * canopy merge all changed across the same radii the vegetation handed
     * off at. That is what made the hillside band. They are independent
     * config now, and `setGrassArtDirection` no longer touches them.
     */
    uTerrainMicroRange: {
      value: new THREE.Vector2(
        config.terrainMicroDetailStart,
        config.terrainMicroDetailEnd,
      ),
    },
    uTerrainMesoRange: {
      value: new THREE.Vector2(
        config.terrainMesoDetailStart,
        config.terrainMesoDetailEnd,
      ),
    },
    uTerrainCanopyMergeRange: {
      value: new THREE.Vector2(
        config.terrainCanopyMergeStart,
        config.terrainCanopyMergeEnd,
      ),
    },
    uTerrainCanopyMergeStrength: {
      value: config.terrainCanopyMergeStrength,
    },
    uTerrainBandJitterRatio: { value: config.lodBandJitterRatio },
    uTerrainCommunityTintStrength: {
      value: config.terrainCommunityTintStrength,
    },
    /**
     * Damp organic ground under a closed leaf layer. Darker and cooler than
     * any soil tone, because it is not soil: it is accumulated leaf litter
     * and moss, and it has to be a different material from both the earth
     * beside it and the canopy above it or the broadleaf community reads as
     * more of the same green.
     */
    uTerrainMoss: { value: new THREE.Color(surfaceArt.moss) },
    /**
     * The third soil tone. Grey-brown rather than warm, because two tones
     * mixed on one axis can only ever be one hue at two brightnesses --
     * which is what let the ground read as a single mustard fill wherever
     * the grass opened up.
     */
    uTerrainSoilGrey: { value: new THREE.Color(surfaceArt.soilNormal) },
    uTerrainSoilHuePeriod: { value: config.terrainSoilHueWorldSize },
    uTerrainSoilHueSeed: { value: (config.seed ^ 0x5a_3d_11_07) >>> 0 },
    uTerrainSoilHueStrength: { value: config.terrainSoilHueStrength },
    uTerrainFleckStrength: { value: config.terrainGroundFleckStrength },
    /** Metres per cell of the soil mottle: the 2-5 m band nothing occupied. */
    uTerrainFleckPeriod: { value: 3.4 },
    uTerrainFleckSeed: { value: (config.seed ^ 0x6c_18_3b_a9) >>> 0 },
    uTerrainHollowDarkening: { value: config.terrainHollowDarkening },
    uTerrainHollowMoisture: { value: config.terrainHollowMoisture },
    uTerrainMossStrength: { value: config.terrainMossStrength },
    /**
     * Exact base near-grass clump span. Placement and terrain use the same
     * requested-count/grid resolver, including compact density and the
     * slightly different X/Z dimensions caused by rows versus columns.
     */
    uTerrainClumpSpan: {
      value: new THREE.Vector2(
        basePlacementGrid.clumpSpanX,
        basePlacementGrid.clumpSpanZ,
      ),
    },
    uTerrainClumpAo: { value: config.terrainClumpContactAo },
    uTerrainClumpLitter: { value: config.terrainClumpLitterStrength },
    uTerrainClumpSeed: { value: config.seed >>> 0 },
    uTerrainMacroField: { value: macroFieldTexture ?? null },
    uTerrainMacroFieldExtent: {
      value: new THREE.Vector2(
        resolveTerrainMacroFieldExtent(config.worldSize),
        resolveTerrainMacroFieldExtent(config.worldSize),
      ),
    },
    uTerrainPathHalfWidth: {
      value: new THREE.Vector2(
        config.pathWidth * 0.5,
        config.pathBranchWidth * 0.5,
      ),
    },
    uTerrainPathEdge: { value: config.pathEdgeRoughness },
    uTerrainPathClearance: { value: config.pathGrassClearance },
    uTerrainPathGrassFeather: { value: PATH_GRASS_FEATHER },
    uTerrainPathGrassEdge: { value: config.pathGrassEdgeRoughness },
    uTerrainVergeFleckStrength: {
      value: config.terrainVergeFleckStrength,
    },
    uTerrainPathCoreDarkening: { value: config.terrainPathCoreDarkening },
    uTerrainPathVergeDryness: { value: config.terrainPathVergeDryness },
    uTerrainWetSheenStrength: { value: 0.55 },
    uTerrainWetSheenPower: { value: 42 },
    uTerrainSoilRich: { value: new THREE.Color(surfaceArt.soilRich) },
    uTerrainSoilDry: { value: new THREE.Color(surfaceArt.soilDry) },
    uTerrainPathSoil: { value: new THREE.Color(surfaceArt.pathSoil) },
    uTerrainPathDust: { value: new THREE.Color(surfaceArt.pathDust) },
    uTerrainPathGrit: { value: new THREE.Color(surfaceArt.pathGrit) },
    /**
     * Ground worked over by a stone sitting in it. Darker and less red than
     * uTerrainSoilRich because it is soil in permanent shade holding
     * moisture, not open topsoil; the dry side of the mix in the shader
     * borrows uTerrainPathGrit for the mineral fines instead.
     */
    uTerrainStoneContactSoil: {
      value: new THREE.Color(surfaceArt.stoneContactSoil),
    },
    uTerrainStoneContactReach: { value: 1.35 },
    uTerrainStoneContactDarkening: { value: 0.34 },
    uTerrainStoneOcclusionStrength: { value: 0.4 },
    /**
     * Cliff rock. Two tones close together on purpose: a wide span between
     * a near-black and a pale grey turns every wisp of the continuous noise
     * into a marble vein, which is exactly how the first pass at this read.
     * Lithology supplies the variation now, and it needs far less range.
     */
    uTerrainRockBase: { value: new THREE.Color(surfaceArt.rockBase) },
    uTerrainRockWarm: { value: new THREE.Color(surfaceArt.rockWarm) },
    uTerrainRockReliefStrength: { value: 0.85 },
    uTerrainBiomeBase: { value: palette.base },
    uTerrainBiomeTip: { value: palette.tip },
    uTerrainBiomeDry: { value: palette.dry },
    uTerrainBiomeShade: { value: palette.shade },
  };
}
