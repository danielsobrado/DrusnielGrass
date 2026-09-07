import type { Node, NodeBuilder } from "three/webgpu";
import {
  Discard, Fn, If, abs, attribute, cameraPosition, cameraViewMatrix, clamp, cross, dFdx, dFdy,
  float, floor, fract, int,
  inverseSqrt, log2, max, min, mix, mod, modelWorldMatrix, positionGeometry, pow, sin, smoothstep,
  property, step, uv, varying, vec2, vec3, vec4,
} from "three/tsl";
import { instanceMatrixColumns } from "../../render/InstanceMatrixNode";
import { GRASS_MAX_BIOMES } from "../../grass/biome/GrassBiomeProfile";
import { GRASS_LIGHT_MIX } from "../../grass/materials/GrassPaletteShader";
import { grassResolvePaletteNode } from "../../grass/materials/GrassPaletteNodes";
import type { GrassNodeUniforms } from "../../grass/materials/GrassNearNodeInputs";
import {
  GRASS_IMPOSTOR_FOOTPRINT_SCALE, GRASS_IMPOSTOR_WIND_SHEAR_FACTOR,
} from "../../grass/GrassLodTuning";
import {
  GRASS_GUST_CROSS_PHASE, GRASS_GUST_CROSS_SCALE, GRASS_GUST_CROSS_SPEED, GRASS_GUST_CROSS_WEIGHT,
  GRASS_GUST_FRONT_SCALE, GRASS_GUST_FRONT_SPEED, GRASS_GUST_PRIMARY_WEIGHT,
  GRASS_WEATHER_CALM_FLOOR, GRASS_WEATHER_PULSE_SPEED,
} from "../../grass/wind/WindNoiseTexture";
import {
  IMPOSTOR_AERIAL_BLEND_END, IMPOSTOR_AERIAL_BLEND_START, IMPOSTOR_ALPHA_DITHER_SEED,
  IMPOSTOR_HORIZON_ATLAS_ELEVATION, IMPOSTOR_MINIFICATION_FULL_TEXELS_PER_PIXEL,
  IMPOSTOR_MINIFICATION_START_TEXELS_PER_PIXEL, IMPOSTOR_MINIFIED_ALPHA_CUTOFF,
  IMPOSTOR_MINIFIED_COVERAGE_SEED_OFFSET, IMPOSTOR_MINIFIED_COVERAGE_SUBPATCH_SCALE,
  IMPOSTOR_TERRAIN_DITHER_INSTANCE_SCALE, IMPOSTOR_TERRAIN_DITHER_SEED_SCALE,
  IMPOSTOR_TERRAIN_DITHER_SUBPATCH_SCALE, IMPOSTOR_TERRAIN_UP_BLEND,
  IMPOSTOR_VIEW_DITHER_GRID_SCALE,
} from "./WorldGrassImpostorTuning";

const WORLD_UP = vec3(0, 1, 0);
const RECIPROCAL_PI = 0.3183098861837907;
/**
 * The GLSL substitutes its tuning through `toFixed`, so the shipped shader uses
 * the rounded literal. The node port rounds identically; anything else would
 * move a dither threshold or a blend edge by a quantization step.
 */
