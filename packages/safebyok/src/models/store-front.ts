/** The models' {@link Store} over a backend you plug in. A `StoreFront` judges every versioned put and deletion, reads each row as the kind's record, its tombstone or damage, and runs the watch; an adapter supplies four hooks over rows filed by scopepath, and never judges a record. `localStoreFront` is the one over a StringStore. */

import { noop } from 'es-toolkit'
import { randomId } from '../crypto'
import type { VaultError } from '../errors'
import * as RefusalFuncs from '../helpers/refusal-funcs'
import { getJson } from '../local-vault-db'
import { type Outcome, bad, good, outcomeOf, storageTroubleOf } from '../outcome'
import * as Refusals from '../refusals'
import { reportToPlatform } from '../report-error'
import * as Scopepath from '../scopepath'
import { type Clock, wallClock } from '../shapes/bank-opts'
import * as CX from '../shapes/scopes'
import type { BankScope, Boxscope, VaultScope } from '../shapes/scopes'
import type { StringStore } from '../string-store'
import { type Answer, type BoxRecord, type BoxSparse, type Fetched, type FoundRow, type LocalStoreFrontOpts, type Notice, type SparseBase, type Store, type StoreFrontOpts, type Tombstone, type VaultRecord, type VaultSparse } from './models-shapes'
import * as MSX from './models-shapes'

// == [Fronted stores]: FrontedStore, FrontedVaultStore, FrontedBoxStore, RowSwap

/** A {@link Store} as a `StoreFront` makes it, with `delUnparsed`: remove the row under `scope` only while, read in the same atomic step, it still reads as neither the kind's record nor its tombstone; answer what is then stored, null where it was removed. The one way to remove a row `del` refuses as damaged. */
export type FrontedStore<ScopeT, RecordT, SparseT> = Store<ScopeT, RecordT, SparseT> & {
  delUnparsed(scope: ScopeT): Promise<Answer<ScopeT, RecordT, SparseT>>
}

/** One bank's vault records, as a `StoreFront` serves them. */
export type FrontedVaultStore = FrontedStore<VaultScope, VaultRecord, VaultSparse>

/** One vault's boxes, as a `StoreFront` serves them. */
export type FrontedBoxStore = FrontedStore<Boxscope, BoxRecord, BoxSparse>

/** What `doSwapRow` hands the row it read (null for none), answering undefined to leave it, null to remove it, or the row to store in its place. */
export type RowSwap = (stored: unknown) => unknown
// --

// == [Kinds]: StoreKind, BoxKind, VaultKind

/** A check, as a `Checkers` validator makes it: `parse` refuses, `safeParse` answers. */
type Parses<ValT> = {
  parse(val: unknown): ValT
  safeParse(val: unknown): { success: true, data: ValT } | { success: false }
}

/** What a fronted store needs to know of one kind of thing: its scope and scopepath, its record and sparse checks, and its refusals. */
type StoreKind<ScopeT, RecordT, SparseT> = Readonly<{
  scopeOf:     (duck: unknown) => ScopeT
  scopepathOf: (scope: ScopeT) => string
  record:      Parses<RecordT>
  sparse:      Parses<SparseT>
  damaged:     () => VaultError
  stale:       (stored: Fetched<RecordT, SparseT> | null) => VaultError
}>

const BoxKind: StoreKind<Boxscope, BoxRecord, BoxSparse> = {
  scopeOf:     (duck) => CX.boxscope.parse(duck),
  scopepathOf: Scopepath.box,
  record:      MSX.boxRecord,
  sparse:      MSX.boxSparse,
  damaged:     RefusalFuncs.damagedBoxRow,
  stale:       Refusals.staleBox,
}

const VaultKind: StoreKind<VaultScope, VaultRecord, VaultSparse> = {
  scopeOf:     (duck) => CX.vaultScope.parse(duck),
  scopepathOf: Scopepath.vault,
  record:      MSX.vaultRecord,
  sparse:      MSX.vaultSparse,
  damaged:     RefusalFuncs.damagedVaultRow,
  stale:       Refusals.staleVaultRecord,
}
// --

// == [StoreFront]

