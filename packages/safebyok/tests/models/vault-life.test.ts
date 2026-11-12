/** A vault's life end to end, through real vaults, a real lease and real boxes, over the MemoryVaultDB and the fake deviceDB of `vault-world.ts`: each `describe` a chapter, each test a sentence of the story. */

import { describe, expect, it } from 'vitest'
import { LOCKED } from '../../src/helpers/consts'
import type { VaultRecord } from '../../src/shapes/shapes-storage'
import type { Vault } from '../../src/models/vault'
import * as TH from '../test-helpers'
import { TestableBoxListing } from '../test-helpers/models-world'
import { Dna, NewPassphrase, Passphrase, addPasskeyTyping, boxWorldOf, byPasskey, byPassphrase, makeBornVault, makeBornVaultWithPasskey, makeVaultWorld, replaceTyping, revokeTyping, useVaultWorlds, unlockTyping } from '../test-helpers/vault-world'

useVaultWorlds()

const Whisper    = { apiKey: 'sk-test-0000' }
const NewWhisper = { apiKey: 'sk-test-1111' }
const Sidecar    = Object.freeze({ account: 'work' })
const BoxDna     = { ...Dna, boxlabel: 'anthropic_api_key', whisper: Whisper, sidecar: Sidecar }

/** A vault as `born` makes it, with a box created in it, stored in the vaultDB every session and device here shares: `boxIn(vault)` fetches that box as `vault`'s world sees it. */
async function makeVaultWithBox(born: ReturnType<typeof makeBornVault> = makeBornVault()) {
  const world = await born
  const box = await new TestableBoxListing(boxWorldOf(world.vault), { ...world.opts, scope: world.vault.scope }).create(BoxDna)
  const boxIn = async (vault: Vault) => {
    const found = await new TestableBoxListing(boxWorldOf(vault), { ...world.opts, scope: vault.scope }).get(box.scope, { maxMillisSinceRefresh: 0 })
    if (found === null) { throw new Error('no box stored') }
    return found
  }
  const unsealIn = async (vault: Vault) => {
    const found = await boxIn(vault)
    return found.extractWhisper()
  }
  /** The next session on this device: a new listing over the same vaultDB and deviceDB, with the vault record stored, after its hello. */
  const openNextSession = async () => {
    const listing = world.anotherSession()
    const vault = listing.deliverRecord(world.demandStored())
    await listing.hello()
    return { listing, vault }
  }
  return { ...world, box, boxIn, unsealIn, openNextSession }
}

describe("A new vault", () => {
  it("is born unlocked, and stores neither the whisper nor the passphrase", async () => {
    const { vault, box, demandStored } = await makeVaultWithBox()
    expect(vault.isUnlocked).to.be.true
    expect(demandStored().gate).to.deep.include(vault.gate.pickle())
    expect(demandStored().gate.passkey_wayin).to.be.null
    expect(await box.extractWhisper()).to.deep.equal(Whisper)
    const stored = JSON.stringify([demandStored(), box._cheat_central])
    expect(stored).not.to.include(Whisper)
    expect(stored).not.to.include(Passphrase)
  })
})

describe("Locking, and the sessions after it on this device", () => {
  it("after lock(), the next session must unlock with the passphrase", async () => {
    const { vault, boxIn, openNextSession, deviceDB } = await makeVaultWithBox()
    vault.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    const { vault: again } = await openNextSession()
    expect(again.isLocked).to.be.true
    const box = await boxIn(again)
    await TH.expectRefusal(box.extractWhisper(), 'vault_locked')
    await TH.expectRefusal(again.ensureUnlocked(), 'dismissed')
    await TH.expectRefusal(unlockTyping(again, byPassphrase('not the passphrase')), 'wrong_passphrase')
    await unlockTyping(again, byPassphrase(Passphrase))
    expect(await box.extractWhisper()).to.deep.equal(Whisper)
  })

  it("after a sweep, the next session unlocks without asking, until a lock() forgets the lease", async () => {
    const { listing, unsealIn, openNextSession, deviceDB } = await makeVaultWithBox()
    listing.sweep()
    const second = await openNextSession()
    expect(second.vault.isLocked).to.be.true
    await second.vault.ensureUnlocked()
    expect(await unsealIn(second.vault)).to.deep.equal(Whisper)
    second.vault.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    const third = await openNextSession()
    expect(third.vault.isLocked).to.be.true
    await TH.expectRefusal(third.vault.ensureUnlocked(), 'dismissed')
    await unlockTyping(third.vault, byPassphrase(Passphrase))
    expect(await unsealIn(third.vault)).to.deep.equal(Whisper)
  })

  it("a locked session unlocks with the lease a later session cached, and opens the whisper that session sealed", async () => {
    const { vault, box, boxIn, unsealIn, openNextSession, deviceDB } = await makeVaultWithBox()
    vault.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    const second = await openNextSession()
    await unlockTyping(second.vault, byPassphrase(Passphrase))
    const theirs = await boxIn(second.vault)
    await theirs.put({ whisper: NewWhisper, sidecar: Sidecar })
    await vault.ensureUnlocked()
    expect(vault.isUnlocked).to.be.true
    expect(await unsealIn(vault)).to.deep.equal(NewWhisper)
    expect(box.revision_seq).to.be.lessThan(theirs.revision_seq)
  })
})

