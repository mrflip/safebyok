/** What the bankDB writes and accepts: the bank, gate and vault rows, the asks of its verbs, and their helpers. Imported as `BX`.
 * A box row, and the asks of the box verbs, `tidyGone` and `watch`, are the vaultDB's, in `SX`.
 */

import type * as Z from 'zod'
import { Checkers, isConsistent, objStrip } from '../helpers/validator'
import * as Phrases from '../helpers/phrases'
import * as EX from './shapes-enums'
import * as CX from './shapes-core'
import * as SX from './shapes-storage'
import type { BankScope, VaultScope } from './shapes-core'

// == [Formats]: BankFormat, GateFormat, VaultFormat

/** The `fmt` every bank row carries. */
export const BankFormat = 3001
/** The `fmt` every gate row carries. */
export const GateFormat = 4001
/** The `fmt` every vault row of a bank carries. */
export const VaultFormat = 6003
// --

// == [Bank forms]: bankSparse, bankRecord, bankTombstone, bankRow, BankSparse, BankRecord, BankTombstone, BankRow

// A bank row has nothing encrypted, so its record and its tombstone have the same fields.
/** The checks of a bank's stored forms: its sparse fields, its live record, its tombstone, and a row of either. */
export const { bankSparse, bankRecord, bankTombstone, bankRow } = Checkers('bad_option', ({ lit, discrim, bank_tok }) => {
  const bankSparse    = CX.bankScope.unwrap().extend({
    fmt: lit(BankFormat), ...SX.revision.shape, ...SX.times.shape, am: SX.am,
    /** The life of the bank under its banklabel: minted at `buildBank`, and kept until `delBank` leaves a tombstone under a new one. */
    bank_tok,
  })
  const bankRecord    = bankSparse.extend({ am: lit('a') }).strict()
  const bankTombstone = bankSparse.extend({ am: lit('x') }).strict()
  const bankRow       = discrim('am', [bankRecord, bankTombstone])
  return { bankSparse, bankRecord, bankTombstone, bankRow }
}, [CX])

export type BankSparse    = Readonly<Z.infer<typeof bankSparse>>
export type BankRecord    = Readonly<Z.infer<typeof bankRecord>>
export type BankTombstone = Readonly<Z.infer<typeof bankTombstone>>
/** A bank row as stored: live, or a tombstone. */
export type BankRow       = BankRecord | BankTombstone
// --

// == [Gate forms]: passphraseWayin, passkeyWayin, wayins, gateRecord, GateRecord, Wayins

// A gate row is deleted with its bank, never tombstoned: a stored gate row is live.
/** The checks of a gate's wayins, each with its `wayinlabel`, its bag of them, and its stored row. */
export const { passphraseWayin, passkeyWayin, wayins, gateRecord } = Checkers('bad_option', ({ obj, lit, bank_tok, gate_tok }) => {
  const passphraseWayin = SX.passphraseWayinRecord.extend({ wayinlabel: lit('main') }).strict()
  const passkeyWayin    = SX.passkeyWayinRecord.extend({ wayinlabel: lit('passkey0') }).strict()
  const wayins          = obj({ main: passphraseWayin, passkey0: passkeyWayin.optional() }).strict()
  const emptyBag        = obj({}).strict()
  const gateRecord      = CX.gateScope.unwrap().extend({
    fmt: lit(GateFormat), ...SX.revision.shape, ...SX.times.shape, am: lit('a'),
    bank_tok,
    /** The life of the gate under its gatelabel: minted when its bank is built, and kept by every gate verb. */
    gate_tok,
    wayins,
    /** Kept for later, and read by nothing: always empty. */
    auth: emptyBag,
    /** Kept for later, and read by nothing: always empty. */
    sigs: emptyBag,
    /** Kept for later, and read by nothing: always empty. */
    meta: emptyBag,
  }).strict()
  return { passphraseWayin, passkeyWayin, wayins, gateRecord }
}, [CX])

/** A gate row as stored, always live. */
export type GateRecord = Readonly<Z.infer<typeof gateRecord>>
/** A gate's wayins: `main`, its passphrase wayin, and `passkey0`, its passkey wayin, if it has one. */
export type Wayins     = Readonly<Z.infer<typeof wayins>>
// --

// == [Vault forms]: vaultRecord, vaultTombstone, vaultRow, VaultRecord, VaultTombstone, VaultRow

