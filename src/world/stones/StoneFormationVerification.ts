import { buildStonePolyhedron } from "./StoneClipper";
import {
  addStoneFractureRelief,
  STONE_FRACTURE_RELIEF,
} from "./StoneFractureRelief";
import { generateStoneMesh } from "./StoneGeometry";
import {
  canFractureStoneArchetype,
  resolveStoneFormationGap,
  resolveStoneFormationOffset,
  resolveStoneFractureHorizontalNormal,
  resolveStoneFragmentRecipe,
  stoneFormationSplits,
} from "./StoneFormation";
import { STONE_ARCHETYPE_IDS } from "./StoneRecipe";
import { resolveQualityStoneRecipe } from "./StoneShapeQuality";

const ENVELOPE_EPSILON = 0.012 + STONE_FRACTURE_RELIEF;
const RIM_EPSILON = 5e-3;
const MINERAL_RIM_EPSILON = 0.04;
const MATERIAL_FRAME_EPSILON = 1e-6;
const FORMATION_EPSILON = 1e-8;
const MINIMUM_DOMINANT_SHARE = 0.66;
const MAXIMUM_DOMINANT_SHARE = 0.8;
const MINIMUM_SPLIT_RATE = 0.7;
const VARIANTS = 16;
const GAP_TEST_RATIO_MIN = 0.006;
const GAP_TEST_RATIO_MAX = 0.025;
const GAP_TEST_MAX = 0.03;
const GAP_TEST_SCALES = [0.45, 1, 2.75] as const;
const GAP_TEST_ROLLS = [0, 0.25, 0.5, 0.75, 1] as const;

function fail(message: string): never {
  throw new Error(`[stone-formations] ${message}`);
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) fail(message);
}

/** Two fragments of one parent occupy its volume and keep one mated geology. */
export function verifyStoneFormations(): string {
  let pairs = 0;
  for (const archetype of STONE_ARCHETYPE_IDS) {
    let splits = 0;
    for (let variant = 0; variant < VARIANTS; variant += 1) {
      const seed = (variant * 2654435761 + archetype.length * 97) >>> 0;
      const parent = resolveQualityStoneRecipe(archetype, seed);
      if (!stoneFormationSplits(parent)) continue;
      assert(
        canFractureStoneArchetype(archetype),
        `${archetype} is not a fracturable family but produced a formation.`,
      );
      splits += 1;
      pairs += 1;
      verifyPair(archetype, seed, parent);
    }
    if (!canFractureStoneArchetype(archetype)) {
      assert(
        splits === 0,
        `${archetype} produced ${splits} formations despite being whole-bodied.`,
      );
      continue;
    }
    assert(
      splits / VARIANTS >= MINIMUM_SPLIT_RATE,
      `${archetype} split only ${splits}/${VARIANTS} variants.`,
    );
  }
  assert(pairs > 0, "No archetype produced a formation at all.");
  return `${pairs} mated formations`;
}

