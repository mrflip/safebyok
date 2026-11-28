/** The battery's cases of tryGetBank. */
import { describe, expect, it } from 'vitest'
import { SX } from 'safebyok-big/internals'
import { expectBad } from 'safebyok-big/testing'

import { Lifeseq } from '../../src/shapes/primitives'
import { Shell } from '../../src/shapes/shapes-thing'
import { GateScope, RootScope, gateThingOf, gateTombOf, getBankAskOf, nextOf, rootBoxOf, trackOf } from './vaultdb-world'
import type { VaultDBBatteryWorld } from './vaultdb-battery'

/** The shells a get of the bank answers for roots none of which is stored. */
const Shells = { gate: Shell.under(GateScope, null), root: Shell.under(RootScope, null) }

/** Register the battery's cases of a get of a bank's two roots. */
export function describeVaultDBGetBank({ fresh, bornBank, rowsOf }: VaultDBBatteryWorld): void {
  const roots = { gate: gateThingOf(), root: rootBoxOf() }

  describe("tryGetBank(ask)", () => {
    it("answers the two roots stored live, with the gate's banktok", async () => {
      const vaultDB = await bornBank()
      expect(await vaultDB.tryGetBank(getBankAskOf())).to.deep.include({
        ok: true, act: 'got', val: roots, banktok: roots.gate.banktok,
      })
    })

    it("answers the shell at each root where none is stored, to an ask with the void banktok", async () => {
      const vaultDB = await fresh()
      expect(await vaultDB.tryGetBank(getBankAskOf({ banktok: SX.VoidLifeTok }))).to.deep.include({ ok: true, act: 'got', val: Shells, banktok: SX.VoidLifeTok })
    })

    it("answers a tombstone among the roots as stored", async () => {
      const vaultDB = await bornBank()
      const life1   = Lifeseq.ofLifenum(1)
      const rootGone = nextOf(rootBoxOf(), { am: 'x', lifeseq: life1, lifepath: life1 })
      await rowsOf(vaultDB).plant(RootScope, rootGone)
      expect(await vaultDB.tryGetBank(getBankAskOf())).to.deep.include({ ok: true, act: 'got', val: { ...roots, root: rootGone } })
    })

    it("answers the gate's tombstone, the bank's end, with the banktok it keeps", async () => {
      const vaultDB  = await bornBank()
      const gateGone = gateTombOf(gateThingOf())
      await rowsOf(vaultDB).plant(GateScope, gateGone)
      expect(await vaultDB.tryGetBank(getBankAskOf())).to.deep.include({ ok: true, act: 'got', val: { ...roots, gate: gateGone }, banktok: roots.gate.banktok })
    })

    it("answers a live gate stored without its root box, the shell at the root box", async () => {
      const vaultDB = await bornBank()
      await rowsOf(vaultDB).remove(RootScope)
      expect(await vaultDB.tryGetBank(getBankAskOf())).to.deep.include({ ok: true, act: 'got', val: { ...roots, root: Shells.root }, banktok: roots.gate.banktok })
    })

    it("answers 'same' for each root stored at the revision the ask tracks, else the actual root", async () => {
      const vaultDB = await bornBank()
      const track   = trackOf(gateThingOf(), rootBoxOf({ revseq: 3 }))
      expect(await vaultDB.tryGetBank(getBankAskOf({ track }))).to.deep.include({ ok: true, tracked: { gate: 'same', root: roots.root } })
    })

    it("refuses incompatible_row for a root that fails its checks", async () => {
      const vaultDB = await bornBank()
      await rowsOf(vaultDB).plant(GateScope, { ...gateThingOf(), wayins: { main: {}, passkey0: null } })
      await expectBad(vaultDB.tryGetBank(getBankAskOf()), 'incompatible_row')
    })

    it("refuses an ask with a labelpath", async () => {
      const vaultDB = await bornBank()
      await expectBad(vaultDB.tryGetBank({ ...getBankAskOf(), labelpath: 'box' } as never), 'bad_record')
    })
  })
}
