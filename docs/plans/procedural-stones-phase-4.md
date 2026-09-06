# Procedural Stylized Stones — Phase 4 Implementation Specification

## Status

- Parent plan: `docs/plans/procedural-stones-plan.md`
- Phase 1 contract: `docs/plans/procedural-stones-phase-1.md`
- Phase 2 contract: `docs/plans/procedural-stones-phase-2.md`
- Phase 3 contract: `docs/plans/procedural-stones-phase-3.md`
- Target branch: `main`
- Phase: 4 — stylized material and colour system
- Document authority: implementation contract
- Current state: completed
- Scope owner: palette resolution, material recipes, Phase 3 detail-field shader parity, stylized lighting, fixed visual QA gallery, and material lifecycle

This document removes implementation choices from Phase 4. The implementer must follow the file layout, public APIs, palette catalogue, configuration values, material recipe rules, geometry-attribute extension, uniform packing, shader equations, verification matrix, ownership rules, and completion criteria below. A different material base, palette set, shader data layout, detail evaluation strategy, configuration format, or QA scene requires this document to be changed first.

## Phase objective

Implement the production stylized material used by Phase 3 detailed stones.

Phase 4 must convert the Phase 3 semantic and analytic detail data into a coherent illustrated stone appearance with:

- broad semantic colour regions;
- controlled top-facing lightening;
- darker primary cuts, detail cuts, contact faces, and undersides;
- visible weathering bands, broad grooves, cracks, and shallow recesses;
- restrained deterministic variation between faces and stones;
- a soft quantized diffuse response;
- compatibility with Three.js lights, directional shadows, fog, tone mapping, and output colour management;
- no photographic texture dependency;
- no unique high-resolution texture per stone.

The material must preserve the approved shape language. It must not hide broad planes under noisy procedural texture or high-frequency colour variation.

## Required dependency state

Phase 4 starts only after these verification gates pass:

```bash
npm run test:stone-core
npm run test:stone-archetypes
npm run test:stone-details
```

The implementation consumes these existing contracts without replacing them:

- `StoneRandom`
- `StoneDetailedGenerator`
- `StoneDetailedGenerationResult`
- `StoneDetailRecipe`
- `StoneSurfaceDetail`
- `StoneSemanticModel`
- `StoneSemanticRegion`
- `StoneSurfaceFieldSample`
- `evaluateStoneSurfaceDetails`
- `STONE_FACE_SEMANTICS`
- all Phase 3 semantic and face-flag numeric encodings;
- the Phase 3 geometry attributes;
- `STONE_DETAIL_GALLERY_CASES`;
- `StoneArchetypeId` and `STONE_ARCHETYPE_IDS`.

The Phase 1 core recipe version remains `1`.

The Phase 2 archetype recipe version remains `1`.

The Phase 3 detail recipe version remains `1`.

The Phase 4 material recipe version is `1`.

The Phase 4 shader version is `1`.

## Compatibility contract

Phase 4 must preserve all previous generation paths.

These calls must produce exactly the same outputs they produced before Phase 4:

```ts
new StoneCoreGenerator(coreConfig).generate(seed)
```

```ts
new StoneArchetypeGenerator(
  coreGenerator,
  archetypeConfig,
).generate(archetypeId, seed)
```

```ts
new StoneDetailedGenerator(
  coreGenerator,
  archetypeGenerator,
  archetypeAnalyzer,
  archetypeEvaluator,
  detailConfig,
).generate(archetypeId, seed)
```

Phase 4 must not change:

- Phase 1 recipes;
- Phase 1 positions, normals, indices, metrics, or fingerprints;
- Phase 2 recipes, evaluation, attempts, or metadata;
- Phase 3 detail recipes, semantic models, geometry attributes, fingerprints, attempts, or metadata.

The Phase 4 material generator receives a completed `StoneDetailedGenerationResult` and creates a separate material-ready geometry. It must not mutate the Phase 3 geometry or any Phase 3 immutable data.

## Frozen architectural decisions

The following decisions are final for Phase 4:

1. The material base is `THREE.MeshToonMaterial`.
2. The material is extended through `onBeforeCompile`; Phase 4 does not replace Three.js lighting with a fully custom `ShaderMaterial`.
3. Using `MeshToonMaterial` is deliberate: it preserves Three.js direct and hemisphere lighting, shadows, fog, tone mapping, clipping, depth handling, and renderer integration while providing a controlled quantized diffuse response.
4. The material has no metallic or glossy response. Do not emulate metalness, clearcoat, or polished stone in Phase 4.
5. The shared visual response uses a five-step nearest-filtered gradient map.
6. Every material instance owns its five-pixel gradient texture and disposes it with the material. Shared texture lifetime management is deferred to Phase 8.
7. Stone surface details are evaluated analytically in the fragment shader from fixed-size uniform arrays.
8. Do not bake the Phase 3 detail fields into per-stone textures.
9. Do not convert cracks, grooves, bands, or recesses into geometry.
10. The GLSL detail equations must match the Phase 3 CPU reference equations.
11. The shader supports exactly the Phase 3 maximum of six surface descriptors.
12. Descriptor uniforms use four `vec4` arrays plus one count uniform. Do not use GLSL structs or one uniform object per detail.
13. Face semantic values and flags continue to use the exact Phase 3 numeric encodings.
14. Integer-like face attributes remain ordinary interpolated float varyings. Phase 3 already splits geometry at polygon boundaries, so every triangle receives constant values.
15. Palette colours are authored as six-digit sRGB hex values in strict YAML and converted to linear RGB on the CPU.
16. Shader colour calculations occur in linear working space. Do not apply manual sRGB encoding in the stone shader.
17. Three.js output colour conversion and ACES tone mapping remain responsible for final display encoding.
18. Palette choice is explicit. Phase 4 does not choose palettes from biomes or terrain.
19. The caller requests one canonical palette ID.
20. The same detailed stone and palette always resolve to the same material recipe and face variation.
21. Palette changes preserve the same face-variation pattern. Palette ID does not affect random face-variation streams.
22. The material recipe contains only serializable plain values and ordinary arrays.
23. Phase 4 adds one namespaced geometry attribute: `stoneMaterialVariation`.
24. Phase 4 does not add generic `uv`, `color`, tangent, or barycentric attributes.
25. Phase 4 does not recalculate positions, normals, bounds, semantic attributes, or indices.
26. The Phase 4 geometry is a separate owned copy. The Phase 3 geometry remains owned by the caller of the Phase 3 generator until Phase 4 accepts ownership as specified by the generator API.
27. Material shader source patching uses exact Three.js chunk anchors and fails loudly when an expected anchor is absent.
28. `customProgramCacheKey` depends only on Phase 4 shader version and maximum detail count, not palette or stone values.
29. Palette, recipe, and detail values are uniforms or attributes, so all Phase 4 materials compile through the same shader program shape.
30. The material is opaque, front-sided, depth-writing, depth-testing, fog-enabled, tone-mapped, and dithered.
31. Mesh shadow casting uses standard Three.js depth and distance materials because Phase 4 does not deform positions or discard fragments.
32. No alpha masking, transparency, transmission, refraction, screen-space outline, rim-light outline, or post-processing is added.
33. No image texture, normal map, roughness map, environment map, or procedural noise texture is used.
34. No time-varying material animation is added.
35. No logging occurs in palette, recipe, packing, geometry decoration, material, or generator classes. Failures use typed errors.
36. Verification uses Vite SSR and existing dependencies only.
37. Shader compilation on a GPU is not part of the automated SSR verifier. A fixed browser QA gallery provides the required real-renderer check.
38. The QA gallery is fixed and non-authoring. Interactive palette editing and stone bench tools remain Phase 9 work.
39. Phase 4 does not place stones in the streamed world.
40. Phase 4 does not implement LODs, impostors, caching, instancing, workers, biome selection, terrain blending, collision, or asset export.

## In scope

Phase 4 includes:

- strict material and palette configuration;
- eight canonical palette presets;
- exact sRGB-to-linear colour conversion;
- deterministic material recipe resolution;
- deterministic per-region value and saturation variation;
- Phase 4 geometry decoration;
- fixed detail-uniform packing;
- GLSL ports of all Phase 3 detail fields;
- semantic colour selection;
- top-facing colour blending;
- dominant-face emphasis;
- broad groove, band, crack, and recess colour response;
- a five-step toon gradient texture;
- a `MeshToonMaterial` extension with stable shader patching;
- palette, recipe, material, and material-asset fingerprints;
- material and geometry lifecycle rules;
- a fixed real-renderer gallery scene;
- deterministic and shader-source verification;
- a production-build verification gate.

## Explicitly out of scope

Do not implement any of these items in Phase 4:

- random palette selection;
- biome-to-palette mapping;
- moss placement logic;
- lichen, snow, wetness, dirt, dust, soot, blood, paint, or decals;
- mineral veins beyond the existing band descriptor;
- photographic albedo textures;
- unique texture baking;
- texture atlases;
- tri-planar mapping;
- normal maps or procedural normal perturbation;
- parallax or displacement;
- micro-noise, grain, pores, speckles, or pitting;
- screen-space outlines;
- silhouette expansion;
- translucent minerals or crystals;
- metallic, clearcoat, sheen, iridescence, or anisotropy;
- environment reflections;
- runtime palette editing UI;
- full stone bench controls;
- LODs or impostors;
- world placement or terrain blending;
- batching, instancing, material atlases, caches, workers, or streaming;
- collision or physics;
- glTF export;
- screenshot-diff automation;
- automatic fallback materials.

## Required file changes

### New files

Create exactly these files:

```text
public/config/stone-materials.yaml

src/stones/materials/StoneMaterialTypes.ts
src/stones/materials/StoneMaterialConfig.ts
src/stones/materials/StoneMaterialConfigLoader.ts
src/stones/materials/StoneMaterialErrors.ts
src/stones/materials/StoneColorMath.ts
src/stones/materials/StonePaletteCatalog.ts
src/stones/materials/StonePaletteResolver.ts
src/stones/materials/StoneMaterialRecipeResolver.ts
src/stones/materials/StoneMaterialGeometryDecorator.ts
src/stones/materials/StoneSurfaceDetailUniformPacker.ts
src/stones/materials/StoneSurfaceDetailShader.ts
src/stones/materials/StonePaletteShader.ts
src/stones/materials/StoneToonGradientTexture.ts
src/stones/materials/StoneStylizedMaterial.ts
src/stones/materials/StoneMaterialFingerprint.ts
src/stones/materials/StoneMaterialGenerator.ts
src/stones/materials/index.ts

src/stones/qa/StoneMaterialVerification.ts
src/app/StoneMaterialGalleryApp.ts
scripts/verify-stone-materials.mjs
```

### Existing files to modify

Modify only:

```text
src/main.ts
package.json
```

Do not modify Phase 1, Phase 2, or Phase 3 generation algorithms or committed numeric configuration during Phase 4.

## Package script changes

Add:

```json
"test:stone-materials": "node scripts/verify-stone-materials.mjs"
```

Update the production build command so the Phase 4 gate runs after the Phase 3 gate and before grass verification:

```json
"build": "tsc && node scripts/verify-stone-core.mjs && node scripts/verify-stone-archetypes.mjs && node scripts/verify-stone-details.mjs && node scripts/verify-stone-materials.mjs && node scripts/verify-lod-continuity.mjs && node scripts/verify-lod-color-parity.mjs && node scripts/verify-grass-performance.mjs && vite build"
```

Do not add a dependency.

## Canonical palette catalogue

Use this exact ID union and canonical order:

```ts
export const STONE_PALETTE_IDS = [
  "slate",
  "limestone",
  "sandstone",
  "volcanic",
  "moss-tinted",
  "mineral-blue",
  "weathered-teal",
  "fantasy-amethyst",
] as const;

export type StonePaletteId =
  (typeof STONE_PALETTE_IDS)[number];
```

Do not rename IDs, add aliases, or change their order in Phase 4.

Palette intent:

| Palette | Required visual intent |
| --- | --- |
| `slate` | Cool neutral grey-blue stone suitable for common rock and mountain use. |
| `limestone` | Warm pale stone with restrained cream and beige values. |
| `sandstone` | Warm orange-brown stone with readable sunlit planes. |
| `volcanic` | Very dark charcoal stone with enough value separation to preserve planes. |
| `moss-tinted` | Desaturated green-grey stone; this is a stone palette, not a moss overlay. |
| `mineral-blue` | Muted cyan-blue fantasy mineral stone matching the approved illustrated family. |
| `weathered-teal` | Grey teal stone with aged, subdued contrast. |
| `fantasy-amethyst` | Muted violet fantasy stone without metallic or crystal rendering. |

## Public Phase 4 types

`StoneMaterialTypes.ts` must define these exact contracts.

```ts
export interface StoneLinearColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface StonePaletteSource {
  readonly id: StonePaletteId;
  readonly enabled: boolean;
  readonly underside: string;
  readonly contact: string;
  readonly side: string;
  readonly upper: string;
  readonly top: string;
  readonly cut: string;
  readonly detailCut: string;
  readonly band: string;
  readonly groove: string;
  readonly crack: string;
  readonly recess: string;
}

export interface StoneResolvedPalette {
  readonly id: StonePaletteId;
  readonly underside: Readonly<StoneLinearColor>;
  readonly contact: Readonly<StoneLinearColor>;
  readonly side: Readonly<StoneLinearColor>;
  readonly upper: Readonly<StoneLinearColor>;
  readonly top: Readonly<StoneLinearColor>;
  readonly cut: Readonly<StoneLinearColor>;
  readonly detailCut: Readonly<StoneLinearColor>;
  readonly band: Readonly<StoneLinearColor>;
  readonly groove: Readonly<StoneLinearColor>;
  readonly crack: Readonly<StoneLinearColor>;
  readonly recess: Readonly<StoneLinearColor>;
}

export interface StoneRegionMaterialVariation {
  readonly regionId: number;
  readonly regionKey: string;
  readonly valueMultiplier: number;
  readonly saturationMultiplier: number;
}

export interface StoneMaterialRecipe {
  readonly version: 1;
  readonly shaderVersion: 1;
  readonly seed: number;
  readonly paletteId: StonePaletteId;
  readonly sourceAssetFingerprint: string;
  readonly valueScale: number;
  readonly saturationScale: number;
  readonly regionVariations:
    readonly Readonly<StoneRegionMaterialVariation>[];
}

export interface StoneSurfaceDetailUniformPayload {
  readonly count: number;
  readonly header: Float32Array;
  readonly data0: Float32Array;
  readonly data1: Float32Array;
  readonly data2: Float32Array;
}

export interface StoneMaterialFingerprints {
  readonly paletteFingerprint: string;
  readonly recipeFingerprint: string;
  readonly materialFingerprint: string;
  readonly materialAssetFingerprint: string;
}

export interface StoneMaterialGenerationResult {
  readonly geometry: THREE.BufferGeometry;
  readonly material: StoneStylizedMaterial;
  readonly recipe: Readonly<StoneMaterialRecipe>;
  readonly palette: Readonly<StoneResolvedPalette>;
  readonly fingerprints: Readonly<StoneMaterialFingerprints>;
}
```

Import Three.js and `StoneStylizedMaterial` only in the real result file location where needed. Keep pure type and colour modules free of Three.js imports.

Every ordinary returned object and ordinary array must be deeply frozen. Typed arrays are owned and treated as immutable after construction; do not attempt to freeze typed-array elements.

## Configuration contract

### File

Create:

```text
public/config/stone-materials.yaml
```

Parse through:

```ts
FlatConfig.parse(source, "stone-materials")
```

The file is strict flat YAML. Every key must be consumed exactly once.

### Exact committed values

Create the file with exactly these values and section comments:

```yaml
# Phase 4 schema and shader limits
stoneMaterialConfigVersion: 1
stoneMaterialRecipeVersion: 1
stoneMaterialShaderVersion: 1
stoneMaterialMaximumSurfaceDetails: 6
stoneMaterialMaximumRegions: 255

# Deterministic material variation
stoneMaterialValueScaleMin: 0.96
stoneMaterialValueScaleMax: 1.04
stoneMaterialSaturationScaleMin: 0.94
stoneMaterialSaturationScaleMax: 1.06
stoneMaterialFaceValueVariation: 0.055
stoneMaterialFaceSaturationVariation: 0.045

# Semantic and detail colour response
stoneMaterialTopOrientationBlend: 0.22
stoneMaterialCutOrientationBlendScale: 0.55
stoneMaterialDetailCutOrientationBlendScale: 0.30
stoneMaterialDominantFaceBoost: 0.035
stoneMaterialBandBlend: 0.72
stoneMaterialGrooveBlend: 0.78
stoneMaterialCrackBlend: 0.95
stoneMaterialRecessBlend: 0.68
stoneMaterialMinimumLinearColor: 0
stoneMaterialMaximumLinearColor: 4

# Toon gradient, ascending linear multipliers
stoneMaterialGradientStopCount: 5
stoneMaterialGradientStop0: 0.56
stoneMaterialGradientStop1: 0.70
stoneMaterialGradientStop2: 0.82
stoneMaterialGradientStop3: 0.93
stoneMaterialGradientStop4: 1.00

# Slate palette
stoneSlateEnabled: true
stoneSlateUnderside: "#24292f"
stoneSlateContact: "#343a42"
stoneSlateSide: "#56616b"
stoneSlateUpper: "#68737c"
stoneSlateTop: "#7b8790"
stoneSlateCut: "#454f58"
stoneSlateDetailCut: "#364049"
stoneSlateBand: "#85919a"
stoneSlateGroove: "#384149"
stoneSlateCrack: "#20262c"
stoneSlateRecess: "#303840"

# Limestone palette
stoneLimestoneEnabled: true
stoneLimestoneUnderside: "#4f493e"
stoneLimestoneContact: "#6b6354"
stoneLimestoneSide: "#9f9680"
stoneLimestoneUpper: "#b3a991"
stoneLimestoneTop: "#c9bea3"
stoneLimestoneCut: "#857c69"
stoneLimestoneDetailCut: "#706858"
stoneLimestoneBand: "#d7ccb0"
stoneLimestoneGroove: "#6d6557"
stoneLimestoneCrack: "#443f36"
stoneLimestoneRecess: "#5e574b"

# Sandstone palette
stoneSandstoneEnabled: true
stoneSandstoneUnderside: "#4a2c22"
stoneSandstoneContact: "#6f4030"
stoneSandstoneSide: "#a86643"
stoneSandstoneUpper: "#bf7a50"
stoneSandstoneTop: "#d49362"
stoneSandstoneCut: "#875039"
stoneSandstoneDetailCut: "#6d3f2f"
stoneSandstoneBand: "#e4ad78"
stoneSandstoneGroove: "#734331"
stoneSandstoneCrack: "#3d251e"
stoneSandstoneRecess: "#5b372a"

# Volcanic palette
stoneVolcanicEnabled: true
stoneVolcanicUnderside: "#101317"
stoneVolcanicContact: "#1c2025"
stoneVolcanicSide: "#343a40"
stoneVolcanicUpper: "#444b52"
stoneVolcanicTop: "#555d65"
stoneVolcanicCut: "#282d32"
stoneVolcanicDetailCut: "#1e2328"
stoneVolcanicBand: "#626c75"
stoneVolcanicGroove: "#1e2328"
stoneVolcanicCrack: "#090b0d"
stoneVolcanicRecess: "#15191d"

# Moss-tinted palette
stoneMossTintedEnabled: true
stoneMossTintedUnderside: "#283025"
stoneMossTintedContact: "#3d4737"
stoneMossTintedSide: "#626d58"
stoneMossTintedUpper: "#748069"
stoneMossTintedTop: "#8b967d"
stoneMossTintedCut: "#4e5947"
stoneMossTintedDetailCut: "#3f483a"
stoneMossTintedBand: "#98a489"
stoneMossTintedGroove: "#3f483a"
stoneMossTintedCrack: "#22281f"
stoneMossTintedRecess: "#343c30"

# Mineral-blue palette
stoneMineralBlueEnabled: true
stoneMineralBlueUnderside: "#1d3238"
stoneMineralBlueContact: "#2e4b52"
stoneMineralBlueSide: "#4f7881"
stoneMineralBlueUpper: "#638e96"
stoneMineralBlueTop: "#79a7ad"
stoneMineralBlueCut: "#3d626a"
stoneMineralBlueDetailCut: "#304f56"
stoneMineralBlueBand: "#8fc0c4"
stoneMineralBlueGroove: "#2e5058"
stoneMineralBlueCrack: "#172b30"
stoneMineralBlueRecess: "#26434a"

# Weathered-teal palette
stoneWeatheredTealEnabled: true
stoneWeatheredTealUnderside: "#21312f"
stoneWeatheredTealContact: "#344a46"
stoneWeatheredTealSide: "#54736e"
stoneWeatheredTealUpper: "#688781"
stoneWeatheredTealTop: "#7f9d96"
stoneWeatheredTealCut: "#425e59"
stoneWeatheredTealDetailCut: "#354c48"
stoneWeatheredTealBand: "#92aaa3"
stoneWeatheredTealGroove: "#334b47"
stoneWeatheredTealCrack: "#1a2a28"
stoneWeatheredTealRecess: "#2b403c"

# Fantasy-amethyst palette
stoneFantasyAmethystEnabled: true
stoneFantasyAmethystUnderside: "#2a2434"
stoneFantasyAmethystContact: "#41384e"
stoneFantasyAmethystSide: "#655978"
stoneFantasyAmethystUpper: "#796b8d"
stoneFantasyAmethystTop: "#9282a6"
stoneFantasyAmethystCut: "#504563"
stoneFantasyAmethystDetailCut: "#40364f"
stoneFantasyAmethystBand: "#a999bd"
stoneFantasyAmethystGroove: "#443a54"
stoneFantasyAmethystCrack: "#211b2a"
stoneFantasyAmethystRecess: "#372e44"
```

### Configuration types

`StoneMaterialConfig.ts` must define explicit immutable groups:

```ts
export interface StoneMaterialVariationConfig {
  readonly valueScaleMinimum: number;
  readonly valueScaleMaximum: number;
  readonly saturationScaleMinimum: number;
  readonly saturationScaleMaximum: number;
  readonly faceValueVariation: number;
  readonly faceSaturationVariation: number;
}

export interface StoneMaterialResponseConfig {
  readonly topOrientationBlend: number;
  readonly cutOrientationBlendScale: number;
  readonly detailCutOrientationBlendScale: number;
  readonly dominantFaceBoost: number;
  readonly bandBlend: number;
  readonly grooveBlend: number;
  readonly crackBlend: number;
  readonly recessBlend: number;
  readonly minimumLinearColor: number;
  readonly maximumLinearColor: number;
}

export interface StoneMaterialGradientConfig {
  readonly stops: readonly number[];
}

export interface StoneMaterialConfig {
  readonly version: 1;
  readonly recipeVersion: 1;
  readonly shaderVersion: 1;
  readonly maximumSurfaceDetails: number;
  readonly maximumRegions: number;
  readonly variation: Readonly<StoneMaterialVariationConfig>;
  readonly response: Readonly<StoneMaterialResponseConfig>;
  readonly gradient: Readonly<StoneMaterialGradientConfig>;
  readonly palettes:
    Readonly<Record<StonePaletteId, Readonly<StonePaletteSource>>>;
}
```

Do not use an index signature for numeric configuration groups.

### Configuration loader requirements

`StoneMaterialConfigLoader` must:

- expose `load(url = "./config/stone-materials.yaml")`;
- expose `parse(source: string)` publicly for verification;
- use `FlatConfig`;
- consume every key exactly once;
- call `assertFullyConsumed()`;
- return a recursively frozen object;
- reject non-finite numbers;
- reject non-integer integer fields;
- parse booleans only from `true` and `false`;
- validate palette strings without constructing Three.js objects;
- identify the invalid key or cross-field relationship in every error.

Apply these cross-field validations exactly:

1. Config, recipe, and shader versions equal `1`.
2. Maximum surface details is exactly `6` in Phase 4.
3. Maximum regions is exactly `255` in Phase 4.
4. Every scalar minimum is less than or equal to its paired maximum.
5. Value scales are greater than `0` and at most `2`.
6. Saturation scales are greater than `0` and at most `2`.
7. Face value and saturation variations are from `0` through `0.25`.
8. Top-orientation blend is from `0` through `1`.
9. Cut and detail-cut orientation scales are from `0` through `1`.
10. Dominant-face boost is from `0` through `0.2`.
11. Band, groove, crack, and recess blends are from `0` through `1`.
12. Minimum linear colour is non-negative.
13. Maximum linear colour is greater than minimum and at most `16`.
14. Gradient stop count equals `5`.
15. Exactly five gradient keys are consumed.
16. Every gradient stop is greater than `0` and at most `1`.
17. Gradient stops are strictly ascending.
18. The final gradient stop equals `1` within `0.000001`.
19. Every canonical palette has exactly one entry.
20. Every committed palette is enabled.
21. Every palette colour matches `^#[0-9a-fA-F]{6}$`.
22. No palette contains an unknown colour role.
23. Palette IDs and order match `STONE_PALETTE_IDS`.

## Colour math

`StoneColorMath.ts` contains pure functions only.

Export:

```ts
export function parseStoneSrgbHex(
  value: string,
): StoneLinearColor;

export function stoneSrgbChannelToLinear(
  value: number,
): number;

export function stoneLinearLuminance(
  color: Readonly<StoneLinearColor>,
): number;

export function applyStoneSaturation(
  color: Readonly<StoneLinearColor>,
  scale: number,
): StoneLinearColor;

export function scaleStoneColor(
  color: Readonly<StoneLinearColor>,
  scale: number,
): StoneLinearColor;

export function mixStoneColor(
  left: Readonly<StoneLinearColor>,
  right: Readonly<StoneLinearColor>,
  amount: number,
): StoneLinearColor;

export function clampStoneColor(
  color: Readonly<StoneLinearColor>,
  minimum: number,
  maximum: number,
): StoneLinearColor;
```

Use this exact sRGB conversion for a normalized channel `c`:

```ts
const linear =
  c <= 0.04045
    ? c / 12.92
    : Math.pow((c + 0.055) / 1.055, 2.4);
```

Parse hex byte pairs, divide by `255`, and convert each channel.

Use Rec. 709 linear luminance:

```text
0.2126 * r + 0.7152 * g + 0.0722 * b
```

Saturation uses:

```ts
const grey = stoneLinearLuminance(color);
return {
  r: grey + (color.r - grey) * scale,
  g: grey + (color.g - grey) * scale,
  b: grey + (color.b - grey) * scale,
};
```

