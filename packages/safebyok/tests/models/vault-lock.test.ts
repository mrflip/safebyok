import { describe, expect, it } from 'vitest'
import type { Gating } from '../../src/models/gating'
import * as TH from '../test-helpers'
import { Passphrase, byPassphrase, makeBornVault, useVaultWorlds } from '../test-helpers/vault-world'

useVaultWorlds()

/** A born vault, locked with its kept lease erased, whose next 'unlock_vault' gating the host holds open, unanswered, at `asked.gating`. */
const lockedVaultAsking = async () => {
  const world = await makeBornVault()
  world.vault.lock()
  await TH.eventually(() => world.deviceDB.cachedNow() === null)
  const asked = { gating: null as Gating<'unlock_vault'> | null }
  // The host's dialog stays open: one that closes settles the gating as declined.
  world.requestCleartext.mockImplementationOnce((gating) => new Promise<void>(() => { asked.gating = gating as Gating<'unlock_vault'> }))
  return { ...world, asked }
}

// == [A gating still asking]: lock and letLeaseGo decline it

describe("vault.lock() and vault.letLeaseGo(): a gating of the vault still asking is declined", () => {
  for (const verb of ['lock', 'letLeaseGo'] as const) {
    it(`declines it at ${verb}(): ensureUnlocked refuses 'vault_locked', and an attempt after refuses 'gating_landed'`, async () => {
      const { vault, asked } = await lockedVaultAsking()
      const pending = vault.ensureUnlocked()
      await TH.eventually(() => asked.gating !== null)
      vault[verb]()
      await TH.expectRefusal(pending, 'vault_locked')
      expect(asked.gating?.isOpen).to.be.false
      await TH.expectRefusal(asked.gating!.attempt(byPassphrase(Passphrase)), 'gating_landed')
      expect(vault.isLocked).to.be.true
    })
  }

  it("asks afresh at the next ensureUnlocked, and unlocks with what the user hands in", async () => {
    const { vault, asked, requestCleartext } = await lockedVaultAsking()
    const pending = vault.ensureUnlocked()
    await TH.eventually(() => asked.gating !== null)
    vault.lock()
    await TH.expectRefusal(pending, 'vault_locked')
    const lease = await vault.ensureUnlocked()
    expect(vault.demandLease()).to.equal(lease)
    expect(requestCleartext).toHaveBeenCalledTimes(2)
  })
})
// --

// == [An unlock overtaken]: a lock as an attempt is handed in, or while its lease is put, unlocks nothing

describe("vault.lock() overtaking an unlock in flight", () => {
  it("refuses 'vault_locked' an attempt handed in just before the lock lands: the vault stays locked and puts no lease", async () => {
    const { vault, deviceDB, asked } = await lockedVaultAsking()
    const pending = vault.ensureUnlocked()
    await TH.eventually(() => asked.gating !== null)
    const attempt = asked.gating!.attempt(byPassphrase(Passphrase))
    vault.lock()
    const err = await TH.expectRefusal(attempt, 'vault_locked')
    expect(err.message).to.include('locked while it was being unlocked')
    await TH.expectRefusal(pending, 'vault_locked')
    expect(vault.isLocked).to.be.true
    expect(deviceDB.tryPutLease).toHaveBeenCalledOnce()
    expect(deviceDB.cachedNow()).to.be.null
  })

  it("refuses 'vault_locked' a proof handed in whose lease is put as the lock lands: the lease is let go, and its record erased after the put", async () => {
    const { vault, deviceDB } = await makeBornVault()
    vault.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    const put = deviceDB.tryPutLease.getMockImplementation()!
    deviceDB.tryPutLease.mockImplementationOnce((record) => {
      vault.lock()
      return put(record)
    })
    await TH.expectRefusal(vault.ensureUnlocked(byPassphrase(Passphrase)), 'vault_locked')
    expect(vault.isLocked).to.be.true
    TH.expectSyncRefusal(() => vault.demandLease(), 'vault_locked')
    await TH.eventually(() => deviceDB.cachedNow() === null)
    expect(deviceDB.tryDelLease.mock.invocationCallOrder.at(-1)).to.be.greaterThan(deviceDB.tryPutLease.mock.invocationCallOrder.at(-1) ?? Infinity)
  })

  it("unlocks by an ensureUnlocked called after the lock, which joins none of the unlock it overtook", async () => {
    const { vault, deviceDB } = await makeBornVault()
    vault.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    const put = deviceDB.tryPutLease.getMockImplementation()!
    const held = { release: null as (() => void) | null }
    deviceDB.tryPutLease.mockImplementationOnce((record) => new Promise((resolve) => { held.release = () => { resolve(put(record)) } }))
    const overtaken = vault.ensureUnlocked(byPassphrase(Passphrase))
    await TH.eventually(() => held.release !== null)
    vault.lock()
    const after = vault.ensureUnlocked(byPassphrase(Passphrase))
    await TH.wakeupAtNextTick()
    held.release?.()
    await TH.expectRefusal(overtaken, 'vault_locked')
    const lease = await after
    expect(vault.demandLease()).to.equal(lease)
  })

  it("takes up no kept lease its look finds after a lock landed, and asks the user", async () => {
    const { vault, deviceDB, requestCleartext } = await makeBornVault()
    vault.letLeaseGo()
    const look = { answer: null as (() => void) | null }
    const get = deviceDB.tryGetLease.getMockImplementation()!
    deviceDB.tryGetLease.mockImplementationOnce((scope) => new Promise((resolve) => { look.answer = () => { resolve(get(scope)) } }))
    const pending = vault.ensureUnlocked()
    await TH.eventually(() => look.answer !== null)
    vault.lock()
    look.answer?.()
    const lease = await pending
    expect(requestCleartext).toHaveBeenCalledOnce()
    expect(vault.demandLease()).to.equal(lease)
  })
})
// --

// == [Eviction]: the lease let go, the kept lease left

describe("vault.evict()", () => {
  it("lets the lease go, as letLeaseGo does: the vault reads locked, and the kept lease stays for the next session", async () => {
    const { vault, deviceDB } = await makeBornVault()
    const born = vault.demandLease()
    vault.evict()
    expect(vault.isLocked).to.be.true
    expect(born.isInForce).to.be.false
    expect(deviceDB.tryDelLease).not.toHaveBeenCalled()
    expect(deviceDB.cachedNow()).to.not.be.null
  })
})
// --
