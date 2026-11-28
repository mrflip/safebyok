/** The five form entrypoints, `device.gatingBirthAttempt` and the gate's `gating…Attempt`, each handed a `FormData` or a dna in a form's fieldnames, over real provings and the device's MemoryVaultDB. */

import { describe, expect, it } from 'vitest'
import { Bank } from '../../src/models/bank'
import { GatingChecks } from '../../src/shapes/shapes-gateish'
import * as TH from '../test-helpers'

/** A passphrase to replace {@link TH.TestPassphrase} with. */
const NextPassphrase = 'a different passphrase, just as long'

/** A username a form carries beside its secrets, an obvious fake. */
const Username = 'hue@example.com'

/** A `FormData` with `texts`, by fieldname, as a form would hand its action. */
function formOf(texts: Readonly<Record<string, string>>): FormData {
  const form = new FormData()
  for (const [fieldname, text] of Object.entries(texts)) { form.append(fieldname, text) }
  return form
}

/** The fieldnames left in `form`. */
function fieldnamesOf(form: FormData): string[] { return [...form.keys()] }

/** A device signed in to an unborn bank, ready for a birth. */
async function unbornDevice() {
  const device = TH.makeDevice()
  await device.signin(TH.WorldScope.userid)
  return device
}

/** A {@link TH.buildBornBank} bank, locked. */
async function lockedBank(given: TH.BornBankGiven = {}) {
  const born = await TH.buildBornBank(given)
  born.bank.lock()
  return born
}

describe("device.gatingBirthAttempt(params)", () => {
  // gatingBirthAttempt @example
  it("births the device's bank from a form, deleting every secret field before it awaits, and leaving the rest", async () => {
    const device = await unbornDevice()
    const form = formOf({ username: Username, passphrase: TH.TestPassphrase, confirmation: TH.TestPassphrase, note: 'kept' })
    const birthing = device.gatingBirthAttempt(form)
    expect(fieldnamesOf(form)).to.deep.equal(['username', 'note'])
    const bank = await birthing
    expect(bank).to.be.instanceOf(Bank)
    expect([device.bank, bank.isUnlocked]).to.deep.equal([bank, true])
  })

  it("births the device's bank from a dna, which it leaves as it was handed", async () => {
    const device = await unbornDevice()
    const dna = Object.freeze({ username: Username, passphrase: TH.TestPassphrase, confirmation: TH.TestPassphrase })
    const bank = await device.gatingBirthAttempt(dna)
    expect([device.bank, bank.isUnlocked]).to.deep.equal([bank, true])
    expect(dna).to.deep.equal({ username: Username, passphrase: TH.TestPassphrase, confirmation: TH.TestPassphrase })
  })

  it("births a bank with a passkey from a dna, zeroing the answer's PRF bytes", async () => {
    const device = await unbornDevice()
    const passkeyAnswer = TH.passkeyAnswerOf()
    const bank = await device.gatingBirthAttempt({ passphrase: TH.TestPassphrase, passkeyAnswer })
    expect(bank.gate.passkey0).to.deep.include({ wayinkind: 'passkey', credential_id: passkeyAnswer.credential_id })
    expect(TH.isZeroed(passkeyAnswer.prfBytes)).to.be.true
  })

  it("refuses as `Bank.birth` does, the form's secret fields deleted all the same, and quotes nothing of them", async () => {
    const device = TH.makeDevice({}, { strengthChecker: () => ({ strong: false, reason: 'too short' }) })
    await device.signin(TH.WorldScope.userid)
    const form = formOf({ username: Username, passphrase: TH.TestPassphrase, confirmation: TH.TestPassphrase })
    const err = await TH.expectRefusal(device.gatingBirthAttempt(form), 'weak_passphrase')
    expect(fieldnamesOf(form)).to.deep.equal(['username'])
    expect(TH.thrownText(err)).to.not.include(TH.TestPassphrase)
    expect(device.bank.areRootsLive).to.be.false
  })

  it("empties a form's secret fields even where it refuses before `signin` answers", () => {
    const form = formOf({ passphrase: TH.TestPassphrase, confirmation: TH.TestPassphrase })
    TH.expectSyncRefusal(() => TH.makeDevice().birthGating(form), 'disabled')
    expect(fieldnamesOf(form)).to.deep.equal([])
  })
})

describe("gate.gatingUnlockAttempt(params)", () => {
  // gatingUnlockAttempt @example 1
  it("unlocks by a form's passphrase, deleting it before it awaits, and resolves the gate", async () => {
    const { bank } = await lockedBank()
    const form = formOf({ username: Username, passphrase: TH.TestPassphrase })
    const unlocking = bank.gate.gatingUnlockAttempt(form)
    expect(fieldnamesOf(form)).to.deep.equal(['username'])
    expect(await unlocking).to.equal(bank.gate)
    expect(bank.isUnlocked).to.be.true
  })

  // gatingUnlockAttempt @example 2
  it("unlocks by a dna's passkey answer, zeroing its PRF bytes, and leaves the dna's fields as they were", async () => {
    const passkeyCleartext = TH.passkeyAnswerOf()
    const { bank } = await lockedBank({ passkeyCleartext })
    const passkeyAnswer = TH.copyOfAnswer(passkeyCleartext)
    const dna = { passkeyAnswer, username: Username }
    await bank.gate.gatingUnlockAttempt(dna)
    expect(bank.isUnlocked).to.be.true
    expect(dna).to.deep.equal({ passkeyAnswer, username: Username })
    expect(TH.isZeroed(passkeyAnswer.prfBytes)).to.be.true
  })

  it("refuses a wrong passphrase as `unlock` does, the gate left locked, quoting nothing of it", async () => {
    const { bank } = await lockedBank()
    const err = await TH.expectRefusal(bank.gate.gatingUnlockAttempt(formOf({ passphrase: 'not the passphrase' })), 'wrong_passphrase')
    expect(TH.thrownText(err)).to.not.include('not the passphrase')
    expect(bank.isLocked).to.be.true
  })

  it("refuses a form with no passphrase field, and a dna with neither proof", async () => {
    const { bank } = await lockedBank()
    await TH.expectRefusal(bank.gate.gatingUnlockAttempt(formOf({ username: Username })), 'bad_record')
    await TH.expectRefusal(bank.gate.gatingUnlockAttempt({}), 'bad_record')
    expect(bank.isLocked).to.be.true
  })
})

