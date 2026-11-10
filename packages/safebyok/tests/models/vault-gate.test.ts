import { describe, expect, it, vi } from 'vitest'
import { VaultError } from '../../src/refusals/errors'
import type { Gating } from '../../src/models/gating'
import type { Gatingkind } from '../../src/shapes/shapes-enums'
import type { PrfSalt } from '../../src/shapes/shapes-core'
import { passphraseCleartext } from '../../src/shapes/shapes-gateish'
import type { VaultRecord } from '../../src/shapes/shapes-storage'
import { Promptly } from '../../src/shapes/shapes-vaultish'
import { PasskeyProving, PassphraseProving } from '../../src/models/proving'
import { VaultListing } from '../../src/models/vault-listing'
import { guardStrengthChecker } from '../../src/helpers/passphrase-strength'
import * as TH from '../test-helpers'
import { isZeroed } from '../test-helpers/proving-world'
import { NewPassphrase, Passphrase, addPasskeyTyping, byPassphrase, delTyping, makeBornVault, makeBornVaultWithPasskey, makeVaultWorld, replaceTyping, revokeTyping, hearingBadNews, storedVaultRecord, unlockTyping, useVaultWorlds, vaultRoundTrip } from '../test-helpers/vault-world'

useVaultWorlds()

describe("a lease cache that refuses", () => {
  it("leaves a passphrase replaced and the vault unlocked, telling onBadNews", async () => {
    const onBadNews = vi.fn()
    const { fakeBank, opts, deviceDB, demandStored } = await makeBornVault()
    const vault = await new VaultListing(fakeBank, hearingBadNews(opts, onBadNews)).build(demandStored())
    await unlockTyping(vault, byPassphrase(Passphrase))
    const refusal = new VaultError('storage_unavailable', "the disk is full")
    deviceDB.tryStow.mockResolvedValueOnce(TH.bad(refusal))
    await expect(replaceTyping(vault, Passphrase, NewPassphrase)).resolves.to.eq(vault)
    expect(vault.isUnlocked).to.be.true
    expect(onBadNews.mock.calls).to.deep.equal([[refusal]])
  })
})

describe("a gate changed on another device", () => {
  // The vaultKey did not change, so a lease in force stays in force.
  it("taken from a received record leaves this vault unlocked, its lease still sealing", async () => {
    const record = await storedVaultRecord()
    const { listing, putBehindOurBack } = makeVaultWorld(record)
    const vault = await listing.build(record)
    await unlockTyping(vault, byPassphrase(Passphrase))
    const other = makeVaultWorld(record, { device_id: '00000000-0000-4000-8000-000000000002' })
    const theirs = await other.listing.build(record)
    await unlockTyping(theirs, byPassphrase(Passphrase))
    await replaceTyping(theirs, Passphrase, NewPassphrase)
    const received = putBehindOurBack(other.demandStored())
    vault.receive(received)
    expect(vault.gate.pickle()).to.deep.equal(received.gate)
    expect(received.gate.passphrase_wayin).not.to.deep.equal(record.gate.passphrase_wayin)
    expect(vault.isUnlocked).to.be.true
    expect(await vaultRoundTrip(vault, vault)).to.eq('sk-test')
  })

  it("taken from a fetch leaves this vault unlocked, its lease in force", async () => {
    const { vault, demandStored } = await makeBornVaultWithPasskey()
    const other = makeVaultWorld(demandStored(), { device_id: '00000000-0000-4000-8000-000000000002' })
    const theirs = await other.listing.build(demandStored())
    await unlockTyping(theirs, byPassphrase(Passphrase))
    await replaceTyping(vault, Passphrase, NewPassphrase)
    other.putBehindOurBack(demandStored())
    await theirs.fetch()
    expect(theirs.gate.pickle().passphrase_wayin).to.deep.equal(demandStored().gate.passphrase_wayin)
    expect(theirs.isUnlocked).to.be.true
    expect(await vaultRoundTrip(theirs, theirs)).to.eq('sk-test')
  })
})

describe("a vault record stored without its gate", () => {
  it("refuses 'damaged_row' at hydrate, and writes nothing", async () => {
    const { gate: _gate, ...gateless } = await storedVaultRecord()
    const { listing, storedNow } = makeVaultWorld(gateless as VaultRecord)
    const vault = await listing.build(listing.sparseOf(gateless))
    await TH.expectRefusal(vault.hydrate(), 'damaged_row')
    expect(vault.isFull).to.be.false
    expect(storedNow()).to.equal(gateless)
  })
})

