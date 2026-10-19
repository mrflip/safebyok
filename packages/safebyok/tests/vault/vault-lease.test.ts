import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FarFuture, FarPast, LeaseHours, MaxLeaseHours, MinuteMillis, ForeverMillis } from '../../src/types'
import { memoryDeviceDB } from '../../src/device-db'
import { Vault } from '../../src/vault'
import * as TH from '../test-helpers'
import { makeWorld, SevenDaysMillis, HourMillis, uncheckingDeviceDB, makeRacingWorld, vaultWithPasskey, boxlabelsOf } from './world'


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
    it(`reads a lease's deadline moved an hour ${blurb} on the device as no lease, discards it, and says so: the deadline is bound into its wrap`, async () => {
      const world = makeWorld()
      await world.openUnlocked('pw one')
      const written = await world.readLease()
      if (written === null) { throw new Error('expected a lease on the device') }
      await world.deviceDB.writeLease({ ...written, ask_passphrase_at: written.ask_passphrase_at + shiftMillis })
      // Under Infinity no window check refuses it, and an hour either way stays in bounds: only the ctx can.
      const reopened = await world.open({ leaseHours: Infinity })
      expect(reopened.getSnapshot().state).to.eq('locked')
      expect(await world.readLease()).to.be.null
      expect(world.logged.map((call) => call.level)).to.deep.eq(['warn'])
    })
  }

  for (const [askPassphraseAt, blurb] of OutOfBoundsDeadlines) {
    it(`reads a lease's deadline of ${blurb} as no lease, and discards it`, async () => {
      const world = makeWorld()
      await world.openUnlocked('pw one')
      const written = await world.readLease()
      if (written === null) { throw new Error('expected a lease on the device') }
      await world.deviceDB.writeLease({ ...written, ask_passphrase_at: askPassphraseAt })
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

  it("is MaxLeaseHours at most, short of what one timer reaches", () => {
    expect(MaxLeaseHours).to.eq(588)
    expect(MaxLeaseHours * HourMillis).to.be.below((2 ** 31) - 1)
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

/** The deadline of this world's device's lease, or null when it keeps none. */
const leaseDeadlineOf = async (world: ReturnType<typeof makeWorld>): Promise<number | null> => {
  const lease = await world.readLease()
  return lease?.ask_passphrase_at ?? null
}

describe("the lease, when the host changes leaseHours", () => {
  it("lowered from Infinity to one hour, discards a lease already granted at its next open, and the next unlock lasts an hour", async () => {
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

  it("keeps a deadline exactly at the new window's end, and discards one a millisecond past it", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw one', { leaseHours: 12 })
    const oneMilliShort = 12 - (1 / HourMillis)
    world.advance(1)
    expect(await world.stateOnOpen({ leaseHours: oneMilliShort })).to.eq('unlocked')
    world.advance(-1)
    expect(await world.stateOnOpen({ leaseHours: oneMilliShort })).to.eq('locked')
  })
})

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

describe("the lease, from a host's own DeviceDB", () => {
  it("is checked by the vault: a sound record spares the passphrase", async () => {
    const world = makeWorld()
    const device = uncheckingDeviceDB()
    await world.openUnlocked('pw one', { deviceDB: device.deviceDB })
    expect(await world.stateOnOpen({ deviceDB: device.deviceDB })).to.eq('unlocked')
  })

  for (const [spoil, blurb] of SpoiledWayins) {
    it(`reads ${blurb} as no lease, and discards it`, async () => {
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

  it("says through the logger that a record naming another scope was discarded", async () => {
    const world = makeWorld()
    const device = uncheckingDeviceDB()
    await world.openUnlocked('pw one', { deviceDB: device.deviceDB })
    device.spoilRow((row) => ({ ...row, user_id: 'u2' }))
    await world.open({ deviceDB: device.deviceDB })
    expect(world.logged.map((call) => call.level)).to.deep.equal(['warn'])
    expect(world.logged[0]?.message).to.include('could not be read or would not open, so it was discarded')
  })

  it("says once through the logger that a record from before the lease, under safebyok-unlock-v1, was discarded", async () => {
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

describe("natural expiry", () => {
  beforeEach(() => { fakeTheClock() })
  afterEach(() => { vi.useRealTimers() })

  it("says 'locked' to subscribers at askPassphraseAt, dropping the vaultKey then, with no call made", async () => {
    const world = makeTimedWorld()
    const vault = await world.openUnlocked('pw one', { leaseHours: 1 })
    const listener = vi.fn()
    vault.subscribe(listener)
    world.pass(HourMillis - 1)
    expect(listener).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).to.eq(1)
    world.pass(1)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).to.eq(0)
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(vault.getSnapshot().askPassphraseAt).to.be.null
    await TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
  })

  it("drops a key whose timer has not run by its deadline at the next look: the threshold is the truth", async () => {
    const world = makeTimedWorld()
    const vault = await world.openUnlocked('pw one', { leaseHours: 1 })
    world.advance(HourMillis)  // the clock alone, as a device asleep would see it
    await TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
    expect(vi.getTimerCount()).to.eq(0)
    expect(vault.getSnapshot().state).to.eq('locked')
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

  it("drops the key at the deadline though the clock fails as the window ends: its timer reads no clock", async () => {
    const world = makeTimedWorld()
    let broken = false
    const clock = { now: () => { if (broken) { throw new Error('the host clock broke: battery flat') } return Date.now() } }
    const vault = await world.openUnlocked('pw one', { leaseHours: 1, clock })
    broken = true
    world.pass(HourMillis)
    expect(vi.getTimerCount()).to.eq(0)
    expect(world.logged).to.have.lengthOf(0)
    broken = false
    expect(vault.getSnapshot().state).to.eq('locked')
    await TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
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
