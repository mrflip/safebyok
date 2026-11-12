import { describe, expect, it } from 'vitest'
import * as BX from '../../src/shapes/shapes-bankdb'
import * as SX from '../../src/shapes/shapes-storage'
import { type VaultError, rowsOfRefusal } from '../../src/refusals/errors'
import { classifyBuildBank, classifyDelBank, classifyEnsureBank, classifyStoredBox, classifyStoredBoxes, classifyStoredGate, classifyStoredVault } from '../../src/storage/bank-classifier'
import {
  bankAt, bankBuildAskOf, bankDelAskOf, bankEnsureAsk, bankScope, bankTombstoneOf, boxAt, boxGetAskOf, boxListAsk, boxQuery, gateAt, gatePutAskOf, mainWayin, otherMainWayin, passkey0Wayin,
  vaultAt, vaultDelAskOf, vaultGetAskOf, vaultPutAskOf, vaultScope, vaultTombstoneOf,
} from '../test-helpers/bankdb-world'
import { Now } from '../test-helpers/storage-world'

// The stored rows stand at this seq, so an ask can cite one below it and one above.
const Seq = 5

const liveBank   = bankAt(Seq)
const goneBank   = bankTombstoneOf(bankAt(Seq - 1))
const rebornBank = bankAt(Seq, 'bank2')
const liveGate   = gateAt(Seq)
const keyedGate  = gateAt(Seq, 'bank1', { main: mainWayin, passkey0: passkey0Wayin })
const liveVault  = vaultAt(Seq)

function refusalOf(classify: () => unknown): VaultError {
  try { classify() } catch (err) { return err as VaultError }
  return expect.fail('the classifier answered where it should have thrown')
}

describe("classifyStoredGate and classifyStoredVault, the row above", () => {
  const replace = gatePutAskOf('replacePassphrase', liveGate, { main: otherMainWayin })
  const vaultGet = vaultGetAskOf()
  const BankCases = [
    [null,       "bank_void",   'no bank row'],
    [goneBank,   "bank_gone",   'a bank tombstone'],
    [rebornBank, "bank_reborn", 'a live bank row of another life'],
  ] as const

  for (const [bankRaw, act, blurb] of BankCases) {
    it(`refuses ${act} at ${blurb}, whatever the row asked for`, () => {
      for (const gateRaw of [null, liveGate, { smuggled: 'field' }]) {
        expect(classifyStoredGate(replace, { bank: bankRaw, gate: gateRaw })).to.deep.include({ ok: false, act, gate: null, presence: null })
      }
      for (const vaultRaw of [null, liveVault, { smuggled: 'field' }]) {
        expect(classifyStoredVault(vaultGet, { bank: bankRaw, vault: vaultRaw })).to.deep.include({ ok: false, act, vault: null, presence: null })
      }
    })
  }

  it("answers the bank row stored as the parent, or the shell for none", () => {
    expect(classifyStoredVault(vaultGet, { bank: liveBank, vault: liveVault }).parent).to.deep.equal(liveBank)
    expect(classifyStoredVault(vaultGet, { bank: null, vault: null }).parent).to.deep.equal(BX.shellBankOf(bankScope))
  })

  it("counts a gate or vault row under another bank_tok as no row", () => {
    const oldGate  = gateAt(Seq, 'bank0')
    const oldVault = vaultAt(Seq, 'bank0')
    expect(classifyStoredGate(replace, { bank: liveBank, gate: oldGate })).to.deep.include({ ok: false, act: 'ahead', gate: null, presence: 'void' })
    expect(classifyStoredVault(vaultGetAskOf('bank1', 'nil'), { bank: liveBank, vault: oldVault })).to.deep.include({ ok: true, act: 'gotvoid', vault: null })
    const put      = vaultPutAskOf(vaultAt(0))
    expect(classifyStoredVault(put, { bank: liveBank, vault: oldVault })).to.deep.include({ ok: true, act: 'born', presence: 'void' })
  })

  it("refuses damaged_row for a bank row that fails its checks, and storage_issue for one of another scope", () => {
    expect(refusalOf(() => classifyStoredVault(vaultGet, { bank: { ...liveBank, smuggled: 'field' }, vault: liveVault })).refusalkind).to.eq('damaged_row')
    expect(refusalOf(() => classifyStoredVault(vaultGet, { bank: { ...liveBank, banklabel: 'other' }, vault: liveVault })).refusalkind).to.eq('storage_issue')
    expect(refusalOf(() => classifyStoredGate(replace, { bank: 'rubble', gate: liveGate })).refusalkind).to.eq('storage_issue')
  })
})

