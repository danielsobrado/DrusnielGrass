import {
  MeshBasicNodeMaterial, QuadMesh, RenderTarget, WebGPUCoordinateSystem, type Texture,
  type WebGPURenderer,
} from "three/webgpu";
import {
  Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, WebGLRenderer, WebGLRenderTarget,
} from "three";
import { texture as textureNode, uv, vec2, vec3, vec4 } from "three/tsl";
import { grassTrailField } from "../grass/interaction/GrassTrailField";
import { createGrassTrailNodePass } from "../grass/interaction/GrassTrailNodePass";
import { readRendererCapabilities } from "../render/RendererCapabilities";
import { readRenderTargetRgba8 } from "../render/RenderTargetReadback";
import { renderNodePass } from "../render/RenderNodePass";
import { disposeResources } from "../render/ResourceDisposal";

const RESOLUTION = 64;
const COVERAGE = 8;
const STEP_SECONDS = 1 / 30 + 1e-4;

/**
 * A scripted walk across the covered square.
 *
 * The focus scrolls, so texels enter and leave the square and the reprojection
 * is exercised; two feet, a body and a landing ring are submitted with
 * different radii, strengths and inner fractions, so the disc, the ring and the
 * directional blend all run; and several steps carry no contact at all, so the
 * exponential decay and the linear recovery floor are what the field is left
 * with.
 */
function driveField(steps: number, scroll = true): void {
  for (let step = 0; step < steps; step++) {
    const progress = step / steps;
    const focusX = scroll ? -2.5 + progress * 5 : 0;
    const focusZ = scroll ? -1.5 + Math.sin(progress * 4.1) * 1.2 : 0;
    grassTrailField.setFocus(focusX, focusZ);
    if (step % 4 !== 3) {
      grassTrailField.submitContact(focusX + 0.18, focusZ, 0.34, 0.9,
        Math.cos(progress * 3.3), Math.sin(progress * 3.3), 0, 0.35);
      grassTrailField.submitContact(focusX - 0.2, focusZ - 0.12, 0.28, 0.65,
        Math.cos(progress * 3.3), Math.sin(progress * 3.3), 0, 0.2);
      grassTrailField.submitContact(focusX, focusZ + 0.05, 0.62, 0.4,
        -Math.sin(progress * 2.7), Math.cos(progress * 2.7), 0, 0.8);
    }
    if (step % 7 === 5) {
      // The landing pulse is a ring, not a disc: it carries an inner radius.
      grassTrailField.submitContact(focusX, focusZ, 1.1, 0.85,
        0, 1, 0.55, 0.1);
    }
    grassTrailField.render(STEP_SECONDS);
  }
}

/**
 * Reads the field the way a grass material does.
 *
 * Pass-against-pass agreement cannot answer the question that matters: a pass
 * that stored the trail mirrored would still feed its own reprojection
 * correctly and match a reference that made the same choice. So this samples
 * the finished texture at a constant coordinate — the same
 * `(world - centre) / coverage + 0.5` a blade uses — and asks whether the crush
 * is where the contact was put.
 */
async function readCrushAt(renderer: WebGPURenderer, trail: Texture, probeUv: [number, number],
  target: RenderTarget): Promise<number> {
  const material = new MeshBasicNodeMaterial({ depthTest: false, depthWrite: false,
    toneMapped: false });
  const source = textureNode(trail);
  material.fragmentNode = vec4(vec3(source.sample(vec2(probeUv[0], probeUv[1])).b), 1);
  const quad = new QuadMesh(material);
  try {
    renderNodePass(renderer, target, quad);
    const pixels = await readRenderTargetRgba8(renderer, target);
    return pixels[0];
  } finally {
    disposeResources([material]);
  }
}

