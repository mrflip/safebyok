/** `AdapterVaultDB`'s reading of a datastore's manifest of each verb: each row checked once, the act its tags find in the act tables of `notes/answer-contract.md`, and the answer. */

import { sortBy } from 'es-toolkit'
import { CX, EX, SX, Validator } from 'safebyok-big/internals'
import { BaseThing } from '../models/base-thing'
import { Labelpath, type Lifetok } from '../shapes/primitives'
import { type BoxSparse, type ThingRecord, type ThingScope, type VoidSentinel, PerKindChecks, Shell, ThingChecks } from '../shapes/shapes-thing'
import { BankChecks, BoxChecks, GateChecks, ThingkindChecks } from '../shapes/shapes-thingkinds'
import {
  type AnyAsk, type BirthBankAsk, type GetAsk, type GetWorldAsk, type ListAsk, type StatsAsk, type ThingWatchScope, type Track, type Tracked, type WorldRoots, type WriteAsk, RootLabelpaths, birthPutsOf, loggableAskOf,
} from '../shapes/shapes-asks'
import type { BirthBankAnswer, IncompatibleThing, GetThingAnswer, GetWorldAnswer, KidEntry, Kids, ListThingsAnswer, StatsAnswer, WriteThingAnswer } from '../shapes/shapes-answers'
import {
  type BankObserved, type CheckedBankObserved, type CheckedBirthManifest, type CheckedGetManifest, type CheckedListManifest, type CheckedManifestRows, type CheckedRoots, type CheckedStatsManifest,
  type CheckedWorldManifest, type CheckedWriteManifest, type BirthManifest, type GetManifest, type ListManifest, type ListedChild, type PolicyTag, type Presence, type Refusaltag, type RevseqCmp, type RevtokCmp, type RootTags, type ScribedBirthManifest, type ScribedGetManifest,
  type ScribedListManifest, type ScribedWriteManifest, type StatsManifest, type WorldManifest, type WriteManifest, type WriteTags, ManifestChecks,
} from '../shapes/shapes-manifest'
import { VaultStatsChecks } from '../shapes/shapes-vault-stats'
import * as ManifestTags from './manifest-tags'
import * as Throwers from '../refusals/throwers'

// == [Observations]: checkGetObservations, checkWriteObservations, checkListObservations, checkBirthObservations, checkWorldObservations, checkStatsObservations, checkedRowsOf, checkedRowOf, checkedChildrenOf, checkedRootsOf, checkedRootOf, checkedAncestorOf, checkedBankObservedOf, banktokOrVoidOf, checkedTrackedOf, trackedEntryOf, checkedWatchedOf
// A row that fails its kind's checks is incompatible: a record our code would not write, which refuses `incompatible_row`. A manifest
// that is malformed, or a row that is no object, means the datastore or its concrete adapter is broken, and refuses `storage_issue`.

/** Check a get's manifest in place: its tags, and each row once. */
export function checkGetObservations(ask: GetAsk, manifest: GetManifest): asserts manifest is GetManifest & CheckedGetManifest {
  Object.assign(manifest, { ...checkedRowsOf(ask, manifest), tags: ManifestChecks.getTags.parse(manifest.tags) })
}

/** Check a write's manifest in place: its tags, and each row once. */
export function checkWriteObservations(ask: WriteAsk, manifest: WriteManifest): asserts manifest is WriteManifest & CheckedWriteManifest {
  Object.assign(manifest, { ...checkedRowsOf(ask, manifest), tags: ManifestChecks.writeTags.parse(manifest.tags) })
}

/** Check a listing's manifest in place: its tags, its parent, and where the parent is live, each child once, setting aside those that fail their kind's checks as `incompatible_rows`. */
export function checkListObservations(ask: ListAsk, manifest: ListManifest): asserts manifest is ListManifest & CheckedListManifest {
  const actual = checkedRowOf(ask, manifest.actual)
  const listed = (actual?.am === 'a') ? checkedChildrenOf(ask, manifest.children) : { children: [], incompatible_rows: [] }
  Object.assign(manifest, { ...checkedBankObservedOf(ask, manifest), tags: ManifestChecks.getTags.parse(manifest.tags), actual, ...listed })
}

