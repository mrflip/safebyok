/** The battery's cases of a datastore that writes other than the record sent: each write answers with the row stored. */

import { describe, expect, it } from 'vitest'
import { isPlainBag } from '../../src/shapes/shapes-core'
import {
  bankScope, gateScope, vaultScope, otherMainWayin,
  bankAt, gateAt, vaultAt, boxAt, bankBuildAskOf, gatePutAskOf, bankDelAskOf, vaultPutAskOf, vaultDelAskOf, boxPutAskOf, boxDelAskOf,
} from './bankdb-world'
import type { BatteryWorld } from './bank-db-battery'

// == [Writing otherwise]: WrittenOtherwiseSuffix, writtenOtherwiseOf

/** What a datastore told to write otherwise appends to the `revision_tok` of each row it writes. */
export const WrittenOtherwiseSuffix = '.stored'

/** `row` as a datastore told to write otherwise writes it: a copy with {@link WrittenOtherwiseSuffix} appended to its `revision_tok`.
 * A value with no string `revision_tok` comes back as given.
 */
export function writtenOtherwiseOf<ValT>(row: ValT): ValT {
  if (! isPlainBag(row)) { return row }
  const { revision_tok } = row
  if (typeof revision_tok !== 'string') { return row }
  return { ...row, revision_tok: `${revision_tok}${WrittenOtherwiseSuffix}` }
}
// --

// == [The cases]: describeWrittenOtherwise

/** Registers the cases of a datastore that writes other than the record sent, over `world`. */
export function describeWrittenOtherwise({ fresh, putWith, rowsOf, writeOtherwise }: BatteryWorld): void {
  describe("a datastore that writes a row other than the record sent", () => {
    it("answers buildBank with the gate row stored, and the bank row stored as its parent", async () => {
      const bankDB = await fresh()
      await writeOtherwise(bankDB)
      const ask = bankBuildAskOf(bankAt(), gateAt())
      const answer = await bankDB.tryBuildBank(ask)
      expect(answer).to.deep.include({ ok: true, act: 'born', val: writtenOtherwiseOf(ask.gate), parent: writtenOtherwiseOf(ask.record) })
      expect(await rowsOf(bankDB).gateRowOf(gateScope)).to.deep.equal(writtenOtherwiseOf(ask.gate))
      expect(await rowsOf(bankDB).bankRowOf(bankScope)).to.deep.equal(writtenOtherwiseOf(ask.record))
    })

    it("answers a gate put with the gate row stored", async () => {
      const { bankDB, gate } = await putWith({ vault: false })
      await writeOtherwise(bankDB)
      const ask = gatePutAskOf('replace_passphrase', gate, { main: otherMainWayin })
      const answer = await bankDB.tryPutGate(ask)
      expect(answer).to.deep.include({ ok: true, act: 'replaced', val: writtenOtherwiseOf(ask.record) })
      expect(await rowsOf(bankDB).gateRowOf(gateScope)).to.deep.equal(writtenOtherwiseOf(ask.record))
    })

    it("answers delBank with the tombstone stored", async () => {
      const { bankDB, bank } = await putWith({ vault: false })
      await writeOtherwise(bankDB)
      const ask = bankDelAskOf(bank)
      const answer = await bankDB.tryDelBank(ask)
      expect(answer).to.deep.include({ ok: true, act: 'deleted', val: writtenOtherwiseOf(ask.record) })
      expect(await rowsOf(bankDB).bankRowOf(bankScope)).to.deep.equal(writtenOtherwiseOf(ask.record))
    })

    it("answers a vault put with the vault row stored, born or replaced", async () => {
      const { bankDB } = await putWith({ vault: false })
      await writeOtherwise(bankDB)
      const born = vaultPutAskOf(vaultAt())
      expect(await bankDB.tryPutVault(born)).to.deep.include({ ok: true, act: 'born', val: writtenOtherwiseOf(born.record) })
      const replaced = vaultPutAskOf(vaultAt(1), writtenOtherwiseOf(born.record))
      expect(await bankDB.tryPutVault(replaced)).to.deep.include({ ok: true, act: 'replaced', val: writtenOtherwiseOf(replaced.record) })
      expect(await rowsOf(bankDB).vaultRowOf(vaultScope)).to.deep.equal(writtenOtherwiseOf(replaced.record))
    })

    it("answers a vault del with the tombstone stored", async () => {
      const { bankDB, vault } = await putWith()
      await writeOtherwise(bankDB)
      const ask = vaultDelAskOf(vault)
      expect(await bankDB.tryDelVault(ask)).to.deep.include({ ok: true, act: 'deleted', val: writtenOtherwiseOf(ask.record) })
      expect(await rowsOf(bankDB).vaultRowOf(vaultScope)).to.deep.equal(writtenOtherwiseOf(ask.record))
    })

    it("answers a box put with the box row stored, born or replaced", async () => {
      const { bankDB } = await putWith()
      await writeOtherwise(bankDB)
      const born = boxPutAskOf(boxAt())
      expect(await bankDB.tryPutBox(born)).to.deep.include({ ok: true, act: 'born', val: writtenOtherwiseOf(born.record) })
      const replaced = boxPutAskOf(boxAt(1), writtenOtherwiseOf(born.record))
      expect(await bankDB.tryPutBox(replaced)).to.deep.include({ ok: true, act: 'replaced', val: writtenOtherwiseOf(replaced.record) })
      const boxrows = await rowsOf(bankDB).boxRowsOf(vaultScope, 'bank1', 'life1')
      expect(boxrows.get(replaced.boxlabel)).to.deep.equal(writtenOtherwiseOf(replaced.record))
    })

    it("answers a box del with the tombstone stored", async () => {
      const { bankDB, box } = await putWith({ box: true })
      await writeOtherwise(bankDB)
      const ask = boxDelAskOf(box)
      expect(await bankDB.tryDelBox(ask)).to.deep.include({ ok: true, act: 'deleted', val: writtenOtherwiseOf(ask.record) })
      const boxrows = await rowsOf(bankDB).boxRowsOf(vaultScope, 'bank1', 'life1')
      expect(boxrows.get(ask.boxlabel)).to.deep.equal(writtenOtherwiseOf(ask.record))
    })
  })
}
// --
