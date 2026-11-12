/** The test world of `src/models/`: a fake vault (the {@link BoxWorld}), a {@link TestableVaultDB} over one live vault row, one log of every call made to them, and the builders of the records they have.
 * Import it directly, not through `TH`: `src/models/` is not exported, and the door
 * `tests/test-helpers.ts` is published as `safebyok/testing`.
 *
 * Time. The clock is settable, and starts at {@link T0}. A timer schedules with `setTimeout`, a delay
 * computed from the clock, so the world installs vitest's
 * fake timers (`fakeTimers: false` leaves real ones) and moves both together:
 * `await mw.advance(ms)` moves the clock and fires every timer that falls due; `mw.setNow(ms)`
 * only jumps the clock, firing none. Never move the clock any other way, and call `mw.dispose()`
 * in `afterEach`, as vitest's `restoreMocks` does not put real timers back: {@link useModelsWorld}
 * makes a new world before each test and disposes it after.
 *
 * The seal. The fake vault's seal verbs refuse 'bank_locked' while it reports locked, and
 * otherwise keep each whisper's text by the stamp it was sealed under and give it back for that
 * stamp alone: its sealed parts are the constants
 * {@link FakeBoxKeyWrapped} and {@link FakeWhisperCiphered}. A record it never sealed, as the
 * builders make, opens to a 'damaged_whisper', as under the real vault.
 */

import type { GotAct } from '../../src/shapes/shapes-enums'
import { afterEach, beforeEach, vi } from 'vitest'
import { _cheat_clock } from '../../src/helpers/clock'
import { brandGuarded } from '../../src/helpers/consts'
import { VaultError, isVaultError } from '../../src/refusals/errors'
import { Box } from '../../src/models/box'
import { BoxListing } from '../../src/models/box-listing'
import { guardRequestCleartext } from '../../src/models/device'
import type { Vault } from '../../src/models/vault'
import * as CX from '../../src/shapes/shapes-core'
import type { Boxscope } from '../../src/shapes/shapes-core'
import * as SX from '../../src/shapes/shapes-storage'
import * as VX from '../../src/shapes/shapes-vaultish'
import { type DeviceAnnouncement, type BankFriend, type BoxDna, type BoxWorld, type Fetched, type BoxListingOpts, type ListingAnswer, type Tombstone } from '../../src/shapes/shapes-vaultish'
import { type BoxDelAsk, type BoxGetAsk, type BoxPutAsk, type BoxRow, type BoxTombstone, type LoggableAsk, type Revision, type VaultRecord, type WatchScope, type BoxRecord, type BoxSparse, BoxFormat } from '../../src/shapes/shapes-storage'
import { stableJsonify } from '../../src/helpers/stable-jsonify'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import type { Notice } from '../../src/storage/vault-db'
import * as Refuse from '../../src/refusals/throwers'
import { fakeCiphered } from './builders'

// == [Time and builders]: T0, fullBoxRecord, sparseBoxRecord, tombstoneBoxRecord, shellBoxRecord

/** The clock's first reading, in epoch milliseconds: 14 November 2023. The epoch check refuses small numbers. */
export const T0 = 1_700_000_000_000

/** The vault's scope and `vault_tok` that {@link makeModelsWorld} gives its world, and the builders below give their records. */
export const WorldVault = Object.freeze({ scope: Object.freeze({ user_id: 'u1', banklabel: 'acme', vaultlabel: 'main' }), vault_tok: 'vault-tok-u1' })

/** The one live vault row of every world, which a box verb demands. */
export function worldVaultRow(): VaultRecord {
  return {
    ...WorldVault.scope,
    fmt:           SX.VaultFormat,
    vault_tok:     WorldVault.vault_tok,
    am:            'a',
    revision_tok:  'rev-world',
    revision_seq:  0,
    registered_at: T0,
    written_at:    T0,
    gate:          {
      gate_epoch:       1,
      passphrase_wayin: { wayinkind: 'passphrase', key_deriver_label: 'test', salt_b64: 'c2FsdHNhbHRzYWx0c2FsdA' as CX.PassphraseSalt, device_tok: '00000000-0000-4000-8000-0000000000d1', registered_at: T0, vault_key_wayin_wrapped: fakeCiphered('wayin') },
      passkey_wayin:    null,
    },
  }
}

