/** The answers a vaultDB's verbs resolve. */

import type { EX, Errors } from 'safebyok-big/internals'
import type { Labelpath, Lifepath, Lifeseq, Lifetok } from './primitives'
import type { ThingRecord, ThingScope, VoidSentinel } from './shapes-thing'
import type { SparseOf, TombstoneOf } from './shapes-sealers'
import type { BankRoots, LoggableAsk, Tracked, WorldRoots } from './shapes-asks'
import type { ReadTc } from './shapes-vault-event'
import type { VaultStats } from './shapes-vault-stats'

// == [Answers]: GoodAnswer, BadAct, BadAnswer, Answer, GetThingAnswer, WriteThingAnswer, IncompatibleThing, KidEntry, Kids, ListedBeside, ListThingsAnswer, BirthBankAnswer, GetWorldAnswer, StatsAnswer
// No check reads an answer whole: `AdapterVaultDB` makes each of parts it has checked, and a reader checks each record it
// keeps where a Thing takes it.

/** A vaultDB verb's good answer: its `val`, the `act` that says what the datastore did, the loggable part of its `ask`, and when its step read the datastore (`read_tc`).
 * `banktok` is the lifetok of the bank as the step left it, or the void lifetok where none is stored or it fails its checks.
 * `tracked` says for each of the bank, its main gate and its root box whether it is still at the revision the ask tracks ({@link Tracked}).
 */
export type GoodAnswer<ValT, ActT extends EX.GoodAct> = { ok: true, ask: LoggableAsk, act: ActT, banktok: Lifetok, tracked: Tracked, read_tc: ReadTc, val: ValT }

/** A refused answer's act: big's, or `policied` for a write that a storage policy, a changed born_at or a changed lifetok refuses. */
export type BadAct = EX.BadAct | 'policied'

/** A vaultDB verb's refused answer: its `err` and `act`, the actual Thing (`dbhas`), the loggable part of its `ask`, and when its step read the datastore (`read_tc`).
 * Where nothing is stored at the ask's scope, `dbhas` is the shell there, under the nearest Thing stored above it (see {@link GetThingAnswer}).
 * `banktok` is as for a {@link GoodAnswer}.
 * If the verb threw, `banktok` is the void lifetok, `tracked` is `'unread'`, `read_tc` is when it was refused, and `dbhas` is the Thing the refusal names, or null where it names none.
 */
export type BadAnswer<DbhasT = ThingRecord | VoidSentinel | null> = { ok: false, ask: LoggableAsk, act: BadAct, banktok: Lifetok, tracked: Tracked | 'unread', read_tc: ReadTc, dbhas: DbhasT, err: Errors.VaultError }

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
 * Refused, its `dbhas` is the actual Thing, or where none is, the shell there, as for {@link GetThingAnswer}.
 */
export type WriteThingAnswer = Answer<ThingRecord, EX.PutAct | EX.DelAct>

/** A child Thing that fails its kind's checks: its scope, and `am: 'd'`. */
export type IncompatibleThing = Readonly<ThingScope & { am: 'd' }>

/** One child in a {@link Kids} value: the lifeseq of its life as the list read it. */
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
 * - `incompatible_rows` -- each child that fails its kind's checks
 */
export type ListedBeside<RecordT extends ThingRecord = ThingRecord> = {
  parentage:    readonly (RecordT | SparseOf<RecordT>)[]
  deltas:       readonly (RecordT | SparseOf<RecordT>)[]
  incompatible_rows: readonly IncompatibleThing[]
}

/** The answer to `tryListThings`: the live parent's children as a {@link Kids} value, whose `read_tc` is the answer's.
 * A parent that is not live refuses `absent_thing`, `gone` with its tombstone as `dbhas`, or `void` with the shell at a root
 * and null below one. If the verb threw, `dbhas` is null.
 */
export type ListThingsAnswer<RecordT extends ThingRecord = ThingRecord> =
  | (GoodAnswer<Kids, 'gotlive'> & ListedBeside<RecordT>)
  | (BadAnswer & ListedBeside<RecordT>)

/** The answer to `tryBirthBank`: the three roots written (`born`), or found already stored (`passed`). Refused, its `dbhas` is the actual root that refused it. */
export type BirthBankAnswer = Answer<BankRoots, 'born' | 'passed'>

/** The answer to `tryGetWorld`: the bank's three roots ({@link WorldRoots}), under the act `got`. Only a verb that threw refuses it. */
export type GetWorldAnswer = Answer<WorldRoots, 'got'>

/** The answer to `tryStats`: the bank's storage stats ({@link VaultStats}), under the act `got`. Only a verb that threw refuses it. */
export type StatsAnswer = Answer<VaultStats, 'got'>
// --
