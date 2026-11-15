/** Classify a vaultDB ask against the Thing stored, by big's act tables in `notes/answer-contract.md`. */

import { sortBy } from 'es-toolkit'
import { CX, EX, Errors, Phrases as BigPhrases, SX, Throwers, Validator } from 'safebyok-big/internals'
import { BankRootsMissing, BornAtNotStored, ReplacedThingAmiss } from '../phrases'
import { demandPolicies } from './policies'
import type { Actual, BirthBankActual, DamagedThing, ListThingsActual } from './vault-db'
import {
  type BankRoots, type BirthPuts, type GetThingAsk, type ListThingsAsk, type Thing, type ThingCited, type ThingScope, type WriteThingAsk,
  GateThingFormat, KindChecks, isLabelpathOfKind, kindChecksOf, sparseOf, thingScope,
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
function writeActOf(ask: WriteCmpAsk, stored: ThingCited | null): EX.PutAct | EX.DelAct | EX.RefusedAct {
  return (ask.op === 'put') ? putActOf(ask, stored) : delActOf(ask, stored)
}

/** True when `act` refuses the ask. */
function isRefusedAct(act: string): act is EX.RefusedAct { return (EX.refusedActVals as readonly string[]).includes(act) }

/** True when `act` tells the store to write the ask's record. */
export function isWriteAct(act: string): act is EX.WriteAct { return (EX.writeActVals as readonly string[]).includes(act) }
// --

// == [Things stored]: RowOfOtherScope, StoredCheck, storedOf, writtenOf, storedThingOf, writtenThingOf, writtenRootsOf, listedThingOf, noticedThingOf
// A Thing that fails its kind's checks is damaged, and refuses `damaged_row`. One that is not an object, or a sound one
// stored at another scope than the one asked for, means the store or its adapter is broken, and refuses `storage_issue`.

const RowOfOtherScope = { kind: 'storage_issue', message: BigPhrases.rowOfOtherAddress } as const

/** A kind's check of a Thing stored, from {@link KindChecks}. */
type StoredCheck<RecordT extends Thing> = Readonly<{ parseConsistent: (raw: unknown, other: object, refusal: typeof RowOfOtherScope) => RecordT }>

/** The Thing stored at `scope`, checked by `check`, or null for none. */
function storedOf<RecordT extends Thing>(check: StoredCheck<RecordT>, scope: ThingScope, raw: unknown): RecordT | null {
  return (raw === null) ? null : writtenOf(check, scope, raw)
}

/** The Thing the store reports writing at `scope`, checked by `check`. */
function writtenOf<RecordT extends Thing>(check: StoredCheck<RecordT>, { userid, banklabel, labelpath }: ThingScope, raw: unknown): RecordT {
  if (! CX.isPlainBag(raw)) { throw Throwers.storageIssue() }
  return check.parseConsistent(raw, { userid, banklabel, labelpath }, RowOfOtherScope)
}

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

/** The Thing a watch heard, checked, or null for one that fails its checks. */
export function noticedThingOf(raw: unknown): Thing | null {
  const scope = thingScope.safeParse(raw)
  if (! scope.success) { return null }
  try {
    return writtenThingOf(scope.data, raw)
  } catch {
    return null
  }
}
// --

// == [Classifying]: classifyGetThing, classifyWriteThing, demandReplaceable, ThingsFetched, classifyListThings, isChildLabelpath, BankRootsFetched, classifyBirthBank

/** Classify a get against the raw Thing a store fetched at its scope, null for none. */
export function classifyGetThing(ask: GetThingAsk, raw: unknown): Actual<EX.GotAct> {
  const stored = storedThingOf(ask, raw)
  const act    = getActOf(ask, stored)
  return isRefusedAct(act) ? { ok: false, act, world: null, record: stored } : { ok: true, act, world: null, record: stored }
}

/** Classify a write against the raw Thing a store fetched at its scope, null for none, and check its storage policies
 * where it would replace a live Thing. Under a write act, the store writes `ask.record`, and reports the Thing it wrote.
 */
export function classifyWriteThing(ask: WriteThingAsk, raw: unknown): Actual<EX.PutAct | EX.DelAct> {
  const stored = storedThingOf(ask, raw)
  const act    = writeActOf(ask, stored)
  if (isRefusedAct(act))  { return { ok: false, act, world: null, record: stored } }
  if (act === 'replaced') { demandReplaceable(ask, stored) }
  return { ok: true, act, world: null, record: stored }
}

/** Throw unless `ask` may replace `stored`, the live Thing found: `bad_record` unless it keeps the born_at, and `gate_issue` where a storage policy refuses. */
function demandReplaceable(ask: WriteThingAsk, stored: Thing | null): void {
  if (stored === null)                       { throw new Errors.VaultError('unexpected_error', ReplacedThingAmiss) }
  if (ask.record.born_at !== stored.born_at) { throw new Errors.VaultError('bad_record', BornAtNotStored, { rows: { dbhas: stored } }) }
  // The gate alone has storage policies.
  if (ask.modelkind !== 'gate')              { return }
  if (stored.fmt !== GateThingFormat)        { throw new Errors.VaultError('unexpected_error', ReplacedThingAmiss) }
  demandPolicies(ask, stored)
}

/** What a store fetched for a listing: the raw parent, null for none, and each raw Thing one label under it, with its labelpath. */
export type ThingsFetched = Readonly<{ parent: unknown, children: readonly Readonly<{ labelpath: string, raw: unknown }>[] }>

/** Classify a listing against what a store fetched for it: the parent's get act, the parent, its children of the parent's
 * live life in labelpath order, and the children that fail their checks.
 */
export function classifyListThings(ask: ListThingsAsk, { parent: rawParent, children }: ThingsFetched): ListThingsActual {
  const stored = storedThingOf(ask, rawParent)
  const act    = getActOf(ask, stored)
  const parent = (stored === null) ? null : sparseOf(stored)
  if (isRefusedAct(act))  { return { ok: false, act, world: null, listed: [], parent, damaged_rows: [] } }
  // A tombstone or none has no children.
  if (stored?.am !== 'a') { return { ok: true, act, world: null, listed: [], parent, damaged_rows: [] } }
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
  return { ok: true, act, world: null, listed, parent, damaged_rows }
}

/** True when `labelpath` is one label under the listing's parent, of the parent's kind. */
function isChildLabelpath(ask: ListThingsAsk, labelpath: string): boolean {
  const label = labelpath.slice(ask.labelpath.length + 1)
  return labelpath.startsWith(`${ask.labelpath}/`) && (! label.includes('/')) && isLabelpathOfKind(labelpath, ask.modelkind)
}

/** What a store fetched for a bank's birth: the raw bank, main gate and root box, each null for none. */
export type BankRootsFetched = Readonly<{ bank: unknown, gate: unknown, root: unknown }>

/** Classify a bank's birth, by the three `puts` it amounts to, against the roots a store fetched. Under
 * `born`, `things` are the puts' records, which the store writes in one step and then reports as written; under `passed`,
 * the roots stored.
 */
export function classifyBirthBank(puts: BirthPuts, fetched: BankRootsFetched): BirthBankActual {
  const [bankPut, gatePut, rootPut] = puts
  const bank = storedOf(KindChecks.bank.stored, bankPut, fetched.bank)
  const gate = storedOf(KindChecks.gate.stored, gatePut, fetched.gate)
  const root = storedOf(KindChecks.box.stored,  rootPut, fetched.root)
  // The bank's put passes over a live bank, whose gate and root must be stored with it.
  if (putActOf(bankPut, bank) === 'passed') {
    if ((bank === null) || (gate === null) || (root === null)) { throw new Errors.VaultError('storage_issue', BankRootsMissing) }
    return { ok: true, act: 'passed', world: null, things: { bank, gate, root } }
  }
  for (const [put, stored] of [[bankPut, bank], [gatePut, gate], [rootPut, root]] as const) {
    const act = putActOf(put, stored)
    if (isRefusedAct(act)) { return { ok: false, act, world: null, record: stored } }
  }
  return { ok: true, act: 'born', world: null, things: { bank: bankPut.record, gate: gatePut.record, root: rootPut.record } }
}
// --