// A bank's vault row has nothing encrypted, so its record is its sparse form, and its tombstone has the same fields.
/** The checks of a bank's vault rows: its live record, its tombstone, and a row of either. */
export const { vaultRecord, vaultTombstone, vaultRow } = Checkers('bad_option', ({ lit, discrim, bank_tok, vault_tok }) => {
  const vaultSparse    = CX.vaultScope.unwrap().extend({ fmt: lit(VaultFormat), ...SX.revision.shape, ...SX.times.shape, am: SX.am, bank_tok, vault_tok })
  const vaultRecord    = vaultSparse.extend({ am: lit('a') }).strict()
  const vaultTombstone = vaultSparse.extend({ am: lit('x') }).strict()
  const vaultRow       = discrim('am', [vaultRecord, vaultTombstone])
  return { vaultRecord, vaultTombstone, vaultRow }
}, [CX])

export type VaultRecord    = Readonly<Z.infer<typeof vaultRecord>>
export type VaultTombstone = Readonly<Z.infer<typeof vaultTombstone>>
/** A bank's vault row as stored: live, or a tombstone. */
export type VaultRow       = VaultRecord | VaultTombstone
// --

// == [Rows stored]: storedBankRow, storedGateRow, storedVaultRow

/** A bank, gate or vault row as storage answers it: one failing its checks refuses 'damaged_row'. */
export const { storedBankRow, storedGateRow, storedVaultRow } = Checkers('damaged_row', () => ({
  storedBankRow:  bankRow,
  storedGateRow:  gateRecord,
  storedVaultRow: vaultRow,
}))
// --

// == [Row helpers]: shellBankOf, shellVaultOf

const shellTimes = { registered_at: SX.VoidTime, written_at: SX.VoidTime }

/** The tombstone of a bank row that is not stored. */
export function shellBankOf({ user_id, banklabel }: BankScope): BankTombstone {
  return { user_id, banklabel, fmt: BankFormat, ...SX.VoidRevision, ...shellTimes, am: 'x', bank_tok: SX.VoidLifeTok }
}

/** The tombstone of a bank's vault row that is not stored. */
export function shellVaultOf({ user_id, banklabel, vaultlabel }: VaultScope): VaultTombstone {
  return { user_id, banklabel, vaultlabel, fmt: VaultFormat, ...SX.VoidRevision, ...shellTimes, am: 'x', bank_tok: SX.VoidLifeTok, vault_tok: SX.VoidLifeTok }
}
// --

// == [Asks]: bankEnsure, bankBuild, gatePut, bankDel, vaultGet, vaultPut, vaultDel, vaultAsk, BankEnsureAsk, BankBuildAsk, GatePutAsk, BankDelAsk, VaultAsk, VaultGetAsk, VaultPutAsk, VaultDelAsk, loggableAsk, LoggableAsk

type Expecting = { expected: SX.Revision }
type Cited     = Expecting & { record: SX.Revision }

const isSeqNext        = ({ record, expected }: Cited): boolean => record.revision_seq === (expected.revision_seq + 1)
const isRevisionTokNew = ({ record, expected }: Cited): boolean => (record.revision_tok !== expected.revision_tok) && (record.revision_tok !== SX.VoidRevisionTok)
const isExpectedWhole  = ({ expected }: Expecting): boolean => (expected.revision_tok === SX.VoidRevisionTok) === (expected.revision_seq === SX.VoidRevisionSeq)

// A request and its record share only the address fields, so they agree when the record is at the request's address.
const isRecordAtAsk    = ({ record, ...asked }: { record: object }): boolean => isConsistent(record, asked)

/** True when a record's `lifeTok` is that of the live row it replaces, or a new one when it creates or deletes the row. */
function isLifeTokPlaced(lifeTok: string, expectedLifeTok: string, expectedAm: EX.Am, recordAm: EX.Am): boolean {
  if ((expectedAm === 'a') && (recordAm === 'a')) { return lifeTok === expectedLifeTok }
  return (lifeTok !== expectedLifeTok) && (lifeTok !== SX.VoidLifeTok)
}

// `addPasskey` adds a passkey wayin and `revokePasskey` removes it, so the record each stores has one or none.
function isGateVerbRecord({ gateVerb, record }: { gateVerb: EX.GateVerb, record: { wayins: { passkey0?: unknown } } }): boolean {
  if (gateVerb === 'addPasskey')    { return record.wayins.passkey0 !== undefined }
  if (gateVerb === 'revokePasskey') { return record.wayins.passkey0 === undefined }
  return true
}

