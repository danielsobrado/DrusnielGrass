import { fetchConfigText } from "../../config/ConfigTextLoader";
import { FlatConfig } from "../../config/FlatConfig";
import {
  FlatConfigValueReader,
  NON_NEGATIVE_INTEGER_RULE,
  NON_NEGATIVE_NUMBER_RULE,
  POSITIVE_INTEGER_RULE,
  POSITIVE_NUMBER_RULE,
  UINT32_INTEGER_RULE,
} from "../../config/FlatConfigValueReader";
import type { GrassConfig } from "../GrassConfig";
import { validateGrassConfig } from "./GrassConfigValidator";

const CONFIG_URL = "./config/grass.yaml";

function resolveDefaultConfigUrl(): string {
  return typeof __APP_VERSION__ === "string" && __APP_VERSION__.length > 0
    ? `${CONFIG_URL}?v=${encodeURIComponent(__APP_VERSION__)}`
    : CONFIG_URL;
}

export class GrassConfigLoader {
  async load(url: string = resolveDefaultConfigUrl()): Promise<GrassConfig> {
    return this.parse(await fetchConfigText(url, "grass config"));
  }

  private parse(source: string): GrassConfig {
    const values = FlatConfig.parse(source, "grass");
    const reader = new FlatConfigValueReader(values, "Grass");
    const config: GrassConfig = {
      instanceCount: reader.number("instanceCount", POSITIVE_INTEGER_RULE),
      patchSize: reader.number("patchSize", POSITIVE_NUMBER_RULE),
      geometry: {
        variantCount: reader.number("variantCount", POSITIVE_INTEGER_RULE),
        bladesPerClump: reader.number("bladesPerClump", POSITIVE_INTEGER_RULE),
        bladeSegments: reader.number("bladeSegments", POSITIVE_INTEGER_RULE),
        clumpRadius: reader.number("clumpRadius", POSITIVE_NUMBER_RULE),
        bladeHeightMin: reader.number("bladeHeightMin", POSITIVE_NUMBER_RULE),
        bladeHeightMax: reader.number("bladeHeightMax", POSITIVE_NUMBER_RULE),
        bladeWidthMin: reader.number("bladeWidthMin", POSITIVE_NUMBER_RULE),
        bladeWidthMax: reader.number("bladeWidthMax", POSITIVE_NUMBER_RULE),
        bladeLeanMin: reader.number("bladeLeanMin", NON_NEGATIVE_NUMBER_RULE),
        bladeLeanMax: reader.number("bladeLeanMax", NON_NEGATIVE_NUMBER_RULE),
        bladeCurve: reader.number("bladeCurve", { minimum: 0, maximum: 1.2 }),
        midBladesPerClump: reader.number(
          "midBladesPerClump",
          POSITIVE_INTEGER_RULE,
        ),
        midBladeSegments: reader.number(
          "midBladeSegments",
          POSITIVE_INTEGER_RULE,
        ),
        midRadiusScale: reader.number("midRadiusScale", POSITIVE_NUMBER_RULE),
        midHeightScale: reader.number("midHeightScale", POSITIVE_NUMBER_RULE),
        midWidthScale: reader.number("midWidthScale", POSITIVE_NUMBER_RULE),
        midLeanScale: reader.number("midLeanScale", NON_NEGATIVE_NUMBER_RULE),
      },
      distribution: {
        seed: reader.number("seed", UINT32_INTEGER_RULE),
        rootSink: reader.number("rootSink", NON_NEGATIVE_NUMBER_RULE),
        maxSlopeDegrees: reader.number("maxSlopeDegrees", {
          minimum: 0,
          maximum: 89,
        }),
        heightVariation: reader.number("heightVariation", {
          minimum: 0,
          maximum: 0.95,
        }),
        widthVariation: reader.number("widthVariation", {
          minimum: 0,
          maximum: 0.95,
        }),
        densityMin: reader.number("densityMin", { minimum: 0, maximum: 1 }),
        densityMax: reader.number("densityMax", { minimum: 0, maximum: 1 }),
        densityScale: reader.number("densityScale", POSITIVE_NUMBER_RULE),
      },
      wind: {
        directionX: reader.number("windDirectionX"),
        directionZ: reader.number("windDirectionZ"),
        strength: reader.number("windStrength", NON_NEGATIVE_NUMBER_RULE),
        gustScale: reader.number("gustScale", POSITIVE_NUMBER_RULE),
        gustSpeed: reader.number("gustSpeed", NON_NEGATIVE_NUMBER_RULE),
        flutterStrength: reader.number(
          "flutterStrength",
          NON_NEGATIVE_NUMBER_RULE,
        ),
        flutterSpeed: reader.number("flutterSpeed", NON_NEGATIVE_NUMBER_RULE),
      },
      material: {
        baseColor: reader.string("baseColor"),
        tipColor: reader.string("tipColor"),
        dryColor: reader.string("dryColor"),
        rootDarkening: reader.number("rootDarkening", {
          minimum: 0,
          maximum: 1,
        }),
        normalUp: reader.number("normalUp", { minimum: 0, maximum: 1 }),
        ambientBoost: reader.number("ambientBoost", {
          minimum: 0,
          maximum: 1,
        }),
        backlightStrength: reader.number("backlightStrength", {
          minimum: 0,
          maximum: 1,
        }),
      },
      lod: {
        nearMaxDistance: reader.number("nearMaxDistance", POSITIVE_NUMBER_RULE),
        midMaxDistance: reader.number("midMaxDistance", POSITIVE_NUMBER_RULE),
        farMaxDistance: reader.number("farMaxDistance", POSITIVE_NUMBER_RULE),
        hysteresisDistance: reader.number(
          "hysteresisDistance",
          NON_NEGATIVE_NUMBER_RULE,
        ),
        transitionDistance: reader.number(
          "transitionDistance",
          POSITIVE_NUMBER_RULE,
        ),
      },
      qa: {
        warmupSeconds: reader.number("qaWarmupSeconds", NON_NEGATIVE_NUMBER_RULE),
        sampleSeconds: reader.number("qaSampleSeconds", POSITIVE_NUMBER_RULE),
      },
      impostor: {
        viewsPerAxis: reader.number(
          "impostorViewsPerAxis",
          POSITIVE_INTEGER_RULE,
        ),
        frameResolution: reader.number(
          "impostorFrameResolution",
          POSITIVE_INTEGER_RULE,
        ),
        padding: reader.number("impostorPadding", NON_NEGATIVE_INTEGER_RULE),
        cameraMargin: reader.number(
          "impostorCameraMargin",
          POSITIVE_NUMBER_RULE,
        ),
      },
    };

    values.assertFullyConsumed();
    validateGrassConfig(config);
    return Object.freeze({
      ...config,
      geometry: Object.freeze(config.geometry),
      distribution: Object.freeze(config.distribution),
      wind: Object.freeze(config.wind),
      material: Object.freeze(config.material),
      lod: Object.freeze(config.lod),
      qa: Object.freeze(config.qa),
      impostor: Object.freeze(config.impostor),
    });
  }
}
