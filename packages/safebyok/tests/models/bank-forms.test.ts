/** The bank's form verbs, each over real provings and its device's MemoryVaultDB, and the awaited `unlock` gating every verb resolves. */

import { describe, expect, it, vi } from 'vitest'
import { Errors } from 'safebyok-big/internals'
import { Bank } from '../../src/models/bank'
import { Lease } from '../../src/models/lease'
import { PassphraseProving, Proving } from '../../src/models/proving'
import type { StrengthChecker } from '../../src/shapes/shapes-gateish'
import type { GateRecord } from '../../src/shapes/shapes-thing'
import * as TH from '../test-helpers'

/** A passphrase to replace {@link TH.TestPassphrase} with. */
const NextPassphrase = 'a different passphrase, just as long'

/** A strength checker that finds `'weak'` weak and every other passphrase strong. */
function strengthChecker(passphrase: string) { return (passphrase === 'weak' ? { strong: false as const, reason: 'too short' } : { strong: true as const }) }

/** The main gate stored for `bank`, as its vaultDB answers it. */
async function storedGateOf(bank: Bank): Promise<GateRecord> {
  const answer = await bank.device.vaultDB.tryGetThing({ ...bank.makeGetAsk({ labelpath: 'gate' }), modelkind: 'gate' })
  if (! answer.ok) { throw answer.err }
  return answer.val as GateRecord
}

/** A {@link TH.buildBornBank} bank, locked, beside a second Bank object over the same stored bank, which writes as another device would. */
async function bankAndElsewhere(given: TH.BornBankGiven = {}) {
  const born = await TH.buildBornBank(given)
  born.bank.lock()
  const elsewhere = Bank.make({ ...born.record, rootBox: born.bank.rootBox }, { device: born.device, vaultDB: born.device.vaultDB })
  return { ...born, elsewhere }
}

/** A {@link TH.buildBornBank} bank, locked, on a device whose key deriver is watched: `deriveKeyBytes` hears each derivation from the birth on. */
async function bankDerivingWatched({ strengthChecker = TH.anyStrengthChecker, passkeyCleartext }: { strengthChecker?: StrengthChecker, passkeyCleartext?: TH.BornBankGiven['passkeyCleartext'] } = {}) {
  const deriveKeyBytes = vi.fn((passphrase: string, saltBytes: Uint8Array) => TH.testDeriver.deriveKeyBytes(passphrase, saltBytes))
  const device = TH.makeDevice({}, { keyDeriver: { ...TH.testDeriver, deriveKeyBytes }, strengthChecker })
  const born = await TH.buildBornBank({ device, passkeyCleartext })
  born.bank.lock()
  deriveKeyBytes.mockClear()
  return { ...born, deriveKeyBytes }
}

/** Whether `promise` has settled yet, as a flag that flips once it does. */
function settledFlag(promise: Promise<unknown>): { readonly isSettled: boolean } {
  const flag = { isSettled: false }
  void Promise.allSettled([promise]).then(() => { flag.isSettled = true })
  return flag
}

/** Cleartexts an `unlock` gating must refuse, by what is wrong with them. */
const SloppyUnlockCleartexts = [
  [null,                    'null'],
  ["a bare passphrase",     'a bare string'],
  [{},                      'no field'],
  [{ passphraseClear: 42 }, 'a passphrase that is not text'],
] as const

