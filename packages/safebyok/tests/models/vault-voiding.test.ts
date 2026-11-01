import { describe, expect, it } from 'vitest'
import { VaultError } from '../../src/errors'
import { type LeaseRecord, FirstGateEpoch } from '../../src/models/models-shapes'
import * as TH from '../test-helpers'
import { type VaultTestWorld, NewPassphrase, Passphrase, answerAtOnce, byPassphrase, makeBornVault, makeBornVaultWithPasskey, moveGateElsewhere, roundTrip, useVaultWorlds } from '../test-helpers/vault-world'

useVaultWorlds()

const Replacing = Object.freeze({ passphrase: Passphrase, nextPassphrase: NewPassphrase })

const nextSession = async (world: Pick<VaultTestWorld, 'anotherSession' | 'demandStored'>) => {
  const listing = world.anotherSession()
  const vault = await listing.build(world.demandStored())
  await listing.hello()
  return vault
}

describe("gate_epoch: where it starts and what moves it", () => {
  it("is the first epoch at a vault's birth, in the record stored and in the lease kept", async () => {
    const { vault, demandStored, deviceDB } = await makeBornVault()
    expect(vault.gate_epoch).to.eq(FirstGateEpoch)
    expect(demandStored().gate_epoch).to.eq(FirstGateEpoch)
    expect((deviceDB.cachedNow() as LeaseRecord).gate_epoch).to.eq(FirstGateEpoch)
  })

  it("stays where it is at a host's edit, which ignores an epoch handed in, and the lease stays in force", async () => {
    const { vault, demandStored } = await makeBornVault()
    const lease = vault.demandLease()
    const { revision_seq } = demandStored()
    await vault.send({ gate_epoch: 40 })
    expect(demandStored().revision_seq).to.be.above(revision_seq)
    expect(demandStored().gate_epoch).to.eq(FirstGateEpoch)
    expect(vault.demandLease()).to.equal(lease)
    expect(lease.isInForce).to.be.true
  })

  it("stays where it is at a put refused: the gate unchanged, the lease held still in force", async () => {
    const { vault, opts, demandStored } = await makeBornVault()
    const lease = vault.demandLease()
    opts.store.put = (record) => Promise.resolve({ scope: record, ok: false as const, err: new VaultError('unexpected_error', 'the vaultDB is gone'), world: null })
    await TH.expectRefusal(vault.replacePassphrase({ ...Replacing }), 'unexpected_error')
    expect(vault.gate_epoch).to.eq(FirstGateEpoch)
    expect(demandStored().gate_epoch).to.eq(FirstGateEpoch)
    expect(vault.isUnlocked).to.be.true
    expect(lease.isInForce).to.be.true
  })
})

describe("a change of the gate on this device", () => {
  const OwnChangeCases = [
    ['replacePassphrase', makeBornVault, async (vault) => vault.replacePassphrase({ ...Replacing })],
    ['addPasskey', makeBornVault, async (vault) => vault.addPasskey({ passphrase: Passphrase, passkeyAnswer: await TH.passkeyOf('laptop') })],
    ['revokePasskey', makeBornVaultWithPasskey, async (vault) => vault.revokePasskey(byPassphrase(Passphrase))],
  ] as const satisfies readonly (readonly [string, typeof makeBornVault, (vault: Awaited<ReturnType<typeof makeBornVault>>['vault']) => Promise<unknown>])[]

  for (const [verb, makeBorn, change] of OwnChangeCases) {
    it(`${verb} moves the epoch by one and voids the lease held: the vault stays unlocked under a new lease of the next epoch, kept on the device, and the old one refuses 'gate_moved'`, async () => {
      const { vault, demandStored, deviceDB } = await makeBorn()
      const held = vault.demandLease()
      await change(vault)
      expect(demandStored().gate_epoch).to.eq(FirstGateEpoch + 1)
      expect(vault.gate_epoch).to.eq(FirstGateEpoch + 1)
      expect(vault.isUnlocked).to.be.true
      const lease = vault.demandLease()
      expect(lease).to.not.equal(held)
      expect(lease.isInForce).to.be.true
      expect(lease.gate_epoch).to.eq(FirstGateEpoch + 1)
      expect((deviceDB.cachedNow() as LeaseRecord).gate_epoch).to.eq(FirstGateEpoch + 1)
      expect(held.isInForce).to.be.false
      await TH.expectRefusal(roundTrip(held, lease), 'gate_moved')
    })
  }

  it("settles through its own gating, undeclined, the vault unlocked at the end of it", async () => {
    const { vault, requestCleartext } = await makeBornVault()
    await vault.addPasskey()
    expect(requestCleartext.mock.calls.map(([gating]) => gating.gatingkind)).to.deep.equal(['add_passkey'])
    expect(vault.isUnlocked).to.be.true
  })

  it("leaves a locked vault locked, granting nothing, the epoch moved", async () => {
    const { vault, deviceDB } = await makeBornVault()
    vault.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    await vault.replacePassphrase({ ...Replacing })
    expect(vault.gate_epoch).to.eq(FirstGateEpoch + 1)
    expect(vault.isLocked).to.be.true
    expect(deviceDB.cachedNow()).to.be.null
  })
})

