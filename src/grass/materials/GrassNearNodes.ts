import type { Node, NodeBuilder } from "three/webgpu";
import {
  Fn, If, abs, attribute, bool, cameraPosition, cos, cross, exp, float, floor, fract, int,
  inverseSqrt, mat3, mat4, max, min, mix, modelViewMatrix, modelWorldMatrix, normalGeometry,
  positionGeometry, positionLocal, pow, sin, subBuild, smoothstep, transformNormal, transformNormalToView, uv, varyingProperty,
  vec2, vec3, vec4,
} from "three/tsl";
import { GRASS_SHAPE_BEND_FRACTION } from "../../world/grass/GrassRuntimeMath";
import { instanceMatrixColumns } from "../../render/InstanceMatrixNode";
import { GRASS_MAX_BIOMES } from "../biome/GrassBiomeProfile";
import {
  GRASS_GUST_CROSS_PHASE, GRASS_GUST_CROSS_SCALE, GRASS_GUST_CROSS_SPEED, GRASS_GUST_CROSS_WEIGHT,
  GRASS_GUST_PRIMARY_WEIGHT, GRASS_TUFT_WIND_CELL_SCALE, GRASS_WEATHER_CALM_FLOOR,
  GRASS_WEATHER_PULSE_SPEED,
} from "../wind/WindNoiseTexture";
import { GRASS_VERTEX_PALETTE_ROOT_PROGRESS } from "./GrassPaletteShader";
import { grassResolvePaletteNode } from "./GrassPaletteNodes";
import type { GrassNodeUniforms } from "./GrassNearNodeInputs";

const TAU = 6.28318530718;
const WORLD_UP = vec3(0, 1, 0);
/**
 * The GLSL substitutes these two through `toFixed`, so the shader has always
 * used the rounded literal. The node port must round identically or the blade
 * shape and the vertex palette drift by a quantization step from the material
 * they are being compared against.
 */
const SHAPE_BEND = Number(GRASS_SHAPE_BEND_FRACTION.toFixed(3));
const PALETTE_ROOT_PROGRESS = Number(GRASS_VERTEX_PALETTE_ROOT_PROGRESS.toFixed(5));

/**
 * Compile-time material features, mirroring `GrassNearMaterialOptions`.
 *
 * These select node branches exactly where the GLSL selected chunks: the layer
 * that never reaches the character compiles no trail sampling at all, rather
 * than branching over it per blade.
 */
export interface GrassNearNodeFeatures {
  worldLod: boolean;
  vertexPalette: boolean;
  interactive: boolean;
  subPixelWidth: boolean;
  sheen: boolean;
  noiseWind: boolean;
  microWind: boolean;
  instanceFreeDither: boolean;
  shapeVariation: boolean;
}

/** Rodrigues rotation, the shared helper the vertex declarations carried. */
const rotateAroundAxis = Fn(([value, axis, sine, cosine]:
  [Node<"vec3">, Node<"vec3">, Node<"float">, Node<"float">]) =>
  value.mul(cosine).add(cross(axis, value).mul(sine)).add(axis.mul(axis.dot(value)).mul(cosine.oneMinus()))
);

/** The bounded palette row, clamped exactly as `grassResolveBiomeRow` clamps it. */
const biomeRow = (biome: Node<"float">) => int(biome.clamp(0, GRASS_MAX_BIOMES - 1).add(0.5));

