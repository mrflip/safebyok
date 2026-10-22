import { describe, it, expect, vi } from 'vitest'
import type { Stamp } from '../../src/types'
import { memoryDeviceDB } from '../../src/device-db'
import { Vault } from '../../src/vault'
import type { Ask } from '../../src/ask'
import * as TH from '../test-helpers'
import { makeWorld, makeRacingWorld, boxlabelsOf, storedRowOf, u1BoxCkey } from './world'

/** The stamp of a vault that holds one: a test that reaches for it on a vault holding none has gone wrong. */
const stampOf = (vault: Vault): Stamp => {
  const { stamp } = vault
  if (stamp === null) { throw new Error('This vault holds no vault, so it has no stamp.') }
  return stamp
}

// == [The stamp]: vault.stamp

describe("vault.stamp", () => {
  it("is null while the vault holds no vault: before a read, and while none is made", async () => {
    const world = makeWorld()
    const vault = Vault.make(world.optsWith())
    expect(vault.stamp).to.be.null
    await vault.hello()
    expect(vault.stamp).to.be.null
  })

  it("is the scope, and the vault_tok, vault_epoch and gate_epoch of the vault held, frozen", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    expect(vault.stamp).to.deep.equal({ ...TH.scopeOf('u1'), vault_tok: vault.vault_tok, vault_epoch: 1, gate_epoch: 1 })
    expect(Object.isFrozen(vault.stamp)).to.be.true
  })

  it("moves up by one on every change to the ways in, as its example shows", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const before = vault.stamp?.gate_epoch ?? 0
    await vault.putWayin('pw', 'pw two')
    expect(vault.stamp?.gate_epoch).to.eq(before + 1)
    expect(vault.stamp?.vault_epoch).to.eq(2)
  })
})
// --

// == [The demand]: vault.demandConsistentWith, vault.isConsistentWith

describe("vault.demandConsistentWith", () => {
  it("passes a box the vault handed out while the vault stands, as its first example shows", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const box = await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    expect(() => { vault.demandConsistentWith(box) }).to.not.throw()
    expect(() => { vault.demandConsistentWith(box, { leaseBound: true }) }).to.not.throw()
  })

  it("refuses a box from before the vault was deleted as 'vault_gone', as its first example shows", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const box = await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    await vault.del()
    TH.expectSyncRefusal(() => { vault.demandConsistentWith(box) }, 'vault_gone')
  })

  it("refuses a box from before the vault was deleted and made anew elsewhere as 'vault_remade', as its first example shows", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { vaultDB: world.deafVaultDB() })
    const box = await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    await there.del()
    await there.unlock('pw two')
    await vault.hello({ staleMinutes: 0 })
    TH.expectSyncRefusal(() => { vault.demandConsistentWith(box) }, 'vault_remade')
  })

  it("refuses a box once a lock lands, when lease-bound, as 'vault_locked', as its second example shows", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const box = await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    await vault.lock()
    expect(() => { vault.demandConsistentWith(box) }).to.not.throw()
    TH.expectSyncRefusal(() => { vault.demandConsistentWith(box, { leaseBound: true }) }, 'vault_locked')
  })

  it("drops a lease it finds ended, as the expiry would, when lease-bound", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { leaseHours: 1 })
    const stamp = stampOf(vault)
    world.advance(60 * 60 * 1000)
    expect(vault.state).to.eq('unlocked')
    TH.expectSyncRefusal(() => { vault.demandConsistentWith(stamp, { leaseBound: true }) }, 'vault_locked')
    expect(vault.state).to.eq('locked')
  })

  it("refuses a stamp of another gate_epoch as 'gate_moved', as its third example shows", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const stamp = stampOf(vault)
    TH.expectSyncRefusal(() => { vault.demandConsistentWith({ ...stamp, gate_epoch: 0 }) }, 'gate_moved')
    TH.expectSyncRefusal(() => { vault.demandConsistentWith({ ...stamp, gate_epoch: stamp.gate_epoch + 1 }) }, 'gate_moved')
  })

  it("takes a vault_epoch at or below the vault's, and refuses one past it as 'gate_moved'", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putWayin('pw', 'pw two')
    const stamp = stampOf(vault)
    expect(() => { vault.demandConsistentWith({ vault_tok: stamp.vault_tok, vault_epoch: stamp.vault_epoch - 1 }) }).to.not.throw()
    expect(() => { vault.demandConsistentWith({ vault_tok: stamp.vault_tok, vault_epoch: stamp.vault_epoch }) }).to.not.throw()
    TH.expectSyncRefusal(() => { vault.demandConsistentWith({ vault_tok: stamp.vault_tok, vault_epoch: stamp.vault_epoch + 1 }) }, 'gate_moved')
  })

  it("refuses a thing of another scope as 'vault_remade', whatever its vault_tok", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const stamp = stampOf(vault)
    TH.expectSyncRefusal(() => { vault.demandConsistentWith({ ...stamp, user_id: 'u2' }) }, 'vault_remade')
  })

  it("refuses 'vault_closed' after close()", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const stamp = stampOf(vault)
    vault.close()
    TH.expectSyncRefusal(() => { vault.demandConsistentWith(stamp) }, 'vault_closed')
  })

  it("refuses a thing carrying no vault_tok, or an option it does not take, as 'bad_option', quoting none of it", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const stamp = stampOf(vault)
    const sloppy: unknown[] = [null, 'a vault_tok', 42, { gate_epoch: 1 }, { vault_tok: 7 }, { vault_tok: stamp.vault_tok, gate_epoch: 'one' }]
    for (const thing of sloppy) {
      const err = TH.expectSyncRefusal(() => { vault.demandConsistentWith(thing as never) }, 'bad_option')
      expect(err.message).to.not.include('a vault_tok')
    }
    TH.expectSyncRefusal(() => { vault.demandConsistentWith(stamp, { leasebound: true } as never) }, 'bad_option')
  })

  it("tells the logger the kind and the call it refused, never the thing's fields", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const stamp = stampOf(vault)
    TH.expectSyncRefusal(() => { vault.demandConsistentWith({ ...stamp, gate_epoch: 0 }) }, 'gate_moved')
    expect(world.logged).to.have.lengthOf(1)
    expect(world.logged[0]).to.deep.include({ level: 'log', story: { call: 'demandConsistentWith', refusalkind: 'gate_moved' } })
    expect(TH.loggedText(world.logged)).to.not.include(stamp.vault_tok)
  })

})

