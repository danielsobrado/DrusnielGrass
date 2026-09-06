# Procedural Actor Rig and Animation — Implementation Plan

## Status

- Target branch: `main`
- Scope: planning and implementation contract
- Current state: Checkpoint B reached — phases 0 through 7 complete; the shared architecture is proven by the player, a scripted humanoid NPC, and a quadruped animating together
- Primary implementation target: existing Snowflow player character
- Architecture target: reusable actor animation foundation for player characters, humanoid NPCs, quadrupeds, birds, and later creature archetypes
- Rendering strategy: procedural geometry + skeletal articulation + targeted skinning + rigid attachments + procedural secondary motion
- External DCC dependency: none required
- Deployment: manual GitHub Pages deployment; no GitHub Actions
- Goal: replace the current player-specific pose system with a small, production-quality actor animation architecture that remains efficient for one hero character but does not require a second animation framework when NPCs and animals are added.

## Review result

The original plan had a strong player-character migration path, but it was too humanoid-specific in several foundational places.

The main problems were:

- A single closed `CharacterBoneId` would make the runtime fast for one humanoid but would not represent quadrupeds, birds, tails, wings, horns, or creature-specific chains cleanly.
- Static masks such as `upperBody`, `leftArm`, and `rightArm` assumed every animated actor was humanoid.
- `CharacterLegIk`, `CharacterArmIk`, and player-oriented action naming placed reusable solver logic inside the player domain.
- The proposed `src/character/...` ownership boundary would encourage NPC and animal code either to depend on player code or duplicate the same pose/blending/IK infrastructure.
- A single locomotion graph containing `crouch`, `roll`, and `spell` states would make those abilities appear structurally mandatory even for actors that cannot perform them.
- The performance contract assumed one hero character. NPC groups and animals require animation LOD, bounded update frequency, shared immutable definitions, and predictable per-instance memory.
- The instruction to avoid a generic skeleton definition was correct while there was only one character, but NPCs and animals are now an explicit requirement. A reusable rig definition is therefore justified rather than speculative abstraction.

The revised architecture fixes those issues without building a general-purpose game engine. It introduces only the abstractions that are now required by at least two materially different actor families.

## Product goals

The finished foundation must support the current player character and later actors without compromising the player's visual quality.

The player path must support:

- A real `THREE.Bone` hierarchy and `THREE.Skeleton`.
- Smooth, bounded shoulders, spine, hips, knees, elbows, wrists, neck, feet, and toes.
- Existing idle/walk/run/jump/land behavior preserved during migration.
- Terrain-aware foot placement and pelvis compensation.
- Crouch idle and crouch locomotion.
- A low stance suitable for hiding in tall grass.
- Deterministic dodge/evade rolling.
- Layered upper-body actions while locomotion continues underneath.
- One-hand and two-hand spell casting.
- Arm IK, look IK, semantic sockets, and simple hand poses.
- Existing cape, skirt, and hair secondary motion.

The shared actor foundation must additionally support:

- Multiple rig topologies without forcing them into a humanoid bone list.
- Multiple locomotion implementations using the same pose/blending runtime.
- Two-legged and four-legged terrain contact.
- Actors with no hands, no spell system, no crouch, or no roll.
- Optional tails, wings, ears, horns, jaws, and other species-specific bones.
- Player control, scripted movement, NPC AI, and animal AI producing the same animation-facing facts.
- Shared humanoid rig definitions for the player and humanoid NPCs.
- Independent species/rig definitions for animals.
- Animation quality/LOD policies suitable for many non-player actors.
- Stable performance and zero steady-state hot-path allocations for each active actor instance.

## Architectural principles

1. **Actor animation is driven by facts, not by input source** — keyboard, touch, NPC AI, scripted movement, and animal behavior must converge into the same animation snapshot contract.
2. **Rig topology is data, not a global humanoid enum** — each rig definition owns a fixed indexed bone table created once at initialization.
3. **Runtime indexes stay fixed and allocation-free** — extensibility must not mean string lookups or dynamic maps in per-frame code.
4. **Humanoid behavior is a profile, not the engine** — crouch, roll, arms, hands, and spell casting are humanoid/player capabilities layered on the shared core.
5. **Species own locomotion style** — a humanoid gait, quadruped gait, bird ground gait, and future creature locomotion may all generate poses through the same pose-buffer API without sharing inappropriate equations.
6. **Shared solvers operate on declared chains/effectors** — the two-bone IK primitive must not care whether a chain is called an arm, front leg, hind leg, or bird leg.
7. **Optional capabilities are explicit** — absence of a hand, tail, wing, roll action, spell layer, or IK chain must be valid rather than represented by fake bones.
8. **One actor instance, one authoritative rig** — locomotion, actions, additives, IK, and secondary motion compose on the same pose rather than maintaining competing skeletons.
9. **Gameplay owns intent and movement authority** — animation represents actions; controllers/AI/gameplay decide whether they are legal and own world displacement.
10. **Hybrid rendering** — skin only geometry that benefits from deformation. Rigid armor, claws, horns, beaks, equipment, and accessories should attach directly to bones/sockets.
11. **Procedural first** — no Blender, Mixamo, GLTF animation clips, or offline animation pipeline is required for the initial production implementation.
12. **Configuration driven** — product tuning belongs in validated YAML; structural compile-time contracts and numerical implementation constants remain in small dedicated modules.
13. **No frame allocations** — pose buffers, masks, scratch vectors/quaternions, chain solver state, and socket objects are allocated once.
14. **Animation LOD is part of the architecture** — it is optional for the single player but mandatory before actor populations grow.
15. **Composition over inheritance** — do not create `Human extends Actor extends Creature` class trees. Build actors from rig definition + animation profile + optional action/secondary modules.
16. **Prove abstraction with real differences** — add one non-player humanoid proof and one quadruped proof before considering the shared layer complete.
17. **Small modules and explicit ownership** — actor core must not absorb gameplay AI, rendering effects, terrain generation, or input handling.
18. **Manual deployment remains unchanged** — no GitHub Actions.

## Non-goals

Do not expand this work into:

- A general animation editor.
- Motion capture tooling.
- Arbitrary runtime retargeting between unrelated skeletons.
- A universal procedural creature generator.
- Full creature AI.
- Enemy combat AI.
- Ragdoll physics.
- Physically simulated cloth.
- Network replication.
- GPU crowd skinning/animation textures before profiling proves they are necessary.
- A generic iterative IK framework before a real chain requires it.
- Dozens of individual finger/toe bones by default.

The architecture must allow these later without implementing them prematurely.

# 1. Domain model

## Actor

An **actor** is any world entity whose visual body is animated from movement/action facts.

Examples:

- Player humanoid.
- Humanoid NPC.
- Deer-like quadruped.
- Wolf-like quadruped.
- Bird.
- Future fantasy creature.

The actor animation layer does not own AI or player input.

## Rig definition

A **rig definition** is immutable structural data shared by every actor instance using the same topology.

It defines:

- Bone count and stable local indexes.
- Bone names for debugging only.
- Parent indexes.
- Bind transforms.
- Semantic roles/tags.
- Declared limb/contact/reach chains.
- Declared masks/groups.
- Declared sockets.
- Optional secondary chains.
- Joint-limit data.
- Structural capabilities.

Examples:

