import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LeaseHours, MaxLeaseHours, StaleMinutes } from '../../src/types/types'
import { FarFuture, FarPast, MinuteMillis, ForeverMillis } from '../../src/consts'
import { memoryDeviceDB } from '../../src/device-db'
import type { Vault } from '../../src/vault'
import { Bank } from '../../src/bank'
import type { Gating, RequestCleartext } from '../../src/gating'
import * as Safebyok from '../../src/index'
import { type RefusalKind, VaultError } from '../../src/errors'
import { bad } from '../../src/outcome'
import { toB64 } from '../../src/crypto'
import type { StrengthChecker } from '../../src/passphrase-strength'
import { heldLeaseOf } from '../../src/held-lease'
import * as TH from '../test-helpers'
import { makeWorld, SevenDaysMillis, HourMillis, uncheckingDeviceDB, makeRacingWorld, vaultWithPasskey, boxlabelsOf, spoilWayin, storedRowOf, storedVaultRecordOf } from './world'


// == [Unlock, lock and the lease]: unlock and lock, the lease, OutOfBoundsDeadlines

describe("unlock and lock", () => {
  it("the first unlock creates the vault, with that passphrase, unlocked for seven days", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await TH.unlock(vault, 'correct horse battery staple')
    const snapshot = vault.getSnapshot()
    expect(TH.stateOf(snapshot)).to.eq('unlocked')
    expect(snapshot.ask_passphrase_at).to.eq(world.clock.now() + SevenDaysMillis)
  })

  it("a wrong passphrase is refused calmly, changing nothing, and quoting nothing", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('the right passphrase')
    await vault.lock()
    const err = await TH.expectRefusal(TH.unlock(vault, 'the wrong passphrase'), 'wrong_passphrase')
    expect(err.message).to.not.include('the wrong passphrase')
    expect(err.message).to.not.include('the right passphrase')
    expect(TH.stateOf(vault.getSnapshot())).to.eq('locked')
    await TH.unlock(vault, 'the right passphrase')
    expect(TH.stateOf(vault.getSnapshot())).to.eq('unlocked')
  })

  it("a passphrase of only whitespace creates nothing: as a new passphrase, it is too weak", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await TH.expectRefusal(TH.unlock(vault, ' '.repeat(3)), 'weak_passphrase')
    expect(TH.stateOf(vault.getSnapshot())).to.eq('novel')
  })

  it("a passphrase of only whitespace opens nothing: as a proof, it is wrong, and costs no derivation", async () => {
    const derivations = vi.fn(async (passphrase: string, saltBytes: Uint8Array) => await TH.testDeriver.deriveKeyBytes(passphrase, saltBytes))
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one', { keyDeriver: { ...TH.testDeriver, deriveKeyBytes: derivations } })
    await vault.lock()
    derivations.mockClear()
    await TH.expectRefusal(TH.unlock(vault, ' '.repeat(3)), 'wrong_passphrase')
    expect(derivations).not.toHaveBeenCalled()
    expect(TH.stateOf(vault.getSnapshot())).to.eq('locked')
  })

  it("lock() forgets the unlock on this device too: a reopened handle is locked", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.lock()
    expect(TH.stateOf(vault.getSnapshot())).to.eq('locked')
    expect(await world.stateOnOpen()).to.eq('locked')
  })

  it("refuses a passphrase that is not text with kind 'bad_option', and stays as it was", async () => {
    const world = makeWorld()
    const vault = await world.open()
    const refused: string[] = []
    TH.answering(vault, async (gating) => {
      if (gating.gatingkind !== 'initialize_gate') { return }
      for (const passphrase of [undefined, null, 1234, ['pw']]) {
        const { err } = await gating.attempt(passphrase as unknown as string)
        refused.push(err?.refusalkind ?? 'none')
      }
    })
    await TH.expectRefusal(vault.ensureUnlocked(), 'vault_locked')
    expect(refused).to.deep.equal(['bad_option', 'bad_option', 'bad_option', 'bad_option'])
    expect(TH.stateOf(vault.getSnapshot())).to.eq('novel')
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
    const vault = await world.openUnlocked('pw one')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    world.advance(6 * 24 * 60 * 60 * 1000)
    const later = await world.open()
    expect(TH.stateOf(later.getSnapshot())).to.eq('unlocked')
    // Genuinely unlocked: the whisper opens, where a locked vault whose gating is declined refuses 'vault_locked'.
    expect(await later.getWhisper('anthropic')).to.eq('sk-fake')
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
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    world.advance(SevenDaysMillis + 1)
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'vault_locked')
  })

  it("lasts LeaseHours, 168 (seven days), unless told otherwise", () => {
    expect(LeaseHours * HourMillis).to.eq(SevenDaysMillis)
  })

  it("lasts the leaseHours the host chose, and asks again from then", async () => {
    const world = makeWorld()
    const twelveHoursMillis = 12 * HourMillis
    const vault = await world.openUnlocked('pw one', { leaseHours: 12 })
    expect(vault.getSnapshot().ask_passphrase_at).to.eq(world.clock.now() + twelveHoursMillis)
    world.advance(twelveHoursMillis - 1)
    expect(await world.stateOnOpen({ leaseHours: 12 })).to.eq('unlocked')
    world.advance(1)
    expect(await world.stateOnOpen({ leaseHours: 12 })).to.eq('locked')
    await TH.expectRefusal(vault.ensureUnlocked(), 'vault_locked')
  })

  it("takes fractions of an hour, kept as whole milliseconds", async () => {
    const world = makeWorld()
    const quarterHour = await world.openUnlocked('pw one', { leaseHours: 0.25 })
    const fifteenMinutesMillis = 15 * 60 * 1000
    expect(quarterHour.getSnapshot().ask_passphrase_at).to.eq(world.clock.now() + fifteenMinutesMillis)
    const oneThird = await world.openUnlocked('pw one', { deviceDB: memoryDeviceDB(), leaseHours: 1 / 3 })
    const twentyMinutesMillis = 20 * 60 * 1000
    expect(oneThird.getSnapshot().ask_passphrase_at).to.eq(world.clock.now() + twentyMinutesMillis)
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
      await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
      expect(TH.stateOf(vault.getSnapshot())).to.eq('unlocked')
      expect(vault.getSnapshot().ask_passphrase_at).to.eq(FarFuture)
      world.advance(200 * 365 * 24 * HourMillis)
      expect(await vault.getWhisper('anthropic')).to.eq('sk-fake')
      expect(TH.stateOf(vault.getSnapshot())).to.eq('unlocked')
    })

    it("writes the clamped deadline to the device, as a finite number, and a reopen picks it up", async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw one', { leaseHours: Infinity })
      await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
      const lease = await world.getLease()
      expect(lease?.ask_passphrase_at).to.eq(FarFuture)
      world.advance(10 * 365 * 24 * HourMillis)
      const reopened = await world.open({ leaseHours: Infinity })
      expect(TH.stateOf(reopened.getSnapshot())).to.eq('unlocked')
      expect(reopened.getSnapshot().ask_passphrase_at).to.eq(FarFuture)
      expect(await reopened.getWhisper('anthropic')).to.eq('sk-fake')
    })

    it("ends with lock(), here and on the device", async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw one', { leaseHours: Infinity })
      await vault.lock()
      expect(TH.stateOf(vault.getSnapshot())).to.eq('locked')
      expect(vault.getSnapshot().ask_passphrase_at).to.be.null
      await TH.expectRefusal(vault.ensureUnlocked(), 'vault_locked')
      expect(await world.stateOnOpen({ leaseHours: Infinity })).to.eq('locked')
    })

    it("holds through a passphrase change on this device, with the same deadline", async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw one', { leaseHours: Infinity })
      await TH.putWayin(vault, 'pw one', 'pw two')
      expect(TH.stateOf(vault.getSnapshot())).to.eq('unlocked')
      expect(vault.getSnapshot().ask_passphrase_at).to.eq(FarFuture)
      const lease = await world.getLease()
      expect(lease?.ask_passphrase_at).to.eq(FarFuture)
    })
  })

  for (const [shiftMillis, blurb] of [[HourMillis, 'later'], [-HourMillis, 'earlier']] as const) {
    it(`takes up a lease whose deadline was moved an hour ${blurb} on the device, then refuses it 'damaged_lease' at its first use, erasing it and locking: the deadline is bound into its wrap`, async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw one')
      await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
      const written = await world.getLease()
      if (written === null) { throw new Error('expected a lease on the device') }
      await world.deviceDB.putLease({ ...written, ask_passphrase_at: written.ask_passphrase_at + shiftMillis })
      // Under Infinity no window check refuses it, and an hour either way stays in bounds: only the ctx can.
      const reopened = await world.open({ leaseHours: Infinity })
      expect(TH.stateOf(reopened.getSnapshot())).to.eq('unlocked')
      await TH.expectRefusal(reopened.getWhisper('anthropic'), 'damaged_lease')
      expect(TH.stateOf(reopened.getSnapshot())).to.eq('locked')
      await TH.wakeupAtNextTick()
      expect(await world.getLease()).to.be.null
    })
  }

  for (const [ask_passphrase_at, blurb] of OutOfBoundsDeadlines) {
    it(`reads a lease's deadline of ${blurb} as no lease, and discards it`, async () => {
      const world = makeWorld()
      await world.openUnlocked('pw one')
      const written = await world.getLease()
      if (written === null) { throw new Error('expected a lease on the device') }
      await world.deviceDB.putLease({ ...written, ask_passphrase_at })
      // Under Infinity no window check refuses it: only the bounds can.
      const reopened = await world.open({ leaseHours: Infinity })
      expect(TH.stateOf(reopened.getSnapshot())).to.eq('locked')
      expect(reopened.getSnapshot().ask_passphrase_at).to.be.null
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
    expect(vault.getSnapshot().ask_passphrase_at).to.eq(world.clock.now() + SevenDaysMillis)
    const lease = await world.getLease()
    expect(lease?.ask_passphrase_at).to.eq(world.clock.now() + SevenDaysMillis)
    expect(await world.stateOnOpen({ clock: fractionalClock })).to.eq('unlocked')
  })

  it("takes the longest finite lease, MaxLeaseHours, exactly as asked", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one', { leaseHours: MaxLeaseHours })
    expect(vault.getSnapshot().ask_passphrase_at).to.eq(world.clock.now() + (MaxLeaseHours * HourMillis))
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
  it("lowered from Infinity to one hour, takes no lease already granted up at its next birth, leaving it where it lies, and the next unlock lasts an hour", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw one', { leaseHours: Infinity })
    world.advance(30 * 24 * HourMillis)
    const lowered = await world.open({ leaseHours: 1 })
    expect(TH.stateOf(lowered.getSnapshot())).to.eq('locked')
    expect(await leaseDeadlineOf(world)).to.eq(FarFuture)
    await TH.unlock(lowered, 'pw one')
    expect(lowered.getSnapshot().ask_passphrase_at).to.eq(world.clock.now() + HourMillis)
    expect(await world.stateOnOpen({ leaseHours: 1 })).to.eq('unlocked')
  })

  it("writes no lease on any birth, shortened or not", async () => {
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
    expect(raised.getSnapshot().ask_passphrase_at).to.eq(given)
    expect(await leaseDeadlineOf(world)).to.eq(given)
  })

  it("lowered to a window that still reaches past the deadline given, leaves the unlock and its record as they were", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw one', { leaseHours: 12 })
    const given = world.clock.now() + (12 * HourMillis)
    world.advance(11 * HourMillis)
    const lowered = await world.open({ leaseHours: 2 })
    expect(TH.stateOf(lowered.getSnapshot())).to.eq('unlocked')
    expect(lowered.getSnapshot().ask_passphrase_at).to.eq(given)
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

/** How long an unlock lasts, as a gating's `leaseMillis` example says it. */
const windowSaidBy = (leaseMillis: number): string => (
  leaseMillis >= ForeverMillis - MinuteMillis ? 'until you lock it' : `for ${String(Math.round(leaseMillis / MinuteMillis))} minutes`
)

/** The `leaseMillis` the first gating of a vault opened from `world` with `opts` tells the host, which declines it. */
const gatingLeaseMillisOf = async (world: ReturnType<typeof makeWorld>, opts: Partial<TH.BornVaultOpts>): Promise<number> => {
  const told: number[] = []
  const vault = await world.open({ ...opts, requestCleartext: (gating) => { told.push(gating.leaseMillis); gating.decline() } })
  await TH.expectBad(vault.tryEnsureUnlocked(), 'vault_locked')
  const [leaseMillis] = told
  if (leaseMillis === undefined || told.length !== 1) { throw new Error('expected one gating') }
  return leaseMillis
}

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

describe("a gating's leaseMillis", () => {
  for (const [hours, expected, blurb] of LeaseHoursCases) {
    it(`reports ${blurb}`, async () => {
      expect(await gatingLeaseMillisOf(makeWorld(), { leaseHours: hours })).to.eq(expected)
    })
  }

  it("is the window an unlock lasts: ask_passphrase_at is the unlock's time plus it", async () => {
    const world = makeWorld()
    const leaseMillis = await gatingLeaseMillisOf(world, { leaseHours: 0.25 })
    const vault = await world.openUnlocked('pw one', { leaseHours: 0.25 })
    expect(vault.getSnapshot().ask_passphrase_at).to.eq(world.clock.now() + leaseMillis)
  })

  it("lets a UI say how long an unlock lasts, as its example shows", async () => {
    const forever = await gatingLeaseMillisOf(makeWorld(), { leaseHours: Infinity })
    const quarterHour = await gatingLeaseMillisOf(makeWorld(), { leaseHours: 0.25 })
    expect(windowSaidBy(forever)).to.eq('until you lock it')
    expect(windowSaidBy(quarterHour)).to.eq('for 15 minutes')
  })
})

/** The minutes left at `now` before `vault` locks of itself, as the snapshot's `ask_passphrase_at` example counts them; null while locked. */
const minutesLeftOf = (vault: Vault, now: number): number | null => (
  vault.snapshot.ask_passphrase_at === null ? null : Math.ceil((vault.snapshot.ask_passphrase_at - now) / MinuteMillis)
)

describe("the vault's ask_passphrase_at", () => {
  it("lets a UI say how many minutes are left before the vault locks of itself, as its example shows; null once locked", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one', { leaseHours: 0.25 })
    expect(minutesLeftOf(vault, world.clock.now())).to.eq(15)
    world.advance(5 * MinuteMillis)
    expect(minutesLeftOf(vault, world.clock.now())).to.eq(10)
    await vault.lock()
    expect(minutesLeftOf(vault, world.clock.now())).to.be.null
  })
})

const SpoiledWayins = [
  [(row: Record<string, unknown>) => ({ ...row, format: 'byok-unlock-v1' }),                  "a record under the format tag from before the package's rename"],
  [({ lease_key: kept, vault_key_lease_wrapped: wrapped, ...row }: Record<string, unknown>) => ({ ...row, format: 'safebyok-unlock-v1', local_unlock_key: kept, vault_key_local_wrapped: wrapped }), 'a record from before the lease, under safebyok-unlock-v1'],
  [(row: Record<string, unknown>) => ({ ...row, ask_passphrase_at: '99999999999999' }),       'a deadline written as text, which would compare as a number'],
  [(row: Record<string, unknown>) => ({ ...row, ask_passphrase_at: Infinity }),               'a deadline that never comes'],
  [({ ask_passphrase_at: _gone, ...row }: Record<string, unknown>) => row,                    'a record missing its deadline'],
  [({ ask_passphrase_at: kept, ...row }: Record<string, unknown>) => ({ ...row, expires_at: kept }), 'a record from before its deadline was named ask_passphrase_at'],
  [({ gate_epoch: kept, ...row }: Record<string, unknown>) => ({ ...row, passphrase_epoch: kept }), 'a record from before its epoch was named gate_epoch'],
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
    it(`reads ${blurb} as no lease at birth, and leaves it where it lies`, async () => {
      const world = makeWorld()
      const device = uncheckingDeviceDB()
      await world.openUnlocked('pw one', { deviceDB: device.deviceDB })
      device.spoilRow(spoil)
      const spoiled = [...device.rows.values()]
      const later = await world.open({ deviceDB: device.deviceDB })
      expect(TH.stateOf(later.getSnapshot())).to.eq('locked')
      expect(later.getSnapshot().ask_passphrase_at).to.be.null
      expect([...device.rows.values()]).to.deep.equal(spoiled)
    })
  }

  it("says through the logger that a record naming another scope could not be read, and was left where it lies", async () => {
    const world = makeWorld()
    const device = uncheckingDeviceDB()
    await world.openUnlocked('pw one', { deviceDB: device.deviceDB })
    device.spoilRow((row) => ({ ...row, user_id: 'u2' }))
    await world.open({ deviceDB: device.deviceDB })
    expect(world.logged.map((call) => call.level)).to.deep.equal(['warn'])
    expect(world.logged[0]?.message).to.include('could not be read')
    expect(world.logged[0]?.message).to.include('left where it lies')
  })

  it("says once through the logger that a record from before the lease, under safebyok-unlock-v1, could not be read, and leaves it where it lies", async () => {
    const world = makeWorld()
    const device = uncheckingDeviceDB()
    await world.openUnlocked('pw one', { deviceDB: device.deviceDB })
    device.spoilRow(({ lease_key: kept, vault_key_lease_wrapped: wrapped, ...row }) => ({ ...row, format: 'safebyok-unlock-v1', local_unlock_key: kept, vault_key_local_wrapped: wrapped }))
    await world.open({ deviceDB: device.deviceDB })
    expect(device.rows.size).to.eq(1)
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

  it("says 'locked' to subscribers at ask_passphrase_at, dropping the vaultKey then, with no call made", async () => {
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
    expect(TH.stateOf(vault.getSnapshot())).to.eq('locked')
    expect(vault.getSnapshot().ask_passphrase_at).to.be.null
    await TH.expectRefusal(vault.ensureUnlocked(), 'vault_locked')
  })

  it("drops the lease from memory alone at ask_passphrase_at, erasing nothing: another tab may hold one renewed under the scope", async () => {
    const world = makeTimedWorld()
    const vault = await world.openUnlocked('pw one', { leaseHours: 1 })
    const erases = vi.spyOn(world.deviceDB, 'delLease')
    world.pass(HourMillis)
    expect(TH.stateOf(vault.getSnapshot())).to.eq('locked')
    expect(erases).not.toHaveBeenCalled()
    expect(await world.getLease()).to.not.be.null
  })

  it("drops a key whose timer has not run by its deadline at the next look: the threshold is the truth", async () => {
    const world = makeTimedWorld()
    const vault = await world.openUnlocked('pw one', { leaseHours: 1 })
    world.advance(HourMillis)  // the clock alone, as a device asleep would see it
    await TH.expectRefusal(vault.ensureUnlocked(), 'vault_locked')
    expect(vi.getTimerCount()).to.eq(0)
    expect(TH.stateOf(vault.getSnapshot())).to.eq('locked')
  })

  it("arms no timer for a vault unlocked until lock()", async () => {
    const world = makeTimedWorld()
    const vault = await world.openUnlocked('pw one', { leaseHours: Infinity })
    expect(vault.getSnapshot().ask_passphrase_at).to.eq(FarFuture)
    expect(vi.getTimerCount()).to.eq(0)
  })

  it("arms one timer for an unlock, and one again when the window renews, never one per call", async () => {
    const world = makeTimedWorld()
    const vault = await world.openUnlocked('pw one', { leaseHours: 1 })
    expect(vi.getTimerCount()).to.eq(1)
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    await vault.getWhisper('anthropic')
    await TH.putWayin(vault, 'pw one', 'pw two')
    expect(vi.getTimerCount()).to.eq(1)
  })

  it("arms the timer for a lease taken up at open, from its own deadline", async () => {
    const world = makeTimedWorld()
    await world.openUnlocked('pw one', { leaseHours: 1 })
    world.pass(HourMillis / 2)
    const reopened = await world.open({ leaseHours: 1 })
    expect(TH.stateOf(reopened.getSnapshot())).to.eq('unlocked')
    world.pass((HourMillis / 2) + MinuteMillis)
    expect(TH.stateOf(reopened.getSnapshot())).to.eq('locked')
  })

  it("lets an unlock begun past the deadline win over the timer, with a deadline of its own", async () => {
    const world = makeTimedWorld()
    const vault = await world.openUnlocked('pw one', { leaseHours: 1 })
    world.pass(HourMillis + 1)
    await TH.unlock(vault, 'pw one')
    world.pass(MinuteMillis)
    expect(TH.stateOf(vault.getSnapshot())).to.eq('unlocked')
    expect(vault.getSnapshot().ask_passphrase_at).to.eq(world.clock.now() - MinuteMillis + HourMillis)
  })

  it("leaves a putWayin() under way when it falls due unlocked, under the new passphrase, with a new deadline: a timer is no lock", async () => {
    const world = makeTimedWorld()
    const vault = await world.openUnlocked('old passphrase', { leaseHours: 1 })
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const gate = world.holdNextDerive()
    const changing = TH.putWayin(vault, 'old passphrase', 'new passphrase')
    await gate.reached
    world.pass(HourMillis + MinuteMillis)
    expect(TH.stateOf(vault.getSnapshot())).to.eq('locked')
    gate.release()
    await changing
    expect(TH.stateOf(vault.getSnapshot())).to.eq('unlocked')
    expect(vault.getSnapshot().ask_passphrase_at).to.eq(world.clock.now() + HourMillis)
    expect(await vault.getWhisper('anthropic')).to.eq('sk-fake')
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
    expect(TH.stateOf(vault.getSnapshot())).to.eq('locked')
    await TH.expectRefusal(vault.ensureUnlocked(), 'vault_locked')
  })

})
// --

// == [Renewal, timer and key]: change to the ways in, window renewed, timer, non-extractable, others

describe("a change to the ways in, once it has landed", () => {
  afterEach(() => { vi.restoreAllMocks() })

  it("resolves though the device record could not be raised, says so through the logger, and stays unlocked", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    // Past the read putWayin makes first, which raises the record too: the raise after its own write fails.
    TH.beforeNextCall(world.vaultDB, 'putVaultRecord', () => {
      vi.spyOn(world.deviceDB, 'raiseDeviceRecord').mockRejectedValueOnce(new Error('device storage is full'))
      return Promise.resolve()
    })
    await TH.putWayin(vault, 'pw one', 'pw two')
    expect(TH.stateOf(vault.getSnapshot())).to.eq('unlocked')
    expect(world.logged.map((heard) => [heard.level, heard.story])).to.deep.equal([['warn', { call: 'putWayin' }]])
    expect(world.logged[0]?.message).to.include('record')
    await vault.lock()
    await TH.unlock(vault, 'pw two')
  })

  it("shows the vault locked here once a change's grant failed, never unlocked under the lease of the gate before: the next getWhisper asks, and does not refuse gate_moved", async () => {
    const world = makeWorld()
    // Deaf to storage's bell, so no refresh of its own write mends the picture first.
    const vault = await world.openUnlocked('pw one', { vaultDB: world.deafVaultDB() })
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    vi.spyOn(world.deviceDB, 'putLease').mockRejectedValueOnce(new Error('device storage is full'))
    await TH.putWayin(vault, 'pw one', await TH.passkeyOf('laptop'))
    expect(TH.stateOf(vault.snapshot)).to.eq('locked')
    expect(heldLeaseOf(vault)).to.be.null
    TH.answering(vault, async (gating) => { await TH.expectGood(TH.asKind(gating, 'unlock_vault').attemptPassphrase('pw one')) })
    expect(await vault.getWhisper('anthropic')).to.eq('sk-fake')
  })

  it("resolves though this device could not keep its lease, says so through the logger, and asks at the next open", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    vi.spyOn(world.deviceDB, 'putLease').mockRejectedValueOnce(new Error('device storage is full'))
    const put = await TH.putWayin(vault, 'pw one', await TH.passkeyOf('laptop'))
    expect(vault.getSnapshot().gate?.passkey).to.deep.equal(put)
    expect(world.logged.map((heard) => [heard.level, heard.story])).to.deep.equal([['warn', { call: 'putWayin' }]])
    expect(await world.stateOnOpen()).to.eq('locked')
  })
})

