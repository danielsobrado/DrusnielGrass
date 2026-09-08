import { WorldExperiencePanel, type WorldExperiencePanelHost } from "../ui/WorldExperiencePanel";

/** Compatibility owner retained for UiVisibilityController; the panel owns the DOM. */
export class HudSettingsController {
  private panel?: WorldExperiencePanel;

  initialize(): void {
    if (this.panel) return;
    const panel = new WorldExperiencePanel();
    panel.initialize();
    this.panel = panel;
  }

  attachWorld(host: WorldExperiencePanelHost): void {
    this.panel?.attachWorld(host);
  }

  detachWorld(): void {
    this.panel?.detachWorld();
  }

  close(): void {
    this.panel?.close();
  }

  dispose(): void {
    this.panel?.dispose();
    this.panel = undefined;
  }
}
