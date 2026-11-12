/** A vault's unlocking: ensureUnlocked and the lock, and the lease it has by unlock or by the cache. */

import { describe, expect, it, vi } from 'vitest'
import { makeLeaseKey } from '../../src/helpers/crypto'
import * as Phrases from '../../src/helpers/phrases'
import { VaultError } from '../../src/refusals/errors'
import { passphraseCleartext } from '../../src/shapes/shapes-gateish'
import { NOVEL, PassphraseProving } from '../../src/models/proving'
import { VaultListing } from '../../src/models/vault-listing'
import * as TH from '../test-helpers'
import { LeaseMillis, NewPassphrase, Passphrase, byPasskey, byPassphrase, makeBornVault, makeBornVaultWithPasskey, makeVaultWorld, makeProving, replaceTyping, revokeTyping, storedVaultRecord, T0, useVaultWorlds, vaultRoundTrip, unlockVerbTyping, unlockTyping, hearingBadNews } from '../test-helpers/vault-world'

useVaultWorlds()

const Stamp = Object.freeze({ boxlabel: 'anthropic_api_key', revision_seq: 1 })

describe("proving.buildWayin", () => {
  it("refuses a second wayin of a proving that has one, and a source proving of another vault", async () => {
    const { vault, fakeBank: world } = await makeBornVault()
    const mine = await PassphraseProving.buildStored(vault.gate, passphraseCleartext.parse(Passphrase), world)
    await TH.expectRefusal(mine.buildWayin(NOVEL))
    const novel = await PassphraseProving.buildNovel(vault.gate.stamp, passphraseCleartext.parse('a new passphrase'), world)
    await TH.expectRefusal(novel.buildWayin(await makeProving({ vault_tok: 'vault-tok-other', registered_at: T0 })))
    const wayin = await novel.buildWayin(mine)
    expect(wayin.wayinkind).to.eq('passphrase')
  })
})

