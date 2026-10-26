import { describe, expect, it } from 'vitest'
import { Client, CombinedError, fetchExchange } from '@urql/core'
import { executeExchange } from '@urql/exchange-execute'
import { GraphQLError, buildSchema, type GraphQLSchema } from 'graphql'
import { Refusals, VaultError, memoryDeviceDB } from 'safebyok'
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
  return ({ maxBoxes }) => {
    const client = TH.throughTurnstile(turnstile, db, ['query', 'listen'])
    const schema = TH.schemaOver(db, ({ user_id }) => postgresVaultDB({ client, user_id, listen: (channel, onNotify) => client.listen(channel, onNotify), maxBoxes }))
    return TH.perUser((user_id) => graphqlVaultDB({ client: TH.urqlClientFor(schema, user_id), maxBoxes }))
  }
}

TH.describeVaultDB('graphqlVaultDB, through vaultResolvers to postgresVaultDB over PGlite', async (vaultDBOpts) => {
  const schema = TH.schemaOver(await TH.emptyDatabase())
  return TH.perUser((user_id) => TH.browserFor(schema, user_id, vaultDBOpts))
}, {
  makeCappedVaultDB: async (maxBoxes) => {
    const db = await TH.emptyDatabase()
    const schema = TH.schemaOver(db, ({ user_id }) => postgresVaultDB({ client: db, user_id, maxBoxes }))
    return TH.perUser((user_id) => graphqlVaultDB({ client: TH.urqlClientFor(schema, user_id), maxBoxes }))
  },
  makeVaultDBFor: async () => {
    const schema = TH.schemaOver(await TH.emptyDatabase())
    return (user_id) => TH.browserFor(schema, user_id)
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
const thisVault = { vault_tok: 'vault-tok-u1' }

/** u1's main vault, opened by the core in a browser of its own, over graphqlVaultDB to `schema`. */
const vaultIn = (schema: GraphQLSchema) => TH.settledVault({
  applabel: 'acme', user_id: 'u1', vaultlabel: 'main', vaultDB: TH.browserFor(schema, 'u1'), deviceDB: memoryDeviceDB(), keyDeriver: TH.testDeriver, strengthChecker: TH.anyStrengthChecker,
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
      expect(() => graphqlVaultDB({ client: client as unknown as GraphqlVaultClient })).to.throw(VaultError).with.property('refusalkind', 'bad_option')
    })
  }

  it("declares a mebibyte to a record, and no limit to a vault's bytes or its boxes", () => {
    const vaultDB = graphqlVaultDB({ client: new Client({ url: 'https://app.example.test/api/graphql', exchanges: [fetchExchange] }) })
    expect(vaultDB.maxRecordBytes).to.eq(1024 * 1024)
    expect(vaultDB.maxVaultBytes).to.eq(Infinity)
    expect(vaultDB.maxBoxes).to.eq(Infinity)
  })

  it("declares by default the box limit the Postgres VaultDB holds by default", () => {
    const client = new Client({ url: 'https://app.example.test/api/graphql', exchanges: [fetchExchange] })
    const server = postgresVaultDB({ client: { query: offline }, user_id: 'u1' })
    expect(graphqlVaultDB({ client }).maxBoxes).to.eq(server.maxBoxes)
  })

  it("declares the maxBoxes it is given, Infinity among them, as the README's example gives it", () => {
    const client = new Client({ url: 'https://app.example.test/api/graphql', exchanges: [fetchExchange] })
    expect(graphqlVaultDB({ client, maxBoxes: 250 }).maxBoxes).to.eq(250)
    expect(graphqlVaultDB({ client, maxBoxes: Infinity }).maxBoxes).to.eq(Infinity)
    expect(graphqlVaultDB({ client }).maxBoxes).to.eq(Infinity)
  })

  const BadBoxLimits = [
    [0,          'a maxBoxes of none'],
    [2.5,        'a maxBoxes that is no whole number'],
    ['1000',     'a maxBoxes that is text'],
    [NaN,        'a maxBoxes of NaN'],
    [-Infinity,  'a maxBoxes of -Infinity'],
  ] as const

  for (const [maxBoxes, blurb] of BadBoxLimits) {
    it(`refuses ${blurb}, with kind bad_option`, () => {
      const client = new Client({ url: 'https://app.example.test/api/graphql', exchanges: [fetchExchange] })
      expect(() => graphqlVaultDB({ client, maxBoxes } as unknown as GraphqlVaultDBOpts)).to.throw(VaultError).with.property('refusalkind', 'bad_option')
    })
  }
})

