import { describe, expect, it, type Mock, vi } from 'vitest'
import { PasskeySaltBytes } from '../../src/helpers/consts'
import { fromB64, randomBytes, toB64 } from '../../src/helpers/crypto'
import type { KeyDeriver } from '../../src/deriver/basederiver'
import { Gate } from '../../src/models/gate'
import { vaultScope } from '../../src/shapes/shapes-core'
import { type ProvingWorld, FirstGateEpoch, type PasskeyAnswer, passphraseCleartext } from '../../src/shapes/shapes-gateish'
import { NOVEL, PasskeyProving, PassphraseProving, Proving } from '../../src/models/proving'
import { Wayin } from '../../src/models/wayin'
import * as TH from '../test-helpers'
import { _cheat_vaultKeyBytesOf, builtGateOf, DeviceId, fakeLeaseFriendOf, isZeroed, passkeyAnswerOf, provingWorldOf, sealStampOf, T0, TestPassphrase, useFakeClock, WorldStamp } from '../test-helpers/proving-world'

useFakeClock()

const WorldScope = vaultScope.parse(WorldStamp)

/** A key deriver scripted to hand back anything at all, to try what a proving makes of it. */
const deriverHanding = (handBack: () => unknown): KeyDeriver => ({
  key_deriver_label: 'test_scripted_v0',
  salt_bytes:        16,
  deriveKeyBytes:    () => Promise.resolve(handBack() as Uint8Array),
})

const novelPassphrase = (world: ProvingWorld = provingWorldOf()): Promise<PassphraseProving> => (
  PassphraseProving.buildNovel(WorldStamp, TestPassphrase, world)
)

const novelOverHanded = (handBack: () => unknown): Promise<PassphraseProving> => novelPassphrase(provingWorldOf({ keyDeriver: deriverHanding(handBack) }))

/** A passphrase proving that holds a wayin under a new vaultKey, beside that wayin. */
const novelWithWayin = async (): Promise<{ proving: PassphraseProving, wayin: Wayin }> => {
  const proving = await novelPassphrase()
  return { proving, wayin: await proving.buildWayin(NOVEL) }
}

const novelPasskey = (answer = passkeyAnswerOf(), world: ProvingWorld = provingWorldOf()): Promise<PasskeyProving> => (
  PasskeyProving.buildNovel(WorldStamp, answer, world)
)

/** A gate with both wayins, beside a fresh copy of the answer that opens its passkey's: the gate's build spent the one it was handed. */
const gateWithBoth = async (epochs = 0): Promise<{ gate: Gate, answerOf: () => PasskeyAnswer }> => {
  const answer = passkeyAnswerOf()
  const { credential_id, prf_salt_b64 } = answer
  const prfBytes = new Uint8Array(answer.prfBytes)
  const { gate } = await builtGateOf(answer)
  const answerOf = (): PasskeyAnswer => ({ credential_id, prf_salt_b64, prfBytes: new Uint8Array(prfBytes) })
  return { gate: epochs === 0 ? gate : new Gate(WorldStamp, { ...gate.pickle(), gate_epoch: FirstGateEpoch + epochs }), answerOf }
}

const findsWeak = () => ({ strong: false as const, reason: 'too short' })

const findsStrongAsync = () => Promise.resolve({ strong: true as const })

/** Whether `one`'s lease opens what `other`'s seals: whether both hold one vaultKey. */
const expectOneVaultKey = async (one: Proving, other: Proving): Promise<void> => {
  const friend = fakeLeaseFriendOf()
  const stamp = sealStampOf('b1')
  const sealer = await one.buildLease(friend)
  const opener = await other.buildLease(friend)
  const sealed = await sealer.sealWith('{"val":"sk-test-5678"}', stamp)
  expect(await opener.unsealWith(sealed, stamp)).to.eq('{"val":"sk-test-5678"}')
}

/** A checker whose answer throws the passphrase it heard, when its verdict is read. */
const answersThrowingGetter = (passphrase: string) => ({ get strong(): true { throw new Error(passphrase) } })

