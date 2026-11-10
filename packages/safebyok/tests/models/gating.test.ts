/** A real gating, real provings, and the in-memory VaultDB and DeviceDB: `build_vault` and `unlock_vault` from the dialog's first sight of a gating to its concluding. */

import { runInNewContext } from 'node:vm'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { VaultError } from '../../src/refusals/errors'
import type { Gating } from '../../src/models/gating'
import type { Gatingkind } from '../../src/shapes/shapes-enums'
import type { AnyGating, ClearsForGatingkind, RequestCleartext } from '../../src/shapes/shapes-gateish'
import { PassphraseProving } from '../../src/models/proving'
import * as TH from '../test-helpers'
import { type VaultWorldGiven, Dna, Passphrase, makeBornVault, makeBornVaultWithPasskey, makeVaultWorld, storedVaultRecord, useVaultWorlds, vaultRoundTrip } from '../test-helpers/vault-world'

useVaultWorlds()

const passphraseClear = Passphrase
const Wrong = 'not the passphrase at all'

const strengthChecker = (passphrase: string) => (passphrase === 'weak' ? { strong: false as const, reason: "too short" } : { strong: true as const })

/** A dialog that shows each gating to the test, and stays up until it concludes. */
const makeDialog = () => {
  const shown: AnyGating[] = []
  return {
    requestCleartext: (gating: AnyGating) => {
      shown.push(gating)
      return gating.whenConcluded
    },
    /** The `nth` gating shown, once it has been. */
    gatingAt: <KindT extends Gatingkind>(nth = 0) => vi.waitFor(() => {
      const gating = shown[nth]
      if (gating === undefined) { throw new Error("no dialog shown yet") }
      return gating as unknown as Gating<KindT>
    }, { interval: 1 }),
  }
}

// Compiles only while every member of AnyGating takes the same clears: a host's dialog need not narrow to attempt.
/** A host's dialog that attempts {@link Passphrase}, never narrowing on the gating's kind. */
const unnarrowedDialog: RequestCleartext = async (gating) => { await gating.attempt({ passphraseClear }) }

/** A promise, and the function that resolves it. */
const heldOpen = () => {
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  return { held, release }
}

/** A fresh world with a dialog, nothing stored. */
const birthWorld = (worldOverrides: VaultWorldGiven = {}) => {
  const dialog = makeDialog()
  return { ...dialog, ...makeVaultWorld(null, { requestCleartext: dialog.requestCleartext, ...worldOverrides }) }
}

/** A vault born under {@link Passphrase}, locked, its cached lease forgotten, in a world with a dialog. */
const lockedVault = async (born = makeBornVault()) => {
  const world = await born
  const dialog = makeDialog()
  world.fakeBank.requestCleartext = dialog.requestCleartext
  world.vault.lock()
  await vi.waitFor(() => { expect(world.deviceDB.cachedNow()).to.be.null }, { interval: 1 })
  world.deviceDB.tryStow.mockClear()
  return { ...world, ...dialog }
}

