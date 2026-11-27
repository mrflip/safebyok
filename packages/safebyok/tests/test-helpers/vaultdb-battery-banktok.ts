/** The battery's cases of the banktok each answer carries: the lifetok of the bank its step read. */
import { describe, expect, it } from 'vitest'
import { SX } from 'safebyok-big/internals'
import { expectBad } from 'safebyok-big/testing'
import {
  BankScope, GateScope, RootScope, bankThingOf, birthAskOf, birthBankAskOf, boxThingOf, gateThingOf, getAskAt, listAskAt, nextGateOf, nextOf, replaceAskOf, rootBoxOf, trackOf,
} from './vaultdb-world'
import type { VaultDBBatteryWorld } from './vaultdb-battery'
import { OtherRevtok } from './models-world'

/** The lifetok of the bank {@link birthBankAskOf} births. */
const BornBanktok = bankThingOf().lifetok

/** Register the battery's cases of an answer's banktok. */
export function describeVaultDBBanktok({ fresh, bornBank, withGate, boxesBorn, rowsOf }: VaultDBBatteryWorld): void {
  describe("the banktok each answer carries", () => {
    it("is the void lifetok where no bank is stored", async () => {
      const vaultDB = await withGate()
      expect(await vaultDB.tryGetThing(getAskAt('gate'))).to.deep.include({ ok: true, banktok: SX.VoidLifeTok })
      expect(await vaultDB.tryGetThing(getAskAt('box'))).to.deep.include({ ok: true, act: 'gotvoid', banktok: SX.VoidLifeTok })
      expect(await vaultDB.tryListThings(listAskAt('box'))).to.deep.include({ ok: false, banktok: SX.VoidLifeTok })
    })

    it("is the bank's lifetok, to a get and a listing", async () => {
      const vaultDB = await bornBank()
      expect(await vaultDB.tryGetThing(getAskAt('box/zz'))).to.deep.include({ ok: true, act: 'gotvoid', banktok: BornBanktok })
      expect(await vaultDB.tryListThings(listAskAt('box'))).to.deep.include({ ok: true, banktok: BornBanktok })
    })

    it("is the bank's lifetok after a write of the main gate or the root box", async () => {
      const vaultDB = await bornBank()
      const gateNext   = nextGateOf(gateThingOf())
      const gateAnswer = await vaultDB.tryWriteThing(replaceAskOf(gateThingOf(), gateNext))
      expect(gateAnswer).to.deep.include({ ok: true, banktok: BornBanktok })
      const rootNext   = nextOf(rootBoxOf())
      const rootAnswer = await vaultDB.tryWriteThing(replaceAskOf(rootBoxOf(), rootNext))
      expect(rootAnswer).to.deep.include({ ok: true, banktok: BornBanktok })
    })

    it("is the bank's lifetok to a box's write, and to a refusal", async () => {
      const vaultDB = await bornBank()
      const [box] = await boxesBorn(vaultDB, boxThingOf())
      const boxAnswer = await vaultDB.tryWriteThing(replaceAskOf(box!, nextOf(box!)))
      expect(boxAnswer).to.deep.include({ ok: true, banktok: BornBanktok })
      const refusal = await vaultDB.tryWriteThing(birthAskOf(gateThingOf({ revtok: OtherRevtok })))
      expect(refusal).to.deep.include({ ok: false, act: 'stale', banktok: BornBanktok })
    })

    it("is the lifetok of the bank written or found, to a birth, and the void lifetok to one refused over no bank", async () => {
      const vaultDB = await fresh()
      expect(await vaultDB.tryBirthBank(birthBankAskOf())).to.deep.include({ ok: true, act: 'born', banktok: BornBanktok })
      const other = birthBankAskOf({ bank: bankThingOf({ revtok: OtherRevtok }) })
      expect(await vaultDB.tryBirthBank(other)).to.deep.include({ ok: true, act: 'passed', banktok: BornBanktok })
      const lone = await withGate(gateThingOf({ revtok: OtherRevtok }))
      expect(await lone.tryBirthBank(birthBankAskOf())).to.deep.include({ ok: false, act: 'stale', banktok: SX.VoidLifeTok })
    })

    it("is the bank's lifetok where no root box is stored", async () => {
      const vaultDB = await bornBank()
      await rowsOf(vaultDB).remove(RootScope)
      expect(await vaultDB.tryGetThing(getAskAt('gate'))).to.deep.include({ ok: true, banktok: BornBanktok })
    })

    it("is the bank's lifetok where the main gate fails its checks, and the answer stands to an ask that tracks the gate at its revision", async () => {
      const vaultDB = await bornBank()
      await rowsOf(vaultDB).plant(GateScope, { ...gateThingOf(), wayins: { main: {}, passkey0: null } })
      expect(await vaultDB.tryGetThing({ ...getAskAt('box'), track: trackOf() })).to.deep.include({ ok: true, act: 'gotlive', val: rootBoxOf(), banktok: BornBanktok })
      expect(await vaultDB.tryListThings({ ...listAskAt('box'), track: trackOf() })).to.deep.include({ ok: true, deltas: [], banktok: BornBanktok })
      await expectBad(vaultDB.tryGetThing(getAskAt('box')), 'incompatible_row')
    })

    it("is the void lifetok where the bank fails its checks, and the answer stands to an ask that tracks the bank at its revision", async () => {
      const vaultDB = await bornBank()
      await rowsOf(vaultDB).plant(BankScope, { ...bankThingOf(), lifetok: 'not-a-lifetok' })
      expect(await vaultDB.tryGetThing({ ...getAskAt('box'), track: trackOf() })).to.deep.include({ ok: true, act: 'gotlive', val: rootBoxOf(), banktok: SX.VoidLifeTok })
      expect(await vaultDB.tryListThings({ ...listAskAt('box'), track: trackOf() })).to.deep.include({ ok: true, deltas: [], banktok: SX.VoidLifeTok })
      await expectBad(vaultDB.tryGetThing(getAskAt('box')), 'incompatible_row')
    })
  })
}
