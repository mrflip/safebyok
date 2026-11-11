/** Classify an ask against the stored rows, per the tables in `notes/answer-contract.md`. */

import { isEqual } from 'es-toolkit'
import type * as Z from 'zod'
import { checkedConsistent } from '../helpers/validator'
import * as Phrases from '../helpers/phrases'
import * as Refuse from '../refusals/throwers'
import * as CX from '../shapes/shapes-core'
import * as EX from '../shapes/shapes-enums'
import * as SX from '../shapes/shapes-storage'
import type { BankScope, VaultScope } from '../shapes/shapes-core'
import type { BoxAct, BoxVaultAct, ListAct, OkAct, RefusedAct, VaultAct, WriteAct } from '../shapes/shapes-enums'
import type {
  BoxAsk, BoxDelAsk, BoxGetAsk, BoxListAsk, BoxPutAsk, BoxQuery, BoxRow, BoxSparse, Capacity, VaultAsk, VaultDelAsk, VaultGetAsk, VaultListAsk, VaultPutAsk, VaultRecord, VaultRow,
} from '../shapes/shapes-storage'
import type { BankListed, BoxesListed } from './vault-db'

// == [Rows and presence]: Meta, presenceVals, Presence, presenceOf, RecordAsk
// Each function below takes the ask first, and the row stored second, null for none.

/** The fields of a row, stored or expected, that the tables compare. */
type Meta = Readonly<Pick<BoxSparse, 'revision_tok' | 'revision_seq' | 'am' | 'vault_tok'> & Partial<Pick<BoxSparse, 'box_tok'>>>

/** What is stored at a scope: no row, a tombstone, or a live row. */
export const presenceVals = ['void', 'gone', 'live'] as const
export type Presence = typeof presenceVals[number]

/** The presence of `row`, `'void'` for null. */
function presenceOf(row: Meta | null): Presence {
  if (row === null) { return 'void' }
  return (row.am === 'a') ? 'live' : 'gone'
}

/** A put or del ask, box or vault: one that carries the row it expects and the record it would store. */
type RecordAsk = VaultPutAsk | VaultDelAsk | BoxPutAsk | BoxDelAsk
// --

// == [Columns]: RevtokCmp, RevseqCmp, revtokCmpOf, revseqCmpOf, lifeTokOf, isLifeOff
// These are the columns of the tables in `notes/answer-contract.md`: what is stored, the two revision comparisons, and the
// `ifPresent` or `ifAbsent` policy that applies. A `revision_tok` names one version of a row, so when the ask's matches the
// stored one, the tables also check that the life token and liveness match.

/** The stored `revision_tok` compared with the ask's.
 * - `'birth'` -- expected an empty row, and none is stored
 * - `'=next'` -- the stored row already has the token this ask would write
 * - `'eq'`    -- expected exactly the token the stored row has
 * - `'neq'`   -- anything else
 */
type RevtokCmp = 'birth' | '=next' | 'eq' | 'neq'

/** The ask's expected `revision_seq` compared with the stored one.
 * - `'birth'` -- expected an empty row
 * - `'eq'`    -- expected exactly the seq the stored row has
 * - `'stale'` -- expected an older revision: a write has intervened
 * - `'ahead'` -- expected a higher revision (or a record where none exists): an impossible situation
 */
type RevseqCmp = 'birth' | 'eq' | 'stale' | 'ahead'

function revtokCmpOf({ expected, record }: RecordAsk, row: Meta | null): RevtokCmp {
  if (row === null)                             { return (expected.revision_tok === SX.VoidRevisionTok) ? 'birth' : 'neq' }
  if (row.revision_tok === record.revision_tok) { return '=next' }
  return (row.revision_tok === expected.revision_tok) ? 'eq' : 'neq'
}

function revseqCmpOf({ expected }: RecordAsk, row: Meta | null): RevseqCmp {
  if (expected.revision_seq === SX.VoidRevisionSeq) { return 'birth' }
  if (row === null)                                 { return 'ahead' }
  if (expected.revision_seq === row.revision_seq)   { return 'eq' }
  return (expected.revision_seq < row.revision_seq) ? 'stale' : 'ahead'
}

