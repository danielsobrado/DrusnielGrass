import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import {
  Fn,
  attribute,
  cos,
  modelWorldMatrix,
  positionLocal,
  sin,
  smoothstep,
  vec3,
  vec4,
} from "three/tsl";
import { instanceMatrixColumns } from "../../render/InstanceMatrixNode";
import type { WorldNodeMaterialContext } from "../../render/WorldNodeMaterialContext";
import { disposeResources } from "../../render/ResourceDisposal";
import { applyWorldWetStandardMaterial } from "../../render/WorldWetSurfaceNodes";
import {
  TREE_FAR_ALPHA_TEST,
  TREE_LEAF_ALPHA_TEST,
  TREE_WIND_FAR_SCALE,
  TREE_WIND_HEIGHT_START,
  TREE_WIND_MAX_INTENSITY,
  TREE_WIND_PHASE_SPEED,
  TREE_WIND_SECONDARY_GAIN,
  TREE_WIND_SECONDARY_SPEED,
  TREE_WIND_SWAY_LOCAL,
} from "./WorldTreeTuning";

export interface WorldTreeMaterials {
  readonly bark: MeshStandardNodeMaterial;
  readonly leaves: MeshStandardNodeMaterial;
  readonly far: MeshStandardNodeMaterial;
}

export function createWorldTreeMaterials(
  atlas: THREE.Texture,
  context?: WorldNodeMaterialContext,
): WorldTreeMaterials {
  let bark: MeshStandardNodeMaterial | undefined;
  let leaves: MeshStandardNodeMaterial | undefined;
  let far: MeshStandardNodeMaterial | undefined;
  try {
    bark = new MeshStandardNodeMaterial({
      map: atlas,
      color: 0xffffff,
      roughness: 0.94,
      metalness: 0,
    });
    leaves = createLeafMaterial(atlas, TREE_LEAF_ALPHA_TEST, 1, context);
    far = createLeafMaterial(
      atlas,
      TREE_FAR_ALPHA_TEST,
      TREE_WIND_FAR_SCALE,
      context,
    );
    bindLodOpacity(bark);
    applyWorldWetStandardMaterial(bark, context);
    return Object.freeze({ bark, leaves, far });
  } catch (error) {
    try {
      disposeResources([far, leaves, bark]);
    } catch (cleanupError) {
      console.warn("[Drusniel World] Tree material cleanup failed.", cleanupError);
    }
    throw error;
  }
}

function createLeafMaterial(
  atlas: THREE.Texture,
  alphaTest: number,
  swayScale: number,
  context?: WorldNodeMaterialContext,
): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({
    map: atlas,
    color: 0xffffff,
    roughness: 0.82,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  material.transparent = false;
  material.depthWrite = true;
  material.alphaTest = alphaTest;
  material.alphaToCoverage = true;
  bindLodOpacity(material);
  const wind = context?.worldWindUniforms();
  if (wind) {
    material.positionNode = Fn((builder) => {
      const columns = instanceMatrixColumns(builder);
      const axisX = modelWorldMatrix.mul(vec4(columns[0].xyz, 0)).xyz.normalize();
      const axisZ = modelWorldMatrix.mul(vec4(columns[2].xyz, 0)).xyz.normalize();
      const directionRadians = wind.directionDegrees.mul(Math.PI / 180);
      const worldDirection = vec3(
        cos(directionRadians),
        0,
        sin(directionRadians),
      );
      const localDirection = vec3(
        worldDirection.dot(axisX),
        0,
        worldDirection.dot(axisZ),
      ).normalize();
      const phase = wind.time
        .mul(TREE_WIND_PHASE_SPEED)
        .add(attribute("treePhase", "float"));
      const wave = sin(phase).add(
        sin(phase.mul(TREE_WIND_SECONDARY_SPEED).add(0.83)).mul(
          TREE_WIND_SECONDARY_GAIN,
        ),
      );
      const height = smoothstep(TREE_WIND_HEIGHT_START, 1, positionLocal.y);
      const intensity = wind.intensity.clamp(0, TREE_WIND_MAX_INTENSITY);
      const bend = wave
        .add(wind.restBendGain.mul(0.2))
        .mul(height)
        .mul(intensity)
        .mul(TREE_WIND_SWAY_LOCAL * swayScale);
      return positionLocal.add(localDirection.mul(bend));
    })();
  }
  applyWorldWetStandardMaterial(material, context);
  return material;
}

function bindLodOpacity(material: MeshStandardNodeMaterial): void {
  material.alphaHash = true;
  material.opacityNode = attribute("treeLodOpacity", "float");
}
