import type { Node, TextureNode } from "three/webgpu";
import { Fn, cos, float, max, mix, sin, smoothstep, vec2, vec3, vec4 } from "three/tsl";
import {
  WATER_LAKE_COVE_WAVE_SCALE, WATER_LAKE_SHORE_FOAM_EXPOSURE, WATER_LAKE_SHORE_WAVE_FREQUENCY,
  WATER_LAKE_SHORE_WAVE_WEIGHT, WATER_RAPID_FOAM_CUTOFF, WATER_RIFFLE_FOAM_CUTOFF,
  WATER_SHORE_FOAM_ENERGY_FLOOR,
} from "./WaterMaterialTuning";

/**
 * Flow, wave and foam helpers for the surface, as nodes.
 *
 * Lakes and rivers build their slope from the same directional cosines; what
 * separates them is only which zone weights are handed in. Keeping the phases
 * out of the composition pass also lets the foam reuse the river's own crests
 * instead of inventing a second pattern that drifts away from the waves.
 */

/**
 * Two detuned samples of the shared flow noise, taken in a flow-aligned frame.
 *
 * `stretch` squeezes the along-flow axis and tightens the across-flow one, so
 * fast coherent water resolves into long streaks rather than a scrolling
 * ripple. The travel term is expressed in the stretched axis's own units, which
 * keeps the world-space advection speed fixed as the domain changes shape.
 */
export function waterSampleAdvectedNoiseNode(noise: TextureNode, position: Node<"vec2">,
  flowDirection: Node<"vec2">, time: Node<"float">, scale: Node<"float">, speed: Node<"float">,
  stretch: Node<"float">): Node<"vec4"> {
  return Fn(() => {
    const perpendicular = vec2(flowDirection.y.negate(), flowDirection.x);
    const flowSpace = vec2(position.dot(flowDirection), position.dot(perpendicular)).toVar();
    const alongScale = scale.mul(0.58).div(max(float(1), stretch)).toVar();
    const acrossScale = scale.mul(1.42)
      .mul(mix(float(1), float(1.28), stretch.sub(1).clamp(0, 1))).toVar();
    const warpUv = position.mul(scale).mul(0.31).add(vec2(time.mul(0.007), time.mul(-0.005)));
    const warp = noise.sample(warpUv).rg.mul(2).sub(1).toVar();
    const travel = time.mul(speed).mul(alongScale).mul(0.31).toVar();
    const primaryUv = flowSpace.mul(vec2(alongScale, acrossScale)).add(warp.mul(0.075))
      .add(vec2(travel.negate(), 0));
    const secondaryUv = flowSpace.yx.mul(vec2(acrossScale.mul(0.78), alongScale.mul(1.26)))
      .add(warp.yx.mul(0.052)).add(vec2(0.37, travel.mul(-0.61)));
    const primary = noise.sample(primaryUv).toVar();
    const secondary = noise.sample(secondaryUv).toVar();
    return vec4(mix(primary.r, secondary.r, 0.34), mix(primary.g, secondary.g, 0.46),
      mix(primary.b, secondary.b, 0.38), max(primary.a, secondary.a.mul(0.92)));
  })();
}

export const waterResolveStoneEdgeNode = Fn(([obstacle]: [Node<"float">]) =>
  smoothstep(0.04, 0.42, obstacle).mul(smoothstep(0.72, 0.98, obstacle).oneMinus()));

/**
 * Lake slope across three zones. `openLake` fades the two broad wind waves out
 * toward a sheltered lobe; `shore` tightens and lifts the shortest wave in the
 * shallow margin. A cove ends up glassy, the middle rippled, and the waterline
 * broken into small wavelets — with no boundary between them.
 */
export const waterResolveLakeSlopeNode = Fn(([position, scale, time, openLake, shore]:
  [Node<"vec2">, Node<"float">, Node<"float">, Node<"float">, Node<"float">]) => {
  const directionA = vec2(0.86, 0.51).normalize();
  const directionB = vec2(-0.39, 0.92).normalize();
  const directionC = vec2(0.21, -0.98).normalize();
  const openWave = mix(float(WATER_LAKE_COVE_WAVE_SCALE), float(1), openLake);
  const phaseA = position.dot(directionA).mul(scale).mul(1.12).add(time.mul(0.46));
  const phaseB = position.dot(directionB).mul(scale).mul(1.83).sub(time.mul(0.31));
  const phaseC = position.dot(directionC).mul(scale)
    .mul(mix(float(2.71), float(WATER_LAKE_SHORE_WAVE_FREQUENCY), shore))
    .add(time.mul(mix(float(0.22), float(0.54), shore)));
  return directionA.mul(cos(phaseA)).mul(0.52).add(directionB.mul(cos(phaseB)).mul(0.31))
    .mul(openWave)
    .add(directionC.mul(cos(phaseC))
      .mul(mix(float(0.17), float(WATER_LAKE_SHORE_WAVE_WEIGHT), shore)));
});

/**
 * The three river crest phases, in a flow-aligned frame. `stretch` squeezes the
 * along-flow axis so a coherent run resolves into long structures rather than a
 * ripple travelling downstream, and `rapidBreak` fragments those crests once
 * the reach is fast enough to be broken water.
 */