describe("vault.isConsistentWith", () => {
  it("answers the demand's question without refusing: true while the thing stands, false once the vault moved on", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const stamp = stampOf(vault)
    expect(vault.isConsistentWith(stamp)).to.be.true
    expect(vault.isConsistentWith({ ...stamp, gate_epoch: 0 })).to.be.false
    expect(vault.isConsistentWith({ ...stamp, vault_tok: 'vault-tok-other' })).to.be.false
    expect(world.logged).to.have.lengthOf(0)
  })

  it("reads a box again once the vault moved on, as its example shows", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { vaultDB: world.deafVaultDB() })
    let box = await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    await vault.putWayin('pw', 'pw two')
    expect(vault.isConsistentWith(box)).to.be.false
    const read = await vault.getBox(box.boxlabel)
    if (read === null) { throw new Error('expected the box') }
    box = read
    expect(vault.isConsistentWith(box)).to.be.true
  })

  it("asks for a lease in hand that has not ended when lease-bound, dropping none it finds ended", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { leaseHours: 1 })
    const stamp = stampOf(vault)
    expect(vault.isConsistentWith(stamp, { leaseBound: true })).to.be.true
    world.advance(60 * 60 * 1000)
    expect(vault.isConsistentWith(stamp, { leaseBound: true })).to.be.false
    expect(vault.isConsistentWith(stamp)).to.be.true
    expect(vault.lease).to.not.be.null
  })

  it("throws 'bad_option' for a thing with no vault_tok, or an option it does not take", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    TH.expectSyncRefusal(() => vault.isConsistentWith({} as never), 'bad_option')
    TH.expectSyncRefusal(() => vault.isConsistentWith(stampOf(vault), { leasebound: true } as never), 'bad_option')
  })
})
// --

// == [Refresh]: vault.refresh, the joined read, the refresh's judgment

