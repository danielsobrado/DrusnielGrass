import {
  drawTreeBark,
  drawTreeBirchBark,
} from "./WorldTreeAtlasBarkDrawing";
import {
  drawTreeBroadLeaf,
  drawTreeEvergreen,
  drawTreeFar,
} from "./WorldTreeAtlasFoliageDrawing";
import { WORLD_TREE_ATLAS_TILES } from "./WorldTreeAtlasLayout";

export function drawWorldTreeAtlas(context: CanvasRenderingContext2D): void {
  const tiles = WORLD_TREE_ATLAS_TILES;
  drawTreeBark(context, tiles.bark);
  drawTreeBroadLeaf(context, tiles.oakLeaf, "oak");
  drawTreeBroadLeaf(context, tiles.birchLeaf, "birch");
  drawTreeEvergreen(context, tiles.evergreenLeaf);
  drawTreeFar(context, tiles.oakFar, "oak");
  drawTreeFar(context, tiles.birchFar, "birch");
  drawTreeFar(context, tiles.evergreenFar, "evergreen");
  drawTreeBirchBark(context, tiles.birchBark);
}
