/** Classify a get, put or del against the stored rows, per the tables in `notes/answer-contract.md`. */

import * as Phrases from '../helpers/phrases'
import { Checkers } from '../helpers/validator'
import * as Refuse from '../refusals/throwers'
import * as CX from '../shapes/shapes-core'
import * as EX from '../shapes/shapes-enums'
import * as SX from '../shapes/shapes-storage'
import type { VaultScope } from '../shapes/shapes-core'
import type { BoxAct, BoxVaultAct, OkAct, RefusedAct, VaultAct, WriteAct } from '../shapes/shapes-enums'
import type { BoxAsk, BoxQuery, BoxRow, BoxSparse, Capacity, Revision, VaultAsk, VaultDelAsk, VaultPutAsk, VaultRecord, VaultRow, VaultTombstone } from '../shapes/shapes-storage'

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

// == [Rows stored]: boxVaultRow, vaultRowAt, boxRowAt, boxVaultActOf

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
function boxVaultActOf({ vault_tok }: Pick<BoxQuery, 'vault_tok'>, world: VaultRow): BoxVaultAct | null {
  if (world.revision_seq === SX.VoidRevisionSeq) { return 'vault_void' }
  if (world.am !== 'a')                          { return 'vault_gone' }
  return (world.vault_tok === vault_tok) ? null : 'vault_reborn'
}
// --

// == [Acts]: isWriteAct, isBirthAct, isOkAct, cappedActOf

/** True when the act tells the caller to store the request's record. */
export function isWriteAct(act: BoxAct | VaultAct): act is WriteAct { return (EX.writeActVals as readonly string[]).includes(act) }

/** True when the act creates a row, or re-creates a deleted one. */
export function isBirthAct(act: BoxAct | VaultAct): boolean { return (act === 'born') || (act === 'reborn') }

/** True when the act is a good answer's: the record was stored, or the row found is answered. */
export function isOkAct(act: BoxAct | VaultAct): act is OkAct { return isWriteAct(act) || (EX.foundActVals as readonly string[]).includes(act) }

// The cap is soft: `capacity` is a count taken outside any lock, as the write is about to be made. A write already made is never refused for it.
/** Replace an act that would add a box with `vault_full` when the vault is at its cap. */
export function cappedActOf(act: BoxAct, capacity: Capacity): BoxAct {
  const { boxes } = SX.capacity.parse(capacity)
  return (isBirthAct(act) && (boxes.used >= boxes.max)) ? 'vault_full' : act
}
// --

// == [Classifying]: VaultFetched, BoxFetched, VaultClassified, BoxClassified, classifyVault, classifyBox, vaultActOf, boxActOf
// The classifier checks each stored row once, and hands back every part of the answer it has made on the way.
// A row that fails its checks is thrown, for the vaultDB's handler to tell of.

/** The vault row an adapter fetched for a vault's ask, as stored and unchecked: null for none. */
export type VaultFetched = { vault: unknown }

/** What a datastore answers for a box's ask, as it comes, unchecked: the vault row and the box row, null for none, and the vault's room where it gauged it.
 * A datastore that tested the ask and stored its record itself also answers `ok`, the `act` that came to, and the `presence` of what was stored before.
 */
export type BoxFetched = Readonly<{ world: unknown, box: unknown, capacity?: Capacity | null, ok?: unknown, act?: unknown, presence?: unknown }>

/** What a vault's ask comes to over the row stored. `ok` is true for a good answer and false for a refusal, and `act` says which. */
export type VaultClassified = Readonly<({ ok: true, act: OkAct } | { ok: false, act: RefusedAct }) & {
  /** The vault row as this request leaves it: the record it stores, else the row stored, else the sentinel for none. */
  world:    VaultRow
  /** A good answer's `val`, or a refusal's `dbhas`: the record this request stores, else the row stored, null for none. */
  row:      VaultRow | null
  /** The record for the adapter to store, null where nothing is written. */
  write:    VaultRecord | VaultTombstone | null
  /** What was stored before any write. */
  presence: Presence
}>

/** What a box's ask comes to over the vault and box rows stored. `ok` is true for a good answer and false for a refusal, and `act` says which. */
export type BoxClassified = Readonly<({ ok: true, act: OkAct } | { ok: false, act: RefusedAct | BoxVaultAct }) & {
  /** The vault row stored, or the sentinel for none. */
  world:    VaultRow
  /** A good answer's `val`, or a refusal's `dbhas`: the record this ask stores, else the box row stored, null for none or where its vault refused. */
  box:      BoxRow | null
  /** What was stored at the box's scope before any write; null where its vault refused, and the box row was not judged. */
  presence: Presence | null
  /** The vault's room as the adapter gauged it, null where it gauged none. */
  capacity: Capacity | null
}>

