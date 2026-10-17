import { describe, expect, it } from 'vitest'
import { makeExecutableSchema } from '@graphql-tools/schema'
import { GraphQLError, graphql, parse, subscribe } from 'graphql'
import type { ExecutionResult, GraphQLSchema } from 'graphql'
import { VaultError } from 'safebyok'
import { postgresVaultDB } from 'safebyok-postgres'
import * as TH from './test-helpers'
import { VaultSchemaSdl, vaultResolvers } from '../src/server'
import type { ServedVaultDB, VaultResolversOpts } from '../src/server'
import { VaultOperations } from '../src/graphql-vault-db'

TH.bootDatabaseFirst()

const u1 = TH.scopeOf('u1')

/** `document` run against `schema` as a request signed in as u1. */
const asked = (schema: GraphQLSchema, document: string, variableValues: Record<string, unknown>) => (
  graphql({ schema, source: document, variableValues, contextValue: { userId: 'u1' } })
)

/** The live subscription `schema` makes of u1's vault, for a request signed in as u1. */
const subscribed = async (schema: GraphQLSchema) => {
  const result = await subscribe({ schema, document: parse(VaultOperations.safebyokVaultChanged), variableValues: { scope: u1 }, contextValue: { userId: 'u1' } })
  if (! isLive(result)) { throw new Error(`no subscription: ${JSON.stringify(result)}`) }
  return result
}

const isLive = (result: object): result is AsyncGenerator<ExecutionResult> => typeof (result as Partial<AsyncGenerator>).next === 'function'

/** The VaultError a GraphQL error crossed with, kept on the server as its cause. */
const refusalBehind = (crossed: GraphQLError | undefined): VaultError => (crossed!.cause as GraphQLError).cause as VaultError

/** A ServedVaultDB whose every verb is `answer`, and which keeps the onChange it is handed. */
const fakeServed = (answer: () => Promise<unknown>) => {
  const heard: { onChange?: () => void, unsubscribed: number } = { unsubscribed: 0 }
  const served: ServedVaultDB = {
    readBundle:     answer as ServedVaultDB['readBundle'],
    createBundle:   answer as ServedVaultDB['createBundle'],
    updateBundle:   answer as ServedVaultDB['updateBundle'],
    readBox:        answer as ServedVaultDB['readBox'],
    listBoxRecords: answer as ServedVaultDB['listBoxRecords'],
    updateBox:      answer as ServedVaultDB['updateBox'],
    eraseBox:       answer as ServedVaultDB['eraseBox'],
    eraseVault:     answer as ServedVaultDB['eraseVault'],
    subscribe:      (_scope, onChange) => {
      heard.onChange = onChange
      return () => { heard.unsubscribed += 1 }
    },
  }
  return { served, heard }
}

describe("vaultResolvers, its options", () => {
  const BadOpts = [
    [null,                         'no options at all'],
    [{},                           'no vaultDBFor'],
    [{ vaultDBFor: 'postgres' },   'a vaultDBFor that is not a function'],
  ] as const

  for (const [opts, blurb] of BadOpts) {
    it(`refuses ${blurb}, with kind bad_option`, () => {
      expect(() => vaultResolvers(opts as unknown as VaultResolversOpts<unknown>)).to.throw(VaultError).with.property('kind', 'bad_option')
    })
  }
})

