import {
  ClampToEdgeWrapping, HalfFloatType, LinearFilter, MeshBasicNodeMaterial, NoColorSpace,
  QuadMesh, RGBAFormat, RenderTarget, UnsignedByteType, type Texture, type Vector4,
  type TextureDataType, type WebGPURenderer,
} from "three/webgpu";
import type { IUniform } from "three";
import { reference, texture, uniformArray, uv } from "three/tsl";
import { renderNodePass } from "../../render/RenderNodePass";
import { disposeResources } from "../../render/ResourceDisposal";
import type { RendererCapabilities } from "../../render/RendererCapabilities";
import type { GrassTrailBackend } from "./GrassTrailField";
import { grassTrailUpdateNode } from "./GrassTrailNodes";

function createTarget(size: number, type: TextureDataType): RenderTarget {
  const target = new RenderTarget(size, size, {
    format: RGBAFormat, type, minFilter: LinearFilter, magFilter: LinearFilter,
    wrapS: ClampToEdgeWrapping, wrapT: ClampToEdgeWrapping,
    depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
  });
  target.texture.colorSpace = NoColorSpace;
  return target;
}

/**
 * The portable trail feedback pass.
 *
 * It owns only GPU resources: the covered square's centre, the contact list,
 * the 30 Hz accumulation and the ping-pong index all stay with
 * `GrassTrailField`, and the update reads that field's own uniform objects, so
 * one owner drives whichever renderer is attached.
 *
 * Half float where the backend can render it, bytes otherwise — the same policy
 * the legacy pass applies through the WebGL extension probe. The decay is a
 * feedback loop over the previous frame, and eight bits per channel is coarse
 * enough that a slow decay rounds to no change at all.
 */
export function createGrassTrailNodePass(renderer: WebGPURenderer,
  capabilities: RendererCapabilities, uniforms: Record<string, IUniform>,
  size: number): GrassTrailBackend {
  const type = capabilities.colorTargetHalfFloat ? HalfFloatType : UnsignedByteType;
  const targets: RenderTarget[] = [];
  let material: MeshBasicNodeMaterial | undefined;
  let quad: QuadMesh | undefined;
  try {
    // Pushed one at a time: constructed as a pair, a throw from the second
    // would leave the first outside the array the rollback below disposes.
    targets.push(createTarget(size, type));
    targets.push(createTarget(size, type));
    const previous = texture(targets[0].texture);
    material = new MeshBasicNodeMaterial({ depthTest: false, depthWrite: false, toneMapped: false });
    material.name = "grass-trail-node-update";
    material.fragmentNode = grassTrailUpdateNode({
      // Three's full-screen quad carries v increasing downwards, the opposite
      // of the convention every material samples this field with. Writing at
      // the raw quad coordinate would store the trail mirrored, so the blades
      // would bend on the wrong side of the character.
      // The quad's own coordinate is used for both the write and the
      // reprojection read. Three normalizes render-target sampling across the
      // backends, so a pass that writes at `uv()` and samples at `uv()` is
      // consistent with every material that samples the finished field — an
      // end-to-end probe in the trail check holds that, because raw row order
      // agreeing with the WebGL reference does not imply it.
      squareUv: uv(),
      toTextureUv: coordinate => coordinate,
      previous,
      center: reference("value", "vec2", uniforms.uCenter),
      previousCenter: reference("value", "vec2", uniforms.uPreviousCenter),
      coverage: reference("value", "float", uniforms.uCoverage),
      initialize: reference("value", "float", uniforms.uInitialize),
      delta: reference("value", "float", uniforms.uDelta),
      recoveryRate: reference("value", "float", uniforms.uRecoveryRate),
      recoveryFloor: reference("value", "float", uniforms.uRecoveryFloor),
      freshnessRate: reference("value", "float", uniforms.uFreshnessRate),
      contactCount: reference("value", "float", uniforms.uContactCount),
      contacts: uniformArray<"vec4">(uniforms.uContacts.value as Vector4[], "vec4"),
      contactShapes: uniformArray<"vec4">(uniforms.uContactShapes.value as Vector4[], "vec4"),
    });
    quad = new QuadMesh(material);
    return {
      precise: type === HalfFloatType,
      texture(index: number): Texture {
        return targets[index].texture;
      },
      render(readIndex: number, writeIndex: number): void {
        // The read target is bound through the material's own texture node, so
        // the ping-pong index stays the field's decision rather than a second
        // copy of it here.
        previous.value = targets[readIndex].texture;
        renderNodePass(renderer, targets[writeIndex], quad!);
      },
      dispose(): void {
        // QuadMesh owns no disposable of its own; its material and the targets
        // are what hold GPU memory.
        disposeResources([material, ...targets]);
      },
    };
  } catch (error) {
    disposeResources([material, ...targets]);
    throw error;
  }
}
