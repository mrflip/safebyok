/** The test world of the models' cryptography (`Lease`, `Proving`, `Wayin`, `Gate`): a duck vault, a fake deviceDB friend with a spy on each verb, a proving world over a fast key deriver, passkey answers, and the loudly named backdoor that opens a wayin from outside.
 * Import it directly, not through `TH`, as `models-world.ts` is: `src/models/` is not exported.
 *
 * Time. A lease's autolock is a Trigger, which arms a `setTimeout` at `autolock_at`. Call
 * {@link useFakeClock} at the top of a test file: it installs vitest's fake timers at {@link T0}
 * before each test and puts real ones back after, so no autolock keeps the process alive and the
 * duck vault's clock (`Date.now()`) moves with them. `await vi.advanceTimersByTimeAsync(ms)` moves
 * the clock and fires what falls due; `vi.setSystemTime(ms)` jumps it, firing nothing.
 */

import { afterEach, beforeEach, type Mock, vi } from 'vitest'
import { MinuteMillis, PasskeySaltBytes } from '../../src/consts'
import { type CipherCtxRecord, deriveWrappingKey, fromB64, importWrappingKeyBytes, makeVaultKey, randomBytes, toB64, unwrapKeyUnder } from '../../src/crypto'
import { Lease } from '../../src/models/lease'
import { type LeaseDBFriend, type LeaseGrantOpts, type LeaseRecord, type ProofClosure, type ProvingWorld, type VaultStamp, vaultStamp } from '../../src/models/models-shapes'
import type { Vault } from '../../src/models/vault'
import { type Wayin, wayinCtxOf } from '../../src/models/wayin'
import { good } from '../../src/outcome'
import type { KeyDeriver } from '../../src/key-deriver'
import * as VX from '../../src/shapes/vault'
import { testDeriver } from './builders'
import { type LoggedCall, spyLogger } from './logging'
import { T0 } from './models-world'

export { T0 } from './models-world'

// == [Time]: useFakeClock

/** Vitest's fake timers from {@link T0} before each test, real ones back after it. Call it at the top of a test file that makes a lease. */
export const useFakeClock = (): void => {
  beforeEach(() => { vi.useFakeTimers({ now: T0 }) })
  afterEach(() => { vi.useRealTimers() })
}
// --

// == [The vault]: WorldStamp, DuckVault, duckVaultOf, asVault

