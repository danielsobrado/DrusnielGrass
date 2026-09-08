import { DoubleSide, MeshBasicNodeMaterial, type Node, type NodeBuilder } from "three/webgpu";
import { modelWorldMatrixInverse, positionLocal, subBuild, vec4 } from "three/tsl";
import type { IUniform } from "three";
import type { WorldNodeMaterialContext } from "../../render/WorldNodeMaterialContext";
import type { WorldWindUniforms } from "../weather/WorldWindUniforms";
import { createGrassNodeUniforms } from "../../grass/materials/GrassNearNodeInputs";
import { createGrassImpostorNodes, type GrassImpostorNodeFeatures } from "./WorldGrassImpostorNodes";

type GrassImpostorMaterialFeatures = Omit<GrassImpostorNodeFeatures, "cinematicWind">;

/** Portable far-grass card material driven by the controller's live uniforms. */
export class WorldGrassImpostorNodeMaterial extends MeshBasicNodeMaterial {
  private readonly inputs: ReturnType<typeof createGrassNodeUniforms>;
  private readonly world: Node<"vec3">;

  constructor(
    name: string,
    values: Record<string, IUniform>,
    features: GrassImpostorMaterialFeatures,
    context: WorldNodeMaterialContext,
    wind?: WorldWindUniforms,
  ) {
    super();
    this.name = name;
    this.side = DoubleSide;
    this.transparent = false;
    this.depthWrite = true;
    this.depthTest = true;
    this.fog = true;
    this.toneMapped = true;
    this.inputs = createGrassNodeUniforms(values);
    const sharedWind = wind ?? context.worldWindUniforms();
    const sun = context.directionalSurfaceLight();
    const graph = createGrassImpostorNodes(this.inputs, {
      ...features,
      cinematicWind: sharedWind !== undefined,
    }, {
      irradiance: normal => context.vertexIrradiance(normal),
      sunDirection: sun.direction,
    }, sharedWind);
    this.world = graph.worldPosition;
    this.colorNode = graph.color;
  }

  override setupPosition(builder: NodeBuilder): Node<"vec3"> {
    const { geometry } = builder;
    if (geometry.morphAttributes.position || geometry.morphAttributes.normal) {
      throw new Error("Grass impostor cards do not support morph targets.");
    }
    positionLocal.assign(subBuild(modelWorldMatrixInverse.mul(vec4(this.world, 1)).xyz,
      "POSITION", "vec3"));
    return positionLocal;
  }

  syncUniformTextures(): void {
    this.inputs.syncTextures();
  }

  override dispose(): void {
    this.inputs.dispose();
    super.dispose();
  }
}
