import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeLeaseKey } from '../../src/crypto'
import { VaultError } from '../../src/errors'
import { LOCKED } from '../../src/models/models-shapes'
import { NOVEL, PassphraseProving } from '../../src/models/proving'
import { DefaultLeaseMillis } from '../../src/models/vault'
import { VaultListing } from '../../src/models/vault-listing'
import { passphraseCleartext } from '../../src/shapes/vault'
import * as TH from '../test-helpers'
import { LeaseMillis, NewPassphrase, Passphrase, byPasskey, byPassphrase, makeBornVault, makeBornVaultAndFriend, makeBornVaultWithPasskey, makeVaultWorld, makeProving, replaceTyping, revokeTyping, storedVaultRecord, T0, useVaultWorlds, vaultRoundTrip, unlockTyping } from '../test-helpers/vault-world'

useVaultWorlds()

const Stamp = Object.freeze({ boxlabel: 'anthropic_api_key', revision_seq: 1 })

/** Node has no `reportError`, so a test hands the platform one. */
const stubReportError = () => {
  const reported = vi.fn()
  vi.stubGlobal('reportError', reported)
  return reported
}

afterEach(() => { vi.unstubAllGlobals() })

describe("proving.buildWayin: one wayin per proving, of its own vault", () => {
  it("refuses a second wayin of a proving that holds one, and a source proving of another vault", async () => {
    const { vault, opts: { world } } = await makeBornVault()
    const mine = await PassphraseProving.buildStored(vault.gate, passphraseCleartext.parse(Passphrase), world)
    await TH.expectRefusal(mine.buildWayin(NOVEL), 'unexpected_error')
    const novel = await PassphraseProving.buildNovel(vault.gate.stamp, passphraseCleartext.parse('a new passphrase'), world)
    await TH.expectRefusal(novel.buildWayin(await makeProving({ vault_tok: 'vault-tok-other', registered_at: T0 })), 'bad_option')
    const wayin = await novel.buildWayin(mine)
    expect(wayin.wayinkind).to.eq('passphrase')
  })
})

