/** Classify a vaultDB ask against the Thing stored, by big's act tables in `notes/answer-contract.md`. */

import { sortBy } from 'es-toolkit'
import { v7 as uuidv7 } from 'uuid'
import { CX, EX, Phrases as BigPhrases, SX, Validator } from 'safebyok-big/internals'
import { policyRefusalOf } from './policies'
import { Labelpath } from '../shapes/primitives'
import type { Actual, BirthBankActual, DamagedThing, KidEntry, Kids, ListThingsActual, ReadTc } from './vault-db'
import { type Sparse, type StoredCited, type ThingCited, type ThingRecord, type ThingScope, Shell, ThingChecks } from '../shapes/shapes-thing'
import { BankChecks, BoxChecks, GateChecks, ThingkindChecks } from '../shapes/shapes-thingkinds'
import { Thing } from '../models/thing'
import { type AnyAsk, type BankRoots, type BirthPuts, type GetAsk, type ListAsk, type ThingWatchScope, type Track, type Tracked, type WorldRecord, type WriteAsk } from '../shapes/shapes-asks'
import * as Throwers from '../refusals/throwers'

// == [Columns]: WriteCmpAsk, Presence, presenceOf, RevtokCmp, RevseqCmp, revtokCmpOf, revseqCmpOf, isLifeMismatch
// The columns of big's tables: what is stored, and the two revision comparisons. A revtok names one revision of a Thing,
// so where the ask's matches the stored one, the tables also check that the life and the liveness match.

/** A write ask reduced to what the act tables read: its flags, and the citations in its `cited` and `record`. */
export type WriteCmpAsk = Pick<WriteAsk, 'op' | 'ifAbsent' | 'ifPresent'> & { cited: ThingCited, record: ThingCited }

/** A scope's stored Thing, by liveness: none (`void`), a tombstone (`gone`), or a live Thing. */
type Presence = 'void' | 'gone' | 'live'

/** The presence of `stored`, `'void'` for null. */
function presenceOf(stored: ThingCited | null): Presence {
  if (stored === null) { return 'void' }
  return (stored.am === 'a') ? 'live' : 'gone'
}

/** The stored revtok compared with the ask's.
 * - `'birth'` -- cited the shell, and none is stored
 * - `'=next'` -- the stored Thing already has the revtok this ask would write
 * - `'eq'`    -- cited exactly the revtok stored
 * - `'neq'`   -- anything else
 */
type RevtokCmp = 'birth' | '=next' | 'eq' | 'neq'

/** The ask's cited revseq compared with the stored one.
 * - `'birth'` -- cited the shell
 * - `'eq'`    -- cited exactly the revseq stored
 * - `'stale'` -- cited an older revision: a write has intervened
 * - `'ahead'` -- cited a newer revision, or a Thing where none is stored: an impossible situation
 */
type RevseqCmp = 'birth' | 'eq' | 'stale' | 'ahead'

/** Compare the stored revtok with the ask's: see {@link RevtokCmp}. */
function revtokCmpOf({ cited, record }: WriteCmpAsk, stored: ThingCited | null): RevtokCmp {
  if (stored === null)                 { return (cited.revtok === SX.VoidRevisionTok) ? 'birth' : 'neq' }
  if (stored.revtok === record.revtok) { return '=next' }
  return (stored.revtok === cited.revtok) ? 'eq' : 'neq'
}

/** Compare the ask's cited revseq with the stored one: see {@link RevseqCmp}. */
function revseqCmpOf({ cited }: WriteCmpAsk, stored: ThingCited | null): RevseqCmp {
  if (cited.revseq === SX.VoidRevisionSeq) { return 'birth' }
  if (stored === null)                        { return 'ahead' }
  if (cited.revseq === stored.revseq)      { return 'eq' }
  return (cited.revseq < stored.revseq) ? 'stale' : 'ahead'
}

