/** The battery every VaultDB runs, and every client of one: one call registers the cases a VaultDB must pass, over a fresh VaultDB for each. */

import { afterEach, beforeEach, describe } from 'vitest'
import { objCheck } from '../../src/helpers/validator'
import { _cheat_clock, _cheat_clockReset } from '../../src/helpers/clock'
import * as SX from '../../src/shapes/shapes-storage'
import type { Awaitable } from '../../src/helpers/helpers'
import type { Boxscope, VaultScope } from '../../src/shapes/shapes-core'
import type { AdapterVaultDBOpts } from '../../src/shapes/shapes-storage'
import type { AdapterVaultDB, VaultDB } from '../../src/storage/vault-db'
import { Now, vaultAt, boxAt } from './storage-world'
import { describeGets } from './vault-db-battery-gets'
import { describePuts } from './vault-db-battery-puts'
import { describeDels } from './vault-db-battery-dels'
import { describeRaces } from './vault-db-battery-races'

// == [The hooks a VaultDB hands the battery]: VaultDBRowCheats, VaultDBBatteryOpts

/** A VaultDB's raw rows, past its verbs: the test backdoor the battery plants a row by, damaged or not, and reads one back by. */
export type VaultDBRowCheats = {
  /** Writes `row` as the vault row at `scope`, unchecked. */
  plantVaultRow: (scope: VaultScope, row: unknown) => Awaitable<void>
  /** Writes `row` as the box row at `scope` under the life `vault_tok`, unchecked, whether or not a vault row stands over it. */
  plantBoxRow: (scope: Boxscope, vault_tok: string, row: unknown) => Awaitable<void>
  /** The vault row at `scope` as stored, or null. */
  vaultRowOf: (scope: VaultScope) => Awaitable<unknown>
  /** The box rows under one life of the vault at `scope` as stored, by boxlabel. */
  boxRowsOf: (scope: VaultScope, vault_tok: string) => Awaitable<Map<string, unknown>>
}

/** What a VaultDB hands {@link describeVaultDBBattery}: how to make one, and the backdoor to its rows. */
export type VaultDBBatteryOpts<DBT extends VaultDB = VaultDB> = {
  /** A fresh, empty VaultDB, passing `opts` to AdapterVaultDB's constructor. */
  makeVaultDB: (opts?: AdapterVaultDBOpts) => Awaitable<DBT>
  /** The backdoor to a VaultDB's raw rows. */
  _cheat_rowsOf: (vaultDB: DBT) => VaultDBRowCheats
  /** A second VaultDB over the same rows, as another device holds; without it, the races run over one VaultDB. */
  makeTwin?: (vaultDB: DBT) => Awaitable<VaultDB>
  /** A fresh, empty VaultDB holding at most `maxBoxes` live boxes to a vault; without it, the cases of a cap are skipped. */
  makeCappedVaultDB?: (maxBoxes: number) => Awaitable<DBT>
  /** Makes the VaultDB's next call to its storage fail as its storage would; without it, that case is skipped. */
  _cheat_failNextCall?: (vaultDB: DBT) => Awaitable<void>
  /** The AdapterVaultDB behind a client, where the battery slips a rival write in; without it, `vaultDB` itself. */
  _cheat_adapterOf?: (vaultDB: DBT) => AdapterVaultDB
  /** False for a VaultDB whose watch hears nothing; its cases are then skipped. */
  watches?: boolean
  /** False for a VaultDB whose box notices come without their vault row, which a watch then hears with a null world. */
  boxNoticesCarryVault?: boolean
}
// --

/** The check of what a VaultDB hands the battery: each hook a function, judged by its interface alone. */
const batteryOpts = objCheck(({ fn, bool }) => ({
  makeVaultDB:          fn<VaultDBBatteryOpts['makeVaultDB']>(),
  _cheat_rowsOf:        fn<VaultDBBatteryOpts['_cheat_rowsOf']>(),
  makeTwin:             fn<NonNullable<VaultDBBatteryOpts['makeTwin']>>().optional(),
  makeCappedVaultDB:    fn<NonNullable<VaultDBBatteryOpts['makeCappedVaultDB']>>().optional(),
  _cheat_failNextCall:  fn<NonNullable<VaultDBBatteryOpts['_cheat_failNextCall']>>().optional(),
  _cheat_adapterOf:       fn<NonNullable<VaultDBBatteryOpts['_cheat_adapterOf']>>().optional(),
  watches:              bool.optional(),
  boxNoticesCarryVault: bool.optional(),
}), 'bad_option')