/** Check a birth's manifest in place: its tags, and each root once. */
export function checkBirthObservations(ask: BirthBankAsk, manifest: BirthManifest): asserts manifest is BirthManifest & CheckedBirthManifest {
  Object.assign(manifest, { ...checkedBankObservedOf(ask, manifest), tags: ManifestChecks.birthTags.parse(manifest.tags), actual: checkedRootsOf(manifest.actual) })
}

/** Check a get of the world's manifest in place: each root once. */
export function checkWorldObservations(ask: GetWorldAsk, manifest: WorldManifest): asserts manifest is WorldManifest & CheckedWorldManifest {
  Object.assign(manifest, { ...checkedBankObservedOf(ask, manifest), actual: checkedRootsOf(manifest.actual) })
}

/** Check an ask for stats' manifest in place: its stats. */
export function checkStatsObservations(ask: StatsAsk, manifest: StatsManifest): asserts manifest is StatsManifest & CheckedStatsManifest {
  Object.assign(manifest, { ...checkedBankObservedOf(ask, manifest), stats: VaultStatsChecks.vaultStats.parse(manifest.stats) })
}

/** The rows of a get's or a write's manifest, each checked once. The ancestor is read only where there is no actual row. */
function checkedRowsOf(ask: GetAsk | WriteAsk, manifest: GetManifest | WriteManifest): CheckedManifestRows {
  const actual = checkedRowOf(ask, manifest.actual)
  return { ...checkedBankObservedOf(ask, manifest), actual, ancestor: (actual === null) ? checkedAncestorOf(ask, manifest.ancestor) : null }
}

/** The raw `row` a datastore read at `labelpath`, checked by its kind but not its address, or null for none. */
function checkedRowOf({ labelpath }: Pick<ThingScope, 'labelpath'>, row: unknown): ThingRecord | null {
  if (row === null) { return null }
  if (! CX.isPlainBag(row)) { throw Throwers.storageIssue() }
  return ThingkindChecks.ofLabelpath(labelpath).stored.parse(row)
}

// A child is checked by the listing's modelkind, not by the labelpath it is listed at: `demandListConsistency` checks that.
/** A listing's raw children, each checked by its kind but not its address: those that pass, and those that fail as `incompatible_rows`. */
function checkedChildrenOf({ userid, banklabel, modelkind }: ListAsk, children: unknown): Pick<CheckedListManifest, 'children' | 'incompatible_rows'> {
  const check = ThingkindChecks.byModelkind[modelkind].stored
  const listed: ListedChild[] = []
  const incompatible_rows: IncompatibleThing[] = []
  for (const { labelpath, raw } of ManifestChecks.children.parse(children)) {
    if (! CX.isPlainBag(raw)) { throw Throwers.storageIssue() }
    const childReport = check.safeParse(raw)
    if (childReport.success) { listed.push({ labelpath, record: childReport.data }) } else { incompatible_rows.push({ userid, banklabel, labelpath, am: 'd' }) }
  }
  return { children: listed, incompatible_rows }
}

/** A birth's or a world's raw roots, each checked by its kind but not its address, null for none. */
function checkedRootsOf(roots: unknown): CheckedRoots {
  const rows = ManifestChecks.roots.parse(roots)
  return { bank: checkedRootOf(BankChecks.stored, rows.bank), gate: checkedRootOf(GateChecks.stored, rows.gate), root: checkedRootOf(BoxChecks.stored, rows.root) }
}

/** The raw root `row`, checked by `check`, or null for none. */
function checkedRootOf<RecordT>(check: Readonly<{ parse: (row: unknown) => RecordT }>, row: unknown): RecordT | null {
  if (row === null) { return null }
  if (! CX.isPlainBag(row)) { throw Throwers.storageIssue() }
  return check.parse(row)
}

// The ancestor is found by a prefix of the scope, not by an address, and the shell is built from it: its address is checked here, where it is read.
/** The nearest row above `scope`, checked by its kind and its address, or null for none. */
function checkedAncestorOf({ userid, banklabel, labelpath }: ThingScope, row: unknown): ThingRecord | null {
  if (row === null) { return null }
  const abovepath = ManifestTags.fieldOf(row, 'labelpath')
  if ((typeof abovepath !== 'string') || (! labelpath.startsWith(`${abovepath}/`))) { throw Throwers.rowOfOtherAddress(['labelpath']) }
  const ancestor: ThingRecord = ThingkindChecks.ofLabelpath(abovepath).stored.parse(row)
  const fieldnames = Validator.disagreeingFieldnames(ancestor, { userid, banklabel, labelpath: abovepath })
  if (fieldnames.length > 0) { throw Throwers.rowOfOtherAddress(fieldnames) }
  return ancestor
}

