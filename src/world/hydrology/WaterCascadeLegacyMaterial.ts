import * as THREE from "three";
import {
  WATER_CASCADE_CACHE_KEY,
  WATER_CASCADE_WATER_COLOR,
} from "./WaterMaterialTuning";
import {
  WATER_CASCADE_FRAGMENT,
  WATER_CASCADE_FRAGMENT_DECLARATIONS,
  WATER_CASCADE_VERTEX_DECLARATIONS,
  WATER_CASCADE_VERTEX_POSITION,
} from "./WaterCascadeShader";

/**
 * The shipped GLSL cascade curtain, kept as the comparison reference.
 *
 * Production draws the node material. This module exists so the numerical
 * comparison has a reference and stays out of the production bundle, and it is
 * driven from the controller's own uniform table so the two cannot be compared
 * while holding different values. See `WaterSurfaceLegacyMaterial` for the same
 * arrangement on the surface.
 */
export function createWaterCascadeLegacyMaterial(
  uniforms: Record<string, THREE.IUniform>,
): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    color: WATER_CASCADE_WATER_COLOR,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: true,
  });
  material.name = "world-water-cascade-material";
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>${WATER_CASCADE_VERTEX_DECLARATIONS}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>${WATER_CASCADE_VERTEX_POSITION}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>${WATER_CASCADE_FRAGMENT_DECLARATIONS}`)
      .replace("#include <color_fragment>", `#include <color_fragment>${WATER_CASCADE_FRAGMENT}`);
  };
  material.customProgramCacheKey = () => WATER_CASCADE_CACHE_KEY;
  material.needsUpdate = true;
  return material;
}
