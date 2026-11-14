/** The device: its options, the host's functions it wraps, its sweep, and the birth of its bank through a gating, over a stubbed `bank.put`. */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { Consts, Errors, Phrases } from 'safebyok-big/internals'
import { DefaultLeaseMillis, Device, guardRequestCleartext } from '../../src/models/device'
import type { Gating } from '../../src/models/gating'
import { PutNotBuilt } from '../../src/phrases'
import * as TH from '../test-helpers'

/** A host's dialog that types `passphrases` into the gating it is shown, one attempt each, until one lands, keeping each outcome. */
function typingDialog(...passphrases: string[]) {
  const outcomes: unknown[] = []
  const passkeyClears = passphrases.map(() => TH.passkeyAnswerOf())
  async function requestCleartext(gating: Gating): Promise<void> {
    for (const [ii, passphraseClear] of passphrases.entries()) {
      const outcome = await gating.attempt({ passphraseClear, passkeyClear: passkeyClears[ii]! })
      outcomes.push(outcome)
      if (! gating.isOpen) { return }
    }
  }
  return { requestCleartext, outcomes, passkeyClears }
}

/** A strength checker that finds `'weak'` weak and every other passphrase strong. */
function strengthChecker(passphrase: string) { return (passphrase === 'weak' ? { strong: false as const, reason: 'too short' } : { strong: true as const }) }

describe("a page that is not a secure context", () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it("refuses Device.make", () => {
    vi.stubGlobal('isSecureContext', false)
    const err = TH.expectSyncRefusal(() => TH.makeDevice(), 'insecure_context')
    expect(err.message).to.match(/https/)
  })

  it("makes a device in a secure context, or where the platform has no isSecureContext", () => {
    vi.stubGlobal('isSecureContext', true)
    expect(TH.makeDevice().isEnabled).to.be.true
    vi.stubGlobal('isSecureContext', undefined)
    expect(TH.makeDevice().isEnabled).to.be.true
  })
})

