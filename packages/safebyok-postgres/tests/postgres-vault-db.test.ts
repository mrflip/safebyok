/** PostgresVaultDB on PGlite: the battery every VaultDB runs, plus tests of its Postgres-specific behavior. */

import { describe, expect, it, onTestFinished, vi } from 'vitest'
import * as DB from 'safebyok/storage'
import type { Notice } from 'safebyok/storage'
import { PostgresVaultDB, vaultChannelOf } from '../src/index'
import type { PostgresListen } from '../src/index'
import * as TH from './test-helpers'

TH.bootDatabaseFirst()

/** A client whose every statement fails with `err`. */
function throwingClient(err: Error) {
  return {
    query:       () => Promise.reject(err),
    transaction: () => Promise.reject(err),
  }
}

/** Watch `scope` on `vaultDB` until the test ends. Returns the array that collects its notices. */
function watching(vaultDB: PostgresVaultDB, scope: DB.WatchScope = TH.vaultScope) {
  const notices: Notice[] = []
  const unwatch = vaultDB.watch(scope, (notice) => { notices.push(notice) })
  onTestFinished(unwatch)
  return notices
}

TH.describeVaultDBBattery("PostgresVaultDB", {
  makeVaultDB:          async (opts) => await TH.makeVaultDB(opts),
  makeCappedVaultDB:    async (maxBoxes) => await TH.makeVaultDB({ maxBoxes }),
  makeTwin:             TH.makeTwin,
  _cheat_rowsOf:        () => TH.rowsOf(),
  _cheat_failNextCall:  TH.failNextCall,
})

describe("PostgresVaultDB's constructor", () => {
  it("refuses a client, listen or maxBoxes it cannot use", async () => {
    const client = TH.flakyClientOf(await TH.database())
    const unusable = [{}, { client: { query: client.query } }, { client, listen: 'yes' }, { client, maxBoxes: -1 }, { client, maxRecordSizeEst: 0 }]
    for (const opts of unusable) { TH.expectSyncRefusal(() => new PostgresVaultDB(opts as never), 'bad_option') }
  })
})

describe("PostgresVaultDB's rows", () => {
  it("puts each record as one row, a column to each of its fields", async () => {
    const vaultDB = await TH.makeVaultDB()
    const vault = TH.vaultAt()
    const box = TH.boxAt()
    await vaultDB.putVault(TH.vaultPutAskOf(vault))
    await vaultDB.putBox(TH.boxPutAskOf(box))
    const db = await TH.database()
    const { rows: vaultrows } = await db.query('SELECT to_jsonb(stored) AS vault FROM safebyok_vaults AS stored')
    const { rows: boxrows } = await db.query('SELECT to_jsonb(stored) AS box FROM safebyok_boxes AS stored')
    expect(vaultrows).to.deep.equal([{ vault }])
    expect(boxrows).to.deep.equal([{ box }])
  })
})

describe("PostgresVaultDB's refusals", () => {
  it("reports a missing table or privilege as an unexpected error, and any other failed statement as storage unavailable", async () => {
    const noTable = Object.assign(new Error('relation "safebyok_vaults" does not exist'), { code: '42P01' })
    const missing = new PostgresVaultDB({ client: throwingClient(noTable) })
    const dropped = new PostgresVaultDB({ client: throwingClient(new Error('Connection terminated unexpectedly')) })
    const birth = TH.vaultPutAskOf(TH.vaultAt())
    await TH.expectRefusal(missing.getVault(TH.vaultGetAskOf()), 'unexpected_error')
    await TH.expectRefusal(missing.putVault(birth), 'unexpected_error')
    await TH.expectRefusal(dropped.listVaults(TH.vaultListAsk), 'storage_unavailable')
  })

  it("keeps a driver error's name, message and code as the cause, and none of the statement's parameters", async () => {
    const vaultDB = await TH.makeVaultDB()
    TH.failNextCall(vaultDB)
    const { err } = await vaultDB.tryPutBox(TH.boxPutAskOf(TH.boxAt()))
    expect(DB.isVaultError(err, 'storage_unavailable')).to.be.true
    expect(err?.cause).to.deep.include({ message: 'terminating connection due to administrator command', code: '57P01' })
    expect(err?.cause).not.to.have.property('params')
  })
})

