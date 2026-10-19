import { omit } from 'es-toolkit'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { memoryStore } from '../src/string-store'
import { VaultDB, jsonBytes, type VaultPropsExpectation, type VaultDelExpectation, type BoxExpectation, type BoxDelExpectation, type StoredBox, type VaultDBOpts, type WatchTrouble } from '../src/vault-db'
import { localVaultDB } from '../src/local-vault-db'
import { VaultError } from '../src/errors'
import { bad, good, valOf } from '../src/outcome'
import * as Refusals from '../src/refusals'
import { DefaultLogger, parseLogger, type VaultLogger } from '../src/logger'
import type { Box } from '../src/box'
import type { VaultProps, VaultScope } from '../src/types'
import * as Ckeys from '../src/ckeys'
import * as Expectations from '../src/expectations'
import { NameFloorBytes } from '../src/validators'
import * as TH from './test-helpers'

// == [Test adapters]: MapVaultDB, TroubledVaultDB, RingingVaultDB, MisreportingVaultDB, MisreportedCases

/**
 * The smallest honest adapter: a Map of records, each check-and-write in one synchronous step.
 * What an adapter author writes; the validation around it comes from the base class. Given a
 * `maxBoxes`, it refuses a new box in a vault already holding that many, after the
 * expectation is checked, so a first write under a boxlabel already taken is stale, never full.
 * Given `rows`, it shares them with every other MapVaultDB given the same: another device of one
 * backend in this process. Given `vaultDBOpts`, it hands them to the base class, as every adapter's
 * factory does.
 */
class MapVaultDB extends VaultDB {
  readonly maxRecordBytes = Infinity
  readonly maxVaultBytes = Infinity
  readonly maxBoxes: number
  readonly maxNameBytes: number = Infinity
  readonly rows: Map<string, unknown>

  // What super() is handed: the options, quiet unless they carry a logger (a spy's, kept out of the
  // test output), or `handed`, for a test of what the base class makes of it.
  constructor(maxBoxes = Infinity, rows = new Map<string, unknown>(), vaultDBOpts: VaultDBOpts = {}, handed?: VaultDBOpts) {
    super(handed ?? { ...vaultDBOpts, logger: vaultDBOpts.logger ?? TH.spyLogger().logger })
    this.maxBoxes = maxBoxes
    this.rows = rows
  }

  private standingVaultProps(scope: VaultScope) { return this.rows.get(Ckeys.vaultProps(scope)) as VaultProps | undefined }

  protected doGetVaultProps(scope: VaultScope): Promise<unknown> { return Promise.resolve(this.rows.get(Ckeys.vaultProps(scope)) ?? null) }

  protected doEnsureVaultProps(vaultProps: VaultProps) {
    if (! this.rows.has(Ckeys.vaultProps(vaultProps))) { this.rows.set(Ckeys.vaultProps(vaultProps), vaultProps) }
    return Promise.resolve(this.rows.get(Ckeys.vaultProps(vaultProps)))
  }

  protected doPutVaultProps(vaultProps: VaultProps, expected: VaultPropsExpectation) {
    const standing = this.standingVaultProps(vaultProps)
    if (standing?.vault_id !== expected.vault_id || standing.unlock_epoch !== expected.unlock_epoch) { return Promise.resolve(false) }
    this.rows.set(Ckeys.vaultProps(vaultProps), vaultProps)
    return Promise.resolve(true)
  }

  protected doGetBox(scope: VaultScope, boxlabel: string) { return Promise.resolve(this.rows.get(Ckeys.box(scope, boxlabel)) ?? null) }

  protected doListBoxes(scope: VaultScope): Promise<StoredBox[]> {
    const isBox = Ckeys.isBoxIn(scope)
    const listed = [...this.rows].filter(([ckey]) => isBox(ckey)).map(([ckey, row]) => ({ boxlabel: Ckeys.boxlabelOf(ckey), box: row }))
    return Promise.resolve(listed.filter((stored): stored is StoredBox => stored.boxlabel !== null))
  }

  protected doPutBox(scope: VaultScope, box: Box, expected: BoxExpectation) {
    const standingBox = this.rows.get(Ckeys.box(scope, box.boxlabel)) as Box | undefined
    const standingVaultProps = this.standingVaultProps(scope)
    const meets = standingVaultProps?.vault_id === expected.vault_id && standingVaultProps.vault_key_epoch === expected.vault_key_epoch
      && (standingBox?.revision_tok ?? null) === expected.revision_tok
    if (! meets) {
      return Promise.resolve(null)
    }
    if (standingBox === undefined && this.boxCount(scope) >= this.maxBoxes) {
      return Promise.reject(new VaultError('vault_full', 'This vault is full: remove a box to make room, then try again.'))
    }
    this.rows.set(Ckeys.box(scope, box.boxlabel), box)
    return Promise.resolve(this.rows.get(Ckeys.box(scope, box.boxlabel)))
  }

  /** How many boxes `scope` holds: counted through the ckeys, never copying the rows. */
  private boxCount(scope: VaultScope): number {
    const isBox = Ckeys.isBoxIn(scope)
    let held = 0
    for (const ckey of this.rows.keys()) {
      if (isBox(ckey)) { held += 1 }
    }
    return held
  }

  protected doDelBox(scope: VaultScope, boxlabel: string, expected: BoxDelExpectation): Promise<unknown> {
    if (this.standingVaultProps(scope)?.vault_id !== expected.vault_id) { return Promise.resolve(null) }
    const deletion = Expectations.deletionOf(this.rows.get(Ckeys.box(scope, boxlabel)), expected)
    this.rows.delete(Ckeys.box(scope, boxlabel))
    return Promise.resolve(deletion)
  }

  protected doDelVault(scope: VaultScope, expected: VaultDelExpectation) {
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

  protected override doGetVaultProps(): Promise<unknown> { this.failure() }
  protected override doSubscribe(): () => void { this.failure() }
  protected override doPutBox(): Promise<unknown> { return Promise.reject(new Error('the backend dropped the connection')) }
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
  makeCappedVaultDB: (maxBoxes) => new MapVaultDB(maxBoxes),
  makeDevices:       () => {
    const rows = new Map<string, unknown>()
    return ({ maxBoxes }) => new MapVaultDB(maxBoxes, rows)
  },
})

// The ckeys u1's main vault is filed under, spelled out rather than computed: they are stored.
const u1VaultPropsCkey = 'vault^acme^u1^main'
const u1AnthropicBoxCkey = 'box^acme^u1^main^anthropic'

/** A MapVaultDB that deletes each box as it should, then answers `answer` in place of what it found. */
class MisreportingVaultDB extends MapVaultDB {
  private readonly answer: unknown

