/** Classify a get, put or del against the stored rows, per the tables in `notes/answer-contract.md`. */

import * as Phrases from '../helpers/phrases'
import { verifyConsistent } from '../helpers/validator'
import * as Refuse from '../refusals/throwers'
import * as CX from '../shapes/shapes-core'
import * as EX from '../shapes/shapes-enums'
import * as SX from '../shapes/shapes-storage'
import type { VaultScope } from '../shapes/shapes-core'
import type { BoxAct, FoundAct, VaultAct, WriteAct } from '../shapes/shapes-enums'
import type { BoxQuery, BoxRequest, BoxRow, Capacity, Revision, VaultRequest, VaultRow } from '../shapes/shapes-storage'

// == [Columns]: Presence, RevtokCmp, RevseqCmp, RevCmp, Opflag, Peek, presenceOf, revtokCmpOf, revseqCmpOf

// A row of the note's tables is found by four columns: what is stored, the two comparisons of a revision, and the policy that speaks.

/** What is stored at a scope: no row, a tombstone, or a live row. */
type Presence = 'void' | 'gone' | 'live'

/** The stored `revision_tok` compared with the request's.
 * - `'birth'` -- expected an empty row, and none is stored
 * - `'=next'` -- the stored row already has the token this request would write
 * - `'eq'`    -- expected exactly the token the stored row has
 * - `'neq'`   -- anything else
 */
type RevtokCmp = 'birth' | '=next' | 'eq' | 'neq'

/** The request's expected `revision_seq` compared with the stored one.
 * - `'birth'` -- expected an empty row
 * - `'eq'`    -- expected exactly the seq the stored row has
 * - `'stale'` -- expected an older revision: a write has intervened
 * - `'ahead'` -- expected a higher revision (or a record where none exists): an impossible situation
 */
type RevseqCmp = 'birth' | 'eq' | 'stale' | 'ahead'

type RevCmp = Readonly<{ revtokCmp: RevtokCmp, revseqCmp: RevseqCmp }>

/** The request's `ifPresent` or `ifAbsent` policy, whichever applies to the stored row. */
type Opflag = EX.IfAbsent | EX.PutIfAbsent | EX.IfPresent

/** The fields of a row, stored or expected, that classification compares. */
type Peek = Readonly<Revision & { am: EX.Am, lifeTok: string }>

const boxPeekOf   = ({ revision_tok, revision_seq, am, box_tok }:   Revision & { am: EX.Am, box_tok: string }):   Peek => ({ revision_tok, revision_seq, am, lifeTok: box_tok })
const vaultPeekOf = ({ revision_tok, revision_seq, am, vault_tok }: Revision & { am: EX.Am, vault_tok: string }): Peek => ({ revision_tok, revision_seq, am, lifeTok: vault_tok })

const presenceOf = (stored: Peek | null): Presence => {
  if (stored === null) { return 'void' }
  return (stored.am === 'a') ? 'live' : 'gone'
}

const revtokCmpOf = (expected: Revision, proposed: Revision, stored: Revision | null): RevtokCmp => {
  if (stored === null)                               { return (expected.revision_tok === SX.VoidRevisionTok) ? 'birth' : 'neq' }
  if (stored.revision_tok === proposed.revision_tok) { return '=next' }
  return (stored.revision_tok === expected.revision_tok) ? 'eq' : 'neq'
}

const revseqCmpOf = (expected: Revision, stored: Revision | null): RevseqCmp => {
  if (expected.revision_seq === SX.VoidRevisionSeq)  { return 'birth' }
  if (stored === null)                               { return 'ahead' }
  if (expected.revision_seq === stored.revision_seq) { return 'eq' }
  return (expected.revision_seq < stored.revision_seq) ? 'stale' : 'ahead'
}
// --

// == [Verdicts]: Verdict, BoxActs, VaultActs, Gate, GateActs

/** A classification's outcome, before it is named for box or vault: store, answer, or a refusal's reason. */
type Verdict = WriteAct | FoundAct | 'damaged' | 'void' | 'gone' | 'camped' | 'dubdel' | 'stale' | 'retcon' | 'clash' | 'forked' | 'ahead'

const BoxActs: Readonly<Record<Verdict, BoxAct>> = {
  born:    'born',        reborn:  'reborn',    replaced: 'replaced',   deleted: 'deleted',
  gotlive: 'gotlive',     gotvoid: 'gotvoid',   gotgone:  'gotgone',    passed:  'passed',
  damaged: 'box_damaged', void:    'box_void',  gone:     'box_gone',   camped:  'box_camped', dubdel: 'box_dubdel', stale: 'box_stale',
  retcon:  'box_retcon',  clash:   'box_clash', forked:   'box_forked', ahead:   'box_ahead',
}

