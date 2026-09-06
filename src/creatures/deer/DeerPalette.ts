import * as THREE from "three";

/**
 * Deer colour, split between the mesh and the material.
 *
 * The vertex colours below are the real palette: they carry everything that is
 * *pattern* — the pale belly, the dark dorsal line, the wet muzzle, the black
 * eye, the bone of an antler, the white flash under the tail. They are baked
 * once into the shared geometry, so an animal can be marked up in detail without
 * costing a second material or a second draw call.
 *
 * The per-actor material colour is then a near-white tint that multiplies all of
 * it at once. That is what makes one herd look like a herd rather than a row of
 * clones: each animal is a slightly warmer, cooler, lighter or darker version of
 * the same correct palette, and the markings shift with the coat instead of
 * detaching from it. A tint far from white would just muddy the pattern, so the
 * range is deliberately narrow.
 */
export const DEER_PALETTE = Object.freeze({
  /** Main coat. */
  hide: 0x8f6f4a,
  /** Counter-shading: undersides are pale in almost every prey animal. */
  belly: 0xd8c6a8,
  /** The darker line along the spine and the top of the haunches. */
  dorsal: 0x6b5133,
  /** Face, lower legs and the shadowed side of the neck. */
  face: 0x7a5c3c,
  muzzle: 0x4a3a2a,
  nose: 0x241d16,
  eye: 0x241d16,
  /** The catchlight that stops an eye reading as a drilled hole. */
  eyeSpeck: 0xc9c2b4,
  hoof: 0x3a3129,
  antler: 0xb9a887,
  antlerTip: 0xd6c9ad,
  earInner: 0xc99b86,
  tailFlash: 0xefe6d4,
  fawnSpot: 0xe2d3b4,
  throat: 0xc4ad8c,
});

/** How far a single animal's tint may drift from neutral. */
const TINT_VALUE_MIN = 0.84;
const TINT_VALUE_MAX = 1.12;
const TINT_WARMTH = 0.06;

/**
 * Picks one animal's coat tint from two hashed numbers in [0, 1).
 *
 * `value` is how light the animal is and `warmth` is how red or grey it runs.
 * Both stay close to white so the baked pattern survives the multiply.
 */
export function setDeerCoatTint(
  target: THREE.Color,
  value: number,
  warmth: number,
): void {
  const level = THREE.MathUtils.lerp(TINT_VALUE_MIN, TINT_VALUE_MAX, clamp01(value));
  const warm = (clamp01(warmth) - 0.5) * 2 * TINT_WARMTH;
  target.setRGB(
    level * (1 + warm),
    level,
    level * (1 - warm),
    THREE.LinearSRGBColorSpace,
  );
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0.5;
}
