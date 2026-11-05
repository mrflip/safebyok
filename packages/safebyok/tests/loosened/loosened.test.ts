/** Behaviours an old guarantee forbids that the Coach has not ruled on, each pinned as the model does it today.
 * This file keeps the storable sprint's pins and the sections the newvault sprint's threads 2 to 4 appended;
 * a new pin goes in the loosened file of its model, one per model (`vault.test.ts`, `box.test.ts`,
 * `lease.test.ts`), named for what it pins. Each `it` names the guarantee's source and line in its title.
 */

import { describe, expect, it } from 'vitest'
import * as TH from '../test-helpers'
import { fakeSealBoxListingOf, fullBoxRecord, tombstoneBoxRecord, useModelsWorld, T0 } from '../test-helpers/models-world'
import { Dna, Passphrase, byPassphrase, makeVaultWorld, replaceTyping, useVaultWorlds, vaultRoundTrip, unlockTyping, buildTyping } from '../test-helpers/vault-world'
import { PasskeyProving, PassphraseProving } from '../../src/models/proving'
import { passphraseCleartext } from '../../src/shapes/gateish-shapes'

const held = useModelsWorld()
useVaultWorlds()

// == [Creation and re-creation]: registered_at over a rebirth, the tombstone's registered_at

describe("registered_at over a rebirth", () => {
  it("VOCABULARY.md:153 (registered_at is when a box was first stored): a box deleted and reborn is registered at the rebirth's put, not its first store", async () => {
    held.mw.seedStore(fullBoxRecord())
    const box = await fakeSealBoxListingOf(held.mw).build(fullBoxRecord())
    await box.del()
    held.mw.setNow(T0 + 5000)
    await box.put({ whisper: { val: 'sk-test-0000' }, sidecar: {} })
    expect(box._cheat_central).to.deep.include({ am: 'a', registered_at: T0 + 5000 })
  })

  it("VOCABULARY.md:155 (registered_at is when this life of a box began, kept by every later revision of that life): a store that answers a rebirth with the buried record's registered_at, as a database default might keep it, is adopted quietly, and the box's registered_at follows it, the rebirth's own time lost with the staged copy that carried it", async () => {
    const box = await fakeSealBoxListingOf(held.mw).build(tombstoneBoxRecord({ revision_seq: 2 }))
    held.mw.setNow(T0 + 5000)
    held.mw.willPut(({ record }) => held.mw.answerOf(box.scope, { ...record, registered_at: T0 }))
    await box.put({ whisper: { val: 'sk-test-0000' }, sidecar: {} })
    expect(box._cheat_central).to.deep.include({ registered_at: T0 })
    expect(box.registered_at).to.eq(T0)
    expect(held.mw.badnews).to.deep.equal([])
  })
})

// --

// == [Changing the gate]: the passkey stays, other devices stay unlocked, no strength check

const NewPassphrase = 'a new passphrase for the vault'
/** A vault created with a passphrase and the laptop's passkey. */
const bornWithPasskey = async () => {
  const world = makeVaultWorld()
  const vault = await buildTyping(world.listing, Dna, { passphraseClear: Passphrase, passkeyClear: await TH.passkeyOf('laptop') })
  const demandStored = () => {
    const record = world.storedNow()
    if (record === null) { throw new Error('nothing stored') }
    return record
  }
  return { ...world, vault, demandStored }
}

describe("the gate changes the vault sends", () => {
  it("safebyok-old/README.md:841, 'A new passphrase removes the passkey with the old one': the passkey wayin is kept as stored, and the passkey still opens", async () => {
    const { vault, demandStored } = await bornWithPasskey()
    const { passkey_wayin } = demandStored().gate
    await replaceTyping(vault, Passphrase, NewPassphrase)
    expect(demandStored().gate.passkey_wayin).to.deep.equal(passkey_wayin)
    const proving = await PasskeyProving.buildStored(vault.gate, await TH.passkeyOf('laptop'))
    expect(proving.wayinkind).to.eq('passkey')
  })

  it("safebyok-old/README.md:844, 'Every change locks the other devices': another device, unlocked before the change, fetches the new gate and stays unlocked, its lease in force", async () => {
    const { vault, demandStored } = await bornWithPasskey()
    const other = makeVaultWorld(demandStored(), { device_id: 'device-2' })
    const theirs = await other.listing.build(demandStored())
    await unlockTyping(theirs, byPassphrase(Passphrase))
    await replaceTyping(vault, Passphrase, NewPassphrase)
    other.storeBehindOurBack(demandStored())
    await theirs.fetch()
    expect(theirs.gate.pickle().passphrase_wayin).to.deep.equal(demandStored().gate.passphrase_wayin)
    expect(theirs.isUnlocked).to.be.true
    expect(await vaultRoundTrip(theirs, theirs)).to.eq('sk-test')
  })

  it("safebyok-old/README.md:853, 'each change_passphrase sets -- is put to the vault's strengthChecker first': a one-letter new passphrase is set, as the world carries no checker", async () => {
    const { vault, opts: { world } } = await bornWithPasskey()
    await replaceTyping(vault, Passphrase, 'x')
    const proving = await PassphraseProving.buildStored(vault.gate, passphraseCleartext.parse('x'), world)
    expect(proving.wayinkind).to.eq('passphrase')
  })
})
// --