  constructor(answer: unknown) {
    super()
    this.answer = answer
  }

  protected override async doDelBox(scope: VaultScope, boxlabel: string, expected: BoxDelExpectation): Promise<unknown> {
    const deletion = await super.doDelBox(scope, boxlabel, expected)
    return deletion === null ? null : this.answer
  }
}

const MisreportedCases = [
  [true,                          'the true an older adapter answered with'],
  [false,                         'the false an older adapter refused with'],
  [undefined,                     'nothing at all'],
  ['deleted',                     'the outcome bare, not in its record'],
  [{ outcome: 'gone' },           'an outcome this package does not know'],
  [{},                            'a record naming no outcome'],
] as const
// --

// == [Deletion answers and the adapter's half]: box deletion, ListedRecordCases, an adapter's half

describe("the abstract VaultDB, on the way back from a box deletion", () => {
  it("resolves what its adapter says it removed: the revision named, another, or none", async () => {
    const vaultDB = new MapVaultDB()
    await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
    await TH.expectingGood(vaultDB).putBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), TH.noBoxYet)
    await TH.expectingGood(vaultDB).putBox(TH.scopeOf('u1'), TH.boxOf('openai', 'two'), TH.noBoxYet)
    expect(await TH.expectingGood(vaultDB).delBox(TH.scopeOf('u1'), 'anthropic', TH.deleting('rev-one'))).to.deep.equal({ outcome: 'deleted' })
    expect(await TH.expectingGood(vaultDB).delBox(TH.scopeOf('u1'), 'openai', TH.deleting('rev-one'))).to.deep.equal({ outcome: 'deleted_other' })
    expect(await TH.expectingGood(vaultDB).delBox(TH.scopeOf('u1'), 'openai', TH.deleting('rev-two'))).to.deep.equal({ outcome: 'absent' })
  })

  it("resolves the outcome, as its example shows", async () => {
    const vaultDB = new MapVaultDB()
    const vaultProps = TH.vaultPropsOf('u1')
    await TH.expectingGood(vaultDB).ensureVaultProps(vaultProps)
    await TH.expectingGood(vaultDB).putBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), TH.noBoxYet)
    const [listed] = await TH.expectingGood(vaultDB).listBoxes(TH.scopeOf('u1'))
    const { outcome } = await TH.expectingGood(vaultDB).delBox(TH.scopeOf('u1'), 'anthropic', { vault_id: vaultProps.vault_id, revision_tok: listed?.revision_tok ?? null })
    expect(outcome).to.eq('deleted')
  })

  it("refuses as stale, resolving nothing and removing nothing, a deletion whose adapter answers null", async () => {
    const vaultDB = new MapVaultDB()
    await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
    await TH.expectingGood(vaultDB).putBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), TH.noBoxYet)
    await TH.expectBad(vaultDB.delBox(TH.scopeOf('u1'), 'anthropic', { vault_id: 'vault-id-gone', revision_tok: 'rev-one' }), 'stale_write')
    expect(vaultDB.rows.get(u1AnthropicBoxCkey)).to.deep.equal(TH.boxOf('anthropic', 'one'))
  })

  it("keeps only the outcome of an answer carrying more, as a GraphQL client's __typename", async () => {
    const vaultDB = new MisreportingVaultDB({ outcome: 'deleted', __typename: 'SafebyokBoxDeletion' })
    await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
    expect(await TH.expectingGood(vaultDB).delBox(TH.scopeOf('u1'), 'anthropic', TH.deleting(null))).to.deep.equal({ outcome: 'deleted' })
  })

  for (const [answer, blurb] of MisreportedCases) {
    it(`refuses as corrupt_record a landed deletion whose adapter answers ${blurb}, saying it may have landed`, async () => {
      const vaultDB = new MisreportingVaultDB(answer)
      await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
      await TH.expectingGood(vaultDB).putBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), TH.noBoxYet)
      const refusal = await TH.expectBad(vaultDB.delBox(TH.scopeOf('u1'), 'anthropic', TH.deleting('rev-one')), 'corrupt_record')
      expect(refusal.message).to.match(/deletion landed/)
      expect(refusal.message).to.match(/cannot read back/)
      expect((refusal.cause as VaultError).refusalkind).to.eq('corrupt_record')
      expect(TH.thrownText(refusal)).to.not.include('anthropic')
      // What the adapter removed stays removed: the refusal is about its answer, not its deletion.
      expect(vaultDB.rows.has(u1AnthropicBoxCkey)).to.be.false
    })
  }
})

