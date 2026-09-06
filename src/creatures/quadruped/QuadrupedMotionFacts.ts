/**
 * What the animal is currently paying attention to.
 *
 * Locomotion states, the head-aim stage and the secondary springs all need the
 * same two numbers, and none of them should be asking behaviour code for them
 * mid-frame. One mutable struct, written by whoever is steering the animal and
 * read by everything downstream, keeps the frame allocation-free and keeps the
 * animation layer from depending on any particular brain.
 *
 * Both values are continuous rather than boolean so a state can ease in and out
 * instead of snapping.
 */
export interface QuadrupedMotionFacts {
  /** 0 relaxed, 1 head up and watching something. */
  alert: number;
  /** 0 not feeding, 1 head down in the grass. */
  grazing: number;
  /** World-space point the animal is attending to, when `alert` is above zero. */
  attentionX: number;
  attentionY: number;
  attentionZ: number;
}

export function createQuadrupedMotionFacts(): QuadrupedMotionFacts {
  return {
    alert: 0,
    grazing: 0,
    attentionX: 0,
    attentionY: 0,
    attentionZ: 0,
  };
}

export function resetQuadrupedMotionFacts(facts: QuadrupedMotionFacts): void {
  facts.alert = 0;
  facts.grazing = 0;
  facts.attentionX = 0;
  facts.attentionY = 0;
  facts.attentionZ = 0;
}