describe("classifyStoredVault, the vault tables under a live bank", () => {
  it("gets, puts and deletes as the vaultDB's tables do", () => {
    const vault0 = vaultAt(0)
    const nilGet = vaultGetAskOf('bank1', 'nil')
    expect(classifyStoredVault(nilGet, { bank: liveBank, vault: null })).to.deep.include({ ok: true, act: 'gotvoid', vault: null, presence: 'void' })
    expect(classifyStoredVault(nilGet, { bank: liveBank, vault: liveVault })).to.deep.include({ ok: true, act: 'gotlive', vault: liveVault })
    expect(classifyStoredVault(vaultGetAskOf(), { bank: liveBank, vault: null })).to.deep.include({ ok: false, act: 'void' })
    const put = vaultPutAskOf(vault0)
    expect(classifyStoredVault(put, { bank: liveBank, vault: null })).to.deep.include({ ok: true, act: 'born', vault: vault0 })
    expect(classifyStoredVault(put, { bank: liveBank, vault: liveVault })).to.deep.include({ ok: false, act: 'stale', vault: liveVault })
    const del = vaultDelAskOf(liveVault)
    expect(classifyStoredVault(del, { bank: liveBank, vault: liveVault })).to.deep.include({ ok: true, act: 'deleted', vault: del.record })
    expect(classifyStoredVault(del, { bank: liveBank, vault: vaultTombstoneOf(liveVault) })).to.deep.include({ ok: false, act: 'retcon' })
  })

  it("refuses damaged_row for a vault row that fails its checks", () => {
    expect(refusalOf(() => classifyStoredVault(vaultGetAskOf(), { bank: liveBank, vault: { ...liveVault, fmt: SX.VaultFormat } })).refusalkind).to.eq('damaged_row')
  })
})

function fetchedOver(gate: unknown) { return { bank: liveBank, gate } }

describe("classifyStoredGate, the gate verbs' policy", () => {
  describe("replacePassphrase", () => {
    it("replaces the gate row when only the main wayin moves", () => {
      const ask = gatePutAskOf('replacePassphrase', keyedGate, { main: otherMainWayin, passkey0: passkey0Wayin })
      expect(classifyStoredGate(ask, fetchedOver(keyedGate))).to.deep.include({ ok: true, act: 'replaced', gate: ask.record, presence: 'live' })
    })
    it("refuses gate_issue when the record moves another wayin", () => {
      const ask = gatePutAskOf('replacePassphrase', keyedGate, { main: otherMainWayin })
      expect(refusalOf(() => classifyStoredGate(ask, fetchedOver(keyedGate))).refusalkind).to.eq('gate_issue')
    })
    it("refuses gate_issue when the record changes registered_at", () => {
      const ask = gatePutAskOf('replacePassphrase', liveGate, { main: otherMainWayin })
      const err = refusalOf(() => classifyStoredGate({ ...ask, record: { ...ask.record, registered_at: Now + 1 } }, fetchedOver(liveGate)))
      expect(err.refusalkind).to.eq('gate_issue')
      expect(rowsOfRefusal(err)).to.deep.include({ parent: liveBank, dbhas: liveGate })
    })
  })

  describe("addPasskey", () => {
    it("replaces the gate row when only a passkey wayin is added", () => {
      const ask = gatePutAskOf('addPasskey', liveGate, { main: mainWayin, passkey0: passkey0Wayin })
      expect(classifyStoredGate(ask, fetchedOver(liveGate))).to.deep.include({ ok: true, act: 'replaced', gate: ask.record })
    })
    it("refuses camped where the gate row has a passkey wayin", () => {
      const ask = gatePutAskOf('addPasskey', keyedGate, { main: mainWayin, passkey0: passkey0Wayin })
      expect(classifyStoredGate(ask, fetchedOver(keyedGate))).to.deep.include({ ok: false, act: 'camped', gate: keyedGate })
    })
    it("refuses gate_issue when the record moves the main wayin", () => {
      const ask = gatePutAskOf('addPasskey', liveGate, { main: otherMainWayin, passkey0: passkey0Wayin })
      expect(refusalOf(() => classifyStoredGate(ask, fetchedOver(liveGate))).refusalkind).to.eq('gate_issue')
    })
  })

  describe("revokePasskey", () => {
    it("replaces the gate row when only the passkey wayin is removed", () => {
      const ask = gatePutAskOf('revokePasskey', keyedGate, { main: mainWayin })
      expect(classifyStoredGate(ask, fetchedOver(keyedGate))).to.deep.include({ ok: true, act: 'replaced', gate: ask.record })
    })
    it("passes where the gate row has no passkey wayin, storing nothing", () => {
      const ask = gatePutAskOf('revokePasskey', liveGate, { main: mainWayin })
      expect(classifyStoredGate(ask, fetchedOver(liveGate))).to.deep.include({ ok: true, act: 'passed', gate: liveGate })
    })
    it("refuses gate_issue when the record moves the main wayin", () => {
      const ask = gatePutAskOf('revokePasskey', keyedGate, { main: otherMainWayin })
      expect(refusalOf(() => classifyStoredGate(ask, fetchedOver(keyedGate))).refusalkind).to.eq('gate_issue')
    })
  })

  it("runs no policy over a gate row the revision rules refuse", () => {
    const ask = gatePutAskOf('replacePassphrase', gateAt(Seq - 1), { main: mainWayin, passkey0: passkey0Wayin })
    expect(classifyStoredGate(ask, fetchedOver(liveGate))).to.deep.include({ ok: false, act: 'stale', gate: liveGate })
  })

  it("puts no gate row where the live bank stores none", () => {
    const ask = gatePutAskOf('replacePassphrase', liveGate, { main: otherMainWayin })
    expect(classifyStoredGate(ask, fetchedOver(null))).to.deep.include({ ok: false, act: 'ahead', gate: null, presence: 'void' })
  })

  it("refuses damaged_row for a gate row that fails its checks", () => {
    const ask = gatePutAskOf('replacePassphrase', liveGate, { main: otherMainWayin })
    expect(refusalOf(() => classifyStoredGate(ask, fetchedOver({ ...liveGate, auth: { smuggled: 'field' } }))).refusalkind).to.eq('damaged_row')
  })
})

