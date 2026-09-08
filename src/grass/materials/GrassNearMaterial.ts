import type { GUI } from "dat.gui";
import * as THREE from "three";
import { GrassNearNodeMaterial } from "./GrassNearNodeMaterial";
import type { WorldNodeMaterialContext } from "../../render/WorldNodeMaterialContext";
import type {
  GrassLodConfig,
  GrassMaterialConfig,
  GrassWindConfig,
} from "../GrassConfig";
import type { GrassArtDirection } from "../GrassArtDirection";
import {
  GRASS_GUST_TIP_BOOST,
  GRASS_MID_DENSITY_FALLOFF,
} from "../GrassLodTuning";
import { grassGroundShadow } from "../interaction/GrassGroundShadow";
import { grassTrailField } from "../interaction/GrassTrailField";
import {
  GRASS_GUST_FRONT_SCALE,
  GRASS_GUST_FRONT_SPEED,
  GRASS_WIND_NOISE_SCALE,
  GRASS_WIND_NOISE_SPEED,
} from "../wind/WindNoiseTexture";
import {
  setBalancedGrassPaletteColors,
  setGrassCanopyColors,
} from "./GrassPaletteShader";
import {
  GRASS_BIOME_PROFILES,
  GRASS_MAX_BIOMES,
} from "../biome/GrassBiomeProfile";

const DEFAULT_TRAIL_MAX_ANGLE = 1.29;
const DEFAULT_TRAIL_WOBBLE_FREQUENCY = 12;
const DEFAULT_TRAIL_WOBBLE_AMPLITUDE = 0.16;

/** How far the normal tilts towards each edge of the blade's trough. */
const DEFAULT_BLADE_CURVATURE = 0.55;
const DEFAULT_SHEEN_STRENGTH = 0.035;
const DEFAULT_SHEEN_POWER = 42;
const DEFAULT_SHEEN_FADE_DISTANCE = 18;

/** How far a lull drops the bend. The envelope only ever scales it down. */
const DEFAULT_GUST_FRONT_DEPTH = 0.55;
/**
 * World size of one device pixel per metre of camera distance,
 * `2 * tan(fov / 2) / drawingBufferHeight`. Replaced on the first resize; the
 * default matches a 60-degree vertical field of view at 1080 device pixels.
 */
const DEFAULT_PIXEL_WORLD_SCALE = 0.00107;
const MINIMUM_BLADE_PIXEL_WIDTH = 1.15;
/**
 * Ceiling on the widened half-width. The single-blade bounds reserve a safety
 * margin an order larger than a blade's own half-width, and this stays inside
 * it so a widened blade cannot leave the bound its tile is culled against.
 */
/**
 * Ceiling on the widened half-width, as a multiple of the source blade's own
 * half-width and as an absolute backstop.
 *
 * This used to be a bare 0.02 m. Nothing tied it to the configured blade width,
 * so when the blades were widened to 0.026/0.058 the source half-width (0.021)
 * rose *above* the ceiling and `max(source, min(target, ceiling))` collapsed to
 * `source`: the sub-pixel clamp silently stopped doing anything at all, taking
 * both the anti-sparkle widening and the mid layer's density-falloff coverage
 * payback with it. Deriving it from the half-width keeps the two in step.
 *
 * The absolute backstop is what the reserved bounds depend on: the widening
 * grows a blade's half-extent by at most `ABSOLUTE - halfWidth < ABSOLUTE`,
 * which stays inside `BOUNDS_SAFETY_MARGIN` (0.08) for any blade configuration.
 */
const MAXIMUM_BLADE_WIDEN_RATIO = 3;
const MAXIMUM_BLADE_WIDEN_METRES = 0.06;

/**
 * Distance band over which the mid layer thins its blades, for materials that
 * are never handed a configured one. Kept in step with the shipped schedule.
 */
const DEFAULT_DENSITY_FALLOFF_START = GRASS_MID_DENSITY_FALLOFF.start;
const DEFAULT_DENSITY_FALLOFF_END = GRASS_MID_DENSITY_FALLOFF.end;

