/** The battery every deviceDB runs: one call registers the cases a deviceDB's lease verbs must pass, over a fresh deviceDB for each. */
import { omit } from 'es-toolkit'
import { describe, expect, it } from 'vitest'
import type { Helpers } from 'safebyok-big/internals'
import { eventually, expectRefusal, expectSyncRefusal } from 'safebyok-big/testing'
import type { LiveOf } from '../../src/shapes/shapes-sealers'
import type { LeaseScope, LeaseRecord } from '../../src/shapes/shapes-stamps'
import type { Userid } from '../../src/shapes/primitives'
import type { DeviceDB } from '../../src/storage/device-db'
import { WorldScope } from './models-world'
import { WorldLeaseScope } from './devicedb-world'
import { type LeaseGiven, leaseTombstoneOf, liveLeaseRecordOf } from './devicedb-world'

// == [The hooks a deviceDB hands the battery]: DeviceDBLeaseBatteryOpts

/** The options of {@link describeDeviceDBLeaseBattery}: how to make a deviceDB, another tab's view of it, and the cheat into what it has. */
export type DeviceDBLeaseBatteryOpts<DBT extends DeviceDB> = {
  /** A fresh, empty deviceDB. */
  makeDeviceDB: () => DBT
  /** A deviceDB over the same database as `deviceDB`, as another tab would make: for a deviceDB in memory, `deviceDB` itself. */
  makeTwin:     (deviceDB: DBT) => DeviceDB
  /** Plants `raw` as the lease record at `scope`, unchecked. */
  plant:        (deviceDB: DBT, scope: LeaseScope, raw: unknown) => Helpers.Awaitable<void>
}
// --

/** A live lease record. */
type LiveLeaseRecord = LiveOf<LeaseRecord>

// == [The battery]: describeDeviceDBLeaseBattery, leaseOf, sansKey

/** A lease record at the life and revision `given`: a tombstone when its life is odd. */
async function leaseOf({ lifenum = 0, revseq = 0, ...overrides }: LeaseGiven & Partial<Pick<LiveLeaseRecord, 'ends_at'>>): Promise<LeaseRecord> {
  return (lifenum % 2 === 1) ? leaseTombstoneOf({ lifenum, revseq }) : await liveLeaseRecordOf({ lifenum, revseq, ...overrides })
}

/** `record` without its leaseKey, which is a fresh handle on each read, to compare. */
function sansKey(record: LeaseRecord | null): object | null { return (record === null) ? null : omit(record as LiveLeaseRecord, ['lease_key']) }

