import * as THREE from "three";
import tuning from "./GrassPaletteTuning.json";

const GRASS_LUMINANCE_WEIGHTS = new THREE.Vector3(0.2126, 0.7152, 0.0722);

function toGlslFloat(value: number): string {
  if (!Number.isFinite(value)) {
    throw new TypeError("Grass palette GLSL values must be finite.");
  }
  return Number.isInteger(value) ? `${value}.0` : String(value);
}

function luminance(color: THREE.Color): number {
  return (
    color.r * GRASS_LUMINANCE_WEIGHTS.x +
    color.g * GRASS_LUMINANCE_WEIGHTS.y +
    color.b * GRASS_LUMINANCE_WEIGHTS.z
  );
}

const desaturationScratch = new THREE.Color();
let paletteDesaturation = 0;

/**
 * How far every grass palette colour is pulled toward its own luminance.
 *
 * Set once at bootstrap from `config.grassPaletteDesaturation`. Module state
 * rather than a parameter because the palette sources are resolved from a dozen
 * call sites — near blades, mid blades, impostor rows, the terrain's grass tint
 * — and a lever that reached only some of them would break LOD colour parity,
 * which is exactly the failure it is meant to avoid.
 */
export function setGrassPaletteDesaturation(amount: number): void {
  paletteDesaturation = Number.isFinite(amount)
    ? Math.min(Math.max(amount, 0), 1)
    : 0;
}

export function getGrassPaletteDesaturation(): number {
  return paletteDesaturation;
}

/**
 * Pulls a palette colour toward its own luminance.
 *
 * The blend runs toward the colour's own luminance, so it cannot move the
 * field's brightness — which is what lets one art lever change every LOD at once
 * without moving the near/mid/far parity budget. Applied after luminance
 * balancing for the same reason: balancing is a ratio between the three sources,
 * and desaturation preserves each one's luminance, so the two commute.
 */
export function applyGrassPaletteDesaturation(
  color: THREE.Color,
  amount = paletteDesaturation,
): void {
  if (!(amount > 0)) {
    return;
  }
  const value = luminance(color);
  desaturationScratch.setRGB(value, value, value);
  color.lerp(desaturationScratch, Math.min(amount, 1));
}

export function setBalancedGrassPaletteColors(
  baseTarget: THREE.Color,
  tipTarget: THREE.Color,
  dryTarget: THREE.Color,
  baseColor: THREE.ColorRepresentation,
  tipColor: THREE.ColorRepresentation,
  dryColor: THREE.ColorRepresentation,
): void {
  baseTarget.set(baseColor);
  tipTarget.set(tipColor);
  dryTarget.set(dryColor);
  const baseLuminance = Math.max(luminance(baseTarget), 0.0001);
  tipTarget.multiplyScalar(
    (baseLuminance * tuning.tipLuminanceScale) /
      Math.max(luminance(tipTarget), 0.0001),
  );
  dryTarget.multiplyScalar(
    (baseLuminance * tuning.dryLuminanceScale) /
      Math.max(luminance(dryTarget), 0.0001),
  );
  // Every palette source in the renderer passes through here, which is the one
  // property that makes a global saturation lever safe at all.
  applyGrassPaletteDesaturation(baseTarget);
  applyGrassPaletteDesaturation(tipTarget);
  applyGrassPaletteDesaturation(dryTarget);
}

/**
 * How much of the lambert lighting response survives the stylization mix. Both
 * the real-blade and the impostor fragment shaders apply it to the same palette
 * result, so colour parity across LODs depends on the two staying identical.
 * It used to be typed as a literal in each shader; it now lives here once and
 * `verify-lod-continuity` reads it from this file.
 */
// Raised from 0.38, where nearly two thirds of a blade's final colour was flat
// unlit albedo. That is what kept shaded grass bright: a blade facing away from
// the sun still returned most of its albedo, so the field had no dark mass for
// sunlit blades to stand against. Depth in a canopy comes from the shadowed
// blades being genuinely dark, not from the lit ones being brighter.
export const GRASS_LIGHT_MIX = 0.62;
export const GRASS_LIGHT_MIX_GLSL = toGlslFloat(GRASS_LIGHT_MIX);

