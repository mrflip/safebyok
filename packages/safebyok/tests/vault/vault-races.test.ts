import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { MinuteMillis } from '../../src/consts'
import { VaultError } from '../../src/errors'
import type { Vault } from '../../src/vault'
import { memoryDeviceDB } from '../../src/device-db'
import { localVaultDB } from '../../src/local-vault-db'
import { type Outcome, bad, good, valOf } from '../../src/outcome'
import * as TH from '../test-helpers'
import { makeRacingWorld, makeWorld, boxlabelsOf, storedWayinOf, storedVaultRecordOf, storedRowOf, u1BoxScopepath, u1VaultScopepath, addLaptopPasskey } from './world'


/** The draft of `u1`'s `main` vault, as a bank takes it: what a test asks the bank for to get the vault's next life. */
const u1Main = { user_id: 'u1', vaultlabel: 'main' } as const

// == [Lock against unlock and read]: a lock that lands while an unlock, read in flight

describe("a lock that lands while an unlock or a change is under way", () => {
  it("a del() in another tab that lands mid-unlock leaves nothing unlocked: the vault is gone", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    await vault.lock()
    // Another tab of this device: a del() on this Vault object would wait the unlock out.
    const tab = await world.open()
    const gate = world.holdNextDerive()
    const unlocking = TH.expectRefusal(TH.unlock(vault, 'pw one'), 'vault_gone')
    await gate.reached
    await TH.del(tab, 'pw one')
    // Let this tab's refresh, rung by the deletion, find the vault deleted.
    await TH.wakeupAtNextTick()
    gate.release()
    await unlocking
    await TH.expectRefusal(vault.hello(), 'vault_gone')
    expect(world.dbStore.scopepaths(), 'the tombstone, and nothing else').to.deep.equal([u1VaultScopepath])
    expect(await world.getLease()).to.be.null
  })

  it("a del() in another tab that lands while an unlock's lease is written leaves no lease: its erase lands behind the write", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.lock()
    const tab = await world.open()
    const gate = world.holdNextLease()
    const unlocking = TH.expectRefusal(TH.unlock(vault, 'pw one'), 'vault_gone')
    await gate.reached
    await TH.del(tab, 'pw one')
    await TH.wakeupAtNextTick()
    gate.release()
    await unlocking
    await TH.expectRefusal(vault.hello(), 'vault_gone')
    expect(await world.getLease()).to.be.null
  })

  it("a del() in another tab that lands while putWayin()'s lease is written leaves no lease, its erase landing behind the write, and putWayin() refuses vault_gone", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    const tab = await world.open()
    const gate = world.holdNextLease()
    const changing = TH.expectRefusal(TH.putWayin(vault, 'pw one', 'pw two'), 'vault_gone')
    await gate.reached
    // The change is stored: the tab proves the deletion with the new passphrase.
    await TH.del(tab, 'pw two')
    await TH.wakeupAtNextTick()
    gate.release()
    await changing
    await TH.expectRefusal(vault.hello(), 'vault_gone')
    expect(await world.getLease()).to.be.null
  })

  it("during putWayin(), once its gate is stored: the passphrase still changes, but no lease is attached, and putWayin() refuses vault_locked", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('old passphrase')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const putLease = vi.spyOn(world.deviceDB, 'tryPutLease')
    const gate = TH.holdNextAnswer(world.vaultDB, 'tryPutVaultRecord')
    const changing = TH.putWayin(vault, 'old passphrase', 'new passphrase')
    await gate.reached
    await vault.lock()
    gate.release()
    await TH.expectRefusal(changing, 'vault_locked')
    expect(TH.stateOf(vault.snapshot)).to.eq('locked')
    expect(putLease).not.toHaveBeenCalled()
    expect(await world.getLease()).to.be.null

    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.expectRefusal(TH.unlock(fresh, 'old passphrase'), 'wrong_passphrase')
    await TH.unlock(fresh, 'new passphrase')
    expect(await fresh.getWhisper('anthropic')).to.eq('sk-fake')
  })

})

describe("a read in flight when a lock lands", () => {
  afterEach(() => { vi.restoreAllMocks() })

  it("refuses as locked when lock() lands while storage is read, handing back nothing", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
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
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const gate = TH.holdNextCall(crypto.subtle, 'decrypt')
    const callback = vi.fn()
    const using = TH.expectRefusal(vault.useWhisper('anthropic', callback), 'vault_locked')
    await gate.reached
    await vault.lock()
    gate.release()
    await using
    expect(callback).not.toHaveBeenCalled()
  })

  it("refuses as gone when the bank lets the vault go while storage is read, handing back nothing", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const gate = world.holdNextBoxRead()
    const reading = TH.expectRefusal(vault.getWhisper('anthropic'), 'vault_gone')
    await gate.reached
    TH.closeVault(vault)
    gate.release()
    await reading
  })

  it("refuses as gone when the bank lets the vault go while the whisper is deciphered, its callback never called", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const gate = TH.holdNextCall(crypto.subtle, 'decrypt')
    const callback = vi.fn()
    const using = TH.expectRefusal(vault.useWhisper('anthropic', callback), 'vault_gone')
    await gate.reached
    TH.closeVault(vault)
    gate.release()
    await using
    expect(callback).not.toHaveBeenCalled()
  })

  it("refuses as locked when a refresh finds the passphrase changed elsewhere while storage is read: the key it held is outlived", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const there = await world.openUnlocked('pw one', { deviceDB: memoryDeviceDB() })
    const gate = world.holdNextBoxRead()
    const reading = TH.expectRefusal(vault.getWhisper('anthropic'), 'vault_locked')
    await gate.reached
    await TH.putWayin(there, 'pw one', 'pw two')
    // Let this handle's background refresh, rung by the write above, find its key outlived.
    await TH.wakeupAtNextTick()
    expect(TH.stateOf(vault.getSnapshot())).to.eq('locked')
    gate.release()
    await reading
  })

  const ReadsOfABox = [
    ['getWhisper', (vault: Vault) => vault.getWhisper('anthropic'),              'a read'],
    ['putBox', (vault: Vault) => vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake-2'), 'a store'],
  ] as const

  for (const [verb, calling, blurb] of ReadsOfABox) {
    it(`refuses ${blurb} as vault_gone when a refresh finds the vault deleted elsewhere while storage reads the box (${verb})`, async () => {
      const world = makeRacingWorld()
      const vault = await world.openUnlocked('pw one')
      await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
      const there = await world.openUnlocked('pw one', { deviceDB: memoryDeviceDB() })
      const getBox = world.vaultDB.tryGetBox.bind(world.vaultDB)
      // Storage answers with the box, but only once the vault is gone and this handle has heard.
      vi.spyOn(world.vaultDB, 'tryGetBox').mockImplementationOnce(async (...args) => {
        const answer = await getBox(...args)
        await TH.del(there, 'pw one')
        await TH.wakeupAtNextTick()
        return answer
      })
      await TH.expectRefusal(calling(vault), 'vault_gone')
      await TH.expectRefusal(vault.hello(), 'vault_gone')
    })
  }

  it("refuses as vault_gone when a refresh finds the vault deleted elsewhere while the whisper is deciphered", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const there = await world.openUnlocked('pw one', { deviceDB: memoryDeviceDB() })
    const gate = TH.holdNextCall(crypto.subtle, 'decrypt')
    const callback = vi.fn()
    const using = TH.expectRefusal(vault.useWhisper('anthropic', callback), 'vault_gone')
    await gate.reached
    await TH.del(there, 'pw one')
    await TH.wakeupAtNextTick()
    await TH.expectRefusal(vault.hello(), 'vault_gone')
    gate.release()
    await using
    expect(callback).not.toHaveBeenCalled()
  })
})
// --

// == [Creation and moved vaults]: raceLostToPwOne, first unlock loses race, vault moves elsewhere, other handle

/**
 * Device B, open on a novel vault, and device A, another device on the same storage. A sets the
 * vault's first gate with 'pw one' (and stores a box) inside B's first unlock, just before B's
 * write of its gate. B hears no bell from storage, so that only its own reads can bring A's gate in.
 */
const raceLostToPwOne = async () => {
  const world = makeWorld()
  const deafDB = world.deafVaultDB()
  const there = await world.open({ vaultDB: deafDB })
  const here = await world.open({ deviceDB: memoryDeviceDB() })
  TH.beforeNextCall(deafDB, 'tryPutVaultRecord', async () => {
    await TH.unlock(here, 'pw one')
    await here.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-theirs')
  })
  return { world, deafDB, there, here }
}

