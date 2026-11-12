import { describe, expect, it } from 'vitest'
import { UNANSWERED } from '../../src/helpers/consts'
import * as Refuse from '../../src/refusals/throwers'
import { VaultError } from '../../src/refusals/errors'
import { BankDBVerbnames, answerWithVal, badAnswerOf, refusedAnswerOf } from '../../src/storage/bank-db'
import { MemoryBankDB } from '../../src/storage/memory-bank-db'
import { brandedBankDB } from '../../src/shapes/shapes-vaultish'
import type { GateAnswer } from '../../src/storage/bank-db'
import { bankAt, gateAt } from '../test-helpers/bankdb-world'

const bank = bankAt(2)
const gate = gateAt(2)
const ask  = { op: 'build' as const, user_id: 'u1', banklabel: 'acme' }

describe("the bankDB's answer helpers, with the row above as parent", () => {
  const passed: GateAnswer = { ok: true, val: gate, act: 'passed', parent: bank, ask }

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

/** Each verb of `bankDB`, bound, as a client of it would answer them. */
function verbsOf(bankDB: MemoryBankDB): Record<string, unknown> { return Object.fromEntries(BankDBVerbnames.map((verbname) => [verbname, bankDB[verbname].bind(bankDB)])) }

describe("what a model accepts as a BankDB", () => {
  const brand = { [Symbol.for('@safebyok/bankdb')]: true }

  it("accepts a BankDB, or a client that has the brand and every verb", () => {
    const bankDB = new MemoryBankDB()
    expect(brandedBankDB.parse(bankDB)).to.eq(bankDB)
    const client = { ...brand, ...verbsOf(bankDB) }
    expect(brandedBankDB.parse(client)).to.eq(client)
  })

  it("refuses a brand without the verbs, the verbs without a brand, or a verb that is no function", () => {
    const verbs = verbsOf(new MemoryBankDB())
    expect(() => brandedBankDB.parse(brand)).to.throw(VaultError).with.property('refusalkind', 'bad_option')
    expect(() => brandedBankDB.parse(verbs)).to.throw(VaultError).with.property('refusalkind', 'bad_option')
    expect(() => brandedBankDB.parse({ ...brand, ...verbs, watch: 'soon' })).to.throw(VaultError).with.property('refusalkind', 'bad_option')
  })
})
