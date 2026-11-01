import type { Cache, DeviceRecord, DeviceRecordAdvance, GateEpochSeen, LeaseRecord, VaultCacheable, VaultRecord, VaultSparse } from '../models/models-shapes'
import * as MSX from '../models/models-shapes'
import type { BankScope, VaultScope } from '../shapes/scopes'
import * as CX from '../shapes/scopes'
import * as Scopepath from '../scopepath'
import { type VaultError, isVaultError, thrownNameOf } from '../errors'
import * as RefusalFuncs from '../helpers/refusal-funcs'
import { type Outcome, outcomeOf } from '../outcome'
import * as Phrases from '../phrases'
import { isStorageBlocked } from '../refusals'

/** Storage on this device for what the models keep of a bank's scope: each vault's lease, which survives a page reload, each vault's cached copy, and the device record. Extend it, and implement its `do*` methods against a key-value store.
 * Nothing here ever goes to the backend. A lease record holds a non-extractable leaseKey, a
 * CryptoKey with no JSON form, so a store keeps rows by structured clone or in memory, never as
 * JSON. `memoryDeviceDB` and `idbDeviceDB` are the two supplied.
 *
 * The public verbs are the base class's; never override them. Each is a try pair: `getLease`
 * resolves its answer or throws, and `tryGetLease` resolves the same as an {@link Outcome} and
 * never rejects. Each refuses 'bad_scope' for a scope whose names fail their checks, and 'bad_record'
 * for a record that fails its own, before your code sees it.
 *
 * A VaultError your code throws passes as it came, from either form; anything else it throws
 * becomes 'storage_blocked' where {@link isStorageBlocked} names it, else 'storage_unavailable',
 * naming no scope and quoting no row.
 *
 * **Calls land in the order they were made.** Each verb calls its `do*` methods before it awaits
 * anything, so a store that starts each call's work in the order it is called keeps one scope's
 * calls in the order they were made, awaited or not: a lock's `tryDelLease`, made after a grant's
 * `tryPutLease`, must erase it. `doUpdate` and `doDelDamaged` each say what else they owe.
 */
export abstract class DeviceDB {
  // == [Lease verbs]: getLease, putLease, delLease, their try forms

  /** The lease row of one vault as stored, or null for none. The lease judges it (`Lease.get`): a row that is no lease of the vault stays where it lies until the next grant writes over it. */
  async getLease(scope: VaultScope): Promise<unknown> {
    const leaseScopepath = Scopepath.lease(scope)
    return (await storeAnswer('getLease', () => this.doGet(leaseScopepath))) ?? null
  }

  tryGetLease(scope: VaultScope): Promise<Outcome<unknown>> { return outcomeOf(() => this.getLease(scope)) }

  /** Store `record` as the lease of its vault, in place of any before, resolving it. */
  async putLease(record: LeaseRecord): Promise<LeaseRecord> {
    MSX.leaseRecord.parse(record)
    const leaseScopepath = Scopepath.lease(record)
    await storeAnswer('putLease', () => this.doPut(leaseScopepath, record))
    return record
  }

  tryPutLease(record: LeaseRecord): Promise<Outcome<LeaseRecord>> { return outcomeOf(() => this.putLease(record)) }

  async delLease(scope: VaultScope): Promise<void> {
    const leaseScopepath = Scopepath.lease(scope)
    await storeAnswer('delLease', () => this.doDel(leaseScopepath))
  }

  tryDelLease(scope: VaultScope): Promise<Outcome<void>> { return outcomeOf(() => this.delLease(scope)) }
  // --

  // == [The device record]: getDeviceRecord, advanceDeviceRecord, their try forms

  /** This device's record of a bank's scope, or null for none. A row that fails its check, or names another scope, reads as none; the next advance writes over it. */
  async getDeviceRecord(scope: BankScope): Promise<DeviceRecord | null> {
    const bankScopepath = Scopepath.bank(scope)
    const stored = await storeAnswer('getDeviceRecord', () => this.doGet(bankScopepath))
    return deviceRecordAt(bankScopepath, stored)
  }

  tryGetDeviceRecord(scope: BankScope): Promise<Outcome<DeviceRecord | null>> { return outcomeOf(() => this.getDeviceRecord(scope)) }

