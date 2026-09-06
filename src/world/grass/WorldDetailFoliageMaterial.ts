import * as THREE from "three";
import type { GrassArtDirection } from "../../grass/GrassArtDirection";
import {
  GRASS_LATTICE_NOISE_GLSL,
  GRASS_LOD_BAND_GLSL,
} from "../../grass/GrassLodBanding";
import {
  GRASS_ACCENT_SPECIES,
  GRASS_ACCENT_TINTS,
  GRASS_MAX_ACCENT_SPECIES,
  GRASS_MAX_ACCENT_TINTS,
} from "../../grass/biome/GrassAccentSpecies";
import {
  GRASS_BIOME_PROFILES,
  GRASS_MAX_BIOMES,
} from "../../grass/biome/GrassBiomeProfile";
import type {
  GrassMaterialConfig,
  GrassWindConfig,
} from "../../grass/GrassConfig";
import {
  GRASS_LIGHT_MIX_GLSL,
  GRASS_PALETTE_GLSL,
  setBalancedGrassPaletteColors,
} from "../../grass/materials/GrassPaletteShader";
import {
  GRASS_GUST_FRONT_SCALE,
  GRASS_GUST_FRONT_SPEED,
  GRASS_WIND_NOISE_SCALE,
  GRASS_WIND_NOISE_SPEED,
  grassCompactGustGlsl,
  grassWeatherEnvelopeGlsl,
} from "../../grass/wind/WindNoiseTexture";
import type { WorldDetailFoliageAtlas } from "./WorldDetailFoliageAtlasFactory";

/**
 * One material for the whole accent layer: every species, every tint, and every
 * biome resolve from per-instance data against bounded uniform arrays, so the
 * layer's look can grow without ever growing its draw count. That is the same
 * property the biome palette rows have, and it is the reason the 80.lv
 * channel-packing idea belongs here at all.
 *
 * Two deliberate differences from the blade layers:
 *
 * - This is the only grass material that may `discard`, and only for the atlas
 *   alpha cutout. Cutout cards cannot avoid it, and the instance count here is
 *   three orders of magnitude below the near field, so the early-Z property the
 *   blade materials are gated on is untouched.
 * - Wind is a per-species scalar times a height ramp rather than a texel mask.
 *   A mask cannot act in the vertex stage on a six-vertex card; the gust noise
 *   field is shared with every other layer, so accents bend with the same wind.
 */

/** Alpha below this is cut. Loosened with distance, as the impostors do. */
const DETAIL_FOLIAGE_ALPHA_CUTOFF = 0.42;
/** How high the wind ramp bites: 0 at the root, 1 at the card top. */
const DETAIL_FOLIAGE_WIND_RAMP_POWER = 1.5;
/** Groundcover rises slightly instead of standing as a camera-facing wall. */
const DETAIL_FOLIAGE_GROUNDCOVER_UP_COMPONENT = 0.36;
const DETAIL_FOLIAGE_GROUNDCOVER_FORWARD_COMPONENT = Math.sqrt(
  1 - DETAIL_FOLIAGE_GROUNDCOVER_UP_COMPONENT ** 2,
);
// Raised from 0.13. The understory leaves now carry real margins, midribs and
// folds; at the old strength the edge term was too weak for any of that to
// register, which would have meant paying for silhouette detail and not seeing
// it.
const DETAIL_FOLIAGE_UNDERSTORY_EDGE_DARKENING = 0.2;
const DETAIL_FOLIAGE_UNDERSTORY_EDGE_RANGE = 0.25;
const DETAIL_FOLIAGE_UNDERSTORY_DETAIL_FADE_START = 8;
const DETAIL_FOLIAGE_UNDERSTORY_DETAIL_FADE_END = 24;
const DETAIL_FOLIAGE_GROUNDCOVER_MASK_GLSL = createCategoryMaskGlsl([
  "groundcover",
]);
const DETAIL_FOLIAGE_UNDERSTORY_MASK_GLSL = createCategoryMaskGlsl([
  "groundcover",
  "shrub",
  "broadleaf",
]);
/**
 * Card sway as a fraction of card height per unit of configured wind strength.
 * The placement bounds charge for this exact product, so the two must move
 * together — {@link WorldDetailFoliageField} imports it rather than repeating a
 * literal, the same discipline the impostor shear factor is under.
 */
export const DETAIL_FOLIAGE_WIND_SHEAR_FACTOR = 0.4;