// A box's life is named by its `box_tok`. A vault row has none, and its life is its `vault_tok`.
function lifeTokOf({ box_tok, vault_tok }: Meta): string { return box_tok ?? vault_tok }

/** True when a row is stored, and the row expected differs from it in its life token or its liveness. */
function isLifeOff({ expected }: RecordAsk, row: Meta | null): boolean {
  return (row !== null) && ((lifeTokOf(row) !== lifeTokOf(expected)) || (row.am !== expected.am))
}
// --

// == [Tables]: getActOf, putActOf, delActOf, rowActOf
// Each returns the act for the asked-for row, box or vault alike.

/** Classify a get: see the get table in `notes/answer-contract.md`. */
function getActOf({ ifAbsent }: VaultGetAsk | BoxGetAsk, row: Meta | null): VaultAct {
  const presence = presenceOf(row)
  if (presence === 'live') { return 'gotlive' }
  if (presence === 'void') { return (ifAbsent === 'nil') ? 'gotvoid' : 'void' }
  return (ifAbsent === 'nil') ? 'gotgone' : 'gone'
}

/** Classify a put: see the put table in `notes/answer-contract.md`. The first matching row wins. */
function putActOf(ask: VaultPutAsk | BoxPutAsk, row: Meta | null): VaultAct {
  const presence     = presenceOf(row)
  // The policy that applies: `ifPresent` over a live row, `ifAbsent` over a tombstone or void row.
  const opflag       = (presence === 'live') ? ask.ifPresent : ask.ifAbsent
  const revseqCmp    = revseqCmpOf(ask, row)
  const revtokCmp    = revtokCmpOf(ask, row)
  if (revtokCmp  === '=next')                                                     { return 'retcon' }
  if (revseqCmp  === 'ahead')                                                     { return 'ahead' }
  if ((revtokCmp === 'eq')  && ((revseqCmp !== 'eq') || isLifeOff(ask, row)))     { return 'clash' }
  if ((revtokCmp === 'neq') && (revseqCmp === 'eq'))                              { return 'forked' }
  if (revtokCmp  === 'neq')                                                       { return ((presence === 'live') && (opflag === 'get')) ? 'passed' : 'stale' }
  if (presence   === 'void')                                                      { return (opflag === 'add') ? 'born'   : 'void' }
  if (presence   === 'gone')                                                      { return (opflag === 'add') ? 'reborn' : 'gone' }
  if (opflag     === 'repl')                                                      { return 'replaced' }
  return (opflag === 'get') ? 'passed' : 'camped'
}

/** Classify a del: see the del table in `notes/answer-contract.md`. The first matching row wins. */
function delActOf(ask: VaultDelAsk | BoxDelAsk, row: Meta | null): VaultAct {
  const presence     = presenceOf(row)
  const revseqCmp    = revseqCmpOf(ask, row)
  const revtokCmp    = revtokCmpOf(ask, row)
  if (revtokCmp  === '=next')                                                     { return 'retcon' }
  if (revseqCmp  === 'ahead')                                                     { return 'ahead' }
  if ((revtokCmp === 'eq')  && ((revseqCmp !== 'eq') || isLifeOff(ask, row)))     { return 'clash' }
  if ((revtokCmp === 'neq') && (revseqCmp === 'eq'))                              { return 'forked' }
  if (revtokCmp  === 'neq')                                                       { return (presence === 'gone') ? 'gone' : 'stale' }
  if (presence   === 'void')                                                      { return 'void' }
  return (presence === 'gone') ? 'dubdel' : 'deleted'
}

/** Classify an ask against the row stored at its scope. */
function rowActOf(ask: VaultAsk | BoxAsk, row: Meta | null): VaultAct {
  if (ask.op === 'get') { return getActOf(ask, row) }
  if (ask.op === 'put') { return putActOf(ask, row) }
  return delActOf(ask, row)
}
// --

// == [Rows stored]: boxVaultRow, RowOfOtherAddress, vaultRowOf, boxRowOf, boxWorldOf, boxVaultActOf, listedRowOf

