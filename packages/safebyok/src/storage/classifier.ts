/** Classify a get, put or del against the stored rows, per the tables in `notes/answer-contract.md`. */

import { isEqual } from 'es-toolkit'
import * as Phrases from '../helpers/phrases'
import * as Refuse from '../refusals/throwers'
import * as CX from '../shapes/shapes-core'
import * as EX from '../shapes/shapes-enums'
import * as SX from '../shapes/shapes-storage'
import type { VaultScope } from '../shapes/shapes-core'
import type { BoxAct, BoxVaultAct, OkAct, RefusedAct, VaultAct, WriteAct } from '../shapes/shapes-enums'
import type { BoxAsk, BoxQuery, BoxRow, BoxSparse, Capacity, Revision, VaultAsk, VaultRecord, VaultRow } from '../shapes/shapes-storage'

// == [Asked and stored]: Meta, Asked, GetAsked, PutAsked, DelAsked, presenceVals, Presence, Stored
// Every function below takes what was asked first, and what is stored second.

/** The fields of a row, stored or expected, that the tables compare. */
type Meta = Readonly<Pick<BoxSparse, 'revision_tok' | 'revision_seq' | 'am' | 'vault_tok'> & Partial<Pick<BoxSparse, 'box_tok'>>>

/** A box's or a vault's request, as the tables read it. A put or del has the row it expects to find and the record it would write. */
type Asked    = GetAsked | PutAsked | DelAsked
type GetAsked = Readonly<{ op: 'get', ifAbsent: EX.IfAbsent }>
type PutAsked = Readonly<{ op: 'put', ifAbsent: EX.PutIfAbsent, ifPresent: EX.IfPresent, expected: Meta, record: Revision }>
type DelAsked = Readonly<{ op: 'del', expected: Meta, record: Revision }>

/** What is stored at a scope: no row, a tombstone, or a live row. */
export const presenceVals = ['void', 'gone', 'live'] as const
export type Presence = typeof presenceVals[number]

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

// == [Rows stored]: boxVaultRow, vaultRowAt, boxRowAt, boxWorldOf, boxVaultActOf

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

/** The vault row above a box's ask, as stored at its scope: the sentinel row for none. Throws `damaged_vault` for a row that fails its checks. */
export function boxWorldOf(vaultScope: VaultScope, vaultRaw: unknown): VaultRow {
  return vaultRowAt(vaultScope, vaultRaw, boxVaultRow).row ?? SX.sentinelVaultOf(vaultScope)
}

