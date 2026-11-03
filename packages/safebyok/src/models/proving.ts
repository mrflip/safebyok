import { Checkers, consistent } from '../checks/validator'
import { PassphraseKeyBytes } from '../consts'
import { deriveWrappingKey, fromB64, importWrappingKeyBytes, makeVaultKey, randomBytes, toB64, unwrapKeyUnder, wrapKeyUnder } from '../crypto'
import { VaultError } from '../errors'
import { adorn } from '../helpers'
import { outcomeOf, valOf } from '../outcome'
import * as Phrases from '../phrases'
import { type VaultScope, vaultScope } from '../shapes/scopes'
import * as VX from '../shapes/vault'
import { Lease } from './lease'
import { type LeaseFriend, type PasskeyWayinHeader, type PassphraseWayinHeader, type ProvingWorld, type StampedGate, type VaultStamp, type WayinHeader, type WayinKind, FirstGateEpoch, passkeyNovelArgs, passkeyStoredArgs, passkeyWayinHeader, passphraseNovelArgs, passphraseStoredArgs, passphraseWayinHeader, provingLeaseArgs, strengthArgs, vaultStamp } from './models-shapes'
import { Wayin, wayinCtxOf } from './wayin'

// == [NOVEL and the checks]: NOVEL, Novel, RewrapUsage, CheckUsage, Checks

/** Pass to {@link Proving.buildWayin} for a wayin over a vaultKey made new. */
export const NOVEL: unique symbol = Symbol('NOVEL')
export type Novel = typeof NOVEL

/** What the vaultKey is unwrapped as, inside a proving: extractable only so it can be wrapped again, and dropped when the method ends. */
const RewrapUsage = Object.freeze({ extractable: true, usage: ['wrapKey'] as const })

/** What the vaultKey is unwrapped as to prove a stored wayin opens: non-extractable, and dropped at once. */
const CheckUsage = Object.freeze({ extractable: false, usage: ['wrapKey'] as const })

/** Stays here: it names the class. */
const Checks = Checkers('bad_option', ({ custom }) => ({
  wayinSource: custom<Novel | Proving>((val) => val === NOVEL || val instanceof Proving, 'Expected NOVEL or a proving'),
}))
// --

// == [Proving]: checkStrength, buildWayin, buildLease, checkOpens, wrapVaultKey, unwrapVaultKey, toJSON

/** The proof of a wayin: a strong key from birth, made by a subclass's static, and the one thing that can unwrap the vaultKey. Only the statics hear a clear, and they leave a passkeyClear unspent: spending it is their caller's. */
export abstract class Proving<HeaderT extends WayinHeader = WayinHeader> {
  readonly wayinkind: HeaderT['wayinkind']
  readonly header:    HeaderT
  /** The stamp of the vault this proving is of, as parsed: what every wayin ctx under it binds. */
  declare readonly stamp: VaultStamp
  /** The epoch of the gate proved, the first for a novel proving: what its lease is good for unless {@link Proving.buildLease} is told otherwise. */
  declare readonly gate_epoch: number

  readonly #wayinKey: CryptoKey
  #wayin: Wayin | null = null

  /** A proving of a stored wayin is born holding it; a proving minted for a new wayin holds none until `buildWayin`. */
  protected constructor(stamp: VaultStamp, gate_epoch: number, header: HeaderT, wayinKey: CryptoKey, stored: Wayin | null = null) {
    this.wayinkind = header.wayinkind
    this.header = Object.freeze(header)
    this.#wayinKey = wayinKey
    this.#wayin = stored
    adorn(this, 'stamp', stamp)
    adorn(this, 'gate_epoch', gate_epoch)
    Object.freeze(this)
  }

  /** The strengthChecker's verdict. What it throws is replaced, as it heard the passphrase ('unexpected_error'); an answer that is no verdict refuses 'bad_option'. */
  static async checkStrength(passphraseClear: VX.PassphraseCleartext, scope: VaultScope, world: ProvingWorld): Promise<VX.PassphraseVerdict> {
    strengthArgs.parse({ passphraseClear, scope, world })
    const verdict = VX.passphraseVerdict.safeParse(await invokeStrengthChecker(world.strengthChecker, passphraseClear, scope))
    if (! verdict.success) { throw notAVerdict() }
    return verdict.data
  }

