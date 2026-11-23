import { isEqual } from 'es-toolkit'
import { describe, expect, it } from 'vitest'
import { Lifeseq } from '../../../src/shapes/primitives'
import type { BoxRecord, Sparse, ThingRecord } from '../../../src/shapes/shapes-thing'
import { Thing } from '../../../src/models/thing'
import { MemoryVaultDB } from '../../../src/storage/memory-vault-db'
import * as TH from '../../test-helpers'
import { type MinderWorld, bornOf, cheatBox, isListingStaleAt, minderWorldOf, noticeOf } from './world'

// == [Précis]: Liveness, Precis, CachePrecis, ChainCase, Route

/** What a step brings, for the box at `TH.BoxScope`: a whole live record, a tombstone, or a sparse live record. */
type Liveness = 'item' | 'gone' | 'soon'

/** A record in brief: its liveness, its own life's lifenum, and its revseq. */
type Precis = readonly [Liveness, number, number]

/** The box's three cache entries in brief, each key left out where its entry is undefined, and whether the root box's listing is marked stale. */
type CachePrecis = Readonly<{ item?: Precis | null, soon?: Precis, dead?: Precis, isListingStale?: true }>

/** A chain of records the minder is handed in order, over the cache it starts from, and the cache it should end with.
 * Where the minder ends elsewhere now, `today` has where it ends by every route, and `todayBy` by the routes named.
 */
type ChainCase = Readonly<{
  initial:  CachePrecis
  chain:    readonly Precis[]
  wanted:   CachePrecis
  today?:   CachePrecis
  todayBy?: Readonly<Record<string, CachePrecis>>
  blurb?:   string
}>

/** How a step reaches the minder: `'f'` by the feed, as a watch notice, or `'g'` by a fetch, a get of a whole record or a list for a sparse one. */
type Route = 'f' | 'g'
// --

// == [The table]: Empty, LiveSoon, Live, Dead, DeadSoon, BareSoon, InitialNames, ChainCases

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