describe("a birth through a gating", () => {
  it("shows the dialog a gating asking for the scope, and on attempt lands the vault stored, listed and unlocked", async () => {
    const { listing, gatingAt, storedNow, deviceDB } = birthWorld()
    const launched = listing.buildVault(Dna)
    const gating = await gatingAt<'build_vault'>()
    expect(gating.toJSON()).to.deep.equal({ gatingkind: 'build_vault', gatingTok: gating.gatingTok, ...Dna })
    expect(gating.isOpen).to.be.true
    expect(gating.vault).to.be.null
    expect(gating.passkeyHeader).to.be.null
    expect(storedNow()).to.be.null

    const vault = await TH.expectGood(gating.attempt({ passphraseClear }))
    expect(await launched).to.equal(vault)
    expect(gating.isOpen).to.be.false
    expect(listing.at(Dna)).to.equal(vault)
    expect(vault.isUnlocked).to.be.true
    expect(await vaultRoundTrip(vault, vault)).to.eq('sk-test')
    expect(storedNow()).to.include({ am: 'a', vault_tok: vault.vault_tok, revision_seq: 0 })
    expect(storedNow()?.gate.passkey_wayin).to.be.null
    expect(deviceDB.tryStow).toHaveBeenCalledTimes(1)
  })

  it("makes the passkey's wayin beside the passphrase's, and spends the answer", async () => {
    const { listing, gatingAt, storedNow } = birthWorld()
    const launched = listing.buildVault(Dna)
    const passkeyClear = await TH.passkeyOf('laptop')
    const gating = await gatingAt<'build_vault'>()
    await TH.expectGood(gating.attempt({ passphraseClear, passkeyClear }))
    await launched
    expect(storedNow()?.gate.passkey_wayin).to.include({ wayinkind: 'passkey', credential_id: passkeyClear.credential_id })
    expect(passkeyClear.prfBytes.every((byte) => byte === 0)).to.be.true
  })

  it("leaves the gating open on a weak passphrase, putting nothing and spending no passkey answer, and the next attempt lands", async () => {
    const { listing, gatingAt, storedNow } = birthWorld({ strengthChecker })
    const launched = listing.buildVault(Dna)
    const gating = await gatingAt<'build_vault'>()
    const passkeyClear = await TH.passkeyOf('laptop')
    await TH.expectBad(gating.attempt({ passphraseClear: 'weak', passkeyClear }), 'weak_passphrase')
    expect(gating.isOpen).to.be.true
    expect(storedNow()).to.be.null
    expect(passkeyClear.prfBytes.some((byte) => byte !== 0)).to.be.true
    await TH.expectGood(gating.attempt({ passphraseClear, passkeyClear }))
    const landed = await launched
    expect(landed.isUnlocked).to.be.true
  })

  it("answers the live check with a verdict, and nothing changes", async () => {
    const { listing, gatingAt } = birthWorld({ strengthChecker })
    void listing.tryBuildVault(Dna)
    const gating = await gatingAt<'build_vault'>()
    expect(await gating.checkStrength('weak')).to.deep.equal({ strong: false, reason: "too short" })
    expect(gating.isOpen).to.be.true
    gating.dismiss()
  })

  it("rejects, never throws, a live check of what is no passphrase", async () => {
    const { listing, gatingAt } = birthWorld({ strengthChecker })
    void listing.tryBuildVault(Dna)
    const gating = await gatingAt<'build_vault'>()
    await TH.expectRefusal(gating.checkStrength(null as never))
    gating.dismiss()
  })

  it("has nothing where the put is refused: the gating concludes the refusal, nothing stored, listed or cached", async () => {
    const { listing, opts, gatingAt, storedNow, deviceDB } = birthWorld()
    const refusal = new VaultError('storage_unavailable', "the disk is full")
    vi.spyOn(opts.vaultDB, 'tryPutVault').mockResolvedValueOnce(TH.bad(refusal) as never)
    const launched = TH.expectRefusal(listing.buildVault(Dna), 'storage_unavailable')
    const gating = await gatingAt<'build_vault'>()
    await TH.expectBad(gating.attempt({ passphraseClear }), 'storage_unavailable')
    await launched
    expect(listing.things).to.have.lengthOf(0)
    expect(storedNow()).to.be.null
    expect(deviceDB.tryStow).not.toHaveBeenCalled()
  })

  it("leaves the vault stored and listed, locked, where the lease is refused past the put, and the passphrase opens it next", async () => {
    const { listing, gatingAt, storedNow, deviceDB } = birthWorld()
    vi.spyOn(PassphraseProving.prototype, 'buildLease').mockRejectedValueOnce(new VaultError('unexpected_error', "no lease today"))
    const launched = TH.expectRefusal(listing.buildVault(Dna))
    const gating = await gatingAt<'build_vault'>()
    await TH.expectBad(gating.attempt({ passphraseClear }))
    await launched
    expect(storedNow()).to.include({ am: 'a' })
    const vault = listing.at(Dna)!
    expect(vault.isLocked).to.be.true
    expect(deviceDB.tryStow).not.toHaveBeenCalled()
    const unlocking = vault.ensureUnlocked()
    const asking = await gatingAt<'unlock_vault'>(1)
    await TH.expectGood(asking.attempt({ passphraseClear }))
    const landed = await unlocking
    expect(landed.isUnlocked).to.be.true
  })

  it("refuses gate_made_elsewhere where another's vault won the slot during the dialog, saying so, with their record kept and no lease", async () => {
    const theirs = await storedVaultRecord()
    const { listing, gatingAt, restoreRow, storedNow, deviceDB } = birthWorld()
    const launched = TH.expectRefusal(listing.buildVault(Dna), 'gate_made_elsewhere')
    const gating = await gatingAt<'build_vault'>()
    restoreRow(theirs)
    await TH.expectBad(gating.attempt({ passphraseClear }), 'gate_made_elsewhere')
    const refusal = await launched
    expect(refusal.message).to.match(/another device/)
    expect(storedNow()).to.deep.equal(theirs)
    expect(deviceDB.tryStow).not.toHaveBeenCalled()
  })

  it("refuses gate_made_elsewhere whatever passphrase either chose: the loser's is never tried against the winner's gate", async () => {
    const theirs = await storedVaultRecord('the passphrase chosen on the other device')
    const { listing, gatingAt, restoreRow } = birthWorld()
    const launched = TH.expectRefusal(listing.buildVault(Dna), 'gate_made_elsewhere')
    const gating = await gatingAt<'build_vault'>()
    restoreRow(theirs)
    await TH.expectBad(gating.attempt({ passphraseClear }), 'gate_made_elsewhere')
    await launched
  })

  it("refuses gate_made_elsewhere beside a new passkey, whose wayin is not stored", async () => {
    const theirs = await storedVaultRecord()
    const { listing, gatingAt, restoreRow, storedNow } = birthWorld()
    const launched = TH.expectRefusal(listing.buildVault(Dna), 'gate_made_elsewhere')
    const gating = await gatingAt<'build_vault'>()
    restoreRow(theirs)
    await TH.expectBad(gating.attempt({ passphraseClear, passkeyClear: await TH.passkeyOf('laptop') }), 'gate_made_elsewhere')
    await launched
    expect(storedNow()?.gate.passkey_wayin).to.equal(theirs.gate.passkey_wayin)
  })

  it("refuses gate_made_elsewhere where the winner lands while the passphrase is derived", async () => {
    const theirs = await storedVaultRecord()
    const { held, release } = heldOpen()
    const keyDeriver = Object.assign(Object.create(TH.testDeriver) as typeof TH.testDeriver, {
      deriveKeyBytes: async (...args: Parameters<typeof TH.testDeriver.deriveKeyBytes>) => {
        await held
        return TH.testDeriver.deriveKeyBytes(...args)
      },
    })
    const { listing, gatingAt, restoreRow } = birthWorld({ keyDeriver })
    const launched = TH.expectRefusal(listing.buildVault(Dna), 'gate_made_elsewhere')
    const gating = await gatingAt<'build_vault'>()
    const attempting = gating.attempt({ passphraseClear })
    restoreRow(theirs)
    release()
    await TH.expectBad(attempting, 'gate_made_elsewhere')
    await launched
  })

  it("concludes the gating on gate_made_elsewhere, which the user does not get to retry there", async () => {
    const { listing, gatingAt, restoreRow } = birthWorld()
    const launched = TH.expectRefusal(listing.buildVault(Dna), 'gate_made_elsewhere')
    const gating = await gatingAt<'build_vault'>()
    restoreRow(await storedVaultRecord())
    await TH.expectBad(gating.attempt({ passphraseClear }), 'gate_made_elsewhere')
    await launched
    await TH.expectBad(gating.attempt({ passphraseClear }), 'gating_concluded')
  })

  it("leaves the winner's vault locked and listed after gate_made_elsewhere, opening to the passphrase chosen there", async () => {
    const WinnersPassphrase = 'the passphrase chosen on the other device'
    const { listing, gatingAt, restoreRow } = birthWorld()
    const launched = TH.expectRefusal(listing.buildVault(Dna), 'gate_made_elsewhere')
    const gating = await gatingAt<'build_vault'>()
    restoreRow(await storedVaultRecord(WinnersPassphrase))
    await TH.expectBad(gating.attempt({ passphraseClear }), 'gate_made_elsewhere')
    await launched
    const vault = (await listing.fetch(Dna))!
    expect(vault.isLocked).to.be.true
    const unlocking = vault.ensureUnlocked()
    const asking = await gatingAt<'unlock_vault'>(1)
    await TH.expectGood(asking.attempt({ passphraseClear: WinnersPassphrase }))
    const unlocked = await unlocking
    expect(unlocked.isUnlocked).to.be.true
  })

  it("attaches no lease to another life that overtook the put's own answer", async () => {
    const theirs = await storedVaultRecord()
    const { listing, opts, gatingAt, restoreRow, deviceDB } = birthWorld()
    const tryPutVault = opts.vaultDB.tryPutVault.bind(opts.vaultDB)
    vi.spyOn(opts.vaultDB, 'tryPutVault').mockImplementationOnce(async (record, putOpts) => {
      const answer = await tryPutVault(record, putOpts)
      restoreRow({ ...theirs, revision_tok: 'rev-of-the-new-life', revision_seq: record.revision_seq + 2 })
      await listing.fetch(Dna)
      return answer
    })
    const launched = TH.expectRefusal(listing.buildVault(Dna), 'gate_made_elsewhere')
    const gating = await gatingAt<'build_vault'>()
    await TH.expectBad(gating.attempt({ passphraseClear }), 'gate_made_elsewhere')
    await launched
    expect(deviceDB.tryStow).not.toHaveBeenCalled()
  })

  it("refuses a vault present in the slot, showing no dialog", async () => {
    const { listing, gatingAt } = birthWorld()
    const launched = listing.buildVault(Dna)
    const gating = await gatingAt<'build_vault'>()
    await TH.expectGood(gating.attempt({ passphraseClear }))
    await launched
    await TH.expectRefusal(listing.buildVault(Dna))
    expect(listing.openGating).to.be.null
  })
})

