import { describe, expect, it } from 'vitest'
import { VaultError } from '../../src/refusals/errors'
import * as Refusals from '../../src/refusals/throwers'
import * as Phrases from '../../src/helpers/phrases'

describe("Refusals.sanitizeForeignError", () => {
  it("hands an Error back as it came", () => {
    const thrown = new TypeError('not a function')
    expect(Refusals.sanitizeForeignError(thrown)).to.eq(thrown)
  })

  // Refusals.sanitizeForeignError @example 1
  it("makes an Error of a thrown string, the string its message", () => {
    const err = Refusals.sanitizeForeignError('ECONNRESET')
    expect(err).to.be.instanceOf(Error)
    expect(err.message).to.eq('ECONNRESET')
    expect(err.cause).to.be.undefined
  })

  const NothingCases = [
    [null,       'makes an Error saying nothing was thrown of a thrown null'],
    [undefined,  'makes an Error saying nothing was thrown of a thrown undefined'],
  ] as const

  for (const [thrown, blurb] of NothingCases) {
    it(blurb, () => {
      const err = Refusals.sanitizeForeignError(thrown)
      expect(err).to.be.instanceOf(Error)
      expect(err.message).to.eq(Phrases.NoErrorGiven)
    })
  }

  const StrayCases = [
    [42,                    "number",  'names the type of a thrown number'],
    [{ code: 'ENOSPC' },    "object",  'names the type of a thrown plain object'],
    [Symbol('oops'),        "symbol",  'names the type of a thrown symbol'],
  ] as const

  for (const [thrown, typeName, blurb] of StrayCases) {
    it(blurb, () => {
      const err = Refusals.sanitizeForeignError(thrown)
      expect(err).to.be.instanceOf(Error)
      expect(err.message).to.eq(Phrases.nonErrorThrown(typeName))
      expect(err.cause).to.eq(thrown)
    })
  }

  // Refusals.sanitizeForeignError @example 2
  it("keeps a stray value as the cause of the Error it makes", () => {
    const err = Refusals.sanitizeForeignError(42)
    expect(err.message).to.include('number')
    expect(err.cause).to.eq(42)
  })
})

describe("Refusals.storageUnavailable", () => {
  // storageUnavailable @example
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
      expect((refusal.cause as Error).message).to.eq(Phrases.NoErrorGiven)
    })
  }

  it("makes an Error of a cause that is no Error: a backend may throw anything", () => {
    const refusal = Refusals.storageUnavailable('ECONNRESET')
    expect(refusal.cause).to.be.instanceOf(Error)
    expect((refusal.cause as Error).message).to.eq('ECONNRESET')
  })
})

describe("Refusals.storageFull", () => {
  it("refuses as vault_full, saying to free room, the backend's error as its cause", () => {
    const quota = new Error('quota exceeded')
    const refusal = Refusals.storageFull(quota)
    expect(refusal.refusalkind).to.eq('vault_full')
    expect(refusal.message).to.eq(Phrases.StorageFull)
    expect(refusal.cause).to.eq(quota)
  })
})

describe("Refusals.unexpectedError", () => {
  it("makes a misuse refusal of a bug, the thrown value its cause", () => {
    const thrown = new TypeError("Cannot read properties of undefined (reading 'wayins')")
    const err = Refusals.unexpectedError(thrown)
    expect(err).to.include({ refusalkind: 'unexpected_error', family: 'misuse', cause: thrown })
    expect(err.message).to.match(/did not expect/)
  })

  it("keeps a cause that is never null, for a throw of nothing", () => {
    expect(Refusals.unexpectedError(undefined).cause).to.be.instanceOf(Error)
  })

  it("makes an Error of a thrown value that is no Error, the value its cause", () => {
    const cause = Refusals.unexpectedError({ code: 7 }).cause as Error
    expect(cause).to.be.instanceOf(Error)
    expect(cause.cause).to.deep.equal({ code: 7 })
  })
})

describe("Refusals.storageFailed", () => {
  it("names the call and what was thrown by its name, carrying nothing else of it", () => {
    const thrown = new Error('[Request ID: 1a2b] Server Error: Uncaught Error in putBox with args {"whisper_ciphered":"c2VjcmV0"}')
    const err = Refusals.storageFailed('putBox', thrown)
    expect(err).to.include({ refusalkind: 'storage_unavailable' })
    expect(err).not.to.have.property('cause')
    expect(err.message).to.equal(Phrases.storageFailed('putBox', Phrases.storeThrew('Error')))
    expect(err.message).not.to.include('c2VjcmV0')
  })

  it("names no thrown at all for a throw that has no name", () => {
    expect(Refusals.storageFailed('getVault', undefined).message).to.equal(Phrases.storageFailed('getVault', ''))
  })
})

describe("Refusals.identityRevoked", () => {
  it("says to open the vault again", () => {
    const err = Refusals.identityRevoked()
    expect(err).to.be.instanceOf(VaultError)
    expect(err).to.include({ refusalkind: 'identity_revoked' })
    expect(err.message).to.match(/Open the vault again/)
  })
})
