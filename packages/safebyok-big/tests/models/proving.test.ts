import { describe, expect, it, type Mock, vi } from 'vitest'
import { PasskeySaltSize, isGuarded } from '../../src/helpers/consts'
import * as Phrases from '../../src/helpers/phrases'
import { cipherCtx, deriveWrappingKey, fromB64, randomBytes, toB64, unwrapKeyUnder } from '../../src/helpers/crypto'
import type { KeyDeriver } from '../../src/deriver/basederiver'
import { Gate } from '../../src/models/gate'
import { bankScope } from '../../src/shapes/shapes-core'
import { type ProvingDevice, type PasskeyAnswer, type StampedGate, passphraseCleartext } from '../../src/shapes/shapes-gateish'
import { NOVEL, PasskeyProving, PassphraseProving, Proving, guardKeyDeriver } from '../../src/models/proving'
import { VaultError } from '../../src/refusals/errors'
import { Wayin } from '../../src/models/wayin'
import * as TH from '../test-helpers'
import { _cheat_bankKeyBytesOf, builtGateOf, listedGateOf, DeviceTok, fakeLeaseFriendOf, isZeroed, passkeyAnswerOf, provingDeviceOf, sealStampsOf, T0, TestPassphrase, useFakeClock, WorldBankStamp, WorldGate, WorldGateStamp } from '../test-helpers/proving-world'

useFakeClock()

const WorldScope = bankScope.parse(WorldBankStamp)

/** A key deriver scripted to hand back anything at all, to try what a proving makes of it. */
function deriverHanding(handBack: () => unknown): KeyDeriver {
  return {
    key_deriver_label: 'test_scripted_v0',
    salt_size:        16,
    deriveKeyBytes:    () => Promise.resolve(handBack() as Uint8Array),
  }
}

function novelPassphrase(device: ProvingDevice = provingDeviceOf()): Promise<PassphraseProving> {
  return PassphraseProving.buildNovel(WorldBankStamp, WorldGateStamp, TestPassphrase, device)
}

function novelOverHanded(handBack: () => unknown): Promise<PassphraseProving> { return novelPassphrase(provingDeviceOf({ keyDeriver: deriverHanding(handBack) })) }

/** A passphrase proving that has a wayin under a new bankKey, beside that wayin. */
async function novelWithWayin(): Promise<{ proving: PassphraseProving, wayin: Wayin }> {
  const proving = await novelPassphrase()
  return { proving, wayin: await proving.buildWayin(NOVEL) }
}

function novelPasskey(answer = passkeyAnswerOf(), device: ProvingDevice = provingDeviceOf()): Promise<PasskeyProving> {
  return PasskeyProving.buildNovel(WorldBankStamp, WorldGateStamp, answer, device)
}

/** A gate with both wayins, beside a fresh copy of the answer that opens its passkey's: the gate's build spent the one it was handed. */
async function gateWithBoth(): Promise<{ gate: Gate, answerOf: () => PasskeyAnswer }> {
  const answer = passkeyAnswerOf()
  const { credential_id, prf_salt_b64 } = answer
  const prfBytes = new Uint8Array(answer.prfBytes)
  const { gate } = await builtGateOf(answer)
  const answerOf = (): PasskeyAnswer => ({ credential_id, prf_salt_b64, prfBytes: new Uint8Array(prfBytes) })
  return { gate, answerOf }
}

/** What a proving of `gate` is handed, under a bank's stamp and a gate's stamp each moved by `moves`: the stamps a Gate would refuse to be read under. */
function movedGate(gate: Gate, moves: { bank?: object, gate?: object }): StampedGate {
  return { bankStamp: { ...WorldBankStamp, ...moves.bank }, stamp: { ...WorldGateStamp, ...moves.gate }, wayins: gate.wayins }
}

/** What a bankKey is unwrapped as only to see that a wrap opens. */
const CheckUsage = { extractable: false, usage: ['wrapKey'] } as const

const findsWeak = () => ({ strong: false as const, reason: 'too short' })

const findsStrongAsync = () => Promise.resolve({ strong: true as const })

/** Whether `one`'s lease opens what `other`'s seals: whether both have one bankKey. */
async function expectOneBankKey(one: Proving, other: Proving): Promise<void> {
  const friend = fakeLeaseFriendOf()
  const stamps = sealStampsOf('b1')
  const sealer = await one.buildLease(friend, WorldGate)
  const opener = await other.buildLease(friend, WorldGate)
  const sealed = await sealer.sealWith('{"val":"sk-test-5678"}', stamps)
  expect(await opener.unsealWith(sealed, stamps)).to.eq('{"val":"sk-test-5678"}')
}

/** A checker whose answer throws the passphrase it heard, when its verdict is read. */
const answersThrowingGetter = (passphrase: string) => ({ get strong(): true { throw new Error(passphrase) } })

