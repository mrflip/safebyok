import { describe, expect, it } from 'vitest'
import { Client, CombinedError, fetchExchange } from '@urql/core'
import { executeExchange } from '@urql/exchange-execute'
import { buildSchema, type GraphQLSchema } from 'graphql'
import { VaultError, memoryDeviceDB, openVault } from 'safebyok'
import { postgresVaultDB } from 'safebyok-postgres'
import * as TH from './test-helpers'
import { graphqlVaultDB } from '../src/index'
import type { GraphqlVaultClient, GraphqlVaultDBOpts } from '../src/index'

TH.bootDatabaseFirst()

/**
 * Devices over this file's database, emptied: each a browser of its own, with urql Clients of its
 * own, served by a server of its own whose statements pass the race's turnstile on their way to
 * the one PGlite beneath them all. The turnstile is at the database, where a server's write is
 * one statement, rather than at the wire, where it is one request.
 */
const browsersOverPGlite: TH.MakeVaultDBDevices = async (turnstile) => {
  const db = await TH.emptyDatabase()
  return ({ maxLockboxes }) => {
    const client = TH.throughTurnstile(turnstile, db, ['query', 'listen'])
    const schema = TH.schemaOver(db, ({ userId }) => postgresVaultDB({ client, userId, listen: (channel, onNotify) => client.listen(channel, onNotify), maxLockboxes }))
    return TH.perUser((userId) => graphqlVaultDB(TH.urqlClientFor(schema, userId), { maxLockboxes }))
  }
}

TH.describeVaultDB('graphqlVaultDB, through vaultResolvers to postgresVaultDB over PGlite', async () => {
  const schema = TH.schemaOver(await TH.emptyDatabase())
  return TH.perUser((userId) => TH.browserFor(schema, userId))
}, {
  makeCappedVaultDB: async (maxLockboxes) => {
    const db = await TH.emptyDatabase()
    const schema = TH.schemaOver(db, ({ userId }) => postgresVaultDB({ client: db, userId, maxLockboxes }))
    return TH.perUser((userId) => graphqlVaultDB(TH.urqlClientFor(schema, userId), { maxLockboxes }))
  },
  makeVaultDBFor: async () => {
    const schema = TH.schemaOver(await TH.emptyDatabase())
    return (userId) => TH.browserFor(schema, userId)
  },
  pushes:      true,
  makeDevices: browsersOverPGlite,
})

describe("graphqlVaultDB's devices, for the battery's races", () => {
  it("send every write's statement, on the server, through the race's turnstile", async () => {
    await TH.expectRoundTripsThroughTurnstile(browsersOverPGlite)
  })
})

const u1 = TH.scopeOf('u1')
const thisVault = { vault_id: 'vault-id-u1' }

/** u1's main vault, opened by the core in a browser of its own, over graphqlVaultDB to `schema`. */
const vaultIn = (schema: GraphQLSchema) => openVault({
  applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB: TH.browserFor(schema, 'u1'), deviceDB: memoryDeviceDB(), keyDeriver: TH.testDeriver,
})

/** A fetch with no network behind it. */
const offline = () => Promise.reject(new TypeError('Failed to fetch'))

