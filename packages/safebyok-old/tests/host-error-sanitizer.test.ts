import { describe, expect, it } from 'vitest'
import { VaultError } from '../src/errors'
import * as HostErrorSanitizer from '../src/host-error-sanitizer'
import * as TH from './test-helpers'

/** An error from outside safebyok that quotes what it was handed, as a storage client's may. */
const quotingError = () => {
  const err = new Error('Validator error: got `sk-ant-fake-pasted-key` for note', { cause: new Error('beneath: sk-ant-fake-cause') })
  return Object.assign(err, { args: { note: 'sk-ant-fake-in-a-property' } })
}

/** A Proxy trap that throws, quoting a marker: stood in for every trap, so any access to the proxied throw fails loudly. */
const quotingTrap = (): never => { throw new Error('read me and I quote: sk-ant-fake-trap') }

describe("HostErrorSanitizer.refusalFor", () => {
  it("is a VaultError of the kind and message asked for", () => {
    const refusal = HostErrorSanitizer.refusalFor(quotingError(), 'storage_unavailable', 'Storage failed: try again shortly.')
    expect(refusal).to.be.instanceOf(VaultError)
    expect(refusal.refusalkind).to.eq('storage_unavailable')
    expect(refusal.message).to.eq('Storage failed: try again shortly.')
  })

  it("carries nothing of the foreign error: no cause, no property, no text of it", () => {
    const refusal = HostErrorSanitizer.refusalFor(quotingError(), 'bad_option', 'The note check threw.')
    expect(refusal.cause).to.be.undefined
    expect(Object.getOwnPropertyNames(refusal)).to.have.members(['stack', 'message', 'name', 'refusalkind', 'family'])
    expect(TH.thrownText(refusal)).to.not.include('sk-ant-fake')
  })

  it("carries nothing of a foreign value thrown that is not an error", () => {
    const refusal = HostErrorSanitizer.refusalFor({ note: 'sk-ant-fake-thrown-bag' }, 'bad_option', 'The note check threw.')
    expect(refusal.cause).to.be.undefined
    expect(TH.thrownText(refusal)).to.not.include('sk-ant-fake')
  })

  it("reads nothing of the foreign throw: one whose every access, instanceof included, throws costs nothing", () => {
    const booby = new Proxy(() => undefined, { get: quotingTrap, set: quotingTrap, has: quotingTrap, deleteProperty: quotingTrap, ownKeys: quotingTrap, getOwnPropertyDescriptor: quotingTrap, defineProperty: quotingTrap, getPrototypeOf: quotingTrap, setPrototypeOf: quotingTrap, isExtensible: quotingTrap, preventExtensions: quotingTrap, apply: quotingTrap, construct: quotingTrap })
    expect(() => booby instanceof Error).to.throw('sk-ant-fake-trap')
    const refusal = HostErrorSanitizer.refusalFor(booby, 'unexpected_error', 'The checker threw.')
    expect(refusal.refusalkind).to.eq('unexpected_error')
    expect(TH.thrownText(refusal)).to.not.include('sk-ant-fake')
  })

  it("stands in for a key deriver's throw quoting the passphrase, as its first example shows", async () => {
    const keyDeriver = { deriveKeyBytes: (passphrase: string) => Promise.reject(new TypeError(`cannot derive ${passphrase}`)) }
    const deriveOrRefuse = async (passphrase: string) => {
      let handed: unknown
      try { handed = await keyDeriver.deriveKeyBytes(passphrase) } catch (err) {
        throw HostErrorSanitizer.refusalFor(err, 'unexpected_error', 'The keyDeriver handed to Bank.make threw rather than deriving a key. What it threw is left out of this report, as the deriver hears the passphrase.')
      }
      return handed
    }
    const refusal = await TH.expectRefusal(deriveOrRefuse('pw-the-passphrase'), 'unexpected_error')
    expect(refusal.cause).to.be.undefined
    expect(TH.thrownText(refusal)).to.not.include('pw-the-passphrase')
  })

  it("stands in for a storage client's failure, as its second example shows", async () => {
    const client = { mutation: () => Promise.reject(quotingError()) }
    const putBox = async () => {
      try {
        return await client.mutation()
      } catch (err) {
        throw HostErrorSanitizer.refusalFor(err, 'storage_unavailable', "The vault's storage failed: try again shortly.")
      }
    }
    const refusal = await TH.expectRefusal(putBox(), 'storage_unavailable')
    expect(TH.thrownText(refusal)).to.not.include('sk-ant-fake')
  })
})
