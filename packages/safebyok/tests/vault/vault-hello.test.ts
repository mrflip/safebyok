import { describe, it, expect, vi } from 'vitest'
import { VaultScope, StaleMinutes } from '../../src/types/types'
import { MinuteMillis } from '../../src/consts'
import { VaultError, isVaultError } from '../../src/errors'
import { deviceTroubleAsConditions, memoryDeviceDB } from '../../src/device-db'
import { localVaultDB } from '../../src/local-vault-db'
import { Bank } from '../../src/bank'
import { type Vault } from '../../src/vault'
import { delDamagedVault } from '../../src/del-damaged-vault'
import { type Outcome, bad } from '../../src/outcome'
import * as TH from '../test-helpers'
import { makeWorld, makeRacingWorld, damagedVaultWorld, u1VaultScopepath, u1BoxScopepath, storedRowOf, storedVaultPropsOf, storedWayinOf, boxlabelsOf, addLaptopPasskey, HourMillis, SevenDaysMillis } from './world'


// == [hello]: u1Main, bankIn, seedVault, unreachable, recordEpochIn, hello

/** The vault every world here births: `u1`'s `main`. */
const u1Main = { user_id: 'u1', vaultlabel: 'main' } as const

/** A bank of `world`'s options, `overrides` among them, for a test that asks it for a vault itself. */
const bankIn = (world: ReturnType<typeof makeWorld>, overrides?: Partial<TH.BornVaultOpts>) => {
  const { user_id: _user_id, vaultlabel: _vaultlabel, ...bankOpts } = world.optsWith(overrides)
  return Bank.make(bankOpts)
}

/** Makes the vault, with a box in it, and lets it go: what a later birth will find, this device's lease among it. */
const seedVault = async (world: ReturnType<typeof makeWorld>) => {
  const vault = await world.openUnlocked('pw')
  await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
  TH.closeVault(vault)
}

/** A refusal of kind storage_unavailable, as an adapter says storage could not be reached. */
const unreachable = () => new VaultError('storage_unavailable', 'The vault storage could not be reached.')

/** The highest vault_epoch this device's record of `u1`'s vault holds, or null for no record. */
const recordEpochIn = async (world: ReturnType<typeof makeWorld>) => {
  const record = await TH.expectGood(world.deviceDB.getDeviceRecord(TH.scopeOf('u1')))
  return record?.highest_vault_epoch ?? null
}

describe("hello", () => {
  it("settles the snapshot into novel, locked or unlocked, as its first example shows", async () => {
    const world = makeWorld()
    const fresh = await world.open()
    await fresh.hello()
    expect(fresh.getSnapshot().state).to.eq('novel')
    await seedVault(world)
    const leased = await world.open()
    await leased.hello()
    expect(leased.getSnapshot().state).to.eq('unlocked')
    await leased.lock()
    const locked = await world.open()
    await locked.hello()
    expect(locked.getSnapshot().state).to.eq('locked')
  })

  it("is shared: hellos made while one reads wait on its one read, each resolving the vault", async () => {
    const world = makeWorld()
    const vault = await world.open()
    const reads = vi.spyOn(world.vaultDB, 'getVault')
    const [first, second] = await Promise.all([vault.hello({ staleMinutes: 0 }), vault.hello({ staleMinutes: 0 })])
    expect(first).to.eq(vault)
    expect(second).to.eq(vault)
    expect(reads).toHaveBeenCalledTimes(1)
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

  it("reads afresh after a refused hello, whatever the next one's staleMinutes, and shows the read timely once it succeeds", async () => {
    const world = makeWorld()
    const vault = await world.open()
    const reads = vi.spyOn(world.vaultDB, 'getVault').mockResolvedValueOnce(bad(unreachable()))
    await TH.expectRefusal(vault.hello({ staleMinutes: 0 }), 'storage_unavailable')
    await vault.hello()
    expect(reads).toHaveBeenCalledTimes(2)
    expect(vault.getSnapshot()).to.deep.include({ state: 'novel', freshness: 'timely', trouble: null })
  })

  it("leaves the vault as its last read left it when a hello is refused, the refusal its caller's and no trouble, its freshness refused until a retry reads", async () => {
    const world = makeWorld()
    await seedVault(world)
    const vault = await world.open()
    const before = vault.getSnapshot()
    vi.spyOn(world.vaultDB, 'getVault').mockResolvedValueOnce(bad(unreachable()))
    await TH.expectRefusal(vault.hello({ staleMinutes: 0 }), 'storage_unavailable')
    expect({ ...vault.getSnapshot(), freshness: 'timely' }).to.deep.equal(before)
    expect(vault.getSnapshot()).to.deep.include({ state: 'unlocked', freshness: 'refused', trouble: null })
    await vault.hello()
    expect(vault.getSnapshot()).to.deep.include({ state: 'unlocked', freshness: 'timely', trouble: null })
  })

  it("has any other call try again first, once a hello was refused", async () => {
    const world = makeWorld()
    const vault = await world.open()
    vi.spyOn(world.vaultDB, 'getVault').mockResolvedValueOnce(bad(unreachable()))
    await TH.expectRefusal(vault.hello({ staleMinutes: 0 }), 'storage_unavailable')
    await TH.unlock(vault, 'pw')
    expect(vault.getSnapshot()).to.deep.include({ state: 'unlocked', freshness: 'timely' })
  })

  it("refuses a call as the hello it says first was refused", async () => {
    const world = makeWorld()
    const vault = await world.open()
    const refusal = new VaultError('not_permitted', 'Sign in to reach this vault.')
    vi.spyOn(world.vaultDB, 'getVault').mockResolvedValue(bad(refusal))
    world.advance(StaleMinutes * MinuteMillis)
    expect(await TH.expectRefusal(vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake'), 'not_permitted')).to.eq(refusal)
    expect(await TH.expectRefusal(vault.ensureUnlocked(), 'not_permitted')).to.eq(refusal)
  })

  it("clears a damaged vault, and the bank births it anew, novel, as delDamagedVault's example shows", async () => {
    const world = await damagedVaultWorld()
    const bank = bankIn(world)
    const { ok, err } = await bank.tryEnsureVault(u1Main)
    if (! ok && isVaultError(err, 'damaged_vault')) {
      await delDamagedVault(world.optsWith())
    }
    const vault = await bank.ensureVault(u1Main)   // a new life, novel
    expect(vault.getSnapshot()).to.deep.include({ state: 'novel', trouble: null })
  })

  it("reads afresh once a background refresh has failed, its freshness refused until a read succeeds, and nothing of it as trouble", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const reads = vi.spyOn(world.vaultDB, 'getVault')
    reads.mockResolvedValueOnce(bad(unreachable()))
    world.dbStore.write('elsewhere', '{}')
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot()).to.deep.include({ state: 'unlocked', freshness: 'refused', trouble: null })
    const readsBefore = reads.mock.calls.length
    await vault.hello()
    expect(reads.mock.calls.length).to.eq(readsBefore + 1)
    expect(vault.getSnapshot()).to.deep.include({ state: 'unlocked', freshness: 'timely', trouble: null })
  })

  it("reads afresh once a refresh inside a call has failed", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.lock()
    const reads = vi.spyOn(world.vaultDB, 'getVault')
    reads.mockResolvedValueOnce(bad(unreachable()))
    await TH.expectRefusal(TH.unlock(vault, 'pw'), 'storage_unavailable')
    expect(vault.getSnapshot()).to.deep.include({ state: 'locked', freshness: 'refused' })
    const readsBefore = reads.mock.calls.length
    await vault.hello()
    expect(reads.mock.calls.length).to.eq(readsBefore + 1)
    expect(vault.getSnapshot().freshness).to.eq('timely')
  })

  const UntrustedWriteCases = [
    ["identity_revoked",   'storage no longer serving the user'],
    ["vault_behind",       'storage handing back an older copy than this device has seen'],
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

  it("refuses 'vault_gone' once del() lands, reading nothing: the Vault object went with the vault", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await TH.del(vault, 'pw')
    const reads = vi.spyOn(world.vaultDB, 'getVault')
    await TH.expectRefusal(vault.hello(), 'vault_gone')
    await TH.expectRefusal(vault.refresh(), 'vault_gone')
    expect(reads).not.toHaveBeenCalled()
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

  it("refuses with kind 'vault_gone' once the bank lets the vault go, as every later call does", async () => {
    const world = makeWorld()
    const vault = await world.open()
    TH.closeVault(vault)
    await TH.expectRefusal(vault.hello(), 'vault_gone')
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'vault_gone')
  })

  it("keeps a locked vault locked when a background read fails, its freshness refused", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    await vault.lock()
    vi.spyOn(world.vaultDB, 'getVault').mockResolvedValueOnce(bad(unreachable()))
    world.dbStore.write('elsewhere', '{}')
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot()).to.deep.include({ state: 'locked', freshness: 'refused' })
  })

  it("keeps the snapshot's identity while nothing changes, and tells two refusals of one kind apart", async () => {
    const world = makeWorld()
    const vault = await world.open()
    const reads = vi.spyOn(world.vaultDB, 'getVault')
    const first = new VaultError('identity_revoked', 'Sign in again to reach this vault.')
    const second = new VaultError('identity_revoked', 'Sign in again to reach this vault.')
    reads.mockResolvedValueOnce(bad(first)).mockResolvedValueOnce(bad(second))
    await TH.expectRefusal(TH.unlock(vault, 'pw'), 'identity_revoked')
    // The unlock hears the lock as it lands, while the read that met the refusal is still
    // unwinding: a hello made before it has would share that read, and its refusal.
    await TH.wakeupAtNextTick()
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

  it("lets lock() win at once, waiting for no hello under way, whose read unlocks nothing", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const gate = TH.holdNextCall(world.deviceDB, 'getLease')
    const hello = vault.hello({ staleMinutes: 0 })
    await gate.reached
    await vault.lock()
    gate.release()
    await hello
    expect(vault.getSnapshot().state).to.eq('locked')
    expect(await world.getLease()).to.be.null
  })

  it("lets lock() and the bank's closeVault() go while a hello's read has not been answered at all", async () => {
    const world = makeWorld()
    const vault = await world.open()
    const gate = TH.holdNextCall(world.vaultDB, 'getVault')
    const hello = vault.tryHello({ staleMinutes: 0 })
    await gate.reached
    await vault.lock()
    expect(vault.getSnapshot().state).to.eq('novel')
    TH.closeVault(vault)
    gate.release()
    await TH.expectBad(hello, 'vault_gone')
    expect(world.logged).to.have.lengthOf(0)
  })

  it("takes nothing from a read answered once the bank let the vault go, and erases no lease", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const gate = TH.holdNextCall(world.deviceDB, 'getLease')
    const hello = vault.tryHello({ staleMinutes: 0 })
    await gate.reached
    TH.closeVault(vault)
    gate.release()
    await TH.expectBad(hello, 'vault_gone')
    expect(vault.getSnapshot().state).to.not.eq('unlocked')
    expect(await world.getLease()).to.not.be.null
  })
})
// --

