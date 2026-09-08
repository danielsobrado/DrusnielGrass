import type { WeatherPresetId } from "../experience/WorldExperienceCatalog";

export interface WorldSourceLightingPreset {
  readonly color: string;
  readonly directionalIntensity: number;
  readonly position: readonly [number, number, number];
  readonly hemisphereSkyColor: string;
  readonly hemisphereGroundColor: string;
  readonly hemisphereIntensity: number;
  readonly ambientColor: string;
  readonly ambientIntensity: number;
  readonly environmentIntensity: number;
}

export interface WorldSourceSkyPreset {
  readonly horizonColor: string;
  readonly zenithColor: string;
  readonly sunHaloColor: string;
  readonly sunDiskColor: string;
  readonly haloPower: number;
  readonly diskPower: number;
  readonly fogColor: string;
  readonly fogDensity: number;
}

export interface WorldSourceGrassPreset {
  readonly baseColor: string;
  readonly tipColor: string;
  readonly windDirection: number;
  readonly windNoiseScale: number;
  readonly simulationSpeed: number;
  readonly baseBend: number;
}

export interface WorldEnvironmentPresetReference {
  readonly id: Exclude<WeatherPresetId, "drusniel">;
  readonly label: string;
  readonly lighting: WorldSourceLightingPreset;
  readonly sky: WorldSourceSkyPreset;
  readonly grass: WorldSourceGrassPreset;
  /** Artistic target from T03, not the source threshold convention. */
  readonly cloudCoverageTarget: number;
  readonly windGain: number;
  readonly rainIntensity: number;
}

/**
 * Source values captured from grass-test and converted only by the resolver.
 * Keeping these immutable prevents destination tuning from erasing the reference.
 */