/**
 * Per-material constants. These used to be written per mesh from
 * `onBeforeRender`, but three only uploads a material's custom uniforms on the
 * first draw of each contiguous same-material run (see `refreshMaterial` in
 * WebGLRenderer), and its opaque sort groups by `material.id` before depth. The
 * result was that every mesh sharing a material silently inherited the first
 * one's values. Anything that genuinely varies per mesh now lives in the
 * per-instance buffers instead; anything constant for a layer lives here.
 */
export interface GrassNearMaterialOptions {
  name: string;
  /** Lighting and cloud-shadow field the node blade is built against. */
  context?: WorldNodeMaterialContext;
  /** Distinct per option set, otherwise three reuses a cached program. */
  cacheKey: string;
  /** Mid layers keep the blades the near layer drops. */
  invertLodCoverage?: boolean;
  windLodScale?: number;
  /** 0 = no detail split, 1 = outside the detail radius, 2 = inside it. */
  detailMode?: number;
  /** Decorrelates the LOD dither between layers. */
  ditherSeed?: number;
  /**
   * Resolve LOD coverage per blade from its world-space camera distance
   * (default). The island regression scene instead drives one scene-wide
   * threshold, because its camera frames the whole object at a distance well
   * past the configured near and mid fades.
   */
  worldLod?: boolean;
  /**
   * Resolve the grass palette per vertex instead of per fragment. Only safe for
   * layers whose blades are a single triangle: with three vertices the colour
   * interpolates across a handful of pixels, but a segmented blade filling the
   * screen would visibly band.
   */
  vertexPalette?: boolean;
  /**
   * Sample the character's grass trail and bend blades into it. Only layers the
   * character can physically reach need this; for everything else the sampling
   * and the bend are compiled out entirely rather than branched over at
   * runtime, which is what the mid layer used to pay for on every blade.
   */
  interactive?: boolean;
  /**
   * Widen blades that project to less than a pixel, and pay the coverage back
   * in colour. Only the layer that owns the band where blades go sub-pixel
   * needs it; nearer layers never trigger the clamp and would pay for the test,
   * and the mid patches past it are already a different representation.
   */
  subPixelWidth?: boolean;
  /** Compile the close-range waxy highlight; distant mid grass disables it. */
  sheen?: boolean;
  /**
   * Drop `instanceVariation.x` from the LOD dither so the whole key is known at
   * geometry-build time. Only the mid layer needs it, and only because its
   * per-batch draw truncation has to reproduce the shader's keep set exactly on
   * the CPU. Per-blade shade and phase already decorrelate neighbours; the
   * instance term only decorrelated whole patches, which the material's own
   * dither seed does anyway.
   */
  instanceFreeDither?: boolean;
  /**
   * Give every instance its own silhouette from `instanceShape`.
   *
   * Compile-time so only the world's near layers pay for it: the mid and far
   * populations draw a few pixels each and the island regression scene has one
   * source clump, so both keep the plain source blade.
   */
  shapeVariation?: boolean;
  /**
   * Sample the shared scrolling wind-noise field instead of the sine gust
   * front. Costs one vertex texture fetch; compact profiles compile the sine.
   */
  noiseWind?: boolean;
  /**
   * Compile per-blade tip flutter. Mid and compact layers omit it: flutter is
   * only readable inside a few metres, and compact pays the same meadow with
   * less micro-motion rather than a different wind.
   */
  microWind?: boolean;
}

function createBiomeColorRows(color: THREE.ColorRepresentation): THREE.Color[] {
  return Array.from(
    { length: GRASS_MAX_BIOMES },
    () => new THREE.Color(color),
  );
}

function createBiomeShadeRows(
  rootDarkening: number,
  tipColorStrength: number,
): THREE.Vector2[] {
  return Array.from(
    { length: GRASS_MAX_BIOMES },
    () => new THREE.Vector2(rootDarkening, tipColorStrength),
  );
}

export class GrassNearMaterial {
  /**
   * The portable blade the world draws.
   *
   * Built from this object's own uniform table and compile-time feature set, so
   * one owner drives art direction, LOD and wind for it.
   */
  readonly material: GrassNearNodeMaterial;

  /** The options this was built from, for the comparison's GLSL reference. */
  readonly options: GrassNearMaterialOptions;

  private readonly colorControls = {
    baseColor: "#273f22",
    tipColor: "#83a96b",
    dryColor: "#a8a06a",
  };

