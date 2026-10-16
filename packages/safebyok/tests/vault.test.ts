import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import * as ZClassic from 'zod'
import * as Z from 'zod/mini'
import { ForcePassphraseReentryHours, FarFuture, FarPast, ForeverMillis, MaxReentryHours, MinuteMillis, Lockbox, MaxLockboxes, MaxUnlocks, MaxWhisperBytes, VaultScope, type DeviceMark, type DeviceUnlock, type VaultBundle, type PasskeyProof, type Whisper } from '../src/types'
import { AnyTextValidators, LockboxNote, MaxUserIdChars, type VaultValidators } from '../src/validators'
import { VaultError, isVaultError } from '../src/errors'
import { memoryDeviceDB, type DeviceDB } from '../src/device-db'
import { jsonBytes, localVaultDB, type VaultDB } from '../src/vault-db'
import { memoryStore } from '../src/string-store'
import { LockboxFieldsBytes, LockboxFixedBytes, StoredBytesPerWhisperByte, eraseDamagedVault, openVault, type OpenVaultOpts, type Vault } from '../src/vault'
import { cipherBinding, cipherBytes, fromB64, makeLockboxKey, makeVaultKey, randomBytes, toB64, wrapKeyUnder } from '../src/crypto'
import type { KeyDeriver } from '../src/key-deriver'
import { Argon2idWebV1, MaxSaltBytes } from '../src/key-deriver-spec'
import * as Ckeys from '../src/ckeys'
import * as TH from './test-helpers'

/** Where the vault each world opens, `u1`'s `main`, files its bundle and each of its lockboxes. */
const u1BundleCkey = Ckeys.bundle(TH.scopeOf('u1'))
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
 * unlock this device remembers for `u1`, and a second vaultDB over the same store that hears no
 * change bells, for a device that does not notice another's doings. Unlocks
 * derive through the cheap testDeriver, so the suite is not a benchmark of Argon2id; the real
 * deriver has its own tests in key-deriver.test.ts.
 */
const makeWorld = (defaults?: Partial<OpenVaultOpts>) => {
  const dbStore = memoryStore()
  const vaultDB = localVaultDB(dbStore)
  const deviceDB = memoryDeviceDB()
  let nowMillis = Date.parse('2026-10-14T12:00:00Z')
  const clock = { now: () => nowMillis }
  const advance = (byMillis: number) => { nowMillis += byMillis }
  const { logger, calls: logged } = TH.spyLogger()
  const optsWith = (overrides?: Partial<OpenVaultOpts>): OpenVaultOpts => (
    { applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB, deviceDB, clock, keyDeriver: TH.testDeriver, logger, ...defaults, ...overrides }
  )
  const open = (overrides?: Partial<OpenVaultOpts>) => openVault(optsWith(overrides))
  const openUnlocked = async (passphrase: string, overrides?: Partial<OpenVaultOpts>) => {
    const vault = await open(overrides)
    await vault.unlock(passphrase)
    return vault
  }
  const rememberedUnlock = () => deviceDB.readUnlock(TH.scopeOf('u1'))
  const deafVaultDB = () => localVaultDB({ ...dbStore, subscribe: neverRings })
  const stateOnOpen = async (overrides?: Partial<OpenVaultOpts>) => {
    const vault = await open(overrides)
    return vault.getSnapshot().state
  }
  return { dbStore, vaultDB, deviceDB, clock, advance, logged, optsWith, open, openUnlocked, rememberedUnlock, stateOnOpen, deafVaultDB }
}

/** Boxlabels in the snapshot, in order. */
const boxlabelsOf = (vault: Vault) => vault.getSnapshot().boxes.map((summary) => summary.boxlabel)

/** Storage adapters openVault refuses: short of a verb the vault calls. */
const MisfitStores: readonly (readonly [Partial<OpenVaultOpts>, string])[] = [
  [{ vaultDB: { readBundle: () => Promise.resolve(null) } as unknown as OpenVaultOpts['vaultDB'] }, 'a vaultDB with only some of its verbs'],
  [{ deviceDB: { ...memoryDeviceDB(), eraseAll: 'never' } as unknown as OpenVaultOpts['deviceDB'] }, 'a deviceDB whose eraseAll is no function'],
  [{ deviceDB: TH.omitting(memoryDeviceDB(), 'readMark') }, 'a deviceDB that keeps no device mark'],
]

const HourMillis = 60 * 60 * 1000
const SevenDaysMillis = 7 * 24 * HourMillis

/** Remembered deadlines outside EpochMillis's bounds, each a unit mistake or an older reading of "far". */
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

describe("openVault", () => {
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
      await TH.expectRefusal(openVault(opts as unknown as OpenVaultOpts), 'bad_option')
    }
  })

  for (const ckey of ['vaultDB', 'deviceDB'] as const) {
    it(`refuses a missing ${ckey} with kind 'bad_option'`, async () => {
      const opts = TH.omitting(makeWorld().optsWith(), ckey)
      const err = await TH.expectRefusal(openVault(opts), 'bad_option')
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

  it("takes a store of the host's own that carries every verb, prototype and all", async () => {
    const world = makeWorld()
    expect(await world.stateOnOpen({ vaultDB: Object.create(world.vaultDB) as OpenVaultOpts['vaultDB'], deviceDB: uncheckingDeviceDB().deviceDB })).to.eq('absent')
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

describe("the host's clock", () => {
  for (const [reading, blurb] of OutOfBoundsReadings) {
    it(`refuses a clock reading ${blurb} at openVault, before reading storage`, async () => {
      const world = makeWorld()
      const readBundle = vi.spyOn(world.vaultDB, 'readBundle')
      const err = await TH.expectRefusal(world.open({ clock: { now: () => reading as number } }), 'bad_option')
      expect(err.message).to.match(/epoch milliseconds/)
      expect(readBundle).not.toHaveBeenCalled()
    })
  }

  it("refuses a clock that is not a Clock", async () => {
    const world = makeWorld()
    for (const nonsense of [{}, { now: 1_792_022_400_000 }, () => 1_792_022_400_000, 'now', null]) {
      await TH.expectRefusal(world.open({ clock: nonsense as unknown as OpenVaultOpts['clock'] }), 'bad_option')
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
    expect(await world.rememberedUnlock()).to.be.null
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
    expect(await world.rememberedUnlock()).to.be.null
    reading = world.clock.now()
    await TH.expectRefusal(vault.read('anthropic'), 'vault_locked')
    await vault.unlock('pw')
    reading = 0
    await vault.lock()
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.rememberedUnlock()).to.be.null
  })

  it("fails closed: a reading gone wrong while unlocked drops the vaultKey before it refuses the clock", async () => {
    const world = makeWorld()
    let reading = world.clock.now()
    const vault = await world.openUnlocked('pw', { clock: { now: () => reading } })
    await vault.store('anthropic', 'sk-fake')
    reading = world.clock.now() / 1000
    await TH.expectRefusal(vault.read('anthropic'), 'bad_option')
    expect(vault.getSnapshot().state).to.eq('locked')
    reading = world.clock.now()
    await TH.expectRefusal(vault.read('anthropic'), 'vault_locked')
  })

  it("refuses a clock whose now() throws, at openVault, keeping its error as the cause and quoting none of it", async () => {
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
    await vault.store('anthropic', 'sk-fake')
    broken = true
    const err = await TH.expectRefusal(vault.read('anthropic'), 'bad_option')
    expect((err.cause as Error).message).to.eq('no time today')
    broken = false
    expect(vault.getSnapshot().state).to.eq('locked')
    await TH.expectRefusal(vault.read('anthropic'), 'vault_locked')
  })

  it("refuses a store when the clock has gone wrong while unlocked", async () => {
    const world = makeWorld()
    let reading = world.clock.now()
    const vault = await world.openUnlocked('pw', { clock: { now: () => reading } })
    reading = Infinity
    await TH.expectRefusal(vault.store('anthropic', 'sk-fake'), 'bad_option')
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

/** The deadline this world's device remembers, or null when it remembers no unlock. */
const rememberedDeadlineOf = async (world: ReturnType<typeof makeWorld>): Promise<number | null> => {
  const remembered = await world.rememberedUnlock()
  return remembered?.ask_passphrase_at ?? null
}

describe("the remembered unlock", () => {
  it("spares the passphrase on a later open, within seven days", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw one')
    world.advance(6 * 24 * 60 * 60 * 1000)
    const later = await world.open()
    expect(later.getSnapshot().state).to.eq('unlocked')
    // Genuinely unlocked: a read reaches the box layer ('absent_box'), not the lock ('vault_locked').
    await TH.expectRefusal(later.read('missing'), 'absent_box')
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
    await vault.store('anthropic', 'sk-fake')
    world.advance(SevenDaysMillis + 1)
    await TH.expectRefusal(vault.read('anthropic'), 'vault_locked')
  })

  it("lasts ForcePassphraseReentryHours, 168 (seven days), unless told otherwise", () => {
    expect(ForcePassphraseReentryHours * HourMillis).to.eq(SevenDaysMillis)
  })

  it("lasts the forcePassphraseReentryHours the host chose, and asks again from then", async () => {
    const world = makeWorld()
    const twelveHoursMillis = 12 * HourMillis
    const vault = await world.openUnlocked('pw one', { forcePassphraseReentryHours: 12 })
    expect(vault.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + twelveHoursMillis)
    world.advance(twelveHoursMillis - 1)
    expect(await world.stateOnOpen({ forcePassphraseReentryHours: 12 })).to.eq('unlocked')
    world.advance(1)
    expect(await world.stateOnOpen({ forcePassphraseReentryHours: 12 })).to.eq('locked')
    await TH.expectRefusal(vault.read('anthropic'), 'vault_locked')
  })

  it("takes fractions of an hour, kept as whole milliseconds", async () => {
    const world = makeWorld()
    const quarterHour = await world.openUnlocked('pw one', { forcePassphraseReentryHours: 0.25 })
    const fifteenMinutesMillis = 15 * 60 * 1000
    expect(quarterHour.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + fifteenMinutesMillis)
    const oneThird = await world.openUnlocked('pw one', { deviceDB: memoryDeviceDB(), forcePassphraseReentryHours: 1 / 3 })
    const twentyMinutesMillis = 20 * 60 * 1000
    expect(oneThird.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + twentyMinutesMillis)
  })

  it("refuses a forcePassphraseReentryHours that is not a span of time above zero", async () => {
    const world = makeWorld()
    for (const nonsense of [0, -1, -Infinity, NaN, 1e-12, '12', null, true, {}]) {
      await TH.expectRefusal(world.open({ forcePassphraseReentryHours: nonsense as number }), 'bad_option')
    }
  })

  it("says in its refusal that Infinity is welcome", async () => {
    const world = makeWorld()
    const err = await TH.expectRefusal(world.open({ forcePassphraseReentryHours: 0 }), 'bad_option')
    expect(err.message).to.match(/greater than zero/)
    expect(err.message).to.match(/Infinity/)
  })

  describe("with forcePassphraseReentryHours: Infinity", () => {
    it("unlocks, and stays unlocked however long it is left, showing FarFuture as its deadline", async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw one', { forcePassphraseReentryHours: Infinity })
      await vault.store('anthropic', 'sk-fake')
      expect(vault.getSnapshot().state).to.eq('unlocked')
      expect(vault.getSnapshot().askPassphraseAt).to.eq(FarFuture)
      world.advance(200 * 365 * 24 * HourMillis)
      expect(await vault.read('anthropic')).to.eq('sk-fake')
      expect(vault.getSnapshot().state).to.eq('unlocked')
    })

    it("writes the clamped deadline to the device, as a finite number, and a reopen picks it up", async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw one', { forcePassphraseReentryHours: Infinity })
      await vault.store('anthropic', 'sk-fake')
      const remembered = await world.rememberedUnlock()
      expect(remembered?.ask_passphrase_at).to.eq(FarFuture)
      world.advance(10 * 365 * 24 * HourMillis)
      const reopened = await world.open({ forcePassphraseReentryHours: Infinity })
      expect(reopened.getSnapshot().state).to.eq('unlocked')
      expect(reopened.getSnapshot().askPassphraseAt).to.eq(FarFuture)
      expect(await reopened.read('anthropic')).to.eq('sk-fake')
    })

    it("ends with lock(), here and on the device", async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw one', { forcePassphraseReentryHours: Infinity })
      await vault.lock()
      expect(vault.getSnapshot().state).to.eq('locked')
      expect(vault.getSnapshot().askPassphraseAt).to.be.null
      await TH.expectRefusal(vault.read('anthropic'), 'vault_locked')
      expect(await world.stateOnOpen({ forcePassphraseReentryHours: Infinity })).to.eq('locked')
    })

    it("holds through a passphrase change on this device, with the same deadline", async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw one', { forcePassphraseReentryHours: Infinity })
      await vault.changePassphrase('pw one', 'pw two')
      expect(vault.getSnapshot().state).to.eq('unlocked')
      expect(vault.getSnapshot().askPassphraseAt).to.eq(FarFuture)
      const remembered = await world.rememberedUnlock()
      expect(remembered?.ask_passphrase_at).to.eq(FarFuture)
    })
  })

  for (const [shiftMillis, blurb] of [[HourMillis, 'later'], [-HourMillis, 'earlier']] as const) {
    it(`reads a remembered deadline moved an hour ${blurb} on the device as no remembered unlock, erases it, and says so: the deadline is bound into its wrap`, async () => {
      const world = makeWorld()
      await world.openUnlocked('pw one')
      const written = await world.rememberedUnlock()
      if (written === null) { throw new Error('expected a remembered unlock on the device') }
      await world.deviceDB.writeUnlock({ ...written, ask_passphrase_at: written.ask_passphrase_at + shiftMillis }, TH.NoLocks)
      // Under Infinity no window check refuses it, and an hour either way stays in bounds: only the binding can.
      const reopened = await world.open({ forcePassphraseReentryHours: Infinity })
      expect(reopened.getSnapshot().state).to.eq('locked')
      expect(await world.rememberedUnlock()).to.be.null
      expect(world.logged.map((call) => call.level)).to.deep.eq(['warn'])
    })
  }

  for (const [askPassphraseAt, blurb] of OutOfBoundsDeadlines) {
    it(`reads a remembered deadline of ${blurb} as no remembered unlock, and erases it`, async () => {
      const world = makeWorld()
      await world.openUnlocked('pw one')
      const written = await world.rememberedUnlock()
      if (written === null) { throw new Error('expected a remembered unlock on the device') }
      await world.deviceDB.writeUnlock({ ...written, ask_passphrase_at: askPassphraseAt }, TH.NoLocks)
      // Under Infinity no window check refuses it: only the bounds can.
      const reopened = await world.open({ forcePassphraseReentryHours: Infinity })
      expect(reopened.getSnapshot().state).to.eq('locked')
      expect(reopened.getSnapshot().askPassphraseAt).to.be.null
      expect(await world.rememberedUnlock()).to.be.null
    })
  }

  it("refuses a finite window longer than MaxReentryHours, 588 (24.5 days), which no timer reaches: Infinity is the way to say never", async () => {
    const world = makeWorld()
    for (const tooLong of [MaxReentryHours + 0.01, 25 * 24, 1e6, 1e300, Number.MAX_VALUE]) {
      const err = await TH.expectRefusal(world.open({ forcePassphraseReentryHours: tooLong }), 'bad_option')
      expect(err.message).to.match(/588/)
      expect(err.message).to.match(/Infinity/)
    }
  })

  it("is MaxReentryHours at most, short of what one timer reaches, with a minute's grace to spare", () => {
    expect(MaxReentryHours).to.eq(588)
    expect((MaxReentryHours * HourMillis) + MinuteMillis).to.be.below((2 ** 31) - 1)
  })

  it("makes a deadline of whole milliseconds from a clock that returns fractions, and a reopen reads it back", async () => {
    const world = makeWorld()
    const fractionalClock = { now: () => world.clock.now() + 0.25 }
    const vault = await world.openUnlocked('pw one', { clock: fractionalClock })
    expect(vault.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + SevenDaysMillis)
    const remembered = await world.rememberedUnlock()
    expect(remembered?.ask_passphrase_at).to.eq(world.clock.now() + SevenDaysMillis)
    expect(await world.stateOnOpen({ clock: fractionalClock })).to.eq('unlocked')
  })

  it("takes the longest finite window, MaxReentryHours, exactly as asked", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one', { forcePassphraseReentryHours: MaxReentryHours })
    expect(vault.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + (MaxReentryHours * HourMillis))
  })
})

describe("the remembered unlock, when the host changes forcePassphraseReentryHours", () => {
  it("lowered from Infinity to one hour, forgets a device already remembered at its next open, and the next unlock lasts an hour", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw one', { forcePassphraseReentryHours: Infinity })
    world.advance(30 * 24 * HourMillis)
    const lowered = await world.open({ forcePassphraseReentryHours: 1 })
    expect(lowered.getSnapshot().state).to.eq('locked')
    expect(await world.rememberedUnlock()).to.be.null
    await lowered.unlock('pw one')
    expect(lowered.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + HourMillis)
    expect(await world.stateOnOpen({ forcePassphraseReentryHours: 1 })).to.eq('unlocked')
  })

  it("writes no record on any open, shortened or not", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw one', { forcePassphraseReentryHours: Infinity })
    const writeUnlock = vi.spyOn(world.deviceDB, 'writeUnlock')
    await world.open({ forcePassphraseReentryHours: Infinity })
    await world.open({ forcePassphraseReentryHours: 1 })
    await world.open({ forcePassphraseReentryHours: 1 })
    expect(writeUnlock).not.toHaveBeenCalled()
  })

  it("never brings back a remembered unlock that another tab's lock() erased during the open", async () => {
    const world = makeWorld()
    const otherTab = await world.openUnlocked('pw one', { forcePassphraseReentryHours: Infinity })
    const readUnlock = world.deviceDB.readUnlock.bind(world.deviceDB)
    vi.spyOn(world.deviceDB, 'readUnlock').mockImplementationOnce(async (scope) => {
      const kept = await readUnlock(scope)
      await otherTab.lock()
      return kept
    })
    await world.open({ forcePassphraseReentryHours: 1 })
    expect(await world.rememberedUnlock()).to.be.null
    expect(await world.stateOnOpen({ forcePassphraseReentryHours: 1 })).to.eq('locked')
  })

  it("raised, lengthens no unlock already remembered", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw one', { forcePassphraseReentryHours: 12 })
    const given = world.clock.now() + (12 * HourMillis)
    world.advance(HourMillis)
    const raised = await world.open({ forcePassphraseReentryHours: Infinity })
    expect(raised.getSnapshot().askPassphraseAt).to.eq(given)
    expect(await rememberedDeadlineOf(world)).to.eq(given)
  })

  it("lowered to a window that still reaches past the deadline given, leaves the unlock and its record as they were", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw one', { forcePassphraseReentryHours: 12 })
    const given = world.clock.now() + (12 * HourMillis)
    world.advance(11 * HourMillis)
    const lowered = await world.open({ forcePassphraseReentryHours: 2 })
    expect(lowered.getSnapshot().state).to.eq('unlocked')
    expect(lowered.getSnapshot().askPassphraseAt).to.eq(given)
    expect(await rememberedDeadlineOf(world)).to.eq(given)
  })

  it("keeps a deadline exactly at the new window's end, and forgets one a millisecond past it", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw one', { forcePassphraseReentryHours: 12 })
    const oneMilliShort = 12 - (1 / HourMillis)
    world.advance(1)
    expect(await world.stateOnOpen({ forcePassphraseReentryHours: oneMilliShort })).to.eq('unlocked')
    world.advance(-1)
    expect(await world.stateOnOpen({ forcePassphraseReentryHours: oneMilliShort })).to.eq('locked')
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
    readUnlock:  (scope) => Promise.resolve((rows.get(ckeyOf(scope)) ?? null) as DeviceUnlock | null),
    writeUnlock: (unlock) => { rows.set(ckeyOf(unlock), unlock); return Promise.resolve() },
    eraseUnlock: (scope) => { rows.delete(ckeyOf(scope)); return Promise.resolve() },
    readMark:    (scope) => Promise.resolve((marks.get(ckeyOf(scope)) ?? null) as DeviceMark | null),
    writeMark:   (mark) => { marks.set(ckeyOf(mark), mark); return Promise.resolve() },
    eraseMark:   (scope) => { marks.delete(ckeyOf(scope)); return Promise.resolve() },
    eraseAll:    () => { rows.clear(); marks.clear(); return Promise.resolve() },
  }
  /** Rewrite the one stored row through `spoil`. */
  const spoilRow = (spoil: (row: Record<string, unknown>) => unknown) => {
    const [[ckey, row]] = [...rows] as [[string, Record<string, unknown>]]
    rows.set(ckey, spoil(row))
  }
  return { deviceDB, rows, spoilRow }
}

const SpoiledUnlocks = [
  [(row: Record<string, unknown>) => ({ ...row, format: 'byok-unlock-v1' }),                  'a record under the format tag before the rename'],
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

/** How long an unlock of `vault` lasts, as `Vault.reentryWindowMillis`'s example says it. */
const windowSaidBy = (vault: Vault): string => (
  vault.reentryWindowMillis === ForeverMillis ? 'until you lock it' : `for ${String(Math.round(vault.reentryWindowMillis / 60_000))} minutes`
)

const ReentryWindowCases = [
  // regular usage:
  [undefined,        SevenDaysMillis,                'the default, seven days'],
  [12,               12 * HourMillis,                'the hours the host chose'],
  [0.25,             15 * 60 * 1000,                 'a fraction of an hour'],
  [Infinity,         ForeverMillis,                  'Infinity, as ForeverMillis'],
  // edge cases:
  [MaxReentryHours,  MaxReentryHours * HourMillis,   'the longest finite window, MaxReentryHours'],
  [1 / 7,            514_286,                        'a window that is no whole number of milliseconds, rounded to one'],
] as const

describe("the vault's reentryWindowMillis", () => {
  for (const [hours, expected, blurb] of ReentryWindowCases) {
    it(`reports ${blurb}`, async () => {
      const world = makeWorld()
      const vault = await world.open({ forcePassphraseReentryHours: hours })
      expect(vault.reentryWindowMillis).to.eq(expected)
    })
  }

  it("is the window an unlock lasts: askPassphraseAt is the unlock's time plus it", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one', { forcePassphraseReentryHours: 0.25 })
    expect(vault.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + vault.reentryWindowMillis)
  })

  it("stays the same for the handle's life, through unlock and lock", async () => {
    const world = makeWorld()
    const vault = await world.open({ forcePassphraseReentryHours: 12 })
    await vault.unlock('pw one')
    await vault.lock()
    expect(vault.reentryWindowMillis).to.eq(12 * HourMillis)
  })

  it("lets a UI say how long an unlock lasts, as its example shows", async () => {
    const world = makeWorld()
    expect(windowSaidBy(await world.open({ forcePassphraseReentryHours: Infinity }))).to.eq('until you lock it')
    expect(windowSaidBy(await world.open({ forcePassphraseReentryHours: 0.25 }))).to.eq('for 15 minutes')
  })
})

describe("the remembered unlock, from a host's own DeviceDB", () => {
  it("is checked by the vault: a sound record spares the passphrase", async () => {
    const world = makeWorld()
    const device = uncheckingDeviceDB()
    await world.openUnlocked('pw one', { deviceDB: device.deviceDB })
    expect(await world.stateOnOpen({ deviceDB: device.deviceDB })).to.eq('unlocked')
  })

  for (const [spoil, blurb] of SpoiledUnlocks) {
    it(`reads ${blurb} as no remembered unlock, and erases it`, async () => {
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

  it("says through the logger that a record naming another scope was forgotten", async () => {
    const world = makeWorld()
    const device = uncheckingDeviceDB()
    await world.openUnlocked('pw one', { deviceDB: device.deviceDB })
    device.spoilRow((row) => ({ ...row, user_id: 'u2' }))
    await world.open({ deviceDB: device.deviceDB })
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

describe("store and read", () => {
  for (const [whisper, blurb] of RoundTrips) {
    it(`round-trips ${blurb}`, async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw')
      await vault.store('the_box', whisper)
      expect(await vault.read('the_box')).to.deep.equal(whisper)
    })
  }

  it("keeps the summary public and the whisper out of it", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.store('anthropic', 'sk-fake', { note: 'personal account' })
    const summary = TH.summaryOf(vault.getSnapshot().boxes[0])
    expect(summary?.boxlabel).to.eq('anthropic')
    expect(summary?.note).to.eq('personal account')
    expect(summary).to.not.have.property('whisper')
  })

  it("replacing a whisper keeps the note", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.store('anthropic', 'sk-old', { note: 'keep me' })
    await vault.store('anthropic', 'sk-new')
    expect(await vault.read('anthropic')).to.eq('sk-new')
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.note).to.eq('keep me')
  })

  it("refuses a whisper JSON cannot carry, quoting none of it", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const sneaky = { apiKey: 'sk-ant-SUPERSECRET', when: new Date() }
    const err = await TH.expectRefusal(vault.store('the_box', sneaky as unknown as Whisper), 'bad_whisper')
    expect(err.message).to.not.include('SUPERSECRET')
    await TH.expectRefusal(vault.store('the_box', undefined as unknown as Whisper), 'bad_whisper')
    await TH.expectRefusal(vault.store('the_box', null as unknown as Whisper), 'bad_whisper')
    expect(vault.getSnapshot().boxes).to.have.lengthOf(0)
  })

  it("stores a whisper of exactly MaxWhisperBytes, and refuses one byte more, quoting none of it", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    // A JSON string is its characters plus two quotes.
    const atLimit = 'x'.repeat(MaxWhisperBytes - 2)
    await vault.store('the_box', atLimit)
    expect(await vault.read('the_box')).to.eq(atLimit)
    const oneOver = `${'x'.repeat(MaxWhisperBytes - 7)}SECRET`
    const err = await TH.expectRefusal(vault.store('the_box', oneOver), 'whisper_too_large')
    expect(err.message).to.not.include('SECRET')
    expect(await vault.read('the_box')).to.eq(atLimit)
  })

  it("counts the limit in bytes, not characters", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { maxWhisperBytes: 10 })
    await vault.store('the_box', 'éééé')
    await TH.expectRefusal(vault.store('other_box', 'ééééé'), 'whisper_too_large')
    expect(boxlabelsOf(vault)).to.deep.equal(['the_box'])
  })

  it("checks the limit on write only, so lowering it strands nothing already stored", async () => {
    const world = makeWorld()
    const roomy = await world.openUnlocked('pw')
    await roomy.store('the_box', 'x'.repeat(100))
    roomy.close()
    const tight = await world.open({ maxWhisperBytes: 16 })
    expect(await tight.read('the_box')).to.eq('x'.repeat(100))
    await TH.expectRefusal(tight.store('the_box', 'x'.repeat(100)), 'whisper_too_large')
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
    await TH.expectRefusal(vault.store('not a label', 'whatever'), 'bad_label')
  })

  it("reads of an absent box refuse without quoting the boxlabel, which may be any text a host admits", async () => {
    const world = makeWorld({ validators: AnyTextValidators })
    const vault = await world.openUnlocked('pw')
    const err = await TH.expectRefusal(vault.read('sk-fake-pasted-by-mistake'), 'absent_box')
    expect(err.message).not.to.include('sk-fake-pasted-by-mistake')
  })
})

