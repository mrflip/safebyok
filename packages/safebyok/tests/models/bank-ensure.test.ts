import { describe, expect, it } from 'vitest'
import type { AnyGating, Gating } from '../../src/models/gating'
import * as TH from '../test-helpers'
import { makeBankWorld, useBankWorlds } from '../test-helpers/bank-world'
import { isZeroed } from '../test-helpers/proving-world'
import { Dna, Passphrase, byPassphrase, declineAtOnce, storedVaultRecord, useVaultWorlds } from '../test-helpers/vault-world'

useVaultWorlds()
useBankWorlds()

describe("Bank.ensureVault: the vault the vaultDB holds, or one built and stored", () => {
  it("gets the vault the vaultDB holds, locked, asking the user nothing and storing nothing", async () => {
    const record = await storedVaultRecord()
    const { bank, requestCleartext, storedNow } = makeBankWorld(record)
    const vault = await bank.ensureVault({ vaultlabel: Dna.vaultlabel })
    expect(vault.vault_tok).to.eq(record.vault_tok)
    expect(vault.isLocked).to.be.true
    expect(requestCleartext).not.toHaveBeenCalled()
    expect(storedNow()).to.deep.equal(record)
    expect(bank.vaultOf({ vaultlabel: Dna.vaultlabel })).to.equal(vault)
  })

  it("builds and stores the vault where the vaultDB holds none, of what the user answers a 'build_vault' gating, unlocked", async () => {
    const { bank, requestCleartext, storedNow } = makeBankWorld()
    const vault = await bank.ensureVault({ vaultlabel: Dna.vaultlabel })
    expect(requestCleartext).toHaveBeenCalledOnce()
    expect(requestCleartext.mock.calls[0]?.[0]?.gatingkind).to.eq('build_vault')
    expect(storedNow()?.vault_tok).to.eq(vault.vault_tok)
    expect(vault.isUnlocked).to.be.true
  })

  it("builds of the cleartexts handed, asking the user nothing, and spends a passkey's answer among them", async () => {
    const { bank, requestCleartext, storedNow } = makeBankWorld()
    const passkeyAnswer = await TH.passkeyOf('laptop')
    const vault = await bank.ensureVault({ vaultlabel: Dna.vaultlabel }, { passphrase: Passphrase, passkeyAnswer })
    expect(requestCleartext).not.toHaveBeenCalled()
    expect(storedNow()?.gate).to.deep.equal(vault.gate.pickle())
    expect(vault.gate.pkWayin).to.not.be.null
    expect(isZeroed(passkeyAnswer.prfBytes)).to.be.true
  })

  it("refuses 'declined' where the user declines the gating, storing nothing, and tryEnsureVault answers it", async () => {
    const { bank, requestCleartext, storedNow } = makeBankWorld()
    requestCleartext.mockImplementation(declineAtOnce)
    const answer = await bank.tryEnsureVault({ vaultlabel: Dna.vaultlabel })
    expect(answer.ok ? null : answer.err.refusalkind).to.eq('declined')
    expect(storedNow()).to.be.null
  })

  it("joins an ensureVault in flight for the same vaultlabel: one gating, one vault, one put", async () => {
    const { bank, requestCleartext, storedNow } = makeBankWorld()
    const [first, second] = await Promise.all([bank.ensureVault({ vaultlabel: Dna.vaultlabel }), bank.ensureVault({ vaultlabel: Dna.vaultlabel })])
    expect(second).to.equal(first)
    expect(requestCleartext).toHaveBeenCalledOnce()
    expect(storedNow()?.vault_tok).to.eq(first.vault_tok)
    expect(await bank.ensureVault({ vaultlabel: Dna.vaultlabel })).to.equal(first)
  })

  it("holds the vault another device stored while the user was answering: the put meets 'stale_write', and the bank answers theirs, locked", async () => {
    const theirs = await storedVaultRecord('another passphrase entirely')
    const { bank, requestCleartext, storeBehindOurBack, storedNow } = makeBankWorld()
    requestCleartext.mockImplementation(async (gating: AnyGating) => {
      storeBehindOurBack(theirs)
      await (gating as Gating).tryAttempt(byPassphrase(Passphrase))
    })
    const vault = await bank.ensureVault({ vaultlabel: Dna.vaultlabel })
    expect(vault.vault_tok).to.eq(theirs.vault_tok)
    expect(vault.isLocked).to.be.true
    expect(storedNow()?.vault_tok).to.eq(theirs.vault_tok)
  })

  it("refuses 'bad_scope' a bag of another user, before storage is asked", async () => {
    const { bank } = makeBankWorld()
    TH.expectSyncRefusal(() => bank.vaultScopeOf({ vaultlabel: Dna.vaultlabel, user_id: 'u2' }), 'bad_scope')
    await TH.expectRefusal(bank.ensureVault({ vaultlabel: Dna.vaultlabel, user_id: 'u2' }), 'bad_scope')
  })
})
