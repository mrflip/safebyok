/** WX: the answers of a bankDB as they cross a wire, each absent field arriving as null, parse back to the answers its verbs return. */

import { describe, expect, it } from 'vitest'
import * as WX from '../../src/shapes/shapes-bank-answers'
import { VaultError } from '../../src/refusals/errors'
import { MemoryBankDB } from '../../src/storage/memory-bank-db'
import type { Answer, Notice } from '../../src/storage/bank-db'
import {
  bankAt, bankBuildAskOf, bankDelAskOf, bankEnsureAsk, bankScope, boxAt, boxDelAskOf, boxGetAskOf, boxListAsk, boxPutAskOf, boxQuery, boxTidyAsk,
  gateAt, gatePutAskOf, mainWayin, otherMainWayin, passkey0Wayin, vaultAt, vaultDelAskOf, vaultGetAskOf, vaultPutAskOf,
} from '../test-helpers/bankdb-world'

// == [A wire]: crossed

// As a server sends an answer: its refusal as kind, message and the meta that may cross, and every absent field as null.
function crossed(answer: Answer<unknown, string, unknown>): unknown {
  const err = answer.ok ? null : {
    refusalkind: answer.err.refusalkind,
    message:     answer.err.message,
    meta:        { capacity: answer.err.meta?.capacity, fieldnames: answer.err.meta?.fieldnames, oplabel: answer.err.meta?.oplabel },
  }
  const sent = { ...answer, val: answer.ok ? answer.val : null, err }
  return JSON.parse(JSON.stringify(sent, (_ckey, field: unknown) => field ?? null)) as unknown
}

/** A bankDB holding the bank `bank1`, its vault, and one box. */
async function bankDBWithBox(): Promise<MemoryBankDB> {
  const bankDB = new MemoryBankDB()
  await bankDB.buildBank(bankBuildAskOf())
  await bankDB.putVault(vaultPutAskOf(vaultAt()))
  await bankDB.putBox(boxPutAskOf(boxAt()))
  return bankDB
}
// --

