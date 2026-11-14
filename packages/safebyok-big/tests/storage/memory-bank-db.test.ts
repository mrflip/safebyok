/** MemoryBankDB: the battery every bankDB runs, and a handful of cases of its own per verb family. */

import { describe, expect, it, vi } from 'vitest'
import { DefaultMaxRecordSizeEst, isAdapterBankDB, isBankDB } from '../../src/helpers/consts'
import { BankDBVerbnames } from '../../src/storage/bank-db'
import { MemoryBankDB } from '../../src/storage/memory-bank-db'
import { VaultError } from '../../src/refusals/errors'
import * as BX from '../../src/shapes/shapes-bankdb'
import * as Phrases from '../../src/helpers/phrases'
import type { Notice } from '../../src/storage/bank-db'
import {
  bankAt, bankBuildAskOf, bankDelAskOf, bankEnsureAsk, bankScope, boxAt, boxDelAskOf, boxGetAskOf, boxListAsk, boxPutAskOf, boxQuery, boxTidyAsk,
  gateAt, gatePutAskOf, mainWayin, otherMainWayin, passkey0Wayin, vaultAt, vaultDelAskOf, vaultGetAskOf, vaultPutAskOf, vaultScope,
} from '../test-helpers/bankdb-world'
import * as TH from '../test-helpers'

/** The calls a MemoryBankDB makes of its storage, any of which the next may be. */
const StorageCalls = [
  'doEnsureBank', 'doBuildBank', 'doPutGate', 'doDelBank', 'doGetVault', 'doPutVault', 'doDelVault',
  'doListBoxes', 'doGetBox', 'doPutBox', 'doDelBox', 'doTidyGone',
] as const

function memoryRowsOf(bankDB: MemoryBankDB): TH.BankDBRowCheats {
  return {
    plantBankRow:  (scope, row) => { bankDB._cheat_shelfOf(scope).bank = row },
    plantGateRow:  (scope, row) => { bankDB._cheat_shelfOf(scope).gaterows.set(scope.gatelabel, row) },
    plantVaultRow: (scope, row) => { bankDB._cheat_shelfOf(scope).vaultrows.set(scope.vaultlabel, row) },
    plantBoxRow:   (scope, bank_tok, vault_tok, row) => { bankDB._cheat_boxRowsOf(scope, bank_tok, vault_tok).set(scope.boxlabel, row) },
    bankRowOf:     (scope) => bankDB._cheat_shelfOf(scope).bank,
    gateRowOf:     (scope) => bankDB._cheat_shelfOf(scope).gaterows.get(scope.gatelabel) ?? null,
    vaultRowOf:    (scope) => bankDB._cheat_shelfOf(scope).vaultrows.get(scope.vaultlabel) ?? null,
    boxRowsOf:     (scope, bank_tok, vault_tok) => new Map(bankDB._cheat_boxRowsOf(scope, bank_tok, vault_tok)),
  }
}

// Memory has no storage to fail, so the next call to it throws as a dropped connection would.
function failNextCall(bankDB: MemoryBankDB): void {
  type StorageCall = typeof StorageCalls[number]
  const spies = StorageCalls.map((call) => vi.spyOn(bankDB as unknown as Record<StorageCall, () => unknown>, call))
  const fail = (): never => {
    for (const spy of spies) { spy.mockRestore() }
    throw new Error('socket closed')
  }
  for (const spy of spies) { spy.mockImplementationOnce(fail) }
}

// Each shelf and life of box rows the bankDB reaches from now on stores its rows as storedOtherwiseOf makes them.
function storeOtherwise(bankDB: MemoryBankDB): void {
  const shelfOf = bankDB._cheat_shelfOf.bind(bankDB)
  const boxRowsOf = bankDB._cheat_boxRowsOf.bind(bankDB)
  const altered = new WeakSet<object>()
  const alterMap = (map: Map<string, unknown>): Map<string, unknown> => {
    if (altered.has(map)) { return map }
    altered.add(map)
    map.set = (label, row) => Map.prototype.set.call(map, label, TH.storedOtherwiseOf(row)) as Map<string, unknown>
    return map
  }
  vi.spyOn(bankDB, '_cheat_shelfOf').mockImplementation((scope) => {
    const shelf = shelfOf(scope)
    if (altered.has(shelf)) { return shelf }
    altered.add(shelf)
    let { bank } = shelf
    Object.defineProperty(shelf, 'bank', { get: () => bank, set: (row: unknown) => { bank = TH.storedOtherwiseOf(row) }, enumerable: true })
    alterMap(shelf.gaterows)
    alterMap(shelf.vaultrows)
    return shelf
  })
  vi.spyOn(bankDB, '_cheat_boxRowsOf').mockImplementation((scope, bank_tok, vault_tok) => alterMap(boxRowsOf(scope, bank_tok, vault_tok)))
}

