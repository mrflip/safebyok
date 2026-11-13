/** The checks of a bankDB's answers as a client receives them over a wire, each parsing to the answer its verb returns.
 * A field left out arrives as null. Imported as `WX`.
 */

import type * as Z from 'zod'
import { Checkers } from '../helpers/validator'
import { VaultError, refusalkindVals, type RefusalMeta, type RefusalRows } from '../refusals/errors'
import type { Outcome } from '../refusals/outcome'
import type { Answer, Notice } from '../storage/bank-db'
import * as BX from './shapes-bankdb'
import * as EX from './shapes-enums'
import * as CX from './shapes-core'
import * as SX from './shapes-storage'
import type { LoggableAsk } from './shapes-bankdb'

// == [Crossed parts]: crossedErr, crossedAsk, damagedVault, damagedBox, CrossedErr, CrossedAsk

// A failed check here is a wire out of step with this copy of safebyok, never a damaged row: 'unexpected_error'.
/** The checks of the parts of a bankDB answer that cross the wire: a refusal, what the answer carries of its ask, and the damaged rows listed. */
export const { crossedErr, crossedAsk, damagedVault, damagedBox } = Checkers('unexpected_error', ({ obj, arr, str, int, lit, oneof, user_id, banklabel, vaultlabel, boxlabel, bank_tok, gate_tok, vault_tok, box_tok, revision_tok }) => {
  const crossedErr = obj({
    refusalkind: oneof(refusalkindVals),
    message:     str,
    /** The refusal's meta as a server lets it cross: these fields alone, never its cause. */
    meta:        obj({
      capacity:   SX.capacity.nullable().default(null),
      fieldnames: arr(str).nullable().default(null),
      oplabel:    str.nullable().default(null),
    }).strict().nullable().default(null),
  }).strict()
  const crossedMeta = obj({
    revision_tok: revision_tok.nullable().default(null),
    revision_seq: int.nullable().default(null),
    am:           oneof(EX.amVals).nullable().default(null),
    bank_tok:     bank_tok.nullable().default(null),
    gate_tok:     gate_tok.nullable().default(null),
    vault_tok:    vault_tok.nullable().default(null),
    box_tok:      box_tok.nullable().default(null),
  }).strict()
  const crossedAsk = obj({
    op:         oneof(EX.askOpVals).nullable().default(null),
    user_id:    user_id.nullable().default(null),
    banklabel:  banklabel.nullable().default(null),
    gatelabel:  lit('main').nullable().default(null),
    vaultlabel: vaultlabel.nullable().default(null),
    boxlabel:   boxlabel.nullable().default(null),
    bank_tok:   bank_tok.nullable().default(null),
    vault_tok:  vault_tok.nullable().default(null),
    ifAbsent:   SX.anyIfAbsent.nullable().default(null),
    ifPresent:  SX.ifPresent.nullable().default(null),
    expected:   crossedMeta.nullable().default(null),
    record:     crossedMeta.nullable().default(null),
    gate:       crossedMeta.nullable().default(null),
  }).strict()
  // A damaged row's label is the one it is stored under, which may fail a label's check: a reason it is listed.
  const damagedVault = obj({ user_id, banklabel, vaultlabel: str, am: lit('d') }).strict()
  const damagedBox   = obj({ user_id, banklabel, vaultlabel, boxlabel: str, bank_tok, vault_tok, am: lit('d') }).strict()
  return { crossedErr, crossedAsk, damagedVault, damagedBox }
}, [CX])

/** A refusal as it crosses a wire: its kind, its message and the meta a server lets cross. */
export type CrossedErr = Z.output<typeof crossedErr>

/** What a bankDB answer carries of its ask as it crosses a wire, null for each field the ask left out. */
export type CrossedAsk = Z.output<typeof crossedAsk>
// --

// == [Answers]: ensureBankAnswer, buildBankAnswer, replacePassphraseAnswer, addPasskeyAnswer, revokePasskeyAnswer, delBankAnswer, getVaultAnswer, putVaultAnswer, delVaultAnswer, listBoxesAnswer, getBoxAnswer, putBoxAnswer, delBoxAnswer, tidyGoneAnswer, crossedNotice

