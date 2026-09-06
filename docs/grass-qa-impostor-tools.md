# Grass QA and impostor tools

## Deterministic grass QA

Open the application with:

```text
?qa=grass
```

The runner captures four deterministic views: close, near-to-mid transition, aerial, and far. It records frame-time percentiles, renderer draw statistics, visible patch counts, and submitted clump counts.

Optional parameters:

```text
?qa=grass&warmup=1.5&duration=4&download=1
```

When `download=1`, the browser attempts to download the screenshots and JSON report. Download links remain visible if automatic downloads are blocked. The report is also exposed as `window.__FLUFFY_GRASS_QA__`.

## World visual matrix (AAA water + grass)

Open the world scene with:

```text
?qa=visual-matrix&profile=desktop&diagnostics=1&gpuTiming=1
```

Use `profile=compact` for the mobile quality path. The runner waits until near grass is streamed, finds deterministic landmarks around spawn, and exposes `window.__FLUFFY_WORLD_VISUAL_QA__`.

```js
await window.__FLUFFY_WORLD_VISUAL_QA__.apply(0)
```

Each `apply(index)` teleports the capture camera, warms streaming, and records HUD / frame / draw stats. Screenshot files belong under `qa/aaa-look/` using `{profile}-{pose}.png`.

## Hemi-octahedral impostor bake

Open the application with:

```text
?grassImpostorBake=1
```

The baker selects the most populated grass patch and renders a deterministic upper-hemisphere octahedral atlas. It produces an albedo/alpha PNG and JSON metadata with view directions, atlas viewports, source bounds, and mapping details.

The metadata is exposed as `window.__FLUFFY_GRASS_IMPOSTOR_BAKE__`.

Current scope is the baker foundation. Normal/roughness, depth/thickness, gutter dilation, and runtime impostor rendering remain future work.

## Detail foliage atlas inspection

Open the world scene with:

```text
?accentAtlas=1
```

The accent atlas is baked at grass initialization either way; this pins its canvas to the page
so all sixteen cells — eight species across two variant rows — can be eyeballed against a
checkerboard. The channels are semantic rather than display colour (R progress, G shade,
B accent-tint mask, A coverage), so the cells read as orange/green data, not as finished
plants; the finished look is what the material resolves through `grassResolvePalette` and the
per-instance tint. See [grass-detail-foliage-plan.md](grass-detail-foliage-plan.md).