function verifyPair(
  archetype: string,
  seed: number,
  parent: ReturnType<typeof resolveQualityStoneRecipe>,
): void {
  const recipeA = resolveStoneFragmentRecipe(parent, "a");
  const recipeB = resolveStoneFragmentRecipe(parent, "b");
  const fractureA = recipeA.fracture;
  const fractureB = recipeB.fracture;
  assert(
    fractureA !== undefined && fractureB !== undefined,
    `${archetype}:${seed} produced a formation without a break.`,
  );
  assert(
    Math.abs(fractureA.nx + fractureB.nx) < 1e-9 &&
      Math.abs(fractureA.ny + fractureB.ny) < 1e-9 &&
      Math.abs(fractureA.nz + fractureB.nz) < 1e-9 &&
      Math.abs(fractureA.constant + fractureB.constant) < 1e-9,
    `${archetype}:${seed} fragments do not share one break plane.`,
  );
  verifyDominantFragmentShare(archetype, seed, parent, fractureA);

  const rims = [recipeA, recipeB].map((recipe) => {
    const relieved = addStoneFractureRelief(
      buildStonePolyhedron(recipe, false),
      recipe,
    );
    const points = [];
    for (const face of relieved) {
      if (face.role !== "fracture") continue;
      for (const point of face.points) points.push(point);
    }
    assert(
      points.length > 0,
      `${archetype}:${seed} lost its break face during clipping.`,
    );
    return points;
  });
  for (const [near, far] of [
    [rims[0], rims[1]],
    [rims[1], rims[0]],
  ] as const) {
    for (const point of near) {
      let closest = Number.POSITIVE_INFINITY;
      for (const other of far) {
        closest = Math.min(
          closest,
          Math.hypot(point.x - other.x, point.y - other.y, point.z - other.z),
        );
      }
      assert(
        closest < RIM_EPSILON,
        `${archetype}:${seed} break outlines diverge by ${closest.toFixed(4)} at (${point.x.toFixed(4)}, ${point.y.toFixed(4)}, ${point.z.toFixed(4)}).`,
      );
    }
  }

  const whole = generateStoneMesh(parent, false);
  const major = generateStoneMesh(recipeA, false);
  const minor = generateStoneMesh(recipeB, false);
  const majorDetail = generateStoneMesh(recipeA, true);
  const minorDetail = generateStoneMesh(recipeB, true);
  assert(
    major.metrics.triangleCount + minor.metrics.triangleCount <
      whole.metrics.triangleCount * 2,
    `${archetype}:${seed} costs more as two fragments than as two whole stones.`,
  );
  verifyFormationGap(archetype, seed, recipeA, major, minor);
  verifyMaterialFrameContinuity(
    archetype,
    seed,
    major,
    minor,
    majorDetail,
    minorDetail,
  );
  verifyMineralContinuity(archetype, seed, major, minor);

  const bounds = meshBounds(whole);
  for (const [name, fragment] of [
    ["a", major],
    ["b", minor],
  ] as const) {
    const shiftX =
      fragment.metrics.contactOffsetX - whole.metrics.contactOffsetX;
    const shiftZ =
      fragment.metrics.contactOffsetZ - whole.metrics.contactOffsetZ;
    for (let index = 0; index < fragment.positions.length; index += 3) {
      const x = fragment.positions[index] + shiftX;
      const y = fragment.positions[index + 1];
      const z = fragment.positions[index + 2] + shiftZ;
      assert(
        x >= bounds.minimumX - ENVELOPE_EPSILON &&
          x <= bounds.maximumX + ENVELOPE_EPSILON &&
          y >= bounds.minimumY - ENVELOPE_EPSILON &&
          y <= bounds.maximumY + ENVELOPE_EPSILON &&
          z >= bounds.minimumZ - ENVELOPE_EPSILON &&
          z <= bounds.maximumZ + ENVELOPE_EPSILON,
        `${archetype}:${seed} fragment ${name} leaves the parent envelope at (${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)}).`,
      );
    }
  }
}

function verifyDominantFragmentShare(
  archetype: string,
  seed: number,
  parent: ReturnType<typeof resolveQualityStoneRecipe>,
  fracture: NonNullable<ReturnType<typeof resolveStoneFragmentRecipe>["fracture"]>,
): void {
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (const face of buildStonePolyhedron(parent, false)) {
    for (const point of face.points) {
      const support =
        fracture.nx * point.x +
        fracture.ny * point.y +
        fracture.nz * point.z;
      minimum = Math.min(minimum, support);
      maximum = Math.max(maximum, support);
    }
  }
  assert(maximum > minimum, `${archetype}:${seed} has no fracture extent.`);
  const share = (fracture.constant - minimum) / (maximum - minimum);
  assert(
    share >= MINIMUM_DOMINANT_SHARE && share <= MAXIMUM_DOMINANT_SHARE,
    `${archetype}:${seed} dominant fragment share ${share.toFixed(3)} is not a natural chunk break.`,
  );
}

