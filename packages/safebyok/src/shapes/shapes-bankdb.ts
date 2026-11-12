/** What the bankDB writes and accepts: the bank, gate, vault and box rows, the asks of its verbs, and their helpers. Imported as `BX`.
 * The asks of `tidyGone` and `watch` are the vaultDB's, in `SX`.
 */

import type * as Z from 'zod'
import { Checkers, isConsistent, objStrip } from '../helpers/validator'
import * as Phrases from '../helpers/phrases'
import * as EX from './shapes-enums'
import * as CX from './shapes-core'
import * as SX from './shapes-storage'
import type { BankScope, Boxscope, VaultScope } from './shapes-core'

// == [Formats]: BankFormat, GateFormat, VaultFormat, BoxFormat

/** The `fmt` every bank row carries. */
export const BankFormat = 3001
/** The `fmt` every gate row carries. */
export const GateFormat = 4001
/** The `fmt` every vault row of a bank carries. */
export const VaultFormat = 6003
/** The `fmt` every box row of a bank carries. */
export const BoxFormat = 5003
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

// == [Box forms]: boxSparse, boxRecord, boxTombstone, boxRow, BoxSparse, BoxRecord, BoxTombstone, BoxRow, DamagedBox

// A bank's box row is the vaultDB's, with its bank's `bank_tok` beside its vault's `vault_tok`: the two name the life of
// the vault it is under (`vaultLifeOf`).
/** The checks of a bank's box rows: its sparse fields, its live record, its tombstone, and a row of either. */
export const { boxSparse, boxRecord, boxTombstone, boxRow } = Checkers('bad_option', ({ lit, discrim, bank_tok }) => {
  const banked       = { fmt: lit(BoxFormat), bank_tok }
  const boxSparse    = SX.boxSparse.extend(banked)
  const boxRecord    = SX.boxRecord.extend(banked).strict()
  const boxTombstone = SX.boxTombstone.extend(banked).strict()
  const boxRow       = discrim('am', [boxRecord, boxTombstone])
  return { boxSparse, boxRecord, boxTombstone, boxRow }
}, [CX])

export type BoxSparse    = Readonly<Z.infer<typeof boxSparse>>
export type BoxRecord    = Readonly<Z.infer<typeof boxRecord>>
export type BoxTombstone = Readonly<Z.infer<typeof boxTombstone>>
/** A bank's box row as stored: live, or a tombstone. */
export type BoxRow       = BoxRecord | BoxTombstone
/** A box row that failed validation, named by where it is stored: its scope, under whatever label storage has, the life of its vault, and `am` 'd'. */
export type DamagedBox   = Readonly<{ user_id: string, banklabel: string, vaultlabel: string, boxlabel: string, bank_tok: string, vault_tok: string, am: 'd' }>
// --

// == [Rows stored]: storedBankRow, storedGateRow, storedVaultRow, storedBoxRow

/** A bank, gate, vault or box row as storage answers it: one failing its checks refuses 'damaged_row'. */
export const { storedBankRow, storedGateRow, storedVaultRow, storedBoxRow } = Checkers('damaged_row', () => ({
  storedBankRow:  bankRow,
  storedGateRow:  gateRecord,
  storedVaultRow: vaultRow,
  storedBoxRow:   boxRow,
}))
// --

// == [Row helpers]: vaultLifeOf, shellBankOf, shellVaultOf, shellBoxOf, damagedBoxOf

// A vault is reborn under a new `vault_tok`, and its bank under a new `bank_tok`: a box row under either ended life is no row.
/** The life of a vault, its bank's included, as one string: a vault row's own, and the one a box row or box ask is under. */
export function vaultLifeOf({ bank_tok, vault_tok }: { bank_tok: string, vault_tok: string }): string { return `${bank_tok}/${vault_tok}` }

const shellTimes = { registered_at: SX.VoidTime, written_at: SX.VoidTime }

