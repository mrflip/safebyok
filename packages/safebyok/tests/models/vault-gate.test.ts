// @ts-nocheck -- 8c: the gate's prompts and verbs move to the Gate, and this suite re-points at them; until then it names the Vault's, and is skipped.
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-plus-operands, @typescript-eslint/no-unnecessary-type-assertion, vitest/no-disabled-tests, sonarjs/no-skipped-tests -- 8c, as above */
import { describe, expect, it, vi } from 'vitest'
import { VaultError } from '../../src/refusals/errors'
import type { Gating } from '../../src/models/gating'
import type { Gatingkind } from '../../src/shapes/shapes-enums'
import type { PrfSalt } from '../../src/shapes/shapes-core'
import { passphraseCleartext } from '../../src/shapes/shapes-gateish'
import type { VaultRecord } from '../../src/shapes/shapes-storage'
import { Promptly } from '../../src/shapes/shapes-vaultish'
import { Lease } from '../../src/models/lease'
import { PasskeyProving, PassphraseProving } from '../../src/models/proving'
import { VaultListing } from '../../src/models/vault-listing'
import { guardStrengthChecker } from '../../src/helpers/passphrase-strength'
import * as TH from '../test-helpers'
import { isZeroed } from '../test-helpers/proving-world'
import { NewPassphrase, Passphrase, addPasskeyTyping, byPassphrase, delUnlocked, makeBornVault, makeBornVaultWithPasskey, makeVaultWorld, replaceTyping, revokeTyping, hearingBadNews, storedVaultRecord, unlockTyping, useVaultWorlds, vaultRoundTrip } from '../test-helpers/vault-world'

useVaultWorlds()

describe.skip("a lease cache that refuses", () => {
  it("leaves the passphrase replaced and the vault unlocked, and reports to onBadNews", async () => {
    const onBadNews = vi.fn()
    const { fakeBank, opts, deviceDB, demandStored } = await makeBornVault()
    const vault = new VaultListing(fakeBank, hearingBadNews(opts, onBadNews)).deliverRecord(demandStored())
    await unlockTyping(vault, byPassphrase(Passphrase))
    const refusal = new VaultError('storage_unavailable', "the disk is full")
    deviceDB.tryStow.mockResolvedValueOnce(TH.bad(refusal))
    await expect(replaceTyping(vault, Passphrase, NewPassphrase)).resolves.to.eq(vault)
    expect(vault.isUnlocked).to.be.true
    expect(onBadNews.mock.calls).to.deep.equal([[refusal]])
  })
})

describe.skip("a gate changed on another device", () => {
  // The vaultKey did not change, so a lease in force stays in force.
  it("taken from a received record leaves this vault unlocked, its lease still sealing", async () => {
    const record = await storedVaultRecord()
    const { listing, putBehindOurBack } = makeVaultWorld(record)
    const vault = listing.deliverRecord(record)
    await unlockTyping(vault, byPassphrase(Passphrase))
    const other = makeVaultWorld(record, { device_tok: '00000000-0000-4000-8000-000000000002' })
    const theirs = other.listing.deliverRecord(record)
    await unlockTyping(theirs, byPassphrase(Passphrase))
    await replaceTyping(theirs, Passphrase, NewPassphrase)
    const received = putBehindOurBack(other.demandStored())
    vault.listing.deliverRecord(received)
    expect(vault.gate.pickle()).to.deep.equal(received.gate)
    expect(received.gate.passphrase_wayin).not.to.deep.equal(record.gate.passphrase_wayin)
    expect(vault.isUnlocked).to.be.true
    expect(await vaultRoundTrip(vault, vault)).to.eq('sk-test')
  })

  it("taken from a fetch leaves this vault unlocked, its lease in force", async () => {
    const { vault, demandStored } = await makeBornVaultWithPasskey()
    const other = makeVaultWorld(demandStored(), { device_tok: '00000000-0000-4000-8000-000000000002' })
    const theirs = other.listing.deliverRecord(demandStored())
    await unlockTyping(theirs, byPassphrase(Passphrase))
    await replaceTyping(vault, Passphrase, NewPassphrase)
    other.putBehindOurBack(demandStored())
    await theirs.get({ maxMillisSinceRefresh: 0 })
    expect(theirs.gate.pickle().passphrase_wayin).to.deep.equal(demandStored().gate.passphrase_wayin)
    expect(theirs.isUnlocked).to.be.true
    expect(await vaultRoundTrip(theirs, theirs)).to.eq('sk-test')
  })
})

describe.skip("a vault record stored without its gate", () => {
  it("refuses 'damaged_row' at hydrate, and writes nothing", async () => {
    const { gate: _gate, ...gateless } = await storedVaultRecord()
    const { listing, storedNow } = makeVaultWorld(gateless as VaultRecord)
    const vault = listing.deliverRecord(listing.sparseOf(gateless))
    await TH.expectRefusal(vault.hydrate(), 'damaged_row')
    expect(vault.isFull).to.be.false
    expect(storedNow()).to.equal(gateless)
  })
})

