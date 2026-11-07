/** GraphQLVaultDB over the resolvers in-process, a PostgresVaultDB on PGlite behind them: the battery every VaultDB runs. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Client, CombinedError } from '@urql/core'
import { GraphQLError } from 'graphql'
import * as DB from 'safebyok/storage'
import { GraphQLVaultDB } from '../src/index'
import * as TH from './test-helpers'

TH.bootDatabaseFirst()

describe("GraphQLVaultDB over the typed schema", () => {
  TH.describeVaultDBBattery("GraphQLVaultDB", {
    makeVaultDB:          async (opts) => await TH.makeVaultDB(opts),
    makeCappedVaultDB:    async (maxBoxes) => await TH.makeVaultDB({}, maxBoxes),
    makeTwin:             TH.makeTwin,
    _cheat_rowsOf:        () => TH.rowsOf(),
    _cheat_failNextCall:  (vaultDB) => { vaultDB.failNext() },
    _cheat_storeOf:       TH.storeOf,
    boxNoticesCarryVault: false,
  })

  it("keeps a sidecar's own __typename while dropping the ones urql's cache adds", async () => {
    const vaultDB = await TH.makeVaultDB()
    await vaultDB.putVault(TH.vaultAt(), { prior: DB.VoidRevision })
    const sidecar = { __typename: 'Recipe', nested: { __typename: 'Step' } }
    await vaultDB.putBox(TH.boxAt(0, 'life1', { sidecar }), { prior: DB.VoidRevision })
    const { val, world } = await vaultDB.getBox(TH.boxQuery)
    expect(val?.sidecar).to.deep.eq(sidecar)
    expect(world).to.deep.eq(TH.vaultAt())
  })
})

// == [A client of its own]: FakeResult, fakeClient, gotNotice, revokedNotice

/** What one call of a fake client hands back, as urql's own `OperationResult` holds it. */
type FakeResult = { data?: unknown, error?: CombinedError, hasNext?: boolean }

/** A GraphQLVaultDB over a fake urql Client whose queries and mutations answer `asked`, and each of whose subscriptions hands the test its callback. */
const fakeClient = (asked: FakeResult = {}) => {
  const streams: ((result: FakeResult) => void)[] = []
  const client = {
    query:        () => ({ toPromise: () => Promise.resolve(asked) }),
    mutation:     () => ({ toPromise: () => Promise.resolve(asked) }),
    subscription: () => ({
      subscribe: (onResult: (result: FakeResult) => void) => {
        streams.push(onResult)
        return { unsubscribe: () => undefined }
      },
    }),
  }
  return { vaultDB: new GraphQLVaultDB({ client: client as never }), streams }
}

const gotNotice = { safebyokWatch: { __typename: 'SafebyokNotice', ok: true, act: 'got', val: { __typename: 'SafebyokVaultRecord', ...TH.vaultAt() }, world: null, err: null } }
const revokedNotice = { safebyokWatch: { ok: false, act: 'identity_revoked', val: null, world: null, err: { refusalkind: 'identity_revoked', message: 'Signed out', meta: null } } }
// --

describe("GraphQLVaultDB's constructor", () => {
  it("refuses a client it cannot use, or an option it does not take", () => {
    const client = new Client({ url: 'https://app.example.test/api/graphql', exchanges: [] })
    const unusable = [{}, { client: { query: () => client } }, { client: 'urql' }, { client, maxBoxes: 3 }, { client, maxRecordBytes: 0 }]
    for (const opts of unusable) { TH.expectSyncRefusal(() => new GraphQLVaultDB(opts as never), 'bad_option') }
  })

  it("sends a box over its own maxRecordBytes on to the server", async () => {
    const store = await TH.makeVaultDB()
    const vaultDB = TH.browserOver(TH.schemaOver(TH.storeOf(store)), TH.signedInAsAsked, { maxRecordBytes: 16 })
    await vaultDB.putVault(TH.vaultAt(), { prior: DB.VoidRevision })
    expect(await vaultDB.putBox(TH.boxAt(), { prior: DB.VoidRevision })).to.deep.include({ ok: true, act: 'born' })
  })
})

