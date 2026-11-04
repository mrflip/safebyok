import { consistent } from '../checks/validator'
import { type CipherCtxRecord, cipherBytes, cipherCtx, decipherBytes, makeBoxKey, makeLeaseKey, unwrapKeyUnder, wrapKeyUnder } from '../crypto'
import { tattoo } from '../helpers'
import { type Outcome, outcomeOf, valOf } from '../outcome'
import { damagedLease, leaseNotInForce, unopenedWhisper } from '../helpers/throwers'
import { type LeaseFriend, type LeaseGrantOpts, type LeaseRecord, type LeaseSparse, type LeaseStamp, type SealedWhisper, type VaultStamp, type WayinKind, LeaseFormat, leaseFromCacheArgs, leaseGrantArgs, leaseRecord, leaseSealArgs, leaseStamp, leaseUnsealArgs, sealedWhisper, vaultStamp } from './models-shapes'

// == [Lease]

/** A vault's vaultKey in force on this device, good for one `gate_epoch`. It holds the key wrapped under a non-extractable leaseKey, opens it for a single call, and never hands it out. */
export class Lease implements LeaseStamp {
  declare readonly fmt:           typeof LeaseFormat
  declare readonly applabel:      string
  declare readonly user_id:       string
  declare readonly vaultlabel:    string
  declare readonly vault_tok:     string
  declare readonly registered_at: number
  declare readonly gate_epoch:    number
  declare readonly proved_at:     number
  declare readonly wayinkind:     WayinKind
  /** All this lease hears of its vault. */
  readonly #friend: LeaseFriend

  /** The record with its keys, null once out of force. */
  #record: LeaseRecord | null

  /** The stamp of the vault this lease is of, parsed once: what every ctx under it binds. */
  readonly #vaultStamp: VaultStamp

  /** True where this lease came from the cache, so caching it has nothing to do. */
  readonly #isFromCache: boolean

  private constructor(friend: LeaseFriend, record: LeaseRecord, isFromCache: boolean) {
    this.#record = leaseRecord.parse(record)
    tattoo(this, leaseStamp.parse(record), { writable: false, configurable: false })
    this.#friend = friend
    this.#vaultStamp = vaultStamp.parse(friend)
    this.#isFromCache = isFromCache
    Object.freeze(this)
  }

  // == [Making one]: buildFromCache, grant

  /** The lease cached for `gate_epoch`, or null so the vault asks for a proof. A row of another epoch or stamp is uncached;
   * one past autolock stays, not loaded, for a later proof to write over or `bank.autolock` to erase.
   * A store that refuses, or a row that will not read, is bad news and null, the row left standing.
   */
  static async buildFromCache(friend: LeaseFriend, gate_epoch: number): Promise<Lease | null> {
    leaseFromCacheArgs.parse({ friend, gate_epoch })
    const peeked = await friend.tryPeekLease()
    if (! peeked.ok) {
      friend.tellBadNews([peeked.err])
      return null
    }
    if (peeked.val === null) { return null }
    const checked = leaseRecord.safeParse(peeked.val)
    // The damaged row stands until the next lease is cached over it.
    if (! checked.success) {
      friend.tellBadNews([damagedLease()])
      return null
    }
    if (checked.data.gate_epoch !== gate_epoch || ! consistent(vaultStamp.parse(checked.data), vaultStamp.parse(friend))) {
      await uncacheForgotten(friend)
      return null
    }
    if (isPastAutolock(checked.data, friend)) { return null }
    return new Lease(friend, checked.data, true)
  }

  /** A new lease under a fresh leaseKey. The vault holds it, and caches it. */
  static async grant(friend: LeaseFriend, vaultKey: CryptoKey, opts: LeaseGrantOpts): Promise<Lease> {
    const { opts: { gate_epoch, wayinkind } } = leaseGrantArgs.parse({ friend, vaultKey, opts })
    const held     = vaultStamp.parse(friend)
    const granted  = leaseStamp.parse({ fmt: LeaseFormat, ...held, gate_epoch, proved_at: friend.clock.now(), wayinkind })
    const leaseKey = await makeLeaseKey()
    const vault_key_lease_wrapped = await wrapKeyUnder(leaseKey, vaultKey, cipherCtx([held, granted], 'vault_key_lease_wrapped'))
    return new Lease(friend, leaseRecord.parse({ ...granted, lease_key: leaseKey, vault_key_lease_wrapped }), false)
  }
  // --

  // == [Taking hold]: cache, tryCache, cacheAsCacheCan

