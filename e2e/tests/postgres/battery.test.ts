// @vitest-environment node
/** The VaultDB battery over a real Postgres through `pg`, each store a pool and a listener of its own, and its watch heard across servers. */

import { expect, it, onTestFinished, vi } from 'vitest'
import * as SX from 'safebyok/storage'
import type { Notice } from 'safebyok/storage'
import type { PostgresVaultDB } from 'safebyok-postgres'
import * as TH from './test-helpers'

const getDb = TH.useFileDatabase()

const optsOf = new WeakMap<PostgresVaultDB, TH.StoreOpts>()

const remembered = (vaultDB: PostgresVaultDB, opts: TH.StoreOpts): PostgresVaultDB => {
  optsOf.set(vaultDB, opts)
  return vaultDB
}

const watching = (vaultDB: PostgresVaultDB): Notice[] => {
  const notices: Notice[] = []
  const unwatch = vaultDB.watch(TH.vaultScope, (notice) => { notices.push(notice) })
  onTestFinished(unwatch)
  return notices
}

TH.describeOnPostgres('battery', "PostgresVaultDB over a real Postgres", () => {
  TH.describeVaultDBBattery("PostgresVaultDB", {
    makeVaultDB:       async (opts = {}) => remembered(await TH.freshStore(getDb(), opts), opts),
    makeCappedVaultDB: async (maxBoxes) => remembered(await TH.freshStore(getDb(), { maxBoxes }), { maxBoxes }),
    makeTwin:          async (vaultDB) => await TH.storeOver(getDb(), optsOf.get(vaultDB)),
    _cheat_rowsOf:     () => TH.rowsOf(getDb()),
  })

  it("hears what another server stores, a box too large for a notice included", async () => {
    const db = getDb()
    const notices = watching(await TH.freshStore(db))
    const other = await TH.storeOver(db)
    const vault = TH.vaultAt()
    const box = TH.boxAt(0, 'life1', { sidecar: { padding: 'x'.repeat(9000) } })

    await other.putVault(vault, { prior: SX.VoidRevision })
    await other.putBox(box, { prior: SX.VoidRevision })

    await vi.waitFor(() => { expect(notices).to.have.lengthOf(2) })
    expect(notices.map(({ act, val }) => [act, val])).to.deep.equal([['got', vault], ['got', box]])
  })
})
