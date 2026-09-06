import * as THREE from "three";
import type { GrassArtDirection } from "../../grass/GrassArtDirection";
import {
  GRASS_BIOME_PROFILES,
  GRASS_MAX_BIOMES,
} from "../../grass/biome/GrassBiomeProfile";
import { setBalancedGrassPaletteColors } from "../../grass/materials/GrassPaletteShader";

function createColorRows(color: THREE.ColorRepresentation): THREE.Color[] {
  return Array.from(
    { length: GRASS_MAX_BIOMES },
    () => new THREE.Color(color),
  );
}

function createShadeRows(): THREE.Vector2[] {
  return Array.from(
    { length: GRASS_MAX_BIOMES },
    () => new THREE.Vector2(0.4, 0.45),
  );
}

/** Keeps terrain palette rows identical to the blade palette sources. */
export class TerrainSurfacePalette {
  readonly base = createColorRows("#2f7c35");
  readonly tip = createColorRows("#91dc63");
  readonly dry = createColorRows("#83a653");
  readonly shade = createShadeRows();

  constructor() {
    this.apply({
      baseColor: "#2f7c35",
      tipColor: "#91dc63",
      dryColor: "#83a653",
      rootDarkening: 0.38,
      tipColorStrength: 0.42,
    });
  }

  apply(
    direction: Pick<
      GrassArtDirection,
      | "baseColor"
      | "tipColor"
      | "dryColor"
      | "rootDarkening"
      | "tipColorStrength"
    >,
  ): void {
    setBalancedGrassPaletteColors(
      this.base[0],
      this.tip[0],
      this.dry[0],
      direction.baseColor,
      direction.tipColor,
      direction.dryColor,
    );
    this.shade[0].set(direction.rootDarkening, direction.tipColorStrength);

    for (let row = 1; row < GRASS_MAX_BIOMES; row += 1) {
      const profile = GRASS_BIOME_PROFILES[row];
      if (!profile || profile.paletteSource === "art") {
        this.base[row].copy(this.base[0]);
        this.tip[row].copy(this.tip[0]);
        this.dry[row].copy(this.dry[0]);
        this.shade[row].copy(this.shade[0]);
        continue;
      }
      setBalancedGrassPaletteColors(
        this.base[row],
        this.tip[row],
        this.dry[row],
        profile.baseColor,
        profile.tipColor,
        profile.dryColor,
      );
      this.shade[row].set(profile.rootDarkening, profile.tipColorStrength);
    }
  }
}
