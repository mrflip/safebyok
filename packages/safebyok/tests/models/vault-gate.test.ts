import { describe, expect, it } from 'vitest'
import type { AnyGating, Gating } from '../../src/models/gating'
import * as TH from '../test-helpers'
import { isZeroed } from '../test-helpers/proving-world'
import { Dna, LeaseMillis, NewPassphrase, Passphrase, byPasskey, byPassphrase, declineAtOnce, holdNextDialog, makeBornVault, makeBornVaultWithPasskey, roundTrip, useVaultWorlds } from '../test-helpers/vault-world'

useVaultWorlds()

const Replacing = Object.freeze({ passphrase: Passphrase, nextPassphrase: NewPassphrase })

describe("Vault.replacePassphrase(cleartexts)", () => {
  it("replaces the passphrase wayin and keeps the passkey wayin as stored: the new passphrase opens, the old refuses 'wrong_passphrase', the passkey still opens, and the lease held stays in force", async () => {
    const { vault, demandStored, requestCleartext, opts: { world } } = await makeBornVaultWithPasskey()
    const held = vault.demandLease()
    const ante = demandStored().gate
    expect(await vault.replacePassphrase({ ...Replacing })).to.equal(vault)
    expect(requestCleartext).not.toHaveBeenCalled()
    const post = demandStored().gate
    expect(post.passphrase_wayin).not.to.deep.equal(ante.passphrase_wayin)
    expect(post.passkey_wayin).to.deep.equal(ante.passkey_wayin)
    expect(vault.gate.pickle()).to.deep.equal(post)
    await TH.expectRefusal(vault.gate.attemptProof(byPassphrase(Passphrase), world), 'wrong_passphrase')
    const byKey = await vault.gate.attemptProof(await byPasskey('laptop'), world)
    expect(byKey.wayinkind).to.eq('passkey')
    const proving = await vault.gate.attemptProof(byPassphrase(NewPassphrase), world)
    const lease = await proving.makeLease(vault, vault.leaseDBFriend(), { leaseMillis: LeaseMillis })
    expect(vault.demandLease()).to.equal(held)
    expect(held.isInForce).to.be.true
    expect(await roundTrip(held, lease)).to.eq('sk-test')
    lease.evict()
  })

  it("refuses a wrong current passphrase 'wrong_passphrase', storing nothing", async () => {
    const { vault, storedNow } = await makeBornVault()
    const ante = storedNow()
    await TH.expectRefusal(vault.replacePassphrase({ passphrase: 'not the passphrase', nextPassphrase: NewPassphrase }), 'wrong_passphrase')
    expect(storedNow()).to.equal(ante)
  })

  it("refuses 'same_passphrase' a next passphrase the same as the current one, asking the strengthChecker nothing and storing nothing", async () => {
    const { vault, storedNow, strengthChecker } = await makeBornVault()
    const ante = storedNow()
    strengthChecker.mockClear()
    await TH.expectRefusal(vault.replacePassphrase({ passphrase: Passphrase, nextPassphrase: Passphrase }), 'same_passphrase')
    expect(strengthChecker).not.toHaveBeenCalled()
    expect(storedNow()).to.equal(ante)
  })

  it("hands the next passphrase alone to the strengthChecker, for the vault's scope, and refuses a weak one 'weak_passphrase' with the checker's reason, storing nothing", async () => {
    const { vault, storedNow, strengthChecker } = await makeBornVault()
    const ante = storedNow()
    strengthChecker.mockClear()
    strengthChecker.mockReturnValueOnce({ strong: false, reason: 'Add another word or two.' })
    const err = await TH.expectRefusal(vault.replacePassphrase({ ...Replacing }), 'weak_passphrase')
    expect(err.message).to.eq('Add another word or two.')
    expect(strengthChecker.mock.calls).to.deep.equal([[NewPassphrase, Dna]])
    expect(storedNow()).to.equal(ante)
  })

  it("refuses 'bad_option' a proof by passkey, which unlocks but does not change the gate: it stores nothing, and spends the answer's PRF bytes", async () => {
    const { vault, storedNow } = await makeBornVaultWithPasskey()
    const ante = storedNow()
    const passkeyAnswer = await TH.passkeyOf('laptop')
    await TH.expectRefusal(vault.replacePassphrase({ passkeyAnswer, nextPassphrase: NewPassphrase } as never), 'bad_option')
    expect(isZeroed(passkeyAnswer.prfBytes)).to.be.true
    expect(storedNow()).to.equal(ante)
  })

  it("refuses 'stale_write' where the gate changes elsewhere while it proves, storing nothing, its meta naming the revision stored and the one it had staged: a passkey revoked meanwhile stays revoked", async () => {
    const { vault, storedNow, demandStored, storeBehindOurBack, advance, strengthChecker } = await makeBornVaultWithPasskey()
    let revokedSeq = 0
    strengthChecker.mockImplementationOnce(() => {
      const record = demandStored()
      revokedSeq = storeBehindOurBack({ ...record, gate: { ...record.gate, passkey_wayin: null } }).revision_seq
      advance(11 * 60_000)
      return { strong: true }
    })
    const err = await TH.expectRefusal(vault.replacePassphrase({ ...Replacing }), 'stale_write')
    expect(err.meta?.stored_revision?.revision_seq).to.eq(revokedSeq)
    expect(err.meta?.staged_revision?.revision_seq).to.eq(revokedSeq + 1)
    expect(storedNow()?.revision_seq).to.eq(revokedSeq)
    expect(demandStored().gate.passkey_wayin).to.be.null
    expect(vault.gate.pkWayin).to.be.null
  })

  it("refuses 'bad_option' cleartexts handed as a function, as a proof closure once was, storing nothing", async () => {
    const { vault, storedNow } = await makeBornVault()
    const ante = storedNow()
    await TH.expectRefusal(vault.replacePassphrase((() => Replacing) as never), 'bad_option')
    expect(storedNow()).to.equal(ante)
  })
})

