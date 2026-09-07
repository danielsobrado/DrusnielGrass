import type { MeshStandardNodeMaterial, Node, NodeBuilder } from "three/webgpu";
import {
  cameraViewMatrix, diffuseColor, normalView, positionViewDirection, pow, uniform, vec4,
} from "three/tsl";
import {
  ACTOR_BOUNCE_COLOR, ACTOR_BOUNCE_STRENGTH, ACTOR_RIM_COLOR, ACTOR_RIM_POWER, ACTOR_RIM_STRENGTH,
} from "./ActorEnvironmentResponse";

/**
 * The portable actor environment response.
 *
 * Same two terms as the shipped patch and the same insertion point: the GLSL
 * adds to `outgoingLight` immediately after it is assembled from the diffuse,
 * specular and emissive totals, which is exactly what `setupOutput` receives —
 * before fog and before premultiplied alpha. Overriding that hook rather than
 * replacing `outputNode` is what keeps the addition post-lighting instead of
 * discarding the lighting entirely.
 *
 * The colours and strengths are read from the same module constants the shipped
 * path uses, through `uniform` bound to those very `Color` instances, so the
 * two responses cannot be tuned apart.
 */
const rimColor = uniform(ACTOR_RIM_COLOR, "color");
const rimStrength = uniform(ACTOR_RIM_STRENGTH);
const rimPower = uniform(ACTOR_RIM_POWER);
const bounceColor = uniform(ACTOR_BOUNCE_COLOR, "color");
const bounceStrength = uniform(ACTOR_BOUNCE_STRENGTH);

/** The light the two terms add, in the same order the GLSL adds it. */
export function actorEnvironmentResponseNode(): Node<"vec3"> {
  const upView = cameraViewMatrix.mul(vec4(0, 1, 0, 0)).xyz.normalize();
  const rim = pow(normalView.dot(positionViewDirection).clamp(0, 1).oneMinus(), rimPower);
  // Upper surfaces see more sky than lower ones, so the rim is not a uniform
  // outline. Without this it reads as a drawn stroke rather than as light.
  const skyward = normalView.dot(upView).mul(0.5).add(0.5).clamp(0, 1);
  const bounce = normalView.dot(upView).negate().clamp(0, 1);
  return rimColor.rgb.mul(rim.mul(skyward).mul(rimStrength))
    // Modulated by the surface's own colour rather than added flat, so it stays
    // a material response: a wash added over everything equally would only grey
    // out the darks, which is the failure mode of doing this with ambient.
    .add(bounceColor.rgb.mul(diffuseColor.rgb).mul(bounce.mul(bounceStrength)));
}

/**
 * Applies the response to a node material, mirroring the shipped function's
 * shape so a caller switches one import rather than restructuring how its
 * actors are built.
 */
export function applyActorEnvironmentNodeResponse(material: MeshStandardNodeMaterial): void {
  const base = material.setupOutput.bind(material);
  material.setupOutput = (builder: NodeBuilder, outputNode: Node<"vec4">) =>
    base(builder, vec4(outputNode.rgb.add(actorEnvironmentResponseNode()), outputNode.a));
}
