/** `VaultTSQ`, which keeps one bank's boxes and their listings in a TanStack Query client it is handed, from what a SortedVaultDB tells. */

import * as TSQ from '@tanstack/query-core'
import { noop } from 'es-toolkit'
import { Labelpath } from '../shapes/primitives'
import { type MaskedRow, type MinderGetOpts, MinderChecks } from '../shapes/shapes-minder'
import { type ThingRecord, type ThingScope, ThingChecks } from '../shapes/shapes-thing'
import type { BankScope } from '../shapes/shapes-stamps'
import { type ItemQueryOptions, type VaultMutationOptions, type VaultTSQOpts, VaultTSQChecks } from '../shapes/shapes-vault-tsq'
import type { VaultEvent } from '../shapes/shapes-vault-event'
import { BaseThing } from '../models/base-thing'
import type { ReceivingThing } from '../shapes/shapes-sorted-vault-db'
import type { SortedVaultDB } from '../storage/sorted-vault-db'
import { readAtOf } from '../storage/thing-classifier'
import type { Kids } from '../storage/vault-db'
import * as Throwers from '../refusals/throwers'
import { maskedRowsOf } from './masked-rows'
import { bankKeyHeadOf, labelsOf } from './minder-keys'

// == [VaultTSQ]: VaultTSQ

// The writer, `#hear`, is the only code that changes an item or a listing: the queryFns answer what the Thing holds,
// and nothing here shares structure or acts on a query's success.
/** One bank's vault TSQ: its boxes under the root box, as items, and their listings, in a client it is handed.
 * An item is the box's own frozen record, the same object its Thing holds, or null where none is stored live. It has no
 * data while the box is known only sparse in its newest life. An item is stale while a newer revision is known only sparse.
 * A listing is the kids value a list last answered, invalidated once a child's life changes.
 * Its queries never retry, and run whether or not the browser reports itself online.
 */
export class VaultTSQ {
  // == [Props]: #vaultMinder, #queryClient, #scope, #unlisten

  readonly #vaultMinder: SortedVaultDB
  readonly #queryClient: TSQ.QueryClient
  /** The bank. */
  readonly #scope:       BankScope
  /** Ends the listen to the SortedVaultDB. */
  readonly #unlisten:    () => void
  // --

  // == [Construction]: make, constructor

  // TanStack Query merges every query default whose key is a prefix of a query's key, and a query's own options over
  // them, so a host's options win and nothing outside the bank's key is touched.
  /** Keep the bank's boxes in `opts.queryClient` from what `opts.vaultMinder` tells, from now on, telling `opts.onBadNews` of trouble.
   * Its query and mutation defaults go under the bank's key, where a host's own options override them.
   */
  static make(opts: VaultTSQOpts): VaultTSQ { return new VaultTSQ(VaultTSQChecks.makeArgs.parse(opts)) }

