import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { MinuteMillis } from '../../src/types'
import { VaultError } from '../../src/errors'
import type { Vault } from '../../src/vault'
import { memoryDeviceDB } from '../../src/device-db'
import { localVaultDB } from '../../src/local-vault-db'
import { bad, good } from '../../src/outcome'
import * as TH from '../test-helpers'
import { makeRacingWorld, makeWorld, boxlabelsOf, storedWayinOf, storedVaultPropsOf, storedRowOf, u1BoxCkey, u1VaultPropsCkey, addLaptopPasskey } from './world'


// == [Lock against unlock and read]: a lock that lands while an unlock, read in flight

describe("a lock that lands while an unlock or a change is under way", () => {
  it("a del() that lands mid-unlock leaves nothing unlocked: the vault is gone", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.putBox('anthropic', 'sk-fake')
    await vault.lock()
    const gate = world.holdNextDerive()
    const unlocking = TH.expectRefusal(vault.unlock('pw one'), 'vault_locked')
    await gate.reached
    await vault.del()
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.eq('absent')
    expect(world.dbStore.ckeys()).to.have.lengthOf(0)
    expect(await world.getLease()).to.be.null
  })

  it("a del() that lands while an unlock's lease is written leaves no lease: the unlock erases the one it wrote", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.lock()
    const gate = world.holdNextLease()
    const unlocking = TH.expectRefusal(vault.unlock('pw one'), 'vault_locked')
    await gate.reached
    await vault.del()
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.eq('absent')
    expect(await world.getLease()).to.be.null
  })

  it("a del() that lands while putWayin()'s lease is written leaves no lease: the change erases the one it wrote", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    const gate = world.holdNextLease()
    const changing = vault.putWayin('pw one', 'pw two')
    await gate.reached
    await vault.del()
    gate.release()
    await changing
    expect(vault.getSnapshot().state).to.eq('absent')
    expect(await world.getLease()).to.be.null
  })

  it("during putWayin(): the passphrase still changes", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('old passphrase')
    await vault.putBox('anthropic', 'sk-fake')
    const gate = world.holdNextDerive()
    const changing = vault.putWayin('old passphrase', 'new passphrase')
    await gate.reached
    await vault.lock()
    gate.release()
    await changing

    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.expectRefusal(fresh.unlock('old passphrase'), 'wrong_passphrase')
    await fresh.unlock('new passphrase')
    expect(await fresh.getWhisper('anthropic')).to.eq('sk-fake')
  })

})

describe("a read in flight when a lock lands", () => {
  afterEach(() => { vi.restoreAllMocks() })

  it("refuses as locked when lock() lands while storage is read, handing back nothing", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.putBox('anthropic', 'sk-fake')
    const gate = world.holdNextBoxRead()
    const reading = TH.expectRefusal(vault.getWhisper('anthropic'), 'vault_locked')
    await gate.reached
    await vault.lock()
    gate.release()
    await reading
  })

  it("refuses as locked when lock() lands while the whisper is deciphered, its callback never called", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.putBox('anthropic', 'sk-fake')
    const gate = TH.holdNextCall(crypto.subtle, 'decrypt')
    const callback = vi.fn()
    const using = TH.expectRefusal(vault.useWhisper('anthropic', callback), 'vault_locked')
    await gate.reached
    await vault.lock()
    gate.release()
    await using
    expect(callback).not.toHaveBeenCalled()
  })

  it("refuses as closed when close() lands while storage is read, handing back nothing", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.putBox('anthropic', 'sk-fake')
    const gate = world.holdNextBoxRead()
    const reading = TH.expectRefusal(vault.getWhisper('anthropic'), 'vault_closed')
    await gate.reached
    vault.close()
    gate.release()
    await reading
  })

  it("refuses as closed when close() lands while the whisper is deciphered, its callback never called", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.putBox('anthropic', 'sk-fake')
    const gate = TH.holdNextCall(crypto.subtle, 'decrypt')
    const callback = vi.fn()
    const using = TH.expectRefusal(vault.useWhisper('anthropic', callback), 'vault_closed')
    await gate.reached
    vault.close()
    gate.release()
    await using
    expect(callback).not.toHaveBeenCalled()
  })

  it("refuses as locked when a refresh finds the passphrase changed elsewhere while storage is read: the key it held is outlived", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.putBox('anthropic', 'sk-fake')
    const there = await world.openUnlocked('pw one', { deviceDB: memoryDeviceDB() })
    const gate = world.holdNextBoxRead()
    const reading = TH.expectRefusal(vault.getWhisper('anthropic'), 'vault_locked')
    await gate.reached
    await there.putWayin('pw one', 'pw two')
    // Let this handle's background refresh, rung by the write above, find its key outlived.
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot().state).to.eq('locked')
    gate.release()
    await reading
  })

  const ReadsOfABox = [
    ['getWhisper', (vault: Vault) => vault.getWhisper('anthropic'),              'a read'],
    ['putBox', (vault: Vault) => vault.putBox('anthropic', 'sk-fake-2'), 'a store'],
  ] as const

  for (const [verb, calling, blurb] of ReadsOfABox) {
    it(`refuses ${blurb} as locked, never absent, when a refresh finds the vault deleted elsewhere while storage reads the box (${verb})`, async () => {
      const world = makeRacingWorld()
      const vault = await world.openUnlocked('pw one')
      await vault.putBox('anthropic', 'sk-fake')
      const there = await world.openUnlocked('pw one', { deviceDB: memoryDeviceDB() })
      const getBox = world.vaultDB.getBox.bind(world.vaultDB)
      // Storage answers with the box, but only once the vault is gone and this handle has heard.
      vi.spyOn(world.vaultDB, 'getBox').mockImplementationOnce(async (...args) => {
        const answer = await getBox(...args)
        await there.del()
        await TH.wakeupAtNextTick()
        return answer
      })
      await TH.expectRefusal(calling(vault), 'vault_locked')
      expect(vault.getSnapshot().state).to.eq('absent')
    })
  }

  it("refuses as locked when a refresh finds the vault deleted elsewhere while the whisper is deciphered", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.putBox('anthropic', 'sk-fake')
    const there = await world.openUnlocked('pw one', { deviceDB: memoryDeviceDB() })
    const gate = TH.holdNextCall(crypto.subtle, 'decrypt')
    const callback = vi.fn()
    const using = TH.expectRefusal(vault.useWhisper('anthropic', callback), 'vault_locked')
    await gate.reached
    await there.del()
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot().state).to.eq('absent')
    gate.release()
    await using
    expect(callback).not.toHaveBeenCalled()
  })
})
// --

// == [Creation and moved vaults]: raceLostToPwOne, first unlock loses race, vault moves elsewhere, other handle

/**
 * Device B, open on an absent vault, and device A, another device on the same storage. A makes
 * the vault with 'pw one' (and stores a box) inside B's first unlock, between B's
 * look at storage and B's write. B hears no bell from storage, so that only its own catch-up can
 * bring A's vault in.
 */
