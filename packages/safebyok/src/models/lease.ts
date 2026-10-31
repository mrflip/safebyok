import { consistent } from '../checks/validator'
import { FarFuture, ForeverMillis } from '../consts'
import { cipherBytes, cipherCtx, decipherBytes, makeBoxKey, makeLeaseKey, unwrapKeyUnder, wrapKeyUnder } from '../crypto'
import { VaultError } from '../errors'
import { adorn, tattoo } from '../helpers'
import { Trigger } from '../helpers/trigger'
import { type Outcome, outcomeOf, valOf } from '../outcome'
import type { Ciphered } from '../shapes/fields'
import * as FX from '../shapes/fields'
import { type LeaseDBFriend, type LeaseGrantOpts, type LeaseRecord, type LeaseSparse, type LeaseStamp, type LeaseVault, type SealedWhisper, type UnwrapUsage, type VaultStamp, LeaseFormat, leaseGetArgs, leaseGrantArgs, leaseRecord, leaseSealArgs, leaseStamp, leaseUnsealArgs, leaseUnwrapArgs, leaseWrapArgs, sealedWhisper, vaultStamp } from './models-shapes'

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

  /** Fires `vault.lock()` at `autolock_at`; disposed when the lease is forgotten. */
  readonly #autolock: Trigger<LeaseSparse, void>

  private constructor(vault: LeaseVault, dbfriend: LeaseDBFriend, record: LeaseRecord) {
    this.#record = leaseRecord.parse(record)
    tattoo(this, leaseStamp.parse(record), { writable: false, configurable: false })
    adorn(this, 'vault', vault)
    adorn(this, 'dbfriend', dbfriend)
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

  // == [Ending one]: forget, isForgotten, isInForce, autolockNow

  /** Drop the keys and erase the record where the deviceDB keeps it. Nothing here has bytes to zero: the leaseKey is a non-extractable handle, and the wrap is ciphertext; dropping the record is all that can be done. */
  async forget(): Promise<void> {
    if (this.#record === null) { return }
    this.#record = null
    this.#autolock.dispose()
    const del = await this.dbfriend.tryDelLease()
    if (! del.ok) { throw del.err }
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

  // == [Keys under the vaultKey]: wrapKey, unwrapKey

  async wrapKey(wrappedKey: CryptoKey, ctx: Uint8Array): Promise<Ciphered> {
    leaseWrapArgs.parse({ wrappedKey, ctx })
    const vaultKey = await this.#vaultKey('wrapKey')
    return FX.ciphered.parse(await wrapKeyUnder(vaultKey, wrappedKey, ctx))
  }

  async unwrapKey(wrapped: Ciphered, ctx: Uint8Array, usage: UnwrapUsage): Promise<CryptoKey> {
    leaseUnwrapArgs.parse({ wrapped, ctx, usage })
    const vaultKey = await this.#vaultKey('unwrapKey')
    return valOf(await outcomeOf(() => unwrapKeyUnder(vaultKey, wrapped, ctx, { extractable: false, usage: [usage] }), unopenedKey))
  }
  // --

  // == [Whispers under the vaultKey]: sealWith, unsealWith

  async sealWith(serializedWhisper: Uint8Array, boxKeyCtx: Uint8Array, whisperCtx: Uint8Array): Promise<SealedWhisper> {
    try {
      leaseSealArgs.parse({ serializedWhisper, boxKeyCtx, whisperCtx })
      const vaultKey = await this.#vaultKey('wrapKey')
      const boxKey = await makeBoxKey()
      const box_key_wrapped  = await wrapKeyUnder(vaultKey, boxKey, boxKeyCtx)
      const whisper_ciphered = await cipherBytes(boxKey, serializedWhisper, whisperCtx)
      return sealedWhisper.parse({ box_key_wrapped, whisper_ciphered })
    } finally {
      if (serializedWhisper instanceof Uint8Array) { serializedWhisper.fill(0) }
    }
  }

  async unsealWith(sealed: SealedWhisper, boxKeyCtx: Uint8Array, whisperCtx: Uint8Array): Promise<Uint8Array> {
    leaseUnsealArgs.parse({ sealed, boxKeyCtx, whisperCtx })
    const vaultKey = await this.#vaultKey('unwrapKey')
    const opened = await outcomeOf(async () => {
      const boxKey = await unwrapKeyUnder(vaultKey, sealed.box_key_wrapped, boxKeyCtx, { extractable: false, usage: ['decrypt'] })
      return decipherBytes(boxKey, sealed.whisper_ciphered, whisperCtx)
    }, unopenedWhisper)
    return valOf(opened)
  }
  // --

  // == [The vaultKey]: demandRecord, vaultKey, vaultStamp, leaseStamp

  #demandRecord(): LeaseRecord {
    if (this.#record === null) { throw leaseForgotten() }
    return this.#record
  }

  /** The vaultKey for this one call, non-extractable, with the one usage; a lease that will not open locks the vault and refuses 'damaged_lease'. Nothing keeps the key between calls. */
  async #vaultKey(usage: 'wrapKey' | 'unwrapKey'): Promise<CryptoKey> {
    const { lease_key, vault_key_lease_wrapped } = this.#demandRecord()
    const ctx = cipherCtx([this.#vaultStamp, this.#leaseStamp], 'vault_key_lease_wrapped')
    const opened = await outcomeOf(() => unwrapKeyUnder(lease_key, vault_key_lease_wrapped, ctx, { extractable: false, usage: [usage] }), damagedLease)
    if (! opened.ok) { this.vault.lock() }
    return valOf(opened)
  }

  get #vaultStamp(): VaultStamp { return vaultStamp.parse(this.vault) }
  get #leaseStamp(): LeaseStamp { return leaseStamp.parse(this) }
  // --
}
// --

// == [Refusals]: damagedLease, unopenedWhisper, unopenedKey, leaseForgotten

const damagedLease = (): VaultError => new VaultError('damaged_lease', "This device's lease would not open, so the vault was locked: unlock it again to carry on.")

const unopenedWhisper = (): VaultError => new VaultError('damaged_box', "That whisper would not open under this vault's key: it was altered in storage, or sealed under another vault. Nothing was changed.")

const unopenedKey = (): VaultError => new VaultError('damaged_box', "That wrapped key would not open under this vault's key: it was altered in storage, or wrapped under another vault. Nothing was changed.")

const leaseForgotten = (): VaultError => new VaultError('vault_locked', 'This lease was forgotten when the vault locked: unlock the vault again.')
// --
