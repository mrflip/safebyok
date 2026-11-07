/** The battery every DeviceDB runs: one call registers the cases a store must pass, over a fresh store for each. */

import { describe, expect, it } from 'vitest'
import { makeLeaseKey } from '../../src/helpers/crypto'
import { objCheck } from '../../src/helpers/validator'
import type { Awaitable } from '../../src/helpers/helpers'
import type { VaultScope } from '../../src/shapes/shapes-core'
import type { LeaseRow } from '../../src/shapes/shapes-storage'
import type { DeviceDB } from '../../src/storage/device-db-new'
import { expectBad, expectGood, expectRefusal } from './refusals'
import { vaultScope, vaultScopeOf } from './storage-world'

// == [The hooks a store hands the battery]: DeviceDBRowCheats, DeviceDBBatteryOpts

/** A store's raw lease rows, past its verbs: the test backdoor the battery plants a row by, damaged or not, and reads the rows back by. */
export type DeviceDBRowCheats = {
  /** Stores `row` as the lease row at `scope`, unchecked. */
  plantLeaseRow: (scope: VaultScope, row: unknown) => Awaitable<void>
  /** Every lease row as stored, in any order. */
  leaseRowsOf:   () => Awaitable<unknown[]>
}

/** What a store hands {@link describeDeviceDBBattery}: how to make one, and the backdoors to its rows and its storage. */
export type DeviceDBBatteryOpts<DBT extends DeviceDB = DeviceDB> = {
  /** A fresh, empty store. */
  makeDeviceDB:         () => Awaitable<DBT>
  /** The backdoor to a store's raw rows; without it, the cases of a planted or counted row are skipped. */
  _cheat_rowsOf?:       (deviceDB: DBT) => DeviceDBRowCheats
  /** Makes the store's next call to its storage fail as its storage would; without it, that case is skipped. */
  _cheat_failNextCall?: (deviceDB: DBT) => Awaitable<void>
}
// --

/** The check of what a store hands the battery: each hook a function, judged by its interface alone. */
const batteryOpts = objCheck(({ fn }) => ({
  makeDeviceDB:        fn<DeviceDBBatteryOpts['makeDeviceDB']>(),
  _cheat_rowsOf:       fn<NonNullable<DeviceDBBatteryOpts['_cheat_rowsOf']>>().optional(),
  _cheat_failNextCall: fn<NonNullable<DeviceDBBatteryOpts['_cheat_failNextCall']>>().optional(),
}), 'bad_option')

// == [The rows the cases share]: T0, Hour, asked, leaseRowOf

const T0 = Date.UTC(2026, 10, 3)
const Hour = 3_600_000
const asked = { ...vaultScope, vault_tok: 'tok_one' }

/** A lease row of the vault `asked` names, its leaseKey a real handle, its other fields opaque. */
const leaseRowOf = async (over: Partial<LeaseRow> = {}): Promise<LeaseRow> => ({ ...asked, proved_at: T0, lease_key: await makeLeaseKey(), wrapped: 'opaque', ...over })
// --

// == [The battery]: describeDeviceDBBattery

/** Stands in for a hook the store did not give, in a case that is skipped without it. */
const notGiven = (hookname: string) => (): never => { throw new TypeError(`The store gave the battery no ${hookname}.`) }

