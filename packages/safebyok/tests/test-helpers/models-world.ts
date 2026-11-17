/** The test world of the lean core's models: fixed stamps, a fake clock, a device over a fast key deriver, passkey answers,
 * a bank born unlocked, a spy on births, a box's shell, a fake of the bank a lease hears, and the loudly named
 * backdoors that unwrap a wayin or read a lease's record from outside.
 *
 * Time. Call {@link useFakeClock} at the top of a test file that reads a time a proving, a lease or a record carries: it
 * installs vitest's fake timers at {@link T0} before each test and puts real ones back after, so the package's clock
 * (`Date.now()`) reads what the test says.
 */

import { type Mock, type MockInstance, afterEach, beforeEach, vi } from 'vitest'
import type { Deriver } from 'safebyok-big/internals'
import { Consts, Crypto, GX, SX, Strength } from 'safebyok-big/internals'
import { anyStrengthChecker, quietLogger, testDeriver } from 'safebyok-big/testing'
import { Bank } from '../../src/models/bank'
import { Device, type DeviceOpts, type DeviceRecord } from '../../src/models/device'
import { Lease, type LeaseBank } from '../../src/models/lease'
import { NOVEL, PasskeyProving, PassphraseProving, type Proving, guardKeyDeriver } from '../../src/models/proving'
import type { BoxRecord, BoxSparse } from '../../src/models/sealers'
import type { BankStamp, CitedGate, GateStamp, LeaseRecord } from '../../src/models/stamps'
import { BoxThingFormat, ShellLifeseq, lifeseqOfLifenum } from '../../src/storage/shapes-thing'
import { type Wayin, wayinCtxOf } from '../../src/models/wayin'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import type { BirthBankAsk } from '../../src/storage/shapes-thing'
import type { BirthBankAnswer, VaultDB } from '../../src/storage/vault-db'

// == [Time]: T0, useFakeClock

/** The clock's first reading, in epoch milliseconds: 14 November 2023. The epoch check refuses small numbers. */
export const T0 = 1_700_000_000_000

/** Vitest's fake timers from {@link T0} before each test, real ones back after it. */
export function useFakeClock(): void {
  beforeEach(() => { vi.useFakeTimers({ now: T0 }) })
  afterEach(() => { vi.useRealTimers() })
}
// --

// == [The stamps]: WorldScope, WorldBankStamp, WorldGateStamp, WorldGate

/** The bank scope every builder here works in: `u1`'s bank `acme`. */
export const WorldScope = Object.freeze({ user_id: 'u1', banklabel: 'acme' })

/** The stamp of the bank every builder here makes things in: its first life, born at {@link T0}. */
export const WorldBankStamp: BankStamp = Object.freeze({ userid: WorldScope.user_id, banklabel: WorldScope.banklabel, lifeseq: lifeseqOfLifenum(0), born_at: T0 })

/** The stamp of {@link WorldBankStamp}'s main gate: its first life, born at {@link T0}. */
export const WorldGateStamp: GateStamp = Object.freeze({ ...WorldBankStamp, labelpath: 'gate' })

/** The gate a lease cites when a test says nothing else: {@link WorldGateStamp}'s gate, at a revision of its own. */
export const WorldGate: CitedGate = Object.freeze({ ...WorldGateStamp, revtok: 'gate-revision-tok-1' })
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