const VaultActs: Readonly<Record<Verdict, VaultAct>> = {
  born:    'born',          reborn:  'reborn',      replaced: 'replaced',     deleted: 'deleted',
  gotlive: 'gotlive',       gotvoid: 'gotvoid',     gotgone:  'gotgone',      passed:  'passed',
  damaged: 'vault_damaged', void:    'vault_void',  gone:     'vault_gone',   camped:  'vault_camped', dubdel: 'vault_dubdel', stale: 'vault_stale',
  retcon:  'vault_retcon',  clash:   'vault_clash', forked:   'vault_forked', ahead:   'vault_ahead',
}

/** The state of a box request's vault. Only a `live` vault lets the request reach its box. A `full` vault has no room for a new box. */
type Gate = 'damaged' | 'void' | 'mismatch' | 'gone' | 'full' | 'live'

const GateActs: Readonly<Record<Exclude<Gate, 'live'>, BoxAct>> = { damaged: 'vault_damaged', void: 'vault_void', mismatch: 'vault_mismatch', gone: 'vault_gone', full: 'vault_full' }
// --

// == [Tables]: getVerdictOf, putVerdictOf, delVerdictOf, WriteAsk, writeVerdictOf

/** Classify a get, per the contract's get table. */
const getVerdictOf = (presence: Presence, opflag: Opflag): Verdict => {
  if (presence === 'live') { return 'gotlive' }
  if (presence === 'void') { return (opflag === 'nil') ? 'gotvoid' : 'void' }
  return (opflag === 'nil') ? 'gotgone' : 'gone'
}

/** Classify a put, per the contract's put table. The first matching row wins. */
const putVerdictOf = (presence: Presence, { revtokCmp, revseqCmp }: RevCmp, opflag: Opflag): Verdict => { // eslint-disable-line sonarjs/cognitive-complexity
  if (revtokCmp === '=next')                         { return 'retcon' }
  if (revseqCmp === 'ahead')                         { return 'ahead' }
  if ((revtokCmp === 'eq')  && (revseqCmp !== 'eq')) { return 'clash' }
  if ((revtokCmp === 'neq') && (revseqCmp === 'eq')) { return 'forked' }
  if (revtokCmp === 'neq')                           { return ((presence === 'live') && (opflag === 'get')) ? 'passed' : 'stale' }
  // The revision expected is the one stored, or the void one over no row: what is stored picks the policy, and the policy the verdict.
  if (presence === 'void')                           { return (opflag === 'add') ? 'born'   : 'void' }
  if (presence === 'gone')                           { return (opflag === 'add') ? 'reborn' : 'gone' }
  if (opflag === 'repl')                             { return 'replaced' }
  return (opflag === 'get') ? 'passed' : 'camped'
}

/** Classify a del, per the contract's del table. The first matching row wins. */
const delVerdictOf = (presence: Presence, { revtokCmp, revseqCmp }: RevCmp): Verdict => {
  if (revtokCmp === '=next')                         { return 'retcon' }
  if (revseqCmp === 'ahead')                         { return 'ahead' }
  if ((revtokCmp === 'eq')  && (revseqCmp !== 'eq')) { return 'clash' }
  if ((revtokCmp === 'neq') && (revseqCmp === 'eq')) { return 'forked' }
  if (revtokCmp === 'neq')                           { return (presence === 'gone') ? 'gone' : 'stale' }
  if (presence === 'void')                           { return 'void' }
  return (presence === 'gone') ? 'dubdel' : 'deleted'
}

/** The parts of a box or vault put or del that classification uses. */
type WriteAsk = Readonly<{ op: 'put', ifAbsent: EX.PutIfAbsent, ifPresent: EX.IfPresent, record: Revision } | { op: 'del', record: Revision }>

/** Classify a put or del against the stored row. */
const writeVerdictOf = (ask: WriteAsk, expected: Peek, stored: Peek | null): Verdict => {
  const presence = presenceOf(stored)
  const revCmp   = { revtokCmp: revtokCmpOf(expected, ask.record, stored), revseqCmp: revseqCmpOf(expected, stored) }
  // A revision_tok names one version of a row: the row cited by it is that version in its life and its liveness too, or the two clash.
  const isLifeOff = (stored !== null) && ((stored.lifeTok !== expected.lifeTok) || (stored.am !== expected.am))
  if (isLifeOff && (revCmp.revtokCmp === 'eq') && (revCmp.revseqCmp === 'eq')) { return 'clash' }
  if (ask.op === 'del') { return delVerdictOf(presence, revCmp) }
  return putVerdictOf(presence, revCmp, (presence === 'live') ? ask.ifPresent : ask.ifAbsent)
}
// --