const raceLostToPwOne = async () => {
  const world = makeWorld()
  const deafDB = world.deafVaultDB()
  const there = await world.open({ vaultDB: deafDB })
  const here = await world.open({ deviceDB: memoryDeviceDB() })
  TH.beforeNextCall(deafDB, 'ensureVaultProps', async () => {
    await here.unlock('pw one')
    await here.putBox('anthropic', 'sk-ant-fake-theirs')
  })
  return { world, deafDB, there, here }
}

describe("a first unlock that loses the race to create the vault", () => {
  it("refuses as created_elsewhere when the passphrase does not open the vault the other device made, as unlock's example shows", async () => {
    const { there } = await raceLostToPwOne()
    const err = await TH.expectRefusal(there.unlock('pw two'), 'created_elsewhere')
    expect(err.message).to.match(/^A vault was just created for this label on another device, with a different passphrase/)
    expect(err.message).to.include('Enter the passphrase you chose there')
    expect(err.message).to.not.include('pw')
    expect(err.cause).to.have.property('refusalkind', 'wrong_passphrase')
  })

  it("settles locked on the standing vault, caught up with its boxes, and unlocks it with the passphrase chosen there", async () => {
    const { world, there } = await raceLostToPwOne()
    await TH.expectRefusal(there.unlock('pw two'), 'created_elsewhere')
    const snapshot = there.getSnapshot()
    expect(snapshot.state).to.eq('locked')
    expect(snapshot.syncing).to.be.true
    expect(snapshot.passphrase?.device_id).to.eq(storedWayinOf(world, 'passphrase')?.['device_id'])
    expect(snapshot.passkey).to.be.null
    expect(boxlabelsOf(there)).to.deep.equal(['anthropic'])
    expect(await world.getLease()).to.be.null
    await there.unlock('pw one')
    expect(await there.getWhisper('anthropic')).to.eq('sk-ant-fake-theirs')
  })

  it("tells a second wrong passphrase as wrong_passphrase: the vault now stands, and created_elsewhere is only for the first unlock", async () => {
    const { there } = await raceLostToPwOne()
    await TH.expectRefusal(there.unlock('pw two'), 'created_elsewhere')
    await TH.expectRefusal(there.unlock('pw three'), 'wrong_passphrase')
  })

  it("unlocks the vault the other device made when the passphrase opens it: no refusal at all", async () => {
    const { world, there, here } = await raceLostToPwOne()
    await there.unlock('pw one')
    expect(there.getSnapshot().state).to.eq('unlocked')
    expect(there.getSnapshot().passphrase?.device_id).to.eq(storedWayinOf(world, 'passphrase')?.['device_id'])
    expect(storedWayinOf(world, 'passkey')).to.be.null
    expect(await there.getWhisper('anthropic')).to.eq('sk-ant-fake-theirs')
    expect(here.getSnapshot().state).to.eq('unlocked')
  })

  it("is still created_elsewhere when the catch-up after it fails, the snapshot saying it is not syncing, and the failure warned of", async () => {
    const { world, deafDB, there } = await raceLostToPwOne()
    vi.spyOn(deafDB, 'listBoxes').mockResolvedValueOnce(bad(new VaultError('storage_unavailable', 'The vault storage could not be reached.')))
    await TH.expectRefusal(there.unlock('pw two'), 'created_elsewhere')
    expect(there.getSnapshot().state).to.eq('locked')
    expect(there.getSnapshot().syncing).to.be.false
    expect(world.logged.map((call) => call.level)).to.include('warn')
  })

  it("is plain wrong_passphrase when the other device's vault was in storage before this unlock looked: the look finds it", async () => {
    const world = makeWorld()
    const there = await world.open()
    const here = await world.open({ deviceDB: memoryDeviceDB() })
    await here.unlock('pw one')
    await TH.expectRefusal(there.unlock('pw two'), 'wrong_passphrase')
    expect(there.getSnapshot().state).to.eq('locked')
  })
})

describe("a vault that moves elsewhere while an unlock is under way", () => {
  it("deleted and made anew: the unlock takes up nothing, throws 'vault_locked', and can't seal into the new vault", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.lock()
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    const gate = world.holdNextDerive()
    const unlocking = TH.expectRefusal(vault.unlock('pw one'), 'vault_locked')
    await gate.reached
    await there.del()
    await there.unlock('pw two')
    await there.putBox('anthropic', 'sk-ant-fake-new')
    // Let this handle's background refresh, rung by the writes above, bring in the new vault.
    await TH.wakeupAtNextTick()
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.getLease()).to.be.null
    await TH.expectRefusal(vault.putBox('anthropic', 'sk-ant-fake-stale'), 'vault_locked')
    expect(await there.getWhisper('anthropic')).to.eq('sk-ant-fake-new')
    await vault.unlock('pw two')
    expect(await vault.getWhisper('anthropic')).to.eq('sk-ant-fake-new')
  })

  it("deleted and not remade: the unlock takes up nothing, and the vault reads as absent", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.lock()
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    const gate = world.holdNextDerive()
    const unlocking = TH.expectRefusal(vault.unlock('pw one'), 'vault_locked')
    await gate.reached
    await there.del()
    await TH.wakeupAtNextTick()
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.eq('absent')
    expect(await world.getLease()).to.be.null
  })

  it("its passphrase changed: the old passphrase, proven a moment too late, unlocks nothing", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.lock()
    const there = await world.openUnlocked('pw one', { deviceDB: memoryDeviceDB() })
    const gate = world.holdNextDerive()
    const unlocking = TH.expectRefusal(vault.unlock('pw one'), 'vault_locked')
    await gate.reached
    await there.putWayin('pw one', 'pw two')
    await TH.wakeupAtNextTick()
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.getLease()).to.be.null
    await vault.unlock('pw two')
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("a refresh that brings back the same vault props, unchanged, does not defeat the unlock", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.lock()
    const there = await world.openUnlocked('pw one', { deviceDB: memoryDeviceDB() })
    const gate = world.holdNextDerive()
    const unlocking = vault.unlock('pw one')
    await gate.reached
    await there.putBox('anthropic', 'sk-ant-fake')
    await TH.wakeupAtNextTick()
    gate.release()
    await unlocking
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(await vault.getWhisper('anthropic')).to.eq('sk-ant-fake')
  })
})

/**
 * A world whose first unlock's make, once begun, is held as it notes the vault it wrote in this
 * device's mark: storage holds that vault, and the unlock has yet to take it up. Its vault hears no
 * change bells, so only the test's own hellos read; `there` is another device.
 */
const makingWorld = async () => {
  const world = makeWorld()
  const vault = await world.open({ vaultDB: world.deafVaultDB() })
  const there = await world.open({ deviceDB: memoryDeviceDB() })
  const noting = TH.holdNextCall(world.deviceDB, 'putMark')
  return { world, vault, there, noting }
}

