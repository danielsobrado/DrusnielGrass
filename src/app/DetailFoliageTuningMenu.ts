import {
  DETAIL_FOLIAGE_TUNING_LIMITS,
  detailFoliageTuningEquals,
  normalizeDetailFoliageTuning,
  type DetailFoliageTuning,
  type DetailFoliageTuningKey,
} from "../world/grass/DetailFoliageTuning";
import { downloadTextFile } from "./TextDownload";

const EXPORT_STATUS_MS = 1800;

const CONTROL_LABELS: Record<DetailFoliageTuningKey, string> = {
  density: "Density",
  colonyWorldSize: "Colony size",
  clumpWorldSize: "Clump size",
  colonyStrength: "Colony strength",
  dominantFamilyShare: "Dominant family",
  tintCoherence: "Tint coherence",
  quietZoneThreshold: "Quiet threshold",
  backgroundSuppression: "Background suppression",
  coreHeightBias: "Core height bias",
  maturePhenotypeBias: "Mature phenotype",
  ecologyStrength: "Ecology influence",
  edgeCompanionStrength: "Edge companions",
  stoneFringeStrength: "Stone fringe",
  pathFringeStrength: "Path fringe",
  communityStrength: "Community influence",
  grassHeightCoupling: "Grass height coupling",
};

const YAML_KEYS: Record<DetailFoliageTuningKey, string> = {
  density: "detailFoliageDensity",
  colonyWorldSize: "detailFoliageColonyWorldSize",
  clumpWorldSize: "detailFoliageClumpWorldSize",
  colonyStrength: "detailFoliageColonyStrength",
  dominantFamilyShare: "detailFoliageDominantFamilyShare",
  tintCoherence: "detailFoliageTintCoherence",
  quietZoneThreshold: "detailFoliageQuietZoneThreshold",
  backgroundSuppression: "detailFoliageBackgroundSuppression",
  coreHeightBias: "detailFoliageCoreHeightBias",
  maturePhenotypeBias: "detailFoliageMaturePhenotypeBias",
  ecologyStrength: "detailFoliageEcologyStrength",
  edgeCompanionStrength: "detailFoliageEdgeCompanionStrength",
  stoneFringeStrength: "detailFoliageStoneFringeStrength",
  pathFringeStrength: "detailFoliagePathFringeStrength",
  communityStrength: "detailFoliageCommunityStrength",
  grassHeightCoupling: "detailFoliageGrassHeightCoupling",
};

const TUNING_KEYS = Object.keys(CONTROL_LABELS) as DetailFoliageTuningKey[];

function copyTuning(tuning: DetailFoliageTuning): DetailFoliageTuning {
  return { ...tuning };
}

export class DetailFoliageTuningMenu {
  private readonly root: HTMLDetailsElement;
  private readonly yamlSnapshot: DetailFoliageTuning;
  private readonly numericInputs = new Map<
    DetailFoliageTuningKey,
    HTMLInputElement
  >();
  private readonly numericOutputs = new Map<
    DetailFoliageTuningKey,
    HTMLOutputElement
  >();
  private current: DetailFoliageTuning;
  private exportResetHandle = 0;
  private disposed = false;

  constructor(
    initial: DetailFoliageTuning,
    private readonly onChange: (tuning: DetailFoliageTuning) => void,
  ) {
    this.yamlSnapshot = copyTuning(normalizeDetailFoliageTuning(initial));
    this.current = copyTuning(this.yamlSnapshot);
    this.root = document.createElement("details");
    this.root.className = "detail-foliage-menu";
    this.root.open = true;

    const summary = document.createElement("summary");
    summary.textContent = "Detail foliage";
    this.root.appendChild(summary);

    for (const key of TUNING_KEYS) {
      this.addRange(key);
    }

    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.textContent = "Reset to YAML";
    resetButton.addEventListener("click", this.resetToYaml);
    this.root.appendChild(resetButton);

    const exportButton = document.createElement("button");
    exportButton.type = "button";
    exportButton.textContent = "Export YAML";
    exportButton.addEventListener("click", this.exportYaml);
    this.root.appendChild(exportButton);

    this.syncControls();
    document.body.appendChild(this.root);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    window.clearTimeout(this.exportResetHandle);
    this.root.remove();
  }

