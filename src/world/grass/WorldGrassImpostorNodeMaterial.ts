import { DoubleSide, MeshBasicNodeMaterial, type Node, type NodeBuilder } from "three/webgpu";
import { modelWorldMatrixInverse, positionLocal, subBuild, vec4 } from "three/tsl";
import type { IUniform } from "three";
import type { WorldNodeMaterialContext } from "../../render/WorldNodeMaterialContext";
import { createGrassNodeUniforms } from "../../grass/materials/GrassNearNodeInputs";
import { createGrassImpostorNodes, type GrassImpostorNodeFeatures } from "./WorldGrassImpostorNodes";

/**
 * The portable far-grass card material.
 *
 * The cards light themselves in the vertex stage rather than through a lighting
 * model, exactly as the shipped shader does, so this is a basic node material
 * whose colour already carries irradiance, transmission and the palette. It
 * owns no grass state: every uniform is read from the table
 * `WorldGrassImpostorMaterial` already writes.
 */
export class WorldGrassImpostorNodeMaterial extends MeshBasicNodeMaterial {
  private readonly inputs: ReturnType<typeof createGrassNodeUniforms>;
  private readonly world: Node<"vec3">;

  constructor(name: string, values: Record<string, IUniform>, features: GrassImpostorNodeFeatures,
    context: WorldNodeMaterialContext) {
    super();
    this.name = name;
    this.side = DoubleSide;
    this.transparent = false;
    this.depthWrite = true;
    this.depthTest = true;
    this.fog = true;
    this.toneMapped = true;
    this.inputs = createGrassNodeUniforms(values);
    const sun = context.directionalSurfaceLight();
    const graph = createGrassImpostorNodes(this.inputs, features, {
      irradiance: normal => context.vertexIrradiance(normal),
      sunDirection: sun.direction,
    });
    this.world = graph.worldPosition;
    this.colorNode = graph.color;
  }

  /**
   * The card resolves its billboard in world space, since it faces the world
   * camera. Bringing that back through the model transform keeps the view
   * position, fog and clip position on the pipeline's own path, and suppresses
   * three's built-in instancing, which would otherwise bind a second copy of
   * the instance matrix this material already reads.
   */
  override setupPosition(builder: NodeBuilder): Node<"vec3"> {
    const { geometry } = builder;
    if (geometry.morphAttributes.position || geometry.morphAttributes.normal) {
      throw new Error("Grass impostor cards do not support morph targets.");
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