describe.skip("a passkey over a passphrase change", () => {
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
async function damagedOf(): Promise<VaultRecord> {
  const { demandStored } = await makeBornVaultWithPasskey()
  const record = demandStored()
  return { ...record, gate: { ...record.gate, passkey_wayin: { ...record.gate.passkey_wayin!, prf_salt_b64: 'short' as PrfSalt } } }
}

describe.skip("a passkey wayin stored damaged", () => {
  it("refuses 'damaged_row' at hydrate for a salt that is too short", async () => {
    const damaged = await damagedOf()
    const { listing, storedNow } = makeVaultWorld(damaged)
    const vault = listing.deliverRecord(listing.sparseOf(damaged))
    await TH.expectRefusal(vault.hydrate(), 'damaged_row')
    expect(vault.isFull).to.be.false
    expect(storedNow()).to.equal(damaged)
  })

  it("is reported as 'damaged_row' by a listing of the bank's vaults, and left out of the list", async () => {
    const damaged = await damagedOf()
    const { listing, badnews } = makeVaultWorld(damaged)
    await listing.list()
    expect(badnews.map((news) => news.refusalkind)).to.deep.equal(['damaged_row'])
    expect(listing.things).to.deep.equal([])
  })
})

type Born = Awaited<ReturnType<typeof makeBornVault>>

/** Leaves the world's dialog up until the gating concludes, and shows the gating to the test. */
function dialogOf(world: Born) {
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
function proveBy({ vault }: Born, passphrase: string) { return PassphraseProving.buildStored(vault.gate, passphraseCleartext.parse(passphrase), vault.world) }

/** Moves the row past what the attempt read, as another device does just before `verb`'s commit reaches the vaultDB. */
function movedBeforeCommit({ opts: { vaultDB }, demandStored, putBehindOurBack }: Born, verb: 'tryReplacePassphrase' | 'tryAddPasskey' | 'tryRevokePasskey') {
  const commit = vaultDB[verb].bind(vaultDB) as (record: never, opts: never) => Promise<never>
  const crossing = (record: never, opts: never) => {
    putBehindOurBack(demandStored())
    return commit(record, opts)
  }
  vi.spyOn(vaultDB, verb).mockImplementationOnce(crossing as never)
}

describe.skip("vault.replacePassphrasePrompt()", () => {
  it("replaces the passphrase wayin and keeps the passkey", async () => {
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

  it("refuses 'stale_write' a row moved since the attempt read it", async () => {
    const born = await makeBornVault()
    const { vault, demandStored } = born
    movedBeforeCommit(born, 'tryReplacePassphrase')
    await TH.expectRefusal(replaceTyping(vault, Passphrase, NewPassphrase), 'stale_write')
    expect(vault.revision_seq).to.eq(demandStored().revision_seq)
    expect(vault.isUnlocked).to.be.true
    await proveBy(born, Passphrase)
  })

  it("renews the lease under the epoch it wrote, not a newer one that arrived meanwhile", async () => {
    const born = await makeBornVault()
    const { vault, deviceDB, demandStored, putBehindOurBack, opts: { vaultDB } } = born
    const landedEpoch = demandStored().gate.gate_epoch + 1
    const commit = vaultDB.tryReplacePassphrase.bind(vaultDB)
    vi.spyOn(vaultDB, 'tryReplacePassphrase').mockImplementationOnce(async (record, opts) => {
      const answer = await commit(record, opts)
      const stored = demandStored()
      putBehindOurBack({ ...stored, gate: { ...stored.gate, gate_epoch: landedEpoch + 1 } })
      await vault.get({ maxMillisSinceRefresh: 0 })
      return answer
    })
    await replaceTyping(vault, Passphrase, NewPassphrase)
    expect(vault.gate.gate_epoch).to.eq(landedEpoch + 1)
    expect(vault.isUnlocked).to.be.true
    expect(deviceDB.cachedNow()).to.include({ gate_epoch: landedEpoch })
  })

  it("refuses a vault deleted since the last fetch, its tombstone listed before the refusal is thrown", async () => {
    const { vault, listing, demandStored, anotherSession } = await makeBornVault()
    await delUnlocked(anotherSession().deliverRecord(demandStored()))
    expect(vault.isPresent).to.be.true
    await TH.expectRefusal(replaceTyping(vault, Passphrase, NewPassphrase))
    expect(vault.isEnabled).to.be.false
    expect(listing.at(vault.scope)).to.include({ isPresent: false, vault_tok: demandStored().vault_tok, revision_seq: demandStored().revision_seq })
  })

  it("refuses a vault of another life stored since the last fetch, that life replacing the vault listed", async () => {
    const { vault, listing, restoreRow } = await makeBornVault()
    const other = { ...await storedVaultRecord(), revision_seq: 5, revision_tok: 'rev-other-5' }
    restoreRow(other)
    await TH.expectRefusal(replaceTyping(vault, Passphrase, NewPassphrase))
    expect(listing.at(vault.scope)?.vault_tok).to.eq(other.vault_tok)
  })

  it("refuses 'stale_write' when a record arrives during the proving", async () => {
    const born = await makeBornVault()
    const { vault, demandStored, putBehindOurBack, fakeBank: world } = born
    world.strengthChecker = guardStrengthChecker(async () => {
      const moved = putBehindOurBack(demandStored())
      await vault.get({ maxMillisSinceRefresh: 0 })
      expect(vault.revision_seq).to.eq(moved.revision_seq)
      return { strong: true as const }
    })
    await TH.expectRefusal(replaceTyping(vault, Passphrase, NewPassphrase), 'stale_write')
    await proveBy(born, Passphrase)
  })

  it("the try form returns the refusal", async () => {
    const born = await makeBornVault()
    born.fakeBank.requestCleartext = (gating) => { gating.dismiss() }
    await TH.expectBad(born.vault.tryReplacePassphrasePrompt(), 'dismissed')
  })
})

describe.skip("gating.attempt of another kind's cleartexts", () => {
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

describe.skip("vault.addPasskeyPrompt()", () => {
  it("adds the passkey wayin and keeps the passphrase's", async () => {
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

  it("refuses without showing a dialog when a passkey is already stored", async () => {
    const born = await makeBornVaultWithPasskey()
    const { shown } = dialogOf(born)
    await TH.expectRefusal(born.vault.addPasskeyPrompt())
    expect(shown).to.have.lengthOf(0)
  })

  it("keeps the passkey answer's PRF bytes after a wrong passphrase, and zeroes them when the gating concludes", async () => {
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

  it("zeroes a bare ArrayBuffer of PRF bytes when refusing it", async () => {
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

  it("refuses 'stale_write' a row moved since the attempt read it", async () => {
    const born = await makeBornVault()
    const { vault, demandStored } = born
    movedBeforeCommit(born, 'tryAddPasskey')
    await TH.expectRefusal(addPasskeyTyping(vault, Passphrase, 'laptop'), 'stale_write')
    expect(demandStored().gate.passkey_wayin).to.be.null
  })
})

describe.skip("vault.revokePasskeyPrompt()", () => {
  it("removes the passkey wayin and keeps the passphrase's", async () => {
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

  it("revokes a passkey that another session added since the last fetch", async () => {
    const { vault, demandStored, anotherSession, advance } = await makeBornVault()
    await addPasskeyTyping(anotherSession().deliverRecord(demandStored()), Passphrase, 'laptop')
    advance(Promptly)
    expect(vault.gate.pkWayin).to.be.null
    await revokeTyping(vault, Passphrase)
    expect(demandStored().gate.passkey_wayin).to.be.null
  })

  it("refuses 'wrong_passphrase' for a wrong passphrase, leaving the passkey wayin stored", async () => {
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

describe.skip("a gate change on other sessions", () => {
  it("leaves another session unlocked as it fetches the new gate", async () => {
    const { vault, demandStored, anotherSession } = await makeBornVault()
    const theirs = anotherSession().deliverRecord(demandStored())
    await unlockTyping(theirs, { passphraseClear: Passphrase })
    await replaceTyping(vault, Passphrase, NewPassphrase)
    await theirs.get({ maxMillisSinceRefresh: 0 })
    expect(theirs.gate.pickle()).to.deep.equal(demandStored().gate)
    expect(theirs.isUnlocked).to.be.true
  })
})

describe.skip("vault.del()", () => {
  it("demandUnlocked on a tombstoned vault says locked, and demandPresent says gone", async () => {
    const { vault, listing } = await makeBornVault()
    await vault.del(vault)
    const gone = listing.at(vault.scope)
    TH.expectSyncRefusal(() => gone?.demandUnlocked(), 'bank_locked')
    TH.expectSyncRefusal(() => gone?.demandPresent(), 'vault_gone')
  })

  it("deletes the vault and its boxes, asking nobody, and forgets the cached lease", async () => {
    const born = await makeBornVault()
    const { vault, listing, storedNow, deviceDB } = born
    const { shown } = dialogOf(born)
    const boxes = vault.boxListing
    expect(await vault.del(vault)).to.equal(vault)
    expect(shown).to.have.lengthOf(0)
    const tombstone = storedNow()
    expect(tombstone).to.include({ am: 'x' })
    expect(tombstone?.vault_tok).to.not.eq(vault.vault_tok)
    expect(vault.isLocked).to.be.true
    expect(vault.isEnabled).to.be.false
    expect(listing.at(vault.scope)).to.include({ isPresent: false, isLocked: true, vault_tok: tombstone?.vault_tok })
    await TH.eventually(() => deviceDB.cachedNow() === null)
    await TH.expectRefusal(boxes.get({ ...vault.scope, boxlabel: 'anthropic_api_key' }, { maxMillisSinceRefresh: 0 }))
  })

  it("refuses 'bank_locked' a locked vault, asking nobody and storing nothing", async () => {
    const born = await makeBornVault()
    const { vault, storedNow } = born
    const ante = storedNow()
    const { shown } = dialogOf(born)
    vault.lock()
    await TH.expectRefusal(vault.del(vault), 'bank_locked')
    expect(shown).to.have.lengthOf(0)
    expect(storedNow()).to.equal(ante)
  })

  it("refuses 'stale_write' a row moved since the del read it", async () => {
    const born = await makeBornVault()
    const { vault, demandStored, storedNow, putBehindOurBack, opts: { vaultDB } } = born
    const tryDelVault = vaultDB.tryDelVault.bind(vaultDB)
    vi.spyOn(vaultDB, 'tryDelVault').mockImplementationOnce((...args) => {
      putBehindOurBack(demandStored())
      return tryDelVault(...args)
    })
    await TH.expectRefusal(vault.del(vault), 'stale_write')
    expect(storedNow()).to.include({ am: 'a' })
    expect(vault.isPresent).to.be.true
    expect(vault.revision_seq).to.eq(demandStored().revision_seq)
  })

  it("reports a refused forget through onLifecycle and keeps the tombstone", async () => {
    const onLifecycle = vi.fn()
    const { vault, storedNow, deviceDB } = await makeBornVault({ passphraseClear: Passphrase }, { onLifecycle })
    deviceDB.forget.mockRejectedValue(new VaultError('storage_unavailable', 'the disk is full'))
    await vault.del(vault)
    expect(storedNow()).to.include({ am: 'x' })
    await TH.eventually(() => onLifecycle.mock.calls.length > 0)
    expect(onLifecycle).toHaveBeenCalledWith(expect.objectContaining({ kind: 'lease_revoke_failed', vault }))
  })

  it("refuses a vault deleted on another session", async () => {
    const { vault, demandStored, storedNow, anotherSession } = await makeBornVault()
    await delUnlocked(anotherSession().deliverRecord(demandStored()))
    const tombstone = storedNow()
    await TH.expectRefusal(vault.get({ maxMillisSinceRefresh: 0 }))
    await TH.expectRefusal(vault.del(vault))
    expect(storedNow()).to.equal(tombstone)
  })
})

describe.skip("listing.del(ante)", () => {
  it("refuses 'stale_write' for a stale record, even when the listed vault is current", async () => {
    const { vault, listing, demandStored, storedNow, putBehindOurBack } = await makeBornVault()
    const ante = vault.fullRecord
    putBehindOurBack(demandStored())
    await vault.get({ maxMillisSinceRefresh: 0 })
    await TH.expectRefusal(listing.del(ante), 'stale_write')
    expect(storedNow()).to.include({ am: 'a' })
  })

  it("refuses a record of another vault life without calling the vaultDB", async () => {
    const { vault, listing, opts: { vaultDB }, demandStored, storedNow } = await makeBornVault()
    const stale = { ...vault.fullRecord, vault_tok: 'vault-tok-of-a-life-gone' }
    const tryDelVault = vi.spyOn(vaultDB, 'tryDelVault')
    await TH.expectRefusal(listing.del(stale))
    expect(tryDelVault).not.toHaveBeenCalled()
    expect(storedNow()).to.deep.equal(demandStored())
    expect(vault.isPresent).to.be.true
  })
})

// == [From halpimonfire.test.ts]: a gate change crossed by an ending or a lock, skipped until 8c

/** The next `Lease.buildGranted` runs `crossing` once its lease is made, as a slow wrap would let it. */
function crossingGrant(crossing: () => unknown) {
  const grant = Lease.buildGranted.bind(Lease)
  vi.spyOn(Lease, 'buildGranted').mockImplementationOnce(async (...args) => {
    const lease = await grant(...args)
    await crossing()
    return lease
  })
}

describe.skip("A gate change after its record is stored", () => {
  it.each(['sweep', 'vacate'] as const)("a %s as the answer arrives refuses, though the row is stored", async (ending) => {
    const { vault, listing, demandStored, opts: { vaultDB } } = await makeBornVault()
    const commit = vaultDB.tryReplacePassphrase.bind(vaultDB)
    vi.spyOn(vaultDB, 'tryReplacePassphrase').mockImplementationOnce(async (record, opts) => {
      const answer = await commit(record, opts)
      listing[ending]()
      return answer
    })
    await TH.expectRefusal(replaceTyping(vault, Passphrase, NewPassphrase))
    expect(demandStored().gate.gate_epoch).to.eq(2)
    expect(vault.isUnlocked).to.be.false
  })

  it("stays unlocked on the new lease when lock() is called while that lease is made", async () => {
    const { vault, deviceDB } = await makeBornVault()
    deviceDB.forget.mockClear()
    crossingGrant(() => { vault.lock() })
    await expect(replaceTyping(vault, Passphrase, NewPassphrase)).resolves.to.eq(vault)
    expect(vault.isUnlocked).to.be.true
    expect(deviceDB.cachedNow()).to.not.be.null
    expect(deviceDB.forget).toHaveBeenCalledOnce()
  })
})

// == [From vault-life.test.ts]: the gate changed with a box sealed before the change, skipped until 8c

/** A vault as `born` makes it, with a box created in it, stored in the vaultDB every session and device here shares: `boxIn(vault)` fetches that box as `vault`'s world sees it. */
async function makeVaultWithBox(born: ReturnType<typeof makeBornVault> = makeBornVault()) {
  const world = await born
  const box = await new TestableBoxListing(boxWorldOf(world.vault), { ...world.opts, scope: world.vault.scope }).create(BoxDna)
  const boxIn = async (vault: Vault) => {
    const found = await new TestableBoxListing(boxWorldOf(vault), { ...world.opts, scope: vault.scope }).get(box.scope, { maxMillisSinceRefresh: 0 })
    if (found === null) { throw new Error('no box stored') }
    return found
  }
  const unsealIn = async (vault: Vault) => {
    const found = await boxIn(vault)
    return found.extractWhisper()
  }
  /** The next session on this device: a new listing over the same vaultDB and deviceDB, with the vault record stored, after its hello. */
  const openNextSession = async () => {
    const listing = world.anotherSession()
    const vault = listing.deliverRecord(world.demandStored())
    await listing.hello()
    return { listing, vault }
  }
  return { ...world, box, boxIn, unsealIn, openNextSession }
}

describe.skip("Changing the gate, with a box sealed before the change", () => {
  it("after the passphrase is replaced, only the new passphrase and the passkey unlock the next session", async () => {
    const { vault, box, unsealIn, openNextSession, deviceDB } = await makeVaultWithBox(makeBornVaultWithPasskey())
    await replaceTyping(vault, Passphrase, NewPassphrase)
    expect(vault.isUnlocked).to.be.true
    await box.put({ whisper: NewWhisper, sidecar: Sidecar })
    vault.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    const second = await openNextSession()
    await TH.expectRefusal(unlockTyping(second.vault, byPassphrase(Passphrase)), 'wrong_passphrase')
    await unlockTyping(second.vault, byPassphrase(NewPassphrase))
    expect(await unsealIn(second.vault)).to.deep.equal(NewWhisper)
    second.vault.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    const third = await openNextSession()
    await unlockTyping(third.vault, byPasskey('laptop'))
    expect(await unsealIn(third.vault)).to.deep.equal(NewWhisper)
  })

  // PasskeyAnswer @example
  it("an added passkey alone unlocks the next session and opens the box sealed before it", async () => {
    const { vault, unsealIn, openNextSession, deviceDB } = await makeVaultWithBox()
    await addPasskeyTyping(vault, Passphrase, 'laptop')
    vault.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    const { vault: again } = await openNextSession()
    await unlockTyping(again, byPasskey('laptop'))
    expect(again.isUnlocked).to.be.true
    expect(await unsealIn(again)).to.deep.equal(Whisper)
  })

  it("after the passkey is revoked, only the passphrase unlocks the next session", async () => {
    const { vault, box, unsealIn, openNextSession, deviceDB } = await makeVaultWithBox(makeBornVaultWithPasskey())
    vault.lock()
    await unlockTyping(vault, byPasskey('laptop'))
    await revokeTyping(vault, Passphrase)
    expect(vault.isUnlocked).to.be.true
    await box.put({ whisper: NewWhisper, sidecar: Sidecar })
    vault.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    const { vault: again } = await openNextSession()
    await TH.expectRefusal(unlockTyping(again, byPasskey('laptop')), 'absent_wayin')
    await unlockTyping(again, byPassphrase(Passphrase))
    expect(await unsealIn(again)).to.deep.equal(NewWhisper)
  })
})
// --

// == [From vault-lease.test.ts]: a lease renewed through a gate change, skipped until 8c

async function expectChangeUnlocked({ vault, deviceDB, demandStored }: Awaited<ReturnType<typeof makeBornVault>>, epoch0: number): Promise<void> {
  expect(demandStored().gate.gate_epoch).to.eq(epoch0 + 1)
  expect(vault.isUnlocked).to.be.true
  await TH.eventually(() => deviceDB.cachedNow() !== null)
}

describe.skip("A lease renewed through a gate change", () => {
  it("is attached under the epoch that was written, without the vault ever reporting locked", async () => {
    const { vault, deviceDB, demandStored } = await makeBornVault()
    const sealed = await vault.sealStampedString('sk-test', Stamp)
    const epoch0 = vault.gate.gate_epoch
    vault.becomeNotifiable()
    const lockings: boolean[] = []
    vault.subscribe(() => { lockings.push(vault.isLocked) })
    await replaceTyping(vault, Passphrase, NewPassphrase)
    expect(vault.isUnlocked).to.be.true
    expect(lockings).to.not.include(true)
    expect(demandStored().gate.gate_epoch).to.eq(epoch0 + 1)
    expect(deviceDB.cachedNow()).to.deep.include({ gate_epoch: epoch0 + 1 })
    expect(await vault.unsealStampedString(sealed, Stamp)).to.eq('sk-test')
  })

  it("unlocks a vault that was locked at the start, and writes the change", async () => {
    const { vault, deviceDB, demandStored } = await makeBornVault()
    const epoch0 = vault.gate.gate_epoch
    vault.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    await replaceTyping(vault, Passphrase, NewPassphrase)
    expect(vault.isUnlocked).to.be.true
    expect(demandStored().gate.gate_epoch).to.eq(epoch0 + 1)
    expect(deviceDB.cachedNow()).to.not.be.null
  })

  it("leaves the vault unlocked where a lock() came after the attempt was submitted", async () => {
    const born = await makeBornVault()
    const { vault } = born
    const epoch0 = vault.gate.gate_epoch
    const world = born.fakeBank
    const { requestCleartext: asBefore } = world
    world.requestCleartext = async (gating) => {
      const attempting = gating.attempt({ antePassphraseClear: Passphrase, nextPassphraseClear: NewPassphrase })
      vault.lock()
      await attempting
    }
    await vault.replacePassphrasePrompt()
    world.requestCleartext = asBefore
    await expectChangeUnlocked(born, epoch0)
  })

  it("leaves the vault unlocked where a lock() came as the commit was written", async () => {
    const born = await makeBornVault()
    const { vault, opts: { vaultDB } } = born
    const epoch0 = vault.gate.gate_epoch
    const commit = vaultDB.tryReplacePassphrase.bind(vaultDB)
    vi.spyOn(vaultDB, 'tryReplacePassphrase').mockImplementationOnce(async (record, opts) => {
      const written = await commit(record, opts)
      vault.lock()
      return written
    })
    await replaceTyping(vault, Passphrase, NewPassphrase)
    await expectChangeUnlocked(born, epoch0)
  })
})
// --

// == [From vault-unlock.test.ts]: the cached lease across a gate change, skipped until 8c

describe.skip("The cached lease across a gate change", () => {
  it("is forgotten, not used, when it was cached under an older gate", async () => {
    const { vault, demandStored, anotherSession, deviceDB } = await makeBornVault()
    vault.lock()
    await unlockTyping(vault, byPassphrase(Passphrase))
    const stale = deviceDB.cachedNow()
    await replaceTyping(vault, Passphrase, NewPassphrase)
    deviceDB.layCached(stale)
    const again = anotherSession().deliverRecord(demandStored())
    await TH.expectRefusal(again.ensureUnlocked(), 'dismissed')
    expect(deviceDB.cachedNow()).to.be.null
    await unlockTyping(again, byPassphrase(NewPassphrase))
    expect(again.isUnlocked).to.be.true
  })

  it("is not used when another device cached it before the gate changed", async () => {
    const { vault, demandStored } = await makeBornVaultWithPasskey()
    const other = makeVaultWorld(demandStored(), { device_tok: '00000000-0000-4000-8000-000000000002' })
    const theirs = other.listing.deliverRecord(other.demandStored())
    await unlockTyping(theirs, byPasskey('laptop'))
    await revokeTyping(vault, Passphrase)
    other.putBehindOurBack(demandStored())
    const again = other.anotherSession().deliverRecord(other.demandStored())
    expect(other.deviceDB.cachedNow()).not.to.be.null
    await TH.expectRefusal(again.ensureUnlocked(), 'dismissed')
    expect(again.gate.pkWayin).to.be.null
    expect(other.deviceDB.cachedNow()).to.be.null
  })
})
// --

// == [From vault-listing.test.ts]: the listing's gate verbs, and building a vault by its gate, skipped until 8c

/** Past the forget each end state sets going. */
function listingForgotten() { return new Promise((yes) => { setTimeout(yes, 0) }) }

/** A born vault deleted, past its forget, and its tombstone as stored. */
async function listingDeleted() {
  const world = await makeBornVault()
  await world.vault.del(world.vault)
  await listingForgotten()
  return { ...world, tombstone: SX.vaultTombstone.parse(world.storedNow()) }
}

describe.skip("the listing's gate methods", () => {
  const MovedDevice = '00000000-0000-4000-8000-0000000000d2'

  it("replacePassphrase sends the next revision with the new wayin and the epoch one up", async () => {
    const { listing, vault, opts: { vaultDB } } = await makeBornVault()
    const ante = vault.fullRecord
    const passphrase_wayin = { ...ante.gate.passphrase_wayin, device_tok: MovedDevice }
    const replacing = vi.spyOn(vaultDB, 'tryReplacePassphrase')
    const stored = await listing.replacePassphrase(ante, passphrase_wayin)
    const [record, opts] = replacing.mock.calls[0]!
    expect(record).to.deep.include({ registered_at: ante.registered_at, revision_seq: ante.revision_seq + 1, written_at: nowMillis(), gate: { ...ante.gate, gate_epoch: ante.gate.gate_epoch + 1, passphrase_wayin } })
    expect(record.revision_tok).to.not.eq(ante.revision_tok)
    expect(opts).to.deep.equal({ prior: SX.revisionOf(ante) })
    expect(stored).to.deep.equal(record)
  })

  it("addPasskey sends the next revision with the passkey and the epoch one up", async () => {
    const { listing, vault, opts: { vaultDB } } = await makeBornVault()
    const ante = vault.fullRecord
    const adding = vi.spyOn(vaultDB, 'tryAddPasskey')
    const stored = await listing.addPasskey(ante, TH.passkeyWayin)
    const [record, opts] = adding.mock.calls[0]!
    expect(record).to.deep.include({ revision_seq: ante.revision_seq + 1, written_at: nowMillis(), gate: { ...ante.gate, gate_epoch: ante.gate.gate_epoch + 1, passkey_wayin: TH.passkeyWayin } })
    expect(opts).to.deep.equal({ prior: SX.revisionOf(ante) })
    expect(stored).to.deep.equal(record)
  })

  it("revokePasskey sends the next revision with no passkey and the epoch one up", async () => {
    const { listing, vault, opts: { vaultDB } } = await makeBornVaultWithPasskey()
    const ante = vault.fullRecord
    const revoking = vi.spyOn(vaultDB, 'tryRevokePasskey')
    const stored = await listing.revokePasskey(ante)
    const [record, opts] = revoking.mock.calls[0]!
    expect(record).to.deep.include({ revision_seq: ante.revision_seq + 1, written_at: nowMillis(), gate: { ...ante.gate, gate_epoch: ante.gate.gate_epoch + 1, passkey_wayin: null } })
    expect(opts).to.deep.equal({ prior: SX.revisionOf(ante) })
    expect(stored).to.deep.equal(record)
  })

  it("revokePasskey with no passkey stored returns the stored record", async () => {
    const { listing, vault } = await makeBornVault()
    const ante = vault.fullRecord
    expect(await listing.revokePasskey(ante)).to.deep.equal(ante)
    expect(vault.revision_seq).to.eq(ante.revision_seq)
  })

  it("refuses an answer that is not the record it sent", async () => {
    const { listing, vault, opts: { vaultDB } } = await makeBornVault()
    const commit = vaultDB.tryAddPasskey.bind(vaultDB)
    vi.spyOn(vaultDB, 'tryAddPasskey').mockImplementationOnce(async (record, opts) => {
      const answer = await commit(record, opts)
      return answer.ok ? { ...answer, val: { ...answer.val, revision_tok: 'rev-of-another' } } : answer
    })
    await TH.expectRefusal(listing.addPasskey(vault.fullRecord, TH.passkeyWayin), 'storage_issue')
  })

  it("refuses a record of another user", async () => {
    const { listing, vault } = await makeBornVault()
    await TH.expectRefusal(listing.replacePassphrase({ ...vault.fullRecord, user_id: 'someone_else' }, vault.fullRecord.gate.passphrase_wayin))
  })
})

describe.skip("the gate methods return the vaultDB's answer", () => {
  it("tryRevokePasskey returns the act, with the written record as its val", async () => {
    const { vault, listing, demandStored } = await makeBornVault()
    const ante = demandStored()
    const answer = await listing.tryRevokePasskey(SX.vaultRecord.parse(ante))
    expect(answer.ok).to.be.true
    expect(answer.act).to.be.a('string')
    expect(answer.val).to.deep.include({ vault_tok: vault.vault_tok })
  })

  it("returns a bad answer on a disabled listing, asking storage nothing", async () => {
    const { listing, demandStored, opts } = await makeBornVault()
    const tryRevokePasskey = vi.spyOn(opts.vaultDB, 'tryRevokePasskey')
    listing.sweep()
    const answer = await listing.tryRevokePasskey(SX.vaultRecord.parse(demandStored()))
    expect(answer.err?.refusalkind).to.eq('disabled')
    expect(tryRevokePasskey).not.toHaveBeenCalled()
  })
})

describe.skip("building a vault by its gate", () => {
  it("listing.buildVault replaces the tombstone at the next revision, unlocked under a new vault_tok", async () => {
    const { vault, listing, storedNow } = await listingDeleted()
    const reborn = await buildTyping(listing, Dna, byPassphrase(Passphrase))
    expect(reborn).to.not.eq(vault)
    expect(reborn.vault_tok).to.not.eq(vault.vault_tok)
    expect(reborn.revision_seq).to.eq(2)
    expect(reborn.isLocked).to.be.false
    expect(listing.at(Dna)).to.eq(reborn)
    expect(vault.isEnabled).to.be.false
    expect(storedNow()).to.include({ am: 'a', vault_tok: reborn.vault_tok, revision_seq: 2 })
  })

  it("listing.buildVault refuses a vault present at its scope, the dialog not shown", async () => {
    const { listing, fakeBank } = await makeBornVault()
    const dialog = vi.fn()
    fakeBank.requestCleartext = dialog
    await TH.expectRefusal(listing.buildVault(Dna))
    expect(dialog).not.toHaveBeenCalled()
  })

  it("Vault.launchBirth refuses a vault present at its scope, no gating opened and no KDF run", async () => {
    const keyDeriver = { ...TH.testDeriver }
    const deriveKeyBytes = vi.spyOn(keyDeriver, 'deriveKeyBytes')
    const { listing, fakeBank, opts, storedNow } = await makeBornVault(byPassphrase(Passphrase), { keyDeriver })
    expect(deriveKeyBytes).toHaveBeenCalled()
    deriveKeyBytes.mockClear()
    const before = storedNow()
    const dialog = vi.fn(async (gating: AnyGating) => { await gating.attempt(byPassphrase('a-new-passphrase')) })
    fakeBank.requestCleartext = dialog
    await TH.expectRefusal(Vault.launchBirth(listing, Dna, opts.bankFriend.askUser))
    expect(dialog).not.toHaveBeenCalled()
    expect(listing.world.device.openGating).to.be.null
    expect(deriveKeyBytes).not.toHaveBeenCalled()
    expect(storedNow()).to.deep.equal(before)
  })

  it("Vault.launchBirth refuses a scope of another user without showing a dialog", async () => {
    const { listing, fakeBank, opts } = makeVaultWorld()
    const dialog = vi.fn()
    fakeBank.requestCleartext = dialog
    await TH.expectRefusal(Vault.launchBirth(listing, { ...Dna, user_id: 'another_user' }, opts.bankFriend.askUser))
    expect(dialog).not.toHaveBeenCalled()
  })

  it("Vault.launchBirth refuses a malformed scope without showing a dialog", async () => {
    const { listing, fakeBank, opts } = makeVaultWorld()
    const dialog = vi.fn()
    fakeBank.requestCleartext = dialog
    await TH.expectRefusal(Vault.launchBirth(listing, null as never, opts.bankFriend.askUser))
    expect(dialog).not.toHaveBeenCalled()
  })

  it("Vault.launchBirth refuses on a swept listing without showing a dialog", async () => {
    const { listing, fakeBank, opts } = makeVaultWorld()
    const dialog = vi.fn()
    fakeBank.requestCleartext = dialog
    listing.sweep()
    await TH.expectRefusal(Vault.launchBirth(listing, Dna, opts.bankFriend.askUser))
    expect(dialog).not.toHaveBeenCalled()
  })

  it("a session that fetched only the tombstone builds over it", async () => {
    const { anotherSession, storedNow } = await listingDeleted()
    const session = anotherSession()
    expect(await session.get(Dna, { maxMillisSinceRefresh: 0, ifAbsent: 'nil' })).to.be.null
    const reborn = await buildTyping(session, Dna, byPassphrase(Passphrase))
    expect(storedNow()).to.include({ vault_tok: reborn.vault_tok, revision_seq: 2 })
  })
})
// --

// == [From proof.test.ts]: the gate changed and the vault deleted, as a device's components see it, skipped until 8c

describe.skip("the proof, through the gate's prompts", () => {
  it("replacing the passphrase: nothing locks, and from then on only the new one opens the vault", async () => {
    const { device, vault, dialog } = await buildHost()
    const deviceUi = mountComponent(device, deviceStatus)
    deviceUi.expectRenders(['ready: main unlocked'])

    dialog.typing = { antePassphraseClear: Passphrase, nextPassphraseClear: NewPassphrase }
    await vault.replacePassphrasePrompt()
    expect(dialog.shown.splice(0)).to.deep.equal(['replace_passphrase'])
    deviceUi.expectRenders(['ready: main unlocked (asking replace_passphrase)', 'ready: main unlocked (asking replace_passphrase)', 'ready: main unlocked'])
    expect(vault.isUnlocked).to.be.true

    vault.lock()
    deviceUi.expectRenders(['ready: main locked'])
    dialog.typing = [byPassphrase(Passphrase), byPassphrase(NewPassphrase)]
    await vault.ensureUnlocked()
    expect(dialog.refusals.splice(0).map(({ refusalkind }) => refusalkind)).to.deep.equal(['wrong_passphrase'])
    deviceUi.expectRenders(['ready: main locked (asking unlock_vault)', 'ready: main unlocked (asking unlock_vault)', 'ready: main unlocked'])
  })

  it("adding and revoking a passkey: the passkey opens the vault until it is revoked", async () => {
    const { device, vault, dialog } = await buildHost()
    const deviceUi = mountComponent(device, deviceStatus)
    deviceUi.expectRenders(['ready: main unlocked'])

    dialog.typing = { ...byPassphrase(Passphrase), ...await byPasskey('laptop') }
    await vault.addPasskeyPrompt()
    expect(dialog.shown.splice(0)).to.deep.equal(['add_passkey'])
    deviceUi.expectRenders(['ready: main unlocked (asking add_passkey)', 'ready: main unlocked (asking add_passkey)', 'ready: main unlocked'])
    expect(vault.gate.toJSON().passkey_wayin).not.to.be.null

    vault.lock()
    deviceUi.expectRenders(['ready: main locked'])
    dialog.typing = await byPasskey('laptop')
    await vault.ensureUnlocked()
    expect(dialog.shown.splice(0)).to.deep.equal(['unlock_vault'])
    deviceUi.expectRenders(['ready: main locked (asking unlock_vault)', 'ready: main unlocked (asking unlock_vault)', 'ready: main unlocked'])

    dialog.typing = byPassphrase(Passphrase)
    await vault.revokePasskeyPrompt()
    expect(dialog.shown.splice(0)).to.deep.equal(['revoke_passkey'])
    expect(vault.gate.toJSON().passkey_wayin).to.be.null
    deviceUi.expectRenders(['ready: main unlocked (asking revoke_passkey)', 'ready: main unlocked (asking revoke_passkey)', 'ready: main unlocked'])

    vault.lock()
    deviceUi.expectRenders(['ready: main locked'])
    dialog.typing = await byPasskey('laptop')
    await TH.expectRefusal(vault.ensureUnlocked(), 'absent_wayin')
    deviceUi.expectRenders(['ready: main locked (asking unlock_vault)', 'ready: main locked'])
    dialog.typing = byPassphrase(Passphrase)
    await vault.ensureUnlocked()
    deviceUi.expectRenders(['ready: main locked (asking unlock_vault)', 'ready: main unlocked (asking unlock_vault)', 'ready: main unlocked'])
  })

  it("a second device's changes reach this device's components through the watch", async () => {
    const { world, device, vault, dialog } = await buildHost()
    const box = await vault.putBox(ApiKey)
    await vault.beginWatch()
    const deviceUi = mountComponent(device, deviceStatus)
    const boxesUi = mountComponent(vault.boxListing, boxList)
    deviceUi.expectRenders(['ready: main unlocked'])
    boxesUi.expectRenders(['anthropic_api_key'])

    // The second device has no lease cached, so its unlock asks; it then opens the box this one sealed.
    const phone = makeDialog()
    const phoneBank = await world.bankOnAnotherDevice({ requestCleartext: phone.requestCleartext, onBadNews })
    const phoneVault = await phoneBank.ensureVault(VaultScopeGiven)
    await phoneVault.ensureUnlocked()
    expect(phone.shown.splice(0)).to.deep.equal(['unlock_vault'])
    const phoneBox = await phoneVault.getBox(ApiKey.boxlabel)
    expect(await phoneBox?.extractWhisper()).to.deep.equal(ApiKey.whisper)

    // A box it adds is enlisted in this device's list.
    await phoneVault.putBox({ ...ApiKey, boxlabel: 'openai_api_key' })
    await ticks(1)
    boxesUi.expectRenders(['anthropic_api_key, openai_api_key'])

    // A VaultDB with no watch, or a watch ended: nothing arrives until the host says hello to the vault again, on its own timer.
    vault.boxListing.goodbye()
    await phoneVault.putBox({ ...ApiKey, boxlabel: 'gemini_api_key' })
    await ticks(1)
    boxesUi.expectRenders([])
    await vault.beginWatch()
    boxesUi.expectRenders(['anthropic_api_key, openai_api_key, gemini_api_key'])

    // It replaces the passphrase: this device stays unlocked and has the new gate; a later unlock takes the new passphrase.
    phone.typing = { antePassphraseClear: Passphrase, nextPassphraseClear: NewPassphrase }
    await phoneVault.replacePassphrasePrompt()
    await ticks(1)
    deviceUi.expectRenders(['ready: main unlocked'])
    expect(vault.isUnlocked).to.be.true
    expect(vault.gate.toJSON().gate_epoch).to.eq(phoneVault.gate.toJSON().gate_epoch)
    expect(await box.extractWhisper()).to.deep.equal(ApiKey.whisper)

    vault.lock()
    deviceUi.expectRenders(['ready: main locked'])
    dialog.typing = byPassphrase(NewPassphrase)
    await vault.ensureUnlocked()
    deviceUi.expectRenders(['ready: main locked (asking unlock_vault)', 'ready: main unlocked (asking unlock_vault)', 'ready: main unlocked'])

    // It deletes the vault: this device locks, forgets its lease, and the vault leaves the list.
    await phoneVault.del(phoneVault)
    await ticks(1)
    deviceUi.expectRenders(['ready: no vaults'])
    expect(vault.isUnlocked).to.be.false
    expect(world.leaseRows()).to.have.lengthOf(0)
    await TH.expectRefusal(vault.ensureUnlocked())
  })
})
// --
