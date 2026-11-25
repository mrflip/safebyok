/** The test world of the lean core's models: fixed stamps, a fake clock, a device over a fast key deriver, passkey answers,
 * a bank born unlocked, a spy on births, a gating with no gate behind it, a box's shell, a fake of the gate a lease is granted to, and the loudly named
 * cheats that unwrap a wayin or read a lease's record from outside.
 *
 * Time. Call {@link useFakeClock} at the top of a test file that reads a time a proving, a lease or a record carries: it
 * installs vitest's fake timers at {@link T0} before each test and puts real ones back after, so the package's clock
 * (`Date.now()`) reads what the test says.
 */

import { type Mock, type MockInstance, afterEach, beforeEach, vi } from 'vitest'
import type { Deriver } from 'safebyok-big/internals'
import { Consts, Crypto, GX, SX } from 'safebyok-big/internals'
import { anyStrengthChecker, quietLogger, testDeriver } from 'safebyok-big/testing'
import { Bank } from '../../src/models/bank'
import type { Box } from '../../src/models/box'
import type { Gate } from '../../src/models/gate'
import { Device } from '../../src/models/device'
import { Gating } from '../../src/models/gating'
import { Lease } from '../../src/models/lease'
import type { Vault } from '../../src/models/vault'
import type { VaultTSQ } from '../../src/minding/vault-tsq'
import { PassphraseProving, type Proving, guardKeyDeriver } from '../../src/models/proving'
import { guardStrengthChecker } from '../../src/helpers/passphrase-strength'
import type { DeviceOpts, DeviceRecord, RootShelf } from '../../src/shapes/shapes-bankish'
import type { LiveOf, ShellOf } from '../../src/shapes/shapes-sealers'
import type { BankRecord, BoxRecord, GateRecord, Wayins } from '../../src/shapes/shapes-thing'
import { type GateRevisionedStamp, type GatingCleartexts, type LeaseGate, type ProvingDevice, type StrengthChecker, GatingChecks } from '../../src/shapes/shapes-gateish'
import type { BankScope, BankStamp, GateStamp, LeaseRecord } from '../../src/shapes/shapes-stamps'
import { Shell, ThingFormat } from '../../src/shapes/shapes-thing'
import { type Wayin, wayinCtxOf } from '../../src/models/wayin'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import type { BirthBankAsk } from '../../src/shapes/shapes-asks'
import type { BirthBankAnswer } from '../../src/shapes/shapes-answers'
import type { VaultDB } from '../../src/storage/vault-db'
import { type Lifetok, type Userid, Lifeseq } from '../../src/shapes/primitives'

// == [Time]: T0, useFakeClock

/** The clock's first reading, in epoch milliseconds: 14 November 2023. The epoch check refuses small numbers. */
export const T0 = 1_700_000_000_000

/** A revtok for a test: a UUID whose last group spells `word` in hex, six bytes at most. */
export function revtokOf(word: string): string {
  const hex = Array.from(new TextEncoder().encode(word), (byte) => byte.toString(16).padStart(2, '0')).join('')
  if (hex.length > 12) { throw new Error('revtokOf spells six bytes at most') }
  return `00000000-0000-4000-8000-${hex.padStart(12, '0')}`
}

/** The revtok of a fixture's first revision. */
export const FirstRevtok = revtokOf('0')

/** The lifetok of a fixture's bank: a UUID, like a revtok, fixed so that tests stay deterministic. */
export const FirstLifetok = revtokOf('life')

/** A lifetok no fixture's bank is born with: another birth's. */
export const OtherLifetok = revtokOf('life2')

/** A revtok no fixture is born with: another writer's revision. */
export const OtherRevtok = revtokOf('other')

/** Vitest's fake timers from {@link T0} before each test, real ones back after it. */
export function useFakeClock(): void {
  beforeEach(() => { vi.useFakeTimers({ now: T0 }) })
  afterEach(() => { vi.useRealTimers() })
}
// --

// == [The stamps]: WorldScope, WorldBankStamp, WorldGateStamp, WorldGate

/** The bank scope every builder here works in: `u1`'s bank `acme`. */
export const WorldScope: BankScope = Object.freeze({ userid: 'u1', banklabel: 'acme' })

