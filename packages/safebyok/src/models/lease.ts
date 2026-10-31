import type * as Z from 'zod'
import { Checkers, consistent, objCheck } from '../checks/validator'
import { FarFuture } from '../consts'
import { type CipherCtxRecord, cipherBytes, cipherCtx, decipherBytes, makeBoxKey, makeLeaseKey, unwrapKeyUnder, wrapKeyUnder } from '../crypto'
import { VaultError, thrownNameOf } from '../errors'
import { adorn, tattoo } from '../helpers'
import type { Outcome } from '../outcome'
import * as Phrases from '../phrases'
import { isLeaseKey } from '../shapes/device'
import type { Ciphered } from '../shapes/fields'
import * as FX from '../shapes/fields'
import * as HX from '../shapes/host-code'
import type { VaultScope } from '../shapes/scopes'
import * as CX from '../shapes/scopes'
import { type VaultStamp, vaultStamp } from './stamps'
import type { Vault } from './vault'

// == [Record forms]: LeaseFormat, leaseStamp, leaseRecord, sealedWhisper, LeaseStamp, LeaseSparse, LeaseRecord, SealedWhisper

export const LeaseFormat = 7001

export const { leaseStamp, leaseRecord } = Checkers('bad_record', ({ obj, lit, custom, epochMillis, vault_key_lease_wrapped }) => {
  const leaseStamp  = obj({ fmt: lit(LeaseFormat), ...vaultStamp.shape, ask_passphrase_at: epochMillis })
  const leaseRecord = leaseStamp.extend({
    lease_key:               custom<CryptoKey>(isLeaseKey, Phrases.LeaseKeyExpected),
    vault_key_lease_wrapped: vault_key_lease_wrapped.readonly(),
  }).strict().readonly()
  return { leaseStamp, leaseRecord }
}, [FX])

export type LeaseStamp  = Z.infer<typeof leaseStamp>
export type LeaseSparse = LeaseStamp
export type LeaseRecord = Z.infer<typeof leaseRecord>

export const sealedWhisper = objCheck(({ box_key_wrapped, whisper_ciphered }) => ({ box_key_wrapped, whisper_ciphered }), { refuseAs: 'bad_record', extras: 'strip' }, [FX])

export type SealedWhisper = Z.infer<typeof sealedWhisper>
// --

// == [What the lease is handed]: LeaseVault, leaseDBFriend, leaseGrantOpts, unwrapUsageVals, LeaseDBFriend, LeaseGrantOpts, UnwrapUsage

export type LeaseVault = VaultStamp & Pick<Vault, 'clock'> & { lock(): unknown }

export const leaseDBFriend = objCheck(({ fn }) => ({
  logger:      HX.loggerShape,
  tryGetLease: fn<(scope: VaultScope) => Promise<Outcome<LeaseRecord | null>>>(),
  tryPutLease: fn<(record: LeaseRecord) => Promise<Outcome<LeaseRecord>>>(),
  tryDelLease: fn<(scope: VaultScope) => Promise<Outcome<void>>>(),
}), { refuseAs: 'bad_option', extras: 'strip' })

export type LeaseDBFriend = Z.infer<typeof leaseDBFriend>

export const leaseGrantOpts = objCheck(({ int, lit, union }) => ({
  leaseMillis: union([int.positive(), lit(Infinity)]),
}), 'bad_option')

export type LeaseGrantOpts = Z.infer<typeof leaseGrantOpts>

export const unwrapUsageVals = ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey'] as const
export type UnwrapUsage = typeof unwrapUsageVals[number]
// --

// == [Checks]: Checks, OwnPurposes, isFlatStamp

const OwnPurposes: ReadonlySet<string> = new Set(['vault_key_lease_wrapped', 'box_key_wrapped', 'whisper_ciphered'])

const isFlatStamp = (val: unknown): boolean => (
  typeof val === 'object' && val !== null && ! Array.isArray(val)
    && Object.values(val).every((field) => typeof field === 'string' || Number.isFinite(field))
)

const Checks = Checkers('bad_option', ({ obj, oneof, str, fn, custom, bytes, ciphered, epochMillis }) => {
  const vault     = obj({ ...vaultStamp.shape, clock: HX.clockShape, lock: fn<() => unknown>() })
  const cryptoKey = custom<CryptoKey>((val) => val instanceof CryptoKey, 'Expected a CryptoKey')
  const stampCtx  = custom<CipherCtxRecord>(isFlatStamp, 'Expected a flat object of strings and numbers')
  const purpose   = str.min(1).refine((val) => ! OwnPurposes.has(val), 'Expected a purpose other than the three the lease keeps for itself')
  return {
    instant:      epochMillis,
    getInput:     obj({ vault, friend: leaseDBFriend }),
    grantInput:   obj({ vault, friend: leaseDBFriend, vaultKey: cryptoKey.refine((val) => val.extractable, 'Expected an extractable CryptoKey'), opts: leaseGrantOpts }),
    wrapInput:    obj({ wrappedKey: cryptoKey, stampCtx, purpose }),
    unwrapInput:  obj({ wrapped: ciphered, stampCtx, purpose, usage: oneof(unwrapUsageVals) }),
    unsealInput:  obj({ sealed: sealedWhisper, stampCtx }),
    whisperBytes: bytes(),
    stampCtx,
  }
}, [FX])
// --