describe("classifyBuildBank, the bank and its gate in one step", () => {
  it("is born over nothing, answering the records it stores", () => {
    const ask = bankBuildAskOf()
    expect(classifyBuildBank(ask, { bank: null, gate: null })).to.deep.equal({ ok: true, act: 'born', parent: ask.record, gate: ask.gate, presence: 'void' })
  })

  it("is reborn over the tombstone it cites, whatever gate row an ended life left", () => {
    const record = { ...bankAt(Seq + 1, 'bank2'), revision_tok: 'krev-new' }
    const ask    = bankBuildAskOf(record, gateAt(0, 'bank2'), goneBank)
    for (const gateRaw of [null, liveGate]) {
      expect(classifyBuildBank(ask, { bank: goneBank, gate: gateRaw })).to.deep.include({ ok: true, act: 'reborn', parent: record, gate: ask.gate, presence: 'gone' })
    }
  })

  it("passes over a live bank, answering it and its main gate", () => {
    const ask = bankBuildAskOf()
    expect(classifyBuildBank(ask, { bank: liveBank, gate: liveGate })).to.deep.equal({ ok: true, act: 'passed', parent: liveBank, gate: liveGate, presence: 'live' })
  })

  it("refuses damaged_row for a live bank without its main gate", () => {
    const err = refusalOf(() => classifyBuildBank(bankBuildAskOf(), { bank: liveBank, gate: null }))
    expect(err.refusalkind).to.eq('damaged_row')
    expect(rowsOfRefusal(err)).to.deep.include({ parent: liveBank })
    expect(refusalOf(() => classifyBuildBank(bankBuildAskOf(), { bank: liveBank, gate: gateAt(Seq, 'bank0') })).refusalkind).to.eq('damaged_row')
  })

  it("refuses by the put table over a tombstone it does not cite", () => {
    expect(classifyBuildBank(bankBuildAskOf(), { bank: goneBank, gate: null })).to.deep.include({ ok: false, act: 'stale', parent: goneBank, gate: null })
  })
})

describe("classifyDelBank, the bank's tombstone and its cascade", () => {
  it("deletes the live bank it cites, answering the tombstone it stores", () => {
    const ask = bankDelAskOf(liveBank)
    expect(classifyDelBank(ask, { bank: liveBank })).to.deep.equal({ ok: true, act: 'deleted', bank: ask.record, presence: 'live' })
  })

  it("refuses by the del table otherwise", () => {
    const ask = bankDelAskOf(liveBank)
    expect(classifyDelBank(ask, { bank: null })).to.deep.include({ ok: false, act: 'ahead', bank: null })
    expect(classifyDelBank(ask, { bank: ask.record })).to.deep.include({ ok: false, act: 'retcon' })
    const staleDel = bankDelAskOf(bankAt(Seq - 1))
    expect(classifyDelBank(staleDel, { bank: liveBank })).to.deep.include({ ok: false, act: 'stale', bank: liveBank })
  })
})

