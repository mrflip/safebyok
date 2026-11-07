// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { device_id, strengthChecker } from '../../src/lib/stores'

const Scope = { applabel: 'safebyok_demo', user_id: 'u1', vaultlabel: 'main' }

describe("the demo's stores", () => {
  it("keeps this browser's device_id in localStorage", () => {
    expect(device_id).to.match(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[\da-f]{4}-[\da-f]{12}$/)
    expect(localStorage.getItem('safebyok-demo:device_id')).to.eq(device_id)
  })

  it("takes a passphrase of 12 characters or more, and refuses a shorter one, saying why", async () => {
    expect(await strengthChecker('twelve chars', Scope)).to.eql({ strong: true })
    expect(await strengthChecker('eleven char', Scope)).to.include({ strong: false })
  })
})
