import * as THREE from "three";
import { GRASS_SHAPE_BEND_FRACTION } from "../../world/grass/GrassRuntimeMath";
import type { GrassNearMaterialOptions } from "./GrassNearMaterial";
import {
  grassCompactGustGlsl,
  grassTuftWindPhaseGlsl,
  grassWeatherEnvelopeGlsl,
} from "../wind/WindNoiseTexture";
import {
  GRASS_LIGHT_MIX_GLSL,
  GRASS_PALETTE_GLSL,
  GRASS_VERTEX_PALETTE_ROOT_PROGRESS_GLSL,
} from "./GrassPaletteShader";
import { GRASS_MAX_BIOMES } from "../biome/GrassBiomeProfile";

/**
 * The shipped GLSL blade, kept as the numerical comparison's reference.
 *
 * Production draws `GrassNearNodeMaterial`; this is the code that material was
 * ported from. Keeping it here rather than beside the state owner means the
 * comparison still measures the port against real executable code, while the
 * shader text stays out of the shipped bundle -- only `src/dev` reaches it.
 *
 * It is driven from the caller's own uniform table and compile-time feature
 * selection, so the reference and the shipped material cannot be measured while
 * holding different state.
 */

/**
 * Palette rows, one per biome. Bounded uniform arrays indexed by a per-instance
 * row keep biome count out of the draw-call budget entirely: one material, one
 * geometry family, one atlas, N looks. `grassResolvePalette` itself is
 * untouched — callers index the arrays and pass the results as its existing
 * parameters — so LOD colour parity is preserved by construction.
 */
const BIOME_PALETTE_DECLARATIONS = `
#define GRASS_MAX_BIOMES ${GRASS_MAX_BIOMES}
uniform vec3 uGrassBiomeBase[GRASS_MAX_BIOMES];
uniform vec3 uGrassBiomeTip[GRASS_MAX_BIOMES];
uniform vec3 uGrassBiomeDry[GRASS_MAX_BIOMES];
// x: root darkening, y: tip colour strength.
uniform vec2 uGrassBiomeShade[GRASS_MAX_BIOMES];

// Indexing a uniform array out of range is undefined behaviour in GLSL ES 3.0,
// so the row is clamped rather than trusted. The data is always in range today;
// this is what keeps a future profile-count mismatch a wrong colour instead of
// a driver-dependent crash.
int grassResolveBiomeRow(float biome) {
  return int(clamp(biome, 0.0, float(GRASS_MAX_BIOMES - 1)) + 0.5);
}
`;

const VERTEX_DECLARATIONS = `
attribute float grassProgress;
attribute float grassPhase;
attribute float grassBladeShade;
attribute vec4 instanceVariation;
attribute float instanceCoverage;
attribute float instanceBiome;
uniform float uGrassTime;
uniform vec2 uGrassWindDirection;
uniform float uGrassWindStrength;
uniform float uGrassGustScale;
uniform float uGrassGustSpeed;
uniform float uGrassFlutterStrength;
uniform float uGrassFlutterSpeed;
uniform vec2 uGrassNormalUpRange;
uniform float uGrassWindLodScale;
uniform float uGrassDitherSeed;
uniform vec2 uGrassMicroFadeRange;
uniform float uGrassNearDistance;
uniform float uGrassMidDistance;
uniform float uGrassTransitionDistance;
uniform float uGrassDetailMode;
uniform float uGrassDetailNearDistance;
uniform float uGrassDetailTransitionDistance;
uniform float uGrassLodInvert;
uniform float uGrassArtDensityScale;
uniform float uGrassBladeCurvature;
uniform float uGrassGustFrontScale;
uniform float uGrassGustFrontSpeed;
uniform float uGrassGustFrontDepth;
uniform float uGrassGustTipBoost;
uniform float uGrassSheenFadeDistance;
uniform float uGrassDensityFalloffStart;
uniform float uGrassDensityFalloffEnd;
uniform float uGrassDensityFloor;
uniform float uGrassLodDensityScale;
varying vec2 vGrassSheen;

vec3 grassRotateAroundAxis(
  vec3 value,
  vec3 axis,
  float sine,
  float cosine
) {
  return value * cosine + cross(axis, value) * sine +
    axis * dot(axis, value) * (1.0 - cosine);
}
`;

// Only the layer that is actually large enough on screen to shimmer compiles
// the sub-pixel width clamp. Everything else keeps the plain vertex path.
const VERTEX_SUBPIXEL_DECLARATIONS = `
uniform float uGrassPixelWorldScale;
uniform float uGrassMinPixelWidth;
uniform float uGrassBladeHalfWidth;
uniform float uGrassMaxWidenDistance;
`;

// Only materials that can actually be reached by the character compile these.
// Mid blades start grassNearDistance from the CAMERA while the trail square is
// centred on the CHARACTER, so the nearest mid blade sits grassNearDistance
// minus characterCameraMaxDistance from the trail centre — 14 m against a 12 m
// half-extent as configured. WorldConfigLoader enforces that margin; without it
// mid blades would fall inside the trail and spring upright at the handoff.
const VERTEX_TRAIL_DECLARATIONS = `
uniform sampler2D uGrassTrailMap;
uniform vec2 uGrassTrailCenter;
uniform float uGrassTrailInverseCoverage;
uniform float uGrassTrailStrength;
uniform float uGrassTrailMaxAngle;
uniform float uGrassTrailWobbleFrequency;
uniform float uGrassTrailWobbleAmplitude;
uniform vec4 uGrassGroundShadowDisc;
uniform float uGrassGroundShadowStrength;
varying float vGrassGroundShade;
`;

