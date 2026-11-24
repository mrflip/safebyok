/** The gatings behind the bank's form verbs: `Bank.birth` over real provings and its device's MemoryVaultDB, how a gating adopts, redacts and vacates its cleartexts, and its single attempt. */

import { inspect } from 'node:util'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { Errors, GX, SX } from 'safebyok-big/internals'
import { Bank } from '../../src/models/bank'
import type { Device } from '../../src/models/device'
import { Gate } from '../../src/models/gate'
import { BirthGating, Gating, UnlockGating } from '../../src/models/gating'
import { Lease } from '../../src/models/lease'
import type { GatingCleartexts } from '../../src/shapes/shapes-gateish'
import type { BirthBankAnswer } from '../../src/storage/vault-db'
import * as TH from '../test-helpers'
import { readTcNow } from '../../src/storage/thing-classifier'

/** A bank born on `device` by `Bank.birth`, once the device has signed in, from `cleartexts` as the caller hands them. */
async function birth(device: Device, cleartexts: unknown): Promise<Bank> {
  await device.signin(TH.WorldScope.userid)
  return await Bank.birth(device, cleartexts as never)
}

/** Expect `device` to have no bank, the bank Thing its world keeps holding the shell its sign-in found. */
function expectNoBankBorn(device: Device): void {
  expect(device.bank).to.be.null
  expect(device.world.bank?.pickle()).to.deep.equal(TH.bankShellOf())
}

