/** Classify a listing, a bank's birth, a get of the world and a stats ask against the rows a concrete adapter fetched, by big's act tables in `notes/answer-contract.md`. */

// Scaffolding: until thread 2 (manifest_rest), which gives these verbs manifests, as `manifest-acts.ts` has for get and write.

import { sortBy } from 'es-toolkit'
import { CX, type EX, Phrases as BigPhrases, SX, Validator } from 'safebyok-big/internals'
import { Labelpath, type Lifetok } from '../shapes/primitives'
import type { BirthBankActual, DamagedThing, GetWorldActual, KidEntry, Kids, ListThingsActual, StatsActual } from '../shapes/shapes-answers'
import type { VaultStats } from '../shapes/shapes-vault-stats'
import type { ReadTc } from '../shapes/shapes-vault-event'
import { type BoxSparse, type ThingRecord, type ThingScope, type VoidSentinel, Shell, ThingChecks } from '../shapes/shapes-thing'
import { BankChecks, BoxChecks, GateChecks, ThingkindChecks } from '../shapes/shapes-thingkinds'
import { BaseThing } from '../models/base-thing'
import { type AnyAsk, type BankRoots, type BirthPuts, type GetWorldAsk, type ListAsk, type StatsAsk, type ThingWatchScope, type Track, type Tracked, type WorldRoots, type WriteAsk } from '../shapes/shapes-asks'
import * as ManifestActs from './manifest-acts'
import * as ManifestTags from './manifest-tags'
import * as Throwers from '../refusals/throwers'

// == [Things stored]: RowOfOtherScope, StoredCheck, storedOf, writtenOf, storedThingOf, writtenThingOf, writtenRootsOf, listedThingOf, watchedThingOf, BankRootsFetched, BankFetched, banktokOf
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

/** The Thing stored at `scope`, checked, or null for none. */
export function storedThingOf(scope: ThingScope, raw: unknown): ThingRecord | null { return storedOf<ThingRecord>(ThingkindChecks.ofLabelpath(scope.labelpath).stored, scope, raw) }

/** The Thing the concrete adapter reports writing at `scope`, checked. */
export function writtenThingOf(scope: ThingScope, raw: unknown): ThingRecord { return writtenOf<ThingRecord>(ThingkindChecks.ofLabelpath(scope.labelpath).stored, scope, raw) }

