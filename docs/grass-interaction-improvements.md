# Grass interaction: realism and performance rework

Status: **implemented**. This document is both the plan and the record of what
shipped, so a later session can pick up tuning without re-deriving the design.

## 1. What the old system did

The whole walk-through-grass effect was one moving capsule.

`GrassInteractionField` kept a single line segment (`wakeStart` → `wakeEnd`) plus
a radius, and every `GrassNearMaterial` pushed each blade radially away from the
closest point on that segment, then subtracted a fixed `0.2 * strength` from the
blade's height to fake the crush.

Four consequences followed from that shape, and they were the whole reason it did
not read as physical:

1. **No memory.** The field was a pure function of where the character stood
   *this frame*. Grass snapped back the instant the capsule slid past, so the
   trail you just walked through was never visible.
2. **No feet.** A smooth cylinder plowed through the field, so walking and
   gliding looked identical. The character already computed a stride phase
   (`SnowflowCharacter`, `STRIDE_LENGTH_METERS`) and the grass ignored it.
3. **The bend stretched the blade.** `transformed += push * bend` translates
   vertices, so a bent blade was *longer* than a straight one — the source of the
   rubbery look. Real bending rotates about the root and conserves arc length.
   The `transformed.y -= ... * 0.2` term existed only to compensate for this.
4. **It never switched off.** `IDLE_STRENGTH_RATIO = 0.55` meant
   `uGrassInteractionStrength` never reached zero, so the "folds away for free"
   comment in the shader did not hold, and standing still left a permanent radial
   force field around the player instead of blades resting against the legs.

On top of that:

- The **mid material** (`WorldGrassSystem`, blades from 24 m to 80 m) ran the
  entire interaction block — segment projection, `length()`, `smoothstep` — for
  every blade, every frame, to arrive at a falloff of zero. The interaction
  radius was 1.55 m. This was the largest blade population in the scene doing
  pure waste work.
- `applyPulseState` **overwrote** the wake instead of adding to it, so landing
  mid-run cancelled the walking trail and made the wake jump.

## 2. The shipped design

### 2.1 A scrolling trail texture replaces the capsule

`src/grass/interaction/GrassTrailField.ts` owns a ping-ponged pair of RGBA8
render targets covering a square of world space centred on the character, snapped
to the texel grid so scrolling is a pure integer shift and the trail does not
crawl.

The targets are `RGBA16F` where the renderer reports `EXT_color_buffer_half_float`
or `EXT_color_buffer_float`, falling back to `RGBA8`. The precision matters more
than it looks: the decay is a feedback loop that reads back its own previous
frame, and at eight bits per channel a 0.5/s decay rounds to *no change at all*
for any crush below ~0.24, so faint trails freeze in place permanently. The
linear floor term described below is what keeps the byte fallback recovering, at
the cost of noticeably shorter trails.

Channel layout, all in `[0,1]`:

| Channel | Meaning |
| --- | --- |
| `R`, `G` | crush direction, unit XZ vector encoded as `dir * 0.5 + 0.5` |
| `B` | crush amount — how flattened this patch of ground is |
| `A` | freshness — 1 at the moment of a stamp, falling to 0; drives spring-back |

Neutral (untouched) is `(0.5, 0.5, 0, 0)`, which is also the clear colour and the
value sampled outside the covered square.

One fullscreen pass at a maximum of 30 Hz does everything. Delta time is
accumulated between updates so recovery speed remains independent of display
refresh rate:

1. Reprojects the previous frame's texture through the scroll delta. Texels that
   scrolled in from outside read neutral.
2. Decays `B` exponentially (`grassTrailRecoveryRate`) plus a small linear floor,
   and `A` linearly (`grassTrailFreshnessRate`). The floor is 4% of the recovery
   rate on a half-float target and 30% on the byte fallback, which is what
   guarantees a texel actually reaches zero rather than sticking on a
   quantisation step.
3. Evaluates up to `GRASS_TRAIL_MAX_CONTACTS` (8) analytic contacts submitted by
   the interaction field and blends them in. A squared-radius rejection happens
   before `sqrt` and `smoothstep`, so almost every texel exits cheaply.

Doing the contacts analytically in the same pass avoids per-contact stamp
geometry entirely. Contact values use a fixed numeric buffer, avoiding transient
objects in the animation loop.

