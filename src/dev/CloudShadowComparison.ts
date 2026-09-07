import { Vector3, WebGPUCoordinateSystem, type WebGPURenderer } from "three/webgpu";
import { WebGLRenderer } from "three";
import type { RuntimeProfile } from "../runtime/RuntimeConfig";
import type { RendererCapabilities } from "../render/RendererCapabilities";
import { WorldCloudShadowMap } from "../world/sky/WorldCloudShadowMap";
import { WorldCloudShadowNodeMap } from "../world/sky/WorldCloudShadowNodeMap";
import { disposeResources } from "../render/ResourceDisposal";

export async function compareCloudShadows(renderer: WebGPURenderer, profile: RuntimeProfile, capabilities: RendererCapabilities) {
  const resolution = 96;
  const matched = { ...profile, cloud: { ...profile.cloud, shadowMapResolution: resolution } };
  const legacy = new WebGLRenderer();
  const original = new WorldCloudShadowMap(legacy, matched);
  const node = new WorldCloudShadowNodeMap(renderer, matched, capabilities);
  try {
    const focus = new Vector3(-713, 42, 539);
    original.update(focus, 120); node.update(focus, 120);
    const pixels = new Uint8Array(resolution * resolution * 4), expected = new Uint8Array(pixels.length);
    if (!original.readDebugPixels(expected) || !await node.readDebugPixels(pixels)) throw new Error("Cloud shadow comparison readback failed.");
    // Shadow maps are world-XZ data, not camera images. Account for native row
    // order when comparing these rasters, independently of scene screenshots.
    const flip = renderer.coordinateSystem !== WebGPUCoordinateSystem;
    let maximum = 0, total = 0;
    for (let y = 0; y < resolution; y++) for (let x = 0; x < resolution; x++) for (let c = 0; c < 4; c++) {
      const delta = Math.abs(pixels[(y * resolution + x) * 4 + c] - expected[((flip ? resolution - y - 1 : y) * resolution + x) * 4 + c]);
      maximum = Math.max(maximum, delta); total += delta;
    }
    const actual = node.getDiagnostics(), reference = original.getDiagnostics();
    return { resolution, maximum, mean: total / pixels.length, flippedRows: flip,
      focusDifference: Math.abs(actual.focusTransmittance - reference.focusTransmittance),
      originDifference: Math.hypot(actual.originX - reference.originX, actual.originZ - reference.originZ) };
  } finally { disposeResources([node, original, legacy]); }
}