describe("the lease, kept on this device alone", () => {
  it("sends nothing of itself to the backend: no record there holds its wrap, its deadline's name, or its format (Contract: Lease)", async () => {
    const world = makeWorld()
    await world.openUnlocked('pw')
    const lease = await world.getLease()
    expect(lease).to.not.be.null
    const everything = world.dbStore.scopepaths().map((scopepath) => world.dbStore.read(scopepath)).join('\n')
    expect(everything).to.not.include(lease?.vault_key_lease_wrapped.ciphertext_b64)
    expect(everything).to.not.include('ask_passphrase_at')
    expect(everything).to.not.include(lease?.format)
  })
})

describe("an unlock this device cannot keep a lease for", () => {
  afterEach(() => { vi.restoreAllMocks() })

  it("refuses as 'storage_blocked' when the device store has no room for the lease, and the vault stays locked", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.lock()
    const trouble = new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    vi.spyOn(world.deviceDB, 'putLease').mockRejectedValueOnce(trouble)
    const err = await TH.expectRefusal(TH.unlock(vault, 'pw one'), 'storage_blocked')
    expect(err.cause).to.eq(trouble)
    expect(TH.stateOf(vault.getSnapshot())).to.eq('locked')
    expect(await world.getLease()).to.be.null
    await TH.unlock(vault, 'pw one')
    expect(TH.stateOf(vault.getSnapshot())).to.eq('unlocked')
  })

  it("refuses as 'storage_unavailable' when the device store fails to write it, and the vault stays locked", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.lock()
    vi.spyOn(world.deviceDB, 'putLease').mockRejectedValueOnce(new Error('device storage is unavailable'))
    await TH.expectRefusal(TH.unlock(vault, 'pw one'), 'storage_unavailable')
    expect(TH.stateOf(vault.getSnapshot())).to.eq('locked')
  })

  const UnkeptFirstUnlocks: readonly (readonly [RefusalKind, () => Error])[] = [
    ['storage_blocked', () => new DOMException('The quota has been exceeded.', 'QuotaExceededError')],
    ['storage_unavailable', () => new Error('device storage is unavailable')],
  ]

  for (const [refusalkind, trouble] of UnkeptFirstUnlocks) {
    it(`sets the first passphrase though the device store refuses the lease: the first gate stands, ensureUnlocked refuses ${refusalkind} saying the passphrase was set, and the vault is locked here`, async () => {
      const world = makeWorld()
      const vault = await world.open()
      vi.spyOn(world.deviceDB, 'putLease').mockRejectedValueOnce(trouble())
      const err = await TH.expectRefusal(TH.unlock(vault, 'pw one'), refusalkind)
      expect(err.message).to.include('passphrase was set')
      expect(err.message).to.not.include('pw one')
      expect(storedVaultRecordOf(world)).to.include({ gate_epoch: 1 })
      expect(TH.stateOf(vault.getSnapshot())).to.eq('locked')
      await TH.unlock(vault, 'pw one')
      expect(TH.stateOf(vault.getSnapshot())).to.eq('unlocked')
    })
  }

  it("sets the first passphrase through putWayin though the device store has no room for the lease: putWayin resolves, says so through the logger, and the vault is locked here", async () => {
    const world = makeWorld()
    const vault = await world.open()
    vi.spyOn(world.deviceDB, 'putLease').mockRejectedValueOnce(new DOMException('The quota has been exceeded.', 'QuotaExceededError'))
    await TH.putWayin(vault, 'pw one', 'pw one')
    expect(storedVaultRecordOf(world)).to.include({ gate_epoch: 1 })
    expect(world.logged.map((heard) => [heard.level, heard.story])).to.deep.equal([['warn', { call: 'putWayin' }]])
    expect(TH.stateOf(vault.getSnapshot())).to.eq('locked')
  })
})

