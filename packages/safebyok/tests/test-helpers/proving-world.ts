/** The test world of the models' cryptography (`Lease`, `Proving`, `Wayin`, `Gate`): a fake lease friend with a spy on each verb, a proving world over a fast key deriver, passkey answers, and the loudly named backdoor that opens a wayin from outside.
 * Import it directly, not through `TH`, as `models-world.ts` is: `src/models/` is not exported.
 *
 * Time. Call {@link useFakeClock} at the top of a test file that reads a time a proving or a lease
 * records: it installs vitest's fake timers at {@link T0} before each test and puts real ones back
 * after, so the package's clock (`Date.now()`) reads what the test says.
 */

import { afterEach, beforeEach, type Mock, vi } from 'vitest'
import { PasskeySaltSize } from '../../src/helpers/consts'
import { type CipherCtxRecord, deriveWrappingKey, fromB64, importWrappingKeyBytes, makeVaultKey, randomBytes, toB64, unwrapKeyUnder } from '../../src/helpers/crypto'
import { Gate } from '../../src/models/gate'
import { Lease } from '../../src/models/lease'
import { NOVEL, PasskeyProving, PassphraseProving, guardKeyDeriver } from '../../src/models/proving'
import { type StrengthChecker, guardStrengthChecker } from '../../src/helpers/passphrase-strength'
import * as GX from '../../src/shapes/shapes-gateish'
import { type BankStamp, type CitedGate, type GateStamp, type LeaseFriend, type LeaseGrantOpts, type LeaseRecord, type ProvingWorld, type VaultStamp } from '../../src/shapes/shapes-gateish'
import { type Wayin, wayinCtxOf } from '../../src/models/wayin'
import { good } from '../../src/refusals/outcome'
import type { KeyDeriver } from '../../src/deriver/basederiver'
import { anyStrengthChecker, testDeriver } from './builders'
import { parseLogger } from '../../src/helpers/logger'
import { type LoggedCall, spyLogger } from './logging'
import { T0 } from './models-world'

export { T0 } from './models-world'

// == [Time]: useFakeClock

/** Vitest's fake timers from {@link T0} before each test, real ones back after it. Call it at the top of a test file that makes a lease. */
export function useFakeClock(): void {
  beforeEach(() => { vi.useFakeTimers({ now: T0 }) })
  afterEach(() => { vi.useRealTimers() })
}
// --

// == [The stamps]: WorldBankStamp, WorldGateStamp, WorldVaultStamp, WorldGate

/** The stamp of the bank every builder here makes things in: `u1`'s bank `acme`, registered at {@link T0}. */
export const WorldBankStamp: BankStamp = Object.freeze({ user_id: 'u1', banklabel: 'acme', bank_tok: 'bank-tok-u1', registered_at: T0 })

/** The stamp of {@link WorldBankStamp}'s `main` gate, registered at {@link T0}. */
export const WorldGateStamp: GateStamp = Object.freeze({ user_id: 'u1', banklabel: 'acme', gatelabel: 'main', gate_tok: 'gate-tok-u1', registered_at: T0 })

/** The stamp of the `main` vault in {@link WorldBankStamp}'s bank, registered at {@link T0}: the first of the stamps a box hands a seal. */
export const WorldVaultStamp: VaultStamp = Object.freeze({ user_id: 'u1', banklabel: 'acme', vaultlabel: 'main', vault_tok: 'vault-tok-u1', registered_at: T0 })

/** The gate a lease cites when a test says nothing else: {@link WorldGateStamp}'s gate, at its first revision. */
export const WorldGate: CitedGate = Object.freeze({ gatelabel: 'main', gate_tok: WorldGateStamp.gate_tok, revision_tok: 'gate-revision-tok-1' })
// --

// == [The friend]: FriendLeaseMillis, FakeLeaseFriend, fakeLeaseFriendOf

/** The autolock duration of a {@link fakeLeaseFriendOf}: a day. */
export const FriendLeaseMillis = 24 * 60 * 60_000

