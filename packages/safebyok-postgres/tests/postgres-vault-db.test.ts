import { describe, expect, expectTypeOf, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { Client, Pool, PoolClient } from 'pg'
import { VaultError, memoryDeviceDB, outcomeOf } from 'safebyok'
import type { VaultDB, RefusalKind } from 'safebyok'
import * as TH from './test-helpers'
import { VaultChangeChannel, postgresVaultDB } from '../src/index'
import type { PostgresClient, PostgresListen, PostgresVaultDBOpts } from '../src/index'

// == [Devices, options and access]: devicesOverPGlite, u1, thisVault, options, README, who may reach a vault, not_permitted

TH.bootDatabaseFirst()

/**
 * Devices over this file's database, emptied: each sends its statements through a client of its
 * own, every one passing the race's turnstile. Beneath them all is the one PGlite, which runs one
 * statement at a time, so no two statements ever run at once.
 */
const devicesOverPGlite: TH.MakeVaultDBDevices = async (turnstile) => {
  const db = await TH.emptyDatabase()
  return ({ maxBoxes }) => {
    const client = TH.throughTurnstile(turnstile, db, ['query', 'listen'])
    return TH.perUser((userId) => postgresVaultDB({ client, userId, listen: (channel, onNotify) => client.listen(channel, onNotify), maxBoxes }))
  }
}

TH.describeVaultDB('postgresVaultDB over PGlite', async (vaultDBOpts) => {
  const db = await TH.emptyDatabase()
  return TH.perUser((userId) => TH.requestFor(db, userId, vaultDBOpts))
}, {
  makeCappedVaultDB: async (maxBoxes) => {
    const db = await TH.emptyDatabase()
    return TH.perUser((userId) => postgresVaultDB({ client: db, userId, maxBoxes, listen: TH.listenOn(db) }))
  },
  makeVaultDBFor: async () => {
    const db = await TH.emptyDatabase()
    return (userId) => TH.requestFor(db, userId)
  },
  pushes:      true,
  makeDevices: devicesOverPGlite,
})

describe("postgresVaultDB's devices, for the battery's races", () => {
  it("send every write's statement through the race's turnstile", async () => {
    await TH.expectRoundTripsThroughTurnstile(devicesOverPGlite)
  })
})

const u1 = TH.scopeOf('u1')
const thisVault = { vault_id: 'vault-id-u1' }
const noBoxYet = { vault_id: 'vault-id-u1', revision_tok: null, vault_key_epoch: 1 }

describe("postgresVaultDB, its options", () => {
  const BadOpts = [
    [null,                                                   'no options at all'],
    [{ userId: 'u1' },                                       'no client'],
    [{ client: {}, userId: 'u1' },                           'a client with no query method'],
    [{ client: { query: 'SELECT 1' }, userId: 'u1' },        'a client whose query is not a function'],
    [{ client: { query: () => Promise.resolve({ rows: [] }) }, userId: 42 },  'a userId that is not text'],
    [{ client: { query: () => Promise.resolve({ rows: [] }) }, userId: 'u1', listen: 'LISTEN' }, 'a listen that is not a function'],
    [{ client: { query: () => Promise.resolve({ rows: [] }) }, userId: 'u1', maxBoxes: 0 },        'a maxBoxes of none'],
    [{ client: { query: () => Promise.resolve({ rows: [] }) }, userId: 'u1', maxBoxes: 2.5 },      'a maxBoxes that is no whole number'],
    [{ client: { query: () => Promise.resolve({ rows: [] }) }, userId: 'u1', maxBoxes: '1000' },   'a maxBoxes that is text'],
    [{ client: { query: () => Promise.resolve({ rows: [] }) }, userId: 'u1', maxBoxes: -Infinity }, 'a maxBoxes of -Infinity'],
    [{ client: { query: () => Promise.resolve({ rows: [] }) }, userId: 'u1', maxBoxes: 2 ** 53 },  'a maxBoxes past the safe integers'],
  ] as const

  for (const [opts, blurb] of BadOpts) {
    it(`refuses ${blurb}, with kind bad_option`, () => {
      expect(() => postgresVaultDB(opts as unknown as PostgresVaultDBOpts)).to.throw(VaultError).with.property('refusalkind', 'bad_option')
    })
  }

  it("takes a client and a userId, and listen only when it is given", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = postgresVaultDB({ client: db, userId: 'u1' })
    expect(await TH.expectingGood(vaultDB).getVaultProps(u1)).to.be.null
  })

  it("declares a mebibyte to a record, and no limit to a vault's bytes or its boxes", () => {
    const vaultDB = postgresVaultDB({ client: TH.failingClient(new Error('unused')), userId: 'u1' })
    expect(vaultDB.maxRecordBytes).to.eq(1024 * 1024)
    expect(vaultDB.maxVaultBytes).to.eq(Infinity)
    expect(vaultDB.maxBoxes).to.eq(Infinity)
  })

  it("declares the maxBoxes it is given, as the README's examples give it", () => {
    const client = TH.failingClient(new Error('unused'))
    expect(postgresVaultDB({ client, userId: 'u1', maxBoxes: 250 }).maxBoxes).to.eq(250)
    expect(postgresVaultDB({ client, userId: 'u1', maxBoxes: 1_200_300_400_500_600 }).maxBoxes).to.eq(1_200_300_400_500_600)
    expect(postgresVaultDB({ client, userId: 'u1', maxBoxes: Infinity }).maxBoxes).to.eq(Infinity)
  })

  it("holds a vault to no count with no limit, landing every new box", async () => {
    const vaultDB = postgresVaultDB({ client: await TH.emptyDatabase(), userId: 'u1' })
    await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
    for (const boxlabel of ['openai', 'anthropic', 'mistral']) {
      await TH.expectingGood(vaultDB).putBox(u1, TH.boxOf(boxlabel, boxlabel), noBoxYet)
    }
    expect(await TH.expectingGood(vaultDB).listBoxes(u1)).to.have.lengthOf(3)
  })
})