describe("Bank.birth(device, cleartexts)", () => {
  it("births an unlocked bank of the device's scope, its main gate with the passphrase's wayin", async () => {
    const device = TH.makeDevice()
    const births = TH.spyBirths(device)
    const bank = await birth(device, { passphraseCleartext: TH.TestPassphrase })
    expect(bank.isUnlocked).to.be.true
    expect(bank.scope).to.deep.equal(TH.ThingBank)
    expect(bank.device).to.equal(device)
    expect(bank.gate.main.wayinkind).to.eq('passphrase')
    expect(bank.gate.passkey0).to.be.null
    expect(bank.revseq).to.eq(0)
    expect(births.banks).to.deep.equal([bank])
  })

  it("births the bank, its main gate and its root box in one call to the vaultDB, its ask carrying the new bank's lifetok", async () => {
    const device = TH.makeDevice()
    const births = TH.spyBirths(device)
    const bank = await birth(device, { passphraseCleartext: TH.TestPassphrase })
    expect(births.tryBirthBank).toHaveBeenCalledOnce()
    const [ask] = births.tryBirthBank.mock.calls[0]!
    expect(ask).to.deep.include({ op: 'birth', bank: bank.pickle(), gate: bank.gate.pickle(), banktok: bank.lifetok })
    expect(ask.root).to.include({ labelpath: 'box', revseq: 0, am: 'a' })
  })

  it("lays a passkey's wayin beside the passphrase's, wrapping the same bankKey", async () => {
    const answer = TH.passkeyAnswerOf()
    const prfBytes = new Uint8Array(answer.prfBytes)
    const bank = await birth(TH.makeDevice(), { passphraseCleartext: TH.TestPassphrase, passkeyCleartext: answer })
    expect(bank.gate.passkey0).to.deep.include({ wayinkind: 'passkey', credential_id: answer.credential_id })
    const viaPassphrase = await TH._cheat_bankKeyBytesOf(bank.stamp, bank.gate.stamp, bank.gate.main, { passphrase: TH.TestPassphrase })
    expect(await TH._cheat_bankKeyBytesOf(bank.stamp, bank.gate.stamp, bank.gate.passkey0!, { prfBytes })).to.deep.equal(viaPassphrase)
  })

  // A birth reads nothing stored, so every bank it makes is in its first life.
  it("mints a new bank and main gate revision for each birth, in their first lives", async () => {
    const one = await birth(TH.makeDevice(), { passphraseCleartext: TH.TestPassphrase })
    const two = await birth(TH.makeDevice(), { passphraseCleartext: TH.TestPassphrase })
    expect([one.lifeseq, two.lifeseq, one.gate.lifeseq, two.gate.lifeseq]).to.deep.equal([TH.Life0, TH.Life0, TH.Life0, TH.Life0])
    expect(one.revtok).to.not.eq(two.revtok)
    expect(one.gate.revtok).to.not.eq(two.gate.revtok)
  })

  it("refuses where a live bank is stored at its scope, making no bank and leaving the stored one unchanged", async () => {
    const device = TH.makeDevice()
    const stored = await birth(device, { passphraseCleartext: TH.TestPassphrase })
    const births = TH.spyBirths(device)
    const err = await TH.expectRefusal(birth(device, { passphraseCleartext: TH.TestPassphrase }), 'gate_made_elsewhere')
    expect(err.message).to.match(/another device/)
    expect(births.banks).to.be.empty
    const answer = await (births.tryBirthBank.mock.results[0]!.value as Promise<BirthBankAnswer>)
    expect(answer).to.deep.include({ ok: true, act: 'passed' })
    expect(answer.ok && answer.val.bank).to.deep.equal(stored.pickle())
  })

  it("passes any refusal of the vaultDB on unchanged, making no bank", async () => {
    const refusal = new Errors.VaultError('storage_unavailable', 'the disk is full')
    const device = TH.makeDevice()
    TH.spyBirths(device, (ask) => Promise.resolve({ ok: false, ask, act: 'unclassified_storing', world: null, banktok: null, read_tc: readTcNow(), dbhas: null, err: refusal }))
    const err = await TH.expectRefusal(birth(device, { passphraseCleartext: TH.TestPassphrase }))
    expect(err).to.eq(refusal)
    expectNoBankBorn(device)
  })

  it("refuses 'weak_passphrase' before it makes a bank", async () => {
    const device = TH.makeDevice({}, { strengthChecker: () => ({ strong: false, reason: 'too short' }) })
    const births = TH.spyBirths(device)
    await TH.expectRefusal(birth(device, { passphraseCleartext: TH.TestPassphrase }), 'weak_passphrase')
    expectNoBankBorn(device)
    expect(births.tryBirthBank).not.toHaveBeenCalled()
  })

  it("finds every passphrase weak on a device with no strengthChecker, pointing the app's makers at the setting", async () => {
    const device = TH.makeDevice({}, { strengthChecker: undefined })
    const err = await TH.expectRefusal(birth(device, { passphraseCleartext: TH.TestPassphrase }), 'weak_passphrase')
    expect(err.message).to.include('notes/configuration.md')
  })

  const CleartextsCases = [
    [{ passphraseCleartext: TH.TestPassphrase, nextPassphraseCleartext: TH.TestPassphrase },       'cleartexts meant for another form verb'],
    [{ passphraseCleartext: TH.TestPassphrase, stray: TH.TestPassphrase },                     'a stray field'],
    [{ passkeyCleartext: null },                                                                'no passphrase'],
    [{ passphraseCleartext: 42 },                                                              'a passphrase that is not a string'],
    [null,                                                                                 'no cleartexts at all'],
  ] as const

  for (const [cleartexts, blurb] of CleartextsCases) {
    it(`refuses ${blurb}, quoting no passphrase, before it makes a bank`, async () => {
      const device = TH.makeDevice()
      const err = await TH.expectRefusal(birth(device, cleartexts), 'bad_record')
      expect(TH.thrownText(err)).to.not.include(TH.TestPassphrase)
      expectNoBankBorn(device)
    })
  }

  it("refuses a passkey answer whose PRF bytes are zeroed already", async () => {
    const passkeyCleartext = TH.passkeyAnswerOf({ prfBytes: new Uint8Array(32) })
    await TH.expectRefusal(birth(TH.makeDevice(), { passphraseCleartext: TH.TestPassphrase, passkeyCleartext }))
  })

  it("keeps a passphrase out of the refusal when a getter on the cleartexts throws it", async () => {
    const cleartexts = { get passphraseCleartext(): string { throw new Error(TH.TestPassphrase) } }
    const err = await TH.expectRefusal(birth(TH.makeDevice(), cleartexts), 'unexpected_error')
    expect(err.cause).to.be.undefined
    expect(TH.thrownText(err)).to.not.include(TH.TestPassphrase)
  })

  it("seals the root box under the new lease, and adopts the root box the vaultDB answers", async () => {
    const device = TH.makeDevice()
    const births = TH.spyBirths(device)
    const bank = await birth(device, { passphraseCleartext: TH.TestPassphrase })
    const answer = await (births.tryBirthBank.mock.results[0]!.value as Promise<BirthBankAnswer>)
    expect(answer).to.include({ ok: true, act: 'born' })
    if (! answer.ok) { throw answer.err }
    expect(answer.val.root).to.include({ ...TH.RootScope, revseq: 0, am: 'a', lifeseq: TH.Life0, lifepath: TH.Life0 })
    expect(bank.rootBox).to.deep.equal(answer.val.root)
    expect(await bank.device.vault!.unsealBox(answer.val.root)).to.deep.include({ whisper: {} })
  })

  // The vaultDB answers retcon, not passed, to a birth it stored already; passed on this bank is a vaultDB's answer alone.
  it("unlocks where the vaultDB passes on this same bank, adopting the root box it answers", async () => {
    const device = TH.makeDevice()
    const tryBirthBank = device.vaultDB.tryBirthBank.bind(device.vaultDB)
    const births = TH.spyBirths(device, async (ask) => {
      const born = await tryBirthBank(ask)
      return born.ok ? { ...born, act: 'passed' } : born
    })
    const bank = await birth(device, { passphraseCleartext: TH.TestPassphrase })
    const answer = await (births.tryBirthBank.mock.results[0]!.value as Promise<BirthBankAnswer>)
    expect(answer).to.include({ ok: true, act: 'passed' })
    expect(bank.isUnlocked).to.be.true
    expect(bank.rootBox).to.deep.equal(answer.ok && answer.val.root)
  })

  it("evicts the lease it built where the bank stored is another's, or the vaultDB refuses", async () => {
    const device = TH.makeDevice()
    await birth(device, { passphraseCleartext: TH.TestPassphrase })
    const evict = vi.spyOn(Lease.prototype, 'evict')
    await TH.expectRefusal(birth(device, { passphraseCleartext: TH.TestPassphrase }), 'gate_made_elsewhere')
    expect(evict).toHaveBeenCalledTimes(1)
    const refusal = new Errors.VaultError('storage_unavailable', 'the disk is full')
    TH.spyBirths(device, (ask) => Promise.resolve({ ok: false, ask, act: 'unclassified_storing', world: null, banktok: null, read_tc: readTcNow(), dbhas: null, err: refusal }))
    await TH.expectRefusal(birth(device, { passphraseCleartext: TH.TestPassphrase }), 'storage_unavailable')
    expect(evict).toHaveBeenCalledTimes(2)
  })

  it("births a bank and root box whose records are first revisions, never shells", async () => {
    const bank = await birth(TH.makeDevice(), { passphraseCleartext: TH.TestPassphrase })
    expect([bank.revtok, bank.rootBox.revtok]).to.not.include(SX.VoidRevisionTok)
    expect([bank.revseq, bank.rootBox.revseq]).to.deep.equal([0, 0])
  })

  it("makes no gate before the bank's main gate, the one its device's world keeps, unlocked", async () => {
    const make = vi.spyOn(Gate, 'make')
    const device = TH.makeDevice()
    const bank = await birth(device, { passphraseCleartext: TH.TestPassphrase })
    expect(make).toHaveBeenCalledOnce()
    expect(make.mock.results[0]!.value).to.equal(bank.gate)
    expect(bank.gate).to.equal(device.world.gate)
    expect(bank.gate.isUnlocked).to.be.true
  })

})

