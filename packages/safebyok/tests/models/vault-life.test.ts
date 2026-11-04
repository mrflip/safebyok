/** A vault's life end to end, through real vaults, a real lease and real boxes, over the MemoryVaultDB and the fake deviceDB of `vault-world.ts`: each `describe` a chapter, each test a sentence of the story. */

import { afterEach, describe, expect, it } from 'vitest'
import { LOCKED, type VaultRecord } from '../../src/models/models-shapes'
import type { Vault } from '../../src/models/vault'
import * as TH from '../test-helpers'
import { type ModelsWorld, boxListingOf, makeModelsWorld } from '../test-helpers/models-world'
import { Dna, NewPassphrase, Passphrase, addPasskeyTyping, boxWorldOf, byPasskey, byPassphrase, makeBornVault, makeBornVaultWithPasskey, makeVaultWorld, replaceTyping, revokeTyping, useVaultWorlds, unlockTyping } from '../test-helpers/vault-world'

useVaultWorlds()

const modelsWorlds: ModelsWorld[] = []
afterEach(() => { for (const mw of modelsWorlds.splice(0)) { mw.dispose() } })

const Whisper    = Object.freeze({ val: 'sk-test-0000' })
const NewWhisper = Object.freeze({ val: 'sk-test-1111' })
const Sidecar    = Object.freeze({ account: 'work' })
const BoxDna     = { ...Dna, boxlabel: 'anthropic_api_key', whisper: Whisper, sidecar: Sidecar }

/** A vault as `born` makes it, with a box created in it, stored in the vaultDB every session and device here shares: `boxIn(vault)` fetches that box as `vault`'s world sees it. */
const makeVaultWithBox = async (born: ReturnType<typeof makeBornVault> = makeBornVault()) => {
  const world = await born
  const mw = makeModelsWorld({ fakeTimers: false })
  modelsWorlds.push(mw)
  const box = await boxListingOf(mw, { world: boxWorldOf(world.vault), vaultDB: world.opts.vaultDB }).create(BoxDna)
  const boxIn = async (vault: Vault) => {
    const found = await boxListingOf(mw, { world: boxWorldOf(vault), vaultDB: world.opts.vaultDB }).fetch(box.scope)
    if (found === null) { throw new Error('no box stored') }
    return found
  }
  const unsealIn = async (vault: Vault) => {
    const found = await boxIn(vault)
    return found.extractWhisper()
  }
  /** The next session on this device: a new listing over the same stores and deviceDB, holding the vault record stored, after its hello. */
  const openNextSession = async () => {
    const listing = world.anotherSession()
    const vault = await listing.build(world.demandStored())
    await listing.hello()
    return { listing, vault }
  }
  return { ...world, box, boxIn, unsealIn, openNextSession }
}

describe("Birth: a vault born with its gate seals its first box under the birth lease", () => {
  it("is born unlocked under a gate of its passphrase, which the vault record stores, and a box built in it opens the whisper it sealed; neither record stored holds the whisper or the passphrase", async () => {
    const { vault, box, demandStored } = await makeVaultWithBox()
    expect(vault.isUnlocked).to.be.true
    expect(demandStored().gate).to.deep.include(vault.gate.pickle())
    expect(demandStored().gate.passkey_wayin).to.be.null
    expect(await box.extractWhisper()).to.deep.equal(Whisper)
    const stored = JSON.stringify([demandStored(), box._cheat_central])
    expect(stored).not.to.include(Whisper.val)
    expect(stored).not.to.include(Passphrase)
  })
})

