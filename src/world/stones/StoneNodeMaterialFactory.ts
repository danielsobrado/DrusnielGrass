import { Vector2, type Texture } from "three/webgpu";
import { texture as textureNode, uniform } from "three/tsl";
import {
  STONE_CRUST_BREAKUP, STONE_DRY_SHEEN_POWER, STONE_DRY_SHEEN_STRENGTH, STONE_WET_DARKEN,
  STONE_WET_SHEEN_POWER, STONE_WET_SHEEN_STRENGTH,
} from "./StoneGrowthShader";
import { StoneCoarseNodeMaterial, StoneSurfaceNodeMaterial } from "./StoneSurfaceNodeMaterial";
import type { createStoneSurfaceAttributes } from "./StoneSurfaceNodes";
import type { WorldNodeMaterialContext } from "../../render/WorldNodeMaterialContext";
import type { WorldConfig } from "../WorldConfig";

export type StoneNodeVariant = "detail" | "coarse";

/**
 * Builds the node material for one stone variant.
 *
 * Shared so the shader-complexity check compiles the same materials the
 * numerical comparison renders; a second construction there could drift into
 * verifying a material the world never builds.
 */
export function createStoneNodeMaterial(config: WorldConfig,
  variant: StoneNodeVariant, attributes: ReturnType<typeof createStoneSurfaceAttributes>,
  grainTexture: Texture | undefined, context: WorldNodeMaterialContext) {
  const growthFadeEnd = config.stoneGrowthDetailFadeDistance;
  const growthFadeStart = growthFadeEnd * 0.55;
  const grainFadeEnd = config.stoneGrainFadeDistance;
  const grainFadeStart = grainFadeEnd * 0.6;
  const detail = variant === "detail";
  return detail
    ? new StoneSurfaceNodeMaterial("stone-node-detail", {
      crustBreakup: uniform(STONE_CRUST_BREAKUP),
      wetDarken: uniform(STONE_WET_DARKEN),
      growthDetailStrength: uniform(config.stoneGrowthDetailStrength),
      growthDetailScale: uniform(1 / config.stoneGrowthDetailSize),
      growthDetailFadeSquared: uniform(new Vector2(growthFadeStart * growthFadeStart,
        growthFadeEnd * growthFadeEnd)),
      mossStreakStrength: uniform(config.stoneMossStreakStrength),
      grain: grainTexture ? {
        texture: textureNode(grainTexture),
        strength: uniform(config.stoneGrainStrength),
        normalStrength: uniform(config.stoneGrainNormalStrength),
        scale: uniform(1 / config.stoneGrainSize),
        fadeSquared: uniform(new Vector2(grainFadeStart * grainFadeStart,
          grainFadeEnd * grainFadeEnd)),
      } : undefined,
    }, {
      wetSheenStrength: uniform(STONE_WET_SHEEN_STRENGTH),
      wetSheenPower: uniform(STONE_WET_SHEEN_POWER),
      drySheenStrength: uniform(STONE_DRY_SHEEN_STRENGTH),
      drySheenPower: uniform(STONE_DRY_SHEEN_POWER),
    }, attributes, context, true)
    : new StoneCoarseNodeMaterial("stone-node-coarse", uniform(STONE_WET_DARKEN),
      attributes, context);

}