/** A full box record that passes `boxRecord`, in {@link WorldVault}: revision 1 of the box `anthropic_api_key`, of the life `box-tok-a`, alive, registered and written at {@link T0}, its sealed parts the fake ciphered bags that open under no key. `overrides` says otherwise. */
export function fullBoxRecord(overrides: Partial<BoxRecord> = {}): BoxRecord {
  return {
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
  }
}

/** The sparse form of a box record: {@link fullBoxRecord} less its sidecar and sealed parts. `overrides` says otherwise; a sidecar or sealed part it names is stripped. */
export function sparseBoxRecord(overrides: Partial<BoxSparse> = {}): BoxSparse { return SX.boxSparse.parse({ ...fullBoxRecord(), ...overrides }) }

/** The tombstone of a box record: exactly its sparse form, as {@link sparseBoxRecord} makes it, with `am` 'x', and nothing more (no sidecar, no sealed parts). `overrides` says otherwise, but for `am`. */
export function tombstoneBoxRecord(overrides: Partial<BoxSparse> = {}): Tombstone<BoxSparse> { return { ...sparseBoxRecord(overrides), am: 'x' } }

/** The row a put or del expects to find where no box is stored under `boxlabel`: the shell, in {@link WorldVault}. */
export function shellBoxRecord(boxlabel = 'anthropic_api_key'): BoxTombstone { return SX.shellBoxOf({ ...WorldVault.scope, boxlabel }, WorldVault.vault_tok) }
// --

// == [Calls and answers]: ModelsCall, Scripted, BoxAnswer, ModelsWatch

/** One call made to the world or the vaultDB, in {@link ModelsWorld.calls}. `expectedRevisionTok` is that of the row the call expects to find, null for the shell's. */
export type ModelsCall =
  | { verb: 'ensureTimely', maxMillis: number | undefined }
  | { verb: 'receiveWorld',    world: unknown }
  | { verb: 'get',          scope: Boxscope, expectedRevisionTok: string | null }
  | { verb: 'put',          record: BoxRecord, expectedRevisionTok: string | null, ifAbsent: BoxPutAsk['ifAbsent'], ifPresent: BoxPutAsk['ifPresent'] }
  | { verb: 'del',          scope: Boxscope, expectedRevisionTok: string | null }
  | { verb: 'watch',        onNotice: (notice: Notice) => void }
  | { verb: 'unwatch' }

/** The answer of a scripted call: the answer itself, or a function of the call that makes it (or throws, or rejects). */
export type Scripted<CallT> = BoxAnswer | ((call: CallT) => unknown)

/** A {@link ListingAnswer} about a box. */
export type BoxAnswer = ListingAnswer<BoxRecord, BoxSparse>

/** A watch the listing started: the callback it gave, and whether it is still live. */
export type ModelsWatch = { onNotice: (notice: Notice) => void, onBadNews: ((news: VaultError) => void) | undefined, active: boolean }
// --

// == [The world]: FakeBoxKeyWrapped, FakeWhisperCiphered, ModelsWorldOpts, ModelsWorld, makeModelsWorld, boxListingOf

/** The sealed parts of every record the fake seal seals: constants that wrap no key and open under none. */
export const FakeBoxKeyWrapped   = fakeCiphered('fake-box-key-wrapped')
/** The `whisper_ciphered` of every record the fake seal seals. */
export const FakeWhisperCiphered = fakeCiphered('fake-whisper-ciphered')

/** How {@link makeModelsWorld} starts the world. */
export type ModelsWorldOpts = {
  /** The clock's first reading; {@link T0}. */
  now?:         number
  /** Whether the vault starts locked; false, unlocked. */
  isLocked?:    boolean
  /** Whether to install vitest's fake timers, in step with the clock; true. */
  fakeTimers?:  boolean
}

/** The fake vault and the vaultDB of one box listing, with their calls and the means to script them.
 * By default the vaultDB answers as a {@link MemoryVaultDB} does. Each `will...` queues an answer for
 * the next call of its verb, one answer per call, then back to the default.
 */