/** The stored row of the lockbox `boxlabel`, as the backend holds it. */
const storedRowOf = (world: ReturnType<typeof makeWorld>, boxlabel: string): Record<string, unknown> => (
  JSON.parse(world.dbStore.read(u1BoxCkey(boxlabel)) ?? 'null') as Record<string, unknown>
)

/** The vault's stored bundle, as the backend holds it. */
const storedBundleOf = (world: ReturnType<typeof makeWorld>): Record<string, unknown> => (
  JSON.parse(world.dbStore.read(u1BundleCkey) ?? 'null') as Record<string, unknown>
)

describe("the times a vault keeps", () => {
  it("stamps a new lockbox's registered_at and changed_at with the clock's time", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.store('anthropic', 'sk-fake')
    const storedAt = world.clock.now()
    expect(vault.getSnapshot().boxes[0]).to.include({ registered_at: storedAt, changed_at: storedAt })
    expect(storedRowOf(world, 'anthropic')).to.include({ registered_at: storedAt, changed_at: storedAt })
  })

  it("keeps registered_at when the whisper is replaced, and moves changed_at", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.store('anthropic', 'sk-old')
    const storedAt = world.clock.now()
    world.advance(60_000)
    await vault.store('anthropic', 'sk-new')
    expect(vault.getSnapshot().boxes[0]).to.include({ registered_at: storedAt, changed_at: storedAt + 60_000 })
  })

  it("leaves changed_at standing when the same whisper is stored again, under a new revision", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.store('openai', { apiKey: 'sk-fake', tier: 2 })
    const storedAt = world.clock.now()
    const before = TH.summaryOf(vault.getSnapshot().boxes[0])
    world.advance(60_000)
    // The same whisper, its fields given in another order: it serializes the same.
    await vault.store('openai', { tier: 2, apiKey: 'sk-fake' }, { note: 'a new note' })
    const after = TH.summaryOf(vault.getSnapshot().boxes[0])
    expect(after).to.include({ registered_at: storedAt, changed_at: storedAt, note: 'a new note' })
    expect(after?.revision_id).to.not.eq(before?.revision_id)
  })

  it("moves changed_at when a whisper changes only in type, as its serialized form does", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.store('pin', '1234')
    const storedAt = world.clock.now()
    world.advance(60_000)
    await vault.store('pin', 1234)
    expect(vault.getSnapshot().boxes[0]).to.include({ changed_at: storedAt + 60_000 })
  })

  it("counts a previous record that will not open as changed, and writes over it", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.store('anthropic', 'sk-fake')
    const storedAt = world.clock.now()
    const row = storedRowOf(world, 'anthropic') as { whisper_ciphered: { ciphertext_b64: string } }
    row.whisper_ciphered.ciphertext_b64 = TH.tweakB64(row.whisper_ciphered.ciphertext_b64)
    world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify(row))
    world.advance(60_000)
    await vault.store('anthropic', 'sk-fake')
    expect(vault.getSnapshot().boxes[0]).to.include({ registered_at: storedAt, changed_at: storedAt + 60_000 })
    expect(await vault.read('anthropic')).to.eq('sk-fake')
  })

  it("stamps the bundle's registered_at when the vault is made, and keeps it through a passphrase change", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    const madeAt = world.clock.now()
    expect(storedBundleOf(world)).to.include({ registered_at: madeAt })
    world.advance(60_000)
    await vault.changePassphrase('pw one', 'pw two')
    expect(storedBundleOf(world)).to.include({ registered_at: madeAt, unlock_epoch: 2 })
  })

  it("writes no created_at or updated_at, to a lockbox or a bundle", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.store('anthropic', 'sk-fake')
    for (const row of [storedRowOf(world, 'anthropic'), storedBundleOf(world)]) {
      expect(row).to.not.have.any.keys('created_at', 'updated_at')
    }
  })

  it("writes whole milliseconds from a clock that returns fractions", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { clock: { now: () => world.clock.now() + 0.75 } })
    await vault.store('anthropic', 'sk-fake')
    expect(storedBundleOf(world)).to.include({ registered_at: world.clock.now() })
    expect(storedRowOf(world, 'anthropic')).to.include({ registered_at: world.clock.now(), changed_at: world.clock.now() })
  })

  it("refuses a stored lockbox or bundle whose time holds a fraction of a millisecond, leaving it as it is", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.store('anthropic', 'sk-fake')
    const box = JSON.stringify({ ...storedRowOf(world, 'anthropic'), changed_at: world.clock.now() + 0.5 })
    world.dbStore.write(u1BoxCkey('anthropic'), box)
    await TH.expectRefusal(vault.read('anthropic'), 'damaged_lockbox')
    expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.eq(box)
    const bundle = JSON.stringify({ ...storedBundleOf(world), registered_at: world.clock.now() + 0.5 })
    world.dbStore.write(u1BundleCkey, bundle)
    await TH.expectRefusal(world.open(), 'damaged_bundle')
    expect(world.dbStore.read(u1BundleCkey)).to.eq(bundle)
  })

  it("never quotes the boxlabel of a damaged lockbox it refuses, which a host's checks may let be any text", async () => {
    const world = makeWorld({ validators: AnyTextValidators })
    const vault = await world.openUnlocked('pw')
    const pasted = 'sk-ant-fake-pasted-as-a-label'
    await vault.store(pasted, 'sk-fake')
    await vault.store('other', 'sk-fake-two')
    const row = storedRowOf(world, pasted)
    world.dbStore.write(u1BoxCkey(pasted), JSON.stringify({ ...row, changed_at: world.clock.now() + 0.5 }))
    const storedDamaged = await TH.expectRefusal(vault.read(pasted), 'damaged_lockbox')
    // The other lockbox's ciphertext, moved under this boxlabel: it will not open here.
    world.dbStore.write(u1BoxCkey(pasted), JSON.stringify({ ...row, whisper_ciphered: storedRowOf(world, 'other')['whisper_ciphered'] }))
    const unopened = await TH.expectRefusal(vault.read(pasted), 'damaged_lockbox')
    expect(TH.thrownText(storedDamaged) + TH.thrownText(unopened)).to.not.include('sk-ant-fake')
  })

  it("refuses a stored lockbox from before its times were renamed, leaving it as it is", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.store('anthropic', 'sk-fake')
    const { registered_at: _registered, changed_at: _changed, ...row } = storedRowOf(world, 'anthropic')
    const olden = JSON.stringify({ ...row, created_at: '2026-10-14T00:00:00.000Z', updated_at: '2026-10-14T00:00:00.000Z' })
    world.dbStore.write(u1BoxCkey('anthropic'), olden)
    await TH.expectRefusal(vault.read('anthropic'), 'damaged_lockbox')
    expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.eq(olden)
  })

  it("refuses a stored bundle from before its time was renamed, leaving it as it is", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const { registered_at: _registered, ...row } = storedBundleOf(world)
    const olden = JSON.stringify({ ...row, created_at: '2026-10-14T00:00:00.000Z', updated_at: '2026-10-14T00:00:00.000Z' })
    world.dbStore.write(u1BundleCkey, olden)
    await TH.expectRefusal(world.open(), 'damaged_bundle')
    expect(world.dbStore.read(u1BundleCkey)).to.eq(olden)
  })
})

describe("the note", () => {
  it("is null in the summary of a lockbox that has none: never absent, never undefined", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.store('anthropic', 'sk-fake')
    const summary = TH.summaryOf(vault.getSnapshot().boxes[0])
    expect(summary).to.have.property('note')
    expect(summary?.note).to.be.null
  })

  it("is stored as no field at all when there is none, as it always was", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.store('anthropic', 'sk-fake')
    await vault.store('openai', 'sk-fake', { note: null })
    expect(storedRowOf(world, 'anthropic')).to.not.have.property('note')
    expect(storedRowOf(world, 'openai')).to.not.have.property('note')
  })

  it("null clears a note; leaving it out keeps the one standing", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.store('anthropic', 'sk-one', { note: 'work account' })
    await vault.store('anthropic', 'sk-two', { note: undefined })
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.note).to.eq('work account')
    await vault.store('anthropic', 'sk-three', { note: null })
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.note).to.be.null
    expect(storedRowOf(world, 'anthropic')).to.not.have.property('note')
    await vault.store('anthropic', 'sk-four')
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.note).to.be.null
  })

  it("takes the 256 characters a stored lockbox holds, and the summary hands back the same", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const longest = 'n'.repeat(256)
    await vault.store('anthropic', 'sk-fake', { note: longest })
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.note).to.eq(longest)
  })

  it("refuses a note the stored lockbox could not hold, with kind 'bad_option', writing nothing and quoting none of it", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const tooLong = `sk-ant-SUPERSECRET${'n'.repeat(256)}`
    const err = await TH.expectRefusal(vault.store('anthropic', 'sk-fake', { note: tooLong }), 'bad_option')
    expect(err.message).to.not.include('SUPERSECRET')
    await TH.expectRefusal(vault.store('anthropic', 'sk-fake', { note: 42 as unknown as string }), 'bad_option')
    expect(world.dbStore.ckeys().filter((ckey) => isU1Box(ckey))).to.have.lengthOf(0)
    // The vault is none the worse: it still lists, stores, and opens again.
    await vault.store('anthropic', 'sk-fake', { note: 'fits' })
    const again = await world.open()
    expect(again.getSnapshot().boxes.map((box) => TH.summaryOf(box)?.note)).to.deep.equal(['fits'])
  })

  it("follows the exported LockboxNote, so a host's form can check a note before store()", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const fits = 'n'.repeat(256)
    const overlong = 'n'.repeat(257)
    expect(LockboxNote.safeParse(fits).success).to.be.true
    await vault.store('anthropic', 'sk-fake', { note: fits })
    expect(LockboxNote.safeParse(overlong).success).to.be.false
    await TH.expectRefusal(vault.store('anthropic', 'sk-fake', { note: overlong }), 'bad_option')
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.note).to.eq(fits)
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
 * A lockbox row as a backend files it, with every field but the whisper at its largest: the
 * longest labels, a note of 256 UTF-16 code units and a user_id of 100, each at three UTF-8 bytes
 * apiece, the latest times, the longest vaultKey epoch, and real ciphertext of `whisperBytes` random bytes.
 */
const heaviestRowOf = async (whisperBytes: number) => {
  const binding = cipherBinding('a test binding')
  const lockboxKey = await makeLockboxKey()
  return {
    applabel:            'a'.repeat(40),
    user_id:             '\u{4E00}'.repeat(MaxUserIdChars),
    vaultlabel:          'v'.repeat(40),
    format:              'safebyok-lockbox-v2',
    boxlabel:            'b'.repeat(40),
    revision_id:         crypto.randomUUID(),
    vault_key_epoch:     Number.MAX_SAFE_INTEGER,
    lockbox_key_wrapped: await wrapKeyUnder(await makeVaultKey(), lockboxKey, binding),
    whisper_ciphered:    await cipherBytes(lockboxKey, randomBytes(whisperBytes), binding),
    note:                '\u{4E00}'.repeat(256),
    registered_at:       FarFuture,
    changed_at:          FarFuture,
  }
}

