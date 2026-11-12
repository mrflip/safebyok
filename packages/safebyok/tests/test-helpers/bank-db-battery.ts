/** The battery every bankDB runs, and every client of one: one call registers the cases a bankDB must pass, over a fresh bankDB for each. */

import { afterEach, beforeEach, describe } from 'vitest'
import { objCheck } from '../../src/helpers/validator'
import { _cheat_clock, _cheat_clockReset } from '../../src/helpers/clock'
import type { Awaitable } from '../../src/helpers/helpers'
import type { BankScope, Boxscope, GateScope, VaultScope } from '../../src/shapes/shapes-core'
import type { AdapterBankDBOpts, BankRecord, BoxRecord, GateRecord, VaultRecord } from '../../src/shapes/shapes-bankdb'
import type { BankDB } from '../../src/storage/bank-db'
import type { AdapterBankDB } from '../../src/storage/adapter-bank-db'
import { Now, bankAt, bankBuildAskOf, boxAt, boxPutAskOf, gateAt, vaultAt, vaultPutAskOf } from './bankdb-world'
import { describeGets } from './bank-db-battery-gets'
import { describePuts } from './bank-db-battery-puts'
import { describeDels } from './bank-db-battery-dels'
import { describeRaces } from './bank-db-battery-races'
import { describeIdentity } from './bank-db-battery-identity'
import { describeFlaws } from './bank-db-battery-flaws'

// == [The hooks a bankDB hands the battery]: BankDBRowCheats, BankDBBatteryOpts

/** A bankDB's raw rows, past its verbs: the test backdoor the battery plants a row by, damaged or not, and reads one back by. */
export type BankDBRowCheats = {
  /** Writes `row` as the bank row at `scope`, unchecked.
   * Where the store cannot hold `row`, it may throw or store something else: the battery reads the row back to tell.
   */
  plantBankRow: (scope: BankScope, row: unknown) => Awaitable<void>
  /** Writes `row` as the gate row at `scope`, unchecked, whether or not a bank row stands over it. */
  plantGateRow: (scope: GateScope, row: unknown) => Awaitable<void>
  /** Writes `row` as the vault row at `scope`, unchecked, whether or not a bank row stands over it. */
  plantVaultRow: (scope: VaultScope, row: unknown) => Awaitable<void>
  /** Writes `row` as the box row at `scope` in the vault life `vault_tok` of the bank life `bank_tok`, unchecked, whether or not a vault row stands over it. */
  plantBoxRow: (scope: Boxscope, bank_tok: string, vault_tok: string, row: unknown) => Awaitable<void>
  /** The bank row at `scope` as stored, or null. */
  bankRowOf: (scope: BankScope) => Awaitable<unknown>
  /** The gate row at `scope` as stored, or null. */
  gateRowOf: (scope: GateScope) => Awaitable<unknown>
  /** The vault row at `scope` as stored, or null. */
  vaultRowOf: (scope: VaultScope) => Awaitable<unknown>
  /** The box rows of the vault at `scope`, in its life `vault_tok` of the bank life `bank_tok`, as stored, by boxlabel. */
  boxRowsOf: (scope: VaultScope, bank_tok: string, vault_tok: string) => Awaitable<Map<string, unknown>>
}

/** What a bankDB hands {@link describeBankDBBattery}: how to make one, and the backdoor to its rows. */
export type BankDBBatteryOpts<DBT extends BankDB = BankDB> = {
  /** A fresh, empty bankDB, passing `opts` to AdapterBankDB's constructor. */
  makeBankDB: (opts?: AdapterBankDBOpts) => Awaitable<DBT>
  /** The backdoor to a bankDB's raw rows. */
  _cheat_rowsOf: (bankDB: DBT) => BankDBRowCheats
  /** A second bankDB over the same rows, as another device has; without it, the races run over one bankDB. */
  makeTwin?: (bankDB: DBT) => Awaitable<BankDB>
  /** A fresh, empty bankDB with at most `maxBoxes` box rows to a vault life, live and deleted; without it, the battery has no cases of a cap. */
  makeCappedBankDB?: (maxBoxes: number) => Awaitable<DBT>
  /** A fresh backend, as a way to make a bankDB over it signed in as a user, or signed out for null; without it, the battery has no cases of who may reach a bank. */
  makeBankDBFor?: () => Awaitable<(user_id: string | null) => BankDB>
  /** Makes the bankDB's next call to its storage fail as its storage would; without it, the battery has no case of that failure. */
  _cheat_failNextCall?: (bankDB: DBT) => Awaitable<void>
  /** The AdapterBankDB behind a client, where the battery slips a rival write in; without it, `bankDB` itself. */
  _cheat_adapterOf?: (bankDB: DBT) => AdapterBankDB
  /** False for a bankDB whose watch hears nothing; the battery then has no cases of a watch. */
  watches?: boolean
  /** False for a bankDB whose box notices come without their vault row, which a watch then hears with a null parent. */
  boxNoticesCarryVault?: boolean
}
// --

/** The check of what a bankDB hands the battery: each hook a function, judged by its interface alone. */
const batteryOpts = objCheck(({ fn, bool }) => ({
  makeBankDB:           fn<BankDBBatteryOpts['makeBankDB']>(),
  _cheat_rowsOf:        fn<BankDBBatteryOpts['_cheat_rowsOf']>(),
  makeTwin:             fn<NonNullable<BankDBBatteryOpts['makeTwin']>>().optional(),
  makeCappedBankDB:     fn<NonNullable<BankDBBatteryOpts['makeCappedBankDB']>>().optional(),
  makeBankDBFor:        fn<NonNullable<BankDBBatteryOpts['makeBankDBFor']>>().optional(),
  _cheat_failNextCall:  fn<NonNullable<BankDBBatteryOpts['_cheat_failNextCall']>>().optional(),
  _cheat_adapterOf:     fn<NonNullable<BankDBBatteryOpts['_cheat_adapterOf']>>().optional(),
  watches:              bool.optional(),
  boxNoticesCarryVault: bool.optional(),
}), 'bad_option')

