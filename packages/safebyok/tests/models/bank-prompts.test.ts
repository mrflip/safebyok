/** The bank's prompts and re-entry points: a prompt opens a gating on its device or joins the one open, a re-entry point answers it or makes its change directly, and the attempt makes the change through the bank's private verbs, over its MemoryVaultDB. */

import { describe, expect, it, vi } from 'vitest'
import { Errors } from 'safebyok-big/internals'
import { Bank } from '../../src/models/bank'
import type { Device } from '../../src/models/device'
import type { Gating } from '../../src/models/gating'
import { Lease } from '../../src/models/lease'
import { Proving } from '../../src/models/proving'
import type { GateRecord } from '../../src/shapes/shapes-thing'
import type { BirthBankAnswer } from '../../src/storage/vault-db'
import * as TH from '../test-helpers'

/** A passphrase to replace {@link TH.TestPassphrase} with. */
const NextPassphrase = 'a different passphrase, just as long'

/** A host's dialog that types `passphrases` into the gating it is shown, one attempt each, until one lands, keeping each outcome. */
function typingDialog(...passphrases: string[]) {
  const outcomes: unknown[] = []
  const passkeyCleartexts = passphrases.map(() => TH.passkeyAnswerOf())
  async function requestCleartext(gating: Gating): Promise<void> {
    for (const [ii, passphraseCleartext] of passphrases.entries()) {
      const outcome = await gating.attempt({ passphraseClear: passphraseCleartext, passkeyClear: passkeyCleartexts[ii]! })
      outcomes.push(outcome)
      if (! gating.isOpen) { return }
    }
  }
  return { requestCleartext, outcomes, passkeyCleartexts }
}

/** A strength checker that finds `'weak'` weak and every other passphrase strong. */
function strengthChecker(passphrase: string) { return (passphrase === 'weak' ? { strong: false as const, reason: 'too short' } : { strong: true as const }) }

/** A bank born on `device` through its prompt, by {@link TH.TestPassphrase}. */
function birthByPrompt(device: Device): Promise<Bank> { return TH.answerPrompt(device, Bank.launchBirthBankPrompt(device), { passphraseClear: TH.TestPassphrase }) }

/** Cleartexts an unlock's re-entry point must refuse, by what is wrong with them. */
const SloppyUnlockCleartexts = [
  // not cleartexts at all:
  [null,                    'null'],
  ["a bare passphrase",     'a bare string'],
  // the wrong shape:
  [{},                      'no field'],
  [{ passphraseClear: 42 }, 'a passphrase that is not text'],
] as const

/** Whether `promise` has settled yet, as a flag that flips once it does. */
function settledFlag(promise: Promise<unknown>): { readonly isSettled: boolean } {
  const flag = { isSettled: false }
  void Promise.allSettled([promise]).then(() => { flag.isSettled = true })
  return flag
}

/** The main gate stored for `bank`, as its vaultDB answers it. */
async function storedGateOf(bank: Bank): Promise<GateRecord> {
  const answer = await bank.device.vaultDB.tryGetThing({ ...bank.makeGetAsk({ labelpath: 'gate' }), modelkind: 'gate' })
  if (! answer.ok) { throw answer.err }
  return answer.val as GateRecord
}

