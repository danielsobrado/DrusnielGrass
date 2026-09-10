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
import { WORLD_WIND_RESPONSE } from "../weather/WorldWindMath";
import {
  createBakedWorldWindNodes,
  createWorldWindFieldNodes,
} from "../weather/WorldWindNodes";
import {
  TREE_FAR_ALPHA_TEST,
  TREE_LEAF_ALPHA_TEST,
  TREE_WIND_FAR_SCALE,
  TREE_WIND_RESPONSE_VARIATION,
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
  responseScale: number,
  context?: WorldNodeMaterialContext,
): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({
    map: atlas,
    color: 0xffffff,
    roughness: 0.82,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  try {
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
        const worldRoot = modelWorldMatrix.mul(vec4(columns[3].xyz, 1)).xyz.toVar();
        const field = wind.bakedField && wind.bakedOriginXZ
          ? createBakedWorldWindNodes({
            positionXZ: worldRoot.xz,
            bakedField: wind.bakedField,
            originXZ: wind.bakedOriginXZ,
            worldSize: wind.bakedWorldSize,
            time: wind.time,
            noiseScale: wind.noiseScale,
          })
          : createWorldWindFieldNodes({
            positionXZ: worldRoot.xz,
            time: wind.time,
            directionDegrees: wind.directionDegrees,
            intensity: wind.intensity,
            noiseScale: wind.noiseScale,
          });
        const response = WORLD_WIND_RESPONSE.trees;
        const heightMeters = positionGeometry.y.max(0).mul(scaleY);
        const radialMeters = vec3(
          positionGeometry.x.mul(scaleX),
          0,
          positionGeometry.z.mul(scaleZ),
        ).length();
        const heightWeight = smoothstep(0, response.heightMeters, heightMeters);
        const outerWeight = smoothstep(0, response.outerRadius, radialMeters);
        const canopyWeight = heightWeight.mul(0.7).add(outerWeight.mul(0.3)).clamp(0, 1);
        const treeVariation = sin(attribute("treePhase", "float"))
          .mul(TREE_WIND_RESPONSE_VARIATION)
          .add(1);
        const bendMeters = field.strength
          .mul(response.bendScale * responseScale)
          .mul(canopyWeight)
          .mul(treeVariation);
        const perpendicularX = field.direction.y.negate();
        const perpendicularZ = field.direction.x;
        const flutterMeters = field.flutter
          .mul(response.flutterScale * responseScale)
          .mul(outerWeight);
        const prevailingRadians = wind.directionDegrees.mul(Math.PI / 180);
        const restMeters = wind.restBendGain
          .mul(response.bendScale * responseScale)
          .mul(canopyWeight);
        const displacementWorld = vec3(
          field.direction.x.mul(bendMeters)
            .add(perpendicularX.mul(flutterMeters))
            .add(cos(prevailingRadians).mul(restMeters)),
          0,
          field.direction.y.mul(bendMeters)
            .add(perpendicularZ.mul(flutterMeters))
            .add(sin(prevailingRadians).mul(restMeters)),
        );
        const localDisplacement = vec3(
          displacementWorld.dot(worldAxisX.div(scaleX)).div(scaleX),
          displacementWorld.dot(worldAxisY.div(scaleY)).div(scaleY),
          displacementWorld.dot(worldAxisZ.div(scaleZ)).div(scaleZ),
        );
        const deformed = positionGeometry.add(localDisplacement);
        return columns[0].xyz.mul(deformed.x)
          .add(columns[1].xyz.mul(deformed.y))
          .add(columns[2].xyz.mul(deformed.z))
          .add(columns[3].xyz);
      })();
    }
    applyWorldWetStandardMaterial(material, context);
    return material;
  } catch (error) {
    try {
      material.dispose();
    } catch (cleanupError) {
      console.warn("[Drusniel World] Tree leaf material cleanup failed.", cleanupError);
    }
    throw error;
  }
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