// The listing is marked where the chain changes the Thing's life: from nothing to a life, or to a later life, live or dead.
const ChainCases: readonly ChainCase[] = [
  // Each start, from nothing:
  { initial: Empty,    chain: [["item", 4, 11], ["soon", 4, 12]], wanted: { item: ["item", 4, 11], soon: ["soon", 4, 12], isListingStale: true } },
  { initial: Empty,    chain: [["item", 4, 11]],                  wanted: { item: ["item", 4, 11], isListingStale: true } },
  { initial: Empty,    chain: [["gone", 5, 15]],                  wanted: { item: null, dead: ["gone", 5, 15], isListingStale: true } },
  { initial: Empty,    chain: [["gone", 5, 15], ["soon", 6, 16]], wanted: { soon: ["soon", 6, 16], isListingStale: true },     today: DeadSoon, todayBy: { ff: { item: null, soon: ["soon", 6, 16], dead: ["gone", 5, 15], isListingStale: true }, gf: { item: null, soon: ["soon", 6, 16], dead: ["gone", 5, 15], isListingStale: true } } },
  { initial: Empty,    chain: [["soon", 4, 12]],                  wanted: { soon: ["soon", 4, 12], isListingStale: true } },
  // On live+soon:
  { initial: LiveSoon, chain: [["item", 0, 1], ["soon", 0, 2]],   wanted: LiveSoon,                                            blurb: 'live+soon, older' },
  { initial: LiveSoon, chain: [["item", 6, 16], ["soon", 6, 17]], wanted: { item: ["item", 6, 16], soon: ["soon", 6, 17], isListingStale: true }, today: { item: ["item", 6, 16], soon: ["soon", 6, 17] }, blurb: 'live+soon, newer' },
  { initial: LiveSoon, chain: [["item", 4, 13], ["soon", 4, 14]], wanted: { item: ["item", 4, 13], soon: ["soon", 4, 14] },    blurb: 'live+soon, newer in its life' },
  { initial: LiveSoon, chain: [["item", 0, 1]],                   wanted: LiveSoon,                                            blurb: 'live, older' },
  { initial: LiveSoon, chain: [["item", 6, 16]],                  wanted: { item: ["item", 6, 16], isListingStale: true },     today: { item: ["item", 6, 16] }, blurb: 'live, newer' },
  { initial: LiveSoon, chain: [["item", 4, 13]],                  wanted: { item: ["item", 4, 13] },                           blurb: 'live, newer in its life' },
  { initial: LiveSoon, chain: [["gone", 1, 3]],                   wanted: LiveSoon,                                            blurb: 'dead, older' },
  { initial: LiveSoon, chain: [["gone", 5, 15]],                  wanted: { item: null, dead: ["gone", 5, 15], isListingStale: true }, today: Dead, blurb: '(b) dead, newer' },
  { initial: LiveSoon, chain: [["gone", 1, 3], ["soon", 2, 4]],   wanted: LiveSoon,                                            blurb: 'dead+soon, older' },
  { initial: LiveSoon, chain: [["gone", 5, 15], ["soon", 6, 16]], wanted: { soon: ["soon", 6, 16], isListingStale: true },     today: DeadSoon, blurb: 'dead+soon, newer' },
  { initial: LiveSoon, chain: [["soon", 0, 2]],                   wanted: LiveSoon,                                            blurb: 'bare+soon, older' },
  { initial: LiveSoon, chain: [["soon", 6, 17]],                  wanted: { soon: ["soon", 6, 17], isListingStale: true },     today: { item: ["item", 4, 11], soon: ["soon", 6, 17] }, blurb: '(a) bare+soon, newer' },
  { initial: LiveSoon, chain: [["soon", 4, 14]],                  wanted: { item: ["item", 4, 11], soon: ["soon", 4, 14] },    blurb: 'bare+soon, newer in its life' },
  // On live:
  { initial: Live,     chain: [["item", 0, 1], ["soon", 0, 2]],   wanted: Live,                                                blurb: 'live+soon, older' },
  { initial: Live,     chain: [["item", 6, 16], ["soon", 6, 17]], wanted: { item: ["item", 6, 16], soon: ["soon", 6, 17], isListingStale: true }, today: { item: ["item", 6, 16], soon: ["soon", 6, 17] }, blurb: 'live+soon, newer' },
  { initial: Live,     chain: [["item", 4, 13], ["soon", 4, 14]], wanted: { item: ["item", 4, 13], soon: ["soon", 4, 14] },    blurb: 'live+soon, newer in its life' },
  { initial: Live,     chain: [["item", 0, 1]],                   wanted: Live,                                                blurb: 'live, older' },
  { initial: Live,     chain: [["item", 6, 16]],                  wanted: { item: ["item", 6, 16], isListingStale: true },     today: { item: ["item", 6, 16] }, blurb: 'live, newer' },
  { initial: Live,     chain: [["item", 4, 13]],                  wanted: { item: ["item", 4, 13] },                           blurb: 'live, newer in its life' },
  { initial: Live,     chain: [["gone", 1, 3]],                   wanted: Live,                                                blurb: 'dead, older' },
  { initial: Live,     chain: [["gone", 5, 15]],                  wanted: { item: null, dead: ["gone", 5, 15], isListingStale: true }, today: Dead, blurb: 'dead, newer' },
  { initial: Live,     chain: [["gone", 1, 3], ["soon", 2, 4]],   wanted: Live,                                                blurb: 'dead+soon, older' },
  { initial: Live,     chain: [["gone", 5, 15], ["soon", 6, 16]], wanted: { soon: ["soon", 6, 16], isListingStale: true },     today: DeadSoon, blurb: 'dead+soon, newer' },
  { initial: Live,     chain: [["soon", 0, 2]],                   wanted: Live,                                                blurb: 'bare+soon, older' },
  { initial: Live,     chain: [["soon", 6, 17]],                  wanted: { soon: ["soon", 6, 17], isListingStale: true },     today: { item: ["item", 4, 11], soon: ["soon", 6, 17] }, blurb: 'bare+soon, newer' },
  { initial: Live,     chain: [["soon", 4, 14]],                  wanted: { item: ["item", 4, 11], soon: ["soon", 4, 14] },    blurb: 'bare+soon, newer in its life' },
  // On dead:
  { initial: Dead,     chain: [["item", 0, 1], ["soon", 0, 2]],   wanted: Dead,                                                blurb: 'live+soon, older' },
  { initial: Dead,     chain: [["item", 6, 16], ["soon", 6, 17]], wanted: { item: ["item", 6, 16], soon: ["soon", 6, 17], isListingStale: true }, today: { item: ["item", 6, 16], soon: ["soon", 6, 17], dead: ["gone", 5, 15] }, blurb: 'live+soon, newer' },
  { initial: Dead,     chain: [["item", 0, 1]],                   wanted: Dead,                                                blurb: 'live, older' },
  { initial: Dead,     chain: [["item", 6, 16]],                  wanted: { item: ["item", 6, 16], isListingStale: true },     today: { item: ["item", 6, 16], dead: ["gone", 5, 15] }, blurb: '(c) live, newer' },
  { initial: Dead,     chain: [["gone", 1, 3]],                   wanted: Dead,                                                blurb: 'dead, older' },
  { initial: Dead,     chain: [["gone", 7, 20]],                  wanted: { item: null, dead: ["gone", 7, 20], isListingStale: true }, today: { item: null, dead: ["gone", 7, 20] }, blurb: 'dead, newer' },
  { initial: Dead,     chain: [["gone", 1, 3], ["soon", 2, 4]],   wanted: Dead,                                                blurb: 'dead+soon, older' },
  { initial: Dead,     chain: [["gone", 7, 20], ["soon", 8, 21]], wanted: { soon: ["soon", 8, 21], isListingStale: true },     today: { item: null, soon: ["soon", 8, 21], dead: ["gone", 7, 20] }, blurb: 'dead+soon, newer' },
  { initial: Dead,     chain: [["soon", 0, 2]],                   wanted: Dead,                                                blurb: 'bare+soon, older' },
  { initial: Dead,     chain: [["soon", 6, 17]],                  wanted: { soon: ["soon", 6, 17], isListingStale: true },     today: { item: null, soon: ["soon", 6, 17], dead: ["gone", 5, 15] }, blurb: 'bare+soon, newer' },
  // On dead+soon:
  { initial: DeadSoon, chain: [["item", 0, 1], ["soon", 0, 2]],   wanted: { soon: ["soon", 6, 16] },                           today: DeadSoon, blurb: 'live+soon, older' },
  { initial: DeadSoon, chain: [["item", 8, 21], ["soon", 8, 22]], wanted: { item: ["item", 8, 21], soon: ["soon", 8, 22], isListingStale: true }, today: { item: ["item", 8, 21], soon: ["soon", 8, 22], dead: ["gone", 5, 15] }, blurb: 'live+soon, newer' },
  { initial: DeadSoon, chain: [["item", 6, 17], ["soon", 6, 18]], wanted: { item: ["item", 6, 17], soon: ["soon", 6, 18] },    today: { item: ["item", 6, 17], soon: ["soon", 6, 18], dead: ["gone", 5, 15] }, blurb: 'live+soon, newer in its life' },
  { initial: DeadSoon, chain: [["item", 0, 1]],                   wanted: { soon: ["soon", 6, 16] },                           today: DeadSoon, blurb: 'live, older' },
  { initial: DeadSoon, chain: [["item", 8, 21]],                  wanted: { item: ["item", 8, 21], isListingStale: true },     today: { item: ["item", 8, 21], dead: ["gone", 5, 15] }, blurb: 'live, newer' },
  { initial: DeadSoon, chain: [["item", 6, 17]],                  wanted: { item: ["item", 6, 17] },                           today: { item: ["item", 6, 17], dead: ["gone", 5, 15] }, blurb: 'live, newer in its life' },
  { initial: DeadSoon, chain: [["gone", 1, 3]],                   wanted: { soon: ["soon", 6, 16] },                           today: DeadSoon, blurb: 'dead, older' },
  { initial: DeadSoon, chain: [["gone", 7, 20]],                  wanted: { item: null, dead: ["gone", 7, 20], isListingStale: true }, today: { item: null, dead: ["gone", 7, 20] }, blurb: 'dead, newer' },
  { initial: DeadSoon, chain: [["gone", 1, 3], ["soon", 2, 4]],   wanted: { soon: ["soon", 6, 16] },                           today: DeadSoon, blurb: 'dead+soon, older' },
  { initial: DeadSoon, chain: [["gone", 7, 20], ["soon", 8, 21]], wanted: { soon: ["soon", 8, 21], isListingStale: true },     today: { item: null, soon: ["soon", 8, 21], dead: ["gone", 7, 20] }, blurb: 'dead+soon, newer' },
  { initial: DeadSoon, chain: [["soon", 0, 2]],                   wanted: { soon: ["soon", 6, 16] },                           today: DeadSoon, blurb: 'bare+soon, older' },
  { initial: DeadSoon, chain: [["soon", 8, 22]],                  wanted: { soon: ["soon", 8, 22], isListingStale: true },     today: { item: null, soon: ["soon", 8, 22], dead: ["gone", 5, 15] }, blurb: 'bare+soon, newer' },
  { initial: DeadSoon, chain: [["soon", 6, 18]],                  wanted: { soon: ["soon", 6, 18] },                           today: { item: null, soon: ["soon", 6, 18], dead: ["gone", 5, 15] }, blurb: 'bare+soon, newer in its life' },
  // On bare+soon:
  { initial: BareSoon, chain: [["item", 0, 1], ["soon", 0, 2]],   wanted: BareSoon,                                            todayBy: { ff: { item: ["item", 0, 1], soon: ["soon", 4, 12] }, fg: { item: ["item", 0, 1], soon: ["soon", 4, 12] } }, blurb: 'live+soon, older' },
  { initial: BareSoon, chain: [["item", 4, 9], ["soon", 4, 10]],  wanted: { item: ["item", 4, 9], soon: ["soon", 4, 12] },     todayBy: { gf: BareSoon, gg: BareSoon }, blurb: 'live+soon, older in its life' },
  { initial: BareSoon, chain: [["item", 6, 16], ["soon", 6, 17]], wanted: { item: ["item", 6, 16], soon: ["soon", 6, 17], isListingStale: true }, today: { item: ["item", 6, 16], soon: ["soon", 6, 17] }, blurb: 'live+soon, newer' },
  { initial: BareSoon, chain: [["item", 4, 13], ["soon", 4, 14]], wanted: { item: ["item", 4, 13], soon: ["soon", 4, 14] },    blurb: 'live+soon, newer in its life' },
  { initial: BareSoon, chain: [["item", 0, 1]],                   wanted: BareSoon,                                            todayBy: { "f": { item: ["item", 0, 1], soon: ["soon", 4, 12] } }, blurb: 'live, older' },
  { initial: BareSoon, chain: [["item", 4, 9]],                   wanted: { item: ["item", 4, 9], soon: ["soon", 4, 12] },     todayBy: { "g": BareSoon }, blurb: 'live, older in its life' },
  { initial: BareSoon, chain: [["item", 6, 16]],                  wanted: { item: ["item", 6, 16], isListingStale: true },     today: { item: ["item", 6, 16] }, blurb: 'live, newer' },
  { initial: BareSoon, chain: [["item", 4, 13]],                  wanted: { item: ["item", 4, 13] },                           blurb: 'live, newer in its life' },
  { initial: BareSoon, chain: [["gone", 1, 3]],                   wanted: BareSoon,                                            today: { item: null, soon: ["soon", 4, 12], dead: ["gone", 1, 3] }, blurb: 'dead, older' },
  { initial: BareSoon, chain: [["gone", 5, 15]],                  wanted: { item: null, dead: ["gone", 5, 15], isListingStale: true }, today: Dead, blurb: 'dead, newer' },
  { initial: BareSoon, chain: [["gone", 1, 3], ["soon", 2, 4]],   wanted: BareSoon,                                            today: { item: null, soon: ["soon", 4, 12], dead: ["gone", 1, 3] }, blurb: 'dead+soon, older' },
  { initial: BareSoon, chain: [["gone", 5, 15], ["soon", 6, 16]], wanted: { soon: ["soon", 6, 16], isListingStale: true },     today: DeadSoon, blurb: 'dead+soon, newer' },
  { initial: BareSoon, chain: [["soon", 0, 2]],                   wanted: BareSoon,                                            blurb: 'bare+soon, older' },
  { initial: BareSoon, chain: [["soon", 6, 17]],                  wanted: { soon: ["soon", 6, 17], isListingStale: true },     today: { soon: ["soon", 6, 17] }, blurb: 'bare+soon, newer' },
  { initial: BareSoon, chain: [["soon", 4, 14]],                  wanted: { soon: ["soon", 4, 14] },                           blurb: 'bare+soon, newer in its life' },
]
// --