// == [Freshness, the vault gone, the device record]: hello's freshness, a vault deleted or made anew, the record raised

describe("hello: freshness, the vault gone, and this device's record", () => {
  it("shows its freshness timely after a read, aged once staleMinutes pass, refused once a read fails, and timely again once one succeeds", async () => {
    const world = makeWorld()
    const vault = await world.open()
    expect(vault.getSnapshot().freshness).to.eq('timely')
    world.advance(StaleMinutes * MinuteMillis)
    // Reckoned as the snapshot is replaced: a hello that reads nothing replaces it.
    await vault.hello({ staleMinutes: Infinity })
    expect(vault.getSnapshot().freshness).to.eq('aged')
    vi.spyOn(world.vaultDB, 'getVault').mockResolvedValueOnce(bad(unreachable()))
    await TH.expectRefusal(vault.hello(), 'storage_unavailable')
    expect(vault.getSnapshot().freshness).to.eq('refused')
    await vault.hello()
    expect(vault.getSnapshot().freshness).to.eq('timely')
  })

  it("makes the Vault object gone when a refresh finds the vault deleted: it refuses 'vault_gone', as every later call does", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { vaultDB: world.deafVaultDB() })
    const other = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.del(other, 'pw')
    await TH.expectRefusal(vault.refresh(), 'vault_gone')
    await TH.expectRefusal(vault.hello({ staleMinutes: 0 }), 'vault_gone')
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'vault_gone')
    expect(vault.state).to.eq('locked')
    expect(TH.bankOf(vault).entryOf(u1Main)).to.deep.include({ status: 'refused', vault: null })
  })

  it("makes the Vault object gone when a refresh finds the vault deleted and made anew: it refuses 'vault_remade', as every later call does, and the bank births the new life", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw', { vaultDB: world.deafVaultDB() })
    const other = await world.open({ deviceDB: memoryDeviceDB() })
    await TH.del(other, 'pw')
    const remade = await TH.bankOf(other).ensureVault(u1Main)
    await TH.expectRefusal(vault.refresh(), 'vault_remade')
    await TH.expectRefusal(vault.hello({ staleMinutes: 0 }), 'vault_remade')
    await TH.expectRefusal(TH.unlock(vault, 'pw'), 'vault_remade')
    expect(TH.bankOf(vault).entryOf(u1Main)?.err?.refusalkind).to.eq('vault_remade')
    const reborn = await TH.bankOf(vault).ensureVault(u1Main)
    expect(reborn.getSnapshot()).to.deep.include({ state: 'novel', vault_tok: remade.vault_tok })
    expect(reborn.vault_tok).to.not.eq(vault.vault_tok)
  })

  it("raises this device's record of the vault to what it read", async () => {
    const world = makeWorld()
    const vault = await world.open({ vaultDB: world.deafVaultDB() })
    await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
    expect(await recordEpochIn(world)).to.eq(0)
    await vault.hello({ staleMinutes: 0 })
    expect(vault.gate_epoch).to.eq(1)
    expect(await recordEpochIn(world)).to.eq(1)
  })

  it("resolves all the same when the record will not rise, telling the logger, the device store's error the cause", async () => {
    const world = makeWorld()
    const vault = await world.open({ vaultDB: world.deafVaultDB() })
    await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
    const trouble = new Error('the device store broke: disk full')
    vi.spyOn(world.deviceDB, 'raiseDeviceRecord').mockRejectedValueOnce(trouble)
    expect(await vault.hello({ staleMinutes: 0 })).to.eq(vault)
    expect(vault.getSnapshot()).to.deep.include({ state: 'locked', gate_epoch: 1, freshness: 'timely' })
    expect(world.logged.map((heard) => [heard.level, heard.story])).to.deep.equal([['warn', { call: 'refresh' }]])
    expect(world.logged[0]?.err?.cause).to.eq(trouble)
    expect(await recordEpochIn(world)).to.eq(0)
  })
})
// --