// The streamed world resolves coverage per blade from its own camera distance.
//
// Both branches keep a contiguous run of the dither order — a prefix for the
// near layers, a suffix for the inverted mid layer — which is what lets the CPU
// truncate the draw instead of submitting blades the shader only collapses to
// zero area. `grassDensityFalloff` scales the kept fraction without breaking
// that property: it moves the single threshold, it does not punch holes in it.
//
// At 40-64 m a blade projects to one or two pixels, so drawing all 72/m² buys
// nothing but vertex work. The survivors are widened by the sub-pixel clamp to
// give back exactly the coverage the dropped blades surrendered, and the clamp
// pays that back in colour, so average field brightness stays where the LOD
// colour parity gate expects it.
const VERTEX_KEEP_WORLD_LOD = `
bool grassKeepLod;
if (uGrassLodInvert < 0.5) {
  grassKeepLod = grassDither <= grassNearCoverage * grassDensityFalloff;
} else {
  grassDensityFalloff *= mix(
    1.0,
    uGrassDensityFloor,
    smoothstep(
      uGrassDensityFalloffStart,
      uGrassDensityFalloffEnd,
      grassCameraDistance
    )
  );
  float grassLodCut = max(grassNearCoverage, grassFarDistanceEntry);
  grassKeepLod = grassDither > 1.0 - grassDensityFalloff * (1.0 - grassLodCut);
}
`;

// The island regression scene is a single small object framed whole by an
// orbiting camera, so its near/mid split is one threshold for the entire scene
// rather than a per-blade distance fade. That threshold is a genuine
// material-level uniform here; it used to be written per mesh, which three
// silently collapsed to whichever patch drew first.
const VERTEX_KEEP_THRESHOLD_LOD = `
bool grassKeepLod = uGrassLodInvert < 0.5
  ? grassDither <= uGrassLodThreshold
  : grassDither > uGrassLodThreshold && grassDither <= uGrassDistanceFade;
`;

const VERTEX_THRESHOLD_DECLARATIONS = `
uniform float uGrassLodThreshold;
uniform float uGrassDistanceFade;
`;

// Keep two normals for each blade. `objectNormal` retains the segmented source
// geometry used at arm's length. `grassBladePlaneNormal` removes longitudinal
// segmentation but preserves the direction the blade plane faces. The latter
// is the stable macro normal that the source converges on as micro detail fades.
//
// The width direction is recovered from the flat quad's own face normal rather
// than stored per vertex, so this works unchanged for the single-blade geometry
// (width along local X) and for clump geometry, whose blades each face a
// different way. It also leaves `grassWidthAxis` and `grassSide` in scope for
// the sub-pixel width clamp further down.
const VERTEX_NORMAL = `
// The instance root, its camera distance, and the shading micro fade resolve
// here rather than in the wind chunk below.
//
// They have to: this chunk runs in beginnormal_vertex, ahead of begin_vertex,
// and the normal now depends on distance. Nothing here needs anything the
// vertex stage does not already hold, and the wind chunk reuses these rather
// than recomputing them.
vec4 grassWorldRoot = modelMatrix * vec4(instanceMatrix[3].xyz, 1.0);
float grassCameraDistance = distance(cameraPosition, grassWorldRoot.xyz);
// Deliberately NOT derived from this material's own LOD distance. Micro fade
// drives the troughed normal, the normal flattening, the per-blade tone
// variation and the flutter — all shading, none of it LOD. Keying it to
// uGrassNearDistance gave the five near/mid layers five different schedules
// (3.4 m, 9.4 m, 14.6 m), so the two co-located populations inside the
// ultra-near band were lit differently and the handoff at 6-7 m read as a
// brightness ring following the camera.
float grassMicroFade = 1.0 - smoothstep(
  uGrassMicroFadeRange.x,
  uGrassMicroFadeRange.y,
  grassCameraDistance
);
vec3 grassWidthAxis = cross(vec3(0.0, 1.0, 0.0), objectNormal);
float grassWidthAxisLength = length(grassWidthAxis);
grassWidthAxis = grassWidthAxisLength > 0.0001
  ? grassWidthAxis / grassWidthAxisLength
  : vec3(1.0, 0.0, 0.0);
float grassSide = uv.x * 2.0 - 1.0;
vec3 grassBladePlaneNormal = normalize(cross(
  grassWidthAxis,
  vec3(0.0, 1.0, 0.0)
));
/**
 * How far the blade normal is flattened toward world up — a schedule now,
 * rather than one constant.
 *
 * At the shipped 0.76 more than three quarters of every blade normal was world
 * up, so a blade facing the sun and a blade facing away returned nearly the
 * same Lambert response: the near field had no form, only colour. It also
 * flattened grassThinness in the fragment stage, which is the transmission
 * term — so the backlighting was implemented correctly and then suppressed by
 * the same constant.
 *
 * The flat normal is right for a card at 200 m that must not shimmer and wrong
 * for a blade filling forty pixels, so it interpolates between the two. The far
 * value must stay equal to the impostor material's own flattening, or the
 * mid-to-far handoff shifts hue under the camera.
 */
float grassNormalUpHere = mix(
  uGrassNormalUpRange.y,
  uGrassNormalUpRange.x,
  grassMicroFade
);
objectNormal = normalize(
  mix(objectNormal, vec3(0.0, 1.0, 0.0), grassNormalUpHere)
);
grassBladePlaneNormal = normalize(
  mix(grassBladePlaneNormal, vec3(0.0, 1.0, 0.0), grassNormalUpHere)
);
`;

const VERTEX_SHADING_DECLARATIONS = `
varying float vGrassProgress;
varying float vGrassShade;
varying float vGrassDryness;
varying float vGrassRootAo;
flat varying float vGrassBiome;
varying float vGrassGust;
`;

const VERTEX_SHAPE_DECLARATIONS = `
attribute vec4 instanceShape;
attribute float grassBladeWidth;
uniform float uGrassShapeTipDrift;
`;