const round = (value: number, digits: number) => Number(value.toFixed(digits));
const TERRAIN_UP_BLEND = round(IMPOSTOR_TERRAIN_UP_BLEND, 2);
const AERIAL_START = round(IMPOSTOR_AERIAL_BLEND_START, 2);
const AERIAL_END = round(IMPOSTOR_AERIAL_BLEND_END, 2);
const HORIZON_ATLAS_ELEVATION = round(IMPOSTOR_HORIZON_ATLAS_ELEVATION, 2);
const FOOTPRINT_SCALE = round(GRASS_IMPOSTOR_FOOTPRINT_SCALE, 2);
const WIND_SHEAR = round(GRASS_IMPOSTOR_WIND_SHEAR_FACTOR, 2);
const TERRAIN_DITHER_INSTANCE = round(IMPOSTOR_TERRAIN_DITHER_INSTANCE_SCALE, 1);
const TERRAIN_DITHER_SUBPATCH = round(IMPOSTOR_TERRAIN_DITHER_SUBPATCH_SCALE, 11);
const TERRAIN_DITHER_SEED = round(IMPOSTOR_TERRAIN_DITHER_SEED_SCALE, 11);
const MINIFICATION_START = round(IMPOSTOR_MINIFICATION_START_TEXELS_PER_PIXEL, 2);
const MINIFICATION_FULL = round(IMPOSTOR_MINIFICATION_FULL_TEXELS_PER_PIXEL, 2);
const MINIFIED_ALPHA_CUTOFF = round(IMPOSTOR_MINIFIED_ALPHA_CUTOFF, 2);
const MINIFIED_COVERAGE_SUBPATCH = round(IMPOSTOR_MINIFIED_COVERAGE_SUBPATCH_SCALE, 11);
const MINIFIED_COVERAGE_SEED = round(IMPOSTOR_MINIFIED_COVERAGE_SEED_OFFSET, 2);
const VIEW_DITHER_GRID = round(IMPOSTOR_VIEW_DITHER_GRID_SCALE, 2);
const ALPHA_DITHER_SEED = round(IMPOSTOR_ALPHA_DITHER_SEED, 2);

/** The card's compile-time selection, mirroring the material's defines. */
export interface GrassImpostorNodeFeatures {
  /** Sample the shared scrolling gust field instead of the compact sine front. */
  noiseWind: boolean;
}

/** Irradiance and the sun, in view space, as the cards' vertex stage sums them. */
export interface GrassImpostorLighting {
  irradiance(viewNormal: Node<"vec3">): Node<"vec3">;
  sunDirection: Node<"vec3">;
}

const safeNormalize3 = Fn(([value, fallback]: [Node<"vec3">, Node<"vec3">]) => {
  const lengthSquared = value.dot(value);
  return lengthSquared.greaterThan(1e-8).select(value.mul(inverseSqrt(lengthSquared)), fallback);
});

/** The atlas hash, shared by the view, alpha and coverage dithers. */
const coverageNoise = Fn(([position, seed]: [Node<"vec2">, Node<"float">]) => {
  const value = fract(vec3(position.x, position.y, position.x).mul(0.1031).add(seed)).toVar();
  value.addAssign(value.dot(value.yzx.add(33.33)));
  return fract(value.x.add(value.y).mul(value.z));
});

