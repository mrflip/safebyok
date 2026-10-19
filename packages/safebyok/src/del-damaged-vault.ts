import * as Names from './names'
import { isStorageBlocked } from './refusals'
import { VaultError, isVaultError } from './errors'
import type { DeviceDB } from './device-db'
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
 * A record this version cannot read may be one a newer safebyok wrote and opens, so a `format`,
 * wayinkind or number of wayins it does not know is refused too, as 'newer_format', with
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
  await vaultDB.delDamagedVault(scope)
  await deviceDB.delLease(scope)
  await deviceDB.delMark(scope)
}

/**
 * `deviceDB`'s verbs, each with a failure that is no VaultError -- an IndexedDB error, say, or a
 * throw before the promise -- said as a condition, with the device store's own error as its cause
 * and a message naming what failed: 'storage_blocked' for a refusal the browser gives for a reason
 * that holds until something outside the app changes (`Refusals.isStorageBlocked`), which a host
 * shows without offering a retry, and 'storage_unavailable' for any other, which it shows in
 * place and offers to retry. A VaultError passes as it came. What a vault and
 * `delDamagedVault` call the device store through; not exported from the package.
 *
 * @param deviceDB - The device store a host handed in.
 * @returns The same verbs, each failure said as a condition.
 *
 * @example await deviceTroubleAsConditions(deviceDB).getMark(scope)  // a failing IndexedDB: 'storage_unavailable', "...failed reading its mark of this vault..."
 * @example await deviceTroubleAsConditions(deviceDB).getMark(scope)  // site data blocked (a SecurityError): 'storage_blocked', "...will not help until that changes..."
 */
export const deviceTroubleAsConditions = (deviceDB: DeviceDB): DeviceDB => ({
  getLease: async (...args) => await asCondition('getLease', () => deviceDB.getLease(...args)),
  putLease: async (...args) => { await asCondition('putLease', () => deviceDB.putLease(...args)) },
  delLease: async (...args) => { await asCondition('delLease', () => deviceDB.delLease(...args)) },
  getMark:  async (...args) => await asCondition('getMark', () => deviceDB.getMark(...args)),
  putMark:  async (...args) => { await asCondition('putMark', () => deviceDB.putMark(...args)) },
  delMark:  async (...args) => { await asCondition('delMark', () => deviceDB.delMark(...args)) },
  delAll:   async (...args) => { await asCondition('delAll', () => deviceDB.delAll(...args)) },
})

/**
 * What failed, for each device-store verb, and what it leaves undone: the heart of the message a
 * failure of that verb is said with; and, where there is one, what the user may do instead of
 * trying again, which holds whether a retry may mend it or not. None names a scope or quotes a
 * record.
 */
const DeviceTroubleSaid: Record<keyof DeviceDB, { failed: string, instead?: string }> = {
  getLease: { failed: "reading the lease it keeps for this vault, so the vault could not take it up", instead: "unlock with a passphrase or passkey" },
  putLease: { failed: "writing the lease it keeps for this vault, so this device may ask for the passphrase again at the next open" },
  delLease: { failed: "erasing the lease it keeps for this vault, so the next vault made on this device, as at the next page load, may still take it up" },
  getMark:  { failed: "reading its mark of this vault (the newest copy of the vault it has seen, and how often it has locked), so the vault could not check storage against it" },
  putMark:  { failed: "writing its mark of this vault (the newest copy of the vault it has seen, and how often it has locked), so it may not be kept" },
  delMark:  { failed: "erasing its mark of this vault, so it still holds the newest copy of the vault it had seen" },
  delAll:   { failed: "erasing everything it keeps for safebyok, so some of it may remain" },
}

/** What `call` to the device store's `verb` resolves to, or its failure, as {@link deviceTroubleAsConditions} says it. */
const asCondition = async <ResultT>(verb: keyof DeviceDB, call: () => Promise<ResultT>): Promise<ResultT> => {
  try {
    return await call()
  } catch (err) {
    if (isVaultError(err)) { throw err }
    const { failed, instead } = DeviceTroubleSaid[verb]
    if (isStorageBlocked(err)) {
      const meanwhile = instead === undefined ? '' : `: ${instead} instead`
      throw new VaultError('storage_blocked', `This browser does not let the app keep anything on this device -- storage blocked for this site, a private window or frame that withholds it, or no room left -- so it failed ${failed}. Trying again will not help until that changes${meanwhile}. The device store's error is this error's cause.`, { cause: err })
    }
    const retry = instead === undefined ? 'try again' : `try again, or ${instead}`
    throw new VaultError('storage_unavailable', `This device's own storage failed ${failed}: ${retry}. If it fails every time, this device may not let the app keep anything: storage blocked or full, or a private window. The device store's error is this error's cause.`, { cause: err })
  }
}
