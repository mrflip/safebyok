/** vaultResolvers and VaultSchemaSdl: who reaches which bank, and what each answer carries over the wire. */

import { describe, expect, it, vi } from 'vitest'
import { buildSchema, graphql, isObjectType, parse, subscribe, validate } from 'graphql'
import type { GraphQLSchema } from 'graphql'
import { makeExecutableSchema } from '@graphql-tools/schema'
import * as DB from 'safebyok/storage'
import { PostgresVaultDB } from 'safebyok-postgres'
import type { PostgresListen } from 'safebyok-postgres'
import { VaultSchemaSdl, vaultResolvers } from '../src/server'
import { VaultOperations } from '../src/vault-operations'
import * as TH from './test-helpers'

TH.bootDatabaseFirst()

/** A store whose database is out of reach, its driver's error naming what a browser must never see. */
const unreachable = () => new PostgresVaultDB({ client: {
  query:       () => Promise.reject(new Error('connect ECONNREFUSED db.internal:5432 password=hunter2')),
  transaction: () => Promise.reject(new Error('connect ECONNREFUSED db.internal:5432 password=hunter2')),
} })

/** `val` as it arrives across a JSON wire. */
const overTheWire = (val: unknown): unknown => {
  const text = JSON.stringify(val)
  return JSON.parse(text) as unknown
}

/** What `source` answers at its one root field, run against `schema` signed in as `user_id`, through a JSON wire. */
const sent = async (schema: GraphQLSchema, source: string, variableValues: object, user_id: string | null = 'u1'): Promise<unknown> => {
  const result = await graphql({ schema, source, variableValues: { ...variableValues }, contextValue: { user_id } satisfies TH.TestContext })
  expect(result.errors, source).to.be.undefined
  const [answer] = Object.values(overTheWire(result.data) as Record<string, unknown>)
  return answer
}

/** A store's own answer as one crosses: dbhas null where it holds none. */
const asCrossed = (answer: DB.Answer<unknown, string, unknown>) => ({ ...answer, dbhas: answer.dbhas ?? null })

/** The gate verbs' params: the vault record, its gate holding only the wayin the verb moves. */
const gateParamsOf = (vault: DB.VaultRecord, gate: object) => ({ ...vault, gate })

/** A server whose watches are counted while they listen, and the store behind it. */
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
  const store = await TH.serverOver({ listen })
  return { listening, store, schema: TH.schemaOver(store) }
}

/** The notices a watch of `scope` hears through `schema`, for the session `context`, each as it crossed. */
const watching = async (schema: GraphQLSchema, context: TH.TestContext, scope: object = TH.bankScope) => {
  const stream = await subscribe({ schema, document: parse(VaultOperations.watch), variableValues: { ...scope }, contextValue: context })
  if (! ('next' in stream)) { throw new Error(`Expected a subscription, got ${JSON.stringify(stream)}`) }
  return {
    stream,
    nextNotice: async () => {
      const next = await stream.next()
      if (next.done === true) { return null }
      expect(next.value.errors).to.be.undefined
      return DB.crossedNotice.parse(overTheWire(next.value.data?.['safebyokWatch']))
    },
  }
}

