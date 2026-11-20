/** The attempts behind the bank's form verbs: `Bank.birth` over real provings and its device's MemoryVaultDB, and how every attempt spends the passkey answers it is handed, whatever its outcome. */

import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { Errors, SX } from 'safebyok-big/internals'
import { Bank } from '../../src/models/bank'
import type { Device } from '../../src/models/device'
import { Lease } from '../../src/models/lease'
import type { BirthBankAnswer } from '../../src/storage/vault-db'
import * as TH from '../test-helpers'

/** A bank born on `device` by `Bank.birth`, from `cleartexts` as the caller hands them. */
function birth(device: Device, cleartexts: unknown): Promise<Bank> { return Bank.birth(device, cleartexts as never) }

describe("Bank.birth(device, cleartexts)", () => {
  it("births an unlocked bank of the device's scope, its main gate with the passphrase's wayin", async () => {
    const device = TH.makeDevice()
    const births = TH.spyBirths(device)
    const bank = await birth(device, { passphraseClear: TH.TestPassphrase })
    expect(bank.isUnlocked).to.be.true
    expect(bank.scope).to.deep.equal(TH.ThingBank)
    expect(bank.device).to.equal(device)
    expect(bank.maingate.main.wayinkind).to.eq('passphrase')
    expect(bank.maingate.passkey0).to.be.null
    expect(bank.revseq).to.eq(0)
    expect(births.banks).to.deep.equal([bank])
  })

  it("births the bank, its main gate and its root box in one call to the vaultDB, before it unlocks", async () => {
    const device = TH.makeDevice()
    const births = TH.spyBirths(device)
    const bank = await birth(device, { passphraseClear: TH.TestPassphrase })
    expect(births.tryBirthBank).toHaveBeenCalledOnce()
    const [ask] = births.tryBirthBank.mock.calls[0]!
    expect(ask).to.deep.include({ op: 'birth', bank: bank.pickle(), gate: bank.maingate.pickle() })
    expect(ask.root).to.include({ labelpath: 'box', revseq: 0, am: 'a' })
    expect(births.lockedAtBirths).to.deep.equal([true])
  })

  it("lays a passkey's wayin beside the passphrase's, wrapping the same bankKey", async () => {
    const answer = TH.passkeyAnswerOf()
    const prfBytes = new Uint8Array(answer.prfBytes)
    const bank = await birth(TH.makeDevice(), { passphraseClear: TH.TestPassphrase, passkeyClear: answer })
    expect(bank.maingate.passkey0).to.deep.include({ wayinkind: 'passkey', credential_id: answer.credential_id })
    const viaPassphrase = await TH._cheat_bankKeyBytesOf(bank.stamp, bank.maingate.stamp, bank.maingate.main, { passphrase: TH.TestPassphrase })
    expect(await TH._cheat_bankKeyBytesOf(bank.stamp, bank.maingate.stamp, bank.maingate.passkey0!, { prfBytes })).to.deep.equal(viaPassphrase)
  })

  // A birth reads nothing stored, so every bank it makes is in its first life.
  it("mints a new bank and main gate revision for each birth, in their first lives", async () => {
    const one = await birth(TH.makeDevice(), { passphraseClear: TH.TestPassphrase })
    const two = await birth(TH.makeDevice(), { passphraseClear: TH.TestPassphrase })
    expect([one.lifeseq, two.lifeseq, one.maingate.lifeseq, two.maingate.lifeseq]).to.deep.equal([TH.Life0, TH.Life0, TH.Life0, TH.Life0])
    expect(one.revtok).to.not.eq(two.revtok)
    expect(one.maingate.revtok).to.not.eq(two.maingate.revtok)
  })

  it("refuses where a live bank is stored at its scope, as made elsewhere, leaving the bank it made locked and the stored one as it was", async () => {
    const device = TH.makeDevice()
    const stored = await birth(device, { passphraseClear: TH.TestPassphrase })
    const births = TH.spyBirths(device)
    const err = await TH.expectRefusal(birth(device, { passphraseClear: TH.TestPassphrase }), 'gate_made_elsewhere')
    expect(err.message).to.match(/another device/)
    expect(births.banks[0]!.isLocked).to.be.true
    const answer = await (births.tryBirthBank.mock.results[0]!.value as Promise<BirthBankAnswer>)
    expect(answer).to.deep.include({ ok: true, act: 'passed' })
    expect(answer.ok && answer.val.bank).to.deep.equal(stored.pickle())
  })

  it("passes any refusal of the vaultDB as it came, leaving the bank locked", async () => {
    const refusal = new Errors.VaultError('storage_unavailable', 'the disk is full')
    const device = TH.makeDevice()
    const births = TH.spyBirths(device, (ask) => Promise.resolve({ ok: false, ask, act: 'unclassified_storing', world: null, dbhas: null, err: refusal }))
    const err = await TH.expectRefusal(birth(device, { passphraseClear: TH.TestPassphrase }))
    expect(err).to.eq(refusal)
    expect(births.banks[0]!.isLocked).to.be.true
  })

  it("refuses 'weak_passphrase' before it makes a bank", async () => {
    const device = TH.makeDevice({}, { strengthChecker: () => ({ strong: false, reason: 'too short' }) })
    const births = TH.spyBirths(device)
    await TH.expectRefusal(birth(device, { passphraseClear: TH.TestPassphrase }), 'weak_passphrase')
    expect(births.banks).to.be.empty
    expect(births.tryBirthBank).not.toHaveBeenCalled()
  })

  it("finds every passphrase weak on a device with no strengthChecker, pointing the app's makers at the setting", async () => {
    const device = TH.makeDevice({}, { strengthChecker: undefined })
    const err = await TH.expectRefusal(birth(device, { passphraseClear: TH.TestPassphrase }), 'weak_passphrase')
    expect(err.message).to.include('notes/configuration.md')
  })

  const CleartextsCases = [
    [{ passphraseClear: TH.TestPassphrase, nextPassphraseClear: TH.TestPassphrase },     'cleartexts meant for another form verb'],
    [{ passphraseClear: TH.TestPassphrase, stray: TH.TestPassphrase },                     'a stray field'],
    [{ passkeyClear: null },                                                                'no passphrase'],
    [{ passphraseClear: 42 },                                                              'a passphrase that is not a string'],
    [null,                                                                                 'no cleartexts at all'],
  ] as const

  for (const [cleartexts, blurb] of CleartextsCases) {
    it(`refuses ${blurb}, quoting no passphrase, before it makes a bank`, async () => {
      const device = TH.makeDevice()
      const births = TH.spyBirths(device)
      const err = await TH.expectRefusal(birth(device, cleartexts), 'bad_record')
      expect(TH.thrownText(err)).to.not.include(TH.TestPassphrase)
      expect(births.banks).to.be.empty
    })
  }

  it("refuses a passkey answer whose PRF bytes are zeroed already", async () => {
    const passkeyCleartext = TH.passkeyAnswerOf({ prfBytes: new Uint8Array(32) })
    await TH.expectRefusal(birth(TH.makeDevice(), { passphraseClear: TH.TestPassphrase, passkeyClear: passkeyCleartext }))
  })

  it("keeps a passphrase out of the refusal when a getter on the cleartexts throws it", async () => {
    const cleartexts = { get passphraseClear(): string { throw new Error(TH.TestPassphrase) } }
    const err = await TH.expectRefusal(birth(TH.makeDevice(), cleartexts), 'unexpected_error')
    expect(err.cause).to.be.undefined
    expect(TH.thrownText(err)).to.not.include(TH.TestPassphrase)
  })

  it("seals the root box under the new lease, and holds the root box the vaultDB answers", async () => {
    const device = TH.makeDevice()
    const births = TH.spyBirths(device)
    const bank = await birth(device, { passphraseClear: TH.TestPassphrase })
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
    const bank = await birth(device, { passphraseClear: TH.TestPassphrase })
    const answer = await (births.tryBirthBank.mock.results[0]!.value as Promise<BirthBankAnswer>)
    expect(answer).to.include({ ok: true, act: 'passed' })
    expect(bank.isUnlocked).to.be.true
    expect(bank.rootBox).to.deep.equal(answer.ok && answer.val.root)
  })

  it("evicts the lease it built where the bank stored is another's, or the vaultDB refuses", async () => {
    const device = TH.makeDevice()
    await birth(device, { passphraseClear: TH.TestPassphrase })
    const evict = vi.spyOn(Lease.prototype, 'evict')
    await TH.expectRefusal(birth(device, { passphraseClear: TH.TestPassphrase }), 'gate_made_elsewhere')
    expect(evict).toHaveBeenCalledTimes(1)
    const refusal = new Errors.VaultError('storage_unavailable', 'the disk is full')
    TH.spyBirths(device, (ask) => Promise.resolve({ ok: false, ask, act: 'unclassified_storing', world: null, dbhas: null, err: refusal }))
    await TH.expectRefusal(birth(device, { passphraseClear: TH.TestPassphrase }), 'storage_unavailable')
    expect(evict).toHaveBeenCalledTimes(2)
  })

  it("births a bank and root box whose records are first revisions, never shells", async () => {
    const bank = await birth(TH.makeDevice(), { passphraseClear: TH.TestPassphrase })
    expect([bank.revtok, bank.rootBox.revtok]).to.not.include(SX.VoidRevisionTok)
    expect([bank.revseq, bank.rootBox.revseq]).to.deep.equal([0, 0])
  })
})

