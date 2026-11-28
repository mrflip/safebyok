import { isEqual } from 'es-toolkit'
import { Errors } from 'safebyok-big/internals'
import { describe, expect, it } from 'vitest'
import { VaultTSQ } from '../../../src/minding/vault-tsq'
import { Lifeseq } from '../../../src/shapes/primitives'
import type { BoxRecord, BoxSparse, Sparse, ThingRecord } from '../../../src/shapes/shapes-thing'
import { Thing } from '../../../src/models/thing'
import { MemoryVaultDB } from '../../../src/storage/memory-vault-db'
import * as TH from '../../test-helpers'
import { type TSQWorld, cheatPlant, isObservedStale, itemQueryAt, listQueryAt, noticeOf, tsqWorldOf } from './tsq-world'

// == [Précis]: Liveness, Precis, CachePrecis, EndPrecis, ChainCase, Route

/** What a step brings, for the box at `TH.BoxScope`: a whole live record, a tombstone, or a sparse live record. */
type Liveness = 'item' | 'gone' | 'soon'

/** A record in brief: its liveness, its own life's lifenum, and its revseq. */
type Precis = readonly [Liveness, number, number]

/** What the box at `TH.BoxScope` shows in brief, each key left out where it shows none, and whether the root box's listing is marked stale.
 * - `item` -- its item's data: the record, or null
 * - `soon` -- the newest revision of the box known, while no whole record of it is
 * - `dead` -- the tombstone its Thing holds, while the item is null and nothing newer is known
 */
type CachePrecis = Readonly<{ item?: Precis | null, soon?: Precis, dead?: Precis, isListingStale?: true }>

/** Where a chain ends: the box in brief, and, where a row states it, whether a get on the way refused `stale_read`. */
type EndPrecis = CachePrecis & Readonly<{ isRefused?: boolean }>

/** A chain of records the box's VaultMinder learns of in order, over the start it is seeded at, and where the box should end. */
type ChainCase = Readonly<{
  initial:  CachePrecis
  chain:    readonly Precis[]
  wanted:   EndPrecis
  blurb?:   string
}>

/** How a step arrives: `'f'` by the feed, as a watch notice, or `'g'` by a fetch, a get of a whole record or a list for a sparse one, both through the VaultTSQ. */
type Route = 'f' | 'g'
// --

// == [The table]: Empty, LiveSoon, Live, Dead, DeadSoon, BareSoon, InitialNames, marked, ChainCases

// Every record here is a revision of one history of the box, under the root box's first life. Its lifenum ticks at each
// birth and each death, even for a live life and odd for a tombstone's, which has the one revision; its revseq counts on
// across lives, as `TH.boxTombOf` and `TH.boxRebornOf` make them:
//   life 0: rev 0-2    life 1: rev 3    life 2: rev 4-7    life 3: rev 8    life 4: rev 9-14    life 5: rev 15
//   life 6: rev 16-19  life 7: rev 20   life 8: rev 21-22
// Each start is a cache of lives 4 to 6. What arrives on it is older, of lives 0 to 2 or earlier in life 4, or newer: the
// next lives, or later in the start's last life.

/** Nothing cached. */
const Empty:    CachePrecis = {}
/** Life 4 live, and a list told of its next revision. */
const LiveSoon: CachePrecis = { item: ["item", 4, 11], soon: ["soon", 4, 12] }
/** Life 4 live. */
const Live:     CachePrecis = { item: ["item", 4, 11] }
/** Life 4 deleted. */
const Dead:     CachePrecis = { item: null, dead: ["gone", 5, 15] }
/** Life 4 deleted, and a list told of life 6. */
const DeadSoon: CachePrecis = { item: null, soon: ["soon", 6, 16], dead: ["gone", 5, 15] }
/** A list told of life 4, and no get has landed. */
const BareSoon: CachePrecis = { soon: ["soon", 4, 12] }

const InitialNames = new Map([[Empty, 'nothing'], [LiveSoon, 'live+soon'], [Live, 'live'], [Dead, 'dead'], [DeadSoon, 'dead+soon'], [BareSoon, 'bare+soon']])

