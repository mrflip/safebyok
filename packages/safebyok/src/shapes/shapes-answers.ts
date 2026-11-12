/** The checks of a vaultDB's answers as a client receives them from a wire, where an absent field arrives as null: each parses to the answer its verb returns. Imported as `AX`. */

import type * as Z from 'zod'
import { Checkers } from '../helpers/validator'
import { VaultError, refusalkindVals, type RefusalMeta, type RefusalRows } from '../refusals/errors'
import type { Outcome } from '../refusals/outcome'
import type { Answer, Notice } from '../storage/vault-db'
import * as EX from './shapes-enums'
import * as CX from './shapes-core'
import * as SX from './shapes-storage'
import type { LoggableAsk } from './shapes-storage'

// == [Crossed parts]: crossedErr, crossedAsk, damagedVault, damagedBox, CrossedErr, CrossedAsk

// A failed check here is a wire out of step with this copy of safebyok, never a damaged row: 'unexpected_error'.
/** The checks of the parts of a vaultDB answer that cross the wire: a refusal, what the answer carries of its ask, and the damaged rows listed. */
export const { crossedErr, crossedAsk, damagedVault, damagedBox } = Checkers('unexpected_error', ({ obj, arr, str, int, lit, oneof, user_id, banklabel, vaultlabel, boxlabel, vault_tok, box_tok, revision_tok }) => {
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
    vault_tok:    vault_tok.nullable().default(null),
    box_tok:      box_tok.nullable().default(null),
  }).strict()
  const crossedAsk = obj({
    op:         oneof(EX.askOpVals).nullable().default(null),
    user_id:    user_id.nullable().default(null),
    banklabel:  banklabel.nullable().default(null),
    vaultlabel: vaultlabel.nullable().default(null),
    boxlabel:   boxlabel.nullable().default(null),
    vault_tok:  vault_tok.nullable().default(null),
    ifAbsent:   SX.anyIfAbsent.nullable().default(null),
    ifPresent:  SX.ifPresent.nullable().default(null),
    gateVerb:   oneof(EX.gateVerbVals).nullable().default(null),
    expected:   crossedMeta.nullable().default(null),
    record:     crossedMeta.nullable().default(null),
  }).strict()
  // A damaged row's label is the one it is stored under, which may fail a label's check: a reason it is listed.
  const damagedVault = obj({ user_id, banklabel, vaultlabel: str, am: lit('d') }).strict()
  const damagedBox   = obj({ user_id, banklabel, vaultlabel, boxlabel: str, vault_tok, am: lit('d') }).strict()
  return { crossedErr, crossedAsk, damagedVault, damagedBox }
}, [CX])

/** A refusal as it crosses a wire: its kind, its message and the meta a server lets cross. */
export type CrossedErr = Z.output<typeof crossedErr>

/** What an answer carries of its ask as it crosses a wire, null for each field the ask left out. */
export type CrossedAsk = Z.output<typeof crossedAsk>
// --

// == [Answers]: listVaultsAnswer, getVaultAnswer, putVaultAnswer, replacePassphraseAnswer, addPasskeyAnswer, revokePasskeyAnswer, delVaultAnswer, listBoxesAnswer, getBoxAnswer, putBoxAnswer, delBoxAnswer, tidyGoneAnswer, crossedNotice

/** The answer a verb returns, made from the one that crossed: its ask as the core has it, and its refusal a VaultError again. */
function answerOfCrossed<ValT, ActT extends string, WorldT>(crossed: Crossed<ValT, ActT, WorldT>): Answer<ValT, ActT, WorldT> {
  const ask = askOfCrossed(crossed.ask)
  if (crossed.ok) { return { ok: true, act: crossed.act, val: crossed.val, world: crossed.world, dbhas: crossed.dbhas, ask } }
  const { act, world, dbhas } = crossed
  return { ok: false, act, world, dbhas, ask, err: vaultErrorOfCrossed(crossed.err, { act, ask }, { world, dbhas }) }
}

/** What an answer's check parses before {@link answerOfCrossed} makes the answer of it. */
type Crossed<ValT, ActT extends string, WorldT> = { ask: CrossedAsk, dbhas: unknown } & (
  | { ok: true, act: ActT, val: ValT, world: WorldT, err: null }
  | { ok: false, act: EX.BadAct, val: null, world: unknown, err: CrossedErr }
)

/** `crossed` as the core has an answer's ask, each null field left out, in its rows too. */
function askOfCrossed({ expected, record, ...crossed }: CrossedAsk): LoggableAsk {
  return {
    ...withoutNulls(crossed),
    ...((expected !== null) && { expected: withoutNulls(expected) }),
    ...((record !== null) && { record: withoutNulls(record) }),
  }
}

/** The fields of `crossed` that are not null. */
function withoutNulls(crossed: object): Record<string, unknown> { return Object.fromEntries(Object.entries(crossed).filter(([, field]) => field !== null)) }