describe("GraphQLVaultDB's answers off the wire", () => {
  it("refuses a GraphQL error with no cause", async () => {
    const combined = new CombinedError({ graphQLErrors: [new GraphQLError('Cannot query field "safebyokGetVault" on type "Query".')] })
    const { vaultDB } = fakeClient({ error: combined })
    const answer = await vaultDB.tryGetVault(TH.vaultScope)
    expect(answer).to.deep.include({ ok: false, act: 'unexpected_error', world: null, req_params: TH.vaultScope })
    expect(DB.isVaultError(answer.err, 'unexpected_error')).to.be.true
    expect(answer.err?.cause).to.be.undefined
    expect(answer.err?.meta).to.deep.include({ call: 'getVault' })
    await TH.expectRefusal(vaultDB.getVault(TH.vaultScope), 'unexpected_error')
  })

  it("refuses a failed request with a cause holding the error's name, HTTP status and code alone", async () => {
    const networkError = new Error('{"whisper_ciphered":"the record sent"}', { cause: { code: 'ECONNRESET', detail: 'the record sent' } })
    const combined = new CombinedError({ networkError, response: { status: 502, body: 'the record sent' } })
    const { vaultDB } = fakeClient({ error: combined })
    const { err } = await vaultDB.tryGetVault(TH.vaultScope)
    expect(DB.isVaultError(err, 'storage_unavailable')).to.be.true
    const cause = err?.cause as Error
    expect(cause).not.to.be.instanceOf(CombinedError)
    expect(cause).to.include({ thrownName: 'Error', status: 502, code: 'ECONNRESET', message: 'A request to the GraphQL server failed: Error, HTTP 502, ECONNRESET.' })
    expect(cause.cause).to.be.undefined
    expect(JSON.stringify([cause.message, cause.stack, Object.entries(cause)])).not.to.include('the record sent')
  })

  it("names only the error a request failed on, where it has no status or code", async () => {
    const { vaultDB } = fakeClient({ error: new CombinedError({ networkError: new TypeError('Failed to fetch') }) })
    const { err } = await vaultDB.tryGetVault(TH.vaultScope)
    expect(err?.cause).to.deep.include({ thrownName: 'TypeError', message: 'A request to the GraphQL server failed: TypeError.' })
    expect(err?.cause).not.to.have.any.keys('status', 'code')
  })

  it("refuses a server serving some other schema", async () => {
    const { vaultDB } = fakeClient({ data: { somethingElse: 1 } })
    await TH.expectRefusal(vaultDB.listVaults(TH.bankScope), 'unexpected_error')
  })

  it("refuses a malformed request before sending it, as any store refuses one", async () => {
    const { vaultDB } = fakeClient({ data: null })
    await TH.expectRefusal(vaultDB.getVault({ ...TH.vaultScope, vaultlabel: '' }), 'bad_scope')
  })
})

describe("GraphQLVaultDB's watch", () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it("hears each notice once", () => {
    const { vaultDB, streams } = fakeClient()
    const heard: DB.Notice[] = []
    const stop = vaultDB.watch(TH.bankScope, (notice) => { heard.push(notice) })
    streams[0]?.({ data: gotNotice, hasNext: true })
    streams[0]?.({ data: gotNotice, hasNext: false })
    expect(heard).to.deep.eq([{ act: 'got', val: TH.vaultAt(), world: null }])
    stop()
  })

  it("subscribes again a second after a stream ends", async () => {
    const { vaultDB, streams } = fakeClient()
    const stop = vaultDB.watch(TH.bankScope, () => undefined)
    streams[0]?.({ data: gotNotice, hasNext: false })
    await vi.advanceTimersByTimeAsync(999)
    expect(streams).to.have.length(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(streams).to.have.length(2)
    stop()
  })

  it("never subscribes again once the server has revoked its identity", async () => {
    const { vaultDB, streams } = fakeClient()
    const heard: DB.Notice[] = []
    const stop = vaultDB.watch(TH.bankScope, (notice) => { heard.push(notice) })
    streams[0]?.({ data: revokedNotice, hasNext: false })
    await vi.advanceTimersByTimeAsync(5000)
    expect(streams).to.have.length(1)
    expect(heard).to.deep.eq([])
    stop()
  })

  it("never subscribes again once stopped, a pause pending", async () => {
    const { vaultDB, streams } = fakeClient()
    const stop = vaultDB.watch(TH.bankScope, () => undefined)
    streams[0]?.({ data: null, hasNext: false })
    stop()
    await vi.advanceTimersByTimeAsync(5000)
    expect(streams).to.have.length(1)
  })
})