/** The stamp of the vault every builder here makes things in: `u1`'s `main` vault of the app `acme`, registered at {@link T0}. */
export const WorldStamp: VaultStamp = Object.freeze({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main', vault_tok: 'vault-tok-u1', registered_at: T0 })

/** A plain stand-in for a vault, as a lease, a proving and a gate are handed one: its stamp, a clock on `Date.now()`, and `lock`, a spy. */
export type DuckVault = VaultStamp & { clock: { now: () => number }, lock: Mock<() => void> }

/** A {@link DuckVault} of {@link WorldStamp}, with a fresh `lock` spy.
 *
 * @example const vault = duckVaultOf({ vault_tok: 'vault-tok-other' })
 */
export const duckVaultOf = (overrides: Partial<VaultStamp> = {}): DuckVault => ({
  ...WorldStamp,
  ...overrides,
  clock: { now: () => Date.now() },
  lock:  vi.fn<() => void>(),
})

/** `duck` typed as the model `Vault`: a lease, a proving and a gate read nothing of a vault past its stamp, its clock and `lock()`. */
export const asVault = (duck: DuckVault): Vault => duck as unknown as Vault
// --

// == [The deviceDB friend]: FakeDBFriend, fakeDBFriendOf

/** A fake of the deviceDB as a lease reaches it: its {@link LeaseDBFriend} verbs, each a spy. */
export type FakeDBFriend = LeaseDBFriend & {
  tryGetLease: Mock<LeaseDBFriend['tryGetLease']>
  tryPutLease: Mock<LeaseDBFriend['tryPutLease']>
  tryDelLease: Mock<LeaseDBFriend['tryDelLease']>
  /** The record the slot keeps, null for none. Set it to seed one, whatever it is. */
  kept:        unknown
  /** Every call the logger heard, oldest first. */
  logged:      LoggedCall[]
}

/** A {@link FakeDBFriend} keeping nothing, its verbs answering good. Script a refusal with the spy's `mockResolvedValueOnce(bad(err))`.
 *
 * @example
 *   const friend = fakeDBFriendOf()
 *   friend.tryPutLease.mockResolvedValueOnce(bad(new VaultError('unexpected_error', 'the disk is full')))
 */
export const fakeDBFriendOf = (): FakeDBFriend => {
  const { logger, calls } = spyLogger()
  const friend: FakeDBFriend = {
    logger,
    logged:      calls,
    kept:        null,
    tryGetLease: vi.fn(() => Promise.resolve(good(friend.kept as LeaseRecord | null))),
    tryPutLease: vi.fn((record: LeaseRecord) => {
      friend.kept = record
      return Promise.resolve(good(record))
    }),
    tryDelLease: vi.fn(() => {
      friend.kept = null
      return Promise.resolve(good(undefined))
    }),
  }
  return friend
}
// --

// == [Leases]: WeekMillis, grantedLeaseOf, sealStampsOf

/** A week, the lease {@link grantedLeaseOf} grants unless told otherwise. */
export const WeekMillis = 7 * 24 * 60 * MinuteMillis

/** A lease under a fresh vaultKey: no two share a key. A {@link WeekMillis week} long unless `opts` says otherwise. */
export const grantedLeaseOf = async (vault: DuckVault, friend: FakeDBFriend, opts?: LeaseGrantOpts): Promise<Lease> => (
  Lease.grant(vault, friend, await makeVaultKey(), opts ?? { leaseMillis: WeekMillis })
)

/** The two stamps a box hands the lease to seal its whisper under, its own fields, flat: `boxlabel` and `box_tok` for the boxKey's wrap, the same and `revision_seq` for the whisper's cipher. `overrides` lays fields over both. */
export const sealStampsOf = (boxlabel: string, overrides: Readonly<Record<string, string | number>> = {}): { boxKeyStamp: CipherCtxRecord, whisperStamp: CipherCtxRecord } => ({
  boxKeyStamp:  { boxlabel, box_tok: `box-tok-${boxlabel}`, ...overrides },
  whisperStamp: { boxlabel, box_tok: `box-tok-${boxlabel}`, revision_seq: 1, ...overrides },
})
// --

// == [Provings]: TestPassphrase, DeviceId, provingWorldOf, passkeyAnswerOf, proofClosureOf

/** An obvious fake passphrase, never a real one. */
export const TestPassphrase = VX.passphraseCleartext.parse('correct horse battery staple')

/** The `device_id` a {@link provingWorldOf} world carries. */
export const DeviceId = 'device-laptop'

/** A proving's world: a clock on `Date.now()`, the one-SHA-256 `testDeriver`, and {@link DeviceId}. */
export const provingWorldOf = (overrides: Partial<ProvingWorld> = {}): ProvingWorld => ({
  clock:      { now: () => Date.now() },
  keyDeriver: testDeriver,
  device_id:  DeviceId,
  ...overrides,
})

/** A fresh passkey answer: a fake credential id, a fresh salt of the right length, and 32 random PRF bytes. */
export const passkeyAnswerOf = (overrides: Partial<VX.PasskeyAnswer> = {}): VX.PasskeyAnswer => ({
  credential_id: 'cred-test-1',
  prf_salt_b64:  toB64(randomBytes(PasskeySaltBytes)),
  prfBytes:      randomBytes(32),
  ...overrides,
})

/** A synchronous proof closure; a test of an async one, or one that throws, writes its own. */
export const proofClosureOf = (passphrase: string = TestPassphrase, passkeyAnswer?: VX.PasskeyAnswer): ProofClosure => () => (
  passkeyAnswer === undefined ? { passphrase } : { passphrase, passkeyAnswer }
)
// --

// == [Bytes]: isZeroed

/** Whether every byte of `bytes` is zero: what a spent passkey answer, a sealed whisper's bytes or refused key bytes are left as. */
export const isZeroed = (bytes: Uint8Array): boolean => bytes.every((byte) => byte === 0)
// --

// == [Backdoor]: WayinSecret, _cheat_vaultKeyBytesOf

/** What opens a wayin: the passphrase, for a passphrase wayin, or a copy of the PRF bytes taken before the proving zeroed them, for a passkey wayin. */
export type WayinSecret = { passphrase: string } | { prfBytes: Uint8Array }

/** A test backdoor: the raw bytes of the vaultKey `wayin` wraps, opened from outside the models as a later unlock would open it, from the secret, the wayin's header and the vault's stamp. It exists only so a test can show two wayins hold one vaultKey, or that a wayin opens at all; no model hands out a vaultKey. Rejects with WebCrypto's error when the wayin will not open. */
export const _cheat_vaultKeyBytesOf = async (vault: VaultStamp, wayin: Wayin, secret: WayinSecret, keyDeriver: KeyDeriver = testDeriver): Promise<Uint8Array> => {
  const header = wayin.toJSON()
  const ctx = wayinCtxOf(vaultStamp.parse(vault), header)
  const wayinKeyOf = async (): Promise<CryptoKey> => {
    if ('prfBytes' in secret) {
      if (header.wayinkind !== 'passkey') { throw new Error('PRF bytes open a passkey wayin alone.') }
      return deriveWrappingKey(secret.prfBytes, ctx)
    }
    if (header.wayinkind !== 'passphrase') { throw new Error('A passphrase opens a passphrase wayin alone.') }
    return importWrappingKeyBytes(await keyDeriver.deriveKeyBytes(VX.passphraseCleartext.parse(secret.passphrase), fromB64(header.salt_b64)))
  }
  const wayinKey = await wayinKeyOf()
  const vaultKey = await unwrapKeyUnder(wayinKey, wayin.vault_key_wayin_wrapped, ctx, { extractable: true, usage: ['wrapKey'] })
  return new Uint8Array(await crypto.subtle.exportKey('raw', vaultKey))
}
// --