describe("vaultResolvers", () => {
  it("refuses every verb of a request signed in as another user, or signed out", async () => {
    await TH.emptyTables()
    const schema = TH.schemaOver(await TH.serverOver())
    const record = TH.vaultAt()
    const box = TH.boxAt()
    const opts = { prior: DB.VoidRevision }
    const asked: [string, object, { parse: (crossed: unknown) => DB.Answer<unknown, string, unknown> }][] = [
      [VaultOperations.listVaults, TH.bankScope, DB.listVaultsAnswer],
      [VaultOperations.getVault, TH.vaultScope, DB.getVaultAnswer],
      [VaultOperations.listBoxes, TH.vaultQuery, DB.listBoxesAnswer],
      [VaultOperations.getBox, TH.boxQuery, DB.getBoxAnswer],
      [VaultOperations.putVault, { record, opts }, DB.putVaultAnswer],
      [VaultOperations.putBox, { record: box, opts }, DB.putBoxAnswer],
      [VaultOperations.replacePassphrase, { params: gateParamsOf(record, { passphrase_wayin: TH.passphraseWayin }) }, DB.replacePassphraseAnswer],
      [VaultOperations.addPasskey, { params: gateParamsOf(record, { passkey_wayin: TH.passkeyWayin }) }, DB.addPasskeyAnswer],
      [VaultOperations.revokePasskey, { params: gateParamsOf(record, { passkey_wayin: null }) }, DB.revokePasskeyAnswer],
      [VaultOperations.delBox, { tombstone: TH.boxTombstoneOf(box), opts }, DB.delBoxAnswer],
      [VaultOperations.delVault, { tombstone: TH.vaultTombstoneOf(record), opts }, DB.delVaultAnswer],
      [VaultOperations.tidyGone, TH.bankScope, DB.tidyGoneAnswer],
    ]
    for (const user_id of ['u2', null]) {
      for (const [source, variableValues, answerCheck] of asked) {
        const answer = answerCheck.parse(await sent(schema, source, variableValues, user_id)) as DB.BadAnswer
        expect(answer, source).to.deep.include({ ok: false, act: 'identity_revoked', world: null })
        expect(answer.err.refusalkind, source).to.eq('identity_revoked')
        expect(answer.req_params, source).to.include(TH.bankScope)
      }
    }
    expect(await TH.rowsOf().vaultRowOf(TH.vaultScope)).to.be.null
  })

  it("answers each verb as the store's own try* verb does", async () => {
    await TH.emptyTables()
    const store = await TH.serverOver()
    const schema = TH.schemaOver(store)
    const record = TH.vaultAt()
    const born = DB.putVaultAnswer.parse(await sent(schema, VaultOperations.putVault, { record, opts: { prior: DB.VoidRevision } }))
    expect(born).to.deep.include({ ok: true, act: 'born', val: record })
    expect(DB.getVaultAnswer.parse(await sent(schema, VaultOperations.getVault, TH.vaultScope))).to.deep.eq(asCrossed(await store.tryGetVault(TH.vaultScope)))
    expect(DB.listVaultsAnswer.parse(await sent(schema, VaultOperations.listVaults, TH.bankScope))).to.deep.eq(asCrossed(await store.tryListVaults(TH.bankScope)))

    const box = TH.boxAt(0, 'life1', { sidecar: { note: 'work', 'nested key': [1, { deep: null }] } })
    const boxed = DB.putBoxAnswer.parse(await sent(schema, VaultOperations.putBox, { record: box, opts: { prior: DB.VoidRevision } }))
    expect(boxed).to.deep.include({ ok: true, act: 'born', val: box, world: record })
    expect(DB.getBoxAnswer.parse(await sent(schema, VaultOperations.getBox, TH.boxQuery))).to.deep.eq(asCrossed(await store.tryGetBox(TH.boxQuery)))
    expect(DB.listBoxesAnswer.parse(await sent(schema, VaultOperations.listBoxes, TH.vaultQuery))).to.deep.eq(asCrossed(await store.tryListBoxes(TH.vaultQuery)))

    const replaced = DB.replacePassphraseAnswer.parse(await sent(schema, VaultOperations.replacePassphrase, { params: gateParamsOf(record, { passphrase_wayin: { ...TH.passphraseWayin, key_deriver_label: 'moved' } }) }))
    expect(replaced).to.deep.include({ ok: true, act: 'replaced' })
    const added = DB.addPasskeyAnswer.parse(await sent(schema, VaultOperations.addPasskey, { params: gateParamsOf(replaced.val as DB.VaultRecord, { passkey_wayin: TH.passkeyWayin }) }))
    expect(added.val).to.have.nested.property('gate.passkey_wayin.credential_id', TH.passkeyWayin.credential_id)
    const revoked = DB.revokePasskeyAnswer.parse(await sent(schema, VaultOperations.revokePasskey, { params: gateParamsOf(added.val as DB.VaultRecord, { passkey_wayin: null }) }))
    expect(revoked.val).to.have.nested.property('gate.passkey_wayin', null)

    const goneBox = DB.delBoxAnswer.parse(await sent(schema, VaultOperations.delBox, { tombstone: TH.boxTombstoneOf(box), opts: { prior: DB.revisionOf(box) } }))
    expect(goneBox).to.deep.include({ ok: true, val: TH.boxTombstoneOf(box) })
    const vault = revoked.val as DB.VaultRecord
    const goneVault = DB.delVaultAnswer.parse(await sent(schema, VaultOperations.delVault, { tombstone: TH.vaultTombstoneOf(vault), opts: { prior: DB.revisionOf(vault) } }))
    expect(goneVault).to.deep.include({ ok: true, val: TH.vaultTombstoneOf(vault) })
    const tidied = DB.tidyGoneAnswer.parse(await sent(schema, VaultOperations.tidyGone, TH.bankScope))
    expect(tidied).to.deep.include({ ok: true, act: 'tidied', val: { totalCount: 0 }, world: TH.bankScope })
  })

  it("takes the store's default for an option left out", async () => {
    await TH.emptyTables()
    const schema = TH.schemaOver(await TH.serverOver())
    const absent = DB.getVaultAnswer.parse(await sent(schema, VaultOperations.getVault, TH.vaultScope)) as DB.BadAnswer
    expect(absent.ok).to.be.false
    expect(DB.getVaultAnswer.parse(await sent(schema, VaultOperations.getVault, { ...TH.vaultScope, opts: { ifAbsent: 'nil' } }))).to.deep.include({ ok: true, val: null })
  })

  it("refuses an option sent as null", async () => {
    await TH.emptyTables()
    const schema = TH.schemaOver(await TH.serverOver())
    const nulled = DB.getVaultAnswer.parse(await sent(schema, VaultOperations.getVault, { ...TH.vaultScope, opts: { ifAbsent: null } })) as DB.BadAnswer
    expect(nulled.err.refusalkind).to.eq('bad_option')
  })

  it("sends a refusal as the answer's err with nothing of what the store's driver said", async () => {
    const crossed = await sent(TH.schemaOver(unreachable()), VaultOperations.getVault, TH.vaultScope)
    const answer = DB.getVaultAnswer.parse(crossed) as DB.BadAnswer
    expect(answer.err.refusalkind).to.eq('storage_unavailable')
    expect(answer.err.cause).to.be.undefined
    expect(JSON.stringify(crossed)).not.to.include('hunter2')
  })

  it("sends nothing of what a throwing userIdOf said", async () => {
    const schema = makeExecutableSchema({
      typeDefs:  VaultSchemaSdl,
      resolvers: vaultResolvers({ vaultDB: await TH.serverOver(), userIdOf: () => { throw new Error('session cookie s3cr3t-cookie is malformed') } }),
    })
    const crossed = await sent(schema, VaultOperations.getVault, TH.vaultScope)
    expect((DB.getVaultAnswer.parse(crossed) as DB.BadAnswer).err.refusalkind).to.eq('unexpected_error')
    expect(JSON.stringify(crossed)).not.to.include('s3cr3t')
  })

  it("refuses at the server what the browser's own checks would, for a browser that skipped them", async () => {
    await TH.emptyTables()
    const schema = TH.schemaOver(await TH.serverOver({ maxRecordBytes: 200 }))
    const born = DB.putVaultAnswer.parse(await sent(schema, VaultOperations.putVault, { record: TH.vaultAt(), opts: { prior: DB.VoidRevision } }))
    expect(born).to.have.property('ok', true)
    const heavy = DB.putBoxAnswer.parse(await sent(schema, VaultOperations.putBox, { record: TH.boxAt(), opts: { prior: DB.VoidRevision } })) as DB.BadAnswer
    expect(heavy.err.refusalkind).to.eq('box_too_large')
    const malformed = DB.putVaultAnswer.parse(await sent(schema, VaultOperations.putVault, { record: { ...TH.vaultAt(), am: 'q' }, opts: { prior: DB.VoidRevision } })) as DB.BadAnswer
    expect(malformed.err.refusalkind).to.eq('bad_option')
    expect(malformed.err.meta?.fieldnames).to.be.an('array').that.is.not.empty
  })

  it("sends a full vault's capacity in its err's meta", async () => {
    await TH.emptyTables()
    const schema = TH.schemaOver(await TH.serverOver({ maxBoxes: 1 }))
    const opts = { prior: DB.VoidRevision }
    await sent(schema, VaultOperations.putVault, { record: TH.vaultAt(), opts })
    await sent(schema, VaultOperations.putBox, { record: TH.boxAt(), opts })
    const second = TH.boxAt(0, 'life1', { boxlabel: 'anthropic', box_tok: 'box2' })
    const full = DB.putBoxAnswer.parse(await sent(schema, VaultOperations.putBox, { record: second, opts })) as DB.BadAnswer
    expect(full.err.refusalkind).to.eq('vault_full')
    expect(full.err.meta?.capacity).to.deep.eq({ boxes: { used: 1, max: 1 }, bytes: { used: 0, max: Number.MAX_SAFE_INTEGER } })
  })

  it("refuses a vaultDB or userIdOf it cannot use", async () => {
    const vaultDB = await TH.serverOver()
    const unusable = [{}, { vaultDB }, { vaultDB: {}, userIdOf: () => 'u1' }, { vaultDB, userIdOf: 'u1' }]
    for (const opts of unusable) { TH.expectSyncRefusal(() => vaultResolvers(opts as never), 'bad_option') }
  })
})

