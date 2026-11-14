/** The test world of the lean core's models: fixed stamps, a fake clock, a device over a fast key deriver, passkey answers,
 * a bank born unlocked, a stub of the `bank.put` seam, box antes, a fake of the bank a lease hears, and the loudly named
 * backdoors that open a wayin or read a lease's record from outside.
 *
 * Time. Call {@link useFakeClock} at the top of a test file that reads a time a proving, a lease or a record carries: it
 * installs vitest's fake timers at {@link T0} before each test and puts real ones back after, so the package's clock
 * (`Date.now()`) reads what the test says.
 */

import { type Mock, type MockInstance, afterEach, beforeEach, vi } from 'vitest'
import type { Deriver } from 'safebyok-big/internals'
import { BX, Consts, Crypto, GX, Strength } from 'safebyok-big/internals'
import { anyStrengthChecker, quietLogger, testDeriver } from 'safebyok-big/testing'
import { Bank } from '../../src/models/bank'
import { Device, type DeviceOpts, type DeviceRecord } from '../../src/models/device'
import { Lease, type LeaseBank } from '../../src/models/lease'
import { NOVEL, PasskeyProving, PassphraseProving, type Proving, guardKeyDeriver } from '../../src/models/proving'
import type { BoxAnte } from '../../src/models/sealers'
import { type Wayin, wayinCtxOf } from '../../src/models/wayin'

// == [Time]: T0, useFakeClock

/** The clock's first reading, in epoch milliseconds: 14 November 2023. The epoch check refuses small numbers. */
export const T0 = 1_700_000_000_000

/** Vitest's fake timers from {@link T0} before each test, real ones back after it. */
export function useFakeClock(): void {
  beforeEach(() => { vi.useFakeTimers({ now: T0 }) })
  afterEach(() => { vi.useRealTimers() })
}
// --

// == [The stamps]: WorldScope, WorldBankStamp, WorldGateStamp, WorldGate, WorldVaultTok

/** The bank scope every builder here works in: `u1`'s bank `acme`. */
export const WorldScope = Object.freeze({ user_id: 'u1', banklabel: 'acme' })

/** The stamp of the bank every builder here makes things in, registered at {@link T0}. */
export const WorldBankStamp: GX.BankStamp = Object.freeze({ ...WorldScope, bank_tok: 'bank-tok-u1', registered_at: T0 })

/** The stamp of {@link WorldBankStamp}'s `main` gate, registered at {@link T0}. */
export const WorldGateStamp: GX.GateStamp = Object.freeze({ ...WorldScope, gatelabel: 'main', gate_tok: 'gate-tok-u1', registered_at: T0 })

/** The gate a lease cites when a test says nothing else: {@link WorldGateStamp}'s gate, at a revision of its own. */
export const WorldGate: GX.CitedGate = Object.freeze({ gatelabel: 'main', gate_tok: WorldGateStamp.gate_tok, revision_tok: 'gate-revision-tok-1' })

/** The `vault_tok` a box record still carries in this layer. */
export const WorldVaultTok = 'vault-tok-u1'
// --

// == [Devices]: TestPassphrase, DeviceTok, ProvingDeviceGiven, provingDeviceOf, makeDevice, passkeyAnswerOf

/** An obvious fake passphrase, never a real one. */
export const TestPassphrase = GX.passphraseCleartext.parse('correct horse battery staple')

/** The `device_tok` of every device made here. */
export const DeviceTok = '00000000-0000-4000-8000-00000000000a'

/** What a test may say of a {@link provingDeviceOf} device: the host's own deriver and checker, which it wraps as a device does. */
export interface ProvingDeviceGiven {
  keyDeriver?:      Deriver.KeyDeriver | undefined
  strengthChecker?: Strength.StrengthChecker | undefined
  device_tok?:      string | undefined
}

/** A proving device without a Device: the one-SHA-256 `testDeriver`, a strength checker that passes everything, and {@link DeviceTok}, each wrapped as a device wraps it. */
export function provingDeviceOf({ keyDeriver = testDeriver, strengthChecker = anyStrengthChecker, device_tok = DeviceTok }: ProvingDeviceGiven = {}): GX.ProvingDevice {
  return { keyDeriver: guardKeyDeriver(keyDeriver), strengthChecker: Strength.guardStrengthChecker(strengthChecker), device_tok }
}

