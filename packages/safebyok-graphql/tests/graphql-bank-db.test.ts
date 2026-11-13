/** GraphQLBankDB calling the resolvers in-process, backed by a PostgresBankDB on PGlite: the battery every bankDB runs. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Client, CombinedError } from '@urql/core'
import { GraphQLError } from 'graphql'
import * as DB from 'safebyok/storage'
import type { BX } from 'safebyok/storage'
import { GraphQLBankDB } from '../src/index'
import * as TH from './test-helpers'

TH.bootDatabaseFirst()

describe("GraphQLBankDB over the typed schema", () => {
  TH.describeBankDBBattery("GraphQLBankDB", {
    makeBankDB:            async (opts) => await TH.makeBankDB(opts),
    makeCappedBankDB:      async (maxBoxes) => await TH.makeBankDB({ maxBoxes }),
    makeTwin:              TH.makeTwin,
    makeBankDBFor:         async () => {
      await TH.emptyTables()
      const schema = TH.schemaOver(await TH.serverOver())
      return (user_id) => TH.browserOver(schema, TH.signedInAs(user_id))
    },
    _cheat_rowsOf:         () => TH.rowsOf(),
    _cheat_failNextCall:   (bankDB) => { bankDB.failNext() },
    _cheat_adapterOf:      TH.adapterOf,
    _cheat_storeOtherwise: TH.storeOtherwise,
  })

  it("keeps a sidecar's own __typename while dropping the ones urql's cache adds", async () => {
    const bankDB = await TH.makeBankDB()
    await bankDB.buildBank(TH.BW.bankBuildAskOf())
    await bankDB.putVault(TH.BW.vaultPutAskOf(TH.BW.vaultAt()))
    const sidecar = { __typename: 'Recipe', nested: { __typename: 'Step' } }
    await bankDB.putBox(TH.BW.boxPutAskOf(TH.BW.boxAt(0, 'bank1', 'life1', { sidecar })))
    const { val, parent } = await bankDB.getBox(TH.BW.boxGetAskOf())
    expect(val).to.have.deep.property('sidecar', sidecar)
    expect(parent).to.deep.eq(TH.BW.vaultAt())
  })

  it("answers a gate with no passkey wayin without its passkey0, and one with it whole", async () => {
    const bankDB = await TH.makeBankDB()
    const { val: built } = await bankDB.buildBank(TH.BW.bankBuildAskOf())
    expect(built).to.deep.eq(TH.BW.gateAt())
    const wayins = { main: TH.BW.mainWayin, passkey0: TH.BW.passkey0Wayin }
    const { val: added } = await bankDB.addPasskey(TH.BW.gatePutAskOf(built, wayins))
    expect(added.wayins).to.deep.eq(wayins)
    const { val: ensured } = await bankDB.ensureBank(TH.BW.bankEnsureAsk)
    expect(ensured?.gates.main).to.deep.eq(added)
  })
})

// == [A client of its own]: FakeResult, fakeClient, gotNotice, revokedNotice

/** The result one call of a fake client returns, shaped like urql's `OperationResult`. */
type FakeResult = { data?: unknown, error?: CombinedError, hasNext?: boolean }

/** Make a GraphQLBankDB on a fake urql Client. Queries and mutations resolve `asked`.
 * Each subscription's callback is pushed to `streams` for the test to call, after first receiving `atOnce` if given.
 * `counts.unsubscribed` counts the unsubscribes.
 */
function fakeClient(asked: FakeResult = {}, atOnce?: FakeResult) {
  const streams: ((result: FakeResult) => void)[] = []
  const counts = { unsubscribed: 0 }
  const client = {
    query:        () => ({ toPromise: () => Promise.resolve(asked) }),
    mutation:     () => ({ toPromise: () => Promise.resolve(asked) }),
    subscription: () => ({
      subscribe: (onResult: (result: FakeResult) => void) => {
        streams.push(onResult)
        if (atOnce !== undefined) { onResult(atOnce) }
        return { unsubscribe: () => { counts.unsubscribed += 1 } }
      },
    }),
  }
  return { bankDB: new GraphQLBankDB({ client: client as never }), streams, counts }
}