// == [The world the cases share]: Built, BatteryWorld, worldOf

/** What `putWith` built: the bankDB, and the bank, gate, vault and box records it put, the vault unless asked not to and the box only when asked for. */
export type Built = { bankDB: BankDB, bank: BankRecord, gate: GateRecord, vault: VaultRecord, box: BoxRecord }

/** What each part of the battery is handed: bankDBs made fresh, and the hooks, over any bankDB the world made. */
export type BatteryWorld = {
  fresh:                (opts?: AdapterBankDBOpts) => Promise<BankDB>
  /** A fresh bankDB with the bank built in it, the vault put unless `vault` is false, and the box when `box` is true. */
  putWith:              (opts?: { vault?: boolean, box?: boolean }) => Promise<Built>
  rowsOf:               (bankDB: BankDB) => BankDBRowCheats
  twinOf:               (bankDB: BankDB) => Promise<BankDB>
  /** The AdapterBankDB behind `bankDB`, or `bankDB` itself. */
  adapterOf:            (bankDB: BankDB) => AdapterBankDB
  /** Whether the bankDB gave {@link BankDBBatteryOpts.makeCappedBankDB}; without it, `makeCapped` throws. */
  hasCap:               boolean
  makeCapped:           (maxBoxes: number) => Promise<BankDB>
  /** Whether the bankDB gave {@link BankDBBatteryOpts.makeBankDBFor}; without it, `makeBankDBFor` throws. */
  hasIdentity:          boolean
  makeBankDBFor:        () => Promise<(user_id: string | null) => BankDB>
  /** Whether the bankDB gave {@link BankDBBatteryOpts._cheat_failNextCall}; without it, `failNextCall` throws. */
  canFail:              boolean
  failNextCall:         (bankDB: BankDB) => Promise<void>
  watches:              boolean
  boxNoticesCarryVault: boolean
}

/** Stands in for a hook the bankDB did not give, in a case not registered without it. */
function notGiven(hookname: string) { return (): never => { throw new TypeError(`The bankDB gave the battery no ${hookname}.`) } }

// Every bankDB a world's hooks are handed is one its own factories made, so narrowing one to DBT is safe;
// a world given no `_cheat_adapterOf` was handed AdapterBankDBs.
function worldOf<DBT extends BankDB>(opts: BankDBBatteryOpts<DBT>): BatteryWorld {
  const { makeBankDB, _cheat_rowsOf, makeTwin, makeCappedBankDB, makeBankDBFor, _cheat_failNextCall, _cheat_adapterOf, watches = true, boxNoticesCarryVault = true } = opts
  const fresh = async (dbOpts?: AdapterBankDBOpts): Promise<BankDB> => await makeBankDB(dbOpts)
  const putWith = async ({ vault: withVault = true, box: withBox = false } = {}): Promise<Built> => {
    const bankDB = await fresh()
    const bank = bankAt()
    const gate = gateAt()
    await bankDB.buildBank(bankBuildAskOf(bank, gate))
    const vault = vaultAt()
    if (withVault) { await bankDB.putVault(vaultPutAskOf(vault)) }
    const box = boxAt()
    if (withBox) { await bankDB.putBox(boxPutAskOf(box)) }
    return { bankDB, bank, gate, vault, box }
  }
  return {
    fresh,
    putWith,
    rowsOf:        (bankDB) => _cheat_rowsOf(bankDB as DBT),
    twinOf:        async (bankDB) => (makeTwin ? await makeTwin(bankDB as DBT) : bankDB),
    adapterOf:     (bankDB) => (_cheat_adapterOf ? _cheat_adapterOf(bankDB as DBT) : bankDB as AdapterBankDB),
    hasCap:        makeCappedBankDB !== undefined,
    makeCapped:    makeCappedBankDB ? async (maxBoxes) => await makeCappedBankDB(maxBoxes) : notGiven('makeCappedBankDB'),
    hasIdentity:   makeBankDBFor !== undefined,
    makeBankDBFor: makeBankDBFor ? async () => await makeBankDBFor() : notGiven('makeBankDBFor'),
    canFail:       _cheat_failNextCall !== undefined,
    failNextCall:  _cheat_failNextCall ? async (bankDB) => { await _cheat_failNextCall(bankDB as DBT) } : notGiven('_cheat_failNextCall'),
    watches,
    boxNoticesCarryVault,
  }
}
// --

// == [The battery]: describeBankDBBattery

// The opts are checked before anything registers, so a bankDB missing a hook fails here, not inside each case.
/** Registers the cases every bankDB must pass, under `label`. */
export function describeBankDBBattery<DBT extends BankDB>(label: string, opts: BankDBBatteryOpts<DBT>): void {
  batteryOpts.parse(opts, { where: `describeBankDBBattery("${label}")` })
  const world = worldOf(opts)
  describe(label, () => {
    beforeEach(() => { _cheat_clock(() => Now + 1) })
    afterEach(() => { _cheat_clockReset() })
    describeGets(world)
    describePuts(world)
    describeDels(world)
    describeRaces(world)
    describeIdentity(world)
    describeFlaws(world)
  })
}
// --