describe("Vault.ensureUnlocked and the vault's lock", () => {
  it("is born unlocked, under the lease its passphrase proving grants and the deviceDB caches; ensureUnlocked answers the vault and asks nothing", async () => {
    const { vault, deviceDB } = await makeBornVault()
    expect(vault.isUnlocked).to.be.true
    expect(vault.lockState()).to.eq('unlocked')
    expect(deviceDB.tryCache).toHaveBeenCalledOnce()
    expect(deviceDB.cachedNow()).to.deep.include({ gate_epoch: vault.gate.gate_epoch, wayinkind: 'passphrase' })
    expect(await vault.ensureUnlocked()).to.equal(vault)
    expect(await vaultRoundTrip(vault, vault)).to.eq('sk-test')
  })

  it("refuses 'bad_option' a stamp of no fields, at the seal and at the unseal: a seal bound to nothing of the box's binds nothing", async () => {
    const { vault } = await makeBornVault()
    await TH.expectRefusal(vault.sealStampedString('sk-test', {}), 'bad_option')
    await TH.expectRefusal(vault.unsealStampedString(await vault.sealStampedString('sk-test', Stamp), {}), 'bad_option')
  })

  it("locks at `lock()`, reading locked before it returns and erasing the row; seal and unseal refuse; then 'vault_locked' with no proof, the proof's own refusal with a wrong one, and it unlocks with the right one", async () => {
    const { vault, deviceDB } = await makeBornVault()
    const sealed = await vault.sealStampedString('sk-test', Stamp)
    expect(vault.lock()).to.equal(vault)
    expect(vault.isLocked).to.be.true
    expect(vault.lockState()).to.eq('locked')
    await TH.expectRefusal(vault.sealStampedString('sk-test', Stamp), 'vault_locked')
    await TH.expectRefusal(vault.unsealStampedString(sealed, Stamp), 'vault_locked')
    await TH.eventually(() => deviceDB.cachedNow() === null)
    await TH.expectRefusal(vault.ensureUnlocked(), 'vault_locked')
    await TH.expectRefusal(unlockTyping(vault, byPassphrase('not the passphrase')), 'wrong_passphrase')
    expect(vault.isLocked).to.be.true
    await unlockTyping(vault, byPassphrase(Passphrase))
    expect(vault.isUnlocked).to.be.true
    expect(await vault.unsealStampedString(sealed, Stamp)).to.eq('sk-test')
    expect(deviceDB.tryVacate).toHaveBeenCalledOnce()
    expect(deviceDB.tryCache).toHaveBeenCalledTimes(2)
    expect(deviceDB.cachedNow()).not.to.be.null
  })

  it("tells listeners the lock moved, as the snapshot shows it", async () => {
    const { vault } = await makeBornVault()
    vault.becomeNotifiable()
    const listener = vi.fn()
    vault.subscribe(listener)
    expect(vault.getSnapshot().lockState).to.eq('unlocked')
    vault.lock()
    expect(listener).toHaveBeenCalledOnce()
    expect(vault.getSnapshot().lockState).to.eq('locked')
  })

  it("unlocks a vault held sparse by proof, its full record fetched for the gate", async () => {
    const { demandStored } = await makeBornVault()
    const record = demandStored()
    const { listing } = makeVaultWorld(record)
    const vault = await listing.build(listing.sparseOf(record))
    expect(vault.isLocked).to.be.true
    await unlockTyping(vault, byPassphrase(Passphrase))
    expect(vault.isUnlocked).to.be.true
    expect(vault.isFull).to.be.true
  })

  it("refuses a seal or an unseal crossed by a lock, handing nothing back", async () => {
    const { vault } = await makeBornVault()
    const sealed = await vault.sealStampedString('sk-test', Stamp)
    const sealing = vault.sealStampedString('sk-test', Stamp)
    const unsealing = vault.unsealStampedString(sealed, Stamp)
    vault.lock()
    await Promise.all([TH.expectRefusal(sealing, 'vault_locked'), TH.expectRefusal(unsealing, 'vault_locked')])
  })

  it("seals nothing another vault opens: the vaultKey and the vault's stamp are bound in", async () => {
    const { vault } = await makeBornVault()
    const { vault: other } = await makeBornVault()
    await TH.expectRefusal(other.unsealStampedString(await vault.sealStampedString('sk-test', Stamp), Stamp), 'damaged_box')
  })
})

const makeFreshLease = async ({ vault, friend, opts: { world } }: Awaited<ReturnType<typeof makeBornVaultAndFriend>>) => {
  const proving = await PassphraseProving.buildStored(vault.gate, passphraseCleartext.parse(Passphrase), world)
  return proving.buildLease(friend)
}

describe("lease.attach: the one way a vault comes to hold a lease", () => {
  it("holds the lease, reading unlocked, and caches its row: the lease it displaces is dropped", async () => {
    const born = await makeBornVaultAndFriend()
    const { vault, deviceDB } = born
    const first = await makeFreshLease(born)
    const second = await makeFreshLease(born)
    await first.attach()
    await second.attach()
    expect(first.isForgotten).to.be.true
    expect(second.isInForce).to.be.true
    expect(vault.isUnlocked).to.be.true
    expect(deviceDB.cachedNow()).to.deep.include({ proved_at: second.proved_at })
  })

  it("refuses 'vault_locked' a lease out of force", async () => {
    const born = await makeBornVaultAndFriend()
    const lease = await makeFreshLease(born)
    lease.evict()
    await TH.expectRefusal(lease.attach(), 'vault_locked')
  })

  it("past a sweep refuses, the lease vacated, no row cached, and the row the sweep left erased", async () => {
    const born = await makeBornVaultAndFriend()
    const { vault, deviceDB } = born
    const lease = await makeFreshLease(born)
    vault.sweep()
    expect(deviceDB.cachedNow()).not.to.be.null
    await TH.expectRefusal(lease.attach(), 'disabled')
    expect(lease.isForgotten).to.be.true
    expect(vault.isLocked).to.be.true
    expect(deviceDB.cachedNow()).to.be.null
    expect(deviceDB.tryCache).toHaveBeenCalledOnce()
  })

  it("holds the lease where the deviceDB refuses its row, told as bad news: it costs the next session a proof, not this one its lease", async () => {
    const onBadNews = vi.fn()
    const { opts, deviceDB, demandStored } = await makeBornVault()
    const record = demandStored()
    const listing = new VaultListing({ ...opts, onBadNews })
    const vault = await listing.build(record)
    deviceDB.tryCache.mockResolvedValueOnce(TH.bad(new VaultError('storage_blocked', 'the disk is full')))
    vault.lock()
    await unlockTyping(vault, byPassphrase(Passphrase))
    expect(vault.isUnlocked).to.be.true
    expect(onBadNews).toHaveBeenCalledOnce()
    listing.goodbye()
  })
})