  private nearNormalUpScale = 1;
  private readonly uniforms = {
    uGrassTime: { value: 0 },
    /** Tip drift, in source root half-widths. See setShapeTipDrift. */
    uGrassShapeTipDrift: { value: 0 },
    uGrassWindDirection: { value: new THREE.Vector2(0.8, 0.35).normalize() },
    uGrassWindStrength: { value: 0.14 },
    uGrassGustScale: { value: 0.08 },
    uGrassGustSpeed: { value: 0.65 },
    uGrassFlutterStrength: { value: 0.035 },
    uGrassFlutterSpeed: { value: 3.4 },
    // Row 0 mirrors the active art direction; rows 1..n come from the biome
    // profiles. Every shader indexes these with the per-instance biome row, so
    // adding a biome costs one uniform row and zero draw calls.
    uGrassBiomeBase: {
      value: createBiomeColorRows(this.colorControls.baseColor),
    },
    uGrassBiomeTip: {
      value: createBiomeColorRows(this.colorControls.tipColor),
    },
    uGrassBiomeDry: {
      value: createBiomeColorRows(this.colorControls.dryColor),
    },
    uGrassBiomeShade: { value: createBiomeShadeRows(0.55, 0.5) },
    uGrassBiomeCanopyHealthy: {
      value: createBiomeColorRows(this.colorControls.baseColor),
    },
    uGrassBiomeCanopyDry: {
      value: createBiomeColorRows(this.colorControls.dryColor),
    },
    // Backlight tint only. The transmission term is a fraction of a fraction,
    // so it reads the art direction's tip colour rather than spending three
    // more varyings to carry a per-biome one into the fragment stage.
    uGrassTipColor: { value: new THREE.Color(this.colorControls.tipColor) },
    /**
     * (near, far) flattening of the blade normal toward world up.
     *
     * The far entry is the authored preset value and must equal the impostor
     * material's own flattening; the near entry is that scaled down, so a
     * preset still carries one number and the schedule between them is a
     * config lever rather than a second art decision.
     */
    uGrassNormalUpRange: { value: new THREE.Vector2(0.45, 0.45) },
    uGrassAmbientBoost: { value: 0.12 },
    uGrassBacklightStrength: { value: 0.16 },
    uGrassLodInvert: { value: 0 },
    uGrassLodThreshold: { value: 1 },
    uGrassDistanceFade: { value: 1 },
    uGrassDitherSeed: { value: 0 },
    uGrassWindLodScale: { value: 1 },
    uGrassMicroFadeRange: { value: new THREE.Vector2(3, 10) },
    uGrassNearDistance: { value: 0 },
    uGrassMidDistance: { value: 0 },
    uGrassTransitionDistance: { value: 1 },
    uGrassDetailMode: { value: 0 },
    uGrassDetailNearDistance: { value: 0 },
    uGrassDetailTransitionDistance: { value: 1 },
    uGrassArtDensityScale: { value: 1 },
    uGrassBladeCurvature: { value: DEFAULT_BLADE_CURVATURE },
    uGrassSheenStrength: { value: DEFAULT_SHEEN_STRENGTH },
    uGrassSheenPower: { value: DEFAULT_SHEEN_POWER },
    uGrassSheenFadeDistance: { value: DEFAULT_SHEEN_FADE_DISTANCE },
    uGrassGustFrontScale: { value: GRASS_GUST_FRONT_SCALE },
    uGrassGustFrontSpeed: { value: GRASS_GUST_FRONT_SPEED },
    uGrassGustFrontDepth: { value: DEFAULT_GUST_FRONT_DEPTH },
    uGrassGustTipBoost: { value: GRASS_GUST_TIP_BOOST },
    uGrassWindNoise: { value: null as THREE.Texture | null },
    uGrassWindNoiseScale: { value: GRASS_WIND_NOISE_SCALE },
    uGrassWindNoiseSpeed: { value: GRASS_WIND_NOISE_SPEED },
    uGrassDensityFalloffStart: { value: DEFAULT_DENSITY_FALLOFF_START },
    uGrassDensityFalloffEnd: { value: DEFAULT_DENSITY_FALLOFF_END },
    // 1 disables the falloff entirely; only the mid material lowers it.
    uGrassDensityFloor: { value: 1 },
    uGrassLodDensityScale: { value: 1 },
    uGrassPixelWorldScale: { value: DEFAULT_PIXEL_WORLD_SCALE },
    uGrassMinPixelWidth: { value: MINIMUM_BLADE_PIXEL_WIDTH },
    uGrassBladeHalfWidth: { value: 0.017 },
    uGrassMaxWidenDistance: { value: MAXIMUM_BLADE_WIDEN_METRES },
    uGrassTrailMap: { value: null as THREE.Texture | null },
    uGrassTrailCenter: { value: new THREE.Vector2() },
    uGrassTrailInverseCoverage: { value: 1 },
    uGrassTrailStrength: { value: 0 },
    uGrassTrailMaxAngle: { value: DEFAULT_TRAIL_MAX_ANGLE },
    uGrassTrailWobbleFrequency: { value: DEFAULT_TRAIL_WOBBLE_FREQUENCY },
    uGrassTrailWobbleAmplitude: { value: DEFAULT_TRAIL_WOBBLE_AMPLITUDE },
    uGrassGroundShadowDisc: { value: new THREE.Vector4(0, 0, 0, 1) },
    uGrassGroundShadowStrength: { value: 0 },
  };
  private readonly interactive: boolean;
  /**
   * The uniform table, for the node material built over the same state.
   *
   * The renderer migration keeps one owner for grass configuration: the node
   * material reads these very objects rather than a second copy, so a preset,
   * an art direction or a quality change cannot reach one implementation and
   * not the other while both are alive.
   */
  get shaderUniforms(): Record<string, THREE.IUniform> {
    return this.uniforms;
  }
  /** Node materials over this table refresh their samplers from here. */
  readonly uniformObservers = new Set<() => void>();
  private baseWindStrength = 0.14;
  private baseFlutterStrength = 0.035;
  /** Biome row 0's shade controls; every art preset writes them. */
  private artRootDarkening = 0.55;
  private artTipColorStrength = 0.5;

