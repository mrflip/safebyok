/** The battery's cases of a datastore that stores other than the record sent: each write answers with the row stored. */

import { describe, expect, it } from 'vitest'
import { isPlainBag } from '../../src/shapes/shapes-core'
import {
  bankScope, gateScope, vaultScope, otherMainWayin,
  bankAt, gateAt, vaultAt, boxAt, bankBuildAskOf, gatePutAskOf, bankDelAskOf, vaultPutAskOf, vaultDelAskOf, boxPutAskOf, boxDelAskOf,
} from './bankdb-world'
import type { BatteryWorld } from './bank-db-battery'

// == [Storing otherwise]: StoredOtherwiseSuffix, storedOtherwiseOf

/** What a datastore told to store otherwise appends to the `revision_tok` of each row it writes. */
export const StoredOtherwiseSuffix = '.stored'

/** `row` as a datastore told to store otherwise stores it: a copy with {@link StoredOtherwiseSuffix} appended to its `revision_tok`.
 * A value with no string `revision_tok` comes back as given.
 */
export function storedOtherwiseOf<ValT>(row: ValT): ValT {
  if (! isPlainBag(row)) { return row }
  const { revision_tok } = row
  if (typeof revision_tok !== 'string') { return row }
  return { ...row, revision_tok: `${revision_tok}${StoredOtherwiseSuffix}` }
}
// --

// == [The cases]: describeStoredOtherwise

/** Registers the cases of a datastore that stores other than the record sent, over `world`. */
export function describeStoredOtherwise({ fresh, putWith, rowsOf, storeOtherwise }: BatteryWorld): void {
  describe("a write the datastore stores other than the record sent", () => {
    it("answers buildBank with the gate row stored, and the bank row stored as its parent", async () => {
      const bankDB = await fresh()
      await storeOtherwise(bankDB)
      const ask = bankBuildAskOf(bankAt(), gateAt())
      const answer = await bankDB.tryBuildBank(ask)
      expect(answer).to.deep.include({ ok: true, act: 'born', val: storedOtherwiseOf(ask.gate), parent: storedOtherwiseOf(ask.record) })
      expect(await rowsOf(bankDB).gateRowOf(gateScope)).to.deep.equal(storedOtherwiseOf(ask.gate))
      expect(await rowsOf(bankDB).bankRowOf(bankScope)).to.deep.equal(storedOtherwiseOf(ask.record))
    })

    it("answers a gate put with the gate row stored", async () => {
      const { bankDB, gate } = await putWith({ vault: false })
      await storeOtherwise(bankDB)
      const ask = gatePutAskOf('replace_passphrase', gate, { main: otherMainWayin })
      const answer = await bankDB.tryPutGate(ask)
      expect(answer).to.deep.include({ ok: true, act: 'replaced', val: storedOtherwiseOf(ask.record) })
      expect(await rowsOf(bankDB).gateRowOf(gateScope)).to.deep.equal(storedOtherwiseOf(ask.record))
    })

    it("answers delBank with the tombstone stored", async () => {
      const { bankDB, bank } = await putWith({ vault: false })
      await storeOtherwise(bankDB)
      const ask = bankDelAskOf(bank)
      const answer = await bankDB.tryDelBank(ask)
      expect(answer).to.deep.include({ ok: true, act: 'deleted', val: storedOtherwiseOf(ask.record) })
      expect(await rowsOf(bankDB).bankRowOf(bankScope)).to.deep.equal(storedOtherwiseOf(ask.record))
    })

    it("answers a vault put with the vault row stored, born or replaced", async () => {
      const { bankDB } = await putWith({ vault: false })
      await storeOtherwise(bankDB)
      const born = vaultPutAskOf(vaultAt())
      expect(await bankDB.tryPutVault(born)).to.deep.include({ ok: true, act: 'born', val: storedOtherwiseOf(born.record) })
      const replaced = vaultPutAskOf(vaultAt(1), storedOtherwiseOf(born.record))
      expect(await bankDB.tryPutVault(replaced)).to.deep.include({ ok: true, act: 'replaced', val: storedOtherwiseOf(replaced.record) })
      expect(await rowsOf(bankDB).vaultRowOf(vaultScope)).to.deep.equal(storedOtherwiseOf(replaced.record))
    })

    it("answers a vault del with the tombstone stored", async () => {
      const { bankDB, vault } = await putWith()
      await storeOtherwise(bankDB)
      const ask = vaultDelAskOf(vault)
      expect(await bankDB.tryDelVault(ask)).to.deep.include({ ok: true, act: 'deleted', val: storedOtherwiseOf(ask.record) })
      expect(await rowsOf(bankDB).vaultRowOf(vaultScope)).to.deep.equal(storedOtherwiseOf(ask.record))
    })

    it("answers a box put with the box row stored, born or replaced", async () => {
      const { bankDB } = await putWith()
      await storeOtherwise(bankDB)
      const born = boxPutAskOf(boxAt())
      expect(await bankDB.tryPutBox(born)).to.deep.include({ ok: true, act: 'born', val: storedOtherwiseOf(born.record) })
      const replaced = boxPutAskOf(boxAt(1), storedOtherwiseOf(born.record))
      expect(await bankDB.tryPutBox(replaced)).to.deep.include({ ok: true, act: 'replaced', val: storedOtherwiseOf(replaced.record) })
      const boxrows = await rowsOf(bankDB).boxRowsOf(vaultScope, 'bank1', 'life1')
      expect(boxrows.get(replaced.boxlabel)).to.deep.equal(storedOtherwiseOf(replaced.record))
    })

    it("answers a box del with the tombstone stored", async () => {
      const { bankDB, box } = await putWith({ box: true })
      await storeOtherwise(bankDB)
      const ask = boxDelAskOf(box)
      expect(await bankDB.tryDelBox(ask)).to.deep.include({ ok: true, act: 'deleted', val: storedOtherwiseOf(ask.record) })
      const boxrows = await rowsOf(bankDB).boxRowsOf(vaultScope, 'bank1', 'life1')
      expect(boxrows.get(ask.boxlabel)).to.deep.equal(storedOtherwiseOf(ask.record))
    })
  })
}
// --