describe("vault.refresh", () => {
  it("reads storage now, whatever was read a moment ago, as its example shows", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { vaultDB: world.deafVaultDB() })
    const there = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
    await there.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    expect(boxlabelsOf(vault)).to.deep.equal([])
    await vault.refresh()
    expect(boxlabelsOf(vault)).to.deep.equal(['anthropic'])
  })

  it("shares a read under way: a hello or refresh asked for meanwhile, at any staleness, starts none of its own", async () => {
    const world = makeWorld()
    const deaf = world.deafVaultDB()
    const vault = await world.openUnlocked('pw', { vaultDB: deaf })
    const held = TH.holdNextAnswer(deaf, 'getVault')
    const reads = vi.spyOn(deaf, 'getVault')
    const first = vault.refresh()
    await held.reached
    const others = [vault.refresh(), vault.hello({ staleMinutes: 0 }), vault.hello()]
    held.release()
    await Promise.all([first, ...others])
    expect(reads).toHaveBeenCalledTimes(1)
  })

  it("refuses as hello() does: 'vault_closed' after close(), in its try form too", async () => {
    const world = makeWorld()
    const vault = await world.open()
    vault.close()
    await TH.expectRefusal(vault.refresh(), 'vault_closed')
    await TH.expectBad(vault.tryRefresh(), 'vault_closed')
  })
})

describe("the refresh's judgment", () => {
  it("ignores a late read of this tab's own write, setting nothing and throwing nothing", async () => {
    const world = makeWorld()
    const deaf = world.deafVaultDB()
    const vault = await world.openUnlocked('pw', { vaultDB: deaf })
    // A read starts as the change is about to write: storage serves it before the change lands,
    // and its answer is held until after.
    const reading: { served?: ReturnType<typeof TH.makeGate>, done?: Promise<Vault> } = {}
    TH.beforeNextCall(deaf, 'putVaultProps', async () => {
      reading.served = TH.holdNextAnswer(deaf, 'getVault')
      reading.done = vault.hello({ staleMinutes: 0 })
      await reading.served.reached
    })
    await vault.putWayin('pw', 'pw two')
    expect(vault.gate_epoch).to.eq(2)
    reading.served?.release()
    await reading.done
    expect(vault.gate_epoch).to.eq(2)
    expect(vault.state).to.eq('unlocked')
    expect(world.logged).to.have.lengthOf(0)
  })

  it("drops the lease from memory when this device's store no longer holds it: a lock in another tab lands here", async () => {
    const world = makeWorld()
    const thisTab = await world.openUnlocked('pw', { vaultDB: world.deafVaultDB() })
    const otherTab = await world.open()
    expect(otherTab.state).to.eq('unlocked')
    await otherTab.lock()
    expect(thisTab.state).to.eq('unlocked')
    await thisTab.refresh()
    expect(thisTab.state).to.eq('locked')
  })

  it("keeps a lease granted after a read began, though that read found none in this device's store", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { vaultDB: world.deafVaultDB() })
    await vault.lock()
    // A read begins as the unlock is about to write its lease, and finds none; it is answered after.
    const reading: { answered?: ReturnType<typeof TH.makeGate>, done?: Promise<Vault> } = {}
    TH.beforeNextCall(world.deviceDB, 'putLease', async () => {
      reading.answered = TH.holdNextAnswer(world.deviceDB, 'getLease')
      reading.done = vault.refresh()
      await reading.answered.reached
      world.advance(1)
    })
    await vault.unlock('pw')
    reading.answered?.release()
    await reading.done
    expect(vault.state).to.eq('unlocked')
  })

  it("drops the lease from memory, erasing nothing, when the ways in changed elsewhere", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { vaultDB: world.deafVaultDB() })
    const there = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
    await there.putWayin('pw', 'pw two')
    await vault.refresh()
    expect(vault.state).to.eq('locked')
    const kept = await world.getLease()
    expect(kept?.gate_epoch).to.eq(1)
  })

  it("drops the lease from memory, erasing nothing, when the vault was deleted and made anew elsewhere: the old life's lease is never taken up", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { vaultDB: world.deafVaultDB() })
    const formerTok = vault.vault_tok
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    await there.del()
    await there.unlock('pw two')
    await vault.refresh()
    expect(vault.vault_tok).to.not.eq(formerTok)
    expect(vault.state).to.eq('locked')
    const kept = await world.getLease()
    expect(kept?.vault_tok).to.eq(formerTok)
    await TH.expectRefusal(vault.ensureLease(), 'vault_locked')
  })

  it("takes no lease up: another tab's unlock shows here at the next ensureLease, without a prompt", async () => {
    const world = makeWorld()
    const maker = await world.openUnlocked('pw')
    await maker.lock()
    const getProof = vi.fn()
    const thisTab = await world.open({ getProof })
    const otherTab = await world.open()
    await otherTab.unlock('pw')
    await thisTab.refresh()
    expect(thisTab.state).to.eq('locked')
    await thisTab.ensureLease()
    expect(thisTab.state).to.eq('unlocked')
    expect(getProof).not.toHaveBeenCalled()
  })
})
// --

