import { GRASS_SHAPE_BEND_FRACTION } from "../../world/grass/GrassRuntimeMath";
import type { GUI } from "dat.gui";
import * as THREE from "three";
import type {
  GrassLodConfig,
  GrassMaterialConfig,
  GrassWindConfig,
} from "../GrassConfig";
import type { GrassArtDirection } from "../GrassArtDirection";
import {
  GRASS_GUST_TIP_BOOST,
  GRASS_MID_DENSITY_FALLOFF,
} from "../GrassLodTuning";
import { grassGroundShadow } from "../interaction/GrassGroundShadow";
import { grassTrailField } from "../interaction/GrassTrailField";
import {
  GRASS_GUST_FRONT_SCALE,
  GRASS_GUST_FRONT_SPEED,
  GRASS_WIND_NOISE_SCALE,
  GRASS_WIND_NOISE_SPEED,
  grassCompactGustGlsl,
  grassTuftWindPhaseGlsl,
  grassWeatherEnvelopeGlsl,
} from "../wind/WindNoiseTexture";
import {
  GRASS_LIGHT_MIX_GLSL,
  GRASS_PALETTE_GLSL,
  GRASS_VERTEX_PALETTE_ROOT_PROGRESS_GLSL,
  setBalancedGrassPaletteColors,
  setGrassCanopyColors,
} from "./GrassPaletteShader";
import {
  GRASS_BIOME_PROFILES,
  GRASS_MAX_BIOMES,
} from "../biome/GrassBiomeProfile";

const DEFAULT_TRAIL_MAX_ANGLE = 1.29;
const DEFAULT_TRAIL_WOBBLE_FREQUENCY = 12;
const DEFAULT_TRAIL_WOBBLE_AMPLITUDE = 0.16;

/** How far the normal tilts towards each edge of the blade's trough. */
const DEFAULT_BLADE_CURVATURE = 0.55;
const DEFAULT_SHEEN_STRENGTH = 0.035;
const DEFAULT_SHEEN_POWER = 42;
const DEFAULT_SHEEN_FADE_DISTANCE = 18;

/** How far a lull drops the bend. The envelope only ever scales it down. */
const DEFAULT_GUST_FRONT_DEPTH = 0.55;
/**
 * World size of one device pixel per metre of camera distance,
 * `2 * tan(fov / 2) / drawingBufferHeight`. Replaced on the first resize; the
 * default matches a 60-degree vertical field of view at 1080 device pixels.
 */
const DEFAULT_PIXEL_WORLD_SCALE = 0.00107;
const MINIMUM_BLADE_PIXEL_WIDTH = 1.15;
/**
 * Ceiling on the widened half-width. The single-blade bounds reserve a safety
 * margin an order larger than a blade's own half-width, and this stays inside
 * it so a widened blade cannot leave the bound its tile is culled against.
 */
/**
 * Ceiling on the widened half-width, as a multiple of the source blade's own
 * half-width and as an absolute backstop.
 *
 * This used to be a bare 0.02 m. Nothing tied it to the configured blade width,
 * so when the blades were widened to 0.026/0.058 the source half-width (0.021)
 * rose *above* the ceiling and `max(source, min(target, ceiling))` collapsed to
 * `source`: the sub-pixel clamp silently stopped doing anything at all, taking
 * both the anti-sparkle widening and the mid layer's density-falloff coverage
 * payback with it. Deriving it from the half-width keeps the two in step.
 *
 * The absolute backstop is what the reserved bounds depend on: the widening
 * grows a blade's half-extent by at most `ABSOLUTE - halfWidth < ABSOLUTE`,
 * which stays inside `BOUNDS_SAFETY_MARGIN` (0.08) for any blade configuration.
 */
const MAXIMUM_BLADE_WIDEN_RATIO = 3;
const MAXIMUM_BLADE_WIDEN_METRES = 0.06;

/**
 * Distance band over which the mid layer thins its blades, for materials that
 * are never handed a configured one. Kept in step with the shipped schedule.
 */
const DEFAULT_DENSITY_FALLOFF_START = GRASS_MID_DENSITY_FALLOFF.start;
const DEFAULT_DENSITY_FALLOFF_END = GRASS_MID_DENSITY_FALLOFF.end;


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

