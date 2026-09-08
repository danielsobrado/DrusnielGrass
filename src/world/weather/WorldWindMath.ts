import { windLatticeGradient } from "./WorldWindLattice";

/**
 * The cinematic wind field, as pure functions.
 *
 * This is the CPU half of one model that both the CPU and the shaders evaluate.
 * Anything that asks "where is the wind here" — leaves choosing a drift, audio
 * choosing a gust level, a tree choosing a bend — comes through here, and the
 * node functions in `WorldWindNodes` compute the same thing on the GPU. They
 * agree to a measured tolerance; `verify-world-wind.mjs` holds that, against a
 * fixture generated from the model this was ported from.
 *
 * Every constant below is the resolved default of the source configuration.
 * They are stated here rather than read from a file because the numbers are the
 * model: changing one silently changes what the wind is, and the verifier
 * compares against a fixture that was generated with these values.
 */

export const DEGREES_TO_RADIANS = Math.PI / 180;

/** Decorrelates the cross-wind warp lookup from the along-wind one. */
const WARP_LOOKUP_OFFSET = Object.freeze([37.41, -19.73] as const);

export interface WindLayerConfig {
  readonly scale: number;
  readonly speed: number;
  readonly strength: number;
}

export interface WorldWindConfig {
  readonly baseStrength: number;
  readonly minStrength: number;
  readonly maxStrength: number;
  readonly direction: { readonly variationDegrees: number; readonly scale: number; readonly speed: number };
  readonly large: WindLayerConfig;
  readonly medium: WindLayerConfig;
  readonly flutter: WindLayerConfig;
  /**
   * Bounded domain warp.
   *
   * Displaces every layer's sample point by at most
   * `amplitude * (1 + lateralGain)` noise cells, so unlike a direction wobble
   * applied to the advection clock it cannot grow with elapsed time. It advects
   * more slowly than any layer, so the composite field deforms as it travels
   * instead of sliding rigidly: gust fronts curl, meander across the wind and
   * dissolve rather than sweeping past as clean parallel bands.
   */
  readonly warp: {
    readonly scale: number; readonly speed: number;
    readonly amplitude: number; readonly lateralGain: number;
  };
  readonly gust: {
    readonly threshold: number; readonly peak: number; readonly exponent: number;
    readonly inertiaSeconds: number; readonly inertiaGain: number;
  };
}

export const WORLD_WIND_DEFAULTS: WorldWindConfig = Object.freeze({
  baseStrength: 0.18,
  minStrength: 0.06,
  maxStrength: 1.25,
  direction: Object.freeze({ variationDegrees: 12, scale: 0.03, speed: 0.035 }),
  large: Object.freeze({ scale: 0.015, speed: 0.08, strength: 0.7 }),
  medium: Object.freeze({ scale: 0.07, speed: 0.21, strength: 0.23 }),
  flutter: Object.freeze({ scale: 0.35, speed: 0.7, strength: 0.07 }),
  warp: Object.freeze({ scale: 0.01, speed: 0.045, amplitude: 0.85, lateralGain: 1.6 }),
  gust: Object.freeze({
    threshold: 0.48, peak: 0.86, exponent: 1.6, inertiaSeconds: 0.12, inertiaGain: 0.2,
  }),
});

/**
 * The per-material response to the field.
 *
 * Separate from the field itself because the field is one thing and how a
 * blade, a card or a tree answers it is another. A preset changes the field; it
 * does not rewrite these.
 */
export const WORLD_WIND_RESPONSE = Object.freeze({
  blade: Object.freeze({
    bendScale: 0.28, tipFlutter: 0.035, tipExponent: 5,
    variationMin: 0.85, variationMax: 1.15,
  }),
  billboard: Object.freeze({
    bendScale: 0.22, tipFlutter: 0.025, tipExponent: 4,
    variationMin: 0.9, variationMax: 1.1,
  }),
  trees: Object.freeze({
    bendScale: 0.08, flutterScale: 0.025, heightMeters: 8, outerRadius: 3,
  }),
  leaves: Object.freeze({ advection: 0.52, turbulence: 0.22 }),
});

