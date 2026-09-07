import type { Node, NodeBuilder } from "three/webgpu";
import {
  Discard, Fn, If, abs, attribute, cameraPosition, cameraViewMatrix, clamp, cross, float, floor,
  fract, int, mix, max, min, modelWorldMatrix, positionGeometry, pow, property, sin, smoothstep,
  step, uniformArray, uv, varying, vec2, vec3, vec4,
} from "three/tsl";
import { instanceMatrixColumns } from "../../render/InstanceMatrixNode";
import { GRASS_MAX_BIOMES } from "../../grass/biome/GrassBiomeProfile";
import {
  GRASS_ACCENT_SPECIES, GRASS_MAX_ACCENT_SPECIES, GRASS_MAX_ACCENT_TINTS,
} from "../../grass/biome/GrassAccentSpecies";
import { GRASS_LIGHT_MIX } from "../../grass/materials/GrassPaletteShader";
import { grassResolvePaletteNode } from "../../grass/materials/GrassPaletteNodes";
import { grassLodBandJitterMetresNode, grassLodBandOffsetNode } from "../../grass/materials/GrassFieldNodes";
import type { GrassNodeUniforms } from "../../grass/materials/GrassNearNodeInputs";
import {
  GRASS_GUST_CROSS_PHASE, GRASS_GUST_CROSS_SCALE, GRASS_GUST_CROSS_SPEED, GRASS_GUST_CROSS_WEIGHT,
  GRASS_GUST_FRONT_SCALE, GRASS_GUST_FRONT_SPEED, GRASS_GUST_PRIMARY_WEIGHT,
  GRASS_WEATHER_CALM_FLOOR, GRASS_WEATHER_PULSE_SPEED,
} from "../../grass/wind/WindNoiseTexture";

const WORLD_UP = vec3(0, 1, 0);
const RECIPROCAL_PI = 0.3183098861837907;
const ALPHA_CUTOFF_FADE = 0.55;
const WIND_RAMP_POWER = 1.5;
const GROUNDCOVER_UP = 0.36;
const GROUNDCOVER_FORWARD = Number(Math.sqrt(1 - GROUNDCOVER_UP ** 2).toFixed(4));
const UNDERSTORY_EDGE_DARKENING = 0.2;
const UNDERSTORY_EDGE_RANGE = 0.25;
const UNDERSTORY_DETAIL_FADE_START = 8;
const UNDERSTORY_DETAIL_FADE_END = 24;
const WIND_SHEAR_FACTOR = 0.4;

/**
 * The species-category masks the shader compiles in.
 *
 * The GLSL builds a sum of `step(abs(speciesIndex - n), 0.25)` terms from the
 * species table at module load; the node port builds the same sum from the same
 * table, so adding a species keeps changing both implementations at once.
 */
function categoryMask(speciesIndex: Node<"float">, categories: readonly string[]): Node<"float"> {
  const members = GRASS_ACCENT_SPECIES.filter(species => categories.includes(species.category));
  if (members.length === 0) return float(0);
  let sum = step(abs(speciesIndex.sub(members[0].index)), 0.25) as Node<"float">;
  for (const species of members.slice(1)) {
    sum = sum.add(step(abs(speciesIndex.sub(species.index)), 0.25));
  }
  return sum.clamp(0, 1);
}

export interface GrassFoliageNodeFeatures {
  /** Sample the shared scrolling gust field instead of the compact sine front. */
  noiseWind: boolean;
}

/** Irradiance and the sun, in view space, as the accent cards sum them. */
export interface GrassFoliageLighting {
  irradiance(viewNormal: Node<"vec3">): Node<"vec3">;
  sunDirection: Node<"vec3">;
}