/** The stamp of the bank every builder here makes things in: its first life, born at {@link T0} with {@link FirstLifetok}. */
export const WorldBankStamp: BankStamp = Object.freeze({ userid: WorldScope.userid, banklabel: WorldScope.banklabel, lifeseq: Lifeseq.ofLifenum(0), born_at: T0, lifetok: FirstLifetok })

/** The stamp of {@link WorldBankStamp}'s main gate: its first life, born at {@link T0}. */
export const WorldGateStamp: GateStamp = Object.freeze({ ...WorldScope, labelpath: 'gate', lifeseq: Lifeseq.ofLifenum(0), born_at: T0 })

/** The gate a lease cites when a test says nothing else: {@link WorldGateStamp}'s gate, at a revision of its own. */
export const WorldGate: GateRevisionedStamp = Object.freeze({ ...WorldGateStamp, revtok: revtokOf('gate1') })
// --

// == [Devices]: TestPassphrase, DeviceTok, ProvingDeviceGiven, provingDeviceOf, DeviceGiven, makeDevice, MemoryShelf, passkeyAnswerOf

/** An obvious fake passphrase, never a real one. */
export const TestPassphrase = GX.passphraseCleartext.parse('correct horse battery staple')

/** The `device_tok` of every device made here. */
export const DeviceTok = '00000000-0000-4000-8000-00000000000a'

/** The options of a {@link provingDeviceOf} device: the host's own deriver and checker, which it wraps with a device's guards. */
export interface ProvingDeviceGiven {
  keyDeriver?:      Deriver.KeyDeriver | undefined
  strengthChecker?: StrengthChecker | undefined
  device_tok?:      string | undefined
}

/** A proving device without a Device: the one-SHA-256 `testDeriver`, a strength checker that passes everything, and {@link DeviceTok}, each wrapped as a device wraps it. */
export function provingDeviceOf({ keyDeriver = testDeriver, strengthChecker = anyStrengthChecker, device_tok = DeviceTok }: ProvingDeviceGiven = {}): ProvingDevice {
  return { keyDeriver: guardKeyDeriver(keyDeriver), strengthChecker: guardStrengthChecker(strengthChecker), device_tok }
}

/** What a {@link makeDevice} device is made of: its record, and the user it signs in, or null to leave it signed out. */
export type DeviceGiven = Partial<DeviceRecord & { userid: Userid | null }>

/** A Device of {@link WorldScope}'s banklabel and {@link DeviceTok}, signed in as its user, its sign-in under way, with `given` laid over them:
 * over `testDeriver`, a checker that passes everything, a quiet logger and a fresh MemoryVaultDB, with `opts` laid over those.
 * Await `device.signin(device.userid!)` for its bank to come up.
 */
export function makeDevice(given: DeviceGiven = {}, opts: Partial<DeviceOpts> = {}): Device {
  const { userid = WorldScope.userid, ...record } = given
  const device = Device.make({ banklabel: WorldScope.banklabel, device_tok: DeviceTok, ...record }, { keyDeriver: testDeriver, strengthChecker: anyStrengthChecker, logger: quietLogger, vaultDB: new MemoryVaultDB(), ...opts })
  if (userid !== null) { void device.signin(userid) }
  return device
}

/** A root shelf in memory, as `localStorage` is across a page reload: hand one to a device, then to a second over the same vaultDB. */
export class MemoryShelf implements RootShelf {
  /** Each value set, by its key. */
  readonly items = new Map<string, string>()

  /** The value at `ckey`, or null for none. */
  getItem(ckey: string): string | null { return this.items.get(ckey) ?? null }

  /** Set `val` at `ckey`. */
  setItem(ckey: string, val: string): void { this.items.set(ckey, val) }

  /** Remove the value at `ckey`. */
  removeItem(ckey: string): void { this.items.delete(ckey) }
}

/** A fresh passkey answer: a fake credential id, a fresh salt of the right length, and 32 random PRF bytes. */
export function passkeyAnswerOf(overrides: Partial<GX.PasskeyAnswer> = {}): GX.PasskeyAnswer {
  return { credential_id: 'cred-test-1', prf_salt_b64: Crypto.toB64(Crypto.randomBytes(Consts.PasskeySaltSize)), prfBytes: Crypto.randomBytes(32), ...overrides }
}

