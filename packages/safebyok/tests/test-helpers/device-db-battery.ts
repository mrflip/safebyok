/** The battery every DeviceDB runs: one call registers the cases a DeviceDB must pass, over a fresh DeviceDB for each. */

import { describe, expect, it } from 'vitest'
import { makeLeaseKey } from '../../src/helpers/crypto'
import { objCheck } from '../../src/helpers/validator'
import type { Awaitable } from '../../src/helpers/helpers'
import type { BankScope, VaultScope } from '../../src/shapes/shapes-core'
import * as CX from '../../src/shapes/shapes-core'
import type { LeaseRow, LeaseScopepath } from '../../src/shapes/shapes-storage'
import type { DeviceDB } from '../../src/storage/device-db'
import { expectBad, expectGood, expectRefusal } from './refusals'
import { bankScope, vaultScope, vaultScopeOf } from './storage-world'

// == [The hooks a DeviceDB hands the battery]: DeviceDBRowCheats, DeviceDBBatteryOpts

/** A DeviceDB's raw lease and bank rows, past its verbs: the test backdoor the battery plants a row by, damaged or not, and reads the rows back by. */
export type DeviceDBRowCheats = {
  /** Writes `row` as the lease row at `scope`, unchecked. */
  plantLeaseRow: (scope: VaultScope, row: unknown) => Awaitable<void>
  /** Every lease row as stored, in any order. */
  leaseRowsOf:   () => Awaitable<unknown[]>
  /** Writes `row` as the bank row at `scope`, unchecked. */
  plantBankRow:  (scope: BankScope, row: unknown) => Awaitable<void>
  /** Every bank row as stored, in any order. */
  bankRowsOf:    () => Awaitable<unknown[]>
}

/** What a DeviceDB hands {@link describeDeviceDBBattery}: how to make one, and the backdoors to its rows and its device database. */
export type DeviceDBBatteryOpts<DBT extends DeviceDB = DeviceDB> = {
  /** A fresh, empty DeviceDB. */
  makeDeviceDB:         () => Awaitable<DBT>
  /** The backdoor to a DeviceDB's raw rows; without it, the cases of a planted or counted row are skipped. */
  _cheat_rowsOf?:       (deviceDB: DBT) => DeviceDBRowCheats
  /** Makes the DeviceDB's next call to its device database fail as that database would; without it, that case is skipped. */
  _cheat_failNextCall?: (deviceDB: DBT) => Awaitable<void>
}
// --

/** The check of what a DeviceDB hands the battery: each hook a function, judged by its interface alone. */
const batteryOpts = objCheck(({ fn }) => ({
  makeDeviceDB:        fn<DeviceDBBatteryOpts['makeDeviceDB']>(),
  _cheat_rowsOf:       fn<NonNullable<DeviceDBBatteryOpts['_cheat_rowsOf']>>().optional(),
  _cheat_failNextCall: fn<NonNullable<DeviceDBBatteryOpts['_cheat_failNextCall']>>().optional(),
}), 'bad_option')

// == [The rows the cases share]: T0, Hour, asked, leaseRowOf, scopepathOf, bagOf

const T0 = Date.UTC(2026, 10, 3)
const Hour = 3_600_000
const asked = { ...vaultScope, vault_tok: 'tok_one' }

/** A lease row of the vault `asked` names, its leaseKey a real handle, its other fields opaque. */
const leaseRowOf = async (over: Partial<LeaseRow> = {}): Promise<LeaseRow> => ({ ...asked, proved_at: T0, lease_key: await makeLeaseKey(), wrapped: 'opaque', ...over })

/** The scopepath a DeviceDB files the lease row of `scope` under. */
const scopepathOf = ({ applabel, user_id, vaultlabel }: VaultScope): LeaseScopepath => [applabel, user_id, vaultlabel]

/** A raw row, as the bag a case reads a field of. */
const bagOf = (row: unknown): Record<string, unknown> => row as Record<string, unknown>
// --

// == [The battery]: describeDeviceDBBattery

