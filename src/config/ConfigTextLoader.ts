const CONFIG_FETCH_TIMEOUT_MS = 15_000;

/** Loads startup configuration without allowing a stalled request to block the app forever. */
export async function fetchConfigText(
  url: string,
  label: string,
): Promise<string> {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutHandle = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, CONFIG_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(
        `Unable to load ${label} from ${url}: HTTP ${response.status}.`,
      );
    }
    return await response.text();
  } catch (error) {
    if (timedOut) {
      throw new Error(
        `Unable to load ${label} from ${url}: request timed out after ${CONFIG_FETCH_TIMEOUT_MS} ms.`,
      );
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeoutHandle);
  }
}
