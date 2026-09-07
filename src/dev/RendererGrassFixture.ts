import { AmbientLight, DirectionalLight, Light, type Scene } from "three/webgpu";
import { GrassNearNodeMaterial } from "../grass/materials/GrassNearNodeMaterial";
import { WorldNodeMaterialContext } from "../render/WorldNodeMaterialContext";
import { disposeResources } from "../render/ResourceDisposal";
import {
  configureUniforms, createGrassComparisonState, createGrassField, createTrailTexture,
  type GrassComparisonVariant,
} from "./GrassNearFixture";

/**
 * Renders the blade field with the real node material.
 *
 * The numerical comparison isolates albedo and deformation through a basic
 * material, so this is what actually compiles the lit path: the Lambert mix,
 * the transmission term and the waxy lobe, on both backends and through the
 * same shared light context the world materials use.
 */
export function createRendererGrassFixture(scene: Scene, variant: GrassComparisonVariant) {
  const sun = scene.children.find((object): object is DirectionalLight => object instanceof DirectionalLight);
  if (!sun) throw new Error("Grass fixture requires a sun.");
  const otherLights = scene.children.filter((object): object is Light =>
    object instanceof Light && object !== sun);
  const context = new WorldNodeMaterialContext(sun, otherLights);
  const state = createGrassComparisonState(variant);
  const trailMap = createTrailTexture();
  try {
    configureUniforms(state, trailMap, state.nodeFeatures.interactive);
    const material = new GrassNearNodeMaterial(`grass-node-${variant}`, state.shaderUniforms,
      state.nodeFeatures, context);
    const mesh = createGrassField();
    mesh.material = material;
    scene.add(mesh);
    scene.add(new AmbientLight(0xffffff, 0.6));
    return {
      mesh,
      update(elapsedSeconds: number) {
        state.shaderUniforms.uGrassTime.value = elapsedSeconds;
        material.syncUniformTextures();
      },
      dispose() {
        scene.remove(mesh);
        // The legacy material shares this state only to own the uniform table;
        // both implementations are released together.
        disposeResources([material, state.material, mesh.geometry, mesh, trailMap]);
      },
    };
  } catch (error) {
    disposeResources([state.material, trailMap]);
    throw error;
  }
}
