import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const AUDIO_DIRECTORY = resolve(REPOSITORY_ROOT, "public", "audio");
const source = (path) =>
  readFileSync(resolve(REPOSITORY_ROOT, path), "utf8").replaceAll("\r\n", "\n");
const lineCount = (path) => source(path).split("\n").length;

const failures = [];
const check = async (name, run) => {
  try {
    await run();
  } catch (error) {
    failures.push(new Error(`${name}: ${error.message}`));
  }
};

function listMp3(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listMp3(path));
    else if (entry.isFile() && entry.name.endsWith(".mp3")) files.push(path);
  }
  return files;
}

function fakeBuffer(length = 256, channels = 1) {
  return { length, numberOfChannels: channels };
}

function humanoidGait(ActorGait) {
  return new ActorGait({
    strideLengthMeters: 1.55,
    effectors: [
      { phaseOffset: 0, dutyFactor: 0.62 },
      { phaseOffset: 0.5, dutyFactor: 0.62 },
    ],
  });
}

function walkEvents(ActorGait, WorldFootContactTracker, hz, seconds, speed) {
  const gait = humanoidGait(ActorGait);
  const tracker = new WorldFootContactTracker();
  let distance = 0;
  let count = 0;
  const dt = 1 / hz;
  const sample = (overrides = {}) => ({
    gait,
    grounded: true,
    teleported: false,
    speed,
    landing: false,
    landingImpact: 0,
    airborne: false,
    copyFootPosition: (_foot, target) => {
      target.x = 0;
      target.y = 0;
      target.z = 0;
    },
    ...overrides,
  });
  gait.setFromDistance(0);
  tracker.poll(sample({ speed: 0 }));
  for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += dt) {
    distance += speed * dt;
    gait.setFromDistance(distance);
    count += tracker.poll(sample()).length;
  }
  return count;
}

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true, include: [] },
});