  constructor(options: GrassNearMaterialOptions) {
    this.interactive = options.interactive === true;
    this.uniforms.uGrassLodInvert.value = options.invertLodCoverage ? 1 : 0;
    this.uniforms.uGrassWindLodScale.value = options.windLodScale ?? 1;
    this.uniforms.uGrassDetailMode.value = options.detailMode ?? 0;
    this.uniforms.uGrassDitherSeed.value =
      (options.ditherSeed ?? 0) / 4294967296;
    this.setPaletteColors();
    const vertexPalette = options.vertexPalette === true;
    const worldLod = options.worldLod !== false;
    const subPixelWidth = options.subPixelWidth === true;
    const sheen = options.sheen !== false;
    const noiseWind = options.noiseWind === true;
    const microWind = options.microWind !== false;
    const instanceFreeDither = options.instanceFreeDither === true;
    const shapeVariation = options.shapeVariation === true;
    this.options = options;
    this.material = new GrassNearNodeMaterial(options.name, this.uniforms, {
      worldLod, vertexPalette, interactive: this.interactive, subPixelWidth, sheen,
      noiseWind, microWind, instanceFreeDither, shapeVariation,
    }, options.context);
    // The same compile-time selection the chunks above make, in the form the
    // node material consumes. Resolved here so the defaults have exactly one
    // owner rather than being restated per implementation.
    this.nodeFeatures = {
      worldLod,
      vertexPalette,
      interactive: this.interactive,
      subPixelWidth,
      sheen,
      noiseWind,
      microWind,
      instanceFreeDither,
      shapeVariation,
    };
  }

  /** Compile-time feature selection shared with the node material. */
  readonly nodeFeatures: {
    worldLod: boolean;
    vertexPalette: boolean;
    interactive: boolean;
    subPixelWidth: boolean;
    sheen: boolean;
    noiseWind: boolean;
    microWind: boolean;
    instanceFreeDither: boolean;
    shapeVariation: boolean;
  };

