import * as THREE from "three";
import type { GrassArtDirection } from "../grass/GrassArtDirection";
import { disposeResources } from "../render/ResourceDisposal";
import {
  TERRAIN_DETAIL_COLOR,
  TERRAIN_DETAIL_FRAGMENT,
  TERRAIN_DETAIL_NORMAL,
  TERRAIN_DETAIL_POSITION,
  TERRAIN_DETAIL_VERTEX,
  TERRAIN_WET_SHEEN,
} from "./TerrainMaterialShader";
import { resolveGrassPlacementGrid } from "./grass/GrassClumpLattice";
import type { WorldConfig } from "./WorldConfig";
import { TerrainSurfacePalette } from "./terrain/TerrainSurfacePalette";
import { createTerrainSurfaceUniforms } from "./terrain/TerrainSurfaceUniforms";
import { createTerrainSurfaceNoiseTexture } from "./terrain/TerrainSurfaceNoiseTexture";
import { createTerrainMacroFieldTexture } from "./terrain/TerrainMacroFieldTexture";

const MATERIAL_CACHE_KEY = "world-terrain-ecosystem-surface-v16-clump-alignment";

export class TerrainMaterialController {
  readonly material: THREE.MeshLambertMaterial;
  private readonly surfaceNoiseTexture: THREE.DataTexture;
  private readonly macroFieldTexture?: THREE.DataTexture;
  private readonly palette = new TerrainSurfacePalette();
  private readonly uniforms: Record<string, THREE.IUniform>;
  private disposed = false;

  constructor(
    config: WorldConfig,
    readonly shadows: boolean,
    /**
     * Selects how the macro ecology fields reach the fragment stage.
     *
     * Desktop evaluates them exactly, sixteen integer hashes per ground
     * fragment. Integrated GPUs commonly issue integer multiplies at a quarter
     * of their float rate, so compact reads a baked 4 m grid of the same
     * functions instead and accepts about 1.5% of resampling error for it.
     */
    private readonly compact = false,
  ) {
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    let surfaceNoiseTexture: THREE.DataTexture | undefined;
    let macroFieldTexture: THREE.DataTexture | undefined;
    try {
      surfaceNoiseTexture = createTerrainSurfaceNoiseTexture(config.seed);
      macroFieldTexture = compact
        ? createTerrainMacroFieldTexture(config.worldSize)
        : undefined;
      const nearDensity = compact
        ? config.grassNearBladesPerSquareMeterCompact
        : config.grassNearBladesPerSquareMeterDesktop;
      const basePlacementGrid = resolveGrassPlacementGrid(
        config.grassNearTileSize,
        nearDensity,
        1,
      );
      this.material = material;
      this.surfaceNoiseTexture = surfaceNoiseTexture;
      this.macroFieldTexture = macroFieldTexture;
      this.uniforms = createTerrainSurfaceUniforms({
        config,
        surfaceNoiseTexture: this.surfaceNoiseTexture,
        palette: this.palette,
        basePlacementGrid,
        macroFieldTexture,
      });
      this.configureMaterial();
    } catch (error) {
      try {
        disposeResources([material, surfaceNoiseTexture, macroFieldTexture]);
      } catch (cleanupError) {
        console.warn(
          "[Drusniel World] Terrain material construction cleanup failed.",
          cleanupError,
        );
      }
      throw error;
    }
  }

  setGrassArtDirection(direction: GrassArtDirection): void {
    if (this.disposed) {
      return;
    }
    this.palette.apply(direction);
    // Deliberately does not touch the ground's distance schedules. Deriving
    // them from the preset's near/mid distances is what put three ground terms
    // on the same two radii as three vegetation terms; the ground keeps its own
    // ranges whatever the art direction does with the grass.
    this.uniforms.uTerrainGrassTintStrength.value =
      direction.terrainGrassTintStrength;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    disposeResources([
      this.material,
      this.surfaceNoiseTexture,
      this.macroFieldTexture,
    ]);
  }

  private configureMaterial(): void {
    this.material.name = "world-terrain-material";
    this.material.dithering = true;
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>${TERRAIN_DETAIL_VERTEX}`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>${TERRAIN_DETAIL_POSITION}`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>${
            this.compact ? "\n#define TERRAIN_MACRO_FIELD_TEXTURE\n" : ""
          }${TERRAIN_DETAIL_FRAGMENT}`,
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>${TERRAIN_DETAIL_COLOR}`,
        )
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>${TERRAIN_DETAIL_NORMAL}`,
        )
        .replace(
          "vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;",
          `vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;${TERRAIN_WET_SHEEN}`,
        );
    };
    // The macro-field define changes the compiled program, so the two profiles
    // must not share a cache entry.
    this.material.customProgramCacheKey = () =>
      this.compact ? `${MATERIAL_CACHE_KEY}-macro-texture` : MATERIAL_CACHE_KEY;
    this.material.needsUpdate = true;
  }
}
