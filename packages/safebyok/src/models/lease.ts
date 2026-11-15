import type * as Z from 'zod'
import type { Consts, EX } from 'safebyok-big/internals'
import { Crypto, Helpers, Throwers, Validator } from 'safebyok-big/internals'
import type { Bank } from './bank'
import * as Sealers from './sealers'
import { type LeaseRecord, type LeaseSparse, type LeaseStamp, bankStamp, leaseRecord, leaseStamp } from './stamps'

/** What a lease is given of its bank: its stamp; its lock, called when the bankKey will not unwrap; and whether its device is enabled. */
export type LeaseBank = Pick<Bank, 'stamp' | 'lock' | 'isEnabled' | 'demandEnabled'>

/** The sealer of kind `KindT`, in `sealers.ts`. */
type SealerOf<KindT extends Sealers.Sealerkind> = Sealers.SealerKinds[KindT]
/** What the sealer of kind `KindT` seals the next revision after. */
export type PriorOf<KindT extends Sealers.Sealerkind>      = SealerOf<KindT> extends Sealers.Sealer<infer PriorT, unknown, unknown, unknown> ? PriorT : never
/** The next revision the sealer of kind `KindT` makes, without its sealed part. */
type NextOf<KindT extends Sealers.Sealerkind>              = SealerOf<KindT> extends Sealers.Sealer<unknown, infer NextT, unknown, unknown> ? NextT : never
/** What the sealer of kind `KindT` gives back: its record, sealed. */
export type RecordOf<KindT extends Sealers.Sealerkind>     = SealerOf<KindT> extends Sealers.Sealer<unknown, unknown, infer RecordT, unknown> ? RecordT : never
/** What the sealer of kind `KindT` seals: its cleartexts. */
export type CleartextsOf<KindT extends Sealers.Sealerkind> = SealerOf<KindT> extends Sealers.Sealer<unknown, unknown, unknown, infer CleartextsT> ? CleartextsT : never

/** What {@link Lease.make} is given besides its record. */
export interface LeaseOpts {
  /** The bank the lease is granted to. */
  bank: LeaseBank
}

// Defined here, not with the shapes: it names a model class.
/** The checks of {@link Lease.make}'s arguments, and of the sealerkind a seal or unseal is given. */
const Checks = Validator.Checkers('bad_option', ({ obj, fn, bool, oneof }) => {
  const bank = obj({ stamp: bankStamp, lock: fn<() => unknown>(), isEnabled: bool, demandEnabled: fn<() => unknown>() })
  return {
    leaseMakeArgs: obj({ record: leaseRecord, opts: obj({ bank }) }),
    sealerkind:    oneof(Sealers.sealerkindVals),
  }
})

/** A grant that lets this device seal and unseal under its bank's key without asking the user, for one revision of the bank's gate.
 * The bankKey stays wrapped under a non-extractable leaseKey. Each seal or unseal unwraps it for that call alone, and nothing hands it out.
 * What is sealed, and how, is the sealer's in `sealers.ts`, named by its kind: the lease knows nothing of boxes.
 * A lease whose bankKey will not unwrap refuses `damaged_lease`, and its bank locks.
 * Once evicted, or once its bank's device is swept, it refuses every seal and unseal, one in flight included.
 */
export class Lease implements LeaseStamp {
  // == [Props]: fmt, userid, banklabel, lifeseq, born_at, gatelabelpath, gate_lifeseq, gate_revtok, proved_at, wayinkind, #bank, #record, stamp, toJSON

  declare readonly fmt:           LeaseStamp['fmt']
  declare readonly userid:        string
  declare readonly banklabel:     string
  declare readonly lifeseq:       string
  declare readonly born_at:       number
  /** The labelpath of the gate the lease was granted under. */
  declare readonly gatelabelpath: string
  /** The lifeseq of that gate's life. */
  declare readonly gate_lifeseq:  string
  /** The revision of that gate the lease was granted under. */
  declare readonly gate_revtok:   string
  declare readonly proved_at:     number
  declare readonly wayinkind:     EX.Wayinkind

