/** A `lock()` crossing a put, an unlock's proof or a box verb. What can reject a gate change after its record is stored is in `vault-gate.test.ts`. */

import { ENCRYPTED } from '../../src/helpers/consts'
import { describe, expect, it, vi } from 'vitest'
import type { Gating } from '../../src/models/gating'
import * as TH from '../test-helpers'
import { type TestableBox, boxDnaOf, boxListingOf, fakeSealBoxListingOf, fullBoxRecord, useModelsWorld } from '../test-helpers/models-world'
import { Passphrase, makeBornVault, useVaultWorlds } from '../test-helpers/vault-world'
import type { Vault } from '../../src/models/vault'

const world = useModelsWorld()
useVaultWorlds()

describe("a lock() called during a put", () => {
  it("during the seal refuses 'bank_locked', putting nothing", async () => {
    const lock = { during: false }
    const listing = fakeSealBoxListingOf(world.mw, {}, () => { if (lock.during) { world.mw.setLocked(true) } })
    const record = fullBoxRecord()
    world.mw.seedPut(record)
    const box = listing.deliverRecord(record)
    lock.during = true
    await TH.expectRefusal(box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'sealed while locking' } }), 'bank_locked')
    expect(world.mw.callsOf('put')).to.deep.equal([])
  })

  it("during the put still writes the record", async () => {
    const record = fullBoxRecord()
    world.mw.seedPut(record)
    const box = boxListingOf(world.mw).deliverRecord(record)
    world.mw.willPut(({ record: sent }) => {
      world.mw.setLocked(true)
      return world.mw.answerOf(box.scope, sent)
    })
    await expect(box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'sent while locking' } })).resolves.to.eq(box)
    expect(box.isLocked).to.be.true
    expect(box.sidecar).to.deep.equal({ note: 'sent while locking' })
  })
})

describe("A lock called while an unlock proves", () => {
  it("leaves the vault unlocked", async () => {
    const { vault, deviceDB, dialog } = await makeBornVault()
    vault.lock()
    dialog.requestCleartext = async (gating) => {
      const attempting = (gating as Gating<'unlock_bank'>).attempt({ passphraseClear: Passphrase })
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
  it("during hello lets it resolve, and the next putBox refuses 'bank_locked'", async () => {
    const { vault, bankDB } = await makeBornVault()
    const tryListBoxes = bankDB.tryListBoxes.bind(bankDB)
    vi.spyOn(bankDB, 'tryListBoxes').mockImplementationOnce((...args) => { vault.lock(); return tryListBoxes(...args) })
    await expect(vault.beginWatch()).resolves.to.eq(vault)
    await TH.expectRefusal(vault.putBox({ boxlabel: 'anthropic_api_key', whisper: { apiKey: 'sk-test-0000' } }), 'bank_locked')
  })

  it("during fetchBox's get still returns the box, whose whisper refuses 'bank_locked'", async () => {
    const { vault, bankDB } = await makeBornVault()
    await vault.putBox({ boxlabel: 'anthropic_api_key', whisper: { apiKey: 'sk-test-0000' } })
    const tryGetBox = bankDB.tryGetBox.bind(bankDB)
    vi.spyOn(bankDB, 'tryGetBox').mockImplementationOnce((...args) => { vault.lock(); return tryGetBox(...args) })
    const box = (await vault.fetchBox('anthropic_api_key'))!
    await TH.expectRefusal(box.extractWhisper(), 'bank_locked')
  })

  it("during extractWhisper's fetch refuses 'bank_locked'", async () => {
    const { vault, bankDB } = await makeBornVault()
    const box = await vault.putBox({ boxlabel: 'anthropic_api_key', whisper: { apiKey: 'sk-test-0000' } })
    const tryGetBox = bankDB.tryGetBox.bind(bankDB)
    vi.spyOn(bankDB, 'tryGetBox').mockImplementationOnce((...args) => { vault.lock(); return tryGetBox(...args) })
    await TH.expectRefusal(box.extractWhisper({ maxMillisSinceRefresh: 0 }), 'bank_locked')
  })

  it("during extractWhisper's decipher refuses 'bank_locked', handing back no whisper", async () => {
    const { vault } = await makeBornVault()
    const box = await vault.putBox({ boxlabel: 'anthropic_api_key', whisper: { apiKey: 'sk-test-0000' } })
    const decrypt = crypto.subtle.decrypt.bind(crypto.subtle)
    vi.spyOn(crypto.subtle, 'decrypt').mockImplementationOnce((...args) => { vault.lock(); return decrypt(...args) })
    await TH.expectRefusal(box.extractWhisper(), 'bank_locked')
    vi.restoreAllMocks()
  })

  it("during delBox's del still deletes the box", async () => {
    const { vault, bankDB } = await makeBornVault()
    await vault.putBox({ boxlabel: 'anthropic_api_key', whisper: { apiKey: 'sk-test-0000' } })
    const tryDelBox = bankDB.tryDelBox.bind(bankDB)
    vi.spyOn(bankDB, 'tryDelBox').mockImplementationOnce((...args) => { vault.lock(); return tryDelBox(...args) })
    const gone = await vault.delBox('anthropic_api_key')
    expect(gone?.isPresent).to.be.false
    expect(vault.isLocked).to.be.true
  })
})

/** A stored box whose next unseal runs `crossing` with the whisper opened, before it comes back to `box.expose`. */
async function boxCrossingUnseal(crossing: (box: TestableBox) => unknown) {
  const unsealStampedString: Vault['unsealStampedString'] = async (sealed, stamp) => {
    const whisperText = await world.mw.world.unsealStampedString(sealed, stamp)
    crossing(box)
    return whisperText
  }
  const listing = boxListingOf(world.mw, { world: world.mw.worldWith({ unsealStampedString }) })
  const box = await listing.create(boxDnaOf(world.mw.boxscope('anthropic_api_key')))
  return box
}

describe("An ending called while box.expose unseals", () => {
  it("the device's end refuses, and leaves nothing exposed", async () => {
    const box = await boxCrossingUnseal(() => { world.mw.disable() })
    await TH.expectRefusal(box.expose())
    expect(box.isEnabled).to.be.false
    expect(box.whisper).to.eq(ENCRYPTED)
  })

  it("a lock() refuses 'bank_locked', and leaves nothing exposed", async () => {
    const box = await boxCrossingUnseal(() => { world.mw.setLocked(true) })
    await TH.expectRefusal(box.expose(), 'bank_locked')
    world.mw.setLocked(false)
    expect(box.whisper).to.eq(ENCRYPTED)
  })
})
