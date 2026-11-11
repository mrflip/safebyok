/** A vault's lease through a gate change, a refused forget of its row, and the discards down the chain. */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { VaultError } from '../../src/refusals/errors'
import { ENCRYPTED } from '../../src/helpers/consts'
import { parseLogger } from '../../src/helpers/logger'
import { Vault } from '../../src/models/vault'
import * as TH from '../test-helpers'
import { NewPassphrase, Passphrase, byPassphrase, makeBornVault, makeBornVaultAndFriend, replaceTyping, useVaultWorlds, unlockTyping } from '../test-helpers/vault-world'

useVaultWorlds()

const Stamp = Object.freeze({ boxlabel: 'anthropic_api_key', revision_seq: 1 })

/** Node has no `reportError`, so a test hands the platform one. */
const stubReportError = () => {
  const reported = vi.fn()
  vi.stubGlobal('reportError', reported)
  return reported
}

afterEach(() => { vi.unstubAllGlobals() })

const expectChangeUnlocked = async ({ vault, deviceDB, demandStored }: Awaited<ReturnType<typeof makeBornVault>>, epoch0: number): Promise<void> => {
  expect(demandStored().gate.gate_epoch).to.eq(epoch0 + 1)
  expect(vault.isUnlocked).to.be.true
  await TH.eventually(() => deviceDB.cachedNow() !== null)
}

describe("A lease renewed through a gate change", () => {
  it("is attached under the epoch that was written, without the vault ever reporting locked", async () => {
    const { vault, deviceDB, demandStored } = await makeBornVault()
    const sealed = await vault.sealStampedString('sk-test', Stamp)
    const epoch0 = vault.gate.gate_epoch
    vault.becomeNotifiable()
    const lockings: boolean[] = []
    vault.subscribe(() => { lockings.push(vault.isLocked) })
    await replaceTyping(vault, Passphrase, NewPassphrase)
    expect(vault.isUnlocked).to.be.true
    expect(lockings).to.not.include(true)
    expect(demandStored().gate.gate_epoch).to.eq(epoch0 + 1)
    expect(deviceDB.cachedNow()).to.deep.include({ gate_epoch: epoch0 + 1 })
    expect(await vault.unsealStampedString(sealed, Stamp)).to.eq('sk-test')
  })

  it("unlocks a vault that was locked at the start, and writes the change", async () => {
    const { vault, deviceDB, demandStored } = await makeBornVault()
    const epoch0 = vault.gate.gate_epoch
    vault.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    await replaceTyping(vault, Passphrase, NewPassphrase)
    expect(vault.isUnlocked).to.be.true
    expect(demandStored().gate.gate_epoch).to.eq(epoch0 + 1)
    expect(deviceDB.cachedNow()).to.not.be.null
  })

  it("leaves the vault unlocked where a lock() came after the attempt was submitted", async () => {
    const born = await makeBornVault()
    const { vault } = born
    const epoch0 = vault.gate.gate_epoch
    const world = born.fakeBank
    const { requestCleartext: asBefore } = world
    world.requestCleartext = async (gating) => {
      const attempting = gating.attempt({ antePassphraseClear: Passphrase, nextPassphraseClear: NewPassphrase })
      vault.lock()
      await attempting
    }
    await vault.replacePassphrasePrompt()
    world.requestCleartext = asBefore
    await expectChangeUnlocked(born, epoch0)
  })

  it("leaves the vault unlocked where a lock() came as the commit was written", async () => {
    const born = await makeBornVault()
    const { vault, opts: { vaultDB } } = born
    const epoch0 = vault.gate.gate_epoch
    const commit = vaultDB.tryReplacePassphrase.bind(vaultDB)
    vi.spyOn(vaultDB, 'tryReplacePassphrase').mockImplementationOnce(async (record, opts) => {
      const written = await commit(record, opts)
      vault.lock()
      return written
    })
    await replaceTyping(vault, Passphrase, NewPassphrase)
    await expectChangeUnlocked(born, epoch0)
  })
})

