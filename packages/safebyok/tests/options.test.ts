import { describe, expect, it } from 'vitest'
import * as Z from 'zod/mini'
import { optionsCheck } from '../src/options'
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

  it("refuses a field it does not know as 'bad_option', as its example's second call shows, saying what it was told to", () => {
    const err = TH.expectSyncRefusal(() => checkStoreOpts({ note: 'work' }), 'bad_option')
    expect(err.message).to.eq(Said)
  })

  it("refuses an unknown field beside a known one, quoting neither", () => {
    const err = TH.expectSyncRefusal(() => checkStoreOpts({ sidecar: {}, sidcar: { hint: 'SUPERSECRET' } }), 'bad_option')
    expect(TH.thrownText(err)).to.not.include('SUPERSECRET')
    expect(TH.thrownText(err)).to.not.include('sidcar')
  })

  it("refuses a bag that is not an object, or is null", () => {
    for (const misfit of ['work', 42, null, true]) {
      TH.expectSyncRefusal(() => checkStoreOpts(misfit), 'bad_option')
    }
  })

  it("refuses a known field its schema refuses", () => {
    const checkLabel = optionsCheck({ vaultlabel: Z.optional(Z.string()) }, 'vaultlabel is text.')
    expect(checkLabel({ vaultlabel: 'work' })).to.deep.equal({ vaultlabel: 'work' })
    TH.expectSyncRefusal(() => checkLabel({ vaultlabel: 7 }), 'bad_option')
  })
})
