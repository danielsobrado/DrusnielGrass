import type { WorldConfig } from "../../src/world/WorldConfig";
import { validateWorldConfig } from "../../src/world/WorldConfigValidator";
import {
  CLUSTER_INFLUENCE_SEPARATION_RATIO,
  maxNormalizedReach,
} from "../../src/world/stones/StoneClusterTuning";

const EXPORT_STATUS_MS = 1800;
const REBUILD_DEBOUNCE_MS = 120;
const GEOMETRY_EPSILON = 1e-6;

export const STONE_CLUSTER_QUERY_KEYS = [
  "stoneDensity",
  "stoneClusterChance",
  "stoneSingletonChance",
  "stoneClusterSpacing",
  "stoneClusterCenterJitter",
  "stoneClusterRadiusMin",
  "stoneClusterRadiusMax",
  "stoneClusterAspectMin",
  "stoneClusterAspectMax",
  "stoneClusterBudgetMin",
  "stoneClusterBudgetMax",
  "stoneClusterCoreRatio",
  "stoneClusterShoulderRatio",
  "stoneClusterHaloRatio",
  "stoneClusterDensityResponse",
  "stoneVergeChance",
] as const;

export type StoneClusterTuningKey = (typeof STONE_CLUSTER_QUERY_KEYS)[number];

interface ControlSpec {
  readonly key: StoneClusterTuningKey;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly integer?: boolean;
}

const DISTRIBUTION: readonly ControlSpec[] = [
  { key: "stoneDensity", label: "Formation density", min: 0, max: 0.4, step: 0.01 },
  { key: "stoneClusterChance", label: "Formation chance", min: 0, max: 1, step: 0.02 },
  { key: "stoneSingletonChance", label: "Singleton chance", min: 0, max: 0.25, step: 0.01 },
  { key: "stoneClusterSpacing", label: "Formation spacing", min: 40, max: 96, step: 2 },
  { key: "stoneClusterCenterJitter", label: "Center jitter", min: 0, max: 0.35, step: 0.01 },
];

const FOOTPRINT: readonly ControlSpec[] = [
  { key: "stoneClusterRadiusMin", label: "Radius min", min: 4, max: 30, step: 1 },
  { key: "stoneClusterRadiusMax", label: "Radius max", min: 8, max: 40, step: 1 },
  { key: "stoneClusterAspectMin", label: "Aspect min", min: 0.45, max: 0.9, step: 0.01 },
  { key: "stoneClusterAspectMax", label: "Aspect max", min: 0.6, max: 1, step: 0.01 },
  { key: "stoneClusterHaloRatio", label: "Halo", min: 0.9, max: 1.25, step: 0.01 },
];

const COMPOSITION: readonly ControlSpec[] = [
  { key: "stoneClusterBudgetMin", label: "Members min", min: 4, max: 8, step: 1, integer: true },
  { key: "stoneClusterBudgetMax", label: "Members max", min: 4, max: 12, step: 1, integer: true },
  { key: "stoneClusterCoreRatio", label: "Core", min: 0.2, max: 0.6, step: 0.01 },
  { key: "stoneClusterShoulderRatio", label: "Shoulder", min: 0.5, max: 0.9, step: 0.01 },
  { key: "stoneClusterDensityResponse", label: "Density response", min: 1, max: 12, step: 0.25 },
];

const CONTEXT: readonly ControlSpec[] = [
  { key: "stoneVergeChance", label: "Path verge chance", min: 0, max: 1, step: 0.02 },
];

const ALL_CONTROLS: readonly ControlSpec[] = [
  ...DISTRIBUTION,
  ...FOOTPRINT,
  ...COMPOSITION,
  ...CONTEXT,
];

const CONTROL_BY_KEY = new Map(
  ALL_CONTROLS.map((spec) => [spec.key, spec] as const),
);

function formatValue(spec: ControlSpec, value: number): string {
  return spec.step >= 1 ? String(Math.round(value)) : value.toFixed(2);
}

function validateControlValue(spec: ControlSpec, raw: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < spec.min || value > spec.max) {
    throw new Error(
      `Invalid ${spec.key}=${raw}; expected a number in [${spec.min}, ${spec.max}].`,
    );
  }
  if (spec.integer && !Number.isInteger(value)) {
    throw new Error(`Invalid ${spec.key}=${raw}; expected an integer.`);
  }
  return value;
}

