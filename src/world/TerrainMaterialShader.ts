import { GRASS_MAX_BIOMES } from "../grass/biome/GrassBiomeProfile";
import {
  PATH_EDGE_PERIOD,
  PATH_EDGE_SEED,
} from "../grass/GrassFieldVariation";
import { GRASS_CLUMP_LATTICE_GLSL } from "./grass/GrassClumpLattice";
import { TERRAIN_ROCK_FUNCTIONS } from "./terrain/TerrainRockShader";
import {
  TERRAIN_MACRO_FIELD_APPLY,
  TERRAIN_MACRO_FIELD_FUNCTIONS,
} from "./terrain/TerrainMacroFieldShader";
import {
  TERRAIN_DRY_FIBRE_PULSE_MEAN,
  TERRAIN_GRIT_PULSE_MEAN,
  TERRAIN_SURFACE_NOISE_SIZE,
} from "./terrain/TerrainSurfaceNoiseTexture";

export const TERRAIN_DETAIL_VERTEX = `
#define TERRAIN_MAX_BIOMES ${GRASS_MAX_BIOMES}
// .xy are the signed distances to the two path fields, .z is path visibility,
// and .w is landform convexity remapped to [0, 1] -- the fragment stage has
// slope from its own derivatives but no curvature, and slope cannot tell a
// hollow from a bank.
attribute vec4 terrainPath;
attribute vec4 terrainEcology;
attribute vec4 terrainEnvironment;
// .xyz is the biome pair and its blend; .w is the macro dryness this vertex was
// sampled with, which the fragment stage subtracts before re-adding its own.
attribute vec4 terrainBiome;
// Community index and how strongly it expresses itself. Carried per vertex
// because a 26 m field resolves at the far ring's 10.67 m spacing; the 19 m
// vigour field does not, which is why that one is evaluated per fragment.
attribute vec4 terrainCommunityGround;
attribute vec4 terrainStoneInfluence;
attribute vec2 terrainStoneOcclusionCenter;
attribute float terrainStoneOcclusion;
uniform vec3 uTerrainBiomeBase[TERRAIN_MAX_BIOMES];
uniform vec3 uTerrainBiomeTip[TERRAIN_MAX_BIOMES];
uniform vec3 uTerrainBiomeDry[TERRAIN_MAX_BIOMES];
uniform vec2 uTerrainBiomeShade[TERRAIN_MAX_BIOMES];
varying vec3 vTerrainWorldPosition;
varying vec4 vTerrainPath;
varying vec4 vTerrainEcology;
varying vec4 vTerrainEnvironment;
varying vec4 vTerrainBiomeBase;
varying vec3 vTerrainBiomeDry;
varying vec3 vTerrainBiomeCanopy;
varying vec4 vTerrainStoneInfluence;
varying vec2 vTerrainStoneOcclusionCenter;
varying float vTerrainStoneOcclusion;
varying float vTerrainMacroDryness;
varying vec4 vTerrainCommunityGround;

int terrainResolveBiomeRow(float biome) {
  return int(clamp(biome, 0.0, float(TERRAIN_MAX_BIOMES - 1)) + 0.5);
}
`;

export const TERRAIN_DETAIL_POSITION = `
vTerrainWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
vTerrainPath = terrainPath;
vTerrainEcology = terrainEcology;
vTerrainEnvironment = terrainEnvironment;
vTerrainStoneInfluence = terrainStoneInfluence;
vTerrainStoneOcclusionCenter = terrainStoneOcclusionCenter;
vTerrainStoneOcclusion = terrainStoneOcclusion;
vTerrainMacroDryness = terrainBiome.w;
vTerrainCommunityGround = terrainCommunityGround;
int terrainBiomeA = terrainResolveBiomeRow(terrainBiome.x);
int terrainBiomeB = terrainResolveBiomeRow(terrainBiome.y);
float terrainBiomeBlend = saturate(terrainBiome.z);
vec3 terrainBiomeBase = mix(
  uTerrainBiomeBase[terrainBiomeA],
  uTerrainBiomeBase[terrainBiomeB],
  terrainBiomeBlend
);
vec3 terrainBiomeTip = mix(
  uTerrainBiomeTip[terrainBiomeA],
  uTerrainBiomeTip[terrainBiomeB],
  terrainBiomeBlend
);
vTerrainBiomeDry = mix(
  uTerrainBiomeDry[terrainBiomeA],
  uTerrainBiomeDry[terrainBiomeB],
  terrainBiomeBlend
);
vec2 terrainBiomeShade = mix(
  uTerrainBiomeShade[terrainBiomeA],
  uTerrainBiomeShade[terrainBiomeB],
  terrainBiomeBlend
);
vTerrainBiomeBase = vec4(
  terrainBiomeBase,
  mix(0.92, 0.78, saturate(terrainBiomeShade.x))
);
vTerrainBiomeCanopy = mix(
  terrainBiomeBase,
  terrainBiomeTip,
  saturate(terrainBiomeShade.y) * 0.42
);
`;

