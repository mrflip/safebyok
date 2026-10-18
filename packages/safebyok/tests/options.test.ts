import { describe, expect, it } from 'vitest'
import * as Z from 'zod/mini'
import { optionsCheck } from '../src/options'
import * as TH from './test-helpers'

const Said = "store()'s only option is `public`."
const checkStoreOpts = optionsCheck({ public: Z.optional(Z.unknown()) }, Said)

describe("optionsCheck", () => {
  it("hands back the bag it was handed, as its example's first call shows", () => {
    const opts = { public: { note: 'work' } }
    expect(checkStoreOpts(opts)).to.eq(opts)
  })

  it("passes a bag left out, or one with its optional field left out or undefined", () => {
    expect(checkStoreOpts<object | undefined>(undefined)).to.be.undefined
    expect(checkStoreOpts({})).to.deep.equal({})
    expect(checkStoreOpts({ public: undefined })).to.deep.equal({ public: undefined })
  })

  it("refuses a field it does not know as 'bad_option', as its example's second call shows, saying what it was told to", () => {
    const err = TH.expectSyncRefusal(() => checkStoreOpts({ note: 'work' }), 'bad_option')
    expect(err.message).to.eq(Said)
  })

  it("refuses an unknown field beside a known one, quoting neither", () => {
    const err = TH.expectSyncRefusal(() => checkStoreOpts({ public: {}, pubilc: { hint: 'SUPERSECRET' } }), 'bad_option')
    expect(TH.thrownText(err)).to.not.include('SUPERSECRET')
    expect(TH.thrownText(err)).to.not.include('pubilc')
  })

  it("refuses a bag that is not an object, or is null", () => {
    for (const misfit of ['work', 42, null, true]) {
      TH.expectSyncRefusal(() => checkStoreOpts(misfit), 'bad_option')
    }
  })

  it("refuses a known field its schema refuses", () => {
    const checkAim = optionsCheck({ wayinId: Z.optional(Z.string()) }, 'wayinId is text.')
    expect(checkAim({ wayinId: 'u-1' })).to.deep.equal({ wayinId: 'u-1' })
    TH.expectSyncRefusal(() => checkAim({ wayinId: 7 }), 'bad_option')
  })
})
