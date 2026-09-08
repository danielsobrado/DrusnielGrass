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
 *
 * **Cost: there is no regression. Four measurements said otherwise and all four
 * were wrong.**
 *
 * The field was reported as costing 14 ms against 5 ms for the per-material
 * gust model it replaces. It does not. Measured with `check-wind-cost.mjs`,
 * three interleaved runs of each on a settled world:
 *
 * | run | fps | GPU scene | draw (CPU) | draws |
 * | --- | --- | --------- | ---------- | ----- |
 * | legacy | 78.3 | 0.20 ms | 11.29 ms | 58,397 |
 * | cinematic | 78.6 | 0.20 ms | 11.42 ms | 58,394 |
 * | legacy | 78.3 | 0.20 ms | 11.33 ms | 58,457 |
 * | cinematic | 79.8 | 0.20 ms | 11.07 ms | 59,461 |
 *
 * Indistinguishable. The GPU cost of the field is around 0.07 ms and its CPU
 * cost is not measurable above run-to-run noise.
 *
 * Four ways an aggregate frame time lied, each worth knowing before trusting
 * one again:
 *
 * 1. Headless Chrome quantises frame time to vsync multiples — 7.6 and 15.1 ms
 *    at 131 Hz. Anything between them is invisible. Launch unlocked.
 * 2. The grass quality governor targets 60 FPS by adapting density, so it
 *    equalises any two configurations that both miss it. Pin the tier.
 * 3. Near-grass streaming has a 2.5 ms per-frame build budget, and a run
 *    sampled before its tiles settle reports that budget as grass CPU. The
 *    reported 2.43 ms "wind" cost was 2.43 ms of streaming against a 2.5 ms
 *    budget.
 * 4. Both models were given the same twenty seconds to settle, which was long
 *    enough for one and not the other. The comparison was a settled world
 *    against a loading one, and that is the whole of the reported regression.
 *
 * One real difference survives and is not understood: the world occasionally
 * settles into a second state at roughly 176 fps and 125,000 draws instead of
 * 78 fps and 58,000. It appeared once in six runs, in a legacy run, and affects
 * the benchmark rather than the wind — both models measure the same within
 * whichever state they land in.
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

/**
 * Reads the baked field, with flutter still computed locally.
 *
 * One texture fetch replaces the twenty-eight the full evaluation costs. The
 * three quantities that must be coherent across LODs — direction, envelope and
 * broad gust — come from the bake, so every representation is reading the same
 * numbers by construction rather than by agreeing to recompute them the same
 * way. Flutter stays analytic because it is fine detail the texture's four
 * metres per texel cannot hold, and because a card should have less of it than
 * a near blade anyway.
 *
 * Outside the baked region the sampler clamps, which holds the field at the
 * edge value rather than wrapping to the far side of the world. Grass is only
 * drawn well inside the region; the clamp is what keeps something briefly
 * outside it from snapping to unrelated wind.
 */
export function createBakedWorldWindNodes(inputs: {
  readonly positionXZ: Node<"vec2">;
  readonly bakedField: Parameters<typeof texture>[0];
  readonly originXZ: Node<"vec2">;
  readonly worldSize: number;
  readonly time: Node<"float">;
  readonly noiseScale: Node<"float">;
  readonly config?: WorldWindConfig;
}): WorldWindFieldNodes {
  const config = inputs.config ?? WORLD_WIND_DEFAULTS;
  const uvNode = inputs.positionXZ.sub(inputs.originXZ).div(inputs.worldSize).add(0.5);
  const baked = texture(inputs.bakedField, uvNode.clamp(0, 1));
  const direction = baked.xy.toVar();
  // Flutter is a cheap travelling wave rather than another noise lookup.
  //
  // Measured: a noise-based flutter here left the baked path costing the same
  // as the full evaluation, because the expense is the vertex-stage texture
  // fetch itself — four random reads of the lattice per vertex over a very
  // large amount of grass — and not the arithmetic around it. A wave advected
  // along the baked direction gives per-blade high-frequency motion for a sine,
  // and the structure a person actually reads as wind is in the baked gust.
  const along = inputs.positionXZ.dot(direction).mul(config.flutter.scale)
    .sub(inputs.time.mul(config.flutter.speed));
  const across = inputs.positionXZ.dot(vec2(direction.y.negate(), direction.x))
    .mul(config.flutter.scale * 0.61);
  const flutter = sin(along.mul(6.2831853).add(across.mul(4.1)));
  return {
    direction,
    strength: baked.z,
    gust: baked.w,
    // Medium turbulence is folded into the baked envelope; a consumer that
    // wants it separately should sample the full field rather than be handed a
    // value this does not have.
    turbulence: float(0),
    flutter,
  };
}
