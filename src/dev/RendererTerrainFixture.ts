import { Color, DirectionalLight, Float32BufferAttribute, Light, Mesh, PlaneGeometry, type Scene } from "three/webgpu";
import { TerrainNodeMaterialController } from "../world/TerrainNodeMaterialController";
import type { WorldConfig } from "../world/WorldConfig";
import { WorldNodeMaterialContext } from "../render/WorldNodeMaterialContext";
import { disposeResources } from "../render/ResourceDisposal";
import { prepareTerrainNodeGeometry } from "../world/terrain/TerrainNodeGeometry";

/** Controlled attribute ramps exercise paths, wetness, biomes and steep rock. */
export function createRendererTerrainFixture(scene: Scene, config: WorldConfig, compact: boolean) {
  const sun = scene.children.find((object): object is DirectionalLight => object instanceof DirectionalLight);
  if (!sun) throw new Error("Terrain fixture requires a sun.");
  const otherLights = scene.children.filter((object): object is Light => object instanceof Light && object !== sun);
  const context = new WorldNodeMaterialContext(sun, otherLights);
  const controller = new TerrainNodeMaterialController(config, false, compact, context);
  const geometry = new PlaneGeometry(120, 120, 64, 64);
  try {
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.getAttribute("position");
    const attributes: Record<string, { size: number; values: number[] }> = {};
    const append = (name: string, ...values: number[]) => {
      (attributes[name] ??= { size: values.length, values: [] }).values.push(...values);
    };
    const color = new Color("#637448");
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), z = position.getZ(i);
      position.setY(i, -1 + Math.sin(z * 0.065) * 2 + 14 * Math.exp(-(((x - 22) / 7) ** 2)));
      append("color", color.r, color.g, color.b);
      append("terrainPath", x + Math.sin(z * 0.08) * 4, z - 15, 1, (Math.sin(z * 0.09) + 1) / 2);
      append("terrainEcology", 0.8, 0.5, (x + 60) / 120, 0.9);
      append("terrainEnvironment", 0.3, 0.65, Math.max(0, 1 - Math.abs(z + 15) / 45), 1);
      append("terrainBiome", 0, 1, (z + 60) / 120, 0.5);
      append("terrainCommunityGround", Math.max(0, x / 60), Math.max(0, -x / 60), 0.2, 0);
      append("terrainStoneInfluence", -12, -5, 2, 7);
      append("terrainStoneOcclusionCenter", -12, -5);
      append("terrainStoneOcclusion", 9);
    }
    for (const [name, { size, values }] of Object.entries(attributes)) geometry.setAttribute(name, new Float32BufferAttribute(values, size));
    geometry.computeVertexNormals();
    prepareTerrainNodeGeometry(geometry);
    const mesh = new Mesh(geometry, controller.material);
    scene.add(mesh);
    return { mesh, controller, dispose() { scene.remove(mesh); disposeResources([controller, geometry]); } };
  } catch (error) {
    disposeResources([controller, geometry]);
    throw error;
  }
}
