export class FlatConfig {
  private readonly unreadKeys: Set<string>;

  private constructor(
    private readonly name: string,
    private readonly values: ReadonlyMap<string, string>,
  ) {
    this.unreadKeys = new Set(values.keys());
  }

  static parse(source: string, name: string): FlatConfig {
    const values = new Map<string, string>();

    for (const [index, rawLine] of source.split(/\r?\n/).entries()) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }

      const separator = line.indexOf(":");
      if (separator <= 0) {
        throw new Error(`Invalid ${name} config at line ${index + 1}.`);
      }

      const key = line.slice(0, separator).trim();
      const rawValue = line.slice(separator + 1).trim();
      if (!rawValue) {
        throw new Error(`Missing value for ${key} at line ${index + 1}.`);
      }
      if (values.has(key)) {
        throw new Error(
          `Duplicate ${name} config value ${key} at line ${index + 1}.`,
        );
      }

      const value = this.stripQuotes(rawValue, name, index + 1);
      if (!value) {
        throw new Error(`Missing value for ${key} at line ${index + 1}.`);
      }
      values.set(key, value);
    }

    return new FlatConfig(name, values);
  }

  read(key: string): string {
    const value = this.values.get(key);
    if (value === undefined) {
      throw new Error(`Missing ${this.name} config value: ${key}.`);
    }
    this.unreadKeys.delete(key);
    return value;
  }

  assertFullyConsumed(): void {
    if (this.unreadKeys.size === 0) {
      return;
    }

    const keys = [...this.unreadKeys].sort();
    throw new Error(
      `Unknown ${this.name} config value${keys.length === 1 ? "" : "s"}: ${keys.join(", ")}.`,
    );
  }

  private static stripQuotes(
    value: string,
    name: string,
    lineNumber: number,
  ): string {
    const first = value[0];
    const last = value[value.length - 1];
    const startsQuoted = first === '"' || first === "'";
    const endsQuoted = last === '"' || last === "'";

    if (startsQuoted !== endsQuoted || (startsQuoted && first !== last)) {
      throw new Error(
        `Invalid quoted ${name} config value at line ${lineNumber}.`,
      );
    }

    return startsQuoted ? value.slice(1, -1) : value;
  }
}