describe("graphqlVaultDB, its client", () => {
  const BadClients = [
    [null,                                                      'no client at all'],
    [{},                                                        'an object with none of a Client\'s methods'],
    [{ query: () => null, mutation: () => null },               'a client that cannot subscribe'],
    [(url: string) => fetch(url),                               'a fetch function, not a Client'],
    ['https://app.example.test/api/graphql',                    'the url alone'],
  ] as const

  for (const [client, blurb] of BadClients) {
    it(`refuses ${blurb}, with kind bad_option`, () => {
      expect(() => graphqlVaultDB(client as unknown as GraphqlVaultClient)).to.throw(VaultError).with.property('kind', 'bad_option')
    })
  }

  it("declares a mebibyte to a record, no limit to a vault's bytes, and 1000 lockboxes to a vault", () => {
    const vaultDB = graphqlVaultDB(new Client({ url: 'https://app.example.test/api/graphql', exchanges: [fetchExchange] }))
    expect(vaultDB.maxRecordBytes).to.eq(1024 * 1024)
    expect(vaultDB.maxVaultBytes).to.eq(Infinity)
    expect(vaultDB.maxLockboxes).to.eq(1000)
  })

  it("declares by default the lockbox limit the Postgres VaultDB holds by default", () => {
    const client = new Client({ url: 'https://app.example.test/api/graphql', exchanges: [fetchExchange] })
    const server = postgresVaultDB({ client: { query: offline }, userId: 'u1' })
    expect(graphqlVaultDB(client).maxLockboxes).to.eq(server.maxLockboxes)
  })

  it("declares the maxLockboxes it is given, Infinity among them, as the README's example gives it", () => {
    const client = new Client({ url: 'https://app.example.test/api/graphql', exchanges: [fetchExchange] })
    expect(graphqlVaultDB(client, { maxLockboxes: 250 }).maxLockboxes).to.eq(250)
    expect(graphqlVaultDB(client, { maxLockboxes: Infinity }).maxLockboxes).to.eq(Infinity)
    expect(graphqlVaultDB(client, {}).maxLockboxes).to.eq(1000)
  })

  const BadLockboxLimits = [
    [0,          'a maxLockboxes of none'],
    [2.5,        'a maxLockboxes that is no whole number'],
    ['1000',     'a maxLockboxes that is text'],
    [NaN,        'a maxLockboxes of NaN'],
    [-Infinity,  'a maxLockboxes of -Infinity'],
  ] as const

  for (const [maxLockboxes, blurb] of BadLockboxLimits) {
    it(`refuses ${blurb}, with kind bad_option`, () => {
      const client = new Client({ url: 'https://app.example.test/api/graphql', exchanges: [fetchExchange] })
      expect(() => graphqlVaultDB(client, { maxLockboxes } as unknown as GraphqlVaultDBOpts)).to.throw(VaultError).with.property('kind', 'bad_option')
    })
  }
})

describe("graphqlVaultDB, a server's lockbox limit", () => {
  it("carries the server's vault_full refusal back as itself, kind and message, naming no boxlabel", async () => {
    const db = await TH.emptyDatabase()
    const schema = TH.schemaOver(db, ({ userId }) => postgresVaultDB({ client: db, userId, maxLockboxes: 1 }))
    // A browser declaring more than its server holds: the server holds the line.
    const vaultDB = graphqlVaultDB(TH.urqlClientFor(schema, 'u1'), { maxLockboxes: Infinity })
    await vaultDB.createBundle(TH.bundleOf('u1'))
    await vaultDB.updateBox(u1, TH.boxOf('openai', 'sk-fake-one'), { vault_id: 'vault-id-u1', revision_id: null, vault_key_epoch: 1 })
    const refusal = await TH.expectRefusal(vaultDB.updateBox(u1, TH.boxOf('secret_project_x', 'sk-fake-two'), { vault_id: 'vault-id-u1', revision_id: null, vault_key_epoch: 1 }), 'vault_full')
    expect(refusal).to.be.instanceOf(VaultError)
    expect(refusal.message).to.include('1 lockboxes')
    expect(refusal.message).to.not.include('secret_project_x')
    const listed = await vaultDB.listBoxes(u1)
    expect(listed.map((box) => box.boxlabel)).to.deep.equal(['openai'])
  })

  it("has a vault opened over it refuse a maxLockboxes above what it declares", async () => {
    const schema = TH.schemaOver(await TH.emptyDatabase())
    const vaultDB = graphqlVaultDB(TH.urqlClientFor(schema, 'u1'), { maxLockboxes: 3 })
    const refusal = await TH.expectRefusal(openVault({
      applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB, deviceDB: memoryDeviceDB(), keyDeriver: TH.testDeriver, maxLockboxes: 4,
    }), 'bad_option')
    expect(refusal.message).to.include('3 lockboxes')
  })
})

