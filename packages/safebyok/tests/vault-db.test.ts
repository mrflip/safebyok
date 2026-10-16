import { omit } from 'es-toolkit'
import { describe, expect, it } from 'vitest'
import { memoryStore } from '../src/string-store'
import { VaultDB, jsonBytes, localVaultDB, type BundleExpectation, type EraseExpectation, type LockboxExpectation, type StoredLockbox } from '../src/vault-db'
import { VaultError } from '../src/errors'
import type { Lockbox, VaultBundle, VaultScope } from '../src/types'
import * as Ckeys from '../src/ckeys'
import { NameFloorBytes, NoteFloorBytes } from '../src/validators'
import * as TH from './test-helpers'

/** The ckeys a MapVaultDB files its rows under. */
const Caret = Ckeys.joiner()

/**
 * The smallest honest adapter: a Map of records, each check-and-write in one synchronous step.
 * What an adapter author writes; the validation around it comes from the base class. Given a
 * `maxLockboxes`, it refuses a new lockbox in a vault already holding that many, after the
 * expectation is checked, so a first write under a boxlabel already taken is stale, never full.
 * Given `rows`, it shares them with every other MapVaultDB given the same: another device of one
 * backend in this process.
 */
class MapVaultDB extends VaultDB {
  readonly maxRecordBytes = Infinity
  readonly maxVaultBytes = Infinity
  readonly maxLockboxes: number
  readonly maxNameBytes: number = Infinity
  readonly reservedNameChars: string = Ckeys.DefaultDelimiter
  readonly rows: Map<string, unknown>

  constructor(maxLockboxes = Infinity, rows = new Map<string, unknown>()) {
    super()
    this.maxLockboxes = maxLockboxes
    this.rows = rows
  }

  private standingBundle(scope: VaultScope) { return this.rows.get(Caret.bundle(scope)) as VaultBundle | undefined }

  protected doReadBundle(scope: VaultScope): Promise<unknown> { return Promise.resolve(this.rows.get(Caret.bundle(scope)) ?? null) }

  protected doCreateBundle(bundle: VaultBundle) {
    if (! this.rows.has(Caret.bundle(bundle))) { this.rows.set(Caret.bundle(bundle), bundle) }
    return Promise.resolve(this.rows.get(Caret.bundle(bundle)))
  }

  protected doUpdateBundle(bundle: VaultBundle, expected: BundleExpectation) {
    const standing = this.standingBundle(bundle)
    if (standing?.vault_id !== expected.vault_id || standing.unlock_epoch !== expected.unlock_epoch) { return Promise.resolve(false) }
    this.rows.set(Caret.bundle(bundle), bundle)
    return Promise.resolve(true)
  }

  protected doReadBox(scope: VaultScope, boxlabel: string) { return Promise.resolve(this.rows.get(Caret.box(scope, boxlabel)) ?? null) }

  protected doListBoxes(scope: VaultScope): Promise<StoredLockbox[]> {
    const isBox = Caret.isBoxIn(scope)
    const listed = [...this.rows].filter(([ckey]) => isBox(ckey)).map(([ckey, row]) => ({ boxlabel: Caret.boxlabelOf(ckey), lockbox: row }))
    return Promise.resolve(listed.filter((stored): stored is StoredLockbox => stored.boxlabel !== null))
  }

  protected doUpdateBox(scope: VaultScope, lockbox: Lockbox, expected: LockboxExpectation) {
    const standingBox = this.rows.get(Caret.box(scope, lockbox.boxlabel)) as Lockbox | undefined
    const standingBundle = this.standingBundle(scope)
    const meets = standingBundle?.vault_id === expected.vault_id && standingBundle.vault_key_epoch === expected.vault_key_epoch
      && (standingBox?.revision_id ?? null) === expected.revision_id
    if (! meets) {
      return Promise.resolve(false)
    }
    const isBox = Caret.isBoxIn(scope)
    const held = [...this.rows].filter(([ckey]) => isBox(ckey)).length
    if (standingBox === undefined && held >= this.maxLockboxes) {
      return Promise.reject(new VaultError('vault_full', 'This vault is full: erase a lockbox to make room, then try again.'))
    }
    this.rows.set(Caret.box(scope, lockbox.boxlabel), lockbox)
    return Promise.resolve(true)
  }

  protected doEraseBox(scope: VaultScope, boxlabel: string, expected: EraseExpectation) {
    if (this.standingBundle(scope)?.vault_id !== expected.vault_id) { return Promise.resolve(false) }
    this.rows.delete(Caret.box(scope, boxlabel))
    return Promise.resolve(true)
  }

  protected doEraseVault(scope: VaultScope, expected: EraseExpectation) {
    if (this.standingBundle(scope)?.vault_id !== expected.vault_id) { return Promise.resolve(false) }
    const doomed = [...this.rows].map(([ckey]) => ckey).filter(Caret.isBoxIn(scope))
    for (const ckey of [...doomed, Caret.bundle(scope)]) { this.rows.delete(ckey) }
    return Promise.resolve(true)
  }
}

/**
 * A MapVaultDB in trouble: reading the bundle and subscribing fail as `failure` does; updating a
 * box rejects.
 */
class TroubledVaultDB extends MapVaultDB {
  private readonly failure: () => never

  constructor(failure: () => never) {
    super()
    this.failure = failure
  }

  protected override doReadBundle(): Promise<unknown> { this.failure() }
  protected override doSubscribe(): () => void { this.failure() }
  protected override doUpdateBox(): Promise<boolean> { return Promise.reject(new Error('the backend dropped the connection')) }
}

const unheard = (): void => undefined

