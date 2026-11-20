/** The bank's prompts: each opens a gating on its device, and its attempt makes the change through the bank's private verbs, over its MemoryVaultDB. */

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
