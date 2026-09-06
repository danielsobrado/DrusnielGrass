export const WORLD_CLOUD_SHADOW_SAMPLER_GLSL = /* glsl */ `
uniform float uCloudShadowEnabled;
uniform sampler2D uCloudShadowMap;
uniform vec2 uCloudShadowOriginXZ;
uniform float uCloudShadowWorldSize;
uniform float uCloudShadowEdgeFadeUv;
uniform float uCloudBaseHeight;
uniform vec3 uCloudSunDirection;
uniform float uCloudFocusTransmittance;
uniform float uCloudShadowDistanceFadeStart;
uniform float uCloudShadowDistanceFadeEnd;

float sampleWorldCloudTransmittance(
  vec3 worldPosition,
  float cameraDistance
) {
  if (uCloudShadowEnabled < 0.5 || uCloudShadowWorldSize <= 0.0) {
    return 1.0;
  }
  float cloudHeight = max(uCloudBaseHeight - worldPosition.y, 0.0);
  float sunVertical = max(uCloudSunDirection.y, 0.08);
  vec2 projectedCloudXZ = worldPosition.xz +
    uCloudSunDirection.xz * (cloudHeight / sunVertical);
  vec2 uv =
    (projectedCloudXZ - uCloudShadowOriginXZ) / uCloudShadowWorldSize + 0.5;
  vec2 inside = step(vec2(0.0), uv) * step(uv, vec2(1.0));
  if (inside.x * inside.y < 0.5) {
    return 1.0;
  }
  vec2 edge = min(uv, 1.0 - uv);
  float edgeCoverage = smoothstep(
    0.0,
    max(uCloudShadowEdgeFadeUv, 0.0001),
    min(edge.x, edge.y)
  );
  float localT = clamp(texture2D(uCloudShadowMap, uv).r, 0.0, 1.0);
  localT = mix(1.0, localT, edgeCoverage);
  float distanceFade = smoothstep(
    uCloudShadowDistanceFadeStart,
    uCloudShadowDistanceFadeEnd,
    cameraDistance
  );
  return mix(localT, 1.0, distanceFade);
}

float resolveRelativeCloudDirectLight(float localTransmittance) {
  return min(
    1.6,
    max(localTransmittance, 0.0) /
      max(uCloudFocusTransmittance, 0.001)
  );
}
`;
