import type * as Z from 'zod'
import type { Consts, EX } from 'safebyok-big/internals'
import { Crypto, GX, Helpers, Throwers, Validator } from 'safebyok-big/internals'
import type { Bank } from './bank'
import * as Sealers from './sealers'

/** What a lease is given of its bank: its stamp, and its lock, called when the bankKey will not unwrap. */
export type LeaseBank = Pick<Bank, 'stamp' | 'lock'>

/** The sealer of kind `KindT`, in `sealers.ts`. */
type SealerOf<KindT extends Sealers.Sealerkind> = typeof Sealers[KindT]
/** What the sealer of kind `KindT` seals the next revision of: its record without the sealed fields. */
export type AnteOf<KindT extends Sealers.Sealerkind>       = SealerOf<KindT> extends Sealers.Sealer<infer AnteT, unknown, unknown> ? AnteT : never
/** What the sealer of kind `KindT` gives back: its record, sealed. */
export type RecordOf<KindT extends Sealers.Sealerkind>     = SealerOf<KindT> extends Sealers.Sealer<unknown, infer RecordT, unknown> ? RecordT : never
/** What the sealer of kind `KindT` seals: its cleartexts. */
export type CleartextsOf<KindT extends Sealers.Sealerkind> = SealerOf<KindT> extends Sealers.Sealer<unknown, unknown, infer CleartextsT> ? CleartextsT : never

/** What {@link Lease.make} is given besides its record. */
export interface LeaseOpts {
  /** The bank the lease is granted to. */
  bank: LeaseBank
}

// Defined here, not with the shapes: it names a model class.
/** The checks of {@link Lease.make}'s arguments, and of the sealerkind a seal or unseal is given. */
const Checks = Validator.Checkers('bad_option', ({ obj, fn, oneof }) => {
  const bank = obj({ stamp: GX.bankStamp, lock: fn<() => unknown>() })
  return {
    leaseMakeArgs: obj({ record: GX.leaseRecord, opts: obj({ bank }) }),
    sealerkind:    oneof(Sealers.sealerkindVals),
  }
})

/** A grant that lets this device seal and unseal under its bank's key without asking the user, for one revision of the bank's gate.
 * The bankKey stays wrapped under a non-extractable leaseKey. Each seal or unseal unwraps it for that call alone, and nothing hands it out.
 * What is sealed, and how, is the sealer's in `sealers.ts`, named by its kind: the lease knows nothing of boxes.
 * A lease whose bankKey will not unwrap refuses `damaged_lease`, and its bank locks.
 */
export class Lease implements GX.LeaseStamp {
  // == [Props]: fmt, user_id, banklabel, bank_tok, registered_at, gatelabel, gate_tok, gate_revision_tok, proved_at, wayinkind, #bank, #record, stamp, toJSON

  declare readonly fmt:               GX.LeaseStamp['fmt']
  declare readonly user_id:           string
  declare readonly banklabel:         string
  declare readonly bank_tok:          string
  declare readonly registered_at:     number
  declare readonly gatelabel:         GX.LeaseStamp['gatelabel']
  declare readonly gate_tok:          string
  declare readonly gate_revision_tok: string
  declare readonly proved_at:         number
  declare readonly wayinkind:         EX.Wayinkind

  readonly #bank: LeaseBank

  /** The record, with the leaseKey and the wrapped bankKey; null once evicted. */
  #record: GX.LeaseRecord | null

  /** This lease's stamp: its record without the key material. Every ctx under the lease binds it after the bank's. */
  get stamp(): GX.LeaseStamp { return GX.leaseStamp.parse(this) }

  /** This lease's {@link GX.LeaseSparse}, which has no key material. */
  toJSON(): GX.LeaseSparse { return this.stamp }
  // --

  // == [Construction]: make, constructor

  /** The lease of `record`, granted to `opts.bank`, which must be the bank `record` is stamped with. */
  static make(record: Z.input<typeof GX.leaseRecord>, opts: LeaseOpts): Lease { return new Lease(record, opts) }

  private constructor(record: Z.input<typeof GX.leaseRecord>, opts: LeaseOpts) {
    const { record: parsed, opts: checked } = Checks.leaseMakeArgs.parse({ record, opts })
    Validator.checkedConsistent(GX.bankStamp.parse(parsed), checked.bank.stamp, { kind: 'damaged_lease' })
    this.#record = parsed
    Helpers.tattoo(this, GX.leaseStamp.parse(parsed), { configurable: false })
    this.#bank = opts.bank
    Object.freeze(this)
  }
  // --

  // == [Ending one]: evict

