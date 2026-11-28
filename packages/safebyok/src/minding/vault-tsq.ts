/** `VaultTSQ`, which caches one bank's boxes and their listings in a TanStack Query client it is handed, from what a VaultMinder tells. */

import * as TSQ from '@tanstack/query-core'
import { noop } from 'es-toolkit'
import { type Errors, Outcome } from 'safebyok-big/internals'
import { Labelpath } from '../shapes/primitives'
import type { MaskedRow } from '../shapes/shapes-masked-view'
import { type TableScope, type ThingRecord, type ThingScope, ThingChecks } from '../shapes/shapes-thing'
import type { BankScope } from '../shapes/shapes-stamps'
import { type GetOnceOpts, type ItemQueryOptions, type VaultMutationOptions, type VaultTSQOpts, VaultTSQChecks } from '../shapes/shapes-vault-tsq'
import type { VaultEvent } from '../shapes/shapes-vault-event'
import { BaseThing } from '../models/base-thing'
import type { ThingCar } from './thing-car'
import type { VaultMinder } from './vault-minder'
import type { Kids } from '../shapes/shapes-answers'
import * as Throwers from '../refusals/throwers'
import { maskedOf } from '../helpers/mask-ciphertexts'
import { labelsOf, tableKeyHeadOf } from './query-keys'

// == [VaultTSQ]: VaultTSQ

// The writer, `#hear`, `#hearLife` and `#hearRefused`, is the only code that changes an item or a listing: the queryFns
// answer with the Thing's record, and nothing here acts on a query's success.
/** One bank's vault TSQ: its boxes under the root box, as items, and their listings, in a client it is handed.
 * An item is the box's live record, deep-equal to the one its Thing has, or null where none is stored live. Across
 * revisions, a part of the record left unchanged stays the same object. Once the box is known only sparse in a newer life
 * than the item has, the item is null; a box known only sparse from the first has no data. An item is stale while a
 * newer revision is known only sparse.
 * A listing is the kids value a list last answered, kept while nothing observes it, and invalidated once a child's life changes.
 * It hears the VaultMinder from its `connect` to its `disconnect`. An item or a listing is fresh for good only while it
 * hears a VaultMinder that watches its vaultDB; otherwise it is stale at once.
 * Its queries never retry, and run whether or not the browser reports itself online.
 */
export class VaultTSQ {
  // == [Props]: #vaultMinder, #queryClient, #scope, #onBadNews, #unlisten

  readonly #vaultMinder: VaultMinder
  readonly #queryClient: TSQ.QueryClient
  /** The bank's scope. */
  readonly #scope:       BankScope
  /** The host's `onBadNews`, told of each record refused. */
  readonly #onBadNews:   (news: Errors.VaultError) => void
  /** Ends the listen to the VaultMinder, or null while it is not heard. */
  #unlisten:             (() => void) | null = null
  // --

  // == [Construction]: make, constructor

  // TanStack Query merges every query default whose key is a prefix of a query's key, and a query's own options over
  // them, so a host's options win and nothing outside the key of the bank's boxes is touched. It sets no mutation
  // defaults: a host's box write takes its options from {@link mutationOptionsOf}, and a form verb's from the giver.
  /** Make the bank's vault TSQ in `opts.queryClient`, which caches the bank's boxes from what `opts.vaultMinder` tells once {@link connect}ed.
   * Trouble goes to `opts.onBadNews`. Its query defaults go under the key of the bank's boxes, where a host's own options override them.
   */
  static make(opts: VaultTSQOpts): VaultTSQ { return new VaultTSQ(VaultTSQChecks.makeArgs.parse(opts)) }

