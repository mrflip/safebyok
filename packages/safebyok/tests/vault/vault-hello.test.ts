import { describe, it, expect, vi } from 'vitest'
import { VaultScope, StaleMinutes, MinuteMillis } from '../../src/types'
import { VaultError, isVaultError } from '../../src/errors'
import { deviceTroubleAsConditions, memoryDeviceDB } from '../../src/device-db'
import { localVaultDB } from '../../src/local-vault-db'
import { Vault } from '../../src/vault'
import { Lease } from '../../src/lease'
import { delDamagedVault } from '../../src/del-damaged-vault'
import { type Outcome, bad } from '../../src/outcome'
import * as TH from '../test-helpers'
import { makeWorld, makeRacingWorld, damagedVaultWorld, u1VaultPropsCkey, u1BoxCkey, storedRowOf, storedVaultPropsOf, storedWayinOf, boxlabelsOf, rolledBackWorld, HourMillis, SevenDaysMillis } from './world'


// == [hello]: seedVault, hello

/** Makes the vault, with a box in it, and closes the handle: what a later open will find. */
const seedVault = async (world: ReturnType<typeof makeWorld>) => {
  const vault = await world.openUnlocked('pw')
  await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
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

  it("is shared: hellos made while one runs wait on its one read, each resolving the vault", async () => {
    const world = makeWorld()
    const reads = vi.spyOn(world.vaultDB, 'getVault')
    const vault = Vault.make(world.optsWith())
    const [first, second] = await Promise.all([vault.hello(), vault.hello({ staleMinutes: 0 })])
    expect(first).to.eq(vault)
    expect(second).to.eq(vault)
    expect(reads).toHaveBeenCalledTimes(1)
  })

  it("has a call made before storage answered wait for it, then run as on a settled vault", async () => {
    const world = makeWorld()
    await seedVault(world)
    const gate = TH.holdNextCall(world.vaultDB, 'getVault')
    const vault = Vault.make(world.optsWith())
    const hello = vault.hello()
    await gate.reached
    const reading = vault.getWhisper('anthropic')
    expect(vault.getSnapshot().state).to.eq('opening')
    gate.release()
    expect(await reading).to.eq('sk-fake')
    expect(await hello).to.eq(vault)
  })

  it("is a no-op once settled: a later hello reads nothing", async () => {
    const world = makeWorld()
    const vault = await world.open()
    const reads = vi.spyOn(world.vaultDB, 'getVault')
    const before = vault.getSnapshot()
    await vault.hello()
    expect(reads).not.toHaveBeenCalled()
    expect(vault.getSnapshot()).to.eq(before)
  })

  it("forgets a hello refused at once: the next reads afresh, and clears the trouble once it succeeds", async () => {
    const world = makeWorld()
    vi.spyOn(world.vaultDB, 'getVault').mockResolvedValueOnce(bad(new VaultError('storage_unavailable', 'The vault storage could not be reached.')))
    const vault = Vault.make(world.optsWith())
    await TH.expectRefusal(vault.hello(), 'storage_unavailable')
    await vault.hello()
    expect(vault.getSnapshot()).to.deep.include({ state: 'absent', syncing: true, trouble: null })
  })

  it("leaves the vault opening when its first hello is refused, the refusal its caller's and no trouble, until a retry settles it", async () => {
    const world = makeWorld()
    vi.spyOn(world.vaultDB, 'getVault').mockResolvedValueOnce(bad(new VaultError('storage_unavailable', 'The vault storage could not be reached.')))
    const vault = Vault.make(world.optsWith())
    await TH.expectRefusal(vault.hello(), 'storage_unavailable')
    expect(vault.getSnapshot()).to.deep.include({ state: 'opening', syncing: false, trouble: null })
    await vault.hello()
    expect(vault.getSnapshot()).to.deep.include({ state: 'absent', syncing: true, trouble: null })
  })

  it("has any other call try again first, once a hello was refused", async () => {
    const world = makeWorld()
    vi.spyOn(world.vaultDB, 'getVault').mockResolvedValueOnce(bad(new VaultError('storage_unavailable', 'The vault storage could not be reached.')))
    const vault = Vault.make(world.optsWith())
    await TH.expectRefusal(vault.hello(), 'storage_unavailable')
    await vault.unlock('pw')
    expect(vault.getSnapshot()).to.deep.include({ state: 'unlocked', syncing: true })
  })

  it("refuses a call as the hello it waited for was refused", async () => {
    const world = makeWorld()
    const refusal = new VaultError('not_permitted', 'Sign in to reach this vault.')
    vi.spyOn(world.vaultDB, 'getVault').mockResolvedValue(bad(refusal))
    const vault = Vault.make(world.optsWith())
    expect(await TH.expectRefusal(vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake'), 'not_permitted')).to.eq(refusal)
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

  it("reads afresh once a background refresh has failed, saying syncing: false until a read succeeds, and nothing of it as trouble", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const reads = vi.spyOn(world.vaultDB, 'getVault')
    reads.mockResolvedValueOnce(bad(new VaultError('storage_unavailable', 'The vault storage could not be reached.')))
    world.dbStore.write('elsewhere', '{}')
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot()).to.deep.include({ state: 'unlocked', syncing: false, trouble: null })
    const readsBefore = reads.mock.calls.length
    await vault.hello()
    expect(reads.mock.calls.length).to.eq(readsBefore + 1)
    expect(vault.getSnapshot()).to.deep.include({ state: 'unlocked', syncing: true, trouble: null })
  })

  it("reads afresh once a refresh inside a call has failed", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.lock()
    const reads = vi.spyOn(world.vaultDB, 'getVault')
    reads.mockResolvedValueOnce(bad(new VaultError('storage_unavailable', 'The vault storage could not be reached.')))
    await TH.expectRefusal(vault.unlock('pw'), 'storage_unavailable')
    expect(vault.getSnapshot()).to.deep.include({ state: 'locked', syncing: false })
    const readsBefore = reads.mock.calls.length
    await vault.hello()
    expect(reads.mock.calls.length).to.eq(readsBefore + 1)
    expect(vault.getSnapshot().syncing).to.be.true
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
      await TH.expectRefusal(vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake'), kind)
      const reads = vi.spyOn(world.vaultDB, 'getVault')
      await vault.hello()
      expect(reads).toHaveBeenCalledTimes(1)
    })
  }

  it("shows the vault absent once del() lands, from the deletion itself: a hello within staleMinutes reads nothing", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.del()
    expect(vault.getSnapshot().state).to.eq('absent')
    const reads = vi.spyOn(world.vaultDB, 'getVault')
    await vault.hello()
    expect(reads).not.toHaveBeenCalled()
    expect(vault.getSnapshot().state).to.eq('absent')
  })

  it("reads nothing anew after a lock or a stale write caught up with", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    vi.spyOn(world.vaultDB, 'putBox').mockResolvedValueOnce(bad(new VaultError('stale_write', 'Someone else wrote first.')))
    await TH.expectRefusal(vault.putBox({ boxlabel: 'anthropic' }, 'sk-other'), 'stale_write')
    await vault.lock()
    const reads = vi.spyOn(world.vaultDB, 'getVault')
    await vault.hello()
    expect(reads).not.toHaveBeenCalled()
  })

  it("refuses with kind 'vault_closed' after close(), as every later call does", async () => {
    const world = makeWorld()
    const vault = await world.open()
    vault.close()
    await TH.expectRefusal(vault.hello(), 'vault_closed')
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'vault_closed')
  })

  it("never takes the state back to opening: a locked vault whose read fails stays locked, saying it is not syncing", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.lock()
    vi.spyOn(world.vaultDB, 'getVault').mockResolvedValueOnce(bad(new VaultError('storage_unavailable', 'The vault storage could not be reached.')))
    world.dbStore.write('elsewhere', '{}')
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot()).to.deep.include({ state: 'locked', syncing: false })
  })

  it("keeps the snapshot's identity while nothing changes, and tells two refusals of one kind apart", async () => {
    const world = makeWorld()
    const vault = await world.open()
    const reads = vi.spyOn(world.vaultDB, 'getVault')
    const first = new VaultError('identity_revoked', 'Sign in again to reach this vault.')
    const second = new VaultError('identity_revoked', 'Sign in again to reach this vault.')
    reads.mockResolvedValueOnce(bad(first)).mockResolvedValueOnce(bad(second))
    await TH.expectRefusal(vault.unlock('pw'), 'identity_revoked')
    const once = vault.getSnapshot()
    expect(once.trouble).to.eq(first)
    await TH.expectRefusal(vault.hello(), 'identity_revoked')
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
    const hello = vault.hello()
    await gate.reached
    await vault.lock()
    gate.release()
    await hello
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.getLease()).to.be.null
  })

  it("lets lock() and close() go while storage has not answered at all", async () => {
    const world = makeWorld()
    const gate = TH.holdNextCall(world.vaultDB, 'getVault')
    const vault = Vault.make(world.optsWith())
    const hello = vault.hello()
    await gate.reached
    await vault.lock()
    expect(vault.getSnapshot().state).to.eq('opening')
    vault.close()
    gate.release()
    await hello
    expect(world.logged).to.have.lengthOf(0)
  })

  it("takes up no lease for a handle closed while its hello ran", async () => {
    const world = makeWorld()
    await seedVault(world)
    const gate = TH.holdNextCall(world.deviceDB, 'getLease')
    const vault = Vault.make(world.optsWith())
    const hello = vault.hello()
    await gate.reached
    vault.close()
    gate.release()
    await hello
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
    vi.spyOn(world.vaultDB, 'getVault').mockResolvedValueOnce(bad(refusal))
    return refusal
  }],
  ['storage cannot be reached for the first read', (world) => {
    const trouble = new VaultError('storage_unavailable', 'The vault storage could not be reached.')
    vi.spyOn(world.vaultDB, 'getVault').mockResolvedValueOnce(bad(trouble))
    return trouble
  }],
  ['storage fails listing the boxes, after reading the vault props', async (world) => {
    await seedVault(world)
    const trouble = new VaultError('storage_unavailable', 'The vault storage could not be reached.')
    vi.spyOn(world.vaultDB, 'getVault').mockResolvedValueOnce(bad(trouble))
    return trouble
  }],
]