describe("Proving.judgeStrength(passphraseClear, scope, device)", () => {
  it("returns the strengthChecker's verdict for the passphrase and scope", async () => {
    const strengthChecker = vi.fn(() => ({ strong: false as const, reason: 'too short' }))
    const verdict = await Proving.judgeStrength(TestPassphrase, WorldScope, provingDeviceOf({ strengthChecker }))
    expect(verdict).to.deep.equal({ strong: false, reason: 'too short' })
    expect(strengthChecker).toHaveBeenCalledWith(TestPassphrase, WorldScope)
  })

  it("awaits a checker that returns a promise", async () => {
    expect(await Proving.judgeStrength(TestPassphrase, WorldScope, provingDeviceOf({ strengthChecker: findsStrongAsync }))).to.deep.equal({ strong: true })
  })

  it("keeps a passphrase out of the refusal when a getter on the verdict throws it", async () => {
    const err = await TH.expectRefusal(Proving.judgeStrength(TestPassphrase, WorldScope, provingDeviceOf({ strengthChecker: answersThrowingGetter })))
    expect(err.cause).to.be.undefined
    expect(TH.thrownText(err)).to.not.include(TestPassphrase)
  })

  it("replaces what a throwing checker threw with a sanitized refusal, quoting none of it and keeping no cause", async () => {
    const strengthChecker = () => { throw new Error(`weak: ${TestPassphrase}`) }
    const err = await TH.expectRefusal(Proving.judgeStrength(TestPassphrase, WorldScope, provingDeviceOf({ strengthChecker })))
    expect(err.cause).to.be.undefined
    expect(TH.thrownText(err)).to.not.include(TestPassphrase)
  })

  it("refuses a checker result that is not a verdict", async () => {
    const strengthChecker = (() => 'looks fine') as never
    await TH.expectRefusal(Proving.judgeStrength(TestPassphrase, WorldScope, provingDeviceOf({ strengthChecker })))
  })

  it("finds a blank passphrase weak without calling the checker", async () => {
    const strengthChecker = vi.fn(() => ({ strong: true as const }))
    const verdict = await Proving.judgeStrength(passphraseCleartext.parse(' '.repeat(3)), WorldScope, provingDeviceOf({ strengthChecker }))
    expect(verdict).to.have.property('strong', false)
    expect(strengthChecker).not.toHaveBeenCalled()
  })

  it("refuses a passphrase that is not a string, without calling the checker", async () => {
    const strengthChecker = vi.fn(() => ({ strong: true as const }))
    await TH.expectRefusal(Proving.judgeStrength(42 as never, WorldScope, provingDeviceOf({ strengthChecker })))
    expect(strengthChecker).not.toHaveBeenCalled()
  })
})

