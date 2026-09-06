import type { WorldConfig } from "../WorldConfig";
import { resolveHydrologyLakeCellMargin } from "./LakeField";
import {
  resolveHydrologyRiverMinimumSeparation,
  resolveHydrologyRiverMinimumVisibleHalfWidth,
  resolveHydrologyRiverWetHalfWidth,
} from "./RiverField";
import { validateRiverWidthEnvelope } from "./RiverTuning";

export function validateHydrologyConfig(config: WorldConfig): void {
  if (config.lakeRadiusMin > config.lakeRadiusMax) {
    throw new Error("lakeRadius range is reversed.");
  }
  if (resolveHydrologyLakeCellMargin(config) * 2 >= config.lakeSpacing) {
    throw new Error(
      "lakeSpacing must contain the largest lake, shoreline, and humidity halo inside one cell.",
    );
  }

  const riverMinimumSeparation = resolveHydrologyRiverMinimumSeparation(config);
  if (
    riverMinimumSeparation <= 0 ||
    resolveHydrologyRiverWetHalfWidth(config) * 2 >= riverMinimumSeparation
  ) {
    throw new Error(
      "riverSpacing must keep worst-case meanders and humidity bands separated.",
    );
  }

  const farTerrainCells = config.terrainFarResolution - 1;
  const farTerrainStep = config.chunkSize / farTerrainCells;
  if (
    resolveHydrologyRiverMinimumVisibleHalfWidth(config) <= farTerrainStep * 0.5
  ) {
    throw new Error(
      "riverWidth must remain wide enough to survive far-terrain LOD sampling.",
    );
  }
  if (config.riverMaxAltitude <= config.grassMinAltitude) {
    throw new Error("riverMaxAltitude must exceed grassMinAltitude.");
  }
  if (
    config.waterSurfaceOffset >= config.riverDepth ||
    config.waterSurfaceOffset >= config.lakeDepth
  ) {
    throw new Error("waterSurfaceOffset must remain smaller than river and lake depth.");
  }
  validateRiverWidthEnvelope(
    config.riverWidthVariation,
    config.riverBendBankAsymmetry,
  );
}