/** The act a box request refuses with for its vault's stored row, or null where the vault is live in the life asked for. */
export function boxVaultActOf({ vault_tok }: Pick<BoxQuery, 'vault_tok'>, world: VaultRow): BoxVaultAct | null {
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
/** The act, or `vault_full` for a `born` in a vault at its cap: no other act adds a box row to the count. */
export function cappedActOf(act: BoxAct, capacity: Capacity): BoxAct {
  const { boxes } = SX.capacity.parse(capacity)
  return ((act === 'born') && (boxes.used >= boxes.max)) ? 'vault_full' : act
}
// --

// == [Gate verbs]: replacePassphraseActOf, addPasskeyActOf, revokePasskeyActOf, GateActOf
// A gate verb is a put of the vault's record over its live row. Each has tests of its own, of the record against the gate stored:
// they run here, over the row the adapter fetched in the step that stores the record, and never over a row a caller read earlier.
// Each answers `replaced` for a record to store, or the act that stops it, and throws `gate_issue` for a record that changes more than its verb does.

function replacePassphraseActOf(record: VaultRecord, stored: VaultRecord): VaultAct {
  if (stored.registered_at !== record.registered_at)                      { throw Refuse.gateIssue(stored, Phrases.RegisteredAtNotStored) }
  if (record.gate.gate_epoch !== (stored.gate.gate_epoch + 1))            { throw Refuse.gateIssue(stored, Phrases.GateEpochNotNext) }
  if (! isEqual(record.gate.passkey_wayin, stored.gate.passkey_wayin))    { throw Refuse.gateIssue(stored, Phrases.OtherWayinMoved) }
  return 'replaced'
}

// `camped`: a passkey wayin is already laid on.
function addPasskeyActOf(record: VaultRecord, stored: VaultRecord): VaultAct {
  if (stored.registered_at !== record.registered_at)                           { throw Refuse.gateIssue(stored, Phrases.RegisteredAtNotStored) }
  if (stored.gate.passkey_wayin !== null)                                      { return 'camped' }
  if (record.gate.gate_epoch !== (stored.gate.gate_epoch + 1))                 { throw Refuse.gateIssue(stored, Phrases.GateEpochNotNext) }
  if (! isEqual(record.gate.passphrase_wayin, stored.gate.passphrase_wayin))   { throw Refuse.gateIssue(stored, Phrases.OtherWayinMoved) }
  return 'replaced'
}

// `passed`: there is no passkey wayin to take off, and the row stored is the answer.
function revokePasskeyActOf(record: VaultRecord, stored: VaultRecord): VaultAct {
  if (stored.registered_at !== record.registered_at)                           { throw Refuse.gateIssue(stored, Phrases.RegisteredAtNotStored) }
  if (stored.gate.passkey_wayin === null)                                      { return 'passed' }
  if (record.gate.gate_epoch !== (stored.gate.gate_epoch + 1))                 { throw Refuse.gateIssue(stored, Phrases.GateEpochNotNext) }
  if (! isEqual(record.gate.passphrase_wayin, stored.gate.passphrase_wayin))   { throw Refuse.gateIssue(stored, Phrases.OtherWayinMoved) }
  return 'replaced'
}

const GateActOf: Readonly<Record<EX.GateVerb, (record: VaultRecord, stored: VaultRecord) => VaultAct>> = {
  replacePassphrase: replacePassphraseActOf, addPasskey: addPasskeyActOf, revokePasskey: revokePasskeyActOf,
}
// --

// == [Classifying]: VaultFetched, BoxFetched, VaultClassified, BoxClassified, classifyVault, classifyBox, vaultActOf, boxActOf
// The classifier checks each stored row once, and hands back every part of the answer it has made on the way.
// A row that fails its checks is thrown, for the vaultDB's handler to tell of.

/** The vault row an adapter fetched for a vault's ask, as stored and unchecked: null for none. */
export type VaultFetched = { vault: unknown }

/** The rows an adapter fetched for a box's ask, as stored and unchecked: its vault row as `world` and the box row, each null for none, and the vault's room where the adapter gauged it. */
export type BoxFetched = Readonly<{ world: unknown, box: unknown, capacity?: Capacity | null }>

/** What a vault's ask comes to over the row stored. `ok` is true for a good answer and false for a refusal, and `act` says which. */
export type VaultClassified = Readonly<({ ok: true, act: OkAct } | { ok: false, act: RefusedAct }) & {
  /** The vault row as this ask leaves it: the record it stores, else the row stored, else the sentinel for none. */
  world:    VaultRow
  /** A good answer's `val`, or a refusal's `dbhas`: the record this ask stores, else the vault row stored, null for none. */
  vault:    VaultRow | null
  /** What was stored at the vault's scope before any write. */
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

// The whole of a vault's ask is settled here, top to bottom, as a box's is in `classifyBox`.
/** What a vault's ask comes to over the row an adapter fetched for it, per the tables of `notes/answer-contract.md`.
 * Where `isWriteAct` holds of the act, the adapter stores `ask.record`, in the step it fetched the row in.
 * Throws for a row that fails its checks, or that is not at the scope asked for, and `gate_issue` for a gate verb's record that fails that verb's tests.
 */
export function classifyVault(ask: VaultAsk, { vault }: VaultFetched): VaultClassified {
  const stored   = vaultRowAt(ask, vault, SX.storedVaultRow)
  const { presence, row } = stored
  const world    = row ?? SX.sentinelVaultOf(ask)
  const tabled   = rowActOf(ask, stored)

  // A gate verb's put has tests of its own, of its record against the gate of the live row it would replace.
  const isGatePut = (ask.op === 'put') && (ask.gateVerb !== undefined) && (tabled === 'replaced') && (row?.am === 'a')
  const act      = isGatePut ? GateActOf[ask.gateVerb](ask.record, row) : tabled

  if ((ask.op !== 'get') && isWriteAct(act)) { return { ok: true, act, world: ask.record, vault: ask.record, presence } }
  return isOkAct(act) ? { ok: true, act, world, vault: row, presence } : { ok: false, act, world, vault: row, presence }
}

/** What is stored where `row` is a row or none. */
function presenceOf(row: Meta | null): Presence {
  if (row === null) { return 'void' }
  return (row.am === 'a') ? 'live' : 'gone'
}

// The whole of a box's ask is settled here, top to bottom: each row fetched is checked once, as it is first read,
// and past that the rows are sound and typed and are only read.
/** What a box's ask comes to over the rows an adapter fetched for it, per the tables of `notes/answer-contract.md`.
 * Throws for a row that fails its checks, or that is not at the address asked for.
 */
export function classifyBox(ask: BoxAsk, fetched: BoxFetched): BoxClassified {
  const world    = boxWorldOf(ask, fetched.world)
  const capacity = fetched.capacity ?? null

  // The vault first. Under a vault that is not live in the life asked for, the box row is not read, whatever is stored for the box.
  const vaultAct = boxVaultActOf(ask, world)
  if (vaultAct !== null) { return { ok: false, act: vaultAct, world, box: null, presence: null, capacity: null } }

  const box      = boxRowAt(ask, fetched.box).row
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