  /** Drop the keys. */
  evict(): void { this.#record = null }
  // --

  // == [Sealing under the bankKey]: seal, unseal, sealText, openSealed, ctxOf, bankKey

  /** The next revision of `ante`, with the part `sealerkind` names sealed from `cleartexts` under a fresh key.
   * The seal is bound to the bank's stamp, then to what the sealer stamps the record with. The text's bytes are zeroed afterwards, sealed or refused.
   */
  async seal<KindT extends Sealers.Sealerkind>(sealerkind: KindT, ante: AnteOf<KindT>, cleartexts: CleartextsOf<KindT>): Promise<RecordOf<KindT>> {
    const sealer = sealerOf(sealerkind)
    const next = sealer.nextRevisionOf(ante)
    const sealed = await this.#sealText(sealer.encode(cleartexts), sealer.stampsOf(next), sealer.purposes)
    return sealer.recordOf(next, sealed)
  }

  /** The cleartexts of the part `sealerkind` names in `record`.
   * Unsealing authenticates the ciphertexts and the stamps together: a change to either refuses as damaged.
   */
  async unseal<KindT extends Sealers.Sealerkind>(sealerkind: KindT, record: RecordOf<KindT>): Promise<CleartextsOf<KindT>> {
    const sealer = sealerOf(sealerkind)
    const text = await this.#openSealed(sealer.sealedOf(record), sealer.stampsOf(record), sealer.purposes)
    return sealer.decode(text)
  }

  /** `text`, ciphered under a fresh key, the key wrapped under the bankKey */
  async #sealText(text: string, stamps: readonly Crypto.CipherCtxRecord[], purposes: Sealers.SealPurposes): Promise<Sealers.Sealed> {
    const bankKey = await this.#bankKey('wrapKey')
    const partKey = await Crypto.makeBoxKey()
    const keyWrapped = await Crypto.wrapKeyUnder(bankKey, partKey, this.#ctxOf(stamps, purposes.key))
    const bytes = new TextEncoder().encode(text)
    try {
      const ciphered = await Crypto.cipherBytes(partKey, bytes, this.#ctxOf(stamps, purposes.cipher))
      this.#demandRecord()
      return { keyWrapped, ciphered }
    } finally {
      bytes.fill(0)
    }
  }

  /** The text in `sealed` */
  async #openSealed(sealed: Sealers.Sealed, stamps: readonly Crypto.CipherCtxRecord[], purposes: Sealers.SealPurposes): Promise<string> {
    const bankKey = await this.#bankKey('unwrapKey')
    const keyCtx    = this.#ctxOf(stamps, purposes.key)
    const cipherCtx = this.#ctxOf(stamps, purposes.cipher)
    let bytes: Uint8Array
    // Only these two WebCrypto calls are trapped: their rejection is how a damaged seal is learned. The calls above refuse as they are, or are bugs.
    try {
      const partKey = await Crypto.unwrapKeyUnder(bankKey, sealed.keyWrapped, keyCtx, { extractable: false, usage: ['decrypt'] })
      bytes = await Crypto.decipherBytes(partKey, sealed.ciphered, cipherCtx)
    } catch {
      throw Throwers.undecipheredWhisper()
    }
    try {
      this.#demandRecord()
      return new TextDecoder().decode(bytes)
    } finally {
      bytes.fill(0)
    }
  }

  /** The ctx for `purpose`: the bank's stamp, then `stamps`. */
  #ctxOf(stamps: readonly Crypto.CipherCtxRecord[], purpose: string): Uint8Array {
    return Crypto.cipherCtx([this.#bank.stamp, ...stamps], purpose)
  }

  /** The bankKey for this call alone, non-extractable, with `usage` its only usage. Nothing keeps it between calls. */
  async #bankKey(usage: 'wrapKey' | 'unwrapKey'): Promise<CryptoKey> {
    const { lease_key, bank_key_lease_wrapped } = this.#demandRecord()
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

  // == [Guards]: isEvicted, demandRecord

  /** True once this lease's keys are dropped. */
  get isEvicted(): boolean { return this.#record === null }

  /** The record, or throw once this lease is evicted */
  #demandRecord(): GX.LeaseRecord {
    if (this.#record === null) { throw Throwers.leaseNotInForce() }
    return this.#record
  }
  // --

  /** Always `'lease'`: marks this model for a {@link Consts.Modelkind} check. */
  get modelkind(): 'lease' { return 'lease' satisfies Consts.Modelkind }
}

// == [Helpers]: sealerOf

// TypeScript cannot follow a generic kind to its sealer's types: the cast names what the lookup by that kind gives. The
// lookup is computed, which import-x/namespace cannot check; the sealerkind's check stands in for it.
/** The sealer of kind `sealerkind`, or throw `bad_option` for a kind there is none of */
function sealerOf<KindT extends Sealers.Sealerkind>(sealerkind: KindT): Sealers.Sealer<AnteOf<KindT>, RecordOf<KindT>, CleartextsOf<KindT>> {
  return Sealers[Checks.sealerkind.parse(sealerkind)] as Sealers.Sealer<AnteOf<KindT>, RecordOf<KindT>, CleartextsOf<KindT>> // eslint-disable-line import-x/namespace
}
// --
