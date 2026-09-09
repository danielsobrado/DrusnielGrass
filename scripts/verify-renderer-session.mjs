import assert from 'node:assert/strict';
import './verify-production-node-wiring.mjs';
import { verifyNodePortLifecycle } from './verify-node-port-lifecycle.mjs';
import { verifyRecoveryFailures } from './renderer-recovery-review-contract.mjs';
import { createServer } from 'vite';
import { readFile } from 'node:fs/promises';

const server = await createServer({ configFile: false, server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true, include: [] }, logLevel: 'error' });
try {
  await verifyNodePortLifecycle(server);
  const { createRendererSession, resolveRendererRequest } = await server.ssrLoadModule('/src/render/RendererSession.ts');
  const { readRendererCapabilities } = await server.ssrLoadModule('/src/render/RendererCapabilities.ts');
  const caps = (backend) => ({ backend, maxTextureSize: 4096, maxSamples: 4,
    gpuTiming: false, nativeCompute: backend === 'webgpu', indirectDraw: false,
    colorTargetHalfFloat: true, sampledDepth: true });
  const fake = () => ({ init: async () => {}, disposed: 0, stopped: 0, removed: 0,
    onDeviceLost() {}, dispose() { this.disposed++; }, setAnimationLoop() { this.stopped++; },
    domElement: { remove() {} } });
  assert.equal(resolveRendererRequest(''), 'auto');
  assert.equal(resolveRendererRequest('?renderer=webgl'), 'webgl');
  const warnings = [];
  assert.equal(resolveRendererRequest('?renderer=bogus', (m) => warnings.push(m)), 'auto');
  assert.equal(warnings.length, 1);
  for (const actual of ['webgpu', 'webgl2']) {
    const renderer = fake();
    const session = await createRendererSession({ createRenderer: () => renderer, readCapabilities: () => caps(actual) });
    assert.equal(session.diagnostics.actual, actual);
    assert.equal(Boolean(session.diagnostics.fallbackReason), actual === 'webgl2');
    let losses = 0;
    const unsubscribe = session.subscribeDeviceLoss(() => losses++);
    renderer.onDeviceLost({});
    unsubscribe();
    renderer.onDeviceLost({});
    assert.equal(losses, 1);
    session.dispose(); session.dispose();
    assert.equal(renderer.disposed, 1);
  }
  const forced = fake();
  await assert.rejects(createRendererSession({ request: 'webgpu', createRenderer: () => forced,
    readCapabilities: () => caps('webgl2') }), /explicitly requested/);
  assert.equal(forced.disposed, 1);
  const failed = fake();
  failed.init = async () => { throw new Error('device failure'); };
  await assert.rejects(createRendererSession({ createRenderer: () => failed }), /device failure/);
  assert.equal(failed.disposed, 1);
  const abort = new AbortController();
  const late = fake();
  late.init = async () => { abort.abort(); };
  await assert.rejects(createRendererSession({ createRenderer: () => late, signal: abort.signal }), { name: 'AbortError' });
  assert.equal(late.disposed, 1);
  const gl = readRendererCapabilities({ backend: { isWebGLBackend: true, gl: {
    getParameter: () => 4, getExtension: () => null,
  } } });
  assert.equal(gl.nativeCompute, false);
  assert.equal(gl.indirectDraw, false);
  assert.equal(gl.gpuTiming, false);
  assert.equal(gl.colorTargetHalfFloat, false);
  // Either extension makes a half-float colour target renderable, and a device
  // may expose only the half-float one. Probing the float extension alone
  // reports no renderable half-float target there, which silently drops the
  // trail pass to bytes — a different decay floor, not a lower precision.
  const halfFloatOnly = readRendererCapabilities({ backend: { isWebGLBackend: true, gl: {
    getParameter: () => 4,
    getExtension: (name) => (name === 'EXT_color_buffer_half_float' ? {} : null),
  } } });
  assert.equal(halfFloatOnly.colorTargetHalfFloat, true);
  assert.throws(() => readRendererCapabilities({ backend: {} }), /unrecognized/);
  const { RendererRecovery } = await server.ssrLoadModule('/src/render/RendererRecovery.ts');
  await verifyRecoveryFailures(RendererRecovery);
  const calls = [];
  const failures = [];
  const state = { seed: 123, mask: [0, 1] };
  const recovery = new RendererRecovery({ capture: () => state, release() {},
    async restart(backend, snapshot) {
      assert.equal(snapshot, state);
      calls.push(backend);
      if (backend === 'webgpu') throw new Error('failed device');
    }, onFailure: (error) => failures.push(error) });
  const first = recovery.recover('auto', 'webgpu');
  assert.equal(first, recovery.recover('auto', 'webgpu'));
  await first;
  assert.deepEqual(calls, ['webgpu', 'webgl']);
  await recovery.recover('auto', 'webgpu');
  assert.equal(calls.length, 2);
  assert.match(failures[0].message, /budget exhausted/);
  // Forced WebGPU is one backend and one attempt, which makes the release count
  // exact: one for the renderer being replaced, one for the failed attempt. A
  // third, thrown into the shared catch on the way out, is the defect — and not
  // merely redundant, because a release that throws there would replace the
  // recovery failure the owner has to present with the cleanup error.
  let releases = 0;
  const exhausted = [];
  const exhaustedRecovery = new RendererRecovery({ capture() {}, release: () => { releases++; },
    async restart() { throw new Error('unavailable'); },
    onFailure: (error) => exhausted.push(error) });
  await exhaustedRecovery.recover('webgpu', 'webgpu');
  assert.equal(releases, 2);
  assert.equal(exhausted.length, 1);
  assert.match(exhausted[0].message, /Renderer recovery failed/);
  const { readRendererDebugInfo, readRendererError } =
    await server.ssrLoadModule('/src/render/RendererDebugInfo.ts');
  // A classic WebGLRenderer reaches its context directly; a node renderer on
  // the WebGL backend reaches the same context through `backend.gl`. Both must
  // produce the identical reading, or the isolation HUD would say different
  // things about one machine depending on which renderer drew the frame.
  const glStub = {
    VERSION: 1, RENDERER: 2, VENDOR: 3, DEPTH_BITS: 4, MAX_TEXTURE_SIZE: 5,
    MAX_VERTEX_ATTRIBS: 6, VERTEX_SHADER: 7, FRAGMENT_SHADER: 8, HIGH_FLOAT: 9, NO_ERROR: 0,
    getExtension: () => null,
    getParameter: (key) => ({ 1: 'WebGL 2.0', 2: 'Test GPU', 3: 'Test Vendor', 4: 24,
      5: 8192, 6: 16 })[key],
    getShaderPrecisionFormat: () => ({ precision: 23, rangeMin: 127, rangeMax: 127 }),
    getError: () => 0,
  };
  const direct = readRendererDebugInfo({ getContext: () => glStub });
  const throughBackend = readRendererDebugInfo({ backend: { isWebGLBackend: true, gl: glStub } });
  assert.deepEqual(direct, throughBackend);
  assert.deepEqual(direct, { backend: 'webgl2', version: 'WebGL 2.0', renderer: 'Test GPU',
    vendor: 'Test Vendor', depthBits: 24, maxTextureSize: 8192, maxVertexAttribs: 16,
    vertexHighp: 'p23 [127,127]', fragmentHighp: 'p23 [127,127]' });
  assert.equal(readRendererError({ getContext: () => glStub }), 'NO_ERROR');
  assert.equal(readRendererError({ getContext: () => ({ ...glStub, getError: () => 0x502 }) }),
    '0x502');
  // WebGPU answers what it can and leaves the rest absent rather than inventing
  // it: there is no context-wide depth size and WGSL has no precision
  // qualifiers, and `getError` has no synchronous equivalent at all.
  const gpu = { backend: { isWebGPUBackend: true, device: {
    limits: { maxTextureDimension2D: 16384, maxVertexAttributes: 30 },
    adapterInfo: { vendor: 'test-vendor', architecture: 'test-arch', device: 'test-device' },
  } } };
  const gpuInfo = readRendererDebugInfo(gpu);
  assert.equal(gpuInfo.backend, 'webgpu');
  assert.equal(gpuInfo.maxTextureSize, 16384);
  assert.equal(gpuInfo.maxVertexAttribs, 30);
  assert.equal(gpuInfo.renderer, 'test-device test-arch');
  assert.equal(gpuInfo.depthBits, undefined);
  assert.equal(gpuInfo.vertexHighp, undefined);
  assert.equal(readRendererError(gpu), 'unsupported');
  // A device with no adapter identity is normal, not a failure.
  const bare = readRendererDebugInfo({ backend: { isWebGPUBackend: true, device: {
    limits: { maxTextureDimension2D: 2048, maxVertexAttributes: 16 } } } });
  assert.equal(bare.renderer, 'unavailable');
  assert.equal(bare.vendor, 'unavailable');
  assert.throws(() => readRendererDebugInfo({ backend: {} }), /neither a WebGL context/);
  const { GpuTimingAdapter } = await server.ssrLoadModule('/src/render/GpuTimingAdapter.ts');
  let resolveTiming;
  let reads = 0;
  const timing = new GpuTimingAdapter({ resolveTimestampsAsync() {
    reads++; return new Promise((resolve) => { resolveTiming = resolve; });
  } }, { ...caps('webgpu'), gpuTiming: true }, true);
  timing.endFrame(); timing.endFrame();
  assert.equal(reads, 1);
  timing.dispose(); resolveTiming(5);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(timing.getStats().sampleCount, 0);
  const { readRenderTargetRgba8 } = await server.ssrLoadModule('/src/render/RenderTargetReadback.ts');
  const { RenderTarget } = await import('three/webgpu');
  const target = new RenderTarget(2, 2);
  const padded = new Uint8Array(264);
  padded.set([1, 2, 3, 4, 5, 6, 7, 8], 0);
  padded.set([9, 10, 11, 12, 13, 14, 15, 16], 256);
  const packed = await readRenderTargetRgba8({ readRenderTargetPixelsAsync: async () => padded }, target);
  assert.deepEqual([...packed], Array.from({ length: 16 }, (_, i) => i + 1));
  const tight = await readRenderTargetRgba8({ readRenderTargetPixelsAsync: async () => packed }, target);
  assert.equal(tight, packed);
  target.dispose();
  const { prepareTerrainNodeGeometry } = await server.ssrLoadModule('/src/world/terrain/TerrainNodeGeometry.ts');
  const { BufferGeometry, Float32BufferAttribute } = await import('three/webgpu');
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, -2, 1, 3], 3));
  const terrainAttributes = { terrainPath: 4, terrainEcology: 4, terrainEnvironment: 4, terrainBiome: 4,
    terrainCommunityGround: 4, terrainStoneInfluence: 4, terrainStoneOcclusionCenter: 2, terrainStoneOcclusion: 1 };
  const expectedAttributes = new Map();
  for (const [name, size] of Object.entries(terrainAttributes)) {
    const values = Float32Array.from({ length: size * 2 }, (_, i) => (i - size) * 0.25);
    expectedAttributes.set(name, values);
    geometry.setAttribute(name, new Float32BufferAttribute(values, size));
  }
  prepareTerrainNodeGeometry(geometry);
  const buffers = new Set();
  for (const [name, size] of Object.entries(terrainAttributes)) {
    const attribute = geometry.getAttribute(name);
    buffers.add(attribute.data);
    for (let i = 0; i < 2; i++) for (let c = 0; c < size; c++)
      assert.equal(attribute.getComponent(i, c), expectedAttributes.get(name)[i * size + c]);
  }
  assert.equal(buffers.size, 1, 'All terrain fields must share one WebGPU vertex buffer');
  geometry.deleteAttribute('terrainPath');
  assert.throws(() => prepareTerrainNodeGeometry(geometry), /Invalid terrain attribute terrainPath/);
  geometry.dispose();
  const { withRendererState } = await server.ssrLoadModule('/src/render/RendererStateScope.ts');
  const { Color, Vector4, PerspectiveCamera, WebGPUCoordinateSystem } = await import('three/webgpu');
  const initialTarget = {};
  const raster = { target: initialTarget, face: 2, mip: 1, viewport: new Vector4(1, 2, 3, 4),
    scissor: new Vector4(5, 6, 7, 8), scissorTest: true, color: new Color('#123456'), alpha: 0.4,
    autoClear: true, coordinateSystem: WebGPUCoordinateSystem, drawingWidth: 200, drawingHeight: 100, draws: 0,
    getRenderTarget() { return this.target; }, getActiveCubeFace() { return this.face; }, getActiveMipmapLevel() { return this.mip; },
    getViewport(out) { return out.copy(this.viewport); }, getScissor(out) { return out.copy(this.scissor); },
    getScissorTest() { return this.scissorTest; }, getClearColor(out) { return out.copy(this.color); }, getClearAlpha() { return this.alpha; },
    setRenderTarget(value, face = 0, mip = 0) { this.target = value; this.face = face; this.mip = mip; },
    setViewport(...args) { args.length === 1 ? this.viewport.copy(args[0]) : this.viewport.set(...args); },
    setScissor(value) { this.scissor.copy(value); }, setScissorTest(value) { this.scissorTest = value; },
    setClearColor(value, alpha) { this.color.copy(value); this.alpha = alpha; },
    getDrawingBufferSize(out) { return out.set(this.drawingWidth, this.drawingHeight); },
    clear() {}, render() { this.draws++; },
  };
  assert.throws(() => withRendererState(raster, () => {
    raster.setRenderTarget({}); raster.setViewport(9, 9, 9, 9); raster.autoClear = false;
    throw new Error('offscreen failure');
  }), /offscreen failure/);
  assert.equal(raster.target, initialTarget);
  assert.deepEqual(raster.viewport.toArray(), [1, 2, 3, 4]);
  assert.equal(raster.face, 2); assert.equal(raster.mip, 1); assert.equal(raster.autoClear, true);
  const createRestoreRaster = () => {
    let autoClear = true;
    const mock = {
      target: {}, face: 2, mip: 1, viewport: new Vector4(1, 2, 3, 4),
      scissor: new Vector4(5, 6, 7, 8), scissorTest: true, color: new Color('#123456'), alpha: 0.4,
      workComplete: false, restoreOrder: [],
      getRenderTarget() { return this.target; }, getActiveCubeFace() { return this.face; },
      getActiveMipmapLevel() { return this.mip; },
      getViewport(out) { return out.copy(this.viewport); }, getScissor(out) { return out.copy(this.scissor); },
      getScissorTest() { return this.scissorTest; }, getClearColor(out) { return out.copy(this.color); },
      getClearAlpha() { return this.alpha; },
      setRenderTarget(value, face = 0, mip = 0) {
        if (this.workComplete) { this.restoreOrder.push('target'); throw new Error('restore target'); }
        this.target = value; this.face = face; this.mip = mip;
      },
      setViewport(...args) {
        if (this.workComplete) this.restoreOrder.push('viewport');
        args.length === 1 ? this.viewport.copy(args[0]) : this.viewport.set(...args);
      },
      setScissor(value) {
        if (this.workComplete) this.restoreOrder.push('scissor');
        this.scissor.copy(value);
      },
      setScissorTest(value) {
        if (this.workComplete) this.restoreOrder.push('scissorTest');
        this.scissorTest = value;
      },
      setClearColor(value, alpha) {
        if (this.workComplete) this.restoreOrder.push('clearColor');
        this.color.copy(value); this.alpha = alpha;
      },
    };
    Object.defineProperty(mock, 'autoClear', {
      get() { return autoClear; },
      set(value) {
        if (mock.workComplete) mock.restoreOrder.push('autoClear');
        autoClear = value;
      },
    });
    return mock;
  };
  const expectedRestoreOrder = ['target', 'viewport', 'scissor', 'scissorTest', 'clearColor', 'autoClear'];
  const workAndRestore = createRestoreRaster();
  const restoreWarnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => { restoreWarnings.push(args); };
  try {
    assert.throws(() => withRendererState(workAndRestore, () => {
      workAndRestore.setRenderTarget({});
      workAndRestore.setViewport(9, 9, 9, 9);
      workAndRestore.autoClear = false;
      workAndRestore.workComplete = true;
      throw new Error('offscreen failure');
    }), /offscreen failure/);
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(restoreWarnings.length, 1);
  assert.match(String(restoreWarnings[0][0]), /Renderer state restoration also failed/);
  assert.deepEqual(workAndRestore.restoreOrder, expectedRestoreOrder);
  const restoreOnly = createRestoreRaster();
  assert.throws(() => withRendererState(restoreOnly, () => {
    restoreOnly.workComplete = true;
    return 'ok';
  }), /restore target/);
  assert.deepEqual(restoreOnly.restoreOrder, expectedRestoreOrder);
  const { RuntimeConfigLoader } = await server.ssrLoadModule('/src/runtime/RuntimeConfigLoader.ts');
  const runtime = new RuntimeConfigLoader().parse(await readFile('public/config/runtime.yaml', 'utf8'));
  const { WorldCloudTemporalNodePass } = await server.ssrLoadModule('/src/world/sky/WorldCloudTemporalNodePass.ts');
  const cloudPass = new WorldCloudTemporalNodePass(raster, { ...runtime.desktop, compact: false }, caps('webgpu'));
  const camera = new PerspectiveCamera();
  const renderHistory = (time, expectedHistory) => {
    const before = raster.draws;
    cloudPass.render(camera, time);
    assert.equal(raster.draws - before, 2, 'One volume and one temporal resolve per frame');
    assert.equal(cloudPass.getDiagnostics().historyUsed, expectedHistory);
    assert.equal(raster.target, initialTarget);
  };
  renderHistory(1, false); renderHistory(1.016, true);
  camera.position.x += 100; renderHistory(1.032, false); renderHistory(1.048, true);
  camera.rotation.y += Math.PI / 2; renderHistory(1.064, false);
  camera.fov += 10; camera.updateProjectionMatrix(); renderHistory(1.080, false);
  raster.drawingWidth += 100; renderHistory(1.096, false);
  renderHistory(2, false); renderHistory(1, false);
  cloudPass.resetHistory(); renderHistory(1.016, false); renderHistory(1.032, true);
  cloudPass.dispose(); cloudPass.dispose();
  assert.throws(() => cloudPass.render(camera, 1.048), /disposed/);
  console.log('[renderer-session] Selection, actual backend, initialization rollback, cancellation, loss subscription and capabilities passed.');
} finally { await server.close(); }