describe("PassphraseProving.buildNovel(bank, gate, passphraseClear, device)", () => {
  const ArgsCases = [
    [() => ({ device: TH.omitting(provingDeviceOf(), 'keyDeriver') }),      'a device with no keyDeriver'],
    [() => ({ device: TH.omitting(provingDeviceOf(), 'device_tok') }),      'a device with no device_tok'],
    [() => ({ device: TH.omitting(provingDeviceOf(), 'strengthChecker') }), 'a device with no strengthChecker'],
    [() => ({ device: provingDeviceOf({ device_tok: '' }) }),               'a device with an empty device_tok'],
    [() => ({ device: { ...provingDeviceOf(), keyDeriver: TH.testDeriver } }), "a device with the host's bare keyDeriver"],
    [() => ({ device: { ...provingDeviceOf(), strengthChecker: TH.anyStrengthChecker } }), "a device with the host's bare strengthChecker"],
    [() => ({ bank: { ...WorldBankStamp, bank_tok: undefined } }),        'a bank stamp with no bank_tok'],
    [() => ({ bank: { ...WorldBankStamp, registered_at: 'yesterday' } }), 'a bank stamp whose registered_at is not epoch millis'],
    [() => ({ bank: null }),                                              'no bank stamp at all'],
    [() => ({ gate: { ...WorldGateStamp, gate_tok: undefined } }),        'a gate stamp with no gate_tok'],
    [() => ({ gate: { ...WorldGateStamp, gatelabel: 'other' } }),         'a gate stamp of a gatelabel no gate has'],
    [() => ({ gate: null }),                                              'no gate stamp at all'],
    [() => ({ passphraseClear: 42 }),                                     'a passphrase that is not a string'],
  ] as const

  for (const [argsOf, blurb] of ArgsCases) {
    it(`refuses ${blurb}`, async () => {
      const { bank = WorldBankStamp, gate = WorldGateStamp, passphraseClear = TestPassphrase, device = provingDeviceOf() } = argsOf() as Record<string, unknown>
      await TH.expectRefusal(PassphraseProving.buildNovel(bank as never, gate as never, passphraseClear as never, device as ProvingDevice))
    })
  }

  it("refuses 'weak_passphrase' before deriving a key", async () => {
    const deriveKeyBytes = vi.fn((passphrase: string, saltBytes: Uint8Array) => TH.testDeriver.deriveKeyBytes(passphrase, saltBytes))
    const err = await TH.expectRefusal(novelPassphrase(provingDeviceOf({ strengthChecker: findsWeak, keyDeriver: { ...TH.testDeriver, deriveKeyBytes } })), 'weak_passphrase')
    expect(err.message).to.include('too short')
    expect(deriveKeyBytes).not.toHaveBeenCalled()
  })

  it("has the stamps given", async () => {
    const proving = await novelPassphrase()
    expect(proving.bankStamp).to.deep.equal(WorldBankStamp)
    expect(proving.gateStamp).to.deep.equal(WorldGateStamp)
  })

  it("hands the keyDeriver the passphrase and a fresh salt of its salt_size, the salt the header carries", async () => {
    const deriveKeyBytes: Mock<KeyDeriver['deriveKeyBytes']> = vi.fn((passphrase: string, saltBytes: Uint8Array) => TH.testDeriver.deriveKeyBytes(passphrase, saltBytes))
    const proving = await novelPassphrase(provingDeviceOf({ keyDeriver: { ...TH.testDeriver, deriveKeyBytes } }))
    expect(deriveKeyBytes).toHaveBeenCalledTimes(1)
    const [passphrase, saltBytes] = deriveKeyBytes.mock.calls[0]!
    expect(passphrase).to.eq(TestPassphrase)
    expect(saltBytes).to.deep.equal(fromB64(proving.header.salt_b64))
    expect(saltBytes.length).to.eq(TH.testDeriver.salt_size)
  })

  it("zeroes the key bytes the keyDeriver handed back, once imported", async () => {
    const handed = randomBytes(32)
    await novelOverHanded(() => handed)
    expect(isZeroed(handed)).to.be.true
  })

  it("replaces what a throwing keyDeriver threw with a sanitized refusal, quoting none of it and keeping no cause", async () => {
    const keyDeriver = deriverHanding(() => { throw new Error(`cannot derive ${TestPassphrase}`) })
    const err = await TH.expectRefusal(novelPassphrase(provingDeviceOf({ keyDeriver })))
    expect(err.cause).to.be.undefined
    expect(TH.thrownText(err)).to.not.include(TestPassphrase)
  })

  const HandedCases = [
    [() => randomBytes(31),                                        'key bytes one short'],
    [() => randomBytes(33),                                        'key bytes one long'],
    [() => new Uint8Array(32),                                     'key bytes all zero'],
    [() => new Uint8Array(new SharedArrayBuffer(32)).fill(7),      'key bytes in shared memory'],
    [() => randomBytes(32).buffer,                                 'an ArrayBuffer, not a view of one'],
    [() => toB64(randomBytes(32)),                                 'key bytes written as text'],
    [() => undefined,                                              'nothing'],
  ] as const

  for (const [handBack, blurb] of HandedCases) {
    it(`refuses ${blurb}`, async () => {
      await TH.expectRefusal(novelOverHanded(handBack))
    })
  }

  it("zeroes key bytes of the wrong length it refuses", async () => {
    const short = randomBytes(31)
    const long = randomBytes(33)
    await TH.expectRefusal(novelOverHanded(() => short))
    await TH.expectRefusal(novelOverHanded(() => long))
    expect(isZeroed(short) && isZeroed(long)).to.be.true
  })

  it("takes key bytes handed back as a view into a larger buffer, zeroing that view alone", async () => {
    const buffer = new Uint8Array(48).fill(9)
    buffer.set(randomBytes(32), 8)
    await novelOverHanded(() => buffer.subarray(8, 40))
    expect(isZeroed(buffer.subarray(8, 40))).to.be.true
    expect([...buffer.subarray(0, 8), ...buffer.subarray(40)].every((byte) => byte === 9)).to.be.true
  })
})

describe("PasskeyProving.buildNovel(bank, gate, passkeyClear, device)", () => {
  it("has the stamps given, and does not zero the answer", async () => {
    const answer = passkeyAnswerOf()
    const proving = await novelPasskey(answer)
    expect(proving.gateStamp).to.deep.equal(WorldGateStamp)
    expect(isZeroed(answer.prfBytes)).to.be.false
  })

  const AnswerCases = [
    [() => passkeyAnswerOf({ prfBytes: new Uint8Array(32) }),                                  'an answer whose PRF bytes are all zero'],
    [() => passkeyAnswerOf({ prfBytes: randomBytes(31) }),                                     'PRF bytes one short'],
    [() => passkeyAnswerOf({ prf_salt_b64: toB64(randomBytes(PasskeySaltSize - 1)) }),        'a salt one byte short'],
    [() => TH.omitting(passkeyAnswerOf(), 'credential_id'),                                    'an answer with no credential_id'],
  ] as const

  for (const [answerOf, blurb] of AnswerCases) {
    it(`refuses ${blurb}`, async () => {
      await TH.expectRefusal(novelPasskey(answerOf()))
    })
  }

  it("refuses a malformed device, and does not zero the answer", async () => {
    const answer = passkeyAnswerOf()
    const device = TH.omitting(provingDeviceOf(), 'device_tok')
    await TH.expectRefusal(novelPasskey(answer, device))
    expect(isZeroed(answer.prfBytes)).to.be.false
  })
})