describe("Vault.replacePassphrase(), asking the user", () => {
  it("asks once, through a 'replace_passphrase' gating of the vault, and replaces the passphrase with what the user hands in", async () => {
    const { vault, requestCleartext, opts: { world } } = await makeBornVault()
    expect(await vault.replacePassphrase()).to.equal(vault)
    expect(requestCleartext).toHaveBeenCalledTimes(1)
    const [gating] = requestCleartext.mock.calls[0]!
    expect(gating.gatingkind).to.eq('replace_passphrase')
    expect(gating.vault).to.equal(vault)
    expect(gating.isOpen).to.be.false
    const proving = await vault.gate.attemptProof(byPassphrase(NewPassphrase), world)
    expect(proving.wayinkind).to.eq('passphrase')
  })

  it("keeps the gating open past a weak next passphrase, and replaces the passphrase with the next attempt", async () => {
    const { vault, requestCleartext, strengthChecker, opts: { world } } = await makeBornVault()
    strengthChecker.mockReturnValueOnce({ strong: false, reason: 'Add another word or two.' })
    requestCleartext.mockImplementationOnce(async (gating: AnyGating) => {
      if (gating.gatingkind !== 'replace_passphrase') { throw new Error(`no ${gating.gatingkind} here`) }
      await TH.expectBad(gating.tryAttempt({ passphrase: Passphrase, nextPassphrase: 'pw' }), 'weak_passphrase')
      expect(gating.isOpen).to.be.true
      await gating.attempt({ ...Replacing })
    })
    await vault.replacePassphrase()
    await vault.gate.attemptProof(byPassphrase(NewPassphrase), world)
  })

  it("refuses 'declined' when the user declines, storing nothing", async () => {
    const { vault, storedNow, requestCleartext } = await makeBornVault()
    const ante = storedNow()
    requestCleartext.mockImplementationOnce(declineAtOnce)
    await TH.expectRefusal(vault.replacePassphrase(), 'declined')
    expect(storedNow()).to.equal(ante)
  })
})