/** Classify a vault's checked ask against the row an adapter fetched. Throws for a row that fails its checks. */
export function classifyVault(ask: VaultAsk, { vault }: VaultFetched): VaultClassified {
  const vaultScope = SX.vaultScopeOf(ask)
  const stored     = vaultRowAt(vaultScope, vault, SX.storedVaultRow)
  const act        = rowActOf(ask, stored)
  const { presence } = stored
  if ((ask.op !== 'get') && isWriteAct(act)) { return { ok: true, act, world: ask.record, row: ask.record, write: ask.record, presence } }
  const found      = { world: stored.row ?? SX.sentinelVaultOf(vaultScope), row: stored.row, write: null, presence }
  return isOkAct(act) ? { ...found, ok: true, act } : { ...found, ok: false, act }
}

const { foundVerdict } = Checkers('storage_issue', ({ obj, bool, oneof }) => ({
  foundVerdict: obj({
    ok:       bool.default(false),
    act:      oneof(EX.writeActVals).nullable().default(null),
    presence: oneof(['void', 'gone', 'live'] as const).nullable().default(null),
  }).refine(({ ok, act }) => ok === (act !== null), 'A datastore names an act for the record it stored, and for nothing else.'),
}))

/** What is stored where `row` is a row or none. */
function presenceOf(row: Meta | null): Presence {
  if (row === null) { return 'void' }
  return (row.am === 'a') ? 'live' : 'gone'
}

// The whole of a box's ask is settled here, top to bottom: what the datastore answered is checked once, at the top,
// and past that the rows are sound and typed and are only read.
/** What a box's ask comes to over what the datastore answered for it. Throws for a row that fails its checks, or that is not at the address asked for.
 * A record the datastore stored itself (`fetched.ok`) is the answer as it stands; else the act is named from the rows, per the tables of `notes/answer-contract.md`.
 */
export function classifyBox(ask: BoxAsk, fetched: BoxFetched): BoxClassified {
  const boxQuery = SX.boxQueryOf(ask)
  const world    = vaultRowAt(boxQuery, fetched.world, boxVaultRow).row ?? SX.sentinelVaultOf(boxQuery)
  const capacity = fetched.capacity ?? null
  const verdict  = foundVerdict.parse(fetched)

  // The vault first. Under a vault that is not live in the life asked for, the box row is not read, whatever is stored for the box.
  const vaultAct = boxVaultActOf(boxQuery, world)
  if (vaultAct !== null) { return { ok: false, act: vaultAct, world, box: null, presence: null, capacity: null } }

  const box      = boxRowAt(boxQuery, fetched.box).row
  if (verdict.ok && (verdict.act !== null)) { return { ok: true, act: verdict.act, world, box, presence: verdict.presence ?? presenceOf(box), capacity } }

  const presence = presenceOf(box)
  const stored: Stored<BoxRow> = (box === null) ? { presence: 'void', row: null } : { presence: presence as 'live' | 'gone', row: box }
  const uncapped = rowActOf(ask, stored)
  const act      = (capacity === null) ? uncapped : cappedActOf(uncapped, capacity)
  if ((ask.op !== 'get') && isWriteAct(act)) { return { ok: true, act, world, box: ask.record, presence, capacity } }
  return isOkAct(act) ? { ok: true, act, world, box, presence, capacity } : { ok: false, act, world, box, presence, capacity }
}

/** Classify a vault request's outcome, based on the stored row. */
export function vaultActOf(request: VaultAsk, vaultRaw: unknown): VaultAct {
  return classifyVault(SX.vaultAsk.parse(request), { vault: vaultRaw }).act
}

/** Classify a box request's outcome, based on its stored vault and box rows. */
export function boxActOf(request: BoxAsk, vaultRaw: unknown, boxRaw: unknown): BoxAct {
  const ask = SX.boxAsk.parse(request)
  return classifyBox(ask, { world: vaultRaw, box: boxRaw }).act
}
// --

// == [A vault write the datastore made]: VaultWritten, vaultWrittenOf
// An adapter whose datastore tests an ask and stores its record in one step hands back what it stored.
// Its parts are checked here, and nothing is classified again.

/** What a datastore answers for a vault record it stored: the act, the row now stored, and what was stored before. Unchecked. */
export type VaultWritten = Readonly<{ act: unknown, vault: unknown, presence: unknown }>

const { writtenAct, writtenPresence } = Checkers('storage_issue', ({ oneof }) => ({
  writtenAct: oneof(EX.writeActVals), writtenPresence: oneof(['void', 'gone', 'live'] as const),
}))

/** The classified answer of a vault write the datastore made. Throws for a part that fails its checks. */
export function vaultWrittenOf(ask: VaultPutAsk | VaultDelAsk, { act, vault, presence }: VaultWritten): VaultClassified {
  const stored = vaultRowAt(SX.vaultScopeOf(ask), vault, SX.storedVaultRow)
  if (stored.row === null) { throw Refuse.storageIssue() }
  return { ok: true, act: writtenAct.parse(act), world: stored.row, row: stored.row, write: null, presence: writtenPresence.parse(presence) }
}
// --
