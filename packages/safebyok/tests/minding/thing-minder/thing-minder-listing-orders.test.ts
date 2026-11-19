import { describe, expect, it, vi } from 'vitest'
import * as TH from '../../test-helpers'
import { QuietVaultDB, minderWorldOf, storedBoxOf, noticeOf, boxScopeOf, cheatBox, boxBirthAskOf } from './world'

// == [Listings in any order]: ListingStep, OrdersWithoutWrite, ListingOrders, listingAfter

/** One way the minder hears of a box under the root box: a list, a get, a write's answer, or the watch's notice. */
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

/** The root box's listing after `steps`, in order, over a store holding the boxes openai, anthropic and mistral.
 * The get is of anthropic, the notice of mistral, and the write births cohere. Under `isListStale`, the list step answers
 * what the store held before the steps, openai alone: only the get, the write and the notice tell of the other three.
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

describe("a ThingMinder's listing is the same, in any order", () => {
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

  describe("of a first list answered before the get's, the write's and the notice's boxes were born, a get, a write and a notice", () => {
    for (const steps of ListingOrders) {
      const blurb = steps.join(', ')
      it(blurb, async () => {
        expect(await listingAfter(steps, { isListedBefore: false, isListStale: true })).to.deep.equal(['box/anthropic', 'box/cohere', 'box/mistral', 'box/openai'])
      })
    }
  })
})
// --