// A faulty row throws, with the message of the check that failed. A row is damaged when it fails its own checks: the
// asked-for row throws `damaged_row`, and the vault row of an asked-for box throws `damaged_vault`. A row that is not an
// object, or a sound row stored at another address than the one asked for, means the datastore or its adapter is broken,
// and throws `storage_issue`.
const boxVaultRow = SX.storedVaultRow.refusingAs('damaged_vault')

const RowOfOtherAddress = { kind: 'storage_issue', message: Phrases.rowOfOtherAddress } as const

// Checked against its scope, not its vault_tok: a vault row from another life refuses `vault_gone` or `vault_reborn`, and is no fault of storage.
/** The vault row stored at `vaultScope`, checked by `checker`, which throws for a row that fails its checks. */
function vaultRowOf(vaultScope: VaultScope, vaultRaw: unknown, checker: typeof SX.storedVaultRow): VaultRow | null {
  if (vaultRaw === null)         { return null }
  if (! CX.isPlainBag(vaultRaw)) { throw Refuse.storageIssue() }
  return checker.parseConsistent(vaultRaw, CX.vaultScope.parse(vaultScope), RowOfOtherAddress)
}

/** The box row stored at `boxQuery`, checked. Throws `damaged_row` for a row that fails its checks. */
function boxRowOf(boxQuery: BoxQuery, boxRaw: unknown): BoxRow | null {
  if (boxRaw === null)         { return null }
  if (! CX.isPlainBag(boxRaw)) { throw Refuse.storageIssue() }
  return SX.storedBoxRow.parseConsistent(boxRaw, SX.boxQuery.parse(boxQuery), RowOfOtherAddress)
}

/** The stored vault row of a box ask, or the shell row for none.
 * Throws `damaged_vault` for a row that fails its checks.
 */
function boxWorldOf(vaultScope: VaultScope, vaultRaw: unknown): VaultRow {
  return vaultRowOf(vaultScope, vaultRaw, boxVaultRow) ?? SX.shellVaultOf(vaultScope)
}

/** Classify a box ask's vault row: the act it refuses with, or null when the vault is live in the asked-for life. */
function boxVaultActOf({ vault_tok }: Pick<BoxQuery, 'vault_tok'>, world: VaultRow): BoxVaultAct | null {
  if (world.revision_seq === SX.VoidRevisionSeq) { return 'vault_void' }
  if (world.am !== 'a')                          { return 'vault_gone' }
  return (world.vault_tok === vault_tok) ? null : 'vault_reborn'
}

/** A listed row, checked, and stored at `address`; null for a row that fails its checks. Throws `storage_issue` for one that is not an object, or of another address. */
function listedRowOf<RowT extends object>(rowCheck: Z.ZodType<RowT>, raw: unknown, address: object): RowT | null {
  if (! CX.isPlainBag(raw)) { throw Refuse.storageIssue() }
  const parsed = rowCheck.safeParse(raw)
  return parsed.success ? checkedConsistent(parsed.data, address, RowOfOtherAddress) : null
}
// --

// == [Acts]: isWriteAct, isBirthAct, isOkAct, cappedActOf

/** True when the act tells the caller to store the ask's record. */
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

// == [Classifying]: RowOfVault, RowOfBox, VaultFetched, BoxFetched, BoxesFetched, VaultStored, BoxStored, VaultsStored, BoxesStored, classifyStoredVault, classifyStoredBox, classifyStoredVaults, classifyStoredBoxes, vaultActOf, boxActOf
// The classifier checks each stored row once, and returns everything it worked out on the way to the answer.
// A row that fails its checks throws, and `AdapterVaultDB` turns the throw into a refused answer.

/** A vault row from storage, unchecked, with its vaultlabel. */
export type RowOfVault = { vaultlabel: string, vault: unknown }
/** A box row from storage, unchecked, with its boxlabel. */
export type RowOfBox   = { boxlabel: string, box: unknown }

/** The vault row an adapter fetched for a vault ask, unchecked, or null for none. */
export type VaultFetched = { vault: unknown }