// == [Running a chain]: recordOf, wholeOf, precisOf, newestOf, lifeOf, cachePrecisOf, arrive, seed, runChain

/** The record `precis` stands for: the box at `TH.BoxScope` at that revision of that life, whole or sparse. */
function recordOf([liveness, lifenum, revseq]: Precis): BoxRecord | Sparse<BoxRecord> {
  const lifeseq = Lifeseq.ofLifenum(lifenum)
  if ((liveness === 'gone') !== Lifeseq.isTombstone(lifeseq)) { throw new Error(`no ${liveness} has the lifenum ${String(lifenum)}`) }
  const whole   = TH.boxThingOf('openai', {
    am: (liveness === 'gone') ? 'x' : 'a', lifeseq, lifepath: `${TH.Life0}/${lifeseq}`, revseq, revtok: TH.revtokOf(String(revseq)),
    born_at: TH.T0 + lifenum, written_at: TH.T0 + revseq,
  })
  return (liveness === 'soon') ? Thing.sparseOf(whole) : whole
}

/** The précis of the whole record `precis` is of: a soon's is its item. */
function wholeOf([liveness, lifenum, revseq]: Precis): Precis {
  return [(liveness === 'soon') ? 'item' : liveness, lifenum, revseq]
}

/** The précis of `record`, a cache entry's: a tombstone is `'gone'`, a sparse live record `'soon'`, a whole one `'item'`. */
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

