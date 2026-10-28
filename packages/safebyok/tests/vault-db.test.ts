import { omit } from 'es-toolkit'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { memoryStore } from '../src/string-store'
import { VaultDB, jsonBytes, splitStoredBoxes, type VaultDBOpts, type WatchTrouble } from '../src/vault-db'
import type { VaultRecordExpectation, VaultDelExpectation, BoxGetExpectation, BoxExpectation, BoxDelExpectation, StoredBox, StoredVault } from '../src/shapes/vault-db'
import { localVaultDB } from '../src/local-vault-db'
import { VaultError, isVaultError } from '../src/errors'
import { type Outcome, bad, good, valOf } from '../src/outcome'
import * as Refusals from '../src/refusals'
import { DefaultLogger, parseLogger, type VaultLogger } from '../src/logger'
import { type BoxRecord, BoxSparse } from '../src/shapes/box'
import type { VaultScope } from '../src/shapes/scopes'
import type { VaultRecord, VaultDraft } from '../src/shapes/vault'
import * as Scopepath from '../src/scopepath'
import * as Expectations from '../src/expectations'
import { MaxUserIdChars } from '../src/checks/primitives'
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

  private storedVaultRecord(scope: VaultScope) { return this.rows.get(Scopepath.vault(scope)) }

  protected doGetVault(scope: VaultScope): Promise<StoredVault> {
    return Promise.resolve({ vault: this.rows.get(Scopepath.vault(scope)) ?? null, ...splitStoredBoxes(this.storedBoxes(scope)) })
  }

  protected doEnsureVault(draft: VaultDraft): Promise<StoredVault> {
    const life = Expectations.newLifeOf(draft, this.storedVaultRecord(draft))
    if (life) { this.rows.set(Scopepath.vault(draft), life) }
    return Promise.resolve({ vault: this.rows.get(Scopepath.vault(draft)), ...splitStoredBoxes(this.storedBoxes(draft)) })
  }

  protected doPutVaultRecord(vaultRecord: VaultRecord, expected: VaultRecordExpectation) {
    const stored = this.storedVaultRecord(vaultRecord)
    const missed = Expectations.vaultRecordRefusalOf(stored, expected)
    if (missed) { return Promise.reject(missed) }
    this.rows.set(Scopepath.vault(vaultRecord), Expectations.vaultRecordPutOf(vaultRecord, stored))
    return Promise.resolve(this.rows.get(Scopepath.vault(vaultRecord)))
  }

  protected doGetBox(scope: VaultScope, boxlabel: string, expected: BoxGetExpectation) {
    if (! Expectations.vaultMeets(this.storedVaultRecord(scope), expected)) { return Promise.reject(Refusals.vaultMismatch()) }
    return Promise.resolve(this.rows.get(Scopepath.box({ ...scope, boxlabel })) ?? null)
  }

  /** Every row under `scope`'s box prefix, under the text after it, unchecked: as a backend keeping a boxlabel column hands up whatever it holds. */
  private storedBoxes(scope: VaultScope): StoredBox[] {
    const prefix = Scopepath.withinVaultScopepathPrefix(scope)
    const isWithinVault = Scopepath.withinVaultScopepathPred(scope)
    return [...this.rows].filter(([ckey]) => isWithinVault(ckey)).map(([ckey, row]) => ({ boxlabel: ckey.slice(prefix.length), box: row }))
  }

  protected doPutBox(scope: VaultScope, expected: BoxExpectation, box: BoxRecord) {
    const storedBox = this.rows.get(Scopepath.box({ ...scope, boxlabel: box.boxlabel })) as BoxRecord | undefined
    const storedVaultRecord = this.storedVaultRecord(scope)
    const missed = Expectations.boxRefusalOf(storedVaultRecord, storedBox, expected)
    if (missed) {
      return Promise.reject(missed)
    }
    if (storedBox === undefined && this.boxCount(scope) >= this.maxBoxes) {
      return Promise.reject(Refusals.vaultFull(this.capacityOf(scope)))
    }
    this.rows.set(Scopepath.box({ ...scope, boxlabel: box.boxlabel }), box)
    return Promise.resolve(this.rows.get(Scopepath.box({ ...scope, boxlabel: box.boxlabel })))
  }

  /** How many boxes `scope` holds: counted through the ckeys, never copying the rows. */
  private boxCount(scope: VaultScope): number {
    const isBox = Scopepath.withinVaultScopepathPred(scope)
    let held = 0
    for (const ckey of this.rows.keys()) {
      if (isBox(ckey)) { held += 1 }
    }
    return held
  }

  protected doGetCapacity(scope: VaultScope): Promise<unknown> { return Promise.resolve(this.capacityOf(scope)) }

  /** How full `scope` is: its boxes counted, each weighed as its row's JSON. */
  private capacityOf(scope: VaultScope) {
    const isBox = Scopepath.withinVaultScopepathPred(scope)
    const rows = [...this.rows].filter(([ckey]) => isBox(ckey)).map(([_ckey, row]) => row)
    const bytesUsed = rows.reduce<number>((sum, row) => sum + new TextEncoder().encode(JSON.stringify(row)).length, 0)
    return { boxes: { used: rows.length, max: this.maxBoxes }, bytes: { used: bytesUsed, max: this.maxVaultBytes } }
  }

  protected doDelBox(scope: VaultScope, boxlabel: string, expected: BoxDelExpectation): Promise<unknown> {
    if (! Expectations.vaultMeets(this.storedVaultRecord(scope), expected)) { return Promise.resolve(null) }
    const deletion = Expectations.deletionOf(this.rows.get(Scopepath.box({ ...scope, boxlabel })), expected)
    this.rows.delete(Scopepath.box({ ...scope, boxlabel }))
    return Promise.resolve(deletion)
  }

  protected doDelVault(scope: VaultScope, expected: VaultDelExpectation): Promise<unknown> {
    const tombstone = Expectations.tombstoneOf(this.storedVaultRecord(scope), scope, expected)
    if (tombstone === null) { return Promise.resolve(null) }
    const doomed = [...this.rows].map(([ckey]) => ckey).filter(Scopepath.withinVaultScopepathPred(scope))
    for (const ckey of doomed) { this.rows.delete(ckey) }
    this.rows.set(Scopepath.vault(scope), tombstone)
    return Promise.resolve(tombstone)
  }
}

/**
 * A MapVaultDB in trouble: reading the vault record and subscribing fail as `failure` does; updating a
 * box rejects.
 */
class TroubledVaultDB extends MapVaultDB {
  private readonly failure: () => never

  constructor(failure: () => never) {
    super()
    this.failure = failure
  }

  protected override doGetVault(): Promise<StoredVault> { this.failure() }
  protected override doSubscribe(): () => void { this.failure() }
  protected override doPutBox(): Promise<unknown> { return Promise.reject(new Error('the backend dropped the connection')) }
}

const unheard = (): void => undefined

/** Where a row of `scope` under `boxlabel` sits, unchecked: a row a backend that never checked a name may hold, which no maker would file. */
const unsoundBoxScopepath = (scope: VaultScope, boxlabel: string): string => Scopepath.withinVaultScopepathPrefix(scope) + boxlabel

/** `u1`'s listing in `vaultDB`, each box as its boxlabel and `sound`, or the damage it is listed with, the sound first. */
const listingKindsOf = async (vaultDB: VaultDB): Promise<string[][]> => {
  const read = valOf(await vaultDB.tryGetVault(TH.scopeOf('u1')))
  return [...(read?.boxes ?? []).map((box) => [box.boxlabel, 'sound']), ...(read?.damagedBoxes ?? []).map((box) => [box.boxlabel, box.damage])]
}

/** A MapVaultDB whose every read answers `answer` as its adapter's half, as one relaying a server's answer would: what the base class checks again. */
class RelayingVaultDB extends MapVaultDB {
  readonly answer: unknown

  constructor(answer: unknown) {
    super()
    this.answer = answer
  }

  protected override doGetVault(): Promise<StoredVault> { return Promise.resolve(this.answer as StoredVault) }
}

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

  /** The logger it says things through, as it is now. */
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

/** A MapVaultDB whose `u1` scope holds a vault record, as a listing needs to read a vault. */
const withVaultRecord = () => {
  const vaultDB = new MapVaultDB()
  vaultDB.rows.set(Scopepath.vault(TH.scopeOf('u1')), TH.vaultRecordOf('u1'))
  return vaultDB
}

// The scopepaths u1's main vault is filed under, spelled out rather than computed: they are stored.
const u1VaultScopepath = 'vault^acme^u1^main'
const u1AnthropicBoxScopepath = 'box^acme^u1^main^anthropic'

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
    await TH.ensureGated(vaultDB, TH.vaultRecordOf('u1'))
    await TH.expectingGood(vaultDB).tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'one'))
    await TH.expectingGood(vaultDB).tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('openai', 'two'))
    expect(await TH.expectingGood(vaultDB).tryDelBox(TH.scopeOf('u1'), 'anthropic', TH.deleting('rev-one'))).to.deep.equal({ outcome: 'deleted' })
    expect(await TH.expectingGood(vaultDB).tryDelBox(TH.scopeOf('u1'), 'openai', TH.deleting('rev-one'))).to.deep.equal({ outcome: 'deleted_other' })
    expect(await TH.expectingGood(vaultDB).tryDelBox(TH.scopeOf('u1'), 'openai', TH.deleting('rev-two'))).to.deep.equal({ outcome: 'absent' })
  })

  it("resolves the outcome, as its example shows", async () => {
    const vaultDB = new MapVaultDB()
    const vaultRecord = TH.vaultRecordOf('u1')
    await TH.ensureGated(vaultDB, vaultRecord)
    await TH.expectingGood(vaultDB).tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'one'))
    const [listed] = await TH.boxesOf(vaultDB, TH.scopeOf('u1'))
    const { outcome } = await TH.expectingGood(vaultDB).tryDelBox(TH.scopeOf('u1'), 'anthropic', { vault_tok: vaultRecord.vault_tok, revision_tok: listed?.revision_tok ?? null })
    expect(outcome).to.eq('deleted')
  })

  it("refuses as stale, resolving nothing and removing nothing, a deletion whose adapter answers null", async () => {
    const vaultDB = new MapVaultDB()
    await TH.ensureGated(vaultDB, TH.vaultRecordOf('u1'))
    await TH.expectingGood(vaultDB).tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'one'))
    await TH.expectBad(vaultDB.tryDelBox(TH.scopeOf('u1'), 'anthropic', { vault_tok: 'vault-tok-gone', revision_tok: 'rev-one' }), 'stale_write')
    expect(vaultDB.rows.get(u1AnthropicBoxScopepath)).to.deep.equal(TH.boxOf('anthropic', 'one'))
  })

  it("keeps only the outcome of an answer carrying more, as a GraphQL client's __typename", async () => {
    const vaultDB = new MisreportingVaultDB({ outcome: 'deleted', __typename: 'SafebyokBoxDeletion' })
    await TH.ensureGated(vaultDB, TH.vaultRecordOf('u1'))
    expect(await TH.expectingGood(vaultDB).tryDelBox(TH.scopeOf('u1'), 'anthropic', TH.deleting(null))).to.deep.equal({ outcome: 'deleted' })
  })

  for (const [answer, blurb] of MisreportedCases) {
    it(`refuses as corrupt_record a landed deletion whose adapter answers ${blurb}, saying it may have landed`, async () => {
      const vaultDB = new MisreportingVaultDB(answer)
      await TH.ensureGated(vaultDB, TH.vaultRecordOf('u1'))
      await TH.expectingGood(vaultDB).tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'one'))
      const refusal = await TH.expectBad(vaultDB.tryDelBox(TH.scopeOf('u1'), 'anthropic', TH.deleting('rev-one')), 'corrupt_record')
      expect(refusal.message).to.match(/deletion landed/)
      expect(refusal.message).to.match(/cannot read back/)
      expect(isVaultError(refusal.cause, 'bad_record')).to.be.true
      expect(TH.thrownText(refusal)).to.not.include('anthropic')
      // What the adapter removed stays removed: the refusal is about its answer, not its deletion.
      expect(vaultDB.rows.has(u1AnthropicBoxScopepath)).to.be.false
    })
  }
})

