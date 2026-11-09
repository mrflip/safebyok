/** A `lock()` crossing a put, an unlock's proof or a box verb, and what can reject a gate change after its record is stored. */

import { ENCRYPTED } from '../../src/helpers/consts'
import { describe, expect, it, vi } from 'vitest'
import { VaultError } from '../../src/refusals/errors'
import type { Gating } from '../../src/models/gating'
import { Lease } from '../../src/models/lease'
import { Proving } from '../../src/models/proving'
import { VaultListing } from '../../src/models/vault-listing'
import * as TH from '../test-helpers'
import { type TestableBox, boxDnaOf, boxListingOf, fakeSealBoxListingOf, fullBoxRecord, useModelsWorld } from '../test-helpers/models-world'
import { Dna, NewPassphrase, Passphrase, buildTyping, byPassphrase, delTyping, makeBornVault, makeVaultWorld, replaceTyping, unlockTyping, useVaultWorlds, hearingBadNews } from '../test-helpers/vault-world'
import type { BoxWorld } from '../../src/shapes/shapes-vaultish'

const held = useModelsWorld()
useVaultWorlds()

describe("a lock() called during a put", () => {
  it("during the seal refuses 'vault_locked', putting nothing: put checks the lock at both ends of the seal", async () => {
    const lock = { during: false }
    const listing = fakeSealBoxListingOf(held.mw, {}, () => { if (lock.during) { held.mw.setLocked(true) } })
    const record = fullBoxRecord()
    held.mw.seedPut(record)
    const box = await listing.build(record)
    lock.during = true
    await TH.expectRefusal(box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'sealed while locking' } }), 'vault_locked')
    expect(held.mw.callsOf('put')).to.deep.equal([])
  })

  it("during the put writes the record anyway: the put is past the window, and the box reports locked after", async () => {
    const record = fullBoxRecord()
    held.mw.seedPut(record)
    const box = await boxListingOf(held.mw).build(record)
    held.mw.willPut(({ record: sent }) => {
      held.mw.setLocked(true)
      return held.mw.answerOf(box.scope, sent)
    })
    await expect(box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'sent while locking' } })).resolves.to.eq(box)
    expect(box.isLocked).to.be.true
    expect(box.sidecar).to.deep.equal({ note: 'sent while locking' })
  })
})

describe("A lock called while an unlock proves", () => {
  it("ends unlocked: the proof still takes up and caches its lease, and the next lock() ends that session", async () => {
    const { vault, deviceDB, fakeBank } = await makeBornVault()
    vault.lock()
    fakeBank.requestCleartext = async (gating) => {
      const attempting = (gating as Gating<'unlock_vault'>).attempt({ passphraseClear: Passphrase })
      vault.lock()
      await attempting
    }
    await vault.ensureUnlocked()
    expect(vault.isUnlocked).to.be.true
    expect(deviceDB.tryStow).toHaveBeenCalledTimes(2)
    vault.lock()
    expect(vault.isUnlocked).to.be.false
  })
})

describe("A lock called during a box verb", () => {
  it("during hello leaves the list made and the next putBox refusing 'vault_locked', putting nothing", async () => {
    const { vault, vaultDB } = await makeBornVault()
    const tryListBoxes = vaultDB.tryListBoxes.bind(vaultDB)
    vi.spyOn(vaultDB, 'tryListBoxes').mockImplementationOnce((...args) => { vault.lock(); return tryListBoxes(...args) })
    await expect(vault.hello()).resolves.to.eq(vault)
    await TH.expectRefusal(vault.putBox({ boxlabel: 'anthropic_api_key', whisper: { apiKey: 'sk-test-0000' } }), 'vault_locked')
  })

  it("during getBox's get answers the box, with its whisper refusing 'vault_locked'", async () => {
    const { vault, vaultDB } = await makeBornVault()
    await vault.putBox({ boxlabel: 'anthropic_api_key', whisper: { apiKey: 'sk-test-0000' } })
    const tryGetBox = vaultDB.tryGetBox.bind(vaultDB)
    vi.spyOn(vaultDB, 'tryGetBox').mockImplementationOnce((...args) => { vault.lock(); return tryGetBox(...args) })
    const box = (await vault.fetchBox('anthropic_api_key'))!
    await TH.expectRefusal(box.extractWhisper(), 'vault_locked')
  })
})

/** A stored box whose next unseal runs `crossing` with the whisper opened, before it comes back to `box.expose`. */
const boxCrossingUnseal = async (crossing: (box: TestableBox) => unknown) => {
  const unsealStampedString: BoxWorld['unsealStampedString'] = async (sealed, stamp) => {
    const whisperText = await held.mw.world.unsealStampedString(sealed, stamp)
    crossing(box)
    return whisperText
  }
  const listing = boxListingOf(held.mw, { world: held.mw.worldWith({ unsealStampedString }) })
  const box = await listing.create(boxDnaOf(held.mw.boxscope('anthropic_api_key')))
  return box
}

