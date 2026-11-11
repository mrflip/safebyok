// @vitest-environment node
/** Writers for a vault's last place on a real Postgres, each on a pool of its own, so their statements run at the same moment. */

import { expect, it } from 'vitest'
import * as DB from 'safebyok/storage'
import * as TH from './test-helpers'

const getDb = TH.useFileDatabase()

TH.describeOnPostgres('races', "PostgresVaultDB's box cap, over a real Postgres", () => {
  const Cap = 5
  const Racers = 8
  const Rounds = 5

  // The cap is soft: each writer counts the box rows outside any lock, so several may take the last place at once.
  it("writes at least one racing writer into the cap's last place, refuses the rest only as full, and lists every box written", async () => {
    const db = getDb()
    for (let round = 0; round < Rounds; round += 1) {
      const first = await TH.freshVaultDB(db, { maxBoxes: Cap })
      await first.putVault(TH.vaultPutAskOf(TH.vaultAt()))
      for (const boxlabel of ['one', 'two', 'three', 'four']) { await first.putBox(TH.boxPutAskOf(TH.boxAt(0, 'life1', { boxlabel }))) }
      const racers = await Promise.all(Array.from({ length: Racers }, async () => await TH.vaultDBOver(db, { maxBoxes: Cap })))

      const racerBox = (idx: number) => TH.boxAt(0, 'life1', { boxlabel: `racer_${String(idx)}` })
      const answers = await Promise.all(racers.map(async (racer, idx) => await racer.tryPutBox(TH.boxPutAskOf(racerBox(idx)))))

      const written = answers.filter(({ ok }) => ok)
      expect(written.length).to.be.at.least(1)
      expect(answers.filter(({ ok, err }) => (! ok) && (! DB.isVaultError(err, 'vault_full')))).to.deep.equal([])
      const { val: { boxes } } = await first.listBoxes(TH.boxListAsk)
      expect(boxes).to.have.lengthOf((Cap - 1) + written.length)
    }
  })

  // A box write reads its vault row without a lock, so a box may be written into the life a del is ending (vault-functions.sql).
  // No listing shows such a box, and tidyGone deletes it.
  it("lists no box under a vault deleted while boxes were written to it, and tidyGone deletes any written", async () => {
    const db = getDb()
    const first = await TH.freshVaultDB(db)
    const vault = TH.vaultAt()
    await first.putVault(TH.vaultPutAskOf(vault))
    const writers = await Promise.all(Array.from({ length: Racers }, async () => await TH.vaultDBOver(db)))

    const writerBox = (idx: number) => TH.boxAt(0, 'life1', { boxlabel: `writer_${String(idx)}` })

    await Promise.all([
      first.delVault(TH.vaultDelAskOf(vault)),
      ...writers.map(async (writer, idx) => await writer.tryPutBox(TH.boxPutAskOf(writerBox(idx)))),
    ])

    const listed = await first.tryListBoxes(TH.boxListAsk)
    expect(listed.ok).to.equal(false)
    await first.tidyGone(TH.boxTidyAsk)
    const boxrows = await TH.rowsOf(db).boxRowsOf(TH.vaultScope, 'life1')
    expect([...boxrows.values()].filter((row) => DB.isLiveRow(row))).to.deep.equal([])
  })
})