// == [The world the cases share]: BatteryWorld, worldOf

/** What each part of the battery is handed: VaultDBs made fresh, and the hooks, over any VaultDB the world made. */
export type BatteryWorld = {
  fresh:                (opts?: AdapterVaultDBOpts) => Promise<VaultDB>
  putWith:            (opts?: { box?: boolean }) => Promise<{ vaultDB: VaultDB, vault: ReturnType<typeof vaultAt>, box: ReturnType<typeof boxAt> }>
  rowsOf:               (vaultDB: VaultDB) => VaultDBRowCheats
  twinOf:               (vaultDB: VaultDB) => Promise<VaultDB>
  /** The AdapterVaultDB behind `vaultDB`, or `vaultDB` itself. */
  adapterOf:              (vaultDB: VaultDB) => AdapterVaultDB
  /** Whether the VaultDB gave {@link VaultDBBatteryOpts.makeCappedVaultDB}; without it, `makeCapped` throws. */
  hasCap:               boolean
  makeCapped:           (maxBoxes: number) => Promise<VaultDB>
  /** Whether the VaultDB gave {@link VaultDBBatteryOpts._cheat_failNextCall}; without it, `failNextCall` throws. */
  canFail:              boolean
  failNextCall:         (vaultDB: VaultDB) => Promise<void>
  watches:              boolean
  boxNoticesCarryVault: boolean
}

/** Stands in for a hook the VaultDB did not give, in a case that is skipped without it. */
const notGiven = (hookname: string) => (): never => { throw new TypeError(`The VaultDB gave the battery no ${hookname}.`) }

// Every VaultDB a world's hooks are handed is one its own factories made, so the narrowing to DBT holds;
// a world given no `_cheat_adapterOf` was handed AdapterVaultDBs.
const worldOf = <DBT extends VaultDB>(opts: VaultDBBatteryOpts<DBT>): BatteryWorld => {
  const { makeVaultDB, _cheat_rowsOf, makeTwin, makeCappedVaultDB, _cheat_failNextCall, _cheat_adapterOf, watches = true, boxNoticesCarryVault = true } = opts
  const fresh = async (dbOpts?: AdapterVaultDBOpts): Promise<VaultDB> => await makeVaultDB(dbOpts)
  const putWith = async ({ box: withBox = false } = {}) => {
    const vaultDB = await fresh()
    const vault = vaultAt()
    await vaultDB.putVault(vault, { prior: SX.VoidRevision })
    const box = boxAt()
    if (withBox) { await vaultDB.putBox(box, { prior: SX.VoidRevision }) }
    return { vaultDB, vault, box }
  }
  return {
    fresh,
    putWith,
    rowsOf:       (vaultDB) => _cheat_rowsOf(vaultDB as DBT),
    twinOf:       async (vaultDB) => (makeTwin ? await makeTwin(vaultDB as DBT) : vaultDB),
    adapterOf:      (vaultDB) => (_cheat_adapterOf ? _cheat_adapterOf(vaultDB as DBT) : vaultDB as AdapterVaultDB),
    hasCap:       makeCappedVaultDB !== undefined,
    makeCapped:   makeCappedVaultDB ? async (maxBoxes) => await makeCappedVaultDB(maxBoxes) : notGiven('makeCappedVaultDB'),
    canFail:      _cheat_failNextCall !== undefined,
    failNextCall: _cheat_failNextCall ? async (vaultDB) => { await _cheat_failNextCall(vaultDB as DBT) } : notGiven('_cheat_failNextCall'),
    watches,
    boxNoticesCarryVault,
  }
}
// --

// == [The battery]: describeVaultDBBattery

// The opts are checked before anything registers, so a VaultDB missing a hook fails here, not inside each case.
/** Registers the cases every VaultDB must pass, under `label`. */
export const describeVaultDBBattery = <DBT extends VaultDB>(label: string, opts: VaultDBBatteryOpts<DBT>): void => {
  batteryOpts.parse(opts, { where: `describeVaultDBBattery("${label}")` })
  const world = worldOf(opts)
  describe(label, () => {
    beforeEach(() => { _cheat_clock(() => Now + 1) })
    afterEach(() => { _cheat_clockReset() })
    describeGets(world)
    describePuts(world)
    describeDels(world)
    describeRaces(world)
  })
}
// --
