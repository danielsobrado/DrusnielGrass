import type { ControllerRecoveryState } from "../controls/WorldController";

/** CPU navigation state only; no renderer resources survive reconstruction. */
export type RuntimeRecoveryState = ControllerRecoveryState | {
  mode: "island";
  position: [number, number, number];
  target: [number, number, number];
};
