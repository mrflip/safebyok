import { revision_tok } from './shapes/fields'
import type { VaultError } from './errors'
import * as Refusals from './refusals'
import { TombstoneFormat, type VaultRecord, type VaultTombstone, type VaultDraft } from './shapes/vault'
import type { BoxExpectation, BoxDelExpectation, BoxDeletion, VaultDelExpectation, VaultRecordExpectation } from './shapes/vault-db'

/** Whether what stands in storage is what a write expects: the comparisons a key-value adapter makes inside its one atomic step.
 * Import it whole: `import { Expectations } from 'safebyok'`, then
 * `Expectations.vaultRecordMeets(standing, expected)`.
 *
 * Each compares only `vault_tok`, `gate_epoch` and `revision_tok`, on the standing row as it is,
 * unvalidated. A row too damaged to show a field fails, so nothing lands on it. Each `standing`
 * argument is the row in storage, or undefined or null for none. The expectation needs no check:
 * `VaultDB` checked it before the adapter saw it.
 *
 * A key-value adapter keeps a vault's tombstone in the row its vault record was in. Every
 * comparison here reads that row as no vault, as it holds no `vault_tok` for an expectation to
 * name: a stale writer never finds a deleted vault standing.
 */

/** True when a stored row is a tombstone, the mark a deleted vault leaves in its place: judged by its `format` alone.
 * A tombstone too damaged to parse still reads as one, so it is never taken for a vault record.
 *
 * @example Expectations.isTombstone({ format: 'safebyok-tombstone-v1', vault_epoch: 3 })  // true
 */
export const isTombstone = (standing: unknown): boolean => fieldOf(standing, 'format') === TombstoneFormat

/** The row `standing` as a vault record: itself, or null for none or for a tombstone. */
const liveRecordOf = (standing: unknown): unknown => (isTombstone(standing) ? null : standing ?? null)

/** The field `field` of a standing row, or undefined when the row is no object or has none. */
const fieldOf = (standing: unknown, field: string): unknown => (
  typeof standing === 'object' && standing !== null ? (standing as Record<string, unknown>)[field] : undefined
)

/** True when the vault record standing is `expected`'s vault at its gate epoch: what an update of the vault record compares (VAULTDB.md, line 3.2).
 *
 * @example Expectations.vaultRecordMeets(standing, { vault_tok: 'v1', gate_epoch: 2 })
 */
export const vaultRecordMeets = (standing: unknown, expected: VaultRecordExpectation): boolean => (
  fieldOf(standing, 'vault_tok') === expected.vault_tok
  && fieldOf(standing, 'gate_epoch') === expected.gate_epoch
)

/** The refusal an update of the vault record meets from the vault record standing, or null when it may land.
 * It is {@link Refusals.staleVaultRecord}, carrying what stands, unless {@link vaultRecordMeets}
 * (VAULTDB.md, line 3.2).
 *
 * @example
 *   const refusal = Expectations.vaultRecordRefusalOf(standing, expected)
 *   if (refusal) { throw refusal }
 */
export const vaultRecordRefusalOf = (standing: unknown, expected: VaultRecordExpectation): VaultError | null => (
  vaultRecordMeets(standing, expected) ? null : Refusals.staleVaultRecord(liveRecordOf(standing))
)

/** True when the vault record standing is `expected`'s vault, at any epoch: what a box read, a box deletion, and a box write's vault half, compare.
 * A vault record that shows no `gate_epoch` fails.
 *
 * @example Expectations.vaultMeets(standing, { vault_tok: 'v1' })
 */
export const vaultMeets = (standing: unknown, expected: Pick<VaultDelExpectation, 'vault_tok'>): boolean => (
  fieldOf(standing, 'vault_tok') === expected.vault_tok
  && Number.isFinite(fieldOf(standing, 'gate_epoch'))
)

/** The `vault_epoch` of a stored row, a vault record or a tombstone, as a whole number from zero: zero where the row shows none that reads so.
 * A damaged vault record can show no `vault_epoch`; its deletion still leaves a tombstone.
 */
const epochOf = (standing: unknown): number => {
  const val = fieldOf(standing, 'vault_epoch')
  return typeof val === 'number' && Number.isSafeInteger(val) && val >= 0 ? val : 0
}

/** The vault record an update stores over `standing`, which it has met: `vaultRecord`, its gate with it, with `vault_epoch` the standing one plus one, whatever `vaultRecord` carries.
 * The store moves the counter, never the writer (VAULTDB.md, line 3.2). It hands back the type it
 * was handed, so a server holding the record in its own types (Convex's) keeps them.
 *
 * @example Expectations.vaultRecordPutOf(next, standing)   // next, its vault_epoch standing.vault_epoch + 1
 */
