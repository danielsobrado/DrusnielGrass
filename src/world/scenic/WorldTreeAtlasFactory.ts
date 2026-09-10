import * as THREE from "three";
import {
  TREE_ATLAS_ANISOTROPY,
  TREE_ATLAS_COLUMNS,
  TREE_ATLAS_ROWS,
  TREE_ATLAS_TILE_SIZE,
  TREE_ATLAS_UV_INSET_PIXELS,
  type WorldTreeSpecies,
} from "./WorldTreeTuning";
import {
  drawWorldTreeAtlas,
} from "./WorldTreeAtlasDrawing";
import { WORLD_TREE_ATLAS_TILES, type WorldTreeAtlasTile } from "./WorldTreeAtlasLayout";

export interface WorldTreeAtlasRect {
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
}

export interface WorldTreeAtlas {
  readonly texture: THREE.CanvasTexture;
  readonly bark: Readonly<Record<WorldTreeSpecies, WorldTreeAtlasRect>>;
  readonly leaves: Readonly<Record<WorldTreeSpecies, WorldTreeAtlasRect>>;
  readonly far: Readonly<Record<WorldTreeSpecies, WorldTreeAtlasRect>>;
}

export function createWorldTreeAtlas(): WorldTreeAtlas {
  const canvas = document.createElement("canvas");
  canvas.width = TREE_ATLAS_COLUMNS * TREE_ATLAS_TILE_SIZE;
  canvas.height = TREE_ATLAS_ROWS * TREE_ATLAS_TILE_SIZE;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Tree atlas requires a 2D canvas context.");
  }
  drawWorldTreeAtlas(context);

  const texture = new THREE.CanvasTexture(canvas);
  texture.name = "world-tree-atlas";
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = TREE_ATLAS_ANISOTROPY;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;

  const tiles = WORLD_TREE_ATLAS_TILES;
  return Object.freeze({
    texture,
    bark: Object.freeze({
      oak: rectFor(tiles.bark),
      birch: rectFor(tiles.birchBark),
      evergreen: rectFor(tiles.bark),
    }),
    leaves: Object.freeze({
      oak: rectFor(tiles.oakLeaf),
      birch: rectFor(tiles.birchLeaf),
      evergreen: rectFor(tiles.evergreenLeaf),
    }),
    far: Object.freeze({
      oak: rectFor(tiles.oakFar),
      birch: rectFor(tiles.birchFar),
      evergreen: rectFor(tiles.evergreenFar),
    }),
  });
}

function rectFor(tile: WorldTreeAtlasTile): WorldTreeAtlasRect {
  const width = TREE_ATLAS_COLUMNS * TREE_ATLAS_TILE_SIZE;
  const height = TREE_ATLAS_ROWS * TREE_ATLAS_TILE_SIZE;
  const left = tile.column * TREE_ATLAS_TILE_SIZE + TREE_ATLAS_UV_INSET_PIXELS;
  const right =
    (tile.column + 1) * TREE_ATLAS_TILE_SIZE - TREE_ATLAS_UV_INSET_PIXELS;
  const top = tile.row * TREE_ATLAS_TILE_SIZE + TREE_ATLAS_UV_INSET_PIXELS;
  const bottom =
    (tile.row + 1) * TREE_ATLAS_TILE_SIZE - TREE_ATLAS_UV_INSET_PIXELS;
  return Object.freeze({
    u0: left / width,
    v0: 1 - bottom / height,
    u1: right / width,
    v1: 1 - top / height,
  });
}