/**
 * Gives each blade a silhouette of its own.
 *
 * Every near blade instances one cached source triangle, so without this the
 * whole population is that one outline under an affine transform: the same
 * taper, the same intact point, the apex always directly over the root. That is
 * the "many identical thin triangles" read, and it is a shape problem — no
 * amount of density or palette work reaches it.
 *
 * Injected after the normal chunk, which is where grassWidthAxis and grassSide
 * come from, and before the wind, because wind has to bend the *shaped* blade
 * rather than a straight one that is reshaped afterwards.
 */
const VERTEX_SHAPE = `
float grassShapeDrift = instanceShape.x * 2.0 - 1.0;
float grassShapeTaper = mix(0.42, 1.20, instanceShape.y);
float grassShapeDamage = instanceShape.z;
float grassShapeBend = instanceShape.w * 2.0 - 1.0;

// Rebuild the centre line so the half-width can be *replaced* rather than
// added to. A row's two vertices sit either side of it along the width axis,
// and the apex is on it — uv.x is 0.5 there, so grassSide is zero and the
// reconstruction costs nothing at the one vertex where the width is zero.
float grassShapeHead = max(1.0 - grassProgress, 0.0);
vec3 grassShapeArm = grassWidthAxis * grassSide;
vec3 grassShapeCenter =
  transformed - grassShapeArm * (grassBladeWidth * pow(grassShapeHead, 0.72));

// 0.72 is the exponent baked into the source blade at build time. Tapering
// again would compound the two, so the new profile replaces it outright.
float grassShapeWidth = grassBladeWidth * pow(grassShapeHead, grassShapeTaper);
// A broken blade is blunt, not shorter-with-a-point: it holds width where an
// intact one would have almost none, and gives up the last of its rise.
grassShapeWidth = max(
  grassShapeWidth,
  grassBladeWidth * 0.55 * grassShapeDamage *
    smoothstep(0.5, 0.85, grassProgress)
);
grassShapeCenter.y *= 1.0 -
  0.1 * grassShapeDamage * smoothstep(0.9, 1.0, grassProgress);

// Tip drift grows quadratically, so the root stays planted and only the upper
// half leans. This is the term that breaks the mirrored-isoceles read.
grassShapeCenter += grassWidthAxis * (
  grassShapeDrift * uGrassShapeTipDrift * grassBladeWidth *
  grassProgress * grassProgress
);
// Extra flop along the blade's own depth axis, as a fraction of the height it
// has reached rather than a fixed distance, so a short blade bends short.
grassShapeCenter += normalize(cross(grassWidthAxis, vec3(0.0, 1.0, 0.0))) * (
  grassShapeBend * GRASS_SHAPE_BEND * grassShapeCenter.y *
  pow(grassProgress, 1.6)
);

transformed = grassShapeCenter + grassShapeArm * grassShapeWidth;
`.replace("GRASS_SHAPE_BEND", GRASS_SHAPE_BEND_FRACTION.toFixed(3));