// A manifest with no banktok is a datastore that forgot it; one whose banktok is no lifetok read an incompatible bank row, whose own check speaks for it.
/** The bank's part of a manifest, checked. */
function checkedBankObservedOf(ask: AnyAsk, manifest: BankObserved): CheckedBankObserved {
  if (! ('banktok' in manifest)) { throw Throwers.banktokMissing() }
  return { banktok: banktokOrVoidOf(manifest.banktok), tracked: checkedTrackedOf(ask, manifest.tracked), read_tc: ManifestChecks.read_tc.parse(manifest.read_tc) }
}

// A banktok is news, never the verdict: one that is no lifetok reads as the void lifetok, and the step's answer stands.
// Unspecified for an incompatible row: notes/wontfix.md.
/** A banktok a datastore read, or the void lifetok where it is no lifetok. */
export function banktokOrVoidOf(banktok: unknown): Lifetok {
  const banktokReport = PerKindChecks.banktok.safeParse(banktok)
  return banktokReport.success ? banktokReport.data : SX.VoidLifeTok
}

/** A manifest's raw `tracked`, each row checked by its kind but not its address. */
function checkedTrackedOf({ track }: AnyAsk, tracked: unknown): Tracked {
  const rows = ManifestChecks.tracked.parse(tracked)
  return {
    bank:                 trackedEntryOf(BankChecks.stored, track.bank, rows['bank']),
    [Labelpath.MainGate]: trackedEntryOf(GateChecks.stored, track[Labelpath.MainGate], rows[Labelpath.MainGate]),
    [Labelpath.RootBox]:  trackedEntryOf(BoxChecks.stored,  track[Labelpath.RootBox], rows[Labelpath.RootBox]),
  }
}

// Nothing stored is at the void revision, as the shell is: a pair there is the same as no row, and differs from any row.
/** `'same'`, or the raw `row` checked by `check`: `'same'` where the datastore says so, or where there is no row and `pair` is at the void revision. */
function trackedEntryOf<RecordT>(check: Readonly<{ parse: (row: unknown) => RecordT }>, pair: Track['bank'], row: unknown): RecordT | 'same' {
  const isVoidSame = (row === null) && (pair.revseq === Shell.Cited.revseq) && (pair.lifepath === Shell.Cited.lifepath)
  if ((row === 'same') || isVoidSame) { return 'same' }
  if (! CX.isPlainBag(row)) { throw Throwers.storageIssue() }
  return check.parse(row)
}

// A watched Thing is read by no address: the datastore hands over what changed. Its labelpath is its own, and its bank the
// watch's, so that one of another bank refuses.
/** The raw Thing in a notice from a watch on `bankScope`, checked by its kind and its address. */
export function checkedWatchedOf(bankScope: ThingWatchScope, raw: unknown): ThingRecord {
  if (! CX.isPlainBag(raw)) { throw Throwers.storageIssue() }
  const scopeReport = ThingChecks.thingScope.safeParse({ ...bankScope, labelpath: raw['labelpath'] })
  if (! scopeReport.success) { throw Throwers.storageIssue() }
  const watched: ThingRecord = ThingkindChecks.ofLabelpath(scopeReport.data.labelpath).stored.parse(raw)
  const fieldnames = Validator.disagreeingFieldnames(watched, scopeReport.data)
  if (fieldnames.length > 0) { throw Throwers.rowOfOtherAddress(fieldnames) }
  return watched
}
// --

// == [Tables]: RevisionGrid, MatchActs, StaleActs, GetActs, ListActs, writeTableActOf, rootActOf, refusaltagOf, policyFailureOf, isGoodAct, isRefusedAct, isWriteAct
// The act tables of `notes/answer-contract.md`, each by the tags that decide it. A write's revisions are judged first, by the
// grid of its *Revisions* section; where they match, or are stale, the act is then found by the op, the presence of the ante
// row, and the flag that applies over it: `ifPresent` over a live row, `ifAbsent` over a tombstone or none.

