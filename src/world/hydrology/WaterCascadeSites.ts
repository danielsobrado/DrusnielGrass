import type { WorldConfig } from "../WorldConfig";
import { createRiverLaneCenter, type RiverField } from "./RiverField";
import type { WaterfallField } from "./WaterfallField";
import {
  CASCADE_SILL_SAMPLES,
  sampleCascadeSill,
} from "./WaterCascadeSill";
import { WATERFALL_CELL_LENGTH } from "./WaterfallTuning";

/** A knickpoint resolved into everything a cascade curtain needs to be built. */
export interface CascadeSite {
  x: number;
  z: number;
  drop: number;
  halfWidth: number;
  flowSign: number;
  lipHeight: number;
  discharge: number;
  /** Rock height across the lip, relative to the centreline. */
  sill: Float32Array;
}

export interface CascadeQueryBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Far enough upstream of a lip that the long profile has not begun to step. */
const CASCADE_LIP_PROBE = 2.5;

const laneCenter = createRiverLaneCenter();

/**
 * Finds the knickpoints whose lip falls inside an area.
 *
 * Both fields are deterministic in (lane, cell), so this reads the falls
 * straight out of them rather than searching the built water sheet for a ledge.
 * That matters because the cascade mesh has to exist at exactly the elevation
 * the hydrology carved, whatever resolution the terrain chunk under it happens
 * to be at.
 */
export function collectCascadeSites(
  rivers: RiverField,
  waterfalls: WaterfallField,
  config: WorldConfig,
  sampleRawHeight: (x: number, z: number) => number,
  bounds: CascadeQueryBounds,
  visit: (site: CascadeSite) => void,
): void {
  if (config.waterfallEnabled < 1) return;
  const firstCell = Math.floor(bounds.minX / WATERFALL_CELL_LENGTH);
  const lastCell = Math.floor(bounds.maxX / WATERFALL_CELL_LENGTH);

  rivers.forEachLaneNear(bounds.minZ, bounds.maxZ, (lane) => {
    for (let cell = firstCell; cell <= lastCell; cell += 1) {
      // Discharge is a lane property, so any x on the lane resolves it.
      rivers.resolveLaneCenter(lane, cell * WATERFALL_CELL_LENGTH, laneCenter);
      const knickpoint = waterfalls.resolveKnickpoint(
        lane,
        cell,
        laneCenter.discharge,
      );
      if (
        !knickpoint ||
        knickpoint.lipX < bounds.minX ||
        knickpoint.lipX >= bounds.maxX
      ) {
        continue;
      }

      rivers.resolveLaneCenter(lane, knickpoint.lipX, laneCenter);
      const centerZ = laneCenter.centerZ;
      if (centerZ < bounds.minZ || centerZ >= bounds.maxZ) continue;

      const lipHeight =
        sampleRawHeight(
          knickpoint.lipX - laneCenter.flowSign * CASCADE_LIP_PROBE,
          centerZ,
        ) + config.waterSurfaceOffset;
      // Rivers fade out above their altitude ceiling, so a lip up there has no
      // water arriving at it to fall.
      if (lipHeight > config.riverMaxAltitude) continue;

      visit({
        sill: sampleCascadeSill(
          sampleRawHeight,
          knickpoint.lipX,
          centerZ,
          laneCenter.halfWidth,
          laneCenter.flowSign,
          new Float32Array(CASCADE_SILL_SAMPLES),
        ),
        x: knickpoint.lipX,
        z: centerZ,
        drop: knickpoint.drop,
        halfWidth: laneCenter.halfWidth,
        flowSign: laneCenter.flowSign,
        lipHeight,
        discharge: laneCenter.discharge,
      });
    }
  });
}
