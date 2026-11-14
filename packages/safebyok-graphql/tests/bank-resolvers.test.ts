/** bankResolvers and BankSchemaSdl: which user can reach which bank, and what each answer contains on the wire. */

import { describe, expect, it, vi } from 'vitest'
import { Client } from '@urql/core'
import { buildSchema, graphql, isObjectType, parse, subscribe, validate } from 'graphql'
import type { GraphQLSchema } from 'graphql'
import { makeExecutableSchema } from '@graphql-tools/schema'
import { BX } from 'safebyok-big/storage'
import { PostgresBankDB } from 'safebyok-postgres'
import type { PostgresListen } from 'safebyok-postgres'
import { BankSchemaSdl, bankResolvers } from '../src/server'
import { GraphQLBankDB } from '../src/index'
import { BankOperations } from '../src/bank-operations'
import * as TH from './test-helpers'

TH.bootDatabaseFirst()

const { BW } = TH

/** A bankDB whose database is unreachable. Its driver's error contains text that must never reach a browser. */
function unreachable() {
  return new PostgresBankDB({ client: {
    query:       () => Promise.reject(new Error('connect ECONNREFUSED db.internal:5432 password=hunter2')),
    transaction: () => Promise.reject(new Error('connect ECONNREFUSED db.internal:5432 password=hunter2')),
  } })
}

/** Round-trip `val` through JSON, as the wire would, then leave out a null `passkey0`, as GraphQLBankDB does: a gate without a passkey wayin has none. */
function overTheWire(val: unknown): unknown {
  const text = JSON.stringify(val)
  return JSON.parse(text, (fieldname, field: unknown) => (((fieldname === 'passkey0') && (field === null)) ? undefined : field)) as unknown
}

/** Run `source` against `schema` signed in as `user_id`, and return its one root field's answer after a JSON round trip. */
async function sent(schema: GraphQLSchema, source: string, variableValues: object, user_id: string | null = 'u1'): Promise<unknown> {
  const result = await graphql({ schema, source, variableValues: { ...variableValues }, contextValue: { user_id } satisfies TH.TestContext })
  expect(result.errors, source).to.be.undefined
  const [answer] = Object.values(overTheWire(result.data) as Record<string, unknown>)
  return answer
}

/** An ask's variables: the ask as `check` hands it on, the form GraphQLBankDB sends. */
function askVarsOf(check: { parse: (ask: unknown) => object }, ask: object) { return { ask: check.parse(ask) } }

/** A gate verb's variables: its ask as GraphQLBankDB sends it, checked. */
function gateVarsOf(ask: BX.GatePutAsk) { return { ask: BX.gatePut.parse(ask) } }

/** Send `ask`, checked by `check` as GraphQLBankDB sends it, as the verb `source` is, and return its answer as {@link sent} does. */
async function sentAsk(schema: GraphQLSchema, source: string, check: { parse: (ask: unknown) => object }, ask: object): Promise<unknown> {
  return await sent(schema, source, askVarsOf(check, ask))
}

/** Send a gate verb's `ask` as `source`, its verb's mutation, and return its answer as {@link sent} does. */
async function sentGateAsk(schema: GraphQLSchema, source: string, ask: BX.GatePutAsk): Promise<unknown> {
  return await sent(schema, source, gateVarsOf(ask))
}

// The asks of u1's bank, vault and box that the cases send: a get by a caller that holds no row, and a put or build over none.
const bankBuilt   = BW.bankBuildAskOf()
const vaultGetAsk = BW.vaultGetAskOf()
const boxGetAsk   = BW.boxGetAskOf()
const vaultBorn   = BW.vaultPutAskOf(BW.vaultAt())
const boxBorn     = BW.boxPutAskOf(BW.boxAt())
const withPasskey = { main: BW.mainWayin, passkey0: BW.passkey0Wayin }

/** A bankDB's answer in wire form: `dbhas` is null when the answer has none. */
function asCrossed(answer: BX.Answer<unknown, string, unknown>) { return { ...answer, dbhas: answer.dbhas ?? null } }

