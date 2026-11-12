import { Checkers, checkedConsistent } from '../helpers/validator'
import { nowMillis } from '../helpers/clock'
import { PassphraseKeySize, type Modelkind, type PassphraseSaltSize, brandGuarded, hasModelkind } from '../helpers/consts'
import { deriveWrappingKey, fromB64, importWrappingKeyBytes, makeBankKey, randomBytes, toB64, unwrapKeyUnder, wrapKeyUnder } from '../helpers/crypto'
import { VaultError, isVaultError } from '../refusals/errors'
import { adorn } from '../helpers/helpers'
import * as Phrases from '../helpers/phrases'
import type { Wayinkind } from '../shapes/shapes-enums'
import type { KeyDeriver } from '../deriver/basederiver'
import * as CX from '../shapes/shapes-core'
import type { BankScope } from '../shapes/shapes-core'
import * as GX from '../shapes/shapes-gateish'
import { type BankStamp, type CitedGate, type GateStamp, type LeaseFriend, type Novel, type PasskeyWayinHeader, type PassphraseWayinHeader, type ProvingWorld, type StampedGate, type WayinHeader, passkeyNovelArgs, passkeyStoredArgs, passkeyWayinHeader, passphraseNovelArgs, passphraseStoredArgs, passphraseWayinHeader, provingLeaseArgs, strengthArgs } from '../shapes/shapes-gateish'
import { keyDeriverLoadFailed, keyDeriverThrew, noPasskeyWayin, notKeyBytes, otherPasskey, otherPrfSalt, unknownKeyDeriver, wayinMadeAlready, wayinNotMadeYet, weakPassphrase, wrongPasskey, wrongPassphrase } from '../refusals/throwers'
import { Lease } from './lease'
import { Wayin, wayinCtxOf } from './wayin'

// == [NOVEL and the checks]: NOVEL, RewrapUsage, CheckUsage, Checks

/** Pass to {@link Proving.buildWayin} for a wayin over a bankKey made new. */
export const NOVEL: unique symbol = Symbol.for('@safebyok/novel')

/** What the bankKey is unwrapped as, inside a proving: extractable only so it can be wrapped again, and dropped when the method ends. */
const RewrapUsage = Object.freeze({ extractable: true, usage: ['wrapKey'] as const })

/** What the bankKey is unwrapped as to prove a stored wayin unwraps: non-extractable, and dropped at once. */
const CheckUsage = Object.freeze({ extractable: false, usage: ['wrapKey'] as const })

/** Stays here: it names the class. */
const Checks = Checkers('bad_option', ({ custom }) => ({
  wayinSource: custom<Novel | Proving>((val) => val === NOVEL || hasModelkind(val, 'proving'), 'Expected NOVEL or a proving'),
}))
// --

/** The proving of a wayin: a strong key from birth, made by a subclass's static, and the one thing that can unwrap the bankKey. Only the statics hear a clear, and they leave a passkeyClear unspent: spending it is their caller's. */
export abstract class Proving<HeaderT extends WayinHeader = WayinHeader> {
  // == [Props]: wayinkind, header, bankStamp, gateStamp, #wayinKey, #wayin, toJSON

  readonly wayinkind: HeaderT['wayinkind']
  readonly header:    HeaderT
  /** The stamp of the bank this proving is of, as parsed: what every wayin ctx under it binds first. */
  declare readonly bankStamp: BankStamp
  /** The stamp of the gate this proving is of, as parsed: what every wayin ctx under it binds second. */
  declare readonly gateStamp: GateStamp

  readonly #wayinKey: CryptoKey
  #wayin: Wayin | null = null

  /** This proving for `JSON.stringify`, showing only its wayinkind. */
  toJSON(): { wayinkind: Wayinkind } { return { wayinkind: this.wayinkind } }
  // --

  // == [Construction]: constructor

