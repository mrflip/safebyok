/** Behaviours an old guarantee forbids that the Coach has not ruled on, each pinned as the model does it today.
 * This file keeps the storable sprint's pins and the sections the newvault sprint's threads 2 to 4 appended;
 * a new pin goes in the loosened file of its model, one per model (`vault.test.ts`, `box.test.ts`,
 * `lease.test.ts`), named for what it pins. Each `it` names the guarantee's source and line in its title.
 */

import { describe, expect, it, vi } from 'vitest'
import { BoxListing } from '../../src/models/box-listing'
import * as TH from '../test-helpers'
import { TestableBox, boxListingOf, fakeSealBoxListingOf, fullBoxRecord, sparseBoxRecord, tombstoneBoxRecord, useModelsWorld, T0 } from '../test-helpers/models-world'
import { Dna, LeaseMillis, Passphrase, boxWorldOf, makeVaultWorld, useVaultWorlds } from '../test-helpers/vault-world'

const held = useModelsWorld()
useVaultWorlds()

describe("the staged edit reconcileStaged drops or carries", () => {
  const CentralRev = { revision_seq: 2, revision_tok: 'rev-c2' }
  const OtherRev   = { revision_seq: 3, revision_tok: 'rev-other', written_at: T0 + 3000 }
  const Staged = () => fullBoxRecord({ revision_seq: 3, revision_tok: 'rev-s3', written_at: T0 + 300, sidecar: { note: 'staged' } })
  const boxOf = () => new TestableBox(held.mw.world, boxListingOf(held.mw), held.mw.cache, fullBoxRecord(CentralRev), Staged(), { maxMillisSinceRefresh: 10 * 60_000 })

  it("README.md:1109, 'never merges two writes -- a write that lost must be seen': a fetch meeting another device's newer box drops the edit staged here, resolves, and tells no bad news", async () => {
    const listing = boxListingOf(held.mw)
    const box = await listing.build(fullBoxRecord(CentralRev))
    await box.edit({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'mine' } })
    expect(box.hasStaged).to.be.true
    held.mw.willGet(held.mw.answerOf(box.scope, fullBoxRecord({ ...OtherRev, sidecar: { note: 'theirs' } })))
    await listing.fetch(box.scope)
    expect(box.hasStaged).to.be.false
    expect(box.sidecar).to.deep.equal({ note: 'theirs' })
    expect(held.mw.badnews).to.deep.equal([])
  })

  it("whiteboard/20261028-storable_base/receive-principles.md:9, 'Don't throw away customer data': a newer sparse record drops the staged edit, the only full copy of its sidecar, and keeps it nowhere", () => {
    const box = boxOf()
    const { badnews } = box.receive(sparseBoxRecord(OtherRev))
    expect(badnews).to.deep.equal([])
    expect(box._cheat_staged).to.be.null
    expect(box._cheat_central).to.deep.equal(sparseBoxRecord(OtherRev))
    expect(box.sidecar).to.be.null
  })

  it("whiteboard/20261028-storable_base/receive-principles.md:9, 'Don't throw away customer data': a deletion from another device drops the staged edit, and the box reads as gone", () => {
    const box = boxOf()
    const { badnews } = box.receive(tombstoneBoxRecord(OtherRev))
    expect(badnews).to.deep.equal([])
    expect(box._cheat_staged).to.be.null
    expect(box.isPresent).to.be.false
  })

  it("VOCABULARY.md:91, 'revision_tok ... is part of the box's stamp': the ouch carry gives the staged edit a new revision_tok and seq, its sealed parts as they were, not sealed again", () => {
    const box = boxOf()
    box.receive(tombstoneBoxRecord(OtherRev, 'd'))
    const staged = box._cheat_staged
    expect(staged?.revision_seq).to.eq(4)
    expect(staged?.revision_tok).to.not.be.oneOf(['rev-s3', 'rev-other'])
    expect(box.box_key_wrapped).to.deep.equal(Staged().box_key_wrapped)
    expect(box.whisper_ciphered).to.deep.equal(Staged().whisper_ciphered)
  })
})

// == [Creation and re-creation]: registered_at over a rebirth, the tombstone's registered_at

describe("registered_at over a rebirth", () => {
  it("VOCABULARY.md:153 (registered_at is when a box was first stored): a box deleted and reborn is registered at the rebirth's edit, not its first store, nor the put that stores it", async () => {
    held.mw.seedStore(fullBoxRecord())
    const box = await fakeSealBoxListingOf(held.mw).build(fullBoxRecord())
    await box.del()
    held.mw.setNow(T0 + 5000)
    await box.edit({ whisper: { val: 'sk-test-0000' }, sidecar: {} })
    held.mw.setNow(T0 + 9000)
    await box.send({ whisper: { val: 'sk-test-0000' }, sidecar: {} })
    expect(box._cheat_central).to.deep.include({ am: 'a', registered_at: T0 + 5000, written_at: T0 + 9000 })
  })

  it("README.md:1282 (a record that will not decipher is written over with sidecar {} and its first-stored time now): a damaged box reborn is registered now, its sidecar the {} given", async () => {
    held.mw.seedStore(tombstoneBoxRecord({ revision_seq: 2 }, 'd'))
    const box = await fakeSealBoxListingOf(held.mw).build(tombstoneBoxRecord({ revision_seq: 2 }, 'd'))
    held.mw.setNow(T0 + 5000)
    await box.send({ whisper: { val: 'sk-test-0000' }, sidecar: {} })
    expect(box._cheat_central).to.deep.include({ am: 'a', registered_at: T0 + 5000, sidecar: {} })
  })

  it("VOCABULARY.md:155 (registered_at is when this life of a box began, kept by every later revision of that life): a store that answers a rebirth with the buried record's registered_at, as a database default might keep it, is adopted as central quietly, while the box's own registered_at keeps the rebirth's time, the answer being of the same life (thread 25)", async () => {
    const box = await fakeSealBoxListingOf(held.mw).build(tombstoneBoxRecord({ revision_seq: 2 }))
    held.mw.setNow(T0 + 5000)
    held.mw.willPut(({ record }) => held.mw.answerOf(box.scope, { ...record, registered_at: T0 }))
    await box.send({ whisper: { val: 'sk-test-0000' }, sidecar: {} })
    expect(box._cheat_central).to.deep.include({ registered_at: T0 })
    expect(box.registered_at).to.eq(T0 + 5000)
    expect(held.mw.badnews).to.deep.equal([])
  })
})