export type ModelsWorld = {
  /** The vault, as the listing is given it. */
  world:  BoxWorld
  /** The world with `overrides` laid over it, its lock still read live, as a spread of it would not. */
  worldWith(overrides: Partial<BoxWorld>): BoxWorld
  vaultDB: TestableVaultDB
  /** Every call made to the world and the vaultDB, in order, oldest first. A live array. */
  calls:  readonly ModelsCall[]
  /** The refusals the listing told as bad news, oldest first. A live array. */
  badnews: readonly VaultError[]
  /** The refusals the listing panicked with, oldest first. A live array. */
  panics:  readonly VaultError[]
  /** What the listing announced, oldest first. A live array. */
  announced: readonly DeviceAnnouncement[]
  /** The bank's private calls, as the listing is handed them: its panic logs each refusal in `panics`, its announcements in `announced`, its bad news in `badnews`. */
  bankFriend: BankFriend
  /** The vaultDB's own box rows, by boxlabel: the one vault's boxes. */
  stored: Map<string, unknown>

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
  /** Lock or unlock the vault, telling the world's subscribers, then aligning each box listed in a listing over this world, as a vault does. */
  setLocked(isLocked: boolean): void
  /** The box listings made over this world by {@link boxListingOf}, whose boxes `setLocked` aligns. */
  listings: Set<BoxListing>
  /** End the watches and put real timers back. Call it in `afterEach`. */
  dispose(): void

  /** Lay `record` in the vaultDB as the row under its boxlabel, unchecked. */
  seedPut(record: Fetched<BoxRecord, BoxSparse>): void

  /** Script the next `tryGetBox` calls to answer with `answers`, one each. */
  willGet(...answers: readonly Scripted<{ scope: Boxscope }>[]): void
  /** Script the next `tryPutBox` calls to answer with `answers`, one each. */
  willPut(...answers: readonly Scripted<PutCall>[]): void
  /** Script the next `tryDelBox` calls to answer with `answers`, one each. */
  willDel(...answers: readonly Scripted<{ scope: Boxscope, expectedRevisionTok: string | null, tombstone: BoxTombstone }>[]): void
  /** The next `ensureTimely` runs `thunk` (async, so it may stay pending, or reject). */
  willEnsureTimely(...thunks: readonly ((maxMillis: number | undefined) => Promise<void> | void)[]): void

  /** The good answer about `scope`, under a get's act: `val` is the record stored, null for none. */
  answerOf(scope: Boxscope, val: Fetched<BoxRecord, BoxSparse> | null, world?: unknown): BoxAnswer
  /** The refused answer about `scope`; `dbhas` is the row it carries. */
  refusalOf(scope: Boxscope, err: VaultError, world?: unknown, dbhas?: unknown): BoxAnswer
  /** The `stale_write` refusal about `scope` carrying what storage has stored as `dbhas`: a record, or null; `undefined` leaves it out. */
  staleWriteOf(scope: Boxscope, stored: Fetched<BoxRecord, BoxSparse> | null | undefined, world?: unknown): BoxAnswer

  /** Push `record` through the live watch as a notice, under the world's vault row unless told otherwise, resolving once the listing has delivered it. Throws where no watch is live. */
  notify(record: Fetched<BoxRecord, BoxSparse>, world?: unknown): Promise<void>

  /** {@link fullBoxRecord}, in this world's vault. */
  fullBoxRecord(overrides?: Partial<BoxRecord>): BoxRecord
  /** {@link sparseBoxRecord}, in this world's vault. */
  sparseBoxRecord(overrides?: Partial<BoxSparse>): BoxSparse
  /** {@link tombstoneBoxRecord}, in this world's vault. */
  tombstoneBoxRecord(overrides?: Partial<BoxSparse>): Tombstone<BoxSparse>
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
    return { scripted: true, answer: typeof next === 'function' ? next(call) : next }
  }
}

type GetCall = { scope: Boxscope }
type PutCall = { record: BoxRecord, expectedRevisionTok: string | null, ifAbsent: BoxPutAsk['ifAbsent'], ifPresent: BoxPutAsk['ifPresent'] }
type DelCall = { scope: Boxscope, expectedRevisionTok: string | null, tombstone: BoxTombstone }

