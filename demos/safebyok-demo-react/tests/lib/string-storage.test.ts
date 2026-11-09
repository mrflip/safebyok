// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { prefixedStorage } from '../../src/lib/string-storage'

afterEach(() => { localStorage.clear() })

describe("prefixedStorage", () => {
  it("puts, gets and deletes a text in localStorage under its prefix", () => {
    const storage = prefixedStorage('demo:')
    expect(storage.get('session')).to.be.null
    storage.put('session', '{"user_id":"u1"}')
    expect(localStorage.getItem('demo:session')).to.eq('{"user_id":"u1"}')
    expect(storage.get('session')).to.eq('{"user_id":"u1"}')
    storage.del('session')
    expect(storage.get('session')).to.be.null
  })

  it("keeps two prefixes apart", () => {
    prefixedStorage('db:').put('margo', 'account')
    expect(prefixedStorage('device:').get('margo')).to.be.null
  })
})
