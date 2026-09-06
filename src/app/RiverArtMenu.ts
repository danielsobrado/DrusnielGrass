import type { WorldController } from "../controls/WorldController";
import {
  clearRiverDevelopmentOverrides,
  readRiverDevelopmentOverrides,
  serializeRiverConfigYaml,
  writeRiverDevelopmentOverrides,
  type RiverDevelopmentOverrideKey,
  type RiverDevelopmentOverrides,
} from "../dev/RiverDevelopmentConfig";
import {
  findWorldVisualLocations,
  type WorldVisualLocations,
} from "../qa/WorldVisualMatrixLocations";
import {
  createRiverTuningPose,
  type RiverTuningLandmark,
} from "../qa/WorldVisualMatrixPoses";
import type { TerrainField } from "../world/TerrainField";
import type { WorldConfig } from "../world/WorldConfig";
import { WORLD_CONFIG_SCHEMA } from "../world/WorldConfigSchema";
import { validateWorldConfig } from "../world/WorldConfigValidator";
import { validateRiverWidthEnvelope } from "../world/hydrology/RiverTuning";
import type { WaterBedLiveVisuals } from "../world/hydrology/WaterBedMaterialController";
import type { WaterSurfaceLiveVisuals } from "../world/hydrology/WaterMaterialController";
import { downloadTextFile } from "./TextDownload";

type LiveVisuals = WaterSurfaceLiveVisuals & WaterBedLiveVisuals;

const EXPORT_STATUS_MS = 1800;
const GEOMETRY_KEYS = [
  "riverWidthVariation",
  "riverBendBankAsymmetry",
  "riverDepthVariation",
  "riverBendChannelShift",
  "waterStoneWakeLength",
] as const satisfies readonly RiverDevelopmentOverrideKey[];

const LIVE_KEYS = [
  "waterFlowSpeed",
  "waterRiverPoolFlowScale",
  "waterRiverRiffleFlowScale",
  "waterRippleStrength",
  "waterRippleScale",
  "waterFlowNoiseStrength",
  "waterFoamStrength",
  "waterShoreFoamWeight",
  "waterRiffleFoamWeight",
  "waterStoneFoamWeight",
  "waterStoneWakeStrength",
  "waterBedStrength",
  "waterBedScale",
  "waterBedRefraction",
  "waterAlgaeStrength",
  "waterCausticStrength",
  "waterOpacity",
  "waterDepthFade",
  "waterFresnelStrength",
  "waterRoughness",
  "waterGlintStrength",
] as const satisfies readonly RiverDevelopmentOverrideKey[];

const STEP_OVERRIDES: Partial<Record<RiverDevelopmentOverrideKey, number>> = {
  riverBendBankAsymmetry: 0.005,
  waterFlowSpeed: 0.01,
  waterRippleScale: 0.005,
  waterRoughness: 0.005,
};

const LANDMARKS: Array<{ key: RiverTuningLandmark; label: string }> = [
  { key: "pool", label: "Go: Pool" },
  { key: "riffle", label: "Go: Riffle" },
  { key: "straight", label: "Go: Straight" },
  { key: "insideBend", label: "Go: Inside bend" },
  { key: "outsideBend", label: "Go: Outside bend" },
  { key: "wetBank", label: "Go: Wet bank" },
  { key: "stoneWake", label: "Go: Stone wake" },
];

export interface RiverArtMenuHost {
  readonly worldConfig: WorldConfig;
  readonly field: TerrainField;
  readonly controls: WorldController;
  applyLiveWaterVisuals(visuals: LiveVisuals): void;
}

export class RiverArtMenu {
  private readonly root: HTMLDetailsElement;
  private readonly pendingNote: HTMLParagraphElement;
  private readonly numericInputs = new Map<
    RiverDevelopmentOverrideKey,
    HTMLInputElement
  >();
  private readonly numericOutputs = new Map<
    RiverDevelopmentOverrideKey,
    HTMLOutputElement
  >();
  private readonly working: WorldConfig;
  private exportResetHandle = 0;
  private disposed = false;
  private locations?: WorldVisualLocations;
  private locationsTask?: Promise<WorldVisualLocations>;
  private locationsOriginX = Number.NaN;
  private locationsOriginZ = Number.NaN;