describe("bank.unlock(cleartexts)", () => {
  it("unlocks by the passphrase, under a lease citing the main gate", async () => {
    const { bank } = await TH.buildBornBank()
    bank.lock()
    const make = vi.spyOn(Lease, 'make')
    expect(await bank.unlock({ passphraseClear: TH.TestPassphrase })).to.equal(bank)
    expect(bank.isUnlocked).to.be.true
    expect(make.mock.calls[0]![0]).to.include({ gate_labelpath: 'gate', gate_lifeseq: TH.Life0, gate_revtok: bank.maingate.revtok, wayinkind: 'passphrase' })
  })

  it("unlocks by the passkey, and zeroes its answer", async () => {
    const passkeyCleartext = TH.passkeyAnswerOf()
    const { bank } = await TH.buildBornBank({ passkeyCleartext })
    bank.lock()
    const make = vi.spyOn(Lease, 'make')
    const answer = TH.copyOfAnswer(passkeyCleartext)
    await bank.unlock({ passkeyClear: answer })
    expect(bank.isUnlocked).to.be.true
    expect(make.mock.calls[0]![0]).to.include({ wayinkind: 'passkey' })
    expect(TH.isZeroed(answer.prfBytes)).to.be.true
  })

  it("evicts the lease an `unlock` gating replaces", async () => {
    const { bank } = await TH.buildBornBank()
    const evict = vi.spyOn(Lease.prototype, 'evict')
    await bank.unlock({ passphraseClear: TH.TestPassphrase })
    expect(evict).toHaveBeenCalledTimes(1)
    expect(bank.isUnlocked).to.be.true
  })

  it("refuses a wrong passphrase, the bank still locked", async () => {
    const { bank } = await TH.buildBornBank()
    bank.lock()
    await TH.expectRefusal(bank.unlock({ passphraseClear: 'not the passphrase' }), 'wrong_passphrase')
    expect(bank.isLocked).to.be.true
  })

  it("refuses a wrong passkey, the bank still locked, and zeroes its answer", async () => {
    const passkeyCleartext = TH.passkeyAnswerOf()
    const { bank } = await TH.buildBornBank({ passkeyCleartext })
    bank.lock()
    const wrong = TH.passkeyAnswerOf({ credential_id: passkeyCleartext.credential_id, prf_salt_b64: passkeyCleartext.prf_salt_b64 })
    await TH.expectRefusal(bank.unlock({ passkeyClear: wrong }), 'wrong_passkey')
    expect(bank.isLocked).to.be.true
    expect(TH.isZeroed(wrong.prfBytes)).to.be.true
  })

  for (const [cleartexts, blurb] of SloppyUnlockCleartexts) {
    it(`refuses ${blurb}, the bank still locked`, async () => {
      const { bank } = await TH.buildBornBank()
      bank.lock()
      await TH.expectRefusal(bank.unlock(cleartexts as never), 'bad_record')
      expect(bank.isLocked).to.be.true
    })
  }

  it("leaves the lease attached when the proving's buildLease refuses", async () => {
    const { bank } = await TH.buildBornBank()
    vi.spyOn(Proving.prototype, 'buildLease').mockRejectedValueOnce(new Errors.VaultError('unexpected_error', 'no lease today'))
    await TH.expectRefusal(bank.unlock({ passphraseClear: TH.TestPassphrase }), 'unexpected_error')
    expect(bank.isUnlocked).to.be.true
  })

  it("refuses a swept bank, deriving no key, and zeroes a passkey answer", async () => {
    const { bank, deriveKeyBytes } = await bankDerivingWatched()
    bank.sweep()
    await TH.expectRefusal(bank.unlock({ passphraseClear: TH.TestPassphrase }), 'disabled')
    expect(deriveKeyBytes).not.toHaveBeenCalled()
    const answer = TH.passkeyAnswerOf()
    await TH.expectRefusal(bank.unlock({ passkeyClear: answer }), 'disabled')
    expect(TH.isZeroed(answer.prfBytes)).to.be.true
  })

  it("refuses with nothing of what a throwing getter threw", async () => {
    const { bank } = await TH.buildBornBank()
    const err = await TH.expectRefusal(bank.unlock({ get passphraseClear(): string { throw new Error(TH.TestPassphrase) } }), 'unexpected_error')
    expect(err.cause).to.be.undefined
    expect(TH.thrownText(err)).to.not.include(TH.TestPassphrase)
  })
})

