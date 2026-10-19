import { omit } from 'es-toolkit'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { memoryStore } from '../src/string-store'
import { VaultDB, jsonBytes, localVaultDB, type VaultPropsExpectation, type RetireExpectation, type LockboxExpectation, type LockboxRetireExpectation, type StoredLockbox, type VaultDBOpts, type WatchTrouble } from '../src/vault-db'
import { VaultError } from '../src/errors'
import { DefaultLogger, parseLogger, type VaultLogger } from '../src/logger'
import type { Lockbox } from '../src/lockbox'
import type { VaultProps, VaultScope } from '../src/types'
import * as Ckeys from '../src/ckeys'
import * as Expectations from '../src/expectations'
import { NameFloorBytes } from '../src/validators'
import * as TH from './test-helpers'


/**
 * The smallest honest adapter: a Map of records, each check-and-write in one synchronous step.
 * What an adapter author writes; the validation around it comes from the base class. Given a
 * `maxLockboxes`, it refuses a new lockbox in a vault already holding that many, after the
 * expectation is checked, so a first write under a boxlabel already taken is stale, never full.
 * Given `rows`, it shares them with every other MapVaultDB given the same: another device of one
 * backend in this process. Given `vaultDBOpts`, it hands them to the base class, as every adapter's
 * factory does.
 */
class MapVaultDB extends VaultDB {
  readonly maxRecordBytes = Infinity
  readonly maxVaultBytes = Infinity
  readonly maxLockboxes: number
  readonly maxNameBytes: number = Infinity
  readonly rows: Map<string, unknown>

  // What super() is handed: the options, quiet unless they carry a logger (a spy's, kept out of the
  // test output), or `handed`, for a test of what the base class makes of it.
  constructor(maxLockboxes = Infinity, rows = new Map<string, unknown>(), vaultDBOpts: VaultDBOpts = {}, handed?: VaultDBOpts) {
    super(handed ?? { ...vaultDBOpts, logger: vaultDBOpts.logger ?? TH.spyLogger().logger })
    this.maxLockboxes = maxLockboxes
    this.rows = rows
  }

  private standingVaultProps(scope: VaultScope) { return this.rows.get(Ckeys.vaultProps(scope)) as VaultProps | undefined }

  protected doReadVaultProps(scope: VaultScope): Promise<unknown> { return Promise.resolve(this.rows.get(Ckeys.vaultProps(scope)) ?? null) }

  protected doFetchOrCreateVaultProps(vaultProps: VaultProps) {
    if (! this.rows.has(Ckeys.vaultProps(vaultProps))) { this.rows.set(Ckeys.vaultProps(vaultProps), vaultProps) }
    return Promise.resolve(this.rows.get(Ckeys.vaultProps(vaultProps)))
  }

  protected doUpdateVaultProps(vaultProps: VaultProps, expected: VaultPropsExpectation) {
    const standing = this.standingVaultProps(vaultProps)
    if (standing?.vault_id !== expected.vault_id || standing.unlock_epoch !== expected.unlock_epoch) { return Promise.resolve(false) }
    this.rows.set(Ckeys.vaultProps(vaultProps), vaultProps)
    return Promise.resolve(true)
  }

  protected doReadBox(scope: VaultScope, boxlabel: string) { return Promise.resolve(this.rows.get(Ckeys.box(scope, boxlabel)) ?? null) }

  protected doListBoxes(scope: VaultScope): Promise<StoredLockbox[]> {
    const isBox = Ckeys.isBoxIn(scope)
    const listed = [...this.rows].filter(([ckey]) => isBox(ckey)).map(([ckey, row]) => ({ boxlabel: Ckeys.boxlabelOf(ckey), lockbox: row }))
    return Promise.resolve(listed.filter((stored): stored is StoredLockbox => stored.boxlabel !== null))
  }

  protected doUpdateBox(scope: VaultScope, lockbox: Lockbox, expected: LockboxExpectation) {
    const standingBox = this.rows.get(Ckeys.box(scope, lockbox.boxlabel)) as Lockbox | undefined
    const standingVaultProps = this.standingVaultProps(scope)
    const meets = standingVaultProps?.vault_id === expected.vault_id && standingVaultProps.vault_key_epoch === expected.vault_key_epoch
      && (standingBox?.revision_tok ?? null) === expected.revision_tok
    if (! meets) {
      return Promise.resolve(null)
    }
    if (standingBox === undefined && this.boxCount(scope) >= this.maxLockboxes) {
      return Promise.reject(new VaultError('vault_full', 'This vault is full: retire a lockbox to make room, then try again.'))
    }
    this.rows.set(Ckeys.box(scope, lockbox.boxlabel), lockbox)
    return Promise.resolve(this.rows.get(Ckeys.box(scope, lockbox.boxlabel)))
  }

  /** How many lockboxes `scope` holds: counted through the ckeys, never copying the rows. */
  private boxCount(scope: VaultScope): number {
    const isBox = Ckeys.isBoxIn(scope)
    let held = 0
    for (const ckey of this.rows.keys()) {
      if (isBox(ckey)) { held += 1 }
    }
    return held
  }

  protected doRetireBox(scope: VaultScope, boxlabel: string, expected: LockboxRetireExpectation): Promise<unknown> {
    if (this.standingVaultProps(scope)?.vault_id !== expected.vault_id) { return Promise.resolve(null) }
    const retirement = Expectations.retirementOf(this.rows.get(Ckeys.box(scope, boxlabel)), expected)
    this.rows.delete(Ckeys.box(scope, boxlabel))
    return Promise.resolve(retirement)
  }

  protected doRetireVault(scope: VaultScope, expected: RetireExpectation) {
    if (this.standingVaultProps(scope)?.vault_id !== expected.vault_id) { return Promise.resolve(false) }
    const doomed = [...this.rows].map(([ckey]) => ckey).filter(Ckeys.isBoxIn(scope))
    for (const ckey of [...doomed, Ckeys.vaultProps(scope)]) { this.rows.delete(ckey) }
    return Promise.resolve(true)
  }
}

/**
 * A MapVaultDB in trouble: reading the vault props and subscribing fail as `failure` does; updating a
 * box rejects.
 */
class TroubledVaultDB extends MapVaultDB {
  private readonly failure: () => never

  constructor(failure: () => never) {
    super()
    this.failure = failure
  }

  protected override doReadVaultProps(): Promise<unknown> { this.failure() }
  protected override doSubscribe(): () => void { this.failure() }
  protected override doUpdateBox(): Promise<unknown> { return Promise.reject(new Error('the backend dropped the connection')) }
}

const unheard = (): void => undefined

/**
 * A MapVaultDB with push: `ring()` calls every watch's onChange, as a backend's push would, and a
 * watch's unsubscribe is counted, and throws when `unsubscribeThrows` says. `trouble` is the
 * watch's trouble, for a test to fail it.
 */
class RingingVaultDB extends MapVaultDB {
  readonly watches = new Set<() => void>()
  unsubscribeCount = 0
  unsubscribeThrows: Error | null = null
  trouble: WatchTrouble | null = null

  constructor(vaultDBOpts: VaultDBOpts = {}) {
    super(Infinity, new Map(), vaultDBOpts)
  }

  ring() { for (const onChange of this.watches) { onChange() } }

  /** The logger it says things through, as it stands. */
  loggerNow() { return this.logger }

  /** Tries to put `logger` in place of it by assignment: true when that took. */
  trySwapLogger(logger: VaultLogger) { return Reflect.set(this, 'logger', logger) }

  protected override doSubscribe(_scope: VaultScope, onChange: () => void) {
    this.trouble = this.watchTrouble("This vault's watch failed: other devices' changes may not show until its next read.")
    this.watches.add(onChange)
    return () => {
      this.unsubscribeCount += 1
      this.watches.delete(onChange)
      if (this.unsubscribeThrows) { throw this.unsubscribeThrows }
    }
  }
}

// Each adapter's devices share one store or Map, synchronous and in this process, so they make no
// round trips for a turnstile to hold: the races interleave them at every await.
TH.describeVaultDB('localVaultDB', (vaultDBOpts) => localVaultDB({ ...vaultDBOpts, store: memoryStore() }), {
  pushes:      true,
  makeDevices: () => {
    const store = memoryStore()
    return () => localVaultDB({ store })
  },
})
TH.describeVaultDB('the smallest honest adapter', (vaultDBOpts) => new MapVaultDB(Infinity, new Map(), vaultDBOpts), {
  makeCappedVaultDB: (maxLockboxes) => new MapVaultDB(maxLockboxes),
  makeDevices:       () => {
    const rows = new Map<string, unknown>()
    return ({ maxLockboxes }) => new MapVaultDB(maxLockboxes, rows)
  },
})

