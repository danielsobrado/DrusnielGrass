import * as THREE from "three";
import { disposeResources } from "../../render/ResourceDisposal";

/**
 * Persistent grass crush map.
 *
 * The old interaction path was a single capsule uniform: grass bent away from
 * wherever the character stood *this frame* and sprang back the moment the
 * capsule slid past, so a trail could never be seen. This replaces it with a
 * small ping-ponged texture that scrolls with the character and holds what has
 * been walked on.
 *
 * Channels, all in [0,1]:
 *   R,G  crush direction, a unit XZ vector stored as `dir * 0.5 + 0.5`
 *   B    crush amount
 *   A    contact recency. Seeded with the crush amount of the contact rather
 *        than with 1, and re-seeded on every frame a contact still overlaps the
 *        texel, so it peaks while a foot is planted and decays once the foot
 *        lifts. The shader drives blade wobble from it.
 *
 * Neutral is (0.5, 0.5, 0, 0): zero direction, no crush. That is the clear
 * colour and also what a sample outside the covered square reads.
 */

/**
 * Two feet, the body, and the landing pulse. Both the uniform arrays and the
 * fragment loop are sized from this, so keep it at what the interaction field
 * can actually submit in one frame rather than at a round number.
 */
export const GRASS_TRAIL_MAX_CONTACTS = 4;

export interface GrassTrailConfig {
  /** Texels per axis. */
  resolution: number;
  /** World-space size of the covered square, in metres. */
  coverage: number;
  /** Crush decay per second. Lower leaves longer trails. */
  recoveryRate: number;
  /** Freshness decay per second. Governs how long blades keep ringing. */
  freshnessRate: number;
}

/**
 * The renderer-specific half of the update pass.
 *
 * The field owns the covered square, the contact list, the accumulation clock
 * and the ping-pong index; a backend owns only the targets and the draw. That
 * split is what lets the legacy WebGL pass and the portable node pass share one
 * set of uniform objects and one exactly-once update order.
 */
export interface GrassTrailBackend {
  /** True when the targets hold half float rather than bytes. */
  readonly precise: boolean;
  texture(index: number): THREE.Texture;
  render(readIndex: number, writeIndex: number): void;
  dispose(): void;
}

const DEFAULT_CONFIG: GrassTrailConfig = {
  resolution: 256,
  coverage: 24,
  recoveryRate: 0.5,
  freshnessRate: 1.4,
};

/**
 * Fraction of the recovery rate applied as a flat per-second subtraction, on top
 * of the exponential decay. See the decay comment in the update shader.
 *
 * On a half-float target this only needs to be large enough to retire crush
 * that has already faded past visibility. On the 8-bit fallback target it has to clear
 * a whole quantisation step often enough that the texel keeps moving, which is
 * far more aggressive and visibly shortens how long a trail lasts — the reason
 * half float is the preferred path rather than a nicety.
 */
const PRECISE_RECOVERY_FLOOR_RATIO = 0.04;
const QUANTIZED_RECOVERY_FLOOR_RATIO = 0.3;
/** The trail simulation does not need to run at the display refresh rate. */
const UPDATE_INTERVAL_SECONDS = 1 / 30;
const UPDATE_INTERVAL_EPSILON_SECONDS = 1e-6;
const MAX_FRAME_DELTA_SECONDS = 0.1;
const CONTACT_VALUE_COUNT = 8;

