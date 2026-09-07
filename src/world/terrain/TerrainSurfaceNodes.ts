import { Fn, If, cameraPosition, cross, dFdx, dFdy, mat3, max, normalView, positionView, positionWorld, vec3 } from "three/tsl";
import type { TerrainNodeAttributes, TerrainNodeUniforms } from "./TerrainNodeInputs";
import { terrainDetailNodes } from "./TerrainDetailNodes";
import { terrainEcologyNodes } from "./TerrainEcologyNodes";
import { terrainSoilNodes } from "./TerrainSoilNodes";
import { terrainStoneContactNodes } from "./TerrainStoneContactNodes";
import { terrainFinishNodes } from "./TerrainFinishNodes";

export function createTerrainSurfaceNodes(u: TerrainNodeUniforms, a: TerrainNodeAttributes, compact: boolean) {
  // One shared fragment evaluation. Columns contain color, relief inputs and
  // finish masks respectively; consumers below name every packed component.
  const surface = Fn(() => {
    const world = positionWorld;
    const d = terrainDetailNodes(u, world, world.distance(cameraPosition));
    const e = terrainEcologyNodes(u, a, world, compact);
    const { color, coverage } = terrainSoilNodes(u, a, d, e, world);
    terrainStoneContactNodes(u, a, d, e, world, color);
    const finish = terrainFinishNodes(u, a, d, e, world, color, coverage);
    return mat3(color, vec3(finish.height, d.cliff, d.microWeight), vec3(finish.normalMask, finish.wetBand, 0));
  })().toVar();
  const color = surface.mul(vec3(1, 0, 0));
  const relief = surface.mul(vec3(0, 1, 0));
  const masks = surface.mul(vec3(0, 0, 1));
  const normalMask = masks.x;
  const wetBand = masks.y;
  const normal = Fn(() => {
    const result = normalView.toVar();
    const dx = dFdx(positionView), dy = dFdy(positionView);
    const r1 = cross(dy, result), r2 = cross(result, dx);
    const determinant = dx.dot(r1).toVar();
    const gradient = r1.mul(dFdx(relief.x)).add(r2.mul(dFdy(relief.x))).mul(determinant.sign()).toVar();
    gradient.append();
    const weight = max(relief.y, relief.z);
    If(weight.greaterThan(0.001).and(normalMask.greaterThan(0.001)).and(determinant.abs().greaterThan(1e-8)), () => {
      result.assign(result.mul(determinant.abs()).sub(gradient.mul(u.number("uTerrainNormalStrength"))
        .mul(weight).mul(normalMask).mul(0.12)).normalize());
    });
    return result;
  })();
  return { color, normal, wetBand };
}
