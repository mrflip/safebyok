/** Classify a vaultDB ask against the Thing stored, by big's act tables in `notes/answer-contract.md`. */

import { sortBy } from 'es-toolkit'
import { CX, EX, Errors, Phrases as BigPhrases, SX, Throwers, Validator } from 'safebyok-big/internals'
import { BankRootsMissing, BornAtNotStored } from '../phrases'
import { PoliciedMeta, gateIssue, policyRefusalOf } from './policies'
import type { Actual, BirthBankActual, DamagedThing, ListThingsActual } from './vault-db'
import {
  type BankRoots, type BirthPuts, type GetThingAsk, type ListThingsAsk, type StoredCited, type Thing, type ThingCited, type ThingScope, type ThingWatchScope, type Track,
  type Tracked, type WorldRecord, type WriteThingAsk,
  KindChecks, MainGateLabelpath, isLabelpathOfKind, kindChecksOf, sparseOf, storedCited, storedWayins, thingScope,
} from './shapes-thing'

// == [Columns]: WriteCmpAsk, Presence, presenceOf, RevtokCmp, RevseqCmp, revtokCmpOf, revseqCmpOf, isLifeOff
// The columns of big's tables: what is stored, and the two revision comparisons. A revtok names one revision of a Thing,
// so where the ask's matches the stored one, the tables also check that the life and the liveness match.

/** A write ask, as the tables read it: its flags, and what its two records cite. */
type WriteCmpAsk = Pick<WriteThingAsk, 'op' | 'ifAbsent' | 'ifPresent'> & { cited: ThingCited, record: ThingCited }

/** What is stored at a scope: no Thing, a tombstone, or a live Thing. */
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

/** The stored revtok compared with the ask's, as {@link RevtokCmp} reads. */
function revtokCmpOf({ cited, record }: WriteCmpAsk, stored: ThingCited | null): RevtokCmp {
  if (stored === null)                 { return (cited.revtok === SX.VoidRevisionTok) ? 'birth' : 'neq' }
  if (stored.revtok === record.revtok) { return '=next' }
  return (stored.revtok === cited.revtok) ? 'eq' : 'neq'
}

/** The ask's cited revseq compared with the stored one, as {@link RevseqCmp} reads. */
function revseqCmpOf({ cited }: WriteCmpAsk, stored: ThingCited | null): RevseqCmp {
  if (cited.revseq === SX.VoidRevisionSeq) { return 'birth' }
  if (stored === null)                        { return 'ahead' }
  if (cited.revseq === stored.revseq)      { return 'eq' }
  return (cited.revseq < stored.revseq) ? 'stale' : 'ahead'
}

// The lifepath stands where big's life tok stood: it names the Thing's life, and the lives above it.
/** True when a Thing is stored, and the one cited differs from it in its life or its liveness. */
function isLifeOff({ cited }: WriteCmpAsk, stored: ThingCited | null): boolean {
  return (stored !== null) && ((stored.lifepath !== cited.lifepath) || (stored.am !== cited.am))
}
// --

// == [Tables]: getActOf, putActOf, delActOf, writeActOf, isRefusedAct, isWriteAct

