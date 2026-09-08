import assert from "node:assert/strict";
import { createServer } from "vite";

/**
 * The experience layer's ownership rules, exercised against the real modules.
 *
 * Three properties matter here and none of them can be read off the source:
 * a disabled system must allocate nothing, a temporary view mode must give the
 * camera back exactly as it found it, and one optional system failing must not
 * take the others or the world with it.
 */
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true, include: [] },
});

const failures = [];
const check = async (name, run) => {
  try {
    await run();
  } catch (error) {
    failures.push(new Error(`${name}: ${error.message}`));
  }
};

/** Silences the warnings the failure paths deliberately emit. */
function withQuietWarnings(run) {
  const original = console.warn;
  console.warn = () => {};
  try {
    return run();
  } finally {
    console.warn = original;
  }
}

try {
  const { WorldExperience, WORLD_EXPERIENCE_SLOTS } =
    await server.ssrLoadModule("/src/app/WorldExperience.ts");
  const { WORLD_EXPERIENCE_DEFAULTS } =
    await server.ssrLoadModule("/src/world/experience/WorldExperienceConfig.ts");
  const { WorldViewState } = await server.ssrLoadModule("/src/runtime/WorldViewState.ts");

  const configWith = (overrides) =>
    Object.freeze({ ...WORLD_EXPERIENCE_DEFAULTS, ...overrides });

  await check("a disabled slot never calls its factory", () => {
    const experience = new WorldExperience(configWith({ rainEnabled: false }), false);
    let constructed = 0;
    const attached = experience.attach("rain", () => {
      constructed++;
      return { dispose() {} };
    });
    assert.equal(attached, false, "A disabled slot must refuse attachment.");
    assert.equal(constructed, 0, "A disabled system must not allocate anything.");
    assert.equal(experience.get("rain"), undefined);
    assert.deepEqual(experience.activeSlots(), []);
    experience.dispose();
  });

  await check("an enabled slot is constructed once and updated", () => {
    const experience = new WorldExperience(WORLD_EXPERIENCE_DEFAULTS, false);
    let updates = 0;
    let constructed = 0;
    const create = () => {
      constructed++;
      return { update: () => { updates++; }, dispose() {} };
    };
    assert.equal(experience.attach("rain", create), true);
    assert.equal(experience.attach("rain", create), false, "A slot fills once.");
    assert.equal(constructed, 1);
    experience.update(0.016);
    experience.update(0.016);
    assert.equal(updates, 2);
    experience.dispose();
  });

  await check("a system with no per-frame work is not given one", () => {
    const experience = new WorldExperience(WORLD_EXPERIENCE_DEFAULTS, false);
    experience.attach("painter", () => ({ dispose() {} }));
    assert.doesNotThrow(() => experience.update(0.016),
      "An owner without update must simply not be called.");
    experience.dispose();
  });

  await check("a failed construction disables one slot, not the experience", () => {
    const experience = new WorldExperience(WORLD_EXPERIENCE_DEFAULTS, false);
    const attached = withQuietWarnings(() =>
      experience.attach("audio", () => { throw new Error("no audio device"); }));
    assert.equal(attached, false);
    assert.equal(experience.attach("rain", () => ({ dispose() {} })), true,
      "A different optional system must still attach.");
    experience.dispose();
  });

  await check("a system that throws per frame is released, not retried", () => {
    const experience = new WorldExperience(WORLD_EXPERIENCE_DEFAULTS, false);
    let calls = 0;
    let disposed = 0;
    experience.attach("birds", () => ({
      update: () => { calls++; throw new Error("bird failure"); },
      dispose: () => { disposed++; },
    }));
    let survivors = 0;
    experience.attach("leaves", () => ({ update: () => { survivors++; }, dispose() {} }));
    withQuietWarnings(() => {
      experience.update(0.016);
      experience.update(0.016);
      experience.update(0.016);
    });
    assert.equal(calls, 1, "A failing system must not be called again.");
    assert.equal(disposed, 1, "A released system must be disposed exactly once.");
    assert.equal(survivors, 3, "The other systems keep running.");
    experience.dispose();
  });

  await check("one failed teardown does not abandon the rest", () => {
    const experience = new WorldExperience(WORLD_EXPERIENCE_DEFAULTS, false);
    let released = 0;
    experience.attach("rain", () => ({ dispose: () => { throw new Error("stuck"); } }));
    experience.attach("leaves", () => ({ dispose: () => { released++; } }));
    experience.attach("birds", () => ({ dispose: () => { released++; } }));
    withQuietWarnings(() => experience.dispose());
    assert.equal(released, 2, "Every remaining owner must still be released.");
    assert.doesNotThrow(() => experience.dispose(), "Disposal must be idempotent.");
  });

  await check("disposal stops all further work", () => {
    const experience = new WorldExperience(WORLD_EXPERIENCE_DEFAULTS, false);
    let updates = 0;
    experience.attach("rain", () => ({ update: () => { updates++; }, dispose() {} }));
    experience.dispose();
    experience.update(0.016);
    assert.equal(updates, 0);
    assert.equal(experience.attach("leaves", () => ({ dispose() {} })), false,
      "A disposed experience must not accept new systems.");
  });

  await check("every slot is gated by a flag", () => {
    for (const slot of WORLD_EXPERIENCE_SLOTS) {
      const off = new WorldExperience(configWith({ [`${slot}Enabled`]: false }), false);
      assert.equal(off.isEnabled(slot), false, `${slot} must follow its own flag.`);
      const on = new WorldExperience(WORLD_EXPERIENCE_DEFAULTS, false);
      assert.equal(on.isEnabled(slot), true, `${slot} must be on by default.`);
      off.dispose();
      on.dispose();
    }
  });

  await check("budgets follow the profile", () => {
    const desktop = new WorldExperience(WORLD_EXPERIENCE_DEFAULTS, false);
    const compact = new WorldExperience(WORLD_EXPERIENCE_DEFAULTS, true);
    assert.ok(compact.budgets.rainCount < desktop.budgets.rainCount);
    assert.ok(compact.budgets.audioVoices <= desktop.budgets.audioVoices);
    desktop.dispose();
    compact.dispose();
  });

  // --- View state -----------------------------------------------------------

  /** A controller that records what was asked of it, and in what order. */
  function createController() {
    const calls = [];
    let framing = { mode: "third-person", value: 1 };
    return {
      calls,
      setFraming: (value) => { framing = { mode: "third-person", value }; },
      getFraming: () => framing,
      setEnabled: (enabled) => calls.push(`setEnabled:${enabled}`),
      saveViewState: () => { calls.push("save"); return framing; },
      restoreViewState: (state) => { calls.push(`restore:${state.value}`); framing = state; },
      setCharacterVisible: (visible) => calls.push(`visible:${visible}`),
      getGameplayPose: (target) => ({ position: target, facing: 0 }),
      getStreamingPosition: () => ({ x: 0, y: 0, z: 0 }),
    };
  }

  await check("a temporary mode saves and restores the controller's framing", () => {
    const controller = createController();
    const view = new WorldViewState(controller, "play");
    assert.equal(view.getMode(), "play");
    assert.equal(view.isPlayerDriven(), true);

    assert.equal(view.enterTemporaryMode("tour"), true);
    assert.equal(view.getMode(), "tour");
    assert.equal(view.isPlayerDriven(), false, "A tour is not player driven.");
    // The tour moves the camera by driving the controller elsewhere.
    controller.setFraming(2);

    view.exitTemporaryMode();
    assert.equal(view.getMode(), "play", "The base mode must come back.");
    assert.equal(controller.getFraming().value, 1,
      "The framing captured on entry must be what is restored.");
    assert.ok(controller.calls.includes("restore:1"));
    // Input is re-enabled after the pose is restored, never before.
    const restoreAt = controller.calls.indexOf("restore:1");
    const enableAt = controller.calls.lastIndexOf("setEnabled:true");
    assert.ok(enableAt > restoreAt,
      "Input must be re-enabled only after the view is restored.");
  });

  await check("a second temporary mode is refused, not nested", () => {
    const view = new WorldViewState(createController(), "play");
    assert.equal(view.enterTemporaryMode("tour"), true);
    assert.equal(view.enterTemporaryMode("paint"), false,
      "Two owners restoring the same controller is a bug with no good outcome.");
    assert.equal(view.getMode(), "tour");
    view.exitTemporaryMode();
    assert.equal(view.getMode(), "play");
  });

  await check("exiting when no mode was entered does nothing", () => {
    const controller = createController();
    const view = new WorldViewState(controller, "play");
    view.exitTemporaryMode();
    assert.deepEqual(controller.calls, [], "There is nothing to restore.");
  });

  await check("a modal overlay blocks movement without changing the mode", () => {
    const controller = createController();
    const view = new WorldViewState(controller, "play");
    view.setModalOverlay(true);
    assert.equal(view.getMode(), "play", "The camera mode is untouched.");
    assert.equal(view.isPlayerDriven(), false);
    assert.ok(controller.calls.includes("setEnabled:false"));
    view.setModalOverlay(false);
    assert.equal(view.isPlayerDriven(), true);
    assert.equal(controller.calls.filter((call) => call === "save").length, 0,
      "An overlay must not save or restore a pose.");
  });

  await check("fly mode is player driven and can host a temporary mode", () => {
    const view = new WorldViewState(createController(), "fly");
    assert.equal(view.isPlayerDriven(), true);
    assert.equal(view.enterTemporaryMode("qa"), true);
    view.exitTemporaryMode();
    assert.equal(view.getMode(), "fly", "Fly must come back, not play.");
  });

  await check("disposal restores control from a temporary mode", () => {
    const controller = createController();
    const view = new WorldViewState(controller, "play");
    view.enterTemporaryMode("tour");
    view.dispose();
    assert.ok(controller.calls.includes("restore:1"),
      "Tearing down mid-tour must not leave the player without control.");
  });
} finally {
  await server.close();
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`[experience-lifecycle] ${failure.message}`);
  }
  throw new Error(`[experience-lifecycle] ${failures.length} checks failed.`);
}

console.log(
  "[experience-lifecycle] Disabled slots allocate nothing, failed systems are "
  + "isolated and released, teardown is complete and idempotent, and temporary "
  + "view modes return the camera exactly as they found it.",
);
