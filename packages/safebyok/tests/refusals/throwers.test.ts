import { describe, expect, it } from 'vitest'
import { VaultError } from '../../src/refusals/errors'
import * as Refusals from '../../src/refusals/throwers'
import * as Phrases from '../../src/helpers/phrases'

describe("Refusals.storageUnavailable", () => {
  it("refuses as storage_unavailable, saying to try again, the backend's error as its cause", () => {
    const outage = new Error('connection reset')
    const refusal = Refusals.storageUnavailable(outage)
    expect(refusal).to.be.instanceOf(VaultError)
    expect(refusal.refusalkind).to.eq('storage_unavailable')
    expect(refusal.message).to.eq(Phrases.StorageUnavailable)
    expect(refusal.cause).to.eq(outage)
  })

  it("says what failed, when the adapter says more exactly", () => {
    const refusal = Refusals.storageUnavailable(new Error('blocked'), "This device's own storage failed reading its mark of this vault: try again.")
    expect(refusal.message).to.eq("This device's own storage failed reading its mark of this vault: try again.")
  })

  const NoErrorCases = [
    [null,       'a backend that failed with null, as an aborted IndexedDB transaction can'],
    [undefined,  'a backend that failed with undefined'],
  ] as const

  for (const [cause, blurb] of NoErrorCases) {
    it(`never carries a null cause: ${blurb} becomes an Error saying so`, () => {
      const refusal = Refusals.storageUnavailable(cause)
      expect(refusal.cause).to.be.instanceOf(Error)
      expect((refusal.cause as Error).message).to.eq('The storage backend failed without giving an error.')
    })
  }

  it("keeps a cause that is no Error as it came: a backend may throw anything", () => {
    expect(Refusals.storageUnavailable('ECONNRESET').cause).to.eq('ECONNRESET')
  })
})

describe("Refusals.unexpectedError", () => {
  // Refusals.unexpectedError @example
  it("makes a misuse refusal of a bug, the thrown value its cause", () => {
    const thrown = new TypeError("Cannot read properties of undefined (reading 'wayins')")
    const err = Refusals.unexpectedError(thrown)
    expect(err).to.include({ refusalkind: 'unexpected_error', family: 'misuse', cause: thrown })
    expect(err.message).to.match(/did not expect/)
  })

  it("keeps a cause that is never null, for a throw of nothing", () => {
    expect(Refusals.unexpectedError(undefined).cause).to.be.instanceOf(Error)
  })
})
