import * as THREE from "three";

export interface WorldCloudShadowDebugVisibilityState {
  terrain: boolean;
  grass: boolean;
  water: boolean;
}

export class WorldCloudShadowDebugVisibility {
  private readonly hiddenMaterials = new Map<THREE.Material, boolean>();
  private state: WorldCloudShadowDebugVisibilityState = {
    terrain: true,
    grass: true,
    water: true,
  };

  constructor(private readonly scene: THREE.Scene) {}

  update(state: WorldCloudShadowDebugVisibilityState): void {
    this.state = state;
    this.scene.traverse(this.visitObject);
  }

  dispose(): void {
    for (const [material, visible] of this.hiddenMaterials) {
      if (!material.visible) {
        material.visible = visible;
      }
    }
    this.hiddenMaterials.clear();
  }

  private readonly visitObject = (object: THREE.Object3D): void => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) {
      return;
    }
    if (Array.isArray(mesh.material)) {
      for (let index = 0; index < mesh.material.length; index += 1) {
        this.applyMaterial(mesh.material[index]);
      }
      return;
    }
    this.applyMaterial(mesh.material);
  };

  private applyMaterial(material: THREE.Material): void {
    const visible = this.resolveVisibility(material.name);
    if (visible === undefined) {
      return;
    }
    if (!visible) {
      if (!this.hiddenMaterials.has(material)) {
        this.hiddenMaterials.set(material, material.visible);
      }
      material.visible = false;
      return;
    }
    const original = this.hiddenMaterials.get(material);
    if (original === undefined) {
      return;
    }
    if (!material.visible) {
      material.visible = original;
    }
    this.hiddenMaterials.delete(material);
  }

  private resolveVisibility(name: string): boolean | undefined {
    if (name === "world-terrain-material") {
      return this.state.terrain;
    }
    if (name.startsWith("world-grass-")) {
      return this.state.grass;
    }
    if (
      name.startsWith("world-hydrology-water") ||
      name === "world-water-cascade-material"
    ) {
      return this.state.water;
    }
    return undefined;
  }
}
