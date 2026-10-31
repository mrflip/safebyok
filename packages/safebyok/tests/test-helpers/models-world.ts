/** The test world of `src/models/`: a fake vault (the {@link BoxWorld}), a fake vaultDB store, a fake device cache, one log of every call made to them, and the builders of the records they hold.
 * Import it directly, not through `TH`: `src/models/` is not exported, and the door
 * `tests/test-helpers.ts` is published as `safebyok/testing`.
 *
 * Time. The clock is settable, and starts at {@link T0}. The Trigger a storable runs schedules its
 * launches with `setTimeout`, a delay it computes from the clock, so the world installs vitest's
 * fake timers (`fakeTimers: false` leaves real ones) and moves both together:
 * `await mw.advance(ms)` moves the clock and fires every timer that falls due; `mw.setNow(ms)`
 * only jumps the clock, firing none. Never move the clock any other way, and call `mw.dispose()`
 * in `afterEach`, as vitest's `restoreMocks` does not put real timers back: {@link useModelsWorld}
 * makes a new world before each test and disposes it after.
 *
 * The seal. The fake vault's `demandLease` refuses 'vault_locked' while it reads locked, and
 * otherwise answers a fake lease, which keeps each whisper's bytes by the stamp it was sealed under
 * and gives them back for that stamp alone: its sealed parts are the constants
 * {@link FakeBoxKeyWrapped} and {@link FakeWhisperCiphered}. A record it never sealed, as the
 * builders make, opens to a 'damaged_box', as under the real lease.
 */

import { afterEach, beforeEach, vi } from 'vitest'
import { randomId } from '../../src/crypto'
import { VaultError } from '../../src/errors'
import { type BoxPatch, Box } from '../../src/models/box'
import { BoxListing, type BoxCache, type BoxDna, type BoxLease, type BoxListingOpts, type BoxStore, type BoxWorld } from '../../src/models/box-listing'
import { type BoxRecord, type BoxSparse, type Cache, type Cacheable, type Fetched, type LockState, type Notice, type TimelyOpts, type Tombstone, BoxFormat, NeverStoredSeq } from '../../src/models/models-shapes'
import * as MSX from '../../src/models/models-shapes'
import * as Phrases from '../../src/phrases'
import * as Refusals from '../../src/refusals'
import * as CX from '../../src/shapes/scopes'
import type { Boxscope } from '../../src/shapes/scopes'
import { stableJsonify } from '../../src/stable-jsonify'
import { fakeCiphered } from './builders'

// == [Time and builders]: T0, fullBoxRecord, sparseBoxRecord, tombstoneBoxRecord

/** The clock's first reading, in epoch milliseconds: 14 November 2023. The epoch check refuses small numbers. */
export const T0 = 1_700_000_000_000

