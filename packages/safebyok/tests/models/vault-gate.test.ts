import { describe, expect, it, vi } from 'vitest'
import { VaultError } from '../../src/errors'
import type { Gating } from '../../src/models/gating'
import type { GatingKind } from '../../src/models/models-shapes'
import { PasskeyProving, PassphraseProving } from '../../src/models/proving'
import { passphraseCleartext } from '../../src/shapes/vault'
import * as TH from '../test-helpers'
import { isZeroed } from '../test-helpers/proving-world'
import { NewPassphrase, Passphrase, addPasskeyTyping, delTyping, makeBornVault, makeBornVaultWithPasskey, replaceTyping, revokeTyping, unlockTyping, useVaultWorlds } from '../test-helpers/vault-world'

useVaultWorlds()

type Born = Awaited<ReturnType<typeof makeBornVault>>

/** Leaves the world's dialog up until the gating settles, and shows the gating to the test. */
const dialogOf = (world: Born) => {
  const shown: unknown[] = []
  world.opts.world.requestCleartext = (gating) => {
    shown.push(gating)
    return gating.whenSettled
  }
  return {
    shown,
    gatingAt: <KindT extends GatingKind>() => vi.waitFor(() => {
      if (shown.length === 0) { throw new Error("no dialog shown yet") }
      return shown[0] as Gating<KindT>
    }, { interval: 1 }),
  }
}

/** The proving of the gate the vault holds that `passphrase` opens, refusing 'wrong_passphrase' otherwise. */
const proveBy = ({ vault }: Born, passphrase: string) => PassphraseProving.buildStored(vault.gate, passphraseCleartext.parse(passphrase), vault.world)

/** Moves the row past what the attempt read, as another device does just before `verb`'s commit reaches the vaultDB. */
const movedBeforeCommit = ({ opts: { vaultDB }, demandStored, storeBehindOurBack }: Born, verb: 'tryReplacePassphrase' | 'tryAddPasskey' | 'tryRevokePasskey') => {
  const commit = vaultDB[verb].bind(vaultDB) as (params: never) => Promise<never>
  const crossing = (params: never) => {
    storeBehindOurBack(demandStored())
    return commit(params)
  }
  vi.spyOn(vaultDB, verb).mockImplementationOnce(crossing as never)
}