/** The `revision_tok` of the row a call expects to find: null for the shell's. */
function expectedTokOf({ revision_tok }: Revision): string | null { return ((revision_tok === SX.VoidRevisionTok) ? null : revision_tok) }

/** A {@link MemoryVaultDB} whose box verbs and watch log each call, and answer what a test scripts in place of their own. */
export class TestableVaultDB extends MemoryVaultDB {
  readonly #calls:   ModelsCall[]
  readonly #watches: ModelsWatch[]
  readonly scripts = { get: new Script<GetCall>(), put: new Script<PutCall>(), del: new Script<DelCall>() }

  constructor(calls: ModelsCall[], watches: ModelsWatch[]) {
    super()
    this.#calls = calls
    this.#watches = watches
  }

  /** Log this get, then answer it from the script or, with the script empty, from storage. */
  override async tryGetBox(ask: BoxGetAsk) {
    const scope = CX.boxscope.parse(ask)
    this.#calls.push({ verb: 'get', scope, expectedRevisionTok: expectedTokOf(ask.expected) })
    const { scripted, answer } = this.scripts.get.take({ scope })
    return scripted ? ((await answer) as Awaited<ReturnType<MemoryVaultDB['tryGetBox']>>) : super.tryGetBox(ask)
  }

  /** Log this put, then answer it from the script or, with the script empty, from storage. */
  override async tryPutBox(ask: BoxPutAsk) {
    const { record, expected, ifAbsent, ifPresent } = ask
    const call: PutCall = { record, expectedRevisionTok: expectedTokOf(expected), ifAbsent, ifPresent }
    this.#calls.push({ verb: 'put', ...call })
    const { scripted, answer } = this.scripts.put.take(call)
    return scripted ? ((await answer) as Awaited<ReturnType<MemoryVaultDB['tryPutBox']>>) : super.tryPutBox(ask)
  }

  /** Log this delete, then answer it from the script or, with the script empty, from storage. */
  override async tryDelBox(ask: BoxDelAsk) {
    const call: DelCall = { scope: CX.boxscope.parse(ask), expectedRevisionTok: expectedTokOf(ask.expected), tombstone: ask.record }
    this.#calls.push({ verb: 'del', ...call })
    const { scripted, answer } = this.scripts.del.take(call)
    return scripted ? ((await answer) as Awaited<ReturnType<MemoryVaultDB['tryDelBox']>>) : super.tryDelBox(ask)
  }

  /** Log this watch and keep it for `notify` to reach. */
  override watch(scope: WatchScope, onNotice: (notice: Notice) => void, onBadNews?: (news: VaultError) => void): () => void {
    const watch: ModelsWatch = { onNotice, onBadNews, active: true }
    this.#calls.push({ verb: 'watch', onNotice })
    this.#watches.push(watch)
    const unwatch = super.watch(scope, onNotice)
    return () => {
      this.#calls.push({ verb: 'unwatch' })
      watch.active = false
      unwatch()
    }
  }
}

function factsOf(scope: Boxscope) { return { ask: { op: 'get', ...scope } as LoggableAsk } }
function gotActOf(val: Fetched<BoxRecord, BoxSparse> | null): GotAct {
  if (val === null) { return 'gotvoid' }
  return VX.isTombstone(val) ? 'gotgone' : 'gotlive'
}
const answerOf = (scope: Boxscope, val: Fetched<BoxRecord, BoxSparse> | null, world: unknown = null): BoxAnswer => ({ ok: true, val, world, act: gotActOf(val), ...factsOf(scope) })

/** Make a fake vault and a vaultDB for a {@link BoxListing}, with the calls they log and the means to script them.
 * Pass the result to {@link boxListingOf}.
 *
 * @example
 *   const mw = makeModelsWorld()
 *   afterEach(() => { mw.dispose() })
 *   mw.seedPut(mw.fullBoxRecord({ revision_seq: 2 }))
 *   const listing = boxListingOf(mw)
 *   const box = await listing.get(mw.boxscope('anthropic_api_key'))
 *   expect(mw.callsOf('get')).to.have.lengthOf(1)
 * @example mw.willPut((call) => mw.staleWriteOf(mw.boxscope(call.record.boxlabel), mw.fullBoxRecord({ revision_seq: 5 })))   // the next put loses a race
 */
