import { WATER_FLOW_FRAGMENT_FUNCTIONS } from "./WaterFlowShader";
import { WATER_FOAM_FRAGMENT_FUNCTIONS } from "./WaterFoamShader";
import { WATER_OPTICS_FRAGMENT_FUNCTIONS } from "./WaterOpticsShader";
import { WATER_REGIME_FRAGMENT_FUNCTIONS } from "./WaterRegimeShader";
import { WATER_WAVE_FRAGMENT_FUNCTIONS } from "./WaterWaveShader";
import {
  WATER_BEND_DARKEN,
  WATER_BEND_FLOW_GAIN,
  WATER_BEND_FLOW_LOSS,
  WATER_BEND_LIGHTEN,
  WATER_REGIME_INNER_BANK_WEIGHT,
  WATER_REGIME_MORPHOLOGY_WEIGHT,
  WATER_REGIME_OUTER_BANK_WEIGHT,
  WATER_RIVER_BANK_FLOW_SCALE,
  WATER_RIVER_POOL_FREQUENCY_SCALE,
  WATER_RIVER_RIFFLE_FREQUENCY_SCALE,
  WATER_RIVER_SHALLOW_ENERGY_WEIGHT,
  WATER_RIVER_SLOPE_ENERGY_WEIGHT,
  WATER_VISIBLE_COVERAGE_THRESHOLD,
} from "./WaterMaterialTuning";

export const WATER_VERTEX_DECLARATIONS = `
attribute vec4 waterData;
attribute vec4 waterContext;
attribute vec2 waterInteraction;
varying vec4 vWaterData;
varying vec4 vWaterContext;
varying vec2 vWaterInteraction;
varying vec3 vWaterWorldPosition;
varying vec3 vWaterWorldNormal;
`;

export const WATER_VERTEX_POSITION = `
vWaterData = waterData;
vWaterContext = waterContext;
vWaterInteraction = waterInteraction;
vWaterWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWaterWorldNormal = (modelMatrix * vec4(objectNormal, 0.0)).xyz;
`;

export const WATER_FRAGMENT_DECLARATIONS = `
uniform float uWaterTime;
uniform float uWaterOpacity;
uniform float uWaterRippleStrength;
uniform float uWaterRippleScale;
uniform float uWaterFlowSpeed;
uniform float uWaterRiverReferenceDepth;
uniform float uWaterRiverPoolFlowScale;
uniform float uWaterRiverRiffleFlowScale;
uniform float uWaterFoamStrength;
uniform float uWaterShoreFoamWeight;
uniform float uWaterRiffleFoamWeight;
uniform float uWaterStoneFoamWeight;
uniform float uWaterFresnelStrength;
uniform float uWaterDetailDistance;
uniform float uWaterLakeWaveStrength;
uniform sampler2D uWaterFlowNoise;
uniform float uWaterFlowNoiseScale;
uniform float uWaterFlowNoiseStrength;
uniform float uWaterGlintStrength;
uniform float uWaterStoneWakeStrength;
uniform vec3 uWaterShallow;
uniform vec3 uWaterDeep;
uniform vec3 uWaterReflection;
uniform vec3 uWaterFoam;
uniform vec3 uWaterSunDirection;
varying vec4 vWaterData;
varying vec4 vWaterContext;
varying vec2 vWaterInteraction;
varying vec3 vWaterWorldPosition;
varying vec3 vWaterWorldNormal;
${WATER_FLOW_FRAGMENT_FUNCTIONS}
${WATER_REGIME_FRAGMENT_FUNCTIONS}
${WATER_WAVE_FRAGMENT_FUNCTIONS}
${WATER_FOAM_FRAGMENT_FUNCTIONS}
${WATER_OPTICS_FRAGMENT_FUNCTIONS}
`;

