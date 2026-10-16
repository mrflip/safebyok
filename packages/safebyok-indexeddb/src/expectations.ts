import type { BundleExpectation, EraseExpectation, LockboxExpectation } from 'safebyok'

/**
 * Whether what stands on the shelf is what a write expects: the comparisons every versioned
 * write makes before it lands, on the few public fields an adapter compares (`vault_id`,
 * `unlock_epoch`, `vault_key_epoch`, `revision_id`) and nothing else. They read the standing row as it is,
 * unvalidated: a row too damaged to show a field fails the comparison, so nothing lands on it.
 * The expectation itself is clean -- `VaultDB`'s verbs checked it before the adapter saw it.
 * They hold for any key-value backend; one of your own keeps them as they are.
 */

/** The field `field` of a standing row, or undefined when the row is no object or has none. */
const fieldOf = (standing: unknown, field: string): unknown => (
  typeof standing === 'object' && standing !== null ? (standing as Record<string, unknown>)[field] : undefined
)

/**
 * True when the bundle standing is the one `expected` names: its vault, at its unlock epoch.
 *
 * @param standing - The bundle row standing in storage, or undefined when there is none.
 * @param expected - What the update was proven against.
 *
 * @example bundleMeetsExpectation(standing, { vault_id: 'v1', unlock_epoch: 2 })
 */
export const bundleMeetsExpectation = (standing: unknown, expected: BundleExpectation): boolean => (
  fieldOf(standing, 'vault_id') === expected.vault_id
  && fieldOf(standing, 'unlock_epoch') === expected.unlock_epoch
)

/**
 * True when the bundle standing belongs to the vault `expected` names, at any epoch: what an
 * erase, and the bundle half of a lockbox write, compare. A bundle that shows no epoch is too
 * damaged to compare, as for {@link bundleMeetsExpectation}.
 *
 * @param standing - The bundle row standing in storage, or undefined when there is none.
 * @param expected - The vault the write or erase is aimed at.
 *
 * @example vaultMeetsExpectation(standing, { vault_id: 'v1' })
 */
export const vaultMeetsExpectation = (standing: unknown, expected: EraseExpectation): boolean => (
  fieldOf(standing, 'vault_id') === expected.vault_id
  && Number.isFinite(fieldOf(standing, 'unlock_epoch'))
)

/**
 * True when the bundle standing names the vault `expected` names, and nothing more is compared:
 * what erasing a whole vault needs, so that a vault whose bundle is too damaged to show an epoch
 * can still be erased.
 *
 * @param standing - The bundle row standing in storage, or undefined when there is none.
 * @param expected - The vault the erase is aimed at.
 *
 * @example vaultIdMeetsExpectation({ vault_id: 'v1', unlock_epoch: 'garbled' }, { vault_id: 'v1' })  // true
 */
export const vaultIdMeetsExpectation = (standing: unknown, expected: EraseExpectation): boolean => (
  fieldOf(standing, 'vault_id') === expected.vault_id
)

/**
 * True when the bundle and lockbox standing are the ones `expected` names: the bundle of its
 * vault, standing for the vaultKey the lockbox was sealed under (its `vault_key_epoch`, VAULTDB.md
 * line 3.8), and the lockbox at its revision -- or, for a null `revision_id`, no lockbox at all.
 *
 * @param standingBundle - The bundle row standing in storage, or undefined when there is none.
 * @param standingBox - The lockbox row standing under the boxlabel, or undefined when there is none.
 * @param expected - What the lockbox write was sealed for and read.
 *
 * @example lockboxMeetsExpectation(bundle, undefined, { vault_id: 'v1', revision_id: null, vault_key_epoch: 1 })  // a first write
 */
export const lockboxMeetsExpectation = (standingBundle: unknown, standingBox: unknown, expected: LockboxExpectation): boolean => {
  if (! vaultMeetsExpectation(standingBundle, expected) || fieldOf(standingBundle, 'vault_key_epoch') !== expected.vault_key_epoch) { return false }
  if (standingBox === undefined || standingBox === null) { return expected.revision_id === null }
  return expected.revision_id !== null && fieldOf(standingBox, 'revision_id') === expected.revision_id
}
