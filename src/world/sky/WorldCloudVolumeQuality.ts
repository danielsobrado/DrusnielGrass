import type * as THREE from "three";
import type { RuntimeProfile } from "../../runtime/RuntimeConfig";

const MEDIUM_MAX_HARDWARE_CONCURRENCY = 6;
const MEDIUM_MAX_TEXTURE_SIZE = 8192;
const MEDIUM_MAX_RESOLUTION_SCALE = 0.35;
const MEDIUM_MAX_STEPS = 8;

export type WorldCloudVolumeTier = "desktop" | "medium" | "mobile";

export interface WorldCloudVolumeQuality {
  enabled: boolean;
  tier: WorldCloudVolumeTier;
  resolutionScale: number;
  steps: number;
}

export function resolveWorldCloudVolumeQuality(
  profile: RuntimeProfile,
  renderer: THREE.WebGLRenderer,
): WorldCloudVolumeQuality {
  const cloud = profile.cloud;
  if (profile.compact || !cloud.enabled || !cloud.volumetricEnabled) {
    return {
      enabled: false,
      tier: "mobile",
      resolutionScale: cloud.volumetricResolutionScale,
      steps: cloud.volumetricSteps,
    };
  }

  const hardwareConcurrency = Math.max(1, navigator.hardwareConcurrency || 1);
  const medium =
    hardwareConcurrency <= MEDIUM_MAX_HARDWARE_CONCURRENCY ||
    renderer.capabilities.maxTextureSize <= MEDIUM_MAX_TEXTURE_SIZE;
  if (medium) {
    return {
      enabled: true,
      tier: "medium",
      resolutionScale: Math.min(
        cloud.volumetricResolutionScale,
        MEDIUM_MAX_RESOLUTION_SCALE,
      ),
      steps: Math.min(cloud.volumetricSteps, MEDIUM_MAX_STEPS),
    };
  }

  return {
    enabled: true,
    tier: "desktop",
    resolutionScale: cloud.volumetricResolutionScale,
    steps: cloud.volumetricSteps,
  };
}
