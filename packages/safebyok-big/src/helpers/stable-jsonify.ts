import stringify from 'safe-stable-stringify'
import { noJsonText } from '../refusals/throwers'

/** JSON text for `val` with every object's keys sorted by UTF-16 code unit, so equal values serialize alike on every device, whatever the locale.
 * It is safe-stable-stringify. Arrays keep their order. A value with no JSON text, as `undefined`
 * has none, refuses `unexpected_error`.
 *
 * @example stableJsonify({ two: 2, one: 1 })  // '{"one":1,"two":2}'
 */
export function stableJsonify(val: unknown): string {
  const text = stringify(val)
  if (text === undefined) { throw noJsonText() }
  return text
}