describe("Bank.launchBirthBankPrompt(device)", () => {
  it("resolves an unlocked bank whose main gate has the wayins the dialog's attempt typed, and zeroes the passkey answer", async () => {
    const dialog = typingDialog(TH.TestPassphrase)
    const device = TH.makeDevice({}, { requestCleartext: dialog.requestCleartext })
    const bank = await Bank.launchBirthBankPrompt(device)
    expect(bank.isUnlocked).to.be.true
    expect(bank.device).to.equal(device)
    expect(bank.maingate.main.wayinkind).to.eq('passphrase')
    expect(bank.maingate.passkey0).to.deep.include({ wayinkind: 'passkey', credential_id: dialog.passkeyCleartexts[0]!.credential_id })
    expect(TH.isZeroed(dialog.passkeyCleartexts[0]!.prfBytes)).to.be.true
    expect(device.openGating).to.be.null
    const { record: box } = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const { whisper } = await bank.unsealBox(box)
    expect(whisper).to.deep.equal(TH.Whisper)
  })

  it("births the bank in its vaultDB before it unlocks", async () => {
    const device = TH.makeDevice({}, { requestCleartext: typingDialog(TH.TestPassphrase).requestCleartext })
    const births = TH.spyBirths(device)
    const bank = await Bank.launchBirthBankPrompt(device)
    expect(births.tryBirthBank).toHaveBeenCalledOnce()
    expect(births.banks).to.deep.equal([bank])
    expect(births.lockedAtBirths).to.deep.equal([true])
  })

  it("concludes the gating with a refusal when a live bank is stored at its scope, leaving no lease", async () => {
    const dialog = typingDialog(TH.TestPassphrase)
    const device = TH.makeDevice({}, { requestCleartext: dialog.requestCleartext })
    await TH.buildBornBank({ device: TH.makeDevice({}, { vaultDB: device.vaultDB }) })
    const births = TH.spyBirths(device)
    const err = await TH.expectRefusal(Bank.launchBirthBankPrompt(device), 'gate_made_elsewhere')
    expect(err.message).to.match(/another device/)
    expect(dialog.outcomes).to.have.lengthOf(1)
    await TH.expectBad(dialog.outcomes[0] as never, 'gate_made_elsewhere')
    expect(births.banks[0]!.isLocked).to.be.true
    expect(device.openGating).to.be.null
  })

  it("concludes the gating with any refusal of the vaultDB, as it came", async () => {
    const refusal = new Errors.VaultError('storage_unavailable', 'the disk is full')
    const device = TH.makeDevice({}, { requestCleartext: typingDialog(TH.TestPassphrase).requestCleartext })
    const births = TH.spyBirths(device, (ask) => Promise.resolve({ ok: false, ask, act: 'unclassified_storing', world: null, dbhas: null, err: refusal }))
    expect(await TH.expectRefusal(Bank.launchBirthBankPrompt(device), 'storage_unavailable')).to.eq(refusal)
    expect(births.banks[0]!.isLocked).to.be.true
  })

  it("stays open after a weak passphrase, its passkey answer unspent, and the next attempt lands", async () => {
    const dialog = typingDialog('weak', TH.TestPassphrase)
    const device = TH.makeDevice({}, { strengthChecker, requestCleartext: dialog.requestCleartext })
    const births = TH.spyBirths(device)
    const bank = await Bank.launchBirthBankPrompt(device)
    await TH.expectBad(dialog.outcomes[0] as never, 'weak_passphrase')
    expect(TH.isZeroed(dialog.passkeyCleartexts[0]!.prfBytes)).to.be.false
    expect(bank.isUnlocked).to.be.true
    expect(births.tryBirthBank).toHaveBeenCalledTimes(1)
  })

  it("concludes 'dismissed' when the dialog closes after weak passphrases alone", async () => {
    const device = TH.makeDevice({}, { strengthChecker, requestCleartext: typingDialog('weak', 'weak').requestCleartext })
    const births = TH.spyBirths(device)
    await TH.expectRefusal(Bank.launchBirthBankPrompt(device), 'dismissed')
    expect(births.tryBirthBank).not.toHaveBeenCalled()
  })

  it("waits, with no host dialog, for an attempt on the device's open gating", async () => {
    const device = TH.makeDevice()
    const prompting = Bank.launchBirthBankPrompt(device)
    const gating = device.openGating!
    expect(gating.toJSON()).to.deep.equal({ gatingkind: 'birth_bank', gatingTok: gating.gatingTok, ...TH.WorldScope })
    await TH.wakeupAtNextTick()
    expect(gating.isOpen).to.be.true
    const bank = await TH.expectGood(gating.attempt({ passphraseClear: TH.TestPassphrase }))
    expect(await prompting).to.equal(bank)
  })

  it("waits, with no host dialog, for a dismiss of the device's open gating", async () => {
    const device = TH.makeDevice()
    const prompting = TH.expectRefusal(Bank.launchBirthBankPrompt(device), 'dismissed')
    device.openGating!.dismiss()
    await prompting
    expect(device.openGating).to.be.null
  })

  it("refuses a second prompt while one is open, leaving the first open", async () => {
    const device = TH.makeDevice()
    const first = TH.expectRefusal(Bank.launchBirthBankPrompt(device), 'dismissed')
    const gating = device.openGating!
    await TH.expectRefusal(Bank.launchBirthBankPrompt(device), 'already_asking')
    expect(device.openGating).to.equal(gating)
    gating.dismiss()
    await first
  })

  it("concludes with a refusal quoting nothing when the dialog throws", async () => {
    const device = TH.makeDevice({}, { requestCleartext: () => { throw new Error(TH.TestPassphrase) } })
    const err = await TH.expectRefusal(Bank.launchBirthBankPrompt(device), 'unexpected_error')
    expect(err.cause).to.be.undefined
    expect(TH.thrownText(err)).to.not.include(TH.TestPassphrase)
  })

  it("seals the root box under the new lease, and holds the root box the vaultDB answers", async () => {
    const device = TH.makeDevice()
    const births = TH.spyBirths(device)
    const bank = await birthByPrompt(device)
    const answer = await (births.tryBirthBank.mock.results[0]!.value as Promise<BirthBankAnswer>)
    expect(answer).to.include({ ok: true, act: 'born' })
    if (! answer.ok) { throw answer.err }
    expect(answer.val.root).to.include({ ...TH.RootScope, revseq: 0, am: 'a', lifeseq: TH.Life0, lifepath: TH.Life0 })
    expect(bank.rootBox).to.deep.equal(answer.val.root)
    expect(await bank.unsealBox(answer.val.root)).to.deep.include({ whisper: {} })
  })

  // The vaultDB answers retcon, not passed, to a birth it stored already; passed on this bank is a vaultDB's answer alone.
  it("unlocks where the vaultDB passes on this same bank, taking the root box it answers", async () => {
    const device = TH.makeDevice()
    const tryBirthBank = device.vaultDB.tryBirthBank.bind(device.vaultDB)
    const births = TH.spyBirths(device, async (ask) => {
      const born = await tryBirthBank(ask)
      return born.ok ? { ...born, act: 'passed' } : born
    })
    const bank = await birthByPrompt(device)
    const answer = await (births.tryBirthBank.mock.results[0]!.value as Promise<BirthBankAnswer>)
    expect(answer).to.include({ ok: true, act: 'passed' })
    expect(bank.isUnlocked).to.be.true
    expect(bank.rootBox).to.deep.equal(answer.ok && answer.val.root)
  })

  it("evicts the lease it built where the bank stored is another's, or the vaultDB refuses", async () => {
    const device = TH.makeDevice()
    await birthByPrompt(device)
    const evict = vi.spyOn(Lease.prototype, 'evict')
    await TH.expectRefusal(birthByPrompt(device), 'gate_made_elsewhere')
    expect(evict).toHaveBeenCalledTimes(1)
    const refusal = new Errors.VaultError('storage_unavailable', 'the disk is full')
    TH.spyBirths(device, (ask) => Promise.resolve({ ok: false, ask, act: 'unclassified_storing', world: null, dbhas: null, err: refusal }))
    await TH.expectRefusal(birthByPrompt(device), 'storage_unavailable')
    expect(evict).toHaveBeenCalledTimes(2)
  })

  it("refuses on a swept device, opening no gating, building no lease and writing nothing", async () => {
    const device = TH.makeDevice()
    const make = vi.spyOn(Lease, 'make')
    const tryBirthBank = vi.spyOn(device.vaultDB, 'tryBirthBank')
    device.sweep()
    expect(await TH.expectRefusal(Bank.launchBirthBankPrompt(device), 'disabled')).to.equal(device.endCause)
    expect(device.openGating).to.be.null
    expect(make).not.toHaveBeenCalled()
    expect(tryBirthBank).not.toHaveBeenCalled()
  })

  it("refuses where the device is swept as the attempt runs, writing nothing", async () => {
    const device = TH.makeDevice()
    const births = TH.spyBirths(device)
    const prompting = TH.expectRefusal(Bank.launchBirthBankPrompt(device), 'disabled')
    const attempting = device.openGating!.attempt({ passphraseClear: TH.TestPassphrase })
    device.sweep()
    await TH.expectBad(attempting, 'disabled')
    await prompting
    expect(births.tryBirthBank).not.toHaveBeenCalled()
  })
})