try {
  const catalog = await server.ssrLoadModule("/src/audio/WorldAudioCatalog.ts");
  const bankModule = await server.ssrLoadModule("/src/audio/WorldAudioBank.ts");
  const mixer = await server.ssrLoadModule("/src/audio/WorldAmbientMixer.ts");
  const voices = await server.ssrLoadModule("/src/audio/WorldAudioVoices.ts");
  const classifierModule = await server.ssrLoadModule(
    "/src/audio/WorldSurfaceClassifier.ts",
  );
  const trackerModule = await server.ssrLoadModule(
    "/src/controls/WorldFootContactTracker.ts",
  );
  const gaitModule = await server.ssrLoadModule("/src/actor/animation/ActorGait.ts");
  const tuning = await server.ssrLoadModule("/src/audio/WorldAudioTuning.ts");

  await check("catalog matches the staged 61-file bank", () => {
    assert.equal(catalog.WORLD_AUDIO_CLIPS.length, 61);
    const mp3 = listMp3(AUDIO_DIRECTORY);
    assert.equal(mp3.length, 61, `Expected 61 mp3 files, found ${mp3.length}.`);
    for (const clip of catalog.WORLD_AUDIO_CLIPS) {
      const windowsRelative = clip.id.replaceAll("/", "\\");
      assert.ok(
        existsSync(resolve(AUDIO_DIRECTORY, clip.id)) ||
          existsSync(resolve(AUDIO_DIRECTORY, windowsRelative)),
        `Missing staged clip ${clip.id}.`,
      );
      assert.ok(clip.path.startsWith("./audio/"));
    }
    assert.ok(catalog.worldFootstepClips("grass").length >= 4);
    assert.ok(catalog.worldFootstepClips("water").length >= 4);
    assert.ok(catalog.worldFootstepClips("path").every((clip) => clip.group === "stone"));
  });

  await check("decoded PCM cache evicts unreferenced LRU entries", async () => {
    const bank = new bankModule.WorldAudioBank(
      async () => fakeBuffer(1_000_000, 1),
      8_000_000,
    );
    bank.retain("ambient/forest-01.mp3");
    await bank.load("ambient/forest-01.mp3");
    await bank.load("wildlife/bird-chirp-01.mp3");
    await bank.load("wildlife/bird-chirp-02.mp3");
    assert.ok(bank.peek("ambient/forest-01.mp3"));
    assert.equal(bank.peek("wildlife/bird-chirp-01.mp3"), undefined);
    assert.ok(bank.decodedBytes <= 8_000_000);
    bank.release("ambient/forest-01.mp3");
    bank.dispose();
    assert.equal(bank.peek("ambient/forest-01.mp3"), undefined);
  });

  await check("disposed banks abort in-flight audio work without a missing warning", async () => {
    let capturedSignal;
    const warnings = [];
    const original = console.warn;
    console.warn = (...args) => warnings.push(args.join(" "));
    try {
      const bank = new bankModule.WorldAudioBank(
        async (_url, signal) => {
          capturedSignal = signal;
          await new Promise((resolvePromise) => {
            if (signal.aborted) resolvePromise();
            else signal.addEventListener("abort", resolvePromise, { once: true });
          });
          return undefined;
        },
        1024,
      );
      const loading = bank.load("wildlife/crow-01.mp3");
      bank.dispose();
      assert.equal(capturedSignal?.aborted, true);
      assert.equal(await loading, undefined);
      assert.equal(warnings.length, 0);
    } finally {
      console.warn = original;
    }
  });

  await check("missing and late clips fail silently and deterministically", async () => {
    const warnings = [];
    const original = console.warn;
    console.warn = (...args) => warnings.push(args.join(" "));
    try {
      const missing = new bankModule.WorldAudioBank(async () => undefined, 1024);
      assert.equal(await missing.load("wildlife/frog-01.mp3"), undefined);
      assert.equal(await missing.load("wildlife/frog-01.mp3"), undefined);
      assert.equal(warnings.length, 1);
      missing.dispose();
    } finally {
      console.warn = original;
    }

    let resolveDecode;
    const pending = new Promise((resolvePromise) => {
      resolveDecode = resolvePromise;
    });
    const late = new bankModule.WorldAudioBank(async () => pending, 1024);
    const loading = late.load("wildlife/crow-01.mp3");
    late.dispose();
    resolveDecode(fakeBuffer());
    assert.equal(await loading, undefined);
  });

  await check("preset fade advances while output is disabled and survives interruption", () => {
    assert.equal(tuning.WORLD_AUDIO_PRESET_FADE_SECONDS, 1.5);
    const zero = { wind: 0, rain: 0, forest: 0, wetland: 0, water: 0 };
    const rain = { wind: 0, rain: 1, forest: 0, wetland: 0, water: 0 };
    const wind = { wind: 1, rain: 0, forest: 0, wetland: 0, water: 0 };
    const voiceStub = { play: () => undefined, setGain() {}, stop() {} };
    const bank = new bankModule.WorldAudioBank(async () => fakeBuffer(), 1024 * 1024);
    const owner = new mixer.WorldAmbientMixer(bank, voiceStub);
    owner.setTarget(rain);
    owner.update(0.5, false);
    assert.ok(
      Math.abs(owner.getCurrent().rain - mixer.mixGains(zero, rain, 1 / 3).rain) <
        1e-9,
    );
    const before = owner.getFade();
    owner.follow({ wind: 0.1, rain: 0.9, forest: 0, wetland: 0, water: 0 });
    assert.equal(owner.getFade(), before);
    owner.setTarget(wind);
    owner.update(1.5, false);
    assert.ok(Math.abs(owner.getCurrent().wind - 1) < 1e-6);
    assert.ok(Math.abs(owner.getCurrent().rain) < 1e-6);
    owner.dispose();
  });

  await check("rain gain is continuous through the light-to-heavy blend", () => {
    const habitat = { meadow: 0, forest: 0, wetland: 0, water: 0 };
    const snapshot = (rainIntensity) => ({
      presetId: "greyrain",
      label: "",
      rainIntensity,
      windIntensity: 0,
      windDirectionDegrees: 0,
      windSimulationSpeed: 1,
      restBendGain: 1,
    });
    const below = mixer.ambientGainsFromWeather(snapshot(0.3499), habitat).rain;
    const above = mixer.ambientGainsFromWeather(snapshot(0.3501), habitat).rain;
    assert.ok(Math.abs(above - below) < 0.001,
      `Rain gain must not jump at a blend threshold; ${below} vs ${above}.`);
  });

  await check("voice stealing never reuses a live loop", () => {
    const slots = [
      { positional: false, playing: true, looping: true, gain: 0.1, startedAt: 1 },
      { positional: false, playing: true, looping: true, gain: 0.05, startedAt: 2 },
      { positional: true, playing: true, looping: false, gain: 0.9, startedAt: 3 },
      { positional: true, playing: true, looping: false, gain: 0.2, startedAt: 4 },
    ];
    assert.equal(voices.selectVoiceSlot(slots, false), -1);
    assert.equal(voices.selectVoiceSlot(slots, true), 3);
    slots.push({ positional: true, playing: false, looping: false, gain: 0, startedAt: 0 });
    assert.equal(voices.selectVoiceSlot(slots, true), 4);
  });

  await check("surface classifier priority is deterministic", () => {
    const hydrology = {
      waterCoverage: 0,
      waterLevel: 2,
      waterProximity: 0,
      humidityBoost: 0,
      grassMask: 1,
    };
    const ecology = {
      moisture: 0,
      fertility: 0,
      exposure: 0,
      disturbance: 0,
      rockiness: 0,
      shade: 0,
    };
    const terrain = {
      sampleHeight: () => 2,
      sampleHydrology: (_x, _z, _h, target) => Object.assign(target, hydrology),
      samplePathGrassMask: () => 1,
      sampleEcologyAt: () => ecology,
    };
    const classify = (overrides = {}, stone = 1) => {
      Object.assign(hydrology, { waterCoverage: 0, waterLevel: 2 });
      Object.assign(ecology, { shade: 0, rockiness: 0, moisture: 0 });
      terrain.samplePathGrassMask = () => 1;
      Object.assign(hydrology, overrides.hydrology ?? {});
      Object.assign(ecology, overrides.ecology ?? {});
      if (overrides.path !== undefined) terrain.samplePathGrassMask = () => overrides.path;
      return new classifierModule.WorldSurfaceClassifier(terrain, () => stone)
        .classify(0, 0, overrides.wetness ?? 0);
    };
    assert.equal(classify({ hydrology: { waterCoverage: 1, waterLevel: 2.2 } }), "water");
    assert.notEqual(classify({ hydrology: { waterCoverage: 1, waterLevel: 2 } }), "water");
    assert.equal(classify({}, 0.1), "stone");
    assert.equal(classify({ path: 0.2, wetness: 0 }), "path");
    assert.equal(classify({ path: 0.2, wetness: 0.8 }), "mud");
    assert.equal(classify({ ecology: { shade: 0.8 } }), "litter");
    assert.equal(classify({ path: 0.9, ecology: { rockiness: 0.1 } }), "grass");
  });

  await check("gait contacts are stable, landing-safe, idle-silent and teleport-safe", () => {
    const { ActorGait } = gaitModule;
    const { WorldFootContactTracker } = trackerModule;
    const thirty = walkEvents(ActorGait, WorldFootContactTracker, 30, 2, 1.4);
    const sixty = walkEvents(ActorGait, WorldFootContactTracker, 60, 2, 1.4);
    const oneTwenty = walkEvents(ActorGait, WorldFootContactTracker, 120, 2, 1.4);
    assert.ok(Math.abs(thirty - sixty) <= 1);
    assert.ok(Math.abs(sixty - oneTwenty) <= 1);
    assert.ok(thirty >= 2);
    assert.equal(walkEvents(ActorGait, WorldFootContactTracker, 60, 2, 0), 0);

    const tracker = new WorldFootContactTracker();
    const gait = humanoidGait(ActorGait);
    const base = {
      gait,
      grounded: true,
      teleported: false,
      speed: 1,
      landing: false,
      landingImpact: 0,
      airborne: false,
      copyFootPosition: (_foot, target) => {
        target.x = 1;
        target.y = 2;
        target.z = 3;
      },
    };
    assert.equal(tracker.poll(undefined).length, 0);
    assert.equal(tracker.poll({ ...base, airborne: true }).length, 0);
    gait.setFromDistance(0);
    assert.equal(tracker.poll({ ...base, landing: true, landingImpact: 0.8 }).length, 1);
    assert.equal(tracker.poll(base).length, 0);
    assert.equal(tracker.poll({ ...base, teleported: true }).length, 0);
    gait.setFromDistance(0);
    assert.equal(tracker.poll(base).length, 0);
  });

  await check("audio ownership and hardening contracts stay explicit", () => {
    const runtime = source("src/audio/WorldAudioSystem.ts");
    const bankSource = source("src/audio/WorldAudioBank.ts");
    const permission = source("src/audio/WorldAudioPermission.ts");
    const resources = source("src/audio/WorldAudioResources.ts");
    const mixerSource = source("src/audio/WorldAmbientMixer.ts");
    const voicesSource = source("src/audio/WorldAudioVoices.ts");
    const footsteps = source("src/audio/WorldFootstepAudio.ts");
    const emitters = source("src/audio/WorldSpatialEmitters.ts");
    const contacts = source("src/world/hydrology/WorldWaterContactSystem.ts");
    const app = source("src/app/WorldApp.ts");
    const character = source("src/character/SnowflowCharacter.ts");

    assert.ok(lineCount("src/audio/WorldAudioSystem.ts") <= 260);
    assert.ok(lineCount("src/audio/WorldAudioPermission.ts") <= 180);
    assert.ok(lineCount("src/audio/WorldAudioResources.ts") <= 180);

    assert.match(runtime, /new WorldAudioPermission/);
    assert.match(runtime, /isAmbientAudible\(\)/);
    assert.match(runtime, /isEffectsAudible\(\)/);
    assert.match(runtime, /waterContacts\?\.add\(/);
    assert.match(runtime, /weatherAvailable/);
    assert.match(runtime, /experience\.attach\("audio"/);
    assert.match(runtime, /if \(!this\.essentialsWarmed && \(ambientAudible \|\| effectsAudible\)\)/);

    assert.match(bankSource, /new AbortController\(\)/);
    assert.match(bankSource, /this\.abort\.abort\(\)/);
    assert.match(bankSource, /this\.decode\(entry\.clip\.path, this\.abort\.signal\)/);
    assert.match(resources, /fetch\(url, \{ signal \}\)/);
    assert.match(resources, /if \(signal\.aborted\) return undefined/);

    assert.match(permission, /sessionAudioUnlocked/);
    assert.match(permission, /context\.resume\(\)/);
    assert.match(permission, /setBusGain\("ambient"/);
    assert.match(permission, /setBusGain\("effects"/);
    assert.doesNotMatch(permission, /\.suspend\(|\.close\(/);

    assert.match(resources, /disposeAudioListener/);
    assert.match(resources, /listener\.gain\.disconnect/);
    assert.match(resources, /listener\.context\.destination/);
    assert.match(voicesSource, /slot\.audio\.gain\.disconnect\(slot\.audio\.listener\.getInput\(\)\)/);
    assert.match(voicesSource, /const hadSource = slot\.clipId !== undefined \|\| slot\.audio\.source !== null/);
    assert.match(voicesSource, /Object\.assign\(slot\.audio, \{ buffer: null, source: null \}\)/);
    assert.match(voicesSource, /bus === "effects" && next <= 0/);
    assert.match(voicesSource, /MAX_AMBIENT_VOICES = 6/);
    assert.match(voicesSource, /RESERVED_POSITIONAL_VOICES = 2/);

    assert.match(mixerSource, /rain-light-01\.mp3/);
    assert.match(mixerSource, /rain-heavy-01\.mp3/);
    assert.match(mixerSource, /loading = new Set<string>/);
    assert.match(mixerSource, /outputEnabled = true/);
    assert.doesNotMatch(mixerSource, /bank\.retain|bank\.release/);

    assert.match(footsteps, /event\.landing && surface === "water"/);
    assert.match(footsteps, /WORLD_AUDIO_ONE_SHOT_MAX_LOAD_DELAY_MS/);
    assert.doesNotMatch(footsteps, /bank\.retain/);

    assert.match(emitters, /WORLD_AUDIO_EMITTER_CELL_SIZE_METERS/);
    assert.match(emitters, /sampleWorldAudioHabitat\(this\.terrain, x, z\)/);
    assert.match(emitters, /sampleHeight\(kind, x, z\)/);
    assert.match(emitters, /this\.slots\.includes\(slot\)/);

    assert.match(contacts, /time: performance\.now\(\) \* 0\.001/);
    assert.doesNotMatch(contacts, /requestAnimationFrame|setInterval|setTimeout/);
    assert.ok(
      app.indexOf("new WorldWaterContactSystem") <
        app.indexOf("terrain = new TerrainStreamer("),
      "Water contacts must be published before streamed water materials are built.",
    );
    assert.match(app, /waterContacts,\s*compact: profile\.compact/);
    assert.match(app, /setWorldWaterContacts\(waterContacts\?\.field\)/);
    assert.match(app, /flyMode: useFlyControls/);
    assert.match(character, /consumeTeleported/);
    assert.match(character, /copyFootWorldPosition/);
    assert.match(character, /getGait\(\)/);
    assert.doesNotMatch(
      source("src/controls/WorldFootContactTracker.ts"),
      /setInterval|requestAnimationFrame/,
    );
  });
} finally {
  await server.close();
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure.message);
  throw new Error(`[world-audio] ${failures.length} check(s) failed.`);
}

console.log(
  "[world-audio] Catalog, PCM LRU, cancellation, fades, buses, surface class, gait contacts, spatial ownership and audio lifecycle verified.",
);