  /** Advance this device's record of `record`'s scope by `record`, resolving the record as stored: the `device_id` stored stays, and each vault keeps the higher `gate_epoch` of the two.
   * The store keeps what {@link advancedDeviceRecord} makes of the stored record and `record` in one
   * transaction, so a tab that saw less never undoes what another saw. Over a stored row that fails
   * its check, `record` is stored as it came, and `wroteOverDamaged` says so: what that row had seen is lost.
   *
   * @example await deviceDB.advanceDeviceRecord(deviceRecordOf(bank.scope, randomId()))   // { record, wroteOverDamaged: false }: its device_id the first one stored
   */
  async advanceDeviceRecord(record: DeviceRecord): Promise<DeviceRecordAdvance> {
    MSX.deviceRecord.parse(record)
    const bankScopepath = Scopepath.bank(record)
    let advance: DeviceRecordAdvance = { record, wroteOverDamaged: false }
    // A store that runs the transaction again calls this again: the last call is the one stored.
    await storeAnswer('advanceDeviceRecord', () => this.doUpdate(bankScopepath, (stored) => {
      const isDamaged = stored !== undefined && stored !== null && deviceRecordAt(bankScopepath, stored) === null
      advance = { record: advancedDeviceRecord(stored, record), wroteOverDamaged: isDamaged }
      return advance.record
    }))
    return Object.freeze(advance)
  }

  tryAdvanceDeviceRecord(record: DeviceRecord): Promise<Outcome<DeviceRecordAdvance>> { return outcomeOf(() => this.advanceDeviceRecord(record)) }
  // --

  // == [Cached vaults]: findCachedVaults, putCachedVault, vaultCache, clearCachedVault, their try forms

  /** Every vault copy this device keeps of a bank's scope, as stored. A row that is no copy, or a copy whose own scope, or whose records' scope, is not the one it is filed under, is erased and left out, each erasure told to `onBadNews` as a 'corrupt_record'; the listing judges the rest at its hello. */
  async findCachedVaults(scope: BankScope, onBadNews?: OnBadNews): Promise<readonly VaultCacheable[]> {
    const prefix = Scopepath.withinBankScopepathPrefix(scope)
    const tell = MSX.onBadNews.parse(onBadNews)
    const found = await storeAnswer('findCachedVaults', () => this.doFind(prefix))
    const misfiled = found.filter(({ scopepath, row }) => ! isCopyFiledAt(scopepath, row))
    await Promise.all(misfiled.map(async ({ scopepath }) => {
      await storeAnswer('findCachedVaults', () => this.doDelDamaged(scopepath, (row) => isCopyFiledAt(scopepath, row)))
      tell?.(RefusalFuncs.misfiledCachedCopy())
    }))
    return found.flatMap(({ scopepath, row }) => (isCopyFiledAt(scopepath, row) ? [row] : []))
  }

  tryFindCachedVaults(scope: BankScope, onBadNews?: OnBadNews): Promise<Outcome<readonly VaultCacheable[]>> { return outcomeOf(() => this.findCachedVaults(scope, onBadNews)) }

  /** Store `cacheable` as this device's copy of its vault, in place of any before. */
  async putCachedVault(cacheable: VaultCacheable): Promise<void> {
    MSX.vaultCacheable.parse(cacheable)
    const vaultScopepath = Scopepath.vault(cacheable)
    await storeAnswer('putCachedVault', () => this.doPut(vaultScopepath, cacheable))
  }

  tryPutCachedVault(cacheable: VaultCacheable): Promise<Outcome<void>> { return outcomeOf(() => this.putCachedVault(cacheable)) }

  /** The device cache of a bank's vaults, as its vault listing takes it: `load` is {@link findCachedVaults}, telling `onBadNews` of each copy it erases, and `save` is {@link putCachedVault}.
   *
   * @example new VaultListing({ world, store, cache: deviceDB.vaultCache(bank.scope, (news) => { listing.tellBadNews([news]) }), maxMillisSinceRefresh })
   */
  vaultCache(scope: BankScope, onBadNews?: OnBadNews): Cache<VaultRecord, VaultSparse> {
    const bankScope = CX.bankScope.parse(scope)
    const tell = MSX.onBadNews.parse(onBadNews)
    return Object.freeze({
      load: () => this.findCachedVaults(bankScope, tell),
      save: (cacheable: VaultCacheable) => this.putCachedVault(cacheable),
    })
  }