// == [Lock]: lock's order, and a lock landing during a box call

describe("vault.lock, at once", () => {
  it("has the vault locked, its listeners told, before it returns: only the erase is awaited", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const heard: string[] = []
    vault.subscribe(() => { heard.push(vault.getSnapshot().state) })
    const erasing = TH.holdNextCall(world.deviceDB, 'delLease')
    const locking = vault.lock()
    expect(vault.state).to.eq('locked')
    expect(vault.askPassphraseAt).to.be.null
    expect(heard).to.deep.equal(['locked'])
    await erasing.reached
    expect(await world.getLease()).to.not.be.null
    erasing.release()
    await locking
    expect(await world.getLease()).to.be.null
  })

  it("lands on the prompt up before it returns: lockLanded settles, and every caller waiting refuses 'vault_locked'", async () => {
    const world = makeWorld()
    const maker = await world.openUnlocked('pw')
    await maker.lock()
    const seen: { ask: Ask | null, landed: boolean } = { ask: null, landed: false }
    const vault = await world.open({ getProof: (ask) => {
      seen.ask = ask
      void ask.lockLanded.then(() => { seen.landed = true })
      return new Promise(() => { /* the user never answers */ })
    } })
    const waiting = vault.tryEnsureLease()
    await TH.eventually(() => seen.ask !== null)
    const locking = vault.lock()
    await TH.expectBad(waiting, 'vault_locked')
    expect(seen.landed).to.be.true
    await locking
  })
})

describe("a lock landing during a box call", () => {
  it("refuses a putBox() 'vault_locked' when it lands while the box is read, writing nothing", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const row = storedRowOf(world, 'anthropic')
    const reading = world.holdNextBoxRead()
    const putting = vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake-two')
    await reading.reached
    await vault.lock()
    reading.release()
    await TH.expectRefusal(putting, 'vault_locked')
    expect(storedRowOf(world, 'anthropic')).to.deep.equal(row)
  })

  it("refuses a putBox() 'vault_locked' when a lock comes while the whisper is sealed, writing nothing: the lease demands itself after its seal", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw')
    const sealing = TH.holdNextCall(crypto.subtle, 'encrypt')
    const putting = vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    await sealing.reached
    await vault.lock()
    sealing.release()
    await TH.expectRefusal(putting, 'vault_locked')
    expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.be.null
    expect(boxlabelsOf(vault)).to.deep.equal([])
  })

  it("lands a putBox() when it comes while the box is written, and lists what was stored", async () => {
    const world = makeRacingWorld()
    const deaf = world.deafVaultDB()
    const vault = await world.openUnlocked('pw', { vaultDB: deaf })
    const writing = TH.holdNextAnswer(deaf, 'putBox')
    const putting = vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    await writing.reached
    await vault.lock()
    writing.release()
    await putting
    expect(boxlabelsOf(vault)).to.deep.equal(['anthropic'])
  })

  it("lands a delBox() when it comes while the box is deleted, and drops it from the listing", async () => {
    const world = makeRacingWorld()
    const deaf = world.deafVaultDB()
    const vault = await world.openUnlocked('pw', { vaultDB: deaf })
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const deleting = TH.holdNextAnswer(deaf, 'delBox')
    const removing = vault.delBox('anthropic')
    await deleting.reached
    await vault.lock()
    deleting.release()
    await removing
    expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.be.null
    expect(boxlabelsOf(vault)).to.deep.equal([])
  })
})
// --
