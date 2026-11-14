/** Classify a vaultDB ask against the Thing stored, by big's act tables in `notes/answer-contract.md`. */

import { isEqual, omit } from 'es-toolkit'
import { CX, EX, Errors, Phrases as BigPhrases, SX, Throwers } from 'safebyok-big/internals'
import { BornAtNotStored } from '../phrases'
import type { Actual } from './vault-db'
import { type GetThingAsk, type GateThing, type Thing, type ThingCited, type ThingScope, type WriteThingAsk, kindChecksOf, thingScope } from './shapes-thing'

// == [Columns]: WriteCmpAsk, Presence, presenceOf, RevtokCmp, RevseqCmp, revtokCmpOf, revseqCmpOf, isLifeOff
// The columns of big's tables: what is stored, and the two revision comparisons. A revtok names one revision of a Thing,
// so where the ask's matches the stored one, the tables also check that the life and the liveness match.

/** A write ask, as the tables read it: its flags, and what its two records cite. */
type WriteCmpAsk = Pick<WriteThingAsk, 'ifAbsent' | 'ifPresent'> & { cited: ThingCited, record: ThingCited }

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

/** Classify a write: by the put table for a live record, by the del table for a tombstone. */
function writeActOf(ask: WriteCmpAsk, stored: ThingCited | null): EX.PutAct | EX.DelAct | EX.RefusedAct {
  return (ask.record.am === 'a') ? putActOf(ask, stored) : delActOf(ask, stored)
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

// == [Classifying]: classifyGetThing, classifyWriteThing, demandBornAtKept

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
    demandPolicies(ask, stored!)
  }
  return { ok: true, act, world: null, record: stored }
}

/** Throw `bad_record` unless `record` keeps the born_at of `stored`, the live Thing it would replace */
function demandBornAtKept(record: Thing, stored: Thing): void {
  if (record.born_at !== stored.born_at) { throw new Errors.VaultError('bad_record', BornAtNotStored, { rows: { dbhas: stored } }) }
}
// --

// == [Policies]: GatePolicies, demandPolicies, gateIssue
// Each runs once the put table has found the write would replace the live gate. Each line is one row of its policy's table
// in notes/storage-policies.md, in the same order, less big's registered_at row: every live-over-live write keeps its born_at.

/** Each storage policy: what it demands of a gate write's records and of the gate stored, throwing `gate_issue` where it refuses. */
const GatePolicies = {
  /** The record replaces the passphrase wayin the gating proved against, and nothing else. */
  replace_passphrase(cited: WriteThingAsk['cited'], record: GateThing, stored: GateThing): void {
    if (! isEqual(cited.wayins?.main, stored.wayins.main))                            { throw gateIssue(stored, BigPhrases.ProvedWayinMoved) }
    if (! isEqual(omit(record.wayins, ['main']), omit(stored.wayins, ['main'])))       { throw gateIssue(stored, BigPhrases.OtherWayinMoved) }
  },
  /** The record adds a passkey wayin to a gate that has none, and changes nothing else. */
  add_passkey(_cited: WriteThingAsk['cited'], record: GateThing, stored: GateThing): void {
    if (stored.wayins.passkey0 !== undefined)                                         { throw gateIssue(stored, BigPhrases.PasskeyStored) }
    if (record.wayins.passkey0 === undefined)                                         { throw gateIssue(stored, BigPhrases.PasskeyNotAdded) }
    if (! isEqual(omit(record.wayins, ['passkey0']), omit(stored.wayins, ['passkey0']))) { throw gateIssue(stored, BigPhrases.OtherWayinMoved) }
  },
  /** The record removes the gate's passkey wayin, and changes nothing else. */
  revoke_passkey(_cited: WriteThingAsk['cited'], record: GateThing, stored: GateThing): void {
    if (stored.wayins.passkey0 === undefined)                                         { throw gateIssue(stored, BigPhrases.NoPasskeyStored) }
    if (record.wayins.passkey0 !== undefined)                                         { throw gateIssue(stored, BigPhrases.PasskeyNotRevoked) }
    if (! isEqual(omit(record.wayins, ['passkey0']), omit(stored.wayins, ['passkey0']))) { throw gateIssue(stored, BigPhrases.OtherWayinMoved) }
  },
} as const satisfies Record<EX.StoragePolicy, (cited: WriteThingAsk['cited'], record: GateThing, stored: GateThing) => void>

/** Apply each storage policy `ask` names to the gate stored. Throws `gate_issue` at the first that refuses. */
function demandPolicies({ cited, record, options }: WriteThingAsk, stored: GateThing): void {
  const policies = options?.policies ?? []
  for (const policy of policies) { GatePolicies[policy](cited, record, stored) }
}

/** A `gate_issue` refusal of a write over `stored`, saying `why`. */
function gateIssue(stored: GateThing, why: string): Errors.VaultError {
  return new Errors.VaultError('gate_issue', BigPhrases.gateIssue(why), { rows: { dbhas: stored } })
}
// --