/** A copy of `answer` whose PRF bytes are its own, so that zeroing one leaves the other. */
export function copyOfAnswer(answer: GX.PasskeyAnswer): GX.PasskeyAnswer { return { ...answer, prfBytes: new Uint8Array(answer.prfBytes) } }
// --

// == [A born bank]: LiveGate, LiveBank, liveGateOf, livePickleOf, BornBankGiven, BornBank, buildBornBank, BornVault, buildBornVault

// The narrowed members come first: TypeScript reads an intersection's methods as overloads, in order.
/** A gate that models a live record: its pickle is whole and its wayins present. */
export type LiveGate = { pickle(): GateRecord, readonly wayins: Wayins } & Gate

/** A bank that models a live record, its main gate too, as a born bank does: its pickle is whole and its lifetok present. */
export type LiveBank = { pickle(): BankRecord, readonly lifetok: Lifetok, readonly gate: LiveGate } & Bank

/** `gate`, narrowed to a {@link LiveGate}. Throws where it models the shell or a tombstone. */
export function liveGateOf(gate: Gate): LiveGate {
  if (! isLiveGate(gate)) { throw new Error(`The gate at ${gate.labelpath} models no live record.`) }
  return gate
}

/** The whole live record `thing` models, narrowed from its pickle. Throws where it models the shell or a tombstone. */
export function livePickleOf(thing: Gate): GateRecord
export function livePickleOf(thing: Bank): BankRecord
export function livePickleOf(thing: Box): LiveOf<BoxRecord>
export function livePickleOf(thing: Gate | Bank | Box): GateRecord | BankRecord | BoxRecord {
  const record = thing.pickle()
  if (record.am !== 'a') { throw new Error(`The Thing at ${thing.labelpath} models no live record.`) }
  return record
}

/** True when `gate` models a live record */
function isLiveGate(gate: Gate): gate is LiveGate { return gate.pickle().am === 'a' }

/** True when `bank` and its main gate model live records */
function isLiveBank(bank: Bank): bank is LiveBank { return (bank.pickle().am === 'a') && isLiveGate(bank.gate) }

/** The options of a {@link buildBornBank} bank. */
export interface BornBankGiven {
  /** The passkey answer whose wayin the gate gets beside its passphrase's; none when left out. It is not vacated. */
  passkeyCleartext?: GX.PasskeyAnswer | undefined
  /** The device the bank is on: a {@link makeDevice} device when left out. */
  device?:       Device | undefined
}

/** A bank born under {@link TestPassphrase}, unlocked, beside its device, the records its birth stored, and the passphrase's proving. */
export interface BornBank {
  device:     Device
  bank:       LiveBank
  /** The bank's Thing, as the birth stored it. */
  record:     BankRecord
  /** The main gate's Thing, as the birth stored it. */
  gateRecord: GateRecord
  proving:    PassphraseProving
}

/** A bank of {@link WorldBankStamp}, its main gate of {@link WorldGateStamp}, born in its device's vaultDB by `Bank.birth` once the device has signed in, and so unlocked.
 * Its proving is a stored proving of the main gate, by {@link TestPassphrase}.
 */
export async function buildBornBank({ passkeyCleartext, device = makeDevice() }: BornBankGiven = {}): Promise<BornBank> {
  await device.signin(device.userid ?? WorldScope.userid)
  const mintStamps = vi.spyOn(Bank, 'mintStamps').mockReturnValue({ bankStamp: WorldBankStamp, gateStamp: WorldGateStamp })
  try {
    const bank = await Bank.birth(device, { passphraseCleartext: TestPassphrase, passkeyCleartext: passkeyCleartext && copyOfAnswer(passkeyCleartext) })
    if (! isLiveBank(bank)) { throw new Error("A born bank or its main gate models no live record.") }
    const proving = await PassphraseProving.buildStored(device, bank.gate, TestPassphrase)
    return { device, bank, record: livePickleOf(bank), gateRecord: livePickleOf(bank.gate), proving }
  } finally {
    mintStamps.mockRestore()
  }
}

/** A {@link buildBornBank} bank, beside the vault of its boxes and its device's vault TSQ. */
export interface BornVault extends BornBank {
  vault:    Vault
  vaultTSQ: VaultTSQ
}