// The lifepath stands where big's life tok stood: it names the Thing's life, and the lives above it.
/** True when a Thing is stored and differs from the cited one in its life or its liveness. */
function isLifeMismatch({ cited }: WriteCmpAsk, stored: ThingCited | null): boolean {
  return (stored !== null) && ((stored.lifepath !== cited.lifepath) || (stored.am !== cited.am))
}
// --

// == [Tables]: getActOf, putActOf, delActOf, writeActOf, isRefusedAct, isWriteAct

/** Classify a get: see the get table in `notes/answer-contract.md`. */
function getActOf({ ifAbsent }: Pick<GetAsk, 'ifAbsent'>, stored: ThingCited | null): EX.GotAct | 'void' | 'gone' {
  const presence = presenceOf(stored)
  if (presence === 'live') { return 'gotlive' }
  if (presence === 'void') { return (ifAbsent === 'nil') ? 'gotvoid' : 'void' }
  return (ifAbsent === 'nil') ? 'gotgone' : 'gone'
}

/** Classify a write of a live record: see the put table in `notes/answer-contract.md`. The first matching row wins. */
function putActOf(ask: WriteCmpAsk, stored: ThingCited | null): EX.PutAct | EX.RefusedAct {
  const presence  = presenceOf(stored)
  // The policy that applies: `ifPresent` over a live Thing, `ifAbsent` over a tombstone or none.
  const opflag    = (presence === 'live') ? ask.ifPresent : ask.ifAbsent
  const revseqCmp = revseqCmpOf(ask, stored)
  const revtokCmp = revtokCmpOf(ask, stored)
  if (revtokCmp  === '=next')                                                     { return 'retcon' }
  if (revseqCmp  === 'ahead')                                                     { return 'ahead' }
  if ((revtokCmp === 'eq')  && ((revseqCmp !== 'eq') || isLifeMismatch(ask, stored)))  { return 'clash' }
  if ((revtokCmp === 'neq') && (revseqCmp === 'eq'))                              { return 'forked' }
  if (revtokCmp  === 'neq')                                                       { return ((presence === 'live') && (opflag === 'get')) ? 'passed' : 'stale' }
  if (presence   === 'void')                                                      { return (opflag === 'add') ? 'born'   : 'void' }
  if (presence   === 'gone')                                                      { return (opflag === 'add') ? 'reborn' : 'gone' }
  if (opflag     === 'repl')                                                      { return 'replaced' }
  return (opflag === 'get') ? 'passed' : 'camped'
}

/** Classify a write of a tombstone: see the del table in `notes/answer-contract.md`. The first matching row wins. */
function delActOf(ask: WriteCmpAsk, stored: ThingCited | null): EX.DelAct | EX.RefusedAct {
  const presence  = presenceOf(stored)
  const revseqCmp = revseqCmpOf(ask, stored)
  const revtokCmp = revtokCmpOf(ask, stored)
  if (revtokCmp  === '=next')                                                     { return 'retcon' }
  if (revseqCmp  === 'ahead')                                                     { return 'ahead' }
  if ((revtokCmp === 'eq')  && ((revseqCmp !== 'eq') || isLifeMismatch(ask, stored)))  { return 'clash' }
  if ((revtokCmp === 'neq') && (revseqCmp === 'eq'))                              { return 'forked' }
  if (revtokCmp  === 'neq')                                                       { return (presence === 'gone') ? 'gone' : 'stale' }
  if (presence   === 'void')                                                      { return 'void' }
  return (presence === 'gone') ? 'dubdel' : 'deleted'
}

/** Classify a write: a put by the put table, a del by the del table. */
export function writeActOf(ask: WriteCmpAsk, stored: ThingCited | null): EX.PutAct | EX.DelAct | EX.RefusedAct {
  return (ask.op === 'put') ? putActOf(ask, stored) : delActOf(ask, stored)
}

/** True when `act` refuses the ask. */
export function isRefusedAct(act: string): act is EX.RefusedAct { return (EX.refusedActVals as readonly string[]).includes(act) }

/** True when `act` tells the concrete adapter to write the ask's record. */
export function isWriteAct(act: string): act is EX.WriteAct { return (EX.writeActVals as readonly string[]).includes(act) }
// --

