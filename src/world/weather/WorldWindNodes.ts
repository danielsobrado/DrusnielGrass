import {
  Fn, cos, float, floor, fract, mix, sin, smoothstep, texture, vec2,
} from "three/tsl";
import type { Node } from "three/webgpu";
import { WORLD_WIND_DEFAULTS, type WorldWindConfig } from "./WorldWindMath";
import { WIND_LATTICE_PERIOD, getWindGradientTexture } from "./WorldWindLattice";

/**
 * The cinematic wind field, as node functions.
 *
 * The GPU half of the model in `WorldWindMath`. There is no separate GLSL
 * version: both backends compile these nodes, so a discrepancy between WebGL
 * and WebGPU wind is not a thing that can happen — and the only agreement left
 * to prove is CPU against GPU, which `verify-world-wind.mjs` measures.
 *
 * Every LOD calls into these. That is the point of the ticket: a gust front is
 * only coherent if the near blades, the mid layer and the far cards are reading
 * one field rather than three that happen to look similar.
 */

const DEG_TO_RAD = Math.PI / 180;
const WARP_LOOKUP_OFFSET = [37.41, -19.73] as const;

/**
 * Gradient noise in [0, 1].
 *
 * The return type is stated explicitly because nested domain warps otherwise
 * expand this expression repeatedly during type inference for newly seen
 * reflection trees.
 */
export const windGradientNoise2dNode = Fn(([point]: [Node<"vec2">]) => {
  const cell = floor(point).toVar();
  const local = fract(point).toVar();
  const fade = local.mul(local).mul(float(3).sub(local.mul(2)));
  const lattice = texture(getWindGradientTexture());

  const gradientDot = (offset: Node<"vec2">): Node<"float"> => {
    // Sampled at the texel centre of the wrapped cell. The texture repeats, so
    // the wrap is the sampler's job rather than a modulo here, and nearest
    // filtering means this reads the exact float the CPU lattice holds.
    const uvNode = cell.add(offset).add(0.5).div(WIND_LATTICE_PERIOD);
    const gradient = lattice.sample(uvNode).xy;
    const delta = local.sub(offset);
    return gradient.x.mul(delta.x).add(gradient.y.mul(delta.y));
  };

  const x0 = mix(gradientDot(vec2(0, 0)), gradientDot(vec2(1, 0)), fade.x);
  const x1 = mix(gradientDot(vec2(0, 1)), gradientDot(vec2(1, 1)), fade.x);
  return mix(x0, x1, fade.y).add(0.5);
}, "float");

function windWarpNode(
  positionXZ: Node<"vec2">, timeNode: Node<"float">, prevailing: Node<"vec2">,
  noiseScale: Node<"float">, warp: WorldWindConfig["warp"],
): Node<"vec2"> {
  if (!(warp.amplitude > 0)) {
    return vec2(0, 0);
  }
  const clock = timeNode.mul(warp.speed);
  const samplePoint = positionXZ
    .mul(float(warp.scale).mul(noiseScale))
    .sub(prevailing.mul(clock))
    .toVar();
  const along = windGradientNoise2dNode(samplePoint).sub(0.5).mul(2 * warp.amplitude);
  const across = windGradientNoise2dNode(
    samplePoint.add(vec2(WARP_LOOKUP_OFFSET[0], WARP_LOOKUP_OFFSET[1])),
  ).sub(0.5).mul(2 * warp.amplitude * warp.lateralGain);
  const perpendicular = vec2(prevailing.y.negate(), prevailing.x);
  return prevailing.mul(along).add(perpendicular.mul(across));
}

function sampleLayerNode(
  positionXZ: Node<"vec2">, timeNode: Node<"float">, direction: Node<"vec2">,
  noiseScale: Node<"float">, layer: { scale: number; speed: number },
  warpOffset: Node<"vec2">,
): Node<"float"> {
  const clock = timeNode.mul(layer.speed);
  return windGradientNoise2dNode(
    positionXZ
      .mul(float(layer.scale).mul(noiseScale))
      .sub(direction.mul(clock))
      .add(warpOffset),
  );
}

export interface WorldWindFieldNodes {
  /** Unit vector; the locally wobbled direction. */
  readonly direction: Node<"vec2">;
  readonly strength: Node<"float">;
  /** The broad gust every LOD shares. */
  readonly gust: Node<"float">;
  readonly turbulence: Node<"float">;
  readonly flutter: Node<"float">;
}

export interface WorldWindFieldInputs {
  /** World metres. Evaluate at a stationary root, never a deformed vertex. */
  readonly positionXZ: Node<"vec2">;
  /** Integrated phase in seconds; see `WorldWindField`. */
  readonly time: Node<"float">;
  readonly directionDegrees: Node<"float">;
  readonly intensity: Node<"float">;
  readonly noiseScale: Node<"float">;
  readonly config?: WorldWindConfig;
}

/**
 * Builds the field at a world point.
 *
 * The direction convention is `(x, z) = (cos t, sin t)`, matching
 * `sampleWorldWind` exactly. Layers advect along the prevailing direction and
 * never the wobbled local one; the meander comes from the bounded warp. See the
 * notes on the CPU implementation for why.
 */
export function createWorldWindFieldNodes(
  inputs: WorldWindFieldInputs,
): WorldWindFieldNodes {
  const config = inputs.config ?? WORLD_WIND_DEFAULTS;
  const { positionXZ, time, noiseScale } = inputs;
  const directionRadians = inputs.directionDegrees.mul(DEG_TO_RAD);
  const prevailing = vec2(cos(directionRadians), sin(directionRadians)).toVar();

  const directionClock = time.mul(config.direction.speed);
  const directionNoise = windGradientNoise2dNode(
    positionXZ
      .mul(float(config.direction.scale).mul(noiseScale))
      .sub(prevailing.mul(directionClock)),
  ).sub(0.5).mul(2);
  const localAngle = directionRadians.add(
    directionNoise.mul(config.direction.variationDegrees * DEG_TO_RAD),
  );

  const warpOffset = windWarpNode(
    positionXZ, time, prevailing, noiseScale, config.warp,
  ).toVar();
  const large = sampleLayerNode(
    positionXZ, time, prevailing, noiseScale, config.large, warpOffset,
  );
  // The inertia probe reuses the current warp; over `inertiaSeconds` the warp
  // moves by well under a hundredth of a cell.
  const previousLarge = sampleLayerNode(
    positionXZ, time.sub(config.gust.inertiaSeconds), prevailing, noiseScale,
    config.large, warpOffset,
  );
  const medium = sampleLayerNode(
    positionXZ, time, prevailing, noiseScale, config.medium, warpOffset,
  ).sub(0.5).mul(2);
  const flutter = sampleLayerNode(
    positionXZ, time, prevailing, noiseScale, config.flutter, warpOffset,
  ).sub(0.5).mul(2);

  const gust = smoothstep(config.gust.threshold, config.gust.peak, large)
    .pow(config.gust.exponent);
  const previousGust = smoothstep(config.gust.threshold, config.gust.peak, previousLarge)
    .pow(config.gust.exponent);
  const inertia = gust.sub(previousGust).mul(config.gust.inertiaGain);
  const envelope = float(config.baseStrength)
    .add(gust.mul(config.large.strength))
    .add(medium.abs().mul(config.medium.strength))
    .add(inertia)
    .clamp(config.minStrength, config.maxStrength);

  return {
    direction: vec2(cos(localAngle), sin(localAngle)),
    strength: envelope.mul(inputs.intensity.max(0)),
    gust,
    turbulence: medium,
    flutter,
  };
}
