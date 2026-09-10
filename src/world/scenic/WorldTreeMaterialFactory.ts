import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import {
  Fn,
  attribute,
  cos,
  float,
  modelWorldMatrix,
  positionGeometry,
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
  TREE_WIND_SWAY_METERS,
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
  bindLodOpacity(material, alphaTest);
  const wind = context?.worldWindUniforms();
  if (wind) {
    material.positionNode = Fn((builder) => {
      const columns = instanceMatrixColumns(builder);
      const worldAxisX = modelWorldMatrix.mul(vec4(columns[0].xyz, 0)).xyz.toVar();
      const worldAxisY = modelWorldMatrix.mul(vec4(columns[1].xyz, 0)).xyz.toVar();
      const worldAxisZ = modelWorldMatrix.mul(vec4(columns[2].xyz, 0)).xyz.toVar();
      const scaleX = worldAxisX.length().max(0.0001).toVar();
      const scaleY = worldAxisY.length().max(0.0001).toVar();
      const scaleZ = worldAxisZ.length().max(0.0001).toVar();
      const directionRadians = wind.directionDegrees.mul(Math.PI / 180);
      const worldDirection = vec3(
        cos(directionRadians),
        0,
        sin(directionRadians),
      ).toVar();
      const localDirection = vec3(
        worldDirection.dot(worldAxisX.div(scaleX)).div(scaleX),
        worldDirection.dot(worldAxisY.div(scaleY)).div(scaleY),
        worldDirection.dot(worldAxisZ.div(scaleZ)).div(scaleZ),
      );
      const phase = wind.time
        .mul(TREE_WIND_PHASE_SPEED)
        .add(attribute("treePhase", "float"));
      const wave = sin(phase).add(
        sin(phase.mul(TREE_WIND_SECONDARY_SPEED).add(0.83)).mul(
          TREE_WIND_SECONDARY_GAIN,
        ),
      );
      const height = smoothstep(TREE_WIND_HEIGHT_START, 1, positionGeometry.y);
      const intensity = wind.intensity.clamp(0, TREE_WIND_MAX_INTENSITY);
      const bendMeters = wave
        .add(wind.restBendGain.mul(0.2))
        .mul(height)
        .mul(intensity)
        .mul(TREE_WIND_SWAY_METERS * swayScale);
      const deformed = positionGeometry.add(localDirection.mul(bendMeters));
      return columns[0].xyz.mul(deformed.x)
        .add(columns[1].xyz.mul(deformed.y))
        .add(columns[2].xyz.mul(deformed.z))
        .add(columns[3].xyz);
    })();
  }
  applyWorldWetStandardMaterial(material, context);
  return material;
}

function bindLodOpacity(
  material: MeshStandardNodeMaterial,
  alphaTest?: number,
): void {
  const lodOpacity = attribute("treeLodOpacity", "float");
  material.alphaHash = true;
  material.opacityNode = lodOpacity;
  if (alphaTest !== undefined) {
    material.alphaToCoverage = false;
    material.alphaTestNode = float(alphaTest).mul(lodOpacity);
  }
}