  private addRange(setting: DetailFoliageTuningKey): void {
    const limit = DETAIL_FOLIAGE_TUNING_LIMITS[setting];
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(limit.min);
    input.max = String(limit.max);
    input.step = String(limit.step);
    const output = document.createElement("output");
    input.addEventListener("input", () => {
      output.value = this.formatValue(setting, Number(input.value));
    });
    input.addEventListener("change", () => {
      this.commitFromControls();
    });
    const controls = document.createElement("span");
    controls.className = "grass-art-range";
    controls.append(input, output);
    this.numericInputs.set(setting, input);
    this.numericOutputs.set(setting, output);
    this.root.appendChild(this.createRow(CONTROL_LABELS[setting], controls));
  }

  private readControls(): DetailFoliageTuning {
    const next = copyTuning(this.current);
    for (const key of TUNING_KEYS) {
      const input = this.numericInputs.get(key);
      if (!input) {
        continue;
      }
      const value = Number(input.value);
      if (Number.isFinite(value)) {
        next[key] = value;
      }
    }
    return next;
  }

  private commitFromControls(): void {
    if (this.disposed) {
      return;
    }
    const normalized = normalizeDetailFoliageTuning(this.readControls());
    this.syncControls(normalized);
    if (detailFoliageTuningEquals(this.current, normalized)) {
      return;
    }
    this.current = copyTuning(normalized);
    this.onChange(copyTuning(this.current));
  }

  private syncControls(tuning = this.current): void {
    for (const key of TUNING_KEYS) {
      const input = this.numericInputs.get(key);
      const output = this.numericOutputs.get(key);
      if (!input) {
        continue;
      }
      input.value = String(tuning[key]);
      if (output) {
        output.value = this.formatValue(key, tuning[key]);
      }
    }
  }

  private formatValue(setting: DetailFoliageTuningKey, value: number): string {
    if (setting === "density") {
      return `${value.toFixed(2)}/m²`;
    }
    if (setting === "colonyWorldSize" || setting === "clumpWorldSize") {
      return `${value.toFixed(2)} m`;
    }
    return value.toFixed(2);
  }

  private createRow(labelText: string, control: HTMLElement): HTMLLabelElement {
    const label = document.createElement("label");
    const text = document.createElement("span");
    text.textContent = labelText;
    label.append(text, control);
    return label;
  }

  private readonly resetToYaml = (): void => {
    if (this.disposed) {
      return;
    }
    const restored = copyTuning(this.yamlSnapshot);
    this.syncControls(restored);
    if (detailFoliageTuningEquals(this.current, restored)) {
      return;
    }
    this.current = restored;
    this.onChange(copyTuning(this.current));
  };

  private readonly exportYaml = (event: MouseEvent): void => {
    if (this.disposed) {
      return;
    }
    const yaml = this.serializeYaml(this.current);
    const button = event.currentTarget as HTMLButtonElement;
    button.dataset.yaml = yaml;
    this.showExportStatus(button, "YAML downloaded");
    const clipboard = navigator.clipboard;
    if (clipboard) {
      void clipboard
        .writeText(yaml)
        .then(() => this.showExportStatus(button, "YAML copied + downloaded"))
        .catch(() => undefined);
    }

    downloadTextFile(
      "detail-foliage-tuning.yaml",
      yaml,
      "application/yaml;charset=utf-8",
    );
  };

  private showExportStatus(button: HTMLButtonElement, status: string): void {
    if (this.disposed) {
      return;
    }
    button.textContent = status;
    window.clearTimeout(this.exportResetHandle);
    this.exportResetHandle = window.setTimeout(() => {
      if (!this.disposed) {
        button.textContent = "Export YAML";
      }
    }, EXPORT_STATUS_MS);
  }

  private serializeYaml(tuning: DetailFoliageTuning): string {
    return TUNING_KEYS.map(
      (key) => `${YAML_KEYS[key]}: ${tuning[key]}`,
    ).join("\n") + "\n";
  }
}