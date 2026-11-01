/** What a vault does today that the README forbids, pinned as it is until the Coach rules. Each `it` names its source and line. */

import { describe, expect, it } from 'vitest'
import type { VaultRecord } from '../../src/models/models-shapes'
import type { PrfSalt } from '../../src/shapes/fields'
import * as TH from '../test-helpers'
import { NewPassphrase, Passphrase, byPasskey, byPassphrase, makeBornVault, makeBornVaultWithPasskey, makeVaultWorld, roundTrip, storedVaultRecord, useVaultWorlds } from '../test-helpers/vault-world'

useVaultWorlds()

describe("the ways in changing under a vault unlocked", () => {
  it("README.md:844, 'Every change locks the other devices ... each other device falls back to `locked`': a vault that receives a newer record whose wayins are not the ones in hand takes its gate and stays unlocked, its held lease still sealing", async () => {
    const record = await storedVaultRecord()
    const { listing, storeBehindOurBack } = makeVaultWorld(record)
    const vault = await listing.build(record)
    const held = await vault.ensureUnlocked(byPassphrase(Passphrase))
    const other = makeVaultWorld(record, { device_id: 'device-2' })
    const theirs = await other.listing.build(record)
    await theirs.ensureUnlocked(byPassphrase(Passphrase))
    await theirs.replacePassphrase({ passphrase: Passphrase, nextPassphrase: NewPassphrase })
    const received = storeBehindOurBack(other.demandStored())
    vault.receive(received)
    expect(vault.gate.pickle()).to.deep.equal(received.gate)
    expect(received.gate.passphrase_wayin).not.to.deep.equal(record.gate.passphrase_wayin)
    expect(vault.isUnlocked).to.be.true
    expect(vault.demandLease()).to.equal(held)
    expect(await roundTrip(held, held)).to.eq('sk-test')
  })

  it("README.md:844, 'each other device falls back to `locked` and must unlock again': a lease another device kept under its passkey is taken up at its next session's hello after the passkey was revoked here, and opens what this device seals", async () => {
    const { vault, demandStored } = await makeBornVaultWithPasskey()
    const other = makeVaultWorld(demandStored(), { device_id: 'device-2' })
    const theirs = await other.listing.build(other.demandStored())
    await theirs.ensureUnlocked(await byPasskey('laptop'))
    other.listing.goodbye()
    await vault.revokePasskey(byPassphrase(Passphrase))
    other.storeBehindOurBack(demandStored())
    const later = other.anotherSession()
    const again = await later.build(other.demandStored())
    expect(other.deviceDB.cachedNow()).not.to.be.null
    expect(again.isLocked).to.be.true
    await later.hello()
    expect(again.gate.pkWayin).to.be.null
    expect(again.isUnlocked).to.be.true
    expect(await roundTrip(vault.demandLease(), again.demandLease())).to.eq('sk-test')
  })
})

describe("an older copy of the vault record", () => {
  it("README.md:1204, 'Storage handing back an older copy could otherwise bring back a way in that was removed': the next session on this device holds a vault record restored from before a passphrase change, and the passphrase replaced opens it again", async () => {
    const { vault, opts, demandStored, anotherSession, deviceDB } = await makeBornVault()
    const ante = demandStored()
    await vault.replacePassphrase({ passphrase: Passphrase, nextPassphrase: NewPassphrase })
    vault.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    await opts.store.put(ante, demandStored().revision_tok)
    const later = anotherSession()
    const restored = await later.build(demandStored())
    await later.hello()
    expect(restored.isLocked).to.be.true
    expect(restored.revision_seq).to.eq(ante.revision_seq)
    expect(restored.gate.pickle()).to.deep.equal(ante.gate)
    await restored.ensureUnlocked(byPassphrase(Passphrase))
    expect(restored.isUnlocked).to.be.true
  })
})

describe("a vault record stored damaged", () => {
  it("README.md:810, 'A way in stored in a form this package never writes cannot be tried, but the other still opens the vault': a passkey wayin stored with a salt too short to be one passes the record's check, then refuses the passphrase's unlock 'bad_record'", async () => {
    const { demandStored } = await makeBornVaultWithPasskey()
    const record = demandStored()
    const { passkey_wayin } = record.gate
    if (passkey_wayin === null) { throw new Error('no passkey wayin') }
    const damaged: VaultRecord = { ...record, gate: { ...record.gate, passkey_wayin: { ...passkey_wayin, prf_salt_b64: 'short' as PrfSalt } } }
    const { listing } = makeVaultWorld(damaged)
    const vault = await listing.build(damaged)
    expect(vault.isFull).to.be.true
    await TH.expectRefusal(vault.ensureUnlocked(byPassphrase(Passphrase)), 'bad_record')
    expect(vault.isLocked).to.be.true
  })

  it("README.md:1085, 'damaged_vault: the vault's record, read from storage, failed its checks ... a retry will not mend it': a vault record stored without its gate reads as sparse, so ensureUnlocked, edit and send each refuse 'bad_option', asking for a hydrate that will never bring a gate, and store nothing", async () => {
    const { gate: _gate, ...gateless } = await storedVaultRecord()
    const { listing, storedNow } = makeVaultWorld(gateless as VaultRecord)
    const vault = await listing.build(listing.sparseOf(gateless))
    await TH.expectRefusal(vault.ensureUnlocked(byPassphrase(Passphrase)), 'bad_option')
    await vault.hydrate()
    expect(vault.isFull).to.be.false
    await TH.expectRefusal(vault.edit({}), 'bad_option')
    await TH.expectRefusal(vault.send({}), 'bad_option')
    expect(storedNow()).to.equal(gateless)
  })
})