// == [Rows stored]: Found, RowOfOtherAddress, isRowStored, vaultRowAt, boxRowAt, gateOf

// Damaged is a judgment of the row taken alone: it fails its own checks. A row that is no object, or a
// sound one filed at another address than it was asked for at, says the store or its adapter is not working: `storage_issue`.

/** A stored row, null if none, or `damaged` if it fails its checks. */
type Found<RowT> = RowT | null | 'damaged'

const RowOfOtherAddress = { kind: 'storage_issue', message: Phrases.rowOfOtherAddress } as const

/** True when storage returned a row; throws `storage_issue` for anything but an object or null. */
const isRowStored = (raw: unknown): boolean => {
  if (raw === null) { return false }
  if (! CX.isPlainBag(raw)) { throw Refuse.storageIssue() }
  return true
}

// Checked against its scope and not its vault_tok: a vault row of another life is an answer the gate has a word for.
/** Validate the stored vault row against the request's scope. */
const vaultRowAt = (vaultRaw: unknown, asked: VaultScope): Found<VaultRow> => {
  if (! isRowStored(vaultRaw)) { return null }
  const vault = SX.storedVaultRow.safeParse(vaultRaw)
  return vault.success ? verifyConsistent(vault.data, CX.vaultScope.parse(asked), RowOfOtherAddress) : 'damaged'
}

/** Validate the stored box row against the request's scope and `vault_tok`. */
const boxRowAt = (boxRaw: unknown, asked: BoxQuery): Found<BoxRow> => {
  if (! isRowStored(boxRaw)) { return null }
  const box = SX.storedBoxRow.safeParse(boxRaw)
  return box.success ? verifyConsistent(box.data, SX.boxQuery.parse(asked), RowOfOtherAddress) : 'damaged'
}

/** Classify the state of a box request's vault from its stored row. */
const gateOf = (vault: Found<VaultRow>, vault_tok: string): Exclude<Gate, 'full'> => {
  if (vault === 'damaged')           { return 'damaged' }
  if (vault === null)                { return 'void' }
  if (vault.vault_tok !== vault_tok) { return 'mismatch' }
  return (vault.am === 'a') ? 'live' : 'gone'
}
// --

// == [Acts]: isWriteAct, isBirthAct, boxActOf, vaultActOf, cappedActOf

/** True when the act tells the caller to store the request's record. */
export const isWriteAct = (act: BoxAct | VaultAct): act is WriteAct => (EX.writeActVals as readonly string[]).includes(act)

/** True when the act creates a row, or re-creates a deleted one. */
export const isBirthAct = (act: BoxAct | VaultAct): boolean => (act === 'born') || (act === 'reborn')

/** Classify a box request's outcome, based on its stored vault and box rows. */
export const boxActOf = (request: BoxRequest, vaultRaw: unknown, boxRaw: unknown): BoxAct => {
  const ask   = SX.boxRequest.parse(request)
  const asked = (ask.op === 'get') ? ask : ask.record
  const gate  = gateOf(vaultRowAt(vaultRaw, asked), asked.vault_tok)
  if (gate !== 'live')   { return GateActs[gate] }
  const box = boxRowAt(boxRaw, asked)
  if (box === 'damaged') { return BoxActs.damaged }
  const stored = (box === null) ? null : boxPeekOf(box)
  if (ask.op === 'get')  { return BoxActs[getVerdictOf(presenceOf(stored), ask.ifAbsent)] }
  return BoxActs[writeVerdictOf(ask, boxPeekOf(ask.expected), stored)]
}

/** Classify a vault request's outcome, based on the stored row. */
export const vaultActOf = (request: VaultRequest, vaultRaw: unknown): VaultAct => {
  const ask   = SX.vaultRequest.parse(request)
  const vault = vaultRowAt(vaultRaw, (ask.op === 'get') ? ask : ask.record)
  if (vault === 'damaged') { return VaultActs.damaged }
  const stored = (vault === null) ? null : vaultPeekOf(vault)
  if (ask.op === 'get')    { return VaultActs[getVerdictOf(presenceOf(stored), ask.ifAbsent)] }
  return VaultActs[writeVerdictOf(ask, vaultPeekOf(ask.expected), stored)]
}

// The cap is soft: `capacity` is a count taken outside any lock, as the write is about to be made. A write already made is never refused for it.
/** Replace an act that would add a box with `vault_full` when the vault is at its cap. */
export const cappedActOf = (act: BoxAct, capacity: Capacity): BoxAct => {
  const { boxes } = SX.capacity.parse(capacity)
  return (isBirthAct(act) && (boxes.used >= boxes.max)) ? GateActs.full : act
}
// --