const UPDATE_VERTEX_SHADER = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// One pass does reprojection, decay and every contact. Stamping contacts as
// geometry would need a draw call each; evaluating them analytically costs an
// eight-iteration loop over a 256x256 target, which is nothing next to the
// grass field this feeds.
const UPDATE_FRAGMENT_SHADER = `
precision highp float;

#define MAX_CONTACTS ${GRASS_TRAIL_MAX_CONTACTS}

uniform sampler2D uPrevious;
uniform vec2 uCenter;
uniform vec2 uPreviousCenter;
uniform float uCoverage;
uniform float uInitialize;
uniform float uDelta;
uniform float uRecoveryRate;
uniform float uRecoveryFloor;
uniform float uFreshnessRate;
uniform int uContactCount;
// xy world position, z radius, w strength
uniform vec4 uContacts[MAX_CONTACTS];
// xy travel direction, z inner radius fraction, w directional blend
uniform vec4 uContactShapes[MAX_CONTACTS];

varying vec2 vUv;

void main() {
  vec2 world = uCenter + (vUv - 0.5) * uCoverage;

  // Reproject through the scroll delta. Texels that just entered the covered
  // square have no history and read neutral.
  vec2 previousUv = (world - uPreviousCenter) / uCoverage + 0.5;
  vec4 previous = vec4(0.5, 0.5, 0.0, 0.0);
  if (
    uInitialize < 0.5 &&
    previousUv.x >= 0.0 && previousUv.x <= 1.0 &&
    previousUv.y >= 0.0 && previousUv.y <= 1.0
  ) {
    previous = texture2D(uPrevious, previousUv);
  }

  vec2 direction = previous.rg * 2.0 - 1.0;
  // Exponential decay alone leaves faint crush hanging around forever, and on
  // the 8-bit fallback target it freezes outright: below roughly 0.24 the
  // per-frame decrement rounds to zero and the texel never recovers. The linear
  // floor term guarantees the field returns to neutral in bounded time.
  float crush = max(
    0.0,
    previous.b * exp(-uRecoveryRate * uDelta) - uRecoveryFloor * uDelta
  );
  float freshness = max(0.0, previous.a - uFreshnessRate * uDelta);

  float appliedCrush = 0.0;
  vec2 appliedDirection = vec2(0.0);
  for (int index = 0; index < MAX_CONTACTS; index += 1) {
    if (index >= uContactCount) {
      break;
    }
    vec4 contact = uContacts[index];
    vec4 shape = uContactShapes[index];
    vec2 offset = world - contact.xy;
    // Contacts occupy well under one percent of the trail square. Reject the
    // other texels before paying for sqrt and the smoothstep falloffs.
    float distanceSquared = dot(offset, offset);
    float radiusSquared = contact.z * contact.z;
    if (distanceSquared >= radiusSquared) {
      continue;
    }
    float distanceToContact = sqrt(distanceSquared);
    // A disc for footfalls (inner = 0); a ring for the expanding landing pulse.
    float inner = contact.z * shape.z;
    float ringMask = inner > 0.0
      ? smoothstep(inner * 0.4, inner, distanceToContact)
      : 1.0;
    float falloff =
      ringMask *
      (1.0 - smoothstep(max(inner, contact.z * 0.25), contact.z, distanceToContact));
    float amount = falloff * contact.w;
    if (amount <= 0.0) {
      continue;
    }
    vec2 away = distanceToContact > 1e-4
      ? offset / distanceToContact
      : shape.xy;
    vec2 push = mix(away, shape.xy, shape.w);
    float pushLength = length(push);
    push = pushLength > 1e-4 ? push / pushLength : away;
    appliedDirection += push * amount;
    appliedCrush = max(appliedCrush, amount);
  }

  if (appliedCrush > 0.0) {
    float appliedLength = length(appliedDirection);
    vec2 newDirection = appliedLength > 1e-4
      ? appliedDirection / appliedLength
      : direction;
    // A stronger contact overrides the stored lay of the grass; a weaker one
    // only nudges it, so a light brush does not undo a deep footprint.
    float authority = appliedCrush / max(crush, appliedCrush);
    direction = mix(direction, newDirection, clamp(authority, 0.0, 1.0));
    float directionLength = length(direction);
    direction = directionLength > 1e-4 ? direction / directionLength : newDirection;
    crush = max(crush, appliedCrush);
    freshness = max(freshness, appliedCrush);
  }

  gl_FragColor = vec4(direction * 0.5 + 0.5, clamp(crush, 0.0, 1.0), clamp(freshness, 0.0, 1.0));
}
`;

/** One table, written by the field and read by whichever pass is attached. */
function createGrassTrailUniforms(): Record<string, THREE.IUniform> {
  return {
    uPrevious: { value: null as THREE.Texture | null },
    uCenter: { value: new THREE.Vector2() },
    uPreviousCenter: { value: new THREE.Vector2() },
    uCoverage: { value: DEFAULT_CONFIG.coverage },
    uInitialize: { value: 0 },
    uDelta: { value: 0 },
    uRecoveryRate: { value: DEFAULT_CONFIG.recoveryRate },
    uRecoveryFloor: {
      value: DEFAULT_CONFIG.recoveryRate * PRECISE_RECOVERY_FLOOR_RATIO,
    },
    uFreshnessRate: { value: DEFAULT_CONFIG.freshnessRate },
    uContactCount: { value: 0 },
    uContacts: {
      value: Array.from(
        { length: GRASS_TRAIL_MAX_CONTACTS },
        () => new THREE.Vector4(),
      ),
    },
    uContactShapes: {
      value: Array.from(
        { length: GRASS_TRAIL_MAX_CONTACTS },
        () => new THREE.Vector4(0, 1, 0, 0),
      ),
    },
  };
}

