/** The Postgres notifications each write sends on its user's channel. */

import { describe, expect, it } from 'vitest'
import { thingNotificationOf, thingsChannelOf } from '../src/notifications'

const Scope = { userid: 'u1', banklabel: 'main' }
const At    = { userid: 'u1', banklabel: 'main', modelkind: 'box', labelpath: 'box/openai' }

describe("thingsChannelOf(userid)", () => {
  it("names the channel for the userid, as the write functions notify it", () => {
    expect(thingsChannelOf('u1')).to.eq('safebyok_things_u1')
  })
})

const NotificationCases = [
  // notifications of this bank:
  [{ at: At },                                             { modelkind: 'box', labelpath: 'box/openai' },                'one that carries only its scope'],
  [{ at: At, read_tc: 'tc', thing: { am: 'a' }, bank: { banktok: 7, labelpath: 'main', lifepath: '0000000000', revseq: 0, revtok: 'r1' } }, { modelkind: 'box', labelpath: 'box/openai', read_tc: 'tc', thing: { am: 'a' }, banktok: 7 }, "one that carries its read_tc, Thing and bank's part, unchecked, of which it reads the banktok, the Thing's labelpath kept"],
  [{ at: At, other: 'field' },                             { modelkind: 'box', labelpath: 'box/openai' },                'one with a field it does not know'],
  // anything else:
  [{ at: { ...At, userid: 'u2' } },                        null,                                                         "another user's"],
  [{ at: { ...At, banklabel: 'other' } },                  null,                                                         "another bank's"],
  [{ at: { userid: 'u1', banklabel: 'main' } },            null,                                                         'one with no labelpath'],
  [{ at: { ...At, modelkind: undefined } },                null,                                                         'one with no modelkind'],
  [{ at: { ...At, modelkind: 'bank' } },                   null,                                                         'one of no kind of Thing'],
  [{ thing: { am: 'a' } },                                 null,                                                         'one with no scope'],
] as const

describe("thingNotificationOf(scope, text)", () => {
  for (const [sent, expected, blurb] of NotificationCases) {
    it(`reads ${blurb}`, () => {
      expect(thingNotificationOf(Scope, JSON.stringify(sent))).to.deep.equal(expected)
    })
  }

  it("reads a text that is not JSON as no notification", () => {
    for (const text of ['', 'not json', '{"at":']) { expect(thingNotificationOf(Scope, text), text).to.be.null }
  })
})
