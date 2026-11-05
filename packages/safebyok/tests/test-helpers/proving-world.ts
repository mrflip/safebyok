/** The test world of the models' cryptography (`Lease`, `Proving`, `Wayin`, `Gate`): a fake lease friend with a spy on each verb, a proving world over a fast key deriver, passkey answers, and the loudly named backdoor that opens a wayin from outside.
 * Import it directly, not through `TH`, as `models-world.ts` is: `src/models/` is not exported.
 *
 * Time. Call {@link useFakeClock} at the top of a test file that reads a time a proving or a lease
 * records: it installs vitest's fake timers at {@link T0} before each test and puts real ones back
 * after, so the fake friend's and the proving world's clock (`Date.now()`) reads what the test says.
 */

import { afterEach, beforeEach, type Mock, vi } from 'vitest'
import { PasskeySaltBytes } from '../../src/helpers/consts'
import { type CipherCtxRecord, deriveWrappingKey, fromB64, importWrappingKeyBytes, makeVaultKey, randomBytes, toB64, unwrapKeyUnder } from '../../src/helpers/crypto'
import { Gate } from '../../src/models/gate'
import { Lease } from '../../src/models/lease'
import { NOVEL, PasskeyProving, PassphraseProving } from '../../src/models/proving'
import { type LeaseFriend, type LeaseGrantOpts, type LeaseRecord, type ProvingWorld, type VaultStamp, FirstGateEpoch, vaultStamp } from '../../src/models/models-shapes'
import { type Wayin, wayinCtxOf } from '../../src/models/wayin'
import { good } from '../../src/refusals/outcome'
import type { KeyDeriver } from '../../src/deriver/basederiver'
import * as VX from '../../src/shapes/vault'
import { anyStrengthChecker, testDeriver } from './builders'
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

// == [The vault]: WorldStamp

/** The stamp of the vault every builder here makes things in: `u1`'s `main` vault of the app `acme`, registered at {@link T0}. */
export const WorldStamp: VaultStamp = Object.freeze({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main', vault_tok: 'vault-tok-u1', registered_at: T0 })
// --

// == [The friend]: FriendLeaseMillis, FakeLeaseFriend, fakeLeaseFriendOf

/** The autolock duration of a {@link fakeLeaseFriendOf}: a day. */
export const FriendLeaseMillis = 24 * 60 * 60_000

/** A fake of a vault as a lease hears it: a {@link LeaseFriend} with a spy for `lock` and each deviceDB verb, over one slot. */
export type FakeLeaseFriend = LeaseFriend & {
  lock:            Mock<() => void>
  tryPeekLease:    Mock<LeaseFriend['tryPeekLease']>
  tryCacheLease:   Mock<LeaseFriend['tryCacheLease']>
  tryUncacheLease: Mock<LeaseFriend['tryUncacheLease']>
  tellBadNews:     Mock<LeaseFriend['tellBadNews']>
  /** The record the slot holds, null for none. Set it to seed one, whatever it is. */
  cached:          unknown
  /** Every call the logger heard, oldest first. */
  logged:          LoggedCall[]
}

/** A {@link FakeLeaseFriend} of {@link WorldStamp}, as `overrides` changes it, caching nothing yet, its verbs answering good. Script a refusal with the spy's `mockResolvedValueOnce(bad(err))`.
 *
 * @example
 *   const friend = fakeLeaseFriendOf({ vault_tok: 'vault-tok-other' })
 *   friend.tryCacheLease.mockResolvedValueOnce(bad(new VaultError('unexpected_error', 'the disk is full')))
 */
export const fakeLeaseFriendOf = (overrides: Partial<VaultStamp & Pick<LeaseFriend, 'leaseMillis'>> = {}): FakeLeaseFriend => {
  const { logger, calls } = spyLogger()
  const friend: FakeLeaseFriend = {
    ...WorldStamp,
    leaseMillis:     FriendLeaseMillis,
    ...overrides,
    clock:           { now: () => Date.now() },
    logger,
    logged:          calls,
    cached:          null,
    lock:            vi.fn<() => void>(),
    tellBadNews:     vi.fn(),
    tryPeekLease:    vi.fn(() => Promise.resolve(good(friend.cached))),
    tryCacheLease:   vi.fn((record: LeaseRecord) => {
      friend.cached = record
      return Promise.resolve(good(record))
    }),
    tryUncacheLease: vi.fn(() => {
      friend.cached = null
      return Promise.resolve(good(undefined))
    }),
  }
  return friend
}
// --

// == [Leases]: GrantedAs, makeGrantedLease, sealStampOf

/** What {@link makeGrantedLease} records of a proving, unless told otherwise: the first gate, proved by passphrase. */
export const GrantedAs: LeaseGrantOpts = Object.freeze({ gate_epoch: FirstGateEpoch, wayinkind: 'passphrase' })

/** A lease under a fresh vaultKey: no two share a key. Not cached. */
export const makeGrantedLease = async (friend: FakeLeaseFriend, opts: LeaseGrantOpts = GrantedAs): Promise<Lease> => (
  Lease.buildGranted(friend, await makeVaultKey(), opts)
)

/** The two stamps a box hands the lease to seal its whisper under, its own fields, flat: `boxlabel` and `box_tok` for the boxKey's wrap, the same and `revision_seq` for the whisper's cipher. `overrides` lays fields over both. */
export const sealStampOf = (boxlabel: string, overrides: Readonly<Record<string, string | number>> = {}): CipherCtxRecord => ({ boxlabel, box_tok: `box-tok-${boxlabel}`, revision_seq: 1, ...overrides })
// --

// == [Provings]: TestPassphrase, DeviceId, provingWorldOf, passkeyAnswerOf, builtGateOf

/** An obvious fake passphrase, never a real one. */
export const TestPassphrase = VX.passphraseCleartext.parse('correct horse battery staple')

/** The `device_id` a {@link provingWorldOf} world carries. */
export const DeviceId = 'device-laptop'

/** A proving's world: a clock on `Date.now()`, the one-SHA-256 `testDeriver`, a strength checker that passes everything, and {@link DeviceId}. */
export const provingWorldOf = (overrides: Partial<ProvingWorld> = {}): ProvingWorld => ({
  clock:           { now: () => Date.now() },
  keyDeriver:      testDeriver,
  strengthChecker: anyStrengthChecker,
  device_id:       DeviceId,
  ...overrides,
})

/** A fresh passkey answer: a fake credential id, a fresh salt of the right length, and 32 random PRF bytes. */
export const passkeyAnswerOf = (overrides: Partial<VX.PasskeyAnswer> = {}): VX.PasskeyAnswer => ({
  credential_id: 'cred-test-1',
  prf_salt_b64:  toB64(randomBytes(PasskeySaltBytes)),
  prfBytes:      randomBytes(32),
  ...overrides,
})

/** A first gate of {@link WorldStamp}, made as a birth makes it, of {@link TestPassphrase} and any passkey `answer`, which it leaves unspent, beside the passphrase's proving. */
export const builtGateOf = async (answer?: VX.PasskeyAnswer): Promise<{ gate: Gate, proving: PassphraseProving }> => {
  const world = provingWorldOf()
  const proving = await PassphraseProving.buildNovel(WorldStamp, VX.passphraseCleartext.parse(TestPassphrase), world)
  const passkeyProving = answer && await PasskeyProving.buildNovel(WorldStamp, answer, world)
  const passphraseWayin = await proving.buildWayin(NOVEL)
  const passkeyWayin = await passkeyProving?.buildWayin(proving) ?? null
  return { gate: Gate.make(WorldStamp, passphraseWayin, passkeyWayin), proving }
}
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
