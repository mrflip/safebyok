import { describe, expect, it, vi } from 'vitest'
import * as TH from '../test-helpers'
import { LeaseMillis, NewPassphrase, Passphrase, byPasskey, byPassphrase, makeBornVault, makeBornVaultWithPasskey, roundTrip, useVaultWorlds } from '../test-helpers/vault-world'

useVaultWorlds()

describe("Vault.replacePassphrase", () => {
  it("replaces the passphrase wayin and keeps the passkey wayin as stored: the new passphrase opens, the old refuses 'wrong_passphrase', the passkey still opens, and the lease held stays in force", async () => {
    const { vault, demandStored, opts: { world } } = await makeBornVaultWithPasskey()
    const held = vault.demandLease()
    const ante = demandStored().gate
    expect(await vault.replacePassphrase(byPassphrase(Passphrase), byPassphrase(NewPassphrase))).to.equal(vault)
    const post = demandStored().gate
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
    lease.evict()
  })

  it("refuses a wrong current proof with the attempt's own refusal, asking for no new passphrase and storing nothing", async () => {
    const { vault, storedNow } = await makeBornVault()
    const ante = storedNow()
    const passphraseClosure = vi.fn(byPassphrase(NewPassphrase))
    await TH.expectRefusal(vault.replacePassphrase(byPassphrase('not the passphrase'), passphraseClosure), 'wrong_passphrase')
    expect(passphraseClosure).not.toHaveBeenCalled()
    expect(storedNow()).to.equal(ante)
  })

  it("refuses 'bad_option' a proof by passkey, which unlocks but does not change the gate: it asks for no new passphrase, stores nothing, and spends the answer's PRF bytes", async () => {
    const { vault, storedNow } = await makeBornVaultWithPasskey()
    const ante = storedNow()
    const passkeyAnswer = await TH.passkeyOf('laptop')
    const passphraseClosure = vi.fn(byPassphrase(NewPassphrase))
    await TH.expectRefusal(vault.replacePassphrase(() => ({ passkeyAnswer }), passphraseClosure), 'bad_option')
    expect(passphraseClosure).not.toHaveBeenCalled()
    expect(passkeyAnswer.prfBytes.every((byte) => byte === 0)).to.be.true
    expect(storedNow()).to.equal(ante)
  })

  it("refuses 'stale_write' where the gate changes elsewhere while it proves, storing nothing, its meta naming the revision stored and the one it had staged: a passkey revoked meanwhile stays revoked", async () => {
    const { vault, storedNow, demandStored, storeBehindOurBack, advance } = await makeBornVaultWithPasskey()
    let revokedSeq = 0
    const proofClosure = () => {
      const record = demandStored()
      revokedSeq = storeBehindOurBack({ ...record, gate: { ...record.gate, passkey_wayin: null } }).revision_seq
      advance(11 * 60_000)
      return { passphrase: Passphrase }
    }
    const err = await TH.expectRefusal(vault.replacePassphrase(proofClosure, byPassphrase(NewPassphrase)), 'stale_write')
    expect(err.meta?.stored_revision?.revision_seq).to.eq(revokedSeq)
    expect(err.meta?.staged_revision?.revision_seq).to.eq(revokedSeq + 1)
    expect(storedNow()?.revision_seq).to.eq(revokedSeq)
    expect(demandStored().gate.passkey_wayin).to.be.null
    expect(vault.gate.pkWayin).to.be.null
  })

  it("refuses 'bad_option' a passphrase closure that is no function, before asking for the proof", async () => {
    const { vault } = await makeBornVault()
    const proofClosure = vi.fn(byPassphrase(Passphrase))
    await TH.expectRefusal(vault.replacePassphrase(proofClosure, 'not a closure' as never), 'bad_option')
    expect(proofClosure).not.toHaveBeenCalled()
  })
})

