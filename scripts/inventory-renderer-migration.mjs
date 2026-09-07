import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const patterns = /WebGLRenderer|RawShaderMaterial|ShaderMaterial|onBeforeCompile|getContext\(|WebGLRenderTarget|PMREMGenerator|readRenderTargetPixels|copyFramebufferToTexture|beginQuery\(/g;

/**
 * What has actually been replaced, and what holds it.
 *
 * A coupling is only "ported" when a portable implementation exists *and* a
 * check compares it against the shipped one. Anything else stays pending: a
 * node module that nothing measures is not evidence of a migrated route, and
 * neither is a passing type check.
 */
const ported = new Map([
  ['src/grass/materials/GrassNearMaterial.ts', {
    replacement: 'src/grass/materials/GrassNearNodes.ts, GrassNearNodeMaterial.ts',
    check: 'check-renderer-harness.mjs grass (4 configurations x deformation/albedo/ambient lighting)',
  }],
  ['src/world/grass/WorldGrassImpostorMaterial.ts', {
    replacement: 'src/world/grass/WorldGrassImpostorNodes.ts, WorldGrassImpostorNodeMaterial.ts',
    check: 'check-renderer-harness.mjs impostor',
  }],
  ['src/world/grass/WorldDetailFoliageMaterial.ts', {
    replacement: 'src/world/grass/WorldDetailFoliageNodes.ts, WorldDetailFoliageNodeMaterial.ts',
    check: 'check-renderer-harness.mjs foliage (single-pass and production settings)',
  }],
  ['src/grass/interaction/GrassTrailField.ts', {
    replacement: 'src/grass/interaction/GrassTrailNodes.ts, GrassTrailNodePass.ts',
    check: 'check-renderer-harness.mjs trail (scripted walk plus an end-to-end sampling probe)',
  }],
  ['src/grass/impostors/OctahedralImpostorBaker.ts', {
    replacement: 'src/grass/impostors/OctahedralImpostorNodeBaker.ts',
    check: 'check-renderer-harness.mjs bake',
  }],
  ['src/world/hydrology/WaterBedMaterialController.ts', {
    replacement: 'src/world/hydrology/WaterBedNodes.ts, WaterBedNodeMaterial.ts',
    check: 'check-renderer-harness.mjs water (desktop and compact detail scales)',
  }],
  ['src/world/hydrology/WaterMaterialController.ts', {
    replacement: 'src/world/hydrology/WaterSurfaceNodes.ts, WaterSurfaceNodeMaterial.ts',
    check: 'check-renderer-harness.mjs water (albedo/alpha on both optics presets, normal, roughness, live captured refraction)',
  }],
  ['src/world/hydrology/WaterShader.ts', {
    replacement: 'src/world/hydrology/WaterSurfaceNodes.ts, WaterSurfaceHelperNodes.ts, WaterOpticsNodes.ts',
    check: 'check-renderer-harness.mjs water (albedo/alpha on both optics presets, normal, roughness, live captured refraction)',
  }],
  ['src/world/hydrology/WaterCascadeMaterialController.ts', {
    replacement: 'src/world/hydrology/WaterCascadeNodes.ts, WaterCascadeNodeMaterial.ts',
    check: 'check-renderer-harness.mjs water (cascade albedo and alpha, both detail scales)',
  }],
  ['src/world/hydrology/WaterCascadeShader.ts', {
    replacement: 'src/world/hydrology/WaterCascadeNodes.ts',
    check: 'check-renderer-harness.mjs water (cascade albedo and alpha, both detail scales)',
  }],
  ['src/world/hydrology/WaterRefractionPass.ts', {
    replacement: 'src/world/hydrology/WaterRefractionNodePass.ts',
    check: 'check-renderer-harness.mjs water (capture, depth coverage and surface sampling after shader warmup)',
  }],
  ['src/render/ActorEnvironmentResponse.ts', {
    replacement: 'src/render/ActorEnvironmentNodeResponse.ts',
    check: 'check-renderer-harness.mjs actor (unpatched control and responded run)',
  }],
  ['src/runtime/GpuFrameTimer.ts', {
    replacement: 'src/render/GpuTimingAdapter.ts',
    check: 'verify-renderer-session.mjs (coalesced resolve, disposal, unsupported fallback)',
  }],
  // G03. Each of these was ported and measured during the sky and cloud
  // checkpoints; the inventory simply never recorded which check holds them.
  // Re-run and confirmed passing on both backends before being listed here.
  ['src/world/sky/WorldSky.ts', {
    replacement: 'src/world/sky/WorldSkyNode.ts, WorldSkyAnalyticNodeMaterial.ts',
    check: 'check-renderer-harness.mjs scenery and volume (sky comparison)',
  }],
  ['src/world/sky/WorldSkyMaterial.ts', {
    replacement: 'src/world/sky/WorldSkyAnalyticNodeMaterial.ts',
    check: 'check-renderer-harness.mjs scenery and volume (sky comparison)',
  }],
  ['src/world/sky/WorldSkyCloudVolumeController.ts', {
    replacement: 'src/world/sky/WorldCloudVolumeNodes.ts',
    check: 'check-renderer-harness.mjs volume (matched raymarch)',
  }],
  ['src/world/sky/WorldCloudPassMaterials.ts', {
    replacement: 'src/world/sky/WorldCloudFieldNodes.ts, WorldCloudVolumeNodes.ts',
    check: 'check-renderer-harness.mjs scenery (cloud field) and volume (raymarch)',
  }],
  ['src/world/sky/WorldCloudShadowMap.ts', {
    replacement: 'src/world/sky/WorldCloudShadowNodeMap.ts',
    check: 'check-renderer-harness.mjs scenery and volume (shadow map, focus and origin)',
  }],
  ['src/render/WorldCloudShadowMaterialPatch.ts', {
    replacement: 'src/world/sky/WorldCloudShadowNodes.ts',
    check: 'check-renderer-harness.mjs cloudresponse (direct-light scale, both response strengths)',
  }],
  ['src/world/sky/WorldCloudShadowSceneIntegrator.ts', {
    replacement: 'src/render/WorldNodeMaterialContext.ts (construction-time injection; the node '
      + 'route has no scene-walking integrator)',
    check: 'check-renderer-harness.mjs cloudresponse (direct-light scale, both response strengths)',
  }],
  ['src/world/sky/WorldCloudTemporalPass.ts', {
    replacement: 'src/world/sky/WorldCloudTemporalNodePass.ts, WorldCloudTemporalNodes.ts',
    check: 'check-renderer-harness.mjs volume (temporal reprojection, both reports)',
  }],
  ['src/world/horizon/WorldHorizonMaterial.ts', {
    replacement: 'src/world/horizon/WorldHorizonNodeMaterial.ts',
    check: 'check-renderer-harness.mjs scenery and volume (horizon comparison)',
  }],
  ['src/world/sky/WorldSkyNode.ts', {
    replacement: 'this file is the portable route; it drives the node PMREMGenerator',
    check: 'check-renderer-harness.mjs scenery and volume (data-sky-environment)',
  }],
  ['src/world/stones/StoneGrowthShader.ts', {
    replacement: 'src/world/stones/StoneSurfaceNodes.ts, StoneSurfaceNodeMaterial.ts',
    check: 'check-renderer-harness.mjs stone (detail albedo/normal and coarse)',
  }],
  ['src/world/TerrainMaterialShader.ts', {
    replacement: 'src/world/TerrainNodeMaterialController.ts, terrain/*Nodes.ts',
    check: 'check-renderer-harness.mjs terrain',
  }],
  ['src/world/TerrainMaterialController.ts', {
    replacement: 'src/world/TerrainNodeMaterialController.ts',
    check: 'check-renderer-harness.mjs terrain',
  }],
]);

/** Development comparisons are the checks themselves, not production routes. */
const isComparison = (path) => path.startsWith('src/dev/');

/**
 * Matches that are not renderer couplings at all.
 *
 * The pattern is deliberately broad, so it catches a 2D canvas context and the
 * portable readback helper's own name. Counting those as pending work overstates
 * what is left, which is worse than missing something: the number is used to
 * decide when G05 is done.
 */
const notCouplings = new Map([
  ['src/app/WorldMinimap.ts', 'a 2D canvas context, unrelated to the 3D renderer'],
  ['src/render/RenderTargetReadback.ts', 'the portable readback helper itself'],
  ['src/world/grass/WorldDetailFoliageAtlasFactory.ts',
    'a 2D canvas used to author an atlas on the CPU, not a renderer coupling'],
  ['src/world/grass/WorldGrassImpostorAtlasFactory.ts',
    'a 2D canvas used to author an atlas on the CPU, not a renderer coupling'],
]);

const inventory = [];
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) await scan(file);
    else if (entry.name.endsWith('.ts')) {
      const lines = (await readFile(file, 'utf8')).split(/\r?\n/);
      lines.forEach((line, index) => {
        const matches = [...line.matchAll(patterns)].map((match) => match[0]);
        if (!matches.length) return;
        const path = relative('.', file).replaceAll('\\', '/');
        const owner = /sky|horizon|TerrainMaterial|Cloud/.test(path) ? 'G03'
          : /grass|Grass|impostor/i.test(path) && !/GpuFrameTimer/.test(path) ? 'G04'
          : /water|hydrology|stone|ActorEnvironment/i.test(path) ? 'G05' : 'G02/G05';
        const migration = ported.get(path);
        const exempt = notCouplings.get(path);
        const status = path === 'src/render/RendererCapabilities.ts' ? 'isolated backend probe'
          : exempt ? 'not a renderer coupling'
            : isComparison(path) ? 'comparison harness, development only'
              : migration ? 'ported, comparison-gated' : 'pending';
        inventory.push({ file: path, line: index + 1, symbols: matches, owner, status,
          ...(exempt ? { reason: exempt } : {}), ...(migration ?? {}), source: line.trim() });
      });
    }
  }
}
await scan('src');
const counts = inventory.reduce((totals, entry) => {
  totals[entry.status] = (totals[entry.status] ?? 0) + 1;
  return totals;
}, {});
await writeFile('docs/plans/renderer-migration-inventory.json', JSON.stringify({
  note: 'Generated inventory. A "ported" entry means a portable implementation exists and a '
    + 'named check compares it against the shipped one; it is not a claim that the production '
    + 'route has been switched. Pending entries are unmigrated.',
  counts, entries: inventory,
}, null, 2));
console.log(`Recorded ${inventory.length} renderer coupling locations: `
  + Object.entries(counts).map(([status, count]) => `${count} ${status}`).join(', ') + '.');
