/** A bank's unlocking: ensureUnlocked, unlock and lock, the lease it has by an unlock or by the cache, and its vaults' seals under that lease. */

import { describe, expect, it, vi } from 'vitest'
import { makeLeaseKey } from '../../src/helpers/crypto'
import * as Phrases from '../../src/helpers/phrases'
import { VaultError } from '../../src/refusals/errors'
import { passphraseCleartext } from '../../src/shapes/shapes-gateish'
import type { Bank } from '../../src/models/bank'
import type { Vault } from '../../src/models/vault'
import { NOVEL, PassphraseProving } from '../../src/models/proving'
import * as TH from '../test-helpers'
import { provingDeviceOf } from '../test-helpers/proving-world'
import { Dna, LeaseMillis, Passphrase, byPassphrase, makeBornVault, useVaultWorlds, vaultRoundTrip, unlockVerbTyping, unlockTyping } from '../test-helpers/vault-world'

useVaultWorlds()

/** The next session on `born`'s device: a new device over the same bankDB and deviceDB, its bank ensured and locked, and that bank's vault of `Dna`. */
async function nextSessionOf(born: { anotherSession: () => Promise<Bank> }): Promise<{ bank: Bank, vault: Vault }> {
  const bank = await born.anotherSession()
  const vault = bank.vaultAt(Dna)
  if (vault === null) { throw new Error('the next session lists no vault') }
  return { bank, vault }
}

const Stamp = Object.freeze({ boxlabel: 'anthropic_api_key', revision_seq: 1 })

describe("proving.buildWayin", () => {
  it("refuses a second wayin of a proving that has one, and a source proving of another gate", async () => {
    const { bank } = await makeBornVault()
    const { maingate } = bank
    const provingDevice = provingDeviceOf()
    const mine = await PassphraseProving.buildStored(maingate, passphraseCleartext.parse(Passphrase), provingDevice)
    await TH.expectRefusal(mine.buildWayin(NOVEL))
    const novel = await PassphraseProving.buildNovel(bank.stamp, maingate.stamp, passphraseCleartext.parse('a new passphrase'), provingDevice)
    const other = await PassphraseProving.buildNovel(bank.stamp, { ...maingate.stamp, gate_tok: 'gate-tok-other' }, passphraseCleartext.parse(Passphrase), provingDevice)
    await other.buildWayin(NOVEL)
    await TH.expectRefusal(novel.buildWayin(other))
    const wayin = await novel.buildWayin(mine)
    expect(wayin.wayinkind).to.eq('passphrase')
  })
})

