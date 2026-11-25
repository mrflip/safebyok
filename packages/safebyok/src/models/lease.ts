import { omit } from 'es-toolkit'
import type * as Z from 'zod'
import type { EX } from 'safebyok-big/internals'
import { Crypto, Helpers, Validator } from 'safebyok-big/internals'
import * as Phrases from '../phrases'
import { maskUuid } from '../helpers/mask-uuid'
import { type Banklabel, type EpochMillis, type Lifeseq, type Lifetok, type Revtok, type Userid, Labelpath } from '../shapes/primitives'
import type { Modelkind, Sparse, ThingRecord, ThingScope } from '../shapes/shapes-thing'
import { type LeaseGate, type LeaseOpts, type SecretFieldname, GateishChecks } from '../shapes/shapes-gateish'
import type * as Sealers from '../shapes/shapes-sealers'
import { type BankStamp, type LeaseLoggable, type LeaseRecord, type LeaseStamp, StampChecks } from '../shapes/shapes-stamps'
import { BankChecks } from '../shapes/shapes-thingkinds'
import * as Throwers from '../refusals/throwers'

/** Any sealer, whatever it seals. */
type AnySealer = Sealers.Sealer<never, never>

/** The fieldnames that contain a cleartext. */
const CleartextFieldnames: ReadonlySet<string> = new Set(['whisper'])

/** A grant to a gate that lets this device seal and unseal under its bank's key without asking the user, for one revision of the gate.
 * The bankKey stays wrapped under a non-extractable leaseKey: each seal or unseal unwraps it for that call alone, and nothing hands it out.
 * The sealer passed to each call, such as `BaseBox`, decides what is sealed and how. The lease itself knows only which fieldnames contain secrets.
 * A bankKey that will not unwrap locks the gate, and refuses `damaged_lease`.
 * Once evicted, or once its device ends, it refuses every seal and unseal, even one in flight.
 */
export class Lease implements LeaseStamp {
  // == [Props]: fmt, userid, banklabel, bank_lifeseq, bank_born_at, bank_lifetok, gate_labelpath, gate_lifeseq, gate_revtok, born_at, proved_at, wayinkind, label, labelpath, scope, am, written_at, #gate, #record, stamp, toJSON, loggable

  declare readonly fmt:            LeaseStamp['fmt']
  declare readonly userid:         Userid
  declare readonly banklabel:      Banklabel
  /** The lifeseq of its bank's life. */
  declare readonly bank_lifeseq:   Lifeseq
  /** When its bank's life was born. */
  declare readonly bank_born_at:   EpochMillis
  /** The lifetok of its bank's life. */
  declare readonly bank_lifetok:   Lifetok
  /** The labelpath of the gate the lease was granted under. */
  declare readonly gate_labelpath: Labelpath
  /** The lifeseq of that gate's life. */
  declare readonly gate_lifeseq:   Lifeseq
  /** The revision of that gate the lease was granted under. */
  declare readonly gate_revtok:    Revtok
  /** When the lease it renews was born, or its `proved_at` where it renews none. */
  declare readonly born_at:        EpochMillis
  /** When the proof that granted it was made. */
  declare readonly proved_at:      EpochMillis
  declare readonly wayinkind:      EX.Wayinkind

  /** The label of the gate it was granted under: `passkeys` for `gate/passkeys`, `gate` for the main gate. */
  get label(): string { return Labelpath.labelOf(this.gate_labelpath) }

  /** Its labelpath, `lease/` and its {@link label}, such as `lease/passkeys`.
   * It is no Thing's labelpath: a check of a Thing's scope refuses it.
   */
  get labelpath(): `lease/${string}` { return `lease/${this.label}` }

  /** Its bank's `userid` and `banklabel`, and its {@link labelpath}.
   * It is no Thing's scope: a check of a Thing's scope, such as a vaultDB ask's, refuses it.
   */
  get scope(): ThingScope { return { userid: this.userid, banklabel: this.banklabel, labelpath: this.labelpath } }

  /** Always `'a'`: a lease is never a tombstone. */
  get am(): 'a' { return 'a' }

  // A renewal grants a new lease whole, so a lease is written once, when it is proved.
  /** When it was granted: its {@link proved_at}. */
  get written_at(): EpochMillis { return this.proved_at }

  readonly #gate: LeaseGate

  /** The record with the leaseKey and the wrapped bankKey; null after eviction. */
  #record: LeaseRecord | null

  /** This lease's stamp: its record without the key material. Every ctx under the lease binds it after the bank's stamp. */
  get stamp(): LeaseStamp { return StampChecks.leaseStamp.parse(this) }

  /** This lease's {@link loggable}, for `JSON.stringify`. */
  toJSON(): LeaseLoggable { return this.loggable }

  /** What a log wants of this lease, with nothing secret and nothing opaque. Its two tokens are cut short by `maskUuid`. */
  get loggable(): LeaseLoggable {
    const { fmt, userid, banklabel, labelpath, wayinkind, born_at, proved_at, gate_labelpath, gate_lifeseq, bank_lifeseq, bank_born_at, isEvicted } = this
    return Object.freeze({
      fmt, userid, banklabel, labelpath, wayinkind, born_at, proved_at, gate_labelpath, gate_lifeseq, gate_revtok: maskUuid(this.gate_revtok), bank_lifeseq, bank_born_at, bank_lifetok: maskUuid(this.bank_lifetok), isEvicted,
    })
  }
  // --