describe("a passkey over a passphrase change", () => {
  // A decision: notes/wontfix.md, 2026-11-09.
  it("keeps the passkey wayin as stored, and the passkey still opens", async () => {
    const { vault, demandStored } = await makeBornVaultWithPasskey()
    const { passkey_wayin } = demandStored().gate
    await replaceTyping(vault, Passphrase, NewPassphrase)
    expect(demandStored().gate.passkey_wayin).to.deep.equal(passkey_wayin)
    const proving = await PasskeyProving.buildStored(vault.gate, await TH.passkeyOf('laptop'))
    expect(proving.wayinkind).to.eq('passkey')
  })
})

/** A born vault's record with its passkey wayin's salt too short to be one. */
const damagedOf = async (): Promise<VaultRecord> => {
  const { demandStored } = await makeBornVaultWithPasskey()
  const record = demandStored()
  return { ...record, gate: { ...record.gate, passkey_wayin: { ...record.gate.passkey_wayin!, prf_salt_b64: 'short' as PrfSalt } } }
}

describe("a passkey wayin stored damaged", () => {
  it("refuses 'damaged_row' at hydrate, a salt too short to be one failing the row's check, and writes nothing", async () => {
    const damaged = await damagedOf()
    const { listing, storedNow } = makeVaultWorld(damaged)
    const vault = await listing.build(listing.sparseOf(damaged))
    await TH.expectRefusal(vault.hydrate(), 'damaged_row')
    expect(vault.isFull).to.be.false
    expect(storedNow()).to.equal(damaged)
  })

  it("is told as 'damaged_row' from a listing of the bank's vaults, and listed no more", async () => {
    const damaged = await damagedOf()
    const { listing, badnews } = makeVaultWorld(damaged)
    await listing.list()
    expect(badnews.map((news) => news.refusalkind)).to.deep.equal(['damaged_row'])
    expect(listing.things).to.deep.equal([])
  })
})

type Born = Awaited<ReturnType<typeof makeBornVault>>

/** Leaves the world's dialog up until the gating concludes, and shows the gating to the test. */
const dialogOf = (world: Born) => {
  const shown: unknown[] = []
  world.fakeBank.requestCleartext = (gating) => {
    shown.push(gating)
    return gating.whenConcluded
  }
  return {
    shown,
    gatingAt: <KindT extends Gatingkind>() => vi.waitFor(() => {
      if (shown.length === 0) { throw new Error("no dialog shown yet") }
      return shown[0] as Gating<KindT>
    }, { interval: 1 }),
  }
}

/** The proving of the gate the vault has that `passphrase` opens, refusing 'wrong_passphrase' otherwise. */
const proveBy = ({ vault }: Born, passphrase: string) => PassphraseProving.buildStored(vault.gate, passphraseCleartext.parse(passphrase), vault.world)

/** Moves the row past what the attempt read, as another device does just before `verb`'s commit reaches the vaultDB. */
const movedBeforeCommit = ({ opts: { vaultDB }, demandStored, putBehindOurBack }: Born, verb: 'tryReplacePassphrase' | 'tryAddPasskey' | 'tryRevokePasskey') => {
  const commit = vaultDB[verb].bind(vaultDB) as (record: never, opts: never) => Promise<never>
  const crossing = (record: never, opts: never) => {
    putBehindOurBack(demandStored())
    return commit(record, opts)
  }
  vi.spyOn(vaultDB, verb).mockImplementationOnce(crossing as never)
}

