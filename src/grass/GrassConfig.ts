export interface GrassLodConfig {
  nearMaxDistance: number;
  midMaxDistance: number;
  farMaxDistance: number;
  hysteresisDistance: number;
  transitionDistance: number;
}

export interface GrassGeometryConfig {
  variantCount: number;
  bladesPerClump: number;
  bladeSegments: number;
  clumpRadius: number;
  bladeHeightMin: number;
  bladeHeightMax: number;
  bladeWidthMin: number;
  bladeWidthMax: number;
  bladeLeanMin: number;
  bladeLeanMax: number;
  /** Total turn of the blade's rest arc, in radians, from root to tip. */
  bladeCurve: number;
  midBladesPerClump: number;
  midBladeSegments: number;
  midRadiusScale: number;
  midHeightScale: number;
  midWidthScale: number;
  midLeanScale: number;
}

export interface GrassDistributionConfig {
  seed: number;
  rootSink: number;
  maxSlopeDegrees: number;
  heightVariation: number;
  widthVariation: number;
  densityMin: number;
  densityMax: number;
  densityScale: number;
}

export interface GrassWindConfig {
  directionX: number;
  directionZ: number;
  strength: number;
  gustScale: number;
  gustSpeed: number;
  flutterStrength: number;
  flutterSpeed: number;
}

export interface GrassMaterialConfig {
  baseColor: string;
  tipColor: string;
  dryColor: string;
  rootDarkening: number;
  normalUp: number;
  ambientBoost: number;
  backlightStrength: number;
}

export interface GrassQaConfig {
  warmupSeconds: number;
  sampleSeconds: number;
}

export interface GrassImpostorConfig {
  viewsPerAxis: number;
  frameResolution: number;
  padding: number;
  cameraMargin: number;
}

export interface GrassConfig {
  instanceCount: number;
  patchSize: number;
  geometry: GrassGeometryConfig;
  distribution: GrassDistributionConfig;
  wind: GrassWindConfig;
  material: GrassMaterialConfig;
  lod: GrassLodConfig;
  qa: GrassQaConfig;
  impostor: GrassImpostorConfig;
}
