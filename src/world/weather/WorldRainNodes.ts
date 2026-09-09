import type { DataTexture, Vector2 } from "three";
import { MeshBasicNodeMaterial, type Node } from "three/webgpu";
import {
  cameraPosition, cos, float, fract, hash, instanceIndex, max, mix, positionLocal,
  sin, smoothstep, texture, uniform, vec2, vec3,
} from "three/tsl";
import { createBakedWorldWindNodes, createWorldWindFieldNodes } from "./WorldWindNodes";
import type { WorldWindUniforms } from "./WorldWindUniforms";
import type { WorldRainUniforms } from "./WorldRainUniforms";
import {
  WORLD_RAIN_AREA_METERS,
  WORLD_RAIN_BASE_OPACITY,
  WORLD_RAIN_COLOR_LINEAR,
  WORLD_RAIN_EDGE_FADE_METERS,
  WORLD_RAIN_FALL_SPEED_METERS_PER_SECOND,
  WORLD_RAIN_GROUND_CLIP_MARGIN_METERS,
  WORLD_RAIN_MAX_HEIGHT_METERS,
  WORLD_RAIN_MIN_HEIGHT_METERS,
  WORLD_RAIN_STREAK_LENGTH_METERS,
  WORLD_RAIN_STREAK_WIDTH_METERS,
  WORLD_RAIN_TURBULENCE_METERS,
  WORLD_RAIN_WIND_DRIFT_METERS_PER_SECOND,
  WORLD_RAIN_WIND_TILT_GAIN,
} from "./WorldRainTuning";

const DEG_TO_RAD = Math.PI / 180;
const TWO_PI = Math.PI * 2;
const MIN_CAMERA_DISTANCE = 0.001;
const SEED_PERIOD = 4096;
const HASH_OFFSETS = Object.freeze({
  x: 17.13,
  z: 93.71,
  height: 41.27,
  speed: 71.91,
  turbulence: 211.17,
  length: 331.71,
  width: 441.31,
  opacity: 551.91,
});

export interface WorldRainNodeInputs {
  readonly rain: WorldRainUniforms;
  readonly wind?: WorldWindUniforms;
  readonly groundTexture: DataTexture;
  readonly groundCenter: Vector2;
  readonly seed: number;
}

/**
 * Builds the one pooled rain material shared by every streak instance.
 * Randomness depends only on instance id and world seed; time comes exclusively
 * from the weather owner, so neither backend can invent a second rain clock.
 */
