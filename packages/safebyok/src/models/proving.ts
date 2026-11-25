import { isEqual } from 'es-toolkit'
import type { Deriver } from 'safebyok-big/internals'
import { CX, Clock, Consts as ConstsX, Crypto, Errors, GX, Phrases as BigPhrases, Validator } from 'safebyok-big/internals'
import { Lease } from './lease'
import { type GateRevisionedStamp, type GuardedKeyDeriver, type LeaseGate, type ProvingDevice, type ProvingOpts, type ProvingParts, GateishChecks } from '../shapes/shapes-gateish'
import type { BankScope, BankStamp, GateStamp, LeaseRecord, StampedGate } from '../shapes/shapes-stamps'
import * as Stamps from '../shapes/shapes-stamps'
import type { Modelkind, Sparse } from '../shapes/shapes-thing'
import type { Devicetok } from '../shapes/primitives'
import { BankChecks, GateChecks } from '../shapes/shapes-thingkinds'
import { Wayin, wayinCtxOf } from './wayin'
import { bulletproofAsyncHandlerOf } from '../helpers/bulletproof'
import { type PasskeyWayinHeader, type PassphraseWayinHeader, type WayinHeader, WayinChecks } from '../shapes/shapes-wayin'
import * as Throwers from '../refusals/throwers'
import * as Phrases from '../phrases'

// == [NOVEL and the usages]: NOVEL, Novel, RewrapUsage, CheckUsage

/** Pass to {@link Proving.buildWayin} to wrap a newly made bankKey. */
export const NOVEL: unique symbol = Symbol.for('@safebyok/novel')

/** The type of {@link NOVEL}. */
export type Novel = typeof NOVEL

// A bankKey unwrapped with it is dropped when its method ends (G3).
/** How a proving unwraps the bankKey to wrap it again: extractable, which WebCrypto requires for that. */
const RewrapUsage = Object.freeze({ extractable: true, usage: ['wrapKey'] as const })

// A bankKey unwrapped with it is dropped at once.
/** How a proving unwraps the bankKey only to learn that it unwraps: non-extractable. */
const CheckUsage = Object.freeze({ extractable: false, usage: ['wrapKey'] as const })

/** A passphrase or a passkey answer, made into the wayinKey of one wayin.
 * Build one with a subclass's `buildStored`, to prove the wayin a gate has, or `buildNovel`, for a new wayin.
 * Only a proving has a wayinKey, and it hands no bankKey to its caller. It retains no cleartext, and leaves a
 * passkey answer's bytes for its caller to zero.
 */
export abstract class Proving<HeaderT extends WayinHeader = WayinHeader> {
  // == [Props]: wayinkind, header, #bankStamp, #gateStamp, bankStamp, gateStamp, #wayinKey, #wayin, toJSON

  readonly wayinkind: HeaderT['wayinkind']
  readonly header:    HeaderT

  readonly #bankStamp: BankStamp
  readonly #gateStamp: GateStamp

