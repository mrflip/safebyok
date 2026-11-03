/** What a vault does today that the README forbids, pinned as it is until the Coach rules. Each `it` names its source and line. */

import { describe, expect, it } from 'vitest'
import type { VaultRecord } from '../../src/models/models-shapes'
import type { PrfSalt } from '../../src/shapes/fields'
import * as TH from '../test-helpers'
import { NewPassphrase, Passphrase, byPassphrase, makeBornVault, makeBornVaultWithPasskey, makeVaultWorld, replaceTyping, storedVaultRecord, vaultRoundTrip, useVaultWorlds, unlockTyping } from '../test-helpers/vault-world'

useVaultWorlds()

describe("the ways in changing under a vault unlocked", () => {
  it("README.md:844, 'Every change locks the other devices ... each other device falls back to `locked`': a vault that receives a newer record whose wayins are not the ones in hand takes its gate and stays unlocked, its held lease still sealing", async () => {
    const record = await storedVaultRecord()
    const { listing, storeBehindOurBack } = makeVaultWorld(record)
    const vault = await listing.build(record)
    await unlockTyping(vault, byPassphrase(Passphrase))
    const other = makeVaultWorld(record, { device_id: 'device-2' })
    const theirs = await other.listing.build(record)
    await unlockTyping(theirs, byPassphrase(Passphrase))
    await replaceTyping(theirs, Passphrase, NewPassphrase)
    const received = storeBehindOurBack(other.demandStored())
    vault.receive(received)
    expect(vault.gate.pickle()).to.deep.equal(received.gate)
    expect(received.gate.passphrase_wayin).not.to.deep.equal(record.gate.passphrase_wayin)
    expect(vault.isUnlocked).to.be.true
    expect(await vaultRoundTrip(vault, vault)).to.eq('sk-test')
  })

})

describe("an older copy of the vault record", () => {
  it("README.md:1204, 'Storage handing back an older copy could otherwise bring back a way in that was removed': the next session on this device holds a vault record restored from before a passphrase change, and the passphrase replaced opens it again", async () => {
    const { vault, restoreRow, demandStored, anotherSession, deviceDB } = await makeBornVault()
    const ante = demandStored()
    await replaceTyping(vault, Passphrase, NewPassphrase)
    vault.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    restoreRow(ante)
    const later = anotherSession()
    const restored = await later.build(demandStored())
    await later.hello()
    expect(restored.isLocked).to.be.true
    expect(restored.revision_seq).to.eq(ante.revision_seq)
    expect(restored.gate.pickle()).to.deep.equal(ante.gate)
    await unlockTyping(restored, byPassphrase(Passphrase))
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
    await TH.expectRefusal(unlockTyping(vault, byPassphrase(Passphrase)), 'bad_record')
    expect(vault.isLocked).to.be.true
  })

  it("README.md:1085, 'damaged_vault: the vault's record, read from storage, failed its checks ... a retry will not mend it': a vault record stored without its gate refuses 'damaged_record' at ensureUnlocked's hydrate, and stores nothing", async () => {
    const { gate: _gate, ...gateless } = await storedVaultRecord()
    const { listing, storedNow } = makeVaultWorld(gateless as VaultRecord)
    const vault = await listing.build(listing.sparseOf(gateless))
    await TH.expectRefusal(vault.hydrate(), 'damaged_record')
    expect(vault.isFull).to.be.false
    expect(storedNow()).to.equal(gateless)
  })
})