class GrassTrailField {
  private config: GrassTrailConfig = { ...DEFAULT_CONFIG };
  private inverseCoverage = 1 / DEFAULT_CONFIG.coverage;
  private renderer?: THREE.WebGLRenderer;
  private targets?: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  private readTarget = 0;
  private recoveryFloorRatio = PRECISE_RECOVERY_FLOOR_RATIO;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly center = new THREE.Vector2();
  private readonly previousCenter = new THREE.Vector2();
  private readonly focus = new THREE.Vector2();
  // Fixed storage avoids allocating and collecting two feet plus a body contact
  // on every animation frame. Each row contains the two vec4 uniforms.
  private readonly contacts = new Float32Array(
    GRASS_TRAIL_MAX_CONTACTS * CONTACT_VALUE_COUNT,
  );
  private contactCount = 0;
  private accumulatedDeltaSeconds = 0;
  private material?: THREE.ShaderMaterial;
  private quad?: THREE.Mesh;
  /** Shared with an attached node pass; see GrassTrailBackend. */
  private readonly updateUniforms = createGrassTrailUniforms();
  private backend?: GrassTrailBackend;
  private backendFactory?: (
    uniforms: Record<string, THREE.IUniform>,
    size: number,
  ) => GrassTrailBackend;
  private hasFocus = false;
  private enabled = false;

  configure(config: Partial<GrassTrailConfig>): void {
    const next = { ...this.config, ...config };
    validateConfig(next);
    this.config = next;
    this.inverseCoverage = 1 / this.config.coverage;
    if (this.backendFactory) {
      this.attachNodePass(this.backendFactory);
    } else if (this.renderer) {
      const renderer = this.renderer;
      this.releaseTargets();
      this.attach(renderer);
    }
  }

  attach(renderer: THREE.WebGLRenderer): void {
    if (this.targets && this.renderer === renderer && !this.backend) {
      return;
    }
    // Symmetric with attachNodePass: whichever pass is attached is released
    // first. Guarding on targets alone left an attached node pass live while a
    // second, unused WebGL pass was built over it.
    if (this.targets || this.backend) {
      this.releaseTargets();
    }
    this.backendFactory = undefined;
    this.renderer = renderer;
    const pendingTargets: THREE.WebGLRenderTarget[] = [];
    let pendingGeometry: THREE.PlaneGeometry | undefined;
    try {
      const size = this.targetSize();
      const type = resolveTargetType(renderer);
      this.recoveryFloorRatio =
        type === THREE.HalfFloatType
          ? PRECISE_RECOVERY_FLOOR_RATIO
          : QUANTIZED_RECOVERY_FLOOR_RATIO;
      const firstTarget = createTarget(size, type);
      pendingTargets.push(firstTarget);
      const secondTarget = createTarget(size, type);
      pendingTargets.push(secondTarget);
      this.targets = [firstTarget, secondTarget];
      pendingTargets.length = 0;

      this.updateUniforms.uPrevious.value = this.targets[0].texture;
      this.updateUniforms.uCoverage.value = this.config.coverage;
      this.updateUniforms.uRecoveryRate.value = this.config.recoveryRate;
      this.updateUniforms.uRecoveryFloor.value =
        this.config.recoveryRate * this.recoveryFloorRatio;
      this.updateUniforms.uFreshnessRate.value = this.config.freshnessRate;
      this.material = new THREE.ShaderMaterial({
        vertexShader: UPDATE_VERTEX_SHADER,
        fragmentShader: UPDATE_FRAGMENT_SHADER,
        depthTest: false,
        depthWrite: false,
        uniforms: this.updateUniforms,
      });
      pendingGeometry = new THREE.PlaneGeometry(2, 2);
      this.quad = new THREE.Mesh(pendingGeometry, this.material);
      pendingGeometry = undefined;
      this.quad.frustumCulled = false;
      this.scene.add(this.quad);
      this.enabled = true;
      this.resetScroll();
      this.primeTargets();
    } catch (error) {
      try {
        disposeResources(pendingTargets);
      } catch (cleanupError) {
        console.warn(
          "[Drusniel World] Pending grass trail target cleanup failed.",
          cleanupError,
        );
      }
      if (pendingGeometry) {
        try {
          pendingGeometry.dispose();
        } catch (cleanupError) {
          console.warn(
            "[Drusniel World] Pending grass trail geometry cleanup failed.",
            cleanupError,
          );
        }
      }
      try {
        this.releaseTargets();
      } catch (cleanupError) {
        console.warn(
          "[Drusniel World] Grass trail attach cleanup failed.",
          cleanupError,
        );
      }
      this.renderer = undefined;
      throw error;
    }
  }