export const TERRAIN_DETAIL_FRAGMENT = `
uniform sampler2D uTerrainSurfaceNoise;
uniform float uTerrainNoiseWorldSize;
uniform float uTerrainMesoStrength;
uniform float uTerrainMicroStrength;
uniform float uTerrainNormalStrength;
uniform float uTerrainCanopyDarkening;
uniform float uTerrainGrassTintStrength;
uniform vec2 uTerrainMicroRange;
uniform vec2 uTerrainMesoRange;
uniform vec2 uTerrainCanopyMergeRange;
uniform float uTerrainCanopyMergeStrength;
uniform float uTerrainBandJitterRatio;
uniform float uTerrainCommunityTintStrength;
uniform vec3 uTerrainMoss;
uniform vec3 uTerrainSoilGrey;
uniform float uTerrainSoilHuePeriod;
uniform uint uTerrainSoilHueSeed;
uniform float uTerrainSoilHueStrength;
uniform float uTerrainFleckStrength;
uniform float uTerrainFleckPeriod;
uniform uint uTerrainFleckSeed;
uniform float uTerrainHollowDarkening;
uniform float uTerrainHollowMoisture;
uniform float uTerrainMossStrength;
uniform vec2 uTerrainClumpSpan;
uniform float uTerrainClumpAo;
uniform float uTerrainClumpLitter;
uniform uint uTerrainClumpSeed;
uniform vec2 uTerrainPathHalfWidth;
uniform float uTerrainPathEdge;
uniform float uTerrainPathClearance;
uniform float uTerrainPathGrassFeather;
uniform float uTerrainPathGrassEdge;
uniform float uTerrainVergeFleckStrength;
uniform float uTerrainPathCoreDarkening;
uniform float uTerrainPathVergeDryness;
uniform float uTerrainWetSheenStrength;
uniform float uTerrainWetSheenPower;
uniform vec3 uTerrainSoilRich;
uniform vec3 uTerrainSoilDry;
uniform vec3 uTerrainPathSoil;
uniform vec3 uTerrainPathDust;
uniform vec3 uTerrainPathGrit;
uniform vec3 uTerrainStoneContactSoil;
uniform float uTerrainStoneContactReach;
uniform float uTerrainStoneContactDarkening;
uniform float uTerrainStoneOcclusionStrength;
varying vec3 vTerrainWorldPosition;
varying vec4 vTerrainPath;
varying vec4 vTerrainEcology;
varying vec4 vTerrainEnvironment;
varying vec4 vTerrainBiomeBase;
varying vec3 vTerrainBiomeDry;
varying vec3 vTerrainBiomeCanopy;
varying vec4 vTerrainStoneInfluence;
varying vec2 vTerrainStoneOcclusionCenter;
varying float vTerrainStoneOcclusion;
varying float vTerrainMacroDryness;
varying vec4 vTerrainCommunityGround;
${TERRAIN_ROCK_FUNCTIONS}
${TERRAIN_MACRO_FIELD_FUNCTIONS}
${GRASS_CLUMP_LATTICE_GLSL}
`;