describe("gate.gatingReplacePassphraseAttempt(params)", () => {
  it("replaces the passphrase from a form, deleting all three secret fields before it awaits; the new one then unlocks", async () => {
    const { bank } = await lockedBank()
    const form = formOf({ username: Username, passphrase: TH.TestPassphrase, nextPassphrase: NextPassphrase, confirmation: NextPassphrase })
    const replacing = bank.gate.gatingReplacePassphraseAttempt(form)
    expect(fieldnamesOf(form)).to.deep.equal(['username'])
    expect(await replacing).to.equal(bank.gate)
    bank.lock()
    await bank.gate.gatingUnlockAttempt({ passphrase: NextPassphrase })
    expect(bank.isUnlocked).to.be.true
  })

  it("refuses a wrong current passphrase from a dna as `replacePassphrase` does, writing nothing", async () => {
    const { bank } = await lockedBank()
    const prior = bank.gate.pickle()
    await TH.expectRefusal(bank.gate.gatingReplacePassphraseAttempt({ passphrase: 'not the passphrase', nextPassphrase: NextPassphrase }), 'wrong_passphrase')
    expect(bank.gate.pickle()).to.equal(prior)
  })
})

describe("gate.gatingAddPasskeyAttempt(params)", () => {
  it("adds the passkey from a dna, zeroing its answer; the passkey then unlocks", async () => {
    const { bank } = await lockedBank()
    const nextPasskeyAnswer = TH.passkeyAnswerOf()
    const prfBytes = new Uint8Array(nextPasskeyAnswer.prfBytes)
    expect(await bank.gate.gatingAddPasskeyAttempt({ passphrase: TH.TestPassphrase, nextPasskeyAnswer })).to.equal(bank.gate)
    expect(TH.isZeroed(nextPasskeyAnswer.prfBytes)).to.be.true
    bank.lock()
    await bank.gate.gatingUnlockAttempt({ passkeyAnswer: { ...nextPasskeyAnswer, prfBytes } })
    expect(bank.isUnlocked).to.be.true
  })
})

describe("gate.gatingRevokePasskeyAttempt(params)", () => {
  it("revokes the passkey from a form's passphrase, deleting it before it awaits", async () => {
    const { bank } = await lockedBank({ passkeyCleartext: TH.passkeyAnswerOf() })
    const form = formOf({ passphrase: TH.TestPassphrase })
    const revoking = bank.gate.gatingRevokePasskeyAttempt(form)
    expect(fieldnamesOf(form)).to.deep.equal([])
    await revoking
    expect(bank.gate.passkey0).to.be.null
  })
})

/** Each gate entrypoint a form can run, by name, with the gate it is called on. */
const FormEntrypoints = [
  ['gatingUnlockAttempt',            (form: FormData, bank: Bank) => bank.gate.gatingUnlockAttempt(form)],
  ['gatingReplacePassphraseAttempt', (form: FormData, bank: Bank) => bank.gate.gatingReplacePassphraseAttempt(form)],
  ['gatingRevokePasskeyAttempt',     (form: FormData, bank: Bank) => bank.gate.gatingRevokePasskeyAttempt(form)],
] as const

describe("a refused form entrypoint", () => {
  for (const [entrypoint, attemptOf] of FormEntrypoints) {
    it(`${entrypoint} deletes all three secret fields before it awaits`, async () => {
      const { bank } = await lockedBank({ passkeyCleartext: TH.passkeyAnswerOf() })
      const form = formOf({ username: Username, passphrase: 'not the passphrase', nextPassphrase: NextPassphrase, confirmation: NextPassphrase })
      const attempting = attemptOf(form, bank)
      expect(fieldnamesOf(form)).to.deep.equal(['username'])
      await TH.expectRefusal(attempting, 'wrong_passphrase')
    })
  }
})

describe("the makers, handed a dna", () => {
  it("make a gating that a second attempt refuses, as every gating does", async () => {
    const { bank } = await lockedBank()
    const gating = bank.gate.unlockGating({ passphrase: TH.TestPassphrase })
    await gating.attempt()
    await TH.expectRefusal(gating.attempt(), 'gating_concluded')
  })

  it("still take the cleartexts in the names a gating's body takes", async () => {
    const { bank } = await lockedBank()
    await bank.gate.unlockGating({ passphraseCleartext: TH.TestPassphrase }).attempt()
    expect(bank.isUnlocked).to.be.true
  })
})

describe("GatingChecks", () => {
  it("rename a dna's fields into a gating's cleartexts, ignoring any field they do not know", () => {
    expect(GatingChecks.replacePassphraseGating.parse({ passphrase: 'one', nextPassphrase: 'two', confirmation: 'two', username: Username }))
      .to.deep.equal({ passphraseCleartext: 'one', passkeyCleartext: undefined, nextPassphraseCleartext: 'two' })
  })

  it("refuse what is not an object, quoting nothing of it", () => {
    const err = TH.expectSyncRefusal(() => GatingChecks.unlockGating.parse(TH.TestPassphrase), 'bad_record')
    expect(TH.thrownText(err)).to.not.include(TH.TestPassphrase)
  })
})