export function fract(value: number): number {
  return value - Math.floor(value);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) {
    return value < edge0 ? 0 : 1;
  }
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Supplies the gradient at a lattice cell. */
export type WindGradientSource = (cellX: number, cellY: number) => readonly [number, number];

/**
 * Gradient noise in [0, 1]; the field's only source of spatial variation.
 *
 * The gradients come from the shared lattice by default, which is what lets the
 * CPU and the shaders agree — see `WorldWindLattice` for why hashing in the
 * shader does not. The source hash can be passed instead, which is how the
 * fixture check proves this reproduces the model it was ported from.
 */
export function windGradientNoise2d(
  x: number, y: number, gradient: WindGradientSource = windLatticeGradient,
): number {
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  const localX = fract(x);
  const localY = fract(y);
  const fadeX = localX * localX * (3 - 2 * localX);
  const fadeY = localY * localY * (3 - 2 * localY);

  const dotGradient = (offsetX: number, offsetY: number): number => {
    const [gradientX, gradientY] = gradient(cellX + offsetX, cellY + offsetY);
    return gradientX * (localX - offsetX) + gradientY * (localY - offsetY);
  };

  return lerp(
    lerp(dotGradient(0, 0), dotGradient(1, 0), fadeX),
    lerp(dotGradient(0, 1), dotGradient(1, 1), fadeX),
    fadeY,
  ) + 0.5;
}

export interface WorldWindSample {
  /** Unit vector; the locally wobbled direction, not the prevailing one. */
  readonly directionX: number;
  readonly directionZ: number;
  /** The bend envelope, already clamped and scaled by intensity. */
  readonly strength: number;
  /** The broad gust in [0, 1]; the value every LOD must share. */
  readonly gust: number;
  /** Signed medium-scale turbulence. */
  readonly turbulence: number;
  /** Signed fine flutter, for tips and leaves. */
  readonly flutter: number;
}

export interface WorldWindQuery {
  readonly x: number;
  readonly z: number;
  /** Integrated phase in seconds, not raw elapsed time. See `WorldWindField`. */
  readonly time: number;
  readonly directionDegrees: number;
  readonly intensity?: number;
  readonly noiseScale?: number;
  readonly config?: WorldWindConfig;
  /**
   * Overrides where gradients come from.
   *
   * Production always uses the shared lattice. The fixture check passes the
   * source hash instead, which is how it proves this reproduces the model it
   * was ported from rather than merely resembling it.
   */
  readonly gradient?: WindGradientSource;
}

function warpOffset(
  x: number, z: number, time: number,
  prevailingX: number, prevailingZ: number,
  noiseScale: number, warp: WorldWindConfig["warp"], gradient?: WindGradientSource,
): { x: number; z: number } {
  if (!(warp.amplitude > 0)) {
    return { x: 0, z: 0 };
  }
  const clock = time * warp.speed;
  const sampleX = x * warp.scale * noiseScale - prevailingX * clock;
  const sampleZ = z * warp.scale * noiseScale - prevailingZ * clock;
  const along = (windGradientNoise2d(sampleX, sampleZ, gradient) * 2 - 1) * warp.amplitude;
  const across = (windGradientNoise2d(
    sampleX + WARP_LOOKUP_OFFSET[0],
    sampleZ + WARP_LOOKUP_OFFSET[1],
    gradient,
  ) * 2 - 1) * warp.amplitude * warp.lateralGain;
  // Cross-wind displacement is gained up: real gust cells stretch along the
  // wind and wander across it, so an isotropic warp reads as boiling rather
  // than meandering.
  return {
    x: prevailingX * along - prevailingZ * across,
    z: prevailingZ * along + prevailingX * across,
  };
}