const VERTEX_WIND = `
// The instance's translation is its fourth column; multiplying the full matrix
// by the origin is the same value for eight times the work, per vertex.
float grassDither = fract(
  grassBladeShade * 0.754877666 +
  grassPhase * 0.569840296 +
  GRASS_DITHER_INSTANCE_TERM
  uGrassDitherSeed
);
GRASS_GUST_NOISE
float grassFieldDither = fract(
  grassBladeShade * 0.438289 +
  grassPhase * 0.819173 +
  instanceVariation.x * 0.347193 +
  uGrassDitherSeed * 1.618034
);
// Motion phase is deliberately a *separate* quantity from the dithers above.
//
// The single-blade layers instance one source blade, so its grassPhase is the
// same 0.5 for every near instance: flutter timing and stiffness were therefore
// synchronised across the whole near field, which on compact — where the gust
// source is a single coherent sine — reads as rows of grass bending together.
// Folding in the per-instance variation decorrelates both.
//
// It must not be substituted into either dither: the mid layer's CPU draw
// truncation reproduces grassDither exactly and depends on it carrying no
// per-instance term, so LOD selection and motion have to stay independent.
float grassMotionPhase = fract(grassPhase + instanceVariation.x);
mat3 grassInstanceBasis = mat3(instanceMatrix);
vec3 grassWidthAxisView = normalize(
  normalMatrix * grassInstanceBasis * grassWidthAxis
);
// Three.js applies this inverse-scale correction to objectNormal in
// defaultnormal_vertex. The macro blade-plane normal bypasses that chunk, so it
// must mirror the same transform here or Phase 5's broad/non-uniform instances
// skew the far end of the Phase 6 lighting fade.
vec3 grassInstanceScaleSquared = vec3(
  dot(grassInstanceBasis[0], grassInstanceBasis[0]),
  dot(grassInstanceBasis[1], grassInstanceBasis[1]),
  dot(grassInstanceBasis[2], grassInstanceBasis[2])
);
vec3 grassBladePlaneNormalView = normalize(
  normalMatrix * grassInstanceBasis *
    (grassBladePlaneNormal / max(grassInstanceScaleSquared, vec3(1e-8)))
);
// Trough curvature is micro detail: progressively remove it without erasing
// the direction of the blade plane itself.
vNormal = normalize(
  vNormal + grassWidthAxisView *
    (grassSide * uGrassBladeCurvature * grassMicroFade)
);
float grassNearCoverage = 1.0 - smoothstep(
  uGrassNearDistance - uGrassTransitionDistance,
  uGrassNearDistance + uGrassTransitionDistance,
  grassCameraDistance
);
float grassFarDistanceEntry = smoothstep(
  uGrassMidDistance - uGrassTransitionDistance,
  uGrassMidDistance + uGrassTransitionDistance,
  grassCameraDistance
);
float grassDetailCoverage = 1.0 - smoothstep(
  uGrassDetailNearDistance - uGrassDetailTransitionDistance,
  uGrassDetailNearDistance + uGrassDetailTransitionDistance,
  grassCameraDistance
);
// Starts at the quality governor's global scale and, for the mid layer, picks
// up the distance falloff inside the keep test below. The sub-pixel width clamp
// reads the final value to widen the survivors by the area the thinning gave up.
float grassDensityFalloff = uGrassLodDensityScale;
GRASS_KEEP_LOD
bool grassKeepDetail = uGrassDetailMode < 0.5 ||
  (uGrassDetailMode < 1.5
    ? grassDither > grassDetailCoverage
    : grassDither <= grassDetailCoverage);
// instanceCoverage carries both the per-instance field coverage and the
// streaming fade-in. Both used to be separate uniforms, but three only uploads
// a shared material's uniforms once per contiguous run of draws, so per-mesh
// values never reached the GPU. Per-instance data has no such problem.
bool grassKeepBlade =
  grassKeepLod &&
  grassKeepDetail &&
  grassFieldDither <= min(instanceCoverage * uGrassArtDensityScale, 1.0);

if (!grassKeepBlade) {
  // Every vertex in a blade shares the keep decision, so a rejected blade
  // collapses to a zero-area triangle and is dropped at primitive assembly.
  // This is the only place blades are rejected: evaluating it here rather than
  // as a fragment discard is what lets the fragment shader stay early-Z
  // friendly, and it is also exact, since the decision no longer depends on
  // interpolating a constant varying across the triangle.
  transformed = vec3(0.0);
}

GRASS_SHEEN_VARYING

float grassCoverage = 1.0;
GRASS_GROUND_SHADE_INIT
GRASS_SUBPIXEL_WIDTH

if (grassKeepBlade && grassProgress > 0.001) {
  vec2 grassWindDirection = uGrassWindDirection;
  float grassHorizontalScale = max(length(grassInstanceBasis[0]), 0.0001);
  float grassVerticalScale = max(length(grassInstanceBasis[1]), 0.0001);
  float grassDepthScale = max(length(grassInstanceBasis[2]), 0.0001);
  // A gust front travelling along the wind, tens of metres between crests.
  // Weather and tuft phase keep neighbouring blades in a clump moving together
  // while neighbouring tufts and calm stretches still differ. The envelope only
  // ever scales the bend down, which is what lets the reserved bounds and the
  // configured wind strength keep their existing meaning.
  float grassWeather = ${grassWeatherEnvelopeGlsl("uGrassTime")};
  float grassTuftPhase = ${grassTuftWindPhaseGlsl("grassWorldRoot.xz")};
  float grassGustEnvelope =
    mix(1.0 - uGrassGustFrontDepth, 1.0, grassGustNoise) * grassWeather;
  float grassGust = sin(
    dot(grassWorldRoot.xz, grassWindDirection) / uGrassGustScale +
    uGrassTime * uGrassGustSpeed +
    grassTuftPhase * 1.15 +
    instanceVariation.x * 0.42
  );
  float grassFlutter = GRASS_FLUTTER_TERM;
  float grassStiffness = mix(
    0.76,
    1.12,
    fract(grassTuftPhase * 1.61803398875 + instanceVariation.x * 0.31)
  ) * mix(1.0, 0.72, instanceVariation.w);
  float grassBend = (
    grassGust * uGrassWindStrength +
    grassFlutter * uGrassFlutterStrength * grassMicroFade
  ) * instanceVariation.y * grassStiffness * pow(grassProgress, 1.65) *
    uGrassWindLodScale * grassGustEnvelope;
  vec3 grassWorldWind = vec3(grassWindDirection.x, 0.0, grassWindDirection.y);
  // Rotate about the root instead of translating the vertex. Translation makes
  // a bent blade longer than a straight one; the trail bend below documents
  // that as the source of the rubbery look and was rewritten to rotate, but the
  // wind path kept the old form and stretched every blade it moved.
  vec2 grassWindLocal = vec2(
    dot(grassWorldWind, grassInstanceBasis[0] / grassHorizontalScale),
    dot(grassWorldWind, grassInstanceBasis[2] / grassDepthScale)
  );
  float grassWindSin = sin(grassBend);
  float grassWindCos = cos(grassBend);
  float grassWindHeight = transformed.y;
  transformed.x += grassWindLocal.x * grassWindHeight * grassWindSin *
    (grassVerticalScale / grassHorizontalScale);
  transformed.z += grassWindLocal.y * grassWindHeight * grassWindSin *
    (grassVerticalScale / grassDepthScale);
  transformed.y *= grassWindCos;
  vec3 grassWindAxis = vec3(grassWindLocal.y, 0.0, -grassWindLocal.x);
  float grassWindAxisLength = length(grassWindAxis);
  if (grassWindAxisLength > 0.0001) {
    vec3 grassWindAxisView = normalize(
      mat3(modelViewMatrix) * grassInstanceBasis *
        (grassWindAxis / grassWindAxisLength)
    );
    vNormal = normalize(grassRotateAroundAxis(
      vNormal,
      grassWindAxisView,
      grassWindSin,
      grassWindCos
    ));
    grassBladePlaneNormalView = normalize(grassRotateAroundAxis(
      grassBladePlaneNormalView,
      grassWindAxisView,
      grassWindSin,
      grassWindCos
    ));
  }
GRASS_TRAIL_BEND
}

if (grassKeepBlade) {
  // The far end of the micro fade keeps the wind/trail-oriented blade plane.
  // It no longer collapses every blade toward the same world-up normal.
  vNormal = normalize(mix(
    vNormal,
    grassBladePlaneNormalView,
    1.0 - grassMicroFade
  ));
}

`;

// x: how much of the specular lobe survives at this distance, y: how thin the
// blade is here. The mid material compiles out the fade calculation entirely.
//
// The lobe is also gated on the gust, so a crest sweeping the field carries a
// travelling band of highlight with it. That is what makes a wave visible as
// *light* rather than only as motion, which is most of what reads as wind in
// the reference: the field brightens where it bends, even at distances where
// individual blades are no longer resolvable.
const VERTEX_SHEEN_VARYING = `
vGrassSheen = vec2(
  (1.0 - smoothstep(
    uGrassSheenFadeDistance * 0.55,
    uGrassSheenFadeDistance,
    grassCameraDistance
  )) * (0.45 + 0.85 * grassGustNoise),
  mix(0.55, 1.0, grassProgress)
);
`;

