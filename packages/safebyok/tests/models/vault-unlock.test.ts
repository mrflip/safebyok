/** A vault's unlocking, which is its bank's: ensureUnlocked and the lock, and the lease the bank has by unlock or by the cache. */

import { describe, expect, it, vi } from 'vitest'
import { makeLeaseKey } from '../../src/helpers/crypto'
import * as Phrases from '../../src/helpers/phrases'
import { VaultError } from '../../src/refusals/errors'
import { passphraseCleartext } from '../../src/shapes/shapes-gateish'
import type { Vault } from '../../src/models/vault'
import { NOVEL, PassphraseProving } from '../../src/models/proving'
import * as TH from '../test-helpers'
import { provingWorldOf } from '../test-helpers/proving-world'
import { Dna, LeaseMillis, Passphrase, byPassphrase, makeBornVault, useVaultWorlds, vaultRoundTrip, unlockVerbTyping, unlockTyping } from '../test-helpers/vault-world'

useVaultWorlds()

/** The vault of the next session on `born`'s device: a new device over the same bankDB and deviceDB, its bank ensured and locked. */
async function nextVaultOf(born: { anotherSession: () => Promise<{ vaultAt: (scope: typeof Dna) => Vault | null }> }): Promise<Vault> {
  const bank = await born.anotherSession()
  const vault = bank.vaultAt(Dna)
  if (vault === null) { throw new Error('the next session lists no vault') }
  return vault
}

const Stamp = Object.freeze({ boxlabel: 'anthropic_api_key', revision_seq: 1 })

describe("proving.buildWayin", () => {
  it("refuses a second wayin of a proving that has one, and a source proving of another gate", async () => {
    const { bank } = await makeBornVault()
    const { maingate } = bank
    const world = provingWorldOf()
    const mine = await PassphraseProving.buildStored(maingate, passphraseCleartext.parse(Passphrase), world)
    await TH.expectRefusal(mine.buildWayin(NOVEL))
    const novel = await PassphraseProving.buildNovel(bank.stamp, maingate.stamp, passphraseCleartext.parse('a new passphrase'), world)
    const other = await PassphraseProving.buildNovel(bank.stamp, { ...maingate.stamp, gate_tok: 'gate-tok-other' }, passphraseCleartext.parse(Passphrase), world)
    await other.buildWayin(NOVEL)
    await TH.expectRefusal(novel.buildWayin(other))
    const wayin = await novel.buildWayin(mine)
    expect(wayin.wayinkind).to.eq('passphrase')
  })
})