describe("Bank.birth(device, cleartexts): what it refuses before it derives a key", () => {
  it("refuses a device that is not a Device, spending the passkey answer", async () => {
    const passkeyCleartext = TH.passkeyAnswerOf()
    await TH.expectRefusal(birth(TH.provingDeviceOf() as never, { passphraseClear: TH.TestPassphrase, passkeyClear: passkeyCleartext }), 'bad_record')
    expect(TH.isZeroed(passkeyCleartext.prfBytes)).to.be.true
  })

  it("refuses on a swept device, writing nothing and spending the passkey answer", async () => {
    const device = TH.makeDevice()
    const births = TH.spyBirths(device)
    device.sweep()
    const passkeyCleartext = TH.passkeyAnswerOf()
    await TH.expectRefusal(birth(device, { passphraseClear: TH.TestPassphrase, passkeyClear: passkeyCleartext }), 'disabled')
    expect(births.banks).to.be.empty
    expect(TH.isZeroed(passkeyCleartext.prfBytes)).to.be.true
  })

  it("judges the passphrase with the device's own strength check", async () => {
    const device = TH.makeDevice({}, { strengthChecker: (passphrase: string) => (passphrase === 'weak' ? { strong: false, reason: 'too short' } : { strong: true }) })
    expect(await device.judgeStrength('weak')).to.deep.equal({ strong: false, reason: 'too short' })
    const err = await TH.expectRefusal(birth(device, { passphraseClear: 'weak' }), 'weak_passphrase')
    expect(err.message).to.eq('too short')
  })
})

