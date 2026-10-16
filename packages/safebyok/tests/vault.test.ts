import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import * as ZClassic from 'zod'
import * as Z from 'zod/mini'
import { Lockbox } from '../src/lockbox'
import { LeaseHours, FarFuture, FarPast, ForeverMillis, MaxLeaseHours, MinuteMillis, MaxLockboxes, MaxUnlocks, MaxWhisperBytes, VaultScope, type DeviceMark, type Sidecar, type Lease, type VaultProps, type PasskeyProof, type Whisper } from '../src/types'
import { AnyTextValidators, MaxUserIdChars, NameFloorBytes } from '../src/validators'
import { VaultError, isVaultError } from '../src/errors'
import { memoryDeviceDB, type DeviceDB } from '../src/device-db'
import { jsonBytes, localVaultDB, type VaultDB } from '../src/vault-db'
import { memoryStore } from '../src/string-store'
import { LockboxFieldsBytes, LockboxFixedBytes, StoredBytesPerWhisperByte, deviceTroubleAsConditions, retireDamagedVault, Vault, type MakeVaultOpts } from '../src/vault'
import { cipherCtx, cipherBytes, fromB64, makeLockboxKey, makeVaultKey, randomBytes, toB64, wrapKeyUnder } from '../src/crypto'
import { Argon2idKeyDeriver, type KeyDeriver } from '../src/key-deriver'
import { DefaultLogger, setDefaultLogger, type VaultLogger } from '../src/logger'
import { Argon2idWebV1, MaxSaltBytes, TestDeriverNotice } from '../src/key-deriver-spec'
import * as Ckeys from '../src/ckeys'
import type { PassphraseStrengthTest, PassphraseVerdict } from '../src/passphrase-strength'
import { zxcvbnPassphraseTest } from '../src/zxcvbn-passphrase-test'
import * as TH from './test-helpers'


/** Where the vault each world opens, `u1`'s `main`, files its props and each of its lockboxes. */
const u1VaultPropsCkey = Ckeys.vaultProps(TH.scopeOf('u1'))
const u1BoxCkey = (boxlabel: string) => Ckeys.box(TH.scopeOf('u1'), boxlabel)
const isU1Box = Ckeys.isBoxIn(TH.scopeOf('u1'))

/** An unsubscribe with nothing to undo. */
const silence = (): void => undefined
/** A store's subscribe that never rings. */
const neverRings = () => silence

/**
 * A fresh in-memory world: the store behind the vaultDB, both adapters, a steerable clock, a
 * logger that keeps what it hears, the options a vault opens with (`defaults` among them), an
 * opener, one that unlocks what it opens, the state a vault opened now settles into, the
 * lease this device keeps for `u1`, and a second vaultDB over the same store that hears no
 * change bells, for a device that does not notice another's doings. Unlocks
 * derive through the cheap testDeriver, so the suite is not a benchmark of Argon2id; the real
 * deriver has its own tests in key-deriver.test.ts.
 */
const makeWorld = (defaults?: Partial<MakeVaultOpts>) => {
  const dbStore = memoryStore()
  const vaultDB = localVaultDB({ store: dbStore })
  const deviceDB = memoryDeviceDB()
  let nowMillis = Date.parse('2026-10-14T12:00:00Z')
  const clock = { now: () => nowMillis }
  const advance = (byMillis: number) => { nowMillis += byMillis }
  const { logger, calls: logged } = TH.spyLogger()
  const optsWith = (overrides?: Partial<MakeVaultOpts>): MakeVaultOpts => (
    { applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB, deviceDB, clock, keyDeriver: TH.testDeriver, passphraseStrengthTest: TH.anyPassphraseTest, logger, ...defaults, ...overrides }
  )
  const open = (overrides?: Partial<MakeVaultOpts>) => TH.settledVault(optsWith(overrides))
  const openUnlocked = async (passphrase: string, overrides?: Partial<MakeVaultOpts>) => {
    const vault = await open(overrides)
    await vault.unlock(passphrase)
    return vault
  }
  const readLease = () => deviceDB.readLease(TH.scopeOf('u1'))
  const deafVaultDB = () => localVaultDB({ store: { ...dbStore, subscribe: neverRings } })
  const stateOnOpen = async (overrides?: Partial<MakeVaultOpts>) => {
    const vault = await open(overrides)
    return vault.getSnapshot().state
  }
  return { dbStore, vaultDB, deviceDB, clock, advance, logged, optsWith, open, openUnlocked, readLease, stateOnOpen, deafVaultDB }
}

/** Boxlabels in the snapshot, in order. */
const boxlabelsOf = (vault: Vault) => vault.getSnapshot().boxes.map((summary) => summary.boxlabel)

/** Storage adapters Vault.make refuses: short of a verb the vault calls. */
const MisfitStores: readonly (readonly [Partial<MakeVaultOpts>, string])[] = [
  [{ vaultDB: { readVaultProps: () => Promise.resolve(null) } as unknown as MakeVaultOpts['vaultDB'] }, 'a vaultDB with only some of its verbs'],
  [{ deviceDB: { ...memoryDeviceDB(), eraseAll: 'never' } as unknown as MakeVaultOpts['deviceDB'] }, 'a deviceDB whose eraseAll is no function'],
  [{ deviceDB: TH.omitting(memoryDeviceDB(), 'readMark') }, 'a deviceDB that keeps no device mark'],
]

const HourMillis = 60 * 60 * 1000
const SevenDaysMillis = 7 * 24 * HourMillis

/** Lease deadlines outside EpochMillis's bounds, each a unit mistake or an older reading of "far". */
const OutOfBoundsDeadlines = [
  [FarFuture + 1,                                       'one millisecond past FarFuture'],
  [8.64e15,                                             'the last instant a Date holds'],
  [1e300,                                               'a huge finite number'],
  [1_792_022_400_000_000,                               'epoch microseconds'],
  [1_792_022_400,                                       'epoch seconds'],
  [FarPast - 1,                                         'one millisecond before 1981'],
  [Infinity,                                            'a deadline that never comes'],
  [Date.parse('2026-10-14T12:00:00Z') + (1e9 * HourMillis), 'what 0.2.0 wrote for a window of 1e9 hours'],
] as const

describe("Vault.make", () => {
  it("settles into 'absent' against an empty backend, prompting nobody", async () => {
    const world = makeWorld()
    const vault = await world.open()
    expect(vault.getSnapshot().state).to.eq('absent')
    expect(vault.getSnapshot().boxes).to.have.lengthOf(0)
  })

  it("refuses a hyphenated applabel or vaultlabel at the door", async () => {
    const world = makeWorld()
    await TH.expectRefusal(world.open({ applabel: 'not-a-label' }), 'bad_label')
    await TH.expectRefusal(world.open({ vaultlabel: 'not-a-label' }), 'bad_label')
  })

  it("refuses to open without a signed-in user", async () => {
    const world = makeWorld()
    await TH.expectRefusal(world.open({ userId: '' }), 'bad_label')
  })

  it("takes a userId of a hundred characters, and refuses a longer one, naming the bound and never the id", async () => {
    const world = makeWorld()
    expect(await world.stateOnOpen({ userId: 'u'.repeat(MaxUserIdChars) })).to.eq('absent')
    const overlong = `alice@example.com${'u'.repeat(MaxUserIdChars)}`
    const err = await TH.expectRefusal(world.open({ userId: overlong }), 'bad_label')
    expect(err.message).to.include('at most 100 characters')
    expect(TH.thrownText(err)).to.not.include('alice')
  })

  it("refuses a userId that is not text, as no signed-in user", async () => {
    const world = makeWorld()
    for (const userId of [42, null, undefined, { id: 'u1' }]) {
      await TH.expectRefusal(world.open({ userId: userId as unknown as string }), 'bad_label')
    }
  })

  it("refuses a call with no bag of options at all", async () => {
    for (const opts of [undefined, null, 'acme']) {
      await TH.expectRefusal(TH.settledVault(opts as unknown as MakeVaultOpts), 'bad_option')
    }
  })

  for (const ckey of ['vaultDB', 'deviceDB'] as const) {
    it(`refuses a missing ${ckey} with kind 'bad_option'`, async () => {
      const opts = TH.omitting(makeWorld().optsWith(), ckey)
      const err = await TH.expectRefusal(TH.settledVault(opts), 'bad_option')
      expect(err.message).to.include(`${ckey} is not a`)
    })
  }

  for (const [opts, blurb] of MisfitStores) {
    it(`refuses ${blurb} with kind 'bad_option', before it touches storage`, async () => {
      const world = makeWorld()
      const err = await TH.expectRefusal(world.open(opts), 'bad_option')
      expect(err.message).to.match(/vaultDB is not a VaultDB|deviceDB is not a DeviceDB/)
    })
  }

  it("refuses a vaultDB that carries every verb but is no VaultDB, whose checks it would skip", async () => {
    const world = makeWorld()
    const verbs = Object.fromEntries(VaultDBVerbsUsed.map((verb) => [verb, world.vaultDB[verb].bind(world.vaultDB)]))
    const lookalike = { maxRecordBytes: 1024 * 1024, maxVaultBytes: Infinity, maxLockboxes: Infinity, retireDamagedVault: () => Promise.resolve(), ...verbs }
    const err = await TH.expectRefusal(world.open({ vaultDB: lookalike as unknown as MakeVaultOpts['vaultDB'] }), 'bad_option')
    expect(err.message).to.include('extends the VaultDB class')
  })

  it("says stored vault props refused as corrupt as damaged_vault, even from an adapter that throws before its promise", async () => {
    const world = makeWorld()
    const corrupt = new VaultError('corrupt_record', 'The stored vault props did not read back.')
    vi.spyOn(world.vaultDB, 'readVaultProps').mockImplementationOnce(() => { throw corrupt })
    const err = await TH.expectRefusal(world.open(), 'damaged_vault')
    expect(err.cause).to.eq(corrupt)
    vi.restoreAllMocks()
  })

  it("takes a store of the host's own that carries every verb, prototype and all", async () => {
    const world = makeWorld()
    expect(await world.stateOnOpen({ vaultDB: Object.create(world.vaultDB) as MakeVaultOpts['vaultDB'], deviceDB: uncheckingDeviceDB().deviceDB })).to.eq('absent')
  })
})

describe("Vault.make's options", () => {
  it("makes the handle at once, still opening, before storage has answered", () => {
    const world = makeWorld()
    const vault = Vault.make(world.optsWith())
    expect(vault.getSnapshot()).to.deep.include({ state: 'opening', trouble: null, syncing: true })
  })

  it("makes a handle that settles once its hello is awaited, as its first two examples, and the Vault's own, show", async () => {
    const { vaultDB, deviceDB } = makeWorld()
    const vault = Vault.make({ applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB, deviceDB, keyDeriver: TH.testDeriver, passphraseStrengthTest: TH.anyPassphraseTest })
    await vault.hello()
    expect(vault.getSnapshot().state).to.eq('absent')
  })

  it("throws misuse at once, never as a rejection: a bad label, a missing store", () => {
    const world = makeWorld()
    TH.expectSyncRefusal(() => Vault.make(world.optsWith({ applabel: 'not-a-label' })), 'bad_label')
    TH.expectSyncRefusal(() => Vault.make(TH.omitting(world.optsWith(), 'vaultDB')), 'bad_option')
  })

  it("refuses an option it does not take as 'bad_option', naming it, before storage is touched", () => {
    const world = makeWorld()
    const readVaultProps = vi.spyOn(world.vaultDB, 'readVaultProps')
    const err = TH.expectSyncRefusal(() => Vault.make({ ...world.optsWith(), leaseHour: 1 } as MakeVaultOpts), 'bad_option')
    expect(err.message).to.match(/does not take the option leaseHour: check the spelling/)
    expect(err.message).to.include('leaseHours')
    expect(readVaultProps).not.toHaveBeenCalled()
  })

  it("refuses forcePassphraseReentryHours, naming leaseHours, as its third example shows", () => {
    const world = makeWorld()
    const err = TH.expectSyncRefusal(() => Vault.make({ ...world.optsWith(), forcePassphraseReentryHours: 1 } as MakeVaultOpts), 'bad_option')
    expect(err.message).to.include('forcePassphraseReentryHours (called leaseHours now)')
  })

  it("names every option it refuses, and never quotes a value", () => {
    const world = makeWorld()
    const err = TH.expectSyncRefusal(() => Vault.make({ ...world.optsWith(), note: 'FAKESECRET', colour: 'FAKESECRET' } as MakeVaultOpts), 'bad_option')
    expect(err.message).to.match(/the options note, colour:/)
    expect(TH.thrownText(err)).to.not.include('FAKESECRET')
  })

  it("takes an option given as undefined as one left out", async () => {
    const world = makeWorld()
    const vault = Vault.make(world.optsWith({ leaseHours: undefined, clock: undefined, logger: undefined }))
    await vault.hello()
    expect(vault.leaseMillis).to.eq(LeaseHours * HourMillis)
  })
})

describe("hello", () => {
  it("settles the snapshot into absent, locked or unlocked, as its first example shows", async () => {
    const world = makeWorld()
    const fresh = Vault.make(world.optsWith())
    await fresh.hello()
    expect(fresh.getSnapshot().state).to.eq('absent')
    await seedVault(world)
    const leased = Vault.make(world.optsWith())
    await leased.hello()
    expect(leased.getSnapshot().state).to.eq('unlocked')
    await leased.lock()
    const locked = Vault.make(world.optsWith())
    await locked.hello()
    expect(locked.getSnapshot().state).to.eq('locked')
  })

  it("is started by make and shared: make's hello and every call while it runs are one promise, and one read", async () => {
    const world = makeWorld()
    const reads = vi.spyOn(world.vaultDB, 'readVaultProps')
    const vault = Vault.make(world.optsWith())
    const first = vault.hello()
    expect(vault.hello()).to.eq(first)
    await first
    expect(reads).toHaveBeenCalledTimes(1)
  })

  it("has a call made before storage answered wait for it, then run as on a settled vault", async () => {
    const world = makeWorld()
    await seedVault(world)
    const gate = TH.holdNextCall(world.vaultDB, 'readVaultProps')
    const vault = Vault.make(world.optsWith())
    await gate.reached
    const reading = vault.readBox('anthropic')
    expect(vault.getSnapshot().state).to.eq('opening')
    gate.release()
    expect(await reading).to.eq('sk-fake')
  })

  it("is a no-op once settled: a later hello reads nothing", async () => {
    const world = makeWorld()
    const vault = await world.open()
    const reads = vi.spyOn(world.vaultDB, 'readVaultProps')
    const before = vault.getSnapshot()
    await vault.hello()
    expect(reads).not.toHaveBeenCalled()
    expect(vault.getSnapshot()).to.eq(before)
  })

  it("forgets a hello refused at once: the next reads afresh, and clears the trouble once it succeeds", async () => {
    const world = makeWorld()
    vi.spyOn(world.vaultDB, 'readVaultProps').mockRejectedValueOnce(new VaultError('storage_unavailable', 'The vault storage could not be reached.'))
    const vault = Vault.make(world.optsWith())
    await TH.expectRefusal(vault.hello(), 'storage_unavailable')
    await vault.hello()
    expect(vault.getSnapshot()).to.deep.include({ state: 'absent', syncing: true, trouble: null })
  })

  it("shows why a vault is still opening, beside a retry that says hello again, as the trouble's example shows", async () => {
    const world = makeWorld()
    vi.spyOn(world.vaultDB, 'readVaultProps').mockRejectedValueOnce(new VaultError('storage_unavailable', 'The vault storage could not be reached.'))
    const vault = Vault.make(world.optsWith())
    await TH.wakeupAtNextTick()
    const { state, trouble } = vault.getSnapshot()
    expect(state).to.eq('opening')
    expect(trouble?.kind).to.eq('storage_unavailable')
    await vault.hello()
    expect(vault.getSnapshot()).to.deep.include({ state: 'absent', trouble: null })
  })

  it("has any other call try again first, once a hello was refused", async () => {
    const world = makeWorld()
    vi.spyOn(world.vaultDB, 'readVaultProps').mockRejectedValueOnce(new VaultError('storage_unavailable', 'The vault storage could not be reached.'))
    const vault = Vault.make(world.optsWith())
    await TH.wakeupAtNextTick()
    await vault.unlock('pw')
    expect(vault.getSnapshot()).to.deep.include({ state: 'unlocked', trouble: null })
  })

  it("refuses a call as the hello it waited for was refused", async () => {
    const world = makeWorld()
    const refusal = new VaultError('not_permitted', 'Sign in to reach this vault.')
    vi.spyOn(world.vaultDB, 'readVaultProps').mockRejectedValue(refusal)
    const vault = Vault.make(world.optsWith())
    expect(await TH.expectRefusal(vault.storeBox('anthropic', 'sk-fake'), 'not_permitted')).to.eq(refusal)
    expect(await TH.expectRefusal(vault.retire(), 'not_permitted')).to.eq(refusal)
  })

  it("clears a damaged vault and says hello again on the same handle, as its second example shows, and retireDamagedVault's", async () => {
    const world = await damagedVaultWorld()
    const vault = Vault.make(world.optsWith())
    try { await vault.hello() } catch (err) {
      if (isVaultError(err, 'damaged_vault')) { await retireDamagedVault(world.optsWith()); await vault.hello() }
    }
    expect(vault.getSnapshot()).to.deep.include({ state: 'absent', trouble: null })
  })

  it("reads afresh once a background refresh has failed, saying so as its trouble until a read succeeds", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const trouble = new VaultError('storage_unavailable', 'The vault storage could not be reached.')
    const reads = vi.spyOn(world.vaultDB, 'readVaultProps')
    reads.mockRejectedValueOnce(trouble)
    world.dbStore.write('elsewhere', '{}')
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot()).to.deep.include({ state: 'unlocked', syncing: false, trouble })
    const readsBefore = reads.mock.calls.length
    await vault.hello()
    expect(reads.mock.calls.length).to.eq(readsBefore + 1)
    expect(vault.getSnapshot()).to.deep.include({ state: 'unlocked', syncing: true, trouble: null })
  })

  it("reads afresh once a refresh inside a call has failed", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.lock()
    const reads = vi.spyOn(world.vaultDB, 'readVaultProps')
    reads.mockRejectedValueOnce(new VaultError('storage_unavailable', 'The vault storage could not be reached.'))
    await TH.expectRefusal(vault.unlock('pw'), 'storage_unavailable')
    expect(vault.getSnapshot()).to.deep.include({ state: 'locked', syncing: false })
    expect(vault.getSnapshot().trouble?.kind).to.eq('storage_unavailable')
    const readsBefore = reads.mock.calls.length
    await vault.hello()
    expect(reads.mock.calls.length).to.eq(readsBefore + 1)
    expect(vault.getSnapshot().trouble).to.be.null
  })

  const UntrustedWriteCases = [
    ["identity_revoked",   'storage no longer serving the user'],
    ["rolled_back",        'storage saying the vault went back'],
    ["newer_format",       'storage holding the vault in a newer form'],
  ] as const

  for (const [kind, blurb] of UntrustedWriteCases) {
    it(`reads afresh once a write is refused as '${kind}': ${blurb}`, async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw')
      vi.spyOn(world.vaultDB, 'updateBox').mockRejectedValueOnce(new VaultError(kind, 'Storage cannot be trusted as it stands.'))
      await TH.expectRefusal(vault.storeBox('anthropic', 'sk-fake'), kind)
      const reads = vi.spyOn(world.vaultDB, 'readVaultProps')
      await vault.hello()
      expect(reads).toHaveBeenCalledTimes(1)
    })
  }

  it("reads afresh once the vault is retired", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.retire()
    const reads = vi.spyOn(world.vaultDB, 'readVaultProps')
    await vault.hello()
    expect(reads).toHaveBeenCalledTimes(1)
    expect(vault.getSnapshot().state).to.eq('absent')
  })

  it("reads nothing anew after a lock, a lockSoon or a stale write caught up with", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake')
    vi.spyOn(world.vaultDB, 'updateBox').mockRejectedValueOnce(new VaultError('stale_write', 'Someone else wrote first.'))
    await TH.expectRefusal(vault.storeBox('anthropic', 'sk-other'), 'stale_write')
    await vault.lockSoon()
    await vault.lock()
    const reads = vi.spyOn(world.vaultDB, 'readVaultProps')
    await vault.hello()
    expect(reads).not.toHaveBeenCalled()
  })

  it("refuses with kind 'vault_closed' after close(), as every later call does", async () => {
    const world = makeWorld()
    const vault = await world.open()
    vault.close()
    await TH.expectRefusal(vault.hello(), 'vault_closed')
    await TH.expectRefusal(vault.readBox('anthropic'), 'vault_closed')
  })

  it("never takes the state back to opening: a locked vault whose read fails stays locked, saying why", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.lock()
    vi.spyOn(world.vaultDB, 'readVaultProps').mockRejectedValueOnce(new VaultError('storage_unavailable', 'The vault storage could not be reached.'))
    world.dbStore.write('elsewhere', '{}')
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(vault.getSnapshot().trouble?.kind).to.eq('storage_unavailable')
  })

  it("keeps the snapshot's identity while nothing changes, and tells two refusals of one kind apart", async () => {
    const world = makeWorld()
    const vault = await world.open()
    const reads = vi.spyOn(world.vaultDB, 'readVaultProps')
    const first = new VaultError('storage_unavailable', 'The vault storage could not be reached.')
    const second = new VaultError('storage_unavailable', 'The vault storage could not be reached.')
    reads.mockRejectedValueOnce(first).mockRejectedValueOnce(second)
    await TH.expectRefusal(vault.unlock('pw'), 'storage_unavailable')
    const once = vault.getSnapshot()
    expect(once.trouble).to.eq(first)
    await TH.expectRefusal(vault.hello(), 'storage_unavailable')
    expect(vault.getSnapshot()).to.not.eq(once)
    expect(vault.getSnapshot().trouble).to.eq(second)
    await vault.hello()
    const settled = vault.getSnapshot()
    await vault.hello()
    expect(vault.getSnapshot()).to.eq(settled)
  })

  const LockThatKeptItsLeaseCases = [
    ["lock()",                       async (vault: Vault) => { await TH.expectRefusal(vault.lock(), 'storage_unavailable') }],
    ["lockSoon()",                   async (vault: Vault) => { await TH.expectRefusal(vault.lockSoon(), 'storage_unavailable') }],
    ["a lock for untrusted storage", async (vault: Vault, world: ReturnType<typeof makeWorld>) => {
      vi.spyOn(world.vaultDB, 'readBox').mockRejectedValueOnce(new VaultError('identity_revoked', 'Signed out.'))
      await TH.expectRefusal(vault.readBox('anthropic'), 'identity_revoked')
    }],
  ] as const

  for (const [blurb, lockIt] of LockThatKeptItsLeaseCases) {
    it(`takes up no lease after ${blurb} could not erase it, though a failed read has it say hello afresh: a page load may, this handle never`, async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw')
      await vault.storeBox('anthropic', 'sk-fake')
      vi.spyOn(world.deviceDB, 'eraseLease').mockRejectedValueOnce(new Error('the device store is read-only'))
      await lockIt(vault, world)
      expect(vault.getSnapshot().state).to.eq('locked')
      expect(await world.readLease()).to.not.be.null
      vi.spyOn(world.vaultDB, 'readVaultProps').mockRejectedValueOnce(new VaultError('storage_unavailable', 'The vault storage could not be reached.'))
      world.dbStore.write('elsewhere', '{}')
      await TH.wakeupAtNextTick()
      await TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
      expect(vault.getSnapshot()).to.deep.include({ state: 'locked', trouble: null })
      expect(await world.stateOnOpen()).to.eq('unlocked')
    })
  }

  it("lets lock() win at once, waiting for no hello: storage unreachable, and the lease being read is not taken up", async () => {
    const world = makeWorld()
    await seedVault(world)
    const gate = TH.holdNextCall(world.deviceDB, 'readLease')
    const vault = Vault.make(world.optsWith())
    await gate.reached
    await vault.lock()
    gate.release()
    await vault.hello()
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.readLease()).to.be.null
  })

  it("lets lockSoon() win likewise over a lease being read: no new secrets from this instant", async () => {
    const world = makeWorld()
    await seedVault(world)
    const gate = TH.holdNextCall(world.deviceDB, 'readLease')
    const vault = Vault.make(world.optsWith())
    await gate.reached
    await vault.lockSoon()
    gate.release()
    await vault.hello()
    expect(vault.getSnapshot().state).to.eq('locked')
    await TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
  })

  it("lets lock() and close() go while storage has not answered at all", async () => {
    const world = makeWorld()
    const gate = TH.holdNextCall(world.vaultDB, 'readVaultProps')
    const vault = Vault.make(world.optsWith())
    await gate.reached
    await vault.lock()
    expect(vault.getSnapshot().state).to.eq('opening')
    vault.close()
    gate.release()
    await TH.wakeupAtNextTick()
    expect(world.logged).to.have.lengthOf(0)
  })

  it("takes up no lease for a handle closed while its hello ran", async () => {
    const world = makeWorld()
    await seedVault(world)
    const gate = TH.holdNextCall(world.deviceDB, 'readLease')
    const vault = Vault.make(world.optsWith())
    await gate.reached
    vault.close()
    gate.release()
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot().state).to.not.eq('unlocked')
    expect(await world.readLease()).to.not.be.null
  })
})

/** Clock readings outside EpochMillis's bounds, each a unit mistake or no time at all. */
const OutOfBoundsReadings = [
  [Date.parse('2026-10-14T12:00:00Z') / 1000,   'epoch seconds'],
  [Date.parse('2026-10-14T12:00:00Z') * 1000,   'epoch microseconds'],
  [0,                                           'the epoch itself, before 1981'],
  [FarFuture + 1,                               'one millisecond past FarFuture'],
  [Infinity,                                    'Infinity'],
  [NaN,                                         'NaN'],
  ['1792022400000',                             'a number written as text'],
  [new Date('2026-10-14T12:00:00Z'),            'a Date, not its epoch milliseconds'],
] as const

describe("a page that is not a secure context", () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it("refuses Vault.make over plain http with kind 'insecure_context', before it touches storage", async () => {
    vi.stubGlobal('isSecureContext', false)
    const world = makeWorld()
    const readVaultProps = vi.spyOn(world.vaultDB, 'readVaultProps')
    const err = await TH.expectRefusal(world.open(), 'insecure_context')
    expect(err.message).to.match(/https/)
    expect(readVaultProps).not.toHaveBeenCalled()
  })

  it("refuses first of all, even a bag of options that is no bag", async () => {
    vi.stubGlobal('isSecureContext', false)
    await TH.expectRefusal(TH.settledVault(null as unknown as MakeVaultOpts), 'insecure_context')
  })

  it("opens in a secure context, and in a runtime with no notion of one (Node)", async () => {
    expect((globalThis as { isSecureContext?: unknown }).isSecureContext).to.be.undefined
    expect(await makeWorld().stateOnOpen()).to.eq('absent')
    vi.stubGlobal('isSecureContext', true)
    expect(await makeWorld().stateOnOpen()).to.eq('absent')
  })
})

describe("the host's clock", () => {
  for (const [reading, blurb] of OutOfBoundsReadings) {
    it(`refuses a clock reading ${blurb} at Vault.make, before reading storage`, async () => {
      const world = makeWorld()
      const readVaultProps = vi.spyOn(world.vaultDB, 'readVaultProps')
      const err = await TH.expectRefusal(world.open({ clock: { now: () => reading as number } }), 'bad_option')
      expect(err.message).to.match(/epoch milliseconds/)
      expect(readVaultProps).not.toHaveBeenCalled()
    })
  }

  it("refuses a clock that is not a Clock", async () => {
    const world = makeWorld()
    for (const nonsense of [{}, { now: 1_792_022_400_000 }, () => 1_792_022_400_000, 'now', null]) {
      await TH.expectRefusal(world.open({ clock: nonsense as unknown as MakeVaultOpts['clock'] }), 'bad_option')
    }
  })

  it("takes a reading with a fraction of a millisecond, in bounds", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { clock: { now: () => world.clock.now() + 0.5 } })
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("is checked at every reading: a clock gone wrong after the open refuses each call that reads it, and unlocks nothing", async () => {
    const world = makeWorld()
    let reading = world.clock.now()
    const vault = await world.openUnlocked('pw', { clock: { now: () => reading } })
    await vault.lock()
    reading /= 1000
    await TH.expectRefusal(vault.unlock('pw'), 'bad_option')
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.readLease()).to.be.null
  })

  it("refuses an unlock that would create the vault, writing nothing, when the clock has gone wrong", async () => {
    const world = makeWorld()
    let reading = world.clock.now()
    const vault = await world.open({ clock: { now: () => reading } })
    reading *= 1000
    await TH.expectRefusal(vault.unlock('pw'), 'bad_option')
    expect(world.dbStore.ckeys()).to.have.lengthOf(0)
  })

  it("still locks when the clock has gone wrong: lock(), and lockSoon() at once, without a grace", async () => {
    const world = makeWorld()
    let reading = world.clock.now()
    const vault = await world.openUnlocked('pw', { clock: { now: () => reading } })
    reading = NaN
    await vault.lockSoon(5)
    expect(world.logged).to.have.lengthOf(1)
    expect(world.logged[0]?.level).to.eq('warn')
    expect(world.logged[0]?.message).to.match(/locked at once/)
    expect(world.logged[0]?.message).to.not.include('NaN')
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.readLease()).to.be.null
    reading = world.clock.now()
    await TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
    await vault.unlock('pw')
    reading = 0
    await vault.lock()
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.readLease()).to.be.null
  })

  it("fails closed: a reading gone wrong while unlocked drops the vaultKey before it refuses the clock", async () => {
    const world = makeWorld()
    let reading = world.clock.now()
    const vault = await world.openUnlocked('pw', { clock: { now: () => reading } })
    await vault.storeBox('anthropic', 'sk-fake')
    reading = world.clock.now() / 1000
    await TH.expectRefusal(vault.readBox('anthropic'), 'bad_option')
    expect(vault.getSnapshot().state).to.eq('locked')
    reading = world.clock.now()
    await TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
  })

  it("refuses a clock whose now() throws, at Vault.make, keeping its error as the cause and quoting none of it", async () => {
    const world = makeWorld()
    const thrown = new Error('clock broke near sk-ant-SUPERSECRET')
    const err = await TH.expectRefusal(world.open({ clock: { now: () => { throw thrown } } }), 'bad_option')
    expect(err.cause).to.eq(thrown)
    expect(err.message).to.not.include('SUPERSECRET')
  })

  it("refuses, and drops the vaultKey, when now() starts throwing after the open", async () => {
    const world = makeWorld()
    let broken = false
    const clock = { now: () => { if (broken) { throw new Error('no time today') } return world.clock.now() } }
    const vault = await world.openUnlocked('pw', { clock })
    await vault.storeBox('anthropic', 'sk-fake')
    broken = true
    const err = await TH.expectRefusal(vault.readBox('anthropic'), 'bad_option')
    expect((err.cause as Error).message).to.eq('no time today')
    broken = false
    expect(vault.getSnapshot().state).to.eq('locked')
    await TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
  })

  it("refuses a store when the clock has gone wrong while unlocked", async () => {
    const world = makeWorld()
    let reading = world.clock.now()
    const vault = await world.openUnlocked('pw', { clock: { now: () => reading } })
    reading = Infinity
    await TH.expectRefusal(vault.storeBox('anthropic', 'sk-fake'), 'bad_option')
    expect(world.dbStore.ckeys().filter((ckey) => isU1Box(ckey))).to.have.lengthOf(0)
  })
})

describe("unlock and lock", () => {
  it("the first unlock creates the vault, with that passphrase, unlocked for seven days", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('correct horse battery staple')
    const snapshot = vault.getSnapshot()
    expect(snapshot.state).to.eq('unlocked')
    expect(snapshot.askPassphraseAt).to.eq(world.clock.now() + SevenDaysMillis)
  })

  it("a wrong passphrase is refused calmly, changing nothing, and quoting nothing", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('the right passphrase')
    await vault.lock()
    const err = await TH.expectRefusal(vault.unlock('the wrong passphrase'), 'wrong_passphrase')
    expect(err.message).to.not.include('the wrong passphrase')
    expect(err.message).to.not.include('the right passphrase')
    expect(vault.getSnapshot().state).to.eq('locked')
    await vault.unlock('the right passphrase')
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("a passphrase of only whitespace is refused outright", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await TH.expectRefusal(vault.unlock(' '.repeat(3)), 'wrong_passphrase')
    expect(vault.getSnapshot().state).to.eq('absent')
  })

  it("lock() forgets the unlock on this device too: a reopened handle is locked", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.lock()
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.stateOnOpen()).to.eq('locked')
  })

  it("refuses a passphrase that is not text with kind 'bad_option', and stays as it was", async () => {
    const world = makeWorld()
    const vault = await world.open()
    for (const passphrase of [undefined, null, 1234, ['pw']]) {
      await TH.expectRefusal(vault.unlock(passphrase as unknown as string), 'bad_option')
    }
    expect(vault.getSnapshot().state).to.eq('absent')
  })
})

/** The deadline of this world's device's lease, or null when it keeps none. */
const leaseDeadlineOf = async (world: ReturnType<typeof makeWorld>): Promise<number | null> => {
  const lease = await world.readLease()
  return lease?.ask_passphrase_at ?? null
}

describe("the lease", () => {
  it("spares the passphrase on a later open, within seven days", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw one')
    world.advance(6 * 24 * 60 * 60 * 1000)
    const later = await world.open()
    expect(later.getSnapshot().state).to.eq('unlocked')
    // Genuinely unlocked: a read reaches the box layer ('absent_box'), not the lock ('vault_locked').
    await TH.expectRefusal(later.readBox('missing'), 'absent_box')
  })

  it("has lapsed by day eight: the next open is locked", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw one')
    world.advance(SevenDaysMillis + 1)
    expect(await world.stateOnOpen()).to.eq('locked')
  })

  it("lapses mid-session too: no whisper comes out past the deadline", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.storeBox('anthropic', 'sk-fake')
    world.advance(SevenDaysMillis + 1)
    await TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
  })

  it("lasts LeaseHours, 168 (seven days), unless told otherwise", () => {
    expect(LeaseHours * HourMillis).to.eq(SevenDaysMillis)
  })

  it("lasts the leaseHours the host chose, and asks again from then", async () => {
    const world = makeWorld()
    const twelveHoursMillis = 12 * HourMillis
    const vault = await world.openUnlocked('pw one', { leaseHours: 12 })
    expect(vault.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + twelveHoursMillis)
    world.advance(twelveHoursMillis - 1)
    expect(await world.stateOnOpen({ leaseHours: 12 })).to.eq('unlocked')
    world.advance(1)
    expect(await world.stateOnOpen({ leaseHours: 12 })).to.eq('locked')
    await TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
  })

  it("takes fractions of an hour, kept as whole milliseconds", async () => {
    const world = makeWorld()
    const quarterHour = await world.openUnlocked('pw one', { leaseHours: 0.25 })
    const fifteenMinutesMillis = 15 * 60 * 1000
    expect(quarterHour.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + fifteenMinutesMillis)
    const oneThird = await world.openUnlocked('pw one', { deviceDB: memoryDeviceDB(), leaseHours: 1 / 3 })
    const twentyMinutesMillis = 20 * 60 * 1000
    expect(oneThird.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + twentyMinutesMillis)
  })

  it("refuses a leaseHours that is not a span of time above zero", async () => {
    const world = makeWorld()
    for (const nonsense of [0, -1, -Infinity, NaN, 1e-12, '12', null, true, {}]) {
      await TH.expectRefusal(world.open({ leaseHours: nonsense as number }), 'bad_option')
    }
  })

  it("says in its refusal that Infinity is welcome", async () => {
    const world = makeWorld()
    const err = await TH.expectRefusal(world.open({ leaseHours: 0 }), 'bad_option')
    expect(err.message).to.match(/greater than zero/)
    expect(err.message).to.match(/Infinity/)
  })

  describe("with leaseHours: Infinity", () => {
    it("unlocks, and stays unlocked however long it is left, showing FarFuture as its deadline", async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw one', { leaseHours: Infinity })
      await vault.storeBox('anthropic', 'sk-fake')
      expect(vault.getSnapshot().state).to.eq('unlocked')
      expect(vault.getSnapshot().askPassphraseAt).to.eq(FarFuture)
      world.advance(200 * 365 * 24 * HourMillis)
      expect(await vault.readBox('anthropic')).to.eq('sk-fake')
      expect(vault.getSnapshot().state).to.eq('unlocked')
    })

    it("writes the clamped deadline to the device, as a finite number, and a reopen picks it up", async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw one', { leaseHours: Infinity })
      await vault.storeBox('anthropic', 'sk-fake')
      const lease = await world.readLease()
      expect(lease?.ask_passphrase_at).to.eq(FarFuture)
      world.advance(10 * 365 * 24 * HourMillis)
      const reopened = await world.open({ leaseHours: Infinity })
      expect(reopened.getSnapshot().state).to.eq('unlocked')
      expect(reopened.getSnapshot().askPassphraseAt).to.eq(FarFuture)
      expect(await reopened.readBox('anthropic')).to.eq('sk-fake')
    })

    it("ends with lock(), here and on the device", async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw one', { leaseHours: Infinity })
      await vault.lock()
      expect(vault.getSnapshot().state).to.eq('locked')
      expect(vault.getSnapshot().askPassphraseAt).to.be.null
      await TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
      expect(await world.stateOnOpen({ leaseHours: Infinity })).to.eq('locked')
    })

    it("holds through a passphrase change on this device, with the same deadline", async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw one', { leaseHours: Infinity })
      await vault.changePassphrase('pw one', 'pw two')
      expect(vault.getSnapshot().state).to.eq('unlocked')
      expect(vault.getSnapshot().askPassphraseAt).to.eq(FarFuture)
      const lease = await world.readLease()
      expect(lease?.ask_passphrase_at).to.eq(FarFuture)
    })
  })

  for (const [shiftMillis, blurb] of [[HourMillis, 'later'], [-HourMillis, 'earlier']] as const) {
    it(`reads a lease's deadline moved an hour ${blurb} on the device as no lease, erases it, and says so: the deadline is bound into its wrap`, async () => {
      const world = makeWorld()
      await world.openUnlocked('pw one')
      const written = await world.readLease()
      if (written === null) { throw new Error('expected a lease on the device') }
      await world.deviceDB.writeLease({ ...written, ask_passphrase_at: written.ask_passphrase_at + shiftMillis }, TH.NoLocks)
      // Under Infinity no window check refuses it, and an hour either way stays in bounds: only the ctx can.
      const reopened = await world.open({ leaseHours: Infinity })
      expect(reopened.getSnapshot().state).to.eq('locked')
      expect(await world.readLease()).to.be.null
      expect(world.logged.map((call) => call.level)).to.deep.eq(['warn'])
    })
  }

  for (const [askPassphraseAt, blurb] of OutOfBoundsDeadlines) {
    it(`reads a lease's deadline of ${blurb} as no lease, and erases it`, async () => {
      const world = makeWorld()
      await world.openUnlocked('pw one')
      const written = await world.readLease()
      if (written === null) { throw new Error('expected a lease on the device') }
      await world.deviceDB.writeLease({ ...written, ask_passphrase_at: askPassphraseAt }, TH.NoLocks)
      // Under Infinity no window check refuses it: only the bounds can.
      const reopened = await world.open({ leaseHours: Infinity })
      expect(reopened.getSnapshot().state).to.eq('locked')
      expect(reopened.getSnapshot().askPassphraseAt).to.be.null
      expect(await world.readLease()).to.be.null
    })
  }

  it("refuses a finite lease longer than MaxLeaseHours, 588 (24.5 days), which no timer reaches: Infinity is the way to say never", async () => {
    const world = makeWorld()
    for (const tooLong of [MaxLeaseHours + 0.01, 25 * 24, 1e6, 1e300, Number.MAX_VALUE]) {
      const err = await TH.expectRefusal(world.open({ leaseHours: tooLong }), 'bad_option')
      expect(err.message).to.match(/588/)
      expect(err.message).to.match(/Infinity/)
    }
  })

  it("is MaxLeaseHours at most, short of what one timer reaches, with a minute's grace to spare", () => {
    expect(MaxLeaseHours).to.eq(588)
    expect((MaxLeaseHours * HourMillis) + MinuteMillis).to.be.below((2 ** 31) - 1)
  })

  it("makes a deadline of whole milliseconds from a clock that returns fractions, and a reopen reads it back", async () => {
    const world = makeWorld()
    const fractionalClock = { now: () => world.clock.now() + 0.25 }
    const vault = await world.openUnlocked('pw one', { clock: fractionalClock })
    expect(vault.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + SevenDaysMillis)
    const lease = await world.readLease()
    expect(lease?.ask_passphrase_at).to.eq(world.clock.now() + SevenDaysMillis)
    expect(await world.stateOnOpen({ clock: fractionalClock })).to.eq('unlocked')
  })

  it("takes the longest finite lease, MaxLeaseHours, exactly as asked", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one', { leaseHours: MaxLeaseHours })
    expect(vault.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + (MaxLeaseHours * HourMillis))
  })
})

describe("the lease, when the host changes leaseHours", () => {
  it("lowered from Infinity to one hour, revokes a lease already granted at its next open, and the next unlock lasts an hour", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw one', { leaseHours: Infinity })
    world.advance(30 * 24 * HourMillis)
    const lowered = await world.open({ leaseHours: 1 })
    expect(lowered.getSnapshot().state).to.eq('locked')
    expect(await world.readLease()).to.be.null
    await lowered.unlock('pw one')
    expect(lowered.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + HourMillis)
    expect(await world.stateOnOpen({ leaseHours: 1 })).to.eq('unlocked')
  })

  it("writes no record on any open, shortened or not", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw one', { leaseHours: Infinity })
    const writeLease = vi.spyOn(world.deviceDB, 'writeLease')
    await world.open({ leaseHours: Infinity })
    await world.open({ leaseHours: 1 })
    await world.open({ leaseHours: 1 })
    expect(writeLease).not.toHaveBeenCalled()
  })

  it("never brings back a lease that another tab's lock() erased during the open", async () => {
    const world = makeWorld()
    const otherTab = await world.openUnlocked('pw one', { leaseHours: Infinity })
    const readLease = world.deviceDB.readLease.bind(world.deviceDB)
    vi.spyOn(world.deviceDB, 'readLease').mockImplementationOnce(async (scope) => {
      const kept = await readLease(scope)
      await otherTab.lock()
      return kept
    })
    await world.open({ leaseHours: 1 })
    expect(await world.readLease()).to.be.null
    expect(await world.stateOnOpen({ leaseHours: 1 })).to.eq('locked')
  })

  it("raised, lengthens no lease already granted", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw one', { leaseHours: 12 })
    const given = world.clock.now() + (12 * HourMillis)
    world.advance(HourMillis)
    const raised = await world.open({ leaseHours: Infinity })
    expect(raised.getSnapshot().askPassphraseAt).to.eq(given)
    expect(await leaseDeadlineOf(world)).to.eq(given)
  })

  it("lowered to a window that still reaches past the deadline given, leaves the unlock and its record as they were", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw one', { leaseHours: 12 })
    const given = world.clock.now() + (12 * HourMillis)
    world.advance(11 * HourMillis)
    const lowered = await world.open({ leaseHours: 2 })
    expect(lowered.getSnapshot().state).to.eq('unlocked')
    expect(lowered.getSnapshot().askPassphraseAt).to.eq(given)
    expect(await leaseDeadlineOf(world)).to.eq(given)
  })

  it("keeps a deadline exactly at the new window's end, and revokes one a millisecond past it", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw one', { leaseHours: 12 })
    const oneMilliShort = 12 - (1 / HourMillis)
    world.advance(1)
    expect(await world.stateOnOpen({ leaseHours: oneMilliShort })).to.eq('unlocked')
    world.advance(-1)
    expect(await world.stateOnOpen({ leaseHours: oneMilliShort })).to.eq('locked')
  })
})

const ckeyOf = (scope: VaultScope) => `${scope.applabel}:${scope.user_id}:${scope.vaultlabel}`

/**
 * A DeviceDB as a host might write its own: rows kept as handed in, and handed back unchecked, so
 * a test can reach in and spoil one the way a damaged store or an older version would.
 */
const uncheckingDeviceDB = () => {
  const rows = new Map<string, unknown>()
  const marks = new Map<string, unknown>()
  const deviceDB: DeviceDB = {
    readLease:  (scope) => Promise.resolve((rows.get(ckeyOf(scope)) ?? null) as Lease | null),
    writeLease: (lease) => { rows.set(ckeyOf(lease), lease); return Promise.resolve() },
    eraseLease: (scope) => { rows.delete(ckeyOf(scope)); return Promise.resolve() },
    readMark:   (scope) => Promise.resolve((marks.get(ckeyOf(scope)) ?? null) as DeviceMark | null),
    writeMark:  (mark) => { marks.set(ckeyOf(mark), mark); return Promise.resolve() },
    eraseMark:  (scope) => { marks.delete(ckeyOf(scope)); return Promise.resolve() },
    eraseAll:   () => { rows.clear(); marks.clear(); return Promise.resolve() },
  }
  /** Rewrite the one stored row through `spoil`. */
  const spoilRow = (spoil: (row: Record<string, unknown>) => unknown) => {
    const [[ckey, row]] = [...rows] as [[string, Record<string, unknown>]]
    rows.set(ckey, spoil(row))
  }
  return { deviceDB, rows, spoilRow }
}

const SpoiledWayins = [
  [(row: Record<string, unknown>) => ({ ...row, format: 'byok-unlock-v1' }),                  "a record under the format tag from before the package's rename"],
  [({ lease_key: kept, vault_key_lease_wrapped: wrapped, ...row }: Record<string, unknown>) => ({ ...row, format: 'safebyok-unlock-v1', local_unlock_key: kept, vault_key_local_wrapped: wrapped }), 'a record from before the lease, under safebyok-unlock-v1'],
  [(row: Record<string, unknown>) => ({ ...row, ask_passphrase_at: '99999999999999' }),       'a deadline written as text, which would compare as a number'],
  [(row: Record<string, unknown>) => ({ ...row, ask_passphrase_at: Infinity }),               'a deadline that never comes'],
  [({ ask_passphrase_at: _gone, ...row }: Record<string, unknown>) => row,                    'a record missing its deadline'],
  [({ ask_passphrase_at: kept, ...row }: Record<string, unknown>) => ({ ...row, expires_at: kept }), 'a record from before its deadline was named ask_passphrase_at'],
  [({ unlock_epoch: kept, ...row }: Record<string, unknown>) => ({ ...row, passphrase_epoch: kept }), 'a record from before its epoch was named unlock_epoch'],
  [(row: Record<string, unknown>) => ({ ...row, ask_passphrase_at: 1_792_022_400 }),          'a deadline in epoch seconds, before 1981'],
  [(row: Record<string, unknown>) => ({ ...row, ask_passphrase_at: FarFuture + 1 }),          'a deadline past FarFuture'],
  [({ ask_passphrase_at: kept, ...row }: Record<string, unknown>) => ({ ...row, ask_passphrase_at: (kept as number) - 0.5 }), 'a deadline with a fraction of a millisecond'],
  [() => 'not a record at all',                                                               'a row that is not a record'],
  [(row: Record<string, unknown>) => ({ ...row, user_id: 'u2' }),                             "a record naming another user's vault"],
  [(row: Record<string, unknown>) => ({ ...row, applabel: 'other_app' }),                     "a record naming another app's vault"],
  [(row: Record<string, unknown>) => ({ ...row, vaultlabel: 'spare' }),                       'a record naming another of the same user\'s vaults'],
] as const

/** How long an unlock of `vault` lasts, as `Vault.leaseMillis`'s example says it. */
const windowSaidBy = (vault: Vault): string => (
  vault.leaseMillis === ForeverMillis ? 'until you lock it' : `for ${String(Math.round(vault.leaseMillis / 60_000))} minutes`
)

const LeaseHoursCases = [
  // regular usage:
  [undefined,        SevenDaysMillis,                'the default, seven days'],
  [12,               12 * HourMillis,                'the hours the host chose'],
  [0.25,             15 * 60 * 1000,                 'a fraction of an hour'],
  [Infinity,         ForeverMillis,                  'Infinity, as ForeverMillis'],
  // edge cases:
  [MaxLeaseHours,    MaxLeaseHours * HourMillis,     'the longest finite window, MaxLeaseHours'],
  [1 / 7,            514_286,                        'a window that is no whole number of milliseconds, rounded to one'],
] as const

describe("the vault's leaseMillis", () => {
  for (const [hours, expected, blurb] of LeaseHoursCases) {
    it(`reports ${blurb}`, async () => {
      const world = makeWorld()
      const vault = await world.open({ leaseHours: hours })
      expect(vault.leaseMillis).to.eq(expected)
    })
  }

  it("is the window an unlock lasts: askPassphraseAt is the unlock's time plus it", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one', { leaseHours: 0.25 })
    expect(vault.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + vault.leaseMillis)
  })

  it("stays the same for the handle's life, through unlock and lock", async () => {
    const world = makeWorld()
    const vault = await world.open({ leaseHours: 12 })
    await vault.unlock('pw one')
    await vault.lock()
    expect(vault.leaseMillis).to.eq(12 * HourMillis)
  })

  it("lets a UI say how long an unlock lasts, as its example shows", async () => {
    const world = makeWorld()
    expect(windowSaidBy(await world.open({ leaseHours: Infinity }))).to.eq('until you lock it')
    expect(windowSaidBy(await world.open({ leaseHours: 0.25 }))).to.eq('for 15 minutes')
  })
})

describe("the lease, from a host's own DeviceDB", () => {
  it("is checked by the vault: a sound record spares the passphrase", async () => {
    const world = makeWorld()
    const device = uncheckingDeviceDB()
    await world.openUnlocked('pw one', { deviceDB: device.deviceDB })
    expect(await world.stateOnOpen({ deviceDB: device.deviceDB })).to.eq('unlocked')
  })

  for (const [spoil, blurb] of SpoiledWayins) {
    it(`reads ${blurb} as no lease, and erases it`, async () => {
      const world = makeWorld()
      const device = uncheckingDeviceDB()
      await world.openUnlocked('pw one', { deviceDB: device.deviceDB })
      device.spoilRow(spoil)
      const later = await world.open({ deviceDB: device.deviceDB })
      expect(later.getSnapshot().state).to.eq('locked')
      expect(later.getSnapshot().askPassphraseAt).to.be.null
      expect(device.rows.size).to.eq(0)
    })
  }

  it("says through the logger that a record naming another scope was revoked", async () => {
    const world = makeWorld()
    const device = uncheckingDeviceDB()
    await world.openUnlocked('pw one', { deviceDB: device.deviceDB })
    device.spoilRow((row) => ({ ...row, user_id: 'u2' }))
    await world.open({ deviceDB: device.deviceDB })
    expect(world.logged.map((call) => call.level)).to.deep.equal(['warn'])
    expect(world.logged[0]?.message).to.include('could not be read')
  })

  it("says once through the logger that a record from before the lease, under safebyok-unlock-v1, was revoked", async () => {
    const world = makeWorld()
    const device = uncheckingDeviceDB()
    await world.openUnlocked('pw one', { deviceDB: device.deviceDB })
    device.spoilRow(({ lease_key: kept, vault_key_lease_wrapped: wrapped, ...row }) => ({ ...row, format: 'safebyok-unlock-v1', local_unlock_key: kept, vault_key_local_wrapped: wrapped }))
    await world.open({ deviceDB: device.deviceDB })
    expect(device.rows.size).to.eq(0)
    expect(world.logged.map((call) => call.level)).to.deep.equal(['warn'])
    expect(world.logged[0]?.message).to.include('could not be read')
  })
})

const RoundTrips: readonly (readonly [Whisper, string])[] = [
  ["sk-ant-api03-fake",            'a string'],
  [42,                             'a number'],
  [false,                          'a boolean'],
  [["alpha", "beta"],              'an array'],
  [{ apiKey: "fake", tier: 2 },  'an object'],
  [{ orgId: null },                'an object holding a null'],
]

describe("storeBox and readBox", () => {
  for (const [whisper, blurb] of RoundTrips) {
    it(`round-trips ${blurb}`, async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw')
      await vault.storeBox('the_box', whisper)
      expect(await vault.readBox('the_box')).to.deep.equal(whisper)
    })
  }

  it("keeps the summary public and the whisper out of it", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake', { sidecar: { note: 'personal account' } })
    const summary = TH.summaryOf(vault.getSnapshot().boxes[0])
    expect(summary?.boxlabel).to.eq('anthropic')
    expect(summary?.sidecar).to.deep.equal({ note: 'personal account' })
    expect(summary).to.not.have.property('whisper')
  })

  it("replacing a whisper keeps the sidecar", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-old', { sidecar: { note: 'keep me' } })
    await vault.storeBox('anthropic', 'sk-new')
    expect(await vault.readBox('anthropic')).to.eq('sk-new')
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.sidecar).to.deep.equal({ note: 'keep me' })
  })

  it("refuses a whisper JSON cannot carry, quoting none of it", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const sneaky = { apiKey: 'sk-ant-SUPERSECRET', when: new Date() }
    const err = await TH.expectRefusal(vault.storeBox('the_box', sneaky as unknown as Whisper), 'bad_whisper')
    expect(err.message).to.not.include('SUPERSECRET')
    await TH.expectRefusal(vault.storeBox('the_box', undefined as unknown as Whisper), 'bad_whisper')
    await TH.expectRefusal(vault.storeBox('the_box', null as unknown as Whisper), 'bad_whisper')
    expect(vault.getSnapshot().boxes).to.have.lengthOf(0)
  })

  it("stores a whisper of exactly MaxWhisperBytes with its empty sidecar, and refuses one byte more, quoting none of it", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    // A JSON string is its characters plus two quotes, and the empty sidecar, {}, is two bytes more.
    const atLimit = 'x'.repeat(MaxWhisperBytes - 4)
    await vault.storeBox('the_box', atLimit)
    expect(await vault.readBox('the_box')).to.eq(atLimit)
    const oneOver = `${'x'.repeat(MaxWhisperBytes - 9)}SECRET`
    const err = await TH.expectRefusal(vault.storeBox('the_box', oneOver), 'whisper_too_large')
    expect(err.message).to.not.include('SECRET')
    expect(await vault.readBox('the_box')).to.eq(atLimit)
  })

  it("counts the limit in bytes, not characters", async () => {
    const world = makeWorld()
    // Four é are eight bytes and two quotes; the empty sidecar, two more.
    const vault = await world.openUnlocked('pw', { maxWhisperBytes: 12 })
    await vault.storeBox('the_box', 'éééé')
    await TH.expectRefusal(vault.storeBox('other_box', 'ééééé'), 'whisper_too_large')
    expect(boxlabelsOf(vault)).to.deep.equal(['the_box'])
  })

  it("checks the limit on write only, so lowering it strands nothing already stored", async () => {
    const world = makeWorld()
    const roomy = await world.openUnlocked('pw')
    await roomy.storeBox('the_box', 'x'.repeat(100))
    roomy.close()
    const tight = await world.open({ maxWhisperBytes: 16 })
    expect(await tight.readBox('the_box')).to.eq('x'.repeat(100))
    await TH.expectRefusal(tight.storeBox('the_box', 'x'.repeat(100)), 'whisper_too_large')
  })

  it("refuses a maxWhisperBytes over half of what the adapter holds in one record", async () => {
    const world = makeWorld()
    const halfAMebibyte = world.vaultDB.maxRecordBytes / 2
    expect(halfAMebibyte).to.eq(524_288)
    await world.open({ maxWhisperBytes: halfAMebibyte })
    await TH.expectRefusal(world.open({ maxWhisperBytes: halfAMebibyte + 1 }), 'bad_option')
  })

  it("refuses a maxWhisperBytes that is not a whole number of bytes above zero", async () => {
    const world = makeWorld()
    for (const nonsense of [0, -1, 1.5, NaN]) {
      await TH.expectRefusal(world.open({ maxWhisperBytes: nonsense }), 'bad_option')
    }
  })

  it("refuses a malformed boxlabel before touching storage", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await TH.expectRefusal(vault.storeBox('not a label', 'whatever'), 'bad_label')
  })

  it("reads of an absent box refuse without quoting the boxlabel, which may be any text a host admits", async () => {
    const world = makeWorld({ validators: AnyTextValidators })
    const vault = await world.openUnlocked('pw')
    const err = await TH.expectRefusal(vault.readBox('sk-fake-pasted-by-mistake'), 'absent_box')
    expect(err.message).not.to.include('sk-fake-pasted-by-mistake')
  })
})

/** The stored row of the lockbox `boxlabel`, as the backend holds it. */
const storedRowOf = (world: ReturnType<typeof makeWorld>, boxlabel: string): Record<string, unknown> => (
  JSON.parse(world.dbStore.read(u1BoxCkey(boxlabel)) ?? 'null') as Record<string, unknown>
)

/** The vault's stored props, as the backend holds them. */
const storedVaultPropsOf = (world: ReturnType<typeof makeWorld>): Record<string, unknown> => (
  JSON.parse(world.dbStore.read(u1VaultPropsCkey) ?? 'null') as Record<string, unknown>
)

describe("the times a vault keeps", () => {
  it("stamps a new lockbox's registered_at and written_at with the clock's time", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake')
    const storedAt = world.clock.now()
    expect(vault.getSnapshot().boxes[0]).to.include({ registered_at: storedAt, written_at: storedAt })
    expect(storedRowOf(world, 'anthropic')).to.include({ registered_at: storedAt, written_at: storedAt })
  })

  it("keeps registered_at when the whisper is replaced, and moves written_at", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-old')
    const storedAt = world.clock.now()
    world.advance(60_000)
    await vault.storeBox('anthropic', 'sk-new')
    expect(vault.getSnapshot().boxes[0]).to.include({ registered_at: storedAt, written_at: storedAt + 60_000 })
  })

  it("moves written_at when the same whisper is stored again: it says when the lockbox was written, not whether it changed", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('openai', { apiKey: 'sk-fake', tier: 2 })
    const storedAt = world.clock.now()
    const before = TH.summaryOf(vault.getSnapshot().boxes[0])
    world.advance(60_000)
    // The same whisper, its fields given in another order: it serializes the same.
    await vault.storeBox('openai', { tier: 2, apiKey: 'sk-fake' }, { sidecar: { note: 'a new note' } })
    const after = TH.summaryOf(vault.getSnapshot().boxes[0])
    expect(after).to.deep.include({ registered_at: storedAt, written_at: storedAt + 60_000, sidecar: { note: 'a new note' } })
    expect(after?.revision_tok).to.not.eq(before?.revision_tok)
  })

  it("writes over a previous record that will not open, carrying nothing from it", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake', { sidecar: { note: 'work account' } })
    const storedAt = world.clock.now()
    const row = storedRowOf(world, 'anthropic') as { whisper_ciphered: { ciphertext_b64: string } }
    row.whisper_ciphered.ciphertext_b64 = TH.tweakB64(row.whisper_ciphered.ciphertext_b64)
    world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify(row))
    world.advance(60_000)
    await vault.storeBox('anthropic', 'sk-fake')
    expect(vault.getSnapshot().boxes[0]).to.deep.include({ registered_at: storedAt + 60_000, written_at: storedAt + 60_000, sidecar: {} })
    expect(await vault.readBox('anthropic')).to.eq('sk-fake')
  })

  it("never seals a sidecar planted in storage into a fresh revision: a store over it without a sidecar writes {}", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake', { sidecar: { note: 'work account' } })
    world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify({ ...storedRowOf(world, 'anthropic'), sidecar_json: '{"note":"INJECTED"}' }))
    await TH.expectRefusal(vault.readBox('anthropic'), 'damaged_lockbox')
    await vault.storeBox('anthropic', 'sk-fake-2')
    expect(await vault.readBox('anthropic')).to.eq('sk-fake-2')
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.sidecar).to.deep.equal({})
    expect(storedRowOf(world, 'anthropic')).to.include({ sidecar_json: '{}' })
    // A sidecar given with the store is written as given, over the planted one.
    world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify({ ...storedRowOf(world, 'anthropic'), sidecar_json: '{"note":"INJECTED"}' }))
    await vault.storeBox('anthropic', 'sk-fake-3', { sidecar: { note: 'mended' } })
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.sidecar).to.deep.equal({ note: 'mended' })
  })

  it("never carries forward a registered_at moved in storage: a store over it stamps now", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake')
    const planted = Date.UTC(2001, 0, 1)
    world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify({ ...storedRowOf(world, 'anthropic'), registered_at: planted }))
    await TH.expectRefusal(vault.readBox('anthropic'), 'damaged_lockbox')
    world.advance(60_000)
    await vault.storeBox('anthropic', 'sk-fake')
    expect(vault.getSnapshot().boxes[0]).to.include({ registered_at: world.clock.now(), written_at: world.clock.now() })
    expect(await vault.readBox('anthropic')).to.eq('sk-fake')
  })

  it("opens a vault holding a lockbox whose stored sidecar is nested too deep to serialize, listing that one as damaged", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake')
    await vault.storeBox('openai', 'sk-fake-two', { sidecar: { note: 'work account' } })
    vault.close()
    const deep = `${'['.repeat(200_000)}${']'.repeat(200_000)}`
    world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify({ ...storedRowOf(world, 'anthropic'), sidecar_json: deep }))
    const fresh = await world.openUnlocked('pw')
    expect(fresh.getSnapshot().boxes[0]).to.deep.include({ boxlabel: 'anthropic', damaged: true })
    expect(TH.summaryOf(fresh.getSnapshot().boxes[1])?.sidecar).to.deep.equal({ note: 'work account' })
    await TH.expectRefusal(fresh.readBox('anthropic'), 'damaged_lockbox')
    expect(await fresh.readBox('openai')).to.eq('sk-fake-two')
  })

  it("lists a lockbox whose stored sidecar is respaced or reordered as damaged: only the text the vault writes is read", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('respaced', 'sk-fake', { sidecar: { note: 'work' } })
    await vault.storeBox('reordered', 'sk-fake', { sidecar: { alpha: 1, beta: 2 } })
    world.dbStore.write(u1BoxCkey('respaced'), JSON.stringify({ ...storedRowOf(world, 'respaced'), sidecar_json: '{"note": "work"}' }))
    world.dbStore.write(u1BoxCkey('reordered'), JSON.stringify({ ...storedRowOf(world, 'reordered'), sidecar_json: '{"beta":2,"alpha":1}' }))
    const fresh = await world.open()
    expect(fresh.getSnapshot().boxes.map((box) => [box.boxlabel, box.damaged])).to.deep.equal([['reordered', true], ['respaced', true]])
  })

  it("stamps the vault props' registered_at when the vault is made, and keeps it through a passphrase change", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    const madeAt = world.clock.now()
    expect(storedVaultPropsOf(world)).to.include({ registered_at: madeAt })
    world.advance(60_000)
    await vault.changePassphrase('pw one', 'pw two')
    expect(storedVaultPropsOf(world)).to.include({ registered_at: madeAt, unlock_epoch: 2 })
  })

  it("writes no created_at or updated_at, to a lockbox or the vault props", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake')
    for (const row of [storedRowOf(world, 'anthropic'), storedVaultPropsOf(world)]) {
      expect(row).to.not.have.any.keys('created_at', 'updated_at')
    }
  })

  it("writes whole milliseconds from a clock that returns fractions", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { clock: { now: () => world.clock.now() + 0.75 } })
    await vault.storeBox('anthropic', 'sk-fake')
    expect(storedVaultPropsOf(world)).to.include({ registered_at: world.clock.now() })
    expect(storedRowOf(world, 'anthropic')).to.include({ registered_at: world.clock.now(), written_at: world.clock.now() })
  })

  it("refuses a stored lockbox or vault props whose time holds a fraction of a millisecond, leaving the record as it is", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake')
    const box = JSON.stringify({ ...storedRowOf(world, 'anthropic'), written_at: world.clock.now() + 0.5 })
    world.dbStore.write(u1BoxCkey('anthropic'), box)
    await TH.expectRefusal(vault.readBox('anthropic'), 'damaged_lockbox')
    expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.eq(box)
    const vaultProps = JSON.stringify({ ...storedVaultPropsOf(world), registered_at: world.clock.now() + 0.5 })
    world.dbStore.write(u1VaultPropsCkey, vaultProps)
    await TH.expectRefusal(world.open(), 'damaged_vault')
    expect(world.dbStore.read(u1VaultPropsCkey)).to.eq(vaultProps)
  })

  it("never quotes the boxlabel of a damaged lockbox it refuses, which a host's checks may let be any text", async () => {
    const world = makeWorld({ validators: AnyTextValidators })
    const vault = await world.openUnlocked('pw')
    const pasted = 'sk-ant-fake-pasted-as-a-label'
    await vault.storeBox(pasted, 'sk-fake')
    await vault.storeBox('other', 'sk-fake-two')
    const row = storedRowOf(world, pasted)
    world.dbStore.write(u1BoxCkey(pasted), JSON.stringify({ ...row, written_at: world.clock.now() + 0.5 }))
    const storedDamaged = await TH.expectRefusal(vault.readBox(pasted), 'damaged_lockbox')
    // The other lockbox's ciphertext, moved under this boxlabel: it will not open here.
    world.dbStore.write(u1BoxCkey(pasted), JSON.stringify({ ...row, whisper_ciphered: storedRowOf(world, 'other')['whisper_ciphered'] }))
    const unopened = await TH.expectRefusal(vault.readBox(pasted), 'damaged_lockbox')
    expect(TH.thrownText(storedDamaged) + TH.thrownText(unopened)).to.not.include('sk-ant-fake')
  })

  it("refuses a stored lockbox from before its times were renamed, leaving it as it is", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake')
    const { registered_at: _registered, written_at: _written, ...row } = storedRowOf(world, 'anthropic')
    const olden = JSON.stringify({ ...row, created_at: '2026-10-14T00:00:00.000Z', updated_at: '2026-10-14T00:00:00.000Z' })
    world.dbStore.write(u1BoxCkey('anthropic'), olden)
    await TH.expectRefusal(vault.readBox('anthropic'), 'damaged_lockbox')
    expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.eq(olden)
  })

  it("refuses stored vault props from before their time was renamed, leaving them as they are", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const { registered_at: _registered, ...row } = storedVaultPropsOf(world)
    const olden = JSON.stringify({ ...row, created_at: '2026-10-14T00:00:00.000Z', updated_at: '2026-10-14T00:00:00.000Z' })
    world.dbStore.write(u1VaultPropsCkey, olden)
    await TH.expectRefusal(world.open(), 'damaged_vault')
    expect(world.dbStore.read(u1VaultPropsCkey)).to.eq(olden)
  })
})

describe("the sidecar", () => {
  it("is {} in the summary and the stored row of a lockbox given none", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake')
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.sidecar).to.deep.equal({})
    expect(storedRowOf(world, 'anthropic')).to.include({ sidecar_json: '{}' })
  })

  it("is written whether given as {} or left out, so the two bind the same, and a row without one is damaged", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('omitted', 'sk-fake-one')
    await vault.storeBox('emptied', 'sk-fake-two', { sidecar: {} })
    expect(storedRowOf(world, 'omitted')).to.include({ sidecar_json: '{}' })
    expect(storedRowOf(world, 'emptied')).to.include({ sidecar_json: '{}' })
    const { sidecar_json: _gone, ...sidecarless } = storedRowOf(world, 'omitted')
    world.dbStore.write(u1BoxCkey('omitted'), JSON.stringify(sidecarless))
    const fresh = await world.open()
    expect(fresh.getSnapshot().boxes[1]).to.deep.include({ boxlabel: 'omitted', damaged: true })
    expect(await fresh.readBox('emptied')).to.eq('sk-fake-two')
  })

  it("is stored as its JSON, keys sorted, and handed back in the summary as the value given", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const sidecar = { project: 'atlas', note: 'work account', tags: ['billing', null], limit: 2.5 }
    await vault.storeBox('anthropic', 'sk-fake', { sidecar })
    expect(storedRowOf(world, 'anthropic')).to.include({ sidecar_json: '{"limit":2.5,"note":"work account","project":"atlas","tags":["billing",null]}' })
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.sidecar).to.deep.equal(sidecar)
    const again = await world.open()
    expect(TH.summaryOf(again.getSnapshot().boxes[0])?.sidecar).to.deep.equal(sidecar)
  })

  it("takes any JSON value, never interpreting it: text with a control character, null, an array", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const sidecars: Sidecar[] = ['beep\u{7}', null, [1, 'two'], 42]
    for (const [ii, sidecar] of sidecars.entries()) {
      await vault.storeBox(`box${String(ii)}`, 'sk-fake', { sidecar })
    }
    expect(vault.getSnapshot().boxes.map((box) => TH.summaryOf(box)?.sidecar)).to.deep.equal(['beep\u{7}', null, [1, 'two'], 42])
  })

  it("leaving it out keeps the sidecar standing; {} empties it; another sidecar replaces it", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-one', { sidecar: { note: 'work account' } })
    await vault.storeBox('anthropic', 'sk-two', { sidecar: undefined })
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.sidecar).to.deep.equal({ note: 'work account' })
    await vault.storeBox('anthropic', 'sk-three', { sidecar: { note: 'personal' } })
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.sidecar).to.deep.equal({ note: 'personal' })
    await vault.storeBox('anthropic', 'sk-four', { sidecar: {} })
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.sidecar).to.deep.equal({})
    await vault.storeBox('anthropic', 'sk-five')
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.sidecar).to.deep.equal({})
  })

  it("refuses a sidecar JSON cannot carry, with kind 'bad_option', writing nothing and quoting none of it", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const unfit = [{ when: new Date() }, { nested: { hook: () => 'SUPERSECRET' } }, { count: NaN }, new Map([['a', 1]])]
    for (const sidecar of unfit) {
      const err = await TH.expectRefusal(vault.storeBox('anthropic', 'sk-fake', { sidecar: sidecar as unknown as Sidecar }), 'bad_option')
      expect(err.message).to.include('sidecar')
      expect(TH.thrownText(err)).to.not.include('SUPERSECRET')
    }
    expect(world.dbStore.ckeys().filter((ckey) => isU1Box(ckey))).to.have.lengthOf(0)
  })

  it("refuses an option beside `sidecar`, as 'bad_option', writing nothing: a note is kept in the sidecar, not beside it", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const misfits = [{ note: 'work account' }, { sidcar: { note: 'work account' } }, { sidecar: {}, note: 'work account' }, 'work account']
    for (const opts of misfits) {
      const err = await TH.expectRefusal(vault.storeBox('anthropic', 'sk-fake', opts as never), 'bad_option')
      expect(err.message).to.include('sidecar')
      expect(err.message).to.not.include('work account')
    }
    expect(world.dbStore.ckeys().filter((ckey) => isU1Box(ckey))).to.have.lengthOf(0)
    await vault.storeBox('anthropic', 'sk-fake', { sidecar: undefined })
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.sidecar).to.deep.equal({})
  })

  it("counts toward maxWhisperBytes with the whisper, refusing the two together as 'whisper_too_large'", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { maxWhisperBytes: 64 })
    // '"' plus 30 characters plus '"': 32 bytes of whisper JSON, and {"note":"..."} around a 20-character note: 31 bytes of sidecar.
    const whisper = 'w'.repeat(30)
    await vault.storeBox('anthropic', whisper, { sidecar: { note: 'n'.repeat(20) } })
    const err = await TH.expectRefusal(vault.storeBox('anthropic', whisper, { sidecar: { note: 'n'.repeat(22) } }), 'whisper_too_large')
    expect(err.message).to.include('sidecar')
    expect(err.message).to.not.include('nnnn')
    // A sidecar kept from the lockbox counts as much as one given.
    await TH.expectRefusal(vault.storeBox('anthropic', `${whisper}ww`), 'whisper_too_large')
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.sidecar).to.deep.equal({ note: 'n'.repeat(20) })
  })

  it("is shown while locked, the stored sidecar as storage holds it", async () => {
    const world = makeWorld()
    const warm = await world.openUnlocked('pw')
    await warm.storeBox('anthropic', 'sk-fake', { sidecar: { note: 'visible while locked' } })
    await warm.lock()
    const cold = await world.open()
    expect(cold.getSnapshot().state).to.eq('locked')
    expect(TH.summaryOf(cold.getSnapshot().boxes[0])?.sidecar).to.deep.equal({ note: 'visible while locked' })
  })

  it("is written beside the whisper's codec, json_v1, and its schema version, 1", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', { apiKey: 'sk-fake' })
    expect(storedRowOf(world, 'anthropic')).to.include({ format: 'safebyok-lockbox-v5', whisper_codec: 'json_v1', whisper_schema_version: 1 })
  })
})

/**
 * `vaultDB` declaring `maxVaultBytes` as given, and otherwise itself: the in-tree local adapters
 * set no limit on a vault, and the limit's check wants one that does.
 */
const declaringVaultBytes = (vaultDB: VaultDB, maxVaultBytes: unknown): VaultDB => (
  Object.create(vaultDB, { maxVaultBytes: { value: maxVaultBytes } }) as VaultDB
)

/**
 * `vaultDB` declaring `maxLockboxes` as given, and otherwise itself: the in-tree local adapters
 * count no lockboxes, and the limit's checks want one that does.
 */
const declaringLockboxes = (vaultDB: VaultDB, maxLockboxes: unknown): VaultDB => (
  Object.create(vaultDB, { maxLockboxes: { value: maxLockboxes } }) as VaultDB
)

/**
 * A lockbox row as a backend files it, with every field but the whisper and its sidecar at its
 * largest: the longest labels, a user_id of 100 UTF-16 code units at three UTF-8 bytes apiece, the
 * latest times, the longest vaultKey epoch, real ciphertext of `whisperBytes` random bytes, and
 * `sidecar` as its sidecar.
 */
const heaviestRowOf = async (whisperBytes: number, sidecar: Sidecar = {}) => {
  const ctx = cipherCtx('a test ctx')
  const lockboxKey = await makeLockboxKey()
  return {
    applabel:               'a'.repeat(40),
    user_id:                '\u{4E00}'.repeat(MaxUserIdChars),
    vaultlabel:             'v'.repeat(40),
    format:                 'safebyok-lockbox-v5',
    boxlabel:               'b'.repeat(40),
    revision_tok:           crypto.randomUUID(),
    vault_key_epoch:        Number.MAX_SAFE_INTEGER,
    lockbox_key_wrapped:    await wrapKeyUnder(await makeVaultKey(), lockboxKey, ctx),
    whisper_ciphered:       await cipherBytes(lockboxKey, randomBytes(whisperBytes), ctx),
    whisper_codec:          'json_v1',
    whisper_schema_version: 1,
    sidecar_json:           TH.sidecarJsonOf(sidecar),
    registered_at:          FarFuture,
    written_at:             FarFuture,
  }
}

/**
 * The heaviest whisper and sidecar a vault of `limitBytes` (its `maxWhisperBytes`) stores, two
 * ways: all whisper, beside an empty sidecar; and a one-byte whisper beside a sidecar of double quotes,
 * each of which its record escapes again, so the sidecar stands at twice its JSON there.
 */
const heaviestSplitsOf = (limitBytes: number) => [
  { whisperBytes: limitBytes - 2, sidecar: {} },
  { whisperBytes: 1, sidecar: '"'.repeat(Math.floor((limitBytes - 3) / 2)) },
]

describe("the lockbox limit", () => {
  it("stores up to maxLockboxes, then refuses a new lockbox as 'vault_full', quoting none of its label", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { maxLockboxes: 2 })
    await vault.storeBox('openai', 'sk-fake-one')
    await vault.storeBox('anthropic', 'sk-ant-fake-two')
    const err = await TH.expectRefusal(vault.storeBox('secret_project_x', 'sk-fake-three'), 'vault_full')
    expect(err.message).to.include('2 lockboxes')
    expect(err.message).to.not.include('secret_project_x')
    expect(boxlabelsOf(vault)).to.deep.equal(['anthropic', 'openai'])
    expect(world.dbStore.ckeys().filter((ckey) => ckey.includes('secret_project_x'))).to.have.lengthOf(0)
  })

  it("holds MaxLockboxes, 100, unless told otherwise", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    for (let ii = 0; ii < MaxLockboxes; ii++) { await vault.storeBox(`box_${String(ii)}`, `sk-fake-${String(ii)}`) }
    expect(vault.getSnapshot().boxes).to.have.lengthOf(100)
    await TH.expectRefusal(vault.storeBox('one_more', 'sk-fake'), 'vault_full')
  })

  it("never refuses a replacement for room: a full vault still takes a new whisper in a box it holds", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { maxLockboxes: 1 })
    await vault.storeBox('openai', 'sk-fake-old')
    await vault.storeBox('openai', 'sk-fake-new')
    expect(await vault.readBox('openai')).to.eq('sk-fake-new')
  })

  it("retiring a lockbox makes room for the next new one", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { maxLockboxes: 1 })
    await vault.storeBox('openai', 'sk-fake-one')
    await TH.expectRefusal(vault.storeBox('anthropic', 'sk-ant-fake'), 'vault_full')
    await vault.retireBox('openai')
    await vault.storeBox('anthropic', 'sk-ant-fake')
    expect(boxlabelsOf(vault)).to.deep.equal(['anthropic'])
  })

  it("checks the limit on a new lockbox only, so lowering it strands nothing already stored", async () => {
    const world = makeWorld()
    const roomy = await world.openUnlocked('pw')
    for (const boxlabel of ['one', 'two', 'three']) { await roomy.storeBox(boxlabel, `sk-fake-${boxlabel}`) }
    roomy.close()
    const tight = await world.open({ maxLockboxes: 2 })
    expect(await tight.readBox('three')).to.eq('sk-fake-three')
    await tight.storeBox('three', 'sk-fake-replaced')
    await tight.retireBox('one')
    await TH.expectRefusal(tight.storeBox('four', 'sk-fake-four'), 'vault_full')
    await tight.retireBox('two')
    await tight.storeBox('four', 'sk-fake-four')
    expect(boxlabelsOf(tight)).to.deep.equal(['four', 'three'])
  })

  it("counts the lockboxes other devices have stored", async () => {
    const world = makeWorld()
    const here = await world.openUnlocked('pw', { maxLockboxes: 2 })
    const there = await world.open()
    await there.storeBox('openai', 'sk-fake-one')
    await there.storeBox('anthropic', 'sk-ant-fake-two')
    await vi.waitFor(() => { expect(here.getSnapshot().boxes).to.have.lengthOf(2) })
    await TH.expectRefusal(here.storeBox('mistral', 'sk-fake-three'), 'vault_full')
  })

  it("catches up with storage before refusing: room another device made unheard is found", async () => {
    const world = makeWorld()
    // This handle hears nothing pushed from storage, so its snapshot falls behind.
    vi.spyOn(world.vaultDB, 'subscribe').mockReturnValueOnce(() => { /* nothing to unsubscribe */ })
    const here = await world.openUnlocked('pw', { maxLockboxes: 1 })
    await here.storeBox('openai', 'sk-fake-one')
    const there = await world.open()
    await there.retireBox('openai')
    expect(boxlabelsOf(here)).to.deep.equal(['openai'])
    await here.storeBox('anthropic', 'sk-ant-fake')
    expect(boxlabelsOf(here)).to.deep.equal(['anthropic'])
  })

  it("opens with the defaults on a backend holding 8 MiB of a vault, as Convex does", async () => {
    const world = makeWorld()
    expect(await world.stateOnOpen({ vaultDB: declaringVaultBytes(world.vaultDB, 8 * 1024 * 1024) })).to.eq('absent')
  })

  it("refuses a maxLockboxes and maxWhisperBytes the adapter might not hold together, naming both and its limit", async () => {
    const world = makeWorld()
    const vaultDB = declaringVaultBytes(world.vaultDB, 8 * 1024 * 1024)
    const err = await TH.expectRefusal(world.open({ vaultDB, maxLockboxes: 103 }), 'bad_option')
    expect(err.message).to.include('maxLockboxes')
    expect(err.message).to.include('maxWhisperBytes')
    expect(err.message).to.include('8388608 bytes')
    expect(err.message).to.include('at most 102 lockboxes')
  })

  it("lets the host raise either limit while the pair still fits", async () => {
    const world = makeWorld()
    const vaultDB = declaringVaultBytes(world.vaultDB, 8 * 1024 * 1024)
    await world.open({ vaultDB, maxLockboxes: 1000, maxWhisperBytes: 3000 })
    await world.open({ vaultDB, maxLockboxes: 1, maxWhisperBytes: 500_000 })
    await TH.expectRefusal(world.open({ vaultDB, maxLockboxes: 1000, maxWhisperBytes: 4000 }), 'bad_option')
  })

  it("counts room for each lockbox's other fields, so a vault of tiny whispers cannot be made unerasable", async () => {
    const world = makeWorld()
    const vaultDB = declaringVaultBytes(world.vaultDB, 8 * 1024 * 1024)
    await world.open({ vaultDB, maxLockboxes: 8176, maxWhisperBytes: 1 })
    await TH.expectRefusal(world.open({ vaultDB, maxLockboxes: 8177, maxWhisperBytes: 1 }), 'bad_option')
  })

  for (const limitBytes of [3, 100, 2048, MaxWhisperBytes]) {
    it(`counts room enough for a lockbox of ${String(limitBytes)} whisper and sidecar bytes, its other fields at their largest`, async () => {
      for (const { whisperBytes, sidecar } of heaviestSplitsOf(limitBytes)) {
        const row = await heaviestRowOf(whisperBytes, sidecar)
        expect(Lockbox.safeParse(row).success).to.be.true
        expect(VaultScope.safeParse(row).success).to.be.true
        const rowBytes = new TextEncoder().encode(JSON.stringify(row)).length
        expect(rowBytes).to.be.at.most((limitBytes * StoredBytesPerWhisperByte) + LockboxFieldsBytes)
      }
    })
  }

  it("refuses a maxLockboxes that is not a whole number above zero", async () => {
    const world = makeWorld()
    for (const nonsense of [0, -1, 1.5, NaN]) {
      await TH.expectRefusal(world.open({ maxLockboxes: nonsense }), 'bad_option')
    }
  })

  it("refuses an adapter that declares no maxVaultBytes, no maxRecordBytes, or no maxLockboxes", async () => {
    const world = makeWorld()
    for (const undeclared of [undefined, NaN, 0, -1]) {
      const noVaultLimit = await TH.expectRefusal(world.open({ vaultDB: declaringVaultBytes(world.vaultDB, undeclared) }), 'bad_option')
      expect(noVaultLimit.message).to.include('maxVaultBytes')
      const noRecordLimit = Object.create(world.vaultDB, { maxRecordBytes: { value: undeclared } }) as VaultDB
      const err = await TH.expectRefusal(world.open({ vaultDB: noRecordLimit }), 'bad_option')
      expect(err.message).to.include('maxRecordBytes')
      const noLockboxLimit = await TH.expectRefusal(world.open({ vaultDB: declaringLockboxes(world.vaultDB, undeclared) }), 'bad_option')
      expect(noLockboxLimit.message).to.include('does not declare maxLockboxes')
    }
  })

  it("refuses an adapter whose maxLockboxes is no whole number, or past the largest it keeps", async () => {
    const world = makeWorld()
    for (const misdeclared of [1.5, '100', -Infinity, Number.MAX_SAFE_INTEGER + 2]) {
      await TH.expectRefusal(world.open({ vaultDB: declaringLockboxes(world.vaultDB, misdeclared) }), 'bad_option')
    }
  })

  it("refuses a maxLockboxes over the adapter's own, naming the adapter's", async () => {
    const world = makeWorld()
    const vaultDB = declaringLockboxes(world.vaultDB, 50)
    expect(await world.stateOnOpen({ vaultDB, maxLockboxes: 50 })).to.eq('absent')
    const err = await TH.expectRefusal(world.open({ vaultDB, maxLockboxes: 51 }), 'bad_option')
    expect(err.message).to.include('maxLockboxes')
    expect(err.message).to.include('50 lockboxes')
  })

  it("holds the adapter's own maxLockboxes, unless told otherwise, when it is under MaxLockboxes", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { vaultDB: declaringLockboxes(world.vaultDB, 2) })
    await vault.storeBox('openai', 'sk-fake-one')
    await vault.storeBox('anthropic', 'sk-ant-fake-two')
    const err = await TH.expectRefusal(vault.storeBox('mistral', 'sk-fake-three'), 'vault_full')
    expect(err.message).to.include('2 lockboxes')
  })

  it("holds MaxLockboxes, unless told otherwise, on an adapter holding more", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { vaultDB: declaringLockboxes(world.vaultDB, 8000) })
    for (let ii = 0; ii < MaxLockboxes; ii++) { await vault.storeBox(`box_${String(ii)}`, `sk-fake-${String(ii)}`) }
    const err = await TH.expectRefusal(vault.storeBox('one_more', 'sk-fake'), 'vault_full')
    expect(err.message).to.include(`${String(MaxLockboxes)} lockboxes`)
  })

  it("takes an adapter's Infinity, or a large whole number, for no limit on its lockboxes", async () => {
    const world = makeWorld()
    expect(world.vaultDB.maxLockboxes).to.eq(Infinity)
    expect(await world.stateOnOpen({ maxLockboxes: 1_000_000_000 })).to.eq('absent')
    const unlimitedish = declaringLockboxes(world.vaultDB, 1_200_300_400_500_600)
    expect(await world.stateOnOpen({ vaultDB: unlimitedish, maxLockboxes: 1_000_000_000 })).to.eq('absent')
    const err = await TH.expectRefusal(world.open({ vaultDB: unlimitedish, maxLockboxes: 1_200_300_400_500_601 }), 'bad_option')
    expect(err.message).to.include('1200300400500600 lockboxes')
  })

  it("takes an adapter's Infinity, for no limit, as the largest finite limit, so nothing past Vault.make holds Infinity", async () => {
    const world = makeWorld()
    const unlimited = String(Number.MAX_SAFE_INTEGER)
    expect(world.vaultDB.maxVaultBytes).to.eq(Infinity)
    await world.open({ maxLockboxes: 1_000_000_000 })
    const tooManyBoxes = await TH.expectRefusal(world.open({ maxLockboxes: 9_000_000_000_000 }), 'bad_option')
    expect(tooManyBoxes.message).to.include(`${unlimited} bytes`)
    expect(tooManyBoxes.message).to.not.include('Infinity')
    const noRecordLimit = Object.create(world.vaultDB, { maxRecordBytes: { value: Infinity } }) as VaultDB
    await world.open({ vaultDB: noRecordLimit, maxLockboxes: 1, maxWhisperBytes: 1_000_000_000 })
    const tooLarge = await TH.expectRefusal(world.open({ vaultDB: noRecordLimit, maxWhisperBytes: Number.MAX_SAFE_INTEGER }), 'bad_option')
    expect(tooLarge.message).to.include(`${unlimited} bytes`)
    expect(tooLarge.message).to.not.include('Infinity')
  })

  it("says so plainly when not even one lockbox of that maxWhisperBytes fits", async () => {
    const world = makeWorld()
    const vaultDB = declaringVaultBytes(world.vaultDB, world.vaultDB.maxRecordBytes)
    const err = await TH.expectRefusal(world.open({ vaultDB, maxWhisperBytes: 524_288 }), 'bad_option')
    expect(err.message).to.include('not even one lockbox fits')
    expect(err.message).to.not.include('at most 0')
  })
})

/**
 * What a host keeping labels in any script might pass: any text of 1 to 200 characters for each
 * label, written in classic Zod, as most hosts write it.
 */
const AnyScript = {
  applabel:   ZClassic.string().min(1).max(200),
  vaultlabel: ZClassic.string().min(1).max(200),
  boxlabel:   ZClassic.string().min(1).max(200),
}

/** A scope of names a kibibyte long, which only a host's validators admit: heavier than the default fields' plan. */
const LongScope = { applabel: 'a'.repeat(1000), vaultlabel: 'v'.repeat(1000) } as const

/** Labels no default check admits: punctuation the ckeys and ctx once leaned on, and Hebrew, Arabic and Thai text. */
const ScriptLabels = ['OpenAI: work', String.raw`say "hi", \ [ok]`, 'מפתח API של העבודה', 'مفتاح العمل', 'กุญแจงาน', 'Mixed: English, עברית, العربية, ไทย'] as const

describe("the host's validators", () => {
  it("replace ours outright: a vault keeps labels in any script, and reads each back", async () => {
    const world = makeWorld({ validators: AnyScript, applabel: 'Acme: אקמה', vaultlabel: 'ราก' })
    const vault = await world.openUnlocked('pw')
    for (const [ii, boxlabel] of ScriptLabels.entries()) {
      await vault.storeBox(boxlabel, `sk-fake-${String(ii)}`, { sidecar: { note: `${boxlabel} — ${'ノート'.repeat(100)}` } })
    }
    expect(boxlabelsOf(vault)).to.have.members([...ScriptLabels])
    for (const [ii, boxlabel] of ScriptLabels.entries()) {
      expect(await vault.readBox(boxlabel)).to.eq(`sk-fake-${String(ii)}`)
    }
    await vault.retireBox(ScriptLabels[0])
    expect(boxlabelsOf(vault)).to.not.include(ScriptLabels[0])
    vault.close()
    const again = await world.openUnlocked('pw')
    expect(boxlabelsOf(again)).to.have.lengthOf(ScriptLabels.length - 1)
  })

  it("take AnyTextValidators whole, as its example shows: any text above the floor names a vault and its lockboxes", async () => {
    const world = makeWorld({ validators: AnyTextValidators })
    const vault = await world.openUnlocked('pw', { applabel: 'Acme Corp', userId: 'alice smith', vaultlabel: 'Main vault' })
    await vault.storeBox('Work: מפתח API', 'sk-fake', { sidecar: { note: 'n'.repeat(4000) } })
    await vault.storeBox(String.raw`["box","acme"] \ x`, 'sk-fake-two')
    expect(await vault.readBox('Work: מפתח API')).to.eq('sk-fake')
    expect(boxlabelsOf(vault)).to.have.lengthOf(2)
    await TH.expectRefusal(vault.storeBox('', 'sk-fake'), 'bad_label')
    await TH.expectRefusal(world.open({ validators: AnyTextValidators, userId: '' }), 'bad_label')
  })

  it("never widen the floor: a host's z.string() still meets a refusal of half a character, a control character or a decomposed letter", async () => {
    const world = makeWorld({ validators: { boxlabel: ZClassic.string(), userId: ZClassic.string() } })
    const vault = await world.openUnlocked('pw')
    for (const boxlabel of ['key \u{D83D}', 'tab\there', 'cafe\u{301}', 'n'.repeat(NameFloorBytes + 1)]) {
      await TH.expectRefusal(vault.storeBox(boxlabel, 'sk-fake'), 'bad_label')
    }
    await TH.expectRefusal(world.open({ userId: 'u1\u{D800}' }), 'bad_label')
    expect(world.dbStore.ckeys().filter((ckey) => isU1Box(ckey))).to.have.lengthOf(0)
  })

  it("never let a name hold ^, which storage joins names on: refused at Vault.make and at storeBox(), whatever the validators", async () => {
    const world = makeWorld({ validators: AnyTextValidators })
    const err = await TH.expectRefusal(world.open({ userId: 'alice^admin' }), 'bad_label')
    expect(err.message).to.include('userId')
    expect(err.message).to.include('no ^')
    expect(TH.thrownText(err)).to.not.include('alice')
    await TH.expectRefusal(world.open({ vaultlabel: 'main^x' }), 'bad_label')
    const vault = await world.openUnlocked('pw')
    const stored = await TH.expectRefusal(vault.storeBox('anthro^pic', 'sk-fake'), 'bad_label')
    expect(stored.message).to.include('boxlabel')
    expect(boxlabelsOf(vault)).to.deep.equal([])
  })

  it("refuse a user_id of 101 characters at Vault.make, under the default check", async () => {
    const world = makeWorld()
    const err = await TH.expectRefusal(world.open({ userId: 'u'.repeat(MaxUserIdChars + 1) }), 'bad_label')
    expect(err.message).to.include('at most 100 characters')
    expect(await world.stateOnOpen({ userId: 'u'.repeat(MaxUserIdChars) })).to.eq('absent')
  })

  it("refuse, as ours would, what they refuse: a host narrows the user id to its auth's shape", async () => {
    const clerkUserId = ZClassic.string().regex(/^user_[A-Za-z0-9]{27}$/)
    const world = makeWorld({ validators: { userId: clerkUserId } })
    expect(await world.stateOnOpen({ userId: `user_${'A'.repeat(27)}` })).to.eq('absent')
    const err = await TH.expectRefusal(world.open({ userId: 'alice@example.com' }), 'bad_label')
    expect(err.message).to.include('userId')
    expect(TH.thrownText(err)).to.not.include('alice')
  })

  it("keep ours for every field a host leaves out", async () => {
    const world = makeWorld({ validators: { vaultlabel: AnyScript.vaultlabel } })
    const vault = await world.openUnlocked('pw', { vaultlabel: 'Main vault' })
    await TH.expectRefusal(vault.storeBox('Not A Label', 'sk-fake'), 'bad_label')
    await vault.storeBox('anthropic', 'sk-fake')
    await TH.expectRefusal(world.open({ applabel: 'Acme' }), 'bad_label')
  })

  it("refuse a note check, as there is no note: a host checks its sidecar itself", async () => {
    const world = makeWorld()
    await TH.expectRefusal(world.open({ validators: { note: ZClassic.string() } as never }), 'bad_option')
  })

  it("take a mini schema as readily as a classic one", async () => {
    const world = makeWorld({ validators: { boxlabel: Z.string().check(Z.minLength(1), Z.maxLength(80)) } })
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('Anthropic API key', 'sk-fake')
    expect(await vault.readBox('Anthropic API key')).to.eq('sk-fake')
  })

  it("only check: what the vault keeps and binds is what it was handed, never what a schema made of it", async () => {
    const trimming = { boxlabel: ZClassic.string().trim().toLowerCase().min(1), userId: ZClassic.string().trim().min(1) }
    const world = makeWorld({ validators: trimming })
    const vault = await world.openUnlocked('pw', { userId: '  U1  ' })
    expect(vault.getSnapshot().scope.user_id).to.eq('  U1  ')
    await vault.storeBox('  Padded Box  ', 'sk-fake')
    expect(boxlabelsOf(vault)).to.deep.equal(['  Padded Box  '])
    expect(await vault.readBox('  Padded Box  ')).to.eq('sk-fake')
    await TH.expectRefusal(vault.readBox('padded box'), 'absent_box')
  })

  it("never pass a host schema's issues along, which may quote the name", async () => {
    const quoting = ZClassic.string().refine(() => false, { error: (issue) => `no such label ${String(issue.input)}` })
    const world = makeWorld({ validators: { boxlabel: quoting } })
    const vault = await world.openUnlocked('pw')
    const err = await TH.expectRefusal(vault.storeBox('secret_project_x', 'sk-fake'), 'bad_label')
    expect(TH.thrownText(err)).to.not.include('secret_project_x')
  })

  it("refuse an async check, or one that throws, as misuse", async () => {
    const world = makeWorld()
    const asyncCheck = ZClassic.string().refine(async () => { await TH.wakeupAtNextTick(); return true })
    await TH.expectRefusal(world.open({ validators: { applabel: asyncCheck } }), 'bad_option')
    const throwing = ZClassic.string().refine(() => { throw new Error('the host check fell over') })
    const vault = await world.openUnlocked('pw', { validators: { boxlabel: throwing } })
    await TH.expectRefusal(vault.storeBox('anthropic', 'sk-fake'), 'bad_option')
  })

  it("are the vault's alone, checked at its entry: no VaultDB verb is handed them, and every verb takes a name they admitted", async () => {
    const longUserId = ZClassic.string().min(1).max(300)
    const world = makeWorld({ validators: { userId: longUserId }, userId: 'u'.repeat(200) })
    const verbs = ['readVaultProps', 'fetchOrCreateVaultProps', 'updateVaultProps', 'readBox', 'listBoxes', 'updateBox', 'retireBox', 'retireVault', 'subscribe'] as const
    const spies = verbs.map((verb) => vi.spyOn(world.vaultDB, verb))
    const vault = await world.openUnlocked('pw one')
    await vault.storeBox('anthropic', 'sk-fake')
    expect(await vault.readBox('anthropic')).to.eq('sk-fake')
    await vault.changePassphrase('pw one', 'pw two')
    await vault.retireBox('anthropic')
    await vault.retire()
    for (const [ii, spy] of spies.entries()) {
      expect(spy.mock.calls.length, verbs[ii]).to.be.above(0)
      for (const args of spy.mock.calls) {
        expect(args, verbs[ii]).to.not.include(longUserId)
      }
    }
  })

  it("refuse a bag holding anything but schemas, or a field the bag does not know, before storage is touched", async () => {
    const world = makeWorld()
    const readVaultProps = vi.spyOn(world.vaultDB, 'readVaultProps')
    const misfits = ['acme', 42, { boxlabel: 'Label' }, { boxlabel: /^[a-z]+$/ }, { boxLabel: ZClassic.string() }, { userID: ZClassic.string() }]
    for (const validators of misfits) {
      const err = await TH.expectRefusal(world.open({ validators: validators as unknown as MakeVaultOpts['validators'] }), 'bad_option')
      expect(err.message).to.include('validators')
    }
    expect(readVaultProps).not.toHaveBeenCalled()
    expect(await world.stateOnOpen({ validators: undefined })).to.eq('absent')
    expect(await world.stateOnOpen({ validators: { boxlabel: undefined } })).to.eq('absent')
  })

  it("list a lockbox stored under a boxlabel narrowed checks refuse as sound, read it, and retireBox() removes it by that name", async () => {
    const world = makeWorld()
    const roomy = await world.openUnlocked('pw', { validators: AnyScript })
    await roomy.storeBox('OpenAI: work', 'sk-fake')
    await roomy.storeBox('anthropic', 'sk-ant-fake')
    roomy.close()
    const narrow = await world.openUnlocked('pw')
    expect(narrow.getSnapshot().boxes.map((box) => [box.boxlabel, box.damaged])).to.deep.equal([['OpenAI: work', false], ['anthropic', false]])
    expect(await narrow.readBox('OpenAI: work')).to.eq('sk-fake')
    expect(await narrow.useBox('OpenAI: work', (whisper) => whisper)).to.eq('sk-fake')
    await narrow.retireBox('OpenAI: work')
    expect(world.dbStore.read(u1BoxCkey('OpenAI: work'))).to.be.null
    expect(boxlabelsOf(narrow)).to.deep.equal(['anthropic'])
  })

  it("retireBox() reads storage once for the lockbox it retires, under a refused boxlabel or a passing one", async () => {
    const world = makeWorld()
    const roomy = await world.openUnlocked('pw', { validators: AnyScript })
    await roomy.storeBox('OpenAI: work', 'sk-fake')
    await roomy.storeBox('anthropic', 'sk-ant-fake')
    roomy.close()
    const narrow = await world.openUnlocked('pw')
    const readBox = vi.spyOn(world.vaultDB, 'readBox')
    await narrow.retireBox('OpenAI: work')
    expect(readBox.mock.calls).to.have.lengthOf(1)
    await narrow.retireBox('anthropic')
    expect(readBox.mock.calls).to.have.lengthOf(2)
    await TH.expectRefusal(narrow.retireBox('OpenAI: work'), 'bad_label')
    expect(readBox.mock.calls).to.have.lengthOf(3)
    expect(boxlabelsOf(narrow)).to.deep.equal([])
  })

  it("check each new way in's wayinlabel with the host's wayinlabel check, at addPassphrase and addPasskey", async () => {
    const world = makeWorld({ validators: { wayinlabel: ZClassic.string().min(1).max(60) } })
    const vault = await world.openUnlocked('pw')
    await vault.addPassphrase('pw', 'pw two', { wayinlabel: 'Written down, in the drawer' })
    await vault.addPasskey('pw', () => TH.passkeyOf('laptop'), { wayinlabel: 'Laptop: fingerprint' })
    expect(wayinlabelsOf(vault)).to.deep.equal(['passphrase', 'Written down, in the drawer', 'Laptop: fingerprint'])
    const err = await TH.expectRefusal(vault.addPassphrase('pw', 'pw three', { wayinlabel: 'u'.repeat(61) }), 'bad_label')
    expect(err.message).to.include('wayinlabel')
    expect(err.message).to.not.include('uuu')
    const makePasskey = vi.fn(() => TH.passkeyOf('phone'))
    await TH.expectRefusal(vault.addPasskey('pw', makePasskey, { wayinlabel: '' }), 'bad_label')
    expect(makePasskey).not.toHaveBeenCalled()
    expect(wayinlabelsOf(vault)).to.have.lengthOf(3)
  })

  it("refuse a taken wayinlabel or passkey, under a host's check that admits any text, quoting no wayinlabel", async () => {
    const vault = await makeWorld({ validators: { wayinlabel: ZClassic.string() } }).openUnlocked('pw')
    await vault.addPassphrase('pw', 'pw two', { wayinlabel: 'sk-ant-fake-pasted-phrase' })
    await vault.addPasskey('pw', () => TH.passkeyOf('laptop'), { wayinlabel: 'sk-ant-fake-pasted-passkey' })
    const takenLabel = await TH.expectRefusal(vault.addPassphrase('pw', 'pw three', { wayinlabel: 'sk-ant-fake-pasted-phrase' }), 'bad_label')
    expect(TH.thrownText(takenLabel)).to.not.include('sk-ant-fake')
    const takenPasskey = await TH.expectRefusal(vault.addPasskey('pw', () => TH.passkeyOf('laptop'), { wayinlabel: 'laptop_again' }), 'bad_option')
    expect(TH.thrownText(takenPasskey)).to.not.include('sk-ant-fake')
    expect(wayinlabelsOf(vault)).to.have.lengthOf(3)
  })

  it("refuse an empty wayinlabel as bad_label, though the host's wayinlabel check admits it", async () => {
    const vault = await makeWorld({ validators: AnyTextValidators }).openUnlocked('pw')
    await TH.expectRefusal(vault.addPassphrase('pw', 'pw two', { wayinlabel: '' }), 'bad_label')
    const makePasskey = vi.fn(() => TH.passkeyOf('phone'))
    await TH.expectRefusal(vault.addPasskey('pw', makePasskey, { wayinlabel: '' }), 'bad_label')
    expect(makePasskey).not.toHaveBeenCalled()
    expect(wayinlabelsOf(vault)).to.deep.equal(['passphrase'])
  })

  it("check a wayinlabel with Label when the host gives no wayinlabel check, saying what was wrong", async () => {
    const vault = await makeWorld({ validators: AnyScript }).openUnlocked('pw')
    const err = await TH.expectRefusal(vault.addPassphrase('pw', 'pw two', { wayinlabel: 'Written down' }), 'bad_label')
    expect(err.message).to.include('lowercase')
    expect(wayinlabelsOf(vault)).to.deep.equal(['passphrase'])
  })

  it("leave a way in stored under a wayinlabel narrowed checks refuse opening the vault, listed as it is", async () => {
    const world = makeWorld()
    const roomy = await world.openUnlocked('pw', { validators: { wayinlabel: ZClassic.string() } })
    await roomy.addPassphrase('pw', 'home pw', { wayinlabel: 'Home phrase' })
    roomy.close()
    const narrow = await world.open({ deviceDB: memoryDeviceDB() })
    expect(wayinlabelsOf(narrow)).to.deep.equal(['passphrase', 'Home phrase'])
    await narrow.unlock('home pw')
    expect(narrow.getSnapshot().state).to.eq('unlocked')
  })

  it("name a vault's first way in 'passphrase' whatever the host's wayinlabel check, which checks only the ways in it adds", async () => {
    const world = makeWorld({ validators: { wayinlabel: ZClassic.string().startsWith('my_') } })
    const vault = await world.openUnlocked('pw')
    expect(wayinlabelsOf(vault)).to.deep.equal(['passphrase'])
    await TH.expectRefusal(vault.addPassphrase('pw', 'pw two', { wayinlabel: 'spare' }), 'bad_label')
    await vault.addPassphrase('pw', 'pw two', { wayinlabel: 'my_spare' })
    expect(wayinlabelsOf(vault)).to.deep.equal(['passphrase', 'my_spare'])
  })

  it("never list a row planted under a name below the floor, which no call could reach", async () => {
    const world = makeWorld({ validators: { boxlabel: ZClassic.string() } })
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake')
    world.dbStore.write(u1BoxCkey('key \u{D83D}'), JSON.stringify({ ...storedRowOf(world, 'anthropic'), boxlabel: 'key \u{D83D}' }))
    world.dbStore.write(u1BoxCkey('bell\u{7}'), JSON.stringify({ ...storedRowOf(world, 'anthropic'), boxlabel: 'bell\u{7}' }))
    const fresh = await world.openUnlocked('pw')
    expect(boxlabelsOf(fresh)).to.deep.equal(['anthropic'])
    await TH.expectRefusal(fresh.retireBox('key \u{D83D}'), 'bad_label')
    await TH.expectRefusal(fresh.readBox('bell\u{7}'), 'bad_label')
  })

  it("refuses a store under a refused boxlabel as 'bad_label', over a lockbox stored there or not, writing nothing", async () => {
    const world = makeWorld()
    const roomy = await world.openUnlocked('pw', { validators: AnyScript })
    await roomy.storeBox('OpenAI: work', 'sk-fake', { sidecar: { note: 'personal account' } })
    roomy.close()
    const stored = world.dbStore.read(u1BoxCkey('OpenAI: work'))
    const narrow = await world.openUnlocked('pw')
    await TH.expectRefusal(narrow.storeBox('OpenAI: work', 'sk-new'), 'bad_label')
    expect(world.dbStore.read(u1BoxCkey('OpenAI: work'))).to.eq(stored)
    expect(narrow.getSnapshot().boxes.map((box) => [box.boxlabel, box.damaged])).to.deep.equal([['OpenAI: work', false]])
    await TH.expectRefusal(narrow.storeBox('Other: box', 'sk-fake'), 'bad_label')
    await TH.expectRefusal(narrow.retireBox('Other: box'), 'bad_label')
    expect(world.dbStore.read(u1BoxCkey('Other: box'))).to.be.null
  })
})

/** `vaultDB` declaring `maxRecordBytes` as given, and otherwise itself. */
const declaringRecordBytes = (vaultDB: VaultDB, maxRecordBytes: number): VaultDB => (
  Object.create(vaultDB, { maxRecordBytes: { value: maxRecordBytes } }) as VaultDB
)

describe("what a lockbox weighs in storage", () => {
  it("refuses, as 'lockbox_too_large', a lockbox heavier than storage holds in one record, writing nothing", async () => {
    const world = makeWorld({ validators: AnyTextValidators })
    const vaultDB = declaringRecordBytes(world.vaultDB, 2048)
    const vault = await world.openUnlocked('pw', { vaultDB, maxWhisperBytes: 1024 })
    await vault.storeBox('anthropic', 'sk-fake', { sidecar: 'n'.repeat(1000) })
    // A sidecar of double quotes stands at twice its JSON in its record, each escaped again.
    const err = await TH.expectRefusal(vault.storeBox('openai', 'sk-fake', { sidecar: '"'.repeat(490) }), 'lockbox_too_large')
    expect(err.message).to.include('2048')
    expect(boxlabelsOf(vault)).to.deep.equal(['anthropic'])
  })

  it("refuses, as 'vault_full', a lockbox whose names would take the vault past what storage holds of it", async () => {
    const world = makeWorld({ validators: AnyTextValidators })
    // Room for three lockboxes of the default fields' plan, each a whisper of 1000 bytes; names
    // of half a kibibyte take more than that plan, so two fit and a third does not.
    const vaultDB = declaringVaultBytes(world.vaultDB, 3 * ((1000 * StoredBytesPerWhisperByte) + LockboxFieldsBytes))
    const halfLongScope = { applabel: 'a'.repeat(500), vaultlabel: 'v'.repeat(500) }
    const vault = await world.openUnlocked('pw', { vaultDB, maxWhisperBytes: 1000, maxLockboxes: 3, ...halfLongScope })
    await vault.storeBox('one', 'sk-fake')
    await vault.storeBox('two', 'sk-fake')
    const err = await TH.expectRefusal(vault.storeBox('three', 'sk-fake'), 'vault_full')
    expect(err.message).to.include('shorter boxlabel')
    expect(boxlabelsOf(vault)).to.deep.equal(['one', 'two'])
    await vault.retireBox('one')
    await vault.storeBox('three', 'sk-fake')
    expect(boxlabelsOf(vault)).to.deep.equal(['three', 'two'])
  })

  it("never refuses a replacement, which weighs what it replaces, even in a vault over its limit", async () => {
    const world = makeWorld({ validators: AnyTextValidators })
    const roomy = await world.openUnlocked('pw', LongScope)
    await roomy.storeBox('one', 'sk-fake')
    await roomy.storeBox('two', 'sk-fake')
    roomy.close()
    const vaultDB = declaringVaultBytes(world.vaultDB, 2 * ((1000 * StoredBytesPerWhisperByte) + LockboxFieldsBytes))
    const tight = await world.open({ vaultDB, maxWhisperBytes: 1000, maxLockboxes: 2, ...LongScope })
    await tight.storeBox('one', 'sk-fake-new', { sidecar: { note: 'n'.repeat(900) } })
    await tight.storeBox('two', 'sk-fake-new')
    expect(TH.summaryOf(tight.getSnapshot().boxes[0])?.sidecar).to.deep.equal({ note: 'n'.repeat(900) })
  })

  for (const limitBytes of [3, 100, 2048, MaxWhisperBytes]) {
    it(`weighs a lockbox of ${String(limitBytes)} whisper and sidecar bytes, its names at their longest, at no less than it stores as`, async () => {
      for (const { whisperBytes, sidecar } of heaviestSplitsOf(limitBytes)) {
        const row = await heaviestRowOf(whisperBytes, sidecar)
        const { applabel, user_id, vaultlabel, boxlabel } = row
        const weight = (limitBytes * StoredBytesPerWhisperByte) + LockboxFixedBytes + jsonBytes([{ applabel, user_id, vaultlabel }, boxlabel])
        expect(jsonBytes(row)).to.be.at.most(weight)
      }
    })
  }

  it("plans no less at Vault.make than a store weighs a lockbox at the default checks' longest", async () => {
    const { applabel, user_id, vaultlabel, boxlabel } = await heaviestRowOf(1)
    expect(LockboxFixedBytes + jsonBytes([{ applabel, user_id, vaultlabel }, boxlabel])).to.be.at.most(LockboxFieldsBytes)
  })
})

describe("while locked", () => {
  it("every whisper-touching operation refuses with kind 'vault_locked'", async () => {
    const world = makeWorld()
    const warm = await world.openUnlocked('pw')
    await warm.storeBox('anthropic', 'sk-fake')
    await warm.lock()
    await TH.expectRefusal(warm.readBox('anthropic'), 'vault_locked')
    await TH.expectRefusal(warm.storeBox('anthropic', 'sk-new'), 'vault_locked')
    await TH.expectRefusal(warm.useBox('anthropic', (whisper) => whisper), 'vault_locked')
    await TH.expectRefusal(warm.retireBox('anthropic'), 'vault_locked')
  })

  it("lockbox summaries stay readable: that is what public metadata is for", async () => {
    const world = makeWorld()
    const warm = await world.openUnlocked('pw')
    await warm.storeBox('anthropic', 'sk-fake', { sidecar: { note: 'visible while locked' } })
    await warm.lock()
    const cold = await world.open()
    expect(cold.getSnapshot().state).to.eq('locked')
    expect(boxlabelsOf(cold)).to.deep.equal(['anthropic'])
  })
})

describe("useBox", () => {
  it("hands the whisper to the callback and returns its result", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake')
    const shouted = await vault.useBox('anthropic', (whisper) => (typeof whisper === 'string' ? whisper.toUpperCase() : ''))
    expect(shouted).to.eq('SK-FAKE')
  })

  it("passes an async callback's rejection through untouched", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake')
    await expect(vault.useBox('anthropic', () => Promise.reject(new Error('the API said no')))).rejects.toThrow('the API said no')
  })

  it("refuses a callback that is not a function before it opens the lockbox", async () => {
    const world = makeWorld()
    const vault = await world.open()
    const err = await TH.expectRefusal(vault.useBox('anthropic', 'not a callback' as unknown as () => void), 'bad_option')
    expect(err.message).to.include('callback function')
  })
})

/** A stored lockbox row, as text, with its whisper's ciphertext bent a little. */
const withTweakedCiphertext = (row: Record<string, unknown>): string => {
  const ciphered = row['whisper_ciphered'] as { cipher_iv_b64: string, ciphertext_b64: string }
  const tweaked = TH.tweakB64(ciphered.ciphertext_b64)
  return JSON.stringify({ ...row, whisper_ciphered: { ...ciphered, ciphertext_b64: tweaked } })
}

/** Ways a stored lockbox row can be spoiled so that it reads as 'damaged_lockbox'. */
const SpoiledBoxes = [
  [withTweakedCiphertext,                                                                        'whose ciphertext was altered, so it fails verification'],
  [({ whisper_ciphered: _gone, ...row }: Record<string, unknown>) => JSON.stringify(row),       'missing its whisper, so it is no lockbox this package knows'],
  [(row: Record<string, unknown>) => JSON.stringify({ ...row, boxlabel: 'other_box' }),          'naming another boxlabel than the one it is stored under'],
  [() => '{"not": json',                                                                         'that is not JSON at all'],
] as const

describe("retireBox and retire", () => {
  for (const [spoil, blurb] of SpoiledBoxes) {
    it(`retireBox removes a lockbox ${blurb}, and leaves the vault's other boxes as they were`, async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw')
      await vault.storeBox('anthropic', 'sk-ant-fake')
      await vault.storeBox('openai', 'sk-openai-fake', { sidecar: { note: 'work account' } })
      world.dbStore.write(u1BoxCkey('anthropic'), spoil(storedRowOf(world, 'anthropic')))
      await TH.expectRefusal(vault.readBox('anthropic'), 'damaged_lockbox')
      await vault.retireBox('anthropic')
      expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.be.null
      expect(boxlabelsOf(vault)).to.deep.equal(['openai'])
      expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.sidecar).to.deep.equal({ note: 'work account' })
      expect(await vault.readBox('openai')).to.eq('sk-openai-fake')
    })
  }

  it("retireBox of a lockbox that fails verification still needs the vault unlocked, and leaves it as it is", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-ant-fake')
    const [spoil] = SpoiledBoxes[0]
    const spoiled = spoil(storedRowOf(world, 'anthropic'))
    world.dbStore.write(u1BoxCkey('anthropic'), spoiled)
    await vault.lock()
    await TH.expectRefusal(vault.retireBox('anthropic'), 'vault_locked')
    expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.eq(spoiled)
  })

  it("retireBox removes the box; a second retireBox finds it absent", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake')
    await vault.retireBox('anthropic')
    expect(vault.getSnapshot().boxes).to.have.lengthOf(0)
    await TH.expectRefusal(vault.retireBox('anthropic'), 'absent_box')
  })

  it("retire removes every trace of this vault, and only this vault", async () => {
    const world = makeWorld()
    const mine = await world.openUnlocked('my pw')
    await mine.storeBox('anthropic', 'mine')
    const theirs = await world.openUnlocked('their pw', { userId: 'u2' })
    await theirs.storeBox('anthropic', 'theirs')

    await mine.retire()
    expect(mine.getSnapshot().state).to.eq('absent')
    expect(world.dbStore.ckeys().filter((ckey) => ckey.includes(':u1:'))).to.have.lengthOf(0)
    expect(await theirs.readBox('anthropic')).to.eq('theirs')
  })

  it("retire works on a locked vault: owning the account is enough to delete it", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake')
    await vault.lock()
    await vault.retire()
    expect(vault.getSnapshot().state).to.eq('absent')
  })

  it("retire on a handle that has seen no vault looks first, and retires the one made elsewhere since: 'delete my vault' never reports success over one standing", async () => {
    const world = makeWorld()
    const handle = await world.open({ vaultDB: world.deafVaultDB() })
    expect(handle.getSnapshot().state).to.eq('absent')
    const elsewhere = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
    await elsewhere.storeBox('anthropic', 'sk-fake')
    await handle.retire()
    expect(handle.getSnapshot().state).to.eq('absent')
    expect(rowsOf(world, 'u1')).to.deep.equal([])
  })

  it("retire on a vault already gone is quiet: a second retire finds nothing to refuse", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.retire()
    await vault.unlock('pw')
    await vault.retire()
    await vault.retire()
    expect(vault.getSnapshot().state).to.eq('absent')
  })
})

/** The ckeys of every row `userId`'s vault has in storage: its vault props and its lockboxes. */
const rowsOf = (world: ReturnType<typeof makeWorld>, userId: string) => (
  world.dbStore.ckeys().filter((ckey) => ckey === Ckeys.vaultProps(TH.scopeOf(userId)) || Ckeys.isBoxIn(TH.scopeOf(userId))(ckey))
)

/** A world whose `u1` vault, with a lockbox and a lease, has had its stored vault props spoiled. */
const damagedVaultWorld = async () => {
  const world = makeWorld()
  const vault = await world.openUnlocked('pw')
  await vault.storeBox('anthropic', 'sk-fake')
  vault.close()
  world.dbStore.write(u1VaultPropsCkey, JSON.stringify({ ...storedVaultPropsOf(world), unlock_epoch: 'one' }))
  return world
}

/** The verbs Vault.make asks of a VaultDB, and so all a duck-typed one has. */
const VaultDBVerbsUsed = ['readVaultProps', 'fetchOrCreateVaultProps', 'updateVaultProps', 'readBox', 'listBoxes', 'updateBox', 'retireBox', 'retireVault', 'subscribe'] as const

describe("retireDamagedVault", () => {
  it("clears a vault whose hello() refuses it as damaged_vault -- its vault props, its lockboxes and this device's lease -- so a new one can be made", async () => {
    const world = await damagedVaultWorld()
    expect(await world.readLease()).to.not.be.null
    await TH.expectRefusal(world.open(), 'damaged_vault')
    await retireDamagedVault(world.optsWith())
    expect(rowsOf(world, 'u1')).to.deep.equal([])
    expect(await world.readLease()).to.be.null
    const fresh = await world.open()
    expect(fresh.getSnapshot().state).to.eq('absent')
    await fresh.unlock('another pw')
    await fresh.storeBox('anthropic', 'sk-new-fake')
    expect(await fresh.readBox('anthropic')).to.eq('sk-new-fake')
  })

  it("says the device store failing as it clears this device as 'storage_unavailable', naming what failed, the vault already retired", async () => {
    const world = await damagedVaultWorld()
    const trouble = new Error('device storage is unavailable')
    vi.spyOn(world.deviceDB, 'eraseMark').mockRejectedValueOnce(trouble)
    const err = await TH.expectRefusal(retireDamagedVault(world.optsWith()), 'storage_unavailable')
    expect(err.message).to.match(/erasing its mark of this vault/)
    expect(err.cause).to.eq(trouble)
    expect(rowsOf(world, 'u1')).to.deep.equal([])
  })

  it("retires that vault alone: another user's vault, and this device's lease of it, stay", async () => {
    const world = await damagedVaultWorld()
    const theirs = await world.openUnlocked('their pw', { userId: 'u2' })
    await theirs.storeBox('anthropic', 'theirs')
    await retireDamagedVault(world.optsWith())
    expect(await theirs.readBox('anthropic')).to.eq('theirs')
    expect(await world.deviceDB.readLease(TH.scopeOf('u2'))).to.not.be.null
    expect(rowsOf(world, 'u2')).to.not.deep.equal([])
  })

  it("refuses a vault that stands sound, removing nothing from storage or the device: that one is retire()'s", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake')
    const before = world.dbStore.ckeys().map((ckey) => [ckey, world.dbStore.read(ckey)])
    const lease = await world.readLease()
    const err = await TH.expectRefusal(retireDamagedVault(world.optsWith()), 'bad_option')
    expect(err.message).to.include('retire()')
    expect(world.dbStore.ckeys().map((ckey) => [ckey, world.dbStore.read(ckey)])).to.deep.equal(before)
    expect(await world.readLease()).to.deep.equal(lease)
    expect(await vault.readBox('anthropic')).to.eq('sk-fake')
  })

  it("refuses vault props too damaged to name their vault, removing nothing, the lease included", async () => {
    const world = await damagedVaultWorld()
    world.dbStore.write(u1VaultPropsCkey, '{"format":"safebyok-vault-v1"}')
    const err = await TH.expectRefusal(retireDamagedVault(world.optsWith()), 'damaged_vault')
    expect(err.message).to.include('nothing was removed')
    expect(world.dbStore.read(u1VaultPropsCkey)).to.eq('{"format":"safebyok-vault-v1"}')
    expect(world.dbStore.ckeys().some((ckey) => isU1Box(ckey))).to.eq(true)
    expect(await world.readLease()).to.not.be.null
  })

  it("refuses a vault a newer safebyok may have written as newer_format, as hello() does: nothing retired, the lease kept", async () => {
    const world = await damagedVaultWorld()
    const newer = JSON.stringify({ ...storedVaultPropsOf(world), format: 'safebyok-vault-v4' })
    world.dbStore.write(u1VaultPropsCkey, newer)
    const atOpen = await TH.expectRefusal(world.open(), 'newer_format')
    expect(atOpen.message).to.include('update the app')
    const err = await TH.expectRefusal(retireDamagedVault(world.optsWith()), 'newer_format')
    expect(err.message).to.include('newer version')
    expect(world.dbStore.read(u1VaultPropsCkey)).to.eq(newer)
    expect(world.dbStore.ckeys().some((ckey) => isU1Box(ckey))).to.eq(true)
    expect(await world.readLease()).to.not.be.null
  })

  it("with no vault stored, clears only a leftover lease, and a call cut short by the device can be made again", async () => {
    const world = await damagedVaultWorld()
    let failures = 1
    const flakyDevice: DeviceDB = {
      ...world.deviceDB,
      eraseLease: async (scope) => {
        if (failures > 0) { failures -= 1; throw new Error('device store is busy') }
        await world.deviceDB.eraseLease(scope)
      },
    }
    const err = await TH.expectRefusal(retireDamagedVault(world.optsWith({ deviceDB: flakyDevice })), 'storage_unavailable')
    expect((err.cause as Error).message).to.include('busy')
    expect(rowsOf(world, 'u1')).to.deep.equal([])
    expect(await world.readLease()).to.not.be.null
    await retireDamagedVault(world.optsWith({ deviceDB: flakyDevice }))
    expect(await world.readLease()).to.be.null
  })

  it("lets a vault made anew since survive: stale_write, the new vault and its unlock untouched", async () => {
    const world = await damagedVaultWorld()
    // Storage answers the first look at the vault props with the damaged vault, and every later one with another.
    let looks = 0
    const replacing = localVaultDB({
      store: {
        ...world.dbStore,
        read: (ckey) => {
          if (ckey !== u1VaultPropsCkey) { return world.dbStore.read(ckey) }
          looks += 1
          return looks === 1 ? world.dbStore.read(ckey) : JSON.stringify({ ...storedVaultPropsOf(world), vault_id: 'made-anew' })
        },
      },
    })
    await TH.expectRefusal(retireDamagedVault(world.optsWith({ vaultDB: replacing })), 'stale_write')
    expect(world.dbStore.ckeys().some((ckey) => isU1Box(ckey))).to.eq(true)
    expect(await world.readLease()).to.not.be.null
  })

  it("checks the scope with the vault's validators, handing the VaultDB's verb the scope alone, and refuses a misspelt bag as Vault.make does", async () => {
    const world = await damagedVaultWorld()
    const longUserId = ZClassic.string().min(1).max(300)
    const verb = vi.spyOn(world.vaultDB, 'retireDamagedVault')
    await TH.expectRefusal(retireDamagedVault(world.optsWith({ validators: { userID: longUserId } as unknown as MakeVaultOpts['validators'] })), 'bad_option')
    const narrowUserId = ZClassic.string().max(1)
    await TH.expectRefusal(retireDamagedVault(world.optsWith({ validators: { userId: narrowUserId } })), 'bad_label')
    expect(verb).not.toHaveBeenCalled()
    await retireDamagedVault(world.optsWith({ validators: { userId: longUserId } }))
    expect(verb.mock.calls[0]).to.deep.equal([TH.scopeOf('u1')])
    expect(rowsOf(world, 'u1')).to.deep.equal([])
  })

  it("takes the options Vault.make took, and refuses misuse before touching storage", async () => {
    const world = await damagedVaultWorld()
    await TH.expectRefusal(retireDamagedVault(world.optsWith({ applabel: 'not-a-label' })), 'bad_label')
    await TH.expectRefusal(retireDamagedVault(world.optsWith({ userId: '' })), 'bad_label')
    await TH.expectRefusal(retireDamagedVault(null as unknown as MakeVaultOpts), 'bad_option')
    for (const [misfit] of MisfitStores) {
      await TH.expectRefusal(retireDamagedVault(world.optsWith(misfit)), 'bad_option')
    }
    const withoutTheVerb = Object.fromEntries(VaultDBVerbsUsed.map((verb) => [verb, () => Promise.resolve(null)])) as unknown as VaultDB
    await TH.expectRefusal(retireDamagedVault(world.optsWith({ vaultDB: withoutTheVerb })), 'bad_option')
    expect(world.dbStore.ckeys().some((ckey) => isU1Box(ckey))).to.eq(true)
    expect(await world.readLease()).to.not.be.null
  })

  it("checks names with the host's validators, as Vault.make does", async () => {
    const world = makeWorld()
    const opts = world.optsWith({ userId: 'u1@example', validators: { userId: Z.string() } })
    const vault = await TH.settledVault(opts)
    await vault.unlock('pw')
    vault.close()
    const ckey = Ckeys.vaultProps({ applabel: 'acme', user_id: 'u1@example', vaultlabel: 'main' })
    const vaultProps = JSON.parse(world.dbStore.read(ckey) ?? 'null') as object
    world.dbStore.write(ckey, JSON.stringify({ ...vaultProps, unlock_epoch: 'one' }))
    await retireDamagedVault(opts)
    expect(world.dbStore.read(ckey)).to.be.null
  })
})

/** Ways a stored lockbox row can be spoiled that the listing sees, so that it lists as damaged. */
const DamagedListings = [
  [() => '{"not": json',                                                                          'that is not JSON at all'],
  [(row: Record<string, unknown>) => JSON.stringify({ ...row, boxlabel: 'other_box' }),           'naming another boxlabel than the one it is stored under'],
  [(row: Record<string, unknown>) => JSON.stringify({ ...row, written_at: 1_792_022_400_000.5 }), 'whose written_at holds a fraction of a millisecond'],
  [(row: Record<string, unknown>) => JSON.stringify({ ...row, sidecar_json: '{"note":' }),         'whose sidecar is not JSON'],
  [(row: Record<string, unknown>) => JSON.stringify({ ...row, format: 'safebyok-lockbox-v9' }),   'written in a format this version does not know'],
  [({ sidecar_json: kept, ...row }: Record<string, unknown>) => JSON.stringify({ ...row, format: 'safebyok-lockbox-v4', public_json: kept }), 'written before the sidecar was named, as safebyok-lockbox-v4 with its public_json'],
  [({ written_at: kept, ...row }: Record<string, unknown>) => JSON.stringify({ ...row, format: 'safebyok-lockbox-v3', changed_at: kept }), 'written before written_at, as safebyok-lockbox-v3 with its changed_at'],
] as const

/** A world holding `anthropic`, spoiled by `spoil`, beside a sound `openai` with a sidecar; and the vault that stored them, unlocked. */
const worldWithDamagedBox = async (spoil: (row: Record<string, unknown>) => string, overrides?: Partial<MakeVaultOpts>) => {
  const world = makeWorld()
  const vault = await world.openUnlocked('pw', overrides)
  await vault.storeBox('anthropic', 'sk-ant-fake', { sidecar: { note: 'personal account' } })
  await vault.storeBox('openai', 'sk-openai-fake', { sidecar: { note: 'work account' } })
  world.dbStore.write(u1BoxCkey('anthropic'), spoil(storedRowOf(world, 'anthropic')))
  return { world, vault }
}

describe("damaged lockboxes", () => {
  for (const [spoil, blurb] of DamagedListings) {
    it(`a vault with a lockbox ${blurb} opens, listing it as damaged among the others`, async () => {
      const { world } = await worldWithDamagedBox(spoil)
      const fresh = await world.open()
      expect(fresh.getSnapshot().state).to.eq('unlocked')
      expect(fresh.getSnapshot().boxes).to.have.lengthOf(2)
      expect(fresh.getSnapshot().boxes[0]).to.deep.include({ boxlabel: 'anthropic', damaged: true })
      expect(fresh.getSnapshot().boxes[1]).to.deep.include({ boxlabel: 'openai', sidecar: { note: 'work account' }, damaged: false })
      expect(world.logged).to.have.lengthOf(0)
    })

    it(`a freshly opened vault retires a lockbox ${blurb}, and keeps the rest`, async () => {
      const { world } = await worldWithDamagedBox(spoil)
      const fresh = await world.open()
      await fresh.retireBox('anthropic')
      expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.be.null
      expect(boxlabelsOf(fresh)).to.deep.equal(['openai'])
      expect(await fresh.readBox('openai')).to.eq('sk-openai-fake')
    })

    it(`storeBox over a lockbox ${blurb} writes it afresh, carrying nothing from it`, async () => {
      const { world, vault } = await worldWithDamagedBox(spoil)
      world.advance(60_000)
      await vault.storeBox('anthropic', 'sk-ant-new')
      expect(await vault.readBox('anthropic')).to.eq('sk-ant-new')
      const summary = TH.summaryOf(vault.getSnapshot().boxes[0])
      expect(summary).to.deep.include({ boxlabel: 'anthropic', sidecar: {}, registered_at: world.clock.now(), written_at: world.clock.now() })
      expect(boxlabelsOf(vault)).to.deep.equal(['anthropic', 'openai'])
    })
  }

  it("readBox and useBox refuse a damaged lockbox as 'damaged_lockbox', handing the callback nothing, and leave it as it is", async () => {
    const [spoil] = DamagedListings[1]
    const { world, vault } = await worldWithDamagedBox(spoil)
    const spoiled = world.dbStore.read(u1BoxCkey('anthropic'))
    const callback = vi.fn()
    await TH.expectRefusal(vault.readBox('anthropic'), 'damaged_lockbox')
    await TH.expectRefusal(vault.useBox('anthropic', callback), 'damaged_lockbox')
    expect(callback).not.toHaveBeenCalled()
    expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.eq(spoiled)
    expect(vault.getSnapshot().boxes[0]).to.deep.include({ boxlabel: 'anthropic', damaged: true })
  })

  it("a background refresh lists a lockbox damaged elsewhere, warning nothing", async () => {
    const [spoil] = DamagedListings[0]
    const { world, vault } = await worldWithDamagedBox(spoil)
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot().boxes[0]).to.deep.include({ boxlabel: 'anthropic', damaged: true })
    expect(world.logged).to.have.lengthOf(0)
  })

  it("retireBox of a sound lockbox beside a damaged one lands without complaint, the damaged one still listed", async () => {
    const [spoil] = DamagedListings[2]
    const { world, vault } = await worldWithDamagedBox(spoil)
    await vault.retireBox('openai')
    expect(world.dbStore.read(u1BoxCkey('openai'))).to.be.null
    expect(vault.getSnapshot().boxes).to.have.lengthOf(1)
    expect(vault.getSnapshot().boxes[0]).to.deep.include({ boxlabel: 'anthropic', damaged: true })
  })

  it("storeBox over a damaged lockbox whose record names its revision replaces it in one write, never retiring it first", async () => {
    const [spoil] = DamagedListings[2]
    const { world, vault } = await worldWithDamagedBox(spoil)
    const revisionTok = storedRowOf(world, 'anthropic')['revision_tok']
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot().boxes[0]).to.deep.equal({ boxlabel: 'anthropic', damaged: true, revision_tok: revisionTok })
    const retireBox = vi.spyOn(world.vaultDB, 'retireBox')
    const updateBox = vi.spyOn(world.vaultDB, 'updateBox')
    await vault.storeBox('anthropic', 'sk-ant-new')
    expect(retireBox).not.toHaveBeenCalled()
    expect(updateBox.mock.calls[0]?.[2]).to.deep.include({ revision_tok: revisionTok })
    expect(await vault.readBox('anthropic')).to.eq('sk-ant-new')
    vi.restoreAllMocks()
  })

  it("storeBox over a damaged lockbox whose record names no revision retires it first, then writes afresh", async () => {
    const [spoil] = DamagedListings[0]
    const { world, vault } = await worldWithDamagedBox(spoil)
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot().boxes[0]).to.deep.equal({ boxlabel: 'anthropic', damaged: true, revision_tok: null })
    const retireBox = vi.spyOn(world.vaultDB, 'retireBox')
    await vault.storeBox('anthropic', 'sk-ant-new')
    expect(retireBox).toHaveBeenCalledOnce()
    expect(await vault.readBox('anthropic')).to.eq('sk-ant-new')
    vi.restoreAllMocks()
  })

  it("lists a lockbox under a vaultKey the vault does not hold as damaged from its epoch alone, its revision kept, and storeBox() replaces it", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake')
    const row = storedRowOf(world, 'anthropic')
    world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify({ ...row, vault_key_epoch: 5 }))
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot().boxes).to.deep.equal([{ boxlabel: 'anthropic', damaged: true, revision_tok: row['revision_tok'] }])
    await TH.expectRefusal(vault.readBox('anthropic'), 'damaged_lockbox')
    await vault.storeBox('anthropic', 'sk-fake-again')
    expect(await vault.readBox('anthropic')).to.eq('sk-fake-again')
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.vault_key_epoch).to.eq(1)
  })

  it("storeBox over a lockbox it lists as damaged under its epoch alone carries nothing from it: a record that will not open vouches for no sidecar", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake', { sidecar: { note: 'work account' } })
    world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify({ ...storedRowOf(world, 'anthropic'), vault_key_epoch: 5 }))
    await TH.wakeupAtNextTick()
    await vault.storeBox('anthropic', 'sk-fake-again')
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.sidecar).to.deep.equal({})
  })

  it("storeBox over a damaged lockbox keeps a sidecar given with it", async () => {
    const [spoil] = DamagedListings[3]
    const { vault } = await worldWithDamagedBox(spoil)
    await vault.storeBox('anthropic', 'sk-ant-new', { sidecar: { note: 'mended' } })
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.sidecar).to.deep.equal({ note: 'mended' })
  })

  it("storeBox over a damaged lockbox in a full vault replaces it, never refused by maxLockboxes", async () => {
    const [spoil] = DamagedListings[0]
    const { vault } = await worldWithDamagedBox(spoil, { maxLockboxes: 2 })
    await vault.storeBox('anthropic', 'sk-ant-new')
    expect(await vault.readBox('anthropic')).to.eq('sk-ant-new')
    await TH.expectRefusal(vault.storeBox('third', 'sk-fake'), 'vault_full')
  })

  it("storeBox over a lockbox that lists soundly but will not open, missing its whisper, writes it afresh", async () => {
    const { world, vault } = await worldWithDamagedBox(({ whisper_ciphered: _gone, ...row }) => JSON.stringify(row))
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.sidecar).to.deep.equal({ note: 'personal account' })
    world.advance(60_000)
    await vault.storeBox('anthropic', 'sk-ant-new')
    expect(await vault.readBox('anthropic')).to.eq('sk-ant-new')
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])).to.deep.include({ sidecar: {}, registered_at: world.clock.now() })
  })

  it("storeBox over a damaged lockbox still needs the vault unlocked, and leaves it as it is", async () => {
    const [spoil] = DamagedListings[1]
    const { world, vault } = await worldWithDamagedBox(spoil)
    const spoiled = world.dbStore.read(u1BoxCkey('anthropic'))
    await vault.lock()
    await TH.expectRefusal(vault.storeBox('anthropic', 'sk-ant-new'), 'vault_locked')
    expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.eq(spoiled)
  })

  it("a damaged lockbox's listing quotes nothing from its record", async () => {
    const { world } = await worldWithDamagedBox((row) => JSON.stringify({ ...row, sidecar_json: '"FAKESECRET' }))
    const fresh = await world.open()
    expect(JSON.stringify(fresh.getSnapshot())).to.not.include('FAKESECRET')
  })
})

describe("scoping", () => {
  it("two users each keep a box by the same label, unseen by the other", async () => {
    const world = makeWorld()
    const one = await world.openUnlocked('pw one', { userId: 'u1' })
    await one.storeBox('anthropic', 'u1-secret')
    const two = await world.open({ userId: 'u2' })
    expect(two.getSnapshot().state).to.eq('absent')
    await two.unlock('pw two')
    await two.storeBox('anthropic', 'u2-secret')
    expect(await one.readBox('anthropic')).to.eq('u1-secret')
    expect(await two.readBox('anthropic')).to.eq('u2-secret')
  })

  it("one user's lease opens nothing for another", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw one', { userId: 'u1' })
    expect(await world.stateOnOpen({ userId: 'u2' })).to.eq('absent')
  })
})

describe("the snapshot and its subscribers", () => {
  it("refuses a listener that is not a function as it subscribes, so no later change meets it", async () => {
    const world = makeWorld()
    const vault = await world.open()
    expect(() => vault.subscribe('not a listener' as unknown as () => void)).to.throw(VaultError, /listener function/)
    await vault.unlock('pw')
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("keeps its identity until something changes", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const before = vault.getSnapshot()
    expect(vault.getSnapshot()).to.eq(before)
    await vault.storeBox('anthropic', 'sk-fake')
    expect(vault.getSnapshot()).to.not.eq(before)
  })

  it("tells listeners when it unlocks and stores, and unsubscribing silences it", async () => {
    const world = makeWorld()
    const vault = await world.open()
    let heardCount = 0
    const unsubscribe = vault.subscribe(() => { heardCount += 1 })
    await vault.unlock('pw')
    expect(heardCount).to.be.greaterThan(0)
    const heardBefore = heardCount
    unsubscribe()
    await vault.storeBox('anthropic', 'sk-fake')
    expect(heardCount).to.eq(heardBefore)
  })

  it("hears about lockboxes written through another handle", async () => {
    const world = makeWorld()
    const here = await world.openUnlocked('pw')
    const there = await world.open()
    await there.storeBox('anthropic', 'written elsewhere')
    await vi.waitFor(() => { expect(boxlabelsOf(here)).to.deep.equal(['anthropic']) })
  })
})

describe("what the backend sees", () => {
  it("stores no whisper and no passphrase in the clear, anywhere", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('a very memorable passphrase')
    await vault.storeBox('anthropic', 'sk-ant-api03-fake-but-secret', { sidecar: { note: 'sidecars are public' } })
    const everything = world.dbStore.ckeys().map((ckey) => world.dbStore.read(ckey)).join('\n')
    expect(everything).to.not.include('sk-ant-api03-fake-but-secret')
    expect(everything).to.not.include('a very memorable passphrase')
    expect(everything).to.include('sidecars are public') // the sidecar is public by design
    expect(everything).to.include('whisper_ciphered')
  })

  it("two stores of the same whisper write different ciphertext: fresh key and iv every time", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('one_box', 'the same whisper')
    await vault.storeBox('two_box', 'the same whisper')
    const [oneRow, twoRow] = world.dbStore.ckeys().filter((ckey) => isU1Box(ckey))
      .map((ckey) => JSON.parse(world.dbStore.read(ckey) ?? '{}') as { whisper_ciphered: { ciphertext_b64: string } })
    expect(oneRow?.whisper_ciphered.ciphertext_b64).to.not.eq(twoRow?.whisper_ciphered.ciphertext_b64)
  })
})

/** A lockbox row's public fields altered in storage, each a field its encryptions bind. */
const SpoiledShells = [
  [(row: Record<string, unknown>) => ({ ...row, sidecar_json: '{"note":"personal account"}' }),         'its sidecar swapped for another'],
  [(row: Record<string, unknown>) => ({ ...row, sidecar_json: '{}' }),                                    'its sidecar emptied'],
  [(row: Record<string, unknown>) => ({ ...row, sidecar_json: '{"note": "work account"}' }),              'its sidecar respaced, the same JSON value written otherwise'],
  [({ registered_at: kept, ...row }: Record<string, unknown>) => ({ ...row, registered_at: (kept as number) - 1 }), 'its registered_at moved'],
  [({ written_at: kept, ...row }: Record<string, unknown>) => ({ ...row, written_at: (kept as number) + 1 }),       'its written_at moved'],
  [(row: Record<string, unknown>) => ({ ...row, revision_tok: 'rev-elsewhere' }),                         'its revision_tok swapped'],
] as const

describe("tampering", () => {
  it("a lockbox with altered ciphertext refuses to open, and is left as it is", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake')
    const ckey = world.dbStore.ckeys().find((ckey) => isU1Box(ckey))
    const row = JSON.parse(world.dbStore.read(ckey ?? '') ?? '{}') as { whisper_ciphered: { ciphertext_b64: string } }
    row.whisper_ciphered.ciphertext_b64 = TH.tweakB64(row.whisper_ciphered.ciphertext_b64)
    world.dbStore.write(ckey ?? '', JSON.stringify(row))
    const err = await TH.expectRefusal(vault.readBox('anthropic'), 'damaged_lockbox')
    expect(err.message).to.not.include('sk-fake')
    expect(world.dbStore.read(ckey ?? '')).to.not.be.null  // preserved for forensics, never auto-deleted
  })

  it("a lockbox row moved under another label refuses to open", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('victim_box', 'sk-fake')
    const fromCkey = world.dbStore.ckeys().find((candidate) => candidate.includes('victim_box'))
    world.dbStore.write(u1BoxCkey('other_box'), world.dbStore.read(fromCkey ?? '') ?? '')
    await TH.expectRefusal(vault.readBox('other_box'), 'damaged_lockbox')
  })

  for (const [spoil, blurb] of SpoiledShells) {
    it(`a lockbox with ${blurb} refuses to open, and is left as it is: its whole public header is bound`, async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw')
      await vault.storeBox('anthropic', 'sk-fake', { sidecar: { note: 'work account' } })
      const ckey = world.dbStore.ckeys().find((candidate) => isU1Box(candidate)) ?? ''
      const row = JSON.parse(world.dbStore.read(ckey) ?? '{}') as Record<string, unknown>
      const spoiled = JSON.stringify(spoil(row))
      world.dbStore.write(ckey, spoiled)
      await TH.expectRefusal(vault.readBox('anthropic'), 'damaged_lockbox')
      expect(world.dbStore.read(ckey)).to.eq(spoiled)
    })
  }

  it("vault props whose registered_at was altered open to no passphrase: it is bound into every way in", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const vaultProps = JSON.parse(world.dbStore.read(u1VaultPropsCkey) ?? '{}') as { registered_at: number }
    world.dbStore.write(u1VaultPropsCkey, JSON.stringify({ ...vaultProps, registered_at: vaultProps.registered_at - 1 }))
    const vault = await world.open({ deviceDB: memoryDeviceDB() })
    const err = await TH.expectRefusal(vault.unlock('pw'), 'wrong_passphrase')
    // The decryption fails as for a typo, so the message names both, and claims neither.
    expect(err.message).to.include('Check for typos')
    expect(err.message).to.include('the stored vault may be damaged')
  })

  it("vault props that do not parse make the open itself refuse as damaged_vault, storage's refusal its cause, deleting nothing", async () => {
    const world = makeWorld()
    world.dbStore.write(u1VaultPropsCkey, '{"format":"safebyok-vault-v3"}')
    const err = await TH.expectRefusal(world.open(), 'damaged_vault')
    expect(err.message).to.include("can't be opened")
    expect((err.cause as VaultError).kind).to.eq('corrupt_record')
    expect(world.dbStore.read(u1VaultPropsCkey)).to.eq('{"format":"safebyok-vault-v3"}')
  })

  it("a lockbox that will not open under the vault's own key is called damaged, with the remedy, never quoting its boxlabel", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake')
    const row = JSON.parse(world.dbStore.read(u1BoxCkey('anthropic')) ?? '{}') as { whisper_ciphered: { ciphertext_b64: string } }
    row.whisper_ciphered.ciphertext_b64 = TH.tweakB64(row.whisper_ciphered.ciphertext_b64)
    world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify(row))
    const err = await TH.expectRefusal(vault.readBox('anthropic'), 'damaged_lockbox')
    expect(err.message).to.include('That lockbox is damaged')
    expect(err.message).to.not.include('anthropic')
    expect(err.message).to.include('remove it')
    await vault.retireBox('anthropic')
    expect(boxlabelsOf(vault)).to.deep.equal([])
  })
})

/** u1's stored vault props in `world`, their second way in spoiled by `spoil`. */
const spoilSecondWayin = (world: ReturnType<typeof makeWorld>, spoil: Record<string, unknown>) => {
  const vaultProps = JSON.parse(world.dbStore.read(u1VaultPropsCkey) ?? '{}') as { wayins: Record<string, unknown>[] }
  const wayins = vaultProps.wayins.map((wayin, ii) => (ii === 1 ? { ...wayin, ...spoil } : wayin))
  world.dbStore.write(u1VaultPropsCkey, JSON.stringify({ ...vaultProps, wayins }))
}

/**
 * A vault of passphrases `pw` and `spare`, the spare's salt spoiled in storage, freshly opened
 * locked. 'c2FsdA' decodes, so passes the schema, but to four bytes: no 16-byte deriver made it.
 */
const vaultWithDamagedSpare = async () => {
  const world = makeWorld()
  const vault = await world.openUnlocked('pw')
  await vault.storeBox('anthropic', 'sk-fake')
  const spareId = await vault.addPassphrase('pw', 'spare', { wayinlabel: 'spare' })
  spoilSecondWayin(world, { salt_b64: 'c2FsdA' })
  const fresh = await world.open({ deviceDB: memoryDeviceDB() })
  return { world, fresh, spareId }
}

describe("a way in stored damaged", () => {

  it("shuts out no other: the vault's sound passphrase still opens it", async () => {
    const { fresh } = await vaultWithDamagedSpare()
    await fresh.unlock('pw')
    expect(await fresh.readBox('anthropic')).to.eq('sk-fake')
  })

  it("refuses its own passphrase as wrong_passphrase, saying a damaged way in went untried", async () => {
    const { fresh } = await vaultWithDamagedSpare()
    const err = await TH.expectRefusal(fresh.unlock('spare'), 'wrong_passphrase')
    expect(err.message).to.include('stored damaged')
    expect(err.message).to.not.include('spare')
  })

  it("refuses an unlock aimed at it as damaged_wayin, and is removed by a sound way in", async () => {
    const { fresh, spareId } = await vaultWithDamagedSpare()
    await TH.expectRefusal(fresh.unlock('spare', { wayinId: spareId }), 'damaged_wayin')
    expect(fresh.getSnapshot().state).to.eq('locked')
    await fresh.retireWayin('pw', spareId)
    expect(wayinlabelsOf(fresh)).to.deep.equal(['passphrase'])
  })

  it("a passkey stored damaged refuses its answer as damaged_wayin, and the passphrase still opens", async () => {
    const { world, laptop } = await vaultWithPasskey()
    const shortSalt = toB64(new Uint8Array(16))
    spoilSecondWayin(world, { prf_salt_b64: shortSalt })
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    const err = await TH.expectRefusal(fresh.unlock({ ...laptop, prfSaltB64: shortSalt }), 'damaged_wayin')
    expect(err.message).to.include('Unlock with a passphrase')
    await fresh.unlock('pw')
    expect(fresh.getSnapshot().state).to.eq('unlocked')
  })

  it("a passkey whose answer no longer opens vault props altered in storage is told that its way in may be damaged", async () => {
    const { world, laptop } = await vaultWithPasskey()
    const vaultProps = JSON.parse(world.dbStore.read(u1VaultPropsCkey) ?? '{}') as { registered_at: number }
    world.dbStore.write(u1VaultPropsCkey, JSON.stringify({ ...vaultProps, registered_at: vaultProps.registered_at - 1 }))
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    const err = await TH.expectRefusal(fresh.unlock(laptop), 'wrong_passkey')
    expect(err.message).to.include('may be damaged')
  })
})

describe("changePassphrase", () => {
  it("refuses an old or new passphrase that is not text with kind 'bad_option', changing nothing", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('old passphrase')
    await TH.expectRefusal(vault.changePassphrase(undefined as unknown as string, 'new passphrase'), 'bad_option')
    await TH.expectRefusal(vault.changePassphrase('old passphrase', 42 as unknown as string), 'bad_option')
    await world.openUnlocked('old passphrase', { deviceDB: memoryDeviceDB() })
  })

  it("retires the old passphrase, admits the new, and keeps every lockbox readable", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('old passphrase')
    await vault.storeBox('anthropic', 'sk-fake')
    await vault.changePassphrase('old passphrase', 'new passphrase')
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(await vault.readBox('anthropic')).to.eq('sk-fake')

    const fresh = await world.open({ deviceDB: memoryDeviceDB() })  // a new device: no lease
    await TH.expectRefusal(fresh.unlock('old passphrase'), 'wrong_passphrase')
    await fresh.unlock('new passphrase')
    expect(await fresh.readBox('anthropic')).to.eq('sk-fake')
  })

  it("works on a locked vault: the old passphrase is proof enough", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('old passphrase')
    await vault.lock()
    await vault.changePassphrase('old passphrase', 'new passphrase')
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("a wrong old passphrase is refused and changes nothing", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('the real passphrase')
    await TH.expectRefusal(vault.changePassphrase('not the passphrase', 'whatever'), 'wrong_passphrase')
    const fresh = await world.openUnlocked('the real passphrase', { deviceDB: memoryDeviceDB() })
    expect(fresh.getSnapshot().state).to.eq('unlocked')
  })

  it("a new passphrase of only whitespace is refused outright", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await TH.expectRefusal(vault.changePassphrase('pw', ' '.repeat(3)), 'wrong_passphrase')
  })

  it("refuses on a vault that does not exist yet", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await TH.expectRefusal(vault.changePassphrase('old', 'new'), 'absent_vault')
  })

  it("ends every other device's unlock: theirs lapses on the next look", async () => {
    const world = makeWorld()
    const here = await world.openUnlocked('old passphrase')
    const thereDeviceDB = memoryDeviceDB()
    const there = await world.openUnlocked('old passphrase', { deviceDB: thereDeviceDB })
    expect(there.getSnapshot().state).to.eq('unlocked')

    await here.changePassphrase('old passphrase', 'new passphrase')
    await vi.waitFor(() => { expect(there.getSnapshot().state).to.eq('locked') })
    expect(await thereDeviceDB.readLease({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })).to.be.null
  })
})

/** The wayinlabels a vault's snapshot lists, in order. */
const wayinlabelsOf = (vault: Vault) => vault.getSnapshot().wayins.map((summary) => summary.wayinlabel)

/** A testDeriver that counts its derivations, for an open that should spend few. */
const countingDeriver = () => {
  const derivations = vi.fn(TH.digestDerivation)
  return { keyDeriver: new TH.TestDeriver({}, derivations), derivations }
}

describe("several passphrases", () => {
  it("a vault is made with one way in, labelled passphrase, listed while locked", async () => {
    const world = makeWorld()
    const vault = await world.open()
    expect(vault.getSnapshot().wayins).to.deep.equal([])
    await vault.unlock('pw')
    await vault.lock()
    const [only] = vault.getSnapshot().wayins
    expect(only).to.deep.equal({
      wayinkind: 'passphrase', wayin_id: only?.wayin_id, wayinlabel: 'passphrase', device_id: only?.device_id, registered_at: Date.parse('2026-10-14T12:00:00Z'),
    })
    expect(only?.wayin_id).to.have.length.greaterThan(0)
    expect(only?.device_id).to.have.length.greaterThan(0)
  })

  it("addPassphrase gives another way in: either passphrase opens the vault, on any device", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('first passphrase')
    await vault.storeBox('anthropic', 'sk-fake')
    const wayinId = await vault.addPassphrase('first passphrase', 'second passphrase', { wayinlabel: 'written_down' })
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(wayinlabelsOf(vault)).to.deep.equal(['passphrase', 'written_down'])
    expect(vault.getSnapshot().wayins[1]?.wayin_id).to.eq(wayinId)

    for (const passphrase of ['first passphrase', 'second passphrase']) {
      const fresh = await world.open({ deviceDB: memoryDeviceDB() })
      await fresh.unlock(passphrase)
      expect(await fresh.readBox('anthropic')).to.eq('sk-fake')
    }
  })

  it("an unlock aimed at one passphrase derives once, and refuses another's passphrase", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('first passphrase')
    const wayinId = await vault.addPassphrase('first passphrase', 'second passphrase', { wayinlabel: 'written_down' })
    const { keyDeriver, derivations } = countingDeriver()
    const fresh = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver })
    await TH.expectRefusal(fresh.unlock('first passphrase', { wayinId }), 'wrong_passphrase')
    await fresh.unlock('second passphrase', { wayinId })
    expect(derivations).toHaveBeenCalledTimes(2)
    expect(fresh.getSnapshot().state).to.eq('unlocked')
  })

  it("an unlock not aimed tries each passphrase in turn: a wrong one costs a derivation apiece", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw one')
    await vault.addPassphrase('pw one', 'pw two', { wayinlabel: 'two' })
    await vault.addPassphrase('pw one', 'pw three', { wayinlabel: 'three' })
    const { keyDeriver, derivations } = countingDeriver()
    const fresh = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver })
    await TH.expectRefusal(fresh.unlock('none of them'), 'wrong_passphrase')
    expect(derivations).toHaveBeenCalledTimes(3)
  })

  it("an unlock aimed at a wayin_id the vault does not hold is refused as absent_wayin", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    await vault.lock()
    await TH.expectRefusal(vault.unlock('pw', { wayinId: 'wayin-gone' }), 'absent_wayin')
    await TH.expectRefusal(vault.unlock('pw', { wayinId: 42 as unknown as string }), 'bad_option')
  })

  it("an unlock aimed at a vault retired elsewhere is refused as absent_wayin, and creates nothing", async () => {
    const world = makeWorld()
    const here = await world.open()
    await here.unlock('pw')
    await here.lock()
    const wayinId = here.getSnapshot().wayins[0]?.wayin_id
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    await there.retire()
    await TH.expectRefusal(here.unlock('pw', { wayinId }), 'absent_wayin')
    expect(here.getSnapshot().state).to.eq('absent')
    expect(await world.vaultDB.readVaultProps(TH.scopeOf('u1'))).to.be.null
  })

  it("addPassphrase wants a passphrase the vault opens with as proof, even while unlocked", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    const err = await TH.expectRefusal(vault.addPassphrase('not the passphrase', 'sneaky', { wayinlabel: 'sneaky' }), 'wrong_passphrase')
    expect(err.message).to.not.include('sneaky')
    expect(wayinlabelsOf(vault)).to.deep.equal(['passphrase'])
  })

  it("addPassphrase refuses a blank passphrase, a bad or taken label, and a vault at MaxUnlocks", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    await TH.expectRefusal(vault.addPassphrase('pw', ' '.repeat(3), { wayinlabel: 'blank' }), 'wrong_passphrase')
    await TH.expectRefusal(vault.addPassphrase('pw', 'pw two', { wayinlabel: 'Not A Label' }), 'bad_label')
    await TH.expectRefusal(vault.addPassphrase('pw', 'pw two', undefined as unknown as { wayinlabel: string }), 'bad_label')
    await TH.expectRefusal(vault.addPassphrase('pw', 'pw two', { wayinlabel: 'passphrase' }), 'bad_label')
    for (let ii = 1; ii < MaxUnlocks; ii += 1) {
      await vault.addPassphrase('pw', `pw ${String(ii)}`, { wayinlabel: `phrase${String(ii)}` })
    }
    expect(vault.getSnapshot().wayins).to.have.lengthOf(MaxUnlocks)
    await TH.expectRefusal(vault.addPassphrase('pw', 'one too many', { wayinlabel: 'extra' }), 'too_many_wayins')
  })

  it("a blank passphrase offered as proof is refused at once, deriving nothing", async () => {
    const world = makeWorld()
    const { keyDeriver, derivations } = countingDeriver()
    const vault = await world.open({ keyDeriver })
    await vault.unlock('pw')
    const wayinId = await vault.addPassphrase('pw', 'pw two', { wayinlabel: 'two' })
    derivations.mockClear()
    await TH.expectRefusal(vault.addPassphrase(' '.repeat(2), 'pw three', { wayinlabel: 'three' }), 'wrong_passphrase')
    await TH.expectRefusal(vault.retireWayin('', wayinId), 'wrong_passphrase')
    await TH.expectRefusal(vault.changePassphrase('\t', 'pw four'), 'wrong_passphrase')
    expect(derivations).not.toHaveBeenCalled()
  })

  it("a refusal for what addPassphrase asks costs no key derivation", async () => {
    const world = makeWorld()
    const { keyDeriver, derivations } = countingDeriver()
    const vault = await world.open({ keyDeriver })
    await vault.unlock('pw')
    derivations.mockClear()
    await TH.expectRefusal(vault.addPassphrase('pw', 'pw two', { wayinlabel: 'passphrase' }), 'bad_label')
    expect(derivations).not.toHaveBeenCalled()
  })

  it("changePassphrase changes the passphrase it was given, and leaves the others standing", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('first')
    await vault.addPassphrase('first', 'second', { wayinlabel: 'written_down' })
    const before = vault.getSnapshot().wayins
    await vault.changePassphrase('second', 'second, renewed')
    expect(vault.getSnapshot().wayins).to.deep.equal(before)   // same ids, same labels

    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.expectRefusal(fresh.unlock('second'), 'wrong_passphrase')
    await fresh.unlock('second, renewed')
    await fresh.lock()
    await fresh.unlock('first')
    expect(fresh.getSnapshot().state).to.eq('unlocked')
  })

  it("changePassphrase aimed at one passphrase refuses another's", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('first')
    const wayinId = await vault.addPassphrase('first', 'second', { wayinlabel: 'written_down' })
    await TH.expectRefusal(vault.changePassphrase('first', 'whatever', { wayinId }), 'wrong_passphrase')
    await vault.changePassphrase('second', 'renewed', { wayinId })
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await fresh.unlock('renewed', { wayinId })
    expect(fresh.getSnapshot().state).to.eq('unlocked')
  })

  it("retireWayin takes one way in away, proven by any passphrase still standing", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('first')
    const wayinId = await vault.addPassphrase('first', 'second', { wayinlabel: 'written_down' })
    await vault.storeBox('anthropic', 'sk-fake')
    await vault.retireWayin('second', wayinId)    // the one going is proof enough
    expect(wayinlabelsOf(vault)).to.deep.equal(['passphrase'])
    expect(vault.getSnapshot().state).to.eq('unlocked')

    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.expectRefusal(fresh.unlock('second'), 'wrong_passphrase')
    await fresh.unlock('first')
    expect(await fresh.readBox('anthropic')).to.eq('sk-fake')
  })

  it("retireWayin never removes the last way in, nor one that is not there", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    const [only] = vault.getSnapshot().wayins
    await TH.expectRefusal(vault.retireWayin('pw', only?.wayin_id ?? ''), 'last_wayin')
    await TH.expectRefusal(vault.retireWayin('pw', 'wayin-gone'), 'absent_wayin')
    await TH.expectRefusal(vault.retireWayin('pw', ''), 'bad_option')
    expect(vault.getSnapshot().wayins).to.have.lengthOf(1)
  })

  it("retireWayin wants a passphrase the vault opens with, and removes nothing on a wrong one", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('first')
    const wayinId = await vault.addPassphrase('first', 'second', { wayinlabel: 'written_down' })
    await TH.expectRefusal(vault.retireWayin('neither', wayinId), 'wrong_passphrase')
    expect(vault.getSnapshot().wayins).to.have.lengthOf(2)
  })

  it("every change to the ways in moves the epoch: another device locks, and this one stays unlocked", async () => {
    const world = makeWorld()
    const here = await world.open()
    await here.unlock('first')
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    await there.unlock('first')

    const wayinId = await here.addPassphrase('first', 'second', { wayinlabel: 'written_down' })
    await vi.waitFor(() => { expect(there.getSnapshot().state).to.eq('locked') })
    expect(there.getSnapshot().wayins).to.deep.equal(here.getSnapshot().wayins)
    await there.unlock('second')

    await here.retireWayin('first', wayinId)
    await vi.waitFor(() => { expect(there.getSnapshot().state).to.eq('locked') })
    expect(storedVaultPropsOf(world)['unlock_epoch']).to.eq(3)
    expect(here.getSnapshot().state).to.eq('unlocked')
  })

  it("this device's lease follows a change, so a reload stays unlocked", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('first')
    await vault.addPassphrase('first', 'second', { wayinlabel: 'written_down' })
    const reloaded = await world.open()
    expect(reloaded.getSnapshot().state).to.eq('unlocked')
  })

  it("two devices adding at once: the second write is stale, and adds nothing", async () => {
    const world = makeWorld()
    const here = await world.open()
    await here.unlock('pw')
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    await there.unlock('pw')
    // `there` looks at the vault props before `here` writes, and writes after it.
    const realUpdate = world.vaultDB.updateVaultProps.bind(world.vaultDB)
    const spied = vi.spyOn(world.vaultDB, 'updateVaultProps').mockImplementationOnce(async (vaultProps, expected) => {
      await here.addPassphrase('pw', 'here pw', { wayinlabel: 'here' })
      await realUpdate(vaultProps, expected)
    })
    await TH.expectRefusal(there.addPassphrase('pw', 'there pw', { wayinlabel: 'there' }), 'stale_write')
    spied.mockRestore()
    expect(wayinlabelsOf(there)).to.deep.equal(['passphrase', 'here'])
  })

  it("the backend holds no passphrase, of the first or of any added", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('a very memorable passphrase')
    await vault.addPassphrase('a very memorable passphrase', 'another memorable passphrase', { wayinlabel: 'spare' })
    const everything = world.dbStore.ckeys().map((ckey) => world.dbStore.read(ckey)).join('\n')
    expect(everything).to.not.include('memorable')
    expect(everything).to.include('"wayinlabel":"spare"')
  })

  it("vault props in the shape before wayins read as damaged, and are left as they are", async () => {
    const world = makeWorld()
    const { wayins: _wayins, ...rest } = TH.vaultPropsOf('u1')
    const oldText = JSON.stringify({ ...rest, key_deriver_label: 'test_digest_v0', passphrase_salt_b64: 'c2FsdA', vault_key_passphrase_wrapped: TH.fakeCiphered('old') })
    const vaultPropsCkey = Ckeys.vaultProps(TH.scopeOf('u1'))
    world.dbStore.write(vaultPropsCkey, oldText)
    await TH.expectRefusal(world.open(), 'damaged_vault')
    expect(world.dbStore.read(vaultPropsCkey)).to.eq(oldText)
  })
})

/** A passkey maker whose authenticator answers `answer`, whatever it is: for a test of what addPasskey refuses. */
const answering = (answer: unknown) => () => Promise.resolve(answer as PasskeyProof)

/** The wayin_id of the passkey `laptop` that `vault` adds under the passphrase `pw`; fails the test when it adds none. */
const addLaptopPasskey = async (vault: Vault): Promise<string> => {
  const wayinId = await vault.addPasskey('pw', () => TH.passkeyOf('laptop'), { wayinlabel: 'laptop' })
  if (wayinId === null) { throw new Error('addPasskey added no passkey') }
  return wayinId
}

/** A vault in a fresh world, unlocked with `pw`, holding one lockbox and a passkey labelled `laptop`. */
const vaultWithPasskey = async () => {
  const world = makeWorld()
  const vault = await world.open()
  await vault.unlock('pw')
  await vault.storeBox('anthropic', 'sk-fake')
  const laptop = await TH.passkeyOf('laptop')
  const wayinId = await addLaptopPasskey(vault)
  return { world, vault, laptop, wayinId }
}

describe("passkeys", () => {
  it("addPasskey gives a way in that opens the vault on any device, with no key derivation", async () => {
    const { world, vault, laptop, wayinId } = await vaultWithPasskey()
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(wayinlabelsOf(vault)).to.deep.equal(['passphrase', 'laptop'])
    const { keyDeriver, derivations } = countingDeriver()
    const fresh = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver })
    await fresh.unlock(laptop)
    expect(await fresh.readBox('anthropic')).to.eq('sk-fake')
    expect(derivations).not.toHaveBeenCalled()
    await fresh.lock()
    await fresh.unlock(laptop, { wayinId })
    expect(fresh.getSnapshot().state).to.eq('unlocked')
  })

  it("a locked vault lists its passkeys with the credential and salt to ask them with", async () => {
    const { world, laptop, wayinId } = await vaultWithPasskey()
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    expect(fresh.getSnapshot().state).to.eq('locked')
    const listed = fresh.getSnapshot().wayins[1]
    expect(listed).to.deep.equal({
      wayinkind: 'passkey', wayin_id: wayinId, wayinlabel: 'laptop', device_id: listed?.device_id, registered_at: listed?.registered_at,
      credential_id: laptop.credentialId, prf_salt_b64: laptop.prfSaltB64,
    })
    expect(listed?.device_id).to.have.length.greaterThan(0)
  })

  it("an unlock with a passkey grants this device a lease until askPassphraseAt, as a passphrase's does", async () => {
    const { world, laptop } = await vaultWithPasskey()
    const deviceDB = memoryDeviceDB()
    const here = await world.open({ deviceDB })
    await here.unlock(laptop)
    expect(here.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + SevenDaysMillis)
    const reloaded = await world.open({ deviceDB })
    expect(reloaded.getSnapshot().state).to.eq('unlocked')
    world.advance(SevenDaysMillis)
    const later = await world.open({ deviceDB })
    expect(later.getSnapshot().state).to.eq('locked')
  })

  it("an unlock refuses a passkey the vault does not hold, and a wrong answer, and stays locked", async () => {
    const { world, laptop } = await vaultWithPasskey()
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.expectRefusal(fresh.unlock(await TH.passkeyOf('stranger')), 'absent_wayin')
    await TH.expectRefusal(fresh.unlock({ ...laptop, prfBytes: new Uint8Array(32).fill(7) }), 'wrong_passkey')
    const otherSalt = TH.passkeyWayinOf('any').prf_salt_b64
    await TH.expectRefusal(fresh.unlock(await TH.passkeyOf('laptop', otherSalt)), 'wrong_passkey')
    expect(fresh.getSnapshot().state).to.eq('locked')
  })

  it("an unlock with a passkey never creates a vault: an absent one refuses as absent_vault", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await TH.expectRefusal(vault.unlock(await TH.passkeyOf('laptop')), 'absent_vault')
    expect(vault.getSnapshot().state).to.eq('absent')
    expect(await world.vaultDB.readVaultProps(TH.scopeOf('u1'))).to.be.null
  })

  it("an unlock with a passphrase passes over the passkeys: one derivation per passphrase", async () => {
    const { world } = await vaultWithPasskey()
    const { keyDeriver, derivations } = countingDeriver()
    const fresh = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver })
    await TH.expectRefusal(fresh.unlock('not it'), 'wrong_passphrase')
    expect(derivations).toHaveBeenCalledTimes(1)
    await fresh.unlock('pw')
    expect(fresh.getSnapshot().state).to.eq('unlocked')
  })

  it("addPasskey takes another passkey's answer as proof, and refuses a wrong proof, adding nothing", async () => {
    const { vault, laptop } = await vaultWithPasskey()
    await vault.addPasskey(laptop, () => TH.passkeyOf('phone'), { wayinlabel: 'phone' })
    expect(wayinlabelsOf(vault)).to.deep.equal(['passphrase', 'laptop', 'phone'])
    await TH.expectRefusal(vault.addPasskey('not the passphrase', () => TH.passkeyOf('key'), { wayinlabel: 'key' }), 'wrong_passphrase')
    await TH.expectRefusal(vault.addPasskey({ ...laptop, prfBytes: new Uint8Array(32) }, () => TH.passkeyOf('key'), { wayinlabel: 'key' }), 'wrong_passkey')
    expect(wayinlabelsOf(vault)).to.deep.equal(['passphrase', 'laptop', 'phone'])
  })

  it("addPasskey makes its passkey only once the proof holds: a refused proof, label or room never asks the authenticator", async () => {
    const { vault, laptop } = await vaultWithPasskey()
    const makePasskey = vi.fn(() => TH.passkeyOf('phone'))
    await TH.expectRefusal(vault.addPasskey('not the passphrase', makePasskey, { wayinlabel: 'phone' }), 'wrong_passphrase')
    await TH.expectRefusal(vault.addPasskey(' '.repeat(3), makePasskey, { wayinlabel: 'phone' }), 'wrong_passphrase')
    await TH.expectRefusal(vault.addPasskey({ ...laptop, prfBytes: new Uint8Array(32) }, makePasskey, { wayinlabel: 'phone' }), 'wrong_passkey')
    await TH.expectRefusal(vault.addPasskey('pw', makePasskey, { wayinlabel: 'laptop' }), 'bad_label')
    for (let ii = 2; ii < MaxUnlocks; ii += 1) {
      await vault.addPasskey('pw', () => TH.passkeyOf(`key${String(ii)}`), { wayinlabel: `key${String(ii)}` })
    }
    await TH.expectRefusal(vault.addPasskey('pw', makePasskey, { wayinlabel: 'phone' }), 'too_many_wayins')
    expect(makePasskey).not.toHaveBeenCalled()
  })

  it("addPasskey adds nothing, and resolves null, when the passkey's prompt is dismissed", async () => {
    const { world, vault } = await vaultWithPasskey()
    const wayinsThen = vault.getSnapshot().wayins.length
    const vaultPropsThen = await world.vaultDB.readVaultProps(TH.scopeOf('u1'))
    expect(await vault.addPasskey('pw', () => Promise.resolve(null), { wayinlabel: 'phone' })).to.be.null
    expect(vault.getSnapshot().wayins).to.have.lengthOf(wayinsThen)
    expect(await world.vaultDB.readVaultProps(TH.scopeOf('u1'))).to.deep.equal(vaultPropsThen)
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("addPasskey throws what its passkey maker throws, adding nothing", async () => {
    const { vault } = await vaultWithPasskey()
    const unavailable = new VaultError('passkey_unavailable', 'No PRF here.')
    const err = await TH.expectRefusal(vault.addPasskey('pw', () => Promise.reject(unavailable), { wayinlabel: 'phone' }), 'passkey_unavailable')
    expect(err).to.equal(unavailable)
    expect(wayinlabelsOf(vault)).to.deep.equal(['passphrase', 'laptop'])
  })

  it("addPasskey refuses a malformed answer, a credential already in the vault, a taken label, and a full vault", async () => {
    const { vault, laptop } = await vaultWithPasskey()
    const phone = await TH.passkeyOf('phone')
    const shortSalt = toB64(new Uint8Array(16))
    await TH.expectRefusal(vault.addPasskey('pw', answering({ ...phone, prfSaltB64: shortSalt }), { wayinlabel: 'phone' }), 'bad_option')
    await TH.expectRefusal(vault.addPasskey('pw', answering({ ...phone, prfSaltB64: 'not base64url!' }), { wayinlabel: 'phone' }), 'bad_option')
    const shortAnswer = new Uint8Array(16)
    await TH.expectRefusal(vault.addPasskey('pw', answering({ ...phone, prfBytes: shortAnswer }), { wayinlabel: 'phone' }), 'bad_option')
    await TH.expectRefusal(vault.addPasskey('pw', answering({ ...phone, credentialId: '' }), { wayinlabel: 'phone' }), 'bad_option')
    await TH.expectRefusal(vault.addPasskey('pw', answering(undefined), { wayinlabel: 'phone' }), 'bad_option')
    await TH.expectRefusal(vault.addPasskey('pw', answering(laptop), { wayinlabel: 'laptop_again' }), 'bad_option')
    await TH.expectRefusal(vault.addPasskey('pw', answering(phone), { wayinlabel: 'laptop' }), 'bad_label')
    await TH.expectRefusal(vault.addPasskey('pw', answering(phone), { wayinlabel: 'Phone' }), 'bad_label')
    expect(wayinlabelsOf(vault)).to.deep.equal(['passphrase', 'laptop'])
    for (let ii = 2; ii < MaxUnlocks; ii += 1) {
      await vault.addPasskey('pw', () => TH.passkeyOf(`key${String(ii)}`), { wayinlabel: `key${String(ii)}` })
    }
    await TH.expectRefusal(vault.addPasskey('pw', answering(phone), { wayinlabel: 'phone' }), 'too_many_wayins')
  })

  const NotMakers = [
    [null,                     'nothing at all'],
    ['laptop',                 'a string'],
    [{ credentialId: 'cred' }, "a passkey's answer itself, made before the proof was checked"],
  ] as const

  for (const [notMaker, blurb] of NotMakers) {
    it(`addPasskey refuses, as bad_option, ${blurb} in place of a passkey maker`, async () => {
      const { vault } = await vaultWithPasskey()
      await TH.expectRefusal(vault.addPasskey('pw', notMaker as unknown as () => Promise<PasskeyProof>, { wayinlabel: 'phone' }), 'bad_option')
    })
  }

  it("addPasskey refuses as stale_write when another device changed the ways in while the authenticator was asked", async () => {
    const { world, vault } = await vaultWithPasskey()
    const elsewhere = await world.open({ deviceDB: memoryDeviceDB() })
    await elsewhere.unlock('pw')
    const makePasskey = async () => {
      await elsewhere.addPassphrase('pw', 'pw two', { wayinlabel: 'spare' })
      return await TH.passkeyOf('phone')
    }
    await TH.expectRefusal(vault.addPasskey('pw', makePasskey, { wayinlabel: 'phone' }), 'stale_write')
    expect(wayinlabelsOf(elsewhere)).to.deep.equal(['passphrase', 'laptop', 'spare'])
  })

  it("a passkey's answer of the wrong shape is refused as misuse wherever it is a proof, never quoting it", async () => {
    const { vault, laptop } = await vaultWithPasskey()
    const misshapen = { ...laptop, prfBytes: [...laptop.prfBytes] } as unknown as PasskeyProof
    for (const refused of [vault.unlock(misshapen), vault.addPassphrase(misshapen, 'pw two', { wayinlabel: 'two' }), vault.retireWayin(misshapen, 'wayin-gone')]) {
      const err = await TH.expectRefusal(refused, 'bad_option')
      expect(err.message).to.not.include(laptop.credentialId)
      expect(err.message).to.not.include(laptop.prfBytes.join(','))
    }
    await TH.expectRefusal(vault.unlock(undefined as unknown as string), 'bad_option')
  })

  it("a passkey sets a new passphrase for a user who forgot theirs: add one, remove the old", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    await vault.lock()
    const forgotten = vault.getSnapshot().wayins[0]?.wayin_id ?? ''
    await vault.addPassphrase(laptop, 'a new passphrase', { wayinlabel: 'new_phrase' })
    await vault.retireWayin(laptop, forgotten)
    expect(wayinlabelsOf(vault)).to.deep.equal(['laptop', 'new_phrase'])
    expect(vault.getSnapshot().state).to.eq('unlocked')
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.expectRefusal(fresh.unlock('pw'), 'wrong_passphrase')
    await fresh.unlock('a new passphrase')
    expect(await fresh.readBox('anthropic')).to.eq('sk-fake')
  })

  it("changePassphrase takes a passkey's answer as proof, and changes the vault's one passphrase", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    await vault.lock()
    const [passphraseWay] = vault.getSnapshot().wayins
    await vault.changePassphrase(laptop, 'a new passphrase')
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(wayinlabelsOf(vault)).to.deep.equal(['passphrase', 'laptop'])
    // The passphrase's way in is the same one, as a changed passphrase's is.
    expect(vault.getSnapshot().wayins[0]?.wayin_id).to.eq(passphraseWay?.wayin_id)
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.expectRefusal(fresh.unlock('pw'), 'wrong_passphrase')
    await fresh.unlock('a new passphrase')
    expect(await fresh.readBox('anthropic')).to.eq('sk-fake')
  })

  it("changePassphrase with a passkey among several passphrases changes the one wayinId names, and refuses to guess", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    const spareId = await vault.addPassphrase('pw', 'spare pw', { wayinlabel: 'spare' })
    const firstId = vault.getSnapshot().wayins[0]?.wayin_id ?? ''
    await TH.expectRefusal(vault.changePassphrase(laptop, 'new pw'), 'bad_option')
    await vault.changePassphrase(laptop, 'new pw', { wayinId: spareId })
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.expectRefusal(fresh.unlock('spare pw'), 'wrong_passphrase')
    await fresh.unlock('new pw')
    await fresh.lock()
    await fresh.unlock('pw', { wayinId: firstId })
    expect(wayinlabelsOf(vault)).to.deep.equal(['passphrase', 'laptop', 'spare'])
  })

  it("changePassphrase with a passkey refuses a wayinId that is not one of the vault's passphrases, and a passkey that does not open it", async () => {
    const { world, vault, laptop, wayinId } = await vaultWithPasskey()
    await TH.expectRefusal(vault.changePassphrase(laptop, 'new pw', { wayinId }), 'absent_wayin')
    await TH.expectRefusal(vault.changePassphrase(laptop, 'new pw', { wayinId: 'wayin-gone' }), 'absent_wayin')
    const stranger = await TH.passkeyOf('stranger')
    await TH.expectRefusal(vault.changePassphrase(stranger, 'new pw'), 'absent_wayin')
    const wrongAnswer = { ...laptop, prfBytes: new Uint8Array(32).fill(7) }
    await TH.expectRefusal(vault.changePassphrase(wrongAnswer, 'new pw'), 'wrong_passkey')
    // Nothing changed through any of it: the old passphrase still opens the vault.
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await fresh.unlock('pw')
    expect(wayinlabelsOf(vault)).to.deep.equal(['passphrase', 'laptop'])
  })

  it("changePassphrase with a passkey mends a passphrase stored at another vault_key_epoch: the new one opens", async () => {
    const { world, laptop } = await vaultWithPasskey()
    const vaultProps = JSON.parse(world.dbStore.read(u1VaultPropsCkey) ?? '{}') as { wayins: Record<string, unknown>[] }
    const wayins = vaultProps.wayins.map((wayin, ii) => (ii === 0 ? { ...wayin, vault_key_epoch: 2 } : wayin))
    world.dbStore.write(u1VaultPropsCkey, JSON.stringify({ ...vaultProps, wayins }))
    const vault = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.expectRefusal(vault.unlock('pw'), 'damaged_wayin')
    await vault.changePassphrase(laptop, 'a new passphrase')
    expect(storedWayinsOf(world)[0]).to.deep.include({ vault_key_epoch: 1 })
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await fresh.unlock('a new passphrase')
    expect(await fresh.readBox('anthropic')).to.eq('sk-fake')
  })

  it("changePassphrase with a passkey refuses a blank new passphrase and a misshapen answer, quoting neither", async () => {
    const { vault, laptop } = await vaultWithPasskey()
    await TH.expectRefusal(vault.changePassphrase(laptop, ' '.repeat(3)), 'wrong_passphrase')
    await TH.expectRefusal(vault.changePassphrase(laptop, 42 as unknown as string), 'bad_option')
    const misshapen = { ...laptop, prfBytes: [...laptop.prfBytes] } as unknown as PasskeyProof
    const err = await TH.expectRefusal(vault.changePassphrase(misshapen, 'new pw'), 'bad_option')
    expect(err.message).to.not.include(laptop.prfBytes.join(','))
  })

  it("changePassphrase with a passphrase of a vault that has a passkey still aims at the way in that opened, and refuses a passkey's wayin_id", async () => {
    const { vault, wayinId } = await vaultWithPasskey()
    await TH.expectRefusal(vault.changePassphrase('pw', 'new pw', { wayinId }), 'absent_wayin')
    expect(wayinlabelsOf(vault)).to.deep.equal(['passphrase', 'laptop'])
  })

  it("retireWayin takes a passkey away: it no longer opens the vault", async () => {
    const { world, vault, laptop, wayinId } = await vaultWithPasskey()
    await vault.retireWayin('pw', wayinId)
    expect(wayinlabelsOf(vault)).to.deep.equal(['passphrase'])
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.expectRefusal(fresh.unlock(laptop), 'absent_wayin')
  })

  it("retireWayin never removes the last passphrase, though passkeys remain", async () => {
    const { vault, laptop } = await vaultWithPasskey()
    const passphraseId = vault.getSnapshot().wayins[0]?.wayin_id ?? ''
    await TH.expectRefusal(vault.retireWayin(laptop, passphraseId), 'last_wayin')
    await TH.expectRefusal(vault.retireWayin('pw', passphraseId), 'last_wayin')
    expect(wayinlabelsOf(vault)).to.deep.equal(['passphrase', 'laptop'])
  })

  it("every change of a passkey moves the epoch: another device locks, and this one stays unlocked", async () => {
    const world = makeWorld()
    const here = await world.open()
    await here.unlock('pw')
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    await there.unlock('pw')
    const wayinId = await addLaptopPasskey(here)
    await vi.waitFor(() => { expect(there.getSnapshot().state).to.eq('locked') })
    await there.unlock(await TH.passkeyOf('laptop'))
    await here.retireWayin('pw', wayinId)
    await vi.waitFor(() => { expect(there.getSnapshot().state).to.eq('locked') })
    expect(storedVaultPropsOf(world)['unlock_epoch']).to.eq(3)
    expect(here.getSnapshot().state).to.eq('unlocked')
  })

  it("the backend holds no passkey's answer, only its credential and salt", async () => {
    const { world, laptop } = await vaultWithPasskey()
    const everything = world.dbStore.ckeys().map((ckey) => world.dbStore.read(ckey)).join('\n')
    expect(everything).to.not.include(toB64(laptop.prfBytes))
    expect(everything).to.include(laptop.credentialId)
    expect(everything).to.include(laptop.prfSaltB64)
  })

  it("removal is not revocation: a copy of the vault props from before still opens with the removed passkey", async () => {
    const { world, vault, laptop, wayinId } = await vaultWithPasskey()
    const kept = world.dbStore.read(Ckeys.vaultProps(TH.scopeOf('u1'))) ?? ''
    await vault.retireWayin('pw', wayinId)
    const copy = makeWorld()
    copy.dbStore.write(Ckeys.vaultProps(TH.scopeOf('u1')), kept)
    const thief = await copy.open()
    await thief.unlock(laptop)
    expect(thief.getSnapshot().state).to.eq('unlocked')
  })
})

/**
 * A world whose slow waits can be held mid-flight, to land a lock inside an unlock: each
 * `holdNext` arms a gate on the next look at the vault props, passphrase derivation, device-record
 * write, or (to hold a store in hand) read of a lockbox, and hands it back. Its key deriver is a
 * TestDeriver of its own, so a spy on it stays here.
 */
const makeRacingWorld = (defaults?: Partial<MakeVaultOpts>) => {
  const keyDeriver = new TH.TestDeriver()
  const world = makeWorld({ keyDeriver, ...defaults })
  const holdNextLook = () => TH.holdNextCall(world.vaultDB, 'readVaultProps')
  const holdNextDerive = () => TH.holdNextCall(keyDeriver, 'deriveKeyBytes')
  const holdNextLease = () => TH.holdNextCall(world.deviceDB, 'writeLease')
  const holdNextBoxRead = () => TH.holdNextCall(world.vaultDB, 'readBox')
  return { ...world, holdNextLook, holdNextDerive, holdNextLease, holdNextBoxRead }
}

describe("a lock that lands while an unlock is under way", () => {
  it("during the passphrase check: the lock wins, the unlock throws 'vault_locked', and no lease is granted", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.lock()
    const gate = world.holdNextDerive()
    const unlocking = TH.expectRefusal(vault.unlock('pw one'), 'vault_locked')
    await gate.reached
    await vault.lock()
    gate.release()
    const err = await unlocking
    expect(err.message).to.not.include('pw one')
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(vault.getSnapshot().askPassphraseAt).to.be.null
    await TH.expectRefusal(vault.readBox('anything'), 'vault_locked')
    expect(await world.readLease()).to.be.null
    // Well within the seven days a lease would last: the reopen is locked all the same.
    world.advance(HourMillis)
    expect(await world.stateOnOpen()).to.eq('locked')
  })

  it("an unlock begun after the lock is untouched by it", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    const gate = world.holdNextDerive()
    const unlocking = TH.expectRefusal(vault.unlock('pw one'), 'vault_locked')
    await gate.reached
    await vault.lock()
    gate.release()
    await unlocking
    await vault.unlock('pw one')
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(vault.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + SevenDaysMillis)
    expect(await world.readLease()).to.not.be.null
  })

  it("on a vault already unlocked: the lock still wins, and leaves it locked", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    world.advance(HourMillis)
    const gate = world.holdNextDerive()
    const unlocking = TH.expectRefusal(vault.unlock('pw one'), 'vault_locked')
    await gate.reached
    await vault.lock()
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.readLease()).to.be.null
  })

  it("during the device record's write: the record that lands after the lock's erase is erased again", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.lock()
    const gate = world.holdNextLease()
    const unlocking = TH.expectRefusal(vault.unlock('pw one'), 'vault_locked')
    await gate.reached
    await vault.lock()
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.readLease()).to.be.null
    expect(await world.stateOnOpen()).to.eq('locked')
  })

  it("during the look at storage: the lock wins before a first unlock makes the vault", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    const gate = world.holdNextLook()
    const unlocking = TH.expectRefusal(vault.unlock('pw one'), 'vault_locked')
    await gate.reached
    await vault.lock()
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.eq('absent')
    expect(world.dbStore.ckeys()).to.have.lengthOf(0)
  })

  it("during a first unlock's passphrase check: the vault is made, under that passphrase, and stays locked", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    const gate = world.holdNextDerive()
    const unlocking = TH.expectRefusal(vault.unlock('pw one'), 'vault_locked')
    await gate.reached
    await vault.lock()
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.readLease()).to.be.null
    await vault.unlock('pw one')
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("a retire() that lands mid-unlock wins the same way, and the vault is gone", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.storeBox('anthropic', 'sk-fake')
    await vault.lock()
    const gate = world.holdNextDerive()
    const unlocking = TH.expectRefusal(vault.unlock('pw one'), 'vault_locked')
    await gate.reached
    await vault.retire()
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.eq('absent')
    expect(world.dbStore.ckeys()).to.have.lengthOf(0)
    expect(await world.readLease()).to.be.null
  })

  it("during changePassphrase(): the passphrase still changes, and the vault stays locked", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('old passphrase')
    await vault.storeBox('anthropic', 'sk-fake')
    const gate = world.holdNextDerive()
    const changing = vault.changePassphrase('old passphrase', 'new passphrase')
    await gate.reached
    await vault.lock()
    gate.release()
    await changing
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.readLease()).to.be.null

    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.expectRefusal(fresh.unlock('old passphrase'), 'wrong_passphrase')
    await fresh.unlock('new passphrase')
    expect(await fresh.readBox('anthropic')).to.eq('sk-fake')
  })

  it("during addPasskey()'s prompt: the passkey still lands, and the vault stays locked", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake')
    const makePasskey = async () => {
      await vault.lock()
      return await TH.passkeyOf('laptop')
    }
    expect(await vault.addPasskey('pw', makePasskey, { wayinlabel: 'laptop' })).to.be.a('string')
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.readLease()).to.be.null

    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await fresh.unlock(await TH.passkeyOf('laptop'))
    expect(await fresh.readBox('anthropic')).to.eq('sk-fake')
  })

  it("during changePassphrase()'s device record write: the record is erased again", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('old passphrase')
    const gate = world.holdNextLease()
    const changing = vault.changePassphrase('old passphrase', 'new passphrase')
    await gate.reached
    await vault.lock()
    gate.release()
    await changing
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.readLease()).to.be.null
    await vault.unlock('new passphrase')
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })
})

describe("a read in flight when a lock lands", () => {
  afterEach(() => { vi.restoreAllMocks() })

  it("refuses as locked when lock() lands while storage is read, handing back nothing", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.storeBox('anthropic', 'sk-fake')
    const gate = world.holdNextBoxRead()
    const reading = TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
    await gate.reached
    await vault.lock()
    gate.release()
    await reading
  })

  it("refuses as locked when lock() lands while the whisper is deciphered, its callback never called", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.storeBox('anthropic', 'sk-fake')
    const gate = TH.holdNextCall(crypto.subtle, 'decrypt')
    const callback = vi.fn()
    const using = TH.expectRefusal(vault.useBox('anthropic', callback), 'vault_locked')
    await gate.reached
    await vault.lock()
    gate.release()
    await using
    expect(callback).not.toHaveBeenCalled()
  })

  it("finishes when lockSoon() lands while storage is read: a soft lock waits for work in hand", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.storeBox('anthropic', 'sk-fake')
    const gate = world.holdNextBoxRead()
    const reading = vault.readBox('anthropic')
    await gate.reached
    await vault.lockSoon()
    gate.release()
    expect(await reading).to.eq('sk-fake')
    await TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
  })

  it("refuses as closed when close() lands while storage is read, handing back nothing", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.storeBox('anthropic', 'sk-fake')
    const gate = world.holdNextBoxRead()
    const reading = TH.expectRefusal(vault.readBox('anthropic'), 'vault_closed')
    await gate.reached
    vault.close()
    gate.release()
    await reading
  })

  it("refuses as closed when close() lands while the whisper is deciphered, its callback never called", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.storeBox('anthropic', 'sk-fake')
    const gate = TH.holdNextCall(crypto.subtle, 'decrypt')
    const callback = vi.fn()
    const using = TH.expectRefusal(vault.useBox('anthropic', callback), 'vault_closed')
    await gate.reached
    vault.close()
    gate.release()
    await using
    expect(callback).not.toHaveBeenCalled()
  })

  it("refuses as locked when a refresh finds the passphrase changed elsewhere while storage is read: the key it held is outlived", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.storeBox('anthropic', 'sk-fake')
    const there = await world.openUnlocked('pw one', { deviceDB: memoryDeviceDB() })
    const gate = world.holdNextBoxRead()
    const reading = TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
    await gate.reached
    await there.changePassphrase('pw one', 'pw two')
    // Let this handle's background refresh, rung by the write above, find its key outlived.
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot().state).to.eq('locked')
    gate.release()
    await reading
  })

  it("refuses as locked when a refresh finds the vault retired elsewhere while the whisper is deciphered", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.storeBox('anthropic', 'sk-fake')
    const there = await world.openUnlocked('pw one', { deviceDB: memoryDeviceDB() })
    const gate = TH.holdNextCall(crypto.subtle, 'decrypt')
    const callback = vi.fn()
    const using = TH.expectRefusal(vault.useBox('anthropic', callback), 'vault_locked')
    await gate.reached
    await there.retire()
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot().state).to.eq('absent')
    gate.release()
    await using
    expect(callback).not.toHaveBeenCalled()
  })
})

/**
 * Device B, open on an absent vault, and device A, another device on the same storage. A makes
 * the vault with 'pw one' (and stores a lockbox) inside B's first unlock, between B's
 * look at storage and B's write. B hears no bell from storage, so that only its own catch-up can
 * bring A's vault in.
 */
const raceLostToPwOne = async () => {
  const world = makeWorld()
  const deafDB = world.deafVaultDB()
  const there = await world.open({ vaultDB: deafDB })
  const here = await world.open({ deviceDB: memoryDeviceDB() })
  TH.beforeNextCall(deafDB, 'fetchOrCreateVaultProps', async () => {
    await here.unlock('pw one')
    await here.storeBox('anthropic', 'sk-ant-fake-theirs')
  })
  return { world, deafDB, there, here }
}

describe("a first unlock that loses the race to create the vault", () => {
  it("refuses as created_elsewhere when the passphrase does not open the vault the other device made, as unlock's example shows", async () => {
    const { there } = await raceLostToPwOne()
    const err = await TH.expectRefusal(there.unlock('pw two'), 'created_elsewhere')
    expect(err.message).to.match(/^A vault was just created for this label on another device, with a different passphrase/)
    expect(err.message).to.include('Enter the passphrase you chose there')
    expect(err.message).to.not.include('pw')
    expect(err.cause).to.have.property('kind', 'wrong_passphrase')
  })

  it("settles locked on the standing vault, caught up with its lockboxes, and unlocks it with the passphrase chosen there", async () => {
    const { world, there } = await raceLostToPwOne()
    await TH.expectRefusal(there.unlock('pw two'), 'created_elsewhere')
    const snapshot = there.getSnapshot()
    expect(snapshot.state).to.eq('locked')
    expect(snapshot.syncing).to.be.true
    expect(snapshot.wayins.map((wayin) => wayin.wayinlabel)).to.deep.equal(['passphrase'])
    expect(boxlabelsOf(there)).to.deep.equal(['anthropic'])
    expect(await world.readLease()).to.be.null
    await there.unlock('pw one')
    expect(await there.readBox('anthropic')).to.eq('sk-ant-fake-theirs')
  })

  it("tells a second wrong passphrase as wrong_passphrase: the vault now stands, and created_elsewhere is only for the first unlock", async () => {
    const { there } = await raceLostToPwOne()
    await TH.expectRefusal(there.unlock('pw two'), 'created_elsewhere')
    await TH.expectRefusal(there.unlock('pw three'), 'wrong_passphrase')
  })

  it("unlocks the vault the other device made when the passphrase opens it: no refusal at all", async () => {
    const { world, there, here } = await raceLostToPwOne()
    await there.unlock('pw one')
    expect(there.getSnapshot().state).to.eq('unlocked')
    expect(there.getSnapshot().wayins.map((wayin) => wayin.wayinlabel)).to.deep.equal(['passphrase'])
    expect(storedWayinsOf(world)).to.have.lengthOf(1)
    expect(await there.readBox('anthropic')).to.eq('sk-ant-fake-theirs')
    expect(here.getSnapshot().state).to.eq('unlocked')
  })

  it("is still created_elsewhere when the catch-up after it fails, the snapshot saying it is not syncing, and the failure warned of", async () => {
    const { world, deafDB, there } = await raceLostToPwOne()
    vi.spyOn(deafDB, 'listBoxes').mockRejectedValueOnce(new VaultError('storage_unavailable', 'The vault storage could not be reached.'))
    await TH.expectRefusal(there.unlock('pw two'), 'created_elsewhere')
    expect(there.getSnapshot().state).to.eq('locked')
    expect(there.getSnapshot().syncing).to.be.false
    expect(world.logged.map((call) => call.level)).to.include('warn')
  })

  it("is plain wrong_passphrase when the other device's vault was in storage before this unlock looked: the look finds it", async () => {
    const world = makeWorld()
    const there = await world.open()
    const here = await world.open({ deviceDB: memoryDeviceDB() })
    await here.unlock('pw one')
    await TH.expectRefusal(there.unlock('pw two'), 'wrong_passphrase')
    expect(there.getSnapshot().state).to.eq('locked')
  })
})

describe("a vault that moves elsewhere while an unlock is under way", () => {
  it("retired and made anew: the unlock takes up nothing, throws 'vault_locked', and can't seal into the new vault", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.lock()
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    const gate = world.holdNextDerive()
    const unlocking = TH.expectRefusal(vault.unlock('pw one'), 'vault_locked')
    await gate.reached
    await there.retire()
    await there.unlock('pw two')
    await there.storeBox('anthropic', 'sk-ant-fake-new')
    // Let this handle's background refresh, rung by the writes above, bring in the new vault.
    await TH.wakeupAtNextTick()
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.readLease()).to.be.null
    await TH.expectRefusal(vault.storeBox('anthropic', 'sk-ant-fake-stale'), 'vault_locked')
    expect(await there.readBox('anthropic')).to.eq('sk-ant-fake-new')
    await vault.unlock('pw two')
    expect(await vault.readBox('anthropic')).to.eq('sk-ant-fake-new')
  })

  it("retired and not remade: the unlock takes up nothing, and the vault reads as absent", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.lock()
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    const gate = world.holdNextDerive()
    const unlocking = TH.expectRefusal(vault.unlock('pw one'), 'vault_locked')
    await gate.reached
    await there.retire()
    await TH.wakeupAtNextTick()
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.eq('absent')
    expect(await world.readLease()).to.be.null
  })

  it("its passphrase changed: the old passphrase, proven a moment too late, unlocks nothing", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.lock()
    const there = await world.openUnlocked('pw one', { deviceDB: memoryDeviceDB() })
    const gate = world.holdNextDerive()
    const unlocking = TH.expectRefusal(vault.unlock('pw one'), 'vault_locked')
    await gate.reached
    await there.changePassphrase('pw one', 'pw two')
    await TH.wakeupAtNextTick()
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.readLease()).to.be.null
    await vault.unlock('pw two')
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("a refresh that brings back the same vault props, unchanged, does not defeat the unlock", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.lock()
    const there = await world.openUnlocked('pw one', { deviceDB: memoryDeviceDB() })
    const gate = world.holdNextDerive()
    const unlocking = vault.unlock('pw one')
    await gate.reached
    await there.storeBox('anthropic', 'sk-ant-fake')
    await TH.wakeupAtNextTick()
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(await vault.readBox('anthropic')).to.eq('sk-ant-fake')
  })
})

describe("lockSoon", () => {
  // Only the timers: promises, and vitest's own waits, keep running as they do.
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }) })
  afterEach(() => { vi.useRealTimers() })

  const GraceMillis = 5000

  it("closes the entry gate at once: the snapshot reads 'locked', and no whisper comes out", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.storeBox('anthropic', 'sk-fake')
    await vault.lockSoon()
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(vault.getSnapshot().askPassphraseAt).to.be.null
    await TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
    await TH.expectRefusal(vault.storeBox('openai', 'sk-fake-too'), 'vault_locked')
  })

  it("keeps the gate closed through the grace, even if the clock steps back", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.storeBox('anthropic', 'sk-fake')
    await vault.lockSoon(30)
    world.advance(-10_000)
    await TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
    expect(vault.getSnapshot().state).to.eq('locked')
  })

  it("revokes the lease at once: a reopen within the grace asks for the passphrase", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.lockSoon()
    expect(await world.readLease()).to.be.null
    expect(await world.stateOnOpen()).to.eq('locked')
  })

  it("lets work in hand finish: a store already under way lands within the grace", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    const gate = world.holdNextBoxRead()
    const storing = vault.storeBox('anthropic', 'sk-fake')
    await gate.reached
    await vault.lockSoon()
    gate.release()
    await storing
    await vault.unlock('pw one')
    expect(await vault.readBox('anthropic')).to.eq('sk-fake')
  })

  it("keeps the key for work in hand while new work is refused at the gate", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    const gate = world.holdNextBoxRead()
    const storing = vault.storeBox('anthropic', 'sk-fake')
    await gate.reached
    await vault.lockSoon()
    await TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
    gate.release()
    await storing
  })

  it("drops the vaultKey when the grace runs out: work still in hand after it is refused", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    const gate = world.holdNextBoxRead()
    const storing = TH.expectRefusal(vault.storeBox('anthropic', 'sk-fake'), 'vault_locked')
    await gate.reached
    await vault.lockSoon()
    vi.advanceTimersByTime(GraceMillis)
    gate.release()
    await storing
    expect(vi.getTimerCount()).to.eq(0)
    await vault.unlock('pw one')
    await TH.expectRefusal(vault.readBox('anthropic'), 'absent_box')
  })

  it("unlike lock(), which refuses work in hand at its next look", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    const gate = world.holdNextBoxRead()
    const storing = TH.expectRefusal(vault.storeBox('anthropic', 'sk-fake'), 'vault_locked')
    await gate.reached
    await vault.lock()
    gate.release()
    await storing
  })

  it("lets an unlock under way when it is called finish, unlocked and leased: a soft lock waits for work in hand", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    const gate = world.holdNextDerive()
    const unlocking = vault.unlock('pw one')
    await gate.reached
    await vault.lockSoon()
    expect(vault.getSnapshot().state).to.eq('locked')
    gate.release()
    await unlocking
    vi.advanceTimersByTime(GraceMillis * 2)
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(await world.readLease()).to.not.be.null
  })

  it("lets a changePassphrase() under way finish, unlocked under the new passphrase", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('old passphrase')
    const gate = world.holdNextDerive()
    const changing = vault.changePassphrase('old passphrase', 'new passphrase')
    await gate.reached
    await vault.lockSoon()
    gate.release()
    await changing
    vi.advanceTimersByTime(GraceMillis * 2)
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(await world.readLease()).to.not.be.null
    await vault.lock()
    await TH.expectRefusal(vault.unlock('old passphrase'), 'wrong_passphrase')
    await vault.unlock('new passphrase')
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("lets an unlock under way in another tab finish, raising no lock generation", async () => {
    const world = makeRacingWorld()
    const otherTab = await world.openUnlocked('pw one')
    const thisTab = await world.open()
    await thisTab.lock()
    const gate = world.holdNextDerive()
    const unlocking = thisTab.unlock('pw one')
    await gate.reached
    await otherTab.unlock('pw one')
    await otherTab.lockSoon()
    gate.release()
    await unlocking
    expect(thisTab.getSnapshot().state).to.eq('unlocked')
    expect(await generationOf(world)).to.eq(1)
    expect(await world.readLease()).to.not.be.null
  })

  it("is ended by an unlock within the grace: the new unlock stands past it, with its lease", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.storeBox('anthropic', 'sk-fake')
    await vault.lockSoon()
    await vault.unlock('pw one')
    expect(vi.getTimerCount()).to.eq(1)  // the new unlock's own shut, seven days and a minute out
    vi.advanceTimersByTime(GraceMillis * 2)
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(vault.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + SevenDaysMillis)
    expect(await vault.readBox('anthropic')).to.eq('sk-fake')
    expect(await world.readLease()).to.not.be.null
  })

  it("is ended by a changePassphrase() within the grace, which proves the passphrase as an unlock does", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('old passphrase')
    await vault.storeBox('anthropic', 'sk-fake')
    await vault.lockSoon()
    await vault.changePassphrase('old passphrase', 'new passphrase')
    expect(vi.getTimerCount()).to.eq(1)  // the new deadline's own shut
    vi.advanceTimersByTime(GraceMillis * 2)
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(await vault.readBox('anthropic')).to.eq('sk-fake')
  })

  it("loses to an unlock begun within the grace and still under way when it runs out", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.storeBox('anthropic', 'sk-fake')
    await vault.lockSoon()
    const gate = world.holdNextDerive()
    const unlocking = vault.unlock('pw one')
    await gate.reached
    vi.advanceTimersByTime(GraceMillis)
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(await vault.readBox('anthropic')).to.eq('sk-fake')
  })

  it("never lengthens a grace already running, and a shorter one shortens it", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    const firstGate = world.holdNextBoxRead()
    const firstStoring = TH.expectRefusal(vault.storeBox('anthropic', 'sk-fake'), 'vault_locked')
    await firstGate.reached
    await vault.lockSoon(1)
    await vault.lockSoon(30)
    vi.advanceTimersByTime(1000)
    firstGate.release()
    await firstStoring

    await vault.unlock('pw one')
    const secondGate = world.holdNextBoxRead()
    const secondStoring = TH.expectRefusal(vault.storeBox('anthropic', 'sk-fake'), 'vault_locked')
    await secondGate.reached
    await vault.lockSoon(30)
    await vault.lockSoon(1)
    vi.advanceTimersByTime(1000)
    secondGate.release()
    await secondStoring
    expect(vi.getTimerCount()).to.eq(0)
  })

  it("with a grace of 0 is lock(): work in hand is refused, and no timer is left", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    const gate = world.holdNextBoxRead()
    const storing = TH.expectRefusal(vault.storeBox('anthropic', 'sk-fake'), 'vault_locked')
    await gate.reached
    await vault.lockSoon(0)
    expect(vi.getTimerCount()).to.eq(0)
    gate.release()
    await storing
    expect(await world.readLease()).to.be.null
  })

  it("on a vault already locked, or never made, leaves it so, with no timer", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    await vault.lockSoon()
    expect(vault.getSnapshot().state).to.eq('absent')
    await vault.unlock('pw one')
    await vault.lock()
    await vault.lockSoon()
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(vi.getTimerCount()).to.eq(0)
  })

  it("tells subscribers once, when the gate closes, and not again when the key goes", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    const listener = vi.fn()
    vault.subscribe(listener)
    await vault.lockSoon()
    expect(listener).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(GraceMillis)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("is cut short by close(): no timer outlives the handle", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.lockSoon(60)
    expect(vi.getTimerCount()).to.eq(1)
    vault.close()
    expect(vi.getTimerCount()).to.eq(0)
    await TH.expectRefusal(vault.lockSoon(), 'vault_closed')
  })

  it("is cut short by lock(), and by retire()", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.lockSoon()
    await vault.lock()
    expect(vi.getTimerCount()).to.eq(0)
    await vault.unlock('pw one')
    await vault.lockSoon()
    await vault.retire()
    expect(vi.getTimerCount()).to.eq(0)
    expect(vault.getSnapshot().state).to.eq('absent')
  })

  it("as the screen-lock recipe calls it, when the tab is hidden", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    // A stand-in for `document`, which Node has not.
    const page = Object.assign(new EventTarget(), { hidden: false })
    page.addEventListener('visibilitychange', () => { if (page.hidden) { void vault.lockSoon() } })
    const listener = vi.fn()
    vault.subscribe(listener)
    page.hidden = true
    page.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => { expect(listener).toHaveBeenCalled() })
    expect(vault.getSnapshot().state).to.eq('locked')
  })

  const AcceptedGraces = [
    [undefined,  'left out, it is five seconds'],
    [0,          'zero is allowed, and means lock() now'],
    [0.5,        'fractions are fine'],
    [60,         'sixty seconds is the longest grace'],
  ] as const

  const RefusedGraces = [
    [60.001,     'past sixty seconds is refused'],
    [-1,         'a negative grace is refused'],
    [NaN,        'NaN is refused'],
    [Infinity,   'Infinity is refused: the key must die'],
    ["5",        'a number in a string is refused'],
    [null,       'null is refused'],
  ] as const

  describe("graceSeconds", () => {
    for (const [grace, blurb] of AcceptedGraces) {
      it(blurb, async () => {
        const vault = await makeWorld().openUnlocked('pw one')
        await vault.lockSoon(grace)
        expect(vault.getSnapshot().state).to.eq('locked')
      })
    }
    for (const [grace, blurb] of RefusedGraces) {
      it(blurb, async () => {
        const vault = await makeWorld().openUnlocked('pw one')
        const err = await TH.expectRefusal(vault.lockSoon(grace as unknown as number), 'bad_option')
        expect(err.message).to.include('graceSeconds')
        expect(vault.getSnapshot().state).to.eq('unlocked')
      })
    }
  })
})

/** A stand-in for another implementation of Argon2id, deriving cheaply: what a WebAssembly or native one extends. */
class CheapArgon2idDeriver extends Argon2idKeyDeriver {
  protected doDeriveKeyBytes(passphrase: string, saltBytes: Uint8Array) {
    return TH.digestDerivation(passphrase, saltBytes)
  }
}

/** A logger that keeps everything it hears, the notice included, which TH.spyLogger drops. */
const hearingEverything = () => {
  const heard: TH.LoggedCall[] = []
  const hear = (level: keyof VaultLogger) => (message?: string, story?: Record<string, unknown>, err?: Error | null) => { heard.push({ level, message, story, err }) }
  return { heard, logger: { log: hear('log'), warn: hear('warn'), error: hear('error') } }
}

// What a deriver's spec may be, and what it may hand back, is the KeyDeriver class's to check
// (key-deriver.test.ts); these hold Vault.make to taking only a KeyDeriver, and the vault to using it.
describe("the key deriver seam", () => {
  it("a vault made under one deriver refuses to unlock under another, by label", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const alienDeriver = new TH.TestDeriver({ key_deriver_label: 'someone_elses_deriver_v9' })
    const alien = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver: alienDeriver })
    await TH.expectRefusal(alien.unlock('pw'), 'unknown_key_deriver')
  })

  it("asks for a keyDeriver outright: there is no default to fall back on", () => {
    expectTypeOf<Pick<MakeVaultOpts, 'keyDeriver'>>().toEqualTypeOf<{ keyDeriver: KeyDeriver }>()
  })

  it("refuses to open without a keyDeriver, pointing at the browser's defaults", async () => {
    const opts = TH.omitting(makeWorld().optsWith(), 'keyDeriver')
    const err = await TH.expectRefusal(TH.settledVault(opts), 'bad_option')
    expect(err.message).to.include('keyDeriver')
    expect(err.message).to.include('safebyok/browser')
  })

  it("refuses a keyDeriver that is not a KeyDeriver, however much of one it looks", async () => {
    const world = makeWorld()
    const NotDerivers = [
      null,
      'argon2id_web_v1',
      { key_deriver_label: 'test_digest_v0', salt_bytes: 16 },
      // A plain-object deriver, as one was written before KeyDeriver was a class:
      { ...Argon2idWebV1, deriveKeyBytes: TH.digestDerivation },
      // A deriver's own fields and methods, without its class:
      { ...TH.TestDeriverSpec, spec: TH.TestDeriverSpec },
      { ...TH.TestDeriverSpec, spec: TH.TestDeriverSpec, passphraseKeyOf: () => Promise.resolve({}), deriveKeyBytes: TH.digestDerivation },
    ]
    for (const notDeriver of NotDerivers) {
      const err = await TH.expectRefusal(world.open({ keyDeriver: notDeriver as unknown as KeyDeriver }), 'bad_option')
      expect(err.message).to.include('subclass of KeyDeriver')
    }
  })

  it("salts each passphrase at its deriver's length, from one byte to the longest the platform's random source hands out", async () => {
    for (const saltBytes of [1, MaxSaltBytes]) {
      const world = makeWorld()
      await world.openUnlocked('pw', { keyDeriver: new TH.TestDeriver({ salt_bytes: saltBytes }) })
      const stored = await world.vaultDB.readVaultProps(TH.scopeOf('u1'))
      const [wayin] = stored?.wayins ?? []
      expect(fromB64(wayin?.wayinkind === 'passphrase' ? wayin.salt_b64 : '')).to.have.lengthOf(saltBytes)
    }
  })

  it("takes a stand-in that carries a supplied spec whole, as a WebAssembly Argon2id would", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw', { keyDeriver: new CheapArgon2idDeriver(Argon2idWebV1) })
    const stored = await world.vaultDB.readVaultProps(TH.scopeOf('u1'))
    const [wayin] = stored?.wayins ?? []
    expect(wayin?.wayinkind === 'passphrase' && wayin.key_deriver_label).to.eq('argon2id_web_v1')
  })

  it("opens and unlocks under a deriver of another algorithm, with no Argon2id parameters to carry", async () => {
    const scrypt = new TH.TestDeriver({ key_deriver_label: 'acme_scrypt_v1', algorithm: 'scrypt' })
    const vault = await makeWorld().openUnlocked('pw', { keyDeriver: scrypt })
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("refuses a deriver that hands back anything but 32 key bytes, and makes no vault of it", async () => {
    const Outputs = [new Uint8Array(16), new Uint8Array(24), new Uint8Array(64), new Uint8Array(0), 'thirty-two bytes, honest'] as const
    for (const output of Outputs) {
      const world = makeWorld()
      const shortDeriver = new TH.TestDeriver({}, () => Promise.resolve(output as Uint8Array))
      const vault = await world.open({ keyDeriver: shortDeriver })
      await TH.expectRefusal(vault.unlock('pw'), 'bad_option')
      expect(await world.vaultDB.readVaultProps(TH.scopeOf('u1'))).to.be.null
      expect(vault.getSnapshot().state).to.eq('absent')
    }
  })

  it("refuses a deriver that hands back 32 zero bytes, a key anyone could rebuild, and makes no vault of it", async () => {
    const Zeros = [new Uint8Array(32), new Uint32Array(8), new Uint8Array(new ArrayBuffer(40), 8, 32)] as const
    for (const output of Zeros) {
      const world = makeWorld()
      const zeroDeriver = new TH.TestDeriver({}, () => Promise.resolve(output as Uint8Array))
      const vault = await world.open({ keyDeriver: zeroDeriver })
      const err = await TH.expectRefusal(vault.unlock('pw'), 'bad_option')
      expect(err.message).to.match(/zero bytes/)
      expect(world.dbStore.ckeys()).to.have.lengthOf(0)
    }
  })

  it("refuses zero bytes at unlock too: a deriver that kept its output cannot open a vault", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const zeroDeriver = new TH.TestDeriver({}, () => Promise.resolve(new Uint8Array(32)))
    const fresh = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver: zeroDeriver })
    await TH.expectRefusal(fresh.unlock('pw'), 'bad_option')
    expect(fresh.getSnapshot().state).to.eq('locked')
  })

  it("takes a key whose one nonzero byte is its last: only all zeros is refused", async () => {
    const world = makeWorld()
    const lastByteSet = new Uint8Array(32)
    lastByteSet[31] = 1
    const vault = await world.openUnlocked('pw', { keyDeriver: new TH.TestDeriver({}, () => Promise.resolve(lastByteSet.slice())) })
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("keeps the very deriver it was handed, and derives through its one method", async () => {
    const keyDeriver = new TH.TestDeriver()
    const passphraseKeyOf = vi.spyOn(keyDeriver, 'passphraseKeyOf')
    const vault = await makeWorld().openUnlocked('pw', { keyDeriver })
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(passphraseKeyOf).toHaveBeenCalledTimes(1)
  })

  describe("a label that begins test_", () => {
    it("warns once through the logger as the vault opens, and goes on to work", async () => {
      const { heard, logger } = hearingEverything()
      const vault = await makeWorld().openUnlocked('pw', { logger })
      expect(heard).to.deep.equal([{ level: 'warn', message: TestDeriverNotice, story: { call: 'make' }, err: undefined }])
      expect(vault.getSnapshot().state).to.eq('unlocked')
    })

    it("warns each time a vault is opened, quoting no passphrase", async () => {
      const { heard, logger } = hearingEverything()
      const world = makeWorld()
      await world.open({ logger })
      await world.open({ logger })
      expect(heard).to.have.lengthOf(2)
      expect(TH.loggedText(heard)).to.not.include('pw ')
    })

    it("says nothing of a label that does not begin test_, or merely holds it", async () => {
      const { heard, logger } = hearingEverything()
      const world = makeWorld()
      await world.open({ logger, keyDeriver: new TH.TestDeriver({ key_deriver_label: 'acme_test_v1' }) })
      await world.open({ logger, keyDeriver: new TH.TestDeriver({ key_deriver_label: 'Test_digest' }) })
      expect(heard).to.deep.equal([])
    })

    it("is heard by TH.spyLogger as nothing, so a test's own count of what the vault said stands", async () => {
      const world = makeWorld()
      await world.open()
      expect(world.logged).to.deep.equal([])
    })
  })
})

/**
 * A racing world whose clock and timers move together, as a real device's do: its clock reads the
 * faked `Date`, so each timer rings with the clock at its own time, not at the end of the jump.
 * `advance` moves the clock alone, as a device asleep would see it. Needs `Date` faked, as
 * {@link fakeTheClock} does.
 */
const makeTimedWorld = () => {
  vi.setSystemTime(Date.parse('2026-10-14T12:00:00Z'))
  const clock = { now: () => Date.now() }
  const world = makeRacingWorld({ clock })
  /** Let `byMillis` pass on the host's clock and on the timers alike, ringing each timer in its turn. */
  const pass = (byMillis: number) => { vi.advanceTimersByTime(byMillis) }
  /** Move the host's clock alone, ringing no timer. */
  const advance = (byMillis: number) => { vi.setSystemTime(Date.now() + byMillis) }
  return { ...world, clock, advance, pass }
}

/** Fake the timers and `Date` alone: promises, and vitest's own waits, keep running as they do. */
const fakeTheClock = () => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }) }

/** A passphraseStrengthTest that refuses `weakOne` and admits the rest, counting its calls. */
const refusing = (weakOne: string) => vi.fn((passphrase: string): PassphraseVerdict => (
  passphrase === weakOne ? { strong: false, reason: 'That one is on every list of guesses: try another.' } : { strong: true }
))

/** A passphraseStrengthTest that answers later, refusing a passphrase of two characters or fewer. */
const refusingTinyLater = async (passphrase: string): Promise<PassphraseVerdict> => {
  await Promise.resolve()
  return passphrase.length > 2 ? { strong: true } : { strong: false, reason: 'Found in a breach: pick another.' }
}

describe("a new passphrase's strength", () => {

  it("refuses to open without a passphraseStrengthTest, with kind 'bad_option': the vault has no test of its own", async () => {
    const world = makeWorld()
    const err = await TH.expectRefusal(world.open({ passphraseStrengthTest: undefined as unknown as PassphraseStrengthTest }), 'bad_option')
    expect(err.message).to.match(/passphraseStrengthTest is required/)
    expect(err.message).to.match(/browserOpts/)
  })

  it("with zxcvbnPassphraseTest, refuses a common password, or one made of the vault's own names, creating nothing", async () => {
    const world = makeWorld()
    const vault = await world.open({ passphraseStrengthTest: zxcvbnPassphraseTest, applabel: 'skylark', vaultlabel: 'pinecone' })
    const err = await TH.expectRefusal(vault.unlock('password1234'), 'weak_passphrase')
    expect(err.message).to.match(/commonly used password/)
    expect(err.message).to.not.include('password1234')
    await TH.expectRefusal(vault.unlock('skylarkpinecone'), 'weak_passphrase')
    expect(world.dbStore.ckeys()).to.have.lengthOf(0)
    await vault.unlock('correct horse battery staple')
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("never runs at unlock: a vault that stands opens with whatever passphrase made it", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const strengthTest = refusing('pw')
    const fresh = await world.open({ deviceDB: memoryDeviceDB(), passphraseStrengthTest: strengthTest })
    await fresh.unlock('pw')
    expect(fresh.getSnapshot().state).to.eq('unlocked')
    expect(strengthTest).not.toHaveBeenCalled()
  })

  it("runs the host's test on the passphrase a vault is created with, its reason the refusal's message", async () => {
    const world = makeWorld()
    const strengthTest = refusing('acme acme acme')
    const vault = await world.open({ passphraseStrengthTest: strengthTest })
    const err = await TH.expectRefusal(vault.unlock('acme acme acme'), 'weak_passphrase')
    expect(err.message).to.eq('That one is on every list of guesses: try another.')
    expect(world.dbStore.ckeys()).to.have.lengthOf(0)
    await vault.unlock('pw')
    expect(strengthTest.mock.calls).to.deep.equal([['acme acme acme', TH.scopeOf('u1')], ['pw', TH.scopeOf('u1')]])
  })

  it("hands the host's test the vault's scope frozen, the very one the snapshot holds, so neither can change it for the other", async () => {
    const world = makeWorld()
    const heard: VaultScope[] = []
    const strengthTest = (_passphrase: string, scope: VaultScope): PassphraseVerdict => {
      heard.push(scope)
      return { strong: true }
    }
    const vault = await world.open({ passphraseStrengthTest: strengthTest })
    await vault.unlock('pw')
    expect(heard[0]).to.eq(vault.getSnapshot().scope)
    expect(Object.isFrozen(vault.getSnapshot().scope)).to.be.true
    expect(() => { Object.assign(vault.getSnapshot().scope, { user_id: 'u2' }) }).to.throw(TypeError)
    expect(vault.getSnapshot().scope).to.deep.equal(TH.scopeOf('u1'))
  })

  it("refuses a weak passphrase at addPassphrase and changePassphrase before any key derivation, changing nothing", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const { keyDeriver, derivations } = countingDeriver()
    const vault = await world.open({ keyDeriver, passphraseStrengthTest: refusing('acme acme acme') })
    const before = await world.vaultDB.readVaultProps(TH.scopeOf('u1'))
    await TH.expectRefusal(vault.addPassphrase('pw', 'acme acme acme', { wayinlabel: 'spare' }), 'weak_passphrase')
    await TH.expectRefusal(vault.changePassphrase('pw', 'acme acme acme'), 'weak_passphrase')
    expect(derivations).not.toHaveBeenCalled()
    expect(await world.vaultDB.readVaultProps(TH.scopeOf('u1'))).to.deep.equal(before)
  })

  it("awaits a host's test that answers a promise", async () => {
    const world = makeWorld()
    const vault = await world.open({ passphraseStrengthTest: refusingTinyLater })
    await TH.expectRefusal(vault.unlock('pw'), 'weak_passphrase')
    await vault.unlock('pw longer')
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("refuses a passphraseStrengthTest that is not a function at Vault.make, with kind 'bad_option'", async () => {
    const world = makeWorld()
    await TH.expectRefusal(world.open({ passphraseStrengthTest: 12 as unknown as MakeVaultOpts['passphraseStrengthTest'] }), 'bad_option')
  })

  it("refuses with kind 'bad_option' a test that answers no verdict, and throws what a test throws, creating nothing", async () => {
    const world = makeWorld()
    const misfit = await world.open({ passphraseStrengthTest: (() => 'weak') as unknown as MakeVaultOpts['passphraseStrengthTest'] })
    await TH.expectRefusal(misfit.unlock('pw'), 'bad_option')
    const thrown = new Error('the strength service is down')
    const broken = await world.open({ passphraseStrengthTest: () => { throw thrown } })
    await expect(broken.unlock('pw')).rejects.toThrow(thrown)
    expect(world.dbStore.ckeys()).to.have.lengthOf(0)
  })
})

describe("natural expiry", () => {
  beforeEach(() => { fakeTheClock() })
  afterEach(() => { vi.useRealTimers() })

  it("says 'locked' to subscribers at askPassphraseAt, and drops the vaultKey a minute later, with no call made", async () => {
    const world = makeTimedWorld()
    const vault = await world.openUnlocked('pw one', { leaseHours: 1 })
    const listener = vi.fn()
    vault.subscribe(listener)
    world.pass(HourMillis - 1)
    expect(listener).not.toHaveBeenCalled()
    world.pass(1)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(vault.getSnapshot().askPassphraseAt).to.be.null
    world.pass(MinuteMillis - 1)
    expect(vi.getTimerCount()).to.eq(1)
    world.pass(1)
    expect(vi.getTimerCount()).to.eq(0)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("refuses new work from askPassphraseAt on, while work in hand keeps the key to finish within the minute", async () => {
    const world = makeTimedWorld()
    const vault = await world.openUnlocked('pw one', { leaseHours: 1 })
    const gate = world.holdNextBoxRead()
    const storing = vault.storeBox('anthropic', 'sk-fake')
    await gate.reached
    world.pass(HourMillis)
    await TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
    expect(vault.getSnapshot().state).to.eq('locked')
    gate.release()
    await storing
    await vault.unlock('pw one')
    expect(await vault.readBox('anthropic')).to.eq('sk-fake')
  })

  it("drops the key by its timer for work still in hand when the minute runs out: that work is refused, and writes nothing", async () => {
    const world = makeTimedWorld()
    const vault = await world.openUnlocked('pw one', { leaseHours: 1 })
    const gate = world.holdNextBoxRead()
    const storing = TH.expectRefusal(vault.storeBox('anthropic', 'sk-fake'), 'vault_locked')
    await gate.reached
    world.pass(HourMillis)
    await TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
    world.pass(MinuteMillis)
    gate.release()
    await storing
    await vault.unlock('pw one')
    await TH.expectRefusal(vault.readBox('anthropic'), 'absent_box')
  })

  it("drops a key whose timer has not run by its shut time at the next look: the threshold is the truth", async () => {
    const world = makeTimedWorld()
    const vault = await world.openUnlocked('pw one', { leaseHours: 1 })
    const gate = world.holdNextBoxRead()
    const storing = TH.expectRefusal(vault.storeBox('anthropic', 'sk-fake'), 'vault_locked')
    await gate.reached
    world.advance(HourMillis + MinuteMillis)  // the clock alone, as a device asleep would see it
    gate.release()
    await storing
    expect(vi.getTimerCount()).to.eq(0)
  })

  it("arms no timer for a vault unlocked until lock()", async () => {
    const world = makeTimedWorld()
    const vault = await world.openUnlocked('pw one', { leaseHours: Infinity })
    expect(vault.getSnapshot().askPassphraseAt).to.eq(FarFuture)
    expect(vi.getTimerCount()).to.eq(0)
  })

  it("arms one timer for an unlock, and one again when the window renews, never one per call", async () => {
    const world = makeTimedWorld()
    const vault = await world.openUnlocked('pw one', { leaseHours: 1 })
    expect(vi.getTimerCount()).to.eq(1)
    await vault.storeBox('anthropic', 'sk-fake')
    await vault.readBox('anthropic')
    await vault.changePassphrase('pw one', 'pw two')
    expect(vi.getTimerCount()).to.eq(1)
  })

  it("arms the timer for a lease taken up at open, from its own deadline", async () => {
    const world = makeTimedWorld()
    await world.openUnlocked('pw one', { leaseHours: 1 })
    world.pass(HourMillis / 2)
    const reopened = await world.open({ leaseHours: 1 })
    expect(reopened.getSnapshot().state).to.eq('unlocked')
    world.pass((HourMillis / 2) + MinuteMillis)
    expect(reopened.getSnapshot().state).to.eq('locked')
  })

  it("lets an unlock begun past the deadline win over the timer, with a deadline of its own", async () => {
    const world = makeTimedWorld()
    const vault = await world.openUnlocked('pw one', { leaseHours: 1 })
    world.pass(HourMillis + 1)
    await vault.unlock('pw one')
    world.pass(MinuteMillis)
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(vault.getSnapshot().askPassphraseAt).to.eq(world.clock.now() - MinuteMillis + HourMillis)
  })

  it("leaves a changePassphrase() under way when it falls due unlocked, under the new passphrase, with a new deadline: a timer is no lock", async () => {
    const world = makeTimedWorld()
    const vault = await world.openUnlocked('old passphrase', { leaseHours: 1 })
    await vault.storeBox('anthropic', 'sk-fake')
    const gate = world.holdNextDerive()
    const changing = vault.changePassphrase('old passphrase', 'new passphrase')
    await gate.reached
    world.pass(HourMillis + MinuteMillis)
    expect(vault.getSnapshot().state).to.eq('locked')
    gate.release()
    await changing
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(vault.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + HourMillis)
    expect(await vault.readBox('anthropic')).to.eq('sk-fake')
    expect(await leaseDeadlineOf(world)).to.eq(world.clock.now() + HourMillis)
  })

  it("gives lockSoon() on a key past its deadline no more than the minute it had left: a shut time only moves earlier", async () => {
    const world = makeTimedWorld()
    const vault = await world.openUnlocked('pw one', { leaseHours: 1 })
    world.pass(HourMillis + (MinuteMillis / 2))
    await vault.lockSoon(60)
    world.pass((MinuteMillis / 2) - 1)
    expect(vi.getTimerCount()).to.eq(1)
    world.pass(1)
    expect(vi.getTimerCount()).to.eq(0)
  })

  it("drops the key at its shut time though the deadline's timer rang late: the drop waits only for what is left of the minute", async () => {
    const world = makeTimedWorld()
    const vault = await world.openUnlocked('pw one', { leaseHours: 1 })
    world.advance(MinuteMillis / 2)  // the device sleeps half a minute: its timers ring that much late
    world.pass(HourMillis)
    expect(vault.getSnapshot().state).to.eq('locked')
    world.pass((MinuteMillis / 2) - 1)
    expect(vi.getTimerCount()).to.eq(1)
    world.pass(1)
    expect(vi.getTimerCount()).to.eq(0)
  })

  it("drops the key at once, and says so through the logger, when the clock fails as the window ends", async () => {
    const world = makeTimedWorld()
    let broken = false
    const clock = { now: () => { if (broken) { throw new Error('the host clock broke: battery flat') } return Date.now() } }
    const vault = await world.openUnlocked('pw one', { leaseHours: 1, clock })
    broken = true
    world.pass(HourMillis)
    expect(vi.getTimerCount()).to.eq(0)
    expect(world.logged.map((heard) => [heard.level, heard.story])).to.deep.equal([['warn', { call: 'expiry' }]])
    broken = false
    expect(vault.getSnapshot().state).to.eq('locked')
    await TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
  })

  it("has lockSoon() drop a key past its shut time at once, its timer late", async () => {
    const world = makeTimedWorld()
    const vault = await world.openUnlocked('pw one', { leaseHours: 1 })
    world.advance(HourMillis + (2 * MinuteMillis))
    await vault.lockSoon(30)
    expect(vi.getTimerCount()).to.eq(0)
    expect(await world.readLease()).to.be.null
  })
})

describe("a change to the ways in, once it has landed", () => {
  afterEach(() => { vi.restoreAllMocks() })

  it("resolves though the device mark could not be kept, says so through the logger, and stays unlocked", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    vi.spyOn(world.deviceDB, 'writeMark').mockRejectedValueOnce(new Error('device storage is full'))
    await vault.changePassphrase('pw one', 'pw two')
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(world.logged.map((heard) => [heard.level, heard.story])).to.deep.equal([['warn', { call: 'changePassphrase' }]])
    expect(world.logged[0]?.message).to.include('mark')
    await vault.lock()
    await vault.unlock('pw two')
  })

  it("resolves though this device could not keep its lease, says so through the logger, and asks at the next open", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    vi.spyOn(world.deviceDB, 'writeLease').mockRejectedValueOnce(new Error('device storage is full'))
    const spareId = await vault.addPassphrase('pw one', 'spare pw', { wayinlabel: 'spare' })
    expect(vault.getSnapshot().wayins.map((wayin) => wayin.wayin_id)).to.include(spareId)
    expect(world.logged.map((heard) => [heard.level, heard.story])).to.deep.equal([['warn', { call: 'addPassphrase' }]])
    expect(await world.stateOnOpen()).to.eq('locked')
  })
})

describe("the unlock window, renewed", () => {
  it("by a passphrase change: the user typed a passphrase, and it proved", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    world.advance(24 * HourMillis)
    await vault.changePassphrase('pw one', 'pw two')
    expect(vault.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + SevenDaysMillis)
    expect(await leaseDeadlineOf(world)).to.eq(world.clock.now() + SevenDaysMillis)
  })

  it("by a way in added or removed with a passphrase as proof", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    world.advance(24 * HourMillis)
    const spareId = await vault.addPassphrase('pw one', 'spare pw', { wayinlabel: 'spare' })
    expect(vault.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + SevenDaysMillis)
    world.advance(24 * HourMillis)
    await vault.retireWayin('pw one', spareId)
    expect(vault.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + SevenDaysMillis)
  })

  it("not by a passkey proving a change on an unlocked vault: the deadline standing stays, here and on the device", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    const deadline = vault.getSnapshot().askPassphraseAt
    world.advance(24 * HourMillis)
    await vault.addPassphrase(laptop, 'spare pw', { wayinlabel: 'spare' })
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(vault.getSnapshot().askPassphraseAt).to.eq(deadline)
    expect(await leaseDeadlineOf(world)).to.eq(deadline)
    expect(await world.stateOnOpen()).to.eq('unlocked')
  })

  it("not by a passkey proving a passphrase change on an unlocked vault: the new passphrase lands, the deadline stays", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    const deadline = vault.getSnapshot().askPassphraseAt
    world.advance(24 * HourMillis)
    await vault.changePassphrase(laptop, 'pw renewed')
    expect(vault.getSnapshot().askPassphraseAt).to.eq(deadline)
    expect(await leaseDeadlineOf(world)).to.eq(deadline)
    await vault.lock()
    await vault.unlock('pw renewed')
  })

  it("by a passkey proving a change on a locked vault, which it unlocks as unlock() by passkey would", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    await vault.lock()
    world.advance(24 * HourMillis)
    await vault.addPassphrase(laptop, 'spare pw', { wayinlabel: 'spare' })
    expect(vault.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + SevenDaysMillis)
  })

  it("never by a read, a store, a retirement, or a change pushed from storage", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    const deadline = vault.getSnapshot().askPassphraseAt
    world.advance(HourMillis)
    await vault.storeBox('anthropic', 'sk-fake')
    await vault.readBox('anthropic')
    await vault.retireBox('anthropic')
    const there = await world.openUnlocked('pw one', { deviceDB: memoryDeviceDB() })
    await there.storeBox('openai', 'sk-fake-too')
    await vi.waitFor(() => { expect(boxlabelsOf(vault)).to.deep.equal(['openai']) })
    expect(vault.getSnapshot().askPassphraseAt).to.eq(deadline)
    expect(await leaseDeadlineOf(world)).to.eq(deadline)
  })
})

describe("its timer", () => {
  afterEach(() => { vi.restoreAllMocks() })

  it("lets a Node process exit while it waits: it is unref'd", async () => {
    const timers = vi.spyOn(globalThis, 'setTimeout')
    const world = makeWorld({ clock: undefined })
    const vault = await world.openUnlocked('pw one')
    const [armed] = timers.mock.results.map((result) => result.value as NodeJS.Timeout)
    expect(armed?.hasRef()).to.be.false
    vault.close()
  })
})

describe("a lock in another handle on this device", () => {
  it("makes an unlock under way here fail its record write: the unlock throws 'vault_locked', and no lease is granted", async () => {
    const world = makeRacingWorld()
    const otherTab = await world.openUnlocked('pw one')
    const thisTab = await world.open()
    await thisTab.lock()
    await otherTab.unlock('pw one')
    const gate = world.holdNextDerive()
    const unlocking = TH.expectRefusal(thisTab.unlock('pw one'), 'vault_locked')
    await gate.reached
    await otherTab.lock()
    gate.release()
    await unlocking
    expect(thisTab.getSnapshot().state).to.eq('locked')
    expect(await world.readLease()).to.be.null
    expect(await world.stateOnOpen()).to.eq('locked')
  })

  it("refuses the record of an unlock whose write was already on its way", async () => {
    const world = makeRacingWorld()
    const otherTab = await world.openUnlocked('pw one')
    const thisTab = await world.open()
    const gate = world.holdNextLease()
    const unlocking = TH.expectRefusal(thisTab.unlock('pw one'), 'vault_locked')
    await gate.reached
    await otherTab.lock()
    gate.release()
    await unlocking
    expect(await world.readLease()).to.be.null
  })

  it("makes an unlock under way here, before this device ever locked, lose to a retire() there: the retire keeps the lock generation", async () => {
    const world = makeRacingWorld()
    const otherTab = await world.openUnlocked('pw one')
    await world.deviceDB.eraseLease(TH.scopeOf('u1'))  // so this tab opens locked, with no lock made yet
    const thisTab = await world.open({ vaultDB: world.deafVaultDB() })
    expect(await generationOf(world)).to.eq(0)
    const gate = world.holdNextDerive()
    const unlocking = TH.expectRefusal(thisTab.unlock('pw one'), 'vault_locked')
    await gate.reached
    await otherTab.retire()
    gate.release()
    await unlocking
    expect(thisTab.getSnapshot().state).to.eq('locked')
    expect(await world.readLease()).to.be.null
  })

  it("makes the first unlock of a vault, under way here, lose to a lock there, though no tab had seen the vault to lock", async () => {
    const world = makeRacingWorld()
    const thisTab = await world.open()
    const otherTab = await world.open()
    const gate = world.holdNextDerive()
    const unlocking = TH.expectRefusal(thisTab.unlock('pw one'), 'vault_locked')
    await gate.reached
    await otherTab.lock()
    gate.release()
    await unlocking
    expect(thisTab.getSnapshot().state).to.eq('locked')
    expect(await world.readLease()).to.be.null
    await thisTab.unlock('pw one')  // the vault stands, made under that passphrase
    expect(thisTab.getSnapshot().state).to.eq('unlocked')
  })

  it("leaves an unlock begun after it alone", async () => {
    const world = makeRacingWorld()
    const otherTab = await world.openUnlocked('pw one')
    const thisTab = await world.open()
    await otherTab.lock()
    await thisTab.unlock('pw one')
    expect(thisTab.getSnapshot().state).to.eq('unlocked')
    expect(await world.stateOnOpen()).to.eq('unlocked')
  })
})

/** The lock generation of this world's device mark for `u1`'s vault; undefined with no mark. */
const generationOf = async (world: ReturnType<typeof makeWorld>) => {
  const mark = await world.deviceDB.readMark(TH.scopeOf('u1'))
  return mark?.lock_generation
}

describe("the device mark's lock generation", () => {
  it("rises with lock() and lockSoon(), and not with close(), an unlock or a change to the ways in", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    expect(await generationOf(world)).to.eq(0)
    await vault.changePassphrase('pw one', 'pw two')
    expect(await generationOf(world)).to.eq(0)
    await vault.lock()
    expect(await generationOf(world)).to.eq(1)
    await vault.unlock('pw two')
    await vault.lockSoon(0)
    expect(await generationOf(world)).to.eq(2)
    await vault.unlock('pw two')
    vault.close()
    expect(await generationOf(world)).to.eq(2)
  })

  it("rises when storage says the user is gone and the vault locks", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    vi.spyOn(world.vaultDB, 'readBox').mockRejectedValueOnce(new VaultError('identity_revoked', 'Signed out.'))
    await TH.expectRefusal(vault.readBox('anthropic'), 'identity_revoked')
    expect(await generationOf(world)).to.eq(1)
    vi.restoreAllMocks()
  })

  it("is kept when the vault is made anew under the scope, its mark started afresh", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.lock()
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    await there.retire()
    await there.unlock('pw new')
    await vault.unlock('pw new')
    const mark = await world.deviceDB.readMark(TH.scopeOf('u1'))
    expect(mark?.seen?.vault_id).to.eq(storedVaultPropsOf(world)['vault_id'])
    expect(mark?.lock_generation).to.eq(1)
  })
})

describe("close", () => {
  it("a closed handle refuses everything thereafter", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    vault.close()
    await TH.expectRefusal(vault.readBox('anything'), 'vault_closed')
    await TH.expectRefusal(vault.unlock('pw'), 'vault_closed')
  })

  it("an unlock under way when the handle closes takes nothing up, is granted no lease, and throws 'vault_closed'", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw')
    await vault.lock()
    const gate = world.holdNextDerive()
    const unlocking = TH.expectRefusal(vault.unlock('pw'), 'vault_closed')
    await gate.reached
    vault.close()
    gate.release()
    await unlocking
    expect(await world.readLease()).to.be.null
    expect(await world.stateOnOpen()).to.eq('locked')
  })

  it("a close during the unlock's device record write erases nothing: close is not a lock, and the next open picks the record up", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw')
    await vault.lock()
    const gate = world.holdNextLease()
    const unlocking = TH.expectRefusal(vault.unlock('pw'), 'vault_closed')
    await gate.reached
    vault.close()
    gate.release()
    await unlocking
    expect(await world.readLease()).to.not.be.null
    expect(await world.stateOnOpen()).to.eq('unlocked')
  })

  it("leaves a lease and the device mark as they stood, its lock generation unraised", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const markBefore = await world.deviceDB.readMark(TH.scopeOf('u1'))
    vault.close()
    expect(await world.readLease()).to.not.be.null
    expect(await world.deviceDB.readMark(TH.scopeOf('u1'))).to.deep.equal(markBefore)
  })

  it("a second close does nothing: the storage watch is ended once", async () => {
    const world = makeWorld()
    const unsubscribes = vi.fn()
    const subscribe = world.vaultDB.subscribe.bind(world.vaultDB)
    vi.spyOn(world.vaultDB, 'subscribe').mockImplementation((...args) => {
      const unsubscribe = subscribe(...args)
      return () => { unsubscribes(); unsubscribe() }
    })
    const vault = await world.openUnlocked('pw')
    vault.close()
    vault.close()
    expect(unsubscribes.mock.calls).to.have.lengthOf(1)
    await TH.expectRefusal(vault.readBox('anything'), 'vault_closed')
  })

  it("closing forgets nothing stored: the next open still finds the vault", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake')
    vault.close()
    const again = await world.open()
    expect(again.getSnapshot().state).to.eq('unlocked')
    expect(await again.readBox('anthropic')).to.eq('sk-fake')
  })
})

/** Makes the vault, with a lockbox in it, and closes the handle: what a later open will find. */
const seedVault = async (world: ReturnType<typeof makeWorld>) => {
  const vault = await world.openUnlocked('pw')
  await vault.storeBox('anthropic', 'sk-fake')
  vault.close()
}

// Each arranges for one storage call during the open to fail, and hands back the error it planted
// (or a promise of it, for an arrangement that first seeds the vault).
const FailedOpenCases: readonly (readonly [string, (world: ReturnType<typeof makeWorld>) => unknown])[] = [
  ['storage refuses the first read, as for a user not yet signed in', (world) => {
    const refusal = new VaultError('not_permitted', 'Sign in to reach this vault.')
    vi.spyOn(world.vaultDB, 'readVaultProps').mockRejectedValueOnce(refusal)
    return refusal
  }],
  ['storage cannot be reached for the first read', (world) => {
    const trouble = new VaultError('storage_unavailable', 'The vault storage could not be reached.')
    vi.spyOn(world.vaultDB, 'readVaultProps').mockRejectedValueOnce(trouble)
    return trouble
  }],
  ['storage fails listing the lockboxes, after reading the vault props', async (world) => {
    await seedVault(world)
    const trouble = new VaultError('storage_unavailable', 'The vault storage could not be reached.')
    vi.spyOn(world.vaultDB, 'listBoxes').mockRejectedValueOnce(trouble)
    return trouble
  }],
]

describe("a hello that fails", () => {
  for (const [blurb, arrange] of FailedOpenCases) {
    it(`rejects with the very error, which the snapshot keeps as its trouble, still opening, when ${blurb}`, async () => {
      const world = makeWorld()
      const planted = await arrange(world)
      const vault = Vault.make(world.optsWith())
      let refusal: unknown = null
      try {
        await vault.hello()
      } catch (err) {
        refusal = err
      }
      expect(refusal).to.eq(planted)
      expect(vault.getSnapshot()).to.deep.include({ state: 'opening', syncing: false, trouble: planted, boxes: [], wayins: [] })
    })
  }

  it("says the device's own store failing to read the lease as 'storage_unavailable', its error the cause, settling locked beside that trouble", async () => {
    const world = makeWorld()
    await seedVault(world)
    const trouble = new Error('device storage is unavailable')
    vi.spyOn(world.deviceDB, 'readLease').mockRejectedValueOnce(trouble)
    const vault = Vault.make(world.optsWith())
    const err = await TH.expectRefusal(vault.hello(), 'storage_unavailable')
    expect(err.cause).to.eq(trouble)
    expect(vault.getSnapshot()).to.deep.include({ state: 'locked', trouble: err })
  })

  it("says the device's own store failing to read its mark of the vault as 'storage_unavailable', its error the cause", async () => {
    const world = makeWorld()
    await seedVault(world)
    const trouble = new Error('device storage is unavailable')
    vi.spyOn(world.deviceDB, 'readMark').mockRejectedValueOnce(trouble)
    const err = await TH.expectRefusal(world.open(), 'storage_unavailable')
    expect(err.cause).to.eq(trouble)
  })

  it("says the device's own store failing as 'storage_unavailable' to any call, a lock's among them, even one that throws before its promise", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const trouble = new Error('device storage is unavailable')
    vi.spyOn(world.deviceDB, 'eraseLease').mockImplementationOnce(() => { throw trouble })
    const err = await TH.expectRefusal(vault.lock(), 'storage_unavailable')
    expect(err.cause).to.eq(trouble)
    expect(vault.getSnapshot().state).to.eq('locked')
  })

  const DeviceVerbCases = [
    // what each verb's failure says it was doing:
    ["readLease",    /reading the lease it keeps/,         'reading the lease'],
    ["writeLease",   /writing the lease it keeps/,         'writing the lease'],
    ["eraseLease",   /erasing the lease it keeps/,         'erasing the lease'],
    ["readMark",     /reading its mark of this vault/,     "reading the device's mark"],
    ["writeMark",    /writing its mark of this vault/,     "writing the device's mark"],
    ["eraseMark",    /erasing its mark of this vault/,     "erasing the device's mark"],
    ["eraseAll",     /erasing everything it keeps/,        'erasing everything'],
  ] as const

  for (const [verb, said, blurb] of DeviceVerbCases) {
    it(`says what failed, ${blurb}, as 'storage_unavailable', with what to do and its error the cause`, async () => {
      const deviceDB = memoryDeviceDB()
      const trouble = new Error('device storage is unavailable')
      vi.spyOn(deviceDB, verb).mockRejectedValueOnce(trouble)
      const wrapped = deviceTroubleAsConditions(deviceDB)
      const calling = verb === 'eraseAll' ? wrapped.eraseAll() : (wrapped[verb] as (scope: VaultScope) => Promise<unknown>)(TH.scopeOf('u1'))
      const err = await TH.expectRefusal(calling, 'storage_unavailable')
      expect(err.cause).to.eq(trouble)
      expect(err.message).to.match(said)
      expect(err.message).to.match(/try again/)
      expect(err.message).to.match(/private window/)
      expect(err.message).not.to.include('u1')
    })
  }

  const BlockedNameCases = [
    // what holds until something outside the app changes:
    ["SecurityError",        "storage_blocked",      'storage withheld from the page: site data blocked, a sandboxed frame'],
    ["QuotaExceededError",   "storage_blocked",      'no room: a quota of zero, as some private windows give, or a full disk'],
    ["NotSupportedError",    "storage_blocked",      'no IndexedDB at all'],
    // what may pass:
    ["InvalidStateError",    "storage_unavailable",  'a connection closing under the store'],
    ["UnknownError",         "storage_unavailable",  'a failure the browser gives no reason for'],
    ["AbortError",           "storage_unavailable",  'a transaction aborted'],
  ] as const

  for (const [errName, kind, blurb] of BlockedNameCases) {
    it(`says a device store's ${errName} as '${kind}': ${blurb}`, async () => {
      const deviceDB = memoryDeviceDB()
      const trouble = new DOMException('The browser refused.', errName)
      vi.spyOn(deviceDB, 'writeMark').mockRejectedValueOnce(trouble)
      const err = await TH.expectRefusal(deviceTroubleAsConditions(deviceDB).writeMark(TH.markOf('u1')), kind)
      expect(err.cause).to.eq(trouble)
      expect(err.message).to.match(/writing its mark of this vault/)
      expect(err.message).to.match(kind === 'storage_blocked' ? /will not help until that changes/ : /try again/)
    })
  }

  it("keeps a verb's own way forward in its 'storage_blocked' message: a lease that will not read leaves a passphrase or passkey", async () => {
    const deviceDB = memoryDeviceDB()
    vi.spyOn(deviceDB, 'readLease').mockRejectedValueOnce(new DOMException('The operation is insecure.', 'SecurityError'))
    const err = await TH.expectRefusal(deviceTroubleAsConditions(deviceDB).readLease(TH.scopeOf('u1')), 'storage_blocked')
    expect(err.message).to.match(/reading the lease it keeps/)
    expect(err.message).to.match(/will not help until that changes: unlock with a passphrase or passkey instead\./)
    expect(err.message).to.not.match(/try again/i)
  })

  it("keeps it in its 'storage_unavailable' message too, beside trying again", async () => {
    const deviceDB = memoryDeviceDB()
    vi.spyOn(deviceDB, 'readLease').mockRejectedValueOnce(new Error('device storage is unavailable'))
    const err = await TH.expectRefusal(deviceTroubleAsConditions(deviceDB).readLease(TH.scopeOf('u1')), 'storage_unavailable')
    expect(err.message).to.match(/try again, or unlock with a passphrase or passkey\./)
  })

  it("tells a blocked store by its error's name, so one from another frame, no instance of this one's Error, is told alike", async () => {
    const deviceDB = memoryDeviceDB()
    const trouble = { name: 'SecurityError', message: 'The operation is insecure.' }
    vi.spyOn(deviceDB, 'readLease').mockRejectedValueOnce(trouble)
    const err = await TH.expectRefusal(deviceTroubleAsConditions(deviceDB).readLease(TH.scopeOf('u1')), 'storage_blocked')
    expect(err.cause).to.eq(trouble)
  })

  it("refuses to open as 'storage_blocked' when the browser withholds the device's storage, without a word of retrying", async () => {
    const world = makeWorld()
    await seedVault(world)
    const trouble = new DOMException('The operation is insecure.', 'SecurityError')
    vi.spyOn(world.deviceDB, 'readMark').mockRejectedValue(trouble)
    const err = await TH.expectRefusal(world.open(), 'storage_blocked')
    expect(err.cause).to.eq(trouble)
    expect(err.message).to.not.match(/try again/i)
    expect(err.message).not.to.include('u1')
  })

  it("lets a refusal the device store gives as a VaultError through as it came", async () => {
    const world = makeWorld()
    await seedVault(world)
    const refusal = new VaultError('not_permitted', 'This device may not read its records.')
    vi.spyOn(world.deviceDB, 'readLease').mockRejectedValueOnce(refusal)
    expect(await TH.expectRefusal(world.open(), 'not_permitted')).to.eq(refusal)
  })

  it("says stored vault props that do not parse as damaged_vault, which the snapshot keeps as its trouble", async () => {
    const world = makeWorld()
    world.dbStore.write(u1VaultPropsCkey, '{"format":"safebyok-vault-v3"}')
    const vault = Vault.make(world.optsWith())
    const err = await TH.expectRefusal(vault.hello(), 'damaged_vault')
    expect(vault.getSnapshot().trouble).to.eq(err)
  })

  it("keeps its storage watch, so the vault settles of itself once storage relents and rings", async () => {
    const world = makeWorld()
    const reads = vi.spyOn(world.vaultDB, 'readVaultProps')
    reads.mockRejectedValueOnce(new VaultError('not_permitted', 'Sign in to reach this vault.'))
    const vault = Vault.make(world.optsWith())
    await TH.expectRefusal(vault.hello(), 'not_permitted')
    // Any write rings the store's change bell, and the vault, not yet settled, says hello again.
    world.dbStore.write('elsewhere', '{}')
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot()).to.deep.include({ state: 'absent', syncing: true, trouble: null })
  })

  it("takes up this device's lease once a ring settles the vault, as a hello does", async () => {
    const world = makeWorld()
    await seedVault(world)
    const reads = vi.spyOn(world.vaultDB, 'readVaultProps')
    reads.mockRejectedValueOnce(new VaultError('storage_unavailable', 'The vault storage could not be reached.'))
    const vault = Vault.make(world.optsWith())
    await TH.expectRefusal(vault.hello(), 'storage_unavailable')
    world.dbStore.write('elsewhere', '{}')
    await TH.wakeupAtNextTick()
    // The ring's hello, under way or done, is the one a call shares: no read of its own.
    const readsByRing = reads.mock.calls.length
    await vault.hello()
    expect(reads.mock.calls.length).to.eq(readsByRing)
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("ends its storage watch only when closed: a refused hello leaves the handle for the host to retry or close", async () => {
    const world = makeWorld()
    const tally = TH.tallyWatches(world.vaultDB)
    vi.spyOn(world.vaultDB, 'readVaultProps').mockRejectedValueOnce(new VaultError('not_permitted', 'Sign in to reach this vault.'))
    const vault = Vault.make(world.optsWith())
    await TH.expectRefusal(vault.hello(), 'not_permitted')
    expect(tally).to.deep.equal({ opened: 1, closed: 0 })
    vault.close()
    expect(tally).to.deep.equal({ opened: 1, closed: 1 })
  })

  it("rejects nothing unheard: make's own hello, refused, is the logger's to tell, once, the refusal its error", async () => {
    const world = makeWorld()
    const refusal = new VaultError('not_permitted', 'Sign in to reach this vault.')
    vi.spyOn(world.vaultDB, 'readVaultProps').mockRejectedValueOnce(refusal)
    const vault = Vault.make(world.optsWith())
    await TH.wakeupAtNextTick()
    expect(world.logged).to.have.lengthOf(1)
    expect(world.logged[0]).to.deep.include({ level: 'warn', story: { call: 'hello' }, err: refusal })
    expect(world.logged[0]?.message).to.match(/vault\.hello\(\) to try again/)
    expect(vault.getSnapshot().trouble).to.eq(refusal)
  })

  it("tells the logger nothing of make's hello refused once the handle is closed", async () => {
    const world = makeWorld()
    vi.spyOn(world.vaultDB, 'readVaultProps').mockRejectedValueOnce(new VaultError('not_permitted', 'Sign in to reach this vault.'))
    const vault = Vault.make(world.optsWith())
    vault.close()
    await TH.wakeupAtNextTick()
    expect(world.logged).to.have.lengthOf(0)
  })
})

// The handle a vault keeps between operations must refuse subtle.exportKey; an extractable
// handle may exist only inside an operation about to wrap the vaultKey, dropped on return.
// The closure hides the handle itself, so the suite below watches what each flow asks WebCrypto
// to unwrap: `extractable` is unwrapKey's sixth argument.
const watchUnwraps = () => vi.spyOn(crypto.subtle, 'unwrapKey')
const extractableUnwraps = (spied: ReturnType<typeof watchUnwraps>) => (
  spied.mock.calls.filter((callArgs) => callArgs[5])
)

describe("the session vaultKey is non-extractable", () => {
  it("creating a vault unwraps only the session handle, never an extractable one", async () => {
    const world = makeWorld()
    const vault = await world.open()
    const spied = watchUnwraps()
    await vault.unlock('pw one')
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(spied.mock.calls).to.have.lengthOf(1)
    expect(extractableUnwraps(spied)).to.have.lengthOf(0)
  })

  it("a passphrase unlock asks for exactly one extractable transient, for the device wrap", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.lock()
    const spied = watchUnwraps()
    await vault.unlock('pw one')
    // The non-extractable handle it kept still does the whole job.
    await vault.storeBox('anthropic', 'sk-ant-fake')
    expect(await vault.readBox('anthropic')).to.eq('sk-ant-fake')
    expect(extractableUnwraps(spied)).to.have.lengthOf(1)
  })

  it("a lease never makes an extractable handle at all", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.storeBox('anthropic', 'sk-ant-fake')
    const spied = watchUnwraps()
    const later = await world.open()
    expect(later.getSnapshot().state).to.eq('unlocked')
    expect(await later.readBox('anthropic')).to.eq('sk-ant-fake')
    expect(extractableUnwraps(spied)).to.have.lengthOf(0)
  })

  it("changePassphrase asks for exactly one extractable transient, for the new wraps", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.storeBox('anthropic', 'sk-ant-fake')
    const spied = watchUnwraps()
    await vault.changePassphrase('pw one', 'pw two')
    expect(await vault.readBox('anthropic')).to.eq('sk-ant-fake')
    expect(extractableUnwraps(spied)).to.have.lengthOf(1)
  })
})

// vaultOne's adapter hears no change bells, so it genuinely does not notice vaultTwo's doings
// until it next touches the backend: the stale-device scenario, miniaturized. The reborn vault
// has a new vault_id and its own passphrase.
const rebornWorld = async () => {
  const world = makeWorld()
  const vaultOne = await world.openUnlocked('pw one', { vaultDB: world.deafVaultDB() })
  await vaultOne.storeBox('anthropic', 'sk-ant-fake-old')
  const vaultTwo = await world.open()
  await vaultTwo.retire()
  await vaultTwo.unlock('pw two')
  await vaultTwo.storeBox('anthropic', 'sk-ant-fake-new')
  return { world, vaultOne, vaultTwo }
}

describe("a stale session cannot reach into a vault reborn elsewhere", () => {
  it("storeBox() is refused by storage as stale, and its catch-up finds the device relocked, instead of landing in the reborn vault", async () => {
    const { vaultOne, vaultTwo } = await rebornWorld()
    expect(vaultOne.getSnapshot().state).to.eq('unlocked')
    await TH.expectRefusal(vaultOne.storeBox('anthropic', 'sk-ant-fake-stale'), 'vault_locked')
    expect(vaultOne.getSnapshot().state).to.eq('locked')
    expect(await vaultTwo.readBox('anthropic')).to.eq('sk-ant-fake-new')
  })

  it("readBox() of a box the reborn vault wrote catches up once, finds the vault moved, and refuses as locked, not damaged", async () => {
    const { vaultOne } = await rebornWorld()
    expect(vaultOne.getSnapshot().state).to.eq('unlocked')
    await TH.expectRefusal(vaultOne.readBox('anthropic'), 'vault_locked')
    expect(vaultOne.getSnapshot().state).to.eq('locked')
  })

  it("readBox() of a box that will not open in a vault that has not moved catches up once, and names it damaged", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake')
    const row = storedRowOf(world, 'anthropic')
    const wrapped = row['whisper_ciphered'] as { cipher_iv_b64: string, ciphertext_b64: string }
    world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify({ ...row, whisper_ciphered: { ...wrapped, ciphertext_b64: TH.tweakB64(wrapped.ciphertext_b64) } }))
    await TH.wakeupAtNextTick()
    const readVaultProps = vi.spyOn(world.vaultDB, 'readVaultProps')
    await TH.expectRefusal(vault.readBox('anthropic'), 'damaged_lockbox')
    expect(readVaultProps).toHaveBeenCalledTimes(1)
    expect(vault.getSnapshot().state).to.eq('unlocked')
    vi.restoreAllMocks()
  })

  it("readBox() whose catch-up fails throws the catch-up's own refusal: whether the box is damaged is not known", async () => {
    const world = makeWorld()
    const deafDB = world.deafVaultDB()
    const vault = await world.openUnlocked('pw', { vaultDB: deafDB })
    await vault.storeBox('anthropic', 'sk-fake')
    const row = storedRowOf(world, 'anthropic')
    world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify({ ...row, revision_tok: 'tampered' }))
    const down = new VaultError('storage_unavailable', 'The vault storage could not be reached.')
    vi.spyOn(deafDB, 'readVaultProps').mockRejectedValueOnce(down)
    expect(await TH.expectRefusal(vault.readBox('anthropic'), 'storage_unavailable')).to.eq(down)
    expect(vault.getSnapshot().syncing).to.be.false
    await TH.expectRefusal(vault.readBox('anthropic'), 'damaged_lockbox')
    expect(vault.getSnapshot().syncing).to.be.true
    vi.restoreAllMocks()
  })

  it("storeBox() of a box the reborn vault has never held is refused all the same", async () => {
    const { vaultOne, vaultTwo } = await rebornWorld()
    await TH.expectRefusal(vaultOne.storeBox('openai', 'sk-fake-stale'), 'vault_locked')
    expect(boxlabelsOf(vaultTwo)).to.deep.equal(['anthropic'])
  })

  it("retireBox() is refused by storage as stale, and relocks: the reborn vault keeps its box", async () => {
    const { vaultOne, vaultTwo } = await rebornWorld()
    expect(vaultOne.getSnapshot().state).to.eq('unlocked')
    await TH.expectRefusal(vaultOne.retireBox('anthropic'), 'stale_write')
    expect(vaultOne.getSnapshot().state).to.eq('locked')
    expect(await vaultTwo.readBox('anthropic')).to.eq('sk-ant-fake-new')
  })

  it("retire() is refused by storage as stale: the reborn vault survives, and a second retire() takes it", async () => {
    const { world, vaultOne, vaultTwo } = await rebornWorld()
    await TH.expectRefusal(vaultOne.retire(), 'stale_write')
    expect(await vaultTwo.readBox('anthropic')).to.eq('sk-ant-fake-new')
    expect(vaultOne.getSnapshot().state).to.eq('locked')
    await vaultOne.retire()
    expect(vaultOne.getSnapshot().state).to.eq('absent')
    expect(world.dbStore.ckeys()).to.have.lengthOf(0)
  })

  it("retire() aims at the vault seen when it was called, not one a change bell brings in while it runs", async () => {
    const world = makeWorld()
    let meanwhile: (() => Promise<void>) | null = null
    const slowDeviceDB = {
      ...world.deviceDB,
      eraseLease: async (scope: Parameters<typeof world.deviceDB.eraseLease>[0]) => {
        await world.deviceDB.eraseLease(scope)
        const pending = meanwhile
        meanwhile = null
        if (pending !== null) { await pending() }
      },
    }
    const vaultOne = await world.openUnlocked('pw one', { deviceDB: slowDeviceDB })
    const vaultTwo = await world.open({ deviceDB: memoryDeviceDB() })
    meanwhile = async () => {
      await vaultTwo.retire()
      await vaultTwo.unlock('pw two')
      await vaultTwo.storeBox('anthropic', 'sk-ant-fake-new')
      // Let vaultOne's background refreshes, rung by the writes above, settle on the reborn vault.
      await TH.wakeupAtNextTick()
    }
    await TH.expectRefusal(vaultOne.retire(), 'stale_write')
    expect(await vaultTwo.readBox('anthropic')).to.eq('sk-ant-fake-new')
  })

  it("changePassphrase() proves against the standing vault props, never burying the reborn vault's", async () => {
    const { vaultOne, vaultTwo } = await rebornWorld()
    await TH.expectRefusal(vaultOne.changePassphrase('pw one', 'pw three'), 'wrong_passphrase')
    await vaultTwo.lock()
    await vaultTwo.unlock('pw two')
    expect(await vaultTwo.readBox('anthropic')).to.eq('sk-ant-fake-new')
  })

  it("unlock() syncs first: the reborn vault's own passphrase opens it from the stale handle", async () => {
    const { vaultOne } = await rebornWorld()
    await TH.expectRefusal(vaultOne.storeBox('anthropic', 'sk-ant-fake-stale'), 'vault_locked')
    await vaultOne.unlock('pw two')
    expect(await vaultOne.readBox('anthropic')).to.eq('sk-ant-fake-new')
  })

  it("storeBox() into a vault retired elsewhere, and not remade, is refused and finds it absent", async () => {
    const world = makeWorld()
    const vaultOne = await world.openUnlocked('pw one', { vaultDB: world.deafVaultDB() })
    const vaultTwo = await world.open()
    await vaultTwo.retire()
    await TH.expectRefusal(vaultOne.storeBox('anthropic', 'sk-ant-fake-stale'), 'vault_locked')
    expect(vaultOne.getSnapshot().state).to.eq('absent')
    expect(world.dbStore.ckeys()).to.have.lengthOf(0)
  })

  it("retire() of a vault retired elsewhere, and not remade, is refused as stale; a second retire() is quiet", async () => {
    const world = makeWorld()
    const vaultOne = await world.openUnlocked('pw one', { vaultDB: world.deafVaultDB() })
    const vaultTwo = await world.open()
    await vaultTwo.retire()
    await TH.expectRefusal(vaultOne.retire(), 'stale_write')
    expect(vaultOne.getSnapshot().state).to.eq('absent')
    await vaultOne.retire()
    expect(vaultOne.getSnapshot().state).to.eq('absent')
  })
})

/**
 * A vault unlocked here, over storage that does not ring, with a lockbox `anthropic` in it,
 * retired and made anew through another handle (`there`), which stores its own `anthropic`:
 * this device has not heard.
 */
const rebornUnheard = async () => {
  const world = makeWorld()
  const hereDB = world.deafVaultDB()
  const here = await world.openUnlocked('pw one', { vaultDB: hereDB })
  await here.storeBox('anthropic', 'sk-ant-fake-old')
  const there = await world.open({ deviceDB: memoryDeviceDB() })
  await there.retire()
  await there.unlock('pw two')
  await there.storeBox('anthropic', 'sk-ant-fake-new')
  return { world, hereDB, here, there }
}

/**
 * Two devices on one vault, and a way to slip `there`'s doings between `here`'s look at storage
 * and its write: `beforeNextWrite` runs once, inside the next call to the verb it names, before
 * the write itself reaches storage. `here` has a vaultDB of its own over the shared store, so
 * `hereDB` sees only its writes, whatever `there` does.
 */
const twoDeviceWorld = async () => {
  const world = makeWorld()
  const hereDB = localVaultDB({ store: world.dbStore })
  const here = await world.openUnlocked('shared pw', { vaultDB: hereDB })
  const there = await world.openUnlocked('shared pw', { deviceDB: memoryDeviceDB() })
  const beforeNextWrite = (verb: 'updateBox' | 'updateVaultProps', meanwhile: () => Promise<void>) => {
    TH.beforeNextCall(hereDB, verb, meanwhile)
  }
  return { world, hereDB, here, there, beforeNextWrite }
}

/**
 * Every timer a test sets, recorded: a store refused as stale must throw without waiting, so these
 * stand the clock still, and `waits` records each delay `setTimeout` was asked for.
 */
const stillClock = () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  return vi.spyOn(globalThis, 'setTimeout')
}

/**
 * The waits an operation asked for, in milliseconds: every timer set but those an unlock arms to
 * drop its key, which fall due a minute or more from when they are set.
 */
const delaysAsked = (waits: ReturnType<typeof stillClock>) => (
  waits.mock.calls.map(([, delay = 0]) => delay).filter((delay) => delay < MinuteMillis)
)

describe("versioned updates: two devices writing at once", () => {
  let waits: ReturnType<typeof stillClock>
  beforeEach(() => { waits = stillClock() })
  // Mocks first: restoring the setTimeout spy after the real timers would put the fake one back.
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("a store over a box written meanwhile elsewhere is refused as stale once, without waiting: nothing written, the snapshot caught up, and a second store lands over theirs", async () => {
    const world = makeWorld()
    // Deaf to storage's change bells: only the catch-up after the refusal can bring theirs in.
    const hereDB = world.deafVaultDB()
    const here = await world.openUnlocked('shared pw', { vaultDB: hereDB })
    const there = await world.openUnlocked('shared pw', { deviceDB: memoryDeviceDB() })
    await here.storeBox('anthropic', 'sk-ant-fake-one', { sidecar: { note: 'first' } })
    TH.beforeNextCall(hereDB, 'updateBox', () => there.storeBox('anthropic', 'sk-ant-fake-theirs', { sidecar: { note: 'theirs' } }))
    const updateBox = vi.spyOn(hereDB, 'updateBox')
    const err = await TH.expectRefusal(here.storeBox('anthropic', 'sk-ant-fake-mine'), 'stale_write')
    expect(err.message).to.match(/^That lockbox was written or removed on another device or tab while this one was storing into it, so nothing was written\./)
    expect(err.message).to.include("call storeBox() again")
    // A boxlabel is never quoted: a host's check may admit any text, a mistaken paste among it.
    expect(err.message).to.not.include('anthropic')
    expect(err.cause).to.be.an.instanceOf(VaultError).and.to.have.property('kind', 'stale_write')
    expect(updateBox).toHaveBeenCalledTimes(1)
    expect(delaysAsked(waits)).to.have.lengthOf(0)
    const theirRevision = storedRowOf(world, 'anthropic')['revision_tok']
    const shown = TH.summaryOf(here.getSnapshot().boxes[0])
    expect(shown).to.deep.include({ revision_tok: theirRevision, sidecar: { note: 'theirs' } })
    expect(here.getSnapshot().state).to.eq('unlocked')
    expect(await there.readBox('anthropic')).to.eq('sk-ant-fake-theirs')
    await here.storeBox('anthropic', 'sk-ant-fake-mine')
    expect(updateBox).toHaveBeenCalledTimes(2)
    expect(updateBox.mock.calls[1]?.[2].revision_tok).to.eq(theirRevision)
    expect(await there.readBox('anthropic')).to.eq('sk-ant-fake-mine')
  })

  it("a store over a box retired meanwhile elsewhere is refused as stale like any other: the box stays gone", async () => {
    const { hereDB, here, there, beforeNextWrite } = await twoDeviceWorld()
    await here.storeBox('anthropic', 'sk-ant-fake-one')
    beforeNextWrite('updateBox', () => there.retireBox('anthropic'))
    const updateBox = vi.spyOn(hereDB, 'updateBox')
    await TH.expectRefusal(here.storeBox('anthropic', 'sk-ant-fake-mine'), 'stale_write')
    expect(updateBox).toHaveBeenCalledTimes(1)
    expect(here.getSnapshot().boxes).to.have.lengthOf(0)
    expect(here.getSnapshot().state).to.eq('unlocked')
    await TH.expectRefusal(there.readBox('anthropic'), 'absent_box')
  })

  it("a store of a box that did not exist, and is created meanwhile elsewhere, is refused as stale: theirs stands", async () => {
    const { hereDB, here, there, beforeNextWrite } = await twoDeviceWorld()
    beforeNextWrite('updateBox', () => there.storeBox('anthropic', 'sk-ant-fake-theirs'))
    const updateBox = vi.spyOn(hereDB, 'updateBox')
    await TH.expectRefusal(here.storeBox('anthropic', 'sk-ant-fake-mine'), 'stale_write')
    expect(updateBox).toHaveBeenCalledTimes(1)
    expect(boxlabelsOf(here)).to.deep.equal(['anthropic'])
    expect(await there.readBox('anthropic')).to.eq('sk-ant-fake-theirs')
  })

  it("a store over a damaged box, a sound one written over it meanwhile elsewhere, never retires theirs: its write is refused as stale, and the next store writes over theirs", async () => {
    const { world, hereDB, here, there, beforeNextWrite } = await twoDeviceWorld()
    await here.storeBox('anthropic', 'sk-ant-fake-one')
    world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify({ ...storedRowOf(world, 'anthropic'), written_at: 'later' }))
    await vi.waitFor(() => { expect(here.getSnapshot().boxes[0]?.damaged).to.be.true })
    const theirs = { revisionTok: '' }
    beforeNextWrite('updateBox', async () => {
      await there.storeBox('anthropic', 'sk-ant-fake-theirs')
      theirs.revisionTok = String(storedRowOf(world, 'anthropic')['revision_tok'])
    })
    const retireBox = vi.spyOn(hereDB, 'retireBox')
    const updateBox = vi.spyOn(hereDB, 'updateBox')
    await TH.expectRefusal(here.storeBox('anthropic', 'sk-ant-fake-mine'), 'stale_write')
    expect(retireBox).not.toHaveBeenCalled()
    expect(updateBox).toHaveBeenCalledTimes(1)
    expect(await there.readBox('anthropic')).to.eq('sk-ant-fake-theirs')
    await here.storeBox('anthropic', 'sk-ant-fake-mine')
    expect(updateBox.mock.calls[1]?.[2].revision_tok).to.eq(theirs.revisionTok)
    expect(await there.readBox('anthropic')).to.eq('sk-ant-fake-mine')
  })

  it("a store over a damaged box its listing does not show yet never retires it first: its write over none is refused as stale, and the next store writes over the revision the catch-up lists", async () => {
    const { world, hereDB, here, there } = await twoDeviceWorld()
    await here.storeBox('anthropic', 'sk-ant-fake-one')
    // A listing gone stale: storage holds a damaged record the snapshot does not show.
    const listBoxes = vi.spyOn(hereDB, 'listBoxes').mockResolvedValue([])
    world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify({ ...storedRowOf(world, 'anthropic'), written_at: 'later' }))
    await vi.waitFor(() => { expect(here.getSnapshot().boxes).to.have.lengthOf(0) })
    listBoxes.mockRestore()
    const damagedRevision = storedRowOf(world, 'anthropic')['revision_tok']
    const retireBox = vi.spyOn(hereDB, 'retireBox')
    const updateBox = vi.spyOn(hereDB, 'updateBox')
    await TH.expectRefusal(here.storeBox('anthropic', 'sk-ant-fake-mine'), 'stale_write')
    expect(updateBox).toHaveBeenCalledTimes(1)
    expect(updateBox.mock.calls[0]?.[2].revision_tok).to.be.null
    expect(here.getSnapshot().boxes[0]).to.deep.include({ damaged: true, revision_tok: damagedRevision })
    await here.storeBox('anthropic', 'sk-ant-fake-mine')
    expect(retireBox).not.toHaveBeenCalled()
    expect(updateBox.mock.calls[1]?.[2].revision_tok).to.eq(damagedRevision)
    expect(await there.readBox('anthropic')).to.eq('sk-ant-fake-mine')
  })

  it("a store refused as stale whose catch-up finds the passphrase changed elsewhere relocks the device, and writes nothing", async () => {
    const { hereDB, here, there, beforeNextWrite } = await twoDeviceWorld()
    await here.storeBox('anthropic', 'sk-ant-fake-one')
    beforeNextWrite('updateBox', async () => {
      await there.storeBox('anthropic', 'sk-ant-fake-theirs')
      await there.changePassphrase('shared pw', 'their pw')
    })
    const updateBox = vi.spyOn(hereDB, 'updateBox')
    await TH.expectRefusal(here.storeBox('anthropic', 'sk-ant-fake-mine'), 'vault_locked')
    expect(updateBox).toHaveBeenCalledTimes(1)
    expect(delaysAsked(waits)).to.have.lengthOf(0)
    expect(here.getSnapshot().state).to.eq('locked')
    await there.lock()
    await there.unlock('their pw')
    expect(await there.readBox('anthropic')).to.eq('sk-ant-fake-theirs')
  })

  it("a store whose catch-up fails is refused as stale, the failure its cause, saying so", async () => {
    const { world, hereDB, here, there, beforeNextWrite } = await twoDeviceWorld()
    await here.storeBox('anthropic', 'sk-ant-fake-one')
    const down = new VaultError('storage_unavailable', 'The vault storage could not be reached.')
    beforeNextWrite('updateBox', async () => {
      await there.storeBox('anthropic', 'sk-ant-fake-theirs')
      vi.spyOn(hereDB, 'readVaultProps').mockRejectedValue(down)
    })
    const updateBox = vi.spyOn(hereDB, 'updateBox')
    const err = await TH.expectRefusal(here.storeBox('anthropic', 'sk-ant-fake-mine'), 'stale_write')
    expect(err.cause).to.eq(down)
    expect(err.message).to.include('Catching up with storage afterwards failed too')
    expect(updateBox).toHaveBeenCalledTimes(1)
    expect(delaysAsked(waits)).to.have.lengthOf(0)
    expect(here.getSnapshot().syncing).to.be.false
    const told = world.logged.find((heard) => heard.story?.['call'] === 'storeBox')
    expect(told).to.deep.include({ level: 'warn', err: down })
    expect(told?.message).to.match(/catch-up with storage, after a write it refused as stale, failed/)
  })

  // A catch-up refusal that asks the caller for something else than a stale write passes as it came.
  const CatchUpRefusals = [
    [new VaultError('identity_revoked', 'Signed out.'), "locked",   'the user signed out: the vault locks, and the user signs in again'],
    [new VaultError('rolled_back', 'An older copy.'),   "locked",   'storage handed back an older copy: the vault locks, and storage wants looking at'],
    [new VaultError('newer_format', 'A newer build.'),  "unlocked", 'a newer build wrote the vault: the app wants updating'],
  ] as const

  for (const [refusal, state, blurb] of CatchUpRefusals) {
    it(`a store whose catch-up is refused as ${refusal.kind} throws that refusal as it came, never as stale: ${blurb}`, async () => {
      const { hereDB, here, there, beforeNextWrite } = await twoDeviceWorld()
      await here.storeBox('anthropic', 'sk-ant-fake-one')
      beforeNextWrite('updateBox', async () => {
        await there.storeBox('anthropic', 'sk-ant-fake-theirs')
        vi.spyOn(hereDB, 'readVaultProps').mockRejectedValue(refusal)
      })
      const updateBox = vi.spyOn(hereDB, 'updateBox')
      const err = await TH.expectRefusal(here.storeBox('anthropic', 'sk-ant-fake-mine'), refusal.kind)
      expect(err).to.eq(refusal)
      expect(updateBox).toHaveBeenCalledTimes(1)
      expect(delaysAsked(waits)).to.have.lengthOf(0)
      expect(here.getSnapshot()).to.include({ state, syncing: false })
    })

    it(`a retirement whose catch-up is refused as ${refusal.kind} throws that refusal as it came, never as stale`, async () => {
      const { hereDB, here } = await rebornUnheard()
      vi.spyOn(hereDB, 'readVaultProps').mockRejectedValue(refusal)
      const err = await TH.expectRefusal(here.retireBox('anthropic'), refusal.kind)
      expect(err).to.eq(refusal)
    })
  }

  it("a retirement refused as stale is thrown at once, never tried again, saying the lockbox could not be removed because its vault is gone", async () => {
    const { hereDB, here, there } = await rebornUnheard()
    const retireBox = vi.spyOn(hereDB, 'retireBox')
    const err = await TH.expectRefusal(here.retireBox('anthropic'), 'stale_write')
    expect(err.message).to.match(/^That lockbox could not be removed, because the vault it was in is gone/)
    // A boxlabel is never quoted: a host's check may admit any text, a mistaken paste among it.
    expect(err.message).to.not.include('anthropic')
    expect(err.cause).to.be.an.instanceOf(VaultError).and.to.have.property('kind', 'stale_write')
    expect(retireBox).toHaveBeenCalledTimes(1)
    expect(here.getSnapshot().state).to.eq('locked')
    expect(await there.readBox('anthropic')).to.eq('sk-ant-fake-new')
  })

  it("a retirement in a vault deleted elsewhere, and not made anew, finds no lockbox to retire", async () => {
    const world = makeWorld()
    const here = await world.openUnlocked('pw one', { vaultDB: world.deafVaultDB() })
    await here.storeBox('anthropic', 'sk-ant-fake-old')
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    await there.retire()
    await TH.expectRefusal(here.retireBox('anthropic'), 'absent_box')
  })

  it("a retirement whose catch-up fails says so, the failure its cause, rather than that the vault is gone", async () => {
    const { hereDB, here } = await rebornUnheard()
    const down = new VaultError('storage_unavailable', 'The vault storage could not be reached.')
    vi.spyOn(hereDB, 'readVaultProps').mockRejectedValue(down)
    const err = await TH.expectRefusal(here.retireBox('anthropic'), 'stale_write')
    expect(err.cause).to.eq(down)
    expect(err.message).to.include('Catching up with storage afterwards failed too')
    expect(err.message).to.not.match(/vault it was in is gone/)
  })

  it("a passphrase change racing another device's is refused as stale; theirs stands", async () => {
    const { here, there, beforeNextWrite } = await twoDeviceWorld()
    await here.storeBox('anthropic', 'sk-ant-fake-one')
    beforeNextWrite('updateVaultProps', () => there.changePassphrase('shared pw', 'their pw'))
    await TH.expectRefusal(here.changePassphrase('shared pw', 'my pw'), 'stale_write')
    expect(here.getSnapshot().state).to.eq('locked')
    await TH.expectRefusal(here.unlock('my pw'), 'wrong_passphrase')
    await here.unlock('their pw')
    expect(await here.readBox('anthropic')).to.eq('sk-ant-fake-one')
  })

  it("a lockSoon() landing with the refusal leaves the store refused as stale, not as locked: work in hand ends as it would have", async () => {
    const { here, there, beforeNextWrite } = await twoDeviceWorld()
    await here.storeBox('anthropic', 'sk-ant-fake-one')
    beforeNextWrite('updateBox', async () => {
      await there.storeBox('anthropic', 'sk-ant-fake-theirs')
      await here.lockSoon(30)
    })
    await TH.expectRefusal(here.storeBox('anthropic', 'sk-ant-fake-mine'), 'stale_write')
    expect(here.getSnapshot().state).to.eq('locked')
    expect(await there.readBox('anthropic')).to.eq('sk-ant-fake-theirs')
  })
})

describe("refreshes, one at a time", () => {
  it("runs refreshes asked for at once one after the other, every request made meanwhile sharing one more", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const readVaultProps = world.vaultDB.readVaultProps.bind(world.vaultDB)
    const tally = { inFlight: 0, most: 0 }
    const reads = vi.spyOn(world.vaultDB, 'readVaultProps').mockImplementation(async (...args) => {
      tally.inFlight += 1
      tally.most = Math.max(tally.most, tally.inFlight)
      try {
        await TH.wakeupAtNextTick()
        return await readVaultProps(...args)
      } finally {
        tally.inFlight -= 1
      }
    })
    // Each write rings the storage watch, which asks for a refresh.
    for (const ii of [1, 2, 3]) { world.dbStore.write('elsewhere', String(ii)) }
    await vi.waitFor(() => { expect(reads).toHaveBeenCalledTimes(2) })
    await vi.waitFor(() => { expect(tally.inFlight).to.eq(0) })
    await TH.wakeupAtNextTick()
    expect(reads).toHaveBeenCalledTimes(2)
    expect(tally.most).to.eq(1)
    vi.restoreAllMocks()
    vault.close()
  })

  it("says syncing: false while the storage watch cannot read, warns once for the streak, and says once when a read succeeds", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    expect(vault.getSnapshot().syncing).to.be.true
    const sound = world.dbStore.read(u1VaultPropsCkey) ?? ''
    world.dbStore.write(u1VaultPropsCkey, '{"format":"safebyok-vault-v3"}')
    await TH.wakeupAtNextTick()
    for (const ii of [1, 2]) {
      world.dbStore.write('elsewhere', String(ii))
      await TH.wakeupAtNextTick()
    }
    expect(vault.getSnapshot().syncing).to.be.false
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(world.logged.map((heard) => [heard.level, heard.story])).to.deep.equal([['warn', { call: 'refresh' }]])
    world.dbStore.write(u1VaultPropsCkey, sound)
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot().syncing).to.be.true
    expect(world.logged.map((heard) => heard.level)).to.deep.equal(['warn', 'log'])
    expect(world.logged[1]?.message).to.match(/reads again/)
  })
})

const drainDown = (): never => { throw new Error('the log drain is down') }
/** A logger whose every call throws, as a broken log drain might. */
const throwingLogger = () => ({ log: drainDown, warn: drainDown, error: drainDown })

/** Every ciphertext, salt and wrapped key the backend holds, as base64url text. */
const storedSecrets = (world: ReturnType<typeof makeWorld>): string[] => {
  const everything = world.dbStore.ckeys().map((ckey) => world.dbStore.read(ckey) ?? '').join('\n')
  return Array.from(everything.matchAll(/"(?:ciphertext_b64|salt_b64)":"([^"]+)"/g), (hit) => hit[1]!)
}

/** A logger's every call, for a logger that fails: what it throws must break nothing. */
const throwFromLogger = () => { throw new Error('a logger that throws') }

describe("the logger", () => {
  it("hears nothing from a vault going about its business", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake', { sidecar: { note: 'work account' } })
    await vault.readBox('anthropic')
    await vault.changePassphrase('pw', 'pw two')
    await vault.lockSoon(0.01)
    await vault.unlock('pw two')
    await vault.retireBox('anthropic')
    await vault.lock()
    world.advance(SevenDaysMillis * 2)
    await world.open()
    await vault.retire()
    vault.close()
    expect(world.logged).to.have.lengthOf(0)
  })

  it("is the console when the host passes none, each message tagged safebyok", async () => {
    const world = makeWorld()
    let reading = world.clock.now()
    const vault = await world.openUnlocked('pw', { logger: undefined, clock: { now: () => reading } })
    reading = NaN
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => { /* kept out of the test output */ })
    try {
      await vault.lockSoon()
      expect(warn).toHaveBeenCalledOnce()
      expect(String(warn.mock.calls[0]?.[0])).to.match(/^safebyok: lockSoon\(\) could not read the clock/)
    } finally {
      warn.mockRestore()
    }
  })

  it("is not the vaultDB's: what its storage has nobody to throw to goes to the logger the storage was made with", async () => {
    const world = makeWorld()
    const own = TH.spyLogger()
    const vaultDB = localVaultDB({ store: world.dbStore, logger: own.logger })
    await world.open({ vaultDB })
    vaultDB.subscribe(TH.scopeOf('u1'), () => { throw new Error('a listener of the host that throws') })
    await vaultDB.fetchOrCreateVaultProps(TH.vaultPropsOf('u1'))
    expect(own.calls).to.have.lengthOf(1)
    expect(world.logged).to.have.lengthOf(0)
  })

  it("is not the vaultDB's when the vaultDB was made with none: that one logs to the console, whatever the vault is given", async () => {
    const world = makeWorld()
    const consoleErrors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const vaultDB = localVaultDB({ store: world.dbStore })
    await world.open({ vaultDB })
    vaultDB.subscribe(TH.scopeOf('u1'), () => { throw new Error('a listener of the host that throws') })
    await vaultDB.fetchOrCreateVaultProps(TH.vaultPropsOf('u1'))
    expect(consoleErrors).toHaveBeenCalledOnce()
    expect(world.logged).to.have.lengthOf(0)
    consoleErrors.mockRestore()
  })

  it("is the vaultDB's logger when the host passes the vault none: one given to the storage once hears both", async () => {
    const world = makeWorld()
    const own = TH.spyLogger()
    const vaultDB = localVaultDB({ store: world.dbStore, logger: own.logger })
    let reading = world.clock.now()
    const vault = await world.openUnlocked('pw', { vaultDB, logger: undefined, clock: { now: () => reading } })
    reading = world.clock.now() / 1000
    await vault.lockSoon()
    expect(own.calls.map((call) => [call.level, call.story])).to.deep.equal([['warn', { call: 'lockSoon' }]])
    expect(world.logged).to.have.lengthOf(0)
  })

  it("guards the vaultDB's logger too: a VaultDB of the host's own whose logger throws breaks no lock", async () => {
    const world = makeWorld()
    const vaultDB = localVaultDB({ store: world.dbStore })
    // As a subclass overriding the getter would: its logger is the host's to answer.
    Object.defineProperty(vaultDB, 'logger', { value: { log: throwFromLogger, warn: throwFromLogger, error: throwFromLogger } })
    let reading = world.clock.now()
    const vault = await world.openUnlocked('pw', { vaultDB, logger: undefined, clock: { now: () => reading } })
    reading = world.clock.now() / 1000
    await vault.lockSoon()
    expect(vault.getSnapshot().state).to.eq('locked')
  })

  it("refuses a vaultDB whose logger is not one, before reading storage, when the host passes the vault none", async () => {
    const world = makeWorld()
    const vaultDB = localVaultDB({ store: world.dbStore })
    const readVaultProps = vi.spyOn(vaultDB, 'readVaultProps')
    Object.defineProperty(vaultDB, 'logger', { value: { log: () => undefined } })
    const err = await TH.expectRefusal(world.open({ vaultDB, logger: undefined }), 'bad_option')
    expect(err.message).to.match(/log, warn and error functions/)
    expect(readVaultProps).not.toHaveBeenCalled()
  })

  it("takes null as none: the vaultDB's logger", async () => {
    const world = makeWorld()
    const own = TH.spyLogger()
    const vaultDB = localVaultDB({ store: world.dbStore, logger: own.logger })
    let reading = world.clock.now()
    const vault = await world.openUnlocked('pw', { vaultDB, logger: null, clock: { now: () => reading } })
    reading = world.clock.now() / 1000
    await vault.lockSoon()
    expect(own.calls.map((call) => call.story)).to.deep.equal([{ call: 'lockSoon' }])
  })

  it("is the default logger, whatever the vaultDB was made with, when the host passes DefaultLogger, as its example shows", async () => {
    const world = makeWorld()
    const own = TH.spyLogger()
    const telemetry = TH.spyLogger()
    setDefaultLogger(telemetry.logger)
    try {
      const vaultDB = localVaultDB({ store: world.dbStore, logger: own.logger })
      let reading = world.clock.now()
      const vault = await world.openUnlocked('pw', { vaultDB, logger: DefaultLogger, clock: { now: () => reading } })
      reading = world.clock.now() / 1000
      await vault.lockSoon()
      expect(telemetry.calls.map((call) => call.story)).to.deep.equal([{ call: 'lockSoon' }])
      expect(own.calls).to.have.lengthOf(0)
    } finally {
      setDefaultLogger(undefined)
    }
  })

  it("is the app's default, set once, when neither the host nor the vaultDB's factory was given one", async () => {
    const world = makeWorld()
    const telemetry = TH.spyLogger()
    setDefaultLogger(telemetry.logger)
    try {
      const vaultDB = localVaultDB({ store: world.dbStore })
      let reading = world.clock.now()
      const vault = await world.openUnlocked('pw', { vaultDB, logger: undefined, clock: { now: () => reading } })
      reading = world.clock.now() / 1000
      await vault.lockSoon()
      expect(telemetry.calls.map((call) => call.story)).to.deep.equal([{ call: 'lockSoon' }])
    } finally {
      setDefaultLogger(undefined)
    }
  })

  it("is the host's own for the vault, when it passes one, whatever the vaultDB was made with", async () => {
    const world = makeWorld()
    const own = TH.spyLogger()
    const vaultDB = localVaultDB({ store: world.dbStore, logger: own.logger })
    let reading = world.clock.now()
    const vault = await world.openUnlocked('pw', { vaultDB, clock: { now: () => reading } })
    reading = world.clock.now() / 1000
    await vault.lockSoon()
    expect(world.logged).to.have.lengthOf(1)
    expect(own.calls).to.have.lengthOf(0)
  })

  it("refuses a logger that is not one, before reading storage", async () => {
    const world = makeWorld()
    const readVaultProps = vi.spyOn(world.vaultDB, 'readVaultProps')
    for (const nonsense of [{}, { log: () => undefined, warn: () => undefined }, 'console']) {
      const err = await TH.expectRefusal(world.open({ logger: nonsense as unknown as MakeVaultOpts['logger'] }), 'bad_option')
      expect(err.message).to.match(/log, warn and error functions/)
    }
    expect(readVaultProps).not.toHaveBeenCalled()
  })

  it("warns when lockSoon() locks at once on a clock gone wrong, the clock's refusal its error", async () => {
    const world = makeWorld()
    let reading = world.clock.now()
    const vault = await world.openUnlocked('pw', { clock: { now: () => reading } })
    reading = world.clock.now() / 1000
    await vault.lockSoon()
    expect(world.logged).to.have.lengthOf(1)
    const [heard] = world.logged
    expect(heard?.level).to.eq('warn')
    expect(heard?.story).to.deep.equal({ call: 'lockSoon' })
    expect(heard?.err).to.be.instanceOf(VaultError)
    expect((heard?.err as VaultError).kind).to.eq('bad_option')
  })

  it("warns once when a lease could not be read, telling nothing of the record", async () => {
    const world = makeWorld()
    const device = uncheckingDeviceDB()
    await world.openUnlocked('pw', { deviceDB: device.deviceDB })
    device.spoilRow((row) => ({ ...row, ask_passphrase_at: 'soon' }))
    expect(await world.stateOnOpen({ deviceDB: device.deviceDB })).to.eq('locked')
    expect(world.logged).to.have.lengthOf(1)
    expect(world.logged[0]).to.deep.include({ level: 'warn', story: { call: 'hello' }, err: undefined })
    expect(world.logged[0]?.message).to.match(/lease could not be read/)
  })

  it("warns when a lease would not open", async () => {
    const world = makeWorld()
    const device = uncheckingDeviceDB()
    await world.openUnlocked('pw', { deviceDB: device.deviceDB })
    device.spoilRow((row) => {
      const wrapped = row['vault_key_lease_wrapped'] as { cipher_iv_b64: string, ciphertext_b64: string }
      return { ...row, vault_key_lease_wrapped: { ...wrapped, ciphertext_b64: TH.tweakB64(wrapped.ciphertext_b64) } }
    })
    expect(await world.stateOnOpen({ deviceDB: device.deviceDB })).to.eq('locked')
    expect(world.logged.map((heard) => heard.level)).to.deep.equal(['warn'])
  })

  it("says nothing of an unreadable lease that could not be erased: hello rejects instead, and says only that", async () => {
    const world = makeWorld()
    const device = uncheckingDeviceDB()
    await world.openUnlocked('pw', { deviceDB: device.deviceDB })
    device.spoilRow((row) => ({ ...row, ask_passphrase_at: 'soon' }))
    const jammed = new Error('the device store is closed')
    vi.spyOn(device.deviceDB, 'eraseLease').mockRejectedValueOnce(jammed)
    const err = await TH.expectRefusal(world.open({ deviceDB: device.deviceDB }), 'storage_unavailable')
    expect(err.cause).to.eq(jammed)
    expect(world.logged.map((heard) => [heard.level, heard.story, heard.err])).to.deep.equal([['warn', { call: 'hello' }, err]])
  })

  it("says nothing of a lease that simply ran out, or that a new passphrase outdated", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    world.advance(SevenDaysMillis + 1)
    expect(await world.stateOnOpen()).to.eq('locked')
    await vault.unlock('pw')
    const elsewhere = await world.open({ deviceDB: memoryDeviceDB() })
    await elsewhere.changePassphrase('pw', 'pw two')
    expect(await world.stateOnOpen()).to.eq('locked')
    expect(world.logged).to.have.lengthOf(0)
  })

  it("warns when a background refresh fails, with the refusal as its error", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake')
    world.dbStore.write(u1VaultPropsCkey, '{"format":"safebyok-vault-v3"}')
    await TH.wakeupAtNextTick()
    expect(world.logged.map((heard) => heard.level)).to.deep.equal(['warn'])
    expect(world.logged[0]?.story).to.deep.equal({ call: 'refresh' })
    expect((world.logged[0]?.err as VaultError).kind).to.eq('damaged_vault')
    expect(vault.getSnapshot().boxes).to.have.lengthOf(1)  // the snapshot stands as it was
  })

  it("never breaks a lock, a hello, a refresh or a refused hello when it throws", async () => {
    const world = makeWorld()
    const logger = throwingLogger()
    const device = uncheckingDeviceDB()
    let reading = world.clock.now()
    const clock = { now: () => reading }
    const vault = await world.openUnlocked('pw', { logger, deviceDB: device.deviceDB, clock })
    await vault.storeBox('anthropic', 'sk-fake')
    // a refresh rung in the background, failing
    const row = world.dbStore.read(u1BoxCkey('anthropic')) ?? ''
    world.dbStore.write(u1BoxCkey('anthropic'), '{"not":"a lockbox"}')
    await TH.wakeupAtNextTick()
    world.dbStore.write(u1BoxCkey('anthropic'), row)
    // a lock that cannot time its grace
    reading = NaN
    await vault.lockSoon()
    expect(vault.getSnapshot().state).to.eq('locked')
    reading = world.clock.now()
    // an open that revokes an unreadable lease
    await vault.unlock('pw')
    device.spoilRow(() => 'not a record')
    expect(await world.stateOnOpen({ logger, deviceDB: device.deviceDB, clock })).to.eq('locked')
    // a hello refused, which make's own hello tells the logger of
    vi.spyOn(world.vaultDB, 'readVaultProps').mockRejectedValueOnce(new VaultError('not_permitted', 'Sign in to reach this vault.'))
    await TH.expectRefusal(world.open({ logger }), 'not_permitted')
  })

  it("is never handed a whisper, a passphrase, a ciphertext or a salt, whatever it hears", async () => {
    const world = makeWorld()
    const device = uncheckingDeviceDB()
    const whisper = 'sk-FAKESECRET-whisper'
    const passphrase = 'FAKESECRET passphrase'
    const reading = world.clock.now()
    let clockBroken = false
    const clock = { now: () => { if (clockBroken) { throw new Error('the host clock broke: battery flat') } return reading } }
    const vault = await world.openUnlocked(passphrase, { deviceDB: device.deviceDB, clock })
    await vault.storeBox('anthropic', whisper, { sidecar: { note: 'FAKESECRET note' } })
    await vault.changePassphrase(passphrase, `${passphrase} two`)
    const secrets = storedSecrets(world)
    // every call site: a lease unreadable, a background refresh refused, a lock
    // without its grace (its error carrying the host clock's as its cause), a hello refused
    device.spoilRow((row) => ({ ...row, ask_passphrase_at: `${passphrase} ${whisper}` }))
    const reopened = await world.open({ deviceDB: device.deviceDB, clock })
    reopened.close()
    world.dbStore.write(u1VaultPropsCkey, JSON.stringify({ ...storedVaultPropsOf(world), registered_at: whisper }))
    await TH.wakeupAtNextTick()
    clockBroken = true
    await vault.lockSoon()
    clockBroken = false
    vi.spyOn(world.vaultDB, 'readVaultProps').mockRejectedValueOnce(new VaultError('not_permitted', 'Sign in to reach this vault.'))
    await TH.expectRefusal(world.open(), 'not_permitted')
    expect(world.logged.map((heard) => heard.level)).to.deep.equal(['warn', 'warn', 'warn', 'warn'])
    expect((world.logged[2]?.err?.cause as Error).message).to.match(/battery flat/)
    const text = TH.loggedText(world.logged)
    // the walk reached the cause, so its search covers what causes hold
    expect(text).to.include('battery flat')
    expect(text.toLowerCase()).to.not.include('fakesecret')
    expect(secrets.length).to.be.greaterThan(2)
    for (const secret of secrets) { expect(text).to.not.include(secret) }
  })
})

/** A refusal of kind identity_revoked, as an adapter says a user signed out. */
const signedOut = () => new VaultError('identity_revoked', 'No one is signed in, so this vault cannot be reached: sign in, then try again.')

describe("when storage says the user is no longer signed in", () => {
  /** Each vault call that reaches storage, the storage verb it reaches, and the call. */
  const RevokedCallCases: readonly (readonly [string, 'readVaultProps' | 'readBox' | 'updateBox' | 'updateVaultProps', (vault: Vault) => Promise<unknown>])[] = [
    ['readBox()',          'readBox',          (vault) => vault.readBox('anthropic')],
    ['storeBox()',         'updateBox',        (vault) => vault.storeBox('openai', 'sk-fake-two')],
    ['unlock()',           'readVaultProps',   (vault) => vault.unlock('pw one')],
    ['changePassphrase()', 'updateVaultProps', (vault) => vault.changePassphrase('pw one', 'pw two')],
  ]

  for (const [callTitle, verb, call] of RevokedCallCases) {
    it(`locks at once when ${callTitle} meets it, throws the refusal itself, and removes nothing stored`, async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw one')
      await vault.storeBox('anthropic', 'sk-fake-one')
      const refusal = signedOut()
      vi.spyOn(world.vaultDB, verb).mockRejectedValueOnce(refusal)
      expect(await TH.expectRefusal(call(vault), 'identity_revoked')).to.eq(refusal)
      expect(vault.getSnapshot().state).to.eq('locked')
      expect(vault.getSnapshot().askPassphraseAt).to.be.null
      expect(await world.readLease()).to.be.null
      await TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
      // Signed in again: the passphrase it had still opens it, and the lockbox is still there.
      await vault.unlock('pw one')
      expect(await vault.readBox('anthropic')).to.eq('sk-fake-one')
    })
  }

  it("locks when a background refresh meets it, and tells the logger, having nobody to throw to", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    vi.spyOn(world.vaultDB, 'readVaultProps').mockRejectedValue(signedOut())
    // Any write rings the store's change bell, and the vault looks.
    world.dbStore.write('elsewhere', '{}')
    await vi.waitFor(() => { expect(vault.getSnapshot().state).to.eq('locked') })
    expect(await world.readLease()).to.be.null
    await vi.waitFor(() => { expect(world.logged.map((heard) => heard.level)).to.deep.equal(['log', 'warn']) })
    expect(world.logged[0]).to.deep.include({ level: 'log', story: { call: 'untrustedStorage' } })
    expect(world.logged[0]?.message).to.match(/no longer serves the user/)
  })

  it("calls subscribers with the locked snapshot", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    const heard: string[] = []
    vault.subscribe(() => { heard.push(vault.getSnapshot().state) })
    vi.spyOn(world.vaultDB, 'readBox').mockRejectedValueOnce(signedOut())
    await TH.expectRefusal(vault.readBox('anthropic'), 'identity_revoked')
    expect(heard).to.deep.equal(['locked'])
  })

  it("wins over an unlock under way, as lock() does: it throws 'vault_locked' and grants no lease", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.lock()
    const gate = world.holdNextDerive()
    const unlocking = TH.expectRefusal(vault.unlock('pw one'), 'vault_locked')
    await gate.reached
    vi.spyOn(world.vaultDB, 'readVaultProps').mockRejectedValueOnce(signedOut())
    world.dbStore.write('elsewhere', '{}')
    await vi.waitFor(() => { expect(world.logged.map((heard) => heard.level)).to.include('warn') })
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.readLease()).to.be.null
  })

  it("revokes the lease when it meets the open, which then refuses", async () => {
    const world = makeWorld()
    const first = await world.openUnlocked('pw one')
    first.close()
    expect(await world.readLease()).to.not.be.null
    vi.spyOn(world.vaultDB, 'readVaultProps').mockRejectedValueOnce(signedOut())
    await TH.expectRefusal(world.open(), 'identity_revoked')
    expect(await world.readLease()).to.be.null
    expect(await world.stateOnOpen()).to.eq('locked')
  })

  it("wins over the lease an open is taking up, when a background refresh meets it meanwhile", async () => {
    const world = makeWorld()
    const first = await world.openUnlocked('pw one')
    first.close()
    const readLease = world.deviceDB.readLease.bind(world.deviceDB)
    vi.spyOn(world.deviceDB, 'readLease').mockImplementationOnce(async (scope) => {
      const kept = await readLease(scope)
      // The open's own read is past; the next, a background refresh's, meets the sign-out.
      vi.spyOn(world.vaultDB, 'readVaultProps').mockRejectedValueOnce(signedOut())
      world.dbStore.write('elsewhere', '{}')
      await vi.waitFor(async () => { expect(await readLease(scope)).to.be.null })
      return kept
    })
    const vault = await world.open()
    expect(vault.getSnapshot().state).to.eq('locked')
    await TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
  })

  it("takes no option to stay unlocked: Vault.make refuses one, as it refuses any option it does not know", () => {
    const world = makeWorld()
    const err = TH.expectSyncRefusal(() => Vault.make(world.optsWith({ whenIdentityRevoked: 'stay' } as Partial<MakeVaultOpts>)), 'bad_option')
    expect(err.message).to.include('whenIdentityRevoked')
  })

  it("locks nothing for not_permitted: the vault's own user, refused one call", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    vi.spyOn(world.vaultDB, 'readBox').mockRejectedValueOnce(new VaultError('not_permitted', 'You may not read this vault.'))
    await TH.expectRefusal(vault.readBox('anthropic'), 'not_permitted')
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(await world.readLease()).to.not.be.null
  })

  it("locks all the same, and throws the refusal, when the device store will not erase the lease", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    const stuck = new Error('the device store is read-only')
    vi.spyOn(world.deviceDB, 'eraseLease').mockRejectedValueOnce(stuck)
    vi.spyOn(world.vaultDB, 'readBox').mockRejectedValueOnce(signedOut())
    await TH.expectRefusal(vault.readBox('anthropic'), 'identity_revoked')
    expect(vault.getSnapshot().state).to.eq('locked')
    // The next call says hello afresh, but this handle takes up no lease the lock could not
    // revoke: that is left for the next page load.
    await TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
    expect(await world.readLease()).to.not.be.null
    expect(world.logged[0]).to.deep.include({ level: 'warn', story: { call: 'untrustedStorage' } })
    expect((world.logged[0]?.err as VaultError).kind).to.eq('storage_unavailable')
    expect(world.logged[0]?.err?.cause).to.eq(stuck)
  })
})

/** This device's mark for `u1`'s vault, as its deviceDB keeps it. */
const markIn = (world: ReturnType<typeof makeWorld>) => world.deviceDB.readMark(TH.scopeOf('u1'))

/** What this world's device mark for `u1`'s vault has seen of it; null with no mark, or none seen. */
const seenIn = async (world: ReturnType<typeof makeWorld>) => {
  const mark = await markIn(world)
  return mark?.seen ?? null
}

/** The stored vault props' ways in, as the backend holds them. */
const storedWayinsOf = (world: ReturnType<typeof makeWorld>) => storedVaultPropsOf(world)['wayins'] as Record<string, unknown>[]

describe("the device mark", () => {
  it("is kept from the vault's making: its vault_id, the epoch seen, and an id of its own, which the first way in carries", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const mark = await markIn(world)
    const vaultProps = storedVaultPropsOf(world)
    expect(mark).to.deep.include({ format: 'safebyok-mark-v3', ...TH.scopeOf('u1'), lock_generation: 0 })
    expect(mark?.seen).to.deep.include({ vault_id: vaultProps['vault_id'], unlock_epoch: 1, vault_key_epoch: 1 })
    expect(storedWayinsOf(world)[0]).to.deep.include({ device_id: mark?.seen?.device_id, vault_key_epoch: 1, registered_at: world.clock.now() })
  })

  it("is started under the id the first way in carries, though a refresh the vault's making set off gets there first", async () => {
    const world = makeWorld()
    const vault = await world.open()
    const fetchOrCreateVaultProps = world.vaultDB.fetchOrCreateVaultProps.bind(world.vaultDB)
    // The write rings this handle's own watch, whose refresh runs to its end before the unlock goes on.
    vi.spyOn(world.vaultDB, 'fetchOrCreateVaultProps').mockImplementationOnce(async (...args) => {
      const settled = await fetchOrCreateVaultProps(...args)
      await TH.wakeupAtNextTick()
      return settled
    })
    await vault.unlock('pw')
    const seen = await seenIn(world)
    expect(storedWayinsOf(world)[0]?.['device_id']).to.eq(seen?.device_id)
  })

  it("rises with each newer version of the vault props, its own writes and another device's, and every way in this device adds carries its id", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const { device_id: deviceId } = await seenIn(world) ?? {}
    world.advance(HourMillis)
    await vault.addPassphrase('pw', 'spare phrase', { wayinlabel: 'spare' })
    expect(await seenIn(world)).to.deep.include({ device_id: deviceId, unlock_epoch: 2 })
    expect(storedWayinsOf(world)[1]).to.deep.include({ device_id: deviceId, registered_at: world.clock.now() })
    const elsewhere = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
    await elsewhere.addPassphrase('pw', 'third phrase', { wayinlabel: 'third' })
    await TH.wakeupAtNextTick()
    expect(await seenIn(world)).to.deep.include({ device_id: deviceId, unlock_epoch: 3 })
    expect(storedWayinsOf(world)[2]?.['device_id']).to.be.a('string').and.not.eq(deviceId)
  })

  it("keeps a way in's device and time when its passphrase changes", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const [before] = storedWayinsOf(world)
    world.advance(HourMillis)
    await vault.changePassphrase('pw', 'pw two')
    const [after] = storedWayinsOf(world)
    expect(after).to.deep.include({ device_id: before?.['device_id'], registered_at: before?.['registered_at'], wayin_id: before?.['wayin_id'] })
    expect(after?.['salt_b64']).to.not.eq(before?.['salt_b64'])
  })

  it("survives lock(), and retire() forgets the vault it has seen, keeping the lock generation it raised", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.lock()
    expect(await seenIn(world)).to.not.be.null
    await vault.retire()
    expect(await markIn(world)).to.deep.equal(TH.markOf('u1', { seen: null, lock_generation: 2 }))
  })

  it("starts anew, under a new id, for a vault made anew under the scope", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.addPassphrase('pw', 'spare phrase', { wayinlabel: 'spare' })
    const before = await seenIn(world)
    vault.close()
    const elsewhere = await world.open({ deviceDB: memoryDeviceDB() })
    await elsewhere.retire()
    await elsewhere.unlock('pw anew')
    await world.open()
    const after = await seenIn(world)
    expect(after).to.deep.include({ vault_id: storedVaultPropsOf(world)['vault_id'], unlock_epoch: 1 })
    expect(after?.vault_id).to.not.eq(before?.vault_id)
    expect(after?.device_id).to.not.eq(before?.device_id)
  })

  it("reads a mark naming another scope as none, says so through the logger, and starts again", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const before = await seenIn(world)
    // Every read of the mark at this open hands back u2's: the one before the vault props, and the one after.
    const misfiled = vi.spyOn(world.deviceDB, 'readMark').mockResolvedValue(TH.markOf('u2', { seen: { unlock_epoch: 9 } }))
    await world.open()
    misfiled.mockRestore()
    expect(world.logged.map((call) => call.level)).to.deep.equal(['warn'])
    expect(world.logged[0]?.message).to.include('mark')
    const after = await seenIn(world)
    expect(after?.device_id).to.not.eq(before?.device_id)
  })

  it("is said unreadable through the logger as the call that read it: a lock's, not a refresh's", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    vi.spyOn(world.deviceDB, 'readMark').mockResolvedValueOnce({ ...TH.markOf('u1'), lock_generation: -1 })
    await vault.lock()
    expect(world.logged.map((heard) => [heard.level, heard.story])).to.deep.equal([['warn', { call: 'lock' }]])
    expect(await markIn(world)).to.deep.include({ lock_generation: 1, seen: null })
  })

  it("is erased by retireDamagedVault, with the vault", async () => {
    const world = await damagedVaultWorld()
    expect(await markIn(world)).to.not.be.null
    await retireDamagedVault(world.optsWith())
    expect(await markIn(world)).to.be.null
  })
})

/**
 * A world whose `u1` vault had a way in, `spare`, removed, and the text of its vault props from
 * before the removal, for storage to hand back.
 */
const rolledBackWorld = async () => {
  const world = makeWorld()
  const vault = await world.openUnlocked('pw')
  const spareId = await vault.addPassphrase('pw', 'spare phrase', { wayinlabel: 'spare' })
  const older = world.dbStore.read(u1VaultPropsCkey) ?? ''
  await vault.retireWayin('pw', spareId)
  const newer = world.dbStore.read(u1VaultPropsCkey) ?? ''
  return { world, vault, older, newer }
}

/**
 * The README's recipe for a vault whose storage was restored from an older copy on purpose: open
 * it, and on 'rolled_back', when the host knows of the restore, erase this device's mark and open
 * it again; any other refusal goes on up.
 */
const openAcceptingRestore = async (opts: MakeVaultOpts, storageWasRestoredOnPurpose: () => Promise<boolean>): Promise<Vault> => {
  const vault = Vault.make(opts)
  try {
    await vault.hello()
  } catch (err) {
    if (! isVaultError(err, 'rolled_back') || ! await storageWasRestoredOnPurpose()) { throw err }
    await opts.deviceDB.eraseMark({ applabel: opts.applabel, user_id: opts.userId, vaultlabel: opts.vaultlabel })
    await vault.hello()
  }
  return vault
}

describe("vault props rolled back", () => {
  it("refuses an older copy at open as rolled_back, writing nothing, and quoting none of it", async () => {
    const { world, vault, older } = await rolledBackWorld()
    vault.close()
    world.dbStore.write(u1VaultPropsCkey, older)
    const err = await TH.expectRefusal(world.open(), 'rolled_back')
    expect(err.message).to.include('already seen a newer copy')
    expect(err.message).to.include('eraseMark')
    expect(err.message).to.not.include('Try again later')
    expect(TH.thrownText(err)).to.not.include((JSON.parse(older) as { vault_id: string }).vault_id)
    expect(world.dbStore.read(u1VaultPropsCkey)).to.eq(older)
    expect(await seenIn(world)).to.deep.include({ unlock_epoch: 3 })
  })

  it("refuses an older copy at unlock, so a removed way in stays removed on this device", async () => {
    const { world, vault, older } = await rolledBackWorld()
    await vault.lock()
    const deaf = await world.open({ vaultDB: world.deafVaultDB() })
    world.dbStore.write(u1VaultPropsCkey, older)
    await TH.expectRefusal(deaf.unlock('spare phrase'), 'rolled_back')
    expect(deaf.getSnapshot().state).to.eq('locked')
    expect(deaf.getSnapshot().wayins.map((wayin) => wayin.wayinlabel)).to.deep.equal(['passphrase'])
    expect(await world.readLease()).to.be.null
  })

  it("locks on an older copy met by a background refresh, taking nothing from it, and says so through the logger", async () => {
    const { world, vault, older } = await rolledBackWorld()
    const standing = vault.getSnapshot()
    world.dbStore.write(u1VaultPropsCkey, older)
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(vault.getSnapshot().wayins).to.deep.equal(standing.wayins)
    expect(await world.readLease()).to.be.null
    // The next call says hello afresh, and meets the older copy again.
    await TH.expectRefusal(vault.readBox('anthropic'), 'rolled_back')
    expect(world.logged.map((call) => [call.level, call.story, (call.err as VaultError | null | undefined)?.kind]))
      .to.deep.equal([['log', { call: 'untrustedStorage' }, undefined], ['warn', { call: 'refresh' }, 'rolled_back']])
  })

  it("refuses no copy that was the newest when storage handed it back, though another tab of this device raised the mark meanwhile", async () => {
    const world = makeWorld()
    const here = await world.openUnlocked('pw')
    const slowVaultDB = world.deafVaultDB()
    const there = await world.open({ vaultDB: slowVaultDB })
    const readVaultProps = slowVaultDB.readVaultProps.bind(slowVaultDB)
    // There's next read is served at epoch 1, and handed back only once here's change has landed.
    vi.spyOn(slowVaultDB, 'readVaultProps').mockImplementationOnce(async (...args) => {
      const served = await readVaultProps(...args)
      await here.addPassphrase('pw', 'spare phrase', { wayinlabel: 'spare' })
      return served
    })
    await there.unlock('pw')
    expect(there.getSnapshot().state).to.eq('unlocked')
    expect(await seenIn(world)).to.deep.include({ unlock_epoch: 2 })
  })

  it("refuses no vault another tab made while this one was making it, though that tab raised the mark meanwhile", async () => {
    const world = makeWorld()
    const there = await world.open()
    const slowVaultDB = world.deafVaultDB()
    const late = await world.open({ vaultDB: slowVaultDB })
    const fetchOrCreateVaultProps = slowVaultDB.fetchOrCreateVaultProps.bind(slowVaultDB)
    // There makes the vault first, so late's write hands back there's vault props at epoch 1, and only
    // after that does there change it, raising the mark this device shares to epoch 2.
    vi.spyOn(slowVaultDB, 'fetchOrCreateVaultProps').mockImplementationOnce(async (...args) => {
      await there.unlock('pw')
      const settled = await fetchOrCreateVaultProps(...args)
      await there.changePassphrase('pw', 'pw two')
      return settled
    })
    await late.unlock('pw')
    expect(late.getSnapshot().state).to.eq('unlocked')
    expect(await seenIn(world)).to.deep.include({ unlock_epoch: 2 })
  })

  it("takes the copy up again once storage hands back the newest", async () => {
    const { world, vault, older, newer } = await rolledBackWorld()
    vault.close()
    world.dbStore.write(u1VaultPropsCkey, older)
    await TH.expectRefusal(world.open(), 'rolled_back')
    world.dbStore.write(u1VaultPropsCkey, newer)
    const reopened = await world.open()
    expect(reopened.getSnapshot().state).to.eq('locked')  // the refused open revoked the lease
    await reopened.unlock('pw')
    expect(reopened.getSnapshot().wayins.map((wayin) => wayin.wayinlabel)).to.deep.equal(['passphrase'])
  })

  it("refuses an older copy at a lower vaultKey epoch as rolled_back, though storage raised its unlock epoch past the one seen", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    vault.close()
    const first = storedVaultPropsOf(world) as unknown as VaultProps
    const second: VaultProps = {
      ...first,
      unlock_epoch:    2,
      vault_key_epoch: 2,
      prior_vault_key: { vault_key_epoch: 1, vault_key_wrapped: TH.fakeCiphered('prior') },
      wayins:          first.wayins.map((wayin) => ({ ...wayin, vault_key_epoch: 2 })),
    }
    world.dbStore.write(u1VaultPropsCkey, JSON.stringify(second))
    await world.open()
    expect(await seenIn(world)).to.deep.include({ unlock_epoch: 2, vault_key_epoch: 2 })
    world.dbStore.write(u1VaultPropsCkey, JSON.stringify({ ...first, unlock_epoch: 9 }))
    await TH.expectRefusal(world.open(), 'rolled_back')
    expect(await seenIn(world)).to.deep.include({ unlock_epoch: 2, vault_key_epoch: 2 })
  })

  it("takes an older copy at the same vaultKey epoch under a raised unlock epoch as it stands, its removed way in opening again", async () => {
    const { world, vault, older } = await rolledBackWorld()
    vault.close()
    world.dbStore.write(u1VaultPropsCkey, JSON.stringify({ ...(JSON.parse(older) as object), unlock_epoch: 9 }))
    const reopened = await world.open()
    await reopened.unlock('spare phrase')
    expect(reopened.getSnapshot().state).to.eq('unlocked')
  })

  it("is accepted on this device once its mark of the vault is erased, as the README's recipe does", async () => {
    const { world, vault, older } = await rolledBackWorld()
    vault.close()
    world.dbStore.write(u1VaultPropsCkey, older)
    const reopened = await openAcceptingRestore(world.optsWith(), () => Promise.resolve(true))
    expect(reopened.getSnapshot().wayins.map((wayin) => wayin.wayinlabel)).to.deep.equal(['passphrase', 'spare'])
    expect(await seenIn(world)).to.deep.include({ unlock_epoch: 2 })
  })

  it("is still refused by the README's recipe when the host knows of no restore", async () => {
    const { world, vault, older } = await rolledBackWorld()
    vault.close()
    world.dbStore.write(u1VaultPropsCkey, older)
    await TH.expectRefusal(openAcceptingRestore(world.optsWith(), () => Promise.resolve(false)), 'rolled_back')
    expect(await seenIn(world)).to.deep.include({ unlock_epoch: 3 })
  })

  it("is not caught on a device that never saw the newer copy, which takes the older as it stands", async () => {
    const { world, older } = await rolledBackWorld()
    world.dbStore.write(u1VaultPropsCkey, older)
    const stranger = await world.open({ deviceDB: memoryDeviceDB() })
    await stranger.unlock('spare phrase')
    expect(stranger.getSnapshot().state).to.eq('unlocked')
  })
})

describe("the vaultKey's epoch", () => {
  it("makes a vault at its first vaultKey, with no prior one", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    expect(storedVaultPropsOf(world)).to.deep.include({ format: 'safebyok-vault-v3', vault_key_epoch: 1 })
    expect(storedVaultPropsOf(world)).to.not.have.property('prior_vault_key')
  })

  it("seals each lockbox under the vault props' vaultKey, its epoch shown in the listing while locked", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake')
    await vault.lock()
    expect(storedRowOf(world, 'anthropic')).to.deep.include({ format: 'safebyok-lockbox-v5', vault_key_epoch: 1 })
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.vault_key_epoch).to.eq(1)
  })

  it("refuses as damaged_lockbox a lockbox that says it was sealed under another vaultKey, quoting not its boxlabel", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake')
    world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify({ ...storedRowOf(world, 'anthropic'), vault_key_epoch: 2 }))
    const err = await TH.expectRefusal(vault.readBox('anthropic'), 'damaged_lockbox')
    expect(err.message).to.include('does not hold')
    expect(TH.thrownText(err)).to.not.include('anthropic')
  })

  it("writes nothing from a device still holding a vaultKey since replaced, which has not looked at the vault props since", async () => {
    const world = makeWorld()
    const stale = await world.openUnlocked('pw', { vaultDB: world.deafVaultDB() })
    const standing = storedVaultPropsOf(world) as unknown as VaultProps
    const replaced: VaultProps = {
      ...standing,
      unlock_epoch:    2,
      vault_key_epoch: 2,
      prior_vault_key: { vault_key_epoch: 1, vault_key_wrapped: TH.fakeCiphered('prior') },
      wayins:          standing.wayins.map((wayin) => ({ ...wayin, vault_key_epoch: 2 })),
    }
    await world.vaultDB.updateVaultProps(replaced, { vault_id: standing.vault_id, unlock_epoch: 1 })
    await TH.expectRefusal(stale.storeBox('anthropic', 'sk-fake'), 'vault_locked')
    expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.be.null
  })

  it("opens a vault stored before vaultKey epochs as damaged_vault, which retireDamagedVault clears", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake')
    vault.close()
    const { vault_key_epoch: _epoch, ...older } = storedVaultPropsOf(world)
    world.dbStore.write(u1VaultPropsCkey, JSON.stringify({ ...older, format: 'safebyok-vault-v1' }))
    await TH.expectRefusal(world.open(), 'damaged_vault')
    await retireDamagedVault(world.optsWith())
    expect(rowsOf(world, 'u1')).to.deep.equal([])
  })

  it("opens a vault stored under the format before wayins, safebyok-vault-v2, as damaged_vault, never newer_format, which retireDamagedVault clears", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.storeBox('anthropic', 'sk-fake')
    vault.close()
    world.dbStore.write(u1VaultPropsCkey, JSON.stringify({ ...storedVaultPropsOf(world), format: 'safebyok-vault-v2' }))
    await TH.expectRefusal(world.open(), 'damaged_vault')
    await retireDamagedVault(world.optsWith())
    expect(rowsOf(world, 'u1')).to.deep.equal([])
  })
})
