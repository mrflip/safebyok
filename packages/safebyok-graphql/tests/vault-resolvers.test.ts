/** vaultResolvers and VaultSchemaSdl: which user can reach which bank, and what each answer contains on the wire. */

import { describe, expect, it, vi } from 'vitest'
import { Client } from '@urql/core'
import { buildSchema, graphql, isObjectType, parse, subscribe, validate } from 'graphql'
import type { GraphQLSchema } from 'graphql'
import { makeExecutableSchema } from '@graphql-tools/schema'
import * as DB from 'safebyok/storage'
import { PostgresVaultDB } from 'safebyok-postgres'
import type { PostgresListen } from 'safebyok-postgres'
import { VaultSchemaSdl, vaultResolvers } from '../src/server'
import { GraphQLVaultDB } from '../src/index'
import { VaultOperations } from '../src/vault-operations'
import * as TH from './test-helpers'

TH.bootDatabaseFirst()

/** A VaultDB whose database is unreachable. Its driver's error contains text that must never reach a browser. */
const unreachable = () => new PostgresVaultDB({ client: {
  query:       () => Promise.reject(new Error('connect ECONNREFUSED db.internal:5432 password=hunter2')),
  transaction: () => Promise.reject(new Error('connect ECONNREFUSED db.internal:5432 password=hunter2')),
} })

/** Round-trip `val` through JSON, as the wire would. */
const overTheWire = (val: unknown): unknown => {
  const text = JSON.stringify(val)
  return JSON.parse(text) as unknown
}

/** Run `source` against `schema` signed in as `user_id`, and return its one root field's answer after a JSON round trip. */
const sent = async (schema: GraphQLSchema, source: string, variableValues: object, user_id: string | null = 'u1'): Promise<unknown> => {
  const result = await graphql({ schema, source, variableValues: { ...variableValues }, contextValue: { user_id } satisfies TH.TestContext })
  expect(result.errors, source).to.be.undefined
  const [answer] = Object.values(overTheWire(result.data) as Record<string, unknown>)
  return answer
}

/** A get's, put's or del's variables: its ask as its checker hands it on, the form GraphQLVaultDB sends. */
function askVarsOf(ask: DB.VaultAsk | DB.BoxAsk) {
  return { ask: ('boxlabel' in ask) ? DB.boxAsk.parse(ask) : DB.vaultAsk.parse(ask) }
}

/** Send `ask` as the get, put or del `source` is, through `schema`, and return its answer as {@link sent} does. */
async function sentAsk(schema: GraphQLSchema, source: string, ask: DB.VaultAsk | DB.BoxAsk): Promise<unknown> {
  return await sent(schema, source, askVarsOf(ask))
}

// The asks of u1's vault and box that the cases send: a get by a caller that holds no row, and a put over none.
const vaultGetAsk = TH.vaultGetAskOf()
const boxGetAsk   = TH.boxGetAskOf()
const vaultBorn   = TH.vaultPutAskOf(TH.vaultAt())
const boxBorn     = TH.boxPutAskOf(TH.boxAt())

/** A VaultDB's answer in wire form: `dbhas` is null when the answer has none. */
const asCrossed = (answer: DB.Answer<unknown, string, unknown>) => ({ ...answer, dbhas: answer.dbhas ?? null })

/** Build a gate verb's arguments from `vault`: the next record, with `moved` merged into its gate and `gate_epoch` plus one, and `prior` set to the revision it replaces. */
const gateArgsOf = (vault: DB.VaultRecord, moved: object) => {
  const prior = DB.revisionOf(vault)
  return { record: { ...vault, ...DB.nextRevisionOf(prior, vault.written_at + 1), gate: { ...vault.gate, gate_epoch: vault.gate.gate_epoch + 1, ...moved } }, opts: { prior } }
}

/** Make a server and its VaultDB. `listening` holds the watch callbacks that are currently listening. */
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
  const vaultDB = await TH.serverOver({ listen })
  return { listening, vaultDB, schema: TH.schemaOver(vaultDB) }
}

