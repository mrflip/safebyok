/** The battery's cases of tryBirthBank. */
import { describe, expect, it } from 'vitest'
import { expectBad } from 'safebyok-big/testing'

import type { VaultDB } from '../../src/storage/vault-db'
import type { Labelpath } from '../../src/shapes/primitives'
import { type Thingkind, Shell } from '../../src/shapes/shapes-thing'
import { getAskOf } from '../../src/shapes/shapes-asks'
import {
  GateScope, Life0, RootScope, SenderKnows, ThingBank, birthAskOf, birthBankAskOf, boxThingOf, boxTombOf, gateRebornOf, gateThingOf, gateTombOf, getAskAt, rebirthBankAskOf, rootBoxOf,
} from './vaultdb-world'
import type { VaultDBBatteryWorld } from './vaultdb-battery'
import { FirstBanktok, OtherBanktok, OtherRevtok } from './models-world'

/** The shells a refused birth answers for roots none of which is stored. */
const Shells = { gate: Shell.under(GateScope, null), root: Shell.under(RootScope, null) }

/** Expect `vaultDB` to have none of a bank's two roots but those of `present`. */
async function expectRootsVoidBut(vaultDB: VaultDB, ...present: ('gate' | 'root')[]): Promise<void> {
  const scopes = { gate: GateScope, root: RootScope }
  for (const rootckey of ['gate', 'root'] as const) {
    if (present.includes(rootckey)) { continue }
    expect(await vaultDB.tryGetThing(getAskAt(scopes[rootckey].modelkind, scopes[rootckey].labelpath))).to.deep.include({ ok: true, act: 'gotvoid' })
  }
}

