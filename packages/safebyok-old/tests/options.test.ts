import { describe, expect, it } from 'vitest'
import { optionsCheck } from '../src/options'
import * as TH from './test-helpers'

const Said = "putBox()'s only option is `sidecar`."
const checkStoreOpts = optionsCheck(({ unk }) => ({ sidecar: unk.optional() }), Said)

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

  it("refuses a field it does not know as 'bad_option', as its example's second call shows, saying what failed and then what it was told to", () => {
    const err = TH.expectSyncRefusal(() => checkStoreOpts({ note: 'work' }), 'bad_option')
    expect(err.message).to.eq(`There is a field it does not take (its name is not repeated): it takes only sidecar. Check the spelling, or leave it out. ${Said}`)
  })

  it("refuses an unknown field beside a known one, counting it, naming neither it nor any value", () => {
    const err = TH.expectSyncRefusal(() => checkStoreOpts({ sidecar: { hint: 'SUPERSECRET' }, sidcar: { hint: 'SUPERSECRET' } }), 'bad_option')
    expect(err.message).to.include('There is a field it does not take')
    expect(err.message).to.not.include('sidcar')
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

  it("refuses a known field its schema refuses, naming it in the message and meta.fieldnames", () => {
    const checkLabel = optionsCheck(({ str }) => ({ vaultlabel: str.optional() }), 'vaultlabel is text.')
    expect(checkLabel({ vaultlabel: 'work' })).to.deep.equal({ vaultlabel: 'work' })
    const err = TH.expectSyncRefusal(() => checkLabel({ vaultlabel: 7 }), 'bad_option')
    expect(err.message).to.eq('vaultlabel: Invalid input: expected string, received number. vaultlabel is text.')
    expect(err.meta?.fieldnames).to.deep.equal(['vaultlabel'])
  })
})