// Each adapter's devices share one store or Map, synchronous and in this process, so they make no
// round trips for a turnstile to hold: the races interleave them at every await.
TH.describeVaultDB('localVaultDB', () => localVaultDB(memoryStore()), {
  pushes:      true,
  makeDevices: () => {
    const store = memoryStore()
    return () => localVaultDB(store)
  },
})
TH.describeVaultDB('the smallest honest adapter', () => new MapVaultDB(), {
  makeCappedVaultDB: (maxLockboxes) => new MapVaultDB(maxLockboxes),
  makeDevices:       () => {
    const rows = new Map<string, unknown>()
    return ({ maxLockboxes }) => new MapVaultDB(maxLockboxes, rows)
  },
})

// The ckeys u1's main vault is filed under, spelled out rather than computed: they are stored.
const u1BundleCkey = 'vault^acme^u1^main'
const u1BoxCkey = (boxlabel: string) => `box^acme^u1^main^${boxlabel}`

describe("localVaultDB", () => {
  it("holds a mebibyte in one record, and sets no limit on a vault, in bytes or in lockboxes, or on a name", () => {
    const vaultDB = localVaultDB(memoryStore())
    expect(vaultDB.maxRecordBytes).to.eq(1_048_576)
    expect(vaultDB.maxVaultBytes).to.eq(Infinity)
    expect(vaultDB.maxLockboxes).to.eq(Infinity)
    expect(vaultDB.maxNameBytes).to.eq(Infinity)
  })

  it("reserves the ^ its ckeys join names on, or the delimiter it was made with", () => {
    expect(localVaultDB(memoryStore()).reservedNameChars).to.eq('^')
    expect(localVaultDB(memoryStore(), { ckeyDelimiter: '/' }).reservedNameChars).to.eq('/')
  })

  it("reads rows filed under the ckeys of earlier versions as absent, and leaves them be", async () => {
    const store = memoryStore()
    const earlier = ['vault:acme:u1:main', 'box:acme:u1:main:anthropic', '["vault","acme","u1","main"]', '["box","acme","u1","main","anthropic"]']
    for (const ckey of earlier) {
      store.write(ckey, JSON.stringify(ckey.includes('box') ? TH.boxOf('anthropic', 'one') : TH.bundleOf('u1')))
    }
    const vaultDB = localVaultDB(store)
    expect(await vaultDB.readBundle(TH.scopeOf('u1'))).to.be.null
    expect(await vaultDB.readBox(TH.scopeOf('u1'), 'anthropic')).to.be.null
    expect(await vaultDB.listBoxes(TH.scopeOf('u1'))).to.have.lengthOf(0)
    expect(store.ckeys()).to.have.members(earlier)
  })

  it("files its rows under a delimiter of the host's, and round-trips them, as its second example shows", async () => {
    const store = memoryStore()
    const vaultDB = localVaultDB(store, { ckeyDelimiter: '/' })
    const scope = TH.scopeOf('u1^x')
    await vaultDB.createBundle(TH.bundleOf('u1^x'))
    await vaultDB.updateBox(scope, TH.boxOf('anthro^pic', 'one'), { vault_id: 'vault-id-u1^x', revision_id: null, vault_key_epoch: 1 })
    expect(store.ckeys()).to.have.members(['vault/acme/u1^x/main', 'box/acme/u1^x/main/anthro^pic'])
    const lockbox = await vaultDB.readBox(scope, 'anthro^pic')
    expect(lockbox?.revision_id).to.eq('rev-one')
    const listed = await vaultDB.listBoxes(scope)
    expect(listed.map((box) => box.boxlabel)).to.deep.equal(['anthro^pic'])
    await TH.expectRefusal(vaultDB.readBox(scope, 'a/b'), 'bad_label')
  })

  it("refuses a delimiter that is not one character as bad_option", () => {
    TH.expectSyncRefusal(() => localVaultDB(memoryStore(), { ckeyDelimiter: '::' }), 'bad_option')
  })

  it("reads lockboxes as written today, with a note and without one, and writes them back the same", async () => {
    // A stored vault is a contract: these rows are byte for byte what store() writes today.
    const store = memoryStore()
    const { note: _note, ...noteless } = TH.boxOf('openai', 'two')
    const notedRow = JSON.stringify(TH.boxOf('anthropic', 'one'))
    const notelessRow = JSON.stringify(noteless)
    expect(notelessRow).to.not.include('note')
    store.write(u1BundleCkey, JSON.stringify(TH.bundleOf('u1')))
    store.write(u1BoxCkey('anthropic'), notedRow)
    store.write(u1BoxCkey('openai'), notelessRow)
    const vaultDB = localVaultDB(store)
    const summaries = await vaultDB.listBoxes(TH.scopeOf('u1'))
    expect(summaries.map((box) => TH.summaryOf(box)?.note)).to.deep.equal(['a test box', null])
    const prev = await vaultDB.readBox(TH.scopeOf('u1'), 'openai')
    expect(prev).to.deep.equal(noteless)
    await vaultDB.updateBox(TH.scopeOf('u1'), noteless, { vault_id: 'vault-id-u1', revision_id: 'rev-two', vault_key_epoch: 1 })
    expect(store.read(u1BoxCkey('openai'))).to.eq(notelessRow)
  })

  it("lists a row that is not JSON as damaged, under the boxlabel it is stored under, beside the sound ones", async () => {
    const store = memoryStore()
    const scope = TH.scopeOf('u1')
    store.write(Caret.bundle(scope), JSON.stringify(TH.bundleOf('u1')))
    store.write(Caret.box(scope, 'openai'), JSON.stringify(TH.boxOf('openai', 'two')))
    store.write(Caret.box(scope, 'anthropic'), '{"not": json')
    const listed = await localVaultDB(store).listBoxes(scope)
    expect(listed[0]).to.deep.equal({ boxlabel: 'anthropic', damaged: true })
    expect(listed[1]).to.include({ boxlabel: 'openai', revision_id: 'rev-two', damaged: false })
    // Listed, never repaired: the row is still there for forensics.
    expect(store.read(Caret.box(scope, 'anthropic'))).to.eq('{"not": json')
  })

  it("stores each record as its JSON, under its kind and scope joined on ^", async () => {
    const store = memoryStore()
    const vaultDB = localVaultDB(store)
    await vaultDB.createBundle(TH.bundleOf('u1'))
    await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), TH.noBoxYet)
    expect(store.read(u1BundleCkey)).to.eq(JSON.stringify(TH.bundleOf('u1')))
    expect(store.read(u1BoxCkey('anthropic'))).to.eq(JSON.stringify(TH.boxOf('anthropic', 'one')))
    expect(store.ckeys()).to.have.members([u1BundleCkey, u1BoxCkey('anthropic')])
  })

  it("refuses a mangled row with kind 'corrupt_record', quoting none of it", async () => {
    const store = memoryStore()
    const vaultDB = localVaultDB(store)
    store.write(u1BundleCkey, '{"format":"not-a-vault","shhh":"SUPERSECRET"}')
    const refusal = await TH.expectRefusal(vaultDB.readBundle(TH.scopeOf('u1')), 'corrupt_record')
    expect(refusal).to.be.instanceOf(VaultError)
    expect(refusal.message).to.not.include('SUPERSECRET')
  })

  it("refuses a row that is not JSON at all, quoting none of it", async () => {
    const store = memoryStore()
    const vaultDB = localVaultDB(store)
    store.write(u1BoxCkey('anthropic'), 'SUPERSECRET{')
    await expect(vaultDB.readBox(TH.scopeOf('u1'), 'anthropic')).rejects.toThrow(/did not read back as JSON/)
  })

  it("refuses a record that names a scope or label other than the one asked for", async () => {
    const store = memoryStore()
    const vaultDB = localVaultDB(store)
    // A u2 bundle smuggled into u1's slot, and a lockbox row moved under another label.
    store.write(u1BundleCkey, JSON.stringify(TH.bundleOf('u2')))
    await expect(vaultDB.readBundle(TH.scopeOf('u1'))).rejects.toThrow(/different app, user, or vault/)
    store.write(u1BoxCkey('other_box'), JSON.stringify(TH.boxOf('anthropic', 'one')))
    await expect(vaultDB.readBox(TH.scopeOf('u1'), 'other_box')).rejects.toThrow(/different boxlabel/)
  })
})