/** Records an adapter may hand up from its listing, under the boxlabel each is stored under, and how each lists. */
const ListedRecordCases = [
  // sound:
  ["anthropic",  TH.boxOf('anthropic', 'one'),                               [["anthropic", false]],  'a sound box as its summary'],
  // damaged, listed so they can be deleted:
  ["anthropic",  TH.boxOf('other_box', 'one'),                               [["anthropic", true]],   'a record naming another boxlabel as damaged, under the one it is stored under'],
  ["anthropic",  { ...TH.boxOf('anthropic', 'one'), written_at: 'later' },   [["anthropic", true]],   'a record with a malformed time as damaged'],
  ["anthropic",  { ...TH.boxOf('anthropic', 'one'), sidecar_json: '{"a":' }, [["anthropic", true]], 'a record whose sidecar is not JSON as damaged'],
  ["anthropic",  TH.omitting(TH.boxOf('anthropic', 'one'), 'sidecar_json'),  [["anthropic", true]],   'a record with no sidecar as damaged'],
  ["anthropic",  null,                                                       [["anthropic", true]],   'a null record as damaged'],
  ["anthropic",  'not a box',                                                [["anthropic", true]],   'a record that is not an object as damaged'],
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
    const refusal = await TH.expectBad(vaultDB.getVaultProps(TH.scopeOf('u1')), 'corrupt_record')
    expect(refusal).to.be.instanceOf(VaultError)
    // Refused, never repaired or deleted: the record is still there for forensics.
    expect(vaultDB.rows.size).to.eq(1)
  })

  it("lists a box's sidecar as the JSON value its record holds, and nothing of its codec", async () => {
    const vaultDB = new MapVaultDB()
    vaultDB.rows.set(Ckeys.box(TH.scopeOf('u1'), 'anthropic'), TH.boxOf('anthropic', 'one', { sidecar_json: '{"note":"work","tags":["a",null]}' }))
    const [listed] = await TH.expectingGood(vaultDB).listBoxes(TH.scopeOf('u1'))
    const summary = TH.summaryOf(listed)
    expect(summary?.sidecar).to.deep.equal({ note: 'work', tags: ['a', null] })
    expect(summary).to.not.have.property('whisper_codec')
    expect(summary).to.not.have.property('sidecar_json')
  })

  for (const [boxlabel, record, expected, blurb] of ListedRecordCases) {
    it(`lists ${blurb}`, async () => {
      const vaultDB = new MapVaultDB()
      vaultDB.rows.set(Ckeys.box(TH.scopeOf('u1'), boxlabel), record)
      const listed = await TH.expectingGood(vaultDB).listBoxes(TH.scopeOf('u1'))
      expect(listed.map((box) => [box.boxlabel, box.damaged])).to.deep.equal(expected)
    })
  }

  it("leaves out an entry an adapter hands up without a boxlabel as text, which no verb could name", async () => {
    class UnnamingVaultDB extends MapVaultDB {
      protected override doListBoxes() {
        return Promise.resolve([{ boxlabel: 42, box: TH.boxOf('anthropic', 'one') }] as unknown as StoredBox[])
      }
    }
    expect(await TH.expectingGood(new UnnamingVaultDB()).listBoxes(TH.scopeOf('u1'))).to.deep.equal([])
  })

  it("accepts a listing projected server-side, without ciphered fields, so long as it keeps format", async () => {
    const vaultDB = new MapVaultDB()
    const projected = omit(TH.boxOf('anthropic', 'one'), ['box_key_wrapped', 'whisper_ciphered'])
    vaultDB.rows.set(Ckeys.box(TH.scopeOf('u1'), 'anthropic'), projected)
    const summaries = await TH.expectingGood(vaultDB).listBoxes(TH.scopeOf('u1'))
    expect(TH.summaryOf(summaries[0])?.revision_tok).to.eq('rev-one')
    vaultDB.rows.set(Ckeys.box(TH.scopeOf('u1'), 'anthropic'), omit(projected, ['format']))
    expect(await TH.expectingGood(vaultDB).listBoxes(TH.scopeOf('u1'))).to.deep.equal([{ boxlabel: 'anthropic', damaged: true, revision_tok: 'rev-one' }])
  })

  const DamagedRevisionCases = [
    [{ ...TH.boxOf('anthropic', 'one'), written_at: 'later' },   "rev-one",  'keeps the revision a damaged record holds as text'],
    [{ ...TH.boxOf('anthropic', 'one'), revision_tok: 7 },       null,       'keeps none for a revision that is not text'],
    [{ ...TH.boxOf('anthropic', 'one'), revision_tok: '' },      null,       'keeps none for an empty revision'],
    ['not a box',                                                null,       'keeps none for a record that is no object'],
  ] as const

  for (const [stored, expected, blurb] of DamagedRevisionCases) {
    it(`lists a damaged box with its revision_tok: ${blurb}`, async () => {
      const vaultDB = new MapVaultDB()
      vaultDB.rows.set(Ckeys.box(TH.scopeOf('u1'), 'anthropic'), stored)
      expect(await TH.expectingGood(vaultDB).listBoxes(TH.scopeOf('u1'))).to.deep.equal([{ boxlabel: 'anthropic', damaged: true, revision_tok: expected }])
    })
  }

  it("turns an adapter's own failure into kind 'storage_unavailable', keeping it as the cause", async () => {
    const outage = new Error('the backend is down')
    const vaultDB = new TroubledVaultDB(() => { throw outage })
    const refusal = await TH.expectBad(vaultDB.getVaultProps(TH.scopeOf('u1')), 'storage_unavailable')
    expect(refusal).to.be.instanceOf(VaultError)
    expect(refusal.cause).to.eq(outage)
    const putRefusal = await TH.expectBad(vaultDB.putBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), TH.noBoxYet), 'storage_unavailable')
    expect(putRefusal.message).to.match(/could not be reached/)
  })

  it("passes an adapter's own VaultError through untouched: not_permitted stays not_permitted", async () => {
    const forbidden = new VaultError('not_permitted', 'This backend does not let the signed-in user reach that vault.')
    const vaultDB = new TroubledVaultDB(() => { throw forbidden })
    const refusal = await TH.expectBad(vaultDB.getVaultProps(TH.scopeOf('u1')), 'not_permitted')
    expect(refusal).to.eq(forbidden)
  })

  it("subscribe defaults to silence: a usable unsubscribe, and no notifications", async () => {
    const vaultDB = new MapVaultDB()
    let heardCount = 0
    const unsubscribe = vaultDB.subscribe(TH.scopeOf('u1'), () => { heardCount += 1 })
    await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
    expect(heardCount).to.eq(0)
    unsubscribe()
  })

  it("turns an adapter's failure to subscribe into kind 'storage_unavailable' as well, keeping it as the cause", () => {
    const outage = new Error('the backend is not connected')
    const vaultDB = new TroubledVaultDB(() => { throw outage })
    let refusal: unknown = null
    try { vaultDB.subscribe(TH.scopeOf('u1'), unheard) } catch (err) { refusal = err }
    expect(refusal).to.be.instanceOf(VaultError)
    expect((refusal as VaultError).refusalkind).to.eq('storage_unavailable')
    expect((refusal as VaultError).cause).to.eq(outage)
  })

  it("refuses to subscribe to a scope below the floor", () => {
    const vaultDB = new MapVaultDB()
    expect(() => vaultDB.subscribe({ ...TH.scopeOf('u1'), applabel: '' }, unheard)).to.throw(VaultError, /applabel/).with.property('refusalkind', 'bad_label')
  })

  it("refuses an onChange that is not a function, so no later write meets it", () => {
    const vaultDB = new MapVaultDB()
    expect(() => vaultDB.subscribe(TH.scopeOf('u1'), 'not a listener' as unknown as () => void))
      .to.throw(VaultError, /onChange function/).with.property('refusalkind', 'bad_option')
  })
})
// --

// == [Deleting a damaged vault]: RefusedWrites, withDamagedVaultProps, deleting a vault whose props are damaged

