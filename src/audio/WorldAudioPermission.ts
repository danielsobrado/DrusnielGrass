import * as THREE from "three";
import { hudSettingsStore } from "../runtime/HudSettingsStore";
import type { WorldAudioVoices } from "./WorldAudioVoices";

const GESTURE_SELECTOR =
  ".world-loading-start, .world-loading-sound, [data-setting=sound]";

// Browser activation belongs to this page session, not to one renderer/world
// instance. Device recovery must not require the user to unlock audio again.
let sessionAudioUnlocked = false;

/** Owns browser audio permission and this world's live output buses. */
export class WorldAudioPermission {
  private allowed = sessionAudioUnlocked;
  private ambientAudible = false;
  private effectsAudible = false;
  private resumeInFlight = false;
  private resumeBlocked = false;
  private resumeFailureReported = false;
  private disposed = false;

  constructor(
    private readonly listener: THREE.AudioListener,
    private readonly voices: WorldAudioVoices,
  ) {
    document.addEventListener("click", this.handleGesture);
    document.addEventListener("change", this.handleGesture);
    document.addEventListener("visibilitychange", this.handleVisibility);
    this.applyOutputGains();
  }

  update(): void {
    if (this.disposed) return;
    this.syncContext();
    this.applyOutputGains();
  }

  isAmbientAudible(): boolean {
    return !this.disposed && this.ambientAudible;
  }

  isEffectsAudible(): boolean {
    return !this.disposed && this.effectsAudible;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    document.removeEventListener("click", this.handleGesture);
    document.removeEventListener("change", this.handleGesture);
    document.removeEventListener("visibilitychange", this.handleVisibility);
    this.ambientAudible = false;
    this.effectsAudible = false;
    this.voices.setBusGain("ambient", 0);
    this.voices.setBusGain("effects", 0);
  }

  private applyOutputGains(): void {
    const settings = hudSettingsStore.snapshot();
    const audible = this.isAllowed(settings.soundEnabled);
    const master = audible ? settings.masterVolume : 0;
    const ambientGain = master * settings.ambientVolume;
    const effectsGain = master * settings.effectsVolume;
    this.ambientAudible = ambientGain > 0;
    this.effectsAudible = effectsGain > 0;
    this.voices.setBusGain("ambient", ambientGain);
    this.voices.setBusGain("effects", effectsGain);
  }

  private isAllowed(soundEnabled: boolean): boolean {
    return this.allowed && soundEnabled && !document.hidden;
  }

  private syncContext(): void {
    const context = this.listener.context;
    if (
      document.hidden ||
      !this.allowed ||
      !hudSettingsStore.getSoundEnabled() ||
      context.state !== "suspended" ||
      this.resumeInFlight ||
      this.resumeBlocked
    ) {
      return;
    }
    this.resumeInFlight = true;
    void context.resume().then(() => {
      this.resumeBlocked = false;
      this.resumeFailureReported = false;
    }).catch((error) => {
      this.resumeBlocked = true;
      if (!this.resumeFailureReported) {
        this.resumeFailureReported = true;
        console.warn("[Drusniel World] Audio resume was rejected.", error);
      }
    }).finally(() => {
      this.resumeInFlight = false;
    });
  }

  private readonly handleGesture = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest(GESTURE_SELECTOR)) return;

    sessionAudioUnlocked = true;
    if (target.closest(".world-loading-sound")) {
      const input = target.closest("label")?.querySelector<HTMLInputElement>(
        'input[type="checkbox"]',
      );
      if (input && !input.checked) {
        this.allowed = false;
        this.applyOutputGains();
        return;
      }
    }

    this.allowed = true;
    this.resumeBlocked = false;
    this.applyOutputGains();
    this.syncContext();
  };

  private readonly handleVisibility = (): void => {
    if (!document.hidden) this.resumeBlocked = false;
    this.applyOutputGains();
    this.syncContext();
  };
}
