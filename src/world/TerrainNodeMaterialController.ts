import { MeshLambertNodeMaterial } from "three/webgpu";
import type { DataTexture, IUniform } from "three";
import { Fn, If, max, normalView, positionViewDirection, vec3 } from "three/tsl";
import type { GrassArtDirection } from "../grass/GrassArtDirection";
import { disposeResources } from "../render/ResourceDisposal";
import type { WorldNodeMaterialContext } from "../render/WorldNodeMaterialContext";
import { worldWetColorNode } from "../render/WorldWetSurfaceNodes";
import { resolveGrassPlacementGrid } from "./grass/GrassClumpLattice";
import type { WorldConfig } from "./WorldConfig";
import { TerrainSurfacePalette } from "./terrain/TerrainSurfacePalette";
import { createTerrainSurfaceUniforms } from "./terrain/TerrainSurfaceUniforms";
import { createTerrainSurfaceNoiseTexture } from "./terrain/TerrainSurfaceNoiseTexture";
import { createTerrainMacroFieldTexture } from "./terrain/TerrainMacroFieldTexture";
import { createTerrainNodeAttributes, createTerrainNodeUniforms } from "./terrain/TerrainNodeInputs";
import { createTerrainSurfaceNodes } from "./terrain/TerrainSurfaceNodes";

/** Portable material; uses the existing terrain attributes, palette and CPU textures. */
export class TerrainNodeMaterialController {
  readonly material = new MeshLambertNodeMaterial();
  private readonly palette = new TerrainSurfacePalette();
  private readonly uniforms: Record<string, IUniform>;
  private surfaceNoiseTexture?: DataTexture;
  private macroFieldTexture?: DataTexture;
  private disposed = false;

  constructor(config: WorldConfig, readonly shadows: boolean, compact = false, context?: WorldNodeMaterialContext) {
    try {
      this.surfaceNoiseTexture = createTerrainSurfaceNoiseTexture(config.seed);
      this.macroFieldTexture = compact ? createTerrainMacroFieldTexture(config.worldSize) : undefined;
      const density = compact ? config.grassNearBladesPerSquareMeterCompact : config.grassNearBladesPerSquareMeterDesktop;
      this.uniforms = createTerrainSurfaceUniforms({ config, surfaceNoiseTexture: this.surfaceNoiseTexture,
        macroFieldTexture: this.macroFieldTexture, palette: this.palette,
        basePlacementGrid: resolveGrassPlacementGrid(config.grassNearTileSize, density, 1) });
      const u = createTerrainNodeUniforms(this.uniforms);
      const surface = createTerrainSurfaceNodes(u, createTerrainNodeAttributes(this.palette), compact);
      const worldWetness = context?.worldWetness();
      this.material.name = "world-terrain-node-material";
      this.material.colorNode = worldWetness
        ? worldWetColorNode(surface.color, worldWetness)
        : surface.color;
      this.material.normalNode = surface.normal;
      this.material.dithering = true;
      if (context) {
        context.applyTo(this.material);
        const sun = context.directionalSurfaceLight();
        const wet = worldWetness ? max(surface.wetBand, worldWetness) : surface.wetBand;
        const emissiveNode = Fn(() => {
          // Force shared normal initialization outside the wet-only branch;
          // direct lighting also consumes it on dry ground.
          const surfaceNormal = normalView.toVar();
          surfaceNormal.append();
          const sheen = vec3(0).toVar();
          If(wet.greaterThan(0.001), () => {
            const half = sun.direction.add(positionViewDirection).normalize();
            const lobe = surfaceNormal.dot(half).clamp(0, 1).pow(u.number("uTerrainWetSheenPower"));
            sheen.assign(sun.color.mul(lobe).mul(u.number("uTerrainWetSheenStrength")).mul(wet));
          });
          return sheen;
        })();
        // Runtime NodeMaterial owns emissiveNode; r185 declarations omit it.
        Object.assign(this.material, { emissiveNode });
      }
    } catch (error) {
      try { this.dispose(); } catch (cleanupError) { console.warn("Terrain node material cleanup failed.", cleanupError); }
      throw error;
    }
  }

  setGrassArtDirection(direction: GrassArtDirection): void {
    if (this.disposed) return;
    this.palette.apply(direction);
    this.uniforms.uTerrainGrassTintStrength.value = direction.terrainGrassTintStrength;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    disposeResources([this.material, this.surfaceNoiseTexture, this.macroFieldTexture]);
  }
}