describe("PassphraseProving.buildStored(gate, passphraseClear, device)", () => {
  it("proves the gate's passphrase wayin, with the gate's stamps and bankKey", async () => {
    const { gate, answerOf } = await gateWithBoth()
    const proving = await PassphraseProving.buildStored(gate, TestPassphrase, provingDeviceOf())
    expect(proving.bankStamp).to.deep.equal(WorldBankStamp)
    expect(proving.gateStamp).to.deep.equal(WorldGateStamp)
    expect(proving.header).to.deep.equal(gate.main.toJSON())
    await expectOneBankKey(proving, await PasskeyProving.buildStored(gate, answerOf()))
  })

  it("accepts a gate record as well as a Gate", async () => {
    const { gate } = await gateWithBoth()
    const proving = await PassphraseProving.buildStored({ bankStamp: WorldBankStamp, stamp: WorldGateStamp, ...gate.pickle() }, TestPassphrase, provingDeviceOf())
    expect(proving).to.be.instanceOf(PassphraseProving)
  })

  it("refuses a passphrase that does not open it as 'wrong_passphrase', quoting none of it", async () => {
    const { gate } = await gateWithBoth()
    const misremembered = passphraseCleartext.parse(`${TestPassphrase}, misremembered`)
    const err = await TH.expectRefusal(PassphraseProving.buildStored(gate, misremembered, provingDeviceOf()), 'wrong_passphrase')
    expect(TH.thrownText(err)).to.not.include(misremembered)
  })

  it("refuses a wayin made under another key deriver as 'newer_format', before the device's is asked", async () => {
    const { gate } = await gateWithBoth()
    const deriveKeyBytes = vi.fn(() => Promise.resolve(randomBytes(32)))
    const keyDeriver: KeyDeriver = { key_deriver_label: 'test_other_v0', salt_size: 16, deriveKeyBytes }
    await TH.expectRefusal(PassphraseProving.buildStored(gate, TestPassphrase, provingDeviceOf({ keyDeriver })), 'newer_format')
    expect(deriveKeyBytes).not.toHaveBeenCalled()
  })

  // 22 base64url characters, the last with stray padding bits: it passes for a salt by its length and its characters alone.
  it("refuses a stored salt that will not decode, without calling the deriver", async () => {
    const salt = `${"A".repeat(21)}B`
    const { gate } = await gateWithBoth()
    const { main } = gate.wayins
    const deriveKeyBytes = vi.fn(() => Promise.resolve(randomBytes(32)))
    const keyDeriver: KeyDeriver = { key_deriver_label: main.key_deriver_label, salt_size: 16, deriveKeyBytes }
    const damaged = { bankStamp: WorldBankStamp, stamp: WorldGateStamp, wayins: { ...gate.wayins, main: { ...main, salt_b64: salt as never } } }
    const err = await TH.expectRefusal(PassphraseProving.buildStored(damaged, TestPassphrase, provingDeviceOf({ keyDeriver })), 'bad_option')
    expect(TH.thrownText(err)).to.not.include(salt)
    expect(deriveKeyBytes).not.toHaveBeenCalled()
  })

  it("does not ask the strengthChecker", async () => {
    const { gate } = await gateWithBoth()
    const strengthChecker = vi.fn(() => ({ strong: false as const, reason: 'too short' }))
    await PassphraseProving.buildStored(gate, TestPassphrase, provingDeviceOf({ strengthChecker }))
    expect(strengthChecker).not.toHaveBeenCalled()
  })

  const ArgsCases = [
    [() => ({ gate: null }),                  'no gate'],
    [() => ({ passphraseClear: 42 }),         'a passphrase that is not a string'],
    [() => ({ device: {} }),                  'a malformed device'],
  ] as const

  for (const [argsOf, blurb] of ArgsCases) {
    it(`refuses ${blurb}`, async () => {
      const { gate } = await gateWithBoth()
      const { gate: handed = gate, passphraseClear = TestPassphrase, device = provingDeviceOf() } = argsOf() as Record<string, unknown>
      await TH.expectRefusal(PassphraseProving.buildStored(handed as never, passphraseClear as never, device as never))
    })
  }
})

describe("PasskeyProving.buildStored(gate, passkeyClear)", () => {
  it("proves the gate's passkey wayin, and does not zero the answer", async () => {
    const { gate, answerOf } = await gateWithBoth()
    const answer = answerOf()
    const proving = await PasskeyProving.buildStored(gate, answer)
    expect(proving.gateStamp).to.deep.equal(WorldGateStamp)
    expect(proving.header).to.deep.equal(gate.passkey0!.toJSON())
    expect(isZeroed(answer.prfBytes)).to.be.false
  })

  it("refuses a gate with no passkey wayin, and does not zero the answer", async () => {
    const { gate } = await builtGateOf()
    const answer = passkeyAnswerOf()
    await TH.expectRefusal(PasskeyProving.buildStored(gate, answer), 'absent_wayin')
    expect(isZeroed(answer.prfBytes)).to.be.false
  })

  const WrongAnswerCases = [
    [{ credential_id: 'cred-test-other' },                       'of another credential'],
    [{ prf_salt_b64: toB64(randomBytes(PasskeySaltSize)) },     'of another salt'],
    [{ prfBytes: randomBytes(32) },                              'whose PRF bytes do not open the wayin'],
  ] as const

  for (const [overrides, blurb] of WrongAnswerCases) {
    it(`refuses an answer ${blurb}, and does not zero it`, async () => {
      const { gate, answerOf } = await gateWithBoth()
      const answer = { ...answerOf(), ...overrides }
      await TH.expectRefusal(PasskeyProving.buildStored(gate, answer), 'wrong_passkey')
      expect(isZeroed(answer.prfBytes)).to.be.false
    })
  }

  it("refuses an answer already zeroed", async () => {
    const { gate, answerOf } = await gateWithBoth()
    await TH.expectRefusal(PasskeyProving.buildStored(gate, { ...answerOf(), prfBytes: new Uint8Array(32) }))
  })
})

