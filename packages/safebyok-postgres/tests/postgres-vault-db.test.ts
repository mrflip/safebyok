import { describe, expect, expectTypeOf, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { Client, Pool, PoolClient } from 'pg'
import { VaultError, memoryDeviceDB, openVault } from 'safebyok'
import type { VaultDB, VaultErrorKind } from 'safebyok'
import * as TH from './test-helpers'
import { VaultChangeChannel, postgresVaultDB } from '../src/index'
import type { PostgresClient, PostgresListen, PostgresVaultDBOpts } from '../src/index'

TH.bootDatabaseFirst()

/**
 * Devices over this file's database, emptied: each sends its statements through a client of its
 * own, every one passing the race's turnstile. Beneath them all is the one PGlite, which runs one
 * statement at a time, so no two statements ever run at once.
 */
const devicesOverPGlite: TH.MakeVaultDBDevices = async (turnstile) => {
  const db = await TH.emptyDatabase()
  return ({ maxLockboxes }) => {
    const client = TH.throughTurnstile(turnstile, db, ['query', 'listen'])
    return TH.perUser((userId) => postgresVaultDB({ client, userId, listen: (channel, onNotify) => client.listen(channel, onNotify), maxLockboxes }))
  }
}

TH.describeVaultDB('postgresVaultDB over PGlite', async (vaultDBOpts) => {
  const db = await TH.emptyDatabase()
  return TH.perUser((userId) => TH.requestFor(db, userId, vaultDBOpts))
}, {
  makeCappedVaultDB: async (maxLockboxes) => {
    const db = await TH.emptyDatabase()
    return TH.perUser((userId) => postgresVaultDB({ client: db, userId, maxLockboxes, listen: TH.listenOn(db) }))
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
const noBoxYet = { vault_id: 'vault-id-u1', revision_id: null, vault_key_epoch: 1 }

describe("postgresVaultDB, its options", () => {
  const BadOpts = [
    [null,                                                   'no options at all'],
    [{ userId: 'u1' },                                       'no client'],
    [{ client: {}, userId: 'u1' },                           'a client with no query method'],
    [{ client: { query: 'SELECT 1' }, userId: 'u1' },        'a client whose query is not a function'],
    [{ client: { query: () => Promise.resolve({ rows: [] }) }, userId: 42 },  'a userId that is not text'],
    [{ client: { query: () => Promise.resolve({ rows: [] }) }, userId: 'u1', listen: 'LISTEN' }, 'a listen that is not a function'],
    [{ client: { query: () => Promise.resolve({ rows: [] }) }, userId: 'u1', maxLockboxes: 0 },        'a maxLockboxes of none'],
    [{ client: { query: () => Promise.resolve({ rows: [] }) }, userId: 'u1', maxLockboxes: 2.5 },      'a maxLockboxes that is no whole number'],
    [{ client: { query: () => Promise.resolve({ rows: [] }) }, userId: 'u1', maxLockboxes: '1000' },   'a maxLockboxes that is text'],
    [{ client: { query: () => Promise.resolve({ rows: [] }) }, userId: 'u1', maxLockboxes: -Infinity }, 'a maxLockboxes of -Infinity'],
    [{ client: { query: () => Promise.resolve({ rows: [] }) }, userId: 'u1', maxLockboxes: 2 ** 53 },  'a maxLockboxes past the safe integers'],
  ] as const

  for (const [opts, blurb] of BadOpts) {
    it(`refuses ${blurb}, with kind bad_option`, () => {
      expect(() => postgresVaultDB(opts as unknown as PostgresVaultDBOpts)).to.throw(VaultError).with.property('kind', 'bad_option')
    })
  }

  it("takes a client and a userId, and listen only when it is given", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = postgresVaultDB({ client: db, userId: 'u1' })
    expect(await vaultDB.readBundle(u1)).to.be.null
  })

  it("declares a mebibyte to a record, and no limit to a vault's bytes or its lockboxes", () => {
    const vaultDB = postgresVaultDB({ client: TH.failingClient(new Error('unused')), userId: 'u1' })
    expect(vaultDB.maxRecordBytes).to.eq(1024 * 1024)
    expect(vaultDB.maxVaultBytes).to.eq(Infinity)
    expect(vaultDB.maxLockboxes).to.eq(Infinity)
  })

  it("declares the maxLockboxes it is given, as the README's examples give it", () => {
    const client = TH.failingClient(new Error('unused'))
    expect(postgresVaultDB({ client, userId: 'u1', maxLockboxes: 250 }).maxLockboxes).to.eq(250)
    expect(postgresVaultDB({ client, userId: 'u1', maxLockboxes: 1_200_300_400_500_600 }).maxLockboxes).to.eq(1_200_300_400_500_600)
    expect(postgresVaultDB({ client, userId: 'u1', maxLockboxes: Infinity }).maxLockboxes).to.eq(Infinity)
  })

  it("holds a vault to no count with no limit, landing every new lockbox", async () => {
    const vaultDB = postgresVaultDB({ client: await TH.emptyDatabase(), userId: 'u1' })
    await vaultDB.createBundle(TH.bundleOf('u1'))
    for (const boxlabel of ['openai', 'anthropic', 'mistral']) {
      await vaultDB.updateBox(u1, TH.boxOf(boxlabel, boxlabel), noBoxYet)
    }
    expect(await vaultDB.listBoxes(u1)).to.have.lengthOf(3)
  })
})

describe("postgresVaultDB, as the README has it", () => {
  it("is made per request, and reads the signed-in user's vault", async () => {
    const db = await TH.emptyDatabase()
    const session = { userId: 'u1' }
    const vaultDB = postgresVaultDB({ client: db, userId: session.userId })
    expect(await vaultDB.readBundle({ applabel: 'acme', user_id: session.userId, vaultlabel: 'main' })).to.be.null
  })

  it("stores and reads a real vault, made and opened by the core", async () => {
    const db = await TH.emptyDatabase()
    const opened = () => openVault({
      applabel: 'acme', userId: 'u1', vaultlabel: 'main', vaultDB: TH.requestFor(db, 'u1'), deviceDB: memoryDeviceDB(), keyDeriver: TH.testDeriver, passphraseStrengthTest: TH.anyPassphraseTest,
    })
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
})

describe("postgresVaultDB, who may reach a vault", () => {
  const u2 = TH.scopeOf('u2')
  const EveryVerb = [
    ['readBundle',   (vaultDB: ReturnType<typeof postgresVaultDB>) => vaultDB.readBundle(u2)],
    ['createBundle', (vaultDB: ReturnType<typeof postgresVaultDB>) => vaultDB.createBundle(TH.bundleOf('u2'))],
    ['updateBundle', (vaultDB: ReturnType<typeof postgresVaultDB>) => vaultDB.updateBundle(TH.bundleOf('u2'), { vault_id: 'vault-id-u2', unlock_epoch: 1 })],
    ['readBox',      (vaultDB: ReturnType<typeof postgresVaultDB>) => vaultDB.readBox(u2, 'anthropic')],
    ['listBoxes',    (vaultDB: ReturnType<typeof postgresVaultDB>) => vaultDB.listBoxes(u2)],
    ['listBoxRecords', (vaultDB: ReturnType<typeof postgresVaultDB>) => vaultDB.listBoxRecords(u2)],
    ['updateBox',    (vaultDB: ReturnType<typeof postgresVaultDB>) => vaultDB.updateBox(u2, TH.boxOf('anthropic', 'one'), { vault_id: 'vault-id-u2', revision_id: null, vault_key_epoch: 1 })],
    ['eraseBox',     (vaultDB: ReturnType<typeof postgresVaultDB>) => vaultDB.eraseBox(u2, 'anthropic', { vault_id: 'vault-id-u2' })],
    ['eraseVault',   (vaultDB: ReturnType<typeof postgresVaultDB>) => vaultDB.eraseVault(u2, { vault_id: 'vault-id-u2' })],
    ['subscribe',    (vaultDB: ReturnType<typeof postgresVaultDB>) => new Promise<void>((resolve) => { vaultDB.subscribe(u2, TH.changeCounter().onChange); resolve() })],
  ] as const

  for (const [verb, call] of EveryVerb) {
    it(`${verb} on another user's vault refuses with identity_revoked, and asks the database nothing`, async () => {
      const db = await TH.emptyDatabase()
      const spy = TH.spyClient(db)
      const vaultDB = postgresVaultDB({ client: spy.client, userId: 'u1', listen: TH.listenOn(db) })
      const refusal = await TH.refusalOf(call(vaultDB))
      expect(refusal).to.be.instanceOf(VaultError)
      expect(refusal.kind).to.eq('identity_revoked')
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
      const refusal = await TH.refusalOf(vaultDB.readBundle(u1))
      expect(refusal.kind).to.eq('identity_revoked')
      expect(refusal.message).to.include('No one is signed in')
      expect(() => vaultDB.subscribe(u1, TH.changeCounter().onChange)).to.throw(VaultError).with.property('kind', 'identity_revoked')
      expect(spy.sent).to.have.lengthOf(0)
    })
  }

  it("never quotes the user in a refusal", async () => {
    const vaultDB = postgresVaultDB({ client: TH.failingClient(new Error('unused')), userId: 'alice@example.test' })
    const refusal = await TH.refusalOf(vaultDB.readBundle(TH.scopeOf('mallory@example.test')))
    expect(String(refusal.message)).to.not.include('alice')
    expect(String(refusal.message)).to.not.include('mallory')
  })
})

describe("postgresVaultDB, what it stores", () => {
  it("stores a bundle a column to a field, its unlock envelopes as one jsonb", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = TH.requestFor(db, 'u1')
    await vaultDB.createBundle(TH.bundleOf('u1'))
    const { rows } = await db.query('SELECT * FROM safebyok_bundles')
    expect(rows).to.deep.equal([{
      applabel:         'acme',
      user_id:          'u1',
      vaultlabel:       'main',
      format:           'safebyok-vault-v2',
      vault_id:         'vault-id-u1',
      unlock_epoch:     1,
      vault_key_epoch:  1,
      prior_vault_key:  null,
      unlocks:          TH.bundleOf('u1').unlocks,
      registered_at:    Date.UTC(2026, 9, 14),
    }])
  })

  it("keeps a bundle's envelopes whole and in their order, through an update", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = TH.requestFor(db, 'u1')
    await vaultDB.createBundle(TH.bundleOf('u1'))
    const unlocks = [TH.envelopeOf('work_phrase'), TH.envelopeOf('home_phrase'), TH.envelopeOf('passphrase')]
    const next = TH.bundleOf('u1', { unlock_epoch: 2, unlocks })
    await vaultDB.updateBundle(next, { vault_id: 'vault-id-u1', unlock_epoch: 1 })
    const standing = await vaultDB.readBundle(u1)
    expect(standing).to.deep.equal(next)
    expect(standing?.unlocks.map((envelope) => envelope.unlocklabel)).to.deep.equal(['work_phrase', 'home_phrase', 'passphrase'])
  })

  it("stores a lockbox a column to a field, beside its vault's scope and vault_id, its public bag as the text it was written as", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = TH.requestFor(db, 'u1')
    await vaultDB.createBundle(TH.bundleOf('u1'))
    // Keys jsonb would reorder (it sorts the shorter first) and spacing it would add: the text is
    // bound as written, so it must come back so.
    const publicJson = '{"alpha":"café","zeta":1}'
    await vaultDB.updateBox(u1, TH.boxOf('anthropic', 'one', { public_json: publicJson }), noBoxYet)
    const { rows } = await db.query('SELECT * FROM safebyok_lockboxes')
    expect(rows).to.deep.equal([{
      applabel:               'acme',
      user_id:                'u1',
      vaultlabel:             'main',
      vault_id:               'vault-id-u1',
      format:                 'safebyok-lockbox-v4',
      boxlabel:               'anthropic',
      revision_id:            'rev-one',
      vault_key_epoch:        1,
      lockbox_key_wrapped:    TH.fakeCiphered('boxkey-one'),
      whisper_ciphered:       TH.fakeCiphered('whisper-one'),
      whisper_codec:          'json_v1',
      whisper_schema_version: 1,
      public_json:            publicJson,
      registered_at:          Date.UTC(2026, 9, 14),
      written_at:             Date.UTC(2026, 9, 14),
    }])
    expect(await vaultDB.readBox(u1, 'anthropic')).to.include({ public_json: publicJson })
  })

  it("lists lockboxes without asking for their ciphered fields", async () => {
    const db = await TH.emptyDatabase()
    const spy = TH.spyClient(db)
    const vaultDB = postgresVaultDB({ client: spy.client, userId: 'u1' })
    await vaultDB.listBoxes(u1)
    const [listing] = spy.sent
    expect(listing?.text).to.include('boxlabel')
    expect(listing?.text).to.not.include('whisper_ciphered')
    expect(listing?.text).to.not.include('lockbox_key_wrapped')
  })

  it("sends every verb as one statement", async () => {
    const db = await TH.emptyDatabase()
    const spy = TH.spyClient(db)
    const vaultDB = postgresVaultDB({ client: spy.client, userId: 'u1' })
    await vaultDB.createBundle(TH.bundleOf('u1'))
    await vaultDB.updateBundle({ ...TH.bundleOf('u1'), unlock_epoch: 2 }, { vault_id: 'vault-id-u1', unlock_epoch: 1 })
    await vaultDB.updateBox(u1, TH.boxOf('anthropic', 'one'), noBoxYet)
    await vaultDB.updateBox(u1, TH.boxOf('anthropic', 'two'), { vault_id: 'vault-id-u1', revision_id: 'rev-one', vault_key_epoch: 1 })
    await vaultDB.readBox(u1, 'anthropic')
    await vaultDB.eraseBox(u1, 'anthropic', thisVault)
    await vaultDB.eraseVault(u1, thisVault)
    expect(spy.sent).to.have.lengthOf(7)
  })

  it("leaves no lockbox standing when its bundle goes: erasing the vault takes them in the same statement", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = TH.requestFor(db, 'u1')
    await vaultDB.createBundle(TH.bundleOf('u1'))
    await vaultDB.updateBox(u1, TH.boxOf('anthropic', 'one'), noBoxYet)
    await db.query('DELETE FROM safebyok_bundles')
    const { rows } = await db.query('SELECT boxlabel FROM safebyok_lockboxes')
    expect(rows).to.have.lengthOf(0)
  })
})

/** The boxlabels in u1's vault, as `vaultDB` lists them. */
const boxlabelsIn = async (vaultDB: VaultDB): Promise<string[]> => {
  const listed = await vaultDB.listBoxes(u1)
  return listed.map((box) => box.boxlabel)
}

/** A request for u1 over `db` holding vaults to `maxLockboxes`, its vault made and given those boxlabels. */
const filledTo = async (db: PGlite, maxLockboxes: number, boxlabels: readonly string[]) => {
  const vaultDB = postgresVaultDB({ client: db, userId: 'u1', maxLockboxes })
  await vaultDB.createBundle(TH.bundleOf('u1'))
  for (const boxlabel of boxlabels) { await vaultDB.updateBox(u1, TH.boxOf(boxlabel, `sk-fake-${boxlabel}`), noBoxYet) }
  return vaultDB
}

/** What InsertBoxSql answers, for a spy to say in place of the database: why a first write did not land. */
const missedBecause = (why: { vault_stands: boolean, box_stood: boolean, was_full: boolean }) => (
  (text: string) => (text.includes('INSERT INTO safebyok_lockboxes') ? Promise.resolve({ rows: [{ landed: false, ...why }] }) : undefined)
)

/** The foreign key violation Postgres raises for a lockbox whose vault is gone, as a driver hands it up. */
const foreignKeyViolation = Object.assign(new Error('insert or update on table "safebyok_lockboxes" violates foreign key constraint'), { code: '23503' })

// A replacement in a full vault, and a first write over a boxlabel taken there, are the battery's
// line 4.3; a lockbox landing once an erase has made room, its line 4.4: run over makeCappedVaultDB.
describe("postgresVaultDB, its lockbox limit", () => {
  it("refuses a new lockbox past maxLockboxes as vault_full, writing nothing and naming no boxlabel", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = await filledTo(db, 2, ['openai', 'anthropic'])
    const refusal = await TH.expectRefusal(vaultDB.updateBox(u1, TH.boxOf('secret_project_x', 'sk-fake'), noBoxYet), 'vault_full')
    expect(refusal.message).to.include('2 lockboxes')
    expect(refusal.message).to.not.include('secret_project_x')
    expect(await boxlabelsIn(vaultDB)).to.have.members(['openai', 'anthropic'])
  })

  it("refuses a first write in a full vault of another vault_id as stale_write: the count is the standing vault's", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = await filledTo(db, 1, ['openai'])
    await TH.expectRefusal(vaultDB.updateBox(u1, TH.boxOf('anthropic', 'sk-fake'), { vault_id: 'vault-id-gone', revision_id: null, vault_key_epoch: 1 }), 'stale_write')
    expect(await boxlabelsIn(vaultDB)).to.deep.equal(['openai'])
  })

  it("refuses a first write into a vault that is not there as stale_write, not vault_full", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = postgresVaultDB({ client: db, userId: 'u1', maxLockboxes: 1 })
    await TH.expectRefusal(vaultDB.updateBox(u1, TH.boxOf('anthropic', 'sk-fake'), noBoxYet), 'stale_write')
    expect(await vaultDB.readBundle(u1)).to.be.null
  })

  // The insert says why it missed, from one snapshot, so no second read is asked. What a miss means
  // is the adapter's to read; these answer the insert with each reason a race can leave.
  const misses: [string, { vault_stands: boolean, box_stood: boolean, was_full: boolean }, VaultErrorKind][] = [
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
      const vaultDB = postgresVaultDB({ client: spy.client, userId: 'u1', maxLockboxes: 1 })
      await TH.expectRefusal(vaultDB.updateBox(u1, TH.boxOf('anthropic', 'sk-fake'), noBoxYet), kind)
      expect(spy.sent).to.have.lengthOf(1)
    })
  }

  it("refuses as stale_write a foreign key violation on the insert: its vault was erased after the statement began", async () => {
    const db = await TH.emptyDatabase()
    await filledTo(db, 5, [])
    const spy = TH.spyClient(db, (text) => (text.includes('INSERT INTO safebyok_lockboxes') ? Promise.reject(foreignKeyViolation) : undefined))
    const vaultDB = postgresVaultDB({ client: spy.client, userId: 'u1', maxLockboxes: 5 })
    await TH.expectRefusal(vaultDB.updateBox(u1, TH.boxOf('anthropic', 'sk-fake'), noBoxYet), 'stale_write')
    expect(spy.sent).to.have.lengthOf(1)
  })

  it("maps the code Postgres gives a lockbox whose vault is not there, and only that one", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = await filledTo(db, 5, [])
    const orphan = TH.boxOf('anthropic', 'sk-fake')
    const insertOrphan = db.query(
      `INSERT INTO safebyok_lockboxes (applabel, user_id, vaultlabel, vault_id, format, boxlabel, revision_id, vault_key_epoch, lockbox_key_wrapped, whisper_ciphered, whisper_codec, whisper_schema_version, public_json, registered_at, written_at)
       VALUES ('acme', 'u1', 'main', 'vault-id-gone', $1, $2, $3, 1, '{}', '{}', 'json_v1', 1, '{}', 0, 0)`,
      [orphan.format, orphan.boxlabel, orphan.revision_id],
    )
    expect(await TH.refusalOf(insertOrphan)).to.have.property('code', '23503')
    expect(await boxlabelsIn(vaultDB)).to.deep.equal([])
  })

  it("asks one statement of every first write, keeping no count, and locking nothing but its bundle, shared", async () => {
    const db = await TH.emptyDatabase()
    await filledTo(db, 2, ['openai'])
    const spy = TH.spyClient(db)
    const vaultDB = postgresVaultDB({ client: spy.client, userId: 'u1', maxLockboxes: 2 })
    await vaultDB.updateBox(u1, TH.boxOf('anthropic', 'sk-fake'), noBoxYet)
    await TH.expectRefusal(vaultDB.updateBox(u1, TH.boxOf('mistral', 'sk-fake'), noBoxYet), 'vault_full')
    await TH.expectRefusal(vaultDB.updateBox(u1, TH.boxOf('mistral', 'sk-fake'), { vault_id: 'vault-id-gone', revision_id: null, vault_key_epoch: 1 }), 'stale_write')
    await vaultDB.eraseBox(u1, 'anthropic', thisVault)
    expect(spy.sent).to.have.lengthOf(4)
    for (const { text } of spy.sent) {
      expect(text).to.not.match(/FOR (NO KEY )?UPDATE|FOR KEY SHARE|lockbox_count/)
    }
    // Each lockbox write reads its bundle FOR SHARE, once; the erase locks nothing.
    expect(spy.sent.map(({ text }) => text.match(/FOR SHARE/g)?.length ?? 0)).to.deep.equal([1, 1, 1, 0])
  })

  it("reads the bundle FOR SHARE in a replacement too, in its one statement", async () => {
    const db = await TH.emptyDatabase()
    await filledTo(db, 2, ['openai'])
    const spy = TH.spyClient(db)
    const vaultDB = postgresVaultDB({ client: spy.client, userId: 'u1', maxLockboxes: 2 })
    await vaultDB.updateBox(u1, TH.boxOf('openai', 'sk-fake-again'), { ...noBoxYet, revision_id: 'rev-sk-fake-openai' })
    expect(spy.sent.map(({ text }) => text.match(/FOR SHARE/g)?.length ?? 0)).to.deep.equal([1])
  })

  it("lets exactly one of two first writes sent at once take the last place, when one statement is run after the other", async () => {
    // PGlite runs one statement at a time, so the second counts the first's lockbox: this holds
    // writes made one after another, as they arrive here. Writers racing on a real server may
    // each find room, and the README says so; e2e/tests/postgres/races.test.ts races them on a real server.
    const db = await TH.emptyDatabase()
    const vaultDB = await filledTo(db, 2, ['openai'])
    const outcomes = await Promise.allSettled([
      vaultDB.updateBox(u1, TH.boxOf('anthropic', 'sk-fake-one'), noBoxYet),
      postgresVaultDB({ client: db, userId: 'u1', maxLockboxes: 2 }).updateBox(u1, TH.boxOf('mistral', 'sk-fake-two'), noBoxYet),
    ])
    expect(outcomes.map((outcome) => outcome.status)).to.have.members(['fulfilled', 'rejected'])
    expect(await boxlabelsIn(vaultDB)).to.have.lengthOf(2)
  })

  it("keeps every lockbox of a vault racing writers took past its limit, readable by its boxlabel, and lands a new one once erases make room", async () => {
    // As racing writers may leave a vault, by the README: past its limit, here by a writer holding
    // a higher one.
    const db = await TH.emptyDatabase()
    const vaultDB = await filledTo(db, 2, ['openai', 'anthropic'])
    const higher = await filledTo(db, 1000, [])
    await higher.updateBox(u1, TH.boxOf('mistral', 'sk-fake-three'), noBoxYet)
    expect(await boxlabelsIn(vaultDB)).to.have.members(['openai', 'anthropic', 'mistral'])
    const racer = await vaultDB.readBox(u1, 'mistral')
    expect(racer?.boxlabel).to.eq('mistral')
    await TH.expectRefusal(vaultDB.updateBox(u1, TH.boxOf('gemini', 'sk-fake'), noBoxYet), 'vault_full')
    await vaultDB.eraseBox(u1, 'openai', thisVault)
    await TH.expectRefusal(vaultDB.updateBox(u1, TH.boxOf('gemini', 'sk-fake'), noBoxYet), 'vault_full')
    await vaultDB.eraseBox(u1, 'anthropic', thisVault)
    await vaultDB.updateBox(u1, TH.boxOf('gemini', 'sk-fake'), noBoxYet)
    expect(await boxlabelsIn(vaultDB)).to.have.members(['mistral', 'gemini'])
  })

  it("holds a vault filled under a higher limit to a lowered one, stranding none of its lockboxes", async () => {
    const db = await TH.emptyDatabase()
    await filledTo(db, 1000, ['openai', 'anthropic', 'mistral'])
    const lowered = postgresVaultDB({ client: db, userId: 'u1', maxLockboxes: 2 })
    await TH.expectRefusal(lowered.updateBox(u1, TH.boxOf('gemini', 'sk-fake'), noBoxYet), 'vault_full')
    expect(await boxlabelsIn(lowered)).to.have.members(['openai', 'anthropic', 'mistral'])
  })

  it("counts each vault apart, even one user's two", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = await filledTo(db, 1, ['openai'])
    const other = { ...u1, vaultlabel: 'other' }
    await vaultDB.createBundle({ ...TH.bundleOf('u1'), vaultlabel: 'other' })
    await vaultDB.updateBox(other, TH.boxOf('openai', 'sk-fake'), noBoxYet)
    await TH.expectRefusal(vaultDB.updateBox(other, TH.boxOf('anthropic', 'sk-fake'), noBoxYet), 'vault_full')
    expect(await boxlabelsIn(vaultDB)).to.deep.equal(['openai'])
  })

  it("refuses as vault_full a store() its vault's own count let through, when another device filled the vault unheard", async () => {
    const db = await TH.emptyDatabase()
    const opened = () => openVault({
      applabel: 'acme', userId: 'u1', vaultlabel: 'main', deviceDB: memoryDeviceDB(), keyDeriver: TH.testDeriver, passphraseStrengthTest: TH.anyPassphraseTest,
      // No listen: neither vault hears the other's writes.
      vaultDB: postgresVaultDB({ client: db, userId: 'u1', maxLockboxes: 2 }),
    })
    const here = await opened()
    await here.unlock('correct horse battery staple')
    await here.store('openai', 'sk-fake-one')
    const there = await opened()
    await there.unlock('correct horse battery staple')
    await there.store('anthropic', 'sk-fake-two')
    expect(here.getSnapshot().boxes).to.have.lengthOf(1)
    const refusal = await TH.expectRefusal(here.store('mistral', 'sk-fake-three'), 'vault_full')
    expect(refusal.message).to.include('its storage keeps')
    here.close()
    there.close()
  })

  it("opens a vault with the smaller of MaxLockboxes and its own, and refuses one asking for more", async () => {
    const db = await TH.emptyDatabase()
    const optsFor = (maxLockboxes?: number) => ({
      applabel: 'acme', userId: 'u1', vaultlabel: 'main', deviceDB: memoryDeviceDB(), keyDeriver: TH.testDeriver, passphraseStrengthTest: TH.anyPassphraseTest,
      vaultDB: postgresVaultDB({ client: db, userId: 'u1', maxLockboxes: 3 }), maxLockboxes,
    })
    await TH.expectRefusal(openVault(optsFor(4)), 'bad_option')
    const vault = await openVault(optsFor())
    await vault.unlock('correct horse battery staple')
    for (const boxlabel of ['one', 'two', 'three']) { await vault.store(boxlabel, `sk-fake-${boxlabel}`) }
    const refusal = await TH.expectRefusal(vault.store('four', 'sk-fake-four'), 'vault_full')
    expect(refusal.message).to.include('limit of 3 lockboxes')
    vault.close()
  })
})

