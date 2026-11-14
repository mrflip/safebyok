import { describe, expect, it } from 'vitest'
import * as BX from '../../src/shapes/shapes-bankdb'
import * as SX from '../../src/shapes/shapes-storage'
import { VaultError } from '../../src/refusals/errors'
import { expectCases } from '../test-helpers/cases'
import {
  bankAt, bankBuildAskOf, bankDelAskOf, bankEnsureAsk, bankScope, gateAt, gatePutAskOf, mainWayin, otherMainWayin, passkey0Wayin,
  vaultAt, vaultDelAskOf, vaultGetAskOf, vaultPutAskOf, vaultScope, vaultTombstoneOf,
} from '../test-helpers/bankdb-world'

const bank  = bankAt()
const gate  = gateAt()
const vault = vaultAt()

describe("BX.bankRow", () => {
  expectCases(BX.bankRow, [
    [bank,                                               true,  'passes a live bank row'],
    [{ ...bank, am: 'x' },                               true,  'passes a bank tombstone, its fields the same'],
    [BX.shellBankOf(bankScope),                          true,  'passes the shell of a bank not stored'],
    [{ ...bank, fmt: BX.BankFormat + 1 },                false, 'refuses a later fmt'],
    [{ ...bank, smuggled: 'field' },                     false, 'refuses an extra field'],
    [{ ...bank, bank_tok: '' },                          false, 'refuses an empty bank_tok'],
    [{ ...bank, vault_tok: 'life1' },                    false, 'refuses a vault_tok'],
  ])
})

describe("BX.gateRecord", () => {
  expectCases(BX.gateRecord, [
    [gate,                                               true,  'passes a gate row with its main wayin'],
    [{ ...gate, wayins: { main: mainWayin, passkey0: passkey0Wayin } }, true, 'passes a gate row with a passkey wayin'],
    [{ ...gate, gatelabel: 'side' },                     false, 'refuses a gate other than main'],
    [{ ...gate, am: 'x' },                               false, 'refuses a gate tombstone'],
    [{ ...gate, wayins: {} },                            false, 'refuses a gate without its main wayin'],
    [{ ...gate, wayins: { main: passkey0Wayin } },       false, 'refuses a passkey wayin as main'],
    [{ ...gate, wayins: { main: mainWayin, passkey1: passkey0Wayin } }, false, 'refuses a wayin under another wayinlabel'],
    [{ ...gate, wayins: { main: { ...mainWayin, wayinlabel: 'passkey0' } } }, false, 'refuses a wayin whose wayinlabel is not its ckey'],
    [{ ...gate, auth: { smuggled: 'field' } },           false, 'refuses a filled auth bag'],
    [{ ...gate, sigs: { smuggled: 'field' } },           false, 'refuses a filled sigs bag'],
    [{ ...gate, meta: { smuggled: 'field' } },           false, 'refuses a filled meta bag'],
    [{ ...gate, gate_epoch: 1 },                         false, 'refuses a gate_epoch'],
    [{ ...gate, fmt: BX.GateFormat + 1 },                false, 'refuses a later fmt'],
  ])
})

describe("BX.vaultRow", () => {
  expectCases(BX.vaultRow, [
    [vault,                                              true,  'passes a live vault row of a bank'],
    [vaultTombstoneOf(vault),                            true,  'passes its tombstone'],
    [BX.shellVaultOf(vaultScope),                        true,  'passes the shell of a vault not stored'],
    [{ ...vault, fmt: BX.VaultFormat - 1 },              false, 'refuses an earlier fmt'],
    [{ ...vault, gate: gate },                           false, 'refuses a gate'],
    [{ ...vault, bank_tok: undefined },                  false, 'refuses a vault row without a bank_tok'],
  ])
})

describe("BX.storedBankRow, BX.storedGateRow and BX.storedVaultRow", () => {
  it("refuse damaged_row for a row that fails its checks", () => {
    for (const [check, row] of [[BX.storedBankRow, bank], [BX.storedGateRow, gate], [BX.storedVaultRow, vault]] as const) {
      expect(() => check.parse({ ...row, smuggled: 'field' })).to.throw(VaultError).with.property('refusalkind', 'damaged_row')
    }
  })
})

describe("BX.bankEnsure", () => {
  expectCases(BX.bankEnsure, [
    [bankEnsureAsk,                                      true,  'passes the ask of the bank and its main gate'],
    [{ ...bankEnsureAsk, gates: [] },                    false, 'refuses an ask of no gate'],
    [{ ...bankEnsureAsk, gates: ['main', 'side'] },      false, 'refuses an ask of a second gate'],
    [{ ...bankEnsureAsk, gates: ['side'] },              false, 'refuses an ask of a gate other than main'],
  ])
})

