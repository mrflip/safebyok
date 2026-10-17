import { afterEach, describe, expect, it, vi } from 'vitest'
import { Global, asThrown } from '../src/global'

describe("Global.logger", () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it("hands what error is given to the platform's reportError, as it came, where there is one", () => {
    const reported: unknown[] = []
    vi.stubGlobal('reportError', (err: unknown) => { reported.push(err) })
    const thrown = new Error('a listener that throws')
    Global.logger.error('A listener threw.', { call: 'ChangeBell' }, thrown)
    expect(reported).to.deep.equal([thrown])
  })

  it("hands the platform neither the message nor the story, which are for a logger the host will one day choose", () => {
    const reportError = vi.fn()
    vi.stubGlobal('reportError', reportError)
    Global.logger.error('A listener threw.', { call: 'ChangeBell' }, new Error('x'))
    expect(reportError).toHaveBeenCalledOnce()
    expect(reportError.mock.calls[0]).to.have.lengthOf(1)
  })

  it("says nothing of log and warn", () => {
    const reportError = vi.fn()
    vi.stubGlobal('reportError', reportError)
    Global.logger.log('opened')
    Global.logger.warn('a refresh failed', { call: 'refresh' }, new Error('x'))
    expect(reportError).not.toHaveBeenCalled()
  })

  it("does nothing where the platform has no reportError, as Node has none", () => {
    vi.stubGlobal('reportError', undefined)
    expect(() => { Global.logger.error('A listener threw.', { call: 'ChangeBell' }, new Error('heard by no one')) }).to.not.throw()
  })

  it("lets nothing a throwing reportError throws escape", () => {
    vi.stubGlobal('reportError', () => { throw new Error('the reporter broke') })
    expect(() => { Global.logger.error('A listener threw.', { call: 'ChangeBell' }, new Error('x')) }).to.not.throw()
  })

  it("is replaceable: a logger assigned to it hears what the bell and the stores say, in place of reportError", () => {
    const heard: unknown[][] = []
    const reportError = vi.fn()
    vi.stubGlobal('reportError', reportError)
    const original = Global.logger
    Global.logger = { log: () => undefined, warn: () => undefined, error: (...args) => { heard.push(args) } }
    try {
      const thrown = new Error('x')
      Global.logger.error('A listener threw.', { call: 'ChangeBell' }, thrown)
      expect(heard).to.deep.equal([['A listener threw.', { call: 'ChangeBell' }, thrown]])
      expect(reportError).not.toHaveBeenCalled()
    } finally {
      Global.logger = original
    }
  })
})

describe("asThrown", () => {
  it("hands an Error back as itself", () => {
    const thrown = new Error('x')
    expect(asThrown(thrown)).to.eq(thrown)
  })

  it("wraps anything else in an Error that holds it as its cause", () => {
    for (const thrown of ['a string', 42, null, undefined, { code: 'E' }]) {
      expect(asThrown(thrown)).to.be.instanceOf(Error).with.property('cause', thrown)
    }
  })
})