describe("one gating open per bank", () => {
  it("refuses a second launch, with no join, and the first goes on; concluded, the next launches", async () => {
    const { listing, gatingAt } = birthWorld()
    const first = TH.expectRefusal(listing.buildVault(Dna), 'dismissed')
    const gating = await gatingAt<'build_vault'>()
    await TH.expectRefusal(listing.buildVault(Dna))
    expect(gating.isOpen).to.be.true
    gating.dismiss()
    await first
    expect(listing.openGating).to.be.null
    const again = listing.buildVault(Dna)
    const asking = await gatingAt<'build_vault'>(1)
    await TH.expectGood(asking.attempt({ passphraseClear }))
    const landed = await again
    expect(landed.isUnlocked).to.be.true
  })

  it("refuses a second ensureUnlocked while the first asks", async () => {
    const { vault, gatingAt } = await lockedVault()
    const first = TH.expectRefusal(vault.ensureUnlocked(), 'dismissed')
    const gating = await gatingAt<'unlock_vault'>()
    await TH.expectRefusal(vault.ensureUnlocked())
    gating.dismiss()
    await first
  })
})

describe("the dialog ending", () => {
  it("concludes 'dismissed' on dismiss, having nothing, and whenConcluded hears it", async () => {
    const { listing, gatingAt, storedNow } = birthWorld()
    const launched = TH.expectRefusal(listing.buildVault(Dna), 'dismissed')
    const gating = await gatingAt<'build_vault'>()
    gating.dismiss()
    await launched
    await TH.expectBad(gating.whenConcluded, 'dismissed')
    expect(gating.isOpen).to.be.false
    expect(listing.things).to.have.lengthOf(0)
    expect(storedNow()).to.be.null
  })

  it("concludes 'dismissed' where requestCleartext returns with no attempt under way", async () => {
    const { listing } = makeVaultWorld(null, { requestCleartext: () => undefined })
    await TH.expectRefusal(listing.buildVault(Dna), 'dismissed')
  })

  it("concludes a sanitized refusal where requestCleartext throws: what it threw is not kept", async () => {
    const { listing } = makeVaultWorld(null, { requestCleartext: () => { throw new Error(Passphrase) } })
    const err = await TH.expectRefusal(listing.buildVault(Dna))
    expect(err.message).to.not.include(Passphrase)
    expect(err.cause).to.be.undefined
  })
})