// The other caches the table names, so that a row fits on one screen.
/** A list told of life 6, and no get has landed: dead+soon, as the principles have it. */
const BareSoon6:      CachePrecis = { soon: ["soon", 6, 16] }
/** Life 4 live two revisions on from {@link Live}, and a list told of its next revision. */
const LiveSoonLater:  CachePrecis = { item: ["item", 4, 13], soon: ["soon", 4, 14] }
/** Life 4 live two revisions on from {@link Live}. */
const LiveLater:      CachePrecis = { item: ["item", 4, 13] }
/** Life 6 live, and a list told of its next revision. */
const LiveSoon6:      CachePrecis = { item: ["item", 6, 16], soon: ["soon", 6, 17] }
/** Life 6 live. */
const Live6:          CachePrecis = { item: ["item", 6, 16] }
/** Life 6 live a revision on from {@link Live6}, and a list told of its next revision. */
const LiveSoon6Later: CachePrecis = { item: ["item", 6, 17], soon: ["soon", 6, 18] }
/** Life 6 live a revision on from {@link Live6}. */
const Live6Later:     CachePrecis = { item: ["item", 6, 17] }
/** Life 6 deleted. */
const Dead7:          CachePrecis = { item: null, dead: ["gone", 7, 20] }
/** Life 8 live, and a list told of its next revision. */
const LiveSoon8:      CachePrecis = { item: ["item", 8, 21], soon: ["soon", 8, 22] }
/** Life 8 live. */
const Live8:          CachePrecis = { item: ["item", 8, 21] }

/** `cache` with the root box's listing marked stale. */
function marked(cache: CachePrecis): CachePrecis {
  return { ...cache, isListingStale: true }
}

