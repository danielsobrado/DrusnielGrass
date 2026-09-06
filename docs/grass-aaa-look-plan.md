# AAA look plan — "zelda-field" preset

## Implementation status (2026-08-06)

| Item | Status |
| --- | --- |
| LOOK-1 | Implemented: `zelda-field` is selectable and covered by parity/performance gates. |
| LOOK-2 | Implemented: desktop layers share one scrolling two-octave noise texture; compact keeps the shared sine fallback. |
| LOOK-3/4 | Implemented: gust sheen/tip lift and root-to-tip impostor shear use the same clock, direction, noise, scale, speed, and palette rows. |
| LOOK-5 | Implemented: the wider, shorter silhouette and denser underlayer are in YAML. |
| LOOK-6 | Implemented: Zelda-specific sun, hemisphere, fog, and exposure pairing is applied and resets for other presets. |
| LOOK-7 | Implemented: the channel-packed accent layer (ferns, flowers, seed heads) ships per [grass-detail-foliage-plan.md](grass-detail-foliage-plan.md), inside a gated ≤ 2.5 k card / ≤ 30 draw budget. |

The automated build is green and a headless WebGL pass renders the preset with no shader or
runtime errors. Screenshot sign-off across every camera distance remains a manual art-review
step; it is not represented as an automated pass.

**Correction to LOOK-4.4.** The bounds arithmetic in that item was wrong and would have shipped
a silent overrun. It checked the shear against `uWindStrength ≈ 0.13` (the `zelda-field` scale)
and omitted the instance vertical scale the shear is multiplied by. The real worst case is
`windStrength 0.11 × windswept's 1.65 art scale × 0.35 shear × 1.2 vertical scale = 0.076`,
which does not fit the 0.06 that was reserved. `GRASS_IMPOSTOR_MAX_WIND_DISPLACEMENT` is now
0.08 and the shear factor is an exported constant templated into the shader, and
`verify-lod-continuity` recomputes that product from the constants instead of repeating a
literal — the previous gate still asserted the *old* `0.22` factor and would have kept passing
while the shader moved out from under it. The bound grows by 2 cm on a ~6.2 m card bound, so
culling is unaffected.

Goal: a preset that reads like the Breath-of-the-Wild reference (bright yellow-green meadow,
visible wind waves rolling across the field, soft tufty silhouette, painterly distance), stays
seamless across every LOD handoff, and rides on the performance plan
([grass-performance-plan.md](grass-performance-plan.md)) rather than fighting it.

What the reference actually contains, mapped to this codebase:

| Reference ingredient | Status here | Work item |
| --- | --- | --- |
| Saturated yellow-green, light tips, warm sun | palette system ready | LOOK-1 preset values |
| Wind gusts visible as travelling bright waves | periodic sines only (R5) | LOOK-2 + LOOK-3 |
| Tufty, clumped growth with bare gaps | already built (`CLUMP_*`, `WorldSingleBladeTileFactory.ts:96-133`) | tune only |
| Macro colour patches (dry crowns, vigour bands) | already built (`GrassFieldVariation.ts`) | tune only |
| Soft painterly horizon, no LOD lines | impostors shimmer (R3), wind mismatch (R5) | PERF-4 + LOOK-4 |
| Wide, tapered, slightly curved blades | narrower/taller today | LOOK-5 |
| Warm light, haze, gentle bloom | ACES already on (`WorldApp.ts:115`) | LOOK-6 |
| Flowers / red accent sprigs | absent | LOOK-7 (optional) |

Dependencies: do PERF-4 (atlas mips) and PERF-6a (single wind clock) from the performance plan
first; the wave work below assumes both.

Relationship to biomes ([grass-biome-architecture.md](grass-biome-architecture.md)): the
`zelda-field` *preset* below is the global art grade (lighting, wind mood, LOD tier); its
palette doubles as the **`meadow` biome profile** (biome 0) once B1/B2 land. LOOK items that
touch colors (LOOK-1, LOOK-3 tip lift) apply per biome row after the split; wind waves (LOOK-2),
environment (LOOK-6), and silhouette (LOOK-5) stay global. Nothing here needs rework for
biomes — the palette values move files, the mechanisms don't change.

---

## LOOK-1 — The preset

Add to `src/grass/GrassArtPresets.json` (all values inside the envelope the existing presets
already pass validation with; the parity gate auto-enumerates new presets):