describe("a vault another device made gateless, which sets no passphrase", () => {
  it("is born novel: gateless vault record holds no way in to try", async () => {
    const world = makeWorld()
    await TH.expectingGood(world.vaultDB).tryEnsureVault(TH.gatelessOf('u1'))
    const vault = await world.open()
    expect(TH.stateOf(vault.getSnapshot())).to.eq('novel')
    expect(vault.getSnapshot()).to.deep.include({ vault_tok: TH.gatelessOf('u1').vault_tok })
  })

  it("takes a first unlock's passphrase as its gate: the vault the other device ensured is born here, and gated under its vault_tok, and unlocked", async () => {
    const world = makeWorld()
    await TH.expectingGood(world.vaultDB).tryEnsureVault(TH.gatelessOf('u1', { vault_tok: 'vault-tok-ensured-elsewhere' }))
    const vault = await world.open()
    await TH.unlock(vault, 'pw one')
    expect(TH.stateOf(vault.getSnapshot())).to.eq('unlocked')
    expect(storedVaultRecordOf(world)).to.deep.include({ vault_tok: 'vault-tok-ensured-elsewhere', gate_epoch: 1, vault_epoch: 1 })
    expect(await world.getLease()).to.not.be.null
  })
})

describe("a first unlock that loses the race to create the vault", () => {
  it("refuses as gate_made_elsewhere when another device set the first gate first: a first unlock is told to enter the passphrase chosen there", async () => {
    const { there } = await raceLostToPwOne()
    const err = await TH.expectRefusal(TH.unlock(there, 'pw two'), 'gate_made_elsewhere')
    expect(err.message).to.match(/^This vault's passphrase was just set on another device/)
    expect(err.message).to.include('Enter the passphrase chosen there')
    expect(err.message).to.not.include('pw')
    expect(err.cause).to.be.undefined
  })

  it("refuses as gate_made_elsewhere whatever passphrase either chose: the loser never tries its own against the winner's gate", async () => {
    const { world, there } = await raceLostToPwOne()
    await TH.expectRefusal(TH.unlock(there, 'pw one'), 'gate_made_elsewhere')
    expect(TH.stateOf(there.getSnapshot())).to.eq('novel')
    expect(await world.getLease()).to.be.null
  })

  it("takes nothing of the winner's gate into the picture: the next hello reads storage afresh, settles locked, and the passphrase chosen there unlocks it", async () => {
    const { world, there } = await raceLostToPwOne()
    await TH.expectRefusal(TH.unlock(there, 'pw two'), 'gate_made_elsewhere')
    expect(TH.stateOf(there.getSnapshot())).to.eq('novel')
    expect(TH.cheatGetVaultEpoch(there).gate_epoch).to.eq(0)
    expect(boxlabelsOf(there)).to.deep.equal([])
    await there.hello()
    const snapshot = there.getSnapshot()
    expect(TH.stateOf(snapshot)).to.eq('locked')
    expect(snapshot.gate?.passphrase.device_id).to.eq(storedWayinOf(world, 'passphrase')?.['device_id'])
    expect(snapshot.gate?.passkey).to.be.null
    expect(boxlabelsOf(there)).to.deep.equal(['anthropic'])
    expect(await world.getLease()).to.be.null
    await TH.unlock(there, 'pw one')
    expect(await there.getWhisper('anthropic')).to.eq('sk-ant-fake-theirs')
  })

  it("tells a second wrong passphrase as wrong_passphrase: the vault now has its gate, and gate_made_elsewhere is only for the first unlock", async () => {
    const { there } = await raceLostToPwOne()
    await TH.expectRefusal(TH.unlock(there, 'pw two'), 'gate_made_elsewhere')
    await TH.expectRefusal(TH.unlock(there, 'pw three'), 'wrong_passphrase')
  })

  it("refuses as gate_made_elsewhere when another device gates the vault between this unlock's look and its gate, leaving the winner's gate stored", async () => {
    const world = makeWorld()
    const deafDB = world.deafVaultDB()
    const there = await world.open({ vaultDB: deafDB })
    const here = await world.open({ deviceDB: memoryDeviceDB() })
    TH.beforeNextCall(deafDB, 'tryPutVaultRecord', async () => { await TH.unlock(here, 'pw one') })
    await TH.expectRefusal(TH.unlock(there, 'pw two'), 'gate_made_elsewhere')
    expect(TH.stateOf(there.getSnapshot())).to.eq('novel')
    expect(storedVaultRecordOf(world)).to.deep.include({ vault_tok: there.vault_tok, gate_epoch: 1 })
    expect(await world.getLease()).to.be.null
    await here.lock()
    await TH.unlock(here, 'pw one')
  })

  it("refuses as gate_made_elsewhere when a hello reads the winner's gate in while this unlock's gate is being written", async () => {
    const world = makeWorld()
    const deafDB = world.deafVaultDB()
    const there = await world.open({ vaultDB: deafDB })
    const here = await world.open({ deviceDB: memoryDeviceDB() })
    TH.beforeNextCall(deafDB, 'tryPutVaultRecord', async () => {
      await TH.unlock(here, 'pw one')
      await there.hello({ staleMinutes: 0 })
    })
    await TH.expectRefusal(TH.unlock(there, 'pw two'), 'gate_made_elsewhere')
    expect(storedVaultRecordOf(world)).to.deep.include({ vault_tok: there.vault_tok, gate_epoch: 1 })
    expect(await world.getLease()).to.be.null
    await TH.unlock(there, 'pw one')
    expect(TH.stateOf(there.snapshot)).to.eq('unlocked')
  })

  it("is plain wrong_passphrase when the other device's vault was in storage before this unlock looked: the look finds it", async () => {
    const world = makeWorld()
    const there = await world.open()
    const here = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.unlock(here, 'pw one')
    await TH.expectRefusal(TH.unlock(there, 'pw two'), 'wrong_passphrase')
    expect(TH.stateOf(there.getSnapshot())).to.eq('locked')
  })
})

/** Device B, open on a novel vault over a store that rings, and device A beside it on the same storage with its own device store.
 * `gateElsewhere` has A set the vault's first gate with 'pw one', then waits until B's refresh,
 * rung by A's write, takes that gate into B's picture: a test lands it while B's first unlock is
 * held in one window of its chain.
 */
const ringingRaceToPwOne = async (overrides?: Partial<TH.BornVaultOpts>) => {
  const world = makeRacingWorld()
  const there = await world.open(overrides)
  const here = await world.open({ deviceDB: memoryDeviceDB() })
  const gateElsewhere = async () => {
    await TH.unlock(here, 'pw one')
    await TH.eventually(() => TH.cheatGetVaultEpoch(there).gate_epoch === 1)
  }
  return { world, there, gateElsewhere }
}

/** What is true once B's first unlock lost midway: A's gate, which B's picture holds, B locked under it with no lease, and A's passphrase unlocking B. */
const expectLostToPwOne = async (world: ReturnType<typeof makeRacingWorld>, there: Vault) => {
  expect(storedVaultRecordOf(world)).to.deep.include({ vault_tok: there.vault_tok, gate_epoch: 1 })
  expect(TH.stateOf(there.getSnapshot())).to.eq('locked')
  expect(TH.cheatGetVaultEpoch(there).gate_epoch).to.eq(1)
  expect(await world.getLease()).to.be.null
  await TH.unlock(there, 'pw one')
  expect(TH.stateOf(there.snapshot)).to.eq('unlocked')
}

describe("a first unlock that loses the race midway, a refresh taking the other device's gate in", () => {
  it("refuses as gate_made_elsewhere, never weak_passphrase, when the other device's gate lands while the strength check runs", async () => {
    const latch = TH.makeLatch()
    const strengthChecker = async () => {
      await latch.pass()
      return { strong: false as const, reason: "Too short." }
    }
    const { world, there, gateElsewhere } = await ringingRaceToPwOne({ strengthChecker })
    const unlocking = TH.expectRefusal(TH.unlock(there, 'pw two'), 'gate_made_elsewhere')
    await latch.reached
    await gateElsewhere()
    latch.release()
    const err = await unlocking
    expect(err.message).to.include('Enter the passphrase chosen there')
    await expectLostToPwOne(world, there)
  })

  it("refuses as gate_made_elsewhere when the other device's gate lands while the passphrase is derived", async () => {
    const { world, there, gateElsewhere } = await ringingRaceToPwOne()
    const deriving = world.holdNextDerive()
    const unlocking = TH.expectRefusal(TH.unlock(there, 'pw two'), 'gate_made_elsewhere')
    await deriving.reached
    await gateElsewhere()
    deriving.release()
    await unlocking
    await expectLostToPwOne(world, there)
  })

  it("refuses as gate_made_elsewhere when the other device's gate lands while a derivation that then fails runs: the race, not the deriver, is what it names", async () => {
    const latch = TH.makeLatch()
    const keyDeriver = { ...TH.testDeriver, deriveKeyBytes: async () => {
      await latch.pass()
      throw new Error("The deriver ran out of memory.")
    } }
    const { world, there, gateElsewhere } = await ringingRaceToPwOne({ keyDeriver })
    const unlocking = TH.expectRefusal(TH.unlock(there, 'pw two'), 'gate_made_elsewhere')
    await latch.reached
    await gateElsewhere()
    latch.release()
    await unlocking
    expect(storedVaultRecordOf(world)).to.deep.include({ vault_tok: there.vault_tok, gate_epoch: 1 })
    expect(TH.stateOf(there.getSnapshot())).to.eq('locked')
    expect(TH.cheatGetVaultEpoch(there).gate_epoch).to.eq(1)
  })

  it("refuses as gate_made_elsewhere when the other device's gate lands while the first wayins are sealed", async () => {
    const { world, there, gateElsewhere } = await ringingRaceToPwOne()
    // The first fresh key the chain makes is its vaultKey, in sealWayins, after both seals' demands.
    TH.beforeNextCall(crypto.subtle, 'generateKey', gateElsewhere)
    await TH.expectRefusal(TH.unlock(there, 'pw two'), 'gate_made_elsewhere')
    await expectLostToPwOne(world, there)
  })

  it("refuses as gate_made_elsewhere when the other device's gate lands while the first wayins are sealed beside a passkey's", async () => {
    const { world, there, gateElsewhere } = await ringingRaceToPwOne()
    const passkey = await TH.passkeyOf('laptop')
    TH.beforeNextCall(crypto.subtle, 'generateKey', gateElsewhere)
    TH.answering(there, async (gating) => { await TH.expectBad(TH.asKind(gating, 'initialize_gate').attempt('pw two', passkey), 'gate_made_elsewhere') })
    await TH.expectRefusal(there.ensureUnlocked(), 'gate_made_elsewhere')
    expect(storedVaultRecordOf(world)['gate']).to.deep.include({ passkey: null })
    await expectLostToPwOne(world, there)
  })

  it("refuses as gate_moved, not gate_made_elsewhere, once its own first gate is stored and the other device then changes the passphrase before the lease is granted", async () => {
    const world = makeRacingWorld()
    const there = await world.open()
    const here = await world.open({ deviceDB: memoryDeviceDB() })
    // The first key the chain unwraps is the vaultKey, in grantLease, after its gate is stored.
    TH.beforeNextCall(crypto.subtle, 'unwrapKey', async () => {
      await TH.unlock(here, 'pw two')
      await TH.putWayin(here, 'pw two', 'pw three')
      await TH.eventually(() => TH.cheatGetVaultEpoch(there).gate_epoch === 2)
    })
    await TH.expectRefusal(TH.unlock(there, 'pw two'), 'gate_moved')
    expect(storedVaultRecordOf(world)).to.deep.include({ vault_tok: there.vault_tok, gate_epoch: 2 })
    expect(await world.getLease()).to.be.null
    await TH.unlock(there, 'pw three')
  })
})

describe("a vault that moves elsewhere while an unlock is under way", () => {
  it("deleted and made anew: the unlock takes up nothing, throws 'vault_remade', and can't seal into the new vault", async () => {
    const world = makeRacingWorld()
    // Deaf, so the deletion is not heard before the remake.
    const vault = await world.openUnlocked('pw one', { vaultDB: world.deafVaultDB() })
    await vault.lock()
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    const gate = world.holdNextDerive()
    const unlocking = TH.expectRefusal(TH.unlock(vault, 'pw one'), 'vault_remade')
    await gate.reached
    await TH.del(there, 'pw one')
    const reborn = await TH.bankOf(there).ensureVault({ user_id: 'u1', vaultlabel: 'main' })
    await TH.unlock(reborn, 'pw two')
    await reborn.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-new')
    // A read begun after the writes above brings in the new vault.
    await TH.expectBad(vault.tryRefresh(), 'vault_remade')
    gate.release()
    await unlocking
    expect(await world.getLease()).to.be.null
    await TH.expectRefusal(vault.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-stale'), 'vault_remade')
    expect(await reborn.getWhisper('anthropic')).to.eq('sk-ant-fake-new')
    const next = await TH.bankOf(vault).ensureVault({ user_id: 'u1', vaultlabel: 'main' })
    expect(TH.stateOf(next.getSnapshot())).to.eq('locked')
    await TH.unlock(next, 'pw two')
    expect(await next.getWhisper('anthropic')).to.eq('sk-ant-fake-new')
  })

  it("deleted and not remade: the unlock takes up nothing, throws 'vault_gone', and the Vault object is gone", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.lock()
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    const gate = world.holdNextDerive()
    const unlocking = TH.expectRefusal(TH.unlock(vault, 'pw one'), 'vault_gone')
    await gate.reached
    await TH.del(there, 'pw one')
    await TH.expectBad(vault.tryRefresh(), 'vault_gone')
    gate.release()
    await unlocking
    await TH.expectRefusal(vault.hello(), 'vault_gone')
    expect(await world.getLease()).to.be.null
  })

  it("its passphrase changed: the old passphrase, proven a moment too late, unlocks nothing and throws 'gate_moved'", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.lock()
    const there = await world.openUnlocked('pw one', { deviceDB: memoryDeviceDB() })
    const gate = world.holdNextDerive()
    const unlocking = TH.expectRefusal(TH.unlock(vault, 'pw one'), 'gate_moved')
    await gate.reached
    await TH.putWayin(there, 'pw one', 'pw two')
    await TH.readAfresh(vault)
    gate.release()
    await unlocking
    expect(TH.stateOf(vault.getSnapshot())).to.eq('locked')
    expect(await world.getLease()).to.be.null
    await TH.unlock(vault, 'pw two')
    expect(TH.stateOf(vault.getSnapshot())).to.eq('unlocked')
  })

  it("a refresh that brings back the same vault record, unchanged, does not defeat the unlock", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw one')
    await vault.lock()
    const there = await world.openUnlocked('pw one', { deviceDB: memoryDeviceDB() })
    const gate = world.holdNextDerive()
    const unlocking = TH.unlock(vault, 'pw one')
    await gate.reached
    await there.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake')
    await TH.wakeupAtNextTick()
    gate.release()
    await unlocking
    expect(TH.stateOf(vault.getSnapshot())).to.eq('unlocked')
    expect(await vault.getWhisper('anthropic')).to.eq('sk-ant-fake')
  })
})