describe("guardKeyDeriver(hostDeriver)", () => {
  it("keeps the deriver's label and salt length, and marks the result as guarded", () => {
    const guarded = guardKeyDeriver(TH.testDeriver)
    expect(guarded).to.include({ key_deriver_label: TH.testDeriver.key_deriver_label, salt_size: TH.testDeriver.salt_size })
    expect(Object.isFrozen(guarded)).to.be.true
    expect(isGuarded(guarded)).to.be.true
    expect(isGuarded({ ...guarded })).to.be.false
  })

  it("takes any label a host chooses that fits the interface", async () => {
    const guarded = guardKeyDeriver({ ...TH.testDeriver, key_deriver_label: 'my_own_kdf' })
    const proving = await novelPassphrase({ ...provingDeviceOf(), keyDeriver: guarded })
    const wayin = await proving.buildWayin(NOVEL)
    expect(wayin.toJSON()).to.include({ key_deriver_label: 'my_own_kdf' })
  })

  const Misfits = [
    [{ key_deriver_label: 'test_kdf_v0', salt_size: 16 },                                         'a deriver with no deriveKeyBytes'],
    [{ key_deriver_label: 'test_kdf_v0', salt_size: 0, deriveKeyBytes: () => Promise.resolve() },  'a deriver asking for no salt'],
    [{ key_deriver_label: 'test_kdf_v0', salt_size: 15, deriveKeyBytes: () => Promise.resolve() }, 'a deriver asking for a salt of 15 bytes'],
    [{ key_deriver_label: 'test_kdf_v0', salt_size: 32, deriveKeyBytes: () => Promise.resolve() }, 'a deriver asking for a salt of 32 bytes'],
    [{ salt_size: 16, deriveKeyBytes: () => Promise.resolve() },                                  'a deriver with no label'],
    [() => undefined,                                                                              'a bare function'],
  ] as const
  for (const [misfit, blurb] of Misfits) {
    it(`refuses ${blurb}`, () => {
      TH.expectSyncRefusal(() => guardKeyDeriver(misfit as never), 'bad_option')
    })
  }

  it("calls the host's load with the host as `this`, and resolves when the deriver has none", async () => {
    const hostLoad = vi.fn(function (this: unknown) { return Promise.resolve() })
    const hostDeriver = { ...TH.testDeriver, load: hostLoad }
    await guardKeyDeriver(hostDeriver).load()
    expect(hostLoad.mock.contexts[0]).to.eq(hostDeriver)
    await guardKeyDeriver(TH.testDeriver).load()
  })

  it("replaces a refusal the deriver throws with one that quotes nothing of it", async () => {
    const hostRefusal = new VaultError('bad_option', `cannot derive ${TestPassphrase}`, { cause: new TypeError(TestPassphrase), meta: { fieldnames: [TestPassphrase] } })
    const deriver = { ...TH.testDeriver, deriveKeyBytes: () => Promise.reject(hostRefusal) }
    const err = await TH.expectRefusal(guardKeyDeriver(deriver).deriveKeyBytes(passphraseCleartext.parse(TestPassphrase), new Uint8Array(16)), 'unexpected_error')
    expect(err).to.not.eq(hostRefusal)
    expect(TH.thrownText(err)).to.not.include(TestPassphrase)
    expect(err.cause).to.be.undefined
    expect(err.meta).to.be.undefined
  })

  it("replaces anything else the deriver throws with a refusal that quotes nothing", async () => {
    const deriver = { ...TH.testDeriver, deriveKeyBytes: () => Promise.reject(new TypeError(`cannot derive ${TestPassphrase}`)) }
    const err = await TH.expectRefusal(guardKeyDeriver(deriver).deriveKeyBytes(passphraseCleartext.parse(TestPassphrase), new Uint8Array(16)), 'unexpected_error')
    expect(err.message).to.not.include(TestPassphrase)
    expect(err.cause).to.be.undefined
  })

  it("refuses a load that fails, with what it threw as the cause", async () => {
    const chunkLost = new TypeError('Failed to fetch dynamically imported module')
    const err = await TH.expectRefusal(guardKeyDeriver({ ...TH.testDeriver, load: () => Promise.reject(chunkLost) }).load(), 'unexpected_error')
    expect(err.message).to.match(/keyDeriver's load\(\) failed/)
    expect(err.cause).to.eq(chunkLost)
  })
})

describe("a proving's header", () => {
  it("of a passphrase proving: the deriver's label, a fresh salt, the device's device_tok, and registered_at from the time now", async () => {
    vi.setSystemTime(T0 + 5)
    const { header } = await novelPassphrase(provingDeviceOf())
    expect(header).to.deep.include({ wayinkind: 'passphrase', wayinlabel: 'main', key_deriver_label: 'test_digest_v0', device_tok: DeviceTok, registered_at: T0 + 5 })
    expect(Object.keys(header)).to.have.members(['wayinkind', 'wayinlabel', 'key_deriver_label', 'salt_b64', 'device_tok', 'registered_at'])
    expect(fromB64(header.salt_b64).length).to.eq(TH.testDeriver.salt_size)
    expect(Object.isFrozen(header)).to.be.true
  })

  it("of a passkey proving: the answer's credential_id and salt, the device's device_tok, and registered_at", async () => {
    const answer = passkeyAnswerOf()
    const { credential_id, prf_salt_b64 } = answer
    const { header } = await novelPasskey(answer)
    expect(header).to.deep.equal({ wayinkind: 'passkey', wayinlabel: 'passkey0', credential_id, prf_salt_b64, device_tok: DeviceTok, registered_at: T0 })
  })

  it("draws a fresh salt for each passphrase proving", async () => {
    const one = await novelPassphrase()
    const two = await novelPassphrase()
    expect(one.header.salt_b64).to.not.eq(two.header.salt_b64)
  })
})

describe("proving.buildWayin(source)", () => {
  it("from NOVEL wraps a new bankKey that the passphrase opens", async () => {
    const { proving, wayin } = await novelWithWayin()
    expect(wayin).to.be.instanceOf(Wayin)
    expect(wayin.toJSON()).to.deep.equal(proving.header)
    const bankKeyBytes = await _cheat_bankKeyBytesOf(WorldBankStamp, WorldGateStamp, wayin, { passphrase: TestPassphrase })
    expect(bankKeyBytes.length).to.eq(32)
  })

  it("from NOVEL makes a wayin that another passphrase does not open", async () => {
    const { wayin } = await novelWithWayin()
    await expect(_cheat_bankKeyBytesOf(WorldBankStamp, WorldGateStamp, wayin, { passphrase: `${TestPassphrase}, misremembered` })).rejects.toThrow()
  })

  it("from another proving wraps that proving's bankKey", async () => {
    const answer = passkeyAnswerOf()
    const passphraseProving = await novelPassphrase()
    const passkeyProving = await novelPasskey(answer)
    const passphraseWayin = await passphraseProving.buildWayin(NOVEL)
    const passkeyWayin = await passkeyProving.buildWayin(passphraseProving)
    expect(passkeyWayin.toJSON()).to.deep.equal(passkeyProving.header)
    const viaPassphrase = await _cheat_bankKeyBytesOf(WorldBankStamp, WorldGateStamp, passphraseWayin, { passphrase: TestPassphrase })
    const viaPasskey = await _cheat_bankKeyBytesOf(WorldBankStamp, WorldGateStamp, passkeyWayin, { prfBytes: answer.prfBytes })
    expect(viaPasskey).to.deep.equal(viaPassphrase)
  })

  it("from a stored proving wraps the bankKey of the gate proved", async () => {
    const { gate } = await gateWithBoth()
    const answer = passkeyAnswerOf()
    const novel = await novelPasskey(answer)
    const wayin = await novel.buildWayin(await PassphraseProving.buildStored(gate, TestPassphrase, provingDeviceOf()))
    const viaStored = await _cheat_bankKeyBytesOf(WorldBankStamp, WorldGateStamp, gate.main, { passphrase: TestPassphrase })
    expect(await _cheat_bankKeyBytesOf(WorldBankStamp, WorldGateStamp, wayin, { prfBytes: answer.prfBytes })).to.deep.equal(viaStored)
  })

  it("mints a different bankKey for each NOVEL wayin of different provings", async () => {
    const { wayin: one } = await novelWithWayin()
    const { wayin: two } = await novelWithWayin()
    const bankKeyBytesOne = await _cheat_bankKeyBytesOf(WorldBankStamp, WorldGateStamp, one, { passphrase: TestPassphrase })
    const bankKeyBytesTwo = await _cheat_bankKeyBytesOf(WorldBankStamp, WorldGateStamp, two, { passphrase: TestPassphrase })
    expect(bankKeyBytesOne).to.not.deep.equal(bankKeyBytesTwo)
  })

  it("binds the wayin to its bank and its gate: under another's stamp it will not open", async () => {
    const { wayin } = await novelWithWayin()
    await expect(_cheat_bankKeyBytesOf({ ...WorldBankStamp, bank_tok: 'bank-tok-other' }, WorldGateStamp, wayin, { passphrase: TestPassphrase })).rejects.toThrow()
    await expect(_cheat_bankKeyBytesOf(WorldBankStamp, { ...WorldGateStamp, gate_tok: 'gate-tok-other' }, wayin, { passphrase: TestPassphrase })).rejects.toThrow()
  })

  const SourceCases = [
    ['NOVEL',                     'the string NOVEL'],
    [Symbol('NOVEL'),             'another symbol named NOVEL'],
    [null,                        'null'],
    [{ wayinkind: 'passphrase' }, 'a plain object shaped like a proving'],
  ] as const

  for (const [source, blurb] of SourceCases) {
    it(`refuses ${blurb}`, async () => {
      const proving = await novelPassphrase()
      await TH.expectRefusal(proving.buildWayin(source as never))
    })
  }

  it("refuses a proving that has made no wayin yet as its source", async () => {
    const proving = await novelPasskey()
    await TH.expectRefusal(proving.buildWayin(await novelPassphrase()))
  })

  const OtherSourceCases = [
    [{ bank: { bank_tok: 'bank-tok-other' } }, 'another life of the bank'],
    [{ gate: { gate_tok: 'gate-tok-other' } }, 'another life of the gate'],
  ] as const

  for (const [moves, blurb] of OtherSourceCases) {
    it(`refuses a source proving of ${blurb}`, async () => {
      const { bank = {}, gate = {} } = moves as { bank?: object, gate?: object }
      const theirs = await PassphraseProving.buildNovel({ ...WorldBankStamp, ...bank }, { ...WorldGateStamp, ...gate }, TestPassphrase, provingDeviceOf())
      await theirs.buildWayin(NOVEL)
      const mine = await novelPassphrase()
      const err = await TH.expectRefusal(mine.buildWayin(theirs))
      expect(err.message).to.eq(Phrases.ProvingOfOtherGate)
    })
  }

  it("refuses a second buildWayin on one proving", async () => {
    const proving = await novelPassphrase()
    await proving.buildWayin(NOVEL)
    await TH.expectRefusal(proving.buildWayin(NOVEL))
    await expectOneBankKey(proving, proving)
  })

  it("refuses buildWayin on a stored proving", async () => {
    const { gate } = await gateWithBoth()
    const proving = await PassphraseProving.buildStored(gate, TestPassphrase, provingDeviceOf())
    await TH.expectRefusal(proving.buildWayin(NOVEL))
  })
})

const StampCases = [
  [{ bank: { user_id: 'u2' }, gate: { user_id: 'u2' } },                     'the stamps of another user'],
  [{ bank: { banklabel: 'acme_other' }, gate: { banklabel: 'acme_other' } }, 'the stamps of another bank'],
  [{ bank: { bank_tok: 'bank-tok-other' } },                                 'the stamp of another life of the bank'],
  [{ bank: { registered_at: T0 + 1 } },                                      'a bank stamp whose registered_at moved'],
  [{ gate: { gate_tok: 'gate-tok-other' } },                                 'the stamp of another life of the gate'],
  [{ gate: { registered_at: T0 + 1 } },                                      'a gate stamp whose registered_at moved'],
] as const

const HeaderCases = [
  [{ device_tok: '00000000-0000-4000-8000-0000000000ee' }, 'a header whose device_tok was swapped'],
  [{ registered_at: T0 + 1 },         'a header whose registered_at moved'],
] as const

describe("the ctx a wayin is wrapped under", () => {
  for (const [altered, blurb] of StampCases) {
    it(`keeps a passphrase wayin shut under ${blurb}`, async () => {
      const { gate } = await builtGateOf()
      const moved = movedGate(gate, altered)
      await TH.expectRefusal(PassphraseProving.buildStored(moved, TestPassphrase, provingDeviceOf()), 'wrong_passphrase')
    })

    it(`keeps a passkey wayin shut under ${blurb}`, async () => {
      const { gate, answerOf } = await gateWithBoth()
      const moved = movedGate(gate, altered)
      await TH.expectRefusal(PasskeyProving.buildStored(moved, answerOf()), 'wrong_passkey')
    })
  }

  for (const [altered, blurb] of HeaderCases) {
    it(`keeps a passphrase wayin shut under ${blurb}`, async () => {
      const { gate } = await builtGateOf()
      const moved = await listedGateOf({ ...gate.pickle(), wayins: { main: { ...gate.wayins.main, ...altered } } })
      await TH.expectRefusal(PassphraseProving.buildStored(moved, TestPassphrase, provingDeviceOf()), 'wrong_passphrase')
    })

    it(`keeps a passkey wayin shut under ${blurb}`, async () => {
      const { gate, answerOf } = await gateWithBoth()
      const moved = await listedGateOf({ ...gate.pickle(), wayins: { ...gate.wayins, passkey0: { ...gate.wayins.passkey0!, ...altered } } })
      await TH.expectRefusal(PasskeyProving.buildStored(moved, answerOf()), 'wrong_passkey')
    })
  }
})

describe("a passkey proving's key", () => {
  it("is HKDF over the PRF bytes, with the wayin's ctx as info", async () => {
    const answer = passkeyAnswerOf()
    const prfBytes = new Uint8Array(answer.prfBytes)
    const proving = await novelPasskey(answer)
    const { bank_key_wayin_wrapped: wrapped } = await proving.buildWayin(NOVEL)
    const ctx = cipherCtx([WorldBankStamp, WorldGateStamp], 'bank_key_passkey_wrapped', proving.header)
    const passkeyKey = await deriveWrappingKey(prfBytes, ctx)
    expect(await unwrapKeyUnder(passkeyKey, wrapped, ctx, CheckUsage)).to.be.instanceOf(CryptoKey)
  })

  it("binds the bank's and the gate's stamps into the key itself, not only into the wrap's ctx", async () => {
    const answer = passkeyAnswerOf()
    const prfBytes = new Uint8Array(answer.prfBytes)
    const proving = await novelPasskey(answer)
    const { bank_key_wayin_wrapped: wrapped } = await proving.buildWayin(NOVEL)
    const ctx = cipherCtx([WorldBankStamp, WorldGateStamp], 'bank_key_passkey_wrapped', proving.header)
    const otherGateInfo = cipherCtx([WorldBankStamp, { ...WorldGateStamp, gate_tok: 'gate-tok-other' }], 'bank_key_passkey_wrapped', proving.header)
    const passkeyKey = await deriveWrappingKey(prfBytes, otherGateInfo)
    await expect(unwrapKeyUnder(passkeyKey, wrapped, ctx, CheckUsage)).rejects.toThrow()
  })
})

describe("proving.buildLease(friend, gate)", () => {
  it("refuses before the proving has made a wayin", async () => {
    const proving = await novelPassphrase()
    await TH.expectRefusal(proving.buildLease(fakeLeaseFriendOf(), WorldGate))
  })

  it("grants an uncached lease that cites the gate, and records the proof time and the wayinkind", async () => {
    const { gate, answerOf } = await gateWithBoth()
    const friend = fakeLeaseFriendOf()
    const proving = await PasskeyProving.buildStored(gate, answerOf())
    const lease = await proving.buildLease(friend, gate)
    expect(lease.toJSON()).to.deep.include({ ...WorldBankStamp, gatelabel: 'main', gate_tok: gate.gate_tok, gate_revision_tok: gate.revision_tok, proved_at: T0, wayinkind: 'passkey' })
    expect(lease.isGranted).to.be.true
    expect(friend.tryCacheLease).not.toHaveBeenCalled()
  })

  it("records the revision of the gate cited", async () => {
    const proving = await novelPassphrase()
    await proving.buildWayin(NOVEL)
    const lease = await proving.buildLease(fakeLeaseFriendOf(), { ...WorldGate, revision_tok: 'gate-revision-tok-5' })
    expect(lease.gate_revision_tok).to.eq('gate-revision-tok-5')
  })

  it("grants leases over one bankKey from both provings", async () => {
    const passphraseProving = await novelPassphrase()
    const passkeyProving = await novelPasskey()
    await passphraseProving.buildWayin(NOVEL)
    await passkeyProving.buildWayin(passphraseProving)
    await expectOneBankKey(passphraseProving, passkeyProving)
  })

  const OtherFriendCases = [
    [{ bank_tok: 'bank-tok-other' },   'another life of the bank'],
    [{ user_id: 'u2' },                "another user's bank"],
    [{ banklabel: 'work' },            'another bank of the same user'],
  ] as const

  for (const [stamp, blurb] of OtherFriendCases) {
    it(`refuses a friend of ${blurb}`, async () => {
      const proving = await novelPassphrase()
      await proving.buildWayin(NOVEL)
      const err = await TH.expectRefusal(proving.buildLease(fakeLeaseFriendOf(stamp), WorldGate))
      expect(err.message).to.eq(Phrases.LeaseOfOtherGate)
    })
  }

  it("refuses to cite another life of the gate proved", async () => {
    const proving = await novelPassphrase()
    await proving.buildWayin(NOVEL)
    const err = await TH.expectRefusal(proving.buildLease(fakeLeaseFriendOf(), { ...WorldGate, gate_tok: 'gate-tok-other' }))
    expect(err.message).to.eq(Phrases.LeaseOfOtherGate)
  })

  it("refuses a friend whose bank_tok, read through its prototype, is another bank's", async () => {
    const proving = await novelPassphrase()
    await proving.buildWayin(NOVEL)
    const { bank_tok: _bank_tok, ...ownFields } = fakeLeaseFriendOf()
    const friend = Object.assign(Object.create({ get bank_tok() { return 'bank-tok-other' } }) as object, ownFields)
    await TH.expectRefusal(proving.buildLease(friend as never, WorldGate))
  })

  it("refuses a gate cited with no revision_tok, or none at all, and a friend with no tryCacheLease", async () => {
    const proving = await novelPassphrase()
    await proving.buildWayin(NOVEL)
    await TH.expectRefusal(proving.buildLease(fakeLeaseFriendOf(), TH.omitting(WorldGate, 'revision_tok')))
    await TH.expectRefusal(proving.buildLease(fakeLeaseFriendOf(), undefined as never))
    await TH.expectRefusal(proving.buildLease({ ...fakeLeaseFriendOf(), tryCacheLease: undefined } as never, WorldGate))
  })
})

describe("what a proving shows", () => {
  it("Object.keys shows its wayinkind and header alone: no key, no wayin, no stamps", async () => {
    const proving = await novelPassphrase()
    await proving.buildWayin(NOVEL)
    expect(Object.keys(proving)).to.deep.equal(['wayinkind', 'header'])
    expect(Object.keys(await novelPasskey())).to.deep.equal(['wayinkind', 'header'])
  })

  it("JSON.stringify gives its wayinkind alone", async () => {
    expect(JSON.stringify(await novelPassphrase())).to.eq('{"wayinkind":"passphrase"}')
    expect(JSON.stringify(await novelPasskey())).to.eq('{"wayinkind":"passkey"}')
  })

  it("is frozen", async () => {
    const proving = await novelPassphrase()
    expect(Object.isFrozen(proving)).to.be.true
    expect(() => { (proving as { wayinkind: string }).wayinkind = 'passkey' }).to.throw(TypeError)
  })
})