```json
"zelda-field": {
  "key": "zelda-field",
  "label": "Zelda Field",
  "baseColor": "#3f8330",
  "tipColor": "#a9db57",
  "dryColor": "#b3ac5e",
  "rootDarkening": 0.68,
  "tipColorStrength": 0.32,
  "normalUp": 0.74,
  "ambientBoost": 0.26,
  "backlightStrength": 0.1,
  "impostorBaseColorBlend": 0,
  "impostorColorScale": 0.8,
  "terrainGrassColor": "#5d9c40",
  "terrainGrassTintStrength": 0.54,
  "densityScale": 1,
  "windStrengthScale": 1.2,
  "flutterStrengthScale": 1.15,
  "nearDistance": 24,
  "midDistance": 56,
  "farDistance": 280,
  "transitionDistance": 10
}
```

Rationale: tip/base pair carries the yellow-green sun-struck read (the balancer in
`GrassPaletteShader.setBalancedGrassPaletteColors` will renormalize tip/dry luminance, so hue is
what matters here); `normalUp 0.74` keeps lighting flat-ish like the reference; `ambientBoost
0.26` lifts shadowed blades the way BotW's high ambient does; `terrainGrassTintStrength 0.54`
makes the 270–290 m impostor→terrain fade land on nearly the same green. Run
`npm run test:lod-color` immediately after adding — if the root/tip contrast bound trips, raise
`rootDarkening` in steps of 0.01.

Register nothing else: `GrassArtDirection.ts` derives keys from the JSON, and the art menu lists
all presets.

## LOOK-2 — Wind waves from scrolling noise (the signature feature)

Replace the sinusoidal gust *front* (single 70 m wavelength, visibly periodic from any elevated
view) with two octaves of scrolling value noise shared by every layer. Keep the existing fine
gust + flutter sines for per-blade motion.

1. **New file `src/grass/wind/WindNoiseTexture.ts`.** Generate once at init: 128×128 `RG`
   `THREE.DataTexture`, `RepeatWrapping`, `LinearFilter`, no mips needed. Fill R with tileable
   2-octave value noise (reuse the hash from `GrassFieldVariation.ts:hashLattice` with lattice
   coordinates taken modulo the period so the texture tiles), G with the same noise at 2.7×
   frequency. Bake `smoothstep`-shaped contrast: `r = r*r*(3-2r)` so gust crests are broad and
   lulls flat, like the reference.
2. **`GrassNearMaterial.ts`.** Add uniforms `uGrassWindNoise` (texture),
   `uGrassWindNoiseScale` (default `1/48` — one texture repeat per 48 m),
   `uGrassWindNoiseSpeed` (default `0.06` — repeats/second along the wind). Replace the
   `grassGustFront` sine (`:234-239`) with:
   ```glsl
   vec2 gustUv = grassWorldRoot.xz * uGrassWindNoiseScale
     - uGrassWindDirection * (uGrassTime * uGrassWindNoiseSpeed);
   float grassGustNoise = texture2D(uGrassWindNoise, gustUv).r;      // vertex fetch
   float grassGustEnvelope = mix(1.0 - uGrassGustFrontDepth, 1.0, grassGustNoise);
   ```
   One vertex texture fetch per vertex; universally supported in WebGL2. **Compact profile:**
   compile the old sine instead (new material option `noiseWind: boolean`, set from
   `!profile.compact` where materials are constructed: `WorldGrassSystem.ts:174-184`,
   `WorldNearGrassField.ts:35-61`) so mobile pays nothing new.
3. Raise the preset's `uGrassGustFrontDepth` effect: `windswept`-class motion comes from
   `windStrengthScale 1.2` (already in LOOK-1) + gust depth 0.6. Gust depth is a material default
   (`DEFAULT_GUST_FRONT_DEPTH`, `GrassNearMaterial.ts:28`); expose it per preset by adding an
   optional `gustDepth` field to `GrassArtDirection` (default fallback to current constant) and
   applying it in `applyArtDirection`.

## LOOK-3 — Waves must read as light, not just motion

In BotW a gust crest is *brighter* — the wave is visible even where individual blades are not.
Two cheap couplings, both vertex-stage:

