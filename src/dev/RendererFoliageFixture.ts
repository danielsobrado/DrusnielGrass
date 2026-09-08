import { AmbientLight, DirectionalLight, HemisphereLight, Light, type Scene } from "three/webgpu";
import { WorldDetailFoliageNodeMaterial } from "../world/grass/WorldDetailFoliageNodeMaterial";
import { WorldNodeMaterialContext } from "../render/WorldNodeMaterialContext";
import { disposeResources } from "../render/ResourceDisposal";
import { createFoliageSpeciesWind } from "./GrassFoliageComparison";
import {
  createFoliageAtlas, createFoliageField, createFoliageState, type GrassFoliageVariant,
} from "./GrassFoliageFixture";

/** Renders the accent field with the node foliage material, in a live scene. */
export function createRendererFoliageFixture(scene: Scene, variant: GrassFoliageVariant) {
  const sun = scene.children.find((object): object is DirectionalLight =>
    object instanceof DirectionalLight);
  if (!sun) throw new Error("Grass foliage fixture requires a sun.");
  const hemisphere = new HemisphereLight(0xbdd7ee, 0x4a5236, 0.7);
  hemisphere.position.set(0, 1, 0);
  scene.add(hemisphere);
  const otherLights = scene.children.filter((object): object is Light =>
    object instanceof Light && object !== sun && (object instanceof AmbientLight
      || object instanceof HemisphereLight));
  const context = new WorldNodeMaterialContext(sun, otherLights);
  const atlas = createFoliageAtlas();
  const state = createFoliageState(atlas, variant, context);
  try {
    const material = new WorldDetailFoliageNodeMaterial(`grass-foliage-node-${variant}`,
      state.shaderUniforms, state.nodeFeatures, createFoliageSpeciesWind(), context);
    const mesh = createFoliageField();
    mesh.material = material;
    scene.add(mesh);
    return {
      mesh,
      update(elapsedSeconds: number) {
        state.update(elapsedSeconds);
        material.syncUniformTextures();
      },
      dispose() {
        scene.remove(mesh);
        hemisphere.removeFromParent();
        disposeResources([material, state, mesh.geometry, mesh]);
      },
    };
  } catch (error) {
    disposeResources([state]);
    throw error;
  }
}