describe("Vault.ensureUnlocked and the vault's lock", () => {
  it("ensureUnlocked shows no dialog for an unlocked vault, where unlock always asks for proof", async () => {
    const { vault, fakeBank } = await makeBornVault()
    const dialog = vi.fn()
    fakeBank.requestCleartext = dialog
    await expect(vault.ensureUnlocked()).resolves.to.eq(vault)
    expect(dialog).not.toHaveBeenCalled()
    await TH.expectBad(vault.tryUnlock(), 'dismissed')
    expect(dialog).toHaveBeenCalledOnce()
  })

  it("only ensureUnlocked uses the cached lease, where unlock still asks for proof", async () => {
    const { fakeBank, opts, demandStored } = await makeBornVault()
    const dialog = vi.fn()
    fakeBank.requestCleartext = dialog
    const next = new VaultListing(fakeBank, opts).deliverRecord(demandStored())
    await TH.expectBad(next.tryUnlock(), 'dismissed')
    expect(next.isUnlocked).to.be.false
    expect(dialog).toHaveBeenCalledOnce()
    await next.ensureUnlocked()
    expect(next.isUnlocked).to.be.true
    expect(dialog).toHaveBeenCalledOnce()
  })

  it("seal and unseal refuse a stamp of another vault, or of another life of this one", async () => {
    const { vault } = await makeBornVault()
    const sealed = await vault.sealStampedString('sk-test', Stamp)
    const err = await TH.expectRefusal(vault.sealStampedString('sk-test', { ...Stamp, vaultlabel: 'another_vault' }))
    expect(err.message).to.eq(Phrases.StampOfOtherVault)
    await TH.expectRefusal(vault.unsealStampedString(sealed, { ...Stamp, vault_tok: 'another-life' }))
  })

  it("is born unlocked, with its lease cached", async () => {
    const { vault, deviceDB } = await makeBornVault()
    expect(vault.isUnlocked).to.be.true
    expect(vault.isLocked).to.be.false
    expect(deviceDB.tryStow).toHaveBeenCalledOnce()
    expect(deviceDB.cachedNow()).to.deep.include({ gate_epoch: vault.gate.gate_epoch, wayinkind: 'passphrase' })
    expect(await vault.ensureUnlocked()).to.equal(vault)
    expect(await vaultRoundTrip(vault, vault)).to.eq('sk-test')
  })

  it("refuses an empty stamp at seal and unseal", async () => {
    const { vault } = await makeBornVault()
    await TH.expectRefusal(vault.sealStampedString('sk-test', {}))
    await TH.expectRefusal(vault.unsealStampedString(await vault.sealStampedString('sk-test', Stamp), {}))
  })

  it("locks at lock() before it returns, until the right passphrase unlocks it", async () => {
    const { vault, deviceDB } = await makeBornVault()
    const sealed = await vault.sealStampedString('sk-test', Stamp)
    expect(vault.lock()).to.equal(vault)
    expect(vault.isLocked).to.be.true
    expect(vault.isLocked).to.be.true
    await TH.expectRefusal(vault.sealStampedString('sk-test', Stamp), 'vault_locked')
    await TH.expectRefusal(vault.unsealStampedString(sealed, Stamp), 'vault_locked')
    await TH.eventually(() => deviceDB.cachedNow() === null)
    await TH.expectRefusal(vault.ensureUnlocked(), 'dismissed')
    await TH.expectRefusal(unlockTyping(vault, byPassphrase('not the passphrase')), 'wrong_passphrase')
    expect(vault.isLocked).to.be.true
    await unlockTyping(vault, byPassphrase(Passphrase))
    expect(vault.isUnlocked).to.be.true
    expect(await vault.unsealStampedString(sealed, Stamp)).to.eq('sk-test')
    expect(deviceDB.forget).toHaveBeenCalledOnce()
    expect(deviceDB.tryStow).toHaveBeenCalledTimes(2)
    expect(deviceDB.cachedNow()).not.to.be.null
  })

  it("notifies listeners when the lock changes", async () => {
    const { vault } = await makeBornVault()
    vault.becomeNotifiable()
    const listener = vi.fn()
    vault.subscribe(listener)
    expect(vault.getSnapshot().isLocked).to.be.false
    vault.lock()
    expect(listener).toHaveBeenCalledOnce()
    expect(vault.getSnapshot().isLocked).to.be.true
  })

  it("unlocks a vault listed sparse by proof, its full record fetched for the gate", async () => {
    const { demandStored } = await makeBornVault()
    const record = demandStored()
    const { listing } = makeVaultWorld(record)
    const vault = listing.deliverRecord(listing.sparseOf(record))
    expect(vault.isLocked).to.be.true
    await unlockTyping(vault, byPassphrase(Passphrase))
    expect(vault.isUnlocked).to.be.true
    expect(vault.isFull).to.be.true
  })

  it("vault.unlock fetches the full record of a vault listed sparse", async () => {
    const { demandStored } = await makeBornVault()
    const record = demandStored()
    const { listing } = makeVaultWorld(record)
    const vault = listing.deliverRecord(listing.sparseOf(record))
    await unlockVerbTyping(vault, byPassphrase(Passphrase))
    expect(vault.isUnlocked).to.be.true
    expect(vault.isFull).to.be.true
  })

  it("refuses a seal or an unseal that a lock interrupts", async () => {
    const { vault } = await makeBornVault()
    const sealed = await vault.sealStampedString('sk-test', Stamp)
    const sealing = vault.sealStampedString('sk-test', Stamp)
    const unsealing = vault.unsealStampedString(sealed, Stamp)
    vault.lock()
    await Promise.all([TH.expectRefusal(sealing, 'vault_locked'), TH.expectRefusal(unsealing, 'vault_locked')])
  })

  it("seals nothing another vault can open", async () => {
    const { vault } = await makeBornVault()
    const { vault: other } = await makeBornVault()
    await TH.expectRefusal(other.unsealStampedString(await vault.sealStampedString('sk-test', Stamp), Stamp), 'damaged_whisper')
  })
})

