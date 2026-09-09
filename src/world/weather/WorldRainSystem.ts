import * as THREE from "three";
import type { WorldExperience } from "../../app/WorldExperience";
import type { TerrainField } from "../TerrainField";
import { WorldWaterContactField } from "../hydrology/WorldWaterContactField";
import type { WorldWeatherState } from "./WorldWeatherState";
import { WorldRainGroundCache } from "./WorldRainGroundCache";
import { createWorldRainMaterial } from "./WorldRainNodes";
import { WorldRainUniforms } from "./WorldRainUniforms";
import {
  WORLD_RAIN_ACTIVE_THRESHOLD,
  WORLD_RAIN_RESPONSE_SECONDS,
  WORLD_WATER_CONTACT_CAPACITY_COMPACT,
  WORLD_WATER_CONTACT_CAPACITY_DESKTOP,
} from "./WorldRainTuning";
import { WorldWetness } from "./WorldWetness";

export interface WorldRainSystemOptions {
  readonly scene: THREE.Scene;
  readonly terrain: TerrainField;
  readonly weather: WorldWeatherState;
  readonly focus: () => THREE.Vector3;
  readonly capacity: number;
  readonly compact: boolean;
  readonly seed: number;
}

/** One pooled local rain volume and the precipitation state it drives. */
export class WorldRainSystem {
  readonly uniforms = new WorldRainUniforms();
  readonly wetness = new WorldWetness();
  readonly waterContacts: WorldWaterContactField;

  private readonly cache: WorldRainGroundCache;
  private readonly geometry: THREE.PlaneGeometry;
  private readonly material: ReturnType<typeof createWorldRainMaterial>;
  private readonly mesh: THREE.InstancedMesh;
  private intensity = 0;
  private disposed = false;

  constructor(private readonly options: WorldRainSystemOptions) {
    if (!Number.isInteger(options.capacity) || options.capacity < 1) {
      throw new Error("Rain capacity must be a positive integer.");
    }

    this.cache = new WorldRainGroundCache(options.terrain);
    this.waterContacts = new WorldWaterContactField(
      options.terrain,
      options.compact
        ? WORLD_WATER_CONTACT_CAPACITY_COMPACT
        : WORLD_WATER_CONTACT_CAPACITY_DESKTOP,
    );
    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.geometry.translate(0, -0.5, 0);
    this.material = createWorldRainMaterial({
      rain: this.uniforms,
      wind: options.weather.windUniforms,
      groundTexture: this.cache.texture,
      groundCenter: this.cache.center,
      seed: options.seed,
    });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, options.capacity);
    this.mesh.name = "world-rain";
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.userData.excludeFromReflection = true;
    this.mesh.userData.occlusionCull = false;
    options.scene.add(this.mesh);
  }

  update(deltaSeconds: number): void {
    if (this.disposed) return;
    const delta = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 0;
    const snapshot = this.options.weather.getSnapshot();
    this.uniforms.setTime(this.options.weather.getElapsedSeconds());
    this.uniforms.setWind(snapshot.windDirectionDegrees, snapshot.windIntensity);

    this.intensity = approachRainIntensity(this.intensity, snapshot.rainIntensity, delta);
    this.uniforms.setIntensity(this.intensity);
    this.wetness.setRainIntensity(this.intensity);
    this.wetness.update(delta);

    const active = this.intensity > WORLD_RAIN_ACTIVE_THRESHOLD ||
      snapshot.rainIntensity > WORLD_RAIN_ACTIVE_THRESHOLD;
    if (!active) {
      this.mesh.visible = false;
      this.mesh.count = 0;
      return;
    }

    const focus = this.options.focus();
    this.cache.update(focus);
    const visible = this.intensity > WORLD_RAIN_ACTIVE_THRESHOLD &&
      this.cache.isUsableFor(focus);
    this.mesh.visible = visible;
    this.mesh.count = visible ? resolveVisibleCount(this.options.capacity, this.intensity) : 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh.removeFromParent();
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.material.dispose();
    this.geometry.dispose();
    this.cache.dispose();
    this.waterContacts.clear();
    this.uniforms.setIntensity(0);
    this.wetness.reset();
  }
}

/** Constructs nothing when rain is disabled, has no weather owner, or has zero budget. */
export function attachWorldRain(
  experience: WorldExperience,
  options: Omit<WorldRainSystemOptions, "capacity">,
): WorldRainSystem | undefined {
  if (!options.weather || experience.budgets.rainCount < 1) return undefined;
  let rain: WorldRainSystem | undefined;
  experience.attach("rain", () => {
    rain = new WorldRainSystem({ ...options, capacity: experience.budgets.rainCount });
    return rain;
  });
  return rain;
}

export function approachRainIntensity(current: number, target: number, deltaSeconds: number): number {
  const from = clamp01(current);
  const to = clamp01(target);
  if (!(deltaSeconds > 0) || from === to) return from;
  const alpha = 1 - Math.exp(-deltaSeconds / WORLD_RAIN_RESPONSE_SECONDS);
  const next = from + (to - from) * alpha;
  return Math.abs(next - to) < 1e-6 ? to : next;
}

function resolveVisibleCount(capacity: number, intensity: number): number {
  const amount = Math.sqrt(clamp01(intensity));
  return Math.max(1, Math.min(capacity, Math.ceil(capacity * amount)));
}

function clamp01(value: number): number {
  const numeric = Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(1, numeric));
}