describe("a hello that fails", () => {
  for (const [blurb, arrange] of FailedOpenCases) {
    it(`rejects with the very error, the vault still opening and not syncing, its trouble none, when ${blurb}`, async () => {
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
      expect(vault.getSnapshot()).to.deep.include({ state: 'opening', syncing: false, trouble: null, boxes: [], passphrase: null, passkey: null })
    })
  }

  it("says the device's own store failing to read the lease as 'storage_unavailable', its error the cause, taking nothing from the read", async () => {
    const world = makeWorld()
    await seedVault(world)
    const trouble = new Error('device storage is unavailable')
    vi.spyOn(world.deviceDB, 'getLease').mockRejectedValueOnce(trouble)
    const vault = Vault.make(world.optsWith())
    const err = await TH.expectRefusal(vault.hello(), 'storage_unavailable')
    expect(err.cause).to.eq(trouble)
    expect(vault.getSnapshot()).to.deep.include({ state: 'opening', syncing: false, trouble: null })
    await vault.hello()
    expect(vault.getSnapshot()).to.deep.include({ state: 'unlocked', syncing: true })
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
      const calling = verb === 'delAll' ? wrapped.delAll() : (wrapped[verb] as (scope: VaultScope) => Promise<Outcome<unknown>>)(TH.scopeOf('u1'))
      const err = await TH.expectBad(calling, 'storage_unavailable')
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
      const err = await TH.expectBad(deviceTroubleAsConditions(deviceDB).putMark(TH.markOf('u1')), kind)
      expect(err.cause).to.eq(trouble)
      expect(err.message).to.match(/writing its mark of this vault/)
      expect(err.message).to.match(kind === 'storage_blocked' ? /will not help until that changes/ : /try again/)
    })
  }

  it("keeps a verb's own way forward in its 'storage_blocked' message: a lease that will not read leaves a passphrase or passkey", async () => {
    const deviceDB = memoryDeviceDB()
    vi.spyOn(deviceDB, 'getLease').mockRejectedValueOnce(new DOMException('The operation is insecure.', 'SecurityError'))
    const err = await TH.expectBad(deviceTroubleAsConditions(deviceDB).getLease(TH.scopeOf('u1')), 'storage_blocked')
    expect(err.message).to.match(/reading the lease it keeps/)
    expect(err.message).to.match(/will not help until that changes: unlock with a passphrase or passkey instead\./)
    expect(err.message).to.not.match(/try again/i)
  })

  it("keeps it in its 'storage_unavailable' message too, beside trying again", async () => {
    const deviceDB = memoryDeviceDB()
    vi.spyOn(deviceDB, 'getLease').mockRejectedValueOnce(new Error('device storage is unavailable'))
    const err = await TH.expectBad(deviceTroubleAsConditions(deviceDB).getLease(TH.scopeOf('u1')), 'storage_unavailable')
    expect(err.message).to.match(/try again, or unlock with a passphrase or passkey\./)
  })

  it("tells a blocked store by its error's name, so one from another frame, no instance of this one's Error, is told alike", async () => {
    const deviceDB = memoryDeviceDB()
    const trouble = { name: 'SecurityError', message: 'The operation is insecure.' }
    vi.spyOn(deviceDB, 'getLease').mockRejectedValueOnce(trouble)
    const err = await TH.expectBad(deviceTroubleAsConditions(deviceDB).getLease(TH.scopeOf('u1')), 'storage_blocked')
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
    world.dbStore.write(u1VaultPropsCkey, '{"format":"safebyok-vault-v6"}')
    const vault = Vault.make(world.optsWith())
    const err = await TH.expectRefusal(vault.hello(), 'damaged_vault')
    expect(vault.getSnapshot().trouble).to.eq(err)
  })

  it("keeps its storage watch, so the vault settles of itself once storage relents and rings", async () => {
    const world = makeWorld()
    const reads = vi.spyOn(world.vaultDB, 'getVault')
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
    const reads = vi.spyOn(world.vaultDB, 'getVault')
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
    vi.spyOn(world.vaultDB, 'getVault').mockResolvedValueOnce(bad(new VaultError('not_permitted', 'Sign in to reach this vault.')))
    const vault = Vault.make(world.optsWith())
    await TH.expectRefusal(vault.hello(), 'not_permitted')
    expect(tally).to.deep.equal({ opened: 1, closed: 0 })
    vault.close()
    expect(tally).to.deep.equal({ opened: 1, closed: 1 })
  })

  it("rejects nothing unheard: the refusal reaches the hello's caller, and the logger hears nothing of it", async () => {
    const world = makeWorld()
    const refusal = new VaultError('not_permitted', 'Sign in to reach this vault.')
    vi.spyOn(world.vaultDB, 'getVault').mockResolvedValueOnce(bad(refusal))
    const vault = Vault.make(world.optsWith())
    expect(await TH.expectRefusal(vault.hello(), 'not_permitted')).to.eq(refusal)
    expect(world.logged).to.have.lengthOf(0)
  })

  it("tells the logger nothing of a hello refused after the handle closed under it", async () => {
    const world = makeWorld()
    vi.spyOn(world.vaultDB, 'getVault').mockResolvedValueOnce(bad(new VaultError('not_permitted', 'Sign in to reach this vault.')))
    const vault = Vault.make(world.optsWith())
    const hello = vault.hello()
    vault.close()
    await TH.expectRefusal(hello, 'not_permitted')
    expect(world.logged).to.have.lengthOf(0)
  })
})
// --