/** The models' storage over a backend of your own: extend it, implement its four `do*` hooks, and hand `vaultStore(bankScope)` to the bank and `boxStore(vaultScope)` to each vault.
 * The front does the judging of {@link Store}: the order a versioned put is judged in, the tombstone a
 * deletion lands at the next `revision_seq` under a fresh `revision_tok`, and a row that reads as
 * neither the kind's record nor its tombstone refused by name, 'damaged_box' or 'damaged_vault',
 * never stored over and never repaired. A hook stores rows exactly as handed and hands back exactly
 * what is stored: plain JSON, filed under the scopepaths `Scopepath` gives.
 *
 * A throw from a hook rejects the call: a VaultError as it came, anything else as
 * 'storage_unavailable'. While nobody, or another user than the scope's `user_id`, is signed in,
 * each hook refuses 'identity_revoked', and the watch reports it as trouble: each thing then fetches
 * again, and the bank hears 'identity_revoked' as bad news.
 */
export abstract class StoreFront {
  readonly clock: Clock

  /** A front whose tombstones are stamped by `opts.clock`, `wallClock` where left out. `opts` that fail {@link MSX.storeFrontOpts} refuse 'bad_option'. */
  constructor(opts: StoreFrontOpts = {}) {
    const { clock = wallClock } = MSX.storeFrontOpts.parse(opts)
    this.clock = clock
  }

  // == [Hooks]: doGetRows, doSwapRow, doFindRows, doWatch

  /** The row under each of `scopepaths`, in order, null for none, read in one atomic step. */
  protected abstract doGetRows(scopepaths: readonly string[]): Promise<readonly unknown[]>

  /** Hand `swap` the row under `scopepath` (null for none) and do as it answers, in one atomic step, so no other write lands between the read and the write: undefined leaves the row, null removes it, anything else is stored in its place. Answer the row `swap` was handed. */
  protected abstract doSwapRow(scopepath: string, swap: RowSwap): Promise<unknown>

  /** Every row whose scopepath begins with `scopepathPrefix`, as `{ scopepath, row }`, in any order: `isWithin` tells each such scopepath, for a backend that cannot read by prefix. */
  protected abstract doFindRows(scopepathPrefix: string, isWithin: Scopepath.ScopepathPred): Promise<readonly FoundRow[]>

  /** Call `onChange` after any write to a row under `scopepathPrefix`, from this device or another, and `onTrouble` with what went wrong where the watch fails; answer the unwatch. A backend without push leaves it as it is, never calling either. */
  protected doWatch(_scopepathPrefix: string, _onChange: () => void, _onTrouble: (err: unknown) => void): () => void {
    return noop
  }
  // --

  // == [Stores]: vaultStore, boxStore

  /** The vault records of the bank `scope` names. A scope that fails its check refuses 'bad_scope'. */
  vaultStore(scope: BankScope): FrontedVaultStore {
    return new FrontedRows(this, VaultKind, Scopepath.withinBankScopepathPred(scope), Scopepath.withinBankScopepathPrefix(scope), null)
  }

  /** The boxes of the vault `scope` names, each answer carrying the vault's row as stored as its world. A scope that fails its check refuses 'bad_scope'. */
  boxStore(scope: VaultScope): FrontedBoxStore {
    return new FrontedRows(this, BoxKind, Scopepath.withinVaultScopepathPred(scope), Scopepath.withinVaultScopepathPrefix(scope), Scopepath.vault(scope))
  }
  // --

  // == [Hooks as the stores call them]: getRows, swapRow, findRows, watchRows

  /** {@link doGetRows}, its rows checked one for each scopepath asked, a throw made storage trouble. */
  async getRows(scopepaths: readonly string[]): Promise<readonly unknown[]> {
    const rows = await adaptedHook(() => this.doGetRows(scopepaths))
    MSX.storeRows.parse(rows)
    if (rows.length !== scopepaths.length) { throw RefusalFuncs.storeRowsMiscounted() }
    return rows
  }

  /** {@link doSwapRow}, a throw made storage trouble. */
  swapRow(scopepath: string, swap: RowSwap): Promise<unknown> {
    return adaptedHook(() => this.doSwapRow(scopepath, swap))
  }

  /** {@link doFindRows}, its rows checked as `{ scopepath, row }` and each within the prefix, a throw made storage trouble. */
  async findRows(scopepathPrefix: string, isWithin: Scopepath.ScopepathPred): Promise<readonly FoundRow[]> {
    const found = MSX.foundRows.parse(await adaptedHook(() => this.doFindRows(scopepathPrefix, isWithin)))
    return found.filter((row) => isWithin(row.scopepath))
  }