describe("postgresVaultDB, listBoxRecords", () => {
  it("lists each lockbox as stored, ciphered fields left out, format kept, the public bag as its JSON text", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = TH.requestFor(db, 'u1')
    await vaultDB.createBundle(TH.bundleOf('u1'))
    const emptied = TH.boxOf('openai', 'two', { public_json: '{}' })
    await vaultDB.updateBox(u1, TH.boxOf('anthropic', 'one'), noBoxYet)
    await vaultDB.updateBox(u1, emptied, noBoxYet)
    const records = await vaultDB.listBoxRecords(u1)
    const { lockbox_key_wrapped: _wrapped, whisper_ciphered: _ciphered, ...listed } = TH.boxOf('anthropic', 'one')
    const { lockbox_key_wrapped: _wrappedToo, whisper_ciphered: _cipheredToo, ...listedEmptied } = emptied
    expect(records).to.have.deep.members([listed, listedEmptied])
  })

  it("is what a browser's VaultDB may hand back from its doListBoxes, where listBoxes's summaries are not", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = TH.requestFor(db, 'u1')
    await vaultDB.createBundle(TH.bundleOf('u1'))
    await vaultDB.updateBox(u1, TH.boxOf('anthropic', 'one'), noBoxYet)
    const [record] = await vaultDB.listBoxRecords(u1)
    expect(record).to.have.property('format', 'safebyok-lockbox-v4')
    const [summary] = await vaultDB.listBoxes(u1)
    expect(summary).to.not.have.property('format')
  })

  it("refuses a malformed scope with bad_label, before the database is asked", async () => {
    const db = await TH.emptyDatabase()
    const spy = TH.spyClient(db)
    const refusal = await TH.refusalOf(postgresVaultDB({ client: spy.client, userId: 'u1' }).listBoxRecords({ ...u1, vaultlabel: 42 } as never))
    expect(refusal.kind).to.eq('bad_label')
    expect(spy.sent).to.have.lengthOf(0)
  })

  it("refuses a scope below the floor, or with a name over 640 bytes, as every verb does, before the database is asked", async () => {
    const db = await TH.emptyDatabase()
    const spy = TH.spyClient(db)
    const vaultDB = postgresVaultDB({ client: spy.client, userId: 'u1' })
    for (const vaultlabel of ['main^x', 'tab\there', 'n'.repeat(641)]) {
      const refusal = await TH.refusalOf(vaultDB.listBoxRecords({ ...u1, vaultlabel }))
      expect(refusal.kind).to.eq('bad_label')
      // Each refusal names the name and the rule it broke, as every verb's does, quoting none of it.
      expect(refusal.message).to.include('vaultlabel')
      expect(refusal.message).to.not.include(vaultlabel)
    }
    expect(await vaultDB.listBoxRecords({ ...u1, vaultlabel: 'n'.repeat(640) })).to.deep.equal([])
    expect(spy.sent).to.have.lengthOf(1)
  })

  it("declares 640 bytes the most it holds in one name, refusing a longer one at every verb", async () => {
    const vaultDB = TH.requestFor(await TH.emptyDatabase(), 'u1')
    expect(vaultDB.maxNameBytes).to.eq(640)
    const refusal = await TH.refusalOf(vaultDB.readBundle({ ...u1, vaultlabel: 'n'.repeat(641) }))
    expect(refusal.kind).to.eq('bad_label')
  })

  it("refuses driver trouble with storage_unavailable, the driver's error as its cause", async () => {
    const dbDown = new Error('connect ECONNREFUSED 127.0.0.1:5432')
    const refusal = await TH.refusalOf(postgresVaultDB({ client: TH.failingClient(dbDown), userId: 'u1' }).listBoxRecords(u1))
    expect(refusal).to.be.instanceOf(VaultError)
    expect(refusal.kind).to.eq('storage_unavailable')
    expect(refusal.cause).to.eq(dbDown)
  })
})