describe("A second gating on a vault", () => {
  it("joins a gating of its own kind still asking: the user is asked once, and both calls answer what that gating settles", async () => {
    const { vault, requestCleartext, opts: { world } } = await makeBornVault()
    const dialog = holdNextDialog(requestCleartext)
    const first = vault.replacePassphrase()
    const gating = await dialog.gating as Gating<'replace_passphrase'>
    const second = vault.replacePassphrase()
    await TH.wakeupAtNextTick()
    await gating.attempt({ ...Replacing })
    expect(await first).to.equal(vault)
    expect(await second).to.equal(vault)
    expect(requestCleartext).toHaveBeenCalledOnce()
    await vault.gate.attemptProof(byPassphrase(NewPassphrase), world)
    dialog.close()
  })

  it("waits behind a gating of another kind until it settles, then asks the user its own", async () => {
    const { vault, requestCleartext, opts: { world } } = await makeBornVault()
    vault.lock()
    const dialog = holdNextDialog(requestCleartext)
    const unlocking = vault.ensureUnlocked()
    const gating = await dialog.gating as Gating<'unlock_vault'>
    const replacing = vault.replacePassphrase()
    await TH.wakeupAtNextTick()
    expect(requestCleartext).toHaveBeenCalledOnce()
    await gating.attempt(byPassphrase(Passphrase))
    expect(await unlocking).to.equal(vault.demandLease())
    expect(await replacing).to.equal(vault)
    expect(requestCleartext.mock.calls.map(([asked]) => asked.gatingkind)).to.deep.equal(['unlock_vault', 'replace_passphrase'])
    await vault.gate.attemptProof(byPassphrase(NewPassphrase), world)
    dialog.close()
  })

  it("asks its own once the gating ahead of it is declined: the decline refuses only the call that launched it", async () => {
    const { vault, requestCleartext, opts: { world } } = await makeBornVault()
    vault.lock()
    const dialog = holdNextDialog(requestCleartext)
    const unlocking = vault.ensureUnlocked()
    const gating = await dialog.gating
    const replacing = vault.replacePassphrase()
    gating.decline()
    await TH.expectRefusal(unlocking, 'declined')
    expect(await replacing).to.equal(vault)
    expect(requestCleartext).toHaveBeenCalledTimes(2)
    await vault.gate.attemptProof(byPassphrase(NewPassphrase), world)
    dialog.close()
  })
})

describe("Vault.addPasskey", () => {
  it("adds a passkey wayin, sealed from the proving that opened, which the passkey then opens; the passphrase wayin stays as stored", async () => {
    const { vault, demandStored, opts: { world } } = await makeBornVault()
    const ante = demandStored().gate
    await vault.addPasskey({ passphrase: Passphrase, passkeyAnswer: await TH.passkeyOf('laptop') })
    const post = demandStored().gate
    expect(post.passphrase_wayin).to.deep.equal(ante.passphrase_wayin)
    const { credential_id } = await TH.passkeyOf('laptop')
    expect(post.passkey_wayin?.credential_id).to.eq(credential_id)
    const proving = await vault.gate.attemptProof(await byPasskey('laptop'), world)
    const lease = await proving.makeLease(vault, vault.leaseDBFriend(), { leaseMillis: LeaseMillis })
    expect(await roundTrip(vault.demandLease(), lease)).to.eq('sk-test')
    lease.evict()
  })

  it("asks through an 'add_passkey' gating when handed no cleartexts, and adds the passkey the user touches", async () => {
    const { vault, demandStored, requestCleartext } = await makeBornVault()
    await vault.addPasskey()
    expect(requestCleartext.mock.calls.map(([gating]) => gating.gatingkind)).to.deep.equal(['add_passkey'])
    const { credential_id } = await TH.passkeyOf('laptop')
    expect(demandStored().gate.passkey_wayin?.credential_id).to.eq(credential_id)
  })

  it("refuses 'bad_option' on a vault that has a passkey, spending the answer handed in; handed none, it asks nothing", async () => {
    const { vault, requestCleartext } = await makeBornVaultWithPasskey()
    const passkeyAnswer = await TH.passkeyOf('phone')
    await TH.expectRefusal(vault.addPasskey({ passphrase: Passphrase, passkeyAnswer }), 'bad_option')
    expect(isZeroed(passkeyAnswer.prfBytes)).to.be.true
    await TH.expectRefusal(vault.addPasskey(), 'bad_option')
    expect(requestCleartext).not.toHaveBeenCalled()
  })

  it("refuses a wrong current passphrase 'wrong_passphrase', storing nothing and leaving the answer unspent, so the same passkey is added once the passphrase is right (G2)", async () => {
    const { vault, storedNow, demandStored } = await makeBornVault()
    const ante = storedNow()
    const passkeyAnswer = await TH.passkeyOf('laptop')
    await TH.expectRefusal(vault.addPasskey({ passphrase: 'not the passphrase', passkeyAnswer }), 'wrong_passphrase')
    expect(isZeroed(passkeyAnswer.prfBytes)).to.be.false
    expect(storedNow()).to.equal(ante)
    await vault.addPasskey({ passphrase: Passphrase, passkeyAnswer })
    expect(demandStored().gate.passkey_wayin?.credential_id).to.eq(passkeyAnswer.credential_id)
    expect(isZeroed(passkeyAnswer.prfBytes)).to.be.true
  })

  it("zeroes the PRF bytes of cleartexts it refuses: a field beside the passphrase and the answer refuses 'bad_option', and stores nothing", async () => {
    const { vault, storedNow } = await makeBornVault()
    const ante = storedNow()
    const passkeyAnswer = await TH.passkeyOf('laptop')
    await TH.expectRefusal(vault.addPasskey({ passphrase: Passphrase, passkeyAnswer, extra: true } as never), 'bad_option')
    expect(isZeroed(passkeyAnswer.prfBytes)).to.be.true
    expect(storedNow()).to.equal(ante)
  })
})