export function createGrassNearNodes(u: GrassNodeUniforms, features: GrassNearNodeFeatures) {
  const time = u.number("uGrassTime");
  const windDirection = u.vector2("uGrassWindDirection");
  const progress = attribute<"float">("grassProgress", "float");
  const phase = attribute<"float">("grassPhase", "float");
  const bladeShade = attribute<"float">("grassBladeShade", "float");
  const variation = attribute<"vec4">("instanceVariation", "vec4");
  const instanceCoverage = attribute<"float">("instanceCoverage", "float");
  const instanceBiome = attribute<"float">("instanceBiome", "float");

  // Packed to keep the interpolator count at the GLSL's level; the values and
  // their order of evaluation are unchanged.
  const vShading = varyingProperty("vec4", "vGrassShading");     // progress, shade, dryness, rootAo
  const vField = varyingProperty("vec4", "vGrassField");         // biome, gust, ground shade, coverage
  const vSheen = varyingProperty("vec2", "vGrassSheen");
  const vViewNormal = varyingProperty("vec3", "vGrassViewNormal");
  const vColor = varyingProperty("vec3", "vGrassColor");

  const base = u.colorRows("uGrassBiomeBase");
  const tip = u.colorRows("uGrassBiomeTip");
  const dry = u.colorRows("uGrassBiomeDry");
  const shade = u.vector2Rows("uGrassBiomeShade");

  /** Two crossing waves; compact profiles compile this instead of a fetch. */
  const compactGust = (world: Node<"vec2">) => float(0.5).add(float(0.5).mul(
    sin(world.dot(windDirection).mul(u.number("uGrassGustFrontScale"))
      .sub(time.mul(u.number("uGrassGustFrontSpeed")))).mul(GRASS_GUST_PRIMARY_WEIGHT)
      .add(sin(world.dot(vec2(windDirection.y.negate(), windDirection.x)).mul(GRASS_GUST_CROSS_SCALE)
        .add(time.mul(GRASS_GUST_CROSS_SPEED)).add(GRASS_GUST_CROSS_PHASE)).mul(GRASS_GUST_CROSS_WEIGHT))));

  const position = Fn((builder: NodeBuilder) => {
    const columns = instanceMatrixColumns(builder);
    const instance = mat4(columns[0], columns[1], columns[2], columns[3]);
    const column0 = columns[0].xyz.toVar();
    const column1 = columns[1].xyz.toVar();
    const column2 = columns[2].xyz.toVar();
    const basis = mat3(column0, column1, column2);
    const worldRoot = modelWorldMatrix.mul(vec4(columns[3].xyz, 1)).xyz.toVar();
    const cameraDistance = cameraPosition.distance(worldRoot).toVar();
    const microFadeRange = u.vector2("uGrassMicroFadeRange");
    const microFade = smoothstep(microFadeRange.x, microFadeRange.y, cameraDistance).oneMinus().toVar();
    // Force the shared model-view matrix to initialize here. It is a lazily
    // declared variable, and the only places that read it are the wind and
    // trail branches, so leaving it to them declares it inside their scope:
    // every blade that skips those branches then projects through an
    // uninitialized matrix and the whole field collapses onto the camera.
    const modelView = modelViewMatrix.toVar();
    modelView.append();

    // --- beginnormal_vertex ---
    // The width axis comes from the source normal, before the flattening below.
    const sourceNormal = normalGeometry.toVar();
    const widthAxisRaw = cross(WORLD_UP, sourceNormal).toVar();
    const widthAxisLength = widthAxisRaw.length().toVar();
    const widthAxis = vec3(1, 0, 0).toVar();
    If(widthAxisLength.greaterThan(0.0001), () => { widthAxis.assign(widthAxisRaw.div(widthAxisLength)); });
    const side = uv().x.mul(2).sub(1).toVar();
    const bladePlaneNormal = cross(widthAxis, WORLD_UP).normalize().toVar();
    const normalUpRange = u.vector2("uGrassNormalUpRange");
    const normalUpHere = mix(normalUpRange.y, normalUpRange.x, microFade).toVar();
    const objectNormal = mix(sourceNormal, WORLD_UP, normalUpHere).normalize().toVar();
    bladePlaneNormal.assign(mix(bladePlaneNormal, WORLD_UP, normalUpHere).normalize());

    // --- begin_vertex ---
    const transformed = positionGeometry.toVar();
    if (features.shapeVariation) {
      const shapeAttribute = attribute<"vec4">("instanceShape", "vec4");
      const bladeWidth = attribute<"float">("grassBladeWidth", "float");
      const drift = shapeAttribute.x.mul(2).sub(1);
      const taper = mix(0.42, 1.2, shapeAttribute.y);
      const damage = shapeAttribute.z;
      const bend = shapeAttribute.w.mul(2).sub(1);
      const head = max(progress.oneMinus(), 0).toVar();
      const arm = widthAxis.mul(side).toVar();
      const center = transformed.sub(arm.mul(bladeWidth.mul(pow(head, 0.72)))).toVar();
      // The new profile replaces the exponent baked into the source blade.
      const width = bladeWidth.mul(pow(head, taper)).toVar();
      width.assign(max(width, bladeWidth.mul(0.55).mul(damage).mul(smoothstep(0.5, 0.85, progress))));
      center.y.mulAssign(float(1).sub(float(0.1).mul(damage).mul(smoothstep(0.9, 1, progress))));
      center.addAssign(widthAxis.mul(drift.mul(u.number("uGrassShapeTipDrift")).mul(bladeWidth)
        .mul(progress).mul(progress)));
      center.addAssign(cross(widthAxis, WORLD_UP).normalize()
        .mul(bend.mul(SHAPE_BEND).mul(center.y).mul(pow(progress, 1.6))));
      transformed.assign(center.add(arm.mul(width)));
    }

    // --- wind chunk ---
    const ditherInstance = features.instanceFreeDither ? float(0) : variation.x;
    const dither = fract(bladeShade.mul(0.754877666).add(phase.mul(0.569840296))
      .add(ditherInstance).add(u.number("uGrassDitherSeed"))).toVar();
    const gustNoise = (features.noiseWind
      ? u.texture("uGrassWindNoise").sample(worldRoot.xz.mul(u.number("uGrassWindNoiseScale"))
        .sub(windDirection.mul(time.mul(u.number("uGrassWindNoiseSpeed"))))).level(float(0)).r
      : compactGust(worldRoot.xz)).toVar();
    const fieldDither = fract(bladeShade.mul(0.438289).add(phase.mul(0.819173))
      .add(variation.x.mul(0.347193)).add(u.number("uGrassDitherSeed").mul(1.618034))).toVar();
    // Motion phase stays independent of both dithers: the mid layer's CPU draw
    // truncation reproduces grassDither exactly.
    const motionPhase = fract(phase.add(variation.x)).toVar();
    const scaleSquared = vec3(column0.dot(column0), column1.dot(column1), column2.dot(column2));
    const viewNormal = transformNormalToView(transformNormal(objectNormal, instance)).toVar();
    const widthAxisView = transformNormalToView(basis.mul(widthAxis)).toVar();
    const bladePlaneNormalView = transformNormalToView(
      basis.mul(bladePlaneNormal.div(max(scaleSquared, vec3(1e-8))))).toVar();
    // Trough curvature is micro detail: removed with distance without erasing
    // the direction the blade plane faces.
    viewNormal.assign(viewNormal.add(widthAxisView
      .mul(side.mul(u.number("uGrassBladeCurvature")).mul(microFade))).normalize());

    const transition = u.number("uGrassTransitionDistance");
    const nearDistance = u.number("uGrassNearDistance");
    const midDistance = u.number("uGrassMidDistance");
    const nearCoverage = smoothstep(nearDistance.sub(transition), nearDistance.add(transition),
      cameraDistance).oneMinus().toVar();
    const farDistanceEntry = smoothstep(midDistance.sub(transition), midDistance.add(transition),
      cameraDistance).toVar();
    const detailNear = u.number("uGrassDetailNearDistance");
    const detailTransition = u.number("uGrassDetailTransitionDistance");
    const detailCoverage = smoothstep(detailNear.sub(detailTransition), detailNear.add(detailTransition),
      cameraDistance).oneMinus().toVar();
    const densityFalloff = u.number("uGrassLodDensityScale").toVar();
    const keepLod = bool(false).toVar();
    if (features.worldLod) {
      If(u.number("uGrassLodInvert").lessThan(0.5), () => {
        keepLod.assign(dither.lessThanEqual(nearCoverage.mul(densityFalloff)));
      }).Else(() => {
        densityFalloff.mulAssign(mix(float(1), u.number("uGrassDensityFloor"),
          smoothstep(u.number("uGrassDensityFalloffStart"), u.number("uGrassDensityFalloffEnd"), cameraDistance)));
        const lodCut = max(nearCoverage, farDistanceEntry);
        keepLod.assign(dither.greaterThan(float(1).sub(densityFalloff.mul(lodCut.oneMinus()))));
      });
    } else {
      If(u.number("uGrassLodInvert").lessThan(0.5), () => {
        keepLod.assign(dither.lessThanEqual(u.number("uGrassLodThreshold")));
      }).Else(() => {
        keepLod.assign(dither.greaterThan(u.number("uGrassLodThreshold"))
          .and(dither.lessThanEqual(u.number("uGrassDistanceFade"))));
      });
    }
    const detailMode = u.number("uGrassDetailMode");
    const keepDetail = bool(true).toVar();
    If(detailMode.greaterThanEqual(0.5), () => {
      If(detailMode.lessThan(1.5), () => { keepDetail.assign(dither.greaterThan(detailCoverage)); })
        .Else(() => { keepDetail.assign(dither.lessThanEqual(detailCoverage)); });
    });
    const keepBlade = keepLod.and(keepDetail).and(fieldDither.lessThanEqual(
      min(instanceCoverage.mul(u.number("uGrassArtDensityScale")), 1))).toVar();
    // A rejected blade collapses to a zero-area triangle and is dropped at
    // primitive assembly; the fragment stage keeps its early-Z friendliness.
    If(keepBlade.not(), () => { transformed.assign(vec3(0)); });

    vSheen.assign(features.sheen
      ? vec2(smoothstep(u.number("uGrassSheenFadeDistance").mul(0.55), u.number("uGrassSheenFadeDistance"),
        cameraDistance).oneMinus().mul(float(0.45).add(gustNoise.mul(0.85))), mix(0.55, 1, progress))
      : vec2(0, mix(0.55, 1, progress)));

    const coverage = float(1).toVar();
    const groundShade = float(1).toVar();
    if (features.subPixelWidth) {
      If(keepBlade, () => {
        const widthScale = max(column0.length(), 0.0001).toVar();
        const sourceHalfWidth = u.number("uGrassBladeHalfWidth").mul(widthScale).toVar();
        // inversesqrt(falloff) is the width a survivor needs to cover the ground
        // its dropped neighbours used to; the colour payback below keeps the
        // field's average brightness where the LOD parity gate expects it.
        const targetHalfWidth = min(cameraDistance.mul(u.number("uGrassPixelWorldScale"))
          .mul(u.number("uGrassMinPixelWidth")).mul(0.5).mul(inverseSqrt(max(densityFalloff, 0.04))),
        u.number("uGrassMaxWidenDistance"));
        const widenedHalfWidth = max(sourceHalfWidth, targetHalfWidth).toVar();
        coverage.assign(sourceHalfWidth.div(widenedHalfWidth));
        transformed.addAssign(widthAxis.mul(side.mul(widenedHalfWidth.sub(sourceHalfWidth)).div(widthScale)));
      });
    }

    If(keepBlade.and(progress.greaterThan(0.001)), () => {
      const horizontalScale = max(column0.length(), 0.0001).toVar();
      const verticalScale = max(column1.length(), 0.0001).toVar();
      const depthScale = max(column2.length(), 0.0001).toVar();
      const weather = mix(GRASS_WEATHER_CALM_FLOOR, 1,
        float(0.5).add(sin(time.mul(GRASS_WEATHER_PULSE_SPEED)).mul(0.5))).toVar();
      const tuftPhase = fract(floor(worldRoot.xz.mul(GRASS_TUFT_WIND_CELL_SCALE))
        .dot(vec2(0.1731, 0.4197))).toVar();
      const gustEnvelope = mix(u.number("uGrassGustFrontDepth").oneMinus(), 1, gustNoise).mul(weather).toVar();
      const gust = sin(worldRoot.xz.dot(windDirection).div(u.number("uGrassGustScale"))
        .add(time.mul(u.number("uGrassGustSpeed"))).add(tuftPhase.mul(1.15))
        .add(variation.x.mul(0.42))).toVar();
      const flutter = (features.microWind
        ? sin(worldRoot.xz.dot(vec2(windDirection.y.negate(), windDirection.x))
          .div(u.number("uGrassGustScale").mul(0.37)).add(time.mul(u.number("uGrassFlutterSpeed")))
          .add(motionPhase.mul(TAU))).mul(mix(0.72, 1.18, variation.w))
        : float(0)).toVar();
      const stiffness = mix(0.76, 1.12, fract(tuftPhase.mul(1.61803398875).add(variation.x.mul(0.31))))
        .mul(mix(float(1), float(0.72), variation.w)).toVar();
      const bendAngle = gust.mul(u.number("uGrassWindStrength"))
        .add(flutter.mul(u.number("uGrassFlutterStrength")).mul(microFade))
        .mul(variation.y).mul(stiffness).mul(pow(progress, 1.65))
        .mul(u.number("uGrassWindLodScale")).mul(gustEnvelope).toVar();
      const worldWind = vec3(windDirection.x, 0, windDirection.y);
      // Rotate about the root instead of translating: translation makes a bent
      // blade longer than a straight one.
      const windLocal = vec2(worldWind.dot(column0.div(horizontalScale)),
        worldWind.dot(column2.div(depthScale))).toVar();
      const windSin = sin(bendAngle).toVar();
      const windCos = cos(bendAngle).toVar();
      const windHeight = transformed.y.toVar();
      transformed.x.addAssign(windLocal.x.mul(windHeight).mul(windSin).mul(verticalScale.div(horizontalScale)));
      transformed.z.addAssign(windLocal.y.mul(windHeight).mul(windSin).mul(verticalScale.div(depthScale)));
      transformed.y.mulAssign(windCos);
      const windAxis = vec3(windLocal.y, 0, windLocal.x.negate()).toVar();
      const windAxisLength = windAxis.length().toVar();
      If(windAxisLength.greaterThan(0.0001), () => {
        const windAxisView = modelView.mul(vec4(basis.mul(windAxis.div(windAxisLength)), 0)).xyz.normalize();
        viewNormal.assign(rotateAroundAxis(viewNormal, windAxisView, windSin, windCos).normalize());
        bladePlaneNormalView.assign(
          rotateAroundAxis(bladePlaneNormalView, windAxisView, windSin, windCos).normalize());
      });

      if (features.interactive) {
        // Contact occlusion under the character: grass takes no part in the
        // shadow map, so without this the field stays fully lit up to the feet.
        If(u.number("uGrassGroundShadowStrength").greaterThan(0), () => {
          const disc = u.vector4("uGrassGroundShadowDisc");
          const groundOffset = worldRoot.xz.sub(disc.xz).toVar();
          const groundRadius = max(disc.w, 0.0001).toVar();
          const groundFalloff = groundOffset.length().div(groundRadius).clamp(0, 1).oneMinus().toVar();
          If(groundFalloff.greaterThan(0), () => {
            // Grass on a bank above the character must not darken as if it were underfoot.
            const groundLift = abs(worldRoot.y.sub(disc.y)).mul(0.6).clamp(0, 1).oneMinus();
            groundShade.assign(float(1).sub(groundFalloff.mul(groundFalloff).mul(groundLift)
              .mul(u.number("uGrassGroundShadowStrength")).mul(progress.mul(0.72).oneMinus())));
          });
        });
        If(u.number("uGrassTrailStrength").greaterThan(0), () => {
          const trailUv = worldRoot.xz.sub(u.vector2("uGrassTrailCenter"))
            .mul(u.number("uGrassTrailInverseCoverage")).add(0.5).toVar();
          const inside = trailUv.greaterThanEqual(vec2(0)).all().and(trailUv.lessThanEqual(vec2(1)).all());
          If(inside, () => {
            const trailSample = u.texture("uGrassTrailMap").sample(trailUv).level(float(0)).toVar();
            const crush = trailSample.b.toVar();
            const trailDirection = trailSample.rg.mul(2).sub(1).toVar();
            const trailDirectionLength = trailDirection.length().toVar();
            If(crush.greaterThan(0.004).and(trailDirectionLength.greaterThan(0.02)), () => {
              trailDirection.assign(trailDirection.div(trailDirectionLength));
              const seed = fract(variation.x.mul(3.719).add(phase.mul(2.61803398875))).toVar();
              const trailStiffness = mix(1.22, 0.78, seed);
              const response = float(1).sub(exp(crush.mul(trailStiffness).mul(-3.4))).toVar();
              const wobble = float(1).add(u.number("uGrassTrailWobbleAmplitude").mul(trailSample.a)
                .mul(sin(time.mul(u.number("uGrassTrailWobbleFrequency")).add(seed.mul(TAU)))));
              const habitatBend = mix(0.7, 1.22, verticalScale.sub(0.68).mul(1.9).clamp(0, 1))
                .mul(variation.w.mul(0.48).oneMinus());
              const trailAngle = u.number("uGrassTrailMaxAngle").mul(u.number("uGrassTrailStrength"))
                .mul(response).mul(wobble).mul(habitatBend).clamp(0, 1.48).toVar();
              // The angle grows towards the tip, so the blade curves instead of
              // tilting rigidly out of the ground.
              const theta = trailAngle.mul(pow(progress, 0.85)).toVar();
              const trailSin = sin(theta).toVar();
              const trailCos = cos(theta).toVar();
              const trailWorld = vec3(trailDirection.x, 0, trailDirection.y);
              const trailLocal = vec2(trailWorld.dot(column0.div(horizontalScale)),
                trailWorld.dot(column2.div(depthScale))).toVar();
              const trailHeight = transformed.y.toVar();
              transformed.x.addAssign(trailLocal.x.mul(trailHeight).mul(trailSin)
                .mul(verticalScale.div(horizontalScale)));
              transformed.z.addAssign(trailLocal.y.mul(trailHeight).mul(trailSin)
                .mul(verticalScale.div(depthScale)));
              transformed.y.mulAssign(trailCos);
              const trailAxis = vec3(trailLocal.y, 0, trailLocal.x.negate()).toVar();
              const trailAxisLength = trailAxis.length().toVar();
              If(trailAxisLength.greaterThan(0.0001), () => {
                const trailAxisView = modelView
                  .mul(vec4(basis.mul(trailAxis.div(trailAxisLength)), 0)).xyz.normalize();
                viewNormal.assign(rotateAroundAxis(viewNormal, trailAxisView, trailSin, trailCos).normalize());
                bladePlaneNormalView.assign(
                  rotateAroundAxis(bladePlaneNormalView, trailAxisView, trailSin, trailCos).normalize());
              });
            });
          });
        });
      }
    });

    If(keepBlade, () => {
      // The far end of the micro fade keeps the wind-oriented blade plane
      // rather than collapsing every blade toward world up.
      viewNormal.assign(mix(viewNormal, bladePlaneNormalView, microFade.oneMinus()).normalize());
    });
    vViewNormal.assign(viewNormal);

    const bladeShadeFaded = mix(bladeShade, 0.5, microFade.oneMinus().mul(0.86)).toVar();
    vShading.assign(vec4(progress, bladeShadeFaded, variation.w, variation.z));
    vField.assign(vec4(instanceBiome, gustNoise, groundShade, coverage));
    if (features.vertexPalette) {
      // The palette is resolved at a progress lifted off the root: a
      // one-triangle blade only offers 0 and 1, so the chord under a concave
      // curve has to carry the correct area-weighted mean.
      const row = biomeRow(instanceBiome);
      const rowBase = base.element(row).rgb;
      const rowTip = tip.element(row).rgb;
      const rowShade = shade.element(row);
      const paletteColor = grassResolvePaletteNode(rowBase, rowTip, dry.element(row).rgb,
        mix(float(PALETTE_ROOT_PROGRESS), float(1), progress), bladeShadeFaded, variation.w, variation.z,
        rowShade.y, rowShade.x).toVar();
      paletteColor.assign(mix(paletteColor, rowTip,
        gustNoise.mul(u.number("uGrassGustTipBoost")).mul(progress)));
      const canopy = mix(u.colorRows("uGrassBiomeCanopyHealthy").element(row).rgb,
        u.colorRows("uGrassBiomeCanopyDry").element(row).rgb, variation.w);
      vColor.assign(mix(paletteColor, canopy, coverage.oneMinus()));
    }
    return instance.mul(vec4(transformed, 1)).xyz;
  })();

  /** Blade albedo, including the character's contact shading. */
  const color = Fn(() => {
    const resolved = (features.vertexPalette
      ? vColor
      : Fn(() => {
        const row = biomeRow(vField.x);
        const rowShade = shade.element(row);
        const palette = grassResolvePaletteNode(base.element(row).rgb, tip.element(row).rgb,
          dry.element(row).rgb, vShading.x, vShading.y, vShading.z, vShading.w,
          rowShade.y, rowShade.x);
        return mix(palette, tip.element(row).rgb,
          vField.y.mul(u.number("uGrassGustTipBoost")).mul(vShading.x));
      })()).toVar();
    if (features.interactive) resolved.mulAssign(vField.z);
    return resolved;
  })();

  return {
    position,
    /** The vertex stage owns the wind- and trail-rotated normal. */
    normal: vViewNormal.normalize(),
    color,
    progress: vShading.x,
    dryness: vShading.z,
    sheen: vSheen,
  };
}

export type GrassNearNodeGraph = ReturnType<typeof createGrassNearNodes>;

/**
 * The position setup a grass node material must use.
 *
 * The blade applies the instance transform inside its own position node, so
 * three's built-in instancing must not emit a second instance matrix: the two
 * together exceed both WebGPU's vertex buffer floor and WebGL 2's attribute
 * locations. Morph targets, skinning, batching and displacement maps are not
 * part of any grass representation and are rejected rather than silently
 * dropped here.
 */
export function setupGrassPosition(builder: NodeBuilder, node: Node<"vec3">): Node<"vec3"> {
  const { geometry } = builder;
  const object = builder.object as { isSkinnedMesh?: boolean; isBatchedMesh?: boolean };
  if (object.isSkinnedMesh === true || object.isBatchedMesh === true
    || geometry.morphAttributes.position || geometry.morphAttributes.normal) {
    throw new Error("Grass node materials support neither skinning, batching nor morph targets.");
  }
  positionLocal.assign(subBuild(node, "POSITION", "vec3"));
  return positionLocal;
}
