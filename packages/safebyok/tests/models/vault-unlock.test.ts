/** A vault's unlocking: ensureUnlocked and the lock, and the lease it holds by unlock or by the cache. */

import { describe, expect, it, vi } from 'vitest'
import { makeLeaseKey } from '../../src/helpers/crypto'
import * as Phrases from '../../src/helpers/phrases'
import { VaultError } from '../../src/refusals/errors'
import { passphraseCleartext } from '../../src/shapes/shapes-gateish'
import { NOVEL, PassphraseProving } from '../../src/models/proving'
import { DefaultLeaseMillis } from '../../src/models/vault'
import { VaultListing } from '../../src/models/vault-listing'
import * as TH from '../test-helpers'
import { LeaseMillis, NewPassphrase, Passphrase, byPasskey, byPassphrase, makeBornVault, makeBornVaultWithPasskey, makeVaultWorld, makeProving, replaceTyping, revokeTyping, storedVaultRecord, T0, useVaultWorlds, vaultRoundTrip, unlockVerbTyping, unlockTyping, hearingBadNews } from '../test-helpers/vault-world'

useVaultWorlds()

const Stamp = Object.freeze({ boxlabel: 'anthropic_api_key', revision_seq: 1 })

describe("proving.buildWayin: one wayin per proving, of its own vault", () => {
  it("refuses a second wayin of a proving that holds one, and a source proving of another vault", async () => {
    const { vault, opts: { world } } = await makeBornVault()
    const mine = await PassphraseProving.buildStored(vault.gate, passphraseCleartext.parse(Passphrase), world)
    await TH.expectRefusal(mine.buildWayin(NOVEL))
    const novel = await PassphraseProving.buildNovel(vault.gate.stamp, passphraseCleartext.parse('a new passphrase'), world)
    await TH.expectRefusal(novel.buildWayin(await makeProving({ vault_tok: 'vault-tok-other', registered_at: T0 })))
    const wayin = await novel.buildWayin(mine)
    expect(wayin.wayinkind).to.eq('passphrase')
  })
})