// The opts are checked before anything registers, so a store missing a hook fails here, not inside each case.
/** Registers the cases every DeviceDB must pass, under `label`. */
export const describeDeviceDBBattery = <DBT extends DeviceDB>(label: string, opts: DeviceDBBatteryOpts<DBT>): void => {
  batteryOpts.parse(opts, { where: `describeDeviceDBBattery("${label}")` })
  const { makeDeviceDB, _cheat_rowsOf, _cheat_failNextCall } = opts
  const fresh = async (): Promise<DBT> => makeDeviceDB()
  const rowsOf = _cheat_rowsOf ?? notGiven('_cheat_rowsOf')
  const failNextCall = _cheat_failNextCall ?? notGiven('_cheat_failNextCall')
  const noRows = _cheat_rowsOf === undefined

  describe(label, () => {
    describe("stow(row), peek(asked)", () => {
      it("peeks the row stowed for the vault, its lease_key handle and its opaque fields as stowed", async () => {
        const deviceDB = await fresh()
        await deviceDB.stow(await leaseRowOf())
        const peeked = await deviceDB.peek(asked)
        expect(peeked).to.deep.include({ ...asked, proved_at: T0, wrapped: 'opaque' })
        const leaseKey = peeked?.['lease_key']
        expect(leaseKey).to.be.instanceOf(CryptoKey)
        expect((leaseKey as CryptoKey).extractable).to.be.false
      })

      it("peeks null for a vault with nothing stowed", async () => {
        const deviceDB = await fresh()
        expect(await deviceDB.peek(asked)).to.be.null
      })

      it("peeks null under another vault_tok", async () => {
        const deviceDB = await fresh()
        await deviceDB.stow(await leaseRowOf())
        expect(await deviceDB.peek({ ...asked, vault_tok: 'tok_two' })).to.be.null
      })

      it("keeps each vault scope apart", async () => {
        const deviceDB = await fresh()
        await deviceDB.stow(await leaseRowOf())
        expect(await deviceDB.peek({ ...asked, vaultlabel: 'other' })).to.be.null
        expect(await deviceDB.peek({ ...asked, user_id: 'u2' })).to.be.null
      })

      it("stows a new vault_tok over the old row of the scope", async () => {
        const deviceDB = await fresh()
        await deviceDB.stow(await leaseRowOf())
        await deviceDB.stow(await leaseRowOf({ vault_tok: 'tok_two' }))
        expect(await deviceDB.peek(asked)).to.be.null
        expect(await deviceDB.peek({ ...asked, vault_tok: 'tok_two' })).to.not.be.null
      })

      it("hands back a copy of the row stowed", async () => {
        const deviceDB = await fresh()
        await deviceDB.stow(await leaseRowOf())
        const peeked = (await deviceDB.peek(asked))!
        peeked.proved_at = 0
        const again = await deviceDB.peek(asked)
        expect(again?.proved_at).to.eq(T0)
      })

      it.skipIf(noRows)("peeks null for a stored row that fails its check, as for none", async () => {
        const deviceDB = await fresh()
        await rowsOf(deviceDB).plantLeaseRow(vaultScope, { ...asked, proved_at: 'yesterday' })
        expect(await deviceDB.peek(asked)).to.be.null
      })

      it("refuses a malformed row or query", async () => {
        const deviceDB = await fresh()
        await expectRefusal(deviceDB.stow({ ...asked, lease_key: await makeLeaseKey() } as unknown as LeaseRow))
        await expectRefusal(deviceDB.peek({ ...asked, vaultlabel: 'No Good!' }))
        await expectRefusal(deviceDB.peek({ ...vaultScope } as never))
      })

      it("answers an Outcome through each try form", async () => {
        const deviceDB = await fresh()
        const stowed = await deviceDB.tryStow(await leaseRowOf())
        expect(stowed.ok).to.be.true
        expect(await expectGood(deviceDB.tryPeek(asked))).to.not.be.null
        await expectBad(deviceDB.tryPeek({ ...asked, applabel: '' }))
      })
    })

    describe("forget(asked)", () => {
      it("erases the row stowed under that vault_tok", async () => {
        const deviceDB = await fresh()
        await deviceDB.stow(await leaseRowOf())
        await deviceDB.forget(asked)
        expect(await deviceDB.peek(asked)).to.be.null
        expect(await deviceDB.listLeases()).to.deep.equal([])
      })

      it.skipIf(noRows)("leaves no row behind in the store", async () => {
        const deviceDB = await fresh()
        await deviceDB.stow(await leaseRowOf())
        await deviceDB.forget(asked)
        expect(await rowsOf(deviceDB).leaseRowsOf()).to.have.lengthOf(0)
      })

      it("leaves a row of another vault_tok where it stands", async () => {
        const deviceDB = await fresh()
        await deviceDB.stow(await leaseRowOf({ vault_tok: 'tok_two' }))
        await deviceDB.forget(asked)
        expect(await deviceDB.peek({ ...asked, vault_tok: 'tok_two' })).to.not.be.null
      })

      it("is a no-op where nothing is stowed", async () => {
        const deviceDB = await fresh()
        await deviceDB.forget(asked)
        const forgotten = await deviceDB.tryForget(asked)
        expect(forgotten.ok).to.be.true
      })

      it("lands after a stow called before it and not awaited", async () => {
        const deviceDB = await fresh()
        const row = await leaseRowOf()
        const stowing = deviceDB.stow(row)
        const forgetting = deviceDB.forget(asked)
        await Promise.all([stowing, forgetting])
        expect(await deviceDB.peek(asked)).to.be.null
      })

      it("peeks what stood before a forget called after it, however late it is awaited", async () => {
        const deviceDB = await fresh()
        await deviceDB.stow(await leaseRowOf())
        const peeking = deviceDB.peek(asked)
        const forgetting = deviceDB.forget(asked)
        expect(await peeking).to.not.be.null
        await forgetting
      })
    })

    describe("listLeases()", () => {
      it("answers every lease stowed, oldest first, without its key", async () => {
        const deviceDB = await fresh()
        await deviceDB.stow(await leaseRowOf({ vaultlabel: 'late', proved_at: T0 - Hour }))
        await deviceDB.stow(await leaseRowOf({ vaultlabel: 'early', proved_at: T0 - (3 * Hour) }))
        await deviceDB.stow(await leaseRowOf({ vaultlabel: 'fresh', proved_at: T0 }))
        const found = await deviceDB.listLeases()
        expect(found.map((row) => row.vaultlabel)).to.deep.equal(['early', 'late', 'fresh'])
        expect(found[0]).to.deep.equal({ ...asked, vaultlabel: 'early', proved_at: T0 - (3 * Hour) })
      })

      it("finds the leases of every bank on the device", async () => {
        const deviceDB = await fresh()
        await deviceDB.stow(await leaseRowOf())
        await deviceDB.stow(await leaseRowOf({ user_id: 'u2' }))
        expect(await deviceDB.listLeases()).to.have.lengthOf(2)
      })

      it("leaves out a forgotten lease", async () => {
        const deviceDB = await fresh()
        await deviceDB.stow(await leaseRowOf())
        await deviceDB.stow(await leaseRowOf({ vaultlabel: 'gone' }))
        await deviceDB.forget({ ...asked, vaultlabel: 'gone' })
        const found = await deviceDB.listLeases()
        expect(found.map((row) => row.vaultlabel)).to.deep.equal(['main'])
      })

      it.skipIf(noRows)("leaves out a stored row that fails its check", async () => {
        const deviceDB = await fresh()
        await rowsOf(deviceDB).plantLeaseRow(vaultScopeOf('damaged'), { proved_at: 5 })
        expect(await deviceDB.listLeases()).to.deep.equal([])
      })

      it("answers an empty list for an empty store", async () => {
        const deviceDB = await fresh()
        expect(await expectGood(deviceDB.tryListLeases())).to.deep.equal([])
      })
    })

    describe("listRawLeases()", () => {
      it("answers every row stowed, its lease_key handle among its fields", async () => {
        const deviceDB = await fresh()
        await deviceDB.stow(await leaseRowOf())
        const [raw, ...more] = await expectGood(deviceDB.tryListRawLeases())
        expect(more).to.deep.equal([])
        expect(raw).to.include({ ...asked, proved_at: T0, wrapped: 'opaque' })
        expect(raw?.['lease_key']).to.be.instanceOf(CryptoKey)
      })

      it.skipIf(noRows)("answers a stored row that fails its check, which listLeases leaves out", async () => {
        const deviceDB = await fresh()
        await deviceDB.stow(await leaseRowOf())
        await rowsOf(deviceDB).plantLeaseRow(vaultScopeOf('damaged'), { proved_at: 5 })
        expect(await deviceDB.listRawLeases()).to.deep.include({ proved_at: 5 })
        const found = await deviceDB.listLeases()
        expect(found.map((row) => row.vaultlabel)).to.deep.equal(['main'])
      })

      it("hands back a copy of each row stowed", async () => {
        const deviceDB = await fresh()
        await deviceDB.stow(await leaseRowOf())
        const [raw] = await deviceDB.listRawLeases()
        raw!['vault_tok'] = 'tok_changed'
        const again = await deviceDB.peek(asked)
        expect(again?.vault_tok).to.eq(asked.vault_tok)
      })

      it("answers an empty list for an empty store", async () => {
        const deviceDB = await fresh()
        expect(await deviceDB.listRawLeases()).to.deep.equal([])
      })
    })

    describe("a store whose storage fails", () => {
      it.skipIf(_cheat_failNextCall === undefined)("refuses each verb", async () => {
        const deviceDB = await fresh()
        const row = await leaseRowOf()
        const verbs = [() => deviceDB.tryStow(row), () => deviceDB.tryPeek(asked), () => deviceDB.tryForget(asked), () => deviceDB.tryListLeases(), () => deviceDB.tryListRawLeases()]
        for (const verb of verbs) {
          await failNextCall(deviceDB)
          await expectBad(verb(), 'storage_unavailable')
        }
      })
    })
  })
}
// --
