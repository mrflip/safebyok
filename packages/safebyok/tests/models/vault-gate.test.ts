import { describe, expect, it, vi } from 'vitest'
import type { Lease } from '../../src/models/lease'
import type { ProofClosure } from '../../src/models/models-shapes'
import * as TH from '../test-helpers'
import { Dna, LeaseMillis, Passphrase, makeVaultWorld, useVaultWorlds } from '../test-helpers/vault-world'

useVaultWorlds()

const NewPassphrase = 'a new passphrase for the vault'

const BoxKeyStamp  = Object.freeze({ boxlabel: 'anthropic_api_key' })
const WhisperStamp = Object.freeze({ revision_seq: 1 })

/** What `opener` unseals of a whisper `sealer` seals: the two hold one vaultKey only if it comes back. */
const roundTrip = async (sealer: Lease, opener: Lease): Promise<string> => {
  const sealed = await sealer.sealWith(new TextEncoder().encode('sk-test'), BoxKeyStamp, WhisperStamp)
  return new TextDecoder().decode(await opener.unsealWith(sealed, BoxKeyStamp, WhisperStamp))
}

/** A vault born of `Dna` under `Passphrase` and sent, in a fresh world: unlocked, its lease kept on the device. */
const bornVault = async (proofClosure: ProofClosure = () => ({ passphrase: Passphrase })) => {
  const world = makeVaultWorld()
  const vault = await world.listing.build(Dna, proofClosure)
  await vault.send({})
  const storedGate = () => {
    const record = world.storedNow()
    if (record === null) { throw new Error('nothing stored') }
    return record.gate
  }
  return { ...world, vault, storedGate }
}

const bornWithPasskey = async () => {
  const passkeyAnswer = await TH.passkeyOf('laptop')
  return bornVault(() => ({ passphrase: Passphrase, passkeyAnswer }))
}

const byPassphrase = (passphrase: string) => () => ({ passphrase })
const byPasskey = (tag: string) => async () => ({ passkeyAnswer: await TH.passkeyOf(tag) })

describe("Vault.replacePassphrase", () => {
  it("replaces the passphrase wayin and keeps the passkey wayin as stored: the new passphrase opens, the old refuses 'wrong_passphrase', the passkey still opens, and the lease held stays in force", async () => {
    const { vault, storedGate, opts: { world } } = await bornWithPasskey()
    const held = vault.demandLease()
    const ante = storedGate()
    expect(await vault.replacePassphrase(byPassphrase(Passphrase), byPassphrase(NewPassphrase))).to.equal(vault)
    const post = storedGate()
    expect(post.passphrase_wayin).not.to.deep.equal(ante.passphrase_wayin)
    expect(post.passkey_wayin).to.deep.equal(ante.passkey_wayin)
    expect(vault.gate.pickle()).to.deep.equal(post)
    await TH.expectRefusal(vault.gate.attemptProof(byPassphrase(Passphrase), world), 'wrong_passphrase')
    const byKey = await vault.gate.attemptProof(byPasskey('laptop'), world)
    expect(byKey.wayinkind).to.eq('passkey')
    const proving = await vault.gate.attemptProof(byPassphrase(NewPassphrase), world)
    const lease = await proving.makeLease(vault, vault.leaseDBFriend(), { leaseMillis: LeaseMillis })
    expect(vault.demandLease()).to.equal(held)
    expect(held.isInForce).to.be.true
    expect(await roundTrip(held, lease)).to.eq('sk-test')
    lease.letGo()
  })

  it("refuses a wrong current proof with the attempt's own refusal, asking for no new passphrase and storing nothing", async () => {
    const { vault, storedNow } = await bornVault()
    const ante = storedNow()
    const passphraseClosure = vi.fn(byPassphrase(NewPassphrase))
    await TH.expectRefusal(vault.replacePassphrase(byPassphrase('not the passphrase'), passphraseClosure), 'wrong_passphrase')
    expect(passphraseClosure).not.toHaveBeenCalled()
    expect(storedNow()).to.equal(ante)
  })

  it("refuses 'bad_option' a passphrase closure that is no function, before asking for the proof", async () => {
    const { vault } = await bornVault()
    const proofClosure = vi.fn(byPassphrase(Passphrase))
    await TH.expectRefusal(vault.replacePassphrase(proofClosure, 'not a closure' as never), 'bad_option')
    expect(proofClosure).not.toHaveBeenCalled()
  })
})