/**
 * Per-material constants. These used to be written per mesh from
 * `onBeforeRender`, but three only uploads a material's custom uniforms on the
 * first draw of each contiguous same-material run (see `refreshMaterial` in
 * WebGLRenderer), and its opaque sort groups by `material.id` before depth. The
 * result was that every mesh sharing a material silently inherited the first
 * one's values. Anything that genuinely varies per mesh now lives in the
 * per-instance buffers instead; anything constant for a layer lives here.
 */
export interface GrassNearMaterialOptions {
  name: string;
  /** Distinct per option set, otherwise three reuses a cached program. */
  cacheKey: string;
  /** Mid layers keep the blades the near layer drops. */
  invertLodCoverage?: boolean;
  windLodScale?: number;
  /** 0 = no detail split, 1 = outside the detail radius, 2 = inside it. */
  detailMode?: number;
  /** Decorrelates the LOD dither between layers. */
  ditherSeed?: number;
  /**
   * Resolve LOD coverage per blade from its world-space camera distance
   * (default). The island regression scene instead drives one scene-wide
   * threshold, because its camera frames the whole object at a distance well
   * past the configured near and mid fades.
   */
  worldLod?: boolean;
  /**
   * Resolve the grass palette per vertex instead of per fragment. Only safe for
   * layers whose blades are a single triangle: with three vertices the colour
   * interpolates across a handful of pixels, but a segmented blade filling the
   * screen would visibly band.
   */
  vertexPalette?: boolean;
  /**
   * Sample the character's grass trail and bend blades into it. Only layers the
   * character can physically reach need this; for everything else the sampling
   * and the bend are compiled out entirely rather than branched over at
   * runtime, which is what the mid layer used to pay for on every blade.
   */
  interactive?: boolean;
  /**
   * Widen blades that project to less than a pixel, and pay the coverage back
   * in colour. Only the layer that owns the band where blades go sub-pixel
   * needs it; nearer layers never trigger the clamp and would pay for the test,
   * and the mid patches past it are already a different representation.
   */
  subPixelWidth?: boolean;
  /** Compile the close-range waxy highlight; distant mid grass disables it. */
  sheen?: boolean;
  /**
   * Drop `instanceVariation.x` from the LOD dither so the whole key is known at
   * geometry-build time. Only the mid layer needs it, and only because its
   * per-batch draw truncation has to reproduce the shader's keep set exactly on
   * the CPU. Per-blade shade and phase already decorrelate neighbours; the
   * instance term only decorrelated whole patches, which the material's own
   * dither seed does anyway.
   */
  instanceFreeDither?: boolean;
  /**
   * Give every instance its own silhouette from `instanceShape`.
   *
   * Compile-time so only the world's near layers pay for it: the mid and far
   * populations draw a few pixels each and the island regression scene has one
   * source clump, so both keep the plain source blade.
   */
  shapeVariation?: boolean;
  /**
   * Sample the shared scrolling wind-noise field instead of the sine gust
   * front. Costs one vertex texture fetch; compact profiles compile the sine.
   */
  noiseWind?: boolean;
  /**
   * Compile per-blade tip flutter. Mid and compact layers omit it: flutter is
   * only readable inside a few metres, and compact pays the same meadow with
   * less micro-motion rather than a different wind.
   */
  microWind?: boolean;
}

const VERTEX_FLUTTER = `
    sin(
      dot(grassWorldRoot.xz, vec2(-grassWindDirection.y, grassWindDirection.x)) /
        (uGrassGustScale * 0.37) +
      uGrassTime * uGrassFlutterSpeed +
      grassMotionPhase * 6.28318530718
    ) * mix(0.72, 1.18, instanceVariation.w)
`;

function createBiomeColorRows(color: THREE.ColorRepresentation): THREE.Color[] {
  return Array.from(
    { length: GRASS_MAX_BIOMES },
    () => new THREE.Color(color),
  );
}

function createBiomeShadeRows(
  rootDarkening: number,
  tipColorStrength: number,
): THREE.Vector2[] {
  return Array.from(
    { length: GRASS_MAX_BIOMES },
    () => new THREE.Vector2(rootDarkening, tipColorStrength),
  );
}

export class GrassNearMaterial {
  readonly material: THREE.MeshLambertMaterial;