/** The three roots the concrete adapter reports writing for a birth's `puts`, checked. */
export function writtenRootsOf([bankPut, gatePut, rootPut]: BirthPuts, written: Pick<BankRootsFetched, 'bank' | 'gate' | 'root'>): BankRoots {
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

/** The raw bank, main gate and root box a concrete adapter fetched for a bank's birth or a get of its world, each null for none, its {@link TrackedFetched}, and when it read them (`readTcNow`). */
export type BankRootsFetched = Readonly<{ bank: unknown, gate: unknown, root: unknown, tracked: TrackedFetched, read_tc: ReadTc }>

// Every step reads its bank, so when it read the bank is the step's `read_tc`.
/** The raw bank a concrete adapter fetched for an ask's bank, null for none, its {@link TrackedFetched}, and when it read them (`readTcNow`). */
export type BankFetched = Readonly<{ bank: unknown, tracked: TrackedFetched, read_tc: ReadTc }>

// A banktok is news, never the verdict: a bank that fails its checks gives the void lifetok, and the step's answer stands.
// Unspecified for a damaged row: notes/wontfix.md.
/** The lifetok of the bank at `bankScope`, from its raw row: the void lifetok where none is stored or it fails its checks. */
export function banktokOf({ userid, banklabel }: ThingWatchScope, raw: unknown): Lifetok {
  try {
    return storedOf(BankChecks.stored, { userid, banklabel, labelpath: 'bank' }, raw)?.lifetok ?? SX.VoidLifeTok
  } catch { return SX.VoidLifeTok }
}

// --

// == [Tracked]: TrackedFetched, trackedOf, trackedEntryOf
// The concrete adapter compares what an ask tracks with the bank, main gate and root box it fetched, in the step that fetched them.
// `AdapterVaultDB` checks each row the concrete adapter reports in place of 'same'.

/** A concrete adapter's report on the bank, main gate and root box an ask tracks: for each, `'same'` or the raw Thing, null for none. */
export type TrackedFetched = Readonly<{ bank: unknown, [Labelpath.MainGate]: unknown, [Labelpath.RootBox]: unknown }>

/** The report's `tracked`, checked, from the concrete adapter's report for what `ask` tracks. */
export function trackedOf({ userid, banklabel, track }: AnyAsk, fetched: TrackedFetched): Tracked {
  return {
    bank:                  trackedEntryOf(BankChecks.stored, { userid, banklabel, labelpath: 'bank' }, track.bank, fetched.bank),
    [Labelpath.MainGate]:  trackedEntryOf(GateChecks.stored, { userid, banklabel, labelpath: Labelpath.MainGate }, track[Labelpath.MainGate], fetched[Labelpath.MainGate]),
    [Labelpath.RootBox]:   trackedEntryOf(BoxChecks.stored, { userid, banklabel, labelpath: Labelpath.RootBox }, track[Labelpath.RootBox], fetched[Labelpath.RootBox]),
  }
}

// Nothing stored is at the void revision, as the shell is: a pair there is the same as no row, and differs from any row.
/** `'same'`, or the Thing at `scope` checked by `check`: `'same'` where the raw row has the revision `pair` tracks, or where none is stored and `pair` is at the void revision. */
function trackedEntryOf<RecordT extends ThingRecord>(check: StoredCheck<RecordT>, scope: ThingScope, pair: Track['bank'], raw: unknown): RecordT | 'same' {
  const isVoidSame = (raw === null) && (pair.revseq === Shell.Cited.revseq) && (pair.lifepath === Shell.Cited.lifepath)
  return ((raw === 'same') || isVoidSame) ? 'same' : writtenOf(check, scope, raw)
}
// --

// == [Classifying]: ThingsFetched, classifyListThings, listedOf, isChildLabelpath, kidsOf, classifyBirthBank, classifyGetWorld, rootStoredOf, classifyStats
// Each is given the raw bank of the ask's bank, fetched in the same step, and reports its lifetok as the `banktok`, with when it read it;
// a birth and a get of the world are given the bank's three roots, and a birth, where it is born, reports the banktok its bank's put wrote.

/** The raw rows a concrete adapter fetched for a listing: the parent (null for none), and each child one label under it with its labelpath. */
export type ThingsFetched = Readonly<{ parent: unknown, children: readonly Readonly<{ labelpath: Labelpath, raw: unknown }>[] }>

/** Classify a listing against the {@link ThingsFetched} rows: the children of the parent's live life as a {@link Kids} value,
 * the parent as its `parentage`, each child as its `deltas` in labelpath order, and the children that fail their checks. A live box is listed sparse, and any other Thing whole.
 * A parent that is not live has no children, and refuses: `gone` with its tombstone as the `record`, or `void` with the shell at a root, or null below one.
 */
export function classifyListThings(ask: ListAsk, { parent: rawParent, children }: ThingsFetched, bankFetched: BankFetched): ListThingsActual {
  const stored    = storedThingOf(ask, rawParent)
  const beside    = { banktok: banktokOf(ask, bankFetched.bank), tracked: trackedOf(ask, bankFetched.tracked), read_tc: bankFetched.read_tc, parentage: [], deltas: [], damaged_rows: [] }
  // The listing reads nothing above its parent, so the shell's lives are known only at a root, which has nothing above it.
  if (stored === null)    { return { ok: false, act: 'void', record: (Labelpath.parentOf(ask.labelpath) === '') ? Shell.under(ask, null) : null, ...beside } }
  if (stored.am !== 'a')  { return { ok: false, act: 'gone', record: stored, ...beside } }
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
  const deltas = sortBy(living, [(thing) => thing.labelpath]).map((thing) => listedOf(thing))
  return { ...beside, ok: true, act: 'gotlive', kids: kidsOf(ask, stored, deltas), parentage: [listedOf(stored)], deltas, damaged_rows }
}

/** `thing` as a listing carries it: a live box's sparse form, or any other Thing whole, a tombstone among them. */
function listedOf(thing: ThingRecord): ThingRecord | BoxSparse {
  return ((thing.am === 'a') && Labelpath.isOfModelkind(thing.labelpath, 'box')) ? BaseThing.sparseOf(thing) as BoxSparse : thing
}

/** True when `labelpath` is one label under the listing's parent, of the parent's kind. */
function isChildLabelpath(ask: ListAsk, labelpath: Labelpath): boolean {
  const label = labelpath.slice(ask.labelpath.length + 1)
  return labelpath.startsWith(`${ask.labelpath}/`) && (! label.includes('/')) && Labelpath.isOfModelkind(labelpath, ask.modelkind)
}

// Object.fromEntries makes each label an own key, `__proto__` among them.
/** The {@link Kids} value of `deltas`, the children of the live `parent` stored at the listing's scope, but for its `read_tc`, which is the report's. */
function kidsOf(ask: ListAsk, parent: ThingRecord, deltas: readonly (ThingRecord | BoxSparse)[]): Omit<Kids, 'read_tc'> {
  const entryOf = ({ label, lifeseq }: ThingRecord | BoxSparse): [string, KidEntry] => [label, { lifeseq }]
  return {
    modelkind:  'kids',
    parentpath: ask.labelpath,
    parentlife: parent.lifepath,
    items:      Object.fromEntries(deltas.filter((delta) => delta.am === 'a').map((delta) => entryOf(delta))),
    gones:      Object.fromEntries(deltas.filter((delta) => delta.am !== 'a').map((delta) => entryOf(delta))),
  }
}

/** Classify a bank's birth, by its three `puts`, against the raw roots a concrete adapter fetched.
 * Under `born`, `things`, `banktok` and `tracked` are made of the puts' records, for the concrete adapter to write in one step.
 * It then reports them as written, with the banktok, `tracked` and `read_tc` read after the write. Otherwise the answer is {@link unwrittenBirthOf}'s.
 */
export function classifyBirthBank(puts: BirthPuts, fetched: BankRootsFetched): BirthBankActual {
  const unwritten = unwrittenBirthOf(puts, fetched)
  if (unwritten !== null) { return unwritten }
  const [bankPut, gatePut, rootPut] = puts
  const things = { bank: bankPut.record, gate: gatePut.record, root: rootPut.record }
  const tracked = trackedOf(bankPut, ManifestTags.trackedOf(bankPut, { bank: things.bank, [Labelpath.MainGate]: things.gate, [Labelpath.RootBox]: things.root }))
  return { ok: true, act: 'born', banktok: things.bank.lifetok, tracked, read_tc: fetched.read_tc, things }
}

/** Classify a get of the world against the raw roots a concrete adapter fetched: each root checked, or the shell where none is stored. A root that fails its checks refuses the ask. */
export function classifyGetWorld(ask: GetWorldAsk, fetched: BankRootsFetched): GetWorldActual {
  const { userid, banklabel } = ask
  const things: WorldRoots = {
    bank: rootStoredOf(BankChecks.stored, { userid, banklabel, labelpath: 'bank' }, fetched.bank),
    gate: rootStoredOf(GateChecks.stored, { userid, banklabel, labelpath: Labelpath.MainGate }, fetched.gate),
    root: rootStoredOf(BoxChecks.stored,  { userid, banklabel, labelpath: Labelpath.RootBox }, fetched.root),
  }
  return { ok: true, act: 'got', banktok: banktokOf(ask, fetched.bank), tracked: trackedOf(ask, fetched.tracked), read_tc: fetched.read_tc, things }
}

// A root has nothing above it, so where none is stored its shell stands alone.
/** The root stored at `scope`, checked by `check`, or the shell there for none. */
function rootStoredOf<RecordT extends ThingRecord>(check: StoredCheck<RecordT>, scope: ThingScope, raw: unknown): RecordT | VoidSentinel {
  return storedOf(check, scope, raw) ?? Shell.under(scope, null)
}

/** Report the storage stats a concrete adapter measured, beside the raw bank it fetched in the same step. */
export function classifyStats(ask: StatsAsk, fetched: BankFetched, stats: VaultStats): StatsActual {
  return { ok: true, act: 'got', banktok: banktokOf(ask, fetched.bank), tracked: trackedOf(ask, fetched.tracked), read_tc: fetched.read_tc, stats }
}
// --

// == [Steps]: unwrittenBirthOf, birthPutActOf
// A step of `classifyBirthBank`, for a concrete adapter that checks some preconditions itself.

/** The answer to a birth the fetched roots pass or refuse, or null if the act tables let it write.
 * Over a live bank the answer is `passed`, with the three roots stored. Otherwise it is the first root's refusal.
 */
export function unwrittenBirthOf(puts: BirthPuts, fetched: BankRootsFetched): BirthBankActual | null {
  const [bankPut, gatePut, rootPut] = puts
  // The bank's put passes over a live bank, whose gate and root must be stored with it.
  if (birthPutActOf(bankPut, fetched.bank) === 'passed') {
    const bank = storedOf(BankChecks.stored, bankPut, fetched.bank)
    const gate = storedOf(GateChecks.stored, gatePut, fetched.gate)
    const root = storedOf(BoxChecks.stored,  rootPut, fetched.root)
    if ((bank === null) || (gate === null) || (root === null)) { throw Throwers.bankRootsMissing() }
    return { ok: true, act: 'passed', banktok: bank.lifetok, tracked: trackedOf(bankPut, fetched.tracked), read_tc: fetched.read_tc, things: { bank, gate, root } }
  }
  for (const [put, raw] of [[bankPut, fetched.bank], [gatePut, fetched.gate], [rootPut, fetched.root]] as const) {
    const act = birthPutActOf(put, raw)
    if (! ManifestActs.isRefusedAct(act)) { continue }
    // A root has nothing above it, so where none is stored its shell stands alone.
    const record = storedThingOf(put, raw) ?? Shell.under(put, null)
    return { ok: false, act, banktok: banktokOf(bankPut, fetched.bank), tracked: trackedOf(bankPut, fetched.tracked), read_tc: fetched.read_tc, record }
  }
  return null
}

/** The put table's act for one root's put of a birth, over the raw row fetched at its scope. */
function birthPutActOf(put: WriteAsk, raw: unknown): EX.PutAct | EX.RefusedAct { return ManifestActs.putActOf(put, ManifestTags.writeTagsOf(put, raw, false)) }
// --