// The ckeys u1's main vault is filed under, spelled out rather than computed: they are stored.
const u1VaultPropsCkey = 'vault^acme^u1^main'
const u1BoxCkey = (boxlabel: string) => `box^acme^u1^main^${boxlabel}`

/** A MapVaultDB that retires each lockbox as it should, then answers `answer` in place of what it found. */
class MisreportingVaultDB extends MapVaultDB {
  private readonly answer: unknown

  constructor(answer: unknown) {
    super()
    this.answer = answer
  }

  protected override async doRetireBox(scope: VaultScope, boxlabel: string, expected: LockboxRetireExpectation): Promise<unknown> {
    const retirement = await super.doRetireBox(scope, boxlabel, expected)
    return retirement === null ? null : this.answer
  }
}

const MisreportedCases = [
  [true,                          'the true an older adapter answered with'],
  [false,                         'the false an older adapter refused with'],
  [undefined,                     'nothing at all'],
  ['retired',                     'the outcome bare, not in its record'],
  [{ outcome: 'gone' },           'an outcome this package does not know'],
  [{},                            'a record naming no outcome'],
] as const

describe("the abstract VaultDB, on the way back from a lockbox retirement", () => {
  it("resolves what its adapter says it removed: the revision named, another, or none", async () => {
    const vaultDB = new MapVaultDB()
    await vaultDB.fetchOrCreateVaultProps(TH.vaultPropsOf('u1'))
    await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), TH.noBoxYet)
    await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('openai', 'two'), TH.noBoxYet)
    expect(await vaultDB.retireBox(TH.scopeOf('u1'), 'anthropic', TH.retiring('rev-one'))).to.deep.equal({ outcome: 'retired' })
    expect(await vaultDB.retireBox(TH.scopeOf('u1'), 'openai', TH.retiring('rev-one'))).to.deep.equal({ outcome: 'retired_other' })
    expect(await vaultDB.retireBox(TH.scopeOf('u1'), 'openai', TH.retiring('rev-two'))).to.deep.equal({ outcome: 'absent' })
  })

  it("resolves the outcome, as its example shows", async () => {
    const vaultDB = new MapVaultDB()
    const vaultProps = TH.vaultPropsOf('u1')
    await vaultDB.fetchOrCreateVaultProps(vaultProps)
    await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), TH.noBoxYet)
    const [listed] = await vaultDB.listBoxes(TH.scopeOf('u1'))
    const { outcome } = await vaultDB.retireBox(TH.scopeOf('u1'), 'anthropic', { vault_id: vaultProps.vault_id, revision_tok: listed?.revision_tok ?? null })
    expect(outcome).to.eq('retired')
  })

  it("refuses as stale, resolving nothing and removing nothing, a retirement whose adapter answers null", async () => {
    const vaultDB = new MapVaultDB()
    await vaultDB.fetchOrCreateVaultProps(TH.vaultPropsOf('u1'))
    await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), TH.noBoxYet)
    await TH.expectRefusal(vaultDB.retireBox(TH.scopeOf('u1'), 'anthropic', { vault_id: 'vault-id-gone', revision_tok: 'rev-one' }), 'stale_write')
    expect(vaultDB.rows.get(u1BoxCkey('anthropic'))).to.deep.equal(TH.boxOf('anthropic', 'one'))
  })

  it("keeps only the outcome of an answer carrying more, as a GraphQL client's __typename", async () => {
    const vaultDB = new MisreportingVaultDB({ outcome: 'retired', __typename: 'SafebyokLockboxRetirement' })
    await vaultDB.fetchOrCreateVaultProps(TH.vaultPropsOf('u1'))
    expect(await vaultDB.retireBox(TH.scopeOf('u1'), 'anthropic', TH.retiring(null))).to.deep.equal({ outcome: 'retired' })
  })

  for (const [answer, blurb] of MisreportedCases) {
    it(`refuses as corrupt_record a landed retirement whose adapter answers ${blurb}, saying it may have landed`, async () => {
      const vaultDB = new MisreportingVaultDB(answer)
      await vaultDB.fetchOrCreateVaultProps(TH.vaultPropsOf('u1'))
      await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), TH.noBoxYet)
      const refusal = await TH.expectRefusal(vaultDB.retireBox(TH.scopeOf('u1'), 'anthropic', TH.retiring('rev-one')), 'corrupt_record')
      expect(refusal.message).to.match(/retirement landed/)
      expect(refusal.message).to.match(/cannot read back/)
      expect((refusal.cause as VaultError).kind).to.eq('corrupt_record')
      expect(TH.thrownText(refusal)).to.not.include('anthropic')
      // What the adapter removed stays removed: the refusal is about its answer, not its retirement.
      expect(vaultDB.rows.has(u1BoxCkey('anthropic'))).to.be.false
    })
  }
})

