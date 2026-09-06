import * as THREE from "three";
import { TerrainChunkBuilder } from "../TerrainChunk";
import { TerrainField } from "../TerrainField";
import { TerrainSurfaceField } from "../terrain/TerrainSurfaceField";
import { WorldConfigLoader } from "../WorldConfigLoader";
import type { WaterInteractionField } from "../hydrology/WaterInteractionField";
import {
  TERRAIN_DETAIL_COLOR,
  TERRAIN_DETAIL_VERTEX,
} from "../TerrainMaterialShader";
import {
  buildStoneSurfacePlanes,
  facesFromPlanes,
} from "./StoneClipper";
import { StoneField, type StoneInstance } from "./StoneField";
import { resolveQualityStoneRecipe } from "./StoneShapeQuality";
import { STONE_ARCHETYPE_IDS } from "./StoneRecipe";
import {
  scoreStoneContactInfluence,
  scoreStoneOcclusionInfluence,
} from "./StoneGroundInfluence";
import {
  resolveStoneVertexWetness,
  resolveStoneWaterlineMoss,
  type StoneWetness,
} from "./StoneWetness";

const GROUND_SEEDS_PER_ARCHETYPE = 200;

function fail(message: string): never {
  throw new Error(`[stone-latest-regressions] ${message}`);
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) fail(message);
}

function verifyWaterlineSemantics(): void {
  const wetness: StoneWetness = {
    strength: 1,
    waterlineY: 10,
    topY: 12,
  };
  assert(
    resolveStoneWaterlineMoss(wetness, 9.8) < 0,
    "Submerged rock must be scoured below the hydrologic waterline.",
  );
  assert(
    resolveStoneWaterlineMoss(wetness, 10.15) > 0,
    "Splash-zone rock must gain moss immediately above the waterline.",
  );
  assert(
    resolveStoneWaterlineMoss(wetness, 11.5) === 0,
    "Raised spray wetting must not move the moss waterline upward.",
  );
  assert(
    resolveStoneVertexWetness(wetness, 11.5) > 0,
    "Visible spray wetting must still reach above the moss band.",
  );
}

function verifyIndependentGroundInfluence(): void {
  const contactOwner = {
    x: 0,
    z: 0,
    clearRadius: 1,
    occlusionRadius: 1,
  } as StoneInstance;
  const shadowOwner = {
    x: 0.75,
    z: 0,
    clearRadius: 0,
    occlusionRadius: 4,
  } as StoneInstance;

  assert(
    Number.isFinite(scoreStoneContactInfluence(contactOwner, 1, 0, 0.24)),
    "Ground-clearing stones must participate in contact-soil selection.",
  );
  assert(
    !Number.isFinite(scoreStoneContactInfluence(shadowOwner, 1, 0, 0.24)),
    "Non-clearing stones must not fabricate a compacted-soil band.",
  );
  assert(
    scoreStoneOcclusionInfluence(shadowOwner, 1, 0) <
      scoreStoneOcclusionInfluence(contactOwner, 1, 0),
    "Sky occlusion must select independently of the compacted-soil owner.",
  );
}

function verifyRigidMatedPlacement(configSource: string): number {
  const config = new WorldConfigLoader().parse(configSource);
  const stones = new StoneField(new TerrainField(config), config);
  let pairs = 0;
  const radius = 24;

  for (let gridZ = -radius; gridZ <= radius && pairs < 8; gridZ += 1) {
    for (let gridX = -radius; gridX <= radius && pairs < 8; gridX += 1) {
      const resolved = stones.getResolvedCluster(gridX, gridZ);
      if (!resolved.splitSucceeded) continue;
      const anchor = resolved.members[0]?.instance;
      const half = resolved.members.find((member) => member.isSplitHalf)?.instance;
      assert(anchor !== undefined && half !== undefined, "Split lost one of its halves.");
      assert(
        anchor.height === half.height && anchor.sink === half.sink,
        `Mated fragments disagree on their vertical transform at ${gridX}:${gridZ}.`,
      );
      assert(
        anchor.normalX === half.normalX &&
          anchor.normalY === half.normalY &&
          anchor.normalZ === half.normalZ,
        `Mated fragments disagree on their rigid terrain tilt at ${gridX}:${gridZ}.`,
      );
      assert(
        anchor.scale === half.scale &&
          Math.abs(anchor.rotationY - half.rotationY) < 1e-9,
        `Mated fragments disagree on scale/yaw at ${gridX}:${gridZ}.`,
      );
      pairs += 1;
    }
  }
  assert(pairs > 0, "Production seed exposed no mated pair for rigid-placement QA.");
  return pairs;
}

