import { DoubleSide, MeshBasicNodeMaterial, type Node, type NodeBuilder } from "three/webgpu";
import { modelViewProjection, modelWorldMatrixInverse, positionLocal, subBuild, vec4 } from "three/tsl";
import type { IUniform } from "three";
import type { WorldNodeMaterialContext } from "../../render/WorldNodeMaterialContext";
import { createGrassNodeUniforms } from "../../grass/materials/GrassNearNodeInputs";
import { createGrassFoliageNodes, type GrassFoliageNodeFeatures } from "./WorldDetailFoliageNodes";

/**
 * The portable accent-foliage material.
 *
 * Like the impostor cards it lights itself in the vertex stage, so it is a
 * basic node material whose colour already carries irradiance and transmission,
 * and whose alpha carries the atlas cutout and the distance fade. It owns no
 * grass state: every uniform is read from the table
 * `WorldDetailFoliageMaterial` already writes.
 */
export class WorldDetailFoliageNodeMaterial extends MeshBasicNodeMaterial {
  private readonly inputs: ReturnType<typeof createGrassNodeUniforms>;
  private readonly world: Node<"vec3">;
  private readonly rejected: Node<"float">;

  constructor(name: string, values: Record<string, IUniform>, features: GrassFoliageNodeFeatures,
    speciesWind: ArrayLike<number>, context: WorldNodeMaterialContext) {
    super();
    this.name = name;
    this.side = DoubleSide;
    this.transparent = true;
    this.depthWrite = false;
    this.depthTest = true;
    this.fog = true;
    this.toneMapped = true;
    const inputs = createGrassNodeUniforms(values);
    this.inputs = inputs;
    try {
      const sun = context.directionalSurfaceLight();
      const graph = createGrassFoliageNodes(inputs, features, {
        irradiance: normal => context.vertexIrradiance(normal),
        sunDirection: sun.direction,
      }, speciesWind);
      this.world = graph.worldPosition;
      this.rejected = graph.rejected;
      this.colorNode = graph.color;
      // A card the density dither rejects leaves clip space outright, exactly as
      // the shipped vertex shader's early-out does. Collapsing it to a point
      // instead would still rasterize wherever the projection put that point.
      this.vertexNode = this.rejected.greaterThan(0.5)
        .select(vec4(2, 2, 2, 1), modelViewProjection);
    } catch (error) {
      try {
        inputs.dispose();
      } catch (cleanupError) {
        console.warn("[Drusniel World] Detail foliage input cleanup failed.", cleanupError);
      }
      try {
        super.dispose();
      } catch (cleanupError) {
        console.warn("[Drusniel World] Detail foliage material cleanup failed.", cleanupError);
      }
      throw error;
    }
  }

  /**
   * The card faces the world camera, so it is resolved in world space and
   * brought back through the model transform. This also suppresses three's
   * built-in instancing, which would bind a second copy of the instance matrix
   * this material already reads.
   */
  override setupPosition(builder: NodeBuilder): Node<"vec3"> {
    const { geometry } = builder;
    if (geometry.morphAttributes.position || geometry.morphAttributes.normal) {
      throw new Error("Grass accent foliage does not support morph targets.");
    }
    positionLocal.assign(subBuild(modelWorldMatrixInverse.mul(vec4(this.world, 1)).xyz,
      "POSITION", "vec3"));
    return positionLocal;
  }

  /** Optional samplers follow their uniform; the wind field arrives after construction. */
  syncUniformTextures(): void {
    this.inputs.syncTextures();
  }

  override dispose(): void {
    this.inputs.dispose();
    super.dispose();
  }
}
