import { WORLD_AUDIO_PUBLIC_PREFIX } from "./WorldAudioTuning";

export type WorldAudioChannelKind = "mono" | "stereo";
export type WorldAudioClipKind =
  | "ambient"
  | "wildlife"
  | "footstep"
  | "splash"
  | "transition";
export type WorldFootstepSurface =
  | "water"
  | "stone"
  | "path"
  | "mud"
  | "litter"
  | "grass"
  | "soil";

export interface WorldAudioClip {
  readonly id: string;
  readonly path: string;
  readonly kind: WorldAudioClipKind;
  readonly channels: WorldAudioChannelKind;
  readonly group: string;
}

function clip(
  relative: string,
  kind: WorldAudioClipKind,
  channels: WorldAudioChannelKind,
  group: string,
): WorldAudioClip {
  return Object.freeze({
    id: relative,
    path: `${WORLD_AUDIO_PUBLIC_PREFIX}${relative}`,
    kind,
    channels,
    group,
  });
}

const AMBIENT = Object.freeze([
  clip("ambient/highfield-wind-01.mp3", "ambient", "stereo", "wind"),
  clip("ambient/highfield-wind-02.mp3", "ambient", "stereo", "wind"),
  clip("ambient/forest-01.mp3", "ambient", "stereo", "forest"),
  clip("ambient/wetland-01.mp3", "ambient", "stereo", "wetland"),
  clip("ambient/lake-01.mp3", "ambient", "stereo", "lake"),
  clip("ambient/rain-light-01.mp3", "ambient", "stereo", "rain-light"),
  clip("ambient/rain-medium-01.mp3", "ambient", "stereo", "rain-medium"),
  clip("ambient/rain-heavy-01.mp3", "ambient", "stereo", "rain-heavy"),
]);

const WILDLIFE = Object.freeze([
  clip("wildlife/bird-chirp-01.mp3", "wildlife", "mono", "bird"),
  clip("wildlife/bird-chirp-02.mp3", "wildlife", "mono", "bird"),
  clip("wildlife/bird-chirp-03.mp3", "wildlife", "mono", "bird"),
  clip("wildlife/bird-chirp-04.mp3", "wildlife", "mono", "bird"),
  clip("wildlife/crow-01.mp3", "wildlife", "mono", "crow"),
  clip("wildlife/crows-01.mp3", "wildlife", "mono", "crow"),
  clip("wildlife/cricket-01.mp3", "wildlife", "mono", "insect"),
  clip("wildlife/cricket-02.mp3", "wildlife", "mono", "insect"),
  clip("wildlife/frog-01.mp3", "wildlife", "mono", "frog"),
  clip("wildlife/mosquito-01.mp3", "wildlife", "mono", "insect"),
]);

const FOOTSTEPS = Object.freeze([
  ...range("footsteps/grass", 8, "grass"),
  ...range("footsteps/gravel", 4, "stone"),
  ...range("footsteps/leaves", 4, "litter"),
  ...range("footsteps/mud", 8, "mud"),
  ...range("footsteps/water", 8, "water"),
]);

const SPLASHES = Object.freeze([
  clip("water/splash-01.mp3", "splash", "mono", "splash"),
  clip("water/splash-02.mp3", "splash", "mono", "splash"),
  clip("water/splash-03.mp3", "splash", "mono", "splash"),
  clip("water/splash-04.mp3", "splash", "mono", "splash"),
  clip("water/splash-05.mp3", "splash", "mono", "splash"),
  clip("water/splash-06.mp3", "splash", "mono", "splash"),
  clip("water/bubble-01.mp3", "splash", "mono", "bubble"),
  clip("water/shoreline-01.mp3", "ambient", "mono", "shore"),
]);

const TRANSITIONS = Object.freeze([
  clip("transitions/transition-light-01.mp3", "transition", "mono", "transition"),
  clip("transitions/transition-light-02.mp3", "transition", "stereo", "transition"),
  clip("transitions/transition-heavy-01.mp3", "transition", "mono", "transition"),
]);

/** Every file actually copied into `public/audio`. */
export const WORLD_AUDIO_CLIPS: readonly WorldAudioClip[] = Object.freeze([
  ...AMBIENT,
  ...WILDLIFE,
  ...FOOTSTEPS,
  ...SPLASHES,
  ...TRANSITIONS,
]);

export const WORLD_AUDIO_CLIP_BY_ID = Object.freeze(
  Object.fromEntries(WORLD_AUDIO_CLIPS.map((entry) => [entry.id, entry])),
) as Readonly<Record<string, WorldAudioClip>>;

const FOOTSTEP_SURFACE_GROUP: Readonly<Record<WorldFootstepSurface, string>> = Object.freeze({
  water: "water",
  stone: "stone",
  path: "stone",
  mud: "mud",
  litter: "litter",
  grass: "grass",
  soil: "grass",
});

export function worldAudioClip(id: string): WorldAudioClip | undefined {
  return WORLD_AUDIO_CLIP_BY_ID[id];
}

export function worldAudioGroup(kind: WorldAudioClipKind, group: string): WorldAudioClip[] {
  return WORLD_AUDIO_CLIPS.filter((entry) => entry.kind === kind && entry.group === group);
}

export function worldFootstepClips(surface: WorldFootstepSurface): WorldAudioClip[] {
  const group = FOOTSTEP_SURFACE_GROUP[surface];
  return FOOTSTEPS.filter((entry) => entry.group === group);
}

export function worldAudioPresetEssentials(): readonly WorldAudioClip[] {
  return Object.freeze([
    worldAudioClip("ambient/highfield-wind-01.mp3")!,
    worldAudioClip("ambient/rain-light-01.mp3")!,
    worldAudioClip("ambient/rain-heavy-01.mp3")!,
    worldAudioClip("transitions/transition-light-01.mp3")!,
    ...worldFootstepClips("grass").slice(0, 4),
    ...worldFootstepClips("water").slice(0, 4),
  ]);
}

function range(prefix: string, count: number, group: string): WorldAudioClip[] {
  return Array.from({ length: count }, (_, index) =>
    clip(`${prefix}-${String(index + 1).padStart(2, "0")}.mp3`, "footstep", "mono", group),
  );
}
