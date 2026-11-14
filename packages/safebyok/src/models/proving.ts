import type { Consts, Deriver } from 'safebyok-big/internals'
import { CX, Clock, Consts as ConstsX, Crypto, Errors, GX, Phrases, Throwers, Validator } from 'safebyok-big/internals'
import { Lease, type LeaseBank } from './lease'
import { Wayin, wayinCtxOf } from './wayin'

// == [NOVEL and the checks]: NOVEL, Novel, RewrapUsage, CheckUsage, Checks

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
/** The checks of {@link Proving.buildWayin}'s `source` and {@link Proving.buildLease}'s arguments. */
const Checks = Validator.Checkers('bad_option', ({ obj, fn, custom }) => ({
  wayinSource:      custom<Novel | Proving>((val) => (val === NOVEL) || (val instanceof Proving), 'Expected NOVEL or a proving'),
  provingLeaseArgs: obj({ bank: obj({ stamp: GX.bankStamp, lock: fn<() => unknown>() }), gate: GX.citedGate }),
}))
// --

/** What a proving is made of: the stamps its wayin is bound to, the wayin's header, and the stored wayin it proves, if any. */
export interface ProvingParts<HeaderT extends GX.WayinHeader> {
  bank:   GX.BankStamp
  gate:   GX.GateStamp
  header: HeaderT
  /** The stored wayin this proving proves; null for a proving of a new wayin, which gets it from `buildWayin`. */
  stored: Wayin | null
}