export function createGrassFoliageNodes(u: GrassNodeUniforms,
  features: GrassFoliageNodeFeatures, lighting: GrassFoliageLighting,
  speciesWind: ArrayLike<number>) {
  const time = u.number("uTime");
  const windDirection = u.vector2("uWindDirection");
  const variation = attribute<"vec4">("instanceVariation", "vec4");
  const instanceCoverage = attribute<"float">("instanceCoverage", "float");
  const instanceBiome = attribute<"float">("instanceBiome", "float");
  const instanceAccent = attribute<"float">("instanceAccent", "float");
  const species = uniformArray<"float">(speciesWind as unknown as number[], "float");

  // The card's identity is flat, as the shipped shader declares it: the cell
  // addresses an atlas page and the phenotype keys a hash, so interpolation
  // error there is a different cell and a different flower, not a rounding
  // difference. The shading inputs stay interpolated, also as declared.
  const cardValue = property("vec4", "foliageCardValue");     // cell.xy, tint, biome
  const traitValue = property("vec4", "foliageTraitValue");   // phenotype, groundcover, understory
  const shadeValue = property("vec4", "foliageShadeValue");   // dryness, rootAo, distance, fade
  const irradianceValue = property("vec3", "foliageIrradianceValue");
  const backLightValue = property("float", "foliageBackLightValue");
  const vCard = varying(cardValue).setInterpolation("flat");
  const vTrait = varying(traitValue).setInterpolation("flat");
  const vShade = varying(shadeValue);
  const vIrradiance = varying(irradianceValue);
  const vBackLight = varying(backLightValue);
  /** Rejected cards leave clip space entirely, as the vertex early-out does. */
  const rejected = property("float", "foliageRejected");

  const base = u.colorRows("uBiomeBase");
  const tip = u.colorRows("uBiomeTip");
  const dry = u.colorRows("uBiomeDry");
  const shade = u.vector2Rows("uBiomeShade");
  const tints = u.colorRows("uAccentTint");

  const worldPosition = Fn((builder: NodeBuilder) => {
    const columns = instanceMatrixColumns(builder);
    const axisX = modelWorldMatrix.mul(vec4(columns[0].xyz, 0)).xyz.toVar();
    const axisY = modelWorldMatrix.mul(vec4(columns[1].xyz, 0)).xyz.toVar();
    const axisZ = modelWorldMatrix.mul(vec4(columns[2].xyz, 0)).xyz.toVar();
    const scaleX = max(axisX.length(), 0.0001).toVar();
    const scaleY = max(axisY.length(), 0.0001).toVar();
    const scaleZ = max(axisZ.length(), 0.0001).toVar();
    const cardUp = axisY.div(scaleY).toVar();
    const instanceRight = axisX.div(scaleX).toVar();
    const instanceForward = axisZ.div(scaleZ).toVar();
    const root = modelWorldMatrix.mul(vec4(columns[3].xyz, 1)).xyz.toVar();
    const center = root.add(cardUp.mul(scaleY).mul(0.5)).toVar();
    const cameraDistance = cameraPosition.distance(center).toVar();

    // Density stays a stable per-instance dither; folding distance into it made
    // whole flowers blink as the camera moved. The fragment fades alpha instead.
    const coverage = min(instanceCoverage.mul(u.number("uDensityScale")), 1).toVar();

    // Decoded ahead of the fade, because the fade depends on the species.
    // Stride 32: four phenotype rows need two bits where the old packing had one.
    const speciesIndex = floor(instanceAccent.div(32)).toVar();
    const packedRemainder = instanceAccent.sub(speciesIndex.mul(32)).toVar();
    const variantRow = floor(packedRemainder.div(8)).toVar();
    const tint = packedRemainder.sub(variantRow.mul(8)).toVar();

    // Staggered departures turn one shared ring into a community thinning out,
    // and the world-space wander stops what is left tracing a circle.
    const fadeDistance = u.number("uFadeDistance");
    const fadeTransition = u.number("uFadeTransition");
    const fadeStagger = u.number("uFadeStagger");
    const speciesFadeOffset = fract(speciesIndex.mul(0.61803398875)).sub(0.5).mul(fadeStagger);
    const wandered = fadeDistance.add(speciesFadeOffset).add(
      grassLodBandJitterMetresNode(fadeDistance.sub(fadeTransition), fadeDistance.add(fadeTransition),
        u.number("uLodBandJitterRatio")).mul(grassLodBandOffsetNode(root.xz))).toVar();
    const foliageFadeDistance = clamp(wandered, fadeDistance.sub(fadeStagger.mul(0.5)),
      fadeDistance).toVar();
    const distanceFade = smoothstep(foliageFadeDistance.sub(fadeTransition),
      foliageFadeDistance.add(fadeTransition), cameraDistance).oneMinus().toVar();
    rejected.assign(variation.x.greaterThan(coverage).select(float(1), float(0)));

    // The density dither doubles as a stable phenotype seed; it never changes at
    // runtime and costs no fifth instance attribute.
    const phenotype = fract(variation.x.mul(7.317).add(speciesIndex.mul(0.173))
      .add(variantRow.mul(0.347))).toVar();
    const groundcover = categoryMask(speciesIndex, ["groundcover"]).toVar();
    const understory = categoryMask(speciesIndex, ["groundcover", "shrub", "broadleaf"]).toVar();

    // Upright species stay yaw-only billboards so flowers cannot vanish edge-on.
    // Groundcover keeps its instance yaw and splays along the terrain instead,
    // with only enough rise to preserve leaf-layer parallax.
    const toCamera = cameraPosition.sub(root).toVar();
    const flatToCamera = vec3(toCamera.x, 0, toCamera.z).toVar();
    const flatLength = flatToCamera.length().toVar();
    const cardForward = vec3(0, 0, 1).toVar();
    If(flatLength.greaterThanEqual(0.001), () => { cardForward.assign(flatToCamera.div(flatLength)); });
    const cardRight = cross(WORLD_UP, cardForward).normalize().toVar();
    const groundcoverAxis = instanceForward.mul(GROUNDCOVER_FORWARD)
      .add(cardUp.mul(GROUNDCOVER_UP)).normalize().toVar();

    const gustNoise = (features.noiseWind
      ? u.texture("uWindNoise").sample(root.xz.mul(u.number("uWindNoiseScale"))
        .sub(windDirection.mul(time.mul(u.number("uWindNoiseSpeed"))))).level(float(0)).r
      : float(0.5).add(float(0.5).mul(
        sin(root.xz.dot(windDirection).mul(GRASS_GUST_FRONT_SCALE)
          .sub(time.mul(GRASS_GUST_FRONT_SPEED))).mul(GRASS_GUST_PRIMARY_WEIGHT)
          .add(sin(root.xz.dot(vec2(windDirection.y.negate(), windDirection.x))
            .mul(GRASS_GUST_CROSS_SCALE).add(time.mul(GRASS_GUST_CROSS_SPEED))
            .add(GRASS_GUST_CROSS_PHASE)).mul(GRASS_GUST_CROSS_WEIGHT))))).toVar();

    const upright = root.add(cardRight.mul(positionGeometry.x).mul(scaleX))
      .add(cardUp.mul(positionGeometry.y).mul(scaleY));
    const splayed = root.add(instanceRight.mul(positionGeometry.x).mul(scaleX))
      .add(groundcoverAxis.mul(positionGeometry.y).mul(scaleY));
    const world = mix(upright, splayed, groundcover).toVar();
    const speciesRow = int(speciesIndex.clamp(0, GRASS_MAX_ACCENT_SPECIES - 1).add(0.5));
    const windRamp = pow(uv().y, WIND_RAMP_POWER).toVar();
    const weather = mix(GRASS_WEATHER_CALM_FLOOR, 1,
      float(0.5).add(sin(time.mul(GRASS_WEATHER_PULSE_SPEED)).mul(0.5))).toVar();
    const sway = gustNoise.mul(2).sub(1).mul(u.number("uWindStrength")).mul(WIND_SHEAR_FACTOR)
      .mul(species.element(speciesRow)).mul(variation.y).mul(weather).toVar();
    world.addAssign(vec3(windDirection.x, 0, windDirection.y).mul(sway).mul(windRamp).mul(scaleY)
      .mul(mix(float(1), float(0.3), groundcover)));

    // Groundcover lights from the terrain normal rather than the camera-facing
    // one, so a colony does not change brightness when the player walks around it.
    const surfaceNormal = mix(cardForward, cardUp, groundcover).normalize().toVar();
    const accentWorldNormal = mix(surfaceNormal, cardUp, u.number("uNormalUp")).normalize().toVar();
    const accentViewNormal = cameraViewMatrix.mul(vec4(accentWorldNormal, 0)).xyz.normalize().toVar();
    const viewPosition = cameraViewMatrix.mul(vec4(world, 1)).xyz.toVar();
    irradianceValue.assign(lighting.irradiance(accentViewNormal));
    backLightValue.assign(pow(viewPosition.normalize().dot(lighting.sunDirection).clamp(0, 1), 2));
    cardValue.assign(vec4(speciesIndex, variantRow, tint, instanceBiome));
    traitValue.assign(vec4(phenotype, groundcover, understory, 0));
    shadeValue.assign(vec4(variation.w, variation.z, cameraDistance, distanceFade));
    return world;
  })();

  const color = Fn(() => {
    const cellResolution = u.number("uCellResolution");
    const cellSize = cellResolution.add(u.number("uCellPadding").mul(2));
    const safeUv = clamp(uv(), vec2(float(0.5).div(cellResolution)),
      vec2(float(1).sub(float(0.5).div(cellResolution))));
    const pixel = vCard.xy.mul(cellSize).add(vec2(u.number("uCellPadding")))
      .add(safeUv.mul(cellResolution));
    const atlasColor = u.texture("uAtlas").sample(pixel.div(u.vector2("uAtlasSize"))).toVar();
    // Minification erodes thin alpha, so the cutout loosens with distance for
    // the same reason the impostor cards' does: a fern must not dissolve before
    // the dither fade has taken it.
    const cutoff = u.number("uAlphaCutoff").mul(mix(float(1), float(ALPHA_CUTOFF_FADE),
      smoothstep(u.number("uFadeDistance").mul(0.4), u.number("uFadeDistance"), vShade.z))).toVar();
    // The only discard in any grass material, and only for the cutout.
    Discard(atlasColor.a.lessThan(cutoff));

    const accentData = clamp(atlasColor.rgb.div(max(atlasColor.a, 0.001)), vec3(0), vec3(1)).toVar();
    const row = int(vCard.w.clamp(0, GRASS_MAX_BIOMES - 1).add(0.5));
    const rowShade = shade.element(row);
    const resolved = grassResolvePaletteNode(base.element(row).rgb, tip.element(row).rgb,
      dry.element(row).rgb, accentData.r, accentData.g, vShade.x, vShade.y,
      rowShade.y, rowShade.x).toVar();
    const tintRow = int(vCard.z.clamp(0, GRASS_MAX_ACCENT_TINTS - 1).add(0.5));

    // The shared palette compresses the leaf/fragment range these species
    // already encode. Restore local contrast near the camera and darken the
    // antialiased fringe so rosettes keep individual leaves.
    const understoryDetailFade = smoothstep(UNDERSTORY_DETAIL_FADE_START,
      UNDERSTORY_DETAIL_FADE_END, vShade.z).oneMinus().toVar();
    const understoryShade = mix(float(0.76), float(1.14), smoothstep(0.22, 0.58, accentData.g));
    const understoryInterior = smoothstep(cutoff, min(float(0.96),
      cutoff.add(UNDERSTORY_EDGE_RANGE)), atlasColor.a);
    const understoryEdge = mix(float(1 - UNDERSTORY_EDGE_DARKENING), float(1), understoryInterior);
    resolved.mulAssign(mix(float(1), understoryShade.mul(understoryEdge),
      vTrait.z.mul(understoryDetailFade)));

    // The B channel stays the blend strength, so stems, sepals and petal bases
    // keep their encoded depth instead of flattening into one RGB patch.
    const tintColor = tints.element(tintRow).rgb.toVar();
    const tintLuminance = tintColor.dot(vec3(0.2126, 0.7152, 0.0722)).toVar();
    const saturation = mix(float(0.82), float(1), fract(vTrait.x.mul(5.173).add(0.21)));
    tintColor.assign(mix(vec3(tintLuminance), tintColor, saturation));
    const petalShade = mix(float(0.65), float(1.12), accentData.g);
    const phenotypeValue = mix(float(0.92), float(1.06), vTrait.x);
    const ageFade = vShade.x.mul(0.16).add(fract(vTrait.x.mul(13.371).add(0.17)).mul(0.06))
      .clamp(0, 0.2);
    tintColor.mulAssign(petalShade.mul(phenotypeValue));
    tintColor.assign(mix(tintColor,
      vec3(tintColor.dot(vec3(0.2126, 0.7152, 0.0722))).mul(0.96), ageFade));
    resolved.assign(mix(resolved, tintColor, accentData.b));

    const lambert = resolved.mul(vIrradiance).mul(RECIPROCAL_PI)
      .add(resolved.mul(u.number("uAmbientBoost")));
    const outgoing = mix(resolved, lambert, GRASS_LIGHT_MIX)
      .add(resolved.mul(vBackLight).mul(u.number("uBacklightStrength")).mul(0.2));
    return vec4(outgoing, atlasColor.a.mul(vShade.w));
  })();

  return { worldPosition, color, rejected };
}