  private readonly colorControls = {
    baseColor: "#273f22",
    tipColor: "#83a96b",
    dryColor: "#a8a06a",
  };

  private nearNormalUpScale = 1;
  private readonly uniforms = {
    uGrassTime: { value: 0 },
    /** Tip drift, in source root half-widths. See setShapeTipDrift. */
    uGrassShapeTipDrift: { value: 0 },
    uGrassWindDirection: { value: new THREE.Vector2(0.8, 0.35).normalize() },
    uGrassWindStrength: { value: 0.14 },
    uGrassGustScale: { value: 0.08 },
    uGrassGustSpeed: { value: 0.65 },
    uGrassFlutterStrength: { value: 0.035 },
    uGrassFlutterSpeed: { value: 3.4 },
    // Row 0 mirrors the active art direction; rows 1..n come from the biome
    // profiles. Every shader indexes these with the per-instance biome row, so
    // adding a biome costs one uniform row and zero draw calls.
    uGrassBiomeBase: {
      value: createBiomeColorRows(this.colorControls.baseColor),
    },
    uGrassBiomeTip: {
      value: createBiomeColorRows(this.colorControls.tipColor),
    },
    uGrassBiomeDry: {
      value: createBiomeColorRows(this.colorControls.dryColor),
    },
    uGrassBiomeShade: { value: createBiomeShadeRows(0.55, 0.5) },
    uGrassBiomeCanopyHealthy: {
      value: createBiomeColorRows(this.colorControls.baseColor),
    },
    uGrassBiomeCanopyDry: {
      value: createBiomeColorRows(this.colorControls.dryColor),
    },
    // Backlight tint only. The transmission term is a fraction of a fraction,
    // so it reads the art direction's tip colour rather than spending three
    // more varyings to carry a per-biome one into the fragment stage.
    uGrassTipColor: { value: new THREE.Color(this.colorControls.tipColor) },
    /**
     * (near, far) flattening of the blade normal toward world up.
     *
     * The far entry is the authored preset value and must equal the impostor
     * material's own flattening; the near entry is that scaled down, so a
     * preset still carries one number and the schedule between them is a
     * config lever rather than a second art decision.
     */
    uGrassNormalUpRange: { value: new THREE.Vector2(0.45, 0.45) },
    uGrassAmbientBoost: { value: 0.12 },
    uGrassBacklightStrength: { value: 0.16 },
    uGrassLodInvert: { value: 0 },
    uGrassLodThreshold: { value: 1 },
    uGrassDistanceFade: { value: 1 },
    uGrassDitherSeed: { value: 0 },
    uGrassWindLodScale: { value: 1 },
    uGrassMicroFadeRange: { value: new THREE.Vector2(3, 10) },
    uGrassNearDistance: { value: 0 },
    uGrassMidDistance: { value: 0 },
    uGrassTransitionDistance: { value: 1 },
    uGrassDetailMode: { value: 0 },
    uGrassDetailNearDistance: { value: 0 },
    uGrassDetailTransitionDistance: { value: 1 },
    uGrassArtDensityScale: { value: 1 },
    uGrassBladeCurvature: { value: DEFAULT_BLADE_CURVATURE },
    uGrassSheenStrength: { value: DEFAULT_SHEEN_STRENGTH },
    uGrassSheenPower: { value: DEFAULT_SHEEN_POWER },
    uGrassSheenFadeDistance: { value: DEFAULT_SHEEN_FADE_DISTANCE },
    uGrassGustFrontScale: { value: GRASS_GUST_FRONT_SCALE },
    uGrassGustFrontSpeed: { value: GRASS_GUST_FRONT_SPEED },
    uGrassGustFrontDepth: { value: DEFAULT_GUST_FRONT_DEPTH },
    uGrassGustTipBoost: { value: GRASS_GUST_TIP_BOOST },
    uGrassWindNoise: { value: null as THREE.Texture | null },
    uGrassWindNoiseScale: { value: GRASS_WIND_NOISE_SCALE },
    uGrassWindNoiseSpeed: { value: GRASS_WIND_NOISE_SPEED },
    uGrassDensityFalloffStart: { value: DEFAULT_DENSITY_FALLOFF_START },
    uGrassDensityFalloffEnd: { value: DEFAULT_DENSITY_FALLOFF_END },
    // 1 disables the falloff entirely; only the mid material lowers it.
    uGrassDensityFloor: { value: 1 },
    uGrassLodDensityScale: { value: 1 },
    uGrassPixelWorldScale: { value: DEFAULT_PIXEL_WORLD_SCALE },
    uGrassMinPixelWidth: { value: MINIMUM_BLADE_PIXEL_WIDTH },
    uGrassBladeHalfWidth: { value: 0.017 },
    uGrassMaxWidenDistance: { value: MAXIMUM_BLADE_WIDEN_METRES },
    uGrassTrailMap: { value: null as THREE.Texture | null },
    uGrassTrailCenter: { value: new THREE.Vector2() },
    uGrassTrailInverseCoverage: { value: 1 },
    uGrassTrailStrength: { value: 0 },
    uGrassTrailMaxAngle: { value: DEFAULT_TRAIL_MAX_ANGLE },
    uGrassTrailWobbleFrequency: { value: DEFAULT_TRAIL_WOBBLE_FREQUENCY },
    uGrassTrailWobbleAmplitude: { value: DEFAULT_TRAIL_WOBBLE_AMPLITUDE },
    uGrassGroundShadowDisc: { value: new THREE.Vector4(0, 0, 0, 1) },
    uGrassGroundShadowStrength: { value: 0 },
  };
  private readonly interactive: boolean;
  private baseWindStrength = 0.14;
  private baseFlutterStrength = 0.035;
  /** Biome row 0's shade controls; every art preset writes them. */
  private artRootDarkening = 0.55;
  private artTipColorStrength = 0.5;

