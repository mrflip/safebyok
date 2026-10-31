import { consistent } from '../checks/validator'
import { FarFuture, ForeverMillis } from '../consts'
import { type CipherCtxRecord, cipherBytes, cipherCtx, decipherBytes, makeBoxKey, makeLeaseKey, unwrapKeyUnder, wrapKeyUnder } from '../crypto'
import { VaultError } from '../errors'
import { adorn, tattoo } from '../helpers'
import { Trigger } from '../helpers/trigger'
import { type Outcome, outcomeOf, valOf } from '../outcome'
import * as Phrases from '../phrases'
import { type LeaseDBFriend, type LeaseGrantOpts, type LeaseRecord, type LeaseSparse, type LeaseStamp, type LeaseVault, type SealedWhisper, type VaultStamp, LeaseFormat, leaseGetArgs, leaseGrantArgs, leaseRecord, leaseSealArgs, leaseStamp, leaseUnsealArgs, sealedWhisper, serializedBytes, vaultStamp } from './models-shapes'

// == [Lease]

export class Lease implements LeaseStamp {
  declare readonly fmt:           typeof LeaseFormat
  declare readonly applabel:      string
  declare readonly user_id:       string
  declare readonly vaultlabel:    string
  declare readonly vault_tok:     string
  declare readonly registered_at: number
  declare readonly autolock_at:   number
  declare readonly vault:         LeaseVault
  declare readonly dbfriend:      LeaseDBFriend

  /** The record with its keys, null once forgotten. */
  #record: LeaseRecord | null

  /** The stamp of the vault this lease is of, parsed once: what every ctx under it binds. */
  readonly #vaultStamp: VaultStamp

  /** Fires `vault.lock()` at `autolock_at`; disposed when the lease is forgotten or let go. */
  readonly #autolock: Trigger<LeaseSparse, void>