describe("a first unlock's make, and a read that finds the vault gone while it is under way", () => {
  it("deleted elsewhere once a read took it up: the make stands down, nothing unlocked and no lease left, the vault absent", async () => {
    const { world, vault, there, noting } = await makingWorld()
    const unlocking = TH.expectRefusal(vault.unlock('pw'), 'vault_locked')
    await noting.reached
    await vault.hello({ staleMinutes: 0 })
    expect(vault.vault_id).to.not.be.null
    await there.del()
    await vault.hello({ staleMinutes: 0 })
    expect(vault.state).to.eq('absent')
    noting.release()
    await unlocking
    expect(vault.state).to.eq('absent')
    expect(vault.vault_id).to.be.null
    expect(await world.getLease()).to.be.null
    // The next unlock makes the vault anew.
    await vault.unlock('pw')
    expect(vault.state).to.eq('unlocked')
  })

  it("taken up by a read meanwhile, and still standing: the make is not stood down, and unlocks", async () => {
    const { world, vault, noting } = await makingWorld()
    const unlocking = vault.unlock('pw')
    await noting.reached
    await vault.hello({ staleMinutes: 0 })
    noting.release()
    await unlocking
    expect(vault.state).to.eq('unlocked')
    expect(await world.getLease()).to.not.be.null
  })
})

describe("a read that began before this device's own change to the ways in landed", () => {
  it("never puts the older vault props it read back over the change's: the vault stays unlocked under the new ways in", async () => {
    const world = makeWorld()
    const deaf = world.deafVaultDB()
    const vault = await world.openUnlocked('pw', { vaultDB: deaf })
    let listing: ReturnType<typeof TH.makeGate> | undefined
    let reading: Promise<Vault> | undefined
    // The read starts as the change is about to write, and is held at its listing, the vault props
    // it read the older copy, while the change lands.
    TH.beforeNextCall(deaf, 'putVaultProps', async () => {
      listing = TH.holdNextCall(deaf, 'listBoxes')
      reading = vault.hello({ staleMinutes: 0 })
      await listing.reached
    })
    await addLaptopPasskey(vault)
    expect(vault.unlock_epoch).to.eq(2)
    listing?.release()
    await reading
    expect(vault.unlock_epoch).to.eq(2)
    expect(vault.passkey).to.not.be.null
    expect(vault.state).to.eq('unlocked')
    await vault.hello({ staleMinutes: 0 })
    expect(vault.state).to.eq('unlocked')
    expect(await world.getLease()).to.not.be.null
  })
})

describe("a lock in another handle on this device", () => {
  it("leaves an unlock begun after it alone", async () => {
    const world = makeRacingWorld()
    const otherTab = await world.openUnlocked('pw one')
    const thisTab = await world.open()
    await otherTab.lock()
    await thisTab.unlock('pw one')
    expect(thisTab.getSnapshot().state).to.eq('unlocked')
    expect(await world.stateOnOpen()).to.eq('unlocked')
  })
})

// --

// == [Close and reborn vaults]: close, rebornWorld, stale session, rebornUnheard

describe("close", () => {
  it("a closed handle refuses everything thereafter", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    vault.close()
    await TH.expectRefusal(vault.getWhisper('anything'), 'vault_closed')
    await TH.expectRefusal(vault.unlock('pw'), 'vault_closed')
  })

  it("an unlock under way when the handle closes takes nothing up, is granted no lease, and throws 'vault_closed'", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw')
    await vault.lock()
    const gate = world.holdNextDerive()
    const unlocking = TH.expectRefusal(vault.unlock('pw'), 'vault_closed')
    await gate.reached
    vault.close()
    gate.release()
    await unlocking
    expect(await world.getLease()).to.be.null
    expect(await world.stateOnOpen()).to.eq('locked')
  })

  it("a close during the unlock's device record write erases nothing: close is not a lock, and the next open picks the record up", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw')
    await vault.lock()
    const gate = world.holdNextLease()
    const unlocking = TH.expectRefusal(vault.unlock('pw'), 'vault_closed')
    await gate.reached
    vault.close()
    gate.release()
    await unlocking
    expect(await world.getLease()).to.not.be.null
    expect(await world.stateOnOpen()).to.eq('unlocked')
  })

  it("leaves a lease and the device mark as they stood", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const markBefore = await TH.expectGood(world.deviceDB.getMark(TH.scopeOf('u1')))
    vault.close()
    expect(await world.getLease()).to.not.be.null
    expect(await TH.expectingGood(world.deviceDB).getMark(TH.scopeOf('u1'))).to.deep.equal(markBefore)
  })

  it("a second close does nothing: the storage watch is ended once", async () => {
    const world = makeWorld()
    const unsubscribes = vi.fn()
    const subscribe = world.vaultDB.subscribe.bind(world.vaultDB)
    vi.spyOn(world.vaultDB, 'subscribe').mockImplementation((...args) => {
      const unsubscribe = subscribe(...args)
      return () => { unsubscribes(); unsubscribe() }
    })
    const vault = await world.openUnlocked('pw')
    vault.close()
    vault.close()
    expect(unsubscribes.mock.calls).to.have.lengthOf(1)
    await TH.expectRefusal(vault.getWhisper('anything'), 'vault_closed')
  })

  it("closing forgets nothing stored: the next open still finds the vault", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox('anthropic', 'sk-fake')
    vault.close()
    const again = await world.open()
    expect(again.getSnapshot().state).to.eq('unlocked')
    expect(await again.getWhisper('anthropic')).to.eq('sk-fake')
  })
})

// vaultOne's adapter hears no change bells, so it genuinely does not notice vaultTwo's doings
// until it next touches the backend: the stale-device scenario, miniaturized. The reborn vault
// has a new vault_id and its own passphrase.
const rebornWorld = async () => {
  const world = makeWorld()
  const vaultOne = await world.openUnlocked('pw one', { vaultDB: world.deafVaultDB() })
  await vaultOne.putBox('anthropic', 'sk-ant-fake-old')
  const vaultTwo = await world.open()
  await vaultTwo.del()
  await vaultTwo.unlock('pw two')
  await vaultTwo.putBox('anthropic', 'sk-ant-fake-new')
  return { world, vaultOne, vaultTwo }
}

