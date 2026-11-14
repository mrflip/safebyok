/** A vault's life end to end, through a real device, bank, lease and boxes, over the MemoryBankDB and the deviceDB of `vault-world.ts`: each `describe` a chapter, each test a sentence of the story. */

import { describe, expect, it } from 'vitest'
import { LOCKED } from '../../src/helpers/consts'
import type { Vault } from '../../src/models/vault'
import * as TH from '../test-helpers'
import { Dna, Passphrase, byPassphrase, makeBornVault, makeDeviceDB, unlockTyping, useVaultWorlds } from '../test-helpers/vault-world'

useVaultWorlds()

const Whisper    = { apiKey: 'sk-test-0000' }
const NewWhisper = { apiKey: 'sk-test-1111' }
const Sidecar    = Object.freeze({ account: 'work' })
const BoxDna     = { boxlabel: 'anthropic_api_key', whisper: Whisper, sidecar: Sidecar }

/** A vault as {@link makeBornVault} makes it, with a box put in it, stored in the bankDB every session and device here shares: `boxIn(vault)` fetches that box as `vault`'s session sees it. */
async function makeVaultWithBox() {
  const world = await makeBornVault()
  const box = await world.vault.putBox(BoxDna)
  const boxIn = async (vault: Vault) => {
    const found = await vault.fetchBox(BoxDna.boxlabel)
    if (found === null) { throw new Error('no box stored') }
    return found
  }
  const unsealIn = async (vault: Vault) => {
    const found = await boxIn(vault)
    return found.extractWhisper()
  }
  /** The next session on this device: a new device over the same bankDB and deviceDB, its bank ensured, and the vault it lists. */
  const openNextSession = async () => {
    const bank = await world.anotherSession()
    return { bank, vault: listedVaultOf(bank.vaultAt(Dna)) }
  }
  return { ...world, box, boxIn, unsealIn, openNextSession }
}

/** `vault`, demanded listed. */
function listedVaultOf(vault: Vault | null): Vault {
  if (vault === null) { throw new Error('no vault listed') }
  return vault
}

describe("A new vault", () => {
  it("is born unlocked, and stores neither the whisper nor the passphrase", async () => {
    const { bank, bankDB, vault, box, demandStored } = await makeVaultWithBox()
    expect(bank.isUnlocked).to.be.true
    expect(bank.maingate.passkey0).to.be.null
    expect(await box.extractWhisper()).to.deep.equal(Whisper)
    const { gaterows } = bankDB._cheat_shelfOf(Dna)
    const boxrows = bankDB._cheat_boxRowsOf(vault.scope, vault.bank_tok, vault.vault_tok)
    const stored = JSON.stringify([demandStored(), [...gaterows.values()], [...boxrows.values()]])
    expect(stored).to.include('ciphertext_b64')
    expect(stored).not.to.include(Whisper)
    expect(stored).not.to.include(Passphrase)
  })
})

