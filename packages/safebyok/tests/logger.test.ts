import { runInNewContext } from 'node:vm'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { VaultError } from '../src/errors'
import { asError, parseLogger, type VaultLogger } from '../src/logger'
import * as TH from './test-helpers'

/** What a host might hand openVault as its logger that is not one. */
const NotLoggers = [
  [null,                                                       'null'],
  [{},                                                         'an empty object'],
  [{ log: () => undefined, warn: () => undefined },            'a logger without error'],
  [{ log: 'info', warn: () => undefined, error: () => undefined }, 'a logger whose log is a string'],
  ['console',                                                  'the word console'],
  [() => undefined,                                            'a lone function'],
] as const

describe("parseLogger", () => {
  it("hands back the host's logger, each call passed through as it was made", () => {
    const spy = TH.spyLogger()
    const logger = parseLogger(spy.logger)
    const err = new Error('the storage adapter failed')
    logger.log('opened')
    logger.warn('a refresh failed', { call: 'refresh' }, err)
    logger.error(undefined, undefined, null)
    expect(spy.calls).to.deep.equal([
      { level: 'log',   message: 'opened',          story: undefined,           err: undefined },
      { level: 'warn',  message: 'a refresh failed', story: { call: 'refresh' }, err },
      { level: 'error', message: undefined,         story: undefined,           err: null },
    ])
  })

  for (const [candidate, blurb] of NotLoggers) {
    it(`refuses ${blurb} as bad_option`, () => {
      expect(() => parseLogger(candidate as unknown as VaultLogger)).to.throw(VaultError, /log, warn and error functions/)
    })
  }

  it("falls back to the console when given none", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => { /* kept out of the test output */ })
    parseLogger(undefined).warn('a refresh failed', { call: 'refresh' })
    expect(warn).toHaveBeenCalledWith('safebyok: a refresh failed', { call: 'refresh' })
  })

  it("answers the one console logger, made once, whenever it is given none", () => {
    expect(parseLogger(undefined)).to.eq(parseLogger(undefined))
  })

  it("guards a logger once: one it has guarded comes back as itself, however many layers hand it down", () => {
    const spy = TH.spyLogger()
    const guarded = parseLogger(spy.logger)
    expect(guarded).to.not.eq(spy.logger)
    expect(parseLogger(guarded)).to.eq(guarded)
    const fallback = parseLogger(undefined)
    expect(parseLogger(parseLogger(fallback))).to.eq(fallback)
  })

  it("marks a guarded logger with a property that is not enumerable, so that spreading or listing it shows nothing", () => {
    const guarded = parseLogger(TH.spyLogger().logger)
    expect(Object.getOwnPropertyDescriptor(guarded, '_safebyok_modded')).to.include({ value: true, enumerable: false })
    expect(Object.keys(guarded)).to.deep.equal(['log', 'warn', 'error'])
  })

  it("takes a logger the host marked `_safebyok_modded` as it is, unguarded, and still refuses a marked non-logger", () => {
    const hostGuarded = { log: () => undefined, warn: () => undefined, error: () => { throw new Error('the host chose not to be guarded') }, _safebyok_modded: true }
    const taken = parseLogger(hostGuarded)
    expect(taken).to.eq(hostGuarded)
    expect(() => { taken.error('x') }).to.throw('the host chose not to be guarded')
    expect(() => parseLogger({ _safebyok_modded: true } as unknown as VaultLogger)).to.throw(VaultError, /log, warn and error functions/)
  })

  it("takes the console itself", () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => { /* kept out of the test output */ })
    parseLogger(console).error('the adapter is broken')
    expect(consoleError).toHaveBeenCalledWith('the adapter is broken', undefined, undefined)
  })

  it("takes a logger built as a class, calling each method on it with its own `this`", () => {
    class Telemetry {
      readonly heard: string[] = []
      log(message = '') { this.heard.push(`log ${message}`) }
      warn(message = '') { this.heard.push(`warn ${message}`) }
      error(message = '') { this.heard.push(`error ${message}`) }
    }
    const telemetry = new Telemetry()
    const logger = parseLogger(telemetry)
    logger.log('one')
    logger.warn('two')
    logger.error('three')
    expect(telemetry.heard).to.deep.equal(['log one', 'warn two', 'error three'])
  })

  it("drops whatever the host's logger throws", () => {
    const thrower = { log: () => { throw new Error('log drain is down') }, warn: () => { throw new Error('nope') }, error: () => { throw new TypeError('not a function') } }
    const logger = parseLogger(thrower)
    expect(() => { logger.log('one') }).to.not.throw()
    expect(() => { logger.warn('two') }).to.not.throw()
    expect(() => { logger.error('three') }).to.not.throw()
  })

  it("drops what an async logger rejects with, leaving no unhandled rejection", async () => {
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      const rejecter = { log: () => Promise.reject(new Error('log drain is down')), warn: () => Promise.reject(new Error('nope')), error: () => Promise.resolve() }
      const logger = parseLogger(rejecter)
      logger.log('one')
      logger.warn('two')
      logger.error('three')
      await TH.wakeupAtNextTick()
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })

  it("drops what a promise from another realm rejects with, which is no instance of this realm's Promise", async () => {
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      const foreign = () => runInNewContext('Promise.reject(new Error("log drain is down"))') as unknown
      const logger = parseLogger({ log: foreign, warn: foreign, error: foreign })
      logger.warn('one')
      await TH.wakeupAtNextTick()
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })
})

describe("VaultLogger", () => {
  it("fits a logger typed as the Coach's signature, `story` as a record of any", () => {
    type CoachsLogger = {
      log:   (message?: string, story?: Record<string, any>, err?: Error | null) => void
      warn:  (message?: string, story?: Record<string, any>, err?: Error | null) => void
      error: (message?: string, story?: Record<string, any>, err?: Error | null) => void
    }
    expectTypeOf<CoachsLogger>().toExtend<VaultLogger>()
    expectTypeOf<Console>().toExtend<VaultLogger>()
  })

  it("takes a story of any plain facts, nested ones too", () => {
    const spy = TH.spyLogger()
    const story = { call: 'store', attempt: 2, retried: true, when: null, detail: { kinds: ['stale_write'] } }
    spy.logger.warn('a store retried', story)
    expect(spy.calls[0]?.story).to.deep.equal(story)
  })
})

describe("asError", () => {
  it("hands a logger an Error as it is, and anything else thrown as null", () => {
    const thrown = new Error('a host error')
    expect(asError(thrown)).to.eq(thrown)
    expect(asError('a bare string')).to.be.null
    expect(asError(undefined)).to.be.null
  })
})
