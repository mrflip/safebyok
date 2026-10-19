import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FarFuture, FarPast, LeaseHours, MaxLeaseHours, MinuteMillis, ForeverMillis, StaleMinutes } from '../../src/types'
import { memoryDeviceDB } from '../../src/device-db'
import { Vault } from '../../src/vault'
import { Ask, type GetProof, type ProofAnswer } from '../../src/ask'
import { VaultError } from '../../src/errors'
import { bad } from '../../src/outcome'
import type { MakeVaultOpts } from '../../src/vault-opts'
import type { PassphraseStrengthTest } from '../../src/passphrase-strength'
import * as TH from '../test-helpers'
import { makeWorld, SevenDaysMillis, HourMillis, uncheckingDeviceDB, makeRacingWorld, vaultWithPasskey, boxlabelsOf, spoilSecondWayin } from './world'


// == [Unlock, lock and the lease]: unlock and lock, the lease, OutOfBoundsDeadlines

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
    await TH.expectRefusal(later.getBox('missing'), 'absent_box')
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
    await vault.putBox('anthropic', 'sk-fake')
    world.advance(SevenDaysMillis + 1)
    await TH.expectRefusal(vault.getBox('anthropic'), 'vault_locked')
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
    await TH.expectRefusal(vault.ensureLease(), 'vault_locked')
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
      await vault.putBox('anthropic', 'sk-fake')
      expect(vault.getSnapshot().state).to.eq('unlocked')
      expect(vault.getSnapshot().askPassphraseAt).to.eq(FarFuture)
      world.advance(200 * 365 * 24 * HourMillis)
      expect(await vault.getBox('anthropic')).to.eq('sk-fake')
      expect(vault.getSnapshot().state).to.eq('unlocked')
    })

    it("writes the clamped deadline to the device, as a finite number, and a reopen picks it up", async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw one', { leaseHours: Infinity })
      await vault.putBox('anthropic', 'sk-fake')
      const lease = await world.getLease()
      expect(lease?.ask_passphrase_at).to.eq(FarFuture)
      world.advance(10 * 365 * 24 * HourMillis)
      const reopened = await world.open({ leaseHours: Infinity })
      expect(reopened.getSnapshot().state).to.eq('unlocked')
      expect(reopened.getSnapshot().askPassphraseAt).to.eq(FarFuture)
      expect(await reopened.getBox('anthropic')).to.eq('sk-fake')
    })

    it("ends with lock(), here and on the device", async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw one', { leaseHours: Infinity })
      await vault.lock()
      expect(vault.getSnapshot().state).to.eq('locked')
      expect(vault.getSnapshot().askPassphraseAt).to.be.null
      await TH.expectRefusal(vault.ensureLease(), 'vault_locked')
      expect(await world.stateOnOpen({ leaseHours: Infinity })).to.eq('locked')
    })

    it("holds through a passphrase change on this device, with the same deadline", async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw one', { leaseHours: Infinity })
      await vault.changePassphrase('pw one', 'pw two')
      expect(vault.getSnapshot().state).to.eq('unlocked')
      expect(vault.getSnapshot().askPassphraseAt).to.eq(FarFuture)
      const lease = await world.getLease()
      expect(lease?.ask_passphrase_at).to.eq(FarFuture)
    })
  })

  for (const [shiftMillis, blurb] of [[HourMillis, 'later'], [-HourMillis, 'earlier']] as const) {
    it(`reads a lease's deadline moved an hour ${blurb} on the device as no lease, discards it, and says so: the deadline is bound into its wrap`, async () => {
      const world = makeWorld()
      await world.openUnlocked('pw one')
      const written = await world.getLease()
      if (written === null) { throw new Error('expected a lease on the device') }
      await world.deviceDB.putLease({ ...written, ask_passphrase_at: written.ask_passphrase_at + shiftMillis })
      // Under Infinity no window check refuses it, and an hour either way stays in bounds: only the ctx can.
      const reopened = await world.open({ leaseHours: Infinity })
      expect(reopened.getSnapshot().state).to.eq('locked')
      expect(await world.getLease()).to.be.null
      expect(world.logged.map((call) => call.level)).to.deep.eq(['warn'])
    })
  }

  for (const [askPassphraseAt, blurb] of OutOfBoundsDeadlines) {
    it(`reads a lease's deadline of ${blurb} as no lease, and discards it`, async () => {
      const world = makeWorld()
      await world.openUnlocked('pw one')
      const written = await world.getLease()
      if (written === null) { throw new Error('expected a lease on the device') }
      await world.deviceDB.putLease({ ...written, ask_passphrase_at: askPassphraseAt })
      // Under Infinity no window check refuses it: only the bounds can.
      const reopened = await world.open({ leaseHours: Infinity })
      expect(reopened.getSnapshot().state).to.eq('locked')
      expect(reopened.getSnapshot().askPassphraseAt).to.be.null
      expect(await world.getLease()).to.be.null
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
    const lease = await world.getLease()
    expect(lease?.ask_passphrase_at).to.eq(world.clock.now() + SevenDaysMillis)
    expect(await world.stateOnOpen({ clock: fractionalClock })).to.eq('unlocked')
  })

  it("takes the longest finite lease, MaxLeaseHours, exactly as asked", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one', { leaseHours: MaxLeaseHours })
    expect(vault.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + (MaxLeaseHours * HourMillis))
  })
})
// --

// == [Lease and host settings]: leaseHours, leaseMillis, DeviceDB, SpoiledWayins, leaseDeadlineOf

