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

  it("writes exactly as many racing writers as the cap has room for, and refuses the rest as full", async () => {
    const db = getDb()
    for (let round = 0; round < Rounds; round += 1) {
      const first = await TH.freshVaultDB(db, { maxBoxes: Cap })
      await first.putVault(TH.vaultPutAskOf(TH.vaultAt()))
      for (const boxlabel of ['one', 'two', 'three', 'four']) { await first.putBox(TH.boxPutAskOf(TH.boxAt(0, 'life1', { boxlabel }))) }
      const racers = await Promise.all(Array.from({ length: Racers }, async () => await TH.vaultDBOver(db, { maxBoxes: Cap })))

      const racerBox = (idx: number) => TH.boxAt(0, 'life1', { boxlabel: `racer_${String(idx)}` })
      const answers = await Promise.all(racers.map(async (racer, idx) => await racer.tryPutBox(TH.boxPutAskOf(racerBox(idx)))))

      expect(answers.filter(({ ok }) => ok)).to.have.lengthOf(1)
      expect(answers.filter(({ ok, err }) => (! ok) && (! DB.isVaultError(err, 'vault_full')))).to.deep.equal([])
      const { val: { boxes } } = await first.listBoxes(TH.vaultQuery)
      expect(boxes).to.have.lengthOf(Cap)
    }
  })

  it("leaves no live box under a vault deleted while boxes were written to it", async () => {
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

    const boxrows = await TH.rowsOf(db).boxRowsOf(TH.vaultScope, 'life1')
    expect([...boxrows.values()].filter((row) => DB.isLiveRow(row))).to.deep.equal([])
  })
})