  /** {@link doWatch}, a throw as it starts handed to `onTrouble` on the next tick. */
  watchRows(scopepathPrefix: string, onChange: () => void, onTrouble: (err: unknown) => void): () => void {
    try {
      return this.doWatch(scopepathPrefix, onChange, onTrouble)
    } catch (err) {
      queueMicrotask(() => { onTrouble(err) })
      return noop
    }
  }
  // --
}
// --

// == [FrontedRows]

/** One kind of thing within one bank or vault, as {@link StoreFront.vaultStore} and {@link StoreFront.boxStore} make it. */
class FrontedRows<ScopeT extends object, SparseT extends SparseBase<ScopeT>, RecordT extends SparseT> implements FrontedStore<ScopeT, RecordT, SparseT> {
  readonly #front:       StoreFront
  readonly #kind:        StoreKind<ScopeT, RecordT, SparseT>
  readonly #isWithin:    Scopepath.ScopepathPred
  readonly #prefix:      string
  readonly #worldpath:   string | null

  constructor(front: StoreFront, kind: StoreKind<ScopeT, RecordT, SparseT>, isWithin: Scopepath.ScopepathPred, prefix: string, worldpath: string | null) {
    this.#front     = front
    this.#kind      = kind
    this.#isWithin  = isWithin
    this.#prefix    = prefix
    this.#worldpath = worldpath
  }

  // == [Store verbs]: get, put, del, delUnparsed