describe("graphqlVaultDB, a server's box limit", () => {
  it("carries the server's vault_full refusal back as itself, kind, message and how full the vault is, naming no boxlabel", async () => {
    const db = await TH.emptyDatabase()
    const schema = TH.schemaOver(db, ({ user_id }) => postgresVaultDB({ client: db, user_id, maxBoxes: 1 }))
    // A browser declaring more than its server holds: the server holds the line.
    const vaultDB = graphqlVaultDB({ client: TH.urqlClientFor(schema, 'u1'), maxBoxes: Infinity })
    await TH.ensureGated(vaultDB, TH.vaultRecordOf('u1'))
    await TH.expectingGood(vaultDB).putBox(u1, { vault_tok: 'vault-tok-u1', revision_tok: null }, TH.boxOf('openai', 'sk-fake-one'))
    const refusal = await TH.expectBad(vaultDB.putBox(u1, { vault_tok: 'vault-tok-u1', revision_tok: null }, TH.boxOf('secret_project_x', 'sk-fake-two')), 'vault_full')
    expect(refusal).to.be.instanceOf(VaultError)
    expect(refusal.message).to.include('1 boxes')
    expect(refusal.message).to.not.include('secret_project_x')
    expect(refusal.meta?.capacity).to.deep.equal(await TH.expectingGood(vaultDB).getCapacity(u1))
    expect(refusal.meta?.capacity?.boxes).to.deep.equal({ used: 1, max: 1 })
    const listed = await TH.boxesOf(vaultDB, u1)
    expect(listed.map((box) => box.boxlabel)).to.deep.equal(['openai'])
  })

  it("reads how full a vault is from the server's storage, a limit it does not keep the largest safe integer", async () => {
    const db = await TH.emptyDatabase()
    const schema = TH.schemaOver(db, ({ user_id }) => postgresVaultDB({ client: db, user_id }))
    const vaultDB = graphqlVaultDB({ client: TH.urqlClientFor(schema, 'u1') })
    await TH.ensureGated(vaultDB, TH.vaultRecordOf('u1'))
    await TH.expectingGood(vaultDB).putBox(u1, { vault_tok: 'vault-tok-u1', revision_tok: null }, TH.boxOf('openai', 'sk-fake-one'))
    const capacity = await TH.expectingGood(vaultDB).getCapacity(u1)
    expect(capacity.boxes).to.deep.equal({ used: 1, max: Number.MAX_SAFE_INTEGER })
    expect(capacity.bytes.max).to.eq(Number.MAX_SAFE_INTEGER)
    expect(capacity.bytes.used).to.be.greaterThan(0)
  })

  it("has a vault opened over it refuse a maxBoxes above what it declares", async () => {
    const schema = TH.schemaOver(await TH.emptyDatabase())
    const vaultDB = graphqlVaultDB({ client: TH.urqlClientFor(schema, 'u1'), maxBoxes: 3 })
    const refusal = await TH.expectRefusal(TH.settledVault({
      applabel: 'acme', user_id: 'u1', vaultlabel: 'main', vaultDB, deviceDB: memoryDeviceDB(), keyDeriver: TH.testDeriver, strengthChecker: TH.anyStrengthChecker, maxBoxes: 4,
    }), 'bad_option')
    expect(refusal.message).to.include('3 boxes')
  })
})

