import * as THREE from "three";
import { WATER_BED_MATERIAL_CACHE_KEY } from "./WaterMaterialTuning";
import {
  WATER_BED_COLOR_FRAGMENT,
  WATER_BED_FRAGMENT_DECLARATIONS,
  WATER_BED_VERTEX_DECLARATIONS,
  WATER_BED_VERTEX_POSITION,
} from "./WaterBedMaterialShader";

/**
 * The shipped GLSL riverbed, kept as the comparison reference.
 *
 * Production draws the node material; this is what the numerical comparison
 * measures against and what the shader contract checks read. It is a separate
 * module so the GLSL stays out of the production bundle — only `src/dev` and
 * the verifiers import it — while remaining executable rather than a quoted
 * string in a document. It is driven from the controller's own uniform table.
 */
export function createWaterBedLegacyMaterial(
  uniforms: Record<string, THREE.IUniform>,
): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    transparent: false,
    opacity: 1,
    alphaTest: 0.01,
    depthTest: true,
    depthWrite: true,
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  material.name = "world-hydrology-water-bed-material";
  material.dithering = true;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>${WATER_BED_VERTEX_DECLARATIONS}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>${WATER_BED_VERTEX_POSITION}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>${WATER_BED_FRAGMENT_DECLARATIONS}`)
      .replace("#include <color_fragment>", `#include <color_fragment>${WATER_BED_COLOR_FRAGMENT}`);
  };
  material.customProgramCacheKey = () => WATER_BED_MATERIAL_CACHE_KEY;
  material.needsUpdate = true;
  return material;
}
