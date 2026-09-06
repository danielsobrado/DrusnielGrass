import * as THREE from "three";
import type {
  DeerHabitat,
  DeerHabitatSample,
} from "../../creatures/deer/DeerHabitat";
import { createHydrologySample } from "../hydrology/HydrologyField";
import type { TerrainField } from "../TerrainField";

/**
 * The world's answer to what a deer wants to know about a patch of ground.
 *
 * This is the only place the two sides meet, the same way
 * `WorldTerrainContactSampler` is the only bridge between terrain and foot
 * planting. The creature layer asks for four numbers; hydrology, ecology and
 * landform stay entirely on this side of the line.
 */
export class WorldFaunaHabitat implements DeerHabitat {
  private readonly normal = new THREE.Vector3();
  private readonly hydrology = createHydrologySample();

  constructor(private readonly field: TerrainField) {}

  sample(worldX: number, worldZ: number, target: DeerHabitatSample): void {
    const height = this.field.sampleHeight(worldX, worldZ);
    target.height = height;
    target.slopeUp = this.field.sampleNormal(worldX, worldZ, this.normal).y;
    this.field.sampleHydrology(worldX, worldZ, height, this.hydrology);
    target.water = this.hydrology.waterCoverage;

    // Forage is the product rather than the average of its terms, so any one of
    // them being absent rules the spot out: there is nothing to eat on bare
    // rock however fertile the soil around it is.
    const ecology = this.field.sampleEcologyAt(worldX, worldZ, height);
    target.forage =
      ecology.fertility *
      ecology.moisture *
      (1 - ecology.rockiness) *
      this.hydrology.grassMask;
  }
}