describe("vault.replacePassphrase()", () => {
  it("lays the next wayin and keeps the passkey: the next passphrase opens, the ante refuses 'wrong_passphrase', the passkey still opens", async () => {
    const born = await makeBornVaultWithPasskey()
    const { vault, demandStored } = born
    const { gate: anteGate, revision_seq } = demandStored()
    expect(await replaceTyping(vault, Passphrase, NewPassphrase)).to.equal(vault)
    const { gate, revision_seq: seq } = demandStored()
    expect(seq).to.eq(revision_seq + 1)
    expect(gate.gate_epoch).to.eq(anteGate.gate_epoch + 1)
    expect(gate.passkey_wayin).to.deep.equal(anteGate.passkey_wayin)
    expect(vault.gate.pickle()).to.deep.equal(gate)
    await proveBy(born, NewPassphrase)
    await TH.expectRefusal(proveBy(born, Passphrase), 'wrong_passphrase')
    await expect(PasskeyProving.buildStored(vault.gate, await TH.passkeyOf('laptop'))).resolves.to.be.instanceOf(PasskeyProving)
  })

  it("leaves the dialog open on a wrong ante, a weak next or the same passphrase, storing nothing, and the next attempt lands", async () => {
    const born = await makeBornVault()
    const { vault, storedNow, opts: { world } } = born
    world.strengthChecker = (passphrase: string) => (passphrase === 'weak' ? { strong: false as const, reason: "too short" } : { strong: true as const })
    const ante = storedNow()
    const { gatingAt } = dialogOf(born)
    const replacing = vault.replacePassphrase()
    const gating = await gatingAt<'replace_passphrase'>()
    await TH.expectBad(gating.attempt({ antePassphraseClear: 'not it', nextPassphraseClear: NewPassphrase }), 'wrong_passphrase')
    await TH.expectBad(gating.attempt({ antePassphraseClear: Passphrase, nextPassphraseClear: 'weak' }), 'weak_passphrase')
    const same = await TH.expectBad(gating.attempt({ antePassphraseClear: Passphrase, nextPassphraseClear: Passphrase }), 'same_passphrase')
    expect(TH.thrownText(same)).to.not.include(Passphrase)
    expect(storedNow()).to.equal(ante)
    expect(gating.isOpen).to.be.true
    await TH.expectGood(gating.attempt({ antePassphraseClear: Passphrase, nextPassphraseClear: NewPassphrase }))
    expect(await replacing).to.equal(vault)
    await proveBy(born, NewPassphrase)
  })

  it("refuses 'locked_while_asking' a lock before the enter key, storing nothing, and the attempt too late 'gating_landed'", async () => {
    const born = await makeBornVault()
    const { vault, storedNow } = born
    const ante = storedNow()
    const { gatingAt } = dialogOf(born)
    const replacing = TH.expectRefusal(vault.replacePassphrase(), 'locked_while_asking')
    const gating = await gatingAt<'replace_passphrase'>()
    vault.lock()
    await replacing
    await TH.expectBad(gating.attempt({ antePassphraseClear: Passphrase, nextPassphraseClear: NewPassphrase }), 'gating_landed')
    expect(storedNow()).to.equal(ante)
  })

  it("refuses 'stale_write' a row moved since the attempt read it, overwriting nothing, the vault taking in the row stored and staying unlocked", async () => {
    const born = await makeBornVault()
    const { vault, demandStored } = born
    movedBeforeCommit(born, 'tryReplacePassphrase')
    await TH.expectRefusal(replaceTyping(vault, Passphrase, NewPassphrase), 'stale_write')
    expect(vault.revision_seq).to.eq(demandStored().revision_seq)
    expect(vault.isUnlocked).to.be.true
    await proveBy(born, Passphrase)
  })

  it("renews the lease under the epoch it landed, not a newer one delivered before its answer, so the next session asks a proof", async () => {
    const born = await makeBornVault()
    const { vault, deviceDB, demandStored, storeBehindOurBack, opts: { vaultDB } } = born
    const landedEpoch = demandStored().gate.gate_epoch + 1
    const commit = vaultDB.tryReplacePassphrase.bind(vaultDB)
    vi.spyOn(vaultDB, 'tryReplacePassphrase').mockImplementationOnce(async (params) => {
      const answer = await commit(params)
      const stored = demandStored()
      storeBehindOurBack({ ...stored, gate: { ...stored.gate, gate_epoch: landedEpoch + 1 } })
      await vault.fetch()
      return answer
    })
    await replaceTyping(vault, Passphrase, NewPassphrase)
    expect(vault.gate.gate_epoch).to.eq(landedEpoch + 1)
    expect(vault.isUnlocked).to.be.true
    expect(deviceDB.cachedNow()).to.include({ gate_epoch: landedEpoch })
  })

  it("the try form answers the refusal", async () => {
    const born = await makeBornVault()
    born.opts.world.requestCleartext = (gating) => { gating.decline() }
    await TH.expectBad(born.vault.tryReplacePassphrase(), 'declined')
  })
})

describe("vault.addPasskey()", () => {
  it("lays the passkey's wayin and keeps the passphrase's: both open, and the passphrase's lease stays held", async () => {
    const born = await makeBornVault()
    const { vault, demandStored } = born
    const { gate: anteGate } = demandStored()
    expect(await addPasskeyTyping(vault, Passphrase, 'laptop')).to.equal(vault)
    const { gate } = demandStored()
    expect(gate.gate_epoch).to.eq(anteGate.gate_epoch + 1)
    expect(gate.passphrase_wayin).to.deep.equal(anteGate.passphrase_wayin)
    expect(vault.isUnlocked).to.be.true
    await proveBy(born, Passphrase)
    await expect(PasskeyProving.buildStored(vault.gate, await TH.passkeyOf('laptop'))).resolves.to.be.instanceOf(PasskeyProving)
  })

  it("refuses 'bad_option' a passkey held, nobody asked", async () => {
    const born = await makeBornVaultWithPasskey()
    const { shown } = dialogOf(born)
    await TH.expectRefusal(born.vault.addPasskey(), 'bad_option')
    expect(shown).to.have.lengthOf(0)
  })

  it("leaves a wrong passphrase's answer unspent for the next attempt, and spends it as the gating settles (G2)", async () => {
    const born = await makeBornVault()
    const { vault } = born
    const { gatingAt } = dialogOf(born)
    const adding = vault.addPasskey()
    const gating = await gatingAt<'add_passkey'>()
    const passkeyClear = await TH.passkeyOf('laptop')
    await TH.expectBad(gating.attempt({ passphraseClear: 'not it', passkeyClear }), 'wrong_passphrase')
    expect(isZeroed(passkeyClear.prfBytes)).to.be.false
    await TH.expectGood(gating.attempt({ passphraseClear: Passphrase, passkeyClear }))
    await adding
    expect(isZeroed(passkeyClear.prfBytes)).to.be.true
  })

  it("spends a bare ArrayBuffer of PRF bytes, as WebAuthn hands them, in refusing it 'bad_option' (G2)", async () => {
    const born = await makeBornVault()
    const { gatingAt } = dialogOf(born)
    const adding = TH.expectRefusal(born.vault.addPasskey(), 'bad_option')
    const gating = await gatingAt<'add_passkey'>()
    const { prfBytes, ...answer } = await TH.passkeyOf('laptop')
    const { buffer } = new Uint8Array(prfBytes)
    await TH.expectBad(gating.attempt({ passphraseClear: Passphrase, passkeyClear: { ...answer, prfBytes: buffer } as never }), 'bad_option')
    await adding
    expect(isZeroed(new Uint8Array(buffer))).to.be.true
  })

  it("refuses 'stale_write' a row moved since the attempt read it, a passkey revoked or added elsewhere never overwritten", async () => {
    const born = await makeBornVault()
    const { vault, demandStored } = born
    movedBeforeCommit(born, 'tryAddPasskey')
    await TH.expectRefusal(addPasskeyTyping(vault, Passphrase, 'laptop'), 'stale_write')
    expect(demandStored().gate.passkey_wayin).to.be.null
  })
})