// A bank's gate is built with it, under its bank record's scope and `bank_tok`, as the first revision of a life of its own.
const isGateOfBank = ({ record, gate }: { record: BankRecord, gate: GateRecord }): boolean => isConsistent(gate, CX.bankScope.parse(record)) && (gate.bank_tok === record.bank_tok)
const isGateBorn   = ({ gate }: { gate: GateRecord }): boolean => (gate.revision_seq === 0) && (gate.revision_tok !== SX.VoidRevisionTok) && (gate.gate_tok !== SX.VoidLifeTok)

/** The check of an `ensureBank` ask: the bank's scope, and `gates`, which names the `main` gate alone. */
export const { bankEnsure } = Checkers('bad_scope', ({ lit, tuple, bankScope }) => ({
  bankEnsure: bankScope.unwrap().extend({ op: lit('ensure'), gates: tuple([lit('main')]) }),
}), [CX])

/** An `ensureBank` ask: the bank's scope, and the gates to answer, `['main']`. */
export type BankEnsureAsk = Readonly<Z.output<typeof bankEnsure>>

// Every ask that stores a row has the same shape as the vaultDB's: its `op`, the address of the row, the row its caller
// expects to find, and the record to store. A gate verb's ask and a vault ask also cite the `bank_tok` of the bank they
// are made under, as a box ask cites its vault's `vault_tok`.
/** Validators of a bankDB ask that stores a row, or gets a vault row.
 * `expected` is parsed as a row's meta and its other fields dropped, so a caller may pass the row it has, or the shell row for none.
 */
export const { bankBuild, gatePut, bankDel, vaultGet, vaultPut, vaultDel, vaultAsk } = Checkers('bad_record', ({ lit, oneof, discrim, bank_tok, gate_tok, bankScope, gateScope, vaultScope }) => {
  const bankExpected  = SX.rowMeta.omit({ vault_tok: true }).extend({ bank_tok })
  const gateExpected  = SX.rowMeta.omit({ vault_tok: true }).extend({ gate_tok })
  const vaultExpected = SX.rowMeta
  const vaultCited    = vaultScope.unwrap().extend({ bank_tok })

  const bankBuild = bankScope.unwrap().extend({
    op: lit('build'), expected: bankExpected, record: bankRecord,
    /** The bank's `main` gate, put with it in the same step. */
    gate: gateRecord,
  }).refine(isSeqNext,        Phrases.SeqNotNext)
    .refine(isRevisionTokNew, Phrases.RevisionTokNotNew)
    .refine(isExpectedWhole,  Phrases.ExpectedHalfVoid)
    .refine(isRecordAtAsk,    Phrases.RecordOfOtherAddress)
    .refine(({ record, expected }) => (record.bank_tok !== expected.bank_tok) && (record.bank_tok !== SX.VoidLifeTok), Phrases.BankTokNotNew)
    .refine(isGateOfBank,     Phrases.GateOfOtherBank)
    .refine(isGateBorn,       Phrases.GateNotBorn)
  const gatePut = gateScope.unwrap().extend({
    op: lit('put'), bank_tok, expected: gateExpected, record: gateRecord,
    /** The gate verb this put is for. The classifier runs that verb's checks against the gate row it replaces. */
    gateVerb: oneof(EX.gateVerbVals),
  }).refine(isSeqNext,        Phrases.SeqNotNext)
    .refine(isRevisionTokNew, Phrases.RevisionTokNotNew)
    .refine(isExpectedWhole,  Phrases.ExpectedHalfVoid)
    .refine(isRecordAtAsk,    Phrases.RecordOfOtherAddress)
    .refine(isGateVerbRecord, Phrases.GateVerbRecordMismatch)
    .refine(({ record, expected }) => isLifeTokPlaced(record.gate_tok, expected.gate_tok, expected.am, record.am),   Phrases.LifeTokMisplaced)
  const bankDel = bankScope.unwrap().extend({
    op: lit('del'), expected: bankExpected, record: bankTombstone,
  }).refine(isSeqNext,        Phrases.SeqNotNext)
    .refine(isRevisionTokNew, Phrases.RevisionTokNotNew)
    .refine(isExpectedWhole,  Phrases.ExpectedHalfVoid)
    .refine(isRecordAtAsk,    Phrases.RecordOfOtherAddress)
    .refine(({ record, expected }) => isLifeTokPlaced(record.bank_tok, expected.bank_tok, expected.am, record.am),   Phrases.LifeTokMisplaced)

  const vaultGet = vaultCited.extend({
    op: lit('get'), ifAbsent: SX.ifAbsent, expected: vaultExpected,
  }).refine(isExpectedWhole,  Phrases.ExpectedHalfVoid)
  const vaultPut = vaultCited.extend({
    op: lit('put'), ifAbsent: SX.putIfAbsent, ifPresent: SX.ifPresent, expected: vaultExpected, record: vaultRecord,
  }).refine(isSeqNext,        Phrases.SeqNotNext)
    .refine(isRevisionTokNew, Phrases.RevisionTokNotNew)
    .refine(isExpectedWhole,  Phrases.ExpectedHalfVoid)
    .refine(isRecordAtAsk,    Phrases.RecordOfOtherAddress)
    .refine(({ record, expected }) => isLifeTokPlaced(record.vault_tok, expected.vault_tok, expected.am, record.am), Phrases.LifeTokMisplaced)
  const vaultDel = vaultCited.extend({
    op: lit('del'), expected: vaultExpected, record: vaultTombstone,
  }).refine(isSeqNext,        Phrases.SeqNotNext)
    .refine(isRevisionTokNew, Phrases.RevisionTokNotNew)
    .refine(isExpectedWhole,  Phrases.ExpectedHalfVoid)
    .refine(isRecordAtAsk,    Phrases.RecordOfOtherAddress)
    .refine(({ record, expected }) => isLifeTokPlaced(record.vault_tok, expected.vault_tok, expected.am, record.am), Phrases.LifeTokMisplaced)

  return {
    bankBuild, gatePut, bankDel, vaultGet, vaultPut, vaultDel,
    vaultAsk: discrim('op', [vaultGet, vaultPut, vaultDel]),
  }
}, [CX])