/** Classify a get: see the get table in `notes/answer-contract.md`. */
function getActOf({ ifAbsent }: Pick<GetThingAsk, 'ifAbsent'>, stored: ThingCited | null): EX.GotAct | 'void' | 'gone' {
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
  if ((revtokCmp === 'eq')  && ((revseqCmp !== 'eq') || isLifeOff(ask, stored)))  { return 'clash' }
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
  if ((revtokCmp === 'eq')  && ((revseqCmp !== 'eq') || isLifeOff(ask, stored)))  { return 'clash' }
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

/** True when `act` tells the store to write the ask's record. */
export function isWriteAct(act: string): act is EX.WriteAct { return (EX.writeActVals as readonly string[]).includes(act) }
// --

// == [Things stored]: RowOfOtherScope, StoredCheck, storedOf, writtenOf, storedCitedOf, storedThingOf, writtenThingOf, writtenRootsOf, listedThingOf, watchedThingOf, BankRootsFetched, WorldFetched, worldOf
// A Thing that fails its kind's checks is damaged, and refuses `damaged_row`. One that is not an object, or a sound one
// stored at another scope than the one asked for, means the store or its adapter is broken, and refuses `storage_issue`.

const RowOfOtherScope = { kind: 'storage_issue', message: BigPhrases.rowOfOtherAddress } as const

/** A check of a Thing stored: a kind's, from {@link KindChecks}, or a write's of its preconditions. */
type StoredCheck<RecordT extends object> = Readonly<{ parseConsistent: (raw: unknown, other: object, refusal: typeof RowOfOtherScope) => RecordT }>

/** The Thing stored at `scope`, checked by `check`, or null for none. */
function storedOf<RecordT extends object>(check: StoredCheck<RecordT>, scope: ThingScope, raw: unknown): RecordT | null {
  return (raw === null) ? null : writtenOf(check, scope, raw)
}

/** The Thing the store reports writing at `scope`, checked by `check`. */
function writtenOf<RecordT extends object>(check: StoredCheck<RecordT>, { userid, banklabel, labelpath }: ThingScope, raw: unknown): RecordT {
  if (! CX.isPlainBag(raw)) { throw Throwers.storageIssue() }
  return check.parseConsistent(raw, { userid, banklabel, labelpath }, RowOfOtherScope)
}

const StoredCitedCheck = storedCited.refusingAs('damaged_row')

/** What a write reads of the Thing stored at `scope`, checked, or null for none: just what its preconditions compare, the rest unread. */
export function storedCitedOf(scope: ThingScope, raw: unknown): StoredCited | null { return storedOf(StoredCitedCheck, scope, raw) }

/** The Thing stored at `scope`, checked, or null for none. */
export function storedThingOf(scope: ThingScope, raw: unknown): Thing | null { return storedOf<Thing>(kindChecksOf(scope.labelpath).stored, scope, raw) }

/** The Thing the store reports writing at `scope`, checked. */
export function writtenThingOf(scope: ThingScope, raw: unknown): Thing { return writtenOf<Thing>(kindChecksOf(scope.labelpath).stored, scope, raw) }

/** The bank's three roots the store reports writing for a birth's `puts`, checked. */
export function writtenRootsOf([bankPut, gatePut, rootPut]: BirthPuts, written: BankRootsFetched): BankRoots {
  return {
    bank: writtenOf(KindChecks.bank.stored, bankPut, written.bank),
    gate: writtenOf(KindChecks.gate.stored, gatePut, written.gate),
    root: writtenOf(KindChecks.box.stored,  rootPut, written.root),
  }
}

/** The Thing listed at `scope`, checked, or null when it fails its checks: a damaged child is set aside, not thrown. */
function listedThingOf(scope: ThingScope, raw: unknown): Thing | null {
  if (! CX.isPlainBag(raw)) { throw Throwers.storageIssue() }
  const parsed = kindChecksOf(scope.labelpath).stored.safeParse(raw)
  return parsed.success ? Validator.checkedConsistent(parsed.data, scope, RowOfOtherScope) : null
}

/** The Thing a watch on `bankScope` heard, checked. */
export function watchedThingOf(bankScope: ThingWatchScope, raw: unknown): Thing {
  if (! CX.isPlainBag(raw)) { throw Throwers.storageIssue() }
  // The labelpath is the record's own; the bank is the watch's, so that a Thing of another bank refuses.
  const scope = thingScope.safeParse({ ...bankScope, labelpath: raw['labelpath'] })
  if (! scope.success) { throw Throwers.storageIssue() }
  return writtenThingOf(scope.data, raw)
}

/** What a store fetched of a bank's three roots: the raw bank, main gate and root box, each null for none, and its {@link TrackedFetched}. */
export type BankRootsFetched = Readonly<{ bank: unknown, gate: unknown, root: unknown, tracked?: TrackedFetched }>

/** What a store fetched of a bank's world: the raw bank and main gate, each null for none, and its {@link TrackedFetched}. */
export type WorldFetched = Readonly<{ bank: unknown, maingate: unknown, tracked?: TrackedFetched }>

// A world is news, never the verdict: a bank or main gate that fails its checks leaves it null, and the step's answer stands.
/** The world of the bank at `bankScope`, from its raw `fetched` bank and main gate; null where either is missing or fails its checks. */
export function worldOf({ userid, banklabel }: ThingWatchScope, fetched: WorldFetched): WorldRecord | null {
  try {
    const bank     = storedOf(KindChecks.bank.stored, { userid, banklabel, labelpath: 'bank' }, fetched.bank)
    const maingate = storedOf(KindChecks.gate.stored, { userid, banklabel, labelpath: MainGateLabelpath }, fetched.maingate)
    return ((bank === null) || (maingate === null)) ? null : { ...bank, maingate }
  } catch { return null }
}
// --

// == [Tracked]: TrackedFetched, trackedFetchedOf, trackedFieldOf, trackedEntryOf
// The store compares what an ask tracks with the bank and main gate it fetched, in the step that fetched them. The adapter
// checks each row the store reports in place of 'same'.

/** What a store reports of the bank and main gate an ask tracks: for each, `'same'` or the raw Thing. Null or left out for an ask that tracks nothing. */
export type TrackedFetched = Readonly<{ bank: unknown, [MainGateLabelpath]: unknown }> | null

/** What a store that compares in TypeScript reports of `track`, against the raw bank and main gate it fetched. */
export function trackedFetchedOf(track: Track | undefined, { bank, maingate }: WorldFetched): TrackedFetched {
  if (track === undefined) { return null }
  return { bank: trackedRawOf(track.bank, bank), [MainGateLabelpath]: trackedRawOf(track[MainGateLabelpath], maingate) }
}

/** `'same'` where `raw` has the revseq and lifepath of `pair`, else `raw`. */
function trackedRawOf(pair: Track['bank'], raw: unknown): unknown {
  return (CX.isPlainBag(raw) && (raw['revseq'] === pair.revseq) && (raw['lifepath'] === pair.lifepath)) ? 'same' : raw
}

/** The answer's `tracked`, as a field to spread into it, from what the store reports for the bank at `bankScope`: none for an ask that tracks nothing. */
export function trackedFieldOf({ userid, banklabel }: ThingWatchScope, fetched: TrackedFetched | undefined): { tracked?: Tracked } {
  if ((fetched === null) || (fetched === undefined)) { return {} }
  return { tracked: {
    bank:                 trackedEntryOf(KindChecks.bank.stored, { userid, banklabel, labelpath: 'bank' }, fetched.bank),
    [MainGateLabelpath]:  trackedEntryOf(KindChecks.gate.stored, { userid, banklabel, labelpath: MainGateLabelpath }, fetched[MainGateLabelpath]),
  } }
}

/** `'same'`, or the Thing at `scope` checked by `check`. */
function trackedEntryOf<RecordT extends Thing>(check: StoredCheck<RecordT>, scope: ThingScope, raw: unknown): RecordT | 'same' {
  return (raw === 'same') ? 'same' : writtenOf(check, scope, raw)
}
// --

// == [Classifying]: classifyGetThing, classifyWriteThing, ThingsFetched, classifyListThings, isChildLabelpath, classifyBirthBank
// Each takes the raw bank and main gate of the ask's bank, fetched in the same step, and reports them as its `world`.

/** Classify a get against the raw Thing a store fetched at its scope, null for none. */
export function classifyGetThing(ask: GetThingAsk, raw: unknown, worldFetched: WorldFetched): Actual<EX.GotAct> {
  const stored = storedThingOf(ask, raw)
  const act    = getActOf(ask, stored)
  const world  = worldOf(ask, worldFetched)
  const beside = trackedFieldOf(ask, worldFetched.tracked)
  return isRefusedAct(act) ? { ok: false, act, world, record: stored, ...beside } : { ok: true, act, world, record: stored, ...beside }
}

/** Classify a write against the raw Thing a store fetched at its scope, null for none, and check its storage policies
 * where it would replace a live Thing. Under a write act, `record` is `ask.record`, which the store writes, then reports
 * the Thing it wrote and the world after it.
 */
export function classifyWriteThing(ask: WriteThingAsk, raw: unknown, worldFetched: WorldFetched): Actual<EX.PutAct | EX.DelAct> {
  const stored = storedCitedOf(ask, raw)
  const act    = writeActOf(ask, stored)
  if (! isWriteAct(act))  { return unwrittenWriteOf(ask, act, raw, worldFetched) }
  if (act === 'replaced') {
    demandBornAtKept(ask, stored, raw)
    demandPolicies(ask, raw)
  }
  return { ok: true, act, world: worldOf(ask, worldFetched), record: ask.record, ...trackedFieldOf(ask, worldFetched.tracked) }
}

/** What a store fetched for a listing: the raw parent, null for none, and each raw Thing one label under it, with its labelpath. */
export type ThingsFetched = Readonly<{ parent: unknown, children: readonly Readonly<{ labelpath: string, raw: unknown }>[] }>

/** Classify a listing against what a store fetched for it: the parent's get act, the parent, its children of the parent's
 * live life in labelpath order, and the children that fail their checks.
 */
export function classifyListThings(ask: ListThingsAsk, { parent: rawParent, children }: ThingsFetched, worldFetched: WorldFetched): ListThingsActual {
  const stored = storedThingOf(ask, rawParent)
  const act    = getActOf(ask, stored)
  const parent = (stored === null) ? null : sparseOf(stored)
  const world  = worldOf(ask, worldFetched)
  const beside = trackedFieldOf(ask, worldFetched.tracked)
  if (isRefusedAct(act))  { return { ok: false, act, world, listed: [], parent, damaged_rows: [], ...beside } }
  // A tombstone or none has no children.
  if (stored?.am !== 'a') { return { ok: true, act, world, listed: [], parent, damaged_rows: [], ...beside } }
  const { userid, banklabel } = ask
  // A child hangs off its parent's live lifepath: an earlier life's children are not its.
  const lifepathUnder = `${stored.lifepath}/`
  const living: Thing[] = []
  const damaged_rows: DamagedThing[] = []
  for (const { labelpath, raw } of children) {
    if (! isChildLabelpath(ask, labelpath)) { throw new Errors.VaultError('storage_issue', BigPhrases.rowOfOtherAddress(['labelpath'])) }
    const child = listedThingOf({ userid, banklabel, labelpath }, raw)
    if (child === null) { damaged_rows.push({ userid, banklabel, labelpath, am: 'd' }) } else if (child.lifepath.startsWith(lifepathUnder)) { living.push(child) }
  }
  const listed = sortBy(living, [(thing) => thing.labelpath]).map((thing) => sparseOf(thing))
  return { ok: true, act, world, listed, parent, damaged_rows, ...beside }
}

/** True when `labelpath` is one label under the listing's parent, of the parent's kind. */
function isChildLabelpath(ask: ListThingsAsk, labelpath: string): boolean {
  const label = labelpath.slice(ask.labelpath.length + 1)
  return labelpath.startsWith(`${ask.labelpath}/`) && (! label.includes('/')) && isLabelpathOfKind(labelpath, ask.modelkind)
}

/** Classify a bank's birth, by the three `puts` it amounts to, against the roots a store fetched. Under
 * `born`, `things` and `world` are the puts' records, which the store writes in one step and then reports as written, with any `tracked`
 * as read after it; otherwise as {@link unwrittenBirthOf} reads.
 */
export function classifyBirthBank(puts: BirthPuts, fetched: BankRootsFetched): BirthBankActual {
  const unwritten = unwrittenBirthOf(puts, fetched)
  if (unwritten !== null) { return unwritten }
  const [bankPut, gatePut, rootPut] = puts
  const things = { bank: bankPut.record, gate: gatePut.record, root: rootPut.record }
  return { ok: true, act: 'born', world: { ...things.bank, maingate: things.gate }, things }
}
// --

// == [Steps]: unwrittenWriteOf, demandBornAtKept, demandPolicies, unwrittenBirthOf
// The steps of the classifiers above, for a store that reaches part of the verdict itself to take in its own order.

/** The answer to a write the act tables leave unwritten, a refusal or `passed`, from the raw Thing a store fetched at its scope and the raw world. */
export function unwrittenWriteOf(ask: WriteThingAsk, act: Exclude<EX.PutAct | EX.DelAct | EX.RefusedAct, EX.WriteAct>, raw: unknown, worldFetched: WorldFetched): Actual<EX.PutAct | EX.DelAct> {
  const record = storedThingOf(ask, raw)
  const world  = worldOf(ask, worldFetched)
  const beside = trackedFieldOf(ask, worldFetched.tracked)
  return isRefusedAct(act) ? { ok: false, act, world, record, ...beside } : { ok: true, act, world, record, ...beside }
}

/** Throw `bad_record` unless `ask` keeps the born_at of the live Thing it replaces: `stored`, read from `raw`. */
export function demandBornAtKept(ask: WriteThingAsk, stored: StoredCited | null, raw: unknown): void {
  if (ask.record.born_at === stored?.born_at) { return }
  throw new Errors.VaultError('bad_record', BornAtNotStored, { rows: { dbhas: storedThingOf(ask, raw) }, meta: PoliciedMeta })
}

const StoredWayinsCheck = storedWayins.refusingAs('damaged_row')

/** Throw `gate_issue` where a storage policy `ask` names refuses it over `raw`, the live gate it replaces. Only the gate has storage policies. */
export function demandPolicies(ask: WriteThingAsk, raw: unknown): void {
  if ((ask.modelkind !== 'gate') || ((ask.options?.policies.length ?? 0) === 0)) { return }
  const why = policyRefusalOf(ask, StoredWayinsCheck.parse(raw).wayins)
  if (why !== null) { throw gateIssue(storedThingOf(ask, raw), why) }
}

/** The answer to a birth the roots a store fetched leave unwritten, or null where the act tables let it write: `passed`
 * over a live bank, with the roots stored, or the first root's refusal.
 */
export function unwrittenBirthOf(puts: BirthPuts, fetched: BankRootsFetched): BirthBankActual | null {
  const [bankPut, gatePut, rootPut] = puts
  // The bank's put passes over a live bank, whose gate and root must be stored with it.
  if (putActOf(bankPut, storedCitedOf(bankPut, fetched.bank)) === 'passed') {
    const bank = storedOf(KindChecks.bank.stored, bankPut, fetched.bank)
    const gate = storedOf(KindChecks.gate.stored, gatePut, fetched.gate)
    const root = storedOf(KindChecks.box.stored,  rootPut, fetched.root)
    if ((bank === null) || (gate === null) || (root === null)) { throw new Errors.VaultError('storage_issue', BankRootsMissing) }
    return { ok: true, act: 'passed', world: { ...bank, maingate: gate }, things: { bank, gate, root }, ...trackedFieldOf(bankPut, fetched.tracked) }
  }
  for (const [put, raw] of [[bankPut, fetched.bank], [gatePut, fetched.gate], [rootPut, fetched.root]] as const) {
    const act = putActOf(put, storedCitedOf(put, raw))
    if (isRefusedAct(act)) { return { ok: false, act, world: worldOf(bankPut, { bank: fetched.bank, maingate: fetched.gate }), record: storedThingOf(put, raw), ...trackedFieldOf(bankPut, fetched.tracked) } }
  }
  return null
}
// --
