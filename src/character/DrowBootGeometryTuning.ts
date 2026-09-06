import { HUMANOID_ANKLE_TO_SOLE } from "./rig/HumanoidRigTuning";

const SOLE_RADIUS = 0.064;
const SOLE_VERTICAL_SCALE = 0.2;
const SOLE_CENTER_Y =
  -HUMANOID_ANKLE_TO_SOLE + SOLE_RADIUS * SOLE_VERTICAL_SCALE;

export const DROW_BOOT_GEOMETRY = {
  sole: {
    radius: SOLE_RADIUS,
    length: 0.164,
    y: SOLE_CENTER_Y,
    z: 0.104,
    verticalScale: SOLE_VERTICAL_SCALE,
  },
  vamp: {
    radius: 0.058,
    length: 0.134,
    y: -0.031,
    z: 0.105,
    verticalScale: 0.62,
  },
  instep: {
    width: 0.106,
    height: 0.032,
    length: 0.118,
    y: 0.005,
    z: 0.064,
    pitch: -0.18,
  },
  shaft: {
    topRadius: 0.061,
    bottomRadius: 0.065,
    height: 0.12,
    y: 0.012,
    z: -0.006,
  },
  cuff: {
    radius: 0.069,
    height: 0.022,
    y: 0.066,
    z: -0.006,
  },
  toeBand: {
    width: 0.114,
    height: 0.012,
    length: 0.022,
    y: 0.003,
    z: 0.172,
    pitch: -0.05,
  },
} as const;