/** Records an adapter may hand up from its listing, under the boxlabel each is stored under, and how each lists. */
const ListedRecordCases = [
  // sound:
  ["anthropic",  TH.boxOf('anthropic', 'one'),                               [["anthropic", 'sound']],         'a sound box among the boxes'],
  // damaged, listed apart so they can be deleted:
  ["anthropic",  TH.boxOf('other_box', 'one'),                               [["anthropic", 'damaged']],       'a record naming another boxlabel as damaged, under the one it is stored under'],
  ["anthropic",  { ...TH.boxOf('anthropic', 'one'), written_at: 'later' },   [["anthropic", 'damaged']],       'a record with a malformed time as damaged'],
  ["anthropic",  { ...TH.boxOf('anthropic', 'one'), sidecar: { when: new Date() } }, [["anthropic", 'damaged']], 'a record whose sidecar is not JSON as damaged'],
  ["anthropic",  TH.omitting(TH.boxOf('anthropic', 'one'), 'sidecar'),       [["anthropic", 'damaged']],       'a record with no sidecar as damaged'],
  ["anthropic",  { ...TH.boxOf('anthropic', 'one'), note: 'stray' },         [["anthropic", 'damaged']],       'a record holding a field this version does not know as damaged'],
  ["anthropic",  null,                                                       [["anthropic", 'damaged']],       'a null record as damaged'],
  ["anthropic",  'not a box',                                                [["anthropic", 'damaged']],       'a record that is not an object as damaged'],
  ["anthropic",  { ...TH.boxOf('anthropic', 'one'), format: 'safebyok-box-v7' }, [["anthropic", 'damaged']],   'a record in a format an earlier version wrote as damaged, never newer'],
  // a format this version does not know, which a newer one may have written:
  ["anthropic",  { ...TH.boxOf('anthropic', 'one'), format: 'safebyok-box-v9' }, [["anthropic", 'newer_format']], 'a record in a later format as newer_format'],
  ["anthropic",  { ...TH.boxOf('other_box', 'one'), format: 'safebyok-box-v9' }, [["anthropic", 'newer_format']], 'a record in a later format as newer_format, whatever boxlabel it names'],
  ["anthropic",  { ...TH.boxOf('anthropic', 'one'), format: 2 },             [["anthropic", 'newer_format']], 'a record naming a format of another type as newer_format'],
  // with a sidecar no host meant: sound, as the sidecar is never interpreted
  ["anthropic",  { ...TH.boxOf('anthropic', 'one'), sidecar: { note: 'beep\u{7}' } }, [["anthropic", 'sound']], 'a record whose sidecar holds a control character as sound: the sidecar is never interpreted'],
  // stored under a name that is no label, which no verb could reach: not listed at all
  ["Anthropic",  TH.boxOf('Anthropic', 'one'),                               [],                      'nothing for a record stored under a boxlabel that is no label, which no verb could name'],
  ["tab\there",  TH.boxOf('tab\there', 'one'),                               [],                      'nothing for a record stored under a boxlabel holding a control character'],
] as const

describe("the abstract VaultDB, around an adapter's half", () => {
  it("validates what the adapter returns: a wrong-shaped record is refused as damaged_vault, Zod's error its cause, not repaired", async () => {
    const vaultDB = new MapVaultDB()
    vaultDB.rows.set(Scopepath.vault(TH.scopeOf('u1')), { format: 'safebyok-vault-v3' })
    const refusal = await TH.expectBad(vaultDB.tryGetVault(TH.scopeOf('u1')), 'damaged_vault')
    expect(refusal).to.be.instanceOf(VaultError)
    expect(isVaultError(refusal.cause, 'bad_record')).to.be.true
    // Refused, never repaired or deleted: the record is still there for forensics.
    expect(vaultDB.rows.size).to.eq(1)
  })

  it("lists a box's sidecar as the JSON value its record holds, and nothing of its codec", async () => {
    const vaultDB = withVaultRecord()
    vaultDB.rows.set(Scopepath.box({ ...TH.scopeOf('u1'), boxlabel: 'anthropic' }), TH.boxOf('anthropic', 'one', { sidecar: { tags: ['a', null], note: 'work' } }))
    const [listed] = await TH.boxesOf(vaultDB, TH.scopeOf('u1'))
    expect(listed?.sidecar).to.deep.equal({ note: 'work', tags: ['a', null] })
    expect(listed).to.deep.equal(omit(TH.boxOf('anthropic', 'one', { sidecar: { tags: ['a', null], note: 'work' } }), ['box_key_wrapped', 'whisper_ciphered']))
  })

  for (const [boxlabel, record, expected, blurb] of ListedRecordCases) {
    it(`lists ${blurb}`, async () => {
      const vaultDB = withVaultRecord()
      vaultDB.rows.set(unsoundBoxScopepath(TH.scopeOf('u1'), boxlabel), record)
      expect(await listingKindsOf(vaultDB)).to.deep.equal(expected)
    })
  }

  it("leaves out an entry an adapter hands up without a boxlabel as text, which no verb could name", async () => {
    class UnnamingVaultDB extends MapVaultDB {
      protected override doGetVault() {
        return Promise.resolve({ vault: TH.vaultRecordOf('u1'), ...splitStoredBoxes([{ boxlabel: 42, box: TH.boxOf('anthropic', 'one') }] as unknown as StoredBox[]) })
      }
    }
    expect(await listingKindsOf(new UnnamingVaultDB())).to.deep.equal([])
  })

  it("accepts a listing projected server-side, without ciphered fields, so long as it keeps format", async () => {
    const vaultDB = withVaultRecord()
    const projected = omit(TH.boxOf('anthropic', 'one'), ['box_key_wrapped', 'whisper_ciphered'])
    vaultDB.rows.set(Scopepath.box({ ...TH.scopeOf('u1'), boxlabel: 'anthropic' }), projected)
    const summaries = await TH.boxesOf(vaultDB, TH.scopeOf('u1'))
    expect(summaries[0]?.revision_tok).to.eq('rev-one')
    vaultDB.rows.set(Scopepath.box({ ...TH.scopeOf('u1'), boxlabel: 'anthropic' }), omit(projected, ['format']))
    expect(await TH.damagedBoxesOf(vaultDB, TH.scopeOf('u1'))).to.deep.equal([{ boxlabel: 'anthropic', revision_tok: 'rev-one', damage: 'damaged' }])
  })

  const DamagedRevisionCases = [
    [{ ...TH.boxOf('anthropic', 'one'), written_at: 'later' },   "rev-one",  'keeps the revision a damaged record holds as text'],
    [{ ...TH.boxOf('anthropic', 'one'), revision_tok: 7 },       null,       'keeps none for a revision that is not text'],
    [{ ...TH.boxOf('anthropic', 'one'), revision_tok: '' },      null,       'keeps none for an empty revision'],
    ['not a box',                                                null,       'keeps none for a record that is no object'],
  ] as const

  for (const [stored, expected, blurb] of DamagedRevisionCases) {
    it(`lists a damaged box with its revision_tok: ${blurb}`, async () => {
      const vaultDB = withVaultRecord()
      vaultDB.rows.set(Scopepath.box({ ...TH.scopeOf('u1'), boxlabel: 'anthropic' }), stored)
      expect(await TH.damagedBoxesOf(vaultDB, TH.scopeOf('u1'))).to.deep.equal([{ boxlabel: 'anthropic', revision_tok: expected, damage: 'damaged' }])
    })
  }

  it("turns an adapter's own failure into kind 'storage_unavailable', keeping it as the cause", async () => {
    const outage = new Error('the backend is down')
    const vaultDB = new TroubledVaultDB(() => { throw outage })
    const refusal = await TH.expectBad(vaultDB.tryGetVault(TH.scopeOf('u1')), 'storage_unavailable')
    expect(refusal).to.be.instanceOf(VaultError)
    expect(refusal.cause).to.eq(outage)
    const putRefusal = await TH.expectBad(vaultDB.tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'one')), 'storage_unavailable')
    expect(putRefusal.message).to.match(/could not be reached/)
  })

  it("passes an adapter's own VaultError through untouched: not_permitted stays not_permitted", async () => {
    const forbidden = new VaultError('not_permitted', 'This backend does not let the signed-in user reach that vault.')
    const vaultDB = new TroubledVaultDB(() => { throw forbidden })
    const refusal = await TH.expectBad(vaultDB.tryGetVault(TH.scopeOf('u1')), 'not_permitted')
    expect(refusal).to.eq(forbidden)
  })

  it("subscribe defaults to silence: a usable unsubscribe, and no notifications", async () => {
    const vaultDB = new MapVaultDB()
    let heardCount = 0
    const unsubscribe = vaultDB.subscribe(TH.scopeOf('u1'), () => { heardCount += 1 })
    await TH.ensureGated(vaultDB, TH.vaultRecordOf('u1'))
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

  it("refuses to subscribe to a scope with a name that fails its check", () => {
    const vaultDB = new MapVaultDB()
    expect(() => vaultDB.subscribe({ ...TH.scopeOf('u1'), applabel: '' }, unheard)).to.throw(VaultError, /applabel/).with.property('refusalkind', 'bad_scope')
  })

  it("refuses an onChange that is not a function, so no later write meets it", () => {
    const vaultDB = new MapVaultDB()
    expect(() => vaultDB.subscribe(TH.scopeOf('u1'), 'not a listener' as unknown as () => void))
      .to.throw(VaultError, /Expected a function/).with.property('refusalkind', 'bad_option')
  })
})
// --

// == [Deleting a damaged vault]: RefusedWrites, withDamagedVaultRecord, deleting a vault whose record is damaged

/** A passphrase wayin missing its wrapped vaultKey, which no vault builds. */
const UnwrappedPassphrase = omit(TH.wayinOf('passphrase'), ['vault_key_wayin_wrapped'])

/** Writes a VaultDB refuses before its adapter's half sees them: none is one a vault builds. */
const RefusedWrites = [
  // the records:
  ['bad_record', (vaultDB: VaultDB) => vaultDB.tryEnsureVault({ ...TH.gatelessOf('u1'), vault_epoch: 1.5 } as unknown as VaultDraft), 'a draft with a fractional vault_epoch'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.tryPutVaultRecord({ ...TH.vaultRecordOf('u1'), gate: { passphrase: UnwrappedPassphrase, passkey: null } } as VaultRecord, { vault_tok: 'vault-tok-u1', gate_epoch: 1 }), 'vault record whose passphrase is missing its wrapped vaultKey'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.tryEnsureVault({ ...TH.gatelessOf('u1'), applabel: 'Ac\u{7}me' }),                         'a draft whose applabel holds a control character, the record at fault though only its label failed'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.tryPutVaultRecord({ ...TH.vaultRecordOf('u1'), user_id: 'u^1' }, { vault_tok: 'vault-tok-u1', gate_epoch: 1 }), 'an update of the vault record whose user_id holds a ^'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.tryEnsureVault(TH.vaultRecordOf('u1') as unknown as VaultDraft), 'a gated draft handed to ensureVault: a vault is first stored gateless'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.tryEnsureVaultRecords({ ...TH.gatelessOf('u1'), gate_epoch: 1 } as never), 'a draft at a gated epoch with no way in, handed to ensureVaultRecords'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.tryEnsureVault({ ...TH.gatelessOf('u1'), vault_epoch: 3 } as unknown as VaultDraft),           'a draft claiming a vault_epoch: the store sets the counter'],
  ['invalid_box', (vaultDB: VaultDB) => vaultDB.tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'one', { sidecar: { when: new Date() } as never })), 'a box whose sidecar no read would accept'],
  ['invalid_box', (vaultDB: VaultDB) => vaultDB.tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('key\u{D83D}', 'one')),                  'a box whose boxlabel is half of an emoji, the box at fault though only its label failed'],
  ['invalid_box', (vaultDB: VaultDB) => vaultDB.tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'one', { written_at: 1_792_022_400 })), 'a box time in epoch seconds'],
  ['invalid_box', (vaultDB: VaultDB) => vaultDB.tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, undefined as unknown as BoxRecord),               'no box at all'],
  ['invalid_box', (vaultDB: VaultDB) => vaultDB.tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, { boxlabel: 'anthropic' } as BoxRecord),           'a box holding nothing but its boxlabel'],
  // the expectations:
  ['bad_record', (vaultDB: VaultDB) => vaultDB.tryPutVaultRecord(TH.vaultRecordOf('u1'), { vault_tok: 'vault-tok-u1', gate_epoch: -1 }),         'an expectation of the vault record at a negative epoch'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.tryPutVaultRecord(TH.vaultRecordOf('u1'), undefined as unknown as VaultRecordExpectation), 'no expectation of the vault record at all'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.tryPutBox(TH.scopeOf('u1'), { vault_tok: 'vault-tok-u1' } as BoxExpectation, TH.boxOf('anthropic', 'one')), 'a box expectation missing its revision_tok'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.tryDelBox(TH.scopeOf('u1'), 'anthropic', { revision_tok: null } as BoxDelExpectation), 'a delete expectation naming no vault'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.tryDelBox(TH.scopeOf('u1'), 'anthropic', TH.thisVault as unknown as BoxDelExpectation),          'a box delete expectation missing its revision_tok'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.tryDelBox(TH.scopeOf('u1'), 'anthropic', TH.deleting('')),                                  'a box delete expectation naming an empty revision_tok'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.tryDelVault(TH.scopeOf('u1'), {} as VaultDelExpectation),                                   'a vault delete expectation naming no vault'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.tryDelVault(TH.scopeOf('u1'), { vault_tok: '', gate_epoch: 1 }),                              'a delete expectation naming an empty vault_tok'],
  ['bad_record', (vaultDB: VaultDB) => vaultDB.tryDelVault(TH.scopeOf('u1'), { vault_tok: 'vault-tok-u1' } as VaultDelExpectation),       'a delete expectation naming no gate_epoch, null being the damaged path\'s alone'],
  // the two together:
  ['bad_record', (vaultDB: VaultDB) => vaultDB.tryPutVaultRecord(TH.vaultRecordOf('u1', { vault_tok: 'vault-tok-new', gate_epoch: 2 }), { vault_tok: 'vault-tok-u1', gate_epoch: 1 }), 'an update of the vault record that would change the vault_tok'],
] as const