describe("A refused forget of the lease row", () => {
  const Refusal = new VaultError('storage_unavailable', 'the disk is full')

  it("is returned by the friend's tryForgetLease as a bad Outcome and reported to onLifecycle once", async () => {
    const onLifecycle = vi.fn()
    const { vault, deviceDB, friend } = await makeBornVaultAndFriend(byPassphrase(Passphrase), { onLifecycle })
    deviceDB.forget.mockRejectedValueOnce(Refusal)
    await TH.expectBad(friend.tryForgetLease(), 'storage_unavailable')
    await TH.eventually(() => onLifecycle.mock.calls.length > 0)
    expect(onLifecycle).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'lease_revoke_failed', refusal: Refusal, vault, where: 'undeleted' }))
  })

  it("is reported to onLifecycle, leaving the vault locked and enabled", async () => {
    const reported = stubReportError()
    const onLifecycle = vi.fn(() => Promise.reject(new Error('the host broke')))
    const { vault, deviceDB } = await makeBornVault(byPassphrase(Passphrase), { onLifecycle })
    deviceDB.forget.mockRejectedValueOnce(Refusal)
    vault.lock()
    expect(vault.isLocked).to.be.true
    await TH.eventually(() => reported.mock.calls.length === 1)
    expect(onLifecycle).toHaveBeenCalledWith(expect.objectContaining({ kind: 'lease_revoke_failed', refusal: Refusal, vault, where: 'lock' }))
    expect(vault.isEnabled).to.be.true
    expect(deviceDB.cachedNow()).not.to.be.null
  })

  describe("with no onLifecycle and no reportError", () => {
    it("still vacates the vault, logging each refusal at error", async () => {
      const spy = TH.spyLogger()
      const { vault, deviceDB } = await makeBornVault(byPassphrase(Passphrase), { logger: parseLogger(spy.logger) })
      deviceDB.forget.mockRejectedValue(Refusal)
      vault.lock()
      await TH.eventually(() => ! vault.isEnabled)
      expect(deviceDB.forget).toHaveBeenCalledTimes(2)
      expect(spy.calls.map((call) => call.level)).to.deep.equal(['error', 'error'])
    })
  })

  it("with no onLifecycle, is reported to reportError and the vault is vacated", async () => {
    const reported = stubReportError()
    const spy = TH.spyLogger()
    const { vault, listing, deviceDB } = await makeBornVault(byPassphrase(Passphrase), { logger: parseLogger(spy.logger) })
    deviceDB.forget.mockRejectedValue(Refusal)
    vault.lock()
    await TH.eventually(() => reported.mock.calls.length === 2)
    expect(spy.calls.map((call) => call.level)).to.deep.equal(['error', 'error'])
    expect(reported).toHaveBeenCalledWith(Refusal)
    expect(vault.isEnabled).to.be.false
    expect(listing.at(vault.scope)).to.be.null
    expect(deviceDB.forget).toHaveBeenCalledTimes(2)
  })
})