export function makeModelsWorld(opts: ModelsWorldOpts = {}): ModelsWorld {
  const { fakeTimers = true } = opts
  // The clock under real timers. Under fake ones the clock is the faked `Date`, which moves to each timer's due time as it fires.
  let now = opts.now ?? T0
  const clockNow = (): number => (fakeTimers ? Date.now() : now)
  let isLocked = opts.isLocked ?? false
  const worldListeners = new Set<() => void>()
  const listings = new Set<BoxListing>()
  if (fakeTimers) { vi.useFakeTimers({ now }) }
  _cheat_clock(clockNow)

  const calls: ModelsCall[] = []
  const badnews: VaultError[] = []
  const panics: VaultError[] = []
  const announced: DeviceAnnouncement[] = []
  const watches: ModelsWatch[] = []
  const vaultDB = new TestableVaultDB(calls, watches)
  vaultDB._cheat_vaultRowsOf(WorldVault.scope).set(WorldVault.scope.vaultlabel, worldVaultRow())
  const stored = vaultDB._cheat_boxRowsOf(WorldVault.scope, WorldVault.vault_tok)
  const ensureTimelyScript = new Script<number | undefined>()
  const scopeFor = (boxlabel: string): Boxscope => CX.boxscope.parse({ ...WorldVault.scope, boxlabel })
  const refusalOf = (scope: Boxscope, err: VaultError, world: unknown = null, dbhas?: unknown): BoxAnswer => ({ ok: false, err, world, act: err.meta?.act ?? 'unclassified_storing', ...factsOf(scope), ...((dbhas !== undefined) && { dbhas }) })

  // The fake seal: the text sealed, by the stamp it was sealed under.
  const sealedTexts = new Map<string, string>()
  function demandFakeUnlocked(): void {
    if (isLocked) { throw Refuse.needUnlocked() }
  }
  // The fake stands in for the vault, which `ensureTimely` answers; no box reads the answer.
  function standIn(): Vault { return world as unknown as Vault }

  const world: BoxWorld = {
    vault_tok:    WorldVault.vault_tok,
    get isLocked() { return isLocked },
    subscribe:    (listener) => { worldListeners.add(listener); return () => { worldListeners.delete(listener) } },
    sealStampedString: async (whisperText, stamp) => {
      await Promise.resolve()
      demandFakeUnlocked()
      sealedTexts.set(stableJsonify(stamp), whisperText)
      return { box_key_wrapped: FakeBoxKeyWrapped, whisper_ciphered: FakeWhisperCiphered }
    },
    unsealStampedString: async (_sealed, stamp) => {
      await Promise.resolve()
      demandFakeUnlocked()
      const whisperText = sealedTexts.get(stableJsonify(stamp))
      if (whisperText === undefined) { throw Refuse.undecipheredWhisper() }
      return whisperText
    },
    receiveWorld:    (taken) => { calls.push({ verb: 'receiveWorld', world: taken }) },
    ensureTimely: async (maxMillis) => {
      calls.push({ verb: 'ensureTimely', maxMillis })
      const { scripted, answer } = ensureTimelyScript.take(maxMillis)
      if (scripted) { await answer }
      return standIn()
    },
  }

  function liveWatch(): ModelsWatch {
    const live = watches.findLast((watch) => watch.active)
    if (live === undefined) { throw new Error('No watch is live: the listing has not started one, or has ended it.') }
    return live
  }

  /** Every microtask a notice set going has run, under fake timers or real. */
  async function settled(): Promise<void> {
    if (fakeTimers) { await vi.advanceTimersByTimeAsync(0) } else { await new Promise((resolve) => { setTimeout(resolve, 0) }) }
  }

  const setNow = (ms: number): void => {
    if (fakeTimers) { vi.setSystemTime(ms) } else { now = ms }
  }

  const dispose = (): void => {
    for (const watch of watches) { watch.active = false }
    if (fakeTimers) { vi.useRealTimers() }
  }

  return {
    world, vaultDB, calls, badnews, panics, announced, stored, watches, listings,
    worldWith: (overrides) => ({ ...world, get isLocked() { return isLocked }, ...overrides }),
    bankFriend: {
      panic:       brandGuarded((refusal: VaultError) => { panics.push(refusal) }),
      announce:    brandGuarded((announcement: DeviceAnnouncement) => { announced.push(announcement) }),
      tellBadNews: brandGuarded((told: readonly unknown[]) => { badnews.push(...told.map((news) => (isVaultError(news) ? news : Refuse.unexpectedError(news)))) }),
      askUser:     guardRequestCleartext(() => undefined),
    },
    callsOf:    (verb) => calls.filter((call): call is Extract<ModelsCall, { verb: typeof verb }> => call.verb === verb),
    clearCalls: () => { calls.length = 0; badnews.length = 0; panics.length = 0; announced.length = 0 },

    now:      clockNow,
    setNow,
    advance:  async (ms) => {
      if (fakeTimers) { await vi.advanceTimersByTimeAsync(ms) } else { now += ms }
    },
    setLocked: (next) => {
      if (next === isLocked) { return }
      isLocked = next
      for (const listener of worldListeners) { listener() }
      for (const listing of listings) {
        for (const box of listing.things) { box.align() }
      }
    },
    dispose,

    seedPut: (record) => { stored.set(record.boxlabel, record) },

    willGet:          (...answers) => { vaultDB.scripts.get.push(...answers) },
    willPut:          (...answers) => { vaultDB.scripts.put.push(...answers) },
    willDel:          (...answers) => { vaultDB.scripts.del.push(...answers) },
    willEnsureTimely: (...thunks) => { ensureTimelyScript.push(...thunks) },

    answerOf,
    refusalOf,
    staleWriteOf: (scope, storedNow, worldNow = null) => {
      const err = Refuse.staleWrite(worldVaultRow(), (storedNow ?? null) as BoxRow | null)
      return { ok: false, err, world: worldNow, act: 'stale', ...factsOf(scope), ...((storedNow !== undefined) && { dbhas: storedNow }) }
    },

    notify: async (record, worldNow = worldVaultRow()) => {
      const notice = { act: VX.isTombstone(record) ? 'gotgone' : 'gotlive', val: record, world: worldNow } as Notice
      liveWatch().onNotice(notice)
      await settled()
    },

    fullBoxRecord:      (overrides) => fullBoxRecord(overrides),
    sparseBoxRecord:    (overrides) => sparseBoxRecord(overrides),
    tombstoneBoxRecord: (overrides) => tombstoneBoxRecord(overrides),
    boxscope:           scopeFor,
  }
}

