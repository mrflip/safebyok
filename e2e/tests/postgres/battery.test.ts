// @vitest-environment node
/** The VaultDB battery over a real Postgres through `pg`, each VaultDB a pool and a listener of its own, and its watch heard across servers. */

import { expect, it, onTestFinished, vi } from 'vitest'
import * as DB from 'safebyok/storage'
import type { Notice } from 'safebyok/storage'
import type { PostgresVaultDB } from 'safebyok-postgres'
import * as TH from './test-helpers'

const getDb = TH.useFileDatabase()

const optsOf = new WeakMap<PostgresVaultDB, TH.VaultDBOverOpts>()

const remembered = (vaultDB: PostgresVaultDB, opts: TH.VaultDBOverOpts): PostgresVaultDB => {
  optsOf.set(vaultDB, opts)
  return vaultDB
}

const watching = (vaultDB: PostgresVaultDB, scope: DB.WatchScope = TH.vaultScope): Notice[] => {
  const notices: Notice[] = []
  const unwatch = vaultDB.watch(scope, (notice) => { notices.push(notice) })
  onTestFinished(unwatch)
  return notices
}

TH.describeOnPostgres('battery', "PostgresVaultDB over a real Postgres", () => {
  TH.describeVaultDBBattery("PostgresVaultDB", {
    makeVaultDB:          async (opts = {}) => remembered(await TH.freshVaultDB(getDb(), opts), opts),
    makeCappedVaultDB:    async (maxBoxes) => remembered(await TH.freshVaultDB(getDb(), { maxBoxes }), { maxBoxes }),
    makeTwin:             async (vaultDB) => await TH.vaultDBOver(getDb(), optsOf.get(vaultDB)),
    _cheat_rowsOf:        () => TH.rowsOf(getDb()),
    plantsAnyRow:         false,
  })

  it("hears what another server puts, a box too large for a notice included", async () => {
    const db = getDb()
    const notices = watching(await TH.freshVaultDB(db))
    const other = await TH.vaultDBOver(db, { maxRecordBytes: 20_000 })
    const vault = TH.vaultAt()
    const box = TH.boxAt(0, 'life1', { sidecar: { padding: 'x'.repeat(9000) } })

    await other.putVault(TH.vaultPutAskOf(vault))
    await other.putBox(TH.boxPutAskOf(box))

    await vi.waitFor(() => { expect(notices).to.have.lengthOf(2) })
    expect(notices.map(({ act, val }) => [act, val])).to.deep.equal([['got', vault], ['got', box]])
  })

  it("hears another server's write for a user_id of capitals and punctuation", async () => {
    const db = getDb()
    const user_id = 'Auth0|Ab.C@x.io~:-+%2B'
    const notices = watching(await TH.freshVaultDB(db), { ...TH.bankScope, user_id })
    await TH.aWhile()  // a watch's first LISTEN races the writes made just after it
    const vault = TH.vaultAt(0, 'life1', { user_id })
    const other = await TH.vaultDBOver(db)
    await other.putVault(TH.vaultPutAskOf(vault))
    await vi.waitFor(() => { expect(notices).to.deep.equal([{ act: 'got', val: vault, world: vault }]) })
  })
})
