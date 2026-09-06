import * as THREE from "three";
import type { RuntimeCloudConfig } from "../../runtime/RuntimeConfig";

export interface WorldCloudShadowUniforms {
  uCloudShadowEnabled: THREE.IUniform<number>;
  uCloudShadowMap: THREE.IUniform<THREE.Texture | null>;
  uCloudShadowOriginXZ: THREE.IUniform<THREE.Vector2>;
  uCloudShadowWorldSize: THREE.IUniform<number>;
  uCloudShadowEdgeFadeUv: THREE.IUniform<number>;
  uCloudBaseHeight: THREE.IUniform<number>;
  uCloudSunDirection: THREE.IUniform<THREE.Vector3>;
  uCloudFocusTransmittance: THREE.IUniform<number>;
  uCloudShadowDistanceFadeStart: THREE.IUniform<number>;
  uCloudShadowDistanceFadeEnd: THREE.IUniform<number>;
}

export function createWorldCloudShadowUniforms(
  cloud: Readonly<RuntimeCloudConfig>,
  sunDirection: THREE.Vector3,
): WorldCloudShadowUniforms {
  return {
    uCloudShadowEnabled: { value: cloud.enabled ? 1 : 0 },
    uCloudShadowMap: { value: null },
    uCloudShadowOriginXZ: { value: new THREE.Vector2() },
    uCloudShadowWorldSize: { value: cloud.shadowWorldSize },
    uCloudShadowEdgeFadeUv: { value: cloud.shadowEdgeFade },
    uCloudBaseHeight: { value: cloud.baseHeight },
    uCloudSunDirection: { value: sunDirection.clone() },
    uCloudFocusTransmittance: { value: 1 },
    uCloudShadowDistanceFadeStart: { value: cloud.shadowDistanceFadeStart },
    uCloudShadowDistanceFadeEnd: { value: cloud.shadowDistanceFadeEnd },
  };
}

export function asWorldCloudShadowUniformRecord(
  uniforms: WorldCloudShadowUniforms,
): Record<string, THREE.IUniform> {
  return uniforms as unknown as Record<string, THREE.IUniform>;
}