// Each row is seeded by the row from nothing whose chain is its start's records, and its wanted begins where that row
// should end. The listing is marked where the chain changes the Thing's life: from nothing to a life, or to a later life,
// live or dead.
const ChainCases: readonly ChainCase[] = [
  // Each start, from nothing:
  { initial: Empty,    chain: [["item", 4, 11], ["soon", 4, 12]], wanted: marked(LiveSoon) },
  { initial: Empty,    chain: [["item", 4, 11]],                  wanted: marked(Live) },
  { initial: Empty,    chain: [["gone", 5, 15]],                  wanted: marked(Dead) },
  { initial: Empty,    chain: [["gone", 5, 15], ["soon", 6, 16]], wanted: marked({ ...BareSoon6, item: null }) },
  { initial: Empty,    chain: [["soon", 4, 12]],                  wanted: marked(BareSoon) },
  // On live+soon:
  { initial: LiveSoon, chain: [["item", 0, 1], ["soon", 0, 2]],   wanted: LiveSoon,                            blurb: 'live+soon, older' },
  { initial: LiveSoon, chain: [["item", 6, 16], ["soon", 6, 17]], wanted: marked(LiveSoon6),                   blurb: 'live+soon, newer' },
  { initial: LiveSoon, chain: [["item", 4, 13], ["soon", 4, 14]], wanted: LiveSoonLater,                       blurb: 'live+soon, newer in its life' },
  { initial: LiveSoon, chain: [["item", 0, 1]],                   wanted: LiveSoon,                            blurb: 'live, older' },
  { initial: LiveSoon, chain: [["item", 6, 16]],                  wanted: marked(Live6),                       blurb: 'live, newer' },
  { initial: LiveSoon, chain: [["item", 4, 13]],                  wanted: LiveLater,                           blurb: 'live, newer in its life' },
  { initial: LiveSoon, chain: [["gone", 1, 3]],                   wanted: LiveSoon,                            blurb: 'dead, older' },
  { initial: LiveSoon, chain: [["gone", 5, 15]],                  wanted: marked(Dead),                        blurb: '(b) dead, newer' },
  { initial: LiveSoon, chain: [["gone", 1, 3], ["soon", 2, 4]],   wanted: LiveSoon,                            blurb: 'dead+soon, older' },
  { initial: LiveSoon, chain: [["gone", 5, 15], ["soon", 6, 16]], wanted: marked({ ...BareSoon6, item: null }), blurb: 'dead+soon, newer' },
  { initial: LiveSoon, chain: [["soon", 0, 2]],                   wanted: LiveSoon,                            blurb: 'bare+soon, older' },
  { initial: LiveSoon, chain: [["soon", 6, 17]],                  wanted: marked({ item: null, soon: ["soon", 6, 17] }), blurb: '(a) bare+soon, newer' },
  { initial: LiveSoon, chain: [["soon", 4, 14]],                  wanted: { ...Live, soon: ["soon", 4, 14] },  blurb: 'bare+soon, newer in its life' },
  // On live:
  { initial: Live,     chain: [["item", 0, 1], ["soon", 0, 2]],   wanted: Live,                                blurb: 'live+soon, older' },
  { initial: Live,     chain: [["item", 6, 16], ["soon", 6, 17]], wanted: marked(LiveSoon6),                   blurb: 'live+soon, newer' },
  { initial: Live,     chain: [["item", 4, 13], ["soon", 4, 14]], wanted: LiveSoonLater,                       blurb: 'live+soon, newer in its life' },
  { initial: Live,     chain: [["item", 0, 1]],                   wanted: Live,                                blurb: 'live, older' },
  { initial: Live,     chain: [["item", 6, 16]],                  wanted: marked(Live6),                       blurb: 'live, newer' },
  { initial: Live,     chain: [["item", 4, 13]],                  wanted: LiveLater,                           blurb: 'live, newer in its life' },
  { initial: Live,     chain: [["gone", 1, 3]],                   wanted: Live,                                blurb: 'dead, older' },
  { initial: Live,     chain: [["gone", 5, 15]],                  wanted: marked(Dead),                        blurb: 'dead, newer' },
  { initial: Live,     chain: [["gone", 1, 3], ["soon", 2, 4]],   wanted: Live,                                blurb: 'dead+soon, older' },
  { initial: Live,     chain: [["gone", 5, 15], ["soon", 6, 16]], wanted: marked({ ...BareSoon6, item: null }), blurb: 'dead+soon, newer' },
  { initial: Live,     chain: [["soon", 0, 2]],                   wanted: Live,                                blurb: 'bare+soon, older' },
  { initial: Live,     chain: [["soon", 6, 17]],                  wanted: marked({ item: null, soon: ["soon", 6, 17] }), blurb: 'bare+soon, newer' },
  { initial: Live,     chain: [["soon", 4, 14]],                  wanted: { ...Live, soon: ["soon", 4, 14] },  blurb: 'bare+soon, newer in its life' },
  // On dead:
  { initial: Dead,     chain: [["item", 0, 1], ["soon", 0, 2]],   wanted: Dead,                                blurb: 'live+soon, older' },
  { initial: Dead,     chain: [["item", 6, 16], ["soon", 6, 17]], wanted: marked(LiveSoon6),                   blurb: 'live+soon, newer' },
  { initial: Dead,     chain: [["item", 0, 1]],                   wanted: Dead,                                blurb: 'live, older' },
  { initial: Dead,     chain: [["item", 6, 16]],                  wanted: marked(Live6),                       blurb: '(c) live, newer' },
  { initial: Dead,     chain: [["gone", 1, 3]],                   wanted: Dead,                                blurb: 'dead, older' },
  { initial: Dead,     chain: [["gone", 7, 20]],                  wanted: marked(Dead7),                       blurb: 'dead, newer' },
  { initial: Dead,     chain: [["gone", 1, 3], ["soon", 2, 4]],   wanted: Dead,                                blurb: 'dead+soon, older' },
  { initial: Dead,     chain: [["gone", 7, 20], ["soon", 8, 21]], wanted: marked({ item: null, soon: ["soon", 8, 21] }), blurb: 'dead+soon, newer' },
  { initial: Dead,     chain: [["soon", 0, 2]],                   wanted: Dead,                                blurb: 'bare+soon, older' },
  { initial: Dead,     chain: [["soon", 6, 17]],                  wanted: marked({ item: null, soon: ["soon", 6, 17] }), blurb: 'bare+soon, newer' },
  // On dead+soon:
  { initial: DeadSoon, chain: [["item", 0, 1], ["soon", 0, 2]],   wanted: { ...BareSoon6, item: null },        blurb: 'live+soon, older' },
  { initial: DeadSoon, chain: [["item", 8, 21], ["soon", 8, 22]], wanted: marked(LiveSoon8),                   blurb: 'live+soon, newer' },
  { initial: DeadSoon, chain: [["item", 6, 17], ["soon", 6, 18]], wanted: LiveSoon6Later,                      blurb: 'live+soon, newer in its life' },
  { initial: DeadSoon, chain: [["item", 0, 1]],                   wanted: { ...BareSoon6, item: null },        blurb: 'live, older' },
  { initial: DeadSoon, chain: [["item", 8, 21]],                  wanted: marked(Live8),                       blurb: 'live, newer' },
  { initial: DeadSoon, chain: [["item", 6, 17]],                  wanted: Live6Later,                          blurb: 'live, newer in its life' },
  { initial: DeadSoon, chain: [["gone", 1, 3]],                   wanted: { ...BareSoon6, item: null },        blurb: 'dead, older' },
  { initial: DeadSoon, chain: [["gone", 7, 20]],                  wanted: marked(Dead7),                       blurb: 'dead, newer' },
  { initial: DeadSoon, chain: [["gone", 1, 3], ["soon", 2, 4]],   wanted: { ...BareSoon6, item: null },        blurb: 'dead+soon, older' },
  { initial: DeadSoon, chain: [["gone", 7, 20], ["soon", 8, 21]], wanted: marked({ item: null, soon: ["soon", 8, 21] }), blurb: 'dead+soon, newer' },
  { initial: DeadSoon, chain: [["soon", 0, 2]],                   wanted: { ...BareSoon6, item: null },        blurb: 'bare+soon, older' },
  { initial: DeadSoon, chain: [["soon", 8, 22]],                  wanted: marked({ item: null, soon: ["soon", 8, 22] }), blurb: 'bare+soon, newer' },
  { initial: DeadSoon, chain: [["soon", 6, 18]],                  wanted: { item: null, soon: ["soon", 6, 18] }, blurb: 'bare+soon, newer in its life' },
  // On bare+soon:
  { initial: BareSoon, chain: [["item", 0, 1], ["soon", 0, 2]],   wanted: BareSoon,                            blurb: 'live+soon, older' },
  { initial: BareSoon, chain: [["item", 4, 9], ["soon", 4, 10]],  wanted: { ...BareSoon, item: ["item", 4, 9], isRefused: false }, blurb: 'live+soon, older in its life' },
  { initial: BareSoon, chain: [["item", 6, 16], ["soon", 6, 17]], wanted: marked(LiveSoon6),                   blurb: 'live+soon, newer' },
  { initial: BareSoon, chain: [["item", 4, 13], ["soon", 4, 14]], wanted: LiveSoonLater,                       blurb: 'live+soon, newer in its life' },
  { initial: BareSoon, chain: [["item", 0, 1]],                   wanted: BareSoon,                            blurb: 'live, older' },
  { initial: BareSoon, chain: [["item", 4, 9]],                   wanted: { ...BareSoon, item: ["item", 4, 9], isRefused: false }, blurb: 'live, older in its life' },
  { initial: BareSoon, chain: [["item", 6, 16]],                  wanted: marked(Live6),                       blurb: 'live, newer' },
  { initial: BareSoon, chain: [["item", 4, 13]],                  wanted: LiveLater,                           blurb: 'live, newer in its life' },
  { initial: BareSoon, chain: [["gone", 1, 3]],                   wanted: BareSoon,                            blurb: 'dead, older' },
  { initial: BareSoon, chain: [["gone", 5, 15]],                  wanted: marked(Dead),                        blurb: 'dead, newer' },
  { initial: BareSoon, chain: [["gone", 1, 3], ["soon", 2, 4]],   wanted: BareSoon,                            blurb: 'dead+soon, older' },
  { initial: BareSoon, chain: [["gone", 5, 15], ["soon", 6, 16]], wanted: marked({ ...BareSoon6, item: null }), blurb: 'dead+soon, newer' },
  { initial: BareSoon, chain: [["soon", 0, 2]],                   wanted: BareSoon,                            blurb: 'bare+soon, older' },
  { initial: BareSoon, chain: [["soon", 6, 17]],                  wanted: marked({ soon: ["soon", 6, 17] }),   blurb: 'bare+soon, newer' },
  { initial: BareSoon, chain: [["soon", 4, 14]],                  wanted: { soon: ["soon", 4, 14] },           blurb: 'bare+soon, newer in its life' },
  // Each start, a record it has cached again:
  { initial: LiveSoon, chain: [["item", 4, 11]],                  wanted: { ...LiveSoon, isRefused: false },   blurb: 'its item again' },
  { initial: LiveSoon, chain: [["soon", 4, 12]],                  wanted: LiveSoon,                            blurb: 'its soon again' },
  { initial: Live,     chain: [["item", 4, 11]],                  wanted: { ...Live, isRefused: false },       blurb: 'its item again' },
  { initial: BareSoon, chain: [["soon", 4, 12]],                  wanted: BareSoon,                            blurb: 'its soon again' },
  { initial: Dead,     chain: [["gone", 5, 15]],                  wanted: { ...Dead, isRefused: false },       blurb: 'its tombstone again' },
  // Each start with a soon, the whole record at its soon's revision:
  { initial: LiveSoon, chain: [["item", 4, 12]],                  wanted: { item: ["item", 4, 12] },           blurb: 'the item its soon told of' },
  { initial: BareSoon, chain: [["item", 4, 12]],                  wanted: { item: ["item", 4, 12] },           blurb: 'the item its soon told of' },
  { initial: DeadSoon, chain: [["item", 6, 16]],                  wanted: Live6,                               blurb: 'the item its soon told of' },
]
// --

