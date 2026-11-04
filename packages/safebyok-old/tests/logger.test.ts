import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { Bank } from '../src/bank'
import { VaultError } from '../src/errors'
import { localVaultDB } from '../src/local-vault-db'
import { memoryStore } from '../src/string-store'
import { DefaultLogger, asError, parseLogger, setDefaultLogger, type VaultLogger } from '../src/logger'
import * as TH from './test-helpers'

/** What a host might hand Bank.make as its logger that is not one. */
const NotLoggers = [
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
      expect(() => parseLogger(candidate as unknown as VaultLogger)).to.throw(VaultError, /^((log|warn|error): Expected a function(; )?)+$|^Expected a VaultLogger/)
    })
  }

  it("falls back to the console when given none, as its second example shows", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => { /* kept out of the test output */ })
    parseLogger(undefined).warn('a refresh failed', { call: 'refresh' })
    expect(warn).toHaveBeenCalledWith('safebyok: a refresh failed', { call: 'refresh' })
    warn.mockRestore()
  })

  it("answers the one default logger, DefaultLogger, whenever it is given none or null, as its third example shows", () => {
    expect(parseLogger(undefined)).to.eq(DefaultLogger)
    expect(parseLogger(null)).to.eq(DefaultLogger)
    expect(parseLogger(DefaultLogger)).to.eq(DefaultLogger)
  })

  it("guards the same host logger as the same object, however often it is handed in, as its fourth example shows", () => {
    const telemetry = TH.spyLogger().logger
    expect(parseLogger(telemetry)).to.eq(parseLogger(parseLogger(telemetry)))
    expect(parseLogger(telemetry)).to.eq(parseLogger(telemetry))
    expect(parseLogger(TH.spyLogger().logger)).to.not.eq(parseLogger(telemetry))
  })

  it("guards a logger once: one it has guarded comes back as itself, however many layers hand it down", () => {
    const spy = TH.spyLogger()
    const guarded = parseLogger(spy.logger)
    expect(guarded).to.not.eq(spy.logger)
    expect(parseLogger(guarded)).to.eq(guarded)
    const fallback = parseLogger(undefined)
    expect(parseLogger(parseLogger(fallback))).to.eq(fallback)
  })

  it("carries nothing beside its three calls, so that spreading or listing a guarded logger shows nothing more", () => {
    const guarded = parseLogger(TH.spyLogger().logger)
    expect(Reflect.ownKeys(guarded)).to.deep.equal(['log', 'warn', 'error'])
  })

  it("guards a logger made from a guarded one, which inherits nothing that would let it skip the guard", () => {
    const child = Object.create(parseLogger(TH.spyLogger().logger)) as VaultLogger
    child.error = () => { throw new Error('a child logger that throws') }
    const taken = parseLogger(child)
    expect(taken).to.not.eq(child)
    expect(() => { taken.error('x') }).to.not.throw()
  })

  it("guards a logger that claims to be guarded already, by any property it carries", () => {
    const claiming = { log: () => undefined, warn: () => undefined, error: () => { throw new Error('a logger that throws') }, _safebyok_modded: true }
    const taken = parseLogger(claiming)
    expect(taken).to.not.eq(claiming)
    expect(() => { taken.error('x') }).to.not.throw()
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

describe("setDefaultLogger", () => {
  afterEach(() => { setDefaultLogger(undefined) })

  it("sends what the default logger hears to the app's own, as its first example shows: a fallback taken before the call included", () => {
    const fallback = parseLogger(undefined)
    const telemetry = TH.spyLogger()
    setDefaultLogger(telemetry.logger)
    fallback.warn('a refresh failed', { call: 'refresh' })
    DefaultLogger.error('a listener threw')
    expect(telemetry.calls.map((call) => [call.level, call.message])).to.deep.equal([['warn', 'a refresh failed'], ['error', 'a listener threw']])
  })

  it("puts the console back when given none or null, as its second example shows", () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => { /* kept out of the test output */ })
    for (const none of [undefined, null]) {
      setDefaultLogger(TH.spyLogger().logger)
      setDefaultLogger(none)
      DefaultLogger.log('opened')
    }
    expect(consoleLog.mock.calls.map(([said]) => String(said))).to.deep.equal(['safebyok: opened', 'safebyok: opened'])
    consoleLog.mockRestore()
  })

  it("guards the logger it is given: one that throws breaks nothing", () => {
    setDefaultLogger({ log: () => undefined, warn: () => undefined, error: () => { throw new Error('a logger that throws') } })
    expect(() => { DefaultLogger.error('a listener threw') }).to.not.throw()
  })

  it("takes the default logger itself as the console, rather than handing each call to itself", () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => { /* kept out of the test output */ })
    setDefaultLogger(DefaultLogger)
    DefaultLogger.warn('heard once')
    expect(consoleWarn).toHaveBeenCalledOnce()
    consoleWarn.mockRestore()
  })

  for (const [candidate, blurb] of NotLoggers) {
    it(`refuses ${blurb} as bad_option, keeping the default it had`, () => {
      const telemetry = TH.spyLogger()
      setDefaultLogger(telemetry.logger)
      expect(() => { setDefaultLogger(candidate as unknown as VaultLogger) }).to.throw(VaultError, /^((log|warn|error): Expected a function(; )?)+$|^Expected a VaultLogger/)
      DefaultLogger.log('still heard')
      expect(telemetry.calls).to.have.lengthOf(1)
    })
  }
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
    const story = { call: 'putBox', attempt: 2, retried: true, when: null, detail: { kinds: ['stale_write'] } }
    spy.logger.warn('a store retried', story)
    expect(spy.calls[0]?.story).to.deep.equal(story)
  })
})

