/** The classifier of the answer contract: the one act a get, put or del amounts to over the rows stored. Its tables are `notes/answer-contract.md`. */

import * as EX from '../shapes/shapes-enums'
import * as SX from '../shapes/shapes-storage'
import type { Boxscope } from '../shapes/shapes-core'
import type { BoxAct, FoundAct, VaultAct, WriteAct } from '../shapes/shapes-enums'
import type { BoxRequest, Capacity, Revision, VaultRequest } from '../shapes/shapes-storage'

// == [Columns]: Presence, RevtokCmp, RevseqCmp, RevCmp, Opflag, Peek, presenceOf, revtokCmpOf, revseqCmpOf

// A row of the note's tables is found by four columns: what is stored, the two comparisons of a revision, and the policy that speaks.

/** What is stored at a scope: no row, a tombstone, or a live row. */
type Presence = 'void' | 'gone' | 'live'

/** The stored `revision_tok` against a write's: `=next` is the one the write would store, `eq` the one it expects, and `birth` the void revision expected where no row is stored. */
type RevtokCmp = 'birth' | '=next' | 'eq' | 'neq'

/** A write's expected `revision_seq` against the stored one: `birth` is the void revision's seq, and a seq expected of no row is otherwise `ahead`. */
type RevseqCmp = 'birth' | 'eq' | 'stale' | 'ahead'

type RevCmp = Readonly<{ revtokCmp: RevtokCmp, revseqCmp: RevseqCmp }>

/** The policy that speaks to what is stored: a put's ifPresent over a live row, ifAbsent over a tombstone or no row. */
type Opflag = EX.IfAbsent | EX.PutIfAbsent | EX.IfPresent

/** What a comparison reads of a row, stored or expected: its revision, whether it is live, and its life tok. */
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

/** What a classification finds, bare of its level: an act that stores or answers, or what a refusal is over. */
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

/** How a box request finds its vault: it goes on to its box only at `live`, and adds one only where the vault is not `full`. */
type Gate = 'damaged' | 'void' | 'mismatch' | 'gone' | 'full' | 'live'

const GateActs: Readonly<Record<Exclude<Gate, 'live'>, BoxAct>> = { damaged: 'vault_damaged', void: 'vault_void', mismatch: 'vault_mismatch', gone: 'vault_gone', full: 'vault_full' }
// --

// == [Tables]: getVerdictOf, putVerdictOf, delVerdictOf, WriteAsk, writeVerdictOf

/** The verdict of a get: the note's get table. */
const getVerdictOf = (presence: Presence, opflag: Opflag): Verdict => {
  if (presence === 'live') { return 'gotlive' }
  if (presence === 'void') { return (opflag === 'nil') ? 'gotvoid' : 'void' }
  return (opflag === 'nil') ? 'gotgone' : 'gone'
}

/** The verdict of a put: the note's put table, in its order. */
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

/** The verdict of a del: the note's del table, in its order. */
const delVerdictOf = (presence: Presence, { revtokCmp, revseqCmp }: RevCmp): Verdict => {
  if (revtokCmp === '=next')                         { return 'retcon' }
  if (revseqCmp === 'ahead')                         { return 'ahead' }
  if ((revtokCmp === 'eq')  && (revseqCmp !== 'eq')) { return 'clash' }
  if ((revtokCmp === 'neq') && (revseqCmp === 'eq')) { return 'forked' }
  if (revtokCmp === 'neq')                           { return (presence === 'gone') ? 'gone' : 'stale' }
  if (presence === 'void')                           { return 'void' }
  return (presence === 'gone') ? 'dubdel' : 'deleted'
}

/** What a put or del brings to its table, at either level. */
type WriteAsk = Readonly<{ op: 'put', ifAbsent: EX.PutIfAbsent, ifPresent: EX.IfPresent, record: Revision } | { op: 'del', record: Revision }>

/** The verdict of a put or del that expects `expected`, over `stored`. */
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

// == [Rows stored]: BoxPlace, isBoxFiledAt, gateOf, storedBoxOf, isFull

type BoxPlace = Boxscope & { vault_tok: string }