describe("Bank.birth(device, cleartexts): what it refuses before it derives a key", () => {
  it("refuses a device that is not a Device", async () => {
    await TH.expectRefusal(Bank.birth(TH.provingDeviceOf() as never, { passphraseCleartext: TH.TestPassphrase }), 'bad_record')
  })

  it("refuses a device whose `signin` has not answered, writing nothing", async () => {
    const device = TH.makeDevice()
    const births = TH.spyBirths(device)
    await TH.expectRefusal(Bank.birth(device, { passphraseCleartext: TH.TestPassphrase }), 'disabled')
    expect(births.tryBirthBank).not.toHaveBeenCalled()
  })

  it("judges the passphrase with the device's own strength check", async () => {
    const device = TH.makeDevice({}, { strengthChecker: (passphrase: string) => (passphrase === 'weak' ? { strong: false, reason: 'too short' } : { strong: true }) })
    expect(await device.judgeStrength('weak')).to.deep.equal({ strong: false, reason: 'too short' })
    const err = await TH.expectRefusal(birth(device, { passphraseCleartext: 'weak' }), 'weak_passphrase')
    expect(err.message).to.eq('too short')
  })
})

describe("a gating's vacating of the passkey answers it is handed", () => {
  it("zeroes the answer once a birth lands", async () => {
    const passkeyCleartext = TH.passkeyAnswerOf()
    await birth(TH.makeDevice(), { passphraseCleartext: TH.TestPassphrase, passkeyCleartext })
    expect(TH.isZeroed(passkeyCleartext.prfBytes)).to.be.true
  })

  it("zeroes the answer when the birth is refused", async () => {
    const device = TH.makeDevice({}, { strengthChecker: () => ({ strong: false, reason: 'too short' }) })
    const passkeyCleartext = TH.passkeyAnswerOf()
    await TH.expectRefusal(birth(device, { passphraseCleartext: TH.TestPassphrase, passkeyCleartext }), 'weak_passphrase')
    expect(TH.isZeroed(passkeyCleartext.prfBytes)).to.be.true
  })

  it("zeroes the answer when the cleartexts fail their check", async () => {
    const passkeyCleartext = TH.passkeyAnswerOf()
    await TH.expectRefusal(birth(TH.makeDevice(), { passkeyCleartext, stray: true }), 'bad_record')
    expect(TH.isZeroed(passkeyCleartext.prfBytes)).to.be.true
  })

  it("zeroes a passkey answer from another realm", async () => {
    const prfBytes = runInNewContext('new Uint8Array(32).fill(7)') as Uint8Array
    expect(prfBytes).to.not.be.instanceOf(Uint8Array)
    await birth(TH.makeDevice(), { passphraseCleartext: TH.TestPassphrase, passkeyCleartext: { ...TH.passkeyAnswerOf(), prfBytes } })
    expect(TH.isZeroed(prfBytes)).to.be.true
  })

  // Refused at the entry point, before any gating exists, so the answer is the host's to zero.
  it("leaves the answer live where `Bank.birth` is handed a device that is not a Device", async () => {
    const passkeyCleartext = TH.passkeyAnswerOf()
    await TH.expectRefusal(Bank.birth(TH.provingDeviceOf() as never, { passphraseCleartext: TH.TestPassphrase, passkeyCleartext }), 'bad_record')
    expect(TH.isZeroed(passkeyCleartext.prfBytes)).to.be.false
  })

  it("zeroes a passkey answer handed as a bare ArrayBuffer", async () => {
    const prfBuffer = new Uint8Array(32).fill(7).buffer
    const device = TH.makeDevice()
    await device.signin(TH.WorldScope.userid)
    // Whether the check accepts a bare buffer is not this test's subject: the bytes are vacated either way.
    await device.birthGating({ passphrase: TH.TestPassphrase, passkeyAnswer: { ...TH.passkeyAnswerOf(), prfBytes: prfBuffer as never } }).tryAttempt()
    expect(TH.isZeroed(new Uint8Array(prfBuffer))).to.be.true
  })
})