/** The précis of what `minder` caches for the box, and whether the root box's listing is marked stale. */
function cachePrecisOf({ minder }: MinderWorld<MemoryVaultDB>): CachePrecis {
  const item = minder.at(TH.BoxScope)
  const soon = minder.soonAt(TH.BoxScope)
  const dead = minder.deadAt(TH.BoxScope)
  return {
    ...((item !== undefined) && { item: (item === null) ? null : precisOf(item) }),
    ...((soon !== undefined) && { soon: precisOf(soon) }),
    ...((dead !== undefined) && { dead: precisOf(dead) }),
    ...(isListingStaleAt(minder, TH.RootScope) && { isListingStale: true }),
  }
}

/** Hand the minder the record `precis` stands for, by `route`. By a fetch, the datastore has the record first, and a soon
 * reaches the minder in a list of the root box.
 */
async function arrive(world: MinderWorld<MemoryVaultDB>, precis: Precis, route: Route): Promise<void> {
  const [liveness] = precis
  if (route === 'f') {
    world.receive(noticeOf(recordOf(precis)))
    return
  }
  cheatBox(world.vaultDB, recordOf(wholeOf(precis)))
  if (liveness === 'soon') {
    await world.minder.list('box')
    return
  }
  // A get answered behind what the cache has is refused: a step's outcome, not the test's failure.
  try { await world.minder.get(TH.BoxScope, { staleTime: 0 }) } catch (err) {
    if ((err as { refusalkind?: unknown }).refusalkind !== 'stale_read') { throw err }
  }
}