/** True when the row `box` is filed where `asked` names: at its scope, in its vault's life. */
const isBoxFiledAt = (box: BoxPlace, asked: BoxPlace): boolean => (
  (box.applabel === asked.applabel) && (box.user_id === asked.user_id) && (box.vaultlabel === asked.vaultlabel) && (box.vault_tok === asked.vault_tok) && (box.boxlabel === asked.boxlabel)
)

/** How a box request citing `vault_tok` finds `vaultRaw`, its vault's row. */
const gateOf = (vaultRaw: unknown, vault_tok: string): Exclude<Gate, 'full'> => {
  const vault = SX.foundVaultRow.safeParse(vaultRaw)
  if (! vault.success)                    { return 'damaged' }
  if (vault.data === null)                { return 'void' }
  if (vault.data.vault_tok !== vault_tok) { return 'mismatch' }
  return (vault.data.am === 'a') ? 'live' : 'gone'
}

/** What a comparison reads of `boxRaw`, the box row stored for `asked`: `damaged` for one that fails its checks or is filed elsewhere, null for none. */
const storedBoxOf = (boxRaw: unknown, asked: BoxPlace): Peek | null | 'damaged' => {
  const box = SX.foundBoxRow.safeParse(boxRaw)
  if (! box.success)     { return 'damaged' }
  if (box.data === null) { return null }
  return isBoxFiledAt(box.data, asked) ? boxPeekOf(box.data) : 'damaged'
}

// The cap on a vault's boxes is soft: `capacity` is a count taken outside any lock, and where the cap falls among the other refusals is no promise.
/** True when `verdict` would add a live box to a vault that `capacity` says has no room for one. */
const isFull = (verdict: Verdict, capacity: Capacity | null): boolean => (
  ((verdict === 'born') || (verdict === 'reborn')) && (capacity !== null) && (capacity.boxes.used >= capacity.boxes.max)
)
// --

// == [Acts]: isWriteAct, boxActOf, vaultActOf

/** True when `act` says the request's record is to be stored. */
export const isWriteAct = (act: BoxAct | VaultAct): act is WriteAct => (EX.writeActVals as readonly string[]).includes(act)

/** The act a box's get, put or del amounts to over `vaultRaw` and `boxRaw`, the rows stored at its scope, each null for none.
 * `capacity` is the room its vault has for boxes, or null where none was counted.
 * Nothing is stored here: where {@link isWriteAct} holds of the act, the caller stores the request's record, in the atomic unit it fetched the rows in.
 */
export const boxActOf = (request: BoxRequest, vaultRaw: unknown, boxRaw: unknown, capacity: Capacity | null): BoxAct => {
  const ask   = SX.boxRequest.parse(request)
  const room  = (capacity === null) ? null : SX.capacity.parse(capacity)
  const asked = (ask.op === 'get') ? ask : ask.record
  const gate  = gateOf(vaultRaw, asked.vault_tok)
  if (gate !== 'live')      { return GateActs[gate] }
  const stored = storedBoxOf(boxRaw, asked)
  if (stored === 'damaged') { return BoxActs.damaged }
  if (ask.op === 'get')     { return BoxActs[getVerdictOf(presenceOf(stored), ask.ifAbsent)] }
  const verdict = writeVerdictOf(ask, boxPeekOf(ask.expected), stored)
  return isFull(verdict, room) ? GateActs.full : BoxActs[verdict]
}

/** The act a vault's get, put or del amounts to over `vaultRaw`, the row stored at its scope or null for none.
 * Nothing is stored here: where {@link isWriteAct} holds of the act, the caller stores the request's record, in the atomic unit it fetched the row in.
 */
export const vaultActOf = (request: VaultRequest, vaultRaw: unknown): VaultAct => {
  const ask   = SX.vaultRequest.parse(request)
  const vault = SX.foundVaultRow.safeParse(vaultRaw)
  if (! vault.success)  { return VaultActs.damaged }
  const stored = (vault.data === null) ? null : vaultPeekOf(vault.data)
  if (ask.op === 'get') { return VaultActs[getVerdictOf(presenceOf(stored), ask.ifAbsent)] }
  return VaultActs[writeVerdictOf(ask, vaultPeekOf(ask.expected), stored)]
}
// --
