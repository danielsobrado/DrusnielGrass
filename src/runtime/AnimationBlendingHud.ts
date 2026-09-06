import type { SnowflowCharacter } from "../character/SnowflowCharacter";
import {
  ADDITIVE_ACTION_AGREE,
  ADDITIVE_ACTION_HEAD_SHAKE,
  ADDITIVE_ACTION_SAD,
  ADDITIVE_ACTION_SNEAK,
} from "../character/animation/HumanoidAdditiveLayer";

export class AnimationBlendingHud {
  private readonly container: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly toggleBtn: HTMLButtonElement;
  private character: SnowflowCharacter | null = null;
  private autoLocomotion = true;
  private crossfadeTarget: "idle" | "walk" | "run" | null = null;
  private crossfadeDuration = 0.5;
  private crossfadeElapsed = 0;
  private crossfadeStartWeights = { idle: 1, walk: 0, run: 0 };
  private crossfadeTargetWeights = { idle: 1, walk: 0, run: 0 };

  private idleSlider!: HTMLInputElement;
  private walkSlider!: HTMLInputElement;
  private runSlider!: HTMLInputElement;
  private idleValSpan!: HTMLElement;
  private walkValSpan!: HTMLElement;
  private runValSpan!: HTMLElement;
  private sneakSlider!: HTMLInputElement;
  private sadSlider!: HTMLInputElement;
  private agreeSlider!: HTMLInputElement;
  private headShakeSlider!: HTMLInputElement;
  private sneakValSpan!: HTMLElement;
  private sadValSpan!: HTMLElement;
  private agreeValSpan!: HTMLElement;
  private headShakeValSpan!: HTMLElement;
  private autoBtn!: HTMLButtonElement;
  private disposed = false;

  constructor() {
    this.container = document.createElement("div");
    this.container.className = "animation-blending-hud";
    this.container.id = "animation-blending-hud";

    this.toggleBtn = document.createElement("button");
    this.toggleBtn.className = "anim-hud-toggle";
    this.toggleBtn.textContent = "Animations (B)";
    this.toggleBtn.title = "Toggle Animation Blending Panel (Key: B)";

    this.panel = document.createElement("div");
    this.panel.className = "anim-hud-panel";

    this.buildPanelDom();
    this.container.appendChild(this.toggleBtn);
    this.container.appendChild(this.panel);
    try {
      document.body.appendChild(this.container);
      this.bindEvents();
    } catch (error) {
      window.removeEventListener("keydown", this.handleKeyDown);
      this.container.remove();
      throw error;
    }
  }

  attachCharacter(character: SnowflowCharacter | null): void {
    this.character = character;
  }

  update(deltaSeconds: number): void {
    if (this.disposed || !this.character) {
      return;
    }

    if (this.crossfadeTarget !== null && this.crossfadeDuration > 0) {
      this.crossfadeElapsed += deltaSeconds;
      const t = Math.min(1, this.crossfadeElapsed / this.crossfadeDuration);
      const eased = t * t * (3 - 2 * t);
      const curIdle =
        this.crossfadeStartWeights.idle +
        (this.crossfadeTargetWeights.idle - this.crossfadeStartWeights.idle) *
          eased;
      const curWalk =
        this.crossfadeStartWeights.walk +
        (this.crossfadeTargetWeights.walk - this.crossfadeStartWeights.walk) *
          eased;
      const curRun =
        this.crossfadeStartWeights.run +
        (this.crossfadeTargetWeights.run - this.crossfadeStartWeights.run) *
          eased;

      this.character.setExplicitLocomotionWeights({
        idle: curIdle,
        walk: curWalk,
        run: curRun,
      });

      if (t >= 1) {
        this.crossfadeTarget = null;
      }
    }

    const weights = this.character.getLocomotionBlendWeights();
    if (this.autoLocomotion && this.crossfadeTarget === null) {
      this.idleSlider.value = weights.idle.toFixed(2);
      this.walkSlider.value = weights.walk.toFixed(2);
      this.runSlider.value = weights.run.toFixed(2);
    }
    this.idleValSpan.textContent = weights.idle.toFixed(2);
    this.walkValSpan.textContent = weights.walk.toFixed(2);
    this.runValSpan.textContent = weights.run.toFixed(2);

    const sneakW = this.character.getAdditiveWeight(ADDITIVE_ACTION_SNEAK);
    const sadW = this.character.getAdditiveWeight(ADDITIVE_ACTION_SAD);
    const agreeW = this.character.getAdditiveWeight(ADDITIVE_ACTION_AGREE);
    const headShakeW = this.character.getAdditiveWeight(
      ADDITIVE_ACTION_HEAD_SHAKE,
    );

    this.sneakSlider.value = sneakW.toFixed(2);
    this.sadSlider.value = sadW.toFixed(2);
    this.agreeSlider.value = agreeW.toFixed(2);
    this.headShakeSlider.value = headShakeW.toFixed(2);
    this.sneakValSpan.textContent = sneakW.toFixed(2);
    this.sadValSpan.textContent = sadW.toFixed(2);
    this.agreeValSpan.textContent = agreeW.toFixed(2);
    this.headShakeValSpan.textContent = headShakeW.toFixed(2);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    window.removeEventListener("keydown", this.handleKeyDown);
    this.container.remove();
  }

