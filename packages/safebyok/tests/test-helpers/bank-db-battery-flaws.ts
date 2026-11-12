/** The battery's rows of a later fmt, as a later version of the package writes them: held by the store, and refused by every verb that must read one. */

import { describe, expect, it } from 'vitest'
import * as BX from '../../src/shapes/shapes-bankdb'
import type { BankDB } from '../../src/storage/bank-db'
import {
  bankScope, gateScope, vaultScope, boxscope, boxQuery, boxListAsk, bankEnsureAsk, MainOnly, mainWayin, passkey0Wayin, otherMainWayin,
  bankAt, gateAt, vaultAt, boxAt, bankBuildAskOf, gatePutAskOf, bankDelAskOf, vaultGetAskOf, boxGetAskOf, vaultPutAskOf, boxPutAskOf, vaultDelAskOf, boxDelAskOf,
} from './bankdb-world'
import type { BatteryWorld } from './bank-db-battery'

const bank  = bankAt()
const gate  = gateAt()
const vault = vaultAt()
const box   = boxAt()

/** An answer, as a verb's try* form gives it. */
type Answered = { ok: boolean, act: string }

/** The verbs that read the bank row, each called over the world's rows as their owner could call it. */
function bankReadersOf(bankDB: BankDB): [string, () => Promise<Answered>][] {
  return [
    ['ensureBank', () => bankDB.tryEnsureBank(bankEnsureAsk)],
    ['delBank',    () => bankDB.tryDelBank(bankDelAskOf(bank))],
    ...gateReadersOf(bankDB),
    ['getVault',   () => bankDB.tryGetVault(vaultGetAskOf())],
    ['putVault',   () => bankDB.tryPutVault(vaultPutAskOf(vaultAt(1), vault))],
    ['delVault',   () => bankDB.tryDelVault(vaultDelAskOf(vault))],
  ]
}

/** The verbs that read the main gate row, each called over the world's rows as their owner could call it. */
function gateReadersOf(bankDB: BankDB): [string, () => Promise<Answered>][] {
  return [
    ['buildBank',         () => bankDB.tryBuildBank(bankBuildAskOf(bankAt(0, 'bank2'), gateAt(0, 'bank2')))],
    ['replacePassphrase', () => bankDB.tryReplacePassphrase(gatePutAskOf('replacePassphrase', gate, { main: otherMainWayin }))],
    ['addPasskey',        () => bankDB.tryAddPasskey(gatePutAskOf('addPasskey', gate, { main: mainWayin, passkey0: passkey0Wayin }))],
    ['revokePasskey',     () => bankDB.tryRevokePasskey(gatePutAskOf('revokePasskey', gate, MainOnly))],
  ]
}

/** The verbs that read the vault row and not the bank row: the box verbs, each called over the world's rows as their owner could call it. */
function vaultReadersOf(bankDB: BankDB): [string, () => Promise<Answered>][] {
  return [
    ['listBoxes', () => bankDB.tryListBoxes(boxListAsk)],
    ...boxReadersOf(bankDB),
  ]
}

/** The verbs that read the box row, each called over the world's rows as their owner could call it. */
function boxReadersOf(bankDB: BankDB): [string, () => Promise<Answered>][] {
  return [
    ['getBox', () => bankDB.tryGetBox(boxGetAskOf())],
    ['putBox', () => bankDB.tryPutBox(boxPutAskOf(boxAt(1), box))],
    ['delBox', () => bankDB.tryDelBox(boxDelAskOf(box))],
  ]
}

/** Which of `verbs` answered other than a refusal the classifier never saw, by name: none, where each refused. */
async function unrefusedOf(verbs: [string, () => Promise<Answered>][]): Promise<string[]> {
  const unrefused: string[] = []
  for (const [verbname, call] of verbs) {
    const answer = await call()
    if (answer.ok || (answer.act !== 'unclassified_storing')) { unrefused.push(verbname) }
  }
  return unrefused
}

