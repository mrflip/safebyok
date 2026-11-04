/** Hand `err`, a throw from host code safebyok called with nobody to throw to, such as a listener, to the platform's `reportError`.
 * A browser's or Deno's shows it as an uncaught error, without ending anything. Where there is
 * none (Node, Bun), it does nothing. A `reportError` that throws is ignored.
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