describe("postgresVaultDB, as the README has it", () => {
  it("is made per request, and reads the signed-in user's vault", async () => {
    const db = await TH.emptyDatabase()
    const session = { userId: 'u1' }
    const vaultDB = postgresVaultDB({ client: db, userId: session.userId })
    expect(await TH.expectingGood(vaultDB).getVaultProps({ applabel: 'acme', user_id: session.userId, vaultlabel: 'main' })).to.be.null
  })

  it("stores and reads a real vault, made and opened by the core", async () => {
    const db = await TH.emptyDatabase()
    const opened = () => TH.settledVault({
      applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB: TH.requestFor(db, 'u1'), deviceDB: memoryDeviceDB(), keyDeriver: TH.testDeriver, strengthChecker: TH.anyStrengthChecker,
    })
    const first = await opened()
    await first.unlock('correct horse battery staple')
    await first.putBox('anthropic_api_key', 'sk-ant-test-not-a-real-key', { sidecar: { note: 'work account' } })
    await first.putBox('openai_api_key', { apiKey: 'sk-test-not-a-real-key', orgId: null })
    first.close()

    const second = await opened()
    await second.unlock('correct horse battery staple')
    expect(await second.getBox('anthropic_api_key')).to.eq('sk-ant-test-not-a-real-key')
    expect(await second.getBox('openai_api_key')).to.deep.equal({ apiKey: 'sk-test-not-a-real-key', orgId: null })
    expect(second.getSnapshot().boxes.map((box) => box.damaged ? null : box.sidecar)).to.deep.equal([{ note: 'work account' }, {}])
    await second.delBox('openai_api_key')
    expect(second.getSnapshot().boxes.map((box) => box.boxlabel)).to.deep.equal(['anthropic_api_key'])
    second.close()
  })
})

describe("postgresVaultDB, who may reach a vault", () => {
  const u2 = TH.scopeOf('u2')
  const EveryVerb = [
    ['getVaultProps',    (vaultDB: ReturnType<typeof postgresVaultDB>) => vaultDB.getVaultProps(u2)],
    ['ensureVaultProps', (vaultDB: ReturnType<typeof postgresVaultDB>) => vaultDB.ensureVaultProps(TH.vaultPropsOf('u2'))],
    ['putVaultProps',    (vaultDB: ReturnType<typeof postgresVaultDB>) => vaultDB.putVaultProps(TH.vaultPropsOf('u2'), { vault_id: 'vault-id-u2', unlock_epoch: 1 })],
    ['getBox',           (vaultDB: ReturnType<typeof postgresVaultDB>) => vaultDB.getBox(u2, 'anthropic')],
    ['listBoxes',        (vaultDB: ReturnType<typeof postgresVaultDB>) => vaultDB.listBoxes(u2)],
    ['listBoxRecords',   (vaultDB: ReturnType<typeof postgresVaultDB>) => vaultDB.listBoxRecords(u2)],
    ['putBox',           (vaultDB: ReturnType<typeof postgresVaultDB>) => vaultDB.putBox(u2, TH.boxOf('anthropic', 'one'), { vault_id: 'vault-id-u2', revision_tok: null, vault_key_epoch: 1 })],
    ['delBox',           (vaultDB: ReturnType<typeof postgresVaultDB>) => vaultDB.delBox(u2, 'anthropic', { vault_id: 'vault-id-u2', revision_tok: null })],
    ['delVault',         (vaultDB: ReturnType<typeof postgresVaultDB>) => vaultDB.delVault(u2, { vault_id: 'vault-id-u2' })],
    ['subscribe',        (vaultDB: ReturnType<typeof postgresVaultDB>) => outcomeOf(() => { vaultDB.subscribe(u2, TH.changeCounter().onChange) })],
  ] as const

  for (const [verb, call] of EveryVerb) {
    it(`${verb} on another user's vault refuses with identity_revoked, and asks the database nothing`, async () => {
      const db = await TH.emptyDatabase()
      const spy = TH.spyClient(db)
      const vaultDB = postgresVaultDB({ client: spy.client, userId: 'u1', listen: TH.listenOn(db) })
      const refusal = await TH.expectBad(call(vaultDB), 'identity_revoked')
      expect(refusal.message).to.include('another user')
      expect(spy.sent).to.have.lengthOf(0)
    })
  }

  const SignedOut = [
    [null,      'null'],
    [undefined, 'undefined'],
    ['',        'empty'],
  ] as const

  for (const [userId, blurb] of SignedOut) {
    it(`refuses every vault while no one is signed in (a userId ${blurb}), with identity_revoked`, async () => {
      const db = await TH.emptyDatabase()
      const spy = TH.spyClient(db)
      const vaultDB = postgresVaultDB({ client: spy.client, userId })
      const refusal = await TH.expectBad(vaultDB.getVaultProps(u1), 'identity_revoked')
      expect(refusal.message).to.include('No one is signed in')
      expect(() => vaultDB.subscribe(u1, TH.changeCounter().onChange)).to.throw(VaultError).with.property('refusalkind', 'identity_revoked')
      expect(spy.sent).to.have.lengthOf(0)
    })
  }

  it("never quotes the user in a refusal", async () => {
    const vaultDB = postgresVaultDB({ client: TH.failingClient(new Error('unused')), userId: 'alice@example.test' })
    const refusal = await TH.expectBad(vaultDB.getVaultProps(TH.scopeOf('mallory@example.test')), 'identity_revoked')
    expect(refusal.message).to.not.include('alice')
    expect(refusal.message).to.not.include('mallory')
  })
})