/**
 * Compares the portable trail pass against the shipped WebGL feedback pass.
 *
 * Both runs are driven through the field itself, so the covered square, the
 * contact packing, the 30 Hz accumulation and the ping-pong order are the same
 * owner's decisions in both; only the pass that executes the update differs.
 * The comparison reads each result through the field's public texture, blitted
 * into a byte target, so a half-float pass and a byte pass are quantized the
 * same way before they are compared.
 */
export async function compareGrassTrailPass(renderer: WebGPURenderer, steps = 24, scroll = true) {
  const legacy = new WebGLRenderer();
  const legacyTarget = new WebGLRenderTarget(RESOLUTION, RESOLUTION);
  const nodeTarget = new RenderTarget(RESOLUTION, RESOLUTION);
  const blitMaterial = new ShaderMaterial({
    vertexShader: "varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: "varying vec2 vUv;\nuniform sampler2D uSource;\nvoid main() { gl_FragColor = texture2D(uSource, vUv); }",
    uniforms: { uSource: { value: null as Texture | null } },
    depthTest: false, depthWrite: false,
  });
  const blitScene = new Scene();
  const blitGeometry = new PlaneGeometry(2, 2);
  const blitQuad = new Mesh(blitGeometry, blitMaterial);
  blitQuad.frustumCulled = false;
  blitScene.add(blitQuad);
  const blitCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const nodeBlitMaterial = new MeshBasicNodeMaterial({ depthTest: false, depthWrite: false,
    toneMapped: false });
  const nodeBlitSource = textureNode(nodeTarget.texture);
  nodeBlitMaterial.fragmentNode = nodeBlitSource.sample(uv());
  const nodeBlitQuad = new QuadMesh(nodeBlitMaterial);
  const previous = renderer.getRenderTarget();
  try {
    grassTrailField.configure({ resolution: RESOLUTION, coverage: COVERAGE,
      recoveryRate: 0.5, freshnessRate: 1.4 });

    grassTrailField.attach(legacy);
    const legacyPrimedTexture = grassTrailField.getTexture();
    if (!legacyPrimedTexture) throw new Error("The legacy trail pass produced no primed texture.");
    blitMaterial.uniforms.uSource.value = legacyPrimedTexture;
    legacy.setRenderTarget(legacyTarget);
    legacy.render(blitScene, blitCamera);
    const legacyPrimedPixels = new Uint8Array(RESOLUTION * RESOLUTION * 4);
    legacy.readRenderTargetPixels(legacyTarget, 0, 0, RESOLUTION, RESOLUTION, legacyPrimedPixels);
    const legacyPrimed = [...legacyPrimedPixels.slice(0, 4)];
    driveField(steps, scroll);
    const legacyTexture = grassTrailField.getTexture();
    if (!legacyTexture) throw new Error("The legacy trail pass produced no texture.");
    blitMaterial.uniforms.uSource.value = legacyTexture;
    legacy.setRenderTarget(legacyTarget);
    legacy.render(blitScene, blitCamera);
    const expected = new Uint8Array(RESOLUTION * RESOLUTION * 4);
    legacy.readRenderTargetPixels(legacyTarget, 0, 0, RESOLUTION, RESOLUTION, expected);
    const legacyPrecise = grassTrailField.isPrecise();

    const capabilities = readRendererCapabilities(renderer);
    grassTrailField.attachNodePass((uniforms, size) =>
      createGrassTrailNodePass(renderer, capabilities, uniforms, size));
    const primedTexture = grassTrailField.getTexture();
    if (!primedTexture) throw new Error("The node trail pass produced no primed texture.");
    nodeBlitSource.value = primedTexture;
    renderNodePass(renderer, nodeTarget, nodeBlitQuad);
    const primedPixels = await readRenderTargetRgba8(renderer, nodeTarget);
    const primed = [primedPixels[0], primedPixels[1], primedPixels[2], primedPixels[3]];
    driveField(steps, scroll);
    const nodeTexture = grassTrailField.getTexture();
    if (!nodeTexture) throw new Error("The node trail pass produced no texture.");
    nodeBlitSource.value = nodeTexture;
    renderNodePass(renderer, nodeTarget, nodeBlitQuad);
    const pixels = await readRenderTargetRgba8(renderer, nodeTarget);
    const nodePrecise = grassTrailField.isPrecise();

    // One contact, far off the centre in +Z, then read the finished field at
    // that world position and at its mirror. A stored-mirrored trail reverses
    // which of the two carries the crush.
    grassTrailField.setFocus(0, 0);
    grassTrailField.submitContact(0, 2.4, 0.9, 1, 0, 1, 0, 0);
    grassTrailField.render(STEP_SECONDS);
    const orientationTexture = grassTrailField.getTexture();
    if (!orientationTexture) throw new Error("The node trail pass produced no texture.");
    const orientation = {
      atContact: await readCrushAt(renderer, orientationTexture, [0.5, 0.5 + 2.4 / COVERAGE],
        nodeTarget),
      mirrored: await readCrushAt(renderer, orientationTexture, [0.5, 0.5 - 2.4 / COVERAGE],
        nodeTarget),
    };

    const flip = renderer.coordinateSystem === WebGPUCoordinateSystem;
    // The two passes store the square in opposite row order, and both are
    // correct: three normalizes render-target sampling for the node path, so
    // each field reads the same way round for its own materials. That is what
    // the orientation probe above establishes; raw rows are compared through
    // the reversal that difference implies, and the unreversed mapping is kept
    // as the guard that the reversal is real rather than assumed.
    let maximum = 0, total = 0, crushed = 0, differing = 0;
    let legacyCrushed = 0, unreversedTotal = 0, unreversedMaximum = 0;
    const channelMaximum = [0, 0, 0, 0], channelTotal = [0, 0, 0, 0];
    const channelDiffering = [0, 0, 0, 0];
    for (let y = 0; y < RESOLUTION; y++) for (let x = 0; x < RESOLUTION; x++) {
      const offset = (y * RESOLUTION + x) * 4;
      const reference = ((flip ? y : RESOLUTION - y - 1) * RESOLUTION + x) * 4;
      const unreversed = ((flip ? RESOLUTION - y - 1 : y) * RESOLUTION + x) * 4;
      // Crush is the channel the blades actually bend from; count what the walk
      // left behind so an empty field cannot pass as a match.
      if (pixels[offset + 2] > 8) crushed++;
      if (expected[reference + 2] > 8) legacyCrushed++;
      for (let channel = 0; channel < 4; channel++) {
        const delta = Math.abs(pixels[offset + channel] - expected[reference + channel]);
        maximum = Math.max(maximum, delta); total += delta;
        channelMaximum[channel] = Math.max(channelMaximum[channel], delta);
        channelTotal[channel] += delta;
        if (delta > 1) { differing++; channelDiffering[channel]++; }
        const unreversedDelta = Math.abs(pixels[offset + channel] - expected[unreversed + channel]);
        unreversedMaximum = Math.max(unreversedMaximum, unreversedDelta);
        unreversedTotal += unreversedDelta;
      }
    }
    return { steps, scroll, primed, legacyPrimed, orientation, resolution: RESOLUTION, maximum, mean: total / (RESOLUTION * RESOLUTION * 4),
      differing, crushed, legacyCrushed, legacyPrecise, nodePrecise, flippedRows: flip,
      unreversedMaximum, unreversedMean: unreversedTotal / (RESOLUTION * RESOLUTION * 4),
      channelMaximum, channelDiffering,
      channelMean: channelTotal.map(value => value / (RESOLUTION * RESOLUTION)) };
  } finally {
    renderer.setRenderTarget(previous);
    grassTrailField.dispose();
    disposeResources([blitMaterial, blitGeometry, nodeBlitMaterial, nodeTarget, legacyTarget,
      legacy]);
  }
}
