import { Checkers, consistent, isBytes } from '../checks/validator'
import { PassphraseKeyBytes } from '../consts'
import { deriveWrappingKey, fromB64, importWrappingKeyBytes, makeVaultKey, randomBytes, toB64, unwrapKeyUnder, wrapKeyUnder } from '../crypto'
import * as RefusalFuncs from '../helpers/refusal-funcs'
import { adorn } from '../helpers'
import { outcomeOf, valOf } from '../outcome'
import * as VX from '../shapes/vault'
import { Lease } from './lease'
import { type AttemptCleartexts, type Cleartexts, type GateProps, type LeaseDBFriend, type LeaseGrantOpts, type LeaseVault, type PasskeyWayinHeader, type PasskeyWayinRecord, type PassphraseWayinHeader, type PassphraseWayinRecord, type ProvingWorld, type StrengthChecker, type VaultStamp, type WayinHeader, type WayinKind, isCorrectable, passkeyWayinHeader, passkeyWayinRecord, passphraseMakeArgs, passphraseWayinHeader, passphraseWayinRecord, provingAttemptArgs, provingMakeArgs, provingPairArgs, vaultStamp } from './models-shapes'
import type { VaultScope } from '../shapes/scopes'
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

// == [Proving]: makeProvingPair, attempt, makeWayin, makeLease, checkOpens, wrapVaultKey, unwrapVaultKey, toJSON

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

  /** The provings of the vault `stamp` names, from `cleartexts`: a passphrase proving, and a passkey proving where they carry a passkey's answer too, which is spent (G2). */
  static makeProvingPair(stamp: VaultStamp, cleartexts: Cleartexts, world: ProvingWorld): Promise<ProvingPair> {
    return spendAnswerAfter(cleartexts, async () => {
      const { stamp: checked, cleartexts: { passphrase, passkeyAnswer } } = provingPairArgs.parse({ stamp, cleartexts, world })
      const passphraseProving = await PassphraseProving.make(checked, world, passphrase)
      const passkeyProving = passkeyAnswer ? await PasskeyProving.make(checked, world, passkeyAnswer) : null
      return { passphraseProving, passkeyProving }
    })
  }

  /** The proving of the stored wayin of `gate` that `cleartexts` open: the passphrase's where they carry one, else the passkey's, whose answer is spent unless refused as correctable (G2). A wayin that will not open refuses 'wrong_passphrase' or 'wrong_passkey'. */
  static attempt(stamp: VaultStamp, gate: GateProps, cleartexts: AttemptCleartexts, world: ProvingWorld): Promise<Proving> {
    return spendAnswerAfter(cleartexts, async () => {
      const { stamp: checked, gate: wayins, cleartexts: { passphrase, passkeyAnswer } } = provingAttemptArgs.parse({ stamp, gate, cleartexts, world })
      const proving: Proving = passphrase === undefined
        ? await PasskeyProving.ofWayin(checked, wayins.passkey_wayin, passkeyAnswer)
        : await PassphraseProving.ofWayin(checked, world, wayins.passphrase_wayin, passphrase)
      await proving.#checkOpens()
      return proving
    })
  }

  /** The wayin this proving holds, made under a vaultKey new (`NOVEL`) or held by the `source` proving of the same vault. A proving holds one wayin: one that holds one already refuses. */
  async makeWayin(source: Novel | Proving): Promise<Wayin> {
    if (this.#wayin !== null) { throw RefusalFuncs.wayinMadeAlready() }
    const checked = Checks.wayinSource.parse(source)
    if (checked !== NOVEL && ! consistent(checked.stamp, this.stamp)) { throw RefusalFuncs.provingOfOtherVault() }
    const vaultKey = checked === NOVEL ? await makeVaultKey() : await checked.#unwrapVaultKey()
    return this.#wrapVaultKey(vaultKey)
  }

  /** Grant `vault` a lease under the vaultKey this proving's wayin holds; refuses 'bad_option' a vault whose stamp is not the one this proving is of, before any key is touched. */
  async makeLease(vault: LeaseVault, dbfriend: LeaseDBFriend, opts: LeaseGrantOpts): Promise<Lease> {
    if (! consistent(vaultStamp.parse(vault), this.stamp)) { throw RefusalFuncs.leaseOfOtherVault() }
    const vaultKey = await this.#unwrapVaultKey()
    return Lease.grant(vault, dbfriend, vaultKey, opts)
  }

  /** Unwrap the stored wayin's vaultKey and drop it: the ctx is built before the catch, so a refusal means only that the key did not open the wrap (guarantees.md, G3). */
  async #checkOpens(): Promise<void> {
    const wrongProof = this.wayinkind === 'passphrase' ? RefusalFuncs.wrongPassphrase : RefusalFuncs.wrongPasskey
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
    if (this.#wayin === null) { throw RefusalFuncs.wayinNotMadeYet() }
    return this.#wayin
  }

  #wayinCtx(): Uint8Array { return wayinCtxOf(this.stamp, this.header) }

  toJSON(): { wayinkind: WayinKind } { return { wayinkind: this.wayinkind } }
}
// --