describe("localVaultDB", () => {
  it("holds a mebibyte in one record, and sets no limit on a vault, in bytes or in lockboxes, or on a name", () => {
    const vaultDB = localVaultDB({ store: memoryStore() })
    expect(vaultDB.maxRecordBytes).to.eq(1_048_576)
    expect(vaultDB.maxVaultBytes).to.eq(Infinity)
    expect(vaultDB.maxLockboxes).to.eq(Infinity)
    expect(vaultDB.maxNameBytes).to.eq(Infinity)
  })

  it("reads rows filed under the ckeys of earlier versions as absent, and leaves them be", async () => {
    const store = memoryStore()
    const earlier = ['vault:acme:u1:main', 'box:acme:u1:main:anthropic', '["vault","acme","u1","main"]', '["box","acme","u1","main","anthropic"]']
    for (const ckey of earlier) {
      store.write(ckey, JSON.stringify(ckey.includes('box') ? TH.boxOf('anthropic', 'one') : TH.vaultPropsOf('u1')))
    }
    const vaultDB = localVaultDB({ store })
    expect(await vaultDB.readVaultProps(TH.scopeOf('u1'))).to.be.null
    expect(await vaultDB.readBox(TH.scopeOf('u1'), 'anthropic')).to.be.null
    expect(await vaultDB.listBoxes(TH.scopeOf('u1'))).to.have.lengthOf(0)
    expect(store.ckeys()).to.have.members(earlier)
  })

  it("reads lockboxes as written today, with a sidecar and with an empty one, and writes them back the same", async () => {
    // A stored vault is a contract: these rows are byte for byte what storeBox() writes today.
    const store = memoryStore()
    const emptied = TH.boxOf('openai', 'two', { sidecar_json: '{}' })
    const sidecarRow = JSON.stringify(TH.boxOf('anthropic', 'one'))
    const emptiedRow = JSON.stringify(emptied)
    store.write(u1VaultPropsCkey, JSON.stringify(TH.vaultPropsOf('u1')))
    store.write(u1BoxCkey('anthropic'), sidecarRow)
    store.write(u1BoxCkey('openai'), emptiedRow)
    const vaultDB = localVaultDB({ store })
    const summaries = await vaultDB.listBoxes(TH.scopeOf('u1'))
    expect(summaries.map((box) => TH.summaryOf(box)?.sidecar)).to.deep.equal([{ note: 'a test box' }, {}])
    const prev = await vaultDB.readBox(TH.scopeOf('u1'), 'openai')
    expect(prev).to.deep.equal(emptied)
    await vaultDB.updateBox(TH.scopeOf('u1'), emptied, { vault_id: 'vault-id-u1', revision_tok: 'rev-two', vault_key_epoch: 1 })
    expect(store.read(u1BoxCkey('openai'))).to.eq(emptiedRow)
  })

  it("lists a lockbox written before the sidecar, with a note, as damaged: no earlier record is read", async () => {
    const store = memoryStore()
    const { sidecar_json: _sidecarJson, whisper_codec: _codec, whisper_schema_version: _version, ...rest } = TH.boxOf('anthropic', 'one')
    store.write(u1VaultPropsCkey, JSON.stringify(TH.vaultPropsOf('u1')))
    store.write(u1BoxCkey('anthropic'), JSON.stringify({ ...rest, format: 'safebyok-lockbox-v2', note: 'a test box' }))
    const vaultDB = localVaultDB({ store })
    expect(await vaultDB.listBoxes(TH.scopeOf('u1'))).to.deep.equal([{ boxlabel: 'anthropic', damaged: true, revision_tok: 'rev-one' }])
  })

  it("lists a row that is not JSON as damaged, under the boxlabel it is stored under, beside the sound ones", async () => {
    const store = memoryStore()
    const scope = TH.scopeOf('u1')
    store.write(Ckeys.vaultProps(scope), JSON.stringify(TH.vaultPropsOf('u1')))
    store.write(Ckeys.box(scope, 'openai'), JSON.stringify(TH.boxOf('openai', 'two')))
    store.write(Ckeys.box(scope, 'anthropic'), '{"not": json')
    const listed = await localVaultDB({ store }).listBoxes(scope)
    expect(listed[0]).to.deep.equal({ boxlabel: 'anthropic', damaged: true, revision_tok: null })
    expect(listed[1]).to.include({ boxlabel: 'openai', revision_tok: 'rev-two', damaged: false })
    // Listed, never repaired: the row is still there for forensics.
    expect(store.read(Ckeys.box(scope, 'anthropic'))).to.eq('{"not": json')
  })

  it("retires a damaged row, JSON or not, holding no revision, as the one a retirement naming none means", async () => {
    const store = memoryStore()
    const scope = TH.scopeOf('u1')
    store.write(Ckeys.vaultProps(scope), JSON.stringify(TH.vaultPropsOf('u1')))
    store.write(Ckeys.box(scope, 'anthropic'), '{"not": json')
    store.write(Ckeys.box(scope, 'openai'), JSON.stringify({ boxlabel: 'openai', revision_tok: '' }))
    const vaultDB = localVaultDB({ store })
    expect(await vaultDB.retireBox(scope, 'anthropic', TH.retiring(null))).to.deep.equal({ outcome: 'retired' })
    expect(await vaultDB.retireBox(scope, 'openai', TH.retiring(null))).to.deep.equal({ outcome: 'retired' })
    expect(await vaultDB.listBoxes(scope)).to.have.lengthOf(0)
  })

  it("retires a damaged row that holds a revision as another, for a retirement naming none", async () => {
    const store = memoryStore()
    const scope = TH.scopeOf('u1')
    store.write(Ckeys.vaultProps(scope), JSON.stringify(TH.vaultPropsOf('u1')))
    store.write(Ckeys.box(scope, 'anthropic'), JSON.stringify({ ...TH.boxOf('anthropic', 'one'), sidecar_json: 'not json' }))
    const vaultDB = localVaultDB({ store })
    expect(await vaultDB.listBoxes(scope)).to.deep.equal([{ boxlabel: 'anthropic', damaged: true, revision_tok: 'rev-one' }])
    expect(await vaultDB.retireBox(scope, 'anthropic', TH.retiring(null))).to.deep.equal({ outcome: 'retired_other' })
    expect(store.read(Ckeys.box(scope, 'anthropic'))).to.be.null
  })

  it("stores each record as its JSON, under its kind and scope joined on ^", async () => {
    const store = memoryStore()
    const vaultDB = localVaultDB({ store })
    await vaultDB.fetchOrCreateVaultProps(TH.vaultPropsOf('u1'))
    await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), TH.noBoxYet)
    expect(store.read(u1VaultPropsCkey)).to.eq(JSON.stringify(TH.vaultPropsOf('u1')))
    expect(store.read(u1BoxCkey('anthropic'))).to.eq(JSON.stringify(TH.boxOf('anthropic', 'one')))
    expect(store.ckeys()).to.have.members([u1VaultPropsCkey, u1BoxCkey('anthropic')])
  })

  it("refuses a mangled row with kind 'corrupt_record', quoting none of it", async () => {
    const store = memoryStore()
    const vaultDB = localVaultDB({ store })
    store.write(u1VaultPropsCkey, '{"format":"safebyok-vault-v3","shhh":"SUPERSECRET"}')
    const refusal = await TH.expectRefusal(vaultDB.readVaultProps(TH.scopeOf('u1')), 'corrupt_record')
    expect(refusal).to.be.instanceOf(VaultError)
    expect(refusal.message).to.not.include('SUPERSECRET')
  })

  it("refuses a row that is not JSON at all, quoting none of it", async () => {
    const store = memoryStore()
    const vaultDB = localVaultDB({ store })
    store.write(u1BoxCkey('anthropic'), 'SUPERSECRET{')
    await expect(vaultDB.readBox(TH.scopeOf('u1'), 'anthropic')).rejects.toThrow(/did not read back as JSON/)
  })

  it("refuses a record that names a scope or label other than the one asked for", async () => {
    const store = memoryStore()
    const vaultDB = localVaultDB({ store })
    // u2's vault props smuggled into u1's slot, and a lockbox row moved under another label.
    store.write(u1VaultPropsCkey, JSON.stringify(TH.vaultPropsOf('u2')))
    await expect(vaultDB.readVaultProps(TH.scopeOf('u1'))).rejects.toThrow(/different app, user, or vault/)
    store.write(u1BoxCkey('other_box'), JSON.stringify(TH.boxOf('anthropic', 'one')))
    await expect(vaultDB.readBox(TH.scopeOf('u1'), 'other_box')).rejects.toThrow(/different boxlabel/)
  })
})

/** Records an adapter may hand up from its listing, under the boxlabel each is stored under, and how each lists. */
const ListedRecordCases = [
  // sound:
  ["anthropic",  TH.boxOf('anthropic', 'one'),                               [["anthropic", false]],  'a sound lockbox as its summary'],
  // damaged, listed so they can be retired:
  ["anthropic",  TH.boxOf('other_box', 'one'),                               [["anthropic", true]],   'a record naming another boxlabel as damaged, under the one it is stored under'],
  ["anthropic",  { ...TH.boxOf('anthropic', 'one'), written_at: 'later' },   [["anthropic", true]],   'a record with a malformed time as damaged'],
  ["anthropic",  { ...TH.boxOf('anthropic', 'one'), sidecar_json: '{"a":' }, [["anthropic", true]], 'a record whose sidecar is not JSON as damaged'],
  ["anthropic",  TH.omitting(TH.boxOf('anthropic', 'one'), 'sidecar_json'),  [["anthropic", true]],   'a record with no sidecar as damaged'],
  ["anthropic",  null,                                                       [["anthropic", true]],   'a null record as damaged'],
  ["anthropic",  'not a lockbox',                                            [["anthropic", true]],   'a record that is not an object as damaged'],
  // stored under a name a vault's validators would refuse at its entry, or with a sidecar no host meant: stored under other checks, and sound
  ["Anthropic",  TH.boxOf('Anthropic', 'one'),                               [["Anthropic", false]],  'a record stored under a boxlabel the default check refuses as sound: a check is an alarm at entry, not a promise about storage'],
  ["anthropic",  { ...TH.boxOf('anthropic', 'one'), sidecar_json: String.raw`"beep\u0007"` }, [["anthropic", false]], 'a record whose sidecar holds a control character as sound: the sidecar is never interpreted'],
  // stored under a name below the floor, which no verb could reach: not listed at all
  ["tab\there",  TH.boxOf('tab\there', 'one'),                               [],                      'nothing for a record stored under a boxlabel below the floor, which no verb could name'],
] as const

