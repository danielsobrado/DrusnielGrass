import { AmbientLight, DirectionalLight, HemisphereLight, Light, type Scene } from "three/webgpu";
import { WorldGrassImpostorNodeMaterial } from "../world/grass/WorldGrassImpostorNodeMaterial";
import { WorldNodeMaterialContext } from "../render/WorldNodeMaterialContext";
import { disposeResources } from "../render/ResourceDisposal";
import {
  createImpostorAtlas, createImpostorField, createImpostorState, type GrassImpostorVariant,
} from "./GrassImpostorFixture";

/**
 * Renders the card field with the node impostor material.
 *
 * The numerical comparison renders the same material offscreen; this is what
 * exercises it in a live scene — resize, repeated frames and the wind field
 * advancing — on both backends.
 */
export function createRendererImpostorFixture(scene: Scene, variant: GrassImpostorVariant) {
  const sun = scene.children.find((object): object is DirectionalLight =>
    object instanceof DirectionalLight);
  if (!sun) throw new Error("Grass impostor fixture requires a sun.");
  const hemisphere = new HemisphereLight(0xbdd7ee, 0x4a5236, 0.7);
  hemisphere.position.set(0, 1, 0);
  scene.add(hemisphere);
  const otherLights = scene.children.filter((object): object is Light =>
    object instanceof Light && object !== sun && (object instanceof AmbientLight
      || object instanceof HemisphereLight));
  const context = new WorldNodeMaterialContext(sun, otherLights);
  const atlas = createImpostorAtlas();
  const state = createImpostorState(atlas, variant);
  try {
    const material = new WorldGrassImpostorNodeMaterial(`grass-impostor-node-${variant}`,
      state.shaderUniforms, state.nodeFeatures, context);
    const mesh = createImpostorField(atlas);
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
        // The legacy material shares this state only to own the uniform table;
        // both implementations are released together.
        disposeResources([material, state, mesh.geometry, mesh]);
      },
    };
  } catch (error) {
    disposeResources([state]);
    throw error;
  }
}