/** Bring a new minder's cache to `initial`, by the feed, then cache the root box's listing over a datastore that has the newest record cached. */
async function seed(world: MinderWorld<MemoryVaultDB>, initial: CachePrecis): Promise<void> {
  for (const precis of [initial.dead, initial.item, initial.soon]) {
    if (precis) { await arrive(world, precis, 'f') }
  }
  const newest = newestOf(initial)
  if (newest) { cheatBox(world.vaultDB, recordOf(wholeOf(newest))) }
  await world.minder.list('box')
}

/** What a minder seeded at `row.initial` caches once `row.chain` arrives by `routes`, a route a step, and the Thing's life
 * when the root box's listing was last read: at the seed, or at a soon arriving in a list.
 */
async function runChain(row: ChainCase, routes: string) {
  const world = await minderWorldOf(await bornOf(new MemoryVaultDB()))
  await seed(world, row.initial)
  const seeded = cachePrecisOf(world)
  let listedLife = lifeOf(seeded)
  for (const [ii, precis] of row.chain.entries()) {
    await arrive(world, precis, routes[ii] as Route)
    if ((precis[0] === 'soon') && (routes[ii] === 'g')) { listedLife = lifeOf(cachePrecisOf(world)) }
  }
  return { seeded, cache: cachePrecisOf(world), listedLife }
}
// --

