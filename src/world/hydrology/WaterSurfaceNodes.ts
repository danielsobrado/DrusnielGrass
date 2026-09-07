import type { Node, TextureNode } from "three/webgpu";
import {
  Discard, Fn, If, attribute, cameraPosition, cameraViewMatrix, float, frontFacing,
  max, min, mix, modelWorldMatrix, normalLocal, positionGeometry, pow, select,
  sin, smoothstep, varying, vec2, vec3, vec4,
} from "three/tsl";
import {
  WATER_BEND_DARKEN, WATER_BEND_FLOW_GAIN, WATER_BEND_FLOW_LOSS, WATER_BEND_LIGHTEN,
  WATER_REGIME_INNER_BANK_WEIGHT, WATER_REGIME_MORPHOLOGY_WEIGHT, WATER_REGIME_OUTER_BANK_WEIGHT,
  WATER_RIVER_BANK_FLOW_SCALE, WATER_RIVER_POOL_FREQUENCY_SCALE,
  WATER_RIVER_RIFFLE_FREQUENCY_SCALE, WATER_RIVER_SHALLOW_ENERGY_WEIGHT,
  WATER_RIVER_SLOPE_ENERGY_WEIGHT, WATER_VISIBLE_COVERAGE_THRESHOLD,
} from "./WaterMaterialTuning";
import {
  waterOpticsFresnelNode, waterOpticsResolveColorNode, type WaterOpticsInputs,
} from "./WaterOpticsNodes";
import {
  waterResolveBankSidesNode, waterResolveLakeExposureNode, waterResolveLakeShoreBandNode,
  waterResolveRegimeNode, waterResolveStreakStretchNode,
} from "./WaterRegimeNodes";
import {
  waterResolveLakeSlopeNode, waterResolveMicroSlopeNode, waterResolveRiffleFoamNode,
  waterResolveRiverPhasesNode, waterResolveRiverSlopeNode, waterResolveShoreFoamNode,
  waterResolveStoneEdgeNode, waterSampleAdvectedNoiseNode,
} from "./WaterSurfaceHelperNodes";

/**
 * The water surface, as nodes.
 *
 * The shipped material patches `MeshPhysicalMaterial` at
 * `<normal_fragment_maps>` and writes four things: the view-space normal, the
 * albedo, the roughness and the alpha. This module produces those same four as
 * separate nodes over one shared graph — every intermediate below is a single
 * node object referenced from each output that needs it, so the slope the
 * normal bends by is literally the slope the refraction offset samples with,
 * which the one shipped fragment guarantees only by writing them in order.
 *
 * Nothing here owns water state: the caller hands in nodes bound to the
 * `IUniform` table `WaterMaterialController` already writes.
 */
export interface WaterSurfaceInputs extends WaterOpticsInputs {
  time: Node<"float">;
  opacity: Node<"float">;
  /**
   * The base the surface adds its own roughness to. It mirrors the shipped
   * material's `roughness` property rather than reading the node material's
   * own, so the two paths cannot end up shading at different base roughness
   * while one owner writes both.
   */
  roughnessBase: Node<"float">;
  rippleStrength: Node<"float">;
  rippleScale: Node<"float">;
  flowSpeed: Node<"float">;
  riverReferenceDepth: Node<"float">;
  riverPoolFlowScale: Node<"float">;
  riverRiffleFlowScale: Node<"float">;
  foamStrength: Node<"float">;
  shoreFoamWeight: Node<"float">;
  riffleFoamWeight: Node<"float">;
  stoneFoamWeight: Node<"float">;
  fresnelStrength: Node<"float">;
  detailDistance: Node<"float">;
  lakeWaveStrength: Node<"float">;
  flowNoise: TextureNode;
  flowNoiseScale: Node<"float">;
  flowNoiseStrength: Node<"float">;
  glintStrength: Node<"float">;
  stoneWakeStrength: Node<"float">;
  shallow: Node<"vec3">;
  deep: Node<"vec3">;
  reflection: Node<"vec3">;
  foam: Node<"vec3">;
  sunDirection: Node<"vec3">;
}

