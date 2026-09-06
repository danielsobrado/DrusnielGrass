import * as THREE from "three";
import { mergeActorParts } from "../../actor/geometry/ActorPartMerge";
import { applyActorEnvironmentResponse } from "../../render/ActorEnvironmentResponse";
import {
  buildVillagerParts,
  type VillagerPartSlot,
} from "./VillagerGeometry";
import { VILLAGER_PALETTES, villagerPaletteFor } from "./VillagerPalette";

const VILLAGER_ROUGHNESS = 0.9;

export interface VillagerAssets {
  geometryFor(variant: number, slot: VillagerPartSlot): THREE.BufferGeometry;
  createMaterial(): THREE.MeshStandardMaterial;
  readonly variantCount: number;
  dispose(): void;
}

/** Shared villager geometry, one set per palette. */
class VillagerAssetLibrary implements VillagerAssets {
  readonly variantCount = VILLAGER_PALETTES.length;
  private readonly built = new Map<
    number,
    Map<VillagerPartSlot, THREE.BufferGeometry>
  >();
  private disposed = false;

  geometryFor(variant: number, slot: VillagerPartSlot): THREE.BufferGeometry {
    const geometry = this.require(variant).get(slot);
    if (geometry === undefined) {
      throw new Error(`Villager variant ${variant} has no geometry for "${slot}".`);
    }
    return geometry;
  }

  createMaterial(): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: VILLAGER_ROUGHNESS,
      metalness: 0,
    });
    try {
      applyActorEnvironmentResponse(material);
      return material;
    } catch (error) {
      material.dispose();
      throw error;
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const slots of this.built.values()) {
      disposeGeometries(slots.values());
      slots.clear();
    }
    this.built.clear();
  }

  private require(
    variant: number,
  ): Map<VillagerPartSlot, THREE.BufferGeometry> {
    if (this.disposed) {
      throw new Error("Villager assets were used after disposal.");
    }
    const key = Math.abs(Math.floor(variant)) % this.variantCount;
    const existing = this.built.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const slots = new Map<VillagerPartSlot, THREE.BufferGeometry>();
    const parts = buildVillagerParts(villagerPaletteFor(key));
    try {
      for (const [slot, list] of parts) {
        try {
          slots.set(slot, mergeActorParts(list));
        } finally {
          for (const part of list) {
            part.geometry.dispose();
          }
        }
      }
      this.built.set(key, slots);
      return slots;
    } catch (error) {
      disposeGeometries(slots.values());
      slots.clear();
      throw error;
    }
  }
}

function disposeGeometries(
  geometries: Iterable<THREE.BufferGeometry>,
): void {
  for (const geometry of geometries) {
    geometry.dispose();
  }
}

export function createVillagerAssets(): VillagerAssets {
  return new VillagerAssetLibrary();
}