function createCategoryMaskGlsl(categories: readonly string[]): string {
  const terms = GRASS_ACCENT_SPECIES.filter((species) =>
    categories.includes(species.category),
  ).map(
    (species) =>
      `step(abs(speciesIndex - ${species.index.toFixed(1)}), 0.25)`,
  );
  return terms.length === 0 ? "0.0" : `clamp(${terms.join(" + ")}, 0.0, 1.0)`;
}

const VERTEX_SHADER = `
#include <common>
#include <lights_pars_begin>
${GRASS_LATTICE_NOISE_GLSL}
${GRASS_LOD_BAND_GLSL}
attribute vec4 instanceVariation;
attribute float instanceCoverage;
attribute float instanceBiome;
attribute float instanceAccent;
uniform float uTime;
uniform vec2 uWindDirection;
uniform float uWindStrength;
uniform sampler2D uWindNoise;
uniform float uWindNoiseScale;
uniform float uWindNoiseSpeed;
uniform float uFadeDistance;
uniform float uFadeTransition;
uniform float uFadeStagger;
uniform float uLodBandJitterRatio;
uniform float uDensityScale;
uniform float uNormalUp;
uniform float uSpeciesWind[${GRASS_MAX_ACCENT_SPECIES}];
varying vec2 vUv;
flat varying vec2 vCell;
flat varying float vTint;
flat varying float vBiome;
flat varying float vPhenotype;
flat varying float vGroundcover;
flat varying float vUnderstory;
varying float vDryness;
varying float vRootAo;
varying float vCameraDistance;
varying float vDistanceFade;
varying vec3 vGrassIrradiance;
varying float vGrassBackLight;
#include <fog_pars_vertex>

void main() {
  mat4 instanceModel = modelMatrix * instanceMatrix;
  vec3 axisX = instanceModel[0].xyz;
  vec3 axisY = instanceModel[1].xyz;
  vec3 axisZ = instanceModel[2].xyz;
  float scaleX = max(length(axisX), 0.0001);
  float scaleY = max(length(axisY), 0.0001);
  float scaleZ = max(length(axisZ), 0.0001);
  vec3 cardUp = axisY / scaleY;
  vec3 instanceRight = axisX / scaleX;
  vec3 instanceForward = axisZ / scaleZ;
  vec3 root = (instanceModel * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 center = root + cardUp * scaleY * 0.5;
  float cameraDistance = distance(cameraPosition, center);

  // Density remains a stable per-instance dither. Distance is deliberately
  // not folded into this threshold: doing so made whole flowers blink on and
  // off as the camera moved. The fragment stage fades their alpha instead.
  float coverage = min(instanceCoverage * uDensityScale, 1.0);

  // Decoded ahead of the fade rather than after it, because the fade is now a
  // function of which species this card is.
  // Stride 32, not 16: four phenotype rows need two bits where the old packing
  // left one. Kept in step with packGrassAccent by verify-understory-morphology.
  float accent = instanceAccent;
  float speciesIndex = floor(accent / 32.0);
  float packedRemainder = accent - speciesIndex * 32.0;
  float variantRow = floor(packedRemainder / 8.0);
  vTint = packedRemainder - variantRow * 8.0;
  vCell = vec2(speciesIndex, variantRow);

  // Every species used to leave at the same distance, which removed the whole
  // understory across one ring -- a line across the mid ground however well
  // each individual card cut was dithered, and close enough to the near-to-mid
  // handoff to read as part of the same band. Staggering the departures turns
  // that line into a community thinning out, and the world-space wander stops
  // what is left from tracing a circle centred on the viewer. Departures stay
  // inside the authored inward stagger envelope: the CPU hard cutoff owns the
  // shared outer edge, while the lower clamp keeps this fade from colliding with
  // the preceding near-density transition when the wander field is negative.
  float speciesFadeOffset =
    (fract(speciesIndex * 0.61803398875) - 0.5) * uFadeStagger;
  float wanderedFoliageFadeDistance = uFadeDistance + speciesFadeOffset +
    grassLodBandJitterMetres(
      uFadeDistance - uFadeTransition,
      uFadeDistance + uFadeTransition,
      uLodBandJitterRatio
    ) * grassLodBandOffset(root.xz);
  float foliageFadeDistance = clamp(
    wanderedFoliageFadeDistance,
    uFadeDistance - uFadeStagger * 0.5,
    uFadeDistance
  );
  vDistanceFade = 1.0 - smoothstep(
    foliageFadeDistance - uFadeTransition,
    foliageFadeDistance + uFadeTransition,
    cameraDistance
  );
  if (instanceVariation.x > coverage) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  // Reuse the stable density dither as a cheap phenotype seed. It never changes
  // at runtime and costs no fifth instance attribute.
  vPhenotype = fract(
    instanceVariation.x * 7.317 + speciesIndex * 0.173 + variantRow * 0.347
  );
  float groundcover = ${DETAIL_FOLIAGE_GROUNDCOVER_MASK_GLSL};
  vGroundcover = groundcover;
  vUnderstory = ${DETAIL_FOLIAGE_UNDERSTORY_MASK_GLSL};

  // Upright species remain yaw-only billboards so flowers and ferns cannot
  // disappear edge-on. Groundcover is different: making every low card face
  // the camera maximises overlap and turns clover/litter colonies into opaque
  // green slabs. Keep their deterministic instance yaw and splay them along the
  // terrain instead, with only enough rise to preserve leaf-layer parallax.
  vec3 toCamera = cameraPosition - root;
  vec3 flatToCamera = vec3(toCamera.x, 0.0, toCamera.z);
  float flatLength = length(flatToCamera);
  vec3 cardForward = flatLength < 0.001
    ? vec3(0.0, 0.0, 1.0)
    : flatToCamera / flatLength;
  vec3 cardRight = normalize(cross(vec3(0.0, 1.0, 0.0), cardForward));
  vec3 groundcoverAxis = normalize(
    instanceForward * ${DETAIL_FOLIAGE_GROUNDCOVER_FORWARD_COMPONENT.toFixed(4)} +
    cardUp * ${DETAIL_FOLIAGE_GROUNDCOVER_UP_COMPONENT.toFixed(4)}
  );

  vec2 windDirection = uWindDirection;
  #ifdef GRASS_NOISE_WIND
    vec2 gustUv = root.xz * uWindNoiseScale -
      windDirection * (uTime * uWindNoiseSpeed);
    float gustNoise = texture2D(uWindNoise, gustUv).r;
  #else
    ${grassCompactGustGlsl({
      target: "gustNoise",
      position: "root.xz",
      windDirection: "windDirection",
      time: "uTime",
      scale: GRASS_GUST_FRONT_SCALE.toFixed(3),
      speed: GRASS_GUST_FRONT_SPEED.toFixed(2),
    })}
  #endif

  vec3 uprightPosition = root +
    cardRight * position.x * scaleX +
    cardUp * position.y * scaleY;
  vec3 groundcoverPosition = root +
    instanceRight * position.x * scaleX +
    groundcoverAxis * position.y * scaleY;
  vec3 worldPosition = mix(uprightPosition, groundcoverPosition, groundcover);
  int speciesRow = int(clamp(
    speciesIndex,
    0.0,
    float(${GRASS_MAX_ACCENT_SPECIES} - 1)
  ) + 0.5);
  float windRamp = pow(uv.y, ${DETAIL_FOLIAGE_WIND_RAMP_POWER.toFixed(2)});
  float weather = ${grassWeatherEnvelopeGlsl("uTime")};
  float sway = (gustNoise * 2.0 - 1.0) * uWindStrength *
    ${DETAIL_FOLIAGE_WIND_SHEAR_FACTOR.toFixed(2)} *
    uSpeciesWind[speciesRow] * instanceVariation.y * weather;
  worldPosition += vec3(windDirection.x, 0.0, windDirection.y) *
    sway * windRamp * scaleY * mix(1.0, 0.3, groundcover);

  vec4 mvPosition = viewMatrix * vec4(worldPosition, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  // Same lighting shape as the impostor cards. Groundcover uses the terrain
  // normal rather than the camera-facing billboard normal so a colony does not
  // change brightness merely because the player turns around it.
  vec3 surfaceNormal = normalize(mix(cardForward, cardUp, groundcover));
  vec3 accentWorldNormal = normalize(mix(surfaceNormal, cardUp, uNormalUp));
  vec3 accentViewNormal = normalize(mat3(viewMatrix) * accentWorldNormal);
  vec3 irradiance = ambientLightColor;
  #if NUM_HEMI_LIGHTS > 0
    #pragma unroll_loop_start
    for (int i = 0; i < NUM_HEMI_LIGHTS; i++) {
      irradiance += getHemisphereLightIrradiance(
        hemisphereLights[i],
        accentViewNormal
      );
    }
    #pragma unroll_loop_end
  #endif
  #if NUM_DIR_LIGHTS > 0
    #pragma unroll_loop_start
    for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
      irradiance +=
        saturate(dot(accentViewNormal, directionalLights[i].direction)) *
        directionalLights[i].color;
    }
    #pragma unroll_loop_end
    vGrassBackLight = pow(
      saturate(dot(normalize(mvPosition.xyz), directionalLights[0].direction)),
      2.0
    );
  #else
    vGrassBackLight = 0.0;
  #endif
  vGrassIrradiance = irradiance;

  vUv = uv;
  vBiome = instanceBiome;
  vRootAo = instanceVariation.z;
  vDryness = instanceVariation.w;
  vCameraDistance = cameraDistance;
  #include <fog_vertex>
}
`;

