/** A gating's mechanics over a scripted attempt, and the `birth_bank` attempt, `birthBank`, over real provings and a stubbed `bank.put`. */

import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { Errors, Outcome, SX } from 'safebyok-big/internals'
import type { Bank } from '../../src/models/bank'
import { guardRequestCleartext } from '../../src/models/device'
import { Gating, type GatingAttempt, type GatingOpts, birthBank } from '../../src/models/gating'
import { PutNotBuilt } from '../../src/phrases'
import * as TH from '../test-helpers'

/** A gating of `birth_bank` on `opts.device`, or a fresh device, with no host dialog and an attempt that is never called, unless `opts` says otherwise. */
function makeGating(opts: Partial<GatingOpts> = {}): Gating {
  return Gating.make({ gatingkind: 'birth_bank' }, { device: TH.makeDevice(), bank: null, askUser: null, attempt: neverAttempts, ...opts })
}

/** A {@link makeGating} gating, launched, its launch's outcome left to `whenConcluded`. */
function launchedGating(opts: Partial<GatingOpts> = {}): Gating {
  const gating = makeGating(opts)
  void Outcome.outcomeOf(() => gating.launch())
  return gating
}

/** An attempt no test here reaches. */
function neverAttempts(): Promise<never> { return Promise.reject(new Error('never called')) }

/** An attempt scripted to land `bank`, or to refuse with each of `refusals` first, in turn. */
function attemptLanding(bank: Bank, ...refusals: unknown[]) {
  const attempt = vi.fn<GatingAttempt>(() => Promise.resolve(bank))
  for (const refusal of refusals) { attempt.mockRejectedValueOnce(refusal) }
  return attempt
}

/** A strength checker that finds `'weak'` weak and every other passphrase strong. */
function strengthChecker(passphrase: string) { return (passphrase === 'weak' ? { strong: false as const, reason: 'too short' } : { strong: true as const }) }

/** The cleartexts of a birth, with a passkey answer whose PRF bytes a test can watch. */
function cleartextsOf(): { passphraseClear: string, passkeyClear: ReturnType<typeof TH.passkeyAnswerOf> } {
  return { passphraseClear: TH.TestPassphrase, passkeyClear: TH.passkeyAnswerOf() }
}

describe("Gating.make(record, opts)", () => {
  it("shows its kind, a token and its device's scope, and is open but not yet on the device", () => {
    const device = TH.makeDevice()
    const gating = makeGating({ device })
    expect(gating).to.include({ gatingkind: 'birth_bank', ...TH.WorldScope })
    expect(gating.gatingTok).to.be.a('string')
    expect(gating.scope).to.deep.equal(TH.WorldScope)
    expect(gating.bank).to.be.null
    expect(gating.passkeyHeader).to.be.null
    expect(gating.isOpen).to.be.true
    expect(device.openGating).to.be.null
    expect(gating.modelkind).to.eq('gating')
  })

  it("gives each gating a token of its own", () => {
    expect(makeGating().gatingTok).to.not.eq(makeGating().gatingTok)
  })

  it("shows the header of its bank's passkey wayin, with no wrapped bankKey", async () => {
    const { bank, device } = await TH.buildBornBank({ passkeyClear: TH.passkeyAnswerOf() })
    const gating = makeGating({ device, bank })
    expect(gating.bank).to.equal(bank)
    expect(gating.passkeyHeader).to.deep.equal(bank.maingate.passkey0!.toJSON())
    expect(gating.passkeyHeader).to.not.have.property('bank_key_wayin_wrapped')
  })

  it("serializes as its kind, token and scope alone, and shows no more as its own", async () => {
    const { bank, device } = await TH.buildBornBank()
    const gating = makeGating({ device, bank })
    expect(gating.toJSON()).to.deep.equal({ gatingkind: 'birth_bank', gatingTok: gating.gatingTok, ...TH.WorldScope })
    expect(TH.jsonOf(gating)).to.deep.equal(gating.toJSON())
    expect(Object.keys(gating)).to.have.members(['gatingkind', 'gatingTok', 'user_id', 'banklabel'])
    expect(Object.isFrozen(gating)).to.be.true
  })

  const OptsCases = [
    [{ gatingkind: 'build_bank' },  {},                                        'a gatingkind of the old core'],
    [{ gatingkind: 'unlock_bank' }, {},                                        'a gatingkind not built here'],
    [null,                          {},                                        'no record'],
    [{ gatingkind: 'birth_bank' },  { device: TH.provingDeviceOf() },          'a device that is not a Device'],
    [{ gatingkind: 'birth_bank' },  { attempt: 'birth' },                      'an attempt that is not a function'],
    [{ gatingkind: 'birth_bank' },  { askUser: undefined },                    'an askUser left undefined'],
    [{ gatingkind: 'birth_bank' },  { askUser: 'ask' },                        'an askUser that is not a function'],
  ] as const

  for (const [record, moved, blurb] of OptsCases) {
    it(`refuses ${blurb}`, () => {
      const opts = { device: TH.makeDevice(), bank: null, askUser: null, attempt: neverAttempts, ...moved }
      TH.expectSyncRefusal(() => Gating.make(record as never, opts as never), 'bad_option')
    })
  }
})

