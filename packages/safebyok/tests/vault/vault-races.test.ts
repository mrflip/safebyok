import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { MinuteMillis } from '../../src/types'
import { VaultError } from '../../src/errors'
import { memoryDeviceDB } from '../../src/device-db'
import { localVaultDB } from '../../src/local-vault-db'
import { bad, good } from '../../src/outcome'
import * as TH from '../test-helpers'
import { makeRacingWorld, makeWorld, boxlabelsOf, storedWayinOf, storedVaultPropsOf, storedRowOf, u1BoxCkey, u1VaultPropsCkey } from './world'


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

describe("a vault another device made gateless, which sets no passphrase", () => {
  it("reads as no vault yet: gateless vault props hold no way in to try", async () => {
    const world = makeWorld()
    await TH.expectingGood(world.vaultDB).ensureVault(TH.scopeOf('u1'), TH.gatelessOf('u1'))
    const vault = await world.open()
    expect(vault.getSnapshot().state).to.eq('absent')
  })

  it("refuses a first unlock as created_elsewhere, creating nothing, and says to set the passphrase on that device", async () => {
    const world = makeWorld()
    const vault = await world.open()
    await TH.expectingGood(world.vaultDB).ensureVault(TH.scopeOf('u1'), TH.gatelessOf('u1'))
    const err = await TH.expectRefusal(vault.unlock('pw one'), 'created_elsewhere')
    expect(err.message).to.include('has not set its passphrase yet')
    expect(await TH.expectingGood(world.vaultDB).getVaultProps(TH.scopeOf('u1'))).to.deep.equal(TH.gatelessOf('u1'))
    expect(await world.getLease()).to.be.null
  })
})

