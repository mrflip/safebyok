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

  it("refuses 'bad_option' a proof by passkey, which unlocks but does not change the gate: it asks for no new passphrase, stores nothing, and spends the answer's PRF bytes", async () => {
    const { vault, storedNow } = await bornWithPasskey()
    const ante = storedNow()
    const passkeyAnswer = await TH.passkeyOf('laptop')
    const passphraseClosure = vi.fn(byPassphrase(NewPassphrase))
    await TH.expectRefusal(vault.replacePassphrase(() => ({ passkeyAnswer }), passphraseClosure), 'bad_option')
    expect(passphraseClosure).not.toHaveBeenCalled()
    expect(passkeyAnswer.prfBytes.every((byte) => byte === 0)).to.be.true
    expect(storedNow()).to.equal(ante)
  })

  it("refuses 'stale_write' where the gate changes elsewhere while it proves, storing nothing, its meta naming the revision stored and the one it had staged: a passkey revoked meanwhile stays revoked", async () => {
    const { vault, storedNow, storedGate, storeBehindOurBack, advance } = await bornWithPasskey()
    let revokedSeq = 0
    const proofClosure = () => {
      const record = storedNow()
      if (record === null) { throw new Error('nothing stored') }
      revokedSeq = storeBehindOurBack({ ...record, gate: { ...record.gate, passkey_wayin: null } }).revision_seq
      advance(11 * 60_000)
      return { passphrase: Passphrase }
    }
    const err = await TH.expectRefusal(vault.replacePassphrase(proofClosure, byPassphrase(NewPassphrase)), 'stale_write')
    expect(err.meta?.stored_revision?.revision_seq).to.eq(revokedSeq)
    expect(err.meta?.staged_revision?.revision_seq).to.eq(revokedSeq + 1)
    expect(storedNow()?.revision_seq).to.eq(revokedSeq)
    expect(storedGate().passkey_wayin).to.be.null
    expect(vault.gate.pkWayin).to.be.null
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

  it("refuses a wrong current proof with the attempt's own refusal, asking for no passkey and storing nothing", async () => {
    const { vault, storedNow } = await bornVault()
    const ante = storedNow()
    const passkeyClosure = vi.fn(byPasskey('laptop'))
    await TH.expectRefusal(vault.addPasskey(byPassphrase('not the passphrase'), passkeyClosure), 'wrong_passphrase')
    expect(passkeyClosure).not.toHaveBeenCalled()
    expect(storedNow()).to.equal(ante)
  })

  it("zeroes the PRF bytes of an answer it refuses: a closure answering more than the passkey's answer refuses 'bad_option', and stores nothing", async () => {
    const { vault, storedNow } = await bornVault()
    const ante = storedNow()
    const passkeyAnswer = await TH.passkeyOf('laptop')
    await TH.expectRefusal(vault.addPasskey(byPassphrase(Passphrase), () => ({ passkeyAnswer, extra: true }) as never), 'bad_option')
    expect(passkeyAnswer.prfBytes.every((byte) => byte === 0)).to.be.true
    expect(storedNow()).to.equal(ante)
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

  it("refuses a wrong current proof with the attempt's own refusal, storing nothing: the passkey still opens", async () => {
    const { vault, storedNow, opts: { world } } = await bornWithPasskey()
    const ante = storedNow()
    await TH.expectRefusal(vault.revokePasskey(byPasskey('phone')), 'wrong_passkey')
    expect(storedNow()).to.equal(ante)
    const proving = await vault.gate.attemptProof(byPasskey('laptop'), world)
    expect(proving.wayinkind).to.eq('passkey')
  })

  it("refuses 'bad_option' a proof by the passkey it would revoke, storing nothing: the passkey still opens", async () => {
    const { vault, storedNow, opts: { world } } = await bornWithPasskey()
    const ante = storedNow()
    await TH.expectRefusal(vault.revokePasskey(byPasskey('laptop')), 'bad_option')
    expect(storedNow()).to.equal(ante)
    const proving = await vault.gate.attemptProof(byPasskey('laptop'), world)
    expect(proving.wayinkind).to.eq('passkey')
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
    expect(await TH.expectGood(vault.tryReplacePassphrase(oldPassphrase, newPassphrase))).to.equal(vault)
    await TH.expectBad(vault.tryReplacePassphrase(oldPassphrase, newPassphrase), 'wrong_passphrase')
    await TH.expectBad(vault.tryReplacePassphrase(laptopPasskey, oldPassphrase), 'bad_option')
  })
})