describe("gating.launch()", () => {
  it("opens the gating on its device, and resolves the bank an attempt lands", async () => {
    const { bank, device } = await TH.buildBornBank()
    const gating = makeGating({ device, attempt: attemptLanding(bank) })
    const launched = gating.launch()
    expect(device.openGating).to.equal(gating)
    await TH.expectGood(gating.attempt(cleartextsOf()))
    expect(await launched).to.equal(bank)
    expect(device.openGating).to.be.null
  })

  it("refuses while another gating is open on the device, leaving that one open", async () => {
    const device = TH.makeDevice()
    const first = makeGating({ device })
    const launched = TH.expectRefusal(first.launch(), 'dismissed')
    await TH.expectRefusal(makeGating({ device }).launch(), 'already_asking')
    expect(device.openGating).to.equal(first)
    expect(first.isOpen).to.be.true
    first.dismiss()
    await launched
  })

  it("refuses on a swept device", async () => {
    const device = TH.makeDevice()
    device.sweep()
    await TH.expectRefusal(makeGating({ device }).launch(), 'disabled')
  })

  it("rejects with its outcome once concluded, and leaves the device free for the next", async () => {
    const device = TH.makeDevice()
    const gating = makeGating({ device })
    gating.dismiss()
    await TH.expectRefusal(gating.launch(), 'dismissed')
    expect(device.openGating).to.be.null
    const next = makeGating({ device })
    const launched = TH.expectRefusal(next.launch(), 'dismissed')
    expect(device.openGating).to.equal(next)
    next.dismiss()
    await launched
  })

  it("concluding unlaunched leaves the gating open on the device as it was", async () => {
    const device = TH.makeDevice()
    const first = makeGating({ device })
    const launched = TH.expectRefusal(first.launch(), 'dismissed')
    makeGating({ device }).dismiss()
    expect(device.openGating).to.equal(first)
    first.dismiss()
    await launched
    expect(device.openGating).to.be.null
  })

  it("rejects with the refusal that concludes the gating", async () => {
    const { bank, device } = await TH.buildBornBank()
    const refusal = new Errors.VaultError('storage_unavailable', 'the disk is full')
    const gating = makeGating({ device, attempt: attemptLanding(bank, refusal) })
    const launched = TH.expectRefusal(gating.launch(), 'storage_unavailable')
    await TH.expectBad(gating.attempt(cleartextsOf()), 'storage_unavailable')
    expect(await launched).to.eq(refusal)
    expect(gating.isOpen).to.be.false
  })
})

