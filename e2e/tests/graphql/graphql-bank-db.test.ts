// @vitest-environment node
/** GraphQLBankDB over real sockets to Yoga servers, each hosting a PostgresBankDB over a real Postgres: the battery, and a watch heard across servers. */

import { expect, it, onTestFinished, vi } from 'vitest'
import type * as DB from 'safebyok/storage'
import type { BX } from 'safebyok/storage'
import type { GraphQLBankDB } from 'safebyok-graphql'
import * as TH from './test-helpers'

const { BW } = TH
const getDb = TH.useFileDatabase()
TH.useServers()

const serverOf = new WeakMap<GraphQLBankDB, TH.Server>()
const optsOf = new WeakMap<GraphQLBankDB, TH.BankDBOverOpts>()

/** A browser of a fresh server, its bankDB made with `opts`. */
async function freshBrowser(opts: TH.BankDBOverOpts = {}): Promise<GraphQLBankDB> {
  const server = await TH.freshServer(getDb(), opts)
  const browser = TH.browserAt(server)
  serverOf.set(browser, server)
  optsOf.set(browser, opts)
  return browser
}

/** A browser of a second server over the same rows, as another device reaches through another instance of the app. */
async function twinOf(browser: GraphQLBankDB): Promise<GraphQLBankDB> {
  const server = await TH.serve(await TH.bankDBOver(getDb(), optsOf.get(browser)))
  const twin = TH.browserAt(server)
  serverOf.set(twin, server)
  return twin
}

/** The notices `browser` hears of `scope`, gathered until the test ends. */
function watching(browser: GraphQLBankDB, scope: DB.WatchScope = BW.vaultScope): BX.Notice[] {
  const notices: BX.Notice[] = []
  const unwatch = browser.watch(scope, (notice) => { notices.push(notice) })
  onTestFinished(unwatch)
  return notices
}

TH.describeOnPostgres('graphql', "GraphQLBankDB over the network to a real Postgres", () => {
  TH.describeBankDBBattery("GraphQLBankDB", {
    makeBankDB:       async (opts = {}) => await freshBrowser(opts),
    makeCappedBankDB: async (maxBoxes) => await freshBrowser({ maxBoxes }),
    makeTwin:         twinOf,
    _cheat_rowsOf:    () => TH.bankRowsOf(getDb()),
    _cheat_adapterOf: (browser) => serverOf.get(browser)!.bankDB,
  })

  it("hears what a browser of another server puts, a box too large for a notice included", async () => {
    const db = getDb()
    const listening = { count: 0 }
    await TH.freshServer(db)
    const watcher = TH.browserAt(await TH.serve(await TH.bankDBListening(db, listening)))
    const writer = TH.browserAt(await TH.serve(await TH.bankDBOver(db, { maxRecordSizeEst: 20_000 })))
    const notices = watching(watcher)
    await expect.poll(() => listening.count).to.eq(1)
    const vault = BW.vaultAt()
    const box = BW.boxAt(0, 'bank1', 'life1', { sidecar: { padding: 'x'.repeat(9000) } })

    await writer.buildBank(BW.bankBuildAskOf())
    await writer.putVault(BW.vaultPutAskOf(vault))
    await writer.putBox(BW.boxPutAskOf(box))

    await vi.waitFor(() => { expect(notices).to.have.lengthOf(2) })
    expect(notices.map(({ act, val, parent }) => [act, val, parent])).to.deep.equal([['gotlive', vault, BW.bankAt()], ['gotlive', box, vault]])
  })

  it("stops the server's watch once the browser stops watching", async () => {
    const db = getDb()
    const listening = { count: 0 }
    await TH.freshServer(db)
    const browser = TH.browserAt(await TH.serve(await TH.bankDBListening(db, listening)))
    const unwatch = browser.watch(BW.bankScope, () => undefined)
    await expect.poll(() => listening.count).to.eq(1)
    unwatch()
    await expect.poll(() => listening.count).to.eq(0)
  })

  it("refuses a browser signed in as one user the bank of another", async () => {
    const server = await TH.freshServer(getDb())
    const intruder = TH.browserAt(server, () => 'u2')
    await TH.expectRefusal(intruder.buildBank(BW.bankBuildAskOf()), 'identity_revoked')
    await TH.expectRefusal(TH.browserAt(server, () => null).ensureBank(BW.bankEnsureAsk), 'identity_revoked')
    expect(await TH.bankRowsOf(getDb()).bankRowOf(BW.bankScope)).to.be.null
  })
})