  readonly #bank: LeaseBank

  /** The record, with the leaseKey and the wrapped bankKey; null once evicted. */
  #record: LeaseRecord | null

  /** This lease's stamp: its record without the key material. Every ctx under the lease binds it after the bank's. */
  get stamp(): LeaseStamp { return leaseStamp.parse(this) }

  /** This lease's {@link LeaseSparse}, which has no key material. */
  toJSON(): LeaseSparse { return this.stamp }
  // --

  // == [Construction]: make, constructor

  /** The lease of `record`, granted to `opts.bank`, which must be the bank `record` is stamped with. */
  static make(record: Z.input<typeof leaseRecord>, opts: LeaseOpts): Lease { return new Lease(record, opts) }

  private constructor(record: Z.input<typeof leaseRecord>, opts: LeaseOpts) {
    const { record: parsed, opts: checked } = Checks.leaseMakeArgs.parse({ record, opts })
    Validator.checkedConsistent(bankStamp.parse(parsed), checked.bank.stamp, { kind: 'damaged_lease' })
    this.#record = parsed
    Helpers.tattoo(this, leaseStamp.parse(parsed), { configurable: false })
    this.#bank = opts.bank
    Object.freeze(this)
  }
  // --

  // == [Ending one]: evict

  /** Drop the keys. */
  evict(): void { this.#record = null }
  // --

  // == [Sealing under the bankKey]: seal, unseal, sealText, openSealed, ctxOf, bankKey

  /** The next revision after `prior`, with the part `sealerkind` names sealed from `cleartexts` under a fresh key.
   * The seal is bound to the bank's stamp, then to what the sealer stamps the record with, then to the part's tags. The text's bytes are zeroed afterwards, sealed or refused.
   */
  async seal<KindT extends Sealers.Sealerkind>(sealerkind: KindT, prior: PriorOf<KindT>, cleartexts: CleartextsOf<KindT>): Promise<RecordOf<KindT>> {
    const sealer = sealerOf(sealerkind)
    const next = sealer.nextRevisionOf(prior)
    const sealed = await this.#sealText(sealer.encode(cleartexts), sealer.stampsOf(next), sealer.purposes, sealer.tags)
    return sealer.recordOf(next, sealed)
  }

  /** The cleartexts of the part `sealerkind` names in `record`.
   * Unsealing authenticates the ciphertexts, the stamps and the tags together: a change to any of them refuses as damaged.
   */
  async unseal<KindT extends Sealers.Sealerkind>(sealerkind: KindT, record: RecordOf<KindT>): Promise<CleartextsOf<KindT>> {
    const sealer = sealerOf(sealerkind)
    const text = await this.#openSealed(sealer.sealedOf(record), sealer.stampsOf(record), sealer.purposes)
    return sealer.decode(text)
  }

  /** `text`, ciphered under a fresh key, the key wrapped under the bankKey, with `tags` */
  async #sealText(text: string, stamps: readonly Crypto.CipherCtxRecord[], purposes: Sealers.SealPurposes, tags: Sealers.SealTags): Promise<Sealers.Sealed> {
    const bankKey = await this.#bankKey('wrapKey')
    const partKey = await Crypto.makeBoxKey()
    const key_wrapped = await Crypto.wrapKeyUnder(bankKey, partKey, this.#ctxOf(stamps, purposes.key, tags))
    const bytes = new TextEncoder().encode(text)
    try {
      const ciphered = await Crypto.cipherBytes(partKey, bytes, this.#ctxOf(stamps, purposes.cipher, tags))
      this.demandEnabled()
      return { key_wrapped, ciphered, ...tags }
    } finally {
      bytes.fill(0)
    }
  }

  /** The text in `sealed` */
  async #openSealed(sealed: Sealers.Sealed, stamps: readonly Crypto.CipherCtxRecord[], purposes: Sealers.SealPurposes): Promise<string> {
    const bankKey = await this.#bankKey('unwrapKey')
    const { key_wrapped, ciphered, ...tags } = sealed
    const keyCtx    = this.#ctxOf(stamps, purposes.key, tags)
    const cipherCtx = this.#ctxOf(stamps, purposes.cipher, tags)
    let bytes: Uint8Array
    // Only these two WebCrypto calls are trapped: their rejection is how a damaged seal is learned. The calls above refuse as they are, or are bugs.
    try {
      const partKey = await Crypto.unwrapKeyUnder(bankKey, key_wrapped, keyCtx, { extractable: false, usage: ['decrypt'] })
      bytes = await Crypto.decipherBytes(partKey, ciphered, cipherCtx)
    } catch {
      throw Throwers.undecipheredWhisper()
    }
    try {
      this.demandEnabled()
      return new TextDecoder().decode(bytes)
    } finally {
      bytes.fill(0)
    }
  }

  /** The ctx for `purpose`: the bank's stamp, then `stamps`, with `tags` as its visible header. */
  #ctxOf(stamps: readonly Crypto.CipherCtxRecord[], purpose: string, tags: Sealers.SealTags): Uint8Array {
    return Crypto.cipherCtx([this.#bank.stamp, ...stamps], purpose, tags)
  }

  /** The bankKey for this call alone, non-extractable, with `usage` its only usage. Nothing keeps it between calls. */
  async #bankKey(usage: 'wrapKey' | 'unwrapKey'): Promise<CryptoKey> {
    this.demandEnabled()
    // demandEnabled refuses an evicted lease, whose record is null.
    const { lease_key, bank_key_lease_wrapped } = this.#record!
    const ctx = Crypto.cipherCtx([this.#bank.stamp, this.stamp], 'bank_key_lease_wrapped')
    // Only this WebCrypto call is trapped: its rejection is how a damaged lease is learned.
    try {
      return await Crypto.unwrapKeyUnder(lease_key, bank_key_lease_wrapped, ctx, { extractable: false, usage: [usage] })
    } catch {
      // The bank drops its lease as it locks; this one is evicted too, should the bank hold another.
      this.#bank.lock()
      this.evict()
      throw Throwers.damagedLease()
    }
  }
  // --

  // == [Guards]: isEvicted, isEnabled, demandEnabled

  /** True once this lease's keys are dropped. */
  get isEvicted(): boolean { return this.#record === null }

  /** True while this lease is not evicted and its bank's device is enabled. */
  get isEnabled(): boolean { return (this.#record !== null) && this.#bank.isEnabled }

  /** Throw the device's refusal once it is swept, or `bank_locked` once this lease is evicted. */
  demandEnabled(): this {
    this.#bank.demandEnabled()
    if (this.#record === null) { throw Throwers.leaseNotInForce() }
    return this
  }
  // --

  /** Always `'lease'`: marks this model for a {@link Consts.Modelkind} check. */
  get modelkind(): 'lease' { return 'lease' satisfies Consts.Modelkind }
}

// == [Helpers]: sealerOf

// TypeScript cannot follow a generic kind to its sealer's types: the cast names what the lookup by that kind gives. The
// lookup is computed, which import-x/namespace cannot check; the sealerkind's check stands in for it.
/** The sealer of kind `sealerkind`, or throw `bad_option` for a kind there is none of */
function sealerOf<KindT extends Sealers.Sealerkind>(sealerkind: KindT): Sealers.Sealer<PriorOf<KindT>, NextOf<KindT>, RecordOf<KindT>, CleartextsOf<KindT>> {
  return Sealers[Checks.sealerkind.parse(sealerkind)] as Sealers.Sealer<PriorOf<KindT>, NextOf<KindT>, RecordOf<KindT>, CleartextsOf<KindT>> // eslint-disable-line import-x/namespace
}
// --
