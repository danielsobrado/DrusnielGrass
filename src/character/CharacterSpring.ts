/**
 * The player's springs are the shared actor spring.
 *
 * The integrator moved to `src/actor/math` so creature secondary motion could
 * use it without reaching into player code. This alias keeps every existing
 * call site — cape, hair, skirt — reading the way it always did.
 */
export { ActorDampedSpring as CharacterSpring } from "../actor/math/ActorDampedSpring";