/**
 * A world whose first unlock, once its gate is written, is held before it hears storage's answer:
 * storage holds the gate, and the unlock has yet to take it up. Its vault hears no change bells, so
 * only the test's own hellos read.
 */
const gatingWorld = async () => {
  const world = makeWorld()
  const deafDB = world.deafVaultDB()
  const vault = await world.open({ vaultDB: deafDB })
  const noting = TH.holdNextAnswer(deafDB, 'tryPutVaultRecord')
  return { world, vault, noting }
}

describe("a first unlock's gate, and a read while it is under way", () => {
  it("taken up by a read meanwhile, and still stored: the gate unlocks", async () => {
    const { world, vault, noting } = await gatingWorld()
    const unlocking = TH.unlock(vault, 'pw')
    await noting.reached
    await vault.hello({ staleMinutes: 0 })
    noting.release()
    await unlocking
    expect(TH.stateOf(vault.snapshot)).to.eq('unlocked')
    expect(await world.getLease()).to.not.be.null
  })
})

describe("a read that began before this device's own change to the ways in landed", () => {
  it("never puts the older vault record it read back over the change's: the vault stays unlocked under the new ways in", async () => {
    const world = makeWorld()
    const deaf = world.deafVaultDB()
    const vault = await world.openUnlocked('pw', { vaultDB: deaf })
    let listing: ReturnType<typeof TH.makeLatch> | undefined
    let reading: Promise<Vault> | undefined
    // The read starts as the change is about to write, and is held at its listing, the vault record
    // it read the older copy, while the change lands.
    TH.beforeNextCall(deaf, 'tryPutVaultRecord', async () => {
      listing = TH.holdNextCall(deaf, 'tryGetVault')
      reading = vault.hello({ staleMinutes: 0 })
      await listing.reached
    })
    await addLaptopPasskey(vault)
    expect(TH.cheatGetVaultEpoch(vault).gate_epoch).to.eq(2)
    listing?.release()
    await reading
    expect(TH.cheatGetVaultEpoch(vault).gate_epoch).to.eq(2)
    expect(vault.snapshot.gate?.passkey).to.not.be.null
    expect(TH.stateOf(vault.snapshot)).to.eq('unlocked')
    await vault.hello({ staleMinutes: 0 })
    expect(TH.stateOf(vault.snapshot)).to.eq('unlocked')
    expect(await world.getLease()).to.not.be.null
  })
})