/** A vault in `u1`'s slot with a box, its vault record spoiled by `spoil`, and a sound neighbour beside it. */
const withDamagedVaultRecord = (spoil: (vaultRecord: VaultRecord) => unknown = (vaultRecord) => ({ ...vaultRecord, gate_epoch: 'one' })) => {
  const vaultDB = new MapVaultDB()
  vaultDB.rows.set(Scopepath.vault(TH.scopeOf('u1')), spoil(TH.vaultRecordOf('u1')))
  vaultDB.rows.set(Scopepath.box({ ...TH.scopeOf('u1'), boxlabel: 'anthropic' }), TH.boxOf('anthropic', 'one'))
  vaultDB.rows.set(Scopepath.vault(TH.scopeOf('u2')), TH.vaultRecordOf('u2'))
  vaultDB.rows.set(Scopepath.box({ ...TH.scopeOf('u2'), boxlabel: 'anthropic' }), TH.boxOf('anthropic', 'one'))
  return vaultDB
}

describe("the abstract VaultDB, deleting a vault whose vault record is damaged", () => {
  it("deletes the vault record and every box of a vault whose record fails its checks, and nothing of any other", async () => {
    const vaultDB = withDamagedVaultRecord()
    await TH.expectBad(vaultDB.tryGetVault(TH.scopeOf('u1')), 'damaged_vault')
    const tombstone = await TH.expectingGood(vaultDB).tryDelDamagedVault(TH.scopeOf('u1'))
    // Their two rows are kept, and in the place of ours a tombstone: the counter counted from zero, as damaged props show none.
    expect(vaultDB.rows.size).to.eq(3)
    const left = { format: 'safebyok-tombstone-v1', ...TH.scopeOf('u1'), vault_epoch: 2 }
    expect(tombstone).to.deep.equal(left)
    const stored = vaultDB.rows.get(Scopepath.vault(TH.scopeOf('u1')))
    expect(stored).to.deep.equal(left)
    const theirVaultRecord = Scopepath.vault(TH.scopeOf('u2'))
    const theirBox = Scopepath.box({ ...TH.scopeOf('u2'), boxlabel: 'anthropic' })
    expect(vaultDB.rows.has(theirVaultRecord)).to.eq(true)
    expect(vaultDB.rows.has(theirBox)).to.eq(true)
    expect(await TH.vaultRecordIn(vaultDB, TH.scopeOf('u1'))).to.be.null
  })

  it("counts vault record naming another vault than the one asked for as damaged", async () => {
    const vaultDB = new MapVaultDB()
    vaultDB.rows.set(Scopepath.vault(TH.scopeOf('u1')), TH.vaultRecordOf('u2'))
    await TH.expectingGood(vaultDB).tryDelDamagedVault(TH.scopeOf('u1'))
    expect(vaultDB.rows.size, 'a tombstone alone').to.eq(1)
  })

  it("refuses a sound stored vault record as bad_option, deleting nothing", async () => {
    const vaultDB = withDamagedVaultRecord((vaultRecord) => vaultRecord)
    const before = new Map(vaultDB.rows)
    const refusal = await TH.expectBad(vaultDB.tryDelDamagedVault(TH.scopeOf('u1')), 'bad_option')
    expect(refusal.message).to.include('del()')
    expect(vaultDB.rows).to.deep.equal(before)
  })

  it("is quiet where the scope holds no vault record", async () => {
    const vaultDB = new MapVaultDB()
    await TH.expectingGood(vaultDB).tryDelDamagedVault(TH.scopeOf('u1'))
    expect(vaultDB.rows.size).to.eq(0)
  })

  it("refuses a record too damaged to name its vault as damaged_vault, deleting nothing", async () => {
    for (const record of [{ format: 'safebyok-vault-v1' }, { vault_tok: '' }, { vault_tok: 7 }, {}, 'not even a bag']) {
      const vaultDB = withDamagedVaultRecord(() => record)
      const refusal = await TH.expectBad(vaultDB.tryDelDamagedVault(TH.scopeOf('u1')), 'damaged_vault')
      expect(refusal.message).to.include('nothing was removed')
      expect(vaultDB.rows.size).to.eq(4)
    }
  })

  const NewerRecords = [
    [{ format: 'safebyok-vault-v7' },                                                      'a format this version does not know, whatever else it holds'],
    [(vaultRecord: VaultRecord) => ({ ...vaultRecord, format: 'safebyok-vault-v7' }),         'vault record that is otherwise sound but for its format'],
    [(vaultRecord: VaultRecord) => ({ ...vaultRecord, format: 2 }),                           'a format of another type'],
  ] as const

  for (const [record, blurb] of NewerRecords) {
    it(`refuses ${blurb} as possibly newer than this version (newer_format), deleting nothing`, async () => {
      const vaultDB = withDamagedVaultRecord((vaultRecord) => (typeof record === 'function' ? record(vaultRecord) : { ...vaultRecord, ...record }))
      const refusal = await TH.expectBad(vaultDB.tryDelDamagedVault(TH.scopeOf('u1')), 'newer_format')
      expect(refusal.message).to.include('newer version')
      expect(refusal.message).to.include('left as it is')
      await TH.expectBad(vaultDB.tryGetVault(TH.scopeOf('u1')), 'newer_format')
      expect(vaultDB.rows.size).to.eq(4)
    })
  }

  it("still deletes a vault record that fails for anything it can only take for damage: a known format, whatever its ways in hold", async () => {
    const spoilers = [
      (vaultRecord: VaultRecord) => ({ ...vaultRecord, gate: TH.gateOf('u1', { passphrase: { ...TH.gateOf('u1').passphrase, salt_b64: 7 as never } }), registered_at: 'later' }),
      (vaultRecord: VaultRecord) => ({ ...vaultRecord, gate: TH.gateOf('u1', { passkey: { ...TH.passkeyWayinOf('laptop'), wayinkind: 'smartcard' as never } }) }),
    ]
    for (const spoil of spoilers) {
      const vaultDB = withDamagedVaultRecord(spoil)
      await TH.expectingGood(vaultDB).tryDelDamagedVault(TH.scopeOf('u1'))
      expect(vaultDB.rows.size).to.eq(3)
    }
  })

  it("deletes a vault record in a format an earlier version wrote, which is older, never newer", async () => {
    const { gate: { passphrase }, ...vaultRecordWithoutSlots } = TH.vaultRecordOf('u1')
    const olders = [
      (vaultRecord: VaultRecord) => ({ ...vaultRecord, format: 'safebyok-vault-v1' }),
      (vaultRecord: VaultRecord) => ({ ...vaultRecord, format: 'safebyok-vault-v5', vault_key_epoch: 1 }),
      () => ({ ...vaultRecordWithoutSlots, format: 'safebyok-vault-v4', wayins: [{ ...passphrase, wayin_id: 'wayin-passphrase', wayinlabel: 'passphrase' }] }),
    ]
    for (const older of olders) {
      const vaultDB = withDamagedVaultRecord(older)
      await TH.expectingGood(vaultDB).tryDelDamagedVault(TH.scopeOf('u1'))
      expect(vaultDB.rows.size).to.eq(3)
    }
  })

  it("aims the deletion at the vault_tok it read, so a vault made anew meanwhile survives as stale_write", async () => {
    class ReplacedVaultDB extends MapVaultDB {
      protected override doDelVault(): Promise<unknown> { return Promise.resolve(null) }
    }
    const vaultDB = new ReplacedVaultDB()
    vaultDB.rows.set(Scopepath.vault(TH.scopeOf('u1')), { ...TH.vaultRecordOf('u1'), gate_epoch: 'one' })
    await TH.expectBad(vaultDB.tryDelDamagedVault(TH.scopeOf('u1')), 'stale_write')
  })

  it("hands delVault the vault_tok the damaged record carries, and no gate_epoch: it shows none to name", async () => {
    const asked: VaultDelExpectation[] = []
    class SpyingVaultDB extends MapVaultDB {
      protected override doDelVault(scope: VaultScope, expected: VaultDelExpectation): Promise<unknown> {
        asked.push(expected)
        return super.doDelVault(scope, expected)
      }
    }
    const vaultDB = new SpyingVaultDB()
    vaultDB.rows.set(Scopepath.vault(TH.scopeOf('u1')), { ...TH.vaultRecordOf('u1'), gate_epoch: 'one' })
    await TH.expectingGood(vaultDB).tryDelDamagedVault(TH.scopeOf('u1'))
    expect(asked).to.deep.equal([{ vault_tok: TH.vaultRecordOf('u1').vault_tok, gate_epoch: null }])
  })

  it("refuses as damaged_vault, deleting nothing, an adapter that validates on the way up and so never hands the record over", async () => {
    class CheckedVaultDB extends MapVaultDB {
      protected override doGetVault(): Promise<StoredVault> {
        return Promise.reject(new VaultError('damaged_vault', 'did not read back'))
      }
    }
    const vaultDB = new CheckedVaultDB()
    vaultDB.rows.set(Scopepath.vault(TH.scopeOf('u1')), { ...TH.vaultRecordOf('u1'), gate_epoch: 'one' })
    const refusal = await TH.expectBad(vaultDB.tryDelDamagedVault(TH.scopeOf('u1')), 'damaged_vault')
    expect((refusal.cause as VaultError).refusalkind).to.eq('damaged_vault')
    expect(refusal.message).to.include('nothing was removed')
    expect(vaultDB.rows.size).to.eq(1)
  })

  it("wraps what the adapter throws as storage_unavailable, and checks the scope first", async () => {
    class DownVaultDB extends MapVaultDB {
      protected override doGetVault(): Promise<StoredVault> { return Promise.reject(new Error('connection reset')) }
    }
    await TH.expectBad(new DownVaultDB().tryDelDamagedVault(TH.scopeOf('u1')), 'storage_unavailable')
    await TH.expectBad(new MapVaultDB().tryDelDamagedVault({ ...TH.scopeOf('u1'), applabel: '' }), 'bad_scope')
  })

  it("refuses as corrupt_record, deleting nothing, an adapter whose read answers no object, as getVault does", async () => {
    const refusal = await TH.expectBad(new RelayingVaultDB(null).tryDelDamagedVault(TH.scopeOf('u1')), 'corrupt_record')
    expect(refusal.message).to.match(/Storage answered a vault read in a shape this package does not know/)
    await TH.expectBad(new RelayingVaultDB(null).tryGetVault(TH.scopeOf('u1')), 'corrupt_record')
  })
})
// --

// == [Answers from the adapter]: on the way in, MisansweringVaultDB, box write, ForgetfulVaultDB, by what threw, listing

/** Box read expectations a VaultDB refuses before its adapter's half sees them: none is one a vault builds. */
const MalformedReadExpectations = [
  [undefined,                                 'no expectation at all'],
  [{},                                        'an expectation naming no vault'],
  [{ vault_tok: '' },                         'an expectation naming an empty vault_tok'],
  [{ vault_tok: 42 },                         'a vault_tok that is no string'],
] as const