describe("the lockbox limit", () => {
  it("stores up to maxLockboxes, then refuses a new lockbox as 'vault_full', quoting none of its label", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { maxLockboxes: 2 })
    await vault.store('openai', 'sk-fake-one')
    await vault.store('anthropic', 'sk-ant-fake-two')
    const err = await TH.expectRefusal(vault.store('secret_project_x', 'sk-fake-three'), 'vault_full')
    expect(err.message).to.include('2 lockboxes')
    expect(err.message).to.not.include('secret_project_x')
    expect(boxlabelsOf(vault)).to.deep.equal(['anthropic', 'openai'])
    expect(world.dbStore.ckeys().filter((ckey) => ckey.includes('secret_project_x'))).to.have.lengthOf(0)
  })

  it("holds MaxLockboxes, 100, unless told otherwise", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    for (let ii = 0; ii < MaxLockboxes; ii++) { await vault.store(`box_${String(ii)}`, `sk-fake-${String(ii)}`) }
    expect(vault.getSnapshot().boxes).to.have.lengthOf(100)
    await TH.expectRefusal(vault.store('one_more', 'sk-fake'), 'vault_full')
  })

  it("never refuses a replacement for room: a full vault still takes a new whisper in a box it holds", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { maxLockboxes: 1 })
    await vault.store('openai', 'sk-fake-old')
    await vault.store('openai', 'sk-fake-new')
    expect(await vault.read('openai')).to.eq('sk-fake-new')
  })

  it("an erase makes room for the next new lockbox", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { maxLockboxes: 1 })
    await vault.store('openai', 'sk-fake-one')
    await TH.expectRefusal(vault.store('anthropic', 'sk-ant-fake'), 'vault_full')
    await vault.erase('openai')
    await vault.store('anthropic', 'sk-ant-fake')
    expect(boxlabelsOf(vault)).to.deep.equal(['anthropic'])
  })

  it("checks the limit on a new lockbox only, so lowering it strands nothing already stored", async () => {
    const world = makeWorld()
    const roomy = await world.openUnlocked('pw')
    for (const boxlabel of ['one', 'two', 'three']) { await roomy.store(boxlabel, `sk-fake-${boxlabel}`) }
    roomy.close()
    const tight = await world.open({ maxLockboxes: 2 })
    expect(await tight.read('three')).to.eq('sk-fake-three')
    await tight.store('three', 'sk-fake-replaced')
    await tight.erase('one')
    await TH.expectRefusal(tight.store('four', 'sk-fake-four'), 'vault_full')
    await tight.erase('two')
    await tight.store('four', 'sk-fake-four')
    expect(boxlabelsOf(tight)).to.deep.equal(['four', 'three'])
  })

  it("counts the lockboxes other devices have stored", async () => {
    const world = makeWorld()
    const here = await world.openUnlocked('pw', { maxLockboxes: 2 })
    const there = await world.open()
    await there.store('openai', 'sk-fake-one')
    await there.store('anthropic', 'sk-ant-fake-two')
    await vi.waitFor(() => { expect(here.getSnapshot().boxes).to.have.lengthOf(2) })
    await TH.expectRefusal(here.store('mistral', 'sk-fake-three'), 'vault_full')
  })

  it("catches up with storage before refusing: room another device made unheard is found", async () => {
    const world = makeWorld()
    // This handle hears nothing pushed from storage, so its snapshot falls behind.
    vi.spyOn(world.vaultDB, 'subscribe').mockReturnValueOnce(() => { /* nothing to unsubscribe */ })
    const here = await world.openUnlocked('pw', { maxLockboxes: 1 })
    await here.store('openai', 'sk-fake-one')
    const there = await world.open()
    await there.erase('openai')
    expect(boxlabelsOf(here)).to.deep.equal(['openai'])
    await here.store('anthropic', 'sk-ant-fake')
    expect(boxlabelsOf(here)).to.deep.equal(['anthropic'])
  })

  it("opens with the defaults on a backend holding 8 MiB of a vault, as Convex does", async () => {
    const world = makeWorld()
    expect(await world.stateOnOpen({ vaultDB: declaringVaultBytes(world.vaultDB, 8 * 1024 * 1024) })).to.eq('absent')
  })

  it("refuses a maxLockboxes and maxWhisperBytes the adapter might not hold together, naming both and its limit", async () => {
    const world = makeWorld()
    const vaultDB = declaringVaultBytes(world.vaultDB, 8 * 1024 * 1024)
    const err = await TH.expectRefusal(world.open({ vaultDB, maxLockboxes: 102 }), 'bad_option')
    expect(err.message).to.include('maxLockboxes')
    expect(err.message).to.include('maxWhisperBytes')
    expect(err.message).to.include('8388608 bytes')
    expect(err.message).to.include('at most 101 lockboxes')
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
    await world.open({ vaultDB, maxLockboxes: 4092, maxWhisperBytes: 1 })
    await TH.expectRefusal(world.open({ vaultDB, maxLockboxes: 4093, maxWhisperBytes: 1 }), 'bad_option')
  })

  for (const whisperBytes of [1, 2, 3, 100, 2048, MaxWhisperBytes]) {
    it(`counts room enough for a lockbox of ${String(whisperBytes)} whisper bytes, its other fields at their largest`, async () => {
      const row = await heaviestRowOf(whisperBytes)
      expect(Lockbox.safeParse(row).success).to.be.true
      expect(VaultScope.safeParse(row).success).to.be.true
      const rowBytes = new TextEncoder().encode(JSON.stringify(row)).length
      expect(rowBytes).to.be.at.most((whisperBytes * StoredBytesPerWhisperByte) + LockboxFieldsBytes)
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
    await vault.store('openai', 'sk-fake-one')
    await vault.store('anthropic', 'sk-ant-fake-two')
    const err = await TH.expectRefusal(vault.store('mistral', 'sk-fake-three'), 'vault_full')
    expect(err.message).to.include('2 lockboxes')
  })

  it("holds MaxLockboxes, unless told otherwise, on an adapter holding more", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { vaultDB: declaringLockboxes(world.vaultDB, 8000) })
    for (let ii = 0; ii < MaxLockboxes; ii++) { await vault.store(`box_${String(ii)}`, `sk-fake-${String(ii)}`) }
    const err = await TH.expectRefusal(vault.store('one_more', 'sk-fake'), 'vault_full')
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

  it("takes an adapter's Infinity, for no limit, as the largest finite limit, so nothing past openVault holds Infinity", async () => {
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
 * label and the note's 2000, written in classic Zod, as most hosts write it.
 */
const AnyScript = {
  applabel:   ZClassic.string().min(1).max(200),
  vaultlabel: ZClassic.string().min(1).max(200),
  boxlabel:   ZClassic.string().min(1).max(200),
  note:       ZClassic.string().max(2000),
}

/** Labels no default check admits: punctuation the ckeys and binding once leaned on, and Hebrew, Arabic and Thai text. */
const ScriptLabels = ['OpenAI: work', String.raw`say "hi", \ [ok]`, 'מפתח API של העבודה', 'مفتاح العمل', 'กุญแจงาน', 'Mixed: English, עברית, العربية, ไทย'] as const

describe("the host's validators", () => {
  it("replace ours outright: a vault keeps labels and notes in any script, and reads each back", async () => {
    const world = makeWorld({ validators: AnyScript, applabel: 'Acme: אקמה', vaultlabel: 'ราก' })
    const vault = await world.openUnlocked('pw')
    for (const [ii, boxlabel] of ScriptLabels.entries()) {
      await vault.store(boxlabel, `sk-fake-${String(ii)}`, { note: `${boxlabel} — ${'ノート'.repeat(100)}` })
    }
    expect(boxlabelsOf(vault)).to.have.members([...ScriptLabels])
    for (const [ii, boxlabel] of ScriptLabels.entries()) {
      expect(await vault.read(boxlabel)).to.eq(`sk-fake-${String(ii)}`)
    }
    await vault.erase(ScriptLabels[0])
    expect(boxlabelsOf(vault)).to.not.include(ScriptLabels[0])
    vault.close()
    const again = await world.openUnlocked('pw')
    expect(boxlabelsOf(again)).to.have.lengthOf(ScriptLabels.length - 1)
  })

  it("take AnyTextValidators whole, as its example shows: any text at all names a vault and its lockboxes", async () => {
    const world = makeWorld({ validators: AnyTextValidators })
    const vault = await world.openUnlocked('pw', { applabel: '', userId: '', vaultlabel: 'Main vault' })
    await vault.store('', 'sk-fake', { note: 'n'.repeat(5000) })
    await vault.store(String.raw`["box","acme"] \ x`, 'sk-fake-two')
    expect(await vault.read('')).to.eq('sk-fake')
    expect(boxlabelsOf(vault)).to.have.lengthOf(2)
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
    const world = makeWorld({ validators: { note: AnyScript.note } })
    const vault = await world.openUnlocked('pw')
    await TH.expectRefusal(vault.store('Not A Label', 'sk-fake'), 'bad_label')
    await vault.store('anthropic', 'sk-fake', { note: 'n'.repeat(2000) })
    await TH.expectRefusal(world.open({ applabel: 'Acme' }), 'bad_label')
  })

  it("take a mini schema as readily as a classic one", async () => {
    const world = makeWorld({ validators: { boxlabel: Z.string().check(Z.minLength(1), Z.maxLength(80)) } })
    const vault = await world.openUnlocked('pw')
    await vault.store('Anthropic API key', 'sk-fake')
    expect(await vault.read('Anthropic API key')).to.eq('sk-fake')
  })

  it("only check: what the vault keeps and binds is what it was handed, never what a schema made of it", async () => {
    const trimming = { boxlabel: ZClassic.string().trim().toLowerCase().min(1), userId: ZClassic.string().trim().min(1) }
    const world = makeWorld({ validators: trimming })
    const vault = await world.openUnlocked('pw', { userId: '  U1  ' })
    expect(vault.getSnapshot().scope.user_id).to.eq('  U1  ')
    await vault.store('  Padded Box  ', 'sk-fake')
    expect(boxlabelsOf(vault)).to.deep.equal(['  Padded Box  '])
    expect(await vault.read('  Padded Box  ')).to.eq('sk-fake')
    await TH.expectRefusal(vault.read('padded box'), 'absent_box')
  })

  it("refuse a note the host's check refuses as 'bad_option', quoting none of it", async () => {
    const world = makeWorld({ validators: { note: ZClassic.string().max(10) } })
    const vault = await world.openUnlocked('pw')
    const err = await TH.expectRefusal(vault.store('anthropic', 'sk-fake', { note: 'sk-not-for-a-note' }), 'bad_option')
    expect(err.message).to.include('note')
    expect(TH.thrownText(err)).to.not.include('sk-not-for-a-note')
    await vault.store('anthropic', 'sk-fake', { note: null })
  })

  it("never pass a host schema's issues along, which may quote the name", async () => {
    const quoting = ZClassic.string().refine(() => false, { error: (issue) => `no such label ${String(issue.input)}` })
    const world = makeWorld({ validators: { boxlabel: quoting } })
    const vault = await world.openUnlocked('pw')
    const err = await TH.expectRefusal(vault.store('secret_project_x', 'sk-fake'), 'bad_label')
    expect(TH.thrownText(err)).to.not.include('secret_project_x')
  })

  it("refuse an async check, or one that throws, as misuse", async () => {
    const world = makeWorld()
    const asyncCheck = ZClassic.string().refine(async () => { await TH.wakeupAtNextTick(); return true })
    await TH.expectRefusal(world.open({ validators: { applabel: asyncCheck } }), 'bad_option')
    const throwing = ZClassic.string().refine(() => { throw new Error('the host check fell over') })
    const vault = await world.openUnlocked('pw', { validators: { boxlabel: throwing } })
    await TH.expectRefusal(vault.store('anthropic', 'sk-fake'), 'bad_option')
  })

  it("reach every VaultDB verb the vault calls, so no write meets the defaults in their place", async () => {
    const longUserId = ZClassic.string().min(1).max(300)
    const world = makeWorld({ validators: { userId: longUserId }, userId: 'u'.repeat(200) })
    const verbs = ['readBundle', 'createBundle', 'updateBundle', 'readBox', 'listBoxes', 'updateBox', 'eraseBox', 'eraseVault', 'subscribe'] as const
    const spies = verbs.map((verb) => vi.spyOn(world.vaultDB, verb))
    const vault = await world.openUnlocked('pw one')
    await vault.store('anthropic', 'sk-fake')
    expect(await vault.read('anthropic')).to.eq('sk-fake')
    await vault.changePassphrase('pw one', 'pw two')
    await vault.erase('anthropic')
    await vault.destroy()
    for (const [ii, spy] of spies.entries()) {
      expect(spy.mock.calls.length, verbs[ii]).to.be.above(0)
      for (const args of spy.mock.calls) {
        expect((args.at(-1) as VaultValidators | undefined)?.userId, verbs[ii]).to.eq(longUserId)
      }
    }
  })

  it("refuse a bag holding anything but schemas, or a field the bag does not know, before storage is touched", async () => {
    const world = makeWorld()
    const readBundle = vi.spyOn(world.vaultDB, 'readBundle')
    const misfits = ['acme', 42, { boxlabel: 'Label' }, { boxlabel: /^[a-z]+$/ }, { boxLabel: ZClassic.string() }, { userID: ZClassic.string() }]
    for (const validators of misfits) {
      const err = await TH.expectRefusal(world.open({ validators: validators as unknown as OpenVaultOpts['validators'] }), 'bad_option')
      expect(err.message).to.include('validators')
    }
    expect(readBundle).not.toHaveBeenCalled()
    expect(await world.stateOnOpen({ validators: undefined })).to.eq('absent')
    expect(await world.stateOnOpen({ validators: { boxlabel: undefined } })).to.eq('absent')
  })

  it("check every lockbox read back: one stored with a note the vault's checks refuse lists as damaged, and reads as damaged_lockbox", async () => {
    const world = makeWorld()
    const roomy = await world.openUnlocked('pw', { validators: AnyScript })
    await roomy.store('anthropic', 'sk-fake', { note: 'n'.repeat(300) })
    roomy.close()
    // The default note check refuses a note of 300 characters: narrowing the checks strands it.
    const narrow = await world.open()
    expect(narrow.getSnapshot().boxes).to.deep.equal([{ boxlabel: 'anthropic', damaged: true }])
    await TH.expectRefusal(narrow.read('anthropic'), 'damaged_lockbox')
    await narrow.unlock('pw')
    await narrow.store('anthropic', 'sk-new')
    expect(TH.summaryOf(narrow.getSnapshot().boxes[0])?.note).to.be.null
    expect(await narrow.read('anthropic')).to.eq('sk-new')
  })

  it("lists a lockbox stored under a boxlabel narrowed checks refuse as damaged, and erase() removes it by that name", async () => {
    const world = makeWorld()
    const roomy = await world.openUnlocked('pw', { validators: AnyScript })
    await roomy.store('OpenAI: work', 'sk-fake')
    await roomy.store('anthropic', 'sk-ant-fake')
    roomy.close()
    const narrow = await world.openUnlocked('pw')
    expect(narrow.getSnapshot().boxes.map((box) => [box.boxlabel, box.damaged])).to.deep.equal([['anthropic', false], ['OpenAI: work', true]])
    await TH.expectRefusal(narrow.read('OpenAI: work'), 'bad_label')
    await narrow.erase('OpenAI: work')
    expect(world.dbStore.read(u1BoxCkey('OpenAI: work'))).to.be.null
    expect(boxlabelsOf(narrow)).to.deep.equal(['anthropic'])
  })

  it("erase() reads storage once for the lockbox it erases, under a refused boxlabel or a passing one", async () => {
    const world = makeWorld()
    const roomy = await world.openUnlocked('pw', { validators: AnyScript })
    await roomy.store('OpenAI: work', 'sk-fake')
    await roomy.store('anthropic', 'sk-ant-fake')
    roomy.close()
    const narrow = await world.openUnlocked('pw')
    const readBox = vi.spyOn(world.vaultDB, 'readBox')
    await narrow.erase('OpenAI: work')
    expect(readBox.mock.calls).to.have.lengthOf(1)
    await narrow.erase('anthropic')
    expect(readBox.mock.calls).to.have.lengthOf(2)
    await TH.expectRefusal(narrow.erase('OpenAI: work'), 'bad_label')
    expect(readBox.mock.calls).to.have.lengthOf(3)
    expect(boxlabelsOf(narrow)).to.deep.equal([])
  })

  it("check each new way in's unlocklabel with the host's unlocklabel check, at addPassphrase and addPasskey", async () => {
    const world = makeWorld({ validators: { unlocklabel: ZClassic.string().min(1).max(60) } })
    const vault = await world.openUnlocked('pw')
    await vault.addPassphrase('pw', 'pw two', { unlocklabel: 'Written down, in the drawer' })
    await vault.addPasskey('pw', () => TH.passkeyOf('laptop'), { unlocklabel: 'Laptop: fingerprint' })
    expect(unlocklabelsOf(vault)).to.deep.equal(['passphrase', 'Written down, in the drawer', 'Laptop: fingerprint'])
    const err = await TH.expectRefusal(vault.addPassphrase('pw', 'pw three', { unlocklabel: 'u'.repeat(61) }), 'bad_label')
    expect(err.message).to.include('unlocklabel')
    expect(err.message).to.not.include('uuu')
    const makePasskey = vi.fn(() => TH.passkeyOf('phone'))
    await TH.expectRefusal(vault.addPasskey('pw', makePasskey, { unlocklabel: '' }), 'bad_label')
    expect(makePasskey).not.toHaveBeenCalled()
    expect(unlocklabelsOf(vault)).to.have.lengthOf(3)
  })

  it("refuse a taken unlocklabel or passkey, under a host's check that admits any text, quoting no unlocklabel", async () => {
    const vault = await makeWorld({ validators: { unlocklabel: ZClassic.string() } }).openUnlocked('pw')
    await vault.addPassphrase('pw', 'pw two', { unlocklabel: 'sk-ant-fake-pasted-phrase' })
    await vault.addPasskey('pw', () => TH.passkeyOf('laptop'), { unlocklabel: 'sk-ant-fake-pasted-passkey' })
    const takenLabel = await TH.expectRefusal(vault.addPassphrase('pw', 'pw three', { unlocklabel: 'sk-ant-fake-pasted-phrase' }), 'bad_label')
    expect(TH.thrownText(takenLabel)).to.not.include('sk-ant-fake')
    const takenPasskey = await TH.expectRefusal(vault.addPasskey('pw', () => TH.passkeyOf('laptop'), { unlocklabel: 'laptop_again' }), 'bad_option')
    expect(TH.thrownText(takenPasskey)).to.not.include('sk-ant-fake')
    expect(unlocklabelsOf(vault)).to.have.lengthOf(3)
  })

  it("refuse an empty unlocklabel as bad_label, though the host's unlocklabel check admits it", async () => {
    const vault = await makeWorld({ validators: AnyTextValidators }).openUnlocked('pw')
    await TH.expectRefusal(vault.addPassphrase('pw', 'pw two', { unlocklabel: '' }), 'bad_label')
    const makePasskey = vi.fn(() => TH.passkeyOf('phone'))
    await TH.expectRefusal(vault.addPasskey('pw', makePasskey, { unlocklabel: '' }), 'bad_label')
    expect(makePasskey).not.toHaveBeenCalled()
    expect(unlocklabelsOf(vault)).to.deep.equal(['passphrase'])
  })

  it("check an unlocklabel with Label when the host gives no unlocklabel check, saying what was wrong", async () => {
    const vault = await makeWorld({ validators: AnyScript }).openUnlocked('pw')
    const err = await TH.expectRefusal(vault.addPassphrase('pw', 'pw two', { unlocklabel: 'Written down' }), 'bad_label')
    expect(err.message).to.include('lowercase')
    expect(unlocklabelsOf(vault)).to.deep.equal(['passphrase'])
  })

  it("leave a way in stored under an unlocklabel narrowed checks refuse opening the vault, listed as it is", async () => {
    const world = makeWorld()
    const roomy = await world.openUnlocked('pw', { validators: { unlocklabel: ZClassic.string() } })
    await roomy.addPassphrase('pw', 'home pw', { unlocklabel: 'Home phrase' })
    roomy.close()
    const narrow = await world.open({ deviceDB: memoryDeviceDB() })
    expect(unlocklabelsOf(narrow)).to.deep.equal(['passphrase', 'Home phrase'])
    await narrow.unlock('home pw')
    expect(narrow.getSnapshot().state).to.eq('unlocked')
  })

  it("name a vault's first way in 'passphrase' whatever the host's unlocklabel check, which checks only the ways in it adds", async () => {
    const world = makeWorld({ validators: { unlocklabel: ZClassic.string().startsWith('my_') } })
    const vault = await world.openUnlocked('pw')
    expect(unlocklabelsOf(vault)).to.deep.equal(['passphrase'])
    await TH.expectRefusal(vault.addPassphrase('pw', 'pw two', { unlocklabel: 'spare' }), 'bad_label')
    await vault.addPassphrase('pw', 'pw two', { unlocklabel: 'my_spare' })
    expect(unlocklabelsOf(vault)).to.deep.equal(['passphrase', 'my_spare'])
  })

  it("erase() reaches a lockbox the host's own check let stand under a name holding a lone surrogate", async () => {
    const world = makeWorld({ validators: { boxlabel: ZClassic.string() } })
    const vault = await world.openUnlocked('pw')
    await vault.store('key \u{D83D}', 'sk-fake')
    expect(boxlabelsOf(vault)).to.deep.equal(['key \u{D83D}'])
    await vault.erase('key \u{D83D}')
    expect(world.dbStore.read(u1BoxCkey('key \u{D83D}'))).to.be.null
    expect(boxlabelsOf(vault)).to.deep.equal([])
  })

  it("refuses a store under a refused boxlabel as 'bad_label', over a lockbox stored there or not, writing nothing", async () => {
    const world = makeWorld()
    const roomy = await world.openUnlocked('pw', { validators: AnyScript })
    await roomy.store('OpenAI: work', 'sk-fake', { note: 'personal account' })
    roomy.close()
    const stored = world.dbStore.read(u1BoxCkey('OpenAI: work'))
    const narrow = await world.openUnlocked('pw')
    await TH.expectRefusal(narrow.store('OpenAI: work', 'sk-new'), 'bad_label')
    expect(world.dbStore.read(u1BoxCkey('OpenAI: work'))).to.eq(stored)
    expect(narrow.getSnapshot().boxes).to.deep.equal([{ boxlabel: 'OpenAI: work', damaged: true }])
    await TH.expectRefusal(narrow.store('Other: box', 'sk-fake'), 'bad_label')
    await TH.expectRefusal(narrow.erase('Other: box'), 'bad_label')
    expect(world.dbStore.read(u1BoxCkey('Other: box'))).to.be.null
  })
})

/** `vaultDB` declaring `maxRecordBytes` as given, and otherwise itself. */
const declaringRecordBytes = (vaultDB: VaultDB, maxRecordBytes: number): VaultDB => (
  Object.create(vaultDB, { maxRecordBytes: { value: maxRecordBytes } }) as VaultDB
)

describe("what a lockbox weighs in storage", () => {
  it("refuses, as 'lockbox_too_large', a lockbox heavier than storage holds in one record, writing nothing", async () => {
    const world = makeWorld({ validators: { note: ZClassic.string() } })
    const vaultDB = declaringRecordBytes(world.vaultDB, 4096)
    const vault = await world.openUnlocked('pw', { vaultDB, maxWhisperBytes: 1024 })
    await vault.store('anthropic', 'sk-fake', { note: 'n'.repeat(3000) })
    const err = await TH.expectRefusal(vault.store('openai', 'sk-fake', { note: 'n'.repeat(4000) }), 'lockbox_too_large')
    expect(err.message).to.include('4096')
    expect(boxlabelsOf(vault)).to.deep.equal(['anthropic'])
  })

  it("refuses, as 'vault_full', a lockbox whose names and note would take the vault past what storage holds of it", async () => {
    const world = makeWorld({ validators: AnyScript })
    // Room for three lockboxes of the default fields' plan, each a whisper of 1000 bytes.
    const vaultDB = declaringVaultBytes(world.vaultDB, 3 * ((1000 * StoredBytesPerWhisperByte) + LockboxFieldsBytes))
    const vault = await world.openUnlocked('pw', { vaultDB, maxWhisperBytes: 1000, maxLockboxes: 3 })
    await vault.store('one', 'sk-fake', { note: 'n'.repeat(1500) })
    await vault.store('two', 'sk-fake', { note: 'n'.repeat(1500) })
    const err = await TH.expectRefusal(vault.store('three', 'sk-fake', { note: 'n'.repeat(2000) }), 'vault_full')
    expect(err.message).to.include('shorter note')
    expect(boxlabelsOf(vault)).to.deep.equal(['one', 'two'])
    await vault.store('three', 'sk-fake', { note: 'short' })
    expect(boxlabelsOf(vault)).to.deep.equal(['one', 'three', 'two'])
  })

  it("never refuses a replacement no heavier than what it replaces, even in a vault over its limit", async () => {
    const world = makeWorld({ validators: AnyScript })
    const roomy = await world.openUnlocked('pw')
    await roomy.store('one', 'sk-fake', { note: 'n'.repeat(1900) })
    await roomy.store('two', 'sk-fake', { note: 'n'.repeat(1900) })
    roomy.close()
    const vaultDB = declaringVaultBytes(world.vaultDB, 2 * ((1000 * StoredBytesPerWhisperByte) + LockboxFieldsBytes))
    const tight = await world.open({ vaultDB, maxWhisperBytes: 1000, maxLockboxes: 2 })
    await tight.store('one', 'sk-fake-new')
    await tight.store('two', 'sk-fake-new', { note: 'shorter' })
    await TH.expectRefusal(tight.store('two', 'sk-fake-new', { note: 'n'.repeat(1990) }), 'vault_full')
  })

  for (const whisperBytes of [1, 2, 3, 100, 2048]) {
    it(`weighs a lockbox of ${String(whisperBytes)} whisper bytes, its names at their longest, at no less than it stores as`, async () => {
      const row = await heaviestRowOf(whisperBytes)
      const { applabel, user_id, vaultlabel, boxlabel, note } = row
      const weight = (whisperBytes * StoredBytesPerWhisperByte) + LockboxFixedBytes + jsonBytes([{ applabel, user_id, vaultlabel }, boxlabel, note])
      expect(jsonBytes(row)).to.be.at.most(weight)
    })
  }

  it("plans no less at openVault than a store weighs a lockbox at the default checks' longest", async () => {
    const { applabel, user_id, vaultlabel, boxlabel, note } = await heaviestRowOf(1)
    expect(LockboxFixedBytes + jsonBytes([{ applabel, user_id, vaultlabel }, boxlabel, note])).to.be.at.most(LockboxFieldsBytes)
  })
})

describe("while locked", () => {
  it("every whisper-touching operation refuses with kind 'vault_locked'", async () => {
    const world = makeWorld()
    const warm = await world.openUnlocked('pw')
    await warm.store('anthropic', 'sk-fake')
    await warm.lock()
    await TH.expectRefusal(warm.read('anthropic'), 'vault_locked')
    await TH.expectRefusal(warm.store('anthropic', 'sk-new'), 'vault_locked')
    await TH.expectRefusal(warm.use('anthropic', (whisper) => whisper), 'vault_locked')
    await TH.expectRefusal(warm.erase('anthropic'), 'vault_locked')
  })

  it("lockbox summaries stay readable: that is what public metadata is for", async () => {
    const world = makeWorld()
    const warm = await world.openUnlocked('pw')
    await warm.store('anthropic', 'sk-fake', { note: 'visible while locked' })
    await warm.lock()
    const cold = await world.open()
    expect(cold.getSnapshot().state).to.eq('locked')
    expect(boxlabelsOf(cold)).to.deep.equal(['anthropic'])
  })
})

describe("use", () => {
  it("hands the whisper to the callback and returns its result", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.store('anthropic', 'sk-fake')
    const shouted = await vault.use('anthropic', (whisper) => (typeof whisper === 'string' ? whisper.toUpperCase() : ''))
    expect(shouted).to.eq('SK-FAKE')
  })

  it("passes an async callback's rejection through untouched", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.store('anthropic', 'sk-fake')
    await expect(vault.use('anthropic', () => Promise.reject(new Error('the API said no')))).rejects.toThrow('the API said no')
  })

  it("refuses a callback that is not a function before it opens the lockbox", async () => {
    const world = makeWorld()
    const vault = await world.open()
    const err = await TH.expectRefusal(vault.use('anthropic', 'not a callback' as unknown as () => void), 'bad_option')
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

describe("erase and destroy", () => {
  for (const [spoil, blurb] of SpoiledBoxes) {
    it(`erase removes a lockbox ${blurb}, and leaves the vault's other boxes as they were`, async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw')
      await vault.store('anthropic', 'sk-ant-fake')
      await vault.store('openai', 'sk-openai-fake', { note: 'work account' })
      world.dbStore.write(u1BoxCkey('anthropic'), spoil(storedRowOf(world, 'anthropic')))
      await TH.expectRefusal(vault.read('anthropic'), 'damaged_lockbox')
      await vault.erase('anthropic')
      expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.be.null
      expect(boxlabelsOf(vault)).to.deep.equal(['openai'])
      expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.note).to.eq('work account')
      expect(await vault.read('openai')).to.eq('sk-openai-fake')
    })
  }

  it("erase of a lockbox that fails verification still needs the vault unlocked, and leaves it as it is", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.store('anthropic', 'sk-ant-fake')
    const [spoil] = SpoiledBoxes[0]
    const spoiled = spoil(storedRowOf(world, 'anthropic'))
    world.dbStore.write(u1BoxCkey('anthropic'), spoiled)
    await vault.lock()
    await TH.expectRefusal(vault.erase('anthropic'), 'vault_locked')
    expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.eq(spoiled)
  })

  it("erase removes the box; a second erase finds it absent", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.store('anthropic', 'sk-fake')
    await vault.erase('anthropic')
    expect(vault.getSnapshot().boxes).to.have.lengthOf(0)
    await TH.expectRefusal(vault.erase('anthropic'), 'absent_box')
  })

  it("destroy removes every trace of this vault, and only this vault", async () => {
    const world = makeWorld()
    const mine = await world.openUnlocked('my pw')
    await mine.store('anthropic', 'mine')
    const theirs = await world.openUnlocked('their pw', { userId: 'u2' })
    await theirs.store('anthropic', 'theirs')

    await mine.destroy()
    expect(mine.getSnapshot().state).to.eq('absent')
    expect(world.dbStore.ckeys().filter((ckey) => ckey.includes(':u1:'))).to.have.lengthOf(0)
    expect(await theirs.read('anthropic')).to.eq('theirs')
  })

  it("destroy works on a locked vault: owning the account is enough to delete it", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.store('anthropic', 'sk-fake')
    await vault.lock()
    await vault.destroy()
    expect(vault.getSnapshot().state).to.eq('absent')
  })

  it("destroy on a vault already gone is quiet: a second destroy finds nothing to refuse", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.destroy()
    await vault.unlock('pw')
    await vault.destroy()
    await vault.destroy()
    expect(vault.getSnapshot().state).to.eq('absent')
  })
})

/** The ckeys of every row `userId`'s vault has in storage: its bundle and its lockboxes. */
const rowsOf = (world: ReturnType<typeof makeWorld>, userId: string) => (
  world.dbStore.ckeys().filter((ckey) => ckey === Ckeys.bundle(TH.scopeOf(userId)) || Ckeys.isBoxIn(TH.scopeOf(userId))(ckey))
)

/** A world whose `u1` vault, with a lockbox and a remembered unlock, has had its stored bundle spoiled. */
const damagedVaultWorld = async () => {
  const world = makeWorld()
  const vault = await world.openUnlocked('pw')
  await vault.store('anthropic', 'sk-fake')
  vault.close()
  world.dbStore.write(u1BundleCkey, JSON.stringify({ ...storedBundleOf(world), unlock_epoch: 'one' }))
  return world
}

/** The verbs openVault asks of a VaultDB, and so all a duck-typed one has. */
const OpenVaultVerbs = ['readBundle', 'createBundle', 'updateBundle', 'readBox', 'listBoxes', 'updateBox', 'eraseBox', 'eraseVault', 'subscribe'] as const

describe("eraseDamagedVault", () => {
  it("clears a vault that openVault refuses as damaged_bundle -- its bundle, its lockboxes and the unlock this device remembers -- so a new one can be made", async () => {
    const world = await damagedVaultWorld()
    expect(await world.rememberedUnlock()).to.not.be.null
    await TH.expectRefusal(world.open(), 'damaged_bundle')
    await eraseDamagedVault(world.optsWith())
    expect(rowsOf(world, 'u1')).to.deep.equal([])
    expect(await world.rememberedUnlock()).to.be.null
    const fresh = await world.open()
    expect(fresh.getSnapshot().state).to.eq('absent')
    await fresh.unlock('another pw')
    await fresh.store('anthropic', 'sk-new-fake')
    expect(await fresh.read('anthropic')).to.eq('sk-new-fake')
  })

  it("erases that vault alone: another user's vault, and the unlock this device remembers for it, stay", async () => {
    const world = await damagedVaultWorld()
    const theirs = await world.openUnlocked('their pw', { userId: 'u2' })
    await theirs.store('anthropic', 'theirs')
    await eraseDamagedVault(world.optsWith())
    expect(await theirs.read('anthropic')).to.eq('theirs')
    expect(await world.deviceDB.readUnlock(TH.scopeOf('u2'))).to.not.be.null
    expect(rowsOf(world, 'u2')).to.not.deep.equal([])
  })

  it("refuses a vault that stands sound, erasing nothing from storage or the device: that one is destroy()'s", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.store('anthropic', 'sk-fake')
    const before = world.dbStore.ckeys().map((ckey) => [ckey, world.dbStore.read(ckey)])
    const remembered = await world.rememberedUnlock()
    const err = await TH.expectRefusal(eraseDamagedVault(world.optsWith()), 'bad_option')
    expect(err.message).to.include('destroy()')
    expect(world.dbStore.ckeys().map((ckey) => [ckey, world.dbStore.read(ckey)])).to.deep.equal(before)
    expect(await world.rememberedUnlock()).to.deep.equal(remembered)
    expect(await vault.read('anthropic')).to.eq('sk-fake')
  })

  it("refuses a bundle too damaged to name its vault, erasing nothing, the remembered unlock included", async () => {
    const world = await damagedVaultWorld()
    world.dbStore.write(u1BundleCkey, '{"format":"safebyok-vault-v1"}')
    const err = await TH.expectRefusal(eraseDamagedVault(world.optsWith()), 'damaged_bundle')
    expect(err.message).to.include('nothing was erased')
    expect(world.dbStore.read(u1BundleCkey)).to.eq('{"format":"safebyok-vault-v1"}')
    expect(world.dbStore.ckeys().some((ckey) => isU1Box(ckey))).to.eq(true)
    expect(await world.rememberedUnlock()).to.not.be.null
  })

  it("refuses a vault a newer safebyok may have written, as openVault sees it damaged: nothing erased, the remembered unlock kept", async () => {
    const world = await damagedVaultWorld()
    const newer = JSON.stringify({ ...storedBundleOf(world), format: 'safebyok-vault-v3' })
    world.dbStore.write(u1BundleCkey, newer)
    await TH.expectRefusal(world.open(), 'damaged_bundle')
    const err = await TH.expectRefusal(eraseDamagedVault(world.optsWith()), 'damaged_bundle')
    expect(err.message).to.include('newer version')
    expect(world.dbStore.read(u1BundleCkey)).to.eq(newer)
    expect(world.dbStore.ckeys().some((ckey) => isU1Box(ckey))).to.eq(true)
    expect(await world.rememberedUnlock()).to.not.be.null
  })

  it("with no vault stored, clears only a leftover remembered unlock, and a call cut short by the device can be made again", async () => {
    const world = await damagedVaultWorld()
    let failures = 1
    const flakyDevice: DeviceDB = {
      ...world.deviceDB,
      eraseUnlock: async (scope) => {
        if (failures > 0) { failures -= 1; throw new Error('device store is busy') }
        await world.deviceDB.eraseUnlock(scope)
      },
    }
    await expect(eraseDamagedVault(world.optsWith({ deviceDB: flakyDevice }))).rejects.toThrow('busy')
    expect(rowsOf(world, 'u1')).to.deep.equal([])
    expect(await world.rememberedUnlock()).to.not.be.null
    await eraseDamagedVault(world.optsWith({ deviceDB: flakyDevice }))
    expect(await world.rememberedUnlock()).to.be.null
  })

  it("lets a vault made anew since survive: stale_write, the new vault and its unlock untouched", async () => {
    const world = await damagedVaultWorld()
    // Storage answers the first look at the bundle with the damaged vault, and every later one with another.
    let looks = 0
    const replacing = localVaultDB({
      ...world.dbStore,
      read: (ckey) => {
        if (ckey !== u1BundleCkey) { return world.dbStore.read(ckey) }
        looks += 1
        return looks === 1 ? world.dbStore.read(ckey) : JSON.stringify({ ...storedBundleOf(world), vault_id: 'made-anew' })
      },
    })
    await TH.expectRefusal(eraseDamagedVault(world.optsWith({ vaultDB: replacing })), 'stale_write')
    expect(world.dbStore.ckeys().some((ckey) => isU1Box(ckey))).to.eq(true)
    expect(await world.rememberedUnlock()).to.not.be.null
  })

  it("hands the vault's validators to the VaultDB's verb, and refuses a misspelt bag as openVault does", async () => {
    const world = await damagedVaultWorld()
    const longUserId = ZClassic.string().min(1).max(300)
    const verb = vi.spyOn(world.vaultDB, 'eraseDamagedVault')
    await TH.expectRefusal(eraseDamagedVault(world.optsWith({ validators: { userID: longUserId } as unknown as OpenVaultOpts['validators'] })), 'bad_option')
    expect(verb).not.toHaveBeenCalled()
    await eraseDamagedVault(world.optsWith({ validators: { userId: longUserId } }))
    expect((verb.mock.calls[0]?.at(-1) as VaultValidators | undefined)?.userId).to.eq(longUserId)
    expect(rowsOf(world, 'u1')).to.deep.equal([])
  })

  it("takes the options openVault took, and refuses misuse before touching storage", async () => {
    const world = await damagedVaultWorld()
    await TH.expectRefusal(eraseDamagedVault(world.optsWith({ applabel: 'not-a-label' })), 'bad_label')
    await TH.expectRefusal(eraseDamagedVault(world.optsWith({ userId: '' })), 'bad_label')
    await TH.expectRefusal(eraseDamagedVault(null as unknown as OpenVaultOpts), 'bad_option')
    for (const [misfit] of MisfitStores) {
      await TH.expectRefusal(eraseDamagedVault(world.optsWith(misfit)), 'bad_option')
    }
    const withoutTheVerb = Object.fromEntries(OpenVaultVerbs.map((verb) => [verb, () => Promise.resolve(null)])) as unknown as VaultDB
    await TH.expectRefusal(eraseDamagedVault(world.optsWith({ vaultDB: withoutTheVerb })), 'bad_option')
    expect(world.dbStore.ckeys().some((ckey) => isU1Box(ckey))).to.eq(true)
    expect(await world.rememberedUnlock()).to.not.be.null
  })

  it("checks names with the host's validators, as openVault does", async () => {
    const world = makeWorld()
    const opts = world.optsWith({ userId: 'u1@example', validators: { userId: Z.string() } })
    const vault = await openVault(opts)
    await vault.unlock('pw')
    vault.close()
    const ckey = Ckeys.bundle({ applabel: 'acme', user_id: 'u1@example', vaultlabel: 'main' })
    const bundle = JSON.parse(world.dbStore.read(ckey) ?? 'null') as object
    world.dbStore.write(ckey, JSON.stringify({ ...bundle, unlock_epoch: 'one' }))
    await eraseDamagedVault(opts)
    expect(world.dbStore.read(ckey)).to.be.null
  })
})

