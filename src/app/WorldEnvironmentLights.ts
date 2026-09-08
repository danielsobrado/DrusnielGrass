import * as THREE from "three";
import type { WorldLightingState } from "../render/WorldLightingState";
import {
  WORLD_SUN_SHADOW_DISTANCE,
  WORLD_SUN_SHADOW_HALF_EXTENT,
} from "./WorldEnvironmentTuning";

const UP_AXIS = new THREE.Vector3(0, 1, 0);
const FALLBACK_SHADOW_AXIS = new THREE.Vector3(1, 0, 0);

export function createWorldEnvironmentLights(lighting: WorldLightingState): {
  hemisphere: THREE.HemisphereLight;
  ambient: THREE.AmbientLight;
  sun: THREE.DirectionalLight;
} {
  return {
    hemisphere: new THREE.HemisphereLight(
      lighting.hemisphereSkyColor,
      lighting.hemisphereGroundColor,
      lighting.hemisphereIntensity,
    ),
    ambient: new THREE.AmbientLight(
      lighting.ambientColor,
      lighting.ambientIntensity,
    ),
    sun: new THREE.DirectionalLight(
      lighting.sunColor,
      lighting.sunIntensity,
    ),
  };
}

export function configureWorldSunShadow(
  shadow: THREE.DirectionalLightShadow,
): void {
  shadow.camera.left = -WORLD_SUN_SHADOW_HALF_EXTENT;
  shadow.camera.right = WORLD_SUN_SHADOW_HALF_EXTENT;
  shadow.camera.top = WORLD_SUN_SHADOW_HALF_EXTENT;
  shadow.camera.bottom = -WORLD_SUN_SHADOW_HALF_EXTENT;
  shadow.camera.near = 1;
  shadow.camera.far = WORLD_SUN_SHADOW_DISTANCE * 2;
  shadow.camera.updateProjectionMatrix();
  shadow.normalBias = 0.02;
  shadow.radius = 3;
  shadow.bias = -0.0008;
}

export function rebuildWorldShadowBasis(
  sunDirection: THREE.Vector3,
  axisX: THREE.Vector3,
  axisY: THREE.Vector3,
): void {
  axisX.crossVectors(UP_AXIS, sunDirection);
  if (axisX.lengthSq() < 1e-8) {
    axisX.copy(FALLBACK_SHADOW_AXIS);
  } else {
    axisX.normalize();
  }
  axisY.crossVectors(sunDirection, axisX).normalize();
}

export function isFiniteVector(value: THREE.Vector3): boolean {
  return (
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z)
  );
}

export function disposeSafely(
  resource: { dispose(): void } | undefined,
  label: string,
): void {
  if (!resource) {
    return;
  }
  try {
    resource.dispose();
  } catch (error) {
    console.warn(`[Drusniel World] ${label} cleanup failed.`, error);
  }
}