describe("the abstract VaultDB, on the way in", () => {
  for (const [kind, write, blurb] of RefusedWrites) {
    it(`refuses ${blurb} with kind '${kind}', and storage sees nothing`, async () => {
      const vaultDB = new MapVaultDB()
      vaultDB.rows.set(Scopepath.vault(TH.scopeOf('u1')), TH.vaultRecordOf('u1'))
      const before = [...vaultDB.rows]
      const refusal = await TH.expectBad(write(vaultDB), kind)
      expect(refusal).to.be.instanceOf(VaultError)
      expect([...vaultDB.rows]).to.deep.equal(before)
    })
  }

  for (const [expected, blurb] of MalformedReadExpectations) {
    it(`refuses a box read with ${blurb} as 'bad_record', saying nothing was read, before storage sees it`, async () => {
      const vaultDB = new MapVaultDB()
      vaultDB.rows.set(u1VaultScopepath, TH.vaultRecordOf('u1'))
      vaultDB.rows.set(u1AnthropicBoxScopepath, TH.boxOf('anthropic', 'one'))
      const doGetBox = vi.spyOn(vaultDB as unknown as { doGetBox: () => unknown }, 'doGetBox')
      const refusal = await TH.expectBad(vaultDB.tryGetBox(TH.scopeOf('u1'), 'anthropic', expected as unknown as BoxGetExpectation), 'bad_record')
      expect(refusal.message).to.match(/^Nothing was read: that box read expectation/)
      expect(doGetBox).not.toHaveBeenCalled()
    })
  }

  it("leads a refused delete's message with nothing removed, and a refused write's with nothing written", async () => {
    const vaultDB = new MapVaultDB()
    const delBox = await TH.expectBad(vaultDB.tryDelBox(TH.scopeOf('u1'), 'anthropic', TH.deleting('')), 'bad_record')
    const delVault = await TH.expectBad(vaultDB.tryDelVault(TH.scopeOf('u1'), { vault_tok: '', gate_epoch: 1 }), 'bad_record')
    const putBox = await TH.expectBad(vaultDB.tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'one', { revision_tok: '' })), 'invalid_box')
    const fetchOrCreate = await TH.expectBad(vaultDB.tryEnsureVault({ ...TH.gatelessOf('u1'), gate_epoch: 1 } as never), 'bad_record')
    expect(delBox.message).to.match(/^Nothing was removed: that delete expectation/)
    expect(delVault.message).to.match(/^Nothing was removed: that delete expectation/)
    expect(putBox.message).to.match(/^Nothing was written: that box /)
    expect(fetchOrCreate.message).to.match(/^Nothing was written: that novel vault record draft /)
  })

  it("never quotes a record it refuses", async () => {
    const vaultDB = new MapVaultDB()
    const sneaky = TH.boxOf('anthropic', 'one', { whisper_ciphered: TH.fakeCiphered('SUPERSECRET'), revision_tok: '' })
    const refusal = await TH.expectBad(vaultDB.tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, sneaky), 'invalid_box')
    expect(refusal.message).to.not.include('SUPERSECRET')
    expect(refusal.message).to.not.include('anthropic')
  })

  it("hands its adapter only a record as this package writes it: one holding a field it does not know is refused 'bad_record', its adapter handed nothing", async () => {
    const vaultDB = new MapVaultDB()
    const refusal = await TH.expectBad(vaultDB.tryEnsureVault({ ...TH.gatelessOf('u1'), stray_field: 'x' } as VaultDraft), 'bad_record')
    expect((refusal.cause as VaultError).message).to.match(/^There is a field it does not take \(its name is not repeated\): it takes only format, applabel, /)
    expect(vaultDB.rows.size).to.eq(0)
  })

  it("lets a vault's own writes through untouched: a box with an empty sidecar, a box replaced, a deletion", async () => {
    const vaultDB = new MapVaultDB()
    await TH.ensureGated(vaultDB, TH.vaultRecordOf('u1'))
    const emptied = TH.boxOf('anthropic', 'one', { sidecar: {} })
    await TH.expectingGood(vaultDB).tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, emptied)
    expect(vaultDB.rows.get(u1AnthropicBoxScopepath)).to.deep.equal(emptied)
    await TH.expectingGood(vaultDB).tryPutBox(TH.scopeOf('u1'), { vault_tok: 'vault-tok-u1', revision_tok: 'rev-one' }, TH.boxOf('anthropic', 'two'))
    await TH.expectingGood(vaultDB).tryDelBox(TH.scopeOf('u1'), 'anthropic', TH.deleting('rev-two'))
    expect(await TH.boxesOf(vaultDB, TH.scopeOf('u1'))).to.have.lengthOf(0)
  })
})

/** A MapVaultDB that writes each box as it should, then hands back `handedBack` in place of what it stored. */
class MisansweringVaultDB extends MapVaultDB {
  private readonly handedBack: unknown

  constructor(handedBack: unknown) {
    super()
    this.handedBack = handedBack
  }

  protected override async doPutBox(scope: VaultScope, expected: BoxExpectation, box: BoxRecord): Promise<unknown> {
    await super.doPutBox(scope, expected, box)
    return this.handedBack
  }
}

/** What a misanswering adapter may hand back from a landed box write, and whether it fails a box's shape (Zod's error the cause) or names another box than the one written (no cause). */
const MisansweredCases = [
  [true,                                                             'shape', 'the true an older adapter answered with'],
  [undefined,                                                        'shape', 'nothing at all'],
  [omit(TH.boxOf('anthropic', 'one'), ['whisper_ciphered']),         'shape', 'a box missing a ciphered field'],
  [{ ...TH.boxOf('anthropic', 'one'), written_at: '1792022400000' }, 'shape', 'a box whose time is text'],
  [TH.boxOf('openai', 'one'),                                        'names', 'a box under another boxlabel than the one written'],
  [TH.boxOf('anthropic', 'other'),                                   'names', 'a box at another revision than the one written'],
  [null,                                                             'shape', 'the null an older adapter answered a stale write with'],
  [{ ...TH.boxOf('anthropic', 'one'), boxlabel: 'Anthropic' },       'shape', "a box whose boxlabel fails its check, never as the check's bad_scope"],
] as const

describe("the abstract VaultDB, on the way back from a box write", () => {
  it("resolves the box its adapter hands back, as storage now holds it", async () => {
    const vaultDB = new MapVaultDB()
    await TH.ensureGated(vaultDB, TH.vaultRecordOf('u1'))
    expect(await TH.expectingGood(vaultDB).tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'one'))).to.deep.equal(TH.boxOf('anthropic', 'one'))
  })

  it("refuses as stale, resolving nothing, a write whose adapter throws what Refusals.staleBox makes of the box stored", async () => {
    const vaultDB = new MapVaultDB()
    await TH.ensureGated(vaultDB, TH.vaultRecordOf('u1'))
    await TH.expectingGood(vaultDB).tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'one'))
    const refusal = await TH.expectBad(vaultDB.tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'two')), 'stale_write')
    expect(refusal.message).to.eq(Refusals.StaleBoxMessage)
    expect(vaultDB.rows.get(u1AnthropicBoxScopepath)).to.deep.equal(TH.boxOf('anthropic', 'one'))
  })

  for (const [handedBack, failing, blurb] of MisansweredCases) {
    it(`refuses as corrupt_record, never as damage, a landed write whose adapter hands back ${blurb}, saying the write may have landed`, async () => {
      const vaultDB = new MisansweringVaultDB(handedBack)
      await TH.ensureGated(vaultDB, TH.vaultRecordOf('u1'))
      const refusal = await TH.expectBad(vaultDB.tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'one')), 'corrupt_record')
      expect(refusal.message).to.match(/landed/)
      expect(refusal.message).to.match(/cannot read back/)
      expect(refusal.message).to.match(/adapter needs a developer's look/)
      // The check's bad_record is the cause where it refused the box; a box naming another one has none.
      expect(isVaultError(refusal.cause, 'bad_record') ? 'shape' : refusal.cause).to.eq(failing === 'shape' ? 'shape' : undefined)
      // What the adapter stored is kept: the refusal is about its answer, not its write.
      expect(vaultDB.rows.get(u1AnthropicBoxScopepath)).to.deep.equal(TH.boxOf('anthropic', 'one'))
    })
  }

  it("never quotes the record it refuses on the way back", async () => {
    const vaultDB = new MisansweringVaultDB({ ...TH.boxOf('anthropic', 'one', { whisper_ciphered: TH.fakeCiphered('SUPERSECRET') }), revision_tok: '' })
    await TH.ensureGated(vaultDB, TH.vaultRecordOf('u1'))
    const refusal = await TH.expectBad(vaultDB.tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'one')), 'corrupt_record')
    expect(refusal.message).to.not.include('SUPERSECRET')
    expect(refusal.message).to.not.include('anthropic')
  })
})

/** A MapVaultDB that throws `refusal` from every box write, as an adapter might, writing nothing. */
class RefusingVaultDB extends MapVaultDB {
  private readonly refusal: Error

  constructor(refusal: Error) {
    super()
    this.refusal = refusal
  }

  protected override doPutBox(): Promise<unknown> { return Promise.reject(this.refusal) }
}

/** What a stale box write's adapter may say is stored under `anthropic`, and what the refusal then carries. */
const StoredBoxCases = [
  [TH.boxOf('anthropic', 'one'),                                 TH.boxOf('anthropic', 'one'),                                       'the box as stored: the box, whole'],
  [null,                                                         null,                                                               'nothing: null'],
  [omit(TH.boxOf('anthropic', 'one'), ['box_key_wrapped', 'whisper_ciphered']), { boxlabel: 'anthropic', revision_tok: 'rev-one', damage: 'damaged' }, 'a box missing its ciphered fields: damaged, with its revision'],
  [{ ...TH.boxOf('anthropic', 'one'), written_at: 'yesterday' }, { boxlabel: 'anthropic', revision_tok: 'rev-one', damage: 'damaged' },  'a damaged box naming its revision: damaged, with that revision'],
  ['not a box',                                                  { boxlabel: 'anthropic', revision_tok: null, damage: 'damaged' },       'a damaged box naming none: damaged, with none'],
  [{ ...TH.boxOf('anthropic', 'one'), format: 'safebyok-box-v9' }, { boxlabel: 'anthropic', revision_tok: 'rev-one', damage: 'newer_format' }, 'a box in a later format: newer_format, with its revision'],
  [TH.boxOf('openai', 'one'),                                    { boxlabel: 'anthropic', revision_tok: 'rev-one', damage: 'damaged' },  'a box under another boxlabel: damaged under this one'],
  [{ ...TH.boxOf('anthropic', 'one'), boxlabel: 'Anthropic' },   { boxlabel: 'anthropic', revision_tok: 'rev-one', damage: 'damaged' },  "a box whose boxlabel fails its check: damaged under this one, never the check's bad_scope"],
] as const

describe("the abstract VaultDB, on a box write that misses", () => {
  for (const [stored, reported, blurb] of StoredBoxCases) {
    it(`reports as meta.box_stored, from a stale write whose adapter names ${blurb} (Contract: VaultDB.putBox, Does)`, async () => {
      const vaultDB = new RefusingVaultDB(Refusals.staleBox(stored))
      const refusal = await TH.expectBad(vaultDB.tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'two')), 'stale_write')
      expect(refusal.meta).to.deep.equal({ box_stored: reported })
      expect(refusal.message).to.eq(Refusals.StaleBoxMessage)
    })
  }

  it("refuses as corrupt_record a stale write whose adapter does not say what is stored, saying nothing was written and the adapter needs a look", async () => {
    const thrown = Refusals.staleDel()
    const vaultDB = new RefusingVaultDB(thrown)
    const refusal = await TH.expectBad(vaultDB.tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'two')), 'corrupt_record')
    expect(refusal.message).to.match(/nothing was written/)
    expect(refusal.message).to.match(/Refusals.staleBox/)
    expect(refusal.cause).to.eq(thrown)
  })

  it("passes vault_mismatch on as it came, a condition carrying no meta (Contract: VaultDB.putBox, Refuses)", async () => {
    const vaultDB = new MapVaultDB()
    await TH.ensureGated(vaultDB, TH.vaultRecordOf('u1', { vault_tok: 'vault-tok-reborn' }))
    const refusal = await TH.expectBad(vaultDB.tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'one')), 'vault_mismatch')
    expect(refusal.family).to.eq('condition')
    expect(refusal).to.not.have.property('meta')
    expect(vaultDB.rows.has(u1AnthropicBoxScopepath)).to.be.false
  })

  it("hands on a stale write through a VaultDB that hands its call to another, what is stored as the inner one reported it", async () => {
    const vaultDB = new ForwardingVaultDB()
    await TH.ensureGated(vaultDB.inner, TH.vaultRecordOf('u1'))
    await TH.expectingGood(vaultDB.inner).tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'one'))
    const refusal = await TH.expectBad(vaultDB.tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'two')), 'stale_write')
    expect(refusal.meta).to.deep.equal({ box_stored: TH.boxOf('anthropic', 'one') })
  })
})

/** How full a vault of 3 boxes is, as a backend keeping no limit on its bytes reports it. */
const FullCapacity = { boxes: { used: 3, max: 3 }, bytes: { used: 2048, max: Infinity } }

/** A vault_full whose capacity is no capacity, and what each case is. */
const UnsoundCapacityCases = [
  [undefined,                                                         'no capacity at all'],
  [{ boxes: { used: 3, max: 3 } },                                    'boxes but no bytes'],
  [{ ...FullCapacity, bytes: { used: -1, max: 1024 } },               'a negative count of bytes'],
  [{ ...FullCapacity, boxes: { used: '3', max: 3 } },                 'a count of boxes as text'],
  [{ ...FullCapacity, boxes: { used: 3, max: 0 } },                   'a limit of none'],
] as const