// == [Things stored]: RowOfOtherScope, StoredCheck, storedOf, writtenOf, storedCitedOf, storedThingOf, writtenThingOf, writtenRootsOf, listedThingOf, watchedThingOf, BankRootsFetched, WorldFetched, worldOf
// A Thing that fails its kind's checks is damaged, and refuses `damaged_row`. One that is not an object, or a sound one
// stored at another scope than the one asked for, means the datastore or its concrete adapter is broken, and refuses `storage_issue`.

const RowOfOtherScope = { kind: 'storage_issue', message: BigPhrases.rowOfOtherAddress } as const

/** A check of a Thing stored: a kind's, from {@link ThingkindChecks}, or a write's of its preconditions. */
type StoredCheck<RecordT extends object> = Readonly<{ parseConsistent: (raw: unknown, other: object, refusal: typeof RowOfOtherScope) => RecordT }>

/** The Thing stored at `scope`, checked by `check`, or null for none. */
function storedOf<RecordT extends object>(check: StoredCheck<RecordT>, scope: ThingScope, raw: unknown): RecordT | null {
  return (raw === null) ? null : writtenOf(check, scope, raw)
}

/** The Thing the concrete adapter reports writing at `scope`, checked by `check`. */
function writtenOf<RecordT extends object>(check: StoredCheck<RecordT>, { userid, banklabel, labelpath }: ThingScope, raw: unknown): RecordT {
  if (! CX.isPlainBag(raw)) { throw Throwers.storageIssue() }
  return check.parseConsistent(raw, { userid, banklabel, labelpath }, RowOfOtherScope)
}

/** The part of the Thing stored at `scope` that a write's preconditions compare, checked, or null for none. The rest of the Thing is not read. */
export function storedCitedOf(scope: ThingScope, raw: unknown): StoredCited | null { return storedOf(storedCitedChecker, scope, raw) }
const storedCitedChecker = ThingChecks.storedCited.refusingAs('damaged_row')

/** The Thing stored at `scope`, checked, or null for none. */
export function storedThingOf(scope: ThingScope, raw: unknown): ThingRecord | null { return storedOf<ThingRecord>(ThingkindChecks.ofLabelpath(scope.labelpath).stored, scope, raw) }

/** The Thing the concrete adapter reports writing at `scope`, checked. */
export function writtenThingOf(scope: ThingScope, raw: unknown): ThingRecord { return writtenOf<ThingRecord>(ThingkindChecks.ofLabelpath(scope.labelpath).stored, scope, raw) }

/** The three roots the concrete adapter reports writing for a birth's `puts`, checked. */
export function writtenRootsOf([bankPut, gatePut, rootPut]: BirthPuts, written: BankRootsFetched): BankRoots {
  return {
    bank: writtenOf(BankChecks.stored, bankPut, written.bank),
    gate: writtenOf(GateChecks.stored, gatePut, written.gate),
    root: writtenOf(BoxChecks.stored,  rootPut, written.root),
  }
}

/** The Thing listed at `scope`, checked, or null when it fails its checks: a damaged child is set aside, not thrown. */
function listedThingOf(scope: ThingScope, raw: unknown): ThingRecord | null {
  if (! CX.isPlainBag(raw)) { throw Throwers.storageIssue() }
  const thingReport = ThingkindChecks.ofLabelpath(scope.labelpath).stored.safeParse(raw)
  return thingReport.success ? Validator.checkedConsistent(thingReport.data, scope, RowOfOtherScope) : null
}

/** The Thing in a notice from a watch on `bankScope`, checked. */
export function watchedThingOf(bankScope: ThingWatchScope, raw: unknown): ThingRecord {
  if (! CX.isPlainBag(raw)) { throw Throwers.storageIssue() }
  // The labelpath is the record's own; the bank is the watch's, so that a Thing of another bank refuses.
  const scopeReport = ThingChecks.thingScope.safeParse({ ...bankScope, labelpath: raw['labelpath'] })
  if (! scopeReport.success) { throw Throwers.storageIssue() }
  return writtenThingOf(scopeReport.data, raw)
}

