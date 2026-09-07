import { Color, Texture, Vector2 } from "three/webgpu";
import type { IUniform } from "three";
import { attribute, int, mix, uniform, uniformArray, reference, texture, varying, vec4 } from "three/tsl";
import { GRASS_MAX_BIOMES } from "../../grass/biome/GrassBiomeProfile";
import type { TerrainSurfacePalette } from "./TerrainSurfacePalette";

function cached<T>(resolve: (name: string) => T): (name: string) => T {
  const nodes = new Map<string, T>();
  return name => {
    if (!nodes.has(name)) nodes.set(name, resolve(name));
    return nodes.get(name)!;
  };
}

/** Adapts the existing art/palette table without changing its configuration. */
export function createTerrainNodeUniforms(values: Record<string, IUniform>) {
  return {
    number: cached((name: string) => {
      if (typeof values[name]?.value !== "number") throw new Error(`Missing terrain scalar ${name}`);
      return reference("value", "float", values[name]);
    }),
    uint: cached((name: string) => {
      if (typeof values[name]?.value !== "number") throw new Error(`Missing terrain seed ${name}`);
      return reference("value", "uint", values[name]);
    }),
    vector2: cached((name: string) => {
      const value = values[name]?.value;
      if (!(value instanceof Vector2)) throw new Error(`Missing terrain vector ${name}`);
      return uniform(value);
    }),
    color: cached((name: string) => {
      const value = values[name]?.value;
      if (!(value instanceof Color)) throw new Error(`Missing terrain color ${name}`);
      return uniform(value).rgb;
    }),
    texture: cached((name: string) => {
      const value = values[name]?.value;
      if (!(value instanceof Texture)) throw new Error(`Missing terrain texture ${name}`);
      return texture(value);
    }),
  };
}

export function createTerrainNodeAttributes(palette: TerrainSurfacePalette) {
  const biome = attribute<"vec4">("terrainBiome", "vec4");
  const a = int(biome.x.clamp(0, GRASS_MAX_BIOMES - 1).add(0.5));
  const b = int(biome.y.clamp(0, GRASS_MAX_BIOMES - 1).add(0.5));
  const blend = biome.z.clamp(0, 1);
  // Color arrays must retain the color type: vec3 uploads read x/y/z,
  // whereas Color stores r/g/b, even though both compile to a shader vec3.
  const bases = uniformArray<"color">(palette.base, "color"), tips = uniformArray<"color">(palette.tip, "color");
  const dry = uniformArray<"color">(palette.dry, "color"), shades = uniformArray<"vec2">(palette.shade, "vec2");
  const base = mix(bases.element(a).rgb, bases.element(b).rgb, blend);
  const tip = mix(tips.element(a).rgb, tips.element(b).rgb, blend);
  const shade = mix(shades.element(a), shades.element(b), blend);
  return {
    color: attribute<"vec3">("color", "vec3"),
    path: varying(attribute<"vec4">("terrainPath", "vec4")),
    ecology: varying(attribute<"vec4">("terrainEcology", "vec4")),
    environment: varying(attribute<"vec4">("terrainEnvironment", "vec4")),
    stone: varying(attribute<"vec4">("terrainStoneInfluence", "vec4")),
    occlusionCenter: varying(attribute<"vec2">("terrainStoneOcclusionCenter", "vec2")),
    occlusion: varying(attribute<"float">("terrainStoneOcclusion", "float")),
    community: varying(attribute<"vec4">("terrainCommunityGround", "vec4")),
    macroDryness: varying(biome.w),
    base: varying(vec4(base, mix(0.92, 0.78, shade.x.clamp(0, 1)))),
    dry: varying(mix(dry.element(a).rgb, dry.element(b).rgb, blend)),
    canopy: varying(mix(base, tip, shade.y.clamp(0, 1).mul(0.42))),
  };
}

export type TerrainNodeUniforms = ReturnType<typeof createTerrainNodeUniforms>;
export type TerrainNodeAttributes = ReturnType<typeof createTerrainNodeAttributes>;