describe("the unlock window, renewed", () => {
  it("by a passphrase change: the user typed a passphrase, and it proved", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    world.advance(24 * HourMillis)
    await TH.putWayin(vault, 'pw one', 'pw two')
    expect(vault.getSnapshot().ask_passphrase_at).to.eq(world.clock.now() + SevenDaysMillis)
    expect(await leaseDeadlineOf(world)).to.eq(world.clock.now() + SevenDaysMillis)
  })

  it("by a passkey added or removed with the passphrase as proof", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    world.advance(24 * HourMillis)
    await TH.putWayin(vault, 'pw one', await TH.passkeyOf('laptop'))
    expect(vault.getSnapshot().ask_passphrase_at).to.eq(world.clock.now() + SevenDaysMillis)
    world.advance(24 * HourMillis)
    await TH.delWayin(vault, 'pw one')
    expect(vault.getSnapshot().ask_passphrase_at).to.eq(world.clock.now() + SevenDaysMillis)
  })

  it("never by a read, a store, a deletion, or a change pushed from storage", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    const deadline = vault.getSnapshot().ask_passphrase_at
    world.advance(HourMillis)
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    await vault.getWhisper('anthropic')
    await vault.delBox('anthropic')
    const there = await world.openUnlocked('pw one', { deviceDB: memoryDeviceDB() })
    await there.putBox({ boxlabel: 'openai' }, 'sk-fake-too')
    await vi.waitFor(() => { expect(boxlabelsOf(vault)).to.deep.equal(['openai']) })
    expect(vault.getSnapshot().ask_passphrase_at).to.eq(deadline)
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
    TH.closeVault(vault)
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
  afterEach(() => { vi.restoreAllMocks() })

  it("creating a vault takes its key out of the way in it stored, as any unlock does: one extractable transient, for the device wrap, and no other unwrap", async () => {
    const world = makeWorld()
    const vault = await world.open()
    const spied = watchUnwraps()
    await TH.unlock(vault, 'pw one')
    expect(TH.stateOf(vault.getSnapshot())).to.eq('unlocked')
    expect(spied.mock.calls).to.have.lengthOf(1)
    expect(extractableUnwraps(spied)).to.have.lengthOf(1)
  })

  it("creating a vault keeps a vaultKey that cannot be exported: the one each new boxKey is wrapped under", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await TH.unlock(vault, 'pw one')
    const wraps = vi.spyOn(crypto.subtle, 'wrapKey')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake')
    const wrappingKeys = wraps.mock.calls.map((callArgs) => callArgs[2])
    expect(wrappingKeys).to.have.lengthOf(1)
    expect(wrappingKeys[0]?.extractable).to.be.false
  })

  it("a passphrase unlock asks for exactly one extractable transient, for the device wrap", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.lock()
    const spied = watchUnwraps()
    await TH.unlock(vault, 'pw one')
    // The non-extractable handle it kept still does the whole job.
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake')
    expect(await vault.getWhisper('anthropic')).to.eq('sk-ant-fake')
    expect(extractableUnwraps(spied)).to.have.lengthOf(1)
  })

  it("a lease never makes an extractable handle at all", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake')
    const spied = watchUnwraps()
    const later = await world.open()
    expect(TH.stateOf(later.getSnapshot())).to.eq('unlocked')
    expect(await later.getWhisper('anthropic')).to.eq('sk-ant-fake')
    expect(extractableUnwraps(spied)).to.have.lengthOf(0)
  })

  it("putWayin asks for exactly two extractable transients: one in the reseal, for the new wrap, and one in the grant, for the device wrap", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake')
    const spied = watchUnwraps()
    await TH.putWayin(vault, 'pw one', 'pw two')
    expect(await vault.getWhisper('anthropic')).to.eq('sk-ant-fake')
    expect(extractableUnwraps(spied)).to.have.lengthOf(2)
  })
})
// --

