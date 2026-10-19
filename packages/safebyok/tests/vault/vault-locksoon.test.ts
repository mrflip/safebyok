import { describe, beforeEach, vi, afterEach, it, expect } from 'vitest'
import * as TH from '../test-helpers'
import { makeRacingWorld, makeWorld, generationOf, SevenDaysMillis } from './world'


describe("lockSoon", () => {
  // Only the timers: promises, and vitest's own waits, keep running as they do.
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }) })
  afterEach(() => { vi.useRealTimers() })

  const GraceMillis = 5000

  it("closes the entry gate at once: the snapshot reads 'locked', and no whisper comes out", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.storeBox('anthropic', 'sk-fake')
    await vault.lockSoon()
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(vault.getSnapshot().askPassphraseAt).to.be.null
    await TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
    await TH.expectRefusal(vault.storeBox('openai', 'sk-fake-too'), 'vault_locked')
  })

  it("keeps the gate closed through the grace, even if the clock steps back", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.storeBox('anthropic', 'sk-fake')
    await vault.lockSoon(30)
    world.advance(-10_000)
    await TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
    expect(vault.getSnapshot().state).to.eq('locked')
  })

  it("revokes the lease at once: a reopen within the grace asks for the passphrase", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.lockSoon()
    expect(await world.readLease()).to.be.null
    expect(await world.stateOnOpen()).to.eq('locked')
  })

  it("lets work in hand finish: a store already under way lands within the grace", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    const gate = world.holdNextBoxRead()
    const storing = vault.storeBox('anthropic', 'sk-fake')
    await gate.reached
    await vault.lockSoon()
    gate.release()
    await storing
    await vault.unlock('pw one')
    expect(await vault.readBox('anthropic')).to.eq('sk-fake')
  })

  it("keeps the key for work in hand while new work is refused at the gate", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    const gate = world.holdNextBoxRead()
    const storing = vault.storeBox('anthropic', 'sk-fake')
    await gate.reached
    await vault.lockSoon()
    await TH.expectRefusal(vault.readBox('anthropic'), 'vault_locked')
    gate.release()
    await storing
  })

  it("drops the vaultKey when the grace runs out: work still in hand after it is refused", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    const gate = world.holdNextBoxRead()
    const storing = TH.expectRefusal(vault.storeBox('anthropic', 'sk-fake'), 'vault_locked')
    await gate.reached
    await vault.lockSoon()
    vi.advanceTimersByTime(GraceMillis)
    gate.release()
    await storing
    expect(vi.getTimerCount()).to.eq(0)
    await vault.unlock('pw one')
    await TH.expectRefusal(vault.readBox('anthropic'), 'absent_box')
  })

  it("unlike lock(), which refuses work in hand at its next look", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    const gate = world.holdNextBoxRead()
    const storing = TH.expectRefusal(vault.storeBox('anthropic', 'sk-fake'), 'vault_locked')
    await gate.reached
    await vault.lock()
    gate.release()
    await storing
  })

  it("lets an unlock under way when it is called finish, unlocked and leased: a soft lock waits for work in hand", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    const gate = world.holdNextDerive()
    const unlocking = vault.unlock('pw one')
    await gate.reached
    await vault.lockSoon()
    expect(vault.getSnapshot().state).to.eq('locked')
    gate.release()
    await unlocking
    vi.advanceTimersByTime(GraceMillis * 2)
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(await world.readLease()).to.not.be.null
  })

  it("lets a changePassphrase() under way finish, unlocked under the new passphrase", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('old passphrase')
    const gate = world.holdNextDerive()
    const changing = vault.changePassphrase('old passphrase', 'new passphrase')
    await gate.reached
    await vault.lockSoon()
    gate.release()
    await changing
    vi.advanceTimersByTime(GraceMillis * 2)
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(await world.readLease()).to.not.be.null
    await vault.lock()
    await TH.expectRefusal(vault.unlock('old passphrase'), 'wrong_passphrase')
    await vault.unlock('new passphrase')
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("lets an unlock under way in another tab finish, raising no lock generation", async () => {
    const world = makeRacingWorld()
    const otherTab = await world.openUnlocked('pw one')
    const thisTab = await world.open()
    await thisTab.lock()
    const gate = world.holdNextDerive()
    const unlocking = thisTab.unlock('pw one')
    await gate.reached
    await otherTab.unlock('pw one')
    await otherTab.lockSoon()
    gate.release()
    await unlocking
    expect(thisTab.getSnapshot().state).to.eq('unlocked')
    expect(await generationOf(world)).to.eq(1)
    expect(await world.readLease()).to.not.be.null
  })

  it("is ended by an unlock within the grace: the new unlock stands past it, with its lease", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.storeBox('anthropic', 'sk-fake')
    await vault.lockSoon()
    await vault.unlock('pw one')
    expect(vi.getTimerCount()).to.eq(1)  // the new unlock's own shut, seven days and a minute out
    vi.advanceTimersByTime(GraceMillis * 2)
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(vault.getSnapshot().askPassphraseAt).to.eq(world.clock.now() + SevenDaysMillis)
    expect(await vault.readBox('anthropic')).to.eq('sk-fake')
    expect(await world.readLease()).to.not.be.null
  })

  it("is ended by a changePassphrase() within the grace, which proves the passphrase as an unlock does", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('old passphrase')
    await vault.storeBox('anthropic', 'sk-fake')
    await vault.lockSoon()
    await vault.changePassphrase('old passphrase', 'new passphrase')
    expect(vi.getTimerCount()).to.eq(1)  // the new deadline's own shut
    vi.advanceTimersByTime(GraceMillis * 2)
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(await vault.readBox('anthropic')).to.eq('sk-fake')
  })

  it("loses to an unlock begun within the grace and still under way when it runs out", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.storeBox('anthropic', 'sk-fake')
    await vault.lockSoon()
    const gate = world.holdNextDerive()
    const unlocking = vault.unlock('pw one')
    await gate.reached
    vi.advanceTimersByTime(GraceMillis)
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(await vault.readBox('anthropic')).to.eq('sk-fake')
  })

  it("never lengthens a grace already running, and a shorter one shortens it", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    const firstGate = world.holdNextBoxRead()
    const firstStoring = TH.expectRefusal(vault.storeBox('anthropic', 'sk-fake'), 'vault_locked')
    await firstGate.reached
    await vault.lockSoon(1)
    await vault.lockSoon(30)
    vi.advanceTimersByTime(1000)
    firstGate.release()
    await firstStoring

    await vault.unlock('pw one')
    const secondGate = world.holdNextBoxRead()
    const secondStoring = TH.expectRefusal(vault.storeBox('anthropic', 'sk-fake'), 'vault_locked')
    await secondGate.reached
    await vault.lockSoon(30)
    await vault.lockSoon(1)
    vi.advanceTimersByTime(1000)
    secondGate.release()
    await secondStoring
    expect(vi.getTimerCount()).to.eq(0)
  })

  it("with a grace of 0 is lock(): work in hand is refused, and no timer is left", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    const gate = world.holdNextBoxRead()
    const storing = TH.expectRefusal(vault.storeBox('anthropic', 'sk-fake'), 'vault_locked')
    await gate.reached
    await vault.lockSoon(0)
    expect(vi.getTimerCount()).to.eq(0)
    gate.release()
    await storing
    expect(await world.readLease()).to.be.null
  })

  it("on a vault already locked, or never made, leaves it so, with no timer", async () => {
    const world = makeRacingWorld()
    const vault = await world.open()
    await vault.lockSoon()
    expect(vault.getSnapshot().state).to.eq('absent')
    await vault.unlock('pw one')
    await vault.lock()
    await vault.lockSoon()
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(vi.getTimerCount()).to.eq(0)
  })

  it("tells subscribers once, when the gate closes, and not again when the key goes", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    const listener = vi.fn()
    vault.subscribe(listener)
    await vault.lockSoon()
    expect(listener).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(GraceMillis)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("is cut short by close(): no timer outlives the handle", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.lockSoon(60)
    expect(vi.getTimerCount()).to.eq(1)
    vault.close()
    expect(vi.getTimerCount()).to.eq(0)
    await TH.expectRefusal(vault.lockSoon(), 'vault_closed')
  })

  it("is cut short by lock(), and by retire()", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.lockSoon()
    await vault.lock()
    expect(vi.getTimerCount()).to.eq(0)
    await vault.unlock('pw one')
    await vault.lockSoon()
    await vault.retire()
    expect(vi.getTimerCount()).to.eq(0)
    expect(vault.getSnapshot().state).to.eq('absent')
  })

  it("as the screen-lock recipe calls it, when the tab is hidden", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    // A stand-in for `document`, which Node has not.
    const page = Object.assign(new EventTarget(), { hidden: false })
    page.addEventListener('visibilitychange', () => { if (page.hidden) { void vault.lockSoon() } })
    const listener = vi.fn()
    vault.subscribe(listener)
    page.hidden = true
    page.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => { expect(listener).toHaveBeenCalled() })
    expect(vault.getSnapshot().state).to.eq('locked')
  })

  const AcceptedGraces = [
    [undefined,  'left out, it is five seconds'],
    [0,          'zero is allowed, and means lock() now'],
    [0.5,        'fractions are fine'],
    [60,         'sixty seconds is the longest grace'],
  ] as const

  const RefusedGraces = [
    [60.001,     'past sixty seconds is refused'],
    [-1,         'a negative grace is refused'],
    [NaN,        'NaN is refused'],
    [Infinity,   'Infinity is refused: the key must die'],
    ["5",        'a number in a string is refused'],
    [null,       'null is refused'],
  ] as const

  describe("graceSeconds", () => {
    for (const [grace, blurb] of AcceptedGraces) {
      it(blurb, async () => {
        const vault = await makeWorld().openUnlocked('pw one')
        await vault.lockSoon(grace)
        expect(vault.getSnapshot().state).to.eq('locked')
      })
    }
    for (const [grace, blurb] of RefusedGraces) {
      it(blurb, async () => {
        const vault = await makeWorld().openUnlocked('pw one')
        const err = await TH.expectRefusal(vault.lockSoon(grace as unknown as number), 'bad_option')
        expect(err.message).to.include('graceSeconds')
        expect(vault.getSnapshot().state).to.eq('unlocked')
      })
    }
  })
})