describe("bank.replacePassphrase(cleartexts)", () => {
  it("writes the main gate's next revision with the new passphrase's wayin, holds it, and unlocks under a lease citing it", async () => {
    const passkeyCleartext = TH.passkeyAnswerOf()
    const { bank } = await TH.buildBornBank({ passkeyCleartext })
    bank.lock()
    const ante = bank.maingate
    const make = vi.spyOn(Lease, 'make')
    expect(await bank.replacePassphrase({ passphraseClear: TH.TestPassphrase, nextPassphraseClear: NextPassphrase })).to.equal(bank)
    expect(bank.maingate).to.include({ revseq: ante.revseq + 1, lifeseq: ante.lifeseq })
    expect(bank.maingate.main.pickle()).to.not.deep.equal(ante.main.pickle())
    expect(bank.maingate.passkey0!.pickle()).to.deep.equal(ante.passkey0!.pickle())
    expect(await storedGateOf(bank)).to.deep.equal(bank.maingate.pickle())
    expect(bank.isUnlocked).to.be.true
    expect(make.mock.calls[0]![0]).to.include({ gate_revtok: bank.maingate.revtok, wayinkind: 'passphrase' })
  })

  it("is proved by the passkey too, the forgotten passphrase's reset, and zeroes its answer", async () => {
    const passkeyCleartext = TH.passkeyAnswerOf()
    const { bank } = await TH.buildBornBank({ passkeyCleartext })
    bank.lock()
    const make = vi.spyOn(Lease, 'make')
    const answer = TH.copyOfAnswer(passkeyCleartext)
    await bank.replacePassphrase({ passkeyClear: answer, nextPassphraseClear: NextPassphrase })
    expect(bank.isUnlocked).to.be.true
    expect(make.mock.calls[0]![0]).to.include({ gate_revtok: bank.maingate.revtok, wayinkind: 'passkey' })
    expect(TH.isZeroed(answer.prfBytes)).to.be.true
    bank.lock()
    await bank.unlock({ passphraseClear: NextPassphrase })
  })

  it("unlocks by the new passphrase afterwards, and refuses the old one, under the same bankKey", async () => {
    const { bank } = await TH.buildBornBank()
    const { record: box } = await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    await bank.replacePassphrase({ passphraseClear: TH.TestPassphrase, nextPassphraseClear: NextPassphrase })
    bank.lock()
    await TH.expectRefusal(bank.unlock({ passphraseClear: TH.TestPassphrase }), 'wrong_passphrase')
    await bank.unlock({ passphraseClear: NextPassphrase })
    expect(await bank.unsealBox(box)).to.deep.include({ whisper: TH.Whisper })
  })

  it("refuses the same passphrase, before the strength check or any key derivation, writing nothing", async () => {
    const strength = vi.fn(strengthChecker)
    const { bank, device, deriveKeyBytes } = await bankDerivingWatched({ strengthChecker: strength })
    strength.mockClear()
    const tryWriteThing = vi.spyOn(device.vaultDB, 'tryWriteThing')
    await TH.expectRefusal(bank.replacePassphrase({ passphraseClear: TH.TestPassphrase, nextPassphraseClear: TH.TestPassphrase }), 'same_passphrase')
    expect(strength).not.toHaveBeenCalled()
    expect(deriveKeyBytes).not.toHaveBeenCalled()
    expect(tryWriteThing).not.toHaveBeenCalled()
    expect(bank.isLocked).to.be.true
  })

  it("refuses a weak new passphrase before any key derivation, writing nothing", async () => {
    const { bank, device, deriveKeyBytes } = await bankDerivingWatched({ strengthChecker })
    const tryWriteThing = vi.spyOn(device.vaultDB, 'tryWriteThing')
    const err = await TH.expectRefusal(bank.replacePassphrase({ passphraseClear: TH.TestPassphrase, nextPassphraseClear: 'weak' }), 'weak_passphrase')
    expect(err.message).to.eq('too short')
    expect(deriveKeyBytes).not.toHaveBeenCalled()
    expect(tryWriteThing).not.toHaveBeenCalled()
    expect(bank.isLocked).to.be.true
  })

  it("refuses a wrong current passphrase before it derives from the new one, writing nothing", async () => {
    const { bank, device } = await TH.buildBornBank()
    bank.lock()
    const ante = bank.maingate
    const buildNovel = vi.spyOn(PassphraseProving, 'buildNovel')
    const tryWriteThing = vi.spyOn(device.vaultDB, 'tryWriteThing')
    await TH.expectRefusal(bank.replacePassphrase({ passphraseClear: 'not the passphrase', nextPassphraseClear: NextPassphrase }), 'wrong_passphrase')
    expect(buildNovel).not.toHaveBeenCalled()
    expect(tryWriteThing).not.toHaveBeenCalled()
    expect(bank.maingate).to.equal(ante)
    expect(bank.isLocked).to.be.true
  })

  it("refuses no proof at all", async () => {
    const { bank } = await TH.buildBornBank()
    await TH.expectRefusal(bank.replacePassphrase({ nextPassphraseClear: NextPassphrase }), 'bad_record')
  })

  it("refuses 'stale_write' over a gate changed elsewhere, holding the gate it had and staying locked", async () => {
    const { bank, elsewhere } = await bankAndElsewhere()
    await elsewhere.replacePassphrase({ passphraseClear: TH.TestPassphrase, nextPassphraseClear: NextPassphrase })
    const ante = bank.maingate
    const make = vi.spyOn(Lease, 'make')
    await TH.expectRefusal(bank.replacePassphrase({ passphraseClear: TH.TestPassphrase, nextPassphraseClear: 'a third passphrase, also long' }), 'stale_write')
    expect(bank.maingate).to.equal(ante)
    expect(make).not.toHaveBeenCalled()
    expect(bank.isLocked).to.be.true
  })

  it("throws the vaultDB's refusal as it came, keeping the main gate and the lease it had", async () => {
    const { bank, device } = await TH.buildBornBank()
    const ante = bank.maingate
    const refusal = new Errors.VaultError('storage_unavailable', 'the disk is full')
    vi.spyOn(device.vaultDB, 'tryWriteThing').mockImplementationOnce((ask) => Promise.resolve({ ok: false, ask, act: 'unclassified_storing', world: null, dbhas: null, err: refusal }))
    const make = vi.spyOn(Lease, 'make')
    expect(await TH.expectRefusal(bank.replacePassphrase({ passphraseClear: TH.TestPassphrase, nextPassphraseClear: NextPassphrase }))).to.equal(refusal)
    expect(bank.maingate).to.equal(ante)
    expect(make).not.toHaveBeenCalled()
    expect(bank.isUnlocked).to.be.true
  })

  it("zeroes the passkey answer of a refused proof", async () => {
    const passkeyCleartext = TH.passkeyAnswerOf()
    const { bank } = await TH.buildBornBank({ passkeyCleartext })
    const wrong = TH.passkeyAnswerOf({ credential_id: passkeyCleartext.credential_id, prf_salt_b64: passkeyCleartext.prf_salt_b64 })
    await TH.expectRefusal(bank.replacePassphrase({ passkeyClear: wrong, nextPassphraseClear: NextPassphrase }), 'wrong_passkey')
    expect(TH.isZeroed(wrong.prfBytes)).to.be.true
  })
})