/** A Device of {@link WorldScope} and {@link DeviceTok}, with `record` laid over them, over `testDeriver`, a checker that passes everything, a quiet logger and a fresh MemoryVaultDB, with `opts` laid over those. */
export function makeDevice(record: Partial<DeviceRecord> = {}, opts: Partial<DeviceOpts> = {}): Device {
  return Device.make({ ...WorldScope, device_tok: DeviceTok, ...record }, { keyDeriver: testDeriver, strengthChecker: anyStrengthChecker, logger: quietLogger, vaultDB: new MemoryVaultDB(), ...opts })
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
  passkeyCleartext?: GX.PasskeyAnswer | undefined
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

/** A bank of {@link WorldBankStamp}, its main gate of {@link WorldGateStamp}, born in its device's vaultDB as a birth makes it, and so unlocked by its passphrase's proving. */
export async function buildBornBank({ passkeyCleartext, device = makeDevice() }: BornBankGiven = {}): Promise<BornBank> {
  const proving = await PassphraseProving.buildNovel(device, WorldBankStamp, WorldGateStamp, TestPassphrase)
  const passkeyProving = passkeyCleartext && await PasskeyProving.buildNovel(device, WorldBankStamp, WorldGateStamp, passkeyCleartext)
  const main = await proving.buildWayin(NOVEL)
  const passkey0 = await passkeyProving?.buildWayin(proving) ?? null
  const record = Bank.makeRecord({ ...WorldBankStamp, maingate: { ...WorldGateStamp, wayins: { main, passkey0 } } })
  const bank = await Bank.birth(record, { device, vaultDB: device.vaultDB, proving })
  return { device, bank, record, proving }
}
// --

// == [Births]: BirthSpy, spyBirths

/** What {@link spyBirths} saw, in call order: each bank `Bank.make` made, and whether the bank was locked as its birth reached the vaultDB. */
export interface BirthSpy {
  banks:          Bank[]
  tryBirthBank:   MockInstance<VaultDB['tryBirthBank']>
  lockedAtBirths: boolean[]
}

/** Spy on each birth on `device`: the banks made, and the device's vaultDB's `tryBirthBank`, which `answer` answers in its place where given. Vitest restores both before the next test. */
export function spyBirths(device: Device, answer?: (ask: BirthBankAsk) => Promise<BirthBankAnswer>): BirthSpy {
  const banks: Bank[] = []
  const lockedAtBirths: boolean[] = []
  const make = Bank.make.bind(Bank)
  vi.spyOn(Bank, 'make').mockImplementation((record, opts) => {
    const made = make(record, opts)
    banks.push(made)
    return made
  })
  const { vaultDB } = device
  const tryBirthBank = vaultDB.tryBirthBank.bind(vaultDB)
  const spy = vi.spyOn(vaultDB, 'tryBirthBank').mockImplementation((ask) => {
    lockedAtBirths.push(banks.at(-1)!.isLocked)
    return answer ? answer(ask) : tryBirthBank(ask)
  })
  return { banks, tryBirthBank: spy, lockedAtBirths }
}
// --

// == [Boxes]: Whisper, BoxShell, boxShellOf

/** An obvious fake whisper, never a real one. */
export const Whisper = Object.freeze({ apiKey: 'sk-test-0000' })

/** What a box's first seal starts from: the shell's Thing fields, with the sidecar to put. */
export type BoxShell = BoxSparse & Pick<BoxRecord, 'sidecar'>

/** The shell of the box `anthropic_api_key` in {@link WorldScope}'s bank, under life 0 of the root box, with a sidecar, as `overrides` changes it.
 * A shell has no record, so its `born_at` and `written_at` are {@link T0}.
 */
export function boxShellOf(overrides: Partial<BoxShell> = {}): BoxShell {
  return {
    userid: WorldScope.user_id, banklabel: WorldScope.banklabel, labelpath: 'box/anthropic_api_key', label: 'anthropic_api_key', fmt: BoxThingFormat,
    revtok: SX.VoidRevisionTok, revseq: SX.VoidRevisionSeq, am: 'x', lifeseq: ShellLifeseq, lifepath: `${lifeseqOfLifenum(0)}/${ShellLifeseq}`,
    born_at: T0, written_at: T0, sidecar: { account: 'work' }, ...overrides,
  }
}
// --

// == [Leases]: FakeLeaseBank, fakeLeaseBankOf, _cheat_grantedLease

/** A fake of a bank as a lease hears it: its stamp, a spy for `lock`, and an enabled check that always passes. */
export type FakeLeaseBank = LeaseBank & { lock: Mock<() => void> }

/** A {@link FakeLeaseBank} of {@link WorldBankStamp}, as `overrides` moves it. */
export function fakeLeaseBankOf(overrides: Partial<BankStamp> = {}): FakeLeaseBank {
  const bank = { stamp: { ...WorldBankStamp, ...overrides }, lock: vi.fn<() => void>(), isEnabled: true, demandEnabled: () => bank }
  return bank as unknown as FakeLeaseBank
}

/** A test backdoor: a lease `proving` builds on `bank` citing `gate`, beside the record it was made of, read as `Lease.make` is handed it. No model hands out a lease's record. */
export async function _cheat_grantedLease(proving: Proving, bank: LeaseBank, gate: CitedGate = WorldGate): Promise<{ lease: Lease, record: LeaseRecord }> {
  const make = vi.spyOn(Lease, 'make')
  const lease = await proving.buildLease(bank, gate)
  const [record] = make.mock.calls.at(-1)!
  make.mockRestore()
  return { lease, record: record as LeaseRecord }
}
// --

// == [Bytes]: isZeroed

/** Whether every byte of `bytes` is zero: what a spent passkey answer or refused key bytes are left as. */
export function isZeroed(bytes: Uint8Array): boolean { return bytes.every((byte) => byte === 0) }
// --

// == [Backdoor]: WayinSecret, _cheat_bankKeyBytesOf, _cheat_bankKeyOf

/** What unwraps a wayin: the passphrase, for a passphrase wayin, or a copy of the PRF bytes, for a passkey wayin. */
export type WayinSecret = { passphrase: string } | { prfBytes: Uint8Array }

/** A test backdoor: the raw bytes of the bankKey `wayin` wraps, unwrapped from outside the models from the secret, the wayin's header and the bank's and gate's stamps.
 * It exists only so a test can show two wayins have one bankKey, or read what a seal is bound to; no model hands out a bankKey.
 * Rejects with WebCrypto's error when the wayin will not unwrap.
 */
export async function _cheat_bankKeyBytesOf(bank: BankStamp, gate: GateStamp, wayin: Wayin, secret: WayinSecret): Promise<Uint8Array> {
  const header = wayin.toJSON()
  const ctx = wayinCtxOf(bank, gate, header)
  async function wayinKeyOf(): Promise<CryptoKey> {
    if ('prfBytes' in secret) { return Crypto.deriveWrappingKey(secret.prfBytes, ctx) }
    if (header.wayinkind !== 'passphrase') { throw new Error('A passphrase unwraps a passphrase wayin alone.') }
    return Crypto.importWrappingKeyBytes(await testDeriver.deriveKeyBytes(GX.passphraseCleartext.parse(secret.passphrase), Crypto.fromB64(header.salt_b64)))
  }
  const bankKey = await Crypto.unwrapKeyUnder(await wayinKeyOf(), wayin.bank_key_wayin_wrapped, ctx, { extractable: true, usage: ['wrapKey'] })
  return new Uint8Array(await crypto.subtle.exportKey('raw', bankKey))
}

/** A test backdoor: the bankKey of `bank`'s main gate, unwrapped by {@link TestPassphrase}, able to unwrap what a lease sealed. */
export async function _cheat_bankKeyOf(bank: Bank): Promise<CryptoKey> {
  const bankKeyBytes = await _cheat_bankKeyBytesOf(bank.stamp, bank.maingate.stamp, bank.maingate.main, { passphrase: TestPassphrase })
  return crypto.subtle.importKey('raw', bankKeyBytes as BufferSource, 'AES-GCM', false, ['unwrapKey'])
}
// --
