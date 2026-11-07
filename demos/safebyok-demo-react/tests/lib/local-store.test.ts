// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { localStore } from '../../src/lib/local-store'

afterEach(() => { localStorage.clear() })

describe("localStore", () => {
  it("puts, gets and deletes a text in localStorage under its prefix", () => {
    const store = localStore('demo:')
    expect(store.get('session')).to.be.null
    store.put('session', '{"user_id":"u1"}')
    expect(localStorage.getItem('demo:session')).to.eq('{"user_id":"u1"}')
    expect(store.get('session')).to.eq('{"user_id":"u1"}')
    store.del('session')
    expect(store.get('session')).to.be.null
  })

  it("keeps two prefixes apart", () => {
    localStore('db:').put('margo', 'account')
    expect(localStore('device:').get('margo')).to.be.null
  })
})
