import { describe, expect, it, vi } from 'vitest'
import { consoleLogger } from '../src/console-logger'

const quiet = () => { /* kept out of the test output */ }

describe("consoleLogger", () => {
  it("sends each call to the console method of the same name, tagged safebyok", () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(quiet)
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(quiet)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(quiet)
    consoleLogger.log('opened')
    consoleLogger.warn('a refresh failed')
    consoleLogger.error('the adapter is broken')
    expect(consoleLog).toHaveBeenCalledWith('safebyok: opened')
    expect(consoleWarn).toHaveBeenCalledWith('safebyok: a refresh failed')
    expect(consoleError).toHaveBeenCalledWith('safebyok: the adapter is broken')
  })

  it("follows the message with its story and its error, when there are any", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(quiet)
    const err = new Error('the storage adapter failed')
    consoleLogger.warn('a refresh failed', { call: 'refresh' }, err)
    consoleLogger.warn('a refresh failed', undefined, err)
    consoleLogger.warn('a refresh failed', { call: 'refresh' }, null)
    expect(warn.mock.calls).to.deep.equal([
      ['safebyok: a refresh failed', { call: 'refresh' }, err],
      ['safebyok: a refresh failed', err],
      ['safebyok: a refresh failed', { call: 'refresh' }],
    ])
  })

  it("still says where it comes from with no message at all", () => {
    const log = vi.spyOn(console, 'log').mockImplementation(quiet)
    consoleLogger.log()
    expect(log).toHaveBeenCalledWith('safebyok')
  })
})
