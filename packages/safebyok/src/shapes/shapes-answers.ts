/** The answers a vaultDB's verbs resolve, and what a concrete adapter reports to `AdapterVaultDB` for each, with the check it is read through. */

import type * as Z from 'zod'
import { CX, type EX, type Errors, Validator } from 'safebyok-big/internals'
import type { Labelpath, Lifepath, Lifeseq, Lifetok } from './primitives'
import type { ThingRecord, ThingScope, VoidSentinel } from './shapes-thing'
import type { SparseOf, TombstoneOf } from './shapes-sealers'
import type { BankRoots, LoggableAsk, Tracked, WorldRecord } from './shapes-asks'
import { type ReadTc, SeenChecks } from './shapes-vault-event'

// == [Answers]: GoodAnswer, BadAct, BadAnswer, Answer, GetThingAnswer, WriteThingAnswer, DamagedThing, KidEntry, Kids, ListedBeside, ListThingsAnswer, BirthBankAnswer
// No check reads an answer whole: `AdapterVaultDB` makes each of parts it has checked, and a reader checks each record it
// keeps where a Thing takes it.

/** A vaultDB verb's good answer: its `val`, the `act` that says what the datastore did, its bank's `world`, the loggable part of its `ask`, and when its step read the datastore (`read_tc`).
 * `world` is the bank and its main gate as the step left them, read in that step. It is null if either is missing or fails its checks.
 * `banktok` is the lifetok of the bank in `world`, or null where `world` is null.
 * `tracked`, only for an ask that tracks, says for each of the bank, its main gate and its root box whether it is still at the revision the ask tracks ({@link Tracked}).
 */
export type GoodAnswer<ValT, ActT extends EX.GoodAct> = { ok: true, ask: LoggableAsk, act: ActT, world: WorldRecord | null, banktok: Lifetok | null, tracked?: Tracked, read_tc: ReadTc, val: ValT }

/** A refused answer's act: big's, or `policied` for a replacement that a storage policy or a changed born_at refuses. */
export type BadAct = EX.BadAct | 'policied'

/** A vaultDB verb's refused answer: its `err` and `act`, the Thing found stored (`dbhas`), its bank's `world`, the loggable part of its `ask`, and when its step read the datastore (`read_tc`).
 * Where nothing is stored at the ask's scope, `dbhas` is the shell there, under the nearest Thing stored above it (see {@link GetThingAnswer}).
 * `banktok` is the lifetok of the bank in `world`, or null where `world` is null.
 * If the verb threw, `world` and `banktok` are null, `read_tc` is when it was refused, and `dbhas` is the Thing the refusal names, or null where it names none.
 */
export type BadAnswer<DbhasT = ThingRecord | VoidSentinel | null> = { ok: false, ask: LoggableAsk, act: BadAct, world: WorldRecord | null, banktok: Lifetok | null, tracked?: Tracked, read_tc: ReadTc, dbhas: DbhasT, err: Errors.VaultError }

/** A vaultDB verb's answer: a {@link GoodAnswer} or a {@link BadAnswer}. Never thrown. */
export type Answer<ValT, ActT extends EX.GoodAct> = GoodAnswer<ValT, ActT> | BadAnswer

/** The answer to `tryGetThing`: the live Thing (`gotlive`), or a `val` of null for a tombstone (`gotgone`) or none (`gotvoid`).
 * Every answer but `gotlive` carries a `dbhas`: the tombstone under `gotgone`, and the shell under `gotvoid` or a `void` refusal.
 * The shell's lifepath is that of the nearest Thing stored above it, live or a tombstone, as the step read it, then the
 * shell's lifeseq for each level below that Thing: `<box's lifepath>/-000000001` for `box/zz` under a stored root box. Where
 * nothing is stored above it, every level's lifeseq is the shell's (`-000000001/-000000001`); a root's is the shell's lifeseq alone.
 */
export type GetThingAnswer   =
  | GoodAnswer<ThingRecord, 'gotlive'>
  | (GoodAnswer<null, 'gotgone'> & { dbhas: TombstoneOf<ThingRecord> })
  | (GoodAnswer<null, 'gotvoid'> & { dbhas: VoidSentinel })
  | BadAnswer
/** The answer to `tryWriteThing`: the Thing the concrete adapter reports writing, or under `passed` the live Thing it found.
 * Refused, its `dbhas` is the Thing stored, or where none is, the shell there, as for {@link GetThingAnswer}.
 */
export type WriteThingAnswer = Answer<ThingRecord, EX.PutAct | EX.DelAct>

/** A child Thing that fails its kind's checks: its scope, and `am: 'd'`. */
export type DamagedThing = Readonly<ThingScope & { am: 'd' }>

/** One child in a {@link Kids} value: the lifeseq of its life stored. */
export type KidEntry = Readonly<{ lifeseq: Lifeseq }>

// Keyed by label, not labelpath. JavaScript orders an object's keys that look like whole numbers first, so a reader that
// needs labelpath order sorts the labels.
/** The children of one live life of a Thing, by label, as the datastore read them at `read_tc`: the live ones in `items`, the tombstones in `gones`.
 * `parentpath` is the parent's labelpath, and `parentlife` the lifepath of the parent's live life.
 */
export type Kids = Readonly<{
  modelkind:  'kids'
  parentpath: Labelpath
  parentlife: Lifepath
  items:      Readonly<Record<string, KidEntry>>
  gones:      Readonly<Record<string, KidEntry>>
  read_tc:    ReadTc
}>

