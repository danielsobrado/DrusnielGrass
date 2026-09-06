import {
  WORLD_CLOUD_FIELD_GLSL,
  WORLD_CLOUD_VERTICAL_PROFILE_GLSL,
} from "./WorldCloudFieldShader";

export const WORLD_CLOUD_FULLSCREEN_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const WORLD_CLOUD_VOLUME_FRAGMENT_SHADER = /* glsl */ `
uniform mat4 uProjectionMatrixInverse;
uniform mat4 uCameraMatrixWorld;
uniform vec3 uCameraPosition;
uniform vec3 uSkySunDirection;
uniform float uTime;
uniform float uFrameIndex;
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
varying vec2 vUv;

${WORLD_CLOUD_FIELD_GLSL}
${WORLD_CLOUD_VERTICAL_PROFILE_GLSL}

float cloudStepJitter(
  vec2 pixel,
  float frameIndex,
  float sampleIndex
) {
  vec2 sampleOffset = vec2(sampleIndex * 47.0, sampleIndex * 89.0);
  float sequenceRotation =
    frameIndex * 0.61803398875 + sampleIndex * 0.75487766625;
  return fract(
    52.9829189 *
    fract(
      0.06711056 * (pixel.x + sampleOffset.x) +
      0.00583715 * (pixel.y + sampleOffset.y) +
      sequenceRotation
    )
  );
}

float cloudLayerDistance(float worldHeight, float rayVertical) {
  return (worldHeight - uCameraPosition.y) / max(rayVertical, 0.0001);
}

float cloudPreviewDensityAt(
  vec3 rayDirection,
  float baseDistance,
  float topDistance,
  float layerFraction
) {
  float previewDistance = mix(baseDistance, topDistance, layerFraction);
  vec3 previewPosition =
    uCameraPosition + rayDirection * previewDistance;
  float previewWeather = 0.0;
  float previewDetail = 0.0;
  return cloudDensity(
    previewPosition.xz,
    previewWeather,
    previewDetail
  );
}

float cloudVolumeSelfShadow(
  vec2 worldPosition,
  float weatherAmount,
  float density
) {
  float sunVertical = max(uSkySunDirection.y, 0.15);
  vec2 sunwardWorldOffset =
    uSkySunDirection.xz * (uCloudThickness / sunVertical);
  vec2 sunwardUv =
    (worldPosition + sunwardWorldOffset + uCloudWind * uTime) *
    uCloudMacroScale;
  float threshold = uCloudCoverage + (0.5 - weatherAmount) * 0.11;
  float blocker = smoothstep(
    threshold - uCloudSoftness,
    threshold + uCloudSoftness,
    cloudValueNoise(sunwardUv)
  );
  return density * blocker * uCloudSelfShadowStrength;
}

vec3 reconstructCloudRay(vec2 uv) {
  vec4 view = uProjectionMatrixInverse * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 viewDirection = normalize(view.xyz / max(abs(view.w), 0.0001));
  return normalize((uCameraMatrixWorld * vec4(viewDirection, 0.0)).xyz);
}

void main() {
  vec3 rayDirection = reconstructCloudRay(vUv);
  if (rayDirection.y <= 0.025) {
    gl_FragColor = vec4(0.0);
    return;
  }

  float baseDistance = cloudLayerDistance(uCloudBaseHeight, rayDirection.y);
  float topDistance = cloudLayerDistance(
    uCloudBaseHeight + uCloudThickness,
    rayDirection.y
  );
  if (topDistance <= 0.0 || baseDistance > 18000.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  baseDistance = max(baseDistance, 0.0);

  float previewDensity = cloudPreviewDensityAt(
    rayDirection,
    baseDistance,
    topDistance,
    0.5
  );
  if (rayDirection.y < 0.35) {
    previewDensity = max(
      previewDensity,
      cloudPreviewDensityAt(rayDirection, baseDistance, topDistance, 0.2)
    );
    previewDensity = max(
      previewDensity,
      cloudPreviewDensityAt(rayDirection, baseDistance, topDistance, 0.8)
    );
  }
  if (previewDensity <= 0.0015) {
    gl_FragColor = vec4(0.0);
    return;
  }

  float segmentLength =
    (topDistance - baseDistance) / float(WORLD_CLOUD_VOLUME_STEPS);
  float transmittance = 1.0;
  vec3 radiance = vec3(0.0);

  for (int sampleIndex = 0;
       sampleIndex < WORLD_CLOUD_VOLUME_STEPS;
       ++sampleIndex) {
    float sampleOrdinal = float(sampleIndex);
    float sampleJitter = mix(
      0.06,
      0.94,
      cloudStepJitter(gl_FragCoord.xy, uFrameIndex, sampleOrdinal)
    );
    float sampleDistance =
      baseDistance + (sampleOrdinal + sampleJitter) * segmentLength;
    vec3 worldPosition =
      uCameraPosition + rayDirection * sampleDistance;
    float heightFraction =
      (worldPosition.y - uCloudBaseHeight) /
      max(uCloudThickness, 0.0001);
    float weatherAmount = 0.0;
    float detailAmount = 0.0;
    float horizontalDensity = cloudDensity(
      worldPosition.xz,
      weatherAmount,
      detailAmount
    );
    float density =
      horizontalDensity *
      cloudVerticalProfile(worldPosition.xz, heightFraction);
    if (density <= 0.003) {
      continue;
    }

    float normalizedStep =
      segmentLength / max(uCloudThickness, 1.0);
    float opticalDepth =
      density * uCloudExtinction * normalizedStep;
    float sampleAlpha = 1.0 - exp(-opticalDepth);
    float selfShadow = cloudVolumeSelfShadow(
      worldPosition.xz,
      weatherAmount,
      density
    );
    float overcast = smoothstep(0.66, 0.90, weatherAmount);
    float storm = smoothstep(0.86, 0.98, weatherAmount);
    float shadowMix = clamp(
      0.24 + overcast * 0.14 + storm * 0.07 + selfShadow,
      0.22,
      0.64
    );
    float viewSunFacing =
      max(dot(rayDirection, uSkySunDirection), 0.0);
    float silverEdge =
      density *
      (1.0 - density) *
      smoothstep(0.36, 0.78, detailAmount);
    float sunLift =
      pow(viewSunFacing, 3.0) *
        0.20 *
        (1.0 - selfShadow * 0.68) +
      silverEdge * uCloudSilverLiningStrength;

    vec3 cloudBase = mix(
      uCloudAmbientColor,
      uCloudShadowColor,
      shadowMix
    );
    vec3 sampleColor = mix(
      cloudBase,
      uCloudSunlitColor,
      clamp(sunLift, 0.0, 0.86)
    );
    radiance += transmittance * sampleColor * sampleAlpha;
    transmittance *= 1.0 - sampleAlpha;
    if (transmittance <= 0.025) {
      break;
    }
  }

  float horizonFade = smoothstep(0.035, 0.16, rayDirection.y);
  float opacityScale = uCloudOpacity * horizonFade;
  float alpha = (1.0 - transmittance) * opacityScale;
  gl_FragColor = vec4(radiance * opacityScale, alpha);
}
`;
