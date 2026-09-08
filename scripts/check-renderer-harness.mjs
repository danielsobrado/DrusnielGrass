import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const fixture = process.argv[2] ?? 'identity';
const profile = process.argv[3] ?? 'desktop';
const output = `.shots/renderer-harness-${fixture}-${profile}`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const requested of ['webgpu', 'webgl']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(`${message.text()} [${message.location().url}]`); });
    try {
      await page.goto(`http://127.0.0.1:5192/?rendererHarness=1&renderer=${requested}&materialFixture=${fixture}&verifyCloudField=1&profile=${profile}`);
      await page.waitForSelector('#renderer-harness-status');
      await page.waitForFunction(() => document.querySelector('#canvas')?.dataset.materialReady === 'true', null, { timeout: 90000 });
      if (fixture === 'scenery') await page.waitForFunction(() => document.querySelector('#canvas')?.dataset.cloudComparison);
      if (fixture === 'grass') await page.waitForFunction(() => document.querySelector('#canvas')?.dataset.grassComparison, null, { timeout: 90000 });
      if (fixture === 'impostor') await page.waitForFunction(() => document.querySelector('#canvas')?.dataset.impostorComparison, null, { timeout: 90000 });
      if (fixture === 'foliage') await page.waitForFunction(() => document.querySelector('#canvas')?.dataset.foliageComparison, null, { timeout: 90000 });
      if (fixture === 'trail') await page.waitForFunction(() => document.querySelector('#canvas')?.dataset.trailComparison, null, { timeout: 90000 });
      if (fixture === 'bake') await page.waitForFunction(() => document.querySelector('#canvas')?.dataset.bakeComparison, null, { timeout: 90000 });
      if (fixture === 'stone') await page.waitForFunction(() => document.querySelector('#canvas')?.dataset.stoneShader, null, { timeout: 90000 });
      if (fixture === 'water') await page.waitForFunction(() => document.querySelector('#canvas')?.dataset.refractionComparison, null, { timeout: 180000 });
      if (fixture === 'cloudresponse') await page.waitForFunction(() => document.querySelector('#canvas')?.dataset.cloudResponseComparison, null, { timeout: 90000 });
      if (fixture === 'actor') await page.waitForFunction(() => document.querySelector('#canvas')?.dataset.actorComparison, null, { timeout: 90000 });
      if (fixture === 'volume') await page.waitForFunction(() => document.querySelector('#canvas')?.dataset.volumeComparison);
      await page.waitForTimeout(2500);
      const actual = await page.locator('#canvas').getAttribute('data-renderer');
      assert.equal(actual, requested === 'webgl' ? 'webgl2' : 'webgpu');
      if (['scenery', 'volume'].includes(fixture)) {
        assert.equal(await page.locator('#canvas').getAttribute('data-sky-environment'), String(profile !== 'compact'),
          'Desktop sky must produce a node PMREM environment; compact skips the bake');
      }
      await page.screenshot({ path: `${output}/${requested}.png` });
      await page.setViewportSize({ width: 900, height: 650 });
      await page.waitForTimeout(250);
      const comparison = await page.locator('#canvas').getAttribute('data-cloud-comparison');
      if (fixture === 'scenery') assert.ok(JSON.parse(comparison).maximum <= 1, 'Cloud field differs from legacy by more than one RGBA8 quantization step');
      const volume = await page.locator('#canvas').getAttribute('data-volume-comparison');
      if (fixture === 'volume') {
        const metric = JSON.parse(volume);
        assert.ok(metric.nonzero > 100, 'Volume comparison must exercise visible cloud samples');
        assert.ok(metric.maximum <= 8 && metric.mean <= 0.02,
          `Matched cloud raymarch exceeds the recorded RGBA8 precision tolerance: ${volume}`);
      }
      const terrain = await page.locator('#canvas').getAttribute('data-terrain-comparison');
      const terrainNormal = await page.locator('#canvas').getAttribute('data-terrain-normal-comparison');
      const sky = await page.locator('#canvas').getAttribute('data-sky-comparison');
      const horizon = await page.locator('#canvas').getAttribute('data-horizon-comparison');
      const temporal = await page.locator('#canvas').getAttribute('data-temporal-comparison');
      const shadows = await page.locator('#canvas').getAttribute('data-shadow-comparison');
      const palette = await page.locator('#canvas').getAttribute('data-palette-comparison');
      const grass = await page.locator('#canvas').getAttribute('data-grass-comparison');
      const impostor = await page.locator('#canvas').getAttribute('data-impostor-comparison');
      const foliage = await page.locator('#canvas').getAttribute('data-foliage-comparison');
      const trail = await page.locator('#canvas').getAttribute('data-trail-comparison');
      const bake = await page.locator('#canvas').getAttribute('data-bake-comparison');
      const stone = await page.locator('#canvas').getAttribute('data-stone-comparison');
      const stoneShader = await page.locator('#canvas').getAttribute('data-stone-shader');
      const cloudResponse = await page.locator('#canvas').getAttribute('data-cloud-response-comparison');
      if (fixture === 'cloudresponse') {
        const reports = JSON.parse(cloudResponse);
        assert.equal(reports.length, 2);
        for (const report of reports) {
          assert.ok(report.lit > 20000, `The probe ground must fill the frame: ${cloudResponse}`);
          // `relativeDirect` normalizes by the focus transmittance, so ground
          // at or above focus clamps to full brightness and only genuinely
          // shadowed ground carries a value. Both the share and the depth of
          // the darkest sample are asserted, so the run cannot pass by
          // comparing a constant against a constant.
          assert.ok(report.shaded > report.lit * 0.1 && report.referenceMinimum < 160,
            `The run must sweep a real range of cloud shadow: ${cloudResponse}`);
          // Both routes read the same uniform table and neither samples a mip,
          // so a difference here would be projection, filtering, fade or clamp.
          assert.ok(report.maximum <= 1 && report.differing === 0,
            `Cloud shadow reaches a material differently on the two routes: ${cloudResponse}`);
        }
      }
      const actor = await page.locator('#canvas').getAttribute('data-actor-comparison');
      if (fixture === 'actor') {
        const reports = JSON.parse(actor);
        assert.equal(reports.length, 10);
        for (const feature of ['flat', 'vertexColors', 'map', 'skinned', 'backSide']) {
          const of = (respond) => reports.find(
            (entry) => entry.feature === feature && entry.respond === respond);
          const control = of(false), responded = of(true);
          assert.ok(control && responded, `Missing an actor run for ${feature}: ${actor}`);
          // The skinned run's subject is a single limb rather than the knot and
          // sphere pair, so it covers less of the frame while still being a
          // substantial lit area.
          const minimum = feature === 'skinned' ? 3000 : 6000;
          assert.ok(control.nonzero > minimum && responded.nonzero > minimum,
            `Both ${feature} runs must cover the figures: ${actor}`);
          assert.equal(responded.coverageMismatch, 0,
            `The ${feature} response must not change the silhouette: ${actor}`);
          // The two lighting implementations are not bit-identical on their own,
          // so the unpatched run at the same feature is the yardstick: adding
          // the response must not move the image measurably further apart than
          // that feature's own lighting already is.
          assert.ok(responded.maximum <= Math.max(control.maximum, 2)
            && responded.mean <= Math.max(control.mean * 1.5, 0.01),
          `The portable actor response diverges beyond the ${feature} baseline: ${actor}`);
        }
      }
      const water = await page.locator('#canvas').getAttribute('data-water-comparison');
      const waterSurface = await page.locator('#canvas').getAttribute('data-water-surface-comparison');
      const waterCascade = await page.locator('#canvas').getAttribute('data-cascade-comparison');
      const waterRefraction = await page.locator('#canvas').getAttribute('data-refraction-comparison');
      if (fixture === 'water') {
        const reports = JSON.parse(water);
        assert.equal(reports.length, 2);
        for (const report of reports) {
          assert.ok(report.nonzero > 4000, `The bed must cover the reach: ${water}`);
          // Nothing here is API-dependent once the stipple reads the same
          // fragment coordinate the shipped material does: the same margin
          // pixels dissolve and the bed agrees to a quantization step.
          assert.ok(report.maximum <= 1 && report.differing === 0
            && report.coverageMismatch === 0,
          `Node water bed differs from the GLSL material: ${water}`);
        }
        const surface = await page.locator('#canvas').getAttribute('data-water-surface-comparison');
        const surfaceReports = JSON.parse(surface);
        assert.equal(surfaceReports.length, 7);
        assert.ok(surfaceReports.find((report) => report.capturedRefraction)?.refractionChanged > 100,
          `The capture must visibly affect the water surface: ${surface}`);
        assert.equal(surfaceReports.find((report) => report.capturedRefraction)?.captureDiffering, 0,
          `The integrated run must start from matching refraction captures: ${surface}`);
        for (const report of surfaceReports) {
          assert.ok(report.nonzero > 4000,
            `${report.channel} must cover the reach: ${surface}`);
          assert.equal(report.coverageMismatch, 0,
            `Node water surface discards different fragments: ${surface}`);
          if (actual === 'webgl2') {
            // Same API on both sides, and nothing in the surface reads a
            // derivative or a mip: the port is exact to a quantization step.
            assert.ok(report.maximum <= 1 && report.differing === 0,
              `Node water surface differs from the GLSL material: ${surface}`);
          } else {
            // WebGPU. The flow noise is sampled with mip selection driven by
            // screen-space gradients, which the two APIs do not compute
            // identically, so a handful of pixels land on the far side of a
            // smoothstep and carry through every term downstream of the noise.
            // Measured: at most 26 of 66,702 channels move by more than a
            // quantization step, the worst by 19. The mean is bounded loosely
            // because the roughness channel is a near-flat ramp that sits on a
            // byte boundary, so a few thousand of its pixels are one apart on
            // the same-API run too; the differing count is what discriminates.
            assert.ok(report.mean <= 0.08 && report.maximum <= 24
              && report.differing <= report.shared * 3 * 0.001,
            `Node water surface exceeds the recorded WebGPU tolerance: ${surface}`);
          }
        }
        const cascade = await page.locator('#canvas').getAttribute('data-cascade-comparison');
        const cascadeReports = JSON.parse(cascade);
        assert.equal(cascadeReports.length, 4);
        for (const report of cascadeReports) {
          // The alpha run covers far fewer pixels than the albedo one on
          // purpose: most of a curtain is genuinely see-through, so its alpha
          // rounds to zero at byte precision while its colour never does.
          assert.ok(report.nonzero > (report.channel === 'alpha' ? 1000 : 3000),
            `The ${report.channel} run must cover both curtains: ${cascade}`);
          assert.equal(report.coverageMismatch, 0,
            `Node cascade covers different fragments: ${cascade}`);
          // The curtain is unlit and samples its noise with no mip selection of
          // its own, so nothing here crosses an API boundary on either backend.
          assert.ok(report.maximum <= 1 && report.differing === 0,
            `Node cascade differs from the GLSL material: ${cascade}`);
        }
        const refraction = await page.locator('#canvas').getAttribute('data-refraction-comparison');
        const refractionReports = JSON.parse(refraction);
        assert.equal(refractionReports.length, 2);
        for (const report of refractionReports) {
          // The capture must contain the two refractable boxes and not the
          // excluded one; the coverage mask must mark exactly those pixels.
          assert.ok(report.nonzero > 1500 && report.legacyNonzero > 1500,
            `The ${report.channel} run must capture the refractable geometry: ${refraction}`);
          assert.ok(report.maximum <= 1 && report.differing === 0,
            `Portable refraction capture differs from the shipped pass: ${refraction}`);
        }
      }
      if (fixture === 'stone') {
        const reports = JSON.parse(stone);
        assert.equal(reports.length, 5);
        for (const report of reports) {
          assert.ok(report.nonzero > 8000,
            `${report.variant} ${report.mode} must cover the stone body: ${stone}`);
          const detailAlbedo = report.variant === 'detail' && report.mode === 'albedo';
          // The lit run carries the detail albedo's threshold-edge pixels
          // through the lighting that consumes it, so it is bounded just above
          // the residual that mode already has rather than at the exact step
          // the coarse body and the normal hold.
          const detailLit = report.variant === 'detail' && report.mode === 'lit';
          if (actual === 'webgl2') {
            // Same API on both sides. The coarse surface is exact; the detail
            // albedo keeps a handful of threshold-edge pixels where the crust,
            // stain and colony smoothsteps land on opposite sides of a byte
            // after a different order of operations, and the derivative-built
            // normal bump agrees to a quantization step.
            assert.ok(report.maximum <= (detailAlbedo ? 4 : detailLit ? 2 : 1)
              && report.differing <= report.nonzero * 3 * 0.001,
            `Node stone ${report.variant} ${report.mode} differs from the GLSL material: ${stone}`);
            continue;
          }
          // Against a WebGL reference the stone's screen-space derivatives —
          // the bedding antialias and the whole grain bump — are being compared
          // across an API boundary, which moves individual facet-edge pixels a
          // long way while leaving the surface as a whole in place. Bounded on
          // the average rather than on a maximum, and deliberately still
          // measured; the same-API run above is what holds the port exact.
          // The lit mode shades with that same derivative-built normal, so it
          // inherits a fraction of the normal run's cross-API spread.
          assert.ok(report.mean <= (report.mode === 'normal' ? 3 : report.mode === 'lit' ? 0.8 : 0.1),
            `Node stone ${report.variant} ${report.mode} differs from the GLSL material: ${stone}`);
        }
      }
      if (fixture === 'stone') {
        // The node equivalent of the shipped string-based stone shader check.
        // TSL names nothing in its output, so that check's marker strings do
        // not exist in generated WGSL or GLSL; what survives is the cost. The
        // near path is the only one that takes screen-space derivatives and the
        // only one that samples the grain texture, so the far material running
        // neither is the same guarantee against the compiled program.
        const programs = JSON.parse(stoneShader);
        assert.equal(programs.length, 2, `Both stone programs must compile: ${stoneShader}`);
        const detail = programs.find((program) => program.variant === 'detail');
        const coarse = programs.find((program) => program.variant === 'coarse');
        assert.ok(detail.derivatives && detail.textureSamples,
          `The detail stone program must run the near grain path: ${stoneShader}`);
        assert.ok(!coarse.derivatives && !coarse.textureSamples,
          `The coarse stone program must not run derivatives or sample the grain: ${stoneShader}`);
        // Measured at about 0.17 on both backends. Bounded well above that so
        // ordinary codegen churn does not fail the run, and far below 1 so a
        // coarse material that grew the near work could not pass.
        assert.ok(coarse.length < detail.length * 0.4 && coarse.length > 200,
          `The coarse stone program must stay a fraction of the detail one: ${stoneShader}`);
      }
      if (fixture === 'bake') {
        const report = JSON.parse(bake);
        assert.equal(report.frames, 16, `The bake must fill every atlas cell: ${bake}`);
        assert.ok(report.covered > 400 && report.covered === report.legacyCovered,
          `Both bakers must cover the same atlas texels: ${bake}`);
        assert.ok(report.metadataMatches, `The bake manifests must be identical: ${bake}`);
        // The exported PNG is consumed by the atlas factory and the QA scene,
        // so a view in the wrong cell or a flipped row order is a wrong atlas,
        // not a tolerance.
        assert.ok(report.maximum <= 1 && report.mean <= 0.01,
          `Node impostor bake differs from the WebGL bake: ${bake}`);
      }
      if (fixture === 'trail') {
        for (const report of JSON.parse(trail)) {
          assert.ok(report.crushed > 200, `The scripted walk must leave a trail: ${trail}`);
          assert.equal(report.legacyPrecise, report.nodePrecise,
            `Both trail passes must agree on target precision: ${trail}`);
          for (const primed of [report.primed, report.legacyPrimed]) {
            // Neutral is a zero crush direction; a target cleared to black
            // instead would start every texel with a direction of (-1, -1).
            assert.ok(Math.abs(primed[0] - 127.5) <= 1 && Math.abs(primed[1] - 127.5) <= 1
              && primed[2] === 0, `A primed trail target must hold neutral: ${trail}`);
          }
          // The contract is not that the two passes agree on raw rows — they
          // store the square in opposite order and three normalizes sampling —
          // but that a material reads the crush where the contact was put.
          assert.ok(report.orientation.atContact > 200 && report.orientation.mirrored < 8,
            `The trail field is stored mirrored: ${trail}`);
          // And the reversal is measured, not assumed: reading the reference
          // unreversed has to be the worse of the two.
          assert.ok(report.unreversedMean > report.mean,
            `The trail row reversal no longer holds: ${trail}`);
          // A feedback loop compounds any divergence, so twenty-four steps of a
          // scripted walk agreeing exactly is a strong statement about the update.
          assert.equal(report.maximum, 0,
            `Node trail pass differs from the GLSL feedback pass: ${trail}`);
        }
      }
      if (fixture === 'foliage') {
        const reports = JSON.parse(foliage);
        assert.equal(reports.length, 4);
        for (const report of reports) {
          assert.ok(report.nonzero > 2000, `${report.variant} accents must cover the frame: ${foliage}`);
          if (actual === 'webgl2' && report.singlePass) {
            // Same API, one pass each: the accent card must be identical.
            assert.ok(report.maximum === 0 && report.coverageMismatch === 0,
              `Node accent foliage ${report.variant} differs from the GLSL material: ${foliage}`);
            continue;
          }
          if (!report.singlePass) {
            // Production settings. Three's node renderer honours the two-pass
            // back/front order for double-sided transparent materials where the
            // WebGL reference draws once, so overlapping accents can resolve to
            // a different card. Bounded, and deliberately still measured.
            assert.ok(report.coverageMismatch === 0 && report.differing <= report.shared * 3 * 0.03,
              `Node accent foliage ${report.variant} two-pass output differs too widely: ${foliage}`);
            continue;
          }
          // Same cross-API allowance as the impostor cards: the reference is a
          // WebGL render, and the cutout sits on a threshold.
          assert.ok(report.coverageMismatch <= report.shared * 0.02,
            `Node accent foliage ${report.variant} coverage differs too widely: ${foliage}`);
          assert.ok(report.differing <= report.shared * 3 * 0.03 && report.mean <= 0.25,
            `Node accent foliage ${report.variant} differs from the GLSL material: ${foliage}`);
        }
      }
      if (fixture === 'impostor') {
        const reports = JSON.parse(impostor);
        assert.equal(reports.length, 2);
        for (const report of reports) {
          assert.ok(report.nonzero > 2500, `${report.variant} cards must cover the frame: ${impostor}`);
          if (actual === 'webgl2') {
            // The reference renders on WebGL 2 as well, so nothing about the
            // card is allowed to differ: same pixels, same colour.
            assert.ok(report.maximum === 0 && report.coverageMismatch === 0,
              `Node grass impostor ${report.variant} differs from the GLSL material: ${impostor}`);
            continue;
          }
          // Against a WebGL reference the card's stochastic thresholds sit on
          // the far side of an API boundary: last-bit differences in attribute
          // interpolation and in backend mip generation flip a discard here and
          // there. Bounded as a fraction of the cards rather than by a maximum,
          // since one flipped pixel is a whole card colour away from the sky.
          assert.ok(report.coverageMismatch <= report.shared * 0.02,
            `Node grass impostor ${report.variant} coverage differs too widely: ${impostor}`);
          assert.ok(report.differing <= report.shared * 3 * 0.01 && report.mean <= 0.25,
            `Node grass impostor ${report.variant} differs from the GLSL material: ${impostor}`);
        }
      }
      if (fixture === 'grass') {
        const reports = JSON.parse(grass);
        assert.equal(reports.length, 16);
        for (const report of reports) {
          // The island layers split one population across two threshold bands,
          // so each of them draws about half the field the world layers do.
          const floor = report.variant.startsWith('island') ? 2500 : 4000;
          assert.ok(report.nonzero > floor,
            `${report.variant} ${report.mode} must draw a visible blade field: ${grass}`);
          // One RGBA8 step of albedo, and one step of the 1.5 per metre
          // deformation encoding: 2.6 mm of blade movement.
          assert.ok(report.maximum <= 1 && report.mean <= 0.002,
            `Node grass ${report.variant} ${report.mode} differs from the GLSL material: ${JSON.stringify(report)}`);
        }
      }
      if (fixture === 'palette') {
        const metric = JSON.parse(palette);
        // Compared against the CPU baker, not a second GPU render: both
        // backends agree exactly with each other, and the residual is single
        // steps where float32 and float64 round to different sides of a byte
        // boundary. Max stays at one step, which any formula error would break.
        assert.ok(metric.maximum <= 1 && metric.mean <= 0.05,
          `Grass TSL palette differs from its CPU atlas/baking reference: ${palette}`);
      }
      if (fixture === 'volume') {
        const metric = JSON.parse(temporal);
        assert.equal(metric.reports.length, 2);
        for (const report of metric.reports) assert.ok(report.maximum <= 1 && report.mean <= 0.001,
          'Cloud temporal reprojection differs from the original shader');
      }
      if (['scenery', 'volume'].includes(fixture)) {
        const shadow = JSON.parse(shadows);
        assert.ok(shadow.maximum <= 1 && shadow.mean <= 0.001 && shadow.focusDifference === 0 && shadow.originDifference === 0,
          'Cloud shadow map or CPU focus projection differs from the original');
        for (const [label, raw] of [['sky', sky], ['horizon', horizon]]) {
          const metric = JSON.parse(raw);
          assert.ok(metric.nonzero > 15000 && metric.maximum <= 1 && metric.mean <= 0.001,
            `${label} exceeds the original shader's RGBA8 precision tolerance`);
        }
      }
      if (fixture === 'terrain') {
        const metric = JSON.parse(terrain);
        assert.ok(metric.nonzero > 15000, 'Terrain comparison must exercise visible ground');
        assert.ok(metric.maximum <= 1 && metric.mean <= 0.001,
          'Terrain albedo differs from legacy beyond RGBA8 quantization tolerance');
        const normal = JSON.parse(terrainNormal);
        assert.ok(normal.nonzero > 15000 && normal.maximum <= 1 && normal.mean <= 0.02,
          'Terrain surface normals differ from legacy beyond RGBA8 quantization tolerance');
      }
      results.push({ requested, actual, cloudResponse: cloudResponse && JSON.parse(cloudResponse), actor: actor && JSON.parse(actor), grass: grass && JSON.parse(grass), impostor: impostor && JSON.parse(impostor), foliage: foliage && JSON.parse(foliage), trail: trail && JSON.parse(trail), bake: bake && JSON.parse(bake), stone: stone && JSON.parse(stone), water: water && JSON.parse(water), waterSurface: waterSurface && JSON.parse(waterSurface), waterCascade: waterCascade && JSON.parse(waterCascade), waterRefraction: waterRefraction && JSON.parse(waterRefraction), comparison: comparison && JSON.parse(comparison), volume: volume && JSON.parse(volume), temporal: temporal && JSON.parse(temporal), shadows: shadows && JSON.parse(shadows), terrain: terrain && JSON.parse(terrain), terrainNormal: terrainNormal && JSON.parse(terrainNormal), sky: sky && JSON.parse(sky), horizon: horizon && JSON.parse(horizon), palette: palette && JSON.parse(palette), errors });
    } catch (error) {
      results.push({ requested, failure: error.message, errors });
    } finally { await page.close(); }
    console.log(JSON.stringify(results.at(-1)));
  }
} finally {
  await browser.close();
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
}
if (results.some((r) => r.failure || r.errors.length)) process.exitCode = 1;
