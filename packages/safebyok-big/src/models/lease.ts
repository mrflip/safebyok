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

/** A grant that lets this device seal and unseal whispers without asking the user, for one revision of its bank's gate.
 * The bankKey stays wrapped under a non-extractable leaseKey. Each seal or unseal unwraps it for that call alone, and nothing hands it out.
 * A lease whose bankKey will not unwrap refuses `damaged_lease`, and its bank locks.
 */
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

  /** What this lease is given of its bank: see {@link LeaseFriend}. */
  readonly #bankFriend: LeaseFriend

  /** The record, with the leaseKey and the wrapped bankKey; null once evicted. */
  #record: LeaseRecord | null

  /** The bank's stamp, which every ctx under this lease binds first. */
  readonly #bankStamp: BankStamp

  /** True for a lease built from the row cached on this device. */
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

  /** The lease cached on this device for `gate`'s current revision, or null: then ask the user.
   * A row citing another gate or revision is forgotten. So is a row of another bank stamp, which is also told as bad news.
   * A device database refusal or a damaged row is told as bad news. A row past autolock is not loaded, and stays on disk
   * until the next lease is cached over it or `bank.autolock()` locks.
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

  /** Grant a new lease: `bankKey` wrapped under a fresh, non-extractable leaseKey, citing `opts.gate`.
   * It is not cached until {@link cacheAsCacheCan}.
   */
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
  /** Cache this lease on this device, unless it came from there. A device database refusal is told as bad news, not thrown. */
  async cacheAsCacheCan(): Promise<void> {
    if (this.#isFromCache) { return }
    const cached = await this.#bankFriend.tryCacheLease(this.#demandRecord())
    if (! cached.ok) { this.#bankFriend.tellBadNews([cached.err]) }
  }
  // --

  // == [Expiry]: expiresAt, tryExpiresAt

  /** When the lease cached on this device is due for locking, in epoch milliseconds; null if none is cached. */
  static async expiresAt(friend: LeaseFriend): Promise<number | null> {
    const checked = leaseFriend.parse(friend)
    const peeked = await checked.peekLease()
    if (peeked === null) { return null }
    const row = leaseRecord.safeParse(peeked)
    if (! row.success) { throw damagedLease() }
    return expiryOf(row.data, checked)
  }

  /** Non-throwing form of {@link expiresAt}. */
  static tryExpiresAt(friend: LeaseFriend): Promise<Outcome<number | null>> { return outcomeOf(() => this.expiresAt(friend)) }
  // --

  // == [Ending one]: revoke, tryRevoke, forget, tryForget, evict

  /** Drop the keys and forget the cached row. Does nothing once evicted. */
  async revoke(): Promise<void> {
    if (this.#record === null) { return }
    this.evict()
    await this.#bankFriend.forgetLease()
  }

  /** Non-throwing form of {@link revoke}. */
  tryRevoke(): Promise<Outcome<void>> { return outcomeOf(() => this.revoke()) }

  /** Forget the lease cached on this device, where there is no Lease object to {@link revoke}. */
  static async forget(friend: LeaseFriend): Promise<void> {
    await leaseFriend.parse(friend).forgetLease()
  }

  /** Non-throwing form of {@link forget}. */
  static tryForget(friend: LeaseFriend): Promise<Outcome<void>> { return outcomeOf(() => this.forget(friend)) }

  /** Drop the keys, leaving the cached row for the next session. */
  evict(): void { this.#record = null }
  // --

  // == [Whispers under the bankKey]: sealWith, unsealWith, opened, ctxOf, bankKey

  /** Seal `whisperText` under a fresh boxKey, bound to the bank's stamp and then `stamps`, in order.
   * {@link unsealWith} needs the same stamps in the same order. The text's bytes are zeroed afterwards, sealed or refused.
   */
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

  /** The whisper text in `sealed`, given the stamps it was sealed with, in the same order.
   * Unsealing authenticates `sealed` and `stamps` together: a change to either refuses as damaged.
   */
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

  /** The ctx for `purpose`: the bank's stamp, then `stamps`. */
  #ctxOf(stamps: readonly CipherCtxRecord[], purpose: 'box_key_wrapped' | 'whisper_ciphered'): Uint8Array {
    return cipherCtx([this.#bankStamp, ...stamps], purpose)
  }

  /** The bankKey for this call alone, non-extractable, with `usage` its only usage. Nothing keeps it between calls. */
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

  /** True until this lease is evicted or revoked. */
  get isGranted(): boolean { return this.#record !== null }

  /** The record, or throw once this lease is evicted. */
  #demandRecord(): LeaseRecord {
    if (this.#record === null) { throw leaseNotInForce() }
    return this.#record
  }
  // --

  /** Always `'lease'`: marks this model for a {@link Modelkind} check. */
  get modelkind(): 'lease' { return 'lease' satisfies Modelkind }
}

// == [Judging the cached record]: expiryOf, isPastAutolock

/** When `row` is due for locking: the autolock duration after its `proved_at`. */
function expiryOf({ proved_at }: LeaseStamp, { leaseMillis }: LeaseFriend): number { return proved_at + leaseMillis }

// `bank.autolock` judges by the same expiry, through `Lease.expiresAt`.
/** True once `row` was proved longer ago than the autolock duration. */
function isPastAutolock(row: LeaseStamp, friend: LeaseFriend): boolean { return expiryOf(row, friend) < nowMillis() }
// --
