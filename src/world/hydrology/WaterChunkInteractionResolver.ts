import {
  createWaterFlowSample,
  resolveDownhillWaterFlow,
  type WaterFlowSample,
} from "./WaterFlowDirection";
import {
  createHydrologySample,
  type HydrologySample,
} from "./HydrologyField";
import {
  createWaterInteractionSample,
  type WaterInteractionField,
  type WaterInteractionSample,
} from "./WaterInteractionField";
import { WATER_VISIBLE_COVERAGE_THRESHOLD } from "./WaterMaterialTuning";

/**
 * Incrementally settles the per-vertex flow tangent and the flow-aware stone
 * interaction channels for one water grid. Resolving the downhill direction here
 * rather than in the shader keeps it a smoothly interpolated vertex quantity: the
 * fragment stage has only the flat per-triangle derivative to decide from, which
 * makes the choice flip between the two triangles of a shore quad.
 */
export class WaterChunkInteractionResolver {
  private readonly interaction: WaterInteractionSample = createWaterInteractionSample();
  private readonly hydrology: HydrologySample = createHydrologySample();
  private readonly flow: WaterFlowSample = createWaterFlowSample();
  private nextIndex = 0;

  constructor(
    private readonly resolution: number,
    private readonly positions: Float32Array,
    private readonly data: Float32Array,
    private readonly interactions: Float32Array,
    private readonly stoneClearances: Float32Array,
    private readonly interactionField: WaterInteractionField,
  ) {}

  advance(deadline: number): boolean {
    const vertexCount = this.resolution * this.resolution;
    let processed = 0;
    while (
      this.nextIndex < vertexCount &&
      (processed === 0 || performance.now() < deadline)
    ) {
      const index = this.nextIndex;
      this.nextIndex += 1;
      processed += 1;
      const dataOffset = index * 4;
      resolveDownhillWaterFlow(
        index,
        this.resolution,
        this.positions,
        this.data,
        this.flow,
      );
      // Dry vertices still carry a tangent into the wet side of a shore quad, so
      // they are settled too - only the costly stone sampling is skipped for them.
      this.data[dataOffset + 2] = this.flow.flowX * this.flow.riverCoverage;
      this.data[dataOffset + 3] = this.flow.flowZ * this.flow.riverCoverage;
      if (this.data[dataOffset] < WATER_VISIBLE_COVERAGE_THRESHOLD) continue;

      this.hydrology.riverCoverage = this.flow.riverCoverage;
      this.hydrology.flowX = this.flow.flowX;
      this.hydrology.flowZ = this.flow.flowZ;
      const positionOffset = index * 3;
      this.interactionField.sample(
        this.positions[positionOffset],
        this.positions[positionOffset + 2],
        this.hydrology,
        this.stoneClearances[index],
        this.interaction,
      );
      const interactionOffset = index * 2;
      this.interactions[interactionOffset] = this.interaction.obstacle;
      this.interactions[interactionOffset + 1] = this.interaction.wake;
    }
    return this.nextIndex >= vertexCount;
  }

  isComplete(): boolean {
    return this.nextIndex >= this.resolution * this.resolution;
  }
}