/** The raw bank, main gate and root box a concrete adapter fetched for a bank's birth, each null for none, and its {@link TrackedFetched}. */
export type BankRootsFetched = Readonly<{ bank: unknown, gate: unknown, root: unknown, tracked?: TrackedFetched }>

/** The raw bank and main gate a concrete adapter fetched for an ask's bank, each null for none, and its {@link TrackedFetched}. */
export type WorldFetched = Readonly<{ bank: unknown, maingate: unknown, tracked?: TrackedFetched }>

// A world is news, never the verdict: a bank or main gate that fails its checks leaves it null, and the step's answer stands.
/** The world of the bank at `bankScope`, from its raw `fetched` bank and main gate; null where either is missing or fails its checks. */
export function worldOf({ userid, banklabel }: ThingWatchScope, fetched: WorldFetched): WorldRecord | null {
  try {
    const bank     = storedOf(BankChecks.stored, { userid, banklabel, labelpath: 'bank' }, fetched.bank)
    const maingate = storedOf(GateChecks.stored, { userid, banklabel, labelpath: Labelpath.MainGate }, fetched.maingate)
    return ((bank === null) || (maingate === null)) ? null : { ...bank, maingate }
  } catch { return null }
}
// --

// == [Tracked]: TrackedFetched, TrackedRows, trackedFetchedOf, trackedFieldOf, trackedEntryOf
// The concrete adapter compares what an ask tracks with the bank, main gate and root box it fetched, in the step that fetched them.
// `AdapterVaultDB` checks each row the concrete adapter reports in place of 'same'.

/** A concrete adapter's report on the bank, main gate and root box an ask tracks: for each, `'same'` or the raw Thing. Null or left out for an ask that tracks nothing. */
export type TrackedFetched = Readonly<{ bank: unknown, [Labelpath.MainGate]: unknown, [Labelpath.RootBox]: unknown }> | null

/** The raw bank, main gate and root box a concrete adapter fetched, each null for none, under its key in a `track`. */
export type TrackedRows = Readonly<{ bank: unknown, [Labelpath.MainGate]: unknown, [Labelpath.RootBox]: unknown }>

/** The {@link TrackedFetched} report of what `ask` tracks against the raw rows a concrete adapter fetched, for one that compares in TypeScript. */
export function trackedFetchedOf({ track }: AnyAsk, rows: TrackedRows): TrackedFetched {
  if (track === undefined) { return null }
  return {
    bank:                 trackedRawOf(track.bank, rows.bank),
    [Labelpath.MainGate]: trackedRawOf(track[Labelpath.MainGate], rows[Labelpath.MainGate]),
    [Labelpath.RootBox]:  trackedRawOf(track[Labelpath.RootBox], rows[Labelpath.RootBox]),
  }
}

/** `'same'` where `raw` has the revseq and lifepath of `pair`, else `raw`. */
function trackedRawOf(pair: Track['bank'], raw: unknown): unknown {
  return (CX.isPlainBag(raw) && (raw['revseq'] === pair.revseq) && (raw['lifepath'] === pair.lifepath)) ? 'same' : raw
}

/** The answer's `tracked`, checked, as a field to spread into it, from the concrete adapter's report for the bank at `bankScope`: none for an ask that tracks nothing. */
export function trackedFieldOf({ userid, banklabel }: ThingWatchScope, fetched: TrackedFetched | undefined): { tracked?: Tracked } {
  if ((fetched === null) || (fetched === undefined)) { return {} }
  return { tracked: {
    bank:                  trackedEntryOf(BankChecks.stored, { userid, banklabel, labelpath: 'bank' }, fetched.bank),
    [Labelpath.MainGate]:  trackedEntryOf(GateChecks.stored, { userid, banklabel, labelpath: Labelpath.MainGate }, fetched[Labelpath.MainGate]),
    [Labelpath.RootBox]:   trackedEntryOf(BoxChecks.stored, { userid, banklabel, labelpath: Labelpath.RootBox }, fetched[Labelpath.RootBox]),
  } }
}

