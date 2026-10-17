import { afterEach, describe, expect, it, vi } from 'vitest'
import * as GlobalLogger from '../src/global-logger'

describe("GlobalLogger.fail", () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it("hands what was thrown to the platform's reportError, as it came, where there is one", () => {
    const reported: unknown[] = []
    vi.stubGlobal('reportError', (err: unknown) => { reported.push(err) })
    const thrown = new Error('a listener that throws')
    GlobalLogger.fail('A listener threw.', { call: 'ChangeBell' }, thrown)
    expect(reported).to.deep.equal([thrown])
  })

  it("reports what was thrown even when it is no Error, which a VaultLogger's err could not carry", () => {
    const reported: unknown[] = []
    vi.stubGlobal('reportError', (err: unknown) => { reported.push(err) })
    GlobalLogger.fail('A listener threw.', { call: 'StringStore' }, 'a string, thrown')
    expect(reported).to.deep.equal(['a string, thrown'])
  })

  it("hands the platform neither the message nor the story, which are for a logger the host will one day choose", () => {
    const reportError = vi.fn()
    vi.stubGlobal('reportError', reportError)
    GlobalLogger.fail('A listener threw.', { call: 'ChangeBell' }, new Error('x'))
    expect(reportError).toHaveBeenCalledOnce()
    expect(reportError.mock.calls[0]).to.have.lengthOf(1)
  })

  it("does nothing where the platform has no reportError, as Node has none", () => {
    vi.stubGlobal('reportError', undefined)
    expect(() => { GlobalLogger.fail('A listener threw.', { call: 'ChangeBell' }, new Error('heard by no one')) }).to.not.throw()
  })

  it("lets nothing a throwing reportError throws escape", () => {
    vi.stubGlobal('reportError', () => { throw new Error('the reporter broke') })
    expect(() => { GlobalLogger.fail('A listener threw.', { call: 'ChangeBell' }, new Error('x')) }).to.not.throw()
  })
})
