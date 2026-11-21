import { describe, expect, it, vi } from 'vitest'
import type { MinderEvent } from '../../../src/shapes/shapes-minder'
import type { Labelpath } from '../../../src/shapes/primitives'
import { MemoryVaultDB } from '../../../src/storage/memory-vault-db'
import { ThingMinder } from '../../../src/minding/thing-minder'
import { ThingFormat } from '../../../src/shapes/shapes-thing'
import * as TH from '../../test-helpers'
import { listenerOf, minderWorldOf, storedBoxOf } from './world'

/** The event a listener is told when the listing of the Thing at `labelpath` is invalidated, in {@link toldOf}'s form. */
function invalidationOf(labelpath: Labelpath) {
  return { isThing: false, modelkind: (labelpath === 'gate') ? 'gate' : 'box', labelpath, action: 'invalidate', isInvalidated: true }
}

/** For each event `heard` was told: whether it is a car's, and its scope, action and staleness. */
function toldOf(heard: ReturnType<typeof listenerOf>) {
  return heard.mock.calls.map(([event]: [MinderEvent]) => {
    const { modelkind, labelpath, action, state } = event
    return { isThing: ThingMinder.isThingEvent(event), modelkind, labelpath, action: action?.type, isInvalidated: state.isInvalidated }
  })
}

/** A minder that has listed the root box, the box under it, and the main gate, over a store with the box. */
async function listedWorldOf() {
  const vaultDB = new MemoryVaultDB()
  await storedBoxOf(vaultDB)
  const world = minderWorldOf(vaultDB)
  for (const labelpath of ['box', 'box/openai', 'gate'] as const) { await world.minder.list(labelpath) }
  return { ...world, heard: listenerOf() }
}

describe("ThingMinder.invalidate", () => {
  it("tells a listener of each listing under the labelpath, its own included", async () => {
    const { minder, heard } = await listedWorldOf()
    minder.listen(heard, ThingFormat)
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

  it("tells of the listings under a labelpath alone, and of the listing of a Thing with none under it", async () => {
    const { minder, heard } = await listedWorldOf()
    minder.listen(heard, ThingFormat)
    minder.invalidate('box/openai', { list: 'all' })
    expect(toldOf(heard)).to.deep.equal([invalidationOf('box/openai')])
  })

  it("tells of every listing in the bank where it is given no labelpath", async () => {
    const { minder, heard } = await listedWorldOf()
    minder.listen(heard, ThingFormat)
    minder.invalidate(undefined, { list: 'all' })
    expect(toldOf(heard)).to.have.deep.members([invalidationOf('box'), invalidationOf('box/openai'), invalidationOf('gate')])
    expect(heard.mock.calls).to.have.lengthOf(3)
  })

  it("tells nothing of a labelpath with no listing cached", async () => {
    const { minder, heard } = await listedWorldOf()
    minder.listen(heard, ThingFormat)
    minder.invalidate('box/anthropic', { list: 'all' })
    expect(heard.mock.calls).to.have.lengthOf(0)
  })

  it("leaves every car and what each listing lists as it was", async () => {
    const { minder, heard } = await listedWorldOf()
    const car     = await minder.get(TH.GateScope)
    const listing = minder.listingAt(TH.RootScope)
    minder.listen(heard, ThingFormat)
    minder.invalidate(undefined, { list: 'all' })
    expect(minder.at(TH.GateScope)).to.eq(car)
    expect(minder.listingAt(TH.RootScope)).to.eq(listing)
    expect(heard.mock.calls.filter(([event]) => event.action?.type !== 'invalidate')).to.have.lengthOf(0)
  })

  it("tells a listing only the first time it is invalidated", async () => {
    const { minder, heard } = await listedWorldOf()
    minder.listen(heard, ThingFormat)
    minder.invalidate('box', { list: 'all' })
    minder.invalidate('box', { list: 'all' })
    minder.invalidate(undefined, { list: 'all' })
    expect(toldOf(heard)).to.have.deep.members([invalidationOf('box'), invalidationOf('box/openai'), invalidationOf('gate')])
    expect(heard.mock.calls).to.have.lengthOf(3)
  })

  it("tells again of a listing that a later list has set", async () => {
    const { minder, vaultDB, heard } = await listedWorldOf()
    minder.invalidate('box', { list: 'all' })
    vaultDB._cheat_things(TH.ThingBank).set('box/anthropic', TH.boxThingOf('anthropic'))
    minder.listen(heard, ThingFormat)
    expect(await minder.list('box')).to.deep.equal(['box/anthropic', 'box/openai'])
    expect(minder.listingAt(TH.RootScope)).to.deep.equal(['box/anthropic', 'box/openai'])
    expect(heard.mock.calls.map(([event]) => ThingMinder.isThingEvent(event))).to.include(false)
    minder.invalidate('box', { list: 'all' })
    expect(toldOf(heard).filter((told) => told.action === 'invalidate')).to.deep.equal([invalidationOf('box')])
  })

  it("tells a removed listing as a removal with no labelpaths, never an invalidation", async () => {
    const { minder, heard } = await listedWorldOf()
    minder.invalidate(undefined, { list: 'all' })
    minder.listen(heard, ThingFormat)
    minder.goodbye()
    expect(heard.mock.calls.filter(([event]) => event.action?.type === 'invalidate')).to.have.lengthOf(0)
    expect(heard.mock.calls.filter(([event]) => (! ThingMinder.isThingEvent(event)) && (event.type === 'removed') && (event.state.data === undefined))).to.have.lengthOf(3)
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
