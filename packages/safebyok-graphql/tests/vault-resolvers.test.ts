import { describe, expect, it } from 'vitest'
import { makeExecutableSchema } from '@graphql-tools/schema'
import { GraphQLError, graphql, parse, subscribe } from 'graphql'
import type { ExecutionResult, GraphQLSchema } from 'graphql'
import { Refusals, VaultError } from 'safebyok'
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
    getVaultRecords:    answer as ServedVaultDB['getVaultRecords'],
    ensureVaultRecords: answer as ServedVaultDB['ensureVaultRecords'],
    putVaultProps:    answer as ServedVaultDB['putVaultProps'],
    getBox:           answer as ServedVaultDB['getBox'],
    putBox:           answer as ServedVaultDB['putBox'],
    getCapacity:      answer as ServedVaultDB['getCapacity'],
    delBox:           answer as ServedVaultDB['delBox'],
    delVault:         answer as ServedVaultDB['delVault'],
    subscribe:        (_scope, onChange) => {
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
      expect(() => vaultResolvers(opts as unknown as VaultResolversOpts<unknown>)).to.throw(VaultError).with.property('refusalkind', 'bad_option')
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
    const result = await asked(schema, `query { greeting safebyokGetVault(scope: { applabel: "acme", user_id: "u1", vaultlabel: "main" }) { vaultProps { vault_tok } } }`, {})
    expect(result).to.deep.equal({ data: { greeting: 'hello', safebyokGetVault: null } })
  })

  it("makes each request's VaultDB from that request's context", async () => {
    const db = await TH.emptyDatabase()
    const contexts: unknown[] = []
    const schema = TH.schemaOver(db, (context) => {
      contexts.push(context)
      return TH.requestFor(db, context.userId)
    })
    await asked(schema, VaultOperations.safebyokGetVault, { scope: u1 })
    expect(contexts).to.deep.equal([{ userId: 'u1' }])
  })

  it("answers a vault read with the records as stored, format and all, not a vault's summaries", async () => {
    const db = await TH.emptyDatabase()
    await TH.ensureGated(TH.requestFor(db, 'u1'), TH.vaultPropsOf('u1'))
    await TH.expectGood(TH.requestFor(db, 'u1').putBox(u1, { vault_tok: 'vault-tok-u1', revision_tok: null }, TH.boxOf('openai', 'r1')))
    const result = await asked(TH.schemaOver(db), VaultOperations.safebyokGetVault, { scope: u1 })
    const { box_key_wrapped: _wrapped, whisper_ciphered: _ciphered, ...listed } = TH.boxOf('openai', 'r1')
    expect(result.data).to.deep.equal({ safebyokGetVault: { vaultProps: TH.vaultPropsOf('u1'), boxes: [listed] } })
  })

  it("takes a box expectation that leaves out its null revision_tok as one that means it", async () => {
    const db = await TH.emptyDatabase()
    await TH.ensureGated(TH.requestFor(db, 'u1'), TH.vaultPropsOf('u1'))
    const result = await asked(TH.schemaOver(db), VaultOperations.safebyokPutBox, { scope: u1, box: TH.boxOf('openai', 'r1'), expected: { vault_tok: 'vault-tok-u1' } })
    expect(result).to.deep.equal({ data: { safebyokPutBox: { landed: true, refusalkind: null, message: null, box_stored: TH.boxOf('openai', 'r1'), capacity: null } } })
  })

  it("answers a box delete with what it removed, and takes one that leaves out its null revision_tok as one that means it", async () => {
    const db = await TH.emptyDatabase()
    await TH.ensureGated(TH.requestFor(db, 'u1'), TH.vaultPropsOf('u1'))
    await TH.expectGood(TH.requestFor(db, 'u1').putBox(u1, { vault_tok: 'vault-tok-u1', revision_tok: null }, TH.boxOf('openai', 'r1')))
    await TH.expectGood(TH.requestFor(db, 'u1').putBox(u1, { vault_tok: 'vault-tok-u1', revision_tok: null }, TH.boxOf('mistral', 'm1')))
    const named = await asked(TH.schemaOver(db), VaultOperations.safebyokDelBox, { scope: u1, boxlabel: 'openai', expected: { vault_tok: 'vault-tok-u1', revision_tok: 'rev-r1' } })
    expect(named).to.deep.equal({ data: { safebyokDelBox: { outcome: 'deleted' } } })
    const unnamed = await asked(TH.schemaOver(db), VaultOperations.safebyokDelBox, { scope: u1, boxlabel: 'mistral', expected: { vault_tok: 'vault-tok-u1' } })
    expect(unnamed).to.deep.equal({ data: { safebyokDelBox: { outcome: 'deleted_other' } } })
  })
})

