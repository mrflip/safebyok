import { describe, expect, it } from 'vitest'
import { VaultError } from '../src/errors'
import * as Sanitizer from '../src/sanitizer'
import * as TH from './test-helpers'

/** An error from outside safebyok that quotes what it was handed, as a storage client's may. */
const quotingError = () => {
  const err = new Error('Validator error: got `sk-ant-fake-pasted-key` for note', { cause: new Error('beneath: sk-ant-fake-cause') })
  return Object.assign(err, { args: { note: 'sk-ant-fake-in-a-property' } })
}

describe("Sanitizer.refusalFor", () => {
  it("is a VaultError of the kind and message asked for", () => {
    const refusal = Sanitizer.refusalFor(quotingError(), 'storage_unavailable', 'Storage failed: try again shortly.')
    expect(refusal).to.be.instanceOf(VaultError)
    expect(refusal.refusalkind).to.eq('storage_unavailable')
    expect(refusal.message).to.eq('Storage failed: try again shortly.')
  })

  it("carries nothing of the foreign error: no cause, no property, no text of it", () => {
    const refusal = Sanitizer.refusalFor(quotingError(), 'bad_option', 'The note check threw.')
    expect(refusal.cause).to.be.undefined
    expect(Object.getOwnPropertyNames(refusal)).to.have.members(['stack', 'message', 'name', 'refusalkind'])
    expect(TH.thrownText(refusal)).to.not.include('sk-ant-fake')
  })

  it("carries nothing of a foreign value thrown that is not an error", () => {
    const refusal = Sanitizer.refusalFor({ note: 'sk-ant-fake-thrown-bag' }, 'bad_option', 'The note check threw.')
    expect(refusal.cause).to.be.undefined
    expect(TH.thrownText(refusal)).to.not.include('sk-ant-fake')
  })

  it("stands in for a storage client's failure, as its example throws it", async () => {
    const client = { mutation: () => Promise.reject(quotingError()) }
    const putBox = async () => {
      try {
        return await client.mutation()
      } catch (err) {
        throw Sanitizer.refusalFor(err, 'storage_unavailable', "The vault's storage failed: try again shortly.")
      }
    }
    const refusal = await TH.expectRefusal(putBox(), 'storage_unavailable')
    expect(TH.thrownText(refusal)).to.not.include('sk-ant-fake')
  })
})