describe(`postgresVaultDB, 5.6: ${TH.VaultDBContract['5.6']}`, () => {
  it("refuses a box write the connection's role has no privilege for as not_permitted, the driver's 42501 as its cause, writing nothing (Contract: VaultDB, What an adapter must do)", async () => {
    const db = await TH.emptyDatabase()
    await TH.expectingGood(TH.requestFor(db, 'u1')).ensureVaultProps(TH.vaultPropsOf('u1'))
    const vaultDB = postgresVaultDB({ client: await TH.roleClient(db, 'safebyok_reader'), userId: 'u1' })
    expect(await TH.expectingGood(vaultDB).getVaultProps(u1)).to.deep.equal(TH.vaultPropsOf('u1'))
    const refusal = await TH.expectBad(vaultDB.putBox(u1, TH.boxOf('anthropic', 'one'), noBoxYet), 'not_permitted')
    expect(refusal.family).to.eq('condition')
    expect(refusal.message).to.include('Signing in again will not help')
    expect(refusal.cause).to.include({ code: '42501' })
    await TH.expectBad(vaultDB.delBox(u1, 'anthropic', TH.deleting(null)), 'not_permitted')
    expect(await TH.expectingGood(vaultDB).listBoxes(u1)).to.deep.equal([])
  })

  it("refuses a box a row-level security policy keeps out as not_permitted, the driver's 42501 as its cause, writing nothing", async () => {
    const db = await TH.emptyDatabase()
    await TH.expectingGood(TH.requestFor(db, 'u1')).ensureVaultProps(TH.vaultPropsOf('u1'))
    const vaultDB = postgresVaultDB({ client: await TH.roleClient(db, 'safebyok_viewer'), userId: 'u1' })
    const refusal = await TH.expectBad(vaultDB.putBox(u1, TH.boxOf('anthropic', 'one'), noBoxYet), 'not_permitted')
    expect(refusal.cause).to.include({ code: '42501' })
    expect(await TH.expectingGood(vaultDB).listBoxes(u1)).to.deep.equal([])
  })

  it("leaves a vault refused not_permitted unlocked, its boxes still readable: the refusal locks nothing", async () => {
    const db = await TH.emptyDatabase()
    const opened = async (vaultDB: VaultDB) => {
      const vault = await TH.settledVault({
        applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB, deviceDB: memoryDeviceDB(), keyDeriver: TH.testDeriver, strengthChecker: TH.anyStrengthChecker,
      })
      await vault.unlock('correct horse battery staple')
      return vault
    }
    const owner = await opened(TH.requestFor(db, 'u1'))
    await owner.putBox('anthropic_api_key', 'sk-ant-test-not-a-real-key')
    owner.close()
    const reader = await opened(postgresVaultDB({ client: await TH.roleClient(db, 'safebyok_reader'), userId: 'u1' }))
    await TH.expectRefusal(reader.putBox('openai_api_key', 'sk-test-not-a-real-key'), 'not_permitted')
    expect(reader.getSnapshot().state).to.eq('unlocked')
    expect(await reader.getBox('anthropic_api_key')).to.eq('sk-ant-test-not-a-real-key')
    reader.close()
  })
})
// --

// == [What it stores and its limit]: what it stores, boxlabelsIn, filledTo, missedBecause, foreignKeyViolation, box limit

describe("postgresVaultDB, what it stores", () => {
  it("stores the vault props a column to a field, each way in as one jsonb, and no passkey as null", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = TH.requestFor(db, 'u1')
    await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
    const { rows } = await db.query('SELECT * FROM safebyok_vaults')
    expect(rows).to.deep.equal([{
      applabel:         'acme',
      user_id:          'u1',
      vaultlabel:       'main',
      vault_id:         'vault-id-u1',
      format:           'safebyok-vault-v5',
      unlock_epoch:     1,
      vault_key_epoch:  1,
      passphrase:       TH.vaultPropsOf('u1').passphrase,
      passkey:          null,
      registered_at:    Date.UTC(2026, 9, 14),
    }])
  })

  it("keeps the vault props' passphrase and passkey whole through an update, and reads a passkey removed as null", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = TH.requestFor(db, 'u1')
    await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
    const withPasskey = TH.vaultPropsOf('u1', { unlock_epoch: 2, passphrase: TH.wayinOf('home_phrase'), passkey: TH.passkeyWayinOf('laptop') })
    await TH.expectingGood(vaultDB).putVaultProps(withPasskey, { vault_id: 'vault-id-u1', unlock_epoch: 1 })
    expect(await TH.expectingGood(vaultDB).getVaultProps(u1)).to.deep.equal(withPasskey)
    const withoutPasskey = { ...withPasskey, unlock_epoch: 3, passkey: null }
    await TH.expectingGood(vaultDB).putVaultProps(withoutPasskey, { vault_id: 'vault-id-u1', unlock_epoch: 2 })
    expect(await TH.expectingGood(vaultDB).getVaultProps(u1)).to.deep.equal(withoutPasskey)
  })

  // The core never sends it -- its vault moves the epoch on with every update -- so it is a client
  // of another version's, or of none.
  it("refuses, as stale_write, an update of the vault props that does not move unlock_epoch forward, writing nothing", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = TH.requestFor(db, 'u1')
    await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1', { unlock_epoch: 2 }))
    const atTwo = { vault_id: 'vault-id-u1', unlock_epoch: 2 }
    const rewrapped = (unlockEpoch: number) => TH.vaultPropsOf('u1', { unlock_epoch: unlockEpoch, passphrase: TH.wayinOf('home_phrase') })
    await TH.expectBad(vaultDB.putVaultProps(rewrapped(2), atTwo), 'stale_write')
    await TH.expectBad(vaultDB.putVaultProps(rewrapped(1), atTwo), 'stale_write')
    expect(await TH.expectingGood(vaultDB).getVaultProps(u1)).to.deep.equal(TH.vaultPropsOf('u1', { unlock_epoch: 2 }))
    await TH.expectingGood(vaultDB).putVaultProps(rewrapped(3), atTwo)
    expect(await TH.expectingGood(vaultDB).getVaultProps(u1)).to.deep.equal(rewrapped(3))
  })

  it("stores a box a column to a field, beside its vault's scope and vault_id, its sidecar as the text it was written as", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = TH.requestFor(db, 'u1')
    await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
    // Keys jsonb would reorder (it sorts the shorter first) and spacing it would add: the text is
    // bound as written, so it must come back so.
    const sidecarJson = '{"alpha":"café","zeta":1}'
    await TH.expectingGood(vaultDB).putBox(u1, TH.boxOf('anthropic', 'one', { sidecar_json: sidecarJson }), noBoxYet)
    const { rows } = await db.query('SELECT * FROM safebyok_boxes')
    expect(rows).to.deep.equal([{
      applabel:               'acme',
      user_id:                'u1',
      vaultlabel:             'main',
      vault_id:               'vault-id-u1',
      format:                 'safebyok-box-v6',
      boxlabel:               'anthropic',
      revision_tok:           'rev-one',
      vault_key_epoch:        1,
      box_key_wrapped:        TH.fakeCiphered('boxkey-one'),
      whisper_ciphered:       TH.fakeCiphered('whisper-one'),
      whisper_codec:          'json_v1',
      whisper_schema_version: 1,
      sidecar_json:           sidecarJson,
      registered_at:          Date.UTC(2026, 9, 14),
      written_at:             Date.UTC(2026, 9, 14),
    }])
    expect(await TH.expectingGood(vaultDB).getBox(u1, 'anthropic')).to.include({ sidecar_json: sidecarJson })
  })

  it("lists boxes without asking for their ciphered fields", async () => {
    const db = await TH.emptyDatabase()
    const spy = TH.spyClient(db)
    const vaultDB = postgresVaultDB({ client: spy.client, userId: 'u1' })
    await TH.expectingGood(vaultDB).listBoxes(u1)
    const [listing] = spy.sent
    expect(listing?.text).to.include('boxlabel')
    expect(listing?.text).to.not.include('whisper_ciphered')
    expect(listing?.text).to.not.include('box_key_wrapped')
  })

  it("sends every verb as one statement", async () => {
    const db = await TH.emptyDatabase()
    const spy = TH.spyClient(db)
    const vaultDB = postgresVaultDB({ client: spy.client, userId: 'u1' })
    await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
    await TH.expectingGood(vaultDB).putVaultProps({ ...TH.vaultPropsOf('u1'), unlock_epoch: 2 }, { vault_id: 'vault-id-u1', unlock_epoch: 1 })
    await TH.expectingGood(vaultDB).putBox(u1, TH.boxOf('anthropic', 'one'), noBoxYet)
    await TH.expectingGood(vaultDB).putBox(u1, TH.boxOf('anthropic', 'two'), { vault_id: 'vault-id-u1', revision_tok: 'rev-one', vault_key_epoch: 1 })
    await TH.expectingGood(vaultDB).getBox(u1, 'anthropic')
    expect(await TH.expectingGood(vaultDB).delBox(u1, 'anthropic', TH.deleting('rev-two'))).to.deep.equal({ outcome: 'deleted' })
    await TH.expectingGood(vaultDB).delVault(u1, thisVault)
    expect(spy.sent).to.have.lengthOf(7)
  })

  it("leaves no box standing when its vault props go: deleting the vault takes them in the same statement", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = TH.requestFor(db, 'u1')
    await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
    await TH.expectingGood(vaultDB).putBox(u1, TH.boxOf('anthropic', 'one'), noBoxYet)
    await db.query('DELETE FROM safebyok_vaults')
    const { rows } = await db.query('SELECT boxlabel FROM safebyok_boxes')
    expect(rows).to.have.lengthOf(0)
  })
})