  private constructor({ vaultMinder, queryClient, scope, onBadNews = noop }: VaultTSQOpts) {
    this.#vaultMinder = vaultMinder
    this.#queryClient = queryClient
    this.#scope       = Object.freeze({ userid: scope.userid, banklabel: scope.banklabel })
    const bankHead    = VaultTSQ.bankQueryKeyOf(this.#scope)
    queryClient.setQueryDefaults(bankHead, BankDefaults)
    queryClient.setMutationDefaults(bankHead, BankDefaults)
    queryClient.setQueryDefaults([...bankHead, Itemkind], {
      queryFn:           async ({ queryKey }) => await this.#itemOf(labelpathOfItemKey(queryKey)),
      staleTime:         ({ queryKey }) => ((this.#vaultMinder.thingAt(this.#scopeOf(labelpathOfItemKey(queryKey)))?.agekind === 'here') ? Infinity : 0),
      structuralSharing: false,
    })
    queryClient.setQueryDefaults([...bankHead, Listkind], {
      queryFn:   async ({ queryKey }) => await this.#vaultMinder.listOnce(labelpathOfListKey(queryKey)),
      staleTime: Infinity,
    })
    // Synchronous on purpose: the SortedVaultDB tells an answer's records before its verb resolves.
    this.#unlisten = vaultMinder.listen({ hear: (event) => { this.#hear(event) }, onBadNews })
    Object.freeze(this)
  }
  // --

  // == [Keys]: itemQueryKeyOf, listQueryKeyOf, bankQueryKeyOf

  // A key is the bank's three segments, the kind of query ('item' or 'list'), the labelpath's labels with '/' between
  // them, then a mark: '!' for the item, '#' and 'kids' for the listing. Without a mark the root box's item key would
  // start every box's. A Minder's keys have the same shapes.
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
    const thing     = this.#vaultMinder.thingAt(itemScope)
    const queryKey  = VaultTSQ.itemQueryKeyOf(itemScope)
    const seed      = thing && itemValOf(thing)
    if ((seed === undefined) || (thing?.read_at === undefined)) { return { queryKey } }
    return { queryKey, initialData: seed, initialDataUpdatedAt: thing.read_at }
  }

  /** Get the box at `scope` once, unless its item is fresh by `opts.staleTime`: its live record, or null where none is stored live.
   * Refuses `stale_read` where storage answers an earlier life than the box's newest known only sparse. Rejects with the
   * library's `CancelledError` where the item is reset while the get runs.
   */
  async getOnce(scope: ThingScope, opts: MinderGetOpts = {}): Promise<ThingRecord | null> {
    const { staleTime } = MinderChecks.minderGetOpts.parse(opts)
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

  // == [A devtool's view]: maskedRows

  /** The items and listings of the bank, masked for a devtool.
   * Each has its key, its state, and a copy of its record or listing with each ciphertext masked. What a host keeps beside them in the same client is left out.
   * For experimenting, never for an app's own logic: what it answers may change without notice.
   */
  maskedRows(): MaskedRow[] { return maskedRowsOf(this.#queryClient, VaultTSQ.bankQueryKeyOf(this.#scope)) }
  // --

  // == [Ending]: sweep

  /** Stop hearing the SortedVaultDB, for good: the items and listings stay as they are. */
  sweep(): this {
    this.#unlisten()
    return this
  }
  // --

  // == [The writer]: #hear, #hearLife

  /** Bring the items up to date with `event`, and the listings with a `life` event. */
  #hear(event: VaultEvent): void {
    if (event.eventkind === 'life') { this.#hearLife(event.labelpath); return }
    if (! isItemLabelpath(event.labelpath)) { return }
    const queryKey = VaultTSQ.itemQueryKeyOf(this.#scopeOf(event.labelpath))
    if (event.eventkind === 'aged') {
      // An aged event is never of a Thing seen whole: its agekind is cold or bare.
      if (event.agekind === 'cold') { void this.#queryClient.invalidateQueries({ queryKey, exact: true }, { cancelRefetch: false }) } else { void this.#queryClient.resetQueries({ queryKey, exact: true }) }
      return
    }
    if (event.liveness === 'soon') { return }
    // The record the Thing holds, not the event's: a revision seen again keeps the object it had.
    const record = (event.liveness === 'full') ? this.#vaultMinder.thingAt(this.#scopeOf(event.labelpath))?.pickle() : null
    this.#queryClient.setQueryData(queryKey, record, { ...((event.read_tc !== undefined) && { updatedAt: readAtOf(event.read_tc) }) })
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

/** The item `thing` stands for: its live record, null for a tombstone or the shell, undefined where no whole record of its newest life is known */
function itemValOf(thing: ReceivingThing): ThingRecord | null | undefined {
  if (thing.agekind === 'bare') { return undefined }
  const record = thing.pickle()
  return BaseThing.isTombstone(record) ? null : record
}

/** The labelpath of an item's query key */
function labelpathOfItemKey(queryKey: TSQ.QueryKey): Labelpath { return queryKey.slice(LabelsIdx, -1).join('') }

/** The labelpath of a listing's query key */
function labelpathOfListKey(queryKey: TSQ.QueryKey): Labelpath { return queryKey.slice(LabelsIdx, -2).join('') }
// --