  private buildPanelDom(): void {
    this.panel.innerHTML = `
      <div class="anim-panel-header">
        <strong>🎭 Skeletal Blending & Additives</strong>
        <button type="button" class="anim-panel-close" title="Close">✕</button>
      </div>

      <div class="anim-section">
        <div class="anim-section-title">
          <span>Base Locomotion Blending</span>
          <button type="button" class="anim-auto-btn" data-auto="true">Auto (Speed)</button>
        </div>
        <div class="anim-slider-row">
          <label>Idle <span class="val" data-idle-val>1.00</span></label>
          <input type="range" min="0" max="1" step="0.01" value="1" data-idle-slider />
        </div>
        <div class="anim-slider-row">
          <label>Walk <span class="val" data-walk-val>0.00</span></label>
          <input type="range" min="0" max="1" step="0.01" value="0" data-walk-slider />
        </div>
        <div class="anim-slider-row">
          <label>Run <span class="val" data-run-val>0.00</span></label>
          <input type="range" min="0" max="1" step="0.01" value="0" data-run-slider />
        </div>
        <div class="anim-btn-group">
          <button type="button" data-fade="idle">Fade to Idle</button>
          <button type="button" data-fade="walk">Fade to Walk</button>
          <button type="button" data-fade="run">Fade to Run</button>
        </div>
      </div>

      <div class="anim-section">
        <div class="anim-section-title">
          <span>Additive Animation Layers</span>
          <button type="button" class="anim-reset-additive-btn">Reset All</button>
        </div>
        <div class="anim-slider-row">
          <div class="anim-slider-header">
            <label>Sneak Pose <span class="val" data-sneak-val>0.00</span></label>
            <button type="button" class="anim-quick-toggle" data-toggle-additive="sneak_pose">Toggle</button>
          </div>
          <input type="range" min="0" max="1" step="0.01" value="0" data-sneak-slider />
        </div>
        <div class="anim-slider-row">
          <div class="anim-slider-header">
            <label>Sad Pose <span class="val" data-sad-val>0.00</span></label>
            <button type="button" class="anim-quick-toggle" data-toggle-additive="sad_pose">Toggle</button>
          </div>
          <input type="range" min="0" max="1" step="0.01" value="0" data-sad-slider />
        </div>
        <div class="anim-slider-row">
          <div class="anim-slider-header">
            <label>Agree (Head Nod) <span class="val" data-agree-val>0.00</span></label>
            <button type="button" class="anim-quick-toggle" data-toggle-additive="agree">Toggle</button>
          </div>
          <input type="range" min="0" max="1" step="0.01" value="0" data-agree-slider />
        </div>
        <div class="anim-slider-row">
          <div class="anim-slider-header">
            <label>Head Shake <span class="val" data-headshake-val>0.00</span></label>
            <button type="button" class="anim-quick-toggle" data-toggle-additive="headShake">Toggle</button>
          </div>
          <input type="range" min="0" max="1" step="0.01" value="0" data-headshake-slider />
        </div>
      </div>

      <div class="anim-section">
        <div class="anim-section-title">
          <span>Gameplay Actions</span>
        </div>
        <p>Crouch: C · Dodge roll: R</p>
        <div class="anim-btn-group">
          <button type="button" data-action="look">Clear Look Target</button>
        </div>
      </div>
    `;

    this.idleSlider = this.panel.querySelector("[data-idle-slider]")!;
    this.walkSlider = this.panel.querySelector("[data-walk-slider]")!;
    this.runSlider = this.panel.querySelector("[data-run-slider]")!;
    this.idleValSpan = this.panel.querySelector("[data-idle-val]")!;
    this.walkValSpan = this.panel.querySelector("[data-walk-val]")!;
    this.runValSpan = this.panel.querySelector("[data-run-val]")!;
    this.sneakSlider = this.panel.querySelector("[data-sneak-slider]")!;
    this.sadSlider = this.panel.querySelector("[data-sad-slider]")!;
    this.agreeSlider = this.panel.querySelector("[data-agree-slider]")!;
    this.headShakeSlider = this.panel.querySelector("[data-headshake-slider]")!;
    this.sneakValSpan = this.panel.querySelector("[data-sneak-val]")!;
    this.sadValSpan = this.panel.querySelector("[data-sad-val]")!;
    this.agreeValSpan = this.panel.querySelector("[data-agree-val]")!;
    this.headShakeValSpan = this.panel.querySelector("[data-headshake-val]")!;
    this.autoBtn = this.panel.querySelector(".anim-auto-btn")!;
  }

