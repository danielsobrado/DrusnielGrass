import type { WorldConfig } from "../WorldConfig";
import {
  registerStoneClearanceField,
  sampleStoneGrassClearance,
  setStoneClearanceField,
} from "./StoneClearance";
import type { StoneField } from "./StoneField";

function fail(message: string): never {
  throw new Error(`[stone-clearance-registration] ${message}`);
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) fail(message);
}

function createField(clearance: number): StoneField {
  return {
    sampleGrassClearance(): number {
      return clearance;
    },
  } as unknown as StoneField;
}

function createThrowingConfig(): WorldConfig {
  return {
    get worldSize(): number {
      throw new Error("Synthetic clearance cache construction failure.");
    },
    stoneCellSize: 1,
    stoneGrassClearanceFeather: 0,
  } as WorldConfig;
}

export function verifyStoneClearanceRegistration(): string {
  const firstField = createField(0.25);
  const secondField = createField(0.75);
  setStoneClearanceField(undefined);

  try {
    const first = registerStoneClearanceField(firstField);
    assert(
      sampleStoneGrassClearance(0, 0) === 0.25,
      "First owner did not become active.",
    );

    let registrationFailed = false;
    try {
      registerStoneClearanceField(secondField, createThrowingConfig());
    } catch {
      registrationFailed = true;
    }
    assert(registrationFailed, "Synthetic owned registration failure did not throw.");
    assert(
      sampleStoneGrassClearance(0, 0) === 0.25,
      "Failed owned registration disturbed the previous active field.",
    );

    let directReplacementFailed = false;
    try {
      setStoneClearanceField(secondField, createThrowingConfig());
    } catch {
      directReplacementFailed = true;
    }
    assert(
      directReplacementFailed,
      "Synthetic direct clearance replacement failure did not throw.",
    );
    assert(
      sampleStoneGrassClearance(0, 0) === 0.25,
      "Failed direct replacement discarded the previous owner stack.",
    );

    const second = registerStoneClearanceField(secondField);
    assert(
      sampleStoneGrassClearance(0, 0) === 0.75,
      "Newer owner did not replace the active field.",
    );

    second.dispose();
    assert(
      sampleStoneGrassClearance(0, 0) === 0.25,
      "Disposing the active owner did not restore the previous live owner.",
    );

    const replacement = registerStoneClearanceField(secondField);
    first.dispose();
    assert(
      sampleStoneGrassClearance(0, 0) === 0.75,
      "Disposing an inactive owner disturbed the active owner.",
    );
    replacement.dispose();
    assert(
      sampleStoneGrassClearance(0, 0) === 1,
      "Disposing the last owner did not clear stone clearance.",
    );

    const stale = registerStoneClearanceField(firstField);
    setStoneClearanceField(secondField);
    stale.dispose();
    assert(
      sampleStoneGrassClearance(0, 0) === 0.75,
      "A stale owned registration replaced a direct probe registration.",
    );

    return "transactional failure isolation + overlap restore + stale-owner isolation";
  } finally {
    setStoneClearanceField(undefined);
  }
}
