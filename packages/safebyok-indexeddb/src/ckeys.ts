import type { Ckeys, VaultScope } from 'safebyok'

/**
 * Where each record lives on the shelf: one row per record, under a ckey built from its scope by
 * the core's `Ckeys` -- names joined on `^`, or the delimiter the adapter was made with -- so a
 * read is one lookup and a vault's lockboxes are the rows under its prefix. These ckeys are a
 * stored contract -- a vault already written is found by them -- so they are never reshaped. A
 * key-value backend of your own keys its rows with `Ckeys` too.
 */

/**
 * The key range of every lockbox in `scope`, for a store that reads by range instead of reading
 * the whole shelf: every ckey that begins with the vault's lockbox prefix (`joiner.boxPrefix`,
 * `box^acme^u1^main^`), and no other. No other vault's rows share the prefix, as no name holds the
 * delimiter. The range runs from the prefix up to, and not including, the prefix with its last
 * character -- the delimiter -- raised by one, so a boxlabel of any character (U+FFFF among them,
 * which the floor admits) is inside it. A delimiter of U+FFFF, the highest there is, has no
 * character above it; then no name holds U+FFFF, and the range runs up to the prefix and U+FFFF.
 *
 * @example
 *   store.getAll(boxRange(Ckeys.joiner(), scope))  // just this vault's lockboxes
 */
export const boxRange = (joiner: Ckeys.CkeyJoiner, scope: VaultScope): IDBKeyRange => {
  const prefix = joiner.boxPrefix(scope)
  // The delimiter is one UTF-16 code unit (`Ckeys.joiner` holds it so), which is its code point.
  const delimiterCode = joiner.delimiter.codePointAt(0) ?? HighestCodeUnit
  if (delimiterCode === HighestCodeUnit) { return IDBKeyRange.bound(prefix, `${prefix}\u{FFFF}`) }
  const pastPrefix = `${prefix.slice(0, -1)}${String.fromCodePoint(delimiterCode + 1)}`
  return IDBKeyRange.bound(prefix, pastPrefix, false, true)
}

/** The highest UTF-16 code unit, U+FFFF: no character of a string key sorts above it. */
const HighestCodeUnit = 0xFF_FF
