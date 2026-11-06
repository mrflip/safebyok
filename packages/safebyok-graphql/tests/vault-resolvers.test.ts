/** vaultResolvers and VaultSchemaSdl: who reaches which bank, and what a refusal carries over the wire. */

import { describe, expect, it, vi } from 'vitest'
import { buildSchema, graphql, isObjectType, parse, subscribe, validate } from 'graphql'
import type { ExecutionResult, GraphQLSchema } from 'graphql'
import { makeExecutableSchema } from '@graphql-tools/schema'
import * as SX from 'safebyok/storage'
import { PostgresVaultDB } from 'safebyok-postgres'
import type { PostgresListen } from 'safebyok-postgres'
import { VaultOperations } from '../src/index'
import { VaultSchemaSdl, vaultResolvers } from '../src/server'
import * as TH from './test-helpers'

TH.bootDatabaseFirst()

/** A store whose database is out of reach, its driver's error naming what a browser must never see. */
const unreachable = () => new PostgresVaultDB({ client: {
  query:       () => Promise.reject(new Error('connect ECONNREFUSED db.internal:5432 password=hunter2')),
  transaction: () => Promise.reject(new Error('connect ECONNREFUSED db.internal:5432 password=hunter2')),
} })

/** A server whose watches are counted while they listen, and a session whose user_id a test may revoke. */
const watchedServer = async () => {
  const listening = new Set<unknown>()
  const listen: PostgresListen = async (channel, onNotify) => {
    const unlisten = await TH.listen(channel, onNotify)
    listening.add(onNotify)
    return () => {
      listening.delete(onNotify)
      return unlisten()
    }
  }
  const session: TH.TestContext = { user_id: 'u1' }
  const schema = TH.schemaOver(await TH.serverOver({ listen }))
  const heard = await subscribe({ schema, document: parse(VaultOperations.heard), variableValues: TH.bankScope, contextValue: session })
  if (! ('next' in heard)) { throw new Error(`Expected a subscription, got ${JSON.stringify(heard)}`) }
  return { listening, session, heard, browser: TH.browserOver(schema, TH.signedInAs('u1')) }
}

/** `source` run against `schema` as the server runs it, signed in as u1. */
const served = async (schema: GraphQLSchema, source: string, variableValues: Record<string, unknown>): Promise<ExecutionResult> => (
  await graphql({ schema, source, variableValues, contextValue: { user_id: 'u1' } satisfies TH.TestContext })
)