describe("vault.revokePasskey()", () => {
  it("nulls the passkey's wayin and keeps the passphrase's, the vault unlocked: no key turns over", async () => {
    const { vault, demandStored } = await makeBornVaultWithPasskey()
    const { gate: anteGate } = demandStored()
    expect(await revokeTyping(vault, Passphrase)).to.equal(vault)
    const { gate } = demandStored()
    expect(gate.gate_epoch).to.eq(anteGate.gate_epoch + 1)
    expect(gate.passkey_wayin).to.be.null
    expect(gate.passphrase_wayin).to.deep.equal(anteGate.passphrase_wayin)
    expect(vault.isUnlocked).to.be.true
  })

  it("answers at once with no passkey held: nobody asked, nothing moved", async () => {
    const born = await makeBornVault()
    const { storedNow, vault } = born
    const ante = storedNow()
    const { shown } = dialogOf(born)
    expect(await vault.revokePasskey()).to.equal(vault)
    expect(shown).to.have.lengthOf(0)
    expect(storedNow()).to.equal(ante)
  })

  it("refuses 'wrong_passphrase' a passkey's holder who cannot prove the passphrase, the wayin left", async () => {
    const { vault, demandStored } = await makeBornVaultWithPasskey()
    await TH.expectRefusal(revokeTyping(vault, 'not it'), 'wrong_passphrase')
    expect(demandStored().gate.passkey_wayin).not.to.be.null
  })

  it("refuses 'stale_write' a row moved since the attempt read it", async () => {
    const born = await makeBornVaultWithPasskey()
    movedBeforeCommit(born, 'tryRevokePasskey')
    await TH.expectRefusal(revokeTyping(born.vault, Passphrase), 'stale_write')
    expect(born.demandStored().gate.passkey_wayin).not.to.be.null
  })
})

describe("a gate change on other sessions", () => {
  it("locks no other device: the session holding the older gate stays unlocked as it takes in the new, and its next session asks the new passphrase", async () => {
    const { vault, demandStored, anotherSession } = await makeBornVault()
    const theirs = await anotherSession().build(demandStored())
    await unlockTyping(theirs, { passphraseClear: Passphrase })
    await replaceTyping(vault, Passphrase, NewPassphrase)
    await theirs.fetch()
    expect(theirs.gate.pickle()).to.deep.equal(demandStored().gate)
    expect(theirs.isUnlocked).to.be.true
  })
})

