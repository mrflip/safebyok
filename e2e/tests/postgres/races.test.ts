// @vitest-environment node
/** Writers for a vault's last place on a real Postgres, each on a pool of its own, so their statements run at the same moment. */

import { expect, it } from 'vitest'
import * as DB from 'safebyok-big/storage'
import type { PostgresBankDB } from 'safebyok-postgres'
import * as TH from './test-helpers'

const { BW } = TH
const getDb = TH.useFileDatabase()

/** A fresh bankDB holding the bank and its vault `main`. */
async function withVault(opts: TH.BankDBOverOpts = {}): Promise<PostgresBankDB> {
  const first = await TH.freshBankDB(getDb(), opts)
  await first.buildBank(BW.bankBuildAskOf())
  await first.putVault(BW.vaultPutAskOf(BW.vaultAt()))
  return first
}

TH.describeOnPostgres('races', "PostgresBankDB's box cap, over a real Postgres", () => {
  const Cap = 5
  const Racers = 8
  const Rounds = 5

  // The cap is soft: each writer counts the box rows outside any lock, so several may take the last place at once.
  it("writes at least one racing writer into the cap's last place, refuses the rest only as full, and lists every box written", async () => {
    const db = getDb()
    for (let round = 0; round < Rounds; round += 1) {
      const first = await withVault({ maxBoxes: Cap })
      for (const boxlabel of ['one', 'two', 'three', 'four']) { await first.putBox(BW.boxPutAskOf(BW.boxAt(0, 'bank1', 'life1', { boxlabel }))) }
      const racers = await Promise.all(Array.from({ length: Racers }, async () => await TH.bankDBOver(db, { maxBoxes: Cap })))

      function racerBox(idx: number) { return BW.boxAt(0, 'bank1', 'life1', { boxlabel: `racer_${String(idx)}` }) }
      const answers = await Promise.all(racers.map(async (racer, idx) => await racer.tryPutBox(BW.boxPutAskOf(racerBox(idx)))))

      const written = answers.filter(({ ok }) => ok)
      expect(written.length).to.be.at.least(1)
      expect(answers.filter(({ ok, err }) => (! ok) && (! DB.isVaultError(err, 'vault_full')))).to.deep.equal([])
      const { val: { boxes } } = await first.listBoxes(BW.boxListAsk)
      expect(boxes).to.have.lengthOf((Cap - 1) + written.length)
    }
  })

  // A box write reads its vault row without a lock, so a box may be written into the life a del is ending (bank-functions.sql).
  // No listing shows such a box, and tidyGone deletes it.
  it("lists no box under a vault deleted while boxes were written to it, and tidyGone deletes any written", async () => {
    const db = getDb()
    const first = await withVault()
    const writers = await Promise.all(Array.from({ length: Racers }, async () => await TH.bankDBOver(db)))

    function writerBox(idx: number) { return BW.boxAt(0, 'bank1', 'life1', { boxlabel: `writer_${String(idx)}` }) }

    const delAsk = BW.vaultDelAskOf(BW.vaultAt())
    await Promise.all([
      first.delVault(delAsk),
      ...writers.map(async (writer, idx) => await writer.tryPutBox(BW.boxPutAskOf(writerBox(idx)))),
    ])

    const listed = await first.tryListBoxes(BW.boxListAsk)
    expect(listed.ok).to.equal(false)
    await first.tidyGone(BW.boxTidyAsk)
    const boxrows = await TH.bankRowsOf(db).boxRowsOf(BW.vaultScope, 'bank1', 'life1')
    expect([...boxrows.values()]).to.deep.equal([])
  })
})
