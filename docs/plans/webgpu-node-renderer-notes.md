# Portable renderer notes

What the node renderer does differently from `WebGLRenderer`, as found while
porting the destination's materials and passes. Every item here cost a wrong
result before it was understood, and every one is held by a named check in
`scripts/check-renderer-harness.mjs` — the entries say which. None of these are
opinions about three.js; they are behaviours measured on the pinned 0.185.1
build with both backends.

Read this before porting the next material. Most of these fail silently: the
type checker is happy, nothing throws, and the image is merely wrong.

## Attributes and instancing

**`instancedBufferAttribute(value, type, stride, offset)` drops the instanced
flag.** Its internal helper only applies `setInstanced` on the whole-matrix
branches; an explicit component type falls through to a plain buffer attribute.
The transform then advances per vertex instead of per instance, which collapses
every instance onto the first. Construct the `BufferAttributeNode` directly and
call `setInstanced(true)`. — `src/render/InstanceMatrixNode.ts`, held by the
grass deformation comparison.

**There is no accessor for the instance matrix.** `NodeMaterial.setupPosition`
applies instancing itself by assigning `positionLocal` *before* `positionNode`
runs, so a custom position node silently discards that work and has nothing to
rebuild it from. Bind the columns yourself and override `setupPosition` to
suppress the built-in path; binding both exceeds the vertex budget. Node builder
state is cached per instanced mesh — `RenderObject`'s material cache key
includes the object uuid — so capturing a specific mesh's buffer is safe.

**`InstancedBufferGeometry.instanceCount` defaults to `Infinity`.** The node
backends reject the draw outright (`Value is infinite and not of type unsigned
long`). Set it explicitly.

**WebGPU binds at most eight vertex buffers.** A blade reached twelve as loose
attributes. Interleave related fields into one buffer each; attribute *count* is
a separate, looser limit (sixteen locations on WebGL 2). —
`src/grass/materials/GrassNodeGeometry.ts`.

**WebGPU has no three-component 8- or 16-bit vertex format.** Only two- and
four-component ones exist, a four-component attribute must start on a four-byte
boundary, and `offset + size` must fit inside the stride. The shipped stone
packing stores normals, a position and three colours as three-component
normalized attributes, so it cannot be bound at all — pipeline creation fails
with "vertex format not supported". Re-view the same bytes through legal windows
and reassemble in the shader rather than repacking the data. —
`src/world/stones/StoneNodeGeometry.ts`, held by the stone comparison.

## Shader construction

**Shared variables are declared where they are first touched.** `modelViewMatrix`
and `normalView` are lazily emitted; if the first reference is inside an `If`,
the declaration lands in that branch's scope and every fragment that skips the
branch reads an uninitialized value. Grass projected through an uninitialized
model-view matrix and the whole field collapsed onto the camera. Force them to
initialize before any conditional that might read them.

**`flat` qualifiers are load-bearing, and `varyingProperty` cannot carry one.**
Interpolating a value that is constant across a primitive still accumulates
barycentric float error. Where that value indexes an atlas cell or seeds a hash,
the last bit decides a different cell and a different stochastic threshold per
pixel. Use `varying(property).setInterpolation("flat")`; assign the underlying
`property` in the vertex stage. Before this the impostor's dither differed on
11,631 channels; after it, none.

**The OPAQUE alpha clamp runs inside `setupDiffuseColor`, not at the end.** A
non-transparent `NodeMaterial` assigns `diffuseColor.a = 1` while it is setting
the diffuse colour up, so an `outputNode` reading that alpha reads one, never
the value `opacityNode` produced. The GLSL equivalent lives in
`<opaque_fragment>`, which is *after* the point a material patch writes its
alpha, so the legacy side of a comparison can stay opaque where the node side
cannot. Isolating an alpha term therefore needs `transparent = true` on the node
material; blending is harmless when the output node writes alpha one. — water
surface comparison.

**A node material's own `roughness`, `color` and `opacity` properties are a
second copy of state a legacy controller owns.** `materialRoughness` and its
siblings read the node material's property, not the shipped material's, so the
two silently shade at different values the moment a live setter moves one. Where
a controller owns the value, mirror it into the uniform table it already writes
and read it with `reference` like every other input, rather than assigning the
property on both materials and hoping they stay in step. — water surface
comparison, where the base roughness was a flat 0.08 apart across the reach.

