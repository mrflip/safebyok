import { describe, expect, it } from 'vitest'
import { VaultError } from '../src/errors'
import * as Refusals from '../src/refusals'
import * as TH from './test-helpers'

describe("Refusals.storageUnavailable", () => {
  it("refuses as storage_unavailable, saying to try again, the backend's error as its cause", () => {
    const outage = new Error('connection reset')
    const refusal = Refusals.storageUnavailable(outage)
    expect(refusal).to.be.instanceOf(VaultError)
    expect(refusal.refusalkind).to.eq('storage_unavailable')
    expect(refusal.message).to.eq(Refusals.StorageTroubleMessage)
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

describe("Refusals.staleWrite", () => {
  for (const what of Refusals.StaleWriteVals) {
    it(`refuses a ${what} write as stale_write, saying to read again, with no cause`, () => {
      const refusal = Refusals.staleWrite(what)
      expect(refusal.refusalkind).to.eq('stale_write')
      expect(refusal.message).to.match(/Read (it|the vault) again before retrying\./)
      expect(refusal).to.not.have.property('cause')
    })
  }

  it("says which write was refused", () => {
    expect(Refusals.staleWrite('vaultProps').message).to.include('this change was refused')
    expect(Refusals.staleWrite('del').message).to.include('this removal was refused')
  })
})

describe("Refusals.staleBox", () => {
  it("refuses a box write as stale_write, carrying what stands as meta.box_stored, as its example shows", () => {
    const standing = { boxlabel: 'anthropic', revision_tok: 'rev-two' }
    const refusal = Refusals.staleBox(standing)
    expect(refusal.refusalkind).to.eq('stale_write')
    expect(refusal.message).to.eq(Refusals.StaleBoxMessage)
    expect(refusal.meta).to.deep.equal({ box_stored: standing })
    expect(refusal).to.not.have.property('cause')
  })

  it("carries null when nothing stands under the boxlabel", () => {
    expect(Refusals.staleBox(null).meta).to.deep.equal({ box_stored: null })
  })
})

describe("Refusals.vaultMismatch", () => {
  it("refuses as vault_mismatch, a condition, carrying no meta and no cause, as its example shows", () => {
    const refusal = Refusals.vaultMismatch()
    expect(refusal.refusalkind).to.eq('vault_mismatch')
    expect(refusal.family).to.eq('condition')
    expect(refusal).to.not.have.property('meta')
    expect(refusal).to.not.have.property('cause')
    expect(refusal.message).to.include('nothing was written')
  })
})

describe("Refusals.notPermitted", () => {
  it("refuses as not_permitted, saying signing in again will not help, with no cause when none is given", () => {
    const refusal = Refusals.notPermitted()
    expect(refusal.refusalkind).to.eq('not_permitted')
    expect(refusal.message).to.include('Signing in again will not help')
    expect(refusal).to.not.have.property('cause')
  })

  it("says the backend's own reason, and keeps its refusal as the cause", () => {
    const rule = new Error('guests are read-only')
    const refusal = Refusals.notPermitted('This app keeps vaults read-only for guests: sign in with a full account to store.', { cause: rule })
    expect(refusal.message).to.eq('This app keeps vaults read-only for guests: sign in with a full account to store.')
    expect(refusal.cause).to.eq(rule)
  })

  it("never carries a null cause: one given as null becomes an Error saying so", () => {
    expect(Refusals.notPermitted(undefined, { cause: null }).cause).to.be.instanceOf(Error)
  })
})

describe("Refusals.vaultFull", () => {
  it("refuses as vault_full, naming the limit met, with no cause when none is given", () => {
    const refusal = Refusals.vaultFull(250)
    expect(refusal.refusalkind).to.eq('vault_full')
    expect(refusal.message).to.eq('This vault already holds the 250 boxes its storage keeps in one vault: remove one before storing another.')
    expect(refusal).to.not.have.property('cause')
  })

  it("says only that the vault is full when no count is the limit met", () => {
    expect(Refusals.vaultFull().message).to.eq('This vault is full: remove a box to make room, then try again.')
  })

  it("keeps the backend's own refusal as its cause, never a null one", () => {
    const overByte = new Error('over the byte limit')
    expect(Refusals.vaultFull(undefined, { cause: overByte }).cause).to.eq(overByte)
    expect(Refusals.vaultFull(undefined, { cause: undefined }).cause).to.be.instanceOf(Error)
  })
})

describe("Refusals.storageBlocked", () => {
  it("refuses as storage_blocked, saying trying again will not help, with no cause when none is given", () => {
    const refusal = Refusals.storageBlocked()
    expect(refusal.refusalkind).to.eq('storage_blocked')
    expect(refusal.message).to.eq(Refusals.StorageBlockedMessage)
    expect(refusal.message).to.include('Trying again will not help')
    expect(refusal).to.not.have.property('cause')
  })

  it("keeps the browser's own error as the cause, as its first example does", async () => {
    const withheld = new DOMException('The operation is insecure.', 'SecurityError')
    const shelf = () => Promise.reject(withheld)
    const reading = async () => {
      try { return await shelf() } catch (err) {
        throw Refusals.isStorageBlocked(err) ? Refusals.storageBlocked(undefined, { cause: err }) : err
      }
    }
    const err = await TH.expectRefusal(reading(), 'storage_blocked')
    expect(err.cause).to.eq(withheld)
  })

  it("says what was withheld when given, as its second example does", () => {
    const refusal = Refusals.storageBlocked('This context offers no IndexedDB, so the vault has nowhere to keep its records.')
    expect(refusal.message).to.include('no IndexedDB')
  })
})

/** A plain Error named as a browser names a storage it does not offer, as a runtime with no DOMException makes one. */
class HermesNotSupportedError extends Error {
  override readonly name = 'NotSupportedError'
}

describe("Refusals.isStorageBlocked", () => {
  const BlockedCases = [
    // what holds until something outside the app changes:
    [new DOMException('The operation is insecure.', 'SecurityError'),         true,   'storage withheld from the page, as its first example shows'],
    [new DOMException('Quota exceeded.', 'QuotaExceededError'),               true,   'no room left'],
    [new DOMException('No IndexedDB.', 'NotSupportedError'),                  true,   'no storage of the kind at all'],
    [{ name: 'SecurityError', message: 'from another frame' },                true,   'one from another frame, told by name rather than class'],
    [new HermesNotSupportedError('no DOMException here'),                    true,   'a plain Error of the name, where there is no DOMException'],
    // what may pass:
    [new DOMException('The connection is closing.', 'InvalidStateError'),     false,  'a connection closing, as its second example shows'],
    [new DOMException('Aborted.', 'AbortError'),                              false,  'a transaction aborted'],
    [new Error('anything else'),                                              false,  'an Error of no such name'],
    [null,                                                                    false,  'a failure with no error at all'],
    ["SecurityError",                                                         false,  'a bare string, which names nothing'],
  ] as const

  for (const [err, expected, blurb] of BlockedCases) {
    it(blurb, () => { expect(Refusals.isStorageBlocked(err)).to.eq(expected) })
  }
})

describe("Refusals, between them", () => {
  it("quote nothing they were handed but the message an adapter writes", () => {
    const quoted = 'SUPERSECRET-ciphertext'
    const refusals = [Refusals.staleWrite('vaultProps'), Refusals.staleBox(null), Refusals.vaultMismatch(), Refusals.vaultFull(3), Refusals.notPermitted(), Refusals.storageBlocked()]
    for (const refusal of refusals) { expect(TH.thrownText(refusal)).to.not.include(quoted) }
  })
})
