import {
  WORLD_CLOUD_FIELD_GLSL,
  WORLD_CLOUD_VERTICAL_PROFILE_GLSL,
} from "./WorldCloudFieldShader";
import { WORLD_CLOUD_FULLSCREEN_VERTEX_SHADER } from "./WorldCloudVolumeShader";

export { WORLD_CLOUD_FULLSCREEN_VERTEX_SHADER };

export const WORLD_CLOUD_SHADOW_FRAGMENT_SHADER = /* glsl */ `
uniform vec2 uShadowOriginXZ;
uniform float uShadowWorldSize;
uniform vec3 uSkySunDirection;
uniform float uTime;
uniform float uCloudCoverage;
uniform float uCloudSoftness;
uniform float uCloudThickness;
uniform float uCloudExtinction;
uniform float uCloudMacroScale;
uniform float uCloudDetailScale;
uniform float uCloudWeatherScale;
uniform vec2 uCloudWind;
uniform vec2 uCloudDetailWind;
uniform float uCloudShadowStrength;
uniform float uCloudMinimumDirectTransmittance;
varying vec2 vUv;

${WORLD_CLOUD_FIELD_GLSL}
${WORLD_CLOUD_VERTICAL_PROFILE_GLSL}

void main() {
  vec2 cloudPlaneXZ = uShadowOriginXZ +
    (vUv - 0.5) * uShadowWorldSize;
  float opticalDepth = 0.0;
  float sunVertical = max(uSkySunDirection.y, 0.08);
  for (int sampleIndex = 0;
       sampleIndex < WORLD_CLOUD_SHADOW_STEPS;
       ++sampleIndex) {
    float heightFraction =
      (float(sampleIndex) + 0.5) / float(WORLD_CLOUD_SHADOW_STEPS);
    vec2 sampleXZ = cloudPlaneXZ +
      uSkySunDirection.xz *
      (heightFraction * uCloudThickness / sunVertical);
    float weatherAmount = 0.0;
    float detailAmount = 0.0;
    float density = cloudDensity(sampleXZ, weatherAmount, detailAmount) *
      cloudVerticalProfile(sampleXZ, heightFraction);
    opticalDepth += density;
  }
  opticalDepth /= float(WORLD_CLOUD_SHADOW_STEPS);
  float physicalTransmittance = exp(-opticalDepth * uCloudExtinction);
  float authoredTransmittance = mix(
    1.0,
    physicalTransmittance,
    uCloudShadowStrength
  );
  float transmittance = max(
    uCloudMinimumDirectTransmittance,
    authoredTransmittance
  );
  gl_FragColor = vec4(transmittance, clamp(opticalDepth, 0.0, 1.0), 0.0, 1.0);
}
`;
