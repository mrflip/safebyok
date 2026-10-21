import { describe, expect, it } from 'vitest'
import * as Z from 'zod/mini'
import { InEnglish, issuesText, optionsCheck } from '../src/options'
import * as TH from './test-helpers'

const Said = "putBox()'s only option is `sidecar`."
const checkStoreOpts = optionsCheck({ sidecar: Z.optional(Z.unknown()) }, Said)

describe("optionsCheck", () => {
  it("hands back the bag it was handed, as its example's first call shows", () => {
    const opts = { sidecar: { note: 'work' } }
    expect(checkStoreOpts(opts)).to.eq(opts)
  })

  it("passes a bag left out, or one with its optional field left out or undefined", () => {
    expect(checkStoreOpts<object | undefined>(undefined)).to.be.undefined
    expect(checkStoreOpts({})).to.deep.equal({})
    expect(checkStoreOpts({ sidecar: undefined })).to.deep.equal({ sidecar: undefined })
  })

  it("refuses a field it does not know as 'bad_option', as its example's second call shows, saying what Zod found and then what it was told to", () => {
    const err = TH.expectSyncRefusal(() => checkStoreOpts({ note: 'work' }), 'bad_option')
    expect(err.message).to.eq(`Unrecognized key: "note". ${Said}`)
  })

  it("refuses an unknown field beside a known one, naming the field and quoting no value", () => {
    const err = TH.expectSyncRefusal(() => checkStoreOpts({ sidecar: { hint: 'SUPERSECRET' }, sidcar: { hint: 'SUPERSECRET' } }), 'bad_option')
    expect(err.message).to.include('"sidcar"')
    expect(TH.thrownText(err)).to.not.include('SUPERSECRET')
  })

  const NotBags = [
    ["work",          'Invalid input: expected object, received string',   'text'],
    [42,              'Invalid input: expected object, received number',   'a number'],
    [null,            'Invalid input: expected object, received null',     'null'],
    [true,            'Invalid input: expected object, received boolean',  'a boolean'],
  ] as const
  for (const [misfit, found, blurb] of NotBags) {
    it(`refuses ${blurb} in place of the bag, in Zod's words, naming no value`, () => {
      const err = TH.expectSyncRefusal(() => checkStoreOpts(misfit), 'bad_option')
      expect(err.message).to.eq(`${found}. ${Said}`)
    })
  }

  it("adds its hint for something handed in that is no plain bag, after Zod's words and what it was told to", () => {
    const checkHelloOpts = optionsCheck({ staleMinutes: Z.optional(Z.unknown()) }, Said, 'An event, most likely.')
    class Clicked { readonly type = 'click' }
    expect(TH.expectSyncRefusal(() => checkHelloOpts(new Clicked()), 'bad_option').message).to.eq(`Unrecognized key: "type". ${Said} An event, most likely.`)
    expect(TH.expectSyncRefusal(() => checkHelloOpts(12), 'bad_option').message).to.eq(`Invalid input: expected object, received number. ${Said} An event, most likely.`)
    expect(TH.expectSyncRefusal(() => checkHelloOpts({ type: 'click' }), 'bad_option').message).to.eq(`Unrecognized key: "type". ${Said}`)
  })

  it("refuses a known field its schema refuses", () => {
    const checkLabel = optionsCheck({ vaultlabel: Z.optional(Z.string()) }, 'vaultlabel is text.')
    expect(checkLabel({ vaultlabel: 'work' })).to.deep.equal({ vaultlabel: 'work' })
    TH.expectSyncRefusal(() => checkLabel({ vaultlabel: 7 }), 'bad_option')
  })
})

describe("issuesText", () => {
  it("says what Zod found of a bag holding a field it does not know, as its first example shows", () => {
    const checked = Z.strictObject({}).safeParse({ staleMinute: 0 }, InEnglish)
    expect(checked.success).to.be.false
    expect(issuesText(checked.error!)).to.eq('Unrecognized key: "staleMinute"')
  })

  it("puts the path to a field before what Zod found of it, as its second example shows", () => {
    const checked = Z.object({ leaseHours: Z.number() }).safeParse({ leaseHours: 'week' }, InEnglish)
    expect(issuesText(checked.error!)).to.eq('leaseHours: Invalid input: expected number, received string')
  })

  it("joins several issues, and keeps a message a schema gives itself", () => {
    const checked = Z.object({ aa: Z.string(), bb: Z.custom(() => false, { error: 'bb is never right' }) }).safeParse({ aa: 1, bb: 2 }, InEnglish)
    expect(issuesText(checked.error!)).to.eq('aa: Invalid input: expected string, received number; bb: bb is never right')
  })
})
