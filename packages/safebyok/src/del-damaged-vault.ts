import * as Names from './names'
import { VaultError } from './errors'
import { valOf } from './outcome'
import { deviceTroubleAsConditions } from './device-db'
import { type MakeVaultOpts, isBag, parseVaultDB, parseDeviceDB } from './vault-opts'

/** What {@link delDamagedVault} needs of Vault.make's options: which vault, and the two stores it lives in. */
export type DelDamagedVaultOpts = Pick<MakeVaultOpts, 'applabel' | 'userId' | 'vaultlabel' | 'vaultDB' | 'deviceDB' | 'validators'>

/**
 * Delete a vault whose `hello()` refuses it as `damaged_vault`, and only that: its stored vault props
 * and every box, through the VaultDB, and this device's lease of it and its device mark,
 * through the DeviceDB -- what `del()` does for a vault that opens, and nothing else. Vault
 * props that fail their checks cannot be opened, so no handle exists to `del()`; this is the
 * way to clear them and start over. Whatever the vault held is gone for good, so ask the user first.
 *
 * It takes the options `Vault.make` took, and refuses a vault that is sound: kind 'bad_option' and
 * nothing removed, since a vault that opens is deleted with its handle's `del()`, which takes
 * the care of a handle that has seen the vault it deletes. With no vault stored it erases only the
 * device's lease and mark, so a call that was cut short can be made again. Kind 'damaged_vault'
 * when the record is too damaged to say which vault it is, which only the backend's own tools can
 * clear; 'stale_write' when the vault was replaced elsewhere meanwhile. Other refusals are
 * storage's: 'storage_unavailable', 'identity_revoked', 'not_permitted'. The device store failing
 * after the vault is deleted is 'storage_unavailable' too, saying what failed: call again to finish
 * clearing the device -- or 'storage_blocked', which calling again cannot mend until the
 * browser lets the device keep its storage. Misuse is refused before
 * storage is touched, as `Vault.make` does: 'bad_label' for a label that fails its check, and
 * 'bad_option' for an option missing.
 *
 * A record this version cannot read may be one a newer safebyok wrote and opens, so a `format`
 * it does not know is refused too, as 'newer_format', with
 * nothing removed and a message to update the app, as `hello()` refuses it: any change to what a stored record may hold --
 * a field, a shape, or a range a check accepts -- bumps `format`, so that newer can be told from
 * damaged. There is no handle to lock, so a storage refusal such as 'identity_revoked' is thrown
 * as it comes, with no lock to make.
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