describe("vaultResolvers' watch", () => {
  it("hears each row that changes while the session that subscribed stays signed in as its user", async () => {
    await TH.emptyTables()
    const { listening, store, schema } = await watchedServer()
    const { stream, nextNotice } = await watching(schema, { user_id: 'u1' })
    await store.putVault(TH.vaultAt(), { prior: DB.VoidRevision })
    expect(await nextNotice()).to.deep.eq({ ok: true, val: { act: 'got', val: TH.vaultAt(), world: TH.vaultAt() } })
    await store.putBox(TH.boxAt(), { prior: DB.VoidRevision })
    expect(await nextNotice()).to.have.nested.property('val.val.boxlabel', TH.boxAt().boxlabel)
    expect(listening.size).to.eq(1)
    await stream.return(undefined)
  })

  it("lets go of its listen when ended", async () => {
    await TH.emptyTables()
    const { listening, schema } = await watchedServer()
    const { stream } = await watching(schema, { user_id: 'u1' })
    await vi.waitFor(() => { expect(listening.size).to.eq(1) })
    await stream.return(undefined)
    await vi.waitFor(() => { expect(listening.size).to.eq(0) })
  })

  it("ends once its session is signed out or in as another user", async () => {
    for (const revoked of ['u2', null]) {
      await TH.emptyTables()
      const { listening, store, schema } = await watchedServer()
      const session: TH.TestContext = { user_id: 'u1' }
      const { nextNotice } = await watching(schema, session)
      await store.putVault(TH.vaultAt(), { prior: DB.VoidRevision })
      expect(await nextNotice()).to.have.property('ok', true)
      session.user_id = revoked
      await store.putBox(TH.boxAt(), { prior: DB.VoidRevision })
      expect(await nextNotice()).to.have.nested.property('err.refusalkind', 'identity_revoked')
      expect(await nextNotice()).to.be.null
      await vi.waitFor(() => { expect(listening.size).to.eq(0) })
    }
  })

  it("ends with a refusal carrying nothing of what its throwing userIdOf said", async () => {
    await TH.emptyTables()
    const { listening, store, schema } = await watchedServer()
    const session: TH.TestContext = { user_id: 'u1' }
    const { stream } = await watching(schema, session)
    Object.defineProperty(session, 'user_id', { get: () => { throw new Error('session store s3cr3t-host is down') } })
    await store.putVault(TH.vaultAt(), { prior: DB.VoidRevision })
    const last = await stream.next()
    expect(JSON.stringify(last)).not.to.include('s3cr3t')
    expect(DB.crossedNotice.parse(overTheWire(last.value?.data?.['safebyokWatch']))).to.have.nested.property('err.refusalkind', 'unexpected_error')
    expect(await stream.next()).to.have.property('done', true)
    await vi.waitFor(() => { expect(listening.size).to.eq(0) })
  })

  it("ends a watch it refuses after one notice", async () => {
    const { listening, schema } = await watchedServer()
    for (const [context, scope, refusalkind] of [[{ user_id: 'u2' }, TH.bankScope, 'identity_revoked'], [{ user_id: 'u1' }, { ...TH.bankScope, applabel: '' }, 'bad_scope']] as const) {
      const { nextNotice } = await watching(schema, context, scope)
      expect(await nextNotice()).to.have.nested.property('err.refusalkind', refusalkind)
      expect(await nextNotice()).to.be.null
    }
    expect(listening.size).to.eq(0)
  })
})