/** Subscribe to a watch of `scope` through `schema` as the session `context`. `nextNotice` returns the next notice parsed from the wire, or null when the stream ends. */
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
    const asked: [string, object, { parse: (crossed: unknown) => DB.Answer<unknown, string, unknown> }][] = [
      [VaultOperations.listVaults, TH.bankScope, DB.listVaultsAnswer],
      [VaultOperations.getVault, askVarsOf(vaultGetAsk), DB.getVaultAnswer],
      [VaultOperations.listBoxes, TH.vaultQuery, DB.listBoxesAnswer],
      [VaultOperations.getBox, askVarsOf(boxGetAsk), DB.getBoxAnswer],
      [VaultOperations.putVault, askVarsOf(TH.vaultPutAskOf(record)), DB.putVaultAnswer],
      [VaultOperations.putBox, askVarsOf(TH.boxPutAskOf(box)), DB.putBoxAnswer],
      [VaultOperations.replacePassphrase, gateArgsOf(record, { passphrase_wayin: TH.passphraseWayin }), DB.replacePassphraseAnswer],
      [VaultOperations.addPasskey, gateArgsOf(record, { passkey_wayin: TH.passkeyWayin }), DB.addPasskeyAnswer],
      [VaultOperations.revokePasskey, gateArgsOf(record, { passkey_wayin: null }), DB.revokePasskeyAnswer],
      [VaultOperations.delBox, askVarsOf(TH.boxDelAskOf(box)), DB.delBoxAnswer],
      [VaultOperations.delVault, askVarsOf(TH.vaultDelAskOf(record)), DB.delVaultAnswer],
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

  it("refuses a malformed request signed in as another user for what is malformed", async () => {
    const schema = TH.schemaOver(await TH.serverOver())
    const answer = DB.getBoxAnswer.parse(await sent(schema, VaultOperations.getBox, { ask: { ...askVarsOf(boxGetAsk).ask, vault_tok: '' } }, 'u2')) as DB.BadAnswer
    expect(answer).to.deep.include({ ok: false, act: 'bad_option', world: null })
  })

  it("returns for each verb what the VaultDB's own try* verb returns", async () => {
    await TH.emptyTables()
    const vaultDB = await TH.serverOver()
    const schema = TH.schemaOver(vaultDB)
    const record = TH.vaultAt()
    const born = DB.putVaultAnswer.parse(await sentAsk(schema, VaultOperations.putVault, TH.vaultPutAskOf(record)))
    expect(born).to.deep.include({ ok: true, act: 'born', val: record })
    expect(DB.getVaultAnswer.parse(await sentAsk(schema, VaultOperations.getVault, vaultGetAsk))).to.deep.eq(asCrossed(await vaultDB.tryGetVault(vaultGetAsk)))
    expect(DB.listVaultsAnswer.parse(await sent(schema, VaultOperations.listVaults, TH.bankScope))).to.deep.eq(asCrossed(await vaultDB.tryListVaults(TH.bankScope)))

    const box = TH.boxAt(0, 'life1', { sidecar: { note: 'work', 'nested key': [1, { deep: null }] } })
    const boxed = DB.putBoxAnswer.parse(await sentAsk(schema, VaultOperations.putBox, TH.boxPutAskOf(box)))
    expect(boxed).to.deep.include({ ok: true, act: 'born', val: box, world: record })
    expect(DB.getBoxAnswer.parse(await sentAsk(schema, VaultOperations.getBox, boxGetAsk))).to.deep.eq(asCrossed(await vaultDB.tryGetBox(boxGetAsk)))
    expect(DB.listBoxesAnswer.parse(await sent(schema, VaultOperations.listBoxes, TH.vaultQuery))).to.deep.eq(asCrossed(await vaultDB.tryListBoxes(TH.vaultQuery)))

    const replaced = DB.replacePassphraseAnswer.parse(await sent(schema, VaultOperations.replacePassphrase, gateArgsOf(record, { passphrase_wayin: { ...TH.passphraseWayin, key_deriver_label: 'moved' } })))
    expect(replaced).to.deep.include({ ok: true, act: 'replaced' })
    const added = DB.addPasskeyAnswer.parse(await sent(schema, VaultOperations.addPasskey, gateArgsOf(replaced.val as DB.VaultRecord, { passkey_wayin: TH.passkeyWayin })))
    expect(added.val).to.have.nested.property('gate.passkey_wayin.credential_id', TH.passkeyWayin.credential_id)
    const revoked = DB.revokePasskeyAnswer.parse(await sent(schema, VaultOperations.revokePasskey, gateArgsOf(added.val as DB.VaultRecord, { passkey_wayin: null })))
    expect(revoked.val).to.have.nested.property('gate.passkey_wayin', null)

    const goneBox = DB.delBoxAnswer.parse(await sentAsk(schema, VaultOperations.delBox, TH.boxDelAskOf(box)))
    expect(goneBox).to.deep.include({ ok: true, val: TH.boxTombstoneOf(box) })
    const vault = revoked.val as DB.VaultRecord
    const goneVault = DB.delVaultAnswer.parse(await sentAsk(schema, VaultOperations.delVault, TH.vaultDelAskOf(vault)))
    expect(goneVault).to.deep.include({ ok: true, val: TH.vaultTombstoneOf(vault) })
    const tidied = DB.tidyGoneAnswer.parse(await sent(schema, VaultOperations.tidyGone, TH.bankScope))
    expect(tidied).to.deep.include({ ok: true, act: 'tidied', val: { totalCount: 0 }, world: TH.bankScope })
  })

  it("holds a request to the user its ask names, refusing a record filed under another user", async () => {
    await TH.emptyTables()
    const schema = TH.schemaOver(await TH.serverOver())
    const ask = DB.vaultPut.parse(vaultBorn)
    const elsewhere = DB.putVaultAnswer.parse(await sent(schema, VaultOperations.putVault, { ask: { ...ask, record: { ...ask.record, user_id: 'u2' } } })) as DB.BadAnswer
    expect(elsewhere).to.deep.include({ ok: false, act: 'bad_record' })
    expect(await TH.rowsOf().vaultRowOf({ ...TH.vaultScope, user_id: 'u2' })).to.be.null
    expect(await TH.rowsOf().vaultRowOf(TH.vaultScope)).to.be.null
  })

  it("sends a refusal as the answer's err, without the driver's own error", async () => {
    const crossed = await sentAsk(TH.schemaOver(unreachable()), VaultOperations.getVault, vaultGetAsk)
    const answer = DB.getVaultAnswer.parse(crossed) as DB.BadAnswer
    expect(answer.err.refusalkind).to.eq('storage_unavailable')
    expect(answer.err.cause).to.be.undefined
    expect(JSON.stringify(crossed)).not.to.include('hunter2')
  })

  it("sends nothing from the error a getUserId throws", async () => {
    const schema = makeExecutableSchema({
      typeDefs:  VaultSchemaSdl,
      resolvers: vaultResolvers({ vaultDB: await TH.serverOver(), getUserId: () => { throw new Error('session cookie s3cr3t-cookie is malformed') } }),
    })
    const crossed = await sentAsk(schema, VaultOperations.getVault, vaultGetAsk)
    expect((DB.getVaultAnswer.parse(crossed) as DB.BadAnswer).err.refusalkind).to.eq('unexpected_error')
    expect(JSON.stringify(crossed)).not.to.include('s3cr3t')
  })

  it("refuses at the server what the browser's own checks would, for a browser that skipped them", async () => {
    await TH.emptyTables()
    const schema = TH.schemaOver(await TH.serverOver({ maxRecordSizeEst: 200 }))
    const born = DB.putVaultAnswer.parse(await sentAsk(schema, VaultOperations.putVault, vaultBorn))
    expect(born).to.have.property('ok', true)
    const heavy = DB.putBoxAnswer.parse(await sentAsk(schema, VaultOperations.putBox, boxBorn)) as DB.BadAnswer
    expect(heavy.err.refusalkind).to.eq('box_too_large')
    const ask = DB.vaultPut.parse(TH.vaultPutAskOf(TH.vaultAt(1), TH.vaultAt()))
    const malformed = DB.putVaultAnswer.parse(await sent(schema, VaultOperations.putVault, { ask: { ...ask, record: { ...ask.record, am: 'q' } } })) as DB.BadAnswer
    expect(malformed.err.refusalkind).to.eq('bad_record')
    expect(malformed.err.meta?.fieldnames).to.deep.equal(['record.am'])
    const misnamed = DB.getVaultAnswer.parse(await sent(schema, VaultOperations.getVault, { ask: { ...DB.vaultGet.parse(vaultGetAsk), op: 'put' } })) as DB.BadAnswer
    expect(misnamed.err.refusalkind).to.eq('bad_record')
    expect(await TH.rowsOf().vaultRowOf(TH.vaultScope)).to.deep.equal(TH.vaultAt())
  })

  it("sends a full vault's capacity in its err's meta", async () => {
    await TH.emptyTables()
    const schema = TH.schemaOver(await TH.serverOver({ maxBoxes: 1 }))
    await sentAsk(schema, VaultOperations.putVault, vaultBorn)
    await sentAsk(schema, VaultOperations.putBox, boxBorn)
    const second = TH.boxAt(0, 'life1', { boxlabel: 'anthropic', box_tok: 'box2' })
    const full = DB.putBoxAnswer.parse(await sentAsk(schema, VaultOperations.putBox, TH.boxPutAskOf(second))) as DB.BadAnswer
    expect(full.err.refusalkind).to.eq('vault_full')
    expect(full.err.meta?.capacity).to.deep.eq({ boxes: { used: 1, max: 1 }, bytes: { used: 0, max: Number.MAX_SAFE_INTEGER } })
  })

  it("refuses a vaultDB or getUserId it cannot use, including a browser-side GraphQLVaultDB", async () => {
    const vaultDB = await TH.serverOver()
    const client = new GraphQLVaultDB({ client: new Client({ url: 'https://app.example.test/api/graphql', exchanges: [] }) })
    const unusable = [{}, { vaultDB }, { vaultDB: {}, getUserId: () => 'u1' }, { vaultDB, getUserId: 'u1' }, { vaultDB: client, getUserId: () => 'u1' }]
    for (const opts of unusable) { TH.expectSyncRefusal(() => vaultResolvers(opts as never), 'bad_option') }
  })
})