describe("a change to the ways in whose vault moves elsewhere as the change lands", () => {
  it("deleted: the Vault object is gone, as the read found it, the change refuses vault_gone, and nothing is unlocked", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw one')
    const landed = TH.holdNextAnswer(world.vaultDB, 'tryPutVaultRecord')
    const changing = TH.putWayin(vault, 'pw one', 'pw two')
    await landed.reached
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.del(there, 'pw two')
    await TH.expectBad(vault.tryRefresh(), 'vault_gone')
    landed.release()
    // The change landed before the deletion, but the demand after the write finds the Vault object gone.
    await TH.expectRefusal(changing, 'vault_gone')
    expect(TH.stateOf(vault.snapshot)).to.not.eq('unlocked')
    await TH.expectRefusal(vault.hello(), 'vault_gone')
    expect(await world.stateOnOpen()).to.eq('novel')
  })

  it("deleted and made anew: the Vault object is gone as vault_remade, the change refuses so, and the bank's next shows the new one, locked, never the deleted one's ways in", async () => {
    const world = makeWorld()
    // Deaf, so the deletion is not heard before the remake.
    const deafDB = world.deafVaultDB()
    const vault = await world.openUnlocked('pw one', { vaultDB: deafDB })
    const landed = TH.holdNextAnswer(deafDB, 'tryPutVaultRecord')
    const changing = TH.putWayin(vault, 'pw one', 'pw two')
    await landed.reached
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.del(there, 'pw two')
    const reborn = await TH.bankOf(there).ensureVault({ user_id: 'u1', vaultlabel: 'main' })
    await TH.unlock(reborn, 'pw three')
    await TH.expectBad(vault.tryRefresh(), 'vault_remade')
    landed.release()
    // The change landed before the deletion, but the demand after the write finds the vault made anew.
    await TH.expectRefusal(changing, 'vault_remade')
    expect(TH.stateOf(vault.snapshot)).to.not.eq('unlocked')
    await TH.expectRefusal(vault.hello(), 'vault_remade')
    const next = await TH.bankOf(vault).ensureVault({ user_id: 'u1', vaultlabel: 'main' })
    expect(next.vault_tok).to.eq(reborn.vault_tok)
    expect(TH.stateOf(next.snapshot)).to.eq('locked')
    await TH.expectRefusal(TH.unlock(next, 'pw two'), 'wrong_passphrase')
  })
})

describe("a lock in another handle on this device", () => {
  it("leaves an unlock begun after it alone", async () => {
    const world = makeRacingWorld()
    const otherTab = await world.openUnlocked('pw one')
    const thisTab = await world.open()
    await otherTab.lock()
    // This tab hears of the lock at its next read: until then its lease is in force, and an unlock tries nothing.
    await thisTab.hello({ staleMinutes: 0 })
    expect(TH.stateOf(thisTab.getSnapshot())).to.eq('locked')
    await TH.unlock(thisTab, 'pw one')
    expect(TH.stateOf(thisTab.getSnapshot())).to.eq('unlocked')
    expect(await world.stateOnOpen()).to.eq('unlocked')
  })
})

// --

// == [Letting go and reborn vaults]: letting a Vault object go, rebornWorld, stale session, rebornUnheard

describe("letting a Vault object go", () => {
  it("a Vault object let go refuses everything thereafter as vault_gone", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    TH.closeVault(vault)
    await TH.expectRefusal(vault.getWhisper('anything'), 'vault_gone')
    await TH.expectRefusal(TH.unlock(vault, 'pw'), 'vault_gone')
  })

  it("an unlock under way when the bank lets the vault go takes nothing up, is granted no lease, and throws 'vault_gone'", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw')
    await vault.lock()
    const gate = world.holdNextDerive()
    const unlocking = TH.expectRefusal(TH.unlock(vault, 'pw'), 'vault_gone')
    await gate.reached
    TH.closeVault(vault)
    gate.release()
    await unlocking
    expect(await world.getLease()).to.be.null
    expect(await world.stateOnOpen()).to.eq('locked')
  })

  it("a let-go during the unlock's lease write erases nothing: letting go is not a lock, and the next birth takes the lease up", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw')
    await vault.lock()
    const gate = world.holdNextLease()
    const unlocking = TH.expectRefusal(TH.unlock(vault, 'pw'), 'vault_gone')
    await gate.reached
    TH.closeVault(vault)
    gate.release()
    await unlocking
    expect(await world.getLease()).to.not.be.null
    expect(await world.stateOnOpen()).to.eq('unlocked')
  })

  it("leaves a lease and the device record as they stood", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const recordBefore = await TH.expectGood(world.deviceDB.tryGetDeviceRecord(TH.scopeOf('u1')))
    TH.closeVault(vault)
    expect(await world.getLease()).to.not.be.null
    expect(await TH.expectingGood(world.deviceDB).tryGetDeviceRecord(TH.scopeOf('u1'))).to.deep.equal(recordBefore)
  })

  it("a second let-go does nothing: the storage watch is ended once", async () => {
    const world = makeWorld()
    const unsubscribes = vi.fn()
    const subscribe = world.vaultDB.subscribe.bind(world.vaultDB)
    vi.spyOn(world.vaultDB, 'subscribe').mockImplementation((...args) => {
      const unsubscribe = subscribe(...args)
      return () => { unsubscribes(); unsubscribe() }
    })
    const vault = await world.openUnlocked('pw')
    TH.closeVault(vault)
    TH.closeVault(vault)
    expect(unsubscribes.mock.calls).to.have.lengthOf(1)
    await TH.expectRefusal(vault.getWhisper('anything'), 'vault_gone')
  })

  it("letting go forgets nothing stored: the next birth still finds the vault", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    TH.closeVault(vault)
    const again = await world.open()
    expect(TH.stateOf(again.getSnapshot())).to.eq('unlocked')
    expect(await again.getWhisper('anthropic')).to.eq('sk-fake')
  })
})

// vaultOne's adapter hears no change bells, so it genuinely does not notice vaultTwo's doings
// until it next touches the backend: the stale-device scenario, miniaturized. The reborn vault
// has a new vault_tok and its own passphrase; vaultTwo is the bank's Vault object for it.
const rebornWorld = async () => {
  const world = makeWorld()
  const deafDB = world.deafVaultDB()
  const vaultOne = await world.openUnlocked('pw one', { vaultDB: deafDB })
  await vaultOne.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-old')
  const deleter = await world.open()
  await TH.del(deleter, 'pw one')
  const vaultTwo = await TH.bankOf(deleter).ensureVault(u1Main)
  await TH.unlock(vaultTwo, 'pw two')
  await vaultTwo.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-new')
  return { world, vaultOne, vaultTwo, deafDB }
}

