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
// Each function below takes the request first, and what is stored second.

/** The fields of a row, stored or expected, that the tables compare. */
type Meta = Readonly<Pick<BoxSparse, 'revision_tok' | 'revision_seq' | 'am' | 'vault_tok'> & Partial<Pick<BoxSparse, 'box_tok'>>>

/** A box or vault request, cut down to what the tables compare. A put or del carries the row it expects to find and the record it would write. */
type Asked    = GetAsked | PutAsked | DelAsked
type GetAsked = Readonly<{ op: 'get', ifAbsent: EX.IfAbsent }>
type PutAsked = Readonly<{ op: 'put', ifAbsent: EX.PutIfAbsent, ifPresent: EX.IfPresent, expected: Meta, record: Revision }>
type DelAsked = Readonly<{ op: 'del', expected: Meta, record: Revision }>

/** What is stored at a scope: no row, a tombstone, or a live row. */
export const presenceVals = ['void', 'gone', 'live'] as const
export type Presence = typeof presenceVals[number]

/** The row stored at a scope, or null for none, with its {@link Presence}. */
type Stored<RowT extends Meta = Meta> = Readonly<{ presence: 'void', row: null } | { presence: Exclude<Presence, 'void'>, row: RowT }>
// --

// == [Columns]: RevtokCmp, RevseqCmp, revtokCmpOf, revseqCmpOf, lifeTokOf, isLifeOff
// These are the columns of the tables in `notes/answer-contract.md`: what is stored, the two revision comparisons, and the
// `ifPresent` or `ifAbsent` policy that applies. A `revision_tok` names one version of a row, so when the request's matches the
// stored one, the tables also check that the life token and liveness match.

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
// Each returns the act for the requested row, box or vault alike.

/** Classify a get: see the get table in `notes/answer-contract.md`. */
function getActOf({ ifAbsent }: GetAsked, { presence }: Stored): VaultAct {
  if (presence === 'live') { return 'gotlive' }
  if (presence === 'void') { return (ifAbsent === 'nil') ? 'gotvoid' : 'void' }
  return (ifAbsent === 'nil') ? 'gotgone' : 'gone'
}