describe("a first unlock that loses the race to create the vault", () => {
  it("refuses as created_elsewhere when the passphrase does not open the vault the other device made, as unlock's example shows", async () => {
    const { there } = await raceLostToPwOne()
    const err = await TH.expectRefusal(there.unlock('pw two'), 'created_elsewhere')
    expect(err.message).to.match(/^A vault was just created for this label on another device, with a different passphrase/)
    expect(err.message).to.include('Enter the passphrase you chose there')
    expect(err.message).to.not.include('pw')
    expect(err.cause).to.have.property('refusalkind', 'wrong_passphrase')
  })

  it("settles locked on the standing vault, its boxes read at the next hello, and unlocks it with the passphrase chosen there", async () => {
    const { world, there } = await raceLostToPwOne()
    await TH.expectRefusal(there.unlock('pw two'), 'created_elsewhere')
    const snapshot = there.getSnapshot()
    expect(snapshot.state).to.eq('locked')
    expect(snapshot.syncing).to.be.true
    expect(snapshot.passphrase?.device_id).to.eq(storedWayinOf(world, 'passphrase')?.['device_id'])
    expect(snapshot.passkey).to.be.null
    await there.hello()
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
// has a new vault_tok and its own passphrase.
const rebornWorld = async () => {
  const world = makeWorld()
  const deafDB = world.deafVaultDB()
  const vaultOne = await world.openUnlocked('pw one', { vaultDB: deafDB })
  await vaultOne.putBox('anthropic', 'sk-ant-fake-old')
  const vaultTwo = await world.open()
  await vaultTwo.del()
  await vaultTwo.unlock('pw two')
  await vaultTwo.putBox('anthropic', 'sk-ant-fake-new')
  return { world, vaultOne, vaultTwo, deafDB }
}

describe("a stale session cannot reach into a vault reborn elsewhere", () => {
  it("putBox() is refused by storage as vault_mismatch, said as stale_write, instead of landing in the reborn vault, and the next hello reads afresh", async () => {
    const { vaultOne, vaultTwo, deafDB } = await rebornWorld()
    expect(vaultOne.getSnapshot().state).to.eq('unlocked')
    await TH.expectRefusal(vaultOne.putBox('anthropic', 'sk-ant-fake-stale'), 'stale_write')
    expect(await vaultTwo.getWhisper('anthropic')).to.eq('sk-ant-fake-new')
    const reads = vi.spyOn(deafDB, 'getVault')
    await vaultOne.hello()
    expect(reads).toHaveBeenCalledOnce()
    expect(vaultOne.getSnapshot().vault_tok).to.eq(vaultTwo.getSnapshot().vault_tok)
    vi.restoreAllMocks()
  })

  it("getWhisper() of a box the reborn vault wrote refuses as damaged_box at once, reading no vault props; a hello that reads afresh then finds the vault moved, taking up the lease this device keeps for it", async () => {
    const { vaultOne, vaultTwo, deafDB } = await rebornWorld()
    expect(vaultOne.getSnapshot().state).to.eq('unlocked')
    const getVaultProps = vi.spyOn(deafDB, 'getVault')
    const err = await TH.expectRefusal(vaultOne.getWhisper('anthropic'), 'damaged_box')
    expect(err.message).to.include('hello({ staleMinutes: 0 })')
    expect(getVaultProps).not.toHaveBeenCalled()
    expect(vaultOne.getSnapshot().state).to.eq('unlocked')
    await vaultOne.hello({ staleMinutes: 0 })
    expect(vaultOne.getSnapshot().vault_tok).to.eq(vaultTwo.getSnapshot().vault_tok)
    expect(await vaultOne.getWhisper('anthropic')).to.eq('sk-ant-fake-new')
    vi.restoreAllMocks()
  })

  it("getWhisper() of a box that will not open in a vault that has not moved names it damaged at once, reading no vault props", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox('anthropic', 'sk-fake')
    const row = storedRowOf(world, 'anthropic')
    const wrapped = row['whisper_ciphered'] as { cipher_iv_b64: string, ciphertext_b64: string }
    world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify({ ...row, whisper_ciphered: { ...wrapped, ciphertext_b64: TH.tweakB64(wrapped.ciphertext_b64) } }))
    await TH.wakeupAtNextTick()
    const getVaultProps = vi.spyOn(world.vaultDB, 'getVault')
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'damaged_box')
    expect(getVaultProps).not.toHaveBeenCalled()
    expect(vault.getSnapshot().state).to.eq('unlocked')
    vi.restoreAllMocks()
  })

  it("getWhisper() names a box that will not open damaged_box while storage's vault props are out of reach: it never reads them to decide", async () => {
    const world = makeWorld()
    const deafDB = world.deafVaultDB()
    const vault = await world.openUnlocked('pw', { vaultDB: deafDB })
    await vault.putBox('anthropic', 'sk-fake')
    const row = storedRowOf(world, 'anthropic')
    world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify({ ...row, revision_tok: 'tampered' }))
    const down = new VaultError('storage_unavailable', 'The vault storage could not be reached.')
    const getVaultProps = vi.spyOn(deafDB, 'getVault').mockResolvedValue(bad(down))
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'damaged_box')
    expect(getVaultProps).not.toHaveBeenCalled()
    expect(vault.getSnapshot().syncing).to.be.true
    vi.restoreAllMocks()
  })

  it("putBox() of a box the reborn vault has never held is refused all the same", async () => {
    const { vaultOne, vaultTwo } = await rebornWorld()
    await TH.expectRefusal(vaultOne.putBox('openai', 'sk-fake-stale'), 'stale_write')
    expect(boxlabelsOf(vaultTwo)).to.deep.equal(['anthropic'])
  })

  it("delBox() is refused by storage as stale: the reborn vault keeps its box", async () => {
    const { vaultOne, vaultTwo } = await rebornWorld()
    expect(vaultOne.getSnapshot().state).to.eq('unlocked')
    await TH.expectRefusal(vaultOne.delBox('anthropic'), 'stale_write')
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

  it("putWayin() proves against the vault props in hand, and storage refuses its write as stale, never burying the reborn vault's", async () => {
    const { vaultOne, vaultTwo } = await rebornWorld()
    await TH.expectRefusal(vaultOne.putWayin('pw one', 'pw three'), 'stale_write')
    await vaultTwo.lock()
    await vaultTwo.unlock('pw two')
    expect(await vaultTwo.getWhisper('anthropic')).to.eq('sk-ant-fake-new')
  })

  it("unlock() after a stale write reads afresh first: the reborn vault's own passphrase opens it from the stale handle", async () => {
    const { vaultOne } = await rebornWorld()
    await TH.expectRefusal(vaultOne.putBox('anthropic', 'sk-ant-fake-stale'), 'stale_write')
    await vaultOne.unlock('pw two')
    expect(await vaultOne.getWhisper('anthropic')).to.eq('sk-ant-fake-new')
  })

  it("putBox() into a vault deleted elsewhere, and not remade, is refused, and the next hello finds it absent", async () => {
    const world = makeWorld()
    const vaultOne = await world.openUnlocked('pw one', { vaultDB: world.deafVaultDB() })
    const vaultTwo = await world.open()
    await vaultTwo.del()
    await TH.expectRefusal(vaultOne.putBox('anthropic', 'sk-ant-fake-stale'), 'stale_write')
    await vaultOne.hello()
    expect(vaultOne.getSnapshot().state).to.eq('absent')
    expect(world.dbStore.ckeys()).to.have.lengthOf(0)
  })

  it("del() of a vault deleted elsewhere, and not remade, is refused as stale; a second del() is quiet", async () => {
    const world = makeWorld()
    const vaultOne = await world.openUnlocked('pw one', { vaultDB: world.deafVaultDB() })
    const vaultTwo = await world.open()
    await vaultTwo.del()
    await TH.expectRefusal(vaultOne.del(), 'stale_write')
    expect(vaultOne.getSnapshot().state).to.eq('locked')
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

  it("a store over a box written meanwhile elsewhere is refused as stale once, without waiting or reading: nothing written, and a second store, its hello reading afresh, lands over theirs", async () => {
    const world = makeWorld()
    // Deaf to storage's change bells: only the read after the refusal can bring theirs in.
    const hereDB = world.deafVaultDB()
    const here = await world.openUnlocked('shared pw', { vaultDB: hereDB })
    const there = await world.openUnlocked('shared pw', { deviceDB: memoryDeviceDB() })
    await here.putBox('anthropic', 'sk-ant-fake-one', { sidecar: { note: 'first' } })
    TH.beforeNextCall(hereDB, 'putBox', () => there.putBox('anthropic', 'sk-ant-fake-theirs', { sidecar: { note: 'theirs' } }))
    const putBox = vi.spyOn(hereDB, 'putBox')
    const reads = vi.spyOn(hereDB, 'getVault')
    const err = await TH.expectRefusal(here.putBox('anthropic', 'sk-ant-fake-mine'), 'stale_write')
    expect(err.message).to.match(/^That box changed in storage since this device read it/)
    // A boxlabel is never quoted: a host's check may admit any text, a mistaken paste among it.
    expect(err.message).to.not.include('anthropic')
    expect(putBox).toHaveBeenCalledTimes(1)
    expect(reads).not.toHaveBeenCalled()
    expect(delaysAsked(waits)).to.have.lengthOf(0)
    const theirRevision = storedRowOf(world, 'anthropic')['revision_tok']
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
    expect(err.message).to.match(/^The vault changed in storage while this device was storing into it/)
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
    await here.hello()
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
    await here.hello()
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

  it("a store over a damaged box its listing does not show yet writes over none, refused as stale, and the next store writes over the revision the next read lists", async () => {
    const { world, hereDB, here, there } = await twoDeviceWorld()
    await here.putBox('anthropic', 'sk-ant-fake-one')
    // A listing gone stale: storage holds a damaged record the snapshot does not show.
    const getVault = hereDB.getVault.bind(hereDB)
    const reads = vi.spyOn(hereDB, 'getVault').mockImplementation(async (scope) => {
      const read = await getVault(scope)
      return read.ok && read.val !== null ? good({ ...read.val, boxes: [] }) : read
    })
    world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify({ ...storedRowOf(world, 'anthropic'), written_at: 'later' }))
    await vi.waitFor(() => { expect(here.getSnapshot().boxes).to.have.lengthOf(0) })
    reads.mockRestore()
    const damagedRevision = storedRowOf(world, 'anthropic')['revision_tok']
    const delBox = vi.spyOn(hereDB, 'delBox')
    const putBox = vi.spyOn(hereDB, 'putBox')
    await TH.expectRefusal(here.putBox('anthropic', 'sk-ant-fake-mine'), 'stale_write')
    expect(putBox).toHaveBeenCalledTimes(1)
    expect(putBox.mock.calls[0]?.[1].revision_tok).to.be.null
    await here.hello()
    expect(here.getSnapshot().boxes[0]).to.deep.include({ damaged: true, revision_tok: damagedRevision })
    await here.putBox('anthropic', 'sk-ant-fake-mine')
    expect(delBox).not.toHaveBeenCalled()
    expect(putBox.mock.calls[1]?.[1].revision_tok).to.eq(damagedRevision)
    expect(await there.getWhisper('anthropic')).to.eq('sk-ant-fake-mine')
  })

  it("a store refused as stale writes nothing, and the next hello finds the passphrase changed elsewhere and locks the device", async () => {
    const { hereDB, here, there, beforeNextWrite } = await twoDeviceWorld()
    await here.putBox('anthropic', 'sk-ant-fake-one')
    beforeNextWrite('putBox', async () => {
      await there.putBox('anthropic', 'sk-ant-fake-theirs')
      await there.putWayin('shared pw', 'their pw')
    })
    const putBox = vi.spyOn(hereDB, 'putBox')
    await TH.expectRefusal(here.putBox('anthropic', 'sk-ant-fake-mine'), 'stale_write')
    expect(putBox).toHaveBeenCalledTimes(1)
    expect(delaysAsked(waits)).to.have.lengthOf(0)
    await here.hello()
    expect(here.getSnapshot().state).to.eq('locked')
    await there.lock()
    await there.unlock('their pw')
    expect(await there.getWhisper('anthropic')).to.eq('sk-ant-fake-theirs')
  })

  it("a deletion refused as stale is thrown at once, never tried again, saying the vault changed and nothing was removed; the next hello finds the vault moved, and locks", async () => {
    const { hereDB, here, there } = await rebornUnheard()
    const delBox = vi.spyOn(hereDB, 'delBox')
    const err = await TH.expectRefusal(here.delBox('anthropic'), 'stale_write')
    expect(err.message).to.match(/this removal was refused and nothing was removed/)
    // A boxlabel is never quoted: a host's check may admit any text, a mistaken paste among it.
    expect(err.message).to.not.include('anthropic')
    expect(delBox).toHaveBeenCalledTimes(1)
    await here.hello()
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
    expect(err.message).to.match(/deleted, or deleted and made anew, elsewhere/)
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

  it("a deletion names the revision its listing shows, and warns of nothing when that is what it deleted", async () => {
    const { world, hereDB, here } = await twoDeviceWorld()
    await here.putBox('anthropic', 'sk-ant-fake-one')
    const shown = here.getSnapshot().boxes[0]?.revision_tok
    const delBox = vi.spyOn(hereDB, 'delBox')
    await here.delBox('anthropic')
    expect(delBox.mock.calls[0]?.[2]).to.deep.equal({ vault_tok: storedVaultPropsOf(world)['vault_tok'], revision_tok: shown })
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

  it("a passphrase change racing another device's is refused as stale, and the next hello locks under theirs; theirs stands", async () => {
    const { here, there, beforeNextWrite } = await twoDeviceWorld()
    await here.putBox('anthropic', 'sk-ant-fake-one')
    beforeNextWrite('putVaultProps', async () => { await there.putWayin('shared pw', 'their pw') })
    await TH.expectRefusal(here.putWayin('shared pw', 'my pw'), 'stale_write')
    await here.hello()
    expect(here.getSnapshot().state).to.eq('locked')
    await TH.expectRefusal(here.unlock('my pw'), 'wrong_passphrase')
    await here.unlock('their pw')
    expect(await here.getWhisper('anthropic')).to.eq('sk-ant-fake-one')
  })

})

describe("reads, one at a time", () => {
  it("reads once for each ring heard at once, one read after the other, never two at once", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await TH.wakeupAtNextTick()
    const getVault = world.vaultDB.getVault.bind(world.vaultDB)
    const tally = { inFlight: 0, most: 0 }
    const reads = vi.spyOn(world.vaultDB, 'getVault').mockImplementation(async (...args) => {
      tally.inFlight += 1
      tally.most = Math.max(tally.most, tally.inFlight)
      try {
        await TH.wakeupAtNextTick()
        return await getVault(...args)
      } finally {
        tally.inFlight -= 1
      }
    })
    // Each write rings the storage watch, which asks for a refresh.
    for (const ii of [1, 2, 3]) { world.dbStore.write('elsewhere', String(ii)) }
    await vi.waitFor(() => { expect(reads).toHaveBeenCalledTimes(3) })
    await vi.waitFor(() => { expect(tally.inFlight).to.eq(0) })
    await TH.wakeupAtNextTick()
    expect(reads).toHaveBeenCalledTimes(3)
    expect(tally.most).to.eq(1)
    vi.restoreAllMocks()
    vault.close()
  })

  it("says syncing: false while the storage watch cannot read, warns once for the streak, and once when a read succeeds", async () => {
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
    expect(world.logged.map((heard) => [heard.level, heard.story])).to.deep.equal([['warn', { call: 'refresh' }]])
    world.dbStore.write(u1VaultPropsCkey, sound)
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot().syncing).to.be.true
    expect(world.logged.map((heard) => heard.level)).to.deep.equal(['warn', 'log'])
    expect(world.logged[1]?.message).to.match(/reads again/)
  })
})
// --