describe("Vault.ensureUnlocked and the vault's lock", () => {
  it("ensureUnlocked asks nobody of a vault unlocked, where unlock asks the user for proof", async () => {
    const { vault, listing } = await makeBornVault()
    const dialog = vi.fn()
    listing.world.requestCleartext = dialog
    await expect(vault.ensureUnlocked()).resolves.to.eq(vault)
    expect(dialog).not.toHaveBeenCalled()
    await TH.expectBad(vault.tryUnlock(), 'declined')
    expect(dialog).toHaveBeenCalledOnce()
  })

  it("the lease cached is ensureUnlocked's to take up: unlock asks for proof past it", async () => {
    const { opts, demandStored } = await makeBornVault()
    const dialog = vi.fn()
    opts.world.requestCleartext = dialog
    const next = await new VaultListing(opts).build(demandStored())
    await TH.expectBad(next.tryUnlock(), 'declined')
    expect(next.isUnlocked).to.be.false
    expect(dialog).toHaveBeenCalledOnce()
    await next.ensureUnlocked()
    expect(next.isUnlocked).to.be.true
    expect(dialog).toHaveBeenCalledOnce()
  })

  it("the seal verbs refuse a stamp of another vault or another life of it", async () => {
    const { vault } = await makeBornVault()
    const sealed = await vault.sealStampedString('sk-test', Stamp)
    const err = await TH.expectRefusal(vault.sealStampedString('sk-test', { ...Stamp, vaultlabel: 'another_vault' }))
    expect(err.message).to.eq(Phrases.StampOfOtherVault)
    await TH.expectRefusal(vault.unsealStampedString(sealed, { ...Stamp, vault_tok: 'another-life' }))
  })

  it("is born unlocked, under the lease its passphrase proving grants and the deviceDB caches; ensureUnlocked answers the vault and asks nothing", async () => {
    const { vault, deviceDB } = await makeBornVault()
    expect(vault.isUnlocked).to.be.true
    expect(vault.lockState()).to.eq('unlocked')
    expect(deviceDB.tryCache).toHaveBeenCalledOnce()
    expect(deviceDB.cachedNow()).to.deep.include({ gate_epoch: vault.gate.gate_epoch, wayinkind: 'passphrase' })
    expect(await vault.ensureUnlocked()).to.equal(vault)
    expect(await vaultRoundTrip(vault, vault)).to.eq('sk-test')
  })

  it("refuses a stamp of no fields, at the seal and at the unseal: a seal bound to nothing of the box's binds nothing", async () => {
    const { vault } = await makeBornVault()
    await TH.expectRefusal(vault.sealStampedString('sk-test', {}))
    await TH.expectRefusal(vault.unsealStampedString(await vault.sealStampedString('sk-test', Stamp), {}))
  })

  it("locks at `lock()`, reading locked before it returns and erasing the row; seal and unseal refuse; then 'declined' with no proof and a dialog closed unanswered, the proof's own refusal with a wrong one, and it unlocks with the right one", async () => {
    const { vault, deviceDB } = await makeBornVault()
    const sealed = await vault.sealStampedString('sk-test', Stamp)
    expect(vault.lock()).to.equal(vault)
    expect(vault.isLocked).to.be.true
    expect(vault.lockState()).to.eq('locked')
    await TH.expectRefusal(vault.sealStampedString('sk-test', Stamp), 'vault_locked')
    await TH.expectRefusal(vault.unsealStampedString(sealed, Stamp), 'vault_locked')
    await TH.eventually(() => deviceDB.cachedNow() === null)
    await TH.expectRefusal(vault.ensureUnlocked(), 'declined')
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

  it("vault.unlock on a vault held sparse fetches its full record, where the gating it launches would refuse", async () => {
    const { demandStored } = await makeBornVault()
    const record = demandStored()
    const { listing } = makeVaultWorld(record)
    const vault = await listing.build(listing.sparseOf(record))
    await unlockVerbTyping(vault, byPassphrase(Passphrase))
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

describe("The vault holds a lease: by unlock, or by the cache", () => {

  it("holds the lease, reading unlocked, and caches its row, in place of the lease it displaces", async () => {
    const { vault, deviceDB, advance } = await makeBornVault()
    const bornRow = deviceDB.cachedNow() as { proved_at: number }
    advance(1)
    await unlockVerbTyping(vault, byPassphrase(Passphrase))
    expect(vault.isUnlocked).to.be.true
    expect(deviceDB.cachedNow()).to.deep.include({ proved_at: bornRow.proved_at + 1 })
  })

  it("past a sweep refuses, leaving the vault locked and the row the sweep kept", async () => {
    const { demandStored, anotherSession, deviceDB } = await makeBornVault()
    const vault = await anotherSession().build(demandStored())
    const kept = deviceDB.cachedNow()
    expect(kept).not.to.be.null
    const peeked = TH.holdNextAnswer(deviceDB.memoryDB, 'peek')
    const ensuring = vault.ensureUnlocked()
    await peeked.reached
    vault.sweep()
    peeked.release()
    await TH.expectRefusal(ensuring)
    expect(vault.isLocked).to.be.true
    expect(deviceDB.cachedNow()).to.deep.equal(kept)
  })

  it("loses to a lock made while its row is being cached: the vault locked, and no row left cached", async () => {
    const { vault, deviceDB } = await makeBornVault()
    vault.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    const cached = TH.holdNextAnswer(deviceDB.memoryDB, 'tryCache')
    const unlocking = unlockTyping(vault, byPassphrase(Passphrase))
    await cached.reached
    expect(vault.isUnlocked).to.be.true
    vault.lock()
    cached.release()
    await unlocking
    await TH.eventually(() => deviceDB.cachedNow() === null)
    expect(vault.isLocked).to.be.true
  })

  it("holds the lease where the deviceDB refuses its row, told as bad news: it costs the next session a proof, not this one its lease", async () => {
    const onBadNews = vi.fn()
    const { opts, deviceDB, demandStored } = await makeBornVault()
    const record = demandStored()
    const listing = new VaultListing(hearingBadNews(opts, onBadNews))
    const vault = await listing.build(record)
    deviceDB.tryCache.mockResolvedValueOnce(TH.bad(new VaultError('storage_unavailable', 'the disk is full')))
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
    await TH.expectRefusal(again.ensureUnlocked(), 'declined')
    expect(deviceDB.cachedNow()).to.be.null
    await unlockTyping(again, byPassphrase(NewPassphrase))
    expect(again.isUnlocked).to.be.true
  })

  it("takes up no lease another device cached before the gate changed: a revoked passkey's holder asks for the proof", async () => {
    const { vault, demandStored } = await makeBornVaultWithPasskey()
    const other = makeVaultWorld(demandStored(), { device_id: 'device_2' })
    const theirs = await other.listing.build(other.demandStored())
    await unlockTyping(theirs, byPasskey('laptop'))
    await revokeTyping(vault, Passphrase)
    other.storeBehindOurBack(demandStored())
    const again = await other.anotherSession().build(other.demandStored())
    expect(other.deviceDB.cachedNow()).not.to.be.null
    await TH.expectRefusal(again.ensureUnlocked(), 'declined')
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
    await TH.expectRefusal(past.ensureUnlocked(), 'declined')
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
    await TH.expectRefusal(past.ensureUnlocked(), 'declined')
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
    const listing = new VaultListing(hearingBadNews(opts, onBadNews))
    const again = await listing.build(demandStored())
    await TH.expectRefusal(again.ensureUnlocked(), 'declined')
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
    await TH.expectRefusal(again.ensureUnlocked(), 'declined')
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
    await TH.expectRefusal(again.ensureUnlocked(), 'declined')
  })
})