describe("Bank.birthGating(device, cleartexts)", () => {
  it("births the bank its device then shows, unlocked", async () => {
    const device = TH.makeDevice()
    await device.signin(TH.WorldScope.userid)
    const bank = await Bank.birthGating(device, { passphraseCleartext: TH.TestPassphrase }).attempt()
    expect(bank.isUnlocked).to.be.true
    expect(device.bank).to.equal(bank)
  })

  it("refuses a device that is not one", () => {
    TH.expectSyncRefusal(() => Bank.birthGating({ scope: TH.WorldScope } as never, { passphraseCleartext: TH.TestPassphrase }), 'bad_record')
  })
})

/** A passphrase, an obvious fake. */
const FakePassphrase = 'fake passphrase'

/** A new passphrase, an obvious fake. */
const FakeNextPassphrase = 'fake next passphrase'

/** A birth gating over `cleartexts` as the caller hands them, on a fresh device. */
function gatingOf(cleartexts: unknown): BirthGating { return Bank.birthGating(TH.makeDevice(), cleartexts as never) }

/** What a gating over `cleartexts` hands its body: a clone, taken in the body, before the attempt vacates what it adopted. */
async function adoptedFrom(cleartexts: unknown): Promise<unknown> {
  let adopted: unknown
  await TH._cheat_gatingOf(cleartexts, (given) => { adopted = structuredClone(given); return Promise.resolve() }).attempt()
  return adopted
}