/** Ways a stored lockbox row can be spoiled that the listing sees, so that it lists as damaged. */
const DamagedListings = [
  [() => '{"not": json',                                                                          'that is not JSON at all'],
  [(row: Record<string, unknown>) => JSON.stringify({ ...row, boxlabel: 'other_box' }),           'naming another boxlabel than the one it is stored under'],
  [(row: Record<string, unknown>) => JSON.stringify({ ...row, changed_at: 1_792_022_400_000.5 }), 'whose changed_at holds a fraction of a millisecond'],
  [(row: Record<string, unknown>) => JSON.stringify({ ...row, note: 'n'.repeat(257) }),           'whose note is over 256 characters'],
  [(row: Record<string, unknown>) => JSON.stringify({ ...row, format: 'safebyok-lockbox-v9' }),   'written in a format this version does not know'],
] as const

/** A world holding `anthropic`, spoiled by `spoil`, beside a sound `openai` with a note; and the vault that stored them, unlocked. */
const worldWithDamagedBox = async (spoil: (row: Record<string, unknown>) => string, overrides?: Partial<OpenVaultOpts>) => {
  const world = makeWorld()
  const vault = await world.openUnlocked('pw', overrides)
  await vault.store('anthropic', 'sk-ant-fake', { note: 'personal account' })
  await vault.store('openai', 'sk-openai-fake', { note: 'work account' })
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
      expect(fresh.getSnapshot().boxes[0]).to.deep.equal({ boxlabel: 'anthropic', damaged: true })
      expect(fresh.getSnapshot().boxes[1]).to.include({ boxlabel: 'openai', note: 'work account', damaged: false })
      expect(world.logged).to.have.lengthOf(0)
    })

    it(`a freshly opened vault erases a lockbox ${blurb}, and keeps the rest`, async () => {
      const { world } = await worldWithDamagedBox(spoil)
      const fresh = await world.open()
      await fresh.erase('anthropic')
      expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.be.null
      expect(boxlabelsOf(fresh)).to.deep.equal(['openai'])
      expect(await fresh.read('openai')).to.eq('sk-openai-fake')
    })

    it(`store over a lockbox ${blurb} writes it afresh, carrying nothing from it`, async () => {
      const { world, vault } = await worldWithDamagedBox(spoil)
      world.advance(60_000)
      await vault.store('anthropic', 'sk-ant-new')
      expect(await vault.read('anthropic')).to.eq('sk-ant-new')
      const summary = TH.summaryOf(vault.getSnapshot().boxes[0])
      expect(summary).to.include({ boxlabel: 'anthropic', note: null, registered_at: world.clock.now(), changed_at: world.clock.now() })
      expect(boxlabelsOf(vault)).to.deep.equal(['anthropic', 'openai'])
    })
  }

  it("read and use refuse a damaged lockbox as 'damaged_lockbox', handing the callback nothing, and leave it as it is", async () => {
    const [spoil] = DamagedListings[1]
    const { world, vault } = await worldWithDamagedBox(spoil)
    const spoiled = world.dbStore.read(u1BoxCkey('anthropic'))
    const callback = vi.fn()
    await TH.expectRefusal(vault.read('anthropic'), 'damaged_lockbox')
    await TH.expectRefusal(vault.use('anthropic', callback), 'damaged_lockbox')
    expect(callback).not.toHaveBeenCalled()
    expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.eq(spoiled)
    expect(vault.getSnapshot().boxes[0]).to.deep.equal({ boxlabel: 'anthropic', damaged: true })
  })

  it("a background refresh lists a lockbox damaged elsewhere, warning nothing", async () => {
    const [spoil] = DamagedListings[0]
    const { world, vault } = await worldWithDamagedBox(spoil)
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot().boxes[0]).to.deep.equal({ boxlabel: 'anthropic', damaged: true })
    expect(world.logged).to.have.lengthOf(0)
  })

  it("erase of a sound lockbox beside a damaged one lands without complaint, the damaged one still listed", async () => {
    const [spoil] = DamagedListings[2]
    const { world, vault } = await worldWithDamagedBox(spoil)
    await vault.erase('openai')
    expect(world.dbStore.read(u1BoxCkey('openai'))).to.be.null
    expect(vault.getSnapshot().boxes).to.deep.equal([{ boxlabel: 'anthropic', damaged: true }])
  })

  it("store over a damaged lockbox keeps a note given with it", async () => {
    const [spoil] = DamagedListings[3]
    const { vault } = await worldWithDamagedBox(spoil)
    await vault.store('anthropic', 'sk-ant-new', { note: 'mended' })
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.note).to.eq('mended')
  })

  it("store over a damaged lockbox in a full vault replaces it, never refused by maxLockboxes", async () => {
    const [spoil] = DamagedListings[0]
    const { vault } = await worldWithDamagedBox(spoil, { maxLockboxes: 2 })
    await vault.store('anthropic', 'sk-ant-new')
    expect(await vault.read('anthropic')).to.eq('sk-ant-new')
    await TH.expectRefusal(vault.store('third', 'sk-fake'), 'vault_full')
  })

  it("store over a lockbox that lists soundly but will not open, missing its whisper, writes it afresh", async () => {
    const { world, vault } = await worldWithDamagedBox(({ whisper_ciphered: _gone, ...row }) => JSON.stringify(row))
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.note).to.eq('personal account')
    world.advance(60_000)
    await vault.store('anthropic', 'sk-ant-new')
    expect(await vault.read('anthropic')).to.eq('sk-ant-new')
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])).to.include({ note: null, registered_at: world.clock.now() })
  })

  it("store over a damaged lockbox still needs the vault unlocked, and leaves it as it is", async () => {
    const [spoil] = DamagedListings[1]
    const { world, vault } = await worldWithDamagedBox(spoil)
    const spoiled = world.dbStore.read(u1BoxCkey('anthropic'))
    await vault.lock()
    await TH.expectRefusal(vault.store('anthropic', 'sk-ant-new'), 'vault_locked')
    expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.eq(spoiled)
  })

  it("a damaged lockbox's listing quotes nothing from its record", async () => {
    const { world } = await worldWithDamagedBox((row) => JSON.stringify({ ...row, note: `FAKESECRET ${'n'.repeat(300)}` }))
    const fresh = await world.open()
    expect(JSON.stringify(fresh.getSnapshot())).to.not.include('FAKESECRET')
  })
})

describe("scoping", () => {
  it("two users each keep a box by the same label, unseen by the other", async () => {
    const world = makeWorld()
    const one = await world.openUnlocked('pw one', { userId: 'u1' })
    await one.store('anthropic', 'u1-secret')
    const two = await world.open({ userId: 'u2' })
    expect(two.getSnapshot().state).to.eq('absent')
    await two.unlock('pw two')
    await two.store('anthropic', 'u2-secret')
    expect(await one.read('anthropic')).to.eq('u1-secret')
    expect(await two.read('anthropic')).to.eq('u2-secret')
  })

  it("one user's remembered unlock opens nothing for another", async () => {
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
    await vault.store('anthropic', 'sk-fake')
    expect(vault.getSnapshot()).to.not.eq(before)
  })

  it("tells listeners about unlocks and stores, and unsubscribing silences it", async () => {
    const world = makeWorld()
    const vault = await world.open()
    let heardCount = 0
    const unsubscribe = vault.subscribe(() => { heardCount += 1 })
    await vault.unlock('pw')
    expect(heardCount).to.be.greaterThan(0)
    const heardBefore = heardCount
    unsubscribe()
    await vault.store('anthropic', 'sk-fake')
    expect(heardCount).to.eq(heardBefore)
  })

  it("hears about lockboxes written through another handle", async () => {
    const world = makeWorld()
    const here = await world.openUnlocked('pw')
    const there = await world.open()
    await there.store('anthropic', 'written elsewhere')
    await vi.waitFor(() => { expect(boxlabelsOf(here)).to.deep.equal(['anthropic']) })
  })
})

describe("what the backend sees", () => {
  it("stores no whisper and no passphrase in the clear, anywhere", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('a very memorable passphrase')
    await vault.store('anthropic', 'sk-ant-api03-fake-but-secret', { note: 'notes are public' })
    const everything = world.dbStore.ckeys().map((ckey) => world.dbStore.read(ckey)).join('\n')
    expect(everything).to.not.include('sk-ant-api03-fake-but-secret')
    expect(everything).to.not.include('a very memorable passphrase')
    expect(everything).to.include('notes are public')  // the note is public by design
    expect(everything).to.include('whisper_ciphered')
  })

  it("two stores of the same whisper write different ciphertext: fresh key and iv every time", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.store('one_box', 'the same whisper')
    await vault.store('two_box', 'the same whisper')
    const [oneRow, twoRow] = world.dbStore.ckeys().filter((ckey) => isU1Box(ckey))
      .map((ckey) => JSON.parse(world.dbStore.read(ckey) ?? '{}') as { whisper_ciphered: { ciphertext_b64: string } })
    expect(oneRow?.whisper_ciphered.ciphertext_b64).to.not.eq(twoRow?.whisper_ciphered.ciphertext_b64)
  })
})

/** A lockbox row's public fields altered in storage, each a field its encryptions bind. */
const SpoiledShells = [
  [(row: Record<string, unknown>) => ({ ...row, note: 'personal account' }),                             'its note changed'],
  [({ note: _gone, ...row }: Record<string, unknown>) => row,                                             'its note removed'],
  [({ registered_at: kept, ...row }: Record<string, unknown>) => ({ ...row, registered_at: (kept as number) - 1 }), 'its registered_at moved'],
  [({ changed_at: kept, ...row }: Record<string, unknown>) => ({ ...row, changed_at: (kept as number) + 1 }),       'its changed_at moved'],
  [(row: Record<string, unknown>) => ({ ...row, revision_id: 'rev-elsewhere' }),                          'its revision_id swapped'],
] as const

describe("tampering", () => {
  it("a lockbox with altered ciphertext refuses to open, and is left as it is", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.store('anthropic', 'sk-fake')
    const ckey = world.dbStore.ckeys().find((ckey) => isU1Box(ckey))
    const row = JSON.parse(world.dbStore.read(ckey ?? '') ?? '{}') as { whisper_ciphered: { ciphertext_b64: string } }
    row.whisper_ciphered.ciphertext_b64 = TH.tweakB64(row.whisper_ciphered.ciphertext_b64)
    world.dbStore.write(ckey ?? '', JSON.stringify(row))
    const err = await TH.expectRefusal(vault.read('anthropic'), 'damaged_lockbox')
    expect(err.message).to.not.include('sk-fake')
    expect(world.dbStore.read(ckey ?? '')).to.not.be.null  // preserved for forensics, never auto-deleted
  })

  it("a lockbox row moved under another label refuses to open", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.store('victim_box', 'sk-fake')
    const fromCkey = world.dbStore.ckeys().find((candidate) => candidate.includes('victim_box'))
    world.dbStore.write(u1BoxCkey('other_box'), world.dbStore.read(fromCkey ?? '') ?? '')
    await TH.expectRefusal(vault.read('other_box'), 'damaged_lockbox')
  })

  for (const [spoil, blurb] of SpoiledShells) {
    it(`a lockbox with ${blurb} refuses to open, and is left as it is: its whole public header is bound`, async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw')
      await vault.store('anthropic', 'sk-fake', { note: 'work account' })
      const ckey = world.dbStore.ckeys().find((candidate) => isU1Box(candidate)) ?? ''
      const row = JSON.parse(world.dbStore.read(ckey) ?? '{}') as Record<string, unknown>
      const spoiled = JSON.stringify(spoil(row))
      world.dbStore.write(ckey, spoiled)
      await TH.expectRefusal(vault.read('anthropic'), 'damaged_lockbox')
      expect(world.dbStore.read(ckey)).to.eq(spoiled)
    })
  }

  it("a bundle whose registered_at was altered opens to no passphrase: it is bound into every way in", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const bundle = JSON.parse(world.dbStore.read(u1BundleCkey) ?? '{}') as { registered_at: number }
    world.dbStore.write(u1BundleCkey, JSON.stringify({ ...bundle, registered_at: bundle.registered_at - 1 }))
    const vault = await world.open({ deviceDB: memoryDeviceDB() })
    const err = await TH.expectRefusal(vault.unlock('pw'), 'wrong_passphrase')
    // The decryption fails as for a typo, so the message names both, and claims neither.
    expect(err.message).to.include('Check for typos')
    expect(err.message).to.include('the stored vault may be damaged')
  })

  it("a bundle that does not parse makes the open itself refuse as damaged_bundle, storage's refusal its cause, deleting nothing", async () => {
    const world = makeWorld()
    world.dbStore.write(u1BundleCkey, '{"format":"not-a-vault"}')
    const err = await TH.expectRefusal(world.open(), 'damaged_bundle')
    expect(err.message).to.include("can't be opened")
    expect((err.cause as VaultError).kind).to.eq('corrupt_record')
    expect(world.dbStore.read(u1BundleCkey)).to.eq('{"format":"not-a-vault"}')
  })

  it("a lockbox that will not open under the vault's own key is called damaged, with the remedy, never quoting its boxlabel", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.store('anthropic', 'sk-fake')
    const row = JSON.parse(world.dbStore.read(u1BoxCkey('anthropic')) ?? '{}') as { whisper_ciphered: { ciphertext_b64: string } }
    row.whisper_ciphered.ciphertext_b64 = TH.tweakB64(row.whisper_ciphered.ciphertext_b64)
    world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify(row))
    const err = await TH.expectRefusal(vault.read('anthropic'), 'damaged_lockbox')
    expect(err.message).to.include('That lockbox is damaged')
    expect(err.message).to.not.include('anthropic')
    expect(err.message).to.include('erase it')
    await vault.erase('anthropic')
    expect(boxlabelsOf(vault)).to.deep.equal([])
  })
})

/** u1's stored bundle in `world`, its second way in spoiled by `spoil`. */
const spoilSecondUnlock = (world: ReturnType<typeof makeWorld>, spoil: Record<string, unknown>) => {
  const bundle = JSON.parse(world.dbStore.read(u1BundleCkey) ?? '{}') as { unlocks: Record<string, unknown>[] }
  const unlocks = bundle.unlocks.map((envelope, ii) => (ii === 1 ? { ...envelope, ...spoil } : envelope))
  world.dbStore.write(u1BundleCkey, JSON.stringify({ ...bundle, unlocks }))
}

/**
 * A vault of passphrases `pw` and `spare`, the spare's salt spoiled in storage, freshly opened
 * locked. 'c2FsdA' decodes, so passes the schema, but to four bytes: no 16-byte deriver made it.
 */
const vaultWithDamagedSpare = async () => {
  const world = makeWorld()
  const vault = await world.openUnlocked('pw')
  await vault.store('anthropic', 'sk-fake')
  const spareId = await vault.addPassphrase('pw', 'spare', { unlocklabel: 'spare' })
  spoilSecondUnlock(world, { salt_b64: 'c2FsdA' })
  const fresh = await world.open({ deviceDB: memoryDeviceDB() })
  return { world, fresh, spareId }
}

describe("a way in stored damaged", () => {

  it("shuts out no other: the vault's sound passphrase still opens it", async () => {
    const { fresh } = await vaultWithDamagedSpare()
    await fresh.unlock('pw')
    expect(await fresh.read('anthropic')).to.eq('sk-fake')
  })

  it("refuses its own passphrase as wrong_passphrase, saying a damaged way in went untried", async () => {
    const { fresh } = await vaultWithDamagedSpare()
    const err = await TH.expectRefusal(fresh.unlock('spare'), 'wrong_passphrase')
    expect(err.message).to.include('stored damaged')
    expect(err.message).to.not.include('spare')
  })

  it("refuses an unlock aimed at it as damaged_unlock, and is removed by a sound way in", async () => {
    const { fresh, spareId } = await vaultWithDamagedSpare()
    await TH.expectRefusal(fresh.unlock('spare', { unlockId: spareId }), 'damaged_unlock')
    expect(fresh.getSnapshot().state).to.eq('locked')
    await fresh.removeUnlock('pw', spareId)
    expect(unlocklabelsOf(fresh)).to.deep.equal(['passphrase'])
  })

  it("a passkey stored damaged refuses its answer as damaged_unlock, and the passphrase still opens", async () => {
    const { world, laptop } = await vaultWithPasskey()
    const shortSalt = toB64(new Uint8Array(16))
    spoilSecondUnlock(world, { prf_salt_b64: shortSalt })
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    const err = await TH.expectRefusal(fresh.unlock({ ...laptop, prfSaltB64: shortSalt }), 'damaged_unlock')
    expect(err.message).to.include('Unlock with a passphrase')
    await fresh.unlock('pw')
    expect(fresh.getSnapshot().state).to.eq('unlocked')
  })

  it("a passkey whose answer no longer opens a bundle altered in storage is told that its way in may be damaged", async () => {
    const { world, laptop } = await vaultWithPasskey()
    const bundle = JSON.parse(world.dbStore.read(u1BundleCkey) ?? '{}') as { registered_at: number }
    world.dbStore.write(u1BundleCkey, JSON.stringify({ ...bundle, registered_at: bundle.registered_at - 1 }))
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
    await vault.store('anthropic', 'sk-fake')
    await vault.changePassphrase('old passphrase', 'new passphrase')
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(await vault.read('anthropic')).to.eq('sk-fake')

    const fresh = await world.open({ deviceDB: memoryDeviceDB() })  // a new device: no remembered unlock
    await TH.expectRefusal(fresh.unlock('old passphrase'), 'wrong_passphrase')
    await fresh.unlock('new passphrase')
    expect(await fresh.read('anthropic')).to.eq('sk-fake')
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
    expect(await thereDeviceDB.readUnlock({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })).to.be.null
  })
})

/** The unlocklabels a vault's snapshot lists, in order. */
const unlocklabelsOf = (vault: Vault) => vault.getSnapshot().unlocks.map((summary) => summary.unlocklabel)

/** A testDeriver that counts its derivations, for an open that should spend few. */
const countingDeriver = () => {
  const derivations = vi.fn(async (passphrase: string, saltBytes: Uint8Array) => await TH.testDeriver.deriveKeyBytes(passphrase, saltBytes))
  return { keyDeriver: { ...TH.testDeriver, deriveKeyBytes: derivations }, derivations }
}

describe("several passphrases", () => {
  it("a vault is made with one way in, labelled passphrase, listed while locked", async () => {
    const world = makeWorld()
    const vault = await world.open()
    expect(vault.getSnapshot().unlocks).to.deep.equal([])
    await vault.unlock('pw')
    await vault.lock()
    const [only] = vault.getSnapshot().unlocks
    expect(only).to.deep.equal({ method: 'passphrase', unlock_id: only?.unlock_id, unlocklabel: 'passphrase' })
    expect(only?.unlock_id).to.have.length.greaterThan(0)
  })

  it("addPassphrase gives another way in: either passphrase opens the vault, on any device", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('first passphrase')
    await vault.store('anthropic', 'sk-fake')
    const unlockId = await vault.addPassphrase('first passphrase', 'second passphrase', { unlocklabel: 'written_down' })
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(unlocklabelsOf(vault)).to.deep.equal(['passphrase', 'written_down'])
    expect(vault.getSnapshot().unlocks[1]?.unlock_id).to.eq(unlockId)

    for (const passphrase of ['first passphrase', 'second passphrase']) {
      const fresh = await world.open({ deviceDB: memoryDeviceDB() })
      await fresh.unlock(passphrase)
      expect(await fresh.read('anthropic')).to.eq('sk-fake')
    }
  })

  it("an unlock aimed at one passphrase derives once, and refuses another's passphrase", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('first passphrase')
    const unlockId = await vault.addPassphrase('first passphrase', 'second passphrase', { unlocklabel: 'written_down' })
    const { keyDeriver, derivations } = countingDeriver()
    const fresh = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver })
    await TH.expectRefusal(fresh.unlock('first passphrase', { unlockId }), 'wrong_passphrase')
    await fresh.unlock('second passphrase', { unlockId })
    expect(derivations).toHaveBeenCalledTimes(2)
    expect(fresh.getSnapshot().state).to.eq('unlocked')
  })

  it("an unlock not aimed tries each passphrase in turn: a wrong one costs a derivation apiece", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw one')
    await vault.addPassphrase('pw one', 'pw two', { unlocklabel: 'two' })
    await vault.addPassphrase('pw one', 'pw three', { unlocklabel: 'three' })
    const { keyDeriver, derivations } = countingDeriver()
    const fresh = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver })
    await TH.expectRefusal(fresh.unlock('none of them'), 'wrong_passphrase')
    expect(derivations).toHaveBeenCalledTimes(3)
  })

  it("an unlock aimed at an unlock_id the vault does not hold is refused as absent_unlock", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    await vault.lock()
    await TH.expectRefusal(vault.unlock('pw', { unlockId: 'unlock-gone' }), 'absent_unlock')
    await TH.expectRefusal(vault.unlock('pw', { unlockId: 42 as unknown as string }), 'bad_option')
  })

  it("an unlock aimed at a vault destroyed elsewhere is refused as absent_unlock, and creates nothing", async () => {
    const world = makeWorld()
    const here = await world.open()
    await here.unlock('pw')
    await here.lock()
    const unlockId = here.getSnapshot().unlocks[0]?.unlock_id
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    await there.destroy()
    await TH.expectRefusal(here.unlock('pw', { unlockId }), 'absent_unlock')
    expect(here.getSnapshot().state).to.eq('absent')
    expect(await world.vaultDB.readBundle(TH.scopeOf('u1'))).to.be.null
  })

  it("addPassphrase wants a passphrase the vault opens with as proof, even while unlocked", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    const err = await TH.expectRefusal(vault.addPassphrase('not the passphrase', 'sneaky', { unlocklabel: 'sneaky' }), 'wrong_passphrase')
    expect(err.message).to.not.include('sneaky')
    expect(unlocklabelsOf(vault)).to.deep.equal(['passphrase'])
  })

  it("addPassphrase refuses a blank passphrase, a bad or taken label, and a vault at MaxUnlocks", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    await TH.expectRefusal(vault.addPassphrase('pw', ' '.repeat(3), { unlocklabel: 'blank' }), 'wrong_passphrase')
    await TH.expectRefusal(vault.addPassphrase('pw', 'pw two', { unlocklabel: 'Not A Label' }), 'bad_label')
    await TH.expectRefusal(vault.addPassphrase('pw', 'pw two', undefined as unknown as { unlocklabel: string }), 'bad_label')
    await TH.expectRefusal(vault.addPassphrase('pw', 'pw two', { unlocklabel: 'passphrase' }), 'bad_label')
    for (let ii = 1; ii < MaxUnlocks; ii += 1) {
      await vault.addPassphrase('pw', `pw ${String(ii)}`, { unlocklabel: `phrase${String(ii)}` })
    }
    expect(vault.getSnapshot().unlocks).to.have.lengthOf(MaxUnlocks)
    await TH.expectRefusal(vault.addPassphrase('pw', 'one too many', { unlocklabel: 'extra' }), 'too_many_unlocks')
  })

  it("a blank passphrase offered as proof is refused at once, deriving nothing", async () => {
    const world = makeWorld()
    const { keyDeriver, derivations } = countingDeriver()
    const vault = await world.open({ keyDeriver })
    await vault.unlock('pw')
    const unlockId = await vault.addPassphrase('pw', 'pw two', { unlocklabel: 'two' })
    derivations.mockClear()
    await TH.expectRefusal(vault.addPassphrase(' '.repeat(2), 'pw three', { unlocklabel: 'three' }), 'wrong_passphrase')
    await TH.expectRefusal(vault.removeUnlock('', unlockId), 'wrong_passphrase')
    await TH.expectRefusal(vault.changePassphrase('\t', 'pw four'), 'wrong_passphrase')
    expect(derivations).not.toHaveBeenCalled()
  })

  it("a refusal for what addPassphrase asks costs no key derivation", async () => {
    const world = makeWorld()
    const { keyDeriver, derivations } = countingDeriver()
    const vault = await world.open({ keyDeriver })
    await vault.unlock('pw')
    derivations.mockClear()
    await TH.expectRefusal(vault.addPassphrase('pw', 'pw two', { unlocklabel: 'passphrase' }), 'bad_label')
    expect(derivations).not.toHaveBeenCalled()
  })

  it("changePassphrase changes the passphrase it was given, and leaves the others standing", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('first')
    await vault.addPassphrase('first', 'second', { unlocklabel: 'written_down' })
    const before = vault.getSnapshot().unlocks
    await vault.changePassphrase('second', 'second, renewed')
    expect(vault.getSnapshot().unlocks).to.deep.equal(before)  // same ids, same labels

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
    const unlockId = await vault.addPassphrase('first', 'second', { unlocklabel: 'written_down' })
    await TH.expectRefusal(vault.changePassphrase('first', 'whatever', { unlockId }), 'wrong_passphrase')
    await vault.changePassphrase('second', 'renewed', { unlockId })
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await fresh.unlock('renewed', { unlockId })
    expect(fresh.getSnapshot().state).to.eq('unlocked')
  })

  it("removeUnlock takes one way in away, proven by any passphrase still standing", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('first')
    const unlockId = await vault.addPassphrase('first', 'second', { unlocklabel: 'written_down' })
    await vault.store('anthropic', 'sk-fake')
    await vault.removeUnlock('second', unlockId)  // the one going is proof enough
    expect(unlocklabelsOf(vault)).to.deep.equal(['passphrase'])
    expect(vault.getSnapshot().state).to.eq('unlocked')

    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.expectRefusal(fresh.unlock('second'), 'wrong_passphrase')
    await fresh.unlock('first')
    expect(await fresh.read('anthropic')).to.eq('sk-fake')
  })

  it("removeUnlock never removes the last way in, nor one that is not there", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('pw')
    const [only] = vault.getSnapshot().unlocks
    await TH.expectRefusal(vault.removeUnlock('pw', only?.unlock_id ?? ''), 'last_unlock')
    await TH.expectRefusal(vault.removeUnlock('pw', 'unlock-gone'), 'absent_unlock')
    await TH.expectRefusal(vault.removeUnlock('pw', ''), 'bad_option')
    expect(vault.getSnapshot().unlocks).to.have.lengthOf(1)
  })

  it("removeUnlock wants a passphrase the vault opens with, and removes nothing on a wrong one", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('first')
    const unlockId = await vault.addPassphrase('first', 'second', { unlocklabel: 'written_down' })
    await TH.expectRefusal(vault.removeUnlock('neither', unlockId), 'wrong_passphrase')
    expect(vault.getSnapshot().unlocks).to.have.lengthOf(2)
  })

  it("every change to the ways in moves the epoch: another device locks, and this one stays unlocked", async () => {
    const world = makeWorld()
    const here = await world.open()
    await here.unlock('first')
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    await there.unlock('first')

    const unlockId = await here.addPassphrase('first', 'second', { unlocklabel: 'written_down' })
    await vi.waitFor(() => { expect(there.getSnapshot().state).to.eq('locked') })
    expect(there.getSnapshot().unlocks).to.deep.equal(here.getSnapshot().unlocks)
    await there.unlock('second')

    await here.removeUnlock('first', unlockId)
    await vi.waitFor(() => { expect(there.getSnapshot().state).to.eq('locked') })
    expect(storedBundleOf(world)['unlock_epoch']).to.eq(3)
    expect(here.getSnapshot().state).to.eq('unlocked')
  })

  it("this device's remembered unlock follows a change, so a reload stays unlocked", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('first')
    await vault.addPassphrase('first', 'second', { unlocklabel: 'written_down' })
    const reloaded = await world.open()
    expect(reloaded.getSnapshot().state).to.eq('unlocked')
  })

  it("two devices adding at once: the second write is stale, and adds nothing", async () => {
    const world = makeWorld()
    const here = await world.open()
    await here.unlock('pw')
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    await there.unlock('pw')
    // `there` looks at the bundle before `here` writes, and writes after it.
    const realUpdate = world.vaultDB.updateBundle.bind(world.vaultDB)
    const spied = vi.spyOn(world.vaultDB, 'updateBundle').mockImplementationOnce(async (bundle, expected) => {
      await here.addPassphrase('pw', 'here pw', { unlocklabel: 'here' })
      await realUpdate(bundle, expected)
    })
    await TH.expectRefusal(there.addPassphrase('pw', 'there pw', { unlocklabel: 'there' }), 'stale_write')
    spied.mockRestore()
    expect(unlocklabelsOf(there)).to.deep.equal(['passphrase', 'here'])
  })

  it("the backend holds no passphrase, of the first or of any added", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await vault.unlock('a very memorable passphrase')
    await vault.addPassphrase('a very memorable passphrase', 'another memorable passphrase', { unlocklabel: 'spare' })
    const everything = world.dbStore.ckeys().map((ckey) => world.dbStore.read(ckey)).join('\n')
    expect(everything).to.not.include('memorable')
    expect(everything).to.include('"unlocklabel":"spare"')
  })

  it("a bundle in the shape before unlock envelopes reads as a damaged bundle, and is left as it is", async () => {
    const world = makeWorld()
    const { unlocks: _unlocks, ...rest } = TH.bundleOf('u1')
    const oldText = JSON.stringify({ ...rest, key_deriver_label: 'test_digest_v0', passphrase_salt_b64: 'c2FsdA', vault_key_passphrase_wrapped: TH.fakeCiphered('old') })
    const bundleCkey = Ckeys.bundle(TH.scopeOf('u1'))
    world.dbStore.write(bundleCkey, oldText)
    await TH.expectRefusal(world.open(), 'damaged_bundle')
    expect(world.dbStore.read(bundleCkey)).to.eq(oldText)
  })
})

