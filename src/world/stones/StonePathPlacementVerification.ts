import {
  selectPathDistance,
  selectStoneVergePath,
  stoneVergeInsideSourceNeighborhood,
  STONE_PATH_DISTANCE_PLATEAU,
} from "./StonePathPlacement";

function fail(message: string): never {
  throw new Error(`[stone-paths] ${message}`);
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    fail(message);
  }
}

export function verifyStonePathPlacement(): string {
  const mainClearance = 2.15;
  const branchClearance = 1.5;
  const reach = 14;

  const main = selectStoneVergePath(
    3,
    STONE_PATH_DISTANCE_PLATEAU,
    mainClearance,
    branchClearance,
    reach,
  );
  assert(main?.channel === "main", "Main-only path did not select main.");

  const branch = selectStoneVergePath(
    STONE_PATH_DISTANCE_PLATEAU,
    -2.4,
    mainClearance,
    branchClearance,
    reach,
  );
  assert(branch?.channel === "branch", "Branch-only path did not select branch.");

  const nearest = selectStoneVergePath(
    7,
    2.2,
    mainClearance,
    branchClearance,
    reach,
  );
  assert(
    nearest?.channel === "branch",
    "Intersecting paths did not select the nearest clearance edge.",
  );

  const none = selectStoneVergePath(
    STONE_PATH_DISTANCE_PLATEAU,
    STONE_PATH_DISTANCE_PLATEAU,
    mainClearance,
    branchClearance,
    reach,
  );
  assert(none === undefined, "Plateau-only cell selected a verge path.");

  assert(
    selectPathDistance("main", 4, -6) === 4 &&
      selectPathDistance("branch", 4, -6) === -6,
    "Selected path channel read the wrong distance component.",
  );

  assert(
    stoneVergeInsideSourceNeighborhood(8, 8, 31.9, -15.9, 16),
    "Immediate-neighbor verge root was rejected.",
  );
  assert(
    !stoneVergeInsideSourceNeighborhood(8, 8, 32, 8, 16),
    "Two-cells-away verge root was accepted.",
  );

  return "main/branch verge selection + source bounds";
}
