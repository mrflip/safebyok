import type * as Z from 'zod'
import { Checkers } from '../checks/validator'
import { PassphraseKeyBytes } from '../consts'
import { deriveWrappingKey, fromB64, importWrappingKeyBytes, makeVaultKey, randomBytes, toB64, unwrapKeyUnder, wrapKeyUnder } from '../crypto'
import { VaultError } from '../errors'
import { adorn } from '../helpers'
import * as FX from '../shapes/fields'
import * as HX from '../shapes/host-code'
import * as VX from '../shapes/vault'
import { vaultStamp } from './stamps'
import type { Vault } from './vault'
import { type PasskeyWayinHeader, type PassphraseWayinHeader, Wayin, type WayinHeader, type WayinKind, passkeyWayinHeader, passphraseWayinHeader, wayinCtxOf } from './wayin'

// == [Shapes]: NOVEL, Novel, cleartexts, provingWorld, provingPairInput, wayinSource, Cleartexts, ProofClosure, ProvingWorld, ProvingPair

export const NOVEL: unique symbol = Symbol('NOVEL')
export type Novel = typeof NOVEL


export const { cleartexts, provingWorld } = Checkers('bad_option', ({ obj, passphraseCleartext, freshPasskeyAnswer, clockShape, keyDeriverShape, device_id }) => ({
  cleartexts:   obj({ passphrase: passphraseCleartext, passkeyAnswer: freshPasskeyAnswer.nullable().optional() }).strict(),
  provingWorld: obj({ clock: clockShape, keyDeriver: keyDeriverShape, device_id }),
}), [FX, HX, VX])

export type Cleartexts   = Z.input<typeof cleartexts>
export type ProofClosure = () => Cleartexts | Promise<Cleartexts>
export type ProvingWorld = Z.infer<typeof provingWorld>
export type ProvingPair  = { passphraseProving: PassphraseProving, passkeyProving: PasskeyProving | null }

const RewrapUsage = Object.freeze({ extractable: true, usage: ['wrapKey'] as const })

const Checks = Checkers('bad_option', ({ obj, fn, custom }) => ({
  provingPairInput: obj({ vault: vaultStamp, proofClosure: fn<ProofClosure>(), world: provingWorld }),
  wayinSource:      custom<Novel | Proving>((val) => val === NOVEL || val instanceof Proving, 'Expected NOVEL or a proving'),
}))
// --

// == [Proving]: makeProvingPair, makeWayin, wrapVaultKey, unwrapVaultKey, toJSON

export abstract class Proving<HeaderT extends WayinHeader = WayinHeader> {
  readonly wayinkind: HeaderT['wayinkind']
  readonly header:    HeaderT
  declare readonly vault: Vault

  readonly #wayinKey: CryptoKey
  #wayin: Wayin | null = null

  protected constructor(vault: Vault, header: HeaderT, wayinKey: CryptoKey) {
    this.wayinkind = header.wayinkind
    this.header = Object.freeze(header)
    this.#wayinKey = wayinKey
    adorn(this, 'vault', vault)
    Object.freeze(this)
  }

  static async makeProvingPair(vault: Vault, proofClosure: ProofClosure, world: ProvingWorld): Promise<ProvingPair> {
    const { vault: stamp } = Checks.provingPairInput.parse({ vault, proofClosure, world })
    const { passphrase, passkeyAnswer } = cleartexts.parse(await invokeProofClosure(proofClosure))
    // The world as handed from here on, not the parse's copy: a host's clock or deriver keeps its own `this`.
    try {
      const passphraseHeader = mintPassphraseHeader(world)
      const passphraseKey = await passphraseKeyOf(world.keyDeriver, passphrase, fromB64(passphraseHeader.salt_b64))
      const passphraseProving = new PassphraseProving(vault, passphraseHeader, passphraseKey)
      if (! passkeyAnswer) { return { passphraseProving, passkeyProving: null } }
      const passkeyHeader = mintPasskeyHeader(world, passkeyAnswer)
      const passkeyKey = await deriveWrappingKey(passkeyAnswer.prfBytes, wayinCtxOf(stamp, passkeyHeader))
      return { passphraseProving, passkeyProving: new PasskeyProving(vault, passkeyHeader, passkeyKey) }
    } finally {
      passkeyAnswer?.prfBytes.fill(0)
    }
  }

  // not yet: attemptProof, unwrapping the vaultKey from a stored wayin
  // not yet: resealing a wayin

  async makeWayin(source: Novel | Proving): Promise<Wayin> {
    const checked = Checks.wayinSource.parse(source)
    const vaultKey = checked === NOVEL ? await makeVaultKey() : await checked.#unwrapVaultKey()
    return this.#wrapVaultKey(vaultKey)
  }

  async #wrapVaultKey(vaultKey: CryptoKey): Promise<Wayin> {
    const vault_key_wayin_wrapped = await wrapKeyUnder(this.#wayinKey, vaultKey, this.#wayinCtx())
    this.#wayin = new Wayin({ ...this.header, vault_key_wayin_wrapped })
    return this.#wayin
  }

  async #unwrapVaultKey(): Promise<CryptoKey> {
    if (this.#wayin === null) { throw new VaultError('unexpected_error', 'A proving was asked for the vaultKey before it made a wayin. This is a bug in the code calling it.') }
    const { vault_key_wayin_wrapped } = this.#wayin
    const ctx = this.#wayinCtx()
    try {
      return await unwrapKeyUnder(this.#wayinKey, vault_key_wayin_wrapped, ctx, RewrapUsage)
    } catch {
      throw new VaultError('unexpected_error', 'A proving could not unwrap the vaultKey from the wayin it just made. This is a bug.')
    }
  }

  #wayinCtx(): Uint8Array { return wayinCtxOf(vaultStamp.parse(this.vault), this.header) }

  toJSON(): { wayinkind: WayinKind } { return { wayinkind: this.wayinkind } }
}

export class PassphraseProving extends Proving<PassphraseWayinHeader> {
  // not yet: makeLease, once the model Vault has the lock() that lease.ts's LeaseVault wants
}

export class PasskeyProving extends Proving<PasskeyWayinHeader> {}
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

// == [Host calls]: invokeProofClosure, deriveKeyBytes

const invokeProofClosure = async (proofClosure: ProofClosure): Promise<unknown> => {
  try {
    return await proofClosure()
  } catch {
    throw new VaultError('unexpected_error', 'The proof closure threw rather than handing back a passphrase. What it threw is left out, as it heard the passphrase.')
  }
}

const deriveKeyBytes = async (keyDeriver: ProvingWorld['keyDeriver'], passphrase: VX.PassphraseCleartext, saltBytes: Uint8Array): Promise<unknown> => {
  try {
    return await keyDeriver.deriveKeyBytes(passphrase, saltBytes)
  } catch {
    throw new VaultError('unexpected_error', 'The keyDeriver threw rather than deriving a key. What it threw is left out, as it heard the passphrase.')
  }
}
// --

// == [Key bytes]: notKeyBytes, isSharedMemory, isAllZero, passphraseKeyOf

const notKeyBytes = (): VaultError => new VaultError('bad_option', `The keyDeriver handed back something other than ${String(PassphraseKeyBytes)} fresh key bytes.`)

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
