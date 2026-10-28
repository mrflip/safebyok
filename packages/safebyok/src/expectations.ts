import { revision_tok } from './shapes/fields'
import type { VaultError } from './errors'
import * as Refusals from './refusals'
import { TombstoneFormat, type VaultRecord, VaultSparse, type VaultTombstone } from './shapes/vault'
import type { BoxExpectation, BoxDelExpectation, BoxDeletion, VaultDelExpectation, VaultRecordExpectation } from './shapes/vault-db'
import type { VaultScope } from './shapes/scopes'
import * as CX from './shapes/scopes'
import { fieldOf } from './helpers'

/** The comparisons a key-value adapter makes inside its one atomic step: whether what is stored is what a write expects, and what to store or refuse.
 * Import it whole: `import { Expectations } from 'safebyok'`, then
 * `Expectations.vaultRecordMeets(stored, expected)`.
 *
 * Each compares only `vault_tok`, `gate_epoch` and `revision_tok`, on the stored row as it is,
 * unvalidated. A row too damaged to show a field fails, so nothing lands on it. Each `stored`
 * argument is the row in storage, or undefined or null for none. The expectation needs no check:
 * `VaultDB` checked it before the adapter saw it.
 *
 * A key-value adapter keeps a vault's tombstone in the row its vault record was in. Every
 * comparison here reads that row as no vault, as it holds no `vault_tok` for an expectation to
 * name: a stale writer never meets a deleted vault as one still stored.
 */

/** True when a stored row is a tombstone, the mark a deleted vault leaves in its place: judged by its `format` alone.
 * A tombstone too damaged to parse still reads as one, so it is never taken for a vault record.
 *
 * @example Expectations.isTombstone({ format: 'safebyok-tombstone-v1', vault_epoch: 3 })  // true
 */
export const isTombstone = (stored: unknown): boolean => fieldOf(stored, 'format') === TombstoneFormat

/** The row `stored` as a vault record: itself, or null for none or for a tombstone. */
const liveRecordOf = (stored: unknown): unknown => (isTombstone(stored) ? null : stored ?? null)

/** True when the stored vault record is `expected`'s vault at its gate epoch, as an update of the vault record needs (VAULTDB.md, line 3.2).
 *
 * @example Expectations.vaultRecordMeets(stored, { vault_tok: 'v1', gate_epoch: 2 })
 */
export const vaultRecordMeets = (stored: unknown, expected: VaultRecordExpectation): boolean => (
  fieldOf(stored, 'vault_tok') === expected.vault_tok
  && fieldOf(stored, 'gate_epoch') === expected.gate_epoch
)

/** The refusal an update of the vault record meets from the stored vault record, or null when it may land.
 * It is {@link Refusals.staleVaultRecord}, carrying what is stored, unless {@link vaultRecordMeets}
 * (VAULTDB.md, line 3.2).
 *
 * @example
 *   const refusal = Expectations.vaultRecordRefusalOf(stored, expected)
 *   if (refusal) { throw refusal }
 */
export const vaultRecordRefusalOf = (stored: unknown, expected: VaultRecordExpectation): VaultError | null => (
  vaultRecordMeets(stored, expected) ? null : Refusals.staleVaultRecord(liveRecordOf(stored))
)

/** True when the stored vault record is `expected`'s vault, at any epoch, as a box read, a box deletion and a box write need.
 * A vault record that shows no `gate_epoch` fails.
 *
 * @example Expectations.vaultMeets(stored, { vault_tok: 'v1' })
 */
export const vaultMeets = (stored: unknown, expected: Pick<VaultDelExpectation, 'vault_tok'>): boolean => (
  fieldOf(stored, 'vault_tok') === expected.vault_tok
  && Number.isFinite(fieldOf(stored, 'gate_epoch'))
)

/** The `vault_epoch` of a stored row, a vault record or a tombstone, as a whole number from zero: zero where the row shows none that reads so.
 * A damaged vault record can show no `vault_epoch`; its deletion still leaves a tombstone.
 */
const epochOf = (stored: unknown): number => VaultSparse.shape.vault_epoch.safeParse(fieldOf(stored, 'vault_epoch')).data ?? 0

/** The vault record an update stores over `stored`, once it has met it: `vaultRecord`, its `vault_epoch` the stored one plus one, whatever `vaultRecord` carries.
 * The store moves the counter, never the writer (VAULTDB.md, line 3.2). It hands back the type it
 * was handed, so a server holding the record in its own types (Convex's) keeps them.
 *
 * @example Expectations.vaultRecordPutOf(next, stored)   // next, its vault_epoch stored.vault_epoch + 1
 */