/** The deadline of this world's device's lease, or null when it keeps none. */
const leaseDeadlineOf = async (world: ReturnType<typeof makeWorld>): Promise<number | null> => {
  const lease = await world.getLease()
  return lease?.ask_passphrase_at ?? null
}

describe("the lease, when the host changes leaseHours", () => {
  it("lowered from Infinity to one hour, discards a lease already granted at its next open, and the next unlock lasts an hour", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw one', { leaseHours: Infinity })
    world.advance(30 * 24 * HourMillis)
    const lowered = await world.open({ leaseHours: 1 })
    expect(lowered.getSnapshot().state).to.eq('locked')
    expect(await world.getLease()).to.be.null
    await lowered.unlock('pw one')
    expect(lowered.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + HourMillis)
    expect(await world.stateOnOpen({ leaseHours: 1 })).to.eq('unlocked')
  })

  it("writes no record on any open, shortened or not", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw one', { leaseHours: Infinity })
    const putLease = vi.spyOn(world.deviceDB, 'putLease')
    await world.open({ leaseHours: Infinity })
    await world.open({ leaseHours: 1 })
    await world.open({ leaseHours: 1 })
    expect(putLease).not.toHaveBeenCalled()
  })

  it("never brings back a lease that another tab's lock() erased during the open", async () => {
    const world = makeWorld()
    const otherTab = await world.openUnlocked('pw one', { leaseHours: Infinity })
    const getLease = world.deviceDB.getLease.bind(world.deviceDB)
    vi.spyOn(world.deviceDB, 'getLease').mockImplementationOnce(async (scope) => {
      const kept = await getLease(scope)
      await otherTab.lock()
      return kept
    })
    await world.open({ leaseHours: 1 })
    expect(await world.getLease()).to.be.null
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
// --

// == [Natural expiry]: makeTimedWorld, fakeTheClock, natural expiry, others

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
    await TH.expectRefusal(vault.ensureLease(), 'vault_locked')
  })

  it("drops a key whose timer has not run by its deadline at the next look: the threshold is the truth", async () => {
    const world = makeTimedWorld()
    const vault = await world.openUnlocked('pw one', { leaseHours: 1 })
    world.advance(HourMillis)  // the clock alone, as a device asleep would see it
    await TH.expectRefusal(vault.ensureLease(), 'vault_locked')
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
    await vault.putBox('anthropic', 'sk-fake')
    await vault.getBox('anthropic')
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
    await vault.putBox('anthropic', 'sk-fake')
    const gate = world.holdNextDerive()
    const changing = vault.changePassphrase('old passphrase', 'new passphrase')
    await gate.reached
    world.pass(HourMillis + MinuteMillis)
    expect(vault.getSnapshot().state).to.eq('locked')
    gate.release()
    await changing
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(vault.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + HourMillis)
    expect(await vault.getBox('anthropic')).to.eq('sk-fake')
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
    await TH.expectRefusal(vault.ensureLease(), 'vault_locked')
  })

})
// --

// == [Renewal, timer and key]: change to the ways in, window renewed, timer, non-extractable, others

describe("a change to the ways in, once it has landed", () => {
  afterEach(() => { vi.restoreAllMocks() })

  it("resolves though the device mark could not be kept, says so through the logger, and stays unlocked", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    vi.spyOn(world.deviceDB, 'putMark').mockRejectedValueOnce(new Error('device storage is full'))
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
    vi.spyOn(world.deviceDB, 'putLease').mockRejectedValueOnce(new Error('device storage is full'))
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
    await vault.delWayin('pw one', spareId)
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

  it("never by a read, a store, a deletion, or a change pushed from storage", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    const deadline = vault.getSnapshot().askPassphraseAt
    world.advance(HourMillis)
    await vault.putBox('anthropic', 'sk-fake')
    await vault.getBox('anthropic')
    await vault.delBox('anthropic')
    const there = await world.openUnlocked('pw one', { deviceDB: memoryDeviceDB() })
    await there.putBox('openai', 'sk-fake-too')
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
    await vault.putBox('anthropic', 'sk-ant-fake')
    expect(await vault.getBox('anthropic')).to.eq('sk-ant-fake')
    expect(extractableUnwraps(spied)).to.have.lengthOf(1)
  })

  it("a lease never makes an extractable handle at all", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.putBox('anthropic', 'sk-ant-fake')
    const spied = watchUnwraps()
    const later = await world.open()
    expect(later.getSnapshot().state).to.eq('unlocked')
    expect(await later.getBox('anthropic')).to.eq('sk-ant-fake')
    expect(extractableUnwraps(spied)).to.have.lengthOf(0)
  })

  it("changePassphrase asks for exactly one extractable transient, for the new wraps", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.putBox('anthropic', 'sk-ant-fake')
    const spied = watchUnwraps()
    await vault.changePassphrase('pw one', 'pw two')
    expect(await vault.getBox('anthropic')).to.eq('sk-ant-fake')
    expect(extractableUnwraps(spied)).to.have.lengthOf(1)
  })
})
// --

// == [Asking for a proof]: ensureLease and getProof, by the Contract

/** A getProof that types `pw` into the ask it is handed: 'unlocked' once the attempt is ok, 'declined' otherwise. */
const typingPw = () => vi.fn<GetProof>(async (ask) => {
  const { ok } = await ask.attempt('pw')
  return ok ? 'unlocked' : 'declined'
})