describe("sweep and vacate", () => {
  const BoxDna = { boxlabel: 'anthropic_api_key', whisper: { apiKey: 'sk-test' }, sidecar: {} }
  const makeVaultWithBox = async () => {
    const born = await makeBornVault()
    const box = await born.vault.boxListing.create({ ...born.vault.scope, ...BoxDna })
    return { ...born, box }
  }

  it("seals a box through the vault and opens it, end to end", async () => {
    const { box } = await makeVaultWithBox()
    expect(await box.extractWhisper()).to.deep.equal({ apiKey: 'sk-test' })
  })

  it("sweep keeps the cached lease row, locks the vault, and disables and delists the vault and its boxes", async () => {
    const { vault, listing, box, deviceDB } = await makeVaultWithBox()
    const { boxListing } = vault
    await box.expose()
    expect(vault.sweep()).to.equal(vault)
    expect(vault.isLocked).to.be.true
    expect(vault.isEnabled).to.be.false
    expect(box.isEnabled).to.be.false
    expect(listing.at(vault.scope)).to.be.null
    expect(boxListing.at(box.scope)).to.be.null
    expect(box.whisper).to.equal(ENCRYPTED)
    expect(deviceDB.cachedNow()).not.to.be.null
    expect(deviceDB.forget).not.toHaveBeenCalled()
    expect(deviceDB.peek).not.toHaveBeenCalled()
  })

  it("vacate also forgets the cached lease row, and leaves the vaultDB untouched", async () => {
    const { vault, listing, box, deviceDB, demandStored } = await makeVaultWithBox()
    const stored = demandStored()
    vault.vacate()
    expect(vault.isLocked).to.be.true
    expect(box.isEnabled).to.be.false
    expect(listing.at(vault.scope)).to.be.null
    await TH.eventually(() => deviceDB.cachedNow() === null)
    expect(demandStored()).to.eq(stored)
  })

  it("after a sweep, every guard and call refuses, and lock, sweep and vacate are no-ops", async () => {
    const { vault, box, deviceDB } = await makeVaultWithBox()
    vault.sweep()
    TH.expectSyncRefusal(() => vault.demandEnabled())
    TH.expectSyncRefusal(() => vault.demandUnlocked())
    TH.expectSyncRefusal(() => box.demandPuttable({ whisper: { apiKey: 'sk-test' } }))
    TH.expectSyncRefusal(() => box.demandUnsealable())
    TH.expectSyncRefusal(() => box.demandExposable())
    await TH.expectRefusal(unlockTyping(vault, byPassphrase(Passphrase)))
    await TH.expectRefusal(vault.fetch())
    await TH.expectRefusal(vault.sealStampedString('sk-test', Stamp))
    expect(vault.lock().sweep().vacate()).to.equal(vault)
    expect(box.lock().sweep().vacate()).to.equal(box)
    expect(deviceDB.forget).not.toHaveBeenCalled()
  })

  it("after a sweep, vault.boxListing is still the same listing, and its methods refuse", async () => {
    const { vault } = await makeVaultWithBox()
    const boxes = vault.boxListing
    vault.sweep()
    expect(vault.boxListing).to.eq(boxes)
    await TH.expectRefusal(boxes.hello())
  })

  it("after a sweep, a vault's record stays readable", async () => {
    const { vault, demandStored } = await makeBornVault()
    vault.sweep()
    expect(vault.fullRecord).to.deep.equal(demandStored())
    expect(vault.gate.gate_epoch).to.eq(demandStored().gate.gate_epoch)
  })

  it("after a sweep, hydrate refuses only when it would fetch", async () => {
    const { vault, box } = await makeVaultWithBox()
    box.sweep()
    await expect(box.hydrate()).resolves.to.eq(box)
    await TH.expectRefusal(box.hydrate({ maxMillisSinceRefresh: 0 }))
    vault.sweep()
    await expect(vault.hydrate()).resolves.to.eq(vault)
    await TH.expectRefusal(vault.hydrate({ maxMillisSinceRefresh: 0 }))
  })

  it("expose refuses when a sweep lands during its unseal, and leaves no whisper on the box", async () => {
    const { box } = await makeVaultWithBox()
    vi.spyOn(Vault.prototype, 'unsealStampedString').mockImplementationOnce(() => {
      box.sweep()
      return Promise.resolve('{"apiKey":"sk-test"}')
    })
    await TH.expectRefusal(box.expose())
    expect(box.whisper).to.eq(ENCRYPTED)
    expect(box.snapshot.isExposed).to.be.false
  })

  it("ensureUnlocked refuses without showing a dialog when a sweep lands during its lease lookup", async () => {
    const { vault, fakeBank, deviceDB } = await makeBornVault()
    vault.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    const dialog = vi.fn()
    fakeBank.requestCleartext = dialog
    deviceDB.peek.mockImplementationOnce(() => {
      vault.sweep()
      return Promise.resolve(null)
    })
    await TH.expectRefusal(vault.ensureUnlocked())
    expect(dialog).not.toHaveBeenCalled()
  })

  it("a swept listing refuses a put or a delete before reaching the vaultDB", async () => {
    const { listing, demandStored } = await makeBornVault()
    const stored = demandStored()
    listing.sweep()
    await TH.expectRefusal(listing.put(stored, { prior: stored }))
    await TH.expectRefusal(listing.del(stored))
    expect(demandStored()).to.eq(stored)
  })

  it("a box listing swept with its vault refuses a create", async () => {
    const { vault, box } = await makeVaultWithBox()
    const boxes = vault.boxListing
    vault.sweep()
    await TH.expectRefusal(boxes.create({ ...box.scope, ...BoxDna, boxlabel: 'other_key' }))
  })

  it("a swept listing is empty and refuses every further call", async () => {
    const { listing, vault, demandStored } = await makeBornVault()
    const record = demandStored()
    await listing.hello()
    expect(listing.sweep()).to.equal(listing)
    expect(vault.isEnabled).to.be.false
    expect(listing.things).to.have.lengthOf(0)
    await TH.expectRefusal(listing.hello())
    await TH.expectRefusal(listing.fetch(vault.scope))
    await TH.expectRefusal(listing.build(record))
    expect(listing.vacate()).to.equal(listing)
    expect(listing.things).to.have.lengthOf(0)
  })

  it("a listener's throw goes to reportError, and the sweep still goes through", async () => {
    const reported = stubReportError()
    const { vault, listing } = await makeBornVault()
    vault.becomeNotifiable()
    const thrown = new Error('the listener threw')
    vault.subscribe(() => { throw thrown })
    vault.lock()
    expect(reported).toHaveBeenCalledWith(thrown)
    vault.sweep()
    expect(listing.at(vault.scope)).to.be.null
  })
})