/** `'same'`, or the Thing at `scope` checked by `check`. */
function trackedEntryOf<RecordT extends ThingRecord>(check: StoredCheck<RecordT>, scope: ThingScope, raw: unknown): RecordT | 'same' {
  return (raw === 'same') ? 'same' : writtenOf(check, scope, raw)
}
// --

// == [Classifying]: classifyGetThing, classifyWriteThing, ThingsFetched, classifyListThings, isChildLabelpath, kidsOf, readTcNow, readTcOf, classifyBirthBank
// Each is given the raw bank and main gate of the ask's bank, fetched in the same step, and reports them as its `world`;
// a birth is given the bank's three roots, and where it is born, reports the world its puts wrote.

/** Classify a get against the raw Thing a concrete adapter fetched at its scope, null for none. */
export function classifyGetThing(ask: GetAsk, raw: unknown, worldFetched: WorldFetched): Actual<EX.GotAct> {
  const stored = storedThingOf(ask, raw)
  const act    = getActOf(ask, stored)
  const world  = worldOf(ask, worldFetched)
  const beside = trackedFieldOf(ask, worldFetched.tracked)
  return isRefusedAct(act) ? { ok: false, act, world, record: stored, ...beside } : { ok: true, act, world, record: stored, ...beside }
}

/** Classify a write against the raw Thing a concrete adapter fetched at its scope, null for none.
 * Where the write would replace a live Thing, it also checks the born_at and the storage policies, and where it puts or deletes
 * the bank over a live bank, the lifetok. Under a write act, `record` is `ask.record`: the concrete adapter writes it, then reports the
 * Thing it wrote and the world after the write.
 */
export function classifyWriteThing(ask: WriteAsk, raw: unknown, worldFetched: WorldFetched): Actual<EX.PutAct | EX.DelAct> {
  const stored = storedCitedOf(ask, raw)
  const act    = writeActOf(ask, stored)
  if (! isWriteAct(act))  { return unwrittenWriteOf(raw, { ask, act, world: worldFetched }) }
  if (act === 'replaced') {
    demandBornAtKept(ask, raw)
    demandPolicies(ask, raw)
  }
  demandLifetokKept(ask, raw)
  return { ok: true, act, world: worldOf(ask, worldFetched), record: ask.record, ...trackedFieldOf(ask, worldFetched.tracked) }
}

/** The raw rows a concrete adapter fetched for a listing: the parent (null for none), each child one label under it with its labelpath, and when it read them ({@link readTcNow}). */
export type ThingsFetched = Readonly<{ parent: unknown, children: readonly Readonly<{ labelpath: Labelpath, raw: unknown }>[], read_tc: unknown }>

/** Classify a listing against the {@link ThingsFetched} rows: the parent's get act, the children of its live life as a {@link Kids} value,
 * the parent as its `parentage`, each child sparse as its `deltas` in labelpath order, and the children that fail their checks.
 */
export function classifyListThings(ask: ListAsk, { parent: rawParent, children, read_tc: rawReadTc }: ThingsFetched, worldFetched: WorldFetched): ListThingsActual {
  const stored    = storedThingOf(ask, rawParent)
  const act       = getActOf(ask, stored)
  const read_tc   = readTcOf(rawReadTc)
  const parentage = (stored === null) ? [] : [Thing.sparseOf(stored)]
  const world     = worldOf(ask, worldFetched)
  const beside    = trackedFieldOf(ask, worldFetched.tracked)
  if (isRefusedAct(act))  { return { ok: false, act, world, parentage, deltas: [], damaged_rows: [], ...beside } }
  // A tombstone or none has no children.
  if (stored?.am !== 'a') { return { ok: true, act, world, kids: kidsOf(ask, stored, [], read_tc), parentage, deltas: [], damaged_rows: [], ...beside } }
  const { userid, banklabel } = ask
  // A child hangs off its parent's live lifepath: an earlier life's children are not its.
  const lifepathUnder = `${stored.lifepath}/`
  const living: ThingRecord[] = []
  const damaged_rows: DamagedThing[] = []
  for (const { labelpath, raw } of children) {
    if (! isChildLabelpath(ask, labelpath)) { throw Throwers.rowOfOtherAddress(['labelpath']) }
    const child = listedThingOf({ userid, banklabel, labelpath }, raw)
    if (child === null) { damaged_rows.push({ userid, banklabel, labelpath, am: 'd' }) } else if (child.lifepath.startsWith(lifepathUnder)) { living.push(child) }
  }
  const deltas = sortBy(living, [(thing) => thing.labelpath]).map((thing) => Thing.sparseOf(thing))
  return { ok: true, act, world, kids: kidsOf(ask, stored, deltas, read_tc), parentage, deltas, damaged_rows, ...beside }
}

