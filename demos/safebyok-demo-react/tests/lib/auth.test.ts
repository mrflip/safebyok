import { describe, expect, it, vi } from 'vitest'
import { createAuth } from '../../src/lib/auth'
import type { StringStorage } from '../../src/lib/string-storage'
import { memoryStorage } from '../test-helpers'

/** Make two fresh storages, a clock the test advances by hand, and an auth that uses them. */
const makeWorld = () => {
  const dbStorage = memoryStorage()
  const deviceStorage = memoryStorage()
  let nowMillis = Date.UTC(2026, 9, 15, 9, 30)
  const clock = { now: () => nowMillis }
  const advance = (byMillis: number) => { nowMillis += byMillis }
  const auth = createAuth({ applabel: 'acme', dbStorage, deviceStorage, clock })
  return { dbStorage, deviceStorage, advance, auth }
}

/** The stored account row for margo, or null if there is none. */
const margosAccount = (dbStorage: StringStorage): unknown => JSON.parse(dbStorage.get('account:acme:margo') ?? 'null')

describe("createAuth", () => {
  it("starts signed out", () => {
    const { auth } = makeWorld()
    expect(auth.getSnapshot()).to.be.null
  })

  it("signing in creates the account on first sight and starts a session", async () => {
    const { auth, dbStorage } = makeWorld()
    const session = await auth.signIn('margo')
    expect(session.userlabel).to.eq('margo')
    expect(session.user_id).to.match(/^user_[0-9a-f]{16}$/)
    expect(auth.getSnapshot()).to.eq(session)
    expect(dbStorage.get('account:acme:margo')).to.not.be.null
  })

  it("stamps a new account with the clock's time, in epoch milliseconds", async () => {
    const { auth, dbStorage } = makeWorld()
    const session = await auth.signIn('margo')
    expect(margosAccount(dbStorage)).to.deep.equal({ user_id: session.user_id, userlabel: 'margo', registered_at: Date.UTC(2026, 9, 15, 9, 30) })
  })

  it("the same userlabel signs back into the same account, registered when it was made", async () => {
    const { auth, dbStorage, advance } = makeWorld()
    const first = await auth.signIn('margo')
    auth.signOut()
    advance(24 * 60 * 60 * 1000)
    const again = await auth.signIn('margo')
    expect(again.user_id).to.eq(first.user_id)
    expect(margosAccount(dbStorage)).to.have.property('registered_at', Date.UTC(2026, 9, 15, 9, 30))
  })

  it("reads the wall clock when handed none", async () => {
    const dbStorage = memoryStorage()
    const auth = createAuth({ applabel: 'acme', dbStorage, deviceStorage: memoryStorage() })
    vi.useFakeTimers({ now: Date.UTC(2026, 9, 15, 9, 30), toFake: ['Date'] })
    try {
      await auth.signIn('margo')
    } finally {
      vi.useRealTimers()
    }
    expect(margosAccount(dbStorage)).to.have.property('registered_at', Date.UTC(2026, 9, 15, 9, 30))
  })

  it("rounds a clock's fraction down", async () => {
    const dbStorage = memoryStorage()
    const auth = createAuth({ applabel: 'acme', dbStorage, deviceStorage: memoryStorage(), clock: { now: () => Date.UTC(2026, 9, 15) + 0.75 } })
    await auth.signIn('margo')
    expect(margosAccount(dbStorage)).to.have.property('registered_at', Date.UTC(2026, 9, 15))
  })

  it("different userlabels are different accounts", async () => {
    const { auth } = makeWorld()
    const margo = await auth.signIn('margo')
    const nikos = await auth.signIn('nikos')
    expect(nikos.user_id).to.not.eq(margo.user_id)
  })

  it("refuses a userlabel that is not a label", async () => {
    const { auth } = makeWorld()
    await expect(auth.signIn('not a label')).rejects.toThrow()
    expect(auth.getSnapshot()).to.be.null
  })

  it("the session survives a page reload", async () => {
    const { auth, dbStorage, deviceStorage } = makeWorld()
    const session = await auth.signIn('margo')
    const reloaded = createAuth({ applabel: 'acme', dbStorage, deviceStorage })
    expect(reloaded.getSnapshot()).to.deep.equal(session)
  })

  it("signing out ends the session on this device but keeps the account", async () => {
    const { auth, dbStorage, deviceStorage } = makeWorld()
    await auth.signIn('margo')
    auth.signOut()
    expect(auth.getSnapshot()).to.be.null
    expect(deviceStorage.get('session:acme')).to.be.null
    expect(dbStorage.get('account:acme:margo')).to.not.be.null
  })

  it("deleting the account removes its row and the session", async () => {
    const { auth, dbStorage } = makeWorld()
    await auth.signIn('margo')
    await auth.deleteAccount()
    expect(auth.getSnapshot()).to.be.null
    expect(dbStorage.get('account:acme:margo')).to.be.null
  })

  it("a mangled device session reads as signed out, not as a crash", () => {
    const { dbStorage, deviceStorage } = makeWorld()
    deviceStorage.put('session:acme', 'not even json')
    const reloaded = createAuth({ applabel: 'acme', dbStorage, deviceStorage })
    expect(reloaded.getSnapshot()).to.be.null
    expect(deviceStorage.get('session:acme')).to.be.null
  })

  it("tells listeners about sign-in and sign-out", async () => {
    const { auth } = makeWorld()
    let heardCount = 0
    auth.subscribe(() => { heardCount += 1 })
    await auth.signIn('margo')
    auth.signOut()
    expect(heardCount).to.eq(2)
  })
})