describe("Locking, and the sessions after it on this device", () => {
  it("after lock(), the next session must unlock with the passphrase", async () => {
    const { vault, boxIn, openNextSession, deviceDB } = await makeVaultWithBox()
    vault.bank.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    const { vault: again } = await openNextSession()
    expect(again.bank.isLocked).to.be.true
    const box = await boxIn(again)
    await TH.expectRefusal(box.extractWhisper(), 'bank_locked')
    await TH.expectRefusal(again.bank.ensureUnlocked(), 'dismissed')
    await TH.expectRefusal(unlockTyping(again.bank, byPassphrase('not the passphrase')), 'wrong_passphrase')
    await unlockTyping(again.bank, byPassphrase(Passphrase))
    expect(await box.extractWhisper()).to.deep.equal(Whisper)
  })

  it("after a sweep, the next session unlocks without asking, until a lock() forgets the lease", async () => {
    const { device, unsealIn, openNextSession, deviceDB } = await makeVaultWithBox()
    device.sweep()
    const second = await openNextSession()
    expect(second.bank.isLocked).to.be.true
    await second.bank.ensureUnlocked()
    expect(await unsealIn(second.vault)).to.deep.equal(Whisper)
    second.bank.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    const third = await openNextSession()
    expect(third.bank.isLocked).to.be.true
    await TH.expectRefusal(third.bank.ensureUnlocked(), 'dismissed')
    await unlockTyping(third.bank, byPassphrase(Passphrase))
    expect(await unsealIn(third.vault)).to.deep.equal(Whisper)
  })

  it("a locked session unlocks with the lease a later session cached, and opens the whisper that session sealed, its box in hand brought up to it", async () => {
    const { vault, box, boxIn, unsealIn, openNextSession, deviceDB } = await makeVaultWithBox()
    vault.bank.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    const second = await openNextSession()
    await unlockTyping(second.bank, byPassphrase(Passphrase))
    const theirs = await boxIn(second.vault)
    await theirs.put({ whisper: NewWhisper, sidecar: Sidecar })
    await vault.bank.ensureUnlocked()
    expect(vault.bank.isUnlocked).to.be.true
    expect(await unsealIn(vault)).to.deep.equal(NewWhisper)
    expect(box.revision_seq).to.equal(theirs.revision_seq)
  })
})

describe("The lock, with a box exposed", () => {
  it("shows LOCKED for the exposed whisper and forgets the cached lease", async () => {
    const { vault, box, deviceDB, openNextSession } = await makeVaultWithBox()
    await box.expose()
    expect(box.whisper).to.deep.equal(Whisper)
    vault.bank.lock()
    expect(vault.bank.isLocked).to.be.true
    expect(box.whisper).to.equal(LOCKED)
    await TH.expectRefusal(box.extractWhisper(), 'bank_locked')
    await TH.eventually(() => deviceDB.cachedNow() === null)
    const { vault: again } = await openNextSession()
    expect(again.bank.isLocked).to.be.true
    await TH.expectRefusal(again.bank.ensureUnlocked(), 'dismissed')
  })

  it("shows the exposed whisper again once unlocked", async () => {
    const { vault, box } = await makeVaultWithBox()
    await box.expose()
    vault.bank.lock()
    expect(box.whisper).to.equal(LOCKED)
    await unlockTyping(vault.bank, byPassphrase(Passphrase))
    expect(box.whisper).to.deep.equal(Whisper)
    expect(await box.extractWhisper()).to.deep.equal(Whisper)
  })
})

/** The vault as another device has it: its own deviceDB, caching no lease yet, its bank ensured over the rows this device stored. */
async function openOtherDevice(world: Awaited<ReturnType<typeof makeVaultWithBox>>) {
  const deviceDB = makeDeviceDB()
  const bank = await world.anotherDevice(deviceDB.memoryDB).ensureBank()
  return { deviceDB, bank, vault: listedVaultOf(bank.vaultAt(Dna)) }
}

describe("Another device, over the same bankDB and boxes", () => {
  it("must unlock with the passphrase, even though this device has a cached lease", async () => {
    const world = await makeVaultWithBox()
    const { vault, unsealIn, deviceDB } = world
    const other = await openOtherDevice(world)
    expect(other.bank.isLocked).to.be.true
    await TH.expectRefusal(other.bank.ensureUnlocked(), 'dismissed')
    await unlockTyping(other.bank, byPassphrase(Passphrase))
    expect(other.deviceDB.cachedNow()).not.to.be.null
    expect(await unsealIn(other.vault)).to.deep.equal(Whisper)
    vault.bank.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    expect(other.bank.isUnlocked).to.be.true
    expect(other.deviceDB.cachedNow()).not.to.be.null
  })

  it("seals a whisper that this device opens", async () => {
    const world = await makeVaultWithBox()
    const { vault, boxIn, unsealIn } = world
    const other = await openOtherDevice(world)
    await unlockTyping(other.bank, byPassphrase(Passphrase))
    const theirs = await boxIn(other.vault)
    await theirs.put({ whisper: NewWhisper, sidecar: Sidecar })
    expect(await unsealIn(vault)).to.deep.equal(NewWhisper)
  })
})