/** Register the cases every deviceDB's lease verbs must pass: `peekLease`, `stowLease` and `listen`. */
export function describeDeviceDBLeaseBattery<DBT extends DeviceDB>(dbname: string, { makeDeviceDB, makeTwin, plant }: DeviceDBLeaseBatteryOpts<DBT>): void {
  describe(`${dbname}: peekLease and stowLease`, () => {
    it("answers null for a gate with no lease record", async () => {
      expect(await makeDeviceDB().peekLease(WorldLeaseScope)).to.be.null
    })

    it("stows a live lease, and answers it and peeks it back with its leaseKey", async () => {
      const deviceDB = makeDeviceDB()
      const lease    = await liveLeaseRecordOf()
      expect(sansKey(await deviceDB.stowLease(lease))).to.deep.equal(sansKey(lease))
      const peeked   = await deviceDB.peekLease(WorldLeaseScope) as LiveLeaseRecord
      expect(sansKey(peeked)).to.deep.equal(sansKey(lease))
      expect(peeked.lease_key).to.be.instanceOf(CryptoKey)
      expect(peeked.lease_key.extractable).to.be.false
    })

    it("peeks only the lease of the bank asked", async () => {
      const deviceDB = makeDeviceDB()
      await deviceDB.stowLease(await liveLeaseRecordOf())
      expect(await deviceDB.peekLease({ ...WorldLeaseScope, banklabel: 'other' })).to.be.null
      expect(await deviceDB.peekLease({ ...WorldLeaseScope, userid: 'u2' })).to.be.null
    })

    it("files each gate's lease apart: a stow at one gate leaves another gate's lease of the bank", async () => {
      const deviceDB = makeDeviceDB()
      const lease    = await liveLeaseRecordOf()
      await deviceDB.stowLease(lease)
      const passkeysTombstone = leaseTombstoneOf({ labelpath: 'lease/passkeys', label: 'passkeys', lifenum: 3 })
      await deviceDB.stowLease(passkeysTombstone)
      expect(sansKey(await deviceDB.peekLease(WorldLeaseScope))).to.deep.equal(sansKey(lease))
      expect(await deviceDB.peekLease({ ...WorldLeaseScope, labelpath: 'lease/passkeys' })).to.deep.equal(passkeysTombstone)
    })

    const NewerCases = [
      // what a lease's life goes through:
      [{ lifenum: 0, revseq: 0 }, { lifenum: 0, revseq: 1 }, 'stows a later revision of the same life, as a renewal does'],
      [{ lifenum: 0, revseq: 3 }, { lifenum: 1, revseq: 0 }, 'stows a tombstone over the live lease, as a lock does'],
      [{ lifenum: 1, revseq: 0 }, { lifenum: 2, revseq: 0 }, 'stows the next live life over a tombstone, as a grant after a lock does'],
      // a life skipped:
      [{ lifenum: 0, revseq: 5 }, { lifenum: 2, revseq: 0 }, 'stows a later life whatever the ante revision'],
    ] as const
    for (const [ante, stowed, blurb] of NewerCases) {
      it(blurb, async () => {
        const deviceDB = makeDeviceDB()
        await deviceDB.stowLease(await leaseOf(ante))
        const lease = await leaseOf(stowed)
        expect(sansKey(await deviceDB.stowLease(lease))).to.deep.equal(sansKey(lease))
        expect(sansKey(await deviceDB.peekLease(WorldLeaseScope))).to.deep.equal(sansKey(lease))
      })
    }

    const NotNewerCases = [
      [{ lifenum: 0, revseq: 2 }, { lifenum: 0, revseq: 1 },                     'leaves a later revision in place over an earlier one'],
      [{ lifenum: 0, revseq: 1 }, { lifenum: 0, revseq: 1, ends_at: 2e12 },      'leaves the ante lease in place over one of the same life and revision'],
      [{ lifenum: 2, revseq: 0 }, { lifenum: 0, revseq: 7 },                     'leaves a later life in place over an earlier one at any revision'],
      [{ lifenum: 1, revseq: 0 }, { lifenum: 0, revseq: 4 },                     'leaves a tombstone in place over a late live lease of the life it ended'],
    ] as const
    for (const [ante, stowed, blurb] of NotNewerCases) {
      it(blurb, async () => {
        const deviceDB = makeDeviceDB()
        const prior    = await leaseOf(ante)
        await deviceDB.stowLease(prior)
        const lease    = await leaseOf(stowed)
        expect(sansKey(await deviceDB.stowLease(lease))).to.deep.equal(sansKey(prior))
        expect(sansKey(await deviceDB.peekLease(WorldLeaseScope))).to.deep.equal(sansKey(prior))
      })
    }

    it("stows a tombstone with no keys", async () => {
      const deviceDB = makeDeviceDB()
      await deviceDB.stowLease(await liveLeaseRecordOf())
      await deviceDB.stowLease(leaseTombstoneOf())
      const peeked = await deviceDB.peekLease(WorldLeaseScope)
      expect(peeked).to.deep.equal(leaseTombstoneOf())
      expect(peeked).to.not.have.property('lease_key')
      expect(peeked).to.not.have.property('bank_key_lease_wrapped')
    })
  })

  describe(`${dbname}: a damaged lease record stored`, () => {
    const DamagedCases = [
      [(live: LiveLeaseRecord) => live.revtok,                                   'a string'],
      [(live: LiveLeaseRecord) => omit(live, ['lease_key']),                     'a live lease with no leaseKey'],
      [(live: LiveLeaseRecord) => ({ ...leaseTombstoneOf(), lease_key: live.lease_key }), 'a tombstone carrying a leaseKey'],
      [(live: LiveLeaseRecord) => ({ ...live, lifeseq: leaseTombstoneOf().lifeseq, lifepath: leaseTombstoneOf().lifepath }), 'a live lease on an odd life'],
      [(live: LiveLeaseRecord) => ({ ...live, lifepath: live.lifeseq }),         'a lease whose lifepath lacks its placeholder'],
      [(live: LiveLeaseRecord) => ({ ...live, lifepath: `0000000002/${live.lifeseq}` }), 'a lease with a life above its own'],
      [(live: LiveLeaseRecord) => ({ ...live, labelpath: live.gate_labelpath, label: live.gate_labelpath }), "a lease at its gate's labelpath"],
      [(live: LiveLeaseRecord) => ({ ...live, labelpath: 'lease/passkeys', label: 'passkeys' }), "a live lease whose labelpath is not its gate's"],
      [(live: LiveLeaseRecord) => ({ ...live, gate_labelpath: 'box/openai' }),             "a live lease whose gate_labelpath is no gate's"],
      [(live: LiveLeaseRecord) => ({ ...live, label: 'passkeys' }),                        "a lease whose label is not its labelpath's last"],
      [(live: LiveLeaseRecord) => ({ ...live, note: 'hi' }),                     'a lease with a field this version does not know'],
    ] as const
    for (const [damagedOf, blurb] of DamagedCases) {
      it(`refuses to peek ${blurb}`, async () => {
        const deviceDB = makeDeviceDB()
        await plant(deviceDB, WorldLeaseScope, damagedOf(await liveLeaseRecordOf()))
        await expectRefusal(deviceDB.peekLease(WorldLeaseScope), 'damaged_lease')
      })
    }

    it("replaces a damaged lease record with any record stowed", async () => {
      const deviceDB = makeDeviceDB()
      const live     = await liveLeaseRecordOf({ lifenum: 4, revseq: 9 })
      await plant(deviceDB, WorldLeaseScope, { ...live, note: 'hi' })
      const lease    = await liveLeaseRecordOf()
      expect(sansKey(await deviceDB.stowLease(lease))).to.deep.equal(sansKey(lease))
      expect(sansKey(await deviceDB.peekLease(WorldLeaseScope))).to.deep.equal(sansKey(lease))
    })
  })

  describe(`${dbname}: what it is given`, () => {
    const BadLeaseCases = [
      [(_live: LiveLeaseRecord) => null,                                          'refuses null'],
      [(live: LiveLeaseRecord) => omit(live, ['ends_at']),                       'refuses a live lease with no ends_at'],
      [(live: LiveLeaseRecord) => ({ ...live, lease_key: 'k' }),                 'refuses a leaseKey that is not a CryptoKey'],
      [(live: LiveLeaseRecord) => ({ ...leaseTombstoneOf(), bank_key_lease_wrapped: live.bank_key_lease_wrapped }), 'refuses a tombstone carrying a wrapped bankKey'],
      [(live: LiveLeaseRecord) => ({ ...live, revseq: -1 }),                     'refuses a negative revseq'],
    ] as const
    for (const [badOf, blurb] of BadLeaseCases) {
      it(`stowLease ${blurb}`, async () => {
        const deviceDB = makeDeviceDB()
        const bad      = badOf(await liveLeaseRecordOf())
        await expectRefusal(deviceDB.stowLease(bad as LeaseRecord), 'bad_record')
        expect(await deviceDB.peekLease(WorldLeaseScope)).to.be.null
      })
    }

    it("refuses to peek a scope with no userid", async () => {
      await expectRefusal(makeDeviceDB().peekLease({ banklabel: 'acme' } as LeaseScope), 'bad_record')
    })

    it("refuses a listener that is not a function", () => {
      expectSyncRefusal(() => makeDeviceDB().listen('hello' as unknown as () => void), 'bad_record')
    })
  })

  describe(`${dbname}: listen`, () => {
    it("calls each listener, another tab's among them, with the scope of a lease stowed", async () => {
      const deviceDB = makeDeviceDB()
      const twin     = makeTwin(deviceDB)
      const heard: LeaseScope[] = []
      const twinHeard: LeaseScope[] = []
      deviceDB.listen((scope) => { heard.push(scope) })
      twin.listen((scope) => { twinHeard.push(scope) })
      await deviceDB.stowLease(await liveLeaseRecordOf())
      await eventually(() => (heard.length > 0) && (twinHeard.length > 0))
      expect(heard).to.deep.equal([WorldLeaseScope])
      expect(twinHeard).to.deep.equal([WorldLeaseScope])
    })

    it("calls no listener for a lease it does not stow", async () => {
      const deviceDB = makeDeviceDB()
      const heard: string[] = []
      makeTwin(deviceDB).listen(({ banklabel }) => { heard.push(banklabel) })
      await deviceDB.stowLease(await liveLeaseRecordOf({ revseq: 1 }))
      await deviceDB.stowLease(await liveLeaseRecordOf({ revseq: 0 }))
      await deviceDB.stowLease(await liveLeaseRecordOf({ ...WorldScope, banklabel: 'other' }))
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
      await deviceDB.stowLease(await liveLeaseRecordOf())
      await eventually(() => heard.length > 0)
      expect(heard).to.deep.equal([WorldScope.banklabel])
    })
  })
}
// --