/** The tombstone of a bank row that is not stored. */
export function shellBankOf({ user_id, banklabel }: BankScope): BankTombstone {
  return { user_id, banklabel, fmt: BankFormat, ...SX.VoidRevision, ...shellTimes, am: 'x', bank_tok: SX.VoidLifeTok }
}

/** The tombstone of a bank's vault row that is not stored. */
export function shellVaultOf({ user_id, banklabel, vaultlabel }: VaultScope): VaultTombstone {
  return { user_id, banklabel, vaultlabel, fmt: VaultFormat, ...SX.VoidRevision, ...shellTimes, am: 'x', bank_tok: SX.VoidLifeTok, vault_tok: SX.VoidLifeTok }
}

/** The tombstone of a box row that is not stored, under the life of the vault `boxQuery` names. */
export function shellBoxOf({ user_id, banklabel, vaultlabel, boxlabel, bank_tok, vault_tok }: BoxQuery): BoxTombstone {
  return {
    user_id, banklabel, vaultlabel, boxlabel, fmt: BoxFormat, ...SX.VoidRevision, ...shellTimes, am: 'x', bank_tok, vault_tok, box_tok: SX.VoidLifeTok, whisper_codec: 'json_v1', whisper_schema_version: 1,
  }
}

/** A listing's entry for a box row that failed validation, under the life of the vault its second parameter names. Its label comes from storage, unchecked: it is part of what is reported. */
export function damagedBoxOf({ user_id, banklabel, vaultlabel, boxlabel }: Boxscope, { bank_tok, vault_tok }: { bank_tok: string, vault_tok: string }): DamagedBox {
  return { user_id, banklabel, vaultlabel, boxlabel, bank_tok, vault_tok, am: 'd' }
}
// --

// == [Asks]: bankEnsure, bankBuild, gatePut, bankDel, vaultGet, vaultPut, vaultDel, vaultAsk, BankEnsureAsk, BankBuildAsk, GatePutAsk, BankDelAsk, VaultAsk, VaultGetAsk, VaultPutAsk, VaultDelAsk, GateVerbAsk, boxQuery, boxList, BoxQuery, BoxListAsk, boxGet, boxPut, boxDel, boxAsk, BoxAsk, BoxGetAsk, BoxPutAsk, BoxDelAsk, loggableAsk, LoggableAsk

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

/** A gate verb's ask, as `replacePassphrase`, `addPasskey` and `revokePasskey` take it: a {@link GatePutAsk} without its `gateVerb`, which the verb supplies. */
export type GateVerbAsk  = Omit<GatePutAsk, 'gateVerb'>

/** The checks of a box's scope under the life of its vault, and of a `listBoxes` ask. */
export const { boxQuery, boxList } = Checkers('bad_scope', ({ lit, bank_tok, vault_tok, vaultScope, boxscope }) => ({
  boxQuery: boxscope.unwrap().extend({ bank_tok, vault_tok }),
  boxList:  vaultScope.unwrap().extend({ bank_tok, vault_tok, op: lit('list') }),
}), [CX])

/** A box's scope, with the `bank_tok` and `vault_tok` of the vault's life it is asked under. */
export type BoxQuery   = Readonly<Z.infer<typeof boxQuery>>
/** A `listBoxes` ask: the vault's scope, and the `bank_tok` and `vault_tok` of the life whose boxes are listed. */
export type BoxListAsk = Readonly<Z.output<typeof boxList>>

const isExpectedInLife = ({ expected, ...asked }: { bank_tok: string, vault_tok: string, expected: { bank_tok: string, vault_tok: string } }): boolean => vaultLifeOf(expected) === vaultLifeOf(asked)