describe("bank.launchUnlockBankPrompt()", () => {
  it("unlocks by the passphrase, under a lease citing the main gate", async () => {
    const { bank } = await TH.buildBornBank()
    bank.lock()
    const make = vi.spyOn(Lease, 'make')
    expect(await TH.answerPrompt(bank.device, bank.launchUnlockBankPrompt(), { passphraseClear: TH.TestPassphrase })).to.equal(bank)
    expect(bank.isUnlocked).to.be.true
    expect(make.mock.calls[0]![0]).to.include({ gate_labelpath: 'gate', gate_lifeseq: TH.Life0, gate_revtok: bank.maingate.revtok, wayinkind: 'passphrase' })
    expect(bank.device.openGating).to.be.null
  })

  it("unlocks by the passkey", async () => {
    const passkeyCleartext = TH.passkeyAnswerOf()
    const { bank } = await TH.buildBornBank({ passkeyCleartext })
    bank.lock()
    const make = vi.spyOn(Lease, 'make')
    await TH.answerPrompt(bank.device, bank.launchUnlockBankPrompt(), { passkeyClear: TH.copyOfAnswer(passkeyCleartext) })
    expect(bank.isUnlocked).to.be.true
    expect(make.mock.calls[0]![0]).to.include({ wayinkind: 'passkey' })
  })

  it("evicts the lease an unlock replaces", async () => {
    const { bank } = await TH.buildBornBank()
    const evict = vi.spyOn(Lease.prototype, 'evict')
    await TH.answerPrompt(bank.device, bank.launchUnlockBankPrompt(), { passphraseClear: TH.TestPassphrase })
    expect(evict).toHaveBeenCalledTimes(1)
    expect(bank.isUnlocked).to.be.true
  })

  it("stays open after a wrong passphrase, the bank locked, and the next attempt lands", async () => {
    const { bank, device } = await TH.buildBornBank()
    bank.lock()
    const prompting = bank.launchUnlockBankPrompt()
    const gating = device.openGating!
    await TH.expectBad(gating.attempt({ passphraseClear: 'not the passphrase' }), 'wrong_passphrase')
    expect(gating.isOpen).to.be.true
    expect(bank.isLocked).to.be.true
    await TH.expectGood(gating.attempt({ passphraseClear: TH.TestPassphrase }))
    expect(await prompting).to.equal(bank)
    expect(bank.isUnlocked).to.be.true
  })

  it("leaves the lease attached when the proving's buildLease refuses", async () => {
    const { bank } = await TH.buildBornBank()
    vi.spyOn(Proving.prototype, 'buildLease').mockRejectedValueOnce(new Errors.VaultError('unexpected_error', 'no lease today'))
    await TH.expectRefusal(TH.answerPrompt(bank.device, bank.launchUnlockBankPrompt(), { passphraseClear: TH.TestPassphrase }), 'unexpected_error')
    expect(bank.isUnlocked).to.be.true
  })

  it("refuses a swept bank, asking nobody", async () => {
    const { bank, device } = await TH.buildBornBank()
    bank.sweep()
    await TH.expectRefusal(bank.launchUnlockBankPrompt(), 'disabled')
    expect(device.openGating).to.be.null
  })

  it("refuses where the bank is swept as the attempt runs, evicting the lease it built, and stays locked", async () => {
    const { bank, device } = await TH.buildBornBank()
    bank.lock()
    const prompting = TH.expectRefusal(bank.launchUnlockBankPrompt(), 'disabled')
    const evict = vi.spyOn(Lease.prototype, 'evict')
    const attempting = device.openGating!.attempt({ passphraseClear: TH.TestPassphrase })
    bank.sweep()
    await TH.expectBad(attempting, 'disabled')
    await prompting
    expect(evict).toHaveBeenCalledTimes(1)
    expect(bank.isLocked).to.be.true
  })
})