const VERTEX_NO_SHEEN_VARYING = `
vGrassSheen = vec2(0.0, mix(0.55, 1.0, grassProgress));
`;

// Two octaves of scrolling value noise, shared by every grass layer and by the
// impostor cards, sampled with one vertex fetch. A single sine front is
// periodic at exactly one wavelength and reads as stripes from any elevated
// view; noise crests are irregular in both spacing and width, which is what
// makes a gust look like weather rather than like a shader.
const VERTEX_GUST_NOISE = `
vec2 grassGustUv = grassWorldRoot.xz * uGrassWindNoiseScale -
  uGrassWindDirection * (uGrassTime * uGrassWindNoiseSpeed);
float grassGustNoise = texture2D(uGrassWindNoise, grassGustUv).r;
`;

// Compact profiles keep the arithmetic gust — two crossing waves at the same
// scale, speed, and weights every other layer's fallback uses, built from the
// one shared expression so mobile cannot drift between LODs.
const VERTEX_GUST_SINE = grassCompactGustGlsl({
  target: "grassGustNoise",
  position: "grassWorldRoot.xz",
  windDirection: "uGrassWindDirection",
  time: "uGrassTime",
  scale: "uGrassGustFrontScale",
  speed: "uGrassGustFrontSpeed",
});

const VERTEX_WIND_NOISE_DECLARATIONS = `
uniform sampler2D uGrassWindNoise;
uniform float uGrassWindNoiseScale;
uniform float uGrassWindNoiseSpeed;
`;

// A blade narrower than a pixel does not antialias away — it alternately covers
// and misses the pixel centre as the camera moves, and an opaque field of them
// sparkles. Widening the blade to a minimum projected width fixes the coverage;
// blending back towards the canopy colour by exactly the area that widening
// invented keeps the field's average brightness where it was, so the near band
// still matches the mid patches it hands over to.
//
// The widening is clamped well inside the bounds safety margin, so a blade can
// never grow out of the tile bound that frustum culling uses.
const VERTEX_SUBPIXEL_WIDTH = `
if (grassKeepBlade) {
  float grassWidthScale = max(length(vec3(instanceMatrix[0])), 0.0001);
  float grassSourceHalfWidth = uGrassBladeHalfWidth * grassWidthScale;
  // inversesqrt(falloff) is the width a survivor needs to cover the ground its
  // dropped neighbours used to. Thinning without it would read as the field
  // going bald with distance; thinning with it is invisible, and the colour
  // payback below keeps average brightness flat across the LOD handoff.
  float grassTargetHalfWidth = min(
    grassCameraDistance * uGrassPixelWorldScale * uGrassMinPixelWidth * 0.5 *
      inversesqrt(max(grassDensityFalloff, 0.04)),
    uGrassMaxWidenDistance
  );
  float grassWidenedHalfWidth = max(grassSourceHalfWidth, grassTargetHalfWidth);
  grassCoverage = grassSourceHalfWidth / grassWidenedHalfWidth;
  // grassSide is 0 at the single-triangle blade's apex, so the blade widens at
  // the base and keeps its point.
  transformed += grassWidthAxis *
    (grassSide * (grassWidenedHalfWidth - grassSourceHalfWidth) / grassWidthScale);
}
`;

