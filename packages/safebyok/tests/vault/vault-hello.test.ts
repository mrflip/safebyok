import { describe, it, expect, vi } from 'vitest'
import { VaultScope } from '../../src/types'
import { VaultError, isVaultError } from '../../src/errors'
import { memoryDeviceDB } from '../../src/device-db'
import { Vault } from '../../src/vault'
import { delDamagedVault, deviceTroubleAsConditions } from '../../src/del-damaged-vault'
import { bad } from '../../src/outcome'
import * as TH from '../test-helpers'
import { makeWorld, damagedVaultWorld, u1VaultPropsCkey } from './world'


// == [hello]: seedVault, hello

/** Makes the vault, with a box in it, and closes the handle: what a later open will find. */
const seedVault = async (world: ReturnType<typeof makeWorld>) => {
  const vault = await world.openUnlocked('pw')
  await vault.putBox('anthropic', 'sk-fake')
  vault.close()
}

describe("hello", () => {
  it("settles the snapshot into absent, locked or unlocked, as its first example shows", async () => {
    const world = makeWorld()
    const fresh = Vault.make(world.optsWith())
    await fresh.hello()
    expect(fresh.getSnapshot().state).to.eq('absent')
    await seedVault(world)
    const leased = Vault.make(world.optsWith())
    await leased.hello()
    expect(leased.getSnapshot().state).to.eq('unlocked')
    await leased.lock()
    const locked = Vault.make(world.optsWith())
    await locked.hello()
    expect(locked.getSnapshot().state).to.eq('locked')
  })

  it("is started by make and shared: make's hello and every call while it runs are one promise, and one read", async () => {
    const world = makeWorld()
    const reads = vi.spyOn(world.vaultDB, 'getVaultProps')
    const vault = Vault.make(world.optsWith())
    const first = vault.hello()
    expect(vault.hello()).to.eq(first)
    await first
    expect(reads).toHaveBeenCalledTimes(1)
  })

  it("has a call made before storage answered wait for it, then run as on a settled vault", async () => {
    const world = makeWorld()
    await seedVault(world)
    const gate = TH.holdNextCall(world.vaultDB, 'getVaultProps')
    const vault = Vault.make(world.optsWith())
    await gate.reached
    const reading = vault.getBox('anthropic')
    expect(vault.getSnapshot().state).to.eq('opening')
    gate.release()
    expect(await reading).to.eq('sk-fake')
  })

  it("is a no-op once settled: a later hello reads nothing", async () => {
    const world = makeWorld()
    const vault = await world.open()
    const reads = vi.spyOn(world.vaultDB, 'getVaultProps')
    const before = vault.getSnapshot()
    await vault.hello()
    expect(reads).not.toHaveBeenCalled()
    expect(vault.getSnapshot()).to.eq(before)
  })

  it("forgets a hello refused at once: the next reads afresh, and clears the trouble once it succeeds", async () => {
    const world = makeWorld()
    vi.spyOn(world.vaultDB, 'getVaultProps').mockResolvedValueOnce(bad(new VaultError('storage_unavailable', 'The vault storage could not be reached.')))
    const vault = Vault.make(world.optsWith())
    await TH.expectRefusal(vault.hello(), 'storage_unavailable')
    await vault.hello()
    expect(vault.getSnapshot()).to.deep.include({ state: 'absent', syncing: true, trouble: null })
  })

  it("shows why a vault is still opening, beside a retry that says hello again, as the trouble's example shows", async () => {
    const world = makeWorld()
    vi.spyOn(world.vaultDB, 'getVaultProps').mockResolvedValueOnce(bad(new VaultError('storage_unavailable', 'The vault storage could not be reached.')))
    const vault = Vault.make(world.optsWith())
    await TH.wakeupAtNextTick()
    const { state, trouble } = vault.getSnapshot()
    expect(state).to.eq('opening')
    expect(trouble?.refusalkind).to.eq('storage_unavailable')
    await vault.hello()
    expect(vault.getSnapshot()).to.deep.include({ state: 'absent', trouble: null })
  })

  it("has any other call try again first, once a hello was refused", async () => {
    const world = makeWorld()
    vi.spyOn(world.vaultDB, 'getVaultProps').mockResolvedValueOnce(bad(new VaultError('storage_unavailable', 'The vault storage could not be reached.')))
    const vault = Vault.make(world.optsWith())
    await TH.wakeupAtNextTick()
    await vault.unlock('pw')
    expect(vault.getSnapshot()).to.deep.include({ state: 'unlocked', trouble: null })
  })

  it("refuses a call as the hello it waited for was refused", async () => {
    const world = makeWorld()
    const refusal = new VaultError('not_permitted', 'Sign in to reach this vault.')
    vi.spyOn(world.vaultDB, 'getVaultProps').mockResolvedValue(bad(refusal))
    const vault = Vault.make(world.optsWith())
    expect(await TH.expectRefusal(vault.putBox('anthropic', 'sk-fake'), 'not_permitted')).to.eq(refusal)
    expect(await TH.expectRefusal(vault.del(), 'not_permitted')).to.eq(refusal)
  })

  it("clears a damaged vault and says hello again on the same handle, as its second example shows, and delDamagedVault's", async () => {
    const world = await damagedVaultWorld()
    const vault = Vault.make(world.optsWith())
    try { await vault.hello() } catch (err) {
      if (isVaultError(err, 'damaged_vault')) { await delDamagedVault(world.optsWith()); await vault.hello() }
    }
    expect(vault.getSnapshot()).to.deep.include({ state: 'absent', trouble: null })
  })

  it("reads afresh once a background refresh has failed, saying so as its trouble until a read succeeds", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const trouble = new VaultError('storage_unavailable', 'The vault storage could not be reached.')
    const reads = vi.spyOn(world.vaultDB, 'getVaultProps')
    reads.mockResolvedValueOnce(bad(trouble))
    world.dbStore.write('elsewhere', '{}')
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot()).to.deep.include({ state: 'unlocked', syncing: false, trouble })
    const readsBefore = reads.mock.calls.length
    await vault.hello()
    expect(reads.mock.calls.length).to.eq(readsBefore + 1)
    expect(vault.getSnapshot()).to.deep.include({ state: 'unlocked', syncing: true, trouble: null })
  })

  it("reads afresh once a refresh inside a call has failed", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.lock()
    const reads = vi.spyOn(world.vaultDB, 'getVaultProps')
    reads.mockResolvedValueOnce(bad(new VaultError('storage_unavailable', 'The vault storage could not be reached.')))
    await TH.expectRefusal(vault.unlock('pw'), 'storage_unavailable')
    expect(vault.getSnapshot()).to.deep.include({ state: 'locked', syncing: false })
    expect(vault.getSnapshot().trouble?.refusalkind).to.eq('storage_unavailable')
    const readsBefore = reads.mock.calls.length
    await vault.hello()
    expect(reads.mock.calls.length).to.eq(readsBefore + 1)
    expect(vault.getSnapshot().trouble).to.be.null
  })

  const UntrustedWriteCases = [
    ["identity_revoked",   'storage no longer serving the user'],
    ["rolled_back",        'storage saying the vault went back'],
    ["newer_format",       'storage holding the vault in a newer form'],
  ] as const

  for (const [kind, blurb] of UntrustedWriteCases) {
    it(`reads afresh once a write is refused as '${kind}': ${blurb}`, async () => {
      const world = makeWorld()
      const vault = await world.openUnlocked('pw')
      vi.spyOn(world.vaultDB, 'putBox').mockResolvedValueOnce(bad(new VaultError(kind, 'Storage cannot be trusted as it stands.')))
      await TH.expectRefusal(vault.putBox('anthropic', 'sk-fake'), kind)
      const reads = vi.spyOn(world.vaultDB, 'getVaultProps')
      await vault.hello()
      expect(reads).toHaveBeenCalledTimes(1)
    })
  }

  it("reads afresh once the vault is deleted", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.del()
    const reads = vi.spyOn(world.vaultDB, 'getVaultProps')
    await vault.hello()
    expect(reads).toHaveBeenCalledTimes(1)
    expect(vault.getSnapshot().state).to.eq('absent')
  })

  it("reads nothing anew after a lock or a stale write caught up with", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox('anthropic', 'sk-fake')
    vi.spyOn(world.vaultDB, 'putBox').mockResolvedValueOnce(bad(new VaultError('stale_write', 'Someone else wrote first.')))
    await TH.expectRefusal(vault.putBox('anthropic', 'sk-other'), 'stale_write')
    await vault.lock()
    const reads = vi.spyOn(world.vaultDB, 'getVaultProps')
    await vault.hello()
    expect(reads).not.toHaveBeenCalled()
  })

  it("refuses with kind 'vault_closed' after close(), as every later call does", async () => {
    const world = makeWorld()
    const vault = await world.open()
    vault.close()
    await TH.expectRefusal(vault.hello(), 'vault_closed')
    await TH.expectRefusal(vault.getBox('anthropic'), 'vault_closed')
  })

  it("never takes the state back to opening: a locked vault whose read fails stays locked, saying why", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.lock()
    vi.spyOn(world.vaultDB, 'getVaultProps').mockResolvedValueOnce(bad(new VaultError('storage_unavailable', 'The vault storage could not be reached.')))
    world.dbStore.write('elsewhere', '{}')
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(vault.getSnapshot().trouble?.refusalkind).to.eq('storage_unavailable')
  })

  it("keeps the snapshot's identity while nothing changes, and tells two refusals of one kind apart", async () => {
    const world = makeWorld()
    const vault = await world.open()
    const reads = vi.spyOn(world.vaultDB, 'getVaultProps')
    const first = new VaultError('storage_unavailable', 'The vault storage could not be reached.')
    const second = new VaultError('storage_unavailable', 'The vault storage could not be reached.')
    reads.mockResolvedValueOnce(bad(first)).mockResolvedValueOnce(bad(second))
    await TH.expectRefusal(vault.unlock('pw'), 'storage_unavailable')
    const once = vault.getSnapshot()
    expect(once.trouble).to.eq(first)
    await TH.expectRefusal(vault.hello(), 'storage_unavailable')
    expect(vault.getSnapshot()).to.not.eq(once)
    expect(vault.getSnapshot().trouble).to.eq(second)
    await vault.hello()
    const settled = vault.getSnapshot()
    await vault.hello()
    expect(vault.getSnapshot()).to.eq(settled)
  })

  it("lets lock() win at once, waiting for no hello: storage unreachable, and the lease being read is not taken up", async () => {
    const world = makeWorld()
    await seedVault(world)
    const gate = TH.holdNextCall(world.deviceDB, 'getLease')
    const vault = Vault.make(world.optsWith())
    await gate.reached
    await vault.lock()
    gate.release()
    await vault.hello()
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.getLease()).to.be.null
  })

  it("lets lock() and close() go while storage has not answered at all", async () => {
    const world = makeWorld()
    const gate = TH.holdNextCall(world.vaultDB, 'getVaultProps')
    const vault = Vault.make(world.optsWith())
    await gate.reached
    await vault.lock()
    expect(vault.getSnapshot().state).to.eq('opening')
    vault.close()
    gate.release()
    await TH.wakeupAtNextTick()
    expect(world.logged).to.have.lengthOf(0)
  })

  it("takes up no lease for a handle closed while its hello ran", async () => {
    const world = makeWorld()
    await seedVault(world)
    const gate = TH.holdNextCall(world.deviceDB, 'getLease')
    const vault = Vault.make(world.optsWith())
    await gate.reached
    vault.close()
    gate.release()
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot().state).to.not.eq('unlocked')
    expect(await world.getLease()).to.not.be.null
  })
})
// --

