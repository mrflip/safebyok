import { describe, expect, it, vi } from 'vitest'
import { type MinderEvent, MinderEventFormat } from '../../../src/shapes/shapes-minder'
import type { Labelpath } from '../../../src/shapes/primitives'
import { MemoryVaultDB } from '../../../src/storage/memory-vault-db'
import * as TH from '../../test-helpers'
import { isListingEvent, listenerOf, minderWorldOf, storedBoxOf } from './world'

/** The event a listener is told when the listing of the Thing at `labelpath` is invalidated, in {@link toldOf}'s form. */
function invalidationOf(labelpath: Labelpath) {
  return { eventkind: 'list', modelkind: 'box', labelpath, action: 'invalidate', isInvalidated: true }
}

/** For each event `heard` was told: what it is about, and its scope, action and staleness. */
function toldOf(heard: ReturnType<typeof listenerOf>) {
  return heard.mock.calls.map(([event]: [MinderEvent]) => {
    const { modelkind, labelpath, action, state } = event
    return { eventkind: event.eventkind, modelkind, labelpath, action: action?.type, isInvalidated: state.isInvalidated }
  })
}

/** A minder that has listed the root box, and the box under it, over a datastore with the box. */
async function listedWorldOf() {
  const vaultDB = new MemoryVaultDB()
  await storedBoxOf(vaultDB)
  const world = await minderWorldOf(vaultDB)
  for (const labelpath of ['box', 'box/openai'] as const) { await world.minder.list(labelpath) }
  return { ...world, heard: listenerOf() }
}

describe("VaultMinder.invalidate", () => {
  it("tells a listener of each listing under the labelpath, its own included", async () => {
    const { minder, heard } = await listedWorldOf()
    minder.listen(heard, MinderEventFormat)
    minder.invalidate('box', { list: 'all' })
    expect(toldOf(heard)).to.have.deep.members([invalidationOf('box'), invalidationOf('box/openai')])
    expect(heard.mock.calls).to.have.lengthOf(2)
  })

  it("asks the vaultDB nothing", async () => {
    const { minder, vaultDB } = await listedWorldOf()
    const asked = [vi.spyOn(vaultDB, 'tryGetThing'), vi.spyOn(vaultDB, 'tryListThings'), vi.spyOn(vaultDB, 'tryWriteThing')]
    minder.invalidate(undefined, { list: 'all' })
    for (const ask of asked) { expect(ask.mock.calls).to.have.lengthOf(0) }
  })

  it("tells of the listing of a Thing with none under it, and of no listing above it", async () => {
    const { minder, heard } = await listedWorldOf()
    minder.listen(heard, MinderEventFormat)
    minder.invalidate('box/openai', { list: 'all' })
    expect(toldOf(heard)).to.deep.equal([invalidationOf('box/openai')])
  })

  it("tells of every listing in the bank where it is given no labelpath", async () => {
    const { minder, heard } = await listedWorldOf()
    minder.listen(heard, MinderEventFormat)
    minder.invalidate(undefined, { list: 'all' })
    expect(toldOf(heard)).to.have.deep.members([invalidationOf('box'), invalidationOf('box/openai')])
    expect(heard.mock.calls).to.have.lengthOf(2)
  })

  it("tells nothing of a labelpath with no listing cached", async () => {
    const { minder, heard } = await listedWorldOf()
    minder.listen(heard, MinderEventFormat)
    minder.invalidate('box/anthropic', { list: 'all' })
    expect(heard.mock.calls).to.have.lengthOf(0)
  })

  it("leaves every item and what each listing lists unchanged", async () => {
    const { minder, heard } = await listedWorldOf()
    const box     = await minder.get(TH.BoxScope)
    const listing = minder.listingAt(TH.RootScope)
    minder.listen(heard, MinderEventFormat)
    minder.invalidate(undefined, { list: 'all' })
    expect(minder.at(TH.BoxScope)).to.eq(box)
    expect(minder.listingAt(TH.RootScope)).to.eq(listing)
    expect(heard.mock.calls.filter(([event]) => event.action?.type !== 'invalidate')).to.have.lengthOf(0)
  })

  it("tells a listing only the first time it is invalidated", async () => {
    const { minder, heard } = await listedWorldOf()
    minder.listen(heard, MinderEventFormat)
    minder.invalidate('box', { list: 'all' })
    minder.invalidate('box', { list: 'all' })
    minder.invalidate(undefined, { list: 'all' })
    expect(toldOf(heard)).to.have.deep.members([invalidationOf('box'), invalidationOf('box/openai')])
    expect(heard.mock.calls).to.have.lengthOf(2)
  })

  it("tells again of a listing that a later list has set", async () => {
    const { minder, vaultDB, heard } = await listedWorldOf()
    minder.invalidate('box', { list: 'all' })
    vaultDB._cheat_things(TH.ThingBank).set('box/anthropic', TH.boxThingOf('anthropic'))
    minder.listen(heard, MinderEventFormat)
    expect(await minder.list('box')).to.deep.equal(['box/anthropic', 'box/openai'])
    expect(minder.listingAt(TH.RootScope)).to.deep.equal(['box/anthropic', 'box/openai'])
    expect(heard.mock.calls.map(([event]) => event.eventkind)).to.include('list')
    minder.invalidate('box', { list: 'all' })
    expect(toldOf(heard).filter((told) => told.action === 'invalidate')).to.deep.equal([invalidationOf('box')])
  })

  it("tells a removed listing as a removal with the labelpaths it last listed, never an invalidation", async () => {
    const { minder, heard } = await listedWorldOf()
    minder.invalidate(undefined, { list: 'all' })
    minder.listen(heard, MinderEventFormat)
    minder.goodbye()
    expect(heard.mock.calls.filter(([event]) => event.action?.type === 'invalidate')).to.have.lengthOf(0)
    expect(heard.mock.calls.filter(([event]) => isListingEvent(event) && (event.type === 'removed') && (event.state.data !== undefined))).to.have.lengthOf(2)
  })

  const BadArgs = [
    ["box",    undefined,                  'needs its second argument'],
    ["box",    {},                         'refuses options that name no listings'],
    ["box",    { list: "some" },           'refuses a listing choice other than all'],
    ["box",    { list: "all", extra: 1 },  'refuses an option it does not know'],
    ["vault",  { list: "all" },            "refuses a labelpath that is no Thing's"],
    [42,       { list: "all" },            'refuses a labelpath that is not a string'],
  ] as const
  for (const [labelpath, opts, blurb] of BadArgs) {
    it(blurb, async () => {
      const { minder } = await listedWorldOf()
      TH.expectSyncRefusal(() => { minder.invalidate(labelpath as Labelpath, opts as never) }, 'bad_record')
    })
  }
})