/**
 * A bank over `logger` births u1's vault, then its device store fails every raise of the device
 * record, so the vault's first unlock warns that it could not note the copy it wrote: one line,
 * through `logger`. `overrides` replace any of the bank's options.
 */
const warnAtFirstUnlock = async (logger: VaultLogger, overrides: Partial<TH.BornVaultOpts> = {}): Promise<void> => {
  const { vaultlabel, ...bankOpts } = TH.memoryVaultOpts({ logger, ...overrides })
  const bank = Bank.make(bankOpts)
  const vault = await bank.ensureVault({ vaultlabel })
  TH.spyOnDeviceHook(bankOpts.deviceDB, 'raiseDeviceRecord').mockRejectedValue(new Error('the disk said no'))
  await TH.unlock(vault, 'pw')
  bank.closeVaults()
}

const RaiseWarning = 'could not note the newest copy of the vault'

describe("VaultLogger, handed to Bank.make", () => {
  it("hears what a bank's vault says, through the host's own three calls, as its first example shows", async () => {
    const telemetry = TH.spyLogger()
    const logger: VaultLogger = {
      log:   (message, story) => { telemetry.logger.log(message, story) },
      warn:  (message, story, err) => { telemetry.logger.warn(message, story, err) },
      error: (message, story, err) => { telemetry.logger.error(message, story, err) },
    }
    await warnAtFirstUnlock(logger)
    expect(telemetry.calls).to.have.length.greaterThan(0)
    for (const call of telemetry.calls) {
      expect(call.level).to.eq('warn')
      expect(call.message).to.include(RaiseWarning)
    }
  })

  it("is silent given three calls that do nothing, as its second example shows", async () => {
    const consoles = (['log', 'warn', 'error'] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => { /* kept out of the test output */ }))
    await warnAtFirstUnlock({ log: () => undefined, warn: () => undefined, error: () => undefined })
    for (const said of consoles) { expect(said).not.toHaveBeenCalled() }
  })

  it("takes the console itself, its lines untagged, as its third example shows", async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => { /* kept out of the test output */ })
    await warnAtFirstUnlock(console)
    const warned = consoleWarn.mock.calls.map(([message]) => String(message)).find((message) => message.includes(RaiseWarning))
    expect(warned).to.match(/^This device could not note/)
  })
})

describe("DefaultLogger", () => {
  afterEach(() => { setDefaultLogger(undefined) })

  it("sends the vault's lines to the default, while its storage keeps a logger of its own, as its example shows", async () => {
    const telemetry = TH.spyLogger()
    const storageSpy = TH.spyLogger()
    setDefaultLogger(telemetry.logger)
    await warnAtFirstUnlock(DefaultLogger, { vaultDB: localVaultDB({ store: memoryStore(), logger: storageSpy.logger }) })
    const warnedOf = (calls: readonly TH.LoggedCall[]) => calls.filter((call) => call.message?.includes(RaiseWarning)).length
    expect(warnedOf(telemetry.calls)).to.be.greaterThan(0)
    expect(warnedOf(storageSpy.calls)).to.eq(0)
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