/** Records an adapter may hand up from its listing, under the boxlabel each is stored under, and how each lists. */
const ListedRecordCases = [
  // sound:
  ["anthropic",  TH.boxOf('anthropic', 'one'),                               [["anthropic", false]],  'a sound lockbox as its summary'],
  // damaged, listed so they can be erased:
  ["anthropic",  TH.boxOf('other_box', 'one'),                               [["anthropic", true]],   'a record naming another boxlabel as damaged, under the one it is stored under'],
  ["anthropic",  { ...TH.boxOf('anthropic', 'one'), changed_at: 'later' },   [["anthropic", true]],   'a record with a malformed time as damaged'],
  ["anthropic",  { ...TH.boxOf('anthropic', 'one'), note: 'beep\u{7}' },     [["anthropic", true]],   'a record whose note holds a control character, below the floor, as damaged'],
  ["anthropic",  { ...TH.boxOf('anthropic', 'one'), note: 'cafe\u{301}' },   [["anthropic", true]],   'a record whose note is not in NFC, below the floor, as damaged'],
  ["anthropic",  null,                                                       [["anthropic", true]],   'a null record as damaged'],
  ["anthropic",  'not a lockbox',                                            [["anthropic", true]],   'a record that is not an object as damaged'],
  // stored under a name or note a vault's validators would refuse at its entry: stored under other checks, and sound
  ["Anthropic",  TH.boxOf('Anthropic', 'one'),                               [["Anthropic", false]],  'a record stored under a boxlabel the default check refuses as sound: a check is an alarm at entry, not a promise about storage'],
  ["anthropic",  { ...TH.boxOf('anthropic', 'one'), note: 'n'.repeat(257) }, [["anthropic", false]],  'a record whose note is longer than the default check admits as sound'],
  // stored under a name below the floor, which no verb could reach: not listed at all
  ["tab\there",  TH.boxOf('tab\there', 'one'),                               [],                      'nothing for a record stored under a boxlabel below the floor, which no verb could name'],
] as const