export function createWaterSurfaceNodes(u: WaterSurfaceInputs) {
  const data = varying(attribute<"vec4">("waterData", "vec4"));
  const context = varying(attribute<"vec4">("waterContext", "vec4"));
  const interaction = varying(attribute<"vec2">("waterInteraction", "vec2"));
  const worldPosition = varying(modelWorldMatrix.mul(vec4(positionGeometry, 1)).xyz);
  const worldNormalRaw = varying(modelWorldMatrix.mul(vec4(normalLocal, 0)).xyz);

  /** A degenerate normal reads as up, and the sheet is never shaded from below. */
  const geometricNormal = Fn(() => {
    const length = worldNormalRaw.length().toVar();
    const resolved = vec3(0, 1, 0).toVar();
    If(length.greaterThan(1e-4), () => { resolved.assign(worldNormalRaw.div(length)); });
    If(resolved.y.lessThan(0), () => { resolved.assign(resolved.negate()); });
    return resolved;
  })();

  const coverageRaw = data.x.clamp(0, 1);
  const coverage = smoothstep(0.015, 0.34, coverageRaw);
  const depth = max(float(0), data.y);
  const packedFlow = data.zw;
  const riverAmount = packedFlow.length().clamp(0, 1);
  const flowDirection = Fn(() => {
    const resolved = vec2(0.78, 0.63).normalize().toVar();
    If(riverAmount.greaterThan(0.001), () => { resolved.assign(packedFlow.div(riverAmount)); });
    return resolved;
  })();
  const flowPerpendicular = vec2(flowDirection.y.negate(), flowDirection.x);
  const position = worldPosition.xz;
  const detailWeight = smoothstep(u.detailDistance.mul(0.55), u.detailDistance,
    cameraPosition.distance(worldPosition)).oneMinus();
  const riverDepthRatio = depth.div(max(float(0.1), u.riverReferenceDepth));
  const channelCore = smoothstep(0.35, 0.88, coverageRaw);
  const shallowEnergy = smoothstep(0.68, 1.02, riverDepthRatio).oneMinus();
  const surfaceSlopeEnergy = geometricNormal.y.oneMinus().mul(6).clamp(0, 1);

  // Everything the hydrology already knew about this vertex, packed once.
  const lakeDistance = context.w;
  const banks = waterResolveBankSidesNode(context.x, context.y, riverAmount);
  const outerBank = banks.x;
  const innerBank = banks.y;
  const lakeAmount = riverAmount.oneMinus();
  const openLake = waterResolveLakeExposureNode(lakeDistance).mul(lakeAmount);
  const lakeShore = waterResolveLakeShoreBandNode(lakeDistance).mul(lakeAmount);

  /**
   * The pool -> run -> riffle -> rapid continuum is river-only. A lake margin
   * gets just as shallow as a riffle does, and without the coverage gate every
   * lake edge would start behaving like fast water.
   */
  const energy01 = shallowEnergy.mul(WATER_RIVER_SHALLOW_ENERGY_WEIGHT)
    .add(surfaceSlopeEnergy.mul(WATER_RIVER_SLOPE_ENERGY_WEIGHT))
    .add(context.z.negate().clamp(0, 1).mul(WATER_REGIME_MORPHOLOGY_WEIGHT))
    .mul(channelCore).mul(riverAmount)
    .add(innerBank.mul(WATER_REGIME_INNER_BANK_WEIGHT))
    .sub(outerBank.mul(WATER_REGIME_OUTER_BANK_WEIGHT))
    .clamp(0, 1);
  const regime = waterResolveRegimeNode(energy01);
  const streakStretch = waterResolveStreakStretchNode(regime);
  // Outer bank carries the current; the inner bank slackens over its gravel bar.
  const localFlowScale = mix(u.riverPoolFlowScale, u.riverRiffleFlowScale, energy01)
    .mul(mix(float(WATER_RIVER_BANK_FLOW_SCALE), float(1), channelCore))
    .mul(float(1).add(outerBank.mul(WATER_BEND_FLOW_GAIN))
      .sub(innerBank.mul(WATER_BEND_FLOW_LOSS)));
  const localFlowSpeed = u.flowSpeed.mul(localFlowScale);
  const riverFrequencyScale = mix(float(WATER_RIVER_POOL_FREQUENCY_SCALE),
    float(WATER_RIVER_RIFFLE_FREQUENCY_SCALE), energy01);
  const scale = u.rippleScale;
  const time = u.time;

  const flowNoise = Fn(() => {
    const resolved = vec4(0.5).toVar();
    If(detailWeight.greaterThan(0.001), () => {
      resolved.assign(waterSampleAdvectedNoiseNode(u.flowNoise, position, flowDirection, time,
        u.flowNoiseScale, mix(u.flowSpeed.mul(0.2), localFlowSpeed, riverAmount),
        mix(float(1), streakStretch, riverAmount)));
    });
    return resolved;
  })();

  const noiseOffset = flowNoise.rg.mul(2).sub(1).mul(u.flowNoiseStrength).mul(detailWeight);
  const wavePosition = position.add(flowDirection.mul(noiseOffset.x)
    .add(flowPerpendicular.mul(noiseOffset.y))
    .mul(float(0.12).div(max(float(0.01), u.flowNoiseScale))));

  const lakeSlope = Fn(() => {
    const resolved = vec2(0).toVar();
    If(riverAmount.lessThan(0.98), () => {
      resolved.assign(waterResolveLakeSlopeNode(wavePosition, scale, time,
        openLake.add(riverAmount).clamp(0, 1), lakeShore));
    });
    return resolved;
  })();

  const riverPhases = Fn(() => {
    const resolved = vec3(0).toVar();
    If(riverAmount.greaterThan(0.02), () => {
      resolved.assign(waterResolveRiverPhasesNode(wavePosition, flowDirection, flowPerpendicular,
        scale, riverFrequencyScale, streakStretch, time, localFlowSpeed,
        flowNoise.g.sub(0.5).mul(regime.w).mul(4.6)));
    });
    return resolved;
  })();
  const riverSlope = Fn(() => {
    const resolved = vec2(0).toVar();
    If(riverAmount.greaterThan(0.02), () => {
      resolved.assign(waterResolveRiverSlopeNode(riverPhases, flowDirection, flowPerpendicular));
    });
    return resolved;
  })();
  const microSlope = Fn(() => {
    const resolved = vec2(0).toVar();
    If(detailWeight.greaterThan(0.001), () => {
      resolved.assign(waterResolveMicroSlopeNode(wavePosition, scale, time, detailWeight));
    });
    return resolved;
  })();

  const stoneObstacle = interaction.x.clamp(0, 1);
  const stoneWake = interaction.y.clamp(0, 1).mul(stoneObstacle.oneMinus());
  const stoneEdge = waterResolveStoneEdgeNode(stoneObstacle);
  const stoneDepthMask = smoothstep(1.4, 4.2, depth).oneMinus();
  const stoneActivity = stoneEdge.mul(0.82).add(stoneWake.mul(0.64))
    .mul(u.stoneWakeStrength).mul(detailWeight).mul(stoneDepthMask)
    .mul(mix(float(0.3), float(1), riverAmount)).clamp(0, 1);
  const waveStrength = u.rippleStrength.mul(mix(u.lakeWaveStrength, float(1), riverAmount));
  const noiseSlope = flowPerpendicular.mul(flowNoise.g.sub(0.5)).mul(0.42)
    .add(flowDirection.mul(flowNoise.r.sub(0.5)).mul(0.18))
    .mul(u.flowNoiseStrength).mul(detailWeight).mul(mix(float(0.35), float(1), riverAmount));
  const slope = mix(lakeSlope, riverSlope, riverAmount).mul(waveStrength)
    .add(microSlope.mul(u.rippleStrength)).add(noiseSlope)
    .add(flowPerpendicular.mul(flowNoise.g.sub(0.5)).mul(0.28)
      .add(flowDirection.mul(flowNoise.r.sub(0.5)).mul(0.12)).mul(stoneActivity));

  const surfaceNormal = geometricNormal.add(vec3(slope.x.negate(), 0, slope.y.negate()))
    .normalize();
  const lightingNormal = surfaceNormal.mul(select(frontFacing, float(1), float(-1)));

  const viewDirection = Fn(() => {
    const offset = cameraPosition.sub(worldPosition).toVar();
    const resolved = vec3(0, 1, 0).toVar();
    If(offset.length().greaterThan(1e-4), () => { resolved.assign(offset.normalize()); });
    return resolved;
  })();
  const facing = lightingNormal.dot(viewDirection).clamp(0, 1);
  const fresnelVisual = waterOpticsFresnelNode(u, facing).mul(u.fresnelStrength).clamp(0, 1);
  const halfVector = Fn(() => {
    const sum = u.sunDirection.add(viewDirection).toVar();
    const resolved = lightingNormal.toVar();
    If(sum.length().greaterThan(1e-4), () => { resolved.assign(sum.normalize()); });
    return resolved;
  })();
  const glint = pow(lightingNormal.dot(halfVector).clamp(0, 1), 96)
    .mul(mix(float(0.62), float(1), flowNoise.a)).mul(detailWeight).mul(u.glintStrength);

  const optics = waterOpticsResolveColorNode(u, u.shallow, u.deep, depth, worldPosition,
    cameraPosition, slope);

  const shoreBand = waterResolveShoreFoamNode(coverageRaw, depth, riverAmount, lakeAmount,
    energy01, outerBank, u.lakeWaveStrength);
  const riverFoam = Fn(() => {
    const resolved = float(0).toVar();
    If(riverAmount.greaterThan(0.02).and(detailWeight.greaterThan(0.001)), () => {
      resolved.assign(waterResolveRiffleFoamNode(riverPhases, regime, flowNoise.g, riverAmount,
        channelCore, detailWeight, shallowEnergy, innerBank));
    });
    return resolved;
  })();
  const stoneFoam = stoneActivity.mul(flowNoise.b.mul(0.38).add(0.62));
  const foamAmount = shoreBand.mul(u.shoreFoamWeight).add(riverFoam.mul(u.riffleFoamWeight))
    .add(stoneFoam.mul(u.stoneFoamWeight)).mul(u.foamStrength).clamp(0, 1);

  const color = Fn(() => {
    Discard(coverageRaw.lessThan(WATER_VISIBLE_COVERAGE_THRESHOLD));
    const resolved = optics.color.toVar();
    // A bend is asymmetric water: the cut bank runs deep and dark, the point bar
    // on the inside is shallow enough that its gravel lifts the tone.
    resolved.mulAssign(float(1).sub(outerBank.mul(WATER_BEND_DARKEN))
      .add(innerBank.mul(WATER_BEND_LIGHTEN)));
    If(riverAmount.greaterThan(0.02), () => {
      const sheen = float(0.5).add(float(0.5).mul(sin(
        wavePosition.dot(flowPerpendicular).mul(scale).mul(riverFrequencyScale).mul(3.7)
          .sub(time.mul(localFlowSpeed).mul(1.9)))));
      resolved.mulAssign(sheen.mul(0.035).mul(riverAmount).add(0.975));
    });
    resolved.assign(mix(resolved, u.reflection, fresnelVisual.mul(0.42)));
    // Open lake water is doing far less to break up the sky than its own margin
    // is, so it holds a more coherent reflection and reads as a larger body.
    resolved.assign(mix(resolved, u.reflection, openLake.mul(0.07)));
    resolved.assign(mix(resolved, u.reflection, glint.mul(0.16)));

    const poolTint = riverAmount.mul(channelCore).mul(regime.x)
      .mul(smoothstep(1.05, 1.26, riverDepthRatio));
    const riffleTint = riverAmount.mul(channelCore).mul(shallowEnergy)
      .mul(regime.z.add(regime.w).clamp(0, 1));
    resolved.mulAssign(float(1).sub(poolTint.mul(0.03)).add(riffleTint.mul(0.02)));
    resolved.assign(mix(resolved, u.foam, foamAmount));
    return resolved;
  })();

  const normal = cameraViewMatrix.mul(vec4(lightingNormal, 0)).xyz.normalize();

  const roughness = u.roughnessBase
    .add(riverAmount.mul(detailWeight).mul(0.035))
    .add(regime.w.mul(detailWeight).mul(0.07))
    .add(stoneActivity.mul(0.08)).add(foamAmount.mul(0.48)).sub(glint.mul(0.025))
    .clamp(0.02, 0.75);

  // The shallow floor decides how much sheet sits over a gravel bar. At 0.16 a
  // riffle was 89% raw bed and the water vanished; 0.26 left a 12 m channel that
  // is under a metre deep nearly everywhere reading as wet gravel; 0.42 washed
  // the shallows out to a flat pale sheet. 0.34 keeps the cobbles legible while
  // the water still reads as the surface it is.
  const transmittanceLuma = optics.transmittance.dot(vec3(0.2126, 0.7152, 0.0722));
  const baseAlpha = u.opacity.mul(coverage)
    .mul(mix(float(0.34), float(0.88), transmittanceLuma.oneMinus()));
  const alpha = mix(baseAlpha, min(float(1), baseAlpha.add(0.22)), foamAmount);

  return { color, normal, roughness, alpha, slope, lightingNormal, foamAmount };
}