1. **Sheen follows gust.** In `VERTEX_SHEEN_VARYING` (`GrassNearMaterial.ts:295-304`) multiply
   the lobe survival by the gust: `vGrassSheen.x *= (0.45 + 0.85 * grassGustNoise);` (compute the
   varying after the wind block, or hoist the noise fetch above both). Result: the specular band
   sweeps with the wave across the near field.
2. **Tip lift on bent blades, all layers.**
   - Vertex-palette layers (base, mid): in `VERTEX_PALETTE` (`:435-451`) add
     `vGrassColor = mix(vGrassColor, uGrassTipColor, grassGustNoise * uGrassGustTipBoost * grassProgress);`
   - Fragment-palette layers (ultra-near, detail): add one varying `vGrassGust`
     (written = `grassGustNoise`), and apply the same mix after `grassResolvePalette` in
     `FRAGMENT_COLOR`.
   - New uniform `uGrassGustTipBoost`, default 0.12, preset-exposed as optional `gustTipBoost`.
   - **Parity:** the impostor must do the same or the 44–64 m band will pulse against the mid
     layer — see LOOK-4.3. `verify-lod-color-parity` evaluates static palettes, so this dynamic
     term must be identical *by construction* (same uniform value, same formula) in both shaders;
     add both snippets in one commit.

## LOOK-4 — One wind across all LODs (fixes R5, makes the preset "seamless")

1. **Shared constants.** Move gust uv/speed/scale into uniforms owned by one place:
   `WorldGrassSystem` passes the same `uGrassWindNoiseScale/Speed/Direction/Time` values to
   `GrassNearMaterial` (mid), the three near materials, and every `WorldGrassImpostorMaterial`
   (`update()` already fans out time: `WorldGrassSystem.ts:251-255`).
2. **Impostor sway → shear.** In `WorldGrassImpostorMaterial` vertex shader replace the
   whole-card center translation (`:73-79`) with a top-edge shear so cards bend like blades:
   ```glsl
   float gustNoise = texture2D(uWindNoise, center.xz * uWindNoiseScale
     - uWindDirection * (uTime * uWindNoiseSpeed)).r;
   float sway = (gustNoise * 2.0 - 1.0) * uWindStrength * 0.35;
   // position.y in [-r, +r]; shear grows from root to tip:
   float shear = sway * saturate(position.y / cardRadius + 0.5);
   worldPosition += vec3(uWindDirection.x, 0.0, uWindDirection.y) * shear * scaleY;
   ```
   (fold into the existing `worldPosition` construction at `:120-122`; `cardRadius` is compile-time
   via the footprint constant, or pass as uniform). Compact profile keeps a sine with the *same*
   scale/speed constants as the near sine fallback.
3. **Tip lift on cards.** `bladeData.r` is blade progress; after the palette resolve
   (`:314-324`) add the LOOK-3 formula with `bladeData.r` as `grassProgress` and the shared
   `gustNoise` passed down as a varying.
4. **Bounds honesty.** The shear's max displacement must stay inside
   `GRASS_IMPOSTOR_MAX_WIND_DISPLACEMENT` (`GrassLodTuning.ts`) — with `uWindStrength ≈ 0.13`
   (0.11 × 1.2 preset scale) and factor 0.35, max ≈ 0.046 < 0.06 ✔. Add a comment linking the
   two so future tuning keeps the invariant.

## LOOK-5 — Blade silhouette

The reference blade is shorter, wider, more tapered than the current defaults. These are global
geometry values (`public/config/grass.yaml`), so they move every preset — the current presets all
read plausibly with the new values, but screenshot them before/after:

```yaml
bladeWidthMin: 0.026      # was 0.021
bladeWidthMax: 0.058      # was 0.046
bladeHeightMin: 0.50      # was 0.55
bladeHeightMax: 0.95      # was 1.1
bladeLeanMax: 0.30        # was 0.26
underlayerFraction: 0.35  # was 0.3  (denser short understory → “fluffy” base)
```

Safety checks that make this a config-only change: the sub-pixel clamp half-width follows the
config automatically (`WorldNearGrassField.ts:273-276`); single-blade bounds derive from
`bladeHeightMax/WidthMax/LeanMax` (`WorldSingleBladeTileFactory.calculateBoundsPadding`); the
impostor card radius derives from `bladeHeightMax` + patch size. Nothing hardcodes the old sizes.
Do **not** add shader-side width/height art scales for this — they would bypass the analytic
bounds in `GrassRuntimeMath.ts`; if per-preset shape is wanted later, thread new maxima through
`calculateGrassSingleBladeRootBoundsRadius` in the same change.