export const TERRAIN_DETAIL_COLOR = `
float terrainDistance = distance(cameraPosition, vTerrainWorldPosition);

/**
 * Slope, from the geometry itself.
 *
 * The terrain attributes carry altitude, humidity, water proximity and stone
 * clearance, but never slope — so nothing here could tell a meadow from a cliff,
 * and the palette had no rock in it at all. The derivatives of the interpolated
 * world position give the true face normal for a couple of instructions, which
 * is cheaper than carrying another vertex stream and cannot fall out of step
 * with the surface actually being shaded.
 *
 * Taken at the top of the function on purpose: derivatives must not sit inside
 * non-uniform control flow.
 */
vec3 terrainFaceNormal = cross(
  dFdx(vTerrainWorldPosition),
  dFdy(vTerrainWorldPosition)
);
float terrainFaceLength = length(terrainFaceNormal);
terrainFaceNormal = terrainFaceLength > 1e-8
  ? terrainFaceNormal / terrainFaceLength
  : vec3(0.0, 1.0, 0.0);
if (terrainFaceNormal.y < 0.0) terrainFaceNormal = -terrainFaceNormal;
float terrainSlope = 1.0 - saturate(terrainFaceNormal.y);
float terrainCliff = smoothstep(0.38, 0.66, terrainSlope);

/**
 * Wall-aligned coordinates, resolved here rather than beside the rock below.
 * The rock samples sit inside a branch, and a texture lookup with an implicit
 * level of detail is undefined inside non-uniform control flow — which is why
 * the layers above already use textureGrad. The gradients have to be taken out
 * here where the branch cannot affect them.
 */
vec2 terrainWallTangent = normalize(
  vec2(-terrainFaceNormal.z, terrainFaceNormal.x) + vec2(1e-5)
);
vec2 terrainWallUv = vec2(
  dot(vTerrainWorldPosition.xz, terrainWallTangent),
  vTerrainWorldPosition.y
) * 0.037;
vec2 terrainWallDdx = dFdx(terrainWallUv);
vec2 terrainWallDdy = dFdy(terrainWallUv);
/**
 * The ground's three distance schedules.
 *
 * All three used to run on a single vec4 borrowed from the grass preset's own
 * near and mid distances: micro over 6->7 m, and meso *and* the canopy merge
 * over the same 28->54 m the near-to-mid handoff, the mid density falloff and
 * the detail-foliage fade were already using. Six soft fades sharing two edges
 * is what read as one hard ring crossing the hillside. Each owns its range now.
 *
 * One shared wander sample, three amplitudes. Three decorrelated fields would
 * let the weights disagree at a point and mottle ground that should be smooth;
 * what has to differ is *where* each boundary sits, and the differing widths
 * already deliver that.
 */
float terrainBandOffset = grassLodBandOffset(vTerrainWorldPosition.xz);
float terrainMicroWeight = 1.0 - smoothstep(
  uTerrainMicroRange.x,
  uTerrainMicroRange.y,
  terrainDistance +
    grassLodBandJitterMetres(
      uTerrainMicroRange.x,
      uTerrainMicroRange.y,
      uTerrainBandJitterRatio
    ) * terrainBandOffset
);
float terrainMesoWeight = 1.0 - smoothstep(
  uTerrainMesoRange.x,
  uTerrainMesoRange.y,
  terrainDistance +
    grassLodBandJitterMetres(
      uTerrainMesoRange.x,
      uTerrainMesoRange.y,
      uTerrainBandJitterRatio
    ) * terrainBandOffset
);
float terrainFarMerge = smoothstep(
  uTerrainCanopyMergeRange.x,
  uTerrainCanopyMergeRange.y,
  terrainDistance +
    grassLodBandJitterMetres(
      uTerrainCanopyMergeRange.x,
      uTerrainCanopyMergeRange.y,
      uTerrainBandJitterRatio
    ) * terrainBandOffset
);

vec2 terrainBaseUv = vTerrainWorldPosition.xz / uTerrainNoiseWorldSize;
vec2 terrainBaseDdx = dFdx(terrainBaseUv);
vec2 terrainBaseDdy = dFdy(terrainBaseUv);
vec4 terrainBaseNoise = textureGrad(
  uTerrainSurfaceNoise,
  terrainBaseUv,
  terrainBaseDdx,
  terrainBaseDdy
);
vec4 terrainMesoNoise = vec4(0.5);
if (terrainMesoWeight > 0.001) {
  mat2 terrainMesoRotation = mat2(0.8, 0.6, -0.6, 0.8);
  vec2 terrainMesoUv = terrainMesoRotation * terrainBaseUv * 2.17 +
    vec2(0.317, 0.619);
  terrainMesoNoise = textureGrad(
    uTerrainSurfaceNoise,
    terrainMesoUv,
    terrainMesoRotation * terrainBaseDdx * 2.17,
    terrainMesoRotation * terrainBaseDdy * 2.17
  );
}

vec4 terrainMicroNoise = vec4(0.5);
if (terrainMicroWeight > 0.001) {
  mat2 terrainMicroRotation = mat2(0.94, -0.342, 0.342, 0.94);
  vec2 terrainMicroUv = terrainMicroRotation * terrainBaseUv *
    vec2(8.6, 5.4) + vec2(0.731, 0.143);
  vec2 terrainMicroDdx = terrainMicroRotation * terrainBaseDdx *
    vec2(8.6, 5.4);
  vec2 terrainMicroDdy = terrainMicroRotation * terrainBaseDdy *
    vec2(8.6, 5.4);
  float terrainMicroFootprint = max(
    length(terrainMicroDdx * ${TERRAIN_SURFACE_NOISE_SIZE.toFixed(1)}),
    length(terrainMicroDdy * ${TERRAIN_SURFACE_NOISE_SIZE.toFixed(1)})
  );
  terrainMicroWeight *= 1.0 - smoothstep(0.7, 2.1, terrainMicroFootprint);
  terrainMicroNoise = textureGrad(
    uTerrainSurfaceNoise,
    terrainMicroUv,
    terrainMicroDdx,
    terrainMicroDdy
  );
}

/**
 * A 2-5 m mottle.
 *
 * The existing octaves sit at 64 m, 29.5 m and 7.4 m, so nothing occupied the
 * band a walking camera reads as soil texture -- the ground had structure you
 * could see from a hill and structure at your feet, with a gap exactly where a
 * standing player looks.
 *
 * Taken from the shared lattice noise rather than from the surface texture, and
 * that is a correctness requirement rather than a preference. This term is
 * weighted by the micro-detail fade, so its *mean* has to be zero or the ground
 * changes brightness as the fade closes -- the defect the fibre and grit pulses
 * were both fixed for. The texture cannot supply that: its broad channel is two
 * and five cells across the whole map, so its mean is decided by a handful of
 * hashes and measures anywhere from 0.407 to 0.684 depending on the seed. Two
 * octaves of lattice value noise average uniform hashes and are centred on 0.5
 * by construction, whatever the seed.
 */
float terrainFleck = grassPatchNoise(
  vTerrainWorldPosition.xz,
  uTerrainFleckPeriod,
  uTerrainFleckSeed
) - 0.5;

float terrainSuitability = saturate(vTerrainEcology.x);
float terrainVigor = saturate(vTerrainEcology.y);
float terrainDryness = saturate(vTerrainEcology.z);
float terrainBiomeDensity = saturate(vTerrainEcology.w);
float terrainAltitude = saturate(vTerrainEnvironment.x);
float terrainHumidity = saturate(vTerrainEnvironment.y);
float terrainWaterProximity = saturate(vTerrainEnvironment.z);
float terrainStoneClearance = saturate(vTerrainEnvironment.w);
float terrainRootScale = saturate(vTerrainBiomeBase.a);
${TERRAIN_MACRO_FIELD_APPLY}

/**
 * One roughness field for both path boundaries, shared with the CPU.
 *
 * This used to mix the 64 m and 29.5 m surface-noise channels — the wrong scale
 * for a boundary whose features are about a metre across, by more than an order
 * of magnitude — and worse, a field the blade layer could not sample. So the
 * painted dirt and the standing grass were roughened by different things and
 * could only agree on average. The shared 6 m field is what lets them agree
 * pixel by blade.
 */
float terrainEdgeNoise = grassPatchNoise(
  vTerrainWorldPosition.xz,
  ${PATH_EDGE_PERIOD.toFixed(1)},
  ${PATH_EDGE_SEED}u
) - 0.5;

// The vegetation boundary is roughened too, and more than the mineral one.
// Only the core used to be ragged, so a torn patch of earth sat inside a
// cleanly-offset green cut-out and the verge read as a stencil laid over the
// meadow. Trampling makes the plant edge the more irregular of the two.
vec2 terrainPathGrassHalfWidth = uTerrainPathHalfWidth + vec2(
  uTerrainPathEdge + uTerrainPathClearance
);
vec2 terrainPathGrassBands = smoothstep(
  terrainPathGrassHalfWidth,
  terrainPathGrassHalfWidth + vec2(uTerrainPathGrassFeather),
  abs(vTerrainPath.xy) + uTerrainPathGrassEdge * terrainEdgeNoise
);
float terrainPathVisibility = saturate(vTerrainPath.z);
float terrainPathGrassMask = mix(
  1.0,
  min(terrainPathGrassBands.x, terrainPathGrassBands.y),
  terrainPathVisibility
);
float terrainPathExposure = 1.0 - terrainPathGrassMask;

vec2 terrainCoreDistance = abs(vTerrainPath.xy) +
  uTerrainPathEdge * terrainEdgeNoise;
vec2 terrainCoreBands = vec2(1.0) - smoothstep(
  max(vec2(0.0), uTerrainPathHalfWidth - vec2(0.12)),
  uTerrainPathHalfWidth + vec2(0.28),
  terrainCoreDistance
);
float terrainPathCore = max(terrainCoreBands.x, terrainCoreBands.y) *
  terrainPathVisibility;
float terrainPathShoulder = max(0.0, terrainPathExposure - terrainPathCore);

terrainDryness = saturate(
  terrainDryness * (1.0 - terrainWaterProximity * 0.58) +
    terrainPathShoulder * uTerrainPathVergeDryness +
    smoothstep(0.72, 1.0, terrainAltitude) * 0.08
);
terrainHumidity = saturate(terrainHumidity - terrainPathExposure * 0.18);

// Curvature, which the fragment stage had no way to know.
//
// Slope comes free from the derivatives, but slope cannot tell a hollow from a
// bank: both are tilted. Depressions collect water, litter and shadow, and
// without them the ground has exactly one tone per ecology value -- which is
// what makes an open patch read as a flat fill however much noise is on it.
float terrainConcavity = saturate((0.5 - vTerrainPath.w) * 2.0);
terrainHumidity = saturate(
  terrainHumidity + terrainConcavity * uTerrainHollowMoisture
);

float terrainMacroVariation = (terrainBaseNoise.r - 0.5) * 0.16;
float terrainMesoVariation = (terrainMesoNoise.g - 0.5) *
  uTerrainMesoStrength * terrainMesoWeight;
/**
 * Soil colour, given causes of its own.
 *
 * This was a straight mix on humidity, and humidity is derived from grass
 * dryness -- so every term that greened the blades also warmed the earth under
 * them and the two could never separate. That coupling is most of why the base
 * terrain, the blades and the understory all sat in one hue.
 *
 * Real soil colour comes from parent material and drainage, neither of which
 * the vegetation decides. This field is independent of every ecology term on
 * purpose, and it is what lets open ground disagree with the grass standing
 * beside it.
 */
float terrainSoilHue = grassPatchNoise(
  vTerrainWorldPosition.xz,
  uTerrainSoilHuePeriod,
  uTerrainSoilHueSeed
);
float terrainParentRich = smoothstep(0.52, 0.84, terrainSoilHue) *
  (0.35 + terrainHumidity * 0.65);
float terrainParentDry = smoothstep(0.48, 0.82, 1.0 - terrainSoilHue) *
  (0.3 + terrainDryness * 0.7);
vec3 terrainSoilVariant = mix(
  uTerrainSoilGrey,
  uTerrainSoilRich,
  terrainParentRich
);
terrainSoilVariant = mix(
  terrainSoilVariant,
  uTerrainSoilDry,
  terrainParentDry
);
vec3 terrainSoil = mix(
  uTerrainSoilGrey,
  uTerrainSoilRich,
  terrainHumidity * 0.7
);
terrainSoil = mix(terrainSoil, uTerrainSoilDry, terrainDryness * 0.52);
terrainSoil = mix(terrainSoil, terrainSoilVariant, uTerrainSoilHueStrength);
terrainSoil *= mix(1.0, 0.62, terrainWaterProximity * 0.78);
terrainSoil *= 1.0 + terrainMacroVariation * 0.45 + terrainMesoVariation;

vec3 terrainUnderlayer = mix(
  vTerrainBiomeBase.rgb,
  vTerrainBiomeDry,
  terrainDryness * 0.9
);
terrainUnderlayer = mix(
  terrainUnderlayer,
  vTerrainBiomeBase.rgb * 0.72,
  terrainWaterProximity * 0.34
);
terrainUnderlayer *= terrainRootScale;
terrainUnderlayer *= 1.0 + terrainMacroVariation + terrainMesoVariation;
float terrainCoverage = smoothstep(0.08, 0.5, terrainSuitability) *
  terrainBiomeDensity * terrainPathGrassMask * terrainStoneClearance;
// terrainGrassTintStrength is the art lever for how much the ground reads as
// grass. 0.5 is the authored default and leaves the mix unchanged.
float terrainUnderlayerAmount = saturate(
  terrainCoverage *
    mix(0.34, 0.78, terrainVigor) *
    mix(1.0, 0.52, terrainDryness) *
    uTerrainGrassTintStrength * 2.0
);
vec3 terrainSurfaceColor = mix(
  terrainSoil,
  terrainUnderlayer,
  terrainUnderlayerAmount
);
// Mineral soil carried up into the vegetation beside a tread.
//
// Without it the verge is two flat fields meeting at a line -- intact meadow on
// one side, bare earth on the other -- and no amount of roughening the boundary
// fixes that, because the problem is that nothing crosses it. Traffic throws
// soil metres into the grass, so the transition is a gradient of exposure
// rather than a change of material.
//
// Deliberately not mean-preserved: it belongs to the near-field verge, and
// terrainPathShoulder is already vanishing well before the meso weight fades.
float terrainVergeFleck = smoothstep(0.58, 0.86, terrainMesoNoise.r) *
  terrainMesoWeight;
terrainSurfaceColor = mix(
  terrainSurfaceColor,
  uTerrainPathDust,
  saturate(
    terrainPathShoulder * uTerrainVergeFleckStrength * terrainVergeFleck
  )
);

vec3 terrainThatch = mix(uTerrainSoilDry, vTerrainBiomeDry, 0.48) * 0.7;
terrainSurfaceColor = mix(
  terrainSurfaceColor,
  terrainThatch,
  terrainCoverage * (1.0 - terrainDryness) * terrainVigor * 0.28
);

/**
 * The ground agrees with the community standing on it.
 *
 * Without this the communities exist only in the geometry and leave with it: at
 * 200 m the blades are gone and the ground underneath knows nothing about which
 * patch it is, which is exactly the failure that makes a distant meadow read as
 * noise. A tint costs one attribute read and keeps dark colonies, dry patches
 * and bare breaks legible past the last blade.
 *
 * The index is piecewise constant, so a triangle spanning two communities would
 * interpolate to a value belonging to neither. The guard is normalized by the
 * screen-space world-position derivative, so the same world-space identity
 * change gets the same answer near and far instead of depending on triangle
 * size in pixels.
 */
vec4 terrainCommunityGround = saturate(vTerrainCommunityGround);
terrainSurfaceColor = mix(
  terrainSurfaceColor,
  uTerrainSoilDry,
  terrainCommunityGround.x * uTerrainCommunityTintStrength
);
terrainSurfaceColor = mix(
  terrainSurfaceColor,
  uTerrainMoss,
  terrainCommunityGround.y * uTerrainCommunityTintStrength
);
terrainSurfaceColor = mix(
  terrainSurfaceColor,
  vTerrainBiomeDry,
  terrainCommunityGround.z * uTerrainCommunityTintStrength * 0.6
);

vec3 terrainCanopy = vTerrainBiomeCanopy;
terrainCanopy = mix(terrainCanopy, vTerrainBiomeDry, terrainDryness * 0.68);
terrainCanopy *= 0.78 + terrainMacroVariation;
// Capped rather than complete. Ground fully replaced by canopy colour is a
// claim the impostor cards are already making at this range; the ground only
// has to agree with them, not become them. Running the mix to 1 is what made
// this the one ground term that moved the mean colour with distance.
terrainSurfaceColor = mix(
  terrainSurfaceColor,
  terrainCanopy,
  terrainFarMerge * terrainCoverage * uTerrainCanopyMergeStrength
);

// Descriptor coherence below is measured in world units so interpolation
// guards behave identically across the terrain LOD rings.
float terrainWorldGradient = max(
  length(dFdx(vTerrainWorldPosition.xz)),
  length(dFdy(vTerrainWorldPosition.xz))
);

/**
 * Stone contact ecology.
 *
 * The terrain grid carries a stone identity as centre + radii, and the fragment
 * resolves distance at pixel resolution. The identity itself cannot safely be
 * interpolated when a triangle's vertices choose different stones: that would
 * manufacture a centre in empty space. Descriptor derivatives expose exactly
 * that case. Constant descriptors have zero slope; competing/inactive owners
 * vary across the triangle, so their effect is faded out instead of drawing a
 * phantom halo. This deliberately prefers a tiny gap at a Voronoi boundary over
 * inventing a stone that does not exist.
 */
float terrainStoneContactCenterGradient = max(
  length(dFdx(vTerrainStoneInfluence.xy)),
  length(dFdy(vTerrainStoneInfluence.xy))
);
float terrainStoneContactRadiusGradient = max(
  abs(dFdx(vTerrainStoneInfluence.w)),
  abs(dFdy(vTerrainStoneInfluence.w))
);
float terrainStoneContactIdentitySlope = max(
  terrainStoneContactCenterGradient / max(1e-4, terrainWorldGradient),
  terrainStoneContactRadiusGradient /
    max(1e-4, terrainWorldGradient * max(0.25, vTerrainStoneInfluence.w))
);
float terrainStoneContactCoherence =
  1.0 - smoothstep(0.05, 0.35, terrainStoneContactIdentitySlope);
float terrainStoneDistance =
  length(vTerrainWorldPosition.xz - vTerrainStoneInfluence.xy);
float terrainStoneReach = vTerrainStoneInfluence.w;
float terrainStoneProximity = terrainStoneReach > 0.0
  ? (
      1.0 - smoothstep(
        vTerrainStoneInfluence.z,
        terrainStoneReach,
        terrainStoneDistance
      )
    ) * terrainStoneContactCoherence
  : 0.0;
float terrainStoneEdge = smoothstep(0.0, 0.22, terrainStoneProximity);
float terrainStoneContact = saturate(
  terrainStoneProximity * uTerrainStoneContactReach +
    ((terrainBaseNoise.r - 0.5) * 0.42 +
      (terrainMesoNoise.g - 0.5) * 0.30 * terrainMesoWeight) *
      terrainStoneEdge
);
if (terrainStoneContact > 0.001) {
  float terrainStoneDisturbed = smoothstep(0.16, 0.70, terrainStoneContact);
  float terrainStoneCompacted = smoothstep(0.54, 0.96, terrainStoneContact);
  // Damp ground holds the compaction dark; dry ground gives up pale mineral
  // fines instead, which is the same distinction the shoreline mix makes.
  vec3 terrainStoneSoil = mix(
    mix(uTerrainStoneContactSoil, uTerrainPathGrit, 0.34),
    uTerrainStoneContactSoil,
    terrainHumidity
  );
  terrainSurfaceColor = mix(
    terrainSurfaceColor,
    terrainStoneSoil,
    saturate(terrainStoneDisturbed * 0.58 + terrainStoneCompacted * 0.32)
  );
  terrainSurfaceColor *= 1.0 -
    uTerrainStoneContactDarkening * terrainStoneCompacted;
}

/**
 * Contact shade is selected independently from compacted soil. A tall stone can
 * block more sky than the shorter stone whose footprint owns the soil directly
 * under this point. Its identity receives the same interpolation guard so a
 * triangle crossing two shadow owners cannot invent a centre between them.
 */
float terrainStoneOcclusionCenterGradient = max(
  length(dFdx(vTerrainStoneOcclusionCenter)),
  length(dFdy(vTerrainStoneOcclusionCenter))
);
float terrainStoneOcclusionRadiusGradient = max(
  abs(dFdx(vTerrainStoneOcclusion)),
  abs(dFdy(vTerrainStoneOcclusion))
);
float terrainStoneOcclusionIdentitySlope = max(
  terrainStoneOcclusionCenterGradient /
    max(1e-4, terrainWorldGradient),
  terrainStoneOcclusionRadiusGradient /
    max(1e-4, terrainWorldGradient * max(0.25, vTerrainStoneOcclusion))
);
float terrainStoneOcclusionCoherence =
  1.0 - smoothstep(0.05, 0.35, terrainStoneOcclusionIdentitySlope);
float terrainStoneOcclusionDistance =
  length(vTerrainWorldPosition.xz - vTerrainStoneOcclusionCenter);
if (vTerrainStoneOcclusion > 0.0 && terrainStoneOcclusionCoherence > 0.001) {
  float terrainStoneShade =
    1.0 - smoothstep(
      0.0,
      vTerrainStoneOcclusion,
      terrainStoneOcclusionDistance
    );
  terrainSurfaceColor *= 1.0 -
    uTerrainStoneOcclusionStrength * terrainStoneShade * terrainStoneShade *
      terrainStoneOcclusionCoherence;
}

float terrainDryFibrePulse = smoothstep(0.68, 0.9, terrainMicroNoise.a);
float terrainDryFibreAmount = terrainDryness * terrainCoverage *
  (1.0 - terrainWaterProximity * 0.82);
// Mean of the fibre pulse over the A channel. Holding it as
// terrainMicroWeight fades is what stops the ground brightening at the 6-7 m
// micro-detail cutoff; only the speckle (the variance around this mean)
// disappears. terrainMicroAlbedo is already zero-mean and needs no counterpart.
float terrainDryFibre = (
  ${TERRAIN_DRY_FIBRE_PULSE_MEAN.toFixed(4)} +
    (terrainDryFibrePulse - ${TERRAIN_DRY_FIBRE_PULSE_MEAN.toFixed(4)}) *
      terrainMicroWeight
) * terrainDryFibreAmount;
terrainSurfaceColor = mix(
  terrainSurfaceColor,
  vTerrainBiomeDry * 0.68,
  terrainDryFibre * 0.34
);
// Zero-mean, so it registers as detail-preserved and fades safely.
terrainSurfaceColor *= 1.0 +
  terrainFleck * uTerrainFleckStrength * terrainMicroWeight;
float terrainMicroAlbedo = (terrainMicroNoise.b - 0.5) *
  uTerrainMicroStrength * terrainMicroWeight;
terrainSurfaceColor *= 1.0 + terrainMicroAlbedo;
terrainSurfaceColor *= 1.0 -
  uTerrainCanopyDarkening * terrainCoverage * terrainVigor;

/**
 * Moss and accumulated organic matter.
 *
 * Not more grass tint: it gathers where water sits, light is scarce and nothing
 * scours it, and it is a genuinely different material from both the soil beside
 * it and the canopy over it. Gating on slope keeps it off the banks, where
 * nothing accumulates; reading the fleck channel gives it a patchy, colony-like
 * footprint rather than a smooth wash.
 */
float terrainMossAmount = saturate(terrainHumidity * 1.25 - 0.42) *
  saturate(1.0 - terrainSlope * 2.2) *
  smoothstep(-0.08, 0.28, terrainFleck) *
  (0.35 + 0.65 * terrainConcavity);
terrainSurfaceColor = mix(
  terrainSurfaceColor,
  uTerrainMoss,
  saturate(terrainMossAmount) * uTerrainMossStrength
);

// Depressions sit in their own shade.
terrainSurfaceColor *= 1.0 - uTerrainHollowDarkening * terrainConcavity;

/**
 * The dark pool under each tuft, and the litter that gathers around it.
 *
 * The canopy darkening above is smooth over tens of metres, so the ground knew
 * *that* grass was standing on it but never *where*. The eye uses exactly that
 * -- a small dark contact region at the root -- to decide whether a blade is
 * standing in the earth or pasted onto it.
 *
 * The span, hash and centre jitter are the exact CPU placement contract. The
 * effect follows the near-detail schedule because once individual tufts are no
 * longer resolved their root contacts must disappear with them, not remain as
 * an independent dotted pattern on the ground.
 */
vec2 terrainClumpUv = vTerrainWorldPosition.xz / uTerrainClumpSpan;
vec2 terrainClumpCenter = grassClumpCenter(terrainClumpUv, uTerrainClumpSeed);
float terrainClumpDistance = length(terrainClumpUv - terrainClumpCenter);
float terrainClumpShade = 1.0 - smoothstep(0.16, 0.52, terrainClumpDistance);
terrainSurfaceColor *= 1.0 - uTerrainClumpAo * terrainClumpShade *
  terrainCoverage * terrainMicroWeight;
// Organic matter accumulates around a clump rather than under it.
float terrainClumpLitter = smoothstep(0.30, 0.50, terrainClumpDistance) *
  (1.0 - smoothstep(0.50, 0.72, terrainClumpDistance));
terrainSurfaceColor = mix(
  terrainSurfaceColor,
  mix(uTerrainMoss, vTerrainBiomeDry * 0.6, terrainDryness),
  terrainClumpLitter * terrainCoverage * terrainMicroWeight *
    uTerrainClumpLitter
);

float shoreBand = smoothstep(
  0.94,
  1.0,
  terrainWaterProximity
);
/**
 * Shoreline is a depositional material and cannot form on a cliff face. Gating
 * it on slope is what stops a gorge wall standing inside the humidity radius
 * from being painted as gravel from top to bottom.
 */
float shoreExposure =
  shoreBand * (1.0 - terrainCoverage * 0.75) * (1.0 - terrainCliff);
float shorePatch = clamp(
  0.55 +
  (terrainBaseNoise.r - 0.5) * 0.90 +
  (terrainMesoNoise.g - 0.5) * 0.65,
  0.0,
  1.0
);
float shoreMud =
  shoreExposure *
  (1.0 - smoothstep(0.46, 0.63, shorePatch));
float shoreGravel =
  shoreExposure *
  smoothstep(0.68, 0.84, shorePatch);
terrainSurfaceColor = mix(
  terrainSurfaceColor,
  uTerrainSoilRich * 0.82,
  shoreMud
);
terrainSurfaceColor = mix(
  terrainSurfaceColor,
  uTerrainPathGrit,
  shoreGravel
);

float terrainEcologyMask = smoothstep(0.025, 0.34, terrainSuitability);
diffuseColor.rgb = mix(diffuseColor.rgb, terrainSurfaceColor, terrainEcologyMask);

float terrainPathGrain = clamp(
  0.5 +
    (terrainBaseNoise.r - 0.5) * 0.75 +
    (terrainMesoNoise.g - 0.5) * 0.9 * terrainMesoWeight +
    (terrainMicroNoise.b - 0.5) * 0.45 * terrainMicroWeight,
  0.0,
  1.0
);
vec3 terrainPathColor = mix(
  uTerrainPathSoil,
  uTerrainPathDust,
  terrainPathGrain
);
// Depth-shaped rather than flat: a way is most compacted down its middle, and
// squaring a value that rarely reaches 1 is not the same as shaping it.
terrainPathColor *= 1.0 -
  uTerrainPathCoreDarkening * smoothstep(0.15, 1.0, terrainPathCore);
// Mean-preserved, for the same reason the dry fibre pulse above is: this pulse
// is strictly positive, so weighting it by the micro fade removed *brightness*
// as the fade closed rather than only removing speckle. Paths lightened across
// the micro boundary, which is one of the six schedules that stacked into the
// visible ring. Only the variance around the mean may disappear with distance.
float terrainGrit = ${TERRAIN_GRIT_PULSE_MEAN.toFixed(4)} +
  (smoothstep(0.64, 0.86, terrainMicroNoise.b) -
    ${TERRAIN_GRIT_PULSE_MEAN.toFixed(4)}) *
    terrainMicroWeight;
terrainPathColor = mix(terrainPathColor, uTerrainPathGrit, terrainGrit * 0.24);
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  terrainPathColor,
  saturate(terrainPathCore + terrainPathShoulder * 0.82)
);

/**
 * Cliff rock, and the material priority the palette above was missing.
 *
 * Everything before this point decides what grows and what washes up; none of
 * it can produce stone, so a steep face ended up wearing whichever soft
 * material won the ecology mix. Rock is laid over the top wherever the ground
 * is too steep for anything to sit on, and it wins outright: geology first,
 * cover second, water last as a modifier. Its appearance lives in
 * TerrainRockShader; this decides only where it applies.
 */
float terrainRockRelief = 0.0;
if (terrainCliff > 0.001) {
  vec4 terrainWallNoise = textureGrad(
    uTerrainSurfaceNoise,
    terrainWallUv + vec2(0.19, 0.63),
    terrainWallDdx,
    terrainWallDdy
  );
  // The bed index is piecewise constant, so zero gradients pin the hash fetch
  // to the base level instead of letting the step at each boundary pick a mip.
  vec2 terrainBed = terrainResolveBed(
    vTerrainWorldPosition.y,
    (terrainBaseNoise.r - 0.5) * 1.4
  );
  vec4 terrainRockHash = textureGrad(
    uTerrainSurfaceNoise,
    vec2(terrainBed.x * 0.137 + 0.41, 0.317),
    vec2(0.0),
    vec2(0.0)
  );
  vec3 terrainRock = terrainResolveRock(
    terrainWallUv,
    vTerrainWorldPosition.y,
    (terrainBaseNoise.r - 0.5) * 1.4,
    terrainWallNoise,
    terrainRockHash,
    terrainWaterProximity,
    terrainRockRelief
  );
  diffuseColor.rgb = mix(diffuseColor.rgb, terrainRock, terrainCliff);
}

float terrainSurfaceNormalMask = max(
  max(terrainEcologyMask, terrainCliff),
  saturate(terrainPathCore + terrainPathShoulder * 0.82)
);
/**
 * Rock relief joins the height the normal pass already differentiates, so beds
 * and joints catch the light instead of being dark lines painted on a flat
 * face. Added outside the micro weighting because that fades with distance and
 * a cliff's structure must not: a gorge wall is read from across the gorge.
 */
float terrainMicroHeight = (
  (terrainMicroNoise.b - 0.5) * 0.58 +
  (terrainMicroNoise.a - 0.5) * 0.24 +
  // The flecks perturb the normal as well as the albedo, or they read as dirt
  // printed on a flat surface rather than as a surface.
  terrainFleck * 0.18
) * mix(1.0, 0.58, terrainWaterProximity) * terrainMicroWeight +
  terrainRockRelief * terrainCliff;

// The damp margin at the water's edge. terrainWaterProximity is a humidity
// halo that reaches waterHumidityRadius — tens of metres — which is right for
// deciding what grows but far too wide for what glistens. Only the very top of
// that ramp is ground actually wetted by the water, so the band is cut from
// there; the numbers below put it a few metres out from the bank.
//
// Grass cancels it. A wet meadow does not shine, because the blades hide the
// film of water that does: the sheen belongs to exposed mud, sand, and stone.
float terrainWetBand = smoothstep(0.94, 1.0, terrainWaterProximity) *
  (1.0 - terrainCoverage * 0.7);
`;

