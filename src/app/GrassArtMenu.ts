import {
  GRASS_ART_DIRECTIONS,
  type GrassArtDirection,
  type GrassArtDirectionKey,
} from "../grass/GrassArtDirection";
import { downloadTextFile } from "./TextDownload";

type NumericSetting =
  | "densityScale"
  | "windStrengthScale"
  | "flutterStrengthScale"
  | "tipColorStrength"
  | "rootDarkening"
  | "impostorBaseColorBlend"
  | "impostorColorScale"
  | "nearDistance"
  | "midDistance"
  | "farDistance"
  | "transitionDistance";

type ColorSetting = "baseColor" | "tipColor" | "dryColor";

const EXPORT_STATUS_MS = 1800;
const ROOT_DARKENING_MIN = 0.2;
const ROOT_DARKENING_MAX = 1;
const NEAR_DISTANCE_MIN = 10;
const NEAR_DISTANCE_MAX = 32;

export class GrassArtMenu {
  private readonly root: HTMLDetailsElement;
  private readonly presetSelect: HTMLSelectElement;
  private readonly numericInputs = new Map<NumericSetting, HTMLInputElement>();
  private readonly numericOutputs = new Map<NumericSetting, HTMLOutputElement>();
  private readonly colorInputs = new Map<ColorSetting, HTMLInputElement>();
  private current: GrassArtDirection;
  private exportResetHandle = 0;
  private disposed = false;

