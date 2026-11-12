// @vitest-environment node
/** The bankDB battery over a real Postgres through `pg`, each bankDB a pool and a listener of its own, and its watch heard across servers. */

import { expect, it, onTestFinished, vi } from 'vitest'
import type * as DB from 'safebyok/storage'
import { BX } from 'safebyok/storage'
import type { PostgresBankDB } from 'safebyok-postgres'
import * as TH from './test-helpers'

const { BW } = TH
const getDb = TH.useFileDatabase()

const optsOf = new WeakMap<PostgresBankDB, TH.BankDBOverOpts>()

function remembered(bankDB: PostgresBankDB, opts: TH.BankDBOverOpts): PostgresBankDB {
  optsOf.set(bankDB, opts)
  return bankDB
}

function watching(bankDB: PostgresBankDB, scope: DB.WatchScope = BW.vaultScope): BX.Notice[] {
  const notices: BX.Notice[] = []
  const unwatch = bankDB.watch(scope, (notice) => { notices.push(notice) })
  onTestFinished(unwatch)
  return notices
}

TH.describeOnPostgres('battery', "PostgresBankDB over a real Postgres", () => {
  TH.describeBankDBBattery("PostgresBankDB", {
    makeBankDB:          async (opts = {}) => remembered(await TH.freshBankDB(getDb(), opts), opts),
    makeCappedBankDB:    async (maxBoxes) => remembered(await TH.freshBankDB(getDb(), { maxBoxes }), { maxBoxes }),
    makeTwin:            async (bankDB) => await TH.bankDBOver(getDb(), optsOf.get(bankDB)),
    _cheat_rowsOf:       () => TH.bankRowsOf(getDb()),
  })

  it("hears what another server puts, a box too large for a notice included", async () => {
    const db = getDb()
    const notices = watching(await TH.freshBankDB(db))
    const other = await TH.bankDBOver(db, { maxRecordSizeEst: 20_000 })
    const vault = BW.vaultAt()
    const box = BW.boxAt(0, 'bank1', 'life1', { sidecar: { padding: 'x'.repeat(9000) } })

    await other.buildBank(BW.bankBuildAskOf())
    await other.putVault(BW.vaultPutAskOf(vault))
    await other.putBox(BW.boxPutAskOf(box))

    await vi.waitFor(() => { expect(notices).to.have.lengthOf(2) })
    expect(notices.map(({ act, val, parent }) => [act, val, parent])).to.deep.equal([['gotlive', vault, BW.bankAt()], ['gotlive', box, vault]])
  })

  it("hears another server's write for a user_id of capitals and punctuation", async () => {
    const db = getDb()
    const user_id = 'Auth0|Ab.C@x.io~:-+%2B'
    const notices = watching(await TH.freshBankDB(db), { ...BW.bankScope, user_id })
    await TH.aWhile()  // a watch's first LISTEN races the writes made just after it
    const bank = { ...BW.bankAt(), user_id }
    const other = await TH.bankDBOver(db)
    await other.buildBank(BW.bankBuildAskOf(bank, { ...BW.gateAt(), user_id }))
    await vi.waitFor(() => { expect(notices).to.deep.include({ act: 'gotlive', val: bank, parent: BX.BankTop }) })
  })
})