/** A Device of {@link WorldScope} and {@link DeviceTok}, with `record` laid over them, over `testDeriver`, a checker that passes everything and a quiet logger, with `opts` laid over those. */
export function makeDevice(record: Partial<DeviceRecord> = {}, opts: Partial<DeviceOpts> = {}): Device {
  return Device.make({ ...WorldScope, device_tok: DeviceTok, ...record }, { keyDeriver: testDeriver, strengthChecker: anyStrengthChecker, logger: quietLogger, ...opts })
}

/** A fresh passkey answer: a fake credential id, a fresh salt of the right length, and 32 random PRF bytes. */
export function passkeyAnswerOf(overrides: Partial<GX.PasskeyAnswer> = {}): GX.PasskeyAnswer {
  return { credential_id: 'cred-test-1', prf_salt_b64: Crypto.toB64(Crypto.randomBytes(Consts.PasskeySaltSize)), prfBytes: Crypto.randomBytes(32), ...overrides }
}

/** A copy of `answer` whose PRF bytes are its own, so that zeroing one leaves the other. */
export function copyOfAnswer(answer: GX.PasskeyAnswer): GX.PasskeyAnswer { return { ...answer, prfBytes: new Uint8Array(answer.prfBytes) } }
// --

// == [A born bank]: BornBankGiven, BornBank, buildBornBank

/** What a test may say of a {@link buildBornBank} bank. */
export interface BornBankGiven {
  /** The passkey answer whose wayin the gate gets beside its passphrase's; none when left out. It is not spent. */
  passkeyClear?: GX.PasskeyAnswer | undefined
  /** The device the bank is on: a {@link makeDevice} device when left out. */
  device?:       Device | undefined
}

/** A bank born under {@link TestPassphrase}, unlocked, beside its device, its record and the passphrase's proving. */
export interface BornBank {
  device:  Device
  bank:    Bank
  record:  ReturnType<typeof Bank.makeRecord>
  proving: PassphraseProving
}

/** A bank of {@link WorldBankStamp}, its main gate of {@link WorldGateStamp}, made as a birth makes it, and unlocked by its passphrase's proving. Nothing is put. */
export async function buildBornBank({ passkeyClear, device = makeDevice() }: BornBankGiven = {}): Promise<BornBank> {
  const proving = await PassphraseProving.buildNovel(WorldBankStamp, WorldGateStamp, TestPassphrase, device)
  const passkeyProving = passkeyClear && await PasskeyProving.buildNovel(WorldBankStamp, WorldGateStamp, passkeyClear, device)
  const main = await proving.buildWayin(NOVEL)
  const passkey0 = await passkeyProving?.buildWayin(proving) ?? null
  const record = Bank.makeRecord({ ...WorldBankStamp, maingate: { ...WorldGateStamp, wayins: { main, passkey0 } } })
  const bank = Bank.make(record, { device })
  await bank.unlockByProving(proving)
  return { device, bank, record, proving }
}
// --

// == [The put seam]: BankPutStub, stubBankPut

/** A spy on `Bank.prototype.put`, beside each bank it was called on and whether that bank was locked then, in call order. */
export interface BankPutStub {
  spy:          MockInstance<Bank['put']>
  banks:        Bank[]
  lockedAtPuts: boolean[]
}

/** Stub `bank.put`, the seam the layer above fills, to answer each put by `answer`: by default, as stored. Vitest restores it before the next test. */
export function stubBankPut(answer: (bank: Bank) => Promise<Bank> = (bank) => Promise.resolve(bank)): BankPutStub {
  const banks: Bank[] = []
  const lockedAtPuts: boolean[] = []
  const spy = vi.spyOn(Bank.prototype, 'put').mockImplementation(function (this: Bank) {
    banks.push(this)
    lockedAtPuts.push(this.isLocked)
    return answer(this)
  })
  return { spy, banks, lockedAtPuts }
}
// --

// == [Boxes]: Whisper, boxAnteOf

/** An obvious fake whisper, never a real one. */
export const Whisper = Object.freeze({ apiKey: 'sk-test-0000' })