  /** Put this lease in the deviceDB's cache; one built from the cache has nothing to do. A refusal costs the next session a proof, not this one its lease. */
  async cache(): Promise<void> {
    if (this.#isFromCache) { return }
    valOf(await this.#friend.tryCacheLease(this.#demandRecord()))
  }

  tryCache(): Promise<Outcome<void>> { return outcomeOf(() => this.cache()) }

  /** Cache this lease if it can. A refusal is bad news: it costs the next session a proof, not this one its lease. */
  async cacheAsCacheCan(): Promise<void> {
    const cached = await this.tryCache()
    if (! cached.ok) { this.#friend.tellBadNews([cached.err]) }
  }
  // --

  // == [Ending one]: vacate, tryVacate, evict, isForgotten, isInForce

  /** Drop the keys and uncache the record, so this device is locked. */
  async vacate(): Promise<void> {
    if (this.#record === null) { return }
    this.evict()
    valOf(await this.#friend.tryUncacheLease())
  }

  tryVacate(): Promise<Outcome<void>> { return outcomeOf(() => this.vacate()) }

  /** Drop the keys, leaving the cached record for the next session. */
  evict(): void { this.#record = null }

  get isForgotten(): boolean { return this.#record === null }

  get isInForce(): boolean { return this.#record !== null }
  // --

  // == [Its stamp]: toJSON

  toJSON(): LeaseSparse { return this.#leaseStamp }
  // --

  // == [Whispers under the vaultKey]: sealWith, unsealWith, ctxOf

  /** `whisperText` sealed under a fresh boxKey, both bound to `stamp`. */
  async sealWith(whisperText: string, stamp: CipherCtxRecord): Promise<SealedWhisper> {
    leaseSealArgs.parse({ whisperText, stamp })
    const vaultKey = await this.#vaultKey('wrapKey')
    const boxKey = await makeBoxKey()
    const box_key_wrapped = await wrapKeyUnder(vaultKey, boxKey, this.#ctxOf(stamp, 'box_key_wrapped'))
    const bytes = new TextEncoder().encode(whisperText)
    try {
      const whisper_ciphered = await cipherBytes(boxKey, bytes, this.#ctxOf(stamp, 'whisper_ciphered'))
      this.#demandRecord()
      return sealedWhisper.parse({ box_key_wrapped, whisper_ciphered })
    } finally {
      bytes.fill(0)
    }
  }

  /** The text `sealed` holds, bound to `stamp`: what `sealWith` sealed. */
  async unsealWith(sealed: SealedWhisper, stamp: CipherCtxRecord): Promise<string> {
    leaseUnsealArgs.parse({ sealed, stamp })
    const vaultKey = await this.#vaultKey('unwrapKey')
    const bytes = await this.#opened(vaultKey, sealed, stamp)
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
  // --

  // == [The vaultKey]: demandRecord, vaultKey, leaseStamp

  /** The record, while the lease is in force. */
  #demandRecord(): LeaseRecord {
    if (this.#record === null) { throw leaseNotInForce() }
    return this.#record
  }

  /** The vaultKey for this one call, non-extractable, with the one usage. Nothing keeps the key between calls. */
  async #vaultKey(usage: 'wrapKey' | 'unwrapKey'): Promise<CryptoKey> {
    const { lease_key, vault_key_lease_wrapped } = this.#demandRecord()
    const ctx = cipherCtx([this.#vaultStamp, this.#leaseStamp], 'vault_key_lease_wrapped')
    const opened = await outcomeOf(() => unwrapKeyUnder(lease_key, vault_key_lease_wrapped, ctx, { extractable: false, usage: [usage] }), damagedLease)
    if (! opened.ok) {
      // Locking drops the vault's lease and uncaches by scope; this one is evicted too, should the vault hold another.
      this.#friend.lock()
      this.evict()
    }
    return valOf(opened)
  }

  get #leaseStamp(): LeaseStamp { return leaseStamp.parse(this) }
  // --
}
// --

// == [Judging the cached record]: isPastAutolock, uncacheForgotten

/** True once a row was proved longer ago than the autolock duration: due for locking, as `bank.autolock` judges it. */
const isPastAutolock = ({ proved_at }: LeaseStamp, { clock, leaseMillis }: LeaseFriend): boolean => clock.now() - proved_at > leaseMillis

/** Uncache a record no use to this vault, warning of a refusal: tried once, never again (notes/wontfix.md). */
const uncacheForgotten = async (friend: LeaseFriend): Promise<void> => {
  const del = await friend.tryUncacheLease()
  if (! del.ok) { friend.logger.warn("This device's lease could not be erased: the next lease is written over it.", { call: 'Lease.buildFromCache', refusalkind: del.err.refusalkind }) }
}
// --
