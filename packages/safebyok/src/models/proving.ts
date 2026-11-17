import type * as Z from 'zod'
import type { Consts, Deriver } from 'safebyok-big/internals'
import { CX, Clock, Consts as ConstsX, Crypto, Errors, GX, Phrases, Throwers, Validator } from 'safebyok-big/internals'
import { thingRecord } from '../storage/shapes-thing'
import { Lease, type LeaseBank } from './lease'
import type { BankScope, BankStamp, GateStamp, StampedGate } from './stamps'
import * as Stamps from './stamps'
import type { GuardedStrengthChecker } from '../helpers/passphrase-strength'
import { Wayin, wayinCtxOf } from './wayin'

// == [NOVEL and the checks]: NOVEL, Novel, RewrapUsage, CheckUsage, Checks, GateRevisionedStamp, ProvingDevice

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

// Defined here, not with the shapes: they name a model class.
// The builders' checks are big's, over the lean core's stamps and the lean core's strength checker.
/** The checks of a {@link GateRevisionedStamp}, a {@link ProvingDevice}, {@link Proving.buildWayin}'s `source`, {@link Proving.buildLease}'s arguments, and the static builders' and `judgeStrength`'s arguments. */
const Checks = Validator.Checkers('bad_record', ({ obj, fn, bool, custom }) => {
  // A gate's stamp is fixed for its life; the lease pins one revision of the gate too.
  const gateRevisionedStamp = Stamps.gateStamp.extend(thingRecord.pick({ revtok: true }).shape)
  const provingDevice = GX.provingDevice.extend({ strengthChecker: custom<GuardedStrengthChecker>(ConstsX.isGuarded, Phrases.GuardedExpected) })
  return {
    gateRevisionedStamp,
    provingDevice,
    wayinSource:          custom<Novel | Proving>((val) => (val === NOVEL) || (val instanceof Proving), 'Expected NOVEL or a proving'),
    provingLeaseArgs:     obj({ bank: obj({ stamp: Stamps.bankStamp, lock: fn<() => unknown>(), isEnabled: bool, demandEnabled: fn<() => unknown>() }), gate: gateRevisionedStamp }),
    passphraseNovelArgs:  GX.passphraseNovelArgs.omit({ bank: true, gate: true }).extend({ bankStamp: Stamps.bankStamp, gateStamp: Stamps.gateStamp, device: provingDevice }),
    passkeyNovelArgs:     GX.passkeyNovelArgs.omit({ bank: true, gate: true }).extend({ bankStamp: Stamps.bankStamp, gateStamp: Stamps.gateStamp, device: provingDevice }),
    passphraseStoredArgs: GX.passphraseStoredArgs.extend({ gate: Stamps.stampedGate, device: provingDevice }),
    passkeyStoredArgs:    GX.passkeyStoredArgs.extend({ gate: Stamps.stampedGate }),
    strengthArgs:         GX.strengthArgs.extend({ scope: Stamps.bankScope, device: provingDevice }),
  }
})

/** A {@link GateStamp} with the `revtok` of one revision of the gate: the revision a lease is granted under. */
export type GateRevisionedStamp = Z.infer<typeof Checks.gateRevisionedStamp>

/** What a proving is given of its device: the wrapped key deriver and strength checker, and the device's token. */
export type ProvingDevice = Z.infer<typeof Checks.provingDevice>
// --

/** The parts of a proving: the stamps its wayin is bound to, the wayin's header, and the stored wayin it proves, if any. */
export interface ProvingParts<HeaderT extends GX.WayinHeader> {
  bankStamp: BankStamp
  gateStamp: GateStamp
  header:    HeaderT
  /** The stored wayin this proving proves, or null for a new wayin, which `buildWayin` makes. */
  stored:    Wayin | null
}

/** The options of a proving's `make`, beside its parts. */
export interface ProvingOpts {
  /** The key the proving wraps and unwraps the bankKey under: non-extractable. */
  wayinKey: CryptoKey
}