describe("the abstract VaultDB, around an adapter's half", () => {
  it("validates what the adapter returns: a wrong-shaped record is refused, not repaired", async () => {
    const vaultDB = new MapVaultDB()
    vaultDB.rows.set(Ckeys.vaultProps(TH.scopeOf('u1')), { format: 'safebyok-vault-v3' })
    const refusal = await TH.expectRefusal(vaultDB.readVaultProps(TH.scopeOf('u1')), 'corrupt_record')
    expect(refusal).to.be.instanceOf(VaultError)
    // Refused, never repaired or deleted: the record is still there for forensics.
    expect(vaultDB.rows.size).to.eq(1)
  })

  it("lists a lockbox's sidecar as the JSON value its record holds, and nothing of its codec", async () => {
    const vaultDB = new MapVaultDB()
    vaultDB.rows.set(Ckeys.box(TH.scopeOf('u1'), 'anthropic'), TH.boxOf('anthropic', 'one', { sidecar_json: '{"note":"work","tags":["a",null]}' }))
    const [listed] = await vaultDB.listBoxes(TH.scopeOf('u1'))
    const summary = TH.summaryOf(listed)
    expect(summary?.sidecar).to.deep.equal({ note: 'work', tags: ['a', null] })
    expect(summary).to.not.have.property('whisper_codec')
    expect(summary).to.not.have.property('sidecar_json')
  })

  for (const [boxlabel, record, expected, blurb] of ListedRecordCases) {
    it(`lists ${blurb}`, async () => {
      const vaultDB = new MapVaultDB()
      vaultDB.rows.set(Ckeys.box(TH.scopeOf('u1'), boxlabel), record)
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
    vaultDB.rows.set(Ckeys.box(TH.scopeOf('u1'), 'anthropic'), projected)
    const summaries = await vaultDB.listBoxes(TH.scopeOf('u1'))
    expect(TH.summaryOf(summaries[0])?.revision_tok).to.eq('rev-one')
    vaultDB.rows.set(Ckeys.box(TH.scopeOf('u1'), 'anthropic'), omit(projected, ['format']))
    expect(await vaultDB.listBoxes(TH.scopeOf('u1'))).to.deep.equal([{ boxlabel: 'anthropic', damaged: true, revision_tok: 'rev-one' }])
  })

  const DamagedRevisionCases = [
    [{ ...TH.boxOf('anthropic', 'one'), written_at: 'later' },   "rev-one",  'keeps the revision a damaged record holds as text'],
    [{ ...TH.boxOf('anthropic', 'one'), revision_tok: 7 },       null,       'keeps none for a revision that is not text'],
    [{ ...TH.boxOf('anthropic', 'one'), revision_tok: '' },      null,       'keeps none for an empty revision'],
    ['not a lockbox',                                            null,       'keeps none for a record that is no object'],
  ] as const

  for (const [stored, expected, blurb] of DamagedRevisionCases) {
    it(`lists a damaged lockbox with its revision_tok: ${blurb}`, async () => {
      const vaultDB = new MapVaultDB()
      vaultDB.rows.set(Ckeys.box(TH.scopeOf('u1'), 'anthropic'), stored)
      expect(await vaultDB.listBoxes(TH.scopeOf('u1'))).to.deep.equal([{ boxlabel: 'anthropic', damaged: true, revision_tok: expected }])
    })
  }

  it("turns an adapter's own failure into kind 'storage_unavailable', keeping it as the cause", async () => {
    const outage = new Error('the backend is down')
    const vaultDB = new TroubledVaultDB(() => { throw outage })
    const refusal = await TH.expectRefusal(vaultDB.readVaultProps(TH.scopeOf('u1')), 'storage_unavailable')
    expect(refusal).to.be.instanceOf(VaultError)
    expect(refusal.cause).to.eq(outage)
    await expect(vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), TH.noBoxYet))
      .rejects.toThrow(/could not be reached/)
  })

  it("passes an adapter's own VaultError through untouched: not_permitted stays not_permitted", async () => {
    const forbidden = new VaultError('not_permitted', 'This backend does not let the signed-in user reach that vault.')
    const vaultDB = new TroubledVaultDB(() => { throw forbidden })
    const refusal = await TH.expectRefusal(vaultDB.readVaultProps(TH.scopeOf('u1')), 'not_permitted')
    expect(refusal).to.eq(forbidden)
  })

  it("subscribe defaults to silence: a usable unsubscribe, and no notifications", async () => {
    const vaultDB = new MapVaultDB()
    let heardCount = 0
    const unsubscribe = vaultDB.subscribe(TH.scopeOf('u1'), () => { heardCount += 1 })
    await vaultDB.fetchOrCreateVaultProps(TH.vaultPropsOf('u1'))
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
  ['bad_record', (vaultDB: VaultDB) => vaultDB.fetchOrCreateVaultProps({ ...TH.vaultPropsOf('u1'), unlock_epoch: 1.5 }),                              'vault props with a fractional unlock_epoch'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.fetchOrCreateVaultProps({ ...TH.vaultPropsOf('u1'), wayins: [omit(TH.wayinOf('passphrase'), ['vault_key_wayin_wrapped'])] } as VaultProps), 'vault props whose wayin is missing its wrapped vaultKey'],
  ['bad_label',  (vaultDB: VaultDB) => vaultDB.fetchOrCreateVaultProps({ ...TH.vaultPropsOf('u1'), applabel: 'Ac\u{7}me' }),                         'vault props whose applabel holds a control character'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one', { sidecar_json: 'not json' }), TH.noBoxYet), 'a lockbox whose sidecar no read would accept'],
  ['bad_label',  (vaultDB: VaultDB) => vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('key\u{D83D}', 'one'), TH.noBoxYet),                  'a lockbox whose boxlabel is half of an emoji, whatever the checks'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one', { written_at: 1_792_022_400 }), TH.noBoxYet), 'a lockbox time in epoch seconds'],
  ['bad_label',  (vaultDB: VaultDB) => vaultDB.updateBox(TH.scopeOf('u1'), undefined as unknown as Lockbox, TH.noBoxYet),               'no lockbox at all'],
  // the expectations:
  ['bad_record', (vaultDB: VaultDB) => vaultDB.updateVaultProps(TH.vaultPropsOf('u1'), { vault_id: 'vault-id-u1', unlock_epoch: 0 }),          'an expectation of the vault props at epoch zero'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.updateVaultProps(TH.vaultPropsOf('u1'), undefined as unknown as VaultPropsExpectation), 'no expectation of the vault props at all'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), { vault_id: 'vault-id-u1' } as LockboxExpectation), 'a lockbox expectation missing its revision_tok'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), { vault_id: 'vault-id-u1', revision_tok: null } as LockboxExpectation), 'a lockbox expectation naming no vaultKey epoch'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.retireBox(TH.scopeOf('u1'), 'anthropic', { revision_tok: null } as LockboxRetireExpectation), 'a retire expectation naming no vault'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.retireBox(TH.scopeOf('u1'), 'anthropic', TH.thisVault as LockboxRetireExpectation),          'a lockbox retire expectation missing its revision_tok'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.retireBox(TH.scopeOf('u1'), 'anthropic', TH.retiring('')),                                  'a lockbox retire expectation naming an empty revision_tok'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.retireVault(TH.scopeOf('u1'), {} as RetireExpectation),                                     'a vault retire expectation naming no vault'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.retireVault(TH.scopeOf('u1'), { vault_id: '' }),                                         'a retire expectation naming an empty vault_id'],
  // the two together:
  ['bad_record', (vaultDB: VaultDB) => vaultDB.updateVaultProps(TH.vaultPropsOf('u1', { vault_id: 'vault-id-new', unlock_epoch: 2 }), { vault_id: 'vault-id-u1', unlock_epoch: 1 }), 'an update of the vault props that would change the vault_id'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one', { vault_key_epoch: 2 }), TH.noBoxYet), 'a lockbox sealed under another vaultKey than the expected one'],
] as const

/** A vault in `u1`'s slot with a lockbox, its vault props spoiled by `spoil`, and a sound neighbour beside it. */
const withDamagedVaultProps = (spoil: (vaultProps: VaultProps) => unknown = (vaultProps) => ({ ...vaultProps, unlock_epoch: 'one' })) => {
  const vaultDB = new MapVaultDB()
  vaultDB.rows.set(Ckeys.vaultProps(TH.scopeOf('u1')), spoil(TH.vaultPropsOf('u1')))
  vaultDB.rows.set(Ckeys.box(TH.scopeOf('u1'), 'anthropic'), TH.boxOf('anthropic', 'one'))
  vaultDB.rows.set(Ckeys.vaultProps(TH.scopeOf('u2')), TH.vaultPropsOf('u2'))
  vaultDB.rows.set(Ckeys.box(TH.scopeOf('u2'), 'anthropic'), TH.boxOf('anthropic', 'one'))
  return vaultDB
}