describe("graphqlVaultDB, as the README has it", () => {
  it("carries a real vault, made and opened by the core in the browser", async () => {
    const schema = TH.schemaOver(await TH.emptyDatabase())
    const opened = () => vaultIn(schema)
    const first = await opened()
    await first.unlock('correct horse battery staple')
    await first.store('anthropic_api_key', 'sk-ant-test-not-a-real-key', { public: { note: 'work account' } })
    await first.store('openai_api_key', { apiKey: 'sk-test-not-a-real-key', orgId: null })
    first.close()

    const second = await opened()
    await second.unlock('correct horse battery staple')
    expect(await second.read('anthropic_api_key')).to.eq('sk-ant-test-not-a-real-key')
    expect(await second.read('openai_api_key')).to.deep.equal({ apiKey: 'sk-test-not-a-real-key', orgId: null })
    expect(second.getSnapshot().boxes.map((box) => box.damaged ? null : box.public)).to.deep.equal([{ note: 'work account' }, {}])
    await second.erase('openai_api_key')
    expect(second.getSnapshot().boxes.map((box) => box.boxlabel)).to.deep.equal(['anthropic_api_key'])
    second.close()
  })

  it("never lets the Client's cache answer: a read after another device's write sees it", async () => {
    const schema = TH.schemaOver(await TH.emptyDatabase())
    const browser = TH.browserFor(schema, 'u1')
    expect(await browser.readBundle(u1)).to.be.null
    await TH.browserFor(schema, 'u1').createBundle(TH.bundleOf('u1'))
    expect(await browser.readBundle(u1)).to.deep.equal(TH.bundleOf('u1'))
  })
})

describe("graphqlVaultDB, carrying a passkey's way in", () => {
  it("stores a bundle holding a passkey envelope and reads it back exactly, with no change to the schema", async () => {
    const schema = TH.schemaOver(await TH.emptyDatabase())
    const withPasskey = TH.bundleOf('u1', { unlocks: [TH.envelopeOf('passphrase'), TH.passkeyEnvelopeOf('laptop')] })
    await TH.browserFor(schema, 'u1').createBundle(withPasskey)
    expect(await TH.browserFor(schema, 'u1').readBundle(u1)).to.deep.equal(withPasskey)
  })

  it("lets a real vault add a passkey through it, a bundle update, and another device unlock with that passkey alone", async () => {
    const schema = TH.schemaOver(await TH.emptyDatabase())
    const opened = () => vaultIn(schema)
    const laptop = await TH.passkeyOf('laptop')
    const first = await opened()
    await first.unlock('correct horse battery staple')
    await first.store('anthropic_api_key', 'sk-ant-test-not-a-real-key')
    const unlockId = await first.addPasskey('correct horse battery staple', () => Promise.resolve(laptop), { unlocklabel: 'laptop' })
    first.close()

    const second = await opened()
    expect(second.getSnapshot().unlocks).to.deep.include({
      method: 'passkey', unlock_id: unlockId, unlocklabel: 'laptop', credential_id: laptop.credentialId, prf_salt_b64: laptop.prfSaltB64,
    })
    await second.unlock(laptop)
    expect(await second.read('anthropic_api_key')).to.eq('sk-ant-test-not-a-real-key')
    second.close()
  })
})