describe("gating.attempt(cleartexts)", () => {
  it("lands: hands the attempt the cleartexts, concludes good, and zeroes the passkey answer", async () => {
    const { bank, device } = await TH.buildBornBank()
    const attempt = attemptLanding(bank)
    const gating = launchedGating({ device, attempt })
    const cleartexts = cleartextsOf()
    expect(await TH.expectGood(gating.attempt(cleartexts))).to.equal(bank)
    expect(attempt).toHaveBeenCalledExactlyOnceWith(cleartexts)
    expect(gating.isOpen).to.be.false
    expect(await TH.expectGood(gating.whenConcluded)).to.equal(bank)
    expect(TH.isZeroed(cleartexts.passkeyClear.prfBytes)).to.be.true
  })

  const CorrectableCases = [
    [new Errors.VaultError('wrong_passphrase', 'not it'), 'a wrong passphrase'],
    [new Errors.VaultError('weak_passphrase', 'too short'), 'a weak passphrase'],
    [new Errors.VaultError('wrong_passkey', 'not it'), 'a wrong passkey'],
  ] as const

  for (const [refusal, blurb] of CorrectableCases) {
    it(`stays open after ${blurb}, its passkey answer unspent, and the next attempt lands`, async () => {
      const { bank, device } = await TH.buildBornBank()
      const gating = launchedGating({ device, attempt: attemptLanding(bank, refusal) })
      const cleartexts = cleartextsOf()
      expect(await TH.expectBad(gating.attempt(cleartexts))).to.eq(refusal)
      expect(gating.isOpen).to.be.true
      expect(TH.isZeroed(cleartexts.passkeyClear.prfBytes)).to.be.false
      await TH.expectGood(gating.attempt(cleartexts))
      expect(gating.isOpen).to.be.false
    })
  }

  it("concludes on a refusal the user cannot correct, and zeroes the passkey answer", async () => {
    const { bank, device } = await TH.buildBornBank()
    const gating = launchedGating({ device, attempt: attemptLanding(bank, new Errors.VaultError('gate_made_elsewhere', 'taken')) })
    const cleartexts = cleartextsOf()
    await TH.expectBad(gating.attempt(cleartexts), 'gate_made_elsewhere')
    expect(gating.isOpen).to.be.false
    expect(TH.isZeroed(cleartexts.passkeyClear.prfBytes)).to.be.true
  })

  it("concludes on a throw that is not a refusal, as an unexpected error", async () => {
    const { bank, device } = await TH.buildBornBank()
    const gating = launchedGating({ device, attempt: attemptLanding(bank, new TypeError('a bug')) })
    await TH.expectBad(gating.attempt(cleartextsOf()), 'unexpected_error')
    expect(gating.isOpen).to.be.false
  })

  it("refuses a second attempt while one runs, zeroing its passkey answer, and the first lands", async () => {
    const { bank, device } = await TH.buildBornBank()
    const latch = TH.makeLatch()
    const gating = launchedGating({ device, attempt: async () => { await latch.pass(); return bank } })
    const attempting = gating.attempt(cleartextsOf())
    const second = cleartextsOf()
    await TH.expectBad(gating.attempt(second), 'attempt_in_flight')
    expect(TH.isZeroed(second.passkeyClear.prfBytes)).to.be.true
    latch.release()
    await TH.expectGood(attempting)
  })

  it("refuses before the gating is launched, without attempting, and zeroes the passkey answer it was given", async () => {
    const { bank, device } = await TH.buildBornBank()
    const attempt = attemptLanding(bank)
    const gating = makeGating({ device, attempt })
    const cleartexts = cleartextsOf()
    await TH.expectBad(gating.attempt(cleartexts), 'gating_unlaunched')
    expect(attempt).not.toHaveBeenCalled()
    expect(TH.isZeroed(cleartexts.passkeyClear.prfBytes)).to.be.true
    expect(gating.isOpen).to.be.true
    const launched = gating.launch()
    await TH.expectGood(gating.attempt(cleartextsOf()))
    expect(await launched).to.equal(bank)
  })

  it("refuses once concluded, without attempting, and zeroes the passkey answer it was given", async () => {
    const attempt = vi.fn(neverAttempts)
    const gating = makeGating({ attempt })
    gating.dismiss()
    const cleartexts = cleartextsOf()
    await TH.expectBad(gating.attempt(cleartexts), 'gating_concluded')
    expect(attempt).not.toHaveBeenCalled()
    expect(TH.isZeroed(cleartexts.passkeyClear.prfBytes)).to.be.true
  })

  it("zeroes a passkey answer from another realm", async () => {
    const { bank, device } = await TH.buildBornBank()
    const gating = launchedGating({ device, attempt: attemptLanding(bank) })
    const prfBytes = runInNewContext('new Uint8Array(32).fill(7)') as Uint8Array
    expect(prfBytes).to.not.be.instanceOf(Uint8Array)
    await TH.expectGood(gating.attempt({ passphraseClear: TH.TestPassphrase, passkeyClear: { ...TH.passkeyAnswerOf(), prfBytes } }))
    expect(TH.isZeroed(prfBytes)).to.be.true
  })

  it("zeroes a passkey answer handed as a bare ArrayBuffer", async () => {
    const gating = makeGating()
    gating.dismiss()
    const prfBuffer = new Uint8Array(32).fill(7).buffer
    await TH.expectBad(gating.attempt({ passphraseClear: TH.TestPassphrase, passkeyClear: { ...TH.passkeyAnswerOf(), prfBytes: prfBuffer as never } }), 'gating_concluded')
    expect(TH.isZeroed(new Uint8Array(prfBuffer))).to.be.true
  })

  it("keeps its outcome when reading the passkey answer to zero it throws", async () => {
    const { bank, device } = await TH.buildBornBank()
    const gating = launchedGating({ device, attempt: attemptLanding(bank) })
    const passkeyClear = { ...TH.passkeyAnswerOf(), get prfBytes(): Uint8Array { throw new Error(TH.TestPassphrase) } }
    expect(await TH.expectGood(gating.attempt({ passphraseClear: TH.TestPassphrase, passkeyClear }))).to.equal(bank)
  })
})