/** A fake of a bank as a lease hears it: a {@link LeaseFriend} with a spy for `lock` and each deviceDB verb, over one scopepath. */
export type FakeLeaseFriend = LeaseFriend & {
  lock:            Mock<() => void>
  peekLease:       Mock<LeaseFriend['peekLease']>
  tryCacheLease:   Mock<LeaseFriend['tryCacheLease']>
  forgetLease:     Mock<LeaseFriend['forgetLease']>
  tryForgetLease:  Mock<LeaseFriend['tryForgetLease']>
  tellBadNews:     Mock<LeaseFriend['tellBadNews']>
  /** The record cached at that scopepath, null for none. Set it to seed one, whatever it is. */
  cached:          unknown
  /** Every call the logger heard, oldest first. */
  logged:          LoggedCall[]
}

/** A {@link FakeLeaseFriend} of {@link WorldBankStamp}, as `overrides` changes it, caching nothing yet, its verbs answering good. Script a refusal with the spy's `mockRejectedValueOnce(err)`, or `mockResolvedValueOnce(bad(err))` for a `try` verb. */
export function fakeLeaseFriendOf(overrides: Partial<BankStamp & Pick<LeaseFriend, 'leaseMillis'>> = {}): FakeLeaseFriend {
  const { logger, calls } = spyLogger()
  const friend: FakeLeaseFriend = {
    ...WorldBankStamp,
    leaseMillis:     FriendLeaseMillis,
    ...overrides,
    logger:          parseLogger(logger),
    logged:          calls,
    cached:          null,
    lock:            vi.fn<() => void>(),
    tellBadNews:     vi.fn(),
    peekLease:       vi.fn(() => Promise.resolve(friend.cached)),
    tryCacheLease:   vi.fn((record: LeaseRecord) => {
      friend.cached = record
      return Promise.resolve(good(record))
    }),
    forgetLease:     vi.fn(() => {
      friend.cached = null
      return Promise.resolve()
    }),
    tryForgetLease:  vi.fn(() => {
      friend.cached = null
      return Promise.resolve(good(undefined))
    }),
  }
  return friend
}
// --

// == [Leases]: GrantedAs, makeGrantedLease, sealStampOf, sealStampsOf

/** What {@link makeGrantedLease} records of a proving, unless told otherwise: {@link WorldGate}, proved by passphrase. */
export const GrantedAs: LeaseGrantOpts = Object.freeze({ gate: WorldGate, wayinkind: 'passphrase' })

/** A lease under a fresh vaultKey: no two share a key. Not cached. */
export async function makeGrantedLease(friend: FakeLeaseFriend, opts: LeaseGrantOpts = GrantedAs): Promise<Lease> {
  return Lease.buildGranted(friend, await makeVaultKey(), opts)
}

/** The two stamps a box hands the lease to seal its whisper under, its own fields, flat: `boxlabel` and `box_tok` for the boxKey's wrap, the same and `revision_seq` for the whisper's cipher. `overrides` lays fields over both. */
export function sealStampOf(boxlabel: string, overrides: Readonly<Record<string, string | number>> = {}): CipherCtxRecord { return { boxlabel, box_tok: `box-tok-${boxlabel}`, revision_seq: 1, ...overrides } }

/** The stamps a box hands the lease to seal under: {@link WorldVaultStamp}, then {@link sealStampOf} `boxlabel` and `overrides`. */
export function sealStampsOf(boxlabel: string, overrides: Readonly<Record<string, string | number>> = {}): CipherCtxRecord[] { return [WorldVaultStamp, sealStampOf(boxlabel, overrides)] }
// --

// == [Provings]: TestPassphrase, DeviceTok, provingWorldOf, passkeyAnswerOf, builtGateOf

/** An obvious fake passphrase, never a real one. */
export const TestPassphrase = GX.passphraseCleartext.parse('correct horse battery staple')

/** The `device_tok` a {@link provingWorldOf} world carries. */
export const DeviceTok = '00000000-0000-4000-8000-00000000000a'

/** What a test may say of a {@link provingWorldOf} world: the host's own deriver and checker, which it wraps as a bank does. */
export type ProvingWorldGiven = { keyDeriver?: KeyDeriver | undefined, strengthChecker?: StrengthChecker | undefined, device_tok?: string | undefined }