describe("the abstract VaultDB, a box write refused for room", () => {
  it("reports how full the vault is as meta.capacity, a limit it does not keep as the largest safe integer (Contract: VaultDB.putBox, Refuses)", async () => {
    const vaultDB = new RefusingVaultDB(Refusals.vaultFull(FullCapacity))
    const refusal = await TH.expectBad(vaultDB.tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'one')), 'vault_full')
    expect(refusal.meta).to.deep.equal({ capacity: { boxes: { used: 3, max: 3 }, bytes: { used: 2048, max: Number.MAX_SAFE_INTEGER } } })
    expect(refusal.message).to.match(/at most 3 in one vault/)
  })

  it("reports its own count from a capped adapter that refuses a new box, as a read of its capacity reports it", async () => {
    const vaultDB = new MapVaultDB(1)
    await TH.ensureGated(vaultDB, TH.vaultRecordOf('u1'))
    await TH.expectingGood(vaultDB).tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'one'))
    const refusal = await TH.expectBad(vaultDB.tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('openai', 'one')), 'vault_full')
    expect(refusal.meta?.capacity).to.deep.equal(await TH.expectingGood(vaultDB).tryGetCapacity(TH.scopeOf('u1')))
  })

  for (const [capacity, blurb] of UnsoundCapacityCases) {
    it(`refuses as corrupt_record a vault_full whose adapter says ${blurb}, saying nothing was written and the adapter needs a look`, async () => {
      const thrown = new VaultError('vault_full', 'This vault is full.', { meta: { capacity: capacity as never } })
      const vaultDB = new RefusingVaultDB(thrown)
      const refusal = await TH.expectBad(vaultDB.tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'one')), 'corrupt_record')
      expect(refusal.message).to.match(/nothing was written/)
      expect(refusal.message).to.match(/Refusals.vaultFull\(capacity\)/)
      expect(refusal.cause).to.eq(thrown)
    })
  }

  it("reads a box in the vault it lies in, and refuses one in a vault made anew as vault_mismatch, as getBox's example shows, its expectation as BoxGetExpectation's example builds it", async () => {
    const vaultDB = new MapVaultDB()
    const vaultRecord = await TH.ensureGated(vaultDB, TH.vaultRecordOf('u1'))
    await TH.expectingGood(vaultDB).tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'one'))
    expect(await TH.expectingGood(vaultDB).tryGetBox(TH.scopeOf('u1'), 'anthropic', { vault_tok: vaultRecord.vault_tok })).to.deep.equal(TH.boxOf('anthropic', 'one'))
    await TH.expectingGood(vaultDB).tryDelVault(TH.scopeOf('u1'), TH.thisVault)
    await TH.ensureGated(vaultDB, TH.vaultRecordOf('u1', { vault_tok: 'vault-tok-anew' }))
    const { ok, err } = await vaultDB.tryGetBox(TH.scopeOf('u1'), 'anthropic', { vault_tok: vaultRecord.vault_tok })
    expect(ok).to.be.false
    expect(err?.refusalkind).to.eq('vault_mismatch')
    expect(err?.family).to.eq('condition')
  })

  it("lands a write, and a stale one names what won, as putBox's example shows", async () => {
    const vaultDB = new MapVaultDB()
    await TH.ensureGated(vaultDB, TH.vaultRecordOf('u1'))
    const landed = await TH.expectingGood(vaultDB).tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'one'))
    const refusal = await TH.expectBad(vaultDB.tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'two')), 'stale_write')
    expect(refusal.meta?.box_stored).to.deep.equal(landed)
  })
})

/** A MapVaultDB whose capacity reading answers `answer`, as an adapter might, right or wrong. */
class CapacityAnsweringVaultDB extends MapVaultDB {
  private readonly answer: () => Promise<unknown>

  constructor(answer: () => Promise<unknown>) {
    super()
    this.answer = answer
  }

  protected override doGetCapacity(): Promise<unknown> { return this.answer() }
}

describe("the abstract VaultDB, reading how full a vault is", () => {
  it("counts the vault's boxes and weighs them as its adapter does, against the adapter's limits, as getCapacity's example shows", async () => {
    const vaultDB = new MapVaultDB(5)
    await TH.ensureGated(vaultDB, TH.vaultRecordOf('u1'))
    await TH.expectingGood(vaultDB).tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'one'))
    await TH.expectingGood(vaultDB).tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('openai', 'one'))
    const capacity = await TH.expectingGood(vaultDB).tryGetCapacity(TH.scopeOf('u1'))
    expect(capacity.boxes).to.deep.equal({ used: 2, max: 5 })
    expect(capacity.bytes.used).to.eq(jsonBytes(TH.boxOf('anthropic', 'one')) + jsonBytes(TH.boxOf('openai', 'one')))
  })

  it("answers nothing used for a scope that holds no vault", async () => {
    const capacity = await TH.expectingGood(new MapVaultDB(5)).tryGetCapacity(TH.scopeOf('u1'))
    expect(capacity).to.deep.equal({ boxes: { used: 0, max: 5 }, bytes: { used: 0, max: Number.MAX_SAFE_INTEGER } })
  })

  it("keeps a limit its adapter does not keep, Infinity, as the largest safe integer, which crosses a wire", async () => {
    const capacity = await TH.expectingGood(new MapVaultDB()).tryGetCapacity(TH.scopeOf('u1'))
    expect(capacity.boxes.max).to.eq(Number.MAX_SAFE_INTEGER)
    expect(JSON.stringify(capacity)).to.not.include('null')  // as Infinity would cross
  })

  it("refuses a scope with a name that fails its check as bad_scope, before its adapter is asked", async () => {
    const vaultDB = new CapacityAnsweringVaultDB(() => Promise.reject(new Error('never asked')))
    await TH.expectBad(vaultDB.tryGetCapacity({ ...TH.scopeOf('u1'), vaultlabel: 'a^b' }), 'bad_scope')
  })

  for (const [answer, blurb] of [[null, 'null'], ...UnsoundCapacityCases.slice(1)] as const) {
    it(`refuses as corrupt_record an adapter's answer of ${blurb}, quoting none of it`, async () => {
      const vaultDB = new CapacityAnsweringVaultDB(() => Promise.resolve(answer))
      const refusal = await TH.expectBad(vaultDB.tryGetCapacity(TH.scopeOf('u1')), 'corrupt_record')
      expect(refusal.message).to.match(/capacity/)
    })
  }

  it("says an adapter's throw as storage_unavailable, its error the cause", async () => {
    const outage = new Error('connection reset')
    const vaultDB = new CapacityAnsweringVaultDB(() => Promise.reject(outage))
    const refusal = await TH.expectBad(vaultDB.tryGetCapacity(TH.scopeOf('u1')), 'storage_unavailable')
    expect(refusal.cause).to.eq(outage)
  })
})

/**
 * A MapVaultDB written as a VaultDB that hands each call on to another and forgets to unwrap the
 * answer: each read hands back `good` of what it would answer, and each write `bad` of a stale one.
 */
class ForgetfulVaultDB extends MapVaultDB {
  protected override async doGetVault(scope: VaultScope): Promise<StoredVault> { return good(await super.doGetVault(scope)) as unknown as StoredVault }
  protected override async doGetBox(scope: VaultScope, boxlabel: string, expected: BoxGetExpectation) { return good(await super.doGetBox(scope, boxlabel, expected)) }
  protected override doPutVaultRecord(): Promise<unknown> { return Promise.resolve(bad(Refusals.staleVaultRecord(null))) }
  protected override doPutBox(): Promise<unknown> { return Promise.resolve(bad(Refusals.staleBox(null))) }
  protected override doDelBox(): Promise<unknown> { return Promise.resolve(bad(Refusals.staleDel())) }
  protected override doDelVault(): Promise<unknown> { return Promise.resolve(bad(Refusals.staleDel())) }
}

/** A MapVaultDB whose box reads and writes it hands on to `inner`, unwrapping each answer as an adapter must. */
class ForwardingVaultDB extends MapVaultDB {
  readonly inner = new MapVaultDB()

  protected override async doPutBox(scope: VaultScope, expected: BoxExpectation, box: BoxRecord) {
    return valOf(await this.inner.tryPutBox(scope, expected, box))
  }

  protected override async doGetBox(scope: VaultScope, boxlabel: string, expected: BoxGetExpectation) {
    return valOf(await this.inner.tryGetBox(scope, boxlabel, expected))
  }
}

describe("the abstract VaultDB, by what threw", () => {
  it("takes the answer of a VaultDB handing its call on, unwrapped with valOf, and its refusal thrown, as valOf's second example shows", async () => {
    const vaultDB = new ForwardingVaultDB()
    vaultDB.inner.rows.set(u1VaultScopepath, TH.vaultRecordOf('u1'))
    vaultDB.inner.rows.set(u1AnthropicBoxScopepath, TH.boxOf('anthropic', 'one'))
    expect(await TH.expectingGood(vaultDB).tryGetBox(TH.scopeOf('u1'), 'anthropic', TH.inThisVault)).to.deep.equal(TH.boxOf('anthropic', 'one'))
    vaultDB.inner.rows.set(u1AnthropicBoxScopepath, 'not a box')
    await TH.expectBad(vaultDB.tryGetBox(TH.scopeOf('u1'), 'anthropic', TH.inThisVault), 'damaged_box')
  })

  it("reaches a do* hook on a store built over a VaultDB with Object.create, prototype and all, and makes its throw storage_unavailable, as it does an instance's", async () => {
    const vaultDB = new MapVaultDB()
    vaultDB.rows.set(u1VaultScopepath, TH.vaultRecordOf('u1'))
    const built = Object.create(vaultDB, { doGetVault: { value: () => Promise.reject(new Error('connection reset')) } }) as VaultDB
    const refusal = await TH.expectBad(built.tryGetVault(TH.scopeOf('u1')), 'storage_unavailable')
    expect((refusal.cause as Error).message).to.eq('connection reset')
    const ofInstance = await vaultDB.getCapacity(TH.scopeOf('u1'))
    expect(await TH.expectingGood(built).tryGetCapacity(TH.scopeOf('u1'))).to.deep.equal(ofInstance)
  })

  it("refuses a read answered with an Outcome still wrapped as an answer in another shape, never reading it as a record: corrupt_record, or damaged_box for a box", async () => {
    const vaultDB = new ForgetfulVaultDB()
    vaultDB.rows.set(u1VaultScopepath, TH.vaultRecordOf('u1'))
    vaultDB.rows.set(u1AnthropicBoxScopepath, TH.boxOf('anthropic', 'one'))
    const refusal = await TH.expectBad(vaultDB.tryGetVault(TH.scopeOf('u1')), 'corrupt_record')
    expect(refusal.message).to.match(/answered a vault read in a shape this package does not know/)
    await TH.expectBad(vaultDB.tryGetBox(TH.scopeOf('u1'), 'anthropic', TH.inThisVault), 'damaged_box')
  })

  it("refuses a write answered with a refusal still wrapped, which reads as true, as corrupt_record, saying it may have landed rather than taking it as landed", async () => {
    const vaultDB = new ForgetfulVaultDB()
    vaultDB.rows.set(u1VaultScopepath, TH.vaultRecordOf('u1'))
    const expected = { vault_tok: 'vault-tok-u1', gate_epoch: 1 }
    const refusals = [
      await TH.expectBad(vaultDB.tryPutVaultRecord({ ...TH.vaultRecordOf('u1'), gate_epoch: 2 }, expected), 'corrupt_record'),
      await TH.expectBad(vaultDB.tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'one')), 'corrupt_record'),
      await TH.expectBad(vaultDB.tryDelBox(TH.scopeOf('u1'), 'anthropic', TH.deleting('rev-one')), 'corrupt_record'),
      await TH.expectBad(vaultDB.tryDelVault(TH.scopeOf('u1'), TH.thisVault), 'corrupt_record'),
    ]
    for (const refusal of refusals) { expect(refusal.message).to.match(/whether it did is not known/) }
  })

  it("says a throw in its own code, not the adapter's, as 'unexpected_error', never as storage_unavailable, which a host would retry", async () => {
    const vaultDB = new MapVaultDB()
    const thrown = new TypeError('the scope fell over')
    const scope = { ...TH.scopeOf('u1'), get vaultlabel(): string { throw thrown } }
    const refusal = await TH.expectBad(vaultDB.tryGetVault(scope), 'unexpected_error')
    expect(refusal.family).to.eq('misuse')
    expect(refusal.cause).to.eq(thrown)
  })

  it("still says the adapter's own throw as storage_unavailable, whatever it threw: a TypeError is how fetch says the network failed", async () => {
    const networkDown = new TypeError('Failed to fetch')
    const vaultDB = new TroubledVaultDB(() => { throw networkDown })
    const refusal = await TH.expectBad(vaultDB.tryGetVault(TH.scopeOf('u1')), 'storage_unavailable')
    expect(refusal.cause).to.eq(networkDown)
  })
})

/** A sound box's listing entry: its record but the two ciphered fields. */
const sparseOf = (boxlabel: string, tag: string): BoxSparse => BoxSparse.parse(omit(TH.boxOf(boxlabel, tag), ['box_key_wrapped', 'whisper_ciphered']))