describe("vaultResolvers, reading a box", () => {
  it("answers a box read in the vault it names with the box, and crosses one naming another vault as vault_mismatch, its kind alone", async () => {
    const db = await TH.emptyDatabase()
    await TH.ensureGated(TH.requestFor(db, 'u1'), TH.vaultPropsOf('u1'))
    await TH.expectGood(TH.requestFor(db, 'u1').putBox(u1, { vault_tok: 'vault-tok-u1', revision_tok: null }, TH.boxOf('openai', 'r1')))
    const read = await asked(TH.schemaOver(db), VaultOperations.safebyokGetBox, { scope: u1, boxlabel: 'openai', expected: { vault_tok: 'vault-tok-u1' } })
    expect(read).to.deep.equal({ data: { safebyokGetBox: TH.boxOf('openai', 'r1') } })
    const remade = await asked(TH.schemaOver(db), VaultOperations.safebyokGetBox, { scope: u1, boxlabel: 'openai', expected: { vault_tok: 'vault-tok-gone' } })
    expect(remade.data).to.deep.equal({ safebyokGetBox: null })
    expect(remade.errors?.map((err) => err.extensions)).to.deep.equal([{ kind: 'vault_mismatch' }])
  })
})

describe("vaultResolvers, deleting a vault", () => {
  it("answers the tombstone it leaves, and takes an expectation that leaves out its null gate_epoch as the damaged path's, which names the vault_tok alone", async () => {
    const db = await TH.emptyDatabase()
    await TH.ensureGated(TH.requestFor(db, 'u1'), TH.vaultPropsOf('u1'))
    const stale = await asked(TH.schemaOver(db), VaultOperations.safebyokDelVault, { scope: u1, expected: { vault_tok: 'vault-tok-u1', gate_epoch: 2 } })
    expect(stale.errors?.[0]?.extensions).to.deep.equal({ kind: 'stale_write' })
    const deleted = await asked(TH.schemaOver(db), VaultOperations.safebyokDelVault, { scope: u1, expected: { vault_tok: 'vault-tok-u1' } })
    expect(deleted).to.deep.equal({ data: { safebyokDelVault: { format: 'safebyok-tombstone-v1', ...u1, vault_epoch: 2 } } })
  })
})

/** Every `extensions` in `result`'s errors, as the text a log of them would hold. */
const extensionsLogged = (result: ExecutionResult): string => JSON.stringify((result.errors ?? []).map((err) => err.extensions))

