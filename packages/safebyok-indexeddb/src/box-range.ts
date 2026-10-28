import { Scopepath, type VaultScope } from 'safebyok'

/** Each record is one row on the shelf, under the scopepath the core's `Scopepath` makes from its scope.
 * These scopepaths are a stored contract: a vault already written is found by them. A key-value
 * backend of your own files its rows under `Scopepath` too.
 */

/** The key range of every box in `scope`, and of no other row: every scopepath under `Scopepath.withinVaultScopepathPrefix`.
 *
 * @example
 *   store.getAll(boxRange(scope))  // just this vault's boxes
 */
export const boxRange = (scope: VaultScope): IDBKeyRange => {
  // No other vault's scopepath shares the prefix, as no name holds `^`. The range ends just short
  // of the prefix with its closing `^` raised by one, so a row under any text after the prefix,
  // U+FFFF among it, falls inside it.
  const prefix = Scopepath.withinVaultScopepathPrefix(scope)
  return IDBKeyRange.bound(prefix, `${prefix.slice(0, -1)}${PastDelimiter}`, false, true)
}

/** The character just above `^`, which ends the range of every scopepath beginning with a prefix. */
const PastDelimiter = String.fromCodePoint((Scopepath.Delimiter.codePointAt(0) ?? 0) + 1)
