/** A bank's lease as its vaults see it: a refused forget of its row, and the discards down the chain. */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { VaultError } from '../../src/refusals/errors'
import { ENCRYPTED } from '../../src/helpers/consts'
import { parseLogger } from '../../src/helpers/logger'
import { Vault } from '../../src/models/vault'
import * as TH from '../test-helpers'
import { Passphrase, byPassphrase, makeBornVault, makeBornVaultAndFriend, useVaultWorlds, unlockTyping } from '../test-helpers/vault-world'

useVaultWorlds()

const Stamp = Object.freeze({ boxlabel: 'anthropic_api_key', revision_seq: 1 })

/** Node has no `reportError`, so a test hands the platform one. */
function stubReportError() {
  const reported = vi.fn()
  vi.stubGlobal('reportError', reported)
  return reported
}

afterEach(() => { vi.unstubAllGlobals() })

describe("A refused forget of the lease row", () => {
  const Refusal = new VaultError('storage_unavailable', 'the disk is full')

  it("is returned by the friend's tryForgetLease as a bad Outcome and reported to onLifecycle once", async () => {
    const onLifecycle = vi.fn<(told: { kind: string }) => void>()
    const { bank, deviceDB, friend } = await makeBornVaultAndFriend(byPassphrase(Passphrase), { onLifecycle })
    deviceDB.forget.mockRejectedValueOnce(Refusal)
    await TH.expectBad(friend.tryForgetLease(), 'storage_unavailable')
    function revokeFailures() { return onLifecycle.mock.calls.filter(([told]) => told.kind === 'lease_revoke_failed') }
    await TH.eventually(() => revokeFailures().length > 0)
    expect(revokeFailures()).to.have.lengthOf(1)
    expect(onLifecycle).toHaveBeenCalledWith(expect.objectContaining({ kind: 'lease_revoke_failed', refusal: Refusal, bank, where: 'undeleted' }))
  })

  it("is reported to onLifecycle, leaving the bank and its vault locked and enabled", async () => {
    const reported = stubReportError()
    const onLifecycle = vi.fn((told: { kind: string }) => (told.kind === 'lease_revoke_failed' ? Promise.reject(new Error('the host broke')) : undefined))
    const { bank, vault, deviceDB } = await makeBornVault(byPassphrase(Passphrase), { onLifecycle })
    deviceDB.forget.mockRejectedValueOnce(Refusal)
    vault.lock()
    expect(vault.isLocked).to.be.true
    await TH.eventually(() => reported.mock.calls.length === 1)
    expect(onLifecycle).toHaveBeenCalledWith(expect.objectContaining({ kind: 'lease_revoke_failed', refusal: Refusal, bank, where: 'lock' }))
    expect(bank.isEnabled).to.be.true
    expect(vault.isEnabled).to.be.true
    expect(deviceDB.cachedNow()).not.to.be.null
  })

  describe("with no onLifecycle and no reportError", () => {
    it("still vacates the bank and its vault, logging each refusal at error", async () => {
      const spy = TH.spyLogger()
      const { bank, vault, deviceDB } = await makeBornVault(byPassphrase(Passphrase), { logger: parseLogger(spy.logger) })
      deviceDB.forget.mockRejectedValue(Refusal)
      vault.lock()
      await TH.eventually(() => ! bank.isEnabled)
      expect(vault.isEnabled).to.be.false
      expect(deviceDB.forget).toHaveBeenCalledTimes(2)
      expect(spy.calls.map((call) => call.level)).to.deep.equal(['error', 'error'])
    })
  })

  it("with no onLifecycle, is reported to reportError and the bank and its vault are vacated", async () => {
    const reported = stubReportError()
    const spy = TH.spyLogger()
    const { bank, vault, listing, deviceDB } = await makeBornVault(byPassphrase(Passphrase), { logger: parseLogger(spy.logger) })
    deviceDB.forget.mockRejectedValue(Refusal)
    vault.lock()
    await TH.eventually(() => reported.mock.calls.length === 2)
    expect(spy.calls.map((call) => call.level)).to.deep.equal(['error', 'error'])
    expect(reported).toHaveBeenCalledWith(Refusal)
    expect(bank.isEnabled).to.be.false
    expect(vault.isEnabled).to.be.false
    expect(listing.at(vault.scope)).to.be.null
    expect(deviceDB.forget).toHaveBeenCalledTimes(2)
  })
})