describe("vaultResolvers, in a host's schema", () => {
  it("merges with the host's own root types and resolvers, as graphql-tools does for Yoga and Apollo", async () => {
    const db = await TH.emptyDatabase()
    const schema = makeExecutableSchema({
      typeDefs:  ['type Query { greeting: String! } type Mutation { wave: Boolean! }', VaultSchemaSdl],
      resolvers: [
        { Query: { greeting: () => 'hello' }, Mutation: { wave: () => true } },
        vaultResolvers({ vaultDBFor: ({ userId }: TH.TestContext) => TH.requestFor(db, userId) }),
      ],
    })
    const result = await asked(schema, `query { greeting safebyokReadBundle(scope: { applabel: "acme", user_id: "u1", vaultlabel: "main" }) { vault_id } }`, {})
    expect(result).to.deep.equal({ data: { greeting: 'hello', safebyokReadBundle: null } })
  })

  it("makes each request's VaultDB from that request's context", async () => {
    const db = await TH.emptyDatabase()
    const contexts: unknown[] = []
    const schema = TH.schemaOver(db, (context) => {
      contexts.push(context)
      return TH.requestFor(db, context.userId)
    })
    await asked(schema, VaultOperations.safebyokReadBundle, { scope: u1 })
    expect(contexts).to.deep.equal([{ userId: 'u1' }])
  })

  it("answers a listing with the records as stored, format and all, not a vault's summaries", async () => {
    const db = await TH.emptyDatabase()
    await TH.requestFor(db, 'u1').createBundle(TH.bundleOf('u1'))
    await TH.requestFor(db, 'u1').updateBox(u1, TH.boxOf('openai', 'r1'), { vault_id: 'vault-id-u1', revision_id: null, vault_key_epoch: 1 })
    const result = await asked(TH.schemaOver(db), VaultOperations.safebyokListBoxes, { scope: u1 })
    const { lockbox_key_wrapped: _wrapped, whisper_ciphered: _ciphered, ...listed } = TH.boxOf('openai', 'r1')
    expect(result.data).to.deep.equal({ safebyokListBoxes: [listed] })
  })

  it("takes a lockbox expectation that leaves out its null revision_id as one that means it", async () => {
    const db = await TH.emptyDatabase()
    await TH.requestFor(db, 'u1').createBundle(TH.bundleOf('u1'))
    const result = await asked(TH.schemaOver(db), VaultOperations.safebyokUpdateBox, { scope: u1, lockbox: TH.boxOf('openai', 'r1'), expected: { vault_id: 'vault-id-u1', vault_key_epoch: 1 } })
    expect(result).to.deep.equal({ data: { safebyokUpdateBox: true } })
  })
})

describe("vaultResolvers, refusing", () => {
  it("sends a refusal as its message and kind, and nothing more", async () => {
    const result = await asked(TH.schemaOver(await TH.emptyDatabase()), VaultOperations.safebyokReadBundle, { scope: TH.scopeOf('u2') })
    expect(result.data).to.deep.equal({ safebyokReadBundle: null })
    expect(result.errors!.map((err) => err.toJSON())).to.deep.equal([{
      message:    'This vault belongs to another user than the one signed in: a signed-in user reaches only their own vaults. If the user changed, open the vault for the new one.',
      locations:  [{ line: 2, column: 3 }],
      path:       ['safebyokReadBundle'],
      extensions: { kind: 'identity_revoked' },
    }])
  })

  it("never sends the driver's own error, but keeps it on the server as the refusal's cause", async () => {
    const dbDown = new Error('password authentication failed for user "vault_owner"')
    const schema = TH.schemaOver(await TH.database(), ({ userId }) => postgresVaultDB({ client: TH.failingClient(dbDown), userId }))
    const result = await asked(schema, VaultOperations.safebyokReadBundle, { scope: u1 })
    expect(JSON.stringify(result)).to.not.include('vault_owner')
    const [crossed] = result.errors!
    expect(crossed!.extensions).to.deep.equal({ kind: 'storage_unavailable' })
    const refusal = refusalBehind(crossed)
    expect(refusal).to.be.instanceOf(VaultError)
    expect(refusal.kind).to.eq('storage_unavailable')
    expect(refusal.cause).to.eq(dbDown)
  })

  it("keeps the cause unenumerable, so a server that spreads an error never sends it", async () => {
    const dbDown = new Error('password authentication failed for user "vault_owner"')
    const schema = TH.schemaOver(await TH.database(), ({ userId }) => postgresVaultDB({ client: TH.failingClient(dbDown), userId }))
    const result = await asked(schema, VaultOperations.safebyokReadBundle, { scope: u1 })
    const crossed = result.errors![0]!.cause
    expect(crossed).to.be.instanceOf(GraphQLError)
    expect(Object.keys(crossed as GraphQLError)).to.not.include('cause')
    const spread = Object.fromEntries(Object.entries(crossed as GraphQLError))
    expect(JSON.stringify(spread)).to.not.include('vault_owner')
  })

  it("sends anything else a VaultDB throws as storage_unavailable, keeping it as the refusal's cause", async () => {
    const oops = new Error('connection terminated unexpectedly')
    const { served } = fakeServed(() => Promise.reject(oops))
    const result = await asked(TH.schemaOver(await TH.database(), () => served), VaultOperations.safebyokEraseVault, { scope: u1, expected: { vault_id: 'vault-id-u1' } })
    expect(result.errors![0]!.extensions).to.deep.equal({ kind: 'storage_unavailable' })
    expect(result.errors![0]!.message).to.not.include('terminated')
    expect(refusalBehind(result.errors![0]).cause).to.eq(oops)
  })

  it("sends a vaultDBFor that throws as bad_option with a generic message, keeping its own as the cause", async () => {
    const schema = TH.schemaOver(await TH.database(), () => postgresVaultDB({ client: null as never, userId: 'u1' }))
    const result = await asked(schema, VaultOperations.safebyokReadBundle, { scope: u1 })
    const [crossed] = result.errors!
    expect(crossed!.extensions).to.deep.equal({ kind: 'bad_option' })
    expect(crossed!.message).to.include("its own setup is wrong")
    expect(crossed!.message).to.not.include('client')
    const ownRefusal = refusalBehind(crossed).cause as VaultError
    expect(ownRefusal.kind).to.eq('bad_option')
    expect(ownRefusal.message).to.include('client')
  })

  it("sends anything else vaultDBFor throws as bad_option too, before subscribing as before reading", async () => {
    const oops = new Error('AUTH_SECRET is not set')
    const schema = TH.schemaOver(await TH.database(), () => { throw oops })
    const read = await asked(schema, VaultOperations.safebyokReadBundle, { scope: u1 })
    const watched = await subscribe({ schema, document: parse(VaultOperations.safebyokVaultChanged), variableValues: { scope: u1 }, contextValue: { userId: 'u1' } }) as ExecutionResult
    for (const crossed of [read.errors![0], watched.errors![0]]) {
      expect(crossed!.extensions).to.deep.equal({ kind: 'bad_option' })
      expect(crossed!.message).to.not.include('AUTH_SECRET')
      expect(refusalBehind(crossed).cause).to.eq(oops)
    }
  })
})

