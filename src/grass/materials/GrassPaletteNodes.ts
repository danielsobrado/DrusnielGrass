import type { Node } from "three/webgpu";
import { Fn, float, mix, smoothstep, vec3 } from "three/tsl";
import tuning from "./GrassPaletteTuning.json";

/** Shared blade/foliage palette; CPU baking continues to use resolveGrassPaletteColor. */
export const grassResolvePaletteNode = Fn(([base, tip, dry, progress, shade, dryness, rootAo, tipStrength, rootDarkening]:
  [Node<"vec3">, Node<"vec3">, Node<"vec3">, Node<"float">, Node<"float">, Node<"float">, Node<"float">, Node<"float">, Node<"float">]) => {
  const tipProfile = smoothstep(tuning.tipStart, tuning.tipEnd, progress);
  const color = mix(base, tip, tipProfile.mul(tipStrength)).toVar();
  const shadeDryness = float(tuning.shadeDrynessPivot).sub(shade).mul(tuning.shadeDrynessScale).clamp(0, tuning.shadeDrynessMaximum);
  const instanceDryness = dryness.mul(tipProfile.mul(tuning.instanceDrynessTip).add(tuning.instanceDrynessBase));
  color.assign(mix(color, dry, shadeDryness.add(instanceDryness).clamp(0, tuning.drynessMaximum)));
  const rootLight = mix(rootDarkening, 1, smoothstep(0, tuning.rootFadeEnd, progress));
  const variation = mix(tuning.shadeLightMinimum, tuning.shadeLightMaximum, shade);
  const occlusion = rootLight.mul(variation).mul(rootAo).toVar();
  color.mulAssign(occlusion);
  const contact = smoothstep(tuning.groundContactStart, tuning.groundContactEnd, progress).oneMinus();
  const ground = mix(base.mul(tuning.groundContactBaseScale), dry.mul(tuning.groundContactDryScale), dryness).mul(occlusion);
  color.assign(mix(color, ground, contact.mul(tuning.groundContactStrength)));
  const luminance = color.dot(vec3(0.2126, 0.7152, 0.0722));
  return mix(color, vec3(luminance), occlusion.oneMinus().mul(tuning.shadowDesaturation).clamp(0, 1));
});