describe("gating.attempt", () => {
  it("takes any kind's clears from a host's dialog that never narrows on the gating's kind", async () => {
    expectTypeOf<AnyGating['attempt']>().parameter(0).toEqualTypeOf<ClearsForGatingkind[Gatingkind]>()
    const { listing } = birthWorld({ requestCleartext: unnarrowedDialog })
    const landed = await listing.buildVault(Dna)
    expect(landed.isUnlocked).to.be.true
  })

  it("refuses another kind's clears, concluding the gating, putting nothing, and the refusal has no passphrase", async () => {
    const { listing, gatingAt, storedNow } = birthWorld()
    const launched = TH.expectRefusal(listing.buildVault(Dna))
    const gating = await gatingAt<'build_vault'>()
    const err = await TH.expectBad(gating.attempt({ antePassphraseClear: Passphrase, nextPassphraseClear: Passphrase }))
    await launched
    expect(gating.isOpen).to.be.false
    expect(storedNow()).to.be.null
    expect(TH.thrownText(err)).to.not.include(Passphrase)
  })

  it("refuses a second while one runs, spending what it was handed, and the first goes on", async () => {
    const { listing, gatingAt } = birthWorld()
    const launched = listing.buildVault(Dna)
    const gating = await gatingAt<'build_vault'>()
    const attempting = gating.attempt({ passphraseClear })
    const passkeyClear = await TH.passkeyOf('laptop')
    await TH.expectBad(gating.attempt({ passphraseClear, passkeyClear }))
    expect(passkeyClear.prfBytes.every((byte) => byte === 0)).to.be.true
    await TH.expectGood(attempting)
    const landed = await launched
    expect(landed.isUnlocked).to.be.true
  })

  it("refuses once concluded, spending what it was handed", async () => {
    const { listing, gatingAt } = birthWorld()
    const launched = TH.expectRefusal(listing.buildVault(Dna), 'dismissed')
    const gating = await gatingAt<'build_vault'>()
    gating.dismiss()
    await launched
    const passkeyClear = await TH.passkeyOf('laptop')
    await TH.expectBad(gating.attempt({ passphraseClear, passkeyClear }))
    expect(passkeyClear.prfBytes.every((byte) => byte === 0)).to.be.true
  })

  it("concludes a malformed attempt, spends what came with it, and the refusal has no passphrase", async () => {
    const { listing, gatingAt, storedNow } = birthWorld()
    const launched = TH.expectRefusal(listing.buildVault(Dna))
    const gating = await gatingAt<'build_vault'>()
    const passkeyClear = await TH.passkeyOf('laptop')
    const err = await TH.expectBad(gating.attempt({ passphraseClear, passkeyClear, stray: Passphrase } as never))
    await launched
    expect(err.message).to.not.include(Passphrase)
    expect(JSON.stringify(err)).to.not.include(Passphrase)
    expect(gating.isOpen).to.be.false
    expect(passkeyClear.prfBytes.every((byte) => byte === 0)).to.be.true
    expect(storedNow()).to.be.null
  })

  it("spends an answer from another realm, whose bytes are no instance of this realm's Uint8Array", async () => {
    const { listing, gatingAt } = birthWorld()
    const launched = listing.buildVault(Dna)
    const gating = await gatingAt<'build_vault'>()
    const prfBytes = runInNewContext('new Uint8Array(32).fill(7)') as Uint8Array
    expect(prfBytes).to.not.be.instanceOf(Uint8Array)
    await TH.expectGood(gating.attempt({ passphraseClear, passkeyClear: { ...await TH.passkeyOf('laptop'), prfBytes } }))
    await launched
    expect(prfBytes.every((byte) => byte === 0)).to.be.true
  })

  it("replaces what a getter on the clears throws, so the passphrase it quotes appears nowhere in the refusal", async () => {
    const { listing, gatingAt } = birthWorld()
    const launched = TH.expectRefusal(listing.buildVault(Dna))
    const gating = await gatingAt<'build_vault'>()
    const clears = { get passphraseClear(): string { throw new Error(Passphrase) } }
    const err = await TH.expectBad(gating.attempt(clears))
    await launched
    expect(err.cause).to.be.undefined
    expect(err.message).to.not.include(Passphrase)
    expect(err.stack).to.not.include(Passphrase)
    expect(JSON.stringify(err)).to.not.include(Passphrase)
  })
})