describe("bank.addPasskey(cleartexts)", () => {
  it("writes the main gate's next revision with the passkey's wayin beside the passphrase's, unlocks under a lease citing it, and the passkey then unlocks", async () => {
    const { bank } = await TH.buildBornBank()
    bank.lock()
    const ante = bank.maingate
    const answer = TH.passkeyAnswerOf()
    const prfBytes = new Uint8Array(answer.prfBytes)
    const make = vi.spyOn(Lease, 'make')
    expect(await bank.addPasskey({ passphraseClear: TH.TestPassphrase, nextPasskeyClear: answer })).to.equal(bank)
    expect(bank.maingate).to.include({ revseq: ante.revseq + 1 })
    expect(bank.maingate.main.pickle()).to.deep.equal(ante.main.pickle())
    expect(bank.maingate.passkey0).to.deep.include({ wayinkind: 'passkey', credential_id: answer.credential_id })
    expect(await storedGateOf(bank)).to.deep.equal(bank.maingate.pickle())
    expect(make.mock.calls[0]![0]).to.include({ gate_revtok: bank.maingate.revtok, wayinkind: 'passphrase' })
    expect(TH.isZeroed(answer.prfBytes)).to.be.true
    bank.lock()
    await bank.unlock({ passkeyClear: { ...answer, prfBytes } })
    expect(bank.isUnlocked).to.be.true
  })

  it("refuses while the gate has a passkey, before any key derivation, writing nothing and zeroing the answer", async () => {
    const { bank, device, deriveKeyBytes } = await bankDerivingWatched({ passkeyCleartext: TH.passkeyAnswerOf() })
    const tryWriteThing = vi.spyOn(device.vaultDB, 'tryWriteThing')
    const answer = TH.passkeyAnswerOf()
    await TH.expectRefusal(bank.addPasskey({ passphraseClear: TH.TestPassphrase, nextPasskeyClear: answer }))
    expect(deriveKeyBytes).not.toHaveBeenCalled()
    expect(tryWriteThing).not.toHaveBeenCalled()
    expect(TH.isZeroed(answer.prfBytes)).to.be.true
    expect(bank.isLocked).to.be.true
  })

  it("refuses a wrong passphrase, writing nothing, still locked, and zeroes the answer", async () => {
    const { bank, device } = await TH.buildBornBank()
    bank.lock()
    const tryWriteThing = vi.spyOn(device.vaultDB, 'tryWriteThing')
    const answer = TH.passkeyAnswerOf()
    await TH.expectRefusal(bank.addPasskey({ passphraseClear: 'not the passphrase', nextPasskeyClear: answer }), 'wrong_passphrase')
    expect(tryWriteThing).not.toHaveBeenCalled()
    expect(TH.isZeroed(answer.prfBytes)).to.be.true
    expect(bank.isLocked).to.be.true
  })

  it("refuses 'stale_write' over a gate changed elsewhere, holding the gate it had and staying locked", async () => {
    const { bank, elsewhere } = await bankAndElsewhere()
    await elsewhere.replacePassphrase({ passphraseClear: TH.TestPassphrase, nextPassphraseClear: NextPassphrase })
    const ante = bank.maingate
    const answer = TH.passkeyAnswerOf()
    await TH.expectRefusal(bank.addPasskey({ passphraseClear: TH.TestPassphrase, nextPasskeyClear: answer }), 'stale_write')
    expect(bank.maingate).to.equal(ante)
    expect(TH.isZeroed(answer.prfBytes)).to.be.true
    expect(bank.isLocked).to.be.true
  })
})

