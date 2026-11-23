/** `maskUuid`, a UUID cut short for a table or a log line. */

/** How many characters a text must pass before `maskUuid` cuts it: the ten it keeps from the start and the two from the end. */
const KeptChars = 12

// Ten characters, then the last two: two random hex digits tell one UUID from another in all but 1 in 256 pairs.
// It checks nothing, so that logging a field never refuses.
/** A UUID cut to its first ten characters and its last two, short enough for a narrow table column or a log line.
 * A version 7 UUID's first ten characters, a `read_tc`'s among them, are most of its timestamp: they tell its time to about four seconds.
 * Any other text is cut the same way, and one of twelve characters or fewer comes back whole: it hides nothing secret.
 *
 * @example maskUuid('0195a3f2-1c4b-7e21-9a3d-5b8c2d4e6f7c')  // '0195a3f2-1…7c'
 */
export function maskUuid(text: string): string {
  if (text.length <= KeptChars) { return text }
  return `${text.slice(0, 10)}…${text.slice(-2)}`
}