describe("bank.ensureUnlocked, bank.unlock and bank.lock()", () => {
  it("ensureUnlocked shows no dialog for an unlocked bank, where unlock always asks for proof", async () => {
    const { bank, dialog } = await makeBornVault()
    const asked = vi.fn()
    dialog.requestCleartext = asked
    await expect(bank.ensureUnlocked()).resolves.to.eq(bank)
    expect(asked).not.toHaveBeenCalled()
    await TH.expectBad(bank.tryUnlock(), 'dismissed')
    expect(asked).toHaveBeenCalledOnce()
  })

  it("only ensureUnlocked uses the cached lease, where unlock still asks for proof", async () => {
    const asked = vi.fn()
    const born = await makeBornVault(byPassphrase(Passphrase), { requestCleartext: asked })
    const { bank } = await nextSessionOf(born)
    await TH.expectBad(bank.tryUnlock(), 'dismissed')
    expect(bank.isUnlocked).to.be.false
    expect(asked).toHaveBeenCalledOnce()
    await bank.ensureUnlocked()
    expect(bank.isUnlocked).to.be.true
    expect(asked).toHaveBeenCalledOnce()
  })

  it("tryEnsureUnlocked returns a refusal as an Outcome", async () => {
    const born = await makeBornVault()
    const { bank } = await nextSessionOf(born)
    bank.device.sweep()
    await TH.expectBad(bank.tryEnsureUnlocked(), 'disabled')
  })

  it("is born unlocked, with its lease cached", async () => {
    const { bank, vault, deviceDB } = await makeBornVault()
    expect(bank.isUnlocked).to.be.true
    expect(bank.isLocked).to.be.false
    expect(deviceDB.tryStow).toHaveBeenCalledOnce()
    expect(deviceDB.cachedNow()).to.deep.include({ gate_tok: bank.maingate.gate_tok, gate_revision_tok: bank.maingate.revision_tok, wayinkind: 'passphrase' })
    expect(await bank.ensureUnlocked()).to.equal(bank)
    expect(await vaultRoundTrip(vault, vault)).to.eq('sk-test')
  })

  it("locks at lock() before it returns, until the right passphrase unlocks it", async () => {
    const { bank, vault, deviceDB } = await makeBornVault()
    const sealed = await vault.sealStampedString('sk-test', Stamp)
    expect(bank.lock()).to.equal(bank)
    expect(bank.isLocked).to.be.true
    await TH.expectRefusal(vault.sealStampedString('sk-test', Stamp), 'bank_locked')
    await TH.expectRefusal(vault.unsealStampedString(sealed, Stamp), 'bank_locked')
    await TH.eventually(() => deviceDB.cachedNow() === null)
    await TH.expectRefusal(bank.ensureUnlocked(), 'dismissed')
    await TH.expectRefusal(unlockTyping(bank, byPassphrase('not the passphrase')), 'wrong_passphrase')
    expect(bank.isLocked).to.be.true
    await unlockTyping(bank, byPassphrase(Passphrase))
    expect(bank.isUnlocked).to.be.true
    expect(await vault.unsealStampedString(sealed, Stamp)).to.eq('sk-test')
    expect(deviceDB.forget).toHaveBeenCalledOnce()
    expect(deviceDB.tryStow).toHaveBeenCalledTimes(2)
    expect(deviceDB.cachedNow()).not.to.be.null
  })

  it("tells its listeners once at a lock and once at an unlock, its snapshot following", async () => {
    const { bank } = await makeBornVault()
    const listener = vi.fn()
    bank.subscribe(listener)
    expect(bank.getSnapshot().isLocked).to.be.false
    bank.lock()
    expect(listener).toHaveBeenCalledOnce()
    expect(bank.getSnapshot().isLocked).to.be.true
    await unlockVerbTyping(bank, byPassphrase(Passphrase))
    expect(listener).toHaveBeenCalledTimes(2)
    expect(bank.getSnapshot().isLocked).to.be.false
  })

  it("refuses a seal or an unseal that a lock interrupts", async () => {
    const { bank, vault } = await makeBornVault()
    const sealed = await vault.sealStampedString('sk-test', Stamp)
    const sealing = vault.sealStampedString('sk-test', Stamp)
    const unsealing = vault.unsealStampedString(sealed, Stamp)
    bank.lock()
    await Promise.all([TH.expectRefusal(sealing, 'bank_locked'), TH.expectRefusal(unsealing, 'bank_locked')])
  })
})

describe("vault.sealStampedString and vault.unsealStampedString", () => {
  it("refuse a stamp of another vault, or of another life of this one", async () => {
    const { vault } = await makeBornVault()
    const sealed = await vault.sealStampedString('sk-test', Stamp)
    const err = await TH.expectRefusal(vault.sealStampedString('sk-test', { ...Stamp, vaultlabel: 'another_vault' }))
    expect(err.message).to.eq(Phrases.StampOfOtherVault)
    await TH.expectRefusal(vault.unsealStampedString(sealed, { ...Stamp, vault_tok: 'another-life' }))
  })

  it("refuse an empty stamp", async () => {
    const { vault } = await makeBornVault()
    await TH.expectRefusal(vault.sealStampedString('sk-test', {}))
    await TH.expectRefusal(vault.unsealStampedString(await vault.sealStampedString('sk-test', Stamp), {}))
  })

  it("seal nothing a vault of another bank can open", async () => {
    const { vault } = await makeBornVault()
    const { vault: other } = await makeBornVault()
    await TH.expectRefusal(other.unsealStampedString(await vault.sealStampedString('sk-test', Stamp), Stamp), 'damaged_whisper')
  })
})

describe("An unlock, by proof or by the cached lease", () => {
  it("takes the new lease and caches it over the old one", async () => {
    const { bank, deviceDB, advance } = await makeBornVault()
    const bornRow = deviceDB.cachedNow() as { proved_at: number }
    advance(1)
    await unlockVerbTyping(bank, byPassphrase(Passphrase))
    expect(bank.isUnlocked).to.be.true
    expect(deviceDB.cachedNow()).to.deep.include({ proved_at: bornRow.proved_at + 1 })
  })

  it("refuses after the device's sweep, leaving the bank locked and the cached row in place", async () => {
    const born = await makeBornVault()
    const { deviceDB } = born
    const { bank } = await nextSessionOf(born)
    const kept = deviceDB.cachedNow()
    expect(kept).not.to.be.null
    const peeked = TH.pendingNextAnswer(deviceDB.memoryDB, 'peek')
    const ensuring = bank.ensureUnlocked()
    await peeked.reached
    bank.device.sweep()
    peeked.release()
    await TH.expectRefusal(ensuring)
    expect(bank.isLocked).to.be.true
    expect(deviceDB.cachedNow()).to.deep.equal(kept)
  })

  it("yields to a lock that arrives while the lease is being cached", async () => {
    const { bank, deviceDB } = await makeBornVault()
    bank.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    const cached = TH.pendingNextAnswer(deviceDB.memoryDB, 'tryStow')
    const unlocking = unlockTyping(bank, byPassphrase(Passphrase))
    await cached.reached
    expect(bank.isUnlocked).to.be.true
    bank.lock()
    cached.release()
    await unlocking
    await TH.eventually(() => deviceDB.cachedNow() === null)
    expect(bank.isLocked).to.be.true
  })

  it("keeps the lease when the deviceDB refuses to cache it, and reports bad news", async () => {
    const { bank, deviceDB, badnews } = await makeBornVault()
    deviceDB.tryStow.mockResolvedValueOnce(TH.bad(new VaultError('storage_unavailable', 'the disk is full')))
    bank.lock()
    await unlockTyping(bank, byPassphrase(Passphrase))
    expect(bank.isUnlocked).to.be.true
    expect(badnews).to.have.lengthOf(1)
  })
})