describe("bank.revokePasskey(cleartexts)", () => {
  it("writes the main gate's next revision without the passkey's wayin, unlocks under a lease citing it, and the passphrase still unlocks", async () => {
    const { bank } = await TH.buildBornBank({ passkeyCleartext: TH.passkeyAnswerOf() })
    bank.lock()
    const ante = bank.maingate
    const make = vi.spyOn(Lease, 'make')
    expect(await bank.revokePasskey({ passphraseClear: TH.TestPassphrase })).to.equal(bank)
    expect(bank.maingate).to.include({ revseq: ante.revseq + 1 })
    expect(bank.maingate.passkey0).to.be.null
    expect(await storedGateOf(bank)).to.deep.equal(bank.maingate.pickle())
    expect(make.mock.calls[0]![0]).to.include({ gate_revtok: bank.maingate.revtok, wayinkind: 'passphrase' })
    bank.lock()
    await bank.unlock({ passphraseClear: TH.TestPassphrase })
  })

  it("is proved by the passkey it revokes, and zeroes its answer", async () => {
    const passkeyCleartext = TH.passkeyAnswerOf()
    const { bank } = await TH.buildBornBank({ passkeyCleartext })
    bank.lock()
    const answer = TH.copyOfAnswer(passkeyCleartext)
    await bank.revokePasskey({ passkeyClear: answer })
    expect(bank.maingate.passkey0).to.be.null
    expect(bank.isUnlocked).to.be.true
    expect(TH.isZeroed(answer.prfBytes)).to.be.true
    bank.lock()
    await TH.expectRefusal(bank.unlock({ passkeyClear: TH.copyOfAnswer(passkeyCleartext) }), 'absent_wayin')
  })

  it("with no passkey, unlocks by the proof and writes nothing", async () => {
    const { bank, device } = await TH.buildBornBank()
    bank.lock()
    const ante = bank.maingate
    const tryWriteThing = vi.spyOn(device.vaultDB, 'tryWriteThing')
    await bank.revokePasskey({ passphraseClear: TH.TestPassphrase })
    expect(tryWriteThing).not.toHaveBeenCalled()
    expect(bank.maingate).to.equal(ante)
    expect(bank.isUnlocked).to.be.true
  })

  it("refuses a wrong passphrase, writing nothing and still locked", async () => {
    const { bank, device } = await TH.buildBornBank({ passkeyCleartext: TH.passkeyAnswerOf() })
    bank.lock()
    const tryWriteThing = vi.spyOn(device.vaultDB, 'tryWriteThing')
    await TH.expectRefusal(bank.revokePasskey({ passphraseClear: 'not the passphrase' }), 'wrong_passphrase')
    expect(tryWriteThing).not.toHaveBeenCalled()
    expect(bank.maingate.passkey0).to.not.be.null
    expect(bank.isLocked).to.be.true
  })

  it("refuses 'stale_write' over a gate changed elsewhere, holding the gate it had and staying locked", async () => {
    const { bank, elsewhere } = await bankAndElsewhere({ passkeyCleartext: TH.passkeyAnswerOf() })
    await elsewhere.replacePassphrase({ passphraseClear: TH.TestPassphrase, nextPassphraseClear: NextPassphrase })
    const ante = bank.maingate
    await TH.expectRefusal(bank.revokePasskey({ passphraseClear: TH.TestPassphrase }), 'stale_write')
    expect(bank.maingate).to.equal(ante)
    expect(bank.isLocked).to.be.true
  })
})