// == [hello, by the Contract]: hello's Does, Guarantees, Returns and Refuses; staleMinutes

/** A world whose `u1` vault holds one box, `anthropic`, its stored sidecar gone: listed damaged. */
const damagedBoxWorld = async () => {
  const world = makeWorld()
  await seedVault(world)
  world.dbStore.write(u1BoxCkey('anthropic'), JSON.stringify({ ...storedRowOf(world, 'anthropic'), sidecar: undefined }))
  return world
}

/** A handler that keeps every piece of news it is told. */
const newsKeeper = () => {
  const told: VaultError[] = []
  return { told, onBadNews: (news: VaultError) => { told.push(news) } }
}

describe("vault.hello, by the Contract", () => {
  it("reads the vault props, the ways in and the box listing, once (Contract: vault.hello, Does 1)", async () => {
    const world = makeWorld()
    await seedVault(world)
    const propsReads = vi.spyOn(world.vaultDB, 'getVault')
    const listings = vi.spyOn(world.vaultDB, 'getVault')
    const vault = Vault.make(world.optsWith())
    await vault.hello()
    expect(propsReads).toHaveBeenCalledTimes(1)
    expect(listings).toHaveBeenCalledTimes(1)
    expect(vault.passphrase).to.not.be.null
    expect(boxlabelsOf(vault)).to.deep.equal(['anthropic'])
  })

  it("coalesces: hellos called while one is under way share its one read (Contract: vault.hello, Does 1)", async () => {
    const world = makeWorld()
    const gate = TH.holdNextCall(world.vaultDB, 'getVault')
    const propsReads = vi.spyOn(world.vaultDB, 'getVault')
    const vault = Vault.make(world.optsWith())
    const hellos = [vault.hello(), vault.hello(), vault.hello({ staleMinutes: 0 })]
    await gate.reached
    gate.release()
    expect(await Promise.all(hellos)).to.deep.equal([vault, vault, vault])
    expect(propsReads).toHaveBeenCalledTimes(1)
  })

  it("takes up this device's lease while it still fits, and not once it has run out (Contract: vault.hello, Does 2)", async () => {
    const world = makeWorld({ leaseHours: 1 })
    await seedVault(world)
    const leased = Vault.make(world.optsWith())
    await leased.hello()
    expect(leased.state).to.eq('unlocked')
    expect(leased.askPassphraseAt).to.eq(world.clock.now() + HourMillis)
    world.advance(HourMillis)
    const lapsed = Vault.make(world.optsWith())
    await lapsed.hello()
    expect(lapsed.state).to.eq('locked')
    expect(lapsed.askPassphraseAt).to.be.null
  })

  it("settles the state from those reads and publishes the snapshot, telling each subscriber (Contract: vault.hello, Does 3)", async () => {
    const world = makeWorld()
    const vault = Vault.make(world.optsWith())
    const opening = vault.getSnapshot()
    const heard: string[] = []
    vault.subscribe(() => { heard.push(vault.getSnapshot().state) })
    await vault.hello()
    expect(heard).to.deep.equal(['absent'])
    expect(vault.getSnapshot()).to.not.eq(opening)
    expect(opening.state).to.eq('opening')
  })

  it("reads nothing within staleMinutes, and only settles: a lease run out meanwhile shows as locked (Contract: vault.hello, staleMinutes)", async () => {
    const world = makeWorld({ leaseHours: 1 })
    const vault = await world.openUnlocked('pw')
    const propsReads = vi.spyOn(world.vaultDB, 'getVault')
    world.advance(HourMillis)
    await vault.hello({ staleMinutes: Infinity })
    expect(propsReads).not.toHaveBeenCalled()
    expect(vault.state).to.eq('locked')
  })

  it("takes its staleMinutes from make, five minutes by default (Contract: vault.hello, staleMinutes)", async () => {
    const world = makeWorld()
    const vault = await world.open()
    const propsReads = vi.spyOn(world.vaultDB, 'getVault')
    world.advance((5 * MinuteMillis) - 1)
    await vault.hello()
    expect(propsReads).toHaveBeenCalledTimes(0)
    world.advance(1)
    await vault.hello()
    expect(propsReads).toHaveBeenCalledTimes(1)
    const patient = await world.open({ staleMinutes: 10 })
    propsReads.mockClear()
    world.advance(9 * MinuteMillis)
    await patient.hello()
    expect(propsReads).toHaveBeenCalledTimes(0)
    world.advance(MinuteMillis)
    await patient.hello()
    expect(propsReads).toHaveBeenCalledTimes(1)
  })

  it("reads at once given staleMinutes: 0, as its fourth example shows (Contract: vault.hello, staleMinutes)", async () => {
    const world = makeWorld()
    const vault = await world.open()
    const propsReads = vi.spyOn(world.vaultDB, 'getVault')
    await vault.hello({ staleMinutes: 0 })   // read now, whatever was read a moment ago
    expect(propsReads).toHaveBeenCalledTimes(1)
  })

  it("says hello again when the page shows, reading what changed elsewhere, as its third example shows", async () => {
    const world = makeWorld()
    const vault = await world.open({ vaultDB: world.deafVaultDB() })
    const shown = new EventTarget()
    shown.addEventListener('visibilitychange', () => { void vault.tryHello() })
    await seedVault(world)
    world.advance(StaleMinutes * MinuteMillis)
    shown.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => { expect(vault.state).to.eq('locked') })
    expect(boxlabelsOf(vault)).to.deep.equal(['anthropic'])
    // The lease another tab granted is taken up at the next ensureLease, without a prompt.
    await vault.ensureLease()
    expect(vault.state).to.eq('unlocked')
  })

  const BadHelloOptsCases = [
    [{ staleMinute: 1 },        'a misspelt option'],
    [{ staleMinutes: -1 },      'minutes below zero'],
    [{ staleMinutes: 'soon' },  'minutes that are not a number'],
    [{ staleMinutes: NaN },     'minutes that are no number at all'],
    ['quickly',                 'options that are no bag'],
  ] as const

  for (const [helloOpts, blurb] of BadHelloOptsCases) {
    it(`refuses ${blurb} as 'bad_option', reading nothing`, async () => {
      const world = makeWorld()
      const vault = Vault.make(world.optsWith())
      const propsReads = vi.spyOn(world.vaultDB, 'getVault')
      await TH.expectRefusal(vault.hello(helloOpts as { staleMinutes?: number }), 'bad_option')
      expect(propsReads).not.toHaveBeenCalled()
      expect(vault.state).to.eq('opening')
    })
  }

  it("fills every field from the one read: the props, the ways in, the listing and the capacity agree (Contract: vault.hello, Guarantees)", async () => {
    const world = makeWorld()
    const writer = await world.openUnlocked('pw')
    await writer.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    await writer.putBox({ boxlabel: 'openai' }, 'sk-fake-too')
    const stored = storedVaultPropsOf(world)
    const vault = Vault.make(world.optsWith({ deviceDB: memoryDeviceDB() }))
    await vault.hello()
    expect(vault).to.deep.include({ vault_tok: stored['vault_tok'], registered_at: stored['registered_at'], gate_epoch: stored['gate_epoch'] })
    expect(vault.passphrase).to.deep.include({ device_id: storedWayinOf(world, 'passphrase')?.['device_id'], registered_at: storedWayinOf(world, 'passphrase')?.['registered_at'] })
    expect(vault.passkey).to.be.null
    expect(boxlabelsOf(vault)).to.deep.equal(['anthropic', 'openai'])
    expect(vault.capacity.boxes.used).to.eq(2)
  })

  it("never fails for a damaged box in the listing: it comes back flagged, and onBadNews is told (Contract: vault.hello, Guarantees)", async () => {
    const world = await damagedBoxWorld()
    const { told, onBadNews } = newsKeeper()
    const vault = Vault.make(world.optsWith({ onBadNews }))
    expect(await vault.hello()).to.eq(vault)
    expect(vault.boxes).to.deep.equal([{ boxlabel: 'anthropic', damaged: true, revision_tok: storedRowOf(world, 'anthropic')['revision_tok'] }])
    expect(told.map((news) => news.refusalkind)).to.deep.equal(['damaged_box'])
    expect(told[0]?.meta?.box_listed).to.eq(vault.boxes[0])
    expect(vault.trouble).to.eq(told[0])
  })

  it("resolves the vault itself, in each of the three states (Contract: vault.hello, Returns)", async () => {
    const world = makeWorld()
    const absent = Vault.make(world.optsWith())
    expect(await absent.hello()).to.eq(absent)
    expect(absent.state).to.eq('absent')
    await seedVault(world)
    const unlocked = Vault.make(world.optsWith())
    expect(await unlocked.hello()).to.eq(unlocked)
    expect(unlocked.state).to.eq('unlocked')
    await unlocked.lock()
    const locked = Vault.make(world.optsWith())
    expect(await locked.hello()).to.eq(locked)
    expect(locked.state).to.eq('locked')
  })

  it("refuses storage_unavailable to its caller, a condition never told to onBadNews (Contract: vault.hello, Refuses)", async () => {
    const world = makeWorld()
    const { told, onBadNews } = newsKeeper()
    const refusal = new VaultError('storage_unavailable', 'The vault storage could not be reached.')
    vi.spyOn(world.vaultDB, 'getVault').mockResolvedValueOnce(bad(refusal))
    const vault = Vault.make(world.optsWith({ onBadNews }))
    expect(await TH.expectRefusal(vault.hello(), 'storage_unavailable')).to.eq(refusal)
    expect(told).to.have.lengthOf(0)
    expect(vault.trouble).to.be.null
  })

  const SignInAgainCases = [
    ["identity_revoked",  true,   'told to onBadNews, as bad news'],
    ["not_permitted",     false,  'a condition, its caller\'s alone'],
  ] as const

  for (const [kind, isBadNews, blurb] of SignInAgainCases) {
    it(`refuses ${kind} to its caller, ${blurb} (Contract: vault.hello, Refuses)`, async () => {
      const world = makeWorld()
      const { told, onBadNews } = newsKeeper()
      const refusal = new VaultError(kind, 'Sign in to reach this vault.')
      vi.spyOn(world.vaultDB, 'getVault').mockResolvedValueOnce(bad(refusal))
      const vault = Vault.make(world.optsWith({ onBadNews }))
      expect(await TH.expectRefusal(vault.hello(), kind)).to.eq(refusal)
      expect(told).to.deep.equal(isBadNews ? [refusal] : [])
    })
  }

  it("refuses newer_format, a vault written by a newer safebyok, told to onBadNews and returned (Contract: vault.hello, Refuses)", async () => {
    const world = makeWorld()
    const { told, onBadNews } = newsKeeper()
    const refusal = new VaultError('newer_format', 'A newer safebyok wrote this vault: update the app.')
    vi.spyOn(world.vaultDB, 'getVault').mockResolvedValueOnce(bad(refusal))
    const vault = Vault.make(world.optsWith({ onBadNews }))
    expect(await TH.expectRefusal(vault.hello(), 'newer_format')).to.eq(refusal)
    expect(told).to.deep.equal([refusal])
    expect(vault.trouble).to.eq(refusal)
  })

  it("refuses damaged_vault, props that fail their checks, told to onBadNews and returned (Contract: vault.hello, Refuses)", async () => {
    const world = await damagedVaultWorld()
    const { told, onBadNews } = newsKeeper()
    const vault = Vault.make(world.optsWith({ onBadNews }))
    const err = await TH.expectRefusal(vault.hello(), 'damaged_vault')
    expect(err.family).to.eq('bad_news')
    expect(told).to.deep.equal([err])
    expect(vault.snapshot).to.deep.include({ state: 'opening', trouble: err })
  })

  it("refuses rolled_back, an older vault than this device has seen, forgetting the lease, told to onBadNews and returned (Contract: vault.hello, Refuses)", async () => {
    const { world, vault: seen, older } = await rolledBackWorld()
    seen.close()
    expect(await world.getLease()).to.not.be.null
    world.dbStore.write(u1VaultPropsCkey, older)
    const { told, onBadNews } = newsKeeper()
    const vault = Vault.make(world.optsWith({ onBadNews }))
    const err = await TH.expectRefusal(vault.hello(), 'rolled_back')
    expect(told).to.deep.equal([err])
    expect(await world.getLease()).to.be.null
    expect(vault.state).to.not.eq('unlocked')
  })
})
// --

