import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");

function read(relativePath) {
  return readFileSync(resolve(REPOSITORY_ROOT, relativePath), "utf8").replaceAll(
    "\r\n",
    "\n",
  );
}

function fail(message) {
  throw new Error(`[lod-continuity] ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function readYamlNumber(source, key) {
  const value = Number(
    source.match(new RegExp(`^${key}:\\s*([0-9.]+)$`, "m"))?.[1],
  );
  if (!Number.isFinite(value)) {
    fail(`Unable to read ${key} from configuration.`);
  }
  return value;
}

async function importTypeScriptModule(relativePath, sourceOverride) {
  const fileName = resolve(REPOSITORY_ROOT, relativePath);
  const source = sourceOverride ?? readFileSync(fileName, "utf8");
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
    fileName,
    reportDiagnostics: true,
  });
  const errors = result.diagnostics?.filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (errors?.length) {
    fail(
      `Unable to transpile ${relativePath}: ${errors
        .map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
        )
        .join("; ")}`,
    );
  }
  const encoded = Buffer.from(result.outputText).toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

const controller = read("src/grass/GrassLodController.ts");
const thirdPersonController = read("src/controls/ThirdPersonController.ts");
const nearMaterial = read("src/grass/materials/GrassNearMaterial.ts");
const sharedPalette = read("src/grass/materials/GrassPaletteShader.ts");
const artDirections = JSON.parse(read("src/grass/GrassArtPresets.json"));
// Read from the source of truth rather than named here: a gate that pins the
// shipped preset by name goes quiet the moment the default moves, which is
// exactly when its ceilings matter most.
const defaultArtDirectionKey = read("src/grass/GrassArtDirection.ts").match(
  /DEFAULT_GRASS_ART_DIRECTION_KEY: GrassArtDirectionKey =\s*"([a-z-]+)"/,
)?.[1];
if (!artDirections[defaultArtDirectionKey]) {
  throw new Error(
    `[lod-continuity] Unable to resolve the default art direction: ${defaultArtDirectionKey}.`,
  );
}
const impostorMaterial = read(
  "src/world/grass/WorldGrassImpostorMaterial.ts",
);
const impostorAtlasFactory = read(
  "src/world/grass/WorldGrassImpostorAtlasFactory.ts",
);
const tuning = read("src/world/grass/WorldGrassImpostorTuning.ts");
const lodTuning = read("src/grass/GrassLodTuning.ts");
const worldGrassSystem = read("src/world/WorldGrassSystem.ts");
const nearField = read("src/world/grass/WorldNearGrassField.ts");
const singleBladeFactory = read(
  "src/world/grass/WorldSingleBladeTileFactory.ts",
);
const worldConfig = read("public/config/world.yaml");
const grassConfig = read("public/config/grass.yaml");

const artDirectionSource = read("src/grass/GrassArtDirection.ts").replace(
  'import presetData from "./GrassArtPresets.json";',
  `const presetData = ${JSON.stringify(artDirections)};`,
);
const artDirectionModule = await importTypeScriptModule(
  "src/grass/GrassArtDirection.ts",
  artDirectionSource,
);
const runtimeMathModule = await importTypeScriptModule(
  "src/world/grass/GrassRuntimeMath.ts",
);
const lodTuningModule = await importTypeScriptModule(
  "src/grass/GrassLodTuning.ts",
);

for (const key of Object.keys(artDirectionModule.GRASS_ART_DIRECTIONS)) {
  assert(
    artDirectionModule.resolveGrassArtDirectionKey(key) === key,
    `Grass-art preset ${key} must resolve to itself.`,
  );
}
for (const invalidKey of [
  null,
  undefined,
  "",
  "unknown",
  "constructor",
  "toString",
  "__proto__",
]) {
  assert(
    artDirectionModule.resolveGrassArtDirectionKey(invalidKey) ===
      artDirectionModule.DEFAULT_GRASS_ART_DIRECTION_KEY,
    `Invalid grass-art key ${String(invalidKey)} must resolve to the default.`,
  );
}

const patchSize = readYamlNumber(worldConfig, "grassPatchSize");
const bladeHeightMax = readYamlNumber(grassConfig, "bladeHeightMax");
const heightVariation = readYamlNumber(grassConfig, "heightVariation");
const windStrength = readYamlNumber(grassConfig, "windStrength");
const cameraMargin = readYamlNumber(grassConfig, "impostorCameraMargin");
const centerHeight = bladeHeightMax * 0.5;
const halfPatch = patchSize * 0.5;
const cardRadius =
  Math.sqrt(halfPatch * halfPatch * 2 + centerHeight * centerHeight) *
  cameraMargin;
const boundsRadius =
  runtimeMathModule.calculateGrassImpostorRootBoundsRadius({
    cardRadius,
    centerHeight,
    footprintScale: lodTuningModule.GRASS_IMPOSTOR_FOOTPRINT_SCALE,
    maximumHorizontalScale:
      lodTuningModule.GRASS_IMPOSTOR_MAX_HORIZONTAL_SCALE,
    maximumVerticalScale:
      lodTuningModule.GRASS_IMPOSTOR_MAX_VERTICAL_SCALE,
    maximumWindDisplacement:
      lodTuningModule.GRASS_IMPOSTOR_MAX_WIND_DISPLACEMENT,
    safetyMargin: lodTuningModule.GRASS_IMPOSTOR_BOUNDS_SAFETY_MARGIN,
  });
const maximumVisibleExtent =
  centerHeight * lodTuningModule.GRASS_IMPOSTOR_MAX_VERTICAL_SCALE +
  Math.hypot(
    cardRadius *
      lodTuningModule.GRASS_IMPOSTOR_MAX_HORIZONTAL_SCALE *
      lodTuningModule.GRASS_IMPOSTOR_FOOTPRINT_SCALE,
    cardRadius * lodTuningModule.GRASS_IMPOSTOR_MAX_VERTICAL_SCALE,
  ) +
  lodTuningModule.GRASS_IMPOSTOR_MAX_WIND_DISPLACEMENT;
assert(
  boundsRadius >= maximumVisibleExtent,
  "The far-impostor root bound must contain every transformed card corner.",
);
assert(
  1 + heightVariation <=
    lodTuningModule.GRASS_IMPOSTOR_MAX_VERTICAL_SCALE,
  "Configured grass height variation exceeds the far-impostor bound.",
);
const maximumWindScale = Math.max(
  ...Object.values(artDirectionModule.GRASS_ART_DIRECTIONS).map(
    (direction) => direction.windStrengthScale,
  ),
);
// Cards shear from root to tip and the shear is scaled by the instance's own
// vertical scale, so the worst case is the product of all four terms. The shear
// factor is read from the shader source rather than repeated here: it used to
// be a literal in both places, and the shader's moved while the gate's did not.
const impostorShearFactor = Number(
  impostorMaterial.match(
    /gustNoise \* 2\.0 - 1\.0\) \* uWindStrength \*\s*\$\{GRASS_IMPOSTOR_WIND_SHEAR_FACTOR/,
  )
    ? lodTuningModule.GRASS_IMPOSTOR_WIND_SHEAR_FACTOR
    : Number.NaN,
);
assert(
  Number.isFinite(impostorShearFactor),
  "The far-impostor shear must be templated from GRASS_IMPOSTOR_WIND_SHEAR_FACTOR.",
);
assert(
  windStrength *
    maximumWindScale *
    impostorShearFactor *
    lodTuningModule.GRASS_IMPOSTOR_MAX_VERTICAL_SCALE <=
    lodTuningModule.GRASS_IMPOSTOR_MAX_WIND_DISPLACEMENT,
  "Configured far-impostor wind exceeds the reserved bounds displacement.",
);
// The shear ramp must span the card, not the (much larger) culling bound.
assert(
  impostorMaterial.includes("uCardRadius: { value: atlas.cardRadius }") &&
    impostorMaterial.includes(
      "position.y / max(uCardRadius, 0.0001) * 0.5 + 0.5",
    ),
  "Impostor shear must ramp across the card's own half-extent.",
);
const horizontalScaleMaximum = Number(
  worldGrassSystem.match(
    /horizontalScale = job\.random\.range\([^,]+,\s*([0-9.]+)\)/,
  )?.[1],
);
assert(
  Number.isFinite(horizontalScaleMaximum) &&
    horizontalScaleMaximum <=
      lodTuningModule.GRASS_IMPOSTOR_MAX_HORIZONTAL_SCALE,
  "Generated horizontal grass scale exceeds the far-impostor bound.",
);
const farCardsPerPatch = readYamlNumber(
  worldConfig,
  "grassFarImpostorsPerPatch",
);
const cardOffset = farCardsPerPatch > 1 ? patchSize * 0.12 : 0;
assert(
  cardOffset *
      (lodTuningModule.GRASS_IMPOSTOR_MAX_VERTICAL_SCALE - 1) <=
    lodTuningModule.GRASS_IMPOSTOR_BOUNDS_SAFETY_MARGIN,
  "Layered-card scale amplification exceeds the bounds safety margin.",
);

let invalidBoundsRejected = false;
try {
  runtimeMathModule.calculateGrassImpostorRootBoundsRadius({
    cardRadius: Number.NaN,
    centerHeight,
    footprintScale: 1,
    maximumHorizontalScale: 1,
    maximumVerticalScale: 1,
    maximumWindDisplacement: 0,
    safetyMargin: 0,
  });
} catch (error) {
  invalidBoundsRejected = error instanceof RangeError;
}
assert(
  invalidBoundsRejected,
  "Invalid impostor bounds input must be rejected.",
);

assert(
  impostorAtlasFactory.includes("texture.colorSpace = THREE.NoColorSpace") &&
    impostorAtlasFactory.includes("texture.premultiplyAlpha = true") &&
    impostorAtlasFactory.includes("encodeDataColor") &&
    impostorAtlasFactory.includes("baseEdgeX") &&
    impostorAtlasFactory.includes("radius: boundsRadius") &&
    !impostorAtlasFactory.includes("new THREE.Color(material.baseColor)"),
  "The far atlas must store palette-neutral data and expose conservative bounds.",
);
assert(
  impostorMaterial.includes("vec3 bladeData = clamp(") &&
    impostorMaterial.includes("grassResolvePalette") &&
    !impostorMaterial.includes("smoothstep(0.08, 0.92, vUv.y)"),
  "The far shader must reconstruct the shared palette from neutral atlas masks.",
);

assert(
  !controller.includes("farAerialVisible"),
  "CPU visibility must not suppress far meshes by aerial angle.",
);
assert(
  !controller.includes("grassDistanceFade") &&
    nearMaterial.includes(
      "grassDither > 1.0 - grassDensityFalloff * (1.0 - grassLodCut)",
    ) &&
    nearMaterial.includes(
      "float grassLodCut = max(grassNearCoverage, grassFarDistanceEntry)",
    ),
  "World mid coverage must be resolved once from world distance in the shader.",
);
assert(
  !/vFarEntry\s*\*\s*vTerrainCoverage\s*\*\s*aerialVisibility/.test(
    impostorMaterial,
  ),
  "Far coverage must stay complementary to the mid distance fade.",
);
assert(
  !nearMaterial.includes("grassPaletteBlend") &&
    !nearMaterial.includes("vGrassCameraDistance"),
  "Real-blade palette must not change with LOD distance.",
);
assert(
  sharedPalette.includes("grassResolvePalette") &&
    sharedPalette.includes("setBalancedGrassPaletteColors") &&
    nearMaterial.includes("GRASS_PALETTE_GLSL") &&
    impostorMaterial.includes("GRASS_PALETTE_GLSL") &&
    nearMaterial.includes("setBalancedGrassPaletteColors") &&
    impostorMaterial.includes("setBalancedGrassPaletteColors"),
  "Real blades and impostors must use the shared palette function.",
);
const paletteTemplate = sharedPalette.slice(
  sharedPalette.indexOf("export const GRASS_PALETTE_GLSL"),
);
const injectedPaletteScalars = [
  ...paletteTemplate.matchAll(/\$\{([^}]+)\}/g),
].map((match) => match[1].trim());
// Art values must come from the tuning file so a preset cannot be silently
// hard-coded into the shader. GRASS_LUMINANCE_WEIGHTS is admitted alongside it
// because it is not an art value: it is the Rec. 709 luma vector, already
// exported and already shared with setBalancedGrassPaletteColors, so injecting
// it keeps one source of truth rather than creating a second. What the rule is
// really protecting either way is that nothing reaches the GLSL as a bare
// literal, which the toGlslFloat prefix is what actually guarantees.
const PALETTE_SCALAR_SOURCES = ["tuning.", "GRASS_LUMINANCE_WEIGHTS."];
assert(
  injectedPaletteScalars.length > 0 &&
    injectedPaletteScalars.every((expression) =>
      PALETTE_SCALAR_SOURCES.some((source) =>
        expression.startsWith(`toGlslFloat(${source}`),
      ),
    ) &&
    sharedPalette.includes("Number.isInteger(value)"),
  "Every generated palette scalar must be emitted as a GLSL float literal.",
);
assert(
  /grassResolvePalette\(\s*uGrassBiomeBase\[grassBiomeRow\],\s*uGrassBiomeTip\[grassBiomeRow\],\s*uGrassBiomeDry\[grassBiomeRow\],/s.test(
    nearMaterial,
  ) &&
    /grassResolvePalette\(\s*uBiomeBase\[biomeRow\],\s*uBiomeTip\[biomeRow\],\s*uBiomeDry\[biomeRow\],\s*bladeData\.r,\s*bladeData\.g,/s.test(
      impostorMaterial,
    ) &&
    nearMaterial.includes("uGrassBiomeShade[grassBiomeRow].y") &&
    impostorMaterial.includes("uBiomeShade[biomeRow].y"),
  "LOD shaders must map shared palette arguments and atlas channels identically.",
);
// Far cards now take the stochastic single-fetch path across the whole range,
// not just past the handoff. The four-tap blend it replaced ran precisely where
// the cards are largest on screen, and the real mid blades still drawing over
// them there hide the difference. What must not come back is a multi-fetch
// filter or a premultiply that would break the semantic channel decode.
assert(
  !impostorMaterial.includes("atlasColor.rgb *= atlasColor.a") &&
    !impostorMaterial.includes("vec4 color00 = sampleFrame") &&
    impostorMaterial.includes("Stable stochastic bilinear selection"),
  "Far atlas filtering must reconstruct the view blend with a single fetch.",
);
assert(
  (impostorMaterial.match(/atlasColor = sampleFrame\(/g) ?? []).length === 2,
  "Far cards must sample the atlas exactly once per fragment (compact and blended paths).",
);
assert(
  impostorMaterial.includes("lights: true") &&
    impostorMaterial.includes("vGrassIrradiance") &&
    impostorMaterial.includes("GRASS_LIGHT_MIX_GLSL") &&
    nearMaterial.includes("GRASS_LIGHT_MIX_GLSL"),
  "Far cards must use the same stylized lighting mix as real blades.",
);
// Transmission has to arrive at the same strength in both representations.
//
// Each shader used to multiply the shared backlight uniform by its own
// hardcoded factor — 0.3 in the near material, 0.2 in the cards — on top of the
// preset's value. A preset that raised backlight therefore moved the near field
// and the far cards by different amounts, and the number it named was never the
// number that reached either. Neither the parity gate nor a type checker could
// see it, because both shaders looked individually reasonable. The factors are
// gone; this keeps them gone.
for (const [label, shader, uniform] of [
  ["near", nearMaterial, "uGrassBacklightStrength"],
  ["impostor", impostorMaterial, "uBacklightStrength"],
]) {
  const attenuated = new RegExp(`${uniform}\\s*\\*\\s*[0-9]`);
  assert(
    !attenuated.test(shader),
    `The ${label} shader scales ${uniform} by a hardcoded factor; transmission must come from the uniform alone.`,
  );
  assert(
    new RegExp(`mix\\([^)]*, 0\\.35\\)\\s*\\*\\s*\\n?\\s*v?[gG]rass[bB]ack[lL]ight\\s*\\*\\s*${uniform}`).test(
      shader.replace(/\r\n/g, "\n"),
    ),
    `The ${label} shader must warm transmission towards the tip colour by the same 0.35 as the other LOD.`,
  );
}
assert(
  impostorMaterial.includes("uBiomeShade") &&
    impostorMaterial.includes("artTipColorStrength") &&
    impostorMaterial.includes("artRootDarkening"),
  "Impostors must receive runtime tip and root palette controls.",
);
// A gust crest lifts blade colour towards the tip. Both representations must do
// it with the same constant and the same formula, or the 44-64 m crossfade
// pulses as one brightens and the other does not. The constant is shared, and
// neither shader may reintroduce a literal for it.
assert(
  nearMaterial.includes("GRASS_GUST_TIP_BOOST") &&
    impostorMaterial.includes("GRASS_GUST_TIP_BOOST") &&
    /uGrassGustTipBoost \* (grassProgress|vGrassProgress)/.test(nearMaterial) &&
    impostorMaterial.includes("uGustTipBoost * bladeData.r"),
  "Gust tip lift must use the shared constant and the same formula at every LOD.",
);
// The biome row indexes bounded uniform arrays; out-of-range indexing is
// undefined behaviour in GLSL ES 3.0, so both shaders must clamp it.
assert(
  nearMaterial.includes("clamp(biome, 0.0, float(GRASS_MAX_BIOMES - 1))") &&
    impostorMaterial.includes("clamp(vBiome, 0.0,"),
  "Biome palette rows must be clamped before indexing the uniform arrays.",
);
assert(
  worldGrassSystem.includes("await this.nearField.initialize(grassConfig)") &&
    worldGrassSystem.includes("this.nearField.update(") &&
    worldGrassSystem.includes("this.cameraPosition"),
  "The dense single-blade fields must remain wired into WorldGrassSystem.",
);
assert(
  !thirdPersonController.includes("WorldNearGrassField"),
  "ThirdPersonController must not create a duplicate near-grass field.",
);
// The extra ultra-near layer carries only the density *above* the base field,
// so the configured multiplier always has one subtracted from it. Matched
// against a whitespace-stripped copy and accepting the compact multiplier: the
// literal this used to require broke the moment the profile-specific value was
// introduced, which is a formatting change rather than a behavioural one.
const nearFieldCompact = nearField.replace(/\s+/g, "");
assert(
  /grassUltraNearDensityMultiplier(Compact)?\)?-1/.test(nearFieldCompact) &&
    nearFieldCompact.includes("grassUltraNearDensityMultiplierCompact") &&
    nearField.includes("world-grass-ultra-near-blades") &&
    nearField.includes("world-grass-ultra-near-base-detail") &&
    nearField.includes("detailMode: 1") &&
    nearField.includes("detailMode: 2"),
  "Ultra-near must retain segmented base blades plus the independent density layer, at a profile-specific multiplier.",
);
assert(
  singleBladeFactory.includes(
    "const segments = Math.max(1, Math.round(bladeSegments))",
  ) &&
    singleBladeFactory.includes(
      "for (let segment = 0; segment < segments - 1; segment += 1)",
    ) &&
    singleBladeFactory.includes(
      "indices.push(finalRow, tipVertex, finalRow + 1)",
    ) &&
    singleBladeFactory.includes(
      "options.receiveShadows && this.profile.shadows",
    ) &&
    nearMaterial.includes("grassProgress > 0.001"),
  "Distant single blades must use the low-cost geometry and guarded vertex path.",
);
assert(
  nearMaterial.includes("bool grassKeepBlade") &&
    nearMaterial.includes("if (!grassKeepBlade)") &&
    nearMaterial.includes("if (grassKeepBlade && grassProgress > 0.001)"),
  "Rejected blades must skip wind and become degenerate before rasterization.",
);
assert(
  worldGrassSystem.includes("mesh.receiveShadow = false") &&
    controller.includes("farthestDistance > farEntryStart") &&
    !worldGrassSystem.includes("world-grass-near-"),
  "Mid/far rendering must avoid distant shadow and pre-transition overdraw.",
);
assert(
  worldGrassSystem.includes("private resolveArtFarDistance") &&
    worldGrassSystem.includes("direction.farDistance") &&
    worldGrassSystem.includes("streamFadeEnd - direction.transitionDistance") &&
    worldGrassSystem.includes(
      "lodConfig.farMaxDistance = this.resolveArtFarDistance(direction)",
    ),
  "Preset far distances must remain capped by the active streamed radius.",
);
assert(
  worldGrassSystem.includes("private getFarImpostorOffsetRadius") &&
    worldGrassSystem.includes(
      "impostorRadius + this.getFarImpostorOffsetRadius()",
    ),
  "Far-impostor bounds must include layered-card offsets.",
);
assert(
  !/impostorAtlasFactory\.create\(\s*variants\.bladeVariants\[index\],\s*grassConfig\.geometry,\s*grassConfig\.material,/s.test(
    worldGrassSystem,
  ),
  "The palette-neutral atlas factory must not depend on display material colors.",
);

const ultraNearDistance = readYamlNumber(
  worldConfig,
  "grassUltraNearDistance",
);
const ultraNearMultiplier = readYamlNumber(
  worldConfig,
  "grassUltraNearDensityMultiplier",
);
const interactionStrength = readYamlNumber(
  worldConfig,
  "grassInteractionStrength",
);
const midBladeFraction = readYamlNumber(
  worldConfig,
  "grassMidBladeFraction",
);
const patchDensityDesktop = readYamlNumber(
  worldConfig,
  "grassBladesPerSquareMeterDesktop",
);
const patchDensityCompact = readYamlNumber(
  worldConfig,
  "grassBladesPerSquareMeterCompact",
);
const nearDensityDesktop = readYamlNumber(
  worldConfig,
  "grassNearBladesPerSquareMeterDesktop",
);
const nearDensityCompact = readYamlNumber(
  worldConfig,
  "grassNearBladesPerSquareMeterCompact",
);
// Continuity does not depend on where this radius sits: the base layer and the
// detail layer carry complementary halves of the same dither order (detailMode
// 1 against 2), so the near band's total density is the same on either side of
// the boundary wherever it is put. What the radius actually costs is triangles,
// and that is bounded by the near-field ceiling in verify-grass-performance —
// 6 m is what the desktop ceiling affords, with 7 m measuring 1,004,544 against
// the 1,000,000 bound. Pinned rather than ranged so a change stays a reviewed
// one.
assert(
  ultraNearDistance === 6,
  "Ultra-near grass must remain six metres.",
);
assert(
  ultraNearMultiplier === 2,
  "Ultra-near grass must double density.",
);
// Micro fade is a shading schedule, not a LOD schedule. It drives the troughed
// normal's flattening toward world up, the per-blade tone collapse, and the
// flutter amplitude. It used to read `uGrassNearDistance * 0.16 / * 0.52`, which
// is per material: the five near/mid layers completed the flattening at 3.4 m,
// 9.4 m and 14.6 m respectively, so the two co-located populations inside the
// ultra-near band were lit differently and the handoff read as a brightness ring
// riding at a fixed radius around the camera. The range is now one world-space
// interval every layer is given, which is what these three assertions hold.
assert(
  /float grassMicroFade = 1\.0 - smoothstep\(\s*uGrassMicroFadeRange\.x,\s*uGrassMicroFadeRange\.y,/.test(
    nearMaterial,
  ),
  "The grass micro-detail fade must come from the shared range uniform.",
);
assert(
  !/grassMicroFade\s*=[^;]*uGrass(Near|Mid|Detail|Transition)/.test(nearMaterial),
  "The grass micro-detail fade must not be derived from any LOD distance.",
);
{
  const microFadeStart = readYamlNumber(worldConfig, "grassMicroDetailFadeStart");
  const microFadeEnd = readYamlNumber(worldConfig, "grassMicroDetailFadeEnd");
  assert(
    microFadeStart < microFadeEnd,
    "The grass micro-detail fade range must increase.",
  );
  // Every layer that can draw a real blade has to be handed the same interval.
  // The near field applies it to all of its materials in one loop; the mid
  // material is set from the same two config values in its own constructor.
  assert(
    /for \(const material of created\) \{[\s\S]{0,240}?material\.setMicroDetailFadeRange\(\s*worldConfig\.grassMicroDetailFadeStart,\s*worldConfig\.grassMicroDetailFadeEnd,/.test(
      nearField,
    ),
    "Every near grass material must be given the shared micro-detail fade range.",
  );
  // The normal-flattening schedule rides that same micro fade, so it carries the
  // same requirement for the same reason: a material that missed it would light
  // its blades on a different schedule from the layer drawing the blades beside
  // them, which is the failure the shared fade exists to prevent.
  assert(
    /for \(const material of created\) \{[\s\S]{0,240}?material\.setNearNormalUpScale\(\s*worldConfig\.grassNearNormalUpScale,?\s*\)/.test(
      nearField,
    ),
    "Every near grass material must be given the shared normal-flattening scale.",
  );
  assert(
    /this\.material\.setMicroDetailFadeRange\(\s*worldConfig\.grassMicroDetailFadeStart,\s*worldConfig\.grassMicroDetailFadeEnd,/.test(
      worldGrassSystem,
    ),
    "The mid grass material must share the near field's micro-detail fade range.",
  );
}
assert(
  interactionStrength >= 0.9,
  "Character grass interaction must retain the stronger response.",
);
assert(
  midBladeFraction === 1,
  "Mid grass must retain every source blade.",
);
assert(
  patchDensityDesktop === 84 && nearDensityDesktop === 84,
  "Desktop near and mid density must match at 84 blades/m².",
);
// What continuity requires is that the two layers agree, not a particular
// value: a near band denser than the mid band it hands off to would thin
// visibly at the fade. The compact value itself is a reviewed art/performance
// decision (40 blades/m² after the mobile-naturalness A/B) and is bounded by
// verify-grass-performance.
assert(
  patchDensityCompact === nearDensityCompact,
  `Compact near and mid density must match: ${nearDensityCompact} against ${patchDensityCompact}.`,
);
assert(
  farCardsPerPatch === 1,
  "Far grass must retain exactly one source instance per patch.",
);
const midImpostorUnderfill = Number(
  lodTuning.match(/GRASS_MID_IMPOSTOR_UNDERFILL\s*=\s*([0-9.]+)/)?.[1],
);
assert(
  midImpostorUnderfill === 0,
  "Full-density mid blades must not carry a redundant far-card underfill layer.",
);

const expectedMidDistances = {
  "muted-meadow": 54,
  "lush-hero": 54,
  "natural-meadow": 48,
  "golden-hour": 46,
  "cool-highland": 58,
  "dense-emerald": 62,
  "zelda-field": 56,
  windswept: 52,
};
const midBatchSize =
  readYamlNumber(worldConfig, "chunkSize") /
  readYamlNumber(worldConfig, "grassRenderBatchesPerAxis");
function smoothstep(value, start, end) {
  const amount = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return amount * amount * (3 - 2 * amount);
}
for (const [key, direction] of Object.entries(artDirections)) {
  assert(
    direction.midDistance === expectedMidDistances[key],
    `${direction.label} mid distance must retain its density/performance balance.`,
  );
  const nearFadeEnd = direction.nearDistance + direction.transitionDistance;
  const farEntryStart = direction.midDistance - direction.transitionDistance;
  assert(
    farEntryStart >= nearFadeEnd && farEntryStart - nearFadeEnd <= 16,
    `${direction.label} must avoid both a triple-LOD overlap and a long mid-only band.`,
  );
  assert(
    direction.nearDistance + direction.transitionDistance > midBatchSize,
    `${direction.label} near fade must extend past a ${midBatchSize} m mid batch so the camera batch cannot submit every mid blade.`,
  );
  for (let sample = 0; sample <= 1000; sample += 1) {
    const distance =
      direction.nearDistance -
      direction.transitionDistance +
      (sample / 1000) * direction.transitionDistance * 2;
    const nearCoverage =
      1 -
      smoothstep(
        distance,
        direction.nearDistance - direction.transitionDistance,
        nearFadeEnd,
      );
    const farEntry = smoothstep(
      distance,
      farEntryStart,
      direction.midDistance + direction.transitionDistance,
    );
    const midCoverage = Math.max(
      0,
      1 - Math.max(nearCoverage, farEntry),
    );
    assert(
      farEntry === 0,
      `${direction.label} far cards entered during the near/mid handoff.`,
    );
    for (const density of [nearDensityDesktop, nearDensityCompact]) {
      const blendedDensity =
        density * nearCoverage + density * midCoverage;
      assert(
        Math.abs(blendedDensity / density - 1) <= 1e-12,
        `${direction.label} density gap at near/mid sample ${sample}.`,
      );
    }
  }
}

const nearBoundsRadius =
  runtimeMathModule.calculateGrassSingleBladeRootBoundsRadius({
    bladeHeight: bladeHeightMax,
    bladeWidth: readYamlNumber(grassConfig, "bladeWidthMax"),
    bladeLean: readYamlNumber(grassConfig, "bladeLeanMax"),
    bladeCurveReach: runtimeMathModule.calculateGrassBladeCurveReach(
      bladeHeightMax,
      readYamlNumber(grassConfig, "bladeCurve"),
    ),
    // The shaped blade reaches past the source it instances: the tip drifts
    // sideways and the bend carries it forward. Reproduced from configuration
    // here so a drift raised in world.yaml cannot outgrow the culling envelope
    // without this failing.
    shapeReach:
      readYamlNumber(grassConfig, "bladeWidthMax") *
        readYamlNumber(worldConfig, "grassBladeTipDrift") +
      bladeHeightMax * runtimeMathModule.GRASS_SHAPE_BEND_FRACTION,
    // Raised with the broad-blade minority; see INSTANCE_HORIZONTAL_SCALE_MAX.
    maximumHorizontalScale: 1.9,
    maximumVerticalScale: 1.22,
    windStrength,
    flutterStrength: readYamlNumber(grassConfig, "flutterStrength"),
    maximumArtWindScale: 2,
    maximumInstanceWindScale: 1.16,
    maximumWindStiffness: 1.12,
    maximumInteractionStrength: Math.max(
      readYamlNumber(worldConfig, "grassInteractionStrength"),
      readYamlNumber(worldConfig, "grassLandingPulseStrength"),
    ),
    interactionVerticalScale: 0.2,
    safetyMargin: 0.08,
  });
// The rest arc spends the blade's configured height as *arc length*. If it ever
// becomes a plain sideways offset the blade silently grows longer than its
// configuration says, and the reserved bounds — which charge the reach this
// same module reports — start under-charging a blade they believe they measured.
// Checked numerically rather than by reading the source, because the failure is
// arithmetic and would survive any amount of correct-looking code.
{
  const bladeCurve = readYamlNumber(grassConfig, "bladeCurve");
  const samples = 512;
  let arcLength = 0;
  let previous = runtimeMathModule.resolveGrassBladeArcPoint(
    bladeHeightMax,
    bladeCurve,
    0,
  );
  for (let index = 1; index <= samples; index += 1) {
    const point = runtimeMathModule.resolveGrassBladeArcPoint(
      bladeHeightMax,
      bladeCurve,
      index / samples,
    );
    arcLength += Math.hypot(point.y - previous.y, point.z - previous.z);
    previous = point;
  }
  assert(
    Math.abs(arcLength / bladeHeightMax - 1) < 1e-3,
    `Blade arc length ${arcLength.toFixed(4)} does not match configured height ${bladeHeightMax}.`,
  );
  const tip = runtimeMathModule.resolveGrassBladeArcPoint(
    bladeHeightMax,
    bladeCurve,
    1,
  );
  assert(
    tip.y < bladeHeightMax && tip.z > 0,
    "A curved blade's tip must stand lower than a straight one's and reach out.",
  );
  assert(
    Math.abs(
      runtimeMathModule.calculateGrassBladeCurveReach(
        bladeHeightMax,
        bladeCurve,
      ) - tip.z,
    ) < 1e-9,
    "Charged curve reach must equal the arc's own tip displacement.",
  );
  // A zero curve has to degenerate exactly rather than dividing by it, or a
  // preset asking for straight blades gets NaN geometry instead.
  const straight = runtimeMathModule.resolveGrassBladeArcPoint(
    bladeHeightMax,
    0,
    1,
  );
  assert(
    straight.y === bladeHeightMax && straight.z === 0,
    "A zero curve must produce a straight blade.",
  );
}

assert(
  nearBoundsRadius > bladeHeightMax &&
    singleBladeFactory.includes(
      "calculateGrassSingleBladeRootBoundsRadius",
    ) &&
    singleBladeFactory.includes(
      ".expandByScalar(this.calculateBoundsPadding())",
    ),
  "Near bounds must include configured blade, wind, and interaction displacement.",
);

// Wind bends a blade by rotating it about its root. Translating the vertices
// instead makes a bent blade longer than a straight one, which is both the
// rubbery look the trail bend was rewritten to avoid and a silent overrun of
// the reserved bounds, since those charge a rotation.
assert(
  !nearMaterial.includes("transformed += grassLocalWind") &&
    nearMaterial.includes("transformed.y *= grassWindCos"),
  "Wind must rotate blades about the root, not translate their vertices.",
);
// The gust front is an envelope in [1 - depth, 1]. Adding a second bend term
// instead would push past the wind displacement the bounds reserve.
assert(
  nearMaterial.includes(
    "mix(1.0 - uGrassGustFrontDepth, 1.0, grassGustNoise)",
  ) && nearMaterial.includes("uGrassWindLodScale * grassGustEnvelope"),
  "Gust fronts must scale the configured bend down, never add to it.",
);
assert(
  nearMaterial.includes(
    "grassSide * uGrassBladeCurvature * grassMicroFade",
  ) &&
    nearMaterial.includes("grassBladePlaneNormalView") &&
    nearMaterial.includes("1.0 - grassMicroFade") &&
    !nearMaterial.includes(
      "normalize(mat3(modelViewMatrix) * vec3(0.0, 1.0, 0.0))",
    ) &&
    !nearMaterial.includes("(1.0 - grassMicroFade) * 0.78"),
  "Blade micro normals must converge on a wind-aware plane normal rather than world up.",
);
// Both single-blade tiles and mid patches must apply the macro field, at the
// same world position and from the same functions, or the terms would show up
// as a brightness step at an LOD handoff instead of as field variation.
for (const [label, source] of [
  ["near tiles", singleBladeFactory],
  ["mid patches", worldGrassSystem],
]) {
  assert(
    source.includes("resolveGrassCanopyAo(") &&
      source.includes("sampleGrassHabitat(") &&
      source.includes("habitatSample.dryness"),
    `Grass ${label} must resolve canopy occlusion and habitat dryness from the shared field.`,
  );
}
// The lattice margin must follow the configured tuft reach rather than a
// literal: radius scale and ellipse aspect are both per-tuft now, and a long
// tuft whose margin was still sized for the old fixed 0.42 circle would sample
// its terrain normal from outside the cached area.
assert(
  singleBladeFactory.includes("resolveClumpMaxCellOffset(this.worldConfig)") &&
    singleBladeFactory.includes("config.grassClumpAspectMax") &&
    singleBladeFactory.includes("config.grassClumpRadiusScaleMax * CLUMP_CELLS"),
  "The cached height lattice must be grown by the configured maximum tuft reach.",
);
// Headings blend a tuft-wide direction, the radial direction, and independent
// randomness. Radial alone is the starburst this replaced; independent alone
// dissolves the tuft.
assert(
  singleBladeFactory.includes("dominantX * dominantWeight") &&
    singleBladeFactory.includes("radialX * radialWeight") &&
    singleBladeFactory.includes("Math.sin(independentAngle) * independentWeight") &&
    singleBladeFactory.includes("Math.atan2(headingX, headingZ)"),
  "Blade headings must blend clump-dominant, radial, and independent directions.",
);

const baseBlend = Number(
  tuning.match(/IMPOSTOR_BASE_COLOR_BLEND\s*=\s*([0-9.]+)/)?.[1],
);
const defaultTipStrength = artDirections[defaultArtDirectionKey]?.tipColorStrength;
assert(
  Number.isFinite(baseBlend) && baseBlend <= 0.1,
  "Far cards must not flatten the shared blade palette.",
);
// Tip strength reaches every LOD through the same uGrassBiomeShade.y uniform,
// so it moves near, mid, and far together and cannot itself open a seam — this
// is an art-taste ceiling, like MAX_ROOT_TIP_CONTRAST in verify-lod-color-parity,
// and it was raised alongside that one when the canopy gained a real root-to-tip
// gradient. It still rejects a blade that is essentially all tip colour.
assert(
  Number.isFinite(defaultTipStrength) && defaultTipStrength <= 0.5,
  "The default root-to-tip color change is too strong.",
);

for (let sample = 0; sample <= 1000; sample += 1) {
  const farEntry = sample / 1000;
  for (const fieldCoverage of [0.02, 0.25, 0.5, 0.75, 1]) {
    const midCoverage = (1 - farEntry) * fieldCoverage;
    const farCoverage = farEntry * fieldCoverage;
    assert(
      Math.abs(midCoverage + farCoverage - fieldCoverage) <= 1e-12,
      `Coverage gap at transition sample ${sample}.`,
    );
  }
}

console.log(
  "[lod-continuity] Runtime preset, palette, bounds, coverage, and ownership checks passed.",
);