**A geometry cannot be handed to two backends at once when it carries skinning
attributes.** Sharing one `BufferGeometry` between a node-renderer mesh and a
`WebGLRenderer` reference mesh works for positions, normals, colours and uvs,
and is how most of the comparisons feed both sides identical input. It does not
work for `skinIndex`/`skinWeight`: with the node renderer on WebGPU the WebGL
reference drew nothing at all, while the very same shared geometry rendered
correctly when both sides were WebGL 2. Build the geometry once per side —
deterministic construction makes the two byte-identical, so nothing is given
up. This is a property of the harness, not of the port, but it presents as a
port failure. — actor comparison, `skinned` run.

**`setupOutput` is the node counterpart of patching `outgoingLight`.** It
receives the assembled lit result before fog and premultiplied alpha, which is
exactly where a GLSL patch inserts after `totalDiffuse + totalSpecular +
totalEmissiveRadiance`. Overriding `outputNode` instead replaces the lighting
rather than adding to it, and still produces a plausible image — so a
comparison that isolates a channel cannot see the mistake. Compare the lit
result. — actor comparison.

**`MeshBasicNodeMaterial.setupNormal` ignores `normalNode`.** It returns the
geometry normal unconditionally (three #28839), so isolating a material's normal
through a basic stand-in compares an unperturbed normal against the shipped
perturbed one — and reports the difference as agreement. Isolate through the
real material with an `outputNode` override instead.

## Passes and render targets

**With a target bound, the viewport and scissor rectangles come from the
target**, not from the renderer; only the scissor *test* still comes from the
renderer. Setting them on the renderer alone draws every pass over the whole
target.

**`clear()` ignores the scissor.** It builds its own render context from the
target's dimensions, so a scissored per-cell clear wipes everything. Clear once
before the loop where the regions are disjoint.

**A render target's viewport counts rows from the top on both backends**, where
`WebGLRenderer` counts them from the bottom.

**Render-target sampling is normalized across backends.** A pass that writes at
its quad's own coordinate and samples at that coordinate is consistent with
every material that samples the finished texture. Do *not* try to match raw row
order against a WebGL reference: the two renderers store opposite row orders and
both are correct for their own consumers. Verify the contract end to end — write
a known value at a known world position, then sample it the way a material does.
This is the one that shipped backwards for a checkpoint. — trail comparison.

**`screenCoordinate` counts rows from the top on both backends**, where
`gl_FragCoord` counts them from the bottom. Any screen-space pattern — an
ordered stipple, a dissolve threshold — lands on a different set of pixels
unless it is flipped against `screenSize.y`. Equivalent-looking is not the same
as identical, and only the flipped form lets a comparison stay strict. — water
bed comparison.

**Binding a target as both attachment and sampler is a feedback loop.** WebGPU
validates it explicitly; WebGL silently drops the draw. It was doing exactly
that in the shipped trail priming, leaving the first target cleared to zero
instead of neutral.

**Double-sided transparent materials render in two passes.** The node renderer
honours three's back-then-front order where the WebGL renderer here draws once,
so overlapping transparent surfaces can resolve to a different fragment. Compare
such materials with `forceSinglePass` to isolate the shading, and measure the
production configuration separately.

## Comparing against a WebGL reference

The comparison harness renders the node material and a `WebGLRenderer` rendering
the shipped material, then diffs. Two consequences:

- Where the node run is WebGL 2, both sides are the same API and the port should
  be **exact**. That is where the strict gates live.
- Where the node run is WebGPU, anything derivative-dependent (screen-space
  gradients, mip selection, stochastic thresholds fed by either) is being
  compared across an API boundary. Bound those runs on the average and keep
  measuring them; the same-API run is what holds the port exact.

Mip generation also differs between the backends, which moves individual pixels
of a minified atlas a long way.

## Review: optional capture samplers need a stable compiled contract

`WaterSurfaceComparison` originally never populated the refraction samplers.
The separate capture/depth-mask checks could pass while the actual water
consumer was broken. Its seventh run now warms the real material with empty
samplers, captures asymmetric geometry at half resolution, attaches the live
colour/depth textures and compares the resulting surface against shipped GLSL.
It also checks the captures themselves agree and that refraction changes over
100 pixels (measured over 7,600), preventing an inactive branch from passing.

This exposed three distinct causes, fixed one at a time without widening gates:

- Colour and depth textures produce different WebGPU binding layouts. A depth
  placeholder is required before compilation; swapping RGBA for depth later
  produced GPU validation errors and no updated surface.
- TSL target sampling is top-origin. Convert the GLSL bottom-origin screen UV
  **after adding its slope offset**, then use the same converted UV for colour
  and depth. Flipping readback rows alone cannot fix a consumer lookup.
- In pinned Three 0.185.1, `WGSLNodeBuilder.isUnfilterable` treats nearest-only
  textures as loads. An empty nearest-filtered DataTexture therefore compiles
  `textureLoad`, even when the real capture later needs linear filtering.
  Give optional colour placeholders linear filters to retain a sampler path.

After all three fixes: integrated water is exact on WebGL; WebGPU maximum 19,
mean 0.00363, 26 channels differing by more than one step, matching the existing
surface/noise tolerance. Both captures themselves have zero differing pixels.
Nulling a uniform also now detaches any old owner texture to its owned fallback.

## Review: borrowing state ends before asynchronous work begins

The node impostor baker now restores object layers and visibility immediately
after synchronous draws, before awaiting readback/PNG creation. Its final
cleanup only releases its target, so it cannot overwrite a newer frame's clear
state. Refraction uses the full target/face/mip/scissor/clear scope and restores
camera layers independently. Failed trail priming rolls back the attachment.
`verify-node-port-lifecycle.mjs` holds failure-path regressions for these cases.

## Review: compact parameters do not imply compact volume noise

The shipped `createWorldCloudVolumeMaterial` only defines the march step count;
it does not define `WORLD_CLOUD_COMPACT`. Thus its field has three octaves even
with compact profile parameters. The node volume now matches this. The full
compact volume comparison changed from maximum 87/mean about 2.08 to exact on
WebGPU and maximum 5/mean 0.00109 on WebGL, within the unchanged volume gate.
Compact analytic sky and shadow-map noise still use two octaves.

The grass comparison additionally exercises the real material under ambient
light with no directional context. Its always-on albedo/Lambert mix must run
even when transmission and sheen cannot: all four variants now match exactly.

## An assigned `normalNode` is not flipped for a double-sided material

Ambient light does not depend on the shading normal, so the ambient grass run
above could pass with the normal wrong. A directional run cannot. Adding a sun
to the grass comparison put all four variants out by maximum 14 and mean 0.12
over about 40% of the covered pixels, identically on both backends — the shape
of a material difference, not a backend one.

Zeroing the shared `uGrassBacklightStrength` barely moved the residual, which
ruled out the transmission lobe and pointed at the diffuse term itself. The
cause is that the shipped GLSL writes the blade's view normal into `vNormal`,
so `normal_fragment_begin` applies `normal *= faceDirection` on this
double-sided material, while `NodeMaterial.setupNormal` returns an assigned
`normalNode` verbatim and applies no such flip. Every back-facing blade
fragment was therefore lit from the opposite hemisphere.
`GrassNearNodeMaterial` now multiplies the graph normal by `faceDirection`,
and all sixteen grass runs — four variants x deformation/albedo/ambient/
directional — are exact on both backends.

The other three materials that assign a custom `normalNode` were checked
against the same rule. Stone and terrain are single-sided, so three defines no
`DOUBLE_SIDED` and there is no flip to mirror. The water surface is
double-sided, but both routes force the normal upward themselves — the GLSL at
`WATER_SURFACE_FRAGMENT` and the node graph at `WaterSurfaceNodes.ts` — so
that rule replaces sidedness on both sides and they agree.

## Stone custom lighting is now compared, not inferred

The stone albedo and normal runs both cut the output before `setupLighting`,
so the sky-side fill, the contact floor and the wet and dry sheen lobes were
unmeasured. A `lit` mode leaves both sides unpatched. Same-API it is nearly
exact: the coarse body matches, and the detail body differs on 9 subpixels of
22769 by one to two steps, which are the same threshold-edge pixels its albedo
run already carries into the lighting that consumes it. Across the API
boundary it inherits a fraction of the spread the derivative-built normal
already shows there (mean 0.47 against that run's 2.29). Both bounds are new
and set from measurement; no existing tolerance was loosened.

See `webgpu-migration-review-2026-09-07.md` for ownership/recovery findings,
verification and the remaining production acceptance work.

## The two frame timers did not report the same p95

Both timing implementations are pure once samples land, so they can be compared
directly rather than inferred from a HUD. `verify-gpu-timing-parity.mjs`
transpiles both from source, drives the shipped WebGL timer through a fake
disjoint-timer context and the adapter through a resolving renderer, and
compares `getStats()` over nineteen sample counts.

The medians agreed everywhere. The p95 did not: the shipped timer indexes at
`ceil(n * 0.95) - 1` and the adapter used `ceil((n - 1) * 0.95)`, which is one
sample higher for seven of the nineteen counts — including 120, the ring size
the HUD settles at, where the two disagreed on every reported frame. The
adapter now calls the shipped `percentile` rather than carrying a second rule.

## Timing capability is not the same question as timing being on

`trackTimestamp` is a *backend construction* parameter in three r185, not a
settable renderer property. A node renderer built without it answers
`resolveTimestampsAsync` with nothing, forever, while still reporting the
`timestamp-query` feature that `readRendererCapabilities` probes. Reading the
capability alone would leave the HUD showing "active" against zero samples for
the whole session, which is the failure mode this panel exists to not have.
`createFrameTimingSource` ANDs the two, so an untracked renderer reports
"unsupported" — the truth. The parity check holds all four combinations, and
fails if the conjunction is weakened to the capability alone.

## The stats panel cannot follow, and says so

stats-gl 2.0.1 reaches the GPU exactly one way: it tests `isWebGLRenderer`,
patches that renderer's `render`, and pulls the disjoint-timer extension off
the context behind it. The node renderer fails that test, and a WebGPU canvas
has no WebGL 2 context to fall back to, so nothing would bracket the frame —
the library would still add a GPU row, and it would read zero forever. Passing
a node-WebGL backend's raw context would produce the same dead row. The panel
now declines any renderer stats-gl cannot patch and names `?gpuTiming=1`, whose
HUD measures GPU frame time on both backends through the adapter above.

## Porting the stone shader performance check meant changing what it reads

`verifyStoneShaderPerformance` greps generated GLSL for `stoneGrowthNoise`,
`stoneBedDistance` and friends to prove the far stone material never grows the
near procedural work. That cannot be ported as written: TSL names nothing in
its output, so those strings do not appear in generated WGSL or GLSL at all and
a direct port would pass by never matching anything — the worst kind of green.

What survives code generation is the cost. The near path is the only one that
takes screen-space derivatives and the only one that samples the grain texture,
and both emit instructions with stable spellings on both backends. So the node
check compiles both materials through `renderer.debug.getShaderAsync` and reads
the real program: the detail program runs both, the coarse program runs
neither, and the coarse program measures about 0.17 of the detail one's length
on WebGL 2 and WebGPU alike.

## Three defects that only a WebGPU backend can show

The material comparisons ran on both backends throughout G02–G05 and were
exact, and the world still could not draw a frame on WebGPU. All three causes
are limits or defaults that the WebGL renderer either does not have or does not
read, so no amount of isolated material testing could reach them — they need
the real geometry, in the real scene, on a node backend.

**A pipeline cannot bind eleven vertex buffers.** WebGPU's floor is eight;
WebGL 2 allows sixteen. `TerrainChunk` set eleven attributes, so the pipeline
failed to create and the draw call then received an infinite index count. The
components do not fit in eight *attributes* either — 36 components at four
components each needs nine — but the limit is on buffers, and interleaved
attributes share one. Packing them into a single interleaved buffer keeps every
attribute's name, size and order, so neither the node graph nor the GLSL
reference changed and the comparison between them stayed a comparison of
shading.

**`InstancedBufferGeometry.instanceCount` defaults to `Infinity`.** The WebGL
renderer never reads it — it derives the instance count from the instanced
attributes — so nothing in the project ever set it. The node renderer passes it
straight to `drawIndexed`, which rejects an infinite instance count and loses
the frame. Both instanced geometry factories now set it from the attribute the
other counts already come from.

**The fix for the grass case was already written and never called.**
`prepareGrassNodeGeometry` was built during G04, with a comment describing this
exact eight-buffer problem, and only the development fixtures ever used it. The
production factories built their geometry the old way. Packing the blade fields
on the shared source geometry — once, not per tile, or every tile gets a private
copy of identical data — and the instance fields per geometry brings a blade
from twelve buffers to six.

The lesson for the rest of the migration is narrow and worth keeping: a
material comparison proves shading, not that the geometry it is fed can be
bound. Those are different claims and they need different checks.

## Where the shipped GLSL lives now, and why it still exists

Every legacy shader route moved into a module that only `src/dev` and the
verifiers import: `GrassNearLegacyMaterial`, `WaterSurfaceLegacyMaterial`,
`WaterBedLegacyMaterial`, `WaterCascadeLegacyMaterial`, and the foliage and
impostor factories on their owning classes.

Deleting it outright would have been easier and worse. The numerical
comparisons are the whole basis for believing the port, and a comparison
against a quotation in a document is not a comparison — the reference has to be
code that still runs. Keeping it also keeps the shader contract checks
meaningful: a large body of verifiers asserts properties of the grass, water and
stone shading by reading its text, and those assertions still hold against the
reference while the harness proves the shipped node material matches it.

What must not happen is the text shipping. `verify-built-site.mjs` fails if a
legacy GLSL function, varying or chunk name appears in any bundle chunk.
Uniform names are deliberately not used as markers: both implementations read
one shared uniform table, so a uniform name proves nothing about which shading
path shipped. Removing the text took the `WorldApp` chunk from 645.92 kB to
559.51 kB, and 190.80 kB to 171.49 kB gzipped.
