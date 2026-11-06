/** PostgresVaultDB over PGlite: the battery every VaultDB runs, and what is Postgres's own. */

import { describe, expect, it, onTestFinished, vi } from 'vitest'
import * as SX from 'safebyok/storage'
import type { Notice } from 'safebyok/storage'
import { PostgresVaultDB, vaultChannelOf } from '../src/index'
import type { PostgresListen } from '../src/index'
import * as TH from './test-helpers'

TH.bootDatabaseFirst()

/** A client whose every statement fails with `err`. */
const throwingClient = (err: Error) => ({
  query:       () => Promise.reject(err),
  transaction: () => Promise.reject(err),
})

/** A watch on `vaultDB` at `scope`, closed when the test ends, and the notices it has heard so far. */
const watching = (vaultDB: PostgresVaultDB, scope: SX.WatchScope = TH.vaultScope) => {
  const notices: Notice[] = []
  const unwatch = vaultDB.watch(scope, (notice) => { notices.push(notice) })
  onTestFinished(unwatch)
  return notices
}

TH.describeVaultDBBattery("PostgresVaultDB", {
  makeVaultDB:         async (opts) => await TH.makeVaultDB(opts),
  makeCappedVaultDB:   async (maxBoxes) => await TH.makeVaultDB({ maxBoxes }),
  makeTwin:            TH.makeTwin,
  _cheat_rowsOf:       () => TH.rowsOf(),
  _cheat_failNextCall: TH.failNextCall,
})

describe("PostgresVaultDB's constructor", () => {
  it("refuses a client, listen or maxBoxes it cannot use", async () => {
    const client = TH.flakyClientOf(await TH.database())
    const unusable = [{}, { client: { query: client.query } }, { client, listen: 'yes' }, { client, maxBoxes: -1 }, { client, maxRecordBytes: 0 }]
    for (const opts of unusable) { TH.expectSyncRefusal(() => new PostgresVaultDB(opts as never), 'bad_option') }
  })
})

describe("PostgresVaultDB's rows", () => {
  it("stores each record whole as jsonb, beside the columns it is found by", async () => {
    const vaultDB = await TH.makeVaultDB()
    const vault = TH.vaultAt()
    const box = TH.boxAt()
    await vaultDB.putVault(vault, { prior: SX.VoidRevision })
    await vaultDB.putBox(box, { prior: SX.VoidRevision })
    const db = await TH.database()
    const { rows: vaultrows } = await db.query('SELECT applabel, user_id, vaultlabel, vault FROM safebyok_vaults')
    const { rows: boxrows } = await db.query('SELECT applabel, user_id, vaultlabel, vault_tok, boxlabel, box FROM safebyok_boxes')
    expect(vaultrows).to.deep.equal([{ ...TH.vaultScope, vault }])
    expect(boxrows).to.deep.equal([{ ...TH.boxQuery, box }])
  })
})

describe("PostgresVaultDB's refusals", () => {
  it("refuses a statement that failed for want of a table or a privilege as unexpected, and any other as the storage out of reach", async () => {
    const noTable = Object.assign(new Error('relation "safebyok_vaults" does not exist'), { code: '42P01' })
    const missing = new PostgresVaultDB({ client: throwingClient(noTable) })
    const dropped = new PostgresVaultDB({ client: throwingClient(new Error('Connection terminated unexpectedly')) })
    await TH.expectRefusal(missing.getVault(TH.vaultScope), 'unexpected_error')
    await TH.expectRefusal(missing.putVault(TH.vaultAt(), { prior: SX.VoidRevision }), 'unexpected_error')
    await TH.expectRefusal(dropped.listVaults(TH.bankScope), 'storage_unavailable')
  })

  it("keeps a driver error's name, message and code as the cause, and none of the statement's parameters", async () => {
    const vaultDB = await TH.makeVaultDB()
    TH.failNextCall(vaultDB)
    const { err } = await vaultDB.tryPutBox(TH.boxAt(), { prior: SX.VoidRevision })
    expect(SX.isVaultError(err, 'storage_unavailable')).to.be.true
    expect(err?.cause).to.deep.include({ message: 'terminating connection due to administrator command', code: '57P01' })
    expect(err?.cause).not.to.have.property('params')
  })
})

