import type * as Z from 'zod'
import type { Consts, EX } from 'safebyok-big/internals'
import { Crypto, Helpers, Throwers, Validator } from 'safebyok-big/internals'
import * as Phrases from '../phrases'
import type { Bank } from './bank'
import type * as Sealers from './sealers'
import { type LeaseRecord, type LeaseSparse, type LeaseStamp, bankStamp, leaseRecord, leaseStamp } from './stamps'

/** The part of its bank a lease uses: its stamp, its `lock` (called when the bankKey will not unwrap), and whether its device is enabled. */
export type LeaseBank = Pick<Bank, 'stamp' | 'lock' | 'isEnabled' | 'demandEnabled'>

/** Any sealer, as a lease takes it: the lease is generic over what it seals. */
type AnySealer = Sealers.Sealer<never, never, never>

/** The options of {@link Lease.make}, beside its record. */
export interface LeaseOpts {
  /** The bank the lease is granted to. */
  bank: LeaseBank
}

// Defined here, not with the shapes: it names a model class.
/** The checks of {@link Lease.make}'s arguments, and of the sealer a seal or unseal is given. */
const Checks = Validator.Checkers('bad_option', ({ obj, str, fn, bool, custom }) => {
  const bank = obj({ stamp: bankStamp, lock: fn<() => unknown>(), isEnabled: bool, demandEnabled: fn<() => unknown>() })
  const sealerMembers = obj({
    tags:     obj({ codectag: str, schematag: str }),
    purposes: obj({ key: str, cipher: str }),
    stampsOf: fn(),
    encode:   fn(),
    decode:   fn(),
    sealedOf: fn(),
    recordOf: fn(),
  })
  return {
    leaseMakeArgs: obj({ record: leaseRecord, opts: obj({ bank }) }),
    sealer:        custom<AnySealer>((val) => sealerMembers.safeParse(sealerMembersOf(val)).success, Phrases.SealerExpected),
  }
})

/** A grant that lets this device seal and unseal under its bank's key without asking the user, for one revision of the bank's gate.
 * The bankKey stays wrapped under a non-extractable leaseKey: each seal or unseal unwraps it for that call alone, and nothing hands it out.
 * The lease knows nothing of boxes: the sealer it is handed, such as `CoreBox`, decides what is sealed and how.
 * A bankKey that will not unwrap locks the bank, and refuses `damaged_lease`.
 * Once evicted, or once its device is swept, it refuses every seal and unseal, even one in flight.
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

  /** The record with the leaseKey and the wrapped bankKey; null after eviction. */
  #record: LeaseRecord | null

  /** This lease's stamp: its record without the key material. Every ctx under the lease binds it after the bank's. */
  get stamp(): LeaseStamp { return leaseStamp.parse(this) }

  /** This lease's {@link LeaseSparse}, which has no key material. */
  toJSON(): LeaseSparse { return this.stamp }
  // --

  // == [Construction]: make, constructor

  /** Make the lease of `record`, granted to `opts.bank`, which must be the bank `record` is stamped with. */
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

  /** Seal `cleartexts` as the part `sealer` seals, adding it to `nextRevision`.
   * The seal is bound to the bank's stamp, the sealer's stamps and the part's tags. The cleartext's bytes are zeroed afterwards.
   */
  async seal<NextT, RecordT, CleartextsT, SubT extends NextT>(
    sealer: Sealers.Sealer<NextT, RecordT, CleartextsT>, nextRevision: SubT, cleartexts: CleartextsT,
  ): Promise<SubT & Sealers.SealedPartsOf<CleartextsT>> {
    Checks.sealer.parse(sealer)
    const sealed = await this.#sealText(sealer, nextRevision, sealer.encode(cleartexts))
    return sealer.recordOf(nextRevision, sealed)
  }

  /** Unseal the part `sealer` seals in `record`, returning its cleartexts.
   * Unsealing authenticates the ciphertexts, stamps and tags together: a change to any of them refuses as damaged.
   */
  async unseal<NextT, RecordT, CleartextsT>(sealer: Sealers.Sealer<NextT, RecordT, CleartextsT>, record: RecordT): Promise<CleartextsT> {
    Checks.sealer.parse(sealer)
    const cleartext = await this.#openSealed(sealer, record)
    return sealer.decode(cleartext)
  }

  /** The {@link Sealers.Sealed} form of `cleartext`, for `sealer` to add to `nextRevision`: ciphered under a fresh key that is wrapped under the bankKey, with the sealer's tags. */
  async #sealText<NextT>(sealer: Sealers.Sealer<NextT, unknown, unknown>, nextRevision: NextT, cleartext: string): Promise<Sealers.Sealed> {
    const { purposes, tags } = sealer
    const stamps  = sealer.stampsOf(nextRevision)
    const bankKey = await this.#bankKey('wrapKey')
    const partKey = await Crypto.makeBoxKey()
    const key_wrapped = await Crypto.wrapKeyUnder(bankKey, partKey, this.#ctxOf(stamps, purposes.key, tags))
    const bytes = new TextEncoder().encode(cleartext)
    try {
      const ciphered = await Crypto.cipherBytes(partKey, bytes, this.#ctxOf(stamps, purposes.cipher, tags))
      this.demandEnabled()
      return { key_wrapped, ciphered, ...tags }
    } finally {
      bytes.fill(0)
    }
  }

  /** The cleartext sealed in `record`, the part `sealer` seals. */
  async #openSealed<RecordT>(sealer: Sealers.Sealer<unknown, RecordT, unknown>, record: RecordT): Promise<string> {
    const { key_wrapped, ciphered, ...tags } = sealer.sealedOf(record)
    const stamps  = sealer.stampsOf(record)
    const { purposes } = sealer
    const bankKey = await this.#bankKey('unwrapKey')
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

  /** Throw unless {@link isEnabled}. */
  demandEnabled(): this {
    this.#bank.demandEnabled()
    if (this.#record === null) { throw Throwers.leaseNotInForce() }
    return this
  }
  // --

  /** Always `'lease'`: marks this model for a {@link Consts.Modelkind} check. */
  get modelkind(): 'lease' { return 'lease' satisfies Consts.Modelkind }
}

// == [Helpers]: sealerMembersOf

// A class's static methods are its own but not enumerable, so a spread would miss them: each member is read by name.
/** The members of a sealer read off `val`, an object or a class; null for anything else */
function sealerMembersOf(val: unknown): Partial<Record<keyof AnySealer, unknown>> | null {
  if ((val === null) || ((typeof val !== 'object') && (typeof val !== 'function'))) { return null }
  const { tags, purposes, stampsOf, encode, decode, sealedOf, recordOf } = val as Partial<Record<keyof AnySealer, unknown>>
  return { tags, purposes, stampsOf, encode, decode, sealedOf, recordOf }
}
// --