This one change buys everything the uniform-based capsule could not express:

- persistent trails that recover over seconds
- grass that stays laid in the direction it was crushed instead of re-aligning as
  the player walks away
- the `A` channel, which gives a real per-texel spring-back timer
- multiple simultaneous actors, for free

### 2.2 Contacts, not a capsule

`GrassInteractionField` is now a contact emitter. Each frame while the character
is grounded it submits:

- **Two foot contacts.** Positions are derived from the same stride phase the
  character animation uses (`distanceTravelled / STRIDE_LENGTH_METERS`), offset
  forward by `±sin(phase) * GRASS_FOOT_STRIDE_REACH` and laterally by
  `±GRASS_FOOT_LATERAL_OFFSET`. A foot only stamps during its stance phase — the
  swinging foot is off the ground and leaves nothing. This is what turns a smear
  into discrete alternating footfalls.
- **One body contact.** A small, low-strength disc at the character's own
  position, standing in for the legs and skirt. It replaces the old idle blanket:
  standing still now displaces grass only where the body actually is.
- **A landing pulse**, when one is active: an expanding *ring* (inner radius
  fraction > 0) whose strength decays. Because it is just another contact, it now
  **adds** to the footfall trail instead of replacing it.

Foot contact strength scales with speed, so a sprint flattens harder than a walk.

### 2.3 Blades bend on an arc instead of stretching

The vertex shader now rotates each blade about its root. For a vertex at local
height `h` under bend angle `θ`:

```text
world horizontal displacement = h * verticalScale * sin(θ)
world height                  = h * verticalScale * cos(θ)
```

converted back into the instance's local space by the horizontal and depth
scales. `θ` grows along the blade (`pow(grassProgress, 0.85)`), which curves the
blade rather than tilting it rigidly, and it is clamped so a blade can never
rotate through the ground.

Blade length is preserved by construction, so the `transformed.y -= ...` fudge is
gone.

Three more per-blade terms ride along for almost nothing:

- **Per-blade stiffness** (`fract(grassPhase * φ)`), the same idea the wind path
  already used, so a footprint is not a uniformly flattened disc.
- **A saturating response**, `1 - exp(-k * crush)`, so blades directly under a
  foot flatten hard without punching through the ground.
- **Spring-back**, `sin(t * ω + phase)` scaled by the freshness channel, so
  released blades ring briefly before settling.

### 2.4 Performance

- The interaction path is now **opt-in per material** (`interactive: true`),
  selected at compile time exactly like the LOD chunks already were. Only the
  three near materials in `WorldNearGrassField` enable it. The mid material and
  both island materials no longer contain a single interaction instruction.
- Inside the near materials, the first thing the block does is an **AABB reject**
  against the covered square — two `step` pairs — before any texture fetch.
- For blades that pass, the whole thing is **one texture fetch** replacing the
  old segment projection, `length()`, and `smoothstep`.

## 3. Configuration

New keys in `public/config/world.yaml` (schema in `WorldConfigLoader`, types in
`WorldConfig`):

| Key | Default | Meaning |
| --- | --- | --- |
| `grassTrailResolution` | 256 | trail texture size in texels per axis |
| `grassTrailCoverage` | 24 | world-space size of the covered square, metres |
| `grassTrailRecoveryRate` | 0.5 | crush decay per second; lower = longer trails |
| `grassTrailFreshnessRate` | 1.4 | freshness decay per second; drives wobble length |
| `grassTrailMaxAngleDegrees` | 74 | bend angle at full crush |
| `grassTrailWobbleFrequency` | 12 | spring-back frequency, rad/s |
| `grassTrailWobbleAmplitude` | 0.16 | spring-back depth as a fraction of the bend |
| `grassFootContactRadius` | 0.32 | radius of one foot stamp, metres |
| `grassFootContactStrength` | 1 | crush a planted foot writes at full speed |
| `grassBodyContactRadius` | 0.4 | radius of the body/skirt contact |
| `grassBodyContactStrength` | 0.5 | crush the body contact writes |

At 256 texels over 24 m the trail resolves ~9.4 cm per texel, comfortably finer
than the visible footprint.