describe("sweep and vacate", () => {
  const BoxDna = { boxlabel: 'anthropic_api_key', whisper: { apiKey: 'sk-test' }, sidecar: {} }
  async function makeVaultWithBox() {
    const born = await makeBornVault()
    const box = await born.vault.boxListing.create({ ...born.vault.scope, ...BoxDna })
    return { ...born, box }
  }

  it("seals a box through the vault and opens it, end to end", async () => {
    const { box } = await makeVaultWithBox()
    expect(await box.extractWhisper()).to.deep.equal({ apiKey: 'sk-test' })
  })

  it("the bank's sweep keeps the cached lease row, locks the bank, and disables and delists the vault and its boxes", async () => {
    const { bank, vault, listing, box, deviceDB } = await makeVaultWithBox()
    const { boxListing } = vault
    await box.expose()
    deviceDB.peek.mockClear()
    expect(bank.sweep()).to.equal(bank)
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

  it("the bank's vacate also forgets the cached lease row, and leaves the bankDB untouched", async () => {
    const { bank, vault, listing, box, deviceDB, demandStored } = await makeVaultWithBox()
    const stored = demandStored()
    bank.vacate()
    expect(vault.isLocked).to.be.true
    expect(box.isEnabled).to.be.false
    expect(listing.at(vault.scope)).to.be.null
    await TH.eventually(() => deviceDB.cachedNow() === null)
    expect(demandStored()).to.eq(stored)
  })

  it("after the bank's sweep, every guard and call refuses, and lock, sweep and vacate are no-ops", async () => {
    const { bank, vault, box, deviceDB } = await makeVaultWithBox()
    bank.sweep()
    TH.expectSyncRefusal(() => vault.demandEnabled())
    TH.expectSyncRefusal(() => vault.demandUnlocked())
    TH.expectSyncRefusal(() => box.demandPuttable({ whisper: { apiKey: 'sk-test' } }))
    TH.expectSyncRefusal(() => box.demandUnsealable())
    TH.expectSyncRefusal(() => box.demandExposable())
    await TH.expectRefusal(unlockTyping(vault, byPassphrase(Passphrase)))
    await TH.expectRefusal(vault.get({ maxMillisSinceRefresh: 0 }))
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
    expect(vault.toJSON()).to.deep.equal(demandStored())
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

  it("ensureUnlocked refuses without showing a dialog when the bank's sweep lands during its lease lookup", async () => {
    const { bank, vault, dialog, deviceDB } = await makeBornVault()
    vault.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    const requestCleartext = vi.fn()
    dialog.requestCleartext = requestCleartext
    deviceDB.peek.mockImplementationOnce(() => {
      bank.sweep()
      return Promise.resolve(null)
    })
    await TH.expectRefusal(vault.ensureUnlocked())
    expect(requestCleartext).not.toHaveBeenCalled()
  })

  it("a swept listing refuses a put or a delete before reaching the bankDB", async () => {
    const { listing, demandStored } = await makeBornVault()
    const stored = demandStored()
    listing.sweep()
    await TH.expectRefusal(listing.put(stored, { expected: stored }), 'disabled')
    await TH.expectRefusal(listing.del(stored), 'disabled')
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
    await TH.expectRefusal(listing.get(vault.scope, { maxMillisSinceRefresh: 0 }))
    TH.expectSyncRefusal(() => listing.deliverRecord(record))
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
function valuesShownBy(subject: object): unknown[] {
  const shown: unknown[] = []
  for (let proto: object | null = subject; proto !== null && proto !== Object.prototype; proto = Object.getPrototypeOf(proto) as object | null) {
    for (const ckey of Reflect.ownKeys(proto)) {
      try { shown.push(Reflect.get(subject, ckey)) } catch { /* a getter's refusal shows nothing */ }
    }
  }
  return shown
}

describe("a bank, a vault and a lease never reveal the lease friend or the lease key handle", () => {
  it("a gating does not reveal the bank's unlock or its act through its fields, Object.keys or JSON.stringify", async () => {
    const { bank, dialog } = await makeBornVault()
    let gatingShown: object | null = null
    dialog.requestCleartext = (gating) => {
      gatingShown = gating
      gating.dismiss()
    }
    await TH.expectRefusal(bank.unlock())
    const json = JSON.stringify(gatingShown)
    for (const named of ['act', 'unlockByProving', 'unlockBankByProving']) {
      expect(Object.keys(gatingShown!)).to.not.include(named)
      expect(json).to.not.include(named)
      expect(bank).to.not.have.property(named)
    }
  })

  it("a bank, its vault and its lease reveal neither through a field, a getter, Object.keys or JSON.stringify", async () => {
    const { bank, vault, deviceDB, friend, lease } = await makeBornVaultAndFriend()
    const row = deviceDB.cachedNow() as Record<string, unknown>
    expect(row['lease_key']).to.be.an.instanceof(CryptoKey)
    for (const subject of [bank, vault, lease]) {
      const shown = valuesShownBy(subject)
      expect(shown).to.not.include(friend)
      expect(shown).to.not.include(row['lease_key'])
      expect(shown).to.not.include(row)
      const json = JSON.stringify(subject)
      for (const named of ['friend', 'leaseFriend', 'peekLease', 'lease_key', 'bank_key_lease_wrapped']) {
        expect(Object.keys(subject)).to.not.include(named)
        expect(json).to.not.include(named)
      }
    }
    expect('leaseFriend' in bank).to.be.false
    expect('leaseFriend' in vault).to.be.false
    expect('friend' in lease).to.be.false
  })
})
