/** Crossings of `lock()`, pinned as the code meets them: one landing in the middle of a send, and one landing while an unlock proves. */

import { describe, expect, it } from 'vitest'
import * as TH from '../test-helpers'
import { boxListingOf, fakeSealBoxListingOf, fullBoxRecord, useModelsWorld } from '../test-helpers/models-world'
import { Passphrase, makeBornVault, useVaultWorlds } from '../test-helpers/vault-world'

const held = useModelsWorld()
useVaultWorlds()

describe("a lock() landing during a send", () => {
  it("during the seal refuses 'vault_locked', putting nothing: send checks the lock at both ends of the seal", async () => {
    const lock = { during: false }
    const listing = fakeSealBoxListingOf(held.mw, {}, () => { if (lock.during) { held.mw.setLockState('locked') } })
    const record = fullBoxRecord()
    held.mw.seedStore(record)
    const box = await listing.build(record)
    lock.during = true
    await TH.expectRefusal(box.send({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'sealed while locking' } }), 'vault_locked')
    expect(held.mw.callsOf('put')).to.deep.equal([])
  })

  it("during the put lands the record anyway: the put is past the window, and the box reads locked after", async () => {
    const record = fullBoxRecord()
    held.mw.seedStore(record)
    const box = await boxListingOf(held.mw).build(record)
    held.mw.willPut(({ record: sent }) => {
      held.mw.setLockState('locked')
      return held.mw.answerOf(box.scope, sent)
    })
    await expect(box.send({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'sent while locking' } })).resolves.to.eq(box)
    expect(box.isLocked).to.be.true
    expect(box.sidecar).to.deep.equal({ note: 'sent while locking' })
  })
})

describe("A lock that lands while an unlock proves", () => {
  it("ends unlocked: the proof still takes up and caches its lease, and the next lock() ends that session", async () => {
    const { vault, deviceDB } = await makeBornVault()
    vault.lock()
    const lockingAnswer = () => {
      vault.lock()
      return { passphrase: Passphrase }
    }
    await vault.ensureUnlocked(lockingAnswer)
    expect(vault.isUnlocked).to.be.true
    expect(deviceDB.tryCache).toHaveBeenCalledTimes(2)
    vault.lock()
    expect(vault.isUnlocked).to.be.false
  })
})
