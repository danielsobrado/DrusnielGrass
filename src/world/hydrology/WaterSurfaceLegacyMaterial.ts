import * as THREE from "three";
import {
  WATER_IOR,
  WATER_MATERIAL_CACHE_KEY,
  WATER_SHALLOW_COLOR,
  WATER_SPECULAR_COLOR,
} from "./WaterMaterialTuning";
import {
  WATER_FRAGMENT_DECLARATIONS,
  WATER_SURFACE_FRAGMENT,
  WATER_VERTEX_DECLARATIONS,
  WATER_VERTEX_POSITION,
} from "./WaterShader";

/**
 * The shipped GLSL water surface, kept as the comparison reference.
 *
 * Production draws the node material; this exists so the numerical comparison
 * has something to measure against and so the shader contract checks can still
 * read the program the world used to draw. It lives in its own module rather
 * than inside the controller because the controller ships and this does not:
 * only `src/dev` and the verifiers import it, so the GLSL stays out of the
 * production bundle while remaining executable evidence.
 *
 * It takes the controller's own uniform table, so the reference and the shipped
 * material are driven from one piece of state and cannot be compared while
 * holding different values.
 */
export function createWaterSurfaceLegacyMaterial(
  uniforms: Record<string, THREE.IUniform>,
  roughness: number,
): THREE.MeshPhysicalMaterial {
  const material = new THREE.MeshPhysicalMaterial({
    color: WATER_SHALLOW_COLOR,
    roughness,
    metalness: 0,
    ior: WATER_IOR,
    specularColor: WATER_SPECULAR_COLOR,
    specularIntensity: 1,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  material.forceSinglePass = true;
  material.name = "world-hydrology-water-material";
  material.dithering = true;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>${WATER_VERTEX_DECLARATIONS}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>${WATER_VERTEX_POSITION}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>${WATER_FRAGMENT_DECLARATIONS}`)
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>${WATER_SURFACE_FRAGMENT}`,
      );
  };
  material.customProgramCacheKey = () => WATER_MATERIAL_CACHE_KEY;
  material.needsUpdate = true;
  return material;
}