  constructor(private readonly host: RiverArtMenuHost) {
    this.working = { ...host.worldConfig };
    this.root = document.createElement("details");
    this.root.className = "river-art-menu";
    this.root.open = true;
    const summary = document.createElement("summary");
    summary.textContent = "River tuning";
    this.root.appendChild(summary);

    this.addHeading("Geometry — reload required");
    this.addRange("Width variation", "riverWidthVariation");
    this.addRange("Bend asymmetry", "riverBendBankAsymmetry");
    this.addRange("Depth variation", "riverDepthVariation");
    this.addRange("Channel shift", "riverBendChannelShift");
    this.addRange("Wake length", "waterStoneWakeLength");
    this.pendingNote = document.createElement("p");
    this.pendingNote.className = "river-art-pending";
    this.pendingNote.hidden = true;
    this.pendingNote.textContent = "Geometry changes pending";
    this.root.appendChild(this.pendingNote);
    this.addButton("Apply geometry + reload", this.applyGeometryAndReload);

    this.addHeading("Motion");
    this.addRange("Base flow", "waterFlowSpeed");
    this.addRange("Pool flow", "waterRiverPoolFlowScale");
    this.addRange("Riffle flow", "waterRiverRiffleFlowScale");
    this.addRange("Ripple strength", "waterRippleStrength");
    this.addRange("Ripple scale", "waterRippleScale");
    this.addRange("Flow breakup", "waterFlowNoiseStrength");

    this.addHeading("Foam / wake");
    this.addRange("Foam strength", "waterFoamStrength");
    this.addRange("Shore foam", "waterShoreFoamWeight");
    this.addRange("Riffle foam", "waterRiffleFoamWeight");
    this.addRange("Stone foam", "waterStoneFoamWeight");
    this.addRange("Wake strength", "waterStoneWakeStrength");

    this.addHeading("Bed");
    this.addRange("Bed visibility", "waterBedStrength");
    this.addRange("Bed scale", "waterBedScale");
    this.addRange("Bed refraction", "waterBedRefraction");
    this.addRange("Algae", "waterAlgaeStrength");
    this.addRange("Caustics", "waterCausticStrength");

    this.addHeading("Optics");
    this.addQualityToggle();
    this.addRange("Opacity", "waterOpacity");
    this.addRange("Depth absorption", "waterDepthFade");
    this.addRange("Fresnel", "waterFresnelStrength");
    this.addRange("Roughness", "waterRoughness");
    this.addRange("Glint", "waterGlintStrength");

    this.addHeading("QA");
    for (const landmark of LANDMARKS) {
      this.addButton(landmark.label, () => {
        void this.goToLandmark(landmark.key).catch((error) => {
          console.warn("[Drusniel World] River tuning landmark unavailable.", error);
        });
      });
    }

    this.addButton("Export YAML", this.exportYaml);
    this.addButton("Clear session + reload", this.clearSessionAndReload);
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

  private addHeading(text: string): void {
    const heading = document.createElement("h2");
    heading.textContent = text;
    this.root.appendChild(heading);
  }

  private addRange(
    label: string,
    setting: RiverDevelopmentOverrideKey,
  ): void {
    const rule = WORLD_CONFIG_SCHEMA[setting];
    const minimum = rule.minimum ?? 0;
    const maximum = rule.maximum ?? 1;
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(minimum);
    input.max = String(maximum);
    input.step = String(resolveStep(setting, minimum, maximum));
    const output = document.createElement("output");
    input.addEventListener("input", () => {
      this.setNumericSetting(setting, Number(input.value));
    });
    const controls = document.createElement("span");
    controls.className = "grass-art-range";
    controls.append(input, output);
    this.numericInputs.set(setting, input);
    this.numericOutputs.set(setting, output);
    this.root.appendChild(this.createRow(label, controls));
  }

  /**
   * The optics preset, as a switch rather than a slider: it selects between two
   * shader paths, and the expensive one is opt-in because it costs real
   * fragment time on every water pixel in frame.
   */
  private addQualityToggle(): void {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = this.working.waterQuality >= 1;
    input.addEventListener("change", () => {
      if (this.disposed) {
        return;
      }
      this.working.waterQuality = input.checked ? 1 : 0;
      this.host.applyLiveWaterVisuals(this.working);
    });
    const controls = document.createElement("span");
    controls.className = "grass-art-range";
    controls.append(input);
    this.root.appendChild(this.createRow("High water optics", controls));
  }

  private addButton(label: string, handler: (event: MouseEvent) => void): void {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", (event) => {
      if (this.disposed) {
        return;
      }
      handler(event);
    });
    this.root.appendChild(button);
  }

  private setNumericSetting(
    setting: RiverDevelopmentOverrideKey,
    value: number,
  ): void {
    if (!Number.isFinite(value)) {
      this.syncControl(setting);
      return;
    }
    const previous = this.working[setting];
    this.working[setting] = value;
    if (isGeometryKey(setting)) {
      try {
        validateRiverWidthEnvelope(
          this.working.riverWidthVariation,
          this.working.riverBendBankAsymmetry,
        );
        validateWorldConfig({ ...this.working });
      } catch {
        this.working[setting] = previous;
        this.syncControls();
        return;
      }
      this.pendingNote.hidden = false;
      this.syncControl(setting);
      return;
    }
    this.host.applyLiveWaterVisuals(this.working);
    writeRiverDevelopmentOverrides({
      ...readRiverDevelopmentOverrides(),
      ...collectLiveOverrides(this.working),
    });
    this.syncControl(setting);
  }

  private readonly applyGeometryAndReload = (): void => {
    writeRiverDevelopmentOverrides(collectOverrides(this.working));
    window.location.reload();
  };

  private readonly clearSessionAndReload = (): void => {
    clearRiverDevelopmentOverrides();
    window.location.reload();
  };

  private readonly exportYaml = (event: MouseEvent): void => {
    const yaml = serializeRiverConfigYaml(this.working);
    const button = event.currentTarget as HTMLButtonElement;
    this.showExportStatus(button, "YAML downloaded");
    const clipboard = navigator.clipboard;
    if (clipboard) {
      void clipboard
        .writeText(yaml)
        .then(() => this.showExportStatus(button, "YAML copied + downloaded"))
        .catch(() => undefined);
    }
    downloadTextFile(
      "world-river-tuning.yaml",
      yaml,
      "application/yaml;charset=utf-8",
    );
  };

  private async goToLandmark(landmark: RiverTuningLandmark): Promise<void> {
    if (this.locationsTask) {
      this.locations = await this.locationsTask;
    }
    if (this.disposed) {
      return;
    }
    const origin = this.host.controls.getStreamingPosition();
    const originX = origin.x;
    const originZ = origin.z;
    const moved =
      !Number.isFinite(this.locationsOriginX) ||
      Math.hypot(originX - this.locationsOriginX, originZ - this.locationsOriginZ) >
        64;
    if (!this.locations || moved) {
      const task = findWorldVisualLocations(this.host.field, originX, originZ);
      this.locationsTask = task;
      try {
        this.locations = await task;
        this.locationsOriginX = originX;
        this.locationsOriginZ = originZ;
      } finally {
        if (this.locationsTask === task) {
          this.locationsTask = undefined;
        }
      }
    }
    if (this.disposed || !this.locations) {
      return;
    }
    const pose = createRiverTuningPose(this.locations, landmark);
    this.host.controls.captureLookAt(pose.camera, pose.target);
  }

  private syncControls(): void {
    for (const setting of this.numericInputs.keys()) {
      this.syncControl(setting);
    }
  }

  private syncControl(setting: RiverDevelopmentOverrideKey): void {
    const input = this.numericInputs.get(setting);
    const output = this.numericOutputs.get(setting);
    if (!input || !output) {
      return;
    }
    input.value = String(this.working[setting]);
    output.value = formatValue(this.working[setting], Number(input.step));
  }

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

  private createRow(labelText: string, control: HTMLElement): HTMLLabelElement {
    const label = document.createElement("label");
    const text = document.createElement("span");
    text.textContent = labelText;
    label.append(text, control);
    return label;
  }
}