describe("a stale session cannot reach into a vault reborn elsewhere", () => {
  it("putBox() is refused by storage as vault_mismatch, and its catch-up finds the device relocked, instead of landing in the reborn vault", async () => {
    const { vaultOne, vaultTwo } = await rebornWorld()
    expect(vaultOne.getSnapshot().state).to.eq('unlocked')
    await TH.expectRefusal(vaultOne.putBox('anthropic', 'sk-ant-fake-stale'), 'vault_locked')
    expect(vaultOne.getSnapshot().state).to.eq('locked')
    expect(await vaultTwo.getWhisper('anthropic')).to.eq('sk-ant-fake-new')
  })

  it("getWhisper() of a box the reborn vault wrote catches up once, finds the vault moved, and refuses as locked, not damaged", async () => {
    const { vaultOne } = await rebornWorld()
    expect(vaultOne.getSnapshot().state).to.eq('unlocked')
    await TH.expectRefusal(vaultOne.getWhisper('anthropic'), 'vault_locked')
    expect(vaultOne.getSnapshot().state).to.eq('locked')
  })

  it("getWhisper() of a box that will not open in a vault that has not moved catches up once, and names it damaged", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox('anthropic', 'sk-fake')
    const row = storedRowOf(world, 'anthropic')
    const wrapped = row['whisper_ciphered'] as { cipher_iv_b64: string, ciphertext_b64: string }
    world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify({ ...row, whisper_ciphered: { ...wrapped, ciphertext_b64: TH.tweakB64(wrapped.ciphertext_b64) } }))
    await TH.wakeupAtNextTick()
    const getVaultProps = vi.spyOn(world.vaultDB, 'getVaultProps')
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'damaged_box')
    expect(getVaultProps).toHaveBeenCalledTimes(1)
    expect(vault.getSnapshot().state).to.eq('unlocked')
    vi.restoreAllMocks()
  })

  it("getWhisper() whose catch-up fails throws the catch-up's own refusal: whether the box is damaged is not known", async () => {
    const world = makeWorld()
    const deafDB = world.deafVaultDB()
    const vault = await world.openUnlocked('pw', { vaultDB: deafDB })
    await vault.putBox('anthropic', 'sk-fake')
    const row = storedRowOf(world, 'anthropic')
    world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify({ ...row, revision_tok: 'tampered' }))
    const down = new VaultError('storage_unavailable', 'The vault storage could not be reached.')
    vi.spyOn(deafDB, 'getVaultProps').mockResolvedValueOnce(bad(down))
    expect(await TH.expectRefusal(vault.getWhisper('anthropic'), 'storage_unavailable')).to.eq(down)
    expect(vault.getSnapshot().syncing).to.be.false
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'damaged_box')
    expect(vault.getSnapshot().syncing).to.be.true
    vi.restoreAllMocks()
  })

  it("putBox() of a box the reborn vault has never held is refused all the same", async () => {
    const { vaultOne, vaultTwo } = await rebornWorld()
    await TH.expectRefusal(vaultOne.putBox('openai', 'sk-fake-stale'), 'vault_locked')
    expect(boxlabelsOf(vaultTwo)).to.deep.equal(['anthropic'])
  })

  it("delBox() is refused by storage as stale, and relocks: the reborn vault keeps its box", async () => {
    const { vaultOne, vaultTwo } = await rebornWorld()
    expect(vaultOne.getSnapshot().state).to.eq('unlocked')
    await TH.expectRefusal(vaultOne.delBox('anthropic'), 'stale_write')
    expect(vaultOne.getSnapshot().state).to.eq('locked')
    expect(await vaultTwo.getWhisper('anthropic')).to.eq('sk-ant-fake-new')
  })

  it("del() is refused by storage as stale: the reborn vault survives, and a second del() takes it", async () => {
    const { world, vaultOne, vaultTwo } = await rebornWorld()
    await TH.expectRefusal(vaultOne.del(), 'stale_write')
    expect(await vaultTwo.getWhisper('anthropic')).to.eq('sk-ant-fake-new')
    expect(vaultOne.getSnapshot().state).to.eq('locked')
    await vaultOne.del()
    expect(vaultOne.getSnapshot().state).to.eq('absent')
    expect(world.dbStore.ckeys()).to.have.lengthOf(0)
  })

  it("del() aims at the vault seen when it was called, not one a change bell brings in while it runs", async () => {
    const world = makeWorld()
    let meanwhile: (() => Promise<void>) | null = null
    const slowDeviceDB = {
      ...world.deviceDB,
      delLease: async (scope: Parameters<typeof world.deviceDB.delLease>[0]) => {
        const erased = await world.deviceDB.delLease(scope)
        const pending = meanwhile
        meanwhile = null
        if (pending !== null) { await pending() }
        return erased
      },
    }
    const vaultOne = await world.openUnlocked('pw one', { deviceDB: slowDeviceDB })
    const vaultTwo = await world.open({ deviceDB: memoryDeviceDB() })
    meanwhile = async () => {
      await vaultTwo.del()
      await vaultTwo.unlock('pw two')
      await vaultTwo.putBox('anthropic', 'sk-ant-fake-new')
      // Let vaultOne's background refreshes, rung by the writes above, settle on the reborn vault.
      await TH.wakeupAtNextTick()
    }
    await TH.expectRefusal(vaultOne.del(), 'stale_write')
    expect(await vaultTwo.getWhisper('anthropic')).to.eq('sk-ant-fake-new')
  })

  it("putWayin() proves against the standing vault props, never burying the reborn vault's", async () => {
    const { vaultOne, vaultTwo } = await rebornWorld()
    await TH.expectRefusal(vaultOne.putWayin('pw one', 'pw three'), 'wrong_passphrase')
    await vaultTwo.lock()
    await vaultTwo.unlock('pw two')
    expect(await vaultTwo.getWhisper('anthropic')).to.eq('sk-ant-fake-new')
  })

  it("unlock() syncs first: the reborn vault's own passphrase opens it from the stale handle", async () => {
    const { vaultOne } = await rebornWorld()
    await TH.expectRefusal(vaultOne.putBox('anthropic', 'sk-ant-fake-stale'), 'vault_locked')
    await vaultOne.unlock('pw two')
    expect(await vaultOne.getWhisper('anthropic')).to.eq('sk-ant-fake-new')
  })

  it("putBox() into a vault deleted elsewhere, and not remade, is refused and finds it absent", async () => {
    const world = makeWorld()
    const vaultOne = await world.openUnlocked('pw one', { vaultDB: world.deafVaultDB() })
    const vaultTwo = await world.open()
    await vaultTwo.del()
    await TH.expectRefusal(vaultOne.putBox('anthropic', 'sk-ant-fake-stale'), 'vault_locked')
    expect(vaultOne.getSnapshot().state).to.eq('absent')
    expect(world.dbStore.ckeys()).to.have.lengthOf(0)
  })

  it("del() of a vault deleted elsewhere, and not remade, is refused as stale; a second del() is quiet", async () => {
    const world = makeWorld()
    const vaultOne = await world.openUnlocked('pw one', { vaultDB: world.deafVaultDB() })
    const vaultTwo = await world.open()
    await vaultTwo.del()
    await TH.expectRefusal(vaultOne.del(), 'stale_write')
    expect(vaultOne.getSnapshot().state).to.eq('absent')
    await vaultOne.del()
    expect(vaultOne.getSnapshot().state).to.eq('absent')
  })
})

/**
 * A vault unlocked here, over storage that does not ring, with a box `anthropic` in it,
 * deleted and made anew through another handle (`there`), which stores its own `anthropic`:
 * this device has not heard.
 */