- `HumanoidRigDefinition`.
- `QuadrupedRigDefinition`.
- `BirdRigDefinition` later.

A rig definition is not a live Three.js object and contains no per-instance mutable transform state.

## Rig instance

A **rig instance** is the live Three.js representation for one actor.

It owns:

- `THREE.Bone` objects.
- `THREE.Skeleton`.
- Skinned meshes.
- Rigid bone attachments.
- Socket objects.
- Per-instance pose application state.

Multiple NPCs of the same species may share the same immutable rig definition while each has its own rig instance.

## Animation profile

An **animation profile** defines how an actor family converts facts into poses.

Examples:

- `HumanoidAnimationProfile`.
- `QuadrupedAnimationProfile`.
- Later `BirdAnimationProfile`.

The profile supplies only the modules that actor family supports, such as:

- Locomotion pose provider.
- Contact IK policy.
- Reach IK policy.
- Look behavior.
- Stance provider.
- Action providers.
- Secondary-motion modules.

Do not represent unsupported behavior with empty fake bones or unreachable states.

# 2. Coordinate and transform contract

All rig definitions use the same world/local convention:

- `+Y` = up.
- `+Z` = actor forward in local bind space.
- `+X` = actor right.
- Bone transforms are local to parent.
- Bind pose is a neutral species-appropriate reference pose.
- Root/world placement is separate from anatomical articulation.
- Chain solvers consume explicit bend-plane/pole data from rig definitions; they do not infer axes from names.

Species may have different neutral postures. A quadruped is not required to use a humanoid standing bind pose.

# 3. Rig definition architecture

## Core modules

Add shared modules under:

`src/actor/rig/`

Recommended files:

- `ActorRigDefinition.ts`
- `ActorRigBuilder.ts`
- `ActorRigInstance.ts`
- `ActorBoneIndex.ts`
- `ActorRigRoles.ts`
- `ActorRigChains.ts`
- `ActorRigMasks.ts`
- `ActorSockets.ts`
- `ActorJointLimits.ts`
- `ActorSkinWeights.ts`

Player-specific geometry may remain under `src/character/` while consuming this core.

## Bone identity

Do not use one global `CharacterBoneId` enum for every creature.

Instead:

- A rig definition owns a contiguous local integer index range `0..boneCount-1`.
- Bone indexes are stable for that definition.
- Debug names are resolved only outside hot loops.
- Profile code receives typed/resolved indexes during initialization and stores them directly.
- No animation update may repeatedly call `getObjectByName()` or search string maps.

A small branded numeric type may be used for safety:

```ts
export type ActorBoneIndex = number & { readonly __actorBoneIndex: unique symbol };
```

Do not add wrapper objects around indexes in hot paths.

## Semantic roles

Provide a small shared role vocabulary only where multiple families genuinely share meaning.

Useful common roles include:

- `root`
- `center`
- `head`
- `look`
- `mouth`
- `primaryEffectOrigin`

Do not create universal roles such as `leftArm` for animals that do not have arms.

Family-specific roles belong to the family definition:

Humanoid examples:

- `pelvis`
- `chest`
- `hand.L`
- `hand.R`
- `foot.L`
- `foot.R`

Quadruped examples:

- `pelvis`
- `chest`
- `frontPaw.L`
- `frontPaw.R`
- `hindPaw.L`
- `hindPaw.R`
- `tailRoot`

Bird examples later:

- `body`
- `wingTip.L`
- `wingTip.R`
- `foot.L`
- `foot.R`
- `beak`

The shared runtime cares about indexes and chain descriptors, not these debug/semantic strings every frame.

# 4. Required humanoid rig

The existing player and humanoid NPCs should initially share one humanoid topology:

```text
actorRoot
└── pelvis
    ├── spineLower
    │   └── spineUpper
    │       └── chest
    │           ├── neck
    │           │   └── head
    │           ├── clavicle.L
    │           │   └── upperArm.L
    │           │       └── forearm.L
    │           │           └── hand.L
    │           └── clavicle.R
    │               └── upperArm.R
    │                   └── forearm.R
    │                       └── hand.R
    ├── thigh.L
    │   └── shin.L
    │       └── foot.L
    │           └── toe.L
    └── thigh.R
        └── shin.R
            └── foot.R
                └── toe.R
```

`actorRoot` is world/root-motion placement and is not an anatomical bend joint.

Optional hand bones are added only when hand poses are implemented:

```text
hand.L
├── thumb.L
├── index.L
├── middle.L
└── fingers.L

hand.R
├── thumb.R
├── index.R
├── middle.R
└── fingers.R
```

The grouped `fingers` bone initially represents ring + little fingers.

# 5. Quadruped extension contract

The first animal proof should use a deliberately small quadruped skeleton sufficient to validate the architecture.

Recommended topology:

```text
actorRoot
└── bodyCenter
    ├── pelvis
    │   ├── hindUpper.L
    │   │   └── hindLower.L
    │   │       └── hindPaw.L
    │   ├── hindUpper.R
    │   │   └── hindLower.R
    │   │       └── hindPaw.R
    │   └── tail.01
    │       └── tail.02
    │           └── tail.03
    └── spine
        └── chest
            ├── neck
            │   └── head
            ├── frontUpper.L
            │   └── frontLower.L
            │       └── frontPaw.L
            └── frontUpper.R
                └── frontLower.R
                    └── frontPaw.R
```

This is a validation topology, not a claim that every real quadruped uses identical anatomy.

Requirements:

- Four contact effectors.
- Separate front/hind limb chains.
- Spine pitch/bend support.
- Head/look support.
- Optional tail chain.
- No hand, spell, crouch, or roll requirement.

A more anatomically detailed horse/deer/dog leg may later add metacarpal/hock segments. The shared pose system must not require changing when a family uses a three-segment leg; only that family's solver/profile may need a new chain implementation.

# 6. Bird and other future rigs

Do not implement a bird during the initial migration, but keep the definition contract able to express:

- Wing chains.
- Two ground-contact legs.
- Tail feathers/bones.
- Beak/head socket.
- Flight locomotion without terrain contact IK.

The core must not assume:

- Every actor is grounded.
- Every actor has exactly two or four contact limbs.
- Every actor has hands.
- Every action uses upper/lower-body masks.

# 7. Rig chains and effectors

## Generic chain descriptor

Reusable IK must operate on chain descriptors rather than hardcoded humanoid names.

A two-bone chain descriptor needs resolved indexes for:

- Root joint.
- Mid joint.
- End effector.
- Optional terminal orientation bone.
- Rest segment lengths.
- Preferred bend/pole direction.
- Joint constraints.

Examples using the same primitive:

- Humanoid thigh → shin → foot.
- Humanoid upper arm → forearm → hand.
- Quadruped front upper → front lower → paw.
- Quadruped hind upper → hind lower → paw.
- Bird upper leg → lower leg → foot.

## Effector definitions

Rig definitions may declare effectors such as:

- Ground contact.
- Reach target.
- Look origin.
- Effect/spell origin.
- Mouth/bite origin.

Animation profiles decide which effectors are active. The core does not automatically solve every declared effector.

# 8. Masks and groups

Do not hardcode a global mask list requiring every rig to implement `upperBody` or `hands`.

Each animation profile resolves the masks it needs once at initialization.

Shared pose code only needs a numeric per-bone mask buffer.

Humanoid masks may include:

- Full body.
- Lower body.
- Upper body.
- Spine + arms.
- Left arm.
- Right arm.
- Head/neck.
- Hands.

Quadruped masks may include:

- Full body.
- Spine/head.
- Front limbs.
- Hind limbs.
- Tail.

Masks are immutable after profile initialization and never rebuilt per frame.

# 9. Rig instance and rendering ownership

`ActorRigInstance` should:

- Create/own `THREE.Bone` objects from a definition.
- Create `THREE.Skeleton`.
- Apply bind transforms.
- Expose direct indexed bone access.
- Own sockets and rigid attachments.
- Own or reference per-instance skinned meshes.
- Dispose only resources it actually owns.

It must not:

- Read player input.
- Read NPC AI state directly.
- Decide locomotion.
- Execute gameplay actions.
- Sample terrain by itself.
- Spawn spell/particle effects.

Shared immutable geometry/material data should be reused between identical NPC/animal instances where practical. Ownership must be explicit so one actor cannot dispose resources still used by another.

# 10. Mesh strategy: rigid + targeted skinning

Keep rigid attachments where deformation is unnecessary.

Humanoid examples:

- Shoulder armor.
- Belt hardware.
- Medallion.
- Bracers.
- Boots.
- Weapons.

Animal examples:

- Horns/antlers.
- Claws/hooves.
- Beak.
- Saddle/equipment later.
- Eye meshes.

Skin only geometry where joint deformation visibly matters.

Initial humanoid candidates:

- Torso/tunic shoulders and waist.
- Hip/robe transition.
- Elbow/knee transition pieces where rigid gaps are visible.

Initial quadruped proof may remain largely rigid/articulated if that is enough to validate the runtime. Do not add animal skinning merely to prove extensibility.

## Procedural skin weights

`ActorSkinWeights` should operate from mesh-specific influence declarations rather than humanoid bone names.

Requirements:

- Maximum four influences per vertex.
- Prefer one/two influences where possible.
- Finite, non-negative weights.
- Normalized sums.
- No references outside the mesh's allowed influence set.
- Bind pose reproduces generated geometry exactly enough to avoid visible offset.

# 11. Joint limits

Joint limits belong to rig/family definitions.

Shared code provides limit application primitives; humanoid and quadruped profiles provide different values and supported axes.

Humanoid limits cover:

- Spine.
- Neck/head.
- Clavicles.
- Shoulders/elbows/wrists.
- Hips/knees/ankles/toes.

Quadruped limits cover:

- Spine/neck/head.
- Front/hind limb joints.
- Paw/hoof orientation as needed.
- Tail segments if constrained.

Do not encode human joint names in the generic constraint engine.

# 12. Pose representation

## Actor pose buffer

Add:

`src/actor/animation/ActorPose.ts`

A pose is sized from `rigDefinition.boneCount` during actor initialization.

Per bone it stores reusable local transform data:

- Rotation quaternion.
- Translation where permitted.

Required operations:

- Reset to bind pose.
- Copy.
- Blend.
- Add additive deltas.
- Blend through numeric mask.
- Apply to rig instance.

Rules:

- No Euler interpolation.
- No per-frame object maps.
- No dependence on a specific bone count.
- Buffers are allocated once and reused.

## Pose scratch pool

Each actor animation runtime owns a bounded set of pose buffers needed by its active graph/layers.

Do not create a global mutable pool shared across concurrently updating actors.

# 13. Animation input contract

## Actor animation snapshot

Animation consumes runtime facts, not controller classes.

Add:

`src/actor/animation/ActorAnimationInput.ts`

Common fields should remain small and universal:

```text
worldPosition
worldVelocity
facing
grounded
groundNormal
speed
normalizedSpeed
acceleration
verticalVelocity
movementDirection
teleported/reset flag
```

Family/action extensions are supplied through typed profile state owned outside the shared base snapshot rather than growing one universal object with every future ability.

Humanoid player extensions may include:

```text
jump phase facts
stance
roll action snapshot
spell action snapshot
look target
```

Animal extensions may include:

```text
gait mode
turn rate
alert/look target
optional tail/behavior parameters
```

The shared runtime must not know where those facts came from.

# 14. Control and AI boundary

The same animation stack must work for all control sources.

## Player path

`ThirdPersonController` continues to own:

- Player movement intent.
- Jump physics.
- Grounding/collision.
- Camera.
- Semantic action requests.
- Gameplay root position.

It creates animation facts for the actor runtime.

## Humanoid NPC path

Future NPC movement/AI owns:

- Navigation/steering.
- Desired speed/facing.
- Grounding/collision.
- NPC action intent.

It produces the same humanoid animation facts without depending on `ThirdPersonController`.

## Animal path

Future animal behavior owns:

- Wander/flee/follow/idle decisions.
- Navigation/steering.
- Desired gait.
- Grounding.
- Species-specific action intent.

It produces generic movement facts plus its animal profile state.

Animation code must never call AI decision methods or read DOM/input state.

# 15. Animation runtime and composition pipeline

Add:

`src/actor/animation/ActorAnimationRuntime.ts`

The runtime coordinates reusable pose composition but delegates pose generation to the actor's profile.

Stable update order:

1. Receive resolved movement/action facts.
2. Ask locomotion provider for base pose.
3. Apply locomotion transition blending.
4. Apply supported action layers through profile masks.
5. Apply additive motion.
6. Enforce required pre-IK constraints.
7. Apply contact IK when enabled.
8. Apply reach/interaction IK when enabled.
9. Apply look IK when enabled.
10. Enforce final joint limits.
11. Apply final pose to rig bones.
12. Update required world matrices/sockets once.
13. Update supported secondary-motion modules.
14. Publish socket/effect transforms/events.

A profile may skip any unsupported stage.

No module may silently reorder the pipeline for one species.

# 16. Locomotion provider interface

Do not put humanoid and animal gait equations into one giant locomotion class.

Use a small provider contract such as:

```text
generatePose(input, gaitState, targetPose)
reset()
```

Concrete implementations:

- `HumanoidLocomotionLayer`.
- `QuadrupedLocomotionLayer`.
- Later `BirdGroundLocomotionLayer` / `BirdFlightLocomotionLayer` if required.

The shared runtime owns blending and pose buffers. The species layer owns how its bones move.

# 17. Gait/contact model

The original single `CharacterGait` concept must become effector-based so it works with two or four feet.

Add:

`src/actor/animation/ActorGait.ts`

Responsibilities:

- Maintain normalized gait cycle phase.
- Resolve per-effector plant/swing weight.
- Resolve stride frequency/length facts.
- Allow profile-defined phase offsets.
- Expose contact phase to terrain IK and environment interaction.

Humanoid walking typically uses two foot effectors approximately phase-opposed.

Quadruped profiles may define different phase tables for:

- Walk.
- Trot.
- Run/gallop later.

Do not implement every real gait initially. The quadruped proof needs idle + one walk gait sufficient to validate four contact phases.

Grass/water/environment interaction should eventually consume declared contact effectors rather than assuming exactly two human feet.

# 18. State machines and capabilities

## Shared runtime state

The shared runtime needs only concepts that are universal enough to justify central ownership, such as:

- Current locomotion state key.
- Previous/current transition.
- Blend progress.
- Active profile layer weights.

## Profile states

Humanoid locomotion states may include:

- `idle`
- `walk`
- `run`
- `takeoff`
- `rise`
- `apex`
- `fall`
- `land`
- `crouchIdle`
- `crouchWalk`
- `roll`

Quadruped locomotion may initially include:

- `idle`
- `walk`
- optional `run` later

Bird states later may include ground and flight modes.

Do not create one global state enum containing every possible actor state.

## Optional capabilities

Capability is represented by installed profile modules/definitions rather than dozens of booleans.

Examples:

- A humanoid profile has a stance provider, roll provider, arm reach solver, hand pose provider, spell action provider.
- A deer profile has none of those but has four contact limbs and a tail secondary-motion provider.

Code that needs an optional behavior should resolve it at initialization or through an explicit optional profile field, not repeatedly test strings in the frame loop.

# 19. Transition blending

Add shared:

`src/actor/animation/ActorPoseBlender.ts`

Requirements:

- Preserve current blended source pose when a transition starts.
- Generate destination continuously.
- Quaternion blend rotations.
- Blend translations only where valid.
- Use a small fixed easing set.
- Allow interruption without allocations.
- Work with any rig bone count.
- Never assume humanoid state names.

Transition definitions belong to each animation profile.

# 20. Generic two-bone IK primitive

Add:

`src/actor/ik/TwoBoneIk.ts`

It must operate entirely on resolved transforms/chain descriptors.

It must not know terms such as arm, knee, paw, or hand.

Requirements:

- Analytic solution.
- Explicit bend/pole direction.
- Reach clamping.
- Stable behavior close to full extension.
- Bounded joint constraints.
- Reusable scratch state.
- No allocation per solve.

This primitive should serve:

- Humanoid legs.
- Humanoid arms.
- Quadruped front/hind two-segment proof limbs.
- Future compatible animal limbs.

If a later species genuinely needs a three-segment or spline IK solver, add that solver separately. Do not complicate `TwoBoneIk` now.

# 21. Generic contact IK

Replace player-specific `CharacterLegIk` ownership with:

`src/actor/ik/ActorContactIk.ts`

It accepts a profile-defined set of contact chains/effectors.

For each enabled effector:

1. Resolve expected animated contact position.
2. Sample terrain height/normal through an injected terrain-contact sampler.
3. Build desired effector target.
4. Read gait plant weight.
5. Blend IK strongly while planted and weakly/zero while swinging.
6. Solve the declared chain.
7. Align terminal foot/paw/hoof orientation as configured.

## Body-height compensation

Do not name the generic system `pelvis compensation` because quadrupeds may adjust a body center/spine anchor.

Add a profile-defined body support solver that can request a bounded vertical/tilt correction before contact limbs solve.

Humanoid implementation:

- Adjust pelvis height so both legs remain feasible.

Quadruped implementation:

- Initially adjust body center height with conservative pitch/roll limits from four contacts.
- Do not attempt full physically based body stabilization in the proof phase.

## Contact IK acceptance

Humanoid:

- Both feet contact slopes without obvious penetration.
- No knee inversion or leg stretch.

Quadruped proof:

- Four paws follow representative uneven terrain.
- Body does not visibly snap between contacts.
- Front/hind limbs bend in intended directions.
- Gait swing limbs are not pinned to ground.

# 22. Reach IK

Add shared chain solving under:

`src/actor/ik/ActorReachIk.ts`

Humanoid profile initially uses it for arms.

Requirements:

- Resolve target in world or actor local space once.
- Explicit pole control.
- Reach clamping.
- Optional proximal/clavicle contribution supplied by humanoid profile.
- Blend less than 1.0 when procedural action pose should remain visible.

Animals are not required to install reach IK merely because the module exists.

Future creatures could use the same mechanism for a forelimb interaction if appropriate.

# 23. Look system

Add shared:

`src/actor/ik/ActorLookIk.ts`

A profile declares its look chain and weight distribution.

Humanoid example:

- Small upper-spine contribution.
- Medium neck contribution.
- Head final contribution.

Quadruped example:

- Optional upper spine/chest contribution.
- Neck.
- Head.

Requirements:

- Bounded yaw/pitch.
- Smooth acquire/release.
- No target retained after teleport/reset.
- Profile can reduce/disable look during incompatible actions.

# 24. Sockets

Sockets are rig-definition data, not player-only code.

Add:

`src/actor/rig/ActorSockets.ts`

Common semantic socket keys may include:

- `head`
- `mouth`
- `chest`
- `effect.primary`

Humanoid sockets may additionally include:

- `hand.L`
- `hand.R`
- `palm.L`
- `palm.R`
- `weapon.L`
- `weapon.R`
- `backWeapon`
- `spellOrigin`

Animal sockets may include:

- `mouth`
- `head`
- `back`
- `tailTip`

Effect/gameplay systems must request documented sockets from the actor capability/profile they require. They must not query arbitrary bone geometry.

Missing mandatory sockets should fail at initialization for that feature, not silently fall back to world origin.

# 25. Secondary motion

Secondary motion is profile-specific and consumes the final primary pose.

Shared interface:

```text
update(delta, actorFacts, rigInstance)
reset()
dispose()
```

Player humanoid modules:

- Cape.
- Hair.
- Skirt/robe.

Quadruped examples:

- Tail.
- Ears later.

Bird examples later:

- Tail/feather secondary response if needed.

Do not make cape concepts part of `ActorAnimationRuntime` beyond a generic secondary-module hook.

# 26. Preserve current player locomotion first

Before adding new player abilities, port the current visual behavior through the shared actor foundation.

The humanoid locomotion profile must reproduce:

- Idle breathing/bob.
- Walk gait.
- Run gait.
- Acceleration lean.
- Opposed arm swing.
- Takeoff compression.
- Rise pose.
- Apex tuck.
- Fall pose.
- Landing compression/recovery.
- Slope alignment.
- Existing cape/hair response.

Do not redesign the player gait during the infrastructure migration unless a defect blocks the new architecture.

# 27. Humanoid player actions

These remain character-specific modules built on the shared actor runtime.

Recommended location:

`src/character/actions/`

They must not migrate into `src/actor/` merely because they use actor poses.

## Stance/crouch

Humanoid stance initially supports:

```text
standing
crouched
```

Crouch pose coordinates:

- Pelvis down/back.
- Hip flexion.
- Knee flexion.
- Ankle compensation.
- Torso lean.
- Spine/head compensation.
- Reduced shoulder motion.
- Terrain contact IK.

Crouch walk uses shorter stride, lower center of mass, reduced arm swing, and persistent knee bend.

Expose approximate head/body height for later hiding/visibility logic. Stealth AI remains outside this plan.

## Roll/dodge

`CharacterRollAction` owns semantic phase and desired root displacement profile.

Recommended phases:

1. Anticipation.
2. Compression.
3. Launch.
4. Rotation.
5. Recovery.

Gameplay/controller owns actual world displacement.

Animation requirements:

- Lower pelvis.
- Curl spine.
- Tuck head.
- Draw knees in.
- Protect head/chest with arms.
- Stable recovery planting.
- Camera follows gameplay root, not visual somersault orientation.
- Cape/skirt receive action-specific secondary motion facts.

## Upper-body action layer

Humanoid profile supports a mask-based upper-body layer so actions can continue over locomotion.

Examples:

- Walk while charging spell.
- Stand while two-hand casting.
- Crouch while readying spell if later enabled.

## Spell casting

Initial cast modes:

- `oneHand`
- `twoHand`

Semantic phases:

1. Windup.
2. Charge.
3. Release.
4. Recover.

Spell animation consumes target-driven facts rather than effect implementation:

```text
castProgress
primaryHandTarget
secondaryHandTarget
lookTarget
spellDirection
chargeAmount
releasePulse
```

Spell effects attach to sockets and remain outside animation.

## Hands

Initial semantic poses:

- Relaxed.
- Fist.
- Open.
- Point.
- Grip.
- Cast.

Finger articulation is applied after arm reach/orientation has stabilized.

# 28. NPC reuse contract

Humanoid NPCs must reuse:

- `HumanoidRigDefinition`.
- Humanoid pose buffers/masks.
- Humanoid locomotion layer.
- Humanoid contact IK.
- Humanoid look IK.
- Shared joint limits.
- Shared socket definitions where appropriate.

They may use different:

- Appearance geometry/materials.
- Scale/proportions within validated bounds.
- Locomotion tuning profile.
- AI/controller.
- Action set.
- Animation quality/LOD level.

The NPC architecture must not instantiate `ThirdPersonController` or fake player input.

## NPC proof requirement

Before the actor foundation is considered reusable, create a development-only/scripted non-player humanoid actor that:

- Uses the same humanoid rig definition as the player.
- Walks a deterministic short path or circle.
- Stops/starts.
- Turns.
- Uses shared locomotion blending.
- Uses shared contact IK when close enough for full quality.
- Has no dependency on player input classes.

This is an architectural proof, not NPC AI work.

# 29. Animal proof contract

The first animal proof should be a simple quadruped procedural actor.

It only needs enough art/behavior to validate infrastructure:

- Distinct procedural quadruped body.
- Four articulated limbs.
- Spine/neck/head.
- Optional simple tail.
- Idle pose.
- Walk gait.
- Four contact phases.
- Terrain contact IK.
- Turn/facing response.
- Look target support if simple to include.

It does not need:

- Production animal art quality.
- Full AI.
- Running/galloping.
- Attacks.
- Feeding.
- Herd behavior.
- Complex skinning.

The proof must be good enough to expose hidden humanoid assumptions in the core.

# 30. Animation LOD and actor populations

The player remains full fidelity. NPCs/animals need scalable cost.

Add later:

`src/actor/animation/ActorAnimationQuality.ts`

Quality policy should be configuration-driven and based on distance/importance/runtime profile.

Recommended conceptual levels:

## Full

For player and nearby important actors:

- Update every render frame.
- Full locomotion blending.
- Contact/reach/look IK.
- Secondary motion.
- Full skinning.

## Reduced

For nearby/mid-distance NPCs/animals:

- Pose generation may run at a lower configured frequency and interpolate visually.
- Simplified/less frequent contact IK.
- Reduced look updates.
- Optional secondary motion disabled or reduced.

## Minimal

For distant actors:

- Coarse locomotion phase.
- No terrain/reach IK unless required.
- No secondary motion.
- Lower update rate.
- Consider rigid or simpler LOD geometry.

## Culled

Outside relevant visual range:

- No animation work.
- Gameplay/AI may continue at its own independent cadence.

Do not hardcode distances/rates in the animation classes.

## Performance rules for populations

- Share immutable rig definitions.
- Share immutable geometry/material resources where visually appropriate.
- Reuse per-instance pose buffers.
- Avoid one JavaScript object per bone per frame.
- Avoid updating socket world matrices that no active system reads.
- Skip IK before doing terrain samples when quality policy disables it.
- Skip secondary motion before spring work when disabled.
- Do not implement GPU crowd animation until CPU profiling shows it is needed.
- Pool actor instances only if spawn/despawn churn proves allocation cost matters.

# 31. Configuration strategy

Gameplay/art tuning belongs in YAML when it is expected to change without code edits.

The existing player values may continue in `public/config/world.yaml` during migration.

When the first non-player actor/species becomes production functionality, introduce a validated actor/species configuration file rather than adding endless species keys to `world.yaml`.

Recommended future file:

`public/config/actors.yaml`

**Deferred.** Fauna tuning currently lives as `fauna*` keys in
`public/config/world.yaml`, because `WorldConfigLoader.parse` is a schema-driven
loop: a numeric key costs one line in `WorldConfig.ts`, one rule in
`WorldConfigSchema.ts` and one line in the YAML, with no loader, no second
`await` in `WorldApp.create` and no new `test:config` fixtures. Introduce
`actors.yaml` when a *second* species family with its own movement profile
arrives and the key count stops being a handful.

Note also that the quadruped gait cannot become a trot while
`verify-actor-rig.mjs` requires two planted contacts: four evenly spaced phase
offsets give exactly two at `dutyFactor = 0.5` and one below it, so a trot's
~0.4 is structurally excluded. A faster deer is a faster walk.

Potential categories:

- Humanoid movement profile.
- Player action tuning.
- NPC humanoid locomotion variants.
- Quadruped walk speed/gait/stride tuning.
- Contact IK strength/clearance.
- Animation LOD thresholds/update rates.
- Species scale/proportion ranges where art-directed.

Do not put structural rig topology in YAML merely to avoid TypeScript. Bone parent graphs and solver bindings are compile-time structural contracts and should remain small typed definitions unless runtime-authored creatures become a real product requirement.

Every new product config field requires:

- Typed config representation.
- Schema validation.
- Cross-field validation where needed.
- Config contract verifier coverage.
- Documented defaults in the YAML file.

# 32. Proposed source layout

Target shared organization:

```text
src/
  actor/
    rig/
      ActorRigDefinition.ts
      ActorRigBuilder.ts
      ActorRigInstance.ts
      ActorBoneIndex.ts
      ActorRigRoles.ts
      ActorRigChains.ts
      ActorRigMasks.ts
      ActorJointLimits.ts
      ActorSkinWeights.ts
      ActorSockets.ts

    animation/
      ActorAnimationInput.ts
      ActorAnimationRuntime.ts
      ActorAnimationProfile.ts
      ActorPose.ts
      ActorPoseBlender.ts
      ActorGait.ts
      ActorAnimationQuality.ts

    ik/
      TwoBoneIk.ts
      ActorContactIk.ts
      ActorReachIk.ts
      ActorLookIk.ts

    secondary/
      ActorSecondaryMotion.ts

  character/
    SnowflowCharacter.ts

    rig/
      HumanoidRigDefinition.ts
      HumanoidRigBuilder.ts
      HumanoidRigTuning.ts
      HumanoidJointLimits.ts
      HumanoidSkinWeights.ts
      HumanoidSockets.ts

    animation/
      HumanoidAnimationProfile.ts
      HumanoidLocomotionLayer.ts
      HumanoidLocomotionTuning.ts
      HumanoidGaitProfile.ts
      HumanoidBoneMasks.ts
      CharacterHandPose.ts
      CharacterSpellPose.ts
      CharacterSpellTuning.ts

    actions/
      CharacterActionState.ts
      CharacterActionController.ts
      CharacterStance.ts
      CharacterRollAction.ts
      CharacterSpellAction.ts

    secondary/
      CapeMotion.ts
      CapeMotionGeometry.ts
      CapeMotionTuning.ts
      CharacterHairMotion.ts
      CharacterSkirtMotion.ts

  creatures/
    quadruped/
      QuadrupedRigDefinition.ts
      QuadrupedRigBuilder.ts
      QuadrupedAnimationProfile.ts
      QuadrupedLocomotionLayer.ts
      QuadrupedGaitProfile.ts
      QuadrupedJointLimits.ts
      QuadrupedSecondaryMotion.ts
```