describe("the try forms: tryUnlock, tryReplacePassphrase, tryAddPasskey, tryRevokePasskey, Bank.tryBirth", () => {
  it("each resolves a good outcome of the bank on success", async () => {
    const device = TH.makeDevice()
    const bank = await TH.expectGood(Bank.tryBirth(device, { passphraseClear: TH.TestPassphrase }))
    bank.lock()
    expect(await TH.expectGood(bank.tryUnlock({ passphraseClear: TH.TestPassphrase }))).to.equal(bank)
    const nextPasskeyClear = TH.passkeyAnswerOf()
    expect(await TH.expectGood(bank.tryAddPasskey({ passphraseClear: TH.TestPassphrase, nextPasskeyClear }))).to.equal(bank)
    expect(await TH.expectGood(bank.tryRevokePasskey({ passphraseClear: TH.TestPassphrase }))).to.equal(bank)
    expect(await TH.expectGood(bank.tryReplacePassphrase({ passphraseClear: TH.TestPassphrase, nextPassphraseClear: NextPassphrase }))).to.equal(bank)
  })

  it("each resolves the refusal its throwing form throws", async () => {
    const { bank, device } = await TH.buildBornBank()
    await TH.expectBad(Bank.tryBirth(device, { passphraseClear: 42 } as never), 'bad_record')
    await TH.expectBad(bank.tryUnlock({ passphraseClear: 'not the passphrase' }), 'wrong_passphrase')
    await TH.expectBad(bank.tryReplacePassphrase({ passphraseClear: TH.TestPassphrase, nextPassphraseClear: TH.TestPassphrase }), 'same_passphrase')
    await TH.expectBad(bank.tryAddPasskey({ passphraseClear: 'not the passphrase', nextPasskeyClear: TH.passkeyAnswerOf() }), 'wrong_passphrase')
    await TH.expectBad(bank.tryRevokePasskey({ passphraseClear: 'not the passphrase' }), 'wrong_passphrase')
  })
})

