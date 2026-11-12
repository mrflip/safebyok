import type { Modelkind } from '../helpers/consts'
import { isConsistent } from '../helpers/validator'
import { nowMillis } from '../helpers/clock'
import { type CipherCtxRecord, cipherBytes, cipherCtx, decipherBytes, makeBoxKey, makeLeaseKey, unwrapKeyUnder, wrapKeyUnder } from '../helpers/crypto'
import { tattoo } from '../helpers/helpers'
import { isVaultError } from '../refusals/errors'
import { type Outcome, outcomeOf } from '../refusals/outcome'
import { damagedLease, leaseNotInForce, undecipheredWhisper } from '../refusals/throwers'
import type { Wayinkind } from '../shapes/shapes-enums'
import { type BankStamp, type CitedGate, type LeaseFriend, type LeaseGrantOpts, type LeaseRecord, type LeaseSparse, type LeaseStamp, type SealedWhisper, LeaseFormat, bankStamp, leaseFriend, leaseFromCacheArgs, leaseGrantedArgs, leaseRecord, leaseSealArgs, leaseStamp, leaseUnsealArgs, sealedWhisper } from '../shapes/shapes-gateish'

/** A bankKey in force on this device, good for one revision of its bank's gate. It has the key wrapped under a non-extractable leaseKey, unwraps it for a single call, and never hands it out. */
export class Lease implements LeaseStamp {
  // == [Props]: fmt, user_id, banklabel, bank_tok, registered_at, gatelabel, gate_tok, gate_revision_tok, proved_at, wayinkind, #bankFriend, #record, #bankStamp, #isFromCache, #leaseStamp, toJSON

  declare readonly fmt:               typeof LeaseFormat
  declare readonly user_id:           string
  declare readonly banklabel:         string
  declare readonly bank_tok:          string
  declare readonly registered_at:     number
  declare readonly gatelabel:         LeaseStamp['gatelabel']
  declare readonly gate_tok:          string
  declare readonly gate_revision_tok: string
  declare readonly proved_at:         number
  declare readonly wayinkind:         Wayinkind

  /** All this lease hears of its bank. */
  readonly #bankFriend: LeaseFriend

  /** The record with its keys, null once out of force. */
  #record: LeaseRecord | null