/** The vault's scope and `vault_tok` that {@link makeModelsWorld} gives its world, and the builders below give their records. */
const WorldVault = Object.freeze({ scope: Object.freeze({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' }), vault_tok: 'vault-tok-u1' })

/** A full box record that passes `boxRecord`, in {@link WorldVault}: revision 1 of the box `anthropic_api_key`, of the life `box-tok-a`, alive, registered and written at {@link T0}, its sealed parts the fake ciphered bags that open under no key. `overrides` says otherwise.
 *
 * @example fullBoxRecord({ boxlabel: 'openai_api_key', revision_seq: 3, sidecar: { note: 'work' } })
 */
export const fullBoxRecord = (overrides: Partial<BoxRecord> = {}): BoxRecord => ({
  ...WorldVault.scope,
  boxlabel:               'anthropic_api_key',
  fmt:                    BoxFormat,
  vault_tok:              WorldVault.vault_tok,
  box_tok:                'box-tok-a',
  am:                     'a',
  revision_tok:           'rev-a1',
  revision_seq:           1,
  registered_at:          T0,
  written_at:             T0,
  sidecar:                { note: 'a test box' },
  box_key_wrapped:        fakeCiphered('boxkey-a1'),
  whisper_codec:          'json_v1',
  whisper_schema_version: 1,
  whisper_ciphered:       fakeCiphered('whisper-a1'),
  ...overrides,
})

/** The sparse form of a box record: {@link fullBoxRecord} less its sidecar and sealed parts. `overrides` says otherwise; a sidecar or sealed part it names is stripped.
 *
 * @example sparseBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' })
 */
export const sparseBoxRecord = (overrides: Partial<BoxSparse> = {}): BoxSparse => MSX.boxSparse.parse({ ...fullBoxRecord(), ...overrides })

/** The tombstone of a box record: exactly its sparse form, as {@link sparseBoxRecord} makes it, with `am` 'x' for a deletion or 'd' for damage, and nothing more (no sidecar, no sealed parts). `overrides` says otherwise, but for `am`.
 * A damaged one is the form a store delivers for a stored record that fails its check: the kind's
 * sparse form, its constants (`fmt`, `whisper_codec`, `whisper_schema_version`) filled in, so that
 * `BoxListing.sparseOf` accepts it.
 *
 * @example tombstoneBoxRecord({ revision_seq: 2 })        // a deleted box
 * @example tombstoneBoxRecord({ revision_seq: 2 }, 'd')   // a damaged box, as a store hands it back
 */
export const tombstoneBoxRecord = (overrides: Partial<BoxSparse> = {}, am: 'd' | 'x' = 'x'): Tombstone<BoxSparse> => ({ ...sparseBoxRecord(overrides), am })
// --

// == [Calls and answers]: ModelsCall, Scripted, BoxAnswer

/** One call made to the world, the store or the cache, as {@link ModelsWorld.calls} logs it, in the order made. */
export type ModelsCall =
  | { verb: 'ensureTimely', opts: TimelyOpts }
  | { verb: 'takeWorld',    world: unknown }
  | { verb: 'get',          scope: Boxscope }
  | { verb: 'put',          record: BoxRecord, priorRevisionTok: string | null }
  | { verb: 'del',          scope: Boxscope, priorRevisionTok: string | null }
  | { verb: 'watch',        onNotice: (notice: Notice<BoxRecord, BoxSparse>) => Promise<void>, fullFor: () => readonly Boxscope[] }
  | { verb: 'unwatch' }
  | { verb: 'load' }
  | { verb: 'save',         cacheable: Cacheable<BoxRecord, BoxSparse> }

/** The answer of a scripted call: the answer itself, or a function of the call that makes it (or throws, or rejects). Whatever it answers is handed to the listing as it is, a malformed answer too. */
export type Scripted<CallT> = object | null | undefined | ((call: CallT) => unknown)

/** The answer of a store call: the `Answer` for boxes. */
export type BoxAnswer = Awaited<ReturnType<BoxStore['get']>>

/** A watch the listing started: the callbacks it gave, and whether it is still live. */
export type ModelsWatch = { onNotice: (notice: Notice<BoxRecord, BoxSparse>) => Promise<void>, fullFor: () => readonly Boxscope[], active: boolean }
// --

// == [The world]: FakeBoxKeyWrapped, FakeWhisperCiphered, ModelsWorldOpts, ModelsWorld, makeModelsWorld, boxListingOf

/** The sealed parts of every record the fake lease seals: constants that wrap no key and open under none. */
export const FakeBoxKeyWrapped   = fakeCiphered('fake-box-key-wrapped')
export const FakeWhisperCiphered = fakeCiphered('fake-whisper-ciphered')

/** How {@link makeModelsWorld} starts the world. */
export type ModelsWorldOpts = {
  /** The clock's first reading; {@link T0}. */
  now?:         number
  /** Whether the vault starts `unlocked`, as it does by default, or `locked`. */
  lockState?:   LockState
  /** Whether to install vitest's fake timers, in step with the clock; true. */
  fakeTimers?:  boolean
}

/** The fake vault, store and cache of one box listing, with their calls and the means to script them.
 * By default the store answers as a store that keeps what it is given: `get` answers the record
 * seeded under the boxlabel, or null; `put` keeps the record and answers it; `del` keeps and
 * answers a tombstone at the revision after the one stored, under a fresh tok (revision 0 over no
 * row); `watch` and the cache do as they are told. `put` and `del` enforce the versioned replace as
 * the `Store` doc block states it, case by case: over another tok than `priorRevisionTok` (any row, for
 * `priorRevisionTok` null), 'stale_write' carrying the row; over no row with a `priorRevisionTok`, 'stale_write'
 * carrying nothing; a put's `revision_seq` unfit for `priorRevisionTok`, or other than the row's + 1,
 * 'bad_record'. A put that lands is kept exactly as given.
 * Each `will...` queues an answer for the next call of its verb, one answer per call, then back to
 * the default.
 */
export type ModelsWorld = {
  /** The vault, as the listing is given it. */
  world:  BoxWorld
  store:  BoxStore
  cache:  BoxCache
  /** Every call made to the world, the store and the cache, in order, oldest first. A live array. */
  calls:  readonly ModelsCall[]
  /** The refusals the listing told its `onBadNews`, oldest first. A live array. */
  badnews: readonly VaultError[]
  /** The `onBadNews` {@link boxListingOf} gives the listing: it logs into `badnews`. */
  onBadNews: (news: VaultError) => void
  /** The records the store keeps, by boxlabel: the one vault's boxes. */
  stored: Map<string, Fetched<BoxRecord, BoxSparse>>
  /** The copies the cache keeps, by boxlabel; `save` replaces the one of its box. */
  cached: Map<string, Cacheable<BoxRecord, BoxSparse>>
  /** Every watch started, oldest first. A live array. */
  watches: readonly ModelsWatch[]

  /** The calls of one `verb`, narrowed to their kind. */
  callsOf<VerbT extends ModelsCall['verb']>(verb: VerbT): Extract<ModelsCall, { verb: VerbT }>[]
  /** Forget the calls logged so far, and the bad news told. */
  clearCalls(): void

  /** The clock reading. */
  now(): number
  /** Jump the clock to `ms`; no timer fires. */
  setNow(ms: number): void
  /** Move the clock on by `ms` and, under fake timers, fire every timer that falls due, each with the clock at its due time. */
  advance(ms: number): Promise<void>
  setLockState(lockState: LockState): void
  /** End the watches and put real timers back. Call it in `afterEach`. */
  dispose(): void

  /** Keep `record` in the store as the one under its boxlabel. */
  seedStore(record: Fetched<BoxRecord, BoxSparse>): void
  /** Keep `copies` in the cache as `load` will answer them. */
  seedCache(...copies: readonly Cacheable<BoxRecord, BoxSparse>[]): void

  willGet(...answers: readonly Scripted<{ scope: Boxscope }>[]): void
  willPut(...answers: readonly Scripted<{ record: BoxRecord, priorRevisionTok: string | null }>[]): void
  willDel(...answers: readonly Scripted<{ scope: Boxscope, priorRevisionTok: string | null }>[]): void
  /** The next `ensureTimely` runs `thunk` (async, so it may hold, or reject). */
  willEnsureTimely(...thunks: readonly ((opts: TimelyOpts) => Promise<void> | void)[]): void
  willLoad(...answers: readonly Scripted<undefined>[]): void
  willSave(...thunks: readonly ((cacheable: Cacheable<BoxRecord, BoxSparse>) => Promise<void> | void)[]): void

  /** The good answer about `scope`: `val` is the record stored, null for none. */
  answerOf(scope: Boxscope, val: Fetched<BoxRecord, BoxSparse> | null, world?: unknown): BoxAnswer
  /** The refused answer about `scope`. */
  refusalOf(scope: Boxscope, err: VaultError, world?: unknown): BoxAnswer
  /** The `stale_write` refusal about `scope` carrying what storage holds as `meta.box_stored`: a record, full or sparse, or null; `undefined` leaves `meta` out. */
  staleWriteOf(scope: Boxscope, stored: Fetched<BoxRecord, BoxSparse> | null | undefined, world?: unknown): BoxAnswer

  /** Push `record` through the live watch as a notice, resolving once the listing has delivered it. Throws where no watch is live. */
  notify(record: Fetched<BoxRecord, BoxSparse>, world?: unknown): Promise<void>
  /** Push `notice`, whatever it is, through the live watch: for a malformed one. */
  notifyRaw(notice: unknown): Promise<void>
  /** The scopes the live watch asks full records for now. Throws where no watch is live. */
  watchedScopes(): readonly Boxscope[]

  /** {@link fullBoxRecord}, in this world's vault. */
  fullBoxRecord(overrides?: Partial<BoxRecord>): BoxRecord
  sparseBoxRecord(overrides?: Partial<BoxSparse>): BoxSparse
  tombstoneBoxRecord(overrides?: Partial<BoxSparse>, am?: 'd' | 'x'): Tombstone<BoxSparse>
  /** The scope of the box `boxlabel` in this world's vault. */
  boxscope(boxlabel: string): Boxscope
}

/** A queue of scripted answers: `take` the next, if any. */
class Script<CallT> {
  readonly #queue: Scripted<CallT>[] = []

  push(...answers: readonly Scripted<CallT>[]): void { this.#queue.push(...answers) }

  take(call: CallT): { scripted: boolean, answer: unknown } {
    if (this.#queue.length === 0) { return { scripted: false, answer: undefined } }
    const next = this.#queue.shift()
    return { scripted: true, answer: typeof next === 'function' ? (next as (call: CallT) => unknown)(call) : next }
  }
}

/** Make a fake vault, store and cache for a {@link BoxListing}, with the calls they log and the means to script them.
 * Pass the result to {@link boxListingOf}.
 *
 * @example
 *   const mw = makeModelsWorld()
 *   afterEach(() => { mw.dispose() })
 *   mw.seedStore(mw.fullBoxRecord({ revision_seq: 2 }))
 *   const listing = boxListingOf(mw)
 *   const box = await listing.fetch(mw.boxscope('anthropic_api_key'))
 *   expect(mw.callsOf('get')).to.have.lengthOf(1)
 * @example mw.willPut((call) => mw.staleWriteOf(mw.boxscope(call.record.boxlabel), mw.fullBoxRecord({ revision_seq: 5 })))   // the next put loses a race
 */
export const makeModelsWorld = (opts: ModelsWorldOpts = {}): ModelsWorld => {
  const { fakeTimers = true } = opts
  // The clock under real timers. Under fake ones the clock is the faked `Date`, which moves to each timer's due time as it fires.
  let now = opts.now ?? T0
  const clockNow = (): number => (fakeTimers ? Date.now() : now)
  let lockState: LockState = opts.lockState ?? 'unlocked'
  if (fakeTimers) { vi.useFakeTimers({ now }) }

  const calls: ModelsCall[] = []
  const badnews: VaultError[] = []
  const watches: ModelsWatch[] = []
  const stored = new Map<string, Fetched<BoxRecord, BoxSparse>>()
  const cached = new Map<string, Cacheable<BoxRecord, BoxSparse>>()
  const scripts = {
    get:          new Script<{ scope: Boxscope }>(),
    put:          new Script<{ record: BoxRecord, priorRevisionTok: string | null }>(),
    del:          new Script<{ scope: Boxscope, priorRevisionTok: string | null }>(),
    ensureTimely: new Script<TimelyOpts>(),
    load:         new Script<undefined>(),
    save:         new Script<Cacheable<BoxRecord, BoxSparse>>(),
  }
  const scopeFor = (boxlabel: string): Boxscope => CX.boxscope.parse({ ...WorldVault.scope, boxlabel })
  const answerOf = (scope: Boxscope, val: Fetched<BoxRecord, BoxSparse> | null, world: unknown = null): BoxAnswer => ({ scope, ok: true, val, world })
  const refusalOf = (scope: Boxscope, err: VaultError, world: unknown = null): BoxAnswer => ({ scope, ok: false, err, world })
  /** The 'stale_write' a put or del over `priorRevisionTok` meets where `held` is stored, or null where it may land: over no row with a `priorRevisionTok`, carrying nothing; over a row under another tok, carrying it. */
  const casRefusalOf = (scope: Boxscope, held: Fetched<BoxRecord, BoxSparse> | undefined, priorRevisionTok: string | null): BoxAnswer | null => {
    if (held === undefined) { return priorRevisionTok === null ? null : refusalOf(scope, new VaultError('stale_write', Refusals.StaleBoxMessage)) }
    return held.revision_tok === priorRevisionTok ? null : refusalOf(scope, Refusals.staleBox(held))
  }

  // The fake lease: the bytes sealed, by the stamp they were sealed under.
  const sealedBytes = new Map<string, Uint8Array>()
  const lease: BoxLease = {
    sealWith: (serializedWhisper, _boxKeyStamp, whisperStamp) => {
      sealedBytes.set(String(stableJsonify(whisperStamp)), new Uint8Array(serializedWhisper))
      serializedWhisper.fill(0)
      return Promise.resolve({ box_key_wrapped: FakeBoxKeyWrapped, whisper_ciphered: FakeWhisperCiphered })
    },
    unsealWith: (_sealed, _boxKeyStamp, whisperStamp) => {
      const bytes = sealedBytes.get(String(stableJsonify(whisperStamp)))
      if (bytes === undefined) { return Promise.reject(new VaultError('damaged_box', Phrases.UnopenedWhisper)) }
      return Promise.resolve(new Uint8Array(bytes))
    },
  }

  const world: BoxWorld = {
    clock:        { now: clockNow },
    scope:        WorldVault.scope,
    vault_tok:    WorldVault.vault_tok,
    lockState:    () => lockState,
    demandLease:  () => {
      if (lockState === 'locked') { throw new VaultError('vault_locked', Phrases.UnlockFirst) }
      return lease
    },
    takeWorld:    (taken) => { calls.push({ verb: 'takeWorld', world: taken }) },
    ensureTimely: async (timelyOpts) => {
      calls.push({ verb: 'ensureTimely', opts: timelyOpts })
      const { scripted, answer } = scripts.ensureTimely.take(timelyOpts)
      if (scripted) { await answer }
    },
  }

  const store: ModelsWorld['store'] = {
    get: async (scope) => {
      calls.push({ verb: 'get', scope })
      const { scripted, answer } = scripts.get.take({ scope })
      if (scripted) { return (await answer) as BoxAnswer }
      return answerOf(scope, stored.get(scope.boxlabel) ?? null)
    },
    put: async (record, priorRevisionTok) => {
      calls.push({ verb: 'put', record, priorRevisionTok })
      const { scripted, answer } = scripts.put.take({ record, priorRevisionTok })
      if (scripted) { return (await answer) as BoxAnswer }
      const held = stored.get(record.boxlabel)
      const scope = CX.boxscope.parse(record)
      const fitsPriorRevisionTok = priorRevisionTok === null ? record.revision_seq === 0 : record.revision_seq > 0
      if (! fitsPriorRevisionTok) { return refusalOf(scope, new VaultError('bad_record', Phrases.PutUnfitForPrior)) }
      const refused = casRefusalOf(scope, held, priorRevisionTok)
      if (refused !== null) { return refused }
      if (held !== undefined && record.revision_seq !== held.revision_seq + 1) { return refusalOf(scope, new VaultError('bad_record', Phrases.PutUnfitForPrior)) }
      stored.set(record.boxlabel, record)
      return answerOf(scope, record)
    },
    del: async (scope, priorRevisionTok) => {
      calls.push({ verb: 'del', scope, priorRevisionTok })
      const { scripted, answer } = scripts.del.take({ scope, priorRevisionTok })
      if (scripted) { return (await answer) as BoxAnswer }
      const held = stored.get(scope.boxlabel)
      const refused = casRefusalOf(scope, held, priorRevisionTok)
      if (refused !== null) { return refused }
      const tombstone = tombstoneBoxRecord({
        ...scope,
        ...(held !== undefined && sparseOf(held)),
        revision_tok: randomId(),
        revision_seq: (held?.revision_seq ?? NeverStoredSeq) + 1,
        written_at:   clockNow(),
      })
      stored.set(scope.boxlabel, tombstone)
      return answerOf(scope, tombstone)
    },
    watch: (onNotice, fullFor) => {
      const watch: ModelsWatch = { onNotice, fullFor, active: true }
      calls.push({ verb: 'watch', onNotice, fullFor })
      watches.push(watch)
      return () => {
        calls.push({ verb: 'unwatch' })
        watch.active = false
      }
    },
  }

  const cache: BoxCache = {
    load: async () => {
      calls.push({ verb: 'load' })
      const { scripted, answer } = scripts.load.take(undefined)
      if (scripted) { return (await answer) as readonly Cacheable<BoxRecord, BoxSparse>[] }
      return [...cached.values()]
    },
    save: async (cacheable) => {
      calls.push({ verb: 'save', cacheable })
      const { scripted, answer } = scripts.save.take(cacheable)
      if (scripted) { await answer }
      cached.set(cacheable.boxlabel, cacheable)
    },
  }

  const liveWatch = (): ModelsWatch => {
    const live = watches.findLast((watch) => watch.active)
    if (live === undefined) { throw new Error('No watch is live: the listing has not started one, or has ended it.') }
    return live
  }

  const setNow = (ms: number): void => {
    if (fakeTimers) { vi.setSystemTime(ms) } else { now = ms }
  }

  const dispose = (): void => {
    for (const watch of watches) { watch.active = false }
    if (fakeTimers) { vi.useRealTimers() }
  }

  return {
    world, store, cache, calls, badnews, stored, cached, watches,
    onBadNews:  (news) => { badnews.push(news) },
    callsOf:    (verb) => calls.filter((call): call is Extract<ModelsCall, { verb: typeof verb }> => call.verb === verb),
    clearCalls: () => { calls.length = 0; badnews.length = 0 },

    now:      clockNow,
    setNow,
    advance:  async (ms) => {
      if (fakeTimers) { await vi.advanceTimersByTimeAsync(ms) } else { now += ms }
    },
    setLockState: (next) => { lockState = next },
    dispose,

    seedStore: (record) => { stored.set(record.boxlabel, record) },
    seedCache: (...copies) => { for (const copy of copies) { cached.set(copy.boxlabel, copy) } },

    willGet:          (...answers) => { scripts.get.push(...answers) },
    willPut:          (...answers) => { scripts.put.push(...answers) },
    willDel:          (...answers) => { scripts.del.push(...answers) },
    willEnsureTimely: (...thunks) => { scripts.ensureTimely.push(...thunks) },
    willLoad:         (...answers) => { scripts.load.push(...answers) },
    willSave:         (...thunks) => { scripts.save.push(...thunks) },

    answerOf,
    refusalOf,
    staleWriteOf: (scope, storedNow, worldNow = null) => {
      const err = storedNow === undefined ? new VaultError('stale_write', Refusals.StaleBoxMessage) : Refusals.staleBox(storedNow)
      return refusalOf(scope, err, worldNow)
    },

    notify:       (record, worldNow = null) => liveWatch().onNotice({ record, world: worldNow }),
    notifyRaw:    (notice) => liveWatch().onNotice(notice as Notice<BoxRecord, BoxSparse>),
    watchedScopes: () => liveWatch().fullFor(),

    fullBoxRecord:      (overrides) => fullBoxRecord(overrides),
    sparseBoxRecord:    (overrides) => sparseBoxRecord(overrides),
    tombstoneBoxRecord: (overrides, am) => tombstoneBoxRecord(overrides, am),
    boxscope:           scopeFor,
  }
}

/** The sparse form of any record the store keeps. */
const sparseOf = (record: Fetched<BoxRecord, BoxSparse>): BoxSparse => MSX.boxSparse.parse(record)

/** A new {@link makeModelsWorld} before each test, disposed after it. Call it at the top of a test file; `held.mw` is the current test's world, as `mw` in the other examples.
 *
 * @example
 *   const held = useModelsWorld()
 *   it('fetches', async () => { held.mw.seedStore(fullBoxRecord()); await boxListingOf(held.mw).fetch(held.mw.boxscope('anthropic_api_key')) })
 */
export const useModelsWorld = (opts: ModelsWorldOpts = {}): { readonly mw: ModelsWorld } => {
  let current: ModelsWorld | null = null
  beforeEach(() => { current = makeModelsWorld(opts) })
  afterEach(() => {
    current?.dispose()
    current = null
  })
  return {
    get mw() {
      if (current === null) { throw new Error('held.mw is made before each test and disposed after it: reach it inside a test or a hook.') }
      return current
    },
  }
}

// == [Testable]: TestableBox, TestableBoxListing, boxListingOf

/** A {@link Box} that shows a test the records it holds, which the storable keeps protected: `_cheat_central` and `_cheat_staged` are its `central` and `staged`, as of now. Hosts get no such door; a test that wants the state itself, not its snapshot, makes its boxes by {@link boxListingOf} or by `new TestableBox`. */
export class TestableBox extends Box {
  get _cheat_central(): Fetched<BoxRecord, BoxSparse> { return this.central } // eslint-disable-line unicorn/prefer-private-class-fields

  get _cheat_staged(): Fetched<BoxRecord, BoxSparse> | null { return this.staged } // eslint-disable-line unicorn/prefer-private-class-fields
}

/** The {@link BoxListing} whose boxes are {@link TestableBox}es, typed so: `build`, `fetch`, `put`, `del` and `at` give a `TestableBox`. */
export class TestableBoxListing extends BoxListing {
  protected override makeThing(central: Fetched<BoxRecord, BoxSparse>, staged: Fetched<BoxRecord, BoxSparse> | null, cache: Cache<BoxRecord, BoxSparse>): TestableBox {
    return new TestableBox(this.world, this, cache, central, staged, { maxMillisSinceRefresh: this.maxMillisSinceRefresh })
  }

  override async build(input: Parameters<BoxListing['build']>[0]): Promise<TestableBox> { return testableOf(await super.build(input)) }

  override async fetch(...args: Parameters<BoxListing['fetch']>): Promise<TestableBox | null> { return nullOrTestableOf(await super.fetch(...args)) }

  override async put(...args: Parameters<BoxListing['put']>): Promise<TestableBox | null> { return nullOrTestableOf(await super.put(...args)) }

  override async del(...args: Parameters<BoxListing['del']>): Promise<TestableBox | null> { return nullOrTestableOf(await super.del(...args)) }

  override at(...args: Parameters<BoxListing['at']>): TestableBox | null { return nullOrTestableOf(super.at(...args)) }
}

const testableOf = (box: Box): TestableBox => {
  if (! (box instanceof TestableBox)) { throw new TypeError('a TestableBoxListing makes only TestableBoxes') }
  return box
}

const nullOrTestableOf = (box: Box | null): TestableBox | null => (box === null ? null : testableOf(box))

/** A {@link BoxListing} over the world's vault, store and cache, its bad news logged in `badnews`, its boxes {@link TestableBox}es. `overrides` replaces any of its options; the horizon is ten minutes.
 *
 * @example const listing = boxListingOf(mw, { maxMillisSinceRefresh: 1000 })
 */
export const boxListingOf = (mw: ModelsWorld, overrides: Partial<BoxListingOpts> = {}): TestableBoxListing => (
  new TestableBoxListing({
    world:                 mw.world,
    store:                 mw.store,
    cache:                 mw.cache,
    maxMillisSinceRefresh: 10 * 60_000,
    onBadNews:             mw.onBadNews,
    ...overrides,
  })
)
// --

// == [Faked seal]: fakeSealBoxListingOf

/** A {@link boxListingOf} whose boxes fake the seal in `edit`, for a test that wants sealed parts it can tell apart by revision, or acts while an edit is under way: the whisper given to `edit` or `send` comes out as the fake ciphered bags named for the revision it is staged under, with the sidecar given. `duringMakeStaged`, where given, runs once each `makeStaged` has made its staged record, before it resolves, for a test that acts while an edit is under way.
 *
 * @example const box = await fakeSealBoxListingOf(mw).build(mw.tombstoneBoxRecord({ revision_seq: 2 }))   // then box.edit({ whisper: { val: 'sk-test' }, sidecar: {} }) is its rebirth
 * @example fakeSealBoxListingOf(mw, {}, () => { mw.setLockState('locked') })   // the vault locks during each edit
 */
export const fakeSealBoxListingOf = (mw: ModelsWorld, overrides: Partial<BoxListingOpts> = {}, duringMakeStaged: () => void = () => undefined): TestableBoxListing => {
  class FakeSealBox extends TestableBox {
    protected override async makeStaged(patch: BoxPatch): Promise<BoxRecord> {
      const staged = await super.makeStaged(patch)
      duringMakeStaged()
      return { ...staged, box_key_wrapped: fakeCiphered(`boxkey-${staged.revision_tok}`), whisper_ciphered: fakeCiphered(`whisper-${staged.revision_tok}`) }
    }
  }
  class FakeSealBoxListing extends TestableBoxListing {
    protected override makeThing(central: Fetched<BoxRecord, BoxSparse>, staged: Fetched<BoxRecord, BoxSparse> | null, cache: Cache<BoxRecord, BoxSparse>): TestableBox {
      return new FakeSealBox(this.world, this, cache, central, staged, { maxMillisSinceRefresh: this.maxMillisSinceRefresh })
    }
  }
  return new FakeSealBoxListing({
    world:                 mw.world,
    store:                 mw.store,
    cache:                 mw.cache,
    maxMillisSinceRefresh: 10 * 60_000,
    onBadNews:             mw.onBadNews,
    ...overrides,
  })
}
// --

// == [Peeking]: lastSaveOf

/** The copy last saved to the fake device cache for `box`'s scope, as `mw` logged the save: a box saves its own at every settle, so this is the state it last settled into. Throws where no copy was saved for the scope. */
export function lastSaveOf(mw: ModelsWorld, box: { readonly boxlabel: string }): Cacheable<BoxRecord, BoxSparse> {
  const saved = mw.callsOf('save').findLast((call) => call.cacheable.boxlabel === box.boxlabel)
  if (saved === undefined) { throw new Error(`no copy was saved to the cache for ${box.boxlabel}`) }
  return saved.cacheable
}
// --

// == [Dna]: boxDnaOf

/** A box's dna for `build`: `scope`, with a fake whisper and an empty sidecar, as every update of a box names both, and `overrides` laid over them.
 *
 * @example await boxListingOf(mw).build(boxDnaOf(mw.boxscope('anthropic_api_key')))
 * @example boxDnaOf(mw.boxscope('anthropic_api_key'), { sidecar: { account: 'work' } })
 */
export const boxDnaOf = (scope: Boxscope, overrides: Partial<BoxDna> = {}): BoxDna => ({ ...scope, whisper: { val: 'sk-test-0000' }, sidecar: {}, ...overrides })
// --