export const vaultRecordPutOf = <RecordT extends Pick<VaultRecord, 'vault_epoch'>>(vaultRecord: RecordT, stored: unknown): RecordT => (
  { ...vaultRecord, vault_epoch: epochOf(stored) + 1 }
)

/** The vault record a creation stores over `stored`, or null when a vault is already stored and nothing is written.
 * Over no row it is `draft`. Over a tombstone it is `draft` with the tombstone's `vault_epoch`: a
 * new life, the counter carried on (VAULTDB.md, line 3.1).
 *
 * @example
 *   const life = Expectations.newLifeOf(draft, stored)
 *   if (life) { write(life) }
 */
export const newLifeOf = <DraftT extends Pick<VaultRecord, 'vault_epoch'>>(draft: DraftT, stored: unknown): DraftT | null => {
  if (stored === null || stored === undefined) { return draft }
  return isTombstone(stored) ? { ...draft, vault_epoch: epochOf(stored) } : null
}

/** The tombstone a deletion leaves over `stored`, or null when the deletion misses and removes nothing.
 * A vault meets it by its `vault_tok` and, unless `expected.gate_epoch` is null, its `gate_epoch`;
 * the tombstone then holds the scope and the vault's `vault_epoch` plus one. A vault too damaged
 * to show its `gate_epoch` or `vault_epoch` can still be deleted by `vault_tok` alone, and counts
 * from zero. A stored tombstone meets nothing: a vault already deleted is refused as stale, as
 * it is when nothing is stored (VAULTDB.md, line 3.5).
 *
 * @example Expectations.tombstoneOf(stored, scope, { vault_tok: 'v1', gate_epoch: 2 })   // while v1 is stored at gate 2
 */
export const tombstoneOf = (stored: unknown, scope: VaultScope, expected: VaultDelExpectation): VaultTombstone | null => {
  if (fieldOf(stored, 'vault_tok') !== expected.vault_tok) { return null }
  if (expected.gate_epoch !== null && fieldOf(stored, 'gate_epoch') !== expected.gate_epoch) { return null }
  return { format: TombstoneFormat, ...CX.vaultScope.parse(scope), vault_epoch: epochOf(stored) + 1 }
}

/** The refusal a box write meets from the stored vault record and box, or null when it may land.
 * It is {@link Refusals.vaultMismatch} when the vault record is not `expected`'s vault. Else it is
 * {@link Refusals.staleBox} when the box is not at `expected.revision_tok`, or when a box is stored
 * and `expected.revision_tok` is null (VAULTDB.md, line 3.3).
 *
 * @example
 *   const refusal = Expectations.boxRefusalOf(storedVaultRecord, storedBox, expected)
 *   if (refusal) { throw refusal }
 */
export const boxRefusalOf = (storedVaultRecord: unknown, storedBox: unknown, expected: BoxExpectation): VaultError | null => {
  if (! vaultMeets(storedVaultRecord, expected)) { return Refusals.vaultMismatch() }
  const box = storedBox ?? null
  const boxMeets = box === null
    ? expected.revision_tok === null
    : expected.revision_tok !== null && fieldOf(box, 'revision_tok') === expected.revision_tok
  return boxMeets ? null : Refusals.staleBox(box)
}

/** The report a box deletion makes of `storedBox`: `deleted` at `expected`'s revision, `deleted_other` for any other row, `absent` for none.
 * It only reports: a deletion in the right vault ({@link vaultMeets}) removes whatever is stored
 * (VAULTDB.md, line 3.4). A null `expected.revision_tok` matches a row holding no `revision_tok`
 * that reads as one, as the listing shows such a damaged box.
 *
 * @example Expectations.deletionOf(storedBox, { vault_tok: 'v1', revision_tok: 'r7' })  // { outcome: 'deleted' } while r7 is stored
 */
export const deletionOf = (storedBox: unknown, expected: BoxDelExpectation): BoxDeletion => {
  if (storedBox === undefined || storedBox === null) { return { outcome: 'absent' } }
  const storedRevision = revision_tok.safeParse(fieldOf(storedBox, 'revision_tok')).data ?? null
  return { outcome: storedRevision === expected.revision_tok ? 'deleted' : 'deleted_other' }
}
