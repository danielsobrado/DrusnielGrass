import * as THREE from "three";
import {
  WORLD_DEFAULT_HEMISPHERE_GROUND,
  WORLD_SKY_ZENITH,
} from "../app/WorldEnvironmentTuning";

/**
 * Environment response, so a figure stops reading as a cutout.
 *
 * A body standing in a bright yellow-green meadow lit only by sun and
 * hemisphere is correct in value but has no edge information, so the eye files
 * it as pasted on rather than standing there. The sky IBL fixes some of that on
 * desktop and does not exist at all on the compact profile, which is where the
 * problem is worst.
 *
 * Two terms, both cheap enough for the compact profile. A skyward rim, which is
 * genuinely what a figure under an open sky looks like: the grazing angles see
 * the sky rather than the surface, and they see it strongest on the upper
 * surfaces. And a ground bounce from below, tinted the meadow's own green, which
 * ties the figure's underside to the ground it stands on.
 *
 * The bounce is modulated by the surface's own colour rather than added flat, so
 * it stays a material response — a wash added over everything equally would just
 * grey out the darks, which is the failure mode of doing this with ambient.
 *
 * This lives outside `src/actor` because the actor layer may not import world
 * art direction, and outside `src/character` because creatures may not import
 * player code. The player, the villagers and the deer all share it, and because
 * they share one cache key they share one compiled program. Materials that
 * differ in ways three itself tracks — vertex colours, side, transparency —
 * still get their own program, because three appends this key to its own.
 */
const ACTOR_ENVIRONMENT_CACHE_KEY = "snowflow-character-environment-v1";
const RIM_COLOR = new THREE.Color(WORLD_SKY_ZENITH);
const RIM_STRENGTH = 0.5;
const RIM_POWER = 3.2;
const BOUNCE_COLOR = new THREE.Color(WORLD_DEFAULT_HEMISPHERE_GROUND);
const BOUNCE_STRENGTH = 0.35;

const ENVIRONMENT_DECLARATIONS = `
uniform vec3 uCharacterRimColor;
uniform float uCharacterRimStrength;
uniform float uCharacterRimPower;
uniform vec3 uCharacterBounceColor;
uniform float uCharacterBounceStrength;
`;

const ENVIRONMENT_OUTPUT = `
vec3 characterUpView = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
vec3 characterViewDirection = normalize(vViewPosition);
float characterRim = pow(
  1.0 - saturate(dot(normal, characterViewDirection)),
  uCharacterRimPower
);
// Upper surfaces see more sky than lower ones, so the rim is not a uniform
// outline. Without this it reads as a drawn stroke rather than as light.
float characterSkyward = saturate(dot(normal, characterUpView) * 0.5 + 0.5);
outgoingLight += uCharacterRimColor *
  (characterRim * characterSkyward * uCharacterRimStrength);
float characterBounce = saturate(-dot(normal, characterUpView));
outgoingLight += uCharacterBounceColor * diffuseColor.rgb *
  (characterBounce * uCharacterBounceStrength);
`;

/**
 * One cache key for every actor material: the injected code is identical and
 * the uniforms are shared constants, so they can all share a compiled program.
 */
export function applyActorEnvironmentResponse(
  material: THREE.MeshStandardMaterial,
): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCharacterRimColor = { value: RIM_COLOR };
    shader.uniforms.uCharacterRimStrength = { value: RIM_STRENGTH };
    shader.uniforms.uCharacterRimPower = { value: RIM_POWER };
    shader.uniforms.uCharacterBounceColor = { value: BOUNCE_COLOR };
    shader.uniforms.uCharacterBounceStrength = { value: BOUNCE_STRENGTH };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>${ENVIRONMENT_DECLARATIONS}`,
      )
      .replace(
        "vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;",
        `vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;${ENVIRONMENT_OUTPUT}`,
      );
  };
  material.customProgramCacheKey = () => ACTOR_ENVIRONMENT_CACHE_KEY;
}
