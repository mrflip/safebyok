import { describe, expect, it } from 'vitest'
import { UNANSWERED } from '../../src/helpers/consts'
import * as Refuse from '../../src/refusals/throwers'
import { VaultError } from '../../src/refusals/errors'
import { answerWithVal, badAnswerOf, refusedAnswerOf } from '../../src/storage/bank-db'
import type { BuildBankAnswer } from '../../src/storage/bank-db'
import { bankAt, gateAt } from '../test-helpers/bankdb-world'

const bank = bankAt(2)
const gate = gateAt(2)
const ask  = { op: 'build' as const, user_id: 'u1', banklabel: 'acme' }

describe("the bankDB's answer helpers, with the row above as parent", () => {
  const passed: BuildBankAnswer = { ok: true, val: gate, act: 'passed', parent: bank, ask }

  it("answerWithVal keeps the act, parent and ask of a good answer", () => {
    expect(answerWithVal(passed, 'other')).to.deep.equal({ ok: true, val: 'other', act: 'passed', parent: bank, ask })
  })

  it("refusedAnswerOf keeps the act and parent of the answer it was delivering", () => {
    const err = new VaultError('storage_issue', 'lost')
    expect(refusedAnswerOf(err, passed)).to.deep.equal({ ok: false, err, act: 'passed', parent: bank, ask })
  })

  it("badAnswerOf reads the parent and dbhas a refusal carries, and a null parent where it carries none", () => {
    const err = Refuse.bankGateIssue(bank, gate, 'moved')
    expect(badAnswerOf(err)).to.deep.include({ ok: false, err, act: 'unclassified_storing', parent: bank, dbhas: gate })
    expect(refusedAnswerOf(new VaultError('storage_issue', 'lost'), UNANSWERED)).to.deep.include({ parent: null })
  })
})