/** Classify a put: see the put table in `notes/answer-contract.md`. The first matching row wins. */
function putActOf(asked: PutAsked, stored: Stored): VaultAct {
  const { presence } = stored
  // The policy that applies: `ifPresent` over a live row, `ifAbsent` over a tombstone or void row.
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

// A faulty row throws, with the message of the check that failed. A row is damaged when it fails its own checks: the
// requested row throws `damaged_row`, and the vault row of a requested box throws `damaged_vault`. A row that is not an
// object, or a sound row stored at another address than the one requested, means the datastore or its adapter is broken,
// and throws `storage_issue`.
const boxVaultRow = SX.storedVaultRow.refusingAs('damaged_vault')

// Checked against its scope, not its vault_tok: a vault row from another life refuses `vault_gone` or `vault_reborn`, and is no fault of storage.
/** The vault row stored at `vaultScope`, checked by `checker`, which throws for a row that fails its checks. */
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

/** The stored vault row of a box request, or the shell row for none.
 * Throws `damaged_vault` for a row that fails its checks.
 */
export function boxWorldOf(vaultScope: VaultScope, vaultRaw: unknown): VaultRow {
  return vaultRowAt(vaultScope, vaultRaw, boxVaultRow).row ?? SX.shellVaultOf(vaultScope)
}

/** Classify a box request's vault row: the act it refuses with, or null when the vault is live in the requested life. */
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

/** True when the act makes a good answer: the record is stored, or the stored row is returned. */
export function isOkAct(act: BoxAct | VaultAct): act is OkAct { return isWriteAct(act) || (EX.foundActVals as readonly string[]).includes(act) }

// The cap is soft: `capacity` is counted outside any lock, just before the write, and a box already stored is never refused
// for it. Only `born` adds a row to the count, which includes the tombstones of the vault's life.
/** `act`, or `vault_full` for a `born` in a vault at its cap. */
export function cappedActOf(act: BoxAct, capacity: Capacity): BoxAct {
  const { boxes } = SX.capacity.parse(capacity)
  return ((act === 'born') && (boxes.used >= boxes.max)) ? 'vault_full' : act
}
// --

// == [Gate verbs]: replacePassphraseActOf, addPasskeyActOf, revokePasskeyActOf, GateActOfForVerb
// A gate verb is a put of the vault record over its live row, with checks of its own that compare the record's gate with
// the stored one. They run on the row the adapter fetched in the same step that stores the record, never on a row a
// caller fetched earlier. Each returns `replaced` when the record may be stored, or the act that stops it, and throws
// `gate_issue` when the record changes more than its verb allows.

function replacePassphraseActOf(record: VaultRecord, stored: VaultRecord): VaultAct {
  if (stored.registered_at !== record.registered_at)                      { throw Refuse.gateIssue(stored, Phrases.RegisteredAtNotStored) }
  if (record.gate.gate_epoch !== (stored.gate.gate_epoch + 1))            { throw Refuse.gateIssue(stored, Phrases.GateEpochNotNext) }
  if (! isEqual(record.gate.passkey_wayin, stored.gate.passkey_wayin))    { throw Refuse.gateIssue(stored, Phrases.OtherWayinMoved) }
  return 'replaced'
}

// `camped`: a passkey wayin is already stored.
function addPasskeyActOf(record: VaultRecord, stored: VaultRecord): VaultAct {
  if (stored.registered_at !== record.registered_at)                           { throw Refuse.gateIssue(stored, Phrases.RegisteredAtNotStored) }
  if (stored.gate.passkey_wayin !== null)                                      { return 'camped' }
  if (record.gate.gate_epoch !== (stored.gate.gate_epoch + 1))                 { throw Refuse.gateIssue(stored, Phrases.GateEpochNotNext) }
  if (! isEqual(record.gate.passphrase_wayin, stored.gate.passphrase_wayin))   { throw Refuse.gateIssue(stored, Phrases.OtherWayinMoved) }
  return 'replaced'
}

// `passed`: no passkey wayin is stored, so the stored row is returned unchanged.
function revokePasskeyActOf(record: VaultRecord, stored: VaultRecord): VaultAct {
  if (stored.registered_at !== record.registered_at)                           { throw Refuse.gateIssue(stored, Phrases.RegisteredAtNotStored) }
  if (stored.gate.passkey_wayin === null)                                      { return 'passed' }
  if (record.gate.gate_epoch !== (stored.gate.gate_epoch + 1))                 { throw Refuse.gateIssue(stored, Phrases.GateEpochNotNext) }
  if (! isEqual(record.gate.passphrase_wayin, stored.gate.passphrase_wayin))   { throw Refuse.gateIssue(stored, Phrases.OtherWayinMoved) }
  return 'replaced'
}

const GateActOfForVerb: Readonly<Record<EX.GateVerb, (record: VaultRecord, stored: VaultRecord) => VaultAct>> = {
  replacePassphrase: replacePassphraseActOf, addPasskey: addPasskeyActOf, revokePasskey: revokePasskeyActOf,
}
// --

// == [Classifying]: VaultFetched, BoxFetched, VaultClassified, BoxClassified, classifyVault, classifyBox, vaultActOf, boxActOf
// The classifier checks each stored row once, and returns everything it worked out on the way to the answer.
// A row that fails its checks throws, and `AdapterVaultDB` turns the throw into a refused answer.

/** The vault row an adapter fetched for a vault request, unchecked, or null for none. */
export type VaultFetched = { vault: unknown }

/** The rows an adapter fetched for a box request, unchecked:
 * - `box`      -- the stored box row, as fetched before any write (null for none)
 * - `world`    -- the vault row, fetched in the same step (null for none)
 * - `capacity` -- the vault's {@link Capacity} stats, for adapters that return it
 */
export type BoxFetched = Readonly<{ world: unknown, box: unknown, capacity?: Capacity | null }>

/** A vault request, classified against the stored row.
 * - `ok`  -- true for a good answer, false for a refusal
 * - `act` -- directs how to route and handle the answer
 */
export type VaultClassified = Readonly<({ ok: true, act: OkAct } | { ok: false, act: RefusedAct }) & {
  /** The vault row after this request: the record it stores, else the stored row, else the shell for none. */
  world:    VaultRow
  /** A good answer's `val`, or a refusal's `dbhas`: the record this request stores, else the stored vault row, or null for none. */
  vault:    VaultRow | null
  /** What was stored at the vault's scope before any write. */
  presence: Presence
}>

/** A box request, classified against the stored vault and box rows.
 * - `ok`  -- true for a good answer, false for a refusal
 * - `act` -- directs how to route and handle the answer
 */
export type BoxClassified = Readonly<({ ok: true, act: OkAct } | { ok: false, act: RefusedAct | BoxVaultAct }) & {
  /** The vault row stored, or the shell for none. */
  world:    VaultRow
  /** A good answer's `val`, or a refusal's `dbhas`: the record this request stores, else the stored box row, or null for none or when the vault row refused. */
  box:      BoxRow | null
  /** What was stored at the box's scope before any write, or null when the vault row refused and the box row went unchecked. */
  presence: Presence | null
  /** The vault's capacity as the adapter counted it, or null if it did not. */
  capacity: Capacity | null
}>

// A vault request is classified entirely here, top to bottom.
/** Classify a vault request against the row an adapter fetched for it, per the tables in `notes/answer-contract.md`.
 * When {@link isWriteAct} is true of the act, the adapter stores `ask.record` in the same step that fetched the row.
 * Throws for a row that fails its checks or is stored at another scope, and `gate_issue` when a gate verb's record fails that verb's checks.
 */
export function classifyVault(ask: VaultAsk, { vault }: VaultFetched): VaultClassified {
  const stored   = vaultRowAt(ask, vault, SX.storedVaultRow)
  const { presence, row } = stored
  const world    = row ?? SX.shellVaultOf(ask)
  const tabled   = rowActOf(ask, stored)

  // A gate verb's put also checks its record against the gate of the live row it would replace.
  const isGatePut = (ask.op === 'put') && (ask.gateVerb !== undefined) && (tabled === 'replaced') && (row?.am === 'a')
  const act      = isGatePut ? GateActOfForVerb[ask.gateVerb](ask.record, row) : tabled

  if ((ask.op !== 'get') && isWriteAct(act)) { return { ok: true, act, world: ask.record, vault: ask.record, presence } }
  return isOkAct(act) ? { ok: true, act, world, vault: row, presence } : { ok: false, act, world, vault: row, presence }
}

/** The presence of `row`, `'void'` for null. */
function presenceOf(row: Meta | null): Presence {
  if (row === null) { return 'void' }
  return (row.am === 'a') ? 'live' : 'gone'
}

// A box request is classified entirely here, top to bottom. Each fetched row is checked once, when first read, and is
// sound and typed from then on.
/** Classify a box request against the rows an adapter fetched for it, per the tables in `notes/answer-contract.md`.
 * Throws for a row that fails its checks or is stored at another address.
 */
export function classifyBox(ask: BoxAsk, fetched: BoxFetched): BoxClassified {
  const world    = boxWorldOf(ask, fetched.world)
  const capacity = fetched.capacity ?? null

  // The vault first: when it is not live in the requested life, the box row goes unchecked, whatever is stored there.
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