/**
 * A getProof the test answers by hand: `asked` resolves the first ask it is handed, and `answer`
 * settles every ask handed it so far, as one dialog, held open, would.
 */
const heldPrompt = () => {
  const answers: ((answer: ProofAnswer) => void)[] = []
  const asks: Ask[] = []
  const getProof = vi.fn<GetProof>((ask) => new Promise<ProofAnswer>((settle) => {
    answers.push(settle)
    asks.push(ask)
  }))
  const asked = (async () => {
    await TH.eventually(() => asks.length > 0)
    const [first] = asks
    if (first === undefined) { throw new Error('getProof was never asked') }
    return first
  })()
  const answer = (given: ProofAnswer) => { for (const settle of answers) { settle(given) } }
  return { getProof, asked, answer }
}

/** A strength test that finds `pw` weak, and every other passphrase strong. */
const pwIsWeak: PassphraseStrengthTest = (passphrase) => (passphrase === 'pw' ? { strong: false, reason: 'Found in a breach: pick another.' } : { strong: true })

/** A world whose `u1` vault stands, made with `pw`, with a vault handle on it opened locked under `opts`. */
const lockedVaultWith = async (overrides: Partial<MakeVaultOpts>) => {
  const world = makeWorld()
  const maker = await world.openUnlocked('pw')
  await maker.putBox('anthropic', 'sk-fake')
  await maker.lock()
  maker.close()
  const vault = await world.open(overrides)
  return { world, vault }
}

