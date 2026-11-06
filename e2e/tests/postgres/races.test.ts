// @vitest-environment node
/** Writers for a vault's last place on a real Postgres, each on a pool of its own, so their statements run at the same moment. */

import { expect, it } from 'vitest'
import * as SX from 'safebyok/storage'
import * as TH from 'safebyok/testing'
import * as PX from './test-helpers'

const getDb = PX.useFileDatabase()

PX.describeOnPostgres('races', "PostgresVaultDB's box cap, over a real Postgres", () => {
  const Cap = 5
  const Racers = 8
  const Rounds = 5

  it("lands exactly as many racing writers as the cap has room for, and refuses the rest as full", async () => {
    const db = getDb()
    for (let round = 0; round < Rounds; round += 1) {
      const first = await PX.freshStore(db, { maxBoxes: Cap })
      await first.putVault(TH.vaultAt(), { prior: SX.VoidRevision })
      for (const boxlabel of ['one', 'two', 'three', 'four']) { await first.putBox(TH.boxAt(0, 'life1', { boxlabel }), { prior: SX.VoidRevision }) }
      const racers = await Promise.all(Array.from({ length: Racers }, async () => await PX.storeOver(db, { maxBoxes: Cap })))

      const answers = await Promise.all(racers.map(async (racer, idx) => await racer.tryPutBox(TH.boxAt(0, 'life1', { boxlabel: `racer_${String(idx)}` }), { prior: SX.VoidRevision })))

      expect(answers.filter(({ ok }) => ok)).to.have.lengthOf(1)
      expect(answers.filter(({ ok, err }) => (! ok) && (! SX.isVaultError(err, 'vault_full')))).to.deep.equal([])
      const { val: { boxes } } = await first.listBoxes(TH.vaultQuery)
      expect(boxes).to.have.lengthOf(Cap)
    }
  })

  it("leaves no live box under a vault deleted while boxes were written to it", async () => {
    const db = getDb()
    const first = await PX.freshStore(db)
    const vault = TH.vaultAt()
    await first.putVault(vault, { prior: SX.VoidRevision })
    const writers = await Promise.all(Array.from({ length: Racers }, async () => await PX.storeOver(db)))

    await Promise.all([
      first.delVault(TH.vaultTombstoneOf(vault), { prior: SX.revisionOf(vault) }),
      ...writers.map(async (writer, idx) => await writer.tryPutBox(TH.boxAt(0, 'life1', { boxlabel: `writer_${String(idx)}` }), { prior: SX.VoidRevision })),
    ])

    const boxrows = await PX.rowsOf(db).boxRowsOf(TH.vaultScope, 'life1')
    expect([...boxrows.values()].filter((row) => SX.isLiveRow(row))).to.deep.equal([])
  })
})
