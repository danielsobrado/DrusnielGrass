import * as THREE from "three";
import { CharacterSpring } from "./CharacterSpring";
import { CapeMotionGeometry } from "./CapeMotionGeometry";
import {
  CAPE_AIRBORNE_BLEND_RATE,
  CAPE_AIRBORNE_FLUTTER_STRENGTH,
  CAPE_AIRBORNE_SPEED_THRESHOLD,
  CAPE_AIRFLOW_END,
  CAPE_AIRFLOW_START,
  CAPE_BASE_BACK_ANGLE,
  CAPE_FLUTTER_STRENGTH,
  CAPE_FORWARD_ACCELERATION_LAG,
  CAPE_FORWARD_DRAG,
  CAPE_JUMP_BILLOW_FREQUENCY,
  CAPE_JUMP_BILLOW_STRENGTH,
  CAPE_JUMP_ROOT_BILLOW_SCALE,
  CAPE_LANDING_ROOT_IMPULSE,
  CAPE_LANDING_SIDE_IMPULSE_SCALE,
  CAPE_LANDING_TAIL_IMPULSE,
  CAPE_MAX_DELTA_SECONDS,
  CAPE_MAX_FORWARD_BEND,
  CAPE_MAX_LOCAL_ACCELERATION,
  CAPE_MAX_SIDE_BEND,
  CAPE_MAX_VERTICAL_SPEED,
  CAPE_MIN_FORWARD_BEND,
  CAPE_ROOT_DAMPING,
  CAPE_ROOT_FREQUENCY,
  CAPE_SIDE_ACCELERATION_LAG,
  CAPE_SIDE_DRAG,
  CAPE_SIDE_PANEL_BEND_SCALE,
  CAPE_SIDE_PANEL_SPEED_BIAS,
  CAPE_SIDE_REST_ANGLE,
  CAPE_TAIL_DAMPING,
  CAPE_TAIL_FORWARD_SCALE,
  CAPE_TAIL_FREQUENCY,
  CAPE_TAIL_SIDE_SCALE,
  CAPE_TAIL_VERTICAL_LAG,
  CAPE_VERTICAL_AIRFLOW_SCALE,
  CAPE_VERTICAL_LAG,
} from "./CapeMotionTuning";

const TWO_PI = Math.PI * 2;

export interface CapeMotionInput {
  forwardVelocity: number;
  sideVelocity: number;
  verticalVelocity: number;
  runSpeed: number;
  landed: boolean;
  landingImpact: number;
}

export interface CapeMotionPose {
  bendX: number;
  bendZ: number;
}

export class CapeMotion {
  private readonly backX = new CharacterSpring(CAPE_BASE_BACK_ANGLE);
  private readonly leftX = new CharacterSpring(
    CAPE_BASE_BACK_ANGLE * CAPE_SIDE_PANEL_BEND_SCALE,
  );
  private readonly rightX = new CharacterSpring(
    CAPE_BASE_BACK_ANGLE * CAPE_SIDE_PANEL_BEND_SCALE,
  );
  private readonly leftZ = new CharacterSpring(-CAPE_SIDE_REST_ANGLE);
  private readonly rightZ = new CharacterSpring(CAPE_SIDE_REST_ANGLE);
  private readonly tailX = new CharacterSpring();
  private readonly tailZ = new CharacterSpring();
  private readonly pose: CapeMotionPose = {
    bendX: CAPE_BASE_BACK_ANGLE,
    bendZ: 0,
  };
  private readonly geometry: CapeMotionGeometry;
  private elapsedSeconds = 0;
  private airborneTime = 0;
  private airborneBlend = 0;
  private airborne = false;
  private previousForwardVelocity = 0;
  private previousSideVelocity = 0;

  constructor(
    private readonly back: THREE.Object3D,
    private readonly left: THREE.Object3D,
    private readonly right: THREE.Object3D,
  ) {
    this.geometry = new CapeMotionGeometry(back, left, right);
    this.reset();
  }