Retained from the old system: `grassLandingPulse*` still drives the pulse,
`grassInteractionStrength` is now a global scale on every contact (and
`scripts/verify-lod-continuity.mjs` asserts on it and on the bounds-padding
parameters), and `grassInteractionSpeedForFullEffect` still normalises speed.

Removed, because the capsule they described no longer exists and leaving live
looking knobs that do nothing is worse than dropping them:
`grassInteractionRadius`, `grassInteractionTrailLength`,
`grassInteractionResponse`. The loader's "interaction radii must be lower than
grassNearDistance" check now covers the pulse and the two contact radii instead.

## 4. Files touched

| File | Change |
| --- | --- |
| `src/grass/interaction/GrassTrailField.ts` | **new** — render targets, update pass, uniforms |
| `src/grass/interaction/GrassInteractionField.ts` | rewritten as a contact emitter |
| `src/grass/materials/GrassNearMaterial.ts` | `interactive` option, trail sampling, arc bend |
| `src/world/grass/WorldNearGrassField.ts` | `interactive: true` on the three near materials |
| `src/world/WorldGrassSystem.ts` | mid material drops the interaction path |
| `src/grass/GrassSystem.ts` | island materials drop the interaction path |
| `src/controls/ThirdPersonController.ts` | feeds stride, facing and grounded state |
| `src/character/SnowflowCharacter.ts` | exports `STRIDE_LENGTH_METERS` |
| `src/app/WorldApp.ts` | configures, attaches and drives the trail field |
| `src/world/WorldConfig.ts`, `WorldConfigLoader.ts`, `public/config/world.yaml` | new keys |
| `tools/trail-probe/`, `trail-probe.html` | **new** — headless verification harness |

All `GrassNearMaterial` cache keys moved `v16` → `v17`; the shader source
changed and three caches programs by that key.

## 5. Verifying

```shell
npm run build     # tsc + the three verify scripts + vite build
```

`scripts/verify-lod-continuity.mjs` covers the bounds padding and the retained
interaction config; `verify-lod-color-parity.mjs` and
`verify-grass-performance.mjs` cover the rest of the grass budget.

There is also a dedicated harness at `tools/trail-probe/` (served as
`/trail-probe.html`, same pattern as `tools/lod-blink/`). It walks a synthetic
character across a hand-built grass patch and asserts two things numerically:

1. **The trail accumulates and recovers.** It reads the crush channel back after
   a 5 m walk and again after two seconds of pure decay.
2. **Blades actually bend, and only near the trail.** It renders the same frame
   twice — once with the field live, once with it disabled, which drops the
   material to zero trail strength — and diffs the pixels.

Measured on the half-float path: 511 crushed texels after the walk, 348 after two
seconds, peak crush 0.557 → 0.180, 25% of mean crush surviving; 25% of frame
pixels changed by the bend. Both checks report PASS.

Run it with headless Chrome or Edge against `npx vite`:

```shell
npx vite --port 5199 --strictPort
chrome --headless=new --disable-gpu --use-gl=swiftshader \
  --enable-unsafe-swiftshader --virtual-time-budget=90000 \
  --window-size=740,560 --screenshot=out.png \
  http://localhost:5199/trail-probe.html
```

Note: launch the browser from the PowerShell tool, not Bash — the Bash sandbox
denies the browser's screenshot write with a silent exit code 0.

## 6. Tuning notes and possible follow-ups

- **Trail length** is `grassTrailRecoveryRate`. 0.5/s gives roughly a four-second
  recovery on the half-float path. Drop it to ~0.2 for a "path worn through a
  meadow" look. On the byte fallback the aggressive linear floor caps how long a
  trail can last no matter what this is set to.
- **Footprint size** is `grassFootContactRadius`. Below ~0.25 m the 9.4 cm texels
  start to alias; raise `grassTrailResolution` to 512 first if you want smaller.
- The trail field takes contacts from anywhere. NPCs, dropped objects or wind
  gusts can submit their own with no shader changes — `submitContact` is the only
  entry point.
- Normals are not rebent, matching the existing wind path. If flattened grass
  ever needs to read darker, the crush amount is already in the sampled texel and
  could be forwarded to the fragment stage as a varying.
- Vertical velocity is not yet fed into the foot stamp, so a hard landing and a
  gentle step-down write the same crush aside from the pulse.
