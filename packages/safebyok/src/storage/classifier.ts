/** Classify a get, put or del against the stored rows, per the tables in `notes/answer-contract.md`. */

import * as Phrases from '../helpers/phrases'
import * as Refuse from '../refusals/throwers'
import * as CX from '../shapes/shapes-core'
import * as EX from '../shapes/shapes-enums'
import * as SX from '../shapes/shapes-storage'
import type { VaultScope } from '../shapes/shapes-core'
import type { BoxAct, BoxVaultAct, VaultAct, WriteAct } from '../shapes/shapes-enums'
import type { BoxQuery, BoxRequest, BoxRow, BoxSparse, Capacity, Revision, VaultRequest, VaultRow } from '../shapes/shapes-storage'

// == [Asked and stored]: Meta, Asked, GetAsked, PutAsked, DelAsked, Presence, Stored
// Every function below takes what was asked first, and what is stored second.

/** The fields of a row, stored or expected, that the tables compare. */
type Meta = Readonly<Pick<BoxSparse, 'revision_tok' | 'revision_seq' | 'am' | 'vault_tok'> & Partial<Pick<BoxSparse, 'box_tok'>>>

/** A box's or a vault's request, as the tables read it. A put or del has the row it expects to find and the record it would write. */
type Asked    = GetAsked | PutAsked | DelAsked
type GetAsked = Readonly<{ op: 'get', ifAbsent: EX.IfAbsent }>
type PutAsked = Readonly<{ op: 'put', ifAbsent: EX.PutIfAbsent, ifPresent: EX.IfPresent, expected: Meta, record: Revision }>
type DelAsked = Readonly<{ op: 'del', expected: Meta, record: Revision }>

/** What is stored at a scope: no row, a tombstone, or a live row. */
type Presence = 'void' | 'gone' | 'live'

/** The row stored at a scope, null where none is, under its {@link Presence}. */
type Stored<RowT extends Meta = Meta> = Readonly<{ presence: 'void', row: null } | { presence: Exclude<Presence, 'void'>, row: RowT }>
// --

// == [Columns]: RevtokCmp, RevseqCmp, revtokCmpOf, revseqCmpOf, lifeTokOf, isLifeOff
// A row of the note's tables is found by its columns: what is stored, the two comparisons of a revision, and the policy that speaks.
// A cited `revision_tok` names one version of a row, so on a match the tables also ask whether its life and liveness are the stored ones.

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

function revtokCmpOf({ expected, record }: PutAsked | DelAsked, stored: Stored): RevtokCmp {
  if (stored.presence === 'void')                      { return (expected.revision_tok === SX.VoidRevisionTok) ? 'birth' : 'neq' }
  if (stored.row.revision_tok === record.revision_tok) { return '=next' }
  return (stored.row.revision_tok === expected.revision_tok) ? 'eq' : 'neq'
}

function revseqCmpOf({ expected }: PutAsked | DelAsked, stored: Stored): RevseqCmp {
  if (expected.revision_seq === SX.VoidRevisionSeq)      { return 'birth' }
  if (stored.presence === 'void')                        { return 'ahead' }
  if (expected.revision_seq === stored.row.revision_seq) { return 'eq' }
  return (expected.revision_seq < stored.row.revision_seq) ? 'stale' : 'ahead'
}

// A box's life is named by its `box_tok`. A vault row has none, and its life is its `vault_tok`.
function lifeTokOf({ box_tok, vault_tok }: Meta): string { return box_tok ?? vault_tok }

/** True when a row is stored, and the row expected differs from it in its life token or its liveness. */
function isLifeOff({ expected }: PutAsked | DelAsked, stored: Stored): boolean {
  return (stored.presence !== 'void') && ((lifeTokOf(stored.row) !== lifeTokOf(expected)) || (stored.row.am !== expected.am))
}
// --

// == [Tables]: getActOf, putActOf, delActOf, rowActOf
// Each answers the act for the row asked for, a box's or a vault's alike.

/** Classify a get: see the get table in `notes/answer-contract.md`. */
function getActOf({ ifAbsent }: GetAsked, { presence }: Stored): VaultAct {
  if (presence === 'live') { return 'gotlive' }
  if (presence === 'void') { return (ifAbsent === 'nil') ? 'gotvoid' : 'void' }
  return (ifAbsent === 'nil') ? 'gotgone' : 'gone'
}

/** Classify a put: see the put table in `notes/answer-contract.md`. The first matching row wins. */
function putActOf(asked: PutAsked, stored: Stored): VaultAct {
  const { presence } = stored
  // The policy that speaks: `ifPresent` over a live row, `ifAbsent` over a tombstone or none.
  const opflag       = (presence === 'live') ? asked.ifPresent : asked.ifAbsent
  const revseqCmp    = revseqCmpOf(asked, stored)
  const revtokCmp    = revtokCmpOf(asked, stored)
  if (revtokCmp  === '=next')                                                     { return 'retcon' }
  if (revseqCmp  === 'ahead')                                                     { return 'ahead' }
  if ((revtokCmp === 'eq')  && ((revseqCmp !== 'eq') || isLifeOff(asked, stored))) { return 'clash' }
  if ((revtokCmp === 'neq') && (revseqCmp === 'eq'))                              { return 'forked' }
  if (revtokCmp  === 'neq')                                                       { return ((presence === 'live') && (opflag === 'get')) ? 'passed' : 'stale' }
  if (presence   === 'void')                                                      { return (opflag === 'add') ? 'born'   : 'void' }
  if (presence   === 'gone')                                                      { return (opflag === 'add') ? 'reborn' : 'gone' }
  if (opflag     === 'repl')                                                      { return 'replaced' }
  return (opflag === 'get') ? 'passed' : 'camped'
}