/** Make a server and its bankDB with the bank built. `listening` holds the watch callbacks that are currently listening. */
async function watchedServer() {
  await TH.emptyTables()
  const listening = new Set<unknown>()
  const listen: PostgresListen = async (channel, onNotify) => {
    const unlisten = await TH.listen(channel, onNotify)
    listening.add(onNotify)
    return () => {
      listening.delete(onNotify)
      return unlisten()
    }
  }
  const bankDB = await TH.serverOver({ listen })
  await bankDB.buildBank(bankBuilt)
  return { listening, bankDB, schema: TH.schemaOver(bankDB) }
}

// A vault's watch, so the bank and gate rows the case builds first are never heard.
/** Subscribe to a watch of `scope` through `schema` as the session `context`. `nextNotice` returns the next notice parsed from the wire, or null when the stream ends. */
async function watching(schema: GraphQLSchema, context: TH.TestContext, scope: object = BW.vaultScope) {
  const stream = await subscribe({ schema, document: parse(BankOperations.watch), variableValues: { ...scope }, contextValue: context })
  if (! ('next' in stream)) { throw new Error(`Expected a subscription, got ${JSON.stringify(stream)}`) }
  return {
    stream,
    nextNotice: async () => {
      const next = await stream.next()
      if (next.done === true) { return null }
      expect(next.value.errors).to.be.undefined
      return BX.crossedNotice.parse(overTheWire(next.value.data?.['safebyokWatch']))
    },
  }
}