describe("BX.bankBuild", () => {
  const ask = bankBuildAskOf()
  expectCases(BX.bankBuild, [
    [ask,                                                                   true,  'passes the bank record and its gate, over nothing'],
    [{ ...ask, record: { ...ask.record, bank_tok: SX.VoidLifeTok } },       false, 'refuses a void bank_tok'],
    [{ ...ask, gate: gateAt(0, 'bank0') },                                  false, 'refuses a gate under another bank_tok'],
    [{ ...ask, gate: { ...ask.gate, user_id: 'u2' } },                      false, 'refuses a gate of another user'],
    [{ ...ask, gate: gateAt(1) },                                           false, 'refuses a gate past its first revision'],
    [{ ...ask, gate: { ...ask.gate, gate_tok: SX.VoidLifeTok } },           false, 'refuses a void gate_tok'],
    [{ ...ask, record: { ...ask.record, revision_seq: 1 } },                false, 'refuses a record that skips a revision'],
    [{ ...ask, record: { ...ask.record, banklabel: 'other' } },             false, 'refuses a record at another address'],
  ])

  it("refuses bad_record", () => {
    expect(() => BX.bankBuild.parse({ ...ask, gate: gateAt(1) })).to.throw(VaultError).with.property('refusalkind', 'bad_record')
  })
})

describe("BX.gatePut", () => {
  const keyed    = gateAt(3, 'bank1', { main: mainWayin, passkey0: passkey0Wayin })
  const replace  = gatePutAskOf('replace_passphrase', gate, { main: otherMainWayin })
  const { wayins: _wayins, ...expectedBare } = replace.expected
  const { options: _options, ...optionless } = replace
  expectCases(BX.gatePut, [
    [replace,                                                                     true,  'passes a record with its main wayin replaced'],
    [gatePutAskOf('add_passkey', gate, { main: mainWayin, passkey0: passkey0Wayin }), true, 'passes a record with a passkey wayin added'],
    [gatePutAskOf('revoke_passkey', keyed, { main: mainWayin }),                  true,  'passes a record with its passkey wayin removed'],
    [{ ...replace, gatelabel: 'side' },                                           false, 'refuses a gate other than main'],
    // the policy it is under:
    [optionless,                                                                  false, 'refuses an ask with no options'],
    [{ ...replace, options: {} },                                                 false, 'refuses options with no policies'],
    [{ ...replace, options: { policies: [] } },                                   false, 'refuses an empty list of policies'],
    [{ ...replace, options: { policies: ["replace_passphrase", "add_passkey"] } }, false, 'refuses two policies'],
    [{ ...replace, options: { policies: ["replacePassphrase"] } },                false, 'refuses a policy of no known name'],
    [{ ...replace, options: { policies: ["replace_passphrase"], ifAbsent: "add" } }, false, 'refuses an extra field in its options'],
    // the expected row:
    [{ ...replace, expected: expectedBare },                                      false, 'refuses an expected row without its wayins'],
  ])

  it("refuses a record under another gate_tok than the live row it replaces", () => {
    expect(() => BX.gatePut.parse({ ...replace, record: { ...replace.record, gate_tok: 'gate2' } })).to.throw(VaultError).with.property('refusalkind', 'bad_record')
  })

  it("refuses a put with no policy as it does a malformed record", () => {
    expect(() => BX.gatePut.parse({ ...replace, options: { policies: [] } })).to.throw(VaultError).with.property('refusalkind', 'bad_record')
  })
})

describe("BX.bankDel", () => {
  const ask = bankDelAskOf(bankAt(2))
  expectCases(BX.bankDel, [
    [ask,                                                                   true,  'passes the tombstone of the bank row it cites'],
    [{ ...ask, record: { ...ask.record, bank_tok: 'bank1' } },              false, 'refuses a tombstone keeping the bank_tok'],
    [{ ...ask, record: bankAt(3) },                                         false, 'refuses a live record'],
  ])
})

describe("BX.vaultAsk", () => {
  expectCases(BX.vaultAsk, [
    [vaultGetAskOf(),                                                       true,  'passes a get under a bank_tok'],
    [vaultPutAskOf(vault),                                                  true,  'passes a put of a vault row of the bank'],
    [vaultDelAskOf(vaultAt(2)),                                             true,  'passes a del'],
    [{ ...vaultGetAskOf(), bank_tok: undefined },                           false, 'refuses a get with no bank_tok'],
    [{ ...vaultPutAskOf(vault), record: { ...vault, bank_tok: undefined } },  false, 'refuses a put of a record with no bank_tok'],
  ])
})

describe("BX.loggableAsk", () => {
  it("keeps the meta of a record and its gate, and drops their payloads", () => {
    const ask    = bankBuildAskOf()
    const logged = BX.loggableAsk.parse(ask)
    expect(logged.gate).to.deep.equal({ ...SX.revisionOf(ask.gate), am: 'a', bank_tok: 'bank1', gate_tok: 'gate1' })
    expect(JSON.stringify(logged)).not.to.include('salt_b64')
  })

  it("keeps a gate put's policies, and drops the wayins of its expected row and record", () => {
    const logged = BX.loggableAsk.parse(gatePutAskOf('add_passkey', gate, { main: mainWayin, passkey0: passkey0Wayin }))
    expect(logged.options).to.deep.equal({ policies: ['add_passkey'] })
    expect(JSON.stringify(logged)).not.to.include('wayin')
  })
})