export const WORLD_SOURCE_ENVIRONMENT_PRESETS = Object.freeze({
  sunny: Object.freeze({
    id: "sunny",
    label: "Highfield",
    lighting: Object.freeze({ color: "#ffd27a", directionalIntensity: 5,
      position: [0, 30, 45] as const, hemisphereSkyColor: "#8fcaff",
      hemisphereGroundColor: "#51402a", hemisphereIntensity: 0.38,
      ambientColor: "#fff0c4", ambientIntensity: 0.55, environmentIntensity: 0.32 }),
    sky: Object.freeze({ horizonColor: "#91d5ff", zenithColor: "#4174d9",
      sunHaloColor: "#ffd77d", sunDiskColor: "#fff9dc", haloPower: 100,
      diskPower: 10000, fogColor: "#a8cbd0", fogDensity: 0.005 }),
    grass: Object.freeze({ baseColor: "#304f0b", tipColor: "#74a116",
      windDirection: 0, windNoiseScale: 0.3, simulationSpeed: 1, baseBend: 0 }),
    cloudCoverageTarget: 0.35,
    windGain: 1,
    rainIntensity: 0,
  }),
  goldenHour: Object.freeze({
    id: "goldenHour",
    label: "Emberfall",
    lighting: Object.freeze({ color: "#fff0c9", directionalIntensity: 2.8,
      position: [-28, 65, -30] as const, hemisphereSkyColor: "#b6def1",
      hemisphereGroundColor: "#78945d", hemisphereIntensity: 1.35,
      ambientColor: "#dceac5", ambientIntensity: 0.32, environmentIntensity: 0.65 }),
    sky: Object.freeze({ horizonColor: "#c5e7df", zenithColor: "#438ec5",
      sunHaloColor: "#ffe8ad", sunDiskColor: "#fff0c0", haloPower: 20,
      diskPower: 5800, fogColor: "#a5ced3", fogDensity: 0.0015 }),
    grass: Object.freeze({ baseColor: "#50852b", tipColor: "#a6bf65",
      windDirection: 45, windNoiseScale: 0.38, simulationSpeed: 0.95, baseBend: 0.1 }),
    cloudCoverageTarget: 0.30,
    windGain: 0.625,
    rainIntensity: 0,
  }),
  rainy: Object.freeze({
    id: "rainy",
    label: "Greyrain",
    lighting: Object.freeze({ color: "#9bc7d7", directionalIntensity: 1,
      position: [-20, 35, 20] as const, hemisphereSkyColor: "#719fae",
      hemisphereGroundColor: "#202f2b", hemisphereIntensity: 0.38,
      ambientColor: "#719ca8", ambientIntensity: 0.65, environmentIntensity: 0.2 }),
    sky: Object.freeze({ horizonColor: "#83b5bd", zenithColor: "#263f50",
      sunHaloColor: "#9fbfc2", sunDiskColor: "#d2e3df", haloPower: 8,
      diskPower: 500, fogColor: "#83aeb4", fogDensity: 0.007 }),
    grass: Object.freeze({ baseColor: "#193f20", tipColor: "#4f9b35",
      windDirection: 0, windNoiseScale: 0.3, simulationSpeed: 1.05, baseBend: 0.16 }),
    cloudCoverageTarget: 0.92,
    windGain: 0.833333,
    rainIntensity: 1,
  }),
  windy: Object.freeze({
    id: "windy",
    label: "Galewind",
    lighting: Object.freeze({ color: "#ffd990", directionalIntensity: 3,
      position: [-20, 35, 50] as const, hemisphereSkyColor: "#91cbea",
      hemisphereGroundColor: "#4a3d28", hemisphereIntensity: 0.34,
      ambientColor: "#dceee8", ambientIntensity: 0.12, environmentIntensity: 0.3 }),
    sky: Object.freeze({ horizonColor: "#91d0e8", zenithColor: "#316fc5",
      sunHaloColor: "#ffd58b", sunDiskColor: "#fffbe5", haloPower: 26,
      diskPower: 5400, fogColor: "#a6c8cf", fogDensity: 0.005 }),
    grass: Object.freeze({ baseColor: "#304f0b", tipColor: "#86b91a",
      windDirection: 75, windNoiseScale: 0.3, simulationSpeed: 1.08, baseBend: 0.18 }),
    cloudCoverageTarget: 0.50,
    windGain: 1.166667,
    rainIntensity: 0,
  }),
  calm: Object.freeze({
    id: "calm",
    label: "Stillmeadow",
    lighting: Object.freeze({ color: "#ffd995", directionalIntensity: 3,
      position: [10, 40, 20] as const, hemisphereSkyColor: "#afd5ec",
      hemisphereGroundColor: "#5c4b31", hemisphereIntensity: 0.32,
      ambientColor: "#f4e4c0", ambientIntensity: 0.2, environmentIntensity: 0.31 }),
    sky: Object.freeze({ horizonColor: "#b8dce1", zenithColor: "#6289b8",
      sunHaloColor: "#f5d18f", sunDiskColor: "#fff7dc", haloPower: 23,
      diskPower: 5000, fogColor: "#b7cfd0", fogDensity: 0.005 }),
    grass: Object.freeze({ baseColor: "#304f0b", tipColor: "#86b91a",
      windDirection: 0, windNoiseScale: 0.15, simulationSpeed: 0.98, baseBend: 0.2 }),
    cloudCoverageTarget: 0.25,
    windGain: 0.270833,
    rainIntensity: 0,
  }),
  bowed: Object.freeze({
    id: "bowed",
    label: "Lowsway",
    lighting: Object.freeze({ color: "#ffd27a", directionalIntensity: 3.2,
      position: [0, 20, 45] as const, hemisphereSkyColor: "#8fcaff",
      hemisphereGroundColor: "#51402a", hemisphereIntensity: 0.38,
      ambientColor: "#fff0c4", ambientIntensity: 0.55, environmentIntensity: 0.32 }),
    sky: Object.freeze({ horizonColor: "#91d5ff", zenithColor: "#2864d8",
      sunHaloColor: "#ffd77d", sunDiskColor: "#fff9dc", haloPower: 28,
      diskPower: 5500, fogColor: "#a8cbd0", fogDensity: 0.005 }),
    grass: Object.freeze({ baseColor: "#304f0b", tipColor: "#86b91a",
      windDirection: 1, windNoiseScale: 1, simulationSpeed: 0.8, baseBend: 0.9 }),
    cloudCoverageTarget: 0.30,
    windGain: 0.25,
    rainIntensity: 0,
  }),
  moonlight: Object.freeze({
    id: "moonlight",
    label: "Moonrise",
    lighting: Object.freeze({ color: "#8eafff", directionalIntensity: 1.6,
      position: [-35, 20, 30] as const, hemisphereSkyColor: "#405f8e",
      hemisphereGroundColor: "#151c1b", hemisphereIntensity: 0.2,
      ambientColor: "#7895c4", ambientIntensity: 0.55, environmentIntensity: 0.1 }),
    sky: Object.freeze({ horizonColor: "#526f8c", zenithColor: "#050b1c",
      sunHaloColor: "#9fc9ff", sunDiskColor: "#ffffff", haloPower: 500,
      diskPower: 12000, fogColor: "#263d52", fogDensity: 0.005 }),
    grass: Object.freeze({ baseColor: "#24451d", tipColor: "#65904b",
      windDirection: 20, windNoiseScale: 0.3, simulationSpeed: 0.92, baseBend: 0.08 }),
    cloudCoverageTarget: 0.20,
    windGain: 0.333333,
    rainIntensity: 0,
  }),
} satisfies Record<Exclude<WeatherPresetId, "drusniel">, WorldEnvironmentPresetReference>);
