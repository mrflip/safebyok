import type { Deriver } from 'safebyok-big/internals'
import { CX, Clock, Consts as ConstsX, Crypto, Errors, GX, Phrases as BigPhrases, Validator } from 'safebyok-big/internals'
import * as Phrases from '../phrases'
import { Lease } from './lease'
import { type GateRevisionedStamp, type GuardedKeyDeriver, type LeaseGate, type ProvingDevice, type ProvingOpts, type ProvingParts, GateishChecks } from '../shapes/shapes-gateish'
import type { BankScope, BankStamp, GateStamp, StampedGate } from '../shapes/shapes-stamps'
import * as Stamps from '../shapes/shapes-stamps'
import type { Modelkind } from '../shapes/shapes-thing'
import { BankChecks, GateChecks } from '../shapes/shapes-thingkinds'
import { Wayin, wayinCtxOf } from './wayin'
import { bulletproofAsyncHandlerOf } from '../helpers/bulletproof'
import * as Throwers from '../refusals/throwers'

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
export abstract class Proving<HeaderT extends GX.WayinHeader = GX.WayinHeader> {
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
  toJSON(): { wayinkind: GX.WayinHeader['wayinkind'] } { return { wayinkind: this.wayinkind } }
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
    const wayinSource = Checks.wayinSource.parse(source)
    if (wayinSource !== NOVEL) {
      Validator.checkedConsistent(wayinSource.bankStamp, this.bankStamp, { kind: 'unexpected_error', message: BigPhrases.ProvingOfOtherGate })
      Validator.checkedConsistent(wayinSource.gateStamp, this.gateStamp, { kind: 'unexpected_error', message: BigPhrases.ProvingOfOtherGate })
    }
    const bankKey = wayinSource === NOVEL ? await Crypto.makeBankKey() : await wayinSource.#unwrapBankKey()
    return this.#wrapBankKey(bankKey)
  }

  // The bankKey is unwrapped, wrapped again under the leaseKey and dropped here, crossing no method boundary (G3).
  /** Build a lease granted to `gate`, citing its revision `cited`. The bankKey this proving unwraps is wrapped under a fresh, non-extractable leaseKey. */
  async buildLease(gate: LeaseGate, cited: GateRevisionedStamp): Promise<Lease> {
    const { gate: { bankStamp }, cited: gateRevision } = Checks.provingLeaseArgs.parse({ gate, cited })
    Validator.checkedConsistent(bankStamp,    this.bankStamp, { kind: 'unexpected_error', message: BigPhrases.LeaseOfOtherGate })
    Validator.checkedConsistent(gateRevision, this.gateStamp, { kind: 'unexpected_error', message: BigPhrases.LeaseOfOtherGate })
    const granted = {
      fmt: Stamps.StampChecks.LeaseFormat, ...bankStamp, gate_labelpath: gateRevision.labelpath, gate_lifeseq: gateRevision.lifeseq, gate_revtok: gateRevision.revtok, proved_at: Clock.nowMillis(), wayinkind: this.wayinkind,
    } as const
    const bankKey = await this.#unwrapBankKey()
    const leaseKey = await Crypto.makeLeaseKey()
    const bank_key_lease_wrapped = await Crypto.wrapKeyUnder(leaseKey, bankKey, Crypto.cipherCtx([bankStamp, granted], 'bank_key_lease_wrapped'))
    return Lease.make({ ...granted, lease_key: leaseKey, bank_key_lease_wrapped }, { gate })
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
export class PassphraseProving extends Proving<GX.PassphraseWayinHeader> {
  // == [Construction]: make, buildNovel, buildStored

  /** Make the proving of `parts`, under `opts.wayinKey`. */
  static make(parts: ProvingParts<GX.PassphraseWayinHeader>, opts: ProvingOpts): PassphraseProving { return new PassphraseProving(parts, opts) }

  /** Build a proving for a new passphrase wayin of the gate stamped `gateStamp`, in the bank stamped `bankStamp`, under a fresh salt.
   * Throws `weak_passphrase` if the strength checker judges the passphrase weak.
   */
  static async buildNovel(device: ProvingDevice, bankStamp: BankStamp, gateStamp: GateStamp, passphraseCleartext: GX.PassphraseCleartext): Promise<PassphraseProving> {
    const { bankStamp: bankStampChecked, gateStamp: gateStampChecked, passphraseClear: typed } = Checks.passphraseNovelArgs.parse({ device, bankStamp, gateStamp, passphraseClear: passphraseCleartext })
    const verdict = await super.judgeStrength(device, bankStampChecked, typed)
    if (! verdict.strong) { throw Throwers.weakPassphrase(verdict.reason) }
    const header = mintPassphraseHeader(device)
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
export class PasskeyProving extends Proving<GX.PasskeyWayinHeader> {
  // == [Construction]: make, buildNovel, buildStored

  /** Make the proving of `parts`, under `opts.wayinKey`. */
  static make(parts: ProvingParts<GX.PasskeyWayinHeader>, opts: ProvingOpts): PasskeyProving { return new PasskeyProving(parts, opts) }

  /** Build a proving for a new passkey wayin of the gate stamped `gateStamp`, in the bank stamped `bankStamp`. */
  static async buildNovel(device: ProvingDevice, bankStamp: BankStamp, gateStamp: GateStamp, passkeyCleartext: GX.PasskeyAnswer): Promise<PasskeyProving> {
    const { bankStamp: bankStampChecked, gateStamp: gateStampChecked, passkeyClear: answer } = Checks.passkeyNovelArgs.parse({ device, bankStamp, gateStamp, passkeyClear: passkeyCleartext })
    const header = mintPasskeyHeader(device, answer)
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

/** The header of a new passphrase wayin, with a fresh random salt */
function mintPassphraseHeader({ keyDeriver, device_tok }: ProvingDevice): GX.PassphraseWayinHeader {
  return GX.passphraseWayinHeader.parse({
    wayinkind:         'passphrase',
    wayinlabel:        'main',
    key_deriver_label: keyDeriver.key_deriver_label,
    salt_b64:          Crypto.toB64(Crypto.randomBytes(keyDeriver.salt_size)),
    device_tok,
    registered_at:     Clock.nowMillis(),
  })
}

/** The header of a new passkey wayin, for the passkey that gave `answer` */
function mintPasskeyHeader({ device_tok }: ProvingDevice, { credential_id, prf_salt_b64 }: GX.PasskeyAnswer): GX.PasskeyWayinHeader {
  return GX.passkeyWayinHeader.parse({
    wayinkind:     'passkey',
    wayinlabel:    'passkey0',
    credential_id,
    prf_salt_b64,
    device_tok,
    registered_at: Clock.nowMillis(),
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

// == [Checks]: Checks

// Defined here, not with the shapes: they name a model class.
// The builders' checks are big's, over the lean core's stamps and the lean core's strength checker.
/** The checks of {@link Proving.buildWayin}'s `source`, {@link Proving.buildLease}'s arguments, and the static builders' and `judgeStrength`'s arguments. */
const Checks = Validator.Checkers('bad_record', ({ obj, custom }) => {
  return {
    wayinSource:          custom<Novel | Proving>((val) => (val === NOVEL) || (val instanceof Proving), Phrases.NovelOrProvingExpected),
    provingLeaseArgs:     obj({ gate: GateishChecks.leaseGate, cited: GateishChecks.gateRevisionedStamp }),
    passphraseNovelArgs:  GX.passphraseNovelArgs.omit({ bank: true, gate: true }).extend({ bankStamp: BankChecks.stamp, gateStamp: GateChecks.stamp, device: GateishChecks.provingDevice }),
    passkeyNovelArgs:     GX.passkeyNovelArgs.omit({ bank: true, gate: true }).extend({ bankStamp: BankChecks.stamp, gateStamp: GateChecks.stamp, device: GateishChecks.provingDevice }),
    passphraseStoredArgs: GX.passphraseStoredArgs.extend({ gate: GateChecks.stampedGate, device: GateishChecks.provingDevice }),
    passkeyStoredArgs:    GX.passkeyStoredArgs.extend({ gate: GateChecks.stampedGate }),
    strengthArgs:         GX.strengthArgs.extend({ scope: Stamps.StampChecks.bankScope, device: GateishChecks.provingDevice }),
  }
})
// --
