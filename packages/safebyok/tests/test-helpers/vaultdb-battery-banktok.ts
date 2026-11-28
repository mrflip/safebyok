/** The battery's cases of the banktok each answer carries: the banktok of the bank's gate its step read. */
import { describe, expect, it } from 'vitest'
import { SX } from 'safebyok-big/internals'
import { expectBad } from 'safebyok-big/testing'
import {
  GateScope, birthAskOf, birthBankAskOf, boxThingOf, gateThingOf, gateTombOf, getAskAt, listAskAt, nextGateOf, nextOf, replaceAskOf, rootBoxOf, trackOf,
} from './vaultdb-world'
import type { VaultDBBatteryWorld } from './vaultdb-battery'
import { OtherRevtok } from './models-world'

/** The banktok of the gate {@link birthBankAskOf} births. */
const BornBanktok = gateThingOf().banktok

/** Register the battery's cases of an answer's banktok. */
export function describeVaultDBBanktok({ fresh, bornBank, withGate, boxesBorn, rowsOf }: VaultDBBatteryWorld): void {
  describe("the banktok each answer carries", () => {
    it("is the void banktok where no gate is stored", async () => {
      const vaultDB = await fresh()
      expect(await vaultDB.tryGetThing(getAskAt('gate', GateScope.labelpath))).to.deep.include({ ok: true, banktok: SX.VoidLifeTok })
      expect(await vaultDB.tryGetThing(getAskAt('box', 'box'))).to.deep.include({ ok: true, act: 'gotvoid', banktok: SX.VoidLifeTok })
      expect(await vaultDB.tryListThings(listAskAt('box', 'box'))).to.deep.include({ ok: false, banktok: SX.VoidLifeTok })
    })

    it("is the bank's banktok, to a get and a listing", async () => {
      const vaultDB = await bornBank()
      expect(await vaultDB.tryGetThing(getAskAt('box', 'box/zz'))).to.deep.include({ ok: true, act: 'gotvoid', banktok: BornBanktok })
      expect(await vaultDB.tryListThings(listAskAt('box', 'box'))).to.deep.include({ ok: true, banktok: BornBanktok })
    })

    it("is the bank's banktok after a write of the gate or the root box", async () => {
      const vaultDB = await bornBank()
      const gateNext   = nextGateOf(gateThingOf())
      const gateAnswer = await vaultDB.tryWriteThing(replaceAskOf(gateThingOf(), gateNext))
      expect(gateAnswer).to.deep.include({ ok: true, banktok: BornBanktok })
      const rootNext   = nextOf(rootBoxOf())
      const rootAnswer = await vaultDB.tryWriteThing(replaceAskOf(rootBoxOf(), rootNext))
      expect(rootAnswer).to.deep.include({ ok: true, banktok: BornBanktok })
    })

    it("is the bank's banktok to a box's write, and to a refusal", async () => {
      const vaultDB = await bornBank()
      const [box] = await boxesBorn(vaultDB, boxThingOf())
      const boxAnswer = await vaultDB.tryWriteThing(replaceAskOf(box!, nextOf(box!)))
      expect(boxAnswer).to.deep.include({ ok: true, banktok: BornBanktok })
      const refusal = await vaultDB.tryWriteThing(birthAskOf(gateThingOf({ revtok: OtherRevtok })))
      expect(refusal).to.deep.include({ ok: false, act: 'stale', banktok: BornBanktok })
    })

    it("is the banktok of the gate written or found, to a birth", async () => {
      const vaultDB = await fresh()
      expect(await vaultDB.tryBirthBank(birthBankAskOf())).to.deep.include({ ok: true, act: 'born', banktok: BornBanktok })
      const other = birthBankAskOf({ gate: gateThingOf({ revtok: OtherRevtok }) })
      expect(await vaultDB.tryBirthBank(other)).to.deep.include({ ok: true, act: 'passed', banktok: BornBanktok })
    })

    it("is the banktok of the gate stored where no root box is stored", async () => {
      const vaultDB = await withGate()
      expect(await vaultDB.tryGetThing(getAskAt('gate', GateScope.labelpath))).to.deep.include({ ok: true, banktok: BornBanktok })
      expect(await vaultDB.tryGetThing(getAskAt('box', 'box'))).to.deep.include({ ok: true, act: 'gotvoid', banktok: BornBanktok })
    })

    it("is the banktok of the gate's tombstone, which keeps it", async () => {
      const vaultDB = await withGate()
      await rowsOf(vaultDB).plant(GateScope, gateTombOf(gateThingOf()))
      expect(await vaultDB.tryGetThing(getAskAt('gate', GateScope.labelpath))).to.deep.include({ ok: true, act: 'gotgone', banktok: BornBanktok })
    })

    it("is the gate's banktok where the gate fails its other checks, and the answer stands to an ask that tracks the gate at its revision", async () => {
      const vaultDB = await bornBank()
      await rowsOf(vaultDB).plant(GateScope, { ...gateThingOf(), wayins: { main: {}, passkey0: null } })
      expect(await vaultDB.tryGetThing({ ...getAskAt('box', 'box'), track: trackOf() })).to.deep.include({ ok: true, act: 'gotlive', val: rootBoxOf(), banktok: BornBanktok })
      expect(await vaultDB.tryListThings({ ...listAskAt('box', 'box'), track: trackOf() })).to.deep.include({ ok: true, deltas: [], banktok: BornBanktok })
      await expectBad(vaultDB.tryGetThing(getAskAt('box', 'box')), 'incompatible_row')
    })

    it("is the void banktok where the gate's banktok is malformed, and the answer stands to an ask that tracks the gate at its revision", async () => {
      const vaultDB = await bornBank()
      await rowsOf(vaultDB).plant(GateScope, { ...gateThingOf(), banktok: 'not-a-banktok' })
      expect(await vaultDB.tryGetThing({ ...getAskAt('box', 'box'), track: trackOf() })).to.deep.include({ ok: true, act: 'gotlive', val: rootBoxOf(), banktok: SX.VoidLifeTok })
      expect(await vaultDB.tryListThings({ ...listAskAt('box', 'box'), track: trackOf() })).to.deep.include({ ok: true, deltas: [], banktok: SX.VoidLifeTok })
      await expectBad(vaultDB.tryGetThing(getAskAt('box', 'box')), 'incompatible_row')
    })
  })
}