  update(deltaSeconds: number, input: CapeMotionInput): CapeMotionPose {
    const delta = THREE.MathUtils.clamp(
      finiteOrZero(deltaSeconds),
      0,
      CAPE_MAX_DELTA_SECONDS,
    );
    this.elapsedSeconds += delta;

    const forwardVelocity = finiteOrZero(input.forwardVelocity);
    const sideVelocity = finiteOrZero(input.sideVelocity);
    const verticalVelocity = finiteOrZero(input.verticalVelocity);
    const runSpeed = Math.max(
      Math.abs(finiteOrZero(input.runSpeed)),
      Number.EPSILON,
    );
    const forward01 = THREE.MathUtils.clamp(
      forwardVelocity / runSpeed,
      -1,
      1,
    );
    const side01 = THREE.MathUtils.clamp(sideVelocity / runSpeed, -1, 1);
    const vertical01 = THREE.MathUtils.clamp(
      verticalVelocity / CAPE_MAX_VERTICAL_SPEED,
      -1,
      1,
    );
    const forwardAcceleration01 = this.calculateAcceleration(
      forwardVelocity,
      this.previousForwardVelocity,
      delta,
    );
    const sideAcceleration01 = this.calculateAcceleration(
      sideVelocity,
      this.previousSideVelocity,
      delta,
    );
    this.previousForwardVelocity = forwardVelocity;
    this.previousSideVelocity = sideVelocity;

    if (
      !this.airborne &&
      Math.abs(verticalVelocity) >= CAPE_AIRBORNE_SPEED_THRESHOLD
    ) {
      this.airborne = true;
      this.airborneTime = 0;
    }
    if (input.landed) {
      this.airborne = false;
      const impact = THREE.MathUtils.clamp(
        finiteOrZero(input.landingImpact),
        0,
        1,
      );
      this.backX.addImpulse(impact * CAPE_LANDING_ROOT_IMPULSE);
      this.leftX.addImpulse(
        impact * CAPE_LANDING_ROOT_IMPULSE * CAPE_LANDING_SIDE_IMPULSE_SCALE,
      );
      this.rightX.addImpulse(
        impact * CAPE_LANDING_ROOT_IMPULSE * CAPE_LANDING_SIDE_IMPULSE_SCALE,
      );
      this.tailX.addImpulse(impact * CAPE_LANDING_TAIL_IMPULSE);
    }

    if (this.airborne) {
      this.airborneTime += delta;
    }
    const airborneTarget = this.airborne ? 1 : 0;
    const airborneBlend = 1 - Math.exp(-CAPE_AIRBORNE_BLEND_RATE * delta);
    this.airborneBlend = THREE.MathUtils.lerp(
      this.airborneBlend,
      airborneTarget,
      airborneBlend,
    );
    const jumpBillow =
      Math.sin(this.airborneTime * CAPE_JUMP_BILLOW_FREQUENCY * TWO_PI) *
      CAPE_JUMP_BILLOW_STRENGTH *
      this.airborneBlend;

    const targetX = THREE.MathUtils.clamp(
      CAPE_BASE_BACK_ANGLE +
        forward01 * CAPE_FORWARD_DRAG +
        forwardAcceleration01 * CAPE_FORWARD_ACCELERATION_LAG -
        vertical01 * CAPE_VERTICAL_LAG +
        jumpBillow * CAPE_JUMP_ROOT_BILLOW_SCALE,
      CAPE_MIN_FORWARD_BEND,
      CAPE_MAX_FORWARD_BEND,
    );
    const targetZ = THREE.MathUtils.clamp(
      -side01 * CAPE_SIDE_DRAG -
        sideAcceleration01 * CAPE_SIDE_ACCELERATION_LAG,
      -CAPE_MAX_SIDE_BEND,
      CAPE_MAX_SIDE_BEND,
    );
    const sidePanelBias = side01 * CAPE_SIDE_PANEL_SPEED_BIAS;

    const bendX = this.backX.update(
      targetX,
      delta,
      CAPE_ROOT_FREQUENCY,
      CAPE_ROOT_DAMPING,
    );
    const leftX = this.leftX.update(
      targetX * CAPE_SIDE_PANEL_BEND_SCALE - sidePanelBias,
      delta,
      CAPE_ROOT_FREQUENCY,
      CAPE_ROOT_DAMPING,
    );
    const rightX = this.rightX.update(
      targetX * CAPE_SIDE_PANEL_BEND_SCALE + sidePanelBias,
      delta,
      CAPE_ROOT_FREQUENCY,
      CAPE_ROOT_DAMPING,
    );
    const leftZ = this.leftZ.update(
      targetZ - CAPE_SIDE_REST_ANGLE,
      delta,
      CAPE_ROOT_FREQUENCY,
      CAPE_ROOT_DAMPING,
    );
    const rightZ = this.rightZ.update(
      targetZ + CAPE_SIDE_REST_ANGLE,
      delta,
      CAPE_ROOT_FREQUENCY,
      CAPE_ROOT_DAMPING,
    );

    this.back.rotation.x = bendX;
    this.left.rotation.set(leftX, 0, leftZ);
    this.right.rotation.set(rightX, 0, rightZ);

    const tailBendX = this.tailX.update(
      targetX * CAPE_TAIL_FORWARD_SCALE +
        forwardAcceleration01 * CAPE_FORWARD_ACCELERATION_LAG -
        vertical01 * CAPE_TAIL_VERTICAL_LAG +
        jumpBillow,
      delta,
      CAPE_TAIL_FREQUENCY,
      CAPE_TAIL_DAMPING,
    );
    const tailBendZ = this.tailZ.update(
      targetZ * CAPE_TAIL_SIDE_SCALE +
        sideAcceleration01 * CAPE_SIDE_ACCELERATION_LAG,
      delta,
      CAPE_TAIL_FREQUENCY,
      CAPE_TAIL_DAMPING,
    );

    const relativeAirSpeed = Math.hypot(
      forwardVelocity,
      sideVelocity,
      verticalVelocity * CAPE_VERTICAL_AIRFLOW_SCALE,
    );
    const airflow = THREE.MathUtils.smoothstep(
      relativeAirSpeed / runSpeed,
      CAPE_AIRFLOW_START,
      CAPE_AIRFLOW_END,
    );
    const accelerationEnergy = Math.min(
      1,
      Math.hypot(forwardAcceleration01, sideAcceleration01),
    );
    const movementFlutter =
      CAPE_FLUTTER_STRENGTH *
      airflow *
      (0.55 + accelerationEnergy * 0.45);
    const flutterAmplitude = Math.max(
      movementFlutter,
      CAPE_AIRBORNE_FLUTTER_STRENGTH * this.airborneBlend,
    );
    this.geometry.update(
      this.elapsedSeconds,
      tailBendX,
      tailBendZ,
      flutterAmplitude,
    );

    this.pose.bendX = bendX;
    this.pose.bendZ = (leftZ + rightZ) * 0.5;
    return this.pose;
  }

