import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { DepthTexture, RenderTarget, Scene, DirectionalLight, AmbientLight } from 'three/webgpu';

const server = await createServer({ configFile: false, server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true, include: [] } });
const failures = [];
const check = async (name, run) => {
  try { await run(); } catch (error) { failures.push(new Error(`${name}: ${error.message}`)); }
};
try {
  const { WorldConfigLoader } = await server.ssrLoadModule('/src/world/WorldConfigLoader.ts');
  const config = new WorldConfigLoader().parse(await readFile('public/config/world.yaml', 'utf8'));
  await check('water capture reaches the owned material', async () => {
    const { WaterMaterialController } = await server.ssrLoadModule('/src/world/hydrology/WaterMaterialController.ts');
    const controller = new WaterMaterialController({ ...config, waterQuality: 1 });
    const target = new RenderTarget(8, 8);
    target.depthTexture = new DepthTexture(8, 8);
    // Replace the draw only; use the real controller's publication and binding.
    controller.refraction.target = target;
    controller.refraction.render = () => {};
    try {
      controller.renderRefraction({ getDrawingBufferSize: out => out.set(16, 16) }, {}, {});
      const bound = controller.material.boundTextures.map(binding => binding.node.value);
      assert.ok(bound.includes(target.texture), 'published colour capture is not bound');
      assert.ok(bound.includes(target.depthTexture), 'published depth capture is not bound');
    } finally { controller.dispose(); }
  });
  await check('grass controller syncs after its frame uniforms', async () => {
    const { GrassNearMaterial } = await server.ssrLoadModule('/src/grass/materials/GrassNearMaterial.ts');
    const controller = new GrassNearMaterial({ name: 'wiring', cacheKey: 'wiring', interactive: true });
    let synced = 0;
    controller.material.syncUniformTextures = () => {
      assert.equal(controller.shaderUniforms.uGrassTime.value, 7);
      synced++;
    };
    try { controller.update(7); assert.equal(synced, 1); }
    finally { controller.material.dispose(); }
  });
  await check('published stone batches expose node packing', async () => {
    const { WorldStoneSystem } = await server.ssrLoadModule('/src/world/stones/WorldStoneSystem.ts');
    const { TerrainField } = await server.ssrLoadModule('/src/world/TerrainField.ts');
    const { StoneField } = await server.ssrLoadModule('/src/world/stones/StoneField.ts');
    const { WorldNodeMaterialContext } = await server.ssrLoadModule('/src/render/WorldNodeMaterialContext.ts');
    const packing = await server.ssrLoadModule('/src/world/stones/StoneRenderPacking.ts');
    const scene = new Scene(), field = new TerrainField(config);
    const context = new WorldNodeMaterialContext(new DirectionalLight(), [new AmbientLight()]);
    const system = new WorldStoneSystem(scene, new StoneField(field, config), config, false, false, context);
    const geometry = packing.createStoneRenderGeometry(packing.createStoneRenderBuffers(3, 3),
      { minimumX: 0, minimumY: 0, minimumZ: 0, maximumX: 1, maximumY: 1, maximumZ: 1 });
    try {
      system.commitBuild({ key: 'review', signature: 'review' }, { geometry, hasDetailedGeometry: true,
        originX: 0, originY: 0, originZ: 0, triangles: 1, stones: 1 });
      assert.ok(geometry.getAttribute('stonePackedSurface'), 'node material attributes missing from published batch');
      assert.equal(geometry.getAttribute('normal').itemSize, 4, 'packed normal must use a legal WebGPU format');
    } finally { system.dispose(); }
  });
  if (failures.length) throw new AggregateError(failures, failures.map(error => error.message).join('\n'));
  console.log('[production-node-wiring] Controller sampler publication and streamed stone bindings passed.');
} finally { await server.close(); }