// == [Failed hello]: FailedOpenCases, a hello that fails

// Each arranges for one storage call during the open to fail, and hands back the error it planted
// (or a promise of it, for an arrangement that first seeds the vault).
const FailedOpenCases: readonly (readonly [string, (world: ReturnType<typeof makeWorld>) => unknown])[] = [
  ['storage refuses the first read, as for a user not yet signed in', (world) => {
    const refusal = new VaultError('not_permitted', 'Sign in to reach this vault.')
    vi.spyOn(world.vaultDB, 'getVaultProps').mockResolvedValueOnce(bad(refusal))
    return refusal
  }],
  ['storage cannot be reached for the first read', (world) => {
    const trouble = new VaultError('storage_unavailable', 'The vault storage could not be reached.')
    vi.spyOn(world.vaultDB, 'getVaultProps').mockResolvedValueOnce(bad(trouble))
    return trouble
  }],
  ['storage fails listing the boxes, after reading the vault props', async (world) => {
    await seedVault(world)
    const trouble = new VaultError('storage_unavailable', 'The vault storage could not be reached.')
    vi.spyOn(world.vaultDB, 'listBoxes').mockResolvedValueOnce(bad(trouble))
    return trouble
  }],
]

describe("a hello that fails", () => {
  for (const [blurb, arrange] of FailedOpenCases) {
    it(`rejects with the very error, which the snapshot keeps as its trouble, still opening, when ${blurb}`, async () => {
      const world = makeWorld()
      const planted = await arrange(world)
      const vault = Vault.make(world.optsWith())
      let refusal: unknown = null
      try {
        await vault.hello()
      } catch (err) {
        refusal = err
      }
      expect(refusal).to.eq(planted)
      expect(vault.getSnapshot()).to.deep.include({ state: 'opening', syncing: false, trouble: planted, boxes: [], wayins: [] })
    })
  }

  it("says the device's own store failing to read the lease as 'storage_unavailable', its error the cause, settling locked beside that trouble", async () => {
    const world = makeWorld()
    await seedVault(world)
    const trouble = new Error('device storage is unavailable')
    vi.spyOn(world.deviceDB, 'getLease').mockRejectedValueOnce(trouble)
    const vault = Vault.make(world.optsWith())
    const err = await TH.expectRefusal(vault.hello(), 'storage_unavailable')
    expect(err.cause).to.eq(trouble)
    expect(vault.getSnapshot()).to.deep.include({ state: 'locked', trouble: err })
  })

  it("says the device's own store failing to read its mark of the vault as 'storage_unavailable', its error the cause", async () => {
    const world = makeWorld()
    await seedVault(world)
    const trouble = new Error('device storage is unavailable')
    vi.spyOn(world.deviceDB, 'getMark').mockRejectedValueOnce(trouble)
    const err = await TH.expectRefusal(world.open(), 'storage_unavailable')
    expect(err.cause).to.eq(trouble)
  })

  it("says the device's own store failing as 'storage_unavailable' to any call, a lock's among them, even one that throws before its promise", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const trouble = new Error('device storage is unavailable')
    vi.spyOn(world.deviceDB, 'delLease').mockImplementationOnce(() => { throw trouble })
    const err = await TH.expectRefusal(vault.lock(), 'storage_unavailable')
    expect(err.cause).to.eq(trouble)
    expect(vault.getSnapshot().state).to.eq('locked')
  })

  const DeviceVerbCases = [
    // what each verb's failure says it was doing:
    ["getLease",   /reading the lease it keeps/,         'reading the lease'],
    ["putLease",   /writing the lease it keeps/,         'writing the lease'],
    ["delLease",   /erasing the lease it keeps/,         'erasing the lease'],
    ["getMark",    /reading its mark of this vault/,     "reading the device's mark"],
    ["putMark",    /writing its mark of this vault/,     "writing the device's mark"],
    ["delMark",    /erasing its mark of this vault/,     "erasing the device's mark"],
    ["delAll",     /erasing everything it keeps/,        'erasing everything'],
  ] as const

  for (const [verb, said, blurb] of DeviceVerbCases) {
    it(`says what failed, ${blurb}, as 'storage_unavailable', with what to do and its error the cause`, async () => {
      const deviceDB = memoryDeviceDB()
      const trouble = new Error('device storage is unavailable')
      vi.spyOn(deviceDB, verb).mockRejectedValueOnce(trouble)
      const wrapped = deviceTroubleAsConditions(deviceDB)
      const calling = verb === 'delAll' ? wrapped.delAll() : (wrapped[verb] as (scope: VaultScope) => Promise<unknown>)(TH.scopeOf('u1'))
      const err = await TH.expectRefusal(calling, 'storage_unavailable')
      expect(err.cause).to.eq(trouble)
      expect(err.message).to.match(said)
      expect(err.message).to.match(/try again/)
      expect(err.message).to.match(/private window/)
      expect(err.message).not.to.include('u1')
    })
  }

  const BlockedNameCases = [
    // what holds until something outside the app changes:
    ["SecurityError",        "storage_blocked",      'storage withheld from the page: site data blocked, a sandboxed frame'],
    ["QuotaExceededError",   "storage_blocked",      'no room: a quota of zero, as some private windows give, or a full disk'],
    ["NotSupportedError",    "storage_blocked",      'no IndexedDB at all'],
    // what may pass:
    ["InvalidStateError",    "storage_unavailable",  'a connection closing under the store'],
    ["UnknownError",         "storage_unavailable",  'a failure the browser gives no reason for'],
    ["AbortError",           "storage_unavailable",  'a transaction aborted'],
  ] as const

  for (const [errName, kind, blurb] of BlockedNameCases) {
    it(`says a device store's ${errName} as '${kind}': ${blurb}`, async () => {
      const deviceDB = memoryDeviceDB()
      const trouble = new DOMException('The browser refused.', errName)
      vi.spyOn(deviceDB, 'putMark').mockRejectedValueOnce(trouble)
      const err = await TH.expectRefusal(deviceTroubleAsConditions(deviceDB).putMark(TH.markOf('u1')), kind)
      expect(err.cause).to.eq(trouble)
      expect(err.message).to.match(/writing its mark of this vault/)
      expect(err.message).to.match(kind === 'storage_blocked' ? /will not help until that changes/ : /try again/)
    })
  }

  it("keeps a verb's own way forward in its 'storage_blocked' message: a lease that will not read leaves a passphrase or passkey", async () => {
    const deviceDB = memoryDeviceDB()
    vi.spyOn(deviceDB, 'getLease').mockRejectedValueOnce(new DOMException('The operation is insecure.', 'SecurityError'))
    const err = await TH.expectRefusal(deviceTroubleAsConditions(deviceDB).getLease(TH.scopeOf('u1')), 'storage_blocked')
    expect(err.message).to.match(/reading the lease it keeps/)
    expect(err.message).to.match(/will not help until that changes: unlock with a passphrase or passkey instead\./)
    expect(err.message).to.not.match(/try again/i)
  })

  it("keeps it in its 'storage_unavailable' message too, beside trying again", async () => {
    const deviceDB = memoryDeviceDB()
    vi.spyOn(deviceDB, 'getLease').mockRejectedValueOnce(new Error('device storage is unavailable'))
    const err = await TH.expectRefusal(deviceTroubleAsConditions(deviceDB).getLease(TH.scopeOf('u1')), 'storage_unavailable')
    expect(err.message).to.match(/try again, or unlock with a passphrase or passkey\./)
  })

  it("tells a blocked store by its error's name, so one from another frame, no instance of this one's Error, is told alike", async () => {
    const deviceDB = memoryDeviceDB()
    const trouble = { name: 'SecurityError', message: 'The operation is insecure.' }
    vi.spyOn(deviceDB, 'getLease').mockRejectedValueOnce(trouble)
    const err = await TH.expectRefusal(deviceTroubleAsConditions(deviceDB).getLease(TH.scopeOf('u1')), 'storage_blocked')
    expect(err.cause).to.eq(trouble)
  })

  it("refuses to open as 'storage_blocked' when the browser withholds the device's storage, without a word of retrying", async () => {
    const world = makeWorld()
    await seedVault(world)
    const trouble = new DOMException('The operation is insecure.', 'SecurityError')
    vi.spyOn(world.deviceDB, 'getMark').mockRejectedValue(trouble)
    const err = await TH.expectRefusal(world.open(), 'storage_blocked')
    expect(err.cause).to.eq(trouble)
    expect(err.message).to.not.match(/try again/i)
    expect(err.message).not.to.include('u1')
  })

  it("lets a refusal the device store gives as a VaultError through as it came", async () => {
    const world = makeWorld()
    await seedVault(world)
    const refusal = new VaultError('not_permitted', 'This device may not read its records.')
    vi.spyOn(world.deviceDB, 'getLease').mockRejectedValueOnce(refusal)
    expect(await TH.expectRefusal(world.open(), 'not_permitted')).to.eq(refusal)
  })

  it("says stored vault props that do not parse as damaged_vault, which the snapshot keeps as its trouble", async () => {
    const world = makeWorld()
    world.dbStore.write(u1VaultPropsCkey, '{"format":"safebyok-vault-v4"}')
    const vault = Vault.make(world.optsWith())
    const err = await TH.expectRefusal(vault.hello(), 'damaged_vault')
    expect(vault.getSnapshot().trouble).to.eq(err)
  })

  it("keeps its storage watch, so the vault settles of itself once storage relents and rings", async () => {
    const world = makeWorld()
    const reads = vi.spyOn(world.vaultDB, 'getVaultProps')
    reads.mockResolvedValueOnce(bad(new VaultError('not_permitted', 'Sign in to reach this vault.')))
    const vault = Vault.make(world.optsWith())
    await TH.expectRefusal(vault.hello(), 'not_permitted')
    // Any write rings the store's change bell, and the vault, not yet settled, says hello again.
    world.dbStore.write('elsewhere', '{}')
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot()).to.deep.include({ state: 'absent', syncing: true, trouble: null })
  })

  it("takes up this device's lease once a ring settles the vault, as a hello does", async () => {
    const world = makeWorld()
    await seedVault(world)
    const reads = vi.spyOn(world.vaultDB, 'getVaultProps')
    reads.mockResolvedValueOnce(bad(new VaultError('storage_unavailable', 'The vault storage could not be reached.')))
    const vault = Vault.make(world.optsWith())
    await TH.expectRefusal(vault.hello(), 'storage_unavailable')
    world.dbStore.write('elsewhere', '{}')
    await TH.wakeupAtNextTick()
    // The ring's hello, under way or done, is the one a call shares: no read of its own.
    const readsByRing = reads.mock.calls.length
    await vault.hello()
    expect(reads.mock.calls.length).to.eq(readsByRing)
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("ends its storage watch only when closed: a refused hello leaves the handle for the host to retry or close", async () => {
    const world = makeWorld()
    const tally = TH.tallyWatches(world.vaultDB)
    vi.spyOn(world.vaultDB, 'getVaultProps').mockResolvedValueOnce(bad(new VaultError('not_permitted', 'Sign in to reach this vault.')))
    const vault = Vault.make(world.optsWith())
    await TH.expectRefusal(vault.hello(), 'not_permitted')
    expect(tally).to.deep.equal({ opened: 1, closed: 0 })
    vault.close()
    expect(tally).to.deep.equal({ opened: 1, closed: 1 })
  })

  it("rejects nothing unheard: make's own hello, refused, is the logger's to tell, once, the refusal its error", async () => {
    const world = makeWorld()
    const refusal = new VaultError('not_permitted', 'Sign in to reach this vault.')
    vi.spyOn(world.vaultDB, 'getVaultProps').mockResolvedValueOnce(bad(refusal))
    const vault = Vault.make(world.optsWith())
    await TH.wakeupAtNextTick()
    expect(world.logged).to.have.lengthOf(1)
    expect(world.logged[0]).to.deep.include({ level: 'warn', story: { call: 'hello' }, err: refusal })
    expect(world.logged[0]?.message).to.match(/vault\.hello\(\) to try again/)
    expect(vault.getSnapshot().trouble).to.eq(refusal)
  })

  it("tells the logger nothing of make's hello refused once the handle is closed", async () => {
    const world = makeWorld()
    vi.spyOn(world.vaultDB, 'getVaultProps').mockResolvedValueOnce(bad(new VaultError('not_permitted', 'Sign in to reach this vault.')))
    const vault = Vault.make(world.optsWith())
    vault.close()
    await TH.wakeupAtNextTick()
    expect(world.logged).to.have.lengthOf(0)
  })
})
// --
