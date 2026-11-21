import { describe, expect, it } from 'vitest'
import { newerThingOf } from '../../src/minding/newer-thing'
import { Shell } from '../../src/shapes/shapes-thing'
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

  it("refuses two records of different Things", () => {
    TH.expectSyncRefusal(() => newerThingOf(Box0, TH.boxThingOf('anthropic')), 'bad_record')
    TH.expectSyncRefusal(() => newerThingOf(Box0, { ...Box1, banklabel: 'zz' }), 'bad_record')
  })

  const NotRecords = [
    [Box0,      undefined,                   'refuses a next of undefined'],
    [Box0,      { labelpath: 'box/openai' }, 'refuses a next with no revision'],
    [42,        Box0,                        'refuses a prior that is no record'],
  ] as const
  for (const [prior, next, blurb] of NotRecords) {
    it(blurb, () => { TH.expectSyncRefusal(() => newerThingOf(prior, next), 'bad_record') })
  }
})
