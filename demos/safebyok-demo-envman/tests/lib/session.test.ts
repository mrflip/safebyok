// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** The session module as a fresh page load imports it, over what localStorage kept. */
async function loadSession() {
  vi.resetModules()
  return await import('../../src/lib/session')
}

beforeEach(() => { localStorage.clear() })

describe("the fake sign-in", () => {
  it("starts signed out", async () => {
    const session = await loadSession()
    expect(session.getSession()).to.be.null
  })

  it("signs in, tells each subscriber, and keeps the session across a reload", async () => {
    const session = await loadSession()
    const heard = vi.fn()
    session.subscribeSession(heard)
    session.signin('hue')
    expect(heard).toHaveBeenCalledOnce()
    const signedIn = session.getSession()
    expect(signedIn?.username).to.eq('hue')
    const reloaded = await loadSession()
    expect(reloaded.getSession()).to.deep.equal(signedIn)
  })

  it("gives the same username the same userid at each sign-in, and another username another", async () => {
    const session = await loadSession()
    session.signin('hue')
    const hue = session.getSession()?.userid
    localStorage.removeItem('envman:session')
    const again = await loadSession()
    again.signin('hue')
    expect(again.getSession()?.userid).to.eq(hue)
    again.signin('mo_2')
    expect(again.getSession()?.userid).to.not.eq(hue)
  })

  const UsernameCases = [
    ["",          'an empty username'],
    ["h",         'one letter'],
    ["Hue",       'a capital letter'],
    ["2hue",      'a leading digit'],
    ["hue smith", 'a space'],
  ] as const
  for (const [username, blurb] of UsernameCases) {
    it(`refuses ${blurb}`, async () => {
      const session = await loadSession()
      expect(() => { session.signin(username) }).to.throw('A username is')
      expect(session.getSession()).to.be.null
    })
  }

  it("forgets the session on sign out, and reloads the page", async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { reload })
    const session = await loadSession()
    session.signin('hue')
    session.signOut()
    expect(reload).toHaveBeenCalledOnce()
    const reloaded = await loadSession()
    expect(reloaded.getSession()).to.be.null
  })
})
