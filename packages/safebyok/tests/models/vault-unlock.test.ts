import { describe, expect, it, vi } from 'vitest'
import { makeLeaseKey } from '../../src/crypto'
import { memoryDeviceDB } from '../../src/device-db'
import type { Lease } from '../../src/models/lease'
import { NOVEL, Proving } from '../../src/models/proving'
import type { VaultWorld } from '../../src/models/vault-listing'
import * as TH from '../test-helpers'
import { Dna, LeaseMillis, Passphrase, T0, makeBornVault, makeVaultWorld, makeProving, roundTrip, useVaultWorlds } from '../test-helpers/vault-world'

useVaultWorlds()

/** A key deriver that must never be called. */
const deriveNothing = (): never => { throw new Error('derived') }

const BoxKeyStamp  = Object.freeze({ boxlabel: 'anthropic_api_key' })
const WhisperStamp = Object.freeze({ revision_seq: 1 })

const seal = (lease: Lease) => lease.sealWith(new TextEncoder().encode('sk-test'), BoxKeyStamp, WhisperStamp)

describe("Gate.attemptProof and Proving.attempt: the proving of a stored wayin that the proof opens", () => {
  it("answers the passphrase proving of the gate, which holds the vaultKey the vault was born under", async () => {
    const { vault, opts: { world } } = await makeBornVault()
    const proving = await vault.gate.attemptProof(() => ({ passphrase: Passphrase }), world)
    expect(proving.wayinkind).to.eq('passphrase')
    const lease = await proving.makeLease(vault, vault.leaseDBFriend(), { leaseMillis: LeaseMillis })
    expect(await roundTrip(vault.demandLease(), lease)).to.eq('sk-test')
    await lease.forget()
  })

  it("refuses 'wrong_passphrase' a passphrase the wayin will not open under", async () => {
    const { vault, opts: { world } } = await makeBornVault()
    await TH.expectRefusal(vault.gate.attemptProof(() => ({ passphrase: 'not the passphrase' }), world), 'wrong_passphrase')
  })

  it("refuses 'unknown_key_deriver' a world whose key deriver is not the one the wayin names, before deriving anything", async () => {
    const { vault, opts: { world } } = await makeBornVault()
    await TH.expectRefusal(vault.gate.attemptProof(() => ({ passphrase: Passphrase }), { ...world, keyDeriver: { ...TH.testDeriver, key_deriver_label: 'other_digest_v0', deriveKeyBytes: deriveNothing } }), 'unknown_key_deriver')
  })

  it("answers the passkey proving where the proof hands a passkey alone, and refuses 'wrong_passkey' another credential or another salt", async () => {
    const passkeyAnswer = await TH.passkeyOf('laptop')
    const { vault, opts: { world } } = await makeBornVault(() => ({ passphrase: Passphrase, passkeyAnswer }))
    const proving = await vault.gate.attemptProof(async () => ({ passkeyAnswer: await TH.passkeyOf('laptop') }), world)
    expect(proving.wayinkind).to.eq('passkey')
    const lease = await proving.makeLease(vault, vault.leaseDBFriend(), { leaseMillis: LeaseMillis })
    expect(await roundTrip(vault.demandLease(), lease)).to.eq('sk-test')
    await lease.forget()
    await TH.expectRefusal(vault.gate.attemptProof(async () => ({ passkeyAnswer: await TH.passkeyOf('phone') }), world), 'wrong_passkey')
    const { prf_salt_b64: otherSalt } = await TH.passkeyOf('elsewhere')
    await TH.expectRefusal(vault.gate.attemptProof(async () => ({ passkeyAnswer: await TH.passkeyOf('laptop', otherSalt) }), world), 'wrong_passkey')
  })

  it("refuses 'wrong_passkey' a passkey where the gate has no passkey wayin, and 'bad_option' a proof that hands neither", async () => {
    const { vault, opts: { world } } = await makeBornVault()
    await TH.expectRefusal(vault.gate.attemptProof(async () => ({ passkeyAnswer: await TH.passkeyOf('laptop') }), world), 'wrong_passkey')
    await TH.expectRefusal(vault.gate.attemptProof(() => ({}), world), 'bad_option')
  })
})