describe("the abstract VaultDB, around an adapter's half", () => {
  it("validates what the adapter returns: a wrong-shaped record is refused, not repaired", async () => {
    const vaultDB = new MapVaultDB()
    vaultDB.rows.set(Caret.bundle(TH.scopeOf('u1')), { format: 'not-a-vault' })
    const refusal = await TH.expectRefusal(vaultDB.readBundle(TH.scopeOf('u1')), 'corrupt_record')
    expect(refusal).to.be.instanceOf(VaultError)
    // Refused, never repaired or deleted: the record is still there for forensics.
    expect(vaultDB.rows.size).to.eq(1)
  })

  it("lists a lockbox an earlier version kept with an undefined note, as IndexedDB does, with a null note", async () => {
    const vaultDB = new MapVaultDB()
    vaultDB.rows.set(Caret.box(TH.scopeOf('u1'), 'anthropic'), { ...TH.boxOf('anthropic', 'one'), note: undefined })
    const [listed] = await vaultDB.listBoxes(TH.scopeOf('u1'))
    const summary = TH.summaryOf(listed)
    expect(summary).to.have.property('note')
    expect(summary?.note).to.be.null
  })

  for (const [boxlabel, record, expected, blurb] of ListedRecordCases) {
    it(`lists ${blurb}`, async () => {
      const vaultDB = new MapVaultDB()
      vaultDB.rows.set(Caret.box(TH.scopeOf('u1'), boxlabel), record)
      const listed = await vaultDB.listBoxes(TH.scopeOf('u1'))
      expect(listed.map((box) => [box.boxlabel, box.damaged])).to.deep.equal(expected)
    })
  }

  it("leaves out an entry an adapter hands up without a boxlabel as text, which no verb could name", async () => {
    class UnnamingVaultDB extends MapVaultDB {
      protected override doListBoxes() {
        return Promise.resolve([{ boxlabel: 42, lockbox: TH.boxOf('anthropic', 'one') }] as unknown as StoredLockbox[])
      }
    }
    expect(await new UnnamingVaultDB().listBoxes(TH.scopeOf('u1'))).to.deep.equal([])
  })

  it("accepts a listing projected server-side, without ciphered fields, so long as it keeps format", async () => {
    const vaultDB = new MapVaultDB()
    const projected = omit(TH.boxOf('anthropic', 'one'), ['lockbox_key_wrapped', 'whisper_ciphered'])
    vaultDB.rows.set(Caret.box(TH.scopeOf('u1'), 'anthropic'), projected)
    const summaries = await vaultDB.listBoxes(TH.scopeOf('u1'))
    expect(TH.summaryOf(summaries[0])?.revision_id).to.eq('rev-one')
    vaultDB.rows.set(Caret.box(TH.scopeOf('u1'), 'anthropic'), omit(projected, ['format']))
    expect(await vaultDB.listBoxes(TH.scopeOf('u1'))).to.deep.equal([{ boxlabel: 'anthropic', damaged: true }])
  })

  it("turns an adapter's own failure into kind 'storage_unavailable', keeping it as the cause", async () => {
    const outage = new Error('the backend is down')
    const vaultDB = new TroubledVaultDB(() => { throw outage })
    const refusal = await TH.expectRefusal(vaultDB.readBundle(TH.scopeOf('u1')), 'storage_unavailable')
    expect(refusal).to.be.instanceOf(VaultError)
    expect(refusal.cause).to.eq(outage)
    await expect(vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), TH.noBoxYet))
      .rejects.toThrow(/could not be reached/)
  })

  it("passes an adapter's own VaultError through untouched: not_permitted stays not_permitted", async () => {
    const forbidden = new VaultError('not_permitted', 'This backend does not let the signed-in user reach that vault.')
    const vaultDB = new TroubledVaultDB(() => { throw forbidden })
    const refusal = await TH.expectRefusal(vaultDB.readBundle(TH.scopeOf('u1')), 'not_permitted')
    expect(refusal).to.eq(forbidden)
  })

  it("subscribe defaults to silence: a usable unsubscribe, and no notifications", async () => {
    const vaultDB = new MapVaultDB()
    let heardCount = 0
    const unsubscribe = vaultDB.subscribe(TH.scopeOf('u1'), () => { heardCount += 1 })
    await vaultDB.createBundle(TH.bundleOf('u1'))
    expect(heardCount).to.eq(0)
    unsubscribe()
  })

  it("turns an adapter's failure to subscribe into kind 'storage_unavailable' as well, keeping it as the cause", () => {
    const outage = new Error('the backend is not connected')
    const vaultDB = new TroubledVaultDB(() => { throw outage })
    let refusal: unknown = null
    try { vaultDB.subscribe(TH.scopeOf('u1'), unheard) } catch (err) { refusal = err }
    expect(refusal).to.be.instanceOf(VaultError)
    expect((refusal as VaultError).kind).to.eq('storage_unavailable')
    expect((refusal as VaultError).cause).to.eq(outage)
  })

  it("refuses to subscribe to a scope below the floor", () => {
    const vaultDB = new MapVaultDB()
    expect(() => vaultDB.subscribe({ ...TH.scopeOf('u1'), applabel: '' }, unheard)).to.throw(VaultError, /applabel/).with.property('kind', 'bad_label')
  })

  it("refuses an onChange that is not a function, so no later write meets it", () => {
    const vaultDB = new MapVaultDB()
    expect(() => vaultDB.subscribe(TH.scopeOf('u1'), 'not a listener' as unknown as () => void))
      .to.throw(VaultError, /onChange function/).with.property('kind', 'bad_option')
  })
})

/** Writes a VaultDB refuses before its adapter's half sees them: none is one a vault builds. */
const RefusedWrites = [
  // the records:
  ['bad_option', (vaultDB: VaultDB) => vaultDB.createBundle({ ...TH.bundleOf('u1'), unlock_epoch: 1.5 }),                              'a bundle with a fractional unlock_epoch'],
  ['bad_option', (vaultDB: VaultDB) => vaultDB.createBundle({ ...TH.bundleOf('u1'), unlocks: [omit(TH.envelopeOf('passphrase'), ['vault_key_wrapped'])] } as VaultBundle), 'a bundle whose envelope is missing its wrapped vaultKey'],
  ['bad_label',  (vaultDB: VaultDB) => vaultDB.createBundle({ ...TH.bundleOf('u1'), applabel: 'Ac\u{7}me' }),                         'a bundle whose applabel holds a control character'],
  ['bad_option', (vaultDB: VaultDB) => vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one', { note: 'beep\u{7}' }), TH.noBoxYet), 'a lockbox whose note no read would accept'],
  ['bad_label',  (vaultDB: VaultDB) => vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('key\u{D83D}', 'one'), TH.noBoxYet),                  'a lockbox whose boxlabel is half of an emoji, whatever the checks'],
  ['bad_option', (vaultDB: VaultDB) => vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one', { changed_at: 1_792_022_400 }), TH.noBoxYet), 'a lockbox time in epoch seconds'],
  ['bad_label',  (vaultDB: VaultDB) => vaultDB.updateBox(TH.scopeOf('u1'), undefined as unknown as Lockbox, TH.noBoxYet),               'no lockbox at all'],
  // the expectations:
  ['bad_option', (vaultDB: VaultDB) => vaultDB.updateBundle(TH.bundleOf('u1'), { vault_id: 'vault-id-u1', unlock_epoch: 0 }),          'a bundle expectation at epoch zero'],
  ['bad_option', (vaultDB: VaultDB) => vaultDB.updateBundle(TH.bundleOf('u1'), undefined as unknown as BundleExpectation),            'no bundle expectation at all'],
  ['bad_option', (vaultDB: VaultDB) => vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), { vault_id: 'vault-id-u1' } as LockboxExpectation), 'a lockbox expectation missing its revision_id'],
  ['bad_option', (vaultDB: VaultDB) => vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), { vault_id: 'vault-id-u1', revision_id: null } as LockboxExpectation), 'a lockbox expectation naming no vaultKey epoch'],
  ['bad_option', (vaultDB: VaultDB) => vaultDB.eraseBox(TH.scopeOf('u1'), 'anthropic', {} as EraseExpectation),                        'an erase expectation naming no vault'],
  ['bad_option', (vaultDB: VaultDB) => vaultDB.eraseVault(TH.scopeOf('u1'), { vault_id: '' }),                                         'an erase expectation naming an empty vault_id'],
  // the two together:
  ['bad_option', (vaultDB: VaultDB) => vaultDB.updateBundle(TH.bundleOf('u1', { vault_id: 'vault-id-new', unlock_epoch: 2 }), { vault_id: 'vault-id-u1', unlock_epoch: 1 }), 'a bundle update that would change the vault_id'],
  ['bad_option', (vaultDB: VaultDB) => vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one', { vault_key_epoch: 2 }), TH.noBoxYet), 'a lockbox sealed under another vaultKey than the expected one'],
] as const

