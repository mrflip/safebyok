import * as CX from './checks/core-checks'
import { VaultError } from './errors'
import { valOf } from './outcome'
import { type DeviceDB, deviceRecordOf } from './device-db'
import { randomId } from './crypto'
import type { VaultScope } from './types/types'
import type { VaultDB } from './vault-db'
import { type MakeBankOpts, isBag, parseVaultDB, parseDeviceDB } from './vault-opts'

/** What {@link delDamagedVault} needs of Bank.make's options and the vault's label: which vault, and the two stores it lives in. */
export type DelDamagedVaultOpts = Pick<MakeBankOpts, 'applabel' | 'user_id' | 'vaultDB' | 'deviceDB'> & Pick<VaultScope, 'vaultlabel'>

/** Delete a vault whose birth refuses it as `damaged_vault`: its vault record, every box, and this device's lease of it.
 * There is no Vault object to `del()` it with, so this is how to clear it and start over. It takes
 * the options `Bank.make` took beside the vault's `vaultlabel`, and refuses misuse as
 * they do, before touching storage. What the vault held is gone for good: ask the user first. Goes
 * through `VaultDB.delDamagedVault`, then the DeviceDB's `delLease`, and raises this device's
 * record of the scope to the tombstone's `vault_epoch` with `raiseDeviceRecord`.
 *
 * Storage decides, by the checks it alone can make: `VaultDB.delDamagedVault` deletes only a vault
 * record that fails its checks and still names its `vault_tok`. So no bank need have opened the
 * vault, or refused it, first, and nothing here asks for an unlock or a passphrase.
 *
 * Once it resolves, storage holds no vault in the scope and this device holds no lease of it. With
 * no vault stored it only clears the lease, so a call cut short can be made again.
 *
 * A sound vault refuses 'bad_option': delete it with `vault.del()`. A record too damaged to name
 * its vault refuses 'damaged_vault', which this cannot clear. A `format` this version does not
 * know refuses 'newer_format'. Each of those removes nothing. A vault replaced elsewhere meanwhile
 * refuses 'stale_write'. A device store that fails once the vault is gone refuses
 * 'storage_unavailable' or 'storage_blocked': call again to finish. With no Vault object to lock,
 * 'identity_revoked' locks nothing.
 *
 * @example
 *   const { ok, err } = await bank.tryEnsureVault({ vaultlabel: 'main' })
 *   if (! ok && isVaultError(err, 'damaged_vault') && userConfirmedStartingOver()) {
 *     await delDamagedVault({ ...bankOpts, vaultlabel: 'main' })
 *     await bank.ensureVault({ vaultlabel: 'main' })   // a new life, novel
 *   }
 */
export const delDamagedVault = async (opts: DelDamagedVaultOpts): Promise<void> => {
  if (! isBag(opts)) { throw new VaultError('bad_option', "delDamagedVault takes one bag of options: applabel, user_id, vaultDB and deviceDB, as Bank.make took them, and the vault's vaultlabel.") }
  const scope = CX.vaultScope.parse({ applabel: opts.applabel, user_id: opts.user_id, vaultlabel: opts.vaultlabel })
  const vaultDB = parseVaultDB(opts.vaultDB)
  await delDamagedVaultIn(scope, vaultDB, parseDeviceDB(opts.deviceDB))
}

/** {@link delDamagedVault}'s work, for a scope and stores already checked: what `bank.delDamagedVault` calls too. */
export const delDamagedVaultIn = async (scope: VaultScope, vaultDB: VaultDB, deviceDB: DeviceDB): Promise<void> => {
  if (typeof vaultDB.delDamagedVault !== 'function') {
    throw new VaultError('bad_option', "vaultDB has no delDamagedVault: a storage adapter that hands each call on to another's must hand this one on too.")
  }
  // The vault first: a sound one refuses, and then the device keeps what it remembers of it. A
  // retry after a failure here finds the vault gone, and still clears the device.
  const tombstone = valOf(await vaultDB.delDamagedVault(scope))
  valOf(await deviceDB.delLease(scope))
  if (tombstone === null) { return }
  // The device_id is kept where a record stands: raising keeps the first one stored.
  const raising = deviceRecordOf(scope, randomId(), tombstone.vault_epoch)
  valOf(await deviceDB.raiseDeviceRecord(raising))
}

