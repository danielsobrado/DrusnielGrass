import type { RuntimeConfig, RuntimeProfile } from "./RuntimeConfig";

const COARSE_POINTER_QUERY = "(pointer: coarse)";
const MOBILE_USER_AGENT = /Android|iPhone|iPad|iPod|Mobile|Silk/i;

export function resolveRuntimeProfile(
  config: RuntimeConfig,
  override?: { compact?: boolean },
): RuntimeProfile {
  const compact =
    override?.compact ??
    (window.innerWidth <= config.compactMaxWidth ||
      window.matchMedia(COARSE_POINTER_QUERY).matches ||
      (navigator.maxTouchPoints > 0 &&
        MOBILE_USER_AGENT.test(navigator.userAgent)));
  const tier = compact ? config.compact : config.desktop;

  return Object.freeze({
    ...tier,
    compact,
  });
}