TH.describeBankDBBattery("MemoryBankDB's battery", {
  makeBankDB:            (opts) => new MemoryBankDB(opts),
  makeCappedBankDB:      (maxBoxes) => new MemoryBankDB({ maxBoxes }),
  _cheat_rowsOf:         memoryRowsOf,
  _cheat_failNextCall:   failNextCall,
  _cheat_storeOtherwise: storeOtherwise,
})

describe("describeBankDBBattery", () => {
  it("refuses opts that lack a hook it needs", () => {
    expect(() => { TH.describeBankDBBattery("none", { _cheat_rowsOf: memoryRowsOf } as never) }).to.throw(VaultError)
    expect(() => { TH.describeBankDBBattery("none", { makeBankDB: () => new MemoryBankDB() } as never) }).to.throw(VaultError)
  })
})

/** A bankDB holding the bank `bank1`, built with its `main` gate. */
async function builtBankDB(): Promise<MemoryBankDB> {
  const bankDB = new MemoryBankDB()
  await bankDB.buildBank(bankBuildAskOf())
  return bankDB
}

/** A bankDB holding the bank `bank1` and its vault in the life `life1`. */
async function vaultedBankDB(): Promise<MemoryBankDB> {
  const bankDB = await builtBankDB()
  await bankDB.putVault(vaultPutAskOf(vaultAt()))
  return bankDB
}

describe("MemoryBankDB", () => {
  it("is branded a bankDB and an adapter bankDB, with a function for each verb", () => {
    const bankDB = new MemoryBankDB()
    expect(isBankDB(bankDB)).to.eq(true)
    expect(isAdapterBankDB(bankDB)).to.eq(true)
    for (const verbname of BankDBVerbnames) { expect(typeof bankDB[verbname]).to.eq('function') }
  })

  it("refuses options it does not know", () => {
    expect(() => new MemoryBankDB({ maxBoxs: 3 } as never)).to.throw(VaultError).with.property('refusalkind', 'bad_option')
  })
})

describe("MemoryBankDB's bank verbs", () => {
  it("ensures no bank as gotvoid, with the shell as parent", async () => {
    const answer = await new MemoryBankDB().ensureBank(bankEnsureAsk)
    expect(answer.act).to.eq('gotvoid')
    expect(answer.val).to.be.null
    expect(answer.parent).to.include({ ...bankScope, am: 'x' })
  })

  it("builds a bank with its gate, and ensures it with its gate and vaults", async () => {
    const bankDB = new MemoryBankDB()
    const built  = await bankDB.buildBank(bankBuildAskOf())
    expect(built.act).to.eq('born')
    expect(built.val).to.deep.equal(gateAt())
    await bankDB.putVault(vaultPutAskOf(vaultAt()))
    const ensured = await bankDB.ensureBank(bankEnsureAsk)
    expect(ensured.act).to.eq('gotlive')
    expect(ensured.val).to.deep.equal({ gates: { main: gateAt() }, vaults: [vaultAt()], damaged_rows: [] })
    expect(ensured.parent).to.deep.equal(bankAt())
  })

  it("answers a build over the live bank it expects as passed, with that bank's gate", async () => {
    const bankDB = await builtBankDB()
    const answer = await bankDB.buildBank(bankBuildAskOf(bankAt(1, 'bank2'), gateAt(0, 'bank2', { main: mainWayin }, 'gate2'), bankAt()))
    expect(answer.act).to.eq('passed')
    expect(answer.val).to.deep.equal(gateAt())
  })

  it("deletes a bank with every gate, vault and box row under it", async () => {
    const bankDB = await vaultedBankDB()
    await bankDB.putBox(boxPutAskOf(boxAt()))
    const answer = await bankDB.delBank(bankDelAskOf(bankAt()))
    expect(answer.act).to.eq('deleted')
    expect(answer.parent).to.eq(BX.BankTop)
    const shelf = bankDB._cheat_shelfOf(bankScope)
    expect(shelf.gaterows.size).to.eq(0)
    expect(shelf.vaultrows.size).to.eq(0)
    expect(bankDB._cheat_boxRowsOf(vaultScope, 'bank1', 'life1').size).to.eq(0)
    const ensured = await bankDB.ensureBank(bankEnsureAsk)
    expect(ensured.act).to.eq('gotgone')
  })

  it("refuses a sloppy ask, naming the verb", async () => {
    const refusal = await TH.expectRefusal(new MemoryBankDB().ensureBank({ ...bankEnsureAsk, gates: ['main', 'side'] } as never))
    expect(refusal.meta?.oplabel).to.eq('ensureBank')
  })
})