/** The boxlabels in u1's vault, as `vaultDB` lists them. */
const boxlabelsIn = async (vaultDB: VaultDB): Promise<string[]> => {
  const listed = await TH.expectingGood(vaultDB).listBoxes(u1)
  return listed.map((box) => box.boxlabel)
}

/** A request for u1 over `db` holding vaults to `maxBoxes`, its vault made and given those boxlabels. */
const filledTo = async (db: PGlite, maxBoxes: number, boxlabels: readonly string[]) => {
  const vaultDB = postgresVaultDB({ client: db, userId: 'u1', maxBoxes })
  await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
  for (const boxlabel of boxlabels) { await TH.expectingGood(vaultDB).putBox(u1, TH.boxOf(boxlabel, `sk-fake-${boxlabel}`), noBoxYet) }
  return vaultDB
}

/** What InsertBoxSql answers, for a spy to say in place of the database: why a first write did not land. */
const missedBecause = (why: { vault_stands: boolean, box_stood: boolean, was_full: boolean }) => (
  (text: string) => (text.includes('INSERT INTO safebyok_boxes') ? Promise.resolve({ rows: [{ landed: false, ...why }] }) : undefined)
)

/** The foreign key violation Postgres raises for a box whose vault is gone, as a driver hands it up. */
const foreignKeyViolation = Object.assign(new Error('insert or update on table "safebyok_boxes" violates foreign key constraint'), { code: '23503' })

