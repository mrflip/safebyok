import { describe, expect, it } from 'vitest'
import { newerThingOf } from '../../src/minding/newer-thing'
import { type ThingRecord, type Tombstone, Shell } from '../../src/shapes/shapes-thing'
import { Thing } from '../../src/models/thing'
import * as TH from '../test-helpers'

describe("newerThingOf", () => {
  const Box0    = TH.boxThingOf()
  const Box1    = TH.nextOf(Box0)
  const Tomb    = TH.boxTombOf(Box1)
  const Reborn  = TH.boxRebornOf(Tomb)
  const Shelled = Shell.of(TH.BoxScope, TH.rootBoxOf())
  const Sparse1 = Thing.sparseOf(Box1)

  const NewerCases = [
    // one life:
    [Box0,                   Box1,                   Box1,    'answers a later revision over an earlier one'],
    [Box1,                   Box0,                   Box1,    'keeps the later revision over an earlier one'],
    [Sparse1,                Box0,                   Sparse1, 'keeps a sparse record of a later revision over a whole earlier one'],
    [Box1,                   Tomb,                   Tomb,    'answers a tombstone over the revision it deletes'],
    // lives:
    [Tomb,                   Reborn,                 Reborn,  'answers a later life over a tombstone of a later revision'],
    [Reborn,                 Box1,                   Reborn,  'keeps a later life over an earlier life'],
    [Shelled,                Box0,                   Box0,    'answers a first life over the shell'],
    [Box0,                   Shelled,                Box0,    'keeps a life over the shell'],
  ] as const
  for (const [prior, next, expected, blurb] of NewerCases) {
    it(blurb, () => { expect(newerThingOf(prior, next)).to.eq(expected) })
  }

  it("keeps prior itself on a tie", () => {
    const same = structuredClone(Box0)
    expect(newerThingOf(Box0, same)).to.eq(Box0)
  })

  it("answers next itself where prior is undefined", () => {
    expect(newerThingOf(undefined, Box0)).to.eq(Box0)
  })

  const deadAtTomb = (): Tombstone<ThingRecord> => Tomb as Tombstone<ThingRecord>
  const NullCases = [
    [Box1, null,   null,   deadAtTomb, 'answers null over the revision its tombstone deletes'],
    [null, Box1,   null,   deadAtTomb, 'keeps null over the revision its tombstone deletes'],
    [null, Reborn, Reborn, deadAtTomb, 'answers a later life over null for a tombstone'],
    [null, Box0,   Box0,   undefined,  'answers a first life over null where no tombstone is found'],
    [Box0, null,   Box0,   undefined,  'keeps a life over null where no tombstone is found'],
  ] as const
  for (const [prior, next, expected, deadAt, blurb] of NullCases) {
    it(blurb, () => { expect(newerThingOf(prior, next, deadAt)).to.eq(expected) })
  }

  it("keeps prior of two nulls", () => {
    expect(newerThingOf(null, null, deadAtTomb)).to.eq(null)
  })

  it("looks the tombstone up at the scope of the record beside null", () => {
    const scopes: unknown[] = []
    newerThingOf(Box1, null, (scoped) => { scopes.push(scoped); return Tomb as Tombstone<ThingRecord> })
    expect(scopes).to.deep.equal([Box1])
  })

  const NotRecords = [
    [Box0,      undefined,                   undefined,                   'passes a next of undefined through'],
    [Box0,      { labelpath: "box/openai" }, { labelpath: "box/openai" }, 'passes a next with no revision through'],
    [42,        Box0,                        Box0,                        'passes a next through over a prior that is no record'],
  ] as const
  for (const [prior, next, expected, blurb] of NotRecords) {
    it(blurb, () => { expect(newerThingOf(prior, next)).to.deep.equal(expected) })
  }

  it("shares the parts of a select's result equal to the last one's, as TanStack's default does", () => {
    const prior = { title: 'Work', tags: ['a'] }
    const next  = { title: 'Work', tags: ['a'] }
    expect(newerThingOf(prior, next)).to.eq(prior)
  })
})