// == [PassphraseProving]: make, ofWayin

export class PassphraseProving extends Proving<PassphraseWayinHeader> {
  /** A new passphrase proving of the vault `stamp` names, for `passphrase`. */
  static async make(stamp: VaultStamp, world: ProvingWorld, passphrase: VX.PassphraseCleartext): Promise<PassphraseProving> {
    const { stamp: checked, passphrase: typed } = passphraseMakeArgs.parse({ stamp, world, passphrase })
    const header = mintPassphraseHeader(world)
    const passphraseKey = await passphraseKeyOf(world.keyDeriver, typed, fromB64(header.salt_b64))
    return new PassphraseProving(checked, header, passphraseKey)
  }

  /** The proving of the stored passphrase wayin, its key derived over the wayin's own salt; one made under another key deriver refuses 'unknown_key_deriver'. Opening it is the caller's. */
  static async ofWayin(stamp: VaultStamp, world: ProvingWorld, stored: PassphraseWayinRecord, passphrase: VX.PassphraseCleartext): Promise<PassphraseProving> {
    const { stamp: checked, passphrase: typed } = passphraseMakeArgs.parse({ stamp, world, passphrase })
    const wayin = new Wayin(stored)
    const { vault_key_wayin_wrapped: _wrapped, ...header } = passphraseWayinRecordOf(wayin)
    if (header.key_deriver_label !== world.keyDeriver.key_deriver_label) { throw RefusalFuncs.unknownKeyDeriver() }
    const passphraseKey = await passphraseKeyOf(world.keyDeriver, typed, fromB64(header.salt_b64))
    return new PassphraseProving(checked, header, passphraseKey, wayin)
  }
}
// --

// == [PasskeyProving]: make, ofWayin

export class PasskeyProving extends Proving<PasskeyWayinHeader> {
  /** A new passkey proving of the vault `stamp` names, for the passkey whose answer is handed in; the answer is spent, made or refused (G2). */
  static make(stamp: VaultStamp, world: ProvingWorld, passkeyAnswer: unknown): Promise<PasskeyProving> {
    return spendAnswerAfter({ passkeyAnswer }, async () => {
      const { stamp: checked } = provingMakeArgs.parse({ stamp, world })
      const answer = VX.freshPasskeyAnswer.parse(passkeyAnswer)
      const header = mintPasskeyHeader(world, answer)
      const passkeyKey = await deriveWrappingKey(answer.prfBytes, wayinCtxOf(checked, header))
      return new PasskeyProving(checked, header, passkeyKey)
    })
  }

