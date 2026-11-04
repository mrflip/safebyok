import { afterEach, describe, expect, it, vi } from 'vitest'
import { reportToPlatform } from '../src/report-error'

describe("reportToPlatform", () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it("hands the error to the platform's reportError, as it came, where there is one", () => {
    const reported: unknown[] = []
    vi.stubGlobal('reportError', (err: unknown) => { reported.push(err) })
    const thrown = new Error('a listener that throws')
    reportToPlatform(thrown)
    expect(reported).to.deep.equal([thrown])
  })

  it("does nothing where the platform has no reportError, as Node has none", () => {
    vi.stubGlobal('reportError', undefined)
    expect(() => { reportToPlatform(new Error('heard by no one')) }).to.not.throw()
  })

  it("looks for reportError as it is called, so one installed later is found", () => {
    vi.stubGlobal('reportError', undefined)
    reportToPlatform(new Error('before'))
    const reported: unknown[] = []
    vi.stubGlobal('reportError', (err: unknown) => { reported.push(err) })
    reportToPlatform('after')
    expect(reported).to.deep.equal(['after'])
  })

  it("lets nothing a throwing reportError throws escape", () => {
    vi.stubGlobal('reportError', () => { throw new Error('the reporter broke') })
    expect(() => { reportToPlatform(new Error('a listener that throws')) }).to.not.throw()
  })
})