/** A passkey maker whose authenticator answers `answer`, whatever it is: for a test of what addPasskey refuses. */
const answering = (answer: unknown) => () => Promise.resolve(answer as PasskeyProof)

/** The unlock_id of the passkey `laptop` that `vault` adds under the passphrase `pw`; fails the test when it adds none. */
const addLaptopPasskey = async (vault: Vault): Promise<string> => {
  const unlockId = await vault.addPasskey('pw', () => TH.passkeyOf('laptop'), { unlocklabel: 'laptop' })
  if (unlockId === null) { throw new Error('addPasskey added no passkey') }
  return unlockId
}

/** A vault in a fresh world, unlocked with `pw`, holding one lockbox and a passkey labelled `laptop`. */
const vaultWithPasskey = async () => {
  const world = makeWorld()
  const vault = await world.open()
  await vault.unlock('pw')
  await vault.store('anthropic', 'sk-fake')
  const laptop = await TH.passkeyOf('laptop')
  const unlockId = await addLaptopPasskey(vault)
  return { world, vault, laptop, unlockId }
}

describe("passkeys", () => {
  it("addPasskey gives a way in that opens the vault on any device, with no key derivation", async () => {
    const { world, vault, laptop, unlockId } = await vaultWithPasskey()
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(unlocklabelsOf(vault)).to.deep.equal(['passphrase', 'laptop'])
    const { keyDeriver, derivations } = countingDeriver()
    const fresh = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver })
    await fresh.unlock(laptop)
    expect(await fresh.read('anthropic')).to.eq('sk-fake')
    expect(derivations).not.toHaveBeenCalled()
    await fresh.lock()
    await fresh.unlock(laptop, { unlockId })
    expect(fresh.getSnapshot().state).to.eq('unlocked')
  })

  it("a locked vault lists its passkeys with the credential and salt to ask them with", async () => {
    const { world, laptop, unlockId } = await vaultWithPasskey()
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    expect(fresh.getSnapshot().state).to.eq('locked')
    expect(fresh.getSnapshot().unlocks[1]).to.deep.equal({
      method: 'passkey', unlock_id: unlockId, unlocklabel: 'laptop', credential_id: laptop.credentialId, prf_salt_b64: laptop.prfSaltB64,
    })
  })

  it("an unlock with a passkey is remembered on this device until askPassphraseAt, as a passphrase's is", async () => {
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
    await TH.expectRefusal(fresh.unlock(await TH.passkeyOf('stranger')), 'absent_unlock')
    await TH.expectRefusal(fresh.unlock({ ...laptop, prfBytes: new Uint8Array(32).fill(7) }), 'wrong_passkey')
    const otherSalt = TH.passkeyEnvelopeOf('any').prf_salt_b64
    await TH.expectRefusal(fresh.unlock(await TH.passkeyOf('laptop', otherSalt)), 'wrong_passkey')
    expect(fresh.getSnapshot().state).to.eq('locked')
  })

  it("an unlock with a passkey never creates a vault: an absent one refuses as absent_vault", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await TH.expectRefusal(vault.unlock(await TH.passkeyOf('laptop')), 'absent_vault')
    expect(vault.getSnapshot().state).to.eq('absent')
    expect(await world.vaultDB.readBundle(TH.scopeOf('u1'))).to.be.null
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
    await vault.addPasskey(laptop, () => TH.passkeyOf('phone'), { unlocklabel: 'phone' })
    expect(unlocklabelsOf(vault)).to.deep.equal(['passphrase', 'laptop', 'phone'])
    await TH.expectRefusal(vault.addPasskey('not the passphrase', () => TH.passkeyOf('key'), { unlocklabel: 'key' }), 'wrong_passphrase')
    await TH.expectRefusal(vault.addPasskey({ ...laptop, prfBytes: new Uint8Array(32) }, () => TH.passkeyOf('key'), { unlocklabel: 'key' }), 'wrong_passkey')
    expect(unlocklabelsOf(vault)).to.deep.equal(['passphrase', 'laptop', 'phone'])
  })

  it("addPasskey makes its passkey only once the proof holds: a refused proof, label or room never asks the authenticator", async () => {
    const { vault, laptop } = await vaultWithPasskey()
    const makePasskey = vi.fn(() => TH.passkeyOf('phone'))
    await TH.expectRefusal(vault.addPasskey('not the passphrase', makePasskey, { unlocklabel: 'phone' }), 'wrong_passphrase')
    await TH.expectRefusal(vault.addPasskey(' '.repeat(3), makePasskey, { unlocklabel: 'phone' }), 'wrong_passphrase')
    await TH.expectRefusal(vault.addPasskey({ ...laptop, prfBytes: new Uint8Array(32) }, makePasskey, { unlocklabel: 'phone' }), 'wrong_passkey')
    await TH.expectRefusal(vault.addPasskey('pw', makePasskey, { unlocklabel: 'laptop' }), 'bad_label')
    for (let ii = 2; ii < MaxUnlocks; ii += 1) {
      await vault.addPasskey('pw', () => TH.passkeyOf(`key${String(ii)}`), { unlocklabel: `key${String(ii)}` })
    }
    await TH.expectRefusal(vault.addPasskey('pw', makePasskey, { unlocklabel: 'phone' }), 'too_many_unlocks')
    expect(makePasskey).not.toHaveBeenCalled()
  })

  it("addPasskey adds nothing, and resolves null, when the passkey's prompt is dismissed", async () => {
    const { world, vault } = await vaultWithPasskey()
    const unlocksThen = vault.getSnapshot().unlocks.length
    const bundleThen = await world.vaultDB.readBundle(TH.scopeOf('u1'))
    expect(await vault.addPasskey('pw', () => Promise.resolve(null), { unlocklabel: 'phone' })).to.be.null
    expect(vault.getSnapshot().unlocks).to.have.lengthOf(unlocksThen)
    expect(await world.vaultDB.readBundle(TH.scopeOf('u1'))).to.deep.equal(bundleThen)
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("addPasskey throws what its passkey maker throws, adding nothing", async () => {
    const { vault } = await vaultWithPasskey()
    const unavailable = new VaultError('passkey_unavailable', 'No PRF here.')
    const err = await TH.expectRefusal(vault.addPasskey('pw', () => Promise.reject(unavailable), { unlocklabel: 'phone' }), 'passkey_unavailable')
    expect(err).to.equal(unavailable)
    expect(unlocklabelsOf(vault)).to.deep.equal(['passphrase', 'laptop'])
  })

  it("addPasskey refuses a malformed answer, a credential already in the vault, a taken label, and a full vault", async () => {
    const { vault, laptop } = await vaultWithPasskey()
    const phone = await TH.passkeyOf('phone')
    const shortSalt = toB64(new Uint8Array(16))
    await TH.expectRefusal(vault.addPasskey('pw', answering({ ...phone, prfSaltB64: shortSalt }), { unlocklabel: 'phone' }), 'bad_option')
    await TH.expectRefusal(vault.addPasskey('pw', answering({ ...phone, prfSaltB64: 'not base64url!' }), { unlocklabel: 'phone' }), 'bad_option')
    const shortAnswer = new Uint8Array(16)
    await TH.expectRefusal(vault.addPasskey('pw', answering({ ...phone, prfBytes: shortAnswer }), { unlocklabel: 'phone' }), 'bad_option')
    await TH.expectRefusal(vault.addPasskey('pw', answering({ ...phone, credentialId: '' }), { unlocklabel: 'phone' }), 'bad_option')
    await TH.expectRefusal(vault.addPasskey('pw', answering(undefined), { unlocklabel: 'phone' }), 'bad_option')
    await TH.expectRefusal(vault.addPasskey('pw', answering(laptop), { unlocklabel: 'laptop_again' }), 'bad_option')
    await TH.expectRefusal(vault.addPasskey('pw', answering(phone), { unlocklabel: 'laptop' }), 'bad_label')
    await TH.expectRefusal(vault.addPasskey('pw', answering(phone), { unlocklabel: 'Phone' }), 'bad_label')
    expect(unlocklabelsOf(vault)).to.deep.equal(['passphrase', 'laptop'])
    for (let ii = 2; ii < MaxUnlocks; ii += 1) {
      await vault.addPasskey('pw', () => TH.passkeyOf(`key${String(ii)}`), { unlocklabel: `key${String(ii)}` })
    }
    await TH.expectRefusal(vault.addPasskey('pw', answering(phone), { unlocklabel: 'phone' }), 'too_many_unlocks')
  })

  const NotMakers = [
    [null,                     'nothing at all'],
    ['laptop',                 'a string'],
    [{ credentialId: 'cred' }, "a passkey's answer itself, made before the proof was checked"],
  ] as const

  for (const [notMaker, blurb] of NotMakers) {
    it(`addPasskey refuses, as bad_option, ${blurb} in place of a passkey maker`, async () => {
      const { vault } = await vaultWithPasskey()
      await TH.expectRefusal(vault.addPasskey('pw', notMaker as unknown as () => Promise<PasskeyProof>, { unlocklabel: 'phone' }), 'bad_option')
    })
  }

  it("addPasskey refuses as stale_write when another device changed the ways in while the authenticator was asked", async () => {
    const { world, vault } = await vaultWithPasskey()
    const elsewhere = await world.open({ deviceDB: memoryDeviceDB() })
    await elsewhere.unlock('pw')
    const makePasskey = async () => {
      await elsewhere.addPassphrase('pw', 'pw two', { unlocklabel: 'spare' })
      return await TH.passkeyOf('phone')
    }
    await TH.expectRefusal(vault.addPasskey('pw', makePasskey, { unlocklabel: 'phone' }), 'stale_write')
    expect(unlocklabelsOf(elsewhere)).to.deep.equal(['passphrase', 'laptop', 'spare'])
  })

  it("a passkey's answer of the wrong shape is refused as misuse wherever it is a proof, never quoting it", async () => {
    const { vault, laptop } = await vaultWithPasskey()
    const misshapen = { ...laptop, prfBytes: [...laptop.prfBytes] } as unknown as PasskeyProof
    for (const refused of [vault.unlock(misshapen), vault.addPassphrase(misshapen, 'pw two', { unlocklabel: 'two' }), vault.removeUnlock(misshapen, 'unlock-gone')]) {
      const err = await TH.expectRefusal(refused, 'bad_option')
      expect(err.message).to.not.include(laptop.credentialId)
      expect(err.message).to.not.include(laptop.prfBytes.join(','))
    }
    await TH.expectRefusal(vault.unlock(undefined as unknown as string), 'bad_option')
  })

  it("a passkey sets a new passphrase for a user who forgot theirs: add one, remove the old", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    await vault.lock()
    const forgotten = vault.getSnapshot().unlocks[0]?.unlock_id ?? ''
    await vault.addPassphrase(laptop, 'a new passphrase', { unlocklabel: 'new_phrase' })
    await vault.removeUnlock(laptop, forgotten)
    expect(unlocklabelsOf(vault)).to.deep.equal(['laptop', 'new_phrase'])
    expect(vault.getSnapshot().state).to.eq('unlocked')
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.expectRefusal(fresh.unlock('pw'), 'wrong_passphrase')
    await fresh.unlock('a new passphrase')
    expect(await fresh.read('anthropic')).to.eq('sk-fake')
  })

  it("changePassphrase changes a passphrase, never a passkey", async () => {
    const { vault, laptop, unlockId } = await vaultWithPasskey()
    await TH.expectRefusal(vault.changePassphrase(laptop as unknown as string, 'new pw'), 'bad_option')
    await TH.expectRefusal(vault.changePassphrase('pw', 'new pw', { unlockId }), 'absent_unlock')
    expect(unlocklabelsOf(vault)).to.deep.equal(['passphrase', 'laptop'])
  })

  it("removeUnlock takes a passkey away: it no longer opens the vault", async () => {
    const { world, vault, laptop, unlockId } = await vaultWithPasskey()
    await vault.removeUnlock('pw', unlockId)
    expect(unlocklabelsOf(vault)).to.deep.equal(['passphrase'])
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.expectRefusal(fresh.unlock(laptop), 'absent_unlock')
  })

  it("removeUnlock never removes the last passphrase, though passkeys remain", async () => {
    const { vault, laptop } = await vaultWithPasskey()
    const passphraseId = vault.getSnapshot().unlocks[0]?.unlock_id ?? ''
    await TH.expectRefusal(vault.removeUnlock(laptop, passphraseId), 'last_unlock')
    await TH.expectRefusal(vault.removeUnlock('pw', passphraseId), 'last_unlock')
    expect(unlocklabelsOf(vault)).to.deep.equal(['passphrase', 'laptop'])
  })

  it("every change of a passkey moves the epoch: another device locks, and this one stays unlocked", async () => {
    const world = makeWorld()
    const here = await world.open()
    await here.unlock('pw')
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    await there.unlock('pw')
    const unlockId = await addLaptopPasskey(here)
    await vi.waitFor(() => { expect(there.getSnapshot().state).to.eq('locked') })
    await there.unlock(await TH.passkeyOf('laptop'))
    await here.removeUnlock('pw', unlockId)
    await vi.waitFor(() => { expect(there.getSnapshot().state).to.eq('locked') })
    expect(storedBundleOf(world)['unlock_epoch']).to.eq(3)
    expect(here.getSnapshot().state).to.eq('unlocked')
  })

  it("the backend holds no passkey's answer, only its credential and salt", async () => {
    const { world, laptop } = await vaultWithPasskey()
    const everything = world.dbStore.ckeys().map((ckey) => world.dbStore.read(ckey)).join('\n')
    expect(everything).to.not.include(toB64(laptop.prfBytes))
    expect(everything).to.include(laptop.credentialId)
    expect(everything).to.include(laptop.prfSaltB64)
  })

  it("removal is not revocation: a copy of the bundle from before still opens with the removed passkey", async () => {
    const { world, vault, laptop, unlockId } = await vaultWithPasskey()
    const kept = world.dbStore.read(Ckeys.bundle(TH.scopeOf('u1'))) ?? ''
    await vault.removeUnlock('pw', unlockId)
    const copy = makeWorld()
    copy.dbStore.write(Ckeys.bundle(TH.scopeOf('u1')), kept)
    const thief = await copy.open()
    await thief.unlock(laptop)
    expect(thief.getSnapshot().state).to.eq('unlocked')
  })
})

/**
 * A world whose slow waits can be held mid-flight, to land a lock inside an unlock: each
 * `holdNext` arms a gate on the next look at the bundle, passphrase derivation, device-record
 * write, or (to hold a store in hand) read of a lockbox, and hands it back. Its key deriver is its
 * own copy of testDeriver, so a spy on it stays here.
 */
const makeRacingWorld = () => {
  const keyDeriver: KeyDeriver = { ...TH.testDeriver }
  const world = makeWorld({ keyDeriver })
  const holdNextLook = () => TH.holdNextCall(world.vaultDB, 'readBundle')
  const holdNextDerive = () => TH.holdNextCall(keyDeriver, 'deriveKeyBytes')
  const holdNextRemember = () => TH.holdNextCall(world.deviceDB, 'writeUnlock')
  const holdNextBoxRead = () => TH.holdNextCall(world.vaultDB, 'readBox')
  return { ...world, holdNextLook, holdNextDerive, holdNextRemember, holdNextBoxRead }
}

describe("a lock that lands while an unlock is under way", () => {
  it("during the passphrase check: the lock wins, the unlock throws 'vault_locked', and nothing is remembered", async () => {
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
    await TH.expectRefusal(vault.read('anything'), 'vault_locked')
    expect(await world.rememberedUnlock()).to.be.null
    // Well within the seven days a remembered unlock would last: the reopen is locked all the same.
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
    expect(await world.rememberedUnlock()).to.not.be.null
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
    expect(await world.rememberedUnlock()).to.be.null
  })

  it("during the device record's write: the record that lands after the lock's erase is erased again", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.lock()
    const gate = world.holdNextRemember()
    const unlocking = TH.expectRefusal(vault.unlock('pw one'), 'vault_locked')
    await gate.reached
    await vault.lock()
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.rememberedUnlock()).to.be.null
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
    expect(await world.rememberedUnlock()).to.be.null
    await vault.unlock('pw one')
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("a destroy() that lands mid-unlock wins the same way, and the vault is gone", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.store('anthropic', 'sk-fake')
    await vault.lock()
    const gate = world.holdNextDerive()
    const unlocking = TH.expectRefusal(vault.unlock('pw one'), 'vault_locked')
    await gate.reached
    await vault.destroy()
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.eq('absent')
    expect(world.dbStore.ckeys()).to.have.lengthOf(0)
    expect(await world.rememberedUnlock()).to.be.null
  })

  it("during changePassphrase(): the passphrase still changes, and the vault stays locked", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('old passphrase')
    await vault.store('anthropic', 'sk-fake')
    const gate = world.holdNextDerive()
    const changing = vault.changePassphrase('old passphrase', 'new passphrase')
    await gate.reached
    await vault.lock()
    gate.release()
    await changing
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.rememberedUnlock()).to.be.null

    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.expectRefusal(fresh.unlock('old passphrase'), 'wrong_passphrase')
    await fresh.unlock('new passphrase')
    expect(await fresh.read('anthropic')).to.eq('sk-fake')
  })

  it("during addPasskey()'s prompt: the passkey still lands, and the vault stays locked", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw')
    await vault.store('anthropic', 'sk-fake')
    const makePasskey = async () => {
      await vault.lock()
      return await TH.passkeyOf('laptop')
    }
    expect(await vault.addPasskey('pw', makePasskey, { unlocklabel: 'laptop' })).to.be.a('string')
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.rememberedUnlock()).to.be.null

    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await fresh.unlock(await TH.passkeyOf('laptop'))
    expect(await fresh.read('anthropic')).to.eq('sk-fake')
  })

  it("during changePassphrase()'s device record write: the record is erased again", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('old passphrase')
    const gate = world.holdNextRemember()
    const changing = vault.changePassphrase('old passphrase', 'new passphrase')
    await gate.reached
    await vault.lock()
    gate.release()
    await changing
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.rememberedUnlock()).to.be.null
    await vault.unlock('new passphrase')
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })
})