describe("The lease this device has cached: taken up in ensureUnlocked alone", () => {
  it("attaches it at the next session's ensureUnlocked, opening what the born one sealed, asking nothing; hello takes up nothing", async () => {
    const { vault, demandStored, anotherSession } = await makeBornVault()
    const later = anotherSession()
    const again = await later.build(demandStored())
    await later.hello()
    expect(again.isLocked).to.be.true
    expect(await again.ensureUnlocked()).to.equal(again)
    expect(again.isUnlocked).to.be.true
    expect(await vaultRoundTrip(vault, again)).to.eq('sk-test')
  })

  it("looks for no lease at a hello, of a vault deleted or any other", async () => {
    const { gate: _gate, ...sparse } = await storedVaultRecord()
    const tombstone = { ...sparse, am: 'x' as const }
    const { listing, deviceDB } = makeVaultWorld(tombstone as never)
    await listing.build(tombstone)
    await listing.hello()
    expect(deviceDB.peek).not.toHaveBeenCalled()
  })

  it("takes up no lease cached under an older gate, and uncaches it: asking for the proof", async () => {
    const { vault, demandStored, anotherSession, deviceDB } = await makeBornVault()
    vault.lock()
    await unlockTyping(vault, byPassphrase(Passphrase))
    const stale = deviceDB.cachedNow()
    await replaceTyping(vault, Passphrase, NewPassphrase)
    deviceDB.layCached(stale)
    const again = await anotherSession().build(demandStored())
    await TH.expectRefusal(again.ensureUnlocked(), 'vault_locked')
    expect(deviceDB.cachedNow()).to.be.null
    await unlockTyping(again, byPassphrase(NewPassphrase))
    expect(again.isUnlocked).to.be.true
  })

  it("takes up no lease another device cached before the gate changed: a revoked passkey's holder asks for the proof", async () => {
    const { vault, demandStored } = await makeBornVaultWithPasskey()
    const other = makeVaultWorld(demandStored(), { device_id: 'device-2' })
    const theirs = await other.listing.build(other.demandStored())
    await unlockTyping(theirs, byPasskey('laptop'))
    await revokeTyping(vault, Passphrase)
    other.storeBehindOurBack(demandStored())
    const again = await other.anotherSession().build(other.demandStored())
    expect(other.deviceDB.cachedNow()).not.to.be.null
    await TH.expectRefusal(again.ensureUnlocked(), 'vault_locked')
    expect(again.gate.pkWayin).to.be.null
    expect(other.deviceDB.cachedNow()).to.be.null
  })

  it("takes up a cached lease as old as the world's leaseMillis, and leaves one any older not loaded, which reads as no row", async () => {
    const { demandStored, anotherSession, advance, deviceDB } = await makeBornVault()
    advance(LeaseMillis)
    const within = await anotherSession().build(demandStored())
    await within.ensureUnlocked()
    expect(within.isUnlocked).to.be.true
    advance(1)
    const past = await anotherSession().build(demandStored())
    await TH.expectRefusal(past.ensureUnlocked(), 'vault_locked')
    expect(past.isLocked).to.be.true
    expect(deviceDB.cachedNow()).to.not.be.null
  })

  it("judges by DefaultLeaseMillis where the world names no leaseMillis", async () => {
    const { demandStored, anotherSession, advance, deviceDB } = await makeBornVault(byPassphrase(Passphrase), { leaseMillis: undefined as never })
    advance(DefaultLeaseMillis)
    const within = await anotherSession().build(demandStored())
    await within.ensureUnlocked()
    expect(within.isUnlocked).to.be.true
    advance(1)
    const past = await anotherSession().build(demandStored())
    await TH.expectRefusal(past.ensureUnlocked(), 'vault_locked')
    expect(past.isLocked).to.be.true
    expect(deviceDB.cachedNow()).to.not.be.null
  })

  it("locks the vault where a cached lease will not open at its first seal: 'damaged_lease', and the row erased", async () => {
    const { demandStored, anotherSession, deviceDB } = await makeBornVault()
    const cached = deviceDB.cachedNow() as Record<string, unknown>
    deviceDB.layCached({ ...cached, lease_key: await makeLeaseKey() })
    const again = await anotherSession().build(demandStored())
    await again.ensureUnlocked()
    await TH.expectRefusal(again.sealStampedString('sk-test', Stamp), 'damaged_lease')
    expect(again.isLocked).to.be.true
    await TH.eventually(() => deviceDB.cachedNow() === null)
    expect(deviceDB.tryVacate).toHaveBeenCalledOnce()
  })

  it("tells a row that is no lease as bad news and asks for the proof, leaving it to be cached over", async () => {
    const onBadNews = vi.fn()
    const { opts, demandStored, deviceDB } = await makeBornVault()
    const cached = deviceDB.cachedNow() as Record<string, unknown>
    deviceDB.layCached({ ...cached, lease_key: 'no key at all' })
    const listing = new VaultListing({ ...opts, onBadNews })
    const again = await listing.build(demandStored())
    await TH.expectRefusal(again.ensureUnlocked(), 'vault_locked')
    expect(onBadNews.mock.calls[0]?.[0]).to.deep.include({ refusalkind: 'damaged_lease' })
    await unlockTyping(again, byPassphrase(Passphrase))
    expect(again.isUnlocked).to.be.true
    listing.goodbye()
  })

  it("takes up, at the next ensureUnlocked, a lease another session cached after this vault's first look", async () => {
    const { vault, demandStored, anotherSession, deviceDB } = await makeBornVault()
    const record = demandStored()
    vault.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    const again = await anotherSession().build(record)
    await TH.expectRefusal(again.ensureUnlocked(), 'vault_locked')
    await unlockTyping(vault, byPassphrase(Passphrase))
    await again.ensureUnlocked()
    expect(await vaultRoundTrip(vault, again)).to.eq('sk-test')
  })

  it("erases the row at a lock() of a vault that holds no lease: the next session asks for the proof", async () => {
    const { demandStored, anotherSession, deviceDB } = await makeBornVault()
    const record = demandStored()
    const idle = await anotherSession().build(record)
    expect(idle.isLocked).to.be.true
    idle.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    const again = await anotherSession().build(record)
    await TH.expectRefusal(again.ensureUnlocked(), 'vault_locked')
  })
})

