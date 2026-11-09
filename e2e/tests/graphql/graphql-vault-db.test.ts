// @vitest-environment node
/** GraphQLVaultDB over real sockets to Yoga servers, each hosting a PostgresVaultDB over a real Postgres: the battery, and a watch heard across servers. */

import { expect, it, onTestFinished, vi } from 'vitest'
import * as DB from 'safebyok/storage'
import type { Notice } from 'safebyok/storage'
import type { GraphQLVaultDB } from 'safebyok-graphql'
import * as TH from './test-helpers'

const getDb = TH.useFileDatabase()
TH.useServers()

const serverOf = new WeakMap<GraphQLVaultDB, TH.Server>()
const optsOf = new WeakMap<GraphQLVaultDB, TH.VaultDBOverOpts>()

/** A browser of a fresh server, its VaultDB made with `opts`. */
const freshBrowser = async (opts: TH.VaultDBOverOpts = {}): Promise<GraphQLVaultDB> => {
  const server = await TH.freshServer(getDb(), opts)
  const browser = TH.browserAt(server)
  serverOf.set(browser, server)
  optsOf.set(browser, opts)
  return browser
}

/** A browser of a second server over the same rows, as another device reaches through another instance of the app. */
const twinOf = async (browser: GraphQLVaultDB): Promise<GraphQLVaultDB> => {
  const server = await TH.serve(await TH.vaultDBOver(getDb(), optsOf.get(browser)))
  const twin = TH.browserAt(server)
  serverOf.set(twin, server)
  return twin
}

/** The notices `browser` hears of `scope`, gathered until the test ends. */
const watching = (browser: GraphQLVaultDB, scope: DB.WatchScope = TH.vaultScope): Notice[] => {
  const notices: Notice[] = []
  const unwatch = browser.watch(scope, (notice) => { notices.push(notice) })
  onTestFinished(unwatch)
  return notices
}

TH.describeOnPostgres('graphql', "GraphQLVaultDB over the network to a real Postgres", () => {
  TH.describeVaultDBBattery("GraphQLVaultDB", {
    makeVaultDB:          async (opts = {}) => await freshBrowser(opts),
    makeCappedVaultDB:    async (maxBoxes) => await freshBrowser({ maxBoxes }),
    makeTwin:             twinOf,
    _cheat_rowsOf:        () => TH.rowsOf(getDb()),
    _cheat_adapterOf:       (browser) => serverOf.get(browser)!.vaultDB,
    boxNoticesCarryVault: false,
  })

  it("hears what a browser of another server puts, a box too large for a notice included", async () => {
    const db = getDb()
    const listening = { count: 0 }
    await TH.freshServer(db)
    const watcher = TH.browserAt(await TH.serve(await TH.vaultDBListening(db, listening)))
    const writer = TH.browserAt(await TH.serve(await TH.vaultDBOver(db)))
    const notices = watching(watcher)
    await expect.poll(() => listening.count).to.eq(1)
    const vault = TH.vaultAt()
    const box = TH.boxAt(0, 'life1', { sidecar: { padding: 'x'.repeat(9000) } })

    await writer.putVault(vault, { prior: DB.VoidRevision })
    await writer.putBox(box, { prior: DB.VoidRevision })

    await vi.waitFor(() => { expect(notices).to.have.lengthOf(2) })
    expect(notices.map(({ act, val }) => [act, val])).to.deep.equal([['got', vault], ['got', box]])
  })

  it("stops the server's watch once the browser stops watching", async () => {
    const db = getDb()
    const listening = { count: 0 }
    await TH.freshServer(db)
    const browser = TH.browserAt(await TH.serve(await TH.vaultDBListening(db, listening)))
    const unwatch = browser.watch(TH.bankScope, () => undefined)
    await expect.poll(() => listening.count).to.eq(1)
    unwatch()
    await expect.poll(() => listening.count).to.eq(0)
  })

  it("refuses a browser signed in as one user the bank of another", async () => {
    const server = await TH.freshServer(getDb())
    const intruder = TH.browserAt(server, () => 'u2')
    await TH.expectRefusal(intruder.putVault(TH.vaultAt(), { prior: DB.VoidRevision }), 'identity_revoked')
    await TH.expectRefusal(TH.browserAt(server, () => null).listVaults(TH.bankScope), 'identity_revoked')
    expect(await TH.rowsOf(getDb()).vaultRowOf(TH.vaultScope)).to.be.null
  })
})
