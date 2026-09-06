import * as THREE from "three";
import type { ActorAnimationInput } from "../../actor/animation/ActorAnimationInput";
import type { ActorSecondaryMotion } from "../../actor/animation/ActorAnimationProfile";
import { CapeMotion, type CapeMotionInput } from "../CapeMotion";
import { CharacterSpring } from "../CharacterSpring";
import type { SnowflowCharacterRig } from "../SnowflowCharacterGeometry";

const HAIR_FREQUENCY = 3.6;

/**
 * The player's cape, hair, and skirt response.
 *
 * This is the same cloth behaviour the character has always had, moved behind
 * the generic secondary-motion hook. It runs after the primary pose has reached
 * the bones and owns the secondary bones outright — the pose pipeline skips
 * them rather than fighting this module for them.
 */
export class SnowflowClothMotion implements ActorSecondaryMotion {
  private readonly capeMotion: CapeMotion;
  private readonly hairLeftX = new CharacterSpring();
  private readonly hairRightX = new CharacterSpring();
  private readonly hairLeftZ = new CharacterSpring();
  private readonly hairRightZ = new CharacterSpring();
  private readonly capeInput: CapeMotionInput = {
    forwardVelocity: 0,
    sideVelocity: 0,
    verticalVelocity: 0,
    runSpeed: 1,
    landed: false,
    landingImpact: 0,
  };

  constructor(
    private readonly rig: SnowflowCharacterRig,
    private readonly facts: { landed: boolean; landingImpact: number },
  ) {
    this.capeMotion = new CapeMotion(
      rig.cloakBack,
      rig.cloakLeft,
      rig.cloakRight,
    );
  }

  update(deltaSeconds: number, input: ActorAnimationInput): void {
    const sine = Math.sin(input.facing);
    const cosine = Math.cos(input.facing);
    const velocity = input.worldVelocity;
    const forwardVelocity = velocity.x * sine + velocity.z * cosine;
    const sideVelocity = velocity.x * cosine - velocity.z * sine;
    const vertical01 = THREE.MathUtils.clamp(input.verticalVelocity / 9, -1, 1);

    this.capeInput.forwardVelocity = forwardVelocity;
    this.capeInput.sideVelocity = sideVelocity;
    this.capeInput.verticalVelocity = input.verticalVelocity;
    this.capeInput.runSpeed = input.referenceSpeed;
    this.capeInput.landed = this.facts.landed;
    this.capeInput.landingImpact = this.facts.landingImpact;
    const capePose = this.capeMotion.update(deltaSeconds, this.capeInput);

    if (this.facts.landed) {
      const impulse = this.facts.landingImpact * 1.8;
      this.hairLeftX.addImpulse(impulse * 0.45);
      this.hairRightX.addImpulse(impulse * 0.45);
    }

    const hairTargetX = capePose.bendX * 0.48 - vertical01 * 0.05;
    this.rig.hairLeft.rotation.x = this.hairLeftX.update(
      hairTargetX,
      deltaSeconds,
      HAIR_FREQUENCY,
      0.82,
    );
    this.rig.hairRight.rotation.x = this.hairRightX.update(
      hairTargetX,
      deltaSeconds,
      HAIR_FREQUENCY,
      0.82,
    );
    this.rig.hairLeft.rotation.z = this.hairLeftZ.update(
      capePose.bendZ * 0.7 - 0.04,
      deltaSeconds,
      HAIR_FREQUENCY,
      0.84,
    );
    this.rig.hairRight.rotation.z = this.hairRightZ.update(
      capePose.bendZ * 0.7 + 0.04,
      deltaSeconds,
      HAIR_FREQUENCY,
      0.84,
    );

    this.rig.skirtFront.rotation.x = capePose.bendX * 0.22;
    this.rig.skirtLeft.rotation.z = capePose.bendZ * 0.35 - 0.025;
    this.rig.skirtRight.rotation.z = capePose.bendZ * 0.35 + 0.025;
  }

  reset(): void {
    this.capeMotion.reset();
    this.hairLeftX.reset();
    this.hairRightX.reset();
    this.hairLeftZ.reset(-0.04);
    this.hairRightZ.reset(0.04);
    this.rig.hairLeft.rotation.set(0, 0, -0.04);
    this.rig.hairRight.rotation.set(0, 0, 0.04);
  }

  dispose(): void {
    this.reset();
  }
}