describe("vault.ensureLease, by the Contract", () => {
  it("says hello first, and refuses with hello's refusal as it came (Contract: ensureLease, Does 1, and Refuses: everything hello refuses)", async () => {
    const world = makeWorld()
    const getProof = typingPw()
    const vault = Vault.make(world.optsWith({ getProof }))
    vi.spyOn(world.vaultDB, 'getVaultProps').mockResolvedValueOnce(bad(new VaultError('storage_unavailable', 'The vault storage could not be reached.')))
    await TH.expectRefusal(vault.ensureLease(), 'storage_unavailable')
    expect(getProof).not.toHaveBeenCalled()
    expect(vault.state).to.eq('opening')
  })

  it("resolves the vault at once while unlocked and the lease not ending within renewMinutes: no prompt, no write (Contract: ensureLease, Does 2)", async () => {
    const world = makeWorld()
    const getProof = typingPw()
    const vault = await world.openUnlocked('pw', { getProof })
    const putLease = vi.spyOn(world.deviceDB, 'putLease')
    expect(await vault.ensureLease()).to.eq(vault)
    expect(await vault.ensureLease({ renewMinutes: 60 })).to.eq(vault)
    expect(getProof).not.toHaveBeenCalled()
    expect(putLease).not.toHaveBeenCalled()
  })

  it("asks why 'absent' of a vault never made, and the proof makes it (Contract: ensureLease, Does 3)", async () => {
    const world = makeWorld()
    const getProof = typingPw()
    const vault = await world.open({ getProof })
    expect(await vault.ensureLease()).to.eq(vault)
    expect(getProof.mock.calls[0]?.[0].why).to.eq('absent')
    expect(vault.state).to.eq('unlocked')
    expect(vault.wayins).to.have.lengthOf(1)
  })

  it("asks why 'locked' of a vault that stands, with no lease on this device (Contract: ensureLease, Does 3)", async () => {
    const getProof = typingPw()
    const { vault } = await lockedVaultWith({ getProof })
    await vault.ensureLease()
    expect(getProof.mock.calls[0]?.[0].why).to.eq('locked')
    expect(vault.state).to.eq('unlocked')
  })

  it("asks why 'lease_ending' when the lease ends within renewMinutes, and renews it (Contract: ensureLease, Does 3)", async () => {
    const world = makeWorld()
    const getProof = typingPw()
    const vault = await world.openUnlocked('pw', { getProof, leaseHours: 1 })
    world.advance(HourMillis - (10 * MinuteMillis))
    await vault.ensureLease({ renewMinutes: 5 })
    expect(getProof).not.toHaveBeenCalled()
    await vault.ensureLease({ renewMinutes: 15 })
    expect(getProof.mock.calls[0]?.[0].why).to.eq('lease_ending')
    expect(vault.askPassphraseAt).to.eq(world.clock.now() + HourMillis)
  })

  it("asks one prompt at a time: a second caller that finds a prompt up awaits the same answer (Contract: ensureLease, Does 3.1, and Guarantees)", async () => {
    const prompt = heldPrompt()
    const { vault } = await lockedVaultWith({ getProof: prompt.getProof })
    const first = vault.ensureLease()
    const ask = await prompt.asked
    const second = vault.getBox('anthropic')
    const third = vault.tryEnsureLease()
    await TH.expectGood(ask.attempt('pw'))
    prompt.answer('unlocked')
    expect(await first).to.eq(vault)
    expect(await second).to.eq('sk-fake')
    const { ok } = await third
    expect(ok).to.be.true
    expect(prompt.getProof).toHaveBeenCalledOnce()
  })

  it("raises a fresh prompt for the next call once one is answered (Contract: ensureLease, Guarantees)", async () => {
    const getProof = vi.fn<GetProof>(() => Promise.resolve('declined'))
    const { vault } = await lockedVaultWith({ getProof })
    await TH.expectRefusal(vault.ensureLease(), 'vault_locked')
    await TH.expectRefusal(vault.ensureLease(), 'vault_locked')
    expect(getProof).toHaveBeenCalledTimes(2)
  })

  it("answers declined with no getProof configured: the call refuses vault_locked, as every data call does (Contract: ensureLease, Does 3.2)", async () => {
    const { vault } = await lockedVaultWith({})
    const err = await TH.expectRefusal(vault.ensureLease(), 'vault_locked')
    expect(err.message).to.include('getProof')
    await TH.expectRefusal(vault.getBox('anthropic'), 'vault_locked')
    await TH.expectRefusal(vault.putBox('openai', 'sk-fake'), 'vault_locked')
    await TH.expectRefusal(vault.delBox('anthropic'), 'vault_locked')
    expect(vault.state).to.eq('locked')
  })

  it("hands getProof an Ask: the standing vault, why, an attempt function and lockLanded (Contract: ensureLease, Does 3.3)", async () => {
    const prompt = heldPrompt()
    const { vault } = await lockedVaultWith({ getProof: prompt.getProof })
    const ensuring = vault.tryEnsureLease()
    const ask = await prompt.asked
    expect(ask).to.be.instanceOf(Ask)
    expect(ask.vault).to.eq(vault)
    expect(ask.why).to.eq('locked')
    expect(ask.lockLanded).to.be.instanceOf(Promise)
    // Bound: handed on alone, it still attempts.
    const { attempt } = ask
    const { val } = await attempt('pw')
    expect(val).to.eq(vault)
    prompt.answer('unlocked')
    expect(await TH.expectGood(ensuring)).to.eq(vault)
  })

  it("says hello again on unlocked, and resolves the fresh vault (Contract: ensureLease, Does 3.4, and Returns)", async () => {
    const getProof = typingPw()
    const { world, vault } = await lockedVaultWith({ getProof })
    const reads = vi.spyOn(world.vaultDB, 'getVaultProps')
    world.advance((StaleMinutes + 1) * MinuteMillis)
    expect(await vault.ensureLease()).to.eq(vault)
    expect(vault.state).to.eq('unlocked')
    // The hello before the ask, the attempt's own read, and the hello after, once staleMinutes have passed.
    expect(reads.mock.calls.length).to.be.at.least(2)
  })

  it("refuses vault_locked on declined, the vault as it was (Contract: ensureLease, Does 3.5, and Refuses: vault_locked)", async () => {
    const { vault } = await lockedVaultWith({ getProof: () => Promise.resolve('declined') })
    const err = await TH.expectRefusal(vault.ensureLease(), 'vault_locked')
    expect(err.message).to.include('declined')
    expect(vault.state).to.eq('locked')
  })

  it("resolves the vault under the standing lease on carry_on, its deadline unmoved (Contract: ensureLease, Does 3.6, and Returns)", async () => {
    const world = makeWorld()
    const getProof = vi.fn<GetProof>(() => Promise.resolve('carry_on'))
    const vault = await world.openUnlocked('pw', { getProof, leaseHours: 1 })
    const deadline = vault.askPassphraseAt
    world.advance(HourMillis - MinuteMillis)
    expect(await vault.ensureLease({ renewMinutes: 5 })).to.eq(vault)
    expect(getProof).toHaveBeenCalledOnce()
    expect(vault.askPassphraseAt).to.eq(deadline)
    expect(vault.state).to.eq('unlocked')
  })

  it("refuses vault_locked on carry_on when the lease ended while the prompt was up (Contract: ensureLease, Does 3.6)", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', {
      getProof: () => { world.advance(2 * MinuteMillis); return Promise.resolve('carry_on') },
      leaseHours: 1,
    })
    world.advance(HourMillis - MinuteMillis)
    await TH.expectRefusal(vault.ensureLease({ renewMinutes: 5 }), 'vault_locked')
    expect(vault.state).to.eq('locked')
  })

  for (const [landing, blurb] of [
    [(vault: Vault) => vault.lock(), 'lock()'],
    [(vault: Vault) => { vault.close(); return Promise.resolve() }, 'close()'],
    [(vault: Vault) => vault.del(), 'del()'],
  ] as const) {
    it(`refuses every waiter vault_locked at once and settles lockLanded when a ${blurb} lands while the prompt is up (Contract: ensureLease, Does 3.7)`, async () => {
      const prompt = heldPrompt()
      const { vault } = await lockedVaultWith({ getProof: prompt.getProof })
      const first = vault.tryEnsureLease()
      const ask = await prompt.asked
      const second = vault.tryGetBox('anthropic')
      // Let the second caller reach the prompt up, and wait on it.
      await TH.wakeupAtNextTick()
      let landed = false
      void ask.lockLanded.then(() => { landed = true })
      await landing(vault)
      await TH.expectBad(first, 'vault_locked')
      await TH.expectBad(second, 'vault_locked')
      expect(landed).to.be.true
      // The answer that comes after the lock is dropped.
      prompt.answer('unlocked')
      expect(prompt.getProof).toHaveBeenCalledOnce()
    })
  }

  it("refuses an attempt after lockLanded vault_locked at once, trying nothing (Contract: ensureLease, Does 3.7)", async () => {
    const prompt = heldPrompt()
    const world = makeRacingWorld()
    const maker = await world.openUnlocked('pw')
    await maker.lock()
    maker.close()
    const vault = await world.open({ getProof: prompt.getProof })
    const ensuring = vault.tryEnsureLease()
    const ask = await prompt.asked
    await vault.lock()
    const derive = vi.spyOn(TH.testDeriver, 'deriveKeyBytes')
    const reads = vi.spyOn(world.vaultDB, 'getVaultProps')
    await TH.expectBad(ask.attempt('pw'), 'vault_locked')
    expect(derive).not.toHaveBeenCalled()
    expect(reads).not.toHaveBeenCalled()
    expect(vault.state).to.eq('locked')
    await TH.expectBad(ensuring, 'vault_locked')
  })

  it("leaves the vault locked when a lock lands under an attempt: the lock wins, and the attempt refuses vault_locked (Contract: getProof, attempt refuses)", async () => {
    const prompt = heldPrompt()
    const world = makeRacingWorld()
    const maker = await world.openUnlocked('pw')
    await maker.lock()
    maker.close()
    const vault = await world.open({ getProof: prompt.getProof })
    const ensuring = vault.tryEnsureLease()
    const ask = await prompt.asked
    const gate = world.holdNextDerive()
    const attempting = ask.attempt('pw')
    await gate.reached
    await vault.lock()
    gate.release()
    const err = await TH.expectBad(attempting, 'vault_locked')
    expect(err.message).to.include('locked while this proof was being checked')
    expect(vault.state).to.eq('locked')
    expect(await world.getLease()).to.be.null
    await TH.expectBad(ensuring, 'vault_locked')
  })

  it("erases the lease an attempt wrote when a lock lands as it writes it: the lock wins across a reload too (Contract: getProof, attempt refuses: vault_locked)", async () => {
    const prompt = heldPrompt()
    const world = makeRacingWorld()
    const maker = await world.openUnlocked('pw')
    await maker.lock()
    maker.close()
    const vault = await world.open({ getProof: prompt.getProof })
    const ensuring = vault.tryEnsureLease()
    const ask = await prompt.asked
    const gate = world.holdNextLease()
    const attempting = ask.attempt('pw')
    await gate.reached
    await vault.lock()
    gate.release()
    await TH.expectBad(attempting, 'vault_locked')
    expect(await world.getLease()).to.be.null
    expect(await world.stateOnOpen()).to.eq('locked')
    await TH.expectBad(ensuring, 'vault_locked')
  })

  it("takes up nothing from the lease a stood-down attempt wrote, though a hello reads it before it is erased (Contract: getProof, attempt refuses: vault_locked)", async () => {
    const prompt = heldPrompt()
    const world = makeRacingWorld()
    const maker = await world.openUnlocked('pw')
    await maker.lock()
    maker.close()
    const vault = await world.open({ getProof: prompt.getProof })
    const ensuring = vault.tryEnsureLease()
    const ask = await prompt.asked
    const writing = world.holdNextLease()
    const attempting = ask.attempt('pw')
    await writing.reached
    await vault.lock()
    // The attempt's erasure, and a hello's read of the device store, each held at the door.
    const erasing = TH.holdNextCall(world.deviceDB, 'delLease')
    const fetching = TH.holdNextCall(world.deviceDB, 'getLease')
    const hello = vault.hello({ staleMinutes: 0 })
    await fetching.reached
    writing.release()
    await erasing.reached
    // The hello reads the attempt's lease, written and not yet erased.
    fetching.release()
    await hello
    erasing.release()
    await TH.expectBad(attempting, 'vault_locked')
    expect(vault.state).to.eq('locked')
    expect(await world.getLease()).to.be.null
    await TH.expectBad(ensuring, 'vault_locked')
  })

  it("refuses bad_option when getProof answers carry_on outside lease_ending (Contract: ensureLease, Refuses: bad_option)", async () => {
    const { vault } = await lockedVaultWith({ getProof: () => Promise.resolve('carry_on') })
    const err = await TH.expectRefusal(vault.ensureLease(), 'bad_option')
    expect(err.message).to.include("only a lease ending allows")
    expect(vault.state).to.eq('locked')
  })

  it("refuses bad_option when getProof answers anything but the three, quoting none of it (Contract: ensureLease, Refuses: bad_option)", async () => {
    for (const answer of ['yes', undefined, null, true, 'pw-the-passphrase']) {
      const { vault } = await lockedVaultWith({ getProof: () => Promise.resolve(answer as unknown as ProofAnswer) })
      const err = await TH.expectRefusal(vault.ensureLease(), 'bad_option')
      expect(err.message).to.not.include('pw-the-passphrase')
    }
  })

  it("refuses unexpected_error when getProof throws, the throw its cause, never logged nor told as bad news (Contract: ensureLease, Refuses)", async () => {
    const thrown = new Error('typed: pw-the-passphrase')
    const onBadNews = vi.fn()
    const { world, vault } = await lockedVaultWith({ getProof: () => { throw thrown }, onBadNews })
    const err = await TH.expectRefusal(vault.ensureLease(), 'unexpected_error')
    expect(err.cause).to.eq(thrown)
    expect(err.message).to.not.include('pw-the-passphrase')
    expect(TH.loggedText(world.logged)).to.not.include('pw-the-passphrase')
    expect(onBadNews).not.toHaveBeenCalled()
  })

  it("refuses unexpected_error for a VaultError getProof lets escape, never with its kind, nor telling it as bad news (Contract: ensureLease, Refuses)", async () => {
    for (const kind of ['wrong_passphrase', 'damaged_vault'] as const) {
      const thrown = new VaultError(kind, 'A refusal met inside getProof.')
      const onBadNews = vi.fn()
      const { vault } = await lockedVaultWith({ getProof: () => Promise.reject(thrown), onBadNews })
      const err = await TH.expectRefusal(vault.ensureLease(), 'unexpected_error')
      expect(err.cause).to.eq(thrown)
      expect(onBadNews).not.toHaveBeenCalled()
    }
  })

  it("refuses a renewMinutes that is not zero or more minutes, and a misspelt option, as bad_option", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await TH.expectRefusal(vault.ensureLease({ renewMinutes: -1 }), 'bad_option')
    await TH.expectRefusal(vault.ensureLease({ renewMinutes: '5' as unknown as number }), 'bad_option')
    await TH.expectRefusal(vault.ensureLease({ renewMinuts: 5 } as unknown as { renewMinutes: number }), 'bad_option')
  })

  it("asks whenever it is called with renewMinutes Infinity, as its third example's reading shows", async () => {
    const world = makeWorld()
    const getProof = typingPw()
    const vault = await world.openUnlocked('pw', { getProof })
    await vault.ensureLease({ renewMinutes: Infinity })
    expect(getProof.mock.calls[0]?.[0].why).to.eq('lease_ending')
  })

  it("takes an event in place of options, as a button's handler, as its second example shows", async () => {
    const getProof = typingPw()
    const { vault } = await lockedVaultWith({ getProof })
    await TH.expectGood(vault.tryEnsureLease(new Event('click') as unknown as { renewMinutes?: number }))
    expect(vault.state).to.eq('unlocked')
  })

  it("resolves unlocked or refuses vault_locked, as its first example shows", async () => {
    const { vault } = await lockedVaultWith({})
    await TH.expectRefusal(vault.ensureLease(), 'vault_locked')
    await vault.unlock('pw')
    expect(await vault.ensureLease()).to.eq(vault)
  })

  it("refuses vault_closed after close()", async () => {
    const { vault } = await lockedVaultWith({ getProof: typingPw() })
    vault.close()
    await TH.expectRefusal(vault.ensureLease(), 'vault_closed')
  })

  it("refuses vault_closed for a close() landing during its hello, asking getProof nothing", async () => {
    const getProof = typingPw()
    const world = makeRacingWorld()
    const maker = await world.openUnlocked('pw')
    await maker.lock()
    maker.close()
    const vault = Vault.make(world.optsWith({ getProof }))
    const looking = world.holdNextLook()
    const ensuring = vault.ensureLease()
    await looking.reached
    vault.close()
    looking.release()
    await TH.expectRefusal(ensuring, 'vault_closed')
    expect(getProof).not.toHaveBeenCalled()
  })
})