Do not use HSL, HSV, Three.js `Color.offsetHSL`, gamma approximations, or browser CSS parsing.

## Palette catalogue and resolution

`StonePaletteCatalog.ts` contains:

- `STONE_PALETTE_IDS`;
- `StonePaletteId`;
- the exact configuration prefix map;
- `STONE_MATERIAL_GALLERY_CASES` defined later in this document;
- `isStonePaletteId(value: unknown): value is StonePaletteId`.

`StonePaletteResolver` must expose:

```ts
export class StonePaletteResolver {
  constructor(config: Readonly<StoneMaterialConfig>);

  listPalettes(): readonly StonePaletteId[];

  resolve(
    paletteId: StonePaletteId,
    valueScale: number,
    saturationScale: number,
  ): Readonly<StoneResolvedPalette>;
}
```

Resolution order for every palette colour role:

1. parse configured sRGB hex to linear RGB;
2. apply saturation scale;
3. apply value scale;
4. clamp each channel to configured linear colour range;
5. deep-freeze the colour and final palette.

Do not resolve one role relative to another. The committed palette colours are explicit.

Reject disabled or unknown palettes with a typed Phase 4 error.

## Deterministic material recipe

`StoneMaterialRecipeResolver` must expose:

```ts
export class StoneMaterialRecipeResolver {
  constructor(config: Readonly<StoneMaterialConfig>);

  resolve(
    detailedResult: Readonly<StoneDetailedGenerationResult>,
    paletteId: StonePaletteId,
  ): Readonly<StoneMaterialRecipe>;
}
```

### Random root

Use exactly:

```ts
const root = new StoneRandom(detailedResult.detailRecipe.seed)
  .fork("phase-4-material")
  .fork(detailedResult.assetFingerprint);
```

Do not include palette ID in the random root. This guarantees the same face-variation pattern when only the palette changes.

Create named children:

```text
global
region:<regionKey>
```

### Global values

Resolve:

```ts
const valueScale = globalRandom.range(
  config.variation.valueScaleMinimum,
  config.variation.valueScaleMaximum,
);

const saturationScale = globalRandom.range(
  config.variation.saturationScaleMinimum,
  config.variation.saturationScaleMaximum,
);
```

Do not round resolved values.

### Region values

Iterate semantic regions in ascending `regionId` order.

For each region:

```ts
const regionRandom = root.fork(`region:${region.regionKey}`);

const valueMultiplier =
  1 + regionRandom.signed(
    config.variation.faceValueVariation,
  );

const saturationMultiplier =
  1 + regionRandom.signed(
    config.variation.faceSaturationVariation,
  );
```

Store region ID, region key, and both multipliers.

Requirements:

- region count is positive and at most configured maximum;
- region IDs are contiguous and ordered;
- region keys match the semantic model;
- every multiplier is finite and positive;
- the recipe source asset fingerprint exactly equals the Phase 3 asset fingerprint;
- the recipe seed equals the Phase 3 detail recipe seed;
- the recipe is deeply frozen.

## Material-ready geometry

`StoneMaterialGeometryDecorator` creates a new `THREE.BufferGeometry` from the Phase 3 geometry and material recipe.

### Input ownership

`StoneMaterialGenerator.create` takes ownership of the supplied Phase 3 geometry only after all input validation succeeds.

The decorator itself does not dispose its input.

On successful generation:

- the Phase 3 input geometry is disposed by `StoneMaterialGenerator`;
- ownership of the new Phase 4 geometry transfers to the caller.

On failure after ownership transfer:

- dispose the Phase 3 geometry;
- dispose any partially created Phase 4 geometry;
- dispose any partially created material or gradient texture;
- throw a typed error.

### Required copied attributes

Require and copy exactly these existing attributes:

```text
position
normal
stoneRegionId
stoneSemantic
stoneRegionUv
stoneFaceNormal
stoneFaceFlags
```

Require and copy the index.

Use new typed arrays. Do not share mutable BufferAttribute arrays with the disposed Phase 3 geometry.

Preserve exact component values and item sizes.

Do not call `computeVertexNormals()`.

### Added attribute

Add exactly:

```text
stoneMaterialVariation
```

Use:

```ts
new THREE.Float32BufferAttribute(values, 2)
```

For every vertex:

- read `stoneRegionId`;
- find the matching recipe variation;
- write `valueMultiplier` as X;
- write `saturationMultiplier` as Y.

Every triangle must therefore receive constant variation values because region IDs are constant inside a Phase 3 polygon triangle.

Reject a missing or out-of-range region mapping.

### Prohibited attributes

The final geometry must not contain:

```text
uv
color
tangent
stoneBarycentric
```

Do not remove any required Phase 3 namespaced attribute.

### Bounds and metadata

Call:

```ts
geometry.computeBoundingBox();
geometry.computeBoundingSphere();
```

Require final bounds to equal the Phase 3 geometry bounds within `0.000001`.

Copy these frozen compact metadata objects:

```text
geometry.userData.stone
geometry.userData.stoneArchetype
geometry.userData.stoneDetails
```

After fingerprints are calculated, add only:

```ts
geometry.userData.stoneMaterial = Object.freeze({
  configVersion: 1,
  recipeVersion: 1,
  shaderVersion: 1,
  paletteId,
  paletteFingerprint,
  recipeFingerprint,
  materialFingerprint,
  materialAssetFingerprint,
});
```

Do not store full palettes, recipes, detail descriptors, uniforms, or semantic models in `userData`.

## Surface-detail uniform packing

`StoneSurfaceDetailUniformPacker` converts the Phase 3 surface-detail descriptors into fixed-size float arrays.

### Kind codes

Use this exact code map:

| Code | Kind |
| --- | --- |
| `0` | unused |
| `1` | `broad-groove` |
| `2` | `weathering-band` |
| `3` | `hairline-crack` |
| `4` | `shallow-recess` |

Do not reuse Phase 3 semantic codes as detail codes.

### Array dimensions

For maximum detail count `6`, create exactly:

```text
header: 6 × vec4 = 24 floats
data0:  6 × vec4 = 24 floats
data1:  6 × vec4 = 24 floats
data2:  6 × vec4 = 24 floats
```

Initialize every float to zero.

The payload count equals the actual descriptor count.

Descriptors are packed in Phase 3 recipe array order. Do not sort them.

### Common header

Every active slot uses:

```text
header.x = kind code
header.y = target region ID
header.z = strength
header.w = crack point count, otherwise 0
```

### Broad groove packing

```text
data0 = centreU, centreV, directionU, directionV
data1 = lengthUv, widthUv, featherUv, 0
data2 = 0, 0, 0, 0
```

### Weathering band packing

```text
data0 = centreU, centreV, directionU, directionV
data1 = widthUv, featherUv, 0, 0
data2 = 0, 0, 0, 0
```

### Hairline crack packing

A Phase 3 crack contains three through five points.

```text
data0 = point0U, point0V, point1U, point1V
data1 = point2U, point2V, point3U, point3V
data2 = point4U, point4V, widthUv, featherUv
```

For a crack with fewer than four or five points, leave unused point components at zero. `header.w` controls which segments are evaluated.

### Shallow recess packing

```text
data0 = centreU, centreV, radiusU, radiusV
data1 = rotationRadians, featherRatio, 0, 0
data2 = 0, 0, 0, 0
```

### Packer validation

Before returning, require:

- descriptor count at most configured maximum;
- every descriptor kind is supported;
- every target region ID is an integer from `0` through `254`;
- every value is finite;
- every direction is unit length within `0.0005`;
- crack point count is from `3` through `5`;
- unused slots and unused components remain exactly zero;
- payload arrays have exact lengths;
- repeated packing produces exact float-array equality.

The packer does not alter or renormalize valid descriptor values.

## Toon gradient texture

`StoneToonGradientTexture.ts` must expose:

```ts
export function createStoneToonGradientTexture(
  stops: readonly number[],
): THREE.DataTexture;
```

Use:

- width: `5`;
- height: `1`;
- format: `THREE.RGBAFormat`;
- type: `THREE.UnsignedByteType`;
- `minFilter = THREE.NearestFilter`;
- `magFilter = THREE.NearestFilter`;
- `wrapS = THREE.ClampToEdgeWrapping`;
- `wrapT = THREE.ClampToEdgeWrapping`;
- `generateMipmaps = false`;
- `colorSpace = THREE.NoColorSpace`;
- `flipY = false`;
- `needsUpdate = true`.

For every stop:

```ts
const byte = Math.round(clamp(stop, 0, 1) * 255);
```

Write the same byte to R, G, and B, and write `255` to A.

Do not share the resulting texture between materials in Phase 4.

## Shader uniform contract

`StoneStylizedMaterial` must add these exact uniforms:

```text
uStoneColorUnderside
uStoneColorContact
uStoneColorSide
uStoneColorUpper
uStoneColorTop
uStoneColorCut
uStoneColorDetailCut
uStoneColorBand
uStoneColorGroove
uStoneColorCrack
uStoneColorRecess

uStoneTopNormalMinimum
uStoneSideNormalMaximum
uStoneTopOrientationBlend
uStoneCutOrientationBlendScale
uStoneDetailCutOrientationBlendScale
uStoneDominantFaceBoost
uStoneBandBlend
uStoneGrooveBlend
uStoneCrackBlend
uStoneRecessBlend
uStoneMinimumLinearColor
uStoneMaximumLinearColor

uStoneSurfaceDetailCount
uStoneDetailHeader[6]
uStoneDetailData0[6]
uStoneDetailData1[6]
uStoneDetailData2[6]
```

Use `THREE.Color` values for colour uniforms, constructed from already resolved linear RGB channel values with `color.setRGB(r, g, b, THREE.LinearSRGBColorSpace)` or the current Three.js equivalent that does not re-interpret the channels as sRGB.

Do not pass configured hex strings directly to Three.js material colour parameters.

The base `MeshToonMaterial.color` must remain white so the injected semantic colour is not tinted twice.

## Vertex shader patch

`StoneStylizedMaterial` patches the `MeshToonMaterial` vertex shader.

Require these exact chunk anchors:

```text
#include <common>
#include <begin_vertex>
```

Append after `<common>`:

```glsl
attribute float stoneRegionId;
attribute float stoneSemantic;
attribute vec2 stoneRegionUv;
attribute vec3 stoneFaceNormal;
attribute float stoneFaceFlags;
attribute vec2 stoneMaterialVariation;

varying float vStoneRegionId;
varying float vStoneSemantic;
varying vec2 vStoneRegionUv;
varying vec3 vStoneFaceNormal;
varying float vStoneFaceFlags;
varying vec2 vStoneMaterialVariation;
```

Append after `<begin_vertex>`:

```glsl
vStoneRegionId = stoneRegionId;
vStoneSemantic = stoneSemantic;
vStoneRegionUv = stoneRegionUv;
vStoneFaceNormal = normalize(stoneFaceNormal);
vStoneFaceFlags = stoneFaceFlags;
vStoneMaterialVariation = stoneMaterialVariation;
```

Do not transform `stoneFaceNormal` by the model matrix. Phase 3 stores it in local geometry space, and object-level rotation is applied consistently to both geometry and light-facing normal by the base material. For the palette orientation calculation, use the local Y component intentionally so stone top regions remain tied to the stone's authored up axis. World-placement slope alignment policy is deferred to Phase 7.

Do not alter `transformed`, base normals, skinning, morphing, or projection chunks.

## Fragment shader detail equations

`StoneSurfaceDetailShader.ts` exports one string constant:

```ts
export const STONE_SURFACE_DETAIL_GLSL: string;
```

The string must include the fixed array declarations and pure GLSL helper functions.

Use:

```glsl
#define STONE_MAX_SURFACE_DETAILS 6
```

### Exact smoothstep helper

Do not use the GLSL built-in directly. Port the Phase 3 CPU helper:

```glsl
float stoneSmoothstep(
  float edge0,
  float edge1,
  float value
) {
  if (edge0 == edge1) {
    return value < edge0 ? 0.0 : 1.0;
  }
  float t = clamp(
    (value - edge0) / (edge1 - edge0),
    0.0,
    1.0
  );
  return t * t * (3.0 - 2.0 * t);
}
```

### Segment distance

Implement the standard finite-segment distance:

```glsl
vec2 ab = b - a;
float denominator = max(dot(ab, ab), 0.00000001);
float t = clamp(dot(point - a, ab) / denominator, 0.0, 1.0);
float distanceValue = length(point - (a + ab * t));
```

### Region match

A descriptor matches the current region when:

```glsl
abs(vStoneRegionId - header.y) < 0.25
```

### Groove equation

Port the Phase 3 equations exactly:

- normalize direction;
- calculate along and across distance;
- use half width and half length;
- multiply side and end masks by descriptor strength.

### Band equation

Use only distance across the band and multiply by strength.

### Crack equation

- unpack three through five points;
- evaluate segment `0–1` always;
- evaluate `1–2` when point count is at least `3`;
- evaluate `2–3` when point count is at least `4`;
- evaluate `3–4` when point count is at least `5`;
- take minimum distance;
- apply width and feather;
- multiply by strength.

### Recess equation

- rotate UV minus centre by negative descriptor rotation;
- calculate normalized ellipse radius;
- use `1 - featherRatio` and `1` as smoothstep edges;
- multiply by strength.

### Channel combination

Return a `vec4` in this exact order:

```text
x = groove
y = band
z = crack
w = recess
```

For every matching descriptor:

- take channel maximum;
- never sum two masks;
- clamp every channel to `[0, 1]`.

Iterate with a compile-time loop from `0` through `5` and skip slots whose index is at least `uStoneSurfaceDetailCount`.

Do not add dynamic loops based only on the runtime count.

## Palette shader equations

`StonePaletteShader.ts` exports:

```ts
export const STONE_PALETTE_GLSL: string;
```

### Semantic colour selection

Use the exact Phase 3 semantic codes:

```text
0 underside
1 contact
2 side
3 upper
4 top
5 cut
6 detail-cut
```

Select with ordered float comparisons using half-integer boundaries. Do not cast the varying to an integer.

Unknown values return magenta `(1, 0, 1)` as a visible shader diagnostic. Automated validation must prevent this path in valid assets.

### Flag helper

GLSL 1 compatibility must not rely on integer bitwise operators.

Use:

```glsl
float stoneHasFlag(float flags, float bitValue) {
  return mod(floor(flags / bitValue), 2.0);
}
```

The dominant-face bit is `32` from Phase 3.

### Top-facing blend

Calculate:

```glsl
float topFacing = stoneSmoothstep(
  uStoneSideNormalMaximum,
  uStoneTopNormalMinimum,
  vStoneFaceNormal.y
);
```

Use semantic-specific orientation scales:

| Semantic | Scale |
| --- | --- |
| underside | `0` |
| contact | `0` |
| side | `1` |
| upper | `0.65` |
| top | `0` |
| cut | `uStoneCutOrientationBlendScale` |
| detail-cut | `uStoneDetailCutOrientationBlendScale` |

Blend the selected semantic colour toward top colour by:

```text
topFacing * uStoneTopOrientationBlend * semantic scale
```

### Dominant-face boost

When the Phase 3 dominant flag is set, multiply colour by:

```text
1 + uStoneDominantFaceBoost
```

### Per-face variation

`stoneMaterialVariation.x` is the value multiplier.

`stoneMaterialVariation.y` is the saturation multiplier.

Use the same Rec. 709 linear luminance equation as the CPU.

Apply saturation first, then value.

### Detail colour order

Evaluate the surface fields and apply colour in this exact order:

1. weathering band;
2. broad groove;
3. shallow recess;
4. hairline crack.

Use:

```glsl
color = mix(
  color,
  detailColor,
  clamp(mask * configuredBlend, 0.0, 1.0)
);
```

Crack is last so a crack remains dark when crossing a band or recess.

### Final clamp

Clamp every channel to:

```text
uStoneMinimumLinearColor
uStoneMaximumLinearColor
```

Return linear RGB. Do not encode to sRGB.

## Fragment shader patch

Require these exact fragment chunk anchors:

```text
#include <common>
#include <color_fragment>
```

Append after `<common>`:

- all Phase 4 varyings;
- all uniforms;
- `STONE_SURFACE_DETAIL_GLSL`;
- `STONE_PALETTE_GLSL`.

Append after `<color_fragment>`:

```glsl
diffuseColor.rgb = stoneResolveStylizedColor();
```

Do not replace lighting, shadow, fog, tone-mapping, dithering, clipping-plane, or output chunks.

Do not patch by line number or Three.js source-file offset.

When any required anchor is missing, throw `StoneMaterialGenerationError` with code `SHADER_PATCH_FAILED` and include the missing anchor and shader stage.

## Material class

`StoneStylizedMaterial.ts` defines:

```ts
export class StoneStylizedMaterial
  extends THREE.MeshToonMaterial {
  constructor(parameters: StoneStylizedMaterialParameters);

  override customProgramCacheKey(): string;
  override dispose(): void;
}
```

`StoneStylizedMaterialParameters` contains only:

- resolved palette;
- detail uniform payload;
- material configuration;
- compact metadata;
- newly created gradient texture.

### Base material properties

Set exactly:

```ts
color: new THREE.Color(1, 1, 1)
transparent: false
opacity: 1
alphaTest: 0
side: THREE.FrontSide
shadowSide: THREE.FrontSide
depthTest: true
depthWrite: true
fog: true
toneMapped: true
dithering: true
wireframe: false
vertexColors: false
gradientMap: ownedGradientTexture
```

Set:

```ts
material.name = `StoneStylizedMaterial:${paletteId}`;
```

Do not set emissive, map, lightMap, aoMap, normalMap, displacementMap, alphaMap, envMap, or specular properties.

### Program cache key

Return exactly:

```text
stone-stylized:v1:details6
```