export const vaultRecordPutOf = <RecordT extends Pick<VaultRecord, 'vault_epoch'>>(vaultRecord: RecordT, standing: unknown): RecordT => (
  { ...vaultRecord, vault_epoch: epochOf(standing) + 1 }
)

/** The vault record a creation stores over `standing`, or null when a vault already stands and nothing is stored.
 * Over no row it is `draft`. Over a tombstone it is `draft` with the tombstone's `vault_epoch`: a
 * new life, the counter carried on (VAULTDB.md, line 3.1).
 *
 * @example
 *   const life = Expectations.newLifeOf(draft, standing)
 *   if (life) { write(life) }
 */
export const newLifeOf = <DraftT extends Pick<VaultDraft, 'vault_epoch'>>(draft: DraftT, standing: unknown): DraftT | null => {
  if (standing === null || standing === undefined) { return draft }
  return isTombstone(standing) ? { ...draft, vault_epoch: epochOf(standing) } : null
}

/** The tombstone a deletion leaves over `standing`, or null when the deletion misses and removes nothing.
 * A vault meets it by its `vault_tok` and, unless `expected.gate_epoch` is null, its `gate_epoch`;
 * the tombstone then holds the scope and the vault's `vault_epoch` plus one. A vault too damaged
 * to show its `gate_epoch` or `vault_epoch` can still be deleted by `vault_tok` alone, and counts
 * from zero. A tombstone standing meets nothing: a vault already deleted is refused as stale, as
 * it is when nothing stands (VAULTDB.md, line 3.5).
 *
 * @example Expectations.tombstoneOf(standing, scope, { vault_tok: 'v1', gate_epoch: 2 })   // while v1 stands at gate 2
 */
export const tombstoneOf = (standing: unknown, scope: Pick<VaultTombstone, 'applabel' | 'user_id' | 'vaultlabel'>, expected: VaultDelExpectation): VaultTombstone | null => {
  if (fieldOf(standing, 'vault_tok') !== expected.vault_tok) { return null }
  if (expected.gate_epoch !== null && fieldOf(standing, 'gate_epoch') !== expected.gate_epoch) { return null }
  return {
    format:      TombstoneFormat,
    applabel:    scope.applabel,
    user_id:     scope.user_id,
    vaultlabel:  scope.vaultlabel,
    vault_epoch: epochOf(standing) + 1,
  }
}

/** The refusal a box write meets from the vault record and box standing, or null when it may land.
 * It is {@link Refusals.vaultMismatch} when the vault record is not `expected`'s vault. Else it is
 * {@link Refusals.staleBox} when the box is not at `expected.revision_tok`, or when any box stands
 * and that is null (VAULTDB.md, line 3.3).
 *
 * @example
 *   const refusal = Expectations.boxRefusalOf(standingVaultRecord, standingBox, expected)
 *   if (refusal) { throw refusal }
 */
export const boxRefusalOf = (standingVaultRecord: unknown, standingBox: unknown, expected: BoxExpectation): VaultError | null => {
  if (! vaultMeets(standingVaultRecord, expected)) { return Refusals.vaultMismatch() }
  const standing = standingBox ?? null
  const boxMeets = standing === null
    ? expected.revision_tok === null
    : expected.revision_tok !== null && fieldOf(standing, 'revision_tok') === expected.revision_tok
  return boxMeets ? null : Refusals.staleBox(standing)
}

/** What a box deletion reports of `standingBox`: `deleted` at `expected`'s revision, `deleted_other` for any other row, `absent` for none.
 * It only reports. A deletion in the right vault ({@link vaultMeets}) removes whatever stands
 * (VAULTDB.md, line 3.4). A null `revision_tok` matches a row holding none that reads as one, as the
 * listing shows a damaged box.
 *
 * @example Expectations.deletionOf(standingBox, { vault_tok: 'v1', revision_tok: 'r7' })  // { outcome: 'deleted' } while r7 stands
 */
export const deletionOf = (standingBox: unknown, expected: BoxDelExpectation): BoxDeletion => {
  if (standingBox === undefined || standingBox === null) { return { outcome: 'absent' } }
  const standingRevision = revision_tok.safeParse(fieldOf(standingBox, 'revision_tok')).data ?? null
  return { outcome: standingRevision === expected.revision_tok ? 'deleted' : 'deleted_other' }
}