/** A new {@link makeModelsWorld} before each test, disposed after it. Call it at the top of a test file; `world.mw` is the current test's world, as `mw` in the other examples.
 *
 * @example
 *   const world = useModelsWorld()
 *   it('fetches', async () => { world.mw.seedPut(fullBoxRecord()); await boxListingOf(world.mw).get(world.mw.boxscope('anthropic_api_key')) })
 */
export function useModelsWorld(opts: ModelsWorldOpts = {}): { readonly mw: ModelsWorld } {
  let current: ModelsWorld | null = null
  beforeEach(() => { current = makeModelsWorld(opts) })
  afterEach(() => {
    current?.dispose()
    current = null
  })
  return {
    get mw() {
      if (current === null) { throw new Error('world.mw is made before each test and disposed after it: reach it inside a test or a hook.') }
      return current
    },
  }
}

// == [Testable]: TestableBox, TestableBoxListing, boxListingOf, BoxListingOverrides

/** A {@link Box} that shows a test the record it has, which the storable keeps protected: `_cheat_central` is its `central`, as a {@link TestableBoxListing} makes it. */
export class TestableBox extends Box {
  /** The record this box has, for a test to read. */
  get _cheat_central(): Fetched<BoxRecord, BoxSparse> { return this.central } // eslint-disable-line unicorn/prefer-private-class-fields

}

/** The {@link BoxListing} whose boxes are {@link TestableBox}es, typed so: `deliverRecord`, `create`, `get`, `put`, `del` and `at` give a `TestableBox`. */
export class TestableBoxListing extends BoxListing {
  protected override makeThing(central: Fetched<BoxRecord, BoxSparse>): TestableBox {
    return new TestableBox(this.world, this, central)
  }