const expectLockWon = async ({ vault, deviceDB, demandStored }: Awaited<ReturnType<typeof makeBornVault>>, epoch0: number): Promise<void> => {
  expect(demandStored().gate.gate_epoch).to.eq(epoch0 + 1)
  expect(vault.isLocked).to.be.true
  await TH.eventually(() => deviceDB.cachedNow() === null)
  await TH.expectRefusal(vault.ensureUnlocked(), 'vault_locked')
}

describe("A lease renewed through a gate change", () => {
  it("renewed: a lease held is attached under the epoch that landed, its row cached, and the vault never reads locked on the way", async () => {
    const { vault, deviceDB, demandStored } = await makeBornVault()
    const sealed = await vault.sealStampedString('sk-test', Stamp)
    const epoch0 = vault.gate.gate_epoch
    vault.becomeNotifiable()
    const states: string[] = []
    vault.subscribe(() => { states.push(vault.lockState()) })
    await replaceTyping(vault, Passphrase, NewPassphrase)
    expect(vault.isUnlocked).to.be.true
    expect(states).to.not.include('locked')
    expect(demandStored().gate.gate_epoch).to.eq(epoch0 + 1)
    expect(deviceDB.cachedNow()).to.deep.include({ gate_epoch: epoch0 + 1 })
    expect(await vault.unsealStampedString(sealed, Stamp)).to.eq('sk-test')
  })

  it("was locked: a vault locked at the start lands the change and stays locked, caching no row", async () => {
    const { vault, deviceDB, demandStored } = await makeBornVault()
    const epoch0 = vault.gate.gate_epoch
    vault.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    deviceDB.tryCache.mockClear()
    await replaceTyping(vault, Passphrase, NewPassphrase)
    expect(vault.isLocked).to.be.true
    expect(demandStored().gate.gate_epoch).to.eq(epoch0 + 1)
    expect(deviceDB.tryCache).not.toHaveBeenCalled()
    expect(deviceDB.cachedNow()).to.be.null
  })

  it("lock crossed: a lock() past the enter key wins: the change lands, the new lease goes unattached, and no row stands", async () => {
    const born = await makeBornVault()
    const { vault } = born
    const epoch0 = vault.gate.gate_epoch
    const { world } = born.opts
    const { requestCleartext: asBefore } = world
    world.requestCleartext = async (gating) => {
      const attempting = gating.attempt({ antePassphraseClear: Passphrase, nextPassphraseClear: NewPassphrase } as never)
      vault.lock()
      await attempting
    }
    await vault.replacePassphrase()
    world.requestCleartext = asBefore
    await expectLockWon(born, epoch0)
  })

  it("lock crossed: a lock() as the commit lands wins too", async () => {
    const born = await makeBornVault()
    const { vault, opts: { vaultDB } } = born
    const epoch0 = vault.gate.gate_epoch
    const commit = vaultDB.tryReplacePassphrase.bind(vaultDB)
    vi.spyOn(vaultDB, 'tryReplacePassphrase').mockImplementationOnce(async (params) => {
      const landed = await commit(params)
      vault.lock()
      return landed
    })
    await replaceTyping(vault, Passphrase, NewPassphrase)
    await expectLockWon(born, epoch0)
  })
})