// == [Lease]

export class Lease implements LeaseStamp {
  declare readonly fmt:               typeof LeaseFormat
  declare readonly applabel:          string
  declare readonly user_id:           string
  declare readonly vaultlabel:        string
  declare readonly vault_tok:         string
  declare readonly registered_at:     number
  declare readonly ask_passphrase_at: number
  declare readonly vault:             LeaseVault

  readonly #record: LeaseRecord

  private constructor(vault: LeaseVault, record: LeaseRecord) {
    this.#record = leaseRecord.parse(record)
    tattoo(this, leaseStamp.parse(record), { writable: false, configurable: false })
    adorn(this, 'vault', vault)
    Object.freeze(this)
  }

  // == [Making one]: tryGet, grant

  static async tryGet(vault: LeaseVault, friend: LeaseDBFriend): Promise<Lease | null> {
    Checks.getInput.parse({ vault, friend })
    const kept = await friend.tryGetLease(CX.vaultScope.parse(vault))
    if (! kept.ok) { throw kept.err }
    if (kept.val === null) { return null }
    const record = keptRecordOf(vault, kept.val)
    if (record === null) { friend.logger.warn("This device's lease is not one of this vault, so it counts as none: the vault asks for the passphrase.", { call: 'Lease.tryGet' }) }
    return record === null ? null : new Lease(vault, record)
  }

  static async grant(vault: LeaseVault, friend: LeaseDBFriend, vaultKey: CryptoKey, opts: LeaseGrantOpts): Promise<Lease> {
    const { opts: { leaseMillis } } = Checks.grantInput.parse({ vault, friend, vaultKey, opts })
    const held    = vaultStamp.parse(vault)
    const granted = leaseStamp.parse({ fmt: LeaseFormat, ...held, ask_passphrase_at: Math.min(vault.clock.now() + leaseMillis, FarFuture) })
    const record  = await sealLeaseRecord(held, granted, vaultKey)
    const put = await friend.tryPutLease(record)
    if (! put.ok) { throw put.err }
    return new Lease(vault, record)
  }
  // --

  // == [Its stamp]: endsBy, toJSON

  endsBy(instant: number): boolean {
    return this.ask_passphrase_at <= Checks.instant.parse(instant)
  }

  toJSON(): LeaseSparse {
    return leaseStamp.parse(this.#record)
  }
  // --

  // == [Keys under the vaultKey]: wrap, unwrap

  async wrap(wrappedKey: CryptoKey, stampCtx: CipherCtxRecord, purpose: string): Promise<Ciphered> {
    Checks.wrapInput.parse({ wrappedKey, stampCtx, purpose })
    const vaultKey = await this.#vaultKey('wrapKey')
    const ctx = this.#ctxOf(stampCtx, purpose)
    return FX.ciphered.parse(await guardedCrypto(() => wrapKeyUnder(vaultKey, wrappedKey, ctx)))
  }

  async unwrap(wrapped: Ciphered, stampCtx: CipherCtxRecord, purpose: string, usage: UnwrapUsage): Promise<CryptoKey | null> {
    Checks.unwrapInput.parse({ wrapped, stampCtx, purpose, usage })
    const vaultKey = await this.#vaultKey('unwrapKey')
    const ctx = this.#ctxOf(stampCtx, purpose)
    return openedOrNull(() => unwrapKeyUnder(vaultKey, wrapped, ctx, { extractable: false, usage: [usage] }))
  }
  // --

  // == [Whispers under the vaultKey]: sealWith, unsealWith, sealUnder, unsealUnder

  async sealWith(serializedWhisper: Uint8Array, stampCtx: CipherCtxRecord): Promise<SealedWhisper> {
    Checks.whisperBytes.parse(serializedWhisper)
    try {
      Checks.stampCtx.parse(stampCtx)
      const vaultKey = await this.#vaultKey('wrapKey')
      return await this.#sealUnder(vaultKey, serializedWhisper, stampCtx)
    } finally {
      serializedWhisper.fill(0)
    }
  }

  async unsealWith(sealed: SealedWhisper, stampCtx: CipherCtxRecord): Promise<Uint8Array> {
    Checks.unsealInput.parse({ sealed, stampCtx })
    const vaultKey = await this.#vaultKey('unwrapKey')
    const whisperBytes = await this.#unsealUnder(vaultKey, sealed, stampCtx)
    if (whisperBytes === null) { throw unopenedWhisper() }
    return whisperBytes
  }

  async #sealUnder(vaultKey: CryptoKey, whisperBytes: Uint8Array, stampCtx: CipherCtxRecord): Promise<SealedWhisper> {
    const boxKeyCtx  = this.#ctxOf(stampCtx, 'box_key_wrapped')
    const whisperCtx = this.#ctxOf(stampCtx, 'whisper_ciphered')
    const sealed = await guardedCrypto(async () => {
      const boxKey = await makeBoxKey()
      return { box_key_wrapped: await wrapKeyUnder(vaultKey, boxKey, boxKeyCtx), whisper_ciphered: await cipherBytes(boxKey, whisperBytes, whisperCtx) }
    })
    return sealedWhisper.parse(sealed)
  }