export function createGrassImpostorNodes(u: GrassNodeUniforms,
  features: GrassImpostorNodeFeatures, lighting: GrassImpostorLighting) {
  const time = u.number("uTime");
  const windDirection = u.vector2("uWindDirection");
  const variation = attribute<"vec4">("instanceVariation", "vec4");
  const instanceCoverage = attribute<"float">("instanceCoverage", "float");
  const instanceBiome = attribute<"float">("instanceBiome", "float");
  const subpatchOffset = attribute<"vec2">("grassSubpatchOffset", "vec2");
  const subpatchIndex = attribute<"float">("grassSubpatchIndex", "float");

  // Packed to the interpolator count the GLSL declared; every one of these is
  // constant across a card, so packing changes no value.
  //
  // They are flat, as the shipped shader declares them, and that is not
  // cosmetic. Barycentric interpolation of three equal values still carries
  // float error, and the subpatch index addresses an atlas page while the
  // instance seed keys the view, alpha and coverage hashes: a last-bit wobble
  // there picks a different atlas cell and a different stochastic threshold
  // per pixel, which is a visibly different card rather than a rounding
  // difference.
  const cardValue = property("vec4", "grassCardValue");     // gust, biome, subpatch, seed
  const shadeValue = property("vec4", "grassShadeValue");   // dryness, rootAo, farEntry, coverage
  const localViewValue = property("vec3", "grassLocalViewValue");
  const irradianceValue = property("vec3", "grassIrradianceValue");
  const backLightValue = property("float", "grassBackLightValue");
  const vCard = varying(cardValue).setInterpolation("flat");
  const vShade = varying(shadeValue).setInterpolation("flat");
  const vLocalView = varying(localViewValue).setInterpolation("flat");
  const vIrradiance = varying(irradianceValue).setInterpolation("flat");
  // The transmission term is the one value that genuinely varies across the
  // card: it is driven by the shear ramp and the per-vertex view direction.
  const vBackLight = varying(backLightValue);

  const base = u.colorRows("uBiomeBase");
  const tip = u.colorRows("uBiomeTip");
  const dry = u.colorRows("uBiomeDry");
  const shade = u.vector2Rows("uBiomeShade");

  const worldPosition = Fn((builder: NodeBuilder) => {
    const columns = instanceMatrixColumns(builder);
    // Column j of (model * instance) is model applied to instance column j.
    const axisX = modelWorldMatrix.mul(vec4(columns[0].xyz, 0)).xyz.toVar();
    const axisY = modelWorldMatrix.mul(vec4(columns[1].xyz, 0)).xyz.toVar();
    const axisZ = modelWorldMatrix.mul(vec4(columns[2].xyz, 0)).xyz.toVar();
    const scaleX = max(axisX.length(), 0.0001).toVar();
    const scaleY = max(axisY.length(), 0.0001).toVar();
    const scaleZ = max(axisZ.length(), 0.0001).toVar();
    const basisX = axisX.div(scaleX).toVar();
    const basisY = axisY.div(scaleY).toVar();
    const basisZ = axisZ.div(scaleZ).toVar();
    const rootCenter = modelWorldMatrix.mul(vec4(columns[3].xyz, 1)).xyz.toVar();
    const subpatchRoot = rootCenter.add(basisX.mul(subpatchOffset.x).mul(scaleX))
      .add(basisZ.mul(subpatchOffset.y).mul(scaleZ)).toVar();
    const center = subpatchRoot.add(basisY.mul(u.number("uCenterHeight")).mul(scaleY)).toVar();
    const toCamera = safeNormalize3(cameraPosition.sub(center), basisZ).toVar();

    const cardUp = safeNormalize3(mix(WORLD_UP, basisY, TERRAIN_UP_BLEND), WORLD_UP).toVar();
    const planarView = toCamera.sub(cardUp.mul(toCamera.dot(cardUp))).toVar();
    const planarViewLength = planarView.length().toVar();
    If(planarViewLength.lessThan(0.001), () => {
      planarView.assign(basisZ.sub(cardUp.mul(basisZ.dot(cardUp))));
      planarViewLength.assign(planarView.length());
    });
    If(planarViewLength.lessThan(0.001), () => {
      planarView.assign(basisX.sub(cardUp.mul(basisX.dot(cardUp))));
    });
    planarView.assign(safeNormalize3(planarView, vec3(0, 0, 1)));
    const cylindricalRight = safeNormalize3(cross(cardUp, planarView), basisX).toVar();
    const sphericalRight = safeNormalize3(cross(basisY, toCamera), basisX).toVar();
    const sphericalUp = safeNormalize3(cross(toCamera, sphericalRight), cardUp).toVar();
    const worldElevation = abs(toCamera.dot(WORLD_UP)).toVar();
    const aerialBlend = smoothstep(AERIAL_START, AERIAL_END, worldElevation).toVar();
    const billboardRight = safeNormalize3(mix(cylindricalRight, sphericalRight, aerialBlend),
      cylindricalRight).toVar();
    const billboardUp = safeNormalize3(mix(cardUp, sphericalUp, aerialBlend), cardUp).toVar();

    const gustNoise = (features.noiseWind
      ? u.texture("uWindNoise").sample(center.xz.mul(u.number("uWindNoiseScale"))
        .sub(windDirection.mul(time.mul(u.number("uWindNoiseSpeed"))))).level(float(0)).r
      : float(0.5).add(float(0.5).mul(
        sin(center.xz.dot(windDirection).mul(GRASS_GUST_FRONT_SCALE)
          .sub(time.mul(GRASS_GUST_FRONT_SPEED))).mul(GRASS_GUST_PRIMARY_WEIGHT)
          .add(sin(center.xz.dot(vec2(windDirection.y.negate(), windDirection.x))
            .mul(GRASS_GUST_CROSS_SCALE).add(time.mul(GRASS_GUST_CROSS_SPEED))
            .add(GRASS_GUST_CROSS_PHASE)).mul(GRASS_GUST_CROSS_WEIGHT))))).toVar();

    // Coverage is per instance: every term is a uniform or an instance
    // attribute, and only the comparison against the dither is per fragment.
    const cameraDistance = cameraPosition.distance(center).toVar();
    const transition = u.number("uTransitionDistance");
    const nearExit = smoothstep(u.number("uNearDistance").sub(transition),
      u.number("uNearDistance").add(transition), cameraDistance).toVar();
    const fullFarEntry = smoothstep(u.number("uMidDistance").sub(transition),
      u.number("uMidDistance").add(transition), cameraDistance).toVar();
    const farEntry = mix(nearExit.mul(u.number("uMidImpostorUnderfill")), 1, fullFarEntry).toVar();
    const terrainCoverage = smoothstep(u.number("uFarDistance").sub(transition),
      u.number("uFarDistance").add(transition), cameraDistance).oneMinus().toVar();
    // Legacy multi-instance cards keep complementary weights; the production
    // path draws one instance whose geometry holds four real subpatch cards.
    const cardWeight = float(1).toVar();
    If(u.number("uCardsPerPatch").greaterThan(1.5), () => {
      const inverseCards = float(1).div(u.number("uCardsPerPatch"));
      If(variation.y.lessThan(0.5), () => {
        cardWeight.assign(mix(inverseCards, float(1), fullFarEntry));
      }).Else(() => {
        cardWeight.assign(inverseCards.mul(fullFarEntry.oneMinus()));
      });
    });
    const canopyRange = u.vector2("uCanopyTransferRange");
    const canopyTransfer = smoothstep(canopyRange.x, canopyRange.y, cameraDistance).toVar();
    // Terrain progressively takes over the meadow's visual mean; a residual
    // card population keeps wind and silhouette without far stipple.
    const fieldCoverage = instanceCoverage.mul(cardWeight)
      .mul(mix(float(1), float(0.2), canopyTransfer)).toVar();
    const effectiveCoverage = farEntry
      .mul(min(fieldCoverage.mul(u.number("uArtDensityScale")), 1)).toVar();

    // A rejected card collapses to its centre rather than leaving the vertex
    // stage early: some tile renderers are sensitive to primitives whose
    // vertices write different output sets.
    const cardVisibility = step(0.001, effectiveCoverage).toVar();
    const terrainDither = fract(variation.x.mul(TERRAIN_DITHER_INSTANCE)
      .add(subpatchIndex.mul(TERRAIN_DITHER_SUBPATCH))
      .add(u.number("uDitherSeed").mul(TERRAIN_DITHER_SEED))).toVar();
    cardVisibility.mulAssign(step(terrainCoverage, terrainDither).oneMinus());

    const cardOffset = billboardRight.mul(positionGeometry.x).mul(scaleX).mul(FOOTPRINT_SCALE)
      .add(billboardUp.mul(positionGeometry.y).mul(scaleY)).toVar();
    const world = center.add(cardOffset.mul(cardVisibility)).toVar();
    // Root-to-tip shear matches real blade bending. uCardRadius is the quad's
    // own half-extent, so position.y spans the full [0, 1] of the ramp.
    const shearProgress = positionGeometry.y.div(max(u.number("uCardRadius"), 0.0001))
      .mul(0.5).add(0.5).clamp(0, 1).toVar();
    const weather = mix(GRASS_WEATHER_CALM_FLOOR, 1,
      float(0.5).add(sin(time.mul(GRASS_WEATHER_PULSE_SPEED)).mul(0.5))).toVar();
    const sway = gustNoise.mul(2).sub(1).mul(u.number("uWindStrength")).mul(WIND_SHEAR)
      .mul(weather).mul(mix(float(1), float(0.72), variation.w)).toVar();
    world.addAssign(vec3(windDirection.x, 0, windDirection.y)
      .mul(sway).mul(shearProgress).mul(scaleY).mul(cardVisibility));

    // Source blades lie in local XY, so their geometric normal is local Z.
    // That axis blends toward the terrain normal exactly as the real blades do.
    const grassWorldNormal = safeNormalize3(mix(basisZ, basisY,
      mix(u.number("uNormalUp"), float(1), cameraDistance.sub(48).div(90).clamp(0, 1))),
    basisY).toVar();
    const grassViewNormal = safeNormalize3(
      cameraViewMatrix.mul(vec4(grassWorldNormal, 0)).xyz, vec3(0, 1, 0)).toVar();
    const irradiance = lighting.irradiance(grassViewNormal).toVar();
    const viewPosition = cameraViewMatrix.mul(vec4(world, 1)).xyz.toVar();
    const viewDirection = safeNormalize3(viewPosition, vec3(0, 0, -1)).toVar();
    const backLight = pow(viewDirection.dot(lighting.sunDirection).clamp(0, 1), 2)
      .mul(mix(float(0.22), float(1), shearProgress))
      // The shipped shader dots a world-space normal with the view-space light
      // direction here. That space mismatch is part of the card's appearance
      // today, so the port reproduces it rather than quietly correcting it.
      .mul(float(0.42).add(abs(grassWorldNormal.dot(lighting.sunDirection))
        .oneMinus().mul(0.58)))
      .mul(mix(float(0.78), float(1.14), variation.w.oneMinus())).toVar();

    const localElevation = abs(toCamera.dot(basisY)).toVar();
    const atlasElevation = mix(min(localElevation, HORIZON_ATLAS_ELEVATION), localElevation,
      aerialBlend).toVar();
    localViewValue.assign(safeNormalize3(
      vec3(toCamera.dot(basisX), atlasElevation, toCamera.dot(basisZ)), vec3(0, 0, 1)));
    cardValue.assign(vec4(gustNoise, instanceBiome, subpatchIndex,
      fract(variation.x.add(u.number("uDitherSeed")))));
    shadeValue.assign(vec4(variation.w, variation.z, farEntry, fieldCoverage));
    irradianceValue.assign(irradiance);
    backLightValue.assign(backLight);
    return world;
  })();

  /** One atlas fetch, with the gradients the caller resolved before any discard. */
  const sampleFrame = (frameIndex: Node<"vec2">, localUv: Node<"vec2">,
    localUvDx: Node<"vec2">, localUvDy: Node<"vec2">) => {
    const frameResolution = u.number("uFrameResolution");
    const cellSize = frameResolution.add(u.number("uPadding").mul(2));
    const pageSize = u.number("uViewsPerAxis").mul(cellSize);
    const pageIndex = vec2(mod(vCard.z, u.number("uSubpatchesPerAxis")),
      floor(vCard.z.div(u.number("uSubpatchesPerAxis"))));
    const safeUv = clamp(localUv, vec2(float(0.5).div(frameResolution)),
      vec2(float(1).sub(float(0.5).div(frameResolution))));
    const pixel = pageIndex.mul(pageSize).add(frameIndex.mul(cellSize))
      .add(vec2(u.number("uPadding"))).add(safeUv.mul(frameResolution));
    const atlasUv = pixel.div(u.number("uAtlasSize"));
    const atlas = u.texture("uAtlas");
    const sampled = vec4(0).toVar();
    If(u.number("uBlendViews").lessThan(0.5), () => {
      const texelsPerPixel = frameResolution.mul(max(localUvDx.length(), localUvDy.length()));
      sampled.assign(atlas.sample(atlasUv).level(log2(max(texelsPerPixel, 1))));
    }).Else(() => {
      const gradientScale = vec2(frameResolution.div(u.number("uAtlasSize")));
      sampled.assign(atlas.sample(atlasUv)
        .grad(localUvDx.mul(gradientScale), localUvDy.mul(gradientScale)));
    });
    return sampled;
  };

  const color = Fn(() => {
    // Derivatives are captured before any stochastic discard: later explicit
    // and implicit derivatives are undefined after a non-uniform discard.
    const frameUv = uv().toVar();
    const frameUvDx = dFdx(frameUv).toVar();
    const frameUvDy = dFdy(frameUv).toVar();
    const frameUvWidth = abs(frameUvDx).add(abs(frameUvDy)).toVar();
    const frameResolution = u.number("uFrameResolution");
    const atlasTexelsPerPixel = frameResolution.mul(max(frameUvWidth.x, frameUvWidth.y)).toVar();
    const minification = smoothstep(MINIFICATION_START, MINIFICATION_FULL,
      atlasTexelsPerPixel).toVar();
    const fullyMinified = atlasTexelsPerPixel.greaterThanEqual(MINIFICATION_FULL).toVar();
    // Packed frames are separated by two padding gutters; past that separation
    // a coarser mip averages a neighbouring view in. Cap only the sampling
    // gradients, keeping the real footprint for policy and alpha hardening.
    const safeMipTexelsPerPixel = max(float(1), u.number("uPadding").mul(2));
    const mipGradientScale = min(float(1),
      safeMipTexelsPerPixel.div(max(atlasTexelsPerPixel, 0.0001))).toVar();
    const sampleUvDx = frameUvDx.mul(mipGradientScale).toVar();
    const sampleUvDy = frameUvDy.mul(mipGradientScale).toVar();

    const viewsPerAxis = u.number("uViewsPerAxis");
    const localView = vLocalView.toVar();
    const folded = vec3(localView.x, abs(localView.y), localView.z).toVar();
    folded.assign(folded.div(max(abs(folded.x).add(folded.y).add(abs(folded.z)), 0.0001)));
    const square = vec2(folded.x.add(folded.z), folded.x.sub(folded.z));
    const octahedralUv = clamp(square.mul(0.5).add(0.5), vec2(0), vec2(1)).toVar();
    const framePosition = octahedralUv.mul(viewsPerAxis).sub(0.5).toVar();
    const maximumFrame = viewsPerAxis.sub(1).toVar();
    const nearestFrame = clamp(floor(framePosition.add(0.5)), vec2(0), vec2(maximumFrame)).toVar();
    const atlasColor = vec4(0).toVar();
    const selectedFrame = nearestFrame.toVar();

    If(u.number("uBlendViews").lessThan(0.5), () => {
      atlasColor.assign(sampleFrame(nearestFrame, frameUv, sampleUvDx, sampleUvDy));
    }).Else(() => {
      // The stochastic frame index must not influence texture gradients:
      // neighbouring pixels can select frames a whole atlas cell apart.
      If(fullyMinified.not(), () => {
        const frameBase = floor(framePosition).toVar();
        const frameBlend = fract(framePosition).toVar();
        const frame00 = clamp(frameBase, vec2(0), vec2(maximumFrame)).toVar();
        const frame11 = min(frame00.add(vec2(1)), vec2(maximumFrame)).toVar();
        If(frameBase.x.lessThan(0).or(frameBase.x.greaterThanEqual(maximumFrame)), () => {
          frameBlend.x.assign(0);
          frame11.x.assign(frame00.x);
        });
        If(frameBase.y.lessThan(0).or(frameBase.y.greaterThanEqual(maximumFrame)), () => {
          frameBlend.y.assign(0);
          frame11.y.assign(frame00.y);
        });
        const weight00 = frameBlend.x.oneMinus().mul(frameBlend.y.oneMinus()).toVar();
        const weight10 = frameBlend.x.mul(frameBlend.y.oneMinus()).toVar();
        const weight01 = frameBlend.x.oneMinus().mul(frameBlend.y).toVar();
        const viewDither = coverageNoise(
          floor(frameUv.mul(frameResolution.mul(VIEW_DITHER_GRID))),
          vCard.w.mul(173).add(vCard.z.mul(0.131)).add(0.37)).toVar();
        If(viewDither.lessThan(weight00), () => {
          selectedFrame.assign(frame00);
        }).ElseIf(viewDither.lessThan(weight00.add(weight10)), () => {
          selectedFrame.assign(vec2(frame11.x, frame00.y));
        }).ElseIf(viewDither.lessThan(weight00.add(weight10).add(weight01)), () => {
          selectedFrame.assign(vec2(frame00.x, frame11.y));
        }).Else(() => {
          selectedFrame.assign(frame11);
        });
      });
      // Stable stochastic bilinear selection reproduces the four-view average
      // with one fetch while the card is large enough to benefit.
      atlasColor.assign(sampleFrame(selectedFrame, frameUv, sampleUvDx, sampleUvDy));
    });

    const cutoff = mix(u.number("uAlphaCutoff"), float(MINIFIED_ALPHA_CUTOFF), minification).toVar();
    // The atlas alpha is already geometric coverage from canvas rasterization
    // and mip filtering, so it is remapped directly rather than differentiated:
    // neighbouring pixels may choose different views on purpose.
    const alphaCoverage = atlasColor.a.sub(cutoff).div(max(cutoff.oneMinus(), 0.001))
      .clamp(0, 1).toVar();
    If(fullyMinified, () => {
      Discard(atlasColor.a.lessThanEqual(cutoff));
    }).Else(() => {
      const alphaDither = coverageNoise(floor(frameUv.mul(frameResolution)),
        vCard.w.mul(211).add(vCard.z.mul(0.173)).add(ALPHA_DITHER_SEED));
      // A strict >= is required: with >, a hash of exactly zero survives an
      // alphaCoverage of zero and paints an opaque pixel in transparent space.
      const alphaThreshold = mix(alphaDither, float(0.5), minification);
      Discard(alphaThreshold.greaterThanEqual(alphaCoverage));
    });

    const effectiveCoverage = vShade.z.mul(min(vShade.w.mul(u.number("uArtDensityScale")), 1)).toVar();
    // Once cards become tiny, coverage resolves per subpatch so no low-coverage
    // source turns into isolated pixels at the horizon. This test deliberately
    // follows the atlas sample; no derivatives are evaluated after a discard.
    const dither = float(0).toVar();
    If(fullyMinified, () => {
      dither.assign(coverageNoise(vec2(vCard.z, vCard.z.mul(MINIFIED_COVERAGE_SUBPATCH)),
        vCard.w.mul(97).add(MINIFIED_COVERAGE_SEED)));
    }).Else(() => {
      dither.assign(coverageNoise(floor(frameUv.mul(frameResolution)),
        vCard.w.mul(97).add(vCard.z.mul(0.217))));
    });
    Discard(dither.greaterThanEqual(effectiveCoverage));

    const bladeData = clamp(atlasColor.rgb.div(max(atlasColor.a, 0.001)), vec3(0), vec3(1)).toVar();
    const row = int(vCard.y.clamp(0, GRASS_MAX_BIOMES - 1).add(0.5));
    const rowBase = base.element(row).rgb;
    const rowTip = tip.element(row).rgb;
    const rowShade = shade.element(row);
    const resolved = grassResolvePaletteNode(rowBase, rowTip, dry.element(row).rgb,
      bladeData.r, bladeData.g, vShade.x, vShade.y, rowShade.y, rowShade.x).toVar();
    resolved.assign(mix(resolved, rowTip, vCard.x.mul(u.number("uGustTipBoost")).mul(bladeData.r)));
    resolved.assign(mix(resolved, rowBase, u.number("uBaseColorBlend")));
    resolved.mulAssign(u.number("uColorScale"));
    const lambert = resolved.mul(vIrradiance).mul(RECIPROCAL_PI)
      .add(resolved.mul(u.number("uAmbientBoost")));
    // Transmission is warmed towards the tip colour and scaled by the same
    // uniform as the near blades, with no extra per-LOD attenuation.
    return mix(resolved, lambert, GRASS_LIGHT_MIX)
      .add(mix(resolved, rowTip, 0.35).mul(vBackLight).mul(u.number("uBacklightStrength")));
  })();

  return { worldPosition, color };
}