// The blade rotates about its root instead of being translated sideways. The
// old path did `transformed += push * bend`, which made a bent blade longer than
// a straight one — the source of the rubbery look — and then subtracted a fixed
// fraction of the height to fake the crush back out. Rotating conserves the
// blade's length by construction, so the fudge is gone.
const VERTEX_TRAIL_BEND = `
  // Contact occlusion under the character. Grass takes no part in the shadow
  // map (see GrassGroundShadow), so without this the field stays fully lit right
  // up to the feet standing in it and the character reads as a decal.
  //
  // Two falloffs, because a body near the ground occludes two different things.
  // Across the ground it is a soft disc, squared so the darkest part stays
  // small and the edge stays wide. Up the blade it is strongest at the root and
  // gone by the tip: the sky the root cannot see is most of what lights it,
  // while a tip standing clear of the disc is lit normally. Fading it out that
  // way also hides the disc's edge, which is the tell on a fake like this.
  if (uGrassGroundShadowStrength > 0.0) {
    vec2 grassGroundOffset = grassWorldRoot.xz - uGrassGroundShadowDisc.xz;
    float grassGroundRadius = max(uGrassGroundShadowDisc.w, 0.0001);
    float grassGroundFalloff = 1.0 - saturate(
      length(grassGroundOffset) / grassGroundRadius
    );
    if (grassGroundFalloff > 0.0) {
      // The root's own height above the contact point, so grass on a bank above
      // the character does not darken as if it were underfoot.
      float grassGroundLift = 1.0 - saturate(
        abs(grassWorldRoot.y - uGrassGroundShadowDisc.y) * 0.6
      );
      vGrassGroundShade = 1.0 -
        grassGroundFalloff * grassGroundFalloff * grassGroundLift *
        uGrassGroundShadowStrength * (1.0 - grassProgress * 0.72);
    }
  }
  if (uGrassTrailStrength > 0.0) {
    // The AABB reject is the whole early-out: two compares before any fetch,
    // and the trail square only ever covers a couple of dozen metres around the
    // character while this layer draws every blade in the near band.
    vec2 grassTrailUv =
      (grassWorldRoot.xz - uGrassTrailCenter) * uGrassTrailInverseCoverage + 0.5;
    vec2 grassTrailInside = step(vec2(0.0), grassTrailUv) * step(grassTrailUv, vec2(1.0));
    if (grassTrailInside.x * grassTrailInside.y > 0.0) {
      vec4 grassTrailSample = texture2D(uGrassTrailMap, grassTrailUv);
      float grassTrailCrush = grassTrailSample.b;
      vec2 grassTrailDirection = grassTrailSample.rg * 2.0 - 1.0;
      float grassTrailDirectionLength = length(grassTrailDirection);
      if (grassTrailCrush > 0.004 && grassTrailDirectionLength > 0.02) {
        grassTrailDirection /= grassTrailDirectionLength;
        // Blades differ in how hard they resist, so a footprint is not a
        // uniformly flattened disc. This mixes in instanceVariation as well as
        // grassPhase: the single-blade layers instance one source blade, so a
        // phase-only seed would be identical for every blade in the field.
        float grassTrailSeed = fract(instanceVariation.x * 3.719 + grassPhase * 2.61803398875);
        float grassTrailStiffness = mix(1.22, 0.78, grassTrailSeed);
        // Saturating: blades directly under a foot flatten hard without the
        // response running away and pushing them through the ground.
        float grassTrailResponse = 1.0 - exp(-3.4 * grassTrailCrush * grassTrailStiffness);
        // Alpha is contact recency, re-seeded for as long as a contact covers
        // the texel, so this rings hardest while a foot is working the grass
        // and dies away over the second or so after it lifts.
        float grassTrailWobble = 1.0 + uGrassTrailWobbleAmplitude * grassTrailSample.a *
          sin(uGrassTime * uGrassTrailWobbleFrequency + grassTrailSeed * 6.28318530718);
        float grassHabitatBend = mix(
          0.7,
          1.22,
          saturate((grassVerticalScale - 0.68) * 1.9)
        ) * (1.0 - instanceVariation.w * 0.48);
        float grassTrailAngle = clamp(
          uGrassTrailMaxAngle * uGrassTrailStrength * grassTrailResponse *
            grassTrailWobble * grassHabitatBend,
          0.0,
          1.48
        );
        // The angle grows towards the tip, so the blade curves instead of
        // tilting rigidly out of the ground.
        float grassTrailTheta = grassTrailAngle * pow(grassProgress, 0.85);
        float grassTrailSin = sin(grassTrailTheta);
        float grassTrailCos = cos(grassTrailTheta);
        vec3 grassTrailWorld = vec3(grassTrailDirection.x, 0.0, grassTrailDirection.y);
        vec2 grassTrailLocal = vec2(
          dot(grassTrailWorld, grassInstanceBasis[0] / grassHorizontalScale),
          dot(grassTrailWorld, grassInstanceBasis[2] / grassDepthScale)
        );
        // World height of this vertex is localY * verticalScale; a rotation by
        // theta moves it localY * verticalScale * sin(theta) horizontally and
        // leaves localY * cos(theta) of local height. Converting the horizontal
        // part back through the instance's own scales keeps non-uniformly
        // scaled blades correct.
        float grassTrailHeight = transformed.y;
        transformed.x += grassTrailLocal.x * grassTrailHeight * grassTrailSin *
          (grassVerticalScale / grassHorizontalScale);
        transformed.z += grassTrailLocal.y * grassTrailHeight * grassTrailSin *
          (grassVerticalScale / grassDepthScale);
        transformed.y *= grassTrailCos;
        vec3 grassTrailAxis = vec3(
          grassTrailLocal.y,
          0.0,
          -grassTrailLocal.x
        );
        float grassTrailAxisLength = length(grassTrailAxis);
        if (grassTrailAxisLength > 0.0001) {
          vec3 grassTrailAxisView = normalize(
            mat3(modelViewMatrix) * grassInstanceBasis *
              (grassTrailAxis / grassTrailAxisLength)
          );
          vNormal = normalize(grassRotateAroundAxis(
            vNormal,
            grassTrailAxisView,
            grassTrailSin,
            grassTrailCos
          ));
          grassBladePlaneNormalView = normalize(grassRotateAroundAxis(
            grassBladePlaneNormalView,
            grassTrailAxisView,
            grassTrailSin,
            grassTrailCos
          ));
        }
      }
    }
  }
`;

// Only the shading inputs cross to the fragment stage. The coverage and dither
// terms are consumed entirely by the keep test above, so passing them on would
// burn interpolators the fragment shader no longer reads.
const VERTEX_SHADING = `
vGrassProgress = grassProgress;
vGrassShade = mix(grassBladeShade, 0.5, (1.0 - grassMicroFade) * 0.86);
vGrassDryness = instanceVariation.w;
vGrassRootAo = instanceVariation.z;
vGrassBiome = instanceBiome;
vGrassGust = grassGustNoise;
`;

// Layers whose blades are a single triangle resolve the palette here instead.
// Three vertices is far fewer evaluations than the fragments they cover, and at
// that size the difference between interpolating the resolved colour and
// resolving an interpolated progress is well under a quantisation step. The
// segmented ultra-near blades, which are the ones actually large on screen, keep
// the per-fragment path.
// The biome row is an integer-valued per-instance attribute, so indexing the
// bounded palette arrays with it costs one uniform fetch and nothing else. The
// gust tip lift is applied here and in the impostor shader from the same
// uniform with the same formula: a crest that brightened mid blades but not the
// cards behind them would pulse against itself across the 44-64 m crossfade.
const VERTEX_PALETTE = `
int grassBiomeRow = grassResolveBiomeRow(instanceBiome);
// The palette is resolved at a progress lifted off the root, not at the raw
// attribute. A one-triangle blade only has progress 0 and 1 to offer, so the
// rasteriser draws a chord under a strongly concave curve; evaluating the root
// vertices slightly up the blade makes that chord carry the correct
// area-weighted mean. See GRASS_VERTEX_PALETTE_ROOT_PROGRESS. Only the palette
// argument is remapped: grassProgress itself still drives wind, taper, the gust
// tip lift below, and vGrassProgress for the fragment stage's backlight.
vec3 grassPaletteColor = grassResolvePalette(
  uGrassBiomeBase[grassBiomeRow],
  uGrassBiomeTip[grassBiomeRow],
  uGrassBiomeDry[grassBiomeRow],
  mix(${GRASS_VERTEX_PALETTE_ROOT_PROGRESS_GLSL}, 1.0, grassProgress),
  mix(grassBladeShade, 0.5, (1.0 - grassMicroFade) * 0.86),
  instanceVariation.w,
  instanceVariation.z,
  uGrassBiomeShade[grassBiomeRow].y,
  uGrassBiomeShade[grassBiomeRow].x
);
grassPaletteColor = mix(
  grassPaletteColor,
  uGrassBiomeTip[grassBiomeRow],
  grassGustNoise * uGrassGustTipBoost * grassProgress
);
vec3 grassBiomeCanopy = mix(
  uGrassBiomeCanopyHealthy[grassBiomeRow],
  uGrassBiomeCanopyDry[grassBiomeRow],
  instanceVariation.w
);
vGrassColor = mix(grassPaletteColor, grassBiomeCanopy, 1.0 - grassCoverage);
vGrassProgress = grassProgress;
vGrassDryness = instanceVariation.w;
`;

