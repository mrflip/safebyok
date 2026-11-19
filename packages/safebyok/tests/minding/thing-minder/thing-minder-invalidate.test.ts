import { describe, expect, it, vi } from 'vitest'
import type { InvalidationEvent } from '../../../src/shapes/shapes-minder'
import type { Labelpath } from '../../../src/shapes/primitives'
import { MemoryVaultDB } from '../../../src/storage/memory-vault-db'
import * as TH from '../../test-helpers'
import { listenerOf, minderWorldOf, storedBoxOf } from './world'

/** The event a listener is told when the listing of the Thing at `labelpath` is invalidated. */
function invalidationOf(labelpath: Labelpath): InvalidationEvent {
  return { carkind: 'invalidation', modelkind: (labelpath === 'gate') ? 'gate' : 'box', labelpath, card: 'list', tag: 'kids' }
}

/** A minder that has listed the root box, the box under it, and the main gate, over a store holding the box. */
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
    minder.listen(heard)
    minder.invalidate('box', { list: 'all' })
    expect(heard.mock.calls.map(([event]) => event)).to.have.deep.members([invalidationOf('box'), invalidationOf('box/openai')])
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
    minder.listen(heard)
    minder.invalidate('box/openai', { list: 'all' })
    expect(heard.mock.calls).to.deep.equal([[invalidationOf('box/openai')]])
  })

  it("tells of every listing in the bank where it is given no labelpath", async () => {
    const { minder, heard } = await listedWorldOf()
    minder.listen(heard)
    minder.invalidate(undefined, { list: 'all' })
    expect(heard.mock.calls.map(([event]) => event)).to.have.deep.members([invalidationOf('box'), invalidationOf('box/openai'), invalidationOf('gate')])
    expect(heard.mock.calls).to.have.lengthOf(3)
  })

  it("tells nothing of a labelpath with no listing cached", async () => {
    const { minder, heard } = await listedWorldOf()
    minder.listen(heard)
    minder.invalidate('box/anthropic', { list: 'all' })
    expect(heard.mock.calls).to.have.lengthOf(0)
  })

  it("leaves every car and what each listing lists as it was", async () => {
    const { minder, heard } = await listedWorldOf()
    const car     = await minder.get(TH.GateScope)
    const listing = minder.listingAt(TH.RootScope)
    minder.listen(heard)
    minder.invalidate(undefined, { list: 'all' })
    expect(minder.at(TH.GateScope)).to.eq(car)
    expect(minder.listingAt(TH.RootScope)).to.eq(listing)
    expect(heard.mock.calls.filter(([event]) => event.carkind !== 'invalidation')).to.have.lengthOf(0)
  })

  it("tells a listing only the first time it is invalidated", async () => {
    const { minder, heard } = await listedWorldOf()
    minder.listen(heard)
    minder.invalidate('box', { list: 'all' })
    minder.invalidate('box', { list: 'all' })
    minder.invalidate(undefined, { list: 'all' })
    expect(heard.mock.calls.map(([event]) => event)).to.have.deep.members([invalidationOf('box'), invalidationOf('box/openai'), invalidationOf('gate')])
    expect(heard.mock.calls).to.have.lengthOf(3)
  })

  it("tells again of a listing that a later list has set", async () => {
    const { minder, vaultDB, heard } = await listedWorldOf()
    minder.invalidate('box', { list: 'all' })
    vaultDB._cheat_things(TH.ThingBank).set('box/anthropic', TH.boxThingOf('anthropic'))
    minder.listen(heard)
    expect(await minder.list('box')).to.deep.equal(['box/anthropic', 'box/openai'])
    expect(minder.listingAt(TH.RootScope)).to.deep.equal(['box/anthropic', 'box/openai'])
    expect(heard.mock.calls.map(([event]) => event.carkind)).to.include('listing')
    minder.invalidate('box', { list: 'all' })
    expect(heard.mock.calls.filter(([event]) => event.carkind === 'invalidation').map(([event]) => event)).to.deep.equal([invalidationOf('box')])
  })

  it("tells a removed listing as a listing event with no labelpaths, never an invalidation", async () => {
    const { minder, heard } = await listedWorldOf()
    minder.invalidate(undefined, { list: 'all' })
    minder.listen(heard)
    minder.goodbye()
    expect(heard.mock.calls.filter(([event]) => event.carkind === 'invalidation')).to.have.lengthOf(0)
    expect(heard.mock.calls.filter(([event]) => (event.carkind === 'listing') && (event.labelpaths === undefined))).to.have.lengthOf(3)
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