/** The answer a verb returns, made from the one that crossed the wire, with its refusal a VaultError again. */
function answerOfCrossed<ValT, ActT extends string, ParentT>(crossed: Crossed<ValT, ActT, ParentT>): Answer<ValT, ActT, ParentT> {
  const ask = askOfCrossed(crossed.ask)
  if (crossed.ok) { return { ok: true, act: crossed.act, val: crossed.val, parent: crossed.parent, dbhas: crossed.dbhas, ask } }
  const { act, parent, dbhas } = crossed
  return { ok: false, act, parent, dbhas, ask, err: vaultErrorOfCrossed(crossed.err, { act, ask }, { parent, dbhas }) }
}

/** What an answer's check parses before {@link answerOfCrossed} makes the answer of it. */
type Crossed<ValT, ActT extends string, ParentT> = { ask: CrossedAsk, dbhas: unknown } & (
  | { ok: true, act: ActT, val: ValT, parent: ParentT, err: null }
  | { ok: false, act: EX.BadAct, val: null, parent: unknown, err: CrossedErr }
)

/** `crossed` as the core has an answer's ask, with every null field left out, in its rows too. */
function askOfCrossed({ expected, record, gate, ...crossed }: CrossedAsk): LoggableAsk {
  return {
    ...withoutNulls(crossed),
    ...((expected !== null) && { expected: withoutNulls(expected) }),
    ...((record !== null) && { record: withoutNulls(record) }),
    ...((gate !== null) && { gate: withoutNulls(gate) }),
  }
}

/** The fields of `crossed` that are not null. */
function withoutNulls(crossed: object): Record<string, unknown> { return Object.fromEntries(Object.entries(crossed).filter(([, field]) => field !== null)) }

/** The VaultError `crossed` stands for, its meta what crossed with `answered` laid over it. */
function vaultErrorOfCrossed({ refusalkind, message, meta }: CrossedErr, answered: RefusalMeta, rows: RefusalRows): VaultError {
  const crossedMeta = withoutNulls(meta ?? {}) as RefusalMeta
  return new VaultError(refusalkind, message, { meta: { ...crossedMeta, ...answered }, rows })
}

