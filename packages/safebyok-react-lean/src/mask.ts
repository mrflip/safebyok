/** `maskOf`: a whisper's text cut down to a few of its characters, for a box's sidecar, so the user can tell one key from another without unlocking. */

import { Checkers } from 'safebyok'

// == [The mask]: MaskSchedule, DefaultMaskSchedule, maskOf, Checks

/** How much of a text {@link maskOf} shows: its first `head` characters and its last `tail`. */
export type MaskSchedule = Readonly<{
  head: number
  tail: number
}>

// A few characters show by design, so the user can tell which key they typed in: one rotated since, say.
/** The schedule {@link maskOf} uses when handed none: the first 7 characters and the last 4. */
export const DefaultMaskSchedule: MaskSchedule = Object.freeze({ head: 7, tail: 4 })

/** `text` with all but its first and last few characters hidden behind one `…`, for a box's sidecar: `sk-ant-…f00d`.
 * A text too short to hide at least as many characters as it would show shows none of them: `…`.
 * @example
 *   sidecarOf: (whisper) => ({ mask: maskOf(String(whisper['apiKey'])) })
 *   maskOf(apiKey, { head: 3, tail: 2 })   // a schedule of the host's own
 */
export function maskOf(text: string, schedule: MaskSchedule = DefaultMaskSchedule): string {
  Checks.text.parse(text)
  const { head, tail } = Checks.maskSchedule.parse(schedule)
  if (text.length < 2 * (head + tail)) { return '…' }
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`
}

/** The checks of what a host hands {@link maskOf}. */
const Checks = Checkers('bad_record', ({ obj, str, uint }) => ({
  text:         str,
  maskSchedule: obj({ head: uint, tail: uint }),
}))
// --