  private bindEvents(): void {
    this.toggleBtn.addEventListener("click", () => {
      this.toggleVisibility();
    });

    const closeBtn = this.panel.querySelector(".anim-panel-close");
    closeBtn?.addEventListener("click", () => {
      this.toggleVisibility(false);
    });

    const handleLocomotionChange = () => {
      this.autoLocomotion = false;
      this.crossfadeTarget = null;
      this.autoBtn.classList.remove("active");
      const idle = parseFloat(this.idleSlider.value);
      const walk = parseFloat(this.walkSlider.value);
      const run = parseFloat(this.runSlider.value);
      this.character?.setExplicitLocomotionWeights({ idle, walk, run });
    };

    this.idleSlider.addEventListener("input", handleLocomotionChange);
    this.walkSlider.addEventListener("input", handleLocomotionChange);
    this.runSlider.addEventListener("input", handleLocomotionChange);

    this.autoBtn.addEventListener("click", () => {
      this.autoLocomotion = true;
      this.crossfadeTarget = null;
      this.autoBtn.classList.add("active");
      this.character?.setExplicitLocomotionWeights(null);
    });

    this.panel
      .querySelectorAll<HTMLButtonElement>("[data-fade]")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          const target = btn.dataset.fade as "idle" | "walk" | "run";
          this.beginCrossfade(target);
        });
      });

    this.sneakSlider.addEventListener("input", () => {
      this.character?.setAdditiveWeight(
        ADDITIVE_ACTION_SNEAK,
        parseFloat(this.sneakSlider.value),
      );
    });
    this.sadSlider.addEventListener("input", () => {
      this.character?.setAdditiveWeight(
        ADDITIVE_ACTION_SAD,
        parseFloat(this.sadSlider.value),
      );
    });
    this.agreeSlider.addEventListener("input", () => {
      this.character?.setAdditiveWeight(
        ADDITIVE_ACTION_AGREE,
        parseFloat(this.agreeSlider.value),
      );
    });
    this.headShakeSlider.addEventListener("input", () => {
      this.character?.setAdditiveWeight(
        ADDITIVE_ACTION_HEAD_SHAKE,
        parseFloat(this.headShakeSlider.value),
      );
    });

    this.panel
      .querySelectorAll<HTMLButtonElement>("[data-toggle-additive]")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          const action = btn.dataset.toggleAdditive!;
          const cur = this.character?.getAdditiveWeight(action) ?? 0;
          const next = cur > 0.4 ? 0 : 1;
          this.character?.fadeAdditiveWeight(action, next, 0.35);
        });
      });

    const resetAdditiveBtn = this.panel.querySelector(
      ".anim-reset-additive-btn",
    );
    resetAdditiveBtn?.addEventListener("click", () => {
      this.character?.fadeAdditiveWeight(ADDITIVE_ACTION_SNEAK, 0, 0.3);
      this.character?.fadeAdditiveWeight(ADDITIVE_ACTION_SAD, 0, 0.3);
      this.character?.fadeAdditiveWeight(ADDITIVE_ACTION_AGREE, 0, 0.3);
      this.character?.fadeAdditiveWeight(ADDITIVE_ACTION_HEAD_SHAKE, 0, 0.3);
    });

    this.panel
      .querySelector<HTMLButtonElement>('[data-action="look"]')
      ?.addEventListener("click", () => {
        this.character?.clearLookTarget();
      });

    window.addEventListener("keydown", this.handleKeyDown);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (
      event.key.toLowerCase() === "b" &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }
      this.toggleVisibility();
    }
  };

  private toggleVisibility(forceState?: boolean): void {
    const isVisible =
      forceState !== undefined
        ? forceState
        : !this.panel.classList.contains("visible");
    if (isVisible) {
      this.panel.classList.add("visible");
      this.toggleBtn.classList.add("active");
    } else {
      this.panel.classList.remove("visible");
      this.toggleBtn.classList.remove("active");
    }
  }

  private beginCrossfade(target: "idle" | "walk" | "run"): void {
    if (!this.character) {
      return;
    }
    this.autoLocomotion = false;
    this.autoBtn.classList.remove("active");
    const current = this.character.getLocomotionBlendWeights();
    this.crossfadeStartWeights = { ...current };
    this.crossfadeTargetWeights = {
      idle: target === "idle" ? 1 : 0,
      walk: target === "walk" ? 1 : 0,
      run: target === "run" ? 1 : 0,
    };
    this.crossfadeTarget = target;
    this.crossfadeDuration = 0.5;
    this.crossfadeElapsed = 0;
  }
}