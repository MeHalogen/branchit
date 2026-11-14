/** Polling helpers for TUI tests: wait for a condition instead of sleeping. */

export const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Poll `check` until it returns true; generous default for slow CI runners. */
export async function waitUntil(
  check: () => boolean | Promise<boolean>,
  what: string,
  timeout = 10_000,
  /** Extra context for the failure message, e.g. the last rendered frame. */
  context?: () => string,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await check()) return;
    await delay(25);
  }
  throw new Error(`Timed out waiting for ${what}${context ? `\n${context()}` : ""}`);
}

/** Wait until the last rendered frame contains `needle`. */
export async function waitForFrame(
  ui: { lastFrame: () => string | undefined },
  needle: string,
  timeout = 10_000,
): Promise<void> {
  try {
    await waitUntil(() => (ui.lastFrame() ?? "").includes(needle), `"${needle}"`, timeout);
  } catch {
    throw new Error(`Timed out waiting for "${needle}". Frame:\n${ui.lastFrame()}`);
  }
  await delay(30);
}