describe("the abstract VaultDB, retiring a vault whose vault props are damaged", () => {
  it("retires the vault props and every lockbox of a vault whose props fail their checks, and nothing of any other", async () => {
    const vaultDB = withDamagedVaultProps()
    await TH.expectRefusal(vaultDB.readVaultProps(TH.scopeOf('u1')), 'corrupt_record')
    await vaultDB.retireDamagedVault(TH.scopeOf('u1'))
    expect(vaultDB.rows.size).to.eq(2)
    const theirVaultProps = Ckeys.vaultProps(TH.scopeOf('u2'))
    const theirBox = Ckeys.box(TH.scopeOf('u2'), 'anthropic')
    expect(vaultDB.rows.has(theirVaultProps)).to.eq(true)
    expect(vaultDB.rows.has(theirBox)).to.eq(true)
    expect(await vaultDB.readVaultProps(TH.scopeOf('u1'))).to.be.null
  })

  it("counts vault props naming another vault than the one asked for as damaged", async () => {
    const vaultDB = new MapVaultDB()
    vaultDB.rows.set(Ckeys.vaultProps(TH.scopeOf('u1')), TH.vaultPropsOf('u2'))
    await vaultDB.retireDamagedVault(TH.scopeOf('u1'))
    expect(vaultDB.rows.size).to.eq(0)
  })

  it("refuses vault props that stand sound as bad_option, retiring nothing", async () => {
    const vaultDB = withDamagedVaultProps((vaultProps) => vaultProps)
    const before = new Map(vaultDB.rows)
    const refusal = await TH.expectRefusal(vaultDB.retireDamagedVault(TH.scopeOf('u1')), 'bad_option')
    expect(refusal.message).to.include('retire()')
    expect(vaultDB.rows).to.deep.equal(before)
  })

  it("is quiet where the scope holds no vault props", async () => {
    const vaultDB = new MapVaultDB()
    await vaultDB.retireDamagedVault(TH.scopeOf('u1'))
    expect(vaultDB.rows.size).to.eq(0)
  })

  it("refuses a record too damaged to name its vault as damaged_vault, retiring nothing", async () => {
    for (const record of [{ format: 'safebyok-vault-v1' }, { vault_id: '' }, { vault_id: 7 }, {}, 'not even a bag']) {
      const vaultDB = withDamagedVaultProps(() => record)
      const refusal = await TH.expectRefusal(vaultDB.retireDamagedVault(TH.scopeOf('u1')), 'damaged_vault')
      expect(refusal.message).to.include('nothing was removed')
      expect(vaultDB.rows.size).to.eq(4)
    }
  })

  const Wayin = TH.vaultPropsOf('u1').wayins[0]
  const NewerRecords = [
    [{ format: 'safebyok-vault-v4' },                                                      'a format this version does not know, whatever else it holds'],
    [(vaultProps: VaultProps) => ({ ...vaultProps, format: 'safebyok-vault-v4' }),                'vault props that are otherwise sound but for their format'],
    [(vaultProps: VaultProps) => ({ ...vaultProps, format: 2 }),                           'a format of another type'],
    [(vaultProps: VaultProps) => ({ ...vaultProps, wayins: [...vaultProps.wayins, { wayinkind: 'smartcard', wayin_id: 'x' }] }), 'a wayinkind this version does not know'],
    [(vaultProps: VaultProps) => ({ ...vaultProps, wayins: Array.from({ length: 9 }, () => Wayin) }), 'more wayins than this version holds'],
  ] as const

  for (const [record, blurb] of NewerRecords) {
    it(`refuses ${blurb} as possibly newer than this version (newer_format), retiring nothing`, async () => {
      const vaultDB = withDamagedVaultProps((vaultProps) => (typeof record === 'function' ? record(vaultProps) : { ...vaultProps, ...record }))
      const refusal = await TH.expectRefusal(vaultDB.retireDamagedVault(TH.scopeOf('u1')), 'newer_format')
      expect(refusal.message).to.include('newer version')
      expect(refusal.message).to.include('left as it is')
      await TH.expectRefusal(vaultDB.readVaultProps(TH.scopeOf('u1')), 'newer_format')
      expect(vaultDB.rows.size).to.eq(4)
    })
  }

  it("still retires vault props that fail for anything it can only take for damage: a known format and methods, in number", async () => {
    const vaultDB = withDamagedVaultProps((vaultProps) => ({ ...vaultProps, wayins: [{ ...Wayin, salt_b64: 7 }], registered_at: 'later' }))
    await vaultDB.retireDamagedVault(TH.scopeOf('u1'))
    expect(vaultDB.rows.size).to.eq(2)
  })

  it("retires vault props in a format an earlier version wrote, which is older, never newer", async () => {
    const vaultDB = withDamagedVaultProps(({ vault_key_epoch: _epoch, ...vaultProps }) => ({ ...vaultProps, format: 'safebyok-vault-v1' }))
    await vaultDB.retireDamagedVault(TH.scopeOf('u1'))
    expect(vaultDB.rows.size).to.eq(2)
  })

  it("aims the retirement at the vault_id it read, so a vault made anew meanwhile survives as stale_write", async () => {
    class ReplacedVaultDB extends MapVaultDB {
      protected override doRetireVault(): Promise<boolean> { return Promise.resolve(false) }
    }
    const vaultDB = new ReplacedVaultDB()
    vaultDB.rows.set(Ckeys.vaultProps(TH.scopeOf('u1')), { ...TH.vaultPropsOf('u1'), unlock_epoch: 'one' })
    await TH.expectRefusal(vaultDB.retireDamagedVault(TH.scopeOf('u1')), 'stale_write')
  })

  it("hands retireVault the vault_id the damaged record carries", async () => {
    const asked: RetireExpectation[] = []
    class SpyingVaultDB extends MapVaultDB {
      protected override doRetireVault(scope: VaultScope, expected: RetireExpectation): Promise<boolean> {
        asked.push(expected)
        return super.doRetireVault(scope, expected)
      }
    }
    const vaultDB = new SpyingVaultDB()
    vaultDB.rows.set(Ckeys.vaultProps(TH.scopeOf('u1')), { ...TH.vaultPropsOf('u1'), unlock_epoch: 'one' })
    await vaultDB.retireDamagedVault(TH.scopeOf('u1'))
    expect(asked).to.deep.equal([{ vault_id: TH.vaultPropsOf('u1').vault_id }])
  })

  it("refuses as damaged_vault, retiring nothing, an adapter that validates on the way up and so never hands the record over", async () => {
    class CheckedVaultDB extends MapVaultDB {
      protected override doReadVaultProps(): Promise<unknown> {
        return Promise.reject(new VaultError('corrupt_record', 'did not read back'))
      }
    }
    const vaultDB = new CheckedVaultDB()
    vaultDB.rows.set(Ckeys.vaultProps(TH.scopeOf('u1')), { ...TH.vaultPropsOf('u1'), unlock_epoch: 'one' })
    const refusal = await TH.expectRefusal(vaultDB.retireDamagedVault(TH.scopeOf('u1')), 'damaged_vault')
    expect((refusal.cause as VaultError).kind).to.eq('corrupt_record')
    expect(vaultDB.rows.size).to.eq(1)
  })

  it("wraps what the adapter throws as storage_unavailable, and checks the scope first", async () => {
    class DownVaultDB extends MapVaultDB {
      protected override doReadVaultProps(): Promise<unknown> { return Promise.reject(new Error('connection reset')) }
    }
    await TH.expectRefusal(new DownVaultDB().retireDamagedVault(TH.scopeOf('u1')), 'storage_unavailable')
    await TH.expectRefusal(new MapVaultDB().retireDamagedVault({ ...TH.scopeOf('u1'), applabel: '' }), 'bad_label')
  })
})

describe("the abstract VaultDB, on the way in", () => {
  for (const [kind, write, blurb] of RefusedWrites) {
    it(`refuses ${blurb} with kind '${kind}', and storage sees nothing`, async () => {
      const vaultDB = new MapVaultDB()
      vaultDB.rows.set(Ckeys.vaultProps(TH.scopeOf('u1')), TH.vaultPropsOf('u1'))
      const before = [...vaultDB.rows]
      const refusal = await TH.expectRefusal(write(vaultDB), kind)
      expect(refusal).to.be.instanceOf(VaultError)
      expect([...vaultDB.rows]).to.deep.equal(before)
    })
  }

  it("never quotes a record it refuses", async () => {
    const vaultDB = new MapVaultDB()
    const sneaky = TH.boxOf('anthropic', 'one', { whisper_ciphered: TH.fakeCiphered('SUPERSECRET'), revision_tok: '' })
    const refusal = await TH.expectRefusal(vaultDB.updateBox(TH.scopeOf('u1'), sneaky, TH.noBoxYet), 'bad_record')
    expect(refusal.message).to.not.include('SUPERSECRET')
    expect(refusal.message).to.not.include('anthropic')
  })

  it("hands its adapter the record as this package writes it: a field it does not know stays behind", async () => {
    const vaultDB = new MapVaultDB()
    await vaultDB.fetchOrCreateVaultProps({ ...TH.vaultPropsOf('u1'), stray_field: 'x' } as VaultProps)
    expect(vaultDB.rows.get(u1VaultPropsCkey)).to.deep.equal(TH.vaultPropsOf('u1'))
  })

  it("lets a vault's own writes through untouched: a box with an empty sidecar, a box replaced, a retirement", async () => {
    const vaultDB = new MapVaultDB()
    await vaultDB.fetchOrCreateVaultProps(TH.vaultPropsOf('u1'))
    const emptied = TH.boxOf('anthropic', 'one', { sidecar_json: '{}' })
    await vaultDB.updateBox(TH.scopeOf('u1'), emptied, TH.noBoxYet)
    expect(vaultDB.rows.get(u1BoxCkey('anthropic'))).to.deep.equal(emptied)
    await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'two'), { vault_id: 'vault-id-u1', revision_tok: 'rev-one', vault_key_epoch: 1 })
    await vaultDB.retireBox(TH.scopeOf('u1'), 'anthropic', TH.retiring('rev-two'))
    expect(await vaultDB.listBoxes(TH.scopeOf('u1'))).to.have.lengthOf(0)
  })
})

