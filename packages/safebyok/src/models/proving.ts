import { Checkers, consistent } from '../checks/validator'
import { PassphraseKeyBytes } from '../consts'
import { deriveWrappingKey, fromB64, importWrappingKeyBytes, makeVaultKey, randomBytes, toB64, unwrapKeyUnder, wrapKeyUnder } from '../crypto'
import { VaultError } from '../errors'
import { adorn } from '../helpers'
import { outcomeOf, valOf } from '../outcome'
import * as Phrases from '../phrases'
import * as VX from '../shapes/vault'
import { Lease } from './lease'
import { type AttemptClosure, type GateProps, type LeaseDBFriend, type LeaseGrantOpts, type LeaseVault, type PasskeyWayinHeader, type PasskeyWayinRecord, type PassphraseWayinHeader, type PassphraseWayinRecord, type ProofClosure, type ProvingWorld, type VaultStamp, type WayinHeader, type WayinKind, attemptCleartexts, cleartexts, passkeyWayinHeader, passkeyWayinRecord, passphraseMakeArgs, passphraseWayinHeader, passphraseWayinRecord, provingAttemptArgs, provingMakeArgs, provingPairArgs, vaultStamp } from './models-shapes'
import { Wayin, wayinCtxOf } from './wayin'

// == [NOVEL and the checks]: NOVEL, Novel, ProvingPair, RewrapUsage, Checks

export const NOVEL: unique symbol = Symbol('NOVEL')
export type Novel = typeof NOVEL

export type ProvingPair = { passphraseProving: PassphraseProving, passkeyProving: PasskeyProving | null }

/** What the vaultKey is unwrapped as, inside a proving: extractable only so it can be wrapped again, and dropped when the method ends. */
const RewrapUsage = Object.freeze({ extractable: true, usage: ['wrapKey'] as const })

/** What the vaultKey is unwrapped as to prove a stored wayin opens: non-extractable, and dropped at once. */
const CheckUsage = Object.freeze({ extractable: false, usage: ['wrapKey'] as const })

/** Stays here: it names the class. */
const Checks = Checkers('bad_option', ({ custom }) => ({
  wayinSource: custom<Novel | Proving>((val) => val === NOVEL || val instanceof Proving, 'Expected NOVEL or a proving'),
}))
// --

// == [Proving]: makeProvingPair, attempt, makeWayin, makeLease, demandOpens, wrapVaultKey, unwrapVaultKey, toJSON

export abstract class Proving<HeaderT extends WayinHeader = WayinHeader> {
  readonly wayinkind: HeaderT['wayinkind']
  readonly header:    HeaderT
  /** The stamp of the vault this proving is of, as parsed: what every wayin ctx under it binds. */
  declare readonly stamp: VaultStamp

  readonly #wayinKey: CryptoKey
  #wayin: Wayin | null = null

  /** A proving of a stored wayin is born holding it; a proving minted for a new wayin holds none until `makeWayin`. */
  protected constructor(stamp: VaultStamp, header: HeaderT, wayinKey: CryptoKey, stored: Wayin | null = null) {
    this.wayinkind = header.wayinkind
    this.header = Object.freeze(header)
    this.#wayinKey = wayinKey
    this.#wayin = stored
    adorn(this, 'stamp', stamp)
    Object.freeze(this)
  }

  /** The provings of the vault `stamp` names, from what `proofClosure` answers: a passphrase proving, and a passkey proving where it answers a passkey too. */
  static async makeProvingPair(stamp: VaultStamp, proofClosure: ProofClosure, world: ProvingWorld): Promise<ProvingPair> {
    const { stamp: checked } = provingPairArgs.parse({ stamp, proofClosure, world })
    const handed = await invokeProofClosure(proofClosure)
    try {
      const { passphrase, passkeyAnswer } = cleartexts.parse(handed)
      const passphraseProving = await PassphraseProving.make(checked, world, passphrase)
      const passkeyProving = passkeyAnswer ? await PasskeyProving.make(checked, world, passkeyAnswer) : null
      return { passphraseProving, passkeyProving }
    } finally {
      spendAnswer(handed)
    }
  }

  /** The proving of the stored wayin of `gate` that what `proofClosure` answers opens: the passphrase's where it hands one, else the passkey's. A wayin that will not open refuses 'wrong_passphrase' or 'wrong_passkey'. */
  static async attempt(stamp: VaultStamp, gate: GateProps, proofClosure: AttemptClosure, world: ProvingWorld): Promise<Proving> {
    const { stamp: checked, gate: wayins } = provingAttemptArgs.parse({ stamp, gate, proofClosure, world })
    const handed = await invokeProofClosure(proofClosure)
    try {
      const { passphrase, passkeyAnswer } = attemptCleartexts.parse(handed)
      const proving: Proving = passphrase === undefined
        ? await PasskeyProving.ofWayin(checked, wayins.passkey_wayin, passkeyAnswer)
        : await PassphraseProving.ofWayin(checked, world, wayins.passphrase_wayin, passphrase)
      await proving.#demandOpens()
      return proving
    } finally {
      spendAnswer(handed)
    }
  }