/** A `buildBank` ask: the bank's scope, the bank record to store over the expected tombstone or shell, and its `main` gate's record. */
export type BankBuildAsk = Readonly<Z.output<typeof bankBuild>>
/** A gate verb's ask: the gate's scope, its bank's `bank_tok`, the gate record to store over the expected gate row, and the verb. */
export type GatePutAsk   = Readonly<Z.output<typeof gatePut>>
/** A `delBank` ask: the bank's scope, the tombstone to store, and the expected bank row. */
export type BankDelAsk   = Readonly<Z.output<typeof bankDel>>
/** A vault get, put or del ask under a bank, as the bankDB receives it and passes it to its adapter and the classifier. */
export type VaultAsk     = Readonly<Z.output<typeof vaultAsk>>
/** A `getVault` ask: the vault's scope, its bank's `bank_tok`, the expected row (or shell), and the `ifAbsent` option. */
export type VaultGetAsk  = Extract<VaultAsk, { op: 'get' }>
/** A `putVault` ask: the vault's scope, its bank's `bank_tok`, the record to store, the expected row (or shell), and the `ifPresent` and `ifAbsent` options. */
export type VaultPutAsk  = Extract<VaultAsk, { op: 'put' }>
/** A `delVault` ask: the vault's scope, its bank's `bank_tok`, the tombstone to store, and the expected row. */
export type VaultDelAsk  = Extract<VaultAsk, { op: 'del' }>

// A record is a stored row, payload and all: an answer and a refusal carry only its meta, as they may reach a log.
/** The check of what a bankDB answer and its refusal carry of an ask: any of its fields but a record's payload.
 * Each field is optional, so a refusal made before the ask was whole carries what of it was sound.
 */
export const loggableAsk = objStrip(({ obj, oneof, lit, user_id, banklabel, vaultlabel, boxlabel, bank_tok, gate_tok, vault_tok, box_tok }) => {
  const meta = obj({ ...SX.revision.shape, am: SX.am, bank_tok, gate_tok, vault_tok, box_tok }).partial()
  return {
    op:         oneof(EX.bankAskOpVals).optional(),
    user_id:    user_id.optional(),
    banklabel:  banklabel.optional(),
    gatelabel:  lit('main').optional(),
    vaultlabel: vaultlabel.optional(),
    boxlabel:   boxlabel.optional(),
    bank_tok:   bank_tok.optional(),
    vault_tok:  vault_tok.optional(),
    ifAbsent:   SX.anyIfAbsent.optional(),
    ifPresent:  SX.ifPresent.optional(),
    gateVerb:   oneof(EX.gateVerbVals).optional(),
    expected:   meta.optional(),
    record:     meta.optional(),
    gate:       meta.optional(),
  }
}, 'bad_option', [CX])

/** What a bankDB answer and its refusal carry of their ask: its `op`, address, policies, and the revisions of its rows. */
export type LoggableAsk = Readonly<Z.output<typeof loggableAsk>>
// --