// A box ask cites the life of its vault, `bank_tok` and `vault_tok`, as a vault ask cites its bank's `bank_tok`.
/** Validators of a bankDB box ask: a get, put or del. `expected` is parsed as a row's meta, as a vault ask's is. */
export const { boxGet, boxPut, boxDel, boxAsk } = Checkers('bad_record', ({ lit, discrim, bank_tok, box_tok }) => {
  const boxExpected = SX.rowMeta.extend({ bank_tok, box_tok })

  const boxGet = boxQuery.extend({
    op: lit('get'), ifAbsent: SX.ifAbsent, expected: boxExpected,
  }).refine(isExpectedWhole,  Phrases.ExpectedHalfVoid)
    .refine(isExpectedInLife, Phrases.ExpectedOfOtherVaultLife)
  const boxPut = boxQuery.extend({
    op: lit('put'), ifAbsent: SX.putIfAbsent, ifPresent: SX.ifPresent, expected: boxExpected, record: boxRecord,
  }).refine(isSeqNext,        Phrases.SeqNotNext)
    .refine(isRevisionTokNew, Phrases.RevisionTokNotNew)
    .refine(isExpectedWhole,  Phrases.ExpectedHalfVoid)
    .refine(isExpectedInLife, Phrases.ExpectedOfOtherVaultLife)
    .refine(isRecordAtAsk,    Phrases.RecordOfOtherAddress)
    .refine(({ record, expected }) => isLifeTokPlaced(record.box_tok, expected.box_tok, expected.am, record.am), Phrases.LifeTokMisplaced)
  const boxDel = boxQuery.extend({
    op: lit('del'), expected: boxExpected, record: boxTombstone,
  }).refine(isSeqNext,        Phrases.SeqNotNext)
    .refine(isRevisionTokNew, Phrases.RevisionTokNotNew)
    .refine(isExpectedWhole,  Phrases.ExpectedHalfVoid)
    .refine(isExpectedInLife, Phrases.ExpectedOfOtherVaultLife)
    .refine(isRecordAtAsk,    Phrases.RecordOfOtherAddress)
    .refine(({ record, expected }) => isLifeTokPlaced(record.box_tok, expected.box_tok, expected.am, record.am), Phrases.LifeTokMisplaced)

  return { boxGet, boxPut, boxDel, boxAsk: discrim('op', [boxGet, boxPut, boxDel]) }
}, [CX])

/** A box get, put or del ask under a bank, as the bankDB receives it and passes it to its adapter and the classifier. */
export type BoxAsk    = Readonly<Z.output<typeof boxAsk>>
/** A `getBox` ask: the box's scope under its vault's life, the expected row (or shell), and the `ifAbsent` option. */
export type BoxGetAsk = Extract<BoxAsk, { op: 'get' }>
/** A `putBox` ask: the box's scope under its vault's life, the record to store, the expected row (or shell), and the `ifPresent` and `ifAbsent` options. */
export type BoxPutAsk = Extract<BoxAsk, { op: 'put' }>
/** A `delBox` ask: the box's scope under its vault's life, the tombstone to store, and the expected row. */
export type BoxDelAsk = Extract<BoxAsk, { op: 'del' }>

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

// == [Adapters]: adapterBankDBOpts, memoryBankDBOpts, AdapterBankDBOpts, MemoryBankDBOpts, noticedRow, noticedParent

/** The check of an `AdapterBankDB`'s options: the same as an `AdapterVaultDB`'s. */
export const adapterBankDBOpts = SX.adapterVaultDBOpts
/** The check of a `MemoryBankDB`'s options: the same as a `MemoryVaultDB`'s. */
export const memoryBankDBOpts  = SX.memoryVaultDBOpts

/** An `AdapterBankDB`'s options: `maxRecordSizeEst`, the most bytes one stored box record may weigh. */
export type AdapterBankDBOpts = SX.AdapterVaultDBOpts
/** A `MemoryBankDB`'s options: an `AdapterBankDB`'s, and `maxBoxes`, a soft cap on the box rows of one vault life. */
export type MemoryBankDBOpts  = SX.MemoryVaultDBOpts

// Each row's `fmt` is its own, so no row passes two of these checks.
/** The checks of what a watch hears: a bank, gate, vault or box row, and the row above it, a bank row or a vault row. */
export const { noticedRow, noticedParent } = Checkers('damaged_row', ({ union }) => ({
  noticedRow:    union([bankRow, gateRecord, vaultRow, boxRow]),
  noticedParent: union([bankRow, vaultRow]),
}))
// --