describe("Vault.ensureUnlocked and the bank's lock", () => {
  it("ensureUnlocked shows no dialog for an unlocked vault, where unlock always asks for proof", async () => {
    const { vault, dialog } = await makeBornVault()
    const asked = vi.fn()
    dialog.requestCleartext = asked
    await expect(vault.ensureUnlocked()).resolves.to.eq(vault)
    expect(asked).not.toHaveBeenCalled()
    await TH.expectBad(vault.tryUnlock(), 'dismissed')
    expect(asked).toHaveBeenCalledOnce()
  })

  it("only ensureUnlocked uses the cached lease, where unlock still asks for proof", async () => {
    const asked = vi.fn()
    const born = await makeBornVault(byPassphrase(Passphrase), { requestCleartext: asked })
    const next = await nextVaultOf(born)
    await TH.expectBad(next.tryUnlock(), 'dismissed')
    expect(next.isUnlocked).to.be.false
    expect(asked).toHaveBeenCalledOnce()
    await next.ensureUnlocked()
    expect(next.isUnlocked).to.be.true
    expect(asked).toHaveBeenCalledOnce()
  })

  it("seal and unseal refuse a stamp of another vault, or of another life of this one", async () => {
    const { vault } = await makeBornVault()
    const sealed = await vault.sealStampedString('sk-test', Stamp)
    const err = await TH.expectRefusal(vault.sealStampedString('sk-test', { ...Stamp, vaultlabel: 'another_vault' }))
    expect(err.message).to.eq(Phrases.StampOfOtherVault)
    await TH.expectRefusal(vault.unsealStampedString(sealed, { ...Stamp, vault_tok: 'another-life' }))
  })

  it("is born unlocked, with its lease cached", async () => {
    const { bank, vault, deviceDB } = await makeBornVault()
    expect(vault.isUnlocked).to.be.true
    expect(vault.isLocked).to.be.false
    expect(deviceDB.tryStow).toHaveBeenCalledOnce()
    expect(deviceDB.cachedNow()).to.deep.include({ gate_tok: bank.maingate.gate_tok, gate_revision_tok: bank.maingate.revision_tok, wayinkind: 'passphrase' })
    expect(await vault.ensureUnlocked()).to.equal(vault)
    expect(await vaultRoundTrip(vault, vault)).to.eq('sk-test')
  })

  it("refuses an empty stamp at seal and unseal", async () => {
    const { vault } = await makeBornVault()
    await TH.expectRefusal(vault.sealStampedString('sk-test', {}))
    await TH.expectRefusal(vault.unsealStampedString(await vault.sealStampedString('sk-test', Stamp), {}))
  })

  it("locks at lock() before it returns, until the right passphrase unlocks it", async () => {
    const { vault, deviceDB } = await makeBornVault()
    const sealed = await vault.sealStampedString('sk-test', Stamp)
    expect(vault.lock()).to.equal(vault)
    expect(vault.isLocked).to.be.true
    await TH.expectRefusal(vault.sealStampedString('sk-test', Stamp), 'bank_locked')
    await TH.expectRefusal(vault.unsealStampedString(sealed, Stamp), 'bank_locked')
    await TH.eventually(() => deviceDB.cachedNow() === null)
    await TH.expectRefusal(vault.ensureUnlocked(), 'dismissed')
    await TH.expectRefusal(unlockTyping(vault, byPassphrase('not the passphrase')), 'wrong_passphrase')
    expect(vault.isLocked).to.be.true
    await unlockTyping(vault, byPassphrase(Passphrase))
    expect(vault.isUnlocked).to.be.true
    expect(await vault.unsealStampedString(sealed, Stamp)).to.eq('sk-test')
    expect(deviceDB.forget).toHaveBeenCalledOnce()
    expect(deviceDB.tryStow).toHaveBeenCalledTimes(2)
    expect(deviceDB.cachedNow()).not.to.be.null
  })

  it("notifies listeners when the lock changes", async () => {
    const { vault } = await makeBornVault()
    vault.becomeNotifiable()
    const listener = vi.fn()
    vault.subscribe(listener)
    expect(vault.getSnapshot().isLocked).to.be.false
    vault.lock()
    expect(listener).toHaveBeenCalledOnce()
    expect(vault.getSnapshot().isLocked).to.be.true
  })

  it("refuses a seal or an unseal that a lock interrupts", async () => {
    const { vault } = await makeBornVault()
    const sealed = await vault.sealStampedString('sk-test', Stamp)
    const sealing = vault.sealStampedString('sk-test', Stamp)
    const unsealing = vault.unsealStampedString(sealed, Stamp)
    vault.lock()
    await Promise.all([TH.expectRefusal(sealing, 'bank_locked'), TH.expectRefusal(unsealing, 'bank_locked')])
  })

  it("seals nothing another vault can open", async () => {
    const { vault } = await makeBornVault()
    const { vault: other } = await makeBornVault()
    await TH.expectRefusal(other.unsealStampedString(await vault.sealStampedString('sk-test', Stamp), Stamp), 'damaged_whisper')
  })
})

describe("An unlock, by proof or by the cached lease", () => {

  it("takes the new lease and caches it over the old one", async () => {
    const { vault, deviceDB, advance } = await makeBornVault()
    const bornRow = deviceDB.cachedNow() as { proved_at: number }
    advance(1)
    await unlockVerbTyping(vault, byPassphrase(Passphrase))
    expect(vault.isUnlocked).to.be.true
    expect(deviceDB.cachedNow()).to.deep.include({ proved_at: bornRow.proved_at + 1 })
  })

  it("refuses after the device's sweep, leaving the vault locked and the cached row in place", async () => {
    const born = await makeBornVault()
    const { deviceDB } = born
    const vault = await nextVaultOf(born)
    const kept = deviceDB.cachedNow()
    expect(kept).not.to.be.null
    const peeked = TH.pendingNextAnswer(deviceDB.memoryDB, 'peek')
    const ensuring = vault.ensureUnlocked()
    await peeked.reached
    vault.bank.device.sweep()
    peeked.release()
    await TH.expectRefusal(ensuring)
    expect(vault.isLocked).to.be.true
    expect(deviceDB.cachedNow()).to.deep.equal(kept)
  })

  it("yields to a lock that arrives while the lease is being cached", async () => {
    const { vault, deviceDB } = await makeBornVault()
    vault.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    const cached = TH.pendingNextAnswer(deviceDB.memoryDB, 'tryStow')
    const unlocking = unlockTyping(vault, byPassphrase(Passphrase))
    await cached.reached
    expect(vault.isUnlocked).to.be.true
    vault.lock()
    cached.release()
    await unlocking
    await TH.eventually(() => deviceDB.cachedNow() === null)
    expect(vault.isLocked).to.be.true
  })

  it("keeps the lease when the deviceDB refuses to cache it, and reports bad news", async () => {
    const { vault, deviceDB, badnews } = await makeBornVault()
    deviceDB.tryStow.mockResolvedValueOnce(TH.bad(new VaultError('storage_unavailable', 'the disk is full')))
    vault.lock()
    await unlockTyping(vault, byPassphrase(Passphrase))
    expect(vault.isUnlocked).to.be.true
    expect(badnews).to.have.lengthOf(1)
  })
})