describe("VaultSchemaSdl", () => {
  const schema = buildSchema(VaultSchemaSdl)

  it("builds alone, every root field it adds named safebyok...", () => {
    const rootFields = [schema.getQueryType(), schema.getMutationType(), schema.getSubscriptionType()]
      .flatMap((root) => (isObjectType(root) ? Object.keys(root.getFields()) : []))
    expect(rootFields).to.have.lengthOf(13)
    for (const fieldname of rootFields) { expect(fieldname).to.match(/^safebyok[A-Z]/) }
  })

  it("takes every operation a client sends", () => {
    for (const document of Object.values(VaultOperations)) { expect(validate(schema, parse(document))).to.deep.eq([]) }
  })

  it("carries a time past 32 bits", async () => {
    await TH.emptyTables()
    const executable = TH.schemaOver(await TH.serverOver())
    const later = TH.vaultAt(0, 'life1', { registered_at: 2 ** 41, written_at: 2 ** 41 })
    const born = DB.putVaultAnswer.parse(await sent(executable, VaultOperations.putVault, { record: later, opts: { prior: DB.VoidRevision } }))
    expect(born.val).to.have.property('written_at', 2 ** 41)
  })

  it("refuses a time that is not a safe integer", async () => {
    await TH.emptyTables()
    const executable = TH.schemaOver(await TH.serverOver())
    const later = TH.vaultAt(0, 'life1', { registered_at: 2 ** 41, written_at: 2 ** 41 })
    const fractional = await graphql({ schema: executable, source: VaultOperations.putVault, variableValues: { record: { ...later, written_at: 1.5 }, opts: { prior: DB.VoidRevision } }, contextValue: { user_id: 'u1' } })
    expect(fractional.errors).to.have.lengthOf(1)
  })
})