/** True when `labelpath` is one label under the listing's parent, of the parent's kind. */
function isChildLabelpath(ask: ListAsk, labelpath: Labelpath): boolean {
  const label = labelpath.slice(ask.labelpath.length + 1)
  return labelpath.startsWith(`${ask.labelpath}/`) && (! label.includes('/')) && Labelpath.isOfModelkind(labelpath, ask.modelkind)
}

// Object.fromEntries makes each label an own key, `__proto__` among them.
/** The {@link Kids} value of `deltas`, the children of `parent` stored at the listing's scope, null for none. */
function kidsOf(ask: ListAsk, parent: ThingRecord | null, deltas: readonly Sparse<ThingRecord>[], read_tc: ReadTc): Kids {
  const entryOf = ({ label, lifeseq }: Sparse<ThingRecord>): [string, KidEntry] => [label, { lifeseq }]
  return {
    modelkind:  'kids',
    parentpath: ask.labelpath,
    parentlife: parent?.lifepath ?? Shell.VoidLifeseq,
    items:      Object.fromEntries(deltas.filter((delta) => delta.am === 'a').map((delta) => entryOf(delta))),
    gones:      Object.fromEntries(deltas.filter((delta) => delta.am !== 'a').map((delta) => entryOf(delta))),
    read_tc,
  }
}

// A concrete adapter with a clock of its own in the statement that reads may report its own UUID version 7 in place of this one.
/** A {@link ReadTc} made now, for a concrete adapter to report as the `read_tc` of a listing it reads in the same step. */
export function readTcNow(): ReadTc { return uuidv7() }

/** The `read_tc` a concrete adapter reported, checked as a UUID version 7. Throws `storage_issue` for anything else. */
function readTcOf(raw: unknown): ReadTc {
  if ((typeof raw !== 'string') || (! ReadTcPattern.test(raw))) { throw Throwers.storageIssue() }
  return raw
}
const ReadTcPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** Classify a bank's birth, by its three `puts`, against the raw roots a concrete adapter fetched.
 * Under `born`, `things` and `world` are made of the puts' records, for the concrete adapter to write in one step. It then reports
 * them as written, with any `tracked` read after the write. Otherwise the answer is {@link unwrittenBirthOf}'s.
 */
export function classifyBirthBank(puts: BirthPuts, fetched: BankRootsFetched): BirthBankActual {
  const unwritten = unwrittenBirthOf(puts, fetched)
  if (unwritten !== null) { return unwritten }
  const [bankPut, gatePut, rootPut] = puts
  const things = { bank: bankPut.record, gate: gatePut.record, root: rootPut.record }
  return { ok: true, act: 'born', world: { ...things.bank, maingate: things.gate }, things }
}
// --

// == [Steps]: unwrittenWriteOf, UnwrittenWrite, demandBornAtKept, demandLifetokKept, demandPolicies, unwrittenBirthOf
// The steps of the classifiers above, for a concrete adapter that checks some preconditions itself to call in its own order.

/** The answer to a write the act tables leave unwritten, a refusal or `passed`, from the raw Thing a concrete adapter fetched at its scope.
 * `world` is the raw world the concrete adapter fetched beside it.
 */