describe("an unlock through a gating", () => {
  it("gives each gating a token of its own", async () => {
    const { vault, gatingAt } = await lockedVault()
    const first = vault.ensureUnlocked()
    const firstGating = await gatingAt<'unlock_vault'>()
    firstGating.dismiss()
    await TH.expectRefusal(first, 'dismissed')
    const second = vault.ensureUnlocked()
    const secondGating = await gatingAt<'unlock_vault'>(1)
    expect(secondGating.gatingTok).to.not.eq(firstGating.gatingTok)
    secondGating.dismiss()
    await TH.expectRefusal(second, 'dismissed')
  })

  it("asks once no lease is granted or cached; a wrong passphrase re-enters, and the right one unlocks", async () => {
    const { vault, gatingAt } = await lockedVault()
    const unlocking = vault.ensureUnlocked()
    const gating = await gatingAt<'unlock_vault'>()
    expect(gating.vault).to.equal(vault)
    expect(gating.toJSON()).to.deep.equal({ gatingkind: 'unlock_vault', gatingTok: gating.gatingTok, ...Dna })
    await TH.expectBad(gating.attempt({ passphraseClear: Wrong }), 'wrong_passphrase')
    expect(gating.isOpen).to.be.true
    expect(vault.isUnlocked).to.be.false
    expect(await TH.expectGood(gating.attempt({ passphraseClear }))).to.equal(vault)
    expect(await unlocking).to.equal(vault)
    expect(vault.isUnlocked).to.be.true
    expect(await vaultRoundTrip(vault, vault)).to.eq('sk-test')
  })

  it("takes up a cached lease, nobody asked", async () => {
    const world = await makeBornVault()
    const dialog = makeDialog()
    const session = makeVaultWorld(world.demandStored(), { requestCleartext: dialog.requestCleartext, deviceDB: world.fakeBank.deviceDB })
    const again = await session.listing.build(world.demandStored())
    await again.ensureUnlocked()
    expect(again.isUnlocked).to.be.true
    expect(session.listing.openGating).to.be.null
  })

  it("tells the dialog the gate's passkey, and opens by its answer, spent once it has", async () => {
    const { vault, gatingAt } = await lockedVault(makeBornVaultWithPasskey())
    const unlocking = vault.ensureUnlocked()
    const gating = await gatingAt<'unlock_vault'>()
    expect(gating.passkeyHeader).to.deep.include({ wayinkind: 'passkey', credential_id: vault.gate.passkey_wayin?.credential_id })
    expect(gating.passkeyHeader).to.not.have.property('vault_key_wayin_wrapped')
    const passkeyClear = await TH.passkeyOf('laptop', vault.gate.passkey_wayin?.prf_salt_b64)
    await TH.expectGood(gating.attempt({ passkeyClear }))
    await unlocking
    expect(vault.isUnlocked).to.be.true
    expect(passkeyClear.prfBytes.every((byte) => byte === 0)).to.be.true
  })

  it("concludes a passkey at a gate with no passkey wayin, spending the answer", async () => {
    const { vault, gatingAt } = await lockedVault()
    const unlocking = TH.expectRefusal(vault.ensureUnlocked(), 'absent_wayin')
    const gating = await gatingAt<'unlock_vault'>()
    const passkeyClear = await TH.passkeyOf('laptop')
    await TH.expectBad(gating.attempt({ passkeyClear }), 'absent_wayin')
    await unlocking
    expect(gating.isOpen).to.be.false
    expect(passkeyClear.prfBytes.every((byte) => byte === 0)).to.be.true
  })

  it("replaces what a getter on a passkey's answer throws, so the passphrase it quotes appears nowhere in the refusal", async () => {
    const { vault, gatingAt } = await lockedVault()
    const unlocking = TH.expectRefusal(vault.ensureUnlocked())
    const gating = await gatingAt<'unlock_vault'>()
    const passkeyClear = { ...await TH.passkeyOf('laptop'), get prfBytes(): Uint8Array { throw new Error(Passphrase) } }
    const err = await TH.expectBad(gating.attempt({ passkeyClear }))
    await unlocking
    expect(gating.isOpen).to.be.false
    expect(err.cause).to.be.undefined
    expect(err.message).to.not.include(Passphrase)
    expect(err.stack).to.not.include(Passphrase)
    expect(JSON.stringify(err)).to.not.include(Passphrase)
  })

  it("concludes a refusal where the vault was deleted behind the dialog", async () => {
    const { vault, gatingAt } = await lockedVault()
    const unlocking = TH.expectRefusal(vault.ensureUnlocked())
    const gating = await gatingAt<'unlock_vault'>()
    await vault.listing.del(vault.fullRecord)
    await TH.expectBad(gating.attempt({ passphraseClear }))
    await unlocking
    expect(vault.isUnlocked).to.be.false
  })
})

