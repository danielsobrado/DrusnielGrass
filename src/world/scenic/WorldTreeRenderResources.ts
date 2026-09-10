import * as THREE from "three";
import type { WorldNodeMaterialContext } from "../../render/WorldNodeMaterialContext";
import { disposeResources } from "../../render/ResourceDisposal";
import {
  createWorldTreeAtlas,
  type WorldTreeAtlas,
} from "./WorldTreeAtlasFactory";
import {
  createWorldTreeFarGeometry,
  createWorldTreeFoliageGeometry,
  createWorldTreeWoodGeometry,
} from "./WorldTreeGeometryFactory";
import {
  createWorldTreeMaterials,
  type WorldTreeMaterials,
} from "./WorldTreeMaterialFactory";
import {
  WORLD_TREE_SPECIES,
  type WorldTreeSpecies,
} from "./WorldTreeTuning";

export interface WorldTreeSpeciesMeshes {
  readonly wood: THREE.InstancedMesh;
  readonly foliage: THREE.InstancedMesh;
  readonly far: THREE.InstancedMesh;
  readonly woodOpacity: THREE.InstancedBufferAttribute;
  readonly foliagePhase: THREE.InstancedBufferAttribute;
  readonly foliageOpacity: THREE.InstancedBufferAttribute;
  readonly farPhase: THREE.InstancedBufferAttribute;
  readonly farOpacity: THREE.InstancedBufferAttribute;
}

export interface WorldTreeRenderResources {
  readonly atlas: WorldTreeAtlas;
  readonly materials: WorldTreeMaterials;
  readonly species: Readonly<Record<WorldTreeSpecies, WorldTreeSpeciesMeshes>>;
}

export function createWorldTreeRenderResources(
  scene: THREE.Scene,
  maxCount: number,
  shadows: boolean,
  context?: WorldNodeMaterialContext,
): WorldTreeRenderResources {
  let atlas: WorldTreeAtlas | undefined;
  let materials: WorldTreeMaterials | undefined;
  const species = {} as Partial<Record<WorldTreeSpecies, WorldTreeSpeciesMeshes>>;
  try {
    atlas = createWorldTreeAtlas();
    materials = createWorldTreeMaterials(atlas.texture, context);
    for (const key of WORLD_TREE_SPECIES) {
      species[key] = createSpeciesMeshes(
        key,
        atlas,
        materials,
        maxCount,
        shadows,
      );
    }
    const complete = species as Record<WorldTreeSpecies, WorldTreeSpeciesMeshes>;
    scene.add(...WORLD_TREE_SPECIES.flatMap((key) => {
      const meshes = complete[key];
      return [meshes.wood, meshes.foliage, meshes.far];
    }));
    return Object.freeze({
      atlas,
      materials,
      species: Object.freeze(complete),
    });
  } catch (error) {
    try {
      disposeTreeResources(species, materials, atlas);
    } catch (cleanupError) {
      console.warn(
        "[Drusniel World] Tree construction cleanup failed.",
        cleanupError,
      );
    }
    throw error;
  }
}

export function disposeWorldTreeRenderResources(
  resources: WorldTreeRenderResources,
): void {
  disposeTreeResources(resources.species, resources.materials, resources.atlas);
}

function createSpeciesMeshes(
  species: WorldTreeSpecies,
  atlas: WorldTreeAtlas,
  materials: WorldTreeMaterials,
  maxCount: number,
  shadows: boolean,
): WorldTreeSpeciesMeshes {
  let woodGeometry: THREE.BufferGeometry | undefined;
  let foliageGeometry: THREE.BufferGeometry | undefined;
  let farGeometry: THREE.BufferGeometry | undefined;
  try {
    woodGeometry = createWorldTreeWoodGeometry(species, atlas.bark[species]);
    foliageGeometry = createWorldTreeFoliageGeometry(species, atlas.leaves[species]);
    farGeometry = createWorldTreeFarGeometry(atlas.far[species]);
    const woodOpacity = addFloatAttribute(
      woodGeometry,
      "treeLodOpacity",
      maxCount,
    );
    const foliagePhase = addFloatAttribute(
      foliageGeometry,
      "treePhase",
      maxCount,
    );
    const foliageOpacity = addFloatAttribute(
      foliageGeometry,
      "treeLodOpacity",
      maxCount,
    );
    const farPhase = addFloatAttribute(farGeometry, "treePhase", maxCount);
    const farOpacity = addFloatAttribute(
      farGeometry,
      "treeLodOpacity",
      maxCount,
    );
    const wood = createMesh(
      `world-tree-${species}-wood`,
      woodGeometry,
      materials.bark,
      maxCount,
      shadows,
      shadows,
    );
    const foliage = createMesh(
      `world-tree-${species}-foliage`,
      foliageGeometry,
      materials.leaves,
      maxCount,
      shadows,
      shadows,
    );
    const far = createMesh(
      `world-tree-${species}-far`,
      farGeometry,
      materials.far,
      maxCount,
      false,
      false,
    );
    return {
      wood,
      foliage,
      far,
      woodOpacity,
      foliagePhase,
      foliageOpacity,
      farPhase,
      farOpacity,
    };
  } catch (error) {
    try {
      disposeResources([woodGeometry, foliageGeometry, farGeometry]);
    } catch (cleanupError) {
      console.warn(
        `[Drusniel World] ${species} tree geometry cleanup failed.`,
        cleanupError,
      );
    }
    throw error;
  }
}

function createMesh(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  maxCount: number,
  castShadow: boolean,
  receiveShadow: boolean,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, maxCount);
  mesh.name = name;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}

function addFloatAttribute(
  geometry: THREE.BufferGeometry,
  name: string,
  maxCount: number,
): THREE.InstancedBufferAttribute {
  const attribute = new THREE.InstancedBufferAttribute(
    new Float32Array(maxCount),
    1,
  );
  attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute(name, attribute);
  return attribute;
}

function disposeTreeResources(
  species: Partial<Record<WorldTreeSpecies, WorldTreeSpeciesMeshes>>,
  materials?: WorldTreeMaterials,
  atlas?: WorldTreeAtlas,
): void {
  const meshes = WORLD_TREE_SPECIES.flatMap((key) => {
    const entry = species[key];
    return entry ? [entry.wood, entry.foliage, entry.far] : [];
  });
  disposeResources([
    ...meshes.map((mesh) => ({ dispose: () => mesh.removeFromParent() })),
    ...meshes.map((mesh) => mesh.geometry),
    materials?.far,
    materials?.leaves,
    materials?.bark,
    atlas?.texture,
  ]);
}
