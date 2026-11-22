import { describe, expect, it, vi } from 'vitest'
import type { Labelpath } from '../../../src/shapes/primitives'
import type { ThingRecord, Tombstone } from '../../../src/shapes/shapes-thing'
import { MinderEventFormat } from '../../../src/shapes/shapes-minder'
import { Thing } from '../../../src/models/thing'
import * as TH from '../../test-helpers'
import { QuietVaultDB, minderWorldOf, storedBoxOf, noticeOf, boxScopeOf, cheatBox, boxBirthAskOf, listenerOf, isListingEvent } from './world'

// == [Listings in any order]: ListingStep, OrdersWithoutWrite, ListingOrders, listingAfter

/** One way the minder receives a box under the root box: a list, a get, a write's answer, or the watch's notice. */
type ListingStep = 'list' | 'get' | 'write' | 'notice'

// Each order of a list, a get and a notice, with the write at each place in it: every order of the four.
const OrdersWithoutWrite: readonly (readonly ListingStep[])[] = [
  ["list",   "get",    "notice"],
  ["list",   "notice", "get"],
  ["get",    "list",   "notice"],
  ["get",    "notice", "list"],
  ["notice", "list",   "get"],
  ["notice", "get",    "list"],
]
const ListingOrders = OrdersWithoutWrite.flatMap((steps) => [0, 1, 2, 3].map((ii) => steps.toSpliced(ii, 0, 'write')))

/** The root box's listing after `steps`, in order, over a datastore with the boxes openai, anthropic and mistral.
 * The get is of anthropic, the notice of mistral, and the write births cohere. Under `isListStale`, the list step answers
 * what the datastore had before the steps, openai alone: only the get, the write and the notice bring the other three.
 * Listed before, the root box's listing has openai alone before the steps. Its watch tells nothing: the notice step
 * hands the minder its one notice.
 */
async function listingAfter(steps: readonly ListingStep[], { isListedBefore, isListStale }: Readonly<{ isListedBefore: boolean, isListStale: boolean }>) {
  const vaultDB = new QuietVaultDB()
  await storedBoxOf(vaultDB)
  const { minder, bank, receive } = minderWorldOf(vaultDB)
  if (isListedBefore) { await minder.list('box') }
  if (isListStale) {
    const answered = await vaultDB.tryListThings(bank.makeListAsk({ labelpath: 'box', ifAbsent: 'nil' }))
    vi.spyOn(vaultDB, 'tryListThings').mockResolvedValueOnce(answered)
  }
  const mistral = TH.boxThingOf('mistral')
  for (const box of [TH.boxThingOf('anthropic'), mistral]) { cheatBox(vaultDB, box) }
  const stepRunners: Readonly<Record<ListingStep, () => Promise<void> | void>> = {
    list:   async () => { await minder.list('box') },
    get:    async () => { await minder.get(boxScopeOf('anthropic')) },
    write:  async () => { await TH.expectGood(minder.tryWrite(boxBirthAskOf('cohere'))) },
    notice: () => { receive(noticeOf(mistral)) },
  }
  for (const step of steps) { await stepRunners[step]() }
  return minder.listingAt(TH.RootScope)
}

describe("a VaultMinder's listing is the same, in any order", () => {
  describe("of a list, a get, a write and a notice", () => {
    for (const steps of ListingOrders) {
      const blurb = steps.join(', ')
      it(blurb, async () => {
        expect(await listingAfter(steps, { isListedBefore: false, isListStale: false })).to.deep.equal(['box/anthropic', 'box/cohere', 'box/mistral', 'box/openai'])
      })
    }
  })

  describe("of a list answered before the get's, the write's and the notice's boxes were born, a get, a write and a notice, once listed", () => {
    for (const steps of ListingOrders) {
      const blurb = steps.join(', ')
      it(blurb, async () => {
        expect(await listingAfter(steps, { isListedBefore: true, isListStale: true })).to.deep.equal(['box/anthropic', 'box/cohere', 'box/mistral', 'box/openai'])
      })
    }
  })

  describe("of a stale first list, a get, a write and a notice", () => {
    for (const steps of ListingOrders) {
      const blurb = steps.join(', ')
      it(blurb, async () => {
        expect(await listingAfter(steps, { isListedBefore: false, isListStale: true })).to.deep.equal(['box/anthropic', 'box/cohere', 'box/mistral', 'box/openai'])
      })
    }
  })
})
// --