describe("bankResolvers", () => {
  it("refuses every verb of a request signed in as another user, or signed out", async () => {
    await TH.emptyTables()
    const schema = TH.schemaOver(await TH.serverOver())
    const gate = BW.gateAt()
    const vault = BW.vaultAt()
    const box = BW.boxAt()
    const { op: _op, ...boxListed } = BW.boxListAsk
    const asked: [string, object, { parse: (crossed: unknown) => BX.Answer<unknown, string, unknown> }][] = [
      [BankOperations.ensureBank, BW.bankScope, BX.ensureBankAnswer],
      [BankOperations.getVault, askVarsOf(BX.vaultGet, vaultGetAsk), BX.getVaultAnswer],
      [BankOperations.listBoxes, boxListed, BX.listBoxesAnswer],
      [BankOperations.getBox, askVarsOf(BX.boxGet, boxGetAsk), BX.getBoxAnswer],
      [BankOperations.buildBank, askVarsOf(BX.bankBuild, bankBuilt), BX.buildBankAnswer],
      [BankOperations.replacePassphrase, gateVarsOf(BW.gatePutAskOf(gate, { main: BW.otherMainWayin })), BX.replacePassphraseAnswer],
      [BankOperations.addPasskey, gateVarsOf(BW.gatePutAskOf(gate, withPasskey)), BX.addPasskeyAnswer],
      [BankOperations.revokePasskey, gateVarsOf(BW.gatePutAskOf(gate, BW.MainOnly)), BX.revokePasskeyAnswer],
      [BankOperations.delBank, askVarsOf(BX.bankDel, BW.bankDelAskOf(BW.bankAt())), BX.delBankAnswer],
      [BankOperations.putVault, askVarsOf(BX.vaultPut, BW.vaultPutAskOf(vault)), BX.putVaultAnswer],
      [BankOperations.delVault, askVarsOf(BX.vaultDel, BW.vaultDelAskOf(vault)), BX.delVaultAnswer],
      [BankOperations.putBox, askVarsOf(BX.boxPut, BW.boxPutAskOf(box)), BX.putBoxAnswer],
      [BankOperations.delBox, askVarsOf(BX.boxDel, BW.boxDelAskOf(box)), BX.delBoxAnswer],
      [BankOperations.tidyGone, BW.bankScope, BX.tidyGoneAnswer],
    ]
    for (const user_id of ['u2', null]) {
      for (const [source, variableValues, answerCheck] of asked) {
        const answer = answerCheck.parse(await sent(schema, source, variableValues, user_id)) as BX.BadAnswer
        expect(answer, source).to.deep.include({ ok: false, act: 'unclassified_storing', parent: null }).and.to.have.nested.property('err.refusalkind', 'identity_revoked')
        expect(answer.err.refusalkind, source).to.eq('identity_revoked')
        expect(answer.ask, source).to.include(BW.bankScope)
      }
    }
    expect(await TH.rowsOf().bankRowOf(BW.bankScope)).to.be.null
  })

  it("carries a gate verb's scope in the ask of its sign-in refusal", async () => {
    const schema = TH.schemaOver(await TH.serverOver())
    const variables = gateVarsOf(BW.gatePutAskOf(BW.gateAt(), withPasskey))
    const answer = BX.addPasskeyAnswer.parse(await sent(schema, BankOperations.addPasskey, variables, 'u2'))
    expect(answer.ask).to.include({ op: 'put', gatelabel: 'main' })
  })

  it("refuses a malformed request signed in as another user for what is malformed", async () => {
    const schema = TH.schemaOver(await TH.serverOver())
    const answer = BX.getBoxAnswer.parse(await sent(schema, BankOperations.getBox, { ask: { ...BX.boxGet.parse(boxGetAsk), vault_tok: '' } }, 'u2')) as BX.BadAnswer
    expect(answer).to.deep.include({ ok: false, act: 'unclassified_storing', parent: null }).and.to.have.nested.property('err.refusalkind', 'bad_option')
  })

  it("returns for each verb what the bankDB's own try* verb returns", async () => {
    await TH.emptyTables()
    const bankDB = await TH.serverOver()
    const schema = TH.schemaOver(bankDB)
    const bank = BW.bankAt()
    const built = BX.buildBankAnswer.parse(await sentAsk(schema, BankOperations.buildBank, BX.bankBuild, bankBuilt))
    expect(built).to.deep.include({ ok: true, act: 'born', val: BW.gateAt(), parent: bank })
    expect(BX.ensureBankAnswer.parse(await sent(schema, BankOperations.ensureBank, BW.bankScope))).to.deep.eq(asCrossed(await bankDB.tryEnsureBank(BW.bankEnsureAsk)))

    const vault = BW.vaultAt()
    const born = BX.putVaultAnswer.parse(await sentAsk(schema, BankOperations.putVault, BX.vaultPut, BW.vaultPutAskOf(vault)))
    expect(born).to.deep.include({ ok: true, act: 'born', val: vault, parent: bank })
    expect(BX.getVaultAnswer.parse(await sentAsk(schema, BankOperations.getVault, BX.vaultGet, vaultGetAsk))).to.deep.eq(asCrossed(await bankDB.tryGetVault(vaultGetAsk)))

    const box = BW.boxAt(0, 'bank1', 'life1', { sidecar: { note: 'work', 'nested key': [1, { deep: null }] } })
    const boxed = BX.putBoxAnswer.parse(await sentAsk(schema, BankOperations.putBox, BX.boxPut, BW.boxPutAskOf(box)))
    expect(boxed).to.deep.include({ ok: true, act: 'born', val: box, parent: vault })
    expect(BX.getBoxAnswer.parse(await sentAsk(schema, BankOperations.getBox, BX.boxGet, boxGetAsk))).to.deep.eq(asCrossed(await bankDB.tryGetBox(boxGetAsk)))
    const { op: _op, ...boxListed } = BW.boxListAsk
    expect(BX.listBoxesAnswer.parse(await sent(schema, BankOperations.listBoxes, boxListed))).to.deep.eq(asCrossed(await bankDB.tryListBoxes(BW.boxListAsk)))

    const replaced = BX.replacePassphraseAnswer.parse(await sentGateAsk(schema, BankOperations.replacePassphrase, BW.gatePutAskOf(built.val as BX.GateRecord, { main: BW.otherMainWayin })))
    expect(replaced).to.deep.include({ ok: true, act: 'replaced', parent: bank })
    const added = BX.addPasskeyAnswer.parse(await sentGateAsk(schema, BankOperations.addPasskey, BW.gatePutAskOf(replaced.val as BX.GateRecord, { main: BW.otherMainWayin, passkey0: BW.passkey0Wayin })))
    expect(added.val).to.have.nested.property('wayins.passkey0.credential_id', BW.passkey0Wayin.credential_id)
    const revoked = BX.revokePasskeyAnswer.parse(await sentGateAsk(schema, BankOperations.revokePasskey, BW.gatePutAskOf(added.val as BX.GateRecord, { main: BW.otherMainWayin })))
    expect(revoked).to.deep.include({ ok: true, act: 'replaced' })
    expect(revoked.val).not.to.have.nested.property('wayins.passkey0')

    const goneBox = BX.delBoxAnswer.parse(await sentAsk(schema, BankOperations.delBox, BX.boxDel, BW.boxDelAskOf(box)))
    expect(goneBox).to.deep.include({ ok: true, val: BW.boxTombstoneOf(box) })
    const goneVault = BX.delVaultAnswer.parse(await sentAsk(schema, BankOperations.delVault, BX.vaultDel, BW.vaultDelAskOf(vault)))
    expect(goneVault).to.deep.include({ ok: true, val: BW.vaultTombstoneOf(vault) })
    const tidied = BX.tidyGoneAnswer.parse(await sent(schema, BankOperations.tidyGone, BW.bankScope))
    expect(tidied).to.deep.include({ ok: true, act: 'tidied', val: { totalCount: 0, leftover: 'none' }, parent: BW.bankScope })
    const goneBank = BX.delBankAnswer.parse(await sentAsk(schema, BankOperations.delBank, BX.bankDel, BW.bankDelAskOf(bank)))
    expect(goneBank).to.deep.include({ ok: true, act: 'deleted', val: BW.bankTombstoneOf(bank), parent: BX.BankTop })
  })

  it("holds a request to the user its ask names, refusing a record filed under another user", async () => {
    await TH.emptyTables()
    const schema = TH.schemaOver(await TH.serverOver())
    const ask = BX.bankBuild.parse(bankBuilt)
    const elsewhere = BX.buildBankAnswer.parse(await sent(schema, BankOperations.buildBank, { ask: { ...ask, record: { ...ask.record, user_id: 'u2' } } })) as BX.BadAnswer
    expect(elsewhere).to.deep.include({ ok: false, act: 'unclassified_storing' }).and.to.have.nested.property('err.refusalkind', 'bad_record')
    expect(await TH.rowsOf().bankRowOf({ ...BW.bankScope, user_id: 'u2' })).to.be.null
    expect(await TH.rowsOf().bankRowOf(BW.bankScope)).to.be.null
  })

  it("sends a refusal as the answer's err, without the driver's own error", async () => {
    const crossed = await sent(TH.schemaOver(unreachable()), BankOperations.getVault, askVarsOf(BX.vaultGet, vaultGetAsk))
    const answer = BX.getVaultAnswer.parse(crossed) as BX.BadAnswer
    expect(answer.err.refusalkind).to.eq('storage_unavailable')
    expect(answer.err.cause).to.be.undefined
    expect(JSON.stringify(crossed)).not.to.include('hunter2')
  })

  it("sends nothing from the error a getUserId throws", async () => {
    const schema = makeExecutableSchema({
      typeDefs:  BankSchemaSdl,
      resolvers: bankResolvers({ bankDB: await TH.serverOver(), getUserId: () => { throw new Error('session cookie s3cr3t-cookie is malformed') } }),
    })
    const crossed = await sentAsk(schema, BankOperations.getVault, BX.vaultGet, vaultGetAsk)
    expect((BX.getVaultAnswer.parse(crossed) as BX.BadAnswer).err.refusalkind).to.eq('unexpected_error')
    expect(JSON.stringify(crossed)).not.to.include('s3cr3t')
  })

  it("refuses at the server what the browser's own checks would, for a browser that skipped them", async () => {
    await TH.emptyTables()
    const schema = TH.schemaOver(await TH.serverOver({ maxRecordSizeEst: 200 }))
    await sentAsk(schema, BankOperations.buildBank, BX.bankBuild, bankBuilt)
    const born = BX.putVaultAnswer.parse(await sentAsk(schema, BankOperations.putVault, BX.vaultPut, vaultBorn))
    expect(born).to.have.property('ok', true)
    const heavy = BX.putBoxAnswer.parse(await sentAsk(schema, BankOperations.putBox, BX.boxPut, boxBorn)) as BX.BadAnswer
    expect(heavy.err.refusalkind).to.eq('box_too_large')
    const ask = BX.vaultPut.parse(BW.vaultPutAskOf(BW.vaultAt(1), BW.vaultAt()))
    const malformed = BX.putVaultAnswer.parse(await sent(schema, BankOperations.putVault, { ask: { ...ask, record: { ...ask.record, am: 'q' } } })) as BX.BadAnswer
    expect(malformed.err.refusalkind).to.eq('bad_record')
    expect(malformed.err.meta?.fieldnames).to.deep.equal(['record.am'])
    const misnamed = BX.getVaultAnswer.parse(await sent(schema, BankOperations.getVault, { ask: { ...BX.vaultGet.parse(vaultGetAsk), op: 'put' } })) as BX.BadAnswer
    expect(misnamed.err.refusalkind).to.eq('bad_record')
    const gate = BW.gateAt()
    const sneaky = gateVarsOf(BW.gatePutAskOf(gate, withPasskey))
    const skipped = BX.replacePassphraseAnswer.parse(await sent(schema, BankOperations.replacePassphrase, { ask: { ...sneaky.ask, record: { ...sneaky.ask.record, revision_seq: 3 } } })) as BX.BadAnswer
    expect(skipped.err.refusalkind).to.eq('bad_record')
    expect(await TH.rowsOf().vaultRowOf(BW.vaultScope)).to.deep.equal(BW.vaultAt())
    expect(await TH.rowsOf().gateRowOf(BW.gateScope)).to.deep.equal(gate)
  })

  it("sends a full vault's capacity in its err's meta", async () => {
    await TH.emptyTables()
    const schema = TH.schemaOver(await TH.serverOver({ maxBoxes: 1 }))
    await sentAsk(schema, BankOperations.buildBank, BX.bankBuild, bankBuilt)
    await sentAsk(schema, BankOperations.putVault, BX.vaultPut, vaultBorn)
    await sentAsk(schema, BankOperations.putBox, BX.boxPut, boxBorn)
    const second = BW.boxAt(0, 'bank1', 'life1', { boxlabel: 'anthropic', box_tok: 'box2' })
    const full = BX.putBoxAnswer.parse(await sentAsk(schema, BankOperations.putBox, BX.boxPut, BW.boxPutAskOf(second))) as BX.BadAnswer
    expect(full.err.refusalkind).to.eq('vault_full')
    expect(full.err.meta?.capacity).to.deep.eq({ boxes: { used: 1, max: 1 }, bytes: { used: 0, max: Number.MAX_SAFE_INTEGER } })
  })

  it("refuses a bankDB or getUserId it cannot use, including a browser-side GraphQLBankDB", async () => {
    const bankDB = await TH.serverOver()
    const client = new GraphQLBankDB({ client: new Client({ url: 'https://app.example.test/api/graphql', exchanges: [] }) })
    const unusable = [{}, { bankDB }, { bankDB: {}, getUserId: () => 'u1' }, { bankDB, getUserId: 'u1' }, { bankDB: client, getUserId: () => 'u1' }]
    for (const opts of unusable) { TH.expectSyncRefusal(() => bankResolvers(opts as never), 'bad_option') }
  })
})