/**
 * Reference shade controls for the root-progress derivation below. Every shipped
 * art preset and biome profile sits inside these bounds — 0.40-0.48 root
 * darkening and 0.28-0.40 tip colour strength — so one derived constant serves
 * all of them. `verify-lod-color-parity` re-reads both JSON files, checks the
 * shipped values still fall in this band, and bounds the residual error the
 * approximation leaves across every preset x biome combination.
 */
const VERTEX_PALETTE_REFERENCE_ROOT_DARKENING = 0.44;
const VERTEX_PALETTE_REFERENCE_TIP_COLOR_STRENGTH = 0.32;
/**
 * Midpoint of the dryness band the parity gate samples. Dryness pulls the tip
 * back toward the dry colour, which is near base luminance, so it flattens the
 * profile; folding a representative amount in takes the worst-case residual from
 * 2.1% to 1.5%.
 */
const VERTEX_PALETTE_REFERENCE_DRYNESS = 0.15;

function paletteSmoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * The progress-dependent scalar the palette applies to a blade, normalised so the
 * base colour is 1. Only the terms that vary with progress appear: the tip colour
 * lift, the root darkening ramp, and the ground-contact mix. Per-blade shade,
 * dryness and canopy AO are all constant along a blade and so cancel out of the
 * ratio this is used to solve.
 */
function paletteProgressProfile(progress: number): number {
  const tipProfile = paletteSmoothstep(tuning.tipStart, tuning.tipEnd, progress);
  const instanceDryness = Math.min(
    tuning.drynessMaximum,
    VERTEX_PALETTE_REFERENCE_DRYNESS *
      (tuning.instanceDrynessBase + tipProfile * tuning.instanceDrynessTip),
  );
  const healthy =
    (1 +
      (tuning.tipLuminanceScale - 1) *
        tipProfile *
        VERTEX_PALETTE_REFERENCE_TIP_COLOR_STRENGTH) *
      (1 - instanceDryness) +
    tuning.dryLuminanceScale * instanceDryness;
  const rootLight =
    VERTEX_PALETTE_REFERENCE_ROOT_DARKENING +
    (1 - VERTEX_PALETTE_REFERENCE_ROOT_DARKENING) *
      paletteSmoothstep(0, tuning.rootFadeEnd, progress);
  const groundContact =
    1 -
    paletteSmoothstep(
      tuning.groundContactStart,
      tuning.groundContactEnd,
      progress,
    );
  const ground =
    tuning.groundContactBaseScale +
    (tuning.groundContactDryScale - tuning.groundContactBaseScale) *
      VERTEX_PALETTE_REFERENCE_DRYNESS;
  return (
    rootLight *
    (healthy -
      tuning.groundContactStrength * groundContact * (healthy - ground))
  );
}

/**
 * Where the root vertices of a one-triangle blade evaluate the palette.
 *
 * Base, bridge and mid blades are a single triangle whose only progress values
 * are 0 at the two root vertices and 1 at the apex, and those layers resolve the
 * palette per vertex. The rasteriser therefore draws a straight line from
 * `palette(0)` to `palette(1)` — but the palette is strongly concave in progress:
 * `rootLight` and `groundContact` both saturate inside the bottom half of the
 * blade, so the true colour is already near full brightness where the chord is
 * still climbing out of the root darkening. Area-weighted over the tapering
 * triangle the chord came out about a fifth darker than the per-fragment path the
 * segmented ultra-near blades use, and that step landed at exactly the radius
 * where the two representations swap.
 *
 * Adding an interior row would fix it and cost three times the triangles. Instead
 * the root vertices evaluate the palette slightly up the blade, at the progress
 * whose value makes the linear ramp reproduce the true area-weighted mean:
 *
 *   (2/3)·F(p0) + (1/3)·F(1) = integral of F(p)·2(1-p) dp over [0,1]
 *
 * The 2(1-p) weight is the triangle's own width taper, so this is the mean the
 * eye actually sees. The apex is left alone, which keeps the tip — the part of a
 * blade that reads against the sky — exact.
 */