// == [Running a chain]: BoxKey, recordOf, wholeOf, precisOf, newestOf, lifeOf, cachePrecisOf, endFaultsOf, arrive, seed, runChain

/** The query key of the item of the box at `TH.BoxScope`. */
const BoxKey = VaultTSQ.itemQueryKeyOf(TH.BoxScope)

/** The record `precis` stands for: the box at `TH.BoxScope` at that revision of that life, whole or sparse. */
function recordOf([liveness, lifenum, revseq]: Precis): BoxRecord | BoxSparse {
  const lifeseq = Lifeseq.ofLifenum(lifenum)
  if ((liveness === 'gone') !== Lifeseq.isTombstone(lifeseq)) { throw new Error(`no ${liveness} has the lifenum ${String(lifenum)}`) }
  const whole   = TH.boxThingOf('openai', {
    am: (liveness === 'gone') ? 'x' : 'a', lifeseq, lifepath: `${TH.Life0}/${lifeseq}`, revseq, revtok: TH.revtokOf(String(revseq)),
    born_at: TH.T0 + lifenum, written_at: TH.T0 + revseq,
  })
  return (liveness === 'soon') ? TH.boxSparseOf(whole) : whole
}

/** The précis of the whole record `precis` is of: a soon's is its item. */
function wholeOf([liveness, lifenum, revseq]: Precis): Precis {
  return [(liveness === 'soon') ? 'item' : liveness, lifenum, revseq]
}