function verifyFormationGap(
  archetype: string,
  seed: number,
  recipeA: ReturnType<typeof resolveStoneFragmentRecipe>,
  major: ReturnType<typeof generateStoneMesh>,
  minor: ReturnType<typeof generateStoneMesh>,
): void {
  const direction = resolveStoneFractureHorizontalNormal(recipeA);
  assert(direction !== undefined, `${archetype}:${seed} has no horizontal break normal.`);

  for (const scale of GAP_TEST_SCALES) {
    const joined = resolveStoneFormationOffset(
      major.metrics,
      minor.metrics,
      scale,
      0,
      direction,
    );
    assert(joined !== undefined, `${archetype}:${seed} has no parting direction.`);

    let previousGap = -1;
    for (const roll of GAP_TEST_ROLLS) {
      const gap = resolveStoneFormationGap(
        major.metrics,
        minor.metrics,
        scale,
        roll,
        GAP_TEST_RATIO_MIN,
        GAP_TEST_RATIO_MAX,
        GAP_TEST_MAX,
      );
      assert(
        gap + FORMATION_EPSILON >= previousGap,
        `${archetype}:${seed} aperture is not monotonic at scale ${scale}.`,
      );
      previousGap = gap;

      const footprint =
        Math.max(
          major.metrics.materialFootprintRadius,
          minor.metrics.materialFootprintRadius,
        ) * scale;
      const expected = Math.min(
        GAP_TEST_MAX,
        footprint *
          (GAP_TEST_RATIO_MIN +
            (GAP_TEST_RATIO_MAX - GAP_TEST_RATIO_MIN) * roll * roll),
      );
      assert(
        Math.abs(gap - expected) <= FORMATION_EPSILON,
        `${archetype}:${seed} aperture ${gap.toFixed(5)} differs from ${expected.toFixed(5)}.`,
      );

      const parted = resolveStoneFormationOffset(
        major.metrics,
        minor.metrics,
        scale,
        gap,
        direction,
      );
      assert(parted !== undefined, `${archetype}:${seed} failed to part.`);
      const dx = parted.x - joined.x;
      const dz = parted.z - joined.z;
      const opening = Math.hypot(dx, dz);
      assert(
        Math.abs(opening - gap) <= FORMATION_EPSILON,
        `${archetype}:${seed} opens ${opening.toFixed(5)} for ${gap.toFixed(5)} requested.`,
      );
      const tangential = Math.abs(dx * direction.z - dz * direction.x);
      assert(
        tangential <= FORMATION_EPSILON,
        `${archetype}:${seed} fracture shears sideways by ${tangential.toFixed(6)}.`,
      );
    }
  }
}

function verifyMaterialFrameContinuity(
  archetype: string,
  seed: number,
  ...meshes: readonly ReturnType<typeof generateStoneMesh>[]
): void {
  const reference = meshes[0].metrics;
  for (const mesh of meshes.slice(1)) {
    assert(
      Math.abs(mesh.metrics.materialHeight - reference.materialHeight) <=
        MATERIAL_FRAME_EPSILON &&
        Math.abs(
          mesh.metrics.materialFootprintRadius -
            reference.materialFootprintRadius,
        ) <= MATERIAL_FRAME_EPSILON,
      `${archetype}:${seed} fragment material frame differs across fragments or LODs.`,
    );
  }
}

function verifyMineralContinuity(
  archetype: string,
  seed: number,
  major: ReturnType<typeof generateStoneMesh>,
  minor: ReturnType<typeof generateStoneMesh>,
): void {
  let matches = 0;
  for (let a = 0; a < major.minerals.length; a += 1) {
    const ao = a * 3;
    const ax = major.positions[ao] + major.metrics.contactOffsetX;
    const ay = major.positions[ao + 1];
    const az = major.positions[ao + 2] + major.metrics.contactOffsetZ;
    let closest = Number.POSITIVE_INFINITY;
    let closestIndex = -1;
    for (let b = 0; b < minor.minerals.length; b += 1) {
      const bo = b * 3;
      const distance = Math.hypot(
        ax - (minor.positions[bo] + minor.metrics.contactOffsetX),
        ay - minor.positions[bo + 1],
        az - (minor.positions[bo + 2] + minor.metrics.contactOffsetZ),
      );
      if (distance < closest) {
        closest = distance;
        closestIndex = b;
      }
    }
    if (closest >= RIM_EPSILON || closestIndex < 0) continue;
    matches += 1;
    const difference = Math.abs(
      major.minerals[a] - minor.minerals[closestIndex],
    );
    assert(
      difference <= MINERAL_RIM_EPSILON,
      `${archetype}:${seed} mineral field jumps by ${difference.toFixed(3)} across a mated rim.`,
    );
  }
  assert(
    matches > 0,
    `${archetype}:${seed} has no matched generated rim vertices for mineral verification.`,
  );
}

function meshBounds(mesh: ReturnType<typeof generateStoneMesh>): {
  minimumX: number;
  minimumY: number;
  minimumZ: number;
  maximumX: number;
  maximumY: number;
  maximumZ: number;
} {
  let minimumX = Number.POSITIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;
  let minimumZ = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  let maximumZ = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < mesh.positions.length; index += 3) {
    minimumX = Math.min(minimumX, mesh.positions[index]);
    maximumX = Math.max(maximumX, mesh.positions[index]);
    minimumY = Math.min(minimumY, mesh.positions[index + 1]);
    maximumY = Math.max(maximumY, mesh.positions[index + 1]);
    minimumZ = Math.min(minimumZ, mesh.positions[index + 2]);
    maximumZ = Math.max(maximumZ, mesh.positions[index + 2]);
  }
  return { minimumX, minimumY, minimumZ, maximumX, maximumY, maximumZ };
}