describe("vault.replacePassphrasePrompt()", () => {
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

  it("leaves the dialog open on a wrong ante, a weak next or the same passphrase, putting nothing, and the next attempt lands", async () => {
    const born = await makeBornVault()
    const { vault, storedNow, fakeBank: world } = born
    world.strengthChecker = guardStrengthChecker((passphrase: string) => (passphrase === 'weak' ? { strong: false as const, reason: "too short" } : { strong: true as const }))
    const ante = storedNow()
    const { gatingAt } = dialogOf(born)
    const replacing = vault.replacePassphrasePrompt()
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

  it("unlocks with a change attempted after a lock", async () => {
    const born = await makeBornVault()
    const { vault, storedNow } = born
    const ante = storedNow()
    const { gatingAt } = dialogOf(born)
    const replacing = vault.replacePassphrasePrompt()
    const gating = await gatingAt<'replace_passphrase'>()
    vault.lock()
    expect(gating.isOpen).to.be.true
    await TH.expectGood(gating.attempt({ antePassphraseClear: Passphrase, nextPassphraseClear: NewPassphrase }))
    await replacing
    expect(storedNow()).to.not.equal(ante)
    expect(vault.isUnlocked).to.be.true
  })

  it("refuses 'stale_write' a row moved since the attempt read it, overwriting nothing, the vault adopting the row stored and staying unlocked", async () => {
    const born = await makeBornVault()
    const { vault, demandStored } = born
    movedBeforeCommit(born, 'tryReplacePassphrase')
    await TH.expectRefusal(replaceTyping(vault, Passphrase, NewPassphrase), 'stale_write')
    expect(vault.revision_seq).to.eq(demandStored().revision_seq)
    expect(vault.isUnlocked).to.be.true
    await proveBy(born, Passphrase)
  })

  it("renews the lease under the epoch it wrote, not a newer one delivered before its answer, so the next session asks a proof", async () => {
    const born = await makeBornVault()
    const { vault, deviceDB, demandStored, putBehindOurBack, opts: { vaultDB } } = born
    const landedEpoch = demandStored().gate.gate_epoch + 1
    const commit = vaultDB.tryReplacePassphrase.bind(vaultDB)
    vi.spyOn(vaultDB, 'tryReplacePassphrase').mockImplementationOnce(async (record, opts) => {
      const answer = await commit(record, opts)
      const stored = demandStored()
      putBehindOurBack({ ...stored, gate: { ...stored.gate, gate_epoch: landedEpoch + 1 } })
      await vault.fetch()
      return answer
    })
    await replaceTyping(vault, Passphrase, NewPassphrase)
    expect(vault.gate.gate_epoch).to.eq(landedEpoch + 1)
    expect(vault.isUnlocked).to.be.true
    expect(deviceDB.cachedNow()).to.include({ gate_epoch: landedEpoch })
  })

  it("refuses a vault deleted since the last fetch, the vault tombstoned before the refusal is thrown", async () => {
    const { vault, demandStored, anotherSession } = await makeBornVault()
    await delTyping(await anotherSession().build(demandStored()))
    expect(vault.isPresent).to.be.true
    await TH.expectRefusal(replaceTyping(vault, Passphrase, NewPassphrase))
    expect(vault.isPresent).to.be.false
    expect(vault.revision_seq).to.eq(demandStored().revision_seq)
  })

  it("refuses a vault of another life stored since the last fetch, that life replacing the vault in its slot", async () => {
    const { vault, listing, restoreRow } = await makeBornVault()
    const other = { ...await storedVaultRecord(), revision_seq: 5, revision_tok: 'rev-other-5' }
    restoreRow(other)
    await TH.expectRefusal(replaceTyping(vault, Passphrase, NewPassphrase))
    expect(listing.at(vault.scope)?.vault_tok).to.eq(other.vault_tok)
  })

  it("spreads the record the attempt read, not the live vault: a record delivered during the proving refuses 'stale_write', overwriting nothing", async () => {
    const born = await makeBornVault()
    const { vault, demandStored, putBehindOurBack, fakeBank: world } = born
    world.strengthChecker = guardStrengthChecker(async () => {
      const moved = putBehindOurBack(demandStored())
      await vault.fetch()
      expect(vault.revision_seq).to.eq(moved.revision_seq)
      return { strong: true as const }
    })
    await TH.expectRefusal(replaceTyping(vault, Passphrase, NewPassphrase), 'stale_write')
    await proveBy(born, Passphrase)
  })

  it("the try form answers the refusal", async () => {
    const born = await makeBornVault()
    born.fakeBank.requestCleartext = (gating) => { gating.dismiss() }
    await TH.expectBad(born.vault.tryReplacePassphrasePrompt(), 'dismissed')
  })
})

describe("gating.attempt of another kind's clears", () => {
  const WrongKindCases = [
    ["replacePassphrasePrompt",  'refuses a passphrase alone where an ante and a next are asked'],
    ["addPasskeyPrompt",         'refuses a passphrase alone where a passkey is asked beside it'],
  ] as const

  for (const [prompt, blurb] of WrongKindCases) {
    it(blurb, async () => {
      const born = await makeBornVault()
      const { vault, storedNow } = born
      const ante = storedNow()
      const { gatingAt } = dialogOf(born)
      const prompting = TH.expectRefusal(vault[prompt]())
      const gating = await gatingAt()
      const err = await TH.expectBad(gating.attempt({ passphraseClear: Passphrase }))
      await prompting
      expect(gating.isOpen).to.be.false
      expect(storedNow()).to.equal(ante)
      expect(TH.thrownText(err)).to.not.include(Passphrase)
    })
  }
})

describe("vault.addPasskeyPrompt()", () => {
  it("lays the passkey's wayin and keeps the passphrase's: both open, and the passphrase's lease stays granted", async () => {
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

  it("refuses where a passkey is stored, nobody asked", async () => {
    const born = await makeBornVaultWithPasskey()
    const { shown } = dialogOf(born)
    await TH.expectRefusal(born.vault.addPasskeyPrompt())
    expect(shown).to.have.lengthOf(0)
  })

  it("leaves a wrong passphrase's answer unspent for the next attempt, and spends it as the gating concludes", async () => {
    const born = await makeBornVault()
    const { vault } = born
    const { gatingAt } = dialogOf(born)
    const adding = vault.addPasskeyPrompt()
    const gating = await gatingAt<'add_passkey'>()
    const passkeyClear = await TH.passkeyOf('laptop')
    await TH.expectBad(gating.attempt({ passphraseClear: 'not it', passkeyClear }), 'wrong_passphrase')
    expect(isZeroed(passkeyClear.prfBytes)).to.be.false
    await TH.expectGood(gating.attempt({ passphraseClear: Passphrase, passkeyClear }))
    await adding
    expect(isZeroed(passkeyClear.prfBytes)).to.be.true
  })

  it("spends a bare ArrayBuffer of PRF bytes in refusing it", async () => {
    const born = await makeBornVault()
    const { gatingAt } = dialogOf(born)
    const adding = TH.expectRefusal(born.vault.addPasskeyPrompt())
    const gating = await gatingAt<'add_passkey'>()
    const { prfBytes, ...answer } = await TH.passkeyOf('laptop')
    const { buffer } = new Uint8Array(prfBytes)
    await TH.expectBad(gating.attempt({ passphraseClear: Passphrase, passkeyClear: { ...answer, prfBytes: buffer } as never }))
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

describe("vault.revokePasskeyPrompt()", () => {
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

  it("is a no-op with no passkey stored", async () => {
    const born = await makeBornVault()
    const { storedNow, vault } = born
    const ante = storedNow()
    const { shown } = dialogOf(born)
    expect(await vault.revokePasskeyPrompt()).to.equal(vault)
    expect(shown).to.have.lengthOf(0)
    expect(storedNow()).to.equal(ante)
  })

  it("refreshes before it answers at once: a passkey added elsewhere, within the vault's horizon, is asked for and revoked", async () => {
    const { vault, demandStored, anotherSession, advance } = await makeBornVault()
    await addPasskeyTyping(await anotherSession().build(demandStored()), Passphrase, 'laptop')
    advance(Promptly)
    expect(vault.gate.pkWayin).to.be.null
    await revokeTyping(vault, Passphrase)
    expect(demandStored().gate.passkey_wayin).to.be.null
  })

  it("refuses 'wrong_passphrase' the user of a passkey who cannot prove the passphrase, the wayin left", async () => {
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
  it("locks no other device: the session with the older gate stays unlocked as it adopts the new, and its next session asks the new passphrase", async () => {
    const { vault, demandStored, anotherSession } = await makeBornVault()
    const theirs = await anotherSession().build(demandStored())
    await unlockTyping(theirs, { passphraseClear: Passphrase })
    await replaceTyping(vault, Passphrase, NewPassphrase)
    await theirs.fetch()
    expect(theirs.gate.pickle()).to.deep.equal(demandStored().gate)
    expect(theirs.isUnlocked).to.be.true
  })
})

describe("vault.delVaultPrompt()", () => {
  it("locks the vault, puts a tombstone with its boxes cascaded, forgets the row cached, and stays in its slot tombstoned", async () => {
    const { vault, listing, storedNow, deviceDB } = await makeBornVault()
    const boxes = vault.boxListing
    expect(await delTyping(vault)).to.equal(vault)
    expect(storedNow()).to.include({ am: 'x', vault_tok: vault.vault_tok })
    expect(vault.isLocked).to.be.true
    expect(vault.isPresent).to.be.false
    expect(listing.at(vault.scope)).to.equal(vault)
    await TH.eventually(() => deviceDB.cachedNow() === null)
    await TH.expectRefusal(boxes.fetch({ ...vault.scope, boxlabel: 'anthropic_api_key' }))
  })

  it("leaves the dialog open on a wrong passphrase, the vault unlocked and nothing stored", async () => {
    const born = await makeBornVault()
    const { vault, storedNow } = born
    const ante = storedNow()
    const { gatingAt } = dialogOf(born)
    const deleting = vault.delVaultPrompt()
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
    const deleting = vault.delVaultPrompt()
    const gating = await gatingAt<'del_vault'>()
    vault.lock()
    expect(gating.isOpen).to.be.true
    await TH.expectGood(gating.attempt({ passphraseClear: Passphrase }))
    await deleting
    expect(storedNow()).to.include({ am: 'x' })
  })

  it("concludes an asking on the listing's goodbye: nothing outlives the listing, a delete's dialog neither", async () => {
    const born = await makeBornVault()
    const { vault, listing, storedNow } = born
    const ante = storedNow()
    const { gatingAt } = dialogOf(born)
    const deleting = TH.expectRefusal(vault.delVaultPrompt())
    await gatingAt<'del_vault'>()
    listing.sweep()
    await deleting
    expect(storedNow()).to.equal(ante)
  })

  it("refuses 'stale_write' a row moved since the attempt read it: nothing deleted, the vault left locked and its row adopted", async () => {
    const born = await makeBornVault()
    const { vault, demandStored, storedNow, putBehindOurBack, opts: { vaultDB } } = born
    const tryDelVault = vaultDB.tryDelVault.bind(vaultDB)
    vi.spyOn(vaultDB, 'tryDelVault').mockImplementationOnce((...args) => {
      putBehindOurBack(demandStored())
      return tryDelVault(...args)
    })
    await TH.expectRefusal(delTyping(vault), 'stale_write')
    expect(storedNow()).to.include({ am: 'a' })
    expect(vault.isLocked).to.be.true
    expect(vault.isPresent).to.be.true
    expect(vault.revision_seq).to.eq(demandStored().revision_seq)
  })

  it("tells of a refused forget and lets the tombstone stand", async () => {
    const onLifecycle = vi.fn()
    const { vault, storedNow, deviceDB } = await makeBornVault({ passphraseClear: Passphrase }, { onLifecycle })
    deviceDB.forget.mockRejectedValue(new VaultError('storage_unavailable', 'the disk is full'))
    await delTyping(vault)
    expect(storedNow()).to.include({ am: 'x' })
    await TH.eventually(() => onLifecycle.mock.calls.length > 0)
    expect(onLifecycle).toHaveBeenCalledWith(expect.objectContaining({ kind: 'lease_revoke_failed', vault }))
  })

  it("refuses a vault found gone, nobody asked", async () => {
    const born = await makeBornVault()
    const { vault, demandStored, anotherSession } = born
    await delTyping(await anotherSession().build(demandStored()))
    const { shown } = dialogOf(born)
    await TH.expectRefusal(vault.fetch())
    await TH.expectRefusal(vault.delVaultPrompt())
    expect(shown).to.have.lengthOf(0)
  })
})

describe("listing.del(ante): the delete names one life at one revision", () => {
  it("goes over the revision handed, not the slot's: a stale copy of this life refuses 'stale_write'", async () => {
    const { vault, listing, demandStored, storedNow, putBehindOurBack } = await makeBornVault()
    const ante = vault.fullRecord
    putBehindOurBack(demandStored())
    await vault.fetch()
    await TH.expectRefusal(listing.del(ante), 'stale_write')
    expect(storedNow()).to.include({ am: 'a' })
  })

  it("refuses a stale instance of another life than the slot's, asking the vaultDB nothing, and the slot's vault stands", async () => {
    const { vault, listing, opts: { vaultDB }, demandStored, storedNow } = await makeBornVault()
    const stale = { ...vault.fullRecord, vault_tok: 'vault-tok-of-a-life-gone' }
    const tryDelVault = vi.spyOn(vaultDB, 'tryDelVault')
    await TH.expectRefusal(listing.del(stale))
    expect(tryDelVault).not.toHaveBeenCalled()
    expect(storedNow()).to.deep.equal(demandStored())
    expect(vault.isPresent).to.be.true
  })
})
