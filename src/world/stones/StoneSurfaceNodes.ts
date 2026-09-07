import type { Node, TextureNode } from "three/webgpu";
import {
  Fn, If, abs, attribute, cameraPosition, clamp, cross, dFdx, dFdy, float, floor, fract, fwidth,
  max, min,
  mix, modelWorldMatrix, normalGeometry, normalView, positionGeometry, pow,
  positionView, sign, smoothstep, varying, vec2, vec3, vec4,
} from "three/tsl";
import {
  STONE_PACKED_COLONY_COLOR, STONE_PACKED_COLOR, STONE_PACKED_GROWTH,
  STONE_PACKED_GROWTH_CHANNELS, STONE_PACKED_NORMAL, STONE_PACKED_SURFACE,
} from "./StoneNodeGeometry";

/**
 * The stone surface, as nodes.
 *
 * Everything the shipped chunks compute per fragment is here: the weathering
 * crust and stain, the broken bedding partings, the moss and lichen colonies
 * with their breakup and runoff, the triplanar grain in both its albedo and its
 * normal-bump form, and the wet darkening. The lit additions — sheen, the
 * ambient floor and the sky-side fill — belong to the material, because they
 * apply after the lighting model rather than to the albedo.
 */
export interface StoneSurfaceInputs {
  crustBreakup: Node<"float">;
  wetDarken: Node<"float">;
  growthDetailStrength: Node<"float">;
  growthDetailScale: Node<"float">;
  growthDetailFadeSquared: Node<"vec2">;
  mossStreakStrength: Node<"float">;
  grain?: {
    texture: TextureNode;
    strength: Node<"float">;
    normalStrength: Node<"float">;
    scale: Node<"float">;
    fadeSquared: Node<"vec2">;
  };
}

const stoneGrowthHash = Fn(([point]: [Node<"vec2">]) => {
  const value = fract(vec3(point.x, point.y, point.x).mul(0.1031)).toVar();
  value.addAssign(value.dot(value.yzx.add(33.33)));
  return fract(value.x.add(value.y).mul(value.z));
});

const stoneGrowthNoise = Fn(([point]: [Node<"vec2">]) => {
  const cell = floor(point);
  const fraction = fract(point);
  const weight = fraction.mul(fraction).mul(fraction.mul(-2).add(3));
  return mix(
    mix(stoneGrowthHash(cell), stoneGrowthHash(cell.add(vec2(1, 0))), weight.x),
    mix(stoneGrowthHash(cell.add(vec2(0, 1))), stoneGrowthHash(cell.add(vec2(1, 1))), weight.x),
    weight.y);
});

/** Whichever axis the normal leans on least carries the projection. */
const stoneGrowthProjection = Fn(([position, normal]: [Node<"vec3">, Node<"vec3">]) => {
  const axis = abs(normal);
  const projected = position.xy.toVar();
  If(axis.y.greaterThanEqual(axis.x).and(axis.y.greaterThanEqual(axis.z)), () => {
    projected.assign(position.xz);
  }).ElseIf(axis.x.greaterThanEqual(axis.z), () => {
    projected.assign(position.zy);
  });
  return projected;
});

const stoneColony = Fn(([point, center, innerRadius, outerRadius]:
  [Node<"vec3">, Node<"vec3">, Node<"float">, Node<"float">]) => {
  const delta = point.sub(center);
  return smoothstep(innerRadius.mul(innerRadius), outerRadius.mul(outerRadius),
    delta.dot(delta)).oneMinus();
});

/**
 * The baked channels, read through the portable views.
 *
 * `prepareStoneNodeGeometry` re-views the shipped interleaved streams in
 * four-component windows because WebGPU has no three-component 8- or 16-bit
 * vertex format. The values are the same bytes the WebGL path reads; only the
 * windows differ, so the channels are put back together here rather than in
 * every place that wants one.
 */
export function createStoneSurfaceAttributes() {
  const packedNormal = attribute<"vec4">(STONE_PACKED_NORMAL, "vec4");
  const packedGrowth = attribute<"vec2">(STONE_PACKED_GROWTH, "vec2");
  const packedColor = attribute<"vec4">(STONE_PACKED_COLOR, "vec4");
  const growthChannels = attribute<"vec4">(STONE_PACKED_GROWTH_CHANNELS, "vec4");
  const colonyColor = attribute<"vec4">(STONE_PACKED_COLONY_COLOR, "vec4");
  const surface = attribute<"vec4">(STONE_PACKED_SURFACE, "vec4");
  return {
    color: packedColor.xyz,
    wet: surface.x,
    weathering: surface.y,
    bedding: surface.z,
    moss: packedColor.w,
    lichen: growthChannels.x,
    growthSeed: growthChannels.y,
    growthPosition: vec3(packedNormal.w, packedGrowth.x, packedGrowth.y),
    mossColor: vec3(growthChannels.z, growthChannels.w, colonyColor.x),
    lichenColor: colonyColor.yzw,
  };
}