describe("graphqlVaultDB, as the README has it", () => {
  it("carries a real vault, made and opened by the core in the browser", async () => {
    const schema = TH.schemaOver(await TH.emptyDatabase())
    const opened = () => vaultIn(schema)
    const first = await opened()
    await TH.unlock(first, 'correct horse battery staple')
    await first.putBox({ boxlabel: 'anthropic_api_key', sidecar: { note: 'work account' } }, 'sk-ant-test-not-a-real-key')
    await first.putBox({ boxlabel: 'openai_api_key' }, { apiKey: 'sk-test-not-a-real-key', orgId: null })
    TH.closeVault(first)

    const second = await opened()
    await TH.unlock(second, 'correct horse battery staple')
    expect(await second.getWhisper('anthropic_api_key')).to.eq('sk-ant-test-not-a-real-key')
    expect(await second.getWhisper('openai_api_key')).to.deep.equal({ apiKey: 'sk-test-not-a-real-key', orgId: null })
    expect(second.getSnapshot().boxes.map((box) => box.sidecar)).to.deep.equal([{ note: 'work account' }, {}])
    await second.delBox('openai_api_key')
    expect(second.getSnapshot().boxes.map((box) => box.boxlabel)).to.deep.equal(['anthropic_api_key'])
    TH.closeVault(second)
  })

  it("never lets the Client's cache answer: a read after another device's write sees it", async () => {
    const schema = TH.schemaOver(await TH.emptyDatabase())
    const browser = TH.browserFor(schema, 'u1')
    expect(await TH.vaultRecordIn(browser, u1)).to.be.null
    await TH.ensureGated(TH.browserFor(schema, 'u1'), TH.vaultRecordOf('u1'))
    expect(await TH.vaultRecordIn(browser, u1)).to.deep.equal(TH.vaultRecordOf('u1'))
  })
})

describe("graphqlVaultDB, carrying a passkey's way in", () => {
  it("stores a vault record holding a passkey and reads it back exactly", async () => {
    const schema = TH.schemaOver(await TH.emptyDatabase())
    const withPasskey = TH.vaultRecordOf('u1', { gate: TH.gateOf('u1', { passkey: TH.passkeyWayinOf('laptop') }) })
    await TH.ensureGated(TH.browserFor(schema, 'u1'), withPasskey)
    expect(await TH.vaultRecordIn(TH.browserFor(schema, 'u1'), u1)).to.deep.equal(withPasskey)
  })

  it("lets a real vault add a passkey through it, an update of its props, and unlock it on another device with that passkey alone", async () => {
    const schema = TH.schemaOver(await TH.emptyDatabase())
    const opened = () => vaultIn(schema)
    const laptop = await TH.passkeyOf('laptop')
    const first = await opened()
    await TH.unlock(first, 'correct horse battery staple')
    await first.putBox({ boxlabel: 'anthropic_api_key' }, 'sk-ant-test-not-a-real-key')
    expect(await TH.putWayin(first, 'correct horse battery staple', laptop)).to.deep.equal(first.snapshot.gate?.passkey)
    TH.closeVault(first)

    const second = await opened()
    expect(second.getSnapshot().gate?.passkey).to.deep.include({
      wayinkind: 'passkey', credential_id: laptop.credential_id, prf_salt_b64: laptop.prf_salt_b64,
    })
    await TH.unlock(second, await TH.passkeyOf('laptop'))
    expect(await second.getWhisper('anthropic_api_key')).to.eq('sk-ant-test-not-a-real-key')
    TH.closeVault(second)
  })
})

/** A graphqlVaultDB whose server answers every operation with `answer` as the data of a successful response. */
const answering = (answer: unknown) => {
  const answered = { toPromise: () => Promise.resolve({ data: answer }) }
  return graphqlVaultDB({ client: { query: () => answered, mutation: () => answered, subscription: () => answered } as unknown as GraphqlVaultClient })
}

describe("graphqlVaultDB, reading a vault the server split", () => {
  it("passes through the server's sound and damaged boxes, leaving GraphQL's __typename behind before the strict checks", async () => {
    const { box_key_wrapped: _wrapped, whisper_ciphered: _ciphered, ...sparse } = TH.boxOf('openai', 'r1')
    const relayed = answering({ safebyokGetVault: {
      __typename:   'SafebyokVault',
      vault:        { ...TH.vaultRecordOf('u1'), __typename: 'SafebyokVaultRecord' },
      boxes:        [{ ...sparse, __typename: 'SafebyokBoxSparse' }],
      damagedBoxes: [{ boxlabel: 'anthropic', revision_tok: null, damage: 'newer_format', __typename: 'SafebyokBoxDamaged' }],
    } })
    expect(await TH.expectingGood(relayed).getVault(u1)).to.deep.equal({
      ...TH.vaultRecordOf('u1'),
      boxes:        [sparse],
      damagedBoxes: [{ boxlabel: 'anthropic', revision_tok: null, damage: 'newer_format' }],
    })
  })

  it("refuses as corrupt_record a server's damaged box that is no BoxDamaged, and judges again a sound box that is no box", async () => {
    const lying = answering({ safebyokGetVault: { vault: TH.vaultRecordOf('u1'), boxes: [], damagedBoxes: [{ boxlabel: 'anthropic', revision_tok: null, damage: 'fine' }] } })
    await TH.expectBad(lying.getVault(u1), 'corrupt_record')
    const unsound = answering({ safebyokGetVault: { vault: TH.vaultRecordOf('u1'), boxes: [{ ...TH.boxOf('openai', 'r1'), sidecar: 'none' }], damagedBoxes: [] } })
    expect(await TH.damagedBoxesOf(unsound, u1)).to.deep.equal([{ boxlabel: 'openai', revision_tok: 'rev-r1', damage: 'damaged' }])
  })
})

