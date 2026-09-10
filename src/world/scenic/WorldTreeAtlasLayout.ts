export interface WorldTreeAtlasTile {
  readonly column: number;
  readonly row: number;
}

export const WORLD_TREE_ATLAS_TILES = Object.freeze({
  bark: { column: 0, row: 0 },
  oakLeaf: { column: 1, row: 0 },
  birchLeaf: { column: 2, row: 0 },
  evergreenLeaf: { column: 3, row: 0 },
  oakFar: { column: 0, row: 1 },
  birchFar: { column: 1, row: 1 },
  evergreenFar: { column: 2, row: 1 },
  birchBark: { column: 3, row: 1 },
} satisfies Record<string, WorldTreeAtlasTile>);