/** Register the battery's cases of a bank's birth. */
export function describeVaultDBBirths({ fresh, bornBank, withGate, gotAt, rowsOf, servesOneBank }: VaultDBBatteryWorld): void {
  const roots = { gate: gateThingOf(), root: rootBoxOf() }

  describe("tryBirthBank(ask)", () => {
    it("writes the bank's gate, at its banklabel, and its root box, answering with them", async () => {
      const vaultDB = await fresh()
      expect(await vaultDB.tryBirthBank(birthBankAskOf())).to.deep.include({ ok: true, act: 'born', val: roots })
      expect(await gotAt(vaultDB, 'gate', GateScope.labelpath)).to.deep.equal(roots.gate)
      expect(await gotAt(vaultDB, 'box', 'box')).to.deep.equal(roots.root)
    })

    it("passes the actual roots back, writing nothing, where the gate is live", async () => {
      const vaultDB = await bornBank()
      const other = birthBankAskOf({ gate: gateThingOf({ revtok: OtherRevtok }) })
      expect(await vaultDB.tryBirthBank(other)).to.deep.include({ ok: true, act: 'passed', val: roots })
      expect(await gotAt(vaultDB, 'gate', GateScope.labelpath)).to.deep.equal(roots.gate)
    })

    it("answers retcon to the birth already stored, by the put table, with both roots as stored", async () => {
      const vaultDB = await bornBank()
      expect(await vaultDB.tryBirthBank(birthBankAskOf())).to.deep.include({ ok: false, act: 'retcon', dbhas: roots })
    })

    it("refuses a live gate stored without its root box as a broken datastore, with a null dbhas", async () => {
      const vaultDB = await withGate()
      const other = birthBankAskOf({ gate: gateThingOf({ revtok: OtherRevtok }) })
      const answer = await vaultDB.tryBirthBank(other)
      expect(answer).to.deep.include({ ok: false, dbhas: null })
      await expectBad(answer, 'storage_issue')
    })

    it("refuses a birth citing the shell over a gate's tombstone, writing nothing, with the tombstone and the root box's shell", async () => {
      const vaultDB = await fresh()
      const gateGone = gateTombOf(gateThingOf())
      await rowsOf(vaultDB).plant(GateScope, gateGone)
      expect(await vaultDB.tryBirthBank(birthBankAskOf())).to.deep.include({ ok: false, act: 'stale', dbhas: { gate: gateGone, root: Shells.root } })
      await expectRootsVoidBut(vaultDB, 'gate')
    })

    const gateGone = gateTombOf(gateThingOf())
    const rootGone = boxTombOf(rootBoxOf())
    const RebirthCases = [
      ["the gate's tombstone, with no root box stored", gateGone, null],
      ["the tombstones of the gate and the root box",   gateGone, rootGone],
      ["the root box's tombstone, with no gate stored", null,     rootGone],
    ] as const

    for (const [blurb, gate, root] of RebirthCases) {
      it(`writes each root's next life over ${blurb}, its banktok the new gate's banktok`, async () => {
        const vaultDB = await fresh()
        if (gate) { await rowsOf(vaultDB).plant(GateScope, gate) }
        if (root) { await rowsOf(vaultDB).plant(RootScope, root) }
        const ask = rebirthBankAskOf(gate, root)
        expect(await vaultDB.tryBirthBank(ask)).to.deep.include({ ok: true, act: 'born', val: { gate: ask.gate, root: ask.root }, banktok: gate ? OtherBanktok : FirstBanktok })
        expect(await gotAt(vaultDB, 'gate', GateScope.labelpath)).to.deep.equal(ask.gate)
        expect(await gotAt(vaultDB, 'box', 'box')).to.deep.equal(ask.root)
      })
    }

    it("writes a rebirth over the gate's tombstone that keeps its banktok", async () => {
      const vaultDB = await fresh()
      await rowsOf(vaultDB).plant(GateScope, gateGone)
      const ask = { ...rebirthBankAskOf(gateGone, null), gate: gateRebornOf(gateGone), banktok: gateGone.banktok }
      expect(await vaultDB.tryBirthBank(ask)).to.deep.include({ ok: true, act: 'born', val: { gate: ask.gate, root: ask.root }, banktok: gateGone.banktok })
    })

    it("writes neither root where the gate's put is writable and the root box's is not, answering both tombstones", async () => {
      const vaultDB = await fresh()
      await rowsOf(vaultDB).plant(GateScope, gateGone)
      await rowsOf(vaultDB).plant(RootScope, rootGone)
      expect(await vaultDB.tryBirthBank(rebirthBankAskOf(gateGone, null))).to.deep.include({ ok: false, act: 'stale', dbhas: { gate: gateGone, root: rootGone } })
      expect(await vaultDB.tryGetThing(getAskAt('gate', GateScope.labelpath))).to.deep.include({ act: 'gotgone', dbhas: gateGone })
      expect(await vaultDB.tryGetThing(getAskAt('box', 'box'))).to.deep.include({ act: 'gotgone', dbhas: rootGone })
    })

    it("refuses over a root box stored with no gate, writing no gate, with the gate's shell and the root box", async () => {
      const prior   = rootBoxOf({ revtok: OtherRevtok })
      const vaultDB = await fresh()
      await rowsOf(vaultDB).plant(RootScope, prior)
      expect(await vaultDB.tryBirthBank(birthBankAskOf())).to.deep.include({ ok: false, act: 'stale', dbhas: { gate: Shells.gate, root: prior } })
      await expectRootsVoidBut(vaultDB, 'root')
    })

    it("refuses an ask whose roots fail their checks, writing nothing", async () => {
      const vaultDB = await fresh()
      const ask = birthBankAskOf({ root: boxThingOf() })
      await expectBad(vaultDB.tryBirthBank(ask), 'bad_record')
      await expectRootsVoidBut(vaultDB)
    })

    // Each case below births a bank other than the battery's own.
    if (servesOneBank) { return }

    it("writes the gate and the root box of a bank labelled box, each at box in its own kind's table, and a box under the root", async () => {
      const vaultDB = await fresh()
      const banklabel = 'box'
      const boxRoots  = { gate: gateThingOf({ banklabel, labelpath: banklabel, label: banklabel }), root: rootBoxOf({ banklabel }) }
      expect(await vaultDB.tryBirthBank(birthBankAskOf({ banklabel, ...boxRoots }))).to.deep.include({ ok: true, act: 'born', val: boxRoots })
      const getAt = (modelkind: Thingkind, labelpath: Labelpath) => getAskOf({ userid: ThingBank.userid, banklabel, modelkind, labelpath, ...SenderKnows })
      expect(await vaultDB.tryGetThing(getAt('gate', banklabel))).to.deep.include({ ok: true, act: 'gotlive', val: boxRoots.gate })
      expect(await vaultDB.tryGetThing(getAt('box', banklabel))).to.deep.include({ ok: true, act: 'gotlive', val: boxRoots.root })
      const box = boxThingOf('openai', { banklabel })
      const put = birthAskOf(box, Shell.childCited(Life0))
      expect(await vaultDB.tryWriteThing(put)).to.deep.include({ ok: true, act: 'born', val: box })
      expect(await vaultDB.tryGetThing(getAt('box', box.labelpath))).to.deep.include({ ok: true, act: 'gotlive', val: box })
    })

    it("refuses over the root box of a bank labelled box stored with no gate, with the gate's shell and the root box, writing no gate", async () => {
      const vaultDB   = await fresh()
      const banklabel = 'box'
      const prior     = rootBoxOf({ banklabel, revtok: OtherRevtok })
      const boxRoots  = { gate: gateThingOf({ banklabel, labelpath: banklabel, label: banklabel }), root: rootBoxOf({ banklabel }) }
      await rowsOf(vaultDB).plant({ ...RootScope, banklabel }, prior)
      const gateShell = Shell.under({ ...GateScope, banklabel, labelpath: banklabel }, null)
      expect(await vaultDB.tryBirthBank(birthBankAskOf({ banklabel, ...boxRoots }))).to.deep.include({ ok: false, act: 'stale', dbhas: { gate: gateShell, root: prior } })
      const gateAsk = getAskOf({ userid: ThingBank.userid, banklabel, modelkind: 'gate', labelpath: banklabel, ...SenderKnows })
      expect(await vaultDB.tryGetThing(gateAsk)).to.deep.include({ ok: true, act: 'gotvoid' })
    })
  })
}