describe("A refused erase of the row: the panic", () => {
  const Refusal = new VaultError('storage_blocked', 'the disk is full')

  it("hears the host's onPanic, leaving the vault locked and enabled; a rejection of it goes to the platform and no further", async () => {
    const reported = stubReportError()
    const onPanic = vi.fn(() => Promise.reject(new Error('the host panicked')))
    const { vault, deviceDB } = await makeBornVault(byPassphrase(Passphrase), { onPanic })
    deviceDB.tryVacate.mockResolvedValueOnce(TH.bad(Refusal))
    vault.lock()
    expect(vault.isLocked).to.be.true
    await TH.eventually(() => reported.mock.calls.length === 1)
    expect(onPanic).toHaveBeenCalledWith(Refusal)
    expect(vault.isDisabled).to.be.false
    expect(deviceDB.cachedNow()).not.to.be.null
  })

  it("with no onPanic, on a platform with no reportError, still vacates the vault", async () => {
    const { vault, deviceDB } = await makeBornVault()
    deviceDB.tryVacate.mockResolvedValue(TH.bad(Refusal))
    vault.lock()
    await TH.eventually(() => vault.isDisabled)
    expect(deviceDB.tryVacate).toHaveBeenCalledTimes(2)
  })

  it("with no onPanic reports it and vacates the vault; the vacate's own refusal finds that done", async () => {
    const reported = stubReportError()
    const { vault, listing, deviceDB } = await makeBornVault()
    deviceDB.tryVacate.mockResolvedValue(TH.bad(Refusal))
    vault.lock()
    await TH.eventually(() => reported.mock.calls.length === 2)
    expect(reported).toHaveBeenCalledWith(Refusal)
    expect(vault.isDisabled).to.be.true
    expect(listing.at(vault.scope)).to.be.null
    expect(deviceDB.tryVacate).toHaveBeenCalledTimes(2)
  })
})