describe("Bank.birthGating(device, cleartexts): what a gating adopts", () => {
  it("is a Gating", () => {
    expect(gatingOf({ passphraseCleartext: FakePassphrase })).to.be.instanceOf(Gating)
  })

  it("hands its body each cleartext it adopted, and no field it was not given", async () => {
    expect(await adoptedFrom({ passphraseCleartext: FakePassphrase, nextPassphraseCleartext: FakeNextPassphrase })).to.deep.equal({ passphraseCleartext: FakePassphrase, nextPassphraseCleartext: FakeNextPassphrase })
  })

  it("hands its body a passkey answer of null as null", async () => {
    expect(await adoptedFrom({ passphraseCleartext: FakePassphrase, passkeyCleartext: null })).to.deep.equal({ passphraseCleartext: FakePassphrase, passkeyCleartext: null })
  })

  it("zeroes the PRF bytes of each passkey answer handed in, after copying them for itself", async () => {
    const passkeyCleartext     = TH.passkeyAnswerOf()
    const nextPasskeyCleartext = TH.passkeyAnswerOf()
    const handed = [passkeyCleartext, nextPasskeyCleartext].map((answer) => ({ ...answer, prfBytes: new Uint8Array(answer.prfBytes) }))
    const adopted = await adoptedFrom({ passkeyCleartext, nextPasskeyCleartext })
    expect([TH.isZeroed(passkeyCleartext.prfBytes), TH.isZeroed(nextPasskeyCleartext.prfBytes)]).to.deep.equal([true, true])
    expect(adopted).to.deep.equal({ passkeyCleartext: handed[0], nextPasskeyCleartext: handed[1] })
  })

  it("adopts a passkey answer from another realm", async () => {
    const prfBytes = runInNewContext('new Uint8Array(32).fill(7)') as Uint8Array
    const adopted = await adoptedFrom({ passkeyCleartext: { ...TH.passkeyAnswerOf(), prfBytes } }) as { passkeyCleartext: GX.PasskeyAnswer }
    expect(TH.isZeroed(prfBytes)).to.be.true
    expect([...adopted.passkeyCleartext.prfBytes]).to.deep.equal(Array.from({ length: 32 }, () => 7))
  })

  it("zeroes the PRF bytes it copied when the cleartexts fail their check", () => {
    const handed = TH.passkeyAnswerOf()
    const fill   = vi.spyOn(Uint8Array.prototype, 'fill')
    onTestFinished(() => { fill.mockRestore() })
    TH.expectSyncRefusal(() => gatingOf({ passkeyCleartext: handed, stray: true }), 'bad_record')
    // The host's bytes are zeroed through a view of their own buffer; the gating's copy has a buffer of its own.
    const copies = (fill.mock.contexts as Uint8Array[]).filter((bytes) => bytes.buffer !== handed.prfBytes.buffer)
    expect(copies.map((bytes) => TH.isZeroed(bytes))).to.deep.equal([true])
  })

  it("refuses what is not an object", () => {
    for (const notObject of [null, undefined, FakePassphrase, 42, [FakePassphrase]]) {
      TH.expectSyncRefusal(() => gatingOf(notObject), 'bad_record')
    }
  })

  it("refuses a field no form verb takes, quoting nothing of it", () => {
    const err = TH.expectSyncRefusal(() => gatingOf({ passphraseCleartext: FakePassphrase, passphrase: FakeNextPassphrase }), 'bad_record')
    expect(TH.thrownText(err)).to.not.include(FakePassphrase).and.not.include(FakeNextPassphrase)
  })

  it("refuses cleartexts whose getter throws, carrying nothing of the throw", () => {
    const cleartexts = { get passphraseCleartext(): string { throw new Error(FakePassphrase) } }
    const err = TH.expectSyncRefusal(() => gatingOf(cleartexts), 'unexpected_error')
    expect(TH.thrownText(err)).to.not.include(FakePassphrase)
  })

  it("refuses a passkey answer whose PRF bytes' getter throws, carrying nothing of the throw", () => {
    const passkeyCleartext = { ...TH.passkeyAnswerOf(), get prfBytes(): Uint8Array { throw new Error(FakePassphrase) } }
    const err = TH.expectSyncRefusal(() => gatingOf({ passphraseCleartext: FakePassphrase, passkeyCleartext }), 'unexpected_error')
    expect(TH.thrownText(err)).to.not.include(FakePassphrase)
  })
})

