/** The battery every deviceDB runs: one call registers the cases a deviceDB's lease verbs must pass, over a fresh deviceDB for each. */
import { omit } from 'es-toolkit'
import { describe, expect, it } from 'vitest'
import type { Helpers } from 'safebyok-big/internals'
import { eventually, expectRefusal, expectSyncRefusal } from 'safebyok-big/testing'
import type { BankScope, LeaseRow, LiveLeaseRow } from '../../src/shapes/shapes-stamps'
import type { DeviceDB } from '../../src/storage/device-db'
import { WorldScope } from './models-world'
import { type LeaseRowGiven, leaseTombstoneOf, liveLeaseRowOf } from './devicedb-world'

// == [The hooks a deviceDB hands the battery]: DeviceDBLeaseBatteryOpts

/** The options of {@link describeDeviceDBLeaseBattery}: how to make a deviceDB, another tab's view of it, and the cheat into what it stores. */
export type DeviceDBLeaseBatteryOpts<DBT extends DeviceDB> = {
  /** A fresh, empty deviceDB. */
  makeDeviceDB: () => DBT
  /** A deviceDB over the same database as `deviceDB`, as another tab would make: for a store in memory, `deviceDB` itself. */
  makeTwin:     (deviceDB: DBT) => DeviceDB
  /** Stores `raw` as the lease row at `scope`, unchecked. */
  plant:        (deviceDB: DBT, scope: BankScope, raw: unknown) => Helpers.Awaitable<void>
}
// --

// == [The battery]: describeDeviceDBLeaseBattery, rowOf, sansKey

/** A row at the life and revision `given`: a tombstone when its life is odd. */
async function rowOf({ lifenum = 0, revseq = 0, ...overrides }: LeaseRowGiven & Partial<Pick<LiveLeaseRow, 'ends_at'>>): Promise<LeaseRow> {
  return (lifenum % 2 === 1) ? leaseTombstoneOf({ lifenum, revseq }) : await liveLeaseRowOf({ lifenum, revseq, ...overrides })
}

/** `row` without its leaseKey, which is a fresh handle on each read, to compare. */
function sansKey(row: LeaseRow | null): object | null { return (row === null) ? null : omit(row as LiveLeaseRow, ['lease_key']) }

