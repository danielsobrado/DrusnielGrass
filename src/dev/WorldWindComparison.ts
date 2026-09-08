import {
  Color, Mesh, MeshBasicNodeMaterial, OrthographicCamera, PlaneGeometry, RenderTarget,
  Scene, WebGPUCoordinateSystem, type WebGPURenderer,
} from "three/webgpu";
import { float, uniform, uv, vec2, vec4 } from "three/tsl";
import { createWorldWindFieldNodes } from "../world/weather/WorldWindNodes";
import { sampleWorldWind } from "../world/weather/WorldWindMath";
import { readRenderTargetRgba8 } from "../render/RenderTargetReadback";
import { disposeResources } from "../render/ResourceDisposal";

/**
 * Measures the GPU wind field against the CPU one at the same points.
 *
 * The two halves of the model are written twice, once in TypeScript and once in
 * TSL, and nothing but a measurement can say they agree. The gradient hash is
 * `fract(sin(dot(...)) * 43758.5453)`, which is exactly the kind of expression
 * that can diverge between a double-precision CPU and a single-precision GPU,
 * so this is the check that decides whether the shared field is real or two
 * fields that merely resemble each other.
 *
 * The field is rendered over a grid of world points and read back as bytes. A
 * value is encoded as `value * 0.5 + 0.5` where it is signed, so one RGBA8 step
 * is 1/255 of the encoded range; the caller's tolerance accounts for that.
 */

/** World metres spanned by the sampled grid, centred on the origin. */
const GRID_EXTENT = 512;

export type WorldWindChannel = "gust" | "strength" | "turbulence" | "direction";

export async function compareWorldWind(renderer: WebGPURenderer,
  channel: WorldWindChannel, time: number, directionDegrees: number) {
  const width = 64, height = 64;
  const timeUniform = uniform(time);
  const directionUniform = uniform(directionDegrees);
  const intensityUniform = uniform(1);
  const noiseScaleUniform = uniform(1);

  // The grid maps uv to world metres; the same mapping is used on both sides.
  const worldXZ = uv().sub(0.5).mul(GRID_EXTENT * 2);
  const field = createWorldWindFieldNodes({
    positionXZ: vec2(worldXZ.x, worldXZ.y),
    time: timeUniform,
    directionDegrees: directionUniform,
    intensity: intensityUniform,
    noiseScale: noiseScaleUniform,
  });

  const material = new MeshBasicNodeMaterial({ toneMapped: false });
  material.outputNode = channel === "gust"
    // Already in [0, 1].
    ? vec4(field.gust, field.gust, field.gust, 1)
    : channel === "strength"
      // The envelope is bounded by minStrength/maxStrength; scaled into the
      // byte range by its own maximum so the comparison uses the whole range.
      ? vec4(field.strength.div(1.25), field.strength.div(1.25), field.strength.div(1.25), 1)
      : channel === "turbulence"
        ? vec4(field.turbulence.mul(0.5).add(0.5), field.turbulence.mul(0.5).add(0.5),
          field.turbulence.mul(0.5).add(0.5), 1)
        : vec4(field.direction.x.mul(0.5).add(0.5), field.direction.y.mul(0.5).add(0.5),
          float(0), 1);

  const scene = new Scene();
  scene.background = new Color(0);
  const geometry = new PlaneGeometry(2, 2);
  const mesh = new Mesh(geometry, material);
  scene.add(mesh);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const target = new RenderTarget(width, height);
  const previous = renderer.getRenderTarget();
  try {
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    const pixels = await readRenderTargetRgba8(renderer, target);
    const flip = renderer.coordinateSystem === WebGPUCoordinateSystem;

    let maximum = 0;
    let total = 0;
    let samples = 0;
    for (let row = 0; row < height; row++) {
      for (let column = 0; column < width; column++) {
        // Pixel centres, so the CPU samples exactly where the GPU did.
        const u = (column + 0.5) / width;
        const v = (row + 0.5) / height;
        const worldX = (u - 0.5) * GRID_EXTENT * 2;
        const worldZ = (v - 0.5) * GRID_EXTENT * 2;
        const cpu = sampleWorldWind({ x: worldX, z: worldZ, time, directionDegrees });
        const offset = ((flip ? height - row - 1 : row) * width + column) * 4;
        const encoded = channel === "gust" ? [cpu.gust]
          : channel === "strength" ? [cpu.strength / 1.25]
            : channel === "turbulence" ? [cpu.turbulence * 0.5 + 0.5]
              : [cpu.directionX * 0.5 + 0.5, cpu.directionZ * 0.5 + 0.5];
        for (let index = 0; index < encoded.length; index++) {
          const actual = pixels[offset + index] / 255;
          const delta = Math.abs(actual - Math.min(1, Math.max(0, encoded[index])));
          maximum = Math.max(maximum, delta);
          total += delta;
          samples++;
        }
      }
    }
    return {
      channel, time, directionDegrees, width, height,
      maximum, mean: total / samples, samples, flippedRows: flip,
    };
  } finally {
    renderer.setRenderTarget(previous);
    disposeResources([material, geometry, target]);
  }
}
