import { Checkers, consistent } from '../helpers/validator'
import { nowMillis } from '../helpers/clock'
import { PassphraseKeyBytes, type Modelkind, type PassphraseSaltBytes, brandGuarded, hasModelkind } from '../helpers/consts'
import { deriveWrappingKey, fromB64, fromB64OrNull, importWrappingKeyBytes, makeVaultKey, randomBytes, toB64, unwrapKeyUnder, wrapKeyUnder } from '../helpers/crypto'
import { VaultError, isVaultError } from '../refusals/errors'
import { adorn } from '../helpers/helpers'
import type { Wayinkind } from '../shapes/shapes-enums'
import type { KeyDeriver } from '../deriver/basederiver'
import * as CX from '../shapes/shapes-core'
import type { VaultScope } from '../shapes/shapes-core'
import * as GX from '../shapes/shapes-gateish'
import { type LeaseFriend, type Novel, type PasskeyWayinHeader, type PassphraseWayinHeader, type ProvingWorld, type StampedGate, type VaultStamp, type WayinHeader, FirstGateEpoch, passkeyNovelArgs, passkeyStoredArgs, passkeyWayinHeader, passphraseNovelArgs, passphraseStoredArgs, passphraseWayinHeader, provingLeaseArgs, strengthArgs } from '../shapes/shapes-gateish'
import { keyDeriverLoadFailed, keyDeriverThrew, leaseOfOtherVault, noPasskeyWayin, notKeyBytes, otherPasskey, otherPrfSalt, provingOfOtherVault, undecodedSalt, unknownKeyDeriver, wayinMadeAlready, wayinNotMadeYet, weakPassphrase, wrongPasskey, wrongPassphrase } from '../refusals/throwers'
import { Lease } from './lease'
import { Wayin, wayinCtxOf } from './wayin'

// == [NOVEL and the checks]: NOVEL, RewrapUsage, CheckUsage, Checks

/** Pass to {@link Proving.buildWayin} for a wayin over a vaultKey made new. */
export const NOVEL: unique symbol = Symbol.for('@safebyok/novel')

/** What the vaultKey is unwrapped as, inside a proving: extractable only so it can be wrapped again, and dropped when the method ends. */
const RewrapUsage = Object.freeze({ extractable: true, usage: ['wrapKey'] as const })

/** What the vaultKey is unwrapped as to prove a stored wayin opens: non-extractable, and dropped at once. */
const CheckUsage = Object.freeze({ extractable: false, usage: ['wrapKey'] as const })

/** Stays here: it names the class. */
const Checks = Checkers('bad_option', ({ custom }) => ({
  wayinSource: custom<Novel | Proving>((val) => val === NOVEL || hasModelkind(val, 'proving'), 'Expected NOVEL or a proving'),
}))
// --

/** The proof of a wayin: a strong key from birth, made by a subclass's static, and the one thing that can unwrap the vaultKey. Only the statics hear a clear, and they leave a passkeyClear unspent: spending it is their caller's. */
export abstract class Proving<HeaderT extends WayinHeader = WayinHeader> {
  // == [Props]: wayinkind, header, stamp, gate_epoch, #wayinKey, #wayin, toJSON

  readonly wayinkind: HeaderT['wayinkind']
  readonly header:    HeaderT
  /** The stamp of the vault this proving is of, as parsed: what every wayin ctx under it binds. */
  declare readonly stamp: VaultStamp
  /** The epoch of the gate proved, the first for a novel proving: what its lease is good for unless {@link Proving.buildLease} is told otherwise. */
  declare readonly gate_epoch: number

  readonly #wayinKey: CryptoKey
  #wayin: Wayin | null = null

  toJSON(): { wayinkind: Wayinkind } { return { wayinkind: this.wayinkind } }
  // --

  // == [Construction]: constructor

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
  // --

  // == [Methods]: checkStrength, buildWayin, buildLease, wrapVaultKey, unwrapVaultKey, wayinCtx

  /** The strengthChecker's verdict. Anything it throws is replaced, to keep the passphrase it heard out of the error. */
  static async checkStrength(passphraseClear: GX.PassphraseCleartext, scope: VaultScope, world: ProvingWorld): Promise<GX.PassphraseVerdict> {
    const checked = strengthArgs.parse({ passphraseClear, scope, world })
    return checked.world.strengthChecker(checked.passphraseClear, checked.scope)
  }