/** Start a watch on a fake client, collecting its notices in `heard` and its bad news in `badnews`. */
function watched(atOnce?: FakeResult) {
  const { bankDB, streams, counts } = fakeClient({}, atOnce)
  const heard: BX.Notice[] = []
  const badnews: DB.VaultError[] = []
  const stop = bankDB.watch(TH.BW.bankScope, (notice) => { heard.push(notice) }, (news) => { badnews.push(news) })
  return { streams, counts, heard, badnews, stop }
}

const gotNotice = { safebyokWatch: { __typename: 'SafebyokNotice', ok: true, act: 'gotlive', val: { __typename: 'SafebyokVaultRow', ...TH.BW.vaultAt() }, parent: null, err: null } }
const revokedNotice = { safebyokWatch: { ok: false, act: 'unclassified_storing', val: null, parent: null, err: { refusalkind: 'identity_revoked', message: 'Signed out', meta: null } } }
// --

describe("GraphQLBankDB's constructor", () => {
  it("refuses a client it cannot use, or an option it does not accept", () => {
    const client = new Client({ url: 'https://app.example.test/api/graphql', exchanges: [] })
    const unusable = [{}, { client: { query: () => client } }, { client: 'urql' }, { client, maxRecordSizeEst: 0 }]
    for (const opts of unusable) { TH.expectSyncRefusal(() => new GraphQLBankDB(opts as never), 'bad_option') }
  })
})

describe("GraphQLBankDB's brands", () => {
  it("is a bankDB and not an AdapterBankDB", () => {
    const bankDB = new GraphQLBankDB({ client: new Client({ url: 'https://app.example.test/api/graphql', exchanges: [] }) })
    expect(DB.isBankDB(bankDB)).to.be.true
    expect(DB.isAdapterBankDB(bankDB)).to.be.false
  })
})

describe("GraphQLBankDB's answers off the wire", () => {
  it("refuses a GraphQL error with no cause", async () => {
    const combined = new CombinedError({ graphQLErrors: [new GraphQLError('Cannot query field "safebyokGetVault" on type "Query".')] })
    const { bankDB } = fakeClient({ error: combined })
    const answer = await bankDB.tryGetVault(TH.BW.vaultGetAskOf())
    expect(answer).to.deep.include({ ok: false, act: 'unclassified_storing', parent: null }).and.to.have.nested.property('err.refusalkind', 'unexpected_error')
    expect(answer.ask).to.deep.include(TH.BW.vaultScope)
    expect(DB.isVaultError(answer.err, 'unexpected_error')).to.be.true
    expect(answer.err?.cause).to.be.undefined
    expect(answer.err?.meta).to.deep.include({ oplabel: 'getVault' })
    await TH.expectRefusal(bankDB.getVault(TH.BW.vaultGetAskOf()), 'unexpected_error')
  })

  it("refuses a failed request with a cause that carries only the error's name, HTTP status and code", async () => {
    const networkError = new Error('{"whisper_ciphered":"the record sent"}', { cause: { code: 'ECONNRESET', detail: 'the record sent' } })
    const combined = new CombinedError({ networkError, response: { status: 502, body: 'the record sent' } })
    const { bankDB } = fakeClient({ error: combined })
    const { err } = await bankDB.tryGetVault(TH.BW.vaultGetAskOf())
    expect(DB.isVaultError(err, 'storage_unavailable')).to.be.true
    const cause = err?.cause as Error
    expect(cause).not.to.be.instanceOf(CombinedError)
    expect(cause).to.include({ thrownName: 'Error', status: 502, code: 'ECONNRESET', message: 'A request to the GraphQL server failed: Error, HTTP 502, ECONNRESET.' })
    expect(cause.cause).to.be.undefined
    expect(JSON.stringify([cause.message, cause.stack, Object.entries(cause)])).not.to.include('the record sent')
  })

  it("names only the error a request failed on, where it has no status or code", async () => {
    const { bankDB } = fakeClient({ error: new CombinedError({ networkError: new TypeError('Failed to fetch') }) })
    const { err } = await bankDB.tryGetVault(TH.BW.vaultGetAskOf())
    expect(err?.cause).to.deep.include({ thrownName: 'TypeError', message: 'A request to the GraphQL server failed: TypeError.' })
    expect(err?.cause).not.to.have.any.keys('status', 'code')
  })

  it("refuses a server serving some other schema", async () => {
    const { bankDB } = fakeClient({ data: { somethingElse: 1 } })
    await TH.expectRefusal(bankDB.ensureBank(TH.BW.bankEnsureAsk), 'unexpected_error')
  })

  it("refuses a malformed ask before sending it", async () => {
    const { bankDB } = fakeClient({ data: null })
    await TH.expectRefusal(bankDB.getVault({ ...TH.BW.vaultGetAskOf(), vaultlabel: '' }), 'bad_record')
  })
})