describe("vaultResolvers, the subscription", () => {
  it("sends the vault's scope after each write to it, and stops listening when the subscriber goes", async () => {
    const db = await TH.emptyDatabase()
    const changes = await subscribed(TH.schemaOver(db))
    const next = changes.next()
    await TH.aWhile()
    await TH.requestFor(db, 'u1').createBundle(TH.bundleOf('u1'))
    expect(await next).to.deep.equal({ done: false, value: { data: { safebyokVaultChanged: u1 } } })
    expect(await changes.return()).to.deep.equal({ done: true, value: undefined })
  })

  it("unsubscribes from the VaultDB when the subscription ends", async () => {
    const { served, heard } = fakeServed(() => Promise.resolve(null))
    const changes = await subscribed(TH.schemaOver(await TH.database(), () => served))
    heard.onChange!()
    await changes.next()
    await changes.return()
    expect(heard.unsubscribed).to.eq(1)
  })

  it("unsubscribes at once when the subscription ends while it waits for a change", async () => {
    const { served, heard } = fakeServed(() => Promise.resolve(null))
    const changes = await subscribed(TH.schemaOver(await TH.database(), () => served))
    const waiting = changes.next()
    await TH.wakeupAtNextTick()
    await changes.return()
    expect(heard.unsubscribed).to.eq(1)
    expect(await waiting).to.have.property('done', true)
  })

  it("sends changes heard while the subscriber is busy as one", async () => {
    const { served, heard } = fakeServed(() => Promise.resolve(null))
    const changes = await subscribed(TH.schemaOver(await TH.database(), () => served))
    heard.onChange!()
    heard.onChange!()
    heard.onChange!()
    expect(await changes.next()).to.have.property('done', false)
    const nothingYet = async () => {
      await TH.wakeupAtNextTick()
      return 'nothing yet'
    }
    expect(await Promise.race([changes.next(), nothingYet()])).to.eq('nothing yet')
    heard.onChange!()
    await changes.return()
  })

  it("takes a change heard after the subscriber has gone quietly", async () => {
    const { served, heard } = fakeServed(() => Promise.resolve(null))
    const changes = await subscribed(TH.schemaOver(await TH.database(), () => served))
    await changes.return()
    expect(() => { heard.onChange!() }).to.not.throw()
  })

  it("refuses to subscribe to another user's vault, as its kind, before listening", async () => {
    const result = await subscribe({
      schema:         TH.schemaOver(await TH.emptyDatabase()),
      document:       parse(VaultOperations.safebyokVaultChanged),
      variableValues: { scope: TH.scopeOf('u2') },
      contextValue:   { userId: 'u1' },
    }) as ExecutionResult
    expect(result.errors!.map((err) => err.extensions)).to.deep.equal([{ kind: 'identity_revoked' }])
  })
})