describe("vaultResolvers", () => {
  it("refuses every call of a request signed in as another user, or signed out, and stores nothing", async () => {
    await TH.emptyTables()
    const schema = TH.schemaOver(await TH.serverOver())
    for (const signing of [TH.signedInAs('u2'), TH.signedInAs(null)]) {
      const browser = TH.browserOver(schema, signing)
      await TH.expectRefusal(browser.listVaults(TH.bankScope), 'identity_revoked')
      await TH.expectRefusal(browser.getVault(TH.vaultScope), 'identity_revoked')
      await TH.expectRefusal(browser.putVault(TH.vaultAt(), { prior: SX.VoidRevision }), 'identity_revoked')
      await TH.expectRefusal(browser.tidyGone(TH.bankScope), 'identity_revoked')
    }
    expect(await TH.rowsOf().vaultRowOf(TH.vaultScope)).to.be.null
  })

  it("refuses each query and mutation that reaches another user's bank", async () => {
    const schema = TH.schemaOver(await TH.serverOver())
    const record = TH.vaultAt()
    const box = TH.boxAt()
    const opts = { prior: SX.VoidRevision }
    const sent: [string, Record<string, unknown>][] = [
      [VaultOperations.listVaults, TH.bankScope],
      [VaultOperations.getVault, TH.vaultScope],
      [VaultOperations.listBoxes, TH.vaultQuery],
      [VaultOperations.getBox, TH.boxQuery],
      [VaultOperations.putVault, { record, opts }],
      [VaultOperations.putBox, { record: box, opts }],
      [VaultOperations.delVault, { tombstone: TH.vaultTombstoneOf(record), opts }],
      [VaultOperations.delBox, { tombstone: TH.boxTombstoneOf(box), opts }],
      [VaultOperations.tidyGone, TH.bankScope],
    ]
    for (const [source, variableValues] of sent) {
      const result = await graphql({ schema, source, variableValues, contextValue: { user_id: 'u2' } satisfies TH.TestContext })
      expect(result, source).to.have.nested.property('errors[0].extensions.kind', 'identity_revoked')
    }
  })

  it("serves a request signed in as the user it asks for", async () => {
    await TH.emptyTables()
    const browser = TH.browserOver(TH.schemaOver(await TH.serverOver()), TH.signedInAs('u1'))
    await browser.putVault(TH.vaultAt(), { prior: SX.VoidRevision })
    expect(await TH.rowsOf().vaultRowOf(TH.vaultScope)).to.deep.eq(TH.vaultAt())
  })

  it("refuses a subscription to another user's bank", async () => {
    const schema = TH.schemaOver(await TH.serverOver())
    const heard = await subscribe({ schema, document: parse(VaultOperations.heard), variableValues: TH.bankScope, contextValue: { user_id: 'u2' } })
    expect(heard).to.have.nested.property('errors[0].extensions.kind', 'identity_revoked')
  })

  it("hears on while the session that subscribed stays signed in as its user", async () => {
    await TH.emptyTables()
    const { listening, heard, browser } = await watchedServer()
    await browser.putVault(TH.vaultAt(), { prior: SX.VoidRevision })
    expect(await heard.next()).to.have.property('done', false)
    await browser.putBox(TH.boxAt(), { prior: SX.VoidRevision })
    expect(await heard.next()).to.have.property('done', false)
    expect(listening.size).to.eq(1)
    await heard.return(undefined)
    await vi.waitFor(() => { expect(listening.size).to.eq(0) })
  })

  it("ends a subscription once its session is signed out or in as another user", async () => {
    for (const revoked of ['u2', null]) {
      await TH.emptyTables()
      const { listening, session, heard, browser } = await watchedServer()
      await browser.putVault(TH.vaultAt(), { prior: SX.VoidRevision })
      expect(await heard.next()).to.have.property('done', false)
      session.user_id = revoked
      await browser.putBox(TH.boxAt(), { prior: SX.VoidRevision })
      expect(await heard.next()).to.deep.eq({ done: true, value: undefined })
      await vi.waitFor(() => { expect(listening.size).to.eq(0) })
      await heard.return(undefined)
    }
  })

  it("ends a subscription once its userIdOf throws", async () => {
    await TH.emptyTables()
    const { listening, session, heard, browser } = await watchedServer()
    Object.defineProperty(session, 'user_id', { get: () => { throw new Error('session store s3cr3t-host is down') } })
    await browser.putVault(TH.vaultAt(), { prior: SX.VoidRevision })
    let ended: unknown = null
    try { await heard.next() } catch (err) { ended = err }
    expect(ended).to.have.nested.property('extensions.kind', 'unexpected_error')
    expect(JSON.stringify(ended)).not.to.include('s3cr3t')
    await vi.waitFor(() => { expect(listening.size).to.eq(0) })
  })

  it("sends a refusal's kind and message, never what the store's driver said", async () => {
    const schema = TH.schemaOver(unreachable())
    const result = await served(schema, VaultOperations.getVault, TH.vaultScope)
    expect(result.errors?.[0]?.extensions).to.deep.eq({ kind: 'storage_unavailable' })
    expect(JSON.stringify(result)).not.to.include('hunter2')
    await TH.expectBad(TH.browserOver(schema).tryGetVault(TH.vaultScope), 'storage_unavailable')
  })

  it("sends nothing of what a throwing userIdOf said", async () => {
    const schema = makeExecutableSchema({
      typeDefs:  VaultSchemaSdl,
      resolvers: vaultResolvers({ vaultDB: await TH.serverOver(), userIdOf: () => { throw new Error('session cookie s3cr3t-cookie is malformed') } }),
    })
    const result = await served(schema, VaultOperations.getVault, TH.vaultScope)
    expect(result.errors?.[0]?.extensions).to.deep.eq({ kind: 'unexpected_error' })
    expect(JSON.stringify(result)).not.to.include('s3cr3t')
  })

  it("refuses at the server what the browser's own checks would, for a browser that skipped them", async () => {
    await TH.emptyTables()
    const schema = TH.schemaOver(await TH.serverOver({ maxRecordBytes: 200 }))
    const browser = TH.browserOver(schema)
    await browser.putVault(TH.vaultAt(), { prior: SX.VoidRevision })
    await TH.expectRefusal(browser.putBox(TH.boxAt(), { prior: SX.VoidRevision }), 'box_too_large')
    const malformed = await served(schema, VaultOperations.putVault, { record: { ...TH.vaultAt(), user_id: 'u1', am: 'q' }, opts: { prior: SX.VoidRevision } })
    expect(malformed).to.have.nested.property('errors[0].extensions.kind', 'bad_option')
  })

  it("sends a full vault's capacity beside its kind", async () => {
    await TH.emptyTables()
    const schema = TH.schemaOver(await TH.serverOver({ maxBoxes: 1 }))
    const browser = TH.browserOver(schema)
    await browser.putVault(TH.vaultAt(), { prior: SX.VoidRevision })
    await browser.putBox(TH.boxAt(), { prior: SX.VoidRevision })
    const second = TH.boxAt(0, 'life1', { boxlabel: 'anthropic', box_tok: 'box2' })
    const full = await TH.expectBad(browser.tryPutBox(second, { prior: SX.VoidRevision }), 'vault_full')
    expect(full.meta?.capacity).to.deep.eq({ boxes: { used: 1, max: 1 }, bytes: { used: 0, max: Number.MAX_SAFE_INTEGER } })
  })

  it("refuses a vaultDB or userIdOf it cannot use", async () => {
    const vaultDB = await TH.serverOver()
    const unusable = [{}, { vaultDB }, { vaultDB: {}, userIdOf: () => 'u1' }, { vaultDB, userIdOf: 'u1' }]
    for (const opts of unusable) { TH.expectSyncRefusal(() => vaultResolvers(opts as never), 'bad_option') }
  })
})

describe("VaultSchemaSdl", () => {
  const schema = buildSchema(VaultSchemaSdl)

  it("builds alone, every root field it adds named safebyok...", () => {
    const rootFields = [schema.getQueryType(), schema.getMutationType(), schema.getSubscriptionType()]
      .flatMap((root) => (isObjectType(root) ? Object.keys(root.getFields()) : []))
    expect(rootFields).to.have.lengthOf(10)
    for (const fieldname of rootFields) { expect(fieldname).to.match(/^safebyok[A-Z]/) }
  })

  it("takes every operation GraphQLVaultDB sends", () => {
    for (const document of Object.values(VaultOperations)) { expect(validate(schema, parse(document))).to.deep.eq([]) }
  })
})