/** A vault in `u1`'s slot with a lockbox, its bundle spoiled by `spoil`, and a sound neighbour beside it. */
const withDamagedBundle = (spoil: (bundle: VaultBundle) => unknown = (bundle) => ({ ...bundle, unlock_epoch: 'one' })) => {
  const vaultDB = new MapVaultDB()
  vaultDB.rows.set(Caret.bundle(TH.scopeOf('u1')), spoil(TH.bundleOf('u1')))
  vaultDB.rows.set(Caret.box(TH.scopeOf('u1'), 'anthropic'), TH.boxOf('anthropic', 'one'))
  vaultDB.rows.set(Caret.bundle(TH.scopeOf('u2')), TH.bundleOf('u2'))
  vaultDB.rows.set(Caret.box(TH.scopeOf('u2'), 'anthropic'), TH.boxOf('anthropic', 'one'))
  return vaultDB
}

describe("the abstract VaultDB, erasing a vault whose bundle is damaged", () => {
  it("erases the bundle and every lockbox of a vault whose bundle fails its checks, and nothing of any other", async () => {
    const vaultDB = withDamagedBundle()
    await TH.expectRefusal(vaultDB.readBundle(TH.scopeOf('u1')), 'corrupt_record')
    await vaultDB.eraseDamagedVault(TH.scopeOf('u1'))
    expect(vaultDB.rows.size).to.eq(2)
    const theirBundle = Caret.bundle(TH.scopeOf('u2'))
    const theirBox = Caret.box(TH.scopeOf('u2'), 'anthropic')
    expect(vaultDB.rows.has(theirBundle)).to.eq(true)
    expect(vaultDB.rows.has(theirBox)).to.eq(true)
    expect(await vaultDB.readBundle(TH.scopeOf('u1'))).to.be.null
  })

  it("counts a bundle naming another vault than the one asked for as damaged", async () => {
    const vaultDB = new MapVaultDB()
    vaultDB.rows.set(Caret.bundle(TH.scopeOf('u1')), TH.bundleOf('u2'))
    await vaultDB.eraseDamagedVault(TH.scopeOf('u1'))
    expect(vaultDB.rows.size).to.eq(0)
  })

  it("refuses a bundle that stands sound as bad_option, erasing nothing", async () => {
    const vaultDB = withDamagedBundle((bundle) => bundle)
    const before = new Map(vaultDB.rows)
    const refusal = await TH.expectRefusal(vaultDB.eraseDamagedVault(TH.scopeOf('u1')), 'bad_option')
    expect(refusal.message).to.include('destroy()')
    expect(vaultDB.rows).to.deep.equal(before)
  })

  it("is quiet where the scope holds no bundle", async () => {
    const vaultDB = new MapVaultDB()
    await vaultDB.eraseDamagedVault(TH.scopeOf('u1'))
    expect(vaultDB.rows.size).to.eq(0)
  })

  it("refuses a record too damaged to name its vault as damaged_bundle, erasing nothing", async () => {
    for (const record of [{ format: 'safebyok-vault-v1' }, { vault_id: '' }, { vault_id: 7 }, {}, 'not even a bag']) {
      const vaultDB = withDamagedBundle(() => record)
      const refusal = await TH.expectRefusal(vaultDB.eraseDamagedVault(TH.scopeOf('u1')), 'damaged_bundle')
      expect(refusal.message).to.include('nothing was erased')
      expect(vaultDB.rows.size).to.eq(4)
    }
  })

  const Envelope = TH.bundleOf('u1').unlocks[0]
  const NewerRecords = [
    [{ format: 'safebyok-vault-v3' },                                                      'a format this version does not know, whatever else it holds'],
    [(bundle: VaultBundle) => ({ ...bundle, format: 'safebyok-vault-v3' }),                'a bundle that is otherwise sound but for its format'],
    [(bundle: VaultBundle) => ({ ...bundle, format: 2 }),                                  'a format of another type'],
    [(bundle: VaultBundle) => ({ ...bundle, unlocks: [...bundle.unlocks, { method: 'smartcard', unlock_id: 'x' }] }), 'an unlock method this version does not know'],
    [(bundle: VaultBundle) => ({ ...bundle, unlocks: Array.from({ length: 9 }, () => Envelope) }), 'more unlocks than this version holds'],
  ] as const

  for (const [record, blurb] of NewerRecords) {
    it(`refuses ${blurb} as possibly newer than this version, erasing nothing`, async () => {
      const vaultDB = withDamagedBundle((bundle) => (typeof record === 'function' ? record(bundle) : { ...bundle, ...record }))
      const refusal = await TH.expectRefusal(vaultDB.eraseDamagedVault(TH.scopeOf('u1')), 'damaged_bundle')
      expect(refusal.message).to.include('newer version')
      expect(refusal.message).to.include('nothing was erased')
      expect(vaultDB.rows.size).to.eq(4)
    })
  }

  it("still erases a bundle that fails for anything it can only take for damage: a known format and methods, in number", async () => {
    const vaultDB = withDamagedBundle((bundle) => ({ ...bundle, unlocks: [{ ...Envelope, salt_b64: 7 }], registered_at: 'later' }))
    await vaultDB.eraseDamagedVault(TH.scopeOf('u1'))
    expect(vaultDB.rows.size).to.eq(2)
  })

  it("erases a bundle in a format an earlier version wrote, which is older, never newer", async () => {
    const vaultDB = withDamagedBundle(({ vault_key_epoch: _epoch, ...bundle }) => ({ ...bundle, format: 'safebyok-vault-v1' }))
    await vaultDB.eraseDamagedVault(TH.scopeOf('u1'))
    expect(vaultDB.rows.size).to.eq(2)
  })

  it("aims the erase at the vault_id it read, so a vault made anew meanwhile survives as stale_write", async () => {
    class ReplacedVaultDB extends MapVaultDB {
      protected override doEraseVault(): Promise<boolean> { return Promise.resolve(false) }
    }
    const vaultDB = new ReplacedVaultDB()
    vaultDB.rows.set(Caret.bundle(TH.scopeOf('u1')), { ...TH.bundleOf('u1'), unlock_epoch: 'one' })
    await TH.expectRefusal(vaultDB.eraseDamagedVault(TH.scopeOf('u1')), 'stale_write')
  })

  it("hands the erase the vault_id the damaged record carries", async () => {
    const asked: EraseExpectation[] = []
    class SpyingVaultDB extends MapVaultDB {
      protected override doEraseVault(scope: VaultScope, expected: EraseExpectation): Promise<boolean> {
        asked.push(expected)
        return super.doEraseVault(scope, expected)
      }
    }
    const vaultDB = new SpyingVaultDB()
    vaultDB.rows.set(Caret.bundle(TH.scopeOf('u1')), { ...TH.bundleOf('u1'), unlock_epoch: 'one' })
    await vaultDB.eraseDamagedVault(TH.scopeOf('u1'))
    expect(asked).to.deep.equal([{ vault_id: TH.bundleOf('u1').vault_id }])
  })

  it("refuses as damaged_bundle, erasing nothing, an adapter that validates on the way up and so never hands the record over", async () => {
    class CheckedVaultDB extends MapVaultDB {
      protected override doReadBundle(): Promise<unknown> {
        return Promise.reject(new VaultError('corrupt_record', 'did not read back'))
      }
    }
    const vaultDB = new CheckedVaultDB()
    vaultDB.rows.set(Caret.bundle(TH.scopeOf('u1')), { ...TH.bundleOf('u1'), unlock_epoch: 'one' })
    const refusal = await TH.expectRefusal(vaultDB.eraseDamagedVault(TH.scopeOf('u1')), 'damaged_bundle')
    expect((refusal.cause as VaultError).kind).to.eq('corrupt_record')
    expect(vaultDB.rows.size).to.eq(1)
  })

  it("wraps what the adapter throws as storage_unavailable, and checks the scope first", async () => {
    class DownVaultDB extends MapVaultDB {
      protected override doReadBundle(): Promise<unknown> { return Promise.reject(new Error('connection reset')) }
    }
    await TH.expectRefusal(new DownVaultDB().eraseDamagedVault(TH.scopeOf('u1')), 'storage_unavailable')
    await TH.expectRefusal(new MapVaultDB().eraseDamagedVault({ ...TH.scopeOf('u1'), applabel: '' }), 'bad_label')
  })
})