describe("vaultResolvers' watch", () => {
  it("sends each row that changes while the session that subscribed stays signed in as its user", async () => {
    await TH.emptyTables()
    const { listening, vaultDB, schema } = await watchedServer()
    const { stream, nextNotice } = await watching(schema, { user_id: 'u1' })
    await vaultDB.putVault(vaultBorn)
    expect(await nextNotice()).to.deep.eq({ ok: true, val: { act: 'got', val: TH.vaultAt(), world: TH.vaultAt() } })
    await vaultDB.putBox(boxBorn)
    expect(await nextNotice()).to.have.nested.property('val.val.boxlabel', TH.boxAt().boxlabel)
    expect(listening.size).to.eq(1)
    await stream.return(undefined)
  })

  it("stops listening when ended", async () => {
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
      const { listening, vaultDB, schema } = await watchedServer()
      const session: TH.TestContext = { user_id: 'u1' }
      const { nextNotice } = await watching(schema, session)
      await vaultDB.putVault(vaultBorn)
      expect(await nextNotice()).to.have.property('ok', true)
      session.user_id = revoked
      await vaultDB.putBox(boxBorn)
      expect(await nextNotice()).to.have.nested.property('err.refusalkind', 'identity_revoked')
      expect(await nextNotice()).to.be.null
      await vi.waitFor(() => { expect(listening.size).to.eq(0) })
    }
  })

  it("ends with a refusal that carries nothing from the error its getUserId throws", async () => {
    await TH.emptyTables()
    const { listening, vaultDB, schema } = await watchedServer()
    const session: TH.TestContext = { user_id: 'u1' }
    const { stream } = await watching(schema, session)
    Object.defineProperty(session, 'user_id', { get: () => { throw new Error('session datastore s3cr3t-host is down') } })
    await vaultDB.putVault(vaultBorn)
    const last = await stream.next()
    expect(JSON.stringify(last)).not.to.include('s3cr3t')
    expect(DB.crossedNotice.parse(overTheWire(last.value?.data?.['safebyokWatch']))).to.have.nested.property('err.refusalkind', 'unexpected_error')
    expect(await stream.next()).to.have.property('done', true)
    await vi.waitFor(() => { expect(listening.size).to.eq(0) })
  })

  it("ends a refused watch after one notice", async () => {
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

  it("builds on its own, with every root field it adds named safebyok...", () => {
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
    const born = DB.putVaultAnswer.parse(await sentAsk(executable, VaultOperations.putVault, TH.vaultPutAskOf(later)))
    expect(born.val).to.have.property('written_at', 2 ** 41)
  })

  it("refuses a time that is not a safe integer", async () => {
    await TH.emptyTables()
    const executable = TH.schemaOver(await TH.serverOver())
    const later = TH.vaultAt(0, 'life1', { registered_at: 2 ** 41, written_at: 2 ** 41 })
    const ask = DB.vaultPut.parse(TH.vaultPutAskOf(later))
    const fractional = await graphql({ schema: executable, source: VaultOperations.putVault, variableValues: { ask: { ...ask, record: { ...ask.record, written_at: 1.5 } } }, contextValue: { user_id: 'u1' } })
    expect(fractional.errors).to.have.lengthOf(1)
  })
})