describe("graphqlVaultDB, its refusals", () => {
  it("carries the server's refusal across as the same VaultError, kind and message, the GraphQL error it crossed as its cause", async () => {
    const schema = TH.schemaOver(await TH.emptyDatabase())
    const notMine = await TH.expectBad(TH.browserFor(schema, 'u1').getVault(TH.scopeOf('u2')), 'identity_revoked')
    expect(notMine.message).to.eq('This vault belongs to another user than the one signed in: a signed-in user reaches only their own vaults. If the user changed, open the vault for the new one.')
    expect(notMine.cause).to.include({ message: notMine.message }).and.to.have.nested.property('extensions.kind', 'identity_revoked')
  })

  it("carries the host's not_permitted across, kind and message, locking nothing (Contract: VaultDB, What an adapter must do)", async () => {
    const schema = TH.schemaOver(await TH.database(), () => { throw Refusals.notPermitted('Guests may not keep a vault.') })
    const refusal = await TH.expectBad(TH.browserFor(schema, 'u1').ensureVault(TH.gatelessOf('u1')), 'not_permitted')
    expect(refusal.message).to.eq('Guests may not keep a vault.')
    expect(refusal.family).to.eq('condition')
    expect(refusal.cause).to.have.nested.property('extensions.kind', 'not_permitted')
  })

  it("refuses a GraphQL server's own FORBIDDEN as not_permitted, its error as the cause", async () => {
    const forbidden = new GraphQLError('Guests may not keep a vault.', { extensions: { code: 'FORBIDDEN' } })
    const answered = { toPromise: () => Promise.resolve({ error: new CombinedError({ graphQLErrors: [forbidden] }) }) }
    const guarded = { query: () => answered, mutation: () => answered, subscription: () => answered }
    const refusal = await TH.expectBad(graphqlVaultDB({ client: guarded as unknown as GraphqlVaultClient }).getVault(u1), 'not_permitted')
    expect(refusal.message).to.include("by a rule of the app's own")
    expect(refusal.cause).to.include({ message: 'Guests may not keep a vault.' })
  })

  it("refuses a GraphQL server's own UNAUTHENTICATED as storage_unavailable, which locks nothing: a token mid-refresh is not a user gone", async () => {
    const unauthenticated = new GraphQLError('Your session has expired.', { extensions: { code: 'UNAUTHENTICATED' } })
    const answered = { toPromise: () => Promise.resolve({ error: new CombinedError({ graphQLErrors: [unauthenticated] }) }) }
    const guarded = { query: () => answered, mutation: () => answered, subscription: () => answered }
    await TH.expectBad(graphqlVaultDB({ client: guarded as unknown as GraphqlVaultClient }).getVault(u1), 'storage_unavailable')
  })

  it("refuses with storage_unavailable when the database is down, never saying what the driver said", async () => {
    const dbDown = new Error('password authentication failed for user "vault_owner"')
    const schema = TH.schemaOver(await TH.database(), ({ user_id }) => postgresVaultDB({ client: TH.failingClient(dbDown), user_id }))
    const refusal = await TH.expectBad(TH.browserFor(schema, 'u1').getVault(u1), 'storage_unavailable')
    expect(refusal.message).to.not.include('vault_owner')
    expect(JSON.stringify(refusal)).to.not.include('vault_owner')
  })

  it("refuses with storage_unavailable, its cause saying so, when the server does not serve the vault's schema and answers without checking the operation", async () => {
    const schema = buildSchema('type Query { hello: String }')
    const vaultDB = graphqlVaultDB({ client: new Client({ url: 'https://app.example.test/api/graphql', exchanges: [executeExchange({ schema })] }) })
    const refusal = await TH.expectBad(vaultDB.getVault(u1), 'storage_unavailable')
    expect(refusal.cause).to.be.instanceOf(Error).with.property('message').that.includes('is it serving safebyok-graphql?')
  })

  it("refuses with storage_unavailable, urql's error its cause, when the server checks the operation against a schema without the vault's", async () => {
    const unknownField = new GraphQLError('Cannot query field "safebyokGetVault" on type "Query".')
    const answered = { toPromise: () => Promise.resolve({ error: new CombinedError({ graphQLErrors: [unknownField] }) }) }
    const server = { query: () => answered, mutation: () => answered, subscription: () => answered }
    const refusal = await TH.expectBad(graphqlVaultDB({ client: server as unknown as GraphqlVaultClient }).getVault(u1), 'storage_unavailable')
    expect(refusal.cause).to.be.instanceOf(CombinedError)
  })

  it("refuses with storage_unavailable when the network fails", async () => {
    const vaultDB = graphqlVaultDB({ client: new Client({ url: 'https://app.example.test/api/graphql', exchanges: [fetchExchange], fetch: offline }) })
    await TH.expectBad(vaultDB.putBox(u1, { vault_tok: 'vault-tok-u1', revision_tok: null }, TH.boxOf('openai', 'r1')), 'storage_unavailable')
  })

  it("refuses with storage_unavailable an answer holding neither data nor an error", async () => {
    const answered = { toPromise: () => Promise.resolve({ data: undefined }) }
    const mute = { query: () => answered, mutation: () => answered, subscription: () => answered }
    await TH.expectBad(graphqlVaultDB({ client: mute as unknown as GraphqlVaultClient }).getVault(u1), 'storage_unavailable')
  })

  for (const code of ['BAD_USER_INPUT', 'GRAPHQL_VALIDATION_FAILED']) {
    it(`refuses a server's ${code} as bad_option, quoting nothing of it`, async () => {
      const quoting = new GraphQLError('Variable "$box" got invalid value "sk-ant-not-a-real-key"', { extensions: { code } })
      const answered = { toPromise: () => Promise.resolve({ error: new CombinedError({ graphQLErrors: [quoting] }) }) }
      const strict = { query: () => answered, mutation: () => answered, subscription: () => answered }
      const refusal = await TH.expectBad(graphqlVaultDB({ client: strict as unknown as GraphqlVaultClient }).getVault(u1), 'bad_option')
      expect(refusal.message).to.include('VaultSchemaSdl')
      expect(refusal.cause).to.be.undefined
      expect(JSON.stringify(Object.assign({}, refusal, { message: refusal.message }))).to.not.include('sk-ant')
    })
  }

  it("refuses a malformed box as invalid_box before it is sent, so the server never sees it", async () => {
    let sent = 0
    const answered = { toPromise: () => { sent += 1; return Promise.resolve({ data: {} }) } }
    const counting = { query: () => answered, mutation: () => answered, subscription: () => answered }
    const vaultDB = graphqlVaultDB({ client: counting as unknown as GraphqlVaultClient })
    await TH.expectBad(vaultDB.putBox(u1, { ...thisVault, revision_tok: null }, TH.boxOf('open^ai', 'r1')), 'invalid_box')
    const sidecarless = TH.omitting(TH.boxOf('openai', 'r1'), 'sidecar')
    await TH.expectBad(vaultDB.putBox(u1, { ...thisVault, revision_tok: null }, sidecarless), 'invalid_box')
    expect(sent).to.eq(0)
  })

  it("refuses as bad_record, before it is sent, a record or expectation whose epoch is past GraphQL's 32-bit Int", async () => {
    let sent = 0
    const answered = { toPromise: () => { sent += 1; return Promise.resolve({ data: {} }) } }
    const counting = { query: () => answered, mutation: () => answered, subscription: () => answered }
    const vaultDB = graphqlVaultDB({ client: counting as unknown as GraphqlVaultClient })
    const past = 2 ** 31
    const refusals = [
      await TH.expectBad(vaultDB.putVaultRecord(TH.vaultRecordOf('u1', { vault_epoch: past }), { ...thisVault, gate_epoch: 0 }), 'bad_record'),
      await TH.expectBad(vaultDB.putVaultRecord(TH.vaultRecordOf('u1', { gate_epoch: 2 }), { ...thisVault, gate_epoch: past }), 'bad_record'),
      await TH.expectBad(vaultDB.delVault(u1, { ...thisVault, gate_epoch: past }), 'bad_record'),
    ]
    expect(refusals.map((refusal) => /^Nothing was (written|removed): .* past 2147483647/.test(refusal.message))).to.deep.equal([true, true, true])
    expect(sent).to.eq(0)
  })

  it("sends an epoch of exactly the most a GraphQL Int carries", async () => {
    const schema = TH.schemaOver(await TH.emptyDatabase())
    const vaultDB = TH.browserFor(schema, 'u1')
    const most = (2 ** 31) - 1
    const created = await TH.ensureGated(vaultDB, TH.vaultRecordOf('u1', { gate_epoch: most }))
    expect(created.gate_epoch).to.eq(most)
  })

  it("carries the server's bad_record by its kind, for a record its own VaultDB refuses", async () => {
    const refused = new GraphQLError('Nothing was written: that box is not one this package builds. Hand a VaultDB only the records and expectations a vault builds.', { extensions: { kind: 'bad_record' } })
    const answered = { toPromise: () => Promise.resolve({ error: new CombinedError({ graphQLErrors: [refused] }) }) }
    const server = { query: () => answered, mutation: () => answered, subscription: () => answered }
    const refusal = await TH.expectBad(graphqlVaultDB({ client: server as unknown as GraphqlVaultClient }).putBox(u1, { ...thisVault, revision_tok: null }, TH.boxOf('openai', 'r1')), 'bad_record')
    expect(refusal.message).to.match(/^Nothing was written/)
  })

  it("leaves behind a box_stored that came with any refusal but a stale write, which alone carries one, checked", async () => {
    const mismatched = answering({ safebyokPutBox: { landed: false, refusalkind: 'vault_mismatch', message: 'The vault changed.', box_stored: { boxlabel: 'openai', not: 'a box' }, capacity: null } })
    const refusal = await TH.expectBad(mismatched.putBox(u1, { ...thisVault, revision_tok: null }, TH.boxOf('openai', 'r1')), 'vault_mismatch')
    expect(refusal).to.not.have.property('meta')
  })

  it("refuses as corrupt_record a vault_full that came with no capacity that reads as one", async () => {
    for (const capacity of [null, { boxes: 'many' }]) {
      const full = answering({ safebyokPutBox: { landed: false, refusalkind: 'vault_full', message: 'This vault is full.', box_stored: null, capacity } })
      await TH.expectBad(full.putBox(u1, { ...thisVault, revision_tok: null }, TH.boxOf('openai', 'r1')), 'corrupt_record')
    }
  })

  it("reports a stale box write's standing box that is not one as the damaged box a read of it would name", async () => {
    const stale = answering({ safebyokPutBox: { landed: false, refusalkind: 'stale_write', message: 'The box changed.', box_stored: 'not a box', capacity: null } })
    const refusal = await TH.expectBad(stale.putBox(u1, { ...thisVault, revision_tok: null }, TH.boxOf('openai', 'r1')), 'stale_write')
    expect(refusal.meta?.box_stored).to.include({ boxlabel: 'openai' })
  })

  it("refuses a write that came back not landed and naming no kind as corrupt_record, quoting nothing of the answer", async () => {
    const vague = answering({ safebyokPutVaultRecord: { landed: false, refusalkind: 'made_up', message: 'sk-ant-not-a-real-key', vault_stored: null } })
    const refusal = await TH.expectBad(vague.putVaultRecord(TH.vaultRecordOf('u1', { gate_epoch: 2 }), { ...thisVault, gate_epoch: 1 }), 'corrupt_record')
    expect(refusal.message).to.not.include('sk-ant')
  })

  it("ignores a record in a refusal's extensions: a stale_write that came as an error, as an older server sent it, is refused as the adapter's wrong answer", async () => {
    const stale = new GraphQLError('The vault changed.', { extensions: { kind: 'stale_write', meta: { box_stored: TH.boxOf('openai', 'r2') } } })
    const answered = { toPromise: () => Promise.resolve({ error: new CombinedError({ graphQLErrors: [stale] }) }) }
    const server = { query: () => answered, mutation: () => answered, subscription: () => answered }
    const refusal = await TH.expectBad(graphqlVaultDB({ client: server as unknown as GraphqlVaultClient }).putBox(u1, { ...thisVault, revision_tok: null }, TH.boxOf('openai', 'r1')), 'corrupt_record')
    expect(refusal.meta).to.be.undefined
  })

  it("carries a server's refusal by its kind, though a validation code came before it", async () => {
    const misuse = new GraphQLError('Variable "$user_id" got invalid value', { extensions: { code: 'BAD_USER_INPUT' } })
    const revoked = new GraphQLError('No one is signed in, so this vault cannot be reached: sign in, then try again.', { extensions: { kind: 'identity_revoked' } })
    const answered = { toPromise: () => Promise.resolve({ error: new CombinedError({ graphQLErrors: [misuse, revoked] }) }) }
    const both = { query: () => answered, mutation: () => answered, subscription: () => answered }
    await TH.expectBad(graphqlVaultDB({ client: both as unknown as GraphqlVaultClient }).getVault(u1), 'identity_revoked')
  })

  it("passes over a GraphQL error whose kind is not a VaultError's", async () => {
    const schema = buildSchema('type Query { safebyokGetVault(applabel: String!, user_id: String!, vaultlabel: String!): Boolean }')
    const rootValue = { safebyokGetVault: () => Promise.reject(Object.assign(new Error('no such kind'), { extensions: { kind: 'made_up' } })) }
    const vaultDB = graphqlVaultDB({ client: new Client({ url: 'https://app.example.test/api/graphql', exchanges: [executeExchange({ schema, rootValue })] }) })
    await TH.expectBad(vaultDB.getVault(u1), 'storage_unavailable')
  })
})