describe("Proving.checkStrength(passphraseClear, scope, world)", () => {
  it("answers the strengthChecker's verdict, hearing the passphrase and the scope", async () => {
    const strengthChecker = vi.fn(() => ({ strong: false as const, reason: 'too short' }))
    const verdict = await Proving.checkStrength(TestPassphrase, WorldScope, provingWorldOf({ strengthChecker }))
    expect(verdict).to.deep.equal({ strong: false, reason: 'too short' })
    expect(strengthChecker).toHaveBeenCalledWith(TestPassphrase, WorldScope)
  })

  it("awaits a checker that answers a promise", async () => {
    expect(await Proving.checkStrength(TestPassphrase, WorldScope, provingWorldOf({ strengthChecker: findsStrongAsync }))).to.deep.equal({ strong: true })
  })

  it("replaces a throw from a getter on what the checker answered with 'unexpected_error': the passphrase it quotes appears nowhere in the refusal (G8)", async () => {
    const err = await TH.expectRefusal(Proving.checkStrength(TestPassphrase, WorldScope, provingWorldOf({ strengthChecker: answersThrowingGetter })), 'unexpected_error')
    expect(err.cause).to.be.undefined
    expect(TH.thrownText(err)).to.not.include(TestPassphrase)
  })

  it("replaces what a throwing checker threw with 'unexpected_error', quoting none of it and keeping no cause", async () => {
    const strengthChecker = () => { throw new Error(`weak: ${TestPassphrase}`) }
    const err = await TH.expectRefusal(Proving.checkStrength(TestPassphrase, WorldScope, provingWorldOf({ strengthChecker })), 'unexpected_error')
    expect(err.cause).to.be.undefined
    expect(TH.thrownText(err)).to.not.include(TestPassphrase)
  })

  it("refuses an answer that is no verdict as 'bad_option'", async () => {
    const strengthChecker = (() => 'looks fine') as never
    await TH.expectRefusal(Proving.checkStrength(TestPassphrase, WorldScope, provingWorldOf({ strengthChecker })), 'bad_option')
  })

  it("finds a blank passphrase weak before the checker hears it", async () => {
    const strengthChecker = vi.fn(() => ({ strong: true as const }))
    const verdict = await Proving.checkStrength(passphraseCleartext.parse(' '.repeat(3)), WorldScope, provingWorldOf({ strengthChecker }))
    expect(verdict).to.have.property('strong', false)
    expect(strengthChecker).not.toHaveBeenCalled()
  })

  it("refuses a passphrase that is no string as 'bad_option', before the checker hears it", async () => {
    const strengthChecker = vi.fn(() => ({ strong: true as const }))
    await TH.expectRefusal(Proving.checkStrength(42 as never, WorldScope, provingWorldOf({ strengthChecker })), 'bad_option')
    expect(strengthChecker).not.toHaveBeenCalled()
  })
})