describe("bank.launchReplacePassphrasePrompt()", () => {
  it("writes the main gate's next revision with the new passphrase's wayin, holds it, and unlocks under a lease citing it", async () => {
    const passkeyCleartext = TH.passkeyAnswerOf()
    const { bank, device } = await TH.buildBornBank({ passkeyCleartext })
    const ante = bank.maingate
    const make = vi.spyOn(Lease, 'make')
    await TH.answerPrompt(device, bank.launchReplacePassphrasePrompt(), { antePassphraseClear: TH.TestPassphrase, nextPassphraseClear: NextPassphrase })
    expect(bank.maingate).to.not.equal(ante)
    expect(bank.maingate).to.include({ revseq: ante.revseq + 1, lifeseq: ante.lifeseq })
    expect(bank.maingate.main.pickle()).to.not.deep.equal(ante.main.pickle())
    expect(bank.maingate.passkey0!.pickle()).to.deep.equal(ante.passkey0!.pickle())
    expect(await storedGateOf(bank)).to.deep.equal(bank.maingate.pickle())
    expect(bank.isUnlocked).to.be.true
    expect(make.mock.calls[0]![0]).to.include({ gate_revtok: bank.maingate.revtok, wayinkind: 'passphrase' })
  })

  it("unlocks by the new passphrase afterwards, and refuses the old one, under the same bankKey", async () => {
    const { bank, device } = await TH.buildBornBank()
    const { record: box } = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    await TH.answerPrompt(device, bank.launchReplacePassphrasePrompt(), { antePassphraseClear: TH.TestPassphrase, nextPassphraseClear: NextPassphrase })
    bank.lock()
    await TH.expectRefusal(TH.answerPrompt(device, bank.launchUnlockBankPrompt(), { passphraseClear: TH.TestPassphrase }), 'wrong_passphrase')
    await TH.answerPrompt(device, bank.launchUnlockBankPrompt(), { passphraseClear: NextPassphrase })
    expect(await bank.unsealBox(box)).to.deep.include({ whisper: TH.Whisper })
  })

  it("refuses the same passphrase twice, and a wrong current one, writing nothing", async () => {
    const { bank, device } = await TH.buildBornBank()
    const ante = bank.maingate
    const tryWriteThing = vi.spyOn(device.vaultDB, 'tryWriteThing')
    await TH.expectRefusal(TH.answerPrompt(device, bank.launchReplacePassphrasePrompt(), { antePassphraseClear: TH.TestPassphrase, nextPassphraseClear: TH.TestPassphrase }), 'same_passphrase')
    await TH.expectRefusal(TH.answerPrompt(device, bank.launchReplacePassphrasePrompt(), { antePassphraseClear: 'not the passphrase', nextPassphraseClear: NextPassphrase }), 'wrong_passphrase')
    expect(tryWriteThing).not.toHaveBeenCalled()
    expect(bank.maingate).to.equal(ante)
  })

  it("throws the vaultDB's refusal as it came, keeping the main gate and the lease it had", async () => {
    const { bank, device } = await TH.buildBornBank()
    const ante = bank.maingate
    const refusal = new Errors.VaultError('storage_unavailable', 'the disk is full')
    vi.spyOn(device.vaultDB, 'tryWriteThing').mockImplementationOnce((ask) => Promise.resolve({ ok: false, ask, act: 'unclassified_storing', world: null, dbhas: null, err: refusal }))
    const make = vi.spyOn(Lease, 'make')
    const replacing = TH.answerPrompt(device, bank.launchReplacePassphrasePrompt(), { antePassphraseClear: TH.TestPassphrase, nextPassphraseClear: NextPassphrase })
    expect(await TH.expectRefusal(replacing)).to.equal(refusal)
    expect(bank.maingate).to.equal(ante)
    expect(make).not.toHaveBeenCalled()
    expect(bank.isUnlocked).to.be.true
  })
})

