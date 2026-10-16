/**
 * Hands `err` to the platform's `reportError`, where it has one -- a browser's or Deno's, which
 * shows it as an uncaught error would be, in the console and a dev overlay, without ending
 * anything -- looked for as it is called. Where there is none (Node, Bun), it does nothing. A
 * `reportError` that throws is ignored. For a failure in code that is the host's own, such as a
 * listener, which safebyok calls but has nobody to throw to.
 *
 * @param err - What the host's code threw, as it came.
 *
 * @example try { listener() } catch (err) { reportToPlatform(err) }
 */
export const reportToPlatform = (err: unknown): void => {
  const { reportError } = globalThis as { reportError?: unknown }
  if (typeof reportError !== 'function') { return }
  try {
    reportError.call(globalThis, err)
  } catch {
    // Nothing more can be done with it.
  }
}