/** Every value `subject` shows by a field or getter, own or inherited, symbols too; its methods stay uncalled. */
const valuesShownBy = (subject: object): unknown[] => {
  const shown: unknown[] = []
  for (let proto: object | null = subject; proto !== null && proto !== Object.prototype; proto = Object.getPrototypeOf(proto) as object | null) {
    for (const ckey of Reflect.ownKeys(proto)) {
      try { shown.push(Reflect.get(subject, ckey)) } catch { /* a getter's refusal shows nothing */ }
    }
  }
  return shown
}

describe("a vault and a lease never reveal the lease friend or the lease key handle", () => {
  it("a gating does not reveal the vault's unlock or its act through its fields, Object.keys or JSON.stringify", async () => {
    const { vault, fakeBank: world } = await makeBornVault()
    let gatingShown: object | null = null
    world.requestCleartext = (gating) => {
      gatingShown = gating
      gating.dismiss()
    }
    await TH.expectRefusal(vault.addPasskeyPrompt(), 'dismissed')
    const json = JSON.stringify(gatingShown)
    for (const named of ['act', 'unlockByProof', 'unlockVaultByProof']) {
      expect(Object.keys(gatingShown!)).to.not.include(named)
      expect(json).to.not.include(named)
      expect(vault).to.not.have.property(named)
    }
  })

  it("a vault and its lease reveal neither through a field, a getter, Object.keys or JSON.stringify", async () => {
    const { vault, deviceDB, friend, lease } = await makeBornVaultAndFriend()
    const row = deviceDB.cachedNow() as Record<string, unknown>
    expect(row['lease_key']).to.be.an.instanceof(CryptoKey)
    for (const subject of [vault, lease]) {
      const shown = valuesShownBy(subject)
      expect(shown).to.not.include(friend)
      expect(shown).to.not.include(row['lease_key'])
      expect(shown).to.not.include(row)
      const json = JSON.stringify(subject)
      for (const named of ['friend', 'leaseFriend', 'peekLease', 'lease_key', 'vault_key_lease_wrapped']) {
        expect(Object.keys(subject)).to.not.include(named)
        expect(json).to.not.include(named)
      }
    }
    expect('leaseFriend' in vault).to.be.false
    expect('friend' in lease).to.be.false
  })
})