  configure(material: GrassMaterialConfig, wind: GrassWindConfig): void {
    this.colorControls.baseColor = material.baseColor;
    this.colorControls.tipColor = material.tipColor;
    this.colorControls.dryColor = material.dryColor;
    this.artRootDarkening = material.rootDarkening;
    this.setPaletteColors();
    this.setNormalUp(material.normalUp);
    this.uniforms.uGrassAmbientBoost.value = material.ambientBoost;
    this.uniforms.uGrassBacklightStrength.value = material.backlightStrength;
    this.uniforms.uGrassWindDirection.value
      .set(wind.directionX, wind.directionZ)
      .normalize();
    this.baseWindStrength = wind.strength;
    this.baseFlutterStrength = wind.flutterStrength;
    this.uniforms.uGrassWindStrength.value = wind.strength;
    this.uniforms.uGrassGustScale.value = wind.gustScale;
    this.uniforms.uGrassGustSpeed.value = wind.gustSpeed;
    this.uniforms.uGrassFlutterStrength.value = wind.flutterStrength;
    this.uniforms.uGrassFlutterSpeed.value = wind.flutterSpeed;
  }

  applyArtDirection(direction: GrassArtDirection): void {
    this.colorControls.baseColor = direction.baseColor;
    this.colorControls.tipColor = direction.tipColor;
    this.colorControls.dryColor = direction.dryColor;
    this.artRootDarkening = direction.rootDarkening;
    this.artTipColorStrength = direction.tipColorStrength;
    this.setPaletteColors();
    this.setNormalUp(direction.normalUp);
    this.uniforms.uGrassAmbientBoost.value = direction.ambientBoost;
    this.uniforms.uGrassBacklightStrength.value = direction.backlightStrength;
    this.uniforms.uGrassArtDensityScale.value = direction.densityScale;
    this.uniforms.uGrassWindStrength.value =
      this.baseWindStrength * direction.windStrengthScale;
    this.uniforms.uGrassFlutterStrength.value =
      this.baseFlutterStrength * direction.flutterStrengthScale;
    this.configureGust(
      direction.gustDepth ?? DEFAULT_GUST_FRONT_DEPTH,
      direction.gustTipBoost ?? GRASS_GUST_TIP_BOOST,
    );
    // The specular lobe is gone before the near band hands over to the mid
    // patches, which do not carry one. Tying the fade to the preset's own near
    // distance keeps that true for every preset.
    this.uniforms.uGrassSheenFadeDistance.value = direction.nearDistance;
  }

  /**
   * World size of one device pixel per metre of camera distance. Only the
   * sub-pixel width clamp reads it, and only for the layer compiled with it.
   */
  setViewportPixelScale(pixelWorldScale: number): void {
    if (Number.isFinite(pixelWorldScale) && pixelWorldScale > 0) {
      this.uniforms.uGrassPixelWorldScale.value = pixelWorldScale;
    }
  }

  /** Half-width of the source blade the sub-pixel clamp is widening. */
  setBladeHalfWidth(halfWidth: number): void {
    const resolved = Math.max(halfWidth, 0.0001);
    this.uniforms.uGrassBladeHalfWidth.value = resolved;
    // The ceiling has to move with the blade, or a wider blade configuration
    // pushes the source half-width past it and disables the clamp entirely.
    this.uniforms.uGrassMaxWidenDistance.value = Math.min(
      resolved * MAXIMUM_BLADE_WIDEN_RATIO,
      MAXIMUM_BLADE_WIDEN_METRES,
    );
  }

  /**
   * The `uGrassDitherSeed` value the vertex shader adds when deriving a blade's
   * LOD dither. Callers that want to predict the shader's keep decision on the
   * CPU need it.
   */
  getDitherSeed(): number {
    return this.uniforms.uGrassDitherSeed.value;
  }

  /**
   * Sets both ends of the flattening schedule from one authored value.
   *
   * A preset carries a single `normalUp`, which is the *far* end: the value a
   * card at range needs to stay stable. The near end is that scaled by
   * `grassNearNormalUpScale`, so blades close to the camera keep enough of
   * their real normal to be lit by facing rather than only by colour.
   */
  private setNormalUp(farNormalUp: number): void {
    const range = this.uniforms.uGrassNormalUpRange.value as THREE.Vector2;
    range.y = farNormalUp;
    range.x = farNormalUp * this.nearNormalUpScale;
  }

  /** Configured by the world; 1 restores the old single-value behaviour. */
  /**
   * How far a blade's apex may fall sideways, in source root half-widths.
   *
   * Set from configuration on every near layer at once — the layers share
   * placement data, so a blade drawn by two of them has to be the same shape in
   * both or it doubles rather than blends.
   */
  setShapeTipDrift(drift: number): void {
    this.uniforms.uGrassShapeTipDrift.value = Math.max(0, drift);
  }

