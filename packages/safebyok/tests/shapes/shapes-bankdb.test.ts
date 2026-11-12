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
    [{ ...vault, fmt: SX.VaultFormat },                  false, "refuses the vaultDB's fmt"],
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
  const keyed = gateAt(3, 'bank1', { main: mainWayin, passkey0: passkey0Wayin })
  expectCases(BX.gatePut, [
    [gatePutAskOf('replacePassphrase', gate, { main: otherMainWayin }),                 true,  'passes a replacePassphrase'],
    [gatePutAskOf('addPasskey', gate, { main: mainWayin, passkey0: passkey0Wayin }),    true,  'passes an addPasskey whose record has a passkey wayin'],
    [gatePutAskOf('addPasskey', gate, { main: mainWayin }),                             false, 'refuses an addPasskey whose record has none'],
    [gatePutAskOf('revokePasskey', keyed, { main: mainWayin }),                         true,  'passes a revokePasskey whose record has no passkey wayin'],
    [gatePutAskOf('revokePasskey', keyed, keyed.wayins),                                false, 'refuses a revokePasskey whose record has one'],
    [{ ...gatePutAskOf('replacePassphrase', gate, { main: otherMainWayin }), gatelabel: 'side' }, false, 'refuses a gate other than main'],
  ])

  it("refuses a record under another gate_tok than the live row it replaces", () => {
    const ask = gatePutAskOf('replacePassphrase', gate, { main: otherMainWayin })
    expect(() => BX.gatePut.parse({ ...ask, record: { ...ask.record, gate_tok: 'gate2' } })).to.throw(VaultError).with.property('refusalkind', 'bad_record')
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
})
