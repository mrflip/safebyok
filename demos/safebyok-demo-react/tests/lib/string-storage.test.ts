// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { prefixedStorage } from '../../src/lib/string-storage'

afterEach(() => { localStorage.clear() })

describe("prefixedStorage", () => {
  it("puts, gets and deletes a text in localStorage under its prefix", () => {
    const store = prefixedStorage('demo:')
    expect(store.get('session')).to.be.null
    store.put('session', '{"user_id":"u1"}')
    expect(localStorage.getItem('demo:session')).to.eq('{"user_id":"u1"}')
    expect(store.get('session')).to.eq('{"user_id":"u1"}')
    store.del('session')
    expect(store.get('session')).to.be.null
  })

  it("keeps two prefixes apart", () => {
    prefixedStorage('db:').put('margo', 'account')
    expect(prefixedStorage('device:').get('margo')).to.be.null
  })
})