/** One cell of the put or del table: the act of a write by the flag that applies. */
type FlagActs = Readonly<Record<EX.PutIfAbsent | EX.IfPresent, EX.PutAct | EX.DelAct | EX.RefusedAct>>

// A cited shell's revtok comes only with its revseq, so a `birth` revtok meets a `birth` revseq alone: its other cells are
// those the put table's first matching row finds.
/** How the ante row's revision stands to the cited one, by `revtok_cmp` then `revseq_cmp`.
 * A `match` or a `stale` is looked up again by the flag that applies; any other grade is the act itself.
 */
const RevisionGrid = {
  'birth': { birth: 'match',  eq: 'match',  stale: 'match',  ahead: 'ahead' },
  '=next': { birth: 'retcon', eq: 'retcon', stale: 'retcon', ahead: 'retcon' },
  'eq':    { birth: 'clash',  eq: 'match',  stale: 'clash',  ahead: 'ahead' },
  'neq':   { birth: 'stale',  eq: 'forked', stale: 'stale',  ahead: 'ahead' },
} as const satisfies Record<RevtokCmp, Record<RevseqCmp, 'match' | 'stale' | EX.RefusedAct>>

/** The act of a write whose revision matches the cited one, by its op, the ante row's presence and the flag that applies. */
const MatchActs = {
  put: { void: { add: 'born', fail: 'void' }, gone: { add: 'reborn', fail: 'gone' }, live: { repl: 'replaced', get: 'passed', fail: 'camped' } },
  del: { void: { fail: 'void' },              gone: { fail: 'dubdel' },              live: { repl: 'deleted' } },
} as const satisfies Record<WriteAsk['op'], Record<Presence, Partial<FlagActs>>>

/** The act of a write whose cited revision is stale, by its op, the ante row's presence and the flag that applies. */
const StaleActs = {
  put: { void: { add: 'stale', fail: 'stale' }, gone: { add: 'stale', fail: 'stale' }, live: { repl: 'stale', get: 'passed', fail: 'stale' } },
  del: { void: { fail: 'stale' },               gone: { fail: 'gone' },                live: { repl: 'stale' } },
} as const satisfies Record<WriteAsk['op'], Record<Presence, Partial<FlagActs>>>

/** The act of a get, by the actual row's presence and its `ifAbsent`. */
const GetActs = {
  void: { nil: 'gotvoid', fail: 'void' },
  gone: { nil: 'gotgone', fail: 'gone' },
  live: { nil: 'gotlive', fail: 'gotlive' },
} as const satisfies Record<Presence, Record<GetAsk['ifAbsent'], EX.GotAct | EX.RefusedAct>>

/** The act of a listing, by its parent's presence: only a live parent lists. */
const ListActs = { void: 'void', gone: 'gone', live: 'gotlive' } as const satisfies Record<Presence, 'gotlive' | EX.RefusedAct>

// Each cell is keyed by the flags that reach it: a put's `ifAbsent` is add or fail (`AskChecks.writeAsk`), and a del's flags
// are fixed at fail and repl. The lookup casts a cell to every flag's record, since a checked ask never carries another.
/** The act the put or del table finds from a write's revisions, the ante row's presence and life, and the flag that applies. */
function writeTableActOf(ask: WriteAsk, tags: Pick<WriteTags, 'presence' | 'revtok_cmp' | 'revseq_cmp' | 'lifepath_eq'>): EX.PutAct | EX.DelAct | EX.RefusedAct {
  // The lifepath stands where big's life tok stood: it names the Thing's life, and the lives above it.
  const isLifeSame = tags.lifepath_eq && ((tags.presence === 'live') === (ask.cited.am === 'a'))
  const graded     = RevisionGrid[tags.revtok_cmp][tags.revseq_cmp]
  const revision   = ((! isLifeSame) && (graded === 'match') && (tags.revtok_cmp === 'eq')) ? 'clash' : graded
  const flag       = (tags.presence === 'live') ? ask.ifPresent : ask.ifAbsent
  if (revision === 'match') { return (MatchActs[ask.op][tags.presence] as FlagActs)[flag] }
  if (revision === 'stale') { return (StaleActs[ask.op][tags.presence] as FlagActs)[flag] }
  return revision
}

