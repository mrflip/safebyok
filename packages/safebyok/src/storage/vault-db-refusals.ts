/** The refusals of a vaultDB, each read the same in an answer and an error: `meta` holds the `world` and `dbhas` the answer carries. */

import { VaultError } from '../errors'
import type { Capacity } from '../shapes/vault-db'
import type { BoxRow, VaultRow } from './vault-db-shapes'

export const vaultEmpty = (world: VaultRow): VaultError => (
  new VaultError('vault_empty', 'Nothing is stored for this life of the vault: read the vault again by its scope.', { meta: { world, dbhas: null } })
)

export const vaultGone = (tombstone: VaultRow): VaultError => (
  new VaultError('vault_gone', 'This vault was deleted.', { meta: { world: tombstone, dbhas: tombstone } })
)

export const staleWrite = (world: VaultRow, dbhas: VaultRow | BoxRow | null): VaultError => (
  new VaultError('stale_write', 'What is stored moved since this revision was read, so nothing was written: read it again.', { meta: { world, dbhas } })
)

export const camped = (world: VaultRow, dbhas: VaultRow | BoxRow): VaultError => (
  new VaultError('camped', 'A live record is already stored here, and this call was told not to replace it.', { meta: { world, dbhas } })
)

export const absentBox = (world: VaultRow, dbhas: BoxRow | null): VaultError => (
  new VaultError('absent_box', 'No box is stored under that label.', { meta: { act: (dbhas === null) ? 'void' : 'gone', world, dbhas } })
)

export const gateIssue = (world: VaultRow, why: string): VaultError => (
  new VaultError('gate_issue', `This change of the gate was refused: ${why}`, { meta: { world, dbhas: world } })
)

export const boxTooLarge = (recordBytes: number, maxRecordBytes: number): VaultError => (
  new VaultError('box_too_large', `That box weighs ${String(recordBytes)} bytes, over the ${String(maxRecordBytes)} its storage holds in one record.`)
)

export const vaultFull = (capacity: Capacity): VaultError => (
  new VaultError('vault_full', 'This vault holds as many boxes as its storage allows.', { meta: { capacity } })
)

export const damagedRecord = (): VaultError => new VaultError('damaged_record', 'The stored record failed its checks, so it is set aside.')

export const newerFormat = (): VaultError => new VaultError('newer_format', 'The stored record is in a format newer than this version of the package reads.')

export const seqNotNext = (): VaultError => new VaultError('invalid_input', "A record's revision_seq must be one past its prior's.")

export const storageError = (cause: unknown): VaultError => new VaultError('storage_error', "The vault's storage failed: its own error is this error's cause.", { cause })