/** Writes a VaultDB refuses before its adapter's half sees them: none is one a vault builds. */
const RefusedWrites = [
  // the records:
  ['bad_record', (vaultDB: VaultDB) => vaultDB.ensureVaultProps({ ...TH.vaultPropsOf('u1'), unlock_epoch: 1.5 }),                              'vault props with a fractional unlock_epoch'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.ensureVaultProps({ ...TH.vaultPropsOf('u1'), wayins: [omit(TH.wayinOf('passphrase'), ['vault_key_wayin_wrapped'])] } as VaultProps), 'vault props whose wayin is missing its wrapped vaultKey'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.ensureVaultProps({ ...TH.vaultPropsOf('u1'), applabel: 'Ac\u{7}me' }),                         'vault props whose applabel holds a control character, the record at fault though only its label failed'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.putVaultProps({ ...TH.vaultPropsOf('u1'), user_id: 'u^1' }, { vault_id: 'vault-id-u1', unlock_epoch: 1 }), 'an update of the vault props whose user_id holds a ^'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.putBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one', { sidecar_json: 'not json' }), TH.noBoxYet), 'a box whose sidecar no read would accept'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.putBox(TH.scopeOf('u1'), TH.boxOf('key\u{D83D}', 'one'), TH.noBoxYet),                  'a box whose boxlabel is half of an emoji, the box at fault though only its label failed'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.putBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one', { written_at: 1_792_022_400 }), TH.noBoxYet), 'a box time in epoch seconds'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.putBox(TH.scopeOf('u1'), undefined as unknown as Box, TH.noBoxYet),               'no box at all'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.putBox(TH.scopeOf('u1'), { boxlabel: 'anthropic' } as Box, TH.noBoxYet),           'a box holding nothing but its boxlabel'],
  // the expectations:
  ['bad_record', (vaultDB: VaultDB) => vaultDB.putVaultProps(TH.vaultPropsOf('u1'), { vault_id: 'vault-id-u1', unlock_epoch: 0 }),          'an expectation of the vault props at epoch zero'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.putVaultProps(TH.vaultPropsOf('u1'), undefined as unknown as VaultPropsExpectation), 'no expectation of the vault props at all'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.putBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), { vault_id: 'vault-id-u1' } as BoxExpectation), 'a box expectation missing its revision_tok'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.putBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), { vault_id: 'vault-id-u1', revision_tok: null } as BoxExpectation), 'a box expectation naming no vaultKey epoch'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.delBox(TH.scopeOf('u1'), 'anthropic', { revision_tok: null } as BoxDelExpectation), 'a delete expectation naming no vault'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.delBox(TH.scopeOf('u1'), 'anthropic', TH.thisVault as BoxDelExpectation),          'a box delete expectation missing its revision_tok'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.delBox(TH.scopeOf('u1'), 'anthropic', TH.deleting('')),                                  'a box delete expectation naming an empty revision_tok'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.delVault(TH.scopeOf('u1'), {} as VaultDelExpectation),                                   'a vault delete expectation naming no vault'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.delVault(TH.scopeOf('u1'), { vault_id: '' }),                                         'a delete expectation naming an empty vault_id'],
  // the two together:
  ['bad_record', (vaultDB: VaultDB) => vaultDB.putVaultProps(TH.vaultPropsOf('u1', { vault_id: 'vault-id-new', unlock_epoch: 2 }), { vault_id: 'vault-id-u1', unlock_epoch: 1 }), 'an update of the vault props that would change the vault_id'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.putBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one', { vault_key_epoch: 2 }), TH.noBoxYet), 'a box sealed under another vaultKey than the expected one'],
] as const

/** A vault in `u1`'s slot with a box, its vault props spoiled by `spoil`, and a sound neighbour beside it. */
const withDamagedVaultProps = (spoil: (vaultProps: VaultProps) => unknown = (vaultProps) => ({ ...vaultProps, unlock_epoch: 'one' })) => {
  const vaultDB = new MapVaultDB()
  vaultDB.rows.set(Ckeys.vaultProps(TH.scopeOf('u1')), spoil(TH.vaultPropsOf('u1')))
  vaultDB.rows.set(Ckeys.box(TH.scopeOf('u1'), 'anthropic'), TH.boxOf('anthropic', 'one'))
  vaultDB.rows.set(Ckeys.vaultProps(TH.scopeOf('u2')), TH.vaultPropsOf('u2'))
  vaultDB.rows.set(Ckeys.box(TH.scopeOf('u2'), 'anthropic'), TH.boxOf('anthropic', 'one'))
  return vaultDB
}