// A replacement in a full vault, and a first write over a boxlabel taken there, are the battery's
// line 4.3; a box landing once a deleted box has made room, its line 4.4: run over makeCappedVaultDB.
describe("postgresVaultDB, its box limit", () => {
  it("refuses a new box past maxBoxes as vault_full, writing nothing and naming no boxlabel", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = await filledTo(db, 2, ['openai', 'anthropic'])
    const refusal = await TH.expectBad(vaultDB.putBox(u1, TH.boxOf('secret_project_x', 'sk-fake'), noBoxYet), 'vault_full')
    expect(refusal.message).to.include('2 boxes')
    expect(refusal.message).to.not.include('secret_project_x')
    expect(await boxlabelsIn(vaultDB)).to.have.members(['openai', 'anthropic'])
  })

  it("refuses a first write in a full vault of another vault_id as stale_write: the count is the standing vault's", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = await filledTo(db, 1, ['openai'])
    await TH.expectBad(vaultDB.putBox(u1, TH.boxOf('anthropic', 'sk-fake'), { vault_id: 'vault-id-gone', revision_tok: null, vault_key_epoch: 1 }), 'stale_write')
    expect(await boxlabelsIn(vaultDB)).to.deep.equal(['openai'])
  })

  it("refuses a first write into a vault that is not there as stale_write, not vault_full", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = postgresVaultDB({ client: db, userId: 'u1', maxBoxes: 1 })
    await TH.expectBad(vaultDB.putBox(u1, TH.boxOf('anthropic', 'sk-fake'), noBoxYet), 'stale_write')
    expect(await TH.expectingGood(vaultDB).getVaultProps(u1)).to.be.null
  })

  // The insert says why it missed, from one snapshot, so no second read is asked. What a miss means
  // is the adapter's to read; these answer the insert with each reason a race can leave.
  const misses: [string, { vault_stands: boolean, box_stood: boolean, was_full: boolean }, RefusalKind][] = [
    ['the vault at its limit when the statement began', { vault_stands: true, box_stood: false, was_full: true }, 'vault_full'],
    ['the vault gone or made anew', { vault_stands: false, box_stood: false, was_full: false }, 'stale_write'],
    ['a vault gone, though it was counted full', { vault_stands: false, box_stood: false, was_full: true }, 'stale_write'],
    ['the boxlabel already taken, in a vault at its limit: a replacement is never full', { vault_stands: true, box_stood: true, was_full: true }, 'stale_write'],
    ['the boxlabel taken by a writer that committed after the statement began, with room in the vault', { vault_stands: true, box_stood: false, was_full: false }, 'stale_write'],
  ]
  for (const [blurb, why, kind] of misses) {
    it(`refuses ${kind} for ${blurb}, in the one statement`, async () => {
      const db = await TH.emptyDatabase()
      await filledTo(db, 1, [])
      const spy = TH.spyClient(db, missedBecause(why))
      const vaultDB = postgresVaultDB({ client: spy.client, userId: 'u1', maxBoxes: 1 })
      await TH.expectBad(vaultDB.putBox(u1, TH.boxOf('anthropic', 'sk-fake'), noBoxYet), kind)
      expect(spy.sent).to.have.lengthOf(1)
    })
  }

  it("refuses as stale_write a foreign key violation on the insert: its vault was deleted after the statement began", async () => {
    const db = await TH.emptyDatabase()
    await filledTo(db, 5, [])
    const spy = TH.spyClient(db, (text) => (text.includes('INSERT INTO safebyok_boxes') ? Promise.reject(foreignKeyViolation) : undefined))
    const vaultDB = postgresVaultDB({ client: spy.client, userId: 'u1', maxBoxes: 5 })
    await TH.expectBad(vaultDB.putBox(u1, TH.boxOf('anthropic', 'sk-fake'), noBoxYet), 'stale_write')
    expect(spy.sent).to.have.lengthOf(1)
  })

  it("maps the code Postgres gives a box whose vault is not there, and only that one", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = await filledTo(db, 5, [])
    const orphan = TH.boxOf('anthropic', 'sk-fake')
    const insertOrphan = db.query(
      `INSERT INTO safebyok_boxes (applabel, user_id, vaultlabel, vault_id, format, boxlabel, revision_tok, vault_key_epoch, box_key_wrapped, whisper_ciphered, whisper_codec, whisper_schema_version, sidecar_json, registered_at, written_at)
       VALUES ('acme', 'u1', 'main', 'vault-id-gone', $1, $2, $3, 1, '{}', '{}', 'json_v1', 1, '{}', 0, 0)`,
      [orphan.format, orphan.boxlabel, orphan.revision_tok],
    )
    await expect(insertOrphan).rejects.toMatchObject({ code: '23503' })
    expect(await boxlabelsIn(vaultDB)).to.deep.equal([])
  })

  it("asks one statement of every first write, keeping no count, and locking nothing but its vault row, shared", async () => {
    const db = await TH.emptyDatabase()
    await filledTo(db, 2, ['openai'])
    const spy = TH.spyClient(db)
    const vaultDB = postgresVaultDB({ client: spy.client, userId: 'u1', maxBoxes: 2 })
    await TH.expectingGood(vaultDB).putBox(u1, TH.boxOf('anthropic', 'sk-fake'), noBoxYet)
    await TH.expectBad(vaultDB.putBox(u1, TH.boxOf('mistral', 'sk-fake'), noBoxYet), 'vault_full')
    await TH.expectBad(vaultDB.putBox(u1, TH.boxOf('mistral', 'sk-fake'), { vault_id: 'vault-id-gone', revision_tok: null, vault_key_epoch: 1 }), 'stale_write')
    await TH.expectingGood(vaultDB).delBox(u1, 'anthropic', TH.deleting('rev-sk-fake'))
    expect(spy.sent).to.have.lengthOf(4)
    for (const { text } of spy.sent) {
      expect(text).to.not.match(/FOR (NO KEY )?UPDATE|FOR KEY SHARE|box_count/)
    }
    // Each box write reads its vault row FOR SHARE, once; the delete locks nothing.
    expect(spy.sent.map(({ text }) => text.match(/FOR SHARE/g)?.length ?? 0)).to.deep.equal([1, 1, 1, 0])
  })

  it("reads the vault row FOR SHARE in a replacement too, in its one statement", async () => {
    const db = await TH.emptyDatabase()
    await filledTo(db, 2, ['openai'])
    const spy = TH.spyClient(db)
    const vaultDB = postgresVaultDB({ client: spy.client, userId: 'u1', maxBoxes: 2 })
    await TH.expectingGood(vaultDB).putBox(u1, TH.boxOf('openai', 'sk-fake-again'), { ...noBoxYet, revision_tok: 'rev-sk-fake-openai' })
    expect(spy.sent.map(({ text }) => text.match(/FOR SHARE/g)?.length ?? 0)).to.deep.equal([1])
  })

  it("lets exactly one of two first writes sent at once take the last place, when one statement is run after the other", async () => {
    // PGlite runs one statement at a time, so the second counts the first's box: this holds
    // writes made one after another, as they arrive here. Writers racing on a real server may
    // each find room, and the README says so; e2e/tests/postgres/races.test.ts races them on a real server.
    const db = await TH.emptyDatabase()
    const vaultDB = await filledTo(db, 2, ['openai'])
    const outcomes = await Promise.all([
      vaultDB.putBox(u1, TH.boxOf('anthropic', 'sk-fake-one'), noBoxYet),
      postgresVaultDB({ client: db, userId: 'u1', maxBoxes: 2 }).putBox(u1, TH.boxOf('mistral', 'sk-fake-two'), noBoxYet),
    ])
    expect(outcomes.map((outcome) => outcome.ok)).to.have.members([true, false])
    expect(await boxlabelsIn(vaultDB)).to.have.lengthOf(2)
  })

  it("keeps every box of a vault racing writers took past its limit, readable by its boxlabel, and lands a new one once deleted boxes make room", async () => {
    // As racing writers may leave a vault, by the README: past its limit, here by a writer holding
    // a higher one.
    const db = await TH.emptyDatabase()
    const vaultDB = await filledTo(db, 2, ['openai', 'anthropic'])
    const higher = await filledTo(db, 1000, [])
    await TH.expectingGood(higher).putBox(u1, TH.boxOf('mistral', 'sk-fake-three'), noBoxYet)
    expect(await boxlabelsIn(vaultDB)).to.have.members(['openai', 'anthropic', 'mistral'])
    const racer = await TH.expectingGood(vaultDB).getBox(u1, 'mistral')
    expect(racer?.boxlabel).to.eq('mistral')
    await TH.expectBad(vaultDB.putBox(u1, TH.boxOf('gemini', 'sk-fake'), noBoxYet), 'vault_full')
    await TH.expectingGood(vaultDB).delBox(u1, 'openai', TH.deleting('rev-sk-fake-openai'))
    await TH.expectBad(vaultDB.putBox(u1, TH.boxOf('gemini', 'sk-fake'), noBoxYet), 'vault_full')
    await TH.expectingGood(vaultDB).delBox(u1, 'anthropic', TH.deleting('rev-sk-fake-anthropic'))
    await TH.expectingGood(vaultDB).putBox(u1, TH.boxOf('gemini', 'sk-fake'), noBoxYet)
    expect(await boxlabelsIn(vaultDB)).to.have.members(['mistral', 'gemini'])
  })

  it("holds a vault filled under a higher limit to a lowered one, stranding none of its boxes", async () => {
    const db = await TH.emptyDatabase()
    await filledTo(db, 1000, ['openai', 'anthropic', 'mistral'])
    const lowered = postgresVaultDB({ client: db, userId: 'u1', maxBoxes: 2 })
    await TH.expectBad(lowered.putBox(u1, TH.boxOf('gemini', 'sk-fake'), noBoxYet), 'vault_full')
    expect(await boxlabelsIn(lowered)).to.have.members(['openai', 'anthropic', 'mistral'])
  })

  it("counts each vault apart, even one user's two", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = await filledTo(db, 1, ['openai'])
    const other = { ...u1, vaultlabel: 'other' }
    await TH.expectingGood(vaultDB).ensureVaultProps({ ...TH.vaultPropsOf('u1'), vaultlabel: 'other' })
    await TH.expectingGood(vaultDB).putBox(other, TH.boxOf('openai', 'sk-fake'), noBoxYet)
    await TH.expectBad(vaultDB.putBox(other, TH.boxOf('anthropic', 'sk-fake'), noBoxYet), 'vault_full')
    expect(await boxlabelsIn(vaultDB)).to.deep.equal(['openai'])
  })

  it("refuses as vault_full a putBox() its vault's own count let through, when another device filled the vault unheard", async () => {
    const db = await TH.emptyDatabase()
    const opened = () => TH.settledVault({
      applabel: 'acme', userId: 'u1', vaultlabel: 'main', deviceDB: memoryDeviceDB(), keyDeriver: TH.testDeriver, strengthChecker: TH.anyStrengthChecker,
      // No listen: neither vault hears the other's writes.
      vaultDB: postgresVaultDB({ client: db, userId: 'u1', maxBoxes: 2 }),
    })
    const here = await opened()
    await here.unlock('correct horse battery staple')
    await here.putBox('openai', 'sk-fake-one')
    const there = await opened()
    await there.unlock('correct horse battery staple')
    await there.putBox('anthropic', 'sk-fake-two')
    expect(here.getSnapshot().boxes).to.have.lengthOf(1)
    const refusal = await TH.expectRefusal(here.putBox('mistral', 'sk-fake-three'), 'vault_full')
    expect(refusal.message).to.include('its storage keeps')
    here.close()
    there.close()
  })

  it("opens a vault with the smaller of MaxBoxes and its own, and refuses one asking for more", async () => {
    const db = await TH.emptyDatabase()
    const optsFor = (maxBoxes?: number) => ({
      applabel: 'acme', userId: 'u1', vaultlabel: 'main', deviceDB: memoryDeviceDB(), keyDeriver: TH.testDeriver, strengthChecker: TH.anyStrengthChecker,
      vaultDB: postgresVaultDB({ client: db, userId: 'u1', maxBoxes: 3 }), maxBoxes,
    })
    await TH.expectRefusal(TH.settledVault(optsFor(4)), 'bad_option')
    const vault = await TH.settledVault(optsFor())
    await vault.unlock('correct horse battery staple')
    for (const boxlabel of ['one', 'two', 'three']) { await vault.putBox(boxlabel, `sk-fake-${boxlabel}`) }
    const refusal = await TH.expectRefusal(vault.putBox('four', 'sk-fake-four'), 'vault_full')
    expect(refusal.message).to.include('limit of 3 boxes')
    vault.close()
  })
})
// --

