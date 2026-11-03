/** Behaviours an old guarantee forbids that the Coach has not ruled on, each pinned as the model does it today.
 * This file keeps the storable sprint's pins and the sections the newvault sprint's threads 2 to 4 appended;
 * a new pin goes in the loosened file of its model, one per model (`vault.test.ts`, `box.test.ts`,
 * `lease.test.ts`), named for what it pins. Each `it` names the guarantee's source and line in its title.
 */

import { describe, expect, it } from 'vitest'
import * as TH from '../test-helpers'
import { boxListingOf, fakeSealBoxListingOf, fullBoxRecord, tombstoneBoxRecord, useModelsWorld, T0 } from '../test-helpers/models-world'
import { Dna, Passphrase, makeVaultWorld, useVaultWorlds, vaultRoundTrip } from '../test-helpers/vault-world'

const held = useModelsWorld()
useVaultWorlds()

// == [Creation and re-creation]: registered_at over a rebirth, the tombstone's registered_at

describe("registered_at over a rebirth", () => {
  it("VOCABULARY.md:153 (registered_at is when a box was first stored): a box deleted and reborn is registered at the rebirth's send, not its first store", async () => {
    held.mw.seedStore(fullBoxRecord())
    const box = await fakeSealBoxListingOf(held.mw).build(fullBoxRecord())
    await box.del()
    held.mw.setNow(T0 + 5000)
    await box.send({ whisper: { val: 'sk-test-0000' }, sidecar: {} })
    expect(box._cheat_central).to.deep.include({ am: 'a', registered_at: T0 + 5000 })
  })

  it("README.md:1282 (a record that will not decipher is written over with sidecar {} and its first-stored time now): a damaged box reborn is registered now, its sidecar the {} given", async () => {
    held.mw.seedStore(tombstoneBoxRecord({ revision_seq: 2 }, 'd'))
    const box = await fakeSealBoxListingOf(held.mw).build(tombstoneBoxRecord({ revision_seq: 2 }, 'd'))
    held.mw.setNow(T0 + 5000)
    await box.send({ whisper: { val: 'sk-test-0000' }, sidecar: {} })
    expect(box._cheat_central).to.deep.include({ am: 'a', registered_at: T0 + 5000, sidecar: {} })
  })

  it("VOCABULARY.md:155 (registered_at is when this life of a box began, kept by every later revision of that life): a store that answers a rebirth with the buried record's registered_at, as a database default might keep it, is adopted quietly, and the box's registered_at follows it, the rebirth's own time lost with the staged copy that carried it", async () => {
    const box = await fakeSealBoxListingOf(held.mw).build(tombstoneBoxRecord({ revision_seq: 2 }))
    held.mw.setNow(T0 + 5000)
    held.mw.willPut(({ record }) => held.mw.answerOf(box.scope, { ...record, registered_at: T0 }))
    await box.send({ whisper: { val: 'sk-test-0000' }, sidecar: {} })
    expect(box._cheat_central).to.deep.include({ registered_at: T0 })
    expect(box.registered_at).to.eq(T0)
    expect(held.mw.badnews).to.deep.equal([])
  })
})

describe("the tombstone's registered_at", () => {
  it("VOCABULARY.md:153 (registered_at is when a box was first stored): the ouchstone made of a newer damaged record keeps the held record's registered_at, never the damaged record's", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    box.receive(tombstoneBoxRecord({ revision_seq: 2, registered_at: T0 + 3 }, 'd'))
    expect(box._cheat_central).to.deep.include({ am: 'd', revision_seq: 2, registered_at: T0 })
  })
})
// --

// == [Changing the gate]: the passkey stays, other devices stay unlocked, no strength check

const NewPassphrase = 'a new passphrase for the vault'
const byPassphrase = (passphrase: string) => () => ({ passphrase })
const byLaptopPasskey = async () => ({ passkeyAnswer: await TH.passkeyOf('laptop') })
/** A vault created with a passphrase and the laptop's passkey. */
const bornWithPasskey = async () => {
  const world = makeVaultWorld()
  const passkeyAnswer = await TH.passkeyOf('laptop')
  const vault = await world.listing.create(Dna, () => ({ passphrase: Passphrase, passkeyAnswer }))
  const demandStored = () => {
    const record = world.storedNow()
    if (record === null) { throw new Error('nothing stored') }
    return record
  }
  return { ...world, vault, demandStored }
}

describe("the gate changes the vault sends", () => {
  it("README.md:841, 'A new passphrase removes the passkey with the old one': the passkey wayin is kept as stored, and the passkey still opens", async () => {
    const { vault, demandStored, opts: { world } } = await bornWithPasskey()
    const { passkey_wayin } = demandStored().gate
    await vault.replacePassphrase(byPassphrase(Passphrase), byPassphrase(NewPassphrase))
    expect(demandStored().gate.passkey_wayin).to.deep.equal(passkey_wayin)
    const proving = await vault.gate.attemptProof(byLaptopPasskey, world)
    expect(proving.wayinkind).to.eq('passkey')
  })

  it("README.md:844, 'Every change locks the other devices': another device, unlocked before the change, fetches the new gate and stays unlocked, its lease in force", async () => {
    const { vault, demandStored } = await bornWithPasskey()
    const other = makeVaultWorld(demandStored(), { device_id: 'device-2' })
    const theirs = await other.listing.build(demandStored())
    await theirs.ensureUnlocked(byPassphrase(Passphrase))
    await vault.replacePassphrase(byPassphrase(Passphrase), byPassphrase(NewPassphrase))
    other.storeBehindOurBack(demandStored())
    await theirs.fetch()
    expect(theirs.gate.pickle().passphrase_wayin).to.deep.equal(demandStored().gate.passphrase_wayin)
    expect(theirs.isUnlocked).to.be.true
    expect(await vaultRoundTrip(theirs, theirs)).to.eq('sk-test')
  })

  it("README.md:853, 'each change_passphrase sets -- is put to the vault's strengthChecker first': a one-letter new passphrase is set, as the world carries no checker", async () => {
    const { vault, opts: { world } } = await bornWithPasskey()
    await vault.replacePassphrase(byPassphrase(Passphrase), byPassphrase('x'))
    const proving = await vault.gate.attemptProof(byPassphrase('x'), world)
    expect(proving.wayinkind).to.eq('passphrase')
  })
})
// --