export const GRASS_VERTEX_PALETTE_ROOT_PROGRESS =
  resolveVertexPaletteRootProgress();

function resolveVertexPaletteRootProgress(): number {
  const steps = 4096;
  let weighted = 0;
  for (let index = 0; index < steps; index += 1) {
    const progress = (index + 0.5) / steps;
    weighted += paletteProgressProfile(progress) * 2 * (1 - progress);
  }
  weighted /= steps;
  const target = 1.5 * weighted - 0.5 * paletteProgressProfile(1);
  // The profile is monotonically increasing across the root ramp, so bisection
  // converges on the one progress that produces the target value.
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 64; iteration += 1) {
    const middle = (low + high) * 0.5;
    if (paletteProgressProfile(middle) < target) {
      low = middle;
    } else {
      high = middle;
    }
  }
  const progress = (low + high) * 0.5;
  if (!Number.isFinite(progress) || progress < 0 || progress >= 1) {
    throw new RangeError(
      "The grass vertex-palette root progress must resolve inside the blade.",
    );
  }
  return progress;
}

export const GRASS_VERTEX_PALETTE_ROOT_PROGRESS_GLSL = toGlslFloat(
  Number(GRASS_VERTEX_PALETTE_ROOT_PROGRESS.toFixed(5)),
);

/**
 * Where a widened sub-pixel blade blends toward canopy. The mix used to target
 * `terrainGrassColor`, a raw unlit albedo 1.7–3× brighter than the shaded blade
 * it replaced, so the mid band paid coverage back as a brightness lift.
 *
 * The palette is concave in progress, so evaluating it at the area-weighted
 * mean progress (1/3) does not yield the area-weighted mean colour. The fill
 * is the chord from the lifted root to the tip — the same construction the
 * one-triangle vertex palette uses, which `verify-lod-color-parity` already
 * bounds against the per-fragment integral.
 */
export const GRASS_CANOPY_MEAN_PROGRESS = 1 / 3;
export const GRASS_CANOPY_MEAN_SHADE = 0.5;
export const GRASS_CANOPY_MEAN_ROOT_AO = 0.95;

const paletteScratch = new THREE.Color();
const paletteScratchGround = new THREE.Color();
const canopyScratchBase = new THREE.Color();
const canopyScratchTip = new THREE.Color();
const canopyScratchDry = new THREE.Color();
const canopyScratchResolvedTip = new THREE.Color();

/**
 * CPU mirror of `grassResolvePalette`. The vertex canopy fill has to land on
 * the same colour the blades resolve to, and that evaluation cannot live only
 * in GLSL if the fill colour is uploaded as a uniform.
 */
