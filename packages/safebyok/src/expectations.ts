import { BoxRecord } from './box'
import type { VaultError } from './errors'
import * as Refusals from './refusals'
import type { BoxExpectation, BoxDelExpectation, BoxDeletion, VaultDelExpectation, VaultPropsExpectation } from './vault-db'

/**
 * Whether what stands in storage is what a write expects: the comparisons a key-value adapter
 * makes, inside its one atomic step, before a versioned write lands. They compare the few unencrypted
 * fields an adapter compares (`vault_id`, `unlock_epoch`, `revision_tok`) and
 * nothing else, reading the standing row as it is, unvalidated: a row too damaged to show a field
 * fails the comparison, so nothing lands on it ({@link deletionOf}, which reports rather than
 * decides, reads a damaged one as the listing does). The expectation itself is clean -- `VaultDB`'s
 * verbs checked it before the adapter saw it. `localVaultDB` and `idbVaultDB` use them; a
 * key-value backend of your own uses them as they are. Import it whole:
 * `import { Expectations } from 'safebyok'`, then `Expectations.vaultPropsMeets(standing, expected)`.
 */

/** The field `field` of a standing row, or undefined when the row is no object or has none. */
const fieldOf = (standing: unknown, field: string): unknown => (
  typeof standing === 'object' && standing !== null ? (standing as Record<string, unknown>)[field] : undefined
)

/**
 * True when the vault props standing are the ones `expected` names: its vault, at its unlock
 * epoch. What an update of the vault props compares (VAULTDB.md line 3.2).
 *
 * @param standing - The vault props' row standing in storage, or undefined (or null) when there is none.
 * @param expected - What the update was proven against.
 *
 * @example Expectations.vaultPropsMeets(standing, { vault_id: 'v1', unlock_epoch: 2 })
 */
export const vaultPropsMeets = (standing: unknown, expected: VaultPropsExpectation): boolean => (
  fieldOf(standing, 'vault_id') === expected.vault_id
  && fieldOf(standing, 'unlock_epoch') === expected.unlock_epoch
)

/**
 * True when the vault props standing belong to the vault `expected` names, at any epoch: what
 * deleting a box, and the vault props' half of a box write, compare. Vault props that show
 * no epoch are too damaged to compare, as for {@link vaultPropsMeets}.
 *
 * @param standing - The vault props' row standing in storage, or undefined (or null) when there is none.
 * @param expected - The vault the write or deletion is aimed at.
 *
 * @example Expectations.vaultMeets(standing, { vault_id: 'v1' })
 */
export const vaultMeets = (standing: unknown, expected: VaultDelExpectation): boolean => (
  fieldOf(standing, 'vault_id') === expected.vault_id
  && Number.isFinite(fieldOf(standing, 'unlock_epoch'))
)

/**
 * True when the vault props standing name the vault `expected` names, and nothing more is
 * compared: what deleting a whole vault needs, so that a vault whose props are too damaged to show
 * an epoch can still be deleted (line 3.5).
 *
 * @param standing - The vault props' row standing in storage, or undefined (or null) when there is none.
 * @param expected - The vault the deletion is aimed at.
 *
 * @example Expectations.vaultIdMeets({ vault_id: 'v1', unlock_epoch: 'garbled' }, { vault_id: 'v1' })  // true
 */
export const vaultIdMeets = (standing: unknown, expected: VaultDelExpectation): boolean => (
  fieldOf(standing, 'vault_id') === expected.vault_id
)

/**
 * What a box write meets, from the vault props and box standing, read in its one atomic step:
 * null when they are the ones `expected` names, and the write lands; otherwise the refusal to
 * throw, writing nothing. `vault_mismatch` when the vault props are not those of its vault --
 * none stand, or another vault's, or too damaged to compare; else `stale_write`, carrying the box
 * standing as it is (or null for none), when the box is not at its revision -- or, for a null
 * `revision_tok`, when any box stands at all (line 3.3).
 *
 * @param standingVaultProps - The vault props' row standing in storage, or undefined (or null) when there is none.
 * @param standingBox - The box row standing under the boxlabel, or undefined (or null) when there is none.
 * @param expected - What the box write was sealed for and read.
 * @returns Null when the write lands; otherwise the refusal, `Refusals.vaultMismatch()` or `Refusals.staleBox(standing)`.
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

/**
 * What a box deletion reports, removing `standingBox`, the row standing under its boxlabel:
 * `deleted` when that row is at the revision `expected` names -- or, for a null `revision_tok`,
 * holds none that reads as one, as the listing names no revision for a damaged box that holds
 * none -- `deleted_other` for any other row, and `absent` for none. It decides nothing: a
 * deletion in the right vault ({@link vaultMeets}) removes whatever stands (line 3.4), and this
 * says what that was, from inside the same atomic step.
 *
 * @param standingBox - The box row standing under the boxlabel, or undefined (or null) when there is none.
 * @param expected - The vault the deletion is aimed at, and the revision the deleting device read.
 *
 * @example Expectations.deletionOf(standingBox, { vault_id: 'v1', revision_tok: 'r7' })  // { outcome: 'deleted' } while r7 stands
 */
export const deletionOf = (standingBox: unknown, expected: BoxDelExpectation): BoxDeletion => {
  if (standingBox === undefined || standingBox === null) { return { outcome: 'absent' } }
  const standingRevision = BoxRecord.shape.revision_tok.safeParse(fieldOf(standingBox, 'revision_tok')).data ?? null
  return { outcome: standingRevision === expected.revision_tok ? 'deleted' : 'deleted_other' }
}