describe("graphqlVaultDB, hearing other writes", () => {
  it("hears another device's write to its vault, and stops when unsubscribed", async () => {
    const schema = TH.schemaOver(await TH.emptyDatabase())
    const elsewhere = TH.browserFor(schema, 'u1')
    await TH.ensureGated(elsewhere, TH.vaultRecordOf('u1'))
    const { heard, unsubscribe } = await TH.liveWatch(TH.browserFor(schema, 'u1'), u1)
    await TH.expectingGood(elsewhere).putBox(u1, { ...thisVault, revision_tok: null }, TH.boxOf('openai', 'r1'))
    await TH.eventually(() => heard.count === 1)
    unsubscribe()
    await TH.expectingGood(elsewhere).delBox(u1, 'openai', TH.deleting('rev-r1'))
    await TH.aWhile()
    expect(heard.count).to.eq(1)
  })

  it("hears nothing of another vault's writes", async () => {
    const schema = TH.schemaOver(await TH.emptyDatabase())
    const { heard, unsubscribe } = await TH.liveWatch(TH.browserFor(schema, 'u1'), u1)
    await TH.ensureGated(TH.browserFor(schema, 'u2'), TH.vaultRecordOf('u2'))
    await TH.ensureGated(TH.browserFor(schema, 'u1'), TH.vaultRecordOf('u1', { vaultlabel: 'spare' }))
    await TH.aWhile()
    expect(heard.count).to.eq(0)
    unsubscribe()
  })

  it("calls onChange once, warns once, and throws nothing, when the server refuses the subscription: the vault reads again and meets the refusal", async () => {
    const schema = TH.schemaOver(await TH.emptyDatabase())
    const { heard, onChange } = TH.changeCounter()
    const spy = TH.spyLogger()
    const unsubscribe = TH.browserFor(schema, 'u1', { logger: spy.logger }).subscribe(TH.scopeOf('u2'), onChange)
    await TH.ensureGated(TH.browserFor(schema, 'u2'), TH.vaultRecordOf('u2'))
    await TH.aWhile()
    expect(heard.count).to.eq(1)
    expect(spy.calls.map((call) => [call.level, call.story])).to.deep.equal([['warn', { call: 'subscribe' }]])
    expect(spy.calls[0]?.message).to.match(/GraphQL subscription failed/)
    unsubscribe()
  })

  it("hears nothing through a Client that has no way to send subscriptions", async () => {
    const vaultDB = graphqlVaultDB({ client: new Client({ url: 'https://app.example.test/api/graphql', exchanges: [fetchExchange], fetch: offline }) })
    const { heard, onChange } = TH.changeCounter()
    const unsubscribe = vaultDB.subscribe(u1, onChange)
    await TH.aWhile()
    expect(heard.count).to.eq(0)
    unsubscribe()
  })
})