// == [Events in any order]: Openai, Reborn, eventsAfter, backwardRecords, shrunkListings

/** The box openai, as the datastore has it at the start. */
const Openai = TH.boxThingOf()

/** The box openai, deleted and born again in a later life on another device. */
const Reborn = TH.boxRebornOf(TH.boxTombOf(TH.nextOf(Openai)))

/** Each event a listener is told while `steps` run, in order, over a datastore with the box openai at revision 0, and the
 * refusalkind of each get refused. The get and the list read the datastore, the write replaces openai with its revision 1,
 * and the notice carries {@link Reborn}, which the datastore never has: a get after it is refused.
 */
async function eventsAfter(steps: readonly ListingStep[]) {
  const vaultDB = new QuietVaultDB()
  await storedBoxOf(vaultDB)
  const { minder, receive } = minderWorldOf(vaultDB)
  const heard      = listenerOf()
  minder.listen(heard, MinderEventFormat)
  const replaceAsk = TH.replaceAskOf(Openai, TH.nextOf(Openai))
  const refusalkinds: unknown[] = []
  const stepRunners: Readonly<Record<ListingStep, () => Promise<void> | void>> = {
    list:   async () => { await minder.list('box') },
    get:    async () => {
      try { await minder.get(TH.BoxScope, { staleTime: 0 }) } catch (err) { refusalkinds.push((err as { refusalkind?: unknown }).refusalkind) }
    },
    write:  async () => { await TH.expectGood(minder.tryWrite(replaceAsk)) },
    notice: () => { receive(noticeOf(Reborn)) },
  }
  for (const step of steps) { await stepRunners[step]() }
  return { events: heard.mock.calls.map(([event]) => event), refusalkinds }
}

/** Each record in `records`, told in that order, that is missing or older than the one told before it. */
function backwardRecords(records: readonly (ThingRecord | Tombstone<ThingRecord> | undefined)[]) {
  return records.filter((record, ii) => {
    const prior = records[ii - 1]
    return (ii > 0) && ((prior === undefined) || (record === undefined) || (Thing.cmp(prior, record) < 0))
  })
}

/** Each listing in `listings`, told in that order, that lacks a labelpath of the one told before it. */
function shrunkListings(listings: readonly (readonly Labelpath[] | undefined)[]) {
  return listings.filter((labelpaths, ii) => (ii > 0) && (listings[ii - 1] ?? []).some((labelpath) => (! labelpaths?.includes(labelpath))))
}

describe("a VaultMinder tells each item and listing going forward, in any order", () => {
  describe("of a list, a get, a write and a notice of a later life", () => {
    for (const steps of ListingOrders) {
      const blurb = steps.join(', ')
      it(blurb, async () => {
        const { events, refusalkinds } = await eventsAfter(steps)
        const records  = events.flatMap((event) => ((event.eventkind === 'item') && (event.labelpath === TH.BoxScope.labelpath)) ? [event.state.data] : [])
        const listings = events.flatMap((event) => (isListingEvent(event) && (event.labelpath === 'box')) ? [event.state.data] : [])
        expect(backwardRecords(records)).to.deep.equal([])
        expect(shrunkListings(listings)).to.deep.equal([])
        expect(records.at(-1)).to.deep.equal(Reborn)
        expect(refusalkinds.filter((kind) => kind !== 'stale_read')).to.deep.equal([])
      })
    }
  })
})
// --