const VERTEX_PALETTE_DECLARATIONS = `
${BIOME_PALETTE_DECLARATIONS}
uniform vec3 uGrassBiomeCanopyHealthy[GRASS_MAX_BIOMES];
uniform vec3 uGrassBiomeCanopyDry[GRASS_MAX_BIOMES];
varying vec3 vGrassColor;
varying float vGrassProgress;
varying float vGrassDryness;
${GRASS_PALETTE_GLSL}
`;

const FRAGMENT_DECLARATIONS = `
${BIOME_PALETTE_DECLARATIONS}
uniform vec3 uGrassTipColor;
uniform float uGrassGustTipBoost;
uniform float uGrassAmbientBoost;
uniform float uGrassBacklightStrength;
uniform float uGrassSheenStrength;
uniform float uGrassSheenPower;
varying float vGrassProgress;
varying float vGrassShade;
varying float vGrassDryness;
varying float vGrassRootAo;
flat varying float vGrassBiome;
varying float vGrassGust;
varying vec2 vGrassSheen;
${GRASS_PALETTE_GLSL}
`;

/** Compiled in only where the character can reach; see GrassGroundShadow. */
const FRAGMENT_GROUND_SHADE_DECLARATIONS = `
varying float vGrassGroundShade;
`;

const FRAGMENT_GROUND_SHADE_APPLY = `
diffuseColor.rgb *= vGrassGroundShade;
`;

const VERTEX_PALETTE_FRAGMENT_DECLARATIONS = `
uniform vec3 uGrassTipColor;
uniform float uGrassAmbientBoost;
uniform float uGrassBacklightStrength;
uniform float uGrassSheenStrength;
uniform float uGrassSheenPower;
varying vec3 vGrassColor;
varying vec2 vGrassSheen;
varying float vGrassProgress;
varying float vGrassDryness;
`;

const VERTEX_PALETTE_FRAGMENT_COLOR = `
#include <color_fragment>
diffuseColor.rgb = vGrassColor;
GRASS_GROUND_SHADE_APPLY
reflectedLight.indirectDiffuse += diffuseColor.rgb * uGrassAmbientBoost;
`;

// No discard here. Every input to the keep test is constant across a blade
// (per-blade attributes, per-instance root distance, and uniforms), so the
// vertex stage already collapsed rejected blades to zero area and nothing
// reaching this point can fail the test. Keeping a discard in the shader would
// force late depth writes and disable early-Z for a layer whose whole cost is
// overdraw: near, mid, and single-blade grass all stack over the same pixels.
const FRAGMENT_COLOR = `
#include <color_fragment>
int grassBiomeRow = grassResolveBiomeRow(vGrassBiome);
diffuseColor.rgb = grassResolvePalette(
  uGrassBiomeBase[grassBiomeRow],
  uGrassBiomeTip[grassBiomeRow],
  uGrassBiomeDry[grassBiomeRow],
  vGrassProgress,
  vGrassShade,
  vGrassDryness,
  vGrassRootAo,
  uGrassBiomeShade[grassBiomeRow].y,
  uGrassBiomeShade[grassBiomeRow].x
);
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  uGrassBiomeTip[grassBiomeRow],
  vGrassGust * uGrassGustTipBoost * vGrassProgress
);
GRASS_GROUND_SHADE_APPLY
reflectedLight.indirectDiffuse += diffuseColor.rgb * uGrassAmbientBoost;
`;

const FRAGMENT_OUTPUT = `
float grassBackLight = 0.0;
vec3 grassSheen = vec3(0.0);
#if NUM_DIR_LIGHTS > 0
  vec3 grassViewDirection = normalize(vViewPosition);
  vec3 grassSunDirection = directionalLights[0].direction;
  // Transmission, not a rim. Light has to reach the camera through the blade,
  // so the sun must be behind it, the blade must be turned edge-on to the sun,
  // and a thin tip passes more of it than the thick base. The term this
  // replaces had only the first of those three and so lit every blade facing
  // the camera equally, which reads as a plastic outline rather than a leaf.
  float grassIntoSun = saturate(dot(-grassViewDirection, grassSunDirection));
  float grassThinness = 1.0 - abs(dot(normal, grassSunDirection));
  float grassRootAttenuation = smoothstep(0.12, 0.72, vGrassProgress);
  float grassViewFacing = saturate(dot(normal, grassViewDirection));
  float grassWetTransmission = mix(0.78, 1.14, 1.0 - vGrassDryness);
  grassBackLight = min(
    grassIntoSun * grassIntoSun * grassThinness * grassRootAttenuation *
      (0.35 + 0.65 * grassViewFacing) * vGrassSheen.y * grassWetTransmission,
    0.82
  );
GRASS_SHEEN_OUTPUT
#endif
vec3 grassLambertLight =
  reflectedLight.directDiffuse +
  reflectedLight.indirectDiffuse +
  totalEmissiveRadiance;
vec3 outgoingLight =
  mix(diffuseColor.rgb, grassLambertLight, ${GRASS_LIGHT_MIX_GLSL}) +
  mix(diffuseColor.rgb, uGrassTipColor, 0.35) *
    grassBackLight * uGrassBacklightStrength +
  grassSheen;
`;

