/** Classify a bankDB ask against the stored rows, per the tables in `notes/answer-contract.md`. */

import { isEqual, omit } from 'es-toolkit'
import type * as Z from 'zod'
import { checkedConsistent } from '../helpers/validator'
import * as Phrases from '../helpers/phrases'
import * as Refuse from '../refusals/throwers'
import * as CX from '../shapes/shapes-core'
import * as EX from '../shapes/shapes-enums'
import * as SX from '../shapes/shapes-storage'
import * as BX from '../shapes/shapes-bankdb'
import type { BankScope, GateScope, VaultScope } from '../shapes/shapes-core'
import type { BoxAct, BoxVaultAct, GotAct, IfAbsent, IfPresent, ListAct, OkAct, ParentBankAct, PutIfAbsent, RefusedAct, VaultAct, WriteAct } from '../shapes/shapes-enums'
import type { Capacity } from '../shapes/shapes-storage'
import type { BankBuildAsk, BankDelAsk, BankEnsureAsk, BankRecord, BankRow, BoxAsk, BoxListAsk, BoxQuery, BoxRow, GatePutAsk, GateRecord, VaultAsk, VaultRow } from '../shapes/shapes-bankdb'
import type { BankEnsured, BoxesListed } from './bank-db'

// == [Rows and presence]: Meta, presenceVals, Presence, presenceOf, RecordAsk, PutAsk
// Each function below takes the ask first, and the row stored second, null for none.

/** The fields of a row, stored or expected, that the tables compare: its revision, its liveness, and the life toks it carries. */
type Meta = Readonly<{ revision_tok: string, revision_seq: number, am: EX.Am, bank_tok?: string, gate_tok?: string, vault_tok?: string, box_tok?: string }>

/** What is stored at a scope: no row, a tombstone, or a live row. */
export const presenceVals = ['void', 'gone', 'live'] as const
export type Presence = typeof presenceVals[number]

/** The presence of `row`, `'void'` for null. */
function presenceOf(row: Meta | null): Presence {
  if (row === null) { return 'void' }
  return (row.am === 'a') ? 'live' : 'gone'
}

/** A put or del ask, of any row: one that carries the row it expects and the record it would store. */
type RecordAsk = Readonly<{ expected: Meta, record: Meta }>
/** A put ask, of any row, with the policies that apply over a live row and over a tombstone or none. */
type PutAsk    = RecordAsk & Readonly<{ ifAbsent: PutIfAbsent, ifPresent: IfPresent }>
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

// A row's life is named by its own life tok: a box's `box_tok`, a gate's `gate_tok`, a vault's `vault_tok`, a bank's
// `bank_tok`. A row also carries the life tok of the row above it, so its own is the first of these it has.
function lifeTokOf({ box_tok, gate_tok, vault_tok, bank_tok }: Meta): string | undefined { return box_tok ?? gate_tok ?? vault_tok ?? bank_tok }

/** True when a row is stored, and the row expected differs from it in its life token or its liveness. */
function isLifeOff({ expected }: RecordAsk, row: Meta | null): boolean {
  return (row !== null) && ((lifeTokOf(row) !== lifeTokOf(expected)) || (row.am !== expected.am))
}
// --

// == [Tables]: getActOf, putActOf, delActOf, rowActOf
// Each returns the act for the asked-for row, of whatever kind.

/** Classify a get: see the get table in `notes/answer-contract.md`. */
function getActOf({ ifAbsent }: { ifAbsent: IfAbsent }, row: Meta | null): VaultAct {
  const presence = presenceOf(row)
  if (presence === 'live') { return 'gotlive' }
  if (presence === 'void') { return (ifAbsent === 'nil') ? 'gotvoid' : 'void' }
  return (ifAbsent === 'nil') ? 'gotgone' : 'gone'
}