const rebornUnheard = async () => {
  const world = makeWorld()
  const hereDB = world.deafVaultDB()
  const here = await world.openUnlocked('pw one', { vaultDB: hereDB })
  await here.putBox('anthropic', 'sk-ant-fake-old')
  const there = await world.open({ deviceDB: memoryDeviceDB() })
  await there.del()
  await there.unlock('pw two')
  await there.putBox('anthropic', 'sk-ant-fake-new')
  return { world, hereDB, here, there }
}
// --

// == [Two devices and refreshes]: twoDeviceWorld, stillClock, delaysAsked, versioned updates, refreshes

/**
 * Two devices on one vault, and a way to slip `there`'s doings between `here`'s look at storage
 * and its write: `beforeNextWrite` runs once, inside the next call to the verb it names, before
 * the write itself reaches storage. `here` has a vaultDB of its own over the shared store, so
 * `hereDB` sees only its writes, whatever `there` does.
 */
const twoDeviceWorld = async () => {
  const world = makeWorld()
  const hereDB = localVaultDB({ store: world.dbStore })
  const here = await world.openUnlocked('shared pw', { vaultDB: hereDB })
  const there = await world.openUnlocked('shared pw', { deviceDB: memoryDeviceDB() })
  const beforeNextWrite = (verb: 'putBox' | 'putVaultProps', meanwhile: () => Promise<void>) => {
    TH.beforeNextCall(hereDB, verb, meanwhile)
  }
  return { world, hereDB, here, there, beforeNextWrite }
}

/**
 * Every timer a test sets, recorded: a store refused as stale must throw without waiting, so these
 * stand the clock still, and `waits` records each delay `setTimeout` was asked for.
 */
const stillClock = () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  return vi.spyOn(globalThis, 'setTimeout')
}

/**
 * The waits an operation asked for, in milliseconds: every timer set but those an unlock arms to
 * drop its key, which fall due a minute or more from when they are set.
 */
const delaysAsked = (waits: ReturnType<typeof stillClock>) => (
  waits.mock.calls.map(([, delay = 0]) => delay).filter((delay) => delay < MinuteMillis)
)