describe("Vault.addPasskey", () => {
  it("adds a passkey wayin, sealed from the proving that opened, which the passkey then opens; the passphrase wayin stays as stored", async () => {
    const { vault, storedGate, opts: { world } } = await bornVault()
    const ante = storedGate()
    await vault.addPasskey(byPassphrase(Passphrase), byPasskey('laptop'))
    const post = storedGate()
    expect(post.passphrase_wayin).to.deep.equal(ante.passphrase_wayin)
    const { credential_id } = await TH.passkeyOf('laptop')
    expect(post.passkey_wayin?.credential_id).to.eq(credential_id)
    const proving = await vault.gate.attemptProof(byPasskey('laptop'), world)
    const lease = await proving.makeLease(vault, vault.leaseDBFriend(), { leaseMillis: LeaseMillis })
    expect(await roundTrip(vault.demandLease(), lease)).to.eq('sk-test')
    lease.letGo()
  })

  it("refuses 'bad_option' on a vault that has a passkey, asking nothing", async () => {
    const { vault } = await bornWithPasskey()
    const proofClosure = vi.fn(byPassphrase(Passphrase))
    const passkeyClosure = vi.fn(byPasskey('phone'))
    await TH.expectRefusal(vault.addPasskey(proofClosure, passkeyClosure), 'bad_option')
    expect(proofClosure).not.toHaveBeenCalled()
    expect(passkeyClosure).not.toHaveBeenCalled()
  })
})

describe("Vault.revokePasskey", () => {
  it("revokes the passkey: the gate holds none, the passkey refuses 'wrong_passkey', and the passphrase still opens", async () => {
    const { vault, storedGate, opts: { world } } = await bornWithPasskey()
    const ante = storedGate()
    await vault.revokePasskey(byPassphrase(Passphrase))
    expect(storedGate()).to.deep.equal({ passphrase_wayin: ante.passphrase_wayin, passkey_wayin: null })
    await TH.expectRefusal(vault.gate.attemptProof(byPasskey('laptop'), world), 'wrong_passkey')
    const proving = await vault.gate.attemptProof(byPassphrase(Passphrase), world)
    expect(proving.wayinkind).to.eq('passphrase')
  })

  it("refuses 'absent_wayin' on a vault without a passkey, asking nothing; the try form answers it as an Outcome", async () => {
    const { vault } = await bornVault()
    const proofClosure = vi.fn(byPassphrase(Passphrase))
    await TH.expectRefusal(vault.revokePasskey(proofClosure), 'absent_wayin')
    await TH.expectBad(vault.tryRevokePasskey(proofClosure), 'absent_wayin')
    expect(proofClosure).not.toHaveBeenCalled()
  })
})

describe("The gate operations' try forms", () => {
  it("answer the vault as a good Outcome, and a refusal as a bad one", async () => {
    const { vault } = await bornVault()
    const [oldPassphrase, newPassphrase, laptopPasskey] = [byPassphrase(Passphrase), byPassphrase(NewPassphrase), byPasskey('laptop')]
    expect(await TH.expectGood(vault.tryAddPasskey(oldPassphrase, laptopPasskey))).to.equal(vault)
    expect(await TH.expectGood(vault.tryReplacePassphrase(laptopPasskey, newPassphrase))).to.equal(vault)
    await TH.expectBad(vault.tryReplacePassphrase(oldPassphrase, newPassphrase), 'wrong_passphrase')
  })
})