/** Classify a put: see the put table in `notes/answer-contract.md`. The first matching row wins. */
function putActOf(ask: PutAsk, row: Meta | null): VaultAct {
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
function delActOf(ask: RecordAsk, row: Meta | null): VaultAct {
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

/** Classify a vault or box ask against the row stored at its scope. */
function rowActOf(ask: VaultAsk | BoxAsk, row: Meta | null): VaultAct {
  if (ask.op === 'get') { return getActOf(ask, row) }
  if (ask.op === 'put') { return putActOf(ask, row) }
  return delActOf(ask, row)
}
// --

// == [Rows stored]: boxVaultRow, RowOfOtherAddress, bankRowOf, gateRowOf, mainGateOf, vaultRowOf, boxRowOf, boxParentOf, parentBankActOf, boxVaultActOf, listedRowOf

// A faulty row throws, with the message of the check that failed. A row is damaged when it fails its own checks: the
// asked-for row, and a bank row above, throw `damaged_row`, and the vault row of an asked-for box throws `damaged_vault`.
// A row that is not an object, or a sound row stored at another address than the one asked for, means the datastore or
// its adapter is broken, and throws `storage_issue`.
const boxVaultRow = BX.storedVaultRow.refusingAs('damaged_vault')

const RowOfOtherAddress = { kind: 'storage_issue', message: Phrases.rowOfOtherAddress } as const

/** The bank row stored at `bankScope`, checked, or null for none. Throws `damaged_row` for a row that fails its checks. */
function bankRowOf(bankScope: BankScope, bankRaw: unknown): BankRow | null {
  if (bankRaw === null)         { return null }
  if (! CX.isPlainBag(bankRaw)) { throw Refuse.storageIssue() }
  return BX.storedBankRow.parseConsistent(bankRaw, CX.bankScope.parse(bankScope), RowOfOtherAddress)
}

// A row under another `bank_tok` than its bank row's is of an ended life of the bank: it counts as no row, as a box row
// under another `vault_tok` does.
/** The gate row stored at `gateScope` under the bank row `parent`, checked, or null for none. Throws `damaged_row` for a row that fails its checks. */
function gateRowOf(gateScope: GateScope, gateRaw: unknown, parent: BankRow): GateRecord | null {
  if (gateRaw === null)         { return null }
  if (! CX.isPlainBag(gateRaw)) { throw Refuse.storageIssue() }
  const gate = BX.storedGateRow.parseConsistent(gateRaw, CX.gateScope.parse(gateScope), RowOfOtherAddress)
  return (gate.bank_tok === parent.bank_tok) ? gate : null
}

// A live bank row has a live `main` gate row: one without is damage, not a state.
/** The `main` gate row of the live bank `parent`. Throws `damaged_row` for none, or for a row that fails its checks. */
function mainGateOf(bankScope: BankScope, gateRaw: unknown, parent: BankRecord): GateRecord {
  const gate = gateRowOf({ ...bankScope, gatelabel: 'main' }, gateRaw, parent)
  if (gate === null) { throw Refuse.mainGateMissing(parent) }
  return gate
}

/** The vault row stored at `vaultScope` under the bank row `parent`, checked, or null for none. Throws `damaged_row` for a row that fails its checks. */
function vaultRowOf(vaultScope: VaultScope, vaultRaw: unknown, parent: BankRow): VaultRow | null {
  if (vaultRaw === null)         { return null }
  if (! CX.isPlainBag(vaultRaw)) { throw Refuse.storageIssue() }
  const vault = BX.storedVaultRow.parseConsistent(vaultRaw, CX.vaultScope.parse(vaultScope), RowOfOtherAddress)
  return (vault.bank_tok === parent.bank_tok) ? vault : null
}

/** The box row stored at `boxQuery` under the vault row `parent`, checked, or null for none. Throws `damaged_row` for a row that fails its checks. */
function boxRowOf(boxQuery: BoxQuery, boxRaw: unknown, parent: VaultRow): BoxRow | null {
  if (boxRaw === null)         { return null }
  if (! CX.isPlainBag(boxRaw)) { throw Refuse.storageIssue() }
  const box = BX.storedBoxRow.parseConsistent(boxRaw, CX.boxscope.parse(boxQuery), RowOfOtherAddress)
  return (BX.vaultLifeOf(box) === BX.vaultLifeOf(parent)) ? box : null
}

// Checked against its scope, not its vault_tok: a vault row from another life refuses `vault_gone` or `vault_reborn`, and is no fault of storage.
/** The vault row above a box ask, or the shell row for none. Throws `damaged_vault` for a row that fails its checks. */
function boxParentOf(vaultScope: VaultScope, vaultRaw: unknown): VaultRow {
  if (vaultRaw === null)         { return BX.shellVaultOf(vaultScope) }
  if (! CX.isPlainBag(vaultRaw)) { throw Refuse.storageIssue() }
  return boxVaultRow.parseConsistent(vaultRaw, CX.vaultScope.parse(vaultScope), RowOfOtherAddress)
}

/** Classify the bank row above a gate or vault ask: the act it refuses with, or null when the bank is live in the asked-for life. */
function parentBankActOf({ bank_tok }: { bank_tok: string }, parent: BankRow): ParentBankAct | null {
  if (parent.revision_seq === SX.VoidRevisionSeq) { return 'bank_void' }
  if (parent.am !== 'a')                          { return 'bank_gone' }
  return (parent.bank_tok === bank_tok) ? null : 'bank_reborn'
}

// A vault row left from an ended life of its bank is under another `bank_tok` than the ask's, and refuses as reborn.
/** Classify the vault row above a box ask: the act it refuses with, or null when the vault is live in the asked-for life, its bank's included. */
function boxVaultActOf(ask: Pick<BoxQuery, 'bank_tok' | 'vault_tok'>, parent: VaultRow): BoxVaultAct | null {
  if (parent.revision_seq === SX.VoidRevisionSeq) { return 'vault_void' }
  if (parent.am !== 'a')                          { return 'vault_gone' }
  return (BX.vaultLifeOf(parent) === BX.vaultLifeOf(ask)) ? null : 'vault_reborn'
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
export function isWriteAct(act: BoxAct | VaultAct | ParentBankAct): act is WriteAct { return (EX.writeActVals as readonly string[]).includes(act) }

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

// == [The gate verbs' policy]: BuildPolicies, GatePolicies, replacePassphraseActOf, addPasskeyActOf, revokePasskeyActOf, GateActOfForVerb
// The rows of the policy table in design.md, *The gate verbs' policy*, that need the stored gate row: one function per
// verb, and one line per cell. A gate verb is a put of the gate record over its live row, and these run on the row the
// adapter fetched in the same step that stores the record, never on a row a caller fetched earlier. Each returns
// `replaced` when the record may be stored, or the act that answers without putting, and throws `gate_issue` when the
// record changes more than its verb allows.
//
// The other cells are held before these run. The ask's check holds every cell of `buildBank` and `delBank`, each gate
// verb's empty `auth`, `sigs` and `meta`, and `revokePasskey`'s record having no `passkey0`. The row above and the
// revision rules hold a gate verb's `bank_tok` and `gate_tok` being the row's: a gate row under another `bank_tok` counts
// as none, and one under another `gate_tok` refuses as `clash` or `stale`.

// `buildBank` puts over a tombstone or nothing, and answers the live bank it finds; a gate verb replaces a live gate row.
const BuildPolicies = { ifAbsent: 'add',  ifPresent: 'get'  } as const
const GatePolicies  = { ifAbsent: 'fail', ifPresent: 'repl' } as const

function replacePassphraseActOf(parent: BankRow, record: GateRecord, stored: GateRecord): VaultAct {
  if (stored.registered_at !== record.registered_at)                                       { throw Refuse.bankGateIssue(parent, stored, Phrases.RegisteredAtNotStored) }
  if (! isEqual(omit(record.wayins, ['main']), omit(stored.wayins, ['main'])))             { throw Refuse.bankGateIssue(parent, stored, Phrases.OtherWayinMoved) }
  return 'replaced'
}

// `camped`: a passkey wayin is already stored.
function addPasskeyActOf(parent: BankRow, record: GateRecord, stored: GateRecord): VaultAct {
  if (stored.registered_at !== record.registered_at)                                       { throw Refuse.bankGateIssue(parent, stored, Phrases.RegisteredAtNotStored) }
  if (stored.wayins.passkey0 !== undefined)                                                { return 'camped' }
  if (! isEqual(omit(record.wayins, ['passkey0']), omit(stored.wayins, ['passkey0'])))     { throw Refuse.bankGateIssue(parent, stored, Phrases.OtherWayinMoved) }
  return 'replaced'
}

// `passed`: no passkey wayin is stored, so the stored row is returned unchanged.
function revokePasskeyActOf(parent: BankRow, record: GateRecord, stored: GateRecord): VaultAct {
  if (stored.registered_at !== record.registered_at)                                       { throw Refuse.bankGateIssue(parent, stored, Phrases.RegisteredAtNotStored) }
  if (stored.wayins.passkey0 === undefined)                                                { return 'passed' }
  if (! isEqual(omit(record.wayins, ['passkey0']), omit(stored.wayins, ['passkey0'])))     { throw Refuse.bankGateIssue(parent, stored, Phrases.OtherWayinMoved) }
  return 'replaced'
}

const GateActOfForVerb = {
  replacePassphrase: replacePassphraseActOf, addPasskey: addPasskeyActOf, revokePasskey: revokePasskeyActOf,
} as const satisfies Record<EX.GateVerb, (parent: BankRow, record: GateRecord, stored: GateRecord) => VaultAct>
// --

// == [Classifying]: RowOfVault, RowOfBox, BankEnsureFetched, GateFetched, BankFetched, VaultFetched, BoxFetched, BoxesFetched, BankEnsureStored, BankBuildStored, GateStored, BankDelStored, VaultStored, BoxStored, BoxesStored, classifyEnsureBank, classifyBuildBank, classifyStoredGate, classifyDelBank, classifyStoredVault, classifyStoredBox, classifyStoredBoxes
// The classifier checks each stored row once, and returns everything it worked out on the way to the answer. Each verb's
// row above is judged first: when it refuses, the row asked for goes unchecked, whatever is stored there.

/** A vault row from storage, unchecked, with its vaultlabel. */
export type RowOfVault = { vaultlabel: string, vault: unknown }
/** A box row from storage, unchecked, with its boxlabel. */
export type RowOfBox   = { boxlabel: string, box: unknown }

/** The rows an adapter fetched for an `ensureBank` ask in one step, unchecked: the bank row and its `main` gate row, each null for none, and the bank's vault rows. */
export type BankEnsureFetched = Readonly<{ bank: unknown, gate: unknown, vaults: readonly RowOfVault[] }>

/** The rows an adapter fetched for a `buildBank` ask or a gate verb's in one step, unchecked: the bank row and its `main` gate row, each null for none. */
export type GateFetched = Readonly<{ bank: unknown, gate: unknown }>

/** The bank row an adapter fetched for a `delBank` ask, unchecked, or null for none. */
export type BankFetched = Readonly<{ bank: unknown }>

/** The rows an adapter fetched for a vault ask in one step, unchecked: the bank row and the vault row, each null for none. */
export type VaultFetched = Readonly<{ bank: unknown, vault: unknown }>

/** The rows an adapter fetched for a box ask, unchecked:
 * - `box`      -- the stored box row, as fetched before any write (null for none)
 * - `parent`   -- the vault row, fetched in the same step (null for none)
 * - `capacity` -- the vault's {@link Capacity} stats, for adapters that return it
 */
export type BoxFetched = Readonly<{ parent: unknown, box: unknown, capacity?: Capacity | null }>

/** The rows an adapter fetched for a `listBoxes` ask in one step, unchecked: the vault row (null for none) and the box rows of the asked-for life. */
export type BoxesFetched = Readonly<{ parent: unknown, boxes: readonly RowOfBox[] }>

/** An `ensureBank` ask, classified against the rows stored: `gotlive` with the bank's gate and vaults, or `gotvoid` or `gotgone` with none.
 * - `parent`  -- the bank row stored, or the shell for none
 * - `ensured` -- the good answer's `val`: the bank's `main` gate row, its vault rows and its damaged ones; null when the bank is not live
 */
export type BankEnsureStored = Readonly<{ ok: true, act: GotAct, parent: BankRow, ensured: BankEnsured | null }>

/** A `buildBank` ask, classified against the bank and gate rows stored.
 * - `ok`  -- true for a good answer, false for a refusal
 * - `act` -- directs how to route and handle the answer
 */
export type BankBuildStored = Readonly<({ ok: true, act: OkAct } | { ok: false, act: RefusedAct }) & {
  /** The bank row after this ask: the record it stores, else the stored row, else the shell for none. */
  parent:   BankRow
  /** A good answer's `val`: the gate record this ask stores, else the live bank's gate row; null when no live bank is stored. */
  gate:     GateRecord | null
  /** What was stored at the bank's scope before any write. */
  presence: Presence
}>

/** A gate verb's ask, classified against the bank and gate rows stored.
 * - `ok`  -- true for a good answer, false for a refusal
 * - `act` -- directs how to route and handle the answer
 */
export type GateStored = Readonly<({ ok: true, act: OkAct } | { ok: false, act: RefusedAct | ParentBankAct }) & {
  /** The bank row stored, or the shell for none. */
  parent:   BankRow
  /** A good answer's `val`, or a refusal's `dbhas`: the record this ask stores, else the stored gate row, or null for none or when the bank row refused. */
  gate:     GateRecord | null
  /** What was stored at the gate's scope before any write, or null when the bank row refused and the gate row went unchecked. */
  presence: Presence | null
}>

/** A `delBank` ask, classified against the bank row stored.
 * - `ok`  -- true for a good answer, false for a refusal
 * - `act` -- directs how to route and handle the answer
 */
export type BankDelStored = Readonly<({ ok: true, act: OkAct } | { ok: false, act: RefusedAct }) & {
  /** A good answer's `val`, or a refusal's `dbhas`: the tombstone this ask stores, else the stored bank row, or null for none. */
  bank:     BankRow | null
  /** What was stored at the bank's scope before any write. */
  presence: Presence
}>

/** A vault ask, classified against the bank and vault rows stored.
 * - `ok`  -- true for a good answer, false for a refusal
 * - `act` -- directs how to route and handle the answer
 */
export type VaultStored = Readonly<({ ok: true, act: OkAct } | { ok: false, act: RefusedAct | ParentBankAct }) & {
  /** The bank row stored, or the shell for none. */
  parent:   BankRow
  /** A good answer's `val`, or a refusal's `dbhas`: the record this ask stores, else the stored vault row, or null for none or when the bank row refused. */
  vault:    VaultRow | null
  /** What was stored at the vault's scope before any write, or null when the bank row refused and the vault row went unchecked. */
  presence: Presence | null
}>

/** A box ask, classified against the stored vault and box rows.
 * - `ok`  -- true for a good answer, false for a refusal
 * - `act` -- directs how to route and handle the answer
 */
export type BoxStored = Readonly<({ ok: true, act: OkAct } | { ok: false, act: RefusedAct | BoxVaultAct }) & {
  /** The vault row stored, or the shell for none. */
  parent:   VaultRow
  /** A good answer's `val`, or a refusal's `dbhas`: the record this ask stores, else the stored box row, or null for none or when the vault row refused. */
  box:      BoxRow | null
  /** What was stored at the box's scope before any write, or null when the vault row refused and the box row went unchecked. */
  presence: Presence | null
  /** The vault's capacity as the adapter counted it, or null if it did not. */
  capacity: Capacity | null
}>

/** A `listBoxes` ask, classified against the stored vault row and box rows.
 * - `ok`     -- true for a good answer; false when the vault is not live in the asked-for life
 * - `parent` -- the vault row stored, or the shell for none
 * - `listed` -- the boxes, sparse, and the rows that failed their checks; null when the vault refused
 */
export type BoxesStored = Readonly<({ ok: true, act: ListAct, listed: BoxesListed } | { ok: false, act: BoxVaultAct, listed: null }) & { parent: VaultRow }>

// A vault row of an ended life of the bank counts as no row, and is left out; one that fails its checks is listed among
// the damaged rows, under the label storage holds it by, so one bad row never hides the rest.
/** Classify an `ensureBank` ask against the rows an adapter fetched for it: the bank row, then its `main` gate row and each vault row.
 * Throws for a bank row that fails its checks, and `damaged_row` for a live bank whose `main` gate row is missing or fails its checks.
 */
export function classifyEnsureBank(ask: BankEnsureAsk, fetched: BankEnsureFetched): BankEnsureStored {
  const bank = bankRowOf(ask, fetched.bank)
  if (bank === null)  { return { ok: true, act: 'gotvoid', parent: BX.shellBankOf(ask), ensured: null } }
  if (bank.am !== 'a') { return { ok: true, act: 'gotgone', parent: bank, ensured: null } }

  const { user_id, banklabel } = ask
  const ensured: BankEnsured = { gates: { main: mainGateOf(ask, fetched.gate, bank) }, vaults: [], damaged_rows: [] }
  for (const { vaultlabel, vault } of fetched.vaults) {
    const address = { user_id, banklabel, vaultlabel }
    const row     = listedRowOf(BX.vaultRow, vault, address)
    if (row === null) { ensured.damaged_rows.push(SX.damagedVaultOf(address)) } else if (row.bank_tok === bank.bank_tok) { ensured.vaults.push(row) }
  }
  return { ok: true, act: 'gotlive', parent: bank, ensured }
}

// A gate row under a bank that is not live is of an ended life, and goes unchecked: the gate record is put over it.
/** Classify a `buildBank` ask against the rows an adapter fetched for it, per the put table in `notes/answer-contract.md`.
 * When {@link isWriteAct} is true of the act, the adapter stores `ask.record` and `ask.gate` in the same step that fetched the rows.
 * Throws for a row that fails its checks, and `damaged_row` for a live bank whose `main` gate row is missing.
 */
export function classifyBuildBank(ask: BankBuildAsk, fetched: GateFetched): BankBuildStored {
  const bank     = bankRowOf(ask, fetched.bank)
  const presence = presenceOf(bank)
  const act      = putActOf({ ...ask, ...BuildPolicies }, bank)
  if (isWriteAct(act)) { return { ok: true, act, parent: ask.record, gate: ask.gate, presence } }

  const parent = bank ?? BX.shellBankOf(ask)
  const gate   = (bank?.am === 'a') ? mainGateOf(ask, fetched.gate, bank) : null
  return isOkAct(act) ? { ok: true, act, parent, gate, presence } : { ok: false, act, parent, gate, presence }
}

/** Classify a gate verb's ask against the rows an adapter fetched for it: the bank row, then the gate row, then the verb's policy.
 * When {@link isWriteAct} is true of the act, the adapter stores `ask.record` in the same step that fetched the rows.
 * Throws for a row that fails its checks, and `gate_issue` when the record fails its verb's policy.
 */
export function classifyStoredGate(ask: GatePutAsk, fetched: GateFetched): GateStored {
  const parent    = bankRowOf(ask, fetched.bank) ?? BX.shellBankOf(ask)
  const parentAct = parentBankActOf(ask, parent)
  if (parentAct !== null) { return { ok: false, act: parentAct, parent, gate: null, presence: null } }

  const gate     = gateRowOf(ask, fetched.gate, parent)
  const presence = presenceOf(gate)
  const tabled   = putActOf({ ...ask, ...GatePolicies }, gate)
  const act      = ((tabled === 'replaced') && (gate !== null)) ? GateActOfForVerb[ask.gateVerb](parent, ask.record, gate) : tabled
  if (isWriteAct(act)) { return { ok: true, act, parent, gate: ask.record, presence } }
  return isOkAct(act) ? { ok: true, act, parent, gate, presence } : { ok: false, act, parent, gate, presence }
}

/** Classify a `delBank` ask against the bank row an adapter fetched for it, per the del table in `notes/answer-contract.md`.
 * Under `deleted`, the adapter stores `ask.record` and deletes every gate, vault and box row under the bank's scope, in the same step that fetched the row.
 * Throws for a row that fails its checks.
 */
export function classifyDelBank(ask: BankDelAsk, fetched: BankFetched): BankDelStored {
  const bank     = bankRowOf(ask, fetched.bank)
  const presence = presenceOf(bank)
  const act      = delActOf(ask, bank)
  if (isWriteAct(act)) { return { ok: true, act, bank: ask.record, presence } }
  return isOkAct(act) ? { ok: true, act, bank, presence } : { ok: false, act, bank, presence }
}

/** Classify a vault ask against the rows an adapter fetched for it, per the tables in `notes/answer-contract.md`: the bank row, then the vault row.
 * When {@link isWriteAct} is true of the act, the adapter stores `ask.record` in the same step that fetched the rows.
 * Throws for a row that fails its checks or is stored at another scope.
 */
export function classifyStoredVault(ask: VaultAsk, fetched: VaultFetched): VaultStored {
  const parent    = bankRowOf(ask, fetched.bank) ?? BX.shellBankOf(ask)
  const parentAct = parentBankActOf(ask, parent)
  if (parentAct !== null) { return { ok: false, act: parentAct, parent, vault: null, presence: null } }

  const vault    = vaultRowOf(ask, fetched.vault, parent)
  const presence = presenceOf(vault)
  const act      = rowActOf(ask, vault)
  if ((ask.op !== 'get') && isWriteAct(act)) { return { ok: true, act, parent, vault: ask.record, presence } }
  return isOkAct(act) ? { ok: true, act, parent, vault, presence } : { ok: false, act, parent, vault, presence }
}

// A box ask is classified entirely here, top to bottom. Each fetched row is checked once, when first read, and is
// sound and typed from then on.
/** Classify a box ask against the rows an adapter fetched for it, per the tables in `notes/answer-contract.md`.
 * Throws for a row that fails its checks or is stored at another address.
 */
export function classifyStoredBox(ask: BoxAsk, fetched: BoxFetched): BoxStored {
  const parent   = boxParentOf(ask, fetched.parent)
  const capacity = fetched.capacity ?? null

  const vaultAct = boxVaultActOf(ask, parent)
  if (vaultAct !== null) { return { ok: false, act: vaultAct, parent, box: null, presence: null, capacity: null } }

  const box      = boxRowOf(ask, fetched.box, parent)
  const presence = presenceOf(box)
  const uncapped = rowActOf(ask, box)
  const act      = (capacity === null) ? uncapped : cappedActOf(uncapped, capacity)
  if ((ask.op !== 'get') && isWriteAct(act)) { return { ok: true, act, parent, box: ask.record, presence, capacity } }
  return isOkAct(act) ? { ok: true, act, parent, box, presence, capacity } : { ok: false, act, parent, box, presence, capacity }
}

/** Classify a `listBoxes` ask against the rows an adapter fetched for it: the vault row first, then each box row, a damaged one set aside.
 * Throws `damaged_vault` for a vault row that fails its checks.
 */
export function classifyStoredBoxes(ask: BoxListAsk, fetched: BoxesFetched): BoxesStored {
  const parent   = boxParentOf(ask, fetched.parent)
  const vaultAct = boxVaultActOf(ask, parent)
  if (vaultAct !== null) { return { ok: false, act: vaultAct, parent, listed: null } }

  const { user_id, banklabel, vaultlabel } = ask
  const listed: BoxesListed = { boxes: [], damaged_rows: [] }
  for (const { boxlabel, box } of fetched.boxes) {
    const address = { user_id, banklabel, vaultlabel, boxlabel }
    const row     = listedRowOf(BX.boxRow, box, address)
    if (row === null) { listed.damaged_rows.push(BX.damagedBoxOf(address, ask)) } else if (BX.vaultLifeOf(row) === BX.vaultLifeOf(parent)) { listed.boxes.push(BX.boxSparse.parse(row)) }
  }
  return { ok: true, act: ((listed.boxes.length + listed.damaged_rows.length) > 0) ? 'got' : 'gotvoid', parent, listed }
}
// --
