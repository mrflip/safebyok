/** A real gating, real provings, and the in-memory BankDB and DeviceDB: `build_bank` and `unlock_bank` from the dialog's first sight of a gating to its concluding. */

import { runInNewContext } from 'node:vm'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { VaultError } from '../../src/refusals/errors'
import type { Gating } from '../../src/models/gating'
import type { Gatingkind } from '../../src/shapes/shapes-enums'
import type { AnyGating, CleartextsForGatingkind, RequestCleartext } from '../../src/shapes/shapes-gateish'
import { PassphraseProving } from '../../src/models/proving'
import * as BX from '../../src/shapes/shapes-bankdb'
import type { BankRecord, GateRecord } from '../../src/shapes/shapes-bankdb'
import * as TH from '../test-helpers'
import { type VaultWorldGiven, Dna, Passphrase, byPassphrase, delTyping, makeBornVault, makeBornVaultWithPasskey, makeVaultWorld, useVaultWorlds, vaultRoundTrip } from '../test-helpers/vault-world'

useVaultWorlds()

const passphraseClear = Passphrase
const Wrong = 'not the passphrase at all'

const strengthChecker = (passphrase: string) => (passphrase === 'weak' ? { strong: false as const, reason: "too short" } : { strong: true as const })

/** A dialog that shows each gating to the test, and stays up until it concludes. */
function makeDialog() {
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

// Compiles only while every member of AnyGating takes the same cleartexts: a host's dialog need not narrow to attempt.
/** A host's dialog that attempts {@link Passphrase}, never narrowing on the gating's kind. */
const unnarrowedDialog: RequestCleartext = async (gating) => { await gating.attempt({ passphraseClear }) }

/** A promise, and the function that resolves it. */
function heldOpen() {
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  return { held, release }
}

/** The bank's scope in these worlds. */
const BankScope = Object.freeze({ user_id: Dna.user_id, banklabel: Dna.banklabel })

/** The rows a bankDB stores for one bank: the bank row and its main gate row. */
type BankRows = Readonly<{ bank: unknown, main: unknown }>

/** A fresh world with a dialog, nothing stored, and the shelf its bankDB keeps the bank's rows on. */
function birthWorld(worldOverrides: VaultWorldGiven = {}) {
  const dialog = makeDialog()
  const world = makeVaultWorld({ requestCleartext: dialog.requestCleartext, ...worldOverrides })
  const shelf = world.bankDB._cheat_shelfOf(BankScope)
  /** The main gate row stored, if any. */
  const mainNow = () => shelf.gaterows.get('main') as GateRecord | undefined
  /** Another device's bank, laid in the bankDB behind this device's back. */
  const layRows = (rows: BankRows) => {
    shelf.bank = rows.bank
    shelf.gaterows.set('main', rows.main)
  }
  return { ...dialog, ...world, shelf, mainNow, layRows }
}

/** The rows of a bank built under `passphrase` on another device, in a world of its own. */
async function theirBankRows(passphrase: string = Passphrase): Promise<BankRows> {
  const { bankDB } = await makeBornVault(byPassphrase(passphrase))
  const shelf = bankDB._cheat_shelfOf(BankScope)
  return { bank: shelf.bank, main: shelf.gaterows.get('main') }
}

/** A bank born under {@link Passphrase} with a vault, locked, its cached lease forgotten, in a world with a dialog. */
async function lockedBank(born = makeBornVault()) {
  const world = await born
  const dialog = makeDialog()
  world.dialog.requestCleartext = dialog.requestCleartext
  world.bank.lock()
  await vi.waitFor(() => { expect(world.deviceDB.cachedNow()).to.be.null }, { interval: 1 })
  world.deviceDB.tryStow.mockClear()
  return { ...world, ...dialog }
}

describe("a birth through a gating", () => {
  it("stores and unlocks the bank on the dialog's attempt", async () => {
    const { device, gatingAt, shelf, mainNow, deviceDB } = birthWorld()
    const launched = device.ensureBank()
    const gating = await gatingAt<'build_bank'>()
    expect(gating.toJSON()).to.deep.equal({ gatingkind: 'build_bank', gatingTok: gating.gatingTok, ...BankScope })
    expect(gating.isOpen).to.be.true
    expect(gating.bank).to.be.null
    expect(gating.passkeyHeader).to.be.null
    expect(shelf.bank).to.be.null

    const bank = await TH.expectGood(gating.attempt({ passphraseClear }))
    expect(await launched).to.equal(bank)
    expect(gating.isOpen).to.be.false
    expect(device.bank).to.equal(bank)
    expect(bank.isUnlocked).to.be.true
    const vault = await bank.ensureVault({ vaultlabel: Dna.vaultlabel })
    expect(await vaultRoundTrip(vault, vault)).to.eq('sk-test')
    expect(shelf.bank).to.include({ am: 'a', bank_tok: bank.bank_tok, revision_seq: 0 })
    expect(mainNow()?.wayins.passkey0).to.be.undefined
    expect(deviceDB.tryStow).toHaveBeenCalledTimes(1)
  })

  it("adds the passkey's wayin beside the passphrase's, and zeroes the passkey answer", async () => {
    const { device, gatingAt, mainNow } = birthWorld()
    const launched = device.ensureBank()
    const passkeyClear = await TH.passkeyOf('laptop')
    const gating = await gatingAt<'build_bank'>()
    await TH.expectGood(gating.attempt({ passphraseClear, passkeyClear }))
    await launched
    expect(mainNow()?.wayins.passkey0).to.include({ wayinkind: 'passkey', credential_id: passkeyClear.credential_id })
    expect(passkeyClear.prfBytes.every((byte) => byte === 0)).to.be.true
  })

  it("stays open after a weak passphrase, and the next attempt succeeds", async () => {
    const { device, gatingAt, shelf } = birthWorld({ strengthChecker })
    const launched = device.ensureBank()
    const gating = await gatingAt<'build_bank'>()
    const passkeyClear = await TH.passkeyOf('laptop')
    await TH.expectBad(gating.attempt({ passphraseClear: 'weak', passkeyClear }), 'weak_passphrase')
    expect(gating.isOpen).to.be.true
    expect(shelf.bank).to.be.null
    expect(passkeyClear.prfBytes.some((byte) => byte !== 0)).to.be.true
    await TH.expectGood(gating.attempt({ passphraseClear, passkeyClear }))
    const landed = await launched
    expect(landed.isUnlocked).to.be.true
  })

  it("returns a verdict from the live strength check, and stays open", async () => {
    const { device, gatingAt } = birthWorld({ strengthChecker })
    void device.tryEnsureBank()
    const gating = await gatingAt<'build_bank'>()
    expect(await gating.judgeStrength('weak')).to.deep.equal({ strong: false, reason: "too short" })
    expect(gating.isOpen).to.be.true
    gating.dismiss()
  })

  it("rejects, rather than throws, a live strength check of a value that is not a string", async () => {
    const { device, gatingAt } = birthWorld({ strengthChecker })
    void device.tryEnsureBank()
    const gating = await gatingAt<'build_bank'>()
    await TH.expectRefusal(gating.judgeStrength(null as never))
    gating.dismiss()
  })

  it("concludes with the refusal when the build is refused, with nothing stored, listed or cached", async () => {
    const { device, bankDB, gatingAt, shelf, deviceDB } = birthWorld()
    const refusal = new VaultError('storage_unavailable', "the disk is full")
    vi.spyOn(bankDB, 'tryBuildBank').mockResolvedValueOnce(TH.bad(refusal) as never)
    const launched = TH.expectRefusal(device.ensureBank(), 'storage_unavailable')
    const gating = await gatingAt<'build_bank'>()
    await TH.expectBad(gating.attempt({ passphraseClear }), 'storage_unavailable')
    await launched
    expect(device.bank).to.be.null
    expect(shelf.bank).to.be.null
    expect(deviceDB.tryStow).not.toHaveBeenCalled()
  })

  it("leaves the bank stored but locked when the lease is refused after the build", async () => {
    const { device, gatingAt, shelf, deviceDB } = birthWorld()
    vi.spyOn(PassphraseProving.prototype, 'buildLease').mockRejectedValueOnce(new VaultError('unexpected_error', "no lease today"))
    const launched = TH.expectRefusal(device.ensureBank())
    const gating = await gatingAt<'build_bank'>()
    await TH.expectBad(gating.attempt({ passphraseClear }))
    await launched
    expect(shelf.bank).to.include({ am: 'a' })
    const bank = await device.ensureBank()
    expect(bank.isLocked).to.be.true
    expect(deviceDB.tryStow).not.toHaveBeenCalled()
    const unlocking = bank.ensureUnlocked()
    const asking = await gatingAt<'unlock_bank'>(1)
    await TH.expectGood(asking.attempt({ passphraseClear }))
    const landed = await unlocking
    expect(landed.isUnlocked).to.be.true
  })

  it("refuses when another device builds the bank during the dialog, and keeps that device's rows", async () => {
    const theirs = await theirBankRows()
    const { device, gatingAt, layRows, shelf, deviceDB } = birthWorld()
    const launched = TH.expectRefusal(device.ensureBank(), 'gate_made_elsewhere')
    const gating = await gatingAt<'build_bank'>()
    layRows(theirs)
    await TH.expectBad(gating.attempt({ passphraseClear }), 'gate_made_elsewhere')
    const refusal = await launched
    expect(refusal.message).to.match(/another device/)
    expect(shelf.bank).to.deep.equal(theirs.bank)
    expect(deviceDB.tryStow).not.toHaveBeenCalled()
  })

  it("refuses a bank built on another device, whatever passphrase each device chose", async () => {
    const theirs = await theirBankRows('the passphrase chosen on the other device')
    const { device, gatingAt, layRows } = birthWorld()
    const launched = TH.expectRefusal(device.ensureBank(), 'gate_made_elsewhere')
    const gating = await gatingAt<'build_bank'>()
    layRows(theirs)
    await TH.expectBad(gating.attempt({ passphraseClear }), 'gate_made_elsewhere')
    await launched
  })

  it("refuses a bank built on another device without storing the new passkey's wayin", async () => {
    const theirs = await theirBankRows()
    const { device, gatingAt, layRows, mainNow } = birthWorld()
    const launched = TH.expectRefusal(device.ensureBank(), 'gate_made_elsewhere')
    const gating = await gatingAt<'build_bank'>()
    layRows(theirs)
    await TH.expectBad(gating.attempt({ passphraseClear, passkeyClear: await TH.passkeyOf('laptop') }), 'gate_made_elsewhere')
    await launched
    expect(mainNow()).to.deep.equal(theirs.main)
  })

  it("refuses when another device builds the bank while the passphrase is derived", async () => {
    const theirs = await theirBankRows()
    const { held, release } = heldOpen()
    const keyDeriver = Object.assign(Object.create(TH.testDeriver) as typeof TH.testDeriver, {
      deriveKeyBytes: async (...args: Parameters<typeof TH.testDeriver.deriveKeyBytes>) => {
        await held
        return TH.testDeriver.deriveKeyBytes(...args)
      },
    })
    const { device, gatingAt, layRows } = birthWorld({ keyDeriver })
    const launched = TH.expectRefusal(device.ensureBank(), 'gate_made_elsewhere')
    const gating = await gatingAt<'build_bank'>()
    const attempting = gating.attempt({ passphraseClear })
    layRows(theirs)
    release()
    await TH.expectBad(attempting, 'gate_made_elsewhere')
    await launched
  })

  it("concludes the gating when another device builds the bank first", async () => {
    const { device, gatingAt, layRows } = birthWorld()
    const launched = TH.expectRefusal(device.ensureBank(), 'gate_made_elsewhere')
    const gating = await gatingAt<'build_bank'>()
    layRows(await theirBankRows())
    await TH.expectBad(gating.attempt({ passphraseClear }), 'gate_made_elsewhere')
    await launched
    await TH.expectBad(gating.attempt({ passphraseClear }), 'gating_concluded')
  })

  it("leaves a bank built on another device locked, and it unlocks with that device's passphrase", async () => {
    const WinnersPassphrase = 'the passphrase chosen on the other device'
    const { device, gatingAt, layRows } = birthWorld()
    const launched = TH.expectRefusal(device.ensureBank(), 'gate_made_elsewhere')
    const gating = await gatingAt<'build_bank'>()
    layRows(await theirBankRows(WinnersPassphrase))
    await TH.expectBad(gating.attempt({ passphraseClear }), 'gate_made_elsewhere')
    await launched
    const bank = await device.ensureBank()
    expect(bank.isLocked).to.be.true
    const unlocking = bank.ensureUnlocked()
    const asking = await gatingAt<'unlock_bank'>(1)
    await TH.expectGood(asking.attempt({ passphraseClear: WinnersPassphrase }))
    const unlocked = await unlocking
    expect(unlocked.isUnlocked).to.be.true
  })

  // The other ensureBank lists the newer life first, so the build's answer is older than the bank listed.
  it("attaches no lease when another bank life is listed before the build's answer arrives", async () => {
    const theirs = await theirBankRows()
    const { device, bankDB, gatingAt, layRows, deviceDB } = birthWorld()
    const tryBuildBank = bankDB.tryBuildBank.bind(bankDB)
    vi.spyOn(bankDB, 'tryBuildBank').mockImplementationOnce(async (ask) => {
      const answer = await tryBuildBank(ask)
      layRows({ ...theirs, bank: { ...theirs.bank as BankRecord, revision_tok: 'rev-of-the-new-life', revision_seq: ask.record.revision_seq + 2 } })
      await device.ensureBank()
      return answer
    })
    const launched = TH.expectRefusal(device.ensureBank())
    const gating = await gatingAt<'build_bank'>()
    await TH.expectBad(gating.attempt({ passphraseClear }))
    await launched
    expect(deviceDB.tryStow).not.toHaveBeenCalled()
  })
  it("answers the bank built, showing no dialog again", async () => {
    const { device, gatingAt } = birthWorld()
    const launched = device.ensureBank()
    const gating = await gatingAt<'build_bank'>()
    await TH.expectGood(gating.attempt({ passphraseClear }))
    const bank = await launched
    await expect(device.ensureBank()).resolves.to.equal(bank)
    expect(device.openGating).to.be.null
  })
})

/** An unlock no launch in these tests reaches. */
const neverUnlocks = (): Promise<never> => Promise.reject(new Error('never called'))

describe("a launcher reached through a live gating", () => {
  it("refuses what is no bank, or no bank listing, before anything is asked or attached", async () => {
    const { device, gatingAt } = birthWorld()
    const first = TH.expectRefusal(device.ensureBank(), 'dismissed')
    const gating = await gatingAt<'build_bank'>()
    const launchers = gating.constructor as typeof Gating
    await TH.expectRefusal(launchers.launchOn({} as never, 'unlock_bank', neverUnlocks, null), 'bad_option')
    await TH.expectRefusal(launchers.launchBirth({} as never, BX.shellBankOf(BankScope), neverUnlocks, null), 'bad_option')
    expect(device.openGating).to.eq(gating)
    gating.dismiss()
    await first
  })
})

describe("one gating open per device", () => {
  it("refuses a second gating while one is open", async () => {
    const { device, gatingAt } = birthWorld()
    const first = TH.expectRefusal(device.ensureBank(), 'dismissed')
    const gating = await gatingAt<'build_bank'>()
    await TH.expectRefusal(device.ensureBank())
    expect(gating.isOpen).to.be.true
    gating.dismiss()
    await first
    expect(device.openGating).to.be.null
    const again = device.ensureBank()
    const asking = await gatingAt<'build_bank'>(1)
    await TH.expectGood(asking.attempt({ passphraseClear }))
    const landed = await again
    expect(landed.isUnlocked).to.be.true
  })

  it("refuses a second ensureUnlocked while the first asks", async () => {
    const { bank, gatingAt } = await lockedBank()
    const first = TH.expectRefusal(bank.ensureUnlocked(), 'dismissed')
    const gating = await gatingAt<'unlock_bank'>()
    await TH.expectRefusal(bank.ensureUnlocked())
    gating.dismiss()
    await first
  })
})

describe("the dialog ending", () => {
  it("concludes 'dismissed' on dismiss", async () => {
    const { device, gatingAt, shelf } = birthWorld()
    const launched = TH.expectRefusal(device.ensureBank(), 'dismissed')
    const gating = await gatingAt<'build_bank'>()
    gating.dismiss()
    await launched
    await TH.expectBad(gating.whenConcluded, 'dismissed')
    expect(gating.isOpen).to.be.false
    expect(device.bank).to.be.null
    expect(shelf.bank).to.be.null
  })

  it("concludes 'dismissed' where requestCleartext returns with no attempt under way", async () => {
    const { device } = makeVaultWorld({ requestCleartext: () => undefined })
    await TH.expectRefusal(device.ensureBank(), 'dismissed')
  })

  it("concludes with a sanitized refusal when requestCleartext throws", async () => {
    const { device } = makeVaultWorld({ requestCleartext: () => { throw new Error(Passphrase) } })
    const err = await TH.expectRefusal(device.ensureBank())
    expect(err.message).to.not.include(Passphrase)
    expect(err.cause).to.be.undefined
  })
})

describe("gating.attempt", () => {
  it("accepts cleartext from a host dialog that does not narrow on the gating's kind", async () => {
    expectTypeOf<AnyGating['attempt']>().parameter(0).toEqualTypeOf<CleartextsForGatingkind[Gatingkind]>()
    const { device } = birthWorld({ requestCleartext: unnarrowedDialog })
    const landed = await device.ensureBank()
    expect(landed.isUnlocked).to.be.true
  })

  it("refuses cleartext meant for another kind of gating, and concludes the gating", async () => {
    const { device, gatingAt, shelf } = birthWorld()
    const launched = TH.expectRefusal(device.ensureBank())
    const gating = await gatingAt<'build_bank'>()
    const err = await TH.expectBad(gating.attempt({ antePassphraseClear: Passphrase, nextPassphraseClear: Passphrase }))
    await launched
    expect(gating.isOpen).to.be.false
    expect(shelf.bank).to.be.null
    expect(TH.thrownText(err)).to.not.include(Passphrase)
  })

  it("refuses a second attempt while one runs", async () => {
    const { device, gatingAt } = birthWorld()
    const launched = device.ensureBank()
    const gating = await gatingAt<'build_bank'>()
    const attempting = gating.attempt({ passphraseClear })
    const passkeyClear = await TH.passkeyOf('laptop')
    await TH.expectBad(gating.attempt({ passphraseClear, passkeyClear }))
    expect(passkeyClear.prfBytes.every((byte) => byte === 0)).to.be.true
    await TH.expectGood(attempting)
    const landed = await launched
    expect(landed.isUnlocked).to.be.true
  })

  it("refuses once concluded, and zeroes the passkey answer it was given", async () => {
    const { device, gatingAt } = birthWorld()
    const launched = TH.expectRefusal(device.ensureBank(), 'dismissed')
    const gating = await gatingAt<'build_bank'>()
    gating.dismiss()
    await launched
    const passkeyClear = await TH.passkeyOf('laptop')
    await TH.expectBad(gating.attempt({ passphraseClear, passkeyClear }))
    expect(passkeyClear.prfBytes.every((byte) => byte === 0)).to.be.true
  })

  it("concludes on a malformed attempt, with no passphrase in the refusal", async () => {
    const { device, gatingAt, shelf } = birthWorld()
    const launched = TH.expectRefusal(device.ensureBank())
    const gating = await gatingAt<'build_bank'>()
    const passkeyClear = await TH.passkeyOf('laptop')
    const err = await TH.expectBad(gating.attempt({ passphraseClear, passkeyClear, stray: Passphrase } as never))
    await launched
    expect(err.message).to.not.include(Passphrase)
    expect(JSON.stringify(err)).to.not.include(Passphrase)
    expect(gating.isOpen).to.be.false
    expect(passkeyClear.prfBytes.every((byte) => byte === 0)).to.be.true
    expect(shelf.bank).to.be.null
  })

  it("zeroes a passkey answer from another realm", async () => {
    const { device, gatingAt } = birthWorld()
    const launched = device.ensureBank()
    const gating = await gatingAt<'build_bank'>()
    const prfBytes = runInNewContext('new Uint8Array(32).fill(7)') as Uint8Array
    expect(prfBytes).to.not.be.instanceOf(Uint8Array)
    await TH.expectGood(gating.attempt({ passphraseClear, passkeyClear: { ...await TH.passkeyOf('laptop'), prfBytes } }))
    await launched
    expect(prfBytes.every((byte) => byte === 0)).to.be.true
  })

  it("keeps a passphrase out of the refusal when a getter on the cleartext throws it", async () => {
    const { device, gatingAt } = birthWorld()
    const launched = TH.expectRefusal(device.ensureBank())
    const gating = await gatingAt<'build_bank'>()
    const cleartexts = { get passphraseClear(): string { throw new Error(Passphrase) } }
    const err = await TH.expectBad(gating.attempt(cleartexts))
    await launched
    expect(err.cause).to.be.undefined
    expect(err.message).to.not.include(Passphrase)
    expect(err.stack).to.not.include(Passphrase)
    expect(JSON.stringify(err)).to.not.include(Passphrase)
  })
})

describe("an unlock through a gating", () => {
  it("gives each gating a token of its own", async () => {
    const { bank, gatingAt } = await lockedBank()
    const first = bank.ensureUnlocked()
    const firstGating = await gatingAt<'unlock_bank'>()
    firstGating.dismiss()
    await TH.expectRefusal(first, 'dismissed')
    const second = bank.ensureUnlocked()
    const secondGating = await gatingAt<'unlock_bank'>(1)
    expect(secondGating.gatingTok).to.not.eq(firstGating.gatingTok)
    secondGating.dismiss()
    await TH.expectRefusal(second, 'dismissed')
  })

  it("asks for the passphrase when no lease is cached", async () => {
    const { bank, vault, gatingAt } = await lockedBank()
    const unlocking = bank.ensureUnlocked()
    const gating = await gatingAt<'unlock_bank'>()
    expect(gating.bank).to.equal(bank)
    expect(gating.toJSON()).to.deep.equal({ gatingkind: 'unlock_bank', gatingTok: gating.gatingTok, ...BankScope })
    await TH.expectBad(gating.attempt({ passphraseClear: Wrong }), 'wrong_passphrase')
    expect(gating.isOpen).to.be.true
    expect(bank.isUnlocked).to.be.false
    expect(await TH.expectGood(gating.attempt({ passphraseClear }))).to.equal(bank)
    expect(await unlocking).to.equal(bank)
    expect(bank.isUnlocked).to.be.true
    expect(await vaultRoundTrip(vault, vault)).to.eq('sk-test')
  })

  it("unlocks with a cached lease without asking", async () => {
    const world = await makeBornVault()
    const again = await world.anotherSession()
    await again.ensureUnlocked()
    expect(again.isUnlocked).to.be.true
    expect(again.device.openGating).to.be.null
  })

  it("unlocks with the gate's passkey, and zeroes its answer", async () => {
    const { bank, gatingAt } = await lockedBank(makeBornVaultWithPasskey())
    const { passkey0 } = bank.maingate.wayins
    const unlocking = bank.ensureUnlocked()
    const gating = await gatingAt<'unlock_bank'>()
    expect(gating.passkeyHeader).to.deep.include({ wayinkind: 'passkey', credential_id: passkey0?.credential_id })
    expect(gating.passkeyHeader).to.not.have.property('bank_key_wayin_wrapped')
    const passkeyClear = await TH.passkeyOf('laptop', passkey0?.prf_salt_b64)
    await TH.expectGood(gating.attempt({ passkeyClear }))
    await unlocking
    expect(bank.isUnlocked).to.be.true
    expect(passkeyClear.prfBytes.every((byte) => byte === 0)).to.be.true
  })

  it("concludes on a passkey answer at a gate with no passkey wayin, and zeroes the answer", async () => {
    const { bank, gatingAt } = await lockedBank()
    const unlocking = TH.expectRefusal(bank.ensureUnlocked(), 'absent_wayin')
    const gating = await gatingAt<'unlock_bank'>()
    const passkeyClear = await TH.passkeyOf('laptop')
    await TH.expectBad(gating.attempt({ passkeyClear }), 'absent_wayin')
    await unlocking
    expect(gating.isOpen).to.be.false
    expect(passkeyClear.prfBytes.every((byte) => byte === 0)).to.be.true
  })

  it("keeps a passphrase out of the refusal when a getter on the passkey answer throws it", async () => {
    const { bank, gatingAt } = await lockedBank()
    const unlocking = TH.expectRefusal(bank.ensureUnlocked())
    const gating = await gatingAt<'unlock_bank'>()
    const passkeyClear = { ...await TH.passkeyOf('laptop'), get prfBytes(): Uint8Array { throw new Error(Passphrase) } }
    const err = await TH.expectBad(gating.attempt({ passkeyClear }))
    await unlocking
    expect(gating.isOpen).to.be.false
    expect(err.cause).to.be.undefined
    expect(err.message).to.not.include(Passphrase)
    expect(err.stack).to.not.include(Passphrase)
    expect(JSON.stringify(err)).to.not.include(Passphrase)
  })

  it("concludes with a refusal when the bank is deleted on another device while the dialog is open", async () => {
    const { bank, anotherDevice, gatingAt } = await lockedBank()
    const unlocking = TH.expectRefusal(bank.ensureUnlocked())
    const gating = await gatingAt<'unlock_bank'>()
    await delTyping(await anotherDevice().ensureBank(), Passphrase)
    await TH.eventually(() => ! gating.isOpen)
    await unlocking
    expect(bank.isUnlocked).to.be.false
  })
})

describe("what ends a gating", () => {
  it("leaves an unlock open through a lock, and the attempt after it unlocks", async () => {
    const { bank, gatingAt } = await lockedBank()
    const unlocking = bank.ensureUnlocked()
    const gating = await gatingAt<'unlock_bank'>()
    bank.lock()
    expect(gating.isOpen).to.be.true
    await TH.expectGood(gating.attempt({ passphraseClear }))
    await unlocking
    expect(bank.isUnlocked).to.be.true
  })

  it("concludes with the running attempt's result when dismissed", async () => {
    const { bank, gatingAt } = await lockedBank()
    const unlocking = TH.expectRefusal(bank.ensureUnlocked(), 'wrong_passphrase')
    const gating = await gatingAt<'unlock_bank'>()
    const attempting = gating.attempt({ passphraseClear: Wrong })
    gating.dismiss()
    await TH.expectBad(attempting, 'wrong_passphrase')
    await unlocking
    expect(gating.isOpen).to.be.false
    expect(bank.isUnlocked).to.be.false
  })

  it("concludes an open birth on a sweep of the device", async () => {
    const { device, gatingAt } = birthWorld()
    const launched = TH.expectRefusal(device.ensureBank())
    const gating = await gatingAt<'build_bank'>()
    device.sweep()
    await launched
    expect(gating.isOpen).to.be.false
  })

  it("concludes an open unlock on a vacate of the device", async () => {
    const { bank, gatingAt } = await lockedBank()
    const unlocking = TH.expectRefusal(bank.ensureUnlocked())
    await gatingAt<'unlock_bank'>()
    void bank.device.vacate()
    await unlocking
  })
})

describe("a dismiss crossing an attempt", () => {
  it("lets the attempt run on, and its success concludes the gating", async () => {
    const { bank, gatingAt } = await lockedBank()
    const unlocking = bank.ensureUnlocked()
    const gating = await gatingAt<'unlock_bank'>()
    const attempting = gating.attempt({ passphraseClear })
    gating.dismiss()
    expect(gating.isOpen).to.be.true
    await TH.expectGood(attempting)
    await unlocking
    expect(bank.isUnlocked).to.be.true
  })

  it("concludes with the attempt's correctable refusal", async () => {
    const { bank, gatingAt } = await lockedBank()
    const unlocking = TH.expectRefusal(bank.ensureUnlocked(), 'wrong_passphrase')
    const gating = await gatingAt<'unlock_bank'>()
    const attempting = gating.attempt({ passphraseClear: Wrong })
    gating.dismiss()
    await TH.expectBad(attempting, 'wrong_passphrase')
    await unlocking
    expect(gating.isOpen).to.be.false
  })

  it("lets the attempt finish when requestCleartext returns during it", async () => {
    const { device, dialog } = makeVaultWorld()
    let attempting: Promise<unknown> = Promise.resolve()
    dialog.requestCleartext = (gating) => { attempting = (gating as Gating<'build_bank'>).attempt({ passphraseClear }) }
    const bank = await device.ensureBank()
    await attempting
    expect(bank.isUnlocked).to.be.true
  })
})
