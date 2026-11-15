/** The battery's cases of the bank each answer carries as its `world`. */
import { describe, expect, it } from 'vitest'
import { type BoxThing, type GateThing, bankRecordOf } from '../../src/storage/shapes-thing'
import {
  GateScope, bankThingOf, birthAskOf, birthBankAskOf, boxThingOf, gateThingOf, getAskAt, listAskAt, nextGateOf, nextOf, replaceAskOf, rootBoxOf,
} from './vaultdb-world'
import type { VaultDBBatteryWorld } from './vaultdb-battery'

/** The bank {@link birthBankAskOf} births, as a world, with its main gate or root box as given. */
function worldWith({ gate = gateThingOf(), root = rootBoxOf() }: { gate?: GateThing, root?: BoxThing } = {}) {
  return bankRecordOf({ bank: bankThingOf(), gate, root })
}

/** Register the battery's cases of an answer's world. */
export function describeVaultDBWorld({ fresh, bornBank, withGate, boxesBorn, rowsOf }: VaultDBBatteryWorld): void {
  describe("the bank each answer carries as its world", () => {
    it("is null where no bank is stored", async () => {
      const vaultDB = await withGate()
      expect(await vaultDB.tryGetThing(getAskAt('gate'))).to.deep.include({ ok: true, world: null })
      expect(await vaultDB.tryGetThing(getAskAt('box'))).to.deep.include({ ok: true, act: 'gotvoid', world: null })
      expect(await vaultDB.tryListThings(listAskAt('box', 'nil'))).to.deep.include({ ok: true, world: null })
    })

    it("is the bank, to a get and a listing", async () => {
      const vaultDB = await bornBank()
      expect(await vaultDB.tryGetThing(getAskAt('box/zz'))).to.deep.include({ ok: true, act: 'gotvoid', world: worldWith() })
      expect(await vaultDB.tryListThings(listAskAt('box'))).to.deep.include({ ok: true, world: worldWith() })
    })

    it("is the bank as a write left it", async () => {
      const vaultDB = await bornBank()
      const next = nextGateOf(gateThingOf())
      const gateAnswer = await vaultDB.tryWriteThing(replaceAskOf(gateThingOf(), next))
      expect(gateAnswer).to.deep.include({ ok: true, world: worldWith({ gate: next }) })
      const rootNext = nextOf(rootBoxOf())
      const rootAnswer = await vaultDB.tryWriteThing(replaceAskOf(rootBoxOf(), rootNext))
      expect(rootAnswer).to.deep.include({ ok: true, world: worldWith({ gate: next, root: rootNext }) })
    })

    it("is the bank to a box's write, and to a refusal", async () => {
      const vaultDB = await bornBank()
      const [box] = await boxesBorn(vaultDB, boxThingOf())
      const boxAnswer = await vaultDB.tryWriteThing(replaceAskOf(box!, nextOf(box!)))
      expect(boxAnswer).to.deep.include({ ok: true, world: worldWith() })
      const refusal = await vaultDB.tryWriteThing(birthAskOf(gateThingOf({ revtok: 'rev-other' })))
      expect(refusal).to.deep.include({ ok: false, act: 'stale', world: worldWith() })
    })

    it("is the bank written or found, to a birth, and null to one refused over no bank", async () => {
      const vaultDB = await fresh()
      expect(await vaultDB.tryBirthBank(birthBankAskOf())).to.deep.include({ ok: true, act: 'born', world: worldWith() })
      const other = birthBankAskOf({ bank: bankThingOf({ revtok: 'rev-other' }) })
      expect(await vaultDB.tryBirthBank(other)).to.deep.include({ ok: true, act: 'passed', world: worldWith() })
      const lone = await withGate(gateThingOf({ revtok: 'rev-other' }))
      expect(await lone.tryBirthBank(birthBankAskOf())).to.deep.include({ ok: false, act: 'stale', world: null })
    })

    it("is null where a root fails its checks, and the answer stands", async () => {
      const vaultDB = await bornBank()
      await rowsOf(vaultDB).plant(GateScope, { ...gateThingOf(), wayins: { main: {}, passkey0: null } })
      expect(await vaultDB.tryGetThing(getAskAt('box'))).to.deep.include({ ok: true, act: 'gotlive', val: rootBoxOf(), world: null })
      expect(await vaultDB.tryListThings(listAskAt('box'))).to.deep.include({ ok: true, val: [], world: null })
    })
  })
}