describe("An unlock, by proof or by the cached lease", () => {

  it("takes the new lease and caches it over the old one", async () => {
    const { vault, deviceDB, advance } = await makeBornVault()
    const bornRow = deviceDB.cachedNow() as { proved_at: number }
    advance(1)
    await unlockVerbTyping(vault, byPassphrase(Passphrase))
    expect(vault.isUnlocked).to.be.true
    expect(deviceDB.cachedNow()).to.deep.include({ proved_at: bornRow.proved_at + 1 })
  })

  it("refuses after a sweep, leaving the vault locked and the cached row in place", async () => {
    const { demandStored, anotherSession, deviceDB } = await makeBornVault()
    const vault = anotherSession().deliverRecord(demandStored())
    const kept = deviceDB.cachedNow()
    expect(kept).not.to.be.null
    const peeked = TH.pendingNextAnswer(deviceDB.memoryDB, 'peek')
    const ensuring = vault.ensureUnlocked()
    await peeked.reached
    vault.sweep()
    peeked.release()
    await TH.expectRefusal(ensuring)
    expect(vault.isLocked).to.be.true
    expect(deviceDB.cachedNow()).to.deep.equal(kept)
  })

  it("yields to a lock that arrives while the lease is being cached", async () => {
    const { vault, deviceDB } = await makeBornVault()
    vault.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    const cached = TH.pendingNextAnswer(deviceDB.memoryDB, 'tryStow')
    const unlocking = unlockTyping(vault, byPassphrase(Passphrase))
    await cached.reached
    expect(vault.isUnlocked).to.be.true
    vault.lock()
    cached.release()
    await unlocking
    await TH.eventually(() => deviceDB.cachedNow() === null)
    expect(vault.isLocked).to.be.true
  })

  it("keeps the lease when the deviceDB refuses to cache it, and reports bad news", async () => {
    const onBadNews = vi.fn()
    const { fakeBank, opts, deviceDB, demandStored } = await makeBornVault()
    const record = demandStored()
    const listing = new VaultListing(fakeBank, hearingBadNews(opts, onBadNews))
    const vault = listing.deliverRecord(record)
    deviceDB.tryStow.mockResolvedValueOnce(TH.bad(new VaultError('storage_unavailable', 'the disk is full')))
    vault.lock()
    await unlockTyping(vault, byPassphrase(Passphrase))
    expect(vault.isUnlocked).to.be.true
    expect(onBadNews).toHaveBeenCalledOnce()
    listing.goodbye()
  })
})

