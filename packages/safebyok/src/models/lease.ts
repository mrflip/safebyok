import type { Modelkind } from '../helpers/consts'
import { consistent } from '../helpers/validator'
import { nowMillis } from '../helpers/clock'
import { type CipherCtxRecord, cipherBytes, cipherCtx, decipherBytes, makeBoxKey, makeLeaseKey, unwrapKeyUnder, wrapKeyUnder } from '../helpers/crypto'
import { tattoo } from '../helpers/helpers'
import { isVaultError } from '../refusals/errors'
import { type Outcome, outcomeOf } from '../refusals/outcome'
import { damagedLease, leaseNotInForce, unopenedWhisper } from '../refusals/throwers'
import type { Wayinkind } from '../shapes/shapes-enums'
import { type LeaseFriend, type LeaseGrantOpts, type LeaseRecord, type LeaseSparse, type LeaseStamp, type SealedWhisper, type VaultStamp, LeaseFormat, leaseFriend, leaseFromCacheArgs, leaseGrantedArgs, leaseRecord, leaseSealArgs, leaseStamp, leaseUnsealArgs, sealedWhisper, vaultStamp } from '../shapes/shapes-gateish'

/** A vault's vaultKey in force on this device, good for one `gate_epoch`. It has the key wrapped under a non-extractable leaseKey, opens it for a single call, and never hands it out. */
export class Lease implements LeaseStamp {
  // == [Props]: fmt, applabel, user_id, vaultlabel, vault_tok, registered_at, gate_epoch, proved_at, wayinkind, #friend, #record, #vaultStamp, #isFromCache, #leaseStamp, toJSON

  declare readonly fmt:           typeof LeaseFormat
  declare readonly applabel:      string
  declare readonly user_id:       string
  declare readonly vaultlabel:    string
  declare readonly vault_tok:     string
  declare readonly registered_at: number
  declare readonly gate_epoch:    number
  declare readonly proved_at:     number
  declare readonly wayinkind:     Wayinkind

  /** All this lease hears of its vault. */
  readonly #friend: LeaseFriend

  /** The record with its keys, null once out of force. */
  #record: LeaseRecord | null

  /** The stamp of the vault this lease is of, parsed once: what every ctx under it binds. */
  readonly #vaultStamp: VaultStamp

  /** True where this lease came from the cache, so caching it has nothing to do. */
  readonly #isFromCache: boolean

  get #leaseStamp(): LeaseStamp { return leaseStamp.parse(this) }