// == [Failed hello]: callOf, FailedHelloCases, a hello that fails

/** Call `verb` of `deviceDB` on `u1`'s vault: a raise with a record, delAll with nothing, and the rest with the scope, which a mocked failure never reads. */
const callOf = (deviceDB: ReturnType<typeof memoryDeviceDB>, verb: keyof ReturnType<typeof memoryDeviceDB>): Promise<Outcome<unknown>> => {
  if (verb === 'delAll') { return deviceDB.delAll() }
  if (verb === 'raiseDeviceRecord') { return deviceDB.raiseDeviceRecord(TH.deviceRecordOf('u1')) }
  return (deviceDB[verb] as (scope: VaultScope) => Promise<Outcome<unknown>>)(TH.scopeOf('u1'))
}

// Each arranges for the next read of storage to fail, and hands back the error it planted (or a
// promise of it, for an arrangement that first seeds the vault).
const FailedHelloCases: readonly (readonly [string, (world: ReturnType<typeof makeWorld>) => unknown])[] = [
  ['storage refuses the read, as for a user signed out meanwhile', (world) => {
    const refusal = new VaultError('not_permitted', 'Sign in to reach this vault.')
    vi.spyOn(world.vaultDB, 'getVault').mockResolvedValueOnce(bad(refusal))
    return refusal
  }],
  ['storage cannot be reached for a vault that is novel', (world) => {
    const trouble = unreachable()
    vi.spyOn(world.vaultDB, 'getVault').mockResolvedValueOnce(bad(trouble))
    return trouble
  }],
  ['storage cannot be reached for a vault with a box and a lease', async (world) => {
    await seedVault(world)
    const trouble = unreachable()
    vi.spyOn(world.vaultDB, 'getVault').mockResolvedValueOnce(bad(trouble))
    return trouble
  }],
]