/** Registers the cases of rows of a later fmt over `world`. */
export function describeFlaws({ putWith, rowsOf }: BatteryWorld): void {
  describe("a row of a later fmt", () => {
    it("is held as written, a bank, gate, vault and box row alike", async () => {
      const { bankDB } = await putWith({ box: true })
      const rows = rowsOf(bankDB)
      const later = {
        bank:  { ...bank, fmt: BX.BankFormat + 1 },
        gate:  { ...gate, fmt: BX.GateFormat + 1 },
        vault: { ...vault, fmt: BX.VaultFormat + 1 },
        box:   { ...box, fmt: BX.BoxFormat + 1 },
      }
      await rows.plantBankRow(bankScope, later.bank)
      await rows.plantGateRow(gateScope, later.gate)
      await rows.plantVaultRow(vaultScope, later.vault)
      await rows.plantBoxRow(boxscope, 'bank1', 'life1', later.box)
      const boxrows = await rows.boxRowsOf(vaultScope, 'bank1', 'life1')
      expect({ bank: await rows.bankRowOf(bankScope), gate: await rows.gateRowOf(gateScope), vault: await rows.vaultRowOf(vaultScope), box: boxrows.get('openai') }).to.deep.equal(later)
    })

    it("as the bank row, is refused by every verb that reads it, and leaves the rows; the box verbs answer as ever", async () => {
      const { bankDB } = await putWith({ box: true })
      const later = { ...bank, fmt: BX.BankFormat + 1 }
      await rowsOf(bankDB).plantBankRow(bankScope, later)
      expect(await unrefusedOf(bankReadersOf(bankDB))).to.deep.equal([])
      expect(await rowsOf(bankDB).bankRowOf(bankScope)).to.deep.equal(later)
      expect(await rowsOf(bankDB).gateRowOf(gateScope)).to.deep.equal(gate)
      expect(await rowsOf(bankDB).vaultRowOf(vaultScope)).to.deep.equal(vault)
      expect(await bankDB.getBox(boxGetAskOf(boxQuery))).to.deep.include({ act: 'gotlive', val: box })
    })

    it("as the main gate row, is refused by every verb that reads it, and leaves it; the vault verbs answer as ever", async () => {
      const { bankDB } = await putWith()
      const later = { ...gate, fmt: BX.GateFormat + 1 }
      await rowsOf(bankDB).plantGateRow(gateScope, later)
      expect(await unrefusedOf([['ensureBank', () => bankDB.tryEnsureBank(bankEnsureAsk)], ...gateReadersOf(bankDB)])).to.deep.equal([])
      expect(await rowsOf(bankDB).gateRowOf(gateScope)).to.deep.equal(later)
      expect(await bankDB.getVault(vaultGetAskOf())).to.deep.include({ act: 'gotlive', val: vault })
    })

    it("as the vault row, is refused by every verb that reads it, and leaves the rows", async () => {
      const { bankDB } = await putWith({ box: true })
      const later = { ...vault, fmt: BX.VaultFormat + 1 }
      await rowsOf(bankDB).plantVaultRow(vaultScope, later)
      const vaultVerbs = bankReadersOf(bankDB).filter(([verbname]) => verbname.endsWith('Vault'))
      expect(await unrefusedOf([...vaultVerbs, ...vaultReadersOf(bankDB)])).to.deep.equal([])
      expect(await rowsOf(bankDB).vaultRowOf(vaultScope)).to.deep.equal(later)
      const boxrows = await rowsOf(bankDB).boxRowsOf(vaultScope, 'bank1', 'life1')
      expect(boxrows.get('openai')).to.deep.equal(box)
    })

    it("as the box row, is refused by every verb that reads it, and leaves it", async () => {
      const { bankDB } = await putWith({ box: true })
      const later = { ...box, fmt: BX.BoxFormat + 1 }
      await rowsOf(bankDB).plantBoxRow(boxscope, 'bank1', 'life1', later)
      expect(await unrefusedOf(boxReadersOf(bankDB))).to.deep.equal([])
      const boxrows = await rowsOf(bankDB).boxRowsOf(vaultScope, 'bank1', 'life1')
      expect(boxrows.get('openai')).to.deep.equal(later)
    })
  })
}
