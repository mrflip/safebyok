/** The battery's cases of tryGetWorld. */
import { describe, expect, it } from 'vitest'
import { SX } from 'safebyok-big/internals'
import { expectBad } from 'safebyok-big/testing'

import { Lifeseq } from '../../src/shapes/primitives'
import { Shell } from '../../src/shapes/shapes-thing'
import { BankScope, GateScope, RootScope, bankThingOf, gateThingOf, getWorldAskOf, nextOf, rootBoxOf, trackOf } from './vaultdb-world'
import type { VaultDBBatteryWorld } from './vaultdb-battery'

/** The shells a get of the world answers for roots none of which is stored. */
const Shells = { bank: Shell.under(BankScope, null), gate: Shell.under(GateScope, null), root: Shell.under(RootScope, null) }

/** Register the battery's cases of a get of a bank's three roots. */
export function describeVaultDBGetWorld({ fresh, bornBank, rowsOf }: VaultDBBatteryWorld): void {
  const roots = { bank: bankThingOf(), gate: gateThingOf(), root: rootBoxOf() }

  describe("tryGetWorld(ask)", () => {
    it("answers the three roots stored live, with the bank's lifetok", async () => {
      const vaultDB = await bornBank()
      expect(await vaultDB.tryGetWorld(getWorldAskOf())).to.deep.include({
        ok: true, act: 'got', val: roots, banktok: roots.bank.lifetok,
      })
    })

    it("answers the shell at each root where none is stored, to an ask with the void lifetok", async () => {
      const vaultDB = await fresh()
      expect(await vaultDB.tryGetWorld(getWorldAskOf({ banktok: SX.VoidLifeTok }))).to.deep.include({ ok: true, act: 'got', val: Shells, banktok: SX.VoidLifeTok })
    })

    it("answers a tombstone among the roots as stored", async () => {
      const vaultDB = await bornBank()
      const life1   = Lifeseq.ofLifenum(1)
      const rootGone = nextOf(rootBoxOf(), { am: 'x', lifeseq: life1, lifepath: life1 })
      await rowsOf(vaultDB).plant(RootScope, rootGone)
      expect(await vaultDB.tryGetWorld(getWorldAskOf())).to.deep.include({ ok: true, act: 'got', val: { ...roots, root: rootGone } })
    })

    it("answers a live bank stored without its main gate and root box, the shell at each of those", async () => {
      const vaultDB = await bornBank()
      await rowsOf(vaultDB).remove(GateScope)
      await rowsOf(vaultDB).remove(RootScope)
      expect(await vaultDB.tryGetWorld(getWorldAskOf())).to.deep.include({ ok: true, act: 'got', val: { ...roots, gate: Shells.gate, root: Shells.root }, banktok: roots.bank.lifetok })
    })

    it("answers 'same' for each root stored at the revision the ask tracks, else the root stored", async () => {
      const vaultDB = await bornBank()
      const track   = trackOf(bankThingOf(), gateThingOf(), rootBoxOf({ revseq: 3 }))
      expect(await vaultDB.tryGetWorld(getWorldAskOf({ track }))).to.deep.include({ ok: true, tracked: { bank: 'same', gate: 'same', box: roots.root } })
    })

    it("refuses damaged_row for a root that fails its checks", async () => {
      const vaultDB = await bornBank()
      await rowsOf(vaultDB).plant(GateScope, { ...gateThingOf(), wayins: { main: {}, passkey0: null } })
      await expectBad(vaultDB.tryGetWorld(getWorldAskOf()), 'damaged_row')
    })

    it("refuses an ask with a labelpath", async () => {
      const vaultDB = await bornBank()
      await expectBad(vaultDB.tryGetWorld({ ...getWorldAskOf(), labelpath: 'bank' } as never), 'bad_record')
    })
  })
}