// == [Asking the user]: ensureUnlocked and requestCleartext, by the Contract

/** A requestCleartext that types `pw` into the gating it is handed: an unlock's passphrase, or a novel vault's first. */
const typingPw = () => vi.fn<RequestCleartext>(async (gating) => {
  if (gating.gatingkind === 'unlock_vault') {
    await gating.attemptPassphrase('pw')
  } else if (gating.gatingkind === 'initialize_gate') {
    await gating.attempt('pw')
  }
})

/** The `unlock_vault` gating `dialog` was handed first. */
const unlockAsked = async (dialog: ReturnType<typeof TH.heldDialog>) => TH.asKind(await dialog.asked(), 'unlock_vault')

/** A strength checker that finds `pw` weak, and every other passphrase strong. */
const pwIsWeak: StrengthChecker = (passphrase) => (passphrase === 'pw' ? { strong: false, reason: 'Found in a breach: pick another.' } : { strong: true })

/** A world whose `u1` vault stands, made with `pw`, with a Vault object on it born locked under `overrides`. */
const lockedVaultWith = async (overrides: Partial<TH.BornVaultOpts>) => {
  const world = makeWorld()
  const maker = await world.openUnlocked('pw')
  await maker.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
  await maker.lock()
  TH.closeVault(maker)
  const vault = await world.open(overrides)
  return { world, vault }
}

/** Delete `world`'s vault from another device, with `pw`: a vault hearing storage hears it gone. */
const deleteElsewhere = async (world: ReturnType<typeof makeWorld>) => {
  const elsewhere = await world.open({ deviceDB: memoryDeviceDB() })
  await TH.del(elsewhere, 'pw')
}