/** The précis of `record`: a tombstone is `'gone'`, a sparse live record `'soon'`, a whole one `'item'`. */
function precisOf(record: Sparse<ThingRecord>): Precis {
  const lifenum = Lifeseq.lifenumOf(record.lifeseq)
  if (Thing.isTombstone(record)) { return ['gone', lifenum, record.revseq] }
  return [Thing.isSparse(record) ? 'soon' : 'item', lifenum, record.revseq]
}

/** The newest record `cache` has, or undefined for none. */
function newestOf({ item, soon, dead }: CachePrecis): Precis | undefined {
  return [item, soon, dead].filter((precis) => (precis !== undefined) && (precis !== null)).toSorted((one, other) => other[2] - one[2])[0]
}

/** The Thing's life as `cache` tells it: the lifenum of its newest record, or `'vacant'` for none. */
function lifeOf(cache: CachePrecis): number | 'vacant' {
  return newestOf(cache)?.[1] ?? 'vacant'
}

/** The précis of what `world` shows of the box, from its Thing and its item, and whether the root box's listing is invalidated or reset. */
function cachePrecisOf(world: TSQWorld<MemoryVaultDB>): CachePrecis {
  const car     = world.sorted.carAt(TH.BoxScope)
  const item    = itemQueryAt(world)?.state.data as ThingRecord | null | undefined
  const record  = car?.thing.pickle()
  const listing = listQueryAt(world)?.state
  return {
    ...((item !== undefined) && { item: (item === null) ? null : precisOf(item) }),
    ...((car !== undefined) && (car.agekind !== 'here') && { soon: precisOf(car.citable) }),
    ...((item === null) && (car?.agekind === 'here') && (record !== undefined) && Thing.isGone(record) && { dead: precisOf(record) }),
    ...((listing !== undefined) && (listing.isInvalidated || (listing.data === undefined)) && { isListingStale: true }),
  }
}

