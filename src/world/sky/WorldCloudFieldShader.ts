export const WORLD_CLOUD_FIELD_GLSL = /* glsl */ `
float cloudHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float cloudValueNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 local = fract(p);
  vec2 blend = local * local * (3.0 - 2.0 * local);
  float a = cloudHash12(cell);
  float b = cloudHash12(cell + vec2(1.0, 0.0));
  float c = cloudHash12(cell + vec2(0.0, 1.0));
  float d = cloudHash12(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y);
}

float cloudFbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  float weight = 0.0;
  mat2 rotation = mat2(0.8, 0.6, -0.6, 0.8);
#ifdef WORLD_CLOUD_COMPACT
  const int octaveCount = 2;
#else
  const int octaveCount = 3;
#endif
  for (int octave = 0; octave < octaveCount; ++octave) {
    value += cloudValueNoise(p) * amplitude;
    weight += amplitude;
    p = rotation * p * 2.02 + vec2(11.7, -7.3);
    amplitude *= 0.5;
  }
  return value / max(weight, 0.0001);
}

float cloudWeather(vec2 worldPosition) {
  vec2 macroPosition = worldPosition + uCloudWind * uTime;
  return cloudValueNoise(
    macroPosition * uCloudWeatherScale + vec2(-73.1, 52.8)
  );
}

float cloudDensity(
  vec2 worldPosition,
  out float weatherAmount,
  out float detailAmount
) {
  vec2 macroPosition = worldPosition + uCloudWind * uTime;
  vec2 detailPosition = worldPosition + uCloudDetailWind * uTime;
  vec2 macroUv = macroPosition * uCloudMacroScale;
  float macro = cloudFbm(macroUv);
  float warp = cloudValueNoise(macroUv * 2.35 + vec2(17.13, -9.71));
  detailAmount = cloudValueNoise(
    detailPosition * uCloudDetailScale + vec2(41.7, -26.4)
  );
  weatherAmount = smoothstep(0.28, 0.78, cloudWeather(worldPosition));
  float threshold = uCloudCoverage + (0.5 - weatherAmount) * 0.11;
  float field = macro + (warp - 0.5) * 0.2 + (detailAmount - 0.5) * 0.1;
  return smoothstep(
    threshold - uCloudSoftness,
    threshold + uCloudSoftness,
    field
  );
}
`;

export const WORLD_CLOUD_VERTICAL_PROFILE_GLSL = /* glsl */ `
float cloudVerticalProfile(vec2 worldPosition, float heightFraction) {
  vec2 macroPosition = worldPosition + uCloudWind * uTime;
  vec2 detailPosition = worldPosition + uCloudDetailWind * uTime;
  float topNoise = cloudValueNoise(
    macroPosition * uCloudMacroScale * 0.61 + vec2(23.7, -18.2)
  );
  float baseNoise = cloudValueNoise(
    macroPosition * uCloudMacroScale * 0.83 + vec2(-31.4, 14.9)
  );
  vec2 verticalOffset = vec2(
    heightFraction * 7.1,
    -heightFraction * 5.3
  );
  float bodyNoise = cloudValueNoise(
    detailPosition * uCloudDetailScale * 0.42 +
    vec2(9.2, -37.6) +
    verticalOffset
  );
  float top = mix(0.62, 1.0, topNoise);
  float baseFeather = mix(0.045, 0.095, baseNoise);
  float shapedBase = smoothstep(0.0, baseFeather, heightFraction);
  float irregularTop =
    1.0 - smoothstep(max(0.12, top - 0.16), top, heightFraction);
  float bodyErosion = mix(
    0.78,
    1.0,
    smoothstep(0.28, 0.72, bodyNoise)
  );
  return shapedBase * irregularTop * bodyErosion;
}
`;
