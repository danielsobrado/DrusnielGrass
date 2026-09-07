import { Color, DirectionalLight, Light, Float32BufferAttribute, Mesh, PlaneGeometry, Scene, Vector3, type PerspectiveCamera, type WebGPURenderer } from "three/webgpu";
import type { RuntimeProfile } from "../runtime/RuntimeConfig";
import { WorldHorizonCoverage } from "../world/horizon/WorldHorizonCoverage";
import { WorldHorizonNodeMaterial } from "../world/horizon/WorldHorizonNodeMaterial";
import { WorldSkyNode } from "../world/sky/WorldSkyNode";
import { disposeResources, type DisposableResource } from "../render/ResourceDisposal";
import { WorldCloudShadowNodeMap } from "../world/sky/WorldCloudShadowNodeMap";
import { WorldNodeMaterialContext } from "../render/WorldNodeMaterialContext";
import type { RendererCapabilities } from "../render/RendererCapabilities";

/** Fixed-time scenery fixture; does not alter the production heightfield. */
export function createRendererSceneryFixture(scene: Scene, profile: RuntimeProfile,
  renderer: WebGPURenderer, capabilities: RendererCapabilities, camera: PerspectiveCamera, volumeEnabled = false) {
  const owned: DisposableResource[] = [];
  const own = <T extends DisposableResource>(resource: T): T => { owned.push(resource); return resource; };
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    disposeResources(owned.reverse());
  };
  try {
  const coverage = own(new WorldHorizonCoverage(2000, 100));
  const horizon = own(new WorldHorizonNodeMaterial(8, 20, 1000, coverage));
  const clouds = own(new WorldCloudShadowNodeMap(renderer, profile, capabilities));
  clouds.update(new Vector3(), 120);
  const sun = scene.children.find((object): object is DirectionalLight => object instanceof DirectionalLight);
  if (!sun) throw new Error("Scenery fixture requires a directional light.");
  const otherLights = scene.children.filter((object): object is Light => object instanceof Light && object !== sun);
  new WorldNodeMaterialContext(sun, otherLights, clouds.nodes).applyTo(horizon.material, 0.35);
  const horizonGeometry = own(new PlaneGeometry(3000, 3000, 64, 64));
  horizonGeometry.rotateX(-Math.PI / 2);
  const positions = horizonGeometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 3);
  const color = new Color("#77944d");
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const distance = Math.hypot(x, z);
    positions.setY(i, -2 + Math.sin(x * 0.008) * Math.cos(z * 0.006) * Math.min(distance * 0.1, 40));
    color.toArray(colors, i * 3);
  }
  horizonGeometry.computeVertexNormals();
  horizonGeometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  const horizonMesh = new Mesh(horizonGeometry, horizon.material);
  horizon.update(new Vector3());
  const sky = own(new WorldSkyNode(scene, renderer, { ...profile,
    cloud: { ...profile.cloud, volumetricEnabled: volumeEnabled && profile.cloud.volumetricEnabled } }, capabilities));
  sky.update(120, new Vector3());
  scene.add(horizonMesh);
  own({ dispose: () => horizonMesh.removeFromParent() });
  return {
    update() {
      sky.prepareFrame(camera);
    },
    dispose,
  };
  } catch (error) {
    try { dispose(); } catch (cleanupError) { console.warn("Scenery fixture rollback failed.", cleanupError); }
    throw error;
  }
}
