import { Checkers, consistent } from '../checks/validator'
import { PassphraseKeyBytes } from '../consts'
import { deriveWrappingKey, fromB64, importWrappingKeyBytes, makeVaultKey, randomBytes, toB64, unwrapKeyUnder, wrapKeyUnder } from '../crypto'
import { VaultError } from '../errors'
import { adorn } from '../helpers'
import type * as VX from '../shapes/vault'
import { Lease } from './lease'
import { type LeaseDBFriend, type LeaseGrantOpts, type LeaseVault, type PasskeyWayinHeader, type PassphraseWayinHeader, type ProofClosure, type ProvingWorld, type VaultStamp, type WayinHeader, type WayinKind, cleartexts, passkeyWayinHeader, passphraseWayinHeader, provingMakeArgs, provingPairArgs, vaultStamp } from './models-shapes'
import { Wayin, wayinCtxOf } from './wayin'

// == [NOVEL and the checks]: NOVEL, Novel, ProvingPair, RewrapUsage, Checks

export const NOVEL: unique symbol = Symbol('NOVEL')
export type Novel = typeof NOVEL

export type ProvingPair = { passphraseProving: PassphraseProving, passkeyProving: PasskeyProving | null }

/** What the vaultKey is unwrapped as, inside a proving: extractable only so it can be wrapped again, and dropped when the method ends. */
const RewrapUsage = Object.freeze({ extractable: true, usage: ['wrapKey'] as const })

/** Stays here: it names the class. */
const Checks = Checkers('bad_option', ({ custom }) => ({
  wayinSource: custom<Novel | Proving>((val) => val === NOVEL || val instanceof Proving, 'Expected NOVEL or a proving'),
}))
// --

// == [Proving]: makeProvingPair, makeWayin, makeLease, wrapVaultKey, unwrapVaultKey, toJSON

export abstract class Proving<HeaderT extends WayinHeader = WayinHeader> {
  readonly wayinkind: HeaderT['wayinkind']
  readonly header:    HeaderT
  /** The stamp of the vault this proving is of, as parsed: what every wayin ctx under it binds. */
  declare readonly stamp: VaultStamp

  readonly #wayinKey: CryptoKey
  #wayin: Wayin | null = null

  protected constructor(stamp: VaultStamp, header: HeaderT, wayinKey: CryptoKey) {
    this.wayinkind = header.wayinkind
    this.header = Object.freeze(header)
    this.#wayinKey = wayinKey
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

  // not yet: attemptProof, unwrapping the vaultKey from a stored wayin
  // not yet: resealing a wayin

  async makeWayin(source: Novel | Proving): Promise<Wayin> {
    const checked = Checks.wayinSource.parse(source)
    const vaultKey = checked === NOVEL ? await makeVaultKey() : await checked.#unwrapVaultKey()
    return this.#wrapVaultKey(vaultKey)
  }

  /** Grant `vault` a lease under the vaultKey this proving's wayin holds; refuses 'bad_option' a vault whose stamp is not the one this proving is of, before any key is touched. */
  async makeLease(vault: LeaseVault, dbfriend: LeaseDBFriend, opts: LeaseGrantOpts): Promise<Lease> {
    if (! consistent(vaultStamp.parse(vault), this.stamp)) { throw leaseOfOtherVault() }
    const vaultKey = await this.#unwrapVaultKey()
    return Lease.grant(vault, dbfriend, vaultKey, opts)
  }

  async #wrapVaultKey(vaultKey: CryptoKey): Promise<Wayin> {
    const vault_key_wayin_wrapped = await wrapKeyUnder(this.#wayinKey, vaultKey, this.#wayinCtx())
    this.#wayin = new Wayin({ ...this.header, vault_key_wayin_wrapped })
    return this.#wayin
  }

  #unwrapVaultKey(): Promise<CryptoKey> {
    if (this.#wayin === null) { throw wayinNotMadeYet() }
    return unwrapKeyUnder(this.#wayinKey, this.#wayin.vault_key_wayin_wrapped, this.#wayinCtx(), RewrapUsage)
  }

  #wayinCtx(): Uint8Array { return wayinCtxOf(this.stamp, this.header) }

  toJSON(): { wayinkind: WayinKind } { return { wayinkind: this.wayinkind } }
}
// --

// == [PassphraseProving]: make

export class PassphraseProving extends Proving<PassphraseWayinHeader> {
  static async make(stamp: VaultStamp, world: ProvingWorld, passphrase: VX.PassphraseCleartext): Promise<PassphraseProving> {
    const { stamp: checked } = provingMakeArgs.parse({ stamp, world })
    const header = mintPassphraseHeader(world)
    const passphraseKey = await passphraseKeyOf(world.keyDeriver, passphrase, fromB64(header.salt_b64))
    return new PassphraseProving(checked, header, passphraseKey)
  }
}
// --

// == [PasskeyProving]: make

export class PasskeyProving extends Proving<PasskeyWayinHeader> {
  static async make(stamp: VaultStamp, world: ProvingWorld, passkeyAnswer: VX.PasskeyAnswer): Promise<PasskeyProving> {
    const { stamp: checked } = provingMakeArgs.parse({ stamp, world })
    const header = mintPasskeyHeader(world, passkeyAnswer)
    try {
      const passkeyKey = await deriveWrappingKey(passkeyAnswer.prfBytes, wayinCtxOf(checked, header))
      return new PasskeyProving(checked, header, passkeyKey)
    } finally {
      passkeyAnswer.prfBytes.fill(0)
    }
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

// == [Host calls]: invokeProofClosure, deriveKeyBytes, spendAnswer

// The two host functions that hear the passphrase (guarantees.md, G1 and G8): what they throw may quote it, so it is replaced, not kept as a cause.
const invokeProofClosure = async (proofClosure: ProofClosure): Promise<unknown> => {
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
  const prfBytes: unknown = (handed as { passkeyAnswer?: { prfBytes?: unknown } | null } | null)?.passkeyAnswer?.prfBytes
  if (prfBytes instanceof Uint8Array) { prfBytes.fill(0) }
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

// == [Refusals]: notKeyBytes, wayinNotMadeYet, leaseOfOtherVault, proofClosureThrew, keyDeriverThrew

const notKeyBytes = (): VaultError => new VaultError('bad_option', `The keyDeriver handed back something other than ${String(PassphraseKeyBytes)} fresh key bytes.`)

const wayinNotMadeYet = (): VaultError => new VaultError('unexpected_error', 'A proving was asked for the vaultKey before it made a wayin: a bug in the caller.')

const leaseOfOtherVault = (): VaultError => new VaultError('bad_option', 'This proving is of another vault: a lease is granted only to the vault whose stamp its wayin binds.')

const proofClosureThrew = (): VaultError => new VaultError('unexpected_error', 'The proof closure threw rather than handing back a passphrase. What it threw is left out, as it heard the passphrase.')

const keyDeriverThrew = (): VaultError => new VaultError('unexpected_error', 'The keyDeriver threw rather than deriving a key. What it threw is left out, as it heard the passphrase.')
// --
