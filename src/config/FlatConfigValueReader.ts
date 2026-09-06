import type { FlatConfig } from "./FlatConfig";

export interface ConfigNumberRule {
  minimum?: number;
  exclusiveMinimum?: number;
  maximum?: number;
  exclusiveMaximum?: number;
  integer?: boolean;
}

export const POSITIVE_NUMBER_RULE: Readonly<ConfigNumberRule> = Object.freeze({
  exclusiveMinimum: 0,
});
export const NON_NEGATIVE_NUMBER_RULE: Readonly<ConfigNumberRule> =
  Object.freeze({ minimum: 0 });
export const POSITIVE_INTEGER_RULE: Readonly<ConfigNumberRule> = Object.freeze({
  minimum: 1,
  integer: true,
});
export const NON_NEGATIVE_INTEGER_RULE: Readonly<ConfigNumberRule> =
  Object.freeze({ minimum: 0, integer: true });
export const UINT32_INTEGER_RULE: Readonly<ConfigNumberRule> = Object.freeze({
  minimum: 0,
  maximum: 0xffff_ffff,
  integer: true,
});

export class FlatConfigValueReader {
  constructor(
    private readonly values: FlatConfig,
    private readonly configName: string,
  ) {}

  string(key: string): string {
    return this.values.read(key);
  }

  boolean(key: string): boolean {
    const value = this.values.read(key).toLowerCase();
    if (value === "true") {
      return true;
    }
    if (value === "false") {
      return false;
    }
    throw new Error(`${this.configName} config value ${key} must be true or false.`);
  }

  number(key: string, rule: ConfigNumberRule = {}): number {
    const value = Number(this.values.read(key));
    if (!Number.isFinite(value)) {
      throw new Error(`${this.configName} config value ${key} must be a number.`);
    }
    if (rule.integer && !Number.isSafeInteger(value)) {
      throw new Error(
        `${this.configName} config value ${key} must be a safe integer.`,
      );
    }
    if (
      rule.exclusiveMinimum !== undefined &&
      value <= rule.exclusiveMinimum
    ) {
      throw new Error(
        `${this.configName} config value ${key} must be greater than ${rule.exclusiveMinimum}.`,
      );
    }
    if (rule.minimum !== undefined && value < rule.minimum) {
      throw new Error(
        `${this.configName} config value ${key} must be at least ${rule.minimum}.`,
      );
    }
    if (
      rule.exclusiveMaximum !== undefined &&
      value >= rule.exclusiveMaximum
    ) {
      throw new Error(
        `${this.configName} config value ${key} must be lower than ${rule.exclusiveMaximum}.`,
      );
    }
    if (rule.maximum !== undefined && value > rule.maximum) {
      throw new Error(
        `${this.configName} config value ${key} must be at most ${rule.maximum}.`,
      );
    }
    return value;
  }

  powerOfTwo(key: string): number {
    const value = this.number(key, POSITIVE_INTEGER_RULE);
    const nearestPower = 2 ** Math.round(Math.log2(value));
    if (nearestPower !== value) {
      throw new Error(`${this.configName} config value ${key} must be a power of two.`);
    }
    return value;
  }
}