describe("bank.launchAddPasskeyPrompt()", () => {
  it("writes the main gate's next revision with the passkey's wayin beside the passphrase's, and the passkey then unlocks", async () => {
    const { bank, device } = await TH.buildBornBank()
    const ante = bank.maingate
    const passkeyCleartext = TH.passkeyAnswerOf()
    await TH.answerPrompt(device, bank.launchAddPasskeyPrompt(), { passphraseClear: TH.TestPassphrase, passkeyClear: TH.copyOfAnswer(passkeyCleartext) })
    expect(bank.maingate).to.include({ revseq: ante.revseq + 1 })
    expect(bank.maingate.main.pickle()).to.deep.equal(ante.main.pickle())
    expect(bank.maingate.passkey0).to.deep.include({ wayinkind: 'passkey', credential_id: passkeyCleartext.credential_id })
    expect(await storedGateOf(bank)).to.deep.equal(bank.maingate.pickle())
    bank.lock()
    await TH.answerPrompt(device, bank.launchUnlockBankPrompt(), { passkeyClear: TH.copyOfAnswer(passkeyCleartext) })
    expect(bank.isUnlocked).to.be.true
  })

  it("refuses a gate with a passkey already, asking nobody", async () => {
    const { bank, device } = await TH.buildBornBank({ passkeyCleartext: TH.passkeyAnswerOf() })
    await TH.expectRefusal(bank.launchAddPasskeyPrompt(), 'bad_record')
    expect(device.openGating).to.be.null
  })
})

describe("bank.launchRevokePasskeyPrompt()", () => {
  it("writes the main gate's next revision without the passkey's wayin, and the passphrase still unlocks", async () => {
    const passkeyCleartext = TH.passkeyAnswerOf()
    const { bank, device } = await TH.buildBornBank({ passkeyCleartext })
    const ante = bank.maingate
    await TH.answerPrompt(device, bank.launchRevokePasskeyPrompt(), { passphraseClear: TH.TestPassphrase })
    expect(bank.maingate).to.include({ revseq: ante.revseq + 1 })
    expect(bank.maingate.passkey0).to.be.null
    expect(await storedGateOf(bank)).to.deep.equal(bank.maingate.pickle())
    bank.lock()
    await TH.answerPrompt(device, bank.launchUnlockBankPrompt(), { passphraseClear: TH.TestPassphrase })
    expect(bank.isUnlocked).to.be.true
  })

  it("returns at once with no passkey, asking nobody", async () => {
    const { bank, device } = await TH.buildBornBank()
    const ante = bank.maingate
    expect(await bank.launchRevokePasskeyPrompt()).to.equal(bank)
    expect(device.openGating).to.be.null
    expect(bank.maingate).to.equal(ante)
  })
})

describe("bank.ensureUnlocked()", () => {
  it("resolves at once on an unlocked bank, opening no gating", async () => {
    const { bank, device } = await TH.buildBornBank()
    expect(await bank.ensureUnlocked()).to.equal(bank)
    expect(device.openGating).to.be.null
  })

  it("opens an unlock gating on a locked bank, and resolves once an attempt lands", async () => {
    const { bank, device } = await TH.buildBornBank()
    bank.lock()
    const ensuring = bank.ensureUnlocked()
    expect(device.openGating).to.include({ gatingkind: 'unlock_bank', bank })
    expect(await TH.answerPrompt(device, ensuring, { passphraseClear: TH.TestPassphrase })).to.equal(bank)
    expect(await ensuring).to.equal(bank)
    expect(bank.isUnlocked).to.be.true
  })

  it("refuses a swept bank, opening no gating", async () => {
    const { bank, device } = await TH.buildBornBank()
    bank.sweep()
    await TH.expectRefusal(bank.ensureUnlocked(), 'disabled')
    expect(device.openGating).to.be.null
  })
})