  /** The wayin this proving holds, made under a vaultKey new (`NOVEL`) or held by the `source` proving of the same vault. A proving holds one wayin: one that holds one already refuses. */
  async buildWayin(source: Novel | Proving): Promise<Wayin> {
    if (this.#wayin !== null) { throw wayinMadeAlready() }
    const checked = Checks.wayinSource.parse(source)
    if (checked !== NOVEL && ! consistent(checked.stamp, this.stamp)) { throw provingOfOtherVault() }
    const vaultKey = checked === NOVEL ? await makeVaultKey() : await checked.#unwrapVaultKey()
    return this.#wrapVaultKey(vaultKey)
  }

  /** A lease on `friend`'s vault under the vaultKey this proving's wayin holds, good for the epoch proved or the one passed, recording when and how it was proved. A friend whose stamp is not this proving's refuses 'bad_option', before any key is touched. It is neither held nor cached until {@link Lease.attach}. */
  async buildLease(friend: LeaseFriend, gate_epoch: number = this.gate_epoch): Promise<Lease> {
    provingLeaseArgs.parse({ friend, gate_epoch })
    if (! consistent(vaultStamp.parse(friend), this.stamp)) { throw leaseOfOtherVault() }
    const vaultKey = await this.#unwrapVaultKey()
    return Lease.grant(friend, vaultKey, { gate_epoch, wayinkind: this.wayinkind })
  }

  /** Unwrap the stored wayin's vaultKey and drop it, or refuse as `wrongProof`: the ctx is built before the catch, so a refusal means only that the key did not open the wrap (guarantees.md, G3). */
  protected async checkOpens(wrongProof: () => VaultError): Promise<void> {
    const { vault_key_wayin_wrapped } = this.#demandWayin()
    const ctx = this.#wayinCtx()
    valOf(await outcomeOf(() => unwrapKeyUnder(this.#wayinKey, vault_key_wayin_wrapped, ctx, CheckUsage), wrongProof))
  }

  async #wrapVaultKey(vaultKey: CryptoKey): Promise<Wayin> {
    const vault_key_wayin_wrapped = await wrapKeyUnder(this.#wayinKey, vaultKey, this.#wayinCtx())
    this.#wayin = new Wayin({ ...this.header, vault_key_wayin_wrapped })
    return this.#wayin
  }

  #unwrapVaultKey(): Promise<CryptoKey> {
    return unwrapKeyUnder(this.#wayinKey, this.#demandWayin().vault_key_wayin_wrapped, this.#wayinCtx(), RewrapUsage)
  }

  #demandWayin(): Wayin {
    if (this.#wayin === null) { throw wayinNotMadeYet() }
    return this.#wayin
  }

  #wayinCtx(): Uint8Array { return wayinCtxOf(this.stamp, this.header) }

  toJSON(): { wayinkind: WayinKind } { return { wayinkind: this.wayinkind } }
}
// --

// == [PassphraseProving]: buildNovel, buildStored

export class PassphraseProving extends Proving<PassphraseWayinHeader> {
  /** A proving for a new wayin, of the first gate's epoch. A passphrase the world's strengthChecker finds weak refuses 'weak_passphrase', with its reason. */
  static async buildNovel(stamp: VaultStamp, passphraseClear: VX.PassphraseCleartext, world: ProvingWorld): Promise<PassphraseProving> {
    const { stamp: checked, passphraseClear: typed } = passphraseNovelArgs.parse({ stamp, passphraseClear, world })
    const verdict = await super.checkStrength(typed, vaultScope.parse(checked), world)
    if (! verdict.strong) { throw weakPassphrase(verdict.reason) }
    const header = mintPassphraseHeader(world)
    const passphraseKey = await passphraseKeyOf(world.keyDeriver, typed, fromB64(header.salt_b64))
    return new PassphraseProving(checked, FirstGateEpoch, header, passphraseKey)
  }

  /** The proving of `gate`'s passphrase wayin, proved against the gate in hand: one made under another key deriver refuses 'unknown_key_deriver', and a passphrase that does not open it 'wrong_passphrase'. */
  static async buildStored(gate: StampedGate, passphraseClear: VX.PassphraseCleartext, world: ProvingWorld): Promise<PassphraseProving> {
    const { gate: { stamp, gate_epoch, passphrase_wayin }, passphraseClear: typed } = passphraseStoredArgs.parse({ gate, passphraseClear, world })
    const { vault_key_wayin_wrapped: _wrapped, ...header } = passphrase_wayin
    if (header.key_deriver_label !== world.keyDeriver.key_deriver_label) { throw unknownKeyDeriver() }
    const passphraseKey = await passphraseKeyOf(world.keyDeriver, typed, fromB64(header.salt_b64))
    const proving = new PassphraseProving(stamp, gate_epoch, header, passphraseKey, new Wayin(passphrase_wayin))
    await proving.checkOpens(wrongPassphrase)
    return proving
  }
}
// --

// == [PasskeyProving]: buildNovel, buildStored

export class PasskeyProving extends Proving<PasskeyWayinHeader> {
  /** A proving for a new wayin, of the first gate's epoch. */
  static async buildNovel(stamp: VaultStamp, passkeyClear: VX.PasskeyAnswer, world: ProvingWorld): Promise<PasskeyProving> {
    const { stamp: checked, passkeyClear: answer } = passkeyNovelArgs.parse({ stamp, passkeyClear, world })
    const header = mintPasskeyHeader(world, answer)
    const passkeyKey = await deriveWrappingKey(answer.prfBytes, wayinCtxOf(checked, header))
    return new PasskeyProving(checked, FirstGateEpoch, header, passkeyKey)
  }

  /** The proving of `gate`'s passkey wayin, proved against the gate in hand: a gate with none refuses 'absent_wayin', and an answer of another credential or salt, or one that does not open it, 'wrong_passkey'. */
  static async buildStored(gate: StampedGate, passkeyClear: VX.PasskeyAnswer): Promise<PasskeyProving> {
    const { gate: { stamp, gate_epoch, passkey_wayin }, passkeyClear: { credential_id, prf_salt_b64, prfBytes } } = passkeyStoredArgs.parse({ gate, passkeyClear })
    if (passkey_wayin === null) { throw noPasskeyWayin() }
    const { vault_key_wayin_wrapped: _wrapped, ...header } = passkey_wayin
    if (credential_id !== header.credential_id) { throw otherPasskey() }
    if (prf_salt_b64 !== header.prf_salt_b64) { throw otherPrfSalt() }
    const passkeyKey = await deriveWrappingKey(prfBytes, wayinCtxOf(stamp, header))
    const proving = new PasskeyProving(stamp, gate_epoch, header, passkeyKey, new Wayin(passkey_wayin))
    await proving.checkOpens(wrongPasskey)
    return proving
  }
}
// --

// == [Headers]: mintPassphraseHeader, mintPasskeyHeader

const mintPassphraseHeader = ({ clock, keyDeriver, device_id }: ProvingWorld): PassphraseWayinHeader => passphraseWayinHeader.parse({
  wayinkind:         'passphrase',
  key_deriver_label: keyDeriver.key_deriver_label,
  salt_b64:          toB64(randomBytes(keyDeriver.salt_bytes)),
  device_id,
  registered_at:     clock.now(),
})

const mintPasskeyHeader = ({ clock, device_id }: ProvingWorld, { credential_id, prf_salt_b64 }: VX.PasskeyAnswer): PasskeyWayinHeader => passkeyWayinHeader.parse({
  wayinkind:     'passkey',
  credential_id,
  prf_salt_b64,
  device_id,
  registered_at: clock.now(),
})
// --

// == [Host calls]: invokeStrengthChecker, deriveKeyBytes

// The two host functions that hear the passphrase here (guarantees.md, G1 and G8): what they throw may quote it, so it is replaced, not kept as a cause.
const invokeStrengthChecker = async (strengthChecker: ProvingWorld['strengthChecker'], passphraseClear: VX.PassphraseCleartext, scope: VaultScope): Promise<unknown> => {
  try {
    return await strengthChecker(passphraseClear, scope)
  } catch {
    throw strengthCheckerThrew()
  }
}

const deriveKeyBytes = async (keyDeriver: ProvingWorld['keyDeriver'], passphrase: VX.PassphraseCleartext, saltBytes: Uint8Array): Promise<unknown> => {
  try {
    return await keyDeriver.deriveKeyBytes(passphrase, saltBytes)
  } catch {
    throw keyDeriverThrew()
  }
}
// --

// == [Key bytes]: isSharedMemory, isAllZero, passphraseKeyOf

const isSharedMemory = (view: ArrayBufferView): boolean => Object.prototype.toString.call(view.buffer) === '[object SharedArrayBuffer]'

const isAllZero = (bytes: Uint8Array): boolean => bytes.reduce((seen, byte) => seen | byte, 0) === 0

const passphraseKeyOf = async (keyDeriver: ProvingWorld['keyDeriver'], passphrase: VX.PassphraseCleartext, saltBytes: Uint8Array): Promise<CryptoKey> => {
  const handed = await deriveKeyBytes(keyDeriver, passphrase, saltBytes)
  if (! ArrayBuffer.isView(handed) || isSharedMemory(handed)) { throw notKeyBytes() }
  const keyBytes = new Uint8Array(handed.buffer, handed.byteOffset, handed.byteLength)
  try {
    if (keyBytes.length !== PassphraseKeyBytes || isAllZero(keyBytes)) { throw notKeyBytes() }
    return await importWrappingKeyBytes(keyBytes)
  } finally {
    keyBytes.fill(0)
  }
}
// --

// == [Refusals]: notKeyBytes, wayinNotMadeYet, wayinMadeAlready, provingOfOtherVault, leaseOfOtherVault, keyDeriverThrew, strengthCheckerThrew, notAVerdict, weakPassphrase, wrongPassphrase, wrongPasskey, noPasskeyWayin, otherPasskey, otherPrfSalt, unknownKeyDeriver

const notKeyBytes = (): VaultError => new VaultError('bad_option', Phrases.notKeyBytes(PassphraseKeyBytes))

const wayinNotMadeYet = (): VaultError => new VaultError('unexpected_error', Phrases.WayinNotMadeYet)

const wayinMadeAlready = (): VaultError => new VaultError('unexpected_error', Phrases.WayinMadeAlready)

const provingOfOtherVault = (): VaultError => new VaultError('bad_option', Phrases.ProvingOfOtherVault)

const leaseOfOtherVault = (): VaultError => new VaultError('bad_option', Phrases.LeaseOfOtherVault)

const keyDeriverThrew = (): VaultError => new VaultError('unexpected_error', Phrases.KeyDeriverThrew)

const strengthCheckerThrew = (): VaultError => new VaultError('unexpected_error', Phrases.StrengthCheckerThrew)

const notAVerdict = (): VaultError => new VaultError('bad_option', Phrases.NotAVerdict)

const weakPassphrase = (reason: string): VaultError => new VaultError('weak_passphrase', reason)

const wrongPassphrase = (): VaultError => new VaultError('wrong_passphrase', Phrases.WrongPassphrase)

const wrongPasskey = (): VaultError => new VaultError('wrong_passkey', Phrases.WrongPasskey)

const noPasskeyWayin = (): VaultError => new VaultError('absent_wayin', Phrases.NoPasskeyWayin)

const otherPasskey = (): VaultError => new VaultError('wrong_passkey', Phrases.OtherPasskey)

const otherPrfSalt = (): VaultError => new VaultError('wrong_passkey', Phrases.OtherPrfSalt)

const unknownKeyDeriver = (): VaultError => new VaultError('unknown_key_deriver', Phrases.UnknownKeyDeriver)
// --