export const WATER_SURFACE_FRAGMENT = `
float waterCoverageRaw = saturate(vWaterData.x);
float waterNormalLength = length(vWaterWorldNormal);
vec3 waterGeometricNormal = waterNormalLength > 1e-4
  ? vWaterWorldNormal / waterNormalLength
  : vec3(0.0, 1.0, 0.0);
if (waterGeometricNormal.y < 0.0) waterGeometricNormal = -waterGeometricNormal;
if (waterCoverageRaw < ${WATER_VISIBLE_COVERAGE_THRESHOLD}) discard;

float waterCoverage = smoothstep(0.015, 0.34, waterCoverageRaw);
float waterDepth = max(0.0, vWaterData.y);
vec2 waterPackedFlow = vWaterData.zw;
float waterRiverAmount = saturate(length(waterPackedFlow));
vec2 waterFlowDirection = waterRiverAmount > 0.001
  ? waterPackedFlow / waterRiverAmount
  : normalize(vec2(0.78, 0.63));
vec2 waterFlowPerpendicular = vec2(-waterFlowDirection.y, waterFlowDirection.x);
vec2 waterPosition = vWaterWorldPosition.xz;
float waterDistance = distance(cameraPosition, vWaterWorldPosition);
float waterDetailWeight = 1.0 - smoothstep(
  uWaterDetailDistance * 0.55,
  uWaterDetailDistance,
  waterDistance
);
float waterRiverDepthRatio =
  waterDepth / max(0.1, uWaterRiverReferenceDepth);
float waterChannelCore = smoothstep(0.35, 0.88, waterCoverageRaw);
float waterShallowEnergy = 1.0 - smoothstep(0.68, 1.02, waterRiverDepthRatio);
float waterSurfaceSlopeEnergy = saturate(
  (1.0 - waterGeometricNormal.y) * 6.0
);

// Everything the hydrology already knew about this vertex, packed once.
float waterBend = vWaterContext.x;
float waterLateral = vWaterContext.y;
float waterMorphology = vWaterContext.z;
float waterLakeDistance = vWaterContext.w;
vec2 waterBanks = waterResolveBankSides(waterBend, waterLateral, waterRiverAmount);
float waterOuterBank = waterBanks.x;
float waterInnerBank = waterBanks.y;
float waterLakeAmount = 1.0 - waterRiverAmount;
float waterOpenLake =
  waterResolveLakeExposure(waterLakeDistance) * waterLakeAmount;
float waterLakeShore =
  waterResolveLakeShoreBand(waterLakeDistance) * waterLakeAmount;

/**
 * The pool -> run -> riffle -> rapid continuum is river-only. A lake margin
 * gets just as shallow as a riffle does, and without the coverage gate every
 * lake edge would start behaving like fast water.
 */
float waterEnergy01 = saturate(
  (
    waterShallowEnergy * ${WATER_RIVER_SHALLOW_ENERGY_WEIGHT} +
    waterSurfaceSlopeEnergy * ${WATER_RIVER_SLOPE_ENERGY_WEIGHT} +
    saturate(-waterMorphology) * ${WATER_REGIME_MORPHOLOGY_WEIGHT}
  ) * waterChannelCore * waterRiverAmount +
  waterInnerBank * ${WATER_REGIME_INNER_BANK_WEIGHT} -
  waterOuterBank * ${WATER_REGIME_OUTER_BANK_WEIGHT}
);
vec4 waterRegime = waterResolveRegime(waterEnergy01);
float waterStreakStretch = waterResolveStreakStretch(waterRegime);
float waterLocalFlowScale = mix(
  uWaterRiverPoolFlowScale,
  uWaterRiverRiffleFlowScale,
  waterEnergy01
);
waterLocalFlowScale *= mix(
  ${WATER_RIVER_BANK_FLOW_SCALE},
  1.0,
  waterChannelCore
);
// Outer bank carries the current; the inner bank slackens over its gravel bar.
waterLocalFlowScale *=
  1.0 + waterOuterBank * ${WATER_BEND_FLOW_GAIN} -
  waterInnerBank * ${WATER_BEND_FLOW_LOSS};
float waterLocalFlowSpeed = uWaterFlowSpeed * waterLocalFlowScale;
float waterRiverFrequencyScale = mix(
  ${WATER_RIVER_POOL_FREQUENCY_SCALE},
  ${WATER_RIVER_RIFFLE_FREQUENCY_SCALE},
  waterEnergy01
);
float waterScale = uWaterRippleScale;
float waterTime = uWaterTime;
vec4 waterFlowNoise = vec4(0.5);
if (waterDetailWeight > 0.001) {
  waterFlowNoise = waterSampleAdvectedNoise(
    waterPosition,
    waterFlowDirection,
    waterTime,
    uWaterFlowNoiseScale,
    mix(uWaterFlowSpeed * 0.2, waterLocalFlowSpeed, waterRiverAmount),
    mix(1.0, waterStreakStretch, waterRiverAmount)
  );
}
vec2 waterNoiseOffset = (waterFlowNoise.rg * 2.0 - 1.0) *
  uWaterFlowNoiseStrength * waterDetailWeight;
vec2 waterWavePosition = waterPosition +
  (waterFlowDirection * waterNoiseOffset.x +
    waterFlowPerpendicular * waterNoiseOffset.y) *
  (0.12 / max(0.01, uWaterFlowNoiseScale));

vec2 waterLakeSlope = vec2(0.0);
if (waterRiverAmount < 0.98) {
  waterLakeSlope = waterResolveLakeSlope(
    waterWavePosition,
    waterScale,
    waterTime,
    saturate(waterOpenLake + waterRiverAmount),
    waterLakeShore
  );
}

vec3 waterRiverPhases = vec3(0.0);
vec2 waterRiverSlope = vec2(0.0);
if (waterRiverAmount > 0.02) {
  waterRiverPhases = waterResolveRiverPhases(
    waterWavePosition,
    waterFlowDirection,
    waterFlowPerpendicular,
    waterScale,
    waterRiverFrequencyScale,
    waterStreakStretch,
    waterTime,
    waterLocalFlowSpeed,
    (waterFlowNoise.g - 0.5) * waterRegime.w * 4.6
  );
  waterRiverSlope = waterResolveRiverSlope(
    waterRiverPhases,
    waterFlowDirection,
    waterFlowPerpendicular
  );
}

vec2 waterMicroSlope = waterDetailWeight > 0.001
  ? waterResolveMicroSlope(waterWavePosition, waterScale, waterTime, waterDetailWeight)
  : vec2(0.0);

float waterStoneObstacle = saturate(vWaterInteraction.x);
float waterStoneWake = saturate(vWaterInteraction.y) * (1.0 - waterStoneObstacle);
float waterStoneEdge = waterResolveStoneEdge(waterStoneObstacle);
float waterStoneDepthMask = 1.0 - smoothstep(1.4, 4.2, waterDepth);
float waterStoneActivity = saturate(
  (waterStoneEdge * 0.82 + waterStoneWake * 0.64) *
  uWaterStoneWakeStrength * waterDetailWeight * waterStoneDepthMask *
  mix(0.3, 1.0, waterRiverAmount)
);
float waterWaveStrength = uWaterRippleStrength * mix(
  uWaterLakeWaveStrength,
  1.0,
  waterRiverAmount
);
vec2 waterNoiseSlope =
  (waterFlowPerpendicular * (waterFlowNoise.g - 0.5) * 0.42 +
    waterFlowDirection * (waterFlowNoise.r - 0.5) * 0.18) *
  uWaterFlowNoiseStrength * waterDetailWeight * mix(0.35, 1.0, waterRiverAmount);
vec2 waterSlope = mix(waterLakeSlope, waterRiverSlope, waterRiverAmount) *
  waterWaveStrength + waterMicroSlope * uWaterRippleStrength + waterNoiseSlope;
waterSlope +=
  (waterFlowPerpendicular * (waterFlowNoise.g - 0.5) * 0.28 +
    waterFlowDirection * (waterFlowNoise.r - 0.5) * 0.12) * waterStoneActivity;

vec3 waterWorldNormal = normalize(
  waterGeometricNormal + vec3(-waterSlope.x, 0.0, -waterSlope.y)
);
vec3 waterLightingNormal = gl_FrontFacing ? waterWorldNormal : -waterWorldNormal;
normal = normalize((viewMatrix * vec4(waterLightingNormal, 0.0)).xyz);

vec3 waterTransmittance;
vec3 waterSurfaceColor = waterOpticsResolveColor(
  uWaterShallow, uWaterDeep, waterDepth,
  vWaterWorldPosition, cameraPosition, waterSlope, waterTransmittance
);
// A bend is asymmetric water: the cut bank runs deep and dark, the point bar
// on the inside is shallow enough that its gravel lifts the tone.
waterSurfaceColor *=
  1.0 - waterOuterBank * ${WATER_BEND_DARKEN} +
  waterInnerBank * ${WATER_BEND_LIGHTEN};

if (waterRiverAmount > 0.02) {
  float waterFlowSheen = 0.5 + 0.5 * sin(
    dot(waterWavePosition, waterFlowPerpendicular) *
      waterScale * waterRiverFrequencyScale * 3.7 -
    waterTime * waterLocalFlowSpeed * 1.9
  );
  waterSurfaceColor *= 0.975 + waterFlowSheen * 0.035 * waterRiverAmount;
}

vec3 waterViewDiff = cameraPosition - vWaterWorldPosition;
vec3 waterViewDirection = length(waterViewDiff) > 1e-4
  ? normalize(waterViewDiff)
  : vec3(0.0, 1.0, 0.0);
float waterFacing = saturate(dot(waterLightingNormal, waterViewDirection));
float waterFresnel = waterOpticsFresnel(waterFacing);
float waterFresnelVisual = saturate(waterFresnel * uWaterFresnelStrength);
waterSurfaceColor = mix(waterSurfaceColor, uWaterReflection, waterFresnelVisual * 0.42);
// Open lake water is doing far less to break up the sky than its own margin is,
// so it holds a more coherent reflection and reads as a larger body of water.
waterSurfaceColor = mix(waterSurfaceColor, uWaterReflection, waterOpenLake * 0.07);
vec3 waterSunPlusView = uWaterSunDirection + waterViewDirection;
vec3 waterHalfVector = length(waterSunPlusView) > 1e-4
  ? normalize(waterSunPlusView)
  : waterLightingNormal;
float waterSunSpecular = pow(
  saturate(dot(waterLightingNormal, waterHalfVector)),
  96.0
);
float waterGlintBreakup = mix(0.62, 1.0, waterFlowNoise.a);
float waterGlint = waterSunSpecular * waterGlintBreakup *
  waterDetailWeight * uWaterGlintStrength;
waterSurfaceColor = mix(waterSurfaceColor, uWaterReflection, waterGlint * 0.16);

float waterPoolTint =
  waterRiverAmount *
  waterChannelCore *
  waterRegime.x *
  smoothstep(1.05, 1.26, waterRiverDepthRatio);
float waterRiffleTint =
  waterRiverAmount *
  waterChannelCore *
  waterShallowEnergy *
  saturate(waterRegime.z + waterRegime.w);
waterSurfaceColor *=
  1.0 - waterPoolTint * 0.03 +
  waterRiffleTint * 0.02;

float waterShoreBand = waterResolveShoreFoam(
  waterCoverageRaw,
  waterDepth,
  waterRiverAmount,
  waterLakeAmount,
  waterEnergy01,
  waterOuterBank,
  uWaterLakeWaveStrength
);
float waterRiverFoam = 0.0;
if (waterRiverAmount > 0.02 && waterDetailWeight > 0.001) {
  waterRiverFoam = waterResolveRiffleFoam(
    waterRiverPhases,
    waterRegime,
    waterFlowNoise.g,
    waterRiverAmount,
    waterChannelCore,
    waterDetailWeight,
    waterShallowEnergy,
    waterInnerBank
  );
}
float waterStoneFoam = waterStoneActivity * (0.62 + waterFlowNoise.b * 0.38);
float waterFoamAmount = saturate(
  (
    waterShoreBand * uWaterShoreFoamWeight +
    waterRiverFoam * uWaterRiffleFoamWeight +
    waterStoneFoam * uWaterStoneFoamWeight
  ) * uWaterFoamStrength
);
waterSurfaceColor = mix(waterSurfaceColor, uWaterFoam, waterFoamAmount);
roughnessFactor = clamp(
  roughnessFactor + waterRiverAmount * waterDetailWeight * 0.035 +
    waterRegime.w * waterDetailWeight * 0.07 +
    waterStoneActivity * 0.08 + waterFoamAmount * 0.48 - waterGlint * 0.025,
  0.02,
  0.75
);

diffuseColor.rgb = waterSurfaceColor;
float waterTransmittanceLuma = dot(
  waterTransmittance,
  vec3(0.2126, 0.7152, 0.0722)
);
// The shallow floor decides how much sheet sits over a gravel bar. At 0.16 a
// riffle was 89% raw bed and the water vanished; 0.26 left a 12 m channel that
// is under a metre deep nearly everywhere reading as wet gravel; 0.42 washed
// the shallows out to a flat pale sheet. 0.34 keeps the cobbles legible while
// the water still reads as the surface it is.
float waterAlpha = uWaterOpacity * waterCoverage *
  mix(0.34, 0.88, 1.0 - waterTransmittanceLuma);
waterAlpha = mix(waterAlpha, min(1.0, waterAlpha + 0.22), waterFoamAmount);
diffuseColor.a *= waterAlpha;
`;