// == [Listing and trouble]: listBoxRecords, in trouble

describe("postgresVaultDB, listBoxRecords", () => {
  it("lists each box as stored, ciphered fields left out, format kept, the sidecar as its JSON text", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = TH.requestFor(db, 'u1')
    await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
    const emptied = TH.boxOf('openai', 'two', { sidecar_json: '{}' })
    await TH.expectingGood(vaultDB).putBox(u1, TH.boxOf('anthropic', 'one'), noBoxYet)
    await TH.expectingGood(vaultDB).putBox(u1, emptied, noBoxYet)
    const records = await TH.expectingGood(vaultDB).listBoxRecords(u1)
    const { box_key_wrapped: _wrapped, whisper_ciphered: _ciphered, ...listed } = TH.boxOf('anthropic', 'one')
    const { box_key_wrapped: _wrappedToo, whisper_ciphered: _cipheredToo, ...listedEmptied } = emptied
    expect(records).to.have.deep.members([listed, listedEmptied])
  })

  it("is what a browser's VaultDB may hand back from its doListBoxes, where listBoxes's summaries are not", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = TH.requestFor(db, 'u1')
    await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
    await TH.expectingGood(vaultDB).putBox(u1, TH.boxOf('anthropic', 'one'), noBoxYet)
    const [record] = await TH.expectingGood(vaultDB).listBoxRecords(u1)
    expect(record).to.have.property('format', 'safebyok-box-v6')
    const [summary] = await TH.expectingGood(vaultDB).listBoxes(u1)
    expect(summary).to.not.have.property('format')
  })

  it("refuses a malformed scope with bad_label, before the database is asked", async () => {
    const db = await TH.emptyDatabase()
    const spy = TH.spyClient(db)
    await TH.expectBad(postgresVaultDB({ client: spy.client, userId: 'u1' }).listBoxRecords({ ...u1, vaultlabel: 42 } as never), 'bad_label')
    expect(spy.sent).to.have.lengthOf(0)
  })

  it("refuses a scope below the floor, or with a name over 640 bytes, as every verb does, before the database is asked", async () => {
    const db = await TH.emptyDatabase()
    const spy = TH.spyClient(db)
    const vaultDB = postgresVaultDB({ client: spy.client, userId: 'u1' })
    for (const vaultlabel of ['main^x', 'tab\there', 'n'.repeat(641)]) {
      const refusal = await TH.expectBad(vaultDB.listBoxRecords({ ...u1, vaultlabel }), 'bad_label')
      // Each refusal names the name and the rule it broke, as every verb's does, quoting none of it.
      expect(refusal.message).to.include('vaultlabel')
      expect(refusal.message).to.not.include(vaultlabel)
    }
    expect(await TH.expectingGood(vaultDB).listBoxRecords({ ...u1, vaultlabel: 'n'.repeat(640) })).to.deep.equal([])
    expect(spy.sent).to.have.lengthOf(1)
  })

  it("declares 640 bytes the most it holds in one name, refusing a longer one at every verb", async () => {
    const vaultDB = TH.requestFor(await TH.emptyDatabase(), 'u1')
    expect(vaultDB.maxNameBytes).to.eq(640)
    await TH.expectBad(vaultDB.getVaultProps({ ...u1, vaultlabel: 'n'.repeat(641) }), 'bad_label')
  })

  it("refuses driver trouble with storage_unavailable, the driver's error as its cause", async () => {
    const dbDown = new Error('connect ECONNREFUSED 127.0.0.1:5432')
    const refusal = await TH.expectBad(postgresVaultDB({ client: TH.failingClient(dbDown), userId: 'u1' }).listBoxRecords(u1), 'storage_unavailable')
    expect(refusal.cause).to.eq(dbDown)
  })
})