describe("vaultResolvers, a write's answer in the body", () => {
  const winner = TH.vaultPropsOf('u1', { vault_tok: 'vault-tok-u1', gate_epoch: 2 })

  /** u1's vault on `db` with vault props that a write expecting gate_epoch 1 finds stale. */
  const staleOver = async (maxBoxes?: number) => {
    const db = await TH.emptyDatabase()
    const schema = TH.schemaOver(db, ({ userId }) => postgresVaultDB({ client: db, userId, ...(maxBoxes !== undefined && { maxBoxes }) }))
    await TH.ensureGated(TH.requestFor(db, 'u1'), winner)
    return schema
  }

  it("answers a stale update of the vault props landed false, with the winning props whole, and no error to log", async () => {
    const schema = await staleOver()
    const result = await asked(schema, VaultOperations.safebyokPutVaultProps, { vaultProps: TH.vaultPropsOf('u1', { gate_epoch: 3 }), expected: { vault_tok: 'vault-tok-u1', gate_epoch: 1 } })
    expect(result.errors).to.be.undefined
    expect(result.data).to.deep.equal({ safebyokPutVaultProps: {
      landed: false, refusalkind: 'stale_write', message: Refusals.StaleVaultPropsMessage, vault_props_stored: winner,
    } })
  })

  it("answers an update of the vault props that landed landed true, naming no refusal and carrying the vault props as stored, their vault_epoch moved", async () => {
    const schema = await staleOver()
    const result = await asked(schema, VaultOperations.safebyokPutVaultProps, { vaultProps: TH.vaultPropsOf('u1', { gate_epoch: 3 }), expected: { vault_tok: 'vault-tok-u1', gate_epoch: 2 } })
    expect(result).to.deep.equal({ data: { safebyokPutVaultProps: { landed: true, refusalkind: null, message: null, vault_props_stored: TH.vaultPropsOf('u1', { gate_epoch: 3, vault_epoch: 2 }) } } })
  })

  it("answers a stale box write landed false, with the winning box whole, and no error to log", async () => {
    const schema = await staleOver()
    await asked(schema, VaultOperations.safebyokPutBox, { scope: u1, box: TH.boxOf('openai', 'r1'), expected: { vault_tok: 'vault-tok-u1', revision_tok: null } })
    const result = await asked(schema, VaultOperations.safebyokPutBox, { scope: u1, box: TH.boxOf('openai', 'r2'), expected: { vault_tok: 'vault-tok-u1', revision_tok: null } })
    expect(result.errors).to.be.undefined
    expect(result.data).to.deep.equal({ safebyokPutBox: {
      landed: false, refusalkind: 'stale_write', message: Refusals.StaleBoxMessage, box_stored: TH.boxOf('openai', 'r1'), capacity: null,
    } })
  })

  it("answers a box write into a full vault landed false, with how full the vault is, and no error to log", async () => {
    const schema = await staleOver(1)
    await asked(schema, VaultOperations.safebyokPutBox, { scope: u1, box: TH.boxOf('openai', 'r1'), expected: { vault_tok: 'vault-tok-u1', revision_tok: null } })
    const result = await asked(schema, VaultOperations.safebyokPutBox, { scope: u1, box: TH.boxOf('mistral', 'm1'), expected: { vault_tok: 'vault-tok-u1', revision_tok: null } })
    expect(result.errors).to.be.undefined
    const answer = (result.data as { safebyokPutBox: { landed: boolean, refusalkind: string, capacity: { boxes: unknown }, box_stored: unknown } }).safebyokPutBox
    expect(answer).to.include({ landed: false, refusalkind: 'vault_full', box_stored: null })
    expect(answer.capacity.boxes).to.deep.equal({ used: 1, max: 1 })
  })

  it("carries no record in any error's extensions: every other refusal of a write crosses as its kind alone", async () => {
    const schema = await staleOver()
    const expected = { vault_tok: 'vault-tok-u1', revision_tok: null }
    const results = [
      await asked(schema, VaultOperations.safebyokPutBox, { scope: TH.scopeOf('u2'), box: TH.boxOf('openai', 'r1'), expected }),
      await asked(schema, VaultOperations.safebyokPutBox, { scope: u1, box: TH.boxOf('openai', 'r1'), expected: { vault_tok: 'another-vault-tok', revision_tok: null } }),
      await asked(schema, VaultOperations.safebyokDelBox, { scope: u1, boxlabel: 'openai', expected: { vault_tok: 'another-vault-tok' } }),
    ]
    expect(results.map((result) => result.errors!.map((err) => err.extensions))).to.deep.equal([[{ kind: 'identity_revoked' }], [{ kind: 'vault_mismatch' }], [{ kind: 'stale_write' }]])
  })

  it("crosses a stale_write from a verb that answers in no body as its kind alone, whatever meta a VaultDB hangs on it", async () => {
    const standing = TH.vaultPropsOf('u1')
    const stale = new VaultError('stale_write', 'The vault changed.', { meta: { vault_props_stored: standing, box_stored: TH.boxOf('openai', 'r1') } })
    const { served } = fakeServed(() => Promise.resolve({ ok: false, err: stale }))
    const schema = TH.schemaOver(await TH.database(), () => served)
    const results = [
      await asked(schema, VaultOperations.safebyokDelBox, { scope: u1, boxlabel: 'openai', expected: { vault_tok: 'vault-tok-u1' } }),
      await asked(schema, VaultOperations.safebyokGetVault, { scope: u1 }),
    ]
    for (const result of results) {
      expect(result.errors!.map((err) => err.extensions)).to.deep.equal([{ kind: 'stale_write' }])
      expect(extensionsLogged(result)).to.not.include('vault-tok-u1')
    }
  })

  it("crosses a write's refusal that carries nothing standing as its kind alone", async () => {
    const stale = new VaultError('stale_write', 'The vault changed.')
    const { served } = fakeServed(() => Promise.resolve({ ok: false, err: stale }))
    const schema = TH.schemaOver(await TH.database(), () => served)
    const result = await asked(schema, VaultOperations.safebyokPutBox, { scope: u1, box: TH.boxOf('openai', 'r1'), expected: { vault_tok: 'vault-tok-u1', revision_tok: null } })
    expect(result.errors!.map((err) => err.extensions)).to.deep.equal([{ kind: 'stale_write' }])
  })
})