describe("gating.attempt()", () => {
  it("makes the verb's change: a gate's unlockGating unlocks it, resolving the gate", async () => {
    const { bank } = await TH.buildBornBank()
    bank.lock()
    const gating = bank.gate.unlockGating({ passphraseCleartext: TH.TestPassphrase })
    expect(gating).to.be.instanceOf(UnlockGating)
    expect(await gating.attempt()).to.equal(bank.gate)
    expect(bank.isUnlocked).to.be.true
  })

  it("zeroes the PRF bytes it adopted once it lands, and once it is refused", async () => {
    const adopted: GX.PasskeyAnswer[] = []
    const bodyOf = (isRefused: boolean) => (given: GatingCleartexts) => {
      adopted.push(given.passkeyCleartext!)
      return isRefused ? Promise.reject(new Error('refused')) : Promise.resolve()
    }
    await TH._cheat_gatingOf({ passkeyCleartext: TH.passkeyAnswerOf() }, bodyOf(false)).attempt()
    await expect(TH._cheat_gatingOf({ passkeyCleartext: TH.passkeyAnswerOf() }, bodyOf(true)).attempt()).rejects.toThrow('refused')
    expect(adopted.map((answer) => TH.isZeroed(answer.prfBytes))).to.deep.equal([true, true])
  })

  it("refuses a second attempt, deriving no key", async () => {
    const deriveKeyBytes = vi.fn((passphrase: string, saltBytes: Uint8Array) => TH.testDeriver.deriveKeyBytes(passphrase, saltBytes))
    const { bank } = await TH.buildBornBank({ device: TH.makeDevice({}, { keyDeriver: { ...TH.testDeriver, deriveKeyBytes } }) })
    bank.lock()
    const gating = bank.gate.unlockGating({ passphraseCleartext: 'not the passphrase' })
    await TH.expectRefusal(gating.attempt(), 'wrong_passphrase')
    deriveKeyBytes.mockClear()
    await TH.expectRefusal(gating.attempt(), 'gating_concluded')
    expect(deriveKeyBytes).not.toHaveBeenCalled()
    expect(bank.isLocked).to.be.true
  })

  it("refuses once the gating is vacated", async () => {
    const { bank } = await TH.buildBornBank()
    bank.lock()
    const gating = bank.gate.unlockGating({ passphraseCleartext: TH.TestPassphrase })
    gating.vacate()
    await TH.expectRefusal(gating.attempt(), 'gating_concluded')
    expect(bank.isLocked).to.be.true
  })
})

describe("gating.tryAttempt()", () => {
  it("resolves a good outcome of the gate, or the refusal attempt throws", async () => {
    const { bank } = await TH.buildBornBank()
    bank.lock()
    await TH.expectBad(bank.gate.unlockGating({ passphraseCleartext: 'not the passphrase' }).tryAttempt(), 'wrong_passphrase')
    expect(await TH.expectGood(bank.gate.unlockGating({ passphraseCleartext: TH.TestPassphrase }).tryAttempt())).to.equal(bank.gate)
  })
})

describe("gating.vacate()", () => {
  it("zeroes the PRF bytes the gating had", () => {
    const handed = TH.passkeyAnswerOf()
    const gating = gatingOf({ passkeyCleartext: handed })
    const fill   = vi.spyOn(Uint8Array.prototype, 'fill')
    onTestFinished(() => { fill.mockRestore() })
    gating.vacate()
    // The bytes zeroed are the gating's own, not the host's, zeroed at adoption.
    expect(fill.mock.calls).to.deep.equal([[0]])
    const [zeroed] = fill.mock.contexts as Uint8Array[]
    expect([zeroed === handed.prfBytes, TH.isZeroed(zeroed!)]).to.deep.equal([false, true])
  })
})

describe("a gating's redaction", () => {
  const gating = gatingOf({ passphraseCleartext: FakePassphrase, passkeyCleartext: TH.passkeyAnswerOf() })

  it("serializes as the marker", () => {
    expect(JSON.stringify({ variables: gating })).to.eq('{"variables":"[gating]"}')
  })

  it("prints as the marker", () => {
    expect([String(gating), inspect(gating), inspect({ variables: gating })]).to.deep.equal(['[gating]', '[gating]', '{ variables: [gating] }'])
  })

  it("has no field of its own", () => {
    expect(Reflect.ownKeys(gating)).to.deep.equal([])
  })
})
