import * as Names from './names'
import { VaultError } from './errors'
import { valOf } from './outcome'
import { deviceTroubleAsConditions } from './device-db'
import { type MakeVaultOpts, isBag, parseVaultDB, parseDeviceDB } from './vault-opts'

/** What {@link delDamagedVault} needs of Vault.make's options: which vault, and the two stores it lives in. */
export type DelDamagedVaultOpts = Pick<MakeVaultOpts, 'applabel' | 'userId' | 'vaultlabel' | 'vaultDB' | 'deviceDB' | 'validators'>

/** Delete a vault whose `hello()` refuses it as `damaged_vault`: its vault props, every box, and this device's lease and mark of it.
 * There is no Vault object to `del()` it with, so this is how to clear it and start over. It takes
 * the options `Vault.make` took, and refuses misuse as `Vault.make` does, before touching storage.
 * What the vault held is gone for good: ask the user first. Goes through `VaultDB.delDamagedVault`,
 * then the DeviceDB's `delLease` and `delMark`.
 *
 * Once it resolves, storage holds no vault in the scope and this device remembers none. With no
 * vault stored it only clears the device, so a call cut short can be made again.
 *
 * A sound vault refuses 'bad_option': delete it with `vault.del()`. Props too damaged to name
 * their vault refuse 'damaged_vault', which this cannot clear. A `format` this version does not
 * know refuses 'newer_format'. Each of those removes nothing. A vault replaced elsewhere meanwhile
 * refuses 'stale_write'. A device store that fails once the vault is gone refuses
 * 'storage_unavailable' or 'storage_blocked': call again to finish. With no Vault object to lock,
 * 'identity_revoked' locks nothing.
 *
 * @example
 *   const vault = Vault.make(opts)
 *   try { await vault.hello() } catch (err) {
 *     if (isVaultError(err, 'damaged_vault') && userConfirmedStartingOver()) { await delDamagedVault(opts); await vault.hello() }
 *   }
 */
export const delDamagedVault = async (opts: DelDamagedVaultOpts): Promise<void> => {
  if (! isBag(opts)) { throw new VaultError('bad_option', 'delDamagedVault takes one bag of options: applabel, userId, vaultlabel, vaultDB and deviceDB, as Vault.make did.') }
  const rules = Names.rulesOf(opts.validators)
  const scope = Names.checkScope(rules, { applabel: opts.applabel, user_id: opts.userId, vaultlabel: opts.vaultlabel })
  const vaultDB = parseVaultDB(opts.vaultDB)
  if (typeof vaultDB.delDamagedVault !== 'function') {
    throw new VaultError('bad_option', "vaultDB has no delDamagedVault: a storage adapter that hands each call on to another's must hand this one on too.")
  }
  const deviceDB = deviceTroubleAsConditions(parseDeviceDB(opts.deviceDB))
  // The vault first: a sound one refuses, and then the device keeps what it remembers of it. A
  // retry after a failure here finds the vault gone, and still clears the device.
  valOf(await vaultDB.delDamagedVault(scope))
  valOf(await deviceDB.delLease(scope))
  valOf(await deviceDB.delMark(scope))
}