describe("versioned updates: two devices writing at once", () => {
  let waits: ReturnType<typeof stillClock>
  beforeEach(() => { waits = stillClock() })
  // Mocks first: restoring the setTimeout spy after the real timers would put the fake one back.
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("a store over a box written meanwhile elsewhere is refused as stale once, without waiting: nothing written, the snapshot caught up, and a second store lands over theirs", async () => {
    const world = makeWorld()
    // Deaf to storage's change bells: only the catch-up after the refusal can bring theirs in.
    const hereDB = world.deafVaultDB()
    const here = await world.openUnlocked('shared pw', { vaultDB: hereDB })
    const there = await world.openUnlocked('shared pw', { deviceDB: memoryDeviceDB() })
    await here.putBox('anthropic', 'sk-ant-fake-one', { sidecar: { note: 'first' } })
    TH.beforeNextCall(hereDB, 'putBox', () => there.putBox('anthropic', 'sk-ant-fake-theirs', { sidecar: { note: 'theirs' } }))
    const putBox = vi.spyOn(hereDB, 'putBox')
    const err = await TH.expectRefusal(here.putBox('anthropic', 'sk-ant-fake-mine'), 'stale_write')
    expect(err.message).to.match(/^That box was written or removed on another device or tab while this one was storing into it, so nothing was written\./)
    expect(err.message).to.include("call putBox() again")
    // A boxlabel is never quoted: a host's check may admit any text, a mistaken paste among it.
    expect(err.message).to.not.include('anthropic')
    expect(err.cause).to.be.an.instanceOf(VaultError).and.to.have.property('refusalkind', 'stale_write')
    expect(putBox).toHaveBeenCalledTimes(1)
    expect(delaysAsked(waits)).to.have.lengthOf(0)
    const theirRevision = storedRowOf(world, 'anthropic')['revision_tok']
    const shown = TH.summaryOf(here.getSnapshot().boxes[0])
    expect(shown).to.deep.include({ revision_tok: theirRevision, sidecar: { note: 'theirs' } })
    expect(here.getSnapshot().state).to.eq('unlocked')
    expect(await there.getWhisper('anthropic')).to.eq('sk-ant-fake-theirs')
    await here.putBox('anthropic', 'sk-ant-fake-mine')
    expect(putBox).toHaveBeenCalledTimes(2)
    expect(putBox.mock.calls[1]?.[1].revision_tok).to.eq(theirRevision)
    expect(await there.getWhisper('anthropic')).to.eq('sk-ant-fake-mine')
  })

  it("a store refused as stale carries storage's word on what won as meta.box_stored: the box, whole, as storage holds it", async () => {
    const { world, hereDB, here, there, beforeNextWrite } = await twoDeviceWorld()
    beforeNextWrite('putBox', () => there.putBox('anthropic', 'sk-ant-fake-theirs', { sidecar: { note: 'theirs' } }))
    const putBox = vi.spyOn(hereDB, 'putBox')
    const err = await TH.expectRefusal(here.putBox('anthropic', 'sk-ant-fake-mine'), 'stale_write')
    expect(putBox).toHaveBeenCalledTimes(1)
    expect(err.meta?.box_stored).to.deep.equal(storedRowOf(world, 'anthropic'))
  })

  it("a store whose box storage refuses as invalid_box is refused as bad_record: the vault sealed that box, so the fault is not the caller's input", async () => {
    const { hereDB, here } = await twoDeviceWorld()
    const refused = new VaultError('invalid_box', 'Nothing was written: that box is not one this package builds.')
    vi.spyOn(hereDB, 'putBox').mockResolvedValueOnce(bad(refused))
    const err = await TH.expectRefusal(here.putBox('anthropic', 'sk-ant-fake-mine'), 'bad_record')
    expect(err.cause).to.eq(refused)
    expect(here.getSnapshot().boxes).to.have.lengthOf(0)
  })

  it("a store whose box storage refuses as vault_mismatch, though a catch-up finds the vault as it was, is refused as stale_write, never as storage's own word", async () => {
    const { hereDB, here } = await twoDeviceWorld()
    vi.spyOn(hereDB, 'putBox').mockResolvedValueOnce(bad(new VaultError('vault_mismatch', 'The vault changed.')))
    const err = await TH.expectRefusal(here.putBox('anthropic', 'sk-ant-fake-mine'), 'stale_write')
    expect(err.message).to.match(/^The vault changed in storage while this device was storing into it, so nothing was written\./)
    expect(err.cause).to.have.property('refusalkind', 'vault_mismatch')
    expect(here.getSnapshot().state).to.eq('unlocked')
  })

  it("a store over a box deleted meanwhile elsewhere is refused as stale like any other: the box stays gone", async () => {
    const { hereDB, here, there, beforeNextWrite } = await twoDeviceWorld()
    await here.putBox('anthropic', 'sk-ant-fake-one')
    beforeNextWrite('putBox', () => there.delBox('anthropic'))
    const putBox = vi.spyOn(hereDB, 'putBox')
    await TH.expectRefusal(here.putBox('anthropic', 'sk-ant-fake-mine'), 'stale_write')
    expect(putBox).toHaveBeenCalledTimes(1)
    expect(here.getSnapshot().boxes).to.have.lengthOf(0)
    expect(here.getSnapshot().state).to.eq('unlocked')
    await TH.expectRefusal(there.getWhisper('anthropic'), 'absent_box')
  })

  it("a store of a box that did not exist, and is created meanwhile elsewhere, is refused as stale: theirs stands", async () => {
    const { hereDB, here, there, beforeNextWrite } = await twoDeviceWorld()
    beforeNextWrite('putBox', () => there.putBox('anthropic', 'sk-ant-fake-theirs'))
    const putBox = vi.spyOn(hereDB, 'putBox')
    await TH.expectRefusal(here.putBox('anthropic', 'sk-ant-fake-mine'), 'stale_write')
    expect(putBox).toHaveBeenCalledTimes(1)
    expect(boxlabelsOf(here)).to.deep.equal(['anthropic'])
    expect(await there.getWhisper('anthropic')).to.eq('sk-ant-fake-theirs')
  })

  it("a store over a damaged box, a sound one written over it meanwhile elsewhere, never deletes theirs: its write is refused as stale, and the next store writes over theirs", async () => {
    const { world, hereDB, here, there, beforeNextWrite } = await twoDeviceWorld()
    await here.putBox('anthropic', 'sk-ant-fake-one')
    world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify({ ...storedRowOf(world, 'anthropic'), written_at: 'later' }))
    await vi.waitFor(() => { expect(here.getSnapshot().boxes[0]?.damaged).to.be.true })
    const theirs = { revisionTok: '' }
    beforeNextWrite('putBox', async () => {
      await there.putBox('anthropic', 'sk-ant-fake-theirs')
      theirs.revisionTok = String(storedRowOf(world, 'anthropic')['revision_tok'])
    })
    const delBox = vi.spyOn(hereDB, 'delBox')
    const putBox = vi.spyOn(hereDB, 'putBox')
    await TH.expectRefusal(here.putBox('anthropic', 'sk-ant-fake-mine'), 'stale_write')
    expect(delBox).not.toHaveBeenCalled()
    expect(putBox).toHaveBeenCalledTimes(1)
    expect(await there.getWhisper('anthropic')).to.eq('sk-ant-fake-theirs')
    await here.putBox('anthropic', 'sk-ant-fake-mine')
    expect(putBox.mock.calls[1]?.[1].revision_tok).to.eq(theirs.revisionTok)
    expect(await there.getWhisper('anthropic')).to.eq('sk-ant-fake-mine')
  })

  it("a store over a damaged box its listing does not show yet writes over none, refused as stale, and the next store writes over the revision the catch-up lists", async () => {
    const { world, hereDB, here, there } = await twoDeviceWorld()
    await here.putBox('anthropic', 'sk-ant-fake-one')
    // A listing gone stale: storage holds a damaged record the snapshot does not show.
    const listBoxes = vi.spyOn(hereDB, 'listBoxes').mockResolvedValue(good([]))
    world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify({ ...storedRowOf(world, 'anthropic'), written_at: 'later' }))
    await vi.waitFor(() => { expect(here.getSnapshot().boxes).to.have.lengthOf(0) })
    listBoxes.mockRestore()
    const damagedRevision = storedRowOf(world, 'anthropic')['revision_tok']
    const delBox = vi.spyOn(hereDB, 'delBox')
    const putBox = vi.spyOn(hereDB, 'putBox')
    await TH.expectRefusal(here.putBox('anthropic', 'sk-ant-fake-mine'), 'stale_write')
    expect(putBox).toHaveBeenCalledTimes(1)
    expect(putBox.mock.calls[0]?.[1].revision_tok).to.be.null
    expect(here.getSnapshot().boxes[0]).to.deep.include({ damaged: true, revision_tok: damagedRevision })
    await here.putBox('anthropic', 'sk-ant-fake-mine')
    expect(delBox).not.toHaveBeenCalled()
    expect(putBox.mock.calls[1]?.[1].revision_tok).to.eq(damagedRevision)
    expect(await there.getWhisper('anthropic')).to.eq('sk-ant-fake-mine')
  })

  it("a store refused as stale whose catch-up finds the passphrase changed elsewhere relocks the device, and writes nothing", async () => {
    const { hereDB, here, there, beforeNextWrite } = await twoDeviceWorld()
    await here.putBox('anthropic', 'sk-ant-fake-one')
    beforeNextWrite('putBox', async () => {
      await there.putBox('anthropic', 'sk-ant-fake-theirs')
      await there.putWayin('shared pw', 'their pw')
    })
    const putBox = vi.spyOn(hereDB, 'putBox')
    await TH.expectRefusal(here.putBox('anthropic', 'sk-ant-fake-mine'), 'vault_locked')
    expect(putBox).toHaveBeenCalledTimes(1)
    expect(delaysAsked(waits)).to.have.lengthOf(0)
    expect(here.getSnapshot().state).to.eq('locked')
    await there.lock()
    await there.unlock('their pw')
    expect(await there.getWhisper('anthropic')).to.eq('sk-ant-fake-theirs')
  })

  it("a store whose catch-up fails is refused as stale, the failure its cause, saying so, and still carries what won as meta.box_stored", async () => {
    const { world, hereDB, here, there, beforeNextWrite } = await twoDeviceWorld()
    await here.putBox('anthropic', 'sk-ant-fake-one')
    const down = new VaultError('storage_unavailable', 'The vault storage could not be reached.')
    beforeNextWrite('putBox', async () => {
      await there.putBox('anthropic', 'sk-ant-fake-theirs')
      vi.spyOn(hereDB, 'getVaultProps').mockResolvedValue(bad(down))
    })
    const putBox = vi.spyOn(hereDB, 'putBox')
    const err = await TH.expectRefusal(here.putBox('anthropic', 'sk-ant-fake-mine'), 'stale_write')
    expect(err.cause).to.eq(down)
    expect(err.message).to.include('Catching up with storage afterwards failed too')
    expect(err.meta?.box_stored).to.deep.equal(storedRowOf(world, 'anthropic'))
    expect(putBox).toHaveBeenCalledTimes(1)
    expect(delaysAsked(waits)).to.have.lengthOf(0)
    expect(here.getSnapshot().syncing).to.be.false
    const told = world.logged.find((heard) => heard.story?.['call'] === 'putBox')
    expect(told).to.deep.include({ level: 'warn', err: down })
    expect(told?.message).to.match(/catch-up with storage, after a write it refused as stale, failed/)
  })

  // A catch-up refusal that asks the caller for something else than a stale write passes as it came.
  const CatchUpRefusals = [
    [new VaultError('identity_revoked', 'Signed out.'), "locked",   'the user signed out: the vault locks, and the user signs in again'],
    [new VaultError('rolled_back', 'An older copy.'),   "opening",  'storage handed back an older copy: the vault locks, forgetting its vault props, and storage wants looking at'],
    [new VaultError('newer_format', 'A newer build.'),  "unlocked", 'a newer build wrote the vault: the app wants updating'],
  ] as const

  for (const [refusal, state, blurb] of CatchUpRefusals) {
    it(`a store whose catch-up is refused as ${refusal.refusalkind} throws that refusal as it came, never as stale: ${blurb}`, async () => {
      const { hereDB, here, there, beforeNextWrite } = await twoDeviceWorld()
      await here.putBox('anthropic', 'sk-ant-fake-one')
      beforeNextWrite('putBox', async () => {
        await there.putBox('anthropic', 'sk-ant-fake-theirs')
        vi.spyOn(hereDB, 'getVaultProps').mockResolvedValue(bad(refusal))
      })
      const putBox = vi.spyOn(hereDB, 'putBox')
      const err = await TH.expectRefusal(here.putBox('anthropic', 'sk-ant-fake-mine'), refusal.refusalkind)
      expect(err).to.eq(refusal)
      expect(putBox).toHaveBeenCalledTimes(1)
      expect(delaysAsked(waits)).to.have.lengthOf(0)
      expect(here.getSnapshot()).to.include({ state, syncing: false })
    })

    it(`a deletion whose catch-up is refused as ${refusal.refusalkind} throws that refusal as it came, never as stale`, async () => {
      const { hereDB, here } = await rebornUnheard()
      vi.spyOn(hereDB, 'getVaultProps').mockResolvedValue(bad(refusal))
      const err = await TH.expectRefusal(here.delBox('anthropic'), refusal.refusalkind)
      expect(err).to.eq(refusal)
    })
  }

  it("a deletion refused as stale is thrown at once, never tried again, saying the box could not be removed because its vault is gone", async () => {
    const { hereDB, here, there } = await rebornUnheard()
    const delBox = vi.spyOn(hereDB, 'delBox')
    const err = await TH.expectRefusal(here.delBox('anthropic'), 'stale_write')
    expect(err.message).to.match(/^That box could not be removed, because the vault it was in is gone/)
    // A boxlabel is never quoted: a host's check may admit any text, a mistaken paste among it.
    expect(err.message).to.not.include('anthropic')
    expect(err.cause).to.be.an.instanceOf(VaultError).and.to.have.property('refusalkind', 'stale_write')
    expect(delBox).toHaveBeenCalledTimes(1)
    expect(here.getSnapshot().state).to.eq('locked')
    expect(await there.getWhisper('anthropic')).to.eq('sk-ant-fake-new')
  })

  it("a deletion in a vault deleted elsewhere, and not made anew, is refused as stale by storage itself, the vault it was in gone", async () => {
    const world = makeWorld()
    const here = await world.openUnlocked('pw one', { vaultDB: world.deafVaultDB() })
    await here.putBox('anthropic', 'sk-ant-fake-old')
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    await there.del()
    const getBox = vi.spyOn(world.vaultDB, 'getBox')
    const err = await TH.expectRefusal(here.delBox('anthropic'), 'stale_write')
    expect(err.message).to.match(/vault it was in is gone/)
    expect(getBox).not.toHaveBeenCalled()
  })

  it("a deletion of a box another device deleted first is absent_box, as storage answers it, reading no box beforehand", async () => {
    const { world, hereDB, here, there } = await twoDeviceWorld()
    await here.putBox('anthropic', 'sk-ant-fake-one')
    TH.beforeNextCall(hereDB, 'delBox', async () => { await there.delBox('anthropic') })
    const getBox = vi.spyOn(hereDB, 'getBox')
    await TH.expectRefusal(here.delBox('anthropic'), 'absent_box')
    expect(getBox).not.toHaveBeenCalled()
    expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.be.null
  })

  it("a deletion whose catch-up fails says so, the failure its cause, rather than that the vault is gone", async () => {
    const { hereDB, here } = await rebornUnheard()
    const down = new VaultError('storage_unavailable', 'The vault storage could not be reached.')
    vi.spyOn(hereDB, 'getVaultProps').mockResolvedValue(bad(down))
    const err = await TH.expectRefusal(here.delBox('anthropic'), 'stale_write')
    expect(err.cause).to.eq(down)
    expect(err.message).to.include('Catching up with storage afterwards failed too')
    expect(err.message).to.not.match(/vault it was in is gone/)
  })

  it("a deletion names the revision its listing shows, and warns of nothing when that is what it deleted", async () => {
    const { world, hereDB, here } = await twoDeviceWorld()
    await here.putBox('anthropic', 'sk-ant-fake-one')
    const shown = here.getSnapshot().boxes[0]?.revision_tok
    const delBox = vi.spyOn(hereDB, 'delBox')
    await here.delBox('anthropic')
    expect(delBox.mock.calls[0]?.[2]).to.deep.equal({ vault_id: storedVaultPropsOf(world)['vault_id'], revision_tok: shown })
    expect(world.logged.filter((heard) => heard.story?.['call'] === 'delBox')).to.have.lengthOf(0)
  })

  it("a deletion over a box written meanwhile elsewhere deletes theirs all the same, and warns that it was not the revision shown, naming neither", async () => {
    const { world, hereDB, here, there } = await twoDeviceWorld()
    await here.putBox('anthropic', 'sk-ant-fake-one')
    const shown = String(here.getSnapshot().boxes[0]?.revision_tok)
    const theirs = { revisionTok: '' }
    TH.beforeNextCall(hereDB, 'delBox', async () => {
      await there.putBox('anthropic', 'sk-ant-fake-theirs')
      theirs.revisionTok = String(storedRowOf(world, 'anthropic')['revision_tok'])
    })
    await here.delBox('anthropic')
    expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.be.null
    expect(here.getSnapshot().boxes).to.have.lengthOf(0)
    const told = world.logged.filter((heard) => heard.story?.['call'] === 'delBox')
    expect(told).to.have.lengthOf(1)
    expect(told[0]).to.deep.include({ level: 'warn' })
    expect(told[0]?.message).to.match(/^The box deleted was not the revision this device showed/)
    expect(told[0]?.message).to.not.match(/damaged/)
    expect(told[0]?.story).to.not.have.property('damaged')
    const text = TH.loggedText(told)
    for (const unsaid of [shown, theirs.revisionTok, 'anthropic']) { expect(text).to.not.include(unsaid) }
  })

  it("a deletion over a damaged box written over meanwhile elsewhere deletes theirs all the same, and warns that the box shown was a damaged one, with damaged: true, naming neither", async () => {
    const { world, hereDB, here, there } = await twoDeviceWorld()
    await here.putBox('anthropic', 'sk-ant-fake-one')
    world.dbStore.write(u1BoxCkey('anthropic'), '{"not": json')
    await vi.waitFor(() => {
      expect(here.getSnapshot().boxes[0]).to.deep.equal({ boxlabel: 'anthropic', damaged: true, revision_tok: null })
      expect(there.getSnapshot().boxes[0]).to.deep.equal({ boxlabel: 'anthropic', damaged: true, revision_tok: null })
    })
    const theirs = { revisionTok: '' }
    TH.beforeNextCall(hereDB, 'delBox', async () => {
      // A store over a box damaged beyond naming is refused, so theirs deletes it first.
      await there.delBox('anthropic')
      await there.putBox('anthropic', 'sk-ant-fake-theirs')
      theirs.revisionTok = String(storedRowOf(world, 'anthropic')['revision_tok'])
    })
    await here.delBox('anthropic')
    expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.be.null
    expect(here.getSnapshot().boxes).to.have.lengthOf(0)
    // Theirs deleted the damaged record it was shown, and so warned of nothing; this one, of theirs.
    const told = world.logged.filter((heard) => heard.story?.['call'] === 'delBox')
    expect(told).to.have.lengthOf(1)
    expect(told[0]).to.deep.include({ level: 'warn' })
    expect(told[0]?.message).to.match(/^The box this device showed was a damaged one/)
    expect(told[0]?.story).to.deep.include({ call: 'delBox', damaged: true })
    const text = TH.loggedText(told)
    for (const unsaid of [theirs.revisionTok, 'anthropic', 'sk-ant-fake-one', 'sk-ant-fake-theirs']) { expect(text).to.not.include(unsaid) }
  })

  it("a deletion over a box listed damaged with a readable revision, written over meanwhile elsewhere, deletes theirs all the same, and warns of the damaged box shown with damaged: true, naming neither", async () => {
    const { world, hereDB, here, there } = await twoDeviceWorld()
    await here.putBox('anthropic', 'sk-ant-fake-one')
    world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify({ ...storedRowOf(world, 'anthropic'), written_at: 'later' }))
    const damagedRevision = String(storedRowOf(world, 'anthropic')['revision_tok'])
    await vi.waitFor(() => {
      expect(here.getSnapshot().boxes[0]).to.deep.equal({ boxlabel: 'anthropic', damaged: true, revision_tok: damagedRevision })
      expect(there.getSnapshot().boxes[0]).to.deep.equal({ boxlabel: 'anthropic', damaged: true, revision_tok: damagedRevision })
    })
    const theirs = { revisionTok: '' }
    TH.beforeNextCall(hereDB, 'delBox', async () => {
      await there.putBox('anthropic', 'sk-ant-fake-theirs')
      theirs.revisionTok = String(storedRowOf(world, 'anthropic')['revision_tok'])
    })
    const delBox = vi.spyOn(hereDB, 'delBox')
    await here.delBox('anthropic')
    expect(delBox.mock.calls[0]?.[2]).to.deep.include({ revision_tok: damagedRevision })
    expect(world.dbStore.read(u1BoxCkey('anthropic'))).to.be.null
    const told = world.logged.filter((heard) => heard.story?.['call'] === 'delBox')
    expect(told).to.have.lengthOf(1)
    expect(told[0]).to.deep.include({ level: 'warn' })
    expect(told[0]?.message).to.match(/^The box this device showed was a damaged one/)
    expect(told[0]?.story).to.deep.include({ call: 'delBox', damaged: true })
    const text = TH.loggedText(told)
    for (const unsaid of [damagedRevision, theirs.revisionTok, 'anthropic', 'sk-ant-fake-one', 'sk-ant-fake-theirs']) { expect(text).to.not.include(unsaid) }
  })

  it("a passphrase change racing another device's is refused as stale; theirs stands", async () => {
    const { here, there, beforeNextWrite } = await twoDeviceWorld()
    await here.putBox('anthropic', 'sk-ant-fake-one')
    beforeNextWrite('putVaultProps', async () => { await there.putWayin('shared pw', 'their pw') })
    await TH.expectRefusal(here.putWayin('shared pw', 'my pw'), 'stale_write')
    expect(here.getSnapshot().state).to.eq('locked')
    await TH.expectRefusal(here.unlock('my pw'), 'wrong_passphrase')
    await here.unlock('their pw')
    expect(await here.getWhisper('anthropic')).to.eq('sk-ant-fake-one')
  })

})