describe("GraphQLBankDB's watch", () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it("delivers each notice once", () => {
    const { streams, heard, stop } = watched()
    streams[0]?.({ data: gotNotice, hasNext: true })
    streams[0]?.({ data: gotNotice, hasNext: false })
    expect(heard).to.deep.eq([{ act: 'gotlive', val: TH.BW.vaultAt(), parent: null }])
    stop()
  })

  it("reports once a stream the server ends, and does not resubscribe", async () => {
    const { streams, counts, badnews, stop } = watched()
    streams[0]?.({ data: gotNotice, hasNext: false })
    streams[0]?.({ data: null, hasNext: false })
    await vi.advanceTimersByTimeAsync(60_000)
    stop()
    expect(streams).to.have.length(1)
    expect(badnews).to.have.length(1)
    expect(badnews[0]).to.include({ refusalkind: 'storage_unavailable', message: DB.WatchEnded })
    expect(badnews[0]?.meta).to.deep.eq({ oplabel: 'watch' })
    expect(counts.unsubscribed).to.be.greaterThanOrEqual(1)
  })

  it("reports a failed request once, with a cause that names only the error", () => {
    const { streams, badnews } = watched()
    streams[0]?.({ error: new CombinedError({ networkError: new TypeError('Failed to fetch') }), hasNext: false })
    expect(badnews).to.have.length(1)
    expect(badnews[0]?.refusalkind).to.eq('storage_unavailable')
    expect(badnews[0]?.cause).to.include({ thrownName: 'TypeError' })
  })

  it("reports a GraphQL error once and stops the stream", () => {
    const { streams, counts, heard, badnews } = watched()
    streams[0]?.({ error: new CombinedError({ graphQLErrors: [new GraphQLError('Cannot query field')] }), hasNext: true })
    streams[0]?.({ data: gotNotice, hasNext: true })
    expect(badnews).to.have.length(1)
    expect(badnews[0]).to.include({ refusalkind: 'unexpected_error', message: DB.SchemaNotServed })
    expect(badnews[0]?.cause).to.be.undefined
    expect(heard).to.deep.eq([])
    expect(counts.unsubscribed).to.eq(1)
  })

  it("reports nothing when the server ends the stream for a revoked identity, and does not resubscribe", async () => {
    const { streams, heard, badnews, stop } = watched()
    streams[0]?.({ data: revokedNotice, hasNext: false })
    await vi.advanceTimersByTimeAsync(60_000)
    stop()
    expect(streams).to.have.length(1)
    expect(heard).to.deep.eq([])
    expect(badnews).to.deep.eq([])
  })

  it("passes on unchanged the refusal that ends a stream", () => {
    const { streams, badnews } = watched()
    const scopeNotice = { safebyokWatch: { ok: false, act: 'unclassified_storing', val: null, parent: null, err: { refusalkind: 'bad_scope', message: 'No such scope', meta: null } } }
    streams[0]?.({ data: scopeNotice, hasNext: true })
    streams[0]?.({ data: scopeNotice, hasNext: false })
    expect(badnews).to.have.length(1)
    expect(badnews[0]).to.include({ refusalkind: 'bad_scope', message: 'No such scope' })
  })

  it("reports nothing when a stream ends after it was stopped", () => {
    const { streams, counts, badnews, stop } = watched()
    stop()
    streams[0]?.({ data: null, hasNext: false })
    expect(badnews).to.deep.eq([])
    expect(counts.unsubscribed).to.eq(1)
  })

  it("reports once a stream that ends as soon as it starts", () => {
    const { counts, badnews, stop } = watched({ data: null, hasNext: false })
    expect(badnews).to.have.length(1)
    expect(counts.unsubscribed).to.eq(1)
    stop()
    expect(badnews).to.have.length(1)
  })
})