  setNearNormalUpScale(scale: number): void {
    this.nearNormalUpScale = Number.isFinite(scale)
      ? Math.min(1, Math.max(0, scale))
      : 1;
    this.setNormalUp(
      (this.uniforms.uGrassNormalUpRange.value as THREE.Vector2).y,
    );
  }

  /** Threshold-LOD materials only; ignored when coverage is resolved per blade. */
  setLodThreshold(threshold: number, distanceFade = 1): void {
    this.uniforms.uGrassLodThreshold.value = threshold;
    this.uniforms.uGrassDistanceFade.value = distanceFade;
  }

  /**
   * The world-space range over which a blade stops being shaded as an individual
   * leaf. Every near and mid material must be given the same two numbers: this is
   * what keeps a blade's brightness a function of where it is rather than of
   * which layer drew it. `verify-lod-continuity` re-checks that.
   */
  setMicroDetailFadeRange(start: number, end: number): void {
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
      throw new Error(
        "The grass micro-detail fade range must be a finite increasing interval.",
      );
    }
    (this.uniforms.uGrassMicroFadeRange.value as THREE.Vector2).set(start, end);
  }

  configureLod(config: GrassLodConfig): void {
    this.uniforms.uGrassNearDistance.value = config.nearMaxDistance;
    this.uniforms.uGrassMidDistance.value = config.midMaxDistance;
    this.uniforms.uGrassTransitionDistance.value = config.transitionDistance;
  }

  configureDetailLod(config: GrassLodConfig): void {
    this.uniforms.uGrassDetailNearDistance.value = config.nearMaxDistance;
    this.uniforms.uGrassDetailTransitionDistance.value =
      config.transitionDistance;
  }

  update(elapsedSeconds: number): void {
    this.uniforms.uGrassTime.value = elapsedSeconds;
    if (!this.interactive) {
      this.notifyUniformObservers();
      return;
    }
    if (grassGroundShadow.isEnabled()) {
      (this.uniforms.uGrassGroundShadowDisc.value as THREE.Vector4).copy(
        grassGroundShadow.disc,
      );
      this.uniforms.uGrassGroundShadowStrength.value =
        grassGroundShadow.strength;
    } else {
      this.uniforms.uGrassGroundShadowStrength.value = 0;
    }
    if (!grassTrailField.isEnabled()) {
      this.uniforms.uGrassTrailStrength.value = 0;
      this.notifyUniformObservers();
      return;
    }
    this.uniforms.uGrassTrailMap.value = grassTrailField.getTexture();
    this.uniforms.uGrassTrailCenter.value.copy(grassTrailField.getCenter());
    this.uniforms.uGrassTrailInverseCoverage.value =
      grassTrailField.getInverseCoverage();
    this.uniforms.uGrassTrailStrength.value = 1;
    this.notifyUniformObservers();
  }

  /**
   * Runs after the frame's uniforms are written, never before.
   *
   * A node material's samplers follow `uGrassTrailMap`, and the trail field
   * ping-pongs that texture every frame, so an observer that ran first would
   * bind the previous frame's target.
   */
  private notifyUniformObservers(): void {
    this.material.syncUniformTextures();
    for (const observe of this.uniformObservers) {
      observe();
    }
  }

  /** Bend shape for the character trail; supplied from the world config. */
  configureTrail(config: {
    maxAngleRadians: number;
    wobbleFrequency: number;
    wobbleAmplitude: number;
  }): void {
    this.uniforms.uGrassTrailMaxAngle.value = config.maxAngleRadians;
    this.uniforms.uGrassTrailWobbleFrequency.value = config.wobbleFrequency;
    this.uniforms.uGrassTrailWobbleAmplitude.value = config.wobbleAmplitude;
  }

  /**
   * Fills every biome palette row.
   *
   * Row 0 is always the active art direction, so a world running one biome is
   * byte-identical to one built before biomes existed and preset switching
   * keeps working. Rows whose profile owns a palette get their own colours put
   * through the same luminance balancer, which is what keeps brightness
   * compatible across biomes the way it already is across presets.
   */
  private setPaletteColors(): void {
    const base = this.uniforms.uGrassBiomeBase.value;
    const tip = this.uniforms.uGrassBiomeTip.value;
    const dry = this.uniforms.uGrassBiomeDry.value;
    const shade = this.uniforms.uGrassBiomeShade.value;
    const canopyHealthy = this.uniforms.uGrassBiomeCanopyHealthy.value;
    const canopyDry = this.uniforms.uGrassBiomeCanopyDry.value;
    setBalancedGrassPaletteColors(
      base[0],
      tip[0],
      dry[0],
      this.colorControls.baseColor,
      this.colorControls.tipColor,
      this.colorControls.dryColor,
    );
    shade[0].set(this.artRootDarkening, this.artTipColorStrength);
    this.uniforms.uGrassTipColor.value.copy(tip[0]);
    setGrassCanopyColors(
      canopyHealthy[0],
      canopyDry[0],
      this.colorControls.baseColor,
      this.colorControls.tipColor,
      this.colorControls.dryColor,
      this.artRootDarkening,
      this.artTipColorStrength,
    );

    for (let row = 1; row < GRASS_MAX_BIOMES; row += 1) {
      const profile = GRASS_BIOME_PROFILES[row];
      if (!profile || profile.paletteSource === "art") {
        base[row].copy(base[0]);
        tip[row].copy(tip[0]);
        dry[row].copy(dry[0]);
        shade[row].copy(shade[0]);
        canopyHealthy[row].copy(canopyHealthy[0]);
        canopyDry[row].copy(canopyDry[0]);
        continue;
      }
      setBalancedGrassPaletteColors(
        base[row],
        tip[row],
        dry[row],
        profile.baseColor,
        profile.tipColor,
        profile.dryColor,
      );
      shade[row].set(profile.rootDarkening, profile.tipColorStrength);
      setGrassCanopyColors(
        canopyHealthy[row],
        canopyDry[row],
        profile.baseColor,
        profile.tipColor,
        profile.dryColor,
        profile.rootDarkening,
        profile.tipColorStrength,
      );
    }
  }

  /**
   * The scrolling gust field. Every grass material and every impostor material
   * is given the same texture, scale, and speed; that shared field is what makes
   * near blades, mid blades, and far cards bend as one wind instead of three.
   */
  setWindNoise(texture: THREE.Texture, scale: number, speed: number): void {
    this.uniforms.uGrassWindNoise.value = texture;
    this.uniforms.uGrassWindNoiseScale.value = scale;
    this.uniforms.uGrassWindNoiseSpeed.value = speed;
  }

  /**
   * Distance thinning for the mid layer: `floor` is the fraction of blades
   * still drawn at `end` metres. The CPU draw truncation reproduces this exact
   * curve, so both must be changed through here.
   */
  configureDensityFalloff(start: number, end: number, floor: number): void {
    this.uniforms.uGrassDensityFalloffStart.value = start;
    this.uniforms.uGrassDensityFalloffEnd.value = end;
    this.uniforms.uGrassDensityFloor.value = floor;
  }

  getDensityFalloff(): { start: number; end: number; floor: number } {
    return {
      start: this.uniforms.uGrassDensityFalloffStart.value,
      end: this.uniforms.uGrassDensityFalloffEnd.value,
      floor: this.uniforms.uGrassDensityFloor.value,
    };
  }

  /**
   * Global density multiplier owned by the quality governor. It scales the LOD
   * keep threshold — the same key the instance buffers are sorted by — so the
   * CPU prefix trims can fold it in exactly and a lowered tier saves submitted
   * vertices, not just shaded ones.
   */
  setLodDensityScale(scale: number): void {
    this.uniforms.uGrassLodDensityScale.value = THREE.MathUtils.clamp(
      scale,
      0.05,
      1,
    );
  }

  getLodDensityScale(): number {
    return this.uniforms.uGrassLodDensityScale.value;
  }

  /** Gust depth and the tip lift a crest carries, both preset-exposed. */
  configureGust(depth: number, tipBoost: number): void {
    this.uniforms.uGrassGustFrontDepth.value = depth;
    this.uniforms.uGrassGustTipBoost.value = tipBoost;
  }

  setSheenEnabled(enabled: boolean): void {
    this.uniforms.uGrassSheenStrength.value = enabled
      ? DEFAULT_SHEEN_STRENGTH
      : 0;
  }

  setupGUI(
    gui: GUI,
    linkedMaterials: readonly GrassNearMaterial[] = [],
  ): void {
    const materials = [this, ...linkedMaterials];
    const folder = gui.addFolder("Grass Props");
    folder.addColor(this.colorControls, "baseColor").onChange((value: string) => {
      for (const material of materials) {
        material.colorControls.baseColor = value;
        material.setPaletteColors();
      }
    });
    folder.addColor(this.colorControls, "tipColor").onChange((value: string) => {
      for (const material of materials) {
        material.colorControls.tipColor = value;
        material.setPaletteColors();
      }
    });
    folder.addColor(this.colorControls, "dryColor").onChange((value: string) => {
      for (const material of materials) {
        material.colorControls.dryColor = value;
        material.setPaletteColors();
      }
    });
    const tipMixControl = { value: this.artTipColorStrength };
    folder
      .add(tipMixControl, "value", 0.15, 0.75, 0.01)
      .name("Tip Mix")
      .onChange((value: number) => {
        for (const material of materials) {
          material.artTipColorStrength = value;
          material.setPaletteColors();
        }
      });
    folder
      .add(this.uniforms.uGrassWindStrength, "value", 0, 0.45, 0.005)
      .name("Wind Strength")
      .onChange((value: number) => {
        for (const material of linkedMaterials) {
          material.uniforms.uGrassWindStrength.value = value;
        }
      });
    folder
      .add(this.uniforms.uGrassFlutterStrength, "value", 0, 0.15, 0.0025)
      .name("Tip Flutter")
      .onChange((value: number) => {
        for (const material of linkedMaterials) {
          material.uniforms.uGrassFlutterStrength.value = value;
        }
      });
    folder
      .add(
        this.uniforms.uGrassNormalUpRange.value as THREE.Vector2,
        "y",
        0,
        0.9,
        0.01,
      )
      .name("Normal Up (far)")
      .onChange((value: number) => {
        for (const material of linkedMaterials) {
          const range = material.uniforms.uGrassNormalUpRange
            .value as THREE.Vector2;
          range.y = value;
          range.x = value * this.nearNormalUpScale;
        }
      });
    folder
      .add(this.uniforms.uGrassAmbientBoost, "value", 0, 0.4, 0.01)
      .name("Ambient Boost")
      .onChange((value: number) => {
        for (const material of linkedMaterials) {
          material.uniforms.uGrassAmbientBoost.value = value;
        }
      });
    folder
      .add(this.uniforms.uGrassBacklightStrength, "value", 0, 0.5, 0.01)
      .name("Backlight")
      .onChange((value: number) => {
        for (const material of linkedMaterials) {
          material.uniforms.uGrassBacklightStrength.value = value;
        }
      });
    folder
      .add(this.uniforms.uGrassBladeCurvature, "value", 0, 1.2, 0.01)
      .name("Blade Curve")
      .onChange((value: number) => {
        for (const material of linkedMaterials) {
          material.uniforms.uGrassBladeCurvature.value = value;
        }
      });
    folder
      .add(this.uniforms.uGrassSheenStrength, "value", 0, 0.3, 0.005)
      .name("Sheen")
      .onChange((value: number) => {
        for (const material of linkedMaterials) {
          material.uniforms.uGrassSheenStrength.value = value;
        }
      });
    folder
      .add(this.uniforms.uGrassSheenPower, "value", 8, 96, 1)
      .name("Sheen Focus")
      .onChange((value: number) => {
        for (const material of linkedMaterials) {
          material.uniforms.uGrassSheenPower.value = value;
        }
      });
    folder
      .add(this.uniforms.uGrassGustFrontDepth, "value", 0, 0.9, 0.01)
      .name("Gust Fronts")
      .onChange((value: number) => {
        for (const material of linkedMaterials) {
          material.uniforms.uGrassGustFrontDepth.value = value;
        }
      });
    folder
      .add(this.uniforms.uGrassGustFrontSpeed, "value", 0, 1.6, 0.01)
      .name("Gust Speed")
      .onChange((value: number) => {
        for (const material of linkedMaterials) {
          material.uniforms.uGrassGustFrontSpeed.value = value;
        }
      });
    folder.open();
  }
}