/** Stands in for a hook the DeviceDB did not give, in a case that is skipped without it. */
const notGiven = (hookname: string) => (): never => { throw new TypeError(`The DeviceDB gave the battery no ${hookname}.`) }

// The opts are checked before anything registers, so a DeviceDB missing a hook fails here, not inside each case.
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

      it.skipIf(noRows)("peeks null for a stored row that fails its check", async () => {
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

      it("each try form returns an Outcome", async () => {
        const deviceDB = await fresh()
        const stowed = await deviceDB.tryStow(await leaseRowOf())
        expect(stowed.ok).to.be.true
        expect(await expectGood(deviceDB.tryPeek(asked))).to.not.be.null
        await expectBad(deviceDB.tryPeek({ ...asked, applabel: '' }))
      })
    })

    describe("forget(asked)", () => {
      it("forgets the row stowed under that vault_tok", async () => {
        const deviceDB = await fresh()
        await deviceDB.stow(await leaseRowOf())
        await deviceDB.forget(asked)
        expect(await deviceDB.peek(asked)).to.be.null
        expect(await deviceDB.listLeases()).to.deep.equal([])
      })

      it.skipIf(noRows)("leaves no row behind in the DeviceDB", async () => {
        const deviceDB = await fresh()
        await deviceDB.stow(await leaseRowOf())
        await deviceDB.forget(asked)
        expect(await rowsOf(deviceDB).leaseRowsOf()).to.have.lengthOf(0)
      })

      it("leaves a row of another vault_tok untouched", async () => {
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

      it("is written after a stow called before it and not awaited", async () => {
        const deviceDB = await fresh()
        const row = await leaseRowOf()
        const stowing = deviceDB.stow(row)
        const forgetting = deviceDB.forget(asked)
        await Promise.all([stowing, forgetting])
        expect(await deviceDB.peek(asked)).to.be.null
      })

      it("does not affect a peek called before it", async () => {
        const deviceDB = await fresh()
        await deviceDB.stow(await leaseRowOf())
        const peeking = deviceDB.peek(asked)
        const forgetting = deviceDB.forget(asked)
        expect(await peeking).to.not.be.null
        await forgetting
      })
    })

    describe("listLeases()", () => {
      it("returns every stowed lease, oldest first, without its key", async () => {
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

      it("returns an empty list for an empty DeviceDB", async () => {
        const deviceDB = await fresh()
        expect(await expectGood(deviceDB.tryListLeases())).to.deep.equal([])
      })
    })

    describe("listRawLeases()", () => {
      it("returns every stowed row with its scopepath, including its lease_key handle", async () => {
        const deviceDB = await fresh()
        await deviceDB.stow(await leaseRowOf())
        const [raw, ...more] = await expectGood(deviceDB.tryListRawLeases())
        expect(more).to.deep.equal([])
        expect(raw?.scopepath).to.deep.equal(scopepathOf(vaultScope))
        expect(raw?.row).to.include({ ...asked, proved_at: T0, wrapped: 'opaque' })
        expect(bagOf(raw?.row)['lease_key']).to.be.instanceOf(CryptoKey)
      })

      it.skipIf(noRows)("includes a stored row that fails its check", async () => {
        const deviceDB = await fresh()
        await deviceDB.stow(await leaseRowOf())
        await rowsOf(deviceDB).plantLeaseRow(vaultScopeOf('damaged'), { proved_at: 5 })
        expect(await deviceDB.listRawLeases()).to.deep.include({ scopepath: scopepathOf(vaultScopeOf('damaged')), row: { proved_at: 5 } })
        const found = await deviceDB.listLeases()
        expect(found.map((row) => row.vaultlabel)).to.deep.equal(['main'])
      })

      it("hands back a copy of each row stowed and its scopepath", async () => {
        const deviceDB = await fresh()
        await deviceDB.stow(await leaseRowOf())
        const [raw] = await deviceDB.listRawLeases()
        bagOf(raw?.row)['vault_tok'] = 'tok_changed'
        raw!.scopepath[2] = 'changed'
        const peeked = await deviceDB.peek(asked)
        expect(peeked?.vault_tok).to.eq(asked.vault_tok)
        const [again] = await deviceDB.listRawLeases()
        expect(again?.scopepath).to.deep.equal(scopepathOf(vaultScope))
      })

      it("returns an empty list for an empty DeviceDB", async () => {
        const deviceDB = await fresh()
        expect(await deviceDB.listRawLeases()).to.deep.equal([])
      })
    })

    describe("forgetRawLease(scopepath)", () => {
      it.skipIf(noRows)("deletes a stored row that fails its check, by its scopepath", async () => {
        const deviceDB = await fresh()
        await deviceDB.stow(await leaseRowOf())
        await rowsOf(deviceDB).plantLeaseRow(vaultScopeOf('damaged'), { proved_at: 5 })
        const listed = await deviceDB.listRawLeases()
        const damaged = listed.find(({ row }) => bagOf(row)['proved_at'] === 5)
        await deviceDB.forgetRawLease(damaged!.scopepath)
        expect(await deviceDB.listRawLeases()).to.have.lengthOf(1)
        expect(await deviceDB.peek(asked)).to.not.be.null
      })

      it.skipIf(noRows)("deletes a row stored under invalid labels, by its scopepath", async () => {
        const deviceDB = await fresh()
        await deviceDB.stow(await leaseRowOf())
        const badLabel = vaultScopeOf('Bad Label')
        await rowsOf(deviceDB).plantLeaseRow(badLabel, await leaseRowOf(badLabel))
        const listed = await deviceDB.listRawLeases()
        const doomed = listed.find(({ scopepath }) => scopepath[2] === badLabel.vaultlabel)
        expect(doomed?.scopepath).to.deep.equal(scopepathOf(badLabel))
        await deviceDB.forgetRawLease(doomed!.scopepath)
        const left = await deviceDB.listRawLeases()
        expect(left.map(({ scopepath }) => scopepath)).to.deep.equal([scopepathOf(vaultScope)])
        expect(await deviceDB.listLeases()).to.have.lengthOf(1)
      })

      it.skipIf(noRows)("deletes a row that lost its scope, by its scopepath", async () => {
        const deviceDB = await fresh()
        await deviceDB.stow(await leaseRowOf())
        const stripped = vaultScopeOf('stripped')
        await rowsOf(deviceDB).plantLeaseRow(stripped, { proved_at: T0, wrapped: 'opaque' })
        const listed = await deviceDB.listRawLeases()
        const doomed = listed.find(({ scopepath }) => scopepath[2] === stripped.vaultlabel)
        expect(doomed?.scopepath).to.deep.equal(scopepathOf(stripped))
        await deviceDB.forgetRawLease(doomed!.scopepath)
        const left = await deviceDB.listRawLeases()
        expect(left.map(({ scopepath }) => scopepath)).to.deep.equal([scopepathOf(vaultScope)])
        expect(await deviceDB.listLeases()).to.have.lengthOf(1)
      })

      it("deletes a lease row whatever its vault_tok", async () => {
        const deviceDB = await fresh()
        await deviceDB.stow(await leaseRowOf())
        await deviceDB.forgetRawLease(scopepathOf(vaultScope))
        expect(await deviceDB.peek(asked)).to.be.null
        expect(await deviceDB.listRawLeases()).to.deep.equal([])
      })

      it("is a no-op where there is no row", async () => {
        const deviceDB = await fresh()
        await deviceDB.stow(await leaseRowOf())
        const absent = scopepathOf(vaultScopeOf('absent'))
        await deviceDB.forgetRawLease(absent)
        const deleted = await deviceDB.tryForgetRawLease(absent)
        expect(deleted.ok).to.be.true
        expect(await deviceDB.listRawLeases()).to.have.lengthOf(1)
      })

      it("refuses what is not three strings", async () => {
        const deviceDB = await fresh()
        await expectRefusal(deviceDB.forgetRawLease(vaultScope as never))
        await expectBad(deviceDB.tryForgetRawLease(['acme', 'u1'] as never))
        await expectBad(deviceDB.tryForgetRawLease(['acme', 'u1', 5] as never))
      })
    })

    describe("ensureCachedBank(scope)", () => {
      it("makes the bank row on the first call, its device_id a fresh UUID", async () => {
        const deviceDB = await fresh()
        const made = await deviceDB.ensureCachedBank(bankScope)
        expect(CX.device_id.safeParse(made.device_id).success).to.be.true
        expect(made).to.deep.equal({ ...bankScope, device_id: made.device_id })
        expect(await deviceDB.listRawBanks()).to.deep.equal([made])
      })

      it("returns the same row on a later call", async () => {
        const deviceDB = await fresh()
        const made = await deviceDB.ensureCachedBank(bankScope)
        expect(await deviceDB.ensureCachedBank(bankScope)).to.deep.equal(made)
        expect(await deviceDB.listRawBanks()).to.deep.equal([made])
      })

      it("gives each bank scope a device_id of its own", async () => {
        const deviceDB = await fresh()
        const ids = new Set<string>()
        for (const scope of [bankScope, { ...bankScope, user_id: 'u2' }, { ...bankScope, applabel: 'other' }]) {
          const made = await deviceDB.ensureCachedBank(scope)
          ids.add(made.device_id)
        }
        expect(ids.size).to.eq(3)
        expect(await deviceDB.listRawBanks()).to.have.lengthOf(3)
      })

      it("returns one device_id to two calls made at once for a scope", async () => {
        const deviceDB = await fresh()
        const [one, other] = await Promise.all([deviceDB.ensureCachedBank(bankScope), deviceDB.ensureCachedBank(bankScope)])
        expect(other).to.deep.equal(one)
        expect(await deviceDB.listRawBanks()).to.have.lengthOf(1)
      })

      it("takes a vault scope or any bag with a bank scope, keeping only the bank scope", async () => {
        const deviceDB = await fresh()
        const made = await deviceDB.ensureCachedBank({ ...vaultScope, vault_tok: 'tok_one' } as never)
        expect(made).to.have.keys(['applabel', 'user_id', 'device_id'])
        expect(await deviceDB.ensureCachedBank(bankScope)).to.deep.equal(made)
      })

      it("hands back a copy of the row stored", async () => {
        const deviceDB = await fresh()
        const made = await deviceDB.ensureCachedBank(bankScope)
        const kept = made.device_id
        made.device_id = 'changed'
        const again = await deviceDB.ensureCachedBank(bankScope)
        expect(again.device_id).to.eq(kept)
      })

      it("keeps its rows apart from the leases", async () => {
        const deviceDB = await fresh()
        await deviceDB.stow(await leaseRowOf())
        await deviceDB.ensureCachedBank(bankScope)
        expect(await deviceDB.listRawLeases()).to.have.lengthOf(1)
        expect(await deviceDB.listLeases()).to.have.lengthOf(1)
        expect(await deviceDB.listRawBanks()).to.have.lengthOf(1)
        await deviceDB.forgetRawLease(scopepathOf(vaultScope))
        expect(await deviceDB.listRawBanks()).to.have.lengthOf(1)
      })

      it.skipIf(noRows)("makes a fresh row over a stored one that fails its check", async () => {
        const deviceDB = await fresh()
        await rowsOf(deviceDB).plantBankRow(bankScope, { ...bankScope, device_id: 'not-a-uuid' })
        const made = await deviceDB.ensureCachedBank(bankScope)
        expect(CX.device_id.safeParse(made.device_id).success).to.be.true
        expect(await deviceDB.ensureCachedBank(bankScope)).to.deep.equal(made)
        expect(await rowsOf(deviceDB).bankRowsOf()).to.deep.equal([made])
      })

      it("refuses a malformed scope", async () => {
        const deviceDB = await fresh()
        await expectRefusal(deviceDB.ensureCachedBank({ ...bankScope, applabel: 'No Good!' }), 'bad_scope')
        await expectRefusal(deviceDB.ensureCachedBank({ applabel: 'acme' } as never), 'bad_scope')
        await expectBad(deviceDB.tryEnsureCachedBank({ ...bankScope, user_id: '' }), 'bad_scope')
        expect(await deviceDB.listRawBanks()).to.deep.equal([])
      })

      it("its try form returns an Outcome", async () => {
        const deviceDB = await fresh()
        const made = await expectGood(deviceDB.tryEnsureCachedBank(bankScope))
        expect(await deviceDB.ensureCachedBank(bankScope)).to.deep.equal(made)
      })
    })

    describe("forgetBank(scope)", () => {
      it("forgets the bank row, so that the next ensureCachedBank mints a fresh device_id", async () => {
        const deviceDB = await fresh()
        const made = await deviceDB.ensureCachedBank(bankScope)
        await deviceDB.forgetBank(bankScope)
        expect(await deviceDB.listRawBanks()).to.deep.equal([])
        const again = await deviceDB.ensureCachedBank(bankScope)
        expect(CX.device_id.safeParse(again.device_id).success).to.be.true
        expect(again.device_id).to.not.eq(made.device_id)
      })

      it("leaves every other bank row and the leases", async () => {
        const deviceDB = await fresh()
        await deviceDB.stow(await leaseRowOf())
        const kept = await deviceDB.ensureCachedBank({ ...bankScope, user_id: 'u2' })
        await deviceDB.ensureCachedBank(bankScope)
        await deviceDB.forgetBank({ ...vaultScope, vault_tok: 'tok_one' } as never)
        expect(await deviceDB.listRawBanks()).to.deep.equal([kept])
        expect(await deviceDB.listLeases()).to.have.lengthOf(1)
      })

      it("does nothing where no bank row is stored", async () => {
        const deviceDB = await fresh()
        await expectGood(deviceDB.tryForgetBank(bankScope))
        expect(await deviceDB.listRawBanks()).to.deep.equal([])
      })

      it.skipIf(noRows)("forgets a stored row that fails its check", async () => {
        const deviceDB = await fresh()
        await rowsOf(deviceDB).plantBankRow(bankScope, { ...bankScope, device_id: 'not-a-uuid' })
        await deviceDB.forgetBank(bankScope)
        expect(await rowsOf(deviceDB).bankRowsOf()).to.deep.equal([])
      })

      it("refuses a malformed scope", async () => {
        const deviceDB = await fresh()
        const made = await deviceDB.ensureCachedBank(bankScope)
        await expectRefusal(deviceDB.forgetBank({ ...bankScope, applabel: 'No Good!' }), 'bad_scope')
        await expectBad(deviceDB.tryForgetBank({ applabel: 'acme' } as never), 'bad_scope')
        expect(await deviceDB.listRawBanks()).to.deep.equal([made])
      })
    })

    describe("listRawBanks()", () => {
      it.skipIf(noRows)("returns a stored row that fails its check beside the sound ones", async () => {
        const deviceDB = await fresh()
        const made = await deviceDB.ensureCachedBank(bankScope)
        await rowsOf(deviceDB).plantBankRow({ ...bankScope, user_id: 'u2' }, { device_id: 5 })
        expect(await expectGood(deviceDB.tryListRawBanks())).to.have.deep.members([made, { device_id: 5 }])
      })

      it("returns an empty list for an empty DeviceDB", async () => {
        const deviceDB = await fresh()
        expect(await deviceDB.listRawBanks()).to.deep.equal([])
      })
    })

    describe("a DeviceDB whose device database fails", () => {
      it.skipIf(_cheat_failNextCall === undefined)("refuses each verb", async () => {
        const deviceDB = await fresh()
        const row = await leaseRowOf()
        const verbs = [
          () => deviceDB.tryStow(row), () => deviceDB.tryPeek(asked), () => deviceDB.tryForget(asked), () => deviceDB.tryListLeases(), () => deviceDB.tryListRawLeases(), () => deviceDB.tryForgetRawLease(scopepathOf(vaultScope)),
          () => deviceDB.tryEnsureCachedBank(bankScope), () => deviceDB.tryForgetBank(bankScope), () => deviceDB.tryListRawBanks(),
        ]
        for (const verb of verbs) {
          await failNextCall(deviceDB)
          await expectBad(verb(), 'storage_unavailable')
        }
      })
    })
  })
}
// --
