import * as THREE from "three";
import type { RuntimeProfile } from "../../runtime/RuntimeConfig";
import {
  WORLD_SKY_HAZE,
  WORLD_SKY_HORIZON,
  WORLD_SKY_SUN,
  WORLD_SKY_ZENITH,
  WORLD_SUN_DIRECTION,
} from "../../app/WorldEnvironmentTuning";
import { WORLD_SKY_CLOUD_GLSL } from "./WorldSkyCloudShader";

const SUN_DIRECTION = new THREE.Vector3(...WORLD_SUN_DIRECTION).normalize();

const FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyHaze;
uniform vec3 uSkySunDirection;
uniform vec3 uSkySunColor;
uniform float uTime;
uniform vec2 uCloudWorldOffset;
uniform float uCloudCoverage;
uniform float uCloudSoftness;
uniform float uCloudOpacity;
uniform float uCloudBaseHeight;
uniform float uCloudThickness;
uniform float uCloudExtinction;
uniform float uCloudMacroScale;
uniform float uCloudDetailScale;
uniform float uCloudWeatherScale;
uniform vec2 uCloudWind;
uniform vec2 uCloudDetailWind;
uniform float uCloudSelfShadowStrength;
uniform float uCloudSilverLiningStrength;
uniform vec3 uCloudAmbientColor;
uniform vec3 uCloudShadowColor;
uniform vec3 uCloudSunlitColor;
uniform float uGodRayStrength;
uniform sampler2D uCloudTemporalTexture;
uniform vec2 uCloudViewportInverse;
varying vec3 vSkyDirection;

${WORLD_SKY_CLOUD_GLSL}

void main() {
  vec3 direction = normalize(vSkyDirection);
  float height = direction.y;
  vec3 color = mix(uSkyHorizon, uSkyZenith, smoothstep(-0.04, 0.62, height));
  color = mix(uSkyHaze, color, smoothstep(-0.18, 0.14, height));
  float sunFacing = max(dot(direction, uSkySunDirection), 0.0);
  float glow = pow(sunFacing, 28.0);
  float disc = smoothstep(0.9992, 0.99985, sunFacing);
  color += uSkySunColor * (glow * 0.42 + disc * 1.65);
  color = applyWorldClouds(color, direction);
  gl_FragColor = vec4(color, 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createWorldSkyMaterial(vertexShader: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: "world-sky-dome",
    vertexShader,
    fragmentShader: FRAGMENT_SHADER,
    uniforms: {
      uSkyZenith: { value: linearColor(WORLD_SKY_ZENITH) },
      uSkyHorizon: { value: linearColor(WORLD_SKY_HORIZON) },
      uSkyHaze: { value: linearColor(WORLD_SKY_HAZE) },
      uSkySunDirection: { value: SUN_DIRECTION.clone() },
      uSkySunColor: { value: linearColor(WORLD_SKY_SUN) },
      uTime: { value: 0 },
      uCloudWorldOffset: { value: new THREE.Vector2() },
      uCloudCoverage: { value: 0 },
      uCloudSoftness: { value: 1 },
      uCloudOpacity: { value: 0 },
      uCloudBaseHeight: { value: 1 },
      uCloudThickness: { value: 1 },
      uCloudExtinction: { value: 1 },
      uCloudMacroScale: { value: 1 },
      uCloudDetailScale: { value: 1 },
      uCloudWeatherScale: { value: 1 },
      uCloudWind: { value: new THREE.Vector2() },
      uCloudDetailWind: { value: new THREE.Vector2() },
      uCloudSelfShadowStrength: { value: 0 },
      uCloudSilverLiningStrength: { value: 0 },
      uCloudAmbientColor: { value: new THREE.Color() },
      uCloudShadowColor: { value: new THREE.Color() },
      uCloudSunlitColor: { value: new THREE.Color() },
      uGodRayStrength: { value: 0 },
      uCloudTemporalTexture: { value: null },
      uCloudViewportInverse: { value: new THREE.Vector2(1, 1) },
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: true,
  });
}

export function configureWorldSkyClouds(
  material: THREE.ShaderMaterial,
  profile: RuntimeProfile,
): void {
  const cloud = profile.cloud;
  const defines: Record<string, number> = {};
  if (cloud.enabled) {
    defines.WORLD_CLOUDS = 1;
    if (profile.compact) {
      defines.WORLD_CLOUD_COMPACT = 1;
    }
    if (cloud.godRays) {
      defines.WORLD_CLOUD_GOD_RAYS = 1;
    }
  }
  material.defines = defines;
  material.uniforms.uCloudCoverage.value = cloud.coverage;
  material.uniforms.uCloudSoftness.value = cloud.softness;
  material.uniforms.uCloudOpacity.value = cloud.opacity;
  material.uniforms.uCloudBaseHeight.value = cloud.baseHeight;
  material.uniforms.uCloudThickness.value = cloud.thickness;
  material.uniforms.uCloudExtinction.value = cloud.extinction;
  material.uniforms.uCloudMacroScale.value = cloud.macroScale;
  material.uniforms.uCloudDetailScale.value = cloud.detailScale;
  material.uniforms.uCloudWeatherScale.value = cloud.weatherScale;
  (material.uniforms.uCloudWind.value as THREE.Vector2).set(
    cloud.windX,
    cloud.windZ,
  );
  (material.uniforms.uCloudDetailWind.value as THREE.Vector2).set(
    cloud.detailWindX,
    cloud.detailWindZ,
  );
  material.uniforms.uCloudSelfShadowStrength.value = cloud.selfShadowStrength;
  material.uniforms.uCloudSilverLiningStrength.value = cloud.silverLiningStrength;
  (material.uniforms.uCloudAmbientColor.value as THREE.Color).set(
    cloud.ambientColor,
  );
  (material.uniforms.uCloudShadowColor.value as THREE.Color).set(
    cloud.shadowColor,
  );
  (material.uniforms.uCloudSunlitColor.value as THREE.Color).set(
    cloud.sunlitColor,
  );
  material.uniforms.uGodRayStrength.value = cloud.godRayStrength;
  material.needsUpdate = true;
}

export function enableWorldSkyTemporalClouds(
  material: THREE.ShaderMaterial,
): void {
  material.defines = {
    ...(material.defines ?? {}),
    WORLD_CLOUD_TEMPORAL: 1,
  };
  material.needsUpdate = true;
}

export function disableWorldSkyTemporalClouds(
  material: THREE.ShaderMaterial,
): void {
  const defines = { ...(material.defines ?? {}) };
  delete defines.WORLD_CLOUD_TEMPORAL;
  material.defines = defines;
  material.uniforms.uCloudTemporalTexture.value = null;
  material.needsUpdate = true;
}

export function disableWorldSkyCloudsForEnvironmentBake(
  material: THREE.ShaderMaterial,
): void {
  material.defines = {};
  material.uniforms.uCloudOpacity.value = 0;
  material.uniforms.uGodRayStrength.value = 0;
  material.needsUpdate = true;
}

function linearColor(hex: string): THREE.Color {
  return new THREE.Color(hex);
}