/** A {@link buildBornBank} bank, unlocked, and the vault of its boxes its device made at the birth. */
export async function buildBornVault(given: BornBankGiven = {}): Promise<BornVault> {
  const born = await buildBornBank(given)
  return { ...born, vault: born.device.vault!, vaultTSQ: born.device.vaultTSQ }
}
// --

// == [Births]: BirthSpy, spyBirths

/** The births {@link spyBirths} saw, in call order: each bank `Bank.make` made, which the device's world makes as it first hears of one, and each call to the vaultDB's `tryBirthBank`. */
export interface BirthSpy {
  banks:        Bank[]
  tryBirthBank: MockInstance<VaultDB['tryBirthBank']>
}

/** Spy on each birth on `device`: the banks made, and the device's vaultDB's `tryBirthBank`, which `answer` answers in its place where given. Vitest restores both before the next test. */
export function spyBirths(device: Device, answer?: (ask: BirthBankAsk) => Promise<BirthBankAnswer>): BirthSpy {
  const banks: Bank[] = []
  const make = Bank.make.bind(Bank)
  vi.spyOn(Bank, 'make').mockImplementation((record, opts) => {
    const made = make(record, opts)
    banks.push(made)
    return made
  })
  const { vaultDB } = device
  const tryBirthBank = vaultDB.tryBirthBank.bind(vaultDB)
  const spy = vi.spyOn(vaultDB, 'tryBirthBank').mockImplementation((ask) => (answer ? answer(ask) : tryBirthBank(ask)))
  return { banks, tryBirthBank: spy }
}
// --

// == [Gatings]: _cheat_gatingOf, CheatGating

/** A gating over `cleartexts` whose attempt calls `body` with the cleartexts it adopted, in place of a verb's: a form mutation's test with no gate behind it. */
export function _cheat_gatingOf(cleartexts: unknown, body: (cleartexts: GatingCleartexts) => Promise<unknown>): Gating { return new CheatGating(cleartexts, body) }

/** A gating whose body is any function, made by {@link _cheat_gatingOf}. */
class CheatGating extends Gating {
  constructor(cleartexts: unknown, body: (cleartexts: GatingCleartexts) => Promise<unknown>) { super(cleartexts, GatingChecks.unlockGating, body) }
}
// --

// == [Boxes and shells]: Whisper, Sidecar, boxShellOf, bankShellOf, gateShellOf, VoidRootRevision

/** An obvious fake whisper, never a real one. */
export const Whisper = Object.freeze({ apiKey: 'sk-test-0000' })

/** A box's sidecar, for a seal's `publicProps`. */
export const Sidecar = Object.freeze({ account: 'work' })

/** The shell of the box `anthropic_api_key` in {@link WorldScope}'s bank, under life 0 of the root box, as `overrides` changes it.
 * A shell has no record, so its `born_at` and `written_at` are {@link T0}, and it has no sidecar.
 */
export function boxShellOf(overrides: Partial<ShellOf<BoxRecord>> = {}): ShellOf<BoxRecord> {
  return {
    userid: WorldScope.userid, banklabel: WorldScope.banklabel, labelpath: 'box/anthropic_api_key', label: 'anthropic_api_key', fmt: ThingFormat,
    revtok: SX.VoidRevisionTok, revseq: SX.VoidRevisionSeq, am: 'x', lifeseq: Shell.VoidLifeseq, lifepath: `${Lifeseq.ofLifenum(0)}/${Shell.VoidLifeseq}`,
    born_at: T0, written_at: T0, ...overrides,
  }
}

/** The shell of the bank of {@link WorldScope}: what its Bank models before the bank is born. */
export function bankShellOf(): ShellOf<BankRecord> {
  return { ...WorldScope, labelpath: 'bank', label: 'bank', fmt: ThingFormat, ...VoidRootRevision }
}

/** The shell of the main gate of {@link WorldScope}'s bank: what its Gate models before the bank is born. */
export function gateShellOf(): ShellOf<GateRecord> {
  return { ...WorldScope, labelpath: 'gate', label: 'gate', fmt: ThingFormat, ...VoidRootRevision }
}

/** The fields of a root's shell beside its scope, label and fmt: the void revision, under no life. */
const VoidRootRevision = {
  revtok: SX.VoidRevisionTok, revseq: SX.VoidRevisionSeq, am: 'x', lifeseq: Shell.VoidLifeseq, lifepath: Shell.RootVoidLifepath, born_at: SX.VoidTime, written_at: SX.VoidTime,
} as const
// --

