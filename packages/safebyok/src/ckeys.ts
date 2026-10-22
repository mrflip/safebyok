import { VaultError } from './errors'
import type { VaultScope } from './types'

/** The ckeys safebyok's key-value adapters file rows under, for an adapter of your own over a key-value store too.
 * A ckey is the row's kind, the scope, and for a box its boxlabel, joined on `^`:
 *
 *     vault^acme^u1^main
 *     box^acme^u1^main^anthropic
 *     lease^acme^u1^main
 *     device^acme^u1^main
 *
 * No two rows share a ckey, and every ckey splits back into its names. A ckey is part of what is
 * stored: rows filed under these are where every other device's copy of the package looks.
 * Each maker refuses 'bad_label' for a name holding `^`, which `NameFloor` refuses anyway.
 */

/** The character every ckey joins its parts on, which no name may hold: `^`. */
export const Delimiter = '^'

/** The ckey of `scope`'s vault props.
 *
 * @example vaultProps(scope) // 'vault^acme^u1^main'
 */
export const vaultProps = (scope: VaultScope): string => join([['kind', 'vault'], ...scopeParts(scope)])

/** The ckey of the box under `boxlabel` in `scope`.
 *
 * @example box(scope, 'anthropic')  // 'box^acme^u1^main^anthropic'
 */
export const box = (scope: VaultScope, boxlabel: string): string => join([['kind', 'box'], ...scopeParts(scope), ['boxlabel', boxlabel]])

/** The ckey of `scope`'s lease, on a device's own storage.
 *
 * @example lease(scope)  // 'lease^acme^u1^main'
 */
export const lease = (scope: VaultScope): string => join([['kind', 'lease'], ...scopeParts(scope)])

/** The ckey of `scope`'s device record, on a device's own storage.
 *
 * @example deviceRecord(scope)  // 'device^acme^u1^main'
 */
export const deviceRecord = (scope: VaultScope): string => join([['kind', 'device'], ...scopeParts(scope)])

/** The text that begins the ckey of every box in `scope` and of nothing else, for a store that lists by prefix or key range.
 *
 * @example boxPrefix(scope)  // 'box^acme^u1^main^'
 */
export const boxPrefix = (scope: VaultScope): string => `${join([['kind', 'box'], ...scopeParts(scope)])}${Delimiter}`

/** A test, for filtering a store's ckeys, that is true only for the ckeys {@link box} gives for `scope`.
 *
 * @example store.ckeys().filter(isBoxIn(scope))
 */
export const isBoxIn = (scope: VaultScope): ((ckey: unknown) => ckey is string) => {
  const prefix = boxPrefix(scope)
  return (ckey: unknown): ckey is string => typeof ckey === 'string' && ckey.startsWith(prefix)
}

/** The boxlabel a box's ckey files it under; null for text {@link box} would not give.
 *
 * @example boxlabelOf(box(scope, 'anthropic'))  // 'anthropic'
 */
export const boxlabelOf = (ckey: string): string | null => {
  const parts = ckey.split(Delimiter)
  return parts.length === BoxParts && parts[0] === 'box' ? parts[BoxParts - 1] ?? null : null
}

/** True only for the ckeys {@link lease} gives, for any scope, and false for an earlier version's.
 * On a device shelf, a row both this and {@link isDeviceRecord} reject is one this version did not write.
 *
 * @example isLease(lease(scope))           // true
 * @example isLease('unlock^acme^u1^main')  // false: an earlier version's ckey
 */
export const isLease = (ckey: unknown): ckey is string => typeof ckey === 'string' && ckey.startsWith(`lease${Delimiter}`)

/** True only for the ckeys {@link deviceRecord} gives, for any scope: an earlier version's device mark (`mark^...`) is not one.
 *
 * @example isDeviceRecord(deviceRecord(scope))    // true
 * @example isDeviceRecord(lease(scope))           // false
 */
export const isDeviceRecord = (ckey: unknown): ckey is string => typeof ckey === 'string' && ckey.startsWith(`device${Delimiter}`)

/** One part of a ckey, beside what a refusal calls it: a row's kind, or one of its names. */
type Part = readonly [said: string, part: string]

/** A box's ckey has five parts: its kind, the scope's three names, and its boxlabel. */
const BoxParts = 5

/** A scope's three names, each beside what a refusal calls it. */
const scopeParts = (scope: VaultScope): Part[] => [['applabel', scope.applabel], ['user_id', scope.user_id], ['vaultlabel', scope.vaultlabel]]

/** `part`, once it is free of `^`; refuses 'bad_label' otherwise, naming the part and quoting none of it. */
const partOf = ([said, part]: Part): string => {
  if (part.includes(Delimiter)) {
    throw new VaultError('bad_label', `That ${said} holds '${Delimiter}', which no name may hold: storage joins names on it.`)
  }
  return part
}

/** `parts` joined on `^`, each refused if it holds one. */
const join = (parts: readonly Part[]): string => parts.map((part) => partOf(part)).join(Delimiter)