describe("The discards: sweep and vacate, down the chain", () => {
  const BoxDna = { boxlabel: 'anthropic_api_key', whisper: { val: 'sk-test' }, sidecar: {} }
  const makeVaultWithBox = async () => {
    const born = await makeBornVault()
    const box = await born.vault.boxListing.create({ ...born.vault.scope, ...BoxDna })
    return { ...born, box }
  }

  it("seals a box through the vault and opens it, end to end", async () => {
    const { box } = await makeVaultWithBox()
    expect(await box.extractWhisper()).to.deep.eq({ val: 'sk-test' })
  })

  it("sweep leaves the row, drops the lease, disables and unlists all the way down", async () => {
    const { vault, listing, box, deviceDB } = await makeVaultWithBox()
    const { boxListing } = vault
    await box.expose()
    expect(vault.sweep()).to.equal(vault)
    expect(vault.isLocked).to.be.true
    expect(vault.isDisabled).to.be.true
    expect(box.isDisabled).to.be.true
    expect(listing.at(vault.scope)).to.be.null
    expect(boxListing.at(box.scope)).to.be.null
    expect(box.whisper).to.equal(LOCKED)
    expect(deviceDB.cachedNow()).not.to.be.null
    expect(deviceDB.tryVacate).not.toHaveBeenCalled()
    expect(deviceDB.peek).not.toHaveBeenCalled()
  })

  it("vacate erases the row too, disables and unlists all the way down, and leaves the vaultDB untouched", async () => {
    const { vault, listing, box, deviceDB, demandStored } = await makeVaultWithBox()
    const stored = demandStored()
    vault.vacate()
    expect(vault.isLocked).to.be.true
    expect(box.isDisabled).to.be.true
    expect(listing.at(vault.scope)).to.be.null
    await TH.eventually(() => deviceDB.cachedNow() === null)
    expect(demandStored()).to.eq(stored)
  })

  it("past a discard every guard refuses, what would take a call refuses, and lock, sweep and vacate are no-ops", async () => {
    const { vault, box, deviceDB } = await makeVaultWithBox()
    vault.sweep()
    TH.expectSyncRefusal(() => vault.demandEnabled(), 'disabled')
    TH.expectSyncRefusal(() => vault.demandUsable(), 'disabled')
    TH.expectSyncRefusal(() => vault.demandBoxesUsable(), 'disabled')
    TH.expectSyncRefusal(() => box.demandSendable(), 'disabled')
    TH.expectSyncRefusal(() => box.demandUnsealable(), 'disabled')
    TH.expectSyncRefusal(() => { box.whisper = { val: 'sk-test' } }, 'disabled')
    await TH.expectRefusal(unlockTyping(vault, byPassphrase(Passphrase)), 'disabled')
    await TH.expectRefusal(vault.fetch(), 'disabled')
    await TH.expectRefusal(vault.sealStampedString('sk-test', Stamp), 'disabled')
    expect(vault.lock().sweep().vacate()).to.equal(vault)
    expect(box.lock().sweep().vacate()).to.equal(box)
    expect(deviceDB.tryVacate).not.toHaveBeenCalled()
  })

  it("past a discard a vault's record stays readable, for a log or a debugger", async () => {
    const { vault, demandStored } = await makeBornVault()
    vault.sweep()
    expect(vault.fullRecord).to.deep.equal(demandStored())
    expect(vault.gate.gate_epoch).to.eq(demandStored().gate.gate_epoch)
  })

  it("a hydrate past a discard refuses only where it fetches: a timely record answers the instance, a stale one 'disabled'", async () => {
    const { vault, box } = await makeVaultWithBox()
    box.sweep()
    await expect(box.hydrate()).resolves.to.eq(box)
    await TH.expectRefusal(box.hydrate({ maxMillisSinceRefresh: 0 }), 'disabled')
    vault.sweep()
    await expect(vault.hydrate()).resolves.to.eq(vault)
    await TH.expectRefusal(vault.hydrate({ maxMillisSinceRefresh: 0 }), 'disabled')
  })

  it("a sweep crossing ensureUnlocked's peek at the cached lease refuses 'disabled', nobody asked", async () => {
    const { vault, listing, deviceDB } = await makeBornVault()
    vault.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    const dialog = vi.fn()
    listing.world.requestCleartext = dialog
    deviceDB.peek.mockImplementationOnce(() => {
      vault.sweep()
      return Promise.resolve(null)
    })
    await TH.expectRefusal(vault.ensureUnlocked(), 'disabled')
    expect(dialog).not.toHaveBeenCalled()
  })

  it("a swept listing stores nothing: a put or a delete refuses 'disabled' before reaching the vaultDB", async () => {
    const { listing, demandStored } = await makeBornVault()
    const stored = demandStored()
    listing.sweep()
    await TH.expectRefusal(listing.put(stored, stored), 'disabled')
    await TH.expectRefusal(listing.del(stored), 'disabled')
    expect(demandStored()).to.eq(stored)
  })

  it("a box listing swept with its vault refuses a birth 'disabled', ahead of the lock the sweep left", async () => {
    const { vault, box } = await makeVaultWithBox()
    const boxes = vault.boxListing
    vault.sweep()
    await TH.expectRefusal(boxes.create({ ...box.scope, ...BoxDna, boxlabel: 'other_key' }), 'disabled')
  })

  it("a listing past a sweep or a vacate takes no further call, and answers a late notice with nothing", async () => {
    const { listing, vault, demandStored } = await makeBornVault()
    const record = demandStored()
    await listing.hello()
    expect(listing.sweep()).to.equal(listing)
    expect(vault.isDisabled).to.be.true
    expect(listing.things).to.have.lengthOf(0)
    await TH.expectRefusal(listing.hello(), 'disabled')
    await TH.expectRefusal(listing.fetch(vault.scope), 'disabled')
    await TH.expectRefusal(listing.build(record), 'disabled')
    expect(listing.vacate()).to.equal(listing)
    expect(listing.things).to.have.lengthOf(0)
  })

  it("a listener's throw at a discard goes to the platform, and the discard goes on", async () => {
    const reported = stubReportError()
    const { vault, listing } = await makeBornVault()
    vault.becomeNotifiable()
    const thrown = new Error('the listener threw')
    vault.subscribe(() => { throw thrown })
    vault.lock()
    expect(reported).toHaveBeenCalledWith(thrown)
    vault.sweep()
    expect(listing.at(vault.scope)).to.be.null
  })
})