export function resolveGrassPaletteColor(
  target: THREE.Color,
  baseColor: THREE.Color,
  tipColor: THREE.Color,
  dryColor: THREE.Color,
  progress: number,
  shade: number,
  dryness: number,
  rootAo: number,
  tipColorStrength: number,
  rootDarkening: number,
): THREE.Color {
  const tipProfile = paletteSmoothstep(tuning.tipStart, tuning.tipEnd, progress);
  target.copy(baseColor).lerp(tipColor, tipProfile * tipColorStrength);
  const shadeDryness = Math.min(
    Math.max(0, (tuning.shadeDrynessPivot - shade) * tuning.shadeDrynessScale),
    tuning.shadeDrynessMaximum,
  );
  const instanceDryness =
    dryness *
    (tuning.instanceDrynessBase + tipProfile * tuning.instanceDrynessTip);
  target.lerp(
    dryColor,
    Math.min(Math.max(0, shadeDryness + instanceDryness), tuning.drynessMaximum),
  );
  const rootLight =
    rootDarkening +
    (1 - rootDarkening) * paletteSmoothstep(0, tuning.rootFadeEnd, progress);
  const bladeVariation =
    tuning.shadeLightMinimum +
    (tuning.shadeLightMaximum - tuning.shadeLightMinimum) * shade;
  const occlusion = rootLight * bladeVariation * rootAo;
  target.multiplyScalar(occlusion);
  const groundContact =
    1 -
    paletteSmoothstep(
      tuning.groundContactStart,
      tuning.groundContactEnd,
      progress,
    );
  paletteScratch
    .copy(baseColor)
    .multiplyScalar(tuning.groundContactBaseScale);
  paletteScratchGround
    .copy(dryColor)
    .multiplyScalar(tuning.groundContactDryScale);
  paletteScratch
    .lerp(paletteScratchGround, dryness)
    .multiplyScalar(occlusion);
  target.lerp(paletteScratch, groundContact * tuning.groundContactStrength);
  const shadedLuminance = luminance(target);
  const shadowDesaturation = Math.min(
    Math.max(0, (1 - occlusion) * tuning.shadowDesaturation),
    1,
  );
  target.r += (shadedLuminance - target.r) * shadowDesaturation;
  target.g += (shadedLuminance - target.g) * shadowDesaturation;
  target.b += (shadedLuminance - target.b) * shadowDesaturation;
  return target;
}

function resolveGrassCanopyColor(
  target: THREE.Color,
  baseColor: THREE.Color,
  tipColor: THREE.Color,
  dryColor: THREE.Color,
  dryness: number,
  rootDarkening: number,
  tipColorStrength: number,
): void {
  resolveGrassPaletteColor(
    target,
    baseColor,
    tipColor,
    dryColor,
    GRASS_VERTEX_PALETTE_ROOT_PROGRESS,
    GRASS_CANOPY_MEAN_SHADE,
    dryness,
    GRASS_CANOPY_MEAN_ROOT_AO,
    tipColorStrength,
    rootDarkening,
  );
  resolveGrassPaletteColor(
    canopyScratchResolvedTip,
    baseColor,
    tipColor,
    dryColor,
    1,
    GRASS_CANOPY_MEAN_SHADE,
    dryness,
    GRASS_CANOPY_MEAN_ROOT_AO,
    tipColorStrength,
    rootDarkening,
  );
  // (2/3)·root + (1/3)·tip: the tapering triangle's own area-weighted mean.
  target.lerp(canopyScratchResolvedTip, GRASS_CANOPY_MEAN_PROGRESS);
}

/**
 * Healthy and dry area-weighted palette means for one biome row.
 *
 * The endpoints pass through the same balancing and palette resolver as the
 * blade itself. A vertex can therefore interpolate them with its existing
 * per-instance dryness without introducing a second colour model. Scratch
 * colours are module-owned so live art-direction updates allocate nothing.
 */
export function setGrassCanopyColors(
  healthyTarget: THREE.Color,
  dryTarget: THREE.Color,
  baseColor: THREE.ColorRepresentation,
  tipColor: THREE.ColorRepresentation,
  dryColor: THREE.ColorRepresentation,
  rootDarkening: number,
  tipColorStrength: number,
): void {
  setBalancedGrassPaletteColors(
    canopyScratchBase,
    canopyScratchTip,
    canopyScratchDry,
    baseColor,
    tipColor,
    dryColor,
  );
  resolveGrassCanopyColor(
    healthyTarget,
    canopyScratchBase,
    canopyScratchTip,
    canopyScratchDry,
    0,
    rootDarkening,
    tipColorStrength,
  );
  resolveGrassCanopyColor(
    dryTarget,
    canopyScratchBase,
    canopyScratchTip,
    canopyScratchDry,
    1,
    rootDarkening,
    tipColorStrength,
  );
}