describe("bankResolvers' watch", () => {
  it("sends each row that changes while the session that subscribed stays signed in as its user", async () => {
    const { listening, bankDB, schema } = await watchedServer()
    const { stream, nextNotice } = await watching(schema, { user_id: 'u1' })
    await bankDB.putVault(vaultBorn)
    expect(await nextNotice()).to.deep.eq({ ok: true, val: { act: 'gotlive', val: BW.vaultAt(), parent: BW.bankAt() } })
    await bankDB.putBox(boxBorn)
    expect(await nextNotice()).to.have.nested.property('val.val.boxlabel', BW.boxAt().boxlabel)
    expect(listening.size).to.eq(1)
    await stream.return(undefined)
  })

  it("reads a bank row's notice with the parent main, though it crosses with none", async () => {
    const { bankDB, schema } = await watchedServer()
    const { stream, nextNotice } = await watching(schema, { user_id: 'u1' }, BW.bankScope)
    await bankDB.delBank(BW.bankDelAskOf(BW.bankAt()))
    expect(await nextNotice()).to.deep.eq({ ok: true, val: { act: 'gotgone', val: BW.bankTombstoneOf(BW.bankAt()), parent: BX.BankTop } })
    await stream.return(undefined)
  })

  it("stops listening when ended", async () => {
    const { listening, schema } = await watchedServer()
    const { stream } = await watching(schema, { user_id: 'u1' })
    await vi.waitFor(() => { expect(listening.size).to.eq(1) })
    await stream.return(undefined)
    await vi.waitFor(() => { expect(listening.size).to.eq(0) })
  })

  it("ends once its session is signed out or in as another user", async () => {
    for (const revoked of ['u2', null]) {
      const { listening, bankDB, schema } = await watchedServer()
      const session: TH.TestContext = { user_id: 'u1' }
      const { nextNotice } = await watching(schema, session)
      await bankDB.putVault(vaultBorn)
      expect(await nextNotice()).to.have.property('ok', true)
      session.user_id = revoked
      await bankDB.putBox(boxBorn)
      expect(await nextNotice()).to.have.nested.property('err.refusalkind', 'identity_revoked')
      expect(await nextNotice()).to.be.null
      await vi.waitFor(() => { expect(listening.size).to.eq(0) })
    }
  })

  it("ends with a refusal that carries nothing from the error its getUserId throws", async () => {
    const { listening, bankDB, schema } = await watchedServer()
    const session: TH.TestContext = { user_id: 'u1' }
    const { stream } = await watching(schema, session)
    Object.defineProperty(session, 'user_id', { get: () => { throw new Error('session datastore s3cr3t-host is down') } })
    await bankDB.putVault(vaultBorn)
    const last = await stream.next()
    expect(JSON.stringify(last)).not.to.include('s3cr3t')
    expect(BX.crossedNotice.parse(overTheWire(last.value?.data?.['safebyokWatch']))).to.have.nested.property('err.refusalkind', 'unexpected_error')
    expect(await stream.next()).to.have.property('done', true)
    await vi.waitFor(() => { expect(listening.size).to.eq(0) })
  })

  it("ends a refused watch after one notice", async () => {
    const { listening, schema } = await watchedServer()
    for (const [context, scope, refusalkind] of [[{ user_id: 'u2' }, BW.bankScope, 'identity_revoked'], [{ user_id: 'u1' }, { ...BW.bankScope, banklabel: '' }, 'bad_scope']] as const) {
      const { nextNotice } = await watching(schema, context, scope)
      expect(await nextNotice()).to.have.nested.property('err.refusalkind', refusalkind)
      expect(await nextNotice()).to.be.null
    }
    expect(listening.size).to.eq(0)
  })
})

