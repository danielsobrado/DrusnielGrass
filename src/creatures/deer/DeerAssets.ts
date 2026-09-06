import * as THREE from "three";
import { mergeActorParts } from "../../actor/geometry/ActorPartMerge";
import { applyActorEnvironmentResponse } from "../../render/ActorEnvironmentResponse";
import { buildDeerParts, type DeerPartSlot, type DeerVariant } from "./DeerGeometry";

const DEER_ROUGHNESS = 0.88;

export interface DeerAssets {
  /** The merged buffer one bone draws, shared by every deer of that variant. */
  geometryFor(variant: DeerVariant, slot: DeerPartSlot): THREE.BufferGeometry;
  /** One material per animal: same program, different coat tint. */
  createMaterial(tint: THREE.Color): THREE.MeshStandardMaterial;
  dispose(): void;
}

/**
 * The shared deer resource library.
 *
 * Ownership is split deliberately, because the two halves have different
 * lifetimes. Geometry is identical for every animal of a variant, so it is built
 * once here and every actor borrows it — an actor must never dispose it, or the
 * first deer to wander out of range takes the rest of the herd's meshes with it.
 * Materials are per-actor, because each animal carries its own coat tint, and an
 * actor does own and dispose its own.
 *
 * Per-actor materials are not per-actor shader programs: they all share one
 * cache key, so a herd of ten compiles once.
 *
 * Variants are built on first use rather than up front, so a compact device that
 * never spawns a stag never pays to build one's antlers.
 */
class DeerAssetLibrary implements DeerAssets {
  private readonly built = new Map<
    DeerVariant,
    Map<DeerPartSlot, THREE.BufferGeometry>
  >();
  private disposed = false;

  geometryFor(
    variant: DeerVariant,
    slot: DeerPartSlot,
  ): THREE.BufferGeometry {
    const geometry = this.require(variant).get(slot);
    if (geometry === undefined) {
      throw new Error(`Deer variant "${variant}" has no geometry for "${slot}".`);
    }
    return geometry;
  }

  createMaterial(tint: THREE.Color): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      color: tint,
      vertexColors: true,
      roughness: DEER_ROUGHNESS,
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
    variant: DeerVariant,
  ): Map<DeerPartSlot, THREE.BufferGeometry> {
    if (this.disposed) {
      throw new Error("Deer assets were used after disposal.");
    }
    const existing = this.built.get(variant);
    if (existing !== undefined) {
      return existing;
    }

    const slots = new Map<DeerPartSlot, THREE.BufferGeometry>();
    const parts = buildDeerParts(variant);
    try {
      for (const [slot, list] of parts) {
        try {
          slots.set(slot, mergeActorParts(list));
        } finally {
          // The primitives were only ever scaffolding for the merge.
          for (const part of list) {
            part.geometry.dispose();
          }
        }
      }
      this.built.set(variant, slots);
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

export function createDeerAssets(): DeerAssets {
  return new DeerAssetLibrary();
}