// == [The handler]: onBadNews, trouble

describe("onBadNews, by the Contract", () => {
  it("is told the bad news before the call that met it settles (Contract: Vault.make, The handler)", async () => {
    const world = await damagedVaultWorld()
    let settled = false
    let toldBeforeSettling: boolean | null = null
    const vault = Vault.make(world.optsWith({ onBadNews: () => { toldBeforeSettling = ! settled } }))
    await TH.expectRefusal(vault.hello(), 'damaged_vault')
    settled = true
    expect(toldBeforeSettling).to.be.true
  })

  it("is told a refusal once, however many calls share it (Contract: Vault.make, The handler)", async () => {
    const world = await damagedVaultWorld()
    const { told, onBadNews } = newsKeeper()
    const vault = Vault.make(world.optsWith({ onBadNews }))
    const refusals = await Promise.all([TH.expectRefusal(vault.hello(), 'damaged_vault'), TH.expectRefusal(vault.getWhisper('anthropic'), 'damaged_vault'), TH.expectRefusal(vault.unlock('pw'), 'damaged_vault')])
    expect(new Set(refusals).size).to.eq(1)
    expect(told).to.deep.equal([refusals[0]])
  })

  it("is told a damaged box once, not again at each read that still lists it (Contract: Vault.make, The handler)", async () => {
    const world = await damagedBoxWorld()
    const { told, onBadNews } = newsKeeper()
    const vault = Vault.make(world.optsWith({ onBadNews }))
    await vault.hello()
    await vault.hello({ staleMinutes: 0 })
    expect(told).to.have.lengthOf(1)
    expect(vault.trouble).to.eq(told[0])
  })

  it("never hears a condition: stale_write, vault_full and storage_unavailable are their callers' alone (Contract: Vault.make, The handler)", async () => {
    const world = makeWorld({ maxBoxes: 1 })
    const { told, onBadNews } = newsKeeper()
    const vault = await world.openUnlocked('pw', { onBadNews })
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    await TH.expectRefusal(vault.putBox({ boxlabel: 'openai' }, 'sk-fake-too'), 'vault_full')
    vi.spyOn(world.vaultDB, 'putBox').mockResolvedValueOnce(bad(new VaultError('stale_write', 'Someone else wrote first.')))
    await TH.expectRefusal(vault.putBox({ boxlabel: 'anthropic' }, 'sk-other'), 'stale_write')
    vi.spyOn(world.vaultDB, 'getVault').mockResolvedValueOnce(bad(new VaultError('storage_unavailable', 'The vault storage could not be reached.')))
    await TH.expectRefusal(vault.hello({ staleMinutes: 0 }), 'storage_unavailable')
    expect(told).to.have.lengthOf(0)
    expect(vault.trouble).to.be.null
  })

  it("changes nothing the caller gets: a handler that throws still has the refusal reach its caller, family bad_news (Contract: Vault.make, The handler)", async () => {
    const world = await damagedVaultWorld()
    let heard: VaultError | null = null
    const vault = Vault.make(world.optsWith({ onBadNews: (news) => { heard = news; throw new Error('the handler broke') } }))
    const err = await TH.expectRefusal(vault.hello(), 'damaged_vault')
    expect(err).to.eq(heard)
    expect(err.family).to.eq('bad_news')
  })

  it("is never awaited: a handler that never settles holds no call up (Contract: Vault.make, The handler)", async () => {
    const world = await damagedVaultWorld()
    const vault = Vault.make(world.optsWith({ onBadNews: () => new Promise<void>(() => { /* never settles */ }) }))
    await TH.expectRefusal(vault.hello(), 'damaged_vault')
  })

  it("lands what the handler throws in trouble, as bad_option with the throw its cause, and tells the logger and the platform (Contract: Vault.make, The handler)", async () => {
    const reported: unknown[] = []
    vi.stubGlobal('reportError', (err: unknown) => { reported.push(err) })
    try {
      const world = await damagedVaultWorld()
      const thrown = new Error('the handler broke')
      const vault = Vault.make(world.optsWith({ onBadNews: () => { throw thrown } }))
      await TH.expectRefusal(vault.hello(), 'damaged_vault')
      expect(vault.trouble).to.deep.include({ refusalkind: 'bad_option', cause: thrown })
      expect(world.logged.map((heard) => [heard.level, heard.story, heard.err])).to.deep.equal([['error', { call: 'onBadNews' }, thrown]])
      expect(reported).to.deep.equal([thrown])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("lands what an async handler rejects with in trouble too, once it rejects (Contract: Vault.make, The handler)", async () => {
    const world = await damagedVaultWorld()
    const thrown = new Error('the handler broke later')
    const vault = Vault.make(world.optsWith({ onBadNews: () => Promise.reject(thrown) }))
    const err = await TH.expectRefusal(vault.hello(), 'damaged_vault')
    await vi.waitFor(() => { expect(vault.trouble).to.not.eq(err) })
    expect(vault.trouble).to.deep.include({ refusalkind: 'bad_option', cause: thrown })
  })

  it("is told the bad news a background read meets, with no call to hand it to", async () => {
    const world = makeWorld()
    const { told, onBadNews } = newsKeeper()
    await world.open({ onBadNews })
    world.dbStore.write(u1VaultPropsCkey, JSON.stringify({ format: 'safebyok-vault-v6', gate_epoch: 'one' }))
    await vi.waitFor(() => { expect(told.map((news) => news.refusalkind)).to.deep.equal(['damaged_vault']) })
  })

  it("names the damaged box, which the host may offer to remove, as trouble's example shows", async () => {
    const world = await damagedBoxWorld()
    const vault = Vault.make(world.optsWith())
    await vault.hello()
    const offered: (string | undefined)[] = []
    const offerToRemove = (boxlabel: string | undefined) => { offered.push(boxlabel) }
    const { trouble } = vault.getSnapshot()
    if (trouble?.refusalkind === 'damaged_box') { offerToRemove(trouble.meta?.box_listed?.boxlabel) }
    expect(offered).to.deep.equal(['anthropic'])
  })

  it("clears the trouble once a read finds nothing amiss", async () => {
    const world = await damagedBoxWorld()
    const vault = await world.openUnlocked('pw')
    expect(vault.trouble?.refusalkind).to.eq('damaged_box')
    await vault.delBox('anthropic')
    await vault.refresh()
    expect(vault.trouble).to.be.null
  })

  it("reports each news's kind, as onBadNews's example shows", async () => {
    const world = await damagedVaultWorld()
    const reports: string[] = []
    const telemetry = { report: (refusalkind: string) => { reports.push(refusalkind) } }
    const vault = Vault.make({ ...world.optsWith(), onBadNews: (news) => { telemetry.report(news.refusalkind) } })
    await TH.expectRefusal(vault.hello(), 'damaged_vault')
    expect(reports).to.deep.equal(['damaged_vault'])
  })
})
// --

// == [A take-up overtaken]: holdLeaseAfterRead, a lease take-up a key change overtakes

/** Holds this device's next read of its lease once the store has answered, until released. */
const holdLeaseAfterRead = (world: ReturnType<typeof makeWorld>) => {
  const gate = TH.makeGate()
  const read = world.deviceDB.getLease.bind(world.deviceDB)
  vi.spyOn(world.deviceDB, 'getLease').mockImplementationOnce(async (scope) => {
    const kept = await read(scope)
    await gate.pass()
    return kept
  })
  return gate
}

/** Holds this device's next write of its lease once the store has taken it, until released. */
const holdLeaseAfterWrite = (world: ReturnType<typeof makeWorld>) => {
  const gate = TH.makeGate()
  const write = world.deviceDB.putLease.bind(world.deviceDB)
  vi.spyOn(world.deviceDB, 'putLease').mockImplementationOnce(async (record) => {
    const written = await write(record)
    await gate.pass()
    return written
  })
  return gate
}

describe("a lease take-up a key change overtakes", () => {
  it("stays locked when a lock lands while a hello is taking up the lease", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    world.advance(StaleMinutes * MinuteMillis)
    const leaseRead = holdLeaseAfterRead(world)
    const hello = vault.hello()
    await leaseRead.reached
    await vault.lock()
    leaseRead.release()
    await hello
    expect(vault.state).to.eq('locked')
    expect(vault.askPassphraseAt).to.be.null
    expect(await world.getLease()).to.be.null
  })

  it("keeps a fresher unlock's lease when a hello's take-up of the older one finishes after it", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw')
    const older = vault.askPassphraseAt
    world.advance(StaleMinutes * MinuteMillis)
    const deriving = world.holdNextDerive()
    const unlocking = vault.unlock('pw')
    await deriving.reached
    const leaseRead = holdLeaseAfterRead(world)
    // The unlock's own read is a moment old: a hello within staleMinutes of it would read nothing.
    const hello = vault.hello({ staleMinutes: 0 })
    await leaseRead.reached
    deriving.release()
    await unlocking
    const fresher = vault.askPassphraseAt
    expect(fresher).to.eq(world.clock.now() + SevenDaysMillis)
    leaseRead.release()
    await hello
    expect(vault.askPassphraseAt).to.eq(fresher).and.to.not.eq(older)
    const standing = await world.getLease()
    expect(standing?.ask_passphrase_at).to.eq(fresher)
  })

  it("keeps a fresher unlock's lease when a hello's take-up discards the run-out one while it is written", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw')
    world.advance(SevenDaysMillis + (StaleMinutes * MinuteMillis))
    const deriving = world.holdNextDerive()
    const unlocking = vault.unlock('pw')
    await deriving.reached
    const leaseRead = holdLeaseAfterRead(world)
    const hello = vault.hello({ staleMinutes: 0 })
    await leaseRead.reached
    const leaseWritten = holdLeaseAfterWrite(world)
    deriving.release()
    await leaseWritten.reached
    // The fresh lease is in the store; the take-up goes on with the run-out one it read.
    leaseRead.release()
    await hello
    leaseWritten.release()
    await unlocking
    expect(vault.state).to.eq('unlocked')
    const standing = await world.getLease()
    expect(standing?.ask_passphrase_at).to.eq(vault.askPassphraseAt).and.to.eq(world.clock.now() + SevenDaysMillis)
  })

  it("leaves the lease it read as it stood when the handle closes while a hello's take-up makes it", async () => {
    const world = makeWorld()
    const before = await world.openUnlocked('pw')
    before.close()
    const kept = await world.getLease()
    const vault = Vault.make(world.optsWith())
    vi.spyOn(Lease, 'make').mockImplementationOnce(() => {
      vault.close()
      throw new VaultError('corrupt_record', "A lease this test will not read.")
    })
    await vault.hello()
    expect(await world.getLease()).to.deep.equal(kept)
  })
})