describe("The lock, with a box exposed", () => {
  it("shows LOCKED for the exposed whisper and forgets the cached lease", async () => {
    const { vault, box, deviceDB, openNextSession } = await makeVaultWithBox()
    await box.expose()
    expect(box.whisper).to.deep.equal(Whisper)
    vault.lock()
    expect(vault.isLocked).to.be.true
    expect(box.whisper).to.equal(LOCKED)
    await TH.expectRefusal(box.extractWhisper(), 'vault_locked')
    await TH.eventually(() => deviceDB.cachedNow() === null)
    const { vault: again } = await openNextSession()
    expect(again.isLocked).to.be.true
    await TH.expectRefusal(again.ensureUnlocked(), 'dismissed')
  })

  it("shows the exposed whisper again once unlocked", async () => {
    const { vault, box } = await makeVaultWithBox()
    await box.expose()
    vault.lock()
    expect(box.whisper).to.equal(LOCKED)
    await unlockTyping(vault, byPassphrase(Passphrase))
    expect(box.whisper).to.deep.equal(Whisper)
    expect(await box.extractWhisper()).to.deep.equal(Whisper)
  })
})

describe("Changing the gate, with a box sealed before the change", () => {
  it("after the passphrase is replaced, only the new passphrase and the passkey unlock the next session", async () => {
    const { vault, box, unsealIn, openNextSession, deviceDB } = await makeVaultWithBox(makeBornVaultWithPasskey())
    await replaceTyping(vault, Passphrase, NewPassphrase)
    expect(vault.isUnlocked).to.be.true
    await box.put({ whisper: NewWhisper, sidecar: Sidecar })
    vault.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    const second = await openNextSession()
    await TH.expectRefusal(unlockTyping(second.vault, byPassphrase(Passphrase)), 'wrong_passphrase')
    await unlockTyping(second.vault, byPassphrase(NewPassphrase))
    expect(await unsealIn(second.vault)).to.deep.equal(NewWhisper)
    second.vault.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    const third = await openNextSession()
    await unlockTyping(third.vault, byPasskey('laptop'))
    expect(await unsealIn(third.vault)).to.deep.equal(NewWhisper)
  })

  // PasskeyAnswer @example
  it("an added passkey alone unlocks the next session and opens the box sealed before it", async () => {
    const { vault, unsealIn, openNextSession, deviceDB } = await makeVaultWithBox()
    await addPasskeyTyping(vault, Passphrase, 'laptop')
    vault.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    const { vault: again } = await openNextSession()
    await unlockTyping(again, byPasskey('laptop'))
    expect(again.isUnlocked).to.be.true
    expect(await unsealIn(again)).to.deep.equal(Whisper)
  })

  it("after the passkey is revoked, only the passphrase unlocks the next session", async () => {
    const { vault, box, unsealIn, openNextSession, deviceDB } = await makeVaultWithBox(makeBornVaultWithPasskey())
    vault.lock()
    await unlockTyping(vault, byPasskey('laptop'))
    await revokeTyping(vault, Passphrase)
    expect(vault.isUnlocked).to.be.true
    await box.put({ whisper: NewWhisper, sidecar: Sidecar })
    vault.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    const { vault: again } = await openNextSession()
    await TH.expectRefusal(unlockTyping(again, byPasskey('laptop')), 'absent_wayin')
    await unlockTyping(again, byPassphrase(Passphrase))
    expect(await unsealIn(again)).to.deep.equal(NewWhisper)
  })
})

/** The vault as another device has it: its own deviceDB, caching no lease yet, over the record this device stored, after its hello. */
async function openOtherDevice(stored: VaultRecord) {
  const other = makeVaultWorld(stored, { device_tok: '00000000-0000-4000-8000-000000000002' })
  const vault = other.listing.deliverRecord(other.demandStored())
  await other.listing.hello()
  return { ...other, vault }
}

describe("Another device, over the same vaultDB and boxes", () => {
  it("must unlock with the passphrase, even though this device has a cached lease", async () => {
    const { vault, unsealIn, demandStored, deviceDB } = await makeVaultWithBox()
    const other = await openOtherDevice(demandStored())
    expect(other.vault.isLocked).to.be.true
    await TH.expectRefusal(other.vault.ensureUnlocked(), 'dismissed')
    await unlockTyping(other.vault, byPassphrase(Passphrase))
    expect(other.deviceDB.cachedNow()).not.to.be.null
    expect(await unsealIn(other.vault)).to.deep.equal(Whisper)
    vault.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    expect(other.vault.isUnlocked).to.be.true
    expect(other.deviceDB.cachedNow()).not.to.be.null
  })

  it("seals a whisper that this device opens", async () => {
    const { vault, boxIn, unsealIn, demandStored } = await makeVaultWithBox()
    const other = await openOtherDevice(demandStored())
    await unlockTyping(other.vault, byPassphrase(Passphrase))
    const theirs = await boxIn(other.vault)
    await theirs.put({ whisper: NewWhisper, sidecar: Sidecar })
    expect(await unsealIn(vault)).to.deep.equal(NewWhisper)
  })
})