/** A proving's world: the one-SHA-256 `testDeriver`, a strength checker that passes everything, and {@link DeviceTok}, each wrapped as a bank wraps it. */
export function provingWorldOf({ keyDeriver = testDeriver, strengthChecker = anyStrengthChecker, device_tok = DeviceTok }: ProvingWorldGiven = {}): ProvingWorld {
  return {
    keyDeriver:      guardKeyDeriver(keyDeriver),
    strengthChecker: guardStrengthChecker(strengthChecker),
    device_tok,
  }
}

/** A fresh passkey answer: a fake credential id, a fresh salt of the right length, and 32 random PRF bytes. */
export function passkeyAnswerOf(overrides: Partial<GX.PasskeyAnswer> = {}): GX.PasskeyAnswer {
  return {
    credential_id: 'cred-test-1',
    prf_salt_b64:  toB64(randomBytes(PasskeySaltSize)),
    prfBytes:      randomBytes(32),
    ...overrides,
  }
}

/** A gate of {@link WorldGateStamp}, made as a birth makes it, of {@link TestPassphrase} and any passkey `answer`, which it leaves unspent, beside the passphrase's proving. */
export async function builtGateOf(answer?: GX.PasskeyAnswer): Promise<{ gate: Gate, proving: PassphraseProving }> {
  const world = provingWorldOf()
  const proving = await PassphraseProving.buildNovel(WorldBankStamp, WorldGateStamp, GX.passphraseCleartext.parse(TestPassphrase), world)
  const passkeyProving = answer && await PasskeyProving.buildNovel(WorldBankStamp, WorldGateStamp, answer, world)
  const passphraseWayin = await proving.buildWayin(NOVEL)
  const passkeyWayin = await passkeyProving?.buildWayin(proving) ?? null
  return { gate: Gate.make(WorldBankStamp, WorldGateStamp, passphraseWayin, passkeyWayin), proving }
}
// --

// == [Bytes]: isZeroed

/** Whether every byte of `bytes` is zero: what a spent passkey answer, a sealed whisper's bytes or refused key bytes are left as. */
export function isZeroed(bytes: Uint8Array): boolean { return bytes.every((byte) => byte === 0) }
// --

// == [Backdoor]: WayinSecret, _cheat_vaultKeyBytesOf

/** What opens a wayin: the passphrase, for a passphrase wayin, or a copy of the PRF bytes taken before the proving zeroed them, for a passkey wayin. */
export type WayinSecret = { passphrase: string } | { prfBytes: Uint8Array }

/** A test backdoor: the raw bytes of the vaultKey `wayin` wraps, opened from outside the models as a later unlock would open it, from the secret, the wayin's header and the bank's and gate's stamps. It exists only so a test can show two wayins have one vaultKey, or that a wayin opens at all; no model hands out a vaultKey. Rejects with WebCrypto's error when the wayin will not open. */
export async function _cheat_vaultKeyBytesOf(bank: BankStamp, gate: GateStamp, wayin: Wayin, secret: WayinSecret, keyDeriver: KeyDeriver = testDeriver): Promise<Uint8Array> {
  const header = wayin.toJSON()
  const ctx = wayinCtxOf(bank, gate, header)
  async function wayinKeyOf(): Promise<CryptoKey> {
    if ('prfBytes' in secret) {
      if (header.wayinkind !== 'passkey') { throw new Error('PRF bytes open a passkey wayin alone.') }
      return deriveWrappingKey(secret.prfBytes, ctx)
    }
    if (header.wayinkind !== 'passphrase') { throw new Error('A passphrase opens a passphrase wayin alone.') }
    return importWrappingKeyBytes(await keyDeriver.deriveKeyBytes(GX.passphraseCleartext.parse(secret.passphrase), fromB64(header.salt_b64)))
  }
  const wayinKey = await wayinKeyOf()
  const vaultKey = await unwrapKeyUnder(wayinKey, wayin.vault_key_wayin_wrapped, ctx, { extractable: true, usage: ['wrapKey'] })
  return new Uint8Array(await crypto.subtle.exportKey('raw', vaultKey))
}
// --