// An item's staleness depends on its route only through `isInvalidated`, which a fetch clears: an observer's word is the rule's.
/** Each way `world`'s item breaks the rules an item with data keeps: it deeply equals its Thing's record, and is stale just while the Thing is not here. */
function endFaultsOf(world: TSQWorld<MemoryVaultDB>): string[] {
  const car  = world.sorted.carAt(TH.BoxScope)
  const item = itemQueryAt(world)?.state.data
  if ((item === undefined) || (car === undefined)) { return [] }
  const isStale  = isObservedStale(world.queryClient, BoxKey)
  const isHeld   = (item === null) || isEqual(item, car.thing.pickle())
  const isRuled  = isStale === (car.agekind !== 'here')
  return [
    ...(isHeld ? [] : ["the item differs from its Thing's record"]),
    ...(isRuled ? [] : [`the item is ${isStale ? 'stale' : 'fresh'} while its Thing is ${car.agekind}`]),
  ]
}

/** Have `world` learn of the record `precis` stands for, by `route`, and tell whether a get refused it `stale_read`. By a fetch,
 * the datastore has the record first, and a soon arrives in a list of the root box.
 */
async function arrive(world: TSQWorld<MemoryVaultDB>, precis: Precis, route: Route): Promise<boolean> {
  const [liveness] = precis
  if (route === 'f') {
    world.notify(noticeOf(recordOf(precis)))
    return false
  }
  cheatPlant(world.vaultDB, recordOf(wholeOf(precis)))
  if (liveness === 'soon') {
    await world.vaultTSQ.listOnce('box')
    return false
  }
  // A get answered by an earlier life than one known only sparse is refused: a step's outcome, not the test's failure.
  try { await world.vaultTSQ.getOnce(TH.BoxScope, { staleTime: 0 }) } catch (err) {
    if (! Errors.isVaultError(err) || (err.refusalkind !== 'stale_read')) { throw err }
    return true
  }
  return false
}

/** Seed a new world at `initial`, its row from nothing arriving by the feed, then list the root box over a datastore that has the newest record of it. */
async function seed(world: TSQWorld<MemoryVaultDB>, initial: CachePrecis): Promise<void> {
  const chain = seedRowOf(initial)?.chain ?? []
  for (const precis of chain) { await arrive(world, precis, 'f') }
  const newest = newestOf(initial)
  if (newest) { cheatPlant(world.vaultDB, recordOf(wholeOf(newest))) }
  await world.vaultTSQ.listOnce('box')
}

/** What a world seeded at `row.initial` shows of the box once `row.chain` arrives by `routes`, a route a step: where it ends,
 * whether a get on the way refused `stale_read`, the Thing's life when the root box was last listed (at the seed, or at a
 * soon arriving in a list), and each way its item breaks the rules of {@link endFaultsOf}.
 */
