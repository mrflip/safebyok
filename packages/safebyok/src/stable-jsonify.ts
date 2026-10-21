import stringify from 'safe-stable-stringify'

/** JSON text for `val` with every object's keys sorted by code point, so equal values serialize alike on every device, whatever the locale.
 * It is safe-stable-stringify. Arrays keep their order, and `undefined` comes back as `undefined`,
 * as `JSON.stringify` would answer.
 *
 * @example stableJsonify({ two: 2, one: 1 })  // '{"one":1,"two":2}'
 * @example stableJsonify([{ b: 1, a: 2 }])    // '[{"a":2,"b":1}]'
 */
export const stableJsonify = (val: unknown): string | undefined => stringify(val)
