/** makePostgresListen: on a pg Client whose statements are faked, and under PostgresVaultDB on PGlite. */

import { PGlite } from '@electric-sql/pglite'
import { Client, Pool, escapeIdentifier } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { VaultError } from 'safebyok/storage'
import * as VT from 'safebyok/testing'
import { thingsChannelOf } from '../src/notifications'
import { type PostgresListenClient, makePostgresListen } from '../src/postgres-listen'
import { PostgresVaultDB } from '../src/postgres-vault-db'
import { VaultFunctionsSql } from '../src/vault-functions'
import { VaultTablesSql } from '../src/vault-tables'
import * as TH from './test-helpers'

// == [Fakes]: fakedClient, hearer, AnnChannel, BobChannel

/** A pg Client that never connects: it records each statement it is given, and fails the first one beginning with `failing`, if given. */
function fakedClient(failing?: string) {
  const statements: string[] = []
  const failingAt = { prefix: failing }
  const runStatement = (text: string) => {
    statements.push(text)
    if ((failingAt.prefix === undefined) || (! text.startsWith(failingAt.prefix))) { return Promise.resolve({ rows: [] }) }
    failingAt.prefix = undefined
    return Promise.reject(Object.assign(new Error(`${text} failed`), { code: '42501' }))
  }
  const client = Object.assign(new Client(), { query: runStatement })
  /** Have the client receive a notification on `channel`, with `payload` if given. */
  const notify = (channel: string, payload?: string) => client.emit('notification', { processId: 1, channel, payload })
  return { client, statements, notify }
}

/** A notify handler that keeps each text it is passed in `heard`. */
function hearer() {
  const heard: string[] = []
  return { heard, onNotify: (text: string) => { heard.push(text) } }
}

// A userid may have capitals and a double quote, which a channel keeps.
const AnnChannel = thingsChannelOf('Ann"O')
const BobChannel = thingsChannelOf('bob')
// --

describe("makePostgresListen", () => {
  it("LISTENs on a channel once, quoted, however many watches hear it", async () => {
    const { client, statements } = fakedClient()
    const listen = makePostgresListen(client)
    await listen(AnnChannel, () => undefined)
    await listen(AnnChannel, () => undefined)
    expect(statements).to.deep.equal(['LISTEN "safebyok_things_Ann""O"'])
  })

  it("passes each notification's text to every watch on its channel, and to no other", async () => {
    const { client, notify } = fakedClient()
    const listen = makePostgresListen(client)
    const [ann1, ann2, bob] = [hearer(), hearer(), hearer()]
    await listen(AnnChannel, ann1.onNotify)
    await listen(AnnChannel, ann2.onNotify)
    await listen(BobChannel, bob.onNotify)
    notify(AnnChannel, '{"at":{}}')
    notify(AnnChannel)
    notify(thingsChannelOf('carol'), 'unheard')
    expect(ann1.heard).to.deep.equal(['{"at":{}}', ''])
    expect(ann2.heard).to.deep.equal(['{"at":{}}', ''])
    expect(bob.heard).to.deep.equal([])
  })

  it("UNLISTENs a channel once the last watch on it stops, and passes it nothing after", async () => {
    const { client, statements, notify } = fakedClient()
    const listen = makePostgresListen(client)
    const [first, second] = [hearer(), hearer()]
    const unlistenFirst  = await listen(AnnChannel, first.onNotify)
    const unlistenSecond = await listen(AnnChannel, second.onNotify)
    await unlistenFirst()
    notify(AnnChannel, 'one')
    expect(statements).to.deep.equal(['LISTEN "safebyok_things_Ann""O"'])
    await unlistenSecond()
    notify(AnnChannel, 'two')
    expect(statements).to.deep.equal(['LISTEN "safebyok_things_Ann""O"', 'UNLISTEN "safebyok_things_Ann""O"'])
    expect(first.heard).to.deep.equal([])
    expect(second.heard).to.deep.equal(['one'])
  })

  it("LISTENs again on a channel it has UNLISTENed", async () => {
    const { client, statements, notify } = fakedClient()
    const listen = makePostgresListen(client)
    const unlisten = await listen(BobChannel, () => undefined)
    await unlisten()
    const { heard, onNotify } = hearer()
    await listen(BobChannel, onNotify)
    notify(BobChannel, 'again')
    expect(statements).to.deep.equal(['LISTEN "safebyok_things_bob"', 'UNLISTEN "safebyok_things_bob"', 'LISTEN "safebyok_things_bob"'])
    expect(heard).to.deep.equal(['again'])
  })

  it("rejects with the driver's error where LISTEN fails, and LISTENs again for the next watch", async () => {
    const { client, statements, notify } = fakedClient('LISTEN')
    const listen = makePostgresListen(client)
    const failed = hearer()
    await expect(listen(BobChannel, failed.onNotify)).rejects.toThrow('LISTEN "safebyok_things_bob" failed')
    const { heard, onNotify } = hearer()
    await listen(BobChannel, onNotify)
    notify(BobChannel, 'heard')
    expect(statements).to.deep.equal(['LISTEN "safebyok_things_bob"', 'LISTEN "safebyok_things_bob"'])
    expect(failed.heard).to.deep.equal([])
    expect(heard).to.deep.equal(['heard'])
  })

  it("rejects the stop with the driver's error where UNLISTEN fails, and LISTENs again for the next watch", async () => {
    const { client, statements } = fakedClient('UNLISTEN')
    const listen = makePostgresListen(client)
    const unlisten = await listen(BobChannel, () => undefined)
    await expect(Promise.resolve(unlisten())).rejects.toThrow('UNLISTEN "safebyok_things_bob" failed')
    await listen(BobChannel, () => undefined)
    expect(statements).to.deep.equal(['LISTEN "safebyok_things_bob"', 'UNLISTEN "safebyok_things_bob"', 'LISTEN "safebyok_things_bob"'])
  })

  it("refuses a client that cannot LISTEN, a pg Pool among them", () => {
    const unusable = [undefined, null, 'client', {}, { query: () => undefined }, { query: () => undefined, escapeIdentifier, on: 'yes' }, new Pool()]
    for (const client of unusable) { TH.expectSyncRefusal(() => makePostgresListen(client as never), 'bad_record') }
  })
})