  /** The wayin this proving holds, made under a vaultKey new (`NOVEL`) or held by the `source` proving of the same vault. A proving holds one wayin. */
  async buildWayin(source: Novel | Proving): Promise<Wayin> {
    if (this.#wayin !== null) { throw wayinMadeAlready() }
    const checked = Checks.wayinSource.parse(source)
    if ((checked !== NOVEL) && ! consistent(checked.stamp, this.stamp)) { throw provingOfOtherVault() }
    const vaultKey = checked === NOVEL ? await makeVaultKey() : await checked.#unwrapVaultKey()
    return this.#wrapVaultKey(vaultKey)
  }

  /** SLOPDOC: A lease on `friend`'s vault under the vaultKey its wayin holds; held and cached only once attached. */
  async buildLease(friend: LeaseFriend, gate_epoch: number = this.gate_epoch): Promise<Lease> {
    const checked = provingLeaseArgs.parse({ friend, gate_epoch })
    if (! consistent(checked.friend, this.stamp)) { throw leaseOfOtherVault() }
    const vaultKey = await this.#unwrapVaultKey()
    return Lease.buildGranted(friend, vaultKey, { gate_epoch: checked.gate_epoch, wayinkind: this.wayinkind })
  }

  async #wrapVaultKey(vaultKey: CryptoKey): Promise<Wayin> {
    const vault_key_wayin_wrapped = await wrapKeyUnder(this.#wayinKey, vaultKey, this.#wayinCtx())
    this.#wayin = new Wayin({ ...this.header, vault_key_wayin_wrapped })
    return this.#wayin
  }

  #unwrapVaultKey(): Promise<CryptoKey> {
    return unwrapKeyUnder(this.#wayinKey, this.#demandWayin().vault_key_wayin_wrapped, this.#wayinCtx(), RewrapUsage)
  }

  #wayinCtx(): Uint8Array { return wayinCtxOf(this.stamp, this.header) }
  // --

  // == [Guards]: demandWayin

  #demandWayin(): Wayin {
    if (this.#wayin === null) { throw wayinNotMadeYet() }
    return this.#wayin
  }
  // --

  // == [Protected, for a subclass to call]: checkOpens

  /** Unwrap the stored wayin's vaultKey and drop it, to learn that the key opens the wrap (guarantees.md, G3). */
  protected async checkOpens(wrongProof: () => VaultError): Promise<void> {
    const { vault_key_wayin_wrapped } = this.#demandWayin()
    const ctx = this.#wayinCtx()
    // Only this WebCrypto call is trapped: its rejection is how a wrong proof is learned.
    try {
      await unwrapKeyUnder(this.#wayinKey, vault_key_wayin_wrapped, ctx, CheckUsage)
    } catch {
      throw wrongProof()
    }
  }
  // --

  /** Answers 'proving', which marks this model to a check: {@link Modelkind}. */
  get modelkind(): 'proving' { return 'proving' satisfies Modelkind }
}

export class PassphraseProving extends Proving<PassphraseWayinHeader> {
  // == [Construction]: buildNovel, buildStored

  /** A proving for a new wayin, of the first gate's epoch. */
  static async buildNovel(stamp: VaultStamp, passphraseClear: GX.PassphraseCleartext, world: ProvingWorld): Promise<PassphraseProving> {
    const { stamp: checked, passphraseClear: typed } = passphraseNovelArgs.parse({ stamp, passphraseClear, world })
    const verdict = await super.checkStrength(typed, checked, world)
    if (! verdict.strong) { throw weakPassphrase(verdict.reason) }
    const header = mintPassphraseHeader(world)
    const passphraseKey = await passphraseKeyOf(world.keyDeriver, typed, fromB64(header.salt_b64))
    return new PassphraseProving(checked, FirstGateEpoch, header, passphraseKey)
  }

  /** The proving of `gate`'s passphrase wayin, proved against the gate in hand. */
  static async buildStored(gate: StampedGate, passphraseClear: GX.PassphraseCleartext, world: ProvingWorld): Promise<PassphraseProving> {
    const { gate: { stamp, gate_epoch, passphrase_wayin }, passphraseClear: typed } = passphraseStoredArgs.parse({ gate, passphraseClear, world })
    const { vault_key_wayin_wrapped: _wrapped, ...header } = passphrase_wayin
    if (header.key_deriver_label !== world.keyDeriver.key_deriver_label) { throw unknownKeyDeriver() }
    const passphraseKey = await passphraseKeyOf(world.keyDeriver, typed, saltBytesOf(header.salt_b64))
    const proving = new PassphraseProving(stamp, gate_epoch, header, passphraseKey, new Wayin(passphrase_wayin))
    await proving.checkOpens(wrongPassphrase)
    return proving
  }
  // --
}

export class PasskeyProving extends Proving<PasskeyWayinHeader> {
  // == [Construction]: buildNovel, buildStored

  /** A proving for a new wayin, of the first gate's epoch. */
  static async buildNovel(stamp: VaultStamp, passkeyClear: GX.PasskeyAnswer, world: ProvingWorld): Promise<PasskeyProving> {
    const { stamp: checked, passkeyClear: answer } = passkeyNovelArgs.parse({ stamp, passkeyClear, world })
    const header = mintPasskeyHeader(world, answer)
    const passkeyKey = await deriveWrappingKey(answer.prfBytes, wayinCtxOf(checked, header))
    return new PasskeyProving(checked, FirstGateEpoch, header, passkeyKey)
  }

  /** The proving of `gate`'s passkey wayin, proved against the gate in hand. */
  static async buildStored(gate: StampedGate, passkeyClear: GX.PasskeyAnswer): Promise<PasskeyProving> {
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
  // --
}

// == [Headers]: mintPassphraseHeader, mintPasskeyHeader

const mintPassphraseHeader = ({ keyDeriver, device_id }: ProvingWorld): PassphraseWayinHeader => passphraseWayinHeader.parse({
  wayinkind:         'passphrase',
  key_deriver_label: keyDeriver.key_deriver_label,
  salt_b64:          toB64(randomBytes(keyDeriver.salt_bytes)),
  device_id,
  registered_at:     nowMillis(),
})

const mintPasskeyHeader = ({ device_id }: ProvingWorld, { credential_id, prf_salt_b64 }: GX.PasskeyAnswer): PasskeyWayinHeader => passkeyWayinHeader.parse({
  wayinkind:     'passkey',
  credential_id,
  prf_salt_b64,
  device_id,
  registered_at: nowMillis(),
})
// --

// == [The key deriver]: GuardedKeyDeriver, guardKeyDeriver, deriveKeyBytes

/** A key deriver as a bank keeps it: the host's, held to its interface by {@link guardKeyDeriver}. */
export type GuardedKeyDeriver = Readonly<{
  key_deriver_label: string
  salt_bytes:        typeof PassphraseSaltBytes
  deriveKeyBytes:    (passphrase: GX.PassphraseCleartext, saltBytes: Uint8Array) => Promise<unknown>
  load:              () => Promise<void>
}>

// Its interface and its salt length are checked, never its other choices (#the-host-is-not-our-threat-model): what its key bytes must be is
// checked where they land, in passphraseKeyOf. A failed `load` keeps its throw as the cause, as it heard nothing;
// a VaultError `load` throws passes as it came.
/** `hostDeriver` held to its interface: the one way a proving asks it for key bytes. */
export const guardKeyDeriver = (hostDeriver: KeyDeriver): GuardedKeyDeriver => {
  const { key_deriver_label, salt_bytes } = CX.keyDeriverShape.parse(hostDeriver, { where: 'keyDeriver' })
  const load = async (): Promise<void> => {
    try {
      await hostDeriver.load?.()
    } catch (err) {
      if (isVaultError(err)) { throw err }
      throw keyDeriverLoadFailed(err)
    }
  }
  return brandGuarded<GuardedKeyDeriver>({ key_deriver_label, salt_bytes, deriveKeyBytes: (passphrase, saltBytes) => deriveKeyBytes(hostDeriver, passphrase, saltBytes), load })
}

// The key deriver hears the passphrase here (guarantees.md, G1 and G8): what it throws may quote it, so it is replaced, not kept as a cause.
const deriveKeyBytes = async (hostDeriver: KeyDeriver, passphrase: GX.PassphraseCleartext, saltBytes: Uint8Array): Promise<unknown> => {
  try {
    return await hostDeriver.deriveKeyBytes(passphrase, saltBytes)
  } catch {
    throw keyDeriverThrew()
  }
}
// --

// == [Key bytes]: isSharedMemory, isSafelyAllZero, saltBytesOf, passphraseKeyOf

const isSharedMemory = (view: ArrayBufferView): boolean => Object.prototype.toString.call(view.buffer) === '[object SharedArrayBuffer]'

// Reads every byte with no early exit and no branch on a byte, as libsodium's sodium_is_zero does: `every` would exit
// early and `for of` would allocate an iterator. No JavaScript engine promises constant time; only the verdict steers what
// follows, and the refusal of an all-zero key tells that anyway.
/** True when every byte of `bytes` is zero. */
const isSafelyAllZero = (bytes: Uint8Array): boolean => {
  let   seen = 0
  const len  = bytes.length
  for (let ii = 0; ii < len; ii++) {
    // @ts-expect-error -- ii stays below len; noUncheckedIndexedAccess cannot see that, and a default would read as a branch
    seen |= bytes[ii]
  }
  return seen === 0
}

// The record's check settles the salt's characters and length, but not whether they decode: stray bits in the last character.
const saltBytesOf = (salt_b64: string): Uint8Array => {
  const saltBytes = fromB64OrNull(salt_b64)
  if (saltBytes === null) { throw undecodedSalt() }
  return saltBytes
}

const passphraseKeyOf = async (keyDeriver: GuardedKeyDeriver, passphrase: GX.PassphraseCleartext, saltBytes: Uint8Array): Promise<CryptoKey> => {
  const handed = await keyDeriver.deriveKeyBytes(passphrase, saltBytes)
  if (! ArrayBuffer.isView(handed) || isSharedMemory(handed)) { throw notKeyBytes() }
  const keyBytes = new Uint8Array(handed.buffer, handed.byteOffset, handed.byteLength)
  try {
    if (keyBytes.length !== PassphraseKeyBytes || isSafelyAllZero(keyBytes)) { throw notKeyBytes() }
    return await importWrappingKeyBytes(keyBytes)
  } finally {
    keyBytes.fill(0)
  }
}
// --