  // == [Construction]: make, constructor

  /** Make the lease of `record`, granted to `opts.gate`, whose bank must be the bank `record` is stamped with. */
  static make(record: Z.input<typeof StampChecks.leaseRecord>, opts: LeaseOpts): Lease { return new Lease(record, opts) }

  private constructor(record: Z.input<typeof StampChecks.leaseRecord>, opts: LeaseOpts) {
    const { record: recordChecked, opts: { gate } } = Checks.leaseMakeArgs.parse({ record, opts })
    Validator.checkedConsistent(bankStampOf(recordChecked), gate.bankStamp, { kind: 'damaged_lease' })
    this.#record = recordChecked
    Helpers.tattoo(this, StampChecks.leaseStamp.parse(recordChecked), { configurable: false })
    this.#gate = opts.gate
    Object.freeze(this)
  }
  // --

  // == [Ending one]: evict

  /** Drop the keys, for good. */
  evict(): void { this.#record = null }
  // --

  // == [Sealing under the bankKey]: seal, unseal, sealText, openSealed, ctxOf, bankKey

  /** Seal and return the next revision after `donorProps`, with `publicProps` applied and `secretProps` encrypted.
   * The seal checks its arguments (`BaseBox` refuses an unknown key in `publicProps` or `secretProps`) and the record it returns, so pass `donorProps` as you have it: whole, sparse, sealed or unsealed. None of its secrets reaches the revision.
   * Given `am: 'x'` in `publicProps`, it seals the tombstone of the live `donorProps` instead, and refuses any `secretProps`. The sealer may refuse body fields there too: `BaseBox` refuses any sidecar but `{}`.
   * The seal is bound to the bank's stamp, the revision's stamp and the sealer's tags. The cleartext's bytes are zeroed afterwards.
   * @example
   *   await lease.seal(BaseBox, box, { sidecar: { account: 'work' } }, { whisper })  // its next revision
   *   await lease.seal(BaseBox, box, { am: 'x' })                                     // its tombstone
   */
  seal<RecordT extends Sparse<ThingRecord>, CleartextsT>(
    sealer: Sealers.Sealer<RecordT, CleartextsT>, donorProps: Sealers.Sealable<RecordT>, publicProps: Sealers.TombstonePublicProps & Partial<Sealers.BodyOf<RecordT, CleartextsT>>,
  ): Promise<Sealers.TombstoneOf<RecordT>>
  seal<RecordT extends Sparse<ThingRecord>, CleartextsT>(
    sealer: Sealers.Sealer<RecordT, CleartextsT>, donorProps: Sealers.Sealable<RecordT>, publicProps: Sealers.LivePublicPropsOf<RecordT, CleartextsT>, secretProps: CleartextsT,
  ): Promise<Sealers.LiveOf<RecordT>>
  seal<RecordT extends Sparse<ThingRecord>, CleartextsT>(
    sealer: Sealers.Sealer<RecordT, CleartextsT>, donorProps: Sealers.Sealable<RecordT>, publicProps: Sealers.PublicPropsOf<RecordT, CleartextsT>, secretProps?: CleartextsT,
  ): Promise<RecordT>
  async seal<RecordT extends Sparse<ThingRecord>, CleartextsT>(
    sealer: Sealers.Sealer<RecordT, CleartextsT>, donorProps: Sealers.Sealable<RecordT>, publicProps: Sealers.PublicPropsOf<RecordT, CleartextsT>, secretProps?: CleartextsT,
  ): Promise<RecordT> {
    Checks.sealer.parse(sealer)
    const kept = withoutSecrets(sealer.donorPropsOf(donorProps))
    const given = sealer.publicPropsOf(publicProps)
    const isGone = (given.am === 'x')
    if (isGone && (secretProps !== undefined)) { throw Throwers.tombstoneSecretsGiven() }
    const revision   = isGone ? sealer.tombstoneOf(kept, given) : sealer.nextRevisionOf(kept, given)
    const cleartexts = isGone ? sealer.tombstoneSecrets         : sealer.secretPropsOf(secretProps)
    const sealed = await this.#sealText(sealer, revision, sealer.encode(cleartexts))
    return sealer.recordOf(revision, sealed)
  }

  /** Unseal `record`, returning it with the part `sealer` seals in cleartext, in place of its sealed form.
   * The answer is a new, frozen record built from a checked copy of `record`, not `record` itself.
   * Unsealing authenticates the ciphertexts, the stamp and the tags together: a change to any of them refuses as damaged.
   */
  async unseal<RecordT extends Sparse<ThingRecord>, CleartextsT>(sealer: Sealers.Sealer<RecordT, CleartextsT>, record: RecordT): Promise<Sealers.UnsealedOf<RecordT, CleartextsT>> {
    Checks.sealer.parse(sealer)
    // The answer is built from the record as the sealer checks a stored one, never from the caller's object.
    const recordChecked = sealer.recordOf(record, sealer.sealedOf(record))
    const cleartexts = sealer.decode(await this.#openSealed(sealer, recordChecked))
    // The spread's type is UnsealedOf's, which TypeScript cannot see through for a record of any kind.
    return Object.freeze({ ...withoutSecrets(recordChecked), ...cleartexts }) as Sealers.UnsealedOf<RecordT, CleartextsT>
  }

  /** Encrypt `cleartext` for `revision` under a fresh key wrapped under the bankKey, as a {@link Sealers.Sealed} with the sealer's tags. */
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
  async #openSealed<RecordT extends Sparse<ThingRecord>>(sealer: Pick<Sealers.Sealer<RecordT, unknown>, 'sealedOf' | 'stampOf' | 'purposes'>, record: RecordT): Promise<string> {
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
    return Crypto.cipherCtx([BankChecks.stamp.parse(this.#gate.bankStamp), stamp], purpose, tags)
  }

  /** The bankKey for this call alone, non-extractable, with `usage` its only usage. Nothing retains it between calls. */
  async #bankKey(usage: 'wrapKey' | 'unwrapKey'): Promise<CryptoKey> {
    this.demandEnabled()
    // demandEnabled refuses an evicted lease, whose record is null.
    const { lease_key, bank_key_lease_wrapped } = this.#record!
    const ctx = Crypto.cipherCtx([BankChecks.stamp.parse(this.#gate.bankStamp), this.stamp], 'bank_key_lease_wrapped')
    // Only this WebCrypto call is trapped: its rejection is how a damaged lease is learned.
    try {
      return await Crypto.unwrapKeyUnder(lease_key, bank_key_lease_wrapped, ctx, { extractable: false, usage: [usage] })
    } catch {
      // The gate drops its lease as it locks; this one is evicted too, should the gate have another.
      this.#gate.lock()
      this.evict()
      throw Throwers.damagedLease()
    }
  }
  // --

  // == [Guards]: isEvicted, isEnabled, demandEnabled

  /** True once this lease's keys are dropped. */
  get isEvicted(): boolean { return this.#record === null }

  /** True while this lease is not evicted and its gate is enabled. */
  get isEnabled(): boolean { return (this.#record !== null) && this.#gate.isEnabled }

  /** Throw unless {@link isEnabled}. */
  demandEnabled(): this {
    this.#gate.demandEnabled()
    if (this.#record === null) { throw Throwers.leaseNotInForce() }
    return this
  }
  // --

  /** Always `'lease'`: this model's {@link Modelkind}. */
  get modelkind(): 'lease' { return 'lease' satisfies Modelkind }
}

// == [Helpers]: bankStampOf, withoutSecrets, sealerMembersOf

/** The stamp of the bank `stamp` is granted under, from its `bank_` fields. */
function bankStampOf({ userid, banklabel, bank_lifeseq, bank_born_at, bank_lifetok }: LeaseStamp): BankStamp {
  return { userid, banklabel, lifeseq: bank_lifeseq, born_at: bank_born_at, lifetok: bank_lifetok }
}

/** A copy of `bag` without its secret fields: `whisper`, and every field whose name ends in `_sealed`.
 * It checks nothing else of `bag`.
 */
export function withoutSecrets<BagT extends object>(bag: BagT): Omit<BagT, keyof BagT & SecretFieldname> {
  const secretFieldnames = Object.keys(bag).filter((fieldname) => fieldname.endsWith('_sealed') || CleartextFieldnames.has(fieldname))
  // Object.keys loses the fieldnames' type: the cast restores it.
  return omit(bag, secretFieldnames as (keyof BagT & SecretFieldname)[])
}

// A class's static methods are its own but not enumerable, so a spread would miss them: each member is read by name.
/** The sealer members of `val`, an object or a class, or null for anything else */
function sealerMembersOf(val: unknown): Partial<Record<keyof AnySealer, unknown>> | null {
  if ((val === null) || ((typeof val !== 'object') && (typeof val !== 'function'))) { return null }
  const {
    donorPropsOf, publicPropsOf, secretPropsOf, nextRevisionOf, tombstoneOf, tombstoneSecrets, stampOf, tags, purposes, encode, decode, sealedOf, recordOf,
  } = val as Partial<Record<keyof AnySealer, unknown>>
  return { donorPropsOf, publicPropsOf, secretPropsOf, nextRevisionOf, tombstoneOf, tombstoneSecrets, stampOf, tags, purposes, encode, decode, sealedOf, recordOf }
}
// --

// == [Checks]: Checks

// Defined here, not with the shapes: it names a model class.
/** The checks of {@link Lease.make}'s arguments, and of the sealer a seal or unseal is given. */
const Checks = Validator.Checkers('bad_record', ({ obj, str, fn, custom }) => {
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
    leaseMakeArgs: obj({ record: StampChecks.leaseRecord, opts: obj({ gate: GateishChecks.leaseGate }) }),
    sealer:        custom<AnySealer>((val) => sealerMembers.safeParse(sealerMembersOf(val)).success, Phrases.SealerExpected),
  }
})
// --