describe("a prompt on a bank whose gating is open", () => {
  it("joins it, and every waiter resumes after one attemptUnlock", async () => {
    const { bank, device } = await TH.buildBornBank()
    bank.lock()
    const make = vi.spyOn(Lease, 'make')
    const firstEnsuring  = bank.ensureUnlocked()
    const gating = device.openGating!
    const secondEnsuring = bank.ensureUnlocked()
    expect(device.openGating).to.equal(gating)
    await TH.expectGood(bank.attemptUnlock({ passphraseClear: TH.TestPassphrase }))
    expect(await firstEnsuring).to.equal(bank)
    expect(await secondEnsuring).to.equal(bank)
    expect(make).toHaveBeenCalledTimes(1)
    expect(gating.isOpen).to.be.false
    expect(bank.isUnlocked).to.be.true
  })

  it("asks the host's dialog once, for the gating it joins", async () => {
    const requestCleartext = vi.fn(() => new Promise<void>(() => undefined))
    const { bank } = await TH.buildBornBank({ device: TH.makeDevice({}, { requestCleartext }) })
    bank.lock()
    requestCleartext.mockClear()
    const ensurings = [bank.ensureUnlocked(), bank.launchUnlockBankPrompt()]
    await TH.expectGood(bank.attemptUnlock({ passphraseClear: TH.TestPassphrase }))
    expect(await Promise.all(ensurings)).to.deep.equal([bank, bank])
    expect(requestCleartext).toHaveBeenCalledTimes(1)
  })

  it("leaves every waiter waiting after a correctable refusal, and the next attempt resumes them all", async () => {
    const { bank, device } = await TH.buildBornBank()
    bank.lock()
    const ensurings = [bank.ensureUnlocked(), bank.ensureUnlocked()]
    const settled = ensurings.map((ensuring) => settledFlag(ensuring))
    await TH.expectBad(bank.attemptUnlock({ passphraseClear: 'not the passphrase' }), 'wrong_passphrase')
    await TH.wakeupAtNextTick()
    expect(settled.map((flag) => flag.isSettled)).to.deep.equal([false, false])
    expect(device.openGating!.isOpen).to.be.true
    await TH.expectGood(bank.attemptUnlock({ passphraseClear: TH.TestPassphrase }))
    expect(await Promise.all(ensurings)).to.deep.equal([bank, bank])
  })

  it("rejects every waiter 'dismissed' when the gating is dismissed", async () => {
    const { bank, device } = await TH.buildBornBank()
    bank.lock()
    const ensurings = [bank.ensureUnlocked(), bank.ensureUnlocked(), bank.launchUnlockBankPrompt()].map((ensuring) => TH.expectRefusal(ensuring, 'dismissed'))
    device.openGating!.dismiss()
    await Promise.all(ensurings)
    expect(device.openGating).to.be.null
    expect(bank.isLocked).to.be.true
  })

  it("joins a gate change of its own kind, writing the gate once", async () => {
    const { bank, device } = await TH.buildBornBank()
    const ante = bank.maingate
    const prompts = [bank.launchReplacePassphrasePrompt(), bank.launchReplacePassphrasePrompt()]
    await TH.expectGood(bank.attemptReplacePassphrase({ antePassphraseClear: TH.TestPassphrase, nextPassphraseClear: NextPassphrase }))
    expect(await Promise.all(prompts)).to.deep.equal([bank, bank])
    expect(bank.maingate).to.include({ revseq: ante.revseq + 1 })
    expect(device.openGating).to.be.null
  })

  it("waits for a gate change to land, then resolves without asking, the bank unlocked", async () => {
    const { bank, device } = await TH.buildBornBank()
    bank.lock()
    const replacing = bank.launchReplacePassphrasePrompt()
    const gating = device.openGating!
    const ensuring = bank.ensureUnlocked()
    expect(device.openGating).to.equal(gating)
    await TH.expectGood(bank.attemptReplacePassphrase({ antePassphraseClear: TH.TestPassphrase, nextPassphraseClear: NextPassphrase }))
    expect(await ensuring).to.equal(bank)
    expect(await replacing).to.equal(bank)
    expect(bank.isUnlocked).to.be.true
    expect(device.openGating).to.be.null
  })

  it("waits out a dismissed gate change, then asks to unlock in a gating of its own", async () => {
    const { bank, device } = await TH.buildBornBank()
    bank.lock()
    const replacing = TH.expectRefusal(bank.launchReplacePassphrasePrompt(), 'dismissed')
    const gating = device.openGating!
    const ensurings = [bank.ensureUnlocked(), bank.launchUnlockBankPrompt()]
    const settled = ensurings.map((ensuring) => settledFlag(ensuring))
    gating.dismiss()
    await replacing
    await TH.wakeupAtNextTick()
    expect(settled.map((flag) => flag.isSettled)).to.deep.equal([false, false])
    expect(device.openGating).to.include({ gatingkind: 'unlock_bank' }).and.not.equal(gating)
    await TH.expectGood(bank.attemptUnlock({ passphraseClear: TH.TestPassphrase }))
    expect(await Promise.all(ensurings)).to.deep.equal([bank, bank])
    expect(bank.isUnlocked).to.be.true
  })

  it("refuses 'disabled' when the device is swept while it waits out a gate change, opening no gating", async () => {
    const { bank, device } = await TH.buildBornBank()
    bank.lock()
    const replacing = TH.expectRefusal(bank.launchReplacePassphrasePrompt(), 'dismissed')
    const ensuring = TH.expectRefusal(bank.ensureUnlocked(), 'disabled')
    device.sweep()
    await Promise.all([replacing, ensuring])
    expect(device.openGating).to.be.null
  })

  it("refuses a gate change while a gating of another kind is open, leaving that gating open", async () => {
    const { bank, device } = await TH.buildBornBank()
    bank.lock()
    const ensuring = TH.expectRefusal(bank.ensureUnlocked(), 'dismissed')
    const gating = device.openGating!
    await TH.expectRefusal(bank.launchReplacePassphrasePrompt(), 'already_asking')
    expect(device.openGating).to.equal(gating)
    gating.dismiss()
    await ensuring
  })

  it("refuses while a birth gating is open on the device, which is no gating of this bank", async () => {
    const { bank, device } = await TH.buildBornBank()
    bank.lock()
    const birthing = TH.expectRefusal(Bank.launchBirthBankPrompt(device), 'dismissed')
    await TH.expectRefusal(bank.ensureUnlocked(), 'already_asking')
    device.openGating!.dismiss()
    await birthing
  })
})