describe("vaultResolvers, refusing", () => {
  it("sends a refusal as its message and kind, and nothing more", async () => {
    const result = await asked(TH.schemaOver(await TH.emptyDatabase()), VaultOperations.safebyokGetVault, { scope: TH.scopeOf('u2') })
    expect(result.data).to.deep.equal({ safebyokGetVault: null })
    expect(result.errors!.map((err) => err.toJSON())).to.deep.equal([{
      message:    'This vault belongs to another user than the one signed in: a signed-in user reaches only their own vaults. If the user changed, open the vault for the new one.',
      locations:  [{ line: 2, column: 3 }],
      path:       ['safebyokGetVault'],
      extensions: { kind: 'identity_revoked' },
    }])
  })

  it("never sends the driver's own error, but keeps it on the server as the refusal's cause", async () => {
    const dbDown = new Error('password authentication failed for user "vault_owner"')
    const schema = TH.schemaOver(await TH.database(), ({ userId }) => postgresVaultDB({ client: TH.failingClient(dbDown), userId }))
    const result = await asked(schema, VaultOperations.safebyokGetVault, { scope: u1 })
    expect(JSON.stringify(result)).to.not.include('vault_owner')
    const [crossed] = result.errors!
    expect(crossed!.extensions).to.deep.equal({ kind: 'storage_unavailable' })
    const refusal = refusalBehind(crossed)
    expect(refusal).to.be.instanceOf(VaultError)
    expect(refusal.refusalkind).to.eq('storage_unavailable')
    expect(refusal.cause).to.eq(dbDown)
  })

  it("keeps the cause unenumerable, so a server that spreads an error never sends it", async () => {
    const dbDown = new Error('password authentication failed for user "vault_owner"')
    const schema = TH.schemaOver(await TH.database(), ({ userId }) => postgresVaultDB({ client: TH.failingClient(dbDown), userId }))
    const result = await asked(schema, VaultOperations.safebyokGetVault, { scope: u1 })
    const crossed = result.errors![0]!.cause
    expect(crossed).to.be.instanceOf(GraphQLError)
    expect(Object.keys(crossed as GraphQLError)).to.not.include('cause')
    const spread = Object.fromEntries(Object.entries(crossed as GraphQLError))
    expect(JSON.stringify(spread)).to.not.include('vault_owner')
  })

  it("sends anything else a VaultDB throws as storage_unavailable, keeping it as the refusal's cause", async () => {
    const oops = new Error('connection terminated unexpectedly')
    const { served } = fakeServed(() => Promise.reject(oops))
    const result = await asked(TH.schemaOver(await TH.database(), () => served), VaultOperations.safebyokDelVault, { scope: u1, expected: { vault_tok: 'vault-tok-u1' } })
    expect(result.errors![0]!.extensions).to.deep.equal({ kind: 'storage_unavailable' })
    expect(result.errors![0]!.message).to.not.include('terminated')
    expect(refusalBehind(result.errors![0]).cause).to.eq(oops)
  })

  it("sends a vaultDBFor that throws as bad_option with a generic message, keeping its own as the cause", async () => {
    const schema = TH.schemaOver(await TH.database(), () => postgresVaultDB({ client: null as never, userId: 'u1' }))
    const result = await asked(schema, VaultOperations.safebyokGetVault, { scope: u1 })
    const [crossed] = result.errors!
    expect(crossed!.extensions).to.deep.equal({ kind: 'bad_option' })
    expect(crossed!.message).to.include("its own setup is wrong")
    expect(crossed!.message).to.not.include('client')
    const ownRefusal = refusalBehind(crossed).cause as VaultError
    expect(ownRefusal.refusalkind).to.eq('bad_option')
    expect(ownRefusal.message).to.include('client')
  })

  it("sends a VaultError vaultDBFor throws as it is, kind and message: the host refusing the request", async () => {
    const schema = TH.schemaOver(await TH.database(), () => { throw Refusals.notPermitted('Guests may not keep a vault.') })
    const read = await asked(schema, VaultOperations.safebyokGetVault, { scope: u1 })
    const watched = await subscribe({ schema, document: parse(VaultOperations.safebyokVaultChanged), variableValues: { scope: u1 }, contextValue: { userId: 'u1' } }) as ExecutionResult
    for (const crossed of [read.errors![0], watched.errors![0]]) {
      expect(crossed!.extensions).to.deep.equal({ kind: 'not_permitted' })
      expect(crossed!.message).to.eq('Guests may not keep a vault.')
    }
  })

  it("sends anything else vaultDBFor throws as bad_option too, before subscribing as before reading", async () => {
    const oops = new Error('AUTH_SECRET is not set')
    const schema = TH.schemaOver(await TH.database(), () => { throw oops })
    const read = await asked(schema, VaultOperations.safebyokGetVault, { scope: u1 })
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
    await TH.ensureGated(TH.requestFor(db, 'u1'), TH.vaultPropsOf('u1'))
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