describe("Vault.make's getProof", () => {
  it("refuses anything but a function, or none, as bad_option", () => {
    const world = makeWorld()
    for (const notAFunction of ['pw', 42, {}]) {
      TH.expectSyncRefusal(() => Vault.make(world.optsWith({ getProof: notAFunction as unknown as GetProof })), 'bad_option')
    }
    expect(Vault.make(world.optsWith({ getProof: null })).state).to.eq('opening')
  })

  it("is handed each ask, and its dialog's answer decides, as its example shows", async () => {
    const showPassphraseDialog = vi.fn(async (ask: Ask): Promise<ProofAnswer> => {
      const { ok } = await ask.attempt('pw')
      return ok ? 'unlocked' : 'declined'
    })
    const { vault } = await lockedVaultWith({ getProof: (ask) => showPassphraseDialog(ask) })
    expect(await vault.getBox('anthropic')).to.eq('sk-fake')
    expect(showPassphraseDialog).toHaveBeenCalledOnce()
  })

  it("declines without asking when no user gesture is in hand, and carries on a lease ending, as GetProof's example shows", async () => {
    vi.stubGlobal('navigator', { userActivation: { isActive: false } })
    const showPassphraseDialog = vi.fn((): Promise<ProofAnswer> => Promise.resolve('unlocked'))
    const getProof: GetProof = async (ask) => {
      if ((globalThis.navigator as { userActivation?: { isActive: boolean } }).userActivation?.isActive === false) { return ask.why === 'lease_ending' ? 'carry_on' : 'declined' }
      return await showPassphraseDialog()
    }
    try {
      const { vault } = await lockedVaultWith({ getProof })
      await TH.expectRefusal(vault.getBox('anthropic'), 'vault_locked')
      await vault.unlock('pw')
      expect(await vault.ensureLease({ renewMinutes: Infinity })).to.eq(vault)
      expect(showPassphraseDialog).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe("every data call, through ensureLease", () => {
  for (const [call, blurb] of [
    [(vault: Vault) => vault.getBox('anthropic'), 'getBox'],
    [(vault: Vault) => vault.getWhisper('anthropic'), 'getWhisper'],
    [(vault: Vault) => vault.useBox('anthropic', (whisper) => whisper), 'useBox'],
    [(vault: Vault) => vault.putBox('openai', 'sk-fake-two'), 'putBox'],
    [(vault: Vault) => vault.delBox('anthropic'), 'delBox'],
  ] as const) {
    it(`asks getProof when locked, and goes on once it is unlocked: ${blurb} (Contract: ensureLease)`, async () => {
      const getProof = typingPw()
      const { vault } = await lockedVaultWith({ getProof })
      await call(vault)
      expect(getProof).toHaveBeenCalledOnce()
      expect(vault.state).to.eq('unlocked')
    })
  }

  it("refuses a whisper it cannot store before asking for anything: a call that cannot land never prompts", async () => {
    const getProof = typingPw()
    const { vault } = await lockedVaultWith({ getProof })
    await TH.expectRefusal(vault.putBox('openai', undefined as unknown as string), 'bad_whisper')
    await TH.expectRefusal(vault.putBox('no such label!', 'sk-fake'), 'bad_label')
    expect(getProof).not.toHaveBeenCalled()
  })

  for (const [call, blurb] of [
    [(vault: Vault, boxlabel: string) => vault.getBox(boxlabel), 'getBox'],
    [(vault: Vault, boxlabel: string) => vault.getWhisper(boxlabel), 'getWhisper'],
    [(vault: Vault, boxlabel: string) => vault.useBox(boxlabel, (whisper) => whisper), 'useBox'],
    [(vault: Vault, boxlabel: string) => vault.delBox(boxlabel), 'delBox'],
  ] as const) {
    it(`refuses bad_label and absent_box from what it holds, before asking for anything: ${blurb} (Contract: ensureLease, a call that cannot land never prompts)`, async () => {
      const getProof = typingPw()
      const { vault } = await lockedVaultWith({ getProof })
      // Below the floor every name is held to; refused by the vault's own check; above both, but not listed.
      await TH.expectRefusal(call(vault, 'tab\there'), 'bad_label')
      await TH.expectRefusal(call(vault, 'no such label!'), 'bad_label')
      await TH.expectRefusal(call(vault, 'openai'), 'absent_box')
      expect(getProof).not.toHaveBeenCalled()
      expect(vault.state).to.eq('locked')
      // A box the listing shows is asked for as before.
      await call(vault, 'anthropic')
      expect(getProof).toHaveBeenCalledOnce()
    })
  }

  it("reads storage once before refusing absent_box, so a box another device stored meanwhile is asked for, though storage pushes no changes", async () => {
    const world = makeWorld()
    const maker = await world.openUnlocked('pw')
    await maker.lock()
    maker.close()
    const getProof = typingPw()
    const vault = await world.open({ vaultDB: world.deafVaultDB(), getProof })
    const elsewhere = await world.open({ deviceDB: memoryDeviceDB() })
    await elsewhere.unlock('pw')
    await elsewhere.putBox('anthropic', 'sk-fake')
    world.advance(MinuteMillis)
    expect(boxlabelsOf(vault)).to.deep.equal([])
    expect(await TH.expectGood(vault.tryGetBox('anthropic'))).to.eq('sk-fake')
    expect(getProof).toHaveBeenCalledOnce()
  })

  it("still refuses absent_box with no prompt once that one read finds nothing, and reads no more than once", async () => {
    const getProof = typingPw()
    const { world, vault } = await lockedVaultWith({ getProof })
    const reads = vi.spyOn(world.vaultDB, 'getVaultProps')
    await TH.expectRefusal(vault.getBox('openai'), 'absent_box')
    await TH.expectRefusal(vault.delBox('openai'), 'absent_box')
    expect(reads).toHaveBeenCalledTimes(2)
    expect(getProof).not.toHaveBeenCalled()
  })

  it("asks for a box delBox finds in that one read, and removes it", async () => {
    const world = makeWorld()
    const maker = await world.openUnlocked('pw')
    await maker.lock()
    maker.close()
    const getProof = typingPw()
    const vault = await world.open({ vaultDB: world.deafVaultDB(), getProof })
    const elsewhere = await world.open({ deviceDB: memoryDeviceDB() })
    await elsewhere.unlock('pw')
    await elsewhere.putBox('anthropic', 'sk-fake')
    await TH.expectGood(vault.tryDelBox('anthropic'))
    expect(getProof).toHaveBeenCalledOnce()
    expect(boxlabelsOf(vault)).to.deep.equal([])
  })

  it("refuses absent_box at once for a vault never made, rather than asking to make one only to find nothing in it", async () => {
    const world = makeWorld()
    const getProof = typingPw()
    const vault = await world.open({ getProof })
    await TH.expectRefusal(vault.getBox('anthropic'), 'absent_box')
    await TH.expectRefusal(vault.delBox('anthropic'), 'absent_box')
    expect(getProof).not.toHaveBeenCalled()
    expect(vault.state).to.eq('absent')
  })

  it("reads storage for the box once unlocked, whatever the listing shows: the listing in hand only spares a prompt", async () => {
    const { world, vault } = await lockedVaultWith({ getProof: typingPw() })
    await vault.ensureLease()
    const reads = vi.spyOn(world.vaultDB, 'getBox')
    await TH.expectRefusal(vault.getBox('openai'), 'absent_box')
    expect(reads).toHaveBeenCalledOnce()
  })
})

describe("getProof's attempt, by the Contract", () => {
  it("resolves the vault, unlocked, for a proof that opens it, as its first example shows (Contract: getProof, Does 3 and 4)", async () => {
    const prompt = heldPrompt()
    const { vault } = await lockedVaultWith({ getProof: prompt.getProof })
    const ensuring = vault.ensureLease()
    const ask = await prompt.asked
    const { ok, val } = await ask.attempt('pw')
    expect(ok).to.be.true
    expect(val).to.eq(vault)
    expect(vault.state).to.eq('unlocked')
    prompt.answer('unlocked')
    expect(await ensuring).to.eq(vault)
  })

  it("refuses wrong_passphrase, to show in place and ask again: the loop lives in getProof, as Ask's first example shows (Contract: getProof, attempt refuses: show in place)", async () => {
    const tries: string[] = []
    const getProof: GetProof = async (ask) => {
      for (const typed of ['pw wrong', 'pw']) {
        const { ok, err } = await ask.attempt(typed)
        if (ok) { return 'unlocked' }
        tries.push(err.refusalkind)
      }
      return 'declined'
    }
    const { vault } = await lockedVaultWith({ getProof })
    expect(await vault.getBox('anthropic')).to.eq('sk-fake')
    expect(tries).to.deep.equal(['wrong_passphrase'])
  })

  it("refuses weak_passphrase on absent, the checker's reason its message, creating nothing (Contract: getProof, attempt refuses: show in place)", async () => {
    const world = makeWorld()
    const prompt = heldPrompt()
    const vault = await world.open({ getProof: prompt.getProof, passphraseStrengthTest: pwIsWeak })
    void vault.tryEnsureLease()
    const ask = await prompt.asked
    expect(ask.why).to.eq('absent')
    const err = await TH.expectBad(ask.attempt('pw'), 'weak_passphrase')
    expect(err.message).to.eq('Found in a breach: pick another.')
    expect(vault.state).to.eq('absent')
    await TH.expectGood(ask.attempt('a longer one'))
    prompt.answer('unlocked')
  })

  it("refuses wrong_passkey for a passkey's answer that does not open the vault, and opens with the right one, as attempt's second example shows (Contract: getProof, attempt refuses: show in place)", async () => {
    const { world, vault: maker, wayinId } = await vaultWithPasskey()
    await maker.lock()
    maker.close()
    const prompt = heldPrompt()
    const vault = await world.open({ getProof: prompt.getProof })
    void vault.tryEnsureLease()
    const ask = await prompt.asked
    const stranger = { ...await TH.passkeyOf('laptop'), prfBytes: new Uint8Array(32).fill(7) }
    await TH.expectBad(ask.attempt(stranger, { wayinId }), 'wrong_passkey')
    await TH.expectGood(ask.attempt(await TH.passkeyOf('laptop')))
    prompt.answer('unlocked')
  })

  it("refuses created_elsewhere on absent when another device made the vault meanwhile under another passphrase, to show in place and ask again (Contract: getProof, attempt refuses: show in place)", async () => {
    const world = makeWorld()
    const deafDB = world.deafVaultDB()
    const prompt = heldPrompt()
    const vault = await world.open({ vaultDB: deafDB, getProof: prompt.getProof })
    const ensuring = vault.tryEnsureLease()
    const ask = await prompt.asked
    expect(ask.why).to.eq('absent')
    const elsewhere = await world.open({ deviceDB: memoryDeviceDB() })
    TH.beforeNextCall(deafDB, 'ensureVaultProps', async () => { await elsewhere.unlock('pw one') })
    await TH.expectBad(ask.attempt('pw two'), 'created_elsewhere')
    expect(vault.state).to.eq('locked')
    await TH.expectGood(ask.attempt('pw one'))
    prompt.answer('unlocked')
    expect(await TH.expectGood(ensuring)).to.eq(vault)
  })

  it("refuses damaged_wayin for a way in stored damaged, aimed at by its wayinId, to offer another way in (Contract: getProof, attempt refuses: offer another way in)", async () => {
    const world = makeWorld()
    const maker = await world.openUnlocked('pw')
    const spareId = await maker.addPassphrase('pw', 'spare phrase', { wayinlabel: 'spare' })
    await maker.lock()
    maker.close()
    spoilSecondWayin(world, { salt_b64: 'c2FsdA' })
    const prompt = heldPrompt()
    const vault = await world.open({ getProof: prompt.getProof, deviceDB: memoryDeviceDB() })
    void vault.tryEnsureLease()
    const ask = await prompt.asked
    await TH.expectBad(ask.attempt('spare phrase', { wayinId: spareId }), 'damaged_wayin')
    await TH.expectGood(ask.attempt('pw'))
    prompt.answer('unlocked')
  })

  it("refuses absent_wayin for a wayinId the vault has not, to offer another way in (Contract: getProof, attempt refuses: offer another way in)", async () => {
    const prompt = heldPrompt()
    const { vault } = await lockedVaultWith({ getProof: prompt.getProof })
    void vault.tryEnsureLease()
    const ask = await prompt.asked
    await TH.expectBad(ask.attempt('pw', { wayinId: 'no-such-way-in' }), 'absent_wayin')
    prompt.answer('declined')
  })

  it("refuses storage_unavailable when storage cannot be reached, for the dialog to close (Contract: getProof, attempt refuses: close the dialog)", async () => {
    const prompt = heldPrompt()
    const { world, vault } = await lockedVaultWith({ getProof: prompt.getProof })
    const ensuring = vault.tryEnsureLease()
    const ask = await prompt.asked
    vi.spyOn(world.vaultDB, 'getVaultProps').mockResolvedValueOnce(bad(new VaultError('storage_unavailable', 'The vault storage could not be reached.')))
    await TH.expectBad(ask.attempt('pw'), 'storage_unavailable')
    prompt.answer('declined')
    await TH.expectBad(ensuring, 'vault_locked')
  })

  it("closes the dialog on lockLanded, as Ask's second example shows", async () => {
    const prompt = heldPrompt()
    const { vault } = await lockedVaultWith({ getProof: prompt.getProof })
    void vault.tryEnsureLease()
    const ask = await prompt.asked
    const closed = vi.fn()
    void ask.lockLanded.then(() => { closed('declined') })
    await vault.lock()
    await ask.lockLanded
    expect(closed).toHaveBeenCalledWith('declined')
  })
})
// --