Palette and descriptor values must not change the key.

### Material metadata

Store only the same compact Phase 4 metadata object used on geometry under:

```text
material.userData.stoneMaterial
```

Do not store shader source, full palettes, recipes, descriptors, or typed uniform arrays in `userData`.

### Disposal

`dispose()` must:

1. dispose the owned gradient texture exactly once;
2. call `super.dispose()` exactly once;
3. tolerate repeated calls without disposing the texture twice.

Do not dispose geometry from the material.

Material cloning is not supported in Phase 4. Callers must create another material through `StoneMaterialGenerator`. Document this in the public barrel export.

## Material fingerprints

`StoneMaterialFingerprint.ts` uses the same dual FNV-1a byte strategy established in Phase 1.

Use configured quantization `0.000001` as a code constant:

```ts
export const STONE_MATERIAL_FINGERPRINT_QUANTIZATION = 0.000001;
```

### Palette fingerprint

Serialize in this order:

1. material config version;
2. canonical palette index;
3. palette ID;
4. eleven resolved linear colours in the role order defined by `StoneResolvedPalette`;
5. every colour channel quantized by the constant.

### Recipe fingerprint

Serialize:

1. recipe version;
2. shader version;
3. seed;
4. canonical palette index;
5. source asset fingerprint;
6. quantized value scale;
7. quantized saturation scale;
8. region variations in ascending region ID order;
9. region ID;
10. region key;
11. quantized value and saturation multipliers.

### Material fingerprint

Hash UTF-8 bytes of:

```text
v1|<paletteFingerprint>|<recipeFingerprint>|<phase3DetailFingerprint>
```

### Material-asset fingerprint

Hash UTF-8 bytes of:

```text
<phase3AssetFingerprint>|<materialFingerprint>
```

Return sixteen lowercase hexadecimal digits for every fingerprint.

## Generator API and ownership

`StoneMaterialGenerator.ts` must export:

```ts
export class StoneMaterialGenerator {
  constructor(config: Readonly<StoneMaterialConfig>);

  listPalettes(): readonly StonePaletteId[];

  create(
    detailedResult: StoneDetailedGenerationResult,
    paletteId: StonePaletteId,
  ): StoneMaterialGenerationResult;
}
```

### Complete create flow

Perform this exact sequence:

1. Validate palette ID.
2. Validate that the detailed result contains geometry, semantic model, detail recipe, fingerprints, and matching compact metadata.
3. Do not take ownership yet.
4. Resolve the immutable material recipe.
5. Resolve the immutable linear palette.
6. Pack surface-detail uniforms.
7. Calculate palette and recipe fingerprints.
8. Calculate material and material-asset fingerprints.
9. Mark the Phase 3 geometry as owned by the Phase 4 operation.
10. Decorate a new Phase 4 geometry.
11. Create the owned gradient texture.
12. Create the stylized material.
13. Apply identical compact material metadata to geometry and material.
14. Dispose the owned Phase 3 geometry.
15. Return the frozen result.

If a failure occurs before step 9, the caller retains ownership of the Phase 3 geometry.

If a failure occurs during or after step 9:

- dispose the Phase 3 geometry;
- dispose any new Phase 4 geometry;
- dispose any new material and gradient texture;
- throw a typed error.

The returned result transfers ownership of:

- one Phase 4 geometry;
- one `StoneStylizedMaterial` and its owned gradient texture.

The caller must dispose both geometry and material.

## Error contract

`StoneMaterialErrors.ts` must define:

```ts
export type StoneMaterialGenerationErrorCode =
  | "INVALID_MATERIAL_CONFIG"
  | "INVALID_PALETTE"
  | "INVALID_DETAILED_RESULT"
  | "MATERIAL_RECIPE_FAILED"
  | "PALETTE_RESOLUTION_FAILED"
  | "DETAIL_PACKING_FAILED"
  | "MATERIAL_GEOMETRY_FAILED"
  | "SHADER_PATCH_FAILED"
  | "MATERIAL_CREATION_FAILED";

export class StoneMaterialGenerationError extends Error {
  readonly code: StoneMaterialGenerationErrorCode;
  readonly details: Readonly<Record<string, unknown>>;
}
```

Requirements:

- set `name = "StoneMaterialGenerationError"`;
- include palette ID, archetype ID, seed, and source asset fingerprint when available;
- preserve unexpected original errors as `cause`;
- freeze details;
- do not log;
- do not retry inside Phase 4;
- never silently substitute another palette or plain material.

## CPU reference material evaluator

Add pure reference functions to `StonePaletteResolver.ts` or a small private helper in the verification file. Do not create a second production colour pipeline.

The canonical CPU evaluation sequence used by verification is:

1. select semantic palette colour;
2. calculate top-facing blend from face normal Y with the exact custom smoothstep;
3. apply semantic orientation scale;
4. apply dominant boost;
5. apply per-region saturation multiplier;
6. apply per-region value multiplier;
7. evaluate Phase 3 surface fields;
8. apply band, groove, recess, and crack mixes in exact order;
9. clamp to configured linear range.

The verifier must compare fixture outputs against manually calculated expected values. The CPU evaluator is test support and must not be called per fragment at runtime.

## Fixed browser QA gallery

Phase 4 must include one fixed, non-interactive material gallery rendered by the real Three.js renderer.

### Route

Extend `src/main.ts` so:

```text
?scene=stone-material
```

loads `StoneMaterialGalleryApp`.

Existing `world` and `island` modes must remain unchanged.

Use exact scene mode union:

```ts
type SceneMode = "world" | "island" | "stone-material";
```

The gallery title is:

```text
Drusniel World · Stone Material QA
```

### Gallery cases

Add this exact constant to `StonePaletteCatalog.ts`:

```ts
export const STONE_MATERIAL_GALLERY_CASES = [
  ["rounded-boulder", 42, "slate"],
  ["rounded-boulder", 1337, "mineral-blue"],
  ["squashed-pebble", 7, "limestone"],
  ["squashed-pebble", 9001, "moss-tinted"],
  ["flat-ground-stone", 19, "slate"],
  ["flat-ground-stone", 2048, "weathered-teal"],
  ["broad-slab", 11, "limestone"],
  ["broad-slab", 4096, "sandstone"],
  ["weathered-block", 42, "sandstone"],
  ["weathered-block", 8192, "volcanic"],
  ["tapered-block", 31, "slate"],
  ["tapered-block", 12345, "fantasy-amethyst"],
  ["wedge", 73, "sandstone"],
  ["wedge", 54321, "mineral-blue"],
  ["leaning-shard", 101, "volcanic"],
  ["leaning-shard", 22222, "fantasy-amethyst"],
  ["tall-monolith", 151, "slate"],
  ["tall-monolith", 33333, "moss-tinted"],
  ["triangular-peak", 211, "mineral-blue"],
  ["triangular-peak", 44444, "fantasy-amethyst"],
  ["broad-platform", 271, "limestone"],
  ["broad-platform", 55555, "weathered-teal"],
  ["tapered-pillar", 331, "volcanic"],
  ["tapered-pillar", 65535, "slate"],
] as const;
```

The archetype and seed pairs must match the Phase 3 gallery manifest.

### Renderer settings

Use:

```ts
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
```

Use device pixel ratio clamped to `1.5`.

Use antialiasing.

### Scene settings

Use:

```text
background: #d5dde2
camera FOV: 35 degrees
camera near: 0.1
camera far: 100
camera position: (0, 8.5, 17)
camera look target: (0, 1.1, 0)
```

Lights:

```text
HemisphereLight sky #dbe8ef, ground #46504a, intensity 1.4
DirectionalLight #fff1dc, intensity 2.5, position (8, 12, 6)
```

Directional light:

- casts shadows;
- map size `2048 × 2048`;
- orthographic shadow bounds `-14, 14, 14, -14`;
- near `0.5`;
- far `40`;
- bias `-0.00015`;
- normal bias `0.02`.

Ground:

- plane size `40 × 28`;
- `MeshStandardMaterial` colour `#87908a`;
- roughness `1`;
- metalness `0`;
- receives shadows;
- lies at `y = -0.002`.

### Layout

Use six columns and four rows.

Spacing:

```text
X spacing: 3.0
Z spacing: 3.1
```

Centre the grid around the origin.

For case index `i`, rotate the stone around local Y by:

```ts
(i * 2.399963229728653) % (Math.PI * 2)
```

Do not apply X or Z tilt.

Every stone:

- rests with local ground at gallery ground;
- casts shadows;
- receives shadows;
- uses its assigned palette;
- remains at generated scale;
- is not normalized to a common bounding box.

### Runtime behavior

The gallery is static.

- render continuously through `requestAnimationFrame` to exercise normal renderer lifecycle;
- do not animate stones, lights, or camera;
- update renderer and camera aspect on resize;
- dispose every mesh geometry, material, light shadow resource, ground material, and renderer on `dispose()`;
- do not add GUI, orbit controls, labels, buttons, or authoring controls.