/** What a listing answer carries beside its `val` or `dbhas`, each empty when refused. A live box is carried sparse, and any other Thing whole:
 * - `parentage`    -- the parent
 * - `deltas`       -- each child the `val` names, in labelpath order
 * - `damaged_rows` -- each child that fails its kind's checks
 */
export type ListedBeside<RecordT extends ThingRecord = ThingRecord> = {
  parentage:    readonly (RecordT | SparseOf<RecordT>)[]
  deltas:       readonly (RecordT | SparseOf<RecordT>)[]
  damaged_rows: readonly DamagedThing[]
}

/** The answer to `tryListThings`: the live parent's children as a {@link Kids} value, whose `read_tc` is the answer's.
 * A parent that is not live refuses `absent_thing`, `gone` with its tombstone as `dbhas`, or `void` with the shell at a root
 * and null below one. If the verb threw, `dbhas` is null.
 */
export type ListThingsAnswer<RecordT extends ThingRecord = ThingRecord> =
  | (GoodAnswer<Kids, 'gotlive'> & ListedBeside<RecordT>)
  | (BadAnswer & ListedBeside<RecordT>)

/** The answer to `tryBirthBank`: the three roots written (`born`), or found already stored (`passed`). Refused, its `dbhas` is the root stored that refused it. */
export type BirthBankAnswer = Answer<BankRoots, 'born' | 'passed'>
// --

// == [Pre-image of an answer]: ActualChecks, ActualBeside, Actual, GotActual, WroteActual, ListThingsActual, BirthBankActual, Received
// What a concrete adapter reports, carrying the actual values stored: `AdapterVaultDB` makes the answer from it.

/** True for null or a plain object */
function isBagOrNull(val: unknown): boolean { return (val === null) || CX.isPlainBag(val) }

// The classifier has checked the world, the tracked roots and a listing's Things before they reach a report: what is read
// again here is their shape, and the read_tc, which a concrete adapter makes itself.
/** The checks a concrete adapter's report is read through, each picking what the answer carries beside its `val` or `dbhas`. Each refuses `storage_issue`. */
export const ActualChecks = Validator.Checkers('storage_issue', ({ obj, custom }) => ({
  /** Pick what every report carries: its `world`, `tracked` and `read_tc`. */
  beside: obj({
    world:   custom<WorldRecord | null>(isBagOrNull),
    tracked: custom<Tracked | null>(isBagOrNull),
    read_tc: SeenChecks.readTc,
  }),
  /** Pick what a listing's report carries beside that: its `parentage`, `deltas` and `damaged_rows`. */
  listed: obj({
    parentage:    custom<ListedBeside['parentage']>(Array.isArray),
    deltas:       custom<ListedBeside['deltas']>(Array.isArray),
    damaged_rows: custom<readonly DamagedThing[]>(Array.isArray),
  }),
}))

/** What every concrete adapter's report carries beside its act:
 * - `world`   -- the bank and its main gate as the step left them, or null if either is missing or fails its checks
 * - `tracked` -- how the bank, main gate and root box compare with what the ask tracks, or null for an ask that tracks nothing
 * - `read_tc` -- when the step read the datastore: `readTcNow()` in the step, or the datastore's own UUID version 7
 */
export type ActualBeside = Readonly<Z.infer<typeof ActualChecks.beside>>

/** A concrete adapter's report of one atomic step: its act and a `record`, beside what {@link ActualBeside} names.
 * `record` is the Thing found at the scope or, after a write, the Thing it reports writing. `AdapterVaultDB` turns it into the answer's `val` when good, its `dbhas` when refused.
 * A refused report has no error: `AdapterVaultDB` makes it from the act.
 */
export type Actual<ActT extends EX.GoodAct, RecordT = ThingRecord | VoidSentinel> = ActualBeside & (
  | { ok: true,  act: ActT,          record: RecordT }
  | { ok: false, act: EX.RefusedAct, record: RecordT }
)

/** A concrete adapter's report of a get: its `record` is the Thing stored at the scope, or the shell there where none is ({@link GetThingAnswer}). */
export type GotActual = Actual<EX.GotAct>

/** A concrete adapter's report of a write: its `record` is the Thing it reports writing, or unwritten, the Thing stored at the scope, or the shell there where none is. */
export type WroteActual = Actual<EX.PutAct | EX.DelAct>

/** A concrete adapter's report of a listing: the live parent's children as a {@link Kids} value but for the report's own `read_tc`, and what the answer carries beside it.
 * Refused, it has no children, and its `record` is the parent's tombstone, or the shell at a root where nothing is stored, or null.
 */
export type ListThingsActual = ActualBeside & Readonly<ListedBeside> & (
  | Readonly<{ ok: true,  act: 'gotlive', kids: Omit<Kids, 'read_tc'> }>
  | Readonly<{ ok: false, act: 'void' | 'gone', record: ThingRecord | VoidSentinel | null }>
)

/** A concrete adapter's report of a bank's birth: the three roots, written or already stored, or the first refused act with the Thing stored at that root, or its shell where none is. */
export type BirthBankActual = ActualBeside & (
  | { ok: true,  act: 'born' | 'passed', things: BankRoots }
  | { ok: false, act: EX.RefusedAct,     record: ThingRecord | VoidSentinel }
)

/** A change a concrete adapter's `doWatch` passes to `receive`: the changed Thing, raw, and its bank's world as the datastore last read it.
 * Watchers are notified of the Thing alone, with the world's lifetok: a bank or main gate that changed is a change of its own.
 */
export type Received = Pick<ActualBeside, 'world'> & { record: unknown }
// --