/** The rows an adapter fetched for a box ask, unchecked:
 * - `box`      -- the stored box row, as fetched before any write (null for none)
 * - `world`    -- the vault row, fetched in the same step (null for none)
 * - `capacity` -- the vault's {@link Capacity} stats, for adapters that return it
 */
export type BoxFetched = Readonly<{ world: unknown, box: unknown, capacity?: Capacity | null }>

/** The rows an adapter fetched for a `listBoxes` ask in one step, unchecked: the vault row (null for none) and the box rows of the asked-for life. */
export type BoxesFetched = Readonly<{ world: unknown, boxes: readonly RowOfBox[] }>

/** A vault ask, classified against the stored row.
 * - `ok`  -- true for a good answer, false for a refusal
 * - `act` -- directs how to route and handle the answer
 */
export type VaultStored = Readonly<({ ok: true, act: OkAct } | { ok: false, act: RefusedAct }) & {
  /** The vault row after this ask: the record it stores, else the stored row, else the shell for none. */
  world:    VaultRow
  /** A good answer's `val`, or a refusal's `dbhas`: the record this ask stores, else the stored vault row, or null for none. */
  vault:    VaultRow | null
  /** What was stored at the vault's scope before any write. */
  presence: Presence
}>

/** A box ask, classified against the stored vault and box rows.
 * - `ok`  -- true for a good answer, false for a refusal
 * - `act` -- directs how to route and handle the answer
 */
export type BoxStored = Readonly<({ ok: true, act: OkAct } | { ok: false, act: RefusedAct | BoxVaultAct }) & {
  /** The vault row stored, or the shell for none. */
  world:    VaultRow
  /** A good answer's `val`, or a refusal's `dbhas`: the record this ask stores, else the stored box row, or null for none or when the vault row refused. */
  box:      BoxRow | null
  /** What was stored at the box's scope before any write, or null when the vault row refused and the box row went unchecked. */
  presence: Presence | null
  /** The vault's capacity as the adapter counted it, or null if it did not. */
  capacity: Capacity | null
}>

/** A `listVaults` ask, classified against the vault rows stored: `got` with rows, `gotvoid` with none, its world the bank's scope. */
export type VaultsStored = Readonly<{ ok: true, act: ListAct, world: BankScope, listed: BankListed }>

/** A `listBoxes` ask, classified against the stored vault row and box rows.
 * - `ok`     -- true for a good answer; false when the vault is not live in the asked-for life
 * - `world`  -- the vault row stored, or the shell for none
 * - `listed` -- the boxes, sparse, and the rows that failed their checks; null when the vault refused
 */
export type BoxesStored = Readonly<({ ok: true, act: ListAct, listed: BoxesListed } | { ok: false, act: BoxVaultAct, listed: null }) & { world: VaultRow }>

// A vault ask is classified entirely here, top to bottom.
/** Classify a vault ask against the row an adapter fetched for it, per the tables in `notes/answer-contract.md`.
 * When {@link isWriteAct} is true of the act, the adapter stores `ask.record` in the same step that fetched the row.
 * Throws for a row that fails its checks or is stored at another scope, and `gate_issue` when a gate verb's record fails that verb's checks.
 */
export function classifyStoredVault(ask: VaultAsk, { vault }: VaultFetched): VaultStored {
  const row      = vaultRowOf(ask, vault, SX.storedVaultRow)
  const presence = presenceOf(row)
  const world    = row ?? SX.shellVaultOf(ask)
  const tabled   = rowActOf(ask, row)

  // A gate verb's put also checks its record against the gate of the live row it would replace.
  const isGatePut = (ask.op === 'put') && (ask.gateVerb !== undefined) && (tabled === 'replaced') && (row?.am === 'a')
  const act      = isGatePut ? GateActOfForVerb[ask.gateVerb](ask.record, row) : tabled

  if ((ask.op !== 'get') && isWriteAct(act)) { return { ok: true, act, world: ask.record, vault: ask.record, presence } }
  return isOkAct(act) ? { ok: true, act, world, vault: row, presence } : { ok: false, act, world, vault: row, presence }
}