/** The checks of each bankDB verb's answer as it crosses the wire, and of a notice. */
export const {
  ensureBankAnswer, buildBankAnswer, replacePassphraseAnswer, addPasskeyAnswer, revokePasskeyAnswer, delBankAnswer,
  getVaultAnswer, putVaultAnswer, delVaultAnswer, listBoxesAnswer, getBoxAnswer, putBoxAnswer, delBoxAnswer, tidyGoneAnswer, crossedNotice,
} = Checkers('unexpected_error', ({ obj, arr, uint, lit, oneof, union, discrim }) => {
  /** The parts of one verb's answer check: its `val`, its acts, and its `parent` and `dbhas`, good or refused. */
  type AnswerParts<ValT extends Z.ZodType, ActsT extends readonly [string, ...string[]], ParentT extends Z.ZodType> = {
    val: ValT, acts: ActsT, parent: ParentT, badParent: Z.ZodType, dbhas: Z.ZodType,
  }
  /** The check of one verb's answer as it crosses the wire. */
  function answerCheck<ValT extends Z.ZodType, const ActsT extends readonly [string, ...string[]], ParentT extends Z.ZodType>(
    { val, acts, parent, badParent, dbhas }: AnswerParts<ValT, ActsT, ParentT>,
  ) {
    return discrim('ok', [
      obj({ ok: lit(true), act: oneof(acts), val, parent, dbhas: dbhas.nullable().default(null), ask: crossedAsk, err: lit(null).default(null) }).strict(),
      obj({ ok: lit(false), act: oneof(EX.badActVals), val: lit(null).default(null), parent: badParent.nullable().default(null), dbhas: dbhas.nullable().default(null), ask: crossedAsk, err: crossedErr }).strict(),
    ]).transform((crossed) => answerOfCrossed(crossed as Crossed<Z.output<ValT>, ActsT[number], Z.output<ParentT>>))
  }

  const gateActs    = ['replaced', 'passed'] as const
  const gateish     = { parent: BX.bankRow, badParent: BX.bankRow, dbhas: BX.gateRecord }
  const vaultish    = { parent: BX.bankRow, badParent: BX.bankRow, dbhas: BX.vaultRow }
  const boxish      = { parent: BX.vaultRecord, badParent: BX.vaultRow, dbhas: BX.boxRow }
  const bankEnsured = obj({ gates: obj({ main: BX.gateRecord }).strict(), vaults: arr(BX.vaultRow), damaged_rows: arr(damagedVault) }).strict()
  const boxesListed = obj({ boxes: arr(BX.boxSparse.strict()), damaged_rows: arr(damagedBox) }).strict()
  const tidied      = obj({ totalCount: uint }).strict()

  const noticedAbove = union([BX.bankRow, BX.vaultRow, lit(BX.BankTop)])
  const crossedNotice = discrim('ok', [
    obj({
      ok: lit(true), act: oneof(['gotlive', 'gotgone']), val: union([BX.bankRow, BX.gateRecord, BX.vaultRow, BX.boxRow]),
      parent: noticedAbove.nullable().default(null), err: lit(null).default(null),
    }).strict(),
    obj({ ok: lit(false), act: oneof(EX.badActVals), val: lit(null).default(null), parent: lit(null).default(null), err: crossedErr }).strict(),
  ]).transform((crossed): Outcome<Notice> => {
    if (crossed.ok) {
      const parent = BX.noticeParentOf(crossed.val, crossed.parent)
      return { ok: true, val: { act: crossed.act, val: crossed.val, parent } }
    }
    return { ok: false, err: vaultErrorOfCrossed(crossed.err, { act: crossed.act }, {}) }
  })

  return {
    ensureBankAnswer:        answerCheck({ val: bankEnsured.nullable(), acts: EX.gotActVals, parent: BX.bankRow, badParent: BX.bankRow, dbhas: lit(null) }),
    buildBankAnswer:         answerCheck({ val: BX.gateRecord, acts: EX.putActVals, parent: BX.bankRow, badParent: BX.bankRow, dbhas: BX.bankRow }),
    replacePassphraseAnswer: answerCheck({ val: BX.gateRecord, acts: gateActs, ...gateish }),
    addPasskeyAnswer:        answerCheck({ val: BX.gateRecord, acts: gateActs, ...gateish }),
    revokePasskeyAnswer:     answerCheck({ val: BX.gateRecord, acts: gateActs, ...gateish }),
    delBankAnswer:           answerCheck({ val: BX.bankTombstone, acts: EX.delActVals, parent: lit(BX.BankTop), badParent: lit(BX.BankTop), dbhas: BX.bankRow }),
    getVaultAnswer:          answerCheck({ val: BX.vaultRow.nullable(), acts: EX.gotActVals, ...vaultish }),
    putVaultAnswer:          answerCheck({ val: BX.vaultRow, acts: EX.putActVals, ...vaultish }),
    delVaultAnswer:          answerCheck({ val: BX.vaultTombstone, acts: EX.delActVals, ...vaultish }),
    listBoxesAnswer:         answerCheck({ val: boxesListed, acts: EX.listActVals, parent: BX.vaultRecord, badParent: BX.vaultRow, dbhas: lit(null) }),
    getBoxAnswer:            answerCheck({ val: BX.boxRow.nullable(), acts: EX.gotActVals, ...boxish }),
    putBoxAnswer:            answerCheck({ val: BX.boxRow, acts: EX.putActVals, ...boxish }),
    delBoxAnswer:            answerCheck({ val: BX.boxTombstone, acts: EX.delActVals, ...boxish }),
    tidyGoneAnswer:          answerCheck({ val: tidied, acts: ['tidied'], parent: CX.bankScope, badParent: lit(null), dbhas: lit(null) }),
    crossedNotice,
  }
})
// --
