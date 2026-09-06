export const WORLD_HORIZON_APRON_HAZE_DISTANCE = 240;

export const WORLD_HORIZON_VERTEX = /* glsl */ `
  uniform float uHorizonSinkDepth;
  uniform vec2 uHorizonSinkFade;
  uniform vec2 uHorizonSinkFocus;
  varying vec2 vHorizonWorldXZ;
  uniform vec3 uHorizonSunDirection;
  uniform float uHorizonWorldHalfExtent;
  uniform float uHorizonApronHazeDistance;
  varying float vHorizonFaceGrade;
  varying float vHorizonApronHaze;
`;

export const WORLD_HORIZON_POSITION = /* glsl */ `
  vec2 horizonToFocus = abs(transformed.xz - uHorizonSinkFocus);
  float horizonRingDistance = max(horizonToFocus.x, horizonToFocus.y);
  float horizonBuried = 1.0 - smoothstep(
    uHorizonSinkFade.x,
    uHorizonSinkFade.y,
    horizonRingDistance
  );
  transformed.y -= uHorizonSinkDepth * horizonBuried;
  vHorizonWorldXZ = transformed.xz;
  float horizonOutsideWorld = max(
    max(abs(transformed.x), abs(transformed.z)) - uHorizonWorldHalfExtent,
    0.0
  );
  vHorizonApronHaze = smoothstep(
    0.0,
    uHorizonApronHazeDistance,
    horizonOutsideWorld
  );
  vec3 horizonWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
  float horizonSunFacing = dot(horizonWorldNormal, uHorizonSunDirection);
  vHorizonFaceGrade = mix(
    0.88,
    1.04,
    smoothstep(-0.15, 0.35, horizonSunFacing)
  );
`;

export const WORLD_HORIZON_FRAGMENT = /* glsl */ `
  uniform sampler2D uTerrainCoverage;
  uniform float uTerrainCoverageHalfExtent;
  uniform float uTerrainCoverageWorldSize;
  varying vec2 vHorizonWorldXZ;
  varying float vHorizonFaceGrade;
  varying float vHorizonApronHaze;
  uniform vec3 uHorizonHazeColor;
`;

export const WORLD_HORIZON_FACE_GRADE = /* glsl */ `
  float horizonFaceGrade = mix(
    vHorizonFaceGrade,
    1.0,
    vHorizonApronHaze * 0.85
  );
  diffuseColor.rgb *= horizonFaceGrade;
  diffuseColor.rgb = mix(
    diffuseColor.rgb,
    uHorizonHazeColor,
    vHorizonApronHaze * 0.42
  );
`;

export const WORLD_HORIZON_COVERAGE_DISCARD = /* glsl */ `
  vec2 horizonCoverageUv =
    (vHorizonWorldXZ + vec2(uTerrainCoverageHalfExtent)) /
    uTerrainCoverageWorldSize;
  if (
    horizonCoverageUv.x >= 0.0 && horizonCoverageUv.y >= 0.0 &&
    horizonCoverageUv.x < 1.0 && horizonCoverageUv.y < 1.0 &&
    texture2D(uTerrainCoverage, horizonCoverageUv).r > 0.5
  ) {
    discard;
  }
`;