  reset(): void {
    this.elapsedSeconds = 0;
    this.airborneTime = 0;
    this.airborneBlend = 0;
    this.airborne = false;
    this.previousForwardVelocity = 0;
    this.previousSideVelocity = 0;
    this.backX.reset(CAPE_BASE_BACK_ANGLE);
    this.leftX.reset(CAPE_BASE_BACK_ANGLE * CAPE_SIDE_PANEL_BEND_SCALE);
    this.rightX.reset(CAPE_BASE_BACK_ANGLE * CAPE_SIDE_PANEL_BEND_SCALE);
    this.leftZ.reset(-CAPE_SIDE_REST_ANGLE);
    this.rightZ.reset(CAPE_SIDE_REST_ANGLE);
    this.tailX.reset();
    this.tailZ.reset();
    this.pose.bendX = CAPE_BASE_BACK_ANGLE;
    this.pose.bendZ = 0;
    this.back.rotation.x = CAPE_BASE_BACK_ANGLE;
    this.left.rotation.set(
      CAPE_BASE_BACK_ANGLE * CAPE_SIDE_PANEL_BEND_SCALE,
      0,
      -CAPE_SIDE_REST_ANGLE,
    );
    this.right.rotation.set(
      CAPE_BASE_BACK_ANGLE * CAPE_SIDE_PANEL_BEND_SCALE,
      0,
      CAPE_SIDE_REST_ANGLE,
    );
    this.geometry.update(0, 0, 0, 0);
  }

  private calculateAcceleration(
    current: number,
    previous: number,
    deltaSeconds: number,
  ): number {
    if (deltaSeconds <= Number.EPSILON) {
      return 0;
    }
    return THREE.MathUtils.clamp(
      (current - previous) /
        deltaSeconds /
        CAPE_MAX_LOCAL_ACCELERATION,
      -1,
      1,
    );
  }
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
