import { Color, Float32BufferAttribute, Mesh, MeshBasicNodeMaterial, PerspectiveCamera, PlaneGeometry, Scene, SphereGeometry, Vector3, type WebGPURenderer } from "three/webgpu";
import type { RuntimeProfile } from "../runtime/RuntimeConfig";
import { WorldSkyAnalyticNodeMaterial } from "../world/sky/WorldSkyAnalyticNodeMaterial";
import { configureWorldSkyClouds, createWorldSkyMaterial } from "../world/sky/WorldSkyMaterial";
import { WorldHorizonCoverage } from "../world/horizon/WorldHorizonCoverage";
import { WorldHorizonMaterial } from "../world/horizon/WorldHorizonMaterial";
import { WorldHorizonNodeMaterial } from "../world/horizon/WorldHorizonNodeMaterial";
import { disposeResources } from "../render/ResourceDisposal";
import { compareMaterialScenes } from "./MaterialSceneComparison";

export async function compareSkyMaterial(renderer: WebGPURenderer, profile: RuntimeProfile) {
  const node = new WorldSkyAnalyticNodeMaterial(profile);
  const legacy = createWorldSkyMaterial(`varying vec3 vSkyDirection;
    void main() { vec4 world = modelMatrix * vec4(position, 1.0);
      vSkyDirection = world.xyz - cameraPosition;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`);
  configureWorldSkyClouds(legacy, profile);
  const focus = new Vector3(350, 0, -250);
  node.update(120, focus);
  legacy.uniforms.uTime.value = 120;
  legacy.uniforms.uCloudWorldOffset.value.set(focus.x, focus.z);
  const geometry = new SphereGeometry(4000, 32, 16);
  const scene = new Scene(), legacyScene = new Scene();
  scene.add(new Mesh(geometry, node.material)); legacyScene.add(new Mesh(geometry, legacy));
  const camera = new PerspectiveCamera(65, 1, 0.1, 10000);
  camera.position.set(7, 6, 10); camera.lookAt(100, 200, -200);
  try { return await compareMaterialScenes(renderer, scene, legacyScene, camera); }
  finally { disposeResources([node, legacy, geometry]); }
}

export async function compareHorizonMaterial(renderer: WebGPURenderer) {
  const coverage = new WorldHorizonCoverage(800, 100);
  coverage.setChunkCovered(-2, 1, true); coverage.setChunkCovered(0, -1, true);
  const node = new WorldHorizonNodeMaterial(80, 200, 400, coverage);
  const legacy = new WorldHorizonMaterial(80, 200, 400, coverage);
  node.update(new Vector3(70, 0, -40)); legacy.update(new Vector3(70, 0, -40));
  const compile = legacy.material.onBeforeCompile;
  legacy.material.onBeforeCompile = (shader, renderer) => {
    compile(shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", "outgoingLight = diffuseColor.rgb;\n#include <opaque_fragment>");
  };
  legacy.material.dithering = false;
  const material = new MeshBasicNodeMaterial();
  material.colorNode = node.material.colorNode;
  material.positionNode = node.material.positionNode;
  material.opacityNode = node.material.opacityNode;
  material.alphaTest = node.material.alphaTest;
  const geometry = new PlaneGeometry(2000, 2000, 64, 64);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.getAttribute("position"), colors = new Float32Array(position.count * 3);
  const color = new Color("#77944d");
  for (let i = 0; i < position.count; i++) {
    position.setY(i, Math.sin(position.getX(i) * 0.008) * Math.cos(position.getZ(i) * 0.006) * 30);
    color.toArray(colors, i * 3);
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals();
  const scene = new Scene(), legacyScene = new Scene();
  scene.background = new Color(0); legacyScene.background = new Color(0);
  scene.add(new Mesh(geometry, material)); legacyScene.add(new Mesh(geometry, legacy.material));
  const camera = new PerspectiveCamera(65, 1, 0.1, 10000);
  camera.position.set(600, 500, 800); camera.lookAt(0, 0, 0);
  try { return await compareMaterialScenes(renderer, scene, legacyScene, camera); }
  finally { disposeResources([node, legacy, material, geometry, coverage]); }
}