describe("a stale session cannot reach into a vault reborn elsewhere", () => {
  it("putBox() is refused vault_gone at its read of the box, storage refusing the vault it names as vault_mismatch, instead of landing in the reborn vault; the Vault object is gone with it, every later call refusing vault_gone", async () => {
    const { vaultOne, vaultTwo } = await rebornWorld()
    expect(TH.stateOf(vaultOne.getSnapshot())).to.eq('unlocked')
    // The read's refusal lets the Vault object go, and the demand after it refuses as it finds it.
    await TH.expectRefusal(vaultOne.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-stale'), 'vault_gone')
    expect(await vaultTwo.getWhisper('anthropic')).to.eq('sk-ant-fake-new')
    await TH.expectRefusal(vaultOne.hello({ staleMinutes: 0 }), 'vault_gone')
    await TH.expectRefusal(vaultOne.getWhisper('anthropic'), 'vault_gone')
    expect(TH.bankOf(vaultOne).bankVaultOf(u1Main)?.lifecycle).to.eq('refused')
  })

  it("getWhisper() of a box the reborn vault wrote refuses as vault_gone at once, never damaged_box, reading no vault record; the Vault object is gone with it, and the next hello refuses vault_gone, reading nothing", async () => {
    const { vaultOne, deafDB } = await rebornWorld()
    expect(TH.stateOf(vaultOne.getSnapshot())).to.eq('unlocked')
    const getVaultRecord = vi.spyOn(deafDB, 'tryGetVault')
    const err = await TH.expectRefusal(vaultOne.getWhisper('anthropic'), 'vault_gone')
    expect(err.message).to.include('bank.ensureVault')
    expect(err.cause).to.have.property('refusalkind', 'vault_mismatch')
    expect(getVaultRecord).not.toHaveBeenCalled()
    expect(TH.stateOf(vaultOne.getSnapshot())).to.eq('locked')
    await TH.expectRefusal(vaultOne.hello(), 'vault_gone')
    expect(getVaultRecord).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it("getWhisper() of a box that will not open in a vault that has not moved names it damaged at once, reading no vault record", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const row = storedRowOf(world, 'anthropic')
    const wrapped = row['whisper_ciphered'] as { cipher_iv_b64: string, ciphertext_b64: string }
    world.dbStore.put(u1BoxScopepath('anthropic'), JSON.stringify({ ...row, whisper_ciphered: { ...wrapped, ciphertext_b64: TH.tweakB64(wrapped.ciphertext_b64) } }))
    await TH.wakeupAtNextTick()
    const getVaultRecord = vi.spyOn(world.vaultDB, 'tryGetVault')
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'damaged_box')
    expect(getVaultRecord).not.toHaveBeenCalled()
    expect(TH.stateOf(vault.getSnapshot())).to.eq('unlocked')
    vi.restoreAllMocks()
  })

  it("getWhisper() names a box that will not open damaged_box while storage's vault record is out of reach: it never reads it to decide", async () => {
    const world = makeWorld()
    const deafDB = world.deafVaultDB()
    const vault = await world.openUnlocked('pw', { vaultDB: deafDB })
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    const row = storedRowOf(world, 'anthropic')
    world.dbStore.put(u1BoxScopepath('anthropic'), JSON.stringify({ ...row, revision_tok: 'tampered' }))
    const down = new VaultError('storage_unavailable', 'The vault storage could not be reached.')
    const getVaultRecord = vi.spyOn(deafDB, 'tryGetVault').mockResolvedValue(bad(down))
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'damaged_box')
    expect(getVaultRecord).not.toHaveBeenCalled()
    expect(vault.getSnapshot().freshness).to.eq('timely')
    vi.restoreAllMocks()
  })

  it("putBox() of a box the reborn vault has never held is refused all the same", async () => {
    const { vaultOne, vaultTwo } = await rebornWorld()
    await TH.expectRefusal(vaultOne.putBox({ boxlabel: 'openai' }, 'sk-fake-stale'), 'vault_gone')
    expect(boxlabelsOf(vaultTwo)).to.deep.equal(['anthropic'])
  })

  it("delBox() is refused by storage as stale: the reborn vault keeps its box", async () => {
    const { vaultOne, vaultTwo } = await rebornWorld()
    expect(TH.stateOf(vaultOne.getSnapshot())).to.eq('unlocked')
    await TH.expectRefusal(vaultOne.delBox('anthropic'), 'stale_write')
    expect(await vaultTwo.getWhisper('anthropic')).to.eq('sk-ant-fake-new')
  })

  it("del() reads first, finds the vault made anew, and refuses vault_remade, deleting nothing: the reborn vault survives, and the bank's next Vault object deletes it", async () => {
    const { world, vaultOne, vaultTwo } = await rebornWorld()
    const delVault = vi.spyOn(world.vaultDB, 'tryDelVault')
    await TH.expectRefusal(TH.del(vaultOne, 'pw one'), 'vault_remade')
    expect(delVault).not.toHaveBeenCalled()
    expect(await vaultTwo.getWhisper('anthropic')).to.eq('sk-ant-fake-new')
    await TH.expectRefusal(vaultOne.hello({ staleMinutes: 0 }), 'vault_remade')
    const next = await TH.bankOf(vaultOne).ensureVault(u1Main)
    expect(next.vault_tok).to.eq(vaultTwo.vault_tok)
    await TH.del(next, 'pw two')
    expect(world.dbStore.scopepaths(), 'the tombstone, and nothing else').to.deep.equal([u1VaultScopepath])
  })

  it("del() aims at the vault seen when it was called, not one a change bell brings in while it runs", async () => {
    const world = makeWorld()
    const vaultOne = await world.openUnlocked('pw one')
    const vaultTwo = await world.open({ deviceDB: memoryDeviceDB(), vaultDB: world.deafVaultDB() })
    const delVault = vi.spyOn(world.vaultDB, 'tryDelVault')
    let reborn: Vault | null = null
    TH.beforeNextCall(world.vaultDB, 'tryDelVault', async () => {
      await TH.del(vaultTwo, 'pw one')
      // Let vaultOne's background refresh, rung by the deletion, find the vault deleted.
      await TH.wakeupAtNextTick()
      reborn = await TH.bankOf(vaultTwo).ensureVault(u1Main)
      await TH.unlock(reborn, 'pw two')
      await reborn.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-new')
    })
    // The refresh lets the Vault object go while its deletion is under way, which the call hears as vault_gone.
    await TH.expectRefusal(TH.del(vaultOne, 'pw one'), 'vault_gone')
    // The deletion, written once the vault is reborn, still expects the vault seen when it was called: storage refuses it as stale.
    await TH.eventually(() => delVault.mock.results.length > 0)
    await TH.expectBad(delVault.mock.results[0]?.value as Promise<Outcome<unknown>>, 'stale_write')
    expect(await (reborn as Vault | null)?.getWhisper('anthropic')).to.eq('sk-ant-fake-new')
  })

  it("putWayin() reads first, finds the vault made anew, and refuses vault_remade, never burying the reborn vault's ways in", async () => {
    const { vaultOne, vaultTwo } = await rebornWorld()
    await TH.expectRefusal(TH.putWayin(vaultOne, 'pw one', 'pw three'), 'vault_remade')
    await vaultTwo.lock()
    await TH.unlock(vaultTwo, 'pw two')
    expect(await vaultTwo.getWhisper('anthropic')).to.eq('sk-ant-fake-new')
  })

  it("an unlock reads first: the stale Vault object, locked, finds the vault made anew and refuses vault_remade, and the bank's next opens with the reborn vault's own passphrase", async () => {
    const { vaultOne } = await rebornWorld()
    // Unlocked, it would try nothing.
    await vaultOne.lock()
    await TH.expectRefusal(TH.unlock(vaultOne, 'pw two'), 'vault_remade')
    const next = await TH.bankOf(vaultOne).ensureVault(u1Main)
    await TH.unlock(next, 'pw two')
    expect(await next.getWhisper('anthropic')).to.eq('sk-ant-fake-new')
  })

  it("putBox() into a vault deleted elsewhere, and not remade, is refused, writing nothing; a hello finds it deleted, and the Vault object is gone", async () => {
    const world = makeWorld()
    const vaultOne = await world.openUnlocked('pw one', { vaultDB: world.deafVaultDB() })
    const vaultTwo = await world.open()
    await TH.del(vaultTwo, 'pw one')
    await TH.expectRefusal(vaultOne.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-stale'), 'vault_gone')
    await TH.expectRefusal(vaultOne.hello({ staleMinutes: 0 }), 'vault_gone')
    expect(world.dbStore.scopepaths(), 'the tombstone, and nothing else').to.deep.equal([u1VaultScopepath])
  })

  it("del() of a vault deleted elsewhere, and not remade, reads first and refuses vault_gone, deleting nothing; a hello finds the Vault object gone, and the bank's next life, novel, has nothing to delete", async () => {
    const world = makeWorld()
    const deafDB = world.deafVaultDB()
    const vaultOne = await world.openUnlocked('pw one', { vaultDB: deafDB })
    const vaultTwo = await world.open()
    await TH.del(vaultTwo, 'pw one')
    const delVault = vi.spyOn(deafDB, 'tryDelVault')
    await TH.expectRefusal(TH.del(vaultOne, 'pw one'), 'vault_gone')
    expect(delVault).not.toHaveBeenCalled()
    await TH.expectRefusal(vaultOne.hello({ staleMinutes: 0 }), 'vault_gone')
    const next = await TH.bankOf(vaultOne).ensureVault(u1Main)
    expect(TH.stateOf(next.getSnapshot())).to.eq('novel')
    await TH.expectRefusal(TH.del(next, 'pw'), 'absent_vault')
    expect(world.dbStore.scopepaths(), 'the tombstone, and nothing else').to.deep.equal([u1VaultScopepath])
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
  await here.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-old')
  const deleter = await world.open({ deviceDB: memoryDeviceDB() })
  await TH.del(deleter, 'pw one')
  const there = await TH.bankOf(deleter).ensureVault(u1Main)
  await TH.unlock(there, 'pw two')
  await there.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-new')
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
  const beforeNextWrite = (verb: 'putBox' | 'putVaultRecord', meanwhile: () => Promise<unknown>) => {
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
  waits.mock.calls.map(([_callback, delay = 0]) => delay).filter((delay) => delay < MinuteMillis)
)

describe("versioned updates: two devices writing at once", () => {
  let waits: ReturnType<typeof stillClock>
  beforeEach(() => { waits = stillClock() })
  // Mocks first: restoring the setTimeout spy after the real timers would put the fake one back.
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("a store over a box written meanwhile elsewhere is refused as stale once, without waiting or reading: nothing written, and a second store lands over theirs", async () => {
    const world = makeWorld()
    // Deaf to storage's change bells: only the test's own calls read.
    const hereDB = world.deafVaultDB()
    const here = await world.openUnlocked('shared pw', { vaultDB: hereDB })
    const there = await world.openUnlocked('shared pw', { deviceDB: memoryDeviceDB() })
    await here.putBox({ boxlabel: 'anthropic', sidecar: { note: 'first' } }, 'sk-ant-fake-one')
    TH.beforeNextCall(hereDB, 'tryPutBox', () => there.putBox({ boxlabel: 'anthropic', sidecar: { note: 'theirs' } }, 'sk-ant-fake-theirs'))
    const putBox = vi.spyOn(hereDB, 'tryPutBox')
    const reads = vi.spyOn(hereDB, 'tryGetVault')
    const err = await TH.expectRefusal(here.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-mine'), 'stale_write')
    expect(err.message).to.match(/^That box changed in storage since this call read it -- another call, here or on another device, wrote or removed it -- so this write was refused and nothing was written\./)
    // A boxlabel is never quoted: a host's check may admit any text, a mistaken paste among it.
    expect(err.message).to.not.include('anthropic')
    expect(putBox).toHaveBeenCalledTimes(1)
    expect(reads).not.toHaveBeenCalled()
    expect(delaysAsked(waits)).to.have.lengthOf(0)
    const theirRevision = storedRowOf(world, 'anthropic')['revision_tok']
    expect(err.meta?.box_stored).to.deep.include({ revision_tok: theirRevision, sidecar: { note: 'theirs' } })
    expect(TH.stateOf(here.getSnapshot())).to.eq('unlocked')
    expect(await there.getWhisper('anthropic')).to.eq('sk-ant-fake-theirs')
    await here.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-mine')
    expect(putBox).toHaveBeenCalledTimes(2)
    expect(putBox.mock.calls[1]?.[1].revision_tok).to.eq(theirRevision)
    expect(await there.getWhisper('anthropic')).to.eq('sk-ant-fake-mine')
  })

  it("a store refused as stale carries storage's word on what won as meta.box_stored: the box, whole, as storage holds it", async () => {
    const { world, hereDB, here, there, beforeNextWrite } = await twoDeviceWorld()
    beforeNextWrite('putBox', () => there.putBox({ boxlabel: 'anthropic', sidecar: { note: 'theirs' } }, 'sk-ant-fake-theirs'))
    const putBox = vi.spyOn(hereDB, 'tryPutBox')
    const err = await TH.expectRefusal(here.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-mine'), 'stale_write')
    expect(putBox).toHaveBeenCalledTimes(1)
    expect(err.meta?.box_stored).to.deep.equal(storedRowOf(world, 'anthropic'))
  })

  it("a store whose box storage refuses as invalid_box is refused as storage said it, listing nothing: from a vault, which sealed the box, it is a bug", async () => {
    const { hereDB, here } = await twoDeviceWorld()
    const refused = new VaultError('invalid_box', 'Nothing was written: that box is not one this package builds.')
    vi.spyOn(hereDB, 'tryPutBox').mockResolvedValueOnce(bad(refused))
    const err = await TH.expectRefusal(here.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-mine'), 'invalid_box')
    expect(err).to.eq(refused)
    expect(here.getSnapshot().boxes).to.have.lengthOf(0)
  })

  it("a store whose box storage refuses as vault_mismatch is refused as stale_write, never as storage's own word", async () => {
    const { hereDB, here } = await twoDeviceWorld()
    vi.spyOn(hereDB, 'tryPutBox').mockResolvedValueOnce(bad(new VaultError('vault_mismatch', 'The vault changed.')))
    const err = await TH.expectRefusal(here.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-mine'), 'stale_write')
    expect(err.message).to.match(/^The vault was deleted, or deleted and made anew, on another device while this one was storing into it, so nothing was written\./)
    expect(err.cause).to.have.property('refusalkind', 'vault_mismatch')
    expect(TH.stateOf(here.getSnapshot())).to.eq('unlocked')
  })

  it("a store over a box deleted meanwhile elsewhere is refused as stale like any other: the box stays gone", async () => {
    const { hereDB, here, there, beforeNextWrite } = await twoDeviceWorld()
    await here.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-one')
    beforeNextWrite('putBox', () => there.delBox('anthropic'))
    const putBox = vi.spyOn(hereDB, 'tryPutBox')
    await TH.expectRefusal(here.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-mine'), 'stale_write')
    expect(putBox).toHaveBeenCalledTimes(1)
    expect(here.getSnapshot().boxes).to.have.lengthOf(0)
    expect(TH.stateOf(here.getSnapshot())).to.eq('unlocked')
    await TH.expectRefusal(there.getWhisper('anthropic'), 'absent_box')
  })

  it("a store of a box that did not exist, and is created meanwhile elsewhere, is refused as stale: theirs is kept", async () => {
    const { hereDB, here, there, beforeNextWrite } = await twoDeviceWorld()
    beforeNextWrite('putBox', () => there.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-theirs'))
    const putBox = vi.spyOn(hereDB, 'tryPutBox')
    await TH.expectRefusal(here.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-mine'), 'stale_write')
    expect(putBox).toHaveBeenCalledTimes(1)
    expect(boxlabelsOf(here)).to.deep.equal(['anthropic'])
    expect(await there.getWhisper('anthropic')).to.eq('sk-ant-fake-theirs')
  })

  it("a store over a damaged box, a sound one written over it meanwhile elsewhere, never deletes theirs: its write is refused as stale, and the next store writes over theirs", async () => {
    const { world, hereDB, here, there, beforeNextWrite } = await twoDeviceWorld()
    await here.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-one')
    world.dbStore.put(u1BoxScopepath('anthropic'), JSON.stringify({ ...storedRowOf(world, 'anthropic'), written_at: 'later' }))
    await TH.readAfresh(here)
    expect(here.getSnapshot().damagedBoxes[0]?.boxlabel).to.eq('anthropic')
    const theirs = { revisionTok: '' }
    beforeNextWrite('putBox', async () => {
      await there.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-theirs')
      theirs.revisionTok = String(storedRowOf(world, 'anthropic')['revision_tok'])
    })
    const delBox = vi.spyOn(hereDB, 'tryDelBox')
    const putBox = vi.spyOn(hereDB, 'tryPutBox')
    await TH.expectRefusal(here.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-mine'), 'stale_write')
    expect(delBox).not.toHaveBeenCalled()
    expect(putBox).toHaveBeenCalledTimes(1)
    expect(await there.getWhisper('anthropic')).to.eq('sk-ant-fake-theirs')
    await here.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-mine')
    expect(putBox.mock.calls[1]?.[1].revision_tok).to.eq(theirs.revisionTok)
    expect(await there.getWhisper('anthropic')).to.eq('sk-ant-fake-mine')
  })

  it("a store over a damaged box its listing does not show yet writes over none, refused as stale; once a hello lists it, the next store writes over its revision", async () => {
    const { world, hereDB, here, there } = await twoDeviceWorld()
    await here.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-one')
    // A listing gone stale: storage holds a damaged record the snapshot does not show.
    const getVault = hereDB.tryGetVault.bind(hereDB)
    const listBoxes = vi.spyOn(hereDB, 'tryGetVault').mockImplementation(async (...args) => {
      const read = valOf(await getVault(...args))
      return good(read === null ? null : { ...read, boxes: [], damagedBoxes: [] })
    })
    world.dbStore.put(u1BoxScopepath('anthropic'), JSON.stringify({ ...storedRowOf(world, 'anthropic'), written_at: 'later' }))
    await TH.readAfresh(here)
    expect(here.getSnapshot().boxes).to.have.lengthOf(0)
    expect(here.getSnapshot().damagedBoxes).to.have.lengthOf(0)
    listBoxes.mockRestore()
    const damagedRevision = storedRowOf(world, 'anthropic')['revision_tok']
    const delBox = vi.spyOn(hereDB, 'tryDelBox')
    const putBox = vi.spyOn(hereDB, 'tryPutBox')
    await TH.expectRefusal(here.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-mine'), 'stale_write')
    expect(putBox).toHaveBeenCalledTimes(1)
    expect(putBox.mock.calls[0]?.[1].revision_tok).to.be.null
    await here.hello({ staleMinutes: 0 })
    expect(here.getSnapshot().damagedBoxes[0]).to.deep.include({ damage: 'damaged', revision_tok: damagedRevision })
    await here.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-mine')
    expect(delBox).not.toHaveBeenCalled()
    expect(putBox.mock.calls[1]?.[1].revision_tok).to.eq(damagedRevision)
    expect(await there.getWhisper('anthropic')).to.eq('sk-ant-fake-mine')
  })

  it("a deletion refused as stale is thrown at once, never tried again, saying the vault it was in was deleted", async () => {
    const { hereDB, here, there } = await rebornUnheard()
    const delBox = vi.spyOn(hereDB, 'tryDelBox')
    const err = await TH.expectRefusal(here.delBox('anthropic'), 'stale_write')
    expect(err.message).to.match(/^The vault changed in storage since this device read it -- it was deleted, or deleted and made anew, elsewhere -- so this removal was refused/)
    // A boxlabel is never quoted: a host's check may admit any text, a mistaken paste among it.
    expect(err.message).to.not.include('anthropic')
    expect(delBox).toHaveBeenCalledTimes(1)
    expect(await there.getWhisper('anthropic')).to.eq('sk-ant-fake-new')
  })

  it("a deletion in a vault deleted elsewhere, and not made anew, is refused as stale by storage itself, the vault it was in gone", async () => {
    const world = makeWorld()
    const here = await world.openUnlocked('pw one', { vaultDB: world.deafVaultDB() })
    await here.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-old')
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.del(there, 'pw one')
    const getBox = vi.spyOn(world.vaultDB, 'tryGetBox')
    const err = await TH.expectRefusal(here.delBox('anthropic'), 'stale_write')
    expect(err.message).to.match(/it was deleted, or deleted and made anew, elsewhere/)
    expect(getBox).not.toHaveBeenCalled()
  })

  it("a deletion of a box another device deleted first is absent_box, as storage answers it, reading no box beforehand", async () => {
    const { world, hereDB, here, there } = await twoDeviceWorld()
    await here.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-one')
    TH.beforeNextCall(hereDB, 'tryDelBox', async () => { await there.delBox('anthropic') })
    const getBox = vi.spyOn(hereDB, 'tryGetBox')
    await TH.expectRefusal(here.delBox('anthropic'), 'absent_box')
    expect(getBox).not.toHaveBeenCalled()
    expect(world.dbStore.get(u1BoxScopepath('anthropic'))).to.be.null
  })

  it("a deletion names the revision its listing shows, and warns of nothing when that is what it deleted", async () => {
    const { world, hereDB, here } = await twoDeviceWorld()
    await here.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-one')
    const shown = here.getSnapshot().boxes[0]?.revision_tok
    const delBox = vi.spyOn(hereDB, 'tryDelBox')
    await here.delBox('anthropic')
    expect(delBox.mock.calls[0]?.[2]).to.deep.equal({ vault_tok: storedVaultRecordOf(world)['vault_tok'], revision_tok: shown })
    expect(world.logged.filter((heard) => heard.story?.['call'] === 'delBox')).to.have.lengthOf(0)
  })

  it("a deletion over a box written meanwhile elsewhere deletes theirs all the same, and warns that it was not the revision shown, naming neither", async () => {
    const { world, hereDB, here, there } = await twoDeviceWorld()
    await here.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-one')
    const shown = String(here.getSnapshot().boxes[0]?.revision_tok)
    const theirs = { revisionTok: '' }
    TH.beforeNextCall(hereDB, 'tryDelBox', async () => {
      await there.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-theirs')
      theirs.revisionTok = String(storedRowOf(world, 'anthropic')['revision_tok'])
    })
    await here.delBox('anthropic')
    expect(world.dbStore.get(u1BoxScopepath('anthropic'))).to.be.null
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
    await here.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-one')
    world.dbStore.put(u1BoxScopepath('anthropic'), '{"not": json')
    await Promise.all([TH.readAfresh(here), TH.readAfresh(there)])
    expect(here.getSnapshot().damagedBoxes).to.deep.equal([{ boxlabel: 'anthropic', revision_tok: null, damage: 'damaged' }])
    expect(there.getSnapshot().damagedBoxes).to.deep.equal([{ boxlabel: 'anthropic', revision_tok: null, damage: 'damaged' }])
    const theirs = { revisionTok: '' }
    TH.beforeNextCall(hereDB, 'tryDelBox', async () => {
      // A store over a box damaged beyond naming is refused, so theirs deletes it first.
      await there.delBox('anthropic')
      await there.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-theirs')
      theirs.revisionTok = String(storedRowOf(world, 'anthropic')['revision_tok'])
    })
    await here.delBox('anthropic')
    expect(world.dbStore.get(u1BoxScopepath('anthropic'))).to.be.null
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
    await here.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-one')
    world.dbStore.put(u1BoxScopepath('anthropic'), JSON.stringify({ ...storedRowOf(world, 'anthropic'), written_at: 'later' }))
    const damagedRevision = String(storedRowOf(world, 'anthropic')['revision_tok'])
    await Promise.all([TH.readAfresh(here), TH.readAfresh(there)])
    expect(here.getSnapshot().damagedBoxes).to.deep.equal([{ boxlabel: 'anthropic', revision_tok: damagedRevision, damage: 'damaged' }])
    expect(there.getSnapshot().damagedBoxes).to.deep.equal([{ boxlabel: 'anthropic', revision_tok: damagedRevision, damage: 'damaged' }])
    const theirs = { revisionTok: '' }
    TH.beforeNextCall(hereDB, 'tryDelBox', async () => {
      await there.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-theirs')
      theirs.revisionTok = String(storedRowOf(world, 'anthropic')['revision_tok'])
    })
    const delBox = vi.spyOn(hereDB, 'tryDelBox')
    await here.delBox('anthropic')
    expect(delBox.mock.calls[0]?.[2]).to.deep.include({ revision_tok: damagedRevision })
    expect(world.dbStore.get(u1BoxScopepath('anthropic'))).to.be.null
    const told = world.logged.filter((heard) => heard.story?.['call'] === 'delBox')
    expect(told).to.have.lengthOf(1)
    expect(told[0]).to.deep.include({ level: 'warn' })
    expect(told[0]?.message).to.match(/^The box this device showed was a damaged one/)
    expect(told[0]?.story).to.deep.include({ call: 'delBox', damaged: true })
    const text = TH.loggedText(told)
    for (const unsaid of [damagedRevision, theirs.revisionTok, 'anthropic', 'sk-ant-fake-one', 'sk-ant-fake-theirs']) { expect(text).to.not.include(unsaid) }
  })

  it("a passphrase change racing another device's is refused gate_moved once this device heard of it; theirs is kept", async () => {
    const { here, there, beforeNextWrite } = await twoDeviceWorld()
    await here.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-one')
    beforeNextWrite('putVaultRecord', async () => { await TH.putWayin(there, 'shared pw', 'their pw') })
    await TH.expectRefusal(TH.putWayin(here, 'shared pw', 'my pw'), 'gate_moved')
    expect(TH.stateOf(here.getSnapshot())).to.eq('locked')
    await TH.expectRefusal(TH.unlock(here, 'my pw'), 'wrong_passphrase')
    await TH.unlock(here, 'their pw')
    expect(await here.getWhisper('anthropic')).to.eq('sk-ant-fake-one')
  })

})

describe("the races the contract tests own, of a box write", () => {
  it("a whisper-left-out putBox() racing another device's write to the same box is refused stale_write, the other whisper kept: it was sealed over the revision it read", async () => {
    const { hereDB, here, there, beforeNextWrite } = await twoDeviceWorld()
    await here.putBox({ boxlabel: 'anthropic', sidecar: { note: 'mine' } }, 'sk-ant-fake-one')
    beforeNextWrite('putBox', () => there.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-theirs'))
    const putBox = vi.spyOn(hereDB, 'tryPutBox')
    await TH.expectRefusal(here.putBox({ boxlabel: 'anthropic', sidecar: { note: 'renamed' } }), 'stale_write')
    expect(putBox).toHaveBeenCalledTimes(1)
    expect(await there.getWhisper('anthropic')).to.eq('sk-ant-fake-theirs')
    expect(there.getSnapshot().boxes[0]?.sidecar).to.deep.equal({ note: 'mine' })
  })

  it("a renewal landing while a box write is in flight lets the write succeed, the listing taking the box", async () => {
    const { world, hereDB, here } = await twoDeviceWorld()
    const writing = TH.holdNextCall(hereDB, 'tryPutBox')
    const putting = here.putBox({ boxlabel: 'anthropic', sidecar: {} }, 'sk-ant-fake')
    await writing.reached
    world.advance(60_000)
    await TH.unlock(here, 'shared pw')
    writing.release()
    const box = await putting
    expect(box.boxlabel).to.eq('anthropic')
    expect(boxlabelsOf(here)).to.deep.equal(['anthropic'])
    expect(await here.getWhisper('anthropic')).to.eq('sk-ant-fake')
  })

  it("a passkey added on this device while a box write is in flight lets the write succeed, the box stamped with the new ways in", async () => {
    const { hereDB, here } = await twoDeviceWorld()
    const writing = TH.holdNextCall(hereDB, 'tryPutBox')
    const putting = here.putBox({ boxlabel: 'anthropic', sidecar: {} }, 'sk-ant-fake')
    await writing.reached
    await TH.putWayin(here, 'shared pw', await TH.passkeyOf('laptop'))
    writing.release()
    const box = await putting
    expect(box.gate_epoch).to.eq(TH.cheatGetVaultEpoch(here).gate_epoch)
    expect(boxlabelsOf(here)).to.deep.equal(['anthropic'])
    expect(await here.getWhisper('anthropic')).to.eq('sk-ant-fake')
  })
})

describe("refreshes, one at a time", () => {
  it("joins refreshes asked for while one runs: three rings at once cost one read, never two beside each other", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const getVault = world.vaultDB.tryGetVault.bind(world.vaultDB)
    const tally = { inFlight: 0, most: 0 }
    const reads = vi.spyOn(world.vaultDB, 'tryGetVault').mockImplementation(async (...args) => {
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
    for (const ii of [1, 2, 3]) { world.dbStore.put('elsewhere', String(ii)) }
    await vi.waitFor(() => { expect(reads).toHaveBeenCalledTimes(1) })
    await vi.waitFor(() => { expect(tally.inFlight).to.eq(0) })
    await TH.wakeupAtNextTick()
    expect(reads).toHaveBeenCalledTimes(1)
    expect(tally.most).to.eq(1)
    vi.restoreAllMocks()
    TH.closeVault(vault)
  })

  it("says freshness: 'refused' while the storage watch cannot read, warns once for the streak, and once when a read succeeds", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    expect(vault.getSnapshot().freshness).to.eq('timely')
    const sound = world.dbStore.get(u1VaultScopepath) ?? ''
    world.dbStore.put(u1VaultScopepath, '{"format":"safebyok-vault-v6"}')
    await TH.wakeupAtNextTick()
    for (const ii of [1, 2]) {
      world.dbStore.put('elsewhere', String(ii))
      await TH.wakeupAtNextTick()
    }
    expect(vault.getSnapshot().freshness).to.eq('refused')
    expect(TH.stateOf(vault.getSnapshot())).to.eq('unlocked')
    expect(world.logged.map((heard) => [heard.level, heard.story])).to.deep.equal([['warn', { call: 'refresh' }]])
    world.dbStore.put(u1VaultScopepath, sound)
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot().freshness).to.eq('timely')
    expect(world.logged.map((heard) => heard.level)).to.deep.equal(['warn', 'log'])
    expect(world.logged[1]?.message).to.match(/reads again/)
  })
})
// --

describe("the races the contract tests own, of a gate change", () => {
  it("a gate change racing another device's gate change refuses gate_moved, the other change kept", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const there = await world.open({ deviceDB: memoryDeviceDB(), vaultDB: world.deafVaultDB() })
    await TH.unlock(there, 'pw')
    const writing = TH.holdNextCall(world.vaultDB, 'tryPutVaultRecord')
    const changing = TH.putWayin(vault, 'pw', await TH.passkeyOf('laptop'))
    await writing.reached
    await TH.putWayin(there, 'pw', 'pw theirs')
    await vault.hello({ staleMinutes: 0 })
    writing.release()
    await TH.expectRefusal(changing, 'gate_moved')
    expect(storedWayinOf(world, 'passkey')).to.be.null
    const fresh = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.unlock(fresh, 'pw theirs')
    expect(TH.stateOf(fresh.snapshot)).to.eq('unlocked')
  })

  it("a gate change racing another device's that this device has not heard of is refused by storage as stale_write, the other change kept", async () => {
    const world = makeWorld()
    const deafDB = world.deafVaultDB()
    const vault = await world.openUnlocked('pw', { vaultDB: deafDB })
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.unlock(there, 'pw')
    const writing = TH.holdNextCall(deafDB, 'tryPutVaultRecord')
    const changing = TH.putWayin(vault, 'pw', await TH.passkeyOf('laptop'))
    await writing.reached
    await TH.putWayin(there, 'pw', 'pw theirs')
    writing.release()
    const err = await TH.expectRefusal(changing, 'stale_write')
    expect(err.meta).to.be.undefined
    expect(storedWayinOf(world, 'passkey')).to.be.null
  })

  it("a superseded passphrase proving a change refuses gate_moved, writing nothing: the passphrase was replaced elsewhere while it was proven", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw')
    const there = await world.open({ deviceDB: memoryDeviceDB(), vaultDB: world.deafVaultDB() })
    await TH.unlock(there, 'pw')
    const putVaultRecord = vi.spyOn(world.vaultDB, 'tryPutVaultRecord')
    const deriving = world.holdNextDerive()
    const changing = TH.putWayin(vault, 'pw', await TH.passkeyOf('laptop'))
    await deriving.reached
    await TH.putWayin(there, 'pw', 'pw theirs')
    await vault.hello({ staleMinutes: 0 })
    deriving.release()
    await TH.expectRefusal(changing, 'gate_moved')
    expect(putVaultRecord).not.toHaveBeenCalled()
    expect(storedWayinOf(world, 'passkey')).to.be.null
  })

  it("a stale device writing the gate of a vault made anew refuses vault_remade, the new vault's boxes untouched", async () => {
    const world = makeRacingWorld()
    const deafDB = world.deafVaultDB()
    const vault = await world.openUnlocked('pw', { vaultDB: deafDB })
    const deriving = world.holdNextDerive()
    const changing = TH.putWayin(vault, 'pw', 'pw two')
    await deriving.reached
    const there = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.del(there, 'pw')
    const reborn = await TH.bankOf(there).ensureVault(u1Main)
    await TH.unlock(reborn, 'pw three')
    await reborn.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-new')
    const before = storedRowOf(world, 'anthropic')
    deriving.release()
    await TH.expectRefusal(changing, 'vault_remade')
    expect(storedRowOf(world, 'anthropic')).to.deep.equal(before)
    expect(await reborn.getWhisper('anthropic')).to.eq('sk-ant-fake-new')
  })
})
