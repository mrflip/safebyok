/** A `lock()` crossing a put, an unlock's proof or a box verb, and what can reject a gate change after its record is stored. */

import { ENCRYPTED } from '../../src/helpers/consts'
import { describe, expect, it, vi } from 'vitest'
import type { Gating } from '../../src/models/gating'
import { Lease } from '../../src/models/lease'
import * as TH from '../test-helpers'
import { type TestableBox, boxDnaOf, boxListingOf, fakeSealBoxListingOf, fullBoxRecord, useModelsWorld } from '../test-helpers/models-world'
import { NewPassphrase, Passphrase, makeBornVault, replaceTyping, useVaultWorlds } from '../test-helpers/vault-world'
import type { BoxWorld } from '../../src/shapes/shapes-vaultish'

const world = useModelsWorld()
useVaultWorlds()

describe("a lock() called during a put", () => {
  it("during the seal refuses 'vault_locked', putting nothing", async () => {
    const lock = { during: false }
    const listing = fakeSealBoxListingOf(world.mw, {}, () => { if (lock.during) { world.mw.setLocked(true) } })
    const record = fullBoxRecord()
    world.mw.seedPut(record)
    const box = await listing.build(record)
    lock.during = true
    await TH.expectRefusal(box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'sealed while locking' } }), 'vault_locked')
    expect(world.mw.callsOf('put')).to.deep.equal([])
  })

  it("during the put still writes the record", async () => {
    const record = fullBoxRecord()
    world.mw.seedPut(record)
    const box = await boxListingOf(world.mw).build(record)
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
  it("during hello lets it resolve, and the next putBox refuses 'vault_locked'", async () => {
    const { vault, vaultDB } = await makeBornVault()
    const tryListBoxes = vaultDB.tryListBoxes.bind(vaultDB)
    vi.spyOn(vaultDB, 'tryListBoxes').mockImplementationOnce((...args) => { vault.lock(); return tryListBoxes(...args) })
    await expect(vault.hello()).resolves.to.eq(vault)
    await TH.expectRefusal(vault.putBox({ boxlabel: 'anthropic_api_key', whisper: { apiKey: 'sk-test-0000' } }), 'vault_locked')
  })

  it("during fetchBox's get still returns the box, whose whisper refuses 'vault_locked'", async () => {
    const { vault, vaultDB } = await makeBornVault()
    await vault.putBox({ boxlabel: 'anthropic_api_key', whisper: { apiKey: 'sk-test-0000' } })
    const tryGetBox = vaultDB.tryGetBox.bind(vaultDB)
    vi.spyOn(vaultDB, 'tryGetBox').mockImplementationOnce((...args) => { vault.lock(); return tryGetBox(...args) })
    const box = (await vault.fetchBox('anthropic_api_key'))!
    await TH.expectRefusal(box.extractWhisper(), 'vault_locked')
  })

  it("during extractWhisper's fetch refuses 'vault_locked'", async () => {
    const { vault, vaultDB } = await makeBornVault()
    const box = await vault.putBox({ boxlabel: 'anthropic_api_key', whisper: { apiKey: 'sk-test-0000' } })
    const tryGetBox = vaultDB.tryGetBox.bind(vaultDB)
    vi.spyOn(vaultDB, 'tryGetBox').mockImplementationOnce((...args) => { vault.lock(); return tryGetBox(...args) })
    await TH.expectRefusal(box.extractWhisper({ maxMillisSinceRefresh: 0 }), 'vault_locked')
  })

  it("during extractWhisper's decipher refuses 'vault_locked', handing back no whisper", async () => {
    const { vault } = await makeBornVault()
    const box = await vault.putBox({ boxlabel: 'anthropic_api_key', whisper: { apiKey: 'sk-test-0000' } })
    const decrypt = crypto.subtle.decrypt.bind(crypto.subtle)
    vi.spyOn(crypto.subtle, 'decrypt').mockImplementationOnce((...args) => { vault.lock(); return decrypt(...args) })
    await TH.expectRefusal(box.extractWhisper(), 'vault_locked')
    vi.restoreAllMocks()
  })

  it("during delBox's del still deletes the box", async () => {
    const { vault, vaultDB } = await makeBornVault()
    await vault.putBox({ boxlabel: 'anthropic_api_key', whisper: { apiKey: 'sk-test-0000' } })
    const tryDelBox = vaultDB.tryDelBox.bind(vaultDB)
    vi.spyOn(vaultDB, 'tryDelBox').mockImplementationOnce((...args) => { vault.lock(); return tryDelBox(...args) })
    const gone = await vault.delBox('anthropic_api_key')
    expect(gone?.isPresent).to.be.false
    expect(vault.isLocked).to.be.true
  })
})

/** A stored box whose next unseal runs `crossing` with the whisper opened, before it comes back to `box.expose`. */
const boxCrossingUnseal = async (crossing: (box: TestableBox) => unknown) => {
  const unsealStampedString: BoxWorld['unsealStampedString'] = async (sealed, stamp) => {
    const whisperText = await world.mw.world.unsealStampedString(sealed, stamp)
    crossing(box)
    return whisperText
  }
  const listing = boxListingOf(world.mw, { world: world.mw.worldWith({ unsealStampedString }) })
  const box = await listing.create(boxDnaOf(world.mw.boxscope('anthropic_api_key')))
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
    const box = await boxCrossingUnseal(() => { world.mw.setLocked(true) })
    await TH.expectRefusal(box.expose(), 'vault_locked')
    world.mw.setLocked(false)
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
  it.each(['sweep', 'vacate'] as const)("a %s as the answer arrives refuses, though the row is stored", async (ending) => {
    const { vault, listing, demandStored, opts: { vaultDB } } = await makeBornVault()
    const commit = vaultDB.tryReplacePassphrase.bind(vaultDB)
    vi.spyOn(vaultDB, 'tryReplacePassphrase').mockImplementationOnce(async (record, opts) => {
      const answer = await commit(record, opts)
      listing[ending]()
      return answer
    })
    await TH.expectRefusal(replaceTyping(vault, Passphrase, NewPassphrase))
    expect(demandStored().gate.gate_epoch).to.eq(2)
    expect(vault.isUnlocked).to.be.false
  })

  it("stays unlocked on the new lease when lock() is called while that lease is made", async () => {
    const { vault, deviceDB } = await makeBornVault()
    deviceDB.forget.mockClear()
    crossingGrant(() => { vault.lock() })
    await expect(replaceTyping(vault, Passphrase, NewPassphrase)).resolves.to.eq(vault)
    expect(vault.isUnlocked).to.be.true
    expect(deviceDB.cachedNow()).to.not.be.null
    expect(deviceDB.forget).toHaveBeenCalledOnce()
  })
})
