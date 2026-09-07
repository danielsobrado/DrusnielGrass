import { RGBAFormat, UnsignedByteType, type RenderTarget, type WebGPURenderer } from "three/webgpu";

/** r185 WebGPU returns aligned rows; WebGL returns tightly packed rows.
 * Preserve the backend's row orientation and strip padding explicitly.
 */
export async function readRenderTargetRgba8(renderer: Pick<WebGPURenderer, "readRenderTargetPixelsAsync">,
  target: RenderTarget, width = target.width, height = target.height): Promise<Uint8Array> {
  if (target.texture.format !== RGBAFormat || target.texture.type !== UnsignedByteType) {
    throw new Error("RGBA8 readback requires an RGBA unsigned-byte render target.");
  }
  const raw = await renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height);
  if (!(raw instanceof Uint8Array)) throw new Error("RGBA8 readback returned an unexpected array type.");
  const rowBytes = width * 4;
  if (raw.length === rowBytes * height) return raw;
  const stride = height > 1 ? (raw.length - rowBytes) / (height - 1) : rowBytes;
  if (!Number.isInteger(stride) || stride < rowBytes || raw.length < rowBytes) {
    throw new Error("Unexpected renderer readback row layout.");
  }
  const packed = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y++) packed.set(raw.subarray(y * stride, y * stride + rowBytes), y * rowBytes);
  return packed;
}