describe("PostgresVaultDB's watch", () => {
  it("delivers the stored rows for a write too large for a notification", async () => {
    const vaultDB = await TH.makeVaultDB({ maxRecordSizeEst: 20_000 })
    const vault = TH.vaultAt()
    await vaultDB.putVault(TH.vaultPutAskOf(vault))
    const notices = watching(vaultDB)
    const box = TH.boxAt(0, 'life1', { sidecar: { note: 'x'.repeat(9000) } })
    await vaultDB.putBox(TH.boxPutAskOf(box))
    await vi.waitFor(() => { expect(notices).to.deep.equal([{ act: 'gotlive', val: box, world: vault }]) })
  })

  it("passes over a notification on its channel that no write of ours sent", async () => {
    const vaultDB = await TH.makeVaultDB()
    const vault = TH.vaultAt()
    const notices = watching(vaultDB)
    const db = await TH.database()
    await db.query('SELECT pg_notify($1, $2), pg_notify($1, $3), pg_notify($1, $4)', [vaultChannelOf(TH.bankScope.user_id), 'not json', '{"applabel":"acme"}', '[1, 2, 3]'])
    await vaultDB.putVault(TH.vaultPutAskOf(vault))
    await vi.waitFor(() => { expect(notices).to.deep.equal([{ act: 'gotlive', val: vault, world: vault }]) })
  })

  it("delivers nothing without a listen", async () => {
    await TH.emptyTables()
    const vaultDB = new PostgresVaultDB({ client: TH.flakyClientOf(await TH.database()) })
    const notices = watching(vaultDB)
    await vaultDB.putVault(TH.vaultPutAskOf(TH.vaultAt()))
    await TH.aWhile()
    expect(notices).to.deep.equal([])
  })
})

/** Collect the notifications sent on the test user's channel until the test ends, each parsed from JSON. */
async function sentOn(): Promise<unknown[]> {
  const sent: unknown[] = []
  const unlisten = await TH.listen(vaultChannelOf(TH.bankScope.user_id), (text) => { sent.push(JSON.parse(text)) })
  onTestFinished(() => { unlisten() })
  return sent
}

describe("PostgresVaultDB's notices", () => {
  it("sends a vault row under its scope, and a box row under its address with its vault row beside it", async () => {
    const vaultDB = await TH.makeVaultDB()
    const sent = await sentOn()
    const vault = TH.vaultAt()
    const box = TH.boxAt()
    const tombstone = TH.boxTombstoneOf(box)
    await vaultDB.putVault(TH.vaultPutAskOf(vault))
    await vaultDB.putBox(TH.boxPutAskOf(box))
    await vaultDB.delBox(TH.boxDelAskOf(box))
    await vi.waitFor(() => {
      expect(sent).to.deep.equal([
        { at: TH.vaultScope, vault },
        { at: TH.boxQuery, vault, box },
        { at: TH.boxQuery, vault, box: tombstone },
      ])
    })
  })

  it("sends a box too long for a notification as its address alone", async () => {
    const vaultDB = await TH.makeVaultDB({ maxRecordSizeEst: 20_000 })
    await vaultDB.putVault(TH.vaultPutAskOf(TH.vaultAt()))
    const sent = await sentOn()
    const box = TH.boxAt(0, 'life1', { sidecar: { note: 'x'.repeat(9000) } })
    await vaultDB.putBox(TH.boxPutAskOf(box))
    await vi.waitFor(() => { expect(sent).to.deep.equal([{ at: TH.boxQuery }]) })
  })

  it("delivers a box and its tombstone as stored, each with its vault row", async () => {
    const vaultDB = await TH.makeVaultDB()
    const notices = watching(vaultDB)
    const vault = TH.vaultAt()
    const box = TH.boxAt(0, 'life1', { sidecar: { note: 'naïve ✓ "quoted" \\ [1, 2]', nested: { list: [null, true, 0] } } })
    const tombstone = TH.boxTombstoneOf(box)
    await vaultDB.putVault(TH.vaultPutAskOf(vault))
    await vaultDB.putBox(TH.boxPutAskOf(box))
    await vaultDB.delBox(TH.boxDelAskOf(box))
    await vi.waitFor(() => {
      expect(notices).to.deep.equal([
        { act: 'gotlive', val: vault, world: vault },
        { act: 'gotlive', val: box, world: vault },
        { act: 'gotgone', val: tombstone, world: vault },
      ])
    })
  })

  it("sends no box notice when a vault's deletion deletes its boxes, of the life it ends and of any earlier one", async () => {
    const vaultDB = await TH.makeVaultDB()
    const vault = TH.vaultAt()
    await vaultDB.putVault(TH.vaultPutAskOf(vault))
    await vaultDB.putBox(TH.boxPutAskOf(TH.boxAt()))
    await TH.rowsOf().plantBoxRow(TH.boxscope, 'oldlife', TH.boxAt(0, 'oldlife'))
    const sent = await sentOn()
    await vaultDB.delVault(TH.vaultDelAskOf(vault))
    for (const vault_tok of ['life1', 'oldlife']) { expect(await TH.rowsOf().boxRowsOf(TH.vaultScope, vault_tok)).to.have.property('size', 0) }
    await TH.aWhile()
    expect(sent).to.deep.equal([{ at: TH.vaultScope, vault: TH.vaultTombstoneOf(vault) }])
  })
})