describe("The cached lease, used only by ensureUnlocked", () => {
  it("unlocks the next session at its ensureUnlocked, without a dialog", async () => {
    const born = await makeBornVault()
    const again = await nextVaultOf(born)
    expect(again.isLocked).to.be.true
    expect(await again.ensureUnlocked()).to.equal(again)
    expect(again.isUnlocked).to.be.true
    expect(await vaultRoundTrip(born.vault, again)).to.eq('sk-test')
  })

  it("is not looked up at a beginWatch", async () => {
    const born = await makeBornVault()
    const vault = await nextVaultOf(born)
    born.deviceDB.peek.mockClear()
    await vault.beginWatch()
    expect(born.deviceDB.peek).not.toHaveBeenCalled()
  })

  it("is used up to leaseMillis old, and ignored when any older", async () => {
    const born = await makeBornVault()
    const { advance, deviceDB } = born
    advance(LeaseMillis)
    const within = await nextVaultOf(born)
    await within.ensureUnlocked()
    expect(within.isUnlocked).to.be.true
    advance(1)
    const past = await nextVaultOf(born)
    await TH.expectRefusal(past.ensureUnlocked(), 'dismissed')
    expect(past.isLocked).to.be.true
    expect(deviceDB.cachedNow()).to.not.be.null
  })

  it("locks the vault and is forgotten when it fails at its first seal", async () => {
    const born = await makeBornVault()
    const { deviceDB } = born
    const cached = deviceDB.cachedNow() as Record<string, unknown>
    deviceDB.layCached({ ...cached, lease_key: await makeLeaseKey() })
    const again = await nextVaultOf(born)
    await again.ensureUnlocked()
    await TH.expectRefusal(again.sealStampedString('sk-test', Stamp), 'damaged_lease')
    expect(again.isLocked).to.be.true
    await TH.eventually(() => deviceDB.cachedNow() === null)
    expect(deviceDB.forget).toHaveBeenCalledOnce()
  })

  it("is reported as bad news when its row is not a valid lease, and the user is asked for proof", async () => {
    const born = await makeBornVault()
    const { deviceDB, badnews } = born
    const cached = deviceDB.cachedNow() as Record<string, unknown>
    deviceDB.layCached({ ...cached, lease_key: 'no key at all' })
    const again = await nextVaultOf(born)
    await TH.expectRefusal(again.ensureUnlocked(), 'dismissed')
    expect(badnews[0]).to.deep.include({ refusalkind: 'damaged_lease' })
    await unlockTyping(again, byPassphrase(Passphrase))
    expect(again.isUnlocked).to.be.true
  })

  it("is used at the next ensureUnlocked when another session cached it after this vault first looked", async () => {
    const born = await makeBornVault()
    const { vault, deviceDB } = born
    vault.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    const again = await nextVaultOf(born)
    await TH.expectRefusal(again.ensureUnlocked(), 'dismissed')
    await unlockTyping(vault, byPassphrase(Passphrase))
    await again.ensureUnlocked()
    expect(await vaultRoundTrip(vault, again)).to.eq('sk-test')
  })

  it("is forgotten at lock() even by a bank that has no lease", async () => {
    const born = await makeBornVault()
    const { deviceDB } = born
    const idle = await nextVaultOf(born)
    expect(idle.isLocked).to.be.true
    idle.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    const again = await nextVaultOf(born)
    await TH.expectRefusal(again.ensureUnlocked(), 'dismissed')
  })
})