The gallery is for manual real-renderer inspection and future visual capture. It is not part of the world scene.

## Verification architecture

### Script

`scripts/verify-stone-materials.mjs` must use Vite SSR in the same style as the previous stone scripts.

Load:

```text
/src/stones/qa/StoneMaterialVerification.ts
```

Call exactly:

```ts
await verification.verifyStoneMaterials();
```

Prefix failures with:

```text
[stone-materials]
```

Print one concise success line containing:

- palette count;
- generated material case count;
- unique material-asset fingerprints;
- maximum vertex count;
- maximum descriptor count;
- shader source length;
- gradient stop count.

Do not write snapshots or temporary files.

### Verification export

`StoneMaterialVerification.ts` must export exactly:

```ts
export async function verifyStoneMaterials(): Promise<void>;
```

Use local assertion helpers. Do not add test-only methods to production classes.

## Mandatory verification matrix

### Previous-phase compatibility

Verify:

1. Run the existing Phase 1, Phase 2, and Phase 3 verification entry points unchanged.
2. Generate representative Phase 3 cases for every archetype before and after importing Phase 4 modules.
3. Require exact Phase 3 recipe JSON, positions, normals, indices, all namespaced attributes, metrics, and fingerprints.
4. Require no Phase 4 module to patch Three.js globally.

### Configuration tests

Verify:

- committed YAML parses;
- parsed configuration is recursively frozen;
- removing one key fails;
- duplicating one key fails;
- adding an unknown key fails;
- replacing one number with `NaN` fails;
- shader version other than `1` fails;
- maximum surface details other than `6` fails;
- maximum regions other than `255` fails;
- value minimum above maximum fails;
- saturation minimum equal to zero fails;
- face variation above `0.25` fails;
- dominant boost above `0.2` fails;
- blend above `1` fails;
- linear maximum below minimum fails;
- gradient count other than `5` fails;
- non-ascending gradient fails;
- final gradient stop below `1` fails;
- malformed hex fails;
- missing palette colour role fails;
- disabled committed palette fails;
- unknown palette ID fails.

### Colour math tests

Use tolerance `0.000001`.

Verify:

- `#000000` converts to exact zero;
- `#ffffff` converts to exact one;
- `#808080` converts each channel to approximately `0.215861`;
- sRGB threshold values follow the two exact formula branches;
- Rec. 709 luminance of pure red, green, and blue matches coefficients;
- saturation scale `0` returns luminance grey;
- saturation scale `1` returns original colour;
- value scale `1` returns original colour;
- colour mixing clamps amount through the shared clamp helper;
- no function mutates its input.

### Palette tests

For every palette:

- palette is enabled;
- resolution succeeds;
- every colour is finite and inside configured linear range;
- repeated resolution is deeply equal;
- resolved palette is deeply frozen;
- palette fingerprints are deterministic;
- all eight palette fingerprints are unique;
- changing value scale changes fingerprint;
- changing saturation scale changes fingerprint;
- canonical palette order is preserved.

### Recipe tests

Use one Phase 3 detailed result for every archetype with seed `42` where generation permits; otherwise use the first fixed gallery seed for that archetype.

For every case:

- repeated resolution is deeply equal;
- recipe is deeply frozen;
- seed and source asset fingerprint match Phase 3;
- region variation count equals semantic region count;
- region IDs are contiguous and ordered;
- region keys match exactly;
- multipliers remain inside configured variation bounds;
- changing palette ID preserves value scale, saturation scale, and all region variations;
- changing palette ID changes only palette ID in the recipe;
- changing source asset fingerprint changes at least one resolved variation;
- recipe fingerprint is deterministic.

### Uniform packing fixture tests

Create one descriptor fixture of every kind.

Verify exact float positions for:

- kind code;
- target region ID;
- strength;
- crack point count;
- groove centre, direction, length, width, and feather;
- band centre, direction, width, and feather;
- crack points, width, and feather;
- recess centre, radii, rotation, and feather ratio;
- all unused components;
- all unused slots.

Verify:

- all four arrays have length `24`;
- count equals fixture descriptor count;
- repeated packing is byte-identical;
- seventh descriptor fails;
- unsupported kind fails;
- non-finite value fails;
- target region `255` fails;
- non-unit direction fails;
- crack with two or six points fails.

### Shader equation source tests

Verify the generated GLSL strings contain:

- the fixed detail count define;
- custom smoothstep;
- finite segment distance;
- all four kind branches;
- the exact region-match tolerance;
- maximum channel combination;
- Rec. 709 coefficients;
- all seven semantic branches;
- the dominant flag value `32.0`;
- semantic orientation scales;
- detail application order band, groove, recess, crack;
- final linear clamp.

Verify they do not contain:

- `noise`;
- `texture2D` for stone detail data;
- time uniforms;
- manual sRGB encoding;
- normal perturbation;
- alpha discard;
- dynamic array sizes.

### CPU field parity tests

Use the Phase 3 field fixture descriptors and at least sixteen UV samples per detail kind.

Implement a TypeScript mirror of the packed-uniform decode used only by verification.

Require packed decode field values to match `evaluateStoneSurfaceDetails` within `0.000001` for:

- descriptor centres;
- feature edges;
- feather midpoints;
- outside points;
- crossing details;
- descriptors on other regions;
- three-, four-, and five-point cracks.

This verifies the uniform layout and equations before GPU compilation.

### Geometry decoration tests

Use:

```text
archetype: weathered-block
seed: 42
palette: sandstone
```

Require:

- Phase 4 geometry is a different object from Phase 3 geometry;
- position values are exact copies;
- normal values are exact copies;
- index values are exact copies;
- all Phase 3 namespaced attributes are exact copies;
- `stoneMaterialVariation` exists with item size `2`;
- attribute count equals position count;
- every vertex variation matches its region recipe;
- every triangle receives constant variation values;
- no generic `uv`, `color`, tangent, or barycentric attribute exists;
- bounding box and sphere exist;
- bounds equal Phase 3 bounds;
- compact metadata exists;
- full recipe and palette are absent from `userData`.

### Material construction tests

For the same case, require:

- material is an instance of `THREE.MeshToonMaterial` and `StoneStylizedMaterial`;
- base colour is white;
- gradient map exists and is `5 × 1`;
- gradient texture bytes exactly match configured stops;
- gradient uses RGBA unsigned bytes, nearest filtering, no mipmaps, and no colour-space transform;
- material is opaque;
- front side and shadow side are front;
- depth test and write are enabled;
- fog, tone mapping, and dithering are enabled;
- no image maps are assigned;
- cache key is exact;
- compact metadata on material and geometry is deeply equal;
- two different palettes have the same cache key;
- two different detail recipes have the same cache key.

### Shader patch tests

Create minimal vertex and fragment source fixtures containing the required Three.js anchors and call the patch helper directly.

Require:

- every varying is declared once in each required stage;
- every uniform is declared once;
- vertex assignments occur after `begin_vertex`;
- colour assignment occurs after `color_fragment`;
- original anchors remain present;
- missing vertex common anchor fails;
- missing begin-vertex anchor fails;
- missing fragment common anchor fails;
- missing colour-fragment anchor fails;
- patching the same source twice is rejected rather than duplicating declarations.

### Single-case determinism

Generate the weathered-block fixture twice from separate Phase 3 results.

Require exact equality of:

- material recipe JSON;
- resolved palette values;
- Phase 4 geometry position, normal, index, and every attribute;
- detail uniform payload arrays;
- all four fingerprints;
- compact metadata;
- material program cache key;
- gradient texture bytes.

Dispose both geometries and materials.

### Batch material generation

Generate detailed stones for every archetype using seeds `0` through `7`. This produces `96` Phase 3 stones.

For every stone, generate four palettes using this deterministic selection:

```ts
const paletteIndex =
  (archetypeIndex + seed + paletteOffset * 2) %
  STONE_PALETTE_IDS.length;
```

where `paletteOffset` is `0`, `1`, `2`, and `3`.

This produces exactly `384` successful Phase 4 material cases.

For every case:

- generation succeeds without retry;
- geometry validates as an exact attribute-preserving copy plus one variation attribute;
- material properties pass;
- fingerprints are deterministic;
- metadata matches;
- detail count is at most six;
- region count is at most 255;
- palette colours are finite;
- all variation values are finite and positive;
- source Phase 3 geometry is disposed exactly once after successful ownership transfer;
- returned geometry and material dispose cleanly.

Across the batch require:

- all eight palettes appear;
- all eleven semantic and detail colour roles are exercised;
- all four surface detail kinds appear;
- at least `370` unique material-asset fingerprints;
- every palette has at least `40` generated cases;
- no shader program cache key variation;
- maximum vertex count remains equal to the corresponding Phase 3 maximum;
- no generic texture map is allocated beyond the five-pixel gradient texture.

### Material response fixture tests

Use a hand-authored palette and response configuration with simple numeric colours.

Verify exact CPU response for:

- underside semantic;
- contact semantic;
- side semantic with no top blend;
- side semantic fully top-facing;
- upper semantic orientation scale `0.65`;
- cut and detail-cut orientation scales;
- dominant boost;
- value variation;
- saturation variation;
- band-only response;
- groove-only response;
- recess-only response;
- crack-only response;
- crossing band and crack, confirming crack applies last;
- final minimum and maximum clamp.

Use tolerance `0.000001`.

### Lifecycle and failure tests

Use disposal spies around `BufferGeometry.dispose`, `Material.dispose`, and `Texture.dispose`.

Verify:

- invalid palette fails before ownership transfer and does not dispose Phase 3 geometry;
- invalid detailed-result metadata fails before ownership transfer;
- geometry-decoration failure after ownership transfer disposes Phase 3 geometry;
- material-creation failure disposes Phase 3 geometry and partial Phase 4 geometry;
- repeated material disposal disposes gradient texture once;
- caller disposal of returned geometry does not dispose material;
- caller disposal of returned material does not dispose geometry;
- no full recipe or uniform payload survives in userData;
- failed generation leaves no retained temporary arrays through generator fields.

### Gallery contract tests

Without constructing a WebGL renderer in SSR, verify source-level and data-level gallery contracts:

- route string is `stone-material`;
- exactly 24 gallery cases exist;
- all Phase 3 gallery archetype and seed pairs appear in the same order;
- every palette appears at least twice;
- grid constants equal six columns, four rows, and documented spacing;
- renderer configuration source includes sRGB, ACES, shadows, and PCF;
- scene source includes the exact lights, ground settings, and camera values;
- gallery has no GUI or controls import;
- gallery disposes generated geometry and materials.

Manual acceptance must then open:

```text
http://localhost:5173/?scene=stone-material
```

and inspect the real renderer.

## Manual visual acceptance checklist

Phase 4 is not complete until the fixed browser gallery passes all of these checks under the exact camera and lights:

- all broad faces remain readable;
- no stone looks uniformly flat-coloured;
- no stone looks glossy, metallic, plastic, or wet;
- top planes are lighter without becoming white;
- cut and detail-cut planes remain visibly distinct;
- undersides and contact faces are darker without creating a black rim;
- grooves read as broad deliberate marks rather than thin noisy scratches;
- cracks remain narrow and sparse;
- weathering bands read as graphic colour regions, not texture noise;
- recesses read as shallow darkened areas without fake deep holes;
- details do not cover most of a face;
- the volcanic palette still preserves plane separation;
- limestone does not clip to white under ACES;
- sandstone does not become over-saturated orange;
- mineral-blue and fantasy-amethyst remain muted and stone-like;
- every palette appears to belong to one coherent asset family;
- directional shadows render correctly;
- material receives hemisphere and directional light;
- fog and output colour management remain correct when enabled in a local test;
- rotating the browser viewport does not produce shader errors;
- browser console contains no shader compile warnings.

Record any approved tuning by editing the YAML and this specification together. Do not silently diverge committed values from the contract.

## Implementation sequence

Implement in this exact order. Keep TypeScript compiling after every step.

### Step 1 — Palette IDs, types, and errors

Files:

- `StoneMaterialTypes.ts`
- `StonePaletteCatalog.ts`
- `StoneMaterialErrors.ts`

Checks:

- canonical IDs and gallery data compile;
- pure type modules do not import Three.js;
- no import cycle exists.

### Step 2 — Configuration

Files:

- `public/config/stone-materials.yaml`
- `StoneMaterialConfig.ts`
- `StoneMaterialConfigLoader.ts`

Checks:

- committed YAML parses;
- all cross-field validations exist;
- configuration is recursively frozen.

### Step 3 — Colour math and palette resolution

Files:

- `StoneColorMath.ts`
- `StonePaletteResolver.ts`

Checks:

- golden sRGB conversions pass;
- all palettes resolve;
- no Three.js colour parsing is used.

### Step 4 — Material recipes and fingerprints

Files:

- `StoneMaterialRecipeResolver.ts`
- `StoneMaterialFingerprint.ts`

Checks:

- palette swaps preserve region variation;
- recipe and palette fingerprints are stable;
- all ordinary outputs are frozen.

### Step 5 — Geometry decoration

File:

- `StoneMaterialGeometryDecorator.ts`

Checks:

- Phase 3 attributes and index are exact copies;
- one variation attribute is added;
- bounds and metadata are correct.

### Step 6 — Uniform packing

File:

- `StoneSurfaceDetailUniformPacker.ts`

Checks:

- all four fixture layouts are exact;
- unused values remain zero;
- six-detail limit is enforced.

### Step 7 — Shader strings

Files:

- `StoneSurfaceDetailShader.ts`
- `StonePaletteShader.ts`

Checks:

- GLSL field equations mirror Phase 3;
- palette order and semantic codes are exact;
- no texture-baked detail path exists.

### Step 8 — Gradient and material

Files:

- `StoneToonGradientTexture.ts`
- `StoneStylizedMaterial.ts`

Checks:

- texture bytes and properties are exact;
- shader patch fixtures pass;
- material lifecycle tests pass.

### Step 9 — Generator

File:

- `StoneMaterialGenerator.ts`

Checks:

- ownership transitions are correct;
- metadata and fingerprints match;
- single-case determinism passes.

### Step 10 — Barrel export

File:

- `src/stones/materials/index.ts`

Export only production public APIs:

- palette IDs and type;
- material configuration and loader;
- material generator and result types;
- `StoneStylizedMaterial`;
- material recipe and resolved palette types.

Do not export internal shader patch helpers or mutable uniform internals.

### Step 11 — Automated verification

Files:

- `StoneMaterialVerification.ts`
- `scripts/verify-stone-materials.mjs`
- `package.json`

Checks:

```bash
npx tsc
npm run test:stone-core
npm run test:stone-archetypes
npm run test:stone-details
npm run test:stone-materials
npm run build
```

All commands pass.

### Step 12 — Fixed browser gallery

Files:

- `StoneMaterialGalleryApp.ts`
- `src/main.ts`

Checks:

- existing world route starts unchanged;
- existing island route starts unchanged;
- stone-material route renders 24 stones;
- no console shader warnings;
- resize and disposal work;
- manual acceptance checklist passes.

## Definition of done

Phase 4 is complete only when all conditions below are true.

### Configuration

- [ ] `stone-materials.yaml` exists with the exact committed contract.
- [ ] Strict parsing rejects missing, duplicate, unknown, malformed, and invalid values.
- [ ] All eight canonical palettes are enabled.
- [ ] Parsed configuration is recursively frozen.

### Determinism

- [ ] The same Phase 3 asset and palette reproduce the same material recipe.
- [ ] Palette changes preserve face-variation values.
- [ ] Palette, recipe, material, and material-asset fingerprints are stable.
- [ ] Geometry attributes, uniforms, and gradient bytes are deterministic.

### Geometry

- [ ] Phase 3 geometry remains unmodified.
- [ ] Final geometry copies every required Phase 3 attribute exactly.
- [ ] `stoneMaterialVariation` is correct for every vertex.
- [ ] No generic UV, colour, tangent, or barycentric attribute is added.
- [ ] Bounds remain unchanged.

### Material

- [ ] Material extends `MeshToonMaterial`.
- [ ] Five-step nearest gradient is active.
- [ ] Three.js lighting, shadows, fog, tone mapping, and dithering remain active.
- [ ] No unsupported map or reflective response is used.
- [ ] Program cache key is identical across assets and palettes.
- [ ] Gradient texture ownership and disposal are correct.

### Shader

- [ ] All Phase 3 detail equations are ported.
- [ ] Uniform packing and GLSL decode agree.
- [ ] Semantic codes and face flags are exact.
- [ ] Detail colour order is exact.
- [ ] Shader patching fails loudly on missing anchors.
- [ ] Valid gallery shaders compile without warnings.

### Visual quality

- [ ] Broad semantic colour regions are readable.
- [ ] Top, side, cut, detail-cut, contact, and underside values are distinct.
- [ ] Grooves, bands, cracks, and recesses are visible but sparse.
- [ ] No high-frequency procedural noise is present.
- [ ] All eight palettes form one coherent illustrated asset family.
- [ ] The fixed 24-stone gallery passes manual review.

### Verification

- [ ] Previous phase gates remain green.
- [ ] The Phase 4 verifier passes all configuration, colour, packing, shader, geometry, material, lifecycle, and batch tests.
- [ ] Exactly 384 batch material cases pass.
- [ ] `npm run build` passes.

## Required completion report

When implementation finishes, append a dated completion section to this document containing:

- commit SHA;
- implemented files;
- verifier summary line;
- palette count;
- batch case count;
- unique material-asset fingerprint count;
- maximum vertex count;
- maximum descriptor count;
- browser and GPU used for manual gallery review;
- confirmation that the browser console had no shader warnings;
- manual visual checklist result;
- any YAML value changed from this contract and the approved reason;
- remaining TODO items for Phase 5.

Do not mark Phase 4 complete while any required gate, lifecycle test, or manual visual criterion remains open.