// == [The devicetok battery]: DeviceDBDevicetokBatteryOpts, describeDeviceDBDevicetokBattery

/** The options of {@link describeDeviceDBDevicetokBattery}: how to make a deviceDB, another tab's view of it, and the cheat into the devicetoks it has. */
export type DeviceDBDevicetokBatteryOpts<DBT extends DeviceDB> = Pick<DeviceDBLeaseBatteryOpts<DBT>, 'makeDeviceDB' | 'makeTwin'> & {
  /** Plants `raw` as the devicetok of the user `userid`, unchecked. */
  plantDevicetok: (deviceDB: DBT, userid: Userid, raw: unknown) => Helpers.Awaitable<void>
}

/** A UUID, as `crypto.randomUUID()` makes. */
const UuidPattern = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/

/** Register the cases every deviceDB's `ensureDevicetok` must pass. */
export function describeDeviceDBDevicetokBattery<DBT extends DeviceDB>(dbname: string, { makeDeviceDB, makeTwin, plantDevicetok }: DeviceDBDevicetokBatteryOpts<DBT>): void {
  describe(`${dbname}: ensureDevicetok`, () => {
    it("makes a devicetok, a UUID, at its first call for a user, and answers the same one at each call after, in this tab and another", async () => {
      const deviceDB  = makeDeviceDB()
      const devicetok = await deviceDB.ensureDevicetok(WorldScope.userid)
      expect(devicetok).to.match(UuidPattern)
      expect([await deviceDB.ensureDevicetok(WorldScope.userid), await makeTwin(deviceDB).ensureDevicetok(WorldScope.userid)]).to.deep.equal([devicetok, devicetok])
    })

    it("makes another devicetok for each other user in the same database", async () => {
      const deviceDB   = makeDeviceDB()
      const devicetoks = [await deviceDB.ensureDevicetok(WorldScope.userid), await deviceDB.ensureDevicetok('u2')]
      expect(new Set(devicetoks).size).to.eq(2)
      expect(await deviceDB.ensureDevicetok(WorldScope.userid)).to.eq(devicetoks[0])
    })

    it("makes another devicetok for another database", async () => {
      expect(await makeDeviceDB().ensureDevicetok(WorldScope.userid)).to.not.eq(await makeDeviceDB().ensureDevicetok(WorldScope.userid))
    })

    it("answers one devicetok to calls made together", async () => {
      const deviceDB   = makeDeviceDB()
      const devicetoks = await Promise.all([deviceDB.ensureDevicetok(WorldScope.userid), makeTwin(deviceDB).ensureDevicetok(WorldScope.userid), deviceDB.ensureDevicetok(WorldScope.userid)])
      expect(new Set(devicetoks).size).to.eq(1)
    })

    it("files the devicetok apart from the leases of its user's bank: a lease stowed leaves it, and it leaves the lease", async () => {
      const deviceDB  = makeDeviceDB()
      const devicetok = await deviceDB.ensureDevicetok(WorldScope.userid)
      const lease     = await liveLeaseRecordOf()
      await deviceDB.stowLease(lease)
      expect(await deviceDB.ensureDevicetok(WorldScope.userid)).to.eq(devicetok)
      expect(sansKey(await deviceDB.peekLease(WorldLeaseScope))).to.deep.equal(sansKey(lease))
    })

    it("answers a devicetok stored", async () => {
      const deviceDB = makeDeviceDB()
      await plantDevicetok(deviceDB, WorldScope.userid, '00000000-0000-4000-8000-0000000000d2')
      expect(await deviceDB.ensureDevicetok(WorldScope.userid)).to.eq('00000000-0000-4000-8000-0000000000d2')
    })

    it("refuses a bank's scope in place of a userid", async () => {
      await expectRefusal(makeDeviceDB().ensureDevicetok(WorldScope as never), 'bad_record')
    })

    const DamagedCases = [
      ['device_one',                                          'a label'],
      [42,                                                    'a number'],
      [{ devicetok: '00000000-0000-4000-8000-0000000000d2' }, 'a devicetok wrapped in an object'],
    ] as const
    for (const [raw, blurb] of DamagedCases) {
      it(`replaces an ante devicetok that is ${blurb} with a fresh one, stowed from then on`, async () => {
        const deviceDB = makeDeviceDB()
        await plantDevicetok(deviceDB, WorldScope.userid, raw)
        const devicetok = await deviceDB.ensureDevicetok(WorldScope.userid)
        expect(devicetok).to.match(UuidPattern)
        expect(await deviceDB.ensureDevicetok(WorldScope.userid)).to.eq(devicetok)
      })
    }
  })
}
// --
