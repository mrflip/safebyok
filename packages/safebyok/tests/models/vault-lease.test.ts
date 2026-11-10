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
  it("renewed: a lease granted is attached under the epoch that was written, its row cached, and the vault never reports locked on the way", async () => {
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

  it("was locked: a vault locked at the start writes the change and ends unlocked, its row cached", async () => {
    const { vault, deviceDB, demandStored } = await makeBornVault()
    const epoch0 = vault.gate.gate_epoch
    vault.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    await replaceTyping(vault, Passphrase, NewPassphrase)
    expect(vault.isUnlocked).to.be.true
    expect(demandStored().gate.gate_epoch).to.eq(epoch0 + 1)
    expect(deviceDB.cachedNow()).to.not.be.null
  })

  it("leaves the vault unlocked where a lock() came past the enter key", async () => {
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
    vi.spyOn(vaultDB, 'tryReplacePassphrase').mockImplementationOnce(async (params) => {
      const written = await commit(params)
      vault.lock()
      return written
    })
    await replaceTyping(vault, Passphrase, NewPassphrase)
    await expectChangeUnlocked(born, epoch0)
  })
})

describe("A refused forget of the row: lease_revoke_failed", () => {
  const Refusal = new VaultError('storage_unavailable', 'the disk is full')

  it("is announced by the friend's tryForgetLease, which answers it as a bad Outcome", async () => {
    const onLifecycle = vi.fn()
    const { vault, deviceDB, friend } = await makeBornVaultAndFriend(byPassphrase(Passphrase), { onLifecycle })
    deviceDB.forget.mockRejectedValueOnce(Refusal)
    await TH.expectBad(friend.tryForgetLease(), 'storage_unavailable')
    await TH.eventually(() => onLifecycle.mock.calls.length > 0)
    expect(onLifecycle).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'lease_revoke_failed', refusal: Refusal, vault, where: 'undeleted' }))
  })

  it("is heard by the host's onLifecycle, leaving the vault locked and enabled; a rejection of it goes to the platform and no further", async () => {
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

  it("with no onLifecycle reports it and vacates the vault; the vacate's own refusal finds that done", async () => {
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

describe("The discards: sweep and vacate, down the chain", () => {
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

  it("sweep leaves the row, drops the lease, disables and delists all the way down", async () => {
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

  it("vacate forgets the row too, disables and delists all the way down, and leaves the vaultDB untouched", async () => {
    const { vault, listing, box, deviceDB, demandStored } = await makeVaultWithBox()
    const stored = demandStored()
    vault.vacate()
    expect(vault.isLocked).to.be.true
    expect(box.isEnabled).to.be.false
    expect(listing.at(vault.scope)).to.be.null
    await TH.eventually(() => deviceDB.cachedNow() === null)
    expect(demandStored()).to.eq(stored)
  })

  it("past a discard every guard refuses, what would take a call refuses, and lock, sweep and vacate are no-ops", async () => {
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

  it("past a discard vault.boxListing answers the listing it listed, its verbs refusing", async () => {
    const { vault } = await makeVaultWithBox()
    const boxes = vault.boxListing
    vault.sweep()
    expect(vault.boxListing).to.eq(boxes)
    await TH.expectRefusal(boxes.hello())
  })

  it("past a discard a vault's record stays readable, for a log or a debugger", async () => {
    const { vault, demandStored } = await makeBornVault()
    vault.sweep()
    expect(vault.fullRecord).to.deep.equal(demandStored())
    expect(vault.gate.gate_epoch).to.eq(demandStored().gate.gate_epoch)
  })

  it("a hydrate past a discard refuses only where it fetches: a timely record answers the instance, a stale one refuses", async () => {
    const { vault, box } = await makeVaultWithBox()
    box.sweep()
    await expect(box.hydrate()).resolves.to.eq(box)
    await TH.expectRefusal(box.hydrate({ maxMillisSinceRefresh: 0 }))
    vault.sweep()
    await expect(vault.hydrate()).resolves.to.eq(vault)
    await TH.expectRefusal(vault.hydrate({ maxMillisSinceRefresh: 0 }))
  })

  it("a sweep crossing expose's unseal refuses, and no whisper stays on the box", async () => {
    const { box } = await makeVaultWithBox()
    vi.spyOn(Vault.prototype, 'unsealStampedString').mockImplementationOnce(() => {
      box.sweep()
      return Promise.resolve('{"apiKey":"sk-test"}')
    })
    await TH.expectRefusal(box.expose())
    expect(box.whisper).to.eq(ENCRYPTED)
    expect(box.snapshot.isExposed).to.be.false
  })

  it("a sweep crossing ensureUnlocked's peek at the cached lease refuses, nobody asked", async () => {
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

  it("a swept listing puts nothing: a put or a delete refuses before reaching the vaultDB", async () => {
    const { listing, demandStored } = await makeBornVault()
    const stored = demandStored()
    listing.sweep()
    await TH.expectRefusal(listing.put(stored, { prior: stored }))
    await TH.expectRefusal(listing.del(stored))
    expect(demandStored()).to.eq(stored)
  })

  it("a box listing swept with its vault refuses a birth, ahead of the lock the sweep left", async () => {
    const { vault, box } = await makeVaultWithBox()
    const boxes = vault.boxListing
    vault.sweep()
    await TH.expectRefusal(boxes.create({ ...box.scope, ...BoxDna, boxlabel: 'other_key' }))
  })

  it("a listing past a sweep or a vacate takes no further call, and answers a late notice with nothing", async () => {
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

  it("a listener's throw at a discard goes to the platform, and the discard goes on", async () => {
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

describe("a vault and a lease show neither the lease friend nor the lease key handle, one level deep, by identity", () => {
  it("no field of a gating shows the gating's friend, nor Object.keys or JSON.stringify, and a vault has no such verb", async () => {
    const { vault, fakeBank: world } = await makeBornVault()
    let gatingShown: object | null = null
    world.requestCleartext = (gating) => {
      gatingShown = gating
      gating.dismiss()
    }
    await TH.expectRefusal(vault.addPasskeyPrompt(), 'dismissed')
    const json = JSON.stringify(gatingShown)
    for (const named of ['friend', 'gatingFriend', 'launchArgs', 'unlockByProof']) {
      expect(Object.keys(gatingShown!)).to.not.include(named)
      expect(json).to.not.include(named)
      expect(vault).to.not.have.property(named)
    }
  })

  it("no field or getter of a vault or its lease shows either, nor Object.keys or JSON.stringify", async () => {
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