describe("Vault.revokePasskey", () => {
  it("revokes the passkey: the gate holds none, the passkey refuses 'absent_wayin', and the passphrase still opens", async () => {
    const { vault, demandStored, opts: { world } } = await makeBornVaultWithPasskey()
    const ante = demandStored().gate
    await vault.revokePasskey(byPassphrase(Passphrase))
    expect(demandStored().gate).to.deep.equal({ passphrase_wayin: ante.passphrase_wayin, passkey_wayin: null })
    await TH.expectRefusal(vault.gate.attemptProof(await byPasskey('laptop'), world), 'absent_wayin')
    const proving = await vault.gate.attemptProof(byPassphrase(Passphrase), world)
    expect(proving.wayinkind).to.eq('passphrase')
  })

  it("asks through a 'revoke_passkey' gating when handed no cleartexts, and revokes the passkey", async () => {
    const { vault, demandStored, requestCleartext } = await makeBornVaultWithPasskey()
    await vault.revokePasskey()
    expect(requestCleartext.mock.calls.map(([gating]) => gating.gatingkind)).to.deep.equal(['revoke_passkey'])
    expect(demandStored().gate.passkey_wayin).to.be.null
  })

  it("refuses a wrong current passphrase 'wrong_passphrase', storing nothing", async () => {
    const { vault, storedNow } = await makeBornVaultWithPasskey()
    const ante = storedNow()
    await TH.expectRefusal(vault.revokePasskey(byPassphrase('not the passphrase')), 'wrong_passphrase')
    expect(storedNow()).to.equal(ante)
  })

  it("refuses 'bad_option' a proof by passkey, the one it would revoke or another, spending the answer and storing nothing: the passkey still opens", async () => {
    const { vault, storedNow, opts: { world } } = await makeBornVaultWithPasskey()
    const ante = storedNow()
    for (const tag of ['laptop', 'phone']) {
      const cleartexts = await byPasskey(tag)
      await TH.expectRefusal(vault.revokePasskey(cleartexts as never), 'bad_option')
      expect(isZeroed(cleartexts.passkeyAnswer.prfBytes)).to.be.true
    }
    expect(storedNow()).to.equal(ante)
    const proving = await vault.gate.attemptProof(await byPasskey('laptop'), world)
    expect(proving.wayinkind).to.eq('passkey')
  })

  it("refuses 'absent_wayin' on a vault without a passkey; handed no cleartexts, it asks nothing; the try form answers it as an Outcome", async () => {
    const { vault, requestCleartext } = await makeBornVault()
    await TH.expectRefusal(vault.revokePasskey(byPassphrase(Passphrase)), 'absent_wayin')
    await TH.expectBad(vault.tryRevokePasskey(), 'absent_wayin')
    expect(requestCleartext).not.toHaveBeenCalled()
  })
})

describe("The gate operations' try forms", () => {
  it("answer the vault as a good Outcome, and a refusal as a bad one", async () => {
    const { vault } = await makeBornVault()
    const passkeyAnswer = await TH.passkeyOf('laptop')
    expect(await TH.expectGood(vault.tryAddPasskey({ passphrase: Passphrase, passkeyAnswer }))).to.equal(vault)
    expect(await TH.expectGood(vault.tryReplacePassphrase({ ...Replacing }))).to.equal(vault)
    await TH.expectBad(vault.tryReplacePassphrase({ ...Replacing }), 'wrong_passphrase')
    await TH.expectBad(vault.tryReplacePassphrase({ ...(await byPasskey('laptop')), nextPassphrase: Passphrase } as never), 'bad_option')
  })
})
