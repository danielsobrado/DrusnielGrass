import { DataTexture, DepthTexture, LinearFilter, RGBAFormat, UnsignedByteType, UnsignedIntType,
  type Texture, type TextureNode } from "three/webgpu";
import type { IUniform } from "three";
import { texture } from "three/tsl";

export interface UniformTexture {
  readonly node: TextureNode;
  /** Follows the uniform; call once per frame where the value can change. */
  sync(): void;
  dispose(): void;
}

/**
 * A sampler bound to a uniform that may be empty or swapped per frame.
 *
 * A texture node needs a texture at build time, and several of this project's
 * samplers — the grass trail's ping-pong target, the water's refraction
 * capture, the wind field — are null until their owner exists. Colour samplers
 * use a transparent black texel; depth samplers need a typed depth placeholder.
 * The material's strength or size uniform gates sampling while empty. Callers
 * must keep the sampler's texture kind consistent throughout its lifetime.
 */
export function createUniformTexture(source: IUniform, depth = false): UniformTexture {
  let placeholder: Texture | undefined;
  let disposed = false;
  const resolve = (): Texture => {
    if (source.value) return source.value as Texture;
    if (!placeholder) {
      // WebGPU compiles depth and colour samplers into different binding
      // layouts. Preserve the kind even before the first capture exists.
      placeholder = depth ? new DepthTexture(1, 1, UnsignedIntType)
        : new DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, RGBAFormat, UnsignedByteType);
      // Nearest-only placeholders compile to textureLoad on WebGPU, which
      // would keep ignoring filtering after a linear-filtered capture arrives.
      if (!depth) placeholder.minFilter = placeholder.magFilter = LinearFilter;
      placeholder.needsUpdate = true;
    }
    return placeholder;
  };
  const node = texture(resolve());
  return {
    node,
    sync(): void {
      if (disposed) return;
      const current = resolve();
      if (node.value !== current) node.value = current;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      placeholder?.dispose();
      placeholder = undefined;
    },
  };
}