describe("bank.ensureUnlocked()", () => {
  it("resolves at once on an unlocked bank, wanting no unlock", async () => {
    const { bank } = await TH.buildBornBank()
    expect(await bank.ensureUnlocked()).to.equal(bank)
    expect(bank.getSnapshot().isUnlockWanted).to.be.false
  })

  it("on a locked bank, wants an `unlock` gating, and every waiter resolves once it lands", async () => {
    const { bank } = await TH.buildBornBank()
    bank.lock()
    const ensurings = [bank.ensureUnlocked(), bank.ensureUnlocked()]
    expect(bank.getSnapshot().isUnlockWanted).to.be.true
    await bank.unlock({ passphraseClear: TH.TestPassphrase })
    expect(await Promise.all(ensurings)).to.deep.equal([bank, bank])
    expect(bank.getSnapshot().isUnlockWanted).to.be.false
  })

  it("tells the bank's subscribers that an `unlock` gating is wanted", async () => {
    const { bank } = await TH.buildBornBank()
    bank.lock()
    const seen: boolean[] = []
    bank.subscribe(() => { seen.push(bank.getSnapshot().isUnlockWanted) })
    const ensuring = bank.ensureUnlocked()
    void bank.ensureUnlocked()
    await bank.unlock({ passphraseClear: TH.TestPassphrase })
    await ensuring
    expect(seen).to.deep.equal([true, false])
  })

  it("keeps waiting after a refused unlock, and resolves on the next that lands", async () => {
    const { bank } = await TH.buildBornBank()
    bank.lock()
    const ensuring = bank.ensureUnlocked()
    const settled = settledFlag(ensuring)
    await TH.expectRefusal(bank.unlock({ passphraseClear: 'not the passphrase' }), 'wrong_passphrase')
    await TH.wakeupAtNextTick()
    expect(settled.isSettled).to.be.false
    expect(bank.getSnapshot().isUnlockWanted).to.be.true
    await bank.unlock({ passphraseClear: TH.TestPassphrase })
    expect(await ensuring).to.equal(bank)
  })

  it("resolves on a gate change, whose proof unlocks the bank", async () => {
    const { bank } = await TH.buildBornBank()
    bank.lock()
    const ensuring = bank.ensureUnlocked()
    await bank.replacePassphrase({ passphraseClear: TH.TestPassphrase, nextPassphraseClear: NextPassphrase })
    expect(await ensuring).to.equal(bank)
    expect(bank.getSnapshot().isUnlockWanted).to.be.false
  })

  it("rejects every waiter 'dismissed' on dismissUnlock, the bank still locked, and the next call waits afresh", async () => {
    const { bank } = await TH.buildBornBank()
    bank.lock()
    const ensurings = [bank.ensureUnlocked(), bank.ensureUnlocked()].map((ensuring) => TH.expectRefusal(ensuring, 'dismissed'))
    expect(bank.dismissUnlock()).to.equal(bank)
    expect(bank.getSnapshot().isUnlockWanted).to.be.false
    await Promise.all(ensurings)
    expect(bank.isLocked).to.be.true
    const next = bank.ensureUnlocked()
    expect(bank.getSnapshot().isUnlockWanted).to.be.true
    await bank.unlock({ passphraseClear: TH.TestPassphrase })
    expect(await next).to.equal(bank)
  })

  it("rejects 'dismissed' when a subscriber dismisses the wait as it hears an `unlock` gating is wanted", async () => {
    const { bank } = await TH.buildBornBank()
    bank.lock()
    bank.subscribe(() => { if (bank.getSnapshot().isUnlockWanted) { bank.dismissUnlock() } })
    await TH.expectRefusal(bank.ensureUnlocked(), 'dismissed')
    expect(bank.getSnapshot().isUnlockWanted).to.be.false
  })

  it("rejects with the bank's end cause when a subscriber sweeps the bank as it hears an `unlock` gating is wanted", async () => {
    const { bank } = await TH.buildBornBank()
    bank.lock()
    bank.subscribe(() => { if (bank.getSnapshot().isUnlockWanted) { bank.sweep() } })
    expect(await TH.expectRefusal(bank.ensureUnlocked(), 'disabled')).to.equal(bank.endCause)
  })

  it("dismissUnlock changes nothing with no call waiting", async () => {
    const { bank } = await TH.buildBornBank()
    bank.lock()
    const before = bank.getSnapshot()
    bank.dismissUnlock()
    expect(bank.getSnapshot()).to.equal(before)
  })

  it("rejects every waiter with the bank's end cause, synchronously, when the bank is swept", async () => {
    const { bank } = await TH.buildBornBank()
    bank.lock()
    const ensurings = [bank.ensureUnlocked(), bank.ensureUnlocked()]
    bank.sweep()
    expect(bank.getSnapshot()).to.include({ isUnlockWanted: false, stage: 'swept' })
    for (const ensuring of ensurings) { expect(await TH.expectRefusal(ensuring, 'disabled')).to.equal(bank.endCause) }
  })

  it("rejects every waiter with the bank's end cause when the device is swept", async () => {
    const { bank, device } = await TH.buildBornBank()
    bank.lock()
    const ensuring = bank.ensureUnlocked()
    device.sweep()
    expect(await TH.expectRefusal(ensuring, 'disabled')).to.equal(bank.endCause)
  })

  it("refuses a swept bank, wanting no unlock", async () => {
    const { bank } = await TH.buildBornBank()
    bank.sweep()
    await TH.expectRefusal(bank.ensureUnlocked(), 'disabled')
    expect(bank.getSnapshot().isUnlockWanted).to.be.false
  })
})