// == [Leases]: FakeLeaseGate, fakeLeaseGateOf, _cheat_grantedLease

/** A fake of the gate a lease is granted to: its bank's stamp, a spy for `lock`, and an enabled check that always passes. */
export type FakeLeaseGate = LeaseGate & { lock: Mock<() => void> }

/** A {@link FakeLeaseGate} whose bank's stamp is {@link WorldBankStamp}, as `overrides` moves it. */
export function fakeLeaseGateOf(overrides: Partial<BankStamp> = {}): FakeLeaseGate {
  const gate = { bankStamp: { ...WorldBankStamp, ...overrides }, lock: vi.fn<() => void>(), isEnabled: true, demandEnabled: () => gate }
  return gate
}

/** A test cheat: a lease `proving` builds, granted to `gate` and citing `cited`, beside the record it was made of, read as `Lease.make` is handed it. No model hands out a lease's record. */
export async function _cheat_grantedLease(proving: Proving, gate: LeaseGate, cited: GateRevisionedStamp = WorldGate): Promise<{ lease: Lease, record: LeaseRecord }> {
  const make = vi.spyOn(Lease, 'make')
  const lease = await proving.buildLease(gate, cited, null)
  const [record] = make.mock.calls.at(-1)!
  make.mockRestore()
  return { lease, record: record as LeaseRecord }
}
// --

// == [Bytes]: isZeroed

/** Whether every byte of `bytes` is zero: what a vacated passkey answer or refused key bytes are left as. */
export function isZeroed(bytes: Uint8Array): boolean { return bytes.every((byte) => byte === 0) }
// --

// == [Subscribers]: countCalls

/** A counter, read as `calls`, of the times a listener handed to `subscribe` is called. */
export function countCalls(subscribe: (listener: () => void) => unknown): { readonly calls: number } {
  const counter = { calls: 0 }
  subscribe(() => { counter.calls += 1 })
  return counter
}
// --

// == [Cheats]: WayinSecret, _cheat_bankKeyBytesOf, _cheat_bankKeyOf

/** The secret that unwraps a wayin: the passphrase, for a passphrase wayin, or a copy of the PRF bytes, for a passkey wayin. */
export type WayinSecret = { passphrase: string } | { prfBytes: Uint8Array }

/** A test cheat: the raw bytes of the bankKey `wayin` wraps, unwrapped from outside the models from the secret, the wayin's header and the bank's and gate's stamps.
 * It exists only so a test can show two wayins have one bankKey, or read what a seal is bound to; no model hands out a bankKey.
 * Rejects with WebCrypto's error when the wayin will not unwrap.
 */
export async function _cheat_bankKeyBytesOf(bankStamp: BankStamp, gateStamp: GateStamp, wayin: Wayin, secret: WayinSecret): Promise<Uint8Array> {
  const header = wayin.toJSON()
  const ctx = wayinCtxOf(bankStamp, gateStamp, header)
  async function wayinKeyOf(): Promise<CryptoKey> {
    if ('prfBytes' in secret) { return Crypto.deriveWrappingKey(secret.prfBytes, ctx) }
    if (header.wayinkind !== 'passphrase') { throw new Error('A passphrase unwraps a passphrase wayin alone.') }
    return Crypto.importWrappingKeyBytes(await testDeriver.deriveKeyBytes(GX.passphraseCleartext.parse(secret.passphrase), Crypto.fromB64(header.salt_b64)))
  }
  const bankKey = await Crypto.unwrapKeyUnder(await wayinKeyOf(), wayin.bank_key_wayin_wrapped, ctx, { extractable: true, usage: ['wrapKey'] })
  return new Uint8Array(await crypto.subtle.exportKey('raw', bankKey))
}

/** A test cheat: the bankKey of `bank`'s main gate, unwrapped by {@link TestPassphrase}, able to unwrap what a lease sealed. */
export async function _cheat_bankKeyOf(bank: Bank): Promise<CryptoKey> {
  const bankKeyBytes = await _cheat_bankKeyBytesOf(bank.stamp, bank.gate.stamp, bank.gate.main, { passphrase: TestPassphrase })
  return crypto.subtle.importKey('raw', bankKeyBytes as BufferSource, 'AES-GCM', false, ['unwrapKey'])
}
// --