describe("refreshes, one at a time", () => {
  it("runs refreshes asked for at once one after the other, every request made meanwhile sharing one more", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const getVaultProps = world.vaultDB.getVaultProps.bind(world.vaultDB)
    const tally = { inFlight: 0, most: 0 }
    const reads = vi.spyOn(world.vaultDB, 'getVaultProps').mockImplementation(async (...args) => {
      tally.inFlight += 1
      tally.most = Math.max(tally.most, tally.inFlight)
      try {
        await TH.wakeupAtNextTick()
        return await getVaultProps(...args)
      } finally {
        tally.inFlight -= 1
      }
    })
    // Each write rings the storage watch, which asks for a refresh.
    for (const ii of [1, 2, 3]) { world.dbStore.write('elsewhere', String(ii)) }
    await vi.waitFor(() => { expect(reads).toHaveBeenCalledTimes(2) })
    await vi.waitFor(() => { expect(tally.inFlight).to.eq(0) })
    await TH.wakeupAtNextTick()
    expect(reads).toHaveBeenCalledTimes(2)
    expect(tally.most).to.eq(1)
    vi.restoreAllMocks()
    vault.close()
  })

  it("says syncing: false while the storage watch cannot read, warns once for the streak, once more for the hellos it says, and once when a read succeeds", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    expect(vault.getSnapshot().syncing).to.be.true
    const sound = world.dbStore.read(u1VaultPropsCkey) ?? ''
    world.dbStore.write(u1VaultPropsCkey, '{"format":"safebyok-vault-v6"}')
    await TH.wakeupAtNextTick()
    for (const ii of [1, 2]) {
      world.dbStore.write('elsewhere', String(ii))
      await TH.wakeupAtNextTick()
    }
    expect(vault.getSnapshot().syncing).to.be.false
    expect(vault.getSnapshot().state).to.eq('unlocked')
    // The failed read had the next ring say a hello, which failed as itself: warned of in its own words.
    expect(world.logged.map((heard) => [heard.level, heard.story])).to.deep.equal([['warn', { call: 'refresh' }], ['warn', { call: 'hello' }]])
    expect(world.logged[1]?.message).to.eq(world.logged[1]?.err?.message)
    world.dbStore.write(u1VaultPropsCkey, sound)
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot().syncing).to.be.true
    expect(world.logged.map((heard) => heard.level)).to.deep.equal(['warn', 'warn', 'log'])
    expect(world.logged[2]?.message).to.match(/reads again/)
  })
})
// --