  constructor(options: GrassNearMaterialOptions) {
    this.interactive = options.interactive === true;
    this.uniforms.uGrassLodInvert.value = options.invertLodCoverage ? 1 : 0;
    this.uniforms.uGrassWindLodScale.value = options.windLodScale ?? 1;
    this.uniforms.uGrassDetailMode.value = options.detailMode ?? 0;
    this.uniforms.uGrassDitherSeed.value =
      (options.ditherSeed ?? 0) / 4294967296;
    this.setPaletteColors();
    this.material = new THREE.MeshLambertMaterial({
      side: THREE.DoubleSide,
      color: 0xffffff,
      transparent: false,
      depthWrite: true,
    });
    this.material.name = options.name;
    const vertexPalette = options.vertexPalette === true;
    const worldLod = options.worldLod !== false;
    const subPixelWidth = options.subPixelWidth === true;
    const sheen = options.sheen !== false;
    const noiseWind = options.noiseWind === true;
    const microWind = options.microWind !== false;
    const instanceFreeDither = options.instanceFreeDither === true;
    const shapeVariation = options.shapeVariation === true;
    // Selected at compile time rather than branched on a uniform: this is the
    // hottest code in the scene and the choice never varies for a material.
    const keepLod = worldLod
      ? VERTEX_KEEP_WORLD_LOD
      : VERTEX_KEEP_THRESHOLD_LOD;
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>${VERTEX_DECLARATIONS}${
            this.interactive ? VERTEX_TRAIL_DECLARATIONS : ""
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
              this.interactive ? VERTEX_TRAIL_BEND : "",
            )
            .replace(
              "GRASS_GROUND_SHADE_INIT",
              this.interactive ? "vGrassGroundShade = 1.0;" : "",
            )}${vertexPalette ? VERTEX_PALETTE : VERTEX_SHADING}`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>${
            vertexPalette
              ? VERTEX_PALETTE_FRAGMENT_DECLARATIONS
              : FRAGMENT_DECLARATIONS
          }${this.interactive ? FRAGMENT_GROUND_SHADE_DECLARATIONS : ""}`,
        )
        .replace(
          "#include <color_fragment>",
          (vertexPalette
            ? VERTEX_PALETTE_FRAGMENT_COLOR
            : FRAGMENT_COLOR
          ).replace(
            "GRASS_GROUND_SHADE_APPLY",
            this.interactive ? FRAGMENT_GROUND_SHADE_APPLY : "",
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
    this.material.customProgramCacheKey = () => options.cacheKey;
  }

  configure(material: GrassMaterialConfig, wind: GrassWindConfig): void {
    this.colorControls.baseColor = material.baseColor;
    this.colorControls.tipColor = material.tipColor;
    this.colorControls.dryColor = material.dryColor;
    this.artRootDarkening = material.rootDarkening;
    this.setPaletteColors();
    this.setNormalUp(material.normalUp);
    this.uniforms.uGrassAmbientBoost.value = material.ambientBoost;
    this.uniforms.uGrassBacklightStrength.value = material.backlightStrength;
    this.uniforms.uGrassWindDirection.value
      .set(wind.directionX, wind.directionZ)
      .normalize();
    this.baseWindStrength = wind.strength;
    this.baseFlutterStrength = wind.flutterStrength;
    this.uniforms.uGrassWindStrength.value = wind.strength;
    this.uniforms.uGrassGustScale.value = wind.gustScale;
    this.uniforms.uGrassGustSpeed.value = wind.gustSpeed;
    this.uniforms.uGrassFlutterStrength.value = wind.flutterStrength;
    this.uniforms.uGrassFlutterSpeed.value = wind.flutterSpeed;
  }

  applyArtDirection(direction: GrassArtDirection): void {
    this.colorControls.baseColor = direction.baseColor;
    this.colorControls.tipColor = direction.tipColor;
    this.colorControls.dryColor = direction.dryColor;
    this.artRootDarkening = direction.rootDarkening;
    this.artTipColorStrength = direction.tipColorStrength;
    this.setPaletteColors();
    this.setNormalUp(direction.normalUp);
    this.uniforms.uGrassAmbientBoost.value = direction.ambientBoost;
    this.uniforms.uGrassBacklightStrength.value = direction.backlightStrength;
    this.uniforms.uGrassArtDensityScale.value = direction.densityScale;
    this.uniforms.uGrassWindStrength.value =
      this.baseWindStrength * direction.windStrengthScale;
    this.uniforms.uGrassFlutterStrength.value =
      this.baseFlutterStrength * direction.flutterStrengthScale;
    this.configureGust(
      direction.gustDepth ?? DEFAULT_GUST_FRONT_DEPTH,
      direction.gustTipBoost ?? GRASS_GUST_TIP_BOOST,
    );
    // The specular lobe is gone before the near band hands over to the mid
    // patches, which do not carry one. Tying the fade to the preset's own near
    // distance keeps that true for every preset.
    this.uniforms.uGrassSheenFadeDistance.value = direction.nearDistance;
  }

  /**
   * World size of one device pixel per metre of camera distance. Only the
   * sub-pixel width clamp reads it, and only for the layer compiled with it.
   */
  setViewportPixelScale(pixelWorldScale: number): void {
    if (Number.isFinite(pixelWorldScale) && pixelWorldScale > 0) {
      this.uniforms.uGrassPixelWorldScale.value = pixelWorldScale;
    }
  }

  /** Half-width of the source blade the sub-pixel clamp is widening. */
  setBladeHalfWidth(halfWidth: number): void {
    const resolved = Math.max(halfWidth, 0.0001);
    this.uniforms.uGrassBladeHalfWidth.value = resolved;
    // The ceiling has to move with the blade, or a wider blade configuration
    // pushes the source half-width past it and disables the clamp entirely.
    this.uniforms.uGrassMaxWidenDistance.value = Math.min(
      resolved * MAXIMUM_BLADE_WIDEN_RATIO,
      MAXIMUM_BLADE_WIDEN_METRES,
    );
  }

  /**
   * The `uGrassDitherSeed` value the vertex shader adds when deriving a blade's
   * LOD dither. Callers that want to predict the shader's keep decision on the
   * CPU need it.
   */
  getDitherSeed(): number {
    return this.uniforms.uGrassDitherSeed.value;
  }

  /**
   * Sets both ends of the flattening schedule from one authored value.
   *
   * A preset carries a single `normalUp`, which is the *far* end: the value a
   * card at range needs to stay stable. The near end is that scaled by
   * `grassNearNormalUpScale`, so blades close to the camera keep enough of
   * their real normal to be lit by facing rather than only by colour.
   */
  private setNormalUp(farNormalUp: number): void {
    const range = this.uniforms.uGrassNormalUpRange.value as THREE.Vector2;
    range.y = farNormalUp;
    range.x = farNormalUp * this.nearNormalUpScale;
  }

  /** Configured by the world; 1 restores the old single-value behaviour. */
  /**
   * How far a blade's apex may fall sideways, in source root half-widths.
   *
   * Set from configuration on every near layer at once — the layers share
   * placement data, so a blade drawn by two of them has to be the same shape in
   * both or it doubles rather than blends.
   */
  setShapeTipDrift(drift: number): void {
    this.uniforms.uGrassShapeTipDrift.value = Math.max(0, drift);
  }

  setNearNormalUpScale(scale: number): void {
    this.nearNormalUpScale = Number.isFinite(scale)
      ? Math.min(1, Math.max(0, scale))
      : 1;
    this.setNormalUp(
      (this.uniforms.uGrassNormalUpRange.value as THREE.Vector2).y,
    );
  }

  /** Threshold-LOD materials only; ignored when coverage is resolved per blade. */
  setLodThreshold(threshold: number, distanceFade = 1): void {
    this.uniforms.uGrassLodThreshold.value = threshold;
    this.uniforms.uGrassDistanceFade.value = distanceFade;
  }

  /**
   * The world-space range over which a blade stops being shaded as an individual
   * leaf. Every near and mid material must be given the same two numbers: this is
   * what keeps a blade's brightness a function of where it is rather than of
   * which layer drew it. `verify-lod-continuity` re-checks that.
   */
  setMicroDetailFadeRange(start: number, end: number): void {
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
      throw new Error(
        "The grass micro-detail fade range must be a finite increasing interval.",
      );
    }
    (this.uniforms.uGrassMicroFadeRange.value as THREE.Vector2).set(start, end);
  }

  configureLod(config: GrassLodConfig): void {
    this.uniforms.uGrassNearDistance.value = config.nearMaxDistance;
    this.uniforms.uGrassMidDistance.value = config.midMaxDistance;
    this.uniforms.uGrassTransitionDistance.value = config.transitionDistance;
  }

  configureDetailLod(config: GrassLodConfig): void {
    this.uniforms.uGrassDetailNearDistance.value = config.nearMaxDistance;
    this.uniforms.uGrassDetailTransitionDistance.value =
      config.transitionDistance;
  }

  update(elapsedSeconds: number): void {
    this.uniforms.uGrassTime.value = elapsedSeconds;
    if (!this.interactive) {
      return;
    }
    if (grassGroundShadow.isEnabled()) {
      (this.uniforms.uGrassGroundShadowDisc.value as THREE.Vector4).copy(
        grassGroundShadow.disc,
      );
      this.uniforms.uGrassGroundShadowStrength.value =
        grassGroundShadow.strength;
    } else {
      this.uniforms.uGrassGroundShadowStrength.value = 0;
    }
    if (!grassTrailField.isEnabled()) {
      this.uniforms.uGrassTrailStrength.value = 0;
      return;
    }
    this.uniforms.uGrassTrailMap.value = grassTrailField.getTexture();
    this.uniforms.uGrassTrailCenter.value.copy(grassTrailField.getCenter());
    this.uniforms.uGrassTrailInverseCoverage.value =
      grassTrailField.getInverseCoverage();
    this.uniforms.uGrassTrailStrength.value = 1;
  }

  /** Bend shape for the character trail; supplied from the world config. */
  configureTrail(config: {
    maxAngleRadians: number;
    wobbleFrequency: number;
    wobbleAmplitude: number;
  }): void {
    this.uniforms.uGrassTrailMaxAngle.value = config.maxAngleRadians;
    this.uniforms.uGrassTrailWobbleFrequency.value = config.wobbleFrequency;
    this.uniforms.uGrassTrailWobbleAmplitude.value = config.wobbleAmplitude;
  }

  /**
   * Fills every biome palette row.
   *
   * Row 0 is always the active art direction, so a world running one biome is
   * byte-identical to one built before biomes existed and preset switching
   * keeps working. Rows whose profile owns a palette get their own colours put
   * through the same luminance balancer, which is what keeps brightness
   * compatible across biomes the way it already is across presets.
   */
  private setPaletteColors(): void {
    const base = this.uniforms.uGrassBiomeBase.value;
    const tip = this.uniforms.uGrassBiomeTip.value;
    const dry = this.uniforms.uGrassBiomeDry.value;
    const shade = this.uniforms.uGrassBiomeShade.value;
    const canopyHealthy = this.uniforms.uGrassBiomeCanopyHealthy.value;
    const canopyDry = this.uniforms.uGrassBiomeCanopyDry.value;
    setBalancedGrassPaletteColors(
      base[0],
      tip[0],
      dry[0],
      this.colorControls.baseColor,
      this.colorControls.tipColor,
      this.colorControls.dryColor,
    );
    shade[0].set(this.artRootDarkening, this.artTipColorStrength);
    this.uniforms.uGrassTipColor.value.copy(tip[0]);
    setGrassCanopyColors(
      canopyHealthy[0],
      canopyDry[0],
      this.colorControls.baseColor,
      this.colorControls.tipColor,
      this.colorControls.dryColor,
      this.artRootDarkening,
      this.artTipColorStrength,
    );

    for (let row = 1; row < GRASS_MAX_BIOMES; row += 1) {
      const profile = GRASS_BIOME_PROFILES[row];
      if (!profile || profile.paletteSource === "art") {
        base[row].copy(base[0]);
        tip[row].copy(tip[0]);
        dry[row].copy(dry[0]);
        shade[row].copy(shade[0]);
        canopyHealthy[row].copy(canopyHealthy[0]);
        canopyDry[row].copy(canopyDry[0]);
        continue;
      }
      setBalancedGrassPaletteColors(
        base[row],
        tip[row],
        dry[row],
        profile.baseColor,
        profile.tipColor,
        profile.dryColor,
      );
      shade[row].set(profile.rootDarkening, profile.tipColorStrength);
      setGrassCanopyColors(
        canopyHealthy[row],
        canopyDry[row],
        profile.baseColor,
        profile.tipColor,
        profile.dryColor,
        profile.rootDarkening,
        profile.tipColorStrength,
      );
    }
  }

  /**
   * The scrolling gust field. Every grass material and every impostor material
   * is given the same texture, scale, and speed; that shared field is what makes
   * near blades, mid blades, and far cards bend as one wind instead of three.
   */
  setWindNoise(texture: THREE.Texture, scale: number, speed: number): void {
    this.uniforms.uGrassWindNoise.value = texture;
    this.uniforms.uGrassWindNoiseScale.value = scale;
    this.uniforms.uGrassWindNoiseSpeed.value = speed;
  }

  /**
   * Distance thinning for the mid layer: `floor` is the fraction of blades
   * still drawn at `end` metres. The CPU draw truncation reproduces this exact
   * curve, so both must be changed through here.
   */
  configureDensityFalloff(start: number, end: number, floor: number): void {
    this.uniforms.uGrassDensityFalloffStart.value = start;
    this.uniforms.uGrassDensityFalloffEnd.value = end;
    this.uniforms.uGrassDensityFloor.value = floor;
  }

  getDensityFalloff(): { start: number; end: number; floor: number } {
    return {
      start: this.uniforms.uGrassDensityFalloffStart.value,
      end: this.uniforms.uGrassDensityFalloffEnd.value,
      floor: this.uniforms.uGrassDensityFloor.value,
    };
  }

  /**
   * Global density multiplier owned by the quality governor. It scales the LOD
   * keep threshold — the same key the instance buffers are sorted by — so the
   * CPU prefix trims can fold it in exactly and a lowered tier saves submitted
   * vertices, not just shaded ones.
   */
  setLodDensityScale(scale: number): void {
    this.uniforms.uGrassLodDensityScale.value = THREE.MathUtils.clamp(
      scale,
      0.05,
      1,
    );
  }

  getLodDensityScale(): number {
    return this.uniforms.uGrassLodDensityScale.value;
  }

  /** Gust depth and the tip lift a crest carries, both preset-exposed. */
  configureGust(depth: number, tipBoost: number): void {
    this.uniforms.uGrassGustFrontDepth.value = depth;
    this.uniforms.uGrassGustTipBoost.value = tipBoost;
  }

  setSheenEnabled(enabled: boolean): void {
    this.uniforms.uGrassSheenStrength.value = enabled
      ? DEFAULT_SHEEN_STRENGTH
      : 0;
  }

  setupGUI(
    gui: GUI,
    linkedMaterials: readonly GrassNearMaterial[] = [],
  ): void {
    const materials = [this, ...linkedMaterials];
    const folder = gui.addFolder("Grass Props");
    folder.addColor(this.colorControls, "baseColor").onChange((value: string) => {
      for (const material of materials) {
        material.colorControls.baseColor = value;
        material.setPaletteColors();
      }
    });
    folder.addColor(this.colorControls, "tipColor").onChange((value: string) => {
      for (const material of materials) {
        material.colorControls.tipColor = value;
        material.setPaletteColors();
      }
    });
    folder.addColor(this.colorControls, "dryColor").onChange((value: string) => {
      for (const material of materials) {
        material.colorControls.dryColor = value;
        material.setPaletteColors();
      }
    });
    const tipMixControl = { value: this.artTipColorStrength };
    folder
      .add(tipMixControl, "value", 0.15, 0.75, 0.01)
      .name("Tip Mix")
      .onChange((value: number) => {
        for (const material of materials) {
          material.artTipColorStrength = value;
          material.setPaletteColors();
        }
      });
    folder
      .add(this.uniforms.uGrassWindStrength, "value", 0, 0.45, 0.005)
      .name("Wind Strength")
      .onChange((value: number) => {
        for (const material of linkedMaterials) {
          material.uniforms.uGrassWindStrength.value = value;
        }
      });
    folder
      .add(this.uniforms.uGrassFlutterStrength, "value", 0, 0.15, 0.0025)
      .name("Tip Flutter")
      .onChange((value: number) => {
        for (const material of linkedMaterials) {
          material.uniforms.uGrassFlutterStrength.value = value;
        }
      });
    folder
      .add(
        this.uniforms.uGrassNormalUpRange.value as THREE.Vector2,
        "y",
        0,
        0.9,
        0.01,
      )
      .name("Normal Up (far)")
      .onChange((value: number) => {
        for (const material of linkedMaterials) {
          const range = material.uniforms.uGrassNormalUpRange
            .value as THREE.Vector2;
          range.y = value;
          range.x = value * this.nearNormalUpScale;
        }
      });
    folder
      .add(this.uniforms.uGrassAmbientBoost, "value", 0, 0.4, 0.01)
      .name("Ambient Boost")
      .onChange((value: number) => {
        for (const material of linkedMaterials) {
          material.uniforms.uGrassAmbientBoost.value = value;
        }
      });
    folder
      .add(this.uniforms.uGrassBacklightStrength, "value", 0, 0.5, 0.01)
      .name("Backlight")
      .onChange((value: number) => {
        for (const material of linkedMaterials) {
          material.uniforms.uGrassBacklightStrength.value = value;
        }
      });
    folder
      .add(this.uniforms.uGrassBladeCurvature, "value", 0, 1.2, 0.01)
      .name("Blade Curve")
      .onChange((value: number) => {
        for (const material of linkedMaterials) {
          material.uniforms.uGrassBladeCurvature.value = value;
        }
      });
    folder
      .add(this.uniforms.uGrassSheenStrength, "value", 0, 0.3, 0.005)
      .name("Sheen")
      .onChange((value: number) => {
        for (const material of linkedMaterials) {
          material.uniforms.uGrassSheenStrength.value = value;
        }
      });
    folder
      .add(this.uniforms.uGrassSheenPower, "value", 8, 96, 1)
      .name("Sheen Focus")
      .onChange((value: number) => {
        for (const material of linkedMaterials) {
          material.uniforms.uGrassSheenPower.value = value;
        }
      });
    folder
      .add(this.uniforms.uGrassGustFrontDepth, "value", 0, 0.9, 0.01)
      .name("Gust Fronts")
      .onChange((value: number) => {
        for (const material of linkedMaterials) {
          material.uniforms.uGrassGustFrontDepth.value = value;
        }
      });
    folder
      .add(this.uniforms.uGrassGustFrontSpeed, "value", 0, 1.6, 0.01)
      .name("Gust Speed")
      .onChange((value: number) => {
        for (const material of linkedMaterials) {
          material.uniforms.uGrassGustFrontSpeed.value = value;
        }
      });
    folder.open();
  }
}