/** Every value `holder` shows by a field or getter, own or inherited, symbols too; its methods stay uncalled. */
const valuesShownBy = (holder: object): unknown[] => {
  const shown: unknown[] = []
  for (let proto: object | null = holder; proto !== null && proto !== Object.prototype; proto = Object.getPrototypeOf(proto) as object | null) {
    for (const ckey of Reflect.ownKeys(proto)) {
      try { shown.push(Reflect.get(holder, ckey)) } catch { /* a getter's refusal shows nothing */ }
    }
  }
  return shown
}

describe("a vault and a lease show neither the lease friend nor the lease key handle, one level deep, by identity", () => {
  it("no field or getter of a vault or its lease shows either, nor Object.keys or JSON.stringify", async () => {
    const born = await makeBornVaultAndFriend()
    const { vault, deviceDB, friend } = born
    const lease = await makeFreshLease(born)
    await lease.attach()
    const row = deviceDB.cachedNow() as Record<string, unknown>
    expect(row['lease_key']).to.be.an.instanceof(CryptoKey)
    for (const holder of [vault, lease]) {
      const shown = valuesShownBy(holder)
      expect(shown).to.not.include(friend)
      expect(shown).to.not.include(row['lease_key'])
      expect(shown).to.not.include(row)
      const json = JSON.stringify(holder)
      for (const named of ['friend', 'leaseFriend', 'peekLease', 'lease_key', 'vault_key_lease_wrapped']) {
        expect(Object.keys(holder)).to.not.include(named)
        expect(json).to.not.include(named)
      }
    }
    expect('leaseFriend' in vault).to.be.false
    expect('friend' in lease).to.be.false
  })
})