describe("the tombstone's registered_at", () => {
  it("VOCABULARY.md:153 (registered_at is when a box was first stored): the tombstone a del stages keeps the buried record's registered_at, though nothing is stored", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    held.mw.setNow(T0 + 5000)
    held.mw.willDel(() => new Promise(() => undefined))
    void box.del()
    await vi.advanceTimersByTimeAsync(0)
    expect(box._cheat_staged).to.deep.include({ am: 'x', registered_at: T0 })
    expect(box.registered_at).to.eq(T0)
  })

  it("VOCABULARY.md:153 (registered_at is when a box was first stored): the ouchstone made of a newer damaged record keeps the held record's registered_at, never the damaged record's", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    box.receive(tombstoneBoxRecord({ revision_seq: 2, registered_at: T0 + 3 }, 'd'))
    expect(box._cheat_central).to.deep.include({ am: 'd', revision_seq: 2, registered_at: T0 })
  })
})
// --

// == [Locking]: a lease handed out before lock()

describe("a lease a caller holds across lock()", () => {
  it("README.md:616, 'The key is dropped at once, and every call that needs it throws kind vault_locked': the vault reads locked at once, but a Lease taken from it before lock() seals until the forget lock() queued lands", async () => {
    const { listing } = makeVaultWorld()
    const vault = await listing.ensure(Dna, { passphrase: Passphrase })
    const lease = vault.demandLease()
    vault.lock()
    expect(vault.isLocked).to.be.true
    expect(lease.isInForce).to.be.true
    const sealed = await lease.sealWith(new TextEncoder().encode('sk-test'), { boxlabel: 'b' }, { revision_seq: 1 })
    expect(sealed.box_key_wrapped).to.be.ok
  })
})
// --

// == [The seal]: the deadline past before the autolock fires, the carried edit's seal

describe("the box's seal through the vault's lease", () => {
  it("README.md:591, 'The deadline is the truth, and a timer enforces it': past autolock_at, before the autolock fires, the vault reads unlocked and a box passes its guard, but the lease refuses its seal 'vault_locked', and the vault still reads unlocked after", async () => {
    const { listing, advance } = makeVaultWorld()
    const vault = await listing.ensure(Dna, { passphrase: Passphrase })
    const boxes = new BoxListing({ world: boxWorldOf(vault), store: held.mw.store, cache: held.mw.cache, maxMillisSinceRefresh: 10 * 60_000 })
    const box = await boxes.build({ ...Dna, boxlabel: 'anthropic_api_key', whisper: { val: 'sk-test-0000' }, sidecar: {} })
    advance(LeaseMillis)
    expect(vault.lockState()).to.eq('unlocked')
    expect(box.demandReadyToSeal()).to.equal(box)
    await TH.expectRefusal(box.seal({ val: 'sk-test-1111' }, {}), 'vault_locked')
    expect(vault.lockState()).to.eq('unlocked')
  })

  it("VOCABULARY.md:92, 'revision_tok ... is part of the box's stamp': the ouch carry re-revisions the staged edit over sealed parts bound to its old revision, so the edit it carries no longer opens (the fake lease stands in, keeping each whisper by the stamp it was sealed under, as the real one binds it)", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-c2' }))
    await box.edit({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'staged' } })
    expect(await box.unsealWhisper()).to.deep.equal({ val: 'sk-test-0000' })
    box.receive(tombstoneBoxRecord({ revision_seq: 3, revision_tok: 'rev-other', written_at: T0 + 3000 }, 'd'))
    expect(box._cheat_staged?.revision_seq).to.eq(4)
    await TH.expectRefusal(box.unsealWhisper(), 'damaged_box')
  })
})
// --

// == [Changing the gate]: the passkey stays, other devices stay unlocked

const NewPassphrase = 'a new passphrase for the vault'
/** A vault ensured with a passphrase and the laptop's passkey. */
const bornWithPasskey = async () => {
  const world = makeVaultWorld()
  const passkeyAnswer = await TH.passkeyOf('laptop')
  const vault = await world.listing.ensure(Dna, { passphrase: Passphrase, passkeyAnswer })
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
    await vault.replacePassphrase({ passphrase: Passphrase, nextPassphrase: NewPassphrase })
    expect(demandStored().gate.passkey_wayin).to.deep.equal(passkey_wayin)
    const proving = await vault.gate.attemptProof({ passkeyAnswer: await TH.passkeyOf('laptop') }, world)
    expect(proving.wayinkind).to.eq('passkey')
  })
})
// --