export function unwrittenWriteOf(raw: unknown, { ask, act, world }: UnwrittenWrite): Actual<EX.PutAct | EX.DelAct> {
  const record  = storedThingOf(ask, raw)
  const worldRecord = worldOf(ask, world)
  const beside  = trackedFieldOf(ask, world.tracked)
  return isRefusedAct(act) ? { ok: false, act, world: worldRecord, record, ...beside } : { ok: true, act, world: worldRecord, record, ...beside }
}

/** An unwritten write, for {@link unwrittenWriteOf}: the write, the act the act tables found, and the raw world the concrete adapter fetched. */
export type UnwrittenWrite = Readonly<{ ask: WriteAsk, act: Exclude<EX.PutAct | EX.DelAct | EX.RefusedAct, EX.WriteAct>, world: WorldFetched }>

/** Throw `bad_record` unless `ask` leaves unchanged the born_at of the live Thing it replaces, the raw Thing a concrete adapter fetched at its scope. */
export function demandBornAtKept(ask: WriteAsk, raw: unknown): void {
  if (ask.record.born_at === storedCitedOf(ask, raw)?.born_at) { return }
  throw Throwers.bornAtNotStored(storedThingOf(ask, raw))
}

/** Throw `bad_record` if `ask` writes the bank, a put or a del, over a live bank stored with another lifetok, the raw Thing a concrete adapter fetched at its scope.
 * A write over a tombstone or none is a birth, and may carry any lifetok.
 */
export function demandLifetokKept(ask: WriteAsk, raw: unknown): void {
  if ((ask.modelkind !== 'bank') || (storedCitedOf(ask, raw)?.am !== 'a')) { return }
  const stored = storedLifetokChecker.parse(raw)
  if (ask.record.lifetok === stored.lifetok) { return }
  throw Throwers.lifetokNotStored(storedThingOf(ask, raw))
}
const storedLifetokChecker = BankChecks.storedLifetok.refusingAs('damaged_row')

/** Throw `gate_issue` if a storage policy `ask` names refuses it over `raw`, the live gate it replaces. Only a gate's writes name storage policies. */
export function demandPolicies(ask: WriteAsk, raw: unknown): void {
  if ((ask.modelkind !== 'gate') || ((ask.options?.policies.length ?? 0) === 0)) { return }
  const why = policyRefusalOf(ask, storedWayinsChecker.parse(raw).wayins)
  if (why !== null) { throw Throwers.gateIssue(storedThingOf(ask, raw), why) }
}
const storedWayinsChecker = GateChecks.storedWayins.refusingAs('damaged_row')

/** The answer to a birth the fetched roots pass or refuse, or null if the act tables let it write.
 * Over a live bank the answer is `passed`, with the three roots stored. Otherwise it is the first root's refusal.
 */
export function unwrittenBirthOf(puts: BirthPuts, fetched: BankRootsFetched): BirthBankActual | null {
  const [bankPut, gatePut, rootPut] = puts
  // The bank's put passes over a live bank, whose gate and root must be stored with it.
  if (putActOf(bankPut, storedCitedOf(bankPut, fetched.bank)) === 'passed') {
    const bank = storedOf(BankChecks.stored, bankPut, fetched.bank)
    const gate = storedOf(GateChecks.stored, gatePut, fetched.gate)
    const root = storedOf(BoxChecks.stored,  rootPut, fetched.root)
    if ((bank === null) || (gate === null) || (root === null)) { throw Throwers.bankRootsMissing() }
    return { ok: true, act: 'passed', world: { ...bank, maingate: gate }, things: { bank, gate, root }, ...trackedFieldOf(bankPut, fetched.tracked) }
  }
  for (const [put, raw] of [[bankPut, fetched.bank], [gatePut, fetched.gate], [rootPut, fetched.root]] as const) {
    const act = putActOf(put, storedCitedOf(put, raw))
    if (isRefusedAct(act)) { return { ok: false, act, world: worldOf(bankPut, { bank: fetched.bank, maingate: fetched.gate }), record: storedThingOf(put, raw), ...trackedFieldOf(bankPut, fetched.tracked) } }
  }
  return null
}
// --