  /**
   * Attaches the portable pass instead of the legacy WebGL one.
   *
   * The factory receives this field's own uniform table, so the node pass reads
   * the same objects `render` writes rather than a second copy of the state.
   */
  attachNodePass(
    factory: (
      uniforms: Record<string, THREE.IUniform>,
      size: number,
    ) => GrassTrailBackend,
  ): void {
    this.releaseTargets();
    this.renderer = undefined;
    this.backendFactory = factory;
    try {
      const backend = factory(this.updateUniforms, this.targetSize());
      this.backend = backend;
      this.recoveryFloorRatio = backend.precise
        ? PRECISE_RECOVERY_FLOOR_RATIO
        : QUANTIZED_RECOVERY_FLOOR_RATIO;
      this.updateUniforms.uCoverage.value = this.config.coverage;
      this.enabled = true;
      this.resetScroll();
      this.primeTargets();
    } catch (error) {
      this.backendFactory = undefined;
      try { this.releaseTargets(); } catch (cleanupError) { console.warn("Trail node attachment cleanup failed.", cleanupError); }
      throw error;
    }
  }

  /** Called once per frame by whoever drives the character. */
  setFocus(x: number, z: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      return;
    }
    this.focus.set(x, z);
    this.hasFocus = true;
  }

  submitContact(
    x: number,
    z: number,
    radius: number,
    strength: number,
    directionX: number,
    directionZ: number,
    innerRadiusFraction: number,
    directionalBlend: number,
  ): void {
    if (
      !areFinite(
        x,
        z,
        radius,
        strength,
        directionX,
        directionZ,
        innerRadiusFraction,
        directionalBlend,
      ) ||
      strength <= 0 ||
      radius <= 0 ||
      this.contactCount >= GRASS_TRAIL_MAX_CONTACTS
    ) {
      return;
    }
    const offset = this.contactCount * CONTACT_VALUE_COUNT;
    this.contacts[offset] = x;
    this.contacts[offset + 1] = z;
    this.contacts[offset + 2] = radius;
    this.contacts[offset + 3] = strength;
    this.contacts[offset + 4] = directionX;
    this.contacts[offset + 5] = directionZ;
    this.contacts[offset + 6] = innerRadiusFraction;
    this.contacts[offset + 7] = directionalBlend;
    this.contactCount += 1;
  }

  /**
   * Runs the update pass. Contacts submitted since the previous call are
   * consumed here; the field keeps decaying whether or not any arrive, which is
   * what lets a trail recover after the character has walked away.
   */
  render(deltaSeconds: number): void {
    const renderer = this.renderer;
    const targets = this.targets;
    const material = this.material;
    const backend = this.backend;
    if (!this.enabled || !this.hasFocus) {
      this.resetPendingFrame();
      return;
    }
    if (!backend && (!renderer || !targets || !material)) {
      this.resetPendingFrame();
      return;
    }
    if (renderer && renderer.getContext().isContextLost()) {
      this.resetPendingFrame();
      return;
    }
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      this.resetPendingFrame();
      return;
    }

    this.accumulatedDeltaSeconds = Math.min(
      MAX_FRAME_DELTA_SECONDS,
      this.accumulatedDeltaSeconds +
        Math.min(deltaSeconds, MAX_FRAME_DELTA_SECONDS),
    );
    if (
      this.accumulatedDeltaSeconds + UPDATE_INTERVAL_EPSILON_SECONDS <
      UPDATE_INTERVAL_SECONDS
    ) {
      return;
    }

    const delta = this.accumulatedDeltaSeconds;
    const texelSize = this.config.coverage / this.targetSize();
    const nextCenterX = Math.round(this.focus.x / texelSize) * texelSize;
    const nextCenterZ = Math.round(this.focus.y / texelSize) * texelSize;

    const uniforms = this.updateUniforms;
    uniforms.uPrevious.value = this.readTexture();
    (uniforms.uCenter.value as THREE.Vector2).set(nextCenterX, nextCenterZ);
    (uniforms.uPreviousCenter.value as THREE.Vector2).copy(this.center);
    uniforms.uCoverage.value = this.config.coverage;
    uniforms.uDelta.value = delta;
    uniforms.uRecoveryRate.value = this.config.recoveryRate;
    uniforms.uRecoveryFloor.value =
      this.config.recoveryRate * this.recoveryFloorRatio;
    uniforms.uFreshnessRate.value = this.config.freshnessRate;
    uniforms.uContactCount.value = this.contactCount;

    const contactValues = uniforms.uContacts.value as THREE.Vector4[];
    const shapeValues = uniforms.uContactShapes.value as THREE.Vector4[];
    for (let index = 0; index < this.contactCount; index += 1) {
      const offset = index * CONTACT_VALUE_COUNT;
      contactValues[index].set(
        this.contacts[offset],
        this.contacts[offset + 1],
        this.contacts[offset + 2],
        this.contacts[offset + 3],
      );
      shapeValues[index].set(
        this.contacts[offset + 4],
        this.contacts[offset + 5],
        THREE.MathUtils.clamp(this.contacts[offset + 6], 0, 0.95),
        THREE.MathUtils.clamp(this.contacts[offset + 7], 0, 1),
      );
    }

    const writeTarget = 1 - this.readTarget;
    try {
      if (backend) {
        // The node pass restores renderer state itself; see RenderNodePass.
        backend.render(this.readTarget, writeTarget);
      } else if (renderer && targets) {
        const previousRenderTarget = renderer.getRenderTarget();
        let renderError: unknown;
        try {
          renderer.setRenderTarget(targets[writeTarget]);
          renderer.render(this.scene, this.camera);
        } catch (error) {
          renderError = error;
        }
        try {
          renderer.setRenderTarget(previousRenderTarget);
        } catch (restoreError) {
          if (renderError) {
            console.warn(
              "[Drusniel World] Grass trail renderer restoration also failed.",
              restoreError,
            );
            throw renderError;
          }
          throw restoreError;
        }
        if (renderError) {
          throw renderError;
        }
      } else {
        return;
      }
    } catch (error) {
      // Trail crushing is optional. Keep the last successfully published texture
      // and its centre alive for materials that already reference it, but stop
      // updating the effect so one pass cannot retire the entire grass phase.
      this.enabled = false;
      this.resetPendingFrame();
      console.warn(
        "[Drusniel World] Grass trail rendering unavailable; continuing without trail updates.",
        error,
      );
      return;
    }

    this.previousCenter.copy(this.center);
    this.center.set(nextCenterX, nextCenterZ);
    this.readTarget = writeTarget;
    this.contactCount = 0;
    this.accumulatedDeltaSeconds = 0;
  }

  isEnabled(): boolean {
    return (
      this.enabled &&
      this.hasFocus &&
      (this.targets !== undefined || this.backend !== undefined)
    );
  }

  /**
   * True when the attached pass holds half float rather than bytes.
   *
   * The recovery floor is derived from it, so the two passes must agree about
   * precision before their outputs can be compared at all.
   */
  isPrecise(): boolean {
    if (!this.targets && !this.backend) {
      return false;
    }
    return this.recoveryFloorRatio === PRECISE_RECOVERY_FLOOR_RATIO;
  }

  /** Null until a pass has built the targets; see {@link isEnabled}. */
  getTexture(): THREE.Texture | null {
    return this.readTexture();
  }

  private readTexture(): THREE.Texture | null {
    if (this.backend) {
      return this.backend.texture(this.readTarget);
    }
    return this.targets?.[this.readTarget].texture ?? null;
  }

  getCenter(): THREE.Vector2 {
    return this.center;
  }

  /**
   * Reciprocal of the covered width, which is what maps world space into the
   * trail square. Precomputed because every interactive material reads it once
   * a frame while coverage only changes on {@link configure}.
   */
  getInverseCoverage(): number {
    return this.inverseCoverage;
  }

  dispose(): void {
    this.renderer = undefined;
    this.backendFactory = undefined;
    this.enabled = false;
    this.hasFocus = false;
    this.resetPendingFrame();
    this.releaseTargets();
  }

  /**
   * Drops the scroll history when the targets are rebuilt.
   *
   * Priming leaves both targets neutral, so a centre describing the previous
   * contents no longer describes anything. Sampling neutral is harmless either
   * way; keeping the stale centre would just make an attached pass's first
   * reprojection depend on where the character stood before the rebuild.
   */
  private resetScroll(): void {
    this.center.set(0, 0);
    this.previousCenter.set(0, 0);
    this.hasFocus = false;
  }

  private targetSize(): number {
    return Math.max(32, Math.round(this.config.resolution));
  }

  private resetPendingFrame(): void {
    this.contactCount = 0;
    this.accumulatedDeltaSeconds = 0;
  }

  private releaseTargets(): void {
    const quad = this.quad;
    const material = this.material;
    const targets = this.targets;
    const backend = this.backend;
    this.quad = undefined;
    this.material = undefined;
    this.targets = undefined;
    this.backend = undefined;
    this.readTarget = 0;
    this.enabled = false;
    disposeResources([
      { dispose: () => quad?.removeFromParent() },
      quad?.geometry,
      material,
      ...(targets ?? []),
      backend,
    ]);
  }

  /**
   * Writes the neutral value into both targets through the update shader
   * itself. Clearing them instead would route the clear colour through the
   * renderer's colour management, which must not touch data channels.
   */
  private primeTargets(): void {
    const renderer = this.renderer;
    const targets = this.targets;
    const material = this.material;
    const backend = this.backend;
    const uniforms = this.updateUniforms;
    if (!backend && (!renderer || !targets || !material)) {
      return;
    }
    uniforms.uInitialize.value = 1;
    uniforms.uContactCount.value = 0;
    uniforms.uDelta.value = 0;
    if (backend) {
      try {
        // Each target is written while the other is bound for reading. With
        // initialization on the previous sample is never used, but binding a
        // target as both source and attachment is invalid on WebGPU.
        backend.render(1, 0);
        backend.render(0, 1);
      } finally {
        uniforms.uInitialize.value = 0;
      }
      return;
    }
    if (!renderer || !targets) {
      return;
    }
    const previousRenderTarget = renderer.getRenderTarget();
    try {
      for (const [index, target] of targets.entries()) {
        // Bind the *other* target as the source. Initialization never reads the
        // sample, but a texture attached to the framebuffer while also bound to
        // a sampler is a feedback loop: WebGL drops the draw outright, which
        // used to leave the first target cleared to zero instead of neutral, so
        // every texel started with a crush direction of (-1, -1).
        uniforms.uPrevious.value = targets[1 - index].texture;
        renderer.setRenderTarget(target);
        renderer.render(this.scene, this.camera);
      }
    } finally {
      renderer.setRenderTarget(previousRenderTarget);
      uniforms.uPrevious.value = targets[0].texture;
      uniforms.uInitialize.value = 0;
    }
  }
}