describe("the abstract VaultDB, deleting a vault whose vault props are damaged", () => {
  it("deletes the vault props and every box of a vault whose props fail their checks, and nothing of any other", async () => {
    const vaultDB = withDamagedVaultProps()
    await TH.expectBad(vaultDB.getVaultProps(TH.scopeOf('u1')), 'corrupt_record')
    await TH.expectingGood(vaultDB).delDamagedVault(TH.scopeOf('u1'))
    expect(vaultDB.rows.size).to.eq(2)
    const theirVaultProps = Ckeys.vaultProps(TH.scopeOf('u2'))
    const theirBox = Ckeys.box(TH.scopeOf('u2'), 'anthropic')
    expect(vaultDB.rows.has(theirVaultProps)).to.eq(true)
    expect(vaultDB.rows.has(theirBox)).to.eq(true)
    expect(await TH.expectingGood(vaultDB).getVaultProps(TH.scopeOf('u1'))).to.be.null
  })

  it("counts vault props naming another vault than the one asked for as damaged", async () => {
    const vaultDB = new MapVaultDB()
    vaultDB.rows.set(Ckeys.vaultProps(TH.scopeOf('u1')), TH.vaultPropsOf('u2'))
    await TH.expectingGood(vaultDB).delDamagedVault(TH.scopeOf('u1'))
    expect(vaultDB.rows.size).to.eq(0)
  })

  it("refuses vault props that stand sound as bad_option, deleting nothing", async () => {
    const vaultDB = withDamagedVaultProps((vaultProps) => vaultProps)
    const before = new Map(vaultDB.rows)
    const refusal = await TH.expectBad(vaultDB.delDamagedVault(TH.scopeOf('u1')), 'bad_option')
    expect(refusal.message).to.include('del()')
    expect(vaultDB.rows).to.deep.equal(before)
  })

  it("is quiet where the scope holds no vault props", async () => {
    const vaultDB = new MapVaultDB()
    await TH.expectingGood(vaultDB).delDamagedVault(TH.scopeOf('u1'))
    expect(vaultDB.rows.size).to.eq(0)
  })

  it("refuses a record too damaged to name its vault as damaged_vault, deleting nothing", async () => {
    for (const record of [{ format: 'safebyok-vault-v1' }, { vault_id: '' }, { vault_id: 7 }, {}, 'not even a bag']) {
      const vaultDB = withDamagedVaultProps(() => record)
      const refusal = await TH.expectBad(vaultDB.delDamagedVault(TH.scopeOf('u1')), 'damaged_vault')
      expect(refusal.message).to.include('nothing was removed')
      expect(vaultDB.rows.size).to.eq(4)
    }
  })

  const Wayin = TH.vaultPropsOf('u1').wayins[0]
  const NewerRecords = [
    [{ format: 'safebyok-vault-v5' },                                                      'a format this version does not know, whatever else it holds'],
    [(vaultProps: VaultProps) => ({ ...vaultProps, format: 'safebyok-vault-v5' }),                'vault props that are otherwise sound but for their format'],
    [(vaultProps: VaultProps) => ({ ...vaultProps, format: 2 }),                           'a format of another type'],
    [(vaultProps: VaultProps) => ({ ...vaultProps, wayins: [...vaultProps.wayins, { wayinkind: 'smartcard', wayin_id: 'x' }] }), 'a wayinkind this version does not know'],
    [(vaultProps: VaultProps) => ({ ...vaultProps, wayins: Array.from({ length: 9 }, () => Wayin) }), 'more wayins than this version holds'],
  ] as const

  for (const [record, blurb] of NewerRecords) {
    it(`refuses ${blurb} as possibly newer than this version (newer_format), deleting nothing`, async () => {
      const vaultDB = withDamagedVaultProps((vaultProps) => (typeof record === 'function' ? record(vaultProps) : { ...vaultProps, ...record }))
      const refusal = await TH.expectBad(vaultDB.delDamagedVault(TH.scopeOf('u1')), 'newer_format')
      expect(refusal.message).to.include('newer version')
      expect(refusal.message).to.include('left as it is')
      await TH.expectBad(vaultDB.getVaultProps(TH.scopeOf('u1')), 'newer_format')
      expect(vaultDB.rows.size).to.eq(4)
    })
  }

  it("still deletes vault props that fail for anything it can only take for damage: a known format and methods, in number", async () => {
    const vaultDB = withDamagedVaultProps((vaultProps) => ({ ...vaultProps, wayins: [{ ...Wayin, salt_b64: 7 }], registered_at: 'later' }))
    await TH.expectingGood(vaultDB).delDamagedVault(TH.scopeOf('u1'))
    expect(vaultDB.rows.size).to.eq(2)
  })

  it("deletes vault props in a format an earlier version wrote, which is older, never newer", async () => {
    const vaultDB = withDamagedVaultProps(({ vault_key_epoch: _epoch, ...vaultProps }) => ({ ...vaultProps, format: 'safebyok-vault-v1' }))
    await TH.expectingGood(vaultDB).delDamagedVault(TH.scopeOf('u1'))
    expect(vaultDB.rows.size).to.eq(2)
  })

  it("aims the deletion at the vault_id it read, so a vault made anew meanwhile survives as stale_write", async () => {
    class ReplacedVaultDB extends MapVaultDB {
      protected override doDelVault(): Promise<boolean> { return Promise.resolve(false) }
    }
    const vaultDB = new ReplacedVaultDB()
    vaultDB.rows.set(Ckeys.vaultProps(TH.scopeOf('u1')), { ...TH.vaultPropsOf('u1'), unlock_epoch: 'one' })
    await TH.expectBad(vaultDB.delDamagedVault(TH.scopeOf('u1')), 'stale_write')
  })

  it("hands delVault the vault_id the damaged record carries", async () => {
    const asked: VaultDelExpectation[] = []
    class SpyingVaultDB extends MapVaultDB {
      protected override doDelVault(scope: VaultScope, expected: VaultDelExpectation): Promise<boolean> {
        asked.push(expected)
        return super.doDelVault(scope, expected)
      }
    }
    const vaultDB = new SpyingVaultDB()
    vaultDB.rows.set(Ckeys.vaultProps(TH.scopeOf('u1')), { ...TH.vaultPropsOf('u1'), unlock_epoch: 'one' })
    await TH.expectingGood(vaultDB).delDamagedVault(TH.scopeOf('u1'))
    expect(asked).to.deep.equal([{ vault_id: TH.vaultPropsOf('u1').vault_id }])
  })

  it("refuses as damaged_vault, deleting nothing, an adapter that validates on the way up and so never hands the record over", async () => {
    class CheckedVaultDB extends MapVaultDB {
      protected override doGetVaultProps(): Promise<unknown> {
        return Promise.reject(new VaultError('corrupt_record', 'did not read back'))
      }
    }
    const vaultDB = new CheckedVaultDB()
    vaultDB.rows.set(Ckeys.vaultProps(TH.scopeOf('u1')), { ...TH.vaultPropsOf('u1'), unlock_epoch: 'one' })
    const refusal = await TH.expectBad(vaultDB.delDamagedVault(TH.scopeOf('u1')), 'damaged_vault')
    expect((refusal.cause as VaultError).refusalkind).to.eq('corrupt_record')
    expect(vaultDB.rows.size).to.eq(1)
  })

  it("wraps what the adapter throws as storage_unavailable, and checks the scope first", async () => {
    class DownVaultDB extends MapVaultDB {
      protected override doGetVaultProps(): Promise<unknown> { return Promise.reject(new Error('connection reset')) }
    }
    await TH.expectBad(new DownVaultDB().delDamagedVault(TH.scopeOf('u1')), 'storage_unavailable')
    await TH.expectBad(new MapVaultDB().delDamagedVault({ ...TH.scopeOf('u1'), applabel: '' }), 'bad_label')
  })
})
// --

// == [Answers from the adapter]: on the way in, MisansweringVaultDB, box write, ForgetfulVaultDB, by what threw, listing