describe("bank.attemptUnlock(cleartexts)", () => {
  it("unlocks with no gating open, opening none", async () => {
    const { bank, device } = await TH.buildBornBank()
    bank.lock()
    const make = vi.spyOn(Lease, 'make')
    expect(await TH.expectGood(bank.attemptUnlock({ passphraseClear: TH.TestPassphrase }))).to.equal(bank)
    expect(bank.isUnlocked).to.be.true
    expect(device.openGating).to.be.null
    expect(make.mock.calls[0]![0]).to.include({ gate_revtok: bank.maingate.revtok, wayinkind: 'passphrase' })
  })

  it("resolves the refusal of a wrong passphrase with no gating open, the bank locked", async () => {
    const { bank } = await TH.buildBornBank()
    bank.lock()
    await TH.expectBad(bank.attemptUnlock({ passphraseClear: 'not the passphrase' }), 'wrong_passphrase')
    expect(bank.isLocked).to.be.true
  })

  it("unlocks by the passkey with no gating open, and zeroes its answer's bytes", async () => {
    const passkeyCleartext = TH.passkeyAnswerOf()
    const { bank } = await TH.buildBornBank({ passkeyCleartext })
    bank.lock()
    const passkeyClear = TH.copyOfAnswer(passkeyCleartext)
    await TH.expectGood(bank.attemptUnlock({ passkeyClear }))
    expect(bank.isUnlocked).to.be.true
    expect([...passkeyClear.prfBytes].every((byte) => byte === 0)).to.be.true
  })

  it("zeroes a passkey answer's bytes with no gating open, even when it is refused", async () => {
    const { bank } = await TH.buildBornBank({ passkeyCleartext: TH.passkeyAnswerOf() })
    bank.lock()
    const passkeyClear = TH.passkeyAnswerOf()
    await TH.expectBad(bank.attemptUnlock({ passkeyClear }))
    expect([...passkeyClear.prfBytes].every((byte) => byte === 0)).to.be.true
    expect(bank.isLocked).to.be.true
  })

  it("resolves the refusal of a swept bank, deriving no key from the passphrase", async () => {
    const deriveKeyBytes = vi.fn((passphrase: string, saltBytes: Uint8Array) => TH.testDeriver.deriveKeyBytes(passphrase, saltBytes))
    const { bank } = await TH.buildBornBank({ device: TH.makeDevice({}, { keyDeriver: { ...TH.testDeriver, deriveKeyBytes } }) })
    bank.sweep()
    deriveKeyBytes.mockClear()
    await TH.expectBad(bank.attemptUnlock({ passphraseClear: TH.TestPassphrase }), 'disabled')
    expect(deriveKeyBytes).not.toHaveBeenCalled()
  })

  it("resolves the refusal of a swept bank, zeroing a passkey answer's bytes", async () => {
    const { bank } = await TH.buildBornBank({ passkeyCleartext: TH.passkeyAnswerOf() })
    bank.sweep()
    const passkeyClear = TH.passkeyAnswerOf()
    await TH.expectBad(bank.attemptUnlock({ passkeyClear }), 'disabled')
    expect([...passkeyClear.prfBytes].every((byte) => byte === 0)).to.be.true
  })

  for (const [cleartexts, blurb] of SloppyUnlockCleartexts) {
    it(`resolves a refusal for ${blurb} with no gating open, the bank locked`, async () => {
      const { bank, device } = await TH.buildBornBank()
      bank.lock()
      await TH.expectBad(bank.attemptUnlock(cleartexts as never))
      expect(bank.isLocked).to.be.true
      expect(device.openGating).to.be.null
    })
  }

  it("resolves a refusal quoting nothing of what a throwing getter threw", async () => {
    const { bank } = await TH.buildBornBank()
    bank.lock()
    const cleartexts = { get passphraseClear(): string { throw new Error(TH.TestPassphrase) } }
    const err = await TH.expectBad(bank.attemptUnlock(cleartexts))
    expect(JSON.stringify(err)).to.not.include(TH.TestPassphrase)
    expect(err.message).to.not.include(TH.TestPassphrase)
    expect(err.cause).to.be.undefined
  })
})