describe("what ends a gating", () => {
  it("leaves an unlock open through a lock, and the attempt after it unlocks", async () => {
    const { vault, gatingAt } = await lockedVault()
    const unlocking = vault.ensureUnlocked()
    const gating = await gatingAt<'unlock_vault'>()
    vault.lock()
    expect(gating.isOpen).to.be.true
    await TH.expectGood(gating.attempt({ passphraseClear }))
    await unlocking
    expect(vault.isUnlocked).to.be.true
  })

  it("concludes as the attempt under way answers when dismissed, a wrong passphrase getting no re-entry", async () => {
    const { vault, gatingAt } = await lockedVault()
    const unlocking = TH.expectRefusal(vault.ensureUnlocked(), 'wrong_passphrase')
    const gating = await gatingAt<'unlock_vault'>()
    const attempting = gating.attempt({ passphraseClear: Wrong })
    gating.dismiss()
    await TH.expectBad(attempting, 'wrong_passphrase')
    await unlocking
    expect(gating.isOpen).to.be.false
    expect(vault.isUnlocked).to.be.false
  })

  it("does nothing to a birth: the dialog stays up, and a lock of another vault does not conclude it", async () => {
    const { vault, fakeBank } = await makeBornVault()
    const dialog = makeDialog()
    fakeBank.requestCleartext = dialog.requestCleartext
    const launched = vault.listing.buildVault({ ...Dna, vaultlabel: 'second' })
    const gating = await dialog.gatingAt<'build_vault'>()
    vault.lock()
    expect(gating.isOpen).to.be.true
    const born = await TH.expectGood(gating.attempt({ passphraseClear }))
    expect(await launched).to.equal(born)
    expect(born.isUnlocked).to.be.true
  })

  it("concludes an open birth on a sweep: nothing outlives the listing", async () => {
    const { listing, gatingAt } = birthWorld()
    const launched = TH.expectRefusal(listing.buildVault(Dna))
    const gating = await gatingAt<'build_vault'>()
    listing.sweep()
    await launched
    expect(gating.isOpen).to.be.false
  })

  it("concludes an open unlock where the vault alone is vacated", async () => {
    const { vault, gatingAt } = await lockedVault()
    const unlocking = TH.expectRefusal(vault.ensureUnlocked())
    await gatingAt<'unlock_vault'>()
    vault.vacate()
    await unlocking
  })
})