describe("gating.dismiss()", () => {
  it("concludes 'dismissed', letting the device go", async () => {
    const device = TH.makeDevice()
    const gating = makeGating({ device })
    const launched = TH.expectRefusal(gating.launch(), 'dismissed')
    gating.dismiss()
    await launched
    await TH.expectBad(gating.whenConcluded, 'dismissed')
    expect(gating.isOpen).to.be.false
    expect(device.openGating).to.be.null
  })

  it("lets an attempt under way run on, and its success concludes the gating", async () => {
    const { bank, device } = await TH.buildBornBank()
    const latch = TH.makeLatch()
    const gating = launchedGating({ device, attempt: async () => { await latch.pass(); return bank } })
    const attempting = gating.attempt(cleartextsOf())
    gating.dismiss()
    expect(gating.isOpen).to.be.true
    latch.release()
    await TH.expectGood(attempting)
    expect(await TH.expectGood(gating.whenConcluded)).to.equal(bank)
  })

  it("makes an attempt under way the last: its correctable refusal concludes the gating", async () => {
    const { device } = await TH.buildBornBank()
    const latch = TH.makeLatch()
    const gating = launchedGating({ device, attempt: async () => { await latch.pass(); throw new Errors.VaultError('wrong_passphrase', 'not it') } })
    const cleartexts = cleartextsOf()
    const attempting = gating.attempt(cleartexts)
    gating.dismiss()
    latch.release()
    await TH.expectBad(attempting, 'wrong_passphrase')
    await TH.expectBad(gating.whenConcluded, 'wrong_passphrase')
    expect(TH.isZeroed(cleartexts.passkeyClear.prfBytes)).to.be.true
  })

  it("changes nothing once the gating has concluded", async () => {
    const { bank, device } = await TH.buildBornBank()
    const gating = launchedGating({ device, attempt: attemptLanding(bank) })
    await TH.expectGood(gating.attempt(cleartextsOf()))
    gating.dismiss()
    gating.dismiss()
    await TH.expectGood(gating.whenConcluded)
  })
})