const FRAGMENT_SHEEN_OUTPUT = `
  // Skip both the half-vector normalization and the high-power lobe once the
  // contribution has faded. This branch is coherent across distant quads.
  if (vGrassSheen.x > 0.001) {
    vec3 grassSunPlusView = grassSunDirection + grassViewDirection;
    vec3 grassHalfVector = length(grassSunPlusView) > 1e-4
      ? normalize(grassSunPlusView)
      : normal;
    grassSheen = directionalLights[0].color * (
      pow(saturate(dot(normal, grassHalfVector)), uGrassSheenPower) *
      uGrassSheenStrength * vGrassSheen.x *
      smoothstep(0.3, 0.92, vGrassProgress)
    );
  }
`;

const VERTEX_FLUTTER = `
    sin(
      dot(grassWorldRoot.xz, vec2(-grassWindDirection.y, grassWindDirection.x)) /
        (uGrassGustScale * 0.37) +
      uGrassTime * uGrassFlutterSpeed +
      grassMotionPhase * 6.28318530718
    ) * mix(0.72, 1.18, instanceVariation.w)
`;

/** Compile-time feature selection, resolved by the state owner. */
export interface GrassNearLegacyFeatures {
  interactive: boolean;
  worldLod: boolean;
  vertexPalette: boolean;
  subPixelWidth: boolean;
  sheen: boolean;
  noiseWind: boolean;
  microWind: boolean;
  instanceFreeDither: boolean;
  shapeVariation: boolean;
}

export function createGrassNearLegacyMaterial(
  uniforms: Record<string, THREE.IUniform>,
  options: GrassNearMaterialOptions,
  features: GrassNearLegacyFeatures,
): THREE.MeshLambertMaterial {
  const { worldLod, vertexPalette, subPixelWidth, sheen, noiseWind, microWind,
    instanceFreeDither, shapeVariation } = features;
  const legacy = new THREE.MeshLambertMaterial({
    side: THREE.DoubleSide,
    color: 0xffffff,
    transparent: false,
    depthWrite: true,
  });
  legacy.name = options.name;
  // Selected at compile time rather than branched on a uniform: this is the
  // hottest code in the scene and the choice never varies for a material.
  const keepLod = worldLod
    ? VERTEX_KEEP_WORLD_LOD
    : VERTEX_KEEP_THRESHOLD_LOD;
  legacy.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>${VERTEX_DECLARATIONS}${
          features.interactive ? VERTEX_TRAIL_DECLARATIONS : ""
        }${
          worldLod ? "" : VERTEX_THRESHOLD_DECLARATIONS
        }${
          subPixelWidth ? VERTEX_SUBPIXEL_DECLARATIONS : ""
        }${
          shapeVariation ? VERTEX_SHAPE_DECLARATIONS : ""
        }${
          noiseWind ? VERTEX_WIND_NOISE_DECLARATIONS : ""
        }${
          vertexPalette
            ? VERTEX_PALETTE_DECLARATIONS
            : VERTEX_SHADING_DECLARATIONS
        }`,
      )
      .replace(
        "#include <beginnormal_vertex>",
        `#include <beginnormal_vertex>${VERTEX_NORMAL}`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>${
          shapeVariation ? VERTEX_SHAPE : ""
        }${VERTEX_WIND.replace(
          "GRASS_KEEP_LOD",
          keepLod,
        )
          .replace(
            "GRASS_DITHER_INSTANCE_TERM",
            instanceFreeDither ? "" : "instanceVariation.x +",
          )
          .replace(
            "GRASS_GUST_NOISE",
            noiseWind ? VERTEX_GUST_NOISE : VERTEX_GUST_SINE,
          )
          .replace(
            "GRASS_FLUTTER_TERM",
            microWind ? VERTEX_FLUTTER : "0.0",
          )
          .replace(
            "GRASS_SHEEN_VARYING",
            sheen ? VERTEX_SHEEN_VARYING : VERTEX_NO_SHEEN_VARYING,
          )
          .replace(
            "GRASS_SUBPIXEL_WIDTH",
            subPixelWidth ? VERTEX_SUBPIXEL_WIDTH : "",
          )
          .replace(
            "GRASS_TRAIL_BEND",
            features.interactive ? VERTEX_TRAIL_BEND : "",
          )
          .replace(
            "GRASS_GROUND_SHADE_INIT",
            features.interactive ? "vGrassGroundShade = 1.0;" : "",
          )}${vertexPalette ? VERTEX_PALETTE : VERTEX_SHADING}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>${
          vertexPalette
            ? VERTEX_PALETTE_FRAGMENT_DECLARATIONS
            : FRAGMENT_DECLARATIONS
        }${features.interactive ? FRAGMENT_GROUND_SHADE_DECLARATIONS : ""}`,
      )
      .replace(
        "#include <color_fragment>",
        (vertexPalette
          ? VERTEX_PALETTE_FRAGMENT_COLOR
          : FRAGMENT_COLOR
        ).replace(
          "GRASS_GROUND_SHADE_APPLY",
          features.interactive ? FRAGMENT_GROUND_SHADE_APPLY : "",
        ),
      )
      .replace(
        "vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;",
        FRAGMENT_OUTPUT.replace(
          "GRASS_SHEEN_OUTPUT",
          sheen ? FRAGMENT_SHEEN_OUTPUT : "",
        ),
      );
  };
  legacy.customProgramCacheKey = () => options.cacheKey;
return legacy;
}
