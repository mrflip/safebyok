import { describe, expect, it, vi } from 'vitest'
import { memoryStore, type StringStore } from 'safebyok'
import { createAuth } from '../../src/lib/auth'

/** Two fresh stores, a clock the test moves by hand, and the auth over them. */
const makeWorld = () => {
  const dbStore = memoryStore()
  const deviceStore = memoryStore()
  let nowMillis = Date.UTC(2026, 9, 15, 9, 30)
  const clock = { now: () => nowMillis }
  const advance = (byMillis: number) => { nowMillis += byMillis }
  const auth = createAuth({ applabel: 'acme', dbStore, deviceStore, clock })
  return { dbStore, deviceStore, advance, auth }
}

/** The account row the fake auth keeps for margo, as it is stored: null if there is none. */
const margosAccount = (dbStore: StringStore): unknown => JSON.parse(dbStore.get('account:acme:margo') ?? 'null')

describe("createAuth", () => {
  it("starts signed out", () => {
    const { auth } = makeWorld()
    expect(auth.getSnapshot()).to.be.null
  })

  it("signing in creates the account on first sight and starts a session", async () => {
    const { auth, dbStore } = makeWorld()
    const session = await auth.signIn('margo')
    expect(session.userlabel).to.eq('margo')
    expect(session.user_id).to.match(/^user_[0-9a-f]{16}$/)
    expect(auth.getSnapshot()).to.eq(session)
    expect(dbStore.get('account:acme:margo')).to.not.be.null
  })

  it("stamps a new account with the clock's time, in epoch milliseconds", async () => {
    const { auth, dbStore } = makeWorld()
    const session = await auth.signIn('margo')
    expect(margosAccount(dbStore)).to.deep.equal({ user_id: session.user_id, userlabel: 'margo', registered_at: Date.UTC(2026, 9, 15, 9, 30) })
  })

  it("the same userlabel signs back into the same account, registered when it was made", async () => {
    const { auth, dbStore, advance } = makeWorld()
    const first = await auth.signIn('margo')
    auth.signOut()
    advance(24 * 60 * 60 * 1000)
    const again = await auth.signIn('margo')
    expect(again.user_id).to.eq(first.user_id)
    expect(margosAccount(dbStore)).to.have.property('registered_at', Date.UTC(2026, 9, 15, 9, 30))
  })

  it("reads the wall clock when handed none", async () => {
    const dbStore = memoryStore()
    const auth = createAuth({ applabel: 'acme', dbStore, deviceStore: memoryStore() })
    vi.useFakeTimers({ now: Date.UTC(2026, 9, 15, 9, 30), toFake: ['Date'] })
    try {
      await auth.signIn('margo')
    } finally {
      vi.useRealTimers()
    }
    expect(margosAccount(dbStore)).to.have.property('registered_at', Date.UTC(2026, 9, 15, 9, 30))
  })

  const BadClockCases = [
    [NaN,                       'a clock reading NaN'],
    [Date.UTC(2026, 9, 15) / 1000, 'a clock in epoch seconds'],
    [Date.UTC(2026, 9, 15) * 1000, 'a clock in epoch microseconds'],
  ] as const

  for (const [reading, blurb] of BadClockCases) {
    it(`refuses a new account's sign-in, stamping nothing, for ${blurb}`, async () => {
      const dbStore = memoryStore()
      const auth = createAuth({ applabel: 'acme', dbStore, deviceStore: memoryStore(), clock: { now: () => reading } })
      await expect(auth.signIn('margo')).rejects.toThrow(/clock read no time between 1981 and 2255/)
      expect(dbStore.get('account:acme:margo')).to.be.null
      expect(auth.getSnapshot()).to.be.null
    })
  }

  it("rounds a clock's fraction down, as the vault does", async () => {
    const dbStore = memoryStore()
    const auth = createAuth({ applabel: 'acme', dbStore, deviceStore: memoryStore(), clock: { now: () => Date.UTC(2026, 9, 15) + 0.75 } })
    await auth.signIn('margo')
    expect(margosAccount(dbStore)).to.have.property('registered_at', Date.UTC(2026, 9, 15))
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

  it("the session survives in device storage, as a page reload would see it", async () => {
    const { auth, dbStore, deviceStore } = makeWorld()
    const session = await auth.signIn('margo')
    const reloaded = createAuth({ applabel: 'acme', dbStore, deviceStore })
    expect(reloaded.getSnapshot()).to.deep.equal(session)
  })

  it("signing out ends the session on this device but keeps the account", async () => {
    const { auth, dbStore, deviceStore } = makeWorld()
    await auth.signIn('margo')
    auth.signOut()
    expect(auth.getSnapshot()).to.be.null
    expect(deviceStore.get('session:acme')).to.be.null
    expect(dbStore.get('account:acme:margo')).to.not.be.null
  })

  it("deleting the account removes its row and the session", async () => {
    const { auth, dbStore } = makeWorld()
    await auth.signIn('margo')
    await auth.deleteAccount()
    expect(auth.getSnapshot()).to.be.null
    expect(dbStore.get('account:acme:margo')).to.be.null
  })

  it("a mangled device session reads as signed out, not as a crash", () => {
    const { dbStore, deviceStore } = makeWorld()
    deviceStore.put('session:acme', 'not even json')
    const reloaded = createAuth({ applabel: 'acme', dbStore, deviceStore })
    expect(reloaded.getSnapshot()).to.be.null
    expect(deviceStore.get('session:acme')).to.be.null
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