export function createWorldRainMaterial(inputs: WorldRainNodeInputs): MeshBasicNodeMaterial {
  const index = instanceIndex.toFloat();
  const seed = ((inputs.seed % SEED_PERIOD) + SEED_PERIOD) % SEED_PERIOD;
  const random = (offset: number) => hash(index.add(float(seed + offset)));
  const randomX = random(HASH_OFFSETS.x);
  const randomZ = random(HASH_OFFSETS.z);
  const randomHeight = random(HASH_OFFSETS.height);
  const randomSpeed = random(HASH_OFFSETS.speed);
  const randomTurbulence = random(HASH_OFFSETS.turbulence);
  const randomLength = random(HASH_OFFSETS.length);
  const randomWidth = random(HASH_OFFSETS.width);
  const randomOpacity = random(HASH_OFFSETS.opacity);

  const center = uniform(inputs.groundCenter);
  const ground = texture(inputs.groundTexture);
  const centerXZ = vec2(center.x, center.y);
  const wind = createRainWind(inputs.rain, inputs.wind, centerXZ);
  const fallSpeed = mix(
    float(WORLD_RAIN_FALL_SPEED_METERS_PER_SECOND * 0.76),
    float(WORLD_RAIN_FALL_SPEED_METERS_PER_SECOND * 1.24),
    randomSpeed,
  );
  const verticalRange = WORLD_RAIN_MAX_HEIGHT_METERS - WORLD_RAIN_MIN_HEIGHT_METERS;
  const initialHeight = mix(
    float(WORLD_RAIN_MIN_HEIGHT_METERS),
    float(WORLD_RAIN_MAX_HEIGHT_METERS),
    randomHeight,
  );
  // Subtracting time makes the physical velocity explicitly downward. `fract`
  // is positive modulo, so negative phases wrap without a negative-coordinate seam.
  const height = fract(
    initialHeight.sub(WORLD_RAIN_MIN_HEIGHT_METERS)
      .sub(inputs.rain.time.mul(fallSpeed))
      .div(verticalRange),
  ).mul(verticalRange).add(WORLD_RAIN_MIN_HEIGHT_METERS);

  const drift = inputs.rain.time.mul(wind.strength)
    .mul(WORLD_RAIN_WIND_DRIFT_METERS_PER_SECOND);
  const localX = fract(randomX.add(drift.mul(wind.direction.x).div(WORLD_RAIN_AREA_METERS)))
    .sub(0.5).mul(WORLD_RAIN_AREA_METERS);
  const localZ = fract(randomZ.add(drift.mul(wind.direction.y).div(WORLD_RAIN_AREA_METERS)))
    .sub(0.5).mul(WORLD_RAIN_AREA_METERS);
  const turbulencePhase = inputs.rain.time.mul(0.9).add(randomTurbulence.mul(TWO_PI));
  const turbulence = wind.flutter.mul(WORLD_RAIN_TURBULENCE_METERS);
  const dropX = center.x.add(localX).add(sin(turbulencePhase).mul(turbulence));
  const dropZ = center.y.add(localZ).add(cos(turbulencePhase).mul(turbulence));

  const groundUv = vec2(dropX, dropZ).sub(centerXZ)
    .div(WORLD_RAIN_AREA_METERS).add(0.5).clamp(0, 1);
  const surfaceY = ground.sample(groundUv).r;
  const dropTopY = surfaceY.add(height);
  const length = mix(
    float(WORLD_RAIN_STREAK_LENGTH_METERS * 0.62),
    float(WORLD_RAIN_STREAK_LENGTH_METERS * 1.22),
    randomLength,
  );
  const width = mix(
    float(WORLD_RAIN_STREAK_WIDTH_METERS * 0.7),
    float(WORLD_RAIN_STREAK_WIDTH_METERS * 1.2),
    randomWidth,
  );

  const toCamera = cameraPosition.sub(vec3(dropX, 0, dropZ));
  const horizontalDistance = max(toCamera.xz.length(), float(MIN_CAMERA_DISTANCE));
  const cameraRight = vec3(
    toCamera.z.div(horizontalDistance),
    0,
    toCamera.x.div(horizontalDistance).negate(),
  );
  const widthOffset = positionLocal.x.mul(width);
  const lengthOffset = positionLocal.y.mul(length);
  const streakProgress = positionLocal.y.negate().clamp(0, 1);
  const windTilt = streakProgress.mul(wind.strength)
    .mul(WORLD_RAIN_WIND_TILT_GAIN).mul(length).div(fallSpeed);
  const worldX = dropX.add(cameraRight.x.mul(widthOffset))
    .sub(wind.direction.x.mul(windTilt));
  const worldY = dropTopY.add(lengthOffset);
  const worldZ = dropZ.add(cameraRight.z.mul(widthOffset))
    .sub(wind.direction.y.mul(windTilt));

  const halfArea = WORLD_RAIN_AREA_METERS * 0.5;
  const edgeDistance = max(localX.abs(), localZ.abs());
  const edgeFade = smoothstep(
    halfArea - WORLD_RAIN_EDGE_FADE_METERS,
    halfArea,
    edgeDistance,
  ).oneMinus();
  const groundFade = smoothstep(
    surfaceY.add(WORLD_RAIN_GROUND_CLIP_MARGIN_METERS),
    surfaceY.add(WORLD_RAIN_GROUND_CLIP_MARGIN_METERS + 0.28),
    worldY,
  );
  const localProfile = positionLocal.y.add(1).clamp(0, 1);
  const streakProfile = localProfile.mul(localProfile.oneMinus()).mul(4).clamp(0, 1);
  const opacityVariation = mix(float(0.58), float(1), randomOpacity);

  const material = new MeshBasicNodeMaterial();
  material.name = "world-rain-node-material";
  material.transparent = true;
  material.depthTest = true;
  material.depthWrite = false;
  material.fog = true;
  material.positionNode = vec3(worldX, worldY, worldZ);
  material.colorNode = vec3(...WORLD_RAIN_COLOR_LINEAR);
  material.opacityNode = streakProfile
    .mul(opacityVariation)
    .mul(WORLD_RAIN_BASE_OPACITY)
    .mul(inputs.rain.intensity)
    .mul(edgeFade)
    .mul(groundFade)
    .clamp(0, 1);
  return material;
}

function createRainWind(
  rain: WorldRainUniforms,
  wind: WorldWindUniforms | undefined,
  positionXZ: Node<"vec2">,
) {
  if (wind?.bakedField && wind.bakedOriginXZ) {
    return createBakedWorldWindNodes({
      positionXZ,
      bakedField: wind.bakedField,
      originXZ: wind.bakedOriginXZ,
      worldSize: wind.bakedWorldSize,
      time: wind.time,
      noiseScale: wind.noiseScale,
    });
  }
  if (wind) {
    return createWorldWindFieldNodes({
      positionXZ,
      time: wind.time,
      directionDegrees: wind.directionDegrees,
      intensity: wind.intensity,
      noiseScale: wind.noiseScale,
    });
  }

  const radians = rain.windDirectionDegrees.mul(DEG_TO_RAD);
  const direction = vec2(cos(radians), sin(radians));
  return {
    direction,
    strength: rain.windIntensity,
    gust: float(0),
    turbulence: float(0),
    flutter: sin(rain.time.mul(1.7).add(positionXZ.dot(direction).mul(0.07))),
  };
}