  /** The stamp of the bank this lease is of, parsed once: what every ctx under it binds first. */
  readonly #bankStamp: BankStamp

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
    this.#bankFriend = friend
    this.#bankStamp = bankStamp.parse(friend)
    this.#isFromCache = isFromCache
    Object.freeze(this)
  }

  /** The lease cached citing `gate`, or null so the bank asks the user to unlock. A row citing another `gate_tok` or `revision_tok`, or of another stamp, is forgotten;
   * one past autolock stays, not loaded, for a later unlock's lease to write over or `bank.autolock` to forget.
   * A device database that refuses, or a row that will not read, is bad news and null, the row left standing.
   */
  static async buildFromCache(friend: LeaseFriend, gate: CitedGate): Promise<Lease | null> {
    const { gate: cited } = leaseFromCacheArgs.parse({ friend, gate })
    try {
      const peeked = await friend.peekLease()
      if (peeked === null) { return null }
      const checked = leaseRecord.safeParse(peeked)
      // The damaged row stands until the next lease is cached over it.
      if (! checked.success) { throw damagedLease() }
      // Broken, as the to-do list says (*A cached lease newer than the vault in hand*): a row citing a newer gate revision may be another
      // tab's good lease over a gate this one holds stale. It should refresh the gate; today it forgets the row.
      if ((checked.data.gate_tok !== cited.gate_tok) || (checked.data.gate_revision_tok !== cited.revision_tok)) {
        await friend.tryForgetLease()
        return null
      }
      if (! isConsistent(bankStamp.parse(checked.data), bankStamp.parse(friend))) {
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
  static async buildGranted(friend: LeaseFriend, bankKey: CryptoKey, opts: LeaseGrantOpts): Promise<Lease> {
    const { opts: { gate, wayinkind } } = leaseGrantedArgs.parse({ friend, bankKey, opts })
    const bankstamp = bankStamp.parse(friend)
    const granted  = leaseStamp.parse({
      fmt: LeaseFormat, ...bankstamp, gatelabel: gate.gatelabel, gate_tok: gate.gate_tok, gate_revision_tok: gate.revision_tok, proved_at: nowMillis(), wayinkind,
    })
    const leaseKey = await makeLeaseKey()
    const bank_key_lease_wrapped = await wrapKeyUnder(leaseKey, bankKey, cipherCtx([bankstamp, granted], 'bank_key_lease_wrapped'))
    return new Lease(friend, leaseRecord.parse({ ...granted, lease_key: leaseKey, bank_key_lease_wrapped }), false)
  }
  // --

  // == [Caching]: cacheAsCacheCan

  // A refusal costs the next session an unlock, not this one its lease.
  /** Caches this lease if it can, telling the host of a refusal as bad news. */
  async cacheAsCacheCan(): Promise<void> {
    if (this.#isFromCache) { return }
    const cached = await this.#bankFriend.tryCacheLease(this.#demandRecord())
    if (! cached.ok) { this.#bankFriend.tellBadNews([cached.err]) }
  }
  // --

  // == [Ending one]: revoke, tryRevoke, forget, tryForget, evict

  /** Drop the keys and forget the cached record, so this device is locked. */
  async revoke(): Promise<void> {
    if (this.#record === null) { return }
    this.evict()
    await this.#bankFriend.forgetLease()
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

  // == [Whispers under the bankKey]: sealWith, unsealWith, opened, ctxOf, bankKey

  /** `whisperText` sealed under a fresh boxKey, both bound to the bank's stamp and then `stamps`, in order. */
  async sealWith(whisperText: string, stamps: readonly CipherCtxRecord[]): Promise<SealedWhisper> {
    const checked = leaseSealArgs.parse({ whisperText, stamps })
    const bankKey = await this.#bankKey('wrapKey')
    const boxKey = await makeBoxKey()
    const box_key_wrapped = await wrapKeyUnder(bankKey, boxKey, this.#ctxOf(checked.stamps, 'box_key_wrapped'))
    const bytes = new TextEncoder().encode(checked.whisperText)
    try {
      const whisper_ciphered = await cipherBytes(boxKey, bytes, this.#ctxOf(checked.stamps, 'whisper_ciphered'))
      this.#demandRecord()
      return sealedWhisper.parse({ box_key_wrapped, whisper_ciphered })
    } finally {
      bytes.fill(0)
    }
  }

  /** The text `sealed` contains, bound to `stamps`: what `sealWith` sealed. */
  async unsealWith(sealed: SealedWhisper, stamps: readonly CipherCtxRecord[]): Promise<string> {
    const checked = leaseUnsealArgs.parse({ sealed, stamps })
    const bankKey = await this.#bankKey('unwrapKey')
    const bytes = await this.#decipherSealed(bankKey, checked.sealed, checked.stamps)
    try {
      this.#demandRecord()
      return new TextDecoder().decode(bytes)
    } finally {
      bytes.fill(0)
    }
  }

  async #decipherSealed(bankKey: CryptoKey, sealed: SealedWhisper, stamps: readonly CipherCtxRecord[]): Promise<Uint8Array> {
    const boxKeyCtx  = this.#ctxOf(stamps, 'box_key_wrapped')
    const whisperCtx = this.#ctxOf(stamps, 'whisper_ciphered')
    // Only these two WebCrypto calls are trapped: their rejection is how a damaged whisper is learned. The calls above refuse as they are, or are bugs.
    try {
      const boxKey = await unwrapKeyUnder(bankKey, sealed.box_key_wrapped, boxKeyCtx, { extractable: false, usage: ['decrypt'] })
      return await decipherBytes(boxKey, sealed.whisper_ciphered, whisperCtx)
    } catch {
      throw undecipheredWhisper()
    }
  }

  /** The caller's stamps under the bank's, bound to one of the lease's purposes. */
  #ctxOf(stamps: readonly CipherCtxRecord[], purpose: 'box_key_wrapped' | 'whisper_ciphered'): Uint8Array {
    return cipherCtx([this.#bankStamp, ...stamps], purpose)
  }

  /** The bankKey for this one call, non-extractable, with the one usage. Nothing keeps the key between calls. */
  async #bankKey(usage: 'wrapKey' | 'unwrapKey'): Promise<CryptoKey> {
    const { lease_key, bank_key_lease_wrapped } = this.#demandRecord()
    const ctx = cipherCtx([this.#bankStamp, this.#leaseStamp], 'bank_key_lease_wrapped')
    // Only this WebCrypto call is trapped: its rejection is how a damaged lease is learned.
    try {
      return await unwrapKeyUnder(lease_key, bank_key_lease_wrapped, ctx, { extractable: false, usage: [usage] })
    } catch {
      // Locking drops the bank's lease and forgets its row by scope; this one is evicted too, should the bank have another.
      this.#bankFriend.lock()
      this.evict()
      throw damagedLease()
    }
  }
  // --

  // == [Guards]: isGranted, demandRecord

  /** The lease still has its record: it was granted and has not been dropped. */
  get isGranted(): boolean { return this.#record !== null }

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
function isPastAutolock({ proved_at }: LeaseStamp, { leaseMillis }: LeaseFriend): boolean { return nowMillis() - proved_at > leaseMillis }
// --