describe("The cached lease, used only by ensureUnlocked", () => {
  it("unlocks the next session at its ensureUnlocked, without a dialog", async () => {
    const { vault, demandStored, anotherSession } = await makeBornVault()
    const later = anotherSession()
    const again = later.deliverRecord(demandStored())
    await later.hello()
    expect(again.isLocked).to.be.true
    expect(await again.ensureUnlocked()).to.equal(again)
    expect(again.isUnlocked).to.be.true
    expect(await vaultRoundTrip(vault, again)).to.eq('sk-test')
  })

  it("is not looked up at a hello", async () => {
    const { gate: _gate, ...sparse } = await storedVaultRecord()
    const tombstone = { ...sparse, am: 'x' as const }
    const { listing, deviceDB } = makeVaultWorld(tombstone as never)
    listing.deliverRecord(tombstone)
    await listing.hello()
    expect(deviceDB.peek).not.toHaveBeenCalled()
  })

  it("is forgotten, not used, when it was cached under an older gate", async () => {
    const { vault, demandStored, anotherSession, deviceDB } = await makeBornVault()
    vault.lock()
    await unlockTyping(vault, byPassphrase(Passphrase))
    const stale = deviceDB.cachedNow()
    await replaceTyping(vault, Passphrase, NewPassphrase)
    deviceDB.layCached(stale)
    const again = anotherSession().deliverRecord(demandStored())
    await TH.expectRefusal(again.ensureUnlocked(), 'dismissed')
    expect(deviceDB.cachedNow()).to.be.null
    await unlockTyping(again, byPassphrase(NewPassphrase))
    expect(again.isUnlocked).to.be.true
  })

  it("is not used when another device cached it before the gate changed", async () => {
    const { vault, demandStored } = await makeBornVaultWithPasskey()
    const other = makeVaultWorld(demandStored(), { device_id: '00000000-0000-4000-8000-000000000002' })
    const theirs = other.listing.deliverRecord(other.demandStored())
    await unlockTyping(theirs, byPasskey('laptop'))
    await revokeTyping(vault, Passphrase)
    other.putBehindOurBack(demandStored())
    const again = other.anotherSession().deliverRecord(other.demandStored())
    expect(other.deviceDB.cachedNow()).not.to.be.null
    await TH.expectRefusal(again.ensureUnlocked(), 'dismissed')
    expect(again.gate.pkWayin).to.be.null
    expect(other.deviceDB.cachedNow()).to.be.null
  })

  it("is used up to leaseMillis old, and ignored when any older", async () => {
    const { demandStored, anotherSession, advance, deviceDB } = await makeBornVault()
    advance(LeaseMillis)
    const within = anotherSession().deliverRecord(demandStored())
    await within.ensureUnlocked()
    expect(within.isUnlocked).to.be.true
    advance(1)
    const past = anotherSession().deliverRecord(demandStored())
    await TH.expectRefusal(past.ensureUnlocked(), 'dismissed')
    expect(past.isLocked).to.be.true
    expect(deviceDB.cachedNow()).to.not.be.null
  })

  it("locks the vault and is forgotten when it fails at its first seal", async () => {
    const { demandStored, anotherSession, deviceDB } = await makeBornVault()
    const cached = deviceDB.cachedNow() as Record<string, unknown>
    deviceDB.layCached({ ...cached, lease_key: await makeLeaseKey() })
    const again = anotherSession().deliverRecord(demandStored())
    await again.ensureUnlocked()
    await TH.expectRefusal(again.sealStampedString('sk-test', Stamp), 'damaged_lease')
    expect(again.isLocked).to.be.true
    await TH.eventually(() => deviceDB.cachedNow() === null)
    expect(deviceDB.forget).toHaveBeenCalledOnce()
  })

  it("is reported as bad news when its row is not a valid lease, and the user is asked for proof", async () => {
    const onBadNews = vi.fn()
    const { fakeBank, opts, demandStored, deviceDB } = await makeBornVault()
    const cached = deviceDB.cachedNow() as Record<string, unknown>
    deviceDB.layCached({ ...cached, lease_key: 'no key at all' })
    const listing = new VaultListing(fakeBank, hearingBadNews(opts, onBadNews))
    const again = listing.deliverRecord(demandStored())
    await TH.expectRefusal(again.ensureUnlocked(), 'dismissed')
    expect(onBadNews.mock.calls[0]?.[0]).to.deep.include({ refusalkind: 'damaged_lease' })
    await unlockTyping(again, byPassphrase(Passphrase))
    expect(again.isUnlocked).to.be.true
    listing.goodbye()
  })

  it("is used at the next ensureUnlocked when another session cached it after this vault first looked", async () => {
    const { vault, demandStored, anotherSession, deviceDB } = await makeBornVault()
    const record = demandStored()
    vault.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    const again = anotherSession().deliverRecord(record)
    await TH.expectRefusal(again.ensureUnlocked(), 'dismissed')
    await unlockTyping(vault, byPassphrase(Passphrase))
    await again.ensureUnlocked()
    expect(await vaultRoundTrip(vault, again)).to.eq('sk-test')
  })

  it("is forgotten at lock() even by a vault that has no lease", async () => {
    const { demandStored, anotherSession, deviceDB } = await makeBornVault()
    const record = demandStored()
    const idle = anotherSession().deliverRecord(record)
    expect(idle.isLocked).to.be.true
    idle.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    const again = anotherSession().deliverRecord(record)
    await TH.expectRefusal(again.ensureUnlocked(), 'dismissed')
  })
})