function validateConfig(config: GrassTrailConfig): void {
  if (!Number.isInteger(config.resolution) || config.resolution < 32) {
    throw new Error("Grass trail resolution must be an integer of at least 32.");
  }
  for (const [label, value] of [
    ["coverage", config.coverage],
    ["recoveryRate", config.recoveryRate],
    ["freshnessRate", config.freshnessRate],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Grass trail ${label} must be a positive finite number.`);
    }
  }
}

function areFinite(...values: number[]): boolean {
  return values.every(Number.isFinite);
}

/**
 * Half float where it is renderable, bytes otherwise. The decay is a feedback
 * loop over the previous frame's texture, and eight bits per channel is coarse
 * enough that a slow decay rounds to no change at all; the linear floor in the
 * update shader is what keeps the byte path recovering.
 */
function resolveTargetType(renderer: THREE.WebGLRenderer): THREE.TextureDataType {
  const extensions = renderer.extensions;
  return extensions.has("EXT_color_buffer_half_float") ||
    extensions.has("EXT_color_buffer_float")
    ? THREE.HalfFloatType
    : THREE.UnsignedByteType;
}

function createTarget(
  size: number,
  type: THREE.TextureDataType,
): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(size, size, {
    format: THREE.RGBAFormat,
    type,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  });
  target.texture.colorSpace = THREE.NoColorSpace;
  return target;
}

export const grassTrailField = new GrassTrailField();