  /** Erase what this device keeps of one vault, sound or damaged: its lease and its cached copy. The device record stays, so the rollback guard outlives the copy. */
  async clearCachedVault(scope: VaultScope): Promise<void> {
    const leaseScopepath = Scopepath.lease(scope)
    const vaultScopepath = Scopepath.vault(scope)
    await Promise.all([
      storeAnswer('clearCachedVault', () => this.doDel(leaseScopepath)),
      storeAnswer('clearCachedVault', () => this.doDel(vaultScopepath)),
    ])
  }

  tryClearCachedVault(scope: VaultScope): Promise<Outcome<void>> { return outcomeOf(() => this.clearCachedVault(scope)) }
  // --

  // == [Erasing everything]: delAll, its try form

  /** Erase every row this store keeps: each lease, each cached copy and each device record. */
  async delAll(): Promise<void> {
    await storeAnswer('delAll', () => this.doDelAll())
  }

  tryDelAll(): Promise<Outcome<void>> { return outcomeOf(() => this.delAll()) }
  // --

  // == [The half you write]: doGet, doPut, doUpdate, doDel, doFind, doDelDamaged, doDelAll

  /** The row under `scopepath` exactly as stored, undefined or null for none. */
  protected abstract doGet(scopepath: string): Promise<unknown>
  /** Store `row` under `scopepath`, in place of any row there. */
  protected abstract doPut(scopepath: string, row: DeviceRow): Promise<void>
  /** Read the row under `scopepath` (undefined for none), hand it to `updatedFrom`, and store what that returns, as one read-modify-write.
   * No write may land between the read and the write, or two tabs advancing at once could undo each
   * other's record. A store that runs the transaction again on a conflict calls `updatedFrom` again,
   * with the row it then reads. Let a throw from `updatedFrom` abort the transaction.
   */
  protected abstract doUpdate(scopepath: string, updatedFrom: (stored: unknown) => DeviceRow): Promise<void>
  /** Delete the row under `scopepath`, if any. */
  protected abstract doDel(scopepath: string): Promise<void>
  /** Every row whose scopepath begins with `prefix`, each with its scopepath, exactly as stored, in any order. */
  protected abstract doFind(prefix: string): Promise<readonly FoundRow[]>
  /** Delete the row under `scopepath` if, and only if, `isSound` is false of it as read in the same transaction that deletes it.
   * A write made since the base class found the row damaged may have stored a sound one, and that
   * row is never discarded. Hand `isSound` the row exactly as stored, undefined for none.
   */
  protected abstract doDelDamaged(scopepath: string, isSound: (row: unknown) => boolean): Promise<void>
  /** Delete every row this store keeps. */
  protected abstract doDelAll(): Promise<void>
  // --
}

// == [Rows]: DeviceRow, FoundRow, DeviceVerb, OnBadNews

/** What a {@link DeviceDB} stores: a lease record, a device record or a vault's cached copy. */
export type DeviceRow = LeaseRecord | DeviceRecord | VaultCacheable

/** One row a {@link DeviceDB}'s `doFind` answers: its scopepath and the row exactly as stored. */
export type FoundRow = Readonly<{ scopepath: string, row: unknown }>

/** A verb of {@link DeviceDB} that reaches the store, by its throwing form's name: `getLease`, whose `try` form is `tryGetLease`. */
export type DeviceVerb = keyof typeof Phrases.DeviceStoreFailed

/** Where a {@link DeviceDB} tells of a damaged row it erased, as a bank's `onBadNews` hears it: never awaited, and one that throws fails the find, so a bank hands its listing's `tellBadNews`, which never throws. */
export type OnBadNews = (news: VaultError) => unknown
// --

// == [The device record]: deviceRecordOf, advancedDeviceRecord, highestGateEpochOf

/** The device record of a bank's `scope` holding `device_id` and the epochs seen, checked and frozen: built from the scope's parsed names, so nothing else `scope` carries is stored.
 * Throws 'bad_scope' for a scope that fails its check, and 'bad_record' for a `device_id` or an
 * epoch that does.
 *
 * @example deviceRecordOf(bank.scope, randomId())                                        // no epoch seen yet
 * @example deviceRecordOf(bank.scope, deviceId, [{ vaultlabel: 'main', gate_epoch: 3 }])
 */
export const deviceRecordOf = (scope: BankScope, device_id: string, highest_gate_epochs: readonly GateEpochSeen[] = []): DeviceRecord => {
  const { applabel, user_id } = CX.bankScope.parse(scope)
  return MSX.deviceRecord.parse({ fmt: MSX.DeviceRecordFormat, applabel, user_id, device_id, highest_gate_epochs })
}

