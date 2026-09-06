import * as THREE from "three";
import type { RuntimeProfile } from "../../runtime/RuntimeConfig";
import { WORLD_SUN_DIRECTION } from "../../app/WorldEnvironmentTuning";
import {
  WORLD_CLOUD_FULLSCREEN_VERTEX_SHADER,
  WORLD_CLOUD_VOLUME_FRAGMENT_SHADER,
} from "./WorldCloudVolumeShader";
import { WORLD_CLOUD_TEMPORAL_FRAGMENT_SHADER } from "./WorldCloudTemporalShader";

const SUN_DIRECTION = new THREE.Vector3(...WORLD_SUN_DIRECTION).normalize();

export function createWorldCloudVolumeMaterial(
  profile: RuntimeProfile,
  steps: number,
): THREE.ShaderMaterial {
  const cloud = profile.cloud;
  return new THREE.ShaderMaterial({
    name: "world-cloud-volume",
    vertexShader: WORLD_CLOUD_FULLSCREEN_VERTEX_SHADER,
    fragmentShader: WORLD_CLOUD_VOLUME_FRAGMENT_SHADER,
    defines: { WORLD_CLOUD_VOLUME_STEPS: steps },
    uniforms: {
      uProjectionMatrixInverse: { value: new THREE.Matrix4() },
      uCameraMatrixWorld: { value: new THREE.Matrix4() },
      uCameraPosition: { value: new THREE.Vector3() },
      uSkySunDirection: { value: SUN_DIRECTION.clone() },
      uTime: { value: 0 },
      uFrameIndex: { value: 0 },
      uCloudCoverage: { value: cloud.coverage },
      uCloudSoftness: { value: cloud.softness },
      uCloudOpacity: { value: cloud.opacity },
      uCloudBaseHeight: { value: cloud.baseHeight },
      uCloudThickness: { value: cloud.thickness },
      uCloudExtinction: { value: cloud.extinction },
      uCloudMacroScale: { value: cloud.macroScale },
      uCloudDetailScale: { value: cloud.detailScale },
      uCloudWeatherScale: { value: cloud.weatherScale },
      uCloudWind: { value: new THREE.Vector2(cloud.windX, cloud.windZ) },
      uCloudDetailWind: {
        value: new THREE.Vector2(cloud.detailWindX, cloud.detailWindZ),
      },
      uCloudSelfShadowStrength: { value: cloud.selfShadowStrength },
      uCloudSilverLiningStrength: { value: cloud.silverLiningStrength },
      uCloudAmbientColor: { value: new THREE.Color(cloud.ambientColor) },
      uCloudShadowColor: { value: new THREE.Color(cloud.shadowColor) },
      uCloudSunlitColor: { value: new THREE.Color(cloud.sunlitColor) },
    },
    depthTest: false,
    depthWrite: false,
    transparent: false,
    toneMapped: false,
  });
}

export function createWorldCloudTemporalMaterial(
  profile: RuntimeProfile,
): THREE.ShaderMaterial {
  const cloud = profile.cloud;
  return new THREE.ShaderMaterial({
    name: "world-cloud-temporal-resolve",
    vertexShader: WORLD_CLOUD_FULLSCREEN_VERTEX_SHADER,
    fragmentShader: WORLD_CLOUD_TEMPORAL_FRAGMENT_SHADER,
    uniforms: {
      uCurrentTexture: { value: null },
      uHistoryTexture: { value: null },
      uProjectionMatrixInverse: { value: new THREE.Matrix4() },
      uCameraMatrixWorld: { value: new THREE.Matrix4() },
      uPreviousViewProjection: { value: new THREE.Matrix4() },
      uCameraPosition: { value: new THREE.Vector3() },
      uCloudWind: { value: new THREE.Vector2(cloud.windX, cloud.windZ) },
      uCloudBaseHeight: { value: cloud.baseHeight },
      uCloudThickness: { value: cloud.thickness },
      uDeltaSeconds: { value: 0 },
      uTemporalBlend: { value: cloud.temporalBlend },
      uHistoryValid: { value: 0 },
    },
    depthTest: false,
    depthWrite: false,
    transparent: false,
    toneMapped: false,
  });
}