/** A passphrase or a passkey answer, made into the wayinKey of one wayin.
 * Build one with a subclass's `buildStored`, to prove the wayin a gate has, or `buildNovel`, for a new wayin.
 * Only a proving has a wayinKey, and it hands no bankKey to its caller. It keeps no cleartext, and leaves a
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
    const { passphraseClear: typed, scope: checkedScope, device: checkedDevice } = Checks.strengthArgs.parse({ passphraseClear: passphraseCleartext, scope, device })
    return checkedDevice.strengthChecker(typed, checkedScope)
  }

  /** Wrap a bankKey into this proving's wayin: a new one for `NOVEL`, or the one `source` unwraps.
   * `source` must be a proving of the same gate. Call this once, on a proving from `buildNovel`.
   */
  async buildWayin(source: Novel | Proving): Promise<Wayin> {
    if (this.#wayin !== null) { throw Throwers.wayinMadeAlready() }
    const checked = Checks.wayinSource.parse(source)
    if (checked !== NOVEL) {
      Validator.checkedConsistent(checked.bankStamp, this.bankStamp, { kind: 'unexpected_error', message: Phrases.ProvingOfOtherGate })
      Validator.checkedConsistent(checked.gateStamp, this.gateStamp, { kind: 'unexpected_error', message: Phrases.ProvingOfOtherGate })
    }
    const bankKey = checked === NOVEL ? await Crypto.makeBankKey() : await checked.#unwrapBankKey()
    return this.#wrapBankKey(bankKey)
  }

  // The bankKey is unwrapped, wrapped again under the leaseKey and dropped here, crossing no method boundary (G3).
  /** Build a lease on `bank`, citing the gate revision `gate`. The bankKey this proving unwraps is wrapped under a fresh, non-extractable leaseKey. */
  async buildLease(bank: LeaseBank, gate: GateRevisionedStamp): Promise<Lease> {
    const { bank: { stamp: bankStamp }, gate: cited } = Checks.provingLeaseArgs.parse({ bank, gate })
    Validator.checkedConsistent(bankStamp, this.bankStamp, { kind: 'unexpected_error', message: Phrases.LeaseOfOtherGate })
    Validator.checkedConsistent(cited, this.gateStamp, { kind: 'unexpected_error', message: Phrases.LeaseOfOtherGate })
    const granted = {
      fmt: Stamps.LeaseFormat, ...bankStamp, gate_labelpath: cited.labelpath, gate_lifeseq: cited.lifeseq, gate_revtok: cited.revtok, proved_at: Clock.nowMillis(), wayinkind: this.wayinkind,
    } as const
    const bankKey = await this.#unwrapBankKey()
    const leaseKey = await Crypto.makeLeaseKey()
    const bank_key_lease_wrapped = await Crypto.wrapKeyUnder(leaseKey, bankKey, Crypto.cipherCtx([bankStamp, granted], 'bank_key_lease_wrapped'))
    return Lease.make({ ...granted, lease_key: leaseKey, bank_key_lease_wrapped }, { bank })
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

  /** Always `'proving'`: marks this model for a {@link Consts.Modelkind} check. */
  get modelkind(): 'proving' { return 'proving' satisfies Consts.Modelkind }
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
    const { bankStamp: checkedBank, gateStamp: checkedGate, passphraseClear: typed } = Checks.passphraseNovelArgs.parse({ device, bankStamp, gateStamp, passphraseClear: passphraseCleartext })
    const verdict = await super.judgeStrength(device, checkedBank, typed)
    if (! verdict.strong) { throw Throwers.weakPassphrase(verdict.reason) }
    const header = mintPassphraseHeader(device)
    const wayinKey = await passphraseKeyOf(device.keyDeriver, typed, Crypto.fromB64(header.salt_b64))
    return this.make({ bankStamp: checkedBank, gateStamp: checkedGate, header, stored: null }, { wayinKey })
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
    const { bankStamp: checkedBank, gateStamp: checkedGate, passkeyClear: answer } = Checks.passkeyNovelArgs.parse({ device, bankStamp, gateStamp, passkeyClear: passkeyCleartext })
    const header = mintPasskeyHeader(device, answer)
    const wayinKey = await Crypto.deriveWrappingKey(answer.prfBytes, wayinCtxOf(checkedBank, checkedGate, header))
    return this.make({ bankStamp: checkedBank, gateStamp: checkedGate, header, stored: null }, { wayinKey })
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

// == [The key deriver]: GuardedKeyDeriver, guardKeyDeriver, deriveKeyBytes

/** The host's key deriver, wrapped by {@link guardKeyDeriver}. */
export type GuardedKeyDeriver = ProvingDevice['keyDeriver']

// Its interface and its salt length are checked, never its other choices (#the-host-is-not-our-threat-model): what its key bytes must be is
// checked where they are received, in passphraseKeyOf. A failed `load` keeps its throw as the cause, as it heard nothing;
// a VaultError `load` throws passes as it came.
/** Wrap `hostDeriver`, checking its interface, so no error it throws can quote the passphrase. */
export function guardKeyDeriver(hostDeriver: Deriver.KeyDeriver): GuardedKeyDeriver {
  const { key_deriver_label, salt_size } = CX.keyDeriverShape.parse(hostDeriver, { where: 'keyDeriver' })
  const load = async (): Promise<void> => {
    try {
      await hostDeriver.load?.()
    } catch (err) {
      if (Errors.isVaultError(err)) { throw err }
      throw Throwers.keyDeriverLoadFailed(err)
    }
  }
  return ConstsX.brandGuarded<GuardedKeyDeriver>({ key_deriver_label, salt_size, deriveKeyBytes: (passphrase, saltBytes) => deriveKeyBytes(hostDeriver, passphrase, saltBytes), load })
}

// The key deriver hears the passphrase here (guarantees-big.md, G1 and G8): what it throws may quote it, so it is replaced, not kept as a cause.
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