  /** The wayin this proving holds, made under a vaultKey new (`NOVEL`) or held by the `source` proving of the same vault. A proving holds one wayin: one that holds one already refuses. */
  async makeWayin(source: Novel | Proving): Promise<Wayin> {
    if (this.#wayin !== null) { throw wayinMadeAlready() }
    const checked = Checks.wayinSource.parse(source)
    if (checked !== NOVEL && ! consistent(checked.stamp, this.stamp)) { throw provingOfOtherVault() }
    const vaultKey = checked === NOVEL ? await makeVaultKey() : await checked.#unwrapVaultKey()
    return this.#wrapVaultKey(vaultKey)
  }

  /** Grant `vault` a lease under the vaultKey this proving's wayin holds; refuses 'bad_option' a vault whose stamp is not the one this proving is of, before any key is touched. */
  async makeLease(vault: LeaseVault, dbfriend: LeaseDBFriend, opts: LeaseGrantOpts): Promise<Lease> {
    if (! consistent(vaultStamp.parse(vault), this.stamp)) { throw leaseOfOtherVault() }
    const vaultKey = await this.#unwrapVaultKey()
    return Lease.grant(vault, dbfriend, vaultKey, opts)
  }

  /** Unwrap the stored wayin's vaultKey and drop it: the ctx is built before the catch, so a refusal means only that the key did not open the wrap (guarantees.md, G3). */
  async #demandOpens(): Promise<void> {
    const wrongProof = this.wayinkind === 'passphrase' ? wrongPassphrase : wrongPasskey
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

// == [PassphraseProving]: make, ofWayin

export class PassphraseProving extends Proving<PassphraseWayinHeader> {
  static async make(stamp: VaultStamp, world: ProvingWorld, passphrase: VX.PassphraseCleartext): Promise<PassphraseProving> {
    const { stamp: checked, passphrase: typed } = passphraseMakeArgs.parse({ stamp, world, passphrase })
    const header = mintPassphraseHeader(world)
    const passphraseKey = await passphraseKeyOf(world.keyDeriver, typed, fromB64(header.salt_b64))
    return new PassphraseProving(checked, header, passphraseKey)
  }

  /** The proving of the stored passphrase wayin, its key derived over the wayin's own salt; one made under another key deriver refuses 'unknown_key_deriver'. Opening it is the caller's. */
  static async ofWayin(stamp: VaultStamp, world: ProvingWorld, stored: PassphraseWayinRecord, passphrase: VX.PassphraseCleartext): Promise<PassphraseProving> {
    const wayin = new Wayin(stored)
    const { vault_key_wayin_wrapped: _wrapped, ...header } = passphraseWayinRecordOf(wayin)
    if (header.key_deriver_label !== world.keyDeriver.key_deriver_label) { throw unknownKeyDeriver() }
    const passphraseKey = await passphraseKeyOf(world.keyDeriver, passphrase, fromB64(header.salt_b64))
    return new PassphraseProving(stamp, header, passphraseKey, wayin)
  }
}
// --

// == [PasskeyProving]: make, ofWayin

export class PasskeyProving extends Proving<PasskeyWayinHeader> {
  /** The answer is checked inside the try, so its bytes are zeroed whether it passes or not (G2). */
  static async make(stamp: VaultStamp, world: ProvingWorld, passkeyAnswer: unknown): Promise<PasskeyProving> {
    try {
      const { stamp: checked } = provingMakeArgs.parse({ stamp, world })
      const answer = VX.freshPasskeyAnswer.parse(passkeyAnswer)
      const header = mintPasskeyHeader(world, answer)
      const passkeyKey = await deriveWrappingKey(answer.prfBytes, wayinCtxOf(checked, header))
      return new PasskeyProving(checked, header, passkeyKey)
    } finally {
      spendPrfBytes(passkeyAnswer)
    }
  }

  /** The proving of the stored passkey wayin; an answer for another credential or salt, or a vault with no passkey wayin, refuses 'wrong_passkey'. Opening it is the caller's. */
  static async ofWayin(stamp: VaultStamp, stored: PasskeyWayinRecord | null, passkeyAnswer: unknown): Promise<PasskeyProving> {
    try {
      if (stored === null) { throw noPasskeyWayin() }
      const answer = VX.passkeyAnswer.parse(passkeyAnswer)
      const wayin = new Wayin(stored)
      const { vault_key_wayin_wrapped: _wrapped, ...header } = passkeyWayinRecordOf(wayin)
      if (answer.credential_id !== header.credential_id) { throw otherPasskey() }
      if (answer.prf_salt_b64 !== header.prf_salt_b64) { throw otherPrfSalt() }
      const passkeyKey = await deriveWrappingKey(answer.prfBytes, wayinCtxOf(stamp, header))
      return new PasskeyProving(stamp, header, passkeyKey, wayin)
    } finally {
      spendPrfBytes(passkeyAnswer)
    }
  }
}
// --

// == [Headers]: mintPassphraseHeader, mintPasskeyHeader, passphraseWayinRecordOf, passkeyWayinRecordOf

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

const passphraseWayinRecordOf = (wayin: Wayin): PassphraseWayinRecord => passphraseWayinRecord.parse(wayin.pickle())

const passkeyWayinRecordOf = (wayin: Wayin): PasskeyWayinRecord => passkeyWayinRecord.parse(wayin.pickle())
// --

// == [Host calls]: invokeProofClosure, deriveKeyBytes, spendAnswer, spendPrfBytes

// The two host functions that hear the passphrase (guarantees.md, G1 and G8): what they throw may quote it, so it is replaced, not kept as a cause.
const invokeProofClosure = async (proofClosure: ProofClosure | AttemptClosure): Promise<unknown> => {
  try {
    return await proofClosure()
  } catch {
    throw proofClosureThrew()
  }
}

const deriveKeyBytes = async (keyDeriver: ProvingWorld['keyDeriver'], passphrase: VX.PassphraseCleartext, saltBytes: Uint8Array): Promise<unknown> => {
  try {
    return await keyDeriver.deriveKeyBytes(passphrase, saltBytes)
  } catch {
    throw keyDeriverThrew()
  }
}

/** Zero a passkey answer's PRF bytes wherever the closure's answer carries them, checked or not: an answer is single-use (G2). */
const spendAnswer = (handed: unknown): void => {
  // The reach-in may meet a getter or a proxy of the host's, which may throw: spending is best effort, and never replaces the refusal or the proving it follows.
  try {
    spendPrfBytes((handed as { passkeyAnswer?: unknown } | null)?.passkeyAnswer)
  } catch { /* nothing left to spend */ }
}

/** Zero a passkey answer's PRF bytes, checked or not. */
const spendPrfBytes = (answer: unknown): void => {
  // As in spendAnswer: the host's object may throw as it is reached into.
  try {
    const prfBytes: unknown = (answer as { prfBytes?: unknown } | null)?.prfBytes
    if (prfBytes instanceof Uint8Array) { prfBytes.fill(0) }
  } catch { /* nothing left to spend */ }
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

// == [Refusals]: notKeyBytes, wayinNotMadeYet, wayinMadeAlready, provingOfOtherVault, leaseOfOtherVault, proofClosureThrew, keyDeriverThrew, wrongPassphrase, wrongPasskey, noPasskeyWayin, otherPasskey, otherPrfSalt, unknownKeyDeriver

const notKeyBytes = (): VaultError => new VaultError('bad_option', Phrases.notKeyBytes(PassphraseKeyBytes))

const wayinNotMadeYet = (): VaultError => new VaultError('unexpected_error', Phrases.WayinNotMadeYet)

const wayinMadeAlready = (): VaultError => new VaultError('unexpected_error', Phrases.WayinMadeAlready)

const provingOfOtherVault = (): VaultError => new VaultError('bad_option', Phrases.ProvingOfOtherVault)

const leaseOfOtherVault = (): VaultError => new VaultError('bad_option', Phrases.LeaseOfOtherVault)

const proofClosureThrew = (): VaultError => new VaultError('unexpected_error', Phrases.ProofClosureThrew)

const keyDeriverThrew = (): VaultError => new VaultError('unexpected_error', Phrases.KeyDeriverThrew)

const wrongPassphrase = (): VaultError => new VaultError('wrong_passphrase', Phrases.WrongPassphrase)

const wrongPasskey = (): VaultError => new VaultError('wrong_passkey', Phrases.WrongPasskey)

const noPasskeyWayin = (): VaultError => new VaultError('wrong_passkey', Phrases.NoPasskeyWayin)

const otherPasskey = (): VaultError => new VaultError('wrong_passkey', Phrases.OtherPasskey)

const otherPrfSalt = (): VaultError => new VaultError('wrong_passkey', Phrases.OtherPrfSalt)

const unknownKeyDeriver = (): VaultError => new VaultError('unknown_key_deriver', Phrases.UnknownKeyDeriver)
// --
