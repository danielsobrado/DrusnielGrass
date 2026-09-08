import { fetchConfigText } from "../../config/ConfigTextLoader";
import { FlatConfig } from "../../config/FlatConfig";
import { FlatConfigValueReader } from "../../config/FlatConfigValueReader";
import {
  WORLD_EXPERIENCE_DEFAULTS,
  WORLD_EXPERIENCE_FLAG_DEFAULTS,
  WORLD_EXPERIENCE_NUMBER_SCHEMA,
  validateWorldExperienceConfig,
  type WorldExperienceConfig,
  type WorldExperienceFlagKey,
  type WorldExperienceNumberKey,
} from "./WorldExperienceConfig";

const CONFIG_URL = "./config/experience.yaml";

export class WorldExperienceConfigLoader {
  /**
   * Loads the experience config, or ships the defaults when there is none.
   *
   * Absence is a valid state: the world runs without an experience file, with
   * every optional system on at its default budget. A file that exists but is
   * malformed is not absence, and fails the same way the world config does —
   * a typo in a budget must not silently become a default.
   */
  async load(url: string = CONFIG_URL): Promise<WorldExperienceConfig> {
    let source: string;
    try {
      source = await fetchConfigText(url, "experience config");
    } catch {
      return WORLD_EXPERIENCE_DEFAULTS;
    }
    return this.parse(source);
  }

  /** Parse and validate config source directly; the node verifiers use this. */
  parse(source: string): WorldExperienceConfig {
    const values = FlatConfig.parse(source, "experience");
    const reader = new FlatConfigValueReader(values, "Experience");
    const config = {} as Record<string, boolean | number>;

    for (const key of Object.keys(WORLD_EXPERIENCE_FLAG_DEFAULTS) as WorldExperienceFlagKey[]) {
      config[key] = reader.boolean(key);
    }
    for (const key of Object.keys(WORLD_EXPERIENCE_NUMBER_SCHEMA) as WorldExperienceNumberKey[]) {
      config[key] = reader.number(key, WORLD_EXPERIENCE_NUMBER_SCHEMA[key]);
    }

    // Every key is consumed, so a stale or misspelled one is reported rather
    // than ignored — the same contract the world config holds.
    values.assertFullyConsumed();
    const resolved = config as unknown as WorldExperienceConfig;
    validateWorldExperienceConfig(resolved);
    return Object.freeze(resolved);
  }
}
