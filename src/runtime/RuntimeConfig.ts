export interface RuntimeCloudConfig {
  enabled: boolean;
  coverage: number;
  softness: number;
  opacity: number;
  baseHeight: number;
  thickness: number;
  extinction: number;
  macroScale: number;
  detailScale: number;
  weatherScale: number;
  windX: number;
  windZ: number;
  detailWindX: number;
  detailWindZ: number;
  selfShadowStrength: number;
  silverLiningStrength: number;
  shadowStrength: number;
  shadowSampleRadius: number;
  shadowMapResolution: number;
  shadowWorldSize: number;
  shadowSteps: number;
  shadowEdgeFade: number;
  shadowDistanceFadeStart: number;
  shadowDistanceFadeEnd: number;
  minimumDirectTransmittance: number;
  lightResponseRate: number;
  weatherGradeStrength: number;
  volumetricEnabled: boolean;
  volumetricResolutionScale: number;
  volumetricSteps: number;
  temporalBlend: number;
  godRays: boolean;
  godRayStrength: number;
  ambientColor: string;
  shadowColor: string;
  sunlitColor: string;
}

export interface RuntimeTierConfig {
  cameraFov: number;
  cameraMargin: number;
  cameraElevation: number;
  maxPixelRatio: number;
  autoRotate: boolean;
  shadows: boolean;
  shadowMapSize: number;
  showGui: boolean;
  showDecorativeText: boolean;
  cloud: RuntimeCloudConfig;
}

export interface RuntimeConfig {
  compactMaxWidth: number;
  desktop: RuntimeTierConfig;
  compact: RuntimeTierConfig;
}

export interface RuntimeProfile extends RuntimeTierConfig {
  compact: boolean;
}