describe("MemoryBankDB's putGate", () => {
  const keyed = { main: mainWayin, passkey0: passkey0Wayin }

  it("adds a passkey wayin, changing only the gate row", async () => {
    const bankDB = await builtBankDB()
    const answer = await bankDB.putGate(gatePutAskOf('add_passkey', gateAt(), keyed))
    expect(answer.act).to.eq('replaced')
    expect(answer.val.wayins).to.deep.equal(keyed)
    expect(answer.parent).to.deep.equal(bankAt())
    expect(bankDB._cheat_shelfOf(bankScope).bank).to.deep.equal(bankAt())
  })

  it("refuses a revoke with no passkey wayin stored, leaving the gate row", async () => {
    const bankDB = await builtBankDB()
    const ask = gatePutAskOf('revoke_passkey', gateAt(), { main: mainWayin })
    const refusal = await TH.expectRefusal(bankDB.putGate(ask), 'gate_issue')
    expect(refusal.message).to.include(Phrases.NoPasskeyStored)
    expect(bankDB._cheat_shelfOf(bankScope).gaterows.get('main')).to.deep.equal(gateAt())
  })

  it("refuses a passphrase replacement that also adds a passkey wayin", async () => {
    const bankDB = await builtBankDB()
    const ask = gatePutAskOf('replace_passphrase', gateAt(), { main: otherMainWayin, passkey0: passkey0Wayin })
    const refusal = await TH.expectRefusal(bankDB.putGate(ask), 'gate_issue')
    expect(refusal.message).to.include(Phrases.OtherWayinMoved)
  })

  it("refuses a gate put under an ended bank life as vault_reborn", async () => {
    const bankDB = await builtBankDB()
    bankDB._cheat_shelfOf(bankScope).bank = bankAt(0, 'bank2')
    const answer = await bankDB.tryPutGate(gatePutAskOf('replace_passphrase', gateAt(), { main: otherMainWayin }))
    expect(answer.ok).to.eq(false)
    expect(answer.act).to.eq('bank_reborn')
    expect(answer.err?.refusalkind).to.eq('vault_reborn')
  })
})

describe("MemoryBankDB's vault verbs", () => {
  it("refuses a vault put with no bank as absent_vault", async () => {
    const answer = await new MemoryBankDB().tryPutVault(vaultPutAskOf(vaultAt()))
    expect(answer.act).to.eq('bank_void')
    expect(answer.err?.refusalkind).to.eq('absent_vault')
  })

  it("puts and gets a vault, with the bank row as parent", async () => {
    const bankDB = await builtBankDB()
    const put = await bankDB.putVault(vaultPutAskOf(vaultAt()))
    expect(put.act).to.eq('born')
    const answer = await bankDB.getVault(vaultGetAskOf())
    expect(answer.act).to.eq('gotlive')
    expect(answer.val).to.deep.equal(vaultAt())
    expect(answer.parent).to.deep.equal(bankAt())
  })

  it("deletes a vault with the boxes of its life", async () => {
    const bankDB = await vaultedBankDB()
    await bankDB.putBox(boxPutAskOf(boxAt()))
    const deleted = await bankDB.delVault(vaultDelAskOf(vaultAt()))
    expect(deleted.act).to.eq('deleted')
    expect(bankDB._cheat_boxRowsOf(vaultScope, 'bank1', 'life1').size).to.eq(0)
  })
})