describe("Device.make(record, opts)", () => {
  it("makes an enabled device of the record's scope and token, opening no gating", () => {
    const device = TH.makeDevice()
    expect(device).to.include({ ...TH.WorldScope, device_tok: TH.DeviceTok })
    expect(device.scope).to.deep.equal(TH.WorldScope)
    expect(device.isEnabled).to.be.true
    expect(device.demandEnabled()).to.equal(device)
    expect(device.openGating).to.be.null
    expect(device.modelkind).to.eq('device')
  })

  it("serializes as its scope and token alone, and is frozen", () => {
    const device = TH.makeDevice()
    expect(TH.jsonOf(device)).to.deep.equal({ ...TH.WorldScope, device_tok: TH.DeviceTok })
    expect(device.toJSON()).to.deep.equal(TH.jsonOf(device))
    expect(Object.isFrozen(device)).to.be.true
  })

  it("wraps each of the host's functions, keeping none of the host's own on a property", () => {
    const requestCleartext = vi.fn()
    const device = TH.makeDevice({}, { requestCleartext })
    for (const guarded of [device.keyDeriver, device.strengthChecker]) { expect(Consts.isGuarded(guarded)).to.be.true }
    expect(Object.values(device)).to.not.include.members([requestCleartext, TH.testDeriver, TH.anyStrengthChecker])
  })

  it("takes a fraction of a minute to the nearest millisecond, and Infinity as ForeverMillis", () => {
    expect(TH.makeDevice({}, { autolockMinutes: 1 / 7 }).leaseMillis).to.eq(8571)
    expect(TH.makeDevice({}, { autolockMinutes: Infinity }).leaseMillis).to.eq(Consts.ForeverMillis)
    expect(TH.makeDevice({}, { autolockMinutes: 30 }).autolockMinutes).to.eq(30)
  })

  it("leases for DefaultLeaseMillis where the host names no autolockMinutes", () => {
    expect(TH.makeDevice({}, { autolockMinutes: undefined }).leaseMillis).to.eq(DefaultLeaseMillis)
  })

  it("warns through its logger of a test key deriver", () => {
    const warn = vi.fn()
    TH.makeDevice({}, { logger: { log: vi.fn(), warn, error: vi.fn() } })
    expect(warn.mock.calls[0]?.slice(0, 2)).to.deep.equal([Phrases.TestDeriverNotice, { oplabel: 'Device.make' }])
  })

  const OptsCases = [
    ['keyDeriver',       { keyDeriver: 3 }],
    ['strengthChecker',  { strengthChecker: 3 }],
    ['logger',           { logger: 3 }],
    ['requestCleartext', { requestCleartext: null }],
  ] as const

  for (const [fieldname, moved] of OptsCases) {
    it(`refuses a ${fieldname} of the wrong type, naming it`, () => {
      const err = TH.expectSyncRefusal(() => TH.makeDevice({}, moved as never), 'bad_option')
      expect(err.message.startsWith(`${fieldname}: `)).to.be.true
    })
  }

  const OtherOptsCases = [
    [{ autolockMinutes: 0 },     'an autolock of no minutes'],
    [{ autolockMinutes: -5 },    'an autolock of negative minutes'],
    [{ autolockMinutes: '30' },  'an autolock written as text'],
    [{ gates: ['main'] },        'an option of the old core'],
  ] as const

  for (const [moved, blurb] of OtherOptsCases) {
    it(`refuses ${blurb}`, () => {
      TH.expectSyncRefusal(() => TH.makeDevice({}, moved as never), 'bad_option')
    })
  }

  const RecordCases = [
    [{ device_tok: undefined },    'no device_tok'],
    [{ device_tok: 'device_one' }, 'a device_tok that is a label'],
    [{ banklabel: '' },            'an empty banklabel'],
    [{ user_id: 42 },              'a user_id that is not a string'],
  ] as const

  for (const [moved, blurb] of RecordCases) {
    it(`refuses a record with ${blurb}`, () => {
      TH.expectSyncRefusal(() => TH.makeDevice(moved as never))
    })
  }

  it("refuses no record, no opts, or opts with no keyDeriver", () => {
    TH.expectSyncRefusal(() => Device.make(null as never, { keyDeriver: TH.testDeriver }))
    TH.expectSyncRefusal(() => Device.make({ ...TH.WorldScope, device_tok: TH.DeviceTok }, undefined as never))
    TH.expectSyncRefusal(() => Device.make({ ...TH.WorldScope, device_tok: TH.DeviceTok }, {} as never))
  })
})

describe("guardRequestCleartext(requestCleartext)", () => {
  it("resolves true once the dialog returns, having shown it the gating", async () => {
    const gating = {} as Gating
    const dialog = vi.fn()
    const guarded = guardRequestCleartext(dialog)
    expect(Consts.isGuarded(guarded)).to.be.true
    expect(await guarded(gating)).to.be.true
    expect(dialog).toHaveBeenCalledExactlyOnceWith(gating)
  })

  it("waits on a dialog that returns a promise", async () => {
    const latch = TH.makeLatch()
    let isSettled = false
    async function settling(): Promise<boolean> {
      const answer = await guardRequestCleartext(() => latch.pass())({} as Gating)
      isSettled = true
      return answer
    }
    const asking = settling()
    await TH.wakeupAtNextTick()
    expect(isSettled).to.be.false
    latch.release()
    expect(await asking).to.be.true
  })

  it("resolves false, dropping what the dialog threw or rejected with", async () => {
    expect(await guardRequestCleartext(() => { throw new Error(TH.TestPassphrase) })({} as Gating)).to.be.false
    expect(await guardRequestCleartext(() => Promise.reject(new Error(TH.TestPassphrase)))({} as Gating)).to.be.false
  })

  it("refuses a dialog that is not a function, naming it", () => {
    const err = TH.expectSyncRefusal(() => guardRequestCleartext('ask' as never), 'bad_option')
    expect(err.message).to.match(/^requestCleartext: /)
  })
})