/** Expect the lease this device's store still holds, granted before the vault moved on, never to open `vault`.
 * A read drops a lease from memory and erases nothing, and `ensureLease()` (with no `getProof` to
 * ask) finds it outdated, discards it, and refuses.
 */
const expectOutdatedLeaseRefused = async (world: ReturnType<typeof makeWorld>, vault: Vault) => {
  expect(await world.getLease()).to.not.be.null
  await TH.expectRefusal(vault.ensureLease(), 'vault_locked')
  expect(vault.state).to.eq('locked')
  expect(await world.getLease()).to.be.null
}

/** Hold the answer of the take-up's look at `world`'s device store: the first hello's second look, after its read's own, read now and answered once the test releases it. */
const holdTakeUpAnswer = (world: ReturnType<typeof makeWorld>) => {
  const answering = TH.makeGate()
  const getLease = world.deviceDB.getLease.bind(world.deviceDB)
  let leasesRead = 0
  vi.spyOn(world.deviceDB, 'getLease').mockImplementation(async (scope) => {
    leasesRead += 1
    const kept = await getLease(scope)
    if (leasesRead === 2) { await answering.pass() }
    return kept
  })
  return answering
}

/**
 * A world whose `u1` vault stands, made with `pw`, this device holding a lease of it, and a handle
 * opened anew on it (a reload) whose first hello is held as it takes that lease up, the lease read
 * and not yet answered: the test changes the vault elsewhere meanwhile, through `other`, a second
 * device, then calls `release`.
 */
