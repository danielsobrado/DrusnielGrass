import "./hud-settings.css";
import { hudSettingsStore } from "./HudSettingsStore";

export class HudSettingsController {
  private root?: HTMLDivElement;
  private toggleButton?: HTMLButtonElement;
  private panel?: HTMLElement;
  private invertMovementInput?: HTMLInputElement;
  private initialized = false;

  initialize(): void {
    if (this.initialized) {
      return;
    }

    const root = document.createElement("div");
    root.className = "hud-settings-root";

    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = "hud-settings-toggle";
    toggleButton.textContent = "Settings";
    toggleButton.setAttribute("aria-expanded", "false");
    toggleButton.setAttribute("aria-controls", "hud-settings-panel");

    const panel = document.createElement("section");
    panel.id = "hud-settings-panel";
    panel.className = "hud-settings-panel";
    panel.hidden = true;
    panel.setAttribute("aria-label", "HUD Settings");

    const heading = document.createElement("h2");
    heading.textContent = "HUD Settings";

    const movementLabel = document.createElement("label");
    movementLabel.className = "hud-settings-row";

    const movementText = document.createElement("span");
    movementText.textContent = "Invert left/right movement";

    const invertMovementInput = document.createElement("input");
    invertMovementInput.type = "checkbox";
    invertMovementInput.checked =
      hudSettingsStore.getInvertHorizontalMovement();
    invertMovementInput.setAttribute(
      "aria-label",
      "Invert left and right movement",
    );

    const description = document.createElement("p");
    description.textContent =
      "Off uses normal camera-relative movement. On restores mirrored left/right controls.";

    movementLabel.append(movementText, invertMovementInput);
    panel.append(heading, movementLabel, description);
    root.append(toggleButton, panel);

    try {
      document.body.appendChild(root);
      toggleButton.addEventListener("click", this.handleToggle);
      invertMovementInput.addEventListener("change", this.handleMovementChange);
      document.addEventListener("keydown", this.handleKeyDown);
    } catch (error) {
      toggleButton.removeEventListener("click", this.handleToggle);
      invertMovementInput.removeEventListener("change", this.handleMovementChange);
      document.removeEventListener("keydown", this.handleKeyDown);
      root.remove();
      throw error;
    }

    this.root = root;
    this.toggleButton = toggleButton;
    this.panel = panel;
    this.invertMovementInput = invertMovementInput;
    this.initialized = true;
  }

  close(): void {
    this.setOpen(false);
  }

  dispose(): void {
    if (!this.initialized) {
      return;
    }
    this.initialized = false;
    this.toggleButton?.removeEventListener("click", this.handleToggle);
    this.invertMovementInput?.removeEventListener(
      "change",
      this.handleMovementChange,
    );
    document.removeEventListener("keydown", this.handleKeyDown);
    this.root?.remove();
    this.root = undefined;
    this.toggleButton = undefined;
    this.panel = undefined;
    this.invertMovementInput = undefined;
  }

  private readonly handleToggle = (): void => {
    this.setOpen(this.panel?.hidden ?? true);
  };

  private readonly handleMovementChange = (): void => {
    if (!this.invertMovementInput) {
      return;
    }
    hudSettingsStore.setInvertHorizontalMovement(
      this.invertMovementInput.checked,
    );
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      this.close();
    }
  };

  private setOpen(open: boolean): void {
    if (!this.panel || !this.toggleButton) {
      return;
    }
    this.panel.hidden = !open;
    this.toggleButton.setAttribute("aria-expanded", String(open));
  }
}