describe("a vault that moves elsewhere while an unlock is under way", () => {
  it("destroyed and made anew: the unlock takes up nothing, throws 'vault_locked', and can't seal into the new vault", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.lock()
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    const gate = world.holdNextDerive()
    const unlocking = TH.expectRefusal(vault.unlock('pw one'), 'vault_locked')
    await gate.reached
    await there.destroy()
    await there.unlock('pw two')
    await there.store('anthropic', 'sk-ant-fake-new')
    // Let this handle's background refresh, rung by the writes above, bring in the new vault.
    await TH.wakeupAtNextTick()
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.rememberedUnlock()).to.be.null
    await TH.expectRefusal(vault.store('anthropic', 'sk-ant-fake-stale'), 'vault_locked')
    expect(await there.read('anthropic')).to.eq('sk-ant-fake-new')
    await vault.unlock('pw two')
    expect(await vault.read('anthropic')).to.eq('sk-ant-fake-new')
  })

  it("destroyed and not remade: the unlock takes up nothing, and the vault reads as absent", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.lock()
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    const gate = world.holdNextDerive()
    const unlocking = TH.expectRefusal(vault.unlock('pw one'), 'vault_locked')
    await gate.reached
    await there.destroy()
    await TH.wakeupAtNextTick()
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.eq('absent')
    expect(await world.rememberedUnlock()).to.be.null
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
    expect(await world.rememberedUnlock()).to.be.null
    await vault.unlock('pw two')
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("a refresh that brings back the same bundle, unchanged, does not defeat the unlock", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.lock()
    const there = await world.openUnlocked('pw one', { deviceDB: memoryDeviceDB() })
    const gate = world.holdNextDerive()
    const unlocking = vault.unlock('pw one')
    await gate.reached
    await there.store('anthropic', 'sk-ant-fake')
    await TH.wakeupAtNextTick()
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(await vault.read('anthropic')).to.eq('sk-ant-fake')
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
    await vault.store('anthropic', 'sk-fake')
    await vault.lockSoon()
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(vault.getSnapshot().askPassphraseAt).to.be.null
    await TH.expectRefusal(vault.read('anthropic'), 'vault_locked')
    await TH.expectRefusal(vault.store('openai', 'sk-fake-too'), 'vault_locked')
  })

  it("keeps the gate closed through the grace, even if the clock steps back", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.store('anthropic', 'sk-fake')
    await vault.lockSoon(30)
    world.advance(-10_000)
    await TH.expectRefusal(vault.read('anthropic'), 'vault_locked')
    expect(vault.getSnapshot().state).to.eq('locked')
  })

  it("forgets the remembered unlock at once: a reopen within the grace asks for the passphrase", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.lockSoon()
    expect(await world.rememberedUnlock()).to.be.null
    expect(await world.stateOnOpen()).to.eq('locked')
  })

  it("lets work in hand finish: a store already under way lands within the grace", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    const gate = world.holdNextBoxRead()
    const storing = vault.store('anthropic', 'sk-fake')
    await gate.reached
    await vault.lockSoon()
    gate.release()
    await storing
    await vault.unlock('pw one')
    expect(await vault.read('anthropic')).to.eq('sk-fake')
  })

  it("keeps the key for work in hand while new work is refused at the gate", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    const gate = world.holdNextBoxRead()
    const storing = vault.store('anthropic', 'sk-fake')
    await gate.reached
    await vault.lockSoon()
    await TH.expectRefusal(vault.read('anthropic'), 'vault_locked')
    gate.release()
    await storing
  })

  it("drops the vaultKey when the grace runs out: work still in hand after it is refused", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    const gate = world.holdNextBoxRead()
    const storing = TH.expectRefusal(vault.store('anthropic', 'sk-fake'), 'vault_locked')
    await gate.reached
    await vault.lockSoon()
    vi.advanceTimersByTime(GraceMillis)
    gate.release()
    await storing
    expect(vi.getTimerCount()).to.eq(0)
    await vault.unlock('pw one')
    await TH.expectRefusal(vault.read('anthropic'), 'absent_box')
  })

  it("unlike lock(), which refuses work in hand at its next look", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    const gate = world.holdNextBoxRead()
    const storing = TH.expectRefusal(vault.store('anthropic', 'sk-fake'), 'vault_locked')
    await gate.reached
    await vault.lock()
    gate.release()
    await storing
  })

  it("defeats an unlock under way when it is called, as lock() does", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    const gate = world.holdNextDerive()
    const unlocking = TH.expectRefusal(vault.unlock('pw one'), 'vault_locked')
    await gate.reached
    await vault.lockSoon()
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.rememberedUnlock()).to.be.null
  })

  it("defeats the unlock of a changePassphrase() under way, which still changes the passphrase", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('old passphrase')
    const gate = world.holdNextDerive()
    const changing = vault.changePassphrase('old passphrase', 'new passphrase')
    await gate.reached
    await vault.lockSoon()
    gate.release()
    await changing
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.rememberedUnlock()).to.be.null
    await TH.expectRefusal(vault.unlock('old passphrase'), 'wrong_passphrase')
    await vault.unlock('new passphrase')
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("is ended by an unlock within the grace: the new unlock stands past it, remembered", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.store('anthropic', 'sk-fake')
    await vault.lockSoon()
    await vault.unlock('pw one')
    expect(vi.getTimerCount()).to.eq(1)  // the new unlock's own shut, seven days and a minute out
    vi.advanceTimersByTime(GraceMillis * 2)
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(vault.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + SevenDaysMillis)
    expect(await vault.read('anthropic')).to.eq('sk-fake')
    expect(await world.rememberedUnlock()).to.not.be.null
  })

  it("is ended by a changePassphrase() within the grace, which proves the passphrase as an unlock does", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('old passphrase')
    await vault.store('anthropic', 'sk-fake')
    await vault.lockSoon()
    await vault.changePassphrase('old passphrase', 'new passphrase')
    expect(vi.getTimerCount()).to.eq(1)  // the new deadline's own shut
    vi.advanceTimersByTime(GraceMillis * 2)
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(await vault.read('anthropic')).to.eq('sk-fake')
  })

  it("loses to an unlock begun within the grace and still under way when it runs out", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.store('anthropic', 'sk-fake')
    await vault.lockSoon()
    const gate = world.holdNextDerive()
    const unlocking = vault.unlock('pw one')
    await gate.reached
    vi.advanceTimersByTime(GraceMillis)
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(await vault.read('anthropic')).to.eq('sk-fake')
  })

  it("never lengthens a grace already running, and a shorter one shortens it", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    const firstGate = world.holdNextBoxRead()
    const firstStoring = TH.expectRefusal(vault.store('anthropic', 'sk-fake'), 'vault_locked')
    await firstGate.reached
    await vault.lockSoon(1)
    await vault.lockSoon(30)
    vi.advanceTimersByTime(1000)
    firstGate.release()
    await firstStoring

    await vault.unlock('pw one')
    const secondGate = world.holdNextBoxRead()
    const secondStoring = TH.expectRefusal(vault.store('anthropic', 'sk-fake'), 'vault_locked')
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
    const storing = TH.expectRefusal(vault.store('anthropic', 'sk-fake'), 'vault_locked')
    await gate.reached
    await vault.lockSoon(0)
    expect(vi.getTimerCount()).to.eq(0)
    gate.release()
    await storing
    expect(await world.rememberedUnlock()).to.be.null
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

  it("is cut short by lock(), and by destroy()", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.lockSoon()
    await vault.lock()
    expect(vi.getTimerCount()).to.eq(0)
    await vault.unlock('pw one')
    await vault.lockSoon()
    await vault.destroy()
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

/** The testDeriver's derivation, to put in a deriver of another shape. */
const cheapDerive: KeyDeriver['deriveKeyBytes'] = (passphrase, saltBytes) => TH.testDeriver.deriveKeyBytes(passphrase, saltBytes)

describe("the key deriver seam", () => {
  it("a vault made under one deriver refuses to unlock under another, by label", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const alienDeriver = { ...TH.testDeriver, key_deriver_label: 'someone_elses_deriver_v9' }
    const alien = await world.open({ deviceDB: memoryDeviceDB(), keyDeriver: alienDeriver })
    await TH.expectRefusal(alien.unlock('pw'), 'unknown_key_deriver')
  })

  it("asks for a keyDeriver outright: there is no default to fall back on", () => {
    expectTypeOf<Pick<OpenVaultOpts, 'keyDeriver'>>().toEqualTypeOf<{ keyDeriver: KeyDeriver }>()
  })

  it("refuses to open without a keyDeriver, pointing at the browser's defaults", async () => {
    const opts = TH.omitting(makeWorld().optsWith(), 'keyDeriver')
    const err = await TH.expectRefusal(openVault(opts), 'bad_option')
    expect(err.message).to.include('keyDeriver')
    expect(err.message).to.include('safebyok/browser')
  })

  it("refuses a keyDeriver that is not one", async () => {
    const world = makeWorld()
    const NotDerivers = [
      null,
      'argon2id_web_v1',
      { key_deriver_label: 'test_digest_v0', salt_bytes: 16 },
      { ...TH.testDeriver, salt_bytes: 0 },
      { ...TH.testDeriver, salt_bytes: 1.5 },
      { ...TH.testDeriver, salt_bytes: MaxSaltBytes + 1 },
      { ...TH.testDeriver, key_deriver_label: '' },
    ]
    for (const notDeriver of NotDerivers) {
      await TH.expectRefusal(world.open({ keyDeriver: notDeriver as unknown as KeyDeriver }), 'bad_option')
    }
  })

  it("allows a foolish salt of one byte, and the longest the platform's random source hands out", async () => {
    for (const saltBytes of [1, MaxSaltBytes]) {
      const world = makeWorld()
      await world.openUnlocked('pw', { keyDeriver: { ...TH.testDeriver, salt_bytes: saltBytes } })
      const stored = await world.vaultDB.readBundle(TH.scopeOf('u1'))
      const [envelope] = stored?.unlocks ?? []
      expect(fromB64(envelope?.method === 'passphrase' ? envelope.salt_b64 : '')).to.have.lengthOf(saltBytes)
    }
  })

  it("refuses a deriver wearing a supplied spec's label without that spec's parameters", async () => {
    const world = makeWorld()
    const Impostors = [
      { ...TH.testDeriver, key_deriver_label: Argon2idWebV1.key_deriver_label },
      { ...Argon2idWebV1, iterations: 1, deriveKeyBytes: cheapDerive },
      { ...Argon2idWebV1, salt_bytes: 32, deriveKeyBytes: cheapDerive },
    ]
    for (const impostor of Impostors) {
      const err = await TH.expectRefusal(world.open({ keyDeriver: impostor }), 'bad_option')
      expect(err.message).to.include('argon2id_web_v1')
    }
  })

  it("takes a stand-in that carries a supplied spec whole, as a WebAssembly Argon2id would", async () => {
    const world = makeWorld()
    const standIn: KeyDeriver = { ...Argon2idWebV1, deriveKeyBytes: cheapDerive }
    await world.openUnlocked('pw', { keyDeriver: standIn })
    const stored = await world.vaultDB.readBundle(TH.scopeOf('u1'))
    const [envelope] = stored?.unlocks ?? []
    expect(envelope?.method === 'passphrase' && envelope.key_deriver_label).to.eq('argon2id_web_v1')
  })

  it("refuses a deriver that hands back anything but 32 key bytes, and makes no vault of it", async () => {
    const Outputs = [new Uint8Array(16), new Uint8Array(24), new Uint8Array(64), new Uint8Array(0), 'thirty-two bytes, honest'] as const
    for (const output of Outputs) {
      const world = makeWorld()
      const shortDeriver = { ...TH.testDeriver, deriveKeyBytes: () => Promise.resolve(output as Uint8Array) }
      const vault = await world.open({ keyDeriver: shortDeriver })
      await TH.expectRefusal(vault.unlock('pw'), 'bad_option')
      expect(await world.vaultDB.readBundle(TH.scopeOf('u1'))).to.be.null
      expect(vault.getSnapshot().state).to.eq('absent')
    }
  })

  it("keeps the keyDeriver it was handed, so one whose method lives on its prototype still derives", async () => {
    class PrototypeDeriver implements KeyDeriver {
      readonly key_deriver_label = TH.testDeriver.key_deriver_label
      readonly salt_bytes = TH.testDeriver.salt_bytes
      readonly #inner = TH.testDeriver
      deriveKeyBytes(passphrase: string, saltBytes: Uint8Array) { return this.#inner.deriveKeyBytes(passphrase, saltBytes) }
    }
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { keyDeriver: new PrototypeDeriver() })
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })
})

/** A racing world whose clock and timers move together, as a real device's do. */
const makeTimedWorld = () => {
  const world = makeRacingWorld()
  /** Let `byMillis` pass on the host's clock and on the timers alike. */
  const pass = (byMillis: number) => {
    world.advance(byMillis)
    vi.advanceTimersByTime(byMillis)
  }
  return { ...world, pass }
}

describe("natural expiry", () => {
  // Only the timers: promises, and vitest's own waits, keep running as they do.
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }) })
  afterEach(() => { vi.useRealTimers() })

  it("drops the vaultKey a minute past askPassphraseAt with no call made, and says so to subscribers", async () => {
    const world = makeTimedWorld()
    const vault = await world.openUnlocked('pw one', { forcePassphraseReentryHours: 1 })
    const listener = vi.fn()
    vault.subscribe(listener)
    world.pass(HourMillis + MinuteMillis - 1)
    expect(listener).not.toHaveBeenCalled()
    world.pass(1)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(vault.getSnapshot().askPassphraseAt).to.be.null
    expect(vi.getTimerCount()).to.eq(0)
  })

  it("refuses new work from askPassphraseAt on, while work in hand keeps the key to finish within the minute", async () => {
    const world = makeTimedWorld()
    const vault = await world.openUnlocked('pw one', { forcePassphraseReentryHours: 1 })
    const gate = world.holdNextBoxRead()
    const storing = vault.store('anthropic', 'sk-fake')
    await gate.reached
    world.pass(HourMillis)
    await TH.expectRefusal(vault.read('anthropic'), 'vault_locked')
    expect(vault.getSnapshot().state).to.eq('locked')
    gate.release()
    await storing
    await vault.unlock('pw one')
    expect(await vault.read('anthropic')).to.eq('sk-fake')
  })

  it("drops the key by its timer for work still in hand when the minute runs out: that work is refused, and writes nothing", async () => {
    const world = makeTimedWorld()
    const vault = await world.openUnlocked('pw one', { forcePassphraseReentryHours: 1 })
    const gate = world.holdNextBoxRead()
    const storing = TH.expectRefusal(vault.store('anthropic', 'sk-fake'), 'vault_locked')
    await gate.reached
    world.pass(HourMillis)
    await TH.expectRefusal(vault.read('anthropic'), 'vault_locked')
    world.pass(MinuteMillis)
    gate.release()
    await storing
    await vault.unlock('pw one')
    await TH.expectRefusal(vault.read('anthropic'), 'absent_box')
  })

  it("drops a key whose timer has not run by its shut time at the next look: the threshold is the truth", async () => {
    const world = makeTimedWorld()
    const vault = await world.openUnlocked('pw one', { forcePassphraseReentryHours: 1 })
    const gate = world.holdNextBoxRead()
    const storing = TH.expectRefusal(vault.store('anthropic', 'sk-fake'), 'vault_locked')
    await gate.reached
    world.advance(HourMillis + MinuteMillis)  // the clock alone, as a device asleep would see it
    gate.release()
    await storing
    expect(vi.getTimerCount()).to.eq(0)
  })

  it("arms no timer for a vault unlocked until lock()", async () => {
    const world = makeTimedWorld()
    const vault = await world.openUnlocked('pw one', { forcePassphraseReentryHours: Infinity })
    expect(vault.getSnapshot().askPassphraseAt).to.eq(FarFuture)
    expect(vi.getTimerCount()).to.eq(0)
  })

  it("arms one timer for an unlock, and one again when the window renews, never one per call", async () => {
    const world = makeTimedWorld()
    const vault = await world.openUnlocked('pw one', { forcePassphraseReentryHours: 1 })
    expect(vi.getTimerCount()).to.eq(1)
    await vault.store('anthropic', 'sk-fake')
    await vault.read('anthropic')
    await vault.changePassphrase('pw one', 'pw two')
    expect(vi.getTimerCount()).to.eq(1)
  })

  it("arms the timer for a remembered unlock picked up at open, from its own deadline", async () => {
    const world = makeTimedWorld()
    await world.openUnlocked('pw one', { forcePassphraseReentryHours: 1 })
    world.pass(HourMillis / 2)
    const reopened = await world.open({ forcePassphraseReentryHours: 1 })
    expect(reopened.getSnapshot().state).to.eq('unlocked')
    world.pass((HourMillis / 2) + MinuteMillis)
    expect(reopened.getSnapshot().state).to.eq('locked')
  })

  it("lets an unlock begun past the deadline win over the timer, with a deadline of its own", async () => {
    const world = makeTimedWorld()
    const vault = await world.openUnlocked('pw one', { forcePassphraseReentryHours: 1 })
    world.pass(HourMillis + 1)
    await vault.unlock('pw one')
    world.pass(MinuteMillis)
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(vault.getSnapshot().askPassphraseAt).to.eq(world.clock.now() - MinuteMillis + HourMillis)
  })

  it("leaves a changePassphrase() under way when it falls due unlocked, under the new passphrase, with a new deadline: a timer is no lock", async () => {
    const world = makeTimedWorld()
    const vault = await world.openUnlocked('old passphrase', { forcePassphraseReentryHours: 1 })
    await vault.store('anthropic', 'sk-fake')
    const gate = world.holdNextDerive()
    const changing = vault.changePassphrase('old passphrase', 'new passphrase')
    await gate.reached
    world.pass(HourMillis + MinuteMillis)
    expect(vault.getSnapshot().state).to.eq('locked')
    gate.release()
    await changing
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(vault.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + HourMillis)
    expect(await vault.read('anthropic')).to.eq('sk-fake')
    expect(await rememberedDeadlineOf(world)).to.eq(world.clock.now() + HourMillis)
  })

  it("gives lockSoon() on a key past its deadline no more than the minute it had left: a shut time only moves earlier", async () => {
    const world = makeTimedWorld()
    const vault = await world.openUnlocked('pw one', { forcePassphraseReentryHours: 1 })
    world.pass(HourMillis + (MinuteMillis / 2))
    await vault.lockSoon(60)
    world.pass((MinuteMillis / 2) - 1)
    expect(vi.getTimerCount()).to.eq(1)
    world.pass(1)
    expect(vi.getTimerCount()).to.eq(0)
  })

  it("has lockSoon() drop a key past its shut time at once, its timer late", async () => {
    const world = makeTimedWorld()
    const vault = await world.openUnlocked('pw one', { forcePassphraseReentryHours: 1 })
    world.advance(HourMillis + (2 * MinuteMillis))
    await vault.lockSoon(30)
    expect(vi.getTimerCount()).to.eq(0)
    expect(await world.rememberedUnlock()).to.be.null
  })
})

describe("the unlock window, renewed", () => {
  it("by a passphrase change: the user typed a passphrase, and it proved", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    world.advance(24 * HourMillis)
    await vault.changePassphrase('pw one', 'pw two')
    expect(vault.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + SevenDaysMillis)
    expect(await rememberedDeadlineOf(world)).to.eq(world.clock.now() + SevenDaysMillis)
  })

  it("by a way in added or removed with a passphrase as proof", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    world.advance(24 * HourMillis)
    const spareId = await vault.addPassphrase('pw one', 'spare pw', { unlocklabel: 'spare' })
    expect(vault.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + SevenDaysMillis)
    world.advance(24 * HourMillis)
    await vault.removeUnlock('pw one', spareId)
    expect(vault.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + SevenDaysMillis)
  })

  it("not by a passkey proving a change on an unlocked vault: the deadline standing stays, here and on the device", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    const deadline = vault.getSnapshot().askPassphraseAt
    world.advance(24 * HourMillis)
    await vault.addPassphrase(laptop, 'spare pw', { unlocklabel: 'spare' })
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(vault.getSnapshot().askPassphraseAt).to.eq(deadline)
    expect(await rememberedDeadlineOf(world)).to.eq(deadline)
    expect(await world.stateOnOpen()).to.eq('unlocked')
  })

  it("by a passkey proving a change on a locked vault, which it unlocks as unlock() by passkey would", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    await vault.lock()
    world.advance(24 * HourMillis)
    await vault.addPassphrase(laptop, 'spare pw', { unlocklabel: 'spare' })
    expect(vault.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + SevenDaysMillis)
  })

  it("never by a read, a store, an erase, or a change pushed from storage", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    const deadline = vault.getSnapshot().askPassphraseAt
    world.advance(HourMillis)
    await vault.store('anthropic', 'sk-fake')
    await vault.read('anthropic')
    await vault.erase('anthropic')
    const there = await world.openUnlocked('pw one', { deviceDB: memoryDeviceDB() })
    await there.store('openai', 'sk-fake-too')
    await vi.waitFor(() => { expect(boxlabelsOf(vault)).to.deep.equal(['openai']) })
    expect(vault.getSnapshot().askPassphraseAt).to.eq(deadline)
    expect(await rememberedDeadlineOf(world)).to.eq(deadline)
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
  it("makes an unlock under way here fail its record write: the unlock throws 'vault_locked', and nothing is remembered", async () => {
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
    expect(await world.rememberedUnlock()).to.be.null
    expect(await world.stateOnOpen()).to.eq('locked')
  })

  it("refuses the record of an unlock whose write was already on its way", async () => {
    const world = makeRacingWorld()
    const otherTab = await world.openUnlocked('pw one')
    const thisTab = await world.open()
    const gate = world.holdNextRemember()
    const unlocking = TH.expectRefusal(thisTab.unlock('pw one'), 'vault_locked')
    await gate.reached
    await otherTab.lockSoon()
    gate.release()
    await unlocking
    expect(await world.rememberedUnlock()).to.be.null
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
    await TH.expectRefusal(vault.read('anthropic'), 'identity_revoked')
    expect(await generationOf(world)).to.eq(1)
    vi.restoreAllMocks()
  })

  it("is kept when the vault is made anew under the scope, its mark started afresh", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.lock()
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    await there.destroy()
    await there.unlock('pw new')
    await vault.unlock('pw new')
    const mark = await world.deviceDB.readMark(TH.scopeOf('u1'))
    expect(mark?.vault_id).to.eq(storedBundleOf(world)['vault_id'])
    expect(mark?.lock_generation).to.eq(1)
  })
})

describe("close", () => {
  it("a closed handle refuses everything thereafter", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    vault.close()
    await TH.expectRefusal(vault.read('anything'), 'vault_closed')
    await TH.expectRefusal(vault.unlock('pw'), 'vault_closed')
  })

  it("an unlock under way when the handle closes takes nothing up, remembers nothing, and throws 'vault_closed'", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw')
    await vault.lock()
    const gate = world.holdNextDerive()
    const unlocking = TH.expectRefusal(vault.unlock('pw'), 'vault_closed')
    await gate.reached
    vault.close()
    gate.release()
    await unlocking
    expect(await world.rememberedUnlock()).to.be.null
    expect(await world.stateOnOpen()).to.eq('locked')
  })

  it("a close during the unlock's device record write erases nothing: close is not a lock, and the next open picks the record up", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw')
    await vault.lock()
    const gate = world.holdNextRemember()
    const unlocking = TH.expectRefusal(vault.unlock('pw'), 'vault_closed')
    await gate.reached
    vault.close()
    gate.release()
    await unlocking
    expect(await world.rememberedUnlock()).to.not.be.null
    expect(await world.stateOnOpen()).to.eq('unlocked')
  })

  it("leaves a remembered unlock and the device mark as they stood, its lock generation unraised", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const markBefore = await world.deviceDB.readMark(TH.scopeOf('u1'))
    vault.close()
    expect(await world.rememberedUnlock()).to.not.be.null
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
    await TH.expectRefusal(vault.read('anything'), 'vault_closed')
  })

  it("closing forgets nothing stored: the next open still finds the vault", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.store('anthropic', 'sk-fake')
    vault.close()
    const again = await world.open()
    expect(again.getSnapshot().state).to.eq('unlocked')
    expect(await again.read('anthropic')).to.eq('sk-fake')
  })
})

/** Makes the vault, with a lockbox in it, and closes the handle: what a later open will find. */
const seedVault = async (world: ReturnType<typeof makeWorld>) => {
  const vault = await world.openUnlocked('pw')
  await vault.store('anthropic', 'sk-fake')
  vault.close()
}

// Each arranges for one storage call during the open to fail, and hands back the error it planted
// (or a promise of it, for an arrangement that first seeds the vault).
const FailedOpenCases: readonly (readonly [string, (world: ReturnType<typeof makeWorld>) => unknown])[] = [
  ['storage refuses the first read, as for a user not yet signed in', (world) => {
    const refusal = new VaultError('not_permitted', 'Sign in to reach this vault.')
    vi.spyOn(world.vaultDB, 'readBundle').mockRejectedValueOnce(refusal)
    return refusal
  }],
  ['storage cannot be reached for the first read', (world) => {
    const trouble = new VaultError('storage_unavailable', 'The vault storage could not be reached.')
    vi.spyOn(world.vaultDB, 'readBundle').mockRejectedValueOnce(trouble)
    return trouble
  }],
  ['storage fails listing the lockboxes, after the bundle read', async (world) => {
    await seedVault(world)
    const trouble = new VaultError('storage_unavailable', 'The vault storage could not be reached.')
    vi.spyOn(world.vaultDB, 'listBoxes').mockRejectedValueOnce(trouble)
    return trouble
  }],
]

describe("a failed open", () => {
  for (const [blurb, arrange] of FailedOpenCases) {
    it(`rejects with the very error, and ends its storage watch, when ${blurb}`, async () => {
      const world = makeWorld()
      const planted = await arrange(world)
      const tally = TH.tallyWatches(world.vaultDB)
      let refusal: unknown = null
      try {
        await world.open()
      } catch (err) {
        refusal = err
      }
      expect(refusal).to.eq(planted)
      expect(tally).to.deep.equal({ opened: 1, closed: 1 })
    })
  }

  it("says the device's own store failing to read the remembered unlock as 'storage_unavailable', its error the cause, and ends its storage watch", async () => {
    const world = makeWorld()
    await seedVault(world)
    const trouble = new Error('device storage is unavailable')
    vi.spyOn(world.deviceDB, 'readUnlock').mockRejectedValueOnce(trouble)
    const tally = TH.tallyWatches(world.vaultDB)
    const err = await TH.expectRefusal(world.open(), 'storage_unavailable')
    expect(err.cause).to.eq(trouble)
    expect(tally).to.deep.equal({ opened: 1, closed: 1 })
  })

  it("lets a refusal the device store gives as a VaultError through as it came", async () => {
    const world = makeWorld()
    await seedVault(world)
    const refusal = new VaultError('not_permitted', 'This device may not read its records.')
    vi.spyOn(world.deviceDB, 'readUnlock').mockRejectedValueOnce(refusal)
    expect(await TH.expectRefusal(world.open(), 'not_permitted')).to.eq(refusal)
  })

  it("ends its storage watch when the stored bundle does not parse", async () => {
    const world = makeWorld()
    world.dbStore.write(u1BundleCkey, '{"format":"not-a-vault"}')
    const tally = TH.tallyWatches(world.vaultDB)
    await TH.expectRefusal(world.open(), 'damaged_bundle')
    expect(tally).to.deep.equal({ opened: 1, closed: 1 })
  })

  it("leaves nothing listening: a later write starts no read on its behalf", async () => {
    const world = makeWorld()
    const reads = vi.spyOn(world.vaultDB, 'readBundle')
    reads.mockRejectedValueOnce(new VaultError('not_permitted', 'Sign in to reach this vault.'))
    await TH.expectRefusal(world.open(), 'not_permitted')
    const readsBefore = reads.mock.calls.length
    // Any write rings the store's change bell; only a handle still listening would read.
    world.dbStore.write('elsewhere', '{}')
    await TH.wakeupAtNextTick()
    expect(reads.mock.calls.length).to.eq(readsBefore)
  })

  it("leaves the vault to open cleanly once storage relents, with one live watch", async () => {
    const world = makeWorld()
    const tally = TH.tallyWatches(world.vaultDB)
    vi.spyOn(world.vaultDB, 'readBundle').mockRejectedValueOnce(new VaultError('not_permitted', 'Sign in to reach this vault.'))
    await TH.expectRefusal(world.open(), 'not_permitted')
    expect(await world.stateOnOpen()).to.eq('absent')
    expect(tally.opened - tally.closed).to.eq(1)
  })

  it("rejects with the very error even when ending its storage watch throws too", async () => {
    const world = makeWorld()
    const refusal = new VaultError('not_permitted', 'Sign in to reach this vault.')
    vi.spyOn(world.vaultDB, 'readBundle').mockRejectedValueOnce(refusal)
    vi.spyOn(world.vaultDB, 'subscribe').mockReturnValue(() => { throw new Error('the adapter could not unsubscribe') })
    const caught = await TH.expectRefusal(world.open(), 'not_permitted')
    expect(caught).to.eq(refusal)
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
    await vault.store('anthropic', 'sk-ant-fake')
    expect(await vault.read('anthropic')).to.eq('sk-ant-fake')
    expect(extractableUnwraps(spied)).to.have.lengthOf(1)
  })

  it("a remembered unlock never makes an extractable handle at all", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.store('anthropic', 'sk-ant-fake')
    const spied = watchUnwraps()
    const later = await world.open()
    expect(later.getSnapshot().state).to.eq('unlocked')
    expect(await later.read('anthropic')).to.eq('sk-ant-fake')
    expect(extractableUnwraps(spied)).to.have.lengthOf(0)
  })

  it("changePassphrase asks for exactly one extractable transient, for the new wraps", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.store('anthropic', 'sk-ant-fake')
    const spied = watchUnwraps()
    await vault.changePassphrase('pw one', 'pw two')
    expect(await vault.read('anthropic')).to.eq('sk-ant-fake')
    expect(extractableUnwraps(spied)).to.have.lengthOf(1)
  })
})

