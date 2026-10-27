import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { domStore, memoryStore } from '../src/string-store'
import { VaultError } from '../src/errors'
import { setDefaultLogger } from '../src/logger'
import * as TH from './test-helpers'

/** A logger's every call, for a logger that fails: what it throws must break nothing. */
const throwFromLogger = () => { throw new Error('a logger that throws') }

describe("memoryStore", () => {
  it("reads back what was written, and null where nothing was", () => {
    const store = memoryStore()
    expect(store.read('greeting')).to.be.null
    store.write('greeting', 'hi')
    expect(store.read('greeting')).to.eq('hi')
  })

  it("erases, and erasing what isn't there is quietly fine", () => {
    const store = memoryStore()
    store.write('greeting', 'hi')
    store.erase('greeting')
    store.erase('greeting')
    expect(store.read('greeting')).to.be.null
  })

  it("lists every scopepath it holds", () => {
    const store = memoryStore()
    store.write('one', '1')
    store.write('two', '2')
    expect(store.scopepaths()).to.have.members(['one', 'two'])
  })

  it("rings subscribers on write and erase, and unsubscribing silences them", () => {
    const store = memoryStore()
    let heardCount = 0
    const unsubscribe = store.subscribe(() => { heardCount += 1 })
    store.write('one', '1')
    store.erase('one')
    expect(heardCount).to.eq(2)
    unsubscribe()
    store.write('two', '2')
    expect(heardCount).to.eq(2)
  })

  it("refuses a listener that is not a function as it subscribes, so no later write meets it", () => {
    const store = memoryStore()
    expect(() => store.subscribe('not a listener' as unknown as () => void)).to.throw(VaultError, /listener function/)
    store.write('one', '1')
    expect(store.read('one')).to.eq('1')
  })
})

/** A DOM Storage over a Map, as localStorage behaves for what domStore asks of it. */
const mapStorage = (): Storage => {
  const bag = new Map<string, string>()
  return {
    get length() { return bag.size },
    key:        (idx: number) => [...bag][idx]?.[0] ?? null,
    getItem:    (ckey: string) => bag.get(ckey) ?? null,
    setItem:    (ckey: string, text: string) => { bag.set(ckey, text) },
    removeItem: (ckey: string) => { bag.delete(ckey) },
    clear:      () => { bag.clear() },
  }
}

describe("domStore", () => {
  it("files each scopepath under its prefix, and sees only its own", () => {
    const webStorage = mapStorage()
    const dbStore = domStore(webStorage, 'safebyok-demo:db:')
    const deviceStore = domStore(webStorage, 'safebyok-demo:device:')
    dbStore.write('greeting', 'hi')
    deviceStore.write('other', 'there')
    expect(webStorage.getItem('safebyok-demo:db:greeting')).to.eq('hi')
    expect(dbStore.read('greeting')).to.eq('hi')
    expect(dbStore.scopepaths()).to.deep.equal(['greeting'])
    dbStore.erase('greeting')
    expect(webStorage.getItem('safebyok-demo:db:greeting')).to.be.null
    expect(deviceStore.scopepaths()).to.deep.equal(['other'])
  })
})

describe("the stores' bell", () => {
  // A listener that throws is said through the default logger: a spy's, kept out of the test output.
  beforeEach(() => { setDefaultLogger(TH.spyLogger().logger) })
  afterEach(() => { setDefaultLogger(undefined) })

  it("tells the default logger of a listener that throws, from either store", () => {
    const spy = TH.spyLogger()
    setDefaultLogger(spy.logger)
    const thrown = new Error('a listener that throws')
    for (const store of [memoryStore(), domStore(mapStorage(), 'acme:')]) {
      store.subscribe(() => { throw thrown })
      store.write('greeting', 'hi')
    }
    expect(spy.calls.map((call) => [call.level, call.story, call.err])).to.deep.equal([
      ['error', { call: 'StringStore' }, thrown],
      ['error', { call: 'StringStore' }, thrown],
    ])
  })

  it("tells the console of a listener that throws, when no default logger was set", () => {
    setDefaultLogger(undefined)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => { /* kept out of the test output */ })
    try {
      const store = memoryStore()
      store.subscribe(() => { throw new Error('a listener that throws') })
      store.write('greeting', 'hi')
      expect(consoleError).toHaveBeenCalledOnce()
      expect(String(consoleError.mock.calls[0]?.[0])).to.match(/^safebyok: A listener of a string store threw/)
    } finally {
      consoleError.mockRestore()
    }
  })

  it("lands the write when the default logger throws too", () => {
    setDefaultLogger({ log: throwFromLogger, warn: throwFromLogger, error: throwFromLogger })
    const store = memoryStore()
    store.subscribe(() => { throw new Error('a listener that throws') })
    expect(() => { store.write('greeting', 'hi') }).to.not.throw()
    expect(store.read('greeting')).to.eq('hi')
  })

  it("reports a listener that throws something other than an Error as it was thrown", () => {
    const reported: unknown[] = []
    vi.stubGlobal('reportError', (err: unknown) => { reported.push(err) })
    try {
      const store = memoryStore()
      store.subscribe(() => { throw 'a string, thrown' }) // eslint-disable-line @typescript-eslint/only-throw-error
      store.write('greeting', 'hi')
      expect(reported).to.deep.equal(['a string, thrown'])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("rings every other listener, and lands the write, when one throws: what it threw goes to the platform's reportError", () => {
    const reported: unknown[] = []
    vi.stubGlobal('reportError', (err: unknown) => { reported.push(err) })
    try {
      const store = memoryStore()
      const thrown = new Error('a listener that throws')
      const heard: string[] = []
      store.subscribe(() => { heard.push('one'); throw thrown })
      store.subscribe(() => { heard.push('two') })
      expect(() => { store.write('greeting', 'hi') }).to.not.throw()
      expect(store.read('greeting')).to.eq('hi')
      expect(heard).to.deep.equal(['one', 'two'])
      expect(reported).to.deep.equal([thrown])
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
