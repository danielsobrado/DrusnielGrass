import type { Node, TextureNode } from "three/webgpu";
import {
  Break, Fn, If, Loop, clamp, exp, float, length, max, mix, smoothstep, sqrt, vec2, vec4,
} from "three/tsl";
import { GRASS_TRAIL_MAX_CONTACTS } from "./GrassTrailField";

/**
 * The trail update, as nodes.
 *
 * One pass does reprojection, decay and every contact, exactly as the shipped
 * fragment shader does: stamping contacts as geometry would need a draw call
 * each, while evaluating them analytically costs a bounded loop over a small
 * target. The channel meanings are unchanged — RG a unit crush direction stored
 * as `dir * 0.5 + 0.5`, B the crush amount, A contact recency — and so is the
 * neutral value (0.5, 0.5, 0, 0) a texel outside the previous square reads.
 */
export interface GrassTrailUpdateInputs {
  /**
   * The covered square's coordinate for this fragment.
   *
   * The grass materials sample the trail at `(world - centre) / coverage + 0.5`,
   * so the pass has to write each world position at exactly that coordinate.
   * The full-screen quad a node pass draws does not necessarily carry that
   * convention, which is why the caller supplies it rather than the update
   * assuming `uv()`.
   */
  squareUv: Node<"vec2">;
  /**
   * Maps a covered-square coordinate back to this pass's texture coordinate.
   *
   * The reprojection reads last frame's field at a square coordinate, and last
   * frame wrote it through the same quad convention, so the read has to be
   * mapped exactly as the write was or the feedback loop samples its own
   * output mirrored.
   */
  toTextureUv: (squareUv: Node<"vec2">) => Node<"vec2">;
  previous: TextureNode;
  center: Node<"vec2">;
  previousCenter: Node<"vec2">;
  coverage: Node<"float">;
  initialize: Node<"float">;
  delta: Node<"float">;
  recoveryRate: Node<"float">;
  recoveryFloor: Node<"float">;
  freshnessRate: Node<"float">;
  contactCount: Node<"float">;
  /** xy world position, z radius, w strength. */
  contacts: { element(index: Node<"int"> | number): Node<"vec4"> };
  /** xy travel direction, z inner radius fraction, w directional blend. */
  contactShapes: { element(index: Node<"int"> | number): Node<"vec4"> };
}

export const grassTrailUpdateNode = (inputs: GrassTrailUpdateInputs) => Fn(() => {
  const world = inputs.center.add(inputs.squareUv.sub(0.5).mul(inputs.coverage)).toVar();

  // Reproject through the scroll delta. Texels that just entered the covered
  // square have no history and read neutral.
  const previousUv = world.sub(inputs.previousCenter).div(inputs.coverage).add(0.5).toVar();
  const previous = vec4(0.5, 0.5, 0, 0).toVar();
  If(inputs.initialize.lessThan(0.5)
    .and(previousUv.x.greaterThanEqual(0)).and(previousUv.x.lessThanEqual(1))
    .and(previousUv.y.greaterThanEqual(0)).and(previousUv.y.lessThanEqual(1)), () => {
    previous.assign(inputs.previous.sample(inputs.toTextureUv(previousUv)));
  });

  const direction = previous.rg.mul(2).sub(1).toVar();
  // Exponential decay alone leaves faint crush hanging around forever, and on
  // the 8-bit fallback target it freezes outright: below roughly 0.24 the
  // per-frame decrement rounds to zero and the texel never recovers. The linear
  // floor guarantees the field returns to neutral in bounded time.
  const crush = max(float(0), previous.b.mul(exp(inputs.recoveryRate.negate().mul(inputs.delta)))
    .sub(inputs.recoveryFloor.mul(inputs.delta))).toVar();
  const freshness = max(float(0), previous.a.sub(inputs.freshnessRate.mul(inputs.delta))).toVar();

  const appliedCrush = float(0).toVar();
  const appliedDirection = vec2(0).toVar();
  Loop(GRASS_TRAIL_MAX_CONTACTS, ({ i }) => {
      If(float(i).greaterThanEqual(inputs.contactCount), () => { Break(); });
      const contact = inputs.contacts.element(i).toVar();
      const shape = inputs.contactShapes.element(i).toVar();
      const offset = world.sub(contact.xy).toVar();
      // Contacts occupy well under one percent of the trail square. Reject the
      // other texels before paying for sqrt and the smoothstep falloffs.
      const distanceSquared = offset.dot(offset).toVar();
      const radiusSquared = contact.z.mul(contact.z).toVar();
      If(distanceSquared.lessThan(radiusSquared), () => {
        const distanceToContact = sqrt(distanceSquared).toVar();
        // A disc for footfalls (inner = 0); a ring for the expanding landing pulse.
        const inner = contact.z.mul(shape.z).toVar();
        const ringMask = float(1).toVar();
        If(inner.greaterThan(0), () => {
          ringMask.assign(smoothstep(inner.mul(0.4), inner, distanceToContact));
        });
        const falloff = ringMask.mul(smoothstep(max(inner, contact.z.mul(0.25)), contact.z,
          distanceToContact).oneMinus()).toVar();
        const amount = falloff.mul(contact.w).toVar();
        If(amount.greaterThan(0), () => {
          const away = shape.xy.toVar();
          If(distanceToContact.greaterThan(1e-4), () => {
            away.assign(offset.div(distanceToContact));
          });
          const push = mix(away, shape.xy, shape.w).toVar();
          const pushLength = length(push).toVar();
          If(pushLength.greaterThan(1e-4), () => { push.assign(push.div(pushLength)); })
            .Else(() => { push.assign(away); });
          appliedDirection.addAssign(push.mul(amount));
          appliedCrush.assign(max(appliedCrush, amount));
        });
      });
    });

  If(appliedCrush.greaterThan(0), () => {
    const appliedLength = length(appliedDirection).toVar();
    const newDirection = direction.toVar();
    If(appliedLength.greaterThan(1e-4), () => {
      newDirection.assign(appliedDirection.div(appliedLength));
    });
    // A stronger contact overrides the stored lay of the grass; a weaker one
    // only nudges it, so a light brush does not undo a deep footprint.
    const authority = appliedCrush.div(max(crush, appliedCrush)).toVar();
    direction.assign(mix(direction, newDirection, clamp(authority, 0, 1)));
    const directionLength = length(direction).toVar();
    If(directionLength.greaterThan(1e-4), () => { direction.assign(direction.div(directionLength)); })
      .Else(() => { direction.assign(newDirection); });
    crush.assign(max(crush, appliedCrush));
    freshness.assign(max(freshness, appliedCrush));
  });

  return vec4(direction.mul(0.5).add(0.5), clamp(crush, 0, 1), clamp(freshness, 0, 1));
})();