function sampleLayer(
  x: number, z: number, time: number,
  directionX: number, directionZ: number,
  noiseScale: number, layer: WindLayerConfig,
  offset: { x: number; z: number }, gradient?: WindGradientSource,
): number {
  const clock = time * layer.speed;
  return windGradientNoise2d(
    x * layer.scale * noiseScale - directionX * clock + offset.x,
    z * layer.scale * noiseScale - directionZ * clock + offset.z,
    gradient,
  );
}

/**
 * Evaluates the field at a world point.
 *
 * `x` and `z` are world metres and the direction convention is
 * `(x, z) = (cos t, sin t)` with `t` in radians. That convention is fixed here
 * and used unchanged everywhere else: transposing x and z in one shader and not
 * another is the failure that makes gust fronts travel the wrong way in one LOD.
 */
export function sampleWorldWind(query: WorldWindQuery): WorldWindSample {
  const config = query.config ?? WORLD_WIND_DEFAULTS;
  const noiseScale = query.noiseScale ?? 1;
  const time = query.time;
  const directionRadians = query.directionDegrees * DEGREES_TO_RADIANS;
  const prevailingX = Math.cos(directionRadians);
  const prevailingZ = Math.sin(directionRadians);

  const directionClock = time * config.direction.speed;
  const directionNoise = windGradientNoise2d(
    query.x * config.direction.scale * noiseScale - prevailingX * directionClock,
    query.z * config.direction.scale * noiseScale - prevailingZ * directionClock,
    query.gradient,
  ) * 2 - 1;
  const localAngle = directionRadians
    + directionNoise * config.direction.variationDegrees * DEGREES_TO_RADIANS;

  // Layers advect along the prevailing direction, never the wobbled local one:
  // the offset is `direction * elapsedTime`, so a time-varying direction would
  // displace the sample by an amount that grows with elapsed time and make the
  // wind appear to speed up indefinitely. The meander comes back through the
  // bounded warp, which is added to the coordinate rather than multiplied by
  // the clock.
  const offset = warpOffset(
    query.x, query.z, time, prevailingX, prevailingZ, noiseScale, config.warp, query.gradient,
  );
  const large = sampleLayer(
    query.x, query.z, time, prevailingX, prevailingZ, noiseScale, config.large, offset,
    query.gradient,
  );
  // The inertia probe reuses the current warp: over `inertiaSeconds` the warp
  // moves by well under a hundredth of a cell, and resampling it would double
  // the warp cost for no visible gain.
  const previousLarge = sampleLayer(
    query.x, query.z, time - config.gust.inertiaSeconds,
    prevailingX, prevailingZ, noiseScale, config.large, offset, query.gradient,
  );
  const medium = sampleLayer(
    query.x, query.z, time, prevailingX, prevailingZ, noiseScale, config.medium, offset,
    query.gradient,
  ) * 2 - 1;
  const flutter = sampleLayer(
    query.x, query.z, time, prevailingX, prevailingZ, noiseScale, config.flutter, offset,
    query.gradient,
  ) * 2 - 1;

  const gust = smoothstep(config.gust.threshold, config.gust.peak, large) ** config.gust.exponent;
  const previousGust = smoothstep(
    config.gust.threshold, config.gust.peak, previousLarge,
  ) ** config.gust.exponent;
  const inertia = (gust - previousGust) * config.gust.inertiaGain;
  const envelope = Math.max(
    config.minStrength,
    Math.min(
      config.maxStrength,
      config.baseStrength
        + gust * config.large.strength
        + Math.abs(medium) * config.medium.strength
        + inertia,
    ),
  );

  return {
    directionX: Math.cos(localAngle),
    directionZ: Math.sin(localAngle),
    strength: envelope * Math.max(0, query.intensity ?? 1),
    gust,
    turbulence: medium,
    flutter,
  };
}
