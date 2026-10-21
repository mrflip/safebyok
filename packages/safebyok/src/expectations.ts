import { BoxRecord } from './box'
import type { VaultError } from './errors'
import * as Refusals from './refusals'
import type { BoxExpectation, BoxDelExpectation, BoxDeletion, VaultDelExpectation, VaultPropsExpectation } from './vault-db'

/** Whether what stands in storage is what a write expects: the comparisons a key-value adapter makes inside its one atomic step.
 * Import it whole: `import { Expectations } from 'safebyok'`, then
 * `Expectations.vaultPropsMeets(standing, expected)`.
 *
 * Each compares only `vault_tok`, `gate_epoch` and `revision_tok`, on the standing row as it is,
 * unvalidated. A row too damaged to show a field fails, so nothing lands on it. Each `standing`
 * argument is the row in storage, or undefined or null for none. The expectation needs no check:
 * `VaultDB` checked it before the adapter saw it.
 */

/** The field `field` of a standing row, or undefined when the row is no object or has none. */
const fieldOf = (standing: unknown, field: string): unknown => (
  typeof standing === 'object' && standing !== null ? (standing as Record<string, unknown>)[field] : undefined
)

/** True when the vault props standing are `expected`'s vault at its gate epoch: what an update of the vault props compares (VAULTDB.md, line 3.2).
 *
 * @example Expectations.vaultPropsMeets(standing, { vault_tok: 'v1', gate_epoch: 2 })
 */
export const vaultPropsMeets = (standing: unknown, expected: VaultPropsExpectation): boolean => (
  fieldOf(standing, 'vault_tok') === expected.vault_tok
  && fieldOf(standing, 'gate_epoch') === expected.gate_epoch
)

/** True when the vault props standing are `expected`'s vault, at any epoch: what a box deletion, and a box write's vault half, compare.
 * Vault props that show no `gate_epoch` fail.
 *
 * @example Expectations.vaultMeets(standing, { vault_tok: 'v1' })
 */
export const vaultMeets = (standing: unknown, expected: VaultDelExpectation): boolean => (
  fieldOf(standing, 'vault_tok') === expected.vault_tok
  && Number.isFinite(fieldOf(standing, 'gate_epoch'))
)

/** True when the vault props standing name `expected`'s `vault_tok`, and nothing else: what deleting a whole vault compares (VAULTDB.md, line 3.5).
 * So vault props too damaged to show an epoch can still be deleted.
 *
 * @example Expectations.vaultTokMeets({ vault_tok: 'v1', gate_epoch: 'garbled' }, { vault_tok: 'v1' })  // true
 */
export const vaultTokMeets = (standing: unknown, expected: VaultDelExpectation): boolean => (
  fieldOf(standing, 'vault_tok') === expected.vault_tok
)

/** The refusal a box write meets from the vault props and box standing, or null when it may land.
 * It is {@link Refusals.vaultMismatch} when the vault props are not `expected`'s vault. Else it is
 * {@link Refusals.staleBox} when the box is not at `expected.revision_tok`, or when any box stands
 * and that is null (VAULTDB.md, line 3.3).
 *
 * @example
 *   const refusal = Expectations.boxRefusalOf(vaultProps, standingBox, expected)
 *   if (refusal) { throw refusal }
 */
export const boxRefusalOf = (standingVaultProps: unknown, standingBox: unknown, expected: BoxExpectation): VaultError | null => {
  if (! vaultMeets(standingVaultProps, expected)) { return Refusals.vaultMismatch() }
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
 * @example Expectations.deletionOf(standingBox, { vault_tok: 'v1', revision_tok: 'r7' }) // { outcome: 'deleted' } while r7 stands
 */
export const deletionOf = (standingBox: unknown, expected: BoxDelExpectation): BoxDeletion => {
  if (standingBox === undefined || standingBox === null) { return { outcome: 'absent' } }
  const standingRevision = BoxRecord.shape.revision_tok.safeParse(fieldOf(standingBox, 'revision_tok')).data ?? null
  return { outcome: standingRevision === expected.revision_tok ? 'deleted' : 'deleted_other' }
}