describe("a lease kept across a reload", () => {
  it("unlocks the next session while the gate has not moved", async () => {
    const born = await makeBornVault()
    const vault = await nextSession(born)
    expect(vault.isUnlocked).to.be.true
    expect(vault.demandLease().gate_epoch).to.eq(FirstGateEpoch)
  })

  it("under an older epoch does not unlock at the next session's hello, and is erased", async () => {
    const born = await makeBornVault()
    await moveGateElsewhere(born)
    const vault = await nextSession(born)
    expect(vault.gate_epoch).to.eq(FirstGateEpoch + 1)
    expect(vault.isLocked).to.be.true
    expect(born.deviceDB.cachedNow()).to.be.null
  })

  it("under an older epoch answers a look for it with null, however the vault comes by the record", async () => {
    const born = await makeBornVault()
    const stale = await born.deviceDB.cachedNow()
    born.vault.lock()
    await TH.eventually(() => born.deviceDB.cachedNow() === null)
    await moveGateElsewhere(born)
    await born.vault.fetch()
    born.deviceDB.cache(stale)
    expect(await born.vault.takeUpCachedLease()).to.be.null
    expect(born.vault.isLocked).to.be.true
    expect(born.deviceDB.cachedNow()).to.be.null
  })

  it("under an older epoch does not spare ensureUnlocked its gating", async () => {
    const born = await makeBornVault()
    await moveGateElsewhere(born)
    const listing = born.anotherSession()
    const vault = await listing.build(born.demandStored())
    born.requestCleartext.mockClear()
    born.requestCleartext.mockImplementationOnce(answerAtOnce({ unlock_vault: () => byPassphrase(NewPassphrase) }))
    const lease = await vault.ensureUnlocked()
    expect(born.requestCleartext.mock.calls.map(([gating]) => gating.gatingkind)).to.deep.equal(['unlock_vault'])
    expect(lease.gate_epoch).to.eq(FirstGateEpoch + 1)
  })

  it("under a newer epoch than the record in hand counts as none and is erased", async () => {
    const born = await makeBornVault()
    born.deviceDB.cache({ ...(born.deviceDB.cachedNow() as LeaseRecord), gate_epoch: FirstGateEpoch + 1 })
    const vault = await nextSession(born)
    expect(vault.isLocked).to.be.true
    expect(born.deviceDB.cachedNow()).to.be.null
  })

  it("is refused by takeUpLease once voided, as any lease not in force is", async () => {
    const born = await makeBornVault()
    const held = born.vault.demandLease()
    await moveGateElsewhere(born)
    await born.vault.fetch()
    expect(() => born.vault.takeUpLease(held)).to.throw(VaultError).with.property('refusalkind', 'vault_locked')
  })
})