describe("the abstract VaultDB, on the way in", () => {
  for (const [kind, write, blurb] of RefusedWrites) {
    it(`refuses ${blurb} with kind '${kind}', and storage sees nothing`, async () => {
      const vaultDB = new MapVaultDB()
      vaultDB.rows.set(Ckeys.vaultProps(TH.scopeOf('u1')), TH.vaultPropsOf('u1'))
      const before = [...vaultDB.rows]
      const refusal = await TH.expectBad(write(vaultDB), kind)
      expect(refusal).to.be.instanceOf(VaultError)
      expect([...vaultDB.rows]).to.deep.equal(before)
    })
  }

  it("leads a refused delete's message with nothing removed, and a refused write's with nothing written", async () => {
    const vaultDB = new MapVaultDB()
    const delBox = await TH.expectBad(vaultDB.delBox(TH.scopeOf('u1'), 'anthropic', TH.deleting('')), 'bad_record')
    const delVault = await TH.expectBad(vaultDB.delVault(TH.scopeOf('u1'), { vault_id: '' }), 'bad_record')
    const putBox = await TH.expectBad(vaultDB.putBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one', { revision_tok: '' }), TH.noBoxYet), 'bad_record')
    const fetchOrCreate = await TH.expectBad(vaultDB.ensureVaultProps({ ...TH.vaultPropsOf('u1'), unlock_epoch: 0 }), 'bad_record')
    expect(delBox.message).to.match(/^Nothing was removed: that delete expectation/)
    expect(delVault.message).to.match(/^Nothing was removed: that delete expectation/)
    expect(putBox.message).to.match(/^Nothing was written: that box /)
    expect(fetchOrCreate.message).to.match(/^Nothing was written: that vault props record /)
  })

  it("never quotes a record it refuses", async () => {
    const vaultDB = new MapVaultDB()
    const sneaky = TH.boxOf('anthropic', 'one', { whisper_ciphered: TH.fakeCiphered('SUPERSECRET'), revision_tok: '' })
    const refusal = await TH.expectBad(vaultDB.putBox(TH.scopeOf('u1'), sneaky, TH.noBoxYet), 'bad_record')
    expect(refusal.message).to.not.include('SUPERSECRET')
    expect(refusal.message).to.not.include('anthropic')
  })

  it("hands its adapter the record as this package writes it: a field it does not know stays behind", async () => {
    const vaultDB = new MapVaultDB()
    await TH.expectingGood(vaultDB).ensureVaultProps({ ...TH.vaultPropsOf('u1'), stray_field: 'x' } as VaultProps)
    expect(vaultDB.rows.get(u1VaultPropsCkey)).to.deep.equal(TH.vaultPropsOf('u1'))
  })

  it("lets a vault's own writes through untouched: a box with an empty sidecar, a box replaced, a deletion", async () => {
    const vaultDB = new MapVaultDB()
    await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
    const emptied = TH.boxOf('anthropic', 'one', { sidecar_json: '{}' })
    await TH.expectingGood(vaultDB).putBox(TH.scopeOf('u1'), emptied, TH.noBoxYet)
    expect(vaultDB.rows.get(u1AnthropicBoxCkey)).to.deep.equal(emptied)
    await TH.expectingGood(vaultDB).putBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'two'), { vault_id: 'vault-id-u1', revision_tok: 'rev-one', vault_key_epoch: 1 })
    await TH.expectingGood(vaultDB).delBox(TH.scopeOf('u1'), 'anthropic', TH.deleting('rev-two'))
    expect(await TH.expectingGood(vaultDB).listBoxes(TH.scopeOf('u1'))).to.have.lengthOf(0)
  })
})

/** A MapVaultDB that writes each box as it should, then hands back `handedBack` in place of what it stored. */
class MisansweringVaultDB extends MapVaultDB {
  private readonly handedBack: unknown

  constructor(handedBack: unknown) {
    super()
    this.handedBack = handedBack
  }

  protected override async doPutBox(scope: VaultScope, box: Box, expected: BoxExpectation): Promise<unknown> {
    const stored = await super.doPutBox(scope, box, expected)
    return stored === null ? null : this.handedBack
  }
}

const MisansweredCases = [
  [true,                                                             'the true an older adapter answered with'],
  [undefined,                                                        'nothing at all'],
  [omit(TH.boxOf('anthropic', 'one'), ['whisper_ciphered']),         'a box missing a ciphered field'],
  [{ ...TH.boxOf('anthropic', 'one'), written_at: '1792022400000' }, 'a box whose time is text'],
  [TH.boxOf('openai', 'one'),                                        'a box under another boxlabel than the one written'],
] as const

describe("the abstract VaultDB, on the way back from a box write", () => {
  it("resolves the box its adapter hands back, as storage now holds it", async () => {
    const vaultDB = new MapVaultDB()
    await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
    expect(await TH.expectingGood(vaultDB).putBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), TH.noBoxYet)).to.deep.equal(TH.boxOf('anthropic', 'one'))
  })

  it("refuses as stale, resolving nothing, a write whose adapter answers null", async () => {
    const vaultDB = new MapVaultDB()
    await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
    await TH.expectingGood(vaultDB).putBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), TH.noBoxYet)
    await TH.expectBad(vaultDB.putBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'two'), TH.noBoxYet), 'stale_write')
    expect(vaultDB.rows.get(u1AnthropicBoxCkey)).to.deep.equal(TH.boxOf('anthropic', 'one'))
  })

  for (const [handedBack, blurb] of MisansweredCases) {
    it(`refuses as corrupt_record a landed write whose adapter hands back ${blurb}, saying the write may have landed`, async () => {
      const vaultDB = new MisansweringVaultDB(handedBack)
      await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
      const refusal = await TH.expectBad(vaultDB.putBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), TH.noBoxYet), 'corrupt_record')
      expect(refusal.message).to.match(/landed/)
      expect(refusal.message).to.match(/cannot read back/)
      expect((refusal.cause as VaultError).refusalkind).to.eq('corrupt_record')
      // What the adapter stored stands: the refusal is about its answer, not its write.
      expect(vaultDB.rows.get(u1AnthropicBoxCkey)).to.deep.equal(TH.boxOf('anthropic', 'one'))
    })
  }

  it("never quotes the record it refuses on the way back", async () => {
    const vaultDB = new MisansweringVaultDB({ ...TH.boxOf('anthropic', 'one', { whisper_ciphered: TH.fakeCiphered('SUPERSECRET') }), revision_tok: '' })
    await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
    const refusal = await TH.expectBad(vaultDB.putBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'one'), TH.noBoxYet), 'corrupt_record')
    expect(refusal.message).to.not.include('SUPERSECRET')
    expect(refusal.message).to.not.include('anthropic')
  })
})

/**
 * A MapVaultDB written as a VaultDB that hands each call on to another and forgets to unwrap the
 * answer: each hook hands back `good` of what it would answer, or, for a write, `bad` of a stale one.
 */
class ForgetfulVaultDB extends MapVaultDB {
  protected override async doGetVaultProps(scope: VaultScope): Promise<unknown> { return good(await super.doGetVaultProps(scope)) }
  protected override async doGetBox(scope: VaultScope, boxlabel: string) { return good(await super.doGetBox(scope, boxlabel)) }
  protected override doPutVaultProps(): Promise<boolean> { return Promise.resolve(bad(Refusals.staleWrite('vaultProps')) as unknown as boolean) }
}

/** A MapVaultDB whose box reads it hands on to `inner`, unwrapping each answer as an adapter must. */
class ForwardingVaultDB extends MapVaultDB {
  readonly inner = new MapVaultDB()

  protected override async doGetBox(scope: VaultScope, boxlabel: string) {
    return valOf(await this.inner.getBox(scope, boxlabel))
  }
}