/** The device record a {@link DeviceDB.advanceDeviceRecord} stores, given what is stored under its scopepath (`stored`, as read, unchecked) and the `record` handed to it.
 * Where `stored` is a device record of the same scope, its `device_id` stays, and each vault keeps
 * the higher `gate_epoch` of the two: a lower one never replaces a higher. Anything else stored --
 * none, or a row that fails its check -- gives way to `record` as it came.
 *
 * @example advancedDeviceRecord(undefined, record)   // record
 */
export const advancedDeviceRecord = (stored: unknown, record: DeviceRecord): DeviceRecord => {
  const storedRecord = deviceRecordAt(Scopepath.bank(record), stored)
  if (storedRecord === null) { return record }
  const highest = new Map(storedRecord.highest_gate_epochs.map(({ vaultlabel, gate_epoch }) => [vaultlabel, gate_epoch]))
  for (const { vaultlabel, gate_epoch } of record.highest_gate_epochs) {
    highest.set(vaultlabel, Math.max(gate_epoch, highest.get(vaultlabel) ?? 0))
  }
  const epochs = [...highest].map(([vaultlabel, gate_epoch]) => ({ vaultlabel, gate_epoch }))
  return deviceRecordOf(storedRecord, storedRecord.device_id, epochs)
}

/** The highest `gate_epoch` `record` has seen of the vault `vaultlabel` names, 0 where it has seen none. */
export const highestGateEpochOf = (record: DeviceRecord, vaultlabel: string): number => (
  record.highest_gate_epochs.find((seen) => seen.vaultlabel === vaultlabel)?.gate_epoch ?? 0
)

/** `stored`, a row filed under `bankScopepath`, checked: the device record, or null for one that fails its check or names another scope, as for none. */
const deviceRecordAt = (bankScopepath: string, stored: unknown): DeviceRecord | null => {
  const checked = MSX.deviceRecord.safeParse(stored)
  if (! checked.success || Scopepath.bank(checked.data) !== bankScopepath) { return null }
  return checked.data
}

/** True for a vault copy filed under its own scope's scopepath, whose `central`, and `staged` where it holds one, name that scope too: the listing revives the copy under its central's. Only its filing is judged here; the listing judges the copy. */
const isCopyFiledAt = (scopepath: string, row: unknown): row is VaultCacheable => {
  const checked = MSX.vaultCacheable.safeParse(row)
  if (! checked.success || Scopepath.vault(checked.data) !== scopepath) { return false }
  const { central, staged } = checked.data
  return isRecordFiledAt(scopepath, central) && (staged === null || isRecordFiledAt(scopepath, staged))
}

/** True for a record whose scope's scopepath is `scopepath`. */
const isRecordFiledAt = (scopepath: string, record: unknown): boolean => {
  const scope = CX.vaultScope.safeParse(record)
  return scope.success && Scopepath.vault(scope.data) === scopepath
}
// --

// == [Device trouble]: storeAnswer, deviceTrouble

/** Call `hook`, one `do*` method of `verb`, resolving its answer: a VaultError it throws passes as it came, and anything else becomes the refusal {@link deviceTrouble} makes of it. */
const storeAnswer = async <AnswerT>(verb: DeviceVerb, hook: () => Promise<AnswerT>): Promise<AnswerT> => {
  try {
    return await hook()
  } catch (err) {
    throw isVaultError(err) ? err : deviceTrouble(verb, err)
  }
}

/** The refusal a failure of the device store's `verb` becomes: 'storage_blocked' for what {@link isStorageBlocked} names of `thrown`, else 'storage_unavailable', naming no scope and keeping nothing of `thrown` but its `name`.
 * Not its message and not as a `cause`: a device store is handed every lease record, and what it
 * throws may quote one, while a logger hands the refusal to the host whole (G8).
 */
const deviceTrouble = (verb: DeviceVerb, thrown: unknown): VaultError => {
  const said: Phrases.DeviceStoreSaid = Phrases.DeviceStoreFailed[verb]
  const thrownName = thrownNameOf(thrown)
  return isStorageBlocked(thrown) ? RefusalFuncs.deviceStoreBlocked(said, thrownName) : RefusalFuncs.deviceStoreUnavailable(said, thrownName)
}
// --