describe("Locking, and the sessions after it on this device", () => {
  it("erases the kept lease at lock(), so the next session asks for the passphrase: its box refuses 'vault_locked', a wrong passphrase refuses 'wrong_passphrase', and the right one opens the whisper the first session sealed", async () => {
    const { vault, boxIn, openNextSession, deviceDB } = await makeVaultWithBox()
    vault.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    const { vault: again } = await openNextSession()
    expect(again.isLocked).to.be.true
    const box = await boxIn(again)
    await TH.expectRefusal(box.extractWhisper(), 'vault_locked')
    await TH.expectRefusal(again.ensureUnlocked(), 'vault_locked')
    await TH.expectRefusal(unlockTyping(again, byPassphrase('not the passphrase')), 'wrong_passphrase')
    await unlockTyping(again, byPassphrase(Passphrase))
    expect(await box.extractWhisper()).to.deep.equal(Whisper)
  })

  it("leaves the cached lease at a sweep, so the next session's ensureUnlocked takes it up and opens the box without asking; a lock() there erases it, and the session after asks for the passphrase again", async () => {
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
    await TH.expectRefusal(third.vault.ensureUnlocked(), 'vault_locked')
    await unlockTyping(third.vault, byPassphrase(Passphrase))
    expect(await unsealIn(third.vault)).to.deep.equal(Whisper)
  })

  it("opens, in a first session locked, a whisper the next one sealed: the first takes up the lease the next cached at its next ensureUnlocked, asking nothing", async () => {
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

describe("The lock, with a box in hand", () => {
  it("locks the vault: the exposed whisper reads LOCKED, the unseal refuses 'vault_locked', and the cached lease is erased, so the next session asks for the passphrase", async () => {
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
    await TH.expectRefusal(again.ensureUnlocked(), 'vault_locked')
  })

  it("keeps the exposed whisper through the lock, as locking forgets nothing the box exposed: unlocked again by the passphrase, the box answers it again", async () => {
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
  it("replaces the passphrase: the vault stays unlocked through the change and still seals; the next session's old passphrase refuses 'wrong_passphrase', and the new one opens the box, as does the passkey, whose wayin the change kept", async () => {
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

  it("adds a passkey: the next session unlocks by the passkey alone, and opens the box sealed under the passphrase's lease before the passkey was added", async () => {
    const { vault, unsealIn, openNextSession, deviceDB } = await makeVaultWithBox()
    await addPasskeyTyping(vault, Passphrase, 'laptop')
    vault.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    const { vault: again } = await openNextSession()
    await unlockTyping(again, byPasskey('laptop'))
    expect(again.isUnlocked).to.be.true
    expect(await unsealIn(again)).to.deep.equal(Whisper)
  })

  it("revokes the passkey: a vault unlocked by the passkey stays unlocked through the revoke and still seals; the next session's passkey refuses 'absent_wayin', and the passphrase opens what that vault sealed", async () => {
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

/** The vault as another device holds it: its own deviceDB, caching no lease yet, over the record this device stored, after its hello. */
const openOtherDevice = async (stored: VaultRecord) => {
  const other = makeVaultWorld(stored, { device_id: 'device-2' })
  const vault = await other.listing.build(other.demandStored())
  await other.listing.hello()
  return { ...other, vault }
}

describe("Another device, over the same vaultDB and boxes", () => {
  it("asks the other device for the passphrase, though this one caches a lease; unlocked, it caches a lease of its own and opens the box this device sealed, and this device's lock() leaves it unlocked", async () => {
    const { vault, unsealIn, demandStored, deviceDB } = await makeVaultWithBox()
    const other = await openOtherDevice(demandStored())
    expect(other.vault.isLocked).to.be.true
    await TH.expectRefusal(other.vault.ensureUnlocked(), 'vault_locked')
    await unlockTyping(other.vault, byPassphrase(Passphrase))
    expect(other.deviceDB.cachedNow()).not.to.be.null
    expect(await unsealIn(other.vault)).to.deep.equal(Whisper)
    vault.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    expect(other.vault.isUnlocked).to.be.true
    expect(other.deviceDB.cachedNow()).not.to.be.null
  })

  it("seals, on the other device, a whisper this one opens: every lease of the vault holds its one vaultKey", async () => {
    const { vault, boxIn, unsealIn, demandStored } = await makeVaultWithBox()
    const other = await openOtherDevice(demandStored())
    await unlockTyping(other.vault, byPassphrase(Passphrase))
    const theirs = await boxIn(other.vault)
    await theirs.put({ whisper: NewWhisper, sidecar: Sidecar })
    expect(await unsealIn(vault)).to.deep.equal(NewWhisper)
  })
})