describe("the abstract VaultDB, by what threw", () => {
  it("takes the answer of a VaultDB handing its call on, unwrapped with valOf, and its refusal thrown, as valOf's second example shows", async () => {
    const vaultDB = new ForwardingVaultDB()
    vaultDB.inner.rows.set(u1AnthropicBoxCkey, TH.boxOf('anthropic', 'one'))
    expect(await TH.expectingGood(vaultDB).getBox(TH.scopeOf('u1'), 'anthropic')).to.deep.equal(TH.boxOf('anthropic', 'one'))
    vaultDB.inner.rows.set(u1AnthropicBoxCkey, 'not a box')
    await TH.expectBad(vaultDB.getBox(TH.scopeOf('u1'), 'anthropic'), 'corrupt_record')
  })

  it("refuses an answer still wrapped as an Outcome as 'bad_option', saying to unwrap it with valOf, never reading it as a record", async () => {
    const vaultDB = new ForgetfulVaultDB()
    vaultDB.rows.set(u1VaultPropsCkey, TH.vaultPropsOf('u1'))
    const refusal = await TH.expectBad(vaultDB.getVaultProps(TH.scopeOf('u1')), 'bad_option')
    expect(refusal.message).to.match(/doGetVaultProps answered with an Outcome/)
    expect(refusal.message).to.match(/valOf/)
    await TH.expectBad(vaultDB.getBox(TH.scopeOf('u1'), 'anthropic'), 'bad_option')
  })

  it("refuses a write answered with a refusal still wrapped, which reads as true, rather than taking it as landed", async () => {
    const vaultDB = new ForgetfulVaultDB()
    vaultDB.rows.set(u1VaultPropsCkey, TH.vaultPropsOf('u1'))
    const expected = { vault_id: 'vault-id-u1', unlock_epoch: 1 }
    await TH.expectBad(vaultDB.putVaultProps({ ...TH.vaultPropsOf('u1'), unlock_epoch: 2 }, expected), 'bad_option')
  })

  it("says a throw in its own code, not the adapter's, as 'unexpected_error', never as storage_unavailable, which a host would retry", async () => {
    const vaultDB = new MapVaultDB()
    const thrown = new TypeError('the scope fell over')
    const scope = { ...TH.scopeOf('u1'), get vaultlabel(): string { throw thrown } }
    const refusal = await TH.expectBad(vaultDB.getVaultProps(scope), 'unexpected_error')
    expect(refusal.family).to.eq('misuse')
    expect(refusal.cause).to.eq(thrown)
  })

  it("still says the adapter's own throw as storage_unavailable, whatever it threw: a TypeError is how fetch says the network failed", async () => {
    const networkDown = new TypeError('Failed to fetch')
    const vaultDB = new TroubledVaultDB(() => { throw networkDown })
    const refusal = await TH.expectBad(vaultDB.getVaultProps(TH.scopeOf('u1')), 'storage_unavailable')
    expect(refusal.cause).to.eq(networkDown)
  })
})

describe("the abstract VaultDB, listing", () => {
  it("lists a box whose ciphered fields are damaged, leaving getBox() to refuse it: one damaged box never costs the vault", async () => {
    const vaultDB = new MapVaultDB()
    vaultDB.rows.set(Ckeys.vaultProps(TH.scopeOf('u1')), TH.vaultPropsOf('u1'))
    vaultDB.rows.set(Ckeys.box(TH.scopeOf('u1'), 'anthropic'), { ...TH.boxOf('anthropic', 'one'), whisper_ciphered: { cipher_iv_b64: '' } })
    vaultDB.rows.set(Ckeys.box(TH.scopeOf('u1'), 'openai'), TH.boxOf('openai', 'two'))
    const summaries = await TH.expectingGood(vaultDB).listBoxes(TH.scopeOf('u1'))
    expect(summaries.map((summary) => summary.boxlabel)).to.deep.equal(['anthropic', 'openai'])
    const refusal = await TH.expectBad(vaultDB.getBox(TH.scopeOf('u1'), 'anthropic'), 'corrupt_record')
    expect(refusal.message).to.match(/did not read back in a shape/)
  })
})
// --

// == [Names and sizes]: scriptScope, holding names, NarrowNamesVaultDB, SmallRecordVaultDB, weighing, jsonBytes

/** A scope no default check admits, which every verb takes: names above the floor. */
const scriptScope = { applabel: 'Acme: אקמה', user_id: 'u1', vaultlabel: 'ราก' } as const