  /** {@link BoxListing.deliverRecord}, answering a {@link TestableBox}. */
  override deliverRecord(...args: Parameters<BoxListing['deliverRecord']>): TestableBox { return testableOf(super.deliverRecord(...args)) }

  /** {@link BoxListing.puttable}, answering a {@link TestableBox}. */
  override puttable(...args: Parameters<BoxListing['puttable']>): TestableBox { return testableOf(super.puttable(...args)) }

  /** {@link BoxListing.create}, answering a {@link TestableBox}. */
  override async create(...args: Parameters<BoxListing['create']>): Promise<TestableBox> { return testableOf(await super.create(...args)) }


  /** {@link BoxListing.get}, answering a {@link TestableBox} or null. */
  override async get(...args: Parameters<BoxListing['get']>): Promise<TestableBox | null> { return nullOrTestableOf(await super.get(...args)) }

  /** {@link BoxListing.put}, answering a {@link TestableBox}. */
  override async put(...args: Parameters<BoxListing['put']>): Promise<TestableBox> { return testableOf(await super.put(...args)) }

  /** {@link BoxListing.del}, answering a {@link TestableBox} or null. */
  override async del(...args: Parameters<BoxListing['del']>): Promise<TestableBox | null> { return nullOrTestableOf(await super.del(...args)) }

  /** {@link BoxListing.at}, answering a {@link TestableBox} or null. */
  override at(...args: Parameters<BoxListing['at']>): TestableBox | null { return nullOrTestableOf(super.at(...args)) }
}

function testableOf(box: Box): TestableBox {
  if (! (box instanceof TestableBox)) { throw new TypeError('a TestableBoxListing makes only TestableBoxes') }
  return box
}

function nullOrTestableOf(box: Box | null): TestableBox | null { return (box === null ? null : testableOf(box)) }

/** A {@link BoxListing} over the world's vault and vaultDB, its bad news logged in `badnews`, its boxes {@link TestableBox}es, aligned at each `setLocked`. `overrides` replaces its world or any of its options; the horizon is ten minutes. */
export function boxListingOf(mw: ModelsWorld, overrides: BoxListingOverrides = {}): TestableBoxListing {
  const { world = mw.world, scope = WorldVault.scope, vaultDB = mw.vaultDB, maxMillisSinceRefresh = 10 * 60_000, bankFriend = mw.bankFriend } = overrides
  const listing = new TestableBoxListing(world, { scope, vaultDB, maxMillisSinceRefresh, bankFriend })
  mw.listings.add(listing)
  return listing
}

/** What {@link boxListingOf} may be told in place of the world's own: the box listing's world, vault scope, vaultDB, horizon or the bank's friend. */
export type BoxListingOverrides = Partial<BoxListingOpts & { world: BoxWorld }>
// --

// == [Faked seal]: fakeSealBoxListingOf

/** A {@link boxListingOf} whose sealed parts are fake bags named for the revision, `duringSeal` running after the real seal.
 *
 * @example fakeSealBoxListingOf(mw, {}, () => { mw.setLocked(true) })   // the vault locks during each seal
 */
export function fakeSealBoxListingOf(mw: ModelsWorld, overrides: BoxListingOverrides = {}, duringSeal: () => void = () => undefined): TestableBoxListing {
  const sealStampedString: BoxWorld['sealStampedString'] = async (whisperText, stamp) => {
    await mw.world.sealStampedString(whisperText, stamp)
    duringSeal()
    return { box_key_wrapped: fakeCiphered(`boxkey-${String(stamp['revision_tok'])}`), whisper_ciphered: fakeCiphered(`whisper-${String(stamp['revision_tok'])}`) }
  }
  return boxListingOf(mw, { world: mw.worldWith({ sealStampedString }), ...overrides })
}
// --

// == [Dna]: boxDnaOf

/** A box's dna for `create`: `scope`, with a fake whisper and an empty sidecar, as every update of a box names both, and `overrides` laid over them. */
export function boxDnaOf(scope: Boxscope, overrides: Partial<BoxDna> = {}): BoxDna { return { ...scope, whisper: { apiKey: 'sk-test-0000' }, sidecar: {}, ...overrides } }
// --