describe("BankSchemaSdl", () => {
  const schema = buildSchema(BankSchemaSdl)

  it("builds on its own, with every root field it adds named safebyok...", () => {
    const rootFields = [schema.getQueryType(), schema.getMutationType(), schema.getSubscriptionType()]
      .flatMap((root) => (isObjectType(root) ? Object.keys(root.getFields()) : []))
    expect(rootFields).to.have.lengthOf(15)
    for (const fieldname of rootFields) { expect(fieldname).to.match(/^safebyok[A-Z]/) }
  })

  it("takes every operation a client sends", () => {
    for (const document of Object.values(BankOperations)) { expect(validate(schema, parse(document))).to.deep.eq([]) }
  })

  it("carries a time past 32 bits", async () => {
    await TH.emptyTables()
    const executable = TH.schemaOver(await TH.serverOver())
    await sentAsk(executable, BankOperations.buildBank, BX.bankBuild, bankBuilt)
    const later = BW.vaultAt(0, 'bank1', 'life1', { registered_at: 2 ** 41, written_at: 2 ** 41 })
    const born = BX.putVaultAnswer.parse(await sentAsk(executable, BankOperations.putVault, BX.vaultPut, BW.vaultPutAskOf(later)))
    expect(born.val).to.have.property('written_at', 2 ** 41)
  })

  it("refuses a time that is not a safe integer", async () => {
    const executable = TH.schemaOver(await TH.serverOver())
    const later = BW.vaultAt(0, 'bank1', 'life1', { registered_at: 2 ** 41, written_at: 2 ** 41 })
    const ask = BX.vaultPut.parse(BW.vaultPutAskOf(later))
    const fractional = await graphql({ schema: executable, source: BankOperations.putVault, variableValues: { ask: { ...ask, record: { ...ask.record, written_at: 1.5 } } }, contextValue: { user_id: 'u1' } })
    expect(fractional.errors).to.have.lengthOf(1)
  })
})