  /** This lease's {@link LeaseSparse}, which has no key material. */
  toJSON(): LeaseSparse { return this.#leaseStamp }
  // --

  // == [Construction]: constructor, buildFromCache, buildGranted

  private constructor(friend: LeaseFriend, record: LeaseRecord, isFromCache: boolean) {
    this.#record = leaseRecord.parse(record)
    tattoo(this, leaseStamp.parse(record), { configurable: false })
    this.#friend = friend
    this.#vaultStamp = vaultStamp.parse(friend)
    this.#isFromCache = isFromCache
    Object.freeze(this)
  }

  /** The lease cached for `gate_epoch`, or null so the vault asks for a proof. A row of another epoch or stamp is forgotten;
   * one past autolock stays, not loaded, for a later proof to write over or `bank.autolock` to forget.
   * A device database that refuses, or a row that will not read, is bad news and null, the row left standing.
   */
  static async buildFromCache(friend: LeaseFriend, gate_epoch: number): Promise<Lease | null> {
    const { gate_epoch: epoch } = leaseFromCacheArgs.parse({ friend, gate_epoch })
    try {
      const peeked = await friend.peekLease()
      if (peeked === null) { return null }
      const checked = leaseRecord.safeParse(peeked)
      // The damaged row stands until the next lease is cached over it.
      if (! checked.success) { throw damagedLease() }
      if (checked.data.gate_epoch !== epoch) {
        await friend.tryForgetLease()
        return null
      }
      if (! consistent(vaultStamp.parse(checked.data), vaultStamp.parse(friend))) {
        await friend.tryForgetLease()
        throw damagedLease()
      }
      if (isPastAutolock(checked.data, friend)) { return null }
      return new Lease(friend, checked.data, true)
    } catch (err) {
      if (! isVaultError(err)) { throw err }
      friend.tellBadNews([err])
      return null
    }
  }

  /** A new lease under a fresh leaseKey. */
  static async buildGranted(friend: LeaseFriend, vaultKey: CryptoKey, opts: LeaseGrantOpts): Promise<Lease> {
    const { opts: { gate_epoch, wayinkind } } = leaseGrantedArgs.parse({ friend, vaultKey, opts })
    const vaultstamp = vaultStamp.parse(friend)
    const granted  = leaseStamp.parse({ fmt: LeaseFormat, ...vaultstamp, gate_epoch, proved_at: nowMillis(), wayinkind })
    const leaseKey = await makeLeaseKey()
    const vault_key_lease_wrapped = await wrapKeyUnder(leaseKey, vaultKey, cipherCtx([vaultstamp, granted], 'vault_key_lease_wrapped'))
    return new Lease(friend, leaseRecord.parse({ ...granted, lease_key: leaseKey, vault_key_lease_wrapped }), false)
  }
  // --

  // == [Caching]: cacheAsCacheCan

  // A refusal costs the next session a proof, not this one its lease.
  /** Caches this lease if it can, telling the host of a refusal as bad news. */
  async cacheAsCacheCan(): Promise<void> {
    if (this.#isFromCache) { return }
    const cached = await this.#friend.tryCacheLease(this.#demandRecord())
    if (! cached.ok) { this.#friend.tellBadNews([cached.err]) }
  }
  // --

  // == [Ending one]: revoke, tryRevoke, forget, tryForget, evict

  /** Drop the keys and forget the cached record, so this device is locked. */
  async revoke(): Promise<void> {
    if (this.#record === null) { return }
    this.evict()
    await this.#friend.forgetLease()
  }

  /** Non-throwing form of {@link revoke}. */
  tryRevoke(): Promise<Outcome<void>> { return outcomeOf(() => this.revoke()) }

  /** Forget the cached record with no lease granted to {@link revoke}: one may stand from an earlier session. */
  static async forget(friend: LeaseFriend): Promise<void> {
    await leaseFriend.parse(friend).forgetLease()
  }

  /** Non-throwing form of {@link forget}. */
  static tryForget(friend: LeaseFriend): Promise<Outcome<void>> { return outcomeOf(() => this.forget(friend)) }

  /** Drop the keys, leaving the cached record for the next session. */
  evict(): void { this.#record = null }
  // --

  // == [Whispers under the vaultKey]: sealWith, unsealWith, opened, ctxOf, vaultKey

  /** `whisperText` sealed under a fresh boxKey, both bound to `stamp`. */
  async sealWith(whisperText: string, stamp: CipherCtxRecord): Promise<SealedWhisper> {
    const checked = leaseSealArgs.parse({ whisperText, stamp })
    const vaultKey = await this.#vaultKey('wrapKey')
    const boxKey = await makeBoxKey()
    const box_key_wrapped = await wrapKeyUnder(vaultKey, boxKey, this.#ctxOf(checked.stamp, 'box_key_wrapped'))
    const bytes = new TextEncoder().encode(checked.whisperText)
    try {
      const whisper_ciphered = await cipherBytes(boxKey, bytes, this.#ctxOf(checked.stamp, 'whisper_ciphered'))
      this.#demandRecord()
      return sealedWhisper.parse({ box_key_wrapped, whisper_ciphered })
    } finally {
      bytes.fill(0)
    }
  }

  /** The text `sealed` contains, bound to `stamp`: what `sealWith` sealed. */
  async unsealWith(sealed: SealedWhisper, stamp: CipherCtxRecord): Promise<string> {
    const checked = leaseUnsealArgs.parse({ sealed, stamp })
    const vaultKey = await this.#vaultKey('unwrapKey')
    const bytes = await this.#opened(vaultKey, checked.sealed, checked.stamp)
    try {
      this.#demandRecord()
      return new TextDecoder().decode(bytes)
    } finally {
      bytes.fill(0)
    }
  }

  async #opened(vaultKey: CryptoKey, sealed: SealedWhisper, stamp: CipherCtxRecord): Promise<Uint8Array> {
    const boxKeyCtx  = this.#ctxOf(stamp, 'box_key_wrapped')
    const whisperCtx = this.#ctxOf(stamp, 'whisper_ciphered')
    // Only these two WebCrypto calls are trapped: their rejection is how a damaged whisper is learned. The calls above refuse as they are, or are bugs.
    try {
      const boxKey = await unwrapKeyUnder(vaultKey, sealed.box_key_wrapped, boxKeyCtx, { extractable: false, usage: ['decrypt'] })
      return await decipherBytes(boxKey, sealed.whisper_ciphered, whisperCtx)
    } catch {
      throw unopenedWhisper()
    }
  }

  /** The caller's stamp under the vault's, bound to one of the lease's purposes. */
  #ctxOf(stamp: CipherCtxRecord, purpose: 'box_key_wrapped' | 'whisper_ciphered'): Uint8Array {
    return cipherCtx([this.#vaultStamp, stamp], purpose)
  }

  /** The vaultKey for this one call, non-extractable, with the one usage. Nothing keeps the key between calls. */
  async #vaultKey(usage: 'wrapKey' | 'unwrapKey'): Promise<CryptoKey> {
    const { lease_key, vault_key_lease_wrapped } = this.#demandRecord()
    const ctx = cipherCtx([this.#vaultStamp, this.#leaseStamp], 'vault_key_lease_wrapped')
    // Only this WebCrypto call is trapped: its rejection is how a damaged lease is learned.
    try {
      return await unwrapKeyUnder(lease_key, vault_key_lease_wrapped, ctx, { extractable: false, usage: [usage] })
    } catch {
      // Locking drops the vault's lease and forgets its row by scope; this one is evicted too, should the vault have another.
      this.#friend.lock()
      this.evict()
      throw damagedLease()
    }
  }
  // --

  // == [Guards]: isPresent, demandRecord

  /** The lease still has its record, as `Storable.isPresent` says of a thing not gone. */
  get isPresent(): boolean { return this.#record !== null }

  /** The record, while the lease is in force. */
  #demandRecord(): LeaseRecord {
    if (this.#record === null) { throw leaseNotInForce() }
    return this.#record
  }
  // --

  /** Answers 'lease', which marks this model to a check: {@link Modelkind}. */
  get modelkind(): 'lease' { return 'lease' satisfies Modelkind }
}

// == [Judging the cached record]: isPastAutolock

/** True once a row was proved longer ago than the autolock duration: due for locking, as `bank.autolock` judges it. */
const isPastAutolock = ({ proved_at }: LeaseStamp, { leaseMillis }: LeaseFriend): boolean => nowMillis() - proved_at > leaseMillis
// --
