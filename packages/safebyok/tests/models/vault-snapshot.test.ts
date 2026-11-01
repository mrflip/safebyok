import { describe, expect, it, vi } from 'vitest'
import { DefaultPesterMillis } from '../../src/models/vault'
import * as Phrases from '../../src/phrases'
import * as TH from '../test-helpers'
import { Dna, LeaseMillis, Passphrase, T0, byPassphrase, declineAtOnce, makeBornVault, makeBornVaultWithPasskey, makeVaultWorld, storedVaultRecord, useVaultWorlds } from '../test-helpers/vault-world'

useVaultWorlds()

const SnapshotFieldnames = [
  'applabel', 'user_id', 'vaultlabel', 'vault_tok', 'revision_tok', 'revision_seq', 'registered_at', 'written_at',
  'present', 'full', 'lockState', 'autolock_at', 'hasPasskey', 'boxes', 'refreshedAt', 'trouble',
]

// == [The snapshot]: what it shows, and when it is remade

describe("vault.getSnapshot(): the vault as a host renders it", () => {
  it("shows a vault just born unlocked, its lease's autolock_at, no passkey, no boxes and no trouble, frozen", async () => {
    const { vault } = await makeBornVault()
    const snapshot = vault.getSnapshot()
    expect(Object.keys(snapshot)).to.have.members(SnapshotFieldnames)
    expect(snapshot).to.include({ ...Dna, vault_tok: vault.vault_tok, present: true, full: true, lockState: 'unlocked', hasPasskey: false, trouble: null })
    expect(snapshot.autolock_at).to.eq(vault.demandLease().autolock_at)
    expect(snapshot.boxes).to.deep.equal([])
    expect(Object.isFrozen(snapshot)).to.be.true
    expect(Object.isFrozen(snapshot.boxes)).to.be.true
  })

  it("carries no secret material: no gate, no wayin, no salt, no passphrase", async () => {
    const { vault } = await makeBornVaultWithPasskey()
    const shown = JSON.stringify(vault.getSnapshot())
    for (const secretish of ['gate', 'wayin', 'salt', 'wrapped', 'credential_id', Passphrase]) { expect(shown).not.to.contain(secretish) }
  })

  it("shows whether the gate holds a passkey, and null while the vault is held sparse, until it is hydrated", async () => {
    const { vault: withPasskey } = await makeBornVaultWithPasskey()
    expect(withPasskey.getSnapshot().hasPasskey).to.be.true
    const record = await storedVaultRecord()
    const { listing } = makeVaultWorld(record)
    const vault = await listing.build(listing.sparseOf(record))
    expect(vault.getSnapshot()).to.include({ full: false, hasPasskey: null })
    await vault.hydrate()
    expect(vault.getSnapshot()).to.include({ full: true, hasPasskey: false })
  })

  it("keeps its identity until what it shows changes; lock() remakes it locked, with no autolock_at, and tells each listener once", async () => {
    const { vault } = await makeBornVault()
    const before = vault.getSnapshot()
    expect(vault.getSnapshot()).to.equal(before)
    const listener = vi.fn()
    vault.subscribe(listener)
    vault.lock()
    const locked = vault.getSnapshot()
    expect(locked).not.to.equal(before)
    expect(locked).to.include({ lockState: 'locked', autolock_at: null })
    expect(listener).toHaveBeenCalledTimes(1)
    vault.lock()
    expect(vault.getSnapshot()).to.equal(locked)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("moves refreshedAt when a fetch only confirms the record in hand, its revision unchanged", async () => {
    const { vault, advance } = await makeBornVault()
    const before = vault.getSnapshot()
    advance(5 * 60_000)
    await vault.fetch()
    const after = vault.getSnapshot()
    expect(after).not.to.equal(before)
    expect(after.refreshedAt).to.eq(T0 + (5 * 60_000))
    expect(after.revision_tok).to.eq(before.revision_tok)
  })

  it("shows the trouble of a vault whose stored record arrives damaged: 'damaged_vault', with its sentence, the vault absent", async () => {
    const { vault, listing, demandStored } = await makeBornVault()
    const stored = demandStored()
    vault.receive({ ...listing.sparseOf(stored), revision_seq: stored.revision_seq + 1, revision_tok: 'rev-damaged', am: 'd' })
    expect(vault.getSnapshot()).to.include({ present: false, full: false, hasPasskey: null })
    expect(vault.getSnapshot().trouble).to.deep.equal({ refusalkind: 'damaged_vault', message: Phrases.VaultStoredDamaged })
  })
})
// --

// == [The triggers' intervals]: autolockMinutes, pesterMinutes

describe("vault.autolockMinutes and vault.pesterMinutes: the triggers' intervals, in minutes", () => {
  it("reads the world's leaseMillis and pesterMillis, and the pester's default where the world names none", async () => {
    const { vault } = await makeBornVault()
    expect(vault.autolockMinutes).to.eq(LeaseMillis / 60_000)
    expect(vault.pesterMinutes).to.eq(DefaultPesterMillis / 60_000)
    const record = await storedVaultRecord()
    const { listing } = makeVaultWorld(record, { pesterMillis: 90 * 60_000 })
    const other = await listing.build(record)
    expect(other.pesterMinutes).to.eq(90)
  })
})
// --

// == [Try forms]: tryEnsureUnlocked, tryLock, tryTakeUpLease, tryTakeUpCachedLease

describe("the vault's try forms answer an Outcome where the plain verb throws", () => {
  it("tryEnsureUnlocked answers the lease, or the refusal: a declined gating 'vault_locked', a wrong passphrase 'wrong_passphrase'", async () => {
    const { vault, requestCleartext } = await makeBornVault()
    expect(await TH.expectGood(vault.tryEnsureUnlocked())).to.equal(vault.demandLease())
    vault.lock()
    requestCleartext.mockImplementationOnce(declineAtOnce)
    await TH.expectBad(vault.tryEnsureUnlocked(), 'vault_locked')
    await TH.expectBad(vault.tryEnsureUnlocked(byPassphrase('not the passphrase')), 'wrong_passphrase')
    await TH.expectGood(vault.tryEnsureUnlocked(byPassphrase(Passphrase)))
    expect(vault.isUnlocked).to.be.true
  })

  it("tryLock answers ok, the vault locked", async () => {
    const { vault } = await makeBornVault()
    await TH.expectGood(vault.tryLock())
    expect(vault.isLocked).to.be.true
  })

  it("tryTakeUpLease answers the lease taken up, or 'bad_option' for a lease of another vault", async () => {
    const { vault } = await makeBornVault()
    const { vault: other } = await makeBornVault()
    await TH.expectBad(other.tryTakeUpLease(vault.demandLease()), 'bad_option')
    const held = vault.demandLease()
    expect(await TH.expectGood(vault.tryTakeUpLease(held))).to.equal(held)
  })

  it("tryTakeUpCachedLease answers null where the vault holds a lease already", async () => {
    const { vault } = await makeBornVault()
    expect(await TH.expectGood(vault.tryTakeUpCachedLease())).to.be.null
  })
})
// --