  private constructor(vault: LeaseVault, dbfriend: LeaseDBFriend, record: LeaseRecord) {
    this.#record = leaseRecord.parse(record)
    tattoo(this, leaseStamp.parse(record), { writable: false, configurable: false })
    adorn(this, 'vault', vault)
    adorn(this, 'dbfriend', dbfriend)
    this.#vaultStamp = vaultStamp.parse(vault)
    this.#autolock = new Trigger({
      clock:          vault.clock,
      maxMillis:      ForeverMillis,
      eagerFrac:      1,
      doSnapshot:     () => this.toJSON(),
      doTryLaunch:    () => outcomeOf(() => this.#autolockNow()),
      onTimerRefusal: (err) => { dbfriend.logger.warn('The autolock fired, but forgetting the lease was refused.', { call: 'Lease.autolock', refusalkind: err.refusalkind }) },
    })
    Object.freeze(this)
    this.#autolock.scheduleLaunchAt(this.autolock_at)
  }

  // == [Making one]: get, tryGet, grant

  /** The lease this device keeps of `vault`, or null for none; one past its `autolock_at` is forgotten, its record erased, and answers null. */
  static async get(vault: LeaseVault, dbfriend: LeaseDBFriend): Promise<Lease | null> {
    leaseGetArgs.parse({ vault, dbfriend })
    const kept = await dbfriend.tryGetLease()
    if (! kept.ok) { throw kept.err }
    if (kept.val === null) { return null }
    const checked = leaseRecord.safeParse(kept.val)
    if (! checked.success || ! consistent(vaultStamp.parse(checked.data), vaultStamp.parse(vault))) {
      // Neither the record nor what it failed is told: it may hold key material.
      dbfriend.logger.warn("This device's lease could not be read as a lease of this vault, so it counts as none and was left where it lies: the vault asks for the passphrase, and the next grant writes over it.", { call: 'Lease.get' })
      return null
    }
    if (checked.data.autolock_at <= vault.clock.now()) {
      await eraseKept(dbfriend, 'Lease.get')
      return null
    }
    return new Lease(vault, dbfriend, checked.data)
  }

  static tryGet(vault: LeaseVault, dbfriend: LeaseDBFriend): Promise<Outcome<Lease | null>> {
    return outcomeOf(() => this.get(vault, dbfriend))
  }

  static async grant(vault: LeaseVault, dbfriend: LeaseDBFriend, vaultKey: CryptoKey, opts: LeaseGrantOpts): Promise<Lease> {
    const { opts: { leaseMillis } } = leaseGrantArgs.parse({ vault, dbfriend, vaultKey, opts })
    const held     = vaultStamp.parse(vault)
    const granted  = leaseStamp.parse({ fmt: LeaseFormat, ...held, autolock_at: Math.min(vault.clock.now() + leaseMillis, FarFuture) })
    const leaseKey = await makeLeaseKey()
    const vault_key_lease_wrapped = await wrapKeyUnder(leaseKey, vaultKey, cipherCtx([held, granted], 'vault_key_lease_wrapped'))
    const record = leaseRecord.parse({ ...granted, lease_key: leaseKey, vault_key_lease_wrapped })
    const put = await dbfriend.tryPutLease(record)
    // The deviceDB is a cache: a put refused costs the next session a passphrase, not this one its proof.
    if (! put.ok) { dbfriend.logger.warn('The lease was granted but could not be kept on this device: the next session asks for the passphrase again.', { call: 'Lease.grant', refusalkind: put.err.refusalkind }) }
    return new Lease(vault, dbfriend, record)
  }
  // --

  // == [Ending one]: forget, letGo, isForgotten, isInForce, autolockNow

  /** Drop the keys and erase the record where the deviceDB keeps it. Nothing here has bytes to zero: the leaseKey is a non-extractable handle, and the wrap is ciphertext; dropping the record is all that can be done. */
  async forget(): Promise<void> {
    if (this.#record === null) { return }
    this.letGo()
    const del = await this.dbfriend.tryDelLease()
    if (! del.ok) { throw del.err }
  }

  /** Drop the keys and dispose the autolock, leaving the record the deviceDB keeps: a lease displaced or declined, or one its vault said goodbye to. */
  letGo(): void {
    this.#record = null
    this.#autolock.dispose()
  }

  get isForgotten(): boolean { return this.#record === null }

  get isInForce(): boolean { return this.#record !== null && this.#autolock.isTimely }

  /** The autolock's launch: lock the vault, which forgets the lease it holds; forget here too, for a lease the vault never took up. */
  async #autolockNow(): Promise<void> {
    this.vault.lock()
    await this.forget()
  }
  // --

  // == [Its stamp]: toJSON

  toJSON(): LeaseSparse { return this.#leaseStamp }
  // --

  // == [Whispers under the vaultKey]: sealWith, unsealWith, ctxOf

  /** The bytes are judged first and zeroed whatever follows: a malformed stamp still spends them. */
  async sealWith(serializedWhisper: Uint8Array, boxKeyStamp: CipherCtxRecord, whisperStamp: CipherCtxRecord): Promise<SealedWhisper> {
    serializedBytes.parse(serializedWhisper)
    try {
      leaseSealArgs.parse({ boxKeyStamp, whisperStamp })
      const vaultKey = await this.#vaultKey('wrapKey')
      const boxKey = await makeBoxKey()
      const box_key_wrapped  = await wrapKeyUnder(vaultKey, boxKey, this.#ctxOf(boxKeyStamp, 'box_key_wrapped'))
      const whisper_ciphered = await cipherBytes(boxKey, serializedWhisper, this.#ctxOf(whisperStamp, 'whisper_ciphered'))
      return sealedWhisper.parse({ box_key_wrapped, whisper_ciphered })
    } finally {
      serializedWhisper.fill(0)
    }
  }

  async unsealWith(sealed: SealedWhisper, boxKeyStamp: CipherCtxRecord, whisperStamp: CipherCtxRecord): Promise<Uint8Array> {
    leaseUnsealArgs.parse({ sealed, boxKeyStamp, whisperStamp })
    const vaultKey = await this.#vaultKey('unwrapKey')
    const boxKeyCtx  = this.#ctxOf(boxKeyStamp, 'box_key_wrapped')
    const whisperCtx = this.#ctxOf(whisperStamp, 'whisper_ciphered')
    const opened = await outcomeOf(async () => {
      const boxKey = await unwrapKeyUnder(vaultKey, sealed.box_key_wrapped, boxKeyCtx, { extractable: false, usage: ['decrypt'] })
      return decipherBytes(boxKey, sealed.whisper_ciphered, whisperCtx)
    }, unopenedWhisper)
    return valOf(opened)
  }

  /** The caller's stamp under the vault's, bound to one of the lease's purposes. */
  #ctxOf(stamp: CipherCtxRecord, purpose: 'box_key_wrapped' | 'whisper_ciphered'): Uint8Array {
    return cipherCtx([this.#vaultStamp, stamp], purpose)
  }
  // --

  // == [The vaultKey]: demandRecord, vaultKey, leaseStamp

  /** The record, while the lease is in force: past `autolock_at`, or forgotten, refuses 'vault_locked'. */
  #demandRecord(): LeaseRecord {
    if (this.#record === null || ! this.#autolock.isTimely) { throw leaseNotInForce() }
    return this.#record
  }

  /** The vaultKey for this one call, non-extractable, with the one usage. A lease not in force refuses 'vault_locked'; one that will not open is dropped, locks the vault, and refuses 'damaged_lease'. Nothing keeps the key between calls. */
  async #vaultKey(usage: 'wrapKey' | 'unwrapKey'): Promise<CryptoKey> {
    const { lease_key, vault_key_lease_wrapped } = this.#demandRecord()
    const ctx = cipherCtx([this.#vaultStamp, this.#leaseStamp], 'vault_key_lease_wrapped')
    const opened = await outcomeOf(() => unwrapKeyUnder(lease_key, vault_key_lease_wrapped, ctx, { extractable: false, usage: [usage] }), damagedLease)
    if (! opened.ok) {
      // Locking drops the vault's lease; this one is dropped here too, should the vault hold another. A refused erase is warned of: the refusal told is the damage.
      this.vault.lock()
      this.letGo()
      await eraseKept(this.dbfriend, 'Lease.vaultKey')
    }
    return valOf(opened)
  }

  get #leaseStamp(): LeaseStamp { return leaseStamp.parse(this) }
  // --
}
// --

// == [Erasing the kept record]: eraseKept

/** Erase the record the deviceDB keeps, warning of a refusal: tried once, never again (notes/wontfix.md). */
const eraseKept = async (dbfriend: LeaseDBFriend, call: string): Promise<void> => {
  const del = await dbfriend.tryDelLease()
  if (! del.ok) { dbfriend.logger.warn("This device's lease could not be erased: the next grant writes over it.", { call, refusalkind: del.err.refusalkind }) }
}
// --

// == [Refusals]: damagedLease, unopenedWhisper, leaseNotInForce

const damagedLease = (): VaultError => new VaultError('damaged_lease', Phrases.DamagedLease)

const unopenedWhisper = (): VaultError => new VaultError('damaged_box', Phrases.UnopenedWhisper)

const leaseNotInForce = (): VaultError => new VaultError('vault_locked', Phrases.LeaseNotInForce)
// --