describe("An ending called while box.expose unseals", () => {
  it.each(['sweep', 'vacate'] as const)("a %s refuses, and leaves nothing exposed", async (ending) => {
    const box = await boxCrossingUnseal((crossed) => crossed[ending]())
    await TH.expectRefusal(box.expose())
    expect(box.isEnabled).to.be.false
    expect(box.whisper).to.eq(ENCRYPTED)
  })

  it("a lock() refuses 'vault_locked', and leaves nothing exposed", async () => {
    const box = await boxCrossingUnseal(() => { held.mw.setLocked(true) })
    await TH.expectRefusal(box.expose(), 'vault_locked')
    held.mw.setLocked(false)
    expect(box.whisper).to.eq(ENCRYPTED)
  })
})

/** The next `Lease.buildGranted` runs `crossing` once its lease is made, as a slow wrap would let it. */
const crossingGrant = (crossing: () => unknown) => {
  const grant = Lease.buildGranted.bind(Lease)
  vi.spyOn(Lease, 'buildGranted').mockImplementationOnce(async (...args) => {
    const lease = await grant(...args)
    await crossing()
    return lease
  })
}

describe("A gate change after its record is stored", () => {
  it.each(['sweep', 'vacate'] as const)("a %s as the answer comes back refuses, the row stored all the same", async (ending) => {
    const { vault, listing, demandStored, opts: { vaultDB } } = await makeBornVault()
    const commit = vaultDB.tryReplacePassphrase.bind(vaultDB)
    vi.spyOn(vaultDB, 'tryReplacePassphrase').mockImplementationOnce(async (params) => {
      const answer = await commit(params)
      listing[ending]()
      return answer
    })
    await TH.expectRefusal(replaceTyping(vault, Passphrase, NewPassphrase))
    expect(demandStored().gate.gate_epoch).to.eq(2)
    expect(vault.isUnlocked).to.be.false
  })

  it("a crypto failure in buildLease rejects, the row stored, the vault on its new gate under the lease it held", async () => {
    const { vault, demandStored, deviceDB } = await makeBornVault()
    const failure = new VaultError('unexpected_error', "the platform said no")
    vi.spyOn(Proving.prototype, 'buildLease').mockRejectedValueOnce(failure)
    await expect(replaceTyping(vault, Passphrase, NewPassphrase)).rejects.to.eq(failure)
    expect(demandStored().gate.gate_epoch).to.eq(2)
    expect(vault.gate.gate_epoch).to.eq(2)
    expect(vault.isUnlocked).to.be.true
    expect(deviceDB.cachedNow()).to.include({ gate_epoch: 1 })
  })

  it("leaves the vault unlocked on the new lease where a lock crossed its making, with no second forget", async () => {
    const { vault, deviceDB } = await makeBornVault()
    deviceDB.forget.mockClear()
    crossingGrant(() => { vault.lock() })
    await expect(replaceTyping(vault, Passphrase, NewPassphrase)).resolves.to.eq(vault)
    expect(vault.isUnlocked).to.be.true
    expect(deviceDB.cachedNow()).to.not.be.null
    expect(deviceDB.forget).toHaveBeenCalledOnce()
  })

  it("refuses as it attaches where a tombstone crossed the new lease's making, and leaves no row", async () => {
    const { vault, demandStored, deviceDB, anotherSession } = await makeBornVault()
    crossingGrant(async () => {
      await delTyping(await anotherSession().build(demandStored()), NewPassphrase)
      await TH.expectRefusal(vault.fetch())
    })
    await TH.expectRefusal(replaceTyping(vault, Passphrase, NewPassphrase))
    expect(vault.isPresent).to.be.false
    expect(vault.isUnlocked).to.be.false
    expect(deviceDB.cachedNow()).to.be.null
  })

  it("a tombstone crossing a birth's lease refuses as it attaches, and leaves no row", async () => {
    const { listing, demandStored, deviceDB, anotherSession } = makeVaultWorld()
    crossingGrant(async () => {
      await delTyping(await anotherSession().build(demandStored()))
      await TH.expectRefusal(listing.at(Dna)!.fetch())
    })
    await TH.expectRefusal(buildTyping(listing, Dna, byPassphrase(Passphrase)))
    expect(listing.at(Dna)?.isPresent).to.be.false
    expect(deviceDB.cachedNow()).to.be.null
  })

  it("a sweep crossing a birth's lease refuses at demandAttachable, the row stored, no lease cached", async () => {
    const { listing, storedNow, deviceDB } = makeVaultWorld()
    crossingGrant(() => listing.sweep())
    await TH.expectRefusal(buildTyping(listing, Dna, byPassphrase(Passphrase)))
    expect(storedNow()).to.include({ am: 'a' })
    expect(deviceDB.cachedNow()).to.be.null
  })

  it("a refused tryStow during replacePassphrasePrompt resolves, unlocked, and tells onBadNews", async () => {
    const onBadNews = vi.fn()
    const { fakeBank, opts, deviceDB, demandStored } = await makeBornVault()
    const vault = await new VaultListing(fakeBank, hearingBadNews(opts, onBadNews)).build(demandStored())
    await unlockTyping(vault, byPassphrase(Passphrase))
    const refusal = new VaultError('storage_unavailable', "the disk is full")
    deviceDB.tryStow.mockResolvedValueOnce(TH.bad(refusal))
    await expect(replaceTyping(vault, Passphrase, NewPassphrase)).resolves.to.eq(vault)
    expect(vault.isUnlocked).to.be.true
    expect(onBadNews.mock.calls).to.deep.equal([[refusal]])
  })
})