describe("vault.delVault()", () => {
  it("locks the vault, stores a tombstone with its boxes cascaded, erases the row cached, and stays in its slot tombstoned", async () => {
    const { vault, listing, storedNow, deviceDB } = await makeBornVault()
    const boxes = vault.boxListing
    expect(await delTyping(vault)).to.equal(vault)
    expect(storedNow()).to.include({ am: 'x', vault_tok: vault.vault_tok })
    expect(vault.isLocked).to.be.true
    expect(vault.isPresent).to.be.false
    expect(listing.at(vault.scope)).to.equal(vault)
    await TH.eventually(() => deviceDB.cachedNow() === null)
    await TH.expectRefusal(boxes.fetch({ ...vault.scope, boxlabel: 'anthropic_api_key' }), 'disabled')
  })

  it("leaves the dialog open on a wrong passphrase, the vault unlocked and nothing stored", async () => {
    const born = await makeBornVault()
    const { vault, storedNow } = born
    const ante = storedNow()
    const { gatingAt } = dialogOf(born)
    const deleting = vault.delVault()
    const gating = await gatingAt<'del_vault'>()
    await TH.expectBad(gating.attempt({ passphraseClear: 'not it' }), 'wrong_passphrase')
    expect(gating.isOpen).to.be.true
    expect(storedNow()).to.equal(ante)
    expect(vault.isUnlocked).to.be.true
    await TH.expectGood(gating.attempt({ passphraseClear: Passphrase }))
    await deleting
    expect(storedNow()).to.include({ am: 'x' })
  })

  it("ignores a lock: a lock does not stop a delete, and the gating stays open", async () => {
    const born = await makeBornVault()
    const { vault, storedNow } = born
    const { gatingAt } = dialogOf(born)
    const deleting = vault.delVault()
    const gating = await gatingAt<'del_vault'>()
    vault.lock()
    expect(gating.isOpen).to.be.true
    await TH.expectGood(gating.attempt({ passphraseClear: Passphrase }))
    await deleting
    expect(storedNow()).to.include({ am: 'x' })
  })

  it("settles 'locked_while_asking' on the listing's goodbye: nothing outlives the listing, a delete's dialog neither", async () => {
    const born = await makeBornVault()
    const { vault, listing, storedNow } = born
    const ante = storedNow()
    const { gatingAt } = dialogOf(born)
    const deleting = TH.expectRefusal(vault.delVault(), 'locked_while_asking')
    await gatingAt<'del_vault'>()
    listing.sweep()
    await deleting
    expect(storedNow()).to.equal(ante)
  })

  it("refuses 'stale_write' a row moved since the attempt read it: nothing deleted, the vault left locked and its row taken in", async () => {
    const born = await makeBornVault()
    const { vault, demandStored, storedNow, storeBehindOurBack, opts: { vaultDB } } = born
    const tryDelVault = vaultDB.tryDelVault.bind(vaultDB)
    vi.spyOn(vaultDB, 'tryDelVault').mockImplementationOnce((...args) => {
      storeBehindOurBack(demandStored())
      return tryDelVault(...args)
    })
    await TH.expectRefusal(delTyping(vault), 'stale_write')
    expect(storedNow()).to.include({ am: 'a' })
    expect(vault.isLocked).to.be.true
    expect(vault.isPresent).to.be.true
    expect(vault.revision_seq).to.eq(demandStored().revision_seq)
  })

  it("tells of a refused erase and lets the tombstone stand", async () => {
    const onPanic = vi.fn()
    const { vault, storedNow, deviceDB } = await makeBornVault({ passphraseClear: Passphrase }, { onPanic })
    deviceDB.tryVacate.mockImplementation(() => Promise.resolve({ ok: false, err: new VaultError('storage_blocked', 'the disk is full') }))
    await delTyping(vault)
    expect(storedNow()).to.include({ am: 'x' })
    await TH.eventually(() => onPanic.mock.calls.length > 0)
  })

  it("refuses 'vault_gone' a vault found gone, nobody asked", async () => {
    const born = await makeBornVault()
    const { vault, demandStored, anotherSession } = born
    await delTyping(await anotherSession().build(demandStored()))
    const { shown } = dialogOf(born)
    await TH.expectRefusal(vault.fetch(), 'vault_gone')
    await TH.expectRefusal(vault.delVault(), 'vault_gone')
    expect(shown).to.have.lengthOf(0)
  })
})

describe("listing.del(ante): the delete names one life at one revision", () => {
  it("goes over the revision handed, not the slot's: a stale copy of this life refuses 'stale_write'", async () => {
    const { vault, listing, demandStored, storedNow, storeBehindOurBack } = await makeBornVault()
    const ante = vault.fullRecord
    storeBehindOurBack(demandStored())
    await vault.fetch()
    await TH.expectRefusal(listing.del(ante), 'stale_write')
    expect(storedNow()).to.include({ am: 'a' })
  })

  it("refuses 'stale_write' a stale instance of another life than the slot's, asking the vaultDB nothing, and the slot's vault stands", async () => {
    const { vault, listing, opts: { vaultDB }, demandStored, storedNow } = await makeBornVault()
    const stale = { ...vault.fullRecord, vault_tok: 'vault-tok-of-a-life-gone' }
    const tryDelVault = vi.spyOn(vaultDB, 'tryDelVault')
    await TH.expectRefusal(listing.del(stale), 'stale_write')
    expect(tryDelVault).not.toHaveBeenCalled()
    expect(storedNow()).to.deep.equal(demandStored())
    expect(vault.isPresent).to.be.true
  })
})