describe("a dismiss crossing an attempt", () => {
  it("aborts nothing: the attempt runs on and its landing concludes the gating", async () => {
    const { vault, gatingAt } = await lockedVault()
    const unlocking = vault.ensureUnlocked()
    const gating = await gatingAt<'unlock_vault'>()
    const attempting = gating.attempt({ passphraseClear })
    gating.dismiss()
    expect(gating.isOpen).to.be.true
    await TH.expectGood(attempting)
    await unlocking
    expect(vault.isUnlocked).to.be.true
  })

  it("concludes with the attempt's correctable refusal: the dialog is gone, so nothing is left to re-enter", async () => {
    const { vault, gatingAt } = await lockedVault()
    const unlocking = TH.expectRefusal(vault.ensureUnlocked(), 'wrong_passphrase')
    const gating = await gatingAt<'unlock_vault'>()
    const attempting = gating.attempt({ passphraseClear: Wrong })
    gating.dismiss()
    await TH.expectBad(attempting, 'wrong_passphrase')
    await unlocking
    expect(gating.isOpen).to.be.false
  })

  it("is the same for requestCleartext returning under an attempt", async () => {
    const { listing, fakeBank } = makeVaultWorld()
    let attempting: Promise<unknown> = Promise.resolve()
    fakeBank.requestCleartext = (gating) => { attempting = (gating as Gating<'build_vault'>).attempt({ passphraseClear }) }
    const vault = await listing.buildVault(Dna)
    await attempting
    expect(vault.isUnlocked).to.be.true
  })
})