describe("splitStoredBoxes", () => {
  it("splits the rows an adapter read into the sound and the damaged, each sorted by boxlabel, as its example hands them up", () => {
    const rows: StoredBox[] = [
      { boxlabel: 'openai',    box: TH.boxOf('openai', 'two') },
      { boxlabel: 'mistral',   box: 'not a box' },
      { boxlabel: 'anthropic', box: omit(TH.boxOf('anthropic', 'one'), ['box_key_wrapped', 'whisper_ciphered']) },
      { boxlabel: 'cohere',    box: { ...TH.boxOf('cohere', 'four'), format: 'safebyok-box-v9' } },
      { boxlabel: 'Bad Label', box: TH.boxOf('Bad Label', 'five') },
    ]
    expect(splitStoredBoxes(rows)).to.deep.equal({
      boxes:        [sparseOf('anthropic', 'one'), sparseOf('openai', 'two')],
      damagedBoxes: [{ boxlabel: 'cohere', revision_tok: 'rev-four', damage: 'newer_format' }, { boxlabel: 'mistral', revision_tok: null, damage: 'damaged' }],
    })
  })

  it("lists a record naming another boxlabel than its row's as damaged under the row's, and freezes each entry", () => {
    const { boxes, damagedBoxes } = splitStoredBoxes([{ boxlabel: 'anthropic', box: TH.boxOf('openai', 'one') }, { boxlabel: 'openai', box: TH.boxOf('openai', 'two') }])
    expect(damagedBoxes).to.deep.equal([{ boxlabel: 'anthropic', revision_tok: 'rev-one', damage: 'damaged' }])
    expect([boxes[0], boxes[0]?.sidecar, damagedBoxes[0]].every((part) => Object.isFrozen(part))).to.be.true
  })
})

/** A RelayingVaultDB answering u1's vault record, and an empty listing but for what `listing` says. */
const relayed = (listing: object) => new RelayingVaultDB({ vault: TH.vaultRecordOf('u1'), boxes: [], damagedBoxes: [], ...listing })

describe("the abstract VaultDB, checking the listing an adapter answers", () => {

  it("judges again each sound box an adapter lists, listing one that fails its check as damaged under its own boxlabel", async () => {
    const vaultDB = relayed({ boxes: [sparseOf('openai', 'two'), { ...sparseOf('anthropic', 'one'), written_at: 'later' }, { ...sparseOf('cohere', 'three'), format: 'safebyok-box-v9' }] })
    expect(await listingKindsOf(vaultDB)).to.deep.equal([['openai', 'sound'], ['anthropic', 'damaged'], ['cohere', 'newer_format']])
  })

  it("takes the box whole or projected, listing its sparse fields alone", async () => {
    const vaultDB = relayed({ boxes: [TH.boxOf('anthropic', 'one')] })
    expect(await TH.boxesOf(vaultDB, TH.scopeOf('u1'))).to.deep.equal([sparseOf('anthropic', 'one')])
  })

  it("takes an adapter's word that a box is damaged, though a record of that name would read sound: the worst a lying server does is offer to delete what it could delete anyway", async () => {
    const vaultDB = relayed({ damagedBoxes: [{ boxlabel: 'anthropic', revision_tok: 'rev-one', damage: 'newer_format' }] })
    expect(await TH.damagedBoxesOf(vaultDB, TH.scopeOf('u1'))).to.deep.equal([{ boxlabel: 'anthropic', revision_tok: 'rev-one', damage: 'newer_format' }])
  })

  it("sorts each list an adapter answers out of order, by boxlabel", async () => {
    const vaultDB = relayed({
      boxes:        [sparseOf('openai', 'two'), sparseOf('anthropic', 'one')],
      damagedBoxes: [{ boxlabel: 'zeta', revision_tok: null, damage: 'damaged' }, { boxlabel: 'alpha', revision_tok: null, damage: 'damaged' }],
    })
    expect(await listingKindsOf(vaultDB)).to.deep.equal([['anthropic', 'sound'], ['openai', 'sound'], ['alpha', 'damaged'], ['zeta', 'damaged']])
  })

  const MalformedListings = [
    [{ damagedBoxes: [{ boxlabel: 'anthropic', revision_tok: null, damage: 'broken' }] },        'a damage no version names'],
    [{ damagedBoxes: [{ boxlabel: 'Anthropic', revision_tok: null, damage: 'damaged' }] },       'a damaged box whose boxlabel is no label'],
    [{ damagedBoxes: [{ boxlabel: 'anthropic', revision_tok: '', damage: 'damaged' }] },         'a damaged box naming an empty revision'],
    [{ damagedBoxes: [{ boxlabel: 'anthropic', revision_tok: null, damage: 'damaged', box_key_wrapped: 'x' }] }, 'a damaged box carrying a field it never holds'],
    [{ damagedBoxes: undefined },                                                                'no damaged boxes at all'],
    [{ boxes: 'none' },                                                                          'boxes that are no list'],
    [{ boxes: [null] },                                                                          'a sound box that is no object'],
  ] as const

  for (const [listing, blurb] of MalformedListings) {
    it(`refuses as corrupt_record an answer holding ${blurb}, quoting none of it`, async () => {
      const refusal = await TH.expectBad(relayed(listing).tryGetVault(TH.scopeOf('u1')), 'corrupt_record')
      expect(refusal.message).to.match(/Storage answered a vault read in a shape this package does not know/)
    })
  }

  it("refuses the vault record first: a damaged one refuses damaged_vault, whatever the listing beside it", async () => {
    const vaultDB = new RelayingVaultDB({ vault: { ...TH.vaultRecordOf('u1'), gate_epoch: 'one' }, boxes: 'none' })
    await TH.expectBad(vaultDB.tryGetVault(TH.scopeOf('u1')), 'damaged_vault')
  })
})

describe("the abstract VaultDB, listing", () => {
  it("lists a box whose ciphered fields are damaged, leaving getBox() to refuse it: one damaged box never costs the vault", async () => {
    const vaultDB = new MapVaultDB()
    vaultDB.rows.set(Scopepath.vault(TH.scopeOf('u1')), TH.vaultRecordOf('u1'))
    vaultDB.rows.set(Scopepath.box({ ...TH.scopeOf('u1'), boxlabel: 'anthropic' }), { ...TH.boxOf('anthropic', 'one'), whisper_ciphered: { cipher_iv_b64: '' } })
    vaultDB.rows.set(Scopepath.box({ ...TH.scopeOf('u1'), boxlabel: 'openai' }), TH.boxOf('openai', 'two'))
    expect(await listingKindsOf(vaultDB)).to.deep.equal([['openai', 'sound'], ['anthropic', 'damaged']])
    const refusal = await TH.expectBad(vaultDB.tryGetBox(TH.scopeOf('u1'), 'anthropic', TH.inThisVault), 'damaged_box')
    expect(refusal.message).to.match(/did not read back in a shape/)
  })
})

describe("the abstract VaultDB, reading a vault whole", () => {
  it("hands back the vault record checked, its sound boxes and its damaged ones apart, a row under a name that is no label left out, each sorted, all frozen", async () => {
    const vaultDB = new MapVaultDB()
    vaultDB.rows.set(Scopepath.vault(TH.scopeOf('u1')), TH.vaultRecordOf('u1'))
    vaultDB.rows.set(Scopepath.box({ ...TH.scopeOf('u1'), boxlabel: 'openai' }), TH.boxOf('openai', 'two'))
    vaultDB.rows.set(Scopepath.box({ ...TH.scopeOf('u1'), boxlabel: 'anthropic' }), { ...TH.boxOf('anthropic', 'one'), written_at: 'yesterday' })
    vaultDB.rows.set(unsoundBoxScopepath(TH.scopeOf('u1'), 'tab\there'), TH.boxOf('tab\there', 'three'))
    const read = await TH.expectingGood(vaultDB).tryGetVault(TH.scopeOf('u1'))
    expect(read).to.deep.equal({
      ...TH.vaultRecordOf('u1'),
      boxes:        [omit(TH.boxOf('openai', 'two'), ['box_key_wrapped', 'whisper_ciphered'])],
      damagedBoxes: [{ boxlabel: 'anthropic', revision_tok: 'rev-one', damage: 'damaged' }],
    })
    expect(Object.isFrozen(read)).to.be.true
    expect([read?.boxes, read?.damagedBoxes, read?.boxes[0], read?.boxes[0]?.sidecar, read?.damagedBoxes[0]].every((part) => Object.isFrozen(part))).to.be.true
  })

  it("refuses a vault record that fails its checks as damaged_vault, and one of a later format as newer_format, whatever boxes are stored beside them", async () => {
    await TH.expectBad(withDamagedVaultRecord().tryGetVault(TH.scopeOf('u1')), 'damaged_vault')
    const misnamed = await TH.expectBad(withDamagedVaultRecord((vaultRecord) => ({ ...vaultRecord, vaultlabel: 'Main' })).tryGetVault(TH.scopeOf('u1')), 'damaged_vault')
    expect(isVaultError(misnamed.cause, 'bad_record')).to.be.true
    await TH.expectBad(withDamagedVaultRecord((vaultRecord) => ({ ...vaultRecord, format: 'safebyok-vault-v7' })).tryGetVaultRecords(TH.scopeOf('u1')), 'newer_format')
  })

  it("reads no vault where no vault record is stored, boxes under the scope or not, and repairs nothing", async () => {
    const vaultDB = new MapVaultDB()
    vaultDB.rows.set(Scopepath.box({ ...TH.scopeOf('u1'), boxlabel: 'anthropic' }), TH.boxOf('anthropic', 'one'))
    expect(await TH.expectingGood(vaultDB).tryGetVault(TH.scopeOf('u1'))).to.be.null
    expect(vaultDB.rows.size).to.eq(1)
  })

  it("hands back from ensureVault the stored vault record, gated or not, and its listing", async () => {
    const vaultDB = new MapVaultDB()
    vaultDB.rows.set(Scopepath.vault(TH.scopeOf('u1')), TH.vaultRecordOf('u1'))
    vaultDB.rows.set(Scopepath.box({ ...TH.scopeOf('u1'), boxlabel: 'anthropic' }), TH.boxOf('anthropic', 'one'))
    const ensured = await TH.expectingGood(vaultDB).tryEnsureVault(TH.gatelessOf('u1', { vault_tok: 'vault-tok-late' }))
    expect(TH.recordOfRead(ensured)).to.deep.equal(TH.vaultRecordOf('u1'))
    expect(ensured.boxes.map((box) => box.boxlabel)).to.deep.equal(['anthropic'])
  })
})

/** A MapVaultDB whose every update of the vault record answers `answer`: a refusal it throws, or what it resolves. */
class StalePropsVaultDB extends MapVaultDB {
  private readonly answer: { refusal: Error } | { landed: unknown }

  constructor(answer: { refusal: Error } | { landed: unknown }) {
    super()
    this.answer = answer
  }

  protected override doPutVaultRecord(): Promise<unknown> {
    return 'refusal' in this.answer ? Promise.reject(this.answer.refusal) : Promise.resolve(this.answer.landed)
  }
}

/** What a stale update's adapter may say is stored, and the refusal and meta that then reach the caller. */
const StoredVaultRecordCases = [
  [TH.vaultRecordOf('u1', { gate_epoch: 2 }),                       'stale_write',   { vault_stored: TH.vaultRecordOf('u1', { gate_epoch: 2 }) }, 'the winning vault record: stale_write, carrying it whole'],
  [TH.gatelessOf('u1'),                                            'stale_write',   { vault_stored: TH.gatelessOf('u1') },                     'gateless vault record: stale_write, carrying it'],
  [null,                                                           'stale_write',   { vault_stored: null },                                    'none: stale_write, carrying null'],
  [{ ...TH.vaultRecordOf('u1'), gate_epoch: 'two' },                'damaged_vault', undefined,                                                       'damaged vault record: damaged_vault, as a read of it'],
  [{ ...TH.vaultRecordOf('u1'), format: 'safebyok-vault-v7' },      'newer_format',  undefined,                                                       'vault record of a later format: newer_format, as a read of it'],
  [TH.vaultRecordOf('u2'),                                          'damaged_vault', { fieldnames: ['user_id'] },                                     "another scope's vault record: damaged_vault, as a read of it, naming the field"],
  [{ ...TH.vaultRecordOf('u1'), user_id: 'u 1' },                   'damaged_vault', undefined,                                                       "vault record whose user_id fails its check: damaged_vault, never the check's bad_scope"],
] as const