const refusingListen: PostgresListen = () => Promise.reject(new Error('connection refused'))

describe("PostgresVaultDB's channels", () => {
  it("listens for a watch on its user's channel", async () => {
    const listened: string[] = []
    const stopped: string[] = []
    const listen: PostgresListen = async (channel, onNotify) => {
      listened.push(channel)
      const unlisten = await TH.listen(channel, onNotify)
      return () => { stopped.push(channel); return unlisten() }
    }
    const watcher = await TH.vaultDBOver({ listen })
    const unwatch = watcher.watch(TH.bankScope, () => undefined)
    await vi.waitFor(() => { expect(listened).to.deep.equal(['safebyok_u1']) })
    unwatch()
    await vi.waitFor(() => { expect(stopped).to.deep.equal(['safebyok_u1']) })
    expect(vaultChannelOf('u1')).to.eq('safebyok_u1')
  })

  it("tells a watch's onBadNews where its listen fails", async () => {
    const watcher = await TH.vaultDBOver({ listen: refusingListen })
    const badnews: DB.VaultError[] = []
    const unwatch = watcher.watch(TH.bankScope, () => undefined, (news) => { badnews.push(news) })
    await vi.waitFor(() => { expect(badnews).to.have.lengthOf(1) })
    expect(badnews[0]?.refusalkind).to.eq('storage_unavailable')
    unwatch()
  })

  it("refuses a user_id that fails its check", () => {
    for (const user_id of ['', 'a b', 'a/b', '..', 'caf\u{E9}', 7 as never]) {
      TH.expectSyncRefusal(() => vaultChannelOf(user_id), 'bad_option')
    }
  })

  it("delivers a write for a user_id with capitals and punctuation", async () => {
    const vaultDB = await TH.makeVaultDB()
    const user_id = 'Auth0|Ab.C@x.io~:-+%2B'
    // PGlite queues a first LISTEN behind the statements already waiting, so listen on the channel before writing.
    await TH.listen(vaultChannelOf(user_id), () => undefined)
    const notices = watching(vaultDB, { ...TH.bankScope, user_id })
    const vault = TH.vaultAt(0, 'life1', { user_id })
    await vaultDB.putVault(TH.vaultPutAskOf(vault))
    await vi.waitFor(() => { expect(notices).to.deep.equal([{ act: 'gotlive', val: vault, world: vault }]) })
  })

  // The channel is 'safebyok_' (9 bytes) plus the user_id, and Postgres rejects a channel name longer than 63 bytes.
  it("refuses each write for a user_id past 54 bytes", async () => {
    const vaultDB = await TH.makeVaultDB()
    const longest = 'u'.repeat(54)
    await vaultDB.putVault(TH.vaultPutAskOf(TH.vaultAt(0, 'life1', { user_id: longest })))
    for (const user_id of ['u'.repeat(55), encodeURIComponent('é'.repeat(9)) + 'u']) {
      const { err } = await vaultDB.tryPutVault(TH.vaultPutAskOf(TH.vaultAt(0, 'life1', { user_id })))
      expect(DB.isVaultError(err, 'storage_unavailable')).to.be.true
      expect(err?.cause).to.deep.include({ message: 'channel name too long', code: '22023' })
      expect(await vaultDB.getVault(TH.vaultGetAskOf({ ...TH.vaultScope, user_id }, 'nil'))).to.deep.include({ act: 'gotvoid' })
    }
    expect(await vaultDB.getVault(TH.vaultGetAskOf({ ...TH.vaultScope, user_id: longest }))).to.deep.include({ act: 'gotlive' })
  })

  it("counts a percent-encoded character as three bytes", async () => {
    const vaultDB = await TH.makeVaultDB()
    const encoded = encodeURIComponent('é'.repeat(9))
    expect(encoded).to.have.lengthOf(54)
    await vaultDB.putVault(TH.vaultPutAskOf(TH.vaultAt(0, 'life1', { user_id: encoded })))
  })

  it("refuses a user_id of other characters before Postgres is asked", async () => {
    const vaultDB = new PostgresVaultDB({ client: throwingClient(new Error('Postgres was asked')) })
    const answer = await vaultDB.tryPutVault(TH.vaultPutAskOf({ ...TH.vaultAt(), user_id: 'é'.repeat(9) }))
    expect(answer).to.deep.include({ ok: false })
    expect(answer.err?.meta?.fieldnames).to.deep.equal(['user_id', 'record.user_id'])
  })
})