// Wet ground reads as wet through gloss, not through colour: darkening the
// albedo alone (which the soil mix above already does) just makes a muddy
// patch, not a wet one. Lambert has no specular lobe to modulate, so this adds
// one — narrow, and only where the water is.
//
// Kept in view space off the light's own direction rather than a sun uniform,
// so it cannot drift out of agreement with the light that is actually shading
// the terrain, and skipped entirely away from the water, where the branch is
// coherent across whole chunks.
export const TERRAIN_WET_SHEEN = `
#if NUM_DIR_LIGHTS > 0
  if (terrainWetBand > 0.001) {
    vec3 terrainSheenView = normalize(vViewPosition);
    vec3 terrainSheenHalf = normalize(
      directionalLights[0].direction + terrainSheenView
    );
    float terrainSheenLobe = pow(
      saturate(dot(normal, terrainSheenHalf)),
      uTerrainWetSheenPower
    );
    outgoingLight += directionalLights[0].color *
      (terrainSheenLobe * uTerrainWetSheenStrength * terrainWetBand);
  }
#endif
`;

export const TERRAIN_DETAIL_NORMAL = `
vec3 terrainViewPosition = (viewMatrix * vec4(
  vTerrainWorldPosition,
  1.0
)).xyz;
vec3 terrainSigmaX = dFdx(terrainViewPosition);
vec3 terrainSigmaY = dFdy(terrainViewPosition);
vec3 terrainR1 = cross(terrainSigmaY, normal);
vec3 terrainR2 = cross(normal, terrainSigmaX);
float terrainDeterminant = dot(terrainSigmaX, terrainR1);
float terrainHeightDdx = dFdx(terrainMicroHeight);
float terrainHeightDdy = dFdy(terrainMicroHeight);
vec3 terrainGradient = sign(terrainDeterminant) * (
  terrainHeightDdx * terrainR1 + terrainHeightDdy * terrainR2
);
// Micro detail fades with distance; cliff relief does not.
float terrainReliefWeight = max(terrainMicroWeight, terrainCliff);
if (
  terrainReliefWeight > 0.001 &&
  terrainSurfaceNormalMask > 0.001 &&
  abs(terrainDeterminant) > 1e-8
) {
  normal = normalize(
    abs(terrainDeterminant) * normal -
      terrainGradient * uTerrainNormalStrength * terrainReliefWeight *
        terrainSurfaceNormalMask * 0.12
  );
}
`;