describe("graphqlVaultDB, its refusals", () => {
  it("carries the server's refusal across as the same VaultError, kind and message", async () => {
    const schema = TH.schemaOver(await TH.emptyDatabase())
    const notMine = await TH.refusalOf(TH.browserFor(schema, 'u1').readBundle(TH.scopeOf('u2')))
    expect(notMine).to.be.instanceOf(VaultError)
    expect(notMine.kind).to.eq('identity_revoked')
    expect(notMine.message).to.eq('This vault belongs to another user than the one signed in: a signed-in user reaches only their own vaults. If the user changed, open the vault for the new one.')
    expect(notMine.cause).to.be.undefined
  })

  it("refuses with storage_unavailable when the database is down, never saying what the driver said", async () => {
    const dbDown = new Error('password authentication failed for user "vault_owner"')
    const schema = TH.schemaOver(await TH.database(), ({ userId }) => postgresVaultDB({ client: TH.failingClient(dbDown), userId }))
    const refusal = await TH.refusalOf(TH.browserFor(schema, 'u1').readBundle(u1))
    expect(refusal.kind).to.eq('storage_unavailable')
    expect(String(refusal.message)).to.not.include('vault_owner')
    expect(JSON.stringify(refusal)).to.not.include('vault_owner')
  })

  it("refuses with storage_unavailable, urql's error its cause, when the server does not serve the vault's schema", async () => {
    const schema = buildSchema('type Query { hello: String }')
    const vaultDB = graphqlVaultDB(new Client({ url: 'https://app.example.test/api/graphql', exchanges: [executeExchange({ schema })] }))
    const refusal = await TH.refusalOf(vaultDB.readBundle(u1))
    expect(refusal.kind).to.eq('storage_unavailable')
    expect(refusal.cause).to.be.instanceOf(CombinedError)
  })

  it("refuses with storage_unavailable when the network fails", async () => {
    const vaultDB = graphqlVaultDB(new Client({ url: 'https://app.example.test/api/graphql', exchanges: [fetchExchange], fetch: offline }))
    const refusal = await TH.refusalOf(vaultDB.updateBox(u1, TH.boxOf('openai', 'r1'), { vault_id: 'vault-id-u1', revision_id: null, vault_key_epoch: 1 }))
    expect(refusal.kind).to.eq('storage_unavailable')
  })

  it("refuses with storage_unavailable an answer holding neither data nor an error", async () => {
    const answered = { toPromise: () => Promise.resolve({ data: undefined }) }
    const mute = { query: () => answered, mutation: () => answered, subscription: () => answered }
    const refusal = await TH.refusalOf(graphqlVaultDB(mute as unknown as GraphqlVaultClient).readBundle(u1))
    expect(refusal.kind).to.eq('storage_unavailable')
  })

  it("passes over a GraphQL error whose kind is not a VaultError's", async () => {
    const schema = buildSchema('type Query { safebyokReadBundle(scope: SafebyokVaultScopeInput!): Boolean } input SafebyokVaultScopeInput { applabel: String!, user_id: String!, vaultlabel: String! }')
    const rootValue = { safebyokReadBundle: () => Promise.reject(Object.assign(new Error('no such kind'), { extensions: { kind: 'made_up' } })) }
    const vaultDB = graphqlVaultDB(new Client({ url: 'https://app.example.test/api/graphql', exchanges: [executeExchange({ schema, rootValue })] }))
    const refusal = await TH.refusalOf(vaultDB.readBundle(u1))
    expect(refusal.kind).to.eq('storage_unavailable')
  })
})

describe("graphqlVaultDB, hearing other writes", () => {
  it("hears another device's write to its vault, and stops when unsubscribed", async () => {
    const schema = TH.schemaOver(await TH.emptyDatabase())
    const elsewhere = TH.browserFor(schema, 'u1')
    await elsewhere.createBundle(TH.bundleOf('u1'))
    const { heard, unsubscribe } = await TH.liveWatch(TH.browserFor(schema, 'u1'), u1)
    await elsewhere.updateBox(u1, TH.boxOf('openai', 'r1'), { ...thisVault, revision_id: null, vault_key_epoch: 1 })
    await TH.eventually(() => heard.count === 1)
    unsubscribe()
    await elsewhere.eraseBox(u1, 'openai', thisVault)
    await TH.aWhile()
    expect(heard.count).to.eq(1)
  })

  it("hears nothing of another vault's writes", async () => {
    const schema = TH.schemaOver(await TH.emptyDatabase())
    const { heard, unsubscribe } = await TH.liveWatch(TH.browserFor(schema, 'u1'), u1)
    await TH.browserFor(schema, 'u2').createBundle(TH.bundleOf('u2'))
    await TH.browserFor(schema, 'u1').createBundle(TH.bundleOf('u1', { vaultlabel: 'spare' }))
    await TH.aWhile()
    expect(heard.count).to.eq(0)
    unsubscribe()
  })

  it("hears nothing, and throws nothing, when the server refuses the subscription", async () => {
    const schema = TH.schemaOver(await TH.emptyDatabase())
    const { heard, onChange } = TH.changeCounter()
    const unsubscribe = TH.browserFor(schema, 'u1').subscribe(TH.scopeOf('u2'), onChange)
    await TH.browserFor(schema, 'u2').createBundle(TH.bundleOf('u2'))
    await TH.aWhile()
    expect(heard.count).to.eq(0)
    unsubscribe()
  })

  it("hears nothing through a Client that has no way to send subscriptions", async () => {
    const vaultDB = graphqlVaultDB(new Client({ url: 'https://app.example.test/api/graphql', exchanges: [fetchExchange], fetch: offline }))
    const { heard, onChange } = TH.changeCounter()
    const unsubscribe = vaultDB.subscribe(u1, onChange)
    await TH.aWhile()
    expect(heard.count).to.eq(0)
    unsubscribe()
  })
})
