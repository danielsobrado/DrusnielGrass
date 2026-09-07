import assert from 'node:assert/strict';
import { Box3, Color, DirectionalLight, Object3D, PerspectiveCamera, Scene, Texture, Vector3, Vector4,
  WebGPUCoordinateSystem } from 'three/webgpu';

export async function verifyNodePortLifecycle(server) {
  const errors = [];
  const check = async (name, run) => {
    try { await run(); } catch (error) { errors.push(new Error(`${name}: ${error.message}`)); }
  };
  const raster = () => ({
    target: {}, face: 2, mip: 1, viewport: new Vector4(1, 2, 3, 4), scissor: new Vector4(5, 6, 7, 8),
    scissorTest: true, color: new Color('#123456'), alpha: 0.4, autoClear: true,
    coordinateSystem: WebGPUCoordinateSystem,
    getRenderTarget() { return this.target; }, getActiveCubeFace() { return this.face; }, getActiveMipmapLevel() { return this.mip; },
    getViewport(out) { return out.copy(this.viewport); }, getScissor(out) { return out.copy(this.scissor); },
    getScissorTest() { return this.scissorTest; }, getClearColor(out) { return out.copy(this.color); }, getClearAlpha() { return this.alpha; },
    setRenderTarget(value, face = 0, mip = 0) { this.target = value; this.face = face; this.mip = mip; },
    setViewport(...args) { args.length === 1 ? this.viewport.copy(args[0]) : this.viewport.set(...args); },
    setScissor(value) { this.scissor.copy(value); }, setScissorTest(value) { this.scissorTest = value; },
    setClearColor(value, alpha) { this.color.set(value); this.alpha = alpha; },
    getDrawingBufferSize(out) { return out.set(200, 100); }, clear() {}, render() {},
  });
  await check('nullable sampler releases stale binding', async () => {
    const { createUniformTexture } = await server.ssrLoadModule('/src/render/NodeUniformTexture.ts');
    const live = new Texture();
    const source = { value: live };
    const binding = createUniformTexture(source);
    let liveDisposals = 0;
    live.addEventListener('dispose', () => liveDisposals++);
    source.value = null; binding.sync();
    const detached = binding.node.value !== live;
    const placeholder = binding.node.value;
    let placeholderDisposals = 0;
    placeholder.addEventListener('dispose', () => placeholderDisposals++);
    source.value = live; binding.sync();
    assert.equal(binding.node.value, live);
    binding.dispose(); binding.dispose();
    assert.ok(detached, 'null must replace the old sampler with an owned fallback');
    assert.equal(liveDisposals, 0, 'material must not dispose owner textures');
    assert.equal(placeholderDisposals, 1);
  });
  await check('refraction restores complete state on draw failure', async () => {
    const { WaterRefractionNodePass } = await server.ssrLoadModule('/src/world/hydrology/WaterRefractionNodePass.ts');
    const renderer = raster(), previous = renderer.target, camera = new PerspectiveCamera();
    camera.layers.mask = 19;
    let captureScissor;
    renderer.render = () => { captureScissor = renderer.scissorTest; throw new Error('capture failed'); };
    const pass = new WaterRefractionNodePass(0.5);
    assert.throws(() => pass.render(renderer, new Scene(), camera), /capture failed/);
    pass.dispose(); pass.dispose();
    assert.equal(camera.layers.mask, 19);
    assert.equal(renderer.target, previous);
    assert.equal(renderer.face, 2); assert.equal(renderer.mip, 1);
    assert.equal(captureScissor, false);
    assert.equal(renderer.scissorTest, true); assert.equal(renderer.autoClear, true);
  });
  await check('baking releases scene state before asynchronous readback', async () => {
    const { OctahedralImpostorNodeBaker } = await server.ssrLoadModule('/src/grass/impostors/OctahedralImpostorNodeBaker.ts');
    const renderer = raster(), scene = new Scene(), source = new Object3D(), light = new DirectionalLight();
    source.visible = false; source.layers.mask = 7; light.layers.mask = 13; scene.add(source, light);
    let rejectRead;
    renderer.readRenderTargetPixelsAsync = () => new Promise((_, reject) => { rejectRead = reject; });
    const result = new OctahedralImpostorNodeBaker(renderer).bake({ scene, source,
      bounds: new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1)),
      config: { viewsPerAxis: 2, frameResolution: 8, padding: 1, cameraMargin: 1.1 } });
    const checked = assert.rejects(result, /readback failed/);
    const stateDuringRead = [source.visible, source.layers.mask, light.layers.mask];
    renderer.setClearColor('#abcdef', 0.7);
    rejectRead(new Error('readback failed')); await checked;
    assert.deepEqual(stateDuringRead, [false, 7, 13], 'gameplay must see original layers while readback waits');
    assert.equal(renderer.color.getHexString(), 'abcdef', 'late cleanup must not overwrite a newer frame');
    assert.equal(renderer.alpha, 0.7);
  });
  await check('trail priming failure releases the attached backend', async () => {
    const { grassTrailField } = await server.ssrLoadModule('/src/grass/interaction/GrassTrailField.ts');
    grassTrailField.dispose();
    let disposals = 0;
    assert.throws(() => grassTrailField.attachNodePass(() => ({ precise: false,
      texture: () => null, render() { throw new Error('prime failed'); }, dispose() { disposals++; } })), /prime failed/);
    const disposedDuringRollback = disposals;
    grassTrailField.dispose();
    assert.equal(disposedDuringRollback, 1);
    assert.equal(disposals, 1);
  });
  if (errors.length) throw new AggregateError(errors, errors.map(error => error.message).join('\n'));
  console.log('[node-port-lifecycle] Sampler detachment, refraction state, asynchronous bake ownership and trail rollback passed.');
}