describe("the abstract VaultDB, on the way in", () => {
  for (const [kind, write, blurb] of RefusedWrites) {
    it(`refuses ${blurb} with kind '${kind}', and storage sees nothing`, async () => {
      const vaultDB = new MapVaultDB()
      vaultDB.rows.set(Caret.bundle(TH.scopeOf('u1')), TH.bundleOf('u1'))
      const before = [...vaultDB.rows]
      const refusal = await TH.expectRefusal(write(vaultDB), kind)
      expect(refusal).to.be.instanceOf(VaultError)
      expect([...vaultDB.rows]).to.deep.equal(before)
    })
  }

  it("never quotes a record it refuses", async () => {
    const vaultDB = new MapVaultDB()
    const sneaky = TH.boxOf('anthropic', 'one', { whisper_ciphered: TH.fakeCiphered('SUPERSECRET'), revision_id: '' })
    const refusal = await TH.expectRefusal(vaultDB.updateBox(TH.scopeOf('u1'), sneaky, TH.noBoxYet), 'bad_option')
    expect(refusal.message).to.not.include('SUPERSECRET')
    expect(refusal.message).to.not.include('anthropic')
  })

  it("hands its adapter the record as this package writes it: a field it does not know stays behind", async () => {
    const vaultDB = new MapVaultDB()
    await vaultDB.createBundle({ ...TH.bundleOf('u1'), stray_field: 'x' } as VaultBundle)
    expect(vaultDB.rows.get(u1BundleCkey)).to.deep.equal(TH.bundleOf('u1'))
  })

  it("lets a vault's own writes through untouched: a noteless box, a box replaced, an erase", async () => {
    const vaultDB = new MapVaultDB()
    await vaultDB.createBundle(TH.bundleOf('u1'))
    const noteless = omit(TH.boxOf('anthropic', 'one'), ['note'])
    await vaultDB.updateBox(TH.scopeOf('u1'), noteless, TH.noBoxYet)
    expect(vaultDB.rows.get(u1BoxCkey('anthropic'))).to.deep.equal(noteless)
    await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'two'), { vault_id: 'vault-id-u1', revision_id: 'rev-one', vault_key_epoch: 1 })
    await vaultDB.eraseBox(TH.scopeOf('u1'), 'anthropic', TH.thisVault)
    expect(await vaultDB.listBoxes(TH.scopeOf('u1'))).to.have.lengthOf(0)
  })
})