async function runChain(row: ChainCase, routes: string) {
  const world = await tsqWorldOf(new MemoryVaultDB())
  await seed(world, row.initial)
  const seeded = cachePrecisOf(world)
  let listedLife = lifeOf(seeded)
  let isRefused  = false
  for (const [ii, precis] of row.chain.entries()) {
    if (await arrive(world, precis, routes[ii] as Route)) { isRefused = true }
    if ((precis[0] === 'soon') && (routes[ii] === 'g')) { listedLife = lifeOf(cachePrecisOf(world)) }
  }
  return { seeded, cache: cachePrecisOf(world), listedLife, isRefused, faults: endFaultsOf(world) }
}
// --

// == [Reading the table]: seedRowOf, seededOf, routeSetsOf, expectedOf, outcomeOf, withoutListing, precisTitleOf, titleOf

/** The row from nothing whose chain seeds `initial`: its dead record, its item, then its soon. */
function seedRowOf(initial: CachePrecis): ChainCase | undefined {
  const records = [initial.dead, initial.item, initial.soon].filter((precis) => (precis !== undefined) && (precis !== null))
  return ChainCases.find((row) => (row.initial === Empty) && isEqual(row.chain, records))
}

/** Where a world seeded at `initial` should be, the listing aside: where its row from nothing should end. */
function seededOf(initial: CachePrecis): EndPrecis {
  const row = seedRowOf(initial)
  return row ? withoutListing(row.wanted) : Empty
}

/** Every way to route `chain`, a route a step, as text. */
function routeSetsOf(chain: readonly Precis[]): string[] {
  let routeSets = ['']
  for (const _step of chain) { routeSets = routeSets.flatMap((routes) => [`${routes}g`, `${routes}f`]) }
  return routeSets
}

/** Where `row` should end by `routes`: its wanted, with the listing as a list on the way left it.
 * `cache` is where it ended, and `listedLife` the Thing's life when the listing was last read.
 */
function expectedOf(row: ChainCase, routes: string, { cache, listedLife }: Awaited<ReturnType<typeof runChain>>): EndPrecis {
  if (row.chain.every(([liveness], ii) => (liveness !== 'soon') || (routes[ii] !== 'g'))) { return row.wanted }
  // A list reads the listing anew: past it, only a change of life marks the listing.
  return { ...withoutListing(row.wanted), ...((lifeOf(cache) !== listedLife) && { isListingStale: true }) }
}

/** Where `run` ended, telling whether a get refused only where `expected` tells it. */
function outcomeOf(run: Awaited<ReturnType<typeof runChain>>, expected: EndPrecis): EndPrecis {
  return (expected.isRefused === undefined) ? run.cache : { ...run.cache, isRefused: run.isRefused }
}

/** `end` with no word of the listing. */
function withoutListing({ isListingStale: _isListingStale, ...end }: EndPrecis): EndPrecis { return end }

/** `precis` as a title spells it. */
function precisTitleOf([liveness, lifenum, revseq]: Precis): string {
  return `${liveness} ${String(lifenum)},${String(revseq)}`
}

/** A case's title: the start it is on, its blurb, and each step arriving. */
function titleOf(row: ChainCase): string {
  const steps = row.chain.map((precis) => precisTitleOf(precis)).join(', ')
  const blurb = row.blurb ? `${row.blurb}: ` : ''
  return `${InitialNames.get(row.initial) ?? 'nowhere'} <- ${blurb}${steps}`
}
// --

// == [The table's own rules]: precisesOf, historyClashesOf

/** Every précis `row` names. */
function precisesOf(row: ChainCase): Precis[] {
  return [...row.chain, ...[row.initial, row.wanted].flatMap(({ item, soon, dead }) => [item, soon, dead].filter((precis) => (precis !== undefined) && (precis !== null)))]
}