describe("device.sweep()", () => {
  it("disables the device for good, and never throws", () => {
    const device = TH.makeDevice()
    expect(device.sweep()).to.equal(device)
    expect(device.isEnabled).to.be.false
    TH.expectSyncRefusal(() => device.demandEnabled(), 'disabled')
    expect(device.sweep()).to.equal(device)
    expect(device.isEnabled).to.be.false
  })

  it("dismisses the gating open on the device", async () => {
    const device = TH.makeDevice()
    const prompting = TH.expectRefusal(device.birthBankPrompt(), 'dismissed')
    const gating = device.openGating!
    device.sweep()
    await prompting
    expect(gating.isOpen).to.be.false
    expect(device.openGating).to.be.null
  })

  it("lets an attempt under way finish as the gating's last, and no bank unlocks on the swept device", async () => {
    TH.stubBankPut()
    const latch = TH.makeLatch()
    const keyDeriver = { ...TH.testDeriver, deriveKeyBytes: async (passphrase: string, saltBytes: Uint8Array) => {
      await latch.pass()
      return TH.testDeriver.deriveKeyBytes(passphrase, saltBytes)
    } }
    const device = TH.makeDevice({}, { keyDeriver })
    const prompting = TH.expectRefusal(device.birthBankPrompt(), 'disabled')
    const gating = device.openGating!
    const attempting = gating.attempt({ passphraseClear: TH.TestPassphrase })
    device.sweep()
    expect(gating.isOpen).to.be.true
    latch.release()
    await TH.expectBad(attempting, 'disabled')
    await prompting
    expect(gating.isOpen).to.be.false
  })

  it("refuses a gating launched after it", async () => {
    const device = TH.makeDevice()
    device.sweep()
    await TH.expectRefusal(device.birthBankPrompt(), 'disabled')
    expect(device.openGating).to.be.null
  })
})