// vaultOne's adapter hears no change bells, so it genuinely does not notice vaultTwo's doings
// until it next touches the backend: the stale-device scenario, miniaturized. The reborn vault
// has a new vault_id and its own passphrase.
const rebornWorld = async () => {
  const world = makeWorld()
  const vaultOne = await world.openUnlocked('pw one', { vaultDB: world.deafVaultDB() })
  await vaultOne.store('anthropic', 'sk-ant-fake-old')
  const vaultTwo = await world.open()
  await vaultTwo.destroy()
  await vaultTwo.unlock('pw two')
  await vaultTwo.store('anthropic', 'sk-ant-fake-new')
  return { world, vaultOne, vaultTwo }
}

describe("a stale session cannot reach into a vault reborn elsewhere", () => {
  it("store() is refused by storage as stale, and its retry finds the device relocked, instead of landing in the reborn vault", async () => {
    const { vaultOne, vaultTwo } = await rebornWorld()
    expect(vaultOne.getSnapshot().state).to.eq('unlocked')
    await TH.expectRefusal(vaultOne.store('anthropic', 'sk-ant-fake-stale'), 'vault_locked')
    expect(vaultOne.getSnapshot().state).to.eq('locked')
    expect(await vaultTwo.read('anthropic')).to.eq('sk-ant-fake-new')
  })

  it("store() of a box the reborn vault has never held is refused all the same", async () => {
    const { vaultOne, vaultTwo } = await rebornWorld()
    await TH.expectRefusal(vaultOne.store('openai', 'sk-fake-stale'), 'vault_locked')
    expect(boxlabelsOf(vaultTwo)).to.deep.equal(['anthropic'])
  })

  it("erase() is refused by storage as stale, and relocks: the reborn vault keeps its box", async () => {
    const { vaultOne, vaultTwo } = await rebornWorld()
    expect(vaultOne.getSnapshot().state).to.eq('unlocked')
    await TH.expectRefusal(vaultOne.erase('anthropic'), 'stale_write')
    expect(vaultOne.getSnapshot().state).to.eq('locked')
    expect(await vaultTwo.read('anthropic')).to.eq('sk-ant-fake-new')
  })

  it("destroy() is refused by storage as stale: the reborn vault survives, and a second destroy() takes it", async () => {
    const { world, vaultOne, vaultTwo } = await rebornWorld()
    await TH.expectRefusal(vaultOne.destroy(), 'stale_write')
    expect(await vaultTwo.read('anthropic')).to.eq('sk-ant-fake-new')
    expect(vaultOne.getSnapshot().state).to.eq('locked')
    await vaultOne.destroy()
    expect(vaultOne.getSnapshot().state).to.eq('absent')
    expect(world.dbStore.ckeys()).to.have.lengthOf(0)
  })

  it("destroy() aims at the vault seen when it was called, not one a change bell brings in while it runs", async () => {
    const world = makeWorld()
    let meanwhile: (() => Promise<void>) | null = null
    const slowDeviceDB = {
      ...world.deviceDB,
      eraseUnlock: async (scope: Parameters<typeof world.deviceDB.eraseUnlock>[0]) => {
        await world.deviceDB.eraseUnlock(scope)
        const pending = meanwhile
        meanwhile = null
        if (pending !== null) { await pending() }
      },
    }
    const vaultOne = await world.openUnlocked('pw one', { deviceDB: slowDeviceDB })
    const vaultTwo = await world.open({ deviceDB: memoryDeviceDB() })
    meanwhile = async () => {
      await vaultTwo.destroy()
      await vaultTwo.unlock('pw two')
      await vaultTwo.store('anthropic', 'sk-ant-fake-new')
      // Let vaultOne's background refreshes, rung by the writes above, settle on the reborn vault.
      await TH.wakeupAtNextTick()
    }
    await TH.expectRefusal(vaultOne.destroy(), 'stale_write')
    expect(await vaultTwo.read('anthropic')).to.eq('sk-ant-fake-new')
  })

  it("changePassphrase() proves against the standing bundle, never burying the reborn one", async () => {
    const { vaultOne, vaultTwo } = await rebornWorld()
    await TH.expectRefusal(vaultOne.changePassphrase('pw one', 'pw three'), 'wrong_passphrase')
    await vaultTwo.lock()
    await vaultTwo.unlock('pw two')
    expect(await vaultTwo.read('anthropic')).to.eq('sk-ant-fake-new')
  })

  it("unlock() syncs first: the reborn vault's own passphrase opens it from the stale handle", async () => {
    const { vaultOne } = await rebornWorld()
    await TH.expectRefusal(vaultOne.store('anthropic', 'sk-ant-fake-stale'), 'vault_locked')
    await vaultOne.unlock('pw two')
    expect(await vaultOne.read('anthropic')).to.eq('sk-ant-fake-new')
  })

  it("store() into a vault destroyed elsewhere, and not remade, is refused and finds it absent", async () => {
    const world = makeWorld()
    const vaultOne = await world.openUnlocked('pw one', { vaultDB: world.deafVaultDB() })
    const vaultTwo = await world.open()
    await vaultTwo.destroy()
    await TH.expectRefusal(vaultOne.store('anthropic', 'sk-ant-fake-stale'), 'vault_locked')
    expect(vaultOne.getSnapshot().state).to.eq('absent')
    expect(world.dbStore.ckeys()).to.have.lengthOf(0)
  })

  it("destroy() of a vault destroyed elsewhere, and not remade, is refused as stale; a second destroy() is quiet", async () => {
    const world = makeWorld()
    const vaultOne = await world.openUnlocked('pw one', { vaultDB: world.deafVaultDB() })
    const vaultTwo = await world.open()
    await vaultTwo.destroy()
    await TH.expectRefusal(vaultOne.destroy(), 'stale_write')
    expect(vaultOne.getSnapshot().state).to.eq('absent')
    await vaultOne.destroy()
    expect(vaultOne.getSnapshot().state).to.eq('absent')
  })
})

/**
 * Two devices on one vault, and a way to slip `there`'s doings between `here`'s look at storage
 * and its write: `beforeNextWrite` runs once, inside the next call to the verb it names, before
 * the write itself reaches storage. `here` has a vaultDB of its own over the shared store, so
 * `hereDB` sees only its writes, whatever `there` does. `hereOpts` override `here`'s options.
 */
const twoDeviceWorld = async (hereOpts?: Partial<OpenVaultOpts>) => {
  const world = makeWorld()
  const hereDB = localVaultDB(world.dbStore)
  const here = await world.openUnlocked('shared pw', { vaultDB: hereDB, ...hereOpts })
  const there = await world.openUnlocked('shared pw', { deviceDB: memoryDeviceDB() })
  const beforeNextWrite = (verb: 'updateBox' | 'updateBundle', meanwhile: () => Promise<void>) => {
    TH.beforeNextCall(hereDB, verb, meanwhile)
  }
  return { world, hereDB, here, there, beforeNextWrite }
}

/**
 * A retry waits seconds before it reads again; a test must not. These stand the clock still and
 * let a test hand it forward: `waits` records each delay `setTimeout` was asked for.
 */
const stillClock = () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  return vi.spyOn(globalThis, 'setTimeout')
}

/** Let real work (WebCrypto, the stores) run one turn; the faked clock does not move. */
const realTurn = () => new Promise<void>((resolve) => { setImmediate(resolve) })

/** Run until `waits` holds a delay, i.e. until the operation under test is asleep. */
const untilAsleep = async (waits: ReturnType<typeof stillClock>) => {
  while (delaysAsked(waits).length === 0) { await realTurn() }
}

/** Hand the faked clock forward until `operation` settles, and hand back its result, or its refusal. */
const drivenToEnd = async <ResultT>(operation: Promise<ResultT>): Promise<ResultT> => {
  const progress = { settled: false }
  const outcome = (async () => {
    try {
      return { result: await operation }
    } catch (err) {
      return { refusal: err }
    } finally {
      progress.settled = true
    }
  })()
  while (! progress.settled) {
    await vi.advanceTimersByTimeAsync(5 * 1000)
    await realTurn()
  }
  const finished = await outcome
  if ('refusal' in finished) { throw finished.refusal }
  return finished.result
}

/** Pin the random word the retry's jitter is drawn from (its four bytes, big-endian); other draws are untouched. */
const pinJitter = (word: number) => {
  const original = crypto.getRandomValues.bind(crypto)
  vi.spyOn(crypto, 'getRandomValues').mockImplementation(((filled: ArrayBufferView<ArrayBuffer>) => {
    if (filled.byteLength !== 4) { return original(filled) }
    new DataView(filled.buffer).setUint32(0, word)
    return filled
  }))
}

/** A rival gets in ahead of each of this device's writes, for as many as `losses` of them. */
const rivalBeforeEachWrite = (world: Awaited<ReturnType<typeof twoDeviceWorld>>, losses: number) => {
  const original = world.hereDB.updateBox.bind(world.hereDB)
  const updateBox = vi.spyOn(world.hereDB, 'updateBox').mockImplementation(async (...args) => {
    if (updateBox.mock.calls.length <= losses) {
      await world.there.store('anthropic', `sk-ant-fake-theirs-${String(updateBox.mock.calls.length)}`)
    }
    await original(...args)
  })
  return updateBox
}

/** The delays `setTimeout` was asked for, in order. */
/**
 * The waits a store asked for before its retries, in milliseconds: every timer set but those an
 * unlock arms to drop its key, which fall due a minute or more from when they are set.
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

  it("a store over a box written meanwhile elsewhere is tried again, and lands over theirs", async () => {
    const { hereDB, here, there, beforeNextWrite } = await twoDeviceWorld()
    await here.store('anthropic', 'sk-ant-fake-one')
    beforeNextWrite('updateBox', () => there.store('anthropic', 'sk-ant-fake-theirs'))
    const updateBox = vi.spyOn(hereDB, 'updateBox')
    await drivenToEnd(here.store('anthropic', 'sk-ant-fake-mine'))
    expect(updateBox).toHaveBeenCalledTimes(2)  // the one that raced, and the retry
    expect(await here.read('anthropic')).to.eq('sk-ant-fake-mine')
    expect(await there.read('anthropic')).to.eq('sk-ant-fake-mine')
    expect(here.getSnapshot().state).to.eq('unlocked')
    expect(here.getSnapshot().boxes).to.have.lengthOf(1)
  })

  it("each attempt is sealed afresh: the retry carries its own revision and lockboxKey, and the first's is not stored", async () => {
    const { hereDB, here, there, beforeNextWrite } = await twoDeviceWorld()
    await here.store('anthropic', 'sk-ant-fake-one')
    beforeNextWrite('updateBox', () => there.store('anthropic', 'sk-ant-fake-theirs'))
    const updateBox = vi.spyOn(hereDB, 'updateBox')
    await drivenToEnd(here.store('anthropic', 'sk-ant-fake-mine'))
    const [raced, landed] = updateBox.mock.calls.map(([, lockbox]) => lockbox)
    expect(landed?.revision_id).to.not.eq(raced?.revision_id)
    expect(landed?.lockbox_key_wrapped).to.not.deep.eq(raced?.lockbox_key_wrapped)
    const standing = await hereDB.readBox(TH.scopeOf('u1'), 'anthropic')
    expect(standing?.revision_id).to.eq(landed?.revision_id)
  })

  it("a retry takes the note the box now stands with, as the winner left it", async () => {
    const { here, there, beforeNextWrite } = await twoDeviceWorld()
    await here.store('anthropic', 'sk-ant-fake-one', { note: 'first' })
    beforeNextWrite('updateBox', () => there.store('anthropic', 'sk-ant-fake-theirs', { note: 'theirs' }))
    await drivenToEnd(here.store('anthropic', 'sk-ant-fake-mine'))
    expect(TH.summaryOf(here.getSnapshot().boxes[0])?.note).to.eq('theirs')
    expect(await there.read('anthropic')).to.eq('sk-ant-fake-mine')
  })

  it("a store that loses every attempt is refused as stale after exactly three, showing the box as it stands", async () => {
    const { hereDB, here, there } = await twoDeviceWorld()
    await here.store('anthropic', 'sk-ant-fake-one')
    const original = hereDB.updateBox.bind(hereDB)
    // A rival gets in ahead of each of this device's writes.
    const updateBox = vi.spyOn(hereDB, 'updateBox').mockImplementation(async (...args) => {
      await there.store('anthropic', `sk-ant-fake-theirs-${String(updateBox.mock.calls.length)}`)
      await original(...args)
    })
    await TH.expectRefusal(drivenToEnd(here.store('anthropic', 'sk-ant-fake-mine')), 'stale_write')
    expect(updateBox).toHaveBeenCalledTimes(3)
    expect(here.getSnapshot().state).to.eq('unlocked')
    expect(await here.read('anthropic')).to.eq('sk-ant-fake-theirs-3')
  })

  it("erase wins across a retry: a store over a box erased meanwhile is refused as stale, the box stays erased, and nothing is tried again", async () => {
    const { hereDB, here, there, beforeNextWrite } = await twoDeviceWorld()
    await here.store('anthropic', 'sk-ant-fake-one')
    beforeNextWrite('updateBox', () => there.erase('anthropic'))
    const updateBox = vi.spyOn(hereDB, 'updateBox')
    await TH.expectRefusal(here.store('anthropic', 'sk-ant-fake-mine'), 'stale_write')
    expect(updateBox).toHaveBeenCalledTimes(1)
    expect(delaysAsked(waits)).to.have.lengthOf(0)  // an erase is told of at once, not after a wait
    expect(here.getSnapshot().boxes).to.have.lengthOf(0)
    expect(here.getSnapshot().state).to.eq('unlocked')
    await TH.expectRefusal(there.read('anthropic'), 'absent_box')
  })

  it("a store of a box that did not exist, and is created meanwhile elsewhere, is tried again over theirs", async () => {
    const { hereDB, here, there, beforeNextWrite } = await twoDeviceWorld()
    beforeNextWrite('updateBox', () => there.store('anthropic', 'sk-ant-fake-theirs'))
    const updateBox = vi.spyOn(hereDB, 'updateBox')
    await drivenToEnd(here.store('anthropic', 'sk-ant-fake-mine'))
    expect(updateBox).toHaveBeenCalledTimes(2)
    expect(await there.read('anthropic')).to.eq('sk-ant-fake-mine')
  })

  it("a retry that finds its new box gone again counts the lockboxes afresh: refused as full, nothing written", async () => {
    const { hereDB, here, there, beforeNextWrite } = await twoDeviceWorld({ maxLockboxes: 2 })
    await here.store('anthropic', 'sk-ant-fake-one')
    // Attempt one reads gemini as absent and room for it; before its write, a rival makes gemini
    // and openai, so the write is refused as stale. Before the retry's read, the rival erases
    // gemini: the retry meets an absent box in a vault already holding its two others.
    beforeNextWrite('updateBox', async () => {
      await there.store('gemini', 'sk-fake-theirs')
      await there.store('openai', 'sk-fake-theirs')
    })
    const original = hereDB.readBox.bind(hereDB)
    const readBox = vi.spyOn(hereDB, 'readBox').mockImplementation(async (...args) => {
      if (readBox.mock.calls.length === 2) { await there.erase('gemini') }
      return await original(...args)
    })
    const updateBox = vi.spyOn(hereDB, 'updateBox')
    await TH.expectRefusal(drivenToEnd(here.store('gemini', 'sk-fake-mine')), 'vault_full')
    expect(readBox).toHaveBeenCalledTimes(2)
    expect(updateBox).toHaveBeenCalledTimes(1)
    expect(boxlabelsOf(here)).to.have.members(['anthropic', 'openai'])
  })

  it("a retry that finds the passphrase changed elsewhere finds the device relocked, and writes nothing", async () => {
    const { hereDB, here, there, beforeNextWrite } = await twoDeviceWorld()
    await here.store('anthropic', 'sk-ant-fake-one')
    beforeNextWrite('updateBox', async () => {
      await there.store('anthropic', 'sk-ant-fake-theirs')
      await there.changePassphrase('shared pw', 'their pw')
    })
    const updateBox = vi.spyOn(hereDB, 'updateBox')
    await TH.expectRefusal(here.store('anthropic', 'sk-ant-fake-mine'), 'vault_locked')
    expect(updateBox).toHaveBeenCalledTimes(1)
    expect(delaysAsked(waits)).to.have.lengthOf(0)  // a relock is told of at once, not after a wait
    expect(here.getSnapshot().state).to.eq('locked')
    await there.lock()
    await there.unlock('their pw')
    expect(await there.read('anthropic')).to.eq('sk-ant-fake-theirs')
  })

  it("an erase refused as stale is thrown at once, never tried again", async () => {
    const world = makeWorld()
    const hereDB = world.deafVaultDB()
    const here = await world.openUnlocked('pw one', { vaultDB: hereDB })
    await here.store('anthropic', 'sk-ant-fake-old')
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    await there.destroy()
    await there.unlock('pw two')
    await there.store('anthropic', 'sk-ant-fake-new')
    const eraseBox = vi.spyOn(hereDB, 'eraseBox')
    await TH.expectRefusal(here.erase('anthropic'), 'stale_write')
    expect(eraseBox).toHaveBeenCalledTimes(1)
    expect(await there.read('anthropic')).to.eq('sk-ant-fake-new')
  })

  it("a passphrase change racing another device's is refused as stale; theirs stands", async () => {
    const { here, there, beforeNextWrite } = await twoDeviceWorld()
    await here.store('anthropic', 'sk-ant-fake-one')
    beforeNextWrite('updateBundle', () => there.changePassphrase('shared pw', 'their pw'))
    await TH.expectRefusal(here.changePassphrase('shared pw', 'my pw'), 'stale_write')
    expect(here.getSnapshot().state).to.eq('locked')
    await TH.expectRefusal(here.unlock('my pw'), 'wrong_passphrase')
    await here.unlock('their pw')
    expect(await here.read('anthropic')).to.eq('sk-ant-fake-one')
  })

  describe("the wait before each retry", () => {
    it("a store that wins its first attempt waits for nothing", async () => {
      const { here } = await twoDeviceWorld()
      await here.store('anthropic', 'sk-ant-fake-one')
      await here.store('anthropic', 'sk-ant-fake-two')
      expect(delaysAsked(waits)).to.have.lengthOf(0)
    })

    it("a store that loses once waits 1 to 2 seconds, once, before its retry", async () => {
      const world = await twoDeviceWorld()
      await world.here.store('anthropic', 'sk-ant-fake-one')
      const updateBox = rivalBeforeEachWrite(world, 1)
      await drivenToEnd(world.here.store('anthropic', 'sk-ant-fake-mine'))
      expect(updateBox).toHaveBeenCalledTimes(2)
      expect(delaysAsked(waits)).to.have.lengthOf(1)
      expect(delaysAsked(waits)[0]).toBeGreaterThanOrEqual(1000)
      expect(delaysAsked(waits)[0]).toBeLessThan(2000)
    })

    it("a store that loses twice waits 1 to 2 seconds, then 2 to 4, and lands on its third attempt", async () => {
      const world = await twoDeviceWorld()
      await world.here.store('anthropic', 'sk-ant-fake-one')
      const updateBox = rivalBeforeEachWrite(world, 2)
      await drivenToEnd(world.here.store('anthropic', 'sk-ant-fake-mine'))
      expect(updateBox).toHaveBeenCalledTimes(3)
      const [first, second] = delaysAsked(waits)
      expect(delaysAsked(waits)).to.have.lengthOf(2)
      expect(first).toBeGreaterThanOrEqual(1000)
      expect(first).toBeLessThan(2000)
      expect(second).toBeGreaterThanOrEqual(2000)
      expect(second).toBeLessThan(4000)
      expect(await world.there.read('anthropic')).to.eq('sk-ant-fake-mine')
    })

    it("the windows are closed below: the lowest draw waits exactly the base, then double it", async () => {
      const world = await twoDeviceWorld()
      await world.here.store('anthropic', 'sk-ant-fake-one')
      rivalBeforeEachWrite(world, 2)
      pinJitter(0)
      await drivenToEnd(world.here.store('anthropic', 'sk-ant-fake-mine'))
      expect(delaysAsked(waits)).to.deep.eq([1000, 2000])
    })

    it("the windows are open above: the highest draw waits just under double the base, then just under four times it", async () => {
      const world = await twoDeviceWorld()
      await world.here.store('anthropic', 'sk-ant-fake-one')
      rivalBeforeEachWrite(world, 2)
      pinJitter((2 ** 32) - 1)
      await drivenToEnd(world.here.store('anthropic', 'sk-ant-fake-mine'))
      expect(delaysAsked(waits)).to.deep.eq([1999, 3999])
    })

    it("the third refusal is thrown at once: two waits in all, none after the last attempt", async () => {
      const world = await twoDeviceWorld()
      await world.here.store('anthropic', 'sk-ant-fake-one')
      const updateBox = rivalBeforeEachWrite(world, 3)
      await TH.expectRefusal(drivenToEnd(world.here.store('anthropic', 'sk-ant-fake-mine')), 'stale_write')
      expect(updateBox).toHaveBeenCalledTimes(3)
      expect(delaysAsked(waits)).to.have.lengthOf(2)
    })

    it("the retry waits before it reads: nothing is read or written while the store sleeps", async () => {
      const world = await twoDeviceWorld()
      await world.here.store('anthropic', 'sk-ant-fake-one')
      const updateBox = rivalBeforeEachWrite(world, 1)
      const readBox = vi.spyOn(world.hereDB, 'readBox')
      const storing = world.here.store('anthropic', 'sk-ant-fake-mine')
      await untilAsleep(waits)
      expect(updateBox).toHaveBeenCalledTimes(1)
      const readsWhileAsleep = readBox.mock.calls.length
      await realTurn()
      expect(readBox).toHaveBeenCalledTimes(readsWhileAsleep)
      await drivenToEnd(storing)
      expect(updateBox).toHaveBeenCalledTimes(2)
    })

    it("a vault locked during the wait is refused as locked when the store wakes, and nothing is written", async () => {
      const world = await twoDeviceWorld()
      await world.here.store('anthropic', 'sk-ant-fake-one')
      const updateBox = rivalBeforeEachWrite(world, 1)
      const refused = TH.expectRefusal(world.here.store('anthropic', 'sk-ant-fake-mine'), 'vault_locked')
      await untilAsleep(waits)
      await world.here.lock()
      await drivenToEnd(refused)
      expect(updateBox).toHaveBeenCalledTimes(1)
      expect(world.here.getSnapshot().state).to.eq('locked')
      expect(await world.there.read('anthropic')).to.eq('sk-ant-fake-theirs-1')
    })

    it("a box erased during the wait stays erased: the store is refused as stale when it wakes, with no further wait", async () => {
      const world = await twoDeviceWorld()
      await world.here.store('anthropic', 'sk-ant-fake-one')
      const updateBox = rivalBeforeEachWrite(world, 1)
      const refused = TH.expectRefusal(world.here.store('anthropic', 'sk-ant-fake-mine'), 'stale_write')
      await untilAsleep(waits)
      await world.there.erase('anthropic')
      await drivenToEnd(refused)
      expect(updateBox).toHaveBeenCalledTimes(1)
      expect(delaysAsked(waits)).to.have.lengthOf(1)
      await TH.expectRefusal(world.there.read('anthropic'), 'absent_box')
    })
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

describe("the logger", () => {
  it("hears nothing from a vault going about its business", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.store('anthropic', 'sk-fake', { note: 'work account' })
    await vault.read('anthropic')
    await vault.changePassphrase('pw', 'pw two')
    await vault.lockSoon(0.01)
    await vault.unlock('pw two')
    await vault.erase('anthropic')
    await vault.lock()
    world.advance(SevenDaysMillis * 2)
    await world.open()
    await vault.destroy()
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

  it("refuses a logger that is not one, before reading storage", async () => {
    const world = makeWorld()
    const readBundle = vi.spyOn(world.vaultDB, 'readBundle')
    for (const nonsense of [null, {}, { log: () => undefined, warn: () => undefined }, 'console']) {
      const err = await TH.expectRefusal(world.open({ logger: nonsense as unknown as OpenVaultOpts['logger'] }), 'bad_option')
      expect(err.message).to.match(/log, warn and error functions/)
    }
    expect(readBundle).not.toHaveBeenCalled()
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

  it("warns once when a remembered unlock could not be read, telling nothing of the record", async () => {
    const world = makeWorld()
    const device = uncheckingDeviceDB()
    await world.openUnlocked('pw', { deviceDB: device.deviceDB })
    device.spoilRow((row) => ({ ...row, ask_passphrase_at: 'soon' }))
    expect(await world.stateOnOpen({ deviceDB: device.deviceDB })).to.eq('locked')
    expect(world.logged).to.have.lengthOf(1)
    expect(world.logged[0]).to.deep.include({ level: 'warn', story: { call: 'openVault' }, err: undefined })
    expect(world.logged[0]?.message).to.match(/remembered unlock could not be read/)
  })

  it("warns when a remembered unlock would not open", async () => {
    const world = makeWorld()
    const device = uncheckingDeviceDB()
    await world.openUnlocked('pw', { deviceDB: device.deviceDB })
    device.spoilRow((row) => {
      const wrapped = row['vault_key_local_wrapped'] as { cipher_iv_b64: string, ciphertext_b64: string }
      return { ...row, vault_key_local_wrapped: { ...wrapped, ciphertext_b64: TH.tweakB64(wrapped.ciphertext_b64) } }
    })
    expect(await world.stateOnOpen({ deviceDB: device.deviceDB })).to.eq('locked')
    expect(world.logged.map((heard) => heard.level)).to.deep.equal(['warn'])
  })

  it("says nothing of an unreadable remembered unlock that could not be erased: the open rejects instead", async () => {
    const world = makeWorld()
    const device = uncheckingDeviceDB()
    await world.openUnlocked('pw', { deviceDB: device.deviceDB })
    device.spoilRow((row) => ({ ...row, ask_passphrase_at: 'soon' }))
    const jammed = new Error('the device store is closed')
    vi.spyOn(device.deviceDB, 'eraseUnlock').mockRejectedValueOnce(jammed)
    const err = await TH.expectRefusal(world.open({ deviceDB: device.deviceDB }), 'storage_unavailable')
    expect(err.cause).to.eq(jammed)
    expect(world.logged).to.have.lengthOf(0)
  })

  it("says nothing of a remembered unlock that simply ran out, or that a new passphrase outdated", async () => {
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
    await vault.store('anthropic', 'sk-fake')
    world.dbStore.write(u1BundleCkey, '{"format":"not-a-vault"}')
    await TH.wakeupAtNextTick()
    expect(world.logged.map((heard) => heard.level)).to.deep.equal(['warn'])
    expect(world.logged[0]?.story).to.deep.equal({ call: 'refresh' })
    expect((world.logged[0]?.err as VaultError).kind).to.eq('damaged_bundle')
    expect(vault.getSnapshot().boxes).to.have.lengthOf(1)  // the snapshot stands as it was
  })

  it("tells error when a failed open's storage watch would not close, and the open still rejects with its own error", async () => {
    const world = makeWorld()
    const refusal = new VaultError('not_permitted', 'Sign in to reach this vault.')
    const stuck = new Error('the adapter could not unsubscribe')
    vi.spyOn(world.vaultDB, 'readBundle').mockRejectedValueOnce(refusal)
    vi.spyOn(world.vaultDB, 'subscribe').mockReturnValue(() => { throw stuck })
    expect(await TH.expectRefusal(world.open(), 'not_permitted')).to.eq(refusal)
    expect(world.logged).to.have.lengthOf(1)
    expect(world.logged[0]).to.deep.include({ level: 'error', story: { call: 'openVault' }, err: stuck })
  })

  it("never breaks a lock, an open, a refresh or a failed open when it throws", async () => {
    const world = makeWorld()
    const logger = throwingLogger()
    const device = uncheckingDeviceDB()
    let reading = world.clock.now()
    const clock = { now: () => reading }
    const vault = await world.openUnlocked('pw', { logger, deviceDB: device.deviceDB, clock })
    await vault.store('anthropic', 'sk-fake')
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
    // an open that forgets an unreadable remembered unlock
    await vault.unlock('pw')
    device.spoilRow(() => 'not a record')
    expect(await world.stateOnOpen({ logger, deviceDB: device.deviceDB, clock })).to.eq('locked')
    // a failed open whose watch would not close
    vi.spyOn(world.vaultDB, 'readBundle').mockRejectedValueOnce(new VaultError('not_permitted', 'Sign in to reach this vault.'))
    vi.spyOn(world.vaultDB, 'subscribe').mockReturnValueOnce(() => { throw new Error('the adapter could not unsubscribe') })
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
    await vault.store('anthropic', whisper, { note: 'FAKESECRET note' })
    await vault.changePassphrase(passphrase, `${passphrase} two`)
    const secrets = storedSecrets(world)
    // every call site: a remembered unlock unreadable, a background refresh refused, a lock
    // without its grace (its error carrying the host clock's as its cause), a failed open's watch
    // stuck open
    device.spoilRow((row) => ({ ...row, ask_passphrase_at: `${passphrase} ${whisper}` }))
    const reopened = await world.open({ deviceDB: device.deviceDB, clock })
    reopened.close()
    world.dbStore.write(u1BundleCkey, JSON.stringify({ ...storedBundleOf(world), registered_at: whisper }))
    await TH.wakeupAtNextTick()
    clockBroken = true
    await vault.lockSoon()
    clockBroken = false
    vi.spyOn(world.vaultDB, 'readBundle').mockRejectedValueOnce(new VaultError('not_permitted', 'Sign in to reach this vault.'))
    vi.spyOn(world.vaultDB, 'subscribe').mockReturnValueOnce(() => { throw new Error('the adapter could not unsubscribe') })
    await TH.expectRefusal(world.open(), 'not_permitted')
    expect(world.logged.map((heard) => heard.level)).to.deep.equal(['warn', 'warn', 'warn', 'error'])
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
  const RevokedCallCases: readonly (readonly [string, 'readBundle' | 'readBox' | 'updateBox' | 'updateBundle', (vault: Vault) => Promise<unknown>])[] = [
    ['read()',             'readBox',      (vault) => vault.read('anthropic')],
    ['store()',            'updateBox',    (vault) => vault.store('openai', 'sk-fake-two')],
    ['unlock()',           'readBundle',   (vault) => vault.unlock('pw one')],
    ['changePassphrase()', 'updateBundle', (vault) => vault.changePassphrase('pw one', 'pw two')],
  ]

  for (const [callTitle, verb, call] of RevokedCallCases) {
    it(`locks at once when ${callTitle} meets it, throws the refusal itself, and erases nothing stored`, async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw one')
      await vault.store('anthropic', 'sk-fake-one')
      const refusal = signedOut()
      vi.spyOn(world.vaultDB, verb).mockRejectedValueOnce(refusal)
      expect(await TH.expectRefusal(call(vault), 'identity_revoked')).to.eq(refusal)
      expect(vault.getSnapshot().state).to.eq('locked')
      expect(vault.getSnapshot().askPassphraseAt).to.be.null
      expect(await world.rememberedUnlock()).to.be.null
      await TH.expectRefusal(vault.read('anthropic'), 'vault_locked')
      // Signed in again: the passphrase it had still opens it, and the lockbox is still there.
      await vault.unlock('pw one')
      expect(await vault.read('anthropic')).to.eq('sk-fake-one')
    })
  }

  it("locks when a background refresh meets it, and tells the logger, having nobody to throw to", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    vi.spyOn(world.vaultDB, 'readBundle').mockRejectedValue(signedOut())
    // Any write rings the store's change bell, and the vault looks.
    world.dbStore.write('elsewhere', '{}')
    await vi.waitFor(() => { expect(vault.getSnapshot().state).to.eq('locked') })
    expect(await world.rememberedUnlock()).to.be.null
    await vi.waitFor(() => { expect(world.logged.map((heard) => heard.level)).to.deep.equal(['log', 'warn']) })
    expect(world.logged[0]).to.deep.include({ level: 'log', story: { call: 'whenIdentityRevoked' } })
    expect(world.logged[0]?.message).to.match(/no longer serves the user/)
  })

  it("calls subscribers with the locked snapshot", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    const heard: string[] = []
    vault.subscribe(() => { heard.push(vault.getSnapshot().state) })
    vi.spyOn(world.vaultDB, 'readBox').mockRejectedValueOnce(signedOut())
    await TH.expectRefusal(vault.read('anthropic'), 'identity_revoked')
    expect(heard).to.deep.equal(['locked'])
  })

  it("wins over an unlock under way, as lock() does: it throws 'vault_locked' and remembers nothing", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.lock()
    const gate = world.holdNextDerive()
    const unlocking = TH.expectRefusal(vault.unlock('pw one'), 'vault_locked')
    await gate.reached
    vi.spyOn(world.vaultDB, 'readBundle').mockRejectedValueOnce(signedOut())
    world.dbStore.write('elsewhere', '{}')
    await vi.waitFor(() => { expect(world.logged.map((heard) => heard.level)).to.include('warn') })
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.rememberedUnlock()).to.be.null
  })

  it("forgets the remembered unlock when it meets the open, which then refuses", async () => {
    const world = makeWorld()
    const first = await world.openUnlocked('pw one')
    first.close()
    expect(await world.rememberedUnlock()).to.not.be.null
    vi.spyOn(world.vaultDB, 'readBundle').mockRejectedValueOnce(signedOut())
    await TH.expectRefusal(world.open(), 'identity_revoked')
    expect(await world.rememberedUnlock()).to.be.null
    expect(await world.stateOnOpen()).to.eq('locked')
  })

  it("wins over the remembered unlock an open is picking up, when a background refresh meets it meanwhile", async () => {
    const world = makeWorld()
    const first = await world.openUnlocked('pw one')
    first.close()
    const readUnlock = world.deviceDB.readUnlock.bind(world.deviceDB)
    vi.spyOn(world.deviceDB, 'readUnlock').mockImplementationOnce(async (scope) => {
      const kept = await readUnlock(scope)
      // The open's own read is past; the next, a background refresh's, meets the sign-out.
      vi.spyOn(world.vaultDB, 'readBundle').mockRejectedValueOnce(signedOut())
      world.dbStore.write('elsewhere', '{}')
      await vi.waitFor(async () => { expect(await readUnlock(scope)).to.be.null })
      return kept
    })
    const vault = await world.open()
    expect(vault.getSnapshot().state).to.eq('locked')
    await TH.expectRefusal(vault.read('anthropic'), 'vault_locked')
  })

  it("leaves the vault as it was under whenIdentityRevoked 'stay', still throwing the refusal", async () => {
    const world = makeWorld({ whenIdentityRevoked: 'stay' })
    const vault = await world.openUnlocked('pw one')
    await vault.store('anthropic', 'sk-fake-one')
    vi.spyOn(world.vaultDB, 'readBox').mockRejectedValueOnce(signedOut())
    await TH.expectRefusal(vault.read('anthropic'), 'identity_revoked')
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(await world.rememberedUnlock()).to.not.be.null
    expect(await vault.read('anthropic')).to.eq('sk-fake-one')
    expect(world.logged).to.deep.equal([])
  })

  it("locks nothing for not_permitted: the vault's own user, refused one call", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    vi.spyOn(world.vaultDB, 'readBox').mockRejectedValueOnce(new VaultError('not_permitted', 'You may not read this vault.'))
    await TH.expectRefusal(vault.read('anthropic'), 'not_permitted')
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(await world.rememberedUnlock()).to.not.be.null
  })

  it("locks all the same, and throws the refusal, when the device store will not forget the remembered unlock", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    const stuck = new Error('the device store is read-only')
    vi.spyOn(world.deviceDB, 'eraseUnlock').mockRejectedValueOnce(stuck)
    vi.spyOn(world.vaultDB, 'readBox').mockRejectedValueOnce(signedOut())
    await TH.expectRefusal(vault.read('anthropic'), 'identity_revoked')
    expect(vault.getSnapshot().state).to.eq('locked')
    await TH.expectRefusal(vault.read('anthropic'), 'vault_locked')
    expect(world.logged[0]).to.deep.include({ level: 'warn', story: { call: 'whenIdentityRevoked' }, err: stuck })
  })

  it("refuses a whenIdentityRevoked that is neither 'lock' nor 'stay'", async () => {
    const world = makeWorld()
    await TH.expectRefusal(world.open({ whenIdentityRevoked: 'erase' as unknown as 'lock' }), 'bad_option')
  })
})

/** This device's mark for `u1`'s vault, as its deviceDB keeps it. */
const markIn = (world: ReturnType<typeof makeWorld>) => world.deviceDB.readMark(TH.scopeOf('u1'))