function downloadYaml(source: string): void {
  const url = URL.createObjectURL(
    new Blob([source], { type: "application/yaml;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "stone-cluster-tuning.yaml";
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  requestAnimationFrame(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  });
}

export function readStoneClusterQueryOverrides(
  params: URLSearchParams,
): Partial<Pick<WorldConfig, StoneClusterTuningKey>> {
  const overrides: Partial<Pick<WorldConfig, StoneClusterTuningKey>> = {};
  for (const key of STONE_CLUSTER_QUERY_KEYS) {
    const raw = params.get(key);
    if (raw === null) {
      continue;
    }
    const spec = CONTROL_BY_KEY.get(key);
    if (!spec) {
      throw new Error(`Missing tuning control specification for ${key}.`);
    }
    overrides[key] = validateControlValue(spec, raw);
  }
  for (const key of params.keys()) {
    if (
      key.startsWith("stoneCluster") ||
      key === "stoneDensity" ||
      key === "stoneSingletonChance" ||
      key === "stoneVergeChance"
    ) {
      if (!(STONE_CLUSTER_QUERY_KEYS as readonly string[]).includes(key)) {
        throw new Error(`Unknown stone cluster query parameter ${key}.`);
      }
    }
  }
  return overrides;
}

export function normalizeStoneClusterTuning(config: WorldConfig): WorldConfig {
  const next = { ...config };
  if (!Number.isInteger(next.stoneClusterBudgetMin)) {
    throw new Error("stoneClusterBudgetMin must be an integer.");
  }
  if (!Number.isInteger(next.stoneClusterBudgetMax)) {
    throw new Error("stoneClusterBudgetMax must be an integer.");
  }
  if (next.stoneClusterBudgetMin > next.stoneClusterBudgetMax) {
    next.stoneClusterBudgetMax = next.stoneClusterBudgetMin;
  }
  if (next.stoneClusterAspectMin > next.stoneClusterAspectMax) {
    next.stoneClusterAspectMax = next.stoneClusterAspectMin;
  }
  if (!(next.stoneClusterCoreRatio < next.stoneClusterShoulderRatio)) {
    next.stoneClusterShoulderRatio = Math.min(
      0.9,
      next.stoneClusterCoreRatio + 0.01,
    );
  }
  if (!(next.stoneClusterShoulderRatio < next.stoneClusterHaloRatio)) {
    next.stoneClusterHaloRatio = Math.min(
      1.25,
      next.stoneClusterShoulderRatio + 0.01,
    );
  }

  const spacing = next.stoneClusterSpacing;
  const jitter = next.stoneClusterCenterJitter;
  const normalizedReach = maxNormalizedReach(next.stoneClusterHaloRatio);
  const circularRadiusLimit =
    (spacing * 0.5 - GEOMETRY_EPSILON) /
    Math.max(next.stoneClusterHaloRatio, GEOMETRY_EPSILON);
  const queryInfluenceLimit =
    spacing * (1.5 - jitter) - next.stoneCellSize * 0.5 - GEOMETRY_EPSILON;
  const conflictInfluenceLimit =
    (spacing * (2 - 2 * jitter) - GEOMETRY_EPSILON) /
    (2 * CLUSTER_INFLUENCE_SEPARATION_RATIO);
  const authoredRadiusLimit =
    Math.min(queryInfluenceLimit, conflictInfluenceLimit) /
    Math.max(normalizedReach, GEOMETRY_EPSILON);
  const integerRadiusLimit = Math.floor(
    Math.min(circularRadiusLimit, authoredRadiusLimit),
  );
  next.stoneClusterRadiusMax = Math.min(
    next.stoneClusterRadiusMax,
    integerRadiusLimit,
  );
  if (!(next.stoneClusterRadiusMin < next.stoneClusterRadiusMax)) {
    next.stoneClusterRadiusMin = Math.max(4, next.stoneClusterRadiusMax - 1);
  }

  validateWorldConfig(next);
  return next;
}

export class StoneClusterTuningMenu {
  private readonly root: HTMLDetailsElement;
  private readonly inputs = new Map<StoneClusterTuningKey, HTMLInputElement>();
  private readonly outputs = new Map<StoneClusterTuningKey, HTMLOutputElement>();
  private current: WorldConfig;
  private exportResetHandle = 0;
  private debounceHandle = 0;
  private disposed = false;

  constructor(
    initial: WorldConfig,
    private readonly onChange: (config: WorldConfig, immediate: boolean) => void,
    private readonly probeUrl: (config: WorldConfig) => string,
  ) {
    this.current = { ...initial };
    this.root = document.createElement("details");
    this.root.className = "stone-cluster-menu";
    this.root.open = true;

    const summary = document.createElement("summary");
    summary.textContent = "Stone clusters";
    this.root.appendChild(summary);

    this.addSection("Distribution", DISTRIBUTION);
    this.addSection("Footprint", FOOTPRINT);
    this.addSection("Composition", COMPOSITION, true);
    this.addSection("Context", CONTEXT, true);
    this.addButton("Apply now", () => this.commit(true));
    this.addButton("Reset YAML", this.resetToYaml);
    this.addButton("Export YAML", this.exportYaml);
    this.addButton("Copy probe URL", this.copyProbeUrl);

    this.syncControls();
    document.body.appendChild(this.root);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    window.clearTimeout(this.exportResetHandle);
    window.clearTimeout(this.debounceHandle);
    this.root.remove();
  }

  private addSection(
    title: string,
    specs: readonly ControlSpec[],
    collapsed = false,
  ): void {
    const section = document.createElement("details");
    section.className = "stone-cluster-section";
    section.open = !collapsed;
    const summary = document.createElement("summary");
    summary.textContent = title;
    section.appendChild(summary);
    for (const spec of specs) {
      this.addRange(section, spec);
    }
    this.root.appendChild(section);
  }

  private addRange(parent: HTMLElement, spec: ControlSpec): void {
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step);
    const output = document.createElement("output");
    input.addEventListener("input", () => {
      output.value = formatValue(spec, Number(input.value));
      this.commit(false);
    });
    const controls = document.createElement("span");
    controls.className = "stone-cluster-range";
    controls.append(input, output);
    const row = document.createElement("label");
    const name = document.createElement("span");
    name.textContent = spec.label;
    row.append(name, controls);
    parent.appendChild(row);
    this.inputs.set(spec.key, input);
    this.outputs.set(spec.key, output);
  }

  private addButton(label: string, handler: () => void): void {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => {
      if (!this.disposed) {
        handler();
      }
    });
    this.root.appendChild(button);
  }

  private readControls(): WorldConfig {
    const next = { ...this.current };
    for (const spec of ALL_CONTROLS) {
      const input = this.inputs.get(spec.key);
      if (!input) {
        continue;
      }
      next[spec.key] = validateControlValue(spec, input.value);
    }
    return next;
  }

  private commit = (immediate: boolean): void => {
    if (this.disposed) {
      return;
    }
    try {
      this.current = normalizeStoneClusterTuning(this.readControls());
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : String(error));
      return;
    }
    this.syncControls();
    window.clearTimeout(this.debounceHandle);
    if (immediate) {
      this.onChange(this.current, true);
      return;
    }
    this.debounceHandle = window.setTimeout(() => {
      this.onChange(this.current, false);
    }, REBUILD_DEBOUNCE_MS);
  };

  private readonly resetToYaml = (): void => {
    const next = new URLSearchParams(window.location.search);
    for (const key of STONE_CLUSTER_QUERY_KEYS) {
      next.delete(key);
    }
    window.location.search = next.toString();
  };

  private readonly exportYaml = async (): Promise<void> => {
    const yaml = `${STONE_CLUSTER_QUERY_KEYS.map(
      (key) => `${key}: ${this.current[key]}`,
    ).join("\n")}\n`;
    let copied = false;
    try {
      await navigator.clipboard.writeText(yaml);
      copied = true;
    } catch {
      copied = false;
    }
    if (this.disposed) {
      return;
    }
    downloadYaml(yaml);
    this.setStatus(copied ? "YAML copied + downloaded" : "YAML downloaded");
  };

  private readonly copyProbeUrl = async (): Promise<void> => {
    const url = new URL(this.probeUrl(this.current), window.location.href).toString();
    try {
      await navigator.clipboard.writeText(url);
      this.setStatus("Probe URL copied");
    } catch {
      this.setStatus(url);
    }
  };

  private syncControls(): void {
    for (const spec of ALL_CONTROLS) {
      const input = this.inputs.get(spec.key);
      const output = this.outputs.get(spec.key);
      if (!input || !output) {
        continue;
      }
      input.value = String(this.current[spec.key]);
      output.value = formatValue(spec, this.current[spec.key]);
    }
  }

  private setStatus(message: string): void {
    if (this.disposed) {
      return;
    }
    window.clearTimeout(this.exportResetHandle);
    const existing = this.root.querySelector(".stone-cluster-status");
    const status =
      existing instanceof HTMLElement
        ? existing
        : this.root.appendChild(document.createElement("p"));
    status.className = "stone-cluster-status";
    status.textContent = message;
    this.exportResetHandle = window.setTimeout(() => {
      status.textContent = "";
    }, EXPORT_STATUS_MS);
  }
}