describe("the abstract VaultDB, holding names to the floor", () => {
  it("takes any name above the floor in every verb, as a server serving several clients must: a vault's own validators are its own, at its entry", async () => {
    const vaultDB = new MapVaultDB()
    await TH.expectingGood(vaultDB).ensureVaultProps({ ...TH.vaultPropsOf('u1'), ...scriptScope })
    await TH.expectingGood(vaultDB).putBox(scriptScope, TH.boxOf('مفتاح العمل', 'one'), TH.noBoxYet)
    const box = await TH.expectingGood(vaultDB).getBox(scriptScope, 'مفتاح العمل')
    expect(box?.revision_tok).to.eq('rev-one')
    const summaries = await TH.expectingGood(vaultDB).listBoxes(scriptScope)
    expect(summaries.map((summary) => summary.boxlabel)).to.deep.equal(['مفتاح العمل'])
    await TH.expectingGood(vaultDB).delBox(scriptScope, 'مفتاح العمل', TH.deleting('rev-one'))
    vaultDB.subscribe(scriptScope, unheard)()
    await TH.expectingGood(vaultDB).delVault(scriptScope, TH.thisVault)
    expect(await TH.expectingGood(vaultDB).getVaultProps(scriptScope)).to.be.null
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
    it(`refuses ${blurb} as bad_label as a boxlabel and in a scope, and as bad_record in a record, before its adapter's half sees it`, async () => {
      const vaultDB = new MapVaultDB()
      await TH.expectBad(vaultDB.getVaultProps({ ...TH.scopeOf('u1'), vaultlabel: candidate }), 'bad_label')
      await TH.expectBad(vaultDB.getBox(TH.scopeOf('u1'), candidate), 'bad_label')
      await TH.expectBad(vaultDB.putBox({ ...TH.scopeOf('u1'), applabel: candidate }, TH.boxOf('anthropic', 'one'), TH.noBoxYet), 'bad_label')
      await TH.expectBad(vaultDB.putBox(TH.scopeOf('u1'), TH.boxOf(candidate, 'one'), TH.noBoxYet), 'bad_record')
      await TH.expectBad(vaultDB.ensureVaultProps({ ...TH.vaultPropsOf('u1'), vaultlabel: candidate }), 'bad_record')
      expect(vaultDB.rows.size).to.eq(0)
    })
  }

  it("refuses, as 'bad_record', a box whose sidecar is not JSON, writing nothing", async () => {
    const vaultDB = new MapVaultDB()
    await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
    const unparsable = TH.boxOf('anthropic', 'one', { sidecar_json: '{"note":' })
    await TH.expectBad(vaultDB.putBox(TH.scopeOf('u1'), unparsable, TH.noBoxYet), 'bad_record')
    expect(await TH.expectingGood(vaultDB).getBox(TH.scopeOf('u1'), 'anthropic')).to.be.null
  })

  it("refuses, as 'corrupt_record', a stored box whose sidecar is not JSON, and lists it as damaged", async () => {
    const vaultDB = new MapVaultDB()
    await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
    vaultDB.rows.set(Ckeys.box(TH.scopeOf('u1'), 'anthropic'), TH.boxOf('anthropic', 'one', { sidecar_json: '{"note":' }))
    await TH.expectBad(vaultDB.getBox(TH.scopeOf('u1'), 'anthropic'), 'corrupt_record')
    expect(await TH.expectingGood(vaultDB).listBoxes(TH.scopeOf('u1'))).to.deep.equal([{ boxlabel: 'anthropic', damaged: true, revision_tok: 'rev-one' }])
  })

  it("lists boxes by code unit, never by a locale, so every device lists them in one order", async () => {
    const vaultDB = new MapVaultDB()
    await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
    for (const boxlabel of ['b', 'a_b', 'B', 'a1', '\u{E9}', 'z']) {
      vaultDB.rows.set(Ckeys.box(TH.scopeOf('u1'), boxlabel), TH.boxOf(boxlabel, boxlabel))
    }
    const listed = await TH.expectingGood(vaultDB).listBoxes(TH.scopeOf('u1'))
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
        const refusal = await TH.expectBad(vaultDB.getVaultProps(scope), 'bad_label')
        expect(refusal.message).to.include(said)
        expect(refusal.message).to.not.include(candidate)
        await TH.expectBad(vaultDB.ensureVaultProps({ ...TH.vaultPropsOf('u1'), ...scope }), 'bad_label')
        await TH.expectBad(vaultDB.listBoxes(scope), 'bad_label')
        await TH.expectBad(vaultDB.delVault(scope, TH.thisVault), 'bad_label')
        await TH.expectBad(vaultDB.delDamagedVault(scope), 'bad_label')
        expect(() => vaultDB.subscribe(scope, unheard)).to.throw(VaultError).with.property('refusalkind', 'bad_label')
      }
      const refusal = await TH.expectBad(vaultDB.putBox(TH.scopeOf('u1'), TH.boxOf(candidate, 'one'), TH.noBoxYet), 'bad_label')
      expect(refusal.message).to.include('boxlabel')
      await TH.expectBad(vaultDB.getBox(TH.scopeOf('u1'), candidate), 'bad_label')
      await TH.expectBad(vaultDB.delBox(TH.scopeOf('u1'), candidate, TH.deleting(null)), 'bad_label')
      expect([...vaultDB.rows]).to.deep.equal(before)
    })
  }

  it("takes a name of exactly as many bytes as it declares", async () => {
    const vaultDB = new NarrowNamesVaultDB()
    await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
    await TH.expectingGood(vaultDB).putBox(TH.scopeOf('u1'), TH.boxOf('a:b|c.de', 'one'), TH.noBoxYet)
    const box = await TH.expectingGood(vaultDB).getBox(TH.scopeOf('u1'), 'a:b|c.de')
    expect(box?.revision_tok).to.eq('rev-one')
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

describe("the abstract VaultDB, weighing a box", () => {
  it("refuses, as 'box_too_large', a box heavier with its scope than its backend holds in one record, writing nothing", async () => {
    const box = TH.boxOf('anthropic', 'one', { sidecar_json: TH.sidecarJsonOf({ note: 'n'.repeat(900) }) })
    const recordBytes = jsonBytes({ ...TH.scopeOf('u1'), ...box })
    const fits = new SmallRecordVaultDB(recordBytes)
    await TH.expectingGood(fits).ensureVaultProps(TH.vaultPropsOf('u1'))
    await TH.expectingGood(fits).putBox(TH.scopeOf('u1'), box, TH.noBoxYet)
    const tight = new SmallRecordVaultDB(recordBytes - 1)
    await TH.expectingGood(tight).ensureVaultProps(TH.vaultPropsOf('u1'))
    const err = await TH.expectBad(tight.putBox(TH.scopeOf('u1'), box, TH.noBoxYet), 'box_too_large')
    expect(err.message).to.include(String(recordBytes))
    expect(err.message).to.not.include('nnnn')
    expect(await TH.expectingGood(tight).getBox(TH.scopeOf('u1'), 'anthropic')).to.be.null
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
// --

// == [Logger and watching]: logger, subscriber's listener, watchTrouble, listBoxRecords

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
    await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
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
    await TH.expectingGood(vaultDB).ensureVaultProps(TH.vaultPropsOf('u1'))
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
      expect(() => new RingingVaultDB({ logger: logger as unknown as VaultDBOpts['logger'] })).to.throw(VaultError).with.property('refusalkind', 'bad_option')
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
  it("lists each box as stored, its two ciphered fields left out and format kept, damaged ones too, unchecked", async () => {
    const vaultDB = new MapVaultDB()
    const scope = TH.scopeOf('u1')
    vaultDB.rows.set(Ckeys.box(scope, 'anthropic'), TH.boxOf('anthropic', 'one'))
    vaultDB.rows.set(Ckeys.box(scope, 'openai'), { ...TH.boxOf('openai', 'two'), written_at: 'later' })
    vaultDB.rows.set(Ckeys.box(scope, 'mistral'), 'not a box')
    const records = await TH.expectingGood(vaultDB).listBoxRecords(scope)
    expect(records).to.have.deep.members([
      omit(TH.boxOf('anthropic', 'one'), ['box_key_wrapped', 'whisper_ciphered']),
      omit({ ...TH.boxOf('openai', 'two'), written_at: 'later' }, ['box_key_wrapped', 'whisper_ciphered']),
      'not a box',
    ])
  })

  it("leaves out an entry filed under a name below the floor, which no verb could reach", async () => {
    const vaultDB = new MapVaultDB()
    vaultDB.rows.set(Ckeys.box(TH.scopeOf('u1'), 'tab\there'), TH.boxOf('tab\there', 'one'))
    expect(await TH.expectingGood(vaultDB).listBoxRecords(TH.scopeOf('u1'))).to.deep.equal([])
  })

  it("refuses as listBoxes does: a scope below the floor as bad_label, the adapter's failure as storage_unavailable", async () => {
    class DownVaultDB extends MapVaultDB {
      protected override doListBoxes(): Promise<StoredBox[]> { return Promise.reject(new Error('connection reset')) }
    }
    await TH.expectBad(new MapVaultDB().listBoxRecords({ ...TH.scopeOf('u1'), vaultlabel: 'tab\there' }), 'bad_label')
    await TH.expectBad(new DownVaultDB().listBoxRecords(TH.scopeOf('u1')), 'storage_unavailable')
  })
})
// --