describe("PassphraseProving.buildNovel(stamp, passphraseClear, world)", () => {
  const ArgsCases = [
    [() => ({ world: TH.omitting(provingWorldOf(), 'keyDeriver') }),      'a world with no keyDeriver'],
    [() => ({ world: TH.omitting(provingWorldOf(), 'clock') }),           'a world with no clock'],
    [() => ({ world: TH.omitting(provingWorldOf(), 'device_id') }),       'a world with no device_id'],
    [() => ({ world: TH.omitting(provingWorldOf(), 'strengthChecker') }), 'a world with no strengthChecker'],
    [() => ({ world: provingWorldOf({ device_id: '' }) }),                'a world with an empty device_id'],
    [() => ({ stamp: { ...WorldStamp, vault_tok: undefined } }),          'a stamp with no vault_tok'],
    [() => ({ stamp: { ...WorldStamp, registered_at: 'yesterday' } }),    'a stamp registered at a time that is no epoch millis'],
    [() => ({ stamp: null }),                                             'no stamp at all'],
    [() => ({ passphraseClear: 42 }),                                     'a passphrase that is no string'],
  ] as const

  for (const [argsOf, blurb] of ArgsCases) {
    it(`refuses ${blurb} as 'bad_option'`, async () => {
      const { stamp = WorldStamp, passphraseClear = TestPassphrase, world = provingWorldOf() } = argsOf() as Record<string, unknown>
      await TH.expectRefusal(PassphraseProving.buildNovel(stamp as never, passphraseClear as never, world as ProvingWorld), 'bad_option')
    })
  }

  it("refuses a passphrase the world's strengthChecker finds weak as 'weak_passphrase', with its reason, before the keyDeriver is asked", async () => {
    const deriveKeyBytes = vi.fn((passphrase: string, saltBytes: Uint8Array) => TH.testDeriver.deriveKeyBytes(passphrase, saltBytes))
    const err = await TH.expectRefusal(novelPassphrase(provingWorldOf({ strengthChecker: findsWeak, keyDeriver: { ...TH.testDeriver, deriveKeyBytes } })), 'weak_passphrase')
    expect(err.message).to.include('too short')
    expect(deriveKeyBytes).not.toHaveBeenCalled()
  })

  it("is of the first gate's epoch, its stamp the one handed", async () => {
    const proving = await novelPassphrase()
    expect(proving.gate_epoch).to.eq(FirstGateEpoch)
    expect(proving.stamp).to.deep.equal(WorldStamp)
  })

  it("hands the keyDeriver the passphrase and a fresh salt of its salt_bytes, the salt the header carries", async () => {
    const deriveKeyBytes: Mock<KeyDeriver['deriveKeyBytes']> = vi.fn((passphrase: string, saltBytes: Uint8Array) => TH.testDeriver.deriveKeyBytes(passphrase, saltBytes))
    const proving = await novelPassphrase(provingWorldOf({ keyDeriver: { ...TH.testDeriver, deriveKeyBytes } }))
    expect(deriveKeyBytes).toHaveBeenCalledTimes(1)
    const [passphrase, saltBytes] = deriveKeyBytes.mock.calls[0]!
    expect(passphrase).to.eq(TestPassphrase)
    expect(saltBytes).to.deep.equal(fromB64(proving.header.salt_b64))
    expect(saltBytes.length).to.eq(TH.testDeriver.salt_bytes)
  })

  it("zeroes the key bytes the keyDeriver handed back, once imported", async () => {
    const handed = randomBytes(32)
    await novelOverHanded(() => handed)
    expect(isZeroed(handed)).to.be.true
  })

  it("replaces what a throwing keyDeriver threw with 'unexpected_error', quoting none of it and keeping no cause", async () => {
    const keyDeriver = deriverHanding(() => { throw new Error(`cannot derive ${TestPassphrase}`) })
    const err = await TH.expectRefusal(novelPassphrase(provingWorldOf({ keyDeriver })), 'unexpected_error')
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
    it(`refuses ${blurb} as 'bad_option'`, async () => {
      await TH.expectRefusal(novelOverHanded(handBack), 'bad_option')
    })
  }

  it("zeroes key bytes of the wrong length it refuses", async () => {
    const short = randomBytes(31)
    const long = randomBytes(33)
    await TH.expectRefusal(novelOverHanded(() => short), 'bad_option')
    await TH.expectRefusal(novelOverHanded(() => long), 'bad_option')
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

describe("PasskeyProving.buildNovel(stamp, passkeyClear, world)", () => {
  it("is of the first gate's epoch, and leaves the answer unspent: spending it is the caller's", async () => {
    const answer = passkeyAnswerOf()
    const proving = await novelPasskey(answer)
    expect(proving.gate_epoch).to.eq(FirstGateEpoch)
    expect(isZeroed(answer.prfBytes)).to.be.false
  })

  const AnswerCases = [
    [() => passkeyAnswerOf({ prfBytes: new Uint8Array(32) }),                                  'a spent answer, its PRF bytes all zero (G2)'],
    [() => passkeyAnswerOf({ prfBytes: randomBytes(31) }),                                     'PRF bytes one short'],
    [() => passkeyAnswerOf({ prf_salt_b64: toB64(randomBytes(PasskeySaltBytes - 1)) }),        'a salt one byte short, as freshPasskeyAnswer shows'],
    [() => TH.omitting(passkeyAnswerOf(), 'credential_id'),                                    'an answer with no credential_id'],
  ] as const

  for (const [answerOf, blurb] of AnswerCases) {
    it(`refuses ${blurb} as 'bad_option'`, async () => {
      await TH.expectRefusal(novelPasskey(answerOf()), 'bad_option')
    })
  }

  it("refuses a world its check refuses as 'bad_option', and leaves the answer unspent", async () => {
    const answer = passkeyAnswerOf()
    const world = TH.omitting(provingWorldOf(), 'device_id')
    await TH.expectRefusal(novelPasskey(answer, world), 'bad_option')
    expect(isZeroed(answer.prfBytes)).to.be.false
  })
})

describe("PassphraseProving.buildStored(gate, passphraseClear, world)", () => {
  it("proves the gate's passphrase wayin: its stamp and epoch the gate's, its header the wayin's, and it holds the gate's vaultKey", async () => {
    const { gate, answerOf } = await gateWithBoth(2)
    const proving = await PassphraseProving.buildStored(gate, TestPassphrase, provingWorldOf())
    expect(proving.stamp).to.deep.equal(WorldStamp)
    expect(proving.gate_epoch).to.eq(gate.gate_epoch)
    expect(proving.header).to.deep.equal(gate.ppWayin.toJSON())
    await expectOneVaultKey(proving, await PasskeyProving.buildStored(gate, answerOf()))
  })

  it("takes a record's gate as readily as a Gate: its props beside the stamp", async () => {
    const { gate } = await gateWithBoth()
    const proving = await PassphraseProving.buildStored({ stamp: WorldStamp, ...gate.pickle() }, TestPassphrase, provingWorldOf())
    expect(proving).to.be.instanceOf(PassphraseProving)
  })

  it("refuses a passphrase that does not open it as 'wrong_passphrase', quoting none of it", async () => {
    const { gate } = await gateWithBoth()
    const misremembered = passphraseCleartext.parse(`${TestPassphrase}, misremembered`)
    const err = await TH.expectRefusal(PassphraseProving.buildStored(gate, misremembered, provingWorldOf()), 'wrong_passphrase')
    expect(TH.thrownText(err)).to.not.include(misremembered)
  })

  it("refuses a wayin made under another key deriver as 'unknown_key_deriver', before the world's is asked", async () => {
    const { gate } = await gateWithBoth()
    const deriveKeyBytes = vi.fn(() => Promise.resolve(randomBytes(32)))
    const keyDeriver: KeyDeriver = { key_deriver_label: 'test_other_v0', salt_bytes: 16, deriveKeyBytes }
    await TH.expectRefusal(PassphraseProving.buildStored(gate, TestPassphrase, provingWorldOf({ keyDeriver })), 'unknown_key_deriver')
    expect(deriveKeyBytes).not.toHaveBeenCalled()
  })

  it("does not ask the strengthChecker: a passphrase already in use is proved, not judged", async () => {
    const { gate } = await gateWithBoth()
    const strengthChecker = vi.fn(() => ({ strong: false as const, reason: 'too short' }))
    await PassphraseProving.buildStored(gate, TestPassphrase, provingWorldOf({ strengthChecker }))
    expect(strengthChecker).not.toHaveBeenCalled()
  })

  const ArgsCases = [
    [() => ({ gate: null }),                  'no gate'],
    [() => ({ passphraseClear: 42 }),         'a passphrase that is no string'],
    [() => ({ world: {} }),                   'a world its check refuses'],
  ] as const

  for (const [argsOf, blurb] of ArgsCases) {
    it(`refuses ${blurb} as 'bad_option'`, async () => {
      const { gate } = await gateWithBoth()
      const { gate: handed = gate, passphraseClear = TestPassphrase, world = provingWorldOf() } = argsOf() as Record<string, unknown>
      await TH.expectRefusal(PassphraseProving.buildStored(handed as never, passphraseClear as never, world as never), 'bad_option')
    })
  }
})

describe("PasskeyProving.buildStored(gate, passkeyClear)", () => {
  it("proves the gate's passkey wayin, its epoch the gate's, and leaves the answer unspent: spending it is the caller's", async () => {
    const { gate, answerOf } = await gateWithBoth(1)
    const answer = answerOf()
    const proving = await PasskeyProving.buildStored(gate, answer)
    expect(proving.gate_epoch).to.eq(gate.gate_epoch)
    expect(proving.header).to.deep.equal(gate.pkWayin!.toJSON())
    expect(isZeroed(answer.prfBytes)).to.be.false
  })

  it("refuses a gate with no passkey wayin as 'absent_wayin', the answer unspent", async () => {
    const { gate } = await builtGateOf()
    const answer = passkeyAnswerOf()
    await TH.expectRefusal(PasskeyProving.buildStored(gate, answer), 'absent_wayin')
    expect(isZeroed(answer.prfBytes)).to.be.false
  })

  const WrongAnswerCases = [
    [{ credential_id: 'cred-test-other' },                       'of another credential'],
    [{ prf_salt_b64: toB64(randomBytes(PasskeySaltBytes)) },     'of another salt'],
    [{ prfBytes: randomBytes(32) },                              'whose PRF bytes do not open the wayin'],
  ] as const

  for (const [overrides, blurb] of WrongAnswerCases) {
    it(`refuses an answer ${blurb} as 'wrong_passkey', unspent`, async () => {
      const { gate, answerOf } = await gateWithBoth()
      const answer = { ...answerOf(), ...overrides }
      await TH.expectRefusal(PasskeyProving.buildStored(gate, answer), 'wrong_passkey')
      expect(isZeroed(answer.prfBytes)).to.be.false
    })
  }

  it("refuses an answer already spent as 'bad_option' (G2)", async () => {
    const { gate, answerOf } = await gateWithBoth()
    await TH.expectRefusal(PasskeyProving.buildStored(gate, { ...answerOf(), prfBytes: new Uint8Array(32) }), 'bad_option')
  })
})

describe("a proving's header", () => {
  it("of a passphrase proving: the deriver's label, a fresh salt, the world's device_id, and registered_at from the world's clock", async () => {
    const { header } = await novelPassphrase(provingWorldOf({ clock: { now: () => T0 + 5 } }))
    expect(header).to.deep.include({ wayinkind: 'passphrase', key_deriver_label: 'test_digest_v0', device_id: DeviceId, registered_at: T0 + 5 })
    expect(Object.keys(header)).to.have.members(['wayinkind', 'key_deriver_label', 'salt_b64', 'device_id', 'registered_at'])
    expect(fromB64(header.salt_b64).length).to.eq(TH.testDeriver.salt_bytes)
    expect(Object.isFrozen(header)).to.be.true
  })

  it("of a passkey proving: the answer's credential_id and salt, the world's device_id, and registered_at", async () => {
    const answer = passkeyAnswerOf()
    const { credential_id, prf_salt_b64 } = answer
    const { header } = await novelPasskey(answer)
    expect(header).to.deep.equal({ wayinkind: 'passkey', credential_id, prf_salt_b64, device_id: DeviceId, registered_at: T0 })
  })

  it("draws a fresh salt for each passphrase proving", async () => {
    const one = await novelPassphrase()
    const two = await novelPassphrase()
    expect(one.header.salt_b64).to.not.eq(two.header.salt_b64)
  })
})

describe("proving.buildWayin(source)", () => {
  it("from NOVEL wraps a new vaultKey under the proving's key: a wayin of its header that opens with the passphrase", async () => {
    const { proving, wayin } = await novelWithWayin()
    expect(wayin).to.be.instanceOf(Wayin)
    expect(wayin.toJSON()).to.deep.equal(proving.header)
    const vaultKeyBytes = await _cheat_vaultKeyBytesOf(WorldStamp, wayin, { passphrase: TestPassphrase })
    expect(vaultKeyBytes.length).to.eq(32)
  })

  it("from NOVEL makes a wayin that another passphrase does not open", async () => {
    const { wayin } = await novelWithWayin()
    await expect(_cheat_vaultKeyBytesOf(WorldStamp, wayin, { passphrase: `${TestPassphrase}, misremembered` })).rejects.toThrow()
  })

  it("from another proving wraps that proving's vaultKey: the passphrase and passkey wayins open to the same vaultKey", async () => {
    const answer = passkeyAnswerOf()
    const passphraseProving = await novelPassphrase()
    const passkeyProving = await novelPasskey(answer)
    const passphraseWayin = await passphraseProving.buildWayin(NOVEL)
    const passkeyWayin = await passkeyProving.buildWayin(passphraseProving)
    expect(passkeyWayin.toJSON()).to.deep.equal(passkeyProving.header)
    const viaPassphrase = await _cheat_vaultKeyBytesOf(WorldStamp, passphraseWayin, { passphrase: TestPassphrase })
    const viaPasskey = await _cheat_vaultKeyBytesOf(WorldStamp, passkeyWayin, { prfBytes: answer.prfBytes })
    expect(viaPasskey).to.deep.equal(viaPassphrase)
  })

  it("from a stored proving wraps the vaultKey of the gate proved", async () => {
    const { gate } = await gateWithBoth()
    const answer = passkeyAnswerOf()
    const novel = await novelPasskey(answer)
    const wayin = await novel.buildWayin(await PassphraseProving.buildStored(gate, TestPassphrase, provingWorldOf()))
    const viaStored = await _cheat_vaultKeyBytesOf(WorldStamp, gate.ppWayin, { passphrase: TestPassphrase })
    expect(await _cheat_vaultKeyBytesOf(WorldStamp, wayin, { prfBytes: answer.prfBytes })).to.deep.equal(viaStored)
  })

  it("mints a different vaultKey for each NOVEL wayin of different provings", async () => {
    const { wayin: one } = await novelWithWayin()
    const { wayin: two } = await novelWithWayin()
    const vaultKeyBytesOne = await _cheat_vaultKeyBytesOf(WorldStamp, one, { passphrase: TestPassphrase })
    const vaultKeyBytesTwo = await _cheat_vaultKeyBytesOf(WorldStamp, two, { passphrase: TestPassphrase })
    expect(vaultKeyBytesOne).to.not.deep.equal(vaultKeyBytesTwo)
  })

  it("binds the wayin to its vault: under another vault's stamp it will not open", async () => {
    const { wayin } = await novelWithWayin()
    await expect(_cheat_vaultKeyBytesOf({ ...WorldStamp, vault_tok: 'vault-tok-other' }, wayin, { passphrase: TestPassphrase })).rejects.toThrow()
  })

  const SourceCases = [
    ['NOVEL',                     'the string NOVEL'],
    [Symbol('NOVEL'),             'another symbol named NOVEL'],
    [null,                        'null'],
    [{ wayinkind: 'passphrase' }, 'a plain object shaped like a proving'],
  ] as const

  for (const [source, blurb] of SourceCases) {
    it(`refuses ${blurb} as 'bad_option'`, async () => {
      const proving = await novelPassphrase()
      await TH.expectRefusal(proving.buildWayin(source as never), 'bad_option')
    })
  }

  it("refuses, as 'unexpected_error', a proving that has made no wayin yet as its source", async () => {
    const proving = await novelPasskey()
    await TH.expectRefusal(proving.buildWayin(await novelPassphrase()), 'unexpected_error')
  })

  it("refuses a proving of another vault as its source, as 'bad_option': a wayin wraps only its own vault's vaultKey", async () => {
    const theirs = await PassphraseProving.buildNovel({ ...WorldStamp, vault_tok: 'vault-tok-other' }, TestPassphrase, provingWorldOf())
    await theirs.buildWayin(NOVEL)
    const mine = await novelPassphrase()
    await TH.expectRefusal(mine.buildWayin(theirs), 'bad_option')
  })

  it("refuses a second buildWayin on one proving as 'unexpected_error', so its leases stay under the one vaultKey its first wayin wraps", async () => {
    const proving = await novelPassphrase()
    await proving.buildWayin(NOVEL)
    await TH.expectRefusal(proving.buildWayin(NOVEL), 'unexpected_error')
    await expectOneVaultKey(proving, proving)
  })

  it("refuses a buildWayin on a stored proving as 'unexpected_error': it holds its wayin from birth", async () => {
    const { gate } = await gateWithBoth()
    const proving = await PassphraseProving.buildStored(gate, TestPassphrase, provingWorldOf())
    await TH.expectRefusal(proving.buildWayin(NOVEL), 'unexpected_error')
  })
})

describe("proving.buildLease(friend, gate_epoch?)", () => {
  it("refuses, as 'unexpected_error', before the proving has made a wayin", async () => {
    const proving = await novelPassphrase()
    await TH.expectRefusal(proving.buildLease(fakeLeaseFriendOf()), 'unexpected_error')
  })

  it("grants a lease of the proving's vault, uncached, recording the proving's epoch, when it was proved, and how", async () => {
    const { gate, answerOf } = await gateWithBoth(2)
    const friend = fakeLeaseFriendOf()
    const proving = await PasskeyProving.buildStored(gate, answerOf())
    const lease = await proving.buildLease(friend)
    expect(lease.toJSON()).to.deep.include({ ...WorldStamp, gate_epoch: gate.gate_epoch, proved_at: T0, wayinkind: 'passkey' })
    expect(lease.isInForce).to.be.true
    expect(friend.tryCacheLease).not.toHaveBeenCalled()
  })

  it("records the epoch passed, for the gate a change lands", async () => {
    const proving = await novelPassphrase()
    await proving.buildWayin(NOVEL)
    const lease = await proving.buildLease(fakeLeaseFriendOf(), 5)
    expect(lease.gate_epoch).to.eq(5)
  })

  it("grants leases over one vaultKey from both provings once both made wayins: what one seals, the other opens", async () => {
    const passphraseProving = await novelPassphrase()
    const passkeyProving = await novelPasskey()
    await passphraseProving.buildWayin(NOVEL)
    await passkeyProving.buildWayin(passphraseProving)
    await expectOneVaultKey(passphraseProving, passkeyProving)
  })

  const OtherFriendCases = [
    [{ vault_tok: 'vault-tok-other' }, 'another life of the vault'],
    [{ user_id: 'u2' },                "another user's vault"],
    [{ vaultlabel: 'work' },           'another vault of the same user'],
  ] as const

  for (const [stamp, blurb] of OtherFriendCases) {
    it(`refuses a friend of ${blurb} as 'bad_option'`, async () => {
      const proving = await novelPassphrase()
      await proving.buildWayin(NOVEL)
      await TH.expectRefusal(proving.buildLease(fakeLeaseFriendOf(stamp)), 'bad_option')
    })
  }

  it("refuses a gate_epoch its check refuses, and a friend with no tryCacheLease, as 'bad_option'", async () => {
    const proving = await novelPassphrase()
    await proving.buildWayin(NOVEL)
    await TH.expectRefusal(proving.buildLease(fakeLeaseFriendOf(), 0), 'bad_option')
    await TH.expectRefusal(proving.buildLease({ ...fakeLeaseFriendOf(), tryCacheLease: undefined } as never), 'bad_option')
  })
})

describe("what a proving shows", () => {
  it("Object.keys shows its wayinkind and header alone: no key, no wayin, no stamp, no epoch", async () => {
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