/** Each précis, or pair of them, in `precises` that no one history of the box could write, as text. */
function historyClashesOf(precises: readonly Precis[]): string[] {
  const clashes: string[] = []
  for (const precis of precises) {
    const [liveness, lifenum, revseq] = precis
    const isSound = (lifenum >= 0) && (revseq >= lifenum) && ((liveness === 'gone') === Lifeseq.isTombstone(Lifeseq.ofLifenum(lifenum)))
    if (! isSound) { clashes.push(precisTitleOf(precis)) }
  }
  for (const ante of precises) {
    for (const post of precises) {
      const [, anteLife, anteRev] = ante
      const [postLiveness, postLife, postRev] = post
      if (postRev < anteRev) { continue }
      // Each change of life takes a revision of its own, and a tombstone's life has only the one.
      const isSound = (postRev === anteRev) ? (postLife === anteLife) : ((postLife >= anteLife) && (postLife - anteLife <= postRev - anteRev) && ((postLiveness !== 'gone') || (postLife !== anteLife)))
      if (! isSound) { clashes.push(`${precisTitleOf(ante)} then ${precisTitleOf(post)}`) }
    }
  }
  return clashes
}
// --

describe("the chain table", () => {
  // Where a start's seed ends is its row from nothing's to say, and each row's run checks it there.
  it("seeds each start by a row from nothing whose chain is its records", () => {
    const starts = [...InitialNames.keys()].filter((initial) => initial !== Empty)
    expect(starts.filter((initial) => ! seedRowOf(initial)).map((initial) => InitialNames.get(initial))).to.deep.equal([])
    expect(ChainCases.filter((row) => ! InitialNames.has(row.initial)).map((row) => titleOf(row))).to.deep.equal([])
  })

  it("builds no tombstone of a live life, nor a live record of a tombstone's", () => {
    expect(() => recordOf(["gone", 4, 11])).to.throw('no gone has the lifenum 4')
    expect(() => recordOf(["soon", 5, 15])).to.throw('no soon has the lifenum 5')
  })

  it("names only records one history of the box could write", () => {
    expect(ChainCases.flatMap((row) => historyClashesOf(precisesOf(row)).map((clash) => `${titleOf(row)}: ${clash}`))).to.deep.equal([])
  })

  it("wants the listing marked just where the chain changes the Thing's life", () => {
    const misses = ChainCases.filter((row) => (lifeOf(seedRowOf(row.initial)?.wanted ?? Empty) !== lifeOf(row.wanted)) !== (row.wanted.isListingStale === true))
    expect(misses.map((row) => titleOf(row))).to.deep.equal([])
  })
})

describe("a VaultTSQ's box after a chain of records", () => {
  describe("each arriving by a fetch", () => {
    for (const row of ChainCases) {
      const routes = row.chain.map(() => 'g').join('')
      const title = titleOf(row)
      it(title, async () => {
        const run = await runChain(row, routes)
        expect(run.seeded).to.deep.equal(seededOf(row.initial))
        const expected = expectedOf(row, routes, run)
        expect(outcomeOf(run, expected)).to.deep.equal(expected)
        expect(run.faults).to.deep.equal([])
      })
    }
  })

  describe("each arriving by the feed", () => {
    for (const row of ChainCases) {
      const routes = row.chain.map(() => 'f').join('')
      const title = titleOf(row)
      it(title, async () => {
        const run = await runChain(row, routes)
        expect(run.seeded).to.deep.equal(seededOf(row.initial))
        const expected = expectedOf(row, routes, run)
        expect(outcomeOf(run, expected)).to.deep.equal(expected)
        expect(run.faults).to.deep.equal([])
      })
    }
  })

  // No chain is longer than two steps, so its mixes are at most two: one by a fetch then the feed, one the other way.
  describe("arriving by every mix of fetch and feed", () => {
    for (const row of ChainCases) {
      const mixes = routeSetsOf(row.chain).filter((routes) => routes.includes('g') && routes.includes('f'))
      if (mixes.length === 0) { continue }
      const title = titleOf(row)
      it(title, async () => {
        const misses = []
        for (const routes of mixes) {
          const run      = await runChain(row, routes)
          const expected = expectedOf(row, routes, run)
          const end      = outcomeOf(run, expected)
          if (! isEqual(end, expected) || (run.faults.length > 0)) { misses.push({ routes, end, faults: run.faults }) }
        }
        expect(misses).to.deep.equal([])
      })
    }
  })
})