/** The stored bundle's ways in, as the backend holds them. */
const storedUnlocksOf = (world: ReturnType<typeof makeWorld>) => storedBundleOf(world)['unlocks'] as Record<string, unknown>[]

describe("the device mark", () => {
  it("is kept from the vault's making: its vault_id, the epoch seen, and an id of its own, which the first way in carries", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const mark = await markIn(world)
    const bundle = storedBundleOf(world)
    expect(mark).to.deep.include({ format: 'safebyok-mark-v2', ...TH.scopeOf('u1'), vault_id: bundle['vault_id'], unlock_epoch: 1, vault_key_epoch: 1, lock_generation: 0 })
    expect(storedUnlocksOf(world)[0]).to.deep.include({ device_id: mark?.device_id, vault_key_epoch: 1, registered_at: world.clock.now() })
  })

  it("is started under the id the first way in carries, though a refresh the vault's making set off gets there first", async () => {
    const world = makeWorld()
    const vault = await world.open()
    const createBundle = world.vaultDB.createBundle.bind(world.vaultDB)
    // The write rings this handle's own watch, whose refresh runs to its end before the unlock goes on.
    vi.spyOn(world.vaultDB, 'createBundle').mockImplementationOnce(async (...args) => {
      const settled = await createBundle(...args)
      await TH.wakeupAtNextTick()
      return settled
    })
    await vault.unlock('pw')
    const mark = await markIn(world)
    expect(storedUnlocksOf(world)[0]?.['device_id']).to.eq(mark?.device_id)
  })

  it("rises with each newer bundle, its own writes and another device's, and every way in this device adds carries its id", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const { device_id: deviceId } = await markIn(world) ?? {}
    world.advance(HourMillis)
    await vault.addPassphrase('pw', 'spare phrase', { unlocklabel: 'spare' })
    expect(await markIn(world)).to.deep.include({ device_id: deviceId, unlock_epoch: 2 })
    expect(storedUnlocksOf(world)[1]).to.deep.include({ device_id: deviceId, registered_at: world.clock.now() })
    const elsewhere = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
    await elsewhere.addPassphrase('pw', 'third phrase', { unlocklabel: 'third' })
    await TH.wakeupAtNextTick()
    expect(await markIn(world)).to.deep.include({ device_id: deviceId, unlock_epoch: 3 })
    expect(storedUnlocksOf(world)[2]?.['device_id']).to.be.a('string').and.not.eq(deviceId)
  })

  it("keeps a way in's device and time when its passphrase changes", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const [before] = storedUnlocksOf(world)
    world.advance(HourMillis)
    await vault.changePassphrase('pw', 'pw two')
    const [after] = storedUnlocksOf(world)
    expect(after).to.deep.include({ device_id: before?.['device_id'], registered_at: before?.['registered_at'], unlock_id: before?.['unlock_id'] })
    expect(after?.['salt_b64']).to.not.eq(before?.['salt_b64'])
  })

  it("survives lock(), and destroy() erases it", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.lock()
    expect(await markIn(world)).to.not.be.null
    await vault.destroy()
    expect(await markIn(world)).to.be.null
  })

  it("starts anew, under a new id, for a vault made anew under the scope", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.addPassphrase('pw', 'spare phrase', { unlocklabel: 'spare' })
    const before = await markIn(world)
    vault.close()
    const elsewhere = await world.open({ deviceDB: memoryDeviceDB() })
    await elsewhere.destroy()
    await elsewhere.unlock('pw anew')
    await world.open()
    const after = await markIn(world)
    expect(after).to.deep.include({ vault_id: storedBundleOf(world)['vault_id'], unlock_epoch: 1 })
    expect(after?.vault_id).to.not.eq(before?.vault_id)
    expect(after?.device_id).to.not.eq(before?.device_id)
  })

  it("reads a mark naming another scope as none, says so through the logger, and starts again", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const before = await markIn(world)
    // Every read of the mark at this open hands back u2's: the one before the bundle, and the one after.
    const misfiled = vi.spyOn(world.deviceDB, 'readMark').mockResolvedValue(TH.markOf('u2', { unlock_epoch: 9 }))
    await world.open()
    misfiled.mockRestore()
    expect(world.logged.map((call) => call.level)).to.deep.equal(['warn'])
    expect(world.logged[0]?.message).to.include('mark')
    const after = await markIn(world)
    expect(after?.device_id).to.not.eq(before?.device_id)
  })

  it("is erased by eraseDamagedVault, with the vault", async () => {
    const world = await damagedVaultWorld()
    expect(await markIn(world)).to.not.be.null
    await eraseDamagedVault(world.optsWith())
    expect(await markIn(world)).to.be.null
  })
})

/**
 * A world whose `u1` vault had a way in, `spare`, removed, and the vault's bundle text from before
 * the removal, for storage to hand back.
 */
const rolledBackWorld = async () => {
  const world = makeWorld()
  const vault = await world.openUnlocked('pw')
  const spareId = await vault.addPassphrase('pw', 'spare phrase', { unlocklabel: 'spare' })
  const older = world.dbStore.read(u1BundleCkey) ?? ''
  await vault.removeUnlock('pw', spareId)
  const newer = world.dbStore.read(u1BundleCkey) ?? ''
  return { world, vault, older, newer }
}

/**
 * The README's recipe for a vault whose storage was restored from an older copy on purpose: open
 * it, and on 'rolled_back', when the host knows of the restore, erase this device's mark and open
 * it again; any other refusal goes on up.
 */
const openAcceptingRestore = async (opts: OpenVaultOpts, storageWasRestoredOnPurpose: () => Promise<boolean>): Promise<Vault> => {
  try {
    return await openVault(opts)
  } catch (err) {
    if (! isVaultError(err, 'rolled_back') || ! await storageWasRestoredOnPurpose()) { throw err }
    await opts.deviceDB.eraseMark({ applabel: opts.applabel, user_id: opts.userId, vaultlabel: opts.vaultlabel })
    return await openVault(opts)
  }
}

describe("a bundle rolled back", () => {
  it("refuses an older copy at open as rolled_back, writing nothing, and quoting none of it", async () => {
    const { world, vault, older } = await rolledBackWorld()
    vault.close()
    world.dbStore.write(u1BundleCkey, older)
    const err = await TH.expectRefusal(world.open(), 'rolled_back')
    expect(err.message).to.include('already seen a newer copy')
    expect(err.message).to.include('eraseMark')
    expect(err.message).to.not.include('Try again later')
    expect(TH.thrownText(err)).to.not.include((JSON.parse(older) as { vault_id: string }).vault_id)
    expect(world.dbStore.read(u1BundleCkey)).to.eq(older)
    expect(await markIn(world)).to.deep.include({ unlock_epoch: 3 })
  })

  it("refuses an older copy at unlock, so a removed way in stays removed on this device", async () => {
    const { world, vault, older } = await rolledBackWorld()
    await vault.lock()
    const deaf = await world.open({ vaultDB: world.deafVaultDB() })
    world.dbStore.write(u1BundleCkey, older)
    await TH.expectRefusal(deaf.unlock('spare phrase'), 'rolled_back')
    expect(deaf.getSnapshot().state).to.eq('locked')
    expect(deaf.getSnapshot().unlocks.map((unlock) => unlock.unlocklabel)).to.deep.equal(['passphrase'])
    expect(await world.rememberedUnlock()).to.be.null
  })

  it("refuses an older copy at a background refresh, leaving the vault as it stood, and says so through the logger", async () => {
    const { world, vault, older } = await rolledBackWorld()
    const standing = vault.getSnapshot()
    world.dbStore.write(u1BundleCkey, older)
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot()).to.eq(standing)
    expect(standing.state).to.eq('unlocked')
    expect(world.logged.map((call) => [call.level, (call.err as VaultError | null | undefined)?.kind])).to.deep.equal([['warn', 'rolled_back']])
  })

  it("refuses no copy that was the newest when storage handed it back, though another tab of this device raised the mark meanwhile", async () => {
    const world = makeWorld()
    const here = await world.openUnlocked('pw')
    const slowVaultDB = world.deafVaultDB()
    const there = await world.open({ vaultDB: slowVaultDB })
    const readBundle = slowVaultDB.readBundle.bind(slowVaultDB)
    // There's next read is served at epoch 1, and handed back only once here's change has landed.
    vi.spyOn(slowVaultDB, 'readBundle').mockImplementationOnce(async (...args) => {
      const served = await readBundle(...args)
      await here.addPassphrase('pw', 'spare phrase', { unlocklabel: 'spare' })
      return served
    })
    await there.unlock('pw')
    expect(there.getSnapshot().state).to.eq('unlocked')
    expect(await markIn(world)).to.deep.include({ unlock_epoch: 2 })
  })

  it("refuses no vault another tab made while this one was making it, though that tab raised the mark meanwhile", async () => {
    const world = makeWorld()
    const there = await world.open()
    const slowVaultDB = world.deafVaultDB()
    const late = await world.open({ vaultDB: slowVaultDB })
    const createBundle = slowVaultDB.createBundle.bind(slowVaultDB)
    // There makes the vault first, so late's write hands back there's bundle at epoch 1, and only
    // after that does there change it, raising the mark this device shares to epoch 2.
    vi.spyOn(slowVaultDB, 'createBundle').mockImplementationOnce(async (...args) => {
      await there.unlock('pw')
      const settled = await createBundle(...args)
      await there.changePassphrase('pw', 'pw two')
      return settled
    })
    await late.unlock('pw')
    expect(late.getSnapshot().state).to.eq('unlocked')
    expect(await markIn(world)).to.deep.include({ unlock_epoch: 2 })
  })

  it("takes the copy up again once storage hands back the newest", async () => {
    const { world, vault, older, newer } = await rolledBackWorld()
    vault.close()
    world.dbStore.write(u1BundleCkey, older)
    await TH.expectRefusal(world.open(), 'rolled_back')
    world.dbStore.write(u1BundleCkey, newer)
    const reopened = await world.open()
    expect(reopened.getSnapshot().state).to.eq('unlocked')
  })

  it("refuses an older copy at a lower vaultKey epoch as rolled_back, though storage raised its unlock epoch past the one seen", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    vault.close()
    const first = storedBundleOf(world) as unknown as VaultBundle
    const second: VaultBundle = {
      ...first,
      unlock_epoch:    2,
      vault_key_epoch: 2,
      prior_vault_key: { vault_key_epoch: 1, vault_key_wrapped: TH.fakeCiphered('prior') },
      unlocks:         first.unlocks.map((envelope) => ({ ...envelope, vault_key_epoch: 2 })),
    }
    world.dbStore.write(u1BundleCkey, JSON.stringify(second))
    await world.open()
    expect(await markIn(world)).to.deep.include({ unlock_epoch: 2, vault_key_epoch: 2 })
    world.dbStore.write(u1BundleCkey, JSON.stringify({ ...first, unlock_epoch: 9 }))
    await TH.expectRefusal(world.open(), 'rolled_back')
    expect(await markIn(world)).to.deep.include({ unlock_epoch: 2, vault_key_epoch: 2 })
  })

  it("takes an older copy at the same vaultKey epoch under a raised unlock epoch as it stands, its removed way in opening again", async () => {
    const { world, vault, older } = await rolledBackWorld()
    vault.close()
    world.dbStore.write(u1BundleCkey, JSON.stringify({ ...(JSON.parse(older) as object), unlock_epoch: 9 }))
    const reopened = await world.open()
    await reopened.unlock('spare phrase')
    expect(reopened.getSnapshot().state).to.eq('unlocked')
  })

  it("is accepted on this device once its mark of the vault is erased, as the README's recipe does", async () => {
    const { world, vault, older } = await rolledBackWorld()
    vault.close()
    world.dbStore.write(u1BundleCkey, older)
    const reopened = await openAcceptingRestore(world.optsWith(), () => Promise.resolve(true))
    expect(reopened.getSnapshot().unlocks.map((unlock) => unlock.unlocklabel)).to.deep.equal(['passphrase', 'spare'])
    expect(await markIn(world)).to.deep.include({ unlock_epoch: 2 })
  })

  it("is still refused by the README's recipe when the host knows of no restore", async () => {
    const { world, vault, older } = await rolledBackWorld()
    vault.close()
    world.dbStore.write(u1BundleCkey, older)
    await TH.expectRefusal(openAcceptingRestore(world.optsWith(), () => Promise.resolve(false)), 'rolled_back')
    expect(await markIn(world)).to.deep.include({ unlock_epoch: 3 })
  })

  it("is not caught on a device that never saw the newer copy, which takes the older as it stands", async () => {
    const { world, older } = await rolledBackWorld()
    world.dbStore.write(u1BundleCkey, older)
    const stranger = await world.open({ deviceDB: memoryDeviceDB() })
    await stranger.unlock('spare phrase')
    expect(stranger.getSnapshot().state).to.eq('unlocked')
  })
})

describe("the vaultKey's epoch", () => {
  it("makes a vault at its first vaultKey, with no prior one", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    expect(storedBundleOf(world)).to.deep.include({ format: 'safebyok-vault-v2', vault_key_epoch: 1 })
    expect(storedBundleOf(world)).to.not.have.property('prior_vault_key')
  })

  it("seals each lockbox under the bundle's vaultKey, its epoch shown in the listing while locked", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.store('anthropic', 'sk-fake')
    await vault.lock()
    expect(storedRowOf(world, 'anthropic')).to.deep.include({ format: 'safebyok-lockbox-v2', vault_key_epoch: 1 })
    expect(TH.summaryOf(vault.getSnapshot().boxes[0])?.vault_key_epoch).to.eq(1)
  })

  it("refuses as damaged_lockbox a lockbox that says it was sealed under another vaultKey, quoting not its boxlabel", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.store('anthropic', 'sk-fake')
    world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify({ ...storedRowOf(world, 'anthropic'), vault_key_epoch: 2 }))
    const err = await TH.expectRefusal(vault.read('anthropic'), 'damaged_lockbox')
    expect(err.message).to.include('does not hold')
    expect(TH.thrownText(err)).to.not.include('anthropic')
  })

  it("writes nothing from a device still holding a vaultKey since replaced, which has not looked at the bundle since", async () => {
    const world = makeWorld()
    const stale = await world.openUnlocked('pw', { vaultDB: world.deafVaultDB() })
    const standing = storedBundleOf(world) as unknown as VaultBundle
    const replaced: VaultBundle = {
      ...standing,
      unlock_epoch:    2,
      vault_key_epoch: 2,
      prior_vault_key: { vault_key_epoch: 1, vault_key_wrapped: TH.fakeCiphered('prior') },
      unlocks:         standing.unlocks.map((envelope) => ({ ...envelope, vault_key_epoch: 2 })),
    }
    await world.vaultDB.updateBundle(replaced, { vault_id: standing.vault_id, unlock_epoch: 1 })
    await TH.expectRefusal(stale.store('anthropic', 'sk-fake'), 'vault_locked')
    expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.be.null
  })

  it("opens a vault stored before vaultKey epochs as damaged_bundle, which eraseDamagedVault clears", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.store('anthropic', 'sk-fake')
    vault.close()
    const { vault_key_epoch: _epoch, ...older } = storedBundleOf(world)
    world.dbStore.write(u1BundleCkey, JSON.stringify({ ...older, format: 'safebyok-vault-v1' }))
    await TH.expectRefusal(world.open(), 'damaged_bundle')
    await eraseDamagedVault(world.optsWith())
    expect(rowsOf(world, 'u1')).to.deep.equal([])
  })
})