export type StoneSurfaceAttributes = ReturnType<typeof createStoneSurfaceAttributes>;

export function createStoneSurfaceNodes(u: StoneSurfaceInputs, a: StoneSurfaceAttributes,
  baseColor: Node<"vec3">) {
  // Transformed in the vertex stage and interpolated, as the shipped varyings
  // are. Transforming an interpolated attribute instead would agree in exact
  // arithmetic and drift in the last bits.
  const worldPosition = varying(modelWorldMatrix.mul(vec4(positionGeometry, 1)).xyz);
  const worldNormal = varying(modelWorldMatrix.mul(vec4(normalGeometry, 0)).xyz);

  /** Distance fade and the grain height, shared by the colour and the bump. */
  const detail = Fn(() => {
    const cameraDelta = cameraPosition.sub(worldPosition).toVar();
    const distanceSquared = cameraDelta.dot(cameraDelta).toVar();
    const fade = smoothstep(u.growthDetailFadeSquared.x, u.growthDetailFadeSquared.y,
      distanceSquared).oneMinus();
    return u.growthDetailStrength.clamp(0, 1).mul(fade);
  })();

  /**
   * The triplanar grain height.
   *
   * Sampled unconditionally rather than behind its fade test: the bump reads it
   * with screen-space derivatives, and a derivative taken inside non-uniform
   * control flow is undefined — at the fade boundary that shows as a seam of
   * wrong shading one pixel wide.
   */
  const grainHeight = u.grain ? Fn(() => {
    const blend = pow(abs(worldNormal.normalize()), vec3(4)).toVar();
    blend.assign(blend.div(max(blend.x.add(blend.y).add(blend.z), 0.0001)));
    const grain = u.grain!;
    return grain.texture.sample(worldPosition.zy.mul(grain.scale)).r.mul(blend.x)
      .add(grain.texture.sample(worldPosition.xz.mul(grain.scale)).r.mul(blend.y))
      .add(grain.texture.sample(worldPosition.xy.mul(grain.scale)).r.mul(blend.z));
  })() : undefined;

  const grainFade = u.grain ? Fn(() => {
    const cameraDelta = cameraPosition.sub(worldPosition).toVar();
    const distanceSquared = cameraDelta.dot(cameraDelta).toVar();
    return smoothstep(u.grain!.fadeSquared.x, u.grain!.fadeSquared.y, distanceSquared).oneMinus();
  })() : undefined;

  const color = Fn(() => {
    const albedo = baseColor.toVar();
    const detailWeight = detail.toVar();
    const surfaceNormal = worldNormal.normalize().toVar();

    // Outside the growth branch on purpose: a bare stone with no moss and no
    // lichen still has a crust, and putting this inside that branch made
    // weathering a property of having colonies on it.
    const weatherNoise = float(0).toVar();
    If(detailWeight.greaterThan(0.001), () => {
      const weatherUv = stoneGrowthProjection(worldPosition, surfaceNormal)
        .mul(u.growthDetailScale);
      weatherNoise.assign(stoneGrowthNoise(weatherUv.mul(1.15).add(vec2(5.71, 31.43))));
      const weatherField = a.weathering.add(weatherNoise.sub(0.5).mul(u.crustBreakup)).toVar();
      const crustMask = smoothstep(0.6, 0.78, weatherField);
      const stainMask = smoothstep(0.26, 0.44, weatherField).oneMinus();
      albedo.assign(mix(albedo, albedo.mul(vec3(1.14, 1.11, 1)), crustMask.mul(detailWeight)));
      albedo.assign(mix(albedo, albedo.mul(vec3(0.9, 0.82, 0.68)), stainMask.mul(detailWeight)));

      // Bedding is a broken geological accent, never a continuous contour map.
      If(a.bedding.greaterThan(0.001), () => {
        const bedPhase = stoneGrowthHash(vec2(a.growthSeed.mul(91.7).add(3.1),
          a.growthSeed.mul(47.3).add(8.9))).toVar();
        const bedHeight = a.growthPosition.y.add(weatherNoise.sub(0.5).mul(0.055)).toVar();
        const bedA = bedPhase.sub(0.5).mul(0.1).add(0.31);
        const bedB = float(0.5).sub(bedPhase).mul(0.12).add(0.66);
        const bedDistance = min(abs(bedHeight.sub(bedA)), abs(bedHeight.sub(bedB)));
        const bedHalfWidth = mix(float(0.006), float(0.011), a.bedding);
        const bedAntialias = max(fwidth(bedHeight), 0.004);
        const bedSeam = smoothstep(bedHalfWidth, bedHalfWidth.add(bedAntialias),
          bedDistance).oneMinus();
        const bedSide = smoothstep(0.16, 0.58, abs(surfaceNormal.y).oneMinus());
        const bedBreakup = smoothstep(0.44, 0.68, stoneGrowthNoise(
          a.growthPosition.xz.mul(2.2)
            .add(vec2(a.growthSeed.mul(19.3), a.growthSeed.mul(31.7)))));
        const bedMask = bedSeam.mul(bedSide).mul(bedBreakup).mul(a.bedding).mul(detailWeight);
        albedo.assign(mix(albedo, albedo.mul(vec3(0.76, 0.68, 0.58)), bedMask.mul(0.55)));
      });
    });

    If(a.moss.add(a.lichen).greaterThan(0.001), () => {
      const mossCoverage = a.moss.toVar();
      const lichenCoverage = a.lichen.toVar();
      const mossColorVariation = float(1).toVar();
      const lichenColorVariation = float(1).toVar();

      If(detailWeight.greaterThan(0.001), () => {
        const growthOffset = vec2(a.growthSeed.mul(37.17), a.growthSeed.mul(71.93));
        const growthUv = stoneGrowthProjection(worldPosition, surfaceNormal)
          .add(growthOffset).toVar();
        const colonyNoise = stoneGrowthNoise(growthUv.mul(u.growthDetailScale).mul(0.32)
          .add(vec2(7.31, 19.17))).toVar();
        const noiseColonyMask = smoothstep(0.18, 0.72, colonyNoise.add(a.moss.mul(0.24)));
        const centerA = vec3(stoneGrowthHash(vec2(a.growthSeed.mul(17.3), 2.1)).sub(0.5),
          stoneGrowthHash(vec2(a.growthSeed.mul(29.7), 5.4)).mul(0.26).add(0.06),
          stoneGrowthHash(vec2(a.growthSeed.mul(41.9), 8.7)).sub(0.5)).mul(vec3(0.82, 1, 0.82));
        const centerB = vec3(stoneGrowthHash(vec2(a.growthSeed.mul(53.1), 11.2)).sub(0.5),
          stoneGrowthHash(vec2(a.growthSeed.mul(67.7), 14.6)).mul(0.3).add(0.08),
          stoneGrowthHash(vec2(a.growthSeed.mul(79.3), 17.9)).sub(0.5)).mul(vec3(0.9, 1, 0.9));
        const centerC = vec3(stoneGrowthHash(vec2(a.growthSeed.mul(91.7), 21.3)).sub(0.5),
          stoneGrowthHash(vec2(a.growthSeed.mul(103.9), 24.8)).mul(0.34).add(0.1),
          stoneGrowthHash(vec2(a.growthSeed.mul(117.1), 28.2)).sub(0.5)).mul(vec3(0.86, 1, 0.86));
        const distortion = colonyNoise.sub(0.5).mul(0.2).toVar();
        const innerA = max(float(0.03), float(0.29).sub(distortion)).toVar();
        const outerA = max(innerA.add(0.03), float(0.41).sub(distortion));
        const innerB = max(float(0.03), float(0.26).sub(distortion)).toVar();
        const outerB = max(innerB.add(0.03), float(0.37).sub(distortion));
        const innerC = max(float(0.03), float(0.22).sub(distortion)).toVar();
        const outerC = max(innerC.add(0.03), float(0.32).sub(distortion));
        const connected = max(stoneColony(a.growthPosition, centerA, innerA, outerA),
          max(stoneColony(a.growthPosition, centerB, innerB, outerB),
            stoneColony(a.growthPosition, centerC, innerC, outerC))).toVar();
        const colonyMask = max(connected, noiseColonyMask.mul(0.28));
        const mossPotential = smoothstep(0.06, 0.65, a.moss);
        mossCoverage.assign(mix(a.moss, mossPotential.mul(colonyMask),
          min(float(0.92), detailWeight.mul(0.96))));

        const lichenNoise = stoneGrowthNoise(growthUv.mul(u.growthDetailScale).mul(0.58)
          .add(vec2(41.73, 8.91))).toVar();
        const lichenPattern = smoothstep(0.55, 0.79, lichenNoise);
        lichenCoverage.assign(a.lichen.mul(mix(float(1), lichenPattern, detailWeight)));

        const fineNoise = stoneGrowthNoise(growthUv.mul(u.growthDetailScale).mul(2.35)
          .add(vec2(23.41, 57.13)));
        const mossBreakup = smoothstep(0.27, 0.76,
          fineNoise.mul(0.64).add(colonyNoise.mul(0.36)));
        mossCoverage.mulAssign(mix(float(1), max(float(0.05), mossBreakup), detailWeight));

        const sideAmount = abs(surfaceNormal.y).oneMinus();
        const runoffNoise = stoneGrowthNoise(vec2(
          worldPosition.x.add(worldPosition.z.mul(0.37)).add(a.growthSeed.mul(13))
            .mul(u.growthDetailScale).mul(0.62),
          worldPosition.y.mul(u.growthDetailScale).mul(0.24)).add(vec2(11.7, 3.9)));
        const runoff = smoothstep(0.24, 0.78, runoffNoise);
        mossCoverage.mulAssign(mix(float(1), runoff.mul(0.58).add(0.55),
          u.mossStreakStrength.mul(sideAmount).mul(detailWeight)));

        const lichenFine = stoneGrowthNoise(growthUv.mul(u.growthDetailScale).mul(4.2)
          .add(vec2(71.1, 14.3)));
        const lichenBreakup = smoothstep(0.62, 0.86,
          lichenFine.mul(0.68).add(lichenNoise.mul(0.32)));
        lichenCoverage.mulAssign(mix(float(1), lichenBreakup, detailWeight));

        mossColorVariation.assign(mix(float(1), mix(float(0.82), float(1.08), colonyNoise),
          detailWeight));
        lichenColorVariation.assign(mix(float(1), mix(float(0.9), float(1.08), lichenNoise),
          detailWeight));
      });

      albedo.assign(mix(albedo, a.lichenColor.mul(lichenColorVariation),
        clamp(lichenCoverage, 0, 1)));
      albedo.assign(mix(albedo, a.mossColor.mul(mossColorVariation),
        clamp(mossCoverage, 0, 1)));
    });

    // Wet stone in two halves: the albedo goes down because water fills the
    // pores, and the material's sheen is the half that says water.
    If(a.wet.greaterThan(0.001), () => {
      albedo.mulAssign(mix(float(1), u.wetDarken, a.wet));
    });

    if (u.grain && grainHeight && grainFade) {
      albedo.mulAssign(grainHeight.sub(0.5).mul(2).mul(u.grain.strength).mul(grainFade).add(1));
    }
    return albedo;
  })();

  /**
   * Grain that moves the shading instead of the albedo.
   *
   * The gradient comes from screen-space derivatives rather than extra taps:
   * build a basis from the derivatives of view position, project the height
   * gradient onto it, and lean the normal away.
   */
  const normal = u.grain && grainHeight && grainFade ? Fn(() => {
    const shaded = normalView.toVar();
    const viewPosition = positionView.toVar();
    const surfaceX = dFdx(viewPosition).toVar();
    const surfaceY = dFdy(viewPosition).toVar();
    const heightX = dFdx(grainHeight).toVar();
    const heightY = dFdy(grainHeight).toVar();
    const r1 = cross(surfaceY, shaded).toVar();
    const r2 = cross(shaded, surfaceX).toVar();
    const determinant = surfaceX.dot(r1).toVar();
    const gradient = sign(determinant).mul(heightX.mul(r1).add(heightY.mul(r2)));
    return abs(determinant).mul(shaded)
      .sub(gradient.mul(u.grain!.normalStrength).mul(grainFade)).normalize();
  })() : undefined;

  return { color, normal, wet: a.wet };
}

/** The far batches' surface: colonies and wet albedo, with no close detail. */
export function createStoneCoarseNodes(wetDarken: Node<"float">, a: StoneSurfaceAttributes,
  baseColor: Node<"vec3">) {
  return Fn(() => {
    const albedo = baseColor.toVar();
    If(a.moss.add(a.lichen).greaterThan(0.001), () => {
      albedo.assign(mix(albedo, a.lichenColor, a.lichen));
      albedo.assign(mix(albedo, a.mossColor, a.moss));
    });
    albedo.mulAssign(mix(float(1), wetDarken, a.wet));
    return albedo;
  })();
}