describe("vault.ensureUnlocked, by the Contract", () => {
  it("says hello first, and refuses with hello's refusal as it came (Contract: ensureUnlocked, Does 1, and Refuses: everything hello refuses)", async () => {
    const requestCleartext = typingPw()
    const { world, vault } = await lockedVaultWith({ requestCleartext })
    world.advance(StaleMinutes * MinuteMillis)
    vi.spyOn(world.vaultDB, 'getVault').mockResolvedValueOnce(bad(new VaultError('storage_unavailable', 'The vault storage could not be reached.')))
    await TH.expectRefusal(vault.ensureUnlocked(), 'storage_unavailable')
    expect(requestCleartext).not.toHaveBeenCalled()
    expect(TH.stateOf(vault.snapshot)).to.eq('locked')
  })

  it("resolves the vault at once while unlocked and the lease not ending within renewMinutes: no prompt, no write (Contract: ensureUnlocked, Does 2)", async () => {
    const world = makeWorld()
    const requestCleartext = typingPw()
    const vault = await world.openUnlocked('pw', { requestCleartext })
    requestCleartext.mockClear()
    const putLease = vi.spyOn(world.deviceDB, 'putLease')
    expect(await vault.ensureUnlocked()).to.eq(vault)
    expect(await vault.ensureUnlocked({ renewMinutes: 60 })).to.eq(vault)
    expect(requestCleartext).not.toHaveBeenCalled()
    expect(putLease).not.toHaveBeenCalled()
  })

  it("raises initialize_gate on a vault with no passphrase yet, and its attempt sets the first (Contract: ensureUnlocked, Does 3)", async () => {
    const world = makeWorld()
    const requestCleartext = typingPw()
    const vault = await world.open({ requestCleartext })
    expect(await vault.ensureUnlocked()).to.eq(vault)
    expect(requestCleartext.mock.calls[0]?.[0].gatingkind).to.eq('initialize_gate')
    expect(TH.stateOf(vault.snapshot)).to.eq('unlocked')
    expect(vault.snapshot.gate?.passphrase).to.not.be.null
  })

  it("raises unlock_vault on a vault that stands, with no lease on this device (Contract: ensureUnlocked, Does 3)", async () => {
    const requestCleartext = typingPw()
    const { vault } = await lockedVaultWith({ requestCleartext })
    await vault.ensureUnlocked()
    expect(requestCleartext.mock.calls[0]?.[0].gatingkind).to.eq('unlock_vault')
    expect(TH.stateOf(vault.snapshot)).to.eq('unlocked')
  })

  it("raises unlock_vault when the lease ends within renewMinutes, and renews it, never taking its own twilight lease back up from this device's store (Contract: ensureUnlocked, Does 3)", async () => {
    const world = makeWorld()
    const requestCleartext = typingPw()
    const vault = await world.openUnlocked('pw', { requestCleartext, leaseHours: 1 })
    requestCleartext.mockClear()
    world.advance(HourMillis - (10 * MinuteMillis))
    await vault.ensureUnlocked({ renewMinutes: 5 })
    expect(requestCleartext).not.toHaveBeenCalled()
    const twilight = await world.getLease()
    await vault.ensureUnlocked({ renewMinutes: 15 })
    expect(requestCleartext).toHaveBeenCalledOnce()
    expect(requestCleartext.mock.calls[0]?.[0].gatingkind).to.eq('unlock_vault')
    expect(vault.snapshot.ask_passphrase_at).to.eq(world.clock.now() + HourMillis)
    const renewed = await world.getLease()
    expect(renewed?.ask_passphrase_at).to.eq(world.clock.now() + HourMillis)
    expect(twilight?.ask_passphrase_at).to.be.below(world.clock.now() + HourMillis)
  })

  it("raises one gating at a time: a second caller that finds one standing waits on it (Contract: ensureUnlocked, Does 3.1, and Guarantees)", async () => {
    const dialog = TH.heldDialog()
    const { vault } = await lockedVaultWith({ requestCleartext: dialog.requestCleartext })
    const first = vault.ensureUnlocked()
    const gating = await unlockAsked(dialog)
    const second = vault.getWhisper('anthropic')
    const third = vault.tryEnsureUnlocked()
    await TH.expectGood(gating.attemptPassphrase('pw'))
    dialog.close()
    expect(await first).to.eq(vault)
    expect(await second).to.eq('sk-fake')
    await TH.expectGood(third)
    expect(dialog.requestCleartext).toHaveBeenCalledOnce()
  })

  it("raises a fresh gating for the next call once one has settled (Contract: ensureUnlocked, Guarantees)", async () => {
    const requestCleartext = vi.fn<RequestCleartext>()
    const { vault } = await lockedVaultWith({ requestCleartext })
    await TH.expectRefusal(vault.ensureUnlocked(), 'vault_locked')
    await TH.expectRefusal(vault.ensureUnlocked(), 'vault_locked')
    expect(requestCleartext).toHaveBeenCalledTimes(2)
  })

  it("declines at once with no requestCleartext: the call refuses vault_locked, as every data call does (Contract: ensureUnlocked, Does 3.2)", async () => {
    const { vault } = await lockedVaultWith({ requestCleartext: null })
    const err = await TH.expectRefusal(vault.ensureUnlocked(), 'vault_locked')
    expect(err.message).to.include('requestCleartext')
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'vault_locked')
    await TH.expectRefusal(vault.putBox({ boxlabel: 'openai' }, 'sk-fake'), 'vault_locked')
    await TH.expectRefusal(vault.delBox('anthropic'), 'vault_locked')
    expect(TH.stateOf(vault.snapshot)).to.eq('locked')
  })

  it("hands requestCleartext a gating: the standing vault, its gatingkind, its attempts, decline and lockLanded (Contract: ensureUnlocked, Does 3.3)", async () => {
    const dialog = TH.heldDialog()
    const { vault } = await lockedVaultWith({ requestCleartext: dialog.requestCleartext })
    const ensuring = vault.tryEnsureUnlocked()
    const gating = await unlockAsked(dialog)
    expect(gating.vault).to.eq(vault)
    expect(gating.gatingkind).to.eq('unlock_vault')
    expect(gating.lockLanded).to.be.instanceOf(Promise)
    expect(gating.decline).to.be.a('function')
    expect(gating.attemptPasskey).to.be.a('function')
    // Bound: handed on alone, it still attempts.
    const { attemptPassphrase } = gating
    const { val } = await attemptPassphrase('pw')
    expect(val).to.eq(vault)
    dialog.close()
    expect(await TH.expectGood(ensuring)).to.eq(vault)
  })

  it("hands requestCleartext a frozen gating it can only answer: the package offers a host no way to make, raise or rewrite one", async () => {
    const dialog = TH.heldDialog()
    const { vault } = await lockedVaultWith({ requestCleartext: dialog.requestCleartext })
    const ensuring = vault.tryEnsureUnlocked()
    const gating = await dialog.asked()
    expect(Object.isFrozen(gating)).to.be.true
    expect(Object.keys(Safebyok)).to.not.include('RaisedGating')
    gating.decline()
    await TH.expectBad(ensuring, 'vault_locked')
  })

  it("reads storage again in its attempt, and resolves the fresh vault (Contract: ensureUnlocked, Does 3.4, and Returns)", async () => {
    const requestCleartext = typingPw()
    const { world, vault } = await lockedVaultWith({ requestCleartext })
    const reads = vi.spyOn(world.vaultDB, 'getVault')
    world.advance((StaleMinutes + 1) * MinuteMillis)
    expect(await vault.ensureUnlocked()).to.eq(vault)
    expect(TH.stateOf(vault.snapshot)).to.eq('unlocked')
    // The hello before the gating, and the attempt's own read, once staleMinutes have passed.
    expect(reads.mock.calls.length).to.be.at.least(2)
  })

  it("refuses vault_locked when the user declines, the vault as it was (Contract: ensureUnlocked, Does 3.5, and Refuses: vault_locked)", async () => {
    const { vault } = await lockedVaultWith({ requestCleartext: (gating) => { gating.decline() } })
    const err = await TH.expectRefusal(vault.ensureUnlocked(), 'vault_locked')
    expect(err.message).to.include('declined')
    expect(TH.stateOf(vault.snapshot)).to.eq('locked')
  })

  it("refuses vault_locked when the user declines a gating raised as the lease nears its end, and does not lock: the lease in hand stands, its deadline unmoved (Contract: ensureUnlocked, Does 3.6)", async () => {
    const world = makeWorld()
    const requestCleartext = vi.fn<RequestCleartext>(TH.scriptedRequestCleartext)
    const vault = await world.openUnlocked('pw', { requestCleartext, leaseHours: 1 })
    requestCleartext.mockClear()
    const deadline = vault.snapshot.ask_passphrase_at
    world.advance(HourMillis - MinuteMillis)
    // Nothing scripted: the dialog closes unanswered.
    await TH.expectRefusal(vault.ensureUnlocked({ renewMinutes: 5 }), 'vault_locked')
    expect(requestCleartext).toHaveBeenCalledOnce()
    expect(TH.stateOf(vault.snapshot)).to.eq('unlocked')
    expect(vault.snapshot.ask_passphrase_at).to.eq(deadline)
    expect(await vault.ensureUnlocked()).to.eq(vault)
  })

  // A deletion heard leaves the Vault object gone, so its waiters hear that, as every later call does.
  for (const [landing, blurb, refusalkind] of [
    [async (vault: Vault) => { await vault.lock() }, 'a lock()', 'vault_locked'],
    [async (vault: Vault, world: ReturnType<typeof makeWorld>) => { await deleteElsewhere(world); await vault.tryRefresh() }, 'a deletion on another device', 'vault_gone'],
  ] as const) {
    it(`refuses every waiter ${refusalkind} at once and settles lockLanded when ${blurb} lands while the gating stands (Contract: ensureUnlocked, Does 3.7)`, async () => {
      const dialog = TH.heldDialog()
      const { world, vault } = await lockedVaultWith({ requestCleartext: dialog.requestCleartext })
      const first = vault.tryEnsureUnlocked()
      const gating = await unlockAsked(dialog)
      const second = vault.tryGetWhisper('anthropic')
      // Let the second caller reach the gating standing, and wait on it.
      await TH.wakeupAtNextTick()
      let landed = false
      void gating.lockLanded.then(() => { landed = true })
      await landing(vault, world)
      await TH.expectBad(first, refusalkind)
      await TH.expectBad(second, refusalkind)
      expect(landed).to.be.true
      // The dialog that closes after it changes nothing.
      dialog.close()
      expect(dialog.requestCleartext).toHaveBeenCalledOnce()
    })
  }

  it("refuses an attempt after lockLanded gating_landed at once, trying nothing (Contract: ensureUnlocked, Does 3.7)", async () => {
    const dialog = TH.heldDialog()
    const { world, vault } = await lockedVaultWith({ requestCleartext: dialog.requestCleartext })
    const ensuring = vault.tryEnsureUnlocked()
    const gating = await unlockAsked(dialog)
    await vault.lock()
    const derive = vi.spyOn(TH.testDeriver, 'deriveKeyBytes')
    const reads = vi.spyOn(world.vaultDB, 'getVault')
    await TH.expectBad(gating.attemptPassphrase('pw'), 'gating_landed')
    expect(derive).not.toHaveBeenCalled()
    expect(reads).not.toHaveBeenCalled()
    expect(TH.stateOf(vault.snapshot)).to.eq('locked')
    await TH.expectBad(ensuring, 'vault_locked')
  })

  it("leaves the vault locked when a lock lands under an attempt: the lock wins, and the attempt refuses gating_landed (Contract: Gating, attempt refuses)", async () => {
    const dialog = TH.heldDialog()
    const world = makeRacingWorld()
    const maker = await world.openUnlocked('pw')
    await maker.lock()
    TH.closeVault(maker)
    const vault = await world.open({ requestCleartext: dialog.requestCleartext })
    const ensuring = vault.tryEnsureUnlocked()
    const gating = await unlockAsked(dialog)
    const gate = world.holdNextDerive()
    const attempting = gating.attemptPassphrase('pw')
    await gate.reached
    await vault.lock()
    gate.release()
    const err = await TH.expectBad(attempting, 'gating_landed')
    expect(err.message).to.include('while this proof was being checked')
    expect(TH.stateOf(vault.snapshot)).to.eq('locked')
    expect(await world.getLease()).to.be.null
    await TH.expectBad(ensuring, 'vault_locked')
  })

  it("erases the lease an attempt wrote when a lock lands as it writes it: the lock wins across a reload too (Contract: Gating, attempt refuses: gating_landed)", async () => {
    const dialog = TH.heldDialog()
    const world = makeRacingWorld()
    const maker = await world.openUnlocked('pw')
    await maker.lock()
    TH.closeVault(maker)
    const vault = await world.open({ requestCleartext: dialog.requestCleartext })
    const ensuring = vault.tryEnsureUnlocked()
    const gating = await unlockAsked(dialog)
    const gate = world.holdNextLease()
    const attempting = gating.attemptPassphrase('pw')
    await gate.reached
    await vault.lock()
    gate.release()
    await TH.expectBad(attempting, 'gating_landed')
    expect(await world.getLease()).to.be.null
    expect(await world.stateOnOpen()).to.eq('locked')
    await TH.expectBad(ensuring, 'vault_locked')
  })

  it("attaches no lease when the user declines while the attempt writes it, and does not lock: the decline only keeps the gating from unlocking", async () => {
    const dialog = TH.heldDialog()
    const world = makeRacingWorld()
    const maker = await world.openUnlocked('pw')
    await maker.lock()
    TH.closeVault(maker)
    const vault = await world.open({ requestCleartext: dialog.requestCleartext })
    const ensuring = vault.tryEnsureUnlocked()
    const gating = await unlockAsked(dialog)
    const held = world.holdNextLease()
    const attempting = gating.attemptPassphrase('pw')
    await held.reached
    gating.decline()
    await TH.expectBad(ensuring, 'vault_locked')
    held.release()
    await TH.expectBad(attempting, 'gating_landed')
    expect(TH.stateOf(vault.snapshot)).to.eq('locked')
    expect(heldLeaseOf(vault)).to.be.null
  })

  it("stays locked, with no lease, when the user declines during an attempt and the app then locks: the decline stands the attempt down (Contract: Gating, attempt refuses: gating_landed)", async () => {
    const dialog = TH.heldDialog()
    const world = makeRacingWorld()
    const maker = await world.openUnlocked('pw')
    await maker.lock()
    TH.closeVault(maker)
    const vault = await world.open({ requestCleartext: dialog.requestCleartext })
    const ensuring = vault.tryEnsureUnlocked()
    const gating = await unlockAsked(dialog)
    const gate = world.holdNextDerive()
    // Enter, then Escape while the passphrase is derived, then the app's own lock().
    const attempting = gating.attemptPassphrase('pw')
    await gate.reached
    gating.decline()
    await TH.expectBad(ensuring, 'vault_locked')
    await vault.lock()
    gate.release()
    const err = await TH.expectBad(attempting, 'gating_landed')
    expect(err.message).to.include('while this proof was being checked')
    expect(TH.stateOf(vault.snapshot)).to.eq('locked')
    expect(await world.getLease()).to.be.null
    expect(await world.stateOnOpen()).to.eq('locked')
  })

  it("refuses a second attempt attempt_in_flight while the first runs, so Enter pressed twice proves once, and a lock after it wins (Contract: Gating, attempt refuses: attempt_in_flight)", async () => {
    const dialog = TH.heldDialog()
    const world = makeRacingWorld()
    const maker = await world.openUnlocked('pw')
    await maker.lock()
    TH.closeVault(maker)
    const vault = await world.open({ requestCleartext: dialog.requestCleartext })
    const ensuring = vault.tryEnsureUnlocked()
    const gating = await unlockAsked(dialog)
    const gate = world.holdNextDerive()
    const first = gating.attemptPassphrase('pw')
    await gate.reached
    await TH.expectBad(gating.attemptPassphrase('pw'), 'attempt_in_flight')
    gate.release()
    await TH.expectGood(first)
    await TH.expectGood(ensuring)
    await vault.lock()
    expect(TH.stateOf(vault.snapshot)).to.eq('locked')
    expect(await world.getLease()).to.be.null
  })

  it("refuses an attempt after the user declined gating_landed at once, trying nothing (Contract: Gating, attempt refuses: gating_landed)", async () => {
    const dialog = TH.heldDialog()
    const { world, vault } = await lockedVaultWith({ requestCleartext: dialog.requestCleartext })
    const ensuring = vault.tryEnsureUnlocked()
    const gating = await unlockAsked(dialog)
    dialog.close()
    await TH.expectBad(ensuring, 'vault_locked')
    const derive = vi.spyOn(TH.testDeriver, 'deriveKeyBytes')
    const reads = vi.spyOn(world.vaultDB, 'getVault')
    const err = await TH.expectBad(gating.attemptPassphrase('pw'), 'gating_landed')
    expect(err.message).to.include('This dialog is over')
    expect(derive).not.toHaveBeenCalled()
    expect(reads).not.toHaveBeenCalled()
    expect(TH.stateOf(vault.snapshot)).to.eq('locked')
  })

  it("refuses unexpected_error when requestCleartext throws an error quoting the passphrase, carrying nothing of it, no cause among it, never told as bad news, the logger hearing only that it threw (Contract: ensureUnlocked, Refuses)", async () => {
    const thrown = new Error('invalid: pw-the-passphrase')
    const onBadNews = vi.fn()
    const { world, vault } = await lockedVaultWith({ requestCleartext: () => { throw thrown }, onBadNews })
    const err = await TH.expectRefusal(vault.ensureUnlocked(), 'unexpected_error')
    expect(err.cause).to.be.undefined
    expect(JSON.stringify(err)).to.not.include('pw-the-passphrase')
    expect(err.message).to.not.include('pw-the-passphrase')
    expect(TH.loggedText(world.logged)).to.not.include('pw-the-passphrase')
    expect(world.logged.map((heard) => [heard.level, heard.story])).to.deep.include(['error', { call: 'requestCleartext', refusalkind: null }])
    expect(onBadNews).not.toHaveBeenCalled()
  })

  it("refuses unexpected_error for a VaultError requestCleartext lets escape, never with its kind, nor telling it as bad news (Contract: ensureUnlocked, Refuses)", async () => {
    for (const kind of ['wrong_passphrase', 'damaged_vault'] as const) {
      const thrown = new VaultError(kind, 'A refusal met inside requestCleartext.')
      const onBadNews = vi.fn()
      const { vault } = await lockedVaultWith({ requestCleartext: () => Promise.reject(thrown), onBadNews })
      const err = await TH.expectRefusal(vault.ensureUnlocked(), 'unexpected_error')
      expect(err.cause).to.be.undefined
      expect(onBadNews).not.toHaveBeenCalled()
    }
  })

  it("logs no refusalkind for a VaultError requestCleartext throws whose kind is off the list: that is the host's own text, and may quote the passphrase", async () => {
    const forged = new VaultError('invalid: pw-the-passphrase' as RefusalKind, 'A refusal made up inside requestCleartext.')
    const { world, vault } = await lockedVaultWith({ requestCleartext: () => Promise.reject(forged) })
    const err = await TH.expectRefusal(vault.ensureUnlocked(), 'unexpected_error')
    expect(err.cause).to.be.undefined
    expect(TH.loggedText(world.logged)).to.not.include('pw-the-passphrase')
    expect(world.logged.map((heard) => [heard.level, heard.story])).to.deep.include(['error', { call: 'requestCleartext', refusalkind: null }])
  })

  it("refuses a renewMinutes that is not zero or more minutes, and a misspelt option, as bad_option", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await TH.expectRefusal(vault.ensureUnlocked({ renewMinutes: -1 }), 'bad_option')
    await TH.expectRefusal(vault.ensureUnlocked({ renewMinutes: '5' as unknown as number }), 'bad_option')
    await TH.expectRefusal(vault.ensureUnlocked({ renewMinuts: 5 } as unknown as { renewMinutes: number }), 'bad_option')
  })

  it("refuses a renewMinutes as long as the lease or longer as bad_option, asking no one: every call would ask", async () => {
    const world = makeWorld()
    const requestCleartext = vi.fn<RequestCleartext>(TH.scriptedRequestCleartext)
    const vault = await world.openUnlocked('pw', { requestCleartext, leaseHours: 1 })
    requestCleartext.mockClear()
    for (const renewMinutes of [60, 61, Infinity]) {
      await TH.expectRefusal(vault.ensureUnlocked({ renewMinutes }), 'bad_option')
    }
    expect(requestCleartext).not.toHaveBeenCalled()
    expect(await vault.ensureUnlocked({ renewMinutes: 59 })).to.eq(vault)
    expect(requestCleartext).not.toHaveBeenCalled()
  })

  it("asks now when the lease ends within the hour, as its third example shows", async () => {
    const world = makeWorld()
    const requestCleartext = typingPw()
    const vault = await world.openUnlocked('pw', { requestCleartext })
    requestCleartext.mockClear()
    await vault.ensureUnlocked({ renewMinutes: 60 })
    expect(requestCleartext).not.toHaveBeenCalled()
    world.advance(SevenDaysMillis - (30 * MinuteMillis))
    await vault.ensureUnlocked({ renewMinutes: 60 })
    expect(requestCleartext.mock.calls[0]?.[0].gatingkind).to.eq('unlock_vault')
    expect(vault.snapshot.ask_passphrase_at).to.eq(world.clock.now() + SevenDaysMillis)
  })

  it("refuses an event in place of options as bad_option, naming the wrap, and asks no one", async () => {
    const requestCleartext = typingPw()
    const { vault } = await lockedVaultWith({ requestCleartext })
    const err = await TH.expectBad(vault.tryEnsureUnlocked(new Event('click') as unknown as { renewMinutes?: number }), 'bad_option')
    expect(err.message).to.include('`() => vault.tryEnsureUnlocked()`')
    expect(requestCleartext).to.not.have.been.called
    expect(TH.stateOf(vault.snapshot)).to.eq('locked')
  })

  it("unlocks from a button's handler wrapped as its second example shows", async () => {
    const requestCleartext = typingPw()
    const { vault } = await lockedVaultWith({ requestCleartext })
    const button = new EventTarget()
    // eslint-disable-next-line @typescript-eslint/no-misused-promises -- the example's own form: a handler whose Outcome nobody reads
    button.addEventListener('click', () => vault.tryEnsureUnlocked())
    button.dispatchEvent(new Event('click'))
    await vi.waitFor(() => { expect(TH.stateOf(vault.snapshot)).to.eq('unlocked') })
  })

  it("resolves unlocked or refuses vault_locked, as its first example shows", async () => {
    const { vault } = await lockedVaultWith({})
    await TH.expectRefusal(vault.ensureUnlocked(), 'vault_locked')
    await TH.unlock(vault, 'pw')
    expect(await vault.ensureUnlocked()).to.eq(vault)
  })

  it("refuses every waiter vault_gone at once and settles lockLanded when the bank lets the vault go while the gating stands (Contract: ensureUnlocked, Does 3.7)", async () => {
    const dialog = TH.heldDialog()
    const { vault } = await lockedVaultWith({ requestCleartext: dialog.requestCleartext })
    const first = vault.tryEnsureUnlocked()
    const gating = await unlockAsked(dialog)
    const second = vault.tryGetWhisper('anthropic')
    // Let the second caller reach the gating standing, and wait on it.
    await TH.wakeupAtNextTick()
    let landed = false
    void gating.lockLanded.then(() => { landed = true })
    TH.closeVault(vault)
    await TH.expectBad(first, 'vault_gone')
    await TH.expectBad(second, 'vault_gone')
    expect(landed).to.be.true
    // An attempt after the let-go tries nothing.
    await TH.expectBad(gating.attemptPassphrase('pw'), 'gating_landed')
    dialog.close()
    expect(dialog.requestCleartext).toHaveBeenCalledOnce()
  })

  it("refuses vault_gone once the bank lets the vault go", async () => {
    const { vault } = await lockedVaultWith({ requestCleartext: typingPw() })
    TH.closeVault(vault)
    await TH.expectRefusal(vault.ensureUnlocked(), 'vault_gone')
  })

  it("refuses vault_gone for a let-go landing during its hello, asking requestCleartext nothing", async () => {
    const requestCleartext = typingPw()
    const { world, vault } = await lockedVaultWith({ requestCleartext })
    world.advance(StaleMinutes * MinuteMillis)
    const looking = TH.holdNextCall(world.vaultDB, 'getVault')
    const ensuring = vault.ensureUnlocked()
    await looking.reached
    TH.closeVault(vault)
    looking.release()
    await TH.expectRefusal(ensuring, 'vault_gone')
    expect(requestCleartext).not.toHaveBeenCalled()
  })

  it("refuses vault_gone for a let-go landing during its gating's consult of another tab's lease, taking nothing up and asking requestCleartext nothing", async () => {
    const requestCleartext = typingPw()
    const { world, vault } = await lockedVaultWith({ requestCleartext })
    const otherTab = await world.open()
    await TH.unlock(otherTab, 'pw')
    const reading = TH.holdNextCall(world.deviceDB, 'getLease')
    const ensuring = vault.ensureUnlocked()
    await reading.reached
    TH.closeVault(vault)
    reading.release()
    await TH.expectRefusal(ensuring, 'vault_gone')
    expect(requestCleartext).not.toHaveBeenCalled()
    expect(vault.snapshot.ask_passphrase_at).to.be.null
    expect(await world.getLease()).to.not.be.null
  })

  it("takes nothing up when a lock() lands during its gating's consult of another tab's lease: the consult stands down, and the lock erases the lease", async () => {
    const requestCleartext = vi.fn<RequestCleartext>()
    const { world, vault } = await lockedVaultWith({ requestCleartext })
    const otherTab = await world.open()
    await TH.unlock(otherTab, 'pw')
    const reading = TH.holdNextCall(world.deviceDB, 'getLease')
    const ensuring = vault.ensureUnlocked()
    await reading.reached
    await vault.lock()
    reading.release()
    await TH.expectRefusal(ensuring, 'vault_locked')
    expect(TH.stateOf(vault.snapshot)).to.eq('locked')
    expect(await world.getLease()).to.be.null
  })
})

