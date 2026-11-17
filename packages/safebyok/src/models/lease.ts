import { omit } from 'es-toolkit'
import type * as Z from 'zod'
import type { Consts, EX } from 'safebyok-big/internals'
import { Crypto, Helpers, Throwers, Validator } from 'safebyok-big/internals'
import * as Phrases from '../phrases'
import type { ThingRecord } from '../storage/shapes-thing'
import type { Bank } from './bank'
import type * as Sealers from './sealers'
import { type LeaseRecord, type LeaseSparse, type LeaseStamp, bankStamp, leaseRecord, leaseStamp } from './stamps'

/** The part of its bank a lease uses: its stamp, its `lock` (called when the bankKey will not unwrap), and whether its device is enabled. */
export type LeaseBank = Pick<Bank, 'stamp' | 'lock' | 'isEnabled' | 'demandEnabled'>

/** Any sealer, as a lease takes it: the lease is generic over what it seals. */
type AnySealer = Sealers.Sealer<never, never>

/** A field that holds a cleartext or a sealed part: `whisper`, or any name ending `_sealed`. */
export type SecretFieldname = 'whisper' | `${string}_sealed`

/** The names of the cleartexts a sealer seals, which a donor never carries into a revision. */
const CleartextFieldnames: ReadonlySet<string> = new Set(['whisper'])

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
    donorPropsOf:     fn(),
    publicPropsOf:    fn(),
    secretPropsOf:    fn(),
    nextRevisionOf:   fn(),
    tombstoneOf:      fn(),
    tombstoneSecrets: obj({}),
    stampOf:          fn(),
    tags:             obj({ codectag: str, schematag: str }),
    purposes:         obj({ key: str, cipher: str }),
    encode:           fn(),
    decode:           fn(),
    sealedOf:         fn(),
    recordOf:         fn(),
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
  // == [Props]: fmt, userid, banklabel, lifeseq, born_at, gate_labelpath, gate_lifeseq, gate_revtok, proved_at, wayinkind, #bank, #record, stamp, toJSON

  declare readonly fmt:            LeaseStamp['fmt']
  declare readonly userid:         string
  declare readonly banklabel:      string
  declare readonly lifeseq:        string
  declare readonly born_at:        number
  /** The labelpath of the gate the lease was granted under. */
  declare readonly gate_labelpath: string
  /** The lifeseq of that gate's life. */
  declare readonly gate_lifeseq:   string
  /** The revision of that gate the lease was granted under. */
  declare readonly gate_revtok:    string
  declare readonly proved_at:      number
  declare readonly wayinkind:      EX.Wayinkind

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

  /** Seal the revision next after `donor`, as `sealer` makes it: with `publicProps` over it and `secretProps` sealed.
   * With `publicProps` of `{ am: 'x' }` alone, it is the tombstone of the live `donor`, sealing the sealer's empty cleartexts.
   * `donor` may be a whole record, sealed or unsealed: only its Thing fields and body are read, and no cleartext or sealed part reaches the revision.
   * The seal is bound to the bank's stamp, the revision's stamp and the part's tags. The cleartext's bytes are zeroed afterwards.
   * @example
   *   await lease.seal(CoreBox, box, { sidecar: { account: 'work' } }, { whisper })  // its next revision
   *   await lease.seal(CoreBox, box, { am: 'x' })                                     // its tombstone
   */
  seal<RecordT extends ThingRecord, CleartextsT>(
    sealer: Sealers.Sealer<RecordT, CleartextsT>, donor: Sealers.DonorOf<RecordT, CleartextsT>, publicProps: Sealers.TombstonePublicProps,
  ): Promise<Sealers.TombstoneOf<RecordT>>
  seal<RecordT extends ThingRecord, CleartextsT>(
    sealer: Sealers.Sealer<RecordT, CleartextsT>, donor: Sealers.DonorOf<RecordT, CleartextsT>, publicProps: Sealers.LivePublicPropsOf<RecordT, CleartextsT>, secretProps: CleartextsT,
  ): Promise<Sealers.LiveOf<RecordT>>
  seal<RecordT extends ThingRecord, CleartextsT>(
    sealer: Sealers.Sealer<RecordT, CleartextsT>, donor: Sealers.DonorOf<RecordT, CleartextsT>, publicProps: Sealers.PublicPropsOf<RecordT, CleartextsT>, secretProps?: CleartextsT,
  ): Promise<RecordT>
  async seal<RecordT extends ThingRecord, CleartextsT>(
    sealer: Sealers.Sealer<RecordT, CleartextsT>, donor: Sealers.DonorOf<RecordT, CleartextsT>, publicProps: Sealers.PublicPropsOf<RecordT, CleartextsT>, secretProps?: CleartextsT,
  ): Promise<RecordT> {
    Checks.sealer.parse(sealer)
    const donorProps = withoutSecrets(sealer.donorPropsOf(donor))
    const given = sealer.publicPropsOf(publicProps)
    const isTombstone = (given.am === 'x')
    const revision = isTombstone ? sealer.tombstoneOf(donorProps) : sealer.nextRevisionOf(donorProps, given)
    const cleartexts = isTombstone ? sealer.tombstoneSecrets : sealer.secretPropsOf(secretProps)
    const sealed = await this.#sealText(sealer, revision, sealer.encode(cleartexts))
    return sealer.recordOf(revision, sealed)
  }

  /** `record` unsealed: the part `sealer` seals, opened, in place of its sealed form.
   * Unsealing authenticates the ciphertexts, stamp and tags together: a change to any of them refuses as damaged.
   */
  async unseal<RecordT extends ThingRecord, CleartextsT>(sealer: Sealers.Sealer<RecordT, CleartextsT>, record: RecordT): Promise<Sealers.UnsealedOf<RecordT, CleartextsT>> {
    Checks.sealer.parse(sealer)
    const cleartexts = sealer.decode(await this.#openSealed(sealer, record))
    // The spread's type is UnsealedOf's, which TypeScript cannot see through for a record of any kind.
    return Object.freeze({ ...withoutSecrets(record), ...cleartexts }) as Sealers.UnsealedOf<RecordT, CleartextsT>
  }

  /** The {@link Sealers.Sealed} form of `cleartext`, for `sealer` to add to `revision`: ciphered under a fresh key that is wrapped under the bankKey, with the sealer's tags. */
  async #sealText(sealer: Pick<AnySealer, 'stampOf' | 'purposes' | 'tags'>, revision: unknown, cleartext: string): Promise<Sealers.Sealed> {
    const { purposes, tags } = sealer
    const stamp   = sealer.stampOf(revision)
    const bankKey = await this.#bankKey('wrapKey')
    const partKey = await Crypto.makeBoxKey()
    const key_wrapped = await Crypto.wrapKeyUnder(bankKey, partKey, this.#ctxOf(stamp, purposes.key, tags))
    const bytes = new TextEncoder().encode(cleartext)
    try {
      const ciphered = await Crypto.cipherBytes(partKey, bytes, this.#ctxOf(stamp, purposes.cipher, tags))
      this.demandEnabled()
      return { key_wrapped, ciphered, ...tags }
    } finally {
      bytes.fill(0)
    }
  }

  /** The cleartext sealed in `record`, the part `sealer` seals. */
  async #openSealed<RecordT extends ThingRecord>(sealer: Pick<Sealers.Sealer<RecordT, unknown>, 'sealedOf' | 'stampOf' | 'purposes'>, record: RecordT): Promise<string> {
    const { key_wrapped, ciphered, ...tags } = sealer.sealedOf(record)
    const stamp   = sealer.stampOf(record)
    const { purposes } = sealer
    const bankKey = await this.#bankKey('unwrapKey')
    const keyCtx    = this.#ctxOf(stamp, purposes.key, tags)
    const cipherCtx = this.#ctxOf(stamp, purposes.cipher, tags)
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

  /** The ctx for `purpose`: the bank's stamp, then `stamp`, with `tags` as its visible header. */
  #ctxOf(stamp: Crypto.CipherCtxRecord, purpose: string, tags: Sealers.SealTags): Uint8Array {
    return Crypto.cipherCtx([bankStamp.parse(this.#bank.stamp), stamp], purpose, tags)
  }

  /** The bankKey for this call alone, non-extractable, with `usage` its only usage. Nothing keeps it between calls. */
  async #bankKey(usage: 'wrapKey' | 'unwrapKey'): Promise<CryptoKey> {
    this.demandEnabled()
    // demandEnabled refuses an evicted lease, whose record is null.
    const { lease_key, bank_key_lease_wrapped } = this.#record!
    const ctx = Crypto.cipherCtx([bankStamp.parse(this.#bank.stamp), this.stamp], 'bank_key_lease_wrapped')
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

// == [Helpers]: withoutSecrets, sealerMembersOf

/** `bag` without its secrets: each cleartext, such as `whisper`, and each sealed part, at a name ending `_sealed`. */
export function withoutSecrets<BagT extends object>(bag: BagT): Omit<BagT, keyof BagT & SecretFieldname> {
  const secretFieldnames = Object.keys(bag).filter((fieldname) => fieldname.endsWith('_sealed') || CleartextFieldnames.has(fieldname))
  // Object.keys loses the fieldnames' type: the cast restores it.
  return omit(bag, secretFieldnames as (keyof BagT & SecretFieldname)[])
}

// A class's static methods are its own but not enumerable, so a spread would miss them: each member is read by name.
/** The members of a sealer read off `val`, an object or a class; null for anything else */
function sealerMembersOf(val: unknown): Partial<Record<keyof AnySealer, unknown>> | null {
  if ((val === null) || ((typeof val !== 'object') && (typeof val !== 'function'))) { return null }
  const {
    donorPropsOf, publicPropsOf, secretPropsOf, nextRevisionOf, tombstoneOf, tombstoneSecrets, stampOf, tags, purposes, encode, decode, sealedOf, recordOf,
  } = val as Partial<Record<keyof AnySealer, unknown>>
  return { donorPropsOf, publicPropsOf, secretPropsOf, nextRevisionOf, tombstoneOf, tombstoneSecrets, stampOf, tags, purposes, encode, decode, sealedOf, recordOf }
}
// --