describe("a gating's host dialog", () => {
  it("is shown the gating", async () => {
    const shown: unknown[] = []
    const gating = makeGating({ askUser: guardRequestCleartext((asked) => { shown.push(asked) }) })
    await TH.expectRefusal(gating.launch(), 'dismissed')
    expect(shown).to.deep.equal([gating])
  })

  it("concludes the gating 'dismissed' when it returns with no attempt under way", async () => {
    const gating = makeGating({ askUser: guardRequestCleartext(() => undefined) })
    await TH.expectRefusal(gating.launch(), 'dismissed')
  })

  it("concludes the gating with a refusal quoting nothing when it throws", async () => {
    const gating = makeGating({ askUser: guardRequestCleartext(() => { throw new Error(TH.TestPassphrase) }) })
    const err = await TH.expectRefusal(gating.launch(), 'unexpected_error')
    expect(err.cause).to.be.undefined
    expect(TH.thrownText(err)).to.not.include(TH.TestPassphrase)
  })

  it("lets an attempt finish when it returns during it", async () => {
    const { bank, device } = await TH.buildBornBank()
    let attempting: Promise<unknown> = Promise.resolve()
    const askUser = guardRequestCleartext((asked) => { attempting = asked.attempt(cleartextsOf()) })
    const gating = makeGating({ device, askUser, attempt: attemptLanding(bank) })
    expect(await gating.launch()).to.equal(bank)
    await TH.expectGood(attempting as never)
  })
})

describe("gating.judgeStrength(passphraseClear)", () => {
  it("returns the verdict of its device's strength checker, and stays open", async () => {
    const gating = makeGating({ device: TH.makeDevice({}, { strengthChecker }) })
    expect(await gating.judgeStrength('weak')).to.deep.equal({ strong: false, reason: 'too short' })
    expect(await gating.judgeStrength(TH.TestPassphrase)).to.deep.equal({ strong: true })
    expect(gating.isOpen).to.be.true
  })

  it("rejects, rather than throws, a value that is not a string", async () => {
    await TH.expectRefusal(makeGating().judgeStrength(null as never))
  })
})

/** What a put told not to replace a live bank refuses with. */
const Camped = new Errors.VaultError('camped', 'a bank is stored here')