/** What a proving's `make` is given besides its parts. */
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

  readonly #bankStamp: GX.BankStamp
  readonly #gateStamp: GX.GateStamp

  /** The stamp of this proving's bank, which its wayin's wrapped bankKey is bound to. */
  get bankStamp(): GX.BankStamp { return this.#bankStamp }

  /** The stamp of this proving's gate, which its wayin's wrapped bankKey is bound to. */
  get gateStamp(): GX.GateStamp { return this.#gateStamp }

  /** The key this proving wraps and unwraps the bankKey under. No method returns it (G2) */
  readonly #wayinKey: CryptoKey
  #wayin: Wayin | null

  /** This proving for `JSON.stringify`, showing only its wayinkind. */
  toJSON(): { wayinkind: GX.WayinHeader['wayinkind'] } { return { wayinkind: this.wayinkind } }
  // --

  // == [Construction]: constructor

  protected constructor({ bank, gate, header, stored }: ProvingParts<HeaderT>, { wayinKey }: ProvingOpts) {
    this.wayinkind = header.wayinkind
    this.header = Object.freeze(header)
    this.#wayinKey = wayinKey
    this.#wayin = stored
    this.#bankStamp = Object.freeze(bank)
    this.#gateStamp = Object.freeze(gate)
    Object.freeze(this)
  }
  // --

  // == [Methods]: judgeStrength, buildWayin, buildLease, wrapBankKey, unwrapBankKey, wayinCtx

  /** The strength checker's verdict on `passphraseClear`.
   * What the checker throws is replaced, so that no error quotes the passphrase.
   */
  static async judgeStrength(passphraseClear: string, scope: CX.BankScope, device: GX.ProvingDevice): Promise<GX.PassphraseVerdict> {
    const checked = GX.strengthArgs.parse({ passphraseClear, scope, device })
    return checked.device.strengthChecker(checked.passphraseClear, checked.scope)
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
  /** A new lease on `bank`, holding the bankKey this proving unwraps under a fresh, non-extractable leaseKey, and citing the gate revision `gate`. */
  async buildLease(bank: LeaseBank, gate: GX.CitedGate): Promise<Lease> {
    const { bank: { stamp: bankstamp }, gate: cited } = Checks.provingLeaseArgs.parse({ bank, gate })
    Validator.checkedConsistent(bankstamp, this.bankStamp, { kind: 'unexpected_error', message: Phrases.LeaseOfOtherGate })
    Validator.checkedConsistent(cited, this.gateStamp, { kind: 'unexpected_error', message: Phrases.LeaseOfOtherGate })
    const granted = {
      fmt: GX.LeaseFormat, ...bankstamp, gatelabel: cited.gatelabel, gate_tok: cited.gate_tok, gate_revision_tok: cited.revision_tok, proved_at: Clock.nowMillis(), wayinkind: this.wayinkind,
    } as const
    const bankKey = await this.#unwrapBankKey()
    const leaseKey = await Crypto.makeLeaseKey()
    const bank_key_lease_wrapped = await Crypto.wrapKeyUnder(leaseKey, bankKey, Crypto.cipherCtx([bankstamp, granted], 'bank_key_lease_wrapped'))
    return Lease.make({ ...granted, lease_key: leaseKey, bank_key_lease_wrapped }, { bank })
  }

  /** The wayin of this proving's header, holding `bankKey` wrapped under its wayinKey */
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

  /** Throw `wrongCleartext()` unless this proving's key unwraps its stored wayin.
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

  /** The proving of `parts`, under the wayinKey `opts.wayinKey`. */
  static make(parts: ProvingParts<GX.PassphraseWayinHeader>, opts: ProvingOpts): PassphraseProving { return new PassphraseProving(parts, opts) }

  /** A proving for a new passphrase wayin of gate `gate` in bank `bank`, under a fresh salt.
   * Throws `weak_passphrase` when the strength checker judges the passphrase weak.
   */
  static async buildNovel(bank: GX.BankStamp, gate: GX.GateStamp, passphraseClear: GX.PassphraseCleartext, device: GX.ProvingDevice): Promise<PassphraseProving> {
    const { bank: checkedBank, gate: checkedGate, passphraseClear: typed } = GX.passphraseNovelArgs.parse({ bank, gate, passphraseClear, device })
    const verdict = await super.judgeStrength(typed, checkedBank, device)
    if (! verdict.strong) { throw Throwers.weakPassphrase(verdict.reason) }
    const header = mintPassphraseHeader(device)
    const wayinKey = await passphraseKeyOf(device.keyDeriver, typed, Crypto.fromB64(header.salt_b64))
    return this.make({ bank: checkedBank, gate: checkedGate, header, stored: null }, { wayinKey })
  }

  /** The proving of `gate`'s passphrase wayin, made from `passphraseClear`.
   * Throws `wrong_passphrase` when the passphrase is not that wayin's.
   */
  static async buildStored(gate: GX.StampedGate, passphraseClear: GX.PassphraseCleartext, device: GX.ProvingDevice): Promise<PassphraseProving> {
    const { gate: { bankStamp, stamp, wayins }, passphraseClear: typed } = GX.passphraseStoredArgs.parse({ gate, passphraseClear, device })
    const { main } = wayins
    const { bank_key_wayin_wrapped: _wrapped, ...header } = main
    if (header.key_deriver_label !== device.keyDeriver.key_deriver_label) { throw Throwers.unknownKeyDeriver() }
    const wayinKey = await passphraseKeyOf(device.keyDeriver, typed, Crypto.fromB64(header.salt_b64))
    const proving = this.make({ bank: bankStamp, gate: stamp, header, stored: Wayin.make(main) }, { wayinKey })
    await proving.checkUnwraps(Throwers.wrongPassphrase)
    return proving
  }
  // --
}

/** A passkey's answer made into a wayinKey for one gating. */
export class PasskeyProving extends Proving<GX.PasskeyWayinHeader> {
  // == [Construction]: make, buildNovel, buildStored

  /** The proving of `parts`, under the wayinKey `opts.wayinKey`. */
  static make(parts: ProvingParts<GX.PasskeyWayinHeader>, opts: ProvingOpts): PasskeyProving { return new PasskeyProving(parts, opts) }

  /** A proving for a new passkey wayin of gate `gate` in bank `bank`. */
  static async buildNovel(bank: GX.BankStamp, gate: GX.GateStamp, passkeyClear: GX.PasskeyAnswer, device: GX.ProvingDevice): Promise<PasskeyProving> {
    const { bank: checkedBank, gate: checkedGate, passkeyClear: answer } = GX.passkeyNovelArgs.parse({ bank, gate, passkeyClear, device })
    const header = mintPasskeyHeader(device, answer)
    const wayinKey = await Crypto.deriveWrappingKey(answer.prfBytes, wayinCtxOf(checkedBank, checkedGate, header))
    return this.make({ bank: checkedBank, gate: checkedGate, header, stored: null }, { wayinKey })
  }

  /** The proving of `gate`'s passkey wayin, made from `passkeyClear`.
   * Throws `wrong_passkey` when the answer is not from that wayin's passkey.
   */
  static async buildStored(gate: GX.StampedGate, passkeyClear: GX.PasskeyAnswer): Promise<PasskeyProving> {
    const { gate: { bankStamp, stamp, wayins }, passkeyClear: { credential_id, prf_salt_b64, prfBytes } } = GX.passkeyStoredArgs.parse({ gate, passkeyClear })
    const { passkey0 } = wayins
    if (passkey0 === undefined) { throw Throwers.noPasskeyWayin() }
    const { bank_key_wayin_wrapped: _wrapped, ...header } = passkey0
    if (credential_id !== header.credential_id) { throw Throwers.otherPasskey() }
    if (prf_salt_b64 !== header.prf_salt_b64) { throw Throwers.otherPrfSalt() }
    const wayinKey = await Crypto.deriveWrappingKey(prfBytes, wayinCtxOf(bankStamp, stamp, header))
    const proving = this.make({ bank: bankStamp, gate: stamp, header, stored: Wayin.make(passkey0) }, { wayinKey })
    await proving.checkUnwraps(Throwers.wrongPasskey)
    return proving
  }
  // --
}

// == [Headers]: mintPassphraseHeader, mintPasskeyHeader

/** The header of a new passphrase wayin, with a fresh random salt */
function mintPassphraseHeader({ keyDeriver, device_tok }: GX.ProvingDevice): GX.PassphraseWayinHeader {
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
function mintPasskeyHeader({ device_tok }: GX.ProvingDevice, { credential_id, prf_salt_b64 }: GX.PasskeyAnswer): GX.PasskeyWayinHeader {
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
export type GuardedKeyDeriver = GX.ProvingDevice['keyDeriver']

// Its interface and its salt length are checked, never its other choices (#the-host-is-not-our-threat-model): what its key bytes must be is
// checked where they arrive, in passphraseKeyOf. A failed `load` keeps its throw as the cause, as it heard nothing;
// a VaultError `load` throws passes as it came.
/** Wrap `hostDeriver`, checked by its interface, so that no error it throws can quote the passphrase. */
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

// The key deriver hears the passphrase here (guarantees.md, G1 and G8): what it throws may quote it, so it is replaced, not kept as a cause.
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