describe("postgresVaultDB, in trouble", () => {
  it("refuses with storage_unavailable when the driver fails, its error as the cause", async () => {
    const dbDown = new Error('connect ECONNREFUSED 127.0.0.1:5432')
    const vaultDB = postgresVaultDB({ client: TH.failingClient(dbDown), userId: 'u1' })
    const refusal = await TH.expectBad(vaultDB.getVaultProps(u1), 'storage_unavailable')
    expect(refusal.cause).to.eq(dbDown)
  })

  it("refuses with storage_unavailable where the tables were never made", async () => {
    const db = await TH.emptyDatabase()
    await TH.expectBad(postgresVaultDB({ client: TH.tablelessClient(db), userId: 'u1' }).getVaultProps(u1), 'storage_unavailable')
  })

  it("refuses a failure of a first box write as storage_unavailable, a serialization failure among them", async () => {
    const db = await TH.emptyDatabase()
    const tooBusy = Object.assign(new Error('could not serialize access due to concurrent update'), { code: '40001' })
    const spy = TH.spyClient(db, (text) => (text.includes('INSERT INTO safebyok_boxes') ? Promise.reject(tooBusy) : undefined))
    const vaultDB = postgresVaultDB({ client: spy.client, userId: 'u1' })
    await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
    const refusal = await TH.expectBad(vaultDB.putBox(u1, TH.boxOf('anthropic', 'one'), noBoxYet), 'storage_unavailable')
    expect(refusal.cause).to.eq(tooBusy)
  })

  it("refuses a row damaged in the database as corrupt_record, leaving it as it is", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = TH.requestFor(db, 'u1')
    await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
    await db.query(`UPDATE safebyok_vaults SET passphrase = '"not a wayin"'::jsonb`)
    await TH.expectBad(vaultDB.getVaultProps(u1), 'corrupt_record')
    const { rows } = await db.query<{ passphrase: unknown }>('SELECT passphrase FROM safebyok_vaults')
    expect(rows[0]?.passphrase).to.eq('not a wayin')
  })

  it("deletes a row whose revision the database holds empty, listed with none, as the one a deletion naming none means", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = TH.requestFor(db, 'u1')
    await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
    await TH.expectingGood(vaultDB).putBox(u1, TH.boxOf('anthropic', 'one'), noBoxYet)
    await db.query(`UPDATE safebyok_boxes SET revision_tok = ''`)
    expect(await TH.expectingGood(vaultDB).listBoxes(u1)).to.deep.equal([{ boxlabel: 'anthropic', damaged: true, revision_tok: null }])
    expect(await TH.expectingGood(vaultDB).delBox(u1, 'anthropic', TH.deleting(null))).to.deep.equal({ outcome: 'deleted' })
    expect(await TH.expectingGood(vaultDB).listBoxes(u1)).to.have.lengthOf(0)
  })
})
// --

// == [Subscribe and drivers]: throwsClosed, UnlistenCases, subscribe, PostgresClient, PostgresListen

const throwsClosed = () => { throw new Error('already closed') }
const unlistened = () => undefined
const rejectsClosed = () => Promise.reject(new Error('already closed'))

/** Listens whose unlisten fails, at once or later. */
const UnlistenCases: PostgresListen[] = [() => throwsClosed, () => rejectsClosed]