// == [Reading the table]: routeSetsOf, expectedOf, withoutListing, precisTitleOf, titleOf

/** Every way to route `chain`, a route a step, as text. */
function routeSetsOf(chain: readonly Precis[]): string[] {
  let routeSets = ['']
  for (const _step of chain) { routeSets = routeSets.flatMap((routes) => [`${routes}g`, `${routes}f`]) }
  return routeSets
}

/** The cache `row` ends in today by `routes`, where `cache` is where it ended and `listedLife` the life when the listing was last read. */
function expectedOf(row: ChainCase, routes: string, { cache, listedLife }: Awaited<ReturnType<typeof runChain>>): CachePrecis {
  const today = row.todayBy?.[routes] ?? row.today
  if (today) { return today }
  if (row.chain.every(([liveness], ii) => (liveness !== 'soon') || (routes[ii] !== 'g'))) { return row.wanted }
  // A list reads the listing anew: past it, only a change of life marks the listing.
  return { ...withoutListing(row.wanted), ...((lifeOf(cache) !== listedLife) && { isListingStale: true }) }
}

/** `cache` with no word of the listing. */
function withoutListing({ isListingStale: _isListingStale, ...cache }: CachePrecis): CachePrecis { return cache }

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
  const states = [row.initial, row.wanted, ...(row.today ? [row.today] : []), ...Object.values(row.todayBy ?? {})]
  return [...row.chain, ...states.flatMap(({ item, soon, dead }) => [item, soon, dead].filter((precis) => (precis !== undefined) && (precis !== null)))]
}

/** Each précis, or pair of them, in `precises` that no one history of the box could store, as text. */
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
  // A start the minder reaches today and the principles would not (dead+soon) is earned by its today.
  it("has each start as the wanted or today's cache of a chain from nothing", () => {
    const starts   = [...InitialNames.keys()].filter((initial) => initial !== Empty)
    const fromNone = ChainCases.filter((row) => row.initial === Empty).flatMap((row) => [row.wanted, ...(row.today ? [row.today] : [])].map((cache) => withoutListing(cache)))
    expect(starts.filter((initial) => fromNone.every((wanted) => ! isEqual(wanted, initial)))).to.deep.equal([])
    expect(ChainCases.filter((row) => ! InitialNames.has(row.initial)).map((row) => titleOf(row))).to.deep.equal([])
  })

  it("builds no tombstone of a live life, nor a live record of a tombstone's", () => {
    expect(() => recordOf(["gone", 4, 11])).to.throw('no gone has the lifenum 4')
    expect(() => recordOf(["soon", 5, 15])).to.throw('no soon has the lifenum 5')
  })

  it("names only records one history of the box could store", () => {
    expect(ChainCases.flatMap((row) => historyClashesOf(precisesOf(row)).map((clash) => `${titleOf(row)}: ${clash}`))).to.deep.equal([])
  })

  it("wants the listing marked just where the chain changes the Thing's life", () => {
    const misses = ChainCases.filter((row) => (lifeOf(row.initial) !== lifeOf(row.wanted)) !== (row.wanted.isListingStale === true))
    expect(misses.map((row) => titleOf(row))).to.deep.equal([])
  })
})

describe("a VaultMinder's cache after a chain of records", () => {
  describe("each arriving by a fetch", () => {
    for (const row of ChainCases) {
      const routes = row.chain.map(() => 'g').join('')
      const title = titleOf(row)
      it(title, async () => {
        const run = await runChain(row, routes)
        expect(run.seeded).to.deep.equal(row.initial)
        expect(run.cache).to.deep.equal(expectedOf(row, routes, run))
      })
    }
  })

  describe("each arriving by the feed", () => {
    for (const row of ChainCases) {
      const routes = row.chain.map(() => 'f').join('')
      const title = titleOf(row)
      it(title, async () => {
        const run = await runChain(row, routes)
        expect(run.seeded).to.deep.equal(row.initial)
        expect(run.cache).to.deep.equal(expectedOf(row, routes, run))
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
          const run = await runChain(row, routes)
          if (! isEqual(run.cache, expectedOf(row, routes, run))) { misses.push({ routes, cache: run.cache }) }
        }
        expect(misses).to.deep.equal([])
      })
    }
  })
})
