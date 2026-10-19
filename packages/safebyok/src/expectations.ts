import { Lockbox } from './lockbox'
import type { LockboxExpectation, LockboxRetireExpectation, LockboxRetirement, RetireExpectation, VaultPropsExpectation } from './vault-db'

/**
 * Whether what stands in storage is what a write expects: the comparisons a key-value adapter
 * makes, inside its one atomic step, before a versioned write lands. They compare the few public
 * fields an adapter compares (`vault_id`, `unlock_epoch`, `vault_key_epoch`, `revision_tok`) and
 * nothing else, reading the standing row as it is, unvalidated: a row too damaged to show a field
 * fails the comparison, so nothing lands on it ({@link retirementOf}, which reports rather than
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
 * retiring a lockbox, and the vault props' half of a lockbox write, compare. Vault props that show
 * no epoch are too damaged to compare, as for {@link vaultPropsMeets}.
 *
 * @param standing - The vault props' row standing in storage, or undefined (or null) when there is none.
 * @param expected - The vault the write or retirement is aimed at.
 *
 * @example Expectations.vaultMeets(standing, { vault_id: 'v1' })
 */
export const vaultMeets = (standing: unknown, expected: RetireExpectation): boolean => (
  fieldOf(standing, 'vault_id') === expected.vault_id
  && Number.isFinite(fieldOf(standing, 'unlock_epoch'))
)

/**
 * True when the vault props standing name the vault `expected` names, and nothing more is
 * compared: what retiring a whole vault needs, so that a vault whose props are too damaged to show
 * an epoch can still be retired (line 3.5).
 *
 * @param standing - The vault props' row standing in storage, or undefined (or null) when there is none.
 * @param expected - The vault the retirement is aimed at.
 *
 * @example Expectations.vaultIdMeets({ vault_id: 'v1', unlock_epoch: 'garbled' }, { vault_id: 'v1' })  // true
 */
export const vaultIdMeets = (standing: unknown, expected: RetireExpectation): boolean => (
  fieldOf(standing, 'vault_id') === expected.vault_id
)

/**
 * True when the vault props and lockbox standing are the ones `expected` names: the props of its
 * vault, standing for the vaultKey the lockbox was sealed under (its `vault_key_epoch`, line 3.8),
 * and the lockbox at its revision -- or, for a null `revision_tok`, no lockbox at all (line 3.3).
 *
 * @param standingVaultProps - The vault props' row standing in storage, or undefined (or null) when there is none.
 * @param standingBox - The lockbox row standing under the boxlabel, or undefined (or null) when there is none.
 * @param expected - What the lockbox write was sealed for and read.
 *
 * @example Expectations.lockboxMeets(vaultProps, undefined, { vault_id: 'v1', revision_tok: null, vault_key_epoch: 1 }) // a first write
 */
export const lockboxMeets = (standingVaultProps: unknown, standingBox: unknown, expected: LockboxExpectation): boolean => {
  if (! vaultMeets(standingVaultProps, expected) || fieldOf(standingVaultProps, 'vault_key_epoch') !== expected.vault_key_epoch) { return false }
  if (standingBox === undefined || standingBox === null) { return expected.revision_tok === null }
  return expected.revision_tok !== null && fieldOf(standingBox, 'revision_tok') === expected.revision_tok
}

/**
 * What a lockbox retirement reports, removing `standingBox`, the row standing under its boxlabel:
 * `retired` when that row is at the revision `expected` names -- or, for a null `revision_tok`,
 * holds none that reads as one, as the listing names no revision for a damaged lockbox that holds
 * none -- `retired_other` for any other row, and `absent` for none. It decides nothing: a
 * retirement in the right vault ({@link vaultMeets}) removes whatever stands (line 3.4), and this
 * says what that was, from inside the same atomic step.
 *
 * @param standingBox - The lockbox row standing under the boxlabel, or undefined (or null) when there is none.
 * @param expected - The vault the retirement is aimed at, and the revision the retiring device read.
 *
 * @example Expectations.retirementOf(standingBox, { vault_id: 'v1', revision_tok: 'r7' })  // { outcome: 'retired' } while r7 stands
 */
export const retirementOf = (standingBox: unknown, expected: LockboxRetireExpectation): LockboxRetirement => {
  if (standingBox === undefined || standingBox === null) { return { outcome: 'absent' } }
  const standingRevision = Lockbox.shape.revision_tok.safeParse(fieldOf(standingBox, 'revision_tok')).data ?? null
  return { outcome: standingRevision === expected.revision_tok ? 'retired' : 'retired_other' }
}
