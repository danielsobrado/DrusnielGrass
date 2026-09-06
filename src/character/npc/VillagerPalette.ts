/**
 * Villager colour, chosen against the hero rather than in isolation.
 *
 * The player is a near-black violet with emissive eyes, a flared cloak and hair
 * that never stops moving. Anything standing next to that competes with it, and
 * the frame only has room for one focal figure. So these palettes are all
 * mid-tone, desaturated and earthy: warm enough to read as cloth in a green
 * meadow, dull enough that the eye passes over them and settles on the player.
 *
 * The face is deliberately a shadow rather than features. A blank face at ten
 * metres reads as a person under a hood; eyes and a mouth at ten metres read as
 * a doll, and would pull attention the villager has not earned.
 */
export interface VillagerPalette {
  readonly hood: number;
  readonly tunic: number;
  readonly belt: number;
  readonly trouser: number;
  readonly boot: number;
  readonly mitten: number;
  readonly skin: number;
  readonly faceShadow: number;
}

export const VILLAGER_PALETTES: readonly VillagerPalette[] = Object.freeze([
  // Oatmeal and ochre.
  Object.freeze({
    hood: 0xa9986f,
    tunic: 0xbead85,
    belt: 0x6d5738,
    trouser: 0x7d6c52,
    boot: 0x4b3c2a,
    mitten: 0x8a7550,
    skin: 0xb18f6f,
    faceShadow: 0x2b2317,
  }),
  // Moss and clay.
  Object.freeze({
    hood: 0x6f7a55,
    tunic: 0x8a9068,
    belt: 0x53442f,
    trouser: 0x5f5c44,
    boot: 0x3f3527,
    mitten: 0x6b6a4c,
    skin: 0xa9855f,
    faceShadow: 0x22261a,
  }),
  // Slate and wheat.
  Object.freeze({
    hood: 0x6e737d,
    tunic: 0xa9a48c,
    belt: 0x4a4a4d,
    trouser: 0x5c5f66,
    boot: 0x37373b,
    mitten: 0x74776f,
    skin: 0xbb9878,
    faceShadow: 0x1e2024,
  }),
  // Russet and linen.
  Object.freeze({
    hood: 0x8f5f47,
    tunic: 0xb6a793,
    belt: 0x5b3b2c,
    trouser: 0x6f5a4a,
    boot: 0x423024,
    mitten: 0x7d5a45,
    skin: 0xad8763,
    faceShadow: 0x2a1d16,
  }),
]);

/** Picks one palette deterministically from a hashed value. */
export function villagerPaletteFor(pick: number): VillagerPalette {
  const index = Math.abs(Math.floor(pick)) % VILLAGER_PALETTES.length;
  return VILLAGER_PALETTES[index];
}