describe("WX's answer checks", () => {
  it("parse each serialized good answer back to what its verb returned", async () => {
    const bankDB   = await bankDBWithBox()
    const keyed    = { main: mainWayin, passkey0: passkey0Wayin }
    const added    = await bankDB.tryAddPasskey(gatePutAskOf('addPasskey', gateAt(), keyed))
    const revoked  = await bankDB.tryRevokePasskey(gatePutAskOf('revokePasskey', added.val ?? gateAt(), { main: mainWayin }))
    const putBox   = await bankDB.tryPutBox(boxPutAskOf(boxAt(1), boxAt()))
    const putVault = await bankDB.tryPutVault(vaultPutAskOf(vaultAt(1), vaultAt()))
    const answers  = [
      [WX.ensureBankAnswer,        await new MemoryBankDB().tryEnsureBank(bankEnsureAsk)],
      [WX.ensureBankAnswer,        await bankDB.tryEnsureBank(bankEnsureAsk)],
      [WX.buildBankAnswer,         await new MemoryBankDB().tryBuildBank(bankBuildAskOf())],
      [WX.addPasskeyAnswer,        added],
      [WX.revokePasskeyAnswer,     revoked],
      [WX.replacePassphraseAnswer, await bankDB.tryReplacePassphrase(gatePutAskOf('replacePassphrase', revoked.val ?? gateAt(), { main: otherMainWayin }))],
      [WX.listBoxesAnswer,         await bankDB.tryListBoxes(boxListAsk)],
      [WX.getBoxAnswer,            await bankDB.tryGetBox(boxGetAskOf())],
      [WX.putBoxAnswer,            putBox],
      [WX.delBoxAnswer,            await bankDB.tryDelBox(boxDelAskOf(putBox.val ?? boxAt()))],
      [WX.getBoxAnswer,            await bankDB.tryGetBox(boxGetAskOf(boxQuery, 'nil'))],
      [WX.getVaultAnswer,          await bankDB.tryGetVault(vaultGetAskOf())],
      [WX.putVaultAnswer,          putVault],
      [WX.delVaultAnswer,          await bankDB.tryDelVault(vaultDelAskOf(putVault.val ?? vaultAt()))],
      [WX.tidyGoneAnswer,          await bankDB.tryTidyGone(boxTidyAsk)],
      [WX.delBankAnswer,           await bankDB.tryDelBank(bankDelAskOf(bankAt()))],
    ] as const
    for (const [check, answer] of answers) {
      expect(answer.ok, answer.ok ? "" : `${answer.act}: ${answer.err.message}`).to.be.true
      expect(check.parse(crossed(answer))).to.deep.equal({ dbhas: null, ...answer })
    }
  })

  it("reads a delBank answer that leaves out its parent as having none", async () => {
    const bankDB = await bankDBWithBox()
    const deleted = await bankDB.tryDelBank(bankDelAskOf(bankAt()))
    const { parent: _parent, ...sent } = crossed(deleted) as Record<string, unknown>
    expect(WX.delBankAnswer.parse(sent)).to.deep.include({ ok: true, parent: null })
  })

  it("parses a serialized refusal to a VaultError of its kind, with its parent", async () => {
    const answer = await new MemoryBankDB().tryPutVault(vaultPutAskOf(vaultAt()))
    expect(answer.ok).to.be.false
    const parsed = WX.putVaultAnswer.parse(crossed(answer))
    if (parsed.ok || answer.ok) { throw new Error('expected a refusal') }
    expect(parsed.act).to.eq('bank_void')
    expect(parsed.parent).to.deep.equal(answer.parent)
    expect(parsed.err).to.be.instanceOf(VaultError)
    expect(parsed.err.refusalkind).to.equal(answer.err.refusalkind)
    expect(parsed.err.meta).to.deep.include({ act: answer.act, ask: answer.ask })
  })

  it("takes a damaged box row only under damaged_rows", async () => {
    const bankDB = await bankDBWithBox()
    const listed = crossed(await bankDB.tryListBoxes(boxListAsk)) as { val: { boxes: unknown[], damaged_rows: unknown[] } }
    const damaged = { ...boxQuery, boxlabel: 'Not A Label', am: 'd' }
    const parsed = WX.listBoxesAnswer.parse({ ...listed, val: { ...listed.val, damaged_rows: [damaged] } })
    expect(parsed.ok && parsed.val.damaged_rows).to.deep.eq([damaged])
    expect(() => WX.listBoxesAnswer.parse({ ...listed, val: { ...listed.val, boxes: [...listed.val.boxes, damaged] } })).to.throw(VaultError)
  })

  it("refuses an answer out of step with its verb's checker", async () => {
    const bankDB = await bankDBWithBox()
    const got = crossed(await bankDB.tryGetVault(vaultGetAskOf())) as Record<string, unknown>
    for (const bad of [{ ...got, surplus: 1 }, { ...got, act: 'born' }, { ...got, parent: null }]) {
      expect(() => WX.getVaultAnswer.parse(bad)).to.throw(VaultError).with.property('refusalkind', 'unexpected_error')
    }
  })

  it("parses a serialized notice back to the one the watch told", async () => {
    const bankDB = new MemoryBankDB()
    const notices: Notice[] = []
    const unwatch = bankDB.watch(bankScope, (notice) => { notices.push(notice) })
    await bankDB.buildBank(bankBuildAskOf())
    await Promise.resolve()
    unwatch()
    expect(notices).to.have.lengthOf(2)
    for (const notice of notices) {
      const sent = JSON.parse(JSON.stringify({ ok: true, ...notice }, (_ckey, field: unknown) => field ?? null)) as unknown
      expect(WX.crossedNotice.parse(sent)).to.deep.equal({ ok: true, val: notice })
    }
  })
})
