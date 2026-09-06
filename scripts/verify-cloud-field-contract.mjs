import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");

function read(relativePath) {
  return readFileSync(resolve(REPOSITORY_ROOT, relativePath), "utf8").replaceAll(
    "\r\n",
    "\n",
  );
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[cloud-field] ${message}`);
  }
}

const field = read("src/world/sky/WorldCloudFieldShader.ts");
const sky = read("src/world/sky/WorldSkyCloudShader.ts");
const volume = read("src/world/sky/WorldCloudVolumeShader.ts");
const temporal = read("src/world/sky/WorldCloudTemporalShader.ts");
const quality = read("src/world/sky/WorldCloudVolumeQuality.ts");
const shadow = read("src/world/sky/WorldCloudShadowShader.ts");
const weather = read("src/world/sky/WorldCloudWeather.ts");
const runtime = read("public/config/runtime.yaml");

assert(
  field.includes("export const WORLD_CLOUD_FIELD_GLSL") &&
    field.includes("float cloudHash12(vec2 p)") &&
    field.includes("float cloudValueNoise(vec2 p)") &&
    field.includes("float cloudFbm(vec2 p)") &&
    field.includes("float cloudWeather(vec2 worldPosition)") &&
    field.includes("float cloudDensity(") &&
    field.includes("WORLD_CLOUD_COMPACT"),
  "Cloud hash/noise/FBM/weather/density must have one shared GLSL source with compact quality support.",
);
assert(
  field.includes("WORLD_CLOUD_VERTICAL_PROFILE_GLSL") &&
    field.includes("float cloudVerticalProfile(") &&
    field.includes("baseFeather") &&
    field.includes("shapedBase") &&
    field.includes("irregularTop") &&
    field.includes("bodyErosion"),
  "The shared vertical cloud profile must feather the base, retain an irregular top, and erode the body instead of producing a uniform slab.",
);
assert(
  sky.includes('from "./WorldCloudFieldShader"') &&
    sky.includes("${WORLD_CLOUD_FIELD_GLSL}") &&
    !sky.includes("float cloudHash12(vec2 p)"),
  "The sky must consume the shared cloud field rather than own a duplicate implementation.",
);
assert(
  volume.includes("WORLD_CLOUD_FIELD_GLSL") &&
    volume.includes("WORLD_CLOUD_VERTICAL_PROFILE_GLSL") &&
    !volume.includes("float cloudHash12(vec2 p)") &&
    !volume.includes("float cloudVerticalProfile(vec2 worldPosition"),
  "The volumetric pass must consume both shared cloud field modules without local copies.",
);
assert(
  shadow.includes("WORLD_CLOUD_FIELD_GLSL") &&
    shadow.includes("WORLD_CLOUD_VERTICAL_PROFILE_GLSL") &&
    !shadow.includes("float cloudHash12(vec2 p)"),
  "The ground transmittance pass must use the same cloud density/profile as the visible clouds.",
);
assert(
  field.includes("p = rotation * p * 2.02") &&
    weather.includes("FBM_FREQUENCY = 2.02") &&
    field.includes("mat2 rotation = mat2(0.8, 0.6, -0.6, 0.8)") &&
    weather.includes("FBM_ROTATION_COS = 0.8") &&
    weather.includes("FBM_ROTATION_SIN = 0.6") &&
    field.includes("smoothstep(0.28, 0.78, cloudWeather(worldPosition))") &&
    weather.includes("WEATHER_CLEAR_THRESHOLD = 0.28") &&
    weather.includes("WEATHER_OVERCAST_THRESHOLD = 0.78"),
  "CPU focus lighting and GPU cloud fields must retain matching macro constants and weather thresholds.",
);
assert(
  weather.includes("function fract(value: number): number") &&
    weather.includes("return value - Math.floor(value);"),
  "CPU cloud noise must retain its GLSL-compatible fract helper.",
);
assert(
  field.includes("vec2 macroPosition = worldPosition + uCloudWind * uTime;") &&
    field.includes("vec2 detailPosition = worldPosition + uCloudDetailWind * uTime;") &&
    field.includes("macroPosition * uCloudMacroScale * 0.83") &&
    field.includes("detailPosition * uCloudDetailScale * 0.42") &&
    field.includes("heightFraction * 7.1") &&
    field.includes("-heightFraction * 5.3") &&
    weather.includes("const macroX = worldX + config.windX * timeSeconds;") &&
    weather.includes("const detailX = worldX + config.detailWindX * timeSeconds;") &&
    weather.includes("macroX * config.macroScale * 0.83") &&
    weather.includes("detailX * config.detailScale * 0.42") &&
    weather.includes("heightFraction * 7.1") &&
    weather.includes("heightFraction * 5.3") &&
    weather.includes("heightFraction,\n        timeSeconds,"),
  "GPU and CPU vertical cloud erosion must advect with the same macro/detail winds instead of staying pinned while the density field moves.",
);
assert(
  sky.includes("float cloudRayBreakup(") &&
    !sky.includes("sin(rayAngle * 17.0") &&
    !sky.includes("float rayBands"),
  "God rays must use irregular cloud-driven breakup instead of the visible angular sine bands from the old implementation.",
);
assert(
  volume.includes("float cloudStepJitter(") &&
    volume.includes("sampleIndex * 47.0") &&
    volume.includes("sampleIndex * 89.0") &&
    volume.includes("float sampleJitter = mix(") &&
    volume.includes("cloudStepJitter(gl_FragCoord.xy, uFrameIndex, sampleOrdinal)") &&
    !volume.includes("float jitter = cloudJitter("),
  "Each volumetric raymarch stratum must have independent temporal jitter; shifting one shared sample lattice recreates concentric shell bands.",
);
assert(
  volume.includes("float cloudPreviewDensityAt(") &&
    volume.includes("if (rayDirection.y < 0.35)") &&
    volume.includes("topDistance, 0.2") &&
    volume.includes("topDistance, 0.8") &&
    volume.includes("previewDensity <= 0.0015"),
  "Grazing cloud rays must use conservative multi-point empty-space probes so one midpoint cannot punch radial holes through the volume.",
);
assert(
  volume.includes("worldHeight - uCameraPosition.y") &&
    volume.includes("worldPosition.y - uCloudBaseHeight") &&
    temporal.includes("cloudMidHeight - uCameraPosition.y"),
  "Cloud volume intersection, height profile, and temporal reprojection must all be camera-height-correct.",
);
assert(
  temporal.includes("float colorDifference = length(currentCloud.rgb - historyCloud.rgb)") &&
    temporal.includes("float colorRejection = smoothstep(") &&
    temporal.includes("float grazingConfidence = smoothstep(") &&
    temporal.includes("max(alphaRejection, colorRejection)"),
  "Temporal accumulation must reject stale radiance as well as opacity and reduce history confidence at grazing angles.",
);
assert(
  runtime.includes("desktopCloudVolumetricSteps: 12") &&
    runtime.includes("desktopCloudTemporalBlend: 0.84") &&
    quality.includes("MEDIUM_MAX_STEPS = 8"),
  "Desktop and medium cloud tiers must keep enough integration strata and current-frame weight to prevent visible raymarch shells.",
);

console.log(
  "[cloud-field] Shared CPU/GPU morphology, coherent wind advection, CPU noise helpers, vertically eroded cloud bodies, conservative grazing-ray culling, independent raymarch jitter, camera-correct reprojection, stale-history rejection, and band-free god-ray breakup verified.",
);