function isGeometryKey(
  key: RiverDevelopmentOverrideKey,
): key is (typeof GEOMETRY_KEYS)[number] {
  return (GEOMETRY_KEYS as readonly string[]).includes(key);
}

function collectOverrides(config: WorldConfig): RiverDevelopmentOverrides {
  return {
    ...collectGeometryOverrides(config),
    ...collectLiveOverrides(config),
  };
}

function collectGeometryOverrides(
  config: WorldConfig,
): RiverDevelopmentOverrides {
  const overrides: RiverDevelopmentOverrides = {};
  for (const key of GEOMETRY_KEYS) {
    overrides[key] = config[key];
  }
  return overrides;
}

function collectLiveOverrides(config: WorldConfig): RiverDevelopmentOverrides {
  const overrides: RiverDevelopmentOverrides = {};
  for (const key of LIVE_KEYS) {
    overrides[key] = config[key];
  }
  return overrides;
}

function resolveStep(
  setting: RiverDevelopmentOverrideKey,
  minimum: number,
  maximum: number,
): number {
  const override = STEP_OVERRIDES[setting];
  if (override !== undefined) {
    return override;
  }
  return maximum - minimum <= 2 ? 0.01 : 0.05;
}

function formatValue(value: number, step: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(step < 0.01 ? 3 : 2);
}