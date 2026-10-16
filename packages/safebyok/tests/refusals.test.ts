import { describe, expect, it } from 'vitest'
import { VaultError } from '../src/errors'
import * as Refusals from '../src/refusals'
import * as TH from './test-helpers'

describe("Refusals.storageUnavailable", () => {
  it("refuses as storage_unavailable, saying to try again, the backend's error as its cause", () => {
    const outage = new Error('connection reset')
    const refusal = Refusals.storageUnavailable(outage)
    expect(refusal).to.be.instanceOf(VaultError)
    expect(refusal.kind).to.eq('storage_unavailable')
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
      expect(refusal.kind).to.eq('stale_write')
      expect(refusal.message).to.match(/Read (it|the vault) again before retrying\./)
      expect(refusal).to.not.have.property('cause')
    })
  }

  it("says which write was refused", () => {
    expect(Refusals.staleWrite('bundle').message).to.include('this change was refused')
    expect(Refusals.staleWrite('lockbox').message).to.include('That lockbox changed')
    expect(Refusals.staleWrite('erase').message).to.include('this erase was refused')
  })
})

describe("Refusals.notPermitted", () => {
  it("refuses as not_permitted, saying signing in again will not help, with no cause when none is given", () => {
    const refusal = Refusals.notPermitted()
    expect(refusal.kind).to.eq('not_permitted')
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
    expect(refusal.kind).to.eq('vault_full')
    expect(refusal.message).to.eq('This vault already holds the 250 lockboxes its storage keeps in one vault: erase one before storing another.')
    expect(refusal).to.not.have.property('cause')
  })

  it("says only that the vault is full when no count is the limit met", () => {
    expect(Refusals.vaultFull().message).to.eq('This vault is full: erase a lockbox to make room, then try again.')
  })

  it("keeps the backend's own refusal as its cause, never a null one", () => {
    const overByte = new Error('over the byte limit')
    expect(Refusals.vaultFull(undefined, { cause: overByte }).cause).to.eq(overByte)
    expect(Refusals.vaultFull(undefined, { cause: undefined }).cause).to.be.instanceOf(Error)
  })
})

describe("Refusals, between them", () => {
  it("quote nothing they were handed but the message an adapter writes", () => {
    const quoted = 'SUPERSECRET-ciphertext'
    const refusals = [Refusals.staleWrite('lockbox'), Refusals.vaultFull(3), Refusals.notPermitted()]
    for (const refusal of refusals) { expect(TH.thrownText(refusal)).to.not.include(quoted) }
  })
})