describe("a hello that fails", () => {
  for (const [blurb, arrange] of FailedHelloCases) {
    it(`rejects with the very error, the vault as its last read left it but for its freshness, refused, and its trouble none, when ${blurb}`, async () => {
      const world = makeWorld()
      const planted = await arrange(world)
      const vault = await world.open()
      const before = vault.getSnapshot()
      let refusal: unknown = null
      try {
        await vault.hello({ staleMinutes: 0 })
      } catch (err) {
        refusal = err
      }
      expect(refusal).to.eq(planted)
      expect({ ...vault.getSnapshot(), freshness: 'timely' }).to.deep.equal(before)
      expect(vault.getSnapshot()).to.deep.include({ freshness: 'refused', trouble: null })
    })
  }

  it("says the device's own store failing to read the lease as 'storage_unavailable', its error the cause, taking nothing from the read", async () => {
    const world = makeWorld()
    await seedVault(world)
    const vault = await world.open()
    const before = vault.getSnapshot()
    const trouble = new Error('device storage is unavailable')
    vi.spyOn(world.deviceDB, 'getLease').mockRejectedValueOnce(trouble)
    const err = await TH.expectRefusal(vault.hello({ staleMinutes: 0 }), 'storage_unavailable')
    expect(err.cause).to.eq(trouble)
    expect({ ...vault.getSnapshot(), freshness: 'timely' }).to.deep.equal(before)
    await vault.hello()
    expect(vault.getSnapshot()).to.deep.include({ state: 'unlocked', freshness: 'timely' })
  })

  it("says the device's own store failing to read its record of the vault as 'storage_unavailable', its error the cause", async () => {
    const world = makeWorld()
    await seedVault(world)
    const trouble = new Error('device storage is unavailable')
    vi.spyOn(world.deviceDB, 'getDeviceRecord').mockRejectedValueOnce(trouble)
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
    ["getLease",            /reading the lease it keeps/,              'reading the lease'],
    ["putLease",            /writing the lease it keeps/,              'writing the lease'],
    ["delLease",            /erasing the lease it keeps/,              'erasing the lease'],
    ["getDeviceRecord",     /reading its record of this vault/,        "reading the device's record"],
    ["raiseDeviceRecord",   /writing its record of this vault/,        "raising the device's record"],
    ["delDeviceRecord",     /erasing its record of this vault/,        "erasing the device's record"],
    ["delAll",              /erasing everything it keeps/,             'erasing everything'],
  ] as const

  for (const [verb, said, blurb] of DeviceVerbCases) {
    it(`says what failed, ${blurb}, as 'storage_unavailable', with what to do and its error the cause`, async () => {
      const deviceDB = memoryDeviceDB()
      const trouble = new Error('device storage is unavailable')
      vi.spyOn(deviceDB, verb).mockRejectedValueOnce(trouble)
      const err = await TH.expectBad(callOf(deviceTroubleAsConditions(deviceDB), verb), 'storage_unavailable')
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
      vi.spyOn(deviceDB, 'raiseDeviceRecord').mockRejectedValueOnce(trouble)
      const err = await TH.expectBad(deviceTroubleAsConditions(deviceDB).raiseDeviceRecord(TH.deviceRecordOf('u1')), kind)
      expect(err.cause).to.eq(trouble)
      expect(err.message).to.match(/writing its record of this vault/)
      expect(err.message).to.match(kind === 'storage_blocked' ? /will not help until that changes/ : /try again/)
    })
  }

  it("keeps a verb's own way forward in its 'storage_blocked' message: a lease that will not read leaves a passphrase or passkey", async () => {
    const deviceDB = memoryDeviceDB()
    vi.spyOn(deviceDB, 'getLease').mockRejectedValueOnce(new DOMException('The operation is insecure.', 'SecurityError'))
    const err = await TH.expectBad(deviceTroubleAsConditions(deviceDB).getLease(TH.scopeOf('u1')), 'storage_blocked')
    expect(err.message).to.match(/reading the lease it keeps/)
    expect(err.message).to.match(/will not help until that changes: unlock with a vault unlocker \(the passphrase or passkey\) instead\./)
    expect(err.message).to.not.match(/try again/i)
  })

  it("keeps it in its 'storage_unavailable' message too, beside trying again", async () => {
    const deviceDB = memoryDeviceDB()
    vi.spyOn(deviceDB, 'getLease').mockRejectedValueOnce(new Error('device storage is unavailable'))
    const err = await TH.expectBad(deviceTroubleAsConditions(deviceDB).getLease(TH.scopeOf('u1')), 'storage_unavailable')
    expect(err.message).to.match(/try again, or unlock with a vault unlocker \(the passphrase or passkey\)\./)
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
    vi.spyOn(world.deviceDB, 'getDeviceRecord').mockRejectedValue(trouble)
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
    const vault = await world.open({ vaultDB: world.deafVaultDB() })
    world.dbStore.write(u1VaultScopepath, '{"format":"safebyok-vault-v6"}')
    const err = await TH.expectRefusal(vault.hello({ staleMinutes: 0 }), 'damaged_vault')
    expect(vault.getSnapshot().trouble).to.eq(err)
  })

  it("keeps its storage watch, so the vault reads of itself once storage relents and rings", async () => {
    const world = makeWorld()
    const vault = await world.open()
    vi.spyOn(world.vaultDB, 'getVault').mockResolvedValueOnce(bad(new VaultError('not_permitted', 'Sign in to reach this vault.')))
    await TH.expectRefusal(vault.hello({ staleMinutes: 0 }), 'not_permitted')
    expect(vault.getSnapshot().freshness).to.eq('refused')
    // Any write rings the store's change bell, and the vault reads again.
    world.dbStore.write('elsewhere', '{}')
    await TH.wakeupAtNextTick()
    expect(vault.getSnapshot()).to.deep.include({ state: 'novel', freshness: 'timely', trouble: null })
  })

  it("ends its storage watch only when let go: a refused hello leaves the vault for the host to retry or let go", async () => {
    const world = makeWorld()
    const tally = TH.tallyWatches(world.vaultDB)
    const vault = await world.open()
    vi.spyOn(world.vaultDB, 'getVault').mockResolvedValueOnce(bad(new VaultError('not_permitted', 'Sign in to reach this vault.')))
    await TH.expectRefusal(vault.hello({ staleMinutes: 0 }), 'not_permitted')
    expect(tally).to.deep.equal({ opened: 1, closed: 0 })
    TH.closeVault(vault)
    expect(tally).to.deep.equal({ opened: 1, closed: 1 })
  })

  it("rejects nothing unheard: the refusal reaches the hello's caller, and the logger hears nothing of it", async () => {
    const world = makeWorld()
    const vault = await world.open()
    const refusal = new VaultError('not_permitted', 'Sign in to reach this vault.')
    vi.spyOn(world.vaultDB, 'getVault').mockResolvedValueOnce(bad(refusal))
    expect(await TH.expectRefusal(vault.hello({ staleMinutes: 0 }), 'not_permitted')).to.eq(refusal)
    expect(world.logged).to.have.lengthOf(0)
  })

  it("tells the logger nothing of a hello refused after the bank let the vault go under it", async () => {
    const world = makeWorld()
    const vault = await world.open()
    vi.spyOn(world.vaultDB, 'getVault').mockResolvedValueOnce(bad(new VaultError('not_permitted', 'Sign in to reach this vault.')))
    const hello = vault.tryHello({ staleMinutes: 0 })
    TH.closeVault(vault)
    const settled = await hello
    expect(settled.ok).to.be.false
    expect(world.logged).to.have.lengthOf(0)
  })
})
// --

// == [hello, by the Contract]: damagedBoxWorld, bornThenDamaged, newsKeeper, behindWorld; hello's Does, Guarantees, Returns and Refuses; staleMinutes

/** A world whose `u1` vault holds one box, `anthropic`, its stored sidecar gone: listed damaged. */
const damagedBoxWorld = async () => {
  const world = makeWorld()
  await seedVault(world)
  world.dbStore.write(u1BoxScopepath('anthropic'), JSON.stringify({ ...storedRowOf(world, 'anthropic'), sidecar: undefined }))
  return world
}

/**
 * A world whose `u1` vault, with a box and this device's lease, is held by a Vault object born of
 * `overrides` that hears no change bells, and then has its stored props spoiled: the Vault
 * object's next read meets them.
 */
const bornThenDamaged = async (overrides?: Partial<TH.BornVaultOpts>) => {
  const world = makeWorld()
  await seedVault(world)
  const vault = await world.open({ vaultDB: world.deafVaultDB(), ...overrides })
  world.dbStore.write(u1VaultScopepath, JSON.stringify({ ...storedVaultPropsOf(world), gate_epoch: 'one' }))
  return { world, vault }
}

/** The host's say that storage was restored from an older copy on purpose, as clearCachedVault's example asks for it. */
const supportConfirmedTheRestore = () => true

/** A handler that keeps every piece of news it is told. */
const newsKeeper = () => {
  const told: VaultError[] = []
  return { told, onBadNews: (news: VaultError) => { told.push(news) } }
}

/**
 * A world whose `u1` vault this device has seen move on past a copy of its props. `here` made it
 * with `pw` (vault_epoch 1); `there`, another tab of this device born of `overrides` then, hears no
 * change bells, and took up here's lease. Here then added the passkey `laptop` (epoch 2: `older`,
 * as stored then) and removed it (epoch 3), raising this device's record to 3. `restoreOlder`
 * puts `older` back in storage, as a restore from a backup would.
 */
const behindWorld = async (overrides?: Partial<TH.BornVaultOpts>) => {
  const world = makeWorld()
  const here = await world.openUnlocked('pw')
  const there = await world.open({ vaultDB: world.deafVaultDB(), ...overrides })
  await addLaptopPasskey(here)
  const older = world.dbStore.read(u1VaultScopepath) ?? ''
  await TH.delWayin(here, 'pw')
  const restoreOlder = () => { world.dbStore.write(u1VaultScopepath, older) }
  return { world, here, there, older, restoreOlder }
}

describe("vault.hello, by the Contract", () => {
  it("reads the vault props, the ways in and the box listing, once (Contract: vault.hello, Does 1)", async () => {
    const world = makeWorld()
    await seedVault(world)
    const vault = await world.open()
    const reads = vi.spyOn(world.vaultDB, 'getVault')
    await vault.hello({ staleMinutes: 0 })
    expect(reads).toHaveBeenCalledTimes(1)
    expect(vault.passphrase).to.not.be.null
    expect(boxlabelsOf(vault)).to.deep.equal(['anthropic'])
  })

  it("coalesces: hellos called while one is under way share its one read (Contract: vault.hello, Does 1)", async () => {
    const world = makeWorld()
    const vault = await world.open()
    world.advance(StaleMinutes * MinuteMillis)
    const gate = TH.holdNextCall(world.vaultDB, 'getVault')
    const reads = vi.spyOn(world.vaultDB, 'getVault')
    const hellos = [vault.hello(), vault.hello(), vault.hello({ staleMinutes: 0 })]
    await gate.reached
    gate.release()
    expect(await Promise.all(hellos)).to.deep.equal([vault, vault, vault])
    expect(reads).toHaveBeenCalledTimes(1)
  })

  it("takes no lease up, fit or not: the vault's birth took up this device's (Contract: vault.hello, Does 2)", async () => {
    const world = makeWorld({ leaseHours: 1 })
    await seedVault(world)
    const locked = await world.open()
    await locked.lock()
    const leased = await world.openUnlocked('pw')
    world.advance(StaleMinutes * MinuteMillis)
    await locked.hello()
    expect(locked.state).to.eq('locked')
    const born = await world.open()
    expect(born.state).to.eq('unlocked')
    expect(born.askPassphraseAt).to.eq(leased.askPassphraseAt)
    world.advance(HourMillis)
    const lapsed = await world.open()
    expect(lapsed.state).to.eq('locked')
    expect(lapsed.askPassphraseAt).to.be.null
  })

  it("settles the state from those reads and publishes the snapshot, telling each subscriber (Contract: vault.hello, Does 3)", async () => {
    const world = makeWorld()
    const vault = await world.open({ vaultDB: world.deafVaultDB() })
    await world.openUnlocked('pw', { deviceDB: memoryDeviceDB() })
    const novel = vault.getSnapshot()
    const heard: string[] = []
    vault.subscribe(() => { heard.push(vault.getSnapshot().state) })
    await vault.hello({ staleMinutes: 0 })
    expect(heard).to.deep.equal(['locked'])
    expect(vault.getSnapshot()).to.not.eq(novel)
    expect(novel.state).to.eq('novel')
  })

  it("reads nothing within staleMinutes, and only settles: a lease run out meanwhile shows as locked (Contract: vault.hello, staleMinutes)", async () => {
    const world = makeWorld({ leaseHours: 1 })
    const vault = await world.openUnlocked('pw')
    const reads = vi.spyOn(world.vaultDB, 'getVault')
    world.advance(HourMillis)
    await vault.hello({ staleMinutes: Infinity })
    expect(reads).not.toHaveBeenCalled()
    expect(vault.state).to.eq('locked')
  })

  it("takes its staleMinutes from Bank.make, five minutes by default (Contract: vault.hello, staleMinutes)", async () => {
    const world = makeWorld()
    const vault = await world.open()
    const reads = vi.spyOn(world.vaultDB, 'getVault')
    world.advance((5 * MinuteMillis) - 1)
    await vault.hello()
    expect(reads).toHaveBeenCalledTimes(0)
    world.advance(1)
    await vault.hello()
    expect(reads).toHaveBeenCalledTimes(1)
    const patient = await world.open({ staleMinutes: 10 })
    reads.mockClear()
    world.advance(9 * MinuteMillis)
    await patient.hello()
    expect(reads).toHaveBeenCalledTimes(0)
    world.advance(MinuteMillis)
    await patient.hello()
    expect(reads).toHaveBeenCalledTimes(1)
  })

  it("reads at once given staleMinutes: 0, as its fourth example shows (Contract: vault.hello, staleMinutes)", async () => {
    const world = makeWorld()
    const vault = await world.open()
    const reads = vi.spyOn(world.vaultDB, 'getVault')
    await vault.hello({ staleMinutes: 0 })   // read now, whatever was read a moment ago
    expect(reads).toHaveBeenCalledTimes(1)
  })

  it("says hello again when the page shows, reading what changed elsewhere, as its second example shows", async () => {
    const world = makeWorld()
    const vault = await world.open({ vaultDB: world.deafVaultDB() })
    const shown = new EventTarget()
    shown.addEventListener('visibilitychange', () => { void vault.tryHello() })
    await seedVault(world)
    world.advance(StaleMinutes * MinuteMillis)
    shown.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => { expect(vault.state).to.eq('locked') })
    expect(boxlabelsOf(vault)).to.deep.equal(['anthropic'])
    // The lease another tab granted is taken up by the next ensureUnlocked()'s pantry consult, without a prompt.
    await vault.ensureUnlocked()
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
      const vault = await world.open()
      const before = vault.getSnapshot()
      const reads = vi.spyOn(world.vaultDB, 'getVault')
      await TH.expectRefusal(vault.hello(helloOpts as { staleMinutes?: number }), 'bad_option')
      expect(reads).not.toHaveBeenCalled()
      expect(vault.getSnapshot()).to.eq(before)
    })
  }

  it("fills every field from the one read: the props, the ways in, the listing and the capacity agree (Contract: vault.hello, Guarantees)", async () => {
    const world = makeWorld()
    const vault = await world.open({ deviceDB: memoryDeviceDB(), vaultDB: world.deafVaultDB() })
    const writer = await world.openUnlocked('pw')
    await writer.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    await writer.putBox({ boxlabel: 'openai' }, 'sk-fake-too')
    const stored = storedVaultPropsOf(world)
    await vault.hello({ staleMinutes: 0 })
    expect(vault).to.deep.include({ vault_tok: stored['vault_tok'], registered_at: stored['registered_at'], gate_epoch: stored['gate_epoch'] })
    expect(vault.passphrase).to.deep.include({ device_id: storedWayinOf(world, 'passphrase')?.['device_id'], registered_at: storedWayinOf(world, 'passphrase')?.['registered_at'] })
    expect(vault.passkey).to.be.null
    expect(boxlabelsOf(vault)).to.deep.equal(['anthropic', 'openai'])
    expect(vault.capacity.boxes.used).to.eq(2)
  })

  it("never fails for a damaged box in the listing: it comes back flagged, and onBadNews is told (Contract: vault.hello, Guarantees)", async () => {
    const world = makeWorld()
    const { told, onBadNews } = newsKeeper()
    await seedVault(world)
    const vault = await world.open({ onBadNews, vaultDB: world.deafVaultDB() })
    world.dbStore.write(u1BoxScopepath('anthropic'), JSON.stringify({ ...storedRowOf(world, 'anthropic'), sidecar: undefined }))
    expect(await vault.hello({ staleMinutes: 0 })).to.eq(vault)
    expect(vault.boxes).to.deep.equal([{ boxlabel: 'anthropic', damaged: true, revision_tok: storedRowOf(world, 'anthropic')['revision_tok'] }])
    expect(told.map((news) => news.refusalkind)).to.deep.equal(['damaged_box'])
    expect(told[0]?.meta?.box_listed).to.eq(vault.boxes[0])
    expect(vault.trouble).to.eq(told[0])
  })

  it("resolves the vault itself, in each of the three states (Contract: vault.hello, Returns)", async () => {
    const world = makeWorld()
    const novel = await world.open()
    expect(await novel.hello()).to.eq(novel)
    expect(novel.state).to.eq('novel')
    await seedVault(world)
    const unlocked = await world.open()
    expect(await unlocked.hello()).to.eq(unlocked)
    expect(unlocked.state).to.eq('unlocked')
    await unlocked.lock()
    const locked = await world.open()
    expect(await locked.hello()).to.eq(locked)
    expect(locked.state).to.eq('locked')
  })

  it("refuses storage_unavailable to its caller, a condition never told to onBadNews (Contract: vault.hello, Refuses)", async () => {
    const world = makeWorld()
    const { told, onBadNews } = newsKeeper()
    const vault = await world.open({ onBadNews })
    const refusal = unreachable()
    vi.spyOn(world.vaultDB, 'getVault').mockResolvedValueOnce(bad(refusal))
    expect(await TH.expectRefusal(vault.hello({ staleMinutes: 0 }), 'storage_unavailable')).to.eq(refusal)
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
      const vault = await world.open({ onBadNews })
      const refusal = new VaultError(kind, 'Sign in to reach this vault.')
      vi.spyOn(world.vaultDB, 'getVault').mockResolvedValueOnce(bad(refusal))
      expect(await TH.expectRefusal(vault.hello({ staleMinutes: 0 }), kind)).to.eq(refusal)
      expect(told).to.deep.equal(isBadNews ? [refusal] : [])
    })
  }

  it("refuses newer_format, a vault written by a newer safebyok, told to onBadNews and returned (Contract: vault.hello, Refuses)", async () => {
    const world = makeWorld()
    const { told, onBadNews } = newsKeeper()
    const vault = await world.open({ onBadNews })
    const refusal = new VaultError('newer_format', 'A newer safebyok wrote this vault: update the app.')
    vi.spyOn(world.vaultDB, 'getVault').mockResolvedValueOnce(bad(refusal))
    expect(await TH.expectRefusal(vault.hello({ staleMinutes: 0 }), 'newer_format')).to.eq(refusal)
    expect(told).to.deep.equal([refusal])
    expect(vault.trouble).to.eq(refusal)
  })

  it("refuses damaged_vault, props that fail their checks, told to onBadNews and returned, the vault standing as its last read left it (Contract: vault.hello, Refuses)", async () => {
    const { told, onBadNews } = newsKeeper()
    const { vault } = await bornThenDamaged({ onBadNews })
    const err = await TH.expectRefusal(vault.hello({ staleMinutes: 0 }), 'damaged_vault')
    expect(err.family).to.eq('bad_news')
    expect(told).to.deep.equal([err])
    expect(vault.snapshot).to.deep.include({ state: 'unlocked', gate_epoch: 1, trouble: err, freshness: 'refused' })
  })

  it("refuses vault_behind in another tab, an older copy than this device has seen: it takes nothing, writes nothing, locks, and is told to onBadNews once (Contract: vault.hello, Refuses)", async () => {
    const { told, onBadNews } = newsKeeper()
    const { world, there, older, restoreOlder } = await behindWorld({ onBadNews })
    expect(there.state).to.eq('unlocked')
    restoreOlder()
    const [err, shared] = await Promise.all([TH.expectRefusal(there.hello({ staleMinutes: 0 }), 'vault_behind'), TH.expectRefusal(there.refresh(), 'vault_behind')])
    expect(shared).to.eq(err)
    expect(told).to.deep.equal([err])
    expect(there.getSnapshot()).to.deep.include({ state: 'locked', gate_epoch: 1, passkey: null, trouble: err, freshness: 'refused' })
    expect(await world.getLease()).to.be.null
    expect(world.dbStore.read(u1VaultScopepath)).to.eq(older)
    expect(await recordEpochIn(world)).to.eq(3)
  })

  it("never unlocks an older copy than this device has seen: an unlock refuses vault_behind, its passkey opening nothing", async () => {
    const { world, there, restoreOlder } = await behindWorld()
    // Born unlocked beside here, it is locked first: an unlock of an unlocked vault tries nothing.
    await there.lock()
    restoreOlder()
    await TH.expectRefusal(TH.unlock(there, 'pw'), 'vault_behind')
    await TH.expectRefusal(TH.unlock(there, await TH.passkeyOf('laptop')), 'vault_behind')
    expect(there.getSnapshot()).to.deep.include({ state: 'locked', gate_epoch: 1, passkey: null })
    expect(await world.getLease()).to.be.null
  })

  it("refuses vault_behind in the Vault object that saw the newer copy too, as another tab does: it takes nothing, keeps the newer in hand, and locks", async () => {
    const { world, here, older, restoreOlder } = await behindWorld()
    restoreOlder()
    const err = await TH.expectRefusal(here.refresh(), 'vault_behind')
    expect(here.getSnapshot()).to.deep.include({ state: 'locked', gate_epoch: 3, passkey: null, trouble: err, freshness: 'refused' })
    expect(await world.getLease()).to.be.null
    expect(world.dbStore.read(u1VaultScopepath)).to.eq(older)
    expect(await recordEpochIn(world)).to.eq(3)
  })

  it("is refused vault_behind at a new birth too, and accepted once bank.clearCachedVault() has this device forget the vault, as its example shows", async () => {
    const { world, there, restoreOlder } = await behindWorld()
    restoreOlder()
    const bank = TH.bankOf(there)
    TH.closeVault(there)
    const { ok, err } = await bank.tryEnsureVault(u1Main)
    expect(err?.refusalkind).to.eq('vault_behind')
    expect(bank.entryOf(u1Main)).to.deep.include({ status: 'refused', vault: null, err })
    if (! ok && isVaultError(err, 'vault_behind') && supportConfirmedTheRestore()) {
      await bank.clearCachedVault(u1Main)
      await bank.ensureVault(u1Main)
    }
    const accepted = await bank.ensureVault(u1Main)
    expect(accepted.getSnapshot()).to.deep.include({ state: 'locked', gate_epoch: 2 })
    expect(accepted.passkey?.credential_id).to.eq(storedWayinOf(world, 'passkey')?.['credential_id'])
    expect(await recordEpochIn(world)).to.eq(2)
  })
})
// --

