import * as THREE from "three";
import { hudSettingsStore } from "../runtime/HudSettingsStore";
import type { WorldAudioVoices } from "./WorldAudioVoices";

const GESTURE_SELECTOR =
  ".world-loading-start, .world-loading-sound, [data-setting=sound]";

/** Owns browser audio permission and this world's live output buses. */
export class WorldAudioPermission {
  private allowed = false;
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

  update(): boolean {
    if (this.disposed) return false;
    this.syncContext();
    return this.applyOutputGains();
  }

  isAudible(): boolean {
    if (this.disposed) return false;
    const settings = hudSettingsStore.snapshot();
    return this.allowed && settings.soundEnabled && !document.hidden;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    document.removeEventListener("click", this.handleGesture);
    document.removeEventListener("change", this.handleGesture);
    document.removeEventListener("visibilitychange", this.handleVisibility);
    this.voices.setBusGain("ambient", 0);
    this.voices.setBusGain("effects", 0);
  }

  private applyOutputGains(): boolean {
    const settings = hudSettingsStore.snapshot();
    const audible = this.allowed && settings.soundEnabled && !document.hidden;
    const master = audible ? settings.masterVolume : 0;
    this.voices.setBusGain("ambient", master * settings.ambientVolume);
    this.voices.setBusGain("effects", master * settings.effectsVolume);
    return audible;
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
