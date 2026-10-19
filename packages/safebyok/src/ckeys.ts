import { VaultError } from './errors'
import type { VaultScope } from './types'

/**
 * The ckeys safebyok's key-value adapters file rows under -- `localVaultDB`, `idbVaultDB`,
 * `idbDeviceDB` and `memoryDeviceDB`, and any adapter of your own over a key-value store: the
 * row's kind, then the scope, then (for a lockbox) its boxlabel, joined on `^`:
 *
 *     vault^acme^u1^main
 *     box^acme^u1^main^anthropic
 *     lease^acme^u1^main
 *     mark^acme^u1^main
 *
 * No name holds `^`: the floor every name is held to (`NameFloor`) refuses it, whatever a host's
 * validators admit, and each function here refuses one too (kind 'bad_label') rather than join
 * it. So no two rows ever share a ckey, and every ckey splits back into the names it was made
 * from. A row's ckey is part of what is stored: an adapter that files rows under these keeps them
 * where every other device's copy of the package looks for them.
 */

/** The character every ckey joins its parts on, which no name may hold: `^`. */
export const Delimiter = '^'

/**
 * The ckey of `scope`'s vault props.
 *
 * @example vaultProps(scope) // 'vault^acme^u1^main'
 */
export const vaultProps = (scope: VaultScope): string => join([['kind', 'vault'], ...scopeParts(scope)])

/**
 * The ckey of the lockbox under `boxlabel` in `scope`.
 *
 * @example box(scope, 'anthropic')  // 'box^acme^u1^main^anthropic'
 */
export const box = (scope: VaultScope, boxlabel: string): string => join([['kind', 'box'], ...scopeParts(scope), ['boxlabel', boxlabel]])

/**
 * The ckey of `scope`'s lease, on a device's own storage.
 *
 * @example lease(scope)  // 'lease^acme^u1^main'
 */
export const lease = (scope: VaultScope): string => join([['kind', 'lease'], ...scopeParts(scope)])

/**
 * The ckey of `scope`'s device mark, on a device's own storage.
 *
 * @example mark(scope)  // 'mark^acme^u1^main'
 */
export const mark = (scope: VaultScope): string => join([['kind', 'mark'], ...scopeParts(scope)])

/**
 * The text that begins the ckey of every lockbox in `scope`, and of nothing else safebyok
 * writes: a store that scans by prefix, or by a key range from it, lists a vault's lockboxes with
 * it. As no name holds `^`, no other vault's ckeys begin with it.
 *
 * @example boxPrefix(scope)  // 'box^acme^u1^main^'
 */
export const boxPrefix = (scope: VaultScope): string => `${join([['kind', 'box'], ...scopeParts(scope)])}${Delimiter}`

/**
 * A test for the ckeys of `scope`'s lockboxes, for filtering every ckey in a store: true for
 * each ckey {@link box} gives for `scope`, false for any other ckey safebyok writes, and false for
 * anything that is not text.
 *
 * @example store.ckeys().filter(isBoxIn(scope))
 */
export const isBoxIn = (scope: VaultScope): ((ckey: unknown) => ckey is string) => {
  const prefix = boxPrefix(scope)
  return (ckey: unknown): ckey is string => typeof ckey === 'string' && ckey.startsWith(prefix)
}

/**
 * The boxlabel a lockbox's ckey files it under, its last part: null for text {@link box} would
 * not give -- another kind's ckey, too few parts or too many, an earlier version's ckey.
 *
 * @example boxlabelOf(box(scope, 'anthropic'))  // 'anthropic'
 */
export const boxlabelOf = (ckey: string): string | null => {
  const parts = ckey.split(Delimiter)
  return parts.length === BoxParts && parts[0] === 'box' ? parts[BoxParts - 1] ?? null : null
}

/**
 * True for each ckey {@link lease} gives, for any scope, false for any other ckey safebyok writes
 * or wrote before, and false for anything that is not text. On a device shelf, which holds
 * leases and device marks, a row it and {@link isMark} both refuse is one this version did not
 * write.
 *
 * @example isLease(lease(scope))           // true
 * @example isLease('unlock^acme^u1^main')  // false: an earlier version's ckey
 */
export const isLease = (ckey: unknown): ckey is string => typeof ckey === 'string' && ckey.startsWith(`lease${Delimiter}`)

/**
 * True for each ckey {@link mark} gives, for any scope, false for any other ckey safebyok writes,
 * and false for anything that is not text.
 *
 * @example isMark(mark(scope))     // true
 * @example isMark(lease(scope))    // false
 */
export const isMark = (ckey: unknown): ckey is string => typeof ckey === 'string' && ckey.startsWith(`mark${Delimiter}`)

/** One part of a ckey, beside what a refusal calls it: a row's kind, or one of its names. */
type Part = readonly [said: string, part: string]

/** A lockbox's ckey has five parts: its kind, the scope's three names, and its boxlabel. */
const BoxParts = 5

/** A scope's three names, each beside what a refusal calls it. */
const scopeParts = (scope: VaultScope): Part[] => [['applabel', scope.applabel], ['user_id', scope.user_id], ['vaultlabel', scope.vaultlabel]]

/** `part`, once it is free of `^`: kind 'bad_label' otherwise, naming the part and quoting none of it. */
const partOf = ([said, part]: Part): string => {
  if (part.includes(Delimiter)) {
    throw new VaultError('bad_label', `That ${said} holds '${Delimiter}', which no name may hold: storage joins names on it.`)
  }
  return part
}

/** `parts` joined on `^`, each refused if it holds one. */
const join = (parts: readonly Part[]): string => parts.map((part) => partOf(part)).join(Delimiter)
