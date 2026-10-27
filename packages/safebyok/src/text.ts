/** Text helpers the package's own modules share: a string's code points, and the one order names sort in.
 * Not the `safebyok/utils` entry point (`utils.ts`), which is for the app around a vault.
 */

/** `text` as a list of its code points, so that a surrogate pair is never parted; a lone surrogate is one.
 *
 * @example codePointsOf('a😀')        // ['a', '😀']: two, where 'a😀'.length is 3
 * @example codePointsOf('\u{D83D}')   // ['\u{D83D}']: a lone surrogate counts one
 */
export const codePointsOf = (text: string): string[] => text.match(/./gsu) ?? []

/** Two names in one order on every device: character by character, by UTF-16 code unit, never by a locale.
 *
 * @example ['b', 'B', 'a'].toSorted(byCodeUnit)   // ['B', 'a', 'b']: capitals first, as their code units are lower
 */
export const byCodeUnit = (one: string, two: string): number => {
  if (one === two) { return 0 }
  return one < two ? -1 : 1
}