// One palette function is injected into both the real-blade and impostor
// fragment shaders. The impostor atlas stores blade progress and shade rather
// than baked RGB, so presets use this exact curve at every LOD.
export const GRASS_PALETTE_GLSL = `
vec3 grassResolvePalette(
  vec3 baseColor,
  vec3 tipColor,
  vec3 dryColor,
  float progress,
  float shade,
  float dryness,
  float rootAo,
  float tipColorStrength,
  float rootDarkening
) {
  float tipProfile = smoothstep(
    ${toGlslFloat(tuning.tipStart)},
    ${toGlslFloat(tuning.tipEnd)},
    progress
  );
  vec3 healthyColor = mix(
    baseColor,
    tipColor,
    tipProfile * tipColorStrength
  );
  float shadeDryness = clamp(
    (${toGlslFloat(tuning.shadeDrynessPivot)} - shade) *
      ${toGlslFloat(tuning.shadeDrynessScale)},
    0.0,
    ${toGlslFloat(tuning.shadeDrynessMaximum)}
  );
  float instanceDryness = dryness * (
    ${toGlslFloat(tuning.instanceDrynessBase)} +
    tipProfile * ${toGlslFloat(tuning.instanceDrynessTip)}
  );
  vec3 paletteColor = mix(
    healthyColor,
    dryColor,
    clamp(
      shadeDryness + instanceDryness,
      0.0,
      ${toGlslFloat(tuning.drynessMaximum)}
    )
  );
  float rootLight = mix(
    rootDarkening,
    1.0,
    smoothstep(0.0, ${toGlslFloat(tuning.rootFadeEnd)}, progress)
  );
  float bladeVariation = mix(
    ${toGlslFloat(tuning.shadeLightMinimum)},
    ${toGlslFloat(tuning.shadeLightMaximum)},
    shade
  );
  float occlusion = rootLight * bladeVariation * rootAo;
  vec3 shadedColor = paletteColor * occlusion;
  float groundContact = 1.0 - smoothstep(
    ${toGlslFloat(tuning.groundContactStart)},
    ${toGlslFloat(tuning.groundContactEnd)},
    progress
  );
  vec3 groundColor = mix(
    baseColor * ${toGlslFloat(tuning.groundContactBaseScale)},
    dryColor * ${toGlslFloat(tuning.groundContactDryScale)},
    dryness
  ) * occlusion;
  shadedColor = mix(
    shadedColor,
    groundColor,
    groundContact * ${toGlslFloat(tuning.groundContactStrength)}
  );
  // Root darkening and shade variation are scalars, so a blade can get darker
  // without its green ever getting less pure — and a dark, fully saturated
  // green is not a colour ACES can carry. Its output matrix takes red negative
  // and the clamp eats it: in a settled capture 7.5% of near-field vegetation
  // pixels had red at exactly zero, against 0.0% in the far field. That
  // clipping is most of what reads as a neon carpet rather than a meadow, and
  // no amount of palette retuning fixes it while the darkening stays purely
  // multiplicative. Ground contact mixes toward a brown/olive, but that mix is
  // still lit by the same occlusion so shadowed roots cannot lift.
  //
  // Shadowed vegetation is lit by the sky and by bounce off the ground, not by
  // nothing, so it loses saturation as it darkens. Letting it do that here puts
  // the albedo back inside the gamut as a side effect of being more correct.
  //
  // The blend runs toward the colour's own luminance, so it cannot shift the
  // field's brightness — which is what lets one shared function change every
  // LOD at once without moving the near/mid/far parity budget.
  return mix(
    shadedColor,
    vec3(dot(shadedColor, vec3(
      ${toGlslFloat(GRASS_LUMINANCE_WEIGHTS.x)},
      ${toGlslFloat(GRASS_LUMINANCE_WEIGHTS.y)},
      ${toGlslFloat(GRASS_LUMINANCE_WEIGHTS.z)}
    ))),
    clamp(
      (1.0 - occlusion) * ${toGlslFloat(tuning.shadowDesaturation)},
      0.0,
      1.0
    )
  );
}
`;