  private constructor({ vaultMinder, queryClient, scope, onBadNews = noop }: VaultTSQOpts) {
    this.#vaultMinder = vaultMinder
    this.#queryClient = queryClient
    this.#scope       = Object.freeze({ userid: scope.userid, banklabel: scope.banklabel })
    this.#onBadNews   = onBadNews
    const boxesHead   = this.#boxesKey
    queryClient.setQueryDefaults(boxesHead, BankDefaults)
    queryClient.setQueryDefaults([...boxesHead, Itemkind], {
      queryFn:   async ({ queryKey }) => await this.#itemOf(labelpathOfItemKey(queryKey)),
      staleTime: ({ queryKey }) => ((this.#isMinded && (this.#vaultMinder.carAt(this.#boxScopeOf(labelpathOfItemKey(queryKey)))?.agekind === 'here')) ? Infinity : 0),
    })
    // A listing is cached nowhere but in its query, so it stays while no one observes it.
    queryClient.setQueryDefaults([...boxesHead, Listkind], {
      queryFn:   async ({ queryKey }) => await this.#vaultMinder.listOnce(this.#boxScopeOf(labelpathOfListKey(queryKey))),
      staleTime: () => (this.#isMinded ? Infinity : 0),
      gcTime:    Infinity,
    })
    Object.freeze(this)
  }
  // --

  // == [Keys]: itemQueryKeyOf, listQueryKeyOf, tableQueryKeyOf

  // A key is the table's four segments ('sok', the modelkind, the userid and the banklabel), the kind of query ('item' or
  // 'list'), the labelpath's labels with '/' between them, then a mark: '!' for the item, '#' and 'kids' for the listing.
  // Without a mark the root box's item key would start every box's.
  /** The query key of `scope`'s item. */
  static itemQueryKeyOf(scope: ThingScope): TSQ.QueryKey {
    const { labelpath, ...table } = ThingChecks.thingScope.parse(scope)
    return [...tableKeyHeadOf(table), Itemkind, ...labelsOf(labelpath), '!']
  }

  /** The query key of the listing of `scope`'s children. */
  static listQueryKeyOf(scope: ThingScope): TSQ.QueryKey {
    const { labelpath, ...table } = ThingChecks.thingScope.parse(scope)
    return [...tableKeyHeadOf(table), Listkind, ...labelsOf(labelpath), '#', 'kids']
  }

  /** The key prefix of everything cached for the Things of `scope`'s kind in its bank: for a vault TSQ, whose Things are boxes, everything it caches. */
  static tableQueryKeyOf(scope: TableScope): TSQ.QueryKey { return tableKeyHeadOf(ThingChecks.tableScope.parse(scope)) }
  // --

  // == [Reading]: itemQueryOptions, getOnce, listOnce

  /** The query key of the box at `scope`, and its seed from what its Thing has, for a host's query of it. */
  itemQueryOptions(scope: ThingScope): ItemQueryOptions {
    const itemScope = this.#parseItemScope(scope)
    const car       = this.#vaultMinder.carAt(itemScope)
    const queryKey  = VaultTSQ.itemQueryKeyOf(itemScope)
    const seed      = car && itemValOf(car)
    if ((seed === undefined) || (car === undefined) || (car.agekind === 'vacant')) { return { queryKey } }
    return { queryKey, initialData: seed, initialDataUpdatedAt: car.read_at }
  }

  /** Get the box at `scope` once, unless its item is fresh by `opts.staleTime`: its live record, or null where none is stored live.
   * Refuses `stale_read` where the box's newest life is known only sparse and storage answers an earlier one. Rejects with the
   * library's `CancelledError` where the item, having no data, is reset while the get runs.
   */
  async getOnce(scope: ThingScope, opts: GetOnceOpts = {}): Promise<ThingRecord | null> {
    const { staleTime } = VaultTSQChecks.getOnceOpts.parse(opts)
    const queryKey      = VaultTSQ.itemQueryKeyOf(this.#parseItemScope(scope))
    return await this.#queryClient.query<ThingRecord | null>({ queryKey, ...((staleTime !== undefined) && { staleTime }) })
  }

  /** List the children of the box at `labelpath` once, whatever its listing has. */
  async listOnce(labelpath: Labelpath): Promise<Kids> {
    const scope = VaultTSQChecks.listScope.parseConsistent(this.#boxScopeOf(labelpath), this.#scope)
    return await this.#queryClient.query<Kids>({ queryKey: VaultTSQ.listQueryKeyOf(scope), staleTime: 0 })
  }
  // --

  // == [Writing]: mutationOptionsOf

  /** The options of a host's mutation that runs `mutationFn` once, whether or not the browser reports itself online. */
  static mutationOptionsOf<TData, TVariables>(mutationFn: TSQ.MutationFunction<TData, TVariables>): VaultMutationOptions<TData, TVariables> {
    VaultTSQChecks.mutationFn.parse(mutationFn)
    return { mutationFn, ...BankDefaults }
  }
  // --

  // == [Hearing]: connect, disconnect, #isMinded

  // What was missed while not hearing a watching VaultMinder is unknown, so a listing may be out of date. An item is
  // left be: a listing refetched tells the VaultMinder each child's sparse record, and a box that moved meanwhile goes
  // cold, which invalidates its item.
  /** Hear the VaultMinder, and invalidate every listing of the bank. A second call does nothing. */
  connect(): this {
    if (this.#unlisten !== null) { return this }
    // Synchronous on purpose: the VaultMinder tells an answer's records before its verb resolves.
    this.#unlisten = this.#vaultMinder.listen({
      hear:      (event) => { this.#hear(event) },
      onBadNews: (news, scope) => {
        this.#hearRefused(scope)
        this.#onBadNews(news)
      },
    })
    void this.#queryClient.invalidateQueries({ queryKey: [...this.#boxesKey, Listkind] }, { cancelRefetch: false })
    return this
  }

  /** Stop hearing the VaultMinder until the next {@link connect}: the items and listings stay as they are, stale. A second call does nothing. */
  disconnect(): this {
    const unlisten = this.#unlisten
    this.#unlisten = null
    unlisten?.()
    return this
  }

  /** True while this hears the VaultMinder and it watches its vaultDB: what is cached is then told each change. */
  get #isMinded(): boolean { return (this.#unlisten !== null) && this.#vaultMinder.isWatching }
  // --

  // == [The writer]: #hear, #hearLife, #hearRefused

  /** Bring the items up to date with `event`, and the listings with a `life` event. Only a box's event is heard. */
  #hear(event: VaultEvent): void {
    if (event.modelkind !== 'box') { return }
    if (event.eventkind === 'life') { this.#hearLife(event.labelpath); return }
    if (event.labelpath === Labelpath.RootBox) { return }
    const scope    = this.#boxScopeOf(event.labelpath)
    const queryKey = VaultTSQ.itemQueryKeyOf(scope)
    const car      = this.#vaultMinder.carAt(scope)!
    if (event.eventkind === 'aged') {
      // An aged event is never of a Thing seen whole: its agekind is cold or bare. Bare over an item with data, the box
      // has a life newer than the record the item has, so it is known to have been deleted since: the item is null, and
      // stale. An item with no data shows nothing as deleted, and is reset, so that a fetch of it begun before the newer
      // record was known starts again.
      if ((event.agekind === 'bare') && (this.#queryClient.getQueryData(queryKey) === undefined)) {
        void this.#queryClient.resetQueries({ queryKey, exact: true })
        return
      }
      if (event.agekind === 'bare') { this.#queryClient.setQueryData(queryKey, null, { updatedAt: car.read_at }) }
      void this.#queryClient.invalidateQueries({ queryKey, exact: true }, { cancelRefetch: false })
      return
    }
    if (event.liveness === 'soon') { return }
    // The record the Thing has, as the item's queryFn answers it.
    const record = (event.liveness === 'full') ? car.thing.pickle() : null
    this.#queryClient.setQueryData(queryKey, record, { updatedAt: car.read_at })
  }

  // Resetting, not removing, the box's own listing: a removal reaches the cache and not the observers.
  /** Bring the listings up to date with a new life of the box at `labelpath`: its parent's is refetched, and its own reset. */
  #hearLife(labelpath: Labelpath): void {
    if (labelpath !== Labelpath.RootBox) {
      const parentKey = VaultTSQ.listQueryKeyOf(this.#boxScopeOf(Labelpath.parentOf(labelpath)))
      void this.#queryClient.invalidateQueries({ queryKey: parentKey, exact: true }, { cancelRefetch: false })
    }
    void this.#queryClient.resetQueries({ queryKey: VaultTSQ.listQueryKeyOf(this.#boxScopeOf(labelpath)), exact: true })
  }

  // A refusal met by the item's own fetch is told while that fetch runs, so the refetch it asks for is that same fetch, and
  // nothing loops.
  /** Refetch the item of the box at `scope`, a record of which its Thing refused, so that its query shows the refusal beside its data. */
  #hearRefused(scope: ThingScope | null): void {
    if ((scope === null) || ! isItemScope(scope)) { return }
    const queryKey = VaultTSQ.itemQueryKeyOf(scope)
    void this.#queryClient.invalidateQueries({ queryKey, exact: true }, { cancelRefetch: false })
  }
  // --

  // == [Helpers]: #itemOf, #boxScopeOf, #boxesKey, #parseItemScope

  /** The item of the box at `labelpath`, as its Thing has it once a get of it answers. */
  async #itemOf(labelpath: Labelpath): Promise<ThingRecord | null> {
    const record = await this.#vaultMinder.getOnce(this.#boxScopeOf(labelpath))
    return BaseThing.isTombstone(record) ? null : record
  }

  /** The scope of the box at `labelpath` in this bank */
  #boxScopeOf(labelpath: Labelpath): ThingScope { return { modelkind: 'box', ...this.#scope, labelpath } }

  /** The key prefix of every item and listing of this bank's boxes */
  get #boxesKey(): TSQ.QueryKey { return VaultTSQ.tableQueryKeyOf({ ...this.#scope, modelkind: 'box' }) }

  /** `scope`, refused unless it is of a box under the root box in this bank */
  #parseItemScope(scope: ThingScope): ThingScope {
    const scopeChecked = ThingChecks.thingScope.parseConsistent(scope, this.#scope)
    if (! isItemScope(scopeChecked)) { throw Throwers.notMinded() }
    return scopeChecked
  }
  // --

  // == [A devtool's view]: inspectable

  /** The bank's items and listings, each ciphertext masked, for a devtool.
   * Each has its key, its state, and a copy of its record or listing. What a host caches beside them in the same client is left out.
   * For experimenting, never for an app's own logic: what it answers may change without notice.
   */
  inspectable(): MaskedRow[] {
    return this.#queryClient.getQueryCache().findAll({ queryKey: this.#boxesKey }).map((tsqQuery) => {
      const { status, fetchStatus, dataUpdatedAt, isInvalidated, error: err, data: val } = tsqQuery.state
      return {
        queryKey:        [...tsqQuery.queryKey],
        status,
        fetchStatus,
        dataUpdatedAt,
        isInvalidated,
        lastRefusalkind: (err === null) ? null : Outcome.storageRefusalOf(err).refusalkind,
        val:             maskedOf(val),
      }
    })
  }
  // --
}
// --

// == [Helpers]: Itemkind, Listkind, LabelsIdx, BankDefaults, isItemScope, itemValOf, labelpathOfItemKey, labelpathOfListKey

/** The kind segment of an item's query key. */
const Itemkind = 'item'
/** The kind segment of a listing's query key. */
const Listkind = 'list'
/** Where a query key's labels begin: after the table's four segments and the kind of query. */
const LabelsIdx = 5

// Under TanStack's own networkMode, 'online', a get made while the browser reports itself offline waits, and so does
// its caller. A retry would put a whizbang in the critical path of a primitive operation (CLAUDE.md).
/** The query defaults under the key of the bank's boxes, and the options {@link VaultTSQ.mutationOptionsOf} gives every mutation. */
const BankDefaults = Object.freeze({ networkMode: 'always', retry: false } as const)

/** True for the scope of a box under the root box: the Things an item is cached for. */
function isItemScope({ modelkind, labelpath }: ThingScope): boolean { return (modelkind === 'box') && (labelpath !== Labelpath.RootBox) }

/** The item `car`'s Thing stands for: its live record, null for a tombstone or the shell, undefined where no whole record of its newest life is known */
function itemValOf(car: ThingCar): ThingRecord | null | undefined {
  if (car.agekind === 'bare') { return undefined }
  const record = car.thing.pickle()
  return BaseThing.isTombstone(record) ? null : record
}

/** The labelpath of an item's query key */
function labelpathOfItemKey(queryKey: TSQ.QueryKey): Labelpath { return queryKey.slice(LabelsIdx, -1).join('') }

/** The labelpath of a listing's query key */
function labelpathOfListKey(queryKey: TSQ.QueryKey): Labelpath { return queryKey.slice(LabelsIdx, -2).join('') }
// --
