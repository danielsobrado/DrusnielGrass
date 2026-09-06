import { WORLD_CLOUD_FIELD_GLSL } from "./WorldCloudFieldShader";

export { WORLD_CLOUD_FIELD_GLSL } from "./WorldCloudFieldShader";

export const WORLD_SKY_CLOUD_GLSL = /* glsl */ `
${WORLD_CLOUD_FIELD_GLSL}

float cloudSelfShadow(
  vec2 worldPosition,
  float weatherAmount,
  float density
) {
#ifdef WORLD_CLOUD_COMPACT
  return density * uCloudSelfShadowStrength * 0.35;
#else
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
#endif
}

float cloudRayBreakup(vec2 rayLocal, float seed) {
  float broad = cloudValueNoise(rayLocal * 18.0 + vec2(7.3, -11.7) + seed);
  mat2 rotate = mat2(0.8, 0.6, -0.6, 0.8);
  float detail = cloudValueNoise(
    rotate * rayLocal * 37.0 + vec2(-19.1, 5.7) - seed * 0.37
  );
  return broad * 0.68 + detail * 0.32;
}

vec3 applyTemporalGodRays(
  vec3 color,
  vec3 direction,
  float cloudAlpha,
  float horizonFade
) {
#ifndef WORLD_CLOUD_GOD_RAYS
  return color;
#else
  float sunFacing = max(dot(direction, uSkySunDirection), 0.0);
  vec3 rayTangent = normalize(
    cross(uSkySunDirection, vec3(0.0, 1.0, 0.0)) + vec3(0.0001)
  );
  vec3 rayBitangent = normalize(cross(uSkySunDirection, rayTangent));
  vec2 rayLocal = vec2(
    dot(direction, rayTangent),
    dot(direction, rayBitangent)
  );
  float shaftShape = smoothstep(0.52, 0.82, cloudRayBreakup(rayLocal, 0.31));
  float shaftCone = pow(sunFacing, 7.0);
  float edgeGate = 0.35 + cloudAlpha * (1.0 - cloudAlpha) * 2.4;
  float godRay =
    shaftCone * (1.0 - cloudAlpha) * shaftShape * edgeGate * horizonFade;
  return color + uSkySunColor * godRay * uGodRayStrength;
#endif
}

vec2 cloudPlanePosition(vec3 direction) {
  float heightScale = uCloudBaseHeight / max(direction.y, 0.075);
  return uCloudWorldOffset + direction.xz * heightScale;
}

vec3 applyWorldClouds(vec3 skyColor, vec3 direction) {
#ifndef WORLD_CLOUDS
  return skyColor;
#else
  if (direction.y <= 0.015) {
    return skyColor;
  }

  float horizonFade = smoothstep(0.025, 0.18, direction.y);

#ifdef WORLD_CLOUD_TEMPORAL
  vec2 cloudUv = clamp(
    gl_FragCoord.xy * uCloudViewportInverse,
    vec2(0.0),
    vec2(1.0)
  );
  vec4 cloudVolume = texture2D(uCloudTemporalTexture, cloudUv);
  vec3 color =
    skyColor * (1.0 - cloudVolume.a) + cloudVolume.rgb;
  return applyTemporalGodRays(
    color,
    direction,
    cloudVolume.a,
    horizonFade
  );
#else
  vec2 worldPosition = cloudPlanePosition(direction);
  float weatherAmount = 0.0;
  float detailAmount = 0.0;
  float density = cloudDensity(worldPosition, weatherAmount, detailAmount);
  float opticalTransmittance = exp(-density * uCloudExtinction);
  float alpha =
    (1.0 - opticalTransmittance) * uCloudOpacity * horizonFade;

  float sunFacing = max(dot(direction, uSkySunDirection), 0.0);
  float silverEdge =
    density * (1.0 - density) * smoothstep(0.38, 0.78, detailAmount);
  float selfShadow = cloudSelfShadow(worldPosition, weatherAmount, density);
  float overcast = smoothstep(0.66, 0.90, weatherAmount);
  float storm = smoothstep(0.86, 0.98, weatherAmount);
  float shadowMix = clamp(
    0.26 + overcast * 0.14 + storm * 0.06 + selfShadow,
    0.24,
    0.62
  );
  float sunLift =
    pow(sunFacing, 3.0) * 0.22 * (1.0 - selfShadow * 0.65) +
    silverEdge * uCloudSilverLiningStrength;
  vec3 cloudBase = mix(
    uCloudAmbientColor,
    uCloudShadowColor,
    shadowMix
  );
  vec3 cloudColor = mix(
    cloudBase,
    uCloudSunlitColor,
    clamp(sunLift, 0.0, 0.84)
  );

  float hazeBlend = 1.0 - smoothstep(0.025, 0.13, direction.y);
  cloudColor = mix(cloudColor, uSkyHaze, hazeBlend * 0.72);
  vec3 color = mix(skyColor, cloudColor, alpha);

#ifdef WORLD_CLOUD_GOD_RAYS
  vec3 rayTangent = normalize(
    cross(uSkySunDirection, vec3(0.0, 1.0, 0.0)) + vec3(0.0001)
  );
  vec3 rayBitangent = normalize(cross(uSkySunDirection, rayTangent));
  vec2 rayLocal = vec2(
    dot(direction, rayTangent),
    dot(direction, rayBitangent)
  );
  float clearOpening = 1.0 - density;
  float shaftShape = smoothstep(
    0.50,
    0.80,
    cloudRayBreakup(rayLocal, detailAmount * 0.73 + 0.19)
  );
  float shaftCone = pow(sunFacing, 7.0);
  float edgeGate = 0.35 + silverEdge * 2.4;
  float godRay =
    shaftCone * clearOpening * shaftShape * edgeGate * horizonFade;
  color += uSkySunColor * godRay * uGodRayStrength;
#endif

  return color;
#endif
#endif
}
`;