// == [The handler]: onBadNews, trouble

describe("onBadNews, by the Contract", () => {
  it("is told the bad news before the call that met it settles (Contract: Bank.make, The handler)", async () => {
    let settled = false
    let toldBeforeSettling: boolean | null = null
    const { vault } = await bornThenDamaged({ onBadNews: () => { toldBeforeSettling = ! settled } })
    await TH.expectRefusal(vault.hello({ staleMinutes: 0 }), 'damaged_vault')
    settled = true
    expect(toldBeforeSettling).to.be.true
  })

  it("is told a refusal once, however many calls share it (Contract: Bank.make, The handler)", async () => {
    const { told, onBadNews } = newsKeeper()
    const { world, vault } = await bornThenDamaged({ onBadNews })
    world.advance(StaleMinutes * MinuteMillis)
    const refusals = await Promise.all([TH.expectRefusal(vault.hello(), 'damaged_vault'), TH.expectRefusal(vault.getWhisper('anthropic'), 'damaged_vault'), TH.expectRefusal(TH.unlock(vault, 'pw'), 'damaged_vault')])
    expect(new Set(refusals).size).to.eq(1)
    expect(told).to.deep.equal([refusals[0]])
  })

  it("is told a damaged box once, not again at each read that still lists it (Contract: Bank.make, The handler)", async () => {
    const world = await damagedBoxWorld()
    const { told, onBadNews } = newsKeeper()
    const vault = await world.open({ onBadNews })
    await vault.hello({ staleMinutes: 0 })
    await vault.hello({ staleMinutes: 0 })
    expect(told).to.have.lengthOf(1)
    expect(vault.trouble).to.eq(told[0])
  })

  it("never hears a condition: stale_write, vault_full and storage_unavailable are their callers' alone (Contract: Bank.make, The handler)", async () => {
    const world = makeWorld({ maxBoxes: 1 })
    const { told, onBadNews } = newsKeeper()
    const vault = await world.openUnlocked('pw', { onBadNews })
    await vault.putBox({ boxlabel: 'anthropic' }, 'sk-fake')
    await TH.expectRefusal(vault.putBox({ boxlabel: 'openai' }, 'sk-fake-too'), 'vault_full')
    vi.spyOn(world.vaultDB, 'putBox').mockResolvedValueOnce(bad(new VaultError('stale_write', 'Someone else wrote first.')))
    await TH.expectRefusal(vault.putBox({ boxlabel: 'anthropic' }, 'sk-other'), 'stale_write')
    vi.spyOn(world.vaultDB, 'getVault').mockResolvedValueOnce(bad(unreachable()))
    await TH.expectRefusal(vault.hello({ staleMinutes: 0 }), 'storage_unavailable')
    expect(told).to.have.lengthOf(0)
    expect(vault.trouble).to.be.null
  })

  it("changes nothing the caller gets: a handler that throws still has the refusal reach its caller, family bad_news (Contract: Bank.make, The handler)", async () => {
    let heard: VaultError | null = null
    const { vault } = await bornThenDamaged({ onBadNews: (news) => { heard = news; throw new Error('the handler broke') } })
    const err = await TH.expectRefusal(vault.hello({ staleMinutes: 0 }), 'damaged_vault')
    expect(err).to.eq(heard)
    expect(err.family).to.eq('bad_news')
  })

  it("is never awaited: a handler that never settles holds no call up (Contract: Bank.make, The handler)", async () => {
    const { vault } = await bornThenDamaged({ onBadNews: () => new Promise<void>(() => { /* never settles */ }) })
    await TH.expectRefusal(vault.hello({ staleMinutes: 0 }), 'damaged_vault')
  })

  it("lands what the handler throws in trouble, as bad_option with the throw its cause, and tells the logger and the platform (Contract: Bank.make, The handler)", async () => {
    const reported: unknown[] = []
    vi.stubGlobal('reportError', (err: unknown) => { reported.push(err) })
    try {
      const thrown = new Error('the handler broke')
      const { world, vault } = await bornThenDamaged({ onBadNews: () => { throw thrown } })
      await TH.expectRefusal(vault.hello({ staleMinutes: 0 }), 'damaged_vault')
      expect(vault.trouble).to.deep.include({ refusalkind: 'bad_option', cause: thrown })
      expect(world.logged.map((heard) => [heard.level, heard.story, heard.err])).to.deep.equal([['error', { call: 'onBadNews' }, thrown]])
      expect(reported).to.deep.equal([thrown])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("lands what an async handler rejects with in trouble too, once it rejects (Contract: Bank.make, The handler)", async () => {
    const thrown = new Error('the handler broke later')
    const { vault } = await bornThenDamaged({ onBadNews: () => Promise.reject(thrown) })
    const err = await TH.expectRefusal(vault.hello({ staleMinutes: 0 }), 'damaged_vault')
    await vi.waitFor(() => { expect(vault.trouble).to.not.eq(err) })
    expect(vault.trouble).to.deep.include({ refusalkind: 'bad_option', cause: thrown })
  })

  it("is told the bad news a background read meets, with no call to hand it to", async () => {
    const world = makeWorld()
    const { told, onBadNews } = newsKeeper()
    await world.open({ onBadNews })
    world.dbStore.write(u1VaultScopepath, JSON.stringify({ format: 'safebyok-vault-v6', gate_epoch: 'one' }))
    await vi.waitFor(() => { expect(told.map((news) => news.refusalkind)).to.deep.equal(['damaged_vault']) })
  })

  it("names the damaged box, which the host may offer to remove, as trouble's example shows", async () => {
    const world = await damagedBoxWorld()
    const vault = await world.open()
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
    const bank = bankIn(world, { onBadNews: (news) => { telemetry.report(news.refusalkind) } })
    await TH.expectRefusal(bank.ensureVault(u1Main), 'damaged_vault')
    expect(reports).to.deep.equal(['damaged_vault'])
  })
})
// --

// == [A read overtaken]: holdLeaseAfterRead, holdLeaseAfterWrite, a lease read a key change overtakes

/** Holds this device's next read of its lease once the store has answered, until released. */
const holdLeaseAfterRead = (world: ReturnType<typeof makeWorld>) => {
  const gate = TH.makeLatch()
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
  const gate = TH.makeLatch()
  const write = world.deviceDB.putLease.bind(world.deviceDB)
  vi.spyOn(world.deviceDB, 'putLease').mockImplementationOnce(async (record) => {
    const written = await write(record)
    await gate.pass()
    return written
  })
  return gate
}

/** Have `vault`, unlocked, ask again for its passphrase `pw` though its lease stands: `tryEnsureUnlocked()` with a `renewMinutes` one minute short of the whole lease, so a lease more than a minute old ends within it. */
const tryRenewing = (vault: Vault) => {
  TH.answering(vault, async (gating) => { if (gating.gatingkind === 'unlock_vault') { await gating.attemptPassphrase('pw') } })
  return vault.tryEnsureUnlocked({ renewMinutes: (SevenDaysMillis / MinuteMillis) - 1 })
}

describe("a lease read a key change overtakes", () => {
  it("stays locked when a lock lands while a hello reads this device's lease", async () => {
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

  it("keeps a fresher unlock's lease when a hello's read of the older one finishes after it", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw')
    const older = vault.askPassphraseAt
    world.advance(StaleMinutes * MinuteMillis)
    const deriving = world.holdNextDerive()
    const unlocking = tryRenewing(vault)
    await deriving.reached
    const leaseRead = holdLeaseAfterRead(world)
    // The unlock's own read is a moment old: a hello within staleMinutes of it would read nothing.
    const hello = vault.hello({ staleMinutes: 0 })
    await leaseRead.reached
    deriving.release()
    await TH.expectGood(unlocking)
    const fresher = vault.askPassphraseAt
    expect(fresher).to.eq(world.clock.now() + SevenDaysMillis)
    leaseRead.release()
    await hello
    expect(vault.askPassphraseAt).to.eq(fresher).and.to.not.eq(older)
    const standing = await world.getLease()
    expect(standing?.ask_passphrase_at).to.eq(fresher)
  })

  it("keeps a fresher unlock's lease when a hello reads the run-out one while the fresh one is written", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw')
    world.advance(SevenDaysMillis + (StaleMinutes * MinuteMillis))
    const deriving = world.holdNextDerive()
    const unlocking = TH.unlock(vault, 'pw')
    await deriving.reached
    const leaseRead = holdLeaseAfterRead(world)
    const hello = vault.hello({ staleMinutes: 0 })
    await leaseRead.reached
    const leaseWritten = holdLeaseAfterWrite(world)
    deriving.release()
    await leaseWritten.reached
    // The fresh lease is in the store; the hello goes on with the run-out one it read.
    leaseRead.release()
    await hello
    leaseWritten.release()
    await unlocking
    expect(vault.state).to.eq('unlocked')
    const standing = await world.getLease()
    expect(standing?.ask_passphrase_at).to.eq(vault.askPassphraseAt).and.to.eq(world.clock.now() + SevenDaysMillis)
  })
})

/** Expect the lease this device's store still holds, granted before the vault moved on, never to open `vault`.
 * A read drops a lease from memory and erases nothing, and `ensureUnlocked()`'s gating finds it
 * outdated in its pantry consult, takes nothing up, and leaves it where it lies; the gating,
 * answered by nobody, is declined.
 */
const expectOutdatedLeaseRefused = async (world: ReturnType<typeof makeWorld>, vault: Vault) => {
  const outdated = await world.getLease()
  expect(outdated).to.not.be.null
  await TH.expectRefusal(vault.ensureUnlocked(), 'vault_locked')
  expect(vault.state).to.eq('locked')
  expect(await world.getLease()).to.deep.equal(outdated)
}

/**
 * A world whose `u1` vault stands, made with `pw`; a Vault object born on it locked; this device's
 * lease, granted since by another tab that has been let go; and `other`, a second device unlocked
 * over an adapter of its own, so that holding this device's reads holds none of its. The Vault
 * object's `ensureUnlocked()` is held as its gating's pantry consult, the take-up, reads that lease,
 * the answer not yet given: the test changes the vault elsewhere meanwhile, through `other`, then calls `release`.
 */
const takeUpHeld = async () => {
  const world = makeWorld()
  const tab = await world.openUnlocked('pw')
  await tab.lock()
  const vault = await world.open()
  await TH.unlock(tab, 'pw')
  TH.closeVault(tab)
  const other = await world.openUnlocked('pw', { deviceDB: memoryDeviceDB(), vaultDB: localVaultDB({ store: world.dbStore }) })
  // Every bell rung so far is answered first, so the take-up's is the next read of the lease.
  await TH.wakeupAtNextTick()
  const answering = holdLeaseAfterRead(world)
  const ensuring = vault.tryEnsureUnlocked()
  await answering.reached
  return { world, vault, ensuring, other, release: answering.release }
}

/** Hold this device's second raise of its record of the vault from here on, before it reaches the store, until released: a call's note of its own write, its read's raise passing first. */
const holdSecondRaise = (world: ReturnType<typeof makeWorld>) => {
  const noting = TH.makeLatch()
  const raise = world.deviceDB.raiseDeviceRecord.bind(world.deviceDB)
  let raised = 0
  vi.spyOn(world.deviceDB, 'raiseDeviceRecord').mockImplementation(async (record) => {
    raised += 1
    if (raised === 2) { await noting.pass() }
    return await raise(record)
  })
  return noting
}

describe("a revocation read while a key is being taken up: a take-up, an unlock, a change to the ways in", () => {
  it("stays locked when a take-up finishes while a refresh that has read a new epoch is not yet answered", async () => {
    const { world, vault, ensuring, other, release } = await takeUpHeld()
    const reading = TH.holdNextAnswer(world.vaultDB, 'getVault')
    await TH.putWayin(other, 'pw', 'pw-new')
    // The change bell's refresh has read epoch 2, and its answer is held.
    await reading.reached
    release()
    await ensuring
    reading.release()
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
    // The change's own read raises the record first; its note of the change, the second raise, is held.
    const noting = holdSecondRaise(world)
    const changing = TH.tryPutWayin(vault, 'pw', 'pw-two')
    await noting.reached
    await TH.unlock(other, 'pw-two')
    await TH.putWayin(other, 'pw-two', 'pw-three')
    await vault.hello({ staleMinutes: 0 })
    expect(vault.gate_epoch).to.eq(3)
    noting.release()
    await changing
    expect(vault.gate_epoch).to.eq(3)
    expect(vault.state).to.eq('locked')
  })

  it("leaves a change elsewhere standing over the gate this device just set, read as it notes its own", async () => {
    const world = makeWorld()
    const vault = await world.open({ vaultDB: world.deafVaultDB() })
    const other = await world.open({ deviceDB: memoryDeviceDB() })
    // The unlock's read raises the record first; its note of the gate it set, the second raise, is held.
    const noting = holdSecondRaise(world)
    const making = TH.tryUnlock(vault, 'pw')
    await noting.reached
    // Its picture is novel still: an unlock there would set a first gate, and refuse gate_made_elsewhere.
    await other.hello({ staleMinutes: 0 })
    await TH.unlock(other, 'pw')
    await TH.putWayin(other, 'pw', 'pw-two')
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
    world.advance(2 * MinuteMillis)
    const deriving = world.holdNextDerive()
    const unlocking = tryRenewing(vault)
    await deriving.reached
    await TH.putWayin(other, 'pw', 'pw-new')
    // The change bell's refresh reads epoch 2, and drops the lease from memory, erasing nothing.
    await TH.eventually(() => vault.gate_epoch === 2)
    expect(vault.state).to.eq('locked')
    deriving.release()
    await TH.expectBad(unlocking, 'gate_moved')
    await vault.hello({ staleMinutes: 0 })
    expect(vault.state).to.eq('locked')
    await expectOutdatedLeaseRefused(world, vault)
  })

  it("stays locked when the passphrase changes on another device while ensureUnlocked() consults this device's store for its lease, which it leaves where it lies", async () => {
    const { world, vault, ensuring, other, release } = await takeUpHeld()
    const outdated = await world.getLease()
    expect(vault.gate_epoch).to.eq(1)
    await TH.putWayin(other, 'pw', 'pw-new')
    // The change bell's refresh brings the new epoch while the take-up's answer is held.
    await TH.eventually(() => vault.gate_epoch === 2)
    release()
    await TH.expectBad(ensuring, 'vault_locked')
    expect(vault.state).to.eq('locked')
    expect(vault.askPassphraseAt).to.be.null
    await vault.hello({ staleMinutes: 0 })
    expect(vault.state).to.eq('locked')
    await TH.expectRefusal(vault.ensureUnlocked(), 'vault_locked')
    expect(await world.getLease()).to.deep.equal(outdated)
  })

  it("takes up no lease, the Vault object gone, when the vault is deleted and made anew on another device while ensureUnlocked() consults this device's store for its lease", async () => {
    const { world, vault, ensuring, other, release } = await takeUpHeld()
    await TH.del(other, 'pw')
    // The deletion's bell is answered before the vault is made anew: the refresh finds it gone.
    await TH.wakeupAtNextTick()
    await TH.bankOf(other).ensureVault(u1Main)
    release()
    await TH.expectBad(ensuring, 'vault_gone')
    expect(vault.state).to.eq('locked')
    expect(vault.askPassphraseAt).to.be.null
    await TH.expectRefusal(vault.hello({ staleMinutes: 0 }), 'vault_gone')
    expect(await world.getLease()).to.not.be.null
  })
})
// --

// == [Telling, in order]: the listing published first, an answer that is only a thenable

describe("onBadNews, as it is told", () => {
  it("sees the listing that told it: the vault shows the damaged box before the handler hears of it", async () => {
    const world = makeWorld()
    await seedVault(world)
    const seen: string[][] = []
    const vault: Vault = await world.open({ vaultDB: world.deafVaultDB(), onBadNews: () => { seen.push(boxlabelsOf(vault)) } })
    world.dbStore.write(u1BoxScopepath('anthropic'), JSON.stringify({ ...storedRowOf(world, 'anthropic'), sidecar: undefined }))
    await vault.hello({ staleMinutes: 0 })
    expect(seen).to.deep.equal([['anthropic']])
  })

  it("lands a rejection in trouble from an answer that is only a thenable, no Promise", async () => {
    const thrown = new Error('the handler broke, by a thenable')
    // eslint-disable-next-line unicorn/no-thenable -- the case under test is an answer that is a thenable and no Promise
    const thenable = { then: (_resolve: unknown, reject: (err: unknown) => void) => { reject(thrown) } }
    const { vault } = await bornThenDamaged({ onBadNews: () => thenable as unknown as Promise<void> })
    await TH.expectRefusal(vault.hello({ staleMinutes: 0 }), 'damaged_vault')
    await vi.waitFor(() => { expect(vault.trouble).to.deep.include({ refusalkind: 'bad_option', cause: thrown }) })
  })
})
// --
