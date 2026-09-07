import { Color, MeshBasicNodeMaterial, QuadMesh, RenderTarget, WebGPUCoordinateSystem, type WebGPURenderer } from "three/webgpu";
import { uniform, uv, vec4 } from "three/tsl";
import { grassResolvePaletteNode } from "../grass/materials/GrassPaletteNodes";
import { resolveGrassPaletteColor, setBalancedGrassPaletteColors } from "../grass/materials/GrassPaletteShader";
import { readRenderTargetRgba8 } from "../render/RenderTargetReadback";
import { renderNodePass } from "../render/RenderNodePass";
import { disposeResources } from "../render/ResourceDisposal";

export async function compareGrassPalette(renderer: WebGPURenderer) {
  const width = 64, height = 64;
  const base = new Color(), tip = new Color(), dry = new Color();
  setBalancedGrassPaletteColors(base, tip, dry, "#2f7c35", "#91dc63", "#83a653");
  const material = new MeshBasicNodeMaterial({ depthTest: false, depthWrite: false, toneMapped: false });
  const u = uv();
  material.fragmentNode = vec4(grassResolvePaletteNode(uniform(base).rgb, uniform(tip).rgb, uniform(dry).rgb,
    u.x, u.y, u.x.mul(u.y), u.y.mul(0.4).add(0.6), u.x.mul(0.2).add(0.2), u.y.mul(0.2).add(0.35)), 1);
  const target = new RenderTarget(width, height, { depthBuffer: false });
  try {
    renderNodePass(renderer, target, new QuadMesh(material));
    const pixels = await readRenderTargetRgba8(renderer, target);
    const expected = new Color();
    let maximum = 0, total = 0;
    const flip = renderer.coordinateSystem !== WebGPUCoordinateSystem;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const progress = (x + 0.5) / width, shade = (y + 0.5) / height;
      resolveGrassPaletteColor(expected, base, tip, dry, progress, shade, progress * shade,
        shade * 0.4 + 0.6, progress * 0.2 + 0.2, shade * 0.2 + 0.35);
      const values = [expected.r, expected.g, expected.b];
      for (let c = 0; c < 3; c++) {
        const quantized = Math.round(Math.max(0, Math.min(1, values[c])) * 255);
        const delta = Math.abs(pixels[((flip ? height - y - 1 : y) * width + x) * 4 + c] - quantized);
        maximum = Math.max(maximum, delta); total += delta;
      }
    }
    return { width, height, maximum, mean: total / (width * height * 3), flippedRows: flip };
  } finally { disposeResources([material, target]); }
}
