import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { memoryDeviceDB } from '../../src/device-db'
import { Vault } from '../../src/vault'
import * as TH from '../test-helpers'
import { makeRacingWorld, HourMillis } from './world'

// Each test holds one call at a seam mid-flight, asks a second call, then releases the first, and
// asserts the one order the vault's turns give: the work in flight finishes, then the call asked
// during it runs.

// == [Locks and reads]: a lock, an unlock or a close asked while a read is under way

/** A racing world whose `u1` vault holds the box `anthropic`, its lease kept on this device, and no Vault object open. */
const seededWorld = async () => {
  const world = makeRacingWorld()
  const maker = await world.openUnlocked('pw')
  await maker.putBox('anthropic', 'sk-fake')
  maker.close()
  return world
}

describe("turns, around a read of storage", () => {
  it("lands a lock asked during a hello's read after it: the lease read is taken up, then dropped and erased", async () => {
    const world = await seededWorld()
    const vault = Vault.make(world.optsWith())
    const reading = TH.holdNextCall(world.deviceDB, 'getLease')
    const hello = vault.hello()
    await reading.reached
    const locking = vault.lock()
    reading.release()
    await hello
    await locking
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.getLease()).to.be.null
    expect(await world.stateOnOpen()).to.eq('locked')
  })

  it("runs an unlock asked during a hello's read after it, proving against what that read found, and reading nothing more", async () => {
    const world = await seededWorld()
    const locked = await world.open()
    await locked.lock()
    locked.close()
    const deaf = world.deafVaultDB()
    const vault = Vault.make(world.optsWith({ vaultDB: deaf }))
    const reads = vi.spyOn(deaf, 'getVault')
    const reading = TH.holdNextCall(deaf, 'getVault')
    const hello = vault.hello()
    await reading.reached
    const unlocking = vault.unlock('pw')
    reading.release()
    await hello
    await unlocking
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(reads).toHaveBeenCalledOnce()
    expect(await vault.getWhisper('anthropic')).to.eq('sk-fake')
  })

  it("lands a lock asked during a getWhisper's read after it: the whisper is handed back, and the vault is locked", async () => {
    const world = await seededWorld()
    const vault = await world.open()
    const reading = world.holdNextBoxRead()
    const whispering = vault.getWhisper('anthropic')
    await reading.reached
    const locking = vault.lock()
    reading.release()
    expect(await whispering).to.eq('sk-fake')
    await locking
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.getLease()).to.be.null
  })

  it("refuses a getWhisper still awaiting its hello when a lock lands as 'vault_locked'", async () => {
    const world = await seededWorld()
    const vault = await world.open()
    const whispering = vault.getWhisper('anthropic')
    await vault.lock()
    await TH.expectRefusal(whispering, 'vault_locked')
  })

  it("lands a close asked during a getWhisper's read after it: the whisper is handed back, the lease kept, and the next call refuses 'vault_closed'", async () => {
    const world = await seededWorld()
    const vault = await world.open()
    const reading = world.holdNextBoxRead()
    const whispering = vault.getWhisper('anthropic')
    await reading.reached
    vault.close()
    reading.release()
    expect(await whispering).to.eq('sk-fake')
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'vault_closed')
    expect(await world.getLease()).to.not.be.null
  })
})
// --

// == [Unlocks and changes]: a lock, a del, a close or a ring asked while an unlock or a change is at its work

describe("turns, around an unlock or a change to the ways in", () => {
  it("runs a ring heard during an unlock after it: the unlock unlocks, and the ring's read finds the vault deleted elsewhere, and locks", async () => {
    const world = await seededWorld()
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    const vault = await world.open()
    await vault.lock()
    const deriving = world.holdNextDerive()
    const unlocking = vault.unlock('pw')
    await deriving.reached
    await there.del()
    deriving.release()
    await unlocking
    await vi.waitFor(() => { expect(vault.getSnapshot().state).to.eq('absent') })
    expect(await world.getLease()).to.be.null
  })

  it("lands a del() asked during an unlock after it: the unlock unlocks, then the vault is deleted, no lease left", async () => {
    const world = await seededWorld()
    const vault = await world.open()
    await vault.lock()
    const deriving = world.holdNextDerive()
    const unlocking = vault.unlock('pw')
    await deriving.reached
    const deleting = vault.del()
    deriving.release()
    await unlocking
    await deleting
    expect(vault.getSnapshot().state).to.eq('absent')
    expect(world.dbStore.ckeys()).to.have.lengthOf(0)
    expect(await world.getLease()).to.be.null
  })

  it("lands a lock asked during putWayin() after it: the passphrase changes, and the vault is locked", async () => {
    const world = await seededWorld()
    const vault = await world.open()
    const deriving = world.holdNextDerive()
    const changing = vault.putWayin('pw', 'pw two')
    await deriving.reached
    const locking = vault.lock()
    deriving.release()
    await changing
    await locking
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.getLease()).to.be.null
    await TH.expectRefusal(vault.unlock('pw'), 'wrong_passphrase')
    await vault.unlock('pw two')
    expect(await vault.getWhisper('anthropic')).to.eq('sk-fake')
  })

  it("lands a close asked during an unlock after it: the unlock writes its lease, which the next Vault object takes up", async () => {
    const world = await seededWorld()
    const vault = await world.open()
    await vault.lock()
    const writing = world.holdNextLease()
    const unlocking = vault.unlock('pw')
    await writing.reached
    vault.close()
    writing.release()
    await unlocking
    expect(await world.stateOnOpen()).to.eq('unlocked')
  })
})
// --

// == [The expiry]: the expiry's turn, queued while a call is at its work

describe("turns, around the expiry", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }) })
  afterEach(() => { vi.useRealTimers() })

  it("refuses a getWhisper whose read outlasts the lease as 'vault_locked': its check of the lease, once the box is read, finds it ended", async () => {
    vi.setSystemTime(Date.parse('2026-10-14T12:00:00Z'))
    const world = makeRacingWorld({ clock: { now: () => Date.now() }, leaseHours: 1 })
    const deaf = world.deafVaultDB()
    const vault = await world.openUnlocked('pw', { vaultDB: deaf })
    await vault.putBox('anthropic', 'sk-fake')
    const reading = TH.holdNextCall(deaf, 'getBox')
    const whispering = vault.getWhisper('anthropic')
    await reading.reached
    await vi.advanceTimersByTimeAsync(HourMillis)
    reading.release()
    await TH.expectRefusal(whispering, 'vault_locked')
    expect(vault.getSnapshot().state).to.eq('locked')
  })
})
// --