function verifyTerrainStoneAttributes(configSource: string): void {
  const config = new WorldConfigLoader().parse(configSource);
  const terrain = new TerrainField(config);
  const surface = new TerrainSurfaceField(config);
  const material = new THREE.MeshLambertMaterial();
  const builder = new TerrainChunkBuilder(
    0,
    0,
    config.chunkSize,
    3,
    terrain,
    surface,
    undefined as unknown as WaterInteractionField,
    material,
    undefined,
    false,
  );

  let chunk = builder.advance(Number.POSITIVE_INFINITY);
  while (!chunk) {
    chunk = builder.advance(Number.POSITIVE_INFINITY);
  }
  try {
    const contact = chunk.mesh.geometry.getAttribute("terrainStoneInfluence");
    const occlusionCenter = chunk.mesh.geometry.getAttribute(
      "terrainStoneOcclusionCenter",
    );
    const occlusion = chunk.mesh.geometry.getAttribute("terrainStoneOcclusion");
    assert(contact?.itemSize === 4, "Terrain omitted the stone-contact descriptor.");
    assert(
      occlusionCenter?.itemSize === 2,
      "Terrain omitted the independent stone-occlusion centre.",
    );
    assert(occlusion?.itemSize === 1, "Terrain omitted the stone-occlusion radius.");
  } finally {
    chunk.dispose();
    material.dispose();
  }
}

/**
 * A profile segment high on the body keeps extrapolating its slope downward,
 * and a flaring crown anchored on a narrow ring could reach y = 0 with a
 * negative support and clip the contact polygon away entirely -- leaving the
 * stone hovering by up to 10 cm. StoneVerification checks raw recipes; the
 * defect was three times more common under quality selection, because the
 * shape scorer actively preferred the flared bodies that caused it. This
 * checks the recipes that actually ship.
 */
function verifyQualityStonesReachTheGround(): number {
  let checked = 0;
  for (const archetype of STONE_ARCHETYPE_IDS) {
    for (let variant = 0; variant < GROUND_SEEDS_PER_ARCHETYPE; variant += 1) {
      const seed = (variant * 2654435761 + archetype.length * 977) >>> 0;
      const recipe = resolveQualityStoneRecipe(archetype, seed);
      const faces = facesFromPlanes(buildStoneSurfacePlanes(recipe, true));
      const contact = faces.filter((face) => face.role === "bottom");
      assert(
        contact.length > 0,
        `${archetype}:${seed} lost its ground contact polygon.`,
      );
      let minimumY = Infinity;
      for (const face of faces) {
        for (const point of face.points) {
          if (point.y < minimumY) minimumY = point.y;
        }
      }
      assert(
        Math.abs(minimumY * recipe.height) <= 2e-3,
        `${archetype}:${seed} hovers ${(minimumY * recipe.height).toFixed(4)}m above the ground.`,
      );
      checked += 1;
    }
  }
  return checked;
}

function verifyShaderIdentityGuards(): void {
  assert(
    TERRAIN_DETAIL_VERTEX.includes("attribute vec2 terrainStoneOcclusionCenter") &&
      TERRAIN_DETAIL_VERTEX.includes("varying vec2 vTerrainStoneOcclusionCenter"),
    "Terrain shader must carry a separate occlusion centre.",
  );
  assert(
    TERRAIN_DETAIL_COLOR.includes("terrainStoneContactCoherence") &&
      TERRAIN_DETAIL_COLOR.includes("terrainStoneOcclusionCoherence"),
    "Terrain shader must reject interpolated phantom stone identities.",
  );
}

export function verifyLatestStoneRegressions(configSource: string): string {
  verifyWaterlineSemantics();
  verifyIndependentGroundInfluence();
  const pairs = verifyRigidMatedPlacement(configSource);
  verifyTerrainStoneAttributes(configSource);
  verifyShaderIdentityGuards();
  const grounded = verifyQualityStonesReachTheGround();
  return `${pairs} rigid pairs + waterline + independent ground owners + terrain attributes + ${grounded} grounded quality bodies`;
}