describe("device.birthBankPrompt()", () => {
  it("resolves an unlocked bank whose main gate has the wayins the dialog's attempt typed, and zeroes the passkey answer", async () => {
    TH.stubBankPut()
    const dialog = typingDialog(TH.TestPassphrase)
    const device = TH.makeDevice({}, { requestCleartext: dialog.requestCleartext })
    const bank = await device.birthBankPrompt()
    expect(bank.isUnlocked).to.be.true
    expect(bank.device).to.equal(device)
    expect(bank.maingate.main.wayinkind).to.eq('passphrase')
    expect(bank.maingate.passkey0).to.deep.include({ wayinkind: 'passkey', credential_id: dialog.passkeyClears[0]!.credential_id })
    expect(TH.isZeroed(dialog.passkeyClears[0]!.prfBytes)).to.be.true
    expect(device.openGating).to.be.null
    const box = await bank.sealBox(TH.boxAnteOf({ bank_tok: bank.bank_tok }), { whisper: TH.Whisper })
    const { whisper } = await bank.unsealBox(box)
    expect(whisper).to.deep.equal(TH.Whisper)
  })

  it("puts the bank, refusing a live one at its scope, before it unlocks", async () => {
    const put = TH.stubBankPut()
    const device = TH.makeDevice({}, { requestCleartext: typingDialog(TH.TestPassphrase).requestCleartext })
    const bank = await device.birthBankPrompt()
    expect(put.spy).toHaveBeenCalledExactlyOnceWith({ ifPresent: 'fail' })
    expect(put.banks).to.deep.equal([bank])
    expect(put.lockedAtPuts).to.deep.equal([true])
  })

  it("concludes the gating with a refusal when a live bank is stored at its scope, leaving no lease", async () => {
    const put = TH.stubBankPut(() => Promise.reject(new Errors.VaultError('camped', 'a bank is stored here')))
    const dialog = typingDialog(TH.TestPassphrase)
    const device = TH.makeDevice({}, { requestCleartext: dialog.requestCleartext })
    const err = await TH.expectRefusal(device.birthBankPrompt(), 'gate_made_elsewhere')
    expect(err.message).to.match(/another device/)
    expect(dialog.outcomes).to.have.lengthOf(1)
    await TH.expectBad(dialog.outcomes[0] as never, 'gate_made_elsewhere')
    expect(put.banks[0]!.isLocked).to.be.true
    expect(device.openGating).to.be.null
  })

  it("concludes the gating with any other refusal of the put, as it came", async () => {
    const refusal = new Errors.VaultError('storage_unavailable', 'the disk is full')
    const put = TH.stubBankPut(() => Promise.reject(refusal))
    const device = TH.makeDevice({}, { requestCleartext: typingDialog(TH.TestPassphrase).requestCleartext })
    expect(await TH.expectRefusal(device.birthBankPrompt(), 'storage_unavailable')).to.eq(refusal)
    expect(put.banks[0]!.isLocked).to.be.true
  })

  it("concludes the gating with the put's refusal in this layer, which stores nothing", async () => {
    const dialog = typingDialog(TH.TestPassphrase)
    const device = TH.makeDevice({}, { requestCleartext: dialog.requestCleartext })
    const err = await TH.expectRefusal(device.birthBankPrompt(), 'unexpected_error')
    expect(err.message).to.eq(PutNotBuilt)
    expect(dialog.outcomes).to.have.lengthOf(1)
  })

  it("stays open after a weak passphrase, its passkey answer unspent, and the next attempt lands", async () => {
    const put = TH.stubBankPut()
    const dialog = typingDialog('weak', TH.TestPassphrase)
    const device = TH.makeDevice({}, { strengthChecker, requestCleartext: dialog.requestCleartext })
    const bank = await device.birthBankPrompt()
    await TH.expectBad(dialog.outcomes[0] as never, 'weak_passphrase')
    expect(TH.isZeroed(dialog.passkeyClears[0]!.prfBytes)).to.be.false
    expect(bank.isUnlocked).to.be.true
    expect(put.spy).toHaveBeenCalledTimes(1)
  })

  it("concludes 'dismissed' when the dialog closes after weak passphrases alone", async () => {
    const put = TH.stubBankPut()
    const device = TH.makeDevice({}, { strengthChecker, requestCleartext: typingDialog('weak', 'weak').requestCleartext })
    await TH.expectRefusal(device.birthBankPrompt(), 'dismissed')
    expect(put.spy).not.toHaveBeenCalled()
  })

  it("waits, with no host dialog, for an attempt on the device's open gating", async () => {
    TH.stubBankPut()
    const device = TH.makeDevice()
    const prompting = device.birthBankPrompt()
    const gating = device.openGating!
    expect(gating.toJSON()).to.deep.equal({ gatingkind: 'birth_bank', gatingTok: gating.gatingTok, ...TH.WorldScope })
    await TH.wakeupAtNextTick()
    expect(gating.isOpen).to.be.true
    const bank = await TH.expectGood(gating.attempt({ passphraseClear: TH.TestPassphrase }))
    expect(await prompting).to.equal(bank)
  })

  it("waits, with no host dialog, for a dismiss of the device's open gating", async () => {
    const device = TH.makeDevice()
    const prompting = TH.expectRefusal(device.birthBankPrompt(), 'dismissed')
    device.openGating!.dismiss()
    await prompting
    expect(device.openGating).to.be.null
  })

  it("refuses a second prompt while one is open, leaving the first open", async () => {
    const device = TH.makeDevice()
    const first = TH.expectRefusal(device.birthBankPrompt(), 'dismissed')
    const gating = device.openGating!
    await TH.expectRefusal(device.birthBankPrompt(), 'already_asking')
    expect(device.openGating).to.equal(gating)
    gating.dismiss()
    await first
  })

  it("concludes with a refusal quoting nothing when the dialog throws", async () => {
    const device = TH.makeDevice({}, { requestCleartext: () => { throw new Error(TH.TestPassphrase) } })
    const err = await TH.expectRefusal(device.birthBankPrompt(), 'unexpected_error')
    expect(err.cause).to.be.undefined
    expect(TH.thrownText(err)).to.not.include(TH.TestPassphrase)
  })
})
