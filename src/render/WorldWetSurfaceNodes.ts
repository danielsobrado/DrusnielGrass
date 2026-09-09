import type { MeshStandardNodeMaterial, Node } from "three/webgpu";
import { float, max, mix, uniform } from "three/tsl";
import type { WorldNodeMaterialContext } from "./WorldNodeMaterialContext";
import {
  WORLD_WETNESS_MAX_COLOR_DARKENING,
  WORLD_WETNESS_ROUGHNESS_FLOOR,
} from "../world/weather/WorldRainTuning";

/** Rain only darkens diffuse response; metalness and alpha remain untouched. */
export function worldWetColorNode(
  color: Node<"vec3">,
  wetness: Node<"float">,
): Node<"vec3"> {
  return color.mul(float(1).sub(wetness.clamp(0, 1).mul(WORLD_WETNESS_MAX_COLOR_DARKENING)));
}

/** Moves roughness toward a wet target without ever crossing the authored floor. */
export function worldWetRoughnessNode(
  dryRoughness: Node<"float">,
  wetness: Node<"float">,
): Node<"float"> {
  const wetTarget = max(float(WORLD_WETNESS_ROUGHNESS_FLOOR), dryRoughness.mul(0.45));
  return mix(dryRoughness, wetTarget, wetness.clamp(0, 1));
}

/**
 * Binds a standard opaque material to the stable per-world wetness uniform.
 * Baseline material values are captured once during construction; later frames
 * update only that shared uniform, preserving node graph/cache identity.
 */
export function applyWorldWetStandardMaterial(
  material: MeshStandardNodeMaterial,
  context: WorldNodeMaterialContext | undefined,
): void {
  if (!context) return;
  const wetness = context.worldWetness();
  if (wetness) {
    const dryColor = uniform(material.color, "color").rgb;
    const dryRoughness = float(material.roughness);
    material.colorNode = worldWetColorNode(dryColor, wetness);
    material.roughnessNode = worldWetRoughnessNode(dryRoughness, wetness);
  }
  context.applyTo(material);
}