describe("Vault.addPasskey", () => {
  it("adds a passkey wayin, sealed from the proving that opened, which the passkey then opens; the passphrase wayin stays as stored", async () => {
    const { vault, demandStored, opts: { world } } = await makeBornVault()
    const ante = demandStored().gate
    await vault.addPasskey(byPassphrase(Passphrase), byPasskey('laptop'))
    const post = demandStored().gate
    expect(post.passphrase_wayin).to.deep.equal(ante.passphrase_wayin)
    const { credential_id } = await TH.passkeyOf('laptop')
    expect(post.passkey_wayin?.credential_id).to.eq(credential_id)
    const proving = await vault.gate.attemptProof(byPasskey('laptop'), world)
    const lease = await proving.makeLease(vault, vault.leaseDBFriend(), { leaseMillis: LeaseMillis })
    expect(await roundTrip(vault.demandLease(), lease)).to.eq('sk-test')
    lease.evict()
  })

  it("refuses 'bad_option' on a vault that has a passkey, asking nothing", async () => {
    const { vault } = await makeBornVaultWithPasskey()
    const proofClosure = vi.fn(byPassphrase(Passphrase))
    const passkeyClosure = vi.fn(byPasskey('phone'))
    await TH.expectRefusal(vault.addPasskey(proofClosure, passkeyClosure), 'bad_option')
    expect(proofClosure).not.toHaveBeenCalled()
    expect(passkeyClosure).not.toHaveBeenCalled()
  })

  it("refuses a wrong current proof with the attempt's own refusal, asking for no passkey and storing nothing", async () => {
    const { vault, storedNow } = await makeBornVault()
    const ante = storedNow()
    const passkeyClosure = vi.fn(byPasskey('laptop'))
    await TH.expectRefusal(vault.addPasskey(byPassphrase('not the passphrase'), passkeyClosure), 'wrong_passphrase')
    expect(passkeyClosure).not.toHaveBeenCalled()
    expect(storedNow()).to.equal(ante)
  })

  it("zeroes the PRF bytes of an answer it refuses: a closure answering more than the passkey's answer refuses 'bad_option', and stores nothing", async () => {
    const { vault, storedNow } = await makeBornVault()
    const ante = storedNow()
    const passkeyAnswer = await TH.passkeyOf('laptop')
    await TH.expectRefusal(vault.addPasskey(byPassphrase(Passphrase), () => ({ passkeyAnswer, extra: true }) as never), 'bad_option')
    expect(passkeyAnswer.prfBytes.every((byte) => byte === 0)).to.be.true
    expect(storedNow()).to.equal(ante)
  })
})

describe("Vault.revokePasskey", () => {
  it("revokes the passkey: the gate holds none, the passkey refuses 'wrong_passkey', and the passphrase still opens", async () => {
    const { vault, demandStored, opts: { world } } = await makeBornVaultWithPasskey()
    const ante = demandStored().gate
    await vault.revokePasskey(byPassphrase(Passphrase))
    expect(demandStored().gate).to.deep.equal({ passphrase_wayin: ante.passphrase_wayin, passkey_wayin: null })
    await TH.expectRefusal(vault.gate.attemptProof(byPasskey('laptop'), world), 'wrong_passkey')
    const proving = await vault.gate.attemptProof(byPassphrase(Passphrase), world)
    expect(proving.wayinkind).to.eq('passphrase')
  })

  it("refuses a wrong current proof with the attempt's own refusal, storing nothing: the passkey still opens", async () => {
    const { vault, storedNow, opts: { world } } = await makeBornVaultWithPasskey()
    const ante = storedNow()
    await TH.expectRefusal(vault.revokePasskey(byPasskey('phone')), 'wrong_passkey')
    expect(storedNow()).to.equal(ante)
    const proving = await vault.gate.attemptProof(byPasskey('laptop'), world)
    expect(proving.wayinkind).to.eq('passkey')
  })

  it("refuses 'bad_option' a proof by the passkey it would revoke, storing nothing: the passkey still opens", async () => {
    const { vault, storedNow, opts: { world } } = await makeBornVaultWithPasskey()
    const ante = storedNow()
    await TH.expectRefusal(vault.revokePasskey(byPasskey('laptop')), 'bad_option')
    expect(storedNow()).to.equal(ante)
    const proving = await vault.gate.attemptProof(byPasskey('laptop'), world)
    expect(proving.wayinkind).to.eq('passkey')
  })

  it("refuses 'absent_wayin' on a vault without a passkey, asking nothing; the try form answers it as an Outcome", async () => {
    const { vault } = await makeBornVault()
    const proofClosure = vi.fn(byPassphrase(Passphrase))
    await TH.expectRefusal(vault.revokePasskey(proofClosure), 'absent_wayin')
    await TH.expectBad(vault.tryRevokePasskey(proofClosure), 'absent_wayin')
    expect(proofClosure).not.toHaveBeenCalled()
  })
})

describe("The gate operations' try forms", () => {
  it("answer the vault as a good Outcome, and a refusal as a bad one", async () => {
    const { vault } = await makeBornVault()
    const [oldPassphrase, newPassphrase, laptopPasskey] = [byPassphrase(Passphrase), byPassphrase(NewPassphrase), byPasskey('laptop')]
    expect(await TH.expectGood(vault.tryAddPasskey(oldPassphrase, laptopPasskey))).to.equal(vault)
    expect(await TH.expectGood(vault.tryReplacePassphrase(oldPassphrase, newPassphrase))).to.equal(vault)
    await TH.expectBad(vault.tryReplacePassphrase(oldPassphrase, newPassphrase), 'wrong_passphrase')
    await TH.expectBad(vault.tryReplacePassphrase(laptopPasskey, oldPassphrase), 'bad_option')
  })
})