// A root's put cites the shell, so its revseq is always a birth's. Its lifepath agreement is read only where its revtok is
// the shell's, which a birth's revseq makes a clash already.
/** The act of one root's put in a birth: see the put table in `notes/answer-contract.md`. */
function rootActOf(put: WriteAsk, tags: RootTags): EX.PutAct | EX.DelAct | EX.RefusedAct {
  return writeTableActOf(put, { ...tags, revseq_cmp: 'birth', lifepath_eq: true })
}

/** The name of the phrase a write is refused with where it changes a field fixed for the Thing's life or fails a storage policy `ask` names, or null.
 * A changed born_at wins over a failed policy, and a failed policy over a changed lifetok.
 */
function refusaltagOf(ask: WriteAsk, tags: WriteTags): Refusaltag | null {
  const policyTag = policyFailureOf(ask, tags)
  if (tags.born_at_cmp === 'changed') { return 'BornAtMoved' }
  if (policyTag !== null)             { return policyTag }
  return (tags.lifetok_cmp === 'changed') ? 'LifetokMoved' : null
}

/** The refusal tag of the first storage policy `ask` names that refuses it, or null where each is met. */
function policyFailureOf({ options }: WriteAsk, { policies }: WriteTags): PolicyTag | null {
  const named = options?.policies ?? []
  for (const policy of named) {
    const verdict = policies[policy]
    if (verdict?.ok === false) { return verdict.refusaltag }
  }
  return null
}

/** True when `act` answers good. */
function isGoodAct(act: string): act is EX.GoodAct { return (EX.goodActVals as readonly string[]).includes(act) }

/** True when `act` refuses the ask. */
export function isRefusedAct(act: string): act is EX.RefusedAct { return (EX.refusedActVals as readonly string[]).includes(act) }

/** True when `act` is one a datastore writes the ask's record under. */
export function isWriteAct(act: string): act is EX.WriteAct { return (EX.writeActVals as readonly string[]).includes(act) }
// --

// == [Scribing]: scribeGetAct, scribeWriteAct, scribeListAct, scribeBirthAct
// The act is the tags' alone. `actual` is typed to agree with it, and the verb's consistency function in `three-way.ts`
// refuses a manifest whose row does not.

/** Write onto a get's manifest the act the get table finds from its tags, and whether it answers good. */
export function scribeGetAct(ask: GetAsk, manifest: CheckedGetManifest): asserts manifest is ScribedGetManifest {
  const act = GetActs[manifest.tags.presence][ask.ifAbsent]
  Object.assign(manifest, { ok: isGoodAct(act), act })
}

/** Write onto a write's manifest the act the put or del table finds from its tags, and whether it answers good.
 * Where that act writes but a fixed field or a storage policy forbids it, the act is `policied`, beside the name of the phrase it is refused with.
 */
export function scribeWriteAct(ask: WriteAsk, manifest: CheckedWriteManifest): asserts manifest is ScribedWriteManifest {
  const act        = writeTableActOf(ask, manifest.tags)
  const refusaltag = isWriteAct(act) ? refusaltagOf(ask, manifest.tags) : null
  if (refusaltag !== null) {
    Object.assign(manifest, { ok: false, act: 'policied', refusaltag })
    return
  }

  Object.assign(manifest, { ok: isGoodAct(act), act })
}

/** Write onto a listing's manifest the act its parent's presence finds, and whether it answers good. */
export function scribeListAct(_ask: ListAsk, manifest: CheckedListManifest): asserts manifest is ScribedListManifest {
  const act = ListActs[manifest.tags.presence]
  Object.assign(manifest, { ok: (act === 'gotlive'), act })
}