describe("the abstract VaultDB, listing", () => {
  it("lists a box whose ciphered fields are damaged, leaving read() to refuse it: one damaged box never costs the vault", async () => {
    const vaultDB = new MapVaultDB()
    vaultDB.rows.set(Caret.bundle(TH.scopeOf('u1')), TH.bundleOf('u1'))
    vaultDB.rows.set(Caret.box(TH.scopeOf('u1'), 'anthropic'), { ...TH.boxOf('anthropic', 'one'), whisper_ciphered: { cipher_iv_b64: '' } })
    vaultDB.rows.set(Caret.box(TH.scopeOf('u1'), 'openai'), TH.boxOf('openai', 'two'))
    const summaries = await vaultDB.listBoxes(TH.scopeOf('u1'))
    expect(summaries.map((summary) => summary.boxlabel)).to.deep.equal(['anthropic', 'openai'])
    await expect(vaultDB.readBox(TH.scopeOf('u1'), 'anthropic')).rejects.toThrow(/did not read back in a shape/)
  })
})

/** A scope no default check admits, which every verb takes: names above the floor. */
const scriptScope = { applabel: 'Acme: אקמה', user_id: 'u1', vaultlabel: 'ราก' } as const

describe("the abstract VaultDB, holding names to the floor", () => {
  it("takes any name above the floor in every verb, as a server serving several clients must: a vault's own validators are its own, at its entry", async () => {
    const vaultDB = new MapVaultDB()
    await vaultDB.createBundle({ ...TH.bundleOf('u1'), ...scriptScope })
    await vaultDB.updateBox(scriptScope, TH.boxOf('مفتاح العمل', 'one', { note: 'n'.repeat(500) }), TH.noBoxYet)
    const lockbox = await vaultDB.readBox(scriptScope, 'مفتاح العمل')
    expect(lockbox?.note).to.have.lengthOf(500)
    const summaries = await vaultDB.listBoxes(scriptScope)
    expect(summaries.map((summary) => summary.boxlabel)).to.deep.equal(['مفتاح العمل'])
    await vaultDB.eraseBox(scriptScope, 'مفتاح العمل', TH.thisVault)
    vaultDB.subscribe(scriptScope, unheard)()
    await vaultDB.eraseVault(scriptScope, TH.thisVault)
    expect(await vaultDB.readBundle(scriptScope)).to.be.null
  })

  const BelowTheFloor = [
    ["",                                'an empty name'],
    ["tab\there",                       'a control character'],
    ["cafe\u{301}",                     'a letter decomposed, not in NFC'],
    ["key\u{D83D}",                     'half of an emoji'],
    ["n".repeat(NameFloorBytes + 1),    'more than a kibibyte'],
    ["\u{E9}".repeat((NameFloorBytes / 2) + 1), 'more than a kibibyte of UTF-8, in fewer characters'],
  ] as const

  for (const [candidate, blurb] of BelowTheFloor) {
    it(`refuses ${blurb} as bad_label, as a boxlabel and in a scope, before its adapter's half sees it`, async () => {
      const vaultDB = new MapVaultDB()
      await TH.expectRefusal(vaultDB.readBundle({ ...TH.scopeOf('u1'), vaultlabel: candidate }), 'bad_label')
      await TH.expectRefusal(vaultDB.readBox(TH.scopeOf('u1'), candidate), 'bad_label')
      await TH.expectRefusal(vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf(candidate, 'one'), TH.noBoxYet), 'bad_label')
      expect(vaultDB.rows.size).to.eq(0)
    })
  }

  it("refuses, as 'bad_option', a lockbox whose note is below the floor, writing nothing", async () => {
    const vaultDB = new MapVaultDB()
    await vaultDB.createBundle(TH.bundleOf('u1'))
    const overlong = TH.boxOf('anthropic', 'one', { note: 'n'.repeat(NoteFloorBytes + 1) })
    await TH.expectRefusal(vaultDB.updateBox(TH.scopeOf('u1'), overlong, TH.noBoxYet), 'bad_option')
    expect(await vaultDB.readBox(TH.scopeOf('u1'), 'anthropic')).to.be.null
  })

  it("reads and lists as sound a lockbox whose note the default check refuses: it was stored under other checks", async () => {
    const vaultDB = new MapVaultDB()
    await vaultDB.createBundle(TH.bundleOf('u1'))
    vaultDB.rows.set(Caret.box(TH.scopeOf('u1'), 'anthropic'), TH.boxOf('anthropic', 'one', { note: 'n'.repeat(500) }))
    const lockbox = await vaultDB.readBox(TH.scopeOf('u1'), 'anthropic')
    expect(lockbox?.note).to.have.lengthOf(500)
    const [listed] = await vaultDB.listBoxes(TH.scopeOf('u1'))
    expect(TH.summaryOf(listed)?.note).to.have.lengthOf(500)
  })

  it("refuses, as 'corrupt_record', a stored lockbox whose note is below the floor, and lists it as damaged", async () => {
    const vaultDB = new MapVaultDB()
    await vaultDB.createBundle(TH.bundleOf('u1'))
    vaultDB.rows.set(Caret.box(TH.scopeOf('u1'), 'anthropic'), TH.boxOf('anthropic', 'one', { note: 'beep\u{7}' }))
    await TH.expectRefusal(vaultDB.readBox(TH.scopeOf('u1'), 'anthropic'), 'corrupt_record')
    expect(await vaultDB.listBoxes(TH.scopeOf('u1'))).to.deep.equal([{ boxlabel: 'anthropic', damaged: true }])
  })

  it("lists lockboxes by code unit, never by a locale, so every device lists them in one order", async () => {
    const vaultDB = new MapVaultDB()
    await vaultDB.createBundle(TH.bundleOf('u1'))
    for (const boxlabel of ['b', 'a_b', 'B', 'a1', '\u{E9}', 'z']) {
      vaultDB.rows.set(Caret.box(TH.scopeOf('u1'), boxlabel), TH.boxOf(boxlabel, boxlabel))
    }
    const listed = await vaultDB.listBoxes(TH.scopeOf('u1'))
    expect(listed.map((box) => box.boxlabel)).to.deep.equal(['B', 'a1', 'a_b', 'b', 'z', '\u{E9}'])
  })
})