describe("a lock or a let-go landing while a box call waits to be unlocked (risk 10)", () => {
  // Each box call that needs the vault unlocked, and what it would change in storage.
  const BoxCalls = [
    [(vault: Vault) => vault.tryPutBox({ boxlabel: 'anthropic' }, 'sk-fake-new'), 'putBox()'],
    [(vault: Vault) => vault.tryDelBox('anthropic'), 'delBox()'],
  ] as const
  // Where the wait is held: the hello first, or the gating's consult of another tab's lease after it.
  const Waits = [
    ['its hello', (world: ReturnType<typeof makeWorld>) => {
      // Past staleMinutes, so the hello reads.
      world.advance(StaleMinutes * MinuteMillis)
      return TH.holdNextCall(world.vaultDB, 'getVault')
    }],
    // The answer held, not the call: the lease is read before the lock lands, as a device store applies calls in order.
    ["its gating's consult of another tab's lease", (world: ReturnType<typeof makeWorld>) => TH.holdNextAnswer(world.deviceDB, 'getLease')],
  ] as const

  for (const [call, callname] of BoxCalls) {
    for (const [waitname, holdWait] of Waits) {
      it(`refuses ${callname} vault_locked for a lock() landing during ${waitname}, taking nothing up and changing nothing stored`, async () => {
        const requestCleartext = vi.fn<RequestCleartext>()
        const { world, vault } = await lockedVaultWith({ requestCleartext })
        const otherTab = await world.open({ vaultDB: world.deafVaultDB() })
        await TH.unlock(otherTab, 'pw')
        const boxBefore = storedRowOf(world, 'anthropic')
        const held = holdWait(world)
        const calling = call(vault)
        await held.reached
        await vault.lock()
        held.release()
        await TH.expectBad(calling, 'vault_locked')
        expect(TH.stateOf(vault.snapshot)).to.eq('locked')
        expect(await world.getLease()).to.be.null
        expect(storedRowOf(world, 'anthropic')).to.deep.equal(boxBefore)
      })

      it(`refuses ${callname} vault_gone for a let-go landing during ${waitname}, asking requestCleartext nothing and changing nothing stored`, async () => {
        const requestCleartext = typingPw()
        const { world, vault } = await lockedVaultWith({ requestCleartext })
        const otherTab = await world.open({ vaultDB: world.deafVaultDB() })
        await TH.unlock(otherTab, 'pw')
        const leaseBefore = await world.getLease()
        const boxBefore = storedRowOf(world, 'anthropic')
        const held = holdWait(world)
        const calling = call(vault)
        await held.reached
        TH.closeVault(vault)
        held.release()
        await TH.expectBad(calling, 'vault_gone')
        expect(requestCleartext).not.toHaveBeenCalled()
        expect(vault.snapshot.ask_passphrase_at).to.be.null
        expect(await world.getLease()).to.deep.equal(leaseBefore)
        expect(storedRowOf(world, 'anthropic')).to.deep.equal(boxBefore)
      })
    }
  }
})

