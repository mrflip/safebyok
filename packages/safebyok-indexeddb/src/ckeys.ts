import { Ckeys, type VaultScope } from 'safebyok'

/**
 * Where each record lives on the shelf: one row per record, under a ckey built from its scope by
 * the core's `Ckeys` -- names joined on `^` -- so a read is one lookup and a vault's boxes are
 * the rows under its prefix. These ckeys are a stored contract -- a vault already written is
 * found by them -- so they are never reshaped. A key-value backend of your own keys its rows with
 * `Ckeys` too.
 */

/**
 * The key range of every box in `scope`, for a store that reads by range instead of reading
 * the whole shelf: every ckey that begins with the vault's box prefix (`Ckeys.boxPrefix`,
 * `box^acme^u1^main^`), and no other. No other vault's rows share the prefix, as no name holds
 * `^`. The range runs from the prefix up to, and not including, the prefix with its last
 * character -- the `^` -- raised by one, so a boxlabel of any character (U+FFFF among them, which
 * the floor admits) is inside it.
 *
 * @example
 *   store.getAll(boxRange(scope))  // just this vault's boxes
 */
export const boxRange = (scope: VaultScope): IDBKeyRange => {
  const prefix = Ckeys.boxPrefix(scope)
  return IDBKeyRange.bound(prefix, `${prefix.slice(0, -1)}${PastDelimiter}`, false, true)
}

/** The character just above `^`, which ends the range of every ckey beginning with a prefix. */
const PastDelimiter = String.fromCodePoint((Ckeys.Delimiter.codePointAt(0) ?? 0) + 1)