describe("postgresVaultDB, in trouble", () => {
  it("refuses with storage_unavailable when the driver fails, its error as the cause", async () => {
    const dbDown = new Error('connect ECONNREFUSED 127.0.0.1:5432')
    const vaultDB = postgresVaultDB({ client: TH.failingClient(dbDown), userId: 'u1' })
    const refusal = await TH.refusalOf(vaultDB.readBundle(u1))
    expect(refusal).to.be.instanceOf(VaultError)
    expect(refusal.kind).to.eq('storage_unavailable')
    expect(refusal.cause).to.eq(dbDown)
  })

  it("refuses with storage_unavailable where the tables were never made", async () => {
    const db = await TH.emptyDatabase()
    const refusal = await TH.refusalOf(postgresVaultDB({ client: TH.tablelessClient(db), userId: 'u1' }).readBundle(u1))
    expect(refusal.kind).to.eq('storage_unavailable')
  })

  it("refuses a failure of a first lockbox write as storage_unavailable, a serialization failure among them", async () => {
    const db = await TH.emptyDatabase()
    const tooBusy = Object.assign(new Error('could not serialize access due to concurrent update'), { code: '40001' })
    const spy = TH.spyClient(db, (text) => (text.includes('INSERT INTO safebyok_lockboxes') ? Promise.reject(tooBusy) : undefined))
    const vaultDB = postgresVaultDB({ client: spy.client, userId: 'u1' })
    await vaultDB.createBundle(TH.bundleOf('u1'))
    const refusal = await TH.refusalOf(vaultDB.updateBox(u1, TH.boxOf('anthropic', 'one'), noBoxYet))
    expect(refusal.kind).to.eq('storage_unavailable')
    expect(refusal.cause).to.eq(tooBusy)
  })

  it("refuses a row damaged in the database as corrupt_record, leaving it as it is", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = TH.requestFor(db, 'u1')
    await vaultDB.createBundle(TH.bundleOf('u1'))
    await db.query(`UPDATE safebyok_bundles SET unlocks = '"not a list"'::jsonb`)
    const refusal = await TH.refusalOf(vaultDB.readBundle(u1))
    expect(refusal.kind).to.eq('corrupt_record')
    const { rows } = await db.query<{ unlocks: unknown }>('SELECT unlocks FROM safebyok_bundles')
    expect(rows[0]?.unlocks).to.eq('not a list')
  })
})

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
    await TH.requestFor(db, 'u1').createBundle(TH.bundleOf('u1'))
    await TH.eventually(() => heard.count === 1)
    unsubscribe()
    await TH.requestFor(db, 'u1').updateBox(u1, TH.boxOf('anthropic', 'one'), noBoxYet)
    await TH.wakeupAtNextTick()
    expect(heard.count).to.eq(1)
  })

  it("hears nothing of another user's vault, nor of another vault of the same user", async () => {
    const db = await TH.emptyDatabase()
    const { heard, unsubscribe } = await TH.liveWatch(TH.requestFor(db, 'u1'), u1)
    await TH.requestFor(db, 'u2').createBundle(TH.bundleOf('u2'))
    await TH.requestFor(db, 'u1').createBundle({ ...TH.bundleOf('u1'), ...TH.scopeOf('u1', 'spare') })
    await TH.requestFor(db, 'u1').createBundle(TH.bundleOf('u1'))
    await TH.eventually(() => heard.count > 0)
    await TH.wakeupAtNextTick()
    expect(heard.count).to.eq(1)
    unsubscribe()
  })

  it("hears an erased vault once, its lockboxes and all, and a create that changed nothing not at all", async () => {
    const db = await TH.emptyDatabase()
    const vaultDB = TH.requestFor(db, 'u1')
    await vaultDB.createBundle(TH.bundleOf('u1'))
    await vaultDB.updateBox(u1, TH.boxOf('anthropic', 'one'), noBoxYet)
    await vaultDB.updateBox(u1, TH.boxOf('openai', 'two'), noBoxYet)
    const payloads: string[] = []
    const unlisten = await db.listen(VaultChangeChannel, (payload) => { payloads.push(payload) })
    await vaultDB.createBundle({ ...TH.bundleOf('u1'), vault_id: 'the-second-arrival' })
    await vaultDB.eraseVault(u1, thisVault)
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
    await TH.requestFor(db, 'u1').createBundle(TH.bundleOf('u1'))
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
    expect(() => vaultDB.subscribe(u1, TH.changeCounter().onChange)).to.throw(VaultError).with.property('kind', 'storage_unavailable')

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