/** Classify a del: see the del table in `notes/answer-contract.md`. The first matching row wins. */
function delActOf(asked: DelAsked, stored: Stored): VaultAct {
  const { presence } = stored
  const revseqCmp    = revseqCmpOf(asked, stored)
  const revtokCmp    = revtokCmpOf(asked, stored)
  if (revtokCmp  === '=next')                                                     { return 'retcon' }
  if (revseqCmp  === 'ahead')                                                     { return 'ahead' }
  if ((revtokCmp === 'eq')  && ((revseqCmp !== 'eq') || isLifeOff(asked, stored))) { return 'clash' }
  if ((revtokCmp === 'neq') && (revseqCmp === 'eq'))                              { return 'forked' }
  if (revtokCmp  === 'neq')                                                       { return (presence === 'gone') ? 'gone' : 'stale' }
  if (presence   === 'void')                                                      { return 'void' }
  return (presence === 'gone') ? 'dubdel' : 'deleted'
}

/** Classify a request against the row stored at its scope. */
function rowActOf(asked: Asked, stored: Stored): VaultAct {
  if (asked.op === 'get') { return getActOf(asked, stored) }
  if (asked.op === 'put') { return putActOf(asked, stored) }
  return delActOf(asked, stored)
}
// --

// == [Rows stored]: boxVaultRow, vaultRowAt, boxRowAt, classifyBoxVault

// Both faults of a row are thrown, each with the words of the check that found it. Damaged is a judgment of the row
// taken alone: it fails its own checks. The row asked for refuses `damaged_row`, and the vault above a box asked for
// refuses `damaged_vault`. A row that is no object, or a sound one filed at another address than it was asked for at,
// says the store or its adapter is not working: `storage_issue`.
const boxVaultRow = SX.storedVaultRow.refusingAs('damaged_vault')

// Checked against its scope and not its vault_tok: a vault row of another life is `vault_gone` or `vault_reborn`, an answer and no fault of storage.
/** The vault row stored at `vaultScope`, checked by `checker`, whose refusal is thrown for a row that fails its checks. */
function vaultRowAt(vaultScope: VaultScope, vaultRaw: unknown, checker: typeof SX.storedVaultRow): Stored<VaultRow> {
  if (vaultRaw === null)         { return { presence: 'void', row: null } }
  if (! CX.isPlainBag(vaultRaw)) { throw Refuse.storageIssue() }
  const row = checker.parseConsistent(vaultRaw, CX.vaultScope.parse(vaultScope), { kind: 'storage_issue', message: Phrases.rowOfOtherAddress })
  return { presence: (row.am === 'a') ? 'live' : 'gone', row }
}

/** The box row stored at `boxQuery`, checked. Throws `damaged_row` for a row that fails its checks. */
function boxRowAt(boxQuery: BoxQuery, boxRaw: unknown): Stored<BoxRow> {
  if (boxRaw === null)         { return { presence: 'void', row: null } }
  if (! CX.isPlainBag(boxRaw)) { throw Refuse.storageIssue() }
  const row = SX.storedBoxRow.parseConsistent(boxRaw, SX.boxQuery.parse(boxQuery), { kind: 'storage_issue', message: Phrases.rowOfOtherAddress })
  return { presence: (row.am === 'a') ? 'live' : 'gone', row }
}

/** The act a box request refuses with for its vault's stored row, or null where the vault is live in the life asked for. */
function classifyBoxVault(boxQuery: BoxQuery, vaultRaw: unknown): BoxVaultAct | null {
  const vault = vaultRowAt(boxQuery, vaultRaw, boxVaultRow)
  if (vault.presence === 'void') { return 'vault_void' }
  if (vault.presence === 'gone') { return 'vault_gone' }
  return (vault.row.vault_tok === boxQuery.vault_tok) ? null : 'vault_reborn'
}
// --

// == [Acts]: isWriteAct, isBirthAct, boxActOf, vaultActOf, cappedActOf

/** True when the act tells the caller to store the request's record. */
export function isWriteAct(act: BoxAct | VaultAct): act is WriteAct { return (EX.writeActVals as readonly string[]).includes(act) }

/** True when the act creates a row, or re-creates a deleted one. */
export function isBirthAct(act: BoxAct | VaultAct): boolean { return (act === 'born') || (act === 'reborn') }

/** Classify a box request's outcome, based on its stored vault and box rows. */
export function boxActOf(request: BoxRequest, vaultRaw: unknown, boxRaw: unknown): BoxAct {
  const asked    = SX.boxRequest.parse(request)
  const boxQuery = (asked.op === 'get') ? asked : asked.record
  const vaultAct = classifyBoxVault(boxQuery, vaultRaw)
  if (vaultAct !== null) { return vaultAct }
  const stored   = boxRowAt(boxQuery, boxRaw)
  return rowActOf(asked, stored)
}

/** Classify a vault request's outcome, based on the stored row. */
export function vaultActOf(request: VaultRequest, vaultRaw: unknown): VaultAct {
  const asked  = SX.vaultRequest.parse(request)
  const stored = vaultRowAt((asked.op === 'get') ? asked : asked.record, vaultRaw, SX.storedVaultRow)
  return rowActOf(asked, stored)
}

// The cap is soft: `capacity` is a count taken outside any lock, as the write is about to be made. A write already made is never refused for it.
/** Replace an act that would add a box with `vault_full` when the vault is at its cap. */
export function cappedActOf(act: BoxAct, capacity: Capacity): BoxAct {
  const { boxes } = SX.capacity.parse(capacity)
  return (isBirthAct(act) && (boxes.used >= boxes.max)) ? 'vault_full' : act
}
// --