  #unsealUnder(vaultKey: CryptoKey, { box_key_wrapped, whisper_ciphered }: SealedWhisper, stampCtx: CipherCtxRecord): Promise<Uint8Array | null> {
    const boxKeyCtx  = this.#ctxOf(stampCtx, 'box_key_wrapped')
    const whisperCtx = this.#ctxOf(stampCtx, 'whisper_ciphered')
    return openedOrNull(async () => {
      const boxKey = await unwrapKeyUnder(vaultKey, box_key_wrapped, boxKeyCtx, { extractable: false, usage: ['decrypt'] })
      return decipherBytes(boxKey, whisper_ciphered, whisperCtx)
    })
  }
  // --

  // == [The vaultKey]: tryVaultKey, vaultKey, ctxOf

  #tryVaultKey(usage: 'wrapKey' | 'unwrapKey'): Promise<CryptoKey | null> {
    const { lease_key, vault_key_lease_wrapped } = this.#record
    const ctx = leaseCtxOf(vaultStamp.parse(this.vault), leaseStamp.parse(this.#record))
    return openedOrNull(() => unwrapKeyUnder(lease_key, vault_key_lease_wrapped, ctx, { extractable: false, usage: [usage] }))
  }

  async #vaultKey(usage: 'wrapKey' | 'unwrapKey'): Promise<CryptoKey> {
    const vaultKey = await this.#tryVaultKey(usage)
    if (vaultKey !== null) { return vaultKey }
    await this.vault.lock()
    throw damagedLease()
  }

  #ctxOf(stampCtx: CipherCtxRecord, purpose: string): Uint8Array {
    return cipherCtx([vaultStamp.parse(this.vault), stampCtx], purpose)
  }
  // --
}
// --

// == [Helpers]: leaseCtxOf, keptRecordOf, sealLeaseRecord, guardedCrypto, openedOrNull

const leaseCtxOf = (held: VaultStamp, granted: LeaseStamp): Uint8Array => cipherCtx([held, granted], 'vault_key_lease_wrapped')

const keptRecordOf = (vault: LeaseVault, kept: unknown): LeaseRecord | null => {
  const checked = leaseRecord.safeParse(kept)
  return (checked.success && consistent(vaultStamp.parse(checked.data), vaultStamp.parse(vault))) ? checked.data : null
}

const sealLeaseRecord = async (held: VaultStamp, granted: LeaseStamp, vaultKey: CryptoKey): Promise<LeaseRecord> => {
  const ctx = leaseCtxOf(held, granted)
  const keyed = await guardedCrypto(async () => {
    const leaseKey = await makeLeaseKey()
    return { lease_key: leaseKey, vault_key_lease_wrapped: await wrapKeyUnder(leaseKey, vaultKey, ctx) }
  })
  return leaseRecord.parse({ ...granted, ...keyed })
}

const guardedCrypto = async <ValT>(crypt: () => Promise<ValT>): Promise<ValT> => {
  try {
    return await crypt()
  } catch (err) {
    throw cryptoFailed(err)
  }
}

const openedOrNull = async <ValT>(open: () => Promise<ValT>): Promise<ValT | null> => {
  try {
    return await open()
  } catch {
    return null
  }
}
// --

// == [Refusals]: cryptoFailed, damagedLease, unopenedWhisper

const cryptoFailed = (thrown: unknown): VaultError => {
  const thrownName = thrownNameOf(thrown)
  const named = thrownName === null ? '' : ` WebCrypto threw ${thrownName}.`
  return new VaultError('crypto_failed', `This browser's cryptography failed where it should have worked, so nothing was sealed. Try again; if it fails every time, this browser cannot keep secrets just now.${named}`)
}

const damagedLease = (): VaultError => new VaultError('damaged_lease', "This device's lease would not open, so the vault was locked: unlock it again to carry on.")

const unopenedWhisper = (): VaultError => new VaultError('damaged_box', "That whisper would not open under this vault's key: it was altered in storage, or sealed under another vault. Nothing was changed.")
// --