const FRAGMENT_SHADER = `
uniform sampler2D uAtlas;
uniform vec2 uAtlasSize;
uniform float uCellResolution;
uniform float uCellPadding;
uniform float uAlphaCutoff;
uniform float uFadeDistance;
uniform float uAmbientBoost;
uniform float uBacklightStrength;
uniform vec3 uBiomeBase[${GRASS_MAX_BIOMES}];
uniform vec3 uBiomeTip[${GRASS_MAX_BIOMES}];
uniform vec3 uBiomeDry[${GRASS_MAX_BIOMES}];
uniform vec2 uBiomeShade[${GRASS_MAX_BIOMES}];
uniform vec3 uAccentTint[${GRASS_MAX_ACCENT_TINTS}];
varying vec2 vUv;
flat varying vec2 vCell;
flat varying float vTint;
flat varying float vBiome;
flat varying float vPhenotype;
flat varying float vGroundcover;
flat varying float vUnderstory;
varying float vDryness;
varying float vRootAo;
varying float vCameraDistance;
varying float vDistanceFade;
varying vec3 vGrassIrradiance;
varying float vGrassBackLight;
#include <common>
#include <fog_pars_fragment>
${GRASS_PALETTE_GLSL}

void main() {
  float cellSize = uCellResolution + uCellPadding * 2.0;
  vec2 safeUv = clamp(
    vUv,
    vec2(0.5 / uCellResolution),
    vec2(1.0 - 0.5 / uCellResolution)
  );
  vec2 pixel = vCell * cellSize + vec2(uCellPadding) + safeUv * uCellResolution;
  vec4 atlasColor = texture2D(uAtlas, pixel / uAtlasSize);
  // Minification erodes thin alpha, so the cutout loosens with distance for the
  // same reason the impostor cards' does: a fern must not dissolve before the
  // dither fade has taken it.
  float cutoff = uAlphaCutoff * mix(
    1.0,
    0.55,
    smoothstep(uFadeDistance * 0.4, uFadeDistance, vCameraDistance)
  );
  // The only discard in any grass material, and only for the cutout.
  if (atlasColor.a < cutoff) {
    discard;
  }

  vec3 accentData = clamp(
    atlasColor.rgb / max(atlasColor.a, 0.001),
    vec3(0.0),
    vec3(1.0)
  );
  int biomeRow = int(clamp(vBiome, 0.0, float(${GRASS_MAX_BIOMES} - 1)) + 0.5);
  vec3 color = grassResolvePalette(
    uBiomeBase[biomeRow],
    uBiomeTip[biomeRow],
    uBiomeDry[biomeRow],
    accentData.r,
    accentData.g,
    vDryness,
    vRootAo,
    uBiomeShade[biomeRow].y,
    uBiomeShade[biomeRow].x
  );
  int tintRow = int(clamp(
    vTint,
    0.0,
    float(${GRASS_MAX_ACCENT_TINTS} - 1)
  ) + 0.5);

  // These species already encode separate leaf/fragment shades in the atlas,
  // but the shared grass palette deliberately compresses that range. Restore
  // local contrast near the camera and darken the antialiased silhouette fringe
  // so rosettes and shrubs keep individual leaves instead of one green mass.
  float understoryDetailFade = 1.0 - smoothstep(
    ${DETAIL_FOLIAGE_UNDERSTORY_DETAIL_FADE_START.toFixed(1)},
    ${DETAIL_FOLIAGE_UNDERSTORY_DETAIL_FADE_END.toFixed(1)},
    vCameraDistance
  );
  float understoryShade = mix(
    0.76,
    1.14,
    smoothstep(0.22, 0.58, accentData.g)
  );
  float understoryInterior = smoothstep(
    cutoff,
    min(0.96, cutoff + ${DETAIL_FOLIAGE_UNDERSTORY_EDGE_RANGE.toFixed(2)}),
    atlasColor.a
  );
  float understoryEdge = mix(
    ${(1 - DETAIL_FOLIAGE_UNDERSTORY_EDGE_DARKENING).toFixed(2)},
    1.0,
    understoryInterior
  );
  color *= mix(
    1.0,
    understoryShade * understoryEdge,
    vUnderstory * understoryDetailFade
  );

  // Petal tint used to replace the semantic atlas colour completely whenever
  // B reached one, flattening every flower into one RGB patch. Shade the tint
  // with the atlas G channel, then add a small stable phenotype variation in
  // value and saturation. The B channel remains the blend strength, so stems,
  // sepals, centres, and petal bases keep their encoded depth.
  vec3 tintColor = uAccentTint[tintRow];
  float tintLuminance = dot(tintColor, vec3(0.2126, 0.7152, 0.0722));
  float saturation = mix(0.82, 1.0, fract(vPhenotype * 5.173 + 0.21));
  tintColor = mix(vec3(tintLuminance), tintColor, saturation);
  float petalShade = mix(0.65, 1.12, accentData.g);
  float phenotypeValue = mix(0.92, 1.06, vPhenotype);
  float ageFade = clamp(
    vDryness * 0.16 + fract(vPhenotype * 13.371 + 0.17) * 0.06,
    0.0,
    0.2
  );
  tintColor *= petalShade * phenotypeValue;
  tintColor = mix(
    tintColor,
    vec3(dot(tintColor, vec3(0.2126, 0.7152, 0.0722))) * 0.96,
    ageFade
  );
  color = mix(color, tintColor, accentData.b);

  vec3 lambertLight =
    color * vGrassIrradiance * RECIPROCAL_PI +
    color * uAmbientBoost;
  vec3 outgoingLight =
    mix(color, lambertLight, ${GRASS_LIGHT_MIX_GLSL}) +
    color * vGrassBackLight * uBacklightStrength * 0.2;
  gl_FragColor = vec4(outgoingLight, atlasColor.a * vDistanceFade);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

type ShaderUniforms = Record<string, { value: unknown }>;

function createBiomeColorRows(color: THREE.ColorRepresentation): THREE.Color[] {
  return Array.from({ length: GRASS_MAX_BIOMES }, () => new THREE.Color(color));
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

export interface WorldDetailFoliageMaterialOptions {
  fadeDistance: number;
  fadeTransition: number;
  /** Metres a species may leave early or late relative to the shared fade. */
  fadeStagger: number;
  /** Share of the transition width spent wandering in world space. */
  lodBandJitterRatio: number;
  noiseWind: boolean;
}

export class WorldDetailFoliageMaterial {
  readonly material: THREE.ShaderMaterial;

  private readonly uniforms: ShaderUniforms;
  private readonly baseWindStrength: number;
  private artRootDarkening: number;
  private artTipColorStrength = 0.5;

  constructor(
    readonly atlas: WorldDetailFoliageAtlas,
    materialConfig: GrassMaterialConfig,
    windConfig: GrassWindConfig,
    options: WorldDetailFoliageMaterialOptions,
  ) {
    this.baseWindStrength = windConfig.strength;
    this.artRootDarkening = materialConfig.rootDarkening;

    const speciesWind = new Float32Array(GRASS_MAX_ACCENT_SPECIES);
    for (const species of GRASS_ACCENT_SPECIES) {
      speciesWind[species.index] = species.windWeight;
    }

    this.uniforms = {
      ...(THREE.UniformsUtils.clone(THREE.UniformsLib.fog) as ShaderUniforms),
      ...(THREE.UniformsUtils.clone(THREE.UniformsLib.lights) as ShaderUniforms),
      uAtlas: { value: atlas.texture },
      uAtlasSize: { value: new THREE.Vector2(atlas.width, atlas.height) },
      uCellResolution: { value: atlas.cellResolution },
      uCellPadding: { value: atlas.padding },
      uAlphaCutoff: { value: DETAIL_FOLIAGE_ALPHA_CUTOFF },
      uFadeDistance: { value: options.fadeDistance },
      uFadeTransition: { value: options.fadeTransition },
      uFadeStagger: { value: options.fadeStagger },
      uLodBandJitterRatio: { value: options.lodBandJitterRatio },
      uDensityScale: { value: 1 },
      uSpeciesWind: { value: speciesWind },
      uTime: { value: 0 },
      uWindDirection: {
        value: new THREE.Vector2(
          windConfig.directionX,
          windConfig.directionZ,
        ).normalize(),
      },
      uWindStrength: { value: windConfig.strength },
      uWindNoise: { value: null as THREE.Texture | null },
      uWindNoiseScale: { value: GRASS_WIND_NOISE_SCALE },
      uWindNoiseSpeed: { value: GRASS_WIND_NOISE_SPEED },
      uNormalUp: { value: materialConfig.normalUp },
      uAmbientBoost: { value: materialConfig.ambientBoost },
      uBacklightStrength: { value: materialConfig.backlightStrength },
      uBiomeBase: { value: createBiomeColorRows(materialConfig.baseColor) },
      uBiomeTip: { value: createBiomeColorRows(materialConfig.tipColor) },
      uBiomeDry: { value: createBiomeColorRows(materialConfig.dryColor) },
      uBiomeShade: {
        value: createBiomeShadeRows(materialConfig.rootDarkening, 0.5),
      },
      uAccentTint: {
        value: GRASS_ACCENT_TINTS.map((tint) => new THREE.Color(tint.color)),
      },
    };
    this.setPaletteColors(
      materialConfig.baseColor,
      materialConfig.tipColor,
      materialConfig.dryColor,
    );

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      fog: true,
      lights: true,
      toneMapped: true,
      defines: options.noiseWind ? { GRASS_NOISE_WIND: 1 } : {},
    });
    this.material.name = "world-grass-detail-foliage";
  }

  applyArtDirection(direction: GrassArtDirection): void {
    this.artRootDarkening = direction.rootDarkening;
    this.artTipColorStrength = direction.tipColorStrength;
    this.setPaletteColors(
      direction.baseColor,
      direction.tipColor,
      direction.dryColor,
    );
    this.uniforms.uNormalUp.value = direction.normalUp;
    this.uniforms.uAmbientBoost.value = direction.ambientBoost;
    this.uniforms.uBacklightStrength.value = direction.backlightStrength;
    this.uniforms.uWindStrength.value =
      this.baseWindStrength * direction.windStrengthScale;
  }

  setWindNoise(texture: THREE.Texture, scale: number, speed: number): void {
    this.uniforms.uWindNoise.value = texture;
    this.uniforms.uWindNoiseScale.value = scale;
    this.uniforms.uWindNoiseSpeed.value = speed;
  }

  /**
   * The keep threshold the field's CPU draw trim reproduces. Both sides must
   * read the same value or the trim stops being conservative.
   */
  setDensityScale(scale: number): void {
    this.uniforms.uDensityScale.value = scale;
  }

  setFade(distance: number, transition: number): void {
    this.uniforms.uFadeDistance.value = distance;
    this.uniforms.uFadeTransition.value = transition;
  }

  update(elapsedSeconds: number): void {
    this.uniforms.uTime.value = elapsedSeconds;
  }

  dispose(): void {
    this.material.dispose();
    this.atlas.texture.dispose();
  }

  private setPaletteColors(
    baseColor: THREE.ColorRepresentation,
    tipColor: THREE.ColorRepresentation,
    dryColor: THREE.ColorRepresentation,
  ): void {
    const base = this.uniforms.uBiomeBase.value as THREE.Color[];
    const tip = this.uniforms.uBiomeTip.value as THREE.Color[];
    const dry = this.uniforms.uBiomeDry.value as THREE.Color[];
    const shade = this.uniforms.uBiomeShade.value as THREE.Vector2[];
    setBalancedGrassPaletteColors(
      base[0],
      tip[0],
      dry[0],
      baseColor,
      tipColor,
      dryColor,
    );
    shade[0].set(this.artRootDarkening, this.artTipColorStrength);
    for (let row = 1; row < GRASS_MAX_BIOMES; row += 1) {
      const profile = GRASS_BIOME_PROFILES[row];
      if (!profile || profile.paletteSource === "art") {
        base[row].copy(base[0]);
        tip[row].copy(tip[0]);
        dry[row].copy(dry[0]);
        shade[row].copy(shade[0]);
      } else {
        setBalancedGrassPaletteColors(
          base[row],
          tip[row],
          dry[row],
          profile.baseColor,
          profile.tipColor,
          profile.dryColor,
        );
        shade[row].set(profile.rootDarkening, profile.tipColorStrength);
      }
    }
  }
}
