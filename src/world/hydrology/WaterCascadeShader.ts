/**
 * Falling water.
 *
 * A curtain is not a river surface seen edge-on: it accelerates, it separates
 * into strands, it is thin and bright where it leaves the lip and dense and
 * white where it lands. Everything here keys off the fall progress carried in
 * the geometry, so one material covers a 2 m cascade and a 20 m plunge.
 */
export const WATER_CASCADE_VERTEX_DECLARATIONS = `
attribute vec3 cascade;
attribute float cascadeCrest;
varying vec3 vCascade;
varying float vCascadeCrest;
varying vec3 vCascadeWorldPosition;
`;

export const WATER_CASCADE_VERTEX_POSITION = `
vCascade = cascade;
vCascadeCrest = cascadeCrest;
vCascadeWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

export const WATER_CASCADE_FRAGMENT_DECLARATIONS = `
uniform float uCascadeTime;
uniform float uCascadeFoamStrength;
uniform float uCascadeMistStrength;
uniform float uCascadeDetailDistance;
uniform sampler2D uCascadeNoise;
uniform float uCascadeNoiseScale;
uniform vec3 uCascadeWater;
uniform vec3 uCascadeFoam;
uniform vec3 uCascadeMist;
varying vec3 vCascade;
varying float vCascadeCrest;
varying vec3 vCascadeWorldPosition;
`;

export const WATER_CASCADE_FRAGMENT = `
float cascadeAcross = vCascade.x;
float cascadeFall = clamp(vCascade.y, 0.0, 1.0);
float cascadeDrop = max(0.5, vCascade.z);

float cascadeDistance = distance(cameraPosition, vCascadeWorldPosition);
float cascadeDetail = 1.0 - smoothstep(
  uCascadeDetailDistance * 0.55,
  uCascadeDetailDistance,
  cascadeDistance
);

/**
 * Water in free fall keeps accelerating, so the streaks must stretch and speed
 * up on the way down — but that belongs in the mapping, never in a scroll rate
 * multiplied by absolute time. A fall-dependent speed times uCascadeTime
 * compresses the strands further every second and eventually runs the curtain
 * upward; a parcel's age goes as the square root of the distance dropped, so
 * advecting by that age and scrolling at one constant rate is stable for any run
 * length. Derivation in docs/plans/waterfall-gorge-geology-plan.md, section 0.7.
 *
 * The domain stays many tiles across and only a few tall: that ratio is what
 * turns the noise into vertical strands rather than a cloudy wash.
 */
float cascadeAge = sqrt(cascadeFall);
float cascadeStrandUv = cascadeAcross * 6.0;
float cascadeFlowUv =
  cascadeAge * cascadeDrop * uCascadeNoiseScale * 2.6 - uCascadeTime * 1.55;
vec4 cascadeNoise = texture2D(uCascadeNoise, vec2(cascadeStrandUv, cascadeFlowUv));
vec4 cascadeCoarse = texture2D(
  uCascadeNoise,
  vec2(cascadeStrandUv * 0.37 + 0.21, cascadeFlowUv * 0.44 - uCascadeTime * 0.35)
);

/**
 * Strands. The sheet leaves the lip whole and pulls apart as it falls, so the
 * fine layer is mixed in only once the fall is under way; without the coarse
 * layer underneath, every strand is the same width and the curtain stripes.
 * The tear height is jittered per column, or the sheet parts along a contour.
 */
float cascadeTear = (cascadeCoarse.a - 0.5) * 0.42;
float cascadeBreakup = smoothstep(0.04, 0.72, cascadeFall + cascadeTear);
float cascadeStrand = mix(cascadeCoarse.r, cascadeNoise.g, 0.4 + 0.45 * cascadeBreakup);
float cascadeGap = smoothstep(0.28, 0.72, cascadeStrand);
float cascadeSheet = 1.0 - cascadeBreakup * cascadeGap * 0.85;

// The lip runs thin and bright; the middle aerates; the base is whitewater.
// Narrow: a wide crest band at high alpha becomes a solid slab at the lip.
float cascadeCrest = 1.0 - smoothstep(0.0, 0.05, cascadeFall);
// Broken by the strand noise so the base is a ragged boil, not a painted band.
float cascadeImpact = saturate(
  smoothstep(0.55, 1.0, cascadeFall) *
  (0.55 + 0.75 * cascadeCoarse.b) +
  smoothstep(0.86, 1.0, cascadeFall) * 0.35
);
/**
 * Aeration is what makes falling water white, and it starts the moment the
 * sheet leaves the lip rather than only at the base. Holding it low through the
 * middle left the curtain a grey pane between a bright crest and a bright foot.
 */
float cascadeAeration = saturate(
  0.1 + cascadeBreakup * 0.66 + cascadeImpact * 0.95 +
  (1.0 - cascadeGap) * 0.3 * cascadeDetail
);

vec3 cascadeColor = mix(uCascadeWater, uCascadeFoam, cascadeAeration);
cascadeColor = mix(cascadeColor, uCascadeMist, cascadeImpact * uCascadeMistStrength * 0.5);
// Falling water is lit from every side at once and is the brightest thing in a
// gorge. Keeping it near its own albedo, rather than shading it down like a
// surface, is what stops it reading as a pane of dirty glass.
cascadeColor *= 0.96 + cascadeSheet * 0.16 + cascadeCrest * 0.24;

/**
 * The curtain has to lose its own silhouette at both edges and at the base, or
 * the geometry's rectangle shows. Noise breaks the boundary, and the falloff is
 * squared and closed before the mesh edge: a linear ramp leaves a skirt of
 * low-alpha fragments that collectively redraw the rectangle anyway.
 */
float cascadeEdgeNoise = 0.55 + cascadeCoarse.g * 0.3;
float cascadeEdge = 1.0 - smoothstep(0.34 * cascadeEdgeNoise, 0.9, abs(cascadeAcross));
cascadeEdge *= cascadeEdge;
// The gaps must be genuinely see-through: a uniformly semi-opaque curtain is a
// wall, one you can read the gorge through between dense strands is a waterfall.
float cascadeAlpha = saturate(
  (0.16 + cascadeAeration * 0.95 * uCascadeFoamStrength) *
  cascadeEdge *
  mix(0.12, 1.0, cascadeSheet)
);
// Base spray has no surface of its own, so it thins rather than ending on a cut.
cascadeAlpha *= 1.0 - smoothstep(0.82, 1.0, cascadeFall) * 0.55;
cascadeAlpha = max(cascadeAlpha, cascadeCrest * 0.2 * cascadeEdge);
// Dissolve the sill's line, and thin the sheet where the rock stands proud.
cascadeAlpha *= smoothstep(0.0, 0.03 + cascadeCoarse.r * 0.14, cascadeFall);
// Sill height here, in units of the height at which rock stands clear of the
// sheet: below zero runs heavier, above one is dry rock the fall parts around.
cascadeAlpha *= saturate(1.0 - vCascadeCrest) * (1.0 - vCascadeCrest * 0.35) *
  (1.0 + saturate(-vCascadeCrest) * 0.3);

diffuseColor.rgb = cascadeColor;
diffuseColor.a *= cascadeAlpha;
`;