describe("bank.attemptReplacePassphrase(cleartexts)", () => {
  it("answers the open replace_passphrase gating, and its prompt resumes", async () => {
    const { bank, device } = await TH.buildBornBank()
    const replacing = bank.launchReplacePassphrasePrompt()
    const gating = device.openGating!
    await TH.expectGood(bank.attemptReplacePassphrase({ antePassphraseClear: TH.TestPassphrase, nextPassphraseClear: NextPassphrase }))
    expect(await replacing).to.equal(bank)
    expect(gating.isOpen).to.be.false
  })

  it("replaces the passphrase with no gating open, and the new one then unlocks", async () => {
    const { bank, device } = await TH.buildBornBank()
    const ante = bank.maingate
    await TH.expectGood(bank.attemptReplacePassphrase({ antePassphraseClear: TH.TestPassphrase, nextPassphraseClear: NextPassphrase }))
    expect(device.openGating).to.be.null
    expect(bank.maingate).to.include({ revseq: ante.revseq + 1 })
    expect(await storedGateOf(bank)).to.deep.equal(bank.maingate.pickle())
    bank.lock()
    await TH.expectBad(bank.attemptUnlock({ passphraseClear: TH.TestPassphrase }), 'wrong_passphrase')
    await TH.expectGood(bank.attemptUnlock({ passphraseClear: NextPassphrase }))
  })
})

describe("bank.attemptAddPasskey(cleartexts)", () => {
  it("answers the open add_passkey gating, and its prompt resumes", async () => {
    const { bank, device } = await TH.buildBornBank()
    const adding = bank.launchAddPasskeyPrompt()
    const gating = device.openGating!
    await TH.expectGood(bank.attemptAddPasskey({ passphraseClear: TH.TestPassphrase, passkeyClear: TH.passkeyAnswerOf() }))
    expect(await adding).to.equal(bank)
    expect(gating.isOpen).to.be.false
    expect(bank.maingate.passkey0).to.not.be.null
  })

  it("adds the passkey with no gating open, and the passkey then unlocks", async () => {
    const { bank } = await TH.buildBornBank()
    const passkeyCleartext = TH.passkeyAnswerOf()
    await TH.expectGood(bank.attemptAddPasskey({ passphraseClear: TH.TestPassphrase, passkeyClear: TH.copyOfAnswer(passkeyCleartext) }))
    expect(await storedGateOf(bank)).to.deep.equal(bank.maingate.pickle())
    bank.lock()
    await TH.expectGood(bank.attemptUnlock({ passkeyClear: TH.copyOfAnswer(passkeyCleartext) }))
  })

  it("resolves a refusal with no gating open while the gate has a passkey, writing nothing and zeroing the answer's bytes", async () => {
    const { bank, device } = await TH.buildBornBank({ passkeyCleartext: TH.passkeyAnswerOf() })
    const ante = bank.maingate
    const tryWriteThing = vi.spyOn(device.vaultDB, 'tryWriteThing')
    const passkeyClear = TH.passkeyAnswerOf()
    await TH.expectBad(bank.attemptAddPasskey({ passphraseClear: TH.TestPassphrase, passkeyClear }), 'bad_record')
    expect(tryWriteThing).not.toHaveBeenCalled()
    expect(bank.maingate).to.equal(ante)
    expect([...passkeyClear.prfBytes].every((byte) => byte === 0)).to.be.true
  })
})

describe("bank.attemptRevokePasskey(cleartexts)", () => {
  it("answers the open revoke_passkey gating, and its prompt resumes", async () => {
    const { bank, device } = await TH.buildBornBank({ passkeyCleartext: TH.passkeyAnswerOf() })
    const revoking = bank.launchRevokePasskeyPrompt()
    const gating = device.openGating!
    await TH.expectGood(bank.attemptRevokePasskey({ passphraseClear: TH.TestPassphrase }))
    expect(await revoking).to.equal(bank)
    expect(gating.isOpen).to.be.false
    expect(bank.maingate.passkey0).to.be.null
  })

  it("revokes the passkey with no gating open", async () => {
    const { bank, device } = await TH.buildBornBank({ passkeyCleartext: TH.passkeyAnswerOf() })
    await TH.expectGood(bank.attemptRevokePasskey({ passphraseClear: TH.TestPassphrase }))
    expect(device.openGating).to.be.null
    expect(bank.maingate.passkey0).to.be.null
    expect(await storedGateOf(bank)).to.deep.equal(bank.maingate.pickle())
  })

  it("resolves at once with no gating open and no passkey, writing nothing", async () => {
    const { bank, device } = await TH.buildBornBank()
    const ante = bank.maingate
    const tryWriteThing = vi.spyOn(device.vaultDB, 'tryWriteThing')
    expect(await TH.expectGood(bank.attemptRevokePasskey({ passphraseClear: TH.TestPassphrase }))).to.equal(bank)
    expect(tryWriteThing).not.toHaveBeenCalled()
    expect(bank.maingate).to.equal(ante)
  })
})
