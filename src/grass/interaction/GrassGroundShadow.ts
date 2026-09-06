import * as THREE from "three";
import { WORLD_SUN_DIRECTION } from "../../app/WorldEnvironmentTuning";

/**
 * Where the character meets the ground, so the grass around it can darken.
 *
 * The sun's shadow map covers an 8 m box, but no grass layer participates in it:
 * `WorldGrassSystem` clears `castShadow` and `receiveShadow` on every mesh it
 * builds. That is a deliberate performance decision — near grass is the highest
 * overdraw layer in the frame, and a PCF lookup per fragment there costs more
 * than the rest of the shadow pass put together — but it leaves the character
 * standing in a field that is uniformly lit right up to its feet. Nothing else
 * in the scene reads as pasted-on the way that does, because contact shadow is
 * the cue the eye uses to decide an object is *in* a place rather than *over*
 * it.
 *
 * So the occlusion is faked, with one disc rather than a depth map. It is
 * evaluated per blade in the vertex stage from the blade's own root: no texture
 * fetch, no extra draw call, nothing added to the fragment cost of the layer
 * that could least afford it. Being analytic also means it cannot shimmer or
 * pop as blades cross an LOD boundary, which is what a screen-space
 * approximation at this density would do.
 *
 * The disc is pushed along the sun's ground bearing so the dark patch sits where
 * the light says it should, and it is deliberately soft: it stands in for the
 * ambient occlusion of a body close to the canopy as much as for a cast shadow,
 * and a hard edge would advertise that it is neither.
 */

const SUN = new THREE.Vector3(...WORLD_SUN_DIRECTION).normalize();

/**
 * Ground offset from an occluder to its shadow, per metre of height. The sun
 * sits high, so this is short: the character's patch pools around its feet
 * rather than streaming away from them.
 */
const SUN_GROUND_BEARING_X = -SUN.x / Math.max(SUN.y, 0.2);
const SUN_GROUND_BEARING_Z = -SUN.z / Math.max(SUN.y, 0.2);

/** Below this the disc is doing nothing and the shader branch is skipped. */
const MINIMUM_STRENGTH = 0.001;

class GrassGroundShadow {
  /** xyz world centre of the darkened patch, w its radius in metres. */
  readonly disc = new THREE.Vector4(0, 0, 0, 1);

  private strengthValue = 0;

  /**
   * @param height Metres from the contact point to the top of the occluder. The
   *   offset scales with it, so a jumping character's patch slides out from
   *   under its feet instead of staying glued to them.
   */
  set(
    x: number,
    y: number,
    z: number,
    radius: number,
    height: number,
    strength: number,
  ): void {
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(z) ||
      !Number.isFinite(radius) ||
      !Number.isFinite(height) ||
      !Number.isFinite(strength) ||
      radius <= 0 ||
      strength <= MINIMUM_STRENGTH
    ) {
      this.clear();
      return;
    }
    const lift = Math.max(0, height);
    this.disc.set(
      x + SUN_GROUND_BEARING_X * lift,
      y,
      z + SUN_GROUND_BEARING_Z * lift,
      radius,
    );
    this.strengthValue = Math.min(1, strength);
  }

  clear(): void {
    this.strengthValue = 0;
  }

  get strength(): number {
    return this.strengthValue;
  }

  isEnabled(): boolean {
    return this.strengthValue > MINIMUM_STRENGTH;
  }
}

export const grassGroundShadow = new GrassGroundShadow();