Do not create every listed file up front. Create a module only when its phase requires it.

Existing files should move incrementally. Avoid rename churn mixed with behavioral changes.

# 33. Migration strategy

The migration must remain bisectable and visually testable after every phase.

Do not perform a flag-day rewrite.

## Compatibility bridge

During early phases:

- Keep `SnowflowCharacter.update(...)` stable where practical.
- Build shared actor/rig primitives behind the player facade.
- Keep current cape/hair systems connected.
- Port one responsibility at a time.
- Delete old pivot/group animation only after equivalent skeletal behavior is verified.

Temporary migration adapters are allowed only with an explicit TODO and a named removal phase.

## Extensibility checkpoint rule

Do not postpone NPC/animal validation until after all player actions are implemented.

The shared actor abstraction must be tested with:

1. Player humanoid.
2. Non-player humanoid.
3. Minimal quadruped.

If the quadruped requires fake `arm`, `hand`, `crouch`, or `spell` concepts, the shared API is wrong and must be corrected before continuing.

# 34. Implementation phases

## Phase 0 — Baseline and regression contract

**Status:** complete

### Work

- Record current player rig hierarchy/transforms/dimensions.
- Record locomotion thresholds and jump/landing timing.
- Capture deterministic representative player pose snapshots/invariants.
- Record desktop and compact/mobile player animation baseline.
- Add rig/motion verification before restructuring.

### Acceptance gate

- Existing build passes.
- Baseline verifier detects missing/broken current joints.
- Visual behavior remains unchanged.

---

## Phase 1 — Shared actor rig definition core

**Status:** complete

### Work

- Add `ActorRigDefinition`.
- Add stable per-definition numeric bone indexes.
- Add chain/mask/socket descriptors.
- Add generic joint-limit representation.
- Add definition validation.
- No player visual changes yet.

### Acceptance gate

- A small synthetic test rig can be defined/validated without humanoid assumptions.
- Definition validation rejects duplicate/invalid parent indexes, invalid chains, invalid sockets, and cyclic hierarchy.
- Runtime hot-path API exposes resolved indexes rather than string search.

---

## Phase 2 — Humanoid skeletal rig on shared core

**Status:** complete

### Work

- Define `HumanoidRigDefinition`.
- Build real `THREE.Bone` hierarchy.
- Create rig instance/skeleton.
- Reattach existing rigid procedural body pieces with minimal visual change.
- Add clavicles/spine/chest/neck/toes.
- Add humanoid sockets required later.
- Keep cape/hair/skirt working.

### Acceptance gate

- Player looks substantially identical in bind/idle pose.
- Every required humanoid bone exists once.
- Shared definition validator passes.
- No per-frame allocations introduced.

---

## Phase 3 — Shared pose buffers, masks, blending runtime

**Status:** complete

### Work

- Add `ActorPose` sized by rig definition.
- Add mask buffers.
- Add quaternion pose blender.
- Add `ActorAnimationRuntime` pipeline shell.
- Add profile interface.
- No new player actions yet.

### Acceptance gate

- Runtime works with arbitrary validated bone count.
- No global humanoid bone count is assumed.
- Pose buffers/masks allocate only at initialization.

---

## Phase 4 — Port current player locomotion

**Status:** complete

### Work

- Add `HumanoidAnimationProfile` and `HumanoidLocomotionLayer`.
- Port current idle/walk/run/takeoff/rise/apex/fall/land equations.
- Add shared gait/contact phase model for two feet.
- Move locomotion state selection/blending out of `SnowflowCharacter`.
- Keep current cape behavior.

### Acceptance gate

- Existing player locomotion visually matches baseline closely.
- `SnowflowCharacter` is primarily orchestration.
- Locomotion modifies pose buffers/bones, not render meshes directly.
- Jump/cape behavior remains intact.

---

## Phase 5 — Non-player humanoid reuse proof

**Status:** complete

### Work

- Instantiate a second humanoid through the same rig/profile infrastructure behind a development-only proof path.
- Drive it with scripted movement facts, not player input.
- Verify independent pose state, transitions, and disposal.
- Verify immutable rig definition can be shared safely.

### Acceptance gate

- Player and scripted NPC animate simultaneously.
- NPC has no dependency on `ThirdPersonController`/DOM input.
- No shared mutable pose state leaks between actors.
- Shared geometry/material ownership is disposal-safe.

---

## Phase 6 — Generic contact IK and humanoid foot grounding

**Status:** complete

### Work

- Add `TwoBoneIk`.
- Add profile-driven `ActorContactIk`.
- Add humanoid two-foot targets.
- Add pelvis compensation.
- Add foot normal alignment/smoothing.

### Acceptance gate

- Player feet ground correctly on representative slopes.
- Knees do not invert.
- IK disables appropriately while airborne.
- Contact system itself contains no humanoid bone-name assumptions.

---

## Phase 7 — Minimal quadruped proof

**Status:** complete

### Work

- Add minimal `QuadrupedRigDefinition`.
- Add simple procedural quadruped geometry.
- Add idle + walk locomotion provider.
- Define four gait effectors/contact phases.
- Reuse shared pose/blending runtime.
- Reuse generic two-bone/contact IK for proof limbs.
- Add conservative four-contact body-height stabilization.
- Optional simple tail spring if small.

### Acceptance gate

- Quadruped walks independently of humanoid code.
- Four paws plant/swing in profile-defined phases.
- Terrain IK works without pretending front limbs are arms/hands.
- Shared runtime requires no humanoid-only state.
- Player and quadruped can animate in the same scene.

This phase is the primary architecture validation gate. Do not continue extending the shared API if passing it requires species-specific hacks in `src/actor/`.

---

## Phase 8 — Targeted humanoid skinning and joint quality

**Status:** pending

### Work

- Identify visible rigid-joint defects after skeletal articulation.
- Add procedural weights only where needed.
- Improve shoulder/hip/elbow/knee transitions.
- Keep armor/accessories rigid.

### Acceptance gate

- Raised arms and deep leg bends do not expose unacceptable gaps.
- Skin weights validate.
- Compact/mobile player performance remains acceptable.

---

## Phase 9 — Crouch and crouch locomotion

**Status:** pending

### Work

- Add humanoid stance state.
- Add crouch blend amount.
- Add crouch idle/walk.
- Integrate contact IK.
- Add camera target-height transition.
- Add gameplay speed/collision integration.
- Add input only after development testing.

### Acceptance gate

- Player crouches while idle/moving.
- Feet remain grounded.
- Head/body clearly lower for cover gameplay.
- NPC humanoid could consume the same stance animation if later its gameplay profile enables crouch.

---

## Phase 10 — Roll/dodge

**Status:** pending

### Work

- Add character action coordinator if not already present.
- Add deterministic roll phases/root displacement profile.
- Add curled pose.
- Decouple camera from visual roll orientation.
- Add cape/skirt roll response.

### Acceptance gate

