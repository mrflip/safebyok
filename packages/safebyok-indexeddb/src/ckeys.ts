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
 * the whole shelf: from the vault's lockbox prefix (`joiner.boxPrefix`, `box^acme^u1^main^`) up to
 * that prefix and the highest character there is. No other vault's rows share the prefix, as no
 * name holds the delimiter, and every lockbox's ckey goes on with a character of its boxlabel,
 * which sorts below that highest character.
 *
 * @example
 *   store.getAll(boxRange(Ckeys.joiner(), scope))  // just this vault's lockboxes
 */
export const boxRange = (joiner: Ckeys.CkeyJoiner, scope: VaultScope): IDBKeyRange => {
  const prefix = joiner.boxPrefix(scope)
  return IDBKeyRange.bound(prefix, `${prefix}\u{FFFF}`)
}