/** The VaultError `crossed` stands for, its meta with what crossed and what the answer has. */
function vaultErrorOfCrossed({ refusalkind, message, meta }: CrossedErr, answered: RefusalMeta, rows: RefusalRows): VaultError {
  const crossedMeta = Object.fromEntries(Object.entries(meta ?? {}).filter(([, field]) => field !== null)) as RefusalMeta
  return new VaultError(refusalkind, message, { meta: { ...crossedMeta, ...answered }, rows })
}

/** The checks of each vaultDB verb's answer as it crosses the wire, and of a notice. */
export const {
  listVaultsAnswer, getVaultAnswer, putVaultAnswer, replacePassphraseAnswer, addPasskeyAnswer, revokePasskeyAnswer, delVaultAnswer,
  listBoxesAnswer, getBoxAnswer, putBoxAnswer, delBoxAnswer, tidyGoneAnswer, crossedNotice,
} = Checkers('unexpected_error', ({ obj, arr, uint, lit, oneof, union, discrim }) => {
  /** What makes the check of one verb's answer: its `val`, its acts, and its `world` and `dbhas`, good or refused. */
  type AnswerParts<ValT extends Z.ZodType, ActsT extends readonly [string, ...string[]], WorldT extends Z.ZodType> = {
    val: ValT, acts: ActsT, world: WorldT, badWorld: Z.ZodType, dbhas: Z.ZodType,
  }
  function answerCheck<ValT extends Z.ZodType, const ActsT extends readonly [string, ...string[]], WorldT extends Z.ZodType>(
    { val, acts, world, badWorld, dbhas }: AnswerParts<ValT, ActsT, WorldT>,
  ) {
    return discrim('ok', [
      obj({ ok: lit(true), act: oneof(acts), val, world, dbhas: dbhas.nullable().default(null), ask: crossedAsk, err: lit(null).default(null) }).strict(),
      obj({ ok: lit(false), act: oneof(EX.badActVals), val: lit(null).default(null), world: badWorld.nullable().default(null), dbhas: dbhas.nullable().default(null), ask: crossedAsk, err: crossedErr }).strict(),
    ]).transform((crossed) => answerOfCrossed(crossed as Crossed<Z.output<ValT>, ActsT[number], Z.output<WorldT>>))
  }

  const vaultish  = { world: SX.vaultRow, badWorld: SX.vaultRow, dbhas: SX.vaultRow }
  const boxish    = { world: SX.vaultRecord, badWorld: SX.vaultRow, dbhas: union([SX.vaultRow, SX.boxRow]) }
  const bankListed  = obj({ vaults: arr(SX.vaultRow), damaged_rows: arr(damagedVault) }).strict()
  const boxesListed = obj({ boxes: arr(SX.boxSparse.strict()), damaged_rows: arr(damagedBox) }).strict()
  const tidied      = obj({ totalCount: uint }).strict()

  const crossedNotice = discrim('ok', [
    obj({ ok: lit(true), act: oneof(['gotlive', 'gotgone']), val: union([SX.vaultRow, SX.boxRow]), world: SX.vaultRow.nullable().default(null), err: lit(null).default(null) }).strict(),
    obj({ ok: lit(false), act: oneof(EX.badActVals), val: lit(null).default(null), world: lit(null).default(null), err: crossedErr }).strict(),
  ]).transform((crossed): Outcome<Notice> => {
    if (crossed.ok) { return { ok: true, val: { act: crossed.act, val: crossed.val, world: crossed.world } } }
    return { ok: false, err: vaultErrorOfCrossed(crossed.err, { act: crossed.act }, {}) }
  })

  return {
    listVaultsAnswer:        answerCheck({ val: bankListed, acts: EX.listActVals, world: CX.bankScope, badWorld: lit(null), dbhas: lit(null) }),
    getVaultAnswer:          answerCheck({ val: SX.vaultRow.nullable(), acts: EX.gotActVals, ...vaultish }),
    putVaultAnswer:          answerCheck({ val: SX.vaultRow, acts: EX.putActVals, ...vaultish }),
    replacePassphraseAnswer: answerCheck({ val: SX.vaultRecord, acts: ['replaced'], ...vaultish }),
    addPasskeyAnswer:        answerCheck({ val: SX.vaultRecord, acts: ['added'], ...vaultish }),
    revokePasskeyAnswer:     answerCheck({ val: SX.vaultRecord, acts: ['revoked', 'passed'], ...vaultish }),
    delVaultAnswer:          answerCheck({ val: SX.vaultTombstone, acts: EX.delActVals, ...vaultish }),
    listBoxesAnswer:         answerCheck({ val: boxesListed, acts: EX.listActVals, world: SX.vaultRecord, badWorld: SX.vaultRow, dbhas: SX.vaultRow }),
    getBoxAnswer:            answerCheck({ val: SX.boxRow.nullable(), acts: EX.gotActVals, ...boxish }),
    putBoxAnswer:            answerCheck({ val: SX.boxRow, acts: EX.putActVals, ...boxish }),
    delBoxAnswer:            answerCheck({ val: SX.boxTombstone, acts: EX.delActVals, ...boxish }),
    tidyGoneAnswer:          answerCheck({ val: tidied, acts: ['tidied'], world: CX.bankScope, badWorld: lit(null), dbhas: lit(null) }),
    crossedNotice,
  }
})
// --