describe("the abstract VaultDB, on an update of the vault record that misses", () => {
  for (const [stored, kind, meta, blurb] of StoredVaultRecordCases) {
    it(`refuses an update whose adapter names as stored ${blurb}`, async () => {
      const vaultDB = new StalePropsVaultDB({ refusal: Refusals.staleVaultRecord(stored) })
      const refusal = await TH.expectBad(vaultDB.tryPutVaultRecord(TH.vaultRecordOf('u1', { gate_epoch: 2 }), { vault_tok: 'vault-tok-u1', gate_epoch: 1 }), kind)
      expect(refusal.meta).to.deep.equal(meta)
    })
  }

  it("refuses as corrupt_record a stale write that does not say what is stored, saying nothing was written", async () => {
    const vaultDB = new StalePropsVaultDB({ refusal: Refusals.staleDel() })
    const refusal = await TH.expectBad(vaultDB.tryPutVaultRecord(TH.vaultRecordOf('u1', { gate_epoch: 2 }), { vault_tok: 'vault-tok-u1', gate_epoch: 1 }), 'corrupt_record')
    expect(refusal.message).to.match(/nothing was written/)
    expect(refusal.message).to.match(/Refusals.staleVaultRecord/)
  })

  const MisreportedPropsCases = [
    [true,                                                           'the true an older adapter answered with'],
    [undefined,                                                      'nothing at all'],
    [{ ...TH.vaultRecordOf('u1', { gate_epoch: 3 }) },                'vault record at another gate_epoch than the one written'],
    [{ ...TH.vaultRecordOf('u1', { gate_epoch: 2 }), vault_tok: 'vault-tok-other' }, 'vault record of another vault'],
    [{ ...TH.vaultRecordOf('u1', { gate_epoch: 2 }), applabel: 'Acme' },             "vault record whose applabel fails its check, never as the check's bad_scope"],
    [{ ...TH.vaultRecordOf('u2', { gate_epoch: 2 }), vault_tok: 'vault-tok-u1' },    'vault record of another scope'],
    [{ ...TH.vaultRecordOf('u1', { gate_epoch: 2 }), vault_epoch: 'two' },           'vault record whose counter is no number'],
  ] as const

  for (const [answer, blurb] of MisreportedPropsCases) {
    it(`refuses as corrupt_record a landed update of the vault record whose adapter answers ${blurb}, saying it may have landed and quoting none of it`, async () => {
      const vaultDB = new StalePropsVaultDB({ landed: answer })
      const refusal = await TH.expectBad(vaultDB.tryPutVaultRecord(TH.vaultRecordOf('u1', { gate_epoch: 2 }), { vault_tok: 'vault-tok-u1', gate_epoch: 1 }), 'corrupt_record')
      expect(refusal.message).to.match(/update of the vault record landed/)
      expect(refusal.message).to.match(/developer's look/)
      expect(TH.thrownText(refusal)).to.not.include('vault-tok-other')
    })
  }

  it("resolves the vault record as the adapter stored it, with the counter the store moved", async () => {
    const vaultDB = new MapVaultDB()
    await TH.ensureGated(vaultDB, TH.vaultRecordOf('u1'))
    const stored = await TH.expectingGood(vaultDB).tryPutVaultRecord(TH.vaultRecordOf('u1', { gate_epoch: 2, vault_epoch: 40 }), { vault_tok: 'vault-tok-u1', gate_epoch: 1 })
    expect(stored).to.deep.equal(TH.vaultRecordOf('u1', { gate_epoch: 2, vault_epoch: 2 }))
    expect(vaultDB.rows.get(u1VaultScopepath)).to.deep.equal(stored)
  })

  it("lands a vault's first gate over its gateless props, expecting gate_epoch 0, as its example writes over what it read", async () => {
    const vaultDB = new MapVaultDB()
    await TH.expectingGood(vaultDB).tryEnsureVault(TH.gatelessOf('u1'))
    await TH.expectingGood(vaultDB).tryPutVaultRecord(TH.vaultRecordOf('u1'), { vault_tok: 'vault-tok-u1', gate_epoch: 0 })
    const late = TH.vaultRecordOf('u1', { gate: TH.gateOf('u1', { passphrase: TH.wayinOf('late') }) })
    const refusal = await TH.expectBad(vaultDB.tryPutVaultRecord(late, { vault_tok: 'vault-tok-u1', gate_epoch: 0 }), 'stale_write')
    expect(refusal.meta?.vault_stored).to.deep.equal(TH.vaultRecordOf('u1'))
  })
})

/** A box whose ciphertext and sidecar hold text distinctive enough that finding it in a refusal means it was quoted. */
const telltaleBox = TH.boxOf('anthropic', 'one', {
  box_key_wrapped:  TH.fakeCiphered('boxkey-TELLTALE'),
  whisper_ciphered: TH.fakeCiphered('whisper-TELLTALE'),
  sidecar:          { note: 'sidecar-TELLTALE', tags: ['tag-TELLTALE'] },
})

/** Ways a stored box fails its checks: whether Zod's check refused it (its error the cause), or it names another boxlabel (no cause). */
const DamagedBoxCases = [
  [{ ...telltaleBox, registered_at: 'when-TELLTALE' },                                                   'shape', 'a malformed time'],
  [{ ...telltaleBox, sidecar: { ...telltaleBox.sidecar, when: new Date() } },                            'shape', 'a sidecar holding what JSON cannot carry'],
  [{ ...telltaleBox, whisper_ciphered: { cipher_iv_b64: 'iv-TELLTALE', ciphertext_b64: ['ct-TELLTALE'] } }, 'shape', 'a ciphered field of the wrong shape'],
  [omit(telltaleBox, ['box_key_wrapped']),                                                               'shape', 'a ciphered field missing'],
  [{ ...telltaleBox, boxlabel: 'openai' },                                                               'names', 'another boxlabel than the one it is stored under'],
  [{ ...telltaleBox, boxlabel: 'Anthropic TELLTALE' },                                                   'shape', "a boxlabel that fails its check, never as the check's bad_scope"],
] as const

describe("the abstract VaultDB, reading a damaged box", () => {
  for (const [stored, failing, blurb] of DamagedBoxCases) {
    it(`refuses a box stored with ${blurb} as damaged_box, its message, cause and JSON holding none of its ciphertext or sidecar text`, async () => {
      const vaultDB = new MapVaultDB()
      vaultDB.rows.set(u1VaultScopepath, TH.vaultRecordOf('u1'))
      vaultDB.rows.set(u1AnthropicBoxScopepath, stored)
      const refusal = await TH.expectBad(vaultDB.tryGetBox(TH.scopeOf('u1'), 'anthropic', TH.inThisVault), 'damaged_box')
      // The check's bad_record is the cause where it refused the box; a box naming another one has none.
      expect(isVaultError(refusal.cause, 'bad_record') ? 'shape' : refusal.cause).to.eq(failing === 'shape' ? 'shape' : undefined)
      const shown = [TH.thrownText(refusal), JSON.stringify(refusal), JSON.stringify(refusal.cause ?? null), String(refusal.cause)].join('\n')
      expect(shown).to.not.include('TELLTALE')
    })
  }

  it("names in its cause, in Zod's English, the field that failed, and none of its value", async () => {
    const vaultDB = new MapVaultDB()
    vaultDB.rows.set(u1VaultScopepath, TH.vaultRecordOf('u1'))
    vaultDB.rows.set(u1AnthropicBoxScopepath, { ...telltaleBox, registered_at: 'when-TELLTALE' })
    const refusal = await TH.expectBad(vaultDB.tryGetBox(TH.scopeOf('u1'), 'anthropic', TH.inThisVault), 'damaged_box')
    const cause = refusal.cause as VaultError
    expect(cause.meta?.fieldnames).to.deep.equal(['registered_at'])
    expect(cause.message).to.eq("registered_at: Invalid input: expected number, received string")
  })

  it("refuses a box stored with a field this version does not know as damaged_box: a stored record is strict", async () => {
    const vaultDB = new MapVaultDB()
    vaultDB.rows.set(u1VaultScopepath, TH.vaultRecordOf('u1'))
    vaultDB.rows.set(u1AnthropicBoxScopepath, { ...TH.boxOf('anthropic', 'one'), note: 'work account' })
    const refusal = await TH.expectBad(vaultDB.tryGetBox(TH.scopeOf('u1'), 'anthropic', TH.inThisVault), 'damaged_box')
    expect((refusal.cause as VaultError).message).to.match(/^There is a field it does not take \(its name is not repeated\): it takes only format, boxlabel, /)
  })

  it("refuses a stored vault record that fails its checks, met by ensureVault, as damaged_vault", async () => {
    const vaultDB = new MapVaultDB()
    vaultDB.rows.set(u1VaultScopepath, { ...TH.vaultRecordOf('u1'), gate_epoch: 'one' })
    const refusal = await TH.expectBad(vaultDB.tryEnsureVault(TH.gatelessOf('u1', { vault_tok: 'vault-tok-drafted' })), 'damaged_vault')
    expect(isVaultError(refusal.cause, 'bad_record')).to.be.true
  })
})
// --

// == [Names and sizes]: scriptScope, holding names, NarrowNamesVaultDB, SmallRecordVaultDB, weighing, jsonBytes

describe("the abstract VaultDB, holding names to their checks", () => {
  const NotNames = [
    ["",                                 'an empty name'],
    ["tab\there",                        'a control character'],
    ["caf\u{E9}",                        'a letter outside ASCII'],
    ["key\u{D83D}",                      'half of an emoji'],
    ["a^b",                              'a ^, which a scopepath joins names on'],
    ["Anthropic",                        'a capital letter'],
    ["n".repeat(MaxUserIdChars + 1),     'more characters than any name holds'],
  ] as const

  for (const [candidate, blurb] of NotNames) {
    it(`refuses ${blurb} as bad_scope as a boxlabel and in a scope, as bad_record in vault record and invalid_box in a box, before its adapter's half sees it`, async () => {
      const vaultDB = new MapVaultDB()
      await TH.expectBad(vaultDB.tryGetVault({ ...TH.scopeOf('u1'), vaultlabel: candidate }), 'bad_scope')
      await TH.expectBad(vaultDB.tryGetBox(TH.scopeOf('u1'), candidate, TH.inThisVault), 'bad_scope')
      await TH.expectBad(vaultDB.tryPutBox({ ...TH.scopeOf('u1'), applabel: candidate }, TH.noBoxYet, TH.boxOf('anthropic', 'one')), 'bad_scope')
      await TH.expectBad(vaultDB.tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf(candidate, 'one')), 'invalid_box')
      await TH.expectBad(vaultDB.tryEnsureVault({ ...TH.gatelessOf('u1'), vaultlabel: candidate }), 'bad_record')
      expect(vaultDB.rows.size).to.eq(0)
    })
  }

  it("refuses, as 'invalid_box', a box whose sidecar is not JSON, writing nothing", async () => {
    const vaultDB = new MapVaultDB()
    await TH.ensureGated(vaultDB, TH.vaultRecordOf('u1'))
    const unparsable = TH.boxOf('anthropic', 'one', { sidecar: { when: new Date() } as never })
    await TH.expectBad(vaultDB.tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, unparsable), 'invalid_box')
    expect(await TH.expectingGood(vaultDB).tryGetBox(TH.scopeOf('u1'), 'anthropic', TH.inThisVault)).to.be.null
  })

  it("refuses, as 'damaged_box', a stored box with no sidecar, and lists it as damaged", async () => {
    const vaultDB = new MapVaultDB()
    await TH.ensureGated(vaultDB, TH.vaultRecordOf('u1'))
    vaultDB.rows.set(Scopepath.box({ ...TH.scopeOf('u1'), boxlabel: 'anthropic' }), TH.omitting(TH.boxOf('anthropic', 'one'), 'sidecar'))
    await TH.expectBad(vaultDB.tryGetBox(TH.scopeOf('u1'), 'anthropic', TH.inThisVault), 'damaged_box')
    expect(await TH.damagedBoxesOf(vaultDB, TH.scopeOf('u1'))).to.deep.equal([{ boxlabel: 'anthropic', revision_tok: 'rev-one', damage: 'damaged' }])
  })

  it("lists boxes by code unit, never by a locale, so every device lists them in one order", async () => {
    const vaultDB = new MapVaultDB()
    await TH.ensureGated(vaultDB, TH.vaultRecordOf('u1'))
    for (const boxlabel of ['bb', 'a_b', 'ab', 'a1', 'a2z', 'zz']) {
      vaultDB.rows.set(Scopepath.box({ ...TH.scopeOf('u1'), boxlabel }), TH.boxOf(boxlabel, boxlabel))
    }
    const listed = await TH.boxesOf(vaultDB, TH.scopeOf('u1'))
    expect(listed.map((box) => box.boxlabel)).to.deep.equal(['a1', 'a2z', 'a_b', 'ab', 'bb', 'zz'])
  })
})

/** A MapVaultDB holding names of at most eight bytes. */
class NarrowNamesVaultDB extends MapVaultDB {
  override readonly maxNameBytes = 8
}

/** Names the narrow adapter refuses, each by one of its declared limits. */
const NarrowRefusals = [
  ["n".repeat(9),    '9 bytes',    'a name of nine bytes'],
  ["n".repeat(12),   '12 bytes',   'a name of twelve bytes'],
] as const

