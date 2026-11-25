/** `VaultTSQ`, which keeps one bank's boxes and their listings in a TanStack Query client it is handed, from what a VaultMinder tells. */

import * as TSQ from '@tanstack/query-core'
import { noop } from 'es-toolkit'
import { type Errors, Outcome } from 'safebyok-big/internals'
import { Labelpath } from '../shapes/primitives'
import type { MaskedRow } from '../shapes/shapes-masked-view'
import { type ThingRecord, type ThingScope, ThingChecks } from '../shapes/shapes-thing'
import type { BankScope } from '../shapes/shapes-stamps'
import { type GetOnceOpts, type ItemQueryOptions, type VaultMutationOptions, type VaultTSQOpts, VaultTSQChecks } from '../shapes/shapes-vault-tsq'
import type { VaultEvent } from '../shapes/shapes-vault-event'
import { BaseThing } from '../models/base-thing'
import type { ThingCar } from './thing-car'
import type { VaultMinder } from './vault-minder'
import type { Kids } from '../shapes/shapes-answers'
import * as Throwers from '../refusals/throwers'
import { maskedOf } from '../helpers/mask-ciphertexts'
import { bankKeyHeadOf, labelsOf } from './query-keys'

// == [VaultTSQ]: VaultTSQ

// The writer, `#hear` and `#hearRefused`, is the only code that changes an item or a listing: the queryFns answer what
// the Thing holds, and nothing here acts on a query's success.
/** One bank's vault TSQ: its boxes under the root box, as items, and their listings, in a client it is handed.
 * An item is the box's live record, deep-equal to the one its Thing holds, or null where none is stored live. Across
 * revisions, a part of the record left unchanged stays the same object. Once the box is known only sparse in a newer life
 * than the item holds, the item is null; a box known only sparse from the first has no data. An item is stale while a
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
  /** The bank. */
  readonly #scope:       BankScope
  /** The host's `onBadNews`, told of each record refused. */
  readonly #onBadNews:   (news: Errors.VaultError) => void
  /** Ends the listen to the VaultMinder, or null while it is not heard. */
  #unlisten:             (() => void) | null = null
  // --

  // == [Construction]: make, constructor

  // TanStack Query merges every query default whose key is a prefix of a query's key, and a query's own options over
  // them, so a host's options win and nothing outside the bank's key is touched.
  /** Keep the bank's boxes in `opts.queryClient` from what `opts.vaultMinder` tells once {@link connect}ed, telling `opts.onBadNews` of trouble.
   * Its query and mutation defaults go under the bank's key, where a host's own options override them.
   */
  static make(opts: VaultTSQOpts): VaultTSQ { return new VaultTSQ(VaultTSQChecks.makeArgs.parse(opts)) }

  private constructor({ vaultMinder, queryClient, scope, onBadNews = noop }: VaultTSQOpts) {
    this.#vaultMinder = vaultMinder
    this.#queryClient = queryClient
    this.#scope       = Object.freeze({ userid: scope.userid, banklabel: scope.banklabel })
    this.#onBadNews   = onBadNews
    const bankHead    = VaultTSQ.bankQueryKeyOf(this.#scope)
    queryClient.setQueryDefaults(bankHead, BankDefaults)
    queryClient.setMutationDefaults(bankHead, BankDefaults)
    queryClient.setQueryDefaults([...bankHead, Itemkind], {
      queryFn:   async ({ queryKey }) => await this.#itemOf(labelpathOfItemKey(queryKey)),
      staleTime: ({ queryKey }) => ((this.#isMinded && (this.#vaultMinder.carAt(this.#scopeOf(labelpathOfItemKey(queryKey)))?.agekind === 'here')) ? Infinity : 0),
    })
    // A listing is kept nowhere but its query, so it stays while no one observes it.
    queryClient.setQueryDefaults([...bankHead, Listkind], {
      queryFn:   async ({ queryKey }) => await this.#vaultMinder.listOnce(labelpathOfListKey(queryKey)),
      staleTime: () => (this.#isMinded ? Infinity : 0),
      gcTime:    Infinity,
    })
    Object.freeze(this)
  }
  // --

  // == [Keys]: itemQueryKeyOf, listQueryKeyOf, bankQueryKeyOf

  // A key is the bank's three segments, the kind of query ('item' or 'list'), the labelpath's labels with '/' between
  // them, then a mark: '!' for the item, '#' and 'kids' for the listing. Without a mark the root box's item key would
  // start every box's.
  /** The query key of `scope`'s item. */
  static itemQueryKeyOf(scope: ThingScope): TSQ.QueryKey {
    const { userid, banklabel, labelpath } = ThingChecks.thingScope.parse(scope)
    return [...bankKeyHeadOf({ userid, banklabel }), Itemkind, ...labelsOf(labelpath), '!']
  }

  /** The query key of the listing of `scope`'s children. */
  static listQueryKeyOf(scope: ThingScope): TSQ.QueryKey {
    const { userid, banklabel, labelpath } = ThingChecks.thingScope.parse(scope)
    return [...bankKeyHeadOf({ userid, banklabel }), Listkind, ...labelsOf(labelpath), '#', 'kids']
  }

  /** The key prefix of everything kept for `scope`'s bank. */
  static bankQueryKeyOf(scope: BankScope): TSQ.QueryKey { return bankKeyHeadOf(ThingChecks.bankScope.parse(scope)) }
  // --

  // == [Reading]: itemQueryOptions, getOnce, listOnce

  /** The query key of the box at `scope`, and its seed from what its Thing holds, for a host's query of it. */
  itemQueryOptions(scope: ThingScope): ItemQueryOptions {
    const itemScope = this.#parseItemScope(scope)
    const car       = this.#vaultMinder.carAt(itemScope)
    const queryKey  = VaultTSQ.itemQueryKeyOf(itemScope)
    const seed      = car && itemValOf(car)
    if ((seed === undefined) || (car === undefined) || (car.agekind === 'vacant')) { return { queryKey } }
    return { queryKey, initialData: seed, initialDataUpdatedAt: car.read_at }
  }

  /** Get the box at `scope` once, unless its item is fresh by `opts.staleTime`: its live record, or null where none is stored live.
   * Refuses `stale_read` where storage answers an earlier life than the box's newest known only sparse. Rejects with the
   * library's `CancelledError` where the item, holding no data, is reset while the get runs.
   */
  async getOnce(scope: ThingScope, opts: GetOnceOpts = {}): Promise<ThingRecord | null> {
    const { staleTime } = VaultTSQChecks.getOnceOpts.parse(opts)
    const queryKey      = VaultTSQ.itemQueryKeyOf(this.#parseItemScope(scope))
    return await this.#queryClient.query<ThingRecord | null>({ queryKey, ...((staleTime !== undefined) && { staleTime }) })
  }

  /** List the children of the box at `labelpath` once, whatever its listing holds. */
  async listOnce(labelpath: Labelpath): Promise<Kids> {
    const scope = VaultTSQChecks.listScope.parseConsistent({ ...this.#scope, labelpath }, this.#scope)
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
      onBadNews: (news, labelpath) => {
        this.#hearRefused(labelpath)
        this.#onBadNews(news)
      },
    })
    void this.#queryClient.invalidateQueries({ queryKey: [...VaultTSQ.bankQueryKeyOf(this.#scope), Listkind] }, { cancelRefetch: false })
    return this
  }

  /** Stop hearing the VaultMinder until the next {@link connect}: the items and listings stay as they are, stale. A second call does nothing. */
  disconnect(): this {
    const unlisten = this.#unlisten
    this.#unlisten = null
    unlisten?.()
    return this
  }

  /** True while this hears the VaultMinder and it watches its vaultDB: what is kept is then told each change. */
  get #isMinded(): boolean { return (this.#unlisten !== null) && this.#vaultMinder.isWatching }
  // --

  // == [The writer]: #hear, #hearLife, #hearRefused

  /** Bring the items up to date with `event`, and the listings with a `life` event. */
  #hear(event: VaultEvent): void {
    if (event.eventkind === 'life') { this.#hearLife(event.labelpath); return }
    if (! isItemLabelpath(event.labelpath)) { return }
    const scope    = this.#scopeOf(event.labelpath)
    const queryKey = VaultTSQ.itemQueryKeyOf(scope)
    const car      = this.#vaultMinder.carAt(scope)!
    if (event.eventkind === 'aged') {
      // An aged event is never of a Thing seen whole: its agekind is cold or bare. Bare over an item with data, the box
      // has a life newer than the record the item holds, so it is known to have been deleted since: the item is null, and
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
    // The record the Thing holds, as the item's queryFn answers it.
    const record = (event.liveness === 'full') ? car.thing.pickle() : null
    this.#queryClient.setQueryData(queryKey, record, { updatedAt: car.read_at })
  }

  // Resetting, not removing, the box's own listing: a removal reaches the cache and not the observers.
  /** Bring the listings up to date with a new life of the Thing at `labelpath`: its parent's is refetched, and its own reset. */
  #hearLife(labelpath: Labelpath): void {
    if (! Labelpath.isBox(labelpath)) { return }
    if (isItemLabelpath(labelpath)) {
      const parentKey = VaultTSQ.listQueryKeyOf(this.#scopeOf(Labelpath.parentOf(labelpath)))
      void this.#queryClient.invalidateQueries({ queryKey: parentKey, exact: true }, { cancelRefetch: false })
    }
    void this.#queryClient.resetQueries({ queryKey: VaultTSQ.listQueryKeyOf(this.#scopeOf(labelpath)), exact: true })
  }

  // A refusal met by the item's own fetch lands while that fetch runs, so the refetch it asks for is that same fetch, and
  // nothing loops.
  /** Refetch the item of the box at `labelpath`, a record of which its Thing refused, so that its query shows the refusal beside its data. */
  #hearRefused(labelpath: Labelpath | null): void {
    if ((labelpath === null) || ! isItemLabelpath(labelpath)) { return }
    const queryKey = VaultTSQ.itemQueryKeyOf(this.#scopeOf(labelpath))
    void this.#queryClient.invalidateQueries({ queryKey, exact: true }, { cancelRefetch: false })
  }
  // --

  // == [Helpers]: #itemOf, #scopeOf, #parseItemScope

  /** The item of the box at `labelpath`, as its Thing holds it once a get of it answers. */
  async #itemOf(labelpath: Labelpath): Promise<ThingRecord | null> {
    const record = await this.#vaultMinder.getOnce(this.#scopeOf(labelpath))
    return BaseThing.isTombstone(record) ? null : record
  }

  /** The scope of `labelpath` in this bank */
  #scopeOf(labelpath: Labelpath): ThingScope { return { ...this.#scope, labelpath } }

  /** `scope`, refused unless it is of a box under the root box in this bank */
  #parseItemScope(scope: ThingScope): ThingScope {
    const parsed = ThingChecks.thingScope.parseConsistent(scope, this.#scope)
    if (! isItemLabelpath(parsed.labelpath)) { throw Throwers.notMinded() }
    return parsed
  }
  // --

  // == [A devtool's view]: inspectable

  /** The bank's items and listings, each ciphertext masked, for a devtool.
   * Each has its key, its state, and a copy of its record or listing. What a host keeps beside them in the same client is left out.
   * For experimenting, never for an app's own logic: what it answers may change without notice.
   */
  inspectable(): MaskedRow[] {
    return this.#queryClient.getQueryCache().findAll({ queryKey: VaultTSQ.bankQueryKeyOf(this.#scope) }).map((tsqQuery) => {
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

// == [Helpers]: Itemkind, Listkind, LabelsIdx, BankDefaults, isItemLabelpath, itemValOf, labelpathOfItemKey, labelpathOfListKey

/** The kind segment of an item's query key. */
const Itemkind = 'item'
/** The kind segment of a listing's query key. */
const Listkind = 'list'
/** Where a query key's labels begin: after the bank's three segments and the kind. */
const LabelsIdx = 4

// Under TanStack's own networkMode, 'online', a get made while the browser reports itself offline waits, and so does
// its caller. A retry would put a whizbang in the critical path of a primitive operation (CLAUDE.md).
/** The query and mutation defaults under the bank's key. */
const BankDefaults = Object.freeze({ networkMode: 'always', retry: false } as const)

/** True for the labelpath of a box under the root box: the Things an item is kept for. */
function isItemLabelpath(labelpath: Labelpath): boolean { return Labelpath.isBox(labelpath) && (labelpath !== Labelpath.RootBox) }

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