// The bank's put passes over a live bank, whose gate and root box are stored with it: a live bank without both is a broken
// state. Otherwise a birth writes all three roots or none, so it is born only where no root's put refuses.
/** Write onto a birth's manifest the act the put table finds for its three roots, and whether it answers good: `passed` over a live bank, else the first root's refusal, else `born`. */
export function scribeBirthAct(ask: BirthBankAsk, manifest: CheckedBirthManifest): asserts manifest is ScribedBirthManifest {
  const [bankPut, gatePut, rootPut] = birthPutsOf(ask)
  const { tags, actual } = manifest
  const acts = { bank: rootActOf(bankPut, tags.bank), gate: rootActOf(gatePut, tags.gate), root: rootActOf(rootPut, tags.root) }
  if (acts.bank === 'passed') {
    if ((actual.bank === null) || (actual.gate === null) || (actual.root === null)) { throw Throwers.bankRootsMissing() }
    Object.assign(manifest, { ok: true, act: 'passed' })
    return
  }
  const refusedrootckey = (['bank', 'gate', 'root'] as const).find((rootckey) => isRefusedAct(acts[rootckey]))
  if (refusedrootckey === undefined) { Object.assign(manifest, { ok: true, act: 'born' }) } else { Object.assign(manifest, { ok: false, act: acts[refusedrootckey], refusedrootckey }) }
}
// --

// == [Answers]: getAnswerOf, writeAnswerOf, listAnswerOf, voidParentOf, listedOf, kidsOf, birthAnswerOf, worldAnswerOf, worldRootsOf, statsAnswerOf

/** The answer to a get, stripped from its scribed manifest. Where there is no actual row, its `dbhas` is the shell under the ancestor. */
export function getAnswerOf(ask: GetAsk, manifest: ScribedGetManifest): GetThingAnswer {
  const { banktok, tracked, read_tc } = manifest
  const beside = { ask: loggableAskOf(ask), banktok, tracked, read_tc }
  if (manifest.act === 'gotlive') { return { ok: true, ...beside, act: manifest.act, val: manifest.actual } }
  if (manifest.act === 'gotgone') { return { ok: true, ...beside, act: manifest.act, val: null, dbhas: manifest.actual } }
  if (manifest.act === 'gotvoid') { return { ok: true, ...beside, act: manifest.act, val: null, dbhas: Shell.under(ask, manifest.ancestor) } }
  const err = Throwers.actRefused('vault', manifest.act, { oplabel: 'getThing', ask: beside.ask })
  return { ok: false, ...beside, act: manifest.act, dbhas: manifest.actual ?? Shell.under(ask, manifest.ancestor), err }
}

/** The answer to a write, stripped from its scribed manifest: the actual row as `val`, or refused, as `dbhas`, the shell under the ancestor where there is none. */
export function writeAnswerOf(ask: WriteAsk, manifest: ScribedWriteManifest): WriteThingAnswer {
  const { banktok, tracked, read_tc } = manifest
  const beside = { ask: loggableAskOf(ask), banktok, tracked, read_tc }
  if (manifest.ok) { return { ok: true, ...beside, act: manifest.act, val: manifest.actual } }
  const dbhas = manifest.actual ?? Shell.under(ask, manifest.ancestor)
  if (manifest.act === 'policied') { return { ok: false, ...beside, act: manifest.act, dbhas, err: Throwers.taggedRefusal(ask, manifest) } }
  return { ok: false, ...beside, act: manifest.act, dbhas, err: Throwers.actRefused('vault', manifest.act, { oplabel: 'writeThing', ask: beside.ask }) }
}

/** The answer to a listing, stripped from its scribed manifest: the children of the parent's live life as a {@link Kids} value, the parent as its `parentage`,
 * and each child of that life as its `deltas`, in labelpath order. Refused, its `dbhas` is the actual parent, or where none is, {@link voidParentOf}.
 */
export function listAnswerOf(ask: ListAsk, manifest: ScribedListManifest): ListThingsAnswer {
  const { banktok, tracked, read_tc, incompatible_rows } = manifest
  const beside = { ask: loggableAskOf(ask), banktok, tracked, read_tc }
  if (! manifest.ok) {
    const err = Throwers.listParentNotLive({ oplabel: 'listThings', ask: beside.ask, act: manifest.act })
    return { ok: false, ...beside, act: manifest.act, dbhas: manifest.actual ?? voidParentOf(ask), err, parentage: [], deltas: [], incompatible_rows }
  }
  const parent = manifest.actual
  // A child hangs off its parent's live lifepath: an earlier life's children are not its.
  const lifepathUnder = `${parent.lifepath}/`
  const living = manifest.children.map(({ record }) => record).filter((record) => record.lifepath.startsWith(lifepathUnder))
  const deltas = sortBy(living, [(thing) => thing.labelpath]).map((thing) => listedOf(thing))
  return { ok: true, ...beside, act: manifest.act, val: kidsOf(ask, parent, deltas, read_tc), parentage: [listedOf(parent)], deltas, incompatible_rows }
}

