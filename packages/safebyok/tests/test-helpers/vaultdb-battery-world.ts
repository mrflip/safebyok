/** The battery's cases of the world each answer carries: its bank and main gate. */
import { describe, expect, it } from 'vitest'
import type { GateRecord } from '../../src/shapes/shapes-thing'
import type { WorldRecord } from '../../src/shapes/shapes-asks'
import {
  GateScope, RootScope, bankThingOf, birthAskOf, birthBankAskOf, boxThingOf, gateThingOf, getAskAt, listAskAt, nextGateOf, nextOf, replaceAskOf, rootBoxOf,
} from './vaultdb-world'
import type { VaultDBBatteryWorld } from './vaultdb-battery'
import { OtherRevtok } from './models-world'

/** The world of the bank {@link birthBankAskOf} births, with its main gate as given. */
function worldWith(maingate: GateRecord = gateThingOf()): WorldRecord { return { ...bankThingOf(), maingate } }

/** Register the battery's cases of an answer's world. */
export function describeVaultDBWorld({ fresh, bornBank, withGate, boxesBorn, rowsOf }: VaultDBBatteryWorld): void {
  describe("the world each answer carries", () => {
    it("is null where no bank is stored", async () => {
      const vaultDB = await withGate()
      expect(await vaultDB.tryGetThing(getAskAt('gate'))).to.deep.include({ ok: true, world: null })
      expect(await vaultDB.tryGetThing(getAskAt('box'))).to.deep.include({ ok: true, act: 'gotvoid', world: null })
      expect(await vaultDB.tryListThings(listAskAt('box'))).to.deep.include({ ok: false, world: null })
    })

    it("is the bank and its main gate, to a get and a listing", async () => {
      const vaultDB = await bornBank()
      expect(await vaultDB.tryGetThing(getAskAt('box/zz'))).to.deep.include({ ok: true, act: 'gotvoid', world: worldWith() })
      expect(await vaultDB.tryListThings(listAskAt('box'))).to.deep.include({ ok: true, world: worldWith() })
    })

    it("is the bank and its main gate as a write left them, and leaves out the root box", async () => {
      const vaultDB = await bornBank()
      const next = nextGateOf(gateThingOf())
      const gateAnswer = await vaultDB.tryWriteThing(replaceAskOf(gateThingOf(), next))
      expect(gateAnswer).to.deep.include({ ok: true, world: worldWith(next) })
      const rootNext = nextOf(rootBoxOf())
      const rootAnswer = await vaultDB.tryWriteThing(replaceAskOf(rootBoxOf(), rootNext))
      expect(rootAnswer).to.deep.include({ ok: true, world: worldWith(next) })
    })

    it("is the world to a box's write, and to a refusal", async () => {
      const vaultDB = await bornBank()
      const [box] = await boxesBorn(vaultDB, boxThingOf())
      const boxAnswer = await vaultDB.tryWriteThing(replaceAskOf(box!, nextOf(box!)))
      expect(boxAnswer).to.deep.include({ ok: true, world: worldWith() })
      const refusal = await vaultDB.tryWriteThing(birthAskOf(gateThingOf({ revtok: OtherRevtok })))
      expect(refusal).to.deep.include({ ok: false, act: 'stale', world: worldWith() })
    })

    it("is the bank and main gate written or found, to a birth, and null to one refused over no bank", async () => {
      const vaultDB = await fresh()
      expect(await vaultDB.tryBirthBank(birthBankAskOf())).to.deep.include({ ok: true, act: 'born', world: worldWith() })
      const other = birthBankAskOf({ bank: bankThingOf({ revtok: OtherRevtok }) })
      expect(await vaultDB.tryBirthBank(other)).to.deep.include({ ok: true, act: 'passed', world: worldWith() })
      const lone = await withGate(gateThingOf({ revtok: OtherRevtok }))
      expect(await lone.tryBirthBank(birthBankAskOf())).to.deep.include({ ok: false, act: 'stale', world: null })
    })

    it("is the bank and its main gate where no root box is stored", async () => {
      const vaultDB = await bornBank()
      await rowsOf(vaultDB).remove(RootScope)
      expect(await vaultDB.tryGetThing(getAskAt('gate'))).to.deep.include({ ok: true, world: worldWith() })
    })

    it("is null where the main gate fails its checks, and the answer stands", async () => {
      const vaultDB = await bornBank()
      await rowsOf(vaultDB).plant(GateScope, { ...gateThingOf(), wayins: { main: {}, passkey0: null } })
      expect(await vaultDB.tryGetThing(getAskAt('box'))).to.deep.include({ ok: true, act: 'gotlive', val: rootBoxOf(), world: null })
      expect(await vaultDB.tryListThings(listAskAt('box'))).to.deep.include({ ok: true, deltas: [], world: null })
    })
  })
}