/** A MapVaultDB holding names of at most eight bytes, and none holding `^` or `/`. */
class NarrowNamesVaultDB extends MapVaultDB {
  override readonly maxNameBytes = 8
  override readonly reservedNameChars = '^/'
}

/** Names the narrow adapter refuses, each by one of its declared limits. */
const NarrowRefusals = [
  ["a^b",           "'^'",       'a name holding the first character it reserves'],
  ["a/b",           "'/'",       'a name holding the second'],
  ["n".repeat(9),   '9 bytes',   'a name of nine bytes'],
  ["\u{E9}".repeat(5), '10 bytes', 'a name of five characters but ten bytes of UTF-8'],
] as const

describe("the abstract VaultDB, holding names to what its adapter declares", () => {
  for (const [candidate, said, blurb] of NarrowRefusals) {
    it(`refuses ${blurb} as bad_label, in every verb and every place a candidate goes, naming the rule and quoting nothing`, async () => {
      const vaultDB = new NarrowNamesVaultDB()
      vaultDB.rows.set(Caret.bundle(TH.scopeOf('u1')), TH.bundleOf('u1'))
      const before = [...vaultDB.rows]
      const scopes = [{ ...TH.scopeOf('u1'), applabel: candidate }, { ...TH.scopeOf('u1'), user_id: candidate }, { ...TH.scopeOf('u1'), vaultlabel: candidate }]
      for (const scope of scopes) {
        const refusal = await TH.expectRefusal(vaultDB.readBundle(scope), 'bad_label')
        expect(refusal.message).to.include(said)
        expect(refusal.message).to.not.include(candidate)
        await TH.expectRefusal(vaultDB.createBundle({ ...TH.bundleOf('u1'), ...scope }), 'bad_label')
        await TH.expectRefusal(vaultDB.listBoxes(scope), 'bad_label')
        await TH.expectRefusal(vaultDB.eraseVault(scope, TH.thisVault), 'bad_label')
        await TH.expectRefusal(vaultDB.eraseDamagedVault(scope), 'bad_label')
        expect(() => vaultDB.subscribe(scope, unheard)).to.throw(VaultError).with.property('kind', 'bad_label')
      }
      const refusal = await TH.expectRefusal(vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf(candidate, 'one'), TH.noBoxYet), 'bad_label')
      expect(refusal.message).to.include('boxlabel')
      await TH.expectRefusal(vaultDB.readBox(TH.scopeOf('u1'), candidate), 'bad_label')
      await TH.expectRefusal(vaultDB.eraseBox(TH.scopeOf('u1'), candidate, TH.thisVault), 'bad_label')
      expect([...vaultDB.rows]).to.deep.equal(before)
    })
  }

  it("takes a name of exactly as many bytes as it declares, and any character it does not reserve", async () => {
    const vaultDB = new NarrowNamesVaultDB()
    await vaultDB.createBundle(TH.bundleOf('u1'))
    await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('a:b|c.de', 'one'), TH.noBoxYet)
    const lockbox = await vaultDB.readBox(TH.scopeOf('u1'), 'a:b|c.de')
    expect(lockbox?.revision_id).to.eq('rev-one')
  })
})

/** A MapVaultDB holding at most `maxRecordBytes` in one record. */
class SmallRecordVaultDB extends MapVaultDB {
  override readonly maxRecordBytes: number

  constructor(maxRecordBytes: number) {
    super()
    this.maxRecordBytes = maxRecordBytes
  }
}

describe("the abstract VaultDB, weighing a lockbox", () => {
  it("refuses, as 'lockbox_too_large', a lockbox heavier with its scope than its backend holds in one record, writing nothing", async () => {
    const lockbox = TH.boxOf('anthropic', 'one', { note: 'n'.repeat(900) })
    const recordBytes = jsonBytes({ ...TH.scopeOf('u1'), ...lockbox })
    const fits = new SmallRecordVaultDB(recordBytes)
    await fits.createBundle(TH.bundleOf('u1'))
    await fits.updateBox(TH.scopeOf('u1'), lockbox, TH.noBoxYet)
    const tight = new SmallRecordVaultDB(recordBytes - 1)
    await tight.createBundle(TH.bundleOf('u1'))
    const err = await TH.expectRefusal(tight.updateBox(TH.scopeOf('u1'), lockbox, TH.noBoxYet), 'lockbox_too_large')
    expect(err.message).to.include(String(recordBytes))
    expect(err.message).to.not.include('nnnn')
    expect(await tight.readBox(TH.scopeOf('u1'), 'anthropic')).to.be.null
  })
})

describe("jsonBytes", () => {
  const JsonBytesCases = [
    ["",                    2,   'empty text is its two quotes'],
    ["acme",                6,   'ASCII is a byte a character'],
    ["\u{5D0}",             4,   'Hebrew is two bytes a letter'],
    ["\u{E01}",             5,   'Thai is three bytes a letter'],
    ["\u{1F511}",           6,   'a character outside the BMP is four'],
    ["\n",                  4,   'a control character is its escape'],
  ] as const

  for (const [val, expected, blurb] of JsonBytesCases) {
    it(blurb, () => { expect(jsonBytes(val)).to.eq(expected) })
  }
})
