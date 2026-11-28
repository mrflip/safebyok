/** The battery's cases of tryStats. */
import { describe, expect, it } from 'vitest'
import { SX } from 'safebyok-big/internals'
import { expectBad, expectGood } from 'safebyok-big/testing'

import { DatastoreLimitCap, type VaultStats } from '../../src/shapes/shapes-vault-stats'
import { boxThingOf, boxTombOf, gateThingOf, rootBoxOf, statsAskOf, trackOf } from './vaultdb-world'
import type { VaultDBBatteryWorld } from './vaultdb-battery'

/** Register the battery's cases of a bank's storage stats. */
export function describeVaultDBStats({ fresh, bornBank, boxesBorn, rowsOf }: VaultDBBatteryWorld): void {
  /** The stats of `vaultDB`'s test bank; throws on a refusal. */
  async function statsOf(vaultDB: Awaited<ReturnType<typeof fresh>>): Promise<VaultStats> {
    return await expectGood<VaultStats>(vaultDB.tryStats(statsAskOf()))
  }

  describe("tryStats(ask)", () => {
    it("answers no boxes and no gates for a bank none of whose Things is stored, to an ask with the void banktok", async () => {
      const vaultDB = await fresh()
      const answer  = await vaultDB.tryStats(statsAskOf({ banktok: SX.VoidLifeTok }))
      const none    = { count: 0, live_count: 0, size: 0 }
      expect(answer).to.deep.include({ ok: true, act: 'got', banktok: SX.VoidLifeTok })
      expect(answer.ok && answer.val).to.deep.include({ box: none, gate: none })
    })

    it("answers the root box and the gate of a bank born, with the gate's banktok", async () => {
      const vaultDB = await bornBank()
      const answer  = await vaultDB.tryStats(statsAskOf())
      expect(answer).to.deep.include({ ok: true, act: 'got', banktok: gateThingOf().banktok })
      const stats = await expectGood<VaultStats>(answer)
      expect(stats.box).to.deep.include({ count: 1, live_count: 1 })
      expect(stats.gate).to.deep.include({ count: 1, live_count: 1 })
      expect(stats.box.size).to.be.greaterThan(0)
      expect(stats.gate.size).to.be.greaterThan(0)
    })

    it("counts a tombstone among the boxes stored, but not among the live ones, and weighs each box it has", async () => {
      const vaultDB = await bornBank()
      const ante    = await statsOf(vaultDB)
      const [openai] = await boxesBorn(vaultDB, boxThingOf('openai'), boxThingOf('mistral'))
      await rowsOf(vaultDB).plant(openai!, boxTombOf(openai!))
      const post  = await statsOf(vaultDB)
      expect(post.box).to.deep.include({ count: 3, live_count: 2 })
      expect(post.box.size).to.be.greaterThan(ante.box.size)
      expect(post.gate).to.deep.equal(ante.gate)
    })

    it("counts nothing of another bank", async () => {
      const vaultDB = await bornBank()
      const other   = boxThingOf('openai', { banklabel: 'other' })
      await rowsOf(vaultDB).plant(other, other)
      const { box } = await statsOf(vaultDB)
      expect(box).to.deep.include({ count: 1, live_count: 1 })
    })

    it("answers limits that are whole numbers, never past the cap", async () => {
      const { max } = await statsOf(await fresh())
      for (const limit of [max.count, max.size]) {
        expect(Number.isSafeInteger(limit)).to.equal(true)
        expect(limit).to.be.within(0, DatastoreLimitCap)
      }
    })

    it("answers 'same' for each root stored at the revision the ask tracks, else the actual root", async () => {
      const vaultDB = await bornBank()
      const track   = trackOf(gateThingOf(), rootBoxOf({ revseq: 3 }))
      expect(await vaultDB.tryStats(statsAskOf({ track }))).to.deep.include({ ok: true, tracked: { gate: 'same', root: rootBoxOf() } })
    })

    it("refuses an ask with a labelpath", async () => {
      const vaultDB = await bornBank()
      await expectBad(vaultDB.tryStats({ ...statsAskOf(), labelpath: 'box' } as never), 'bad_record')
    })
  })
}