describe("PostgresVaultDB's watch", () => {
  it("hears a write whose rows will not fit in a notification as the rows then stand", async () => {
    const vaultDB = await TH.makeVaultDB()
    const vault = TH.vaultAt()
    await vaultDB.putVault(vault, { prior: SX.VoidRevision })
    const notices = watching(vaultDB)
    const box = TH.boxAt(0, 'life1', { sidecar: { note: 'x'.repeat(9000) } })
    await vaultDB.putBox(box, { prior: SX.VoidRevision })
    await vi.waitFor(() => { expect(notices).to.deep.equal([{ act: 'got', val: box, world: vault }]) })
  })

  it("passes over a notification on its channel that no write of ours sent", async () => {
    const vaultDB = await TH.makeVaultDB()
    const vault = TH.vaultAt()
    const notices = watching(vaultDB)
    const db = await TH.database()
    await db.query('SELECT pg_notify($1, $2), pg_notify($1, $3)', [vaultChannelOf(TH.bankScope.user_id), 'not json', '{"applabel":"acme"}'])
    await vaultDB.putVault(vault, { prior: SX.VoidRevision })
    await vi.waitFor(() => { expect(notices).to.deep.equal([{ act: 'got', val: vault, world: vault }]) })
  })

  it("hears nothing without a listen", async () => {
    await TH.emptyTables()
    const vaultDB = new PostgresVaultDB({ client: TH.flakyClientOf(await TH.database()) })
    const notices = watching(vaultDB)
    await vaultDB.putVault(TH.vaultAt(), { prior: SX.VoidRevision })
    await TH.aWhile()
    expect(notices).to.deep.equal([])
  })
})

describe("PostgresVaultDB's channels", () => {
  it("listens for a watch on its user's channel, and stops only that watch's handler", async () => {
    const listened: string[] = []
    const stopped: string[] = []
    const listen: PostgresListen = async (channel, onNotify) => {
      listened.push(channel)
      const unlisten = await TH.listen(channel, onNotify)
      return () => { stopped.push(channel); return unlisten() }
    }
    const watcher = await TH.storeOver({ listen })
    const unwatch = watcher.watch(TH.bankScope, () => undefined)
    await vi.waitFor(() => { expect(listened).to.deep.equal(['safebyok_u1']) })
    unwatch()
    await vi.waitFor(() => { expect(stopped).to.deep.equal(['safebyok_u1']) })
    expect(vaultChannelOf('u1')).to.eq('safebyok_u1')
  })

  it("hears a user_id of capitals and punctuation, its channel LISTENed as a quoted identifier", async () => {
    const vaultDB = await TH.makeVaultDB()
    const user_id = 'Auth0|Ab.C@x.io~:-+%2B'
    // A first LISTEN on PGlite takes its turn behind the queued statements, so the channel is listened for before the write.
    await TH.listen(vaultChannelOf(user_id), () => undefined)
    const notices = watching(vaultDB, { ...TH.bankScope, user_id })
    const vault = TH.vaultAt(0, 'life1', { user_id })
    await vaultDB.putVault(vault, { prior: SX.VoidRevision })
    await vi.waitFor(() => { expect(notices).to.deep.equal([{ act: 'got', val: vault, world: vault }]) })
  })

  // The channel is 'safebyok_' (9 bytes) and the user_id; Postgres refuses a channel past 63 bytes.
  it("refuses each write for a user_id past 54 bytes, its channel too long to notify, and stores nothing", async () => {
    const vaultDB = await TH.makeVaultDB()
    const longest = 'u'.repeat(54)
    await vaultDB.putVault(TH.vaultAt(0, 'life1', { user_id: longest }), { prior: SX.VoidRevision })
    for (const user_id of ['u'.repeat(55), encodeURIComponent('é'.repeat(9)) + 'u']) {
      const { err } = await vaultDB.tryPutVault(TH.vaultAt(0, 'life1', { user_id }), { prior: SX.VoidRevision })
      expect(SX.isVaultError(err, 'storage_unavailable')).to.be.true
      expect(err?.cause).to.deep.include({ message: 'channel name too long', code: '22023' })
      expect(await vaultDB.getVault({ ...TH.vaultScope, user_id }, { ifAbsent: 'nil' })).to.deep.include({ act: 'gotvoid' })
    }
    expect(await vaultDB.getVault({ ...TH.vaultScope, user_id: longest })).to.deep.include({ act: 'got' })
  })

  it("counts a percent-encoded character as three bytes, and refuses a user_id of other characters before Postgres is asked", async () => {
    const vaultDB = await TH.makeVaultDB()
    const encoded = encodeURIComponent('é'.repeat(9))
    expect(encoded).to.have.lengthOf(54)
    await vaultDB.putVault(TH.vaultAt(0, 'life1', { user_id: encoded }), { prior: SX.VoidRevision })
    TH.expectSyncRefusal(() => TH.vaultAt(0, 'life1', { user_id: 'é'.repeat(9) }), 'bad_option')
  })
})
