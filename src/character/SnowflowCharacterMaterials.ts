import * as THREE from "three";
import { applyActorEnvironmentResponse } from "../render/ActorEnvironmentResponse";
import { disposeResources } from "../render/ResourceDisposal";

/**
 * The costume uses saturated jewel tones with warm trim so the player remains
 * readable against the yellow-green meadow without needing an outline. The
 * shared environment response still supplies sky rim and ground bounce.
 */
const PALETTE = Object.freeze({
  cloak: 0x9a347d,
  robe: 0x55265f,
  mantle: 0xb34b93,
  tunic: 0x7a315f,
  leather: 0x3e243f,
  skin: 0xa797b5,
  trim: 0xd1a64e,
  fur: 0xc37bb4,
  metal: 0xe6d7b7,
  hair: 0xe9e1ef,
  eye: 0xc92746,
  cloakShell: 0x76305f,
  cloakLining: 0xa6424e,
});

const SKIN_SHEEN = 0x3a2945;
const EYE_GLOW = 0xd62d4c;

export interface SnowflowCharacterMaterialSet {
  cloak: THREE.MeshStandardMaterial;
  robe: THREE.MeshStandardMaterial;
  mantle: THREE.MeshStandardMaterial;
  tunic: THREE.MeshStandardMaterial;
  leather: THREE.MeshStandardMaterial;
  skin: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  fur: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  hair: THREE.MeshStandardMaterial;
  eye: THREE.MeshStandardMaterial;
  cloakShell: THREE.MeshStandardMaterial;
  cloakLining: THREE.MeshStandardMaterial;
}

export function createSnowflowCharacterMaterials(): SnowflowCharacterMaterialSet {
  const owned: THREE.MeshStandardMaterial[] = [];
  const create = (
    color: number,
    roughness: number,
    side: THREE.Side,
    metalness = 0,
  ): THREE.MeshStandardMaterial => {
    const material = createMaterial(color, roughness, side, metalness);
    owned.push(material);
    return material;
  };

  try {
    const skin = create(PALETTE.skin, 0.74, THREE.FrontSide);
    skin.emissive.setHex(SKIN_SHEEN);
    skin.emissiveIntensity = 0.4;

    const eye = create(PALETTE.eye, 0.22, THREE.FrontSide);
    eye.emissive.setHex(EYE_GLOW);
    eye.emissiveIntensity = 1.2;

    return {
      cloak: create(PALETTE.cloak, 0.92, THREE.DoubleSide),
      robe: create(PALETTE.robe, 0.9, THREE.DoubleSide),
      mantle: create(PALETTE.mantle, 0.88, THREE.DoubleSide),
      tunic: create(PALETTE.tunic, 0.86, THREE.DoubleSide),
      leather: create(PALETTE.leather, 0.62, THREE.FrontSide),
      skin,
      trim: create(PALETTE.trim, 0.7, THREE.DoubleSide),
      fur: create(PALETTE.fur, 0.94, THREE.DoubleSide),
      metal: create(PALETTE.metal, 0.34, THREE.FrontSide, 0.55),
      hair: create(PALETTE.hair, 0.82, THREE.DoubleSide),
      eye,
      cloakShell: create(PALETTE.cloakShell, 0.94, THREE.FrontSide),
      cloakLining: create(PALETTE.cloakLining, 0.88, THREE.BackSide),
    };
  } catch (error) {
    try {
      disposeResources(owned);
    } catch (cleanupError) {
      console.warn(
        "[Drusniel World] Character material construction cleanup failed.",
        cleanupError,
      );
    }
    throw error;
  }
}

function createMaterial(
  color: number,
  roughness: number,
  side: THREE.Side,
  metalness = 0,
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    side,
  });
  try {
    applyActorEnvironmentResponse(material);
    return material;
  } catch (error) {
    try {
      disposeResources([material]);
    } catch (cleanupError) {
      console.warn(
        "[Drusniel World] Character material cleanup failed.",
        cleanupError,
      );
    }
    throw error;
  }
}