/** A box ante in {@link WorldBankStamp}'s bank: the shell of `anthropic_api_key`, a tombstone at the void revision, with a sidecar, as `overrides` changes it. */
export function boxAnteOf(overrides: Partial<BoxAnte> = {}): BoxAnte {
  const shell = BX.shellBoxOf({ ...WorldScope, vaultlabel: 'main', boxlabel: 'anthropic_api_key', bank_tok: WorldBankStamp.bank_tok, vault_tok: WorldVaultTok })
  return { ...shell, sidecar: { account: 'work' }, ...overrides }
}
// --

// == [Leases]: FakeLeaseBank, fakeLeaseBankOf, _cheat_grantedLease

/** A fake of a bank as a lease hears it: its stamp, and a spy for `lock`. */
export type FakeLeaseBank = LeaseBank & { lock: Mock<() => void> }

/** A {@link FakeLeaseBank} of {@link WorldBankStamp}, as `overrides` moves it. */
export function fakeLeaseBankOf(overrides: Partial<GX.BankStamp> = {}): FakeLeaseBank {
  return { stamp: { ...WorldBankStamp, ...overrides }, lock: vi.fn<() => void>() } as unknown as FakeLeaseBank
}

/** A test backdoor: a lease `proving` builds on `bank` citing `gate`, beside the record it was made of, read as `Lease.make` is handed it. No model hands out a lease's record. */
export async function _cheat_grantedLease(proving: Proving, bank: LeaseBank, gate: GX.CitedGate = WorldGate): Promise<{ lease: Lease, record: GX.LeaseRecord }> {
  const make = vi.spyOn(Lease, 'make')
  const lease = await proving.buildLease(bank, gate)
  const [record] = make.mock.calls.at(-1)!
  make.mockRestore()
  return { lease, record: record as GX.LeaseRecord }
}
// --

// == [Bytes]: isZeroed

/** Whether every byte of `bytes` is zero: what a spent passkey answer or refused key bytes are left as. */
export function isZeroed(bytes: Uint8Array): boolean { return bytes.every((byte) => byte === 0) }
// --

// == [Backdoor]: WayinSecret, _cheat_bankKeyBytesOf, _cheat_bankKeyOf

/** What opens a wayin: the passphrase, for a passphrase wayin, or a copy of the PRF bytes, for a passkey wayin. */
export type WayinSecret = { passphrase: string } | { prfBytes: Uint8Array }

/** A test backdoor: the raw bytes of the bankKey `wayin` wraps, opened from outside the models from the secret, the wayin's header and the bank's and gate's stamps.
 * It exists only so a test can show two wayins have one bankKey, or read what a seal is bound to; no model hands out a bankKey.
 * Rejects with WebCrypto's error when the wayin will not open.
 */
export async function _cheat_bankKeyBytesOf(bank: GX.BankStamp, gate: GX.GateStamp, wayin: Wayin, secret: WayinSecret): Promise<Uint8Array> {
  const header = wayin.toJSON()
  const ctx = wayinCtxOf(bank, gate, header)
  async function wayinKeyOf(): Promise<CryptoKey> {
    if ('prfBytes' in secret) { return Crypto.deriveWrappingKey(secret.prfBytes, ctx) }
    if (header.wayinkind !== 'passphrase') { throw new Error('A passphrase opens a passphrase wayin alone.') }
    return Crypto.importWrappingKeyBytes(await testDeriver.deriveKeyBytes(GX.passphraseCleartext.parse(secret.passphrase), Crypto.fromB64(header.salt_b64)))
  }
  const bankKey = await Crypto.unwrapKeyUnder(await wayinKeyOf(), wayin.bank_key_wayin_wrapped, ctx, { extractable: true, usage: ['wrapKey'] })
  return new Uint8Array(await crypto.subtle.exportKey('raw', bankKey))
}

/** A test backdoor: the bankKey of `bank`'s main gate, opened by {@link TestPassphrase}, able to unwrap what a lease sealed. */
export async function _cheat_bankKeyOf(bank: Bank): Promise<CryptoKey> {
  const bankKeyBytes = await _cheat_bankKeyBytesOf(bank.stamp, bank.maingate.stamp, bank.maingate.main, { passphrase: TestPassphrase })
  return crypto.subtle.importKey('raw', bankKeyBytes as BufferSource, 'AES-GCM', false, ['unwrapKey'])
}
// --