const reloadHeldAtTakeUp = async () => {
  const world = makeWorld()
  const before = await world.openUnlocked('pw')
  before.close()
  const other = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
  const answering = holdTakeUpAnswer(world)
  const vault = Vault.make(world.optsWith())
  const hello = vault.hello()
  await answering.reached
  return { world, vault, hello, other, release: answering.release }
}

/** Expect `vault` locked, and this device's store holding no lease it would take up: `ensureLease()` (with no `getProof` to ask) refuses. */
const expectNoLeaseTakenUp = async (world: ReturnType<typeof makeWorld>, vault: Vault) => {
  await TH.expectRefusal(vault.ensureLease(), 'vault_locked')
  expect(vault.state).to.eq('locked')
  expect(await world.getLease()).to.be.null
}

describe("a revocation read while a key is being taken up: a take-up, an unlock, a change to the ways in", () => {
  it("stays locked when a take-up finishes while a refresh that has read a new epoch is still listing the boxes", async () => {
    const world = makeWorld()
    const before = await world.openUnlocked('pw')
    before.close()
    // Its own adapter over the same store, so that holding this device's listing holds no other's.
    const other = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB(), vaultDB: localVaultDB({ store: world.dbStore }) })
    const answering = holdTakeUpAnswer(world)
    const vault = Vault.make(world.optsWith())
    const hello = vault.hello()
    await answering.reached
    const listing = TH.holdNextCall(world.vaultDB, 'getVault')
    await other.putWayin('pw', 'pw-new')
    // The change bell's refresh has read epoch 2, and waits on the listing.
    await listing.reached
    answering.release()
    await hello
    listing.release()
    await TH.eventually(() => vault.gate_epoch === 2)
    expect(vault.state).to.eq('locked')
    await vault.hello({ staleMinutes: 0 })
    expect(vault.state).to.eq('locked')
    await expectOutdatedLeaseRefused(world, vault)
  })

  it("leaves a later change elsewhere standing over this device's own change to the ways in, read as it notes its own", async () => {
    const world = makeWorld()
    // A device that hears no change bells: its reads are the test's to make.
    const vault = await world.openUnlocked('pw', { vaultDB: world.deafVaultDB() })
    const other = await world.open({ deviceDB: memoryDeviceDB() })
    // The change's own read (two looks at the mark) passes; its note of the change, the third look, is held.
    const noting = TH.makeGate()
    const getMark = world.deviceDB.getMark.bind(world.deviceDB)
    let marksRead = 0
    vi.spyOn(world.deviceDB, 'getMark').mockImplementation(async (scope) => {
      marksRead += 1
      if (marksRead === 3) { await noting.pass() }
      return await getMark(scope)
    })
    const changing = vault.putWayin('pw', 'pw-two')
    await noting.reached
    await other.unlock('pw-two')
    await other.putWayin('pw-two', 'pw-three')
    await vault.hello({ staleMinutes: 0 })
    expect(vault.gate_epoch).to.eq(3)
    noting.release()
    await changing
    expect(vault.gate_epoch).to.eq(3)
    expect(vault.state).to.eq('locked')
  })

  it("leaves a change elsewhere standing over the vault this device just made, read as it notes its own", async () => {
    const world = makeWorld()
    const vault = await world.open({ vaultDB: world.deafVaultDB() })
    const other = await world.open({ deviceDB: memoryDeviceDB() })
    // The unlock's read of an absent vault and its look before the make pass; its note of the vault it made, the third look, is held.
    const noting = TH.makeGate()
    const getMark = world.deviceDB.getMark.bind(world.deviceDB)
    let marksRead = 0
    vi.spyOn(world.deviceDB, 'getMark').mockImplementation(async (scope) => {
      marksRead += 1
      if (marksRead === 3) { await noting.pass() }
      return await getMark(scope)
    })
    const making = vault.tryUnlock('pw')
    await noting.reached
    await other.unlock('pw')
    await other.putWayin('pw', 'pw-two')
    await vault.hello({ staleMinutes: 0 })
    expect(vault.gate_epoch).to.eq(2)
    noting.release()
    await TH.expectBad(making, 'gate_moved')
    expect(vault.gate_epoch).to.eq(2)
    expect(vault.state).to.eq('locked')
  })

  it("stays locked when an unlock proven against the old epoch finishes after a refresh has dropped the outdated lease", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw')
    const other = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB(), vaultDB: localVaultDB({ store: world.dbStore }) })
    const deriving = world.holdNextDerive()
    const unlocking = vault.tryUnlock('pw')
    await deriving.reached
    await other.putWayin('pw', 'pw-new')
    // The change bell's refresh reads epoch 2, and drops the lease from memory, erasing nothing.
    await TH.eventually(() => vault.gate_epoch === 2)
    expect(vault.state).to.eq('locked')
    deriving.release()
    await TH.expectBad(unlocking, 'gate_moved')
    await vault.hello({ staleMinutes: 0 })
    expect(vault.state).to.eq('locked')
    await expectOutdatedLeaseRefused(world, vault)
  })

  it("stays locked when the passphrase changes on another device while a hello takes up this device's lease", async () => {
    const { world, vault, hello, other, release } = await reloadHeldAtTakeUp()
    expect(vault.gate_epoch).to.eq(1)
    await other.putWayin('pw', 'pw-new')
    // The change bell's refresh brings the new epoch while the take-up's answer is held.
    await TH.eventually(() => vault.gate_epoch === 2)
    release()
    await hello
    expect(vault.state).to.eq('locked')
    expect(vault.askPassphraseAt).to.be.null
    await vault.hello({ staleMinutes: 0 })
    expect(vault.state).to.eq('locked')
    await expectNoLeaseTakenUp(world, vault)
  })

  it("stays locked when the vault is deleted and made anew on another device while a hello takes up this device's lease", async () => {
    const { world, vault, hello, other, release } = await reloadHeldAtTakeUp()
    const formerId = vault.vault_tok
    await other.del()
    const remaker = await world.openUnlocked('pw-new', { deviceDB: memoryDeviceDB() })
    // A box written once the remake's bells have settled rings a read of the new vault.
    await TH.wakeupAtNextTick()
    await remaker.putBox({ boxlabel: 'anthropic' }, 'sk-ant-fake-new')
    await TH.eventually(() => vault.vault_tok !== null && vault.vault_tok !== formerId)
    release()
    await hello
    expect(remaker.vault_tok).to.eq(vault.vault_tok)
    expect(vault.state).to.eq('locked')
    expect(vault.askPassphraseAt).to.be.null
    await vault.hello({ staleMinutes: 0 })
    expect(vault.state).to.eq('locked')
    await expectNoLeaseTakenUp(world, vault)
  })
})
// --

// == [Telling, in order]: the listing published first, an answer that is only a thenable

describe("onBadNews, as it is told", () => {
  it("sees the listing that told it: the vault shows the damaged box before the handler hears of it", async () => {
    const world = await damagedBoxWorld()
    const seen: string[][] = []
    const vault: Vault = Vault.make(world.optsWith({ onBadNews: () => { seen.push(boxlabelsOf(vault)) } }))
    await vault.hello()
    expect(seen).to.deep.equal([['anthropic']])
  })

  it("lands a rejection in trouble from an answer that is only a thenable, no Promise", async () => {
    const world = await damagedVaultWorld()
    const thrown = new Error('the handler broke, by a thenable')
    // eslint-disable-next-line unicorn/no-thenable -- the case under test is an answer that is a thenable and no Promise
    const thenable = { then: (_resolve: unknown, reject: (err: unknown) => void) => { reject(thrown) } }
    const vault = Vault.make(world.optsWith({ onBadNews: () => thenable as unknown as Promise<void> }))
    await TH.expectRefusal(vault.hello(), 'damaged_vault')
    await vi.waitFor(() => { expect(vault.trouble).to.deep.include({ refusalkind: 'bad_option', cause: thrown }) })
  })
})
// --