describe("birthBank(device, cleartexts)", () => {
  it("births an unlocked bank of the device's scope, its main gate with the passphrase's wayin", async () => {
    const put = TH.stubBankPut()
    const device = TH.makeDevice()
    const bank = await birthBank(device, { passphraseClear: TH.TestPassphrase })
    expect(bank.isUnlocked).to.be.true
    expect(bank.scope).to.deep.equal(TH.WorldScope)
    expect(bank.device).to.equal(device)
    expect(bank.maingate.main.wayinkind).to.eq('passphrase')
    expect(bank.maingate.passkey0).to.be.null
    expect(bank.revision_seq).to.eq(0)
    expect(put.banks).to.deep.equal([bank])
  })

  it("puts the bank, refusing a live one at its scope, before it unlocks", async () => {
    const put = TH.stubBankPut()
    await birthBank(TH.makeDevice(), { passphraseClear: TH.TestPassphrase })
    expect(put.spy).toHaveBeenCalledExactlyOnceWith({ ifPresent: 'fail' })
    expect(put.lockedAtPuts).to.deep.equal([true])
  })

  it("lays a passkey's wayin beside the passphrase's, opening the same bankKey", async () => {
    TH.stubBankPut()
    const answer = TH.passkeyAnswerOf()
    const prfBytes = new Uint8Array(answer.prfBytes)
    const bank = await birthBank(TH.makeDevice(), { passphraseClear: TH.TestPassphrase, passkeyClear: answer })
    expect(bank.maingate.passkey0).to.deep.include({ wayinkind: 'passkey', credential_id: answer.credential_id })
    const viaPassphrase = await TH._cheat_bankKeyBytesOf(bank.stamp, bank.maingate.stamp, bank.maingate.main, { passphrase: TH.TestPassphrase })
    expect(await TH._cheat_bankKeyBytesOf(bank.stamp, bank.maingate.stamp, bank.maingate.passkey0!, { prfBytes })).to.deep.equal(viaPassphrase)
  })

  it("mints a new life for each birth", async () => {
    TH.stubBankPut()
    const device = TH.makeDevice()
    const one = await birthBank(device, { passphraseClear: TH.TestPassphrase })
    const two = await birthBank(device, { passphraseClear: TH.TestPassphrase })
    expect(one.bank_tok).to.not.eq(two.bank_tok)
    expect(one.maingate.gate_tok).to.not.eq(two.maingate.gate_tok)
  })

  it("refuses when the put finds a live bank, leaving the bank it made locked", async () => {
    const put = TH.stubBankPut(() => Promise.reject(Camped))
    const err = await TH.expectRefusal(birthBank(TH.makeDevice(), { passphraseClear: TH.TestPassphrase }), 'gate_made_elsewhere')
    expect(err.message).to.match(/another device/)
    expect(put.banks[0]!.isLocked).to.be.true
  })

  it("passes any other refusal of the put as it came, leaving the bank locked", async () => {
    const refusal = new Errors.VaultError('storage_unavailable', 'the disk is full')
    const put = TH.stubBankPut(() => Promise.reject(refusal))
    const err = await TH.expectRefusal(birthBank(TH.makeDevice(), { passphraseClear: TH.TestPassphrase }))
    expect(err).to.eq(refusal)
    expect(put.banks[0]!.isLocked).to.be.true
  })

  it("passes the put's refusal in this layer, which stores nothing", async () => {
    const err = await TH.expectRefusal(birthBank(TH.makeDevice(), { passphraseClear: TH.TestPassphrase }), 'unexpected_error')
    expect(err.message).to.eq(PutNotBuilt)
  })

  it("refuses 'weak_passphrase' before it puts anything", async () => {
    const put = TH.stubBankPut()
    const device = TH.makeDevice({}, { strengthChecker: () => ({ strong: false, reason: 'too short' }) })
    await TH.expectRefusal(birthBank(device, { passphraseClear: TH.TestPassphrase }), 'weak_passphrase')
    expect(put.spy).not.toHaveBeenCalled()
  })

  it("finds every passphrase weak on a device with no strengthChecker, pointing the app's makers at the setting", async () => {
    TH.stubBankPut()
    const device = TH.makeDevice({}, { strengthChecker: undefined })
    const err = await TH.expectRefusal(birthBank(device, { passphraseClear: TH.TestPassphrase }), 'weak_passphrase')
    expect(err.message).to.include('notes/configuration.md')
  })

  const CleartextsCases = [
    [{ antePassphraseClear: TH.TestPassphrase, nextPassphraseClear: TH.TestPassphrase }, 'cleartexts meant for another kind of gating'],
    [{ passphraseClear: TH.TestPassphrase, stray: TH.TestPassphrase },                     'a stray field'],
    [{ passkeyClear: null },                                                                'no passphrase'],
    [{ passphraseClear: 42 },                                                              'a passphrase that is not a string'],
    [null,                                                                                 'no cleartexts at all'],
  ] as const

  for (const [cleartexts, blurb] of CleartextsCases) {
    it(`refuses ${blurb}, quoting no passphrase, before it puts anything`, async () => {
      const put = TH.stubBankPut()
      const err = await TH.expectRefusal(birthBank(TH.makeDevice(), cleartexts), 'bad_option')
      expect(TH.thrownText(err)).to.not.include(TH.TestPassphrase)
      expect(put.spy).not.toHaveBeenCalled()
    })
  }

  it("refuses a passkey answer whose PRF bytes are zeroed already", async () => {
    TH.stubBankPut()
    const passkeyClear = TH.passkeyAnswerOf({ prfBytes: new Uint8Array(32) })
    await TH.expectRefusal(birthBank(TH.makeDevice(), { passphraseClear: TH.TestPassphrase, passkeyClear }))
  })

  it("keeps a passphrase out of the refusal when a getter on the cleartexts throws it", async () => {
    const cleartexts = { get passphraseClear(): string { throw new Error(TH.TestPassphrase) } }
    const err = await TH.expectRefusal(birthBank(TH.makeDevice(), cleartexts), 'unexpected_error')
    expect(err.cause).to.be.undefined
    expect(TH.thrownText(err)).to.not.include(TH.TestPassphrase)
  })

  it("births a bank whose record is a first revision, never a shell", async () => {
    const put = TH.stubBankPut()
    await birthBank(TH.makeDevice(), { passphraseClear: TH.TestPassphrase })
    expect(put.banks[0]!.revision_tok).to.not.eq(SX.VoidRevisionTok)
  })
})