describe("The cached lease, used only by ensureUnlocked", () => {
  it("unlocks the next session at its ensureUnlocked, without a dialog", async () => {
    const born = await makeBornVault()
    const again = await nextSessionOf(born)
    expect(again.bank.isLocked).to.be.true
    expect(await again.bank.ensureUnlocked()).to.equal(again.bank)
    expect(again.bank.isUnlocked).to.be.true
    expect(await vaultRoundTrip(born.vault, again.vault)).to.eq('sk-test')
  })

  it("is not looked up at a vault's beginWatch", async () => {
    const born = await makeBornVault()
    const { vault } = await nextSessionOf(born)
    born.deviceDB.peek.mockClear()
    await vault.beginWatch()
    expect(born.deviceDB.peek).not.toHaveBeenCalled()
  })

  it("is used up to leaseMillis old, and ignored when any older", async () => {
    const born = await makeBornVault()
    const { advance, deviceDB } = born
    advance(LeaseMillis)
    const within = await nextSessionOf(born)
    await within.bank.ensureUnlocked()
    expect(within.bank.isUnlocked).to.be.true
    advance(1)
    const past = await nextSessionOf(born)
    await TH.expectRefusal(past.bank.ensureUnlocked(), 'dismissed')
    expect(past.bank.isLocked).to.be.true
    expect(deviceDB.cachedNow()).to.not.be.null
  })

  it("locks the bank and is forgotten when it fails at its first seal", async () => {
    const born = await makeBornVault()
    const { deviceDB } = born
    const cached = deviceDB.cachedNow() as Record<string, unknown>
    deviceDB.layCached({ ...cached, lease_key: await makeLeaseKey() })
    const again = await nextSessionOf(born)
    await again.bank.ensureUnlocked()
    await TH.expectRefusal(again.vault.sealStampedString('sk-test', Stamp), 'damaged_lease')
    expect(again.bank.isLocked).to.be.true
    await TH.eventually(() => deviceDB.cachedNow() === null)
    expect(deviceDB.forget).toHaveBeenCalledOnce()
  })

  it("is reported as bad news when its row is not a valid lease, and the user is asked for proof", async () => {
    const born = await makeBornVault()
    const { deviceDB, badnews } = born
    const cached = deviceDB.cachedNow() as Record<string, unknown>
    deviceDB.layCached({ ...cached, lease_key: 'no key at all' })
    const { bank } = await nextSessionOf(born)
    await TH.expectRefusal(bank.ensureUnlocked(), 'dismissed')
    expect(badnews[0]).to.deep.include({ refusalkind: 'damaged_lease' })
    await unlockTyping(bank, byPassphrase(Passphrase))
    expect(bank.isUnlocked).to.be.true
  })

  it("is used at the next ensureUnlocked when another session cached it after this bank first looked", async () => {
    const born = await makeBornVault()
    const { bank, vault, deviceDB } = born
    bank.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    const again = await nextSessionOf(born)
    await TH.expectRefusal(again.bank.ensureUnlocked(), 'dismissed')
    await unlockTyping(bank, byPassphrase(Passphrase))
    await again.bank.ensureUnlocked()
    expect(await vaultRoundTrip(vault, again.vault)).to.eq('sk-test')
  })

  it("is forgotten at lock() even by a bank that has no lease", async () => {
    const born = await makeBornVault()
    const { deviceDB } = born
    const { bank: idle } = await nextSessionOf(born)
    expect(idle.isLocked).to.be.true
    idle.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    const { bank: again } = await nextSessionOf(born)
    await TH.expectRefusal(again.ensureUnlocked(), 'dismissed')
  })
})