  /** A proving of a stored wayin is born with it; a proving minted for a new wayin has none until `buildWayin`. */
  protected constructor(bank: BankStamp, gate: GateStamp, header: HeaderT, wayinKey: CryptoKey, stored: Wayin | null = null) {
    this.wayinkind = header.wayinkind
    this.header = Object.freeze(header)
    this.#wayinKey = wayinKey
    this.#wayin = stored
    adorn(this, 'bankStamp', bank)
    adorn(this, 'gateStamp', gate)
    Object.freeze(this)
  }
  // --

  // == [Methods]: judgeStrength, buildWayin, buildLease, wrapBankKey, unwrapBankKey, wayinCtx

  /** The strengthChecker's verdict. Anything it throws is replaced, to keep the passphrase it heard out of the error. */
  static async judgeStrength(passphraseClear: GX.PassphraseCleartext, scope: BankScope, world: ProvingWorld): Promise<GX.PassphraseVerdict> {
    const checked = strengthArgs.parse({ passphraseClear, scope, world })
    return checked.world.strengthChecker(checked.passphraseClear, checked.scope)
  }

  /** This proving's wayin, made under a bankKey new (`NOVEL`) or the `source` proving's of the same gate. A proving has one wayin. */
  async buildWayin(source: Novel | Proving): Promise<Wayin> {
    if (this.#wayin !== null) { throw wayinMadeAlready() }
    const checked = Checks.wayinSource.parse(source)
    if (checked !== NOVEL) {
      checkedConsistent(checked.bankStamp, this.bankStamp, { kind: 'unexpected_error', message: Phrases.ProvingOfOtherGate })
      checkedConsistent(checked.gateStamp, this.gateStamp, { kind: 'unexpected_error', message: Phrases.ProvingOfOtherGate })
    }
    const bankKey = checked === NOVEL ? await makeBankKey() : await checked.#unwrapBankKey()
    return this.#wrapBankKey(bankKey)
  }

  /** A lease on `friend`'s bank under the bankKey this proving's wayin wraps, citing `gate`, a revision of the gate proved; granted, not yet cached. */
  async buildLease(friend: LeaseFriend, gate: CitedGate): Promise<Lease> {
    const checked = provingLeaseArgs.parse({ friend, gate })
    checkedConsistent(checked.friend, this.bankStamp, { kind: 'unexpected_error', message: Phrases.LeaseOfOtherGate })
    checkedConsistent(checked.gate, this.gateStamp, { kind: 'unexpected_error', message: Phrases.LeaseOfOtherGate })
    const bankKey = await this.#unwrapBankKey()
    return Lease.buildGranted(friend, bankKey, { gate: checked.gate, wayinkind: this.wayinkind })
  }

  async #wrapBankKey(bankKey: CryptoKey): Promise<Wayin> {
    const bank_key_wayin_wrapped = await wrapKeyUnder(this.#wayinKey, bankKey, this.#wayinCtx())
    this.#wayin = new Wayin({ ...this.header, bank_key_wayin_wrapped })
    return this.#wayin
  }

  #unwrapBankKey(): Promise<CryptoKey> {
    return unwrapKeyUnder(this.#wayinKey, this.#demandWayin().bank_key_wayin_wrapped, this.#wayinCtx(), RewrapUsage)
  }

  #wayinCtx(): Uint8Array { return wayinCtxOf(this.bankStamp, this.gateStamp, this.header) }
  // --

  // == [Guards]: demandWayin

  #demandWayin(): Wayin {
    if (this.#wayin === null) { throw wayinNotMadeYet() }
    return this.#wayin
  }
  // --

  // == [Protected, for a subclass to call]: checkUnwraps

  /** Unwrap the stored wayin's bankKey and drop it, to learn that the key unwraps it (guarantees.md, G3). */
  protected async checkUnwraps(wrongCleartext: () => VaultError): Promise<void> {
    const { bank_key_wayin_wrapped } = this.#demandWayin()
    const ctx = this.#wayinCtx()
    // Only this WebCrypto call is trapped: its rejection is how a wrong passphrase or passkey is learned.
    try {
      await unwrapKeyUnder(this.#wayinKey, bank_key_wayin_wrapped, ctx, CheckUsage)
    } catch {
      throw wrongCleartext()
    }
  }
  // --

  /** Answers 'proving', which marks this model to a check: {@link Modelkind}. */
  get modelkind(): 'proving' { return 'proving' satisfies Modelkind }
}

/** A passphrase made into a wayinKey for one gating. */
export class PassphraseProving extends Proving<PassphraseWayinHeader> {
  // == [Construction]: buildNovel, buildStored

  /** A proving for a new passphrase wayin in the gate `gate` stamps, of the bank `bank` stamps. */
  static async buildNovel(bank: BankStamp, gate: GateStamp, passphraseClear: GX.PassphraseCleartext, world: ProvingWorld): Promise<PassphraseProving> {
    const { bank: checkedBank, gate: checkedGate, passphraseClear: typed } = passphraseNovelArgs.parse({ bank, gate, passphraseClear, world })
    const verdict = await super.judgeStrength(typed, checkedBank, world)
    if (! verdict.strong) { throw weakPassphrase(verdict.reason) }
    const header = mintPassphraseHeader(world)
    const passphraseKey = await passphraseKeyOf(world.keyDeriver, typed, fromB64(header.salt_b64))
    return new PassphraseProving(checkedBank, checkedGate, header, passphraseKey)
  }

  /** The proving of `gate`'s passphrase wayin, proved against the gate in hand. */
  static async buildStored(gate: StampedGate, passphraseClear: GX.PassphraseCleartext, world: ProvingWorld): Promise<PassphraseProving> {
    const { gate: { bankStamp, stamp, wayins }, passphraseClear: typed } = passphraseStoredArgs.parse({ gate, passphraseClear, world })
    const { main } = wayins
    const { bank_key_wayin_wrapped: _wrapped, ...header } = main
    if (header.key_deriver_label !== world.keyDeriver.key_deriver_label) { throw unknownKeyDeriver() }
    const passphraseKey = await passphraseKeyOf(world.keyDeriver, typed, fromB64(header.salt_b64))
    const proving = new PassphraseProving(bankStamp, stamp, header, passphraseKey, new Wayin(main))
    await proving.checkUnwraps(wrongPassphrase)
    return proving
  }
  // --
}

/** A passkey's answer made into a wayinKey for one gating. */
export class PasskeyProving extends Proving<PasskeyWayinHeader> {
  // == [Construction]: buildNovel, buildStored

  /** A proving for a new passkey wayin in the gate `gate` stamps, of the bank `bank` stamps. */
  static async buildNovel(bank: BankStamp, gate: GateStamp, passkeyClear: GX.PasskeyAnswer, world: ProvingWorld): Promise<PasskeyProving> {
    const { bank: checkedBank, gate: checkedGate, passkeyClear: answer } = passkeyNovelArgs.parse({ bank, gate, passkeyClear, world })
    const header = mintPasskeyHeader(world, answer)
    const passkeyKey = await deriveWrappingKey(answer.prfBytes, wayinCtxOf(checkedBank, checkedGate, header))
    return new PasskeyProving(checkedBank, checkedGate, header, passkeyKey)
  }

  /** The proving of `gate`'s passkey wayin, proved against the gate in hand. */
  static async buildStored(gate: StampedGate, passkeyClear: GX.PasskeyAnswer): Promise<PasskeyProving> {
    const { gate: { bankStamp, stamp, wayins }, passkeyClear: { credential_id, prf_salt_b64, prfBytes } } = passkeyStoredArgs.parse({ gate, passkeyClear })
    const { passkey0 } = wayins
    if (passkey0 === undefined) { throw noPasskeyWayin() }
    const { bank_key_wayin_wrapped: _wrapped, ...header } = passkey0
    if (credential_id !== header.credential_id) { throw otherPasskey() }
    if (prf_salt_b64 !== header.prf_salt_b64) { throw otherPrfSalt() }
    const passkeyKey = await deriveWrappingKey(prfBytes, wayinCtxOf(bankStamp, stamp, header))
    const proving = new PasskeyProving(bankStamp, stamp, header, passkeyKey, new Wayin(passkey0))
    await proving.checkUnwraps(wrongPasskey)
    return proving
  }
  // --
}

// == [Headers]: mintPassphraseHeader, mintPasskeyHeader

function mintPassphraseHeader({ keyDeriver, device_tok }: ProvingWorld): PassphraseWayinHeader {
  return passphraseWayinHeader.parse({
    wayinkind:         'passphrase',
    wayinlabel:        'main',
    key_deriver_label: keyDeriver.key_deriver_label,
    salt_b64:          toB64(randomBytes(keyDeriver.salt_size)),
    device_tok,
    registered_at:     nowMillis(),
  })
}

function mintPasskeyHeader({ device_tok }: ProvingWorld, { credential_id, prf_salt_b64 }: GX.PasskeyAnswer): PasskeyWayinHeader {
  return passkeyWayinHeader.parse({
    wayinkind:     'passkey',
    wayinlabel:    'passkey0',
    credential_id,
    prf_salt_b64,
    device_tok,
    registered_at: nowMillis(),
  })
}
// --

// == [The key deriver]: GuardedKeyDeriver, guardKeyDeriver, deriveKeyBytes

/** A key deriver as a bank keeps it: the host's, made to honor its interface by {@link guardKeyDeriver}. */
export type GuardedKeyDeriver = Readonly<{
  key_deriver_label: string
  salt_size:        typeof PassphraseSaltSize
  deriveKeyBytes:    (passphrase: GX.PassphraseCleartext, saltBytes: Uint8Array) => Promise<unknown>
  load:              () => Promise<void>
}>

// Its interface and its salt length are checked, never its other choices (#the-host-is-not-our-threat-model): what its key bytes must be is
// checked where they arrive, in passphraseKeyOf. A failed `load` keeps its throw as the cause, as it heard nothing;
// a VaultError `load` throws passes as it came.
/** `hostDeriver`, made to honor its interface: the one way a proving asks it for key bytes. */
export function guardKeyDeriver(hostDeriver: KeyDeriver): GuardedKeyDeriver {
  const { key_deriver_label, salt_size } = CX.keyDeriverShape.parse(hostDeriver, { where: 'keyDeriver' })
  const load = async (): Promise<void> => {
    try {
      await hostDeriver.load?.()
    } catch (err) {
      if (isVaultError(err)) { throw err }
      throw keyDeriverLoadFailed(err)
    }
  }
  return brandGuarded<GuardedKeyDeriver>({ key_deriver_label, salt_size, deriveKeyBytes: (passphrase, saltBytes) => deriveKeyBytes(hostDeriver, passphrase, saltBytes), load })
}

// The key deriver hears the passphrase here (guarantees.md, G1 and G8): what it throws may quote it, so it is replaced, not kept as a cause.
async function deriveKeyBytes(hostDeriver: KeyDeriver, passphrase: GX.PassphraseCleartext, saltBytes: Uint8Array): Promise<unknown> {
  try {
    return await hostDeriver.deriveKeyBytes(passphrase, saltBytes)
  } catch {
    throw keyDeriverThrew()
  }
}
// --

// == [Key bytes]: isSharedMemory, isSafelyAllZero, passphraseKeyOf

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

async function passphraseKeyOf(keyDeriver: GuardedKeyDeriver, passphrase: GX.PassphraseCleartext, saltBytes: Uint8Array): Promise<CryptoKey> {
  const handed = await keyDeriver.deriveKeyBytes(passphrase, saltBytes)
  if (! ArrayBuffer.isView(handed) || isSharedMemory(handed)) { throw notKeyBytes() }
  const keyBytes = new Uint8Array(handed.buffer, handed.byteOffset, handed.byteLength)
  try {
    if (keyBytes.length !== PassphraseKeySize || isSafelyAllZero(keyBytes)) { throw notKeyBytes() }
    return await importWrappingKeyBytes(keyBytes)
  } finally {
    keyBytes.fill(0)
  }
}
// --