/** A MapVaultDB that writes each lockbox as it should, then hands back `handedBack` in place of what it stored. */
class MisansweringVaultDB extends MapVaultDB {
  private readonly handedBack: unknown

  constructor(handedBack: unknown) {
    super()
    this.handedBack = handedBack
  }

  protected override async doUpdateBox(scope: VaultScope, lockbox: Lockbox, expected: LockboxExpectation): Promise<unknown> {
    const stored = await super.doUpdateBox(scope, lockbox, expected)
    return stored === null ? null : this.handedBack
  }
}

const MisansweredCases = [
  [true,                                                             'the true an older adapter answered with'],
  [undefined,                                                        'nothing at all'],
  [omit(TH.boxOf('anthropic', 'one'), ['whisper_ciphered']),         'a lockbox missing a ciphered field'],
  [{ ...TH.boxOf('anthropic', 'one'), written_at: '1792022400000' }, 'a lockbox whose time is text'],
  [TH.boxOf('openai', 'one'),                                        'a lockbox under another boxlabel than the one written'],
] as const

describe("the abstract VaultDB, on the way back from a lockbox write", () => {
  it("resolves the lockbox its adapter hands back, as storage now holds it", async () => {
    const vaultDB = new MapVaultDB()
    await vaultDB.fetchOrCreateVaultProps(TH.vaultPropsOf('u1'))
    expect(await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), TH.noBoxYet)).to.deep.equal(TH.boxOf('anthropic', 'one'))
  })

  it("refuses as stale, resolving nothing, a write whose adapter answers null", async () => {
    const vaultDB = new MapVaultDB()
    await vaultDB.fetchOrCreateVaultProps(TH.vaultPropsOf('u1'))
    await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), TH.noBoxYet)
    await TH.expectRefusal(vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'two'), TH.noBoxYet), 'stale_write')
    expect(vaultDB.rows.get(u1BoxCkey('anthropic'))).to.deep.equal(TH.boxOf('anthropic', 'one'))
  })

  for (const [handedBack, blurb] of MisansweredCases) {
    it(`refuses as corrupt_record a landed write whose adapter hands back ${blurb}, saying the write may have landed`, async () => {
      const vaultDB = new MisansweringVaultDB(handedBack)
      await vaultDB.fetchOrCreateVaultProps(TH.vaultPropsOf('u1'))
      const refusal = await TH.expectRefusal(vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), TH.noBoxYet), 'corrupt_record')
      expect(refusal.message).to.match(/landed/)
      expect(refusal.message).to.match(/cannot read back/)
      expect((refusal.cause as VaultError).kind).to.eq('corrupt_record')
      // What the adapter stored stands: the refusal is about its answer, not its write.
      expect(vaultDB.rows.get(u1BoxCkey('anthropic'))).to.deep.equal(TH.boxOf('anthropic', 'one'))
    })
  }

  it("never quotes the record it refuses on the way back", async () => {
    const vaultDB = new MisansweringVaultDB({ ...TH.boxOf('anthropic', 'one', { whisper_ciphered: TH.fakeCiphered('SUPERSECRET') }), revision_tok: '' })
    await vaultDB.fetchOrCreateVaultProps(TH.vaultPropsOf('u1'))
    const refusal = await TH.expectRefusal(vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), TH.noBoxYet), 'corrupt_record')
    expect(refusal.message).to.not.include('SUPERSECRET')
    expect(refusal.message).to.not.include('anthropic')
  })
})

describe("the abstract VaultDB, listing", () => {
  it("lists a box whose ciphered fields are damaged, leaving readBox() to refuse it: one damaged box never costs the vault", async () => {
    const vaultDB = new MapVaultDB()
    vaultDB.rows.set(Ckeys.vaultProps(TH.scopeOf('u1')), TH.vaultPropsOf('u1'))
    vaultDB.rows.set(Ckeys.box(TH.scopeOf('u1'), 'anthropic'), { ...TH.boxOf('anthropic', 'one'), whisper_ciphered: { cipher_iv_b64: '' } })
    vaultDB.rows.set(Ckeys.box(TH.scopeOf('u1'), 'openai'), TH.boxOf('openai', 'two'))
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
    await vaultDB.fetchOrCreateVaultProps({ ...TH.vaultPropsOf('u1'), ...scriptScope })
    await vaultDB.updateBox(scriptScope, TH.boxOf('مفتاح العمل', 'one'), TH.noBoxYet)
    const lockbox = await vaultDB.readBox(scriptScope, 'مفتاح العمل')
    expect(lockbox?.revision_tok).to.eq('rev-one')
    const summaries = await vaultDB.listBoxes(scriptScope)
    expect(summaries.map((summary) => summary.boxlabel)).to.deep.equal(['مفتاح العمل'])
    await vaultDB.retireBox(scriptScope, 'مفتاح العمل', TH.retiring('rev-one'))
    vaultDB.subscribe(scriptScope, unheard)()
    await vaultDB.retireVault(scriptScope, TH.thisVault)
    expect(await vaultDB.readVaultProps(scriptScope)).to.be.null
  })

  const BelowTheFloor = [
    ["",                                'an empty name'],
    ["tab\there",                       'a control character'],
    ["cafe\u{301}",                     'a letter decomposed, not in NFC'],
    ["key\u{D83D}",                     'half of an emoji'],
    ["a^b",                             'a ^, which key-value stores join names on'],
    ["n".repeat(NameFloorBytes + 1),    'more than a kibibyte'],
    ["\u{E9}".repeat((NameFloorBytes / 2) + 1), 'more than a kibibyte of UTF-8, in fewer characters'],
  ] as const

  for (const [candidate, blurb] of BelowTheFloor) {
    it(`refuses ${blurb} as bad_label, as a boxlabel and in a scope, before its adapter's half sees it`, async () => {
      const vaultDB = new MapVaultDB()
      await TH.expectRefusal(vaultDB.readVaultProps({ ...TH.scopeOf('u1'), vaultlabel: candidate }), 'bad_label')
      await TH.expectRefusal(vaultDB.readBox(TH.scopeOf('u1'), candidate), 'bad_label')
      await TH.expectRefusal(vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf(candidate, 'one'), TH.noBoxYet), 'bad_label')
      expect(vaultDB.rows.size).to.eq(0)
    })
  }

  it("refuses, as 'bad_record', a lockbox whose sidecar is not JSON, writing nothing", async () => {
    const vaultDB = new MapVaultDB()
    await vaultDB.fetchOrCreateVaultProps(TH.vaultPropsOf('u1'))
    const unparsable = TH.boxOf('anthropic', 'one', { sidecar_json: '{"note":' })
    await TH.expectRefusal(vaultDB.updateBox(TH.scopeOf('u1'), unparsable, TH.noBoxYet), 'bad_record')
    expect(await vaultDB.readBox(TH.scopeOf('u1'), 'anthropic')).to.be.null
  })

  it("refuses, as 'corrupt_record', a stored lockbox whose sidecar is not JSON, and lists it as damaged", async () => {
    const vaultDB = new MapVaultDB()
    await vaultDB.fetchOrCreateVaultProps(TH.vaultPropsOf('u1'))
    vaultDB.rows.set(Ckeys.box(TH.scopeOf('u1'), 'anthropic'), TH.boxOf('anthropic', 'one', { sidecar_json: '{"note":' }))
    await TH.expectRefusal(vaultDB.readBox(TH.scopeOf('u1'), 'anthropic'), 'corrupt_record')
    expect(await vaultDB.listBoxes(TH.scopeOf('u1'))).to.deep.equal([{ boxlabel: 'anthropic', damaged: true, revision_tok: 'rev-one' }])
  })

  it("lists lockboxes by code unit, never by a locale, so every device lists them in one order", async () => {
    const vaultDB = new MapVaultDB()
    await vaultDB.fetchOrCreateVaultProps(TH.vaultPropsOf('u1'))
    for (const boxlabel of ['b', 'a_b', 'B', 'a1', '\u{E9}', 'z']) {
      vaultDB.rows.set(Ckeys.box(TH.scopeOf('u1'), boxlabel), TH.boxOf(boxlabel, boxlabel))
    }
    const listed = await vaultDB.listBoxes(TH.scopeOf('u1'))
    expect(listed.map((box) => box.boxlabel)).to.deep.equal(['B', 'a1', 'a_b', 'b', 'z', '\u{E9}'])
  })
})

/** A MapVaultDB holding names of at most eight bytes. */
class NarrowNamesVaultDB extends MapVaultDB {
  override readonly maxNameBytes = 8
}