describe("MemoryBankDB's box verbs", () => {
  it("puts, gets, lists and deletes a box, with the vault row as parent", async () => {
    const bankDB = await vaultedBankDB()
    const put = await bankDB.putBox(boxPutAskOf(boxAt()))
    expect(put.act).to.eq('born')
    const got = await bankDB.getBox(boxGetAskOf())
    expect(got.val).to.deep.equal(boxAt())
    expect(got.parent).to.deep.equal(vaultAt())
    const listed = await bankDB.listBoxes(boxListAsk)
    expect(listed.act).to.eq('got')
    expect(listed.val.boxes).to.have.lengthOf(1)
    const deleted = await bankDB.delBox(boxDelAskOf(boxAt()))
    expect(deleted.act).to.eq('deleted')
  })

  it("counts a box row of an ended bank life as none", async () => {
    const bankDB = await vaultedBankDB()
    bankDB._cheat_boxRowsOf(vaultScope, 'bank1', 'life1').set('openai', boxAt(0, 'bank0', 'life1'))
    const got    = await bankDB.getBox(boxGetAskOf(boxQuery, 'nil'))
    const listed = await bankDB.listBoxes(boxListAsk)
    expect(got.act).to.eq('gotvoid')
    expect(listed.act).to.eq('gotvoid')
  })

  it("refuses a box ask under a vault row left from an ended bank life", async () => {
    const bankDB = await builtBankDB()
    bankDB._cheat_shelfOf(bankScope).vaultrows.set('main', vaultAt(0, 'bank0', 'life1'))
    const ask = boxPutAskOf(boxAt())
    await TH.expectRefusal(bankDB.putBox(ask), 'vault_reborn')
  })

  it("refuses a box over the record size", async () => {
    const bankDB = await vaultedBankDB()
    const record = { ...boxAt(), sidecar: { memo: 'x'.repeat(DefaultMaxRecordSizeEst) } }
    const ask    = boxPutAskOf(record)
    await TH.expectRefusal(bankDB.putBox(ask), 'box_too_large')
  })
})

describe("MemoryBankDB.tidyGone", () => {
  it("deletes the vault and box rows of an ended bank life, and counts the box rows left", async () => {
    const bankDB = await vaultedBankDB()
    await bankDB.putBox(boxPutAskOf(boxAt()))
    const stale = { ...vaultScope, vaultlabel: 'stale' }
    bankDB._cheat_shelfOf(bankScope).vaultrows.set('stale', { ...vaultAt(0, 'bank0', 'life9'), vaultlabel: 'stale' })
    bankDB._cheat_boxRowsOf(stale, 'bank0', 'life9').set('openai', boxAt(0, 'bank0', 'life9'))
    const answer = await bankDB.tidyGone(boxTidyAsk)
    expect(answer.val).to.deep.equal({ totalCount: 1, leftover: 'none' })
    expect(answer.parent).to.deep.equal(bankScope)
    expect(bankDB._cheat_shelfOf(bankScope).vaultrows.has('stale')).to.eq(false)
    expect(bankDB._cheat_boxRowsOf(stale, 'bank0', 'life9').size).to.eq(0)
  })
})

describe("MemoryBankDB.watch", () => {
  it("tells a bank's watch of its bank and gate rows, and a vault's watch of its boxes with the vault as parent", async () => {
    const bankDB = new MemoryBankDB()
    const bankNotices: Notice[] = []
    const vaultNotices: Notice[] = []
    const unwatchBank  = bankDB.watch(bankScope, (notice) => { bankNotices.push(notice) })
    const unwatchVault = bankDB.watch(vaultScope, (notice) => { vaultNotices.push(notice) })
    await bankDB.buildBank(bankBuildAskOf())
    await bankDB.putVault(vaultPutAskOf(vaultAt()))
    await bankDB.putBox(boxPutAskOf(boxAt()))
    await Promise.resolve()
    unwatchBank()
    unwatchVault()
    expect(bankNotices.map(({ val }) => val.fmt)).to.deep.equal([bankAt().fmt, gateAt().fmt, vaultAt().fmt, boxAt().fmt])
    expect(bankNotices[1]?.parent).to.deep.equal(bankAt())
    expect(vaultNotices.map(({ val }) => val.fmt)).to.deep.equal([vaultAt().fmt, boxAt().fmt])
    expect(vaultNotices[1]?.parent).to.deep.equal(vaultAt())
  })
})