describe("classifyEnsureBank, the bank with its gate and vaults", () => {
  it("answers gotvoid or gotgone, with nothing ensured, for a bank that is not live", () => {
    expect(classifyEnsureBank(bankEnsureAsk, { bank: null, gate: null, vaults: [] })).to.deep.equal({ ok: true, act: 'gotvoid', parent: BX.shellBankOf(bankScope), ensured: null })
    expect(classifyEnsureBank(bankEnsureAsk, { bank: goneBank, gate: liveGate, vaults: [] })).to.deep.equal({ ok: true, act: 'gotgone', parent: goneBank, ensured: null })
  })

  it("answers a live bank's main gate and its vault rows, leaving out those of an ended life and setting aside the damaged", () => {
    const other   = { ...vaultAt(Seq), vaultlabel: 'other' }
    const old     = { ...vaultAt(Seq, 'bank0'), vaultlabel: 'old' }
    const vaults  = [
      { vaultlabel: 'main', vault: liveVault }, { vaultlabel: 'other', vault: other },
      { vaultlabel: 'old', vault: old }, { vaultlabel: 'bad', vault: { ...liveVault, vaultlabel: 'bad', smuggled: 'field' } },
    ]
    const stored = classifyEnsureBank(bankEnsureAsk, { bank: liveBank, gate: liveGate, vaults })
    expect(stored).to.deep.include({ ok: true, act: 'gotlive', parent: liveBank })
    expect(stored.ensured?.gates.main).to.deep.equal(liveGate)
    expect(stored.ensured?.vaults).to.deep.equal([liveVault, other])
    expect(stored.ensured?.damaged_rows).to.deep.equal([SX.damagedVaultOf({ ...bankScope, vaultlabel: 'bad' })])
  })

  it("refuses damaged_row for a live bank without its main gate", () => {
    expect(refusalOf(() => classifyEnsureBank(bankEnsureAsk, { bank: liveBank, gate: null, vaults: [] })).refusalkind).to.eq('damaged_row')
  })

  it("refuses storage_issue for a vault row of another scope", () => {
    const vaults = [{ vaultlabel: 'main', vault: { ...liveVault, vaultlabel: 'elsewhere' } }]
    expect(refusalOf(() => classifyEnsureBank(bankEnsureAsk, { bank: liveBank, gate: liveGate, vaults })).refusalkind).to.eq('storage_issue')
  })
})

describe("classifyStoredBox and classifyStoredBoxes, under a bank's vault row", () => {
  const boxVault = vaultAt(Seq, 'bank1', 'life1')
  const get      = boxGetAskOf(boxQuery, 'nil')

  it("classifies a box ask as the vaultDB does, with its vault row as the parent", () => {
    expect(classifyStoredBox(get, { parent: boxVault, box: boxAt(Seq) })).to.deep.include({ ok: true, act: 'gotlive', parent: boxVault, box: boxAt(Seq) })
    expect(classifyStoredBox(get, { parent: null, box: null })).to.deep.include({ ok: false, act: 'vault_void', parent: BX.shellVaultOf(vaultScope) })
    expect(classifyStoredBox(get, { parent: vaultAt(Seq, 'bank1', 'life2'), box: null })).to.deep.include({ ok: false, act: 'vault_reborn' })
  })

  it("refuses vault_reborn for a vault row of an ended life of the bank, whose vault_tok is the ask's", () => {
    expect(classifyStoredBox(get, { parent: vaultAt(Seq, 'bank0', 'life1'), box: null })).to.deep.include({ ok: false, act: 'vault_reborn' })
    expect(classifyStoredBoxes(boxListAsk, { parent: vaultAt(Seq, 'bank0', 'life1'), boxes: [] })).to.deep.include({ ok: false, act: 'vault_reborn' })
  })

  it("counts a box row under another life of its vault or its bank as no row", () => {
    for (const box of [boxAt(Seq, 'bank0', 'life1'), boxAt(Seq, 'bank1', 'life0')]) {
      expect(classifyStoredBox(get, { parent: boxVault, box })).to.deep.include({ ok: true, act: 'gotvoid', box: null })
      expect(classifyStoredBoxes(boxListAsk, { parent: boxVault, boxes: [{ boxlabel: 'openai', box }] })).to.deep.include({ ok: true, act: 'gotvoid', listed: { boxes: [], damaged_rows: [] } })
    }
  })

  it("lists a vault's boxes, with its vault row as the parent", () => {
    const boxes = [{ boxlabel: 'openai', box: boxAt(Seq) }]
    expect(classifyStoredBoxes(boxListAsk, { parent: boxVault, boxes })).to.deep.include({ ok: true, act: 'got', parent: boxVault })
    expect(classifyStoredBoxes(boxListAsk, { parent: vaultTombstoneOf(boxVault), boxes })).to.deep.include({ ok: false, act: 'vault_gone', listed: null })
  })

  it("refuses damaged_vault for a vault row that fails its checks", () => {
    expect(refusalOf(() => classifyStoredBox(get, { parent: { ...boxVault, smuggled: 'field' }, box: null })).refusalkind).to.eq('damaged_vault')
  })
})