export const waterResolveRiverPhasesNode = Fn(([position, flowDirection, flowPerpendicular,
  scale, frequencyScale, stretch, time, flowSpeed, rapidBreak]:
[Node<"vec2">, Node<"vec2">, Node<"vec2">, Node<"float">, Node<"float">, Node<"float">,
  Node<"float">, Node<"float">, Node<"float">]) => {
  const acrossScale = scale.mul(frequencyScale)
    .mul(mix(float(1), float(1.28), stretch.sub(1).clamp(0, 1))).toVar();
  const alongScale = scale.mul(frequencyScale).div(max(float(1), stretch)).toVar();
  const along = position.dot(flowDirection).toVar();
  const across = position.dot(flowPerpendicular).toVar();
  return vec3(
    across.mul(acrossScale).mul(2.85).add(along.mul(alongScale).mul(0.34))
      .sub(time.mul(flowSpeed).mul(2.2)).add(rapidBreak),
    across.mul(acrossScale).mul(5.1).sub(along.mul(alongScale).mul(0.18))
      .sub(time.mul(flowSpeed).mul(3.65)).add(rapidBreak.mul(1.7)),
    along.mul(alongScale).mul(1.35).add(across.mul(acrossScale).mul(0.72))
      .sub(time.mul(flowSpeed).mul(1.15)));
});

export const waterResolveRiverSlopeNode = Fn(([phases, flowDirection, flowPerpendicular]:
  [Node<"vec3">, Node<"vec2">, Node<"vec2">]) =>
  flowPerpendicular.mul(cos(phases.x).mul(0.64).add(cos(phases.y).mul(0.27)))
    .add(flowDirection.mul(cos(phases.z)).mul(0.16)));

/** Distance-faded micro chop, shared by every regime. */
export const waterResolveMicroSlopeNode = Fn(([position, scale, time, detailWeight]:
  [Node<"vec2">, Node<"float">, Node<"float">, Node<"float">]) => {
  const directionA = vec2(0.94, -0.34).normalize();
  const directionB = vec2(-0.62, -0.78).normalize();
  const phaseA = position.dot(directionA).mul(scale).mul(7.4).add(time.mul(1.34));
  const phaseB = position.dot(directionB).mul(scale).mul(10.1).sub(time.mul(1.08));
  return directionA.mul(cos(phaseA)).mul(0.16).add(directionB.mul(cos(phaseB)).mul(0.11))
    .mul(detailWeight);
});

/**
 * The shoreline band, weighted by what is happening at that waterline. A lake
 * margin has no directional energy to read from, so it rides the lake wave
 * strength and leaves rocky shores to the separate stone term.
 */
export const waterResolveShoreFoamNode = Fn(([coverageRaw, depth, riverAmount, lakeAmount,
  energy, outerBank, lakeWaveStrength]:
[Node<"float">, Node<"float">, Node<"float">, Node<"float">, Node<"float">, Node<"float">,
  Node<"float">]) => {
  const band = smoothstep(0.16, 0.66, coverageRaw).oneMinus()
    .mul(smoothstep(0.025, 0.11, coverageRaw))
    .mul(smoothstep(0.28, 0.9, depth).oneMinus()).toVar();
  const shoreEnergy = riverAmount
    .mul(energy.mul(0.85).add(outerBank.mul(0.45)).add(0.3))
    .add(lakeAmount.mul(lakeWaveStrength).mul(WATER_LAKE_SHORE_FOAM_EXPOSURE))
    .clamp(0, 1).toVar();
  return band.mul(mix(float(WATER_SHORE_FOAM_ENERGY_FLOOR), float(1), shoreEnergy));
});

/**
 * Whitewater built from the river's own crest phases, so the foam sits on the
 * waves rather than beside them. A rapid connects because its cutoff drops far
 * enough for neighbouring crests to merge, not because the term is turned up.
 */
export const waterResolveRiffleFoamNode = Fn(([phases, regime, turbulence, riverAmount,
  channelCore, detailWeight, shallowEnergy, innerBank]:
[Node<"vec3">, Node<"vec4">, Node<"float">, Node<"float">, Node<"float">, Node<"float">,
  Node<"float">, Node<"float">]) => {
  const energy = riverAmount.mul(channelCore).mul(detailWeight).mul(shallowEnergy)
    .mul(regime.z.add(regime.w.mul(1.35)).add(innerBank.mul(0.25)).clamp(0, 1)).toVar();
  const pattern = float(0.5).add(float(0.5).mul(sin(
    phases.x.mul(1.43).add(sin(phases.y).mul(0.86)).add(turbulence.sub(0.5).mul(2.2))))).toVar();
  const cutoff = mix(float(WATER_RIFFLE_FOAM_CUTOFF), float(WATER_RAPID_FOAM_CUTOFF),
    regime.w).toVar();
  // A wide band on purpose: a narrow one came out as hard-edged white slashes
  // painted on the river rather than as water breaking over it.
  return smoothstep(cutoff, cutoff.add(0.3), pattern).mul(energy);
});