describe("Proving.makeWayin: one wayin per proving, of its own vault", () => {
  it("refuses a second wayin of a proving that holds one, and a source proving of another vault", async () => {
    const { vault, opts: { world } } = await makeBornVault()
    const mine = await vault.gate.attemptProof(() => ({ passphrase: Passphrase }), world)
    await TH.expectRefusal(mine.makeWayin(NOVEL), 'unexpected_error')
    const { passphraseProving } = await Proving.makeProvingPair(vault.gate.stamp, () => ({ passphrase: 'a new passphrase' }), world)
    await TH.expectRefusal(passphraseProving.makeWayin(await makeProving({ vault_tok: 'vault-tok-other', registered_at: T0 })), 'bad_option')
    const wayin = await passphraseProving.makeWayin(mine)
    expect(wayin.wayinkind).to.eq('passphrase')
  })
})

describe("Vault.ensureUnlocked and the vault's lock", () => {
  it("is born unlocked, under the lease its passphrase proving grants and the deviceDB keeps; ensureUnlocked answers that lease and asks nothing", async () => {
    const { vault, deviceDB } = await makeBornVault()
    expect(vault.isUnlocked).to.be.true
    expect(vault.lockState()).to.eq('unlocked')
    const lease = vault.demandLease()
    expect(lease.autolock_at).to.eq(T0 + LeaseMillis)
    expect(deviceDB.tryPutLease).toHaveBeenCalledOnce()
    expect(await vault.ensureUnlocked()).to.equal(lease)
  })

  it("refuses 'bad_option' a stamp of no fields, at the seal and at the unseal: a seal bound to nothing of the box's binds nothing", async () => {
    const { vault } = await makeBornVault()
    const lease = vault.demandLease()
    await TH.expectRefusal(lease.sealWith(new TextEncoder().encode('sk-test'), {}, WhisperStamp), 'bad_option')
    await TH.expectRefusal(lease.unsealWith(await seal(lease), BoxKeyStamp, {}), 'bad_option')
  })

  it("locks at `lock()`, erasing the kept lease; then refuses 'vault_locked' with no proof, the proof's own refusal with a wrong one, and unlocks with the right one", async () => {
    const { vault, deviceDB } = await makeBornVault()
    const born = vault.demandLease()
    vault.lock()
    expect(vault.isLocked).to.be.true
    TH.expectSyncRefusal(() => vault.demandLease(), 'vault_locked')
    await TH.expectRefusal(vault.ensureUnlocked(), 'vault_locked')
    await TH.expectRefusal(vault.ensureUnlocked(() => ({ passphrase: 'not the passphrase' })), 'wrong_passphrase')
    expect(vault.isLocked).to.be.true
    const lease = await vault.ensureUnlocked(() => ({ passphrase: Passphrase }))
    expect(lease).not.to.equal(born)
    expect(born.isForgotten).to.be.true
    expect(vault.demandLease()).to.equal(lease)
    expect(deviceDB.tryDelLease).toHaveBeenCalledOnce()
    expect(deviceDB.tryPutLease).toHaveBeenCalledTimes(2)
    expect(deviceDB.tryDelLease.mock.invocationCallOrder[0]).to.be.lessThan(deviceDB.tryPutLease.mock.invocationCallOrder[1] ?? 0)
    expect(deviceDB.keptNow()).not.to.be.null
  })

  it("unlocks a vault held sparse by proof, its full record fetched for the gate", async () => {
    const { demandStored } = await makeBornVault()
    const record = demandStored()
    const { listing } = makeVaultWorld(record)
    const vault = await listing.build(listing.sparseOf(record))
    expect(vault.isLocked).to.be.true
    await vault.ensureUnlocked(() => ({ passphrase: Passphrase }))
    expect(vault.isUnlocked).to.be.true
    expect(vault.isFull).to.be.true
  })

  it("holds a lease no longer in force once the clock passes its `autolock_at`: the lease refuses 'vault_locked', and ensureUnlocked locks and asks for the proof again", async () => {
    const { vault, advance, deviceDB } = await makeBornVault()
    const born = vault.demandLease()
    advance(LeaseMillis)
    expect(born.isInForce).to.be.false
    await TH.expectRefusal(seal(born), 'vault_locked')
    await TH.expectRefusal(vault.ensureUnlocked(), 'vault_locked')
    expect(vault.isLocked).to.be.true
    const lease = await vault.ensureUnlocked(() => ({ passphrase: Passphrase }))
    expect(lease.autolock_at).to.eq(T0 + (2 * LeaseMillis))
    expect(deviceDB.tryPutLease).toHaveBeenCalledTimes(2)
  })

  it("refuses 'bad_option' to take up a lease of another vault, and 'vault_locked' one no longer in force", async () => {
    const { vault, advance } = await makeBornVault()
    const { vault: other } = await makeBornVault()
    TH.expectSyncRefusal(() => other.takeUpLease(vault.demandLease()), 'bad_option')
    expect(other.demandLease()).not.to.equal(vault.demandLease())
    const born = vault.demandLease()
    advance(LeaseMillis)
    TH.expectSyncRefusal(() => vault.takeUpLease(born), 'vault_locked')
  })

  it("joins an unlock in flight: ensureUnlocked called at once, with a proof or without, asks the closure once and answers one lease", async () => {
    const { vault, deviceDB } = await makeBornVault()
    vault.lock()
    const proofClosure = vi.fn(() => ({ passphrase: Passphrase }))
    const [first, second, third] = await Promise.all([vault.ensureUnlocked(proofClosure), vault.ensureUnlocked(proofClosure), vault.ensureUnlocked()])
    expect(proofClosure).toHaveBeenCalledOnce()
    expect(second).to.equal(first)
    expect(third).to.equal(first)
    expect(vault.demandLease()).to.equal(first)
    expect(deviceDB.tryPutLease).toHaveBeenCalledTimes(2)
  })

  it("answers, when its look for a kept lease finds none, a lease taken up meanwhile, rather than refusing a vault that reads unlocked", async () => {
    const { vault, deviceDB, opts: { world } } = await makeBornVault()
    const proving = await vault.gate.attemptProof(() => ({ passphrase: Passphrase }), world)
    const fresh = await proving.makeLease(vault, vault.leaseDBFriend(), { leaseMillis: LeaseMillis })
    vault.lock()
    await TH.eventually(() => deviceDB.keptNow() === null)
    const look = { answer: null as (() => void) | null }
    deviceDB.tryGetLease.mockImplementationOnce(() => new Promise((resolve) => { look.answer = () => { resolve({ ok: true, val: null, err: null }) } }))
    const pending = vault.ensureUnlocked()
    await TH.eventually(() => look.answer !== null)
    expect(vault.takeUpLease(fresh)).to.equal(fresh)
    look.answer?.()
    expect(await pending).to.equal(fresh)
    expect(vault.demandLease()).to.equal(fresh)
  })

  it("locks at its lease's `autolock_at`, when the autolock fires, erasing the kept lease once", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const { vault, advance, deviceDB } = await makeBornVault()
      const born = vault.demandLease()
      advance(LeaseMillis)
      await vi.advanceTimersByTimeAsync(LeaseMillis)
      expect(vault.isLocked).to.be.true
      expect(born.isForgotten).to.be.true
      await TH.eventually(() => deviceDB.keptNow() === null)
      expect(deviceDB.tryDelLease).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it("lets a displaced lease go: past its own `autolock_at`, its autolock neither locks the vault nor erases the new lease's record", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const { vault, advance, deviceDB, opts: { world } } = await makeBornVault()
      const born = vault.demandLease()
      const halfway = LeaseMillis / 2
      advance(halfway)
      await vi.advanceTimersByTimeAsync(halfway)
      const proving = await vault.gate.attemptProof(() => ({ passphrase: Passphrase }), world)
      const lease = vault.takeUpLease(await proving.makeLease(vault, vault.leaseDBFriend(), { leaseMillis: LeaseMillis }))
      expect(born.isInForce).to.be.false
      advance(halfway + 1)
      await vi.advanceTimersByTimeAsync(halfway + 1)
      expect(vault.isUnlocked).to.be.true
      expect(vault.demandLease()).to.equal(lease)
      expect(lease.isInForce).to.be.true
      expect(deviceDB.tryDelLease).not.toHaveBeenCalled()
      expect(deviceDB.keptNow()).not.to.be.null
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("The lease this device keeps: taken up at the next session's hello", () => {
  it("unlocks the vault of the next session at hello, under a lease that opens what the born one sealed, without asking for anything", async () => {
    const { vault, demandStored, anotherSession } = await makeBornVault()
    const record = demandStored()
    const later = anotherSession()
    const again = await later.build(record)
    expect(again.isLocked).to.be.true
    await later.hello()
    expect(again.isUnlocked).to.be.true
    expect(await again.ensureUnlocked()).to.equal(again.demandLease())
    expect(await roundTrip(vault.demandLease(), again.demandLease())).to.eq('sk-test')
  })

  it("takes up no lease past its `autolock_at`, and erases its record", async () => {
    const { demandStored, anotherSession, advance, deviceDB } = await makeBornVault()
    const record = demandStored()
    advance(LeaseMillis)
    const later = anotherSession()
    const again = await later.build(record)
    await later.hello()
    expect(again.isLocked).to.be.true
    expect(deviceDB.keptNow()).to.be.null
    await TH.expectRefusal(again.ensureUnlocked(), 'vault_locked')
  })

  it("drops a kept lease that will not open at its first seal: the seal refuses 'damaged_lease', the vault locks, and the record is erased", async () => {
    const { demandStored, anotherSession, deviceDB } = await makeBornVault()
    const record = demandStored()
    const kept = deviceDB.keptNow() as Record<string, unknown> | null
    if (kept === null) { throw new Error('no lease kept') }
    deviceDB.keep({ ...kept, lease_key: await makeLeaseKey() })
    const later = anotherSession()
    const again = await later.build(record)
    await later.hello()
    const lease = again.demandLease()
    await TH.expectRefusal(seal(lease), 'damaged_lease')
    expect(again.isLocked).to.be.true
    expect(lease.isInForce).to.be.false
    await TH.eventually(() => deviceDB.keptNow() === null)
    expect(deviceDB.tryDelLease).toHaveBeenCalledOnce()
  })

  it("takes up, at the next ensureUnlocked, a lease another session kept after this vault's first look", async () => {
    const { vault, demandStored, anotherSession, deviceDB } = await makeBornVault()
    const record = demandStored()
    vault.lock()
    await TH.eventually(() => deviceDB.keptNow() === null)
    const later = anotherSession()
    const again = await later.build(record)
    await later.hello()
    await TH.expectRefusal(again.ensureUnlocked(), 'vault_locked')
    const lease = await vault.ensureUnlocked(() => ({ passphrase: Passphrase }))
    const taken = await again.ensureUnlocked()
    expect(again.demandLease()).to.equal(taken)
    expect(await roundTrip(lease, taken)).to.eq('sk-test')
  })

  it("lets every vault's lease go at the listing's goodbye: the vault reads locked, and the kept lease stays for the next session to take up", async () => {
    const { listing, vault, demandStored, anotherSession, deviceDB } = await makeBornVault()
    const record = demandStored()
    const born = vault.demandLease()
    listing.goodbye()
    expect(vault.isLocked).to.be.true
    expect(born.isInForce).to.be.false
    const later = anotherSession()
    const again = await later.build(record)
    await later.hello()
    expect(again.isUnlocked).to.be.true
    expect(deviceDB.tryDelLease).not.toHaveBeenCalled()
  })

  it("erases the kept lease at a lock() after goodbye, though the vault holds no lease: the next session asks for the proof", async () => {
    const { listing, vault, demandStored, anotherSession, deviceDB } = await makeBornVault()
    const record = demandStored()
    listing.goodbye()
    vault.lock()
    await TH.eventually(() => deviceDB.keptNow() === null)
    expect(deviceDB.tryDelLease).toHaveBeenCalledOnce()
    const later = anotherSession()
    const again = await later.build(record)
    await later.hello()
    expect(again.isLocked).to.be.true
    await TH.expectRefusal(again.ensureUnlocked(), 'vault_locked')
  })
})

describe("The real deviceDB as the vault's world's", () => {
  it("keeps the lease an unlock grants in memoryDeviceDB, and the next session's vault takes it up", async () => {
    const deviceDB: VaultWorld['deviceDB'] = memoryDeviceDB()
    const { listing, demandStored, anotherSession } = makeVaultWorld(null, { deviceDB })
    const vault = await listing.build(Dna, () => ({ passphrase: Passphrase }))
    await vault.send({})
    const record = demandStored()
    vault.lock()
    const lease = await vault.ensureUnlocked(() => ({ passphrase: Passphrase }))
    const later = anotherSession()
    const again = await later.build(record)
    const taken = await again.ensureUnlocked()
    expect(again.demandLease()).to.equal(taken)
    expect(await roundTrip(lease, taken)).to.eq('sk-test')
  })
})
