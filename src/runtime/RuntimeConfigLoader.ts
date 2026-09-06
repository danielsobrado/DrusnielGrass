import { fetchConfigText } from "../config/ConfigTextLoader";
import { FlatConfig } from "../config/FlatConfig";
import {
  FlatConfigValueReader,
  POSITIVE_NUMBER_RULE,
} from "../config/FlatConfigValueReader";
import { readRuntimeCloudConfig } from "./RuntimeCloudConfigReader";
import type { RuntimeConfig, RuntimeTierConfig } from "./RuntimeConfig";

const CONFIG_URL = "./config/runtime.yaml";
const MAX_SHADOW_MAP_SIZE = 16384;

export class RuntimeConfigLoader {
  async load(url: string = CONFIG_URL): Promise<RuntimeConfig> {
    return this.parse(await fetchConfigText(url, "runtime config"));
  }

  private parse(source: string): RuntimeConfig {
    const values = FlatConfig.parse(source, "runtime");
    const reader = new FlatConfigValueReader(values, "Runtime");
    const config = Object.freeze({
      compactMaxWidth: reader.number("compactMaxWidth", POSITIVE_NUMBER_RULE),
      desktop: Object.freeze(this.readTier(reader, "desktop")),
      compact: Object.freeze(this.readTier(reader, "compact")),
    });
    values.assertFullyConsumed();
    return config;
  }

  private readTier(
    reader: FlatConfigValueReader,
    prefix: "desktop" | "compact",
  ): RuntimeTierConfig {
    return {
      cameraFov: reader.number(`${prefix}CameraFov`, {
        minimum: 30,
        maximum: 90,
      }),
      cameraMargin: reader.number(`${prefix}CameraMargin`, {
        minimum: 1,
        maximum: 3,
      }),
      cameraElevation: reader.number(`${prefix}CameraElevation`, {
        minimum: 0.1,
        maximum: 3,
      }),
      maxPixelRatio: reader.number(`${prefix}MaxPixelRatio`, {
        minimum: 0.5,
        maximum: 3,
      }),
      autoRotate: reader.boolean(`${prefix}AutoRotate`),
      shadows: reader.boolean(`${prefix}Shadows`),
      shadowMapSize: this.readShadowMapSize(reader, prefix),
      showGui: reader.boolean(`${prefix}ShowGui`),
      showDecorativeText: reader.boolean(`${prefix}ShowDecorativeText`),
      cloud: Object.freeze(readRuntimeCloudConfig(reader, prefix)),
    };
  }

  private readShadowMapSize(
    reader: FlatConfigValueReader,
    prefix: "desktop" | "compact",
  ): number {
    const key = `${prefix}ShadowMapSize`;
    const size = reader.powerOfTwo(key);
    if (size > MAX_SHADOW_MAP_SIZE) {
      throw new Error(
        `Runtime config value ${key} must be at most ${MAX_SHADOW_MAP_SIZE}.`,
      );
    }
    return size;
  }
}