// A box ask is classified entirely here, top to bottom. Each fetched row is checked once, when first read, and is
// sound and typed from then on.
/** Classify a box ask against the rows an adapter fetched for it, per the tables in `notes/answer-contract.md`.
 * Throws for a row that fails its checks or is stored at another address.
 */
export function classifyStoredBox(ask: BoxAsk, fetched: BoxFetched): BoxStored {
  const world    = boxWorldOf(ask, fetched.world)
  const capacity = fetched.capacity ?? null

  // The vault first: when it is not live in the asked-for life, the box row goes unchecked, whatever is stored there.
  const vaultAct = boxVaultActOf(ask, world)
  if (vaultAct !== null) { return { ok: false, act: vaultAct, world, box: null, presence: null, capacity: null } }

  const box      = boxRowOf(ask, fetched.box)
  const presence = presenceOf(box)
  const uncapped = rowActOf(ask, box)
  const act      = (capacity === null) ? uncapped : cappedActOf(uncapped, capacity)
  if ((ask.op !== 'get') && isWriteAct(act)) { return { ok: true, act, world, box: ask.record, presence, capacity } }
  return isOkAct(act) ? { ok: true, act, world, box, presence, capacity } : { ok: false, act, world, box, presence, capacity }
}

// A row that fails its checks is listed among the damaged rows, under the label storage holds it by, so one bad row
// never hides the rest. A row that is not an object, or is stored at another address, still throws.
/** Classify a `listVaults` ask against the vault rows an adapter fetched for it: each row checked, a damaged one set aside. */
export function classifyStoredVaults(ask: VaultListAsk, vaults: readonly RowOfVault[]): VaultsStored {
  const { applabel, user_id } = ask
  const listed: BankListed = { vaults: [], damaged_rows: [] }
  for (const { vaultlabel, vault } of vaults) {
    const address = { applabel, user_id, vaultlabel }
    const row     = listedRowOf(SX.vaultRow, vault, address)
    if (row === null) { listed.damaged_rows.push(SX.damagedVaultOf(address)) } else { listed.vaults.push(row) }
  }
  return { ok: true, act: (vaults.length > 0) ? 'got' : 'gotvoid', world: { applabel, user_id }, listed }
}

/** Classify a `listBoxes` ask against the rows an adapter fetched for it: the vault row first, then each box row, a damaged one set aside.
 * Throws `damaged_vault` for a vault row that fails its checks.
 */
export function classifyStoredBoxes(ask: BoxListAsk, fetched: BoxesFetched): BoxesStored {
  const world    = boxWorldOf(ask, fetched.world)
  const vaultAct = boxVaultActOf(ask, world)
  if (vaultAct !== null) { return { ok: false, act: vaultAct, world, listed: null } }

  const { applabel, user_id, vaultlabel, vault_tok } = ask
  const listed: BoxesListed = { boxes: [], damaged_rows: [] }
  for (const { boxlabel, box } of fetched.boxes) {
    const address = { applabel, user_id, vaultlabel, boxlabel, vault_tok }
    const row     = listedRowOf(SX.boxRow, box, address)
    if (row === null) { listed.damaged_rows.push(SX.damagedBoxOf(address, vault_tok)) } else { listed.boxes.push(SX.boxSparse.parse(row)) }
  }
  return { ok: true, act: (fetched.boxes.length > 0) ? 'got' : 'gotvoid', world, listed }
}

/** Classify a vault ask's outcome, based on the stored row. */
export function vaultActOf(ask: VaultAsk, vaultRaw: unknown): VaultAct {
  return classifyStoredVault(SX.vaultAsk.parse(ask), { vault: vaultRaw }).act
}

/** Classify a box ask's outcome, based on its stored vault and box rows. */
export function boxActOf(ask: BoxAsk, vaultRaw: unknown, boxRaw: unknown): BoxAct {
  return classifyStoredBox(SX.boxAsk.parse(ask), { world: vaultRaw, box: boxRaw }).act
}
// --