/** The options `world` makes a bank with: its vault options, the vault's own names left out. */
const bankOptsOf = (world: ReturnType<typeof makeWorld>, overrides: Partial<TH.BornVaultOpts>) => {
  const { vaultlabel: _vaultlabel, ...bankOpts } = world.optsWith(overrides)
  return bankOpts
}

describe("Bank.make's requestCleartext", () => {
  it("refuses anything but a function, or none, as bad_option", async () => {
    const world = makeWorld()
    for (const notAFunction of ['pw', 42, {}]) {
      TH.expectSyncRefusal(() => Bank.make(bankOptsOf(world, { requestCleartext: notAFunction as unknown as RequestCleartext })), 'bad_option')
    }
    expect(await world.stateOnOpen({ requestCleartext: null })).to.eq('novel')
  })

  it("is handed each gating, and its dialog's attempts decide, as its example shows", async () => {
    const showDialogFor = vi.fn(async (gating: Gating): Promise<void> => {
      if (gating.gatingkind === 'unlock_vault') { await gating.attemptPassphrase('pw') }
    })
    const { vault } = await lockedVaultWith({ requestCleartext: (gating) => showDialogFor(gating) })
    expect(await vault.getWhisper('anthropic')).to.eq('sk-fake')
    expect(showDialogFor).toHaveBeenCalledOnce()
  })

  it("declines without asking when no user gesture is in hand, as RequestCleartext's example shows", async () => {
    vi.stubGlobal('navigator', { userActivation: { isActive: false } })
    const showDialogFor = vi.fn((_gating: Gating): Promise<void> => Promise.resolve())
    const requestCleartext: RequestCleartext = async (gating) => {
      if ((globalThis.navigator as { userActivation?: { isActive: boolean } }).userActivation?.isActive === false) { return }
      await showDialogFor(gating)
    }
    try {
      const { vault } = await lockedVaultWith({ requestCleartext })
      await TH.expectRefusal(vault.getWhisper('anthropic'), 'vault_locked')
      expect(showDialogFor).not.toHaveBeenCalled()
      expect(TH.stateOf(vault.snapshot)).to.eq('locked')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe("every data call, through ensureUnlocked", () => {
  for (const [call, blurb] of [
    [(vault: Vault) => vault.getWhisper('anthropic'), 'getBox'],
    [(vault: Vault) => vault.getWhisper('anthropic'), 'getWhisper'],
    [(vault: Vault) => vault.useWhisper('anthropic', (whisper) => whisper), 'useWhisper'],
    [(vault: Vault) => vault.putBox({ boxlabel: 'openai' }, 'sk-fake-two'), 'putBox'],
    [(vault: Vault) => vault.delBox('anthropic'), 'delBox'],
  ] as const) {
    it(`asks requestCleartext when locked, and goes on once it is unlocked: ${blurb} (Contract: ensureUnlocked)`, async () => {
      const requestCleartext = typingPw()
      const { vault } = await lockedVaultWith({ requestCleartext })
      await call(vault)
      expect(requestCleartext).toHaveBeenCalledOnce()
      expect(TH.stateOf(vault.snapshot)).to.eq('unlocked')
    })
  }

  it("refuses no_whisper at once for a putBox() leaving out the whisper of a box the listing does not show, asking nothing, and asks for one it shows", async () => {
    const requestCleartext = typingPw()
    const { vault } = await lockedVaultWith({ requestCleartext })
    await TH.expectRefusal(vault.putBox({ boxlabel: 'openai', sidecar: { note: 'work' } }), 'no_whisper')
    expect(requestCleartext).not.toHaveBeenCalled()
    expect(TH.stateOf(vault.snapshot)).to.eq('locked')
    await vault.putBox({ boxlabel: 'anthropic', sidecar: { note: 'work' } })
    expect(requestCleartext).toHaveBeenCalledOnce()
  })

  it("refuses a whisper it cannot store before asking for anything: a call that cannot land never prompts", async () => {
    const requestCleartext = typingPw()
    const { vault } = await lockedVaultWith({ requestCleartext })
    await TH.expectRefusal(vault.putBox({ boxlabel: 'openai' }, null as unknown as string), 'bad_whisper')
    await TH.expectRefusal(vault.putBox({ boxlabel: 'no such label!' }, 'sk-fake'), 'bad_scope')
    expect(requestCleartext).not.toHaveBeenCalled()
  })

  for (const [call, blurb, unlisted] of [
    [(vault: Vault, boxlabel: string) => vault.getBox(boxlabel), 'getBox', 'resolves null'],
    [(vault: Vault, boxlabel: string) => vault.getWhisper(boxlabel), 'getWhisper', 'refuses absent_box'],
    [(vault: Vault, boxlabel: string) => vault.useWhisper(boxlabel, (whisper) => whisper), 'useWhisper', 'refuses absent_box'],
    [(vault: Vault, boxlabel: string) => vault.delBox(boxlabel), 'delBox', 'refuses absent_box'],
  ] as const) {
    it(`refuses bad_scope for a boxlabel that is no label, and ${unlisted} for a box the listing in hand does not show, before asking for anything: ${blurb} (Contract: ensureUnlocked, a call that cannot land never prompts)`, async () => {
      const requestCleartext = typingPw()
      const { vault } = await lockedVaultWith({ requestCleartext })
      const expectUnlisted = async (boxlabel: string) => {
        if (unlisted === 'resolves null') {
          expect(await call(vault, boxlabel)).to.be.null
        } else {
          await TH.expectRefusal(call(vault, boxlabel), 'absent_box')
        }
      }
      // No label; a label, and not listed.
      await TH.expectRefusal(call(vault, 'tab\there'), 'bad_scope')
      await TH.expectRefusal(call(vault, 'no such label!'), 'bad_scope')
      await expectUnlisted('openai')
      expect(requestCleartext).not.toHaveBeenCalled()
      expect(TH.stateOf(vault.snapshot)).to.eq('locked')
      // A box the listing shows is asked for as before.
      await call(vault, 'anthropic')
      expect(requestCleartext).toHaveBeenCalledOnce()
    })
  }

  it("answers from the listing in hand, reading nothing more, though another device stored the box meanwhile: getWhisper and delBox refuse absent_box, the listing as fresh as staleMinutes keeps it", async () => {
    const world = makeWorld()
    const maker = await world.openUnlocked('pw')
    await maker.lock()
    TH.closeVault(maker)
    const requestCleartext = typingPw()
    const vault = await world.open({ vaultDB: world.deafVaultDB(), requestCleartext })
    const elsewhere = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.unlock(elsewhere, 'pw')
    await elsewhere.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    world.advance(MinuteMillis)
    const reads = vi.spyOn(world.vaultDB, 'getVault')
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'absent_box')
    await TH.expectRefusal(vault.delBox('anthropic'), 'absent_box')
    expect(reads).not.toHaveBeenCalled()
    expect(requestCleartext).not.toHaveBeenCalled()
    // Once staleMinutes have passed, the call's own hello reads, and the box is asked for.
    world.advance(StaleMinutes * MinuteMillis)
    expect(await TH.expectGood(vault.tryGetWhisper('anthropic'))).to.eq('sk-fake')
    expect(requestCleartext).toHaveBeenCalledOnce()
  })

  it("asks to unlock, not to make a vault, when its hello, past staleMinutes, finds the vault another device made since, with the box in it", async () => {
    const world = makeWorld()
    const requestCleartext = typingPw()
    const vault = await world.open({ vaultDB: world.deafVaultDB(), requestCleartext })
    expect(TH.stateOf(vault.snapshot)).to.eq('novel')
    const elsewhere = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.unlock(elsewhere, 'pw')
    await elsewhere.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'absent_box')
    world.advance(StaleMinutes * MinuteMillis)
    expect(await TH.expectGood(vault.tryGetWhisper('anthropic'))).to.eq('sk-fake')
    expect(requestCleartext).toHaveBeenCalledOnce()
    expect(requestCleartext.mock.calls[0]?.[0].gatingkind).to.eq('unlock_vault')
  })

  it("answers at once for a novel vault, rather than asking to gate one only to find nothing in it: getWhisper and delBox refuse absent_box", async () => {
    const world = makeWorld()
    const requestCleartext = typingPw()
    const vault = await world.open({ requestCleartext })
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'absent_box')
    await TH.expectRefusal(vault.delBox('anthropic'), 'absent_box')
    expect(requestCleartext).not.toHaveBeenCalled()
    expect(TH.stateOf(vault.snapshot)).to.eq('novel')
  })

  it("reads storage for the box once unlocked, whatever the listing shows: the listing in hand only spares a prompt", async () => {
    const { world, vault } = await lockedVaultWith({ requestCleartext: typingPw() })
    await vault.ensureUnlocked()
    const reads = vi.spyOn(world.vaultDB, 'getBox')
    await TH.expectRefusal(vault.getWhisper('openai'), 'absent_box')
    expect(reads).toHaveBeenCalledOnce()
  })
})

describe("the gating's attempt, by the Contract", () => {
  it("resolves the vault, unlocked, for a passphrase that opens it, as Gating's first example shows (Contract: Gating, attempt)", async () => {
    const dialog = TH.heldDialog()
    const { vault } = await lockedVaultWith({ requestCleartext: dialog.requestCleartext })
    const ensuring = vault.ensureUnlocked()
    const gating = await unlockAsked(dialog)
    const { ok, val } = await gating.attemptPassphrase('pw')
    expect(ok).to.be.true
    expect(val).to.eq(vault)
    expect(TH.stateOf(vault.snapshot)).to.eq('unlocked')
    dialog.close()
    expect(await ensuring).to.eq(vault)
  })

  it("refuses wrong_passphrase, to show in place and ask again: the gating stays open, and the loop lives in the dialog, as Gating's first example shows (Contract: Gating, attempt refuses: show in place)", async () => {
    const tries: string[] = []
    const requestCleartext: RequestCleartext = async (gating) => {
      if (gating.gatingkind !== 'unlock_vault') { return }
      for (const typed of ['pw wrong', 'pw']) {
        const { ok, err } = await gating.attemptPassphrase(typed)
        if (ok) { return }
        tries.push(err.refusalkind)
      }
    }
    const { vault } = await lockedVaultWith({ requestCleartext })
    expect(await vault.getWhisper('anthropic')).to.eq('sk-fake')
    expect(tries).to.deep.equal(['wrong_passphrase'])
  })

  it("refuses weak_passphrase on initialize_gate, the checker's reason its message, gating nothing, and the gating stays open (Contract: Gating, attempt refuses: show in place)", async () => {
    const world = makeWorld()
    const dialog = TH.heldDialog()
    const vault = await world.open({ requestCleartext: dialog.requestCleartext, strengthChecker: pwIsWeak })
    const ensuring = vault.tryEnsureUnlocked()
    const gating = TH.asKind(await dialog.asked(), 'initialize_gate')
    const err = await TH.expectBad(gating.attempt('pw'), 'weak_passphrase')
    expect(err.message).to.eq('Found in a breach: pick another.')
    expect(TH.stateOf(vault.snapshot)).to.eq('novel')
    await TH.expectGood(gating.attempt('a longer one'))
    dialog.close()
    await TH.expectGood(ensuring)
  })

  it("refuses wrong_passkey for a passkey's answer that does not open the vault, and opens with the right one (Contract: Gating, attempt refuses: show in place)", async () => {
    const { world, vault: maker } = await vaultWithPasskey()
    await maker.lock()
    TH.closeVault(maker)
    const dialog = TH.heldDialog()
    const vault = await world.open({ requestCleartext: dialog.requestCleartext })
    const ensuring = vault.tryEnsureUnlocked()
    const gating = await unlockAsked(dialog)
    const stranger = { ...await TH.passkeyOf('laptop'), prfBytes: new Uint8Array(32).fill(7) }
    await TH.expectBad(gating.attemptPasskey(stranger), 'wrong_passkey')
    await TH.expectGood(gating.attemptPasskey(await TH.passkeyOf('laptop')))
    dialog.close()
    await TH.expectGood(ensuring)
  })

  it("refuses gate_made_elsewhere when another device set the first passphrase as this one was stored, settling the gating: the call refuses it, and the next asks to unlock (Contract: Gating, attempt refuses: close the dialog)", async () => {
    const world = makeWorld()
    const deafDB = world.deafVaultDB()
    const dialog = TH.heldDialog()
    const vault = await world.open({ vaultDB: deafDB, requestCleartext: dialog.requestCleartext })
    const ensuring = vault.tryEnsureUnlocked()
    const gating = TH.asKind(await dialog.asked(), 'initialize_gate')
    const elsewhere = await world.open({ deviceDB: memoryDeviceDB() })
    TH.beforeNextCall(deafDB, 'putVaultRecord', async () => { await TH.unlock(elsewhere, 'pw one') })
    await TH.expectBad(gating.attempt('pw one'), 'gate_made_elsewhere')
    expect(TH.stateOf(vault.snapshot)).to.eq('novel')
    await TH.expectBad(ensuring, 'gate_made_elsewhere')
    await TH.expectBad(gating.attempt('pw one'), 'gating_landed')
    const again = vault.tryEnsureUnlocked()
    const unlocking = TH.asKind(await dialog.asked(1), 'unlock_vault')
    await TH.expectGood(unlocking.attemptPassphrase('pw one'))
    dialog.close()
    expect(await TH.expectGood(again)).to.eq(vault)
  })

  it("refuses damaged_wayin for a passkey stored damaged, leaving the gating open: the passphrase then unlocks, and the call resolves (Contract: Gating, attempt refuses: show in place)", async () => {
    const { world, vault: maker, laptop } = await vaultWithPasskey()
    await maker.lock()
    TH.closeVault(maker)
    const shortSalt = toB64(new Uint8Array(16))
    spoilWayin(world, 'passkey', { prf_salt_b64: shortSalt })
    const dialog = TH.heldDialog()
    const vault = await world.open({ requestCleartext: dialog.requestCleartext, deviceDB: memoryDeviceDB() })
    const ensuring = vault.tryEnsureUnlocked()
    const gating = await unlockAsked(dialog)
    await TH.expectBad(gating.attemptPasskey({ ...laptop, prf_salt_b64: shortSalt }), 'damaged_wayin')
    await TH.expectGood(gating.attemptPassphrase('pw'))
    dialog.close()
    await TH.expectGood(ensuring)
    expect(dialog.requestCleartext).toHaveBeenCalledOnce()
  })

  it("refuses absent_wayin for a passkey's answer on a vault with no passkey, leaving the gating open: the passphrase then unlocks, and the call resolves (Contract: Gating, attempt refuses: show in place)", async () => {
    const dialog = TH.heldDialog()
    const { vault } = await lockedVaultWith({ requestCleartext: dialog.requestCleartext })
    const ensuring = vault.tryEnsureUnlocked()
    const gating = await unlockAsked(dialog)
    await TH.expectBad(gating.attemptPasskey(await TH.passkeyOf('laptop')), 'absent_wayin')
    await TH.expectGood(gating.attemptPassphrase('pw'))
    dialog.close()
    await TH.expectGood(ensuring)
  })

  it("refuses storage_unavailable when storage cannot be reached, settling the gating: the call refuses it, for the dialog to close (Contract: Gating, attempt refuses: close the dialog)", async () => {
    const dialog = TH.heldDialog()
    const { world, vault } = await lockedVaultWith({ requestCleartext: dialog.requestCleartext })
    const ensuring = vault.tryEnsureUnlocked()
    const gating = await unlockAsked(dialog)
    vi.spyOn(world.vaultDB, 'getVault').mockResolvedValueOnce(bad(new VaultError('storage_unavailable', 'The vault storage could not be reached.')))
    await TH.expectBad(gating.attemptPassphrase('pw'), 'storage_unavailable')
    await TH.expectBad(ensuring, 'storage_unavailable')
    dialog.close()
  })

  it("closes the dialog on lockLanded, as Gating's second example shows", async () => {
    const dialog = TH.heldDialog()
    const { vault } = await lockedVaultWith({ requestCleartext: dialog.requestCleartext })
    void vault.tryEnsureUnlocked()
    const gating = await dialog.asked()
    const closeDialog = vi.fn()
    void gating.lockLanded.then(() => { closeDialog() })
    await vault.lock()
    await gating.lockLanded
    expect(closeDialog).toHaveBeenCalledOnce()
  })
})
// --