  constructor(
    initialKey: GrassArtDirectionKey,
    private readonly onChange: (direction: GrassArtDirection) => void,
  ) {
    this.current = { ...GRASS_ART_DIRECTIONS[initialKey] };
    this.root = document.createElement("details");
    this.root.className = "grass-art-menu";
    this.root.open = true;

    const summary = document.createElement("summary");
    summary.textContent = "Grass tuning";
    this.root.appendChild(summary);

    this.presetSelect = document.createElement("select");
    this.presetSelect.id = "grass-art-direction";
    this.presetSelect.setAttribute("aria-label", "Grass tuning preset");
    for (const direction of Object.values(GRASS_ART_DIRECTIONS)) {
      const option = document.createElement("option");
      option.value = direction.key;
      option.textContent = direction.label;
      this.presetSelect.appendChild(option);
    }
    this.presetSelect.value = initialKey;
    this.presetSelect.addEventListener("change", this.handlePresetChange);
    this.root.appendChild(this.createRow("Preset", this.presetSelect));

    this.addRange("Density", "densityScale", 0.45, 1, 0.01);
    this.addRange("Wind", "windStrengthScale", 0, 2, 0.05);
    this.addRange("Flutter", "flutterStrengthScale", 0, 2, 0.05);
    this.addRange("Tip mix", "tipColorStrength", 0, 0.6, 0.01);
    this.addRange(
      "Root light",
      "rootDarkening",
      ROOT_DARKENING_MIN,
      ROOT_DARKENING_MAX,
      0.01,
    );
    this.addRange("Far tint", "impostorBaseColorBlend", 0, 0.25, 0.01);
    this.addRange("Far light", "impostorColorScale", 0.7, 1.15, 0.01);
    this.addColor("Base", "baseColor");
    this.addColor("Tips", "tipColor");
    this.addColor("Dry", "dryColor");
    this.addNumber(
      "Near LOD",
      "nearDistance",
      NEAR_DISTANCE_MIN,
      NEAR_DISTANCE_MAX,
      1,
      "m",
    );
    this.addNumber("Mid LOD", "midDistance", 40, 140, 2, "m");
    this.addNumber("Far LOD", "farDistance", 160, 280, 5, "m");
    this.addNumber("Blend", "transitionDistance", 2, 12, 1, "m");

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

  private readonly handlePresetChange = (): void => {
    if (this.disposed) {
      return;
    }
    const key = this.presetSelect.value as GrassArtDirectionKey;
    this.current = { ...GRASS_ART_DIRECTIONS[key] };
    this.syncControls();
    this.onChange({ ...this.current });
  };

  private addRange(
    label: string,
    setting: NumericSetting,
    minimum: number,
    maximum: number,
    step: number,
  ): void {
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(minimum);
    input.max = String(maximum);
    input.step = String(step);
    const output = document.createElement("output");
    input.addEventListener("input", () => {
      this.setNumericSetting(setting, Number(input.value));
      output.value = this.formatNumericSetting(setting);
    });
    const controls = document.createElement("span");
    controls.className = "grass-art-range";
    controls.append(input, output);
    this.numericInputs.set(setting, input);
    this.numericOutputs.set(setting, output);
    this.root.appendChild(this.createRow(label, controls));
  }

  private addNumber(
    label: string,
    setting: NumericSetting,
    minimum: number,
    maximum: number,
    step: number,
    suffix: string,
  ): void {
    const input = document.createElement("input");
    input.type = "number";
    input.min = String(minimum);
    input.max = String(maximum);
    input.step = String(step);
    input.dataset.suffix = suffix;
    input.addEventListener("change", () => {
      this.setNumericSetting(setting, Number(input.value));
      this.syncControls();
    });
    this.numericInputs.set(setting, input);
    this.root.appendChild(this.createRow(label, input));
  }

  private addColor(label: string, setting: ColorSetting): void {
    const input = document.createElement("input");
    input.type = "color";
    input.addEventListener("input", () => {
      if (this.disposed) {
        return;
      }
      this.current = { ...this.current, [setting]: input.value };
      this.onChange({ ...this.current });
    });
    this.colorInputs.set(setting, input);
    this.root.appendChild(this.createRow(label, input));
  }

  private setNumericSetting(setting: NumericSetting, value: number): void {
    if (this.disposed || !Number.isFinite(value)) {
      return;
    }
    this.current = { ...this.current, [setting]: value };
    this.normalizeLodDistances();
    this.onChange({ ...this.current });
  }

  private normalizeLodDistances(): void {
    this.current.nearDistance = Math.min(
      NEAR_DISTANCE_MAX,
      Math.max(NEAR_DISTANCE_MIN, this.current.nearDistance),
    );
    this.current.transitionDistance = Math.min(
      12,
      Math.max(2, Math.min(this.current.nearDistance - 4, this.current.transitionDistance)),
    );
    this.current.midDistance = Math.min(
      140,
      Math.max(this.current.nearDistance + this.current.transitionDistance + 2, this.current.midDistance),
    );
    this.current.farDistance = Math.min(
      280,
      Math.max(this.current.midDistance + this.current.transitionDistance + 5, this.current.farDistance),
    );
  }

  private syncControls(): void {
    for (const [setting, input] of this.numericInputs) {
      input.value = String(this.current[setting]);
      const output = this.numericOutputs.get(setting);
      if (output) {
        output.value = this.formatNumericSetting(setting);
      }
    }
    for (const [setting, input] of this.colorInputs) {
      input.value = this.current[setting];
    }
  }

  private formatNumericSetting(setting: NumericSetting): string {
    const value = this.current[setting];
    return setting.endsWith("Distance")
      ? `${Math.round(value)} m`
      : `${Math.round(value * 100)}%`;
  }

  private createRow(labelText: string, control: HTMLElement): HTMLLabelElement {
    const label = document.createElement("label");
    const text = document.createElement("span");
    text.textContent = labelText;
    label.append(text, control);
    return label;
  }

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
      `grass-preset-${this.current.key}.yaml`,
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

  private serializeYaml(direction: GrassArtDirection): string {
    return [
      `key: "${direction.key}"`,
      `label: "${direction.label}"`,
      `densityScale: ${direction.densityScale}`,
      `windStrengthScale: ${direction.windStrengthScale}`,
      `flutterStrengthScale: ${direction.flutterStrengthScale}`,
      `baseColor: "${direction.baseColor}"`,
      `tipColor: "${direction.tipColor}"`,
      `dryColor: "${direction.dryColor}"`,
      `rootDarkening: ${direction.rootDarkening}`,
      `tipColorStrength: ${direction.tipColorStrength}`,
      `normalUp: ${direction.normalUp}`,
      `ambientBoost: ${direction.ambientBoost}`,
      `backlightStrength: ${direction.backlightStrength}`,
      `nearDistance: ${direction.nearDistance}`,
      `midDistance: ${direction.midDistance}`,
      `farDistance: ${direction.farDistance}`,
      `transitionDistance: ${direction.transitionDistance}`,
      `impostorBaseColorBlend: ${direction.impostorBaseColorBlend}`,
      `impostorColorScale: ${direction.impostorColorScale}`,
      `terrainGrassColor: "${direction.terrainGrassColor}"`,
      `terrainGrassTintStrength: ${direction.terrainGrassTintStrength}`,
      "",
    ].join("\n");
  }
}