- Deterministic distance/duration.
- Works from idle/walk/run.
- Camera stays readable.
- Locomotion resumes without pose snap.
- Roll remains a humanoid/character module, not a mandatory actor-core state.

---

## Phase 11 — Upper-body layering, reach IK, look IK, sockets

**Status:** pending

### Work

- Add humanoid upper-body layer/masks.
- Add shared `ActorReachIk` on `TwoBoneIk`.
- Add humanoid clavicle participation.
- Add shared profile-driven look IK.
- Finalize player sockets.
- Add development-only target/socket visualization.

### Acceptance gate

- Walking legs remain intact under upper-body actions.
- Hands track moving targets without elbow flipping.
- Player and quadruped look systems can use different chains through same look interface.
- Debug visualization has zero production update cost when disabled.

---

## Phase 12 — Spell casting and hand articulation

**Status:** pending

### Work

- Add spell action phases.
- Add one-hand/two-hand casts.
- Add minimal finger bones/poses.
- Drive palm/spell sockets.
- Emit deterministic release event to separate effect system.

### Acceptance gate

- Casts read clearly from multiple views.
- Locomotion continues under compatible casts.
- Effects attach through sockets without mesh knowledge.
- Exactly one release event per cast.
- No spell concepts leak into shared animal runtime.

---

## Phase 13 — Secondary-motion generalization

**Status:** done (quadruped half)

The damped spring moved to `src/actor/math/ActorDampedSpring.ts` so both families
can use it; `src/character/CharacterSpring.ts` is now an alias and
`verify-character-motion.mjs` asserts against the real implementation.
`QuadrupedSecondaryMotion` owns the deer's tail and ears, composing offsets onto
the bind rotation so the tail's resting droop survives. The player's cloth work
(crouch/roll/cast tuning) remains pending with those phases.

### Work

- Move cape/hair/skirt behind generic secondary-module interface without rewriting their physics.
- Tune player secondary response for crouch/roll/cast.
- Add/retain simple quadruped tail module if useful.
- Ensure reset/teleport clears all module state.

### Acceptance gate

- Player cloth behavior remains stable.
- Quadruped does not depend on cape concepts.
- Secondary modules are optional and independently reset/disposed.

---

## Phase 14 — Animation LOD for NPCs/animals

**Status:** done

`src/actor/animation/ActorAnimationQuality.ts` holds the Full/Reduced/Minimal/
Culled policy with a hysteresis band and an accumulated delta; it contains no
distance or rate of its own, and `verify-architecture.mjs` asserts that.
`ActorAnimationRuntime.setQuality` gates the pre-IK stages, the IK stages and
secondary motion *before* the work, leaving the verified pipeline-order strings
intact. The player is never given a quality object and stays pinned to full.

Thresholds are validated `fauna*` keys in `public/config/world.yaml`;
`WorldConfigValidator` rejects a non-increasing ladder and
`verify-config-contracts.mjs` covers that rejection.

Lowering the pose rate is safe because the gait phase comes from
`input.distanceTravelled`, not from time: a pose generated at 6 Hz still lands at
the geometrically correct point in the stride.

**Not done:** the distant rigid/simplified LOD geometry swap suggested in §30.
Cost currently falls away through update rate, IK gating and culling only.

### Work

- Add `ActorAnimationQuality` policy.
- Keep player pinned to full quality.
- Add reduced/minimal/cull paths for non-player actors.
- Gate IK, look, socket updates, and secondary motion before expensive work.
- Add interpolation for reduced pose-update cadence if required visually.

### Acceptance gate

- Multiple proof actors scale cost predictably.
- Distant actors do not perform terrain IK or secondary work unnecessarily.
- Quality transitions do not visibly snap at reviewed distances.
- LOD thresholds/rates are validated configuration values.

---

## Phase 15 — Performance, verification, cleanup

**Status:** pending

### Work

- Profile player, one humanoid NPC, and representative actor groups on desktop/compact.
- Confirm no meaningful steady-state allocation in actor animation updates.
- Remove migration adapters/obsolete direct-pivot player pose code.
- Split oversized modules.
- Expand static verifiers.
- Update this plan status.
- Manual GitHub Pages regression test.

### Acceptance gate

- Full production build passes.
- Rig-definition verifier passes.
- Humanoid verifier passes.
- Quadruped proof verifier passes.
- Config/architecture/motion verifiers pass.
- Player quality is not reduced.
- Non-player animation cost is bounded by quality policy.
- No duplicate player-only animation framework remains.

# 35. Verification plan

## Shared rig-definition verification

Assert for every rig definition:

- Bone count is positive and bounded.
- Every index is unique/in range.
- Exactly one structural root exists.
- Parent indexes form an acyclic tree.
- Bind transforms are finite.
- Scale is finite/non-zero where allowed.
- Chains reference valid indexes.
- Chain segment lengths are positive.
- Sockets reference valid parent bones.
- Masks match bone count.
- Joint limits are finite/ordered.
- Required profile roles resolve exactly once.

## Pose runtime verification

Assert:

- Pose buffer size follows definition bone count.
- Blend/mask operations never access outside bounds.
- Quaternion outputs remain normalized within tolerance.
- Reset restores bind-compatible pose.
- Two actor instances do not share mutable pose buffers.

## Humanoid verification

Representative snapshots:

- Idle.
- Left/right walk plant.
- Run.
- Takeoff.
- Apex.
- Fall.
- Landing.
- Crouch idle/walk.
- Mid-roll.
- One-hand cast.
- Two-hand cast.

Invariants:

- Knees bend intended direction.
- Arms remain opposed in gait.
- Crouch lowers pelvis/head.
- Roll tucks body.
- Casting hand aims approximately toward target.
- Joint limits remain respected.

## NPC reuse verification

- Two humanoid instances update independently.
- Shared immutable definition is not mutated.
- Disposing NPC does not break player resources.
- Scripted NPC can idle/walk/turn without player controller.

## Quadruped verification

- Four limb chains resolve.
- Four contact effectors have valid profile phases.
- Walk produces alternating/supporting contacts as configured.
- Paw IK does not pin swing legs.
- Body stabilization stays bounded.
- Head/look chain works when enabled.
- Tail/secondary module reset is safe if present.

## Runtime visual matrix

Player checks:

- Front/rear/side.
- Flat/moderate slope/uneven feet.
- Idle/walk/run transitions.
- Jump and landing.
- Crouch transitions.
- Roll.
- Cast at high/low/side targets.
- Teleport/reset during and after actions.

NPC checks:

- Player + NPC simultaneously.
- NPC stop/start/turn.
- Independent animation phases.
- Dispose/recreate NPC.

Quadruped checks:

- Idle/walk.
- Front/rear/side views.
- Flat and uneven terrain.
- Turning.
- Four visible paw contacts.
- Player + humanoid NPC + quadruped simultaneously.

# 36. Performance contract

## Player

The player is a hero object. Preserve quality first while respecting:

- No per-frame allocations.
- Bounded terrain samples.
- Analytic two-bone IK.
- Minimal skinning.
- One deliberate world-matrix/socket update boundary.

## NPCs and animals

For non-player populations:

- Share immutable definitions/tuning.
- Share geometry/material assets when possible.
- Allocate pose state once per live actor.
- Use animation LOD before reducing visual quality of the player.
- Disable work by quality stage before executing it.
- Avoid generic map/string operations in hot paths.
- Update only sockets requested by active systems if profiling shows socket matrix cost matters.
- Do not run IK on culled/minimal actors.
- Do not run secondary motion when its quality level disables it.
- Keep AI update cadence independent from animation cadence.

Measure before adding GPU skinning instancing, worker animation, or large object pools.

# 37. Reset and failure behavior

Every actor animation runtime must reset cleanly after:

- Spawn/reset.
- Teleport.
- Deactivation/reactivation.
- Invalid external target.
- Interrupted action.
- Rig/profile replacement during development if supported.

Reset must:

- Clear transitions/blend history.
- Restore bind/idle-compatible pose.
- Reset IK filters.
- Clear stale world-space targets.
- Reset secondary modules.
- Update required socket transforms before effects resume.

Player-specific reset additionally clears roll/spell action state.

No shared solver may retain targets from a previously disposed/reused actor instance.

Initialization contract failures must fail clearly rather than continue with malformed rigs.

Examples:

- Invalid parent graph.
- Missing required profile role.
- Invalid chain.
- Invalid skin index/weights.
- Impossible joint limits.
- Mandatory socket missing for an enabled feature.

Production logging must not emit per-frame animation spam.

# 38. Architecture boundaries

## `src/actor`

Owns only reusable animation mechanics justified by multiple actor families:

- Rig definitions/instances.
- Pose buffers/blending.
- Generic animation runtime.
- Generic gait contact representation.
- Generic analytic IK primitives.
- Generic profile-driven contact/reach/look orchestration.
- Generic sockets/constraints/quality policy.

It must not know:

- Third-person input.
- Player camera.
- Spell gameplay rules.
- NPC behavior trees.
- Animal AI.
- Cape-specific geometry.
- Exact humanoid state names.

## `src/character`

Owns humanoid/player specifics:

- Snowflow geometry/appearance.
- Humanoid rig definition/profile.
- Player/humanoid locomotion pose math.
- Crouch/roll/spell/hand behavior.
- Cape/hair/skirt implementation.

Humanoid NPCs may reuse the humanoid profile without depending on player input or player camera.

## `src/creatures`

Owns species/family-specific behavior:

- Quadruped topology/profile.
- Quadruped procedural geometry.
- Quadruped gait math.
- Animal-specific secondary motion.

Future species are added beside quadruped rather than modifying the actor core unless they reveal a genuinely reusable missing primitive.

# 39. Definition of done

The overall rig project is complete when:

### Shared actor foundation

- [ ] Shared rig definition supports variable bone topology/count.
- [ ] Runtime uses stable resolved numeric indexes.
- [ ] Pose buffers/blending are rig-size-independent.
- [ ] Generic chain/contact/reach/look systems contain no humanoid bone-name assumptions.
- [ ] Shared runtime has no player input/AI dependency.
- [ ] Animation hot path produces no meaningful steady-state garbage.
- [ ] Animation LOD exists for non-player populations.

### Player humanoid

- [ ] Existing appearance preserved or deliberately improved.
- [ ] Real semantic humanoid bone hierarchy.
- [ ] Existing idle/walk/run/jump/land ported.
- [ ] Smooth locomotion transitions.
- [ ] Terrain foot IK + pelvis compensation.
- [ ] Targeted skinning fixes worst joint artifacts.
- [ ] Crouch/crouch walk.
- [ ] Deterministic dodge roll.
- [ ] Stable roll camera.
- [ ] Upper-body layering.
- [ ] Arm reach IK.
- [ ] Look IK.
- [ ] Stable hand/palm/chest/head/spell sockets.
- [ ] One/two-hand spell poses.
- [ ] Minimal hand poses.
- [ ] Cape/skirt/hair work with new actions.

### Humanoid NPC extensibility proof

- [ ] Scripted NPC uses same humanoid rig/profile without player controller.
- [ ] Player/NPC mutable animation state is independent.
- [ ] Shared resource disposal is safe.

### Animal extensibility proof

- [ ] Minimal quadruped uses a different rig definition.
- [ ] Quadruped uses same pose/blending runtime.
- [ ] Four contacts use generic gait/contact/IK infrastructure.
- [ ] No fake hand/arm/spell/crouch concepts required by actor core.
- [ ] Player, NPC, and quadruped animate together.

### Production quality

- [ ] Reset/teleport clears all solver/action state.
- [ ] Static rig/profile/animation verification passes.
- [ ] Full repository build passes.
- [ ] Desktop performance acceptable.
- [ ] Compact/mobile performance acceptable.
- [ ] Obsolete direct-pivot player pose implementation removed.
- [ ] This plan updated with final status.

# 40. Recommended commit sequence

Keep implementation commits reviewable and independently revertible.

1. `test(actor): establish player rig and motion baseline`
2. `refactor(actor): add reusable rig definition contracts`
3. `refactor(character): build humanoid skeleton on actor rig core`
4. `refactor(actor): add generic pose buffers masks and blending`
5. `refactor(character): port humanoid locomotion to actor runtime`
6. `test(actor): prove second humanoid instance independence`
7. `feat(actor): add analytic two-bone and contact IK`
8. `feat(character): ground humanoid feet with contact IK`
9. `test(creature): add minimal quadruped rig and walk proof`
10. `feat(character): improve targeted humanoid skinning`
11. `feat(character): add crouch stance and crouch locomotion`
12. `feat(character): add deterministic roll action`
13. `feat(actor): add reusable reach and look IK`
14. `feat(character): add upper-body layer and humanoid sockets`
15. `feat(character): add procedural spell-casting poses`
16. `feat(character): add minimal hand articulation`
17. `refactor(actor): generalize optional secondary-motion interface`
18. `polish(character): integrate cape skirt and hair with actions`
19. `feat(actor): add non-player animation quality levels`
20. `test(actor): expand humanoid npc and quadruped verification`
21. `refactor(character): remove migration pose path`
22. `perf(actor): profile and remove verified population hot-path waste`
23. `docs(actor): mark actor rig plan complete`

Do not combine all phases into a single commit.

# 41. Major checkpoints

## Checkpoint A — Shared foundation + current player

Stop after Phase 4 if needed.

Must have:

- Shared rig definition.
- Real humanoid skeleton.
- Generic pose buffers/masks/blending runtime.
- Existing player locomotion running through it.
- Existing cape/hair behavior intact.

No new player abilities required yet.

## Checkpoint B — Extensibility proven

Stop after Phase 7.

Must additionally have:

- Scripted non-player humanoid using same humanoid profile.
- Generic contact IK.
- Minimal quadruped using a different topology.
- Four-contact quadruped walk/terrain proof.

This checkpoint is mandatory before calling the architecture reusable.

## Checkpoint C — Player action system

Stop after Phase 12.

Must additionally have:

- Targeted skinning.
- Crouch.
- Roll.
- Upper-body layering.
- Reach/look IK.
- Sockets.
- Spell casting.
- Hand poses.

## Checkpoint D — Population-ready

Stop after Phase 15.

Must additionally have:

- Optional secondary-motion abstraction.
- NPC/animal animation LOD.
- Full performance/verification pass.
- Obsolete player pose path removed.

This sequencing keeps the player quality goal intact while proving early that the same architecture can animate NPCs and genuinely different animal bodies without creating a second system.