describe("the abstract VaultDB, holding names to what its adapter declares", () => {
  for (const [candidate, said, blurb] of NarrowRefusals) {
    it(`refuses ${blurb} as bad_scope, in every verb and every place a candidate goes, naming the rule and quoting nothing`, async () => {
      const vaultDB = new NarrowNamesVaultDB()
      vaultDB.rows.set(Scopepath.vault(TH.scopeOf('u1')), TH.vaultRecordOf('u1'))
      const before = [...vaultDB.rows]
      const scopes = [{ ...TH.scopeOf('u1'), applabel: candidate }, { ...TH.scopeOf('u1'), user_id: candidate }, { ...TH.scopeOf('u1'), vaultlabel: candidate }]
      for (const scope of scopes) {
        const refusal = await TH.expectBad(vaultDB.tryGetVault(scope), 'bad_scope')
        expect(refusal.message).to.include(said)
        expect(refusal.message).to.not.include(candidate)
        await TH.expectBad(vaultDB.tryEnsureVault({ ...TH.gatelessOf('u1'), ...scope }), 'bad_scope')
        await TH.expectBad(vaultDB.tryGetVault(scope), 'bad_scope')
        await TH.expectBad(vaultDB.tryDelVault(scope, TH.thisVault), 'bad_scope')
        await TH.expectBad(vaultDB.tryDelDamagedVault(scope), 'bad_scope')
        expect(() => vaultDB.subscribe(scope, unheard)).to.throw(VaultError).with.property('refusalkind', 'bad_scope')
      }
      const refusal = await TH.expectBad(vaultDB.tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf(candidate, 'one')), 'bad_scope')
      expect(refusal.message).to.include('boxlabel')
      await TH.expectBad(vaultDB.tryGetBox(TH.scopeOf('u1'), candidate, TH.inThisVault), 'bad_scope')
      await TH.expectBad(vaultDB.tryDelBox(TH.scopeOf('u1'), candidate, TH.deleting(null)), 'bad_scope')
      expect([...vaultDB.rows]).to.deep.equal(before)
    })
  }

  it("takes a name of exactly as many bytes as it declares", async () => {
    const vaultDB = new NarrowNamesVaultDB()
    await TH.ensureGated(vaultDB, TH.vaultRecordOf('u1'))
    await TH.expectingGood(vaultDB).tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('a_b_c_de', 'one'))
    const box = await TH.expectingGood(vaultDB).tryGetBox(TH.scopeOf('u1'), 'a_b_c_de', TH.inThisVault)
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
    const box = TH.boxOf('anthropic', 'one', { sidecar: { note: 'n'.repeat(900) } })
    const recordBytes = jsonBytes({ ...TH.scopeOf('u1'), ...box })
    const fits = new SmallRecordVaultDB(recordBytes)
    await TH.ensureGated(fits, TH.vaultRecordOf('u1'))
    await TH.expectingGood(fits).tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, box)
    const tight = new SmallRecordVaultDB(recordBytes - 1)
    await TH.ensureGated(tight, TH.vaultRecordOf('u1'))
    const err = await TH.expectBad(tight.tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, box), 'box_too_large')
    expect(err.message).to.include(String(recordBytes))
    expect(err.message).to.not.include('nnnn')
    expect(await TH.expectingGood(tight).tryGetBox(TH.scopeOf('u1'), 'anthropic', TH.inThisVault)).to.be.null
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
    await TH.expectingGood(vaultDB).tryEnsureVault(TH.gatelessOf('u1'))
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
    await TH.expectingGood(vaultDB).tryEnsureVault(TH.gatelessOf('u1'))
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

describe("VaultDB.getVaultRecords", () => {
  it("hands back the vault as getVault does, checked and split: what a server relays to a browser's VaultDB", async () => {
    const vaultDB = new MapVaultDB()
    const scope = TH.scopeOf('u1')
    vaultDB.rows.set(Scopepath.vault(scope), TH.vaultRecordOf('u1'))
    vaultDB.rows.set(Scopepath.box({ ...scope, boxlabel: 'anthropic' }), TH.boxOf('anthropic', 'one'))
    vaultDB.rows.set(Scopepath.box({ ...scope, boxlabel: 'openai' }), { ...TH.boxOf('openai', 'two'), written_at: 'later' })
    vaultDB.rows.set(Scopepath.box({ ...scope, boxlabel: 'mistral' }), 'not a box')
    const records = await TH.expectingGood(vaultDB).tryGetVaultRecords(scope)
    expect(records).to.deep.equal(await TH.expectingGood(vaultDB).tryGetVault(scope))
    expect(records).to.deep.equal({
      ...TH.vaultRecordOf('u1'),
      boxes:        [omit(TH.boxOf('anthropic', 'one'), ['box_key_wrapped', 'whisper_ciphered'])],
      damagedBoxes: [{ boxlabel: 'mistral', revision_tok: null, damage: 'damaged' }, { boxlabel: 'openai', revision_tok: 'rev-two', damage: 'damaged' }],
    })
  })

  it("leaves out an entry filed under a name that is no label, which no verb could reach", async () => {
    const vaultDB = new MapVaultDB()
    vaultDB.rows.set(Scopepath.vault(TH.scopeOf('u1')), TH.vaultRecordOf('u1'))
    vaultDB.rows.set(unsoundBoxScopepath(TH.scopeOf('u1'), 'tab\there'), TH.boxOf('tab\there', 'one'))
    const records = await TH.expectingGood(vaultDB).tryGetVaultRecords(TH.scopeOf('u1'))
    expect(records?.boxes).to.deep.equal([])
  })

  it("refuses as getVault does: a scope with a name that fails its check as bad_scope, the adapter's failure as storage_unavailable", async () => {
    class DownVaultDB extends MapVaultDB {
      protected override doGetVault(): Promise<StoredVault> { return Promise.reject(new Error('connection reset')) }
    }
    await TH.expectBad(new MapVaultDB().tryGetVaultRecords({ ...TH.scopeOf('u1'), vaultlabel: 'tab\there' }), 'bad_scope')
    await TH.expectBad(new DownVaultDB().tryGetVaultRecords(TH.scopeOf('u1')), 'storage_unavailable')
  })
})
// --

/** A MapVaultDB holding u1's gated vault and one box. */
const withOneBox = async () => {
  const vaultDB = new MapVaultDB()
  await TH.ensureGated(vaultDB, TH.vaultRecordOf('u1'))
  await TH.expectingGood(vaultDB).tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'one'))
  return vaultDB
}

describe("the abstract VaultDB, its try pairs", () => {
  type Scoped = (vaultDB: VaultDB, scope: VaultScope) => Promise<unknown>
  /** Each verb, what a call on a scope failing its check refuses, and its throwing and `try` forms called alike on `scope`'s vault, u1's with one box stored. */
  const TryPairCases: readonly (readonly [string, 'bad_scope' | 'bad_record', Scoped, Scoped])[] = [
    ['getVault',           'bad_scope',  (vaultDB, scope) => vaultDB.getVault(scope),                                    (vaultDB, scope) => vaultDB.tryGetVault(scope)],
    ['getVaultRecords',    'bad_scope',  (vaultDB, scope) => vaultDB.getVaultRecords(scope),                             (vaultDB, scope) => vaultDB.tryGetVaultRecords(scope)],
    ['ensureVault',        'bad_record', (vaultDB, scope) => vaultDB.ensureVault(TH.gatelessOf('u1', scope)),           (vaultDB, scope) => vaultDB.tryEnsureVault(TH.gatelessOf('u1', scope))],
    ['ensureVaultRecords', 'bad_record', (vaultDB, scope) => vaultDB.ensureVaultRecords(TH.gatelessOf('u1', scope)),    (vaultDB, scope) => vaultDB.tryEnsureVaultRecords(TH.gatelessOf('u1', scope))],
    ['getBox',             'bad_scope',  (vaultDB, scope) => vaultDB.getBox(scope, 'anthropic', TH.inThisVault),         (vaultDB, scope) => vaultDB.tryGetBox(scope, 'anthropic', TH.inThisVault)],
    ['getCapacity',        'bad_scope',  (vaultDB, scope) => vaultDB.getCapacity(scope),                                 (vaultDB, scope) => vaultDB.tryGetCapacity(scope)],
    ['delBox',             'bad_scope',  (vaultDB, scope) => vaultDB.delBox(scope, 'anthropic', TH.deleting('rev-one')), (vaultDB, scope) => vaultDB.tryDelBox(scope, 'anthropic', TH.deleting('rev-one'))],
    ['delVault',           'bad_scope',  (vaultDB, scope) => vaultDB.delVault(scope, TH.thisVault),                      (vaultDB, scope) => vaultDB.tryDelVault(scope, TH.thisVault)],
  ]

  /** A MapVaultDB whose storage, if reached, fails the test. */
  class UntouchedVaultDB extends MapVaultDB {
    protected override doGetVault(): Promise<StoredVault> { throw new Error('storage was touched') }
    protected override doEnsureVault(): Promise<StoredVault> { throw new Error('storage was touched') }
  }

  for (const [verb, kind, throwing, trying] of TryPairCases) {
    const tried = `try${verb[0]?.toUpperCase() ?? ''}${verb.slice(1)}`
    it(`${verb} resolves what ${tried} resolves as val`, async () => {
      const answered = await throwing(await withOneBox(), TH.scopeOf('u1'))
      const tried = trying(await withOneBox(), TH.scopeOf('u1')) as Promise<Outcome<unknown>>
      expect(answered).to.deep.equal(await TH.expectGood(tried))
    })

    it(`${verb} throws the refusal ${tried} resolves as err: ${kind} for a vaultlabel that fails its check, before storage is touched`, async () => {
      const below = { ...TH.scopeOf('u1'), vaultlabel: '' }
      const thrown = await TH.expectRefusal(throwing(new UntouchedVaultDB(), below), kind)
      const refused = await TH.expectBad(trying(new UntouchedVaultDB(), below) as Promise<Outcome<unknown>>, kind)
      expect(thrown.message).to.eq(refused.message)
    })
  }

  it("putBox and putVaultRecord resolve the record as stored from both forms, and throw or resolve a stale write alike, its meta kept", async () => {
    const vaultDB = new MapVaultDB()
    const vaultRecord = await TH.ensureGated(vaultDB, TH.vaultRecordOf('u1'))
    const stored = await vaultDB.putBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'one'))
    expect(stored).to.deep.equal(TH.boxOf('anthropic', 'one'))
    const thrown = await TH.expectRefusal(vaultDB.putBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'two')), 'stale_write')
    const refused = await TH.expectBad(vaultDB.tryPutBox(TH.scopeOf('u1'), TH.noBoxYet, TH.boxOf('anthropic', 'two')), 'stale_write')
    expect(thrown.meta?.box_stored).to.deep.equal(stored)
    expect(refused.meta?.box_stored).to.deep.equal(stored)
    const next = { ...vaultRecord, gate_epoch: 2 }
    expect(await vaultDB.putVaultRecord(next, { vault_tok: vaultRecord.vault_tok, gate_epoch: 1 })).to.deep.equal({ ...next, vault_epoch: 2 })
    const stale = await TH.expectRefusal(vaultDB.putVaultRecord(next, { vault_tok: vaultRecord.vault_tok, gate_epoch: 1 }), 'stale_write')
    expect(stale.meta?.vault_stored).to.deep.equal({ ...next, vault_epoch: 2 })
  })

  it("delDamagedVault resolves null for no vault from both forms, and throws or resolves bad_option alike for a sound one", async () => {
    const vaultDB = new MapVaultDB()
    expect(await vaultDB.delDamagedVault(TH.scopeOf('u1'))).to.be.null
    expect(await vaultDB.tryDelDamagedVault(TH.scopeOf('u1'))).to.deep.equal({ ok: true, val: null })
    await TH.ensureGated(vaultDB, TH.vaultRecordOf('u1'))
    await TH.expectRefusal(vaultDB.delDamagedVault(TH.scopeOf('u1')), 'bad_option')
    await TH.expectBad(vaultDB.tryDelDamagedVault(TH.scopeOf('u1')), 'bad_option')
  })

  it("throws from a throwing form an unexpected throw of the base class's own as it came, which the try form resolves as unexpected_error", async () => {
    class BuggyVaultDB extends MapVaultDB {
      constructor() {
        super()
        // A class field is defined configurable, so a getter of the bug's own can stand in its place.
        Object.defineProperty(this, 'maxNameBytes', { get: () => { throw new TypeError('a bug in the adapter class') } })
      }
    }
    await expect(new BuggyVaultDB().getVault(TH.scopeOf('u1'))).rejects.toThrow(TypeError)
    const refusal = await TH.expectBad(new BuggyVaultDB().tryGetVault(TH.scopeOf('u1')), 'unexpected_error')
    expect(refusal.cause).to.be.instanceOf(TypeError)
  })
})