// == [On PGlite]: database, pgliteListenClient

const made: { db?: Promise<PGlite> } = {}

/** This file's PGlite, with the vaultDB's tables and functions created. */
async function database(): Promise<PGlite> {
  made.db ??= (async () => {
    const db = new PGlite()
    await db.exec(VaultTablesSql)
    await db.exec(VaultFunctionsSql)
    return db
  })()
  return await made.db
}

/** `db` dressed as the pg Client makePostgresListen needs: it runs LISTEN and UNLISTEN as statements, and emits each notification it receives. */
function pgliteListenClient(db: PGlite): PostgresListenClient {
  return {
    query: (text) => db.query(text),
    escapeIdentifier,
    on: (_event, onNotification) => db.onNotification((channel, payload) => { onNotification({ channel, payload }) }),
  }
}
// --

describe("makePostgresListen, under PostgresVaultDB on PGlite", () => {
  beforeAll(async () => { await database() }, TH.BootMillis)
  afterAll(async () => {
    const db = await database()
    await db.close()
  })

  it("lets a watch hear a write, and hear nothing once it stops", async () => {
    const db = await database()
    const vaultDB = new PostgresVaultDB({ client: db, listen: makePostgresListen(pgliteListenClient(db)) })
    const events: unknown[] = []
    const unwatch = vaultDB.watch(VT.ThingBank, (event) => { events.push(event) }, () => undefined)
    await vi.waitFor(async () => {
      const { rows } = await db.query<{ channel: string }>('SELECT pg_listening_channels() AS channel')
      expect(rows.map(({ channel }) => channel)).to.deep.equal([thingsChannelOf(VT.ThingBank.userid)])
    })
    await vaultDB.tryWriteThing(VT.birthAskOf())
    await vi.waitFor(() => { expect(events).to.have.lengthOf(1) })
    unwatch()
    await vi.waitFor(async () => {
      const { rows } = await db.query('SELECT pg_listening_channels()')
      expect(rows).to.deep.equal([])
    })
  })

  it("tells the watch's onBadNews where its UNLISTEN fails", async () => {
    const { client } = fakedClient('UNLISTEN')
    const vaultDB = new PostgresVaultDB({ client: await database(), listen: makePostgresListen(client) })
    const badnews: VaultError[] = []
    const ended: true[] = []
    const unwatch = vaultDB.watch(VT.ThingBank, () => undefined, (news) => { badnews.push(news) }, () => { ended.push(true) })
    await VT.aWhile()
    unwatch()
    await vi.waitFor(() => { expect(badnews).to.have.lengthOf(1) })
    expect(badnews[0]?.refusalkind).to.eq('storage_issue')
    expect(badnews[0]?.cause).to.have.property('code', '42501')
    expect(ended).to.deep.equal([])
  })
})
