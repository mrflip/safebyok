/** The battery every vaultDB runs: one call registers the cases a vaultDB must pass, over a fresh vaultDB for each. */
import { describe } from 'vitest'
import { type Helpers, Validator } from 'safebyok-big/internals'
import { expectGood } from 'safebyok-big/testing'
import type { Labelpath, Lifepath } from '../../src/shapes/primitives'
import { type BoxRecord, type GateRecord, type ThingRecord, type ThingScope, type Absent, Shell } from '../../src/shapes/shapes-thing'

import type { VaultDB } from '../../src/storage/vault-db'
import { Life0, birthAskOf, birthBankAskOf, gateThingOf, getAskAt } from './vaultdb-world'
import { describeVaultDBWrites } from './vaultdb-battery-writes'
import { describeVaultDBLists } from './vaultdb-battery-lists'
import { describeVaultDBBirths } from './vaultdb-battery-births'
import { describeVaultDBWatch } from './vaultdb-battery-watch'
import { describeVaultDBWorld } from './vaultdb-battery-world'
import { describeVaultDBTracked } from './vaultdb-battery-tracked'

// == [The hooks a vaultDB hands the battery]: VaultDBRowCheats, VaultDBBatteryOpts

/** A vaultDB's stored Things, past its verbs: the cheat the battery plants a damaged Thing with, or removes one with. */
export type VaultDBRowCheats = {
  /** Stores `raw` as the Thing at `scope`, unchecked. A concrete adapter that cannot write `raw` throws. */
  plant:  (scope: ThingScope, raw: unknown) => Helpers.Awaitable<void>
  /** Takes away the Thing at `scope`, if any, unchecked. */
  remove: (scope: ThingScope) => Helpers.Awaitable<void>
}

/** The options of {@link describeVaultDBBattery}: how to make a vaultDB, and the cheat into what it stores. */
export type VaultDBBatteryOpts<DBT extends VaultDB = VaultDB> = {
  /** A fresh, empty vaultDB. A concrete adapter may empty one database for each it makes: a case uses only the vaultDB it made last. */
  makeVaultDB:   () => Helpers.Awaitable<DBT>
  /** The cheat into a vaultDB's stored Things. */
  _cheat_rowsOf: (vaultDB: DBT) => VaultDBRowCheats
  /** False for a vaultDB whose watch hears nothing; the battery then has no cases of a watch. */
  watches?:      boolean
}
// --

/** The check of what a vaultDB hands the battery: each hook a function, judged by its interface alone. */
const batteryOpts = Validator.objCheck(({ fn, bool }) => ({
  makeVaultDB:   fn<VaultDBBatteryOpts['makeVaultDB']>(),
  _cheat_rowsOf: fn<VaultDBBatteryOpts['_cheat_rowsOf']>(),
  watches:       bool.optional(),
}), 'bad_record')

// == [The world the cases share]: VaultDBBatteryWorld, worldOf

/** The world each part of the battery is handed: vaultDBs made fresh or with Things in them, and the cheat into any of them. */
export type VaultDBBatteryWorld = {
  /** A fresh, empty vaultDB. */
  fresh:     () => Promise<VaultDB>
  /** A fresh vaultDB with a bank born in it, its three roots as `birthBankAskOf` makes them. */
  bornBank:  () => Promise<VaultDB>
  /** A fresh vaultDB with the main gate alone written in it, by a birth, and no bank. */
  withGate:  (stored?: GateRecord) => Promise<VaultDB>
  /** Write `thing` into `vaultDB`, born under its parent's life at `parentLifepath`. */
  bornUnder: (vaultDB: VaultDB, thing: ThingRecord, parentLifepath: Lifepath) => Promise<void>
  /** Write each of `boxes` into `vaultDB`, born under the root box's life 0, and return them. */
  boxesBorn: (vaultDB: VaultDB, ...boxes: BoxRecord[]) => Promise<BoxRecord[]>
  /** The live Thing `vaultDB` stores at `labelpath`, or Absent for a tombstone or none; throws on a refusal. */
  gotAt:     (vaultDB: VaultDB, labelpath: Labelpath) => Promise<ThingRecord | Absent>
  /** The cheat into what `vaultDB` stores. */
  rowsOf:    (vaultDB: VaultDB) => VaultDBRowCheats
  watches:   boolean
}

// Every vaultDB a world's hooks are handed is one its own factory made, so narrowing one to DBT is safe.
function worldOf<DBT extends VaultDB>({ makeVaultDB, _cheat_rowsOf, watches = true }: VaultDBBatteryOpts<DBT>): VaultDBBatteryWorld {
  async function fresh(): Promise<VaultDB> { return await makeVaultDB() }
  async function bornBank(): Promise<VaultDB> {
    const vaultDB = await fresh()
    await expectGood(vaultDB.tryBirthBank(birthBankAskOf()))
    return vaultDB
  }
  async function withGate(stored: GateRecord = gateThingOf()): Promise<VaultDB> {
    const vaultDB = await fresh()
    await expectGood(vaultDB.tryWriteThing(birthAskOf(stored)))
    return vaultDB
  }
  async function bornUnder(vaultDB: VaultDB, thing: ThingRecord, parentLifepath: Lifepath): Promise<void> {
    const ask = birthAskOf(thing, Shell.childCited(parentLifepath))
    await expectGood(vaultDB.tryWriteThing(ask))
  }
  async function boxesBorn(vaultDB: VaultDB, ...boxes: BoxRecord[]): Promise<BoxRecord[]> {
    for (const box of boxes) { await bornUnder(vaultDB, box, Life0) }
    return boxes
  }
  async function gotAt(vaultDB: VaultDB, labelpath: Labelpath): Promise<ThingRecord | Absent> {
    const answer = await vaultDB.tryGetThing(getAskAt(labelpath))
    return await expectGood<ThingRecord | Absent>(answer)
  }
  return { fresh, bornBank, withGate, bornUnder, boxesBorn, gotAt, rowsOf: (vaultDB) => _cheat_rowsOf(vaultDB as DBT), watches }
}
// --

/** Register, under `label`, the cases every vaultDB must pass, each over a fresh vaultDB `opts` makes. */
export function describeVaultDBBattery<DBT extends VaultDB>(label: string, opts: VaultDBBatteryOpts<DBT>): void {
  batteryOpts.parse(opts, { where: `describeVaultDBBattery("${label}")` })
  const world = worldOf(opts)
  describe(label, () => {
    describeVaultDBWrites(world)
    describeVaultDBLists(world)
    describeVaultDBBirths(world)
    describeVaultDBWorld(world)
    describeVaultDBTracked(world)
    if (world.watches) { describeVaultDBWatch(world) }
  })
}
