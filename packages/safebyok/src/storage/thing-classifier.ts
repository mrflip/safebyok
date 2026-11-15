/** Classify a vaultDB ask against the Thing stored, by big's act tables in `notes/answer-contract.md`. */

import { isEqual, omit, sortBy } from 'es-toolkit'
import { CX, EX, Errors, Phrases as BigPhrases, SX, Throwers } from 'safebyok-big/internals'
import { BankRootsMissing, BornAtNotStored } from '../phrases'
import type { Actual, BirthBankActual, DamagedThing, ListThingsActual } from './vault-db'
import {
  type BankRoots, type BirthBankAsk, type GetThingAsk, type GateThing, type ListThingsAsk, type Thing, type ThingCited, type ThingScope, type WriteThingAsk,
  birthPutsOf, isKindLabelpath, kindChecksOf, sparseOf, thingScope,
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

// == [Things stored]: RowOfOtherScope, storedThingOf, writtenThingOf, noticedThingOf
// A Thing that fails its kind's checks is damaged, and refuses `damaged_row`. One that is not an object, or a sound one
// stored at another scope than the one asked for, means the store or its adapter is broken, and refuses `storage_issue`.

const RowOfOtherScope = { kind: 'storage_issue', message: BigPhrases.rowOfOtherAddress } as const

/** The Thing stored at `scope`, checked, or null for none. */
export function storedThingOf(scope: ThingScope, raw: unknown): Thing | null {
  return (raw === null) ? null : writtenThingOf(scope, raw)
}

/** The Thing the store reports writing at `scope`, checked. */
export function writtenThingOf({ userid, banklabel, labelpath }: ThingScope, raw: unknown): Thing {
  if (! CX.isPlainBag(raw)) { throw Throwers.storageIssue() }
  return kindChecksOf(labelpath).stored.parseConsistent(raw, { userid, banklabel, labelpath }, RowOfOtherScope)
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

// == [Classifying]: classifyGetThing, classifyWriteThing, demandBornAtKept, ThingsFetched, classifyListThings, isChildLabelpath, BankRootsFetched, classifyBirthBank

/** Classify a get against the raw Thing a store fetched at its scope, null for none. */
export function classifyGetThing(ask: GetThingAsk, raw: unknown): Actual<EX.GotAct> {
  const stored = storedThingOf(ask, raw)
  const act    = getActOf(ask, stored)
  return isRefusedAct(act) ? { ok: false, act, world: null, record: stored } : { ok: true, act, world: null, record: stored }
}

/** Classify a write against the raw Thing a store fetched at its scope, null for none, and apply its storage policies
 * where it would replace a live Thing. Under a write act, the store writes `ask.record`, and reports the Thing it wrote.
 */
export function classifyWriteThing(ask: WriteThingAsk, raw: unknown): Actual<EX.PutAct | EX.DelAct> {
  const stored = storedThingOf(ask, raw)
  const act    = writeActOf(ask, stored)
  if (isRefusedAct(act)) { return { ok: false, act, world: null, record: stored } }
  // `replaced` means a live Thing was found.
  if (act === 'replaced') {
    demandBornAtKept(ask.record, stored!)
    // The gate alone has storage policies, and the stored Thing is of the ask's kind.
    if (ask.modelkind === 'gate') { demandPolicies(ask, stored as GateThing) }
  }
  return { ok: true, act, world: null, record: stored }
}

/** Throw `bad_record` unless `record` keeps the born_at of `stored`, the live Thing it would replace */
function demandBornAtKept(record: Thing, stored: Thing): void {
  if (record.born_at !== stored.born_at) { throw new Errors.VaultError('bad_record', BornAtNotStored, { rows: { dbhas: stored } }) }
}

/** What a store fetched for a listing: the raw parent, null for none, and each raw Thing one label under it, with its labelpath. */
export type ThingsFetched = Readonly<{ parent: unknown, children: readonly Readonly<{ labelpath: string, raw: unknown }>[] }>

/** Classify a listing against what a store fetched for it: the parent's get act, the parent, its children of the parent's
 * live life in labelpath order, and the children that fail their checks.
 */
export function classifyListThings(ask: ListThingsAsk, { parent: rawParent, children }: ThingsFetched): ListThingsActual {
  const { userid, banklabel } = ask
  const stored       = storedThingOf(ask, rawParent)
  const act          = getActOf(ask, stored)
  const sound: Thing[] = []
  const damaged_rows: DamagedThing[] = []
  for (const { labelpath, raw } of children) {
    if (! isChildLabelpath(ask, labelpath)) { throw new Errors.VaultError('storage_issue', BigPhrases.rowOfOtherAddress(['labelpath'])) }
    try {
      sound.push(writtenThingOf({ userid, banklabel, labelpath }, raw))
    } catch (err) {
      if (! (Errors.isVaultError(err) && (err.refusalkind === 'damaged_row'))) { throw err }
      damaged_rows.push({ userid, banklabel, labelpath, am: 'd' })
    }
  }
  // A child hangs off its parent's live lifepath: a tombstone or none has no children, and an earlier life's are not its.
  const lifepathUnder = (stored?.am === 'a') ? `${stored.lifepath}/` : null
  const living = (lifepathUnder === null) ? [] : sound.filter((thing) => thing.lifepath.startsWith(lifepathUnder))
  const listed = sortBy(living, [(thing) => thing.labelpath]).map((thing) => sparseOf(thing))
  const parent = (stored === null) ? null : sparseOf(stored)
  return isRefusedAct(act)
    ? { ok: false, act, world: null, listed, parent, damaged_rows }
    : { ok: true,  act, world: null, listed, parent, damaged_rows }
}

/** True when `labelpath` is one label under the listing's parent, of the parent's kind. */
function isChildLabelpath(ask: ListThingsAsk, labelpath: string): boolean {
  const label = labelpath.slice(ask.labelpath.length + 1)
  return labelpath.startsWith(`${ask.labelpath}/`) && (! label.includes('/')) && isKindLabelpath(ask.modelkind, labelpath)
}

/** What a store fetched for a bank's birth: the raw bank, main gate and root box, each null for none. */
export type BankRootsFetched = Readonly<{ bank: unknown, gate: unknown, root: unknown }>

/** Classify a bank's birth against the roots a store fetched. Under `born`, `things` are the ask's records, which the store
 * writes in one step and then reports as written; under `passed`, the roots stored.
 */
export function classifyBirthBank(ask: BirthBankAsk, fetched: BankRootsFetched): BirthBankActual {
  const [bankPut, gatePut, rootPut] = birthPutsOf(ask)
  const bank = storedThingOf(bankPut, fetched.bank)
  const gate = storedThingOf(gatePut, fetched.gate)
  const root = storedThingOf(rootPut, fetched.root)
  // Each is checked by the kind its labelpath names, so each is of the kind its root is.
  if (bank?.am === 'a') {
    if ((gate === null) || (root === null)) { throw new Errors.VaultError('storage_issue', BankRootsMissing) }
    return { ok: true, act: 'passed', world: null, things: { bank, gate, root } as BankRoots }
  }
  for (const [put, stored] of [[bankPut, bank], [gatePut, gate], [rootPut, root]] as const) {
    const act = putActOf(put, stored)
    if (isRefusedAct(act)) { return { ok: false, act, world: null, record: stored } }
  }
  return { ok: true, act: 'born', world: null, things: { bank: ask.bank, gate: ask.gate, root: ask.root } }
}
// --

// == [Policies]: GatePolicies, demandPolicies, gateIssue
// Each runs once the put table has found the write would replace the live gate. Each line is one row of its policy's table
// in notes/storage-policies.md, in the same order, less big's registered_at row: every live-over-live write keeps its born_at.

/** What a gate write cites. */
type GateCited = WriteThingAsk<GateThing>['cited']

/** Each storage policy: what it demands of a gate write's records and of the gate stored, throwing `gate_issue` where it refuses. */
const GatePolicies = {
  /** The record replaces the passphrase wayin the gating proved against, and nothing else. */
  replace_passphrase(cited: GateCited, record: GateThing, stored: GateThing): void {
    if (! isEqual(cited.wayins?.main, stored.wayins.main))                            { throw gateIssue(stored, BigPhrases.ProvedWayinMoved) }
    if (! isEqual(omit(record.wayins, ['main']), omit(stored.wayins, ['main'])))       { throw gateIssue(stored, BigPhrases.OtherWayinMoved) }
  },
  /** The record adds a passkey wayin to a gate that has none, and changes nothing else. */
  add_passkey(_cited: GateCited, record: GateThing, stored: GateThing): void {
    if (stored.wayins.passkey0 !== undefined)                                         { throw gateIssue(stored, BigPhrases.PasskeyStored) }
    if (record.wayins.passkey0 === undefined)                                         { throw gateIssue(stored, BigPhrases.PasskeyNotAdded) }
    if (! isEqual(omit(record.wayins, ['passkey0']), omit(stored.wayins, ['passkey0']))) { throw gateIssue(stored, BigPhrases.OtherWayinMoved) }
  },
  /** The record removes the gate's passkey wayin, and changes nothing else. */
  revoke_passkey(_cited: GateCited, record: GateThing, stored: GateThing): void {
    if (stored.wayins.passkey0 === undefined)                                         { throw gateIssue(stored, BigPhrases.NoPasskeyStored) }
    if (record.wayins.passkey0 !== undefined)                                         { throw gateIssue(stored, BigPhrases.PasskeyNotRevoked) }
    if (! isEqual(omit(record.wayins, ['passkey0']), omit(stored.wayins, ['passkey0']))) { throw gateIssue(stored, BigPhrases.OtherWayinMoved) }
  },
} as const satisfies Record<EX.StoragePolicy, (cited: GateCited, record: GateThing, stored: GateThing) => void>

/** Apply each storage policy `ask` names to the gate stored. Throws `gate_issue` at the first that refuses. */
function demandPolicies({ cited, record, options }: WriteThingAsk<GateThing>, stored: GateThing): void {
  const policies = options?.policies ?? []
  for (const policy of policies) { GatePolicies[policy](cited, record, stored) }
}

/** A `gate_issue` refusal of a write over `stored`, saying `why`. */
function gateIssue(stored: GateThing, why: string): Errors.VaultError {
  return new Errors.VaultError('gate_issue', BigPhrases.gateIssue(why), { rows: { dbhas: stored } })
}
// --