/** Register the cases every deviceDB's lease verbs must pass: `peekLease`, `stowLease` and `listen`. */
export function describeDeviceDBLeaseBattery<DBT extends DeviceDB>(dbname: string, { makeDeviceDB, makeTwin, plant }: DeviceDBLeaseBatteryOpts<DBT>): void {
  describe(`${dbname}: peekLease and stowLease`, () => {
    it("answers null for a bank with no lease row", async () => {
      expect(await makeDeviceDB().peekLease(WorldScope)).to.be.null
    })

    it("stores a live row, and answers it and peeks it back with its leaseKey", async () => {
      const deviceDB = makeDeviceDB()
      const row      = await liveLeaseRowOf()
      expect(sansKey(await deviceDB.stowLease(row))).to.deep.equal(sansKey(row))
      const peeked   = await deviceDB.peekLease(WorldScope) as LiveLeaseRow
      expect(sansKey(peeked)).to.deep.equal(sansKey(row))
      expect(peeked.lease_key).to.be.instanceOf(CryptoKey)
      expect(peeked.lease_key.extractable).to.be.false
    })

    it("peeks only the row of the bank asked", async () => {
      const deviceDB = makeDeviceDB()
      await deviceDB.stowLease(await liveLeaseRowOf())
      expect(await deviceDB.peekLease({ ...WorldScope, banklabel: 'other' })).to.be.null
      expect(await deviceDB.peekLease({ ...WorldScope, userid: 'u2' })).to.be.null
    })

    const NewerCases = [
      // what a lease's life goes through:
      [{ lifenum: 0, revseq: 0 }, { lifenum: 0, revseq: 1 }, 'stores a later revision of the same life, as a renewal does'],
      [{ lifenum: 0, revseq: 3 }, { lifenum: 1, revseq: 0 }, 'stores a tombstone over the live row, as a lock does'],
      [{ lifenum: 1, revseq: 0 }, { lifenum: 2, revseq: 0 }, 'stores the next live life over a tombstone, as a grant after a lock does'],
      // a life skipped:
      [{ lifenum: 0, revseq: 5 }, { lifenum: 2, revseq: 0 }, 'stores a later life whatever the revision stored'],
    ] as const
    for (const [stored, stowed, blurb] of NewerCases) {
      it(blurb, async () => {
        const deviceDB = makeDeviceDB()
        await deviceDB.stowLease(await rowOf(stored))
        const row = await rowOf(stowed)
        expect(sansKey(await deviceDB.stowLease(row))).to.deep.equal(sansKey(row))
        expect(sansKey(await deviceDB.peekLease(WorldScope))).to.deep.equal(sansKey(row))
      })
    }

    const NotNewerCases = [
      [{ lifenum: 0, revseq: 2 }, { lifenum: 0, revseq: 1 },                     'keeps a later revision over an earlier one'],
      [{ lifenum: 0, revseq: 1 }, { lifenum: 0, revseq: 1, ends_at: 2e12 },      'keeps the row stored over one of the same life and revision'],
      [{ lifenum: 2, revseq: 0 }, { lifenum: 0, revseq: 7 },                     'keeps a later life over an earlier one at any revision'],
      [{ lifenum: 1, revseq: 0 }, { lifenum: 0, revseq: 4 },                     'keeps a tombstone over a late live row of the life it ended'],
    ] as const
    for (const [stored, stowed, blurb] of NotNewerCases) {
      it(blurb, async () => {
        const deviceDB = makeDeviceDB()
        const kept     = await rowOf(stored)
        await deviceDB.stowLease(kept)
        const row      = await rowOf(stowed)
        expect(sansKey(await deviceDB.stowLease(row))).to.deep.equal(sansKey(kept))
        expect(sansKey(await deviceDB.peekLease(WorldScope))).to.deep.equal(sansKey(kept))
      })
    }

    it("stores a tombstone with no keys", async () => {
      const deviceDB = makeDeviceDB()
      await deviceDB.stowLease(await liveLeaseRowOf())
      await deviceDB.stowLease(leaseTombstoneOf())
      const peeked = await deviceDB.peekLease(WorldScope)
      expect(peeked).to.deep.equal(leaseTombstoneOf())
      expect(peeked).to.not.have.property('lease_key')
      expect(peeked).to.not.have.property('bank_key_lease_wrapped')
    })
  })

  describe(`${dbname}: a damaged row stored`, () => {
    const DamagedCases = [
      [(live: LiveLeaseRow) => live.revtok,                                   'a string'],
      [(live: LiveLeaseRow) => omit(live, ['lease_key']),                     'a live row with no leaseKey'],
      [(live: LiveLeaseRow) => ({ ...leaseTombstoneOf(), lease_key: live.lease_key }), 'a tombstone carrying a leaseKey'],
      [(live: LiveLeaseRow) => ({ ...live, lifeseq: leaseTombstoneOf().lifeseq, lifepath: leaseTombstoneOf().lifepath }), 'a live row on an odd life'],
      [(live: LiveLeaseRow) => ({ ...live, lifepath: `${live.lifeseq}/${live.lifeseq}` }), 'a row with a life above its own'],
      [(live: LiveLeaseRow) => ({ ...live, note: 'hi' }),                     'a row with a field this version does not know'],
    ] as const
    for (const [damagedOf, blurb] of DamagedCases) {
      it(`refuses to peek ${blurb}`, async () => {
        const deviceDB = makeDeviceDB()
        await plant(deviceDB, WorldScope, damagedOf(await liveLeaseRowOf()))
        await expectRefusal(deviceDB.peekLease(WorldScope), 'damaged_lease')
      })
    }

    it("replaces a damaged row with any row stowed", async () => {
      const deviceDB = makeDeviceDB()
      const live     = await liveLeaseRowOf({ lifenum: 4, revseq: 9 })
      await plant(deviceDB, WorldScope, { ...live, note: 'hi' })
      const row      = await liveLeaseRowOf()
      expect(sansKey(await deviceDB.stowLease(row))).to.deep.equal(sansKey(row))
      expect(sansKey(await deviceDB.peekLease(WorldScope))).to.deep.equal(sansKey(row))
    })
  })

  describe(`${dbname}: what it is given`, () => {
    const BadRowCases = [
      [(_live: LiveLeaseRow) => null,                                          'refuses null'],
      [(live: LiveLeaseRow) => omit(live, ['ends_at']),                       'refuses a live row with no ends_at'],
      [(live: LiveLeaseRow) => ({ ...live, lease_key: 'k' }),                 'refuses a leaseKey that is not a CryptoKey'],
      [(live: LiveLeaseRow) => ({ ...leaseTombstoneOf(), bank_key_lease_wrapped: live.bank_key_lease_wrapped }), 'refuses a tombstone carrying a wrapped bankKey'],
      [(live: LiveLeaseRow) => ({ ...live, revseq: -1 }),                     'refuses a negative revseq'],
    ] as const
    for (const [badOf, blurb] of BadRowCases) {
      it(`stowLease ${blurb}`, async () => {
        const deviceDB = makeDeviceDB()
        const bad      = badOf(await liveLeaseRowOf())
        await expectRefusal(deviceDB.stowLease(bad as LeaseRow), 'bad_record')
        expect(await deviceDB.peekLease(WorldScope)).to.be.null
      })
    }

    it("refuses to peek a scope with no userid", async () => {
      await expectRefusal(makeDeviceDB().peekLease({ banklabel: 'acme' } as BankScope), 'bad_record')
    })

    it("refuses a listener that is not a function", () => {
      expectSyncRefusal(() => makeDeviceDB().listen('hello' as unknown as () => void), 'bad_record')
    })
  })

  describe(`${dbname}: listen`, () => {
    it("calls each listener, another tab's among them, with the scope of a row stored", async () => {
      const deviceDB = makeDeviceDB()
      const twin     = makeTwin(deviceDB)
      const heard: BankScope[] = []
      const twinHeard: BankScope[] = []
      deviceDB.listen((scope) => { heard.push(scope) })
      twin.listen((scope) => { twinHeard.push(scope) })
      await deviceDB.stowLease(await liveLeaseRowOf())
      await eventually(() => (heard.length > 0) && (twinHeard.length > 0))
      expect(heard).to.deep.equal([WorldScope])
      expect(twinHeard).to.deep.equal([WorldScope])
    })

    it("calls no listener for a row it does not store", async () => {
      const deviceDB = makeDeviceDB()
      const heard: string[] = []
      makeTwin(deviceDB).listen(({ banklabel }) => { heard.push(banklabel) })
      await deviceDB.stowLease(await liveLeaseRowOf({ revseq: 1 }))
      await deviceDB.stowLease(await liveLeaseRowOf({ revseq: 0 }))
      await deviceDB.stowLease(await liveLeaseRowOf({ ...WorldScope, banklabel: 'other' }))
      await eventually(() => heard.includes('other'))
      expect(heard).to.deep.equal([WorldScope.banklabel, 'other'])
    })

    it("stops calling a listener once its unlisten is called", async () => {
      const deviceDB = makeDeviceDB()
      const heard: string[] = []
      const twin     = makeTwin(deviceDB)
      const unlisten = twin.listen(({ banklabel }) => { heard.push(`gone:${banklabel}`) })
      twin.listen(({ banklabel }) => { heard.push(banklabel) })
      unlisten()
      await deviceDB.stowLease(await liveLeaseRowOf())
      await eventually(() => heard.length > 0)
      expect(heard).to.deep.equal([WorldScope.banklabel])
    })
  })
}
// --