// The listing reads nothing above its parent, so the shell's lives are known only at a root, which has nothing above it.
/** The `dbhas` of a listing whose parent is not stored: the shell at a root, null below one. */
export function voidParentOf(ask: ListAsk): VoidSentinel | null { return (Labelpath.parentOf(ask.labelpath) === '') ? Shell.under(ask, null) : null }

/** `thing` as a listing carries it: a live box's sparse form, or any other Thing whole, a tombstone among them. */
function listedOf(thing: ThingRecord): ThingRecord | BoxSparse {
  return ((thing.am === 'a') && Labelpath.isOfModelkind(thing.labelpath, 'box')) ? BaseThing.sparseOf(thing) as BoxSparse : thing
}

// Object.fromEntries makes each label an own key, `__proto__` among them.
/** The {@link Kids} value of `deltas`, the children of the live `parent` at the listing's scope, read at `read_tc`. */
function kidsOf(ask: ListAsk, parent: ThingRecord, deltas: readonly (ThingRecord | BoxSparse)[], read_tc: Kids['read_tc']): Kids {
  const entryOf = ({ label, lifeseq }: ThingRecord | BoxSparse): [string, KidEntry] => [label, { lifeseq }]
  return {
    modelkind:  'kids',
    parentpath: ask.labelpath,
    parentlife: parent.lifepath,
    items:      Object.fromEntries(deltas.filter((delta) => delta.am === 'a').map((delta) => entryOf(delta))),
    gones:      Object.fromEntries(deltas.filter((delta) => delta.am !== 'a').map((delta) => entryOf(delta))),
    read_tc,
  }
}

/** The answer to a birth, stripped from its scribed manifest: the three actual roots. Refused, its `dbhas` is the root that refused it, or the shell there for none. */
export function birthAnswerOf(ask: BirthBankAsk, manifest: ScribedBirthManifest): BirthBankAnswer {
  const { banktok, tracked, read_tc } = manifest
  const beside = { ask: loggableAskOf(ask), banktok, tracked, read_tc }
  if (manifest.ok) { return { ok: true, ...beside, act: manifest.act, val: manifest.actual } }
  const err = Throwers.actRefused('vault', manifest.act, { oplabel: 'birthBank', ask: beside.ask })
  return { ok: false, ...beside, act: manifest.act, dbhas: worldRootsOf(ask, manifest.actual)[manifest.refusedrootckey], err }
}

/** The answer to a get of the world, stripped from its checked manifest. */
export function worldAnswerOf(ask: GetWorldAsk, manifest: CheckedWorldManifest): GetWorldAnswer {
  const { banktok, tracked, read_tc } = manifest
  return { ok: true, ask: loggableAskOf(ask), banktok, tracked, read_tc, act: 'got', val: worldRootsOf(ask, manifest.actual) }
}

// A root has nothing above it, so where none is stored its shell stands alone.
/** The roots of `ask`'s bank, each the shell at its labelpath where none is stored. */
export function worldRootsOf({ userid, banklabel }: ThingWatchScope, roots: CheckedRoots): WorldRoots {
  const shellAt = (rootckey: keyof CheckedRoots): VoidSentinel => Shell.under({ userid, banklabel, labelpath: RootLabelpaths[rootckey] }, null)
  return { bank: roots.bank ?? shellAt('bank'), gate: roots.gate ?? shellAt('gate'), root: roots.root ?? shellAt('root') }
}

/** The answer to an ask for stats, stripped from its checked manifest. */
export function statsAnswerOf(ask: StatsAsk, manifest: CheckedStatsManifest): StatsAnswer {
  const { banktok, tracked, read_tc } = manifest
  return { ok: true, ask: loggableAskOf(ask), banktok, tracked, read_tc, act: 'got', val: manifest.stats }
}
// --