  /** The proving of the stored passkey wayin; an answer for another credential or salt, or a vault with no passkey wayin, refuses 'wrong_passkey', leaving the answer unspent (G2). Opening it is the caller's. */
  static ofWayin(stamp: VaultStamp, stored: PasskeyWayinRecord | null, passkeyAnswer: unknown): Promise<PasskeyProving> {
    return spendAnswerAfter({ passkeyAnswer }, async () => {
      if (stored === null) { throw RefusalFuncs.noPasskeyWayin() }
      const checked = vaultStamp.parse(stamp)
      const answer = VX.passkeyAnswer.parse(passkeyAnswer)
      const wayin = new Wayin(stored)
      const { vault_key_wayin_wrapped: _wrapped, ...header } = passkeyWayinRecordOf(wayin)
      if (answer.credential_id !== header.credential_id) { throw RefusalFuncs.otherPasskey() }
      if (answer.prf_salt_b64 !== header.prf_salt_b64) { throw RefusalFuncs.otherPrfSalt() }
      const passkeyKey = await deriveWrappingKey(answer.prfBytes, wayinCtxOf(checked, header))
      return new PasskeyProving(checked, header, passkeyKey, wayin)
    })
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

// == [Host calls]: checkStrength, verdictOf, deriveKeyBytes, spendAnswerAfter, spendAnswer, spendPrfBytes

// The host functions that hear the passphrase (guarantees.md, G1 and G8): what they throw may quote it, so it is replaced, not kept as a cause.

/** Hand `passphrase` to the host's `strengthChecker` for `scope`, and refuse it unless the verdict is strong: 'weak_passphrase', with the checker's reason, for a weak one. A checker that throws refuses 'unexpected_error', carrying none of what it threw; one that answers no verdict, 'bad_option'. */
export const checkStrength = async (strengthChecker: StrengthChecker, passphrase: VX.PassphraseCleartext, scope: VaultScope): Promise<void> => {
  const verdict = await verdictOf(strengthChecker, passphrase, scope)
  if (! verdict.success) { throw RefusalFuncs.notAVerdict() }
  if (! verdict.data.strong) { throw RefusalFuncs.weakPassphrase(verdict.data.reason) }
}

const verdictOf = async (strengthChecker: StrengthChecker, passphrase: VX.PassphraseCleartext, scope: VaultScope): Promise<ReturnType<typeof VX.passphraseVerdict.safeParse>> => {
  try {
    return VX.passphraseVerdict.safeParse(await strengthChecker(passphrase, scope))
  } catch {
    throw RefusalFuncs.strengthCheckerThrew()
  }
}

const deriveKeyBytes = async (keyDeriver: ProvingWorld['keyDeriver'], passphrase: VX.PassphraseCleartext, saltBytes: Uint8Array): Promise<unknown> => {
  try {
    return await keyDeriver.deriveKeyBytes(passphrase, saltBytes)
  } catch {
    throw RefusalFuncs.keyDeriverThrew()
  }
}

/** Run `work`, then spend the passkey answer `handed` carries, as {@link spendAnswer} does, unless `work` refused as the user can correct ({@link isCorrectable}): that answer stays the host's, to hand in again or zero (G2). Every export that takes cleartexts runs through it. */
export const spendAnswerAfter = async <ValT>(handed: unknown, work: () => Promise<ValT>): Promise<ValT> => {
  let isLeftUnspent = false
  try {
    return await work()
  } catch (err) {
    isLeftUnspent = isCorrectable(err)
    throw err
  } finally {
    if (! isLeftUnspent) { spendAnswer(handed) }
  }
}

/** Zero a passkey answer's PRF bytes wherever `handed` carries them, as the cleartexts of a proof do, checked or not: an answer is single-use (G2). */
export const spendAnswer = (handed: unknown): void => {
  // The reach-in may meet a getter or a proxy of the host's, which may throw: spending is best effort, and never replaces the refusal or the proving it follows.
  try {
    spendPrfBytes((handed as { passkeyAnswer?: unknown } | null)?.passkeyAnswer)
  } catch { /* nothing left to spend */ }
}

/** Zero a passkey answer's PRF bytes, checked or not, judged by their tag as the checks judge them, so bytes made in another realm, an iframe's, are zeroed too. */
const spendPrfBytes = (answer: unknown): void => {
  // As in spendAnswer: the host's object may throw as it is reached into.
  try {
    const prfBytes: unknown = (answer as { prfBytes?: unknown } | null)?.prfBytes
    if (isBytes(prfBytes)) { prfBytes.fill(0) }
  } catch { /* nothing left to spend */ }
}
// --

// == [Key bytes]: isSharedMemory, isAllZero, passphraseKeyOf

const isSharedMemory = (view: ArrayBufferView): boolean => Object.prototype.toString.call(view.buffer) === '[object SharedArrayBuffer]'

const isAllZero = (bytes: Uint8Array): boolean => bytes.reduce((seen, byte) => seen | byte, 0) === 0

const passphraseKeyOf = async (keyDeriver: ProvingWorld['keyDeriver'], passphrase: VX.PassphraseCleartext, saltBytes: Uint8Array): Promise<CryptoKey> => {
  const handed = await deriveKeyBytes(keyDeriver, passphrase, saltBytes)
  if (! ArrayBuffer.isView(handed) || isSharedMemory(handed)) { throw RefusalFuncs.notKeyBytes() }
  const keyBytes = new Uint8Array(handed.buffer, handed.byteOffset, handed.byteLength)
  try {
    if (keyBytes.length !== PassphraseKeyBytes || isAllZero(keyBytes)) { throw RefusalFuncs.notKeyBytes() }
    return await importWrappingKeyBytes(keyBytes)
  } finally {
    keyBytes.fill(0)
  }
}
// --