describe("an attempt's spending of the passkey answers it is handed", () => {
  it("zeroes the answer once a birth lands", async () => {
    const passkeyCleartext = TH.passkeyAnswerOf()
    await birth(TH.makeDevice(), { passphraseClear: TH.TestPassphrase, passkeyClear: passkeyCleartext })
    expect(TH.isZeroed(passkeyCleartext.prfBytes)).to.be.true
  })

  it("zeroes the answer when the birth is refused", async () => {
    const device = TH.makeDevice({}, { strengthChecker: () => ({ strong: false, reason: 'too short' }) })
    const passkeyCleartext = TH.passkeyAnswerOf()
    await TH.expectRefusal(birth(device, { passphraseClear: TH.TestPassphrase, passkeyClear: passkeyCleartext }), 'weak_passphrase')
    expect(TH.isZeroed(passkeyCleartext.prfBytes)).to.be.true
  })

  it("zeroes the answer when the cleartexts fail their check", async () => {
    const passkeyCleartext = TH.passkeyAnswerOf()
    await TH.expectRefusal(birth(TH.makeDevice(), { passkeyClear: passkeyCleartext, stray: true }), 'bad_record')
    expect(TH.isZeroed(passkeyCleartext.prfBytes)).to.be.true
  })

  it("zeroes a passkey answer from another realm", async () => {
    const prfBytes = runInNewContext('new Uint8Array(32).fill(7)') as Uint8Array
    expect(prfBytes).to.not.be.instanceOf(Uint8Array)
    await birth(TH.makeDevice(), { passphraseClear: TH.TestPassphrase, passkeyClear: { ...TH.passkeyAnswerOf(), prfBytes } })
    expect(TH.isZeroed(prfBytes)).to.be.true
  })

  it("zeroes a passkey answer handed as a bare ArrayBuffer", async () => {
    const prfBuffer = new Uint8Array(32).fill(7).buffer
    // Whether the check accepts a bare buffer is not this test's subject: the bytes are spent either way.
    await Bank.tryBirth(TH.makeDevice(), { passphraseClear: TH.TestPassphrase, passkeyClear: { ...TH.passkeyAnswerOf(), prfBytes: prfBuffer as never } })
    expect(TH.isZeroed(new Uint8Array(prfBuffer))).to.be.true
  })

  it("keeps its outcome when reading the passkey answer to zero it throws", async () => {
    const passkeyCleartext = { ...TH.passkeyAnswerOf(), get prfBytes(): Uint8Array { throw new Error(TH.TestPassphrase) } }
    const err = await TH.expectRefusal(birth(TH.makeDevice(), { passphraseClear: TH.TestPassphrase, passkeyClear: passkeyCleartext }), 'unexpected_error')
    expect(TH.thrownText(err)).to.not.include(TH.TestPassphrase)
  })
})