describe("postgresVaultDB, subscribe", () => {
  it("calls onChange once as its listen begins, so its subscriber reads what landed meanwhile", async () => {
    const gate = TH.makeGate()
    const listen: PostgresListen = async () => {
      await gate.pass()
      return unlistened
    }
    const { heard, onChange } = TH.changeCounter()
    const unsubscribe = postgresVaultDB({ client: TH.failingClient(new Error('unused')), userId: 'u1', listen }).subscribe(u1, onChange)
    await gate.reached
    expect(heard.count).to.eq(0)
    gate.release()
    await TH.eventually(() => heard.count === 1)
    unsubscribe()
  })

  it("calls onChange after a write to the vault from another request, and not after its unsubscribe", async () => {
    const db = await TH.emptyDatabase()
    const { heard, unsubscribe } = await TH.liveWatch(TH.requestFor(db, 'u1'), u1)
    await TH.expectGood(TH.requestFor(db, 'u1').ensureVaultProps(TH.vaultPropsOf('u1')))
    await TH.eventually(() => heard.count === 1)
    unsubscribe()
    await TH.expectGood(TH.requestFor(db, 'u1').putBox(u1, TH.boxOf('anthropic', 'one'), noBoxYet))
    await TH.wakeupAtNextTick()
    expect(heard.count).to.eq(1)
  })

  it("hears nothing of another user's vault, nor of another vault of the same user", async () => {
    const db = await TH.emptyDatabase()
    const { heard, unsubscribe } = await TH.liveWatch(TH.requestFor(db, 'u1'), u1)
    await TH.expectGood(TH.requestFor(db, 'u2').ensureVaultProps(TH.vaultPropsOf('u2')))
    await TH.expectGood(TH.requestFor(db, 'u1').ensureVaultProps({ ...TH.vaultPropsOf('u1'), ...TH.scopeOf('u1', 'spare') }))
    await TH.expectGood(TH.requestFor(db, 'u1').ensureVaultProps(TH.vaultPropsOf('u1')))
    await TH.eventually(() => heard.count > 0)
    await TH.wakeupAtNextTick()
    expect(heard.count).to.eq(1)
    unsubscribe()
  })

  it("hears a deleted vault once, its boxes and all, and a create that changed nothing not at all", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = TH.requestFor(db, 'u1')
    await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
    await TH.expectingGood(vaultDB).putBox(u1, TH.boxOf('anthropic', 'one'), noBoxYet)
    await TH.expectingGood(vaultDB).putBox(u1, TH.boxOf('openai', 'two'), noBoxYet)
    const payloads: string[] = []
    const unlisten = await db.listen(VaultChangeChannel, (payload) => { payloads.push(payload) })
    await TH.expectingGood(vaultDB).ensureVaultProps({ ...TH.vaultPropsOf('u1'), vault_id: 'the-second-arrival' })
    await TH.expectingGood(vaultDB).delVault(u1, thisVault)
    await TH.eventually(() => payloads.length > 0)
    await TH.wakeupAtNextTick()
    expect(payloads.map((payload) => JSON.parse(payload) as unknown)).to.deep.equal([u1])
    await unlisten()
  })

  it("calls onChange on an empty notification, as the trigger sends for a scope too long for a payload", async () => {
    const db = await TH.emptyDatabase()
    const { heard, unsubscribe } = await TH.liveWatch(TH.requestFor(db, 'u1'), TH.scopeOf('u1'))
    await db.query(`SELECT pg_notify('${VaultChangeChannel}', '')`)
    await TH.eventually(() => heard.count > 0)
    expect(heard.count).to.eq(1)
    unsubscribe()
  })

  it("never calls without a listen, and its unsubscribe can be called", async () => {
    const db = await TH.emptyDatabase()
    const { heard, onChange } = TH.changeCounter()
    const unsubscribe = postgresVaultDB({ client: db, userId: 'u1' }).subscribe(u1, onChange)
    await TH.expectGood(TH.requestFor(db, 'u1').ensureVaultProps(TH.vaultPropsOf('u1')))
    await TH.wakeupAtNextTick()
    expect(heard.count).to.eq(0)
    unsubscribe()
  })

  it("listens on the tables' channel, and unlistens once however often it is unsubscribed", () => {
    const calls = { channels: [] as string[], unlistens: 0 }
    const listen: PostgresListen = (channel) => {
      calls.channels.push(channel)
      return () => { calls.unlistens += 1 }
    }
    const unsubscribe = postgresVaultDB({ client: TH.failingClient(new Error('unused')), userId: 'u1', listen }).subscribe(u1, TH.changeCounter().onChange)
    expect(calls.channels).to.deep.equal([VaultChangeChannel])
    unsubscribe()
    unsubscribe()
    return TH.eventually(() => calls.unlistens === 1)
  })

  it("ends a listen that settles only after its unsubscribe, as it arrives, and hears nothing meanwhile", async () => {
    const gate = TH.makeGate()
    const calls = { unlistens: 0, notify: (_payload: string) => { /* replaced when listening */ } }
    const listen: PostgresListen = async (_channel, onNotify) => {
      calls.notify = onNotify
      await gate.pass()
      return () => { calls.unlistens += 1 }
    }
    const { heard, onChange } = TH.changeCounter()
    const unsubscribe = postgresVaultDB({ client: TH.failingClient(new Error('unused')), userId: 'u1', listen }).subscribe(u1, onChange)
    await gate.reached
    unsubscribe()
    calls.notify(JSON.stringify(u1))
    gate.release()
    await TH.eventually(() => calls.unlistens === 1)
    expect(heard.count).to.eq(0)
  })

  it("refuses a listen that throws at once with storage_unavailable, and warns of one that rejects", async () => {
    const sudden = new Error('no connection to listen on')
    const throwing: PostgresListen = () => { throw sudden }
    const vaultDB = postgresVaultDB({ client: TH.failingClient(new Error('unused')), userId: 'u1', listen: throwing })
    expect(() => vaultDB.subscribe(u1, TH.changeCounter().onChange)).to.throw(VaultError).with.property('refusalkind', 'storage_unavailable')

    const spy = TH.spyLogger()
    const rejecting: PostgresListen = () => Promise.reject(sudden)
    const unsubscribe = postgresVaultDB({ client: TH.failingClient(new Error('unused')), userId: 'u1', listen: rejecting, logger: spy.logger }).subscribe(u1, TH.changeCounter().onChange)
    await TH.eventually(() => spy.calls.length > 0)
    expect(spy.calls.map((heard) => [heard.level, heard.err])).to.deep.equal([['warn', sudden]])
    unsubscribe()
    await TH.wakeupAtNextTick()
  })

  it("logs an unlisten that throws or rejects, and throws nothing from the unsubscribe", async () => {
    for (const listen of UnlistenCases) {
      const spy = TH.spyLogger()
      const unsubscribe = postgresVaultDB({ client: TH.failingClient(new Error('unused')), userId: 'u1', listen, logger: spy.logger }).subscribe(u1, TH.changeCounter().onChange)
      expect(unsubscribe).to.not.throw()
      await TH.eventually(() => spy.calls.length > 0)
      expect(spy.calls.map((heard) => [heard.level, heard.err?.message])).to.deep.equal([['error', 'already closed']])
    }
  })
})

describe("PostgresClient and PostgresListen, as the drivers have them", () => {
  it("is a pg Pool, Client or PoolClient, and a PGlite, as they stand", () => {
    expectTypeOf<Pool>().toExtend<PostgresClient>()
    expectTypeOf<Client>().toExtend<PostgresClient>()
    expectTypeOf<PoolClient>().toExtend<PostgresClient>()
    expectTypeOf<PGlite>().toExtend<PostgresClient>()
  })

  it("takes a PGlite's listen as it stands", () => {
    expectTypeOf<PGlite['listen']>().toExtend<PostgresListen>()
  })
})
// --