If tufts should read tighter (more gap between clumps, like the reference foreground):
`CLUMP_RADIUS_SCALE 0.42 → 0.38` and `CLUMP_HEIGHT_MAX 1.14 → 1.18`
(`WorldSingleBladeTileFactory.ts:110,116`) — both stay inside `INSTANCE_VERTICAL_SCALE_MAX`
because the clump scale is clamped where it is applied (`:488-493`).

## LOOK-6 — Environment to make the preset land

Grass presets don't own the sun/fog; these are the values to pair with `zelda-field` in
`WorldApp` (fog at `WorldApp.ts:102`, sun/hemi near the shadow setup, `:460+`):

- Sun: color `#fff2d8`, intensity ~2.4; elevation ~42°, azimuth roughly along
  `windDirection` so backlight and waves agree.
- Hemisphere: sky `#bfd9f2`, ground `#7d8f5a`, intensity ~0.55.
- `FogExp2` color `#c2d6b8` (sky-tinted green), density `0.0035` → ~35 % transmittance at the
  280 m grass horizon, which is what hides the impostor→terrain fade completely.
- Keep ACES; raise `renderer.toneMappingExposure` to ~1.15 for the sun-drenched read.
- Bloom: not present in the pipeline; do **not** add a post chain for this preset (cost on
  compact profiles, and ACES + exposure gets 90 % of the read). Revisit only if a post pass
  arrives for other reasons.

If these need to vary per grass preset, add an optional `environment` block to the preset JSON
and apply it from the art menu handler — but hardcoding the pairing in `WorldApp` behind
`artDirection.key === "zelda-field"` is acceptable for a first ship.

## LOOK-7 — Flowers and accents (optional, after everything above)

> **Superseded:** the fleshed-out version of this item — a channel-packed multi-species accent
> atlas (ferns, flowers, seed heads) with per-biome tinting — now lives in
> [grass-detail-foliage-plan.md](grass-detail-foliage-plan.md). Implement from that document;
> the sketch below is kept only for context.

Cheap because the pipeline already exists: a fourth `WorldSingleBladeTileField` with
`densityMultiplier ≈ 0.004` (≈ 0.3 sprigs/m²), its own `seedSalt`, a cross-quad geometry
(two intersecting quads, 8 tris) built beside `createSingleBladeGeometry`, gated to
`sampleGrassMacroVigor(x, z) > 0.62` in the sampling loop, and a small dedicated material
(white/soft-red palette, no trail interaction, `visibilityRadius ≈ 18`). Skip impostors — at
0.3/m² they vanish before the mid band ends. Estimated total: < 2 k instances resident,
negligible cost, large "hand-placed" credibility gain.

## Seam checklist (what "seamless at different LODs" means, mechanically)

Verify each after implementing, in this order, using the fly camera (`?control=fly`):

1. **4–5 m** ultra-near/detail → base: same placements (shared cache), complementary detail
   dither. Watch a tuft while walking backward: no density dip, no re-randomization.
2. **14–34 m** base → mid: complementary near-coverage dither, canopy AO from the same macro
   functions, sub-pixel payback keeps brightness flat. Guarded by `test:lod-color`; eyeball a
   slow dolly for shimmer bands.
3. **44–64 m** mid → cards: `vFarEntry` complements the mid far-fade; wind now shared (LOOK-4);
   tip lift identical (LOOK-3/4.3). Orbit at 55 m: no counter-swaying, no brightness pulse.
4. **270–290 m** cards → terrain: fog density (LOOK-6) + `terrainGrassTintStrength 0.54`.
   From 200 m altitude the boundary must be unfindable.
5. Re-run all three gates (`npm run build`) — the new preset is enumerated automatically.

## Order of work

1. LOOK-1 preset + gates green (30 min, immediately demoable with existing systems).
2. PERF-4 + PERF-6a prerequisites, then LOOK-2 noise wind (core feature).
3. LOOK-4 unified impostor wind, then LOOK-3 light coupling (they touch the same lines).
4. LOOK-5 silhouette yaml + screenshots of all six existing presets for regression.
5. LOOK-6 environment pairing.
6. LOOK-7 flowers, only once the frame budget from the performance plan is banked.