  async get(scope: ScopeT): Promise<Answer<ScopeT, RecordT, SparseT>> {
    const { asked, scopepath } = this.#askedOf(scope)
    const [row, world = null] = await this.#front.getRows(this.#worldpath === null ? [scopepath] : [scopepath, this.#worldpath])
    return { ...this.#fetchedOf(scopepath, row), scope: asked, world }
  }

  async put(record: RecordT, priorRevisionTok: string | null): Promise<Answer<ScopeT, RecordT, SparseT>> {
    this.#kind.record.parse(record)
    const { asked, scopepath } = this.#askedOf(record)
    const prior = MSX.priorRevisionTok.parse(priorRevisionTok)
    const fits = prior === null ? record.revision_seq === 0 : record.revision_seq > 0
    if (! fits) { return { ...bad(RefusalFuncs.putUnfitForPrior()), scope: asked, world: await this.#worldNow() } }
    const judge = (stored: unknown): Outcome<Fetched<RecordT, SparseT> | null> => this.#judgePut(this.#fetchedOf(scopepath, stored), record, prior)
    const stored = await this.#front.swapRow(scopepath, (row) => (judge(row).ok ? record : undefined))
    return { ...judge(stored), scope: asked, world: await this.#worldNow() }
  }

  async del(scope: ScopeT, priorRevisionTok: string | null): Promise<Answer<ScopeT, RecordT, SparseT>> {
    const { asked, scopepath } = this.#askedOf(scope)
    const prior = MSX.priorRevisionTok.parse(priorRevisionTok)
    const fresh = { revision_tok: randomId(), written_at: this.#front.clock.now() }
    const judge = (stored: unknown): Outcome<Fetched<RecordT, SparseT> | null> => this.#judgeDel(this.#fetchedOf(scopepath, stored), prior, fresh)
    const stored = await this.#front.swapRow(scopepath, (row) => {
      const verdict = judge(row)
      return (verdict.ok && verdict.val !== null) ? verdict.val : undefined
    })
    return { ...judge(stored), scope: asked, world: await this.#worldNow() }
  }

  async delUnparsed(scope: ScopeT): Promise<Answer<ScopeT, RecordT, SparseT>> {
    const { asked, scopepath } = this.#askedOf(scope)
    const isDamaged = (row: unknown): boolean => ! this.#fetchedOf(scopepath, row).ok
    const stored = await this.#front.swapRow(scopepath, (row) => (isDamaged(row) ? null : undefined))
    const now = isDamaged(stored) ? good(null) : this.#fetchedOf(scopepath, stored)
    return { ...now, scope: asked, world: await this.#worldNow() }
  }
  // --

  // == [The watch]: watch

  watch(onNotice: (notice: Notice<RecordT, SparseT>) => Promise<void>, fullFor: () => readonly ScopeT[], onChange: () => void): () => void {
    MSX.storeWatchArgs.parse({ onNotice, fullFor, onChange })
    let live = true
    // The revision_tok of each row as last swept: a row whose tok is unchanged sends nothing.
    let seen = new Map<string, string | null>()
    const ring = (): void => {
      if (! live) { return }
      try {
        onChange()
      } catch (err) {
        reportToPlatform(err)
      }
    }
    const push = async (notice: Notice<RecordT, SparseT>): Promise<void> => {
      if (! live) { return }
      try {
        await onNotice(notice)
      } catch (err) {
        reportToPlatform(err)
      }
    }
    const sweep = async (announce: boolean): Promise<void> => {
      const swept = await outcomeOf(async () => ({ found: await this.#front.findRows(this.#prefix, this.#isWithin), world: await this.#worldNow() }))
      if (! live) { return }
      if (! swept.ok) { ring(); return }
      const { found, world } = swept.val
      const { now, changed, troubled } = this.#changesSince(seen, found)
      seen = now
      if (! announce) { return }
      const full = new Set(fullFor().map((scope) => this.#kind.scopepathOf(scope)))
      for (const record of changed) {
        await push({ record: full.has(this.#kind.scopepathOf(record)) ? record : this.#sparseOf(record), world })
      }
      if (troubled) { ring() }
    }
    // Sweeps run one at a time, in order: the first learns what is stored, each after it tells what changed.
    let sweeping = sweep(false)
    const queueSweep = (): void => {
      const prior = sweeping
      sweeping = (async () => {
        await prior
        try {
          await sweep(true)
        } catch (err) {
          reportToPlatform(err)
        }
      })()
    }
    const unwatch = this.#front.watchRows(this.#prefix, queueSweep, ring)
    return () => {
      if (! live) { return }
      live = false
      try {
        unwatch()
      } catch (err) {
        reportToPlatform(err)
      }
    }
  }
  // --

  // == [Judging]: changesSince, askedOf, fetchedOf, sparseOf, judgePut, judgeDel, worldNow

  /** What `found` holds since `seen`, the `revision_tok` of each row as last swept (null for one that does not read): each row now so, each record that changed, and whether a row came to not read or vanished. */
  #changesSince(seen: ReadonlyMap<string, string | null>, found: readonly FoundRow[]): { now: Map<string, string | null>, changed: Fetched<RecordT, SparseT>[], troubled: boolean } {
    const now = new Map<string, string | null>()
    const changed: Fetched<RecordT, SparseT>[] = []
    let troubled = false
    for (const { scopepath, row } of found) {
      const fetched = this.#fetchedOf(scopepath, row)
      const record = fetched.ok ? fetched.val : null
      now.set(scopepath, record?.revision_tok ?? null)
      if (seen.has(scopepath) && seen.get(scopepath) === now.get(scopepath)) { continue }
      if (record === null) { troubled = true } else { changed.push(record) }
    }
    for (const scopepath of seen.keys()) { if (! now.has(scopepath)) { troubled = true } }
    return { now, changed, troubled }
  }

  /** The scope of `duck`, checked, and its scopepath; 'bad_scope' for one that fails its check or lies outside this store's bank or vault. */
  #askedOf(duck: unknown): { asked: ScopeT, scopepath: string } {
    const asked = this.#kind.scopeOf(duck)
    const scopepath = this.#kind.scopepathOf(asked)
    if (! this.#isWithin(scopepath)) { throw RefusalFuncs.scopeOutsideStore() }
    return { asked, scopepath }
  }

  /** The row stored under `scopepath` as this kind reads it: null for none, the full record, or its tombstone; anything else, or a record of another scope, is damaged. */
  #fetchedOf(scopepath: string, row: unknown): Outcome<Fetched<RecordT, SparseT> | null> {
    if (row === null || row === undefined) { return good(null) }
    const full = this.#kind.record.safeParse(row)
    if (full.success && this.#kind.scopepathOf(full.data) === scopepath) { return good(full.data) }
    const sparse = this.#kind.sparse.safeParse(row)
    if (sparse.success && MSX.isTombstone(sparse.data) && this.#kind.scopepathOf(sparse.data) === scopepath) { return good(sparse.data) }
    return bad(this.#kind.damaged())
  }

  /** The sparse form of a record that read. */
  #sparseOf(record: Fetched<RecordT, SparseT>): SparseT {
    return this.#kind.sparse.parse(record)
  }

  /** The answer to a put of `record` over `prior` where `stored` is read: the record, where it lands. */
  #judgePut(stored: Outcome<Fetched<RecordT, SparseT> | null>, record: RecordT, prior: string | null): Outcome<Fetched<RecordT, SparseT> | null> {
    if (! stored.ok) { return stored }
    if (stored.val === null) { return prior === null ? good(record) : bad(this.#kind.stale(null)) }
    if (stored.val.revision_tok !== prior) { return bad(this.#kind.stale(stored.val)) }
    if (record.revision_seq !== stored.val.revision_seq + 1) { return bad(RefusalFuncs.putUnfitForPrior()) }
    return good(record)
  }

  /** The answer to a deletion over `prior` where `stored` is read: the tombstone it lands under `fresh`, or null over no row. */
  #judgeDel(stored: Outcome<Fetched<RecordT, SparseT> | null>, prior: string | null, fresh: { revision_tok: string, written_at: number }): Outcome<Tombstone<SparseT> | null> {
    if (! stored.ok) { return stored }
    if (stored.val === null) { return prior === null ? good(null) : bad(this.#kind.stale(null)) }
    if (stored.val.revision_tok !== prior) { return bad(this.#kind.stale(stored.val)) }
    return good({ ...this.#sparseOf(stored.val), am: 'x', revision_seq: stored.val.revision_seq + 1, ...fresh })
  }

  /** The world as stored now: the vault's row, for a box store; null for a vault store, whose world is the bank. */
  async #worldNow(): Promise<unknown> {
    if (this.#worldpath === null) { return null }
    const [world] = await this.#front.getRows([this.#worldpath])
    return world ?? null
  }
  // --
}
// --

// == [Hook adapter]: adaptedHook

/** `hook`'s answer, a throw made storage trouble by {@link storageTroubleOf}. */
const adaptedHook = async <AnswerT>(hook: () => Promise<AnswerT>): Promise<AnswerT> => {
  try {
    return await hook()
  } catch (err) {
    throw storageTroubleOf(err)
  }
}
// --

// == [localStoreFront]: localStoreFront

/** A store front over a {@link StringStore}, keeping rows as JSON text under the scopepaths `Scopepath` gives, as `localVaultDB` does.
 * Each swap reads and writes in one synchronous step, so nothing else in this tab runs between: two
 * tabs sharing one localStorage are not held apart. A row an older version wrote reads as damaged.
 * `opts` that fail {@link MSX.localStoreFrontOpts} refuse 'bad_option'.
 *
 * @example
 *   const front = localStoreFront({ store: memoryStore() })
 *   await front.boxStore(vaultScope).get(boxscope)   // { ok: true, val: null, scope: boxscope, world: null }
 */
export const localStoreFront = (opts: LocalStoreFrontOpts): StoreFront => {
  MSX.localStoreFrontOpts.parse(opts)
  return new StringStoreFront(opts)
}

class StringStoreFront extends StoreFront {
  readonly #store: StringStore

  constructor(opts: LocalStoreFrontOpts) {
    super({ clock: opts.clock })
    this.#store = opts.store
  }

  protected doGetRows(scopepaths: readonly string[]): Promise<readonly unknown[]> {
    return soon(() => scopepaths.map((scopepath) => getJson(this.#store, scopepath)))
  }

  protected doSwapRow(scopepath: string, swap: RowSwap): Promise<unknown> {
    return soon(() => {
      const stored = getJson(this.#store, scopepath)
      const next = swap(stored)
      if (next === null) { this.#store.del(scopepath) }
      if (next !== null && next !== undefined) { this.#store.put(scopepath, JSON.stringify(next)) }
      return stored
    })
  }

  protected doFindRows(_scopepathPrefix: string, isWithin: Scopepath.ScopepathPred): Promise<readonly FoundRow[]> {
    return soon(() => this.#store.scopepaths().filter((scopepath) => isWithin(scopepath)).map((scopepath) => ({ scopepath, row: getJson(this.#store, scopepath) })))
  }

  protected override doWatch(_scopepathPrefix: string, onChange: () => void): () => void {
    return this.#store.subscribe(onChange)
  }
}

/** `fn`'s result (or failure) as a promise: a sync throw becomes a rejection, never an escape. */
const soon = async <ValT>(fn: () => ValT | Promise<ValT>): Promise<ValT> => await fn()
// --
