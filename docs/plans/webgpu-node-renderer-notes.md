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
Directional grass and custom stone lighting still need dedicated comparisons.

See `webgpu-migration-review-2026-09-07.md` for ownership/recovery findings,
verification and the remaining production acceptance work.