  /** The stamp of this proving's bank, which its wayin's wrapped bankKey is bound to. */
  get bankStamp(): BankStamp { return this.#bankStamp }

  /** The stamp of this proving's gate, which its wayin's wrapped bankKey is bound to. */
  get gateStamp(): GateStamp { return this.#gateStamp }

  /** The key this proving wraps and unwraps the bankKey under. No method returns it (G2) */
  readonly #wayinKey: CryptoKey
  #wayin: Wayin | null

  /** This proving for `JSON.stringify`, showing only its wayinkind. */
  toJSON(): { wayinkind: WayinHeader['wayinkind'] } { return { wayinkind: this.wayinkind } }
  // --

  // == [Construction]: constructor

  protected constructor({ bankStamp, gateStamp, header, stored }: ProvingParts<HeaderT>, { wayinKey }: ProvingOpts) {
    this.wayinkind = header.wayinkind
    this.header = Object.freeze(header)
    this.#wayinKey = wayinKey
    this.#wayin = stored
    this.#bankStamp = Object.freeze(bankStamp)
    this.#gateStamp = Object.freeze(gateStamp)
    Object.freeze(this)
  }
  // --

  // == [Methods]: judgeStrength, buildWayin, buildLease, wrapBankKey, unwrapBankKey, wayinCtx

  /** The strength checker's verdict on `passphraseCleartext`.
   * A throw from the checker is replaced, so no error quotes the passphrase.
   */
  static async judgeStrength(device: ProvingDevice, scope: BankScope, passphraseCleartext: string): Promise<GX.PassphraseVerdict> {
    const { passphraseClear: typed, scope: scopeChecked, device: deviceChecked } = Checks.strengthArgs.parse({ passphraseClear: passphraseCleartext, scope, device })
    return deviceChecked.strengthChecker(typed, scopeChecked)
  }

  /** Wrap a bankKey into this proving's wayin: a new one for `NOVEL`, or the one `source` unwraps.
   * `source` must be a proving of the same gate. Call this once, on a proving from `buildNovel`.
   */
  async buildWayin(source: Novel | Proving): Promise<Wayin> {
    if (this.#wayin !== null) { throw Throwers.wayinMadeAlready() }
    if (source !== NOVEL) {
      Validator.checkedConsistent(source.bankStamp, this.bankStamp, { kind: 'unexpected_error', message: BigPhrases.ProvingOfOtherGate })
      Validator.checkedConsistent(source.gateStamp, this.gateStamp, { kind: 'unexpected_error', message: BigPhrases.ProvingOfOtherGate })
    }
    const bankKey = source === NOVEL ? await Crypto.makeBankKey() : await source.#unwrapBankKey()
    return this.#wrapBankKey(bankKey)
  }

  // The bankKey is unwrapped, wrapped again under the leaseKey and dropped here, crossing no method boundary (G3).
  // The wrap binds the lease's stamp alone, never its life or revision, so a later revision of the record keeps it.
  /** Build a lease granted to `gate`, citing its revision `cited`, that follows `followed`: the lease stored or held for the gate, or its shell where there is none.
   * After a live lease it is that lease's life at the next revision, keeping its `born_at`; after a tombstone or the shell, it is born in the next life.
   * It ends `gate.leaseMillis` after it is proved. The bankKey this proving unwraps is wrapped under a fresh, non-extractable leaseKey.
   */
  async buildLease(gate: LeaseGate, cited: GateRevisionedStamp, followed: Sparse<LeaseRecord>): Promise<Lease> {
    const { gate: { bankStamp, leaseMillis }, cited: gateRevision } = Checks.provingLeaseArgs.parse({ gate, cited })
    Validator.checkedConsistent(bankStamp,    this.bankStamp, { kind: 'unexpected_error', message: BigPhrases.LeaseOfOtherGate })
    Validator.checkedConsistent(gateRevision, this.gateStamp, { kind: 'unexpected_error', message: BigPhrases.LeaseOfOtherGate })
    const proved_at = Clock.nowMillis()
    const revision  = Lease.nextRevisionOf(followed, proved_at)
    const { userid, banklabel, labelpath } = revision
    Validator.checkedConsistent({ userid, banklabel, labelpath }, Lease.shellOf(gateRevision), { kind: 'unexpected_error', message: BigPhrases.LeaseOfOtherGate })
    const granted = {
      fmt:            Stamps.StampChecks.LeaseFormat,
      userid,
      banklabel,
      bank_lifeseq:   bankStamp.lifeseq,
      bank_born_at:   bankStamp.born_at,
      bank_lifetok:   bankStamp.lifetok,
      gate_labelpath: gateRevision.labelpath,
      gate_lifeseq:   gateRevision.lifeseq,
      gate_revtok:    gateRevision.revtok,
      born_at:        revision.born_at,
      proved_at,
      wayinkind:      this.wayinkind,
    } as const
    const bankKey = await this.#unwrapBankKey()
    const leaseKey = await Crypto.makeLeaseKey()
    const bank_key_lease_wrapped = await Crypto.wrapKeyUnder(leaseKey, bankKey, Crypto.cipherCtx([bankStamp, granted], 'bank_key_lease_wrapped'))
    const ends_at = Math.min(proved_at + leaseMillis, ConstsX.FarFuture)
    return Lease.make({ ...revision, ...granted, lease_key: leaseKey, bank_key_lease_wrapped, ends_at, gate_revseq: gateRevision.revseq }, { gate })
  }

  /** The wayin of this proving's header, with `bankKey` wrapped under its wayinKey */
  async #wrapBankKey(bankKey: CryptoKey): Promise<Wayin> {
    const bank_key_wayin_wrapped = await Crypto.wrapKeyUnder(this.#wayinKey, bankKey, this.#wayinCtx())
    this.#wayin = Wayin.make({ ...this.header, bank_key_wayin_wrapped })
    return this.#wayin
  }

  /** The bankKey of this proving's wayin, extractable so that it can be wrapped again */
  #unwrapBankKey(): Promise<CryptoKey> {
    return Crypto.unwrapKeyUnder(this.#wayinKey, this.#demandWayin().bank_key_wayin_wrapped, this.#wayinCtx(), RewrapUsage)
  }

  /** The ctx this proving's wayin is wrapped under */
  #wayinCtx(): Uint8Array { return wayinCtxOf(this.bankStamp, this.gateStamp, this.header) }
  // --

  // == [Guards]: demandWayin

  /** This proving's wayin, or throw before it has one */
  #demandWayin(): Wayin {
    if (this.#wayin === null) { throw Throwers.wayinNotMadeYet() }
    return this.#wayin
  }
  // --

  // == [Protected, for a subclass to call]: checkUnwraps

  /** Throw `wrongCleartext()` unless this proving's wayinKey unwraps its stored wayin.
   * The bankKey unwrapped is non-extractable, and dropped at once (G3).
   */
  protected async checkUnwraps(wrongCleartext: () => Errors.VaultError): Promise<void> {
    const { bank_key_wayin_wrapped } = this.#demandWayin()
    const ctx = this.#wayinCtx()
    // Only this WebCrypto call is trapped: its rejection is how a wrong passphrase or passkey is learned.
    try {
      await Crypto.unwrapKeyUnder(this.#wayinKey, bank_key_wayin_wrapped, ctx, CheckUsage)
    } catch {
      throw wrongCleartext()
    }
  }
  // --

  /** Always `'proving'`: this model's {@link Modelkind}. */
  get modelkind(): 'proving' { return 'proving' satisfies Modelkind }
}

/** A passphrase made into a wayinKey for one gating. */
export class PassphraseProving extends Proving<PassphraseWayinHeader> {
  // == [Construction]: make, buildNovel, buildStored

  /** Make the proving of `parts`, under `opts.wayinKey`. */
  static make(parts: ProvingParts<PassphraseWayinHeader>, opts: ProvingOpts): PassphraseProving {
    const args = Checks.passphraseMakeArgs.parse({ parts, opts })
    return new PassphraseProving(args.parts, args.opts)
  }

  /** Build a proving for a new passphrase wayin of the gate stamped `gateStamp`, in the bank stamped `bankStamp`, under a fresh salt.
   * Throws `weak_passphrase` if the strength checker judges the passphrase weak.
   */
  static async buildNovel(device: ProvingDevice, bankStamp: BankStamp, gateStamp: GateStamp, passphraseCleartext: GX.PassphraseCleartext): Promise<PassphraseProving> {
    const { bankStamp: bankStampChecked, gateStamp: gateStampChecked, passphraseClear: typed } = Checks.passphraseNovelArgs.parse({ device, bankStamp, gateStamp, passphraseClear: passphraseCleartext })
    const verdict = await super.judgeStrength(device, bankStampChecked, typed)
    if (! verdict.strong) { throw Throwers.weakPassphrase(verdict.reason) }
    const header = mintPassphraseHeader(device, await device.ensureDevicetok())
    const wayinKey = await passphraseKeyOf(device.keyDeriver, typed, Crypto.fromB64(header.salt_b64))
    return this.make({ bankStamp: bankStampChecked, gateStamp: gateStampChecked, header, stored: null }, { wayinKey })
  }

  /** Build the proving of `gate`'s passphrase wayin from `passphraseCleartext`.
   * Throws `wrong_passphrase` if the passphrase is not that wayin's.
   */
  static async buildStored(device: ProvingDevice, gate: StampedGate, passphraseCleartext: GX.PassphraseCleartext): Promise<PassphraseProving> {
    const { gate: { bankStamp, stamp, wayins }, passphraseClear: typed } = Checks.passphraseStoredArgs.parse({ device, gate, passphraseClear: passphraseCleartext })
    const { main } = wayins
    const { bank_key_wayin_wrapped: _wrapped, ...header } = main
    if (header.key_deriver_label !== device.keyDeriver.key_deriver_label) { throw Throwers.unknownKeyDeriver() }
    const wayinKey = await passphraseKeyOf(device.keyDeriver, typed, Crypto.fromB64(header.salt_b64))
    const proving = this.make({ bankStamp, gateStamp: stamp, header, stored: Wayin.make(main) }, { wayinKey })
    await proving.checkUnwraps(Throwers.wrongPassphrase)
    return proving
  }
  // --
}

/** A passkey's answer made into a wayinKey for one gating. */
export class PasskeyProving extends Proving<PasskeyWayinHeader> {
  // == [Construction]: make, buildNovel, buildStored

  /** Make the proving of `parts`, under `opts.wayinKey`. */
  static make(parts: ProvingParts<PasskeyWayinHeader>, opts: ProvingOpts): PasskeyProving {
    const args = Checks.passkeyMakeArgs.parse({ parts, opts })
    return new PasskeyProving(args.parts, args.opts)
  }

  /** Build a proving for a new passkey wayin of the gate stamped `gateStamp`, in the bank stamped `bankStamp`. */
  static async buildNovel(device: ProvingDevice, bankStamp: BankStamp, gateStamp: GateStamp, passkeyCleartext: GX.PasskeyAnswer): Promise<PasskeyProving> {
    const { bankStamp: bankStampChecked, gateStamp: gateStampChecked, passkeyClear: answer } = Checks.passkeyNovelArgs.parse({ device, bankStamp, gateStamp, passkeyClear: passkeyCleartext })
    const header = mintPasskeyHeader(answer, await device.ensureDevicetok())
    const wayinKey = await Crypto.deriveWrappingKey(answer.prfBytes, wayinCtxOf(bankStampChecked, gateStampChecked, header))
    return this.make({ bankStamp: bankStampChecked, gateStamp: gateStampChecked, header, stored: null }, { wayinKey })
  }

  /** Build the proving of `gate`'s passkey wayin from `passkeyCleartext`.
   * Throws `wrong_passkey` if the answer is not from that wayin's passkey.
   */
  static async buildStored(gate: StampedGate, passkeyCleartext: GX.PasskeyAnswer): Promise<PasskeyProving> {
    const { gate: { bankStamp, stamp, wayins }, passkeyClear: { credential_id, prf_salt_b64, prfBytes } } = Checks.passkeyStoredArgs.parse({ gate, passkeyClear: passkeyCleartext })
    const { passkey0 } = wayins
    if (passkey0 === null) { throw Throwers.noPasskeyWayin() }
    const { bank_key_wayin_wrapped: _wrapped, ...header } = passkey0
    if (credential_id !== header.credential_id) { throw Throwers.otherPasskey() }
    if (prf_salt_b64 !== header.prf_salt_b64) { throw Throwers.otherPrfSalt() }
    const wayinKey = await Crypto.deriveWrappingKey(prfBytes, wayinCtxOf(bankStamp, stamp, header))
    const proving = this.make({ bankStamp, gateStamp: stamp, header, stored: Wayin.make(passkey0) }, { wayinKey })
    await proving.checkUnwraps(Throwers.wrongPasskey)
    return proving
  }
  // --
}

// == [Headers]: mintPassphraseHeader, mintPasskeyHeader

/** The header of a new passphrase wayin, recording `devicetok`, with a fresh random salt */
function mintPassphraseHeader({ keyDeriver }: ProvingDevice, devicetok: Devicetok): PassphraseWayinHeader {
  return WayinChecks.passphraseWayinHeader.parse({
    wayinkind:         'passphrase',
    label:             'main',
    key_deriver_label: keyDeriver.key_deriver_label,
    salt_b64:          Crypto.toB64(Crypto.randomBytes(keyDeriver.salt_size)),
    devicetok,
    born_at:           Clock.nowMillis(),
  })
}

/** The header of a new passkey wayin, recording `devicetok`, for the passkey that gave `answer` */
function mintPasskeyHeader({ credential_id, prf_salt_b64 }: GX.PasskeyAnswer, devicetok: Devicetok): PasskeyWayinHeader {
  return WayinChecks.passkeyWayinHeader.parse({
    wayinkind:     'passkey',
    label:         'passkey0',
    credential_id,
    prf_salt_b64,
    devicetok,
    born_at:       Clock.nowMillis(),
  })
}
// --

// == [The key deriver]: guardKeyDeriver, deriveKeyBytes

// Its interface and its salt length are checked, never its other choices (#the-host-is-not-our-threat-model): what its key bytes must be is
// checked where they are received, in passphraseKeyOf. What a failed `load` throws becomes the cause, since `load` is
// given no passphrase; a VaultError `load` throws passes unchanged.
/** Wrap `hostDeriver`, checking its interface, so no error it throws can quote the passphrase. */
export function guardKeyDeriver(hostDeriver: Deriver.KeyDeriver): GuardedKeyDeriver {
  const { key_deriver_label, salt_size } = CX.keyDeriverShape.parse(hostDeriver, { where: 'keyDeriver' })
  const load = bulletproofAsyncHandlerOf(async () => { await hostDeriver.load?.() }, {
    ifError: 'fail', transformer: (err) => (Errors.isVaultError(err) ? err : Throwers.keyDeriverLoadFailed(err)),
  })
  return ConstsX.brandGuarded<GuardedKeyDeriver>({ key_deriver_label, salt_size, deriveKeyBytes: (passphrase, saltBytes) => deriveKeyBytes(hostDeriver, passphrase, saltBytes), load })
}

// The key deriver is given the passphrase here (guarantees-big.md, G1 and G8): what it throws may quote it, so it is replaced, never made the cause.
/** The key bytes `hostDeriver` derives from `passphrase` */
async function deriveKeyBytes(hostDeriver: Deriver.KeyDeriver, passphrase: GX.PassphraseCleartext, saltBytes: Uint8Array): Promise<unknown> {
  try {
    return await hostDeriver.deriveKeyBytes(passphrase, saltBytes)
  } catch {
    throw Throwers.keyDeriverThrew()
  }
}
// --

// == [Key bytes]: isSharedMemory, isSafelyAllZero, passphraseKeyOf

/** True when `view` is over a SharedArrayBuffer */
function isSharedMemory(view: ArrayBufferView): boolean { return Object.prototype.toString.call(view.buffer) === '[object SharedArrayBuffer]' }

// Reads every byte with no early exit and no branch on a byte, as libsodium's sodium_is_zero does: `every` would exit
// early and `for of` would allocate an iterator. No JavaScript engine promises constant time; only the verdict steers what
// follows, and the refusal of an all-zero key tells that anyway.
/** True when every byte of `bytes` is zero. */
function isSafelyAllZero(bytes: Uint8Array): boolean {
  let   seen = 0
  const len  = bytes.length
  for (let ii = 0; ii < len; ii++) {
    // @ts-expect-error -- ii stays below len; noUncheckedIndexedAccess cannot see that, and a default would read as a branch
    seen |= bytes[ii]
  }
  return seen === 0
}

/** The passphraseKey `keyDeriver` derives from `passphrase`, non-extractable. The derived bytes are zeroed (G2) */
async function passphraseKeyOf(keyDeriver: GuardedKeyDeriver, passphrase: GX.PassphraseCleartext, saltBytes: Uint8Array): Promise<CryptoKey> {
  const handed = await keyDeriver.deriveKeyBytes(passphrase, saltBytes)
  if (! ArrayBuffer.isView(handed) || isSharedMemory(handed)) { throw Throwers.notKeyBytes() }
  const keyBytes = new Uint8Array(handed.buffer, handed.byteOffset, handed.byteLength)
  try {
    if (keyBytes.length !== ConstsX.PassphraseKeySize || isSafelyAllZero(keyBytes)) { throw Throwers.notKeyBytes() }
    return await Crypto.importWrappingKeyBytes(keyBytes)
  } finally {
    keyBytes.fill(0)
  }
}
// --

// == [Checks]: isStoredOfHeader, Checks

/** True when `stored` is null, for a new wayin, or a wayin whose header is `header`, and so of its kind. */
function isStoredOfHeader({ header, stored }: { header: WayinHeader, stored: Wayin | null }): boolean {
  return stored === null || isEqual(stored.toJSON(), header)
}

// Defined here, not with the shapes: they name a model class.
// The builders' checks are big's, over the lean core's stamps and the lean core's strength checker.
/** The checks of {@link Proving.buildLease}'s arguments, and the static makers', builders' and `judgeStrength`'s arguments. */
const Checks = Validator.Checkers('bad_record', ({ obj, custom }) => {
  // A wayin's header has a check of its own kind, so each kind's parts are checked apart.
  const provingParts = obj({ bankStamp: BankChecks.stamp, gateStamp: GateChecks.stamp, stored: custom<Wayin>((val) => val instanceof Wayin, Phrases.WayinExpected).nullable() })
  return {
    passphraseMakeArgs:   obj({ parts: provingParts.extend({ header: WayinChecks.passphraseWayinHeader.strict() }).strict().refine(isStoredOfHeader, Phrases.WayinOfOtherHeader), opts: GateishChecks.provingOpts }),
    passkeyMakeArgs:      obj({ parts: provingParts.extend({ header: WayinChecks.passkeyWayinHeader.strict() }).strict().refine(isStoredOfHeader, Phrases.WayinOfOtherHeader), opts: GateishChecks.provingOpts }),
    provingLeaseArgs:     obj({ gate: GateishChecks.leaseGate, cited: GateishChecks.gateRevisionedStamp }),
    passphraseNovelArgs:  GX.passphraseNovelArgs.omit({ bank: true, gate: true }).extend({ bankStamp: BankChecks.stamp, gateStamp: GateChecks.stamp, device: GateishChecks.provingDevice }),
    passkeyNovelArgs:     GX.passkeyNovelArgs.omit({ bank: true, gate: true }).extend({ bankStamp: BankChecks.stamp, gateStamp: GateChecks.stamp, device: GateishChecks.provingDevice }),
    passphraseStoredArgs: GX.passphraseStoredArgs.extend({ gate: GateChecks.stampedGate, device: GateishChecks.provingDevice }),
    passkeyStoredArgs:    GX.passkeyStoredArgs.extend({ gate: GateChecks.stampedGate }),
    strengthArgs:         GX.strengthArgs.extend({ scope: Stamps.StampChecks.bankScope, device: GateishChecks.provingDevice }),
  }
})
// --