/** Names the narrow adapter refuses, each by one of its declared limits. */
const NarrowRefusals = [
  ["n".repeat(9),   '9 bytes',   'a name of nine bytes'],
  ["\u{E9}".repeat(5), '10 bytes', 'a name of five characters but ten bytes of UTF-8'],
] as const

describe("the abstract VaultDB, holding names to what its adapter declares", () => {
  for (const [candidate, said, blurb] of NarrowRefusals) {
    it(`refuses ${blurb} as bad_label, in every verb and every place a candidate goes, naming the rule and quoting nothing`, async () => {
      const vaultDB = new NarrowNamesVaultDB()
      vaultDB.rows.set(Ckeys.vaultProps(TH.scopeOf('u1')), TH.vaultPropsOf('u1'))
      const before = [...vaultDB.rows]
      const scopes = [{ ...TH.scopeOf('u1'), applabel: candidate }, { ...TH.scopeOf('u1'), user_id: candidate }, { ...TH.scopeOf('u1'), vaultlabel: candidate }]
      for (const scope of scopes) {
        const refusal = await TH.expectRefusal(vaultDB.readVaultProps(scope), 'bad_label')
        expect(refusal.message).to.include(said)
        expect(refusal.message).to.not.include(candidate)
        await TH.expectRefusal(vaultDB.fetchOrCreateVaultProps({ ...TH.vaultPropsOf('u1'), ...scope }), 'bad_label')
        await TH.expectRefusal(vaultDB.listBoxes(scope), 'bad_label')
        await TH.expectRefusal(vaultDB.retireVault(scope, TH.thisVault), 'bad_label')
        await TH.expectRefusal(vaultDB.retireDamagedVault(scope), 'bad_label')
        expect(() => vaultDB.subscribe(scope, unheard)).to.throw(VaultError).with.property('kind', 'bad_label')
      }
      const refusal = await TH.expectRefusal(vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf(candidate, 'one'), TH.noBoxYet), 'bad_label')
      expect(refusal.message).to.include('boxlabel')
      await TH.expectRefusal(vaultDB.readBox(TH.scopeOf('u1'), candidate), 'bad_label')
      await TH.expectRefusal(vaultDB.retireBox(TH.scopeOf('u1'), candidate, TH.retiring(null)), 'bad_label')
      expect([...vaultDB.rows]).to.deep.equal(before)
    })
  }

  it("takes a name of exactly as many bytes as it declares", async () => {
    const vaultDB = new NarrowNamesVaultDB()
    await vaultDB.fetchOrCreateVaultProps(TH.vaultPropsOf('u1'))
    await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('a:b|c.de', 'one'), TH.noBoxYet)
    const lockbox = await vaultDB.readBox(TH.scopeOf('u1'), 'a:b|c.de')
    expect(lockbox?.revision_tok).to.eq('rev-one')
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
    const lockbox = TH.boxOf('anthropic', 'one', { sidecar_json: TH.sidecarJsonOf({ note: 'n'.repeat(900) }) })
    const recordBytes = jsonBytes({ ...TH.scopeOf('u1'), ...lockbox })
    const fits = new SmallRecordVaultDB(recordBytes)
    await fits.fetchOrCreateVaultProps(TH.vaultPropsOf('u1'))
    await fits.updateBox(TH.scopeOf('u1'), lockbox, TH.noBoxYet)
    const tight = new SmallRecordVaultDB(recordBytes - 1)
    await tight.fetchOrCreateVaultProps(TH.vaultPropsOf('u1'))
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

/** A RingingVaultDB made with `vaultDBOpts`, with one watch on u1's vault whose listener throws. */
const failingListenerOn = (vaultDBOpts: VaultDBOpts = {}) => {
  const vaultDB = new RingingVaultDB(vaultDBOpts)
  vaultDB.subscribe(TH.scopeOf('u1'), () => { throw new Error('a listener that throws') })
  return vaultDB
}

describe("the abstract VaultDB, its logger", () => {
  afterEach(() => { vi.restoreAllMocks() })

  it("says what it has nobody to throw to through the logger it was made with", () => {
    const spy = TH.spyLogger()
    failingListenerOn({ logger: spy.logger }).ring()
    expect(spy.calls.map((call) => call.level)).to.deep.equal(['error'])
  })

  it("is made with the default logger when its subclass hands super() options with none", () => {
    for (const handed of [{}, { logger: undefined }, { logger: null }]) {
      const vaultDB = new MapVaultDB(Infinity, new Map(), {}, handed)
      expect(vaultDB.logger).to.eq(DefaultLogger)
    }
  })

  it("is made with the host's logger, guarded, from the options its subclass hands super(), as VaultDBOpts's second example shows", () => {
    const spy = TH.spyLogger()
    const vaultDB = new MapVaultDB(Infinity, new Map(), {}, { logger: spy.logger })
    expect(vaultDB.logger).to.eq(parseLogger(spy.logger))
  })

  it("keeps its logger off the VaultDB itself, so it is neither listed nor copied", () => {
    const vaultDB = failingListenerOn({ logger: TH.spyLogger().logger })
    expect(Object.getOwnPropertyDescriptor(vaultDB, 'logger')).to.be.undefined
    expect(Object.keys(vaultDB)).to.not.include('logger')
    expect(Object.keys(Object.assign({}, vaultDB))).to.not.include('logger')
    expect(JSON.stringify(vaultDB)).to.not.include('logger')
  })

  it("keeps the logger it was made with: one assigned in its place does not take", () => {
    const own = TH.spyLogger()
    const swapped = TH.spyLogger()
    const vaultDB = failingListenerOn({ logger: own.logger })
    expect(vaultDB.trySwapLogger(swapped.logger)).to.be.false
    vaultDB.ring()
    expect([own.calls.length, swapped.calls.length]).to.deep.equal([1, 0])
  })

  it("takes a null logger from its factory as none: the console", async () => {
    const consoleErrors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const vaultDB = localVaultDB({ store: memoryStore(), logger: null })
    vaultDB.subscribe(TH.scopeOf('u1'), () => { throw new Error('a listener that throws') })
    await vaultDB.fetchOrCreateVaultProps(TH.vaultPropsOf('u1'))
    expect(consoleErrors).toHaveBeenCalledOnce()
  })

  it("keeps one logger, rather than one built for each line it says", () => {
    const vaultDB = failingListenerOn()
    expect(vaultDB.loggerNow()).to.eq(vaultDB.loggerNow())
  })

  it("is the console, tagged, in the adapter whose factory was given no logger", async () => {
    const consoleErrors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const vaultDB = localVaultDB({ store: memoryStore() })
    vaultDB.subscribe(TH.scopeOf('u1'), () => { throw new Error('a listener that throws') })
    await vaultDB.fetchOrCreateVaultProps(TH.vaultPropsOf('u1'))
    expect(consoleErrors).toHaveBeenCalledOnce()
    expect(consoleErrors.mock.calls[0]?.[0]).to.match(/^safebyok: A listener passed to subscribe threw/)
  })

  it("breaks nothing when its logger throws", () => {
    const throwing = { log: () => { throw new Error('no') }, warn: () => { throw new Error('no') }, error: () => { throw new Error('no') } }
    expect(() => { failingListenerOn({ logger: throwing }).ring() }).to.not.throw()
  })

  const BadLoggers = [
    ["console.log",                 'a function, not a logger'],
    [{ log: () => undefined },      'a logger missing warn and error'],
  ] as const

  for (const [logger, blurb] of BadLoggers) {
    it(`refuses ${blurb} as a logger with kind 'bad_option', made with it`, () => {
      expect(() => new RingingVaultDB({ logger: logger as unknown as VaultDBOpts['logger'] })).to.throw(VaultError).with.property('kind', 'bad_option')
    })
  }
})

describe("the abstract VaultDB, calling a subscriber's listener", () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it("calls every other listener, and lets nothing escape, when one throws: the failure logged as an error, naming the call", () => {
    const spy = TH.spyLogger()
    const vaultDB = new RingingVaultDB({ logger: spy.logger })
    const thrown = new Error('a listener that throws')
    const heard: string[] = []
    vaultDB.subscribe(TH.scopeOf('u1'), () => { heard.push('one'); throw thrown })
    vaultDB.subscribe(TH.scopeOf('u1'), () => { heard.push('two') })
    expect(() => { vaultDB.ring() }).to.not.throw()
    expect(heard).to.deep.equal(['one', 'two'])
    expect(spy.calls).to.have.lengthOf(1)
    expect(spy.calls[0]).to.include({ level: 'error', err: thrown })
    expect(spy.calls[0]?.story).to.deep.equal({ call: 'subscribe' })
  })

  it("logs a listener's promise that rejects, rather than leave it unhandled", async () => {
    const spy = TH.spyLogger()
    const vaultDB = new RingingVaultDB({ logger: spy.logger })
    const rejected = new Error('an async listener that fails')
    // eslint-disable-next-line @typescript-eslint/no-misused-promises -- a host's listener may be async
    vaultDB.subscribe(TH.scopeOf('u1'), async () => { await Promise.resolve(); throw rejected })
    vaultDB.ring()
    await vi.waitFor(() => { expect(spy.calls.map((call) => call.err)).to.deep.equal([rejected]) })
  })

  it("logs a listener that throws something that is no Error, with no error to show", () => {
    const spy = TH.spyLogger()
    const vaultDB = new RingingVaultDB({ logger: spy.logger })
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- a host's code may throw anything
    vaultDB.subscribe(TH.scopeOf('u1'), () => { throw 'a bare string' })
    vaultDB.ring()
    expect(spy.calls[0]).to.include({ level: 'error', err: null })
  })

  it("hands what a listener threw to the platform's reportError too, where there is one", () => {
    const reported: unknown[] = []
    vi.stubGlobal('reportError', (err: unknown) => { reported.push(err) })
    const vaultDB = new RingingVaultDB({ logger: TH.spyLogger().logger })
    const thrown = new Error('a listener that throws')
    vaultDB.subscribe(TH.scopeOf('u1'), () => { throw thrown })
    vaultDB.ring()
    expect(reported).to.deep.equal([thrown])
  })

  it("never calls an unsubscribed listener, whatever the backend delivers late", () => {
    const vaultDB = new RingingVaultDB()
    let heardCount = 0
    const watches: (() => void)[] = []
    // A backend that keeps calling a watch it was told to end.
    vi.spyOn(vaultDB.watches, 'delete').mockImplementation(() => false)
    const unsubscribe = vaultDB.subscribe(TH.scopeOf('u1'), () => { heardCount += 1 })
    watches.push(...vaultDB.watches)
    unsubscribe()
    vaultDB.ring()
    expect(heardCount).to.eq(0)
    expect(watches).to.have.lengthOf(1)
  })

  it("ends a watch once: a second unsubscribe is silent, and never reaches the adapter", () => {
    const spy = TH.spyLogger()
    const vaultDB = new RingingVaultDB({ logger: spy.logger })
    const unsubscribe = vaultDB.subscribe(TH.scopeOf('u1'), unheard)
    unsubscribe()
    unsubscribe()
    expect(vaultDB.unsubscribeCount).to.eq(1)
    expect(spy.calls).to.have.lengthOf(0)
  })

  it("logs an adapter's unsubscribe that throws, as an error, and throws nothing", () => {
    const spy = TH.spyLogger()
    const vaultDB = new RingingVaultDB({ logger: spy.logger })
    vaultDB.unsubscribeThrows = new Error('the socket was already closed')
    const unsubscribe = vaultDB.subscribe(TH.scopeOf('u1'), unheard)
    expect(() => { unsubscribe() }).to.not.throw()
    expect(spy.calls[0]).to.include({ level: 'error', err: vaultDB.unsubscribeThrows })
    expect(spy.calls[0]?.message).to.match(/unsubscribe threw/)
  })
})

describe("VaultDB.watchTrouble", () => {
  it("warns of a watch that failed once for a failing streak, naming the call, and again after the watch heard", () => {
    const spy = TH.spyLogger()
    const vaultDB = new RingingVaultDB({ logger: spy.logger })
    vaultDB.subscribe(TH.scopeOf('u1'), unheard)
    const { trouble } = vaultDB
    const dropped = new Error('the socket dropped')
    trouble?.failed(dropped)
    trouble?.failed(dropped)
    trouble?.failed(new Error('and again'))
    expect(spy.calls).to.have.lengthOf(1)
    expect(spy.calls[0]).to.include({ level: 'warn', err: dropped })
    expect(spy.calls[0]?.story).to.deep.equal({ call: 'subscribe' })
    trouble?.delivered()
    trouble?.failed(dropped)
    expect(spy.calls).to.have.lengthOf(2)
  })

  it("keeps each watch's streak apart", () => {
    const spy = TH.spyLogger()
    const vaultDB = new RingingVaultDB({ logger: spy.logger })
    vaultDB.subscribe(TH.scopeOf('u1'), unheard)
    const one = vaultDB.trouble
    vaultDB.subscribe(TH.scopeOf('u2'), unheard)
    const two = vaultDB.trouble
    one?.failed(new Error('one dropped'))
    two?.failed(new Error('two dropped'))
    expect(spy.calls).to.have.lengthOf(2)
  })
})

describe("VaultDB.listBoxRecords", () => {
  it("lists each lockbox as stored, its two ciphered fields left out and format kept, damaged ones too, unchecked", async () => {
    const vaultDB = new MapVaultDB()
    const scope = TH.scopeOf('u1')
    vaultDB.rows.set(Ckeys.box(scope, 'anthropic'), TH.boxOf('anthropic', 'one'))
    vaultDB.rows.set(Ckeys.box(scope, 'openai'), { ...TH.boxOf('openai', 'two'), written_at: 'later' })
    vaultDB.rows.set(Ckeys.box(scope, 'mistral'), 'not a lockbox')
    const records = await vaultDB.listBoxRecords(scope)
    expect(records).to.have.deep.members([
      omit(TH.boxOf('anthropic', 'one'), ['lockbox_key_wrapped', 'whisper_ciphered']),
      omit({ ...TH.boxOf('openai', 'two'), written_at: 'later' }, ['lockbox_key_wrapped', 'whisper_ciphered']),
      'not a lockbox',
    ])
  })

  it("leaves out an entry filed under a name below the floor, which no verb could reach", async () => {
    const vaultDB = new MapVaultDB()
    vaultDB.rows.set(Ckeys.box(TH.scopeOf('u1'), 'tab\there'), TH.boxOf('tab\there', 'one'))
    expect(await vaultDB.listBoxRecords(TH.scopeOf('u1'))).to.deep.equal([])
  })

  it("refuses as listBoxes does: a scope below the floor as bad_label, the adapter's failure as storage_unavailable", async () => {
    class DownVaultDB extends MapVaultDB {
      protected override doListBoxes(): Promise<StoredLockbox[]> { return Promise.reject(new Error('connection reset')) }
    }
    await TH.expectRefusal(new MapVaultDB().listBoxRecords({ ...TH.scopeOf('u1'), vaultlabel: 'tab\there' }), 'bad_label')
    await TH.expectRefusal(new DownVaultDB().listBoxRecords(TH.scopeOf('u1')), 'storage_unavailable')
  })
})

describe("localVaultDB, as it is made", () => {
  const BadOpts = [
    [undefined,                                          'nothing at all'],
    [{},                                                 'a bag with no store'],
    [{ store: { read: () => null } },                    'a store missing four of its five calls'],
    [{ store: memoryStore(), logger: 'console' },        'a logger that is not a VaultLogger'],
  ] as const

  for (const [opts, blurb] of BadOpts) {
    it(`refuses ${blurb} with kind 'bad_option'`, () => {
      expect(() => localVaultDB(opts as unknown as Parameters<typeof localVaultDB>[0])).to.throw(VaultError).with.property('kind', 'bad_option')
    })
  }

  it("takes a store bare of a bag, by mistake, as no store: kind 'bad_option'", () => {
    expect(() => localVaultDB(memoryStore() as unknown as Parameters<typeof localVaultDB>[0])).to.throw(VaultError, /one bag of options/)
  })

  it("logs a listener that throws through its logger, the write it heard of landed", async () => {
    const spy = TH.spyLogger()
    const vaultDB = localVaultDB({ store: memoryStore(), logger: spy.logger })
    vaultDB.subscribe(TH.scopeOf('u1'), () => { throw new Error('a listener that throws') })
    await vaultDB.fetchOrCreateVaultProps(TH.vaultPropsOf('u1'))
    expect(await vaultDB.readVaultProps(TH.scopeOf('u1'))).to.deep.equal(TH.vaultPropsOf('u1'))
    expect(spy.calls.map((call) => call.level)).to.deep.equal(['error'])
  })

  it("refuses a write past the store's quota as storage_unavailable, the store's own error its cause, writing nothing", async () => {
    const quota = new Error('The quota has been exceeded.')
    const store = memoryStore()
    const full = { ...store, write: () => { throw quota } }
    const vaultDB = localVaultDB({ store: full })
    const refusal = await TH.expectRefusal(vaultDB.fetchOrCreateVaultProps(TH.vaultPropsOf('u1')), 'storage_unavailable')
    expect(refusal.cause).to.eq(quota)
    expect(store.ckeys()).to.have.lengthOf(0)
  })